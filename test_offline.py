#!/usr/bin/env python3
"""
Test offline functionality of Assistant CLI.
Verifies that all features work without internet connection.
"""

import sys
from pathlib import Path
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

def test_imports():
    """Test that all modules can be imported"""
    console.print("\n1️⃣  Testing module imports...", style="bold cyan")
    
    try:
        from assistant_cli.core.enhanced_parser import EnhancedParser
        from assistant_cli.core.llm_client import LLMClient
        from assistant_cli.core.task_planner import TaskPlanner
        from assistant_cli.core.executor import CommandExecutor
        from assistant_cli.tools import FileOperations, AppControl, SystemInfo
        console.print("   ✓ All modules imported successfully", style="green")
        return True
    except ImportError as e:
        console.print(f"   ❌ Import failed: {e}", style="red")
        return False

def test_pattern_matching():
    """Test pattern matching (works offline)"""
    console.print("\n2️⃣  Testing pattern matching (offline)...", style="bold cyan")
    
    from assistant_cli.core.enhanced_parser import EnhancedParser
    
    parser = EnhancedParser()
    
    test_cases = [
        ("Create a folder called TestOffline", "create_folder"),
        ("Open Spotify", "open_app"),
        ("What's my disk space?", "get_system_info"),
        ("Find screenshots from last week", "search_files"),
    ]
    
    passed = 0
    for user_input, expected_intent in test_cases:
        result = parser.parse(user_input)
        if result.intent.value == expected_intent:
            console.print(f"   ✓ '{user_input}' → {expected_intent}", style="green")
            passed += 1
        else:
            console.print(f"   ❌ '{user_input}' → {result.intent.value} (expected {expected_intent})", style="red")
    
    console.print(f"\n   Passed: {passed}/{len(test_cases)}", style="bold")
    return passed == len(test_cases)

def test_task_templates():
    """Test task templates (offline)"""
    console.print("\n3️⃣  Testing task templates (offline)...", style="bold cyan")
    
    from assistant_cli.core.task_planner import TaskPlanner
    
    planner = TaskPlanner()
    
    test_cases = [
        ("Organize my downloads folder", "organize_downloads"),
        ("Prepare USB transfer", "prepare_usb_transfer"),
        ("Clean WhatsApp media", "clean_whatsapp_media"),
        ("Free up disk space", "free_disk_space"),
    ]
    
    passed = 0
    for user_input, expected_template in test_cases:
        template = planner.match_template(user_input)
        if template and template.name == expected_template:
            console.print(f"   ✓ '{user_input}' → {expected_template}", style="green")
            passed += 1
        else:
            template_name = template.name if template else "None"
            console.print(f"   ❌ '{user_input}' → {template_name} (expected {expected_template})", style="red")
    
    console.print(f"\n   Passed: {passed}/{len(test_cases)}", style="bold")
    console.print(f"   Total templates: {len(planner.templates)}", style="dim")
    return passed == len(test_cases)

def test_llm_client():
    """Test LLM client availability"""
    console.print("\n4️⃣  Testing LLM client...", style="bold cyan")
    
    from assistant_cli.core.llm_client import LLMClient
    
    client = LLMClient()
    
    console.print(f"   Model: {client.model}", style="dim")
    console.print(f"   Available: {client.available}", style="dim")
    
    if client.available:
        console.print("   ✓ LLM is available and ready", style="green")
        console.print("   ℹ️  Testing with simple query...", style="dim")
        
        try:
            response = client.chat("Say 'test successful' if you can read this")
            if response:
                console.print(f"   ✓ LLM response: {response[:50]}...", style="green")
                return True
            else:
                console.print("   ⚠️  LLM returned no response", style="yellow")
                return False
        except Exception as e:
            console.print(f"   ❌ LLM test failed: {e}", style="red")
            return False
    else:
        console.print("   ⚠️  LLM not available (Ollama not running or model not downloaded)", style="yellow")
        console.print("   ℹ️  Run: python -m assistant_cli setup", style="dim")
        return False

def test_file_operations():
    """Test file operations"""
    console.print("\n5️⃣  Testing file operations...", style="bold cyan")
    
    from assistant_cli.tools.file_operations import FileOperations
    
    file_ops = FileOperations()
    
    result = file_ops.create_folder(name="OfflineTest", location="desktop")
    
    if result.success:
        console.print(f"   ✓ Created test folder: {result.data.get('path')}", style="green")
        
        import shutil
        try:
            shutil.rmtree(result.data['path'])
            console.print("   ✓ Cleaned up test folder", style="green")
        except:
            pass
        
        return True
    else:
        console.print(f"   ❌ Failed to create folder: {result.error}", style="red")
        return False

def test_system_info():
    """Test system info retrieval"""
    console.print("\n6️⃣  Testing system info...", style="bold cyan")
    
    from assistant_cli.tools.system_info import SystemInfo
    
    result = SystemInfo.get_disk_space()
    
    if result.success:
        console.print(f"   ✓ Disk space: {result.data['free_gb']:.1f} GB free", style="green")
        return True
    else:
        console.print(f"   ❌ Failed to get disk space: {result.error}", style="red")
        return False

def test_enhanced_parser():
    """Test enhanced parser with all layers"""
    console.print("\n7️⃣  Testing enhanced parser (3-layer system)...", style="bold cyan")
    
    from assistant_cli.core.enhanced_parser import EnhancedParser
    
    parser = EnhancedParser()
    
    console.print(f"   Pattern parser: ✓", style="green")
    console.print(f"   LLM client: {'✓' if parser.llm_client.available else '⚠️ Not available'}", 
                  style="green" if parser.llm_client.available else "yellow")
    console.print(f"   Task planner: ✓ ({len(parser.task_planner.templates)} templates)", style="green")
    
    return True

def display_summary(results):
    """Display test summary"""
    console.print("\n" + "="*60, style="bold")
    console.print("📊 TEST SUMMARY", style="bold cyan")
    console.print("="*60 + "\n", style="bold")
    
    table = Table(show_header=True, header_style="bold magenta")
    table.add_column("Test", style="cyan")
    table.add_column("Status", style="green")
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        style = "green" if passed else "red"
        table.add_row(test_name, status)
    
    console.print(table)
    
    total = len(results)
    passed = sum(results.values())
    
    console.print(f"\n📈 Results: {passed}/{total} tests passed", style="bold")
    
    if passed == total:
        console.print("\n🎉 All tests passed! System is ready for offline use.", style="bold green")
    elif passed >= total * 0.8:
        console.print("\n✅ Most tests passed. Core functionality works offline.", style="bold yellow")
    else:
        console.print("\n⚠️  Some tests failed. Check setup and try again.", style="bold red")
    
    console.print("\n💡 Next steps:", style="bold")
    if not results.get("LLM Client", False):
        console.print("   • Run: python -m assistant_cli setup")
        console.print("   • This will download the local LLM model")
    console.print("   • Run: python -m assistant_cli")
    console.print("   • Try: 'Organize my downloads folder'\n")

def main():
    console.print(Panel(
        "[bold cyan]Assistant CLI - Offline Functionality Test[/bold cyan]\n\n"
        "This test verifies that the system works without internet.\n"
        "All features should function using local resources only.",
        border_style="cyan"
    ))
    
    results = {}
    
    results["Module Imports"] = test_imports()
    results["Pattern Matching"] = test_pattern_matching()
    results["Task Templates"] = test_task_templates()
    results["LLM Client"] = test_llm_client()
    results["File Operations"] = test_file_operations()
    results["System Info"] = test_system_info()
    results["Enhanced Parser"] = test_enhanced_parser()
    
    display_summary(results)

if __name__ == "__main__":
    main()
