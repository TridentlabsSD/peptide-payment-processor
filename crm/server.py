#!/usr/bin/env python3
"""
3PSolutions Merchant Dashboard — LOCAL dev server.

This is for local development only. It serves the static files and routes
/api/* to the shared core (core.dispatch_api). In production on Vercel, the
static files are served by Vercel's CDN and /api/* is handled by the serverless
function in api/index.py — both use the same core.py logic.

Run:
    python server.py                 # http://localhost:8000
Manage accounts (SQLite locally, or the DATABASE_URL if set):
    python server.py adduser|addmerchant|delmerchant|setrole|setmerchant|passwd|deluser|listusers|listmerchants ...
"""

import http.server
import sys
from urllib.parse import urlparse

import core

import os
HOST = os.environ.get("HOST", "127.0.0.1")  # set HOST=0.0.0.0 to allow phones/other devices on your Wi-Fi
PORT = 8000
PAGES = {
    "/": "index.html", "": "index.html", "/index.html": "index.html",
    "/login": "login.html", "/login.html": "login.html",
    "/signup": "signup.html", "/signup.html": "signup.html",
    "/forgot": "forgot.html", "/forgot.html": "forgot.html",
    "/reset": "reset.html", "/reset.html": "reset.html",
    "/favicon.ico": "assets/logo.png",
    "/apple-touch-icon.png": "assets/logo.png",
    "/apple-touch-icon-precomposed.png": "assets/logo.png",
}
BLOCKED_PREFIXES = ("/data/", "/apps-script/", "/api-docs/")
BLOCKED_SUFFIXES = (".py", ".db")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=core.ROOT, **kwargs)

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def _api(self, method):
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length) if length else b""
        status, headers, out = core.dispatch_api(method, parsed.path, parsed.query, self.headers, body)
        self.send_response(status)
        for k, v in headers:
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def do_POST(self):
        if urlparse(self.path).path.startswith("/api/"):
            return self._api("POST")
        self.send_error(404, "Not found")

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            return self._api("GET")
        if path in PAGES:
            return self._send_file(PAGES[path])
        if path.startswith(BLOCKED_PREFIXES) or path.endswith(BLOCKED_SUFFIXES):
            return self.send_error(403, "Forbidden")
        return super().do_GET()  # static assets under /assets/

    def _send_file(self, name):
        import os
        full = os.path.join(core.ROOT, name)
        try:
            with open(full, "rb") as fh:
                body = fh.read()
        except OSError:
            return self.send_error(404, "Not found")
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(full))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    if len(sys.argv) > 1:
        return core.cli(sys.argv)
    core.init_db()
    server = http.server.ThreadingHTTPServer((HOST, PORT), Handler)
    print("3PSolutions dashboard (local) on http://localhost:%d  (Ctrl+C to stop)" % PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
