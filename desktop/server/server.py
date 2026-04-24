#!/usr/bin/env python3
"""
ubongo Python bridge server.

FastAPI server running on 127.0.0.1:8765.
Spawned by the Tauri app on startup.
All traffic is local-only — never accessible from outside the machine.
"""

import logging
import os
import re
import sys
import threading
from pathlib import Path
from typing import List, Optional

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Add repo root to path so assistant_cli is importable ─────────────────
_here      = Path(__file__).resolve().parent          # desktop/server/
_repo_root = _here.parent.parent                       # ubongo.os/
sys.path.insert(0, str(_repo_root))
sys.path.insert(0, str(_here))                         # sibling modules (gateway.py)

from assistant_cli.config import settings
from assistant_cli.providers import ProviderRouter
from assistant_cli.providers.tool_definitions import get_tools_for_tier
from assistant_cli.core.executor import CommandExecutor
from assistant_cli.models import ParsedCommand, Intent

# ── Memory layer ──────────────────────────────────────────────────────────
from assistant_cli.memory import MemoryStore, FileWatcher, ContextBuilder

# ── Gateway (autonomy control plane) ─────────────────────────────────────
from assistant_cli.core import (
    Scheduler,
    SemanticMemory,
    WebhookRegistry,
    default_registry,
    load_workspace,
    run_turn,
)
from assistant_cli.core.agent_loop import (
    AgentTurn as _AgentTurn,  # noqa: F401
    _tool_memory_save,
    _tool_memory_recall,
    _tool_memory_forget,
    _tool_learning_suggest,
)
from gateway import EventBus, Gateway

logger = logging.getLogger("ubongo.server")

# ─────────────────────────────────────────────────────────────────────────
app = FastAPI(title="ubongo", version="0.4.0", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins  = ["tauri://localhost", "http://localhost", "http://localhost:1420", "http://127.0.0.1"],
    allow_methods  = ["*"],
    allow_headers  = ["*"],
)

# Singletons
_router:    Optional[ProviderRouter]  = None
_executor:  Optional[CommandExecutor] = None
_memory:    Optional[MemoryStore]     = None
_watcher:   Optional[FileWatcher]     = None
_context:   Optional[ContextBuilder]  = None
_gateway:   Optional[Gateway]         = None
_workspace = None                       # core.Workspace
_semantic_memory: Optional[SemanticMemory] = None


def get_router() -> ProviderRouter:
    global _router
    if _router is None:
        _router = ProviderRouter(settings)
    return _router


def get_executor() -> CommandExecutor:
    global _executor
    if _executor is None:
        _executor = CommandExecutor()
    return _executor


def get_memory() -> MemoryStore:
    global _memory
    if _memory is None:
        _memory = MemoryStore()
    return _memory


def get_context() -> ContextBuilder:
    global _context
    if _context is None:
        _context = ContextBuilder(get_memory())
    return _context


def get_workspace():
    """Lazy-load the user's ~/.ubongo workspace (SOUL.md, MEMORY.md, EVOLUTION.md, etc.)."""
    global _workspace
    if _workspace is None:
        _workspace = load_workspace()
    return _workspace


def get_semantic_memory() -> SemanticMemory:
    """The agent's persistent fact store — episodic memory the agent reads/writes."""
    global _semantic_memory
    if _semantic_memory is None:
        _semantic_memory = SemanticMemory(get_workspace().episodic_dir)
    return _semantic_memory


# ── Request / Response models ─────────────────────────────────────────────

class Message(BaseModel):
    role:    str
    content: str


class QueryRequest(BaseModel):
    message: str
    history: List[Message] = []


class AgentStep(BaseModel):
    tool:    str
    input:   dict
    result:  str
    success: bool


class ResponseCard(BaseModel):
    type: str   # "news", "search", "file", "music", "app", "system", "markdown"
    data: dict


class AgentResponse(BaseModel):
    content:  str
    steps:    List[AgentStep] = []
    cards:    List[ResponseCard] = []
    provider: str
    model:    str


class QueryResponse(BaseModel):
    content:       str
    provider:      str
    model:         str
    stop_reason:   str
    at_limit:      bool = False
    cards:         List[ResponseCard] = []


class MemorySearchRequest(BaseModel):
    query:                str = ""
    category:             Optional[str] = None
    extension:            Optional[str] = None
    modified_within_days: Optional[int] = None
    directory:            Optional[str] = None
    limit:                int = 30


# ─────────────────────────────────────────────────────────────────────────
# STARTUP — initial file scan + watcher
# ─────────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup_memory():
    """Run initial file scan in background and start the file watcher."""
    global _watcher
    store = get_memory()
    _watcher = FileWatcher(store)

    # If the index is empty, run an initial scan in a background thread
    if store.count == 0:
        def _initial_scan():
            try:
                count = _watcher.initial_scan(replace=True)
                logger.info(f"Initial scan complete: {count} files indexed")
            except Exception as e:
                logger.error(f"Initial scan failed: {e}")

        t = threading.Thread(target=_initial_scan, daemon=True)
        t.start()
    else:
        logger.info(f"Memory index loaded: {store.count} files")
        # Prune deleted files in background
        threading.Thread(target=store.prune_deleted, daemon=True).start()

    # Start real-time watcher
    _watcher.start()


@app.on_event("shutdown")
def shutdown_memory():
    if _watcher:
        _watcher.stop()


# ── Gateway (autonomy control plane) ─────────────────────────────────────

def _gateway_run_turn(prompt: str, session) -> _AgentTurn:
    """Bridge function the Gateway hands to every scheduled/webhook turn.

    Uses the same provider router the primary query endpoints use but
    runs through the ReAct loop, bound to the session's isolated history
    and sandbox policy.
    """
    provider = get_router()
    ws       = load_workspace()
    memory   = SemanticMemory(ws.episodic_dir)
    return run_turn(
        prompt,
        provider,
        workspace = ws,
        memory    = memory,
        session   = session,
        max_steps = 6,
    )


def _build_gateway() -> Gateway:
    return Gateway(
        scheduler   = Scheduler(),
        registry    = default_registry,
        bus         = EventBus(),
        run_turn_fn = _gateway_run_turn,
    )


# Mount the gateway router immediately so WebSocket routes are visible
# before the first request. The scheduler pump itself starts in the
# `startup` hook below (asyncio loop isn't running yet at import time).
_gateway = _build_gateway()
app.include_router(_gateway.router())


@app.on_event("startup")
async def startup_gateway():
    """Kick off the scheduler pump once the event loop is running."""
    assert _gateway is not None
    await _gateway.start()
    logger.info("gateway scheduler pump running")


@app.on_event("shutdown")
async def shutdown_gateway():
    if _gateway is not None:
        await _gateway.stop()


# ─────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Tauri startup check — returns 200 when server is ready."""
    return {"status": "ok", "version": settings.version}


# ── Onboarding ───────────────────────────────────────────────────────────


class InviteCodeRequest(BaseModel):
    code: str


@app.get("/onboarding/status")
def onboarding_status():
    """Tell the frontend whether to show onboarding or the main UI."""
    return {
        "onboarded": settings.is_onboarded,
        "has_invite_code": bool(settings.invite_code),
        "has_byok": bool(settings.anthropic_api_key),
        "proxy_url": settings.proxy_url,
    }


@app.post("/onboarding/activate")
def onboarding_activate(body: InviteCodeRequest):
    """
    Validate a beta invite code against the ubongo proxy and persist it
    locally. Subsequent AI calls will route through the proxy using this
    code as the api_key slot.
    """
    import json as _json
    import urllib.request as _urq
    import urllib.error as _uerr

    code = (body.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Invite code is required.")

    # Hit the proxy's /validate endpoint (stdlib — works without extra deps in
    # a PyInstaller bundle).
    proxy = settings.proxy_url.rstrip("/")
    req = _urq.Request(
        f"{proxy}/validate",
        data=_json.dumps({"code": code}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with _urq.urlopen(req, timeout=8) as resp:
            payload = _json.loads(resp.read().decode("utf-8") or "{}")
            status_code = resp.status
    except _uerr.HTTPError as e:
        # Non-2xx — read body for detail
        try:
            body_json = _json.loads(e.read().decode("utf-8") or "{}")
            detail = body_json.get("detail", "Invite code rejected.")
        except Exception:
            detail = "Invite code rejected."

        if e.code == 401:
            raise HTTPException(status_code=401, detail="That invite code is invalid or expired.")
        if e.code == 429:
            raise HTTPException(status_code=429, detail="That invite code is over its usage limit.")
        raise HTTPException(status_code=e.code, detail=detail)
    except _uerr.URLError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach ubongo servers. Check your internet and try again. ({e.reason})",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Unexpected error validating code: {e}")

    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=payload.get("detail", "Invite code rejected."))

    # Persist
    settings.save_partial(invite_code=code, user_tier="pro")

    # Force router to re-instantiate provider with new code
    global _router
    _router = None

    return {
        "onboarded": True,
        "tier": payload.get("tier", "pro"),
        "remaining_today": payload.get("remaining_today"),
    }


@app.post("/onboarding/reset")
def onboarding_reset():
    """Clear the saved invite code — for testing or rotating codes."""
    settings.save_partial(invite_code=None)
    global _router
    _router = None
    return {"onboarded": False}


@app.get("/status")
def status():
    """Return provider status, tier, usage, and memory stats."""
    router = get_router()
    summary = router.status_summary()

    # Add memory stats
    store = get_memory()
    mem_stats = store.get_stats()
    summary["memory"] = {
        "indexed_files": mem_stats.get("total_files", 0),
        "categories": mem_stats.get("categories", {}),
        "watcher_active": _watcher.is_running if _watcher else False,
    }
    return summary


@app.post("/query", response_model=QueryResponse)
def query(body: QueryRequest):
    """
    Simple text query — no tool execution.
    Injects memory context so Claude knows the user's file system.
    """
    if settings.at_query_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Monthly query limit reached ({settings.query_limit}). "
                   f"Upgrade your tier or wait until next month.",
        )

    router   = get_router()
    provider = router.get_provider()

    # Check if provider is actually usable
    if not provider.is_available():
        raise HTTPException(
            status_code=503,
            detail="No AI provider available. Configure an API key in Settings, "
                   "or install Ollama for offline use.",
        )

    history  = [{"role": m.role, "content": m.content} for m in body.history]

    # ── Inject memory context into the system prompt ─────────────────
    ctx = get_context()
    memory_context = ctx.build_compact_context()

    try:
        response = provider.chat(
            message=body.message,
            history=history if history else None,
            system_prompt=_build_system_prompt(memory_context),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI provider error: {e}")

    settings.increment_query_count()

    return QueryResponse(
        content     = response.content,
        provider    = response.provider_name,
        model       = response.model_used,
        stop_reason = response.stop_reason,
        at_limit    = settings.at_query_limit,
    )


@app.post("/query/agentic", response_model=AgentResponse)
def query_agentic(body: QueryRequest):
    """
    Agentic query — Claude plans, ubongo executes tools.
    Full memory context injected so Claude can find files intelligently.
    """
    if settings.at_query_limit:
        raise HTTPException(status_code=429, detail="Monthly query limit reached.")

    router   = get_router()
    provider = router.get_provider()

    # Check if provider is actually usable
    if not provider.is_available():
        raise HTTPException(
            status_code=503,
            detail="No AI provider available. Configure an API key in Settings, "
                   "or install Ollama for offline use.",
        )

    executor = get_executor()
    tools    = get_tools_for_tier(settings.effective_tier)
    history  = [{"role": m.role, "content": m.content} for m in body.history]

    # ── Full memory context for agentic queries ──────────────────────
    ctx = get_context()
    memory_context = ctx.build_system_context(user_query=body.message)

    # ── Step 1: ask the AI what tools to call ─────────────────────────
    try:
        response = provider.chat_with_tools(
            message=body.message,
            tools=tools,
            history=history if history else None,
            system_prompt=_build_system_prompt(memory_context),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI provider error: {e}")

    settings.increment_query_count()

    steps: List[AgentStep] = []
    cards: List[ResponseCard] = []

    # ── Step 2: execute each tool call ────────────────────────────────
    if response.has_tool_calls:
        tool_results = []

        for tc in response.tool_calls:
            exec_result = _execute_tool(executor, tc.name, tc.input)
            steps.append(AgentStep(
                tool    = tc.name,
                input   = tc.input,
                result  = exec_result.message,
                success = exec_result.success,
            ))
            tool_results.append({
                "tool_use_id": tc.id,
                "content": exec_result.message,
            })

            # Build a rich card from this tool result
            card = _build_card_from_tool(tc.name, tc.input, exec_result)
            if card:
                cards.append(card)

        # ── Step 3: send results back to AI for final reply ───────────
        if hasattr(provider, "send_tool_results"):
            final = provider.send_tool_results(
                original_message=body.message,
                tool_calls=response.tool_calls,
                tool_results=tool_results,
                tools=tools,
                history=history if history else None,
            )
            final_text = final.content
        else:
            final_text = response.content or _summarise_steps(steps)
    else:
        final_text = response.content

    return AgentResponse(
        content  = final_text,
        steps    = steps,
        cards    = cards,
        provider = response.provider_name,
        model    = response.model_used,
    )


# ── Memory endpoints ─────────────────────────────────────────────────────

@app.post("/memory/search")
def memory_search(body: MemorySearchRequest):
    """Search the file index — used by the UI and the AI tool."""
    store = get_memory()
    results = store.search(
        query=body.query,
        category=body.category,
        extension=body.extension,
        modified_within_days=body.modified_within_days,
        parent_dir=body.directory,
        limit=body.limit,
    )
    return {"count": len(results), "files": results}


@app.get("/memory/stats")
def memory_stats():
    """Return index statistics."""
    store = get_memory()
    return store.get_stats()


@app.post("/memory/rescan")
def memory_rescan():
    """Force a full re-scan of the file system."""
    if _watcher:
        count = _watcher.initial_scan(replace=True)
        return {"status": "ok", "indexed": count}
    return {"status": "error", "message": "Watcher not initialized"}


# ── Voice transcription ─────────────────────────────────────────────────
#
# Hold-to-speak in the desktop UI captures audio via MediaRecorder and POSTs
# the resulting webm/opus blob here. We forward it to either the user's own
# Groq key (BYOK fast path) or to the ubongo proxy, which holds a server-
# side Groq key for invite-code users. The macOS WKWebView used by Tauri does
# not implement webkitSpeechRecognition, which is why we route through Whisper
# instead of using the browser API.

_GROQ_BASE = "https://api.groq.com/openai/v1"
_GROQ_TRANSCRIBE_MODEL = "whisper-large-v3-turbo"


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(default=None),
):
    """
    Transcribe a short audio clip and return ``{"text": "..."}``.

    Routing:
      1. ``settings.groq_api_key`` is set → call Groq directly (no quota hit).
      2. ``settings.invite_code`` is set → forward to the proxy /transcribe
         (counts against the daily query quota, same as chat).
      3. Otherwise → 503 with a clear "voice needs an invite code or a Groq
         key" message so the UI can show a helpful toast.
    """
    import httpx

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio upload.")
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio clip too large (max 25 MB).")

    filename = file.filename or "clip.webm"
    content_type = file.content_type or "audio/webm"

    # Path 1 — direct Groq (BYOK)
    groq_key = (settings.groq_api_key or "").strip()
    if groq_key:
        files = {"file": (filename, audio_bytes, content_type)}
        data: dict = {
            "model": _GROQ_TRANSCRIBE_MODEL,
            "response_format": "json",
            "temperature": "0",
        }
        if language:
            data["language"] = language

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{_GROQ_BASE}/audio/transcriptions",
                    files=files,
                    data=data,
                    headers={"Authorization": f"Bearer {groq_key}"},
                )
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Groq transcription error: {e}")

        if resp.status_code >= 400:
            try:
                err_msg = resp.json().get("error", {}).get("message") or resp.text[:300]
            except Exception:
                err_msg = resp.text[:300]
            raise HTTPException(status_code=resp.status_code, detail=err_msg)

        text = (resp.json().get("text") or "").strip()
        return {"text": text}

    # Path 2 — proxy with invite code
    invite_code = (settings.invite_code or "").strip()
    if invite_code:
        proxy = settings.proxy_url.rstrip("/")
        files = {"file": (filename, audio_bytes, content_type)}
        data: dict = {}
        if language:
            data["language"] = language

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{proxy}/transcribe",
                    files=files,
                    data=data,
                    headers={"x-api-key": invite_code},
                )
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Proxy transcription error: {e}")

        if resp.status_code >= 400:
            try:
                err_msg = resp.json().get("detail") or resp.text[:300]
            except Exception:
                err_msg = resp.text[:300]
            raise HTTPException(status_code=resp.status_code, detail=err_msg)

        text = (resp.json().get("text") or "").strip()
        return {"text": text}

    # Path 3 — nothing configured
    raise HTTPException(
        status_code=503,
        detail=(
            "Voice input needs an invite code or a Groq API key. "
            "Add one in Settings."
        ),
    )


# ─────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────

def _build_card_from_tool(tool_name: str, tool_input: dict, exec_result) -> Optional[ResponseCard]:
    """Convert a tool execution result into a rich UI card."""
    try:
        if tool_name == "web_search":
            data = exec_result.data or {}
            result_type = data.get("type", "search")
            items = data.get("items", [])
            if items:
                if result_type == "news":
                    return ResponseCard(type="news", data={"items": items})
                else:
                    query = data.get("query", tool_input.get("query", ""))
                    return ResponseCard(type="search", data={"query": query, "items": items})

        elif tool_name == "memory_search" or (tool_name == "file_operation" and tool_input.get("action") == "search_files"):
            data = exec_result.data or {}
            files = data.get("files", [])
            if files:
                items = []
                for f in files[:10]:
                    items.append({
                        "name": f.get("name", "?"),
                        "path": f.get("path", ""),
                        "size": _size_str(f.get("size_bytes", 0)),
                        "extension": f.get("extension", f.get("name", "").rsplit(".", 1)[-1] if "." in f.get("name", "") else ""),
                        "modified": f.get("modified", ""),
                    })
                return ResponseCard(type="file", data={"items": items})

        elif tool_name == "app_control":
            app_name = tool_input.get("app_name", "Unknown")
            action = tool_input.get("action", "open")
            return ResponseCard(
                type="app",
                data={
                    "app_name": app_name,
                    "action": action,
                    "status": "success" if exec_result.success else "failed",
                }
            )

        elif tool_name == "music_control":
            action = tool_input.get("action", "play")
            query = tool_input.get("query", "")
            now_playing = _get_now_playing()
            return ResponseCard(
                type="music",
                data={
                    "track": now_playing.get("track") or query or "Unknown",
                    "artist": now_playing.get("artist", ""),
                    "album": now_playing.get("album"),
                    "is_playing": action in ("play", "search") and exec_result.success,
                }
            )

        elif tool_name == "system_info":
            data = exec_result.data or {}
            metrics = []
            if "cpu_percent" in data:
                metrics.append({"label": "CPU", "value": data["cpu_percent"], "max": 100, "unit": "%"})
            if "memory_percent" in data:
                metrics.append({"label": "Memory", "value": data["memory_percent"], "max": 100, "unit": "%"})
            if "disk_percent" in data:
                metrics.append({"label": "Disk", "value": data["disk_percent"], "max": 100, "unit": "%"})
            if metrics:
                return ResponseCard(type="system", data={"metrics": metrics})

        elif tool_name == "screen_control":
            action = tool_input.get("action", "")
            data = exec_result.data or {}
            # Screenshot-style actions produce a visual card with a thumbnail
            if action in ("screenshot", "screenshot_window", "screenshot_selection", "describe_screen"):
                if not exec_result.success:
                    return None
                path = data.get("path")
                if not path:
                    return None
                return ResponseCard(
                    type="screenshot",
                    data={
                        "path": path,
                        "filename": data.get("filename") or Path(path).name,
                        "mode": data.get("mode", "full"),
                        "base64": data.get("base64"),
                        "description": data.get("description"),
                    },
                )

    except Exception as e:
        logger.warning(f"Card generation failed for {tool_name}: {e}")

    return None


def _describe_screen(executor: CommandExecutor, prompt: str):
    """
    Take a screenshot, send to Claude vision, return description + image.

    Builds an ExecutionResult whose `data` has both the screenshot path
    AND the vision-derived description, so the frontend can render the
    thumbnail with the description underneath.
    """
    from assistant_cli.models import ExecutionResult

    shot = executor.screen.take_screenshot(mode="full", include_base64=True)
    if not shot.success or not shot.data:
        return shot

    b64 = shot.data.get("base64")
    if not b64:
        return ExecutionResult(
            success=False,
            message="Screenshot captured but could not be encoded for vision.",
            data=shot.data,
            error="missing_base64",
        )

    # Route to the Anthropic provider's vision method
    router = get_router()
    provider = router.get_provider()
    description = "Screenshot captured, but vision is only available on Claude."
    if hasattr(provider, "describe_image"):
        try:
            vision = provider.describe_image(image_base64=b64, prompt=prompt)
            description = vision.content or description
        except Exception as e:
            logger.warning(f"Vision call failed: {e}")
            description = f"(vision unavailable: {e})"

    # Strip base64 from the message payload back to the AI — don't flood
    # its context with a mega-string; keep it in data for the card only.
    return ExecutionResult(
        success=True,
        message=description,
        data={
            "path": shot.data.get("path"),
            "filename": shot.data.get("filename"),
            "mode": shot.data.get("mode", "full"),
            "base64": b64,
            "description": description,
        },
        error=None,
    )


def _parse_search_results(message: str, query: str) -> list:
    """Parse search result text into structured items for the search card."""
    items = []
    lines = message.strip().split("\n")

    for line in lines:
        line = line.strip()
        if not line or line.startswith("Opened") or line.startswith("Search"):
            continue

        # Try to extract URL and title from common patterns
        # Pattern: "Title - URL" or "• Title (url)"
        if "http" in line:
            url_match = re.search(r'(https?://\S+)', line)
            if url_match:
                url = url_match.group(1).rstrip(")")
                title = line[:url_match.start()].strip(" -•·→")
                if not title:
                    title = url
                items.append({
                    "title": title[:120],
                    "url": url,
                    "snippet": "",
                })

    # If we couldn't parse structured results, create a single generic one
    if not items and message.strip():
        items.append({
            "title": f"Search results for: {query}",
            "url": f"https://www.google.com/search?q={query.replace(' ', '+')}",
            "snippet": message[:200],
        })

    return items[:8]


def _build_system_prompt(memory_context: str) -> str:
    """Compose the full system prompt with memory context."""
    return (
        "You are ubongo — a personal AI OS layer on the user's computer.\n\n"
        "CRITICAL: You are a VISUAL DASHBOARD, not a chatbot. Your text accompanies visual cards.\n\n"
        "TOOL USE RULES (follow strictly):\n"
        "- News/events/updates → ALWAYS call web_search with search_type='news'. NEVER make up news.\n"
        "- General questions needing current info → call web_search with search_type='web'.\n"
        "- Find files → ALWAYS call memory_search.\n"
        "- System status → ALWAYS call system_info.\n"
        "- Play/control music → ALWAYS call music_control.\n"
        "- Open/close apps → ALWAYS call app_control.\n"
        "- General chat/opinion → just respond with text, no tools needed.\n\n"
        "RESPONSE STYLE (after tools return results):\n"
        "- Your text is a FOOTNOTE, not the main content. The tool results render as visual cards.\n"
        "- After calling a tool, write 1 short sentence of context. Do NOT repeat the data.\n"
        "- For general chat: max 3-5 concise bullet points.\n"
        "- No pleasantries, no 'let me know', no filler.\n\n"
        f"{memory_context}"
    )


def _wrap_dict_as_execution(result: dict, *, default_msg: str, success: Optional[bool] = None):
    """Adapt agent_loop's dict-returning tool helpers to ExecutionResult."""
    from assistant_cli.models import ExecutionResult
    if not isinstance(result, dict):
        return ExecutionResult(success=False, message=str(result), data=None, error="bad_tool_result")
    err = result.get("error")
    if err:
        return ExecutionResult(success=False, message=str(err), data=result, error=str(err))
    ok = success if success is not None else True
    return ExecutionResult(success=ok, message=default_msg, data=result, error=None)


def _execute_tool(executor: CommandExecutor, tool_name: str, tool_input: dict):
    """Map a Claude tool_use call onto the existing executor or memory store."""
    from assistant_cli.models import ExecutionResult

    try:
        # ── Memory search — handled here, not by executor ────────────
        if tool_name == "memory_search":
            store = get_memory()
            results = store.search(
                query=tool_input.get("query", ""),
                category=tool_input.get("category"),
                extension=tool_input.get("extension"),
                modified_within_days=tool_input.get("modified_within_days"),
                parent_dir=tool_input.get("directory"),
                limit=tool_input.get("limit", 30),
            )
            if not results:
                return ExecutionResult(
                    success=True,
                    message="No matching files found in the index.",
                    data={"files": [], "count": 0},
                    error=None,
                )

            # Format results for the AI
            lines = [f"Found {len(results)} file(s):"]
            for f in results[:30]:
                name = f.get("name", "?")
                path = f.get("path", "")
                size = f.get("size_bytes", 0)
                home = str(Path.home())
                short = path.replace(home, "~")
                lines.append(f"  • {name} ({_size_str(size)}) → {short}")

            return ExecutionResult(
                success=True,
                message="\n".join(lines),
                data={"files": results, "count": len(results)},
                error=None,
            )

        # ── File operations ──────────────────────────────────────────
        if tool_name == "file_operation":
            action = tool_input.get("action", "")
            if action == "create_folder":
                name = tool_input.get("name", "New Folder")
                location = tool_input.get("location", "desktop")
                return executor.file_ops.create_folder(name, location)
            elif action == "move_item":
                source = tool_input.get("source", "")
                dest = tool_input.get("destination", "")
                return executor.file_ops.move_item(source, dest)
            elif action == "delete_item":
                source = tool_input.get("source", "")
                return executor.file_ops.delete_item(source)
            elif action == "search_files":
                query = tool_input.get("query", "")
                file_type = tool_input.get("file_type")
                location = tool_input.get("location")
                return executor.file_ops.search_files(
                    file_type=file_type, location=location
                )
            elif action == "sort_files":
                location = tool_input.get("location", "downloads")
                return executor.file_ops.sort_files_by_type(location)

        elif tool_name == "app_control":
            action = tool_input.get("action", "")
            app_name = tool_input.get("app_name", "")
            if action == "open":
                return executor.app_control.open_app(app_name)
            elif action == "close":
                return executor.app_control.close_app(app_name)

        elif tool_name == "system_info":
            info_type = tool_input.get("info_type", "all")
            if info_type == "disk":
                return executor.system_info.get_disk_space()
            elif info_type == "cpu":
                return executor.system_info.get_cpu_usage()
            elif info_type == "memory":
                return executor.system_info.get_memory_usage()
            else:
                return executor.system_info.get_all_info()

        elif tool_name == "web_search":
            return _execute_web_search(tool_input)

        elif tool_name == "web_action":
            action = tool_input.get("action", "")
            query = tool_input.get("query", "")
            if action == "navigate":
                return executor.automation.open_url(query)

        elif tool_name == "screen_control":
            action = tool_input.get("action", "")
            if action == "screenshot":
                return executor.screen.take_screenshot(mode="full", include_base64=True)
            elif action == "screenshot_window":
                return executor.screen.take_screenshot(mode="window", include_base64=True)
            elif action == "screenshot_selection":
                return executor.screen.take_screenshot(mode="selection", include_base64=True)
            elif action == "describe_screen":
                prompt = tool_input.get("prompt") or "Describe what's on this screen in a concise, helpful way."
                return _describe_screen(executor, prompt)
            elif action == "click":
                x = tool_input.get("x", 0)
                y = tool_input.get("y", 0)
                return executor.screen.click(x, y)
            elif action == "type":
                text = tool_input.get("text", "")
                return executor.screen.type_text(text)
            elif action == "hotkey":
                keys = tool_input.get("keys") or []
                if keys:
                    return executor.screen.hotkey(*keys)
                from assistant_cli.models import ExecutionResult
                return ExecutionResult(success=False, message="hotkey requires 'keys'.", error="missing_keys")
            elif action == "scroll":
                amount = int(tool_input.get("amount", -3))
                return executor.screen.scroll(amount)
            elif action == "screen_size":
                return executor.screen.get_screen_size()

        elif tool_name == "music_control":
            action = tool_input.get("action", "play")
            query = tool_input.get("query", "")
            if action == "play":
                return executor.automation.play_music(song=query)
            elif action == "pause":
                return executor.automation.pause_music()
            elif action == "next":
                return executor.automation.next_track()
            elif action == "previous":
                return executor.automation.previous_track()
            elif action == "search":
                return executor.automation.play_music(song=query)

        elif tool_name == "create_document":
            doc_type = tool_input.get("doc_type", "text")
            name = tool_input.get("name", "untitled")
            content = tool_input.get("content", "")
            location = tool_input.get("location", "desktop")
            if doc_type == "presentation":
                return executor.automation.create_presentation(title=name)
            else:
                return executor.automation.create_document(title=name, content=content)

        # ── Persistent memory & learning (the agent's "growth" surface) ──
        elif tool_name == "memory_save":
            result = _tool_memory_save(tool_input, get_semantic_memory())
            return _wrap_dict_as_execution(result, default_msg="Saved to memory.")

        elif tool_name == "memory_recall":
            result = _tool_memory_recall(tool_input, get_semantic_memory())
            facts = result.get("results", []) if isinstance(result, dict) else []
            if not facts:
                msg = f"No matching facts (searched {result.get('total_facts', 0)} total)."
            else:
                lines = [f"Recalled {len(facts)} fact(s):"]
                for f in facts[:10]:
                    txt = (f.get("text") or "").strip().replace("\n", " ")
                    lines.append(f"  • [{f.get('id')}] {txt[:160]}")
                msg = "\n".join(lines)
            return _wrap_dict_as_execution(result, default_msg=msg)

        elif tool_name == "memory_forget":
            result = _tool_memory_forget(tool_input, get_semantic_memory())
            ok = bool(result.get("forgotten"))
            msg = f"Forgot fact #{result.get('id')}." if ok else f"No fact with id={result.get('id')}."
            return _wrap_dict_as_execution(result, default_msg=msg, success=ok)

        elif tool_name == "learning_suggest":
            # Agent proposes a durable update to SOUL.md / USER.md / TOOLS.md / MEMORY.md.
            # We pass canvas=None / session=None — the suggestion still appends to
            # EVOLUTION.md, the user reviews it manually. (Live canvas wiring is gateway-only.)
            result = _tool_learning_suggest(
                tool_input,
                ws=get_workspace(),
                canvas=None,
                session=None,
            )
            target = (tool_input.get("target") or "").strip() or "EVOLUTION.md"
            msg = f"Logged learning suggestion → {target} (review in EVOLUTION.md)."
            return _wrap_dict_as_execution(result, default_msg=msg)

        return ExecutionResult(success=False, message=f"Unknown tool: {tool_name}", data=None, error="unknown_tool")

    except Exception as e:
        return ExecutionResult(success=False, message=str(e), data=None, error=str(e))


def _execute_web_search(tool_input: dict):
    """Run a real web search via DuckDuckGo and return structured results."""
    from assistant_cli.models import ExecutionResult

    query = tool_input.get("query", "")
    search_type = tool_input.get("search_type", "web")

    try:
        from duckduckgo_search import DDGS

        ddgs = DDGS()

        if search_type == "news":
            raw = list(ddgs.news(query, max_results=6))
            items = []
            for r in raw:
                items.append({
                    "headline": r.get("title", ""),
                    "source": r.get("source", ""),
                    "source_url": r.get("url", ""),
                    "thumbnail_url": r.get("image"),
                    "date": r.get("date", ""),
                    "snippet": r.get("body", "")[:150],
                    "url": r.get("url", ""),
                })

            # Format for the AI to read
            lines = [f"Found {len(items)} news articles for '{query}':"]
            for i, item in enumerate(items, 1):
                lines.append(f"{i}. {item['headline']} — {item['source']}")

            return ExecutionResult(
                success=True,
                message="\n".join(lines),
                data={"type": "news", "items": items},
                error=None,
            )

        else:  # web search
            raw = list(ddgs.text(query, max_results=8))
            items = []
            for r in raw:
                items.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", "")[:150],
                })

            lines = [f"Found {len(items)} results for '{query}':"]
            for i, item in enumerate(items, 1):
                lines.append(f"{i}. {item['title']} — {item['url']}")

            return ExecutionResult(
                success=True,
                message="\n".join(lines),
                data={"type": "search", "query": query, "items": items},
                error=None,
            )

    except Exception as e:
        logger.warning(f"Web search failed: {e}")
        return ExecutionResult(
            success=False,
            message=f"Web search failed: {e}",
            data=None,
            error=str(e),
        )


def _get_now_playing() -> dict:
    """Get current track info from Apple Music/Spotify via AppleScript."""
    import subprocess

    # Try Spotify first, then Apple Music
    for app_name in ["Spotify", "Music"]:
        script = f'''
        tell application "System Events"
            if (name of processes) contains "{app_name}" then
                tell application "{app_name}"
                    if player state is playing then
                        set t to name of current track
                        set a to artist of current track
                        set al to album of current track
                        return t & "|" & a & "|" & al
                    end if
                end tell
            end if
        end tell
        '''
        try:
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode == 0 and result.stdout.strip():
                parts = result.stdout.strip().split("|")
                return {
                    "track": parts[0] if len(parts) > 0 else "",
                    "artist": parts[1] if len(parts) > 1 else "",
                    "album": parts[2] if len(parts) > 2 else "",
                }
        except Exception:
            pass

    return {}


def _summarise_steps(steps: List[AgentStep]) -> str:
    done  = [s for s in steps if s.success]
    fails = [s for s in steps if not s.success]
    parts = []
    if done:
        parts.append(f"Completed {len(done)} step(s).")
    if fails:
        parts.append(f"{len(fails)} step(s) failed.")
    return " ".join(parts) or "Done."


def _size_str(b: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if b < 1024:
            return f"{b:.0f} {unit}" if unit == "B" else f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} TB"


# ─────────────────────────────────────────────────────────────────────────
# ENTRY
# ─────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="[ubongo] %(message)s",
    )
    uvicorn.run(
        app,
        host    = "127.0.0.1",
        port    = 8765,
        log_level = "warning",    # quiet in production
        access_log = False,
    )
