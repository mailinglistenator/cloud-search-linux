"""System actions for opening files and folders across Linux desktop environments."""
import os
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional

def find_file_manager() -> Optional[str]:
    """Auto-detect the desktop file manager installed on this system."""
    managers = ["nemo", "nautilus", "dolphin", "thunar", "pcmanfm", "caja", "io.elementary.files"]
    for fm in managers:
        if shutil.which(fm):
            return fm
    return None

def open_file(path_str: str) -> Dict[str, Any]:
    """Open a file with the default system application via xdg-open."""
    path = Path(path_str)
    try:
        env = {**os.environ, "DISPLAY": os.environ.get("DISPLAY", ":0")}
        subprocess.Popen(
            ["xdg-open", str(path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
            start_new_session=True
        )
        return {"success": True, "message": f"Opening {path.name}..."}
    except Exception as e:
        return {"success": False, "error": str(e)}

def reveal_in_folder(path_str: str, is_dir: bool = False) -> Dict[str, Any]:
    """Reveal the containing folder (or folder itself if is_dir) in the desktop file manager."""
    path = Path(path_str)
    if is_dir:
        folder = path
    elif path.exists():
        folder = path if path.is_dir() else path.parent
    else:
        # Fallback when path cannot be stat'd directly
        folder = path if (path_str.endswith("/") or not path.suffix) else path.parent

    fm = find_file_manager()
    cmd = [fm, str(folder)] if fm else ["xdg-open", str(folder)]

    try:
        env = {**os.environ, "DISPLAY": os.environ.get("DISPLAY", ":0")}
        subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
            start_new_session=True
        )
        fm_name = fm.capitalize() if fm else "file manager"
        return {"success": True, "message": f"Opened folder in {fm_name}."}
    except Exception as e:
        return {"success": False, "error": str(e)}
