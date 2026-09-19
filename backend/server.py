"""Embedded concurrent HTTP server and REST API for Cloud Search Linux."""
import json
import os
import sys
import urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

from config import PORT, HOST, WEB_DIR, ASSETS_DIR
from db import init_db, search_files, get_stats, get_folder_contents
from indexer import trigger_sync, get_sync_status
from actions import open_file, reveal_in_folder

class CloudSearchHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def address_string(self):
        # Override to avoid reverse DNS lookup delay on Linux
        return str(self.client_address[0])

    def log_message(self, format, *args):
        # Suppress request logs in console
        pass

    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)

        # Asset requests
        if path.startswith("/assets/"):
            rel_asset = path[len("/assets/"):]
            asset_path = ASSETS_DIR / rel_asset
            if asset_path.exists() and asset_path.is_file():
                self.send_response(200)
                if asset_path.suffix == ".svg":
                    self.send_header("Content-Type", "image/svg+xml")
                elif asset_path.suffix == ".png":
                    self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(asset_path.stat().st_size))
                self.end_headers()
                with open(asset_path, "rb") as f:
                    self.wfile.write(f.read())
                return
            else:
                self.send_error(404, "Asset Not Found")
                return

        # API Endpoints
        if path == "/api/search":
            q = query.get("q", [""])[0]
            remote = query.get("remote", [None])[0]
            file_type = query.get("type", [None])[0]
            limit = int(query.get("limit", [100])[0])
            offset = int(query.get("offset", [0])[0])

            res = search_files(
                query=q,
                remote_id=remote,
                file_type=file_type,
                limit=limit,
                offset=offset
            )
            self._send_json(res)
            return

        elif path == "/api/ping":
            self._send_json({"pong": True})
            return

        elif path == "/api/stats":
            self._send_json(get_stats())
            return

        elif path == "/api/sync/status":
            self._send_json(get_sync_status())
            return

        elif path == "/api/browse":
            remote = query.get("remote", [""])[0]
            folder_path = query.get("path", [""])[0]
            res = get_folder_contents(remote_id=remote, folder_path=folder_path)
            self._send_json(res)
            return

        # Static files
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self._read_json_body()

        if path == "/api/sync":
            remote_id = body.get("remote_id")
            started = trigger_sync(remote_id)
            self._send_json({"started": started, "status": get_sync_status()})
            return

        elif path == "/api/open":
            local_path = body.get("path", "")
            is_dir = bool(body.get("is_dir", False))
            if is_dir:
                res = reveal_in_folder(local_path, is_dir=True)
            else:
                res = open_file(local_path)
            self._send_json(res)
            return

        elif path == "/api/reveal":
            local_path = body.get("path", "")
            is_dir = bool(body.get("is_dir", False))
            res = reveal_in_folder(local_path, is_dir=is_dir)
            self._send_json(res)
            return

        self._send_json({"error": "Endpoint not found"}, status=404)

def run_server():
    """Start ThreadingHTTPServer."""
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), CloudSearchHandler)
    print(f"[server] Cloud Search Linux running at http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[server] Shutting down...")
    finally:
        server.server_close()

if __name__ == "__main__":
    run_server()
