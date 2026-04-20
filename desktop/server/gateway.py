"""
Gateway — Ubongo's control plane.

Phase 2 of the autonomous agent OS plan. The sidecar already handles
the primary user's REST queries; the Gateway adds everything *else*
the agent needs to act on its own:

    /gateway/status     → what sessions, jobs, channels exist right now
    /gateway/jobs       → CRUD on scheduled prompts
    /gateway/channels   → CRUD on webhook channels
    /gateway/stream     → WebSocket event feed (tool calls, turn starts)
    /webhooks/{name}    → external system triggers a registered channel

A background pump ticks the `Scheduler` every few seconds and dispatches
due jobs through the same `run_turn` machinery the user sees — just
bound to a session whose policy was declared at registration time.

Design choices
--------------
* One `Gateway` object owns: Scheduler, WebhookRegistry, EventBus, and
  an injected `run_turn_fn` so tests can stub the LLM boundary. No
  module-level singletons.
* `router()` returns a FastAPI APIRouter the sidecar can mount; the
  pump runs as an asyncio task started via `start()`.
* Event bus is bounded per-subscriber (drops oldest on overflow) so a
  slow WebSocket client can't block the pump.
"""
from __future__ import annotations
import asyncio
import hmac
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from assistant_cli.core import (
    A2UIEventType,
    AgentTurn,
    Canvas,
    Scheduler,
    Session,
    SandboxPolicy,
    SandboxTier,
    WebhookChannel,
    WebhookRegistry,
    make_envelope,
    open_session,
)


logger = logging.getLogger("ubongo.gateway")


# ── turn runner protocol ─────────────────────────────────────────────
# Callable the Gateway invokes for every scheduled/webhook/user turn.
# The real sidecar wires this to `core.run_turn` with its provider plus
# whatever extra context (workspace, memory, tool_executor, approver)
# belongs to the host process; tests swap in a stub. Canvas is owned
# by the Gateway and injected here so tool calls like `canvas_emit`
# land on the surface that every subscriber streams from.
TurnRunner = Callable[[str, Session, "Canvas"], AgentTurn]


# ── request bodies ───────────────────────────────────────────────────

class RegisterChannelBody(BaseModel):
    name:     str
    tier:     str = "untrusted"
    allow:    List[str] = Field(default_factory=list)
    deny:     List[str] = Field(default_factory=list)
    addendum: str       = ""
    secret:   Optional[str] = None


class RegisterJobBody(BaseModel):
    name:             str
    prompt:           str
    interval_seconds: int
    tier:             str   = "untrusted"
    start_offset:     float = 0.0


class TurnBody(BaseModel):
    prompt:     str
    session_id: Optional[str] = None
    tier:       str           = "trusted"
    channel:    str           = "desktop"


# ── event bus ────────────────────────────────────────────────────────

class EventBus:
    """Tiny fan-out bus. Each subscriber gets its own bounded queue."""

    def __init__(self, *, per_subscriber_queue: int = 100) -> None:
        self._subscribers: "set[asyncio.Queue[Dict[str, Any]]]" = set()
        self._max = per_subscriber_queue

    def subscribe(self) -> "asyncio.Queue[Dict[str, Any]]":
        q: asyncio.Queue[Dict[str, Any]] = asyncio.Queue(maxsize=self._max)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: "asyncio.Queue[Dict[str, Any]]") -> None:
        self._subscribers.discard(q)

    async def publish(self, event: Dict[str, Any]) -> None:
        # Snapshot to avoid mutation during iteration when queues are
        # dropped by disconnecting clients.
        for q in list(self._subscribers):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                # Drop oldest so the slow subscriber doesn't wedge the bus.
                try:
                    q.get_nowait()
                    q.put_nowait(event)
                except Exception:
                    pass

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)


# ── gateway ──────────────────────────────────────────────────────────

@dataclass
class Gateway:
    """The control plane. Holds state; exposes a FastAPI router + pump."""
    scheduler:     Scheduler
    registry:      WebhookRegistry
    bus:           EventBus
    run_turn_fn:   TurnRunner
    tick_interval: float = 5.0

    _sessions:     Dict[str, Session] = field(default_factory=dict)
    _pump_task:    Optional[asyncio.Task] = None
    _stopping:     bool = False
    canvas:        Canvas = field(init=False)

    def __post_init__(self) -> None:
        # Canvas fans out artifact changes onto the event bus so every
        # WebSocket subscriber sees them live.
        self.canvas = Canvas(on_change=self._on_canvas_change)

    def _on_canvas_change(self, change: str, artifact) -> None:
        artifact_dict = artifact.to_dict()
        event = make_envelope(
            A2UIEventType.A2UI_RENDER,
            session_id = artifact_dict.get("session_id"),
            payload    = {"change": change, "artifact": artifact_dict},
        )
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # No running loop (e.g. synchronous test): skip fan-out.
            return
        loop.create_task(self.bus.publish(event))

    # ── public API ──────────────────────────────────────────────────

    def router(self) -> APIRouter:
        r = APIRouter()

        @r.get("/gateway/status")
        def status() -> Dict[str, Any]:
            return {
                "sessions":    [s.to_dict() for s in self._sessions.values()],
                "jobs":        [j.to_dict() for j in self.scheduler.list_jobs()],
                "channels":    [c.to_dict() for c in self.registry.list()],
                "artifacts":   len(self.canvas),
                "subscribers": self.bus.subscriber_count,
            }

        @r.get("/gateway/canvas")
        def list_artifacts(session_id: Optional[str] = None) -> Dict[str, Any]:
            items = self.canvas.list(session_id=session_id)
            return {"artifacts": [a.to_dict() for a in items]}

        @r.delete("/gateway/canvas/{artifact_id}")
        def remove_artifact(artifact_id: str) -> Dict[str, Any]:
            if not self.canvas.remove(artifact_id):
                raise HTTPException(404, f"no artifact '{artifact_id}'")
            return {"removed": artifact_id}

        @r.get("/gateway/channels")
        def list_channels() -> Dict[str, Any]:
            return {"channels": [c.to_dict() for c in self.registry.list()]}

        @r.post("/gateway/channels")
        def register_channel(body: RegisterChannelBody) -> Dict[str, Any]:
            try:
                tier = SandboxTier(body.tier.lower())
            except ValueError:
                raise HTTPException(400, f"unknown tier '{body.tier}'")
            ch = WebhookChannel(
                name     = body.name.strip(),
                tier     = tier,
                allow    = set(body.allow),
                deny     = set(body.deny),
                addendum = body.addendum,
                secret   = body.secret,
            )
            try:
                self.registry.register(ch)
            except ValueError as exc:
                raise HTTPException(400, str(exc))
            return {"registered": ch.to_dict()}

        @r.delete("/gateway/channels/{name}")
        def remove_channel(name: str) -> Dict[str, Any]:
            removed = self.registry.remove(name)
            if not removed:
                raise HTTPException(404, f"no channel named '{name}'")
            return {"removed": name}

        @r.get("/gateway/jobs")
        def list_jobs() -> Dict[str, Any]:
            return {"jobs": [j.to_dict() for j in self.scheduler.list_jobs()]}

        @r.post("/gateway/jobs")
        def add_job(body: RegisterJobBody) -> Dict[str, Any]:
            try:
                # Validate tier early so we return 400 instead of 500 later.
                SandboxTier(body.tier.lower())
            except ValueError:
                raise HTTPException(400, f"unknown tier '{body.tier}'")
            try:
                job = self.scheduler.add_job(
                    body.name,
                    body.prompt,
                    interval_seconds = body.interval_seconds,
                    tier             = body.tier.lower(),
                    start_offset     = body.start_offset,
                )
            except ValueError as exc:
                raise HTTPException(400, str(exc))
            return {"added": job.to_dict()}

        @r.delete("/gateway/jobs/{job_id}")
        def remove_job(job_id: int) -> Dict[str, Any]:
            if not self.scheduler.remove_job(job_id):
                raise HTTPException(404, f"no job with id {job_id}")
            return {"removed": job_id}

        @r.post("/webhooks/{name}")
        async def webhook(name: str, request: Request) -> Dict[str, Any]:
            ch = self.registry.find(name)
            if ch is None:
                raise HTTPException(404, f"no channel named '{name}'")

            payload_bytes = await request.body()
            if ch.secret:
                supplied = request.headers.get("x-ubongo-signature", "")
                if not hmac.compare_digest(supplied, ch.secret):
                    raise HTTPException(401, "invalid signature")

            # The payload *is* the prompt. Channels that want richer
            # routing can put JSON in and declare an addendum that
            # tells the model how to read it.
            try:
                prompt = payload_bytes.decode("utf-8").strip()
            except UnicodeDecodeError:
                raise HTTPException(400, "payload must be utf-8 text")
            if not prompt:
                raise HTTPException(400, "empty payload")

            session = open_session(channel=f"webhook:{name}", policy=ch.policy())
            self._sessions[session.id] = session

            await self.bus.publish(make_envelope(
                A2UIEventType.WEBHOOK_RECEIVED,
                session_id = session.id,
                payload    = {"channel": name},
            ))

            turn = await asyncio.to_thread(
                self.run_turn_fn, prompt, session, self.canvas
            )

            await self.bus.publish(make_envelope(
                A2UIEventType.TURN_COMPLETED,
                session_id = session.id,
                payload    = {"steps": turn.steps, "stop": turn.stop},
            ))

            return {
                "session_id": session.id,
                "final_text": turn.final_text,
                "steps":      turn.steps,
                "stop":       turn.stop,
            }

        @r.post("/gateway/turn")
        async def run_turn_endpoint(body: TurnBody) -> Dict[str, Any]:
            """
            Primary user-turn entrypoint. Tauri/CLI/any client posts a
            prompt here; the Gateway opens (or reuses) a session, runs
            the turn through the injected runner with canvas wired, and
            returns the final text + session id for the next turn.
            """
            prompt = body.prompt.strip()
            if not prompt:
                raise HTTPException(400, "empty prompt")
            try:
                tier = SandboxTier(body.tier.lower())
            except ValueError:
                raise HTTPException(400, f"unknown tier '{body.tier}'")

            session = self._sessions.get(body.session_id) if body.session_id else None
            if session is None:
                session = open_session(
                    channel = body.channel,
                    policy  = SandboxPolicy(tier=tier),
                )
                self._sessions[session.id] = session

            await self.bus.publish(make_envelope(
                A2UIEventType.TURN_STARTED,
                session_id = session.id,
                payload    = {
                    "channel": session.channel,
                    "tier":    session.policy.tier.value,
                },
            ))

            turn = await asyncio.to_thread(
                self.run_turn_fn, prompt, session, self.canvas
            )

            await self.bus.publish(make_envelope(
                A2UIEventType.TURN_COMPLETED,
                session_id = session.id,
                payload    = {"steps": turn.steps, "stop": turn.stop},
            ))

            return {
                "session_id": session.id,
                "final_text": turn.final_text,
                "steps":      turn.steps,
                "stop":       turn.stop,
                "tool_log":   turn.tool_log,
            }

        @r.get("/gateway/sessions")
        def list_sessions() -> Dict[str, Any]:
            return {"sessions": [s.to_dict() for s in self._sessions.values()]}

        @r.get("/gateway/sessions/{session_id}")
        def get_session(session_id: str) -> Dict[str, Any]:
            s = self._sessions.get(session_id)
            if s is None:
                raise HTTPException(404, f"no session '{session_id}'")
            return {"session": s.to_dict(), "history": s.history}

        @r.delete("/gateway/sessions/{session_id}")
        def close_session(session_id: str) -> Dict[str, Any]:
            if self._sessions.pop(session_id, None) is None:
                raise HTTPException(404, f"no session '{session_id}'")
            return {"closed": session_id}

        @r.websocket("/gateway/stream")
        async def stream(ws: WebSocket) -> None:
            await ws.accept()
            q = self.bus.subscribe()
            try:
                # Send a hello so clients know the channel is open.
                await ws.send_text(json.dumps({"type": "hello", "ts": time.time()}))
                while True:
                    event = await q.get()
                    await ws.send_text(json.dumps(event, default=str))
            except WebSocketDisconnect:
                pass
            except Exception as exc:
                logger.warning("gateway stream error: %s", exc)
            finally:
                self.bus.unsubscribe(q)

        return r

    # ── scheduler pump ──────────────────────────────────────────────

    async def start(self) -> None:
        """Kick off the background scheduler pump."""
        if self._pump_task is not None:
            return
        self._stopping = False
        self._pump_task = asyncio.create_task(self._pump_loop())

    async def stop(self) -> None:
        self._stopping = True
        if self._pump_task is not None:
            self._pump_task.cancel()
            try:
                await self._pump_task
            except (asyncio.CancelledError, Exception):
                pass
            self._pump_task = None

    async def _pump_loop(self) -> None:
        logger.info("gateway scheduler pump started (tick=%ss)", self.tick_interval)
        try:
            while not self._stopping:
                try:
                    await self.tick_once()
                except Exception as exc:
                    logger.warning("gateway tick failed: %s", exc)
                await asyncio.sleep(self.tick_interval)
        except asyncio.CancelledError:
            pass
        finally:
            logger.info("gateway scheduler pump stopped")

    async def tick_once(self, *, now: Optional[float] = None) -> List[str]:
        """
        Run every currently-due job once. Returns the list of session
        ids created this tick. Pure helper that tests can call without
        starting the loop.
        """
        due = self.scheduler.due_jobs(now=now)
        session_ids: List[str] = []

        for job in due:
            try:
                tier = SandboxTier(job.tier)
            except ValueError:
                tier = SandboxTier.UNTRUSTED
            session = open_session(
                channel = f"cron:{job.name}",
                policy  = SandboxPolicy(tier=tier),
            )
            self._sessions[session.id] = session
            session_ids.append(session.id)

            await self.bus.publish(make_envelope(
                A2UIEventType.CRON_TICK,
                session_id = session.id,
                payload    = {"job_id": job.id, "job_name": job.name},
            ))

            turn = await asyncio.to_thread(
                self.run_turn_fn, job.prompt, session, self.canvas
            )

            await self.bus.publish(make_envelope(
                A2UIEventType.TURN_COMPLETED,
                session_id = session.id,
                payload    = {
                    "job_id": job.id,
                    "steps":  turn.steps,
                    "stop":   turn.stop,
                },
            ))

            self.scheduler.mark_run(job.id, now=now)

        return session_ids
