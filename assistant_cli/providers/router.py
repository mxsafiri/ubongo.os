"""
Provider Router — the brain of the provider layer.

Decides which AI provider to use for each request based on:
  1. User's privacy setting (strict local → always Ollama)
  2. Internet connectivity
  3. Configured API keys
  4. Task complexity (simple → Haiku/Groq, complex → Sonnet)
  5. Hardware capability (no local model → cloud)

Provider priority (when all available):
  Anthropic Claude > Groq Free > Ollama Local
"""
import socket
from typing import Optional
from assistant_cli.utils import logger
from .base import AIProvider
from .anthropic_provider import AnthropicProvider
from .groq_provider import GroqProvider
from .ollama_provider import OllamaProvider


class ProviderRouter:
    """
    Selects the best available AI provider at runtime.
    Instantiate once; call .get_provider() per request.
    """

    def __init__(self, settings):
        self._settings = settings
        self._anthropic: Optional[AnthropicProvider] = None
        self._groq: Optional[GroqProvider] = None
        self._ollama: Optional[OllamaProvider] = None
        self._internet_ok: Optional[bool] = None

    # ── Provider instances (lazy) ────────────────────────────────────

    @property
    def anthropic(self) -> Optional[AnthropicProvider]:
        """
        Instantiate a Claude provider in one of two modes:

        1. **Beta (hosted proxy)** — user has an invite code: send
           requests to the ubongo proxy with the code as the api_key.
           The proxy validates, rate-limits, and forwards to real
           Anthropic with the merchant key server-side.

        2. **BYOK** — user brought their own `sk-ant-...` key: talk
           directly to api.anthropic.com.

        Beta takes precedence when both are set (so an invite-code user
        can never accidentally burn their personal key).
        """
        if self._anthropic is not None:
            return self._anthropic

        if self._settings.invite_code:
            # Beta proxy mode
            self._anthropic = AnthropicProvider(
                api_key=self._settings.invite_code,
                base_url=self._settings.proxy_url.rstrip("/"),
                use_sonnet_for_complex=True,  # proxy enforces its own tier
            )
        elif self._settings.anthropic_api_key:
            # BYOK direct mode
            self._anthropic = AnthropicProvider(
                api_key=self._settings.anthropic_api_key,
                use_sonnet_for_complex=(self._settings.user_tier == "power"),
            )
        return self._anthropic

    @property
    def groq(self) -> Optional[GroqProvider]:
        if self._groq is None and self._settings.groq_api_key:
            self._groq = GroqProvider(api_key=self._settings.groq_api_key)
        return self._groq

    @property
    def ollama(self) -> OllamaProvider:
        if self._ollama is None:
            self._ollama = OllamaProvider(
                base_url=self._settings.ollama_base_url,
                model=self._settings.ollama_model if self._settings.ollama_model else None,
            )
        return self._ollama

    # ── Connectivity ─────────────────────────────────────────────────

    def has_internet(self, timeout: float = 3.0) -> bool:
        """Connectivity check — retries multiple hosts, re-checks until confirmed."""
        if self._internet_ok is True:
            return True
        for host, port in [("8.8.8.8", 53), ("1.1.1.1", 53), ("api.anthropic.com", 443)]:
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(timeout)
                s.connect((host, port))
                s.close()
                self._internet_ok = True
                return True
            except Exception:
                continue
        self._internet_ok = False
        return False

    def invalidate_internet_cache(self) -> None:
        """Force re-check on next call — use if connection state changed."""
        self._internet_ok = None

    # ── Main routing logic ───────────────────────────────────────────

    def get_provider(self, force_local: bool = False) -> AIProvider:
        """
        Return the best available provider for the current context.

        Args:
            force_local: Override all settings and use Ollama.
        """
        # 1. Forced local (private mode or --offline flag)
        if force_local or self._settings.provider_mode == "local_only":
            logger.debug("Provider: ollama (forced local)")
            return self.ollama

        # 2. No internet — must use local
        if not self.has_internet():
            logger.debug("Provider: ollama (no internet)")
            return self.ollama

        # 3. Anthropic configured and tier is pro/power
        if self._settings.user_tier in ("pro", "power"):
            p = self.anthropic
            if p and p.is_available():
                logger.debug("Provider: anthropic (tier=%s)", self._settings.user_tier)
                return p

        # 4. Groq free tier (any tier with key configured)
        p = self.groq
        if p and p.is_available():
            logger.debug("Provider: groq (free tier)")
            return p

        # 5. Anthropic available even on free tier (user configured BYOK)
        p = self.anthropic
        if p and p.is_available():
            logger.debug("Provider: anthropic (BYOK)")
            return p

        # 6. Local Ollama fallback
        logger.debug("Provider: ollama (fallback)")
        return self.ollama

    def get_provider_display(self) -> tuple[str, str]:
        """
        Return (display_name, tier_class) for the UI badge.
        e.g. ("Claude Sonnet ✦", "power") or ("Offline 🔒", "free")
        """
        provider = self.get_provider()

        if provider.name == "anthropic":
            if self._settings.user_tier == "power":
                return "Claude Sonnet ✦", "power"
            return "Claude Haiku ⚡", "pro"
        elif provider.name == "groq":
            return "Groq (Free) ⚡", "free"
        else:
            return "Offline 🔒", "free"

    def status_summary(self) -> dict:
        """Return a dict describing current provider status — used by /status command."""
        provider = self.get_provider()
        display, tier_class = self.get_provider_display()

        return {
            "active_provider":  provider.name,
            "display_name":     display,
            "tier":             self._settings.user_tier,
            "tier_class":       tier_class,
            "internet":         self.has_internet(),
            "anthropic_ready":  bool(self.anthropic and self.anthropic.is_available()),
            "groq_ready":       bool(self.groq and self.groq.is_available()),
            "ollama_ready":     self.ollama.is_available(),
            "privacy_mode":     self._settings.provider_mode == "local_only",
            "monthly_queries":  self._settings.monthly_query_count,
            "query_limit":      self._query_limit(),
        }

    def _query_limit(self) -> int:
        limits = {"free": 200, "pro": 1000, "power": 2000}
        return limits.get(self._settings.user_tier, 200)
