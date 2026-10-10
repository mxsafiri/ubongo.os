"""Read and write text in the user's other apps (macOS).

Used by "write & reply":
- copy_selection(app): the text the user has selected in an app, e.g. the
  email they want to answer. Done with ⌘C; the clipboard is put back after.
- paste_text(app, text): put a draft into an app, only when the user clicks
  Insert. Done with ⌘V; the clipboard is put back after.

Keystrokes go through System Events, which needs ubongo to be allowed under
System Settings → Privacy & Security → Accessibility.
"""

import subprocess
import sys
import time
from typing import Callable, Optional

#: Runs an AppleScript and returns its output; swapped out in tests
Runner = Callable[[str], str]


class DesktopTextError(RuntimeError):
    """Something the user can act on (unsupported OS, missing permission…)."""


def run_osascript(script: str) -> str:
    try:
        out = subprocess.run(
            ["osascript", "-e", script], capture_output=True, text=True, timeout=10
        )
    except FileNotFoundError:
        raise DesktopTextError("This only works on macOS.")
    if out.returncode != 0:
        err = out.stderr.strip()
        if "not allowed" in err or "1002" in err or "assistive" in err:
            raise DesktopTextError(
                "ubongo needs permission to use the keyboard: System Settings → "
                "Privacy & Security → Accessibility → turn on ubongo."
            )
        raise DesktopTextError(err or "AppleScript failed")
    return out.stdout.rstrip("\n")


def get_clipboard() -> str:
    return subprocess.run(["pbpaste"], capture_output=True, text=True, timeout=5).stdout


def set_clipboard(text: str) -> None:
    subprocess.run(["pbcopy"], input=text, text=True, timeout=5, check=True)


def _quote(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _require_mac() -> None:
    if sys.platform != "darwin":
        raise DesktopTextError("This only works on macOS.")


def _io(run, get, put):
    """The AppleScript runner and clipboard functions, looked up at call time."""
    return run or run_osascript, get or get_clipboard, put or set_clipboard


def frontmost_app(run: Optional[Runner] = None) -> Optional[str]:
    _require_mac()
    name = (run or run_osascript)('tell application "System Events" to get name of first application process whose frontmost is true')
    return name or None


def copy_selection(
    app: str,
    run: Optional[Runner] = None,
    get: Optional[Callable[[], str]] = None,
    put: Optional[Callable[[str], None]] = None,
    settle: float = 0.3,
) -> str:
    """The text selected in `app` (empty if nothing is selected)."""
    run, get, put = _io(run, get, put)
    _require_mac()
    if not app:
        raise DesktopTextError("I don't know which app you were in. Select the text, then ask again.")
    saved = get()
    put("")
    try:
        run(f"tell application {_quote(app)} to activate")
        run('tell application "System Events" to keystroke "c" using command down')
        time.sleep(settle)
        return get()
    finally:
        put(saved)


def paste_text(
    app: str,
    text: str,
    run: Optional[Runner] = None,
    get: Optional[Callable[[], str]] = None,
    put: Optional[Callable[[str], None]] = None,
    settle: float = 0.4,
) -> None:
    """Type `text` into `app` where its cursor is, by pasting."""
    run, get, put = _io(run, get, put)
    _require_mac()
    if not app:
        raise DesktopTextError("I don't know which app to put it in. Use Copy instead.")
    saved = get()
    put(text)
    try:
        run(f"tell application {_quote(app)} to activate")
        time.sleep(0.15)
        run('tell application "System Events" to keystroke "v" using command down')
        time.sleep(settle)  # let the paste land before the clipboard changes back
    finally:
        put(saved)
