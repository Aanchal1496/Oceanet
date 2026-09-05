"""inspect_dataset.py — Open a NetCDF/GRIB file with xarray and print its structure.

Shows dimensions, variables, coordinate ranges, time range, and available
ocean parameters so you can confirm the file has what you need.

Usage:
  python -m data-pipeline.inspect_dataset data/raw/some_file.nc
  python -m data-pipeline.inspect_dataset data/raw/some_file.grb
  python -m data-pipeline.inspect_dataset            # scans data/raw/ for data files
"""

import sys
from pathlib import Path

import xarray as xr

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"

OCEAN_VARS = {
    "thetao": "Sea Water Temperature",
    "temperature": "Temperature",
    "sst": "Sea Surface Temperature",
    "pottmp": "Potential Temperature",
    "ptmp": "Potential Temperature",
    "pt": "Potential Temperature",
    "tmp": "Temperature",
    "tos": "Sea Surface Temperature (CMIP)",
    "uo": "Eastward Sea Water Velocity",
    "vo": "Northward Sea Water Velocity",
    "ucur": "U-Current (eastward)",
    "vcur": "V-Current (northward)",
    "u12": "12m Eastward Current",
    "v12": "12m Northward Current",
    "uflx": "U-Momentum Flux (surface)",
    "vflx": "V-Momentum Flux (surface)",
    "cur": "Ocean Current",
    "speed": "Current Speed",
    "zos": "Sea Surface Height",
    "ssh": "Sea Surface Height",
    "so": "Sea Water Salinity",
    "s": "Salinity",
    "salt": "Salinity",
}


def _open_file(filepath: Path) -> xr.Dataset:
    """Open NetCDF or GRIB file with appropriate engine."""
    suffix = filepath.suffix.lower()
    if suffix in (".grb", ".grb2", ".grib", ".grib2"):
        # Try opening with cfgrib, filter by depth level type first
        for filter_keys in [
            {"typeOfLevel": "depthBelowSea"},
            {"typeOfLevel": "surface"},
            {},
        ]:
            try:
                return xr.open_dataset(
                    filepath,
                    engine="cfgrib",
                    backend_kwargs={
                        "filter_by_keys": filter_keys,
                        "indexpath": "",
                    },
                )
            except Exception:
                continue
        raise ValueError(f"Could not open GRIB file with cfgrib: {filepath}")
    return xr.open_dataset(filepath)


def inspect_file(filepath: Path) -> None:
    print(f"\n{'=' * 60}")
    print(f"  FILE: {filepath.name}")
    print(f"  SIZE: {filepath.stat().st_size / 1e6:.1f} MB")
    print(f"{'=' * 60}")

    try:
        ds = _open_file(filepath)
    except Exception as e:
        print(f"  ERROR opening file: {e}")
        return

    # ── Dimensions ──
    print(f"\n  DIMENSIONS ({len(ds.sizes)}):")
    for dim, size in ds.sizes.items():
        print(f"    {dim:12s}  ->  {size} values")

    # ── Coordinates ──
    print(f"\n  COORDINATES:")
    for coord in ds.coords:
        c = ds.coords[coord]
        if c.size == 0:
            continue
        vals = c.values
        dtype = str(vals.dtype)
        if vals.size == 1:
            print(f"    {coord:12s}  ->  {dtype:8s}  = {vals.item()}")
        elif vals.size > 1:
            print(f"    {coord:12s}  ->  {dtype:8s}  [{vals.min():.4g} .. {vals.max():.4g}]  ({vals.size} pts)")

    # ── Data Variables ──
    print(f"\n  DATA VARIABLES ({len(ds.data_vars)}):")
    for var in ds.data_vars:
        v = ds[var]
        desc = OCEAN_VARS.get(var, v.attrs.get("long_name", ""))
        flag = "  [OCEAN]" if var in OCEAN_VARS else ""
        print(f"    {var:14s}  shape={str(tuple(v.shape)):24s}  dtype={v.dtype}{flag}")
        if desc:
            print(f"    {'':14s}  {desc}")

    # ── Attribute summary ──
    if ds.attrs:
        print(f"\n  GLOBAL ATTRIBUTES:")
        for k, v in ds.attrs.items():
            val = str(v)[:80]
            print(f"    {k}: {val}")

    # ── Quick data summary ──
    print(f"\n  DATA RANGES:")
    found_any = False
    for var in ds.data_vars:
        v = ds[var]
        if v.dtype.kind in ("f", "i", "u") and v.size > 0:
            try:
                vmin = float(v.min())
                vmax = float(v.max())
                vmean = float(v.mean())
                units = v.attrs.get("units", "---")
                print(f"    {var:14s}  min={vmin:12.4g}  max={vmax:12.4g}  mean={vmean:12.4g}  [{units}]")
                found_any = True
            except Exception:
                pass
    if not found_any:
        print("    (no numeric data variables found)")

    # ── Time range ──
    for tvar in ("time", "Time", "TIME", "t", "forecastTime"):
        if tvar in ds.coords:
            t = ds.coords[tvar]
            if t.size == 1:
                print(f"\n  TIME ({tvar}): {t.values}")
            elif t.size > 1:
                print(f"\n  TIME RANGE ({tvar}):")
                print(f"    from:  {t.values[0]}")
                print(f"    to:    {t.values[-1]}")
                print(f"    steps: {t.size}")
            break

    # ── Depth / level range ──
    for dvar in ("depth", "deptht", "z", "lev", "level", "ZAX", "ZLEV",
                 "isobaricInhPa", "depthBelowSea"):
        if dvar in ds.coords:
            d = ds.coords[dvar]
            if d.size > 1:
                print(f"\n  DEPTH/LEVEL RANGE ({dvar}):")
                print(f"    from:  {d.values[0]} {d.attrs.get('units', '')}")
                print(f"    to:    {d.values[-1]} {d.attrs.get('units', '')}")
                print(f"    levels: {d.size}")
            break

    # ── Latitude / Longitude ──
    for latvar in ("latitude", "lat", "y", "lat_0"):
        if latvar in ds.coords:
            lat = ds.coords[latvar]
            if lat.size > 1:
                print(f"\n  LATITUDE ({latvar}): {float(lat.min()):.2f} to {float(lat.max()):.2f} ({lat.size} pts)")
            break
    for lonvar in ("longitude", "lon", "x", "lon_0"):
        if lonvar in ds.coords:
            lon = ds.coords[lonvar]
            if lon.size > 1:
                print(f"  LONGITUDE ({lonvar}): {float(lon.min()):.2f} to {float(lon.max()):.2f} ({lon.size} pts)")
            break

    ds.close()
    print()


def main():
    if len(sys.argv) > 1:
        for path_str in sys.argv[1:]:
            p = Path(path_str)
            if p.exists():
                inspect_file(p)
            else:
                print(f"[error] File not found: {p}")
    else:
        files = sorted(
            list(RAW_DIR.glob("*.nc"))
            + list(RAW_DIR.glob("*.grb"))
            + list(RAW_DIR.glob("*.grb2"))
        )
        if not files:
            print(f"No data files found in {RAW_DIR}")
            print("Run 'python -m data-pipeline.fetch' first.")
            return
        print(f"Found {len(files)} file(s) in {RAW_DIR}:")
        for f in files:
            print(f"  - {f.name} ({f.stat().st_size / 1e6:.1f} MB)")
        print()
        for f in files:
            inspect_file(f)


if __name__ == "__main__":
    main()
