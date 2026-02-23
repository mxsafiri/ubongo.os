from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"

class Message(BaseModel):
    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)
    metadata: Optional[Dict[str, Any]] = None

class Intent(str, Enum):
    CONVERSE = "converse"
    CAPABILITY_QUERY = "capability_query"
    STORAGE_FLOW = "storage_flow"
    CREATE_FOLDER = "create_folder"
    MOVE_ITEM = "move_item"
    DELETE_ITEM = "delete_item"
    SEARCH_FILES = "search_files"
    SORT_FILES = "sort_files"
    OPEN_APP = "open_app"
    CLOSE_APP = "close_app"
    GET_SYSTEM_INFO = "get_system_info"
    CREATE_PRESENTATION = "create_presentation"
    CREATE_DOCUMENT = "create_document"
    BROWSE_WEB = "browse_web"
    BROWSER_NAVIGATE = "browser_navigate"
    BROWSER_SEARCH = "browser_search"
    MOUSE_CLICK = "mouse_click"
    MOUSE_MOVE = "mouse_move"
    TYPE_TEXT = "type_text"
    SCREEN_CAPTURE = "screen_capture"
    AUTOMATE_APP = "automate_app"
    UNKNOWN = "unknown"

class ParsedCommand(BaseModel):
    intent: Intent
    params: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.0
    raw_input: str
    requires_confirmation: bool = False

class ExecutionResult(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    
class ConversationContext(BaseModel):
    session_id: str
    messages: List[Message] = Field(default_factory=list)
    last_action: Optional[str] = None
    affected_items: List[str] = Field(default_factory=list)
    awaiting_followup: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    def add_message(self, role: MessageRole, content: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        self.messages.append(Message(role=role, content=content, metadata=metadata))
    
    def get_recent_messages(self, count: int = 10) -> List[Message]:
        return self.messages[-count:]
