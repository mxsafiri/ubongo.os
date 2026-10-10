"""Fill the file index with a scan, then keep it live with watchdog.

Only the user's own folders are indexed (Desktop, Documents, Downloads, …),
skipping hidden folders, dependency trees and build output.
"""

import logging
import os
import threading
from pathlib import Path
from typing import Iterable, Iterator, Optional

from assistant_cli.memory.store import MemoryStore, file_record

logger = logging.getLogger("assistant_cli.memory")

DEFAULT_FOLDERS = ("Desktop", "Documents", "Downloads", "Pictures", "Music", "Movies", "Videos", "Projects")

SKIP_DIRS = {
    "node_modules", "__pycache__", "venv", ".venv", "env", "site-packages", "dist", "build",
    "target", ".next", ".git", "Library", "Applications", "$RECYCLE.BIN", "AppData",
}

# Directories that are really files to the user (macOS bundles)
BUNDLE_SUFFIXES = (".app", ".pages", ".numbers", ".key", ".photoslibrary", ".rtfd")

MAX_FILES = 250_000
_BATCH = 2_000


def default_roots() -> list[Path]:
    home = Path.home()
    return [home / f for f in DEFAULT_FOLDERS if (home / f).is_dir()]


def _skipped(name: str) -> bool:
    return name.startswith(".") or name in SKIP_DIRS


def _ignored(path: str, roots: Iterable[Path]) -> bool:
    """True if any part of `path` below its root is hidden or skipped."""
    for root in roots:
        try:
            rel = Path(path).relative_to(root)
        except ValueError:
            continue
        parts = rel.parts
        return any(_skipped(p) for p in parts[:-1]) or (bool(parts) and parts[-1].startswith("."))
    return True


def walk_files(roots: Iterable[Path], limit: int = MAX_FILES) -> Iterator[dict]:
    """Yield a metadata record for every indexable file under `roots`."""
    seen = 0
    stack = [str(r) for r in roots]
    while stack:
        current = stack.pop()
        try:
            entries = list(os.scandir(current))
        except OSError:
            continue
        for e in entries:
            if e.name.startswith("."):
                continue
            try:
                if e.is_dir(follow_symlinks=False):
                    if e.name.endswith(BUNDLE_SUFFIXES):
                        rec = file_record(e.path, e.stat(follow_symlinks=False))
                    elif e.name not in SKIP_DIRS:
                        stack.append(e.path)
                        continue
                    else:
                        continue
                elif e.is_file(follow_symlinks=False):
                    rec = file_record(e.path, e.stat(follow_symlinks=False))
                else:
                    continue
            except OSError:
                continue
            if rec:
                yield rec
                seen += 1
                if seen >= limit:
                    logger.warning("File index capped at %d files", limit)
                    return


class FileWatcher:
    def __init__(self, store: MemoryStore, roots: Optional[Iterable[str | Path]] = None):
        self.store = store
        self.roots = [Path(r).expanduser() for r in roots] if roots is not None else default_roots()
        self._observer = None
        self._scan_lock = threading.Lock()

    @property
    def is_running(self) -> bool:
        return bool(self._observer and self._observer.is_alive())

    def initial_scan(self, replace: bool = True) -> int:
        """Index every file under the roots. With replace, the index ends up
        holding exactly what's on disk now. Returns the number indexed."""
        with self._scan_lock:
            if replace:
                return self.store.replace_all(walk_files(self.roots))
            total, batch = 0, []
            for rec in walk_files(self.roots):
                batch.append(rec)
                if len(batch) >= _BATCH:
                    total += self.store.upsert_many(batch)
                    batch = []
            return total + self.store.upsert_many(batch)

    def start(self) -> bool:
        """Start watching the roots for changes. False if watchdog isn't available."""
        if self.is_running:
            return True
        try:
            from watchdog.observers import Observer
        except ImportError:
            logger.warning("watchdog not installed — file index will only refresh on rescan")
            return False
        observer = Observer()
        handler = _Handler(self.store, self.roots)
        for root in self.roots:
            try:
                observer.schedule(handler, str(root), recursive=True)
            except OSError as e:
                logger.warning("Can't watch %s: %s", root, e)
        observer.daemon = True
        observer.start()
        self._observer = observer
        return True

    def stop(self) -> None:
        if self._observer:
            self._observer.stop()
            self._observer.join(timeout=5)
            self._observer = None


try:
    from watchdog.events import FileSystemEventHandler as _Base
except ImportError:  # watcher degrades to scan-only
    _Base = object


class _Handler(_Base):
    def __init__(self, store: MemoryStore, roots: list[Path]):
        super().__init__()
        self.store = store
        self.roots = roots

    def _index(self, path: str) -> None:
        if _ignored(path, self.roots):
            return
        if os.path.isdir(path) and not path.endswith(BUNDLE_SUFFIXES):
            self.store.upsert_many(walk_files([Path(path)]))
            return
        rec = file_record(path)
        if rec:
            self.store.upsert(rec)

    def on_created(self, event):
        self._index(event.src_path)

    def on_modified(self, event):
        if not event.is_directory:
            self._index(event.src_path)

    def on_deleted(self, event):
        self.store.remove(event.src_path)

    def on_moved(self, event):
        self.store.remove(event.src_path)
        self._index(event.dest_path)
