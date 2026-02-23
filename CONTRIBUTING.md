# Contributing to Assistant CLI

Thank you for your interest in contributing! This document provides guidelines and instructions.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/assistant-cli.git`
3. Create a virtual environment: `python -m venv venv`
4. Activate it: `source venv/bin/activate`
5. Install dependencies: `pip install -r requirements.txt`
6. Install dev dependencies: `pip install -e ".[dev]"`

## Development Workflow

1. Create a new branch: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Test your changes
4. Commit with clear messages
5. Push to your fork
6. Open a Pull Request

## Code Style

We use:
- **Black** for code formatting
- **Ruff** for linting
- **MyPy** for type checking

Run before committing:
```bash
black assistant_cli/
ruff check assistant_cli/
mypy assistant_cli/
```

## Testing

```bash
pytest tests/
```

## Adding New Tools

1. Create a new file in `assistant_cli/tools/`
2. Implement your tool class
3. Add intent patterns in `intent_parser.py`
4. Add execution logic in `executor.py`
5. Write tests
6. Update documentation

Example:
```python
# assistant_cli/tools/my_tool.py
from assistant_cli.models import ExecutionResult

class MyTool:
    def do_something(self, param: str) -> ExecutionResult:
        return ExecutionResult(
            success=True,
            message=f"Did something with {param}",
            data={"param": param}
        )
```

## Adding New Intent Patterns

```python
# In intent_parser.py
IntentPattern(
    intent=Intent.MY_NEW_INTENT,
    patterns=[r"do something", r"perform action"],
    param_extractors={"param": r"with\s+(\w+)"},
    defaults={"param": "default_value"},
    requires_confirmation=False
)
```

## Documentation

- Update README.md for user-facing changes
- Update ARCHITECTURE.md for architectural changes
- Add docstrings to all public functions
- Include examples in docstrings

## Commit Messages

Follow conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Maintenance tasks

Example: `feat: add browser automation support`

## Pull Request Guidelines

- Clear description of changes
- Reference related issues
- Include tests for new features
- Update documentation
- Ensure CI passes

## Areas for Contribution

### High Priority
- [ ] Ollama LLM integration
- [ ] Browser automation with Playwright
- [ ] Mouse/keyboard control with PyAutoGUI
- [ ] Windows and Linux platform support
- [ ] Comprehensive test suite

### Medium Priority
- [ ] Plugin system
- [ ] Configuration UI
- [ ] Voice input support
- [ ] Scheduled tasks
- [ ] Multi-language support

### Low Priority
- [ ] GUI wrapper
- [ ] Mobile companion app
- [ ] Cloud sync (optional)
- [ ] Marketplace for plugins

## Questions?

- Open an issue for bugs
- Start a discussion for feature ideas
- Join our community chat (coming soon)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
