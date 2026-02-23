from typing import Optional
from assistant_cli.models import ParsedCommand, ExecutionResult, Intent
from assistant_cli.tools import FileOperations, AppControl, SystemInfo
from assistant_cli.tools import AppleScriptAutomation, ScreenControl, BrowserAutomation
from assistant_cli.core.knowledge_base import CapabilityCatalog
from assistant_cli.core.conversation import ConversationalResponder
from assistant_cli.utils import logger

class CommandExecutor:
    def __init__(self):
        self.file_ops = FileOperations()
        self.app_control = AppControl()
        self.system_info = SystemInfo()
        self.applescript = AppleScriptAutomation()
        self.screen = ScreenControl()
        self.browser = BrowserAutomation()
        self.capability_catalog = CapabilityCatalog()
        self.conversational_responder = ConversationalResponder()
        self.last_result: Optional[ExecutionResult] = None
        logger.info("CommandExecutor initialized with automation layers")
    
    def execute(self, command: ParsedCommand) -> ExecutionResult:
        logger.info("Executing command: %s with params: %s", command.intent, command.params)
        
        try:
            if command.intent == Intent.CREATE_FOLDER:
                result = self.file_ops.create_folder(
                    name=command.params.get("name"),
                    location=command.params.get("location", "desktop")
                )
            
            elif command.intent == Intent.MOVE_ITEM:
                if self.last_result and self.last_result.data and "path" in self.last_result.data:
                    source = self.last_result.data["path"]
                    destination = command.params.get("destination", "documents")
                    result = self.file_ops.move_item(source, destination)
                else:
                    result = ExecutionResult(
                        success=False,
                        message="No item to move. Please create or specify an item first.",
                        error="No context for move operation"
                    )
            
            elif command.intent == Intent.DELETE_ITEM:
                if self.last_result and self.last_result.data and "path" in self.last_result.data:
                    path = self.last_result.data["path"]
                    result = self.file_ops.delete_item(path)
                else:
                    result = ExecutionResult(
                        success=False,
                        message="No item to delete. Please specify an item first.",
                        error="No context for delete operation"
                    )
            
            elif command.intent == Intent.SEARCH_FILES:
                result = self.file_ops.search_files(
                    file_type=command.params.get("file_type"),
                    time_range=command.params.get("time_range"),
                    location=command.params.get("location")
                )
            
            elif command.intent == Intent.OPEN_APP:
                app_name = command.params.get("app_name", "")
                lower = command.raw_input.lower()

                # Music playback commands → use AppleScript Music control
                if any(w in lower for w in ["play", "song", "listen"]):
                    # Extract song/artist if mentioned
                    song = command.params.get("song", "")
                    artist = command.params.get("artist", "")
                    # Try to extract from raw input: "play [song] by [artist]"
                    import re
                    by_match = re.search(r"play\s+(.+?)\s+by\s+(.+)", lower)
                    song_match = re.search(
                        r"(?:play|listen to)\s+(.+?)(?:\s+on\s+|\s+in\s+|$)",
                        lower,
                    )
                    if by_match:
                        song = by_match.group(1).strip()
                        artist = by_match.group(2).strip()
                    elif song_match:
                        raw = song_match.group(1).strip()
                        # Filter out generic words
                        if raw not in ("music", "a song", "some music", "something", "songs"):
                            song = raw
                    result = self.applescript.play_music(song=song, artist=artist)
                elif "pause" in lower or "stop music" in lower:
                    result = self.applescript.pause_music()
                elif "next" in lower and ("track" in lower or "song" in lower or "skip" in lower):
                    result = self.applescript.next_track()
                elif "previous" in lower or "back" in lower and ("track" in lower or "song" in lower):
                    result = self.applescript.previous_track()
                elif "what" in lower and "playing" in lower:
                    result = self.applescript.get_current_track()
                else:
                    # Normal app open
                    if not app_name and "music" in lower:
                        app_name = "music"
                    result = self.app_control.open_app(
                        app_name=app_name,
                        action=command.params.get("action")
                    )
            
            elif command.intent == Intent.CLOSE_APP:
                result = self.app_control.close_app(
                    app_name=command.params.get("app_name", "")
                )
            
            elif command.intent == Intent.GET_SYSTEM_INFO:
                if "disk" in command.raw_input.lower():
                    result = self.system_info.get_disk_space()
                elif "cpu" in command.raw_input.lower():
                    result = self.system_info.get_cpu_usage()
                elif "memory" in command.raw_input.lower() or "ram" in command.raw_input.lower():
                    result = self.system_info.get_memory_usage()
                else:
                    result = self.system_info.get_all_info()

            elif command.intent == Intent.SORT_FILES:
                location = command.params.get("location", "downloads")
                result = self.file_ops.sort_files_by_type(location)

            elif command.intent == Intent.CREATE_PRESENTATION:
                title = command.params.get("title", "Untitled Presentation")
                slides = command.params.get("slides")
                theme = command.params.get("theme", "Basic White")
                result = self.applescript.create_presentation(
                    title=title, slides=slides, theme=theme
                )

            elif command.intent == Intent.CREATE_DOCUMENT:
                title = command.params.get("title", "Untitled Document")
                content = command.params.get("content", "")
                result = self.applescript.create_document(
                    title=title, content=content
                )

            elif command.intent == Intent.BROWSE_WEB:
                url = command.params.get("url", "")
                query = command.params.get("query", "")
                app = command.params.get("app", "")
                if app.lower() == "canva":
                    result = self.browser.open_canva(
                        design_type=command.params.get("design_type", "poster")
                    )
                elif app.lower() in ("google docs", "gdocs"):
                    result = self.browser.open_google_docs(
                        title=command.params.get("title")
                    )
                elif query:
                    result = self.browser.google_search(query)
                elif url:
                    result = self.browser.navigate(url)
                else:
                    result = self.applescript.open_url(
                        url or "https://www.google.com"
                    )

            elif command.intent == Intent.BROWSER_NAVIGATE:
                url = command.params.get("url", "")
                result = self.browser.navigate(url)

            elif command.intent == Intent.BROWSER_SEARCH:
                query = command.params.get("query", "")
                result = self.browser.google_search(query)

            elif command.intent == Intent.MOUSE_CLICK:
                x = command.params.get("x")
                y = command.params.get("y")
                result = self.screen.click(x=x, y=y)

            elif command.intent == Intent.TYPE_TEXT:
                text = command.params.get("text", "")
                result = self.screen.type_text(text)

            elif command.intent == Intent.SCREEN_CAPTURE:
                result = self.screen.take_screenshot()

            elif command.intent == Intent.STORAGE_FLOW:
                result = ExecutionResult(
                    success=True,
                    message=(
                        "Got it. I can scan your folders and show what’s taking the most space.\n"
                        "Do you want me to scan your Home folder, Downloads, or the entire drive?"
                    ),
                    data={"type": "storage_prompt"}
                )
            
            elif command.intent == Intent.CAPABILITY_QUERY:
                result = ExecutionResult(
                    success=True,
                    message=self.capability_catalog.render_overview(),
                    data={"type": "capabilities"}
                )
            
            elif command.intent == Intent.CONVERSE:
                response = self.conversational_responder.respond(command.raw_input)
                result = ExecutionResult(
                    success=True,
                    message=response,
                    data={"type": "conversation"}
                )
            
            elif command.intent == Intent.UNKNOWN:
                user_input = command.raw_input.lower().strip()

                if self.conversational_responder.should_handle(command.raw_input):
                    response = self.conversational_responder.respond(command.raw_input)
                    result = ExecutionResult(
                        success=True,
                        message=response,
                        data={"type": "conversation"}
                    )
                    self.last_result = result
                    return result
                
                if any(greeting in user_input for greeting in ['hi', 'hello', 'hey', 'greetings', 'sup', 'yo']):
                    result = ExecutionResult(
                        success=True,
                        message="👋 Hey! I'm your AI assistant. I can help you with:\n"
                                "  • Managing files and folders\n"
                                "  • Opening applications\n"
                                "  • Organizing your downloads\n"
                                "  • Checking system info\n\n"
                                "What would you like to do?",
                        data={}
                    )
                elif any(thanks in user_input for thanks in ['thanks', 'thank you', 'thx']):
                    result = ExecutionResult(
                        success=True,
                        message="😊 You're welcome! Let me know if you need anything else.",
                        data={}
                    )
                elif any(affirm in user_input for affirm in ['ok', 'okay', 'cool', 'nice', 'great']):
                    result = ExecutionResult(
                        success=True,
                        message="👍 Anything else I can help with?",
                        data={}
                    )
                elif 'how are you' in user_input or "what's up" in user_input or 'wassup' in user_input:
                    result = ExecutionResult(
                        success=True,
                        message="I'm doing great, thanks for asking! 🤖\n"
                                "Ready to help you with any tasks. What do you need?",
                        data={}
                    )
                elif 'status' in user_input:
                    result = ExecutionResult(
                        success=True,
                        message="💡 Tip: Use /status to see session info\n\n"
                                "I'm running and ready to help! Try:\n"
                                "  • 'Create a folder'\n"
                                "  • 'What's my disk space?'\n"
                                "  • 'Organize my downloads'\n"
                                "  • '/templates' to see all workflows",
                        data={}
                    )
                else:
                    result = ExecutionResult(
                        success=True,
                        message="🤔 I'm not sure I understood that. I can help you with:\n\n"
                                "**File Operations:**\n"
                                "  • 'Create a folder called Projects'\n"
                                "  • 'Find my screenshots from last week'\n"
                                "  • 'Organize my downloads folder'\n\n"
                                "**Apps & System:**\n"
                                "  • 'Open Spotify'\n"
                                "  • 'What's my disk space?'\n\n"
                                "**Quick Commands:**\n"
                                "  • Type 'help' for more examples\n"
                                "  • Type '/templates' to see workflows\n\n"
                                "What would you like to do?",
                        data={}
                    )
            
            else:
                result = ExecutionResult(
                    success=False,
                    message=f"Command '{command.intent}' is not yet implemented",
                    error="Not implemented"
                )
            
            self.last_result = result if result.success else self.last_result
            
            return result
        
        except Exception as e:
            logger.error("Execution error: %s", str(e), exc_info=True)
            return ExecutionResult(
                success=False,
                message="An error occurred while executing the command",
                error=str(e)
            )
