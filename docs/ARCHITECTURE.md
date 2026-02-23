# Architecture Documentation

## System Overview

Assistant CLI is a local-first, privacy-focused automation tool that uses natural language processing to control your computer.

## Core Components

### 1. CLI Interface (`cli.py`)
- **Rich Terminal UI** - Beautiful, colored output using the Rich library
- **Interactive Loop** - Handles user input and displays responses
- **Session Management** - Maintains conversation state

### 2. Intent Parser (`core/intent_parser.py`)
- **Pattern Matching** - Fast regex-based intent detection
- **Parameter Extraction** - Pulls relevant data from user input
- **Confidence Scoring** - Rates how well it understood the command
- **Fallback to LLM** - (Future) Uses Ollama for complex queries

**Flow:**
```
User Input → Pattern Matching → Extract Parameters → Return ParsedCommand
```

### 3. Command Executor (`core/executor.py`)
- **Tool Routing** - Directs commands to appropriate tool modules
- **Context Awareness** - Uses previous results for follow-up commands
- **Error Handling** - Graceful failures with helpful messages

### 4. Tool Modules (`tools/`)

#### File Operations (`file_operations.py`)
- Create/move/delete files and folders
- Search files by type, date, location
- Smart defaults (e.g., desktop for new folders)

#### App Control (`app_control.py`)
- Open/close applications
- Platform-specific implementations (macOS, Windows, Linux)
- App name mapping for common aliases

#### System Info (`system_info.py`)
- Disk space monitoring
- CPU usage tracking
- Memory statistics
- Uses `psutil` for cross-platform compatibility

### 5. Context Manager (`core/context_manager.py`)
- **SQLite Database** - Persistent conversation history
- **Session Tracking** - Maintains current conversation state
- **Context Memory** - Remembers last actions for follow-up commands

**Database Schema:**
```sql
conversations (id, session_id, created_at, updated_at)
messages (id, session_id, role, content, timestamp, metadata)
```

### 6. Configuration (`config.py`)
- **Pydantic Settings** - Type-safe configuration
- **Environment Variables** - Override defaults with `ASSISTANT_*` vars
- **Directory Management** - Auto-creates `~/.assistant-cli/`

## Data Flow

### Example: "Create a folder called Projects on my desktop"

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Input                                                │
│    "Create a folder called Projects on my desktop"          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Intent Parser                                             │
│    Pattern: "create (?:a )?folder"                          │
│    Extracts: name="Projects", location="desktop"            │
│    Returns: ParsedCommand(intent=CREATE_FOLDER, ...)        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Command Executor                                          │
│    Routes to: FileOperations.create_folder()                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. File Operations Tool                                      │
│    - Resolves location: ~/Desktop                           │
│    - Creates folder: ~/Desktop/Projects                     │
│    - Returns: ExecutionResult(success=True, ...)            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Context Manager                                           │
│    - Saves message to database                               │
│    - Updates context: last_action, affected_items           │
│    - Sets awaiting_followup=True                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. CLI Display                                               │
│    "✓ Created 'Projects' on Desktop                         │
│     Want to move it somewhere else?"                         │
└─────────────────────────────────────────────────────────────┘
```

## Design Patterns

### 1. Strategy Pattern
Different tools implement the same interface (`ExecutionResult`) but with platform-specific logic.

### 2. Command Pattern
User input → ParsedCommand → Execute → Result

### 3. Context Pattern
Maintains conversation state across multiple interactions

### 4. Factory Pattern
Intent patterns are defined declaratively and instantiated at runtime

## Future Enhancements

### Phase 2: LLM Integration
- Ollama integration for complex queries
- Semantic understanding beyond pattern matching
- Natural language generation for responses

### Phase 3: Advanced Automation
- Mouse/keyboard control with PyAutoGUI
- Browser automation with Playwright
- Screen recognition and OCR
- Multi-step task planning

### Phase 4: Agent System
- Autonomous task execution
- Scheduled automation
- Plugin system for custom tools
- Multi-agent collaboration

### Phase 5: Learning & Optimization
- User preference learning
- Command suggestion
- Error pattern detection
- Performance optimization

## Technology Stack

- **Python 3.11+** - Core language
- **Rich** - Terminal UI
- **Typer** - CLI framework
- **Pydantic** - Data validation
- **SQLite** - Local database
- **psutil** - System monitoring
- **Ollama** - Local LLM (future)
- **Playwright** - Browser automation (future)
- **PyAutoGUI** - GUI automation (future)

## File Structure

```
assistant-cli/
├── assistant_cli/
│   ├── __init__.py
│   ├── __main__.py
│   ├── main.py              # Entry point
│   ├── cli.py               # CLI interface
│   ├── config.py            # Configuration
│   ├── models.py            # Data models
│   ├── core/
│   │   ├── intent_parser.py # NLP parsing
│   │   ├── executor.py      # Command execution
│   │   └── context_manager.py # State management
│   ├── tools/
│   │   ├── file_operations.py
│   │   ├── app_control.py
│   │   └── system_info.py
│   └── utils/
│       └── logger.py
├── docs/
│   └── ARCHITECTURE.md
├── tests/
├── requirements.txt
├── pyproject.toml
├── README.md
├── QUICKSTART.md
└── LICENSE
```

## Security Considerations

1. **Local-First** - No data leaves your machine
2. **Confirmation Required** - Destructive operations require user approval
3. **Audit Logs** - All actions logged to `~/.assistant-cli/logs/`
4. **No Telemetry** - Zero tracking or analytics
5. **Open Source** - Fully auditable code

## Performance

- **Pattern Matching** - <10ms for most commands
- **File Operations** - <100ms typically
- **App Launch** - 1-3 seconds (OS dependent)
- **LLM Inference** - 2-5 seconds (when implemented)

## Testing Strategy

- **Unit Tests** - Individual components
- **Integration Tests** - End-to-end workflows
- **Platform Tests** - macOS, Windows, Linux compatibility
- **Performance Tests** - Response time benchmarks
