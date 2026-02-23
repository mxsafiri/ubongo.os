# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Ubongo OS — builds standalone binary.

Usage:
    macOS:   pyinstaller ubongo.spec
    Windows: pyinstaller ubongo.spec
"""

import platform
import sys
from pathlib import Path

block_cipher = None
system = platform.system()

a = Analysis(
    ['assistant_cli/__main__.py'],
    pathex=['.'],
    binaries=[],
    datas=[],
    hiddenimports=[
        'assistant_cli',
        'assistant_cli.main',
        'assistant_cli.cli',
        'assistant_cli.config',
        'assistant_cli.models',
        'assistant_cli.setup_wizard',
        'assistant_cli.core',
        'assistant_cli.core.conversation_engine',
        'assistant_cli.core.enhanced_parser',
        'assistant_cli.core.executor',
        'assistant_cli.core.intent_parser',
        'assistant_cli.core.knowledge_base',
        'assistant_cli.core.conversation',
        'assistant_cli.core.context_manager',
        'assistant_cli.core.llm_client',
        'assistant_cli.core.quick_answer',
        'assistant_cli.core.smart_matcher',
        'assistant_cli.core.task_planner',
        'assistant_cli.tools',
        'assistant_cli.tools.app_control',
        'assistant_cli.tools.file_operations',
        'assistant_cli.tools.system_info',
        'assistant_cli.tools.platform_bridge',
        'assistant_cli.tools.applescript_automation',
        'assistant_cli.tools.windows_automation',
        'assistant_cli.tools.screen_control',
        'assistant_cli.tools.browser_automation',
        'assistant_cli.ui',
        'assistant_cli.ui.intro_animation',
        'assistant_cli.utils',
        'assistant_cli.utils.logger',
        'rich',
        'typer',
        'psutil',
        'pydantic',
        'pydantic_settings',
        'ollama',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'numpy',
        'scipy',
        'PIL',
        'cv2',
        'pytest',
        'black',
        'ruff',
        'mypy',
    ],
    noarchive=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='ubongo',
    debug=False,
    bootloader_ignore_signals=False,
    strip=(system == 'Darwin'),
    upx=True,
    console=True,
)
