# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for the ubongo local backend server.

Produces a single-folder bundle at `desktop/src-tauri/binaries/ubongo-server/`
containing the Python interpreter + all site-packages + assistant_cli.
Tauri picks this up as a sidecar and spawns it at app launch.

Build:
  cd ubongo.os/
  pyinstaller desktop/server/ubongo-server.spec --noconfirm

Why one-folder (not one-file):
  * Faster launch (no unpack-to-tempdir step)
  * Easier code-signing on macOS (each binary signed individually)
  * LanceDB / PyArrow native libs work more reliably
"""

from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_submodules

# ── Paths ─────────────────────────────────────────────────────────────────
REPO_ROOT = Path(SPECPATH).resolve().parent.parent  # ubongo.os/
SERVER    = str(REPO_ROOT / "desktop" / "server" / "server.py")

# ── Collect everything from heavy deps so PyInstaller doesn't miss data ──
datas, binaries, hiddenimports = [], [], []

# The server can't start without these. A missing one fails the build here
# rather than shipping an app whose server crashes on launch.
# (Install them with `pip install -r requirements.txt` before building.)
import importlib.util

REQUIRED = [
    "anthropic",
    "fastapi",
    "uvicorn",
    "starlette",
    "pydantic",
    "pydantic_settings",
    "watchdog",
    "pypdf",              # text inside PDFs
    "multipart",          # python-multipart (FastAPI File/Form for /transcribe)
    "httpx",              # async HTTP client used by /transcribe forwarding
]
missing = [pkg for pkg in REQUIRED if importlib.util.find_spec(pkg) is None]
if missing:
    raise SystemExit(
        f"[spec] missing required packages: {', '.join(missing)} — "
        "run `pip install -r requirements.txt` first"
    )

for pkg in REQUIRED:
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

# Optional — web search degrades gracefully without it
for pkg in ["duckduckgo_search"]:
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        print(f"[spec] optional dep {pkg!r} not bundled")

# Our own code
hiddenimports += collect_submodules("assistant_cli")

# Include the assistant_cli source as data (so the package is importable
# from PYTHONPATH even if collect_submodules missed a dynamic import)
datas += [(str(REPO_ROOT / "assistant_cli"), "assistant_cli")]


block_cipher = None

a = Analysis(
    [SERVER],
    pathex=[str(REPO_ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # We don't need these in a headless server
        "tkinter",
        "matplotlib",
        "PIL.ImageShow",
        "IPython",
        "jupyter",
        "notebook",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ubongo-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,         # UPX breaks macOS signing
    console=True,      # keep stdout/stderr visible when the Tauri parent captures it
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,  # use host arch (arm64 on Apple Silicon, x86_64 on Intel)
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="ubongo-server",
)
