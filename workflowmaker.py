"""
Workflow Maker — API Routes
All FastAPI route definitions for managing agents.json and personas.
"""

import json
import os
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

router = APIRouter()

# ── Paths ──────────────────────────────────────────────────
CONFIG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "configuration")
PERSONA_MAP_FILE = os.path.join(CONFIG_DIR, "personamap.json")

# ── Helpers ────────────────────────────────────────────────

def _get_persona_dir(personaId: str = None) -> str:
    """Return the directory path for a given persona."""
    if not personaId or personaId == "legacy":
        return CONFIG_DIR
    p_dir = os.path.join(CONFIG_DIR, personaId)
    os.makedirs(p_dir, exist_ok=True)
    return p_dir

def _load_persona_map() -> list[dict[str, Any]]:
    """Load the persona map from personamap.json."""
    if not os.path.exists(PERSONA_MAP_FILE):
        return []
    with open(PERSONA_MAP_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def _save_persona_map(personas: list[dict[str, Any]]) -> None:
    """Save the persona map to personamap.json."""
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(PERSONA_MAP_FILE, "w", encoding="utf-8") as f:
        json.dump(personas, f, indent=4, ensure_ascii=False)

def _load_agents(personaId: str = None) -> list[dict[str, Any]]:
    """Load agent definitions from agents.json in the persona folder."""
    p_dir = _get_persona_dir(personaId)
    agents_file = os.path.join(p_dir, "agents.json")
    
    if not os.path.exists(agents_file):
        return []
    with open(agents_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    agents = data.get("agents", data) if isinstance(data, dict) else data
    return agents

def _save_agents(agents: list[dict[str, Any]], personaId: str = None) -> None:
    """Persist agents back to agents.json in the persona folder."""
    p_dir = _get_persona_dir(personaId)
    agents_file = os.path.join(p_dir, "agents.json")
    os.makedirs(p_dir, exist_ok=True)
    with open(agents_file, "w", encoding="utf-8") as f:
        json.dump({"agents": agents}, f, indent=4, ensure_ascii=False)
    print(f"[WorkflowMaker] Saved {len(agents)} agent(s) in persona {personaId}")

# ── Persona API Endpoints ──────────────────────────────────

@router.get("/api/personas")
async def get_personas():
    """Return the list of personas from the map."""
    return _load_persona_map()

@router.post("/api/personas")
async def create_persona(payload: dict[str, Any]):
    """Create a new persona and initialize blank files or from template."""
    name = payload.get("personaName", "New Persona")
    description = payload.get("personaDescription", "")
    template_id = payload.get("templatePersonaId")
    personaId = str(uuid.uuid4())
    
    # Save to persona map
    personas = _load_persona_map()
    new_persona = {
        "personaId": personaId,
        "personaName": name,
        "personaDescription": description
    }
    personas.append(new_persona)
    _save_persona_map(personas)
    
    p_dir = _get_persona_dir(personaId)
    
    if template_id:
        # Load from template
        template_dir = _get_persona_dir(template_id)
        agents_path = os.path.join(template_dir, "agents.json")
        orch_path = os.path.join(template_dir, "orchestrator.json")
        
        # Copy agents
        if os.path.exists(agents_path):
            with open(agents_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            with open(os.path.join(p_dir, "agents.json"), "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
        else:
            with open(os.path.join(p_dir, "agents.json"), "w", encoding="utf-8") as f:
                json.dump({"agents": []}, f, indent=4)
                
        # Copy orchestrator
        if os.path.exists(orch_path):
            with open(orch_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            with open(os.path.join(p_dir, "orchestrator.json"), "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
        else:
            with open(os.path.join(p_dir, "orchestrator.json"), "w", encoding="utf-8") as f:
                json.dump({"OrchestratorDescription": "", "OrchestratorBlocks": []}, f, indent=4)
    else:
        # Initialize blank files
        with open(os.path.join(p_dir, "agents.json"), "w", encoding="utf-8") as f:
            json.dump({"agents": []}, f, indent=4)
        with open(os.path.join(p_dir, "orchestrator.json"), "w", encoding="utf-8") as f:
            json.dump({"OrchestratorDescription": "", "OrchestratorBlocks": []}, f, indent=4)
        
    return new_persona

@router.delete("/api/personas/{personaId}")
async def delete_persona(personaId: str):
    """Delete a persona and its files."""
    personas = _load_persona_map()
    updated = [p for p in personas if p.get("personaId") != personaId]
    if len(updated) == len(personas):
        raise HTTPException(status_code=404, detail="Persona not found")
    
    _save_persona_map(updated)
    # Note: We don't necessarily delete the folder to avoid data loss, just remove from map
    return {"status": "deleted"}

# ── Agent API Endpoints ────────────────────────────────────

@router.get("/api/agents")
async def get_agents(personaId: str = Query(None)):
    """Return the full list of agents."""
    return JSONResponse(content=_load_agents(personaId))

@router.put("/api/agents")
async def update_agents(payload: dict[str, Any], personaId: str = Query(None)):
    """Replace the entire agents list and persist to disk."""
    agents = payload.get("agents")
    if agents is None:
        raise HTTPException(status_code=400, detail="Missing 'agents' key")
    _save_agents(agents, personaId)
    return {"status": "ok", "count": len(agents), "personaId": personaId}

@router.get("/api/agents/{agent_name}")
async def get_agent(agent_name: str, personaId: str = Query(None)):
    """Return a single agent by name."""
    agents = _load_agents(personaId)
    for a in agents:
        if a.get("agentName") == agent_name:
            return a
    raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")

@router.delete("/api/agents/{agent_name}")
async def delete_agent(agent_name: str, personaId: str = Query(None)):
    """Delete a single agent by name."""
    agents = _load_agents(personaId)
    updated = [a for a in agents if a.get("agentName") != agent_name]
    if len(updated) == len(agents):
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
    _save_agents(updated, personaId)
    return {"status": "deleted", "count": len(updated)}

# ── Orchestrator API Endpoints ─────────────────────────────

@router.get("/api/orchestrator")
async def get_orchestrator(personaId: str = Query(None)):
    """Return the orchestrator definition."""
    p_dir = _get_persona_dir(personaId)
    orch_file = os.path.join(p_dir, "orchestrator.json")
    
    if not os.path.exists(orch_file):
        return {"OrchestratorDescription": ""}
        
    with open(orch_file, "r", encoding="utf-8") as f:
        return json.load(f)

@router.put("/api/orchestrator")
async def update_orchestrator(payload: dict[str, Any], personaId: str = Query(None)):
    """Update the orchestrator definition."""
    p_dir = _get_persona_dir(personaId)
    orch_file = os.path.join(p_dir, "orchestrator.json")
    os.makedirs(p_dir, exist_ok=True)
    with open(orch_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=4, ensure_ascii=False)
    return {"status": "ok", "personaId": personaId}
