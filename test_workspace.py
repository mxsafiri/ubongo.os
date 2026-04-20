"""
Smoke tests for the Workspace-as-Kernel + ReAct agent loop.

Run with:  pytest ubongo.os/test_workspace.py -v
Or directly: python ubongo.os/test_workspace.py
"""
from __future__ import annotations
import tempfile
from pathlib import Path
from assistant_cli.core.workspace import (
    ensure_workspace,
    load_workspace,
    assemble_system_prompt,
    find_skill,
)
from assistant_cli.core.agent_loop import run_turn
from assistant_cli.core.semantic_memory import SemanticMemory, append_daily_note
from assistant_cli.core.sandbox import (
    SandboxPolicy,
    SandboxTier,
    SandboxDecision,
    RiskLevel,
    ApprovalRequest,
    always_allow,
    always_deny,
)
from assistant_cli.core.scheduler import Scheduler
from assistant_cli.core.sessions import (
    open_session,
    spawn_session,
)
from assistant_cli.core.channels import (
    WebhookChannel,
    WebhookRegistry,
)
from assistant_cli.core.canvas import Canvas
from assistant_cli.providers.base import AIResponse, ToolCall


# ── workspace tests ────────────────────────────────────────────────────

def test_ensure_workspace_seeds_defaults(tmp_path: Path) -> None:
    ensure_workspace(tmp_path)
    for fname in ("AGENTS.md", "SOUL.md", "TOOLS.md", "MEMORY.md"):
        assert (tmp_path / fname).is_file(), f"missing {fname}"
    assert (tmp_path / "skills" / "organize-downloads" / "SKILL.md").is_file()
    assert (tmp_path / "sessions").is_dir()
    assert (tmp_path / "memory").is_dir()
    assert (tmp_path / "credentials").is_dir()


def test_ensure_workspace_does_not_overwrite(tmp_path: Path) -> None:
    ensure_workspace(tmp_path)
    soul = tmp_path / "SOUL.md"
    soul.write_text("custom soul", encoding="utf-8")
    ensure_workspace(tmp_path)
    assert soul.read_text(encoding="utf-8") == "custom soul"


def test_load_workspace_returns_skill_index(tmp_path: Path) -> None:
    ensure_workspace(tmp_path)
    ws = load_workspace(tmp_path)
    names = [s.name for s in ws.skills]
    assert "organize-downloads" in names
    assert ws.soul.strip()
    assert ws.agents.strip()


def test_assemble_system_prompt_lists_skills(tmp_path: Path) -> None:
    ensure_workspace(tmp_path)
    ws = load_workspace(tmp_path)
    prompt = assemble_system_prompt(ws)
    assert "organize-downloads" in prompt
    assert "Available skills" in prompt
    assert "Ubongo" in prompt


def test_find_skill_case_insensitive(tmp_path: Path) -> None:
    ensure_workspace(tmp_path)
    ws = load_workspace(tmp_path)
    assert find_skill(ws, "Organize-Downloads") is not None
    assert find_skill(ws, "nonexistent") is None


# ── agent loop tests (with a fake provider) ───────────────────────────

class FakeProvider:
    """Replays a scripted sequence of AIResponse objects, one per turn."""
    def __init__(self, scripted: list[AIResponse]) -> None:
        self._scripted = list(scripted)
        self.calls: list[dict] = []

    def chat_with_tools(self, message, tools, system_prompt=None, history=None):
        self.calls.append({
            "message": message,
            "tools": [t["name"] for t in tools],
            "history_len": len(history) if history else 0,
        })
        if not self._scripted:
            raise RuntimeError("FakeProvider ran out of scripted responses")
        return self._scripted.pop(0)


def test_run_turn_returns_text_immediately() -> None:
    provider = FakeProvider([
        AIResponse(content="hello back", stop_reason="end_turn"),
    ])
    with tempfile.TemporaryDirectory() as tmp:
        ensure_workspace(Path(tmp))
        ws = load_workspace(Path(tmp))
        turn = run_turn("hi", provider, workspace=ws)

    assert turn.final_text == "hello back"
    assert turn.steps == 1
    assert turn.stop == "end_turn"
    assert turn.tool_log == []


def test_run_turn_executes_load_skill_tool() -> None:
    provider = FakeProvider([
        AIResponse(
            content="",
            tool_calls=[ToolCall(id="t1", name="load_skill", input={"name": "organize-downloads"})],
            stop_reason="tool_use",
        ),
        AIResponse(content="loaded — proceeding to sort.", stop_reason="end_turn"),
    ])
    with tempfile.TemporaryDirectory() as tmp:
        ensure_workspace(Path(tmp))
        ws = load_workspace(Path(tmp))
        turn = run_turn("organize my downloads", provider, workspace=ws)

    assert turn.final_text == "loaded — proceeding to sort."
    assert turn.steps == 2
    assert len(turn.tool_log) == 1
    assert turn.tool_log[0]["name"] == "load_skill"


def test_run_turn_routes_unknown_tool_to_executor() -> None:
    captured: dict = {}

    def exec_tool(name, payload):
        captured["name"] = name
        captured["payload"] = payload
        return {"ok": True, "echo": payload}

    provider = FakeProvider([
        AIResponse(
            content="",
            tool_calls=[ToolCall(id="t1", name="file_operation", input={"action": "create_folder", "name": "x"})],
            stop_reason="tool_use",
        ),
        AIResponse(content="done.", stop_reason="end_turn"),
    ])
    with tempfile.TemporaryDirectory() as tmp:
        ensure_workspace(Path(tmp))
        ws = load_workspace(Path(tmp))
        turn = run_turn("make a folder", provider, workspace=ws, tool_executor=exec_tool)

    assert captured["name"] == "file_operation"
    assert captured["payload"]["name"] == "x"
    assert turn.final_text == "done."


def test_run_turn_respects_max_steps() -> None:
    # Provider keeps asking for tool calls forever.
    looping = [
        AIResponse(
            content="",
            tool_calls=[ToolCall(id=f"t{i}", name="file_operation", input={"action": "search_files"})],
            stop_reason="tool_use",
        )
        for i in range(20)
    ]
    provider = FakeProvider(looping)
    with tempfile.TemporaryDirectory() as tmp:
        ensure_workspace(Path(tmp))
        ws = load_workspace(Path(tmp))
        turn = run_turn(
            "loop please",
            provider,
            workspace=ws,
            tool_executor=lambda n, p: {"noop": True},
            max_steps=3,
        )

    assert turn.stop == "max_steps"
    assert turn.steps == 3
    assert len(turn.tool_log) == 3


# ── semantic memory tests ─────────────────────────────────────────────

def test_semantic_memory_save_and_recall(tmp_path: Path) -> None:
    mem = SemanticMemory(tmp_path)
    mem.save("user prefers Arc over Chrome",      tags="browser preference")
    mem.save("daily notes live in ~/Documents",   tags="filesystem")
    mem.save("standup is 9am on Mondays",         tags="calendar routine")
    mem.close()

    mem2 = SemanticMemory(tmp_path)
    assert mem2.count() == 3

    hits = mem2.recall("browser")
    assert len(hits) == 1
    assert "Arc" in hits[0].text

    all_recent = mem2.recall("")
    assert [f.text for f in all_recent][0] == "standup is 9am on Mondays"


def test_semantic_memory_forget(tmp_path: Path) -> None:
    mem = SemanticMemory(tmp_path)
    f = mem.save("ephemeral fact", tags="temp")
    assert mem.count() == 1
    assert mem.forget(f.id) is True
    assert mem.count() == 0
    assert mem.forget(f.id) is False


def test_recall_ranks_by_token_matches(tmp_path: Path) -> None:
    mem = SemanticMemory(tmp_path)
    mem.save("python script runs on every boot",  tags="automation")
    mem.save("python is the primary language",    tags="")
    mem.save("vim is my editor",                  tags="")

    hits = mem.recall("python language")
    assert hits[0].text == "python is the primary language"


def test_run_turn_memory_recall_tool(tmp_path: Path) -> None:
    ws_dir  = tmp_path / "ws"
    mem_dir = tmp_path / "mem"
    ensure_workspace(ws_dir)
    ws = load_workspace(ws_dir)

    mem = SemanticMemory(mem_dir)
    mem.save("the user's laptop is a MacBook Pro M2", tags="hardware")

    provider = FakeProvider([
        AIResponse(
            content="",
            tool_calls=[ToolCall(id="t1", name="memory_recall", input={"query": "laptop"})],
            stop_reason="tool_use",
        ),
        AIResponse(content="It's a MacBook Pro M2.", stop_reason="end_turn"),
    ])
    turn = run_turn("what's my laptop?", provider, workspace=ws, memory=mem)

    assert turn.final_text == "It's a MacBook Pro M2."
    assert len(turn.tool_log) == 1
    assert turn.tool_log[0]["name"] == "memory_recall"


def test_run_turn_memory_save_tool(tmp_path: Path) -> None:
    ws_dir  = tmp_path / "ws"
    mem_dir = tmp_path / "mem"
    ensure_workspace(ws_dir)
    ws = load_workspace(ws_dir)
    mem = SemanticMemory(mem_dir)

    provider = FakeProvider([
        AIResponse(
            content="",
            tool_calls=[ToolCall(
                id="t1", name="memory_save",
                input={"text": "user's standup is at 9am Mondays", "tags": "calendar"},
            )],
            stop_reason="tool_use",
        ),
        AIResponse(content="Got it — saved.", stop_reason="end_turn"),
    ])
    turn = run_turn("remember: standup is 9am Mondays", provider, workspace=ws, memory=mem)

    assert turn.final_text == "Got it — saved."
    assert mem.count() == 1
    assert "standup" in mem.all()[0].text


def test_append_daily_note_creates_and_appends(tmp_path: Path) -> None:
    p1 = append_daily_note("opened the app", root=tmp_path)
    p2 = append_daily_note("ran three tool calls", root=tmp_path)
    assert p1 == p2
    body = p1.read_text(encoding="utf-8")
    assert "opened the app" in body
    assert "ran three tool calls" in body
    assert body.startswith("# ")   # has a date header


# ── sandbox tests ─────────────────────────────────────────────────────

def test_sandbox_trusted_allows_everything() -> None:
    p = SandboxPolicy.trusted()
    d, r, _ = p.classify("file_operation", {"action": "delete_item"})
    assert d == SandboxDecision.ALLOW
    assert r == RiskLevel.DESTRUCTIVE

    d, _, _ = p.classify("web_search", {"query": "x"})
    assert d == SandboxDecision.ALLOW


def test_sandbox_review_passes_safe_blocks_write() -> None:
    p = SandboxPolicy.review()
    d, r, _ = p.classify("memory_recall", {})
    assert d == SandboxDecision.ALLOW and r == RiskLevel.SAFE

    d, r, _ = p.classify("memory_save", {"text": "x"})
    assert d == SandboxDecision.REQUIRE_REVIEW and r == RiskLevel.WRITE

    d, r, _ = p.classify("file_operation", {"action": "delete_item"})
    assert d == SandboxDecision.REQUIRE_REVIEW and r == RiskLevel.DESTRUCTIVE


def test_sandbox_untrusted_denies_by_default() -> None:
    p = SandboxPolicy.untrusted()
    d, _, _ = p.classify("file_operation", {"action": "create_folder"})
    assert d == SandboxDecision.DENY

    d, _, _ = p.classify("memory_recall", {})
    assert d == SandboxDecision.ALLOW  # SAFE passes even in untrusted


def test_sandbox_allow_override() -> None:
    p = SandboxPolicy.untrusted(allow={"web_search"})
    d, _, _ = p.classify("web_search", {"query": "x"})
    assert d == SandboxDecision.ALLOW


def test_sandbox_deny_override() -> None:
    p = SandboxPolicy.trusted()
    p.deny.add("file_operation")
    d, _, _ = p.classify("file_operation", {"action": "create_folder"})
    assert d == SandboxDecision.DENY


def test_sandbox_file_search_is_safe() -> None:
    p = SandboxPolicy.review()
    d, r, _ = p.classify("file_operation", {"action": "search_files"})
    assert d == SandboxDecision.ALLOW and r == RiskLevel.SAFE


def test_sandbox_screen_screenshot_is_safe() -> None:
    p = SandboxPolicy.review()
    d, r, _ = p.classify("screen_control", {"action": "screenshot"})
    assert d == SandboxDecision.ALLOW and r == RiskLevel.SAFE

    d, r, _ = p.classify("screen_control", {"action": "click", "x": 0, "y": 0})
    assert d == SandboxDecision.REQUIRE_REVIEW and r == RiskLevel.CONTROL


def test_run_turn_blocks_under_untrusted(tmp_path: Path) -> None:
    ws_dir  = tmp_path / "ws"
    mem_dir = tmp_path / "mem"
    ensure_workspace(ws_dir)
    ws  = load_workspace(ws_dir)
    mem = SemanticMemory(mem_dir)

    calls: list[str] = []

    def exec_tool(name, payload):
        calls.append(name)
        return {"ran": True}

    provider = FakeProvider([
        AIResponse(
            content="",
            tool_calls=[ToolCall(id="t1", name="file_operation", input={"action": "create_folder", "name": "x"})],
            stop_reason="tool_use",
        ),
        AIResponse(content="OK, I couldn't run that.", stop_reason="end_turn"),
    ])
    turn = run_turn(
        "make a folder",
        provider,
        workspace=ws,
        memory=mem,
        tool_executor=exec_tool,
        sandbox=SandboxPolicy.untrusted(),
    )

    assert calls == []                          # executor never invoked
    assert turn.tool_log[0]["decision"] == "deny"
    assert turn.tool_log[0]["risk"] == "write"


def test_run_turn_review_with_approver(tmp_path: Path) -> None:
    ws_dir  = tmp_path / "ws"
    mem_dir = tmp_path / "mem"
    ensure_workspace(ws_dir)
    ws  = load_workspace(ws_dir)
    mem = SemanticMemory(mem_dir)

    approved: list[ApprovalRequest] = []

    def approver(req: ApprovalRequest) -> bool:
        approved.append(req)
        return True

    provider = FakeProvider([
        AIResponse(
            content="",
            tool_calls=[ToolCall(id="t1", name="memory_save", input={"text": "hello"})],
            stop_reason="tool_use",
        ),
        AIResponse(content="saved.", stop_reason="end_turn"),
    ])
    turn = run_turn(
        "remember hello",
        provider,
        workspace=ws,
        memory=mem,
        sandbox=SandboxPolicy.review(),
        approver=approver,
    )

    assert len(approved) == 1
    assert approved[0].tool_name == "memory_save"
    assert turn.final_text == "saved."
    assert mem.count() == 1


def test_run_turn_review_without_approver_denies(tmp_path: Path) -> None:
    ws_dir  = tmp_path / "ws"
    mem_dir = tmp_path / "mem"
    ensure_workspace(ws_dir)
    ws  = load_workspace(ws_dir)
    mem = SemanticMemory(mem_dir)

    provider = FakeProvider([
        AIResponse(
            content="",
            tool_calls=[ToolCall(id="t1", name="memory_save", input={"text": "nope"})],
            stop_reason="tool_use",
        ),
        AIResponse(content="can't do that.", stop_reason="end_turn"),
    ])
    turn = run_turn(
        "remember nope",
        provider,
        workspace=ws,
        memory=mem,
        sandbox=SandboxPolicy.review(),
        # no approver → default always_deny → blocked
    )

    assert mem.count() == 0
    assert turn.tool_log[0]["decision"] == "deny"


def test_always_allow_and_deny() -> None:
    req = ApprovalRequest("x", {}, RiskLevel.WRITE, "test")
    assert always_allow(req) is True
    assert always_deny(req)  is False


# ── Phase 6: scheduler tests ──────────────────────────────────────────

def test_scheduler_add_and_list(tmp_path: Path) -> None:
    s = Scheduler(tmp_path)
    j = s.add_job("morning-brief", "Summarise my day", interval_seconds=3600)
    assert j.id > 0
    assert j.name == "morning-brief"
    assert j.enabled is True
    assert s.count() == 1
    assert [x.name for x in s.list_jobs()] == ["morning-brief"]
    s.close()


def test_scheduler_due_jobs_uses_clock(tmp_path: Path) -> None:
    s = Scheduler(tmp_path)
    s.add_job("early", "x", interval_seconds=60, start_offset=0.0)
    s.add_job("later", "y", interval_seconds=60, start_offset=300.0)

    # With a clock far in the future, both are due.
    due = s.due_jobs(now=10**12)
    assert {j.name for j in due} == {"early", "later"}

    # With "now" at epoch, nothing is due yet.
    assert s.due_jobs(now=0.0) == []
    s.close()


def test_scheduler_mark_run_advances_next_run(tmp_path: Path) -> None:
    s = Scheduler(tmp_path)
    j = s.add_job("tick", "x", interval_seconds=120, start_offset=0.0)
    t0 = 1_700_000_000.0
    assert s.mark_run(j.id, now=t0) is True
    reloaded = [x for x in s.list_jobs() if x.id == j.id][0]
    assert reloaded.last_run_at == t0
    assert abs(reloaded.next_run_at - (t0 + 120)) < 0.01
    s.close()


def test_scheduler_disable_and_remove(tmp_path: Path) -> None:
    s = Scheduler(tmp_path)
    j = s.add_job("cron-a", "x", interval_seconds=60)
    assert s.set_enabled(j.id, False) is True
    due = s.due_jobs(now=10**12)
    assert due == []  # disabled jobs never appear in due_jobs
    assert s.remove_job(j.id) is True
    assert s.count() == 0
    s.close()


def test_scheduler_rejects_invalid_input(tmp_path: Path) -> None:
    s = Scheduler(tmp_path)
    try:
        s.add_job("", "prompt", interval_seconds=60)
    except ValueError:
        pass
    else:
        raise AssertionError("empty name should raise")
    try:
        s.add_job("x", "y", interval_seconds=0)
    except ValueError:
        pass
    else:
        raise AssertionError("zero interval should raise")
    s.close()


# ── Phase 6: session tests ────────────────────────────────────────────

def test_open_session_defaults_to_trusted() -> None:
    s = open_session(channel="main")
    assert s.channel == "main"
    assert s.policy.tier == SandboxTier.TRUSTED
    assert s.history == []
    assert s.parent_id is None


def test_spawn_session_steps_down_to_untrusted() -> None:
    parent = open_session(channel="main")  # trusted
    child = spawn_session(parent=parent)
    assert child.policy.tier == SandboxTier.UNTRUSTED
    assert child.parent_id == parent.id
    assert child.id != parent.id
    assert child.history == []  # isolated


def test_spawn_session_honours_explicit_tier() -> None:
    parent = open_session(channel="main")
    child = spawn_session(parent=parent, tier=SandboxTier.REVIEW)
    assert child.policy.tier == SandboxTier.REVIEW


# ── Phase 6: sessions_spawn tool ──────────────────────────────────────

def test_run_turn_sessions_spawn_runs_child() -> None:
    # Outer model delegates a task, then wraps up. The child's provider
    # runs its own little turn and returns text.
    outer = FakeProvider([
        AIResponse(
            content="",
            tool_calls=[ToolCall(
                id="t1",
                name="sessions_spawn",
                input={"task": "summarise inbox", "max_steps": 2},
            )],
            stop_reason="tool_use",
        ),
        # Child turn response (same provider, next scripted response):
        AIResponse(content="inbox has 3 unreads.", stop_reason="end_turn"),
        # Parent resumes:
        AIResponse(content="done — subagent said 3 unreads.", stop_reason="end_turn"),
    ])

    with tempfile.TemporaryDirectory() as tmp:
        ensure_workspace(Path(tmp))
        ws = load_workspace(Path(tmp))
        parent_sess = open_session(channel="main")
        turn = run_turn(
            "check inbox",
            outer,
            workspace = ws,
            session   = parent_sess,
        )

    assert turn.final_text == "done — subagent said 3 unreads."
    spawn_entry = [e for e in turn.tool_log if e["name"] == "sessions_spawn"][0]
    # The result rendered back into history includes the child's final_text.
    assert "3 unreads" in str(spawn_entry["result"])


def test_sessions_spawn_requires_task() -> None:
    provider = FakeProvider([
        AIResponse(
            content="",
            tool_calls=[ToolCall(id="t1", name="sessions_spawn", input={})],
            stop_reason="tool_use",
        ),
        AIResponse(content="ok, noted.", stop_reason="end_turn"),
    ])
    with tempfile.TemporaryDirectory() as tmp:
        ensure_workspace(Path(tmp))
        ws = load_workspace(Path(tmp))
        turn = run_turn("spawn please", provider, workspace=ws)

    entry = turn.tool_log[0]
    assert "error" in str(entry["result"]).lower()


# ── Phase 6: webhook registry tests ───────────────────────────────────

def test_webhook_registry_register_find_remove() -> None:
    reg = WebhookRegistry()
    ch = WebhookChannel(name="github", tier=SandboxTier.UNTRUSTED, secret="shhh")
    reg.register(ch)
    assert len(reg) == 1

    found = reg.find("github")
    assert found is ch
    # Policy derived from channel matches its tier + allow/deny sets.
    pol = found.policy()
    assert pol.tier == SandboxTier.UNTRUSTED

    assert reg.remove("github") is True
    assert reg.find("github") is None
    assert reg.remove("github") is False


def test_webhook_registry_rejects_empty_name() -> None:
    reg = WebhookRegistry()
    try:
        reg.register(WebhookChannel(name=""))
    except ValueError:
        pass
    else:
        raise AssertionError("empty name should raise")


# ── Phase 7: canvas tests ─────────────────────────────────────────────

def test_canvas_emit_creates_artifact() -> None:
    c = Canvas()
    a = c.emit(kind="markdown", title="hello", payload={"body": "# hi"})
    assert a.id and a.kind == "markdown" and a.title == "hello"
    assert len(c) == 1
    assert c.get(a.id).payload == {"body": "# hi"}


def test_canvas_emit_rejects_empty_kind_or_title() -> None:
    c = Canvas()
    for kwargs in ({"kind": "", "title": "t"}, {"kind": "md", "title": ""}):
        try:
            c.emit(**kwargs)
        except ValueError:
            pass
        else:
            raise AssertionError(f"expected ValueError for {kwargs}")


def test_canvas_update_and_remove() -> None:
    c = Canvas()
    a = c.emit(kind="note", title="v1", payload={"n": 1})
    u = c.update(a.id, title="v2", payload={"n": 2})
    assert u is not None and u.title == "v2" and u.payload == {"n": 2}
    assert u.updated_at >= a.created_at
    assert c.remove(a.id) is True
    assert c.remove(a.id) is False


def test_canvas_list_by_session() -> None:
    c = Canvas()
    c.emit(kind="note", title="a", session_id="s1")
    c.emit(kind="note", title="b", session_id="s1")
    c.emit(kind="note", title="c", session_id="s2")
    assert len(c.list(session_id="s1")) == 2
    assert len(c.list(session_id="s2")) == 1
    assert len(c.list()) == 3


def test_canvas_on_change_fires() -> None:
    events: list[tuple[str, str]] = []
    c = Canvas(on_change=lambda kind, art: events.append((kind, art.title)))
    a = c.emit(kind="note", title="one")
    c.update(a.id, title="one-updated")
    c.remove(a.id)
    assert [e[0] for e in events] == ["created", "updated", "removed"]


def test_canvas_on_change_swallows_subscriber_errors() -> None:
    def bad_sub(kind, art):
        raise RuntimeError("boom")
    c = Canvas(on_change=bad_sub)
    # Should not raise.
    a = c.emit(kind="note", title="x")
    assert c.get(a.id) is not None


def test_run_turn_canvas_emit_tool() -> None:
    canvas = Canvas()
    provider = FakeProvider([
        AIResponse(
            content="",
            tool_calls=[ToolCall(
                id="t1",
                name="canvas_emit",
                input={"kind": "markdown", "title": "plan", "payload": {"body": "* step 1"}},
            )],
            stop_reason="tool_use",
        ),
        AIResponse(content="rendered.", stop_reason="end_turn"),
    ])
    with tempfile.TemporaryDirectory() as tmp:
        ensure_workspace(Path(tmp))
        ws = load_workspace(Path(tmp))
        turn = run_turn("show plan", provider, workspace=ws, canvas=canvas)

    assert turn.final_text == "rendered."
    assert len(canvas) == 1
    art = canvas.list()[0]
    assert art.kind == "markdown" and art.title == "plan"
    assert art.payload == {"body": "* step 1"}


def test_run_turn_canvas_emit_without_canvas_returns_error() -> None:
    provider = FakeProvider([
        AIResponse(
            content="",
            tool_calls=[ToolCall(
                id="t1",
                name="canvas_emit",
                input={"kind": "note", "title": "t", "payload": {}},
            )],
            stop_reason="tool_use",
        ),
        AIResponse(content="ok.", stop_reason="end_turn"),
    ])
    with tempfile.TemporaryDirectory() as tmp:
        ensure_workspace(Path(tmp))
        ws = load_workspace(Path(tmp))
        turn = run_turn("emit without canvas", provider, workspace=ws)

    entry = turn.tool_log[0]
    assert "no canvas" in str(entry["result"]).lower()


# ── manual runner ──────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    failures = 0
    tests = [
        ("ensure_workspace_seeds_defaults",     test_ensure_workspace_seeds_defaults),
        ("ensure_workspace_does_not_overwrite", test_ensure_workspace_does_not_overwrite),
        ("load_workspace_returns_skill_index",  test_load_workspace_returns_skill_index),
        ("assemble_system_prompt_lists_skills", test_assemble_system_prompt_lists_skills),
        ("find_skill_case_insensitive",         test_find_skill_case_insensitive),
        ("run_turn_returns_text_immediately",   test_run_turn_returns_text_immediately),
        ("run_turn_executes_load_skill_tool",   test_run_turn_executes_load_skill_tool),
        ("run_turn_routes_unknown_tool",        test_run_turn_routes_unknown_tool_to_executor),
        ("run_turn_respects_max_steps",         test_run_turn_respects_max_steps),
        ("semantic_memory_save_and_recall",     test_semantic_memory_save_and_recall),
        ("semantic_memory_forget",              test_semantic_memory_forget),
        ("recall_ranks_by_token_matches",       test_recall_ranks_by_token_matches),
        ("run_turn_memory_recall_tool",         test_run_turn_memory_recall_tool),
        ("run_turn_memory_save_tool",           test_run_turn_memory_save_tool),
        ("append_daily_note_creates_and_appends", test_append_daily_note_creates_and_appends),
        ("sandbox_trusted_allows_everything",   test_sandbox_trusted_allows_everything),
        ("sandbox_review_passes_safe_blocks_write", test_sandbox_review_passes_safe_blocks_write),
        ("sandbox_untrusted_denies_by_default", test_sandbox_untrusted_denies_by_default),
        ("sandbox_allow_override",              test_sandbox_allow_override),
        ("sandbox_deny_override",               test_sandbox_deny_override),
        ("sandbox_file_search_is_safe",         test_sandbox_file_search_is_safe),
        ("sandbox_screen_screenshot_is_safe",   test_sandbox_screen_screenshot_is_safe),
        ("run_turn_blocks_under_untrusted",     test_run_turn_blocks_under_untrusted),
        ("run_turn_review_with_approver",       test_run_turn_review_with_approver),
        ("run_turn_review_without_approver_denies", test_run_turn_review_without_approver_denies),
        ("always_allow_and_deny",               test_always_allow_and_deny),
        ("scheduler_add_and_list",              test_scheduler_add_and_list),
        ("scheduler_due_jobs_uses_clock",       test_scheduler_due_jobs_uses_clock),
        ("scheduler_mark_run_advances_next_run", test_scheduler_mark_run_advances_next_run),
        ("scheduler_disable_and_remove",        test_scheduler_disable_and_remove),
        ("scheduler_rejects_invalid_input",     test_scheduler_rejects_invalid_input),
        ("open_session_defaults_to_trusted",    test_open_session_defaults_to_trusted),
        ("spawn_session_steps_down_to_untrusted", test_spawn_session_steps_down_to_untrusted),
        ("spawn_session_honours_explicit_tier", test_spawn_session_honours_explicit_tier),
        ("run_turn_sessions_spawn_runs_child",  test_run_turn_sessions_spawn_runs_child),
        ("sessions_spawn_requires_task",        test_sessions_spawn_requires_task),
        ("webhook_registry_register_find_remove", test_webhook_registry_register_find_remove),
        ("webhook_registry_rejects_empty_name", test_webhook_registry_rejects_empty_name),
        ("canvas_emit_creates_artifact",        test_canvas_emit_creates_artifact),
        ("canvas_emit_rejects_empty_kind_or_title", test_canvas_emit_rejects_empty_kind_or_title),
        ("canvas_update_and_remove",            test_canvas_update_and_remove),
        ("canvas_list_by_session",              test_canvas_list_by_session),
        ("canvas_on_change_fires",              test_canvas_on_change_fires),
        ("canvas_on_change_swallows_subscriber_errors",
                                                test_canvas_on_change_swallows_subscriber_errors),
        ("run_turn_canvas_emit_tool",           test_run_turn_canvas_emit_tool),
        ("run_turn_canvas_emit_without_canvas_returns_error",
                                                test_run_turn_canvas_emit_without_canvas_returns_error),
    ]
    for name, fn in tests:
        try:
            sig = fn.__code__.co_varnames[: fn.__code__.co_argcount]
            if "tmp_path" in sig:
                with tempfile.TemporaryDirectory() as t:
                    fn(Path(t))
            else:
                fn()
            print(f"PASS  {name}")
        except Exception as exc:
            failures += 1
            print(f"FAIL  {name}: {exc}")
    sys.exit(1 if failures else 0)
