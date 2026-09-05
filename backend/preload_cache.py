"""preload_cache.py — Load processed JSON files into SQLite for fast API reads.

Run once before starting the server:
    python -m backend.preload_cache

Or auto-run on server startup if the DB is missing.

Tables:
  grid(date, depth_m, lat, lon, value_celsius)
  floats(id, lat, lon, first_seen, last_seen, record_count)
  float_obs(float_id, date, depth_m, pressure_dbar, temperature,
            model_temp, delta, nearest_grid_lat, nearest_grid_lon, distance_km, timestamp)
  metadata(key, value)  — stores available dates, depths, grid_size, etc.
"""

import json
import sqlite3
from pathlib import Path

PROCESSED_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"
DB_PATH = Path(__file__).resolve().parent / "ocean.db"


def create_tables(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS grid (
            date TEXT NOT NULL,
            depth_m REAL NOT NULL,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            value_celsius REAL NOT NULL,
            PRIMARY KEY (date, depth_m, lat, lon)
        );

        CREATE TABLE IF NOT EXISTS floats (
            id TEXT PRIMARY KEY,
            lat REAL,
            lon REAL,
            first_seen TEXT,
            last_seen TEXT,
            record_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS float_obs (
            float_id TEXT NOT NULL,
            date TEXT NOT NULL,
            depth_m REAL NOT NULL,
            pressure_dbar REAL,
            temperature REAL,
            model_temp REAL,
            delta REAL,
            nearest_grid_lat REAL,
            nearest_grid_lon REAL,
            distance_km REAL,
            timestamp TEXT,
            PRIMARY KEY (float_id, date, depth_m, pressure_dbar)
        );

        CREATE INDEX IF NOT EXISTS idx_grid_lookup ON grid(date, depth_m);
        CREATE INDEX IF NOT EXISTS idx_float_obs_float ON float_obs(float_id);
        CREATE INDEX IF NOT EXISTS idx_float_obs_date ON float_obs(date);
    """)


def load_summary(conn: sqlite3.Connection) -> dict | None:
    summaries = sorted(PROCESSED_DIR.glob("summary_*.json"))
    if not summaries:
        return None
    with open(summaries[-1]) as f:
        return json.load(f)


def preload():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    create_tables(conn)

    summary = load_summary(conn)
    if not summary:
        print("No processed data found. Run process.py first.")
        conn.close()
        return

    date_str = summary["date"]

    # Store metadata
    conn.execute("INSERT OR REPLACE INTO metadata VALUES (?, ?)", ("date", date_str))
    conn.execute("INSERT OR REPLACE INTO metadata VALUES (?, ?)", ("grid_size", str(summary["grid_size"])))
    conn.execute("INSERT OR REPLACE INTO metadata VALUES (?, ?)", ("source_file", summary["source_file"]))
    depths_json = json.dumps([d["depth_m"] for d in summary["depths_processed"]])
    conn.execute("INSERT OR REPLACE INTO metadata VALUES (?, ?)", ("depths", depths_json))

    total_grid = 0
    total_obs = 0

    for depth_info in summary["depths_processed"]:
        depth_m = depth_info["depth_m"]
        grid_file = PROCESSED_DIR / depth_info["grid_file"]
        obs_file = PROCESSED_DIR / depth_info["obs_file"]

        # Load grid
        if grid_file.exists():
            with open(grid_file) as f:
                grid_data = json.load(f)
            for pt in grid_data:
                temp_celsius = pt["value"] - 273.15
                conn.execute(
                    "INSERT OR REPLACE INTO grid VALUES (?, ?, ?, ?, ?)",
                    (date_str, depth_m, pt["lat"], pt["lon"], round(temp_celsius, 3)),
                )
            total_grid += len(grid_data)
            print(f"  Grid {depth_info['grid_file']}: {len(grid_data)} points")

        # Load observations
        if obs_file.exists() and obs_file.stat().st_size > 2:
            with open(obs_file) as f:
                obs_data = json.load(f)
            for obs in obs_data:
                conn.execute(
                    """INSERT OR REPLACE INTO float_obs
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        obs["id"], date_str, depth_m,
                        obs.get("pressure_dbar"), obs.get("temperature"),
                        obs.get("model_temp"), obs.get("delta"),
                        obs.get("nearest_grid_lat"), obs.get("nearest_grid_lon"),
                        obs.get("distance_km"), obs.get("timestamp"),
                    ),
                )
                # Upsert float summary
                row = conn.execute(
                    "SELECT lat, lon, first_seen, last_seen, record_count FROM floats WHERE id = ?",
                    (obs["id"],),
                ).fetchone()
                if row is None:
                    conn.execute(
                        "INSERT INTO floats VALUES (?, ?, ?, ?, ?, ?)",
                        (obs["id"], obs["lat"], obs["lon"],
                         obs.get("timestamp"), obs.get("timestamp"), 1),
                    )
                else:
                    ts = obs.get("timestamp") or ""
                    first = row[2] or ""
                    last = row[3] or ""
                    new_first = min(first, ts) if first else ts
                    new_last = max(last, ts) if last else ts
                    conn.execute(
                        "UPDATE floats SET lat=?, lon=?, first_seen=?, last_seen=?, record_count=record_count+1 WHERE id=?",
                        (obs["lat"], obs["lon"], new_first, new_last, obs["id"]),
                    )
                total_obs += 1
            print(f"  Obs {depth_info['obs_file']}: {len(obs_data)} records")
        else:
            print(f"  Obs {depth_info['obs_file']}: empty, skipping")

    conn.commit()
    conn.close()

    print(f"\nCache built: {DB_PATH}")
    print(f"  Grid points: {total_grid}")
    print(f"  Observations: {total_obs}")
    print(f"  Date: {date_str}")
    print(f"  Depths: {[d['depth_m'] for d in summary['depths_processed']]}")


if __name__ == "__main__":
    preload()
