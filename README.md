# Ocean Data Visualization Platform

## Project Structure

```
.
├── backend/               # FastAPI service (serves processed data)
│   └── main.py
├── data-pipeline/         # Python scripts to fetch & process ocean data
│   ├── fetch.py           # Download model data (NOAA GODAS / CMEMS)
│   ├── fetch_in_situ.py   # Download ARGO float profiles (Argovis API)
│   ├── inspect_dataset.py # Print structure of downloaded NetCDF/GRIB files
│   └── process.py         # Transform raw → processed
├── data/
│   ├── raw/               # Downloaded files (gitignored)
│   └── processed/         # Output from pipeline (gitignored)
├── frontend/              # Three.js / HTML visualization client
├── .gitignore
├── requirements.txt
└── README.md
```

---

## Data Sources — Indian Ocean SST & Currents

### Option A: NOAA GODAS (no registration)

| | |
|---|---|
| **What** | Potential temperature (3D, 40 depth levels), salinity, surface momentum flux |
| **Resolution** | 1° monthly |
| **Time range** | 1980 – present |
| **Format** | GRIB → read with xarray + cfgrib |
| **Registration** | **NONE** — direct HTTP download from CPC FTP |
| **Currents?** | Surface momentum flux only (uflx/vflx). **No 3D current velocity.** |

### Option B: Copernicus Marine Service (CMEMS) — Recommended for currents

| | |
|---|---|
| **What** | SST (`thetao`), 3D currents (`uo`, `vo`), 40+ depth levels |
| **Resolution** | 1/12° (~9 km), daily |
| **Time range** | Near-real-time + forecast |
| **Format** | NetCDF via `copernicusmarine` toolbox |
| **Registration** | **FREE account** — 2-minute signup, instant access, no approval |
| **Register** | https://marine.copernicus.eu/register |

> **CMEMS registration:** Go to the link → fill form → confirm email → set password. Done. No queues.

### Option C: INCOIS LAS / GODAS

| | |
|---|---|
| **What** | Indian Ocean reanalysis (RAIN, 9 km ROMS), GODAS, Argo profiles |
| **Access** | OPeNDAP via `las.incois.gov.in` (public); FTP requires emailing INCOIS |
| **Best for** | Indian Ocean specifically, but less streamlined access |

---

## Prerequisites

- Python 3.11+

## Setup

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1      # Windows PowerShell
# source .venv/bin/activate        # macOS / Linux

pip install -r requirements.txt

# Only if using CMEMS:
pip install copernicusmarine
```

## Fetching Data

### Quick start — NOAA GODAS (no registration)

```bash
# Download 2 months of temperature + salinity
python -m data-pipeline.fetch --source godas --months 2

# Inspect what you got
python -m data-pipeline.inspect_dataset
```

### Best quality — CMEMS (free account needed)

```bash
# Set credentials (or pass via flags)
export CMEMS_USER="your_username"
export CMEMS_PASS="your_password"

# Download 5 days of SST + 3D currents (surface to 100m)
python -m data-pipeline.fetch --source cmems --days 5

# Inspect
python -m data-pipeline.inspect_dataset
```

### Process raw → processed

```bash
python -m data-pipeline.process
```

### Fetch in-situ ARGO float data (no registration)

```bash
# Download ~50 ARGO profiles with temperature for July 2026
python -m data-pipeline.fetch_in_situ --start 2026-07-01 --end 2026-07-31 --limit 50
```

Output: `data/raw/argo_indian_ocean.json` — clean JSON list of:
```json
[
  {
    "id": "4902950_300",
    "lat": -4.38,
    "lon": 51.67,
    "timestamp": "2026-07-31T22:59:54.002Z",
    "pressure_dbar": 3.97,
    "temperature_celsius": 27.266
  }
]
```

---

## Running the Backend API

```bash
uvicorn backend.main:app --reload --port 8000
```

- **Health check**: `GET http://localhost:8000/health`
- **Swagger UI**: `http://localhost:8000/docs`
- CORS enabled for `localhost:5500`, `127.0.0.1:5500`, `localhost:3000`

## Running the Frontend

```bash
npx serve frontend
# → open http://localhost:3000
```

---

## What Each Script Does

| Script | Purpose |
|---|---|
| `fetch.py` | Downloads model data from GODAS (GRB) or CMEMS (NetCDF) into `data/raw/` |
| `fetch_in_situ.py` | Downloads ARGO float profiles from Argovis API → clean JSON |
| `inspect_dataset.py` | Opens files with xarray, prints dims, variables, ranges, time/depth coverage |
| `process.py` | Reads raw files, applies transforms, writes to `data/processed/` |

## Verified Data (GODAS example output)

```
FILE: godas.M.202607.grb (41.2 MB)

DIMENSIONS: depthBelowSea (40), latitude (418), longitude (360)
VARIABLES:  pt (Potential Temperature), s (Salinity)
DEPTH:      5m to 4478m (40 levels)
LATITUDE:   -74.50 to 64.50
LONGITUDE:  0.50 to 359.50
TIME:       July 2026
```
