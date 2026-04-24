import json
from datetime import datetime
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    app_name: str = "Ubongo OS"
    version: str = "0.1.0"

    home_dir: Path = Field(default_factory=lambda: Path.home() / ".ubongo")
    config_file: Path = Field(default_factory=lambda: Path.home() / ".ubongo" / "config.json")
    history_db: Path = Field(default_factory=lambda: Path.home() / ".ubongo" / "history.db")
    memory_dir: Path = Field(default_factory=lambda: Path.home() / ".ubongo" / "memory")
    logs_dir: Path = Field(default_factory=lambda: Path.home() / ".ubongo" / "logs")

    ollama_model: str = "llama3.1:8b"
    ollama_base_url: str = "http://localhost:11434"

    max_history: int = 10
    confirmation_required: bool = True

    default_folder_location: str = "desktop"

    debug: bool = False

    # ── Provider / tier / quota ────────────────────────────────────────
    provider_mode: str = "auto"          # auto | local_only | cloud_only
    user_tier: str = "free"              # free | pro | power
    effective_tier: str = "free"
    invite_code: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    proxy_url: str = "https://ubongo-proxy.fly.dev"

    query_count: int = 0
    query_count_month: str = ""          # YYYY-MM bucket
    query_limit: int = 100000            # effectively unlimited unless overridden

    class Config:
        env_prefix = "UBONGO_"
        case_sensitive = False

    # ── Computed properties ────────────────────────────────────────────
    @property
    def at_query_limit(self) -> bool:
        self._roll_month_if_needed()
        return self.query_count >= self.query_limit

    @property
    def is_onboarded(self) -> bool:
        return bool(self.invite_code) or bool(self.anthropic_api_key)

    @property
    def monthly_query_count(self) -> int:
        self._roll_month_if_needed()
        return self.query_count

    # ── Persistence helpers ────────────────────────────────────────────
    def ensure_directories(self) -> None:
        self.home_dir.mkdir(parents=True, exist_ok=True)
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)

    def _load_from_config_file(self) -> None:
        """Merge ~/.ubongo/config.json on top of defaults/env."""
        try:
            if not self.config_file.exists():
                return
            data = json.loads(self.config_file.read_text() or "{}")
        except Exception:
            return
        for k, v in data.items():
            if hasattr(self, k):
                try:
                    setattr(self, k, v)
                except Exception:
                    pass
        # Tier defaulting: effective = user
        if not self.effective_tier or self.effective_tier == "free":
            self.effective_tier = self.user_tier or "free"

    def save_partial(self, **kwargs) -> None:
        """Update config.json + this instance with the given keys."""
        try:
            existing = {}
            if self.config_file.exists():
                existing = json.loads(self.config_file.read_text() or "{}")
        except Exception:
            existing = {}
        existing.update(kwargs)
        try:
            self.config_file.parent.mkdir(parents=True, exist_ok=True)
            self.config_file.write_text(json.dumps(existing, indent=2))
        except Exception:
            pass
        for k, v in kwargs.items():
            if hasattr(self, k):
                try:
                    setattr(self, k, v)
                except Exception:
                    pass

    def _roll_month_if_needed(self) -> None:
        bucket = datetime.utcnow().strftime("%Y-%m")
        if self.query_count_month != bucket:
            self.query_count_month = bucket
            self.query_count = 0

    def increment_query_count(self) -> None:
        self._roll_month_if_needed()
        self.query_count += 1


settings = Settings()
settings.ensure_directories()
settings._load_from_config_file()
