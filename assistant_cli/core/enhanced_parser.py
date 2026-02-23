from typing import Optional
from assistant_cli.models import ParsedCommand, Intent
from assistant_cli.core.smart_matcher import SmartMatcher
from assistant_cli.core.llm_client import LLMClient
from assistant_cli.core.task_planner import TaskPlanner
from assistant_cli.utils import logger

GREETINGS = {"hi", "hello", "hey", "greetings", "sup", "yo"}
THANKS = {"thanks", "thank you", "thx", "cheers"}
AFFIRM = {"ok", "okay", "cool", "nice", "great", "sure", "yep", "yes", "yeah"}
HOWRU = {"how are you", "what's up", "wassup", "how's it going", "how you doing"}

class EnhancedParser:
    """
    Three-layer parsing system:
    1. SmartMatcher – keyword scoring + synonyms + fuzzy (fast, offline)
    2. Local LLM – for truly ambiguous inputs (offline via Ollama)
    3. Task planner – predefined multi-step workflows
    """

    def __init__(self):
        self.smart_matcher = SmartMatcher()
        self.llm_client = LLMClient()
        self.task_planner = TaskPlanner()
        logger.info("EnhancedParser initialized (LLM available: %s)", self.llm_client.available)

    def parse(self, user_input: str) -> ParsedCommand:
        normalized = user_input.lower().strip()

        # ── Stage 1: quick social check (greetings / thanks / etc.) ──
        social = self._check_social(normalized, user_input)
        if social:
            return social

        # ── Stage 2: SmartMatcher keyword scoring ────────────────────
        result = self.smart_matcher.match(user_input)

        if result.confidence > 0:
            return result

        # ── Stage 3: LLM fallback for truly unknown input ───────────
        if self.llm_client.available:
            llm_result = self.llm_client.parse_intent(user_input)
            if llm_result and llm_result.get("confidence", 0) >= 0.7:
                try:
                    return ParsedCommand(
                        intent=Intent(llm_result["intent"]),
                        params=llm_result.get("params", {}),
                        confidence=llm_result.get("confidence", 0.8),
                        raw_input=user_input,
                        requires_confirmation=False,
                    )
                except (KeyError, ValueError):
                    pass

        # ── Stage 4: fall through to UNKNOWN ────────────────────────
        return ParsedCommand(
            intent=Intent.UNKNOWN,
            params={},
            confidence=0.0,
            raw_input=user_input,
            requires_confirmation=False,
        )

    def _check_social(self, normalized: str, raw: str) -> Optional[ParsedCommand]:
        stripped = normalized.rstrip("?!. ")
        if stripped in GREETINGS or stripped in THANKS or stripped in AFFIRM or stripped in HOWRU:
            return ParsedCommand(
                intent=Intent.UNKNOWN,
                params={},
                confidence=0.9,
                raw_input=raw,
                requires_confirmation=False,
            )
        return None

    def plan_task(self, user_input: str):
        rule_based_plan = self.task_planner.plan(user_input)
        if rule_based_plan:
            logger.info("Using rule-based plan (%d steps)", len(rule_based_plan))
            return rule_based_plan

        if self.llm_client.available:
            logger.info("Using LLM for task planning")
            llm_plan = self.llm_client.plan_task(user_input)
            if llm_plan:
                commands = []
                for step in llm_plan:
                    try:
                        commands.append(ParsedCommand(
                            intent=Intent(step["action"]),
                            params=step.get("params", {}),
                            confidence=0.9,
                            raw_input=step.get("description", ""),
                            requires_confirmation=False,
                        ))
                    except (KeyError, ValueError) as e:
                        logger.warning("Invalid step in LLM plan: %s", e)
                return commands if commands else None
        return None

    def is_complex_task(self, user_input: str) -> bool:
        keywords = [
            "organize", "clean", "backup", "prepare", "setup", "configure",
            "tidy", "sort", "arrange", "declutter",
        ]
        return any(kw in user_input.lower() for kw in keywords)
