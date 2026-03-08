"""
Workflow Maker — Server Entry Point
Starts the FastAPI server and mounts the frontend.
Run:  python server.py
"""

import os
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from workflowmaker import router

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
UI5_DIR = os.path.join(BASE_DIR, "ui5app")

app = FastAPI(title="Workflow Maker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes from workflowmaker.py
app.include_router(router)

# Serve frontend static files
app.mount("/manage", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
