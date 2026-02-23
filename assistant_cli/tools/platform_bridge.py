"""
Platform Bridge — Unified interface that delegates to macOS or Windows backends.

Usage:
    from assistant_cli.tools.platform_bridge import get_automation
    auto = get_automation()
    auto.play_music()        # Works on both macOS and Windows
    auto.open_url("...")     # Works on both macOS and Windows
"""

import platform
from typing import Optional
from assistant_cli.utils import logger


def get_automation():
    """Return the platform-appropriate automation backend."""
    system = platform.system()

    if system == "Darwin":
        from assistant_cli.tools.applescript_automation import AppleScriptAutomation
        logger.info("Using macOS (AppleScript) automation backend")
        return AppleScriptAutomation()

    if system == "Windows":
        from assistant_cli.tools.windows_automation import WindowsAutomation
        logger.info("Using Windows (PowerShell) automation backend")
        return WindowsAutomation()

    # Linux fallback — minimal support
    logger.warning("Linux detected — automation features are limited")
    return _LinuxFallback()


class _LinuxFallback:
    """Minimal Linux automation using subprocess."""

    def __init__(self):
        import subprocess
        self._subprocess = subprocess

    def _not_supported(self, feature: str):
        from assistant_cli.models import ExecutionResult
        return ExecutionResult(
            success=False,
            message=f"{feature} is not yet supported on Linux. Coming soon!",
            error="Platform not supported",
        )

    def play_music(self, song="", artist=""):
        return self._not_supported("Music control")

    def pause_music(self):
        return self._not_supported("Music control")

    def next_track(self):
        return self._not_supported("Music control")

    def previous_track(self):
        return self._not_supported("Music control")

    def get_current_track(self):
        return self._not_supported("Music control")

    def create_presentation(self, title="", slides=None, theme=""):
        return self._not_supported("Presentation creation")

    def create_document(self, title="", content="", template=""):
        return self._not_supported("Document creation")

    def open_url(self, url, browser="default"):
        from assistant_cli.models import ExecutionResult
        try:
            self._subprocess.Popen(["xdg-open", url])
            return ExecutionResult(
                success=True,
                message=f"✓ Opened {url}",
                data={"url": url},
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                message=f"Failed to open {url}: {e}",
                error=str(e),
            )

    def google_search(self, query):
        from urllib.parse import quote
        return self.open_url(f"https://www.google.com/search?q={quote(query)}")

    def show_notification(self, title, message):
        from assistant_cli.models import ExecutionResult
        try:
            self._subprocess.run(["notify-send", title, message], check=True)
            return ExecutionResult(success=True, message="Notification sent.")
        except Exception:
            return self._not_supported("Notifications")

    def speak(self, text):
        from assistant_cli.models import ExecutionResult
        try:
            self._subprocess.Popen(["espeak", text])
            return ExecutionResult(success=True, message=f"🔊 Speaking...")
        except Exception:
            return self._not_supported("Text-to-speech")

    def activate_app(self, app_name):
        return self._not_supported("App activation")

    def get_frontmost_app(self):
        return self._not_supported("Active window detection")

    def list_running_apps(self):
        from assistant_cli.models import ExecutionResult
        try:
            result = self._subprocess.run(
                ["ps", "-eo", "comm", "--no-headers"],
                capture_output=True, text=True,
            )
            apps = sorted(set(result.stdout.strip().split("\n")))
            return ExecutionResult(
                success=True,
                message=f"Running processes: {len(apps)}",
                data={"apps": apps[:20], "count": len(apps)},
            )
        except Exception:
            return self._not_supported("Process listing")
