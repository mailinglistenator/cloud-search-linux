"""Background streaming indexer for cloud remotes via rclone metadata APIs."""
import os
import sqlite3
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from config import REMOTES
from db import get_db

_sync_lock = threading.Lock()
_sync_status = {
    "is_syncing": False,
    "current_remote": None,
    "current_remote_name": None,
    "progress_count": 0,
    "total_remotes": 0,
    "completed_remotes": 0,
    "last_error": None,
    "start_time": None
}

def get_sync_status() -> Dict[str, Any]:
    """Return live indexing status."""
    with _sync_lock:
        return dict(_sync_status)

def sync_remote(remote_id: str) -> Dict[str, Any]:
    """Index all files and folders for a single cloud remote via rclone."""
    if remote_id not in REMOTES:
        return {"success": False, "error": f"Unknown remote: {remote_id}"}

    remote = REMOTES[remote_id]
    rclone_remote = remote["rclone_remote"]

    with _sync_lock:
        _sync_status["current_remote"] = remote_id
        _sync_status["current_remote_name"] = remote["name"]
        _sync_status["progress_count"] = 0
        _sync_status["last_error"] = None

    cmd = [
        "rclone", "lsf",
        "-R",
        "--fast-list",
        "--format", "tsp",
        rclone_remote
    ]

    print(f"[indexer] Starting sync for {remote['name']} ({rclone_remote})...")
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    con = get_db()
    batch_size = 1000
    batch = []
    total_indexed = 0

    try:
        # Clear existing entries for this remote before streaming new ones
        with con:
            con.execute("DELETE FROM files WHERE remote_id = ?", (remote_id,))

        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue

            parts = line.split(";", 2)
            if len(parts) == 3:
                mtime_str, size_str, rel_path = parts
                is_dir = 1 if (rel_path.endswith("/") or size_str == "-1") else 0
                rel_path = rel_path.rstrip("/")
                if not rel_path:
                    continue

                size = int(size_str) if (size_str.isdigit() and size_str != "-1") else 0
                filename = os.path.basename(rel_path)
                ext = "folder" if is_dir else (filename.rsplit(".", 1)[-1].lower() if "." in filename else "")

                # Format mtime to ISO string if possible
                try:
                    dt = datetime.fromisoformat(mtime_str.replace("Z", "+00:00"))
                    mtime = dt.strftime("%Y-%m-%d %H:%M:%S")
                except Exception:
                    mtime = mtime_str[:19].replace("T", " ")

                batch.append((remote_id, rel_path, filename, ext, size, mtime, is_dir))
                total_indexed += 1

                if len(batch) >= batch_size:
                    with con:
                        con.executemany(
                            """
                            INSERT INTO files (remote_id, rel_path, filename, extension, size, mtime, is_dir)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            """,
                            batch
                        )
                    batch.clear()
                    with _sync_lock:
                        _sync_status["progress_count"] = total_indexed

        if batch:
            with con:
                con.executemany(
                    """
                    INSERT INTO files (remote_id, rel_path, filename, extension, size, mtime, is_dir)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    batch
                )

        proc.wait()
        if proc.returncode != 0:
            err = proc.stderr.read()
            print(f"[indexer] rclone warning/error for {remote['name']}: {err}")

        # Update remotes table
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with con:
            con.execute(
                "UPDATE remotes SET last_synced_at = ?, item_count = ? WHERE id = ?",
                (now_str, total_indexed, remote_id)
            )

        print(f"[indexer] Synced {total_indexed:,} items for {remote['name']}.")
        return {"success": True, "count": total_indexed}

    except Exception as e:
        print(f"[indexer] Sync failed for {remote['name']}: {e}")
        with _sync_lock:
            _sync_status["last_error"] = str(e)
        return {"success": False, "error": str(e)}

def run_full_sync():
    """Sync all configured cloud remotes in background."""
    with _sync_lock:
        if _sync_status["is_syncing"]:
            return
        _sync_status["is_syncing"] = True
        _sync_status["total_remotes"] = len(REMOTES)
        _sync_status["completed_remotes"] = 0
        _sync_status["start_time"] = time.time()

    def worker():
        try:
            for r_id in REMOTES.keys():
                sync_remote(r_id)
                with _sync_lock:
                    _sync_status["completed_remotes"] += 1
        finally:
            with _sync_lock:
                _sync_status["is_syncing"] = False
                _sync_status["current_remote"] = None
                _sync_status["current_remote_name"] = None

    t = threading.Thread(target=worker, daemon=True)
    t.start()

def trigger_sync(remote_id: Optional[str] = None) -> bool:
    """Trigger background sync for all remotes or a specific one."""
    with _sync_lock:
        if _sync_status["is_syncing"]:
            return False

    if remote_id and remote_id in REMOTES:
        def worker():
            with _sync_lock:
                _sync_status["is_syncing"] = True
                _sync_status["total_remotes"] = 1
                _sync_status["completed_remotes"] = 0
                _sync_status["start_time"] = time.time()
            try:
                sync_remote(remote_id)
            finally:
                with _sync_lock:
                    _sync_status["is_syncing"] = False
                    _sync_status["completed_remotes"] = 1
                    _sync_status["current_remote"] = None
                    _sync_status["current_remote_name"] = None

        t = threading.Thread(target=worker, daemon=True)
        t.start()
        return True
    else:
        run_full_sync()
        return True
