"""fetch_in_situ.py — Download real ARGO float profiles from the Argovis API.

Uses the Argovis REST API (free, no registration required for basic queries).
API docs: https://argovis-api.colorado.edu/docs/

Region: Indian Ocean (40-100E, 10S-30N)
Time:   Last 30 days (matching GODAS model data)

Usage:
  python -m data-pipeline.fetch_in_situ
  python -m data-pipeline.fetch_in_situ --start 2026-07-01 --end 2026-07-15 --limit 50
"""

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

import requests

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
OUTPUT_FILE = RAW_DIR / "argo_indian_ocean.json"

# Indian Ocean bounding box
LON_MIN, LON_MAX = 40, 100
LAT_MIN, LAT_MAX = -10, 30

ARGOVIS_BASE = "https://argovis-api.colorado.edu"


def build_polygon() -> str:
    """Build a polygon string for the Indian Ocean bounding box."""
    return str([
        [LON_MIN, LAT_MIN],
        [LON_MAX, LAT_MIN],
        [LON_MAX, LAT_MAX],
        [LON_MIN, LAT_MAX],
        [LON_MIN, LAT_MIN],
    ]).replace(" ", "")


def fetch_argo_profiles(
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """Fetch ARGO profiles from Argovis API.

    Returns raw API response (list of profile dicts with nested data arrays).
    """
    today = date.today()
    if start_date is None:
        start_date = (today - timedelta(days=30)).isoformat()
    if end_date is None:
        end_date = today.isoformat()
    polygon = build_polygon()
    url = f"{ARGOVIS_BASE}/argo"

    params = {
        "polygon": polygon,
        "startDate": f"{start_date}T00:00:00Z",
        "endDate": f"{end_date}T23:59:59Z",
        "data": "temperature,pressure",
    }

    print(f"  Querying Argovis API ...")
    print(f"  Region: {LON_MIN}-{LON_MAX}E, {LAT_MIN}-{LAT_MAX}N")
    print(f"  Time:   {start_date} to {end_date}")
    print(f"  URL:    {url}")

    r = requests.get(url, params=params, timeout=120)
    r.raise_for_status()
    profiles = r.json()
    print(f"  Received {len(profiles)} profiles")

    return profiles


def parse_profile(profile: dict) -> list[dict]:
    """Convert a single Argovis profile into flat observation records.

    Each profile has vertical measurements (pressure, temperature at various depths).
    We extract surface/near-surface temperature (pressure < 20 dbar) for simplicity.

    Returns a list of observation dicts.
    """
    profile_id = profile.get("_id", "unknown")
    coords = profile.get("geolocation", {}).get("coordinates", [None, None])
    lon, lat = coords[0], coords[1]
    timestamp = profile.get("timestamp", "")

    data = profile.get("data", [])
    data_info = profile.get("data_info", [])

    if not data or len(data) < 2 or not data_info:
        return []

    # data_info[0] lists variable names in the order they appear in data arrays
    var_names = data_info[0] if data_info else []

    # Find indices for pressure and temperature
    pres_idx = None
    temp_idx = None
    for i, name in enumerate(var_names):
        if name == "pressure" and pres_idx is None:
            pres_idx = i
        elif name == "temperature" and temp_idx is None:
            temp_idx = i

    if pres_idx is None or temp_idx is None:
        return []

    pressures = data[pres_idx]
    temperatures = data[temp_idx]

    # Extract ALL measurements across all depths
    records = []
    for p, t in zip(pressures, temperatures):
        if p is not None and t is not None:
            records.append({
                "id": profile_id,
                "lat": lat,
                "lon": lon,
                "timestamp": timestamp,
                "pressure_dbar": round(p, 2),
                "temperature_celsius": round(t, 3),
            })

    return records


def main():
    today = date.today()
    parser = argparse.ArgumentParser(description="Fetch ARGO float data from Argovis")
    parser.add_argument("--start", default=(today - timedelta(days=30)).isoformat(), help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", default=today.isoformat(), help="End date (YYYY-MM-DD)")
    parser.add_argument("--limit", type=int, default=100, help="Max profiles to process")
    parser.add_argument("--output", default=str(OUTPUT_FILE), help="Output JSON path")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)

    print("=== Fetching ARGO float data (Argovis API) ===\n")

    # 1. Fetch from API
    profiles = fetch_argo_profiles(args.start, args.end, args.limit)

    if not profiles:
        print("\nNo profiles found for this region/time.")
        sys.exit(0)

    # 2. Parse into flat records
    all_records = []
    for p in profiles[: args.limit]:
        records = parse_profile(p)
        all_records.extend(records)

    print(f"\n  Parsed {len(profiles)} profiles -> {len(all_records)} observation records")

    # 3. Write JSON
    output_path = Path(args.output)
    with open(output_path, "w") as f:
        json.dump(all_records, f, indent=2)

    print(f"  Saved to: {output_path}")

    # 4. Summary
    if all_records:
        lats = [r["lat"] for r in all_records]
        lons = [r["lon"] for r in all_records]
        temps = [r["temperature_celsius"] for r in all_records]
        print(f"\n  Summary:")
        print(f"    Profiles:  {len(set(r['id'] for r in all_records))}")
        print(f"    Records:   {len(all_records)}")
        print(f"    Lat range: {min(lats):.2f} to {max(lats):.2f}")
        print(f"    Lon range: {min(lons):.2f} to {max(lons):.2f}")
        print(f"    Temp range: {min(temps):.2f} to {max(temps):.2f} °C")


if __name__ == "__main__":
    main()
