"""Bongo Cat's Rhythm Trainer — plugin routes and idempotent schema init."""

import json
import logging
import os
import sqlite3
import threading
from pathlib import Path
from fastapi import APIRouter, Request
from fastapi.responses import Response

logger = logging.getLogger("slopsmith.plugin.bongocat")

CONFIG_DIR = Path(os.environ.get("SLOPSMITH_CONFIG_DIR", Path.home() / ".slopsmith"))
DB_PATH = CONFIG_DIR / "bongocat-runs.db"

_router = APIRouter(prefix="/api/plugins/feedback-plugin-bongocat")
_init_lock = threading.Lock()
_schema_inited = False


def _get_db() -> sqlite3.Connection:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_schema() -> None:
    """Idempotent schema initialisation (platform plugin-runtime-idempotent.v1 standard)."""
    global _schema_inited
    if _schema_inited:
        return
    with _init_lock:
        if _schema_inited:
            return
        conn = _get_db()
        try:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS runs (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id         TEXT    NOT NULL,
                    instrument      TEXT    NOT NULL DEFAULT 'guitar',
                    mode            TEXT    NOT NULL DEFAULT 'freestyle',
                    bpm             REAL    NOT NULL DEFAULT 120.0,
                    score           INTEGER NOT NULL DEFAULT 0,
                    duration_ms     INTEGER NOT NULL DEFAULT 0,
                    avg_timing_error_ms REAL DEFAULT NULL,
                    patterns_survived INTEGER NOT NULL DEFAULT 0,
                    modifiers       TEXT    DEFAULT NULL,
                    summary_html    TEXT    DEFAULT NULL,
                    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                );

                CREATE INDEX IF NOT EXISTS idx_runs_user_created
                    ON runs(user_id, created_at DESC);
            """)
            conn.commit()
            _schema_inited = True
            logger.info("bongocat: schema initialised at %s", DB_PATH)
        except Exception as exc:
            logger.error("bongocat: schema init failed: %s", exc)
            raise
        finally:
            conn.close()


@_router.get("/runs/latest")
def get_latest_run(user_id: str) -> Response:
    """Return the most recent run for a user, or 204 No Content."""
    init_schema()
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT instrument, mode, bpm, score, duration_ms, "
            "       avg_timing_error_ms, patterns_survived, summary_html, created_at "
            "FROM runs WHERE user_id = ? "
            "ORDER BY created_at DESC LIMIT 1",
            (user_id,),
        ).fetchone()

        if row is None:
            return Response(status_code=204)

        return Response(
            content=json.dumps(dict(row)),
            media_type="application/json",
            status_code=200,
        )
    finally:
        conn.close()


def setup(app, ctx) -> None:
    """Host entry point: mount this plugin's routes (host plugin contract —
    a routes.py without setup() loads but registers nothing)."""
    init_schema()
    app.include_router(_router)


@_router.post("/runs")
async def save_run(request: Request) -> Response:
    """Persist a completed run."""
    init_schema()
    body = await request.json()
    conn = _get_db()
    try:
        conn.execute(
            "INSERT INTO runs (user_id, instrument, mode, bpm, score, "
            "                  duration_ms, avg_timing_error_ms, "
            "                  patterns_survived, modifiers, summary_html) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                body["user_id"],
                body.get("instrument", "guitar"),
                body.get("mode", "freestyle"),
                body.get("bpm", 120.0),
                body.get("score", 0),
                body.get("duration_ms", 0),
                body.get("avg_timing_error_ms"),
                body.get("patterns_survived", 0),
                json.dumps(body.get("modifiers")) if body.get("modifiers") else None,
                body.get("summary_html"),
            ),
        )
        conn.commit()
        return Response(
            content=json.dumps({"status": "ok"}),
            media_type="application/json",
            status_code=201,
        )
    finally:
        conn.close()