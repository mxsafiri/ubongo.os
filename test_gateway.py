"""
Smoke tests for the Gateway control plane.

Covers the HTTP surface, the scheduler pump, and the webhook dispatch
path — without spinning up the full sidecar. A dummy `run_turn_fn`
stands in for the LLM boundary so tests run offline and fast.

Run: python3 test_gateway.py
"""
from __future__ import annotations
import asyncio
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

# Make the sibling gateway module importable.
_here = Path(__file__).resolve().parent
sys.path.insert(0, str(_here / "desktop" / "server"))

from gateway import EventBus, Gateway  # noqa: E402

from assistant_cli.core.agent_loop import AgentTurn  # noqa: E402
from assistant_cli.core.scheduler import Scheduler   # noqa: E402
from assistant_cli.core.channels import WebhookRegistry  # noqa: E402


def _dummy_runner(prompt: str, session, canvas) -> AgentTurn:
    """Stand-in for run_turn: echoes the prompt and writes a canvas note."""
    canvas.emit(
        kind       = "note",
        title      = f"turn in {session.channel}",
        payload    = {"prompt": prompt},
        session_id = session.id,
    )
    session.history.append({"role": "user", "content": prompt})
    session.history.append({"role": "assistant", "content": f"echo: {prompt}"})
    return AgentTurn(
        final_text = f"echo: {prompt}",
        steps      = 1,
        tool_log   = [],
        stop       = "end_turn",
    )


def _build_gateway(tmp_path: Path, tick: float = 0.1) -> Gateway:
    return Gateway(
        scheduler     = Scheduler(tmp_path),
        registry      = WebhookRegistry(),
        bus           = EventBus(),
        run_turn_fn   = _dummy_runner,
        tick_interval = tick,
    )


def _build_app(gw: Gateway) -> FastAPI:
    app = FastAPI()
    app.include_router(gw.router())
    return app


# ── status + channel CRUD ─────────────────────────────────────────────

def test_status_empty(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    with TestClient(app) as client:
        r = client.get("/gateway/status")
        assert r.status_code == 200
        body = r.json()
        assert body["sessions"] == []
        assert body["jobs"]     == []
        assert body["channels"] == []


def test_channel_register_list_remove(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    with TestClient(app) as client:
        r = client.post("/gateway/channels", json={
            "name":   "github",
            "tier":   "untrusted",
            "secret": "shh",
        })
        assert r.status_code == 200
        assert r.json()["registered"]["name"] == "github"

        r = client.get("/gateway/channels")
        assert [c["name"] for c in r.json()["channels"]] == ["github"]

        r = client.delete("/gateway/channels/github")
        assert r.status_code == 200
        assert r.json() == {"removed": "github"}

        r = client.delete("/gateway/channels/github")
        assert r.status_code == 404


def test_channel_register_rejects_unknown_tier(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    with TestClient(app) as client:
        r = client.post("/gateway/channels", json={"name": "x", "tier": "nope"})
        assert r.status_code == 400


# ── job CRUD ─────────────────────────────────────────────────────────

def test_job_register_list_remove(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    with TestClient(app) as client:
        r = client.post("/gateway/jobs", json={
            "name":             "morning-brief",
            "prompt":           "Summarise my day",
            "interval_seconds": 3600,
            "tier":             "review",
        })
        assert r.status_code == 200
        job_id = r.json()["added"]["id"]

        r = client.get("/gateway/jobs")
        assert len(r.json()["jobs"]) == 1

        r = client.delete(f"/gateway/jobs/{job_id}")
        assert r.status_code == 200

        r = client.delete(f"/gateway/jobs/{job_id}")
        assert r.status_code == 404


def test_job_register_rejects_bad_interval(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    with TestClient(app) as client:
        r = client.post("/gateway/jobs", json={
            "name": "x", "prompt": "y", "interval_seconds": 0,
        })
        assert r.status_code == 400


# ── webhook dispatch ─────────────────────────────────────────────────

def test_webhook_dispatches_to_runner(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    with TestClient(app) as client:
        client.post("/gateway/channels", json={"name": "slack", "tier": "untrusted"})

        r = client.post("/webhooks/slack", content="hello from slack")
        assert r.status_code == 200
        body = r.json()
        assert body["final_text"] == "echo: hello from slack"
        assert body["session_id"]

        # Session is now tracked.
        status = client.get("/gateway/status").json()
        assert any(s["channel"] == "webhook:slack" for s in status["sessions"])


def test_webhook_404_for_unknown_channel(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    with TestClient(app) as client:
        r = client.post("/webhooks/nope", content="x")
        assert r.status_code == 404


def test_webhook_requires_signature_when_secret_set(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    with TestClient(app) as client:
        client.post("/gateway/channels", json={
            "name": "gh", "tier": "untrusted", "secret": "abc123",
        })
        r = client.post("/webhooks/gh", content="payload")
        assert r.status_code == 401

        r = client.post(
            "/webhooks/gh",
            content="payload",
            headers={"x-ubongo-signature": "abc123"},
        )
        assert r.status_code == 200


# ── user turn endpoint ───────────────────────────────────────────────

def test_turn_opens_new_session_and_runs(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    with TestClient(app) as client:
        r = client.post("/gateway/turn", json={"prompt": "hello world"})
        assert r.status_code == 200
        body = r.json()
        assert body["final_text"] == "echo: hello world"
        assert body["session_id"]
        assert body["stop"] == "end_turn"

        # Session is now trackable.
        r = client.get("/gateway/sessions")
        assert len(r.json()["sessions"]) == 1
        assert r.json()["sessions"][0]["channel"] == "desktop"


def test_turn_reuses_session_when_id_provided(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    with TestClient(app) as client:
        r1 = client.post("/gateway/turn", json={"prompt": "first"})
        sid = r1.json()["session_id"]

        r2 = client.post("/gateway/turn", json={"prompt": "second", "session_id": sid})
        assert r2.json()["session_id"] == sid

        # History carried forward: two user + two assistant entries.
        r = client.get(f"/gateway/sessions/{sid}")
        assert r.status_code == 200
        assert len(r.json()["history"]) == 4


def test_turn_rejects_empty_prompt(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    with TestClient(app) as client:
        r = client.post("/gateway/turn", json={"prompt": "   "})
        assert r.status_code == 400


def test_turn_rejects_unknown_tier(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    with TestClient(app) as client:
        r = client.post("/gateway/turn", json={"prompt": "hi", "tier": "nope"})
        assert r.status_code == 400


def test_turn_publishes_start_and_complete_events(tmp_path: Path) -> None:
    gw = _build_gateway(tmp_path)

    async def scenario() -> None:
        q = gw.bus.subscribe()
        # Open session first so we can drive the turn in-loop without
        # FastAPI's sync TestClient thread — keeps the queue readable.
        from assistant_cli.core import SandboxPolicy, SandboxTier, open_session
        session = open_session(
            channel = "desktop",
            policy  = SandboxPolicy(tier=SandboxTier.TRUSTED),
        )
        gw._sessions[session.id] = session

        await gw.bus.publish({"type": "turn_started", "session_id": session.id})
        await gw.bus.publish({"type": "turn_complete", "session_id": session.id})

        first  = await asyncio.wait_for(q.get(), timeout=1.0)
        second = await asyncio.wait_for(q.get(), timeout=1.0)
        assert first["type"]  == "turn_started"
        assert second["type"] == "turn_complete"

    asyncio.run(scenario())


def test_session_close_removes_it(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    with TestClient(app) as client:
        sid = client.post("/gateway/turn", json={"prompt": "x"}).json()["session_id"]

        r = client.delete(f"/gateway/sessions/{sid}")
        assert r.status_code == 200
        assert r.json() == {"closed": sid}

        r = client.delete(f"/gateway/sessions/{sid}")
        assert r.status_code == 404


# ── scheduler pump ───────────────────────────────────────────────────

def test_tick_once_runs_due_jobs(tmp_path: Path) -> None:
    gw = _build_gateway(tmp_path)

    # One job ready now, one not.
    gw.scheduler.add_job("ready",     "hi",  interval_seconds=60, start_offset=-1.0)
    gw.scheduler.add_job("not-ready", "bye", interval_seconds=60, start_offset=3600.0)

    session_ids = asyncio.run(gw.tick_once())
    assert len(session_ids) == 1
    assert len(gw._sessions) == 1

    # mark_run advanced next_run_at, so a second tick at the same clock
    # shouldn't pick it up again.
    session_ids_2 = asyncio.run(gw.tick_once())
    assert session_ids_2 == []


# ── canvas surface ───────────────────────────────────────────────────

def test_gateway_canvas_listing(tmp_path: Path) -> None:
    gw  = _build_gateway(tmp_path)
    app = _build_app(gw)
    # Emit directly via the gateway's canvas; simulates what the agent_loop
    # would do when run_turn passes gw.canvas in.
    gw.canvas.emit(kind="note", title="tick 1", payload={"n": 1}, session_id="s1")
    gw.canvas.emit(kind="note", title="tick 2", payload={"n": 2}, session_id="s2")

    with TestClient(app) as client:
        r = client.get("/gateway/canvas")
        assert r.status_code == 200
        assert len(r.json()["artifacts"]) == 2

        r = client.get("/gateway/canvas", params={"session_id": "s1"})
        assert [a["title"] for a in r.json()["artifacts"]] == ["tick 1"]

        art_id = r.json()["artifacts"][0]["id"]
        r = client.delete(f"/gateway/canvas/{art_id}")
        assert r.status_code == 200
        r = client.delete(f"/gateway/canvas/{art_id}")
        assert r.status_code == 404


def test_gateway_canvas_change_publishes_event(tmp_path: Path) -> None:
    gw = _build_gateway(tmp_path)

    async def scenario() -> None:
        q = gw.bus.subscribe()
        gw.canvas.emit(kind="markdown", title="plan", payload={"body": "x"})
        # on_change runs synchronously and schedules an async publish;
        # yielding lets that task run.
        await asyncio.sleep(0)
        event = await asyncio.wait_for(q.get(), timeout=1.0)
        assert event["type"] == "canvas_artifact"
        assert event["change"] == "created"
        assert event["artifact"]["title"] == "plan"

    asyncio.run(scenario())


# ── event bus behaviour ──────────────────────────────────────────────

def test_event_bus_drops_oldest_when_full() -> None:
    async def scenario() -> None:
        bus = EventBus(per_subscriber_queue=2)
        q = bus.subscribe()
        await bus.publish({"n": 1})
        await bus.publish({"n": 2})
        await bus.publish({"n": 3})   # forces drop-oldest
        assert q.qsize() == 2
        first  = await q.get()
        second = await q.get()
        # Oldest (n=1) was evicted.
        assert {first["n"], second["n"]} == {2, 3}

    asyncio.run(scenario())


# ── manual runner ────────────────────────────────────────────────────

if __name__ == "__main__":
    import tempfile
    failures = 0
    tests = [
        ("status_empty",                          test_status_empty),
        ("channel_register_list_remove",          test_channel_register_list_remove),
        ("channel_register_rejects_unknown_tier", test_channel_register_rejects_unknown_tier),
        ("job_register_list_remove",              test_job_register_list_remove),
        ("job_register_rejects_bad_interval",     test_job_register_rejects_bad_interval),
        ("webhook_dispatches_to_runner",          test_webhook_dispatches_to_runner),
        ("webhook_404_for_unknown_channel",       test_webhook_404_for_unknown_channel),
        ("webhook_requires_signature_when_secret_set",
                                                  test_webhook_requires_signature_when_secret_set),
        ("turn_opens_new_session_and_runs",       test_turn_opens_new_session_and_runs),
        ("turn_reuses_session_when_id_provided",  test_turn_reuses_session_when_id_provided),
        ("turn_rejects_empty_prompt",             test_turn_rejects_empty_prompt),
        ("turn_rejects_unknown_tier",             test_turn_rejects_unknown_tier),
        ("turn_publishes_start_and_complete_events",
                                                  test_turn_publishes_start_and_complete_events),
        ("session_close_removes_it",              test_session_close_removes_it),
        ("tick_once_runs_due_jobs",               test_tick_once_runs_due_jobs),
        ("gateway_canvas_listing",                test_gateway_canvas_listing),
        ("gateway_canvas_change_publishes_event", test_gateway_canvas_change_publishes_event),
        ("event_bus_drops_oldest_when_full",      test_event_bus_drops_oldest_when_full),
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
            import traceback
            traceback.print_exc()
    sys.exit(1 if failures else 0)
