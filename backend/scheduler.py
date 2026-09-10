"""scheduler.py — Daily background fetch of GODAS + ARGO data.

Runs the existing fetch scripts (data-pipeline.fetch, data-pipeline.fetch_in_situ)
every 24 hours from the FastAPI lifespan, off the event loop so the server
never blocks.

Logging covers:
  - fetch started
  - GODAS success / failure
  - ARGO success / failure
  - fetch completed

On full success, the ISO 8601 completion timestamp is persisted to
data_status.json (simple JSON file, no DB).
"""

import asyncio
import json
import logging
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FETCH_INTERVAL_HOURS = 24
STATUS_FILE = Path(__file__).resolve().parent / "data_status.json"

logger = logging.getLogger("oceanet.scheduler")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def _run_module(*mod_args: str) -> tuple[bool, str]:
    """Run `python -m <mod_args>` in the project root.

    Returns (success, error_message).
    """
    proc = subprocess.run(
        [sys.executable, "-m", *mod_args],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
    )
    if proc.returncode == 0:
        return True, ""
    detail = (proc.stderr or proc.stdout or "").strip()
    return False, detail.splitlines()[-1] if detail else f"exit code {proc.returncode}"


def _load_status() -> dict:
    """Read the persisted status JSON."""
    try:
        with open(STATUS_FILE) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def read_last_updated() -> str | None:
    """Return ISO timestamp of the last successful fetch, or None."""
    ts = _load_status().get("last_updated")
    return ts if isinstance(ts, str) else None


def read_status() -> dict:
    """Return the persisted update-status fields (last_updated, last_attempt, ...)."""
    return _load_status()


def _save_status(**updates) -> None:
    """Persist status fields to JSON, preserving fields not being updated."""
    data = _load_status()
    data.update(updates)
    try:
        with open(STATUS_FILE, "w") as f:
            json.dump(data, f)
    except OSError as e:
        logger.error("Failed to write status file: %s", e)


def run_fetch_pipeline() -> None:
    """Fetch GODAS + ARGO once. Blocking; run via asyncio.to_thread."""
    logger.info("Fetch started")

    godas_ok, godas_err = _run_module("data-pipeline.fetch", "--source", "godas")
    if godas_ok:
        logger.info("GODAS fetch success")
    else:
        logger.error("GODAS fetch failure: %s", godas_err)

    argo_ok, argo_err = _run_module("data-pipeline.fetch_in_situ")
    if argo_ok:
        logger.info("ARGO fetch success")
    else:
        logger.error("ARGO fetch failure: %s", argo_err)

    ts = datetime.now(timezone.utc).isoformat()
    if godas_ok and argo_ok:
        _save_status(last_updated=ts, last_attempt=ts, last_attempt_success=True)
        logger.info("Fetch completed: %s", ts)
    else:
        _save_status(last_attempt=ts, last_attempt_success=False)
        logger.info("Fetch completed (partial/failed — existing status kept)")


async def _scheduler_loop() -> None:
    while True:
        await asyncio.to_thread(run_fetch_pipeline)
        await asyncio.sleep(FETCH_INTERVAL_HOURS * 3600)


def start_scheduler() -> asyncio.Task:
    """Launch the daily fetcher as a background asyncio task."""
    return asyncio.create_task(_scheduler_loop())