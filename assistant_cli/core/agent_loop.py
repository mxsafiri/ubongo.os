"""
Agent Loop — Ubongo's ReAct runtime.

Replaces the old single-shot chat with a real Reason-Act-Observe loop:

    while not done:
        ctx = assemble_context(workspace, history, memory)
        response = provider.chat_with_tools(ctx, tools)
        if response.tool_calls:
            for call in response.tool_calls:
                if needs_approval(call): await approve(call)
                result = execute(call)
                history.append(call, result)
        else:
            return response.text

Notes
-----
- Stateless across turns; the caller owns history. Each invocation runs
  one user turn through the loop until the model emits final text.
- A hard step cap protects against runaway tool loops.
- Tool execution is delegated through an injectable callable so this
  module stays decoupled from the existing executor.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Any
from assistant_cli.config import settings
from assistant_cli.core.workspace import (
    Workspace,
    load_workspace,
    assemble_system_prompt,
    find_skill,
)
from assistant_cli.core.semantic_memory import SemanticMemory
from assistant_cli.providers.base import AIResponse, ToolCall
from assistant_cli.providers.tool_definitions import get_tools_for_tier
from assistant_cli.utils.logger import logger


# Type alias: a tool executor takes (name, input) and returns a JSON-able result.
ToolExecutor = Callable[[str, Dict[str, Any]], Any]


@dataclass
class AgentTurn:
    """The result of one full ReAct turn."""
    final_text: str
    steps:      int                                  = 0
    tool_log:   List[Dict[str, Any]]                 = field(default_factory=list)
    stop:       str                                  = "end_turn"   # end_turn | max_steps | error


def run_turn(
    user_message: str,
    provider,                                # AIProvider — duck-typed
    *,
    history:        Optional[List[Dict[str, Any]]] = None,
    workspace:      Optional[Workspace]            = None,
    memory:         Optional[SemanticMemory]       = None,
    extra_system:   Optional[str]                  = None,
    tool_executor:  Optional[ToolExecutor]         = None,
    max_steps:      int                            = 8,
) -> AgentTurn:
    """
    Run one user turn through the ReAct loop.

    Parameters
    ----------
    user_message
        Raw text from the user.
    provider
        Anything implementing `chat_with_tools(message, tools, system_prompt, history)`.
    history
        Mutable conversation history. New assistant + tool turns are appended in place.
    workspace
        Pre-loaded Workspace; loaded fresh from ~/.ubongo/ if omitted.
    extra_system
        Optional extra system-prompt fragment appended after the workspace prompt
        (e.g. for working-memory state from ConversationEngine).
    tool_executor
        Callable that runs a tool and returns its result. If omitted, only
        built-in workspace tools (load_skill) are wired; everything else
        returns an "unhandled tool" error so the model can recover.
    max_steps
        Safety cap on tool calls per turn.
    """
    ws       = workspace or load_workspace()
    mem      = memory or SemanticMemory(ws.episodic_dir)
    history  = history if history is not None else []
    tier     = getattr(settings, "effective_tier", None) or getattr(settings, "user_tier", "free")
    tools    = get_tools_for_tier(tier)

    sys_prompt = assemble_system_prompt(ws)
    if extra_system:
        sys_prompt = f"{sys_prompt}\n\n---\n\n{extra_system}"

    tool_log: List[Dict[str, Any]] = []

    pending_message: Optional[str] = user_message
    last_response:   Optional[AIResponse] = None
    pending_tool_results: List[Dict[str, Any]] = []

    for step in range(1, max_steps + 1):
        try:
            response = provider.chat_with_tools(
                message       = pending_message or "",
                tools         = tools,
                system_prompt = sys_prompt,
                history       = history,
            )
        except Exception as exc:
            logger.error("agent_loop: provider error on step %d: %s", step, exc)
            return AgentTurn(
                final_text = f"Sorry — the model call failed: {exc}",
                steps      = step,
                tool_log   = tool_log,
                stop       = "error",
            )

        last_response = response

        # Persist user/assistant turn into history so the next provider call
        # has the right shape. We store as {role, content} pairs; richer
        # providers can adapt.
        if pending_message:
            history.append({"role": "user", "content": pending_message})
            pending_message = None

        history.append({"role": "assistant", "content": response.content or ""})

        if not response.has_tool_calls:
            return AgentTurn(
                final_text = (response.content or "").strip(),
                steps      = step,
                tool_log   = tool_log,
                stop       = response.stop_reason or "end_turn",
            )

        # Execute each tool call requested this turn, then loop.
        pending_tool_results = []
        for call in response.tool_calls:
            result = _dispatch_tool(call, ws=ws, memory=mem, tool_executor=tool_executor)
            pending_tool_results.append({"id": call.id, "name": call.name, "result": result})
            tool_log.append({
                "step":   step,
                "name":   call.name,
                "input":  call.input,
                "result": _truncate(result),
            })

        # Hand the tool outputs back to the model on the next iteration.
        # We pack them as a synthetic user turn so any provider that doesn't
        # speak structured tool_results still sees something coherent.
        pending_message = _format_tool_results(pending_tool_results)

    # Hit the safety cap.
    return AgentTurn(
        final_text = (last_response.content if last_response else "")
                     or "I tried several steps but didn't reach a final answer. "
                        "Could you narrow the request?",
        steps      = max_steps,
        tool_log   = tool_log,
        stop       = "max_steps",
    )


# ── tool dispatch ──────────────────────────────────────────────────────

def _dispatch_tool(
    call: ToolCall,
    *,
    ws: Workspace,
    memory: SemanticMemory,
    tool_executor: Optional[ToolExecutor],
) -> Any:
    """Route a tool call to a workspace built-in, then to the executor."""
    if call.name == "load_skill":
        return _tool_load_skill(call.input, ws)
    if call.name == "memory_recall":
        return _tool_memory_recall(call.input, memory)
    if call.name == "memory_save":
        return _tool_memory_save(call.input, memory)
    if call.name == "memory_forget":
        return _tool_memory_forget(call.input, memory)

    if tool_executor is None:
        return {
            "error": (
                f"Tool '{call.name}' has no executor wired. "
                "This is an integration gap — fall back to a text answer."
            )
        }

    try:
        return tool_executor(call.name, call.input)
    except Exception as exc:
        logger.warning("agent_loop: tool '%s' raised: %s", call.name, exc)
        return {"error": f"Tool '{call.name}' failed: {exc}"}


def _tool_memory_recall(payload: Dict[str, Any], mem: SemanticMemory) -> Dict[str, Any]:
    p = payload or {}
    query = str(p.get("query", "") or "")
    try:
        limit = int(p.get("limit", 8))
    except (TypeError, ValueError):
        limit = 8

    facts = mem.recall(query, limit=limit)
    return {
        "query":       query,
        "total_facts": mem.count(),
        "results":     [f.to_dict() for f in facts],
    }


def _tool_memory_save(payload: Dict[str, Any], mem: SemanticMemory) -> Dict[str, Any]:
    p = payload or {}
    text = str(p.get("text", "") or "").strip()
    if not text:
        return {"error": "memory_save requires non-empty 'text'."}
    tags = str(p.get("tags", "") or "")
    fact = mem.save(text, tags=tags, source="agent")
    return {"saved": True, "fact": fact.to_dict()}


def _tool_memory_forget(payload: Dict[str, Any], mem: SemanticMemory) -> Dict[str, Any]:
    p = payload or {}
    try:
        fact_id = int(p.get("id"))
    except (TypeError, ValueError):
        return {"error": "memory_forget requires an integer 'id'."}
    removed = mem.forget(fact_id)
    return {"forgotten": removed, "id": fact_id}


def _tool_load_skill(payload: Dict[str, Any], ws: Workspace) -> Dict[str, Any]:
    name = (payload or {}).get("name", "").strip()
    if not name:
        return {"error": "load_skill requires a 'name' parameter."}

    skill = find_skill(ws, name)
    if not skill:
        available = ", ".join(s.name for s in ws.skills) or "(none installed)"
        return {
            "error": f"Skill '{name}' not found.",
            "available_skills": available,
        }

    return {
        "name":        skill.name,
        "description": skill.description,
        "body":        skill.read_body(),
    }


# ── formatting helpers ────────────────────────────────────────────────

def _format_tool_results(results: List[Dict[str, Any]]) -> str:
    """Serialize tool outputs back to the model in a readable way."""
    if not results:
        return ""

    lines = ["Tool results:"]
    for r in results:
        lines.append(f"\n[{r['name']}] →")
        lines.append(_render_value(r["result"]))
    return "\n".join(lines)


def _render_value(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        import json
        return json.dumps(value, indent=2, default=str)
    except (TypeError, ValueError):
        return str(value)


def _truncate(value: Any, limit: int = 600) -> Any:
    """Trim large tool outputs before logging."""
    s = _render_value(value)
    if len(s) <= limit:
        return s
    return s[:limit] + f"... ({len(s) - limit} more chars)"
