"""
Browser Automation Layer — Playwright-based web app control.

Controls a real browser like a human: navigates, clicks, types, interacts
with web applications like Canva, Google Docs, Gmail, etc.
"""

import time
from typing import Optional, Dict, Any, List
from pathlib import Path
from assistant_cli.models import ExecutionResult
from assistant_cli.utils import logger

try:
    from playwright.sync_api import sync_playwright, Browser, Page, BrowserContext
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False
    logger.warning("playwright not installed — browser automation unavailable")


class BrowserAutomation:
    """Automate web applications using a real browser."""

    def __init__(self):
        self._playwright = None
        self._browser: Optional[Any] = None
        self._context: Optional[Any] = None
        self._page: Optional[Any] = None
        self.screenshot_dir = Path.home() / "Desktop" / "Screenshots"

    def _check_available(self) -> Optional[ExecutionResult]:
        if not HAS_PLAYWRIGHT:
            return ExecutionResult(
                success=False,
                message="Browser automation requires playwright. Install with: pip install playwright && python -m playwright install chromium",
                error="playwright not installed",
            )
        return None

    def _ensure_browser(self) -> Optional[ExecutionResult]:
        """Launch browser if not already running."""
        err = self._check_available()
        if err:
            return err

        if self._page and not self._page.is_closed():
            return None

        try:
            self._playwright = sync_playwright().start()
            self._browser = self._playwright.chromium.launch(
                headless=False,
                args=["--start-maximized"],
            )
            self._context = self._browser.new_context(
                viewport=None,
                no_viewport=True,
            )
            self._page = self._context.new_page()
            logger.info("Browser launched successfully")
            return None
        except Exception as e:
            logger.error("Failed to launch browser: %s", e)
            return ExecutionResult(
                success=False,
                message=f"Failed to launch browser: {e}",
                error=str(e),
            )

    # ── Navigation ───────────────────────────────────────────────

    def navigate(self, url: str) -> ExecutionResult:
        """Navigate to a URL."""
        err = self._ensure_browser()
        if err:
            return err

        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        try:
            self._page.goto(url, wait_until="domcontentloaded", timeout=30000)
            title = self._page.title()
            return ExecutionResult(
                success=True,
                message=f"✓ Opened {url}\n  Page title: {title}",
                data={"url": url, "title": title},
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                message=f"Failed to navigate to {url}: {e}",
                error=str(e),
            )

    def google_search(self, query: str) -> ExecutionResult:
        """Search Google and show results."""
        err = self._ensure_browser()
        if err:
            return err

        try:
            from urllib.parse import quote
            url = f"https://www.google.com/search?q={quote(query)}"
            self._page.goto(url, wait_until="domcontentloaded", timeout=30000)
            time.sleep(1)

            # Extract top results
            results = []
            links = self._page.query_selector_all("h3")
            for link in links[:5]:
                text = link.inner_text()
                if text:
                    results.append(text)

            msg = f"✓ Searched Google for: \"{query}\""
            if results:
                msg += "\n\nTop results:"
                for i, r in enumerate(results, 1):
                    msg += f"\n  {i}. {r}"

            return ExecutionResult(
                success=True,
                message=msg,
                data={"query": query, "results": results},
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                message=f"Search failed: {e}",
                error=str(e),
            )

    # ── Page Interaction ─────────────────────────────────────────

    def click_element(self, selector: str) -> ExecutionResult:
        """Click an element by CSS selector or text."""
        err = self._ensure_browser()
        if err:
            return err

        try:
            # Try text-based selector first
            if not selector.startswith((".", "#", "[", "/")):
                element = self._page.get_by_text(selector, exact=False).first
                if element:
                    element.click()
                    return ExecutionResult(
                        success=True,
                        message=f"✓ Clicked: \"{selector}\"",
                        data={"selector": selector},
                    )

            # CSS selector
            self._page.click(selector, timeout=5000)
            return ExecutionResult(
                success=True,
                message=f"✓ Clicked element: {selector}",
                data={"selector": selector},
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                message=f"Could not click \"{selector}\": {e}",
                error=str(e),
            )

    def type_into(self, selector: str, text: str) -> ExecutionResult:
        """Type text into an input field."""
        err = self._ensure_browser()
        if err:
            return err

        try:
            self._page.fill(selector, text, timeout=5000)
            return ExecutionResult(
                success=True,
                message=f"✓ Typed into {selector}",
                data={"selector": selector, "text": text[:50]},
            )
        except Exception:
            # Fallback: click and type
            try:
                self._page.click(selector, timeout=5000)
                self._page.keyboard.type(text)
                return ExecutionResult(
                    success=True,
                    message=f"✓ Typed into {selector}",
                    data={"selector": selector, "text": text[:50]},
                )
            except Exception as e:
                return ExecutionResult(
                    success=False,
                    message=f"Could not type into \"{selector}\": {e}",
                    error=str(e),
                )

    def press_key(self, key: str) -> ExecutionResult:
        """Press a keyboard key in the browser."""
        err = self._ensure_browser()
        if err:
            return err

        try:
            self._page.keyboard.press(key)
            return ExecutionResult(
                success=True,
                message=f"✓ Pressed {key}",
                data={"key": key},
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                message=f"Key press failed: {e}",
                error=str(e),
            )

    # ── Screenshots ──────────────────────────────────────────────

    def take_screenshot(self, filename: Optional[str] = None) -> ExecutionResult:
        """Take a screenshot of the current page."""
        err = self._ensure_browser()
        if err:
            return err

        try:
            self.screenshot_dir.mkdir(parents=True, exist_ok=True)
            if not filename:
                timestamp = time.strftime("%Y%m%d_%H%M%S")
                filename = f"browser_{timestamp}.png"

            filepath = self.screenshot_dir / filename
            self._page.screenshot(path=str(filepath), full_page=False)

            return ExecutionResult(
                success=True,
                message=f"✓ Browser screenshot saved: {filename}",
                data={"path": str(filepath)},
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                message=f"Screenshot failed: {e}",
                error=str(e),
            )

    def get_page_text(self) -> ExecutionResult:
        """Extract visible text from the current page."""
        err = self._ensure_browser()
        if err:
            return err

        try:
            text = self._page.inner_text("body")
            # Truncate to reasonable size
            if len(text) > 2000:
                text = text[:2000] + "..."

            return ExecutionResult(
                success=True,
                message=f"Page text ({len(text)} chars):\n{text[:500]}",
                data={"text": text, "length": len(text)},
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                message=f"Failed to extract text: {e}",
                error=str(e),
            )

    # ── Web App Workflows ────────────────────────────────────────

    def open_canva(self, design_type: str = "poster") -> ExecutionResult:
        """Open Canva and start a new design."""
        err = self._ensure_browser()
        if err:
            return err

        try:
            # Navigate to Canva
            self._page.goto("https://www.canva.com", wait_until="domcontentloaded", timeout=30000)
            time.sleep(2)

            return ExecutionResult(
                success=True,
                message=(
                    f"✓ Opened Canva in browser\n"
                    f"  • You can now create a {design_type}\n"
                    f"  • The browser is open and ready\n"
                    f"  • Tell me what to click or type next!"
                ),
                data={"app": "Canva", "design_type": design_type, "url": "https://www.canva.com"},
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                message=f"Failed to open Canva: {e}",
                error=str(e),
            )

    def open_google_docs(self, title: Optional[str] = None) -> ExecutionResult:
        """Open Google Docs and optionally create a new document."""
        err = self._ensure_browser()
        if err:
            return err

        try:
            if title:
                # Go directly to new doc
                self._page.goto("https://docs.google.com/document/create", wait_until="domcontentloaded", timeout=30000)
                time.sleep(2)
                msg = f"✓ Opened new Google Doc\n  • You may need to sign in to Google\n  • Tell me what to write!"
            else:
                self._page.goto("https://docs.google.com", wait_until="domcontentloaded", timeout=30000)
                time.sleep(2)
                msg = "✓ Opened Google Docs\n  • You may need to sign in to Google\n  • Tell me what to do!"

            return ExecutionResult(
                success=True,
                message=msg,
                data={"app": "Google Docs", "title": title},
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                message=f"Failed to open Google Docs: {e}",
                error=str(e),
            )

    # ── Cleanup ──────────────────────────────────────────────────

    def close(self):
        """Close the browser."""
        try:
            if self._browser:
                self._browser.close()
            if self._playwright:
                self._playwright.stop()
            self._page = None
            self._context = None
            self._browser = None
            self._playwright = None
        except Exception:
            pass

    def __del__(self):
        self.close()
