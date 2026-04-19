"""
Ollama provider — fully local, offline-first inference.

This is the offline backbone of ubongo.
Zero cost, zero internet, zero data leaves the machine.
Used as Tier 1 (fallback) when no cloud provider is configured.
Refactored from the original llm_client.py.
"""
from typing import Optional, List, Dict, Any
from assistant_cli.utils import logger
from .base import AIProvider, AIResponse, ToolCall

_SYSTEM_DEFAULT = (
    "You are ubongo, a personal AI OS assistant. "
    "Help the user control their computer concisely and accurately."
)


class OllamaProvider(AIProvider):
    """
    Local Ollama inference — offline, private, free.
    Supports basic tool_use via JSON-based prompting (no native function calling).
    """

    def __init__(self, base_url: str = "http://localhost:11434", model: Optional[str] = None):
        self.base_url = base_url
        self._model = model  # None = auto-select best installed model
        self._client = None
        self._available: Optional[bool] = None
        self._resolved_model: Optional[str] = None

    @property
    def name(self) -> str:
        return "ollama"

    @property
    def client(self):
        if self._client is None:
            try:
                import ollama
                self._client = ollama.Client(host=self.base_url)
            except ImportError:
                logger.error("ollama package not installed. Run: pip install ollama")
                raise
        return self._client

    @property
    def model(self) -> str:
        if self._resolved_model:
            return self._resolved_model
        self._resolved_model = self._select_model()
        return self._resolved_model

    def _select_model(self) -> str:
        """Pick the best available installed model."""
        if self._model:
            return self._model

        preferred = [
            "qwen2.5:0.5b", "qwen2.5:1.5b", "qwen2.5:3b",
            "llama3.2:1b", "llama3.2:3b", "llama3.2",
            "mistral", "llama3.1:8b",
        ]
        try:
            resp = self.client.list()
            models_list = getattr(resp, "models", None) or resp.get("models", [])
            installed = [
                (getattr(m, "model", None) or m.get("name", ""))
                for m in models_list
            ]
            installed = [m for m in installed if m]

            for pref in preferred:
                base = pref.split(":")[0]
                for inst in installed:
                    if pref == inst or base == inst.split(":")[0]:
                        return pref

            if installed:
                return installed[0].split(":")[0]
        except Exception:
            pass
        return "llama3.2"

    def is_available(self) -> bool:
        if self._available is not None:
            return self._available
        try:
            import ollama  # noqa: F401
            resp = self.client.list()
            models_list = getattr(resp, "models", None) or resp.get("models", [])
            self._available = len(models_list) > 0
        except Exception:
            self._available = False
        return self._available

    def warmup(self) -> None:
        """Pre-load the model into memory for faster first response."""
        if not self.is_available():
            return
        try:
            self.client.chat(
                model=self.model,
                messages=[{"role": "user", "content": "ok"}],
                options={"num_predict": 3},
            )
            logger.info("Ollama model warmed up: %s", self.model)
        except Exception as e:
            logger.warning("Ollama warmup failed: %s", e)

    def chat(
        self,
        message: str,
        system_prompt: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> AIResponse:
        if not self.is_available():
            return AIResponse(content="", provider_name=self.name, stop_reason="unavailable")

        try:
            messages: List[Dict[str, str]] = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt or _SYSTEM_DEFAULT})
            if history:
                messages.extend(history)
            messages.append({"role": "user", "content": message})

            response = self.client.chat(
                model=self.model,
                messages=messages,
                options={
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "num_predict": 256,
                },
            )

            content = response["message"]["content"] if isinstance(response, dict) \
                else response.message.content

            return AIResponse(
                content=content or "",
                model_used=self.model,
                provider_name=self.name,
            )

        except Exception as e:
            logger.error("Ollama chat error: %s", e)
            return AIResponse(content="", provider_name=self.name, stop_reason="error")

    def chat_with_tools(
        self,
        message: str,
        tools: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> AIResponse:
        """
        Ollama doesn't natively support tool_use for most models.
        We prompt the model to return JSON and parse the result manually.
        This gives basic agentic capability without native function calling.
        """
        tool_names = [t["name"] for t in tools]
        tool_descriptions = "\n".join(
            f"- {t['name']}: {t.get('description', '')}" for t in tools
        )

        json_prompt = (
            f"{message}\n\n"
            f"Available tools: {tool_names}\n"
            f"{tool_descriptions}\n\n"
            "If you need to use a tool, respond ONLY with JSON:\n"
            '{"tool": "<name>", "input": {<params>}}\n'
            "Otherwise respond normally."
        )

        response = self.chat(json_prompt, system_prompt=system_prompt, history=history)

        # Try to parse a tool call from the response
        tool_calls: List[ToolCall] = []
        content = response.content.strip()

        if content.startswith("{"):
            try:
                import json
                parsed = json.loads(content)
                if "tool" in parsed:
                    tool_calls.append(ToolCall(
                        id="ollama-0",
                        name=parsed["tool"],
                        input=parsed.get("input", {}),
                    ))
                    content = ""
            except Exception:
                pass

        return AIResponse(
            content=content,
            tool_calls=tool_calls,
            stop_reason="tool_use" if tool_calls else "end_turn",
            model_used=self.model,
            provider_name=self.name,
        )
