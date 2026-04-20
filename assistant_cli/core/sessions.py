"""
Sessions — isolation boundaries for agent turns.

Every turn belongs to a session: the primary CLI, a webhook-triggered
handler, a cron job, or a sub-agent spawned by the model. Sessions
own their own history and sandbox tier, so untrusted input can't
leak into the user's main conversation and vice versa.

Why this matters
----------------
Krentsel's point: "session boundaries" are what turns a chatbot into
an OS. Without them, a webhook payload shares context with whatever
the user was typing; with them, you can grant narrow capabilities to
a specific channel and trust that they stop at the session edge.

This module is the data model and a spawn helper — the agent_loop
runs turns *for* sessions, and the sandbox policy attaches *to* them.
"""
from __future__ import annotations
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from assistant_cli.core.sandbox import SandboxPolicy, SandboxTier


@dataclass
class Session:
    """A single conversation scope.

    `history` is a plain list of {role, content} dicts, ready for the
    agent_loop to consume. A child session starts with an empty
    history; it is never backfilled from the parent.
    """
    id:         str
    channel:    str
    policy:     SandboxPolicy
    history:    List[Dict[str, Any]] = field(default_factory=list)
    parent_id:  Optional[str]        = None
    started_at: float                = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "channel":     self.channel,
            "tier":        self.policy.tier.value,
            "parent_id":   self.parent_id,
            "started_at":  self.started_at,
            "started_iso": datetime.fromtimestamp(self.started_at).isoformat(timespec="seconds"),
            "turns":       len(self.history),
        }


def new_session_id() -> str:
    """Short, collision-resistant session id (first 12 chars of a uuid4)."""
    return uuid.uuid4().hex[:12]


def open_session(
    *,
    channel: str,
    policy:  Optional[SandboxPolicy] = None,
) -> Session:
    """Start a brand-new top-level session (no parent)."""
    return Session(
        id       = new_session_id(),
        channel  = channel,
        policy   = policy or SandboxPolicy.trusted(),
    )


def spawn_session(
    *,
    parent:  Session,
    channel: str                      = "subagent",
    tier:    Optional[SandboxTier]    = None,
) -> Session:
    """
    Create a child session from a parent.

    The child gets a fresh history and, by default, a *more* restricted
    policy than its parent. If the parent is TRUSTED and no tier is
    supplied, the child lands in UNTRUSTED — sub-agents shouldn't
    automatically inherit their parent's privilege.
    """
    if tier is None:
        # Default: step down one notch.
        child_tier = {
            SandboxTier.TRUSTED:   SandboxTier.UNTRUSTED,
            SandboxTier.REVIEW:    SandboxTier.UNTRUSTED,
            SandboxTier.UNTRUSTED: SandboxTier.UNTRUSTED,
        }[parent.policy.tier]
    else:
        child_tier = tier

    child_policy = SandboxPolicy(tier=child_tier)
    return Session(
        id        = new_session_id(),
        channel   = channel,
        policy    = child_policy,
        parent_id = parent.id,
    )
