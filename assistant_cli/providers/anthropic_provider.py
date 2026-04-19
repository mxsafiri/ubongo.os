"""
Anthropic Claude provider.

- Claude Haiku 3.5  → fast, cheap, default for most tasks  (~$0.001/query)
- Claude Sonnet 3.7 → smart, powerful, routed for complex tasks (~$0.0075/query)

Supports tool_use for full agentic capability.
Prompt caching on system prompt reduces repeat costs by ~90%.
"""
from typing import Optional, List, Dict, Any
from assistant_cli.utils import logger
from .base import AIProvider, AIResponse, ToolCall

# Models
HAIKU  = "claude-3-haiku-20240307"
SONNET = "claude-sonnet-4-20250514"

# System prompt cached across requests to cut token costs
_UBONGO_SYSTEM = (
    "You are ubongo, a personal AI OS layer running on the user's computer. "
    "You help users control their computer, manage files, automate tasks, and get things done. "
    "Be concise, friendly, and action-oriented. "
    "When given tools, prefer using them over explaining. "
    "Always confirm destructive actions before executing."
)


class AnthropicProvider(AIProvider):
    """
    Claude-powered provider via Anthropic API.
    Requires ANTHROPIC_API_KEY in config or environment.
    """

    def __init__(
        self,
        api_key: str,
        use_sonnet_for_complex: bool = True,
        base_url: Optional[str] = None,
    ):
        """
        Args:
            api_key: Either a real Anthropic API key (sk-ant-...) for BYO
                     flows, OR an ubongo beta invite code when routing
                     through the hosted proxy (see `base_url`).
            base_url: Override the Anthropic API endpoint — set to the
                     ubongo proxy URL for beta users. When set, the proxy
                     validates the invite code and forwards to real Anthropic.
        """
        self._api_key = api_key
        self._base_url = base_url
        self._client = None
        self.use_sonnet_for_complex = use_sonnet_for_complex
        self._available: Optional[bool] = None

    @property
    def name(self) -> str:
        return "anthropic"

    @property
    def client(self):
        """Lazy-load the Anthropic client (optionally pointed at a proxy)."""
        if self._client is None:
            try:
                import anthropic
                kwargs = {"api_key": self._api_key}
                if self._base_url:
                    kwargs["base_url"] = self._base_url
                self._client = anthropic.Anthropic(**kwargs)
            except ImportError:
                logger.error("anthropic package not installed. Run: pip install anthropic")
                raise
        return self._client

    def is_available(self) -> bool:
        if self._available is not None:
            return self._available
        try:
            import anthropic  # noqa: F401
            self._available = bool(self._api_key)
        except ImportError:
            self._available = False
        return self._available

    def _select_model(self, message: str, use_tools: bool = False) -> str:
        """
        Auto-route between Haiku and Sonnet based on task complexity.

        Sonnet triggers when:
          - Tool use is involved (agentic tasks)
          - Message contains complexity signals
        """
        if not self.use_sonnet_for_complex:
            return HAIKU

        complexity_signals = [
            "organise", "organize", "restructure", "analyse", "analyze",
            "compare", "summarise", "summarize", "write", "generate",
            "plan", "create a report", "build", "automate", "workflow",
            "all files", "every", "entire", "research",
        ]

        if use_tools:
            return SONNET

        msg_lower = message.lower()
        if any(signal in msg_lower for signal in complexity_signals):
            return SONNET

        return HAIKU

    def chat(
        self,
        message: str,
        system_prompt: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> AIResponse:
        """Simple text chat — no tools."""
        try:
            model = self._select_model(message)
            messages = self._build_messages(message, history)
            system  = system_prompt or _UBONGO_SYSTEM

            response = self.client.messages.create(
                model=model,
                max_tokens=1024,
                system=system,
                messages=messages,
            )

            text = "".join(
                block.text for block in response.content
                if hasattr(block, "text")
            )

            return AIResponse(
                content=text,
                stop_reason=response.stop_reason or "end_turn",
                model_used=model,
                provider_name=self.name,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

        except Exception as e:
            logger.error("Anthropic chat error: %s", e)
            return AIResponse(content="", provider_name=self.name, stop_reason="error")

    def chat_with_tools(
        self,
        message: str,
        tools: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> AIResponse:
        """
        Agentic chat — Claude can respond with text OR request tool calls.
        The caller is responsible for executing tools and looping back.
        """
        try:
            model = self._select_model(message, use_tools=True)
            messages = self._build_messages(message, history)
            system  = system_prompt or _UBONGO_SYSTEM

            response = self.client.messages.create(
                model=model,
                max_tokens=4096,
                system=system,
                tools=tools,
                messages=messages,
            )

            # Separate text blocks from tool_use blocks
            text_parts: List[str] = []
            tool_calls: List[ToolCall] = []

            for block in response.content:
                if block.type == "text":
                    text_parts.append(block.text)
                elif block.type == "tool_use":
                    tool_calls.append(ToolCall(
                        id=block.id,
                        name=block.name,
                        input=block.input,
                    ))

            return AIResponse(
                content=" ".join(text_parts),
                tool_calls=tool_calls,
                stop_reason=response.stop_reason or "end_turn",
                model_used=model,
                provider_name=self.name,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

        except Exception as e:
            logger.error("Anthropic tool chat error: %s", e)
            return AIResponse(content="", provider_name=self.name, stop_reason="error")

    def send_tool_results(
        self,
        original_message: str,
        tool_calls: List[ToolCall],
        tool_results: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        history: Optional[List[Dict[str, str]]] = None,
        system_prompt: Optional[str] = None,
    ) -> AIResponse:
        """
        Send tool execution results back to Claude so it can continue reasoning.
        Called after the executor runs the tools Claude requested.
        """
        try:
            model   = self._select_model(original_message, use_tools=True)
            system  = system_prompt or _UBONGO_SYSTEM
            messages = self._build_messages(original_message, history)

            # Add Claude's tool_use response
            messages.append({
                "role": "assistant",
                "content": [
                    {"type": "tool_use", "id": tc.id, "name": tc.name, "input": tc.input}
                    for tc in tool_calls
                ],
            })

            # Add tool results
            messages.append({
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": result["tool_use_id"],
                        "content": result["content"],
                    }
                    for result in tool_results
                ],
            })

            response = self.client.messages.create(
                model=model,
                max_tokens=2048,
                system=system,
                tools=tools,
                messages=messages,
            )

            text = "".join(
                block.text for block in response.content
                if hasattr(block, "text")
            )

            return AIResponse(
                content=text,
                stop_reason=response.stop_reason or "end_turn",
                model_used=model,
                provider_name=self.name,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

        except Exception as e:
            logger.error("Anthropic tool result error: %s", e)
            return AIResponse(content="", provider_name=self.name, stop_reason="error")

    def describe_image(
        self,
        image_base64: str,
        prompt: str = "Describe what's on this screen concisely and helpfully.",
        media_type: str = "image/png",
    ) -> AIResponse:
        """Vision call — send an image + prompt, get a description.

        Used by describe_screen to answer "what's on my screen?" type
        questions. Always routes to Sonnet because vision + reasoning
        benefits from the larger model.
        """
        try:
            response = self.client.messages.create(
                model=SONNET,
                max_tokens=1024,
                system=(
                    "You are ubongo's vision module. Look at the screenshot and "
                    "answer the user's question about it. Be concise (2-5 sentences). "
                    "If there's an error message, read it back verbatim. "
                    "If asked to read text, transcribe it faithfully."
                ),
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_base64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }],
            )

            text = "".join(
                block.text for block in response.content
                if hasattr(block, "text")
            )

            return AIResponse(
                content=text,
                stop_reason=response.stop_reason or "end_turn",
                model_used=SONNET,
                provider_name=self.name,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

        except Exception as e:
            logger.error("Anthropic vision error: %s", e)
            return AIResponse(
                content=f"Vision request failed: {e}",
                provider_name=self.name,
                stop_reason="error",
            )

    @staticmethod
    def _build_messages(
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> List[Dict[str, str]]:
        messages = list(history or [])
        messages.append({"role": "user", "content": message})
        return messages
