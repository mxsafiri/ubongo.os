<p align="center">
  <h1 align="center">UBONGO OS</h1>
  <p align="center">
    <strong>Your local AI assistant. Control your computer with natural language, 100% offline.</strong>
  </p>
  <p align="center">
    <a href="https://github.com/mxsafiri/ubongo.os/releases"><img src="https://img.shields.io/github/v/release/mxsafiri/ubongo.os?style=flat-square" alt="Release"></a>
    <a href="https://pypi.org/project/ubongo/"><img src="https://img.shields.io/pypi/v/ubongo?style=flat-square" alt="PyPI"></a>
    <a href="https://github.com/mxsafiri/ubongo.os/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mxsafiri/ubongo.os?style=flat-square" alt="License"></a>
    <a href="https://www.python.org/"><img src="https://img.shields.io/pypi/pyversions/ubongo?style=flat-square" alt="Python"></a>
  </p>
</p>

---

Ubongo is a **fully offline** AI-powered CLI assistant that runs locally on your computer. No cloud, no API keys, no subscriptions. Works on **macOS, Windows, and Linux**.

## Demo

```
You: what is 125 / 5
  25

You: capital of Kenya?
  The capital of Kenya is Nairobi.

You: organize my downloads folder
  Found 84 files. Here's my plan (3 steps):
    1. Group by file type
    2. Move into dated folders
    3. Clean up duplicates
  Shall I go ahead?

You: are you online?
  I'm running locally on your Mac with qwen2.5 — fully offline,
  no internet needed. All your data stays private.
```

## Features

- **Natural Language** — Just type what you want in plain English
- **100% Offline** — Runs a local LLM via Ollama, no internet needed
- **Instant Answers** — Math, capitals, facts, dates answered in 0.0s
- **Cross-Platform** — macOS (AppleScript), Windows (PowerShell), Linux (basic)
- **Automation** — Open apps, manage files, control music, check system
- **Smart Fallback** — Never hangs; shows a spinner and gracefully times out
- **Matrix Intro** — Cool terminal animation on launch
- **Private** — Zero telemetry, all data stays on your machine

## Install

### Option 1: Download binary (no Python needed)

Go to [**Releases**](https://github.com/mxsafiri/ubongo.os/releases) and download the binary for your OS:

| OS | File |
|----|------|
| macOS | `ubongo-x.x.x-macos-x86_64.tar.gz` |
| Windows | `ubongo-x.x.x-windows-amd64.zip` |
| Linux | `ubongo-x.x.x-linux-x86_64.tar.gz` |

Then run:
```bash
# macOS / Linux
chmod +x ubongo && ./ubongo start

# Windows
ubongo.exe start
```

### Option 2: pip (requires Python 3.11+)

```bash
pip install ubongo
ubongo start
```

### Option 3: From source

```bash
git clone https://github.com/mxsafiri/ubongo.os.git
cd ubongo.os
pip install -e .
ubongo start
```

### Prerequisites

- **macOS, Windows 10+, or Linux**
- **Ollama** — Install from [ollama.com](https://ollama.com), then pull a model:

```bash
# Fast & light (recommended for most Macs)
ollama pull qwen2.5:0.5b

# More capable (needs 8GB+ RAM)
ollama pull llama3.2
```

## Usage

```bash
# Launch Ubongo
ubongo

# With debug output
ubongo start --debug

# Run initial setup wizard
ubongo setup

# Check version
ubongo version
```

### What You Can Say

| Category | Examples |
|----------|---------|
| **Math** | `what is 5 + 3`, `solve 125 / 5`, `calculate 2^10` |
| **Facts** | `capital of Kenya?`, `speed of light`, `tallest mountain` |
| **Files** | `organize my downloads`, `find large files`, `create a folder` |
| **Apps** | `open Safari`, `launch Music`, `close Finder` |
| **System** | `check disk space`, `how much RAM`, `battery status` |
| **Music** | `play music`, `next song`, `pause` |
| **Meta** | `who are you`, `are you online`, `what can you do` |

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Ubongo OS                   │
├──────────┬──────────┬───────────┬───────────┤
│  Quick   │  Self-   │  Pattern  │  Local    │
│  Answer  │  Aware   │  Matcher  │  LLM      │
│  Engine  │  Engine  │  (Parser) │  (Ollama) │
│  0.0s    │  0.0s    │  <0.1s    │  ~10s     │
├──────────┴──────────┴───────────┴───────────┤
│              Conversation Engine              │
├──────────┬──────────┬───────────┬───────────┤
│  File    │  App     │  System   │  Music    │
│  Ops     │  Control │  Info     │  Control  │
└──────────┴──────────┴───────────┴───────────┘
```

- **Quick Answer Engine** — Instant math, capitals, facts, dates (no LLM)
- **Self-Awareness** — Identity and status questions answered instantly
- **Pattern Matcher** — Fast command parsing with intent recognition
- **Local LLM** — Ollama with auto model selection and 20s timeout
- **Spinner + Fallback** — Never hangs; always gives useful feedback

## Configuration

Ubongo stores config in `~/.ubongo/`. Environment variables use the `UBONGO_` prefix:

```bash
export UBONGO_OLLAMA_MODEL="llama3.2"
export UBONGO_OLLAMA_BASE_URL="http://localhost:11434"
export UBONGO_DEBUG=true
```

## Development

```bash
git clone https://github.com/mxsafiri/ubongo.os.git
cd ubongo.os
python -m venv venv && source venv/bin/activate
pip install -e ".[dev]"
pytest
```

## Platform Support

| Feature | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Conversation & LLM | ✅ | ✅ | ✅ |
| Quick Answers (math, facts) | ✅ | ✅ | ✅ |
| File Operations | ✅ | ✅ | ✅ |
| App Control | ✅ AppleScript | ✅ PowerShell | ⚠️ Basic |
| Music Control | ✅ Music.app | ✅ Media Keys | ❌ |
| System Info | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ Toast | ⚠️ notify-send |
| Documents/Presentations | ✅ Keynote/Pages | ✅ PowerPoint/text | ❌ |
| Browser Automation | ✅ (optional) | ✅ (optional) | ✅ (optional) |

## Roadmap

- [ ] Full Linux desktop automation
- [ ] Plugin system for custom tools
- [ ] Voice input/output
- [ ] Homebrew formula (`brew install ubongo`)
- [ ] Standalone .app binary (no Python needed)

## License

MIT — See [LICENSE](LICENSE)

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md)
