"""
Vercel Python serverless function — handles all /api/* routes.

vercel.json rewrites /api/:path* to this function (passing the route as ?__p=).
All logic lives in the shared core.py at the project root.
"""
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Make the project-root core.py importable from this serverless function.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import core  # noqa: E402


def _resolve(self):
    """Return (route_path, query_string, body_bytes) for the incoming request."""
    parsed = urlparse(self.path)
    qs = parse_qs(parsed.query)
    # vercel.json passes the original sub-path as ?__p=login etc.
    if "__p" in qs:
        route = "/api/" + qs["__p"][0]
    elif parsed.path.startswith("/api/"):
        route = parsed.path
    else:
        route = parsed.path
    length = int(self.headers.get("Content-Length", 0) or 0)
    body = self.rfile.read(length) if length else b""
    return route, parsed.query, body


def _respond(self, status, headers, body):
    self.send_response(status)
    self.send_header("Cache-Control", "no-store")
    for k, v in headers:
        self.send_header(k, v)
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        route, query, body = _resolve(self)
        status, headers, out = core.dispatch_api("GET", route, query, self.headers, body)
        _respond(self, status, headers, out)

    def do_POST(self):
        route, query, body = _resolve(self)
        status, headers, out = core.dispatch_api("POST", route, query, self.headers, body)
        _respond(self, status, headers, out)
