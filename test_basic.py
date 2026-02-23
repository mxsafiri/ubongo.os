#!/usr/bin/env python3
"""
Quick test script to verify basic functionality without running the full CLI.
"""

from assistant_cli.core.intent_parser import IntentParser
from assistant_cli.core.executor import CommandExecutor
from assistant_cli.models import Intent

def test_intent_parsing():
    print("🧪 Testing Intent Parser...\n")
    
    parser = IntentParser()
    
    test_cases = [
        "Create a folder called TestProject on my desktop",
        "Open Spotify",
        "What's my disk space?",
        "Find all screenshots from last week",
        "Move it to Documents",
    ]
    
    for test_input in test_cases:
        result = parser.parse(test_input)
        print(f"Input: {test_input}")
        print(f"  Intent: {result.intent}")
        print(f"  Params: {result.params}")
        print(f"  Confidence: {result.confidence}")
        print()

def test_file_operations():
    print("🧪 Testing File Operations...\n")
    
    executor = CommandExecutor()
    
    from assistant_cli.models import ParsedCommand
    
    command = ParsedCommand(
        intent=Intent.CREATE_FOLDER,
        params={"name": "TestFolder", "location": "desktop"},
        confidence=1.0,
        raw_input="test"
    )
    
    result = executor.execute(command)
    print(f"Create Folder Result:")
    print(f"  Success: {result.success}")
    print(f"  Message: {result.message}")
    print(f"  Data: {result.data}")
    print()

def test_system_info():
    print("🧪 Testing System Info...\n")
    
    executor = CommandExecutor()
    
    from assistant_cli.models import ParsedCommand
    
    command = ParsedCommand(
        intent=Intent.GET_SYSTEM_INFO,
        params={},
        confidence=1.0,
        raw_input="what's my disk space"
    )
    
    result = executor.execute(command)
    print(f"System Info Result:")
    print(f"  Success: {result.success}")
    print(f"  Message: {result.message}")
    print()

if __name__ == "__main__":
    print("=" * 60)
    print("Assistant CLI - Basic Functionality Test")
    print("=" * 60)
    print()
    
    try:
        test_intent_parsing()
        test_file_operations()
        test_system_info()
        
        print("✅ All basic tests completed!")
        print("\nTo run the full CLI, use: python -m assistant_cli")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
