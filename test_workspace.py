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
