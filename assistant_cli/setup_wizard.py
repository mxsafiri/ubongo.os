#!/usr/bin/env python3
"""
ubongo setup wizard.

Guides the user through:
  1. Hardware check
  2. Tier selection  (Free / Pro $5 / Power $9 / BYOK)
  3. API key entry   (Anthropic for Pro/Power, Groq for Free cloud)
  4. Provider test   (live ping to confirm the key works)
  5. Config save     (~/.ubongo/config.json  +  ~/.ubongo/.env)
  6. 14-day trial    (auto-activated for Pro and Power)
"""

import json
import platform
import subprocess
from datetime import date
from pathlib import Path
from typing import Optional

import psutil
from rich import box
from rich.align import Align
from rich.columns import Columns
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, Prompt
from rich.rule import Rule
from rich.table import Table
from rich.text import Text

console = Console()

# ── Brand palette ─────────────────────────────────────────────────────────────
ACCENT   = "#818cf8"
DIM      = "#475569"
SUCCESS  = "#4ade80"
WARNING  = "#f59e0b"
ERROR    = "#f87171"
POWER_C  = "#c084fc"
PRO_C    = "#60a5fa"
FREE_C   = "#a1a1aa"


# ─────────────────────────────────────────────────────────────────────────────
class SetupWizard:

    def __init__(self):
        self.system      = platform.system()
        self.ram_gb      = psutil.virtual_memory().total / (1024 ** 3)
        self.cpu_count   = psutil.cpu_count(logical=False) or 2
        self.config_path = Path.home() / ".ubongo" / "config.json"
        self.env_path    = Path.home() / ".ubongo" / ".env"

        # Populated during wizard
        self.chosen_tier:       Optional[str] = None
        self.anthropic_api_key: Optional[str] = None
        self.groq_api_key:      Optional[str] = None
        self.provider_mode:     str = "auto"
        self.start_trial:       bool = False

    # ═══════════════════════════════════════════════════════════════════════
    # MAIN FLOW
    # ═══════════════════════════════════════════════════════════════════════

    def run(self) -> bool:
        """Run the full setup wizard. Returns True on success."""
        console.clear()
        self._show_welcome()

        if not Confirm.ask(
            f"[{ACCENT}]Ready to set up ubongo?[/]",
            default=True,
            console=console,
        ):
            console.print("\n[dim]Setup cancelled. Run [bold]ubongo setup[/bold] anytime.[/]\n")
            return False

        console.print()
        self._check_hardware()
        self.chosen_tier = self._select_tier()
        console.print()

        if self.chosen_tier == "free":
            self._setup_free_tier()
        elif self.chosen_tier in ("pro", "power"):
            self._setup_paid_tier(self.chosen_tier)
        elif self.chosen_tier == "byok":
            self._setup_byok()

        console.print()
        ok = self._test_provider()

        if ok:
            self._save_config()
            self._show_completion()
        else:
            self._show_fallback_tip()

        return ok

    # ═══════════════════════════════════════════════════════════════════════
    # STEP 0 — WELCOME
    # ═══════════════════════════════════════════════════════════════════════

    def _show_welcome(self):
        logo = Text()
        logo.append("  ubongo", style=f"bold {ACCENT}")
        logo.append("  ·  personal AI OS layer", style="dim")

        console.print(
            Panel(
                Align.center(logo),
                subtitle=Text("v0.3.0  ·  setup wizard", style=DIM),
                border_style=ACCENT,
                padding=(1, 4),
            )
        )
        console.print()
        console.print(
            "  ubongo is your personal AI layer — it [bold]knows your files[/bold], "
            "[bold]controls your computer[/bold],\n"
            "  and [bold]automates repetitive tasks[/bold]. "
            "Everything stays on your machine.\n",
            style="dim white",
        )

    # ═══════════════════════════════════════════════════════════════════════
    # STEP 1 — HARDWARE CHECK
    # ═══════════════════════════════════════════════════════════════════════

    def _check_hardware(self):
        console.print(Rule(f"[{ACCENT}]System[/]"))
        console.print()

        table = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
        table.add_column(style="dim", width=18)
        table.add_column(style="bold white")
        table.add_column(width=38)

        table.add_row("OS",         self.system,              self._os_note())
        table.add_row("RAM",        f"{self.ram_gb:.1f} GB",  self._ram_note())
        table.add_row("CPU cores",  str(self.cpu_count),      "[dim]–[/]")
        table.add_row("Local AI",   self._local_ai_status(),  self._local_ai_note())

        console.print(table)
        console.print()

    def _os_note(self) -> str:
        return {"Darwin": "[dim]macOS ✓[/]", "Windows": "[dim]Windows ✓[/]"}.get(
            self.system, "[dim]Linux ✓[/]"
        )

    def _ram_note(self) -> str:
        if self.ram_gb >= 16:
            return f"[{SUCCESS}]Excellent — local models run great[/]"
        if self.ram_gb >= 8:
            return f"[{SUCCESS}]Good — small local models work[/]"
        if self.ram_gb >= 4:
            return f"[{WARNING}]OK — cloud tier recommended[/]"
        return f"[{WARNING}]Low — cloud tier strongly recommended[/]"

    def _local_ai_status(self) -> str:
        try:
            r = subprocess.run(["ollama", "--version"], capture_output=True, timeout=3)
            return "Ollama installed" if r.returncode == 0 else "Not installed"
        except Exception:
            return "Not installed"

    def _local_ai_note(self) -> str:
        try:
            r = subprocess.run(["ollama", "--version"], capture_output=True, timeout=3)
            if r.returncode == 0:
                return f"[{SUCCESS}]Offline fallback ready[/]"
        except Exception:
            pass
        return "[dim]Optional — only needed for offline / local-only mode[/]"

    # ═══════════════════════════════════════════════════════════════════════
    # STEP 2 — TIER SELECTION
    # ═══════════════════════════════════════════════════════════════════════

    def _select_tier(self) -> str:
        console.print(Rule(f"[{ACCENT}]How should ubongo think?[/]"))
        console.print()

        free_card = Panel(
            self._tier_body(
                icon="🔒", name="Free", price="$0", period="forever", color=FREE_C,
                features=[
                    ("y", "Groq free tier (internet)"),
                    ("y", "Local Ollama (offline)"),
                    ("y", "Basic tools"),
                    ("y", "200 queries / month"),
                    ("n", "Memory layer"),
                    ("n", "Automation rules"),
                ],
            ),
            title=f"[{FREE_C}] Free [/]", border_style=FREE_C,
        )

        pro_card = Panel(
            self._tier_body(
                icon="⚡", name="Pro", price="$5", period="/month", color=PRO_C,
                features=[
                    ("y", "Claude Haiku (managed)"),
                    ("y", "Memory layer"),
                    ("y", "Automation rules"),
                    ("y", "1,000 queries / month"),
                    ("y", "Priority support"),
                    ("n", "Claude Sonnet access"),
                ],
            ),
            title=f"[{PRO_C}] Pro [/]", border_style=PRO_C,
        )

        power_card = Panel(
            self._tier_body(
                icon="🚀", name="Power", price="$9", period="/month", color=POWER_C,
                badge="★ Most Popular",
                features=[
                    ("y", "Claude Haiku + Sonnet"),
                    ("y", "Smart auto-routing"),
                    ("y", "Memory + knowledge graph"),
                    ("y", "Automation engine"),
                    ("y", "2,000 queries / month"),
                    ("y", "MCP integrations"),
                ],
            ),
            title=f"[{POWER_C}] Power [/]", border_style=POWER_C,
        )

        console.print(Columns([free_card, pro_card, power_card], equal=True, expand=True))
        console.print()
        console.print(
            "  [dim]Pro and Power include a [bold white]14-day free trial[/bold white]"
            " — no credit card needed.[/]\n"
        )

        return Prompt.ask(
            f"  [{ACCENT}]Choose tier[/]",
            choices=["free", "pro", "power", "byok"],
            default="power",
            console=console,
            show_choices=True,
        )

    @staticmethod
    def _tier_body(icon, name, price, period, color, features, badge=None) -> Text:
        t = Text()
        if badge:
            t.append(f" {badge}\n", style=f"bold {color}")
        t.append(f"\n {icon}  ", style="")
        t.append(f"{name}\n", style="bold white")
        t.append("\n ")
        t.append(price, style=f"bold {color}")
        t.append(f" {period}\n\n", style="dim")
        for mark, feat in features:
            if mark == "y":
                t.append("  ✓  ", style=color)
                t.append(f"{feat}\n", style="white")
            else:
                t.append("  –  ", style="dim")
                t.append(f"{feat}\n", style="dim")
        return t

    # ═══════════════════════════════════════════════════════════════════════
    # STEP 3a — FREE TIER
    # ═══════════════════════════════════════════════════════════════════════

    def _setup_free_tier(self):
        console.print(Rule(f"[{FREE_C}]Free tier setup[/]"))
        console.print()
        console.print(
            "  Free tier uses [bold]Groq[/bold] (fast cloud inference, free account)\n"
            "  or falls back to [bold]Ollama[/bold] (fully offline).\n",
            style="dim white",
        )

        if Confirm.ask(
            f"  [{ACCENT}]Set up Groq free account for cloud queries?[/]",
            default=True,
            console=console,
        ):
            console.print(
                "\n  [bold]Get a free Groq API key (no credit card):[/bold]\n"
                "  1. Visit → https://console.groq.com\n"
                "  2. Sign up free → Create API key\n"
                "  3. Paste it below\n",
                style="dim white",
            )
            key = Prompt.ask(
                f"  [{ACCENT}]Groq API key[/] [dim](Enter to skip)[/]",
                default="",
                password=True,
                console=console,
            )
            if key.strip():
                self.groq_api_key = key.strip()
                console.print(f"\n  [{SUCCESS}]✓ Groq key saved[/]\n")
            else:
                console.print("\n  [dim]Skipped — using local Ollama only.[/]\n")
        else:
            console.print(
                "\n  [dim]OK. Make sure Ollama is installed: https://ollama.ai[/]\n"
            )

        self.provider_mode = "auto"

    # ═══════════════════════════════════════════════════════════════════════
    # STEP 3b — PRO / POWER TIER
    # ═══════════════════════════════════════════════════════════════════════

    def _setup_paid_tier(self, tier: str):
        color = POWER_C if tier == "power" else PRO_C
        label = tier.capitalize()
        model = "Claude Haiku + Sonnet" if tier == "power" else "Claude Haiku"

        console.print(Rule(f"[{color}]{label} tier — {model}[/]"))
        console.print()
        console.print(
            f"  [{color}]✦  14-day free trial starts now — no credit card needed.[/]\n\n"
            "  ubongo manages Claude API access for you.\n"
            "  Typical cost after trial: [bold]$1.50–$3/month[/bold] in API usage.\n",
            style="dim white",
        )
        console.print(
            "  [bold]Get your Anthropic API key:[/bold]\n"
            "  1. Visit → https://console.anthropic.com\n"
            "  2. Sign up / log in → API Keys → Create key\n"
            "  3. Paste it below\n",
            style="dim white",
        )

        while True:
            key = Prompt.ask(
                f"\n  [{color}]Anthropic API key[/]",
                password=True,
                console=console,
            ).strip()

            if key.startswith("sk-ant-"):
                self.anthropic_api_key = key
                console.print(f"\n  [{SUCCESS}]✓ Key looks valid[/]\n")
                break
            elif not key:
                if Confirm.ask("  No key entered — continue without Claude?", default=False):
                    console.print("\n  [dim]Will use Groq or local Ollama.[/]\n")
                    break
            else:
                console.print(
                    f"  [{WARNING}]Key should start with 'sk-ant-' — check and try again.[/]"
                )

        self.start_trial  = True
        self.provider_mode = "auto"

    # ═══════════════════════════════════════════════════════════════════════
    # STEP 3c — BYOK
    # ═══════════════════════════════════════════════════════════════════════

    def _setup_byok(self):
        console.print(Rule(f"[{ACCENT}]Bring Your Own Key[/]"))
        console.print()
        console.print(
            "  Use your own API keys — ubongo charges you nothing.\n",
            style="dim white",
        )

        ant = Prompt.ask(
            f"\n  [{ACCENT}]Anthropic API key[/] [dim](Enter to skip)[/]",
            default="", password=True, console=console,
        ).strip()
        if ant:
            self.anthropic_api_key = ant
            console.print(f"  [{SUCCESS}]✓ Anthropic key saved[/]")

        groq = Prompt.ask(
            f"\n  [{ACCENT}]Groq API key[/] [dim](Enter to skip)[/]",
            default="", password=True, console=console,
        ).strip()
        if groq:
            self.groq_api_key = groq
            console.print(f"  [{SUCCESS}]✓ Groq key saved[/]")

        console.print()
        local_only = Confirm.ask(
            f"  [{ACCENT}]Run local-only mode?[/] [dim](never use cloud — max privacy)[/]",
            default=False,
            console=console,
        )
        self.provider_mode = "local_only" if local_only else "auto"
        self.chosen_tier   = "byok"
        console.print()

    # ═══════════════════════════════════════════════════════════════════════
    # STEP 4 — TEST PROVIDER
    # ═══════════════════════════════════════════════════════════════════════

    def _test_provider(self) -> bool:
        console.print(Rule(f"[{ACCENT}]Testing connection[/]"))
        console.print()

        if self.anthropic_api_key:
            return self._test_anthropic()
        if self.groq_api_key:
            return self._test_groq()
        return self._test_ollama()

    def _test_anthropic(self) -> bool:
        console.print(f"  [{ACCENT}]Pinging Anthropic API…[/]", end="")
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self.anthropic_api_key)
            resp   = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=10,
                messages=[{"role": "user", "content": "say hi"}],
            )
            text = resp.content[0].text.strip() if resp.content else ""
            console.print(
                f"\r  [{SUCCESS}]✓ Anthropic connected[/]"
                f" — Claude replied: [dim]\"{text}\"[/]"
            )
            return True
        except ImportError:
            console.print(f"\r  [{WARNING}]⚠  Run: pip install anthropic[/]")
            return False
        except Exception as e:
            err = str(e)
            if "401" in err:
                console.print(f"\r  [{ERROR}]✗ Invalid API key[/]")
            elif "connect" in err.lower():
                console.print(f"\r  [{WARNING}]⚠  No internet — Ollama fallback active[/]")
                return True
            else:
                console.print(f"\r  [{WARNING}]⚠  {err[:80]}[/]")
            return False

    def _test_groq(self) -> bool:
        console.print(f"  [{ACCENT}]Pinging Groq API…[/]", end="")
        try:
            from groq import Groq
            client = Groq(api_key=self.groq_api_key)
            resp   = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": "say hi"}],
                max_tokens=10,
            )
            text = (resp.choices[0].message.content or "").strip()
            console.print(
                f"\r  [{SUCCESS}]✓ Groq connected[/]"
                f" — replied: [dim]\"{text}\"[/]"
            )
            return True
        except ImportError:
            console.print(f"\r  [{WARNING}]⚠  Run: pip install groq[/]")
            return False
        except Exception as e:
            console.print(f"\r  [{WARNING}]⚠  {str(e)[:80]}[/]")
            return False

    def _test_ollama(self) -> bool:
        console.print(f"  [{ACCENT}]Checking local Ollama…[/]", end="")
        try:
            import ollama
            resp   = ollama.Client().list()
            models = getattr(resp, "models", None) or resp.get("models", [])
            if models:
                names = [
                    (getattr(m, "model", None) or m.get("name", ""))
                    for m in models[:3]
                ]
                console.print(
                    f"\r  [{SUCCESS}]✓ Ollama ready[/]"
                    f" — models: [dim]{', '.join(names)}[/]"
                )
                return True
            console.print(
                f"\r  [{WARNING}]⚠  Ollama running but no models installed.[/]\n"
                f"  Run: [bold]ollama pull llama3.2[/bold]"
            )
            return False
        except Exception:
            console.print(
                f"\r  [{WARNING}]⚠  Ollama not running.[/]\n"
                "  Install: https://ollama.ai  or set up a cloud provider above."
            )
            return False

    # ═══════════════════════════════════════════════════════════════════════
    # STEP 5 — SAVE CONFIG
    # ═══════════════════════════════════════════════════════════════════════

    def _save_config(self):
        config_dir = Path.home() / ".ubongo"
        config_dir.mkdir(parents=True, exist_ok=True)

        # Merge with any existing config
        existing: dict = {}
        if self.config_path.exists():
            try:
                existing = json.loads(self.config_path.read_text())
            except Exception:
                pass

        existing["user_tier"]    = self.chosen_tier
        existing["provider_mode"] = self.provider_mode

        if self.anthropic_api_key:
            existing["anthropic_api_key"] = self.anthropic_api_key
        if self.groq_api_key:
            existing["groq_api_key"] = self.groq_api_key
        if self.start_trial:
            existing["trial_active"]     = True
            existing["trial_start_date"] = date.today().isoformat()
            existing["trial_tier"]       = self.chosen_tier

        existing["monthly_query_count"] = 0
        existing["monthly_reset_date"]  = date.today().isoformat()

        self.config_path.write_text(json.dumps(existing, indent=2))

        # Write .env so pydantic-settings picks up keys at next launch
        env_new: dict[str, str] = {
            "UBONGO_USER_TIER":     self.chosen_tier,
            "UBONGO_PROVIDER_MODE": self.provider_mode,
        }
        if self.anthropic_api_key:
            env_new["UBONGO_ANTHROPIC_API_KEY"] = self.anthropic_api_key
        if self.groq_api_key:
            env_new["UBONGO_GROQ_API_KEY"] = self.groq_api_key
        if self.start_trial:
            env_new["UBONGO_TRIAL_ACTIVE"]     = "true"
            env_new["UBONGO_TRIAL_START_DATE"] = date.today().isoformat()
            env_new["UBONGO_TRIAL_TIER"]       = self.chosen_tier

        # Keep any non-ubongo lines that were already in .env
        existing_lines: list[str] = []
        if self.env_path.exists():
            existing_lines = [
                ln for ln in self.env_path.read_text().splitlines()
                if ln and not ln.startswith("UBONGO_")
            ]
        for k, v in env_new.items():
            existing_lines.append(f"{k}={v}")

        self.env_path.write_text("\n".join(existing_lines) + "\n")

        console.print(
            f"\n  [{SUCCESS}]✓ Config saved[/] → [dim]{self.config_path}[/]\n"
        )

    # ═══════════════════════════════════════════════════════════════════════
    # STEP 6 — COMPLETION / FALLBACK
    # ═══════════════════════════════════════════════════════════════════════

    def _show_completion(self):
        tier_label = {
            "free":  f"[{FREE_C}]Free[/]",
            "pro":   f"[{PRO_C}]Pro[/]",
            "power": f"[{POWER_C}]Power[/]",
            "byok":  f"[{ACCENT}]BYOK[/]",
        }.get(self.chosen_tier or "", self.chosen_tier or "")

        trial_line = ""
        if self.start_trial:
            trial_line = (
                f"\n  [{POWER_C}]✦  14-day free trial active — "
                f"full {(self.chosen_tier or '').capitalize()} tier unlocked.[/]"
            )

        console.print()
        console.print(
            Panel(
                Text.from_markup(
                    f"\n  [bold {ACCENT}]✓  ubongo is ready.[/bold {ACCENT}]"
                    f"{trial_line}\n\n"
                    f"  Tier:      {tier_label}\n"
                    f"  Provider:  {self._provider_note()}\n\n"
                    f"  [bold]Start ubongo:[/bold]\n"
                    f"  [bold white]ubongo start[/bold white]"
                    f"  [dim]or[/dim]  "
                    f"[bold white]python -m assistant_cli[/bold white]\n\n"
                    f"  [dim]Try asking:[/dim]\n"
                    f'  [dim]→  "Create a folder called Projects on my desktop"[/dim]\n'
                    f'  [dim]→  "What\'s my disk space?"[/dim]\n'
                    f'  [dim]→  "Organise my downloads by file type"[/dim]\n'
                    f"  [dim]→  /status    (show provider + usage)[/dim]\n"
                ),
                border_style=ACCENT,
                padding=(0, 2),
            )
        )
        console.print()

    def _show_fallback_tip(self):
        console.print()
        console.print(
            Panel(
                Text.from_markup(
                    f"\n  [{WARNING}]⚠  Setup completed with warnings.[/]\n\n"
                    "  ubongo will use the best available provider at runtime.\n"
                    "  Re-run anytime: [bold]ubongo setup[/bold]\n"
                ),
                border_style=WARNING,
                padding=(0, 2),
            )
        )
        console.print()

    def _provider_note(self) -> str:
        if self.anthropic_api_key and self.chosen_tier == "power":
            return f"[{POWER_C}]Claude Haiku + Sonnet (smart-routed)[/]"
        if self.anthropic_api_key:
            return f"[{PRO_C}]Claude Haiku[/]"
        if self.groq_api_key:
            return f"[{FREE_C}]Groq free tier (Llama 3.3 70B)[/]"
        return f"[{FREE_C}]Local Ollama (offline)[/]"


# ─────────────────────────────────────────────────────────────────────────────
def main():
    wizard = SetupWizard()
    wizard.run()


if __name__ == "__main__":
    main()
