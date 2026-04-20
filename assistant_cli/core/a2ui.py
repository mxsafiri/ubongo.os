"""
A2UI — typed event envelope for agent-to-UI streams.

Every event the Gateway publishes onto its bus (and therefore every
message a WebSocket subscriber or long-polling client sees) is wrapped
in this envelope. The shape is stable across event types so clients can
filter, correlate, and version without schema-sniffing each payload.

Envelope
--------
```
{
  "type":          "turn.started" | "turn.completed" | "a2ui.render" | ...
  "v":             1,                             # envelope version
  "id":            "ev_5f8b2a1c3d7e",             # unique event id
  "sessionId":     "sess_abc123" | null,          # optional session scope
  "correlationId": "corr_x9y8" | null,            # groups related events
  "ts":            1745140000.123,                # UNIX seconds (float)
  "source":        "ubongo.gateway",              # emitter identity
  "payload":       { ... }                        # type-specific body
}
```

Why a dedicated module
----------------------
The Gateway used to publish freeform dicts. That worked for three events
but fell over as we added canvas artefacts, learning suggestions, and
the user-turn endpoint: each call site invented its own keys, clients
had to memorise per-event shapes, and there was no way to carry a
correlation id across a multi-event turn.

This module centralises:

* The **vocabulary** — every event type Ubongo emits is an enum value,
  so a typo fails fast and grep can find every producer or consumer.
* The **envelope shape** — one dataclass, one `to_dict`, so the wire
  format stays stable even as new event types are added.
* The **factory** — `make_envelope()` generates the id + timestamp so
  publishers don't repeat themselves.

Keeping this in `core/` (rather than `desktop/server/gateway.py`) lets
non-Gateway code — the CLI, the scheduler pump, and eventually the
Tauri side — emit and parse the same envelope without importing the
FastAPI surface.
"""
from __future__ import annotations
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Optional


# Current envelope version. Bump only on breaking shape changes, not on
# new event types (those are additive via the enum).
A2UI_VERSION = 1


class A2UIEventType(str, Enum):
    """
    Canonical vocabulary for every event Ubongo publishes onto its bus.

    Split by category for readability; the string values are the stable
    wire identifiers and must not change without a version bump.
    """
    # Turn lifecycle — emitted by /gateway/turn, webhook handler, cron.
    TURN_STARTED   = "turn.started"
    TURN_COMPLETED = "turn.completed"

    # Tool execution — emitted by the agent loop for each call/observation.
    TOOL_CALL   = "tool.call"
    TOOL_RESULT = "tool.result"

    # A2UI render surface — canvas artefacts, created/updated/removed.
    A2UI_RENDER = "a2ui.render"

    # Learning pipeline — appended to EVOLUTION.md plus broadcast live.
    LEARNING_SUGGESTION = "learning.suggestion"
    REFLECTION_LOGGED   = "reflection.logged"

    # Autonomy primitives — scheduler + webhook + sessions.
    CRON_TICK        = "cron.tick"
    CRON_CREATED     = "cron.created"
    CRON_REMOVED     = "cron.removed"
    WEBHOOK_RECEIVED = "webhook.received"
    SESSION_OPENED   = "session.opened"
    SESSION_CLOSED   = "session.closed"


@dataclass
class A2UIEnvelope:
    """
    The typed envelope. Use `make_envelope()` to build one — direct
    construction is fine in tests but loses the defaulting.
    """
    type:          str
    payload:       Dict[str, Any] = field(default_factory=dict)
    session_id:    Optional[str]  = None
    correlation_id: Optional[str] = None
    source:        str            = "ubongo.gateway"
    v:             int            = A2UI_VERSION
    id:            str            = field(default_factory=lambda: f"ev_{uuid.uuid4().hex[:12]}")
    ts:            float          = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        """
        Serialise to the wire shape. Field names are camelCase for
        sessionId / correlationId because JS/TS consumers expect that;
        the rest stay snake-case-compatible by being single-word.
        """
        return {
            "type":          self.type,
            "v":             self.v,
            "id":            self.id,
            "sessionId":     self.session_id,
            "correlationId": self.correlation_id,
            "ts":            self.ts,
            "source":        self.source,
            "payload":       dict(self.payload),
        }


def make_envelope(
    event_type: A2UIEventType | str,
    *,
    payload:        Optional[Dict[str, Any]] = None,
    session_id:     Optional[str]            = None,
    correlation_id: Optional[str]            = None,
    source:         str                      = "ubongo.gateway",
) -> Dict[str, Any]:
    """
    Build an envelope dict ready to hand to `EventBus.publish(...)`.

    `event_type` accepts either the enum or a string; passing a string
    that isn't a known type is allowed (forward-compat for custom
    sources) but callers inside ubongo should prefer the enum.
    """
    type_str = event_type.value if isinstance(event_type, A2UIEventType) else str(event_type)
    env = A2UIEnvelope(
        type           = type_str,
        payload        = dict(payload or {}),
        session_id     = session_id,
        correlation_id = correlation_id,
        source         = source,
    )
    return env.to_dict()


__all__ = [
    "A2UI_VERSION",
    "A2UIEventType",
    "A2UIEnvelope",
    "make_envelope",
]
