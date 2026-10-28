"""
Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.

Flask test application for PyDaemon serverless deployment.
"""

import os
import sys
from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/")
def index():
    return jsonify({
        "message": "Hello from PyDaemon Flask Service!",
        "framework": "Flask",
        "python_version": sys.version,
        "port": os.environ.get("PORT", "5000"),
    })

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
