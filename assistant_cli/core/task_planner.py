from typing import List, Dict, Any, Optional
from assistant_cli.models import Intent, ParsedCommand
from assistant_cli.utils import logger

class TaskTemplate:
    """Predefined task template for common workflows"""
    def __init__(self, name: str, steps: List[Dict[str, Any]], description: str = ""):
        self.name = name
        self.steps = steps
        self.description = description

TASK_TEMPLATES = {
    "organize_downloads": TaskTemplate(
        name="organize_downloads",
        description="Organize Downloads folder by file type",
        steps=[
            {
                "intent": Intent.SEARCH_FILES,
                "params": {"location": "downloads"},
                "description": "Scan Downloads folder"
            },
            {
                "intent": Intent.SORT_FILES,
                "params": {"location": "downloads"},
                "description": "Sort files into category folders (Images, Documents, Videos, Audio, Archives, Code)"
            }
        ]
    ),
    
    "clean_desktop": TaskTemplate(
        name="clean_desktop",
        description="Clean up Desktop by sorting files into categories",
        steps=[
            {
                "intent": Intent.SEARCH_FILES,
                "params": {"location": "desktop"},
                "description": "Scan Desktop files"
            },
            {
                "intent": Intent.SORT_FILES,
                "params": {"location": "desktop"},
                "description": "Sort files into category folders (Images, Documents, Videos, Audio, Archives, Code)"
            }
        ]
    ),
    
    "backup_project": TaskTemplate(
        name="backup_project",
        description="Create backup of current project",
        steps=[
            {
                "intent": Intent.CREATE_FOLDER,
                "params": {"name": "Backups", "location": "documents"},
                "description": "Create Backups folder"
            }
        ]
    ),
    
    # African-specific use cases
    "prepare_usb_transfer": TaskTemplate(
        name="prepare_usb_transfer",
        description="Prepare files for USB/offline transfer (common in areas with limited internet)",
        steps=[
            {
                "intent": Intent.CREATE_FOLDER,
                "params": {"name": "USB Transfer", "location": "desktop"},
                "description": "Create USB Transfer folder"
            },
            {
                "intent": Intent.SEARCH_FILES,
                "params": {"location": "documents"},
                "description": "Find recent documents"
            }
        ]
    ),
    
    "organize_mobile_photos": TaskTemplate(
        name="organize_mobile_photos",
        description="Organize photos transferred from mobile phone",
        steps=[
            {
                "intent": Intent.SEARCH_FILES,
                "params": {"file_type": "images", "location": "downloads"},
                "description": "Find all images in Downloads"
            },
            {
                "intent": Intent.CREATE_FOLDER,
                "params": {"name": "Mobile Photos", "location": "documents"},
                "description": "Create Mobile Photos folder"
            }
        ]
    ),
    
    "free_disk_space": TaskTemplate(
        name="free_disk_space",
        description="Free up disk space (important for devices with limited storage)",
        steps=[
            {
                "intent": Intent.GET_SYSTEM_INFO,
                "params": {},
                "description": "Check current disk usage"
            },
            {
                "intent": Intent.SEARCH_FILES,
                "params": {"location": "downloads"},
                "description": "Find old downloads"
            },
            {
                "intent": Intent.CREATE_FOLDER,
                "params": {"name": "To Delete", "location": "desktop"},
                "description": "Create folder for review before deletion"
            }
        ]
    ),
    
    "prepare_offline_work": TaskTemplate(
        name="prepare_offline_work",
        description="Prepare workspace for offline work session",
        steps=[
            {
                "intent": Intent.CREATE_FOLDER,
                "params": {"name": "Offline Work", "location": "desktop"},
                "description": "Create offline work folder"
            },
            {
                "intent": Intent.GET_SYSTEM_INFO,
                "params": {},
                "description": "Check system resources"
            }
        ]
    ),
    
    "organize_school_files": TaskTemplate(
        name="organize_school_files",
        description="Organize school/university documents",
        steps=[
            {
                "intent": Intent.CREATE_FOLDER,
                "params": {"name": "School", "location": "documents"},
                "description": "Create School folder"
            },
            {
                "intent": Intent.CREATE_FOLDER,
                "params": {"name": "Assignments", "location": "documents"},
                "description": "Create Assignments subfolder"
            },
            {
                "intent": Intent.CREATE_FOLDER,
                "params": {"name": "Notes", "location": "documents"},
                "description": "Create Notes subfolder"
            }
        ]
    ),
    
    "backup_to_external": TaskTemplate(
        name="backup_to_external",
        description="Prepare backup for external drive (common for data preservation)",
        steps=[
            {
                "intent": Intent.CREATE_FOLDER,
                "params": {"name": "Backup-" + "2026", "location": "desktop"},
                "description": "Create dated backup folder"
            },
            {
                "intent": Intent.SEARCH_FILES,
                "params": {"location": "documents"},
                "description": "Find important documents"
            }
        ]
    ),
    
    "clean_whatsapp_media": TaskTemplate(
        name="clean_whatsapp_media",
        description="Clean up WhatsApp media files (major storage consumer)",
        steps=[
            {
                "intent": Intent.SEARCH_FILES,
                "params": {"file_type": "images", "location": "downloads"},
                "description": "Find WhatsApp images"
            },
            {
                "intent": Intent.SEARCH_FILES,
                "params": {"file_type": "videos", "location": "downloads"},
                "description": "Find WhatsApp videos"
            },
            {
                "intent": Intent.CREATE_FOLDER,
                "params": {"name": "WhatsApp Archive", "location": "documents"},
                "description": "Create archive folder"
            }
        ]
    )
}

class TaskPlanner:
    """
    Rule-based task planner that works completely offline.
    No LLM required for common workflows.
    """
    
    def __init__(self):
        self.templates = TASK_TEMPLATES
        logger.info("TaskPlanner initialized with %d templates", len(self.templates))
    
    def match_template(self, user_input: str) -> Optional[TaskTemplate]:
        """Match user input to predefined template"""
        user_input_lower = user_input.lower()
        
        # Original templates (with synonym support)
        organize_words = ["organize", "tidy", "sort", "arrange", "clean up", "cleanup", "declutter"]
        if any(w in user_input_lower for w in organize_words) and "download" in user_input_lower:
            return self.templates["organize_downloads"]
        
        clean_words = ["clean", "tidy", "declutter", "organize"]
        if any(w in user_input_lower for w in clean_words) and "desktop" in user_input_lower:
            return self.templates["clean_desktop"]
        
        if "backup" in user_input_lower and "project" in user_input_lower:
            return self.templates["backup_project"]
        
        # African use case templates
        if ("usb" in user_input_lower or "flash" in user_input_lower) and "transfer" in user_input_lower:
            return self.templates["prepare_usb_transfer"]
        
        if ("mobile" in user_input_lower or "phone" in user_input_lower) and "photo" in user_input_lower:
            return self.templates["organize_mobile_photos"]
        
        if "free" in user_input_lower and ("space" in user_input_lower or "disk" in user_input_lower):
            return self.templates["free_disk_space"]
        
        if "offline" in user_input_lower and "work" in user_input_lower:
            return self.templates["prepare_offline_work"]
        
        if "school" in user_input_lower or "university" in user_input_lower or "student" in user_input_lower:
            return self.templates["organize_school_files"]
        
        if "backup" in user_input_lower and ("external" in user_input_lower or "drive" in user_input_lower):
            return self.templates["backup_to_external"]
        
        if "whatsapp" in user_input_lower and ("clean" in user_input_lower or "media" in user_input_lower):
            return self.templates["clean_whatsapp_media"]
        
        return None
    
    def plan(self, user_input: str) -> Optional[List[ParsedCommand]]:
        """
        Create execution plan from user input.
        Returns list of commands to execute in sequence.
        """
        template = self.match_template(user_input)
        
        if not template:
            return None
        
        commands = []
        for step in template.steps:
            command = ParsedCommand(
                intent=step["intent"],
                params=step.get("params", {}),
                confidence=1.0,
                raw_input=step.get("description", ""),
                requires_confirmation=False
            )
            commands.append(command)
        
        logger.info("Created plan with %d steps for: %s", len(commands), template.name)
        return commands
    
    def decompose_goal(self, goal: str) -> List[str]:
        """
        Break down complex goal into simpler sub-goals.
        Uses heuristics, no LLM needed.
        """
        goal_lower = goal.lower()
        steps = []
        
        if "organize" in goal_lower:
            steps.extend([
                "Analyze current state",
                "Create organization structure",
                "Move items to appropriate locations",
                "Clean up empty folders"
            ])
        
        elif "backup" in goal_lower:
            steps.extend([
                "Identify files to backup",
                "Create backup location",
                "Copy files",
                "Verify backup"
            ])
        
        elif "clean" in goal_lower:
            steps.extend([
                "Find old/unused files",
                "Create archive location",
                "Move files to archive",
                "Report space saved"
            ])
        
        return steps if steps else [goal]
    
    def add_template(self, name: str, template: TaskTemplate) -> None:
        """Add new task template (for extensibility)"""
        self.templates[name] = template
        logger.info("Added new template: %s", name)
    
    def list_templates(self) -> List[str]:
        """List available templates"""
        return [
            f"{name}: {template.description}"
            for name, template in self.templates.items()
        ]
