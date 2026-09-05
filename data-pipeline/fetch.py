"""fetch.py — Download ocean model and in-situ datasets.

Two paths:

  A) NOAA GODAS (no registration)
     - Monthly potential temperature + salinity (3D, 40 depth levels)
     - Surface momentum flux (uflx, vflx) — proxy for surface currents
     - 1° resolution, global coverage, 1980–present
     - Note: 3D current velocity (ucur/vcur) is NOT in the monthly GRB files.
       Use CMEMS for 3D currents.

  B) CMEMS (free 2-minute registration)
     - Daily SST + 3D currents (uo/vo), 1/12° resolution, 40+ depth levels
     - Best option for current velocity visualization

Usage:
  python -m data-pipeline.fetch --source godas --months 2
  python -m data-pipeline.fetch --source cmems --user USER --password PASS
"""

import argparse
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import requests

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"

# ── Indian Ocean bounding box ──────────────────────────────────────────────
LAT_MIN, LAT_MAX = -10, 30
LON_MIN, LON_MAX = 40, 100


# ═══════════════════════════════════════════════════════════════════════════
#  OPTION A: NOAA GODAS — Direct GRB download (no registration)
# ═══════════════════════════════════════════════════════════════════════════
# GODAS monthly files from CPC FTP:
#   godas.M.YYYYMM.grb  (~39 MB each)
# Contains: potential temperature (pt), salinity (s), surface momentum flux
# Read with xarray + cfgrib engine.

GODAS_FTP = "https://ftp.cpc.ncep.noaa.gov/godas/monthly"


def _recent_godas_months(n: int) -> list[str]:
    """Return list of YYYYMM strings for the n most recent available months."""
    today = date.today()
    current = today.replace(day=1) - timedelta(days=60)
    months = []
    for _ in range(n):
        months.append(current.strftime("%Y%m"))
        if current.month == 1:
            current = current.replace(year=current.year - 1, month=12)
        else:
            current = current.replace(month=current.month - 1)
    return months


def download_godas(months: int = 2) -> list[Path]:
    """Download recent GODAS GRB files via HTTP (no registration needed)."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    downloaded = []

    for ym in _recent_godas_months(months):
        fname = f"godas.M.{ym}.grb"
        dest = RAW_DIR / fname
        if dest.exists():
            print(f"  [skip] {fname} already exists ({dest.stat().st_size / 1e6:.0f} MB)")
            downloaded.append(dest)
            continue

        url = f"{GODAS_FTP}/{fname}"
        print(f"  [get]  {fname} (~39 MB) ...")
        try:
            r = requests.get(url, stream=True, timeout=300)
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 16):
                    f.write(chunk)
            downloaded.append(dest)
            print(f"         saved ({dest.stat().st_size / 1e6:.1f} MB)")
        except requests.HTTPError as e:
            print(f"  [warn] HTTP {e.response.status_code} for {ym} — data may not exist yet")
        except Exception as e:
            print(f"  [error] {e}")

    return downloaded


# ═══════════════════════════════════════════════════════════════════════════
#  OPTION B: CMEMS via copernicusmarine toolbox (free registration required)
# ═══════════════════════════════════════════════════════════════════════════
# Product:  GLOBAL_ANALYSISFORECAST_PHY_001_024
# Dataset:  cmems_mod_glo_phy_anfc_0.083deg_P1D-m
# Variables: thetao (temperature), uo (eastward current), vo (northward current)
# Resolution: 1/12° (~9 km), daily, 40+ depth levels

CMEMS_DATASET = "cmems_mod_glo_phy_anfc_0.083deg_P1D-m"


def download_cmems(
    username: str,
    password: str,
    days: int = 5,
    output_name: str = "cmems_indian_ocean.nc",
) -> Path | None:
    """Download a small CMEMS subset via the copernicusmarine toolbox."""
    try:
        import copernicusmarine
    except ImportError:
        print("ERROR: 'copernicusmarine' package not installed.")
        print("       Run:  pip install copernicusmarine")
        return None

    end = date.today() - timedelta(days=2)
    start = end - timedelta(days=days)

    dest = RAW_DIR / output_name
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    print(f"  [cmems] Subsetting {CMEMS_DATASET} ...")
    print(f"          Region: {LON_MIN}-{LON_MAX}E, {LAT_MIN}-{LAT_MAX}N")
    print(f"          Time:   {start} to {end}")
    print(f"          Depth:  surface to 100 m")

    try:
        copernicusmarine.subset(
            dataset_id=CMEMS_DATASET,
            variables=["thetao", "uo", "vo"],
            minimum_longitude=LON_MIN,
            maximum_longitude=LON_MAX,
            minimum_latitude=LAT_MIN,
            maximum_latitude=LAT_MAX,
            minimum_depth=0.49,
            maximum_depth=100,
            start_datetime=str(start),
            end_datetime=str(end),
            output_filename=output_name,
            output_directory=str(RAW_DIR),
            file_format="netcdf",
            username=username,
            password=password,
            overwrite=True,
        )
        print(f"          saved to {dest}")
        return dest
    except Exception as e:
        print(f"  [error] {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════════
def main():
    parser = argparse.ArgumentParser(description="Download ocean data samples")
    parser.add_argument("--source", choices=["godas", "cmems"], default="godas",
                        help="Data source (default: godas, no registration)")
    parser.add_argument("--months", type=int, default=2,
                        help="Number of GODAS months to fetch (default: 2)")
    parser.add_argument("--days", type=int, default=5,
                        help="Number of CMEMS days to fetch (default: 5)")
    parser.add_argument("--user", default=os.environ.get("CMEMS_USER"),
                        help="CMEMS username (or set CMEMS_USER env var)")
    parser.add_argument("--password", default=os.environ.get("CMEMS_PASS"),
                        help="CMEMS password (or set CMEMS_PASS env var)")
    args = parser.parse_args()

    print(f"=== Fetching from {args.source.upper()} ===")
    print(f"    Indian Ocean box: {LAT_MIN}-{LAT_MAX}N, {LON_MIN}-{LON_MAX}E\n")

    if args.source == "godas":
        files = download_godas(args.months)
        print(f"\nDone. {len(files)} file(s) in {RAW_DIR}")
        if files:
            print("Variables: pt (potential temp), s (salinity), uflx/vflx (surface momentum flux)")
            print("Note: 3D current velocity not available in monthly GRB. Use --source cmems for currents.")

    elif args.source == "cmems":
        if not args.user or not args.password:
            print("CMEMS requires a free account (takes 2 minutes, no approval queue).")
            print()
            print("  1. Go to   https://marine.copernicus.eu/register")
            print("  2. Fill form -> confirm email -> set password")
            print("  3. Run:")
            print("     python -m data-pipeline.fetch --source cmems --user <USERNAME> --password <PASSWORD>")
            print()
            print("  Or set env vars:  export CMEMS_USER=xxx  export CMEMS_PASS=xxx")
            sys.exit(1)
        f = download_cmems(args.user, args.password, args.days)
        if f:
            print(f"\nDone. File: {f}")
            print("Tip: Run 'python -m data-pipeline.inspect_dataset' to examine the data.")


if __name__ == "__main__":
    main()
