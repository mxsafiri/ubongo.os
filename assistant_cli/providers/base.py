"""
Base interface for all AI providers.
Every provider (Anthropic, Groq, Ollama) implements this contract.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any


@dataclass
class ToolCall:
    """Represents a tool call requested by the AI model."""
    id: str
    name: str
    input: Dict[str, Any]


@dataclass
class AIResponse:
    """Unified response object returned by every provider."""
    content: str                          # Text response
    tool_calls: List[ToolCall] = field(default_factory=list)
    stop_reason: str = "end_turn"         # end_turn | tool_use | max_tokens
    model_used: str = ""                  # e.g. "claude-haiku-3.5"
    provider_name: str = ""               # e.g. "anthropic"
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def has_tool_calls(self) -> bool:
        return len(self.tool_calls) > 0


class AIProvider(ABC):
    """
    Abstract base class for all AI providers.

    Providers:
      - AnthropicProvider  → Claude Haiku + Sonnet (cloud, BYOK)
      - GroqProvider       → Llama / Mixtral free tier (cloud, free)
      - OllamaProvider     → Local models (offline, private)
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable provider name, e.g. 'anthropic'."""
        ...

    @abstractmethod
    def is_available(self) -> bool:
        """Return True if this provider can currently be used."""
        ...

    @abstractmethod
    def chat(
        self,
        message: str,
        system_prompt: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> AIResponse:
        """
        Send a single message and return a text response.
        Used for simple Q&A, conversation, intent parsing.
        """
        ...

    @abstractmethod
    def chat_with_tools(
        self,
        message: str,
        tools: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> AIResponse:
        """
        Send a message with tool definitions.
        Model may respond with text OR request tool calls.
        Used for agentic, multi-step task execution.
        """
        ...

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(available={self.is_available()})"
