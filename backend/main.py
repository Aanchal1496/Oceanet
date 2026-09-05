"""main.py — FastAPI backend for ocean data visualization.

Endpoints:
  GET /health                       — health check
  GET /api/dates                    — list available dates
  GET /api/depths?day=1             — list available depths for a day
  GET /api/grid?variable=temperature&depth=0&day=1
                                    — grid points for rendering the 3D surface
  GET /api/floats?day=1             — all float records for a day (grouped by float)
  GET /api/floats/{float_id}/history — full model-vs-observed series for one float

All reads come from SQLite (ocean.db). Run preload_cache.py to populate it.
"""

import json
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

DB_PATH = Path(__file__).resolve().parent / "ocean.db"


# ── Lifespan: ensure DB exists on startup ──────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    if not DB_PATH.exists():
        print("DB not found — running preload_cache...")
        from backend.preload_cache import preload
        preload()
    yield


app = FastAPI(title="Ocean Viz API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── DB helper ──────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "db_exists": DB_PATH.exists()}


@app.get("/api/dates")
def get_dates():
    """List all available dates."""
    conn = get_db()
    rows = conn.execute("SELECT DISTINCT value FROM metadata WHERE key = 'date'").fetchall()
    conn.close()
    if not rows:
        raise HTTPException(status_code=404, detail="No data in cache. Run preload_cache.py.")
    return {"dates": [r["value"] for r in rows]}


@app.get("/api/depths")
def get_depths(day: int = Query(1, ge=1)):
    """List available depths for a given day index (1-based)."""
    conn = get_db()

    # Resolve date from day index
    dates = [r["value"] for r in conn.execute(
        "SELECT value FROM metadata WHERE key = 'date' ORDER BY value"
    ).fetchall()]
    if not dates:
        conn.close()
        raise HTTPException(status_code=404, detail="No data in cache.")
    if day < 1 or day > len(dates):
        conn.close()
        raise HTTPException(status_code=400, detail=f"day must be 1–{len(dates)}")

    date_str = dates[day - 1]
    depths_row = conn.execute(
        "SELECT value FROM metadata WHERE key = 'depths'"
    ).fetchone()
    conn.close()

    depths = json.loads(depths_row["value"]) if depths_row else []
    return {
        "day": day,
        "date": date_str,
        "depths": [
            {"depth_index": i, "depth_m": d}
            for i, d in enumerate(depths)
        ],
    }


@app.get("/api/grid")
def get_grid(
    variable: str = Query("temperature", description="Variable name (temperature or salinity)"),
    depth: int = Query(0, ge=0, description="Depth index (0-based) or actual depth in meters"),
    day: int = Query(1, ge=1, description="Day index (1-based)"),
):
    """Return grid points for the 3D surface.

    Parameters:
      variable  — currently only 'temperature' is supported
      depth     — depth index (0-based) into available depths list
      day       — day index (1-based) into available dates list

    Returns: [{lat, lon, depth, value}] where value is in Celsius.
    """
    conn = get_db()

    # Resolve date
    dates = [r["value"] for r in conn.execute(
        "SELECT value FROM metadata WHERE key = 'date' ORDER BY value"
    ).fetchall()]
    if not dates:
        conn.close()
        raise HTTPException(status_code=404, detail="No data in cache.")
    if day < 1 or day > len(dates):
        conn.close()
        raise HTTPException(status_code=400, detail=f"day must be 1–{len(dates)}")
    date_str = dates[day - 1]

    # Resolve depth
    depths_row = conn.execute(
        "SELECT value FROM metadata WHERE key = 'depths'"
    ).fetchone()
    depths = json.loads(depths_row["value"]) if depths_row else []
    if not depths:
        conn.close()
        raise HTTPException(status_code=404, detail="No depths in cache.")
    if depth >= len(depths):
        conn.close()
        raise HTTPException(status_code=400, detail=f"depth must be 0–{len(depths) - 1}")
    depth_m = depths[depth]

    # Query grid
    rows = conn.execute(
        "SELECT lat, lon, depth_m, value_celsius FROM grid WHERE date = ? AND depth_m = ?",
        (date_str, depth_m),
    ).fetchall()
    conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail=f"No grid data for day={day}, depth={depth}")

    return [
        {"lat": r["lat"], "lon": r["lon"], "depth": r["depth_m"], "value": r["value_celsius"]}
        for r in rows
    ]


@app.get("/api/floats")
def get_floats(day: int = Query(1, ge=1)):
    """Return all float records for a given day, grouped by float.

    Each float entry includes its latest position and a summary of
    observed vs model temperatures across all depths.
    """
    conn = get_db()

    # Resolve date
    dates = [r["value"] for r in conn.execute(
        "SELECT value FROM metadata WHERE key = 'date' ORDER BY value"
    ).fetchall()]
    if not dates:
        conn.close()
        raise HTTPException(status_code=404, detail="No data in cache.")
    if day < 1 or day > len(dates):
        conn.close()
        raise HTTPException(status_code=400, detail=f"day must be 1–{len(dates)}")
    date_str = dates[day - 1]

    # Get float observations for this date
    rows = conn.execute(
        """SELECT float_id, depth_m, pressure_dbar, temperature, model_temp, delta,
                  nearest_grid_lat, nearest_grid_lon, distance_km, timestamp
           FROM float_obs WHERE date = ?
           ORDER BY float_id, depth_m, pressure_dbar""",
        (date_str,),
    ).fetchall()
    conn.close()

    # Group by float_id
    floats = {}
    for r in rows:
        fid = r["float_id"]
        if fid not in floats:
            # Find float metadata
            float_meta = _get_float_meta(fid)
            floats[fid] = {
                "id": fid,
                "lat": float_meta["lat"] if float_meta else r["nearest_grid_lat"],
                "lon": float_meta["lon"] if float_meta else r["nearest_grid_lon"],
                "first_seen": float_meta["first_seen"] if float_meta else r["timestamp"],
                "last_seen": float_meta["last_seen"] if float_meta else r["timestamp"],
                "observations": [],
            }
        floats[fid]["observations"].append({
            "depth_m": r["depth_m"],
            "pressure_dbar": r["pressure_dbar"],
            "temperature": r["temperature"],
            "model_temp": r["model_temp"],
            "delta": r["delta"],
            "nearest_grid_lat": r["nearest_grid_lat"],
            "nearest_grid_lon": r["nearest_grid_lon"],
            "distance_km": r["distance_km"],
            "timestamp": r["timestamp"],
        })

    return {
        "day": day,
        "date": date_str,
        "float_count": len(floats),
        "floats": list(floats.values()),
    }


@app.get("/api/floats/{float_id}/history")
def get_float_history(float_id: str):
    """Return the full model-vs-observed time series for one float.

    Includes all depth records, suitable for a comparison chart.
    """
    conn = get_db()

    # Float metadata
    meta = conn.execute(
        "SELECT * FROM floats WHERE id = ?", (float_id,)
    ).fetchone()
    if not meta:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Float '{float_id}' not found.")

    # All observations for this float
    rows = conn.execute(
        """SELECT date, depth_m, pressure_dbar, temperature, model_temp, delta,
                  nearest_grid_lat, nearest_grid_lon, distance_km, timestamp
           FROM float_obs WHERE float_id = ?
           ORDER BY date, depth_m, pressure_dbar""",
        (float_id,),
    ).fetchall()
    conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail=f"No observations for float '{float_id}'.")

    return {
        "id": float_id,
        "lat": meta["lat"],
        "lon": meta["lon"],
        "first_seen": meta["first_seen"],
        "last_seen": meta["last_seen"],
        "record_count": meta["record_count"],
        "observations": [
            {
                "date": r["date"],
                "depth_m": r["depth_m"],
                "pressure_dbar": r["pressure_dbar"],
                "temperature": r["temperature"],
                "model_temp": r["model_temp"],
                "delta": r["delta"],
                "nearest_grid_lat": r["nearest_grid_lat"],
                "nearest_grid_lon": r["nearest_grid_lon"],
                "distance_km": r["distance_km"],
                "timestamp": r["timestamp"],
            }
            for r in rows
        ],
    }


# ── Helper ─────────────────────────────────────────────────────────────────
def _get_float_meta(float_id: str) -> dict | None:
    conn = get_db()
    row = conn.execute("SELECT * FROM floats WHERE id = ?", (float_id,)).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None
