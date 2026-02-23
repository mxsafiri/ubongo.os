"""
ConversationEngine – the brain of the assistant.

Manages conversation state, context memory, input classification,
smart clarification, and natural response generation.

Architecture:
  User Input → classify → check state → route → respond → update memory
"""

from __future__ import annotations
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from assistant_cli.models import Intent, ParsedCommand, ExecutionResult
from assistant_cli.core.llm_client import LLMClient
from assistant_cli.core.quick_answer import quick_answer
from assistant_cli.utils import logger


# ---------------------------------------------------------------------------
# Conversation State Machine
# ---------------------------------------------------------------------------
class ConvoState(str, Enum):
    IDLE = "idle"
    AWAITING_YESNO = "awaiting_yesno"         # asked a yes/no question
    AWAITING_CHOICE = "awaiting_choice"        # offered options (A or B?)
    AWAITING_PARAM = "awaiting_param"          # need a missing parameter
    AWAITING_CLARIFY = "awaiting_clarify"      # asked "what do you mean?"


class InputType(str, Enum):
    COMMAND = "command"           # "organize my downloads"
    QUESTION = "question"         # "how should we organize them?"
    RESPONSE_YES = "yes"          # "yes", "y", "sure", "do it"
    RESPONSE_NO = "no"            # "no", "nah", "cancel", "never mind"
    RESPONSE_CHOICE = "choice"    # picking from offered options
    SOCIAL = "social"             # "hey", "thanks", "bye"
    CONFUSION = "confusion"       # "what?", "huh?", "what do you mean?"
    FREEFORM = "freeform"         # anything else


# ---------------------------------------------------------------------------
# Working Memory – what just happened
# ---------------------------------------------------------------------------
@dataclass
class WorkingMemory:
    last_action: Optional[str] = None
    last_intent: Optional[Intent] = None
    last_result: Optional[ExecutionResult] = None
    last_raw_input: Optional[str] = None
    affected_files: List[str] = field(default_factory=list)
    affected_folders: List[str] = field(default_factory=list)
    pending_question: Optional[str] = None
    pending_action: Optional[ParsedCommand] = None
    pending_options: List[str] = field(default_factory=list)
    pending_param_name: Optional[str] = None
    sort_moved: Optional[Dict[str, int]] = None      # files moved this time
    sort_existing: Optional[Dict[str, int]] = None    # files already in category folders
    sort_skipped: int = 0
    sort_skipped_files: List[str] = field(default_factory=list)
    sort_base_path: Optional[str] = None
    downloads_organized: bool = False
    last_search_count: int = 0  # total files found (before truncation)
    state: ConvoState = ConvoState.IDLE
    turn_count: int = 0

    @property
    def sort_summary(self) -> Optional[Dict[str, int]]:
        """Combined view: moved + existing."""
        if self.sort_moved or self.sort_existing:
            combined = dict(self.sort_existing or {})
            for k, v in (self.sort_moved or {}).items():
                combined[k] = combined.get(k, 0) + v
            return combined
        return None

    def clear_pending(self):
        self.pending_question = None
        self.pending_action = None
        self.pending_options = []
        self.pending_param_name = None
        self.state = ConvoState.IDLE


# ---------------------------------------------------------------------------
# Input Classifier
# ---------------------------------------------------------------------------
YES_WORDS = {
    "yes", "y", "yeah", "yep", "yup", "sure", "ok", "okay",
    "do it", "go ahead", "proceed", "absolutely", "definitely",
    "please", "go for it", "lets go", "let's go", "alright",
}
NO_WORDS = {
    "no", "n", "nah", "nope", "cancel", "stop", "never mind",
    "nevermind", "forget it", "don't", "dont", "skip",
}
SOCIAL_GREETINGS = {"hi", "hello", "hey", "sup", "yo", "greetings"}
SOCIAL_THANKS = {"thanks", "thank you", "thx", "cheers", "appreciated"}
SOCIAL_BYE = {"bye", "goodbye", "later", "see you"}
CONFUSION_PHRASES = {
    "what", "huh", "what do you mean", "i don't understand",
    "explain", "what are you saying", "come again",
    "i dont understand", "what does that mean", "sorry what",
}


def classify_input(text: str, state: ConvoState) -> InputType:
    """Classify what type of input this is, considering current state."""
    clean = text.lower().strip().rstrip("?!. ")

    # If we're waiting for a yes/no, prioritize that interpretation
    if state == ConvoState.AWAITING_YESNO:
        if clean in YES_WORDS:
            return InputType.RESPONSE_YES
        if clean in NO_WORDS:
            return InputType.RESPONSE_NO

    # Confusion / clarification requests
    if clean in CONFUSION_PHRASES:
        return InputType.CONFUSION

    # Social
    if clean in SOCIAL_GREETINGS or clean in SOCIAL_THANKS or clean in SOCIAL_BYE:
        return InputType.SOCIAL

    # Questions (starts with question word or ends with ?)
    question_starters = (
        "how", "what", "why", "when", "where", "which", "who",
        "is ", "are ", "does ", "do ", "did ",
        "can you explain", "could you explain", "could you",
        "tell me", "explain ", "define ", "describe ",
        "solve ", "calculate ", "compute ", "evaluate ",
    )
    if text.strip().endswith("?") or clean.startswith(question_starters):
        # But some questions are actually commands: "can you organize my downloads?"
        action_verbs = (
            "can you organize", "can you sort", "can you move", "can you delete",
            "can you open", "can you close", "can you find", "can you create",
            "can you clean", "can you put", "can you make", "can you search",
            "can you launch", "can you start", "can you check", "can you show",
            "can you help", "can you run", "can you scan", "can you play",
            "could you organize", "could you sort", "could you move",
            "could you help", "could you check", "could you show",
            "tell me to", "tell me how to",
        )
        if clean.startswith(action_verbs):
            return InputType.COMMAND
        return InputType.QUESTION

    # Yes/No even outside of awaiting state (for natural flow)
    if clean in YES_WORDS:
        return InputType.RESPONSE_YES
    if clean in NO_WORDS:
        return InputType.RESPONSE_NO

    return InputType.COMMAND


# ---------------------------------------------------------------------------
# ConversationEngine
# ---------------------------------------------------------------------------
class ConversationEngine:
    """
    The brain. Manages state, memory, classification, and response routing.
    """

    def __init__(self, parser, executor):
        self.parser = parser
        self.executor = executor
        self.memory = WorkingMemory()
        self.history: List[Dict[str, str]] = []
        # Use LLM from parser if available, otherwise create one
        self.llm = getattr(parser, 'llm_client', None) or LLMClient()
        logger.info("ConversationEngine initialized (LLM: %s)", self.llm.available)

    def process(self, user_input: str) -> str:
        """
        Main entry point. Takes user input, returns natural response.
        Handles ALL routing logic internally.
        """
        self.memory.turn_count += 1
        self.history.append({"role": "user", "text": user_input})

        # ── Instant answers: math, capitals, dates, facts (skip all routing) ──
        instant = quick_answer(user_input)
        if instant:
            self.history.append({"role": "assistant", "text": instant})
            return instant

        input_type = classify_input(user_input, self.memory.state)
        logger.debug(
            "Turn %d: input_type=%s state=%s input='%s'",
            self.memory.turn_count, input_type.value,
            self.memory.state.value, user_input[:50],
        )

        response = self._route(user_input, input_type)

        self.history.append({"role": "assistant", "text": response})
        return response

    # ── routing ──────────────────────────────────────────────────
    def _route(self, text: str, input_type: InputType) -> str:

        # Handle based on current state first
        if self.memory.state == ConvoState.AWAITING_YESNO:
            return self._handle_yesno(text, input_type)

        if self.memory.state == ConvoState.AWAITING_CHOICE:
            return self._handle_choice(text, input_type)

        if self.memory.state == ConvoState.AWAITING_PARAM:
            return self._handle_param(text, input_type)

        if self.memory.state == ConvoState.AWAITING_CLARIFY:
            return self._handle_clarify(text, input_type)

        # State is IDLE – process fresh input
        if input_type == InputType.SOCIAL:
            return self._handle_social(text)

        if input_type == InputType.CONFUSION:
            return self._handle_confusion(text)

        if input_type == InputType.QUESTION:
            return self._handle_question(text)

        if input_type in (InputType.RESPONSE_YES, InputType.RESPONSE_NO):
            # Yes/No but we weren't asking anything
            if input_type == InputType.RESPONSE_YES:
                return "Sure! What would you like me to do?"
            return "No problem. What would you like to do instead?"

        # It's a COMMAND
        return self._handle_command(text)

    # ── command handling ─────────────────────────────────────────
    def _handle_command(self, text: str) -> str:
        lower = text.lower()

        # ── System/PC understanding requests ─────────────────────
        if any(p in lower for p in ["understand my", "check my", "about my pc", "about my computer", "about my mac", "help me with my pc", "help me with my computer", "understand my pc"]):
            return self._run_attention_check()

        # ── "what are the files" type requests as commands ────────
        if any(p in lower for p in ["what are the file", "list the file", "show the file", "show me the file"]):
            return self._list_remembered_files()

        # ── Context-aware interception ────────────────────────────
        context_response = self._check_context_reference(text)
        if context_response:
            return context_response

        parsed = self.parser.parse(text)

        # Check if this is a complex task
        if self.parser.is_complex_task(text):
            plan = self.parser.plan_task(text)
            if plan:
                self.memory.pending_action = parsed
                self.memory.state = ConvoState.AWAITING_YESNO
                self.memory.pending_question = "execute_plan"
                self.memory.pending_options = plan
                steps_text = "\n".join(
                    f"  {i}. {s.raw_input or s.intent.value}"
                    for i, s in enumerate(plan, 1)
                )
                return f"Here's my plan ({len(plan)} steps):\n{steps_text}\n\nShall I go ahead?"

        # Low confidence + UNKNOWN intent – try quick answer, then LLM
        if parsed.confidence < 0.3 and parsed.intent == Intent.UNKNOWN:
            instant = quick_answer(text)
            if instant:
                return instant
            llm_answer = self._ask_llm(text)
            if llm_answer:
                return llm_answer
            return self._ask_clarification(text, parsed)

        # Medium confidence – check if it makes sense in context
        if parsed.confidence < 0.6:
            return self._smart_execute_with_context(text, parsed)

        # High confidence – execute
        return self._execute_and_respond(text, parsed)

    def _check_context_reference(self, text: str) -> Optional[str]:
        """Detect when user refers to files/results from previous action."""
        lower = text.lower()

        # References to specific file types after sorting
        if self.memory.sort_summary:
            from pathlib import Path
            base_name = Path(self.memory.sort_base_path).name if self.memory.sort_base_path else "Downloads"
            file_types = {
                "video": "Videos", "videos": "Videos",
                "image": "Images", "images": "Images", "photo": "Images", "photos": "Images",
                "document": "Documents", "documents": "Documents", "doc": "Documents", "docs": "Documents",
                "audio": "Audio", "music": "Audio",
                "archive": "Archives", "archives": "Archives", "zip": "Archives",
                "code": "Code",
            }
            for word, category in file_types.items():
                if word in lower:
                    count = self.memory.sort_summary.get(category, 0)
                    if count > 0:
                        if any(v in lower for v in ["put", "move", "transfer", "combine", "merge"]):
                            return (
                                f"Your {count} {word} files are already in the {category} folder "
                                f"(inside {base_name}). Want me to move them somewhere else?"
                            )
                        if any(v in lower for v in ["where", "find", "show", "list"]):
                            return (
                                f"Your {word} files ({count} total) are in {base_name}/{category}. "
                                f"Want me to open that folder or do something with them?"
                            )

        # "them" / "those" / "these" referring to last action
        if any(w in lower for w in ["them", "those", "these", "it"]):
            if self.memory.last_intent == Intent.SORT_FILES and self.memory.sort_summary:
                total = sum(self.memory.sort_summary.values())
                if any(v in lower for v in ["organize", "sort", "clean", "tidy"]):
                    if total == 0:
                        return "Those files are already organized! Want me to do something else?"
                    return (
                        "I already sorted those files. Here's the summary:\n"
                        + self._format_sort_summary()
                        + "\n\nWant me to organize them differently?"
                    )

        return None

    # ── execution with smart response ────────────────────────────
    def _execute_and_respond(self, text: str, parsed: ParsedCommand) -> str:
        # Special: if they want to sort but we already organized
        if parsed.intent == Intent.SORT_FILES and self.memory.downloads_organized:
            summary = self.memory.sort_summary
            if summary:
                return (
                    "Your files are already organized! Here's the current state:\n"
                    + self._format_sort_summary()
                    + (f"\n  • {self.memory.sort_skipped} unsorted files remaining" if self.memory.sort_skipped else "")
                    + "\n\nWant me to find specific files, check disk space, or something else?"
                )

        result = self.executor.execute(parsed)
        self._update_memory(text, parsed, result)

        if not result.success:
            return f"Hmm, that didn't work: {result.message}\nWant to try something else?"

        # Generate contextual follow-up
        followup = self._generate_followup(parsed, result)
        response = result.message
        if followup:
            self.memory.state = ConvoState.AWAITING_YESNO
            self.memory.pending_question = followup["question_type"]
            self.memory.pending_action = parsed
            response += f"\n\n{followup['text']}"

        return response

    def _smart_execute_with_context(self, text: str, parsed: ParsedCommand) -> str:
        """Medium confidence – try to use context to improve understanding."""
        lower = text.lower()

        # "clean" / "organize" when already done
        if ("clean" in lower or "organize" in lower) and self.memory.downloads_organized:
            summary = self.memory.sort_summary
            if summary:
                return (
                    "I already organized those files! Here's the current state:\n"
                    + self._format_sort_summary()
                    + "\n\nWhat else can I help with? I can:\n"
                    "  • Find specific files (screenshots, PDFs, etc.)\n"
                    "  • Check how much space you have\n"
                    "  • Show you the unsorted files\n"
                    "What sounds good?"
                )

        # "attention" / "what should I do" – proactive system check
        if any(w in lower for w in ["attention", "should i", "need to", "important", "check on"]):
            return self._run_attention_check()

        # Just execute if we have some confidence
        if parsed.confidence > 0:
            return self._execute_and_respond(text, parsed)

        return self._ask_clarification(text, parsed)

    def _run_attention_check(self) -> str:
        """Proactive system scan – what needs the user's attention."""
        findings = []

        # Check disk space
        try:
            disk_result = self.executor.system_info.get_disk_space()
            if disk_result.success and disk_result.data:
                d = disk_result.data
                percent = d.get('percent', 0)
                free = d.get('free_gb', 0)
                total = d.get('total_gb', 0)
                status = "healthy" if percent < 80 else "getting full!" if percent < 95 else "critically full!"
                findings.append(f"💾 Disk: {free:.0f}GB free of {total:.0f}GB ({percent}% used) — {status}")
        except Exception:
            pass

        # Check downloads state
        if self.memory.downloads_organized:
            findings.append("📁 Downloads: organized ✓")
            if self.memory.sort_skipped > 0:
                findings.append(f"   └ {self.memory.sort_skipped} unsorted files need attention")
        else:
            try:
                from pathlib import Path
                dl = Path.home() / "Downloads"
                file_count = sum(1 for f in dl.iterdir() if f.is_file() and not f.name.startswith('.'))
                if file_count > 20:
                    findings.append(f"📁 Downloads: {file_count} loose files – want me to organize?")
                else:
                    findings.append(f"📁 Downloads: {file_count} files, looks clean")
            except Exception:
                pass

        if not findings:
            return "Everything looks good! Your system seems healthy. Want me to check anything specific?"

        self.memory.state = ConvoState.AWAITING_YESNO
        self.memory.pending_question = "do_more"
        return "Here's what I found:\n\n" + "\n".join(findings) + "\n\nWant me to help with any of these?"

    # ── clarification ────────────────────────────────────────────
    def _ask_clarification(self, text: str, parsed: ParsedCommand) -> str:
        """Ask a smart question instead of showing generic help."""
        lower = text.lower()
        self.memory.state = ConvoState.AWAITING_CLARIFY
        self.memory.last_raw_input = text

        # Try to guess what they might mean
        guesses = []
        if any(w in lower for w in ["file", "folder", "download", "document"]):
            guesses.append("organize or find files")
        if any(w in lower for w in ["app", "open", "launch"]):
            guesses.append("open an application")
        if any(w in lower for w in ["space", "disk", "storage", "clean"]):
            guesses.append("free up disk space")

        if guesses:
            options = " or ".join(guesses)
            self.memory.pending_question = "clarify_intent"
            return f"I want to make sure I help you right. Did you mean to {options}? Or something else?"

        self.memory.pending_question = "open_clarify"
        return (
            "I want to help but I'm not quite sure what you need. "
            "Could you tell me more? For example:\n"
            "  • What files or folders are involved?\n"
            "  • What should happen to them?\n"
            "I'll figure it out from there."
        )

    # ── question handling ────────────────────────────────────────
    def _handle_question(self, text: str) -> str:
        """Handle questions – answer them, don't execute commands."""
        lower = text.lower()

        # ── Instant self-awareness responses (no LLM needed) ──────
        self_response = self._check_self_awareness(lower)
        if self_response:
            return self_response

        # ── Quick answers: math, capitals, dates, facts (no LLM) ──
        instant = quick_answer(text)
        if instant:
            return instant

        # "what is playing" / "what's playing" – music status (treat as command)
        if "playing" in lower and any(w in lower for w in ["what", "which song", "current"]):
            parsed = self.parser.parse(text)
            if parsed.intent == Intent.UNKNOWN:
                from assistant_cli.models import ParsedCommand
                parsed = ParsedCommand(intent=Intent.OPEN_APP, params={}, confidence=0.9, raw_input=text)
            return self._execute_and_respond(text, parsed)

        # "what are the files" / "what are the 84 files" – list from memory
        if any(p in lower for p in ["what are the file", "what are the 84", "what files", "list the file", "show the file", "show me the file"]):
            return self._list_remembered_files()

        # "what needs my attention" / proactive check
        if any(p in lower for p in ["attention", "needs", "should i", "check on", "what's going on"]):
            return self._run_attention_check()

        # "understand my pc" / "help me with my pc" / "what about my pc" – system check
        if any(p in lower for p in ["my pc", "my computer", "my system", "my machine", "my mac", "my laptop"]):
            return self._run_attention_check()

        # Questions about what just happened
        if self.memory.last_action and any(
            p in lower for p in ["what did you", "what happened", "what was that"]
        ):
            return self._explain_last_action()

        # "how should we organize them?"
        if any(w in lower for w in ["how should", "how do", "how can", "how to"]):
            if "organize" in lower or "sort" in lower or "clean" in lower:
                if self.memory.sort_summary:
                    return (
                        "I already sorted your files by type! Here's the current state:\n"
                        + self._format_sort_summary()
                        + "\n\nWant me to organize them differently — maybe by date, or into custom folders?"
                    )
                return (
                    "I can organize files a few ways:\n"
                    "  • **By type** — images, documents, videos, etc. into separate folders\n"
                    "  • **By date** — group files by when they were created\n"
                    "  • **Custom** — tell me your folder names and I'll sort them\n\n"
                    "Which approach works for you?"
                )

        # "what can you do" / "what else can you do" / capabilities
        if any(p in lower for p in ["what can you", "what else can you", "what do you", "what are your", "what else do you"]):
            return self._describe_capabilities()

        # "where are my videos" – this is actually a search, but check context first
        if lower.startswith("where"):
            ctx = self._check_context_reference(text)
            if ctx:
                return ctx
            parsed = self.parser.parse(text)
            if parsed.intent != Intent.UNKNOWN:
                return self._execute_and_respond(text, parsed)

        # General question – give a helpful answer based on context
        if self.memory.last_action:
            ctx_response = self._contextual_question_response(text)
            if ctx_response:
                return ctx_response

        # Fall through to LLM for general knowledge Q&A
        llm_answer = self._ask_llm(text)
        if llm_answer:
            return llm_answer

        return (
            "I'm not sure how to answer that one. Here's what I can help with:\n"
            "  • **Ask me anything** — facts, math, definitions, explanations\n"
            "  • **Manage files** — organize, find, move, delete\n"
            "  • **Control apps** — open, close, play music\n"
            "  • **Check your system** — disk, CPU, memory\n\n"
            "Try rephrasing, or ask me something else!"
        )

    # ── yes/no handling ──────────────────────────────────────────
    def _handle_yesno(self, text: str, input_type: InputType) -> str:
        question = self.memory.pending_question

        if input_type == InputType.RESPONSE_YES:
            if question == "execute_plan":
                result = self._execute_plan()
                self.memory.clear_pending()
                return result
            self.memory.clear_pending()
            if question == "move_files":
                self.memory.state = ConvoState.AWAITING_PARAM
                self.memory.pending_param_name = "destination"
                return "Where should I move them? (e.g., Desktop, Documents, a folder name)"
            if question == "do_more":
                return "What would you like to do next?"
            return "Got it! What should I do?"

        if input_type == InputType.RESPONSE_NO:
            self.memory.clear_pending()
            return "No problem. What would you like to do instead?"

        # They said something else while we were waiting for yes/no
        # Treat it as a new command and reset state
        self.memory.clear_pending()
        new_type = classify_input(text, ConvoState.IDLE)
        return self._route(text, new_type)

    # ── choice handling ──────────────────────────────────────────
    def _handle_choice(self, text: str, input_type: InputType) -> str:
        self.memory.clear_pending()
        # Re-parse with added context
        new_type = classify_input(text, ConvoState.IDLE)
        return self._route(text, new_type)

    # ── param handling ───────────────────────────────────────────
    def _handle_param(self, text: str, input_type: InputType) -> str:
        param_name = self.memory.pending_param_name
        action = self.memory.pending_action
        self.memory.clear_pending()

        if action and param_name:
            action.params[param_name] = text.strip()
            return self._execute_and_respond(text, action)

        return self._route(text, classify_input(text, ConvoState.IDLE))

    # ── clarify handling ─────────────────────────────────────────
    def _handle_clarify(self, text: str, input_type: InputType) -> str:
        self.memory.clear_pending()
        # Re-interpret with fresh eyes
        new_type = classify_input(text, ConvoState.IDLE)
        return self._route(text, new_type)

    # ── social handling ──────────────────────────────────────────
    def _handle_social(self, text: str) -> str:
        clean = text.lower().strip().rstrip("?!. ")
        if clean in SOCIAL_GREETINGS:
            return "Hey! What can I help you with?"
        if clean in SOCIAL_THANKS:
            return "You're welcome! Need anything else?"
        if clean in SOCIAL_BYE:
            return "See you later! 👋"
        return "Hey! What would you like to do?"

    # ── confusion handling ───────────────────────────────────────
    def _handle_confusion(self, text: str) -> str:
        if self.memory.last_action:
            return self._explain_last_action()
        return (
            "Let me explain what I can do:\n"
            "  • Organize your files (sort downloads, find screenshots, etc.)\n"
            "  • Open or close apps\n"
            "  • Check your system (disk space, CPU, memory)\n"
            "  • Multi-step tasks (clean up, prepare USB, etc.)\n\n"
            "Just tell me what you need in plain English."
        )

    # ── self-awareness (instant, no LLM) ─────────────────────────
    def _check_self_awareness(self, lower: str) -> Optional[str]:
        """Instant answers to questions about the assistant itself."""
        llm_status = "online" if self.llm.available else "offline"
        model_name = self.llm.model if self.llm.available else "none"

        # "are you online / offline / connected"
        if any(p in lower for p in [
            "are you online", "are you offline", "are you connected",
            "you online", "you offline", "you connected",
            "are you running", "are you working", "are you alive",
            "are you there", "you there",
        ]):
            if self.llm.available:
                return (
                    f"I'm running locally on your Mac with the **{model_name}** model — "
                    f"fully offline, no internet needed. All your data stays private. "
                    f"What can I help you with?"
                )
            return (
                "I'm running locally on your Mac in offline mode (pattern matching only). "
                "The LLM model isn't loaded right now, but I can still manage files, "
                "open apps, control music, and check your system. What do you need?"
            )

        # "who are you / what are you"
        if any(p in lower for p in [
            "who are you", "what are you", "what is your name",
            "what's your name", "introduce yourself", "tell me about yourself",
        ]):
            return (
                "I'm **Ubongo** — your local AI assistant running on this Mac. "
                f"I use the **{model_name}** model (100% offline, private). "
                "I can manage files, open apps, play music, check your system, "
                "answer questions, do math, and more. Just ask!"
            )

        # "can you do X" type capability checks
        if any(p in lower for p in [
            "can you think", "can you reason", "are you smart",
            "are you ai", "are you an ai", "are you a bot",
            "are you real", "do you have a brain",
        ]):
            return (
                f"Yes! I'm powered by a local AI model (**{model_name}**) running right on your Mac. "
                "I can reason, answer questions, solve math, explain concepts, and control your computer — "
                "all without internet. Try asking me anything!"
            )

        # "how do you work" / "what model"
        if any(p in lower for p in [
            "how do you work", "what model", "what llm", "what language model",
            "how are you built", "what powers you",
        ]):
            return (
                f"I run on **Ollama** with the **{model_name}** model, locally on your Mac. "
                "No cloud, no API keys, no internet needed. "
                "I combine pattern matching for commands (fast) with the LLM for "
                "questions and reasoning (smart). Everything stays on your machine."
            )

        return None

    # ── LLM general Q&A ─────────────────────────────────────────
    def _ask_llm(self, text: str) -> Optional[str]:
        """Route general knowledge questions to the local LLM with timeout."""
        if not self.llm.available:
            return None

        # Build conversation context from recent history (exclude last entry
        # which is the current user message — it's already passed as 'message')
        context = []
        for entry in self.history[-7:-1]:
            role = "user" if entry["role"] == "user" else "assistant"
            context.append({"role": role, "content": entry["text"]})

        system_prompt = (
            "You are a helpful assistant. Be VERY brief — 1-2 sentences max. "
            "For math, just show the answer. For facts, give a single clear sentence. "
            "Never ramble. No markdown. No lists unless asked."
        )

        import threading

        result_holder = [None]

        def _llm_call():
            try:
                result_holder[0] = self.llm.chat(
                    message=text,
                    system_prompt=system_prompt,
                    context=context,
                )
            except Exception as e:
                logger.warning("LLM Q&A failed: %s", e)

        thread = threading.Thread(target=_llm_call, daemon=True)
        thread.start()
        thread.join(timeout=20)  # Hard 20-second timeout

        if thread.is_alive():
            logger.warning("LLM timed out for: %s", text[:80])
            return (
                "I'm still thinking about that one, but it's taking too long. "
                "Could you try rephrasing, or ask me something else? "
                "I can manage files, open apps, play music, or check your system instantly."
            )

        answer = result_holder[0]
        if answer:
            return answer.strip()

        return None

    # ── plan execution ───────────────────────────────────────────
    def _execute_plan(self) -> str:
        plan = self.memory.pending_options
        if not plan:
            return "Hmm, I lost the plan. Could you tell me what you'd like to do again?"

        results = []
        for i, step in enumerate(plan, 1):
            result = self.executor.execute(step)
            status = "✓" if result.success else "✗"
            results.append(f"  {status} Step {i}: {result.message}")
            self._update_memory(step.raw_input or "", step, result)

        self.memory.pending_options = []
        summary = "\n".join(results)

        return f"Done! Here's what happened:\n{summary}\n\nAnything else?"

    # ── memory management ────────────────────────────────────────
    def _update_memory(self, text: str, parsed: ParsedCommand, result: ExecutionResult):
        self.memory.last_action = parsed.intent.value
        self.memory.last_intent = parsed.intent
        self.memory.last_result = result
        self.memory.last_raw_input = text

        if result.data:
            if "path" in result.data:
                self.memory.affected_files.append(result.data["path"])
            if "files" in result.data:
                self.memory.affected_files = result.data["files"][:50]
            if "count" in result.data:
                self.memory.last_search_count = result.data["count"]
            # Rich sort data
            if "moved" in result.data:
                self.memory.sort_moved = result.data["moved"]
            if "existing" in result.data:
                self.memory.sort_existing = result.data["existing"]
            if "skipped" in result.data:
                self.memory.sort_skipped = result.data["skipped"]
            if "skipped_files" in result.data:
                self.memory.sort_skipped_files = result.data["skipped_files"]
            if "base_path" in result.data:
                self.memory.sort_base_path = result.data["base_path"]
            if result.data.get("already_organized"):
                self.memory.downloads_organized = True
            if "total_moved" in result.data and result.data["total_moved"] > 0:
                self.memory.downloads_organized = True

    # ── follow-up generation ─────────────────────────────────────
    def _generate_followup(self, parsed: ParsedCommand, result: ExecutionResult) -> Optional[Dict[str, str]]:
        if parsed.intent == Intent.SORT_FILES:
            if result.data:
                total_moved = result.data.get("total_moved", 0)
                skipped = result.data.get("skipped", 0)
                already = result.data.get("already_organized", False)

                if already:
                    if skipped > 0:
                        return {
                            "question_type": "do_more",
                            "text": f"{skipped} files couldn't be categorized. Want me to show you what they are?",
                        }
                    return None  # already organized, no follow-up needed

                if total_moved > 0:
                    msg = "Want me to do anything else with these files?"
                    if skipped > 0:
                        msg = f"{skipped} files couldn't be categorized. Want me to show you what they are?"
                    return {
                        "question_type": "do_more",
                        "text": msg,
                    }

        if parsed.intent == Intent.CREATE_FOLDER:
            return {
                "question_type": "move_files",
                "text": "Want to move any files into it?",
            }

        if parsed.intent == Intent.SEARCH_FILES:
            count = result.data.get("count", 0) if result.data else 0
            if count > 0:
                return {
                    "question_type": "do_more",
                    "text": f"Found {count} files. Want me to organize them or do something with them?",
                }

        if parsed.intent == Intent.CREATE_PRESENTATION:
            return {
                "question_type": "do_more",
                "text": "Want me to add more slides or change the content?",
            }

        if parsed.intent == Intent.CREATE_DOCUMENT:
            return {
                "question_type": "do_more",
                "text": "Want me to add more content or format it differently?",
            }

        if parsed.intent == Intent.BROWSE_WEB:
            return {
                "question_type": "do_more",
                "text": "Want me to interact with the page — click something, type, or navigate?",
            }

        return None

    # ── helpers ───────────────────────────────────────────────────
    def _explain_last_action(self) -> str:
        if not self.memory.last_intent:
            return "I haven't done anything yet. What would you like me to do?"

        explanations = {
            Intent.SORT_FILES: "I sorted your files into category folders (Images, Documents, Videos, etc.) based on file type.",
            Intent.CREATE_FOLDER: "I created a new folder for you.",
            Intent.SEARCH_FILES: "I searched for files matching your criteria.",
            Intent.MOVE_ITEM: "I moved files to a new location.",
            Intent.DELETE_ITEM: "I deleted the files you asked about.",
            Intent.OPEN_APP: "I opened an application for you.",
            Intent.SORT_FILES: "I organized your files by type into separate folders.",
        }

        explanation = explanations.get(
            self.memory.last_intent,
            f"I performed: {self.memory.last_action}"
        )

        if self.memory.sort_summary:
            explanation += "\n" + self._format_sort_summary()

        return explanation + "\n\nWhat would you like to do next?"

    def _format_sort_summary(self) -> str:
        if not self.memory.sort_summary:
            return ""
        lines = []
        for cat, count in sorted(self.memory.sort_summary.items()):
            lines.append(f"  • {cat}: {count} files")
        return "\n".join(lines)

    def _list_remembered_files(self) -> str:
        """List files from the most recent search/scan result."""
        files = self.memory.affected_files
        if not files:
            # Check sort skipped files
            if self.memory.sort_skipped_files:
                lines = [f"Here are the {len(self.memory.sort_skipped_files)} unsorted files:"]
                for f in self.memory.sort_skipped_files[:25]:
                    lines.append(f"  • {f}")
                if len(self.memory.sort_skipped_files) > 25:
                    lines.append(f"  ... and {len(self.memory.sort_skipped_files) - 25} more")
                lines.append("\nWant me to do something with these?")
                return "\n".join(lines)
            return "I don't have any files in memory right now. Want me to scan a folder?"

        from pathlib import Path
        # Show a readable summary
        total = self.memory.last_search_count or len(files)
        sample = files[:30]

        # Group by extension for a useful overview
        ext_counts: Dict[str, int] = {}
        for f in files:
            ext = Path(f).suffix.lower() or "(no extension)"
            ext_counts[ext] = ext_counts.get(ext, 0) + 1

        lines = [f"Here are the {total} files I found:"]

        # Show extension breakdown
        if len(ext_counts) > 1:
            lines.append("\nBy type:")
            for ext, count in sorted(ext_counts.items(), key=lambda x: -x[1])[:10]:
                lines.append(f"  • {ext}: {count} files")

        # Show sample file names
        lines.append(f"\nSample files:")
        for f in sample[:15]:
            name = Path(f).name
            lines.append(f"  • {name}")
        if total > 15:
            lines.append(f"  ... and {total - 15} more")

        lines.append("\nWant me to organize, move, or delete any of these?")
        return "\n".join(lines)

    def _contextual_question_response(self, text: str) -> Optional[str]:
        """Answer a question about recent actions. Returns None if unrelated."""
        lower = text.lower()
        last = self.memory.last_intent

        # Only give contextual answers if the question seems related to the last action
        context_words = (
            "file", "folder", "result", "them", "those", "it", "that",
            "what did", "what happened", "what was", "how many", "show me",
            "next step", "what now", "anything else",
        )
        is_about_context = any(w in lower for w in context_words)
        if not is_about_context:
            return None

        # Questions about files after a search
        if last == Intent.SEARCH_FILES and self.memory.affected_files:
            count = len(self.memory.affected_files)
            return (
                f"I found {count} files in the last scan. "
                f"Want me to list them, organize them, or do something specific?"
            )

        # Questions about what was created
        if last == Intent.CREATE_FOLDER:
            return (
                f"I created a folder for you. "
                f"Want me to move files into it, or do something else?"
            )

        # Questions after sorting
        if last == Intent.SORT_FILES:
            if self.memory.sort_skipped > 0:
                return (
                    f"I sorted your files by type. {self.memory.sort_skipped} files "
                    f"couldn't be categorized. Want me to show you what they are?"
                )
            return "I sorted your files into category folders. What else can I help with?"

        return None

    def _describe_capabilities(self) -> str:
        return (
            "Here's what I can do:\n\n"
            "📁 **File Management**\n"
            "  • Organize downloads/desktop by type\n"
            "  • Create, move, and delete files and folders\n"
            "  • Find files by type or date\n\n"
            "🎨 **Create Content**\n"
            "  • Create Keynote presentations with slides\n"
            "  • Create Pages documents\n"
            "  • Open Canva, Google Docs, Figma in browser\n\n"
            "🌐 **Browser & Web**\n"
            "  • Open any website\n"
            "  • Google search from here\n"
            "  • Control web apps (Canva, Google Docs, etc.)\n\n"
            "�️ **Screen Control**\n"
            "  • Click, type, and scroll like a human\n"
            "  • Take screenshots\n"
            "  • Automate any app on your Mac\n\n"
            "🚀 **Apps & System**\n"
            "  • Open/close any application\n"
            "  • Check disk, CPU, memory\n"
            "  • System health check\n\n"
            "Just tell me what you need — I'll figure out the rest."
        )
