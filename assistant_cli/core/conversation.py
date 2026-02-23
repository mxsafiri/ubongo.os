import re
from typing import Dict, Optional
from assistant_cli.core.knowledge_base import CapabilityCatalog
from assistant_cli.core.llm_client import LLMClient

class ConversationalResponder:
    def __init__(self) -> None:
        self.capabilities = CapabilityCatalog()
        self.llm_client = LLMClient()
        self.acknowledgments = ["Got it.", "Sure.", "Makes sense."]
        self.faq_map: Dict[str, str] = {
            "what else can you do": self.capabilities.render_overview(),
            "what can you do": self.capabilities.render_overview(),
            "what are your capabilities": self.capabilities.render_overview(),
            "how can you help": self.capabilities.render_overview(),
            "show me what you can do": self.capabilities.render_overview(),
            "help me": self.capabilities.render_overview(),
            "can you help me": self.capabilities.render_overview(),
        }

    def should_handle(self, user_input: str) -> bool:
        normalized = user_input.lower().strip()
        if normalized in self.faq_map:
            return True
        question_starters = ("what", "how", "why", "who", "where", "when", "can you", "could you")
        if normalized.startswith(question_starters):
            return True
        if "?" in normalized:
            return True
        if re.search(r"\b(explain|teach|guide|suggest|ideas)\b", normalized):
            return True
        return False

    def respond(self, user_input: str) -> str:
        normalized = user_input.lower().strip()
        if normalized in self.faq_map:
            return self.faq_map[normalized]

        if "llama" in normalized or "ollama" in normalized:
            if self.llm_client.available:
                return "Sure. I'm connected to the local Ollama model and ready to chat or execute tasks."
            return (
                "Got it. I'm not connected to Ollama right now. "
                "Run `python -m assistant_cli setup` to download a model, then start Ollama with `ollama serve`."
            )

        if normalized in {"tell me more", "can we talk", "let's talk", "chat with you"}:
            return (
                "Sure. I can explain features, suggest workflows, or execute tasks for you. "
                "What do you want to do right now?"
            )

        if self.llm_client.available:
            system_prompt = (
                "You are an offline AI assistant running locally. "
                "Be concise, helpful, and action-oriented. "
                "If the user asks about capabilities, list 3-5 examples. "
                "If they ask for guidance, propose 1-2 next steps and ask a follow-up question. "
                "Start with a brief acknowledgment like 'Got it.' or 'Sure.'"
            )
            response = self.llm_client.chat(user_input, system_prompt=system_prompt)
            if response:
                return response

        return (
            "Got it. I can help manage files, open apps, check system info, and run offline workflows. "
            "Want me to organize downloads or prepare a USB transfer?"
        )
