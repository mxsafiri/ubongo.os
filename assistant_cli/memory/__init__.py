"""File memory: an always-current index of the user's files.

    MemoryStore     — SQLite index of file metadata (name, path, category, …)
    FileWatcher     — fills the index with a scan, then keeps it live
    ContextBuilder  — turns the index into prompt context for the model
"""

from assistant_cli.memory.categories import CATEGORIES, categorize
from assistant_cli.memory.context import ContextBuilder
from assistant_cli.memory.store import MemoryStore
from assistant_cli.memory.watcher import FileWatcher

__all__ = ["CATEGORIES", "categorize", "ContextBuilder", "FileWatcher", "MemoryStore"]
