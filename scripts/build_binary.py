#!/usr/bin/env python3
"""
Build standalone Ubongo binary for the current platform.

Usage:
    python scripts/build_binary.py

Output:
    macOS:   dist/ubongo          (universal2 binary)
    Windows: dist/ubongo.exe
    Linux:   dist/ubongo
"""

import platform
import subprocess
import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "ubongo.spec"
DIST = ROOT / "dist"


def main():
    system = platform.system()
    print(f"Building Ubongo for {system}...")
    print(f"Python: {sys.version}")
    print(f"Spec:   {SPEC}")
    print()

    # Clean previous build
    for d in [ROOT / "build", DIST]:
        if d.exists():
            shutil.rmtree(d)
            print(f"Cleaned {d}")

    # Run PyInstaller
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--clean",
        "--noconfirm",
        str(SPEC),
    ]
    print(f"Running: {' '.join(cmd)}\n")
    result = subprocess.run(cmd, cwd=str(ROOT))

    if result.returncode != 0:
        print("\n✗ Build failed!")
        sys.exit(1)

    # Verify output
    binary_name = "ubongo.exe" if system == "Windows" else "ubongo"
    binary_path = DIST / binary_name

    if not binary_path.exists():
        print(f"\n✗ Expected binary not found at {binary_path}")
        sys.exit(1)

    size_mb = binary_path.stat().st_size / (1024 * 1024)
    print(f"\n✓ Built successfully!")
    print(f"  Binary: {binary_path}")
    print(f"  Size:   {size_mb:.1f} MB")
    print(f"  OS:     {system}")

    # Create versioned archive for release
    # Read version from __init__.py to avoid import issues
    version_file = ROOT / "assistant_cli" / "__init__.py"
    version = "0.2.1"  # fallback
    if version_file.exists():
        with open(version_file) as f:
            for line in f:
                if line.startswith("__version__"):
                    version = line.split("=")[1].strip().strip('"\'')
                    break
    arch = platform.machine().lower()
    os_name = {"Darwin": "macos", "Windows": "windows", "Linux": "linux"}.get(system, system.lower())
    archive_name = f"ubongo-{version}-{os_name}-{arch}"

    if system == "Windows":
        archive_path = DIST / f"{archive_name}.zip"
        import zipfile
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(binary_path, binary_name)
        print(f"  Archive: {archive_path}")
    else:
        archive_path = DIST / f"{archive_name}.tar.gz"
        import tarfile
        with tarfile.open(archive_path, "w:gz") as tf:
            tf.add(binary_path, arcname=binary_name)
        print(f"  Archive: {archive_path}")

    print(f"\nUsers can download and run:")
    if system == "Windows":
        print(f"  .\\ubongo.exe start")
    else:
        print(f"  chmod +x ubongo && ./ubongo start")


if __name__ == "__main__":
    main()
