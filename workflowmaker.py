"""
Workflow Maker — API Routes
All FastAPI route definitions for managing agents.json.
"""

import json
import os
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter()

# ── Paths ──────────────────────────────────────────────────
CONFIG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "configuration")
AGENTS_FILE = os.path.join(CONFIG_DIR, "agents.json")


# ── Helpers ────────────────────────────────────────────────
def _load_agents() -> list[dict[str, Any]]:
    """Load agent definitions from agents.json.

    Supports both formats:
        { "agents": [...] }   (wrapped)
        [...]                 (flat array)
    """
    if not os.path.exists(AGENTS_FILE):
        return []
    with open(AGENTS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    agents = data.get("agents", data) if isinstance(data, dict) else data
    return agents


def _save_agents(agents: list[dict[str, Any]]) -> None:
    """Persist agents back to agents.json in the wrapped format."""
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(AGENTS_FILE, "w", encoding="utf-8") as f:
        json.dump({"agents": agents}, f, indent=4, ensure_ascii=False)
    print(f"[WorkflowMaker] Saved {len(agents)} agent(s)")


# ── API Endpoints ──────────────────────────────────────────

@router.get("/api/agents")
async def get_agents():
    """Return the full list of agents."""
    return JSONResponse(content=_load_agents())


@router.put("/api/agents")
async def update_agents(payload: dict[str, Any]):
    """Replace the entire agents list and persist to disk."""
    agents = payload.get("agents")
    if agents is None:
        raise HTTPException(status_code=400, detail="Missing 'agents' key")
    _save_agents(agents)
    return {"status": "ok", "count": len(agents)}


@router.get("/api/agents/{agent_name}")
async def get_agent(agent_name: str):
    """Return a single agent by name."""
    agents = _load_agents()
    for a in agents:
        if a.get("agentName") == agent_name:
            return a
    raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")


@router.delete("/api/agents/{agent_name}")
async def delete_agent(agent_name: str):
    """Delete a single agent by name."""
    agents = _load_agents()
    updated = [a for a in agents if a.get("agentName") != agent_name]
    if len(updated) == len(agents):
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
    _save_agents(updated)
    return {"status": "deleted", "count": len(updated)}


ORCHESTRATOR_FILE = os.path.join(CONFIG_DIR, "orchestrator.json")

@router.get("/api/orchestrator")
async def get_orchestrator():
    """Return the orchestrator definition."""
    if not os.path.exists(ORCHESTRATOR_FILE):
        return {"OrchestratorDescription": ""}
    with open(ORCHESTRATOR_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

@router.put("/api/orchestrator")
async def update_orchestrator(payload: dict[str, Any]):
    """Update the orchestrator definition."""
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(ORCHESTRATOR_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=4, ensure_ascii=False)
    return {"status": "ok"}
