# Changelog

All notable changes to Ubongo OS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
