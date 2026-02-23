"""
Smart intent matcher using keyword scoring + synonym expansion + fuzzy matching.
Replaces rigid regex with flexible natural language understanding.
Works 100% offline, zero cost.
"""

import re
from typing import Dict, Any, List, Optional, Tuple
from difflib import SequenceMatcher
from assistant_cli.models import Intent, ParsedCommand
from assistant_cli.utils import logger


# ---------------------------------------------------------------------------
# Synonym map – maps common words to their canonical form
# ---------------------------------------------------------------------------
SYNONYMS: Dict[str, str] = {
    # Create
    "make": "create", "build": "create", "generate": "create",
    "new": "create", "add": "create", "setup": "create", "set up": "create",
    "mkdir": "create", "init": "create", "initialize": "create",
    # Folder
    "directory": "folder", "dir": "folder", "path": "folder",
    # Move
    "relocate": "move", "transfer": "move", "put": "move",
    "shift": "move", "drag": "move", "place": "move",
    # Delete
    "remove": "delete", "trash": "delete", "erase": "delete",
    "discard": "delete", "destroy": "delete", "rm": "delete",
    "get rid of": "delete", "wipe": "delete",
    # Open
    "launch": "open", "start": "open", "run": "open",
    "boot": "open", "fire up": "open", "load": "open",
    # Close
    "quit": "close", "exit": "close", "stop": "close",
    "kill": "close", "shut down": "close", "end": "close",
    # Search / Find
    "find": "search", "locate": "search", "look for": "search",
    "where is": "search", "where are": "search", "hunt": "search",
    "scan": "search", "browse": "search", "show me": "search",
    # System
    "usage": "info", "stats": "info", "status": "info",
    "check": "info", "monitor": "info", "report": "info",
    # Storage
    "storage": "space", "disk": "space", "drive": "space",
    "capacity": "space", "size": "space", "gb": "space",
    "heavy": "space", "big": "space", "large": "space",
    "biggest": "space", "largest": "space",
    # Organize
    "tidy": "organize", "sort": "organize", "arrange": "organize",
    "clean up": "organize", "cleanup": "organize", "declutter": "organize",
    "restructure": "organize",
    # Backup
    "copy": "backup", "duplicate": "backup", "archive": "backup",
    "save": "backup", "preserve": "backup", "snapshot": "backup",
    # Conversation
    "chat": "talk", "converse": "talk", "speak": "talk",
    "discuss": "talk",
    # Common short typos (fuzzy needs 4+ chars, so add these directly)
    "opn": "open", "lnch": "open", "fin": "search",
    "dlt": "delete", "del": "delete", "mv": "move",
    "cls": "close", "srt": "sort",
}


# ---------------------------------------------------------------------------
# Intent definitions – each intent has weighted keywords + phrases
# ---------------------------------------------------------------------------
class IntentDef:
    def __init__(
        self,
        intent: Intent,
        keywords: Dict[str, float],
        phrases: List[str],
        param_extractors: Optional[Dict[str, str]] = None,
        requires_confirmation: bool = False,
    ):
        self.intent = intent
        self.keywords = keywords          # word → weight
        self.phrases = phrases            # exact phrase matches (bonus)
        self.param_extractors = param_extractors or {}
        self.requires_confirmation = requires_confirmation


INTENT_DEFS: List[IntentDef] = [
    # ── Storage Flow ─────────────────────────────────────────────
    IntentDef(
        intent=Intent.STORAGE_FLOW,
        keywords={
            "space": 1.5, "storage": 1.5, "disk": 1.2, "drive": 1.0,
            "taking": 0.8, "taken": 0.8, "going": 0.5, "used": 0.8,
            "full": 1.0, "free": 0.9, "heavy": 0.8, "big": 0.6,
            "large": 0.6, "biggest": 1.0, "largest": 1.0,
            "where": 0.5, "scan": 0.6, "most": 0.4,
        },
        phrases=[
            "where is my space going",
            "what is taking space",
            "disk usage",
            "largest files",
            "free up space",
            "running out of space",
            "low on storage",
            "how much space",
        ],
    ),

    # ── Create Folder ────────────────────────────────────────────
    IntentDef(
        intent=Intent.CREATE_FOLDER,
        keywords={
            "create": 1.5, "folder": 1.5, "directory": 1.3,
            "new": 0.6, "make": 0.8,
        },
        phrases=[
            "create a folder",
            "make a folder",
            "new folder",
            "make a directory",
            "create directory",
        ],
        param_extractors={
            "name": r"(?:called|named|name)\s+['\"]?([^'\"]+?)['\"]?(?:\s+(?:on|in|at)|$)",
            "location": r"(?:on|in|at)\s+(?:my\s+)?(\w+)",
        },
    ),

    # ── Move Item ────────────────────────────────────────────────
    IntentDef(
        intent=Intent.MOVE_ITEM,
        keywords={
            "move": 1.5, "transfer": 1.2, "relocate": 1.2,
            "put": 0.8, "shift": 0.8, "drag": 0.7,
        },
        phrases=[
            "move it to",
            "put it in",
            "transfer to",
        ],
        param_extractors={
            "destination": r"(?:to|into|in)\s+(?:my\s+)?(\w+)",
        },
        requires_confirmation=True,
    ),

    # ── Delete Item ──────────────────────────────────────────────
    IntentDef(
        intent=Intent.DELETE_ITEM,
        keywords={
            "delete": 1.5, "remove": 1.3, "trash": 1.2,
            "erase": 1.0, "wipe": 1.0, "destroy": 0.8,
        },
        phrases=[
            "get rid of",
            "throw away",
            "send to trash",
        ],
        requires_confirmation=True,
    ),

    # ── Sort / Organize Files ────────────────────────────────────
    IntentDef(
        intent=Intent.SORT_FILES,
        keywords={
            "organize": 1.5, "tidy": 1.5, "sort": 1.3,
            "arrange": 1.0, "declutter": 1.0, "cleanup": 1.0,
            "downloads": 0.8, "files": 0.5, "folder": 0.4,
        },
        phrases=[
            "organize my downloads",
            "tidy up my downloads",
            "sort my files",
            "organize my files",
            "clean up my downloads",
            "arrange my files",
            "organize them",
            "sort them",
        ],
        param_extractors={
            "location": r"(?:on|in|at)\s+(?:my\s+)?(\w+)",
        },
    ),

    # ── Search Files ─────────────────────────────────────────────
    IntentDef(
        intent=Intent.SEARCH_FILES,
        keywords={
            "search": 1.5, "find": 1.5, "locate": 1.2,
            "where": 0.8, "look": 0.7, "hunt": 0.6,
            "screenshot": 0.9, "image": 0.7, "pdf": 0.7,
            "document": 0.7, "video": 0.7, "file": 0.6,
        },
        phrases=[
            "find my files",
            "search for files",
            "where are my",
            "find screenshots",
            "look for documents",
        ],
        param_extractors={
            "file_type": r"(screenshots?|images?|pdfs?|documents?|videos?|photos?)",
            "time_range": r"(?:from|since|last)\s+(last\s+\w+|this\s+\w+|yesterday|today|this week|this month)",
        },
    ),

    # ── Open App ─────────────────────────────────────────────────
    IntentDef(
        intent=Intent.OPEN_APP,
        keywords={
            "open": 1.5, "launch": 1.3, "start": 1.0, "run": 0.8,
            "boot": 0.7, "load": 0.6,
            "play": 1.5, "music": 1.3, "song": 1.2, "listen": 1.0,
            "pause": 1.5, "skip": 1.2, "next": 0.8, "previous": 0.8,
            "spotify": 1.5, "itunes": 1.5,
        },
        phrases=[
            "open spotify",
            "launch chrome",
            "start vscode",
            "fire up",
            "play music",
            "play some music",
            "play a song",
            "play something",
            "listen to music",
            "open itunes",
            "open music",
            "play a song on",
            "pause music",
            "pause the music",
            "stop the music",
            "skip song",
            "next song",
            "next track",
            "previous song",
            "previous track",
            "what's playing",
            "what is playing",
            "currently playing",
        ],
        param_extractors={
            "app_name": r"(?:open|launch|start|run|boot|load|fire up|play\s+(?:a\s+)?(?:song|music)\s+(?:on|in|with)\s+)(\w+)",
        },
    ),

    # ── Close App ────────────────────────────────────────────────
    IntentDef(
        intent=Intent.CLOSE_APP,
        keywords={
            "close": 1.5, "quit": 1.3, "exit": 1.0, "stop": 0.8,
            "kill": 1.0, "shut": 0.8,
        },
        phrases=[
            "close spotify",
            "quit chrome",
            "kill the app",
        ],
        param_extractors={
            "app_name": r"(?:close|quit|exit|stop|kill)\s+(\w+)",
        },
    ),

    # ── System Info ──────────────────────────────────────────────
    IntentDef(
        intent=Intent.GET_SYSTEM_INFO,
        keywords={
            "cpu": 1.5, "memory": 1.5, "ram": 1.5, "info": 0.8,
            "system": 0.8, "stats": 0.8, "monitor": 0.6,
            "performance": 0.8, "temperature": 0.7, "battery": 0.7,
            "uptime": 0.8,
        },
        phrases=[
            "system info",
            "cpu usage",
            "memory usage",
            "show cpu",
            "check memory",
            "how much ram",
            "system status",
        ],
    ),

    # ── Create Presentation ───────────────────────────────────────
    IntentDef(
        intent=Intent.CREATE_PRESENTATION,
        keywords={
            "presentation": 1.8, "slides": 1.5, "keynote": 1.5,
            "slideshow": 1.3, "powerpoint": 1.2, "ppt": 1.2,
            "pitch": 0.8, "deck": 0.8,
        },
        phrases=[
            "create a presentation",
            "make a presentation",
            "create slides",
            "make slides",
            "create a keynote",
            "make a slideshow",
            "build a presentation",
            "create a pitch deck",
            "presentation about",
            "slides about",
        ],
        param_extractors={
            "title": r"\b(?:about|on|titled?|called)\s+(.+?)\s*$",
        },
    ),

    # ── Create Document ───────────────────────────────────────────
    IntentDef(
        intent=Intent.CREATE_DOCUMENT,
        keywords={
            "document": 1.5, "doc": 1.3, "write": 1.2,
            "pages": 1.0, "letter": 0.8, "essay": 0.8,
            "report": 0.8, "article": 0.7, "note": 0.6,
        },
        phrases=[
            "create a document",
            "write a document",
            "make a document",
            "create a doc",
            "write a letter",
            "write a report",
            "create a pages document",
            "write an essay",
            "write about",
        ],
        param_extractors={
            "title": r"\b(?:about|on|titled?|called)\s+(.+?)\s*$",
        },
    ),

    # ── Browse Web / Web Apps ─────────────────────────────────────
    IntentDef(
        intent=Intent.BROWSE_WEB,
        keywords={
            "browse": 1.5, "website": 1.3, "webpage": 1.2,
            "url": 1.0, "web": 0.9, "google": 1.2,
            "canva": 1.8, "figma": 1.5, "notion": 1.3,
            "gmail": 1.3, "youtube": 1.3, "twitter": 1.0,
            "poster": 1.0, "design": 0.8,
        },
        phrases=[
            "open canva",
            "go to canva",
            "open google docs",
            "go to website",
            "browse to",
            "open in browser",
            "search google",
            "google search",
            "search the web",
            "make a poster",
            "design a poster",
            "create a poster",
            "open figma",
            "open notion",
            "open gmail",
            "open youtube",
        ],
        param_extractors={
            "url": r"(?:go to|open|browse|navigate to)\s+((?:https?://)?[\w.-]+\.\w{2,}(?:/\S*)?)",
            "query": r"(?:search|google|look up)\s+(?:google\s+)?(?:for\s+)?(.+)",
            "app": r"(?:open|go to|use)\s+(canva|figma|notion|google docs|gmail|youtube)",
        },
    ),

    # ── Screen Capture ────────────────────────────────────────────
    IntentDef(
        intent=Intent.SCREEN_CAPTURE,
        keywords={
            "screenshot": 1.8, "screengrab": 1.5, "capture": 1.2,
            "screen": 0.8, "snap": 0.7,
        },
        phrases=[
            "take a screenshot",
            "capture the screen",
            "take a screen grab",
            "screenshot this",
        ],
    ),

    # ── Capability Query ─────────────────────────────────────────
    IntentDef(
        intent=Intent.CAPABILITY_QUERY,
        keywords={
            "capabilities": 1.5, "features": 1.2, "abilities": 1.0,
        },
        phrases=[
            "what can you do",
            "what else can you do",
            "what are your capabilities",
            "show me what you can do",
            "what do you know",
            "who are you",
            "tell me about yourself",
        ],
    ),

    # ── Conversation ─────────────────────────────────────────────
    IntentDef(
        intent=Intent.CONVERSE,
        keywords={
            "talk": 1.0, "chat": 1.0, "explain": 0.8,
            "teach": 0.8, "guide": 0.8, "suggest": 0.7,
            "ideas": 0.7, "more": 0.5, "connected": 0.6,
            "llama": 1.0, "ollama": 1.0,
        },
        phrases=[
            "tell me more",
            "can we talk",
            "let's talk",
            "are you connected",
            "llama status",
            "ollama status",
        ],
    ),
]


# ---------------------------------------------------------------------------
# SmartMatcher – the brain
# ---------------------------------------------------------------------------
class SmartMatcher:
    """
    Keyword-scoring intent classifier with synonym expansion + fuzzy matching.
    Replaces rigid regex. Works 100% offline.
    """

    SCORE_THRESHOLD = 1.0        # minimum score to classify
    PHRASE_BONUS = 2.5           # bonus for exact phrase match
    FUZZY_THRESHOLD = 0.70       # min similarity for fuzzy keyword match

    def __init__(self) -> None:
        self.intent_defs = INTENT_DEFS
        self.synonyms = SYNONYMS
        logger.info(
            "SmartMatcher initialized: %d intents, %d synonyms",
            len(self.intent_defs),
            len(self.synonyms),
        )

    # ── public API ───────────────────────────────────────────────
    def match(self, user_input: str) -> ParsedCommand:
        normalized = self._normalize(user_input)
        tokens = normalized.split()

        scores: List[Tuple[float, IntentDef]] = []

        for idef in self.intent_defs:
            score = self._score(normalized, tokens, idef)
            scores.append((score, idef))

        scores.sort(key=lambda x: x[0], reverse=True)
        best_score, best_def = scores[0]

        if best_score >= self.SCORE_THRESHOLD:
            params = self._extract_params(user_input, best_def)
            confidence = min(best_score / 5.0, 1.0)

            logger.debug(
                "SmartMatcher: '%s' → %s (score=%.2f, confidence=%.2f)",
                user_input, best_def.intent.value, best_score, confidence,
            )

            return ParsedCommand(
                intent=best_def.intent,
                params=params,
                confidence=confidence,
                raw_input=user_input,
                requires_confirmation=best_def.requires_confirmation,
            )

        logger.debug("SmartMatcher: no intent above threshold for '%s'", user_input)
        return ParsedCommand(
            intent=Intent.UNKNOWN,
            params={},
            confidence=0.0,
            raw_input=user_input,
            requires_confirmation=False,
        )

    # ── scoring ──────────────────────────────────────────────────
    def _score(self, normalized: str, tokens: List[str], idef: IntentDef) -> float:
        score = 0.0

        # 1) Phrase bonus – check if any phrase appears in the input
        for phrase in idef.phrases:
            if phrase in normalized:
                score += self.PHRASE_BONUS
                break  # one bonus is enough

        # 2) Keyword scoring – check each token (after synonym expansion)
        for token in tokens:
            canonical = self.synonyms.get(token, token)

            # Also try fuzzy synonym lookup (catches typos like "remov" → "remove" → "delete")
            if canonical == token:
                for syn_key, syn_val in self.synonyms.items():
                    if self._fuzzy_match(token, syn_key):
                        canonical = syn_val
                        break

            if canonical in idef.keywords:
                score += idef.keywords[canonical]
            else:
                # Fuzzy match directly against intent keywords
                for keyword, weight in idef.keywords.items():
                    if self._fuzzy_match(token, keyword):
                        score += weight * 0.7  # slight penalty for fuzzy
                        break

        return score

    # ── helpers ───────────────────────────────────────────────────
    def _normalize(self, text: str) -> str:
        text = text.lower().strip()
        text = re.sub(r"[^\w\s?']", " ", text)
        text = re.sub(r"\s+", " ", text)
        return text

    def _fuzzy_match(self, word: str, target: str) -> bool:
        if len(word) < 4 or len(target) < 4:
            return False
        ratio = SequenceMatcher(None, word, target).ratio()
        return ratio >= self.FUZZY_THRESHOLD

    def _extract_params(self, text: str, idef: IntentDef) -> Dict[str, Any]:
        params: Dict[str, Any] = {}
        text_lower = text.lower()
        for param_name, pattern in idef.param_extractors.items():
            # For titles, match on lowercase but extract from original text
            if param_name == "title":
                m = re.search(pattern, text_lower)
                if m:
                    start, end = m.start(1), m.end(1)
                    params[param_name] = text[start:end].strip()
            else:
                m = re.search(pattern, text_lower)
                if m:
                    params[param_name] = m.group(1).strip()
        return params
