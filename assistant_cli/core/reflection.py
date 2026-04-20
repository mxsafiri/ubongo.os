"""
Reflection — candidate self-updates, not silent self-mutation.

The agent learns by *proposing* changes to SOUL.md / USER.md / TOOLS.md,
never by writing them directly. Every suggestion lands in EVOLUTION.md
as a reviewable block the user can accept, reject, or ignore.

Why this matters
----------------
"Self-learning" that mutates identity files behind the user's back
drifts fast and is hard to audit. The EVOLUTION.md ledger is the
contract: the agent surfaces what it *thinks* should change; the user
remains the sole author of their companion's soul.

Public API
----------
- `LearningSuggestion` dataclass
- `append_suggestion(workspace, suggestion)` — appends a block to EVOLUTION.md
- `append_reflection(workspace, entry)` — appends one entry to REFLECTION.md
"""
from __future__ import annotations
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional


VALID_TARGETS = {"SOUL.md", "USER.md", "TOOLS.md", "MEMORY.md"}


@dataclass
class LearningSuggestion:
    """A candidate change the user can apply to one of their workspace files."""
    target:     str            # one of VALID_TARGETS
    kind:       str            # free-form label: "preference", "hard-stop", "tone", …
    summary:    str            # one-line "what and why"
    patch:      str            # exact text/bullet to add or replace
    confidence: float = 0.5    # 0.0–1.0; model's own sense of how durable this is
    ts:         float = 0.0    # filled by append_suggestion() if zero
    source:     str  = "agent" # who proposed it: agent | user | tool | cron

    def to_dict(self) -> Dict[str, Any]:
        return {
            "target":     self.target,
            "kind":       self.kind,
            "summary":    self.summary,
            "patch":      self.patch,
            "confidence": self.confidence,
            "ts":         self.ts,
            "source":     self.source,
        }


def append_suggestion(
    evolution_path: Path,
    suggestion:     LearningSuggestion,
    *,
    now:            Optional[datetime] = None,
) -> str:
    """
    Append a suggestion block to EVOLUTION.md and return the rendered block.

    The block is inserted *above* the "Ubongo appends new suggestions above
    this line" sentinel if it exists, so the newest suggestion stays at the
    top of the Pending list. If the sentinel is missing (user edited the
    file heavily), we fall back to plain append at end of file.
    """
    if suggestion.target not in VALID_TARGETS:
        raise ValueError(
            f"invalid target '{suggestion.target}'; must be one of {sorted(VALID_TARGETS)}"
        )
    if not suggestion.summary.strip():
        raise ValueError("suggestion.summary cannot be empty")
    if not suggestion.patch.strip():
        raise ValueError("suggestion.patch cannot be empty")
    if not 0.0 <= suggestion.confidence <= 1.0:
        raise ValueError("suggestion.confidence must be between 0.0 and 1.0")

    stamp = (now or datetime.now()).strftime("%Y-%m-%d %H:%M")
    block = (
        f"\n### {stamp} — {suggestion.target} / {suggestion.kind}\n"
        f"**Summary:** {suggestion.summary.strip()}\n"
        f"**Patch:**\n"
        f"> {suggestion.patch.strip().replace(chr(10), chr(10) + '> ')}\n"
        f"**Confidence:** {suggestion.confidence:.2f}\n"
        f"**Source:** {suggestion.source}\n"
        f"**Status:** pending\n"
    )

    evolution_path.parent.mkdir(parents=True, exist_ok=True)
    existing = evolution_path.read_text(encoding="utf-8") if evolution_path.exists() else ""
    sentinel_re = re.compile(r"^\*\(Ubongo appends new suggestions above this line\.\)\*\s*$", re.MULTILINE)

    if sentinel_re.search(existing):
        updated = sentinel_re.sub(block + "\n*(Ubongo appends new suggestions above this line.)*", existing, count=1)
    else:
        sep = "" if existing.endswith("\n") or not existing else "\n"
        updated = existing + sep + block

    evolution_path.write_text(updated, encoding="utf-8")
    return block


def append_reflection(
    reflection_path: Path,
    *,
    session_id:  str,
    worked:      str = "",
    didnt_work:  str = "",
    recovered:   str = "",
    open_items:  str = "",
    now:         Optional[datetime] = None,
) -> str:
    """Append a single reflection entry to REFLECTION.md and return the block."""
    stamp = (now or datetime.now()).strftime("%Y-%m-%d %H:%M")
    block = (
        f"\n### {stamp} — session {session_id}\n"
        f"- **What worked:** {worked.strip() or '—'}\n"
        f"- **What didn't:** {didnt_work.strip() or '—'}\n"
        f"- **What was recovered:** {recovered.strip() or '—'}\n"
        f"- **What's still open:** {open_items.strip() or '—'}\n"
    )
    reflection_path.parent.mkdir(parents=True, exist_ok=True)
    existing = reflection_path.read_text(encoding="utf-8") if reflection_path.exists() else ""
    sep = "" if existing.endswith("\n") or not existing else "\n"
    reflection_path.write_text(existing + sep + block, encoding="utf-8")
    return block
