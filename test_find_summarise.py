"""Find & summarise: reading inside documents, content search, read_file and
the multi-round agent loop (search → read → answer)."""

import importlib
import os
import sys
import time
import zipfile
from pathlib import Path

import pytest

from assistant_cli.memory import FileWatcher, MemoryStore, extract_text

# ── Building real documents ────────────────────────────────────────────

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
T = 'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'


def make_docx(path: Path, *paragraphs: str) -> Path:
    body = "".join(f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paragraphs)
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("word/document.xml", f"<w:document {W}><w:body>{body}</w:body></w:document>")
    return path


def make_pptx(path: Path, *slides: str) -> Path:
    with zipfile.ZipFile(path, "w") as z:
        # slide10 must come after slide2
        for i, text in enumerate(slides, start=1):
            n = 10 if i == len(slides) and len(slides) > 2 else i
            z.writestr(f"ppt/slides/slide{n}.xml", f"<p:sld {A} xmlns:p='p'><a:p><a:r><a:t>{text}</a:t></a:r></a:p></p:sld>")
    return path


def make_xlsx(path: Path, *cells: str) -> Path:
    si = "".join(f"<si><t>{c}</t></si>" for c in cells)
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("xl/sharedStrings.xml", f"<sst xmlns='x'>{si}</sst>")
    return path


def make_odt(path: Path, heading: str, para: str) -> Path:
    xml = (f"<office:document-content xmlns:office='o' {T}><office:body><office:text>"
           f"<text:h>{heading}</text:h><text:p>Hello <text:span>bold</text:span> world. {para}</text:p>"
           "</office:text></office:body></office:document-content>")
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("content.xml", xml)
    return path


def make_pdf(path: Path, text: str) -> Path:
    stream = f"BT /F1 18 Tf 10 100 Td ({text}) Tj ET".encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 144] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer << /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    path.write_bytes(bytes(out))
    return path


# ── Extraction ─────────────────────────────────────────────────────────

def test_extracts_text_from_each_format(tmp_path):
    assert extract_text(make_docx(tmp_path / "a.docx", "Lease for the Kariakoo shop", "Rent: 450,000 TZS")) == \
        "Lease for the Kariakoo shop\nRent: 450,000 TZS"
    assert extract_text(make_pptx(tmp_path / "b.pptx", "Q3 plan", "Hire two", "Launch NEDApay")) == \
        "Q3 plan\nHire two\nLaunch NEDApay"
    assert extract_text(make_xlsx(tmp_path / "c.xlsx", "Invoice", "DAWASA")) == "Invoice\nDAWASA"
    odt = extract_text(make_odt(tmp_path / "d.odt", "Minutes", "Agreed."))
    assert odt == "Minutes\nHello bold world. Agreed."
    (tmp_path / "e.html").write_text("<html><style>x{}</style><p>Habari &amp; karibu</p><script>no()</script></html>")
    assert extract_text(tmp_path / "e.html") == "Habari & karibu"
    (tmp_path / "f.md").write_text("# Notes\n\n\n\nLine   two")
    assert extract_text(tmp_path / "f.md") == "# Notes\n\nLine two"
    assert "Kariakoo lease signed" in extract_text(make_pdf(tmp_path / "g.pdf", "Kariakoo lease signed"))


def test_extraction_limits_and_unsupported(tmp_path):
    (tmp_path / "long.txt").write_text("x" * 5000)
    assert len(extract_text(tmp_path / "long.txt", max_chars=100)) == 100
    (tmp_path / "pic.png").write_bytes(b"\x89PNG")
    assert extract_text(tmp_path / "pic.png") is None
    (tmp_path / "broken.docx").write_text("not a zip")
    assert extract_text(tmp_path / "broken.docx") is None
    (tmp_path / "empty.txt").write_text("   ")
    assert extract_text(tmp_path / "empty.txt") is None


# ── Content search ─────────────────────────────────────────────────────

def _indexed(tmp_path):
    root = tmp_path / "Documents"
    root.mkdir()
    make_docx(root / "agreement-final.docx", "Lease for the Kariakoo shop", "Landlord: Mzee Juma")
    make_pdf(root / "scan-0042.pdf", "Invoice from DAWASA for October")
    (root / "kariakoo-notes.txt").write_text("market visit")
    (root / "shopping.txt").write_text("milk, bread")
    store = MemoryStore(tmp_path / "files.db")
    watcher = FileWatcher(store, roots=[root])
    watcher.initial_scan()
    return root, store, watcher


def test_finds_documents_by_what_they_say(tmp_path):
    root, store, _ = _indexed(tmp_path)
    assert store.get_stats()["documents_with_text"] == 4

    hits = store.search(query="kariakoo")
    # Name match first, then the document that mentions it
    assert [h["name"] for h in hits] == ["kariakoo-notes.txt", "agreement-final.docx"]
    assert hits[0]["match"] == "name"
    assert hits[1]["match"] == "content"
    assert "«Kariakoo»" in hits[1]["snippet"]

    [pdf] = store.search(query="dawasa invoice")          # every word, any order
    assert pdf["name"] == "scan-0042.pdf"
    assert store.search(query="landl")[0]["name"] == "agreement-final.docx"  # prefix
    assert store.search(query="juma", extension="pdf") == []                 # filters apply
    assert store.search(query='"; DROP TABLE files; --') == []               # safe
    assert store.count == 4


def test_content_follows_edits_and_deletes(tmp_path):
    root, store, watcher = _indexed(tmp_path)
    doc = root / "shopping.txt"
    doc.write_text("sukari and chai")
    t = time.time() + 5
    os.utime(doc, (t, t))
    watcher.initial_scan()
    assert store.search(query="sukari")[0]["name"] == "shopping.txt"
    assert store.search(query="bread") == []

    (root / "scan-0042.pdf").unlink()
    store.prune_deleted()
    assert store.search(query="dawasa") == []
    store.remove(root)
    assert store.get_stats()["documents_with_text"] == 0


def test_existing_index_gets_text_on_start(tmp_path):
    root = tmp_path / "Documents"
    root.mkdir()
    make_docx(root / "old.docx", "Board minutes")
    store = MemoryStore(tmp_path / "files.db")
    watcher = FileWatcher(store, roots=[root])
    # An index built before content search existed: files but no text
    store.replace_all(__import__("assistant_cli.memory.watcher", fromlist=["walk_files"]).walk_files([root]))
    assert store.search(query="minutes") == []
    assert watcher.index_contents() == 1
    assert store.search(query="minutes")[0]["name"] == "old.docx"
    assert watcher.index_contents() == 0   # nothing left to do


def _wait_until_watching(root, store, timeout=10.0):
    """The watcher can miss changes made in the instant after it starts
    (notably on Windows). Rewrite a probe file until it's indexed."""
    probe = root / "watch-probe.txt"
    deadline = time.time() + timeout
    while time.time() < deadline:
        probe.write_text(str(time.time()))
        time.sleep(0.2)
        if store.search(query="watch-probe"):
            return
    raise AssertionError("file watcher never started picking up changes")


def test_watcher_indexes_new_documents_live(tmp_path):
    root, store, watcher = _indexed(tmp_path)
    if not watcher.start():
        pytest.skip("watchdog not installed")
    try:
        _wait_until_watching(root, store)
        make_docx(root / "new.docx", "Supplier contract with Azam")
        deadline = time.time() + 10
        while time.time() < deadline and not store.search(query="azam"):
            time.sleep(0.1)
        assert store.search(query="azam")[0]["name"] == "new.docx"
    finally:
        watcher.stop()


# ── Server: read_file and the search → read → answer loop ──────────────

@pytest.fixture
def server(tmp_path, monkeypatch):
    pytest.importorskip("fastapi")
    pytest.importorskip("uvicorn")
    home = tmp_path / "home"
    (home / "Documents").mkdir(parents=True)
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))
    sys.path.insert(0, str(Path(__file__).parent / "desktop" / "server"))
    try:
        mod = importlib.import_module("server")
    finally:
        sys.path.pop(0)
    store = MemoryStore(tmp_path / "files.db")
    monkeypatch.setattr(mod, "_memory", store)
    monkeypatch.setattr(mod, "_context", None)
    return mod, home, store


def test_read_file_tool(server, tmp_path):
    mod, home, _ = server
    doc = make_docx(home / "Documents" / "lease.docx", "Rent: 450,000 TZS a month")
    ok = mod._read_file_tool({"path": "~/Documents/lease.docx"})
    assert ok.success and "Rent: 450,000 TZS a month" in ok.message
    assert ok.message.startswith(f"File: lease.docx ({os.path.join('~', 'Documents', 'lease.docx')})")

    (home / "Documents" / "big.txt").write_text("y" * 5000)
    cut = mod._read_file_tool({"path": str(home / "Documents" / "big.txt"), "max_chars": 1000})
    assert cut.data["truncated"] and "first 1,000 characters" in cut.message

    outside = tmp_path / "secret.txt"
    outside.write_text("nope")
    assert not mod._read_file_tool({"path": str(outside)}).success
    assert not mod._read_file_tool({"path": "~/../secret.txt"}).success
    assert not mod._read_file_tool({"path": "~/Documents/missing.pdf"}).success
    assert doc.exists()


class _FakeClaude:
    """Scripted Claude: search, then read the first hit, then answer."""

    def __init__(self):
        self.seen_results: list = []

    def is_available(self):
        return True

    def _resp(self, text="", calls=()):
        from assistant_cli.providers.base import AIResponse, ToolCall
        return AIResponse(content=text, tool_calls=[ToolCall(*c) for c in calls],
                          provider_name="fake", model_used="fake")

    def chat_with_tools(self, message, tools, history=None, system_prompt=None):
        assert "read_file" in {t["name"] for t in tools}
        return self._resp(calls=[("t1", "memory_search", {"query": "kariakoo lease"})])

    def continue_with_tools(self, messages, tools, system_prompt=None, model_hint=""):
        last = messages[-1]["content"][0]["content"]
        self.seen_results.append(last)
        if len(self.seen_results) == 1:
            path = next(line.split("→ ")[1] for line in last.splitlines() if "→ " in line)
            return self._resp(calls=[("t2", "read_file", {"path": path.strip()})])
        assert "Rent: 450,000 TZS" in last
        return self._resp(text="agreement.docx: the Kariakoo shop rent is 450,000 TZS a month.")


def test_agent_searches_reads_and_answers(server, monkeypatch):
    mod, home, store = server
    make_docx(home / "Documents" / "agreement.docx", "Lease for the Kariakoo shop", "Rent: 450,000 TZS a month")
    FileWatcher(store, roots=[home / "Documents"]).initial_scan()

    fake = _FakeClaude()
    monkeypatch.setattr(mod, "get_router", lambda: type("R", (), {"get_provider": lambda self: fake})())
    monkeypatch.setattr(mod.settings, "invite_code", "UBONGO-TEST", raising=False)
    monkeypatch.setattr(type(mod.settings), "increment_query_count", lambda self: None)

    out = mod.query_agentic(mod.QueryRequest(message="What does my Kariakoo lease say about rent?"))
    assert [s.tool for s in out.steps] == ["memory_search", "read_file"]
    assert all(s.success for s in out.steps)
    assert "says:" in fake.seen_results[0] and "«Kariakoo»" in fake.seen_results[0]
    assert out.content == "agreement.docx: the Kariakoo shop rent is 450,000 TZS a month."


class _EndlessClaude(_FakeClaude):
    """Never stops asking for tools: the loop must end and force an answer."""

    def __init__(self):
        super().__init__()
        self.final_allow_tools = None

    def continue_with_tools(self, messages, tools, system_prompt=None, model_hint="", allow_tools=True):
        if not allow_tools:
            self.final_allow_tools = False
            return self._resp(text="Here's what I found so far.")
        n = len(messages)
        return self._resp(calls=[(f"t{n}", "memory_search", {"query": "x"})])


def test_agent_loop_is_bounded(server, monkeypatch):
    mod, _, _ = server
    fake = _EndlessClaude()
    monkeypatch.setattr(mod, "get_router", lambda: type("R", (), {"get_provider": lambda self: fake})())
    monkeypatch.setattr(mod.settings, "invite_code", "UBONGO-TEST", raising=False)
    monkeypatch.setattr(type(mod.settings), "increment_query_count", lambda self: None)
    out = mod.query_agentic(mod.QueryRequest(message="loop forever"))
    assert len(out.steps) == mod._MAX_TOOL_ROUNDS
    assert fake.final_allow_tools is False
    assert out.content == "Here's what I found so far."


def test_continue_with_tools_sends_a_valid_anthropic_request(monkeypatch):
    """Run the real SDK against a local stand-in for the API and check the
    request: tool turns in order, tools defined, tool_choice none when asked."""
    import json
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    pytest.importorskip("anthropic")
    from assistant_cli.providers.anthropic_provider import AnthropicProvider

    seen = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            seen.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            body = json.dumps({
                "id": "msg_1", "type": "message", "role": "assistant", "model": "m",
                "content": [{"type": "text", "text": "The rent is 450,000 TZS."}],
                "stop_reason": "end_turn", "stop_sequence": None,
                "usage": {"input_tokens": 1, "output_tokens": 1},
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        p = AnthropicProvider(api_key="sk-test", base_url=f"http://127.0.0.1:{srv.server_port}")
        tools = [{"name": "read_file", "description": "d", "input_schema": {"type": "object", "properties": {}}}]
        messages = [
            {"role": "user", "content": "what's the rent?"},
            {"role": "assistant", "content": [{"type": "tool_use", "id": "t1", "name": "read_file", "input": {"path": "~/a.docx"}}]},
            {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "Rent: 450,000 TZS"}]},
        ]
        r = p.continue_with_tools(messages, tools, system_prompt="sys", allow_tools=False)
    finally:
        srv.shutdown()

    assert r.content == "The rent is 450,000 TZS." and not r.tool_calls
    req = seen[0]
    assert req["messages"] == messages and req["tools"] == tools and req["system"] == "sys"
    assert req["tool_choice"] == {"type": "none"}
