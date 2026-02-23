import subprocess
import platform
from typing import Optional
from assistant_cli.models import ExecutionResult
from assistant_cli.utils import logger

class AppControl:
    def __init__(self):
        self.platform = platform.system()
        logger.info("AppControl initialized for platform: %s", self.platform)
    
    def open_app(self, app_name: str, action: Optional[str] = None) -> ExecutionResult:
        try:
            if self.platform == "Darwin":
                result = self._open_app_macos(app_name, action)
            elif self.platform == "Windows":
                result = self._open_app_windows(app_name, action)
            elif self.platform == "Linux":
                result = self._open_app_linux(app_name, action)
            else:
                return ExecutionResult(
                    success=False,
                    message=f"Unsupported platform: {self.platform}",
                    error="Platform not supported"
                )
            
            return result
        
        except Exception as e:
            logger.error("Failed to open app: %s", str(e))
            return ExecutionResult(
                success=False,
                message=f"Failed to open {app_name}",
                error=str(e)
            )
    
    def _open_app_macos(self, app_name: str, action: Optional[str] = None) -> ExecutionResult:
        app_map = {
            "spotify": "Spotify",
            "chrome": "Google Chrome",
            "google chrome": "Google Chrome",
            "safari": "Safari",
            "firefox": "Firefox",
            "vscode": "Visual Studio Code",
            "code": "Visual Studio Code",
            "visual studio code": "Visual Studio Code",
            "terminal": "Terminal",
            "iterm": "iTerm",
            "finder": "Finder",
            "notes": "Notes",
            "mail": "Mail",
            "messages": "Messages",
            "slack": "Slack",
            "discord": "Discord",
            "zoom": "zoom.us",
            "itunes": "Music",
            "music": "Music",
            "photos": "Photos",
            "preview": "Preview",
            "pages": "Pages",
            "numbers": "Numbers",
            "keynote": "Keynote",
            "xcode": "Xcode",
            "app store": "App Store",
            "system preferences": "System Preferences",
            "settings": "System Preferences",
            "system settings": "System Settings",
            "activity monitor": "Activity Monitor",
            "calculator": "Calculator",
            "calendar": "Calendar",
            "whatsapp": "WhatsApp",
            "telegram": "Telegram",
        }
        
        app_to_open = app_map.get(app_name.lower(), app_name)
        
        try:
            subprocess.run(["open", "-a", app_to_open], check=True)
            
            message = f"✓ Opened {app_to_open}"
            
            if action:
                message += f"\n  Note: Action '{action}' requires additional automation"
            
            logger.info("Opened app: %s", app_to_open)
            
            return ExecutionResult(
                success=True,
                message=message,
                data={"app": app_to_open, "action": action}
            )
        
        except subprocess.CalledProcessError as e:
            return ExecutionResult(
                success=False,
                message=f"Failed to open {app_to_open}. Is it installed?",
                error=str(e)
            )
    
    def _open_app_windows(self, app_name: str, action: Optional[str] = None) -> ExecutionResult:
        app_map = {
            "chrome": "chrome",
            "firefox": "firefox",
            "edge": "msedge",
            "notepad": "notepad",
            "calculator": "calc",
            "explorer": "explorer",
        }
        
        app_to_open = app_map.get(app_name.lower(), app_name)
        
        try:
            subprocess.Popen([app_to_open])
            
            logger.info("Opened app: %s", app_to_open)
            
            return ExecutionResult(
                success=True,
                message=f"✓ Opened {app_to_open}",
                data={"app": app_to_open, "action": action}
            )
        
        except Exception as e:
            return ExecutionResult(
                success=False,
                message=f"Failed to open {app_to_open}",
                error=str(e)
            )
    
    def _open_app_linux(self, app_name: str, action: Optional[str] = None) -> ExecutionResult:
        try:
            subprocess.Popen([app_name.lower()])
            
            logger.info("Opened app: %s", app_name)
            
            return ExecutionResult(
                success=True,
                message=f"✓ Opened {app_name}",
                data={"app": app_name, "action": action}
            )
        
        except Exception as e:
            return ExecutionResult(
                success=False,
                message=f"Failed to open {app_name}",
                error=str(e)
            )
    
    def close_app(self, app_name: str) -> ExecutionResult:
        try:
            if self.platform == "Darwin":
                subprocess.run(["osascript", "-e", f'quit app "{app_name}"'], check=True)
            elif self.platform == "Windows":
                subprocess.run(["taskkill", "/IM", f"{app_name}.exe", "/F"], check=True)
            else:
                subprocess.run(["pkill", app_name], check=True)
            
            logger.info("Closed app: %s", app_name)
            
            return ExecutionResult(
                success=True,
                message=f"✓ Closed {app_name}",
                data={"app": app_name}
            )
        
        except Exception as e:
            logger.error("Failed to close app: %s", str(e))
            return ExecutionResult(
                success=False,
                message=f"Failed to close {app_name}",
                error=str(e)
            )
