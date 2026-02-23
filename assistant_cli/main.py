import typer
from assistant_cli.cli import main as cli_main
from assistant_cli import __version__
from assistant_cli.config import settings
from rich.console import Console

app = typer.Typer(
    name="ubongo",
    help="Ubongo OS — Your local AI assistant. Control your Mac with natural language, 100% offline.",
    add_completion=False,
)

console = Console()


@app.command()
def start(
    debug: bool = typer.Option(False, "--debug", "-d", help="Enable debug mode"),
) -> None:
    """Start the Ubongo interactive session"""
    if debug:
        settings.debug = True
    cli_main()


@app.command()
def setup() -> None:
    """Run initial setup (install Ollama, download models, etc.)"""
    from assistant_cli.setup_wizard import SetupWizard

    wizard = SetupWizard()
    wizard.run()


@app.command()
def version() -> None:
    """Show version information"""
    console.print(f"Ubongo OS v{__version__}", style="bold cyan")


@app.callback(invoke_without_command=True)
def callback(ctx: typer.Context) -> None:
    """Default command when no subcommand is provided"""
    if ctx.invoked_subcommand is None:
        cli_main()


if __name__ == "__main__":
    app()
