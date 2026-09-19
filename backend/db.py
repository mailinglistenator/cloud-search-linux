"""Database manager for Cloud Search Linux with SQLite FTS5."""
import os
import re
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from config import DB_PATH, REMOTES

TYPE_EXTENSIONS = {
    "docs": {"pdf", "doc", "docx", "txt", "rtf", "odt", "xls", "xlsx", "ppt", "pptx", "csv", "md", "epub"},
    "images": {"jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "psd", "tiff", "ico", "raw"},
    "audio": {"mp3", "wav", "flac", "m4a", "aac", "ogg", "opus", "wma", "mid", "midi"},
    "videos": {"mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg"},
    "archives": {"zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz", "iso"},
    "code": {"py", "js", "html", "css", "json", "xml", "yml", "yaml", "sh", "c", "cpp", "h", "rs", "go", "ts"}
}

def get_db() -> sqlite3.Connection:
    """Get optimized SQLite connection."""
    con = sqlite3.connect(str(DB_PATH), timeout=30.0)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode = WAL;")
    con.execute("PRAGMA synchronous = NORMAL;")
    con.execute("PRAGMA foreign_keys = ON;")
    return con

def init_db():
    """Initialize database tables, triggers, and FTS5 index."""
    con = get_db()
    with con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS remotes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            mount_path TEXT NOT NULL,
            last_synced_at TEXT,
            item_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            remote_id TEXT NOT NULL,
            rel_path TEXT NOT NULL,
            filename TEXT NOT NULL,
            extension TEXT,
            size INTEGER DEFAULT 0,
            mtime TEXT,
            is_dir INTEGER DEFAULT 0,
            parent_path TEXT DEFAULT ''
        );
        """)

        # Migration: ensure is_dir and parent_path columns exist
        try:
            con.execute("ALTER TABLE files ADD COLUMN is_dir INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass

        try:
            con.execute("ALTER TABLE files ADD COLUMN parent_path TEXT DEFAULT ''")
        except sqlite3.OperationalError:
            pass

        con.executescript("""
        CREATE INDEX IF NOT EXISTS idx_files_remote ON files(remote_id);
        CREATE INDEX IF NOT EXISTS idx_files_ext ON files(extension);
        CREATE INDEX IF NOT EXISTS idx_files_is_dir ON files(is_dir);
        CREATE INDEX IF NOT EXISTS idx_files_parent ON files(remote_id, parent_path);

        CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
            filename,
            rel_path,
            extension,
            remote_id UNINDEXED,
            content='files',
            content_rowid='id'
        );

        CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
            INSERT INTO files_fts(rowid, filename, rel_path, extension, remote_id)
            VALUES (new.id, new.filename, new.rel_path, new.extension, new.remote_id);
        END;

        CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
            INSERT INTO files_fts(files_fts, rowid, filename, rel_path, extension, remote_id)
            VALUES('delete', old.id, old.filename, old.rel_path, old.extension, old.remote_id);
        END;

        CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
            INSERT INTO files_fts(files_fts, rowid, filename, rel_path, extension, remote_id)
            VALUES('delete', old.id, old.filename, old.rel_path, old.extension, old.remote_id);
            INSERT INTO files_fts(rowid, filename, rel_path, extension, remote_id)
            VALUES (new.id, new.filename, new.rel_path, new.extension, new.remote_id);
        END;
        """)

        # Ensure remotes exist in table
        for r_id, r_info in REMOTES.items():
            con.execute(
                "INSERT OR IGNORE INTO remotes (id, name, mount_path) VALUES (?, ?, ?)",
                (r_id, r_info["name"], str(r_info["mount_path"]))
            )

        # Migration: populate parent_path for existing rows if needed
        try:
            need_migration = con.execute("SELECT 1 FROM files WHERE instr(rel_path, '/') > 0 AND (parent_path IS NULL OR parent_path = '') LIMIT 1").fetchone()
            if need_migration:
                print("[db] Migrating database: calculating parent_path for Cloud Explorer...")
                con.execute("""
                    UPDATE files
                    SET parent_path = substr(rel_path, 1, length(rel_path) - length(filename) - 1)
                    WHERE instr(rel_path, '/') > 0 AND (parent_path IS NULL OR parent_path = '')
                """)
                print("[db] Migration complete!")
        except Exception as e:
            print(f"[db] Migration check: {e}")

def clean_fts_query(raw_query: str) -> str:
    """Format raw query tokens into safe, prefix-matching SQLite FTS5 syntax."""
    # Remove special FTS punctuation characters
    sanitized = re.sub(r'[^\w\s\.-]', ' ', raw_query, flags=re.UNICODE)
    tokens = sanitized.split()
    if not tokens:
        return ""

    clauses = []
    for token in tokens:
        token = token.strip(".-")
        if not token:
            continue
        # Prefix match for instant search-as-you-type
        safe = token.replace('"', '""')
        clauses.append(f'"{safe}"*')

    return " AND ".join(clauses)

def format_file_size(bytes_val: int, is_dir: bool = False) -> str:
    """Format file bytes into human-readable size or Folder label."""
    if is_dir:
        return "Folder"
    if not bytes_val or bytes_val <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    val = float(bytes_val)
    while val >= 1024.0 and i < len(units) - 1:
        val /= 1024.0
        i += 1
    return f"{val:.1f} {units[i]}" if i > 0 else f"{int(val)} B"

def search_files(
    query: str = "",
    remote_id: Optional[str] = None,
    file_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]:
    """Execute high-speed search with FTS5 ranking and file/folder filters."""
    con = get_db()
    query = (query or "").strip()

    # Support 'folder:' or 'dir:' search prefix syntax
    if query.lower().startswith("folder:"):
        file_type = "folders"
        query = query[7:].strip()
    elif query.lower().startswith("dir:"):
        file_type = "folders"
        query = query[4:].strip()

    where_clauses = []
    params = []

    if remote_id and remote_id in REMOTES:
        where_clauses.append("files.remote_id = ?")
        params.append(remote_id)

    if file_type == "folders":
        where_clauses.append("files.is_dir = 1")
    elif file_type and file_type in TYPE_EXTENSIONS:
        exts = TYPE_EXTENSIONS[file_type]
        placeholders = ",".join(["?"] * len(exts))
        where_clauses.append(f"files.is_dir = 0 AND files.extension IN ({placeholders})")
        params.extend(list(exts))

    fts_query = clean_fts_query(query)
    start_time = time.perf_counter()

    try:
        if fts_query:
            # FTS5 match query with ranking
            match_where = "files_fts MATCH ?"
            all_where = [match_where] + where_clauses
            where_sql = " AND ".join(all_where)
            sql = f"""
                SELECT files.id, files.remote_id, files.rel_path, files.filename,
                       files.extension, files.size, files.mtime, files.is_dir, bm25(files_fts) as rank
                FROM files_fts
                JOIN files ON files.id = files_fts.rowid
                WHERE {where_sql}
                ORDER BY rank
                LIMIT ? OFFSET ?
            """
            query_params = [fts_query] + params
            cur = con.execute(sql, query_params + [limit + 1, offset])
            rows = cur.fetchall()
            if len(rows) > limit:
                rows = rows[:limit]
                total_count = f"{limit}+"
            else:
                total_count = len(rows) + offset
        else:
            # Empty query -> return recently modified or default ordered
            where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
            sql = f"""
                SELECT files.id, files.remote_id, files.rel_path, files.filename,
                       files.extension, files.size, files.mtime, files.is_dir, 0 as rank
                FROM files
                {where_sql}
                ORDER BY files.mtime DESC, files.id DESC
                LIMIT ? OFFSET ?
            """
            count_sql = f"SELECT COUNT(*) FROM files {where_sql}"
            query_params = params
            cur = con.execute(sql, query_params + [limit, offset])
            rows = cur.fetchall()
            cur_count = con.execute(count_sql, query_params)
            total_count = cur_count.fetchone()[0]

    except sqlite3.OperationalError:
        # Fallback to simple LIKE search if FTS syntax edge case
        like_pattern = f"%{query}%"
        where_clauses.append("(files.filename LIKE ? OR files.rel_path LIKE ?)")
        params.extend([like_pattern, like_pattern])
        where_sql = "WHERE " + " AND ".join(where_clauses)
        sql = f"""
            SELECT files.id, files.remote_id, files.rel_path, files.filename,
                   files.extension, files.size, files.mtime, files.is_dir, 0 as rank
            FROM files
            {where_sql}
            LIMIT ? OFFSET ?
        """
        cur = con.execute(sql, params + [limit + 1, offset])
        rows = cur.fetchall()
        if len(rows) > limit:
            rows = rows[:limit]
            total_count = f"{limit}+"
        else:
            total_count = len(rows) + offset

    elapsed_ms = (time.perf_counter() - start_time) * 1000

    # Check mounted remotes once to avoid per-file FUSE stat overhead
    mounted_remotes = {
        r_id: Path(conf.get("mount_path", "")).exists()
        for r_id, conf in REMOTES.items()
    }

    results = []
    for r in rows:
        r_id = r["remote_id"]
        remote_conf = REMOTES.get(r_id, {})
        mount_path = Path(remote_conf.get("mount_path", ""))
        full_local_path = mount_path / r["rel_path"]
        is_dir = bool(r["is_dir"])

        results.append({
            "id": r["id"],
            "remote_id": r_id,
            "remote_name": remote_conf.get("name", r_id),
            "remote_color": remote_conf.get("color", "#888"),
            "badge_bg": remote_conf.get("badge_bg", "rgba(255,255,255,0.1)"),
            "rel_path": r["rel_path"],
            "filename": r["filename"],
            "extension": "folder" if is_dir else (r["extension"] or ""),
            "size": r["size"],
            "size_formatted": format_file_size(r["size"], is_dir=is_dir),
            "mtime": r["mtime"] or "",
            "local_path": str(full_local_path),
            "is_dir": is_dir,
            "is_mounted": mounted_remotes.get(r_id, False)
        })

    return {
        "results": results,
        "total": total_count,
        "query": query,
        "elapsed_ms": round(elapsed_ms, 2),
        "limit": limit,
        "offset": offset
    }

def get_stats() -> Dict[str, Any]:
    """Get overview statistics for indexed remotes and total files."""
    con = get_db()
    cur = con.execute("SELECT id, name, mount_path, last_synced_at, item_count FROM remotes")
    remotes_data = []
    total_files = 0

    for row in cur.fetchall():
        r_id = row["id"]
        remote_conf = REMOTES.get(r_id, {})
        remotes_data.append({
            "id": r_id,
            "name": row["name"],
            "mount_path": row["mount_path"],
            "last_synced_at": row["last_synced_at"],
            "item_count": row["item_count"],
            "color": remote_conf.get("color", "#888"),
            "badge_bg": remote_conf.get("badge_bg", "rgba(255,255,255,0.1)"),
            "is_mounted": Path(row["mount_path"]).is_mount() or Path(row["mount_path"]).exists()
        })
        total_files += row["item_count"]

    return {
        "total_files": total_files,
        "remotes": remotes_data
    }

def get_folder_contents(remote_id: str, folder_path: str = "") -> Dict[str, Any]:
    """Get contents of a specific folder for Cloud Explorer browsing."""
    start_time = time.perf_counter()
    con = get_db()

    folder_path = (folder_path or "").strip("/\\")

    remote_conf = REMOTES.get(remote_id)
    if not remote_conf and REMOTES:
        remote_id = list(REMOTES.keys())[0]
        remote_conf = REMOTES[remote_id]

    remote_name = remote_conf.get("name", remote_id) if remote_conf else remote_id
    mount_path = Path(remote_conf.get("mount_path", "")) if remote_conf else Path("")
    is_mounted = mount_path.is_mount() or mount_path.exists()

    cur = con.execute("""
        SELECT id, remote_id, rel_path, filename, extension, size, mtime, is_dir, parent_path
        FROM files
        WHERE remote_id = ? AND parent_path = ?
        ORDER BY is_dir DESC, filename COLLATE NOCASE ASC
    """, (remote_id, folder_path))

    rows = cur.fetchall()

    items = []
    folder_count = 0
    file_count = 0
    total_size = 0

    for r in rows:
        is_dir = bool(r["is_dir"])
        if is_dir:
            folder_count += 1
        else:
            file_count += 1
            total_size += (r["size"] or 0)

        full_local_path = mount_path / r["rel_path"] if mount_path else Path(r["rel_path"])

        items.append({
            "id": r["id"],
            "remote_id": remote_id,
            "filename": r["filename"],
            "rel_path": r["rel_path"],
            "parent_path": r["parent_path"],
            "extension": "folder" if is_dir else (r["extension"] or ""),
            "size": r["size"] or 0,
            "size_formatted": format_file_size(r["size"] or 0, is_dir=is_dir),
            "mtime": r["mtime"] or "",
            "local_path": str(full_local_path),
            "is_dir": is_dir,
            "is_mounted": is_mounted
        })

    # Clickable breadcrumbs
    breadcrumbs = [{"name": remote_name, "path": "", "is_root": True}]
    if folder_path:
        parts = folder_path.split("/")
        accum = []
        for p in parts:
            accum.append(p)
            breadcrumbs.append({
                "name": p,
                "path": "/".join(accum),
                "is_root": False
            })

    parent_of_current = os.path.dirname(folder_path) if "/" in folder_path else ("" if folder_path else None)
    elapsed_ms = (time.perf_counter() - start_time) * 1000

    return {
        "remote_id": remote_id,
        "remote_name": remote_name,
        "remote_color": remote_conf.get("color", "#0078d4") if remote_conf else "#0078d4",
        "current_path": folder_path,
        "parent_path": parent_of_current,
        "breadcrumbs": breadcrumbs,
        "items": items,
        "folder_count": folder_count,
        "file_count": file_count,
        "total_size_formatted": format_file_size(total_size, is_dir=False),
        "is_mounted": is_mounted,
        "elapsed_ms": round(elapsed_ms, 2)
    }
