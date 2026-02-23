"""
Screen Control Layer — PyAutoGUI mouse, keyboard, and screenshot automation.

Controls the computer like a human: moves mouse, clicks, types, takes screenshots.
Works with ANY application — not limited to apps with AppleScript support.
"""

import time
import platform
from pathlib import Path
from typing import Optional, Tuple, Dict, Any
from assistant_cli.models import ExecutionResult
from assistant_cli.utils import logger

try:
    import pyautogui
    pyautogui.FAILSAFE = True  # move mouse to corner to abort
    pyautogui.PAUSE = 0.3  # small pause between actions for stability
    HAS_PYAUTOGUI = True
except ImportError:
    HAS_PYAUTOGUI = False
    logger.warning("pyautogui not installed — screen control unavailable")


class ScreenControl:
    """Control mouse, keyboard, and screen like a human user."""

    def __init__(self):
        self.is_macos = platform.system() == "Darwin"
        self.screenshot_dir = Path.home() / "Desktop" / "Screenshots"
        self.last_screenshot: Optional[str] = None

    def _check_available(self) -> Optional[ExecutionResult]:
        if not HAS_PYAUTOGUI:
            return ExecutionResult(
                success=False,
                message="Screen control requires pyautogui. Install with: pip install pyautogui",
                error="pyautogui not installed",
            )
        return None

    # ── Mouse Control ────────────────────────────────────────────

    def click(
        self,
        x: Optional[int] = None,
        y: Optional[int] = None,
        button: str = "left",
        clicks: int = 1,
    ) -> ExecutionResult:
        """Click at coordinates or current position."""
        err = self._check_available()
        if err:
            return err

        try:
            if x is not None and y is not None:
                pyautogui.click(x, y, clicks=clicks, button=button)
                msg = f"✓ Clicked at ({x}, {y})"
            else:
                pyautogui.click(clicks=clicks, button=button)
                pos = pyautogui.position()
                msg = f"✓ Clicked at current position ({pos.x}, {pos.y})"

            return ExecutionResult(
                success=True,
                message=msg,
                data={"x": x, "y": y, "button": button, "clicks": clicks},
            )
        except Exception as e:
            logger.error("Click failed: %s", e)
            return ExecutionResult(
                success=False,
                message=f"Click failed: {e}",
                error=str(e),
            )

    def move_to(self, x: int, y: int, duration: float = 0.5) -> ExecutionResult:
        """Move mouse to coordinates."""
        err = self._check_available()
        if err:
            return err

        try:
            pyautogui.moveTo(x, y, duration=duration)
            return ExecutionResult(
                success=True,
                message=f"✓ Moved mouse to ({x}, {y})",
                data={"x": x, "y": y},
            )
        except Exception as e:
            return ExecutionResult(
                success=False, message=f"Move failed: {e}", error=str(e)
            )

    def scroll(self, amount: int = -3) -> ExecutionResult:
        """Scroll up (positive) or down (negative)."""
        err = self._check_available()
        if err:
            return err

        try:
            pyautogui.scroll(amount)
            direction = "up" if amount > 0 else "down"
            return ExecutionResult(
                success=True,
                message=f"✓ Scrolled {direction}",
                data={"amount": amount},
            )
        except Exception as e:
            return ExecutionResult(
                success=False, message=f"Scroll failed: {e}", error=str(e)
            )

    def get_mouse_position(self) -> ExecutionResult:
        """Get current mouse position."""
        err = self._check_available()
        if err:
            return err

        pos = pyautogui.position()
        return ExecutionResult(
            success=True,
            message=f"Mouse is at ({pos.x}, {pos.y})",
            data={"x": pos.x, "y": pos.y},
        )

    # ── Keyboard Control ─────────────────────────────────────────

    def type_text(self, text: str, interval: float = 0.03) -> ExecutionResult:
        """Type text as if using the keyboard."""
        err = self._check_available()
        if err:
            return err

        try:
            pyautogui.typewrite(text, interval=interval) if text.isascii() else pyautogui.write(text)
            return ExecutionResult(
                success=True,
                message=f"✓ Typed {len(text)} characters",
                data={"text": text[:50], "length": len(text)},
            )
        except Exception as e:
            return ExecutionResult(
                success=False, message=f"Type failed: {e}", error=str(e)
            )

    def hotkey(self, *keys: str) -> ExecutionResult:
        """Press a keyboard shortcut (e.g., 'command', 'c' for Cmd+C)."""
        err = self._check_available()
        if err:
            return err

        try:
            pyautogui.hotkey(*keys)
            combo = "+".join(keys)
            return ExecutionResult(
                success=True,
                message=f"✓ Pressed {combo}",
                data={"keys": list(keys)},
            )
        except Exception as e:
            return ExecutionResult(
                success=False, message=f"Hotkey failed: {e}", error=str(e)
            )

    def press_key(self, key: str) -> ExecutionResult:
        """Press a single key (enter, tab, escape, etc.)."""
        err = self._check_available()
        if err:
            return err

        try:
            pyautogui.press(key)
            return ExecutionResult(
                success=True,
                message=f"✓ Pressed {key}",
                data={"key": key},
            )
        except Exception as e:
            return ExecutionResult(
                success=False, message=f"Key press failed: {e}", error=str(e)
            )

    # ── Screenshot ───────────────────────────────────────────────

    def take_screenshot(self, filename: Optional[str] = None) -> ExecutionResult:
        """Take a screenshot and save it."""
        err = self._check_available()
        if err:
            return err

        try:
            self.screenshot_dir.mkdir(parents=True, exist_ok=True)
            if not filename:
                timestamp = time.strftime("%Y%m%d_%H%M%S")
                filename = f"screenshot_{timestamp}.png"

            filepath = self.screenshot_dir / filename
            screenshot = pyautogui.screenshot()
            screenshot.save(str(filepath))
            self.last_screenshot = str(filepath)

            return ExecutionResult(
                success=True,
                message=f"✓ Screenshot saved to {filepath.name}",
                data={"path": str(filepath), "filename": filename},
            )
        except Exception as e:
            logger.error("Screenshot failed: %s", e)
            return ExecutionResult(
                success=False, message=f"Screenshot failed: {e}", error=str(e)
            )

    def get_screen_size(self) -> ExecutionResult:
        """Get screen dimensions."""
        err = self._check_available()
        if err:
            return err

        size = pyautogui.size()
        return ExecutionResult(
            success=True,
            message=f"Screen size: {size.width} x {size.height}",
            data={"width": size.width, "height": size.height},
        )

    # ── Locate on Screen ─────────────────────────────────────────

    def find_on_screen(self, image_path: str, confidence: float = 0.8) -> ExecutionResult:
        """Find an image on screen (for button/icon detection)."""
        err = self._check_available()
        if err:
            return err

        try:
            location = pyautogui.locateOnScreen(image_path, confidence=confidence)
            if location:
                center = pyautogui.center(location)
                return ExecutionResult(
                    success=True,
                    message=f"✓ Found at ({center.x}, {center.y})",
                    data={"x": center.x, "y": center.y, "region": {
                        "left": location.left, "top": location.top,
                        "width": location.width, "height": location.height,
                    }},
                )
            return ExecutionResult(
                success=False,
                message="Could not find the image on screen.",
                error="Image not found",
            )
        except Exception as e:
            return ExecutionResult(
                success=False, message=f"Screen search failed: {e}", error=str(e)
            )

    # ── Compound Actions ─────────────────────────────────────────

    def click_and_type(self, x: int, y: int, text: str) -> ExecutionResult:
        """Click at a position and type text — common for filling forms."""
        err = self._check_available()
        if err:
            return err

        try:
            pyautogui.click(x, y)
            time.sleep(0.3)
            pyautogui.typewrite(text) if text.isascii() else pyautogui.write(text)
            return ExecutionResult(
                success=True,
                message=f"✓ Clicked ({x}, {y}) and typed text",
                data={"x": x, "y": y, "text": text[:50]},
            )
        except Exception as e:
            return ExecutionResult(
                success=False, message=f"Click and type failed: {e}", error=str(e)
            )

    def select_all_and_replace(self, new_text: str) -> ExecutionResult:
        """Select all text in current field and replace it."""
        err = self._check_available()
        if err:
            return err

        try:
            pyautogui.hotkey("command", "a")
            time.sleep(0.2)
            pyautogui.typewrite(new_text) if new_text.isascii() else pyautogui.write(new_text)
            return ExecutionResult(
                success=True,
                message=f"✓ Replaced text with: {new_text[:50]}",
                data={"text": new_text[:50]},
            )
        except Exception as e:
            return ExecutionResult(
                success=False, message=f"Replace failed: {e}", error=str(e)
            )
