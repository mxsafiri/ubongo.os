from typing import Dict, Any, Optional, List, Tuple
import re
from assistant_cli.models import Intent, ParsedCommand
from assistant_cli.utils import logger

class IntentPattern:
    def __init__(
        self,
        intent: Intent,
        patterns: List[str],
        param_extractors: Optional[Dict[str, str]] = None,
        defaults: Optional[Dict[str, Any]] = None,
        requires_confirmation: bool = False
    ):
        self.intent = intent
        self.patterns = [p.lower() for p in patterns]
        self.param_extractors = param_extractors or {}
        self.defaults = defaults or {}
        self.requires_confirmation = requires_confirmation

INTENT_PATTERNS = [
    IntentPattern(
        intent=Intent.STORAGE_FLOW,
        patterns=[
            r"space",
            r"storage",
            r"disk usage",
            r"largest files",
            r"what is taking space"
        ],
        defaults={},
        requires_confirmation=False
    ),
    IntentPattern(
        intent=Intent.CAPABILITY_QUERY,
        patterns=[
            r"what else can you do",
            r"what can you do",
            r"what are your capabilities",
            r"how can you help",
            r"who are you",
            r"tell me about yourself",
            r"what do you know",
            r"show me what you can do"
        ],
        defaults={},
        requires_confirmation=False
    ),
    IntentPattern(
        intent=Intent.CONVERSE,
        patterns=[
            r"help me",
            r"can you help me",
            r"tell me more",
            r"can we talk",
            r"let'?s talk",
            r"chat with you",
            r"are you connected to llama",
            r"are you connected to ollama",
            r"llama status",
            r"ollama status"
        ],
        defaults={},
        requires_confirmation=False
    ),
    IntentPattern(
        intent=Intent.UNKNOWN,
        patterns=[
            r"^(hi|hello|hey|greetings|sup|yo)$",
            r"^(how are you|what's up|wassup)$",
            r"^(thanks|thank you|thx)$",
            r"^(ok|okay|cool|nice|great)$"
        ],
        defaults={},
        requires_confirmation=False
    ),
    IntentPattern(
        intent=Intent.CREATE_FOLDER,
        patterns=[
            r"create (?:a )?folder",
            r"make (?:a )?(?:new )?(?:directory|folder)",
            r"new folder"
        ],
        param_extractors={
            "name": r"(?:called|named)\s+['\"]?([^'\"]+)['\"]?",
            "location": r"(?:on|in|at)\s+(?:my\s+)?(\w+)"
        },
        defaults={"location": "desktop"},
        requires_confirmation=False
    ),
    IntentPattern(
        intent=Intent.MOVE_ITEM,
        patterns=[
            r"move (?:it|that|the)",
            r"relocate",
            r"transfer"
        ],
        param_extractors={
            "destination": r"to\s+(?:my\s+)?(\w+)"
        },
        requires_confirmation=True
    ),
    IntentPattern(
        intent=Intent.DELETE_ITEM,
        patterns=[
            r"delete",
            r"remove",
            r"trash"
        ],
        requires_confirmation=True
    ),
    IntentPattern(
        intent=Intent.SEARCH_FILES,
        patterns=[
            r"find (?:all )?(?:my )?",
            r"search for",
            r"locate",
            r"look for"
        ],
        param_extractors={
            "file_type": r"(screenshots?|images?|pdfs?|documents?|videos?)",
            "time_range": r"from\s+(last\s+\w+|this\s+\w+|yesterday)"
        }
    ),
    IntentPattern(
        intent=Intent.OPEN_APP,
        patterns=[
            r"open",
            r"launch",
            r"start",
            r"run"
        ],
        param_extractors={
            "app_name": r"(?:open|launch|start|run)\s+(\w+)",
            "action": r"and\s+(.+)"
        }
    ),
    IntentPattern(
        intent=Intent.GET_SYSTEM_INFO,
        patterns=[
            r"(?:what'?s|show|check)\s+(?:my\s+)?(?:disk|cpu|memory|ram)",
            r"system (?:info|status)",
            r"how much (?:space|memory)"
        ]
    ),
    IntentPattern(
        intent=Intent.BROWSER_NAVIGATE,
        patterns=[
            r"go to",
            r"navigate to",
            r"open (?:website|site|url)"
        ],
        param_extractors={
            "url": r"(?:go to|navigate to|open)\s+([^\s]+)"
        }
    ),
    IntentPattern(
        intent=Intent.BROWSER_SEARCH,
        patterns=[
            r"search (?:for|google)",
            r"google",
            r"look up"
        ],
        param_extractors={
            "query": r"(?:search for|google|look up)\s+(.+)"
        }
    ),
]

class IntentParser:
    def __init__(self):
        self.patterns = INTENT_PATTERNS
        logger.info("IntentParser initialized with %d patterns", len(self.patterns))
    
    def parse(self, user_input: str) -> ParsedCommand:
        user_input_lower = user_input.lower().strip()
        logger.debug("Parsing input: %s", user_input)
        
        for pattern_config in self.patterns:
            for pattern in pattern_config.patterns:
                if re.search(pattern, user_input_lower):
                    logger.debug("Matched pattern: %s for intent: %s", pattern, pattern_config.intent)
                    
                    params = self._extract_params(user_input_lower, pattern_config)
                    
                    for key, default_value in pattern_config.defaults.items():
                        if key not in params or params[key] is None:
                            params[key] = default_value
                    
                    return ParsedCommand(
                        intent=pattern_config.intent,
                        params=params,
                        confidence=0.9,
                        raw_input=user_input,
                        requires_confirmation=pattern_config.requires_confirmation
                    )
        
        logger.warning("No pattern matched for input: %s", user_input)
        return ParsedCommand(
            intent=Intent.UNKNOWN,
            params={},
            confidence=0.0,
            raw_input=user_input,
            requires_confirmation=False
        )
    
    def _extract_params(self, text: str, pattern_config: IntentPattern) -> Dict[str, Any]:
        params = {}
        
        for param_name, extractor_pattern in pattern_config.param_extractors.items():
            match = re.search(extractor_pattern, text)
            if match:
                params[param_name] = match.group(1).strip()
                logger.debug("Extracted param %s: %s", param_name, params[param_name])
        
        return params
