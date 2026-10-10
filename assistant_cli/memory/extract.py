"""Pull readable text out of documents so Ubongo can search and summarise them.

Text, Markdown, CSV and HTML are read directly. Word, PowerPoint, Excel and
OpenDocument files are zip archives of XML, read with the standard library.
PDFs use pypdf when it's installed. Anything else returns None.
"""

import html
import re
import zipfile
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree

MAX_FILE_BYTES = 25 * 1024 * 1024   # skip anything bigger
MAX_CHARS = 200_000                 # keep at most this much text per file

_PLAIN = {".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".log", ".rtf", ".tex"}
_HTML = {".html", ".htm"}
_OFFICE = {".docx", ".pptx", ".xlsx", ".odt", ".odp", ".ods"}

#: Extensions whose text gets indexed for content search
CONTENT_EXTENSIONS = _PLAIN | _HTML | _OFFICE | {".pdf"}


def extract_text(path: str | Path, max_chars: int = MAX_CHARS) -> Optional[str]:
    """The document's text (whitespace tidied, truncated to max_chars), or
    None if the type isn't supported or the file can't be read."""
    p = Path(path)
    ext = p.suffix.lower()
    if ext not in CONTENT_EXTENSIONS:
        return None
    text: Optional[str]
    try:
        if p.stat().st_size > MAX_FILE_BYTES:
            return None
        if ext in _PLAIN:
            text = p.read_text(encoding="utf-8", errors="replace")
            if ext == ".rtf":
                text = _strip_rtf(text)
        elif ext in _HTML:
            text = _strip_html(p.read_text(encoding="utf-8", errors="replace"))
        elif ext == ".pdf":
            text = _pdf_text(p, max_chars)
        else:
            text = _office_text(p, ext)
    except Exception:
        return None
    if text is None:
        return None
    text = _tidy(text)
    return text[:max_chars] if text else None


# ── Formats ────────────────────────────────────────────────────────────

def _pdf_text(p: Path, max_chars: int) -> Optional[str]:
    try:
        from pypdf import PdfReader
    except ImportError:
        return None
    parts: list[str] = []
    size = 0
    for page in PdfReader(str(p)).pages:
        t = page.extract_text() or ""
        parts.append(t)
        size += len(t)
        if size >= max_chars:
            break
    return "\n\n".join(parts)


# Which XML parts hold the text, and which tags mark paragraphs, per format
_OFFICE_PARTS = {
    ".docx": (r"word/(document|header\d*|footer\d*)\.xml", ("p",)),
    ".pptx": (r"ppt/slides/slide\d+\.xml", ("p",)),
    ".xlsx": (r"xl/sharedStrings\.xml", ("si",)),
    ".odt": (r"content\.xml", ("p", "h")),
    ".odp": (r"content\.xml", ("p", "h")),
    ".ods": (r"content\.xml", ("p", "h")),
}


def _office_text(p: Path, ext: str) -> Optional[str]:
    pattern, para_tags = _OFFICE_PARTS[ext]
    with zipfile.ZipFile(p) as z:
        names = sorted(
            (n for n in z.namelist() if re.fullmatch(pattern, n)),
            key=_natural_key,
        )
        paragraphs: list[str] = []
        for name in names:
            root = ElementTree.fromstring(z.read(name))
            for el in root.iter():
                if _local(el.tag) in para_tags:
                    text = "".join(_texts(el)).strip()
                    if text:
                        paragraphs.append(text)
    return "\n".join(paragraphs)


def _texts(el: ElementTree.Element):
    """Text inside a paragraph, with tabs and line breaks kept as spaces."""
    for node in el.iter():
        tag = _local(node.tag)
        if tag in ("t", "span", "p", "h") and node.text:
            yield node.text
        elif tag in ("tab", "br", "s"):
            yield " "
        if node is not el and tag in ("span",) and node.tail:
            yield node.tail


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _natural_key(name: str):
    return [int(s) if s.isdigit() else s for s in re.split(r"(\d+)", name)]


def _strip_html(text: str) -> str:
    text = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", text)
    text = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h\d|tr)>", "\n", text)
    return html.unescape(re.sub(r"<[^>]+>", " ", text))


def _strip_rtf(text: str) -> str:
    text = re.sub(r"\\par[d]?", "\n", text)
    text = re.sub(r"\\'[0-9a-f]{2}", "", text)
    text = re.sub(r"\\[a-z]+-?\d* ?", "", text)
    return re.sub(r"[{}]", "", text)


def _tidy(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip()
