#!/usr/bin/env bash
# Run the ubongo desktop app from source on your Mac — server included.
#
#   scripts/run-local.sh
#
# Optional: run the proxy locally too (instead of ubongo-proxy.fly.dev) by
# passing your Anthropic key:
#
#   ANTHROPIC_API_KEY=sk-ant-... scripts/run-local.sh
#
# Everything lives in the repo: Python packages go in .venv/, app data in
# your normal ~/.ubongo. Ctrl-C stops it all.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

need() { command -v "$1" >/dev/null || { echo "✗ $1 is missing. $2"; exit 1; }; }
need python3 "Install it with: brew install python@3.12"
need npm     "Install Node.js 20+ with: brew install node"
need cargo   "Install Rust with: curl https://sh.rustup.rs -sSf | sh   (then open a new Terminal)"

if curl -s -m 1 http://127.0.0.1:8765/status >/dev/null 2>&1; then
  echo "✗ Something is already using port 8765 — probably the installed ubongo app."
  echo "  Quit it (⌘Q, and from the menu bar icon) and run this again."
  exit 1
fi

echo "→ Python packages (.venv)"
[ -d .venv ] || python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate          # the app starts its server with this python3
pip install -q --upgrade pip
pip install -q -r requirements.txt
pip install -q -e .

PROXY_PID=""
cleanup() { [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null || true; }
trap cleanup EXIT

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "→ Local proxy on http://127.0.0.1:8790"
  pip install -q -r proxy/requirements.txt
  (cd proxy && python -m uvicorn main:app --port 8790 --log-level warning) &
  PROXY_PID=$!
  export UBONGO_PROXY_URL=http://127.0.0.1:8790
fi

echo "→ Desktop app packages"
(cd desktop && npm install --silent)

echo "→ Starting ubongo (first build of the Rust shell takes a few minutes)"
cd "$ROOT/desktop"
npm run tauri dev
