"""
ubongo beta proxy — a tiny FastAPI that sits between the desktop app
and Anthropic's Claude API.

Purpose:
  * Hold the merchant Anthropic key server-side (never shipped in the app)
  * Gate access behind invite codes (beta)
  * Rate-limit per invite code to cap abuse / cost
  * Forward /v1/messages transparently so the Anthropic SDK in the client
    keeps working with just a `base_url` override

Deployment target: Fly.io (free tier is enough for beta scale).

Endpoints:
  GET  /health              — liveness check
  POST /validate            — check an invite code, return remaining quota
  POST /v1/messages         — proxy to Anthropic after code + rate-limit check
  GET  /v1/models           — (optional) proxy model list

Secrets (set via `fly secrets set`):
  ANTHROPIC_API_KEY   — real sk-ant-... key
  VALID_CODES         — comma-separated list, e.g. "UBONGO-ALPHA-7X2K,UBONGO-..."
                        (or leave unset and use the built-in dev codes)
  DAILY_QUERY_LIMIT   — int, default 200 per code per UTC day
"""
from __future__ import annotations

import json
import os
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel


# ── Config ────────────────────────────────────────────────────────────────

ANTHROPIC_BASE = "https://api.anthropic.com"
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")

DAILY_QUERY_LIMIT = int(os.getenv("DAILY_QUERY_LIMIT", "200"))

# Valid invite codes — comma-separated env, or default dev set.
_raw_codes = os.getenv("VALID_CODES", "UBONGO-ALPHA-7X2K,UBONGO-DEV-0000")
VALID_CODES = {c.strip().upper() for c in _raw_codes.split(",") if c.strip()}


# ── App ───────────────────────────────────────────────────────────────────

app = FastAPI(title="ubongo-proxy", version="0.1.0", docs_url=None, redoc_url=None)


# ── Rate limiting (in-process, per-code, per-UTC-day) ────────────────────
#
# Good enough for beta. When we outgrow a single instance, move to Redis.
_usage: dict[str, dict[str, int]] = defaultdict(lambda: {"day": "", "count": 0})


def _today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _bump_and_check(code: str) -> tuple[bool, int]:
    """Increment the code's counter for today. Returns (ok, remaining)."""
    today = _today_key()
    entry = _usage[code]
    if entry["day"] != today:
        entry["day"] = today
        entry["count"] = 0
    if entry["count"] >= DAILY_QUERY_LIMIT:
        return False, 0
    entry["count"] += 1
    return True, DAILY_QUERY_LIMIT - entry["count"]


def _remaining(code: str) -> int:
    today = _today_key()
    entry = _usage.get(code)
    if not entry or entry["day"] != today:
        return DAILY_QUERY_LIMIT
    return max(0, DAILY_QUERY_LIMIT - entry["count"])


# ── Auth helpers ──────────────────────────────────────────────────────────


def _extract_code(request: Request, x_api_key: Optional[str]) -> str:
    """
    The desktop app sends the invite code as the Anthropic api_key (which
    the SDK puts in the `x-api-key` header). Accept either that or an
    explicit body `code` field for the /validate endpoint.
    """
    if x_api_key:
        return x_api_key.strip().upper()
    # Some clients send Authorization: Bearer ...
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip().upper()
    return ""


def _require_valid_code(code: str) -> None:
    if not code:
        raise HTTPException(status_code=401, detail="Missing invite code.")
    if code not in VALID_CODES:
        raise HTTPException(status_code=401, detail="Invalid or expired invite code.")


# ── Endpoints ─────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {
        "status": "ok",
        "anthropic_configured": bool(ANTHROPIC_KEY),
        "valid_codes": len(VALID_CODES),
    }


class ValidateRequest(BaseModel):
    code: str


@app.post("/validate")
def validate(body: ValidateRequest):
    """Check an invite code and report quota status."""
    code = (body.code or "").strip().upper()
    _require_valid_code(code)
    return {
        "valid": True,
        "tier": "beta",
        "daily_limit": DAILY_QUERY_LIMIT,
        "remaining_today": _remaining(code),
    }


@app.post("/v1/messages")
async def proxy_messages(
    request: Request,
    x_api_key: Optional[str] = Header(default=None, alias="x-api-key"),
    anthropic_version: Optional[str] = Header(default="2023-06-01", alias="anthropic-version"),
):
    """
    Transparent proxy to Anthropic's /v1/messages.
    Validates the invite code, bumps the rate counter, swaps in the real
    Anthropic key, and forwards the body (supporting both streaming and
    non-streaming).
    """
    code = _extract_code(request, x_api_key)
    _require_valid_code(code)

    ok, remaining = _bump_and_check(code)
    if not ok:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Daily quota reached ({DAILY_QUERY_LIMIT} queries). "
                "Resets at 00:00 UTC."
            ),
        )

    if not ANTHROPIC_KEY:
        raise HTTPException(
            status_code=503,
            detail="Proxy is not configured — ANTHROPIC_API_KEY is missing.",
        )

    # Read request body (JSON). We also want to know if streaming.
    raw = await request.body()
    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Body is not valid JSON.")

    is_stream = bool(payload.get("stream"))

    upstream_headers = {
        "x-api-key":         ANTHROPIC_KEY,
        "anthropic-version": anthropic_version or "2023-06-01",
        "content-type":      "application/json",
    }
    # Preserve optional beta headers the client may have set
    for h in ("anthropic-beta",):
        v = request.headers.get(h)
        if v:
            upstream_headers[h] = v

    url = f"{ANTHROPIC_BASE}/v1/messages"

    if is_stream:
        # Pipe SSE straight through
        async def gen():
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", url, content=raw, headers=upstream_headers) as upstream:
                    async for chunk in upstream.aiter_raw():
                        yield chunk

        return StreamingResponse(gen(), media_type="text/event-stream")

    # Non-streaming — buffer and return
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, content=raw, headers=upstream_headers)

    # Forward Anthropic's status code + body + a couple of useful headers
    forwarded = JSONResponse(
        status_code=resp.status_code,
        content=_safe_json(resp),
    )
    # Surface our own rate-limit info so the client can display quota
    forwarded.headers["x-ubongo-remaining-today"] = str(remaining)
    forwarded.headers["x-ubongo-daily-limit"] = str(DAILY_QUERY_LIMIT)
    return forwarded


def _safe_json(resp: httpx.Response):
    try:
        return resp.json()
    except Exception:
        return {"error": {"type": "proxy_parse_error", "message": resp.text[:500]}}


# ── Entry for local dev ──────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8080")),
        log_level="info",
    )
