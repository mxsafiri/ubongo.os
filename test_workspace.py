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
