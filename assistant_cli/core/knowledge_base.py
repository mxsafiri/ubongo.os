from dataclasses import dataclass
from typing import List

@dataclass
class Capability:
    title: str
    description: str
    examples: List[str]

class CapabilityCatalog:
    def __init__(self):
        self.capabilities = [
            Capability(
                title="File & Folder Management",
                description="Create, move, delete, and organize files and folders.",
                examples=[
                    "Create a folder called Projects on my desktop",
                    "Move it to Documents",
                    "Find screenshots from last week",
                    "Organize my downloads folder",
                ],
            ),
            Capability(
                title="App Control",
                description="Open and manage applications on your computer.",
                examples=[
                    "Open Spotify",
                    "Launch Chrome",
                    "Open VSCode",
                ],
            ),
            Capability(
                title="System Info",
                description="Check disk space, CPU, and memory usage.",
                examples=[
                    "What's my disk space?",
                    "Show CPU usage",
                    "Check memory",
                ],
            ),
            Capability(
                title="Offline Workflows (Africa-optimized)",
                description="Multi-step tasks for offline environments and storage constraints.",
                examples=[
                    "Prepare USB transfer",
                    "Free up disk space",
                    "Clean WhatsApp media",
                    "Organize school files",
                ],
            ),
        ]

    def render_overview(self) -> str:
        sections = ["Here's what I can do right now (offline):\n"]

        for cap in self.capabilities:
            sections.append(f"**{cap.title}**")
            sections.append(f"  {cap.description}")
            sections.append("  Examples:")
            for example in cap.examples:
                sections.append(f"   • {example}")
            sections.append("")

        sections.append("Ask me naturally — I can guide you or execute tasks.")
        return "\n".join(sections)
