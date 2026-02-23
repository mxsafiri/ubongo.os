import sqlite3
from pathlib import Path
from typing import List, Optional
from datetime import datetime
import uuid
from assistant_cli.models import ConversationContext, Message, MessageRole
from assistant_cli.config import settings
from assistant_cli.utils import logger

class ContextManager:
    def __init__(self):
        self.db_path = settings.history_db
        self.current_context: Optional[ConversationContext] = None
        self._init_database()
        logger.info("ContextManager initialized with database: %s", self.db_path)
    
    def _init_database(self) -> None:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                metadata TEXT,
                FOREIGN KEY (session_id) REFERENCES conversations (session_id)
            )
        ''')
        
        conn.commit()
        conn.close()
        logger.debug("Database initialized")
    
    def start_session(self) -> ConversationContext:
        session_id = str(uuid.uuid4())
        self.current_context = ConversationContext(session_id=session_id)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO conversations (session_id) VALUES (?)',
            (session_id,)
        )
        conn.commit()
        conn.close()
        
        logger.info("Started new session: %s", session_id)
        return self.current_context
    
    def add_message(self, role: MessageRole, content: str, metadata: Optional[dict] = None) -> None:
        if not self.current_context:
            self.start_session()
        
        self.current_context.add_message(role, content, metadata)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO messages (session_id, role, content, metadata) VALUES (?, ?, ?, ?)',
            (self.current_context.session_id, role.value, content, str(metadata) if metadata else None)
        )
        conn.commit()
        conn.close()
        
        logger.debug("Added message: %s - %s", role, content[:50])
    
    def get_recent_messages(self, count: int = 10) -> List[Message]:
        if not self.current_context:
            return []
        return self.current_context.get_recent_messages(count)
    
    def update_context(self, last_action: Optional[str] = None, affected_items: Optional[List[str]] = None, awaiting_followup: bool = False) -> None:
        if not self.current_context:
            return
        
        if last_action:
            self.current_context.last_action = last_action
        if affected_items:
            self.current_context.affected_items = affected_items
        self.current_context.awaiting_followup = awaiting_followup
        
        logger.debug("Updated context: action=%s, awaiting_followup=%s", last_action, awaiting_followup)
    
    def get_context(self) -> Optional[ConversationContext]:
        return self.current_context
    
    def clear_context(self) -> None:
        self.current_context = None
        logger.info("Context cleared")
