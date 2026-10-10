"""SQLite index of file metadata, plus a full-text index of document contents.

One row per file: name, path, extension, category, size and modified time.
Documents' text goes into an FTS5 table so search can match what files *say*,
not only what they're called. Thread-safe: the scanner, the watcher and
request handlers share one store.
"""

import os
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional

from assistant_cli.memory.categories import categorize

_SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
    path        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    extension   TEXT NOT NULL,
    category    TEXT NOT NULL,
    size_bytes  INTEGER NOT NULL,
    modified    REAL NOT NULL,
    parent_dir  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS files_name ON files (name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS files_category ON files (category);
CREATE INDEX IF NOT EXISTS files_modified ON files (modified);
-- Which version of each file's text is indexed (body NULL = no text in it)
CREATE TABLE IF NOT EXISTS content_state (
    path        TEXT PRIMARY KEY,
    modified    REAL NOT NULL
);
"""

_FTS_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS contents USING fts5(
    path UNINDEXED, body, tokenize = 'unicode61 remove_diacritics 2'
);
"""

_COLUMNS = ("path", "name", "extension", "category", "size_bytes", "modified", "parent_dir")


def file_record(path: str | Path, stat: Optional[os.stat_result] = None) -> Optional[dict]:
    """Metadata row for a file, or None if it can't be read."""
    p = Path(path)
    try:
        st = stat or p.stat()
    except OSError:
        return None
    return {
        "path": str(p),
        "name": p.name,
        "extension": p.suffix.lower(),
        "category": categorize(p),
        "size_bytes": int(st.st_size),
        "modified": float(st.st_mtime),
        "parent_dir": str(p.parent),
    }


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["modified"] = datetime.fromtimestamp(d["modified"]).isoformat(timespec="seconds")
    return d


class MemoryStore:
    def __init__(self, db_path: Optional[str | Path] = None):
        if db_path is None:
            from assistant_cli.config import settings
            settings.memory_dir.mkdir(parents=True, exist_ok=True)
            db_path = settings.memory_dir / "files.db"
        self.db_path = Path(db_path)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.executescript(_SCHEMA)
            try:
                self._conn.executescript(_FTS_SCHEMA)
                self.content_search = True
            except sqlite3.OperationalError:
                # SQLite built without FTS5: name search still works
                self.content_search = False
            self._conn.commit()

    # ── Writes ─────────────────────────────────────────────────────────
    def upsert(self, record: dict) -> None:
        self.upsert_many([record])

    def upsert_many(self, records: Iterable[dict]) -> int:
        rows = [tuple(r[c] for c in _COLUMNS) for r in records]
        if not rows:
            return 0
        with self._lock:
            self._conn.executemany(
                f"INSERT OR REPLACE INTO files ({', '.join(_COLUMNS)}) VALUES ({', '.join('?' * len(_COLUMNS))})",
                rows,
            )
            self._conn.commit()
        return len(rows)

    def replace_all(self, records: Iterable[dict]) -> int:
        """Swap the whole index for `records` in one transaction."""
        rows = [tuple(r[c] for c in _COLUMNS) for r in records]
        with self._lock:
            with self._conn:
                self._conn.execute("DELETE FROM files")
                self._conn.executemany(
                    f"INSERT OR REPLACE INTO files ({', '.join(_COLUMNS)}) VALUES ({', '.join('?' * len(_COLUMNS))})",
                    rows,
                )
                self._drop_orphan_content()
        return len(rows)

    def remove(self, path: str | Path) -> None:
        """Forget a file, or everything under a directory."""
        p = str(path)
        with self._lock:
            args = (p, _like_prefix(p.rstrip(os.sep) + os.sep))
            for table in self._path_tables():
                self._conn.execute(f"DELETE FROM {table} WHERE path = ? OR path LIKE ? ESCAPE '\\'", args)
            self._conn.commit()

    def prune_deleted(self) -> int:
        """Drop rows whose files no longer exist. Returns how many were removed."""
        with self._lock:
            paths = [r[0] for r in self._conn.execute("SELECT path FROM files")]
        gone = [(p,) for p in paths if not os.path.exists(p)]
        if gone:
            with self._lock:
                for table in self._path_tables():
                    self._conn.executemany(f"DELETE FROM {table} WHERE path = ?", gone)
                self._conn.commit()
        return len(gone)

    # ── Document text ──────────────────────────────────────────────────
    def set_content(self, path: str, modified: float, text: Optional[str]) -> None:
        """Store a file's text (None = it has none), replacing older text."""
        with self._lock:
            if self.content_search:
                self._conn.execute("DELETE FROM contents WHERE path = ?", (path,))
                if text:
                    self._conn.execute("INSERT INTO contents (path, body) VALUES (?, ?)", (path, text))
            self._conn.execute(
                "INSERT OR REPLACE INTO content_state (path, modified) VALUES (?, ?)", (path, modified)
            )
            self._conn.commit()

    def pending_content(self, extensions: Iterable[str], limit: int = 500) -> list[tuple[str, float]]:
        """Indexed files of these types whose current version has no text indexed yet."""
        exts = list(extensions)
        if not exts or not self.content_search:
            return []
        sql = (
            "SELECT f.path, f.modified FROM files f LEFT JOIN content_state c ON c.path = f.path "
            f"WHERE f.extension IN ({', '.join('?' * len(exts))}) "
            "AND (c.modified IS NULL OR c.modified != f.modified) "
            "ORDER BY f.modified DESC LIMIT ?"
        )
        with self._lock:
            return [(r[0], r[1]) for r in self._conn.execute(sql, [*exts, limit])]

    def _path_tables(self) -> list[str]:
        return ["files", "content_state"] + (["contents"] if self.content_search else [])

    def _drop_orphan_content(self) -> None:
        self._conn.execute("DELETE FROM content_state WHERE path NOT IN (SELECT path FROM files)")
        if self.content_search:
            self._conn.execute("DELETE FROM contents WHERE path NOT IN (SELECT path FROM files)")

    # ── Reads ──────────────────────────────────────────────────────────
    @property
    def count(self) -> int:
        with self._lock:
            return int(self._conn.execute("SELECT COUNT(*) FROM files").fetchone()[0])

    def search(
        self,
        query: Optional[str] = None,
        category: Optional[str] = None,
        extension: Optional[str] = None,
        modified_within_days: Optional[int] = None,
        parent_dir: Optional[str] = None,
        limit: int = 30,
    ) -> list[dict]:
        """Find files. Every word of `query` must appear in the name or path,
        or (for documents) in the text. Name matches come first, newest first;
        then content matches, best first, each with a `snippet` of the text."""
        limit = max(1, int(limit or 30))
        filters, fargs = _filters(category, extension, modified_within_days, parent_dir)
        words = (query or "").lower().split()

        where = [f.replace("{t}", "") for f in filters]
        args = list(fargs)
        for w in words:
            where.append("(LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(path) LIKE ? ESCAPE '\\')")
            pat = f"%{_escape_like(w)}%"
            args += [pat, pat]
        order = "modified DESC"
        if words:
            name_hits = " + ".join(["(LOWER(name) LIKE ? ESCAPE '\\')"] * len(words))
            order = f"({name_hits}) DESC, {order}"
        order_args = [f"%{_escape_like(w)}%" for w in words]
        sql = (
            "SELECT * FROM files"
            + (f" WHERE {' AND '.join(where)}" if where else "")
            + f" ORDER BY {order} LIMIT ?"
        )
        with self._lock:
            rows = self._conn.execute(sql, [*args, *order_args, limit]).fetchall()
        results = [{**_row_to_dict(r), "match": "name"} for r in rows]

        if words and self.content_search and len(results) < limit:
            seen = {r["path"] for r in results}
            for r in self._content_matches(words, filters, fargs, limit):
                if r["path"] not in seen and len(results) < limit:
                    results.append(r)
        return results

    def _content_matches(self, words: list[str], filters: list[str], fargs: list, limit: int) -> list[dict]:
        # Every word must appear; words of 3+ letters also match as prefixes
        terms = [f'"{w.replace(chr(34), chr(34) * 2)}"' + ("*" if len(w) >= 3 else "") for w in words]
        where = ["contents MATCH ?"] + [f.replace("{t}", "f.") for f in filters]
        sql = (
            "SELECT f.*, snippet(contents, 1, '«', '»', '…', 14) AS snippet "
            "FROM contents JOIN files f ON f.path = contents.path "
            f"WHERE {' AND '.join(where)} ORDER BY bm25(contents) LIMIT ?"
        )
        try:
            with self._lock:
                rows = self._conn.execute(sql, [" ".join(terms), *fargs, limit]).fetchall()
        except sqlite3.OperationalError:
            return []
        return [{**_row_to_dict(r), "match": "content"} for r in rows]

    def recent(self, limit: int = 10) -> list[dict]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM files ORDER BY modified DESC LIMIT ?", (limit,)).fetchall()
        return [_row_to_dict(r) for r in rows]

    def get_stats(self) -> dict:
        with self._lock:
            total, size = self._conn.execute("SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM files").fetchone()
            cats = self._conn.execute(
                "SELECT category, COUNT(*) FROM files GROUP BY category ORDER BY COUNT(*) DESC"
            ).fetchall()
            newest = self._conn.execute("SELECT MAX(modified) FROM files").fetchone()[0]
            with_text = (
                self._conn.execute("SELECT COUNT(*) FROM contents").fetchone()[0] if self.content_search else 0
            )
        return {
            "total_files": total,
            "total_size_bytes": size,
            "categories": {c: n for c, n in cats},
            "documents_with_text": with_text,
            "last_modified": datetime.fromtimestamp(newest).isoformat(timespec="seconds") if newest else None,
            "db_path": str(self.db_path),
        }

    def close(self) -> None:
        with self._lock:
            self._conn.close()


def _filters(
    category: Optional[str],
    extension: Optional[str],
    modified_within_days: Optional[int],
    parent_dir: Optional[str],
) -> tuple[list[str], list]:
    """WHERE clauses for the non-text filters. `{t}` stands for an optional
    table prefix (stripped for the plain files query)."""
    where: list[str] = []
    args: list = []
    if category:
        where.append("{t}category = ?")
        args.append(category.lower())
    if extension:
        ext = extension.lower()
        where.append("{t}extension = ?")
        args.append(ext if ext.startswith(".") else f".{ext}")
    if modified_within_days is not None:
        where.append("{t}modified >= ?")
        args.append(time.time() - float(modified_within_days) * 86400)
    if parent_dir:
        d = os.path.expanduser(str(parent_dir)).rstrip(os.sep)
        where.append("({t}parent_dir = ? OR {t}path LIKE ? ESCAPE '\\')")
        args += [d, _like_prefix(d + os.sep)]
    return where, args


def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _like_prefix(prefix: str) -> str:
    return f"{_escape_like(prefix)}%"
