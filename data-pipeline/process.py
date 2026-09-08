"""process.py — Process GODAS GRB + ARGO JSON into static JSON for the frontend.

Pipeline:
  1. Load GODAS GRB file (potential temperature, 3D: depth × lat × lon)
  2. Subset to Indian Ocean (40–100°E, 10°S–30°N)
  3. Downsample to a ~20×20 lat/lon grid for smooth 3D rendering
  4. Match each ARGO observation to nearest grid point, compute delta
  5. Save per-depth JSON files the backend can serve

Output files (in data/processed/):
  grid_YYYYMMDD_d{depth}m.json     — model grid  [{lat, lon, depth, value}]
  obs_YYYYMMDD_d{depth}m.json      — ARGO obs    [{id, lat, lon, timestamp, temperature, model_temp, delta}]
  summary_YYYYMMDD.json            — metadata for all depths

Why 20×20?
  - Full Indian Ocean subset at GODAS resolution = ~120 lat × 60 lon = 7200 points
  - A 20×20 grid (400 points) renders smoothly in Three.js without killing frame rate
  - Keeps file size < 50 KB per depth — loads instantly in browser
  - The ~3° grid spacing still captures large-scale SST patterns across the basin

Usage:
  python -m data-pipeline.process
  python -m data-pipeline.process --grid-size 30          # finer grid
  python -m data-pipeline.process --depths 5 50 200       # specific depths only
  python -m data-pipeline.process --lat-range -10 30 --lon-range 40 100
"""

import argparse
import json
import math
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import xarray as xr

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
PROC_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"

# ── Defaults ───────────────────────────────────────────────────────────────
DEFAULT_LAT = (-10, 30)
DEFAULT_LON = (40, 100)
DEFAULT_GRID = 20        # 20×20 grid points
DEFAULT_DEPTHS = [5, 50, 100, 200, 500]  # meters — good mix of surface + subsurface
DEFAULT_DAYS = 7         # number of days to process


# ── Load GODAS data ────────────────────────────────────────────────────────
def load_godas(filepath: Path) -> xr.Dataset:
    """Open a GODAS GRB file with xarray + cfgrib."""
    return xr.open_dataset(
        filepath,
        engine="cfgrib",
        backend_kwargs={
            "filter_by_keys": {"typeOfLevel": "depthBelowSea"},
            "indexpath": "",
        },
    )


def subset_indian_ocean(
    ds: xr.Dataset,
    lat_range: tuple[float, float],
    lon_range: tuple[float, float],
) -> xr.Dataset:
    """Subset dataset to a lat/lon bounding box."""
    lat_min, lat_max = lat_range
    lon_min, lon_max = lon_range

    # GODAS lat is ascending (-74.5 to 64.5), lon is ascending (0.5 to 359.5)
    # xarray slice must match the coordinate order
    return ds.sel(
        latitude=slice(lat_min, lat_max),
        longitude=slice(lon_min, lon_max),
    )


# ── Downsample grid ────────────────────────────────────────────────────────
def downsample_grid(
    da: xr.DataArray,
    n_points: int,
    depth_val: float,
) -> list[dict]:
    """Downsample a 2D slice (lat × lon) to n_points × n_points.

    Returns list of {lat, lon, depth, value} dicts.
    NaN/missing values are skipped.
    """
    lats = da.latitude.values
    lons = da.longitude.values
    data = da.values  # shape: (n_lat, n_lon)

    # Pick evenly-spaced indices
    lat_idx = np.linspace(0, len(lats) - 1, n_points, dtype=int)
    lon_idx = np.linspace(0, len(lons) - 1, n_points, dtype=int)

    records = []
    for li in lat_idx:
        for lj in lon_idx:
            val = data[li, lj]
            if np.isfinite(val):
                records.append({
                    "lat": round(float(lats[li]), 4),
                    "lon": round(float(lons[lj]), 4),
                    "depth": round(depth_val, 1),
                    "value": round(float(val), 3),
                })
    return records


# ── Match in-situ observations ─────────────────────────────────────────────
def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance between two points (km)."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_grid_lookup(grid_records: list[dict]) -> list[tuple[float, float, float]]:
    """Build list of (lat, lon, value) from grid records for nearest-neighbor lookup."""
    return [(r["lat"], r["lon"], r["value"]) for r in grid_records]


def match_obs_to_grid(
    argo_records: list[dict],
    grid_lookup: list[tuple[float, float, float]],
    target_depth: float,
    max_depth_diff: float = 30.0,
) -> list[dict]:
    """Match ARGO observations to nearest grid point and compute delta.

    Only uses observations within max_depth_diff meters of target_depth.
    """
    matched = []
    for obs in argo_records:
        obs_depth = obs["pressure_dbar"]  # dbar ≈ meters
        if abs(obs_depth - target_depth) > max_depth_diff:
            continue

        # Find nearest grid point
        best_dist = float("inf")
        best_model_temp = None
        for g_lat, g_lon, g_val in grid_lookup:
            d = haversine_km(obs["lat"], obs["lon"], g_lat, g_lon)
            if d < best_dist:
                best_dist = d
                best_model_temp = g_val

        if best_model_temp is None:
            continue

        # GODAS pt is in Kelvin, ARGO is in Celsius
        model_temp_celsius = best_model_temp - 273.15
        delta = obs["temperature_celsius"] - model_temp_celsius

        matched.append({
            "id": obs["id"],
            "lat": obs["lat"],
            "lon": obs["lon"],
            "timestamp": obs["timestamp"],
            "temperature": round(obs["temperature_celsius"], 3),
            "model_temp": round(model_temp_celsius, 3),
            "delta": round(delta, 3),
            "nearest_grid_lat": round(grid_lookup[0][0], 4),  # placeholder
            "nearest_grid_lon": round(grid_lookup[0][1], 4),
            "distance_km": round(best_dist, 1),
        })
    return matched


def match_obs_to_grid_detailed(
    argo_records: list[dict],
    grid_records: list[dict],
    target_depth: float,
    max_depth_diff: float = 30.0,
) -> list[dict]:
    """Match ARGO observations to nearest grid point with full detail."""
    matched = []
    for obs in argo_records:
        obs_depth = obs["pressure_dbar"]
        if abs(obs_depth - target_depth) > max_depth_diff:
            continue

        best_dist = float("inf")
        best_grid = None
        for g in grid_records:
            d = haversine_km(obs["lat"], obs["lon"], g["lat"], g["lon"])
            if d < best_dist:
                best_dist = d
                best_grid = g

        if best_grid is None:
            continue

        model_temp_celsius = best_grid["value"] - 273.15
        delta = obs["temperature_celsius"] - model_temp_celsius

        matched.append({
            "id": obs["id"],
            "lat": obs["lat"],
            "lon": obs["lon"],
            "timestamp": obs["timestamp"],
            "pressure_dbar": obs["pressure_dbar"],
            "temperature": round(obs["temperature_celsius"], 3),
            "model_temp": round(model_temp_celsius, 3),
            "delta": round(delta, 3),
            "nearest_grid_lat": best_grid["lat"],
            "nearest_grid_lon": best_grid["lon"],
            "distance_km": round(best_dist, 1),
        })
    return matched


# ── Main pipeline ──────────────────────────────────────────────────────────
def process(
    grid_size: int = DEFAULT_GRID,
    depths: list[float] | None = None,
    lat_range: tuple[float, float] = DEFAULT_LAT,
    lon_range: tuple[float, float] = DEFAULT_LON,
    num_days: int = DEFAULT_DAYS,
):
    PROC_DIR.mkdir(parents=True, exist_ok=True)

    if depths is None:
        depths = DEFAULT_DEPTHS

    # Find GRB file
    grb_files = sorted(RAW_DIR.glob("godas.M.*.grb"))
    if not grb_files:
        print("ERROR: No GODAS GRB files in data/raw/. Run fetch.py first.")
        return
    grb_path = grb_files[-1]  # most recent month

    # Find ARGO JSON
    argo_path = RAW_DIR / "argo_indian_ocean.json"
    argo_records = []
    if argo_path.exists():
        with open(argo_path) as f:
            argo_records = json.load(f)
        print(f"  Loaded {len(argo_records)} ARGO records")
    else:
        print("  WARNING: No ARGO JSON found. Skipping obs matching.")

    # Determine available dates from ARGO timestamps
    if argo_records:
        all_dates = sorted(set(r["timestamp"][:10] for r in argo_records if r.get("timestamp")))
        # Take last num_days dates
        process_dates = all_dates[-num_days:] if len(all_dates) >= num_days else all_dates
    else:
        # Fallback: use first day of the month
        ym = grb_path.stem.split(".")[-1]
        process_dates = [f"{ym[:4]}-{ym[4:]}-01"]

    print(f"\n=== Processing {grb_path.name} ===")
    print(f"    Grid: {grid_size}×{grid_size}, Depths: {depths}")
    print(f"    Region: {lat_range[0]}–{lat_range[1]}°N, {lon_range[0]}–{lon_range[1]}°E")
    print(f"    Days: {len(process_dates)} ({process_dates[0]} to {process_dates[-1]})\n")

    # Load and subset GODAS (same for all days — monthly mean)
    ds = load_godas(grb_path)
    ds_sub = subset_indian_ocean(ds, lat_range, lon_range)
    pt = ds_sub.pt  # potential temperature in Kelvin

    print(f"  Subset shape: {dict(pt.sizes)}")
    print(f"  Available depths: {ds_sub.depthBelowSea.values}")

    # Find which requested depths exist in the data
    available_depths = ds_sub.depthBelowSea.values
    valid_depths = []
    for d in depths:
        idx = np.argmin(np.abs(available_depths - d))
        actual_depth = available_depths[idx]
        if abs(actual_depth - d) < 50:
            valid_depths.append((d, actual_depth))
            print(f"    Requested {d}m -> using {actual_depth}m")
        else:
            print(f"    Skipping {d}m (nearest is {actual_depth}m, too far)")

    if not valid_depths:
        print("  ERROR: No valid depths found.")
        return

    # Pre-compute grid for each depth (same for all days)
    depth_grids = {}
    for target_depth, actual_depth in valid_depths:
        depth_idx = np.argmin(np.abs(available_depths - actual_depth))
        slice_2d = pt.isel(depthBelowSea=depth_idx)
        grid_records = downsample_grid(slice_2d, grid_size, actual_depth)
        depth_grids[actual_depth] = grid_records
        print(f"\n  Depth {actual_depth}m: {len(grid_records)} grid points")

    # Process each day
    all_summaries = []
    for day_str in process_dates:
        date_compact = day_str.replace("-", "")
        print(f"\n--- Day {day_str} ---")

        # Filter ARGO records for this day
        day_argo = [r for r in argo_records if r.get("timestamp", "").startswith(day_str)] if argo_records else []

        summary = {
            "date": date_compact,
            "source_file": grb_path.name,
            "region": {"lat": list(lat_range), "lon": list(lon_range)},
            "grid_size": grid_size,
            "depths_processed": [],
        }

        for target_depth, actual_depth in valid_depths:
            grid_records = depth_grids[actual_depth]

            # Save grid JSON (same grid for each day)
            grid_file = PROC_DIR / f"grid_{date_compact}_d{int(actual_depth)}m.json"
            with open(grid_file, "w") as f:
                json.dump(grid_records, f)

            # Match ARGO observations for this day
            obs_file = PROC_DIR / f"obs_{date_compact}_d{int(actual_depth)}m.json"
            if day_argo:
                matched = match_obs_to_grid_detailed(day_argo, grid_records, actual_depth)
                with open(obs_file, "w") as f:
                    json.dump(matched, f, indent=2)
                obs_count = len(matched)
            else:
                with open(obs_file, "w") as f:
                    json.dump([], f)
                obs_count = 0

            summary["depths_processed"].append({
                "depth_m": int(actual_depth),
                "grid_points": len(grid_records),
                "matched_obs": obs_count,
                "grid_file": grid_file.name,
                "obs_file": obs_file.name,
            })

        # Save summary for this day
        summary_file = PROC_DIR / f"summary_{date_compact}.json"
        with open(summary_file, "w") as f:
            json.dump(summary, f, indent=2)
        all_summaries.append(summary)
        print(f"  Summary: {summary_file.name} ({sum(d['matched_obs'] for d in summary['depths_processed'])} total obs)")

    print(f"\n=== Done. {len(process_dates)} day(s) × {len(valid_depths)} depth(s) processed. ===")
    print(f"    Output: {PROC_DIR}")


# ── CLI ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Process ocean data to JSON for frontend")
    parser.add_argument("--grid-size", type=int, default=DEFAULT_GRID,
                        help="NxN grid points for downsampling (default: 20)")
    parser.add_argument("--depths", type=float, nargs="+", default=None,
                        help="Depth levels in meters (default: 5 50 100 200 500)")
    parser.add_argument("--lat-range", type=float, nargs=2, default=list(DEFAULT_LAT),
                        metavar=("MIN", "MAX"), help="Latitude range")
    parser.add_argument("--lon-range", type=float, nargs=2, default=list(DEFAULT_LON),
                        metavar=("MIN", "MAX"), help="Longitude range")
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS,
                        help="Number of days to process (default: 7)")
    args = parser.parse_args()

    process(
        grid_size=args.grid_size,
        depths=args.depths,
        lat_range=tuple(args.lat_range),
        lon_range=tuple(args.lon_range),
        num_days=args.days,
    )


if __name__ == "__main__":
    main()
