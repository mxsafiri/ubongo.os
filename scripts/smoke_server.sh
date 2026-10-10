#!/usr/bin/env bash
# Start a packaged ubongo-server and check it actually serves requests.
#
#   scripts/smoke_server.sh path/to/ubongo-server
#
# Runs it against a throwaway HOME so it never touches real user data, waits
# up to 90s for /status, then checks the memory endpoints. Exits non-zero
# (and prints the server's output) if anything fails.
set -u
BIN="$1"
HOME_DIR="$(mktemp -d)"
LOG="$HOME_DIR/server.log"
mkdir -p "$HOME_DIR/Documents" && echo "smoke" > "$HOME_DIR/Documents/smoke-test.txt"
# Found only by what it says, not its name: proves document text is indexed
echo "Notes from the Kilimanjaro trip" > "$HOME_DIR/Documents/notes.txt"

# Dead proxy address: CI runs must never mint real access codes
HOME="$HOME_DIR" UBONGO_PROXY_URL=http://127.0.0.1:9 "$BIN" > "$LOG" 2>&1 &
PID=$!
cleanup() { kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; }
trap cleanup EXIT

fail() { echo "SMOKE FAIL: $1"; echo "── server output ──"; cat "$LOG"; exit 1; }

for _ in $(seq 90); do
  kill -0 "$PID" 2>/dev/null || fail "server exited during startup"
  curl -sf http://127.0.0.1:8765/status > /dev/null && break
  sleep 1
done
curl -sf http://127.0.0.1:8765/status > /dev/null || fail "/status never answered"
curl -sf http://127.0.0.1:8765/onboarding/status | grep -q '"onboarded"' || fail "/onboarding/status"
curl -sf http://127.0.0.1:8765/memory/stats | grep -q '"total_files"' || fail "/memory/stats"
curl -sf -X POST http://127.0.0.1:8765/memory/rescan | grep -q '"indexed"' || fail "/memory/rescan"
curl -sf -X POST http://127.0.0.1:8765/memory/search -H 'content-type: application/json' \
  -d '{"query":"smoke-test"}' | grep -q 'smoke-test.txt' || fail "/memory/search didn't find the test file"
for _ in $(seq 30); do
  curl -sf -X POST http://127.0.0.1:8765/memory/search -H 'content-type: application/json' \
    -d '{"query":"kilimanjaro"}' | grep -q 'notes.txt' && break
  sleep 1
done
curl -sf -X POST http://127.0.0.1:8765/memory/search -H 'content-type: application/json' \
  -d '{"query":"kilimanjaro"}' | grep -q '"match":"content"' || fail "content search didn't find notes.txt by its text"
echo "SMOKE OK: server started and answered every check"
