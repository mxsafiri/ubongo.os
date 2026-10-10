"""Tests for the file memory index (assistant_cli.memory)."""

import os
import time

from assistant_cli.memory import ContextBuilder, FileWatcher, MemoryStore, categorize


def _touch(path, data=b"x", age_days=0):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    if age_days:
        t = time.time() - age_days * 86400
        os.utime(path, (t, t))
    return path


def _setup(tmp_path):
    root = tmp_path / "Documents"
    _touch(root / "Budget 2026.xlsx", b"1234")
    _touch(root / "reports" / "q3_report.pdf", b"pdf", age_days=40)
    _touch(root / "photos" / "beach.JPG")
    _touch(root / "node_modules" / "lib.js")
    _touch(root / ".hidden" / "secret.txt")
    _touch(root / ".DS_Store")
    store = MemoryStore(tmp_path / "files.db")
    watcher = FileWatcher(store, roots=[root])
    return root, store, watcher


def test_categorize():
    assert categorize("a.PDF") == "document"
    assert categorize("a.xlsx") == "spreadsheet"
    assert categorize("Thing.app") == "application"
    assert categorize("noext") == "other"


def test_scan_skips_hidden_and_dependencies(tmp_path):
    _, store, watcher = _setup(tmp_path)
    assert store.count == 0
    assert watcher.initial_scan(replace=True) == 3
    assert store.count == 3
    names = {f["name"] for f in store.search(limit=50)}
    assert names == {"Budget 2026.xlsx", "q3_report.pdf", "beach.JPG"}


def test_rescan_replaces(tmp_path):
    root, store, watcher = _setup(tmp_path)
    watcher.initial_scan(replace=True)
    (root / "photos" / "beach.JPG").unlink()
    assert watcher.initial_scan(replace=True) == 2
    assert store.count == 2


def test_search_filters(tmp_path):
    root, store, watcher = _setup(tmp_path)
    watcher.initial_scan()

    [hit] = store.search(query="budget")
    assert hit["path"] == str(root / "Budget 2026.xlsx")
    assert hit["size_bytes"] == 4
    assert hit["category"] == "spreadsheet"
    assert store.search(query="REPORT q3")[0]["name"] == "q3_report.pdf"
    assert store.search(query="reports")[0]["name"] == "q3_report.pdf"  # path match
    assert [f["name"] for f in store.search(category="image")] == ["beach.JPG"]
    assert [f["name"] for f in store.search(extension="pdf")] == ["q3_report.pdf"]
    assert [f["name"] for f in store.search(extension=".jpg")] == ["beach.JPG"]
    assert {f["name"] for f in store.search(modified_within_days=7)} == {"Budget 2026.xlsx", "beach.JPG"}
    assert [f["name"] for f in store.search(parent_dir=str(root / "reports"))] == ["q3_report.pdf"]
    assert store.search(query="100%_") == []
    assert len(store.search(limit=1)) == 1


def test_stats_and_prune(tmp_path):
    root, store, watcher = _setup(tmp_path)
    watcher.initial_scan()
    stats = store.get_stats()
    assert stats["total_files"] == 3
    assert stats["categories"] == {"spreadsheet": 1, "document": 1, "image": 1}

    (root / "Budget 2026.xlsx").unlink()
    assert store.prune_deleted() == 1
    assert store.count == 2


def test_remove_directory(tmp_path):
    root, store, watcher = _setup(tmp_path)
    watcher.initial_scan()
    store.remove(root / "reports")
    assert store.search(query="q3") == []
    assert store.count == 2


def test_context(tmp_path):
    _, store, watcher = _setup(tmp_path)
    ctx = ContextBuilder(store)
    assert "empty" in ctx.build_compact_context()
    watcher.initial_scan()
    compact = ctx.build_compact_context()
    assert "3 files" in compact
    full = ctx.build_system_context(user_query="where is my budget spreadsheet?")
    assert "Budget 2026.xlsx" in full


def test_watcher_follows_changes(tmp_path):
    root, store, watcher = _setup(tmp_path)
    watcher.initial_scan()
    if not watcher.start():
        return  # watchdog not installed
    try:
        assert watcher.is_running
        _touch(root / "new_notes.md")
        (root / "photos" / "beach.JPG").unlink()
        deadline = time.time() + 5
        while time.time() < deadline:
            if store.search(query="new_notes") and not store.search(query="beach"):
                break
            time.sleep(0.1)
        assert store.search(query="new_notes")
        assert not store.search(query="beach")
    finally:
        watcher.stop()
    assert not watcher.is_running
