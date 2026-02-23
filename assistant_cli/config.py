from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field
import os

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
    
    class Config:
        env_prefix = "UBONGO_"
        case_sensitive = False

    def ensure_directories(self) -> None:
        self.home_dir.mkdir(parents=True, exist_ok=True)
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)

settings = Settings()
settings.ensure_directories()
