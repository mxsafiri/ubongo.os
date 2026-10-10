# ubongo-proxy

A thin FastAPI proxy sitting between the ubongo desktop app and Anthropic's Claude API.

## Why it exists

End users of the ubongo beta don't manage their own Anthropic keys. Instead:

1. We (ubongo) hold the merchant Anthropic key server-side.
2. On first launch every install gets its own **install key** from `POST /provision` — automatically, with no invite code or sign-up.
3. The desktop app sends API calls to this proxy, using that key in place of the Anthropic API key.
4. The proxy checks the key, rate-limits per key, and forwards to real Anthropic with the merchant key.

This way:
- The real Anthropic key is never shipped in the app (no extraction risk).
- We cap per-install daily cost so one user can't run up a huge bill, and cap how many new keys one network (3/day) and everyone (500/day) can get.
- There is no extra secret: install keys are signed with a key derived from `ANTHROPIC_API_KEY`. Rotating that key retires every install key, and the app gets a new one by itself.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET  | `/health`       | Liveness check |
| POST | `/provision`    | Issue a new install key (rate-limited per network and per day) |
| POST | `/validate`     | Check an install key, returns quota |
| POST | `/v1/messages`  | Transparent proxy to Anthropic (drop-in for the SDK) |

The desktop app's `AnthropicProvider` points its SDK `base_url` at this proxy and passes the install key as `api_key`. The `x-api-key` header the SDK sends is what we read as the key.

## Local dev

```bash
cd proxy/
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export ANTHROPIC_API_KEY="sk-ant-..."
export VALID_CODES="UBONGO-ALPHA-7X2K,UBONGO-DEV-0000"
export DAILY_QUERY_LIMIT=50
python main.py   # listens on :8080
```

Point the desktop app at it via `~/.ubongo/config.json`:

```json
{
  "proxy_url": "http://127.0.0.1:8080"
}
```

## Deploying to Fly.io

One-time:

```bash
brew install flyctl          # macOS; see fly.io/docs/hands-on/install-flyctl for others
fly auth login
cd proxy/
fly launch --no-deploy        # pick app name (default matches fly.toml)
fly secrets set ANTHROPIC_API_KEY="sk-ant-..."
fly secrets set VALID_CODES="UBONGO-ALPHA-7X2K,UBONGO-FRIEND-AA01"
fly deploy
```

Rotating codes later:

```bash
fly secrets set VALID_CODES="<new comma-separated list>"
# Fly auto-restarts the app
```

Adjusting daily limit:

```bash
# either in fly.toml [env] or via secret:
fly secrets set DAILY_QUERY_LIMIT=500
```

## Scaling past beta

Current rate-limit store is in-process (`dict`), so it's single-instance. When beta scale outgrows one Fly machine:

1. Add Upstash Redis (free tier, no setup beyond an env var).
2. Replace `_usage` dict with Redis `INCR` + `EXPIRE`.
3. Bump `min_machines_running` in `fly.toml` and/or add regions.

None of this matters until you have >200 concurrent testers.

## Security notes

- Anthropic key is stored as a Fly secret (not in code, not in image). Rotate with `fly secrets set`.
- No user accounts: anyone who installs the app gets a key, bounded by the per-network, per-day and per-key limits. Add real auth (email OTP → JWT) when the product goes paid.
- The proxy forwards streaming responses (SSE) unchanged, so the SDK's streaming works transparently.
