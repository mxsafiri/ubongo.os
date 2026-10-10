<p align="center">
  <h1 align="center">UBONGO</h1>
  <p align="center">
    <strong>An assistant on your Mac that actually does things, in English or Swahili.</strong>
  </p>
  <p align="center">
    <a href="https://github.com/mxsafiri/ubongo.os/releases/latest"><img src="https://img.shields.io/github/v/release/mxsafiri/ubongo.os?style=flat-square" alt="Release"></a>
    <a href="https://github.com/mxsafiri/ubongo.os/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mxsafiri/ubongo.os?style=flat-square" alt="License"></a>
  </p>
</p>

---

Ubongo lives on your Mac as a small orb. Press a key, type or speak, and it
gets things done: it finds and summarises your files, drafts replies, and
handles the busywork. Built in Tanzania for people who run their work from a
laptop.

**What it does best** (see [ROADMAP.md](ROADMAP.md)):

- **Find & summarise your files:** "where's last week's contract, and what does it say?"
- **Write & reply for you:** emails, messages and documents in your tone
- **By voice, in Swahili or English**
- **Coming:** pay bills in nTZS through NEDApay, with you approving every payment

## Install (macOS, Apple Silicon)

1. Download the latest **`ubongo_*_aarch64.dmg`** from [Releases](https://github.com/mxsafiri/ubongo.os/releases/latest).
2. Open it and drag **ubongo** to Applications.
3. Open ubongo. Until builds are signed, macOS may say it couldn't verify the
   app. If so, go to **System Settings → Privacy & Security → Open Anyway**, or
   run `xattr -dr com.apple.quarantine /Applications/ubongo.app` once.
4. Pick a name and a tone, then press **START**. There's no sign-up and no invite code.

## How it works

```
 ubongo.app (Tauri: Rust shell + React UI)
   │  starts and talks to
   ▼
 local server (Python, FastAPI, 127.0.0.1:8765)
   ├─ file memory: SQLite index of your folders, kept live by watchdog
   ├─ tools: files, apps, browser, music, system (AppleScript)
   └─ AI: Claude, through ↓   (Ollama as an offline fallback)
           ubongo proxy (Fly.io): holds the Anthropic key; each install gets
           its own key automatically, with daily limits
```

Your files are indexed and searched on your Mac. Only the question and the
context needed to answer it are sent to the AI.

| Path | What |
|---|---|
| `desktop/` | The Mac app: `src/` (React UI), `src-tauri/` (Rust shell), `server/` (local Python server) |
| `assistant_cli/` | Core Python: providers, tools, file memory, agent loop. Also the `ubongo` CLI. |
| `proxy/` | The Fly.io proxy in front of Anthropic |
| `scripts/` | `run-local.sh` (run from source), `smoke_server.sh` (CI check) |
| `surfari/` | Surfari, a separate product that is moving to its own repo |

## Run it from source

Needs Python 3, Node 20+ and Rust. Quit any installed ubongo first.

```bash
git clone https://github.com/mxsafiri/ubongo.os.git && cd ubongo.os
ANTHROPIC_API_KEY=sk-ant-... scripts/run-local.sh   # key optional: runs the proxy locally too
```

## Develop

```bash
pip install -r requirements.txt && pip install -e ".[dev]"
pytest                          # Python tests
ruff check assistant_cli/       # lint (same as CI)
cd desktop && npx tsc --noEmit  # UI type check
```

Every PR runs the tests on macOS, Windows and Linux. It also builds the Mac
app's server exactly as the release does and checks that it starts. Releases are
made with **Actions → Release → Run workflow**; see
[docs/RELEASING.md](docs/RELEASING.md).

## Command-line version

The original terminal assistant still ships as `ubongo` (`pip install -e .`,
then `ubongo`). It runs offline with Ollama. The desktop app is where new work
happens.

## License

MIT. See [LICENSE](LICENSE).
