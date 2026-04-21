# Changelog

All notable changes to Ubongo OS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.10] - 2026-04-21

### Added — First-launch onboarding wizard (name + tone + invite)

After users install the DMG, the first thing they saw was a blank
invite-code field. The app never asked what to call the assistant, or
how it should speak. This turns the single-step invite gate into a
four-step wizard that mirrors the landing-page aesthetic (mono labels,
section-number dividers, hairline accents, indigo/violet gradient).

- **Four steps** (`desktop/src/components/Onboarding.tsx`):
  - `001 · WELCOME` — orb, UBONGO wordmark, "BUILT IN TANZANIA" footer,
    single BEGIN call-to-action.
  - `002 · NAME` — 32-char input with Pencil icon and three starter
    chips (Ubongo / Mshikaji / Akili). Swahili names highlighted in
    the helper copy.
  - `003 · TONE` — three cards (CONCISE / WARM / FORMAL), each with a
    one-line register blurb. Heading uses the name chosen in step 2
    ("How should Mshikaji talk to you?").
  - `004 · INVITE` — existing closed-beta invite-code flow preserved
    (validating / success / error phases, Enter-to-submit, "Request an
    invite" link out to the landing page).
- **Profile persistence** — `OnboardingProfile { agentName, tone,
  completedAt }` lands in `localStorage['ubongo.profile.v1']` on
  successful activation. Exported `loadProfile()` helper reads it back.
  Pure-frontend: no new Tauri commands or Python endpoints needed —
  the LLM runtime can pick up the profile whenever it catches up.
- **App.tsx wire-up** — the always-visible ask bar placeholder now
  reads `Ask ${profile.agentName || 'ubongo'}`, so the assistant's
  chosen name is visible in every state after onboarding completes.
- **Step-ladder chrome** — numbered `001 002 003 004` progress indicator
  across the top with hairline connectors that fill indigo as the user
  advances. `AnimatePresence` with `mode="wait"` + single-child keyed
  wrapper for clean transitions between steps.
- Guarded `goNext` / `goBack` to use functional state (`s < 4 ? s+1 : s`)
  so rapid clicks can't push `step` past 4 (would have rendered blank).

## [0.5.9] - 2026-04-20

### Added — Autonomy tools (cron + webhooks) exposed to the model

The agent can now schedule itself and open webhook channels through
the same `run_turn` pathway users drive. Previously these primitives
lived on the Gateway but were only reachable via HTTP — so the LLM
couldn't set up a morning brief or a GitHub webhook in response to a
conversation.

- **Six new model-callable tools**:
  - `cron_create` — schedule a recurring prompt. Accepts name, prompt,
    interval_seconds, tier (default 'untrusted'), optional start_offset.
  - `cron_list` — enumerate scheduled jobs.
  - `cron_delete` — remove a job by id.
  - `webhook_register` — open a `/webhooks/{name}` channel with tier,
    optional HMAC secret, allow/deny tool overrides, and prompt addendum.
  - `webhook_list` — list registered channels.
  - `webhook_remove` — unregister a channel by name.
- **`run_turn` grew two optional kwargs**: `scheduler` and `registry`.
  When absent, the matching tools return a clear "no scheduler/registry
  wired" error instead of crashing — so tests and pre-gateway flows
  keep working. Existing call sites are unaffected.
- **Sandbox classification** for all six (CRUD = WRITE, list = SAFE).
  REVIEW tier now gates both create and delete behind user approval;
  UNTRUSTED webhook-triggered sessions can't self-schedule without an
  explicit allow-list entry.
- 7 new tests covering cron create/list/delete, webhook register/list/
  remove, bad-tier rejection, no-scheduler fallback, and the sandbox
  classification invariant.

## [0.5.8] - 2026-04-20

### Added — Typed A2UI event envelope

Every event the Gateway publishes now carries a stable envelope shape.
Clients (WebSocket subscribers, the Tauri side, future CLIs) can filter,
correlate, and version without schema-sniffing each payload.

- **New `assistant_cli/core/a2ui.py` module**:
  - `A2UIEventType` enum — canonical vocabulary for every event
    (`turn.started`, `turn.completed`, `a2ui.render`, `tool.call`,
    `tool.result`, `learning.suggestion`, `cron.tick`, `cron.created`,
    `cron.removed`, `webhook.received`, `session.opened`, `session.closed`,
    `reflection.logged`).
  - `A2UIEnvelope` dataclass + `make_envelope()` factory. Stable shape:
    `{type, v, id, sessionId, correlationId, ts, source, payload}`.
  - `A2UI_VERSION = 1` — bumps only on breaking shape changes, not on
    new event types (those are additive).
- **Gateway rewired**: every `bus.publish(...)` site now goes through
  `make_envelope(...)`. Covers `turn.started` / `turn.completed` (user +
  webhook + cron), `webhook.received`, `cron.tick`, and the canvas
  fan-out (`a2ui.render` with `payload.change` + `payload.artifact`).
- **Event types renamed on the wire** for consistency with the enum:
  - `canvas_artifact` → `a2ui.render`
  - `turn_started`    → `turn.started`
  - `turn_complete`   → `turn.completed`
  - `cron_tick`       → `cron.tick`
  - `webhook_received`→ `webhook.received`
- 4 new tests: envelope shape, raw-string type allowed for custom
  sources, id uniqueness, webhook path publishes envelopes.

## [0.5.7] - 2026-04-20

### Added — Identity files + learning pipeline

The workspace now seeds the full identity contract, and the agent has
a safe way to propose durable updates without silently mutating the
user's files.

- **Four new seeded files** in `~/.ubongo/`:
  - `BOOTSTRAP.md` — one-time onboarding script (name, tone, boundaries).
  - `USER.md` — stable profile: facts, prefs, hard-stops, safe-to-automate.
  - `EVOLUTION.md` — append-only ledger of candidate changes awaiting
    user review. Format: target-file, summary, patch, confidence, status.
  - `REFLECTION.md` — append-only hindsight journal (what worked,
    what didn't, what was recovered, what's still open).
- **`USER.md` now injected into the system prompt** after SOUL, before
  AGENTS. `BOOTSTRAP.md`, `EVOLUTION.md`, and `REFLECTION.md` are
  deliberately *not* loaded every turn — onboarding is one-off, and the
  other two are tool-accessed on demand.
- **`core.reflection`** module with `LearningSuggestion` + writers
  (`append_suggestion`, `append_reflection`) that validate inputs and
  insert above the Pending sentinel in EVOLUTION.md so the newest
  suggestion stays on top.
- **Two new tools wired through `run_turn`**:
  - `learning_suggest` — agent proposes a SOUL/USER/TOOLS/MEMORY update.
    Always lands in EVOLUTION.md (never the target file). Also emits a
    `learning_suggestion` canvas artifact so live UIs pick it up.
  - `reflection_log` — structured post-turn hindsight into REFLECTION.md.
  Both are `WRITE` risk — review/untrusted tiers gate them behind
  approval.
- 8 new tests (workspace seeds, prompt assembly, reflection writers,
  learning_suggest / reflection_log tool paths, validation rejection).

### Why
"Self-learning" that rewrites SOUL/USER silently is indistinguishable
from prompt drift. EVOLUTION.md makes every proposed change visible,
dated, and reversible — the user stays the author of their companion.
The BOOTSTRAP/USER files close the onboarding gap called out in the
audit: the kernel primitives (soul files) are now reachable from the
first-run experience.

## [0.5.6] - 2026-04-20

### Added — Primary user-turn entrypoint

The kernel could already run turns for cron jobs and webhooks; it now
runs them for the primary user too. Anything with an HTTP client
(Tauri, CLI, curl, a future browser extension) can drive a real
`run_turn` through the Gateway with session continuity and canvas
wired end-to-end.

- **`POST /gateway/turn`** — accepts `{prompt, session_id?, tier?,
  channel?}`. Opens a session on first call, reuses it when the
  caller echoes `session_id` back, and returns
  `{session_id, final_text, steps, stop, tool_log}`.
- **`GET /gateway/sessions`**, **`GET /gateway/sessions/{id}`** (with
  history), and **`DELETE /gateway/sessions/{id}`** — minimal
  inspection + teardown surface so clients can show what's live and
  close sessions they're done with.
- **`TurnRunner` signature extended** to `(prompt, session, canvas)`
  so every turn — user, webhook, cron — lands tool output on the same
  canvas the `/gateway/stream` subscribers are already watching.
- **New events on the bus**: `turn_started` (channel, tier) so clients
  can render "thinking…" state before the turn returns.
- 6 new gateway tests covering the happy path, session reuse,
  validation (empty prompt, bad tier), event publish, and session
  close.

### Why
Everything in Phase 2/6/7 assumed a caller would eventually drive
`run_turn` from the product side. Without a typed HTTP entrypoint,
the kernel stayed behind the CLI's legacy `ConversationEngine`. This
closes the loop: the same path cron and webhooks already use is now
reachable from the user's keyboard without touching the legacy chat
code.

## [0.5.5] - 2026-04-19

### Added — Canvas pattern

Phase 7 of the autonomous agent OS plan. The agent can now emit
structured *artifacts* — markdown plans, notes, tables, anything the
frontend knows how to render — instead of only returning flat text.

- **`Artifact`** and **`Canvas`** in `assistant_cli.core.canvas`.
  Thread-safe in-memory store with CRUD + `on_change` hook; artifacts
  carry `kind`, `title`, `payload`, optional `session_id`, and stable
  timestamps.
- **`canvas_emit` tool** wired through `run_turn`. Declared under the
  `WRITE` risk level so UNTRUSTED sessions can't silently mutate the
  shared surface. Missing-canvas paths return a tool error instead of
  a hard crash, matching how other optional tools fail soft.
- **Gateway integration** — `Gateway` now owns a `Canvas` whose
  `on_change` publishes `canvas_artifact` events onto the EventBus,
  so every WebSocket subscriber sees creates/updates/removes live.
  New routes: `GET /gateway/canvas` (list; optional `session_id`
  filter) and `DELETE /gateway/canvas/{id}`.
- Canvas count now appears in `/gateway/status`.
- 8 canvas unit tests + 2 gateway canvas tests.

### Why
Chat transcripts are a bad fit for plans, tables, and anything the
user wants to keep around. Giving the agent a typed surface to render
into — separate from the conversation log — is what makes the
multi-turn autonomous work visible without drowning the chat history.

## [0.5.4] - 2026-04-20

### Added — Gateway control plane

Phase 2 of the autonomous agent OS plan. The sidecar was a request/
response server for the primary user; it's now a *gateway* that hosts
every non-user input surface under one roof.

- **`Gateway`** class mounted into the FastAPI sidecar. Owns a
  `Scheduler`, a `WebhookRegistry`, and an `EventBus`, and hands the
  sidecar an `APIRouter` to include. Dependency-injected `run_turn_fn`
  keeps the HTTP surface testable without a live LLM.
- **New routes**:
  - `GET  /gateway/status`              — sessions, jobs, channels, subscribers
  - `GET/POST/DELETE /gateway/channels` — webhook channel CRUD
  - `GET/POST/DELETE /gateway/jobs`     — scheduled job CRUD
  - `POST /webhooks/{name}`             — dispatch into a registered channel
  - `WS   /gateway/stream`              — live event feed
- **Scheduler pump** — asyncio background task ticks the `Scheduler`
  every 5s and runs each due job through `run_turn` with the job's
  declared sandbox tier. No new deps.
- **Event bus** — bounded per-subscriber queues with drop-oldest
  overflow, so a slow WebSocket client can't wedge the pump.
- **Webhook signature check** — channels with a `secret` require a
  matching `x-ubongo-signature` header (hmac-compared).
- **SQLite stores opened with `check_same_thread=False`** so the
  sidecar's worker-thread pool can touch them safely; WAL journal keeps
  readers concurrent with the single writer.
- New `test_gateway.py` with 10 smoke tests via FastAPI's TestClient +
  a dummy turn runner. `fastapi` and `httpx` added to dev extras so
  CI picks them up.

### Why
Autonomy primitives from Phase 6 need a process to live in. A cron
job can't fire without a loop; a webhook can't be received without a
server. The Gateway is that process — one place where every
non-user-keyboard input enters the agent, each gated by the sandbox
policy declared at registration.

## [0.5.3] - 2026-04-20

### Added — Autonomy primitives

Phase 6 of the autonomous agent OS plan. Ubongo can now wake up on
its own schedule, be triggered by external webhooks, and delegate
subtasks to isolated sub-agents — each running under a scoped sandbox.

- **`Scheduler`** — stdlib SQLite job store at
  `~/.ubongo/memory/scheduler.db`. Register recurring prompts with an
  interval and a sandbox tier; callers pump `due_jobs()` on a clock
  of their choosing (no daemon deps). Real cron syntax is a follow-up.
- **`Session`** — conversation scope with its own history + policy.
  `open_session()` starts a top-level session; `spawn_session()`
  derives a child whose tier defaults to *one notch stricter* than
  its parent (TRUSTED parents beget UNTRUSTED children unless an
  explicit tier is passed).
- **`sessions_spawn`** tool — the model itself can now delegate a
  focused subtask to a fresh sub-agent. The child's sandbox gates its
  own tool calls; only the final_text comes back, so the parent's
  context stays clean.
- **`WebhookChannel` + `WebhookRegistry`** — declarative input surfaces
  for HTTP-triggered sessions. The registry lives in `core`; the
  sidecar/gateway will mount HTTP routes against it in a follow-up.
- `agent_loop.run_turn` now accepts an optional `session=` param so
  callers can hand it a ready-made session (history + policy bundled).
- 13 more smoke tests (39 total); ruff clean.

### Why
Autonomy needs input channels that aren't the primary user's keyboard
*and* a safe runtime for them. The sandbox tiers from Phase 5 give
Ubongo the runtime; scheduler + webhook channels + `sessions_spawn`
give it the inputs. The result: a cron job or Slack webhook can
trigger a turn in a session with its own scope and can never escalate
beyond the privileges its channel was declared with.

## [0.5.2] - 2026-04-19

### Added — Sandboxing tiers

Phase 5 of the autonomous agent OS plan. Every tool call now runs
through a policy that classifies it by risk and decides whether to
allow, require review, or block.

- **`SandboxPolicy`** with three tiers: `TRUSTED` (full privilege,
  primary user session), `REVIEW` (read-only passes; writes/network/
  control ask first), `UNTRUSTED` (deny-by-default; only SAFE tools
  run — for webhook- or chat-triggered sessions where input isn't from
  the primary user).
- **Risk classification** — `SAFE`, `WRITE`, `DESTRUCTIVE`, `NETWORK`,
  `CONTROL`. Multi-action tools (`file_operation`, `screen_control`)
  resolve risk per-action, so `search_files` and `screenshot` stay
  SAFE while `delete_item` is DESTRUCTIVE.
- **Approver pattern** — pluggable callable (`always_allow`,
  `always_deny`, `cli_approver`) runs when a tool hits `REQUIRE_REVIEW`.
  Non-interactive sessions default to deny.
- **Per-session overrides** — `policy.allow` / `policy.deny` let a
  specific session elevate or lock out individual tools.
- **Agent loop** now classifies every tool call before dispatch.
  Denied calls return a `{"blocked": True, ...}` result the model can
  see and recover from; tool log records risk + decision for audit.
- 11 more smoke tests (26 total); ruff clean.

### Why
Krentsel: every agent that can call tools is "insecure by default"
unless the harness gates execution. With cron/webhook autonomy landing
next, Ubongo needs the policy surface *before* input channels that
aren't the primary user's keyboard go live.

## [0.5.1] - 2026-04-19

### Added — Semantic memory tier

Phase 4 of the autonomous agent OS plan. Ubongo can now *ask* for
context instead of us stuffing it every turn.

- **`SemanticMemory`** — stdlib SQLite store at `~/.ubongo/memory/semantic.db`.
  Zero new deps; WAL journal; keyword-scored recall (token overlap + recency).
- **Three new tools** wired into the agent loop: `memory_save`, `memory_recall`,
  `memory_forget`. The model can now persist and retrieve facts on demand.
- **`append_daily_note()`** — writes timestamped entries to
  `~/.ubongo/memory/YYYY-MM-DD.md` (episodic tier). Not injected into the
  prompt — the model reads on demand via file tools when needed.
- 6 more smoke tests (15 total); ruff clean across the board.

### Why
Krentsel's three-tier memory model: short-term (history) + semantic (facts)
+ episodic (daily logs). Previously Ubongo only had short-term; everything
else had to be hand-copied into MEMORY.md. Now the agent owns its own
long-term memory.

## [0.5.0] - 2026-04-19

### Added — Workspace-as-Kernel + ReAct loop

The agent's identity now lives in editable files under `~/.ubongo/` instead
of hardcoded Python strings. This is the foundation for autonomy.

- **`~/.ubongo/SOUL.md`** — personality and tone (auto-seeded on first run)
- **`~/.ubongo/AGENTS.md`** — operational rules + non-negotiables
- **`~/.ubongo/TOOLS.md`** — per-user tool conventions ("when I say 'my notes'…")
- **`~/.ubongo/MEMORY.md`** — long-term facts the agent retains across sessions
- **`~/.ubongo/skills/<name>/SKILL.md`** — task playbooks, **lazy-loaded**:
  only names + descriptions are injected each turn; the model calls
  `load_skill` to pull a body when it's relevant, keeping the context window lean.
- **ReAct agent loop** (`assistant_cli.core.agent_loop.run_turn`) — real
  Reason→Act→Observe cycle with a max-step safety cap, in place of the prior
  single-shot chat path.
- New `load_skill` tool wired into the tool catalogue.
- Smoke tests under `test_workspace.py` (9 passing).

### Why
Reverse-engineered from Alex Krentsel's *Principles for Autonomous System
Design* talk. The five "kernel patterns" — workspace, identity, session
boundaries, memory tiers, delegation — are now the spine Ubongo will grow on.

## [0.2.0] - 2026-02-23

### Added

- **Windows support** — Full Windows automation via PowerShell
  - App control: 40+ Windows apps mapped (Edge, Teams, Spotify, Office, etc.)
  - Music control via media keys (Spotify integration)
  - Document/presentation creation (PowerPoint or text fallback)
  - Browser control, notifications, text-to-speech
  - UWP/protocol app launching (`ms-settings:`, `ms-photos:`, etc.)
- **Linux support** (basic) — URL opening, process listing, notifications via `notify-send`
- **Platform bridge** — Unified `get_automation()` auto-selects macOS/Windows/Linux backend
- **Lazy-loaded optional tools** — Browser and screen control load only when needed
- **Cross-platform CI** — Tests run on macOS, Windows, and Ubuntu
- Platform-aware hotkeys in screen control (`command` on macOS, `ctrl` on Windows)

### Changed

- Executor uses platform bridge instead of direct AppleScript references
- Optional dependencies (playwright, pyautogui) no longer break startup if missing
- Updated OS classifiers in package metadata

## [0.1.0] - 2026-02-23

### Added

- Natural language conversation engine with intent classification
- Local LLM integration via Ollama (auto-selects fastest model)
- Quick Answer Engine — instant math, capitals, facts, dates (no LLM needed)
- Self-awareness responses (identity, status, capabilities)
- Smart command parser with multi-step task planning
- File operations (create, move, organize, find, delete)
- App control (open, close, launch)
- Music control (play, pause, next, previous)
- System info (disk, CPU, memory, battery)
- Matrix digital rain intro animation with UBONGO reveal
- "Thinking..." spinner during LLM processing
- 20-second LLM timeout with graceful fallback
- Background model warm-up during startup
- Conversation memory and context tracking
- Rich terminal UI with panels and markdown
- Debug mode (`ubongo start --debug`)
- Setup wizard (`ubongo setup`)

[0.1.0]: https://github.com/mxsafiri/ubongo.os/releases/tag/v0.1.0
