from pathlib import Path
from typing import Optional, List, Dict, Any
import shutil
from datetime import datetime, timedelta
from assistant_cli.models import ExecutionResult
from assistant_cli.utils import logger
import os

class FileOperations:
    def __init__(self):
        self.desktop = Path.home() / "Desktop"
        self.documents = Path.home() / "Documents"
        self.downloads = Path.home() / "Downloads"
        self.home = Path.home()
        
        self.location_map = {
            "desktop": self.desktop,
            "documents": self.documents,
            "downloads": self.downloads,
            "home": self.home,
        }
    
    def create_folder(self, name: Optional[str] = None, location: str = "desktop") -> ExecutionResult:
        try:
            folder_name = name or "New Folder"
            base_path = self.location_map.get(location.lower(), self.desktop)
            
            folder_path = base_path / folder_name
            
            if folder_path.exists():
                counter = 1
                while (base_path / f"{folder_name} {counter}").exists():
                    counter += 1
                folder_path = base_path / f"{folder_name} {counter}"
                folder_name = f"{folder_name} {counter}"
            
            folder_path.mkdir(parents=True, exist_ok=True)
            
            logger.info("Created folder: %s", folder_path)
            
            return ExecutionResult(
                success=True,
                message=f"✓ Created '{folder_name}' on {location.capitalize()}",
                data={"path": str(folder_path), "name": folder_name, "location": location}
            )
        
        except Exception as e:
            logger.error("Failed to create folder: %s", str(e))
            return ExecutionResult(
                success=False,
                message=f"Failed to create folder",
                error=str(e)
            )
    
    def move_item(self, source: str, destination: str) -> ExecutionResult:
        try:
            source_path = Path(source)
            
            if destination.lower() in self.location_map:
                dest_path = self.location_map[destination.lower()] / source_path.name
            else:
                dest_path = Path(destination)
            
            if not source_path.exists():
                return ExecutionResult(
                    success=False,
                    message=f"Source path does not exist: {source}",
                    error="Source not found"
                )
            
            shutil.move(str(source_path), str(dest_path))
            
            logger.info("Moved %s to %s", source_path, dest_path)
            
            return ExecutionResult(
                success=True,
                message=f"✓ Moved to {dest_path.parent.name}",
                data={"source": str(source_path), "destination": str(dest_path)}
            )
        
        except Exception as e:
            logger.error("Failed to move item: %s", str(e))
            return ExecutionResult(
                success=False,
                message="Failed to move item",
                error=str(e)
            )
    
    def delete_item(self, path: str) -> ExecutionResult:
        try:
            item_path = Path(path)
            
            if not item_path.exists():
                return ExecutionResult(
                    success=False,
                    message=f"Path does not exist: {path}",
                    error="Path not found"
                )
            
            if item_path.is_dir():
                shutil.rmtree(item_path)
            else:
                item_path.unlink()
            
            logger.info("Deleted: %s", item_path)
            
            return ExecutionResult(
                success=True,
                message=f"✓ Deleted {item_path.name}",
                data={"path": str(item_path)}
            )
        
        except Exception as e:
            logger.error("Failed to delete item: %s", str(e))
            return ExecutionResult(
                success=False,
                message="Failed to delete item",
                error=str(e)
            )
    
    def sort_files_by_type(self, location: str = "downloads") -> ExecutionResult:
        """Sort files into category folders by extension. Returns rich context."""
        try:
            base = self.location_map.get(location.lower(), self.downloads)

            category_map = {
                "Images": [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".tiff", ".ico", ".heic"],
                "Documents": [".pdf", ".doc", ".docx", ".txt", ".rtf", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".odt", ".pages", ".numbers"],
                "Videos": [".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".webm"],
                "Audio": [".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a", ".wma"],
                "Archives": [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".dmg", ".iso"],
                "Code": [".py", ".js", ".ts", ".html", ".css", ".json", ".xml", ".sh", ".rb", ".java", ".c", ".cpp", ".go", ".rs"],
                "Installers": [".exe", ".msi", ".deb", ".rpm", ".pkg", ".app"],
            }

            # Create category folders
            for cat in category_map:
                (base / cat).mkdir(exist_ok=True)

            moved = {}
            skipped_files = []

            for item in base.iterdir():
                if item.is_dir():
                    continue
                if item.name.startswith('.'):
                    continue

                ext = item.suffix.lower()
                target_cat = None
                for cat, exts in category_map.items():
                    if ext in exts:
                        target_cat = cat
                        break

                if target_cat is None:
                    skipped_files.append(item.name)
                    continue

                dest = base / target_cat / item.name
                if dest.exists():
                    stem = item.stem
                    counter = 1
                    while dest.exists():
                        dest = base / target_cat / f"{stem}_{counter}{ext}"
                        counter += 1

                shutil.move(str(item), str(dest))
                moved[target_cat] = moved.get(target_cat, 0) + 1

            # Count existing files in each category folder
            existing = {}
            for cat in category_map:
                cat_path = base / cat
                if cat_path.is_dir():
                    count = sum(1 for f in cat_path.iterdir() if f.is_file())
                    if count > 0:
                        existing[cat] = count

            total_moved = sum(moved.values())
            total_existing = sum(existing.values())

            # Build rich message
            if total_moved > 0:
                lines = [f"✓ Sorted {total_moved} files:"]
                for cat, count in sorted(moved.items()):
                    lines.append(f"  • {cat}: {count} files")
                if skipped_files:
                    lines.append(f"  • {len(skipped_files)} files skipped (unknown type)")
                msg = "\n".join(lines)
            elif total_existing > 0:
                lines = ["Your files are already organized:"]
                for cat, count in sorted(existing.items()):
                    lines.append(f"  • {cat}: {count} files")
                if skipped_files:
                    lines.append(f"  • {len(skipped_files)} unsorted files remaining")
                msg = "\n".join(lines)
            else:
                msg = "No files to organize."
                if skipped_files:
                    msg += f" {len(skipped_files)} files with unknown types."

            return ExecutionResult(
                success=True,
                message=msg,
                data={
                    "moved": moved,
                    "total_moved": total_moved,
                    "existing": existing,
                    "total_existing": total_existing,
                    "skipped": len(skipped_files),
                    "skipped_files": skipped_files[:20],
                    "base_path": str(base),
                    "already_organized": total_moved == 0 and total_existing > 0,
                },
            )

        except Exception as e:
            logger.error("Failed to sort files: %s", str(e))
            return ExecutionResult(
                success=False,
                message="Failed to sort files",
                error=str(e),
            )

    def search_files(
        self,
        file_type: Optional[str] = None,
        time_range: Optional[str] = None,
        location: Optional[str] = None
    ) -> ExecutionResult:
        try:
            search_path = self.location_map.get(location.lower(), self.home) if location else self.home
            
            extensions_map = {
                "screenshot": [".png", ".jpg", ".jpeg"],
                "screenshots": [".png", ".jpg", ".jpeg"],
                "image": [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"],
                "images": [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"],
                "pdf": [".pdf"],
                "pdfs": [".pdf"],
                "document": [".doc", ".docx", ".txt", ".rtf"],
                "documents": [".doc", ".docx", ".txt", ".rtf"],
                "video": [".mp4", ".mov", ".avi", ".mkv"],
                "videos": [".mp4", ".mov", ".avi", ".mkv"],
            }
            
            extensions = extensions_map.get(file_type.lower(), []) if file_type else []
            
            cutoff_date = None
            if time_range:
                if "last week" in time_range.lower():
                    cutoff_date = datetime.now() - timedelta(days=7)
                elif "last month" in time_range.lower():
                    cutoff_date = datetime.now() - timedelta(days=30)
                elif "yesterday" in time_range.lower():
                    cutoff_date = datetime.now() - timedelta(days=1)
            
            found_files = []
            
            for root, dirs, files in os.walk(search_path):
                for file in files:
                    file_path = Path(root) / file
                    
                    if extensions and file_path.suffix.lower() not in extensions:
                        continue
                    
                    if cutoff_date:
                        file_mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                        if file_mtime < cutoff_date:
                            continue
                    
                    found_files.append(str(file_path))
            
            logger.info("Found %d files matching criteria", len(found_files))
            
            return ExecutionResult(
                success=True,
                message=f"✓ Found {len(found_files)} {file_type or 'file'}(s)",
                data={"files": found_files, "count": len(found_files)}
            )
        
        except Exception as e:
            logger.error("Failed to search files: %s", str(e))
            return ExecutionResult(
                success=False,
                message="Failed to search files",
                error=str(e)
            )
