# Quick Start Guide

Get up and running with Assistant CLI in 5 minutes.

## Installation

### Option 1: From Source (Recommended for now)

```bash
# Clone or navigate to the project
cd assistant-cli

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the assistant
python -m assistant_cli
```

### Option 2: Install with pip (Coming soon)

```bash
pip install assistant-cli
assistant-cli
```

## Prerequisites

### 1. Install Ollama (for local LLM)

**macOS:**
```bash
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:**
Download from https://ollama.ai

### 2. Download a Language Model

```bash
# Start Ollama service (if not auto-started)
ollama serve

# In another terminal, pull a model
ollama pull llama3.1:8b

# Or use a lighter model if you have limited RAM
ollama pull phi3:mini
```

### 3. Install Playwright (for browser automation)

```bash
playwright install
```

## First Run

```bash
# Activate your virtual environment
source venv/bin/activate

# Start the assistant
python -m assistant_cli

# You should see the welcome screen!
```

## Try These Commands

Once the CLI is running, try:

```
> Create a folder called TestProject on my desktop
> What's my disk space?
> Open Spotify
> Find all screenshots from last week
> help
```

## Configuration

The assistant creates a config directory at `~/.assistant-cli/` with:
- `config.json` - User preferences
- `history.db` - Conversation history
- `logs/` - Debug logs
- `memory/` - Vector embeddings (future feature)

## Troubleshooting

### "Ollama not found"
Make sure Ollama is installed and running:
```bash
ollama serve
```

### "Model not found"
Download a model first:
```bash
ollama pull llama3.1:8b
```

### Import errors
Make sure you're in the virtual environment:
```bash
source venv/bin/activate
pip install -r requirements.txt
```

## Next Steps

- Read the full [README.md](README.md)
- Check out [ARCHITECTURE.md](docs/ARCHITECTURE.md) to understand how it works
- Explore the code in `assistant_cli/`
- Contribute! See [CONTRIBUTING.md](CONTRIBUTING.md)

## Support

- Issues: GitHub Issues
- Discussions: GitHub Discussions
- Documentation: `docs/` folder
