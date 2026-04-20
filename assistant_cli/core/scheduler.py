"""
Scheduler — Ubongo's cron tier.

Persists recurring jobs so the agent can wake up on its own. A job
is just (name, prompt, interval, tier); the caller decides how often
to `tick()` the scheduler and what to do with each due job.

Design choices
--------------
* Stdlib SQLite at ~/.ubongo/memory/scheduler.db. No croniter, no APS,
  no daemon deps. Keeps the desktop bundle lean.
* Interval-based for now (seconds). Full cron expressions are a
  follow-up — this module's API hides the scheduling primitive so the
  upgrade is local.
* Stateless ticks: `due_jobs(now)` is pure. The caller (a background
  thread in the sidecar, or a future cron channel) is responsible for
  running the job and calling `mark_run`.
* Every job carries a sandbox tier. Jobs run without a human present,
  so UNTRUSTED is the sane default — whoever registers the job has to
  opt into elevated access.
"""
from __future__ import annotations
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional


_DEFAULT_DB_NAME = "scheduler.db"


@dataclass
class Job:
    id:               int
    name:             str
    prompt:           str
    interval_seconds: int
    tier:             str               # "trusted" | "review" | "untrusted"
    enabled:          bool
    next_run_at:      float
    last_run_at:      Optional[float]
    created_at:       float

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "name":             self.name,
            "prompt":           self.prompt,
            "interval_seconds": self.interval_seconds,
            "tier":             self.tier,
            "enabled":          self.enabled,
            "next_run_at":      self.next_run_at,
            "last_run_at":      self.last_run_at,
            "created_at":       self.created_at,
        }


class Scheduler:
    """Persistent job store for recurring agent turns."""

    def __init__(self, root: Optional[Path] = None):
        root = root or (Path.home() / ".ubongo" / "memory")
        root.mkdir(parents=True, exist_ok=True)
        self.db_path = root / _DEFAULT_DB_NAME
        self._conn: Optional[sqlite3.Connection] = None
        self._ensure_schema()

    # ── writes ───────────────────────────────────────────────────────

    def add_job(
        self,
        name:             str,
        prompt:           str,
        *,
        interval_seconds: int,
        tier:             str   = "untrusted",
        start_offset:     float = 0.0,
    ) -> Job:
        """
        Register a recurring job. `start_offset` is seconds from now
        until the first run (default: run on the next tick).
        """
        name   = name.strip()
        prompt = prompt.strip()
        if not name:
            raise ValueError("Scheduler.add_job requires a non-empty name.")
        if not prompt:
            raise ValueError("Scheduler.add_job requires a non-empty prompt.")
        if interval_seconds <= 0:
            raise ValueError("interval_seconds must be > 0.")

        now  = time.time()
        next_at = now + max(0.0, start_offset)

        cur = self._db().execute(
            "INSERT INTO jobs "
            "(name, prompt, interval_seconds, tier, enabled, next_run_at, last_run_at, created_at) "
            "VALUES (?, ?, ?, ?, 1, ?, NULL, ?)",
            (name, prompt, interval_seconds, tier, next_at, now),
        )
        self._db().commit()
        return Job(
            id               = cur.lastrowid,
            name             = name,
            prompt           = prompt,
            interval_seconds = interval_seconds,
            tier             = tier,
            enabled          = True,
            next_run_at      = next_at,
            last_run_at      = None,
            created_at       = now,
        )

    def remove_job(self, job_id: int) -> bool:
        cur = self._db().execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        self._db().commit()
        return cur.rowcount > 0

    def set_enabled(self, job_id: int, enabled: bool) -> bool:
        cur = self._db().execute(
            "UPDATE jobs SET enabled = ? WHERE id = ?",
            (1 if enabled else 0, job_id),
        )
        self._db().commit()
        return cur.rowcount > 0

    def mark_run(self, job_id: int, *, now: Optional[float] = None) -> bool:
        """
        Record that a job just ran. Advances next_run_at by one interval
        from the supplied `now` (default: wall clock).
        """
        ts = time.time() if now is None else now
        row = self._db().execute(
            "SELECT interval_seconds FROM jobs WHERE id = ?", (job_id,)
        ).fetchone()
        if not row:
            return False

        interval = int(row[0])
        cur = self._db().execute(
            "UPDATE jobs SET last_run_at = ?, next_run_at = ? WHERE id = ?",
            (ts, ts + interval, job_id),
        )
        self._db().commit()
        return cur.rowcount > 0

    # ── reads ────────────────────────────────────────────────────────

    def list_jobs(self, *, enabled_only: bool = False) -> List[Job]:
        sql = (
            "SELECT id, name, prompt, interval_seconds, tier, enabled, "
            "next_run_at, last_run_at, created_at FROM jobs"
        )
        if enabled_only:
            sql += " WHERE enabled = 1"
        sql += " ORDER BY next_run_at ASC"
        rows = self._db().execute(sql).fetchall()
        return [self._row_to_job(r) for r in rows]

    def due_jobs(self, *, now: Optional[float] = None) -> List[Job]:
        """Jobs whose next_run_at <= now AND are enabled."""
        ts = time.time() if now is None else now
        rows = self._db().execute(
            "SELECT id, name, prompt, interval_seconds, tier, enabled, "
            "next_run_at, last_run_at, created_at FROM jobs "
            "WHERE enabled = 1 AND next_run_at <= ? "
            "ORDER BY next_run_at ASC",
            (ts,),
        ).fetchall()
        return [self._row_to_job(r) for r in rows]

    def count(self) -> int:
        row = self._db().execute("SELECT COUNT(*) FROM jobs").fetchone()
        return int(row[0]) if row else 0

    # ── internals ────────────────────────────────────────────────────

    def _db(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(str(self.db_path))
            self._conn.execute("PRAGMA journal_mode = WAL")
        return self._conn

    def _ensure_schema(self) -> None:
        self._db().executescript(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                name              TEXT    NOT NULL,
                prompt            TEXT    NOT NULL,
                interval_seconds  INTEGER NOT NULL,
                tier              TEXT    NOT NULL DEFAULT 'untrusted',
                enabled           INTEGER NOT NULL DEFAULT 1,
                next_run_at       REAL    NOT NULL,
                last_run_at       REAL,
                created_at        REAL    NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_jobs_next_run ON jobs(next_run_at ASC);
            """
        )
        self._db().commit()

    @staticmethod
    def _row_to_job(row) -> Job:
        return Job(
            id               = row[0],
            name             = row[1],
            prompt           = row[2],
            interval_seconds = row[3],
            tier             = row[4],
            enabled          = bool(row[5]),
            next_run_at      = row[6],
            last_run_at      = row[7],
            created_at       = row[8],
        )

    def close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except sqlite3.Error:
                pass
            self._conn = None
