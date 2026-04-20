"""
Semantic Memory — the "what do I retain vs. forget" tier.

The three memory tiers in Ubongo:

  short-term  →  last N conversation turns (held in ConversationEngine)
  semantic    →  facts the agent learned across sessions (this module)
  episodic    →  daily markdown notes at ~/.ubongo/memory/YYYY-MM-DD.md
                 (this module writes them; the model reads on demand)

Design choices
--------------
* Pure stdlib SQLite. No extra deps, no embedding model to pin, works on
  every platform the CLI targets.
* Stored at ~/.ubongo/memory/semantic.db.
* Hybrid keyword scoring: recall ranks facts by how many query tokens
  appear (case-insensitive), breaking ties by recency. Good enough for
  an agent that also reads MEMORY.md every turn; vector search can be
  added later as an optional dep.
* The API is small on purpose: save / recall / forget. That's what the
  three tools the model sees correspond to.
"""
from __future__ import annotations
import re
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional


_DEFAULT_DB_NAME = "semantic.db"
_TOKEN_RE       = re.compile(r"[a-z0-9]+")


@dataclass
class Fact:
    id:         int
    text:       str
    tags:       str
    source:     str
    created_at: float

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "text":       self.text,
            "tags":       self.tags,
            "source":     self.source,
            "created_at": self.created_at,
            "created_iso": datetime.fromtimestamp(self.created_at).isoformat(timespec="seconds"),
        }


# ── public API ─────────────────────────────────────────────────────────

class SemanticMemory:
    """A tiny, dependency-free fact store for cross-session recall."""

    def __init__(self, root: Optional[Path] = None):
        root = root or (Path.home() / ".ubongo" / "memory")
        root.mkdir(parents=True, exist_ok=True)
        self.db_path = root / _DEFAULT_DB_NAME
        self._conn: Optional[sqlite3.Connection] = None
        self._ensure_schema()

    # ── writes ────────────────────────────────────────────────────────

    def save(self, text: str, *, tags: str = "", source: str = "") -> Fact:
        """Store a new fact. Returns the saved row (with id)."""
        clean = text.strip()
        if not clean:
            raise ValueError("Cannot save an empty fact.")

        now = time.time()
        cur = self._db().execute(
            "INSERT INTO facts (text, tags, source, created_at) VALUES (?, ?, ?, ?)",
            (clean, tags.strip(), source.strip(), now),
        )
        self._db().commit()
        return Fact(
            id         = cur.lastrowid,
            text       = clean,
            tags       = tags.strip(),
            source     = source.strip(),
            created_at = now,
        )

    def forget(self, fact_id: int) -> bool:
        """Delete a fact by id. Returns True if a row was removed."""
        cur = self._db().execute("DELETE FROM facts WHERE id = ?", (fact_id,))
        self._db().commit()
        return cur.rowcount > 0

    # ── reads ────────────────────────────────────────────────────────

    def recall(self, query: str, *, limit: int = 8) -> List[Fact]:
        """
        Return the top-matching facts.

        Scoring = number of distinct query tokens that appear in the fact
        text OR tags (case-insensitive). Ties broken by recency. An empty
        query returns the most recently saved facts.
        """
        limit = max(1, min(limit, 100))
        rows = self._db().execute(
            "SELECT id, text, tags, source, created_at FROM facts"
        ).fetchall()

        all_facts = [Fact(*row) for row in rows]

        tokens = _tokenize(query)
        if not tokens:
            return sorted(all_facts, key=lambda f: f.created_at, reverse=True)[:limit]

        scored: List[tuple[int, float, Fact]] = []
        for f in all_facts:
            haystack = f"{f.text}\n{f.tags}".lower()
            score = sum(1 for t in tokens if t in haystack)
            if score > 0:
                scored.append((score, f.created_at, f))

        scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
        return [f for _, _, f in scored[:limit]]

    def all(self, *, limit: int = 100) -> List[Fact]:
        rows = self._db().execute(
            "SELECT id, text, tags, source, created_at FROM facts "
            "ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [Fact(*row) for row in rows]

    def count(self) -> int:
        row = self._db().execute("SELECT COUNT(*) FROM facts").fetchone()
        return int(row[0]) if row else 0

    # ── internals ────────────────────────────────────────────────────

    def _db(self) -> sqlite3.Connection:
        if self._conn is None:
            # check_same_thread=False so the sidecar's worker-thread
            # pool can recall/save across requests. SQLite itself
            # serialises access; WAL lets readers run concurrently.
            self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
            self._conn.execute("PRAGMA journal_mode = WAL")
        return self._conn

    def _ensure_schema(self) -> None:
        self._db().executescript(
            """
            CREATE TABLE IF NOT EXISTS facts (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                text       TEXT    NOT NULL,
                tags       TEXT    NOT NULL DEFAULT '',
                source     TEXT    NOT NULL DEFAULT '',
                created_at REAL    NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_facts_created_at ON facts(created_at DESC);
            """
        )
        self._db().commit()

    def close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except sqlite3.Error:
                pass
            self._conn = None


# ── episodic log (daily markdown notes) ───────────────────────────────

def append_daily_note(body: str, *, root: Optional[Path] = None) -> Path:
    """
    Append an entry to today's episodic note at ~/.ubongo/memory/YYYY-MM-DD.md.

    Each entry is timestamped and separated by a blank line. The model
    can choose to read these via a file tool when recalling "what did we
    do yesterday?" — we don't inject them into the prompt by default.
    """
    root = root or (Path.home() / ".ubongo" / "memory")
    root.mkdir(parents=True, exist_ok=True)

    today = datetime.now().strftime("%Y-%m-%d")
    path  = root / f"{today}.md"

    stamp = datetime.now().strftime("%H:%M:%S")
    entry = f"- `{stamp}` {body.strip()}\n"

    if not path.exists():
        path.write_text(f"# {today}\n\n{entry}", encoding="utf-8")
    else:
        with path.open("a", encoding="utf-8") as f:
            f.write(entry)
    return path


# ── helpers ───────────────────────────────────────────────────────────

def _tokenize(query: str) -> List[str]:
    return _TOKEN_RE.findall(query.lower())
