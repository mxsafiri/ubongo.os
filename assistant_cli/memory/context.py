"""Turn the file index into system-prompt context for the model."""

import re
from pathlib import Path
from typing import Optional

from assistant_cli.memory.store import MemoryStore

_STOPWORDS = {
    "a", "an", "and", "are", "can", "do", "file", "files", "find", "for", "from", "get", "have",
    "i", "in", "is", "it", "me", "my", "of", "on", "open", "please", "show", "that", "the", "this",
    "to", "what", "where", "which", "with", "you",
}


def _home_relative(path: str) -> str:
    home = str(Path.home())
    return "~" + path[len(home):] if path.startswith(home) else path


def _size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def _keywords(text: str) -> list[str]:
    words = re.findall(r"[\w.-]+", text.lower())
    return [w for w in words if len(w) > 2 and w not in _STOPWORDS][:6]


class ContextBuilder:
    def __init__(self, store: MemoryStore):
        self.store = store

    def build_compact_context(self) -> str:
        """A few lines: how many files, by kind, and what changed lately."""
        stats = self.store.get_stats()
        total = stats.get("total_files", 0)
        if not total:
            return "File index: empty (still scanning, or no user folders found)."
        cats = ", ".join(f"{n} {c}" for c, n in list(stats["categories"].items())[:6])
        lines = [f"File index: {total} files ({cats}). Use memory_search to find files."]
        recent = self.store.recent(5)
        if recent:
            lines.append("Recently modified: " + "; ".join(
                f"{f['name']} ({_home_relative(f['parent_dir'])})" for f in recent
            ))
        return "\n".join(lines)

    def build_system_context(self, user_query: Optional[str] = None) -> str:
        """Compact context plus the files most likely relevant to the request."""
        parts = [self.build_compact_context()]
        if user_query and self.store.count:
            seen: set[str] = set()
            matches: list[dict] = []
            for word in _keywords(user_query):
                for f in self.store.search(query=word, limit=5):
                    if f["path"] not in seen:
                        seen.add(f["path"])
                        matches.append(f)
            if matches:
                parts.append("Files that may be relevant:")
                parts += [
                    f"- {_home_relative(f['path'])} ({_size(f['size_bytes'])}, modified {f['modified'][:10]})"
                    for f in matches[:12]
                ]
        return "\n".join(parts)
