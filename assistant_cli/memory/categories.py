"""Extension → category, matching the memory_search tool's category enum."""

from pathlib import Path

_EXTENSIONS: dict[str, tuple[str, ...]] = {
    "document": (".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".odt", ".pages", ".tex", ".epub"),
    "spreadsheet": (".xls", ".xlsx", ".csv", ".tsv", ".ods", ".numbers"),
    "presentation": (".ppt", ".pptx", ".key", ".odp"),
    "image": (".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".webp", ".heic", ".svg", ".ico", ".raw"),
    "video": (".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".webm", ".m4v"),
    "audio": (".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a", ".wma", ".aiff"),
    "archive": (".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".tgz"),
    "code": (
        ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs",
        ".rb", ".php", ".swift", ".kt", ".sh", ".html", ".css", ".scss", ".json", ".yaml", ".yml",
        ".toml", ".sql", ".ipynb", ".xml",
    ),
    "design": (".psd", ".ai", ".sketch", ".fig", ".xd", ".indd", ".eps"),
    "application": (".app", ".dmg", ".pkg", ".exe", ".msi", ".deb", ".appimage"),
}

CATEGORIES: list[str] = [*_EXTENSIONS, "other"]

_BY_EXTENSION = {ext: cat for cat, exts in _EXTENSIONS.items() for ext in exts}


def categorize(path: str | Path) -> str:
    return _BY_EXTENSION.get(Path(path).suffix.lower(), "other")
