"""Write & reply: reading the user's selection, inserting drafts, tone, and
the draft card the agent produces."""

import sys

import pytest

from assistant_cli.tools import desktop_text as dt


class FakeMac:
    """Clipboard plus a log of AppleScript calls; ⌘C copies `selection`."""

    def __init__(self, clipboard="old clipboard", selection="Hi! Can we meet Friday at 10?"):
        self.clipboard = clipboard
        self.selection = selection
        self.scripts: list[str] = []
        self.pasted_into: list[tuple[str, str]] = []
        self.active = None

    def run(self, script: str) -> str:
        self.scripts.append(script)
        if script.endswith("to activate"):
            self.active = script.split('application "')[1].split('" to')[0]
        elif 'keystroke "c"' in script:
            self.clipboard = self.selection
        elif 'keystroke "v"' in script:
            self.pasted_into.append((self.active, self.clipboard))
        elif "frontmost is true" in script:
            return "Mail"
        return ""

    def get(self) -> str:
        return self.clipboard

    def put(self, text: str) -> None:
        self.clipboard = text


@pytest.fixture
def mac(monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    return FakeMac()


def test_copy_selection_reads_and_restores_clipboard(mac):
    text = dt.copy_selection("Mail", run=mac.run, get=mac.get, put=mac.put, settle=0)
    assert text == "Hi! Can we meet Friday at 10?"
    assert mac.active == "Mail"
    assert mac.clipboard == "old clipboard"          # put back


def test_copy_selection_with_nothing_selected(mac):
    mac.selection = ""
    assert dt.copy_selection("Mail", run=mac.run, get=mac.get, put=mac.put, settle=0) == ""
    assert mac.clipboard == "old clipboard"


def test_paste_text_into_app_and_restore_clipboard(mac):
    dt.paste_text("WhatsApp", "Friday at 10 works. See you!", run=mac.run, get=mac.get, put=mac.put, settle=0)
    assert mac.pasted_into == [("WhatsApp", "Friday at 10 works. See you!")]
    assert mac.clipboard == "old clipboard"


def test_app_names_are_quoted_safely(mac):
    dt.paste_text('Evil" to do shell script "rm -rf ~', "x", run=mac.run, get=mac.get, put=mac.put, settle=0)
    assert mac.scripts[0] == 'tell application "Evil\\" to do shell script \\"rm -rf ~" to activate'


def test_needs_an_app_and_a_mac(monkeypatch, mac):
    with pytest.raises(dt.DesktopTextError, match="which app"):
        dt.copy_selection("", run=mac.run, get=mac.get, put=mac.put)
    monkeypatch.setattr(sys, "platform", "linux")
    with pytest.raises(dt.DesktopTextError, match="macOS"):
        dt.paste_text("Mail", "x", run=mac.run, get=mac.get, put=mac.put)


def test_missing_accessibility_permission_explains_the_fix(monkeypatch):
    class Out:
        returncode = 1
        stdout = ""
        stderr = "System Events got an error: osascript is not allowed to send keystrokes. (1002)"

    monkeypatch.setattr(dt.subprocess, "run", lambda *a, **k: Out())
    with pytest.raises(dt.DesktopTextError, match="Accessibility"):
        dt.run_osascript('tell application "System Events" to keystroke "c" using command down')


# ── Server: tone, the draft card, and the selection/insert endpoints ───

import importlib  # noqa: E402
from pathlib import Path  # noqa: E402


@pytest.fixture
def server(tmp_path, monkeypatch):
    pytest.importorskip("fastapi")
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))
    sys.path.insert(0, str(Path(__file__).parent / "desktop" / "server"))
    try:
        mod = importlib.import_module("server")
    finally:
        sys.path.pop(0)
    return mod


def test_system_prompt_uses_name_tone_and_app(server):
    p = server._build_system_prompt("", {"agent_name": "Akili", "tone": "warm"}, "Mail")
    assert p.startswith("You are Akili")
    assert "conversational, friendly and natural" in p
    assert "opened you from Mail" in p
    assert "show_draft" in p and "get_selected_text" in p
    default = server._build_system_prompt("")
    assert default.startswith("You are ubongo") and "short and direct" in default
    weird = server._build_system_prompt("", {"agent_name": "x" * 500, "tone": "angry"})
    assert "You are " + "x" * 32 + " —" in weird and "short and direct" in weird


class _ReplyClaude:
    """Reads the selection, then shows a draft."""

    def is_available(self):
        return True

    def _resp(self, text="", calls=()):
        from assistant_cli.providers.base import AIResponse, ToolCall
        return AIResponse(content=text, tool_calls=[ToolCall(*c) for c in calls])

    def chat_with_tools(self, message, tools, history=None, system_prompt=None):
        assert "opened you from WhatsApp" in system_prompt
        assert "conversational, friendly" in system_prompt
        return self._resp(calls=[("t1", "get_selected_text", {})])

    def continue_with_tools(self, messages, tools, system_prompt=None, model_hint="", allow_tools=True):
        last = messages[-1]["content"][0]["content"]
        if "Selected text in WhatsApp" in last:
            assert "Can we meet Friday at 10?" in last
            return self._resp(calls=[("t2", "show_draft", {"text": "Friday at 10 works! See you.", "title": "Reply to Amina"})])
        assert "has not been sent" in last
        return self._resp(text="Here's a reply.")


def test_reply_to_this_end_to_end(server, monkeypatch, mac):
    from assistant_cli.tools import desktop_text
    monkeypatch.setattr(desktop_text, "run_osascript", mac.run)
    monkeypatch.setattr(desktop_text, "get_clipboard", mac.get)
    monkeypatch.setattr(desktop_text, "set_clipboard", mac.put)
    monkeypatch.setattr(desktop_text.time, "sleep", lambda s: None)
    fake = _ReplyClaude()
    monkeypatch.setattr(server, "get_router", lambda: type("R", (), {"get_provider": lambda self: fake})())
    monkeypatch.setattr(server.settings, "invite_code", "UBONGO-TEST", raising=False)
    monkeypatch.setattr(type(server.settings), "increment_query_count", lambda self: None)

    out = server.query_agentic(server.QueryRequest(
        message="reply to this, say Friday works",
        profile={"agent_name": "Akili", "tone": "warm"},
        context_app="WhatsApp",
    ))
    assert [s.tool for s in out.steps] == ["get_selected_text", "show_draft"]
    [card] = [c for c in out.cards if c.type == "draft"]
    assert card.data == {"text": "Friday at 10 works! See you.", "title": "Reply to Amina", "app": "WhatsApp"}
    assert mac.clipboard == "old clipboard"   # reading the selection left the clipboard alone
    assert mac.pasted_into == []              # nothing inserted without the user

    # The user clicks Insert
    assert server.draft_insert(server.DraftRequest(text=card.data["text"], app="WhatsApp"))["ok"]
    assert mac.pasted_into == [("WhatsApp", "Friday at 10 works! See you.")]


def test_nothing_selected_and_no_app(server, monkeypatch, mac):
    from assistant_cli.tools import desktop_text
    monkeypatch.setattr(desktop_text, "run_osascript", mac.run)
    monkeypatch.setattr(desktop_text, "get_clipboard", mac.get)
    monkeypatch.setattr(desktop_text, "set_clipboard", mac.put)
    monkeypatch.setattr(desktop_text.time, "sleep", lambda s: None)
    mac.selection = ""
    server._context_app.set("Mail")
    r = server._selected_text_tool()
    assert not r.success and "Nothing is selected in Mail" in r.message
    server._context_app.set(None)
    assert "which app" in server._selected_text_tool().message
    with pytest.raises(server.HTTPException) as e:
        server.draft_insert(server.DraftRequest(text="hi", app=None))
    assert e.value.status_code == 400
