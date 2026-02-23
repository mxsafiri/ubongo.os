#!/usr/bin/env python3
"""
Setup wizard for Assistant CLI.
Optimized for African markets - detects hardware and downloads optimal model.
"""

import subprocess
import sys
import platform
import psutil
from pathlib import Path
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.prompt import Confirm, Prompt
from rich.table import Table
from rich.markdown import Markdown

console = Console()

class SetupWizard:
    def __init__(self):
        self.system = platform.system()
        self.ram_gb = psutil.virtual_memory().total / (1024**3)
        self.cpu_count = psutil.cpu_count()
        self.has_gpu = self._check_gpu()
        self.ollama_installed = False
        self.recommended_model = None
    
    def _check_gpu(self) -> bool:
        """Check if GPU is available (basic check)"""
        try:
            if self.system == "Darwin":
                result = subprocess.run(
                    ["system_profiler", "SPDisplaysDataType"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                return "Metal" in result.stdout or "GPU" in result.stdout
            return False
        except:
            return False
    
    def display_welcome(self):
        welcome = """
# 🚀 Assistant CLI Setup Wizard

Welcome! This wizard will help you set up your local AI assistant.

**What we'll do:**
1. Check your system requirements
2. Install Ollama (local LLM runtime)
3. Download the optimal AI model for your hardware
4. Test the installation

**Important:** This is a **one-time setup**. After this, everything works **100% offline** with **zero ongoing costs**.

Perfect for regions with expensive internet or unreliable connectivity.
        """
        console.print(Panel(Markdown(welcome), border_style="cyan"))
    
    def check_system(self):
        console.print("\n📊 Checking your system...\n", style="bold cyan")
        
        table = Table(show_header=True, header_style="bold magenta")
        table.add_column("Component", style="cyan")
        table.add_column("Value", style="green")
        table.add_column("Status", style="yellow")
        
        table.add_row("Operating System", self.system, "✓")
        table.add_row("RAM", f"{self.ram_gb:.1f} GB", self._ram_status())
        table.add_row("CPU Cores", str(self.cpu_count), "✓")
        table.add_row("GPU", "Yes" if self.has_gpu else "No (CPU only)", "✓")
        
        console.print(table)
        console.print()
        
        if self.ram_gb < 4:
            console.print("⚠️  Warning: Less than 4GB RAM detected.", style="yellow")
            console.print("   The assistant will work but may be slower.\n")
        
        self._recommend_model()
    
    def _ram_status(self) -> str:
        if self.ram_gb >= 16:
            return "✓ Excellent"
        elif self.ram_gb >= 8:
            return "✓ Good"
        elif self.ram_gb >= 4:
            return "⚠ Minimum"
        else:
            return "⚠ Low"
    
    def _recommend_model(self):
        if self.ram_gb >= 16:
            self.recommended_model = "mistral:7b"
            size = "4.1 GB"
            quality = "Best quality, powerful reasoning"
        elif self.ram_gb >= 8:
            self.recommended_model = "llama3.2:3b"
            size = "2.0 GB"
            quality = "Balanced quality and speed"
        else:
            self.recommended_model = "llama3.2:1b"
            size = "1.3 GB"
            quality = "Lightweight, fast on low-end hardware"
        
        console.print(f"💡 Recommended model for your system:", style="bold")
        console.print(f"   Model: {self.recommended_model}")
        console.print(f"   Size: {size}")
        console.print(f"   Quality: {quality}\n")
    
    def check_ollama(self) -> bool:
        """Check if Ollama is installed"""
        try:
            result = subprocess.run(
                ["ollama", "--version"],
                capture_output=True,
                timeout=5
            )
            self.ollama_installed = result.returncode == 0
            return self.ollama_installed
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False
    
    def install_ollama(self):
        console.print("\n🔧 Installing Ollama...\n", style="bold cyan")
        
        if self.system == "Darwin":
            console.print("For macOS, please install Ollama manually:")
            console.print("1. Visit: https://ollama.ai")
            console.print("2. Download and install Ollama")
            console.print("3. Run this setup again\n")
            
            if Confirm.ask("Have you installed Ollama?"):
                if self.check_ollama():
                    console.print("✓ Ollama detected!\n", style="green")
                    return True
                else:
                    console.print("❌ Ollama not found. Please install it first.\n", style="red")
                    return False
            return False
        
        elif self.system == "Linux":
            console.print("Installing Ollama for Linux...")
            try:
                subprocess.run(
                    "curl -fsSL https://ollama.ai/install.sh | sh",
                    shell=True,
                    check=True
                )
                console.print("✓ Ollama installed!\n", style="green")
                return True
            except subprocess.CalledProcessError:
                console.print("❌ Installation failed. Please install manually.\n", style="red")
                return False
        
        else:
            console.print("For Windows, please install Ollama manually:")
            console.print("1. Visit: https://ollama.ai")
            console.print("2. Download and install Ollama")
            console.print("3. Run this setup again\n")
            return False
    
    def start_ollama_service(self):
        """Start Ollama service if not running"""
        console.print("🚀 Starting Ollama service...\n")
        
        try:
            subprocess.Popen(
                ["ollama", "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            console.print("✓ Ollama service started\n", style="green")
            return True
        except Exception as e:
            console.print(f"⚠️  Could not start service: {e}\n", style="yellow")
            console.print("Please run 'ollama serve' in another terminal.\n")
            return False
    
    def download_model(self, model: str = None):
        if model is None:
            model = self.recommended_model
        
        console.print(f"\n📥 Downloading {model}...\n", style="bold cyan")
        console.print("This is a one-time download. Please be patient.\n")
        
        if model == "llama3.2:1b":
            size_info = "~1.3 GB"
        elif model == "llama3.2:3b":
            size_info = "~2.0 GB"
        elif model == "mistral:7b":
            size_info = "~4.1 GB"
        else:
            size_info = "Unknown size"
        
        console.print(f"Download size: {size_info}\n")
        
        try:
            result = subprocess.run(
                ["ollama", "pull", model],
                check=True
            )
            
            if result.returncode == 0:
                console.print(f"\n✓ {model} downloaded successfully!\n", style="green")
                return True
            else:
                console.print(f"\n❌ Download failed\n", style="red")
                return False
                
        except subprocess.CalledProcessError as e:
            console.print(f"\n❌ Download failed: {e}\n", style="red")
            return False
    
    def test_installation(self):
        console.print("\n🧪 Testing installation...\n", style="bold cyan")
        
        try:
            result = subprocess.run(
                ["ollama", "list"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if self.recommended_model in result.stdout:
                console.print("✓ Model is ready to use!\n", style="green")
                return True
            else:
                console.print("⚠️  Model not found in Ollama\n", style="yellow")
                return False
                
        except Exception as e:
            console.print(f"❌ Test failed: {e}\n", style="red")
            return False
    
    def install_python_deps(self):
        console.print("\n📦 Installing Python dependencies...\n", style="bold cyan")
        
        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"],
                check=True
            )
            console.print("✓ Dependencies installed!\n", style="green")
            return True
        except subprocess.CalledProcessError:
            console.print("❌ Failed to install dependencies\n", style="red")
            return False
    
    def display_completion(self):
        completion = f"""
# ✅ Setup Complete!

Your Assistant CLI is ready to use **100% offline**.

**What's installed:**
- Ollama runtime
- {self.recommended_model} AI model
- Python dependencies

**Next steps:**

1. **Start the assistant:**
   ```bash
   python -m assistant_cli
   ```
   or
   ```bash
   ./RUN.sh
   ```

2. **Try these commands:**
   - "Create a folder called Projects"
   - "What's my disk space?"
   - "Organize my downloads folder"
   - "/status" - Check system status
   - "help" - See all commands

**Important notes:**
- ✓ Works completely offline (no internet needed)
- ✓ Zero ongoing costs (no API fees)
- ✓ Your data stays on your device
- ✓ Fast and private

**Need help?**
- Type "help" in the assistant
- Read docs/QUICKSTART.md
- Check docs/OFFLINE_FIRST_ARCHITECTURE.md

Enjoy your AI assistant! 🎉
        """
        console.print(Panel(Markdown(completion), border_style="green"))
    
    def run(self):
        self.display_welcome()
        
        if not Confirm.ask("\nReady to begin setup?", default=True):
            console.print("Setup cancelled.\n")
            return
        
        self.check_system()
        
        if not self.check_ollama():
            console.print("❌ Ollama not found.\n", style="yellow")
            if not self.install_ollama():
                console.print("\n⚠️  Please install Ollama manually and run setup again.\n")
                return
        else:
            console.print("✓ Ollama is already installed!\n", style="green")
        
        self.start_ollama_service()
        
        if Confirm.ask(f"\nDownload {self.recommended_model}?", default=True):
            if not self.download_model():
                console.print("\n⚠️  Model download failed. You can try again later with:")
                console.print(f"   ollama pull {self.recommended_model}\n")
                return
        else:
            custom_model = Prompt.ask(
                "Enter model name (e.g., llama3.2:1b, llama3.2:3b, mistral:7b)",
                default=self.recommended_model
            )
            if not self.download_model(custom_model):
                return
        
        if Confirm.ask("\nInstall Python dependencies?", default=True):
            self.install_python_deps()
        
        if self.test_installation():
            self.display_completion()
        else:
            console.print("\n⚠️  Setup completed with warnings. Try running the assistant anyway.\n")

def main():
    wizard = SetupWizard()
    wizard.run()

if __name__ == "__main__":
    main()
