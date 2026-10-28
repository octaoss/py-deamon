"""
Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.

FastAPI test application for PyDaemon serverless deployment.
"""

import os
import sys
from fastapi import FastAPI
import uvicorn

app = FastAPI(title="PyDaemon FastAPI Service")

@app.get("/")
def read_root():
    return {
        "message": "Hello from PyDaemon FastAPI Service!",
        "framework": "FastAPI",
        "python_version": sys.version,
        "port": os.environ.get("PORT", "8000"),
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get("/env")
def list_env():
    return {k: v for k, v in os.environ.items() if not k.startswith("_")}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
