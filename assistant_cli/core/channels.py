"""
Channels — declarative input surfaces for Ubongo.

A channel is a named way the agent can be woken up:

    main       → primary CLI / desktop user
    webhook:*  → HTTP-triggered by an external system (Slack, GitHub…)
    cron:*     → scheduler-triggered recurring job
    subagent   → internal, spawned by sessions_spawn

This module is just the *registry*: you declare a channel, hand it a
sandbox tier + optional system-prompt addendum, and the sidecar (or
future gateway) uses that config when it opens a session for an
incoming payload. The HTTP wiring itself lives outside core.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, Optional, Set

from assistant_cli.core.sandbox import SandboxPolicy, SandboxTier


@dataclass
class WebhookChannel:
    """Configuration for one webhook-triggered channel."""
    name:       str
    tier:       SandboxTier    = SandboxTier.UNTRUSTED
    allow:      Set[str]       = field(default_factory=set)
    deny:       Set[str]       = field(default_factory=set)
    addendum:   str            = ""   # extra system-prompt text for this channel
    secret:     Optional[str]  = None # shared secret the HTTP handler verifies

    def policy(self) -> SandboxPolicy:
        return SandboxPolicy(tier=self.tier, allow=set(self.allow), deny=set(self.deny))

    def to_dict(self) -> dict:
        return {
            "name":         self.name,
            "tier":         self.tier.value,
            "allow":        sorted(self.allow),
            "deny":         sorted(self.deny),
            "addendum":     self.addendum,
            "has_secret":   bool(self.secret),
        }


class WebhookRegistry:
    """In-memory registry of webhook channels keyed by name."""

    def __init__(self) -> None:
        self._channels: Dict[str, WebhookChannel] = {}

    def register(self, channel: WebhookChannel) -> None:
        if not channel.name.strip():
            raise ValueError("WebhookChannel.name must be non-empty.")
        self._channels[channel.name] = channel

    def find(self, name: str) -> Optional[WebhookChannel]:
        return self._channels.get(name)

    def remove(self, name: str) -> bool:
        return self._channels.pop(name, None) is not None

    def list(self) -> list[WebhookChannel]:
        return sorted(self._channels.values(), key=lambda c: c.name)

    def __len__(self) -> int:
        return len(self._channels)


# Process-wide default registry. The sidecar imports this and mounts
# its HTTP routes against it; tests use their own instance.
default_registry = WebhookRegistry()
