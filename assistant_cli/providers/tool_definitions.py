"""
Claude tool_use definitions for all ubongo executor tools.

These schemas tell the AI model exactly what tools are available,
what parameters they take, and when to call them.

The executor.py handles the actual execution — this file is purely
the JSON schema layer that Claude/Groq understand.
"""
from typing import List, Dict, Any


UBONGO_TOOLS: List[Dict[str, Any]] = [

    # ── FILE OPERATIONS ──────────────────────────────────────────────
    {
        "name": "file_operation",
        "description": (
            "Perform file system operations: create folders, move or copy files, "
            "delete items, search for files by name or type, or sort files by type "
            "into organised subfolders."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["create_folder", "move_item", "delete_item",
                             "search_files", "sort_files"],
                    "description": "The file operation to perform.",
                },
                "name": {
                    "type": "string",
                    "description": "Name for a new folder.",
                },
                "location": {
                    "type": "string",
                    "description": "Target location: 'desktop', 'downloads', 'documents', "
                                   "or an absolute path.",
                },
                "source": {
                    "type": "string",
                    "description": "Source file or folder path for move/delete operations.",
                },
                "destination": {
                    "type": "string",
                    "description": "Destination path for move operations.",
                },
                "query": {
                    "type": "string",
                    "description": "Search query — filename, extension, or keyword.",
                },
                "file_type": {
                    "type": "string",
                    "description": "Filter by type: 'pdf', 'image', 'video', 'audio', "
                                   "'document', 'code'.",
                },
            },
            "required": ["action"],
        },
    },

    # ── APP CONTROL ──────────────────────────────────────────────────
    {
        "name": "app_control",
        "description": (
            "Open or close applications on the user's computer. "
            "Works cross-platform (macOS, Windows, Linux)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["open", "close"],
                    "description": "Whether to open or close the application.",
                },
                "app_name": {
                    "type": "string",
                    "description": "Application name, e.g. 'spotify', 'chrome', 'vscode'.",
                },
            },
            "required": ["action", "app_name"],
        },
    },

    # ── SYSTEM INFO ──────────────────────────────────────────────────
    {
        "name": "system_info",
        "description": (
            "Retrieve system information: disk space usage, CPU utilisation, "
            "memory/RAM usage, or a combined overview."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "info_type": {
                    "type": "string",
                    "enum": ["disk", "cpu", "memory", "all"],
                    "description": "Which system metric to retrieve.",
                },
            },
            "required": ["info_type"],
        },
    },

    # ── WEB SEARCH (structured results — news, web) ─────────────────
    {
        "name": "web_search",
        "description": (
            "Search the web for current information, news, or articles. "
            "ALWAYS use this when the user asks about current events, news, "
            "trending topics, updates, or anything requiring up-to-date info. "
            "Returns structured results with titles, URLs, snippets, and thumbnails."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query.",
                },
                "search_type": {
                    "type": "string",
                    "enum": ["web", "news"],
                    "description": "Use 'news' for current events/news queries, 'web' for general search.",
                },
            },
            "required": ["query", "search_type"],
        },
    },

    # ── WEB ACTION (browser control) ──────────────────────────────
    {
        "name": "web_action",
        "description": (
            "Open a URL in the browser or take a screenshot. "
            "Use web_search instead for information queries. "
            "Only use this to navigate to a specific URL the user requested."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["navigate", "screenshot"],
                    "description": "The web action to perform.",
                },
                "query": {
                    "type": "string",
                    "description": "Full URL to navigate to.",
                },
            },
            "required": ["action"],
        },
    },

    # ── SCREEN CONTROL ───────────────────────────────────────────────
    {
        "name": "screen_control",
        "description": (
            "Interact with the user's screen. Actions:\n"
            "• screenshot — capture the full screen (macOS native, no deps)\n"
            "• screenshot_window — interactively pick a window to capture\n"
            "• screenshot_selection — user drags a rectangle to capture\n"
            "• describe_screen — take a screenshot and describe what's on it\n"
            "  using vision (use this when the user asks 'what's on my screen', "
            "  'read this', 'what does this error say', etc.)\n"
            "• click — click at (x, y)\n"
            "• type — type text\n"
            "• hotkey — press a key combo (keys: ['command','c'])\n"
            "• scroll — scroll up (positive amount) or down (negative)\n"
            "• screen_size — report screen dimensions"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "screenshot",
                        "screenshot_window",
                        "screenshot_selection",
                        "describe_screen",
                        "click",
                        "type",
                        "hotkey",
                        "scroll",
                        "screen_size",
                    ],
                    "description": "The screen/input action to perform.",
                },
                "x": {"type": "number", "description": "X coordinate for click."},
                "y": {"type": "number", "description": "Y coordinate for click."},
                "text": {"type": "string", "description": "Text to type."},
                "keys": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Key combination, e.g. ['command','c'].",
                },
                "amount": {
                    "type": "number",
                    "description": "Scroll amount (positive=up, negative=down).",
                },
                "prompt": {
                    "type": "string",
                    "description": (
                        "For describe_screen: what to focus on "
                        "(e.g. 'read the error message')."
                    ),
                },
            },
            "required": ["action"],
        },
    },

    # ── MUSIC CONTROL ────────────────────────────────────────────────
    {
        "name": "music_control",
        "description": (
            "Control music playback: play, pause, skip tracks, or search for a song."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["play", "pause", "next", "previous", "search"],
                    "description": "Playback action.",
                },
                "query": {
                    "type": "string",
                    "description": "Song name or artist to search for.",
                },
            },
            "required": ["action"],
        },
    },

    # ── MEMORY SEARCH ───────────────────────────────────────────────
    {
        "name": "memory_search",
        "description": (
            "Search the user's indexed files by name, type, category, "
            "recency, or directory. The file index is always up to date — "
            "use this instead of scanning the filesystem manually. "
            "Returns file paths, sizes, and modification dates."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Free-text search on filenames and paths.",
                },
                "category": {
                    "type": "string",
                    "enum": [
                        "document", "spreadsheet", "presentation", "image",
                        "video", "audio", "archive", "code", "design",
                        "application", "other",
                    ],
                    "description": "Filter by file category.",
                },
                "extension": {
                    "type": "string",
                    "description": "Filter by extension, e.g. '.pdf', '.py'.",
                },
                "modified_within_days": {
                    "type": "integer",
                    "description": "Only files modified within this many days.",
                },
                "directory": {
                    "type": "string",
                    "description": "Only search within this directory (absolute path).",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 30).",
                },
            },
            "required": [],
        },
    },

    # ── SEMANTIC MEMORY (cross-session facts) ───────────────────────
    {
        "name": "memory_recall",
        "description": (
            "Recall facts the user has asked you to remember in the past. "
            "Use this BEFORE guessing — if the user references something you "
            "don't see in MEMORY.md, search here. Returns up to `limit` facts "
            "ranked by how many query tokens match their text or tags. "
            "Empty query returns the most recently saved facts."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Free-text search across fact text and tags.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max facts to return (default 8, cap 100).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "memory_save",
        "description": (
            "Save a single fact the user wants you to remember in future "
            "conversations. Use this when the user says 'remember that...', "
            "'from now on...', or confirms a preference that should persist. "
            "Keep facts short (one sentence). For the bigger index-style "
            "memory, edit ~/.ubongo/MEMORY.md instead."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "The fact to remember. One sentence.",
                },
                "tags": {
                    "type": "string",
                    "description": (
                        "Optional space-separated tags for recall "
                        "(e.g. 'preference workflow')."
                    ),
                },
            },
            "required": ["text"],
        },
    },
    {
        "name": "memory_forget",
        "description": (
            "Delete a previously saved fact by id. Call memory_recall first "
            "to find the fact id, then pass it here. Only use when the user "
            "explicitly asks you to forget something."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "integer",
                    "description": "The fact id returned by memory_recall.",
                },
            },
            "required": ["id"],
        },
    },

    # ── CANVAS EMIT (render a rich artifact in the UI) ──────────────
    {
        "name": "canvas_emit",
        "description": (
            "Render a rich artifact on the shared canvas beside the chat. "
            "Use this when the answer is better shown than said — a table "
            "of results, a code snippet, a file list, a chart config, a "
            "markdown block. The frontend picks a renderer based on `kind`. "
            "Supply `id` on subsequent calls to update an existing artifact "
            "in place (good for streaming progress)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "description": (
                        "Renderer key. Common kinds: 'markdown', 'code', "
                        "'table', 'file_list', 'chart', 'note'. Custom kinds "
                        "work if the frontend knows about them."
                    ),
                },
                "title": {
                    "type": "string",
                    "description": "Short heading shown on the artifact card.",
                },
                "payload": {
                    "type": "object",
                    "description": "Kind-specific body passed to the renderer.",
                },
                "id": {
                    "type": "string",
                    "description": (
                        "Optional stable id. Passing the same id again "
                        "updates that artifact instead of creating a new one."
                    ),
                },
            },
            "required": ["kind", "title"],
        },
    },

    # ── LEARNING SUGGEST (propose a durable change to workspace identity) ─
    {
        "name": "learning_suggest",
        "description": (
            "Propose a durable change to the user's identity files. Never "
            "mutates SOUL.md / USER.md / TOOLS.md / MEMORY.md directly — "
            "the suggestion is appended to EVOLUTION.md for the user to "
            "review and apply. Use this when you notice a repeated "
            "preference, a correction the user has made more than once, or "
            "a hard-stop they've stated explicitly. Do NOT use it for "
            "single-turn scratch facts — use memory_save for those."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "target": {
                    "type": "string",
                    "enum": ["SOUL.md", "USER.md", "TOOLS.md", "MEMORY.md"],
                    "description": "Which identity file this suggestion is about.",
                },
                "kind": {
                    "type": "string",
                    "description": (
                        "Short label for the change: 'preference', 'tone', "
                        "'hard-stop', 'safe-default', 'workflow', etc."
                    ),
                },
                "summary": {
                    "type": "string",
                    "description": "One line on what to change and why.",
                },
                "patch": {
                    "type": "string",
                    "description": (
                        "Exact text, bullet, or paragraph to add or replace. "
                        "Keep it short and drop-in ready for the user."
                    ),
                },
                "confidence": {
                    "type": "number",
                    "description": "0.0–1.0 — how durable this looks based on the evidence you have.",
                },
            },
            "required": ["target", "summary", "patch"],
        },
    },

    # ── REFLECTION LOG (post-turn / daily hindsight) ──────────────────
    {
        "name": "reflection_log",
        "description": (
            "Append a structured hindsight entry to REFLECTION.md. Four "
            "fields — what worked, what didn't, what was recovered, what's "
            "still open. Use this at the end of a non-trivial turn or when "
            "summarizing a day. Empty fields are fine; the template fills "
            "in dashes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "worked":     {"type": "string"},
                "didnt_work": {"type": "string"},
                "recovered":  {"type": "string"},
                "open_items": {"type": "string"},
            },
        },
    },

    # ── SESSIONS SPAWN (delegate a focused task to a sub-agent) ─────
    {
        "name": "sessions_spawn",
        "description": (
            "Delegate a focused subtask to a fresh sub-agent that runs "
            "in its own isolated session with a narrower sandbox. Use "
            "this when you want to run an untrusted follow-up (e.g. "
            "processing webhook payload content) without polluting the "
            "main conversation or granting it your full privileges. "
            "The child returns its final_text; your conversation context "
            "is unaffected."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "The prompt the sub-agent should work on.",
                },
                "channel": {
                    "type": "string",
                    "description": (
                        "Label for the spawned session (default 'subagent'). "
                        "Useful for audit logs."
                    ),
                },
                "tier": {
                    "type": "string",
                    "enum": ["trusted", "review", "untrusted"],
                    "description": (
                        "Sandbox tier for the child. Defaults to one notch "
                        "stricter than the parent (usually 'untrusted')."
                    ),
                },
                "max_steps": {
                    "type": "integer",
                    "description": "Safety cap on tool calls the child can make (default 4, max 8).",
                },
            },
            "required": ["task"],
        },
    },

    # ── LOAD SKILL (lazy-load playbooks from the workspace) ─────────
    {
        "name": "load_skill",
        "description": (
            "Load the full body of a skill playbook from the user's workspace "
            "(~/.ubongo/skills/<name>/SKILL.md). Call this when the skills index "
            "listed in the system prompt contains a skill relevant to the user's "
            "request. Returns the skill's instructions as text, which you should "
            "then follow on the next turn."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Skill name, exactly as shown in the skills index.",
                },
            },
            "required": ["name"],
        },
    },

    # ── CREATE DOCUMENT ──────────────────────────────────────────────
    {
        "name": "create_document",
        "description": (
            "Create a new text document, note, or presentation file "
            "with optional content."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doc_type": {
                    "type": "string",
                    "enum": ["text", "markdown", "presentation"],
                    "description": "Type of document to create.",
                },
                "name": {
                    "type": "string",
                    "description": "Filename for the new document.",
                },
                "content": {
                    "type": "string",
                    "description": "Initial content to write into the document.",
                },
                "location": {
                    "type": "string",
                    "description": "Where to save: 'desktop', 'documents', or a path.",
                },
            },
            "required": ["doc_type", "name"],
        },
    },

    # ── AUTONOMY: SCHEDULER ────────────────────────────────────────────
    {
        "name": "cron_create",
        "description": (
            "Schedule a recurring prompt the agent will re-enter on a timer. "
            "Use for periodic checks (daily brief, hourly monitor). The "
            "resulting session runs under the tier you set — default untrusted "
            "so cron jobs can't silently mutate user state."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Short, unique label for the job (e.g. 'morning-brief').",
                },
                "prompt": {
                    "type": "string",
                    "description": "The prompt the agent will receive on each tick.",
                },
                "interval_seconds": {
                    "type": "integer",
                    "description": "How often the job fires. Minimum enforced by scheduler.",
                },
                "tier": {
                    "type": "string",
                    "enum": ["trusted", "review", "untrusted"],
                    "description": "Sandbox tier for the cron session. Default 'untrusted'.",
                },
                "start_offset": {
                    "type": "number",
                    "description": "Seconds to wait before the first fire (negative = already due).",
                },
            },
            "required": ["name", "prompt", "interval_seconds"],
        },
    },
    {
        "name": "cron_list",
        "description": "List all scheduled jobs with their next-run timestamps.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "cron_delete",
        "description": "Remove a scheduled job by its numeric id (from cron_list).",
        "input_schema": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "integer",
                    "description": "Job id returned by cron_create or cron_list.",
                },
            },
            "required": ["id"],
        },
    },

    # ── AUTONOMY: WEBHOOKS ─────────────────────────────────────────────
    {
        "name": "webhook_register",
        "description": (
            "Open a webhook channel so an external system can POST a payload "
            "that becomes an agent turn. Use the optional 'secret' to require "
            "HMAC-style signature verification. Default tier is 'untrusted' — "
            "the agent must explicitly raise it if the source is trusted."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Path segment under /webhooks/ (e.g. 'github').",
                },
                "tier": {
                    "type": "string",
                    "enum": ["trusted", "review", "untrusted"],
                    "description": "Sandbox tier for sessions triggered by this channel.",
                },
                "allow": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Tool names to explicitly allow regardless of tier.",
                },
                "deny": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Tool names to explicitly block regardless of tier.",
                },
                "addendum": {
                    "type": "string",
                    "description": "Extra instructions appended to the system prompt for this channel.",
                },
                "secret": {
                    "type": "string",
                    "description": "Shared secret for x-ubongo-signature verification.",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "webhook_list",
        "description": "List all registered webhook channels.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "webhook_remove",
        "description": "Unregister a webhook channel by name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Channel name to remove.",
                },
            },
            "required": ["name"],
        },
    },
]


def get_tools_for_tier(tier: str) -> List[Dict[str, Any]]:
    """
    Return the appropriate tool set based on the user's subscription tier.

    free  → basic tools only (file, app, system info)
    pro   → all tools
    power → all tools
    """
    basic_tools = {
        "file_operation", "app_control", "system_info",
        "memory_search", "memory_recall", "memory_save", "memory_forget",
        "web_search", "screen_control", "load_skill", "sessions_spawn",
        "canvas_emit", "learning_suggest", "reflection_log",
        "cron_create", "cron_list", "cron_delete",
        "webhook_register", "webhook_list", "webhook_remove",
    }

    if tier == "free":
        return [t for t in UBONGO_TOOLS if t["name"] in basic_tools]

    return UBONGO_TOOLS
