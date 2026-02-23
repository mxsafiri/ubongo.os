from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.markdown import Markdown
from rich.theme import Theme
from rich.live import Live
from rich.spinner import Spinner
from assistant_cli.core.enhanced_parser import EnhancedParser
from assistant_cli.core.executor import CommandExecutor
from assistant_cli.core.conversation_engine import ConversationEngine
from assistant_cli.config import settings
from assistant_cli.utils import logger
import sys
import threading

custom_theme = Theme({
    "info": "cyan",
    "warning": "yellow",
    "error": "bold red",
    "success": "bold green",
})

console = Console(theme=custom_theme)


class AssistantCLI:
    def __init__(self):
        self.parser = EnhancedParser()
        self.executor = CommandExecutor()
        self.engine = ConversationEngine(self.parser, self.executor)
        self.running = False
        self.verbose_mode = False
        logger.info("AssistantCLI initialized")

    def display_welcome(self) -> None:
        welcome_text = f"""
# 🤖 Assistant CLI v{settings.version}

Your local AI assistant. Just talk to me naturally:
- "Organize my downloads"
- "What's taking up space?"
- "Open Spotify"

Type 'help' for more, 'exit' to leave.
        """
        console.print(Panel(Markdown(welcome_text), border_style="cyan"))

    def display_help(self) -> None:
        help_text = """
## 💡 Talk to me naturally

**Files:**  "organize my downloads", "find my screenshots", "create a folder called Work"
**Apps:**   "open Chrome", "launch Spotify"
**System:** "what's my disk space?", "check CPU usage"
**Tasks:**  "clean up my desktop", "prepare USB transfer"

**Slash Commands:**
- `/status` – session info
- `/reset`  – fresh start
- `/verbose on|off` – show debug info
- `/templates` – list workflows

**Tips:**
- I remember what just happened — say "move them" or "yes" naturally
- If I'm unsure, I'll ask instead of guessing
- Questions work too: "how should I organize these?"
        """
        console.print(Panel(Markdown(help_text), title="Help", border_style="blue"))

    def handle_slash_command(self, command: str) -> None:
        cmd = command.lower().split()[0]
        if cmd == "/status":
            state = self.engine.memory.state.value
            last = self.engine.memory.last_action or "nothing yet"
            console.print("📊 Session Status:", style="bold")
            console.print(f"  State: {state}")
            console.print(f"  Last action: {last}")
            console.print(f"  LLM: {self.parser.llm_client.available}")
            console.print(f"  Turns: {self.engine.memory.turn_count}")
        elif cmd in ["/reset", "/new", "/clear"]:
            self.engine = ConversationEngine(self.parser, self.executor)
            console.print("✓ Fresh start!", style="success")
        elif cmd == "/verbose":
            parts = command.split()
            if len(parts) > 1 and parts[1] in ["on", "off"]:
                self.verbose_mode = parts[1] == "on"
                console.print(f"✓ Verbose: {parts[1]}", style="success")
            else:
                console.print(f"Verbose: {'On' if self.verbose_mode else 'Off'}. Usage: /verbose on|off")
        elif cmd == "/templates":
            console.print("📋 Task Templates:", style="bold")
            for t in self.parser.task_planner.list_templates():
                console.print(f"  • {t}")
        else:
            console.print(
                f"Unknown: {cmd}. Try /status, /reset, /verbose, /templates",
                style="warning",
            )

    def process_input(self, user_input: str) -> None:
        user_input = user_input.strip()
        if not user_input:
            return

        if user_input.lower() in ["exit", "quit", "q"]:
            self.running = False
            console.print("\n👋 See you later!\n", style="info")
            return

        if user_input.startswith("/"):
            self.handle_slash_command(user_input)
            return

        if user_input.lower() == "help":
            self.display_help()
            return

        # Everything goes through the ConversationEngine — with spinner
        response_holder = [None]

        def _process():
            response_holder[0] = self.engine.process(user_input)

        thread = threading.Thread(target=_process, daemon=True)
        thread.start()

        # Show spinner if response takes > 0.3s
        if not thread.is_alive():
            pass
        else:
            # Quick check — if it finishes fast, skip spinner
            thread.join(timeout=0.3)
            if thread.is_alive():
                with Live(
                    Spinner("dots", text="[dim cyan] Thinking...[/dim cyan]"),
                    console=console,
                    refresh_per_second=10,
                    transient=True,
                ):
                    thread.join()

        response = response_holder[0]
        if response is None:
            response = "Something went wrong. Could you try again?"

        if self.verbose_mode:
            m = self.engine.memory
            console.print(
                f"  [dim]state={m.state.value} last={m.last_action} turns={m.turn_count}[/dim]"
            )

        console.print(f"\n{response}\n", style="info")

    def _warmup_llm(self):
        """Pre-load the LLM model in the background."""
        try:
            if hasattr(self.engine, 'llm'):
                self.engine.llm.warmup()
        except Exception:
            pass

    def run(self) -> None:
        self.running = True

        # Warm up LLM in background while the intro animation plays
        warmup_thread = threading.Thread(target=self._warmup_llm, daemon=True)
        warmup_thread.start()

        # Play Matrix rain → UBONGO intro animation
        from assistant_cli.ui.intro_animation import play_intro
        play_intro()

        self.display_welcome()
        console.print()

        while self.running:
            try:
                user_input = Prompt.ask("[bold cyan]You[/bold cyan]")
                self.process_input(user_input)
            except KeyboardInterrupt:
                console.print("\n\n👋 Goodbye!\n", style="info")
                break
            except EOFError:
                console.print("\n\n👋 Goodbye!\n", style="info")
                break
            except Exception as e:
                logger.error("Error: %s", str(e), exc_info=True)
                console.print(f"\n⚠️  Something went wrong: {str(e)}", style="warning")
                console.print("I'm still here. Try again.\n", style="info")


def main() -> None:
    try:
        cli = AssistantCLI()
        cli.run()
    except Exception as e:
        console.print(f"Fatal error: {str(e)}", style="error")
        logger.error("Fatal error: %s", str(e), exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
