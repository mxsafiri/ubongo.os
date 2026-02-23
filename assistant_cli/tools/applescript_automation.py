"""
AppleScript Automation Layer — Native macOS control.

Controls Keynote, Pages, Safari, and other macOS apps via AppleScript.
No API keys needed. Works fully offline for native apps.
"""

import subprocess
import platform
from typing import Optional, List, Dict, Any
from assistant_cli.models import ExecutionResult
from assistant_cli.utils import logger


class AppleScriptAutomation:
    """Execute AppleScript commands to control macOS applications."""

    def __init__(self):
        self.is_macos = platform.system() == "Darwin"
        if not self.is_macos:
            logger.warning("AppleScript automation only works on macOS")
        self._app_cache: Dict[str, bool] = {}

    def _is_app_installed(self, app_name: str) -> bool:
        """Check if a macOS app is installed by looking in /Applications."""
        if app_name in self._app_cache:
            return self._app_cache[app_name]
        from pathlib import Path
        found = (
            Path(f"/Applications/{app_name}.app").exists()
            or Path(f"/System/Applications/{app_name}.app").exists()
        )
        self._app_cache[app_name] = found
        return found

    def _run_applescript(self, script: str, timeout: int = 30) -> ExecutionResult:
        """Execute raw AppleScript and return result."""
        if not self.is_macos:
            return ExecutionResult(
                success=False,
                message="AppleScript is only available on macOS.",
                error="Platform not supported",
            )
        try:
            # Use stdin piping for multi-line scripts (avoids quoting issues)
            result = subprocess.run(
                ["osascript"],
                input=script,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            if result.returncode == 0:
                return ExecutionResult(
                    success=True,
                    message=result.stdout.strip() or "Done.",
                    data={"output": result.stdout.strip()},
                )
            return ExecutionResult(
                success=False,
                message=f"AppleScript error: {result.stderr.strip()}",
                error=result.stderr.strip(),
            )
        except subprocess.TimeoutExpired:
            return ExecutionResult(
                success=False,
                message="AppleScript timed out. The app may need more time to load.",
                error="Timeout",
            )
        except Exception as e:
            logger.error("AppleScript execution failed: %s", e)
            return ExecutionResult(
                success=False,
                message=f"Failed to run AppleScript: {e}",
                error=str(e),
            )

    # ── Keynote (Presentations) ──────────────────────────────────

    def create_presentation(
        self,
        title: str = "Untitled Presentation",
        slides: Optional[List[Dict[str, str]]] = None,
        theme: str = "Basic White",
    ) -> ExecutionResult:
        """Create a presentation. Uses Keynote if available, otherwise Pages."""
        if not slides:
            slides = [
                {"title": title, "body": ""},
                {"title": "Overview", "body": "Add your content here"},
                {"title": "Details", "body": "Add your details here"},
                {"title": "Conclusion", "body": "Thank you!"},
            ]

        has_keynote = self._is_app_installed("Keynote")

        if has_keynote:
            return self._create_keynote_presentation(title, slides, theme)
        else:
            # Fallback: create a structured document in Pages
            return self._create_pages_presentation(title, slides)

    def _create_keynote_presentation(
        self, title: str, slides: List[Dict[str, str]], theme: str
    ) -> ExecutionResult:
        """Create presentation in Keynote."""
        slide_blocks = []
        for i, slide in enumerate(slides):
            s_title = slide.get("title", "").replace('"', '\\"')
            s_body = slide.get("body", "").replace('"', '\\"')
            if i == 0:
                slide_blocks.append(
                    f'tell slide 1\n'
                    f'try\nset object text of default title item to "{s_title}"\nend try\n'
                    f'try\nset object text of default body item to "{s_body}"\nend try\n'
                    f'end tell'
                )
            else:
                slide_blocks.append(
                    f'set newSlide to make new slide at end\n'
                    f'tell newSlide\n'
                    f'try\nset object text of default title item to "{s_title}"\nend try\n'
                    f'try\nset object text of default body item to "{s_body}"\nend try\n'
                    f'end tell'
                )

        slides_code = "\n".join(slide_blocks)
        script = (
            'tell application "Keynote"\n'
            'activate\n'
            'delay 1\n'
            'set newDoc to make new document\n'
            'tell newDoc\n'
            f'{slides_code}\n'
            'end tell\n'
            'end tell\n'
            f'return "Presentation created with {len(slides)} slides"'
        )

        result = self._run_applescript(script, timeout=45)
        if result.success:
            result.message = (
                f"\u2713 Created Keynote presentation: \"{title}\"\n"
                f"  \u2022 {len(slides)} slides created\n"
                f"  \u2022 Keynote is now open \u2014 you can edit it!"
            )
            result.data = {
                "app": "Keynote",
                "title": title,
                "slide_count": len(slides),
            }
        return result

    def _create_pages_presentation(
        self, title: str, slides: List[Dict[str, str]]
    ) -> ExecutionResult:
        """Create a presentation-style document in Pages (Keynote fallback)."""
        # Build AppleScript string parts joined by 'return' (newline char)
        # AppleScript uses:  "line1" & return & "line2"  for multi-line text
        as_lines = []
        for i, slide in enumerate(slides):
            s_title = slide.get("title", f"Slide {i + 1}").replace('"', '\\"')
            s_body = slide.get("body", "").replace('"', '\\"')
            if i > 0:
                as_lines.append('"" & return & ""')
                as_lines.append(f'"--- Slide {i + 1} ---"')
            as_lines.append(f'"{s_title}"')
            if s_body:
                as_lines.append(f'"{s_body}"')

        # Join all lines with  & return &
        body_expr = " & return & ".join(as_lines)

        script = (
            'tell application "Pages"\n'
            'activate\n'
            'delay 1\n'
            'set newDoc to make new document\n'
            'tell newDoc\n'
            f'set body text to {body_expr}\n'
            'end tell\n'
            'end tell\n'
            'return "Document created"'
        )

        result = self._run_applescript(script, timeout=45)
        if result.success:
            result.message = (
                f"\u2713 Created presentation in Pages: \"{title}\"\n"
                f"  \u2022 {len(slides)} slides/sections created\n"
                f"  \u2022 Keynote not installed \u2014 used Pages instead\n"
                f"  \u2022 Pages is now open \u2014 you can edit it!"
            )
            result.data = {
                "app": "Pages",
                "title": title,
                "slide_count": len(slides),
                "fallback": True,
            }
        return result

    # ── Pages (Documents) ────────────────────────────────────────

    def create_document(
        self,
        title: str = "Untitled Document",
        content: str = "",
        template: str = "Blank",
    ) -> ExecutionResult:
        """Create a Pages document with content."""
        escaped_title = title.replace('"', '\\"')
        escaped_content = content.replace('"', '\\"')

        # Build AppleScript expression using & return & for newlines
        parts = [f'"{escaped_title}"']
        if escaped_content:
            for line in escaped_content.split("\n"):
                parts.append(f'"{line}"')
        body_expr = " & return & ".join(parts)

        script = (
            'tell application "Pages"\n'
            'activate\n'
            'delay 1\n'
            'set newDoc to make new document\n'
            'tell newDoc\n'
            f'set body text to {body_expr}\n'
            'end tell\n'
            'end tell\n'
            'return "Document created"'
        )

        result = self._run_applescript(script, timeout=45)
        if result.success:
            result.message = (
                f"\u2713 Created Pages document: \"{title}\"\n"
                f"  \u2022 Pages is now open \u2014 you can edit it!"
            )
            result.data = {"app": "Pages", "title": title}
        return result

    # ── Music / iTunes Playback Control ─────────────────────────

    def play_music(self, song: str = "", artist: str = "") -> ExecutionResult:
        """Play music in Music.app. If song/artist given, search & play it."""
        if song or artist:
            return self._play_specific(song, artist)
        # Hit play, then try to get track info
        script = (
            'tell application "Music"\n'
            'activate\n'
            'delay 2\n'
            'play\n'
            'delay 1\n'
            'try\n'
            'set trackName to name of current track\n'
            'set trackArtist to artist of current track\n'
            'return trackName & " — " & trackArtist\n'
            'on error\n'
            'return "PLAYING"\n'
            'end try\n'
            'end tell'
        )
        result = self._run_applescript(script, timeout=30)
        if result.success:
            track_info = (result.data or {}).get("output", "")
            if track_info and track_info != "PLAYING":
                result.message = f"▶ Now playing: {track_info}"
                result.data = {"action": "play", "track": track_info}
            else:
                result.message = "▶ Music is playing!"
                result.data = {"action": "play"}
        return result

    def _play_specific(self, song: str = "", artist: str = "") -> ExecutionResult:
        """Search for and play a specific song or artist in Music.app."""
        if song and artist:
            search_term = f"{song} {artist}"
        elif song:
            search_term = song
        else:
            search_term = artist

        escaped = search_term.replace('"', '\\"')
        script = (
            'tell application "Music"\n'
            'activate\n'
            'delay 2\n'
            f'set searchResults to search playlist "Library" for "{escaped}"\n'
            'if (count of searchResults) > 0 then\n'
            'play item 1 of searchResults\n'
            'delay 0.5\n'
            'set trackName to name of current track\n'
            'set trackArtist to artist of current track\n'
            'return trackName & " — " & trackArtist\n'
            'else\n'
            f'return "NOT_FOUND:{escaped}"\n'
            'end if\n'
            'end tell'
        )
        result = self._run_applescript(script, timeout=30)
        if result.success:
            output = (result.data or {}).get("output", "")
            if output.startswith("NOT_FOUND:"):
                result.message = (
                    f"Couldn't find \"{search_term}\" in your library.\n"
                    f"Try adding it to your Music library first, or I can search online."
                )
                result.data = {"action": "search_failed", "query": search_term}
            else:
                result.message = f"▶ Now playing: {output}"
                result.data = {"action": "play_specific", "track": output, "query": search_term}
        return result

    def pause_music(self) -> ExecutionResult:
        """Pause Music.app playback."""
        script = (
            'tell application "Music"\n'
            'delay 1\n'
            'pause\n'
            'return "Paused"\n'
            'end tell'
        )
        result = self._run_applescript(script, timeout=20)
        if result.success:
            result.message = "⏸ Music paused."
            result.data = {"action": "pause"}
        return result

    def next_track(self) -> ExecutionResult:
        """Skip to next track in Music.app."""
        script = (
            'tell application "Music"\n'
            'delay 1\n'
            'next track\n'
            'delay 0.5\n'
            'try\n'
            'set trackName to name of current track\n'
            'set trackArtist to artist of current track\n'
            'return trackName & " — " & trackArtist\n'
            'on error\n'
            'return "SKIPPED"\n'
            'end try\n'
            'end tell'
        )
        result = self._run_applescript(script, timeout=20)
        if result.success:
            track_info = (result.data or {}).get("output", "")
            result.message = f"⏭ Next: {track_info}" if track_info else "⏭ Skipped to next track."
            result.data = {"action": "next", "track": track_info}
        return result

    def previous_track(self) -> ExecutionResult:
        """Go to previous track in Music.app."""
        script = (
            'tell application "Music"\n'
            'delay 1\n'
            'previous track\n'
            'delay 0.5\n'
            'try\n'
            'set trackName to name of current track\n'
            'set trackArtist to artist of current track\n'
            'return trackName & " — " & trackArtist\n'
            'on error\n'
            'return "BACK"\n'
            'end try\n'
            'end tell'
        )
        result = self._run_applescript(script, timeout=20)
        if result.success:
            track_info = (result.data or {}).get("output", "")
            result.message = f"⏮ Previous: {track_info}" if track_info else "⏮ Went back one track."
            result.data = {"action": "previous", "track": track_info}
        return result

    def get_current_track(self) -> ExecutionResult:
        """Get info about the currently playing track."""
        script = (
            'tell application "Music"\n'
            'delay 1\n'
            'if player state is playing then\n'
            'set trackName to name of current track\n'
            'set trackArtist to artist of current track\n'
            'set trackAlbum to album of current track\n'
            'return trackName & " — " & trackArtist & " (" & trackAlbum & ")"\n'
            'else\n'
            'return "NOT_PLAYING"\n'
            'end if\n'
            'end tell'
        )
        result = self._run_applescript(script, timeout=20)
        if result.success:
            output = (result.data or {}).get("output", "")
            if output == "NOT_PLAYING":
                result.message = "Nothing is playing right now. Want me to play something?"
            else:
                result.message = f"🎵 Currently playing: {output}"
            result.data = {"action": "current_track", "track": output}
        return result

    # ── Safari / Browser Navigation ──────────────────────────────

    def open_url(self, url: str, browser: str = "Safari") -> ExecutionResult:
        """Open a URL in the specified browser."""
        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        if browser.lower() in ("safari", "default"):
            script = f'''
                tell application "Safari"
                    activate
                    open location "{url}"
                end tell
                return "Opened {url}"
            '''
        elif browser.lower() in ("chrome", "google chrome"):
            script = f'''
                tell application "Google Chrome"
                    activate
                    open location "{url}"
                end tell
                return "Opened {url}"
            '''
        else:
            # Fallback: use open command
            script = f'do shell script "open \\"{url}\\""'

        result = self._run_applescript(script)
        if result.success:
            result.message = f"✓ Opened {url} in {browser}"
            result.data = {"url": url, "browser": browser}
        return result

    def google_search(self, query: str) -> ExecutionResult:
        """Perform a Google search."""
        from urllib.parse import quote
        search_url = f"https://www.google.com/search?q={quote(query)}"
        result = self.open_url(search_url)
        if result.success:
            result.message = f"✓ Searched Google for: \"{query}\""
            result.data = {"query": query, "url": search_url}
        return result

    # ── System Dialogs ───────────────────────────────────────────

    def show_notification(self, title: str, message: str) -> ExecutionResult:
        """Show a macOS notification."""
        escaped_title = title.replace('"', '\\"')
        escaped_msg = message.replace('"', '\\"')
        script = f'display notification "{escaped_msg}" with title "{escaped_title}"'
        return self._run_applescript(script)

    def speak(self, text: str) -> ExecutionResult:
        """Make the Mac speak text aloud."""
        escaped = text.replace('"', '\\"')
        script = f'say "{escaped}"'
        return self._run_applescript(script)

    # ── App Control ──────────────────────────────────────────────

    def activate_app(self, app_name: str) -> ExecutionResult:
        """Bring an app to the foreground."""
        script = f'''
            tell application "{app_name}"
                activate
            end tell
            return "Activated {app_name}"
        '''
        return self._run_applescript(script)

    def get_frontmost_app(self) -> ExecutionResult:
        """Get the name of the currently active app."""
        script = '''
            tell application "System Events"
                set frontApp to name of first application process whose frontmost is true
            end tell
            return frontApp
        '''
        return self._run_applescript(script)

    def list_running_apps(self) -> ExecutionResult:
        """List all running applications."""
        script = '''
            tell application "System Events"
                set appNames to name of every application process whose background only is false
            end tell
            return appNames as text
        '''
        result = self._run_applescript(script)
        if result.success and result.data:
            apps = result.data.get("output", "").split(", ")
            result.data["apps"] = apps
            result.data["count"] = len(apps)
        return result
