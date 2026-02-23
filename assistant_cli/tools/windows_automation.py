"""
Windows Automation Layer — Native Windows control via PowerShell/subprocess.

Provides equivalent functionality to AppleScriptAutomation for Windows:
  - Music control (Windows Media Player / Spotify)
  - Browser control (Edge / Chrome)
  - App launching and management
  - System notifications
  - Document creation
"""

import subprocess
import platform
import os
from typing import Optional, List, Dict, Any
from pathlib import Path
from assistant_cli.models import ExecutionResult
from assistant_cli.utils import logger


class WindowsAutomation:
    """Control Windows applications via PowerShell and subprocess."""

    def __init__(self):
        self.is_windows = platform.system() == "Windows"
        if not self.is_windows:
            logger.warning("WindowsAutomation only works on Windows")

    def _run_powershell(self, script: str, timeout: int = 30) -> ExecutionResult:
        """Execute a PowerShell command and return result."""
        if not self.is_windows:
            return ExecutionResult(
                success=False,
                message="PowerShell automation is only available on Windows.",
                error="Platform not supported",
            )
        try:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", script],
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
                message=f"PowerShell error: {result.stderr.strip()}",
                error=result.stderr.strip(),
            )
        except subprocess.TimeoutExpired:
            return ExecutionResult(
                success=False,
                message="Command timed out.",
                error="Timeout",
            )
        except Exception as e:
            logger.error("PowerShell execution failed: %s", e)
            return ExecutionResult(
                success=False,
                message=f"Failed to run command: {e}",
                error=str(e),
            )

    # ── Music Control ─────────────────────────────────────────────

    def play_music(self, song: str = "", artist: str = "") -> ExecutionResult:
        """Play music — tries Spotify first, then Windows Media Player."""
        # Try Spotify via URI
        if song or artist:
            query = f"{song} {artist}".strip()
            try:
                os.startfile(f"spotify:search:{query}")
                return ExecutionResult(
                    success=True,
                    message=f"▶ Opened Spotify search for: {query}",
                    data={"action": "play_specific", "query": query},
                )
            except Exception:
                pass

        # Generic: try to start Spotify
        try:
            subprocess.Popen(
                ["cmd", "/c", "start", "spotify:"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return ExecutionResult(
                success=True,
                message="▶ Opened Spotify. Hit play to start music!",
                data={"action": "play"},
            )
        except Exception:
            pass

        # Fallback: media key
        script = (
            '$wshell = New-Object -ComObject wscript.shell; '
            '$wshell.SendKeys([char]0xB3)'  # VK_MEDIA_PLAY_PAUSE
        )
        result = self._run_powershell(script)
        if result.success:
            result.message = "▶ Sent play/pause media key."
            result.data = {"action": "media_key"}
        return result

    def pause_music(self) -> ExecutionResult:
        """Pause music via media key."""
        script = (
            '$wshell = New-Object -ComObject wscript.shell; '
            '$wshell.SendKeys([char]0xB3)'
        )
        result = self._run_powershell(script)
        if result.success:
            result.message = "⏸ Sent play/pause media key."
            result.data = {"action": "pause"}
        return result

    def next_track(self) -> ExecutionResult:
        """Skip to next track via media key."""
        script = (
            '$wshell = New-Object -ComObject wscript.shell; '
            '$wshell.SendKeys([char]0xB0)'  # VK_MEDIA_NEXT_TRACK
        )
        result = self._run_powershell(script)
        if result.success:
            result.message = "⏭ Skipped to next track."
            result.data = {"action": "next"}
        return result

    def previous_track(self) -> ExecutionResult:
        """Go to previous track via media key."""
        script = (
            '$wshell = New-Object -ComObject wscript.shell; '
            '$wshell.SendKeys([char]0xB1)'  # VK_MEDIA_PREV_TRACK
        )
        result = self._run_powershell(script)
        if result.success:
            result.message = "⏮ Went back one track."
            result.data = {"action": "previous"}
        return result

    def get_current_track(self) -> ExecutionResult:
        """Get current track info (limited on Windows without Spotify API)."""
        return ExecutionResult(
            success=True,
            message="Track info isn't available natively on Windows. Try using Spotify's interface directly.",
            data={"action": "current_track", "track": ""},
        )

    # ── Document Creation ─────────────────────────────────────────

    def create_presentation(
        self,
        title: str = "Untitled Presentation",
        slides: Optional[List[Dict[str, str]]] = None,
        theme: str = "default",
    ) -> ExecutionResult:
        """Create a PowerPoint presentation if available, otherwise a text outline."""
        if not slides:
            slides = [
                {"title": title, "body": ""},
                {"title": "Overview", "body": "Add your content here"},
                {"title": "Details", "body": "Add your details here"},
                {"title": "Conclusion", "body": "Thank you!"},
            ]

        # Try PowerPoint via COM
        script = """
$ppt = $null
try {
    $ppt = New-Object -ComObject PowerPoint.Application
    $ppt.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue
    $pres = $ppt.Presentations.Add()
""" + "".join(
            f"""
    $slide = $pres.Slides.Add({i + 1}, 1)
    $slide.Shapes.Title.TextFrame.TextRange.Text = "{s.get('title', '').replace('"', '`"')}"
    try {{ $slide.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = "{s.get('body', '').replace('"', '`"')}" }} catch {{}}
"""
            for i, s in enumerate(slides)
        ) + """
    Write-Output "Created presentation with $($pres.Slides.Count) slides"
} catch {
    Write-Output "NO_POWERPOINT"
}
"""
        result = self._run_powershell(script, timeout=45)
        output = (result.data or {}).get("output", "")

        if result.success and "NO_POWERPOINT" not in output:
            result.message = (
                f"✓ Created PowerPoint presentation: \"{title}\"\n"
                f"  • {len(slides)} slides created\n"
                f"  • PowerPoint is now open"
            )
            result.data = {"app": "PowerPoint", "title": title, "slide_count": len(slides)}
            return result

        # Fallback: create a text file outline
        docs_path = Path.home() / "Documents"
        docs_path.mkdir(exist_ok=True)
        filepath = docs_path / f"{title}.txt"
        with open(filepath, "w") as f:
            for i, s in enumerate(slides):
                f.write(f"--- Slide {i + 1} ---\n")
                f.write(f"{s.get('title', '')}\n")
                if s.get("body"):
                    f.write(f"{s['body']}\n")
                f.write("\n")

        try:
            os.startfile(str(filepath))
        except Exception:
            pass

        return ExecutionResult(
            success=True,
            message=(
                f"✓ Created presentation outline: \"{title}\"\n"
                f"  • {len(slides)} slides/sections\n"
                f"  • Saved as {filepath.name} (PowerPoint not available)\n"
                f"  • File opened in default editor"
            ),
            data={"app": "text", "title": title, "slide_count": len(slides), "path": str(filepath)},
        )

    def create_document(
        self,
        title: str = "Untitled Document",
        content: str = "",
        template: str = "Blank",
    ) -> ExecutionResult:
        """Create a document — tries Word, falls back to Notepad."""
        docs_path = Path.home() / "Documents"
        docs_path.mkdir(exist_ok=True)
        filepath = docs_path / f"{title}.txt"
        with open(filepath, "w") as f:
            f.write(f"{title}\n{'=' * len(title)}\n\n{content}\n")

        try:
            os.startfile(str(filepath))
        except Exception:
            pass

        return ExecutionResult(
            success=True,
            message=(
                f"✓ Created document: \"{title}\"\n"
                f"  • Saved to {filepath}\n"
                f"  • Opened in default editor"
            ),
            data={"app": "text", "title": title, "path": str(filepath)},
        )

    # ── Browser ───────────────────────────────────────────────────

    def open_url(self, url: str, browser: str = "default") -> ExecutionResult:
        """Open a URL in the default or specified browser."""
        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        try:
            if browser.lower() in ("default", "edge"):
                os.startfile(url)
            elif browser.lower() in ("chrome", "google chrome"):
                subprocess.Popen(["start", "chrome", url], shell=True)
            elif browser.lower() == "firefox":
                subprocess.Popen(["start", "firefox", url], shell=True)
            else:
                os.startfile(url)

            return ExecutionResult(
                success=True,
                message=f"✓ Opened {url} in {browser}",
                data={"url": url, "browser": browser},
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                message=f"Failed to open {url}: {e}",
                error=str(e),
            )

    def google_search(self, query: str) -> ExecutionResult:
        """Perform a Google search in the default browser."""
        from urllib.parse import quote

        search_url = f"https://www.google.com/search?q={quote(query)}"
        result = self.open_url(search_url)
        if result.success:
            result.message = f"✓ Searched Google for: \"{query}\""
            result.data = {"query": query, "url": search_url}
        return result

    # ── System Dialogs ────────────────────────────────────────────

    def show_notification(self, title: str, message: str) -> ExecutionResult:
        """Show a Windows toast notification."""
        escaped_title = title.replace("'", "''")
        escaped_msg = message.replace("'", "''")
        script = f"""
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$template = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>{escaped_title}</text>
      <text>{escaped_msg}</text>
    </binding>
  </visual>
</toast>
"@
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Ubongo").Show($toast)
"""
        result = self._run_powershell(script)
        if not result.success:
            # Fallback: simple message box
            fallback = f'Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show("{escaped_msg}", "{escaped_title}")'
            result = self._run_powershell(fallback)
        return result

    def speak(self, text: str) -> ExecutionResult:
        """Make Windows speak text aloud using SAPI."""
        escaped = text.replace("'", "''")
        script = f"Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('{escaped}')"
        result = self._run_powershell(script, timeout=60)
        if result.success:
            result.message = f"🔊 Spoke: \"{text[:50]}...\""
        return result

    # ── App Control ───────────────────────────────────────────────

    def activate_app(self, app_name: str) -> ExecutionResult:
        """Bring a window to the foreground."""
        script = f"""
$proc = Get-Process -Name '{app_name}' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($proc) {{
    $sig = '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);'
    Add-Type -MemberDefinition $sig -Name Win32 -Namespace Native
    [Native.Win32]::SetForegroundWindow($proc.MainWindowHandle)
    Write-Output "Activated $($proc.ProcessName)"
}} else {{
    Write-Output "NOT_FOUND"
}}
"""
        result = self._run_powershell(script)
        output = (result.data or {}).get("output", "")
        if "NOT_FOUND" in output:
            result.success = False
            result.message = f"Could not find {app_name} running."
        return result

    def get_frontmost_app(self) -> ExecutionResult:
        """Get the name of the currently active window."""
        script = """
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
$hwnd = [Win32]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256
[Win32]::GetWindowText($hwnd, $sb, 256)
Write-Output $sb.ToString()
"""
        return self._run_powershell(script)

    def list_running_apps(self) -> ExecutionResult:
        """List all visible running applications."""
        script = "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -ExpandProperty ProcessName -Unique | Sort-Object"
        result = self._run_powershell(script)
        if result.success and result.data:
            apps = result.data.get("output", "").strip().split("\n")
            result.data["apps"] = apps
            result.data["count"] = len(apps)
            result.message = f"Running apps: {', '.join(apps[:10])}"
        return result
