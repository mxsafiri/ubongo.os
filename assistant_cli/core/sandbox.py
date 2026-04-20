"""
Sandbox — tool-execution policy tiers.

Krentsel's point: every autonomous agent that can call tools is
"insecure by default" unless the harness gates execution. Ubongo
classifies each tool by risk and runs tool calls through a policy
that can allow, require approval, or block outright.

Three tiers
-----------
* TRUSTED    — full-privilege, main user session. Allow everything.
* REVIEW     — ask the user before running anything that writes,
               deletes, or reaches the network. Read-only ops pass.
* UNTRUSTED  — deny-by-default. Only SAFE tools run without review.
               Intended for webhook-triggered or messaging-channel
               sessions where the input is not from the primary user.

Risk levels
-----------
* SAFE         — read-only. file search, system_info, memory_recall,
                 memory_search, load_skill.
* WRITE        — mutates user state on the local machine. memory_save,
                 memory_forget, file create/move, app open/close,
                 create_document.
* DESTRUCTIVE  — irreversible or high-blast-radius. delete, sort_files,
                 close-running-apps.
* NETWORK      — reaches external services. web_search, web_action.
* CONTROL      — hardware/UI hijack. screen_control click/type/hotkey.

This module is pure policy. It does not execute tools — it just
decides whether a given call is allowed, needs approval, or is denied.
The agent_loop honours the decision.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, Optional, Set


class SandboxTier(str, Enum):
    TRUSTED   = "trusted"
    REVIEW    = "review"
    UNTRUSTED = "untrusted"


class RiskLevel(str, Enum):
    SAFE        = "safe"          # read-only, no side effects
    WRITE       = "write"         # mutates local state (recoverable)
    DESTRUCTIVE = "destructive"   # irreversible, high blast radius
    NETWORK     = "network"       # reaches external services
    CONTROL     = "control"       # hardware / UI hijack


# ── tool → risk mapping ────────────────────────────────────────────────
#
# One source of truth for every tool Ubongo knows about. Any tool not
# listed here is treated as UNKNOWN (which the policy blocks in REVIEW
# and UNTRUSTED tiers unless explicitly allowed).

TOOL_RISK: Dict[str, RiskLevel] = {
    # workspace built-ins
    "load_skill":     RiskLevel.SAFE,
    "memory_recall":  RiskLevel.SAFE,
    "memory_save":    RiskLevel.WRITE,
    "memory_forget":  RiskLevel.WRITE,

    # autonomy primitives — the child session has its own policy, so
    # the spawn itself is just WRITE (records a session) at this layer.
    "sessions_spawn": RiskLevel.WRITE,

    # canvas emit — pushes a render artifact to the shared UI surface.
    "canvas_emit":    RiskLevel.WRITE,

    # file index (read-only — searches metadata, doesn't touch disk)
    "memory_search":  RiskLevel.SAFE,

    # system probes
    "system_info":    RiskLevel.SAFE,

    # file operations — per-action risk is set at decision time in
    # classify_call() because file_operation multiplexes actions.
    "file_operation":  RiskLevel.WRITE,

    # apps
    "app_control":     RiskLevel.WRITE,
    "music_control":   RiskLevel.WRITE,

    # doc creation
    "create_document": RiskLevel.WRITE,

    # network
    "web_search":      RiskLevel.NETWORK,
    "web_action":      RiskLevel.NETWORK,

    # screen / input hijack — per-action risk in classify_call()
    "screen_control":  RiskLevel.CONTROL,
}

# file_operation actions that are destructive regardless of tier.
_DESTRUCTIVE_FILE_ACTIONS: Set[str] = {"delete_item", "sort_files"}

# screen_control actions that are passively safe (read-only).
_SAFE_SCREEN_ACTIONS: Set[str] = {"screenshot", "screen_size", "describe_screen"}


# ── decision output ────────────────────────────────────────────────────

class SandboxDecision(str, Enum):
    ALLOW          = "allow"
    REQUIRE_REVIEW = "require_review"
    DENY           = "deny"


@dataclass
class ApprovalRequest:
    """Passed to an Approver callable when REVIEW is required."""
    tool_name:  str
    tool_input: Dict[str, Any]
    risk:       RiskLevel
    reason:     str

    def summary(self) -> str:
        return (
            f"[{self.risk.value.upper()}] {self.tool_name} "
            f"— {self.reason}"
        )


Approver = Callable[[ApprovalRequest], bool]
"""Callable that receives an ApprovalRequest and returns True to allow."""


# ── policy ─────────────────────────────────────────────────────────────

@dataclass
class SandboxPolicy:
    """
    A sandbox profile for one session.

    The `allow` and `deny` sets override the default tier behaviour for
    specific tool names — useful when a particular session should grant
    elevated access (e.g. the main Tauri session explicitly allowing
    screen_control actions) or lock something out entirely.
    """
    tier:  SandboxTier               = SandboxTier.TRUSTED
    allow: Set[str]                  = field(default_factory=set)
    deny:  Set[str]                  = field(default_factory=set)

    @classmethod
    def trusted(cls) -> "SandboxPolicy":
        return cls(tier=SandboxTier.TRUSTED)

    @classmethod
    def review(cls, *, allow: Optional[Set[str]] = None) -> "SandboxPolicy":
        return cls(tier=SandboxTier.REVIEW, allow=set(allow or set()))

    @classmethod
    def untrusted(cls, *, allow: Optional[Set[str]] = None) -> "SandboxPolicy":
        return cls(tier=SandboxTier.UNTRUSTED, allow=set(allow or set()))

    # ── decision logic ────────────────────────────────────────────

    def classify(self, tool_name: str, tool_input: Dict[str, Any]) -> tuple[SandboxDecision, RiskLevel, str]:
        """
        Decide how to handle a proposed tool call.

        Returns (decision, risk, reason).
        """
        if tool_name in self.deny:
            return SandboxDecision.DENY, RiskLevel.SAFE, "tool is on the session deny-list"

        risk = _effective_risk(tool_name, tool_input)

        if tool_name in self.allow:
            return SandboxDecision.ALLOW, risk, "tool is on the session allow-list"

        # Tier rules
        if self.tier == SandboxTier.TRUSTED:
            return SandboxDecision.ALLOW, risk, "trusted session"

        if self.tier == SandboxTier.REVIEW:
            if risk == RiskLevel.SAFE:
                return SandboxDecision.ALLOW, risk, "read-only"
            return SandboxDecision.REQUIRE_REVIEW, risk, f"{risk.value} action in review session"

        # UNTRUSTED
        if risk == RiskLevel.SAFE:
            return SandboxDecision.ALLOW, risk, "read-only under untrusted tier"
        return SandboxDecision.DENY, risk, (
            f"{risk.value} action denied under untrusted tier "
            "(add tool to policy.allow to override)"
        )


# ── built-in approvers ────────────────────────────────────────────────

def always_allow(_: ApprovalRequest) -> bool:
    """Rubber-stamp every request. Use only in tests."""
    return True


def always_deny(_: ApprovalRequest) -> bool:
    """Deny every request. Useful as the default for non-interactive sessions."""
    return False


def cli_approver(request: ApprovalRequest) -> bool:
    """
    Interactive CLI approver. Prints the summary and reads y/N from stdin.

    Only safe for use in the foreground CLI. Don't pass this to background
    workers — it would hang waiting on stdin that nobody is typing into.
    """
    try:
        answer = input(f"[sandbox] approve {request.summary()}? [y/N] ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        return False
    return answer in {"y", "yes"}


# ── helpers ───────────────────────────────────────────────────────────

def _effective_risk(tool_name: str, tool_input: Dict[str, Any]) -> RiskLevel:
    """
    Resolve the risk level for a specific call, consulting both the
    static TOOL_RISK map and per-action heuristics for tools that
    multiplex several operations behind one name.
    """
    base = TOOL_RISK.get(tool_name)

    if tool_name == "file_operation":
        action = str((tool_input or {}).get("action", "")).lower()
        if action in _DESTRUCTIVE_FILE_ACTIONS:
            return RiskLevel.DESTRUCTIVE
        if action == "search_files":
            return RiskLevel.SAFE
        return RiskLevel.WRITE

    if tool_name == "screen_control":
        action = str((tool_input or {}).get("action", "")).lower()
        if action in _SAFE_SCREEN_ACTIONS:
            return RiskLevel.SAFE
        return RiskLevel.CONTROL

    if base is None:
        # Unknown tool — treat conservatively.
        return RiskLevel.WRITE

    return base
