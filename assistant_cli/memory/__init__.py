"""File memory: an always-current index of the user's files.

    MemoryStore     — SQLite index of file metadata (name, path, category, …)
    FileWatcher     — fills the index with a scan, then keeps it live
    extract_text    — readable text from PDFs, Word, PowerPoint, text files…
    ContextBuilder  — turns the index into prompt context for the model
"""

from assistant_cli.memory.categories import CATEGORIES, categorize
from assistant_cli.memory.context import ContextBuilder
from assistant_cli.memory.extract import CONTENT_EXTENSIONS, extract_text
from assistant_cli.memory.store import MemoryStore
from assistant_cli.memory.watcher import FileWatcher

__all__ = [
    "CATEGORIES", "CONTENT_EXTENSIONS", "categorize", "ContextBuilder",
    "extract_text", "FileWatcher", "MemoryStore",
]
