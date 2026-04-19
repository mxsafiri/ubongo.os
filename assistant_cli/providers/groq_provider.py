"""
Groq provider — free tier cloud inference.

Free limits (no credit card required):
  - 6,000 requests/day
  - 30 requests/minute
  - Models: llama-3.3-70b-versatile, mixtral-8x7b-32768

Used as Tier 2: better than local Ollama, zero cost,
requires internet but no payment.
"""
from typing import Optional, List, Dict, Any
from assistant_cli.utils import logger
from .base import AIProvider, AIResponse, ToolCall

GROQ_DEFAULT_MODEL  = "llama-3.3-70b-versatile"
GROQ_FAST_MODEL     = "llama-3.1-8b-instant"      # Faster, less capable
GROQ_FALLBACK_MODEL = "mixtral-8x7b-32768"


class GroqProvider(AIProvider):
    """
    Groq cloud inference — free tier, fast, no payment needed.
    Uses OpenAI-compatible API so tool_use works via function calling.
    """

    def __init__(self, api_key: str):
        self._api_key = api_key
        self._client = None
        self._available: Optional[bool] = None

    @property
    def name(self) -> str:
        return "groq"

    @property
    def client(self):
        if self._client is None:
            try:
                from groq import Groq
                self._client = Groq(api_key=self._api_key)
            except ImportError:
                logger.error("groq package not installed. Run: pip install groq")
                raise
        return self._client

    def is_available(self) -> bool:
        if self._available is not None:
            return self._available
        try:
            from groq import Groq  # noqa: F401
            self._available = bool(self._api_key)
        except ImportError:
            self._available = False
        return self._available

    def chat(
        self,
        message: str,
        system_prompt: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> AIResponse:
        try:
            messages = self._build_messages(message, system_prompt, history)

            response = self.client.chat.completions.create(
                model=GROQ_DEFAULT_MODEL,
                messages=messages,
                max_tokens=1024,
                temperature=0.7,
            )

            text = response.choices[0].message.content or ""

            return AIResponse(
                content=text,
                model_used=GROQ_DEFAULT_MODEL,
                provider_name=self.name,
                input_tokens=response.usage.prompt_tokens if response.usage else 0,
                output_tokens=response.usage.completion_tokens if response.usage else 0,
            )

        except Exception as e:
            logger.error("Groq chat error: %s", e)
            return AIResponse(content="", provider_name=self.name, stop_reason="error")

    def chat_with_tools(
        self,
        message: str,
        tools: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> AIResponse:
        """
        Groq supports function calling via OpenAI-compatible format.
        Converts ubongo tool schemas to OpenAI function format.
        """
        try:
            messages = self._build_messages(message, system_prompt, history)
            openai_tools = self._convert_tools_to_openai_format(tools)

            response = self.client.chat.completions.create(
                model=GROQ_DEFAULT_MODEL,
                messages=messages,
                tools=openai_tools,
                tool_choice="auto",
                max_tokens=2048,
            )

            choice = response.choices[0]
            text = choice.message.content or ""
            tool_calls: List[ToolCall] = []

            if choice.message.tool_calls:
                import json
                for tc in choice.message.tool_calls:
                    try:
                        args = json.loads(tc.function.arguments)
                    except Exception:
                        args = {}
                    tool_calls.append(ToolCall(
                        id=tc.id,
                        name=tc.function.name,
                        input=args,
                    ))

            stop = "tool_use" if tool_calls else "end_turn"

            return AIResponse(
                content=text,
                tool_calls=tool_calls,
                stop_reason=stop,
                model_used=GROQ_DEFAULT_MODEL,
                provider_name=self.name,
                input_tokens=response.usage.prompt_tokens if response.usage else 0,
                output_tokens=response.usage.completion_tokens if response.usage else 0,
            )

        except Exception as e:
            logger.error("Groq tool chat error: %s", e)
            return AIResponse(content="", provider_name=self.name, stop_reason="error")

    @staticmethod
    def _convert_tools_to_openai_format(tools: List[Dict[str, Any]]) -> List[Dict]:
        """Convert Anthropic-style tool schemas to OpenAI function calling format."""
        return [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
                },
            }
            for t in tools
        ]

    @staticmethod
    def _build_messages(
        message: str,
        system_prompt: Optional[str],
        history: Optional[List[Dict[str, str]]],
    ) -> List[Dict[str, str]]:
        messages: List[Dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": message})
        return messages
