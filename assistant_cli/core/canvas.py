"""
Canvas — the agent's shared surface with the user.

Phase 7 of the autonomous agent OS plan. A "canvas" is a structured
bag of artifacts the agent can emit mid-turn: a markdown block, a
code snippet, a file list, a table — anything the desktop UI can
render richly. Unlike the chat transcript, canvas state is *live*:
the agent can update an existing artifact while continuing to work.

Design choices
--------------
* The model interacts with the canvas via a single tool (`canvas_emit`)
  which the agent_loop routes here. No direct file writes, no HTML.
* Artifacts are untyped as far as this layer is concerned; the `kind`
  field tells the frontend which component to render. New kinds can
  be added without touching this module.
* A `Canvas` can carry an optional `on_change` callback. When the
  Gateway hosts the canvas, the callback publishes events on its bus
  so WebSocket subscribers get live updates.
"""
from __future__ import annotations
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


ChangeKind = str  # "created" | "updated" | "removed"
OnChange   = Callable[[ChangeKind, "Artifact"], None]


def _new_artifact_id() -> str:
    return uuid.uuid4().hex[:10]


@dataclass
class Artifact:
    id:         str
    kind:       str                      # "markdown" | "code" | "table" | "file_list" | …
    title:      str
    payload:    Dict[str, Any]           = field(default_factory=dict)
    session_id: Optional[str]            = None
    created_at: float                    = field(default_factory=time.time)
    updated_at: float                    = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id":         self.id,
            "kind":       self.kind,
            "title":      self.title,
            "payload":    self.payload,
            "session_id": self.session_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class Canvas:
    """In-memory store of live artifacts, with a change-fan-out hook."""

    def __init__(self, *, on_change: Optional[OnChange] = None) -> None:
        self._artifacts: Dict[str, Artifact] = {}
        self._on_change: Optional[OnChange]  = on_change

    # ── writes ───────────────────────────────────────────────────────

    def emit(
        self,
        *,
        kind:       str,
        title:      str,
        payload:    Optional[Dict[str, Any]] = None,
        session_id: Optional[str]            = None,
        id:         Optional[str]            = None,
    ) -> Artifact:
        """Create a new artifact (or replace one with the supplied id)."""
        kind  = (kind or "").strip()
        title = (title or "").strip()
        if not kind:
            raise ValueError("canvas.emit requires a non-empty 'kind'.")
        if not title:
            raise ValueError("canvas.emit requires a non-empty 'title'.")

        artifact = Artifact(
            id         = id or _new_artifact_id(),
            kind       = kind,
            title      = title,
            payload    = dict(payload or {}),
            session_id = session_id,
        )
        existed = artifact.id in self._artifacts
        self._artifacts[artifact.id] = artifact
        self._fire("updated" if existed else "created", artifact)
        return artifact

    def update(
        self,
        artifact_id: str,
        *,
        title:   Optional[str]            = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Optional[Artifact]:
        """Mutate an existing artifact. Returns the updated copy, or None."""
        current = self._artifacts.get(artifact_id)
        if current is None:
            return None
        if title is not None:
            current.title = title.strip() or current.title
        if payload is not None:
            current.payload = dict(payload)
        current.updated_at = time.time()
        self._fire("updated", current)
        return current

    def remove(self, artifact_id: str) -> bool:
        current = self._artifacts.pop(artifact_id, None)
        if current is None:
            return False
        self._fire("removed", current)
        return True

    # ── reads ────────────────────────────────────────────────────────

    def get(self, artifact_id: str) -> Optional[Artifact]:
        return self._artifacts.get(artifact_id)

    def list(self, *, session_id: Optional[str] = None) -> List[Artifact]:
        items = list(self._artifacts.values())
        if session_id is not None:
            items = [a for a in items if a.session_id == session_id]
        items.sort(key=lambda a: a.created_at)
        return items

    def clear(self, *, session_id: Optional[str] = None) -> int:
        """Remove every artifact (optionally scoped to a session). Returns count."""
        target = [a.id for a in self.list(session_id=session_id)]
        for aid in target:
            self.remove(aid)
        return len(target)

    def __len__(self) -> int:
        return len(self._artifacts)

    # ── internals ────────────────────────────────────────────────────

    def _fire(self, kind: ChangeKind, artifact: Artifact) -> None:
        if self._on_change is None:
            return
        try:
            self._on_change(kind, artifact)
        except Exception:
            # A faulty subscriber must not break the agent's turn.
            pass
