"""
LLMClient — backward-compatible shim over the new provider layer.

All new code should use ProviderRouter directly.
This class exists so the existing conversation_engine, enhanced_parser,
and executor continue working without modification during the transition.
"""
from typing import Optional, Dict, Any, List
from assistant_cli.config import settings
from assistant_cli.utils import logger
from assistant_cli.providers import ProviderRouter
from assistant_cli.providers.tool_definitions import get_tools_for_tier


class LLMClient:
    """
    Thin shim over ProviderRouter.
    Preserves the original interface so no other files need to change.
    """

    def __init__(self):
        self._router        = ProviderRouter(settings)
        self._ollama_client = None   # lazy, only used by legacy warmup path
        provider            = self._router.get_provider()
        self.model          = getattr(provider, "model", settings.ollama_model)
        self.available      = provider.is_available()
        logger.info(
            "LLMClient initialised — provider: %s, available: %s",
            provider.name, self.available
        )

    # ── Keep old internal helpers as no-ops so nothing breaks ────────

    def _select_optimal_model(self) -> str:
        """Deprecated — model selection now handled by ProviderRouter."""
        preferred = ["qwen2.5:0.5b", "qwen2.5:1.5b", "llama3.2:1b", "llama3.2", settings.ollama_model]
        try:
            from assistant_cli.providers.ollama_provider import OllamaProvider
            op = OllamaProvider(base_url=settings.ollama_base_url)
            return op.model
        except Exception:
            pass

        preferred = ["qwen2.5:0.5b", "qwen2.5:1.5b", "llama3.2:1b", "llama3.2", settings.ollama_model]
        try:
            import ollama as _ollama
            client = _ollama.Client(host=settings.ollama_base_url)
            resp = client.list()
            models_list = getattr(resp, "models", None) or resp.get("models", [])
            installed = []
            for m in models_list:
                name = getattr(m, "model", None) or m.get("name", "")
                if name:
                    installed.append(name)

            for pref in preferred:
                pref_base = pref.split(":")[0]
                for inst in installed:
                    if pref == inst or pref_base == inst.split(":")[0]:
                        return pref

            # If none preferred, use whatever is installed
            if installed:
                return installed[0].split(":")[0]
        except Exception:
            pass
        return settings.ollama_model
    
    def _check_ollama_available(self) -> bool:
        """Check if Ollama is running and model is available"""
        try:
            import ollama
            client = ollama.Client(host=settings.ollama_base_url)
            resp = client.list()

            # Handle both old dict format and new ListResponse with Model objects
            available_models = []
            models_list = getattr(resp, "models", None) or resp.get("models", [])
            for m in models_list:
                name = getattr(m, "model", None) or m.get("name", "")
                if name:
                    available_models.append(name)

            # Match by base name (e.g. "llama3.2" matches "llama3.2:latest")
            wanted_base = self.model.split(":")[0]
            model_available = any(
                self.model == m or wanted_base == m.split(":")[0]
                for m in available_models
            )
            
            if not model_available:
                logger.warning("Model %s not found. Available: %s", self.model, available_models)
                logger.info("Run: ollama pull %s", self.model)
            
            return model_available
        except Exception as e:
            logger.warning("Ollama not available: %s", str(e))
            return False
    
    @property
    def client(self):
        """Lazy-load Ollama client for legacy warmup path only."""
        try:
            import ollama as _ollama
            if self._ollama_client is None:
                self._ollama_client = _ollama.Client(host=settings.ollama_base_url)
            return self._ollama_client
        except ImportError:
            return None

    def warmup(self):
        """Pre-load the model into memory so first real query is fast."""
        provider = self._router.get_provider()
        if hasattr(provider, "warmup"):
            provider.warmup()

    def chat(
        self,
        message: str,
        system_prompt: Optional[str] = None,
        context: Optional[List[Dict[str, str]]] = None,
    ) -> Optional[str]:
        """
        Route to the best available provider and return a text response.
        Maintains the original Optional[str] return type for compatibility.
        """
        try:
            provider = self._router.get_provider()
            response = provider.chat(
                message=message,
                system_prompt=system_prompt,
                history=context,
            )
            settings.increment_query_count()
            return response.content if response.content else None
        except Exception as e:
            logger.error("LLMClient.chat error: %s", e)
            return None

    def chat_with_tools(
        self,
        message: str,
        system_prompt: Optional[str] = None,
        context: Optional[List[Dict[str, str]]] = None,
    ):
        """
        Agentic chat — returns an AIResponse with possible tool_calls.
        New code should call this for multi-step tasks.
        """
        from assistant_cli.providers.base import AIResponse
        try:
            provider = self._router.get_provider()
            tools    = get_tools_for_tier(settings.effective_tier)
            response = provider.chat_with_tools(
                message=message,
                tools=tools,
                system_prompt=system_prompt,
                history=context,
            )
            settings.increment_query_count()
            return response
        except Exception as e:
            logger.error("LLMClient.chat_with_tools error: %s", e)
            from assistant_cli.providers.base import AIResponse
            return AIResponse(content="", stop_reason="error")

    # ── Legacy internal helpers (kept for old callers) ────────────────

    def _legacy_ollama_chat(
        self,
        message: str,
        system_prompt: Optional[str] = None,
        context: Optional[List[Dict[str, str]]] = None,
    ) -> Optional[str]:
        """Original Ollama-only implementation, kept as internal fallback."""
        if not self.available:
            logger.warning("LLM not available, falling back to pattern matching")
            return None

        try:
            messages: List[Dict] = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            if context:
                messages.extend(context)
            messages.append({"role": "user", "content": message})

            logger.debug("Sending to LLM: %s", message[:100])

            client = self.client
            if client is None:
                return None

            response = client.chat(
                model=self.model,
                messages=messages,
                options={
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "num_predict": 50,  # Cap tokens for snappy CPU responses
                }
            )
            
            content = response['message']['content']
            logger.debug("LLM response: %s", content[:100])
            
            return content
        
        except Exception as e:
            logger.error("LLM chat error: %s", str(e))
            return None
    
    def parse_intent(self, user_input: str) -> Optional[Dict[str, Any]]:
        """
        Use LLM to parse ambiguous user input into structured intent.
        Fallback when pattern matching fails.
        """
        if not self.available:
            return None
        
        system_prompt = """You are a command parser. Extract the intent and parameters from user input.
Respond ONLY with valid JSON in this format:
{
  "intent": "create_folder|open_app|search_files|get_system_info|move_item|delete_item|unknown",
  "params": {"key": "value"},
  "confidence": 0.0-1.0
}

Examples:
Input: "Can you make a new directory called work stuff on my desktop?"
Output: {"intent": "create_folder", "params": {"name": "work stuff", "location": "desktop"}, "confidence": 0.95}

Input: "Launch my music app"
Output: {"intent": "open_app", "params": {"app_name": "spotify"}, "confidence": 0.8}
"""
        
        try:
            response = self.chat(user_input, system_prompt=system_prompt)
            
            if not response:
                return None
            
            import json
            response_clean = response.strip()
            if response_clean.startswith("```json"):
                response_clean = response_clean.split("```json")[1].split("```")[0].strip()
            elif response_clean.startswith("```"):
                response_clean = response_clean.split("```")[1].split("```")[0].strip()
            
            parsed = json.loads(response_clean)
            
            return parsed
        
        except Exception as e:
            logger.error("Intent parsing error: %s", str(e))
            return None
    
    def plan_task(self, goal: str) -> Optional[List[Dict[str, Any]]]:
        """
        Use LLM to break down complex goal into steps.
        Returns list of steps to execute.
        """
        if not self.available:
            return None
        
        system_prompt = """You are a task planner. Break down the user's goal into concrete steps.
Respond ONLY with valid JSON array of steps:
[
  {"action": "action_name", "params": {"key": "value"}, "description": "what this does"},
  ...
]

Available actions:
- create_folder, move_item, delete_item, search_files
- open_app, close_app
- get_system_info

Example:
Goal: "Organize my downloads folder"
Output: [
  {"action": "search_files", "params": {"location": "downloads"}, "description": "List all files in downloads"},
  {"action": "create_folder", "params": {"name": "Images", "location": "downloads"}, "description": "Create Images folder"},
  {"action": "create_folder", "params": {"name": "Documents", "location": "downloads"}, "description": "Create Documents folder"},
  {"action": "move_item", "params": {"pattern": "*.jpg", "destination": "Images"}, "description": "Move images"}
]
"""
        
        try:
            response = self.chat(goal, system_prompt=system_prompt)
            
            if not response:
                return None
            
            import json
            response_clean = response.strip()
            if response_clean.startswith("```json"):
                response_clean = response_clean.split("```json")[1].split("```")[0].strip()
            elif response_clean.startswith("```"):
                response_clean = response_clean.split("```")[1].split("```")[0].strip()
            
            steps = json.loads(response_clean)
            
            return steps if isinstance(steps, list) else None
        
        except Exception as e:
            logger.error("Task planning error: %s", str(e))
            return None
    
    def generate_response(self, context: str, result: str) -> str:
        """
        Generate natural language response based on execution result.
        Makes the assistant more conversational.
        """
        if not self.available:
            return result
        
        system_prompt = """You are a helpful assistant. Generate a brief, friendly response based on the action result.
Keep it concise (1-2 sentences). Add relevant emoji if appropriate."""
        
        try:
            prompt = f"Action context: {context}\nResult: {result}\n\nGenerate response:"
            response = self.chat(prompt, system_prompt=system_prompt)
            
            return response if response else result
        
        except Exception as e:
            logger.error("Response generation error: %s", str(e))
            return result
