# Changelog

All notable changes to Ubongo OS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
