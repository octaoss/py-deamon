"""
Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.

Standard library HTTP test application for PyDaemon.
"""

import json
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

class AppHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode("utf-8"))
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        
        response_data = {
            "name": "PyDaemon Simple HTTP App",
            "python_version": sys.version,
            "port": os.environ.get("PORT", "8080"),
            "env": {k: v for k, v in os.environ.items() if not k.startswith("_")},
        }
        self.wfile.write(json.dumps(response_data, indent=2).encode("utf-8"))

def main():
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(("0.0.0.0", port), AppHandler)
    server.serve_forever()

if __name__ == "__main__":
    main()
