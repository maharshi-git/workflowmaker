/* ═══════════════════════════════════════════════════════════
   Workflow Maker — Agent & Tool Configuration Editor
   ═══════════════════════════════════════════════════════════ */

// ── Toggle Visibility — Advanced Execution ────────────
function toggleAdvancedCodeVisibility() {
    const isAdvanced = document.getElementById('det-tool-advanced-code').checked;
    const cardSimple = document.getElementById('card-function-simple');
    const cardDnd = document.getElementById('card-function-dnd');
    
    // IF TRUE: HIDE BOTH. IF FALSE: SHOW BOTH (Standard behavior)
    if (cardSimple) cardSimple.style.display = isAdvanced ? 'none' : 'block';
    if (cardDnd) cardDnd.style.display = isAdvanced ? 'none' : 'block';
    
    // Save to tool state
    if (state.currentAgent !== null && state.currentTool !== null) {
        state.agents[state.currentAgent].tools[state.currentTool].advancedCodeExec = isAdvanced;
    }
}

// ── Default Workflow ─────────────────────────────
function applyDefaultWorkflow() {
    state.graphNodes = [];
    state.graphEdges = [];
    
    const id1 = _uid();
    const id2 = _uid();
    const id3 = _uid();
    
    state.graphNodes.push({
        id: id1, type: 'insertPayload', x: 50, y: 150, payload: '{\n  "id": 1\n}'
    });
    state.graphNodes.push({
        id: id2, type: 'apiCall', x: 300, y: 150, 
        serviceName: '', entitySet: '', crudType: 'READ', apiType: 'oData', oDataType: 'Entity', expands: []
    });
    state.graphNodes.push({
        id: id3, type: 'returnObject', x: 600, y: 150, returnType: 'default', returnLabels: []
    });
    
    state.graphEdges.push({ from: id1, to: id2 });
    state.graphEdges.push({ from: id2, to: id3 });
    
    renderNodeGraph();
}

// ── State ──────────────────────────────────────────────────
const state = {
    agents: [],
    currentAgent: null,
    currentTool: null,
    chatThreadId: null,
    metaParsedData: null,
    metaSelectedEntity: null,
    sampleFormDef: [],
    apiCalls: [],
};

// Theme integration logic
function applyTheme(isLight) {
    if (isLight) {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function toggleNativeTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    applyTheme(!isLight);
}

document.addEventListener('DOMContentLoaded', async () => {
    // Default to light theme
    applyTheme(true);

    try {
        state.agents = await fetch('/api/agents').then(r => r.json());
        showAgentsList();
    } catch (e) { showToast('Failed to load agents', 'error'); }

    try {
        const orch = await fetch('/api/orchestrator').then(r => r.json());
        if (orch && orch.OrchestratorDescription) {
            document.getElementById('orchestrator-def-input').value = orch.OrchestratorDescription;
            autoGrow(document.getElementById('orchestrator-def-input'));
        }
    } catch (e) { console.error('Failed to load orchestrator', e); }

    // Auto-expand textareas
    document.addEventListener('input', e => {
        if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
    });

    // Metadata file upload handler
    document.getElementById('meta-file-input').addEventListener('change', handleMetaFileUpload);
    document.getElementById('meta-entity-select').addEventListener('change', onMetaEntitySelected);

    // 1. Listen for cross-window messages (from UI5 shell)
    window.addEventListener('message', e => {
        if (e.data && e.data.action === 'setTheme') {
            applyTheme(e.data.theme === 'light');
        } else if (e.data && e.data.action === 'toolDataReceived' && state.currentAgent !== null && state.currentTool !== null) {
            const tool = state.agents[state.currentAgent].tools[state.currentTool];
            if (!tool) return;
            const capData = e.data.data;

            if (capData && capData.intent) {
                const i = capData.intent;
                tool.active = i.active;
                tool.title = i.title;
                tool.knowledge = i.knowledge;
                tool.appLink = i.appLink;
                tool.staticInstruction = i.staticInstruction;
                tool.operationType = i.operationType;
                tool.operationSubtype = i.operationSubtype;
                tool.defaultReportView = i.defaultReportView;
                tool.advancedCodeExec = i.advancedCodeExec; // Store advancedCodeExec

                // Update UI properties
                document.getElementById('det-tool-active').checked = !!tool.active;
                document.getElementById('det-tool-default-report-view').checked = !!tool.defaultReportView;
                document.getElementById('det-tool-title').value = tool.title || '';
                document.getElementById('det-tool-knowledge').value = tool.knowledge || '';
                document.getElementById('det-tool-applink').value = tool.appLink || '';
                document.getElementById('det-tool-static-instruction').value = tool.staticInstruction || '';
                document.getElementById('det-tool-operation-type').value = tool.operationType || '';
                document.getElementById('det-tool-advanced-code').checked = !!tool.advancedCodeExec; // Set checkbox
                updateOperationSubtypeOptions(tool.operationType || '');
                document.getElementById('det-tool-operation-subtype').value = tool.operationSubtype || '';
                toggleAdvancedCodeVisibility(); // Update visibility based on loaded value

                showToast(`Loaded details from CAP for ${tool.toolName}`, 'success');
            } else {
                showToast(`Tool ${tool.toolName} not configured in CAP application.`, 'warning');
                document.getElementById('fn-code-preview').value = '// No code in CAP yet. Save to initialize.';
            }

            if (capData && capData.bigForm) {
                try {
                    state.sampleFormDef = JSON.parse(capData.bigForm.sampleForm) || [];
                    renderFormEditor();
                    renderPayloadForm();
                } catch (e) { console.error("Error parsing CAP bigForm", e); }
            } else {
                state.sampleFormDef = [];
                renderFormEditor();
                renderPayloadForm();
            }

            if (capData && capData.function) {
                document.getElementById('fn-code-preview').value = capData.function.functionCode;
            }

            if (capData && capData.configFlow && capData.configFlow.configJson) {
                try {
                    const cfg = JSON.parse(capData.configFlow.configJson);
                    state.graphNodes = (cfg.nodes || []).map(node => {
                        // Ensure defaults for older data
                        if (node.type === 'apiCall') {
                            if (!node.apiType) node.apiType = 'oData';
                            if (!node.oDataType) node.oDataType = 'Entity';
                            if (!node.expands) node.expands = [];
                            node.expands = node.expands.map(e => {
                                if (typeof e === 'string') return { id: _uid(), name: e, expands: [] };
                                return e;
                            });
                        }
                        return node;
                    });
                    state.graphEdges = cfg.edges || [];
                    
                    // IF NO NODES EXIST, APPLY DEFAULT FLOW
                    if (state.graphNodes.length === 0) {
                        applyDefaultWorkflow();
                    } else {
                        renderNodeGraph();
                    }
                } catch (e) { 
                    console.error("Error parsing configFlow", e); 
                    applyDefaultWorkflow(); 
                }
            } else {
                // Completely new or no config, apply default
                applyDefaultWorkflow();
            }
        } else if (e.data && e.data.action === 'workflowExecuted') {
            const outputDiv = document.getElementById('dnd-test-output');
            const previewArea = document.getElementById('dnd-test-preview');
            if (outputDiv && previewArea) {
                outputDiv.style.display = 'block';
                previewArea.value = e.data.response || '// No response received';
                autoGrow(previewArea);
                previewArea.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
            showToast('Workflow executed successfully', 'success');
        }
    });

    // 2. Match OS preference ONLY if not explicitly overridden by UI5 above
    // (though applyTheme(true) above already sets it to light by default)
});

async function saveOrchestrator() {
    const desc = document.getElementById('orchestrator-def-input').value;
    try {
        const res = await fetch('/api/orchestrator', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ OrchestratorDescription: desc }),
        });
        if (!res.ok) throw new Error('Save orchestrator failed');
        showToast('Orchestrator saved', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════
//  Navigation helpers
// ═══════════════════════════════════════════════════════════
function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function setBreadcrumb(crumbs) {
    const el = document.getElementById('breadcrumb');
    el.innerHTML = crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        const sep = i > 0 ? '<span class="crumb-sep">/</span>' : '';
        return `${sep}<span class="crumb ${isLast ? 'active' : ''}" onclick="${c.onclick || ''}">${c.label}</span>`;
    }).join('');
}

function toggleCollapse(headerEl) {
    headerEl.closest('.collapsible').classList.toggle('collapsed');
}

// ═══════════════════════════════════════════════════════════
//  View 1 — Agents List
// ═══════════════════════════════════════════════════════════
function showAgentsList() {
    state.currentAgent = null;
    state.currentTool = null;
    setBreadcrumb([{ label: 'Agents' }]);
    showView('view-agents');

    const searchInput = document.getElementById('search-agents');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    const sortedAgents = state.agents.map((a, i) => ({ ...a, _oIdx: i })).filter(a =>
        (a.agentName || '').toLowerCase().includes(searchTerm) ||
        (a.agentDefinition || '').toLowerCase().includes(searchTerm)
    );

    const tbody = document.querySelector('#agents-table tbody');
    tbody.innerHTML = sortedAgents.map(a => `
        <tr onclick="showAgentDetail(${a._oIdx})">
            <td>${a._oIdx + 1}</td>
            <td style="font-weight:600;color:var(--primary-light)">${a.agentName}</td>
            <td style="color:var(--text-muted)">${truncate(a.agentDefinition || '', 80)}</td>
            <td>${(a.tools || []).length}</td>
            <td class="td-actions">
                <button class="btn-delete" onclick="event.stopPropagation();deleteAgent(${a._oIdx})" title="Delete">&times;</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:32px;">No agents found</td></tr>';

    renderFlowchart();
}

// ─── Table / Flow toggle ─────────────────────────────────
function switchAgentsView(mode) {
    document.querySelectorAll('.agents-tab').forEach(b => b.classList.toggle('active', b.dataset.vt === mode));
    document.getElementById('agents-table-view').style.display = mode === 'table' ? '' : 'none';
    document.getElementById('agents-flow-view').style.display = mode === 'flow' ? '' : 'none';
    if (mode === 'flow') renderFlowchart();
}

// ─── Flowchart ───────────────────────────────────────────
const flowExpanded = {};

function renderFlowchart() {
    const container = document.getElementById('flow-container');
    const agents = state.agents;

    const searchInput = document.getElementById('search-agents');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    const orchIdx = agents.findIndex(a => /orchestrat/i.test(a.agentName));
    const orch = orchIdx >= 0 ? agents[orchIdx] : null;
    const childAgents = agents.filter((a, i) => i !== orchIdx && (!searchTerm || (a.agentName || '').toLowerCase().includes(searchTerm) || (a.agentDefinition || '').toLowerCase().includes(searchTerm)));

    let html = '<div class="flow-tree">';

    // Root node
    const orchName = orch ? orch.agentName : 'Orchestrator';
    const orchExpanded = flowExpanded['orch'];
    html += `<div class="flow-node flow-node-orch" onclick="toggleFlowNode('orch')">`;
    html += `<div class="flow-node-name">${orchName}</div>`;
    html += `<div class="flow-node-sub">${childAgents.length} agent${childAgents.length !== 1 ? 's' : ''}</div>`;
    if (!orchExpanded && childAgents.length > 0)
        html += `<div class="flow-expand-hint">▾ click to expand</div>`;
    html += `</div>`;

    // Children agents (vertical)
    if (orchExpanded && childAgents.length > 0) {
        html += `<div class="flow-children">`;
        childAgents.forEach((agent) => {
            const realIdx = agents.indexOf(agent);
            const aKey = 'agent-' + realIdx;
            const tools = agent.tools || [];
            const aExpanded = flowExpanded[aKey];

            html += `<div class="flow-branch">`;
            html += `<div class="flow-node flow-node-agent" onclick="event.stopPropagation();toggleFlowNode('${aKey}')">`;
            if (tools.length > 0) html += `<div class="flow-node-badge">${tools.length}</div>`;
            html += `<div class="flow-node-name">${agent.agentName}</div>`;
            html += `<div class="flow-node-sub">${tools.length} tool${tools.length !== 1 ? 's' : ''}</div>`;
            if (!aExpanded && tools.length > 0)
                html += `<div class="flow-expand-hint">▾ click to expand</div>`;
            html += `</div>`;

            // Tools (nested vertical)
            if (aExpanded && tools.length > 0) {
                html += `<div class="flow-children">`;
                tools.forEach((tool, ti) => {
                    html += `<div class="flow-branch">`;
                    html += `<div class="flow-node flow-node-tool" onclick="event.stopPropagation();flowNavToTool(${realIdx},${ti})">`;
                    html += `<div class="flow-node-name">${tool.toolName}</div>`;
                    html += `<div class="flow-node-sub">${truncate(tool.toolDefinition || '', 40)}</div>`;
                    html += `<div class="flow-expand-hint">→ open detail</div>`;
                    html += `</div></div>`;
                });
                html += `</div>`;
            }
            html += `</div>`;
        });
        html += `</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
}

function toggleFlowNode(key) {
    flowExpanded[key] = !flowExpanded[key];
    renderFlowchart();
}

function flowNavToTool(agentIdx, toolIdx) {
    showAgentDetail(agentIdx);
    setTimeout(() => showToolDetail(toolIdx), 50);
}

function addAgent() {
    const name = prompt('Agent name:');
    if (!name) return;
    if (state.agents.some(a => (a.agentName || '').toLowerCase() === name.toLowerCase())) { showToast('Name already exists', 'error'); return; }
    state.agents.push({ agentName: name, agentDefinition: '', tools: [] });
    showAgentsList();
    saveAll();
    showToast(`Agent "${name}" added`, 'success');
}

function deleteAgent(idx) {
    if (!confirm(`Delete "${state.agents[idx].agentName}"?`)) return;
    state.agents.splice(idx, 1);
    showAgentsList();
    saveAll();
}

// ═══════════════════════════════════════════════════════════
//  View 2 — Agent Detail
// ═══════════════════════════════════════════════════════════
function showAgentDetail(idx) {
    state.currentAgent = idx;
    state.currentTool = null;
    const agent = state.agents[idx];
    setBreadcrumb([
        { label: 'Agents', onclick: 'showAgentsList()' },
        { label: agent.agentName },
    ]);
    showView('view-agent-detail');

    document.getElementById('det-agent-name').value = agent.agentName;
    document.getElementById('det-agent-def').value = agent.agentDefinition || '';

    document.getElementById('det-agent-name').onchange = function () { agent.agentName = this.value; };
    document.getElementById('det-agent-def').onchange = function () { agent.agentDefinition = this.value; };

    renderToolsList();
}

function renderToolsList() {
    const agent = state.agents[state.currentAgent];
    if (!agent) return;

    const searchInput = document.getElementById('search-tools');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const tools = agent.tools || [];

    const filteredTools = tools.map((t, i) => ({ ...t, _oIdx: i })).filter(t =>
        (t.toolName || '').toLowerCase().includes(searchTerm) ||
        (t.toolDefinition || '').toLowerCase().includes(searchTerm)
    );

    const tbody = document.querySelector('#tools-table tbody');
    if (tbody) {
        tbody.innerHTML = filteredTools.map(t => `
            <tr onclick="showToolDetail(${state.currentAgent}, ${t._oIdx})">
                <td>${t._oIdx + 1}</td>
                <td style="font-weight:600;color:var(--success)">${t.toolName}</td>
                <td style="color:var(--text-muted)">${truncate(t.toolDefinition || '', 80)}</td>
                <td class="td-actions">
                    <button class="btn-delete" onclick="event.stopPropagation();deleteTool(${state.currentAgent},${t._oIdx})" title="Delete">&times;</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:32px;">No tools found</td></tr>';
    }
}

function addTool() {
    const name = prompt('Tool name:');
    if (!name) return;
    const agent = state.agents[state.currentAgent];
    if (agent.tools && agent.tools.some(t => (t.toolName || '').toLowerCase() === name.toLowerCase())) { showToast('Tool name already exists', 'error'); return; }
    if (!agent.tools) agent.tools = [];
    agent.tools.push({ toolName: name, toolDefinition: '', formToBeSent: {} });
    showAgentDetail(state.currentAgent);
    saveAll();
    showToast(`Tool "${name}" added`, 'success');
}

function deleteTool(agentIdx, toolIdx) {
    const agent = state.agents[agentIdx];
    if (!confirm(`Delete "${agent.tools[toolIdx].toolName}"?`)) return;
    agent.tools.splice(toolIdx, 1);
    showAgentDetail(agentIdx);
    saveAll();
}

// ═══════════════════════════════════════════════════════════
//  View 3 — Tool Detail
// ═══════════════════════════════════════════════════════════

function publishToUI5() {
    if (state.currentAgent === null || state.currentTool === null) return;
    const tool = state.agents[state.currentAgent].tools[state.currentTool];
    const preview = document.getElementById('fn-code-preview');
    const queryCode = preview ? preview.value : '';

    window.parent.postMessage({
        action: 'toolUpdated',
        sampleForm: state.sampleFormDef || [],
        formToBeSent: tool.formToBeSent || {},
        queryCode: queryCode
    }, '*');
}

function showToolDetail(agentIdx, toolIdx) {
    state.currentAgent = agentIdx;
    state.currentTool = toolIdx;
    const agent = state.agents[agentIdx];
    const tool = agent.tools[toolIdx];

    setBreadcrumb([
        { label: 'Agents', onclick: 'showAgentsList()' },
        { label: agent.agentName, onclick: `showAgentDetail(${agentIdx})` },
        { label: tool.toolName },
    ]);
    showView('view-tool-detail');

    document.getElementById('det-tool-name').value = tool.toolName || '';
    document.getElementById('det-tool-def').value = tool.toolDefinition || '';

    // ═══ Part 1: Source of Truth = agents.json (Frontend state) ═══
    document.getElementById('form-json-editor').value = JSON.stringify(tool.formToBeSent || {}, null, 2);

    // ═══ Part 2: Source of Truth = CAP Application (Cleared now, loaded via message) ═══
    document.getElementById('det-tool-active').checked = false;
    document.getElementById('det-tool-default-report-view').checked = false;
    document.getElementById('det-tool-title').value = '';
    document.getElementById('det-tool-knowledge').value = '';
    document.getElementById('det-tool-applink').value = '';
    document.getElementById('det-tool-static-instruction').value = '';
    document.getElementById('det-tool-operation-type').value = '';
    document.getElementById('det-tool-operation-subtype').value = '';
    document.getElementById('det-tool-advanced-code').checked = false;
    toggleAdvancedCodeVisibility();

    state.sampleFormDef = [];
    renderFormEditor();
    renderPayloadForm();

    document.getElementById('fn-code-preview').value = '// Loading from CAP app...';

    // [New Flow] Emit event to parent (UI5) to fetch latest details from CAP App
    window.parent.postMessage({
        action: 'readTool',
        toolName: tool.toolName
    }, '*');

    document.getElementById('det-tool-name').onchange = function () { tool.toolName = this.value; publishToUI5(); };
    document.getElementById('det-tool-def').onchange = function () { tool.toolDefinition = this.value; publishToUI5(); };
    document.getElementById('det-tool-active').onchange = function () { tool.active = this.checked; publishToUI5(); };
    document.getElementById('det-tool-default-report-view').onchange = function () { tool.defaultReportView = this.checked; publishToUI5(); };
    document.getElementById('det-tool-title').onchange = function () { tool.title = this.value; publishToUI5(); };
    document.getElementById('det-tool-knowledge').onchange = function () { tool.knowledge = this.value; publishToUI5(); };
    document.getElementById('det-tool-applink').onchange = function () { tool.appLink = this.value; publishToUI5(); };
    document.getElementById('det-tool-static-instruction').onchange = function () { tool.staticInstruction = this.value; publishToUI5(); };
    document.getElementById('det-tool-operation-subtype').onchange = function () { tool.operationSubtype = this.value; publishToUI5(); };
    document.getElementById('det-tool-advanced-code').onchange = function () { 
        tool.advancedCodeExec = this.checked; 
        toggleAdvancedCodeVisibility();
        publishToUI5(); 
    };
    document.getElementById('form-json-editor').onchange = function () {
        try {
            tool.formToBeSent = JSON.parse(this.value);
            publishToUI5();
        }
        catch { showToast('Invalid JSON', 'error'); }
    }

    // API calls stay local to agents.json
    state.apiCalls = (tool.apiCalls || []).map(a => ({ ...a }));
    renderApiCalls();

    // Restore node graph
    state.graphNodes = (tool.graphNodes || []).map(n => ({ ...n }));
    state.graphEdges = (tool.graphEdges || []).map(e => ({ ...e }));
    renderNodeGraph();
    const dndCodeOut = document.getElementById('dnd-code-output');
    if (dndCodeOut) dndCodeOut.style.display = 'none';
    const configOut = document.getElementById('dnd-config-output');
    if (configOut) configOut.style.display = 'none';

    // Initial publish down to UI5
    publishToUI5();

    resetMetadataUI();
}

function handleOperationTypeChange() {
    if (state.currentAgent === null || state.currentTool === null) return;
    const tool = state.agents[state.currentAgent].tools[state.currentTool];
    const newType = document.getElementById('det-tool-operation-type').value;
    tool.operationType = newType;
    tool.operationSubtype = '';
    updateOperationSubtypeOptions(newType);
}

function updateOperationSubtypeOptions(type) {
    const subtypeSelect = document.getElementById('det-tool-operation-subtype');
    subtypeSelect.innerHTML = '';

    if (type === 'CRUD') {
        const options = ['CREATE', 'READ', 'UPDATE', 'DELETE'];
        subtypeSelect.innerHTML = '<option value="">Select Subtype</option>' + options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
        subtypeSelect.disabled = false;
    } else {
        subtypeSelect.innerHTML = '<option value="">Not Applicable</option>';
        subtypeSelect.disabled = true;
    }
}

// ═══════════════════════════════════════════════════════════
//  Cleanup — clear all leaf values in formToBeSent JSON
// ═══════════════════════════════════════════════════════════
function cleanupFormJSON() {
    const editor = document.getElementById('form-json-editor');
    try {
        const json = JSON.parse(editor.value);
        const cleaned = deepCleanValues(json);
        editor.value = JSON.stringify(cleaned, null, 2);
        state.agents[state.currentAgent].tools[state.currentTool].formToBeSent = cleaned;
        publishToUI5();
        showToast('Form JSON cleaned up');
    } catch { showToast('Invalid Form JSON', 'error'); }
}

function deepCleanValues(obj) {
    if (Array.isArray(obj)) return obj.map(deepCleanValues);
    if (obj !== null && typeof obj === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(obj)) out[k] = deepCleanValues(v);
        return out;
    }
    if (typeof obj === 'boolean') return false;
    if (typeof obj === 'number') return 0;
    return '';
}

// ═══════════════════════════════════════════════════════════
//  Load JSON into Editor (JSON → form definition → editor)
// ═══════════════════════════════════════════════════════════
function loadIntoEditor() {
    const editor = document.getElementById('form-json-editor');
    try {
        const json = JSON.parse(editor.value);
        state.sampleFormDef = jsonToFormDef(json);
        renderFormEditor();
        publishToUI5(); // Added publishToUI5
        showToast('Loaded into editor', 'success');
    } catch (e) { showToast('Invalid JSON: ' + e.message, 'error'); }
}

function jsonToFormDef(obj) {
    const fields = [];
    for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
            fields.push({
                label: key, type: 'table',
                fieldLabel: camelToLabel(key.replace(/^to_/, '')),
                mandatory: false, entity: '', value: '',
                table: jsonToFormDef(value[0]),
            });
        } else if (typeof value === 'boolean') {
            fields.push({
                label: key, type: 'Checkbox',
                fieldLabel: camelToLabel(key),
                mandatory: false, entity: '', value: false,
            });
        } else {
            fields.push({
                label: key, type: 'string',
                fieldLabel: camelToLabel(key),
                mandatory: false, entity: '', value: '',
            });
        }
    }
    return fields;
}

function camelToLabel(str) {
    return str.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, s => s.toUpperCase()).trim();
}

function escHtml(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// ═══════════════════════════════════════════════════════════
//  Graphical Form Editor — CRUD
// ═══════════════════════════════════════════════════════════

function switchSFTab(tab) {
    // Toggle tab buttons
    document.querySelectorAll('.sf-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    // Toggle panels
    document.getElementById('sf-panel-editor').style.display = tab === 'editor' ? '' : 'none';
    document.getElementById('sf-panel-json').style.display = tab === 'json' ? '' : 'none';
    // Show/hide Add Field button (only relevant on Editor tab)
    document.getElementById('sf-btn-add').style.display = tab === 'editor' ? '' : 'none';
    // Sync JSON when switching to JSON tab
    if (tab === 'json') {
        document.getElementById('sf-json-view').value = JSON.stringify(state.sampleFormDef, null, 2);
    }
}

function updateFormFromJson() {
    const jsonStr = document.getElementById('sf-json-view').value;
    try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
            state.sampleFormDef = parsed;
            renderFormEditor();
            publishToUI5();
            showToast('Form updated from JSON', 'success');
        } else {
            showToast('JSON must be an array of fields', 'error');
        }
    } catch (e) {
        showToast('Invalid JSON: ' + e.message, 'error');
    }
}

function renderFormEditor() {
    const container = document.getElementById('form-editor-content');
    container.innerHTML = renderFieldList(state.sampleFormDef, '');
}

function renderFieldList(fields, pathPrefix) {
    if (!fields || fields.length === 0) {
        return '<div class="fe-empty">No fields. Click \"+ Add Field\" to start.</div>';
    }
    return fields.map((f, i) => {
        const path = pathPrefix ? `${pathPrefix}.${i}` : `${i}`;
        const isTable = f.type === 'table';
        return `
            <div class="fe-field">
                <div class="fe-field-row">
                    <button class="btn-delete" onclick="deleteFormField('${path}')" title="Delete">&times;</button>
                    <span class="fe-label">label</span>
                    <input class="fe-input" value="${escHtml(f.label || '')}" onchange="updateFormField('${path}','label',this.value)">
                    <span class="fe-label">fieldLabel</span>
                    <input class="fe-input fe-input-wide" value="${escHtml(f.fieldLabel || '')}" onchange="updateFormField('${path}','fieldLabel',this.value)">
                    <span class="fe-label">type</span>
                    <select class="fe-select" onchange="changeFieldType('${path}',this.value)">
                        <option value="string" ${f.type === 'string' ? 'selected' : ''}>String</option>
                        <option value="Date" ${f.type === 'Date' ? 'selected' : ''}>Date</option>
                        <option value="Checkbox" ${f.type === 'Checkbox' ? 'selected' : ''}>Checkbox</option>
                        <option value="table" ${f.type === 'table' ? 'selected' : ''}>Table</option>
                    </select>
                    <span class="fe-label">entity</span>
                    <input class="fe-input" value="${escHtml(f.entity || '')}" onchange="updateFormField('${path}','entity',this.value)">
                    <label class="fe-cb-label"><input type="checkbox" ${f.mandatory ? 'checked' : ''} onchange="updateFormField('${path}','mandatory',this.checked)"> Req</label>
                </div>
                ${isTable ? `
                    <div class="fe-nested">
                        <div class="fe-nested-header">
                            <span class="fe-nested-label">Navigation: ${escHtml(f.label || 'table')}</span>
                            <button class="btn btn-outline btn-sm" onclick="addFormField('${path}.table')">+ Add Sub-field</button>
                        </div>
                        ${renderFieldList(f.table || [], path + '.table')}
                    </div>
                ` : ''}
            </div>`;
    }).join('');
}

/** Navigate to the fields array at a dot-separated path */
function getFieldsArray(path) {
    if (!path) return state.sampleFormDef;
    const parts = path.split('.');
    let current = state.sampleFormDef;
    for (const part of parts) {
        if (part === 'table') {
            if (!Array.isArray(current.table)) current.table = [];
            current = current.table;
        } else {
            current = current[parseInt(part)];
        }
    }
    return current;
}

/** Navigate to a single field at a dot-separated path */
function getFieldAtPath(path) {
    const parts = path.split('.');
    let current = state.sampleFormDef;
    for (const part of parts) {
        if (part === 'table') {
            current = current.table || [];
        } else {
            current = current[parseInt(part)];
        }
    }
    return current;
}

function addFormField(path) {
    const fields = getFieldsArray(path);
    const newField = {
        label: 'newProperty',
        fieldLabel: 'New Property',
        type: 'string',
        entity: '',
        mandatory: false
    };
    fields.push(newField);
    renderFormEditor();
    publishToUI5();
}

function deleteFormField(path) {
    const parts = path.split('.');
    const idx = parseInt(parts.pop());
    const parentPath = parts.join('.');
    const fields = getFieldsArray(parentPath);
    fields.splice(idx, 1);
    renderFormEditor();
    publishToUI5();
}

function updateFormField(path, prop, value) {
    const field = getFieldAtPath(path);
    if (field) field[prop] = prop === 'mandatory' ? (value === 'true' || value === true) : value;
    publishToUI5(); // Don't full re-render on every keystroke, but DO publish
}

function changeFieldType(path, newType) {
    const field = getFieldAtPath(path);
    if (!field) return;
    field.type = newType;
    if (newType === 'table' && !field.table) field.table = [];
    if (newType === 'Checkbox') field.value = false;
    renderFormEditor();
    publishToUI5();
}

// ═══════════════════════════════════════════════════════════
//  Create formToBeSent from form editor (editor → JSON)
// ═══════════════════════════════════════════════════════════
function createFormToBeSent() {
    const json = formDefToJson(state.sampleFormDef);
    const editor = document.getElementById('form-json-editor');
    editor.value = JSON.stringify(json, null, 2);
    autoGrow(editor);

    // Save back to tool
    state.agents[state.currentAgent].tools[state.currentTool].formToBeSent = json;
    publishToUI5();
    showToast('Form To Be Sent regenerated.', 'success');
}

function formDefToJson(fields) {
    const json = {};
    for (const f of fields) {
        if (f.type === 'table') {
            json[f.label || 'unnamed'] = [formDefToJson(f.table || [])];
        } else if (f.type === 'Checkbox') {
            json[f.label || 'unnamed'] = false;
        } else {
            json[f.label || 'unnamed'] = '';
        }
    }
    return json;
}

// ═══════════════════════════════════════════════════════════
//  Metadata Import (EDMX)
// ═══════════════════════════════════════════════════════════

function resetMetadataUI() {
    state.metaParsedData = null;
    state.metaSelectedEntity = null;
    document.getElementById('meta-file-name').textContent = '';
    document.getElementById('meta-entity-section').classList.add('hidden');
    document.getElementById('meta-nav-section').classList.add('hidden');
    document.getElementById('meta-nav-list').innerHTML = '';
    document.getElementById('meta-file-input').value = '';
}

function handleMetaFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('meta-file-name').textContent = file.name;

    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const parser = new MetadataParser();
            state.metaParsedData = parser.parse(ev.target.result);
            populateMetaEntitySelector();
            showToast(`Parsed: ${state.metaParsedData.stats.entitySets} entities`, 'success');
        } catch (err) {
            showToast('EDMX parse error: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

function populateMetaEntitySelector() {
    const select = document.getElementById('meta-entity-select');
    select.innerHTML = '<option value="">\u2014 Choose an entity \u2014</option>';
    state.metaParsedData.simplifiedMetadata.forEach(entity => {
        const opt = document.createElement('option');
        opt.value = entity.entitySetName;
        opt.textContent = `${entity.entitySetName} (${entity.allProperties.length} fields)`;
        select.appendChild(opt);
    });
    document.getElementById('meta-entity-section').classList.remove('hidden');
    document.getElementById('meta-nav-section').classList.add('hidden');
}

function onMetaEntitySelected() {
    const entityName = document.getElementById('meta-entity-select').value;
    if (!entityName || !state.metaParsedData) return;

    state.metaSelectedEntity = entityName;

    // Find navigations for this entity from the traversing map
    const traversal = state.metaParsedData.traversingMap.find(t => t.sourceEntitySet === entityName);
    const navList = document.getElementById('meta-nav-list');
    const navSection = document.getElementById('meta-nav-section');

    if (traversal && traversal.navigations.length > 0) {
        navList.innerHTML = traversal.navigations.map((nav, i) => {
            const targetEntity = state.metaParsedData.simplifiedMetadata.find(e => e.entitySetName === nav.targetEntitySet);
            const fieldCount = targetEntity ? targetEntity.allProperties.length : '?';
            return `
                <label class="meta-nav-item">
                    <input type="checkbox" data-nav-idx="${i}" class="meta-nav-cb">
                    <span class="meta-nav-name">${nav.navigationProperty}</span>
                    <span class="meta-nav-detail">${nav.targetEntitySet} (${fieldCount} fields) ${nav.multiplicityLabel}</span>
                </label>`;
        }).join('');
        navSection.classList.remove('hidden');
    } else {
        navList.innerHTML = '<div style="color:var(--text-dim);font-size:12px;">No navigations available</div>';
        navSection.classList.remove('hidden');
    }
}

/**
 * Build formToBeSent JSON from selected entity + checked navigations.
 * - Entity properties → flat key-value pairs
 * - Checked navigations → to_NavName: [{ ...target entity properties }]
 */
function generateFromMetadata() {
    if (!state.metaParsedData || !state.metaSelectedEntity) {
        showToast('Select an entity first', 'error');
        return;
    }

    const entityName = state.metaSelectedEntity;
    const entity = state.metaParsedData.simplifiedMetadata.find(e => e.entitySetName === entityName);
    if (!entity) return;

    // Build the base JSON from entity properties
    const formJson = {};
    for (const prop of entity.allProperties) {
        formJson[prop.name] = edmDefaultValue(prop.type);
    }

    // Add checked navigations as nested arrays
    const traversal = state.metaParsedData.traversingMap.find(t => t.sourceEntitySet === entityName);
    if (traversal) {
        const checkedCbs = document.querySelectorAll('.meta-nav-cb:checked');
        checkedCbs.forEach(cb => {
            const idx = parseInt(cb.dataset.navIdx);
            const nav = traversal.navigations[idx];
            if (!nav) return;

            const targetEntity = state.metaParsedData.simplifiedMetadata.find(e => e.entitySetName === nav.targetEntitySet);
            if (targetEntity) {
                const navObj = {};
                for (const prop of targetEntity.allProperties) {
                    navObj[prop.name] = edmDefaultValue(prop.type);
                }
                formJson[nav.navigationProperty] = [navObj];
            }
        });
    }

    // Write into the JSON editor
    const editor = document.getElementById('form-json-editor');
    editor.value = JSON.stringify(formJson, null, 2);
    autoGrow(editor);

    // Persist to tool
    const tool = state.agents[state.currentAgent].tools[state.currentTool];
    tool.formToBeSent = formJson;

    // Also populate the form editor
    state.sampleFormDef = jsonToFormDef(formJson);
    renderFormEditor();

    publishToUI5();
    showToast(`Generated from ${entityName}`, 'success');
}

/** Map Edm types to sensible default empty values */
function edmDefaultValue(edmType) {
    if (!edmType) return '';
    const t = edmType.toLowerCase();
    if (t.includes('boolean') || t.includes('bool')) return false;
    if (t.includes('int') || t.includes('decimal') || t.includes('double') || t.includes('float') || t.includes('byte') || t.includes('single')) return 0;
    return '';
}

// ═══════════════════════════════════════════════════════════
//  Function — API Calls CRUD
// ═══════════════════════════════════════════════════════════
function renderApiCalls() {
    const container = document.getElementById('api-calls-list');
    if (!state.apiCalls || state.apiCalls.length === 0) {
        container.innerHTML = '<div class="fe-empty">No API calls. Click "+ Add API Call" to start.</div>';
        return;
    }
    container.innerHTML = state.apiCalls.map((ac, i) => {
        const op = ac.operation || 'Read';

        let extraFieldsHtml = '';
        if (op === 'Read') {
            extraFieldsHtml = `
                <div style="margin-top:8px;">
                    <span class="fe-label">Query Fields (comma separated)</span>
                    <input class="fe-input fe-input-wide" value="${escHtml(ac.queryFields || '')}" onchange="updateApiCall(${i},'queryFields',this.value)" placeholder="e.g. userId, status">
                </div>
            `;
        } else {
            extraFieldsHtml = `
                <div style="margin-top:8px;">
                    <span class="fe-label">Key Fields (comma separated)</span>
                    <input class="fe-input fe-input-wide" value="${escHtml(ac.keyFields || '')}" onchange="updateApiCall(${i},'keyFields',this.value)" placeholder="e.g. ID, orderNumber">
                </div>
            `;
        }

        return `
            <div class="api-call-row" style="flex-direction:column; align-items:flex-start;">
                <div style="display:flex; width:100%; align-items:center; gap:8px;">
                    <button class="btn-delete" onclick="deleteApiCall(${i})" title="Delete">&times;</button>
                    <span class="fe-label">Label</span>
                    <input class="fe-input" style="flex:1" value="${escHtml(ac.label || '')}" onchange="updateApiCall(${i},'label',this.value)">
                    
                    <span class="fe-label">Service</span>
                    <input class="fe-input" style="flex:1" value="${escHtml(ac.serviceName || '')}" onchange="updateApiCall(${i},'serviceName',this.value)">
                    
                    <span class="fe-label">EntitySet</span>
                    <input class="fe-input" style="flex:1" value="${escHtml(ac.entitySetName || '')}" onchange="updateApiCall(${i},'entitySetName',this.value)">
                    
                    <span class="fe-label">Operation</span>
                    <select class="fe-select" onchange="updateApiCall(${i},'operation',this.value)">
                        <option value="Read" ${op === 'Read' ? 'selected' : ''}>Read</option>
                        <option value="Create" ${op === 'Create' ? 'selected' : ''}>Create</option>
                        <option value="Update" ${op === 'Update' ? 'selected' : ''}>Update</option>
                        <option value="Delete" ${op === 'Delete' ? 'selected' : ''}>Delete</option>
                    </select>
                </div>
                ${extraFieldsHtml}
            </div>
        `;
    }).join('');
}

function addApiCall() {
    state.apiCalls.push({ label: '', serviceName: '', entitySetName: '' });
    renderApiCalls();
    generateFunctionCode();
}

function deleteApiCall(idx) {
    state.apiCalls.splice(idx, 1);
    renderApiCalls();
    generateFunctionCode();
}

function updateApiCall(idx, prop, value) {
    state.apiCalls[idx][prop] = value;
    if (prop === 'operation') {
        renderApiCalls(); // re-render to switch extra fields input
    }
    generateFunctionCode();
}

function generateFunctionCode() {
    const preview = document.getElementById('fn-code-preview');
    const calls = (state.apiCalls || []).filter(c => c.label || c.serviceName || c.entitySetName);
    if (calls.length === 0) {
        preview.value = '// No API calls defined yet';
        return;
    }

    const lines = [
        'async (cds, inputPayload) => {',
        '    const results = [];',
        '',
    ];

    calls.forEach((ac, i) => {
        const label = ac.label || `result${i}`;
        const svc = ac.serviceName || 'UnknownService';
        const entity = ac.entitySetName || 'UnknownEntity';
        const op = ac.operation || 'Read';
        const queryFields = ac.queryFields ? ac.queryFields.split(',').map(s => s.trim()).filter(s => s) : [];
        const keyFields = ac.keyFields ? ac.keyFields.split(',').map(s => s.trim()).filter(s => s) : [];

        lines.push(`    // ${label} (${op})`);
        lines.push(`    const srv${i} = await cds.connect.to('${svc}');`);

        if (op === 'Read') {
            lines.push(`    const condition${i} = {};`);
            if (queryFields.length > 0) {
                queryFields.forEach(f => {
                    lines.push(`    if (inputPayload['${f}'] !== undefined && inputPayload['${f}'] !== '') { condition${i}['${f}'] = inputPayload['${f}']; }`);
                });
            } else {
                lines.push(`    for (const key in inputPayload) {`);
                lines.push(`        if (inputPayload[key] !== undefined && inputPayload[key] !== '') { condition${i}[key] = inputPayload[key]; }`);
                lines.push(`    }`);
            }
            lines.push(`    const query${i} = Object.keys(condition${i}).length > 0 ? SELECT.from('${entity}').where(condition${i}) : SELECT.from('${entity}');`);
            lines.push(`    const data${i} = await srv${i}.run(query${i});`);
            lines.push(`    results.push({ ${label}: data${i} });`);
        } else {
            lines.push(`    const keyObj${i} = {};`);
            if (keyFields.length > 0) {
                keyFields.forEach(k => {
                    lines.push(`    keyObj${i}['${k}'] = inputPayload['${k}'];`);
                });
            } else {
                lines.push(`    // No keys defined. Beware this might affect multiple records!`);
            }

            lines.push(`    const dataObj${i} = { ...inputPayload }; // Customize payload mapped to fields as needed`);

            if (op === 'Create') {
                lines.push(`    const query${i} = INSERT.into('${entity}').entries(dataObj${i});`);
                lines.push(`    const data${i} = await srv${i}.run(query${i});`);
                lines.push(`    results.push({ ${label}: data${i} || 'Created successfully' });`);
            } else if (op === 'Update') {
                lines.push(`    const query${i} = UPDATE('${entity}').with(dataObj${i}).where(keyObj${i});`);
                lines.push(`    const data${i} = await srv${i}.run(query${i});`);
                lines.push(`    results.push({ ${label}: data${i} || 'Updated successfully' });`);
            } else if (op === 'Delete') {
                lines.push(`    const query${i} = DELETE.from('${entity}').where(keyObj${i});`);
                lines.push(`    const data${i} = await srv${i}.run(query${i});`);
                lines.push(`    results.push({ ${label}: data${i} || 'Deleted successfully' });`);
            }
        }
        lines.push('');
    });

    lines.push('    return results;');
    lines.push('}');

    preview.value = lines.join('\n');
    autoGrow(preview);
    publishToUI5();
    renderVisualMode(); // Update visual representation
}

function switchFuncTab(mode) {
    document.getElementById('btn-func-visual').classList.toggle('active', mode === 'visual');
    document.getElementById('btn-func-developer').classList.toggle('active', mode === 'developer');
    document.getElementById('func-panel-visual').style.display = mode === 'visual' ? '' : 'none';
    document.getElementById('func-panel-developer').style.display = mode === 'developer' ? '' : 'none';
    if (mode === 'visual') renderVisualMode();
    if (mode === 'developer') {
        const payloadArea = document.getElementById('fn-payload-json');
        if (!payloadArea.value) syncPayloadFromForm();
        renderPayloadForm();
        autoGrow(payloadArea);
    }
}

function switchPayloadTab(mode) {
    document.getElementById('btn-payload-visual').classList.toggle('active', mode === 'visual');
    document.getElementById('btn-payload-json').classList.toggle('active', mode === 'json');
    document.getElementById('payload-panel-visual').style.display = mode === 'visual' ? '' : 'none';
    document.getElementById('payload-panel-json').style.display = mode === 'json' ? '' : 'none';
    if (mode === 'visual') renderPayloadForm();
}

function renderPayloadForm() {
    const container = document.getElementById('payload-form-content');
    if (!container) return;
    const jsonStr = document.getElementById('fn-payload-json').value;
    let currentData = {};
    try { currentData = JSON.parse(jsonStr || '{}'); } catch (e) { }

    if (!state.sampleFormDef || state.sampleFormDef.length === 0) {
        container.innerHTML = '<div style="color:var(--text-dim); font-style: italic; font-size:12px;">No fields defined in Sample Form. Go to Sample Form section to add fields.</div>';
        return;
    }

    container.innerHTML = state.sampleFormDef.map(field => {
        const val = currentData[field.label];
        const label = field.fieldLabel || field.label;

        if (field.type === 'table') {
            return `
                <div class="payload-field-group" style="border: 1px solid var(--border); padding: 10px; border-radius: var(--radius-sm); background: var(--bg-surface);">
                    <label style="font-size:12px; font-weight:700; display:block; margin-bottom:6px; color: var(--primary-light);">${label} (Table/Array)</label>
                    <div style="color:var(--text-dim); font-size:11px; font-style: italic;">Nested data structures should be managed via the JSON Editor tab for full control.</div>
                </div>
            `;
        }

        let inputHtml = '';
        if (field.type === 'Checkbox') {
            inputHtml = `<input type="checkbox" ${val ? 'checked' : ''} onchange="updatePayloadValue('${field.label}', this.checked)">`;
        } else if (field.type === 'Date') {
            inputHtml = `<input type="date" class="form-input" style="height:32px; font-size:13px;" value="${val || ''}" oninput="updatePayloadValue('${field.label}', this.value)">`;
        } else {
            inputHtml = `<input class="form-input" placeholder="Enter ${label}..." style="height:32px; font-size:13px;" value="${val || ''}" oninput="updatePayloadValue('${field.label}', this.value)">`;
        }

        return `
            <div class="payload-field-group" style="display:flex; align-items:center; gap:12px;">
                <label style="font-size:12px; font-weight:500; min-width:140px; color: var(--text-muted);">${label}:</label>
                <div style="flex:1;">${inputHtml}</div>
            </div>
        `;
    }).join('');
}

function updatePayloadValue(key, val) {
    const area = document.getElementById('fn-payload-json');
    try {
        const data = JSON.parse(area.value || '{}');
        data[key] = val;
        area.value = JSON.stringify(data, null, 2);
    } catch (e) { }
}

function renderVisualMode() {
    const container = document.getElementById('func-visual-content');
    if (!container) return;

    const calls = (state.apiCalls || []).filter(c => c.label || c.serviceName || c.entitySetName);
    if (calls.length === 0) {
        container.innerHTML = '<div style="color:var(--text-dim); font-style: italic;">No logic defined yet. Add API calls first.</div>';
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
    calls.forEach((ac, i) => {
        const op = ac.operation || 'Read';
        const svc = ac.serviceName || 'UnknownService';
        const ent = ac.entitySetName || 'UnknownEntity';
        const label = ac.label || `Step ${i + 1}`;

        let desc = '';
        if (op === 'Read') {
            const q = ac.queryFields ? ` filtering by <strong>${ac.queryFields}</strong>` : '';
            desc = `Read data from <strong>${ent}</strong> in <strong>${svc}</strong>${q}.`;
        } else if (op === 'Create') {
            desc = `Create a new record in <strong>${ent}</strong> (<strong>${svc}</strong>) using the input data.`;
        } else if (op === 'Update') {
            desc = `Update a record in <strong>${ent}</strong> (<strong>${svc}</strong>) where keys match input data.`;
        } else if (op === 'Delete') {
            desc = `Delete a record from <strong>${ent}</strong> (<strong>${svc}</strong>) where keys match input data.`;
        }

        html += `
            <div style="background: var(--bg-surface); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); border-left: 4px solid var(--primary);">
                <div style="font-weight: 700; color: var(--primary-light); margin-bottom: 4px; font-size: 13px;">${label}</div>
                <div style="font-size: 14px; color: var(--text);">${desc}</div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function syncPayloadFromForm() {
    const payload = {};
    const extractFields = (fields) => {
        fields.forEach(f => {
            if (f.type === 'table') {
                // For tables, we usually send an array with one dummy record structure
                const nested = {};
                (f.table || []).forEach(nf => {
                    nested[nf.label] = nf.type === 'Checkbox' ? false : (nf.type === 'Date' ? '2023-01-01' : '');
                });
                payload[f.label] = [nested];
            } else {
                payload[f.label] = f.type === 'Checkbox' ? false : (f.type === 'Date' ? '2023-01-01' : '');
            }
        });
    }
    extractFields(state.sampleFormDef || []);
    const area = document.getElementById('fn-payload-json');
    area.value = JSON.stringify(payload, null, 2);
    autoGrow(area);
    renderPayloadForm();
}

function testRemote() {
    const functionCode = document.getElementById('fn-code-preview').value;
    const payloadStr = document.getElementById('fn-payload-json').value;
    let payload = {};
    try {
        payload = JSON.parse(payloadStr);
    } catch {
        showToast('Invalid Payload JSON', 'error');
        return;
    }

    window.parent.postMessage({
        action: 'testRemote',
        functionCode: functionCode,
        inputPayload: payload
    }, '*');
    showToast('Sent to remote test...', 'success');
}

// ═══════════════════════════════════════════════════════════
//  Function — Node Graph Workflow Builder
// ═══════════════════════════════════════════════════════════

const NODE_TYPES = {
    insertPayload: { name: 'Insert Payload', hasInput: false, hasOutput: true },
    createSubset: { name: 'Payload Subset', hasInput: true, hasOutput: true },
    apiCall: { name: 'API Call', hasInput: true, hasOutput: true },
    customFunction: { name: 'Custom Function', hasInput: true, hasOutput: true },
    returnObject: { name: 'Return Object', hasInput: true, hasOutput: false },
};

// Graph state
if (!state.graphNodes) state.graphNodes = [];
if (!state.graphEdges) state.graphEdges = [];

let _ngDraggingNodeId = null;
let _ngDragOffset = { x: 0, y: 0 };
let _ngConnecting = null; // { fromNodeId, fromPort }
let _ngTempLine = null;
let _ngSelectedNode = null;
let _ngSelectedEdge = null; // { from, to }
let _ngIsPanning = false;
let _ngPanStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };
let _ngZoom = 1;
let _ngIsFullscreen = false;

function _uid() {
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Zoom & Fullscreen ──────────────────────────────────
function applyZoom() {
    const inner = document.getElementById('node-graph-inner');
    const label = document.getElementById('ng-zoom-label');
    if (inner) inner.style.transform = `scale(${_ngZoom})`;
    if (label) label.textContent = Math.round(_ngZoom * 100) + '%';
    drawEdges();
}

function ngZoom(delta) {
    _ngZoom = Math.min(3, Math.max(0.25, _ngZoom + delta));
    applyZoom();
}

function ngZoomFit() {
    _ngZoom = 1;
    applyZoom();
    const viewport = document.getElementById('node-graph-viewport');
    if (viewport) { viewport.scrollLeft = 0; viewport.scrollTop = 0; }
}

function toggleNodeGraphFullscreen() {
    const workspace = document.getElementById('dnd-workspace');
    if (!workspace) return;
    _ngIsFullscreen = !_ngIsFullscreen;
    workspace.classList.toggle('fullscreen', _ngIsFullscreen);

    // Clear any active connection on resize
    _ngConnecting = null;
    document.querySelectorAll('.graph-port.connecting').forEach(p => p.classList.remove('connecting'));
    removeTempLine();

    // If entering fullscreen, make sure palette is visible
    if (_ngIsFullscreen) {
        const palette = document.getElementById('dnd-palette');
        if (palette) palette.classList.remove('collapsed');
    }

    // Refresh display
    renderNodeGraph();

    // Update button icon
    const btn = document.getElementById('ng-fullscreen-btn');
    if (btn) {
        btn.innerHTML = _ngIsFullscreen
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3"/><path d="M21 8V5a2 2 0 00-2-2h-3"/><path d="M3 16v3a2 2 0 002 2h3"/><path d="M16 21h3a2 2 0 002-2v-3"/></svg>';
        btn.title = _ngIsFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen';
    }
}

function toggleDndPalette() {
    const palette = document.getElementById('dnd-palette');
    if (palette) {
        palette.classList.toggle('collapsed');
    }
}

// Keyboard shortcuts (Escape, Delete)
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _ngIsFullscreen) {
        toggleNodeGraphFullscreen();
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

        if (_ngSelectedEdge) {
            deleteEdge(_ngSelectedEdge.from, _ngSelectedEdge.to);
            _ngSelectedEdge = null;
        } else if (_ngSelectedNode) {
            deleteGraphNode(_ngSelectedNode);
            _ngSelectedNode = null;
        }
    }
});

// ── Palette drag → canvas drop ─────────────────────────
function initNodeGraphListeners() {
    const viewport = document.getElementById('node-graph-viewport');
    if (!viewport) return;

    // Palette drag start
    document.querySelectorAll('.dnd-block-source').forEach(el => {
        el.addEventListener('dragstart', e => {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', el.dataset.blockType);
        });
    });

    // Viewport drop
    viewport.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    viewport.addEventListener('drop', e => {
        e.preventDefault();
        const type = e.dataTransfer.getData('text/plain');
        if (!NODE_TYPES[type]) return;

        const rect = viewport.getBoundingClientRect();
        // Account for zoom when calculating canvas coordinates
        const x = (e.clientX - rect.left + viewport.scrollLeft) / _ngZoom - 110;
        const y = (e.clientY - rect.top + viewport.scrollTop) / _ngZoom - 30;

        addGraphNode(type, Math.max(20, x), Math.max(20, y));
    });

    // Scroll-to-zoom (mouse wheel)
    viewport.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.08 : -0.08;
        const oldZoom = _ngZoom;
        _ngZoom = Math.min(3, Math.max(0.25, _ngZoom + delta));

        // Zoom toward cursor position
        const rect = viewport.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const ratio = _ngZoom / oldZoom;

        viewport.scrollLeft = (viewport.scrollLeft + mx) * ratio - mx;
        viewport.scrollTop = (viewport.scrollTop + my) * ratio - my;

        applyZoom();
    }, { passive: false });

    // Click on empty area to deselect and handle Panning
    viewport.addEventListener('mousedown', e => {
        const isClickingCanvas = e.target === viewport || e.target.classList.contains('node-graph-nodes') || e.target.classList.contains('node-graph-inner') || e.target.closest('.node-graph-svg');
        const isClickingNodeOrPort = e.target.closest('.graph-node') || e.target.closest('.graph-port');

        if (isClickingCanvas && !isClickingNodeOrPort && !e.target.closest('.node-connection') && !e.target.closest('.node-connection-hitarea')) {
            _ngSelectedNode = null;
            _ngSelectedEdge = null;
            document.querySelectorAll('.graph-node.selected').forEach(n => n.classList.remove('selected'));
            document.querySelectorAll('.node-connection.selected').forEach(l => l.classList.remove('selected'));

            // Start Panning
            _ngIsPanning = true;
            _ngPanStart = {
                x: e.clientX,
                y: e.clientY,
                scrollLeft: viewport.scrollLeft,
                scrollTop: viewport.scrollTop
            };
            viewport.classList.add('panning');

            // Cancel connecting
            if (_ngConnecting) {
                _ngConnecting = null;
                document.querySelectorAll('.graph-port.connecting').forEach(p => p.classList.remove('connecting'));
                removeTempLine();
            }
        }
    });

    window.addEventListener('mouseup', () => {
        _ngIsPanning = false;
        viewport.classList.remove('panning');
    });

    // Mouse move for temp connection line
    viewport.addEventListener('mousemove', e => {
        if (_ngIsPanning) {
            const dx = e.clientX - _ngPanStart.x;
            const dy = e.clientY - _ngPanStart.y;
            viewport.scrollLeft = _ngPanStart.scrollLeft - dx;
            viewport.scrollTop = _ngPanStart.scrollTop - dy;
            return;
        }

        if (_ngConnecting) {
            const rect = viewport.getBoundingClientRect();
            const mx = (e.clientX - rect.left + viewport.scrollLeft) / _ngZoom;
            const my = (e.clientY - rect.top + viewport.scrollTop) / _ngZoom;
            drawTempLine(_ngConnecting.x, _ngConnecting.y, mx, my);
        }
    });

    // Mouse up to cancel connecting if clicking empty space
    viewport.addEventListener('mouseup', e => {
        if (_ngConnecting && !e.target.closest('.graph-port')) {
            _ngConnecting = null;
            document.querySelectorAll('.graph-port.connecting').forEach(p => p.classList.remove('connecting'));
            removeTempLine();
        }
    });
}

function checkPlayEnabled() {
    const btn = document.getElementById('ng-play-btn');
    if (!btn) return;
    const hasInputNode = (state.graphNodes || []).some(n => n.type === 'insertPayload');
    btn.disabled = !hasInputNode;
}

function executeWorkflowTest() {
    if (state.currentAgent === null || state.currentTool === null) {
        showToast('Please select a tool first', 'warning');
        return;
    }
    const tool = state.agents[state.currentAgent].tools[state.currentTool];
    const inputNode = (state.graphNodes || []).find(n => n.type === 'insertPayload');
    const inputPayload = inputNode ? inputNode.payload : '';

    if (!inputPayload || !inputPayload.trim()) {
        showToast('Input payload is mandatory for execution', 'warning');
        return;
    }

    // Send message to UI5 wrapping app
    window.parent.postMessage({
        action: 'executeWorkflow',
        toolName: tool.toolName,
        testMode: true,
        inputPayload: inputPayload
    }, '*');
}

// ── Node CRUD ──────────────────────────────────────────
function addGraphNode(type, x, y) {
    const node = {
        id: _uid(),
        type: type,
        x: x,
        y: y,
    };
    // Type-specific defaults
    if (type === 'insertPayload') node.payload = '{\n}';
    if (type === 'createSubset') { node.fields = ''; node.inputPayloadPreview = ''; }
    if (type === 'apiCall') {
        node.serviceName = '';
        node.entitySet = '';
        node.crudType = 'READ';
        node.apiType = 'oData';
        node.oDataType = 'Entity';
        node.expands = [];
    }
    if (type === 'customFunction') {
        node.functionBody = 'async function(input1) {\n    return [];\n}';
    }
    if (type === 'returnObject') { node.returnType = 'default'; node.returnLabels = []; }

    state.graphNodes.push(node);
    renderNodeGraph();
    showToast(`Added ${NODE_TYPES[type].name}`, 'success');
}

function deleteGraphNode(nodeId) {
    state.graphNodes = state.graphNodes.filter(n => n.id !== nodeId);
    state.graphEdges = state.graphEdges.filter(e => e.from !== nodeId && e.to !== nodeId);
    if (_ngSelectedNode === nodeId) _ngSelectedNode = null;
    renderNodeGraph();
}

function updateGraphNode(nodeId, prop, value) {
    const node = state.graphNodes.find(n => n.id === nodeId);
    if (node) node[prop] = value;
}

function addReturnLabel(nodeId) {
    const node = state.graphNodes.find(n => n.id === nodeId);
    if (!node) return;
    if (!node.returnLabels) node.returnLabels = [];
    node.returnLabels.push('');
    renderNodeGraph();
}

function updateReturnLabel(nodeId, index, value) {
    const node = state.graphNodes.find(n => n.id === nodeId);
    if (node && node.returnLabels) node.returnLabels[index] = value;
}

function removeReturnLabel(nodeId, index) {
    const node = state.graphNodes.find(n => n.id === nodeId);
    if (node && node.returnLabels) {
        node.returnLabels.splice(index, 1);
        renderNodeGraph();
    }
}

function addExpand(nodeId) {
    const node = state.graphNodes.find(n => n.id === nodeId);
    if (!node) return;
    if (!node.expands) node.expands = [];
    node.expands.push({ id: _uid(), name: '', expands: [] });
    renderNodeGraph();
}

function addExpandChild(nodeId, parentId) {
    const node = state.graphNodes.find(n => n.id === nodeId);
    if (!node || !node.expands) return;
    const findAndAdd = (list) => {
        for (const item of list) {
            if (item.id === parentId) {
                if (!item.expands) item.expands = [];
                item.expands.push({ id: _uid(), name: '', expands: [] });
                return true;
            }
            if (item.expands && findAndAdd(item.expands)) return true;
        }
        return false;
    };
    findAndAdd(node.expands);
    renderNodeGraph();
}

function updateExpandProp(nodeId, expandId, prop, value) {
    const node = state.graphNodes.find(n => n.id === nodeId);
    if (!node || !node.expands) return;
    const findAndUpdate = (list) => {
        for (const item of list) {
            if (item.id === expandId) {
                item[prop] = value;
                return true;
            }
            if (item.expands && findAndUpdate(item.expands)) return true;
        }
        return false;
    };
    findAndUpdate(node.expands);
}

function removeExpandById(nodeId, expandId) {
    const node = state.graphNodes.find(n => n.id === nodeId);
    if (!node || !node.expands) return;
    const findAndRemove = (list) => {
        for (let i = 0; i < list.length; i++) {
            if (list[i].id === expandId) {
                list.splice(i, 1);
                return true;
            }
            if (list[i].expands && findAndRemove(list[i].expands)) return true;
        }
        return false;
    };
    findAndRemove(node.expands);
    renderNodeGraph();
}

// ── Connections ────────────────────────────────────────
function startConnection(nodeId, port, portEl) {
    if (_ngConnecting) {
        // Completing connection
        if (_ngConnecting.fromNodeId === nodeId) {
            // Can't connect to self
            _ngConnecting = null;
            document.querySelectorAll('.graph-port.connecting').forEach(p => p.classList.remove('connecting'));
            removeTempLine();
            return;
        }

        // Determine direction: output → input
        let fromId, toId;
        if (_ngConnecting.fromPort === 'output' && port === 'input') {
            fromId = _ngConnecting.fromNodeId;
            toId = nodeId;
        } else if (_ngConnecting.fromPort === 'input' && port === 'output') {
            fromId = nodeId;
            toId = _ngConnecting.fromNodeId;
        } else {
            // Invalid connection (same port type)
            showToast('Connect output → input', 'error');
            _ngConnecting = null;
            document.querySelectorAll('.graph-port.connecting').forEach(p => p.classList.remove('connecting'));
            removeTempLine();
            return;
        }

        // Check if edge already exists
        const exists = state.graphEdges.some(e => e.from === fromId && e.to === toId);
        if (!exists) {
            state.graphEdges.push({ from: fromId, to: toId });
            // Update custom function input count
            updateCustomFunctionInputs(toId);
        }

        _ngConnecting = null;
        document.querySelectorAll('.graph-port.connecting').forEach(p => p.classList.remove('connecting'));
        removeTempLine();
        renderNodeGraph();
    } else {
        // Starting connection
        const portDot = portEl.querySelector('.graph-port-dot');
        const viewport = document.getElementById('node-graph-viewport');
        const vpRect = viewport.getBoundingClientRect();
        const dotRect = portDot.getBoundingClientRect();

        _ngConnecting = {
            fromNodeId: nodeId,
            fromPort: port,
            x: (dotRect.left - vpRect.left + viewport.scrollLeft) / _ngZoom + 6 / _ngZoom,
            y: (dotRect.top - vpRect.top + viewport.scrollTop) / _ngZoom + 6 / _ngZoom,
        };
        portEl.classList.add('connecting');
    }
}

function deleteEdge(fromId, toId) {
    state.graphEdges = state.graphEdges.filter(e => !(e.from === fromId && e.to === toId));
    updateCustomFunctionInputs(toId);
    renderNodeGraph();
}

function updateCustomFunctionInputs(nodeId) {
    const node = state.graphNodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'customFunction') return;
    // Count incoming edges
    const inCount = state.graphEdges.filter(e => e.to === nodeId).length;
    node._inputCount = inCount;

    // Optional: Auto-update template if it looks like the default
    const params = Array.from({ length: Math.max(1, inCount) }, (_, i) => `input${i + 1}`).join(', ');
    const defaultTemplate = `async function(${params}) {\n    return [];\n}`;

    // Check if it's currently a default-ish template
    const current = (node.functionBody || '').trim();
    if (!current || current === 'return [];' || current === 'return {};' || (current.startsWith('async function(') && current.endsWith('}')) || current.startsWith('// Write your logic')) {
        // Only auto-update if they haven't written custom logic yet
        // A simple check: if it contains "return [];" and nothing else substantial
        if (current.includes('return [];') || !current) {
            node.functionBody = defaultTemplate;
        }
    }
}

// Get payload JSON from a connected Insert Payload node
function getConnectedPayload(nodeId) {
    const inEdges = state.graphEdges.filter(e => e.to === nodeId);
    for (const edge of inEdges) {
        const srcNode = state.graphNodes.find(n => n.id === edge.from);
        if (srcNode && srcNode.type === 'insertPayload' && srcNode.payload) {
            return srcNode.payload;
        }
        // Recurse through intermediate nodes
        if (srcNode) {
            const upstream = getConnectedPayload(srcNode.id);
            if (upstream) return upstream;
        }
    }
    return null;
}

// Toggle a field in the subset fields list
function toggleSubsetField(nodeId, fieldName, checked) {
    const node = state.graphNodes.find(n => n.id === nodeId);
    if (!node) return;
    let fields = (node.fields || '').split(',').map(f => f.trim()).filter(f => f);
    if (checked) {
        if (!fields.includes(fieldName)) fields.push(fieldName);
    } else {
        fields = fields.filter(f => f !== fieldName);
    }
    node.fields = fields.join(', ');
    renderNodeGraph();
}

// ── Temp connection line ──────────────────────────────
function drawTempLine(x1, y1, x2, y2) {
    const svg = document.getElementById('node-graph-svg');
    removeTempLine();
    const dx = Math.abs(x2 - x1) * 0.5;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
    path.classList.add('node-connection-temp');
    path.id = 'temp-conn-line';
    svg.appendChild(path);
}

function removeTempLine() {
    const el = document.getElementById('temp-conn-line');
    if (el) el.remove();
}

// ── Node dragging ─────────────────────────────────────
function onNodeMouseDown(e, nodeId) {
    if (e.target.closest('.graph-port') || e.target.closest('.graph-node-delete') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    e.preventDefault();
    _ngDraggingNodeId = nodeId;
    _ngSelectedNode = nodeId;

    // Mark selected
    document.querySelectorAll('.graph-node.selected').forEach(n => n.classList.remove('selected'));
    document.getElementById('gn-' + nodeId)?.classList.add('selected');

    const node = state.graphNodes.find(n => n.id === nodeId);
    const viewport = document.getElementById('node-graph-viewport');
    const vpRect = viewport.getBoundingClientRect();

    // Account for zoom in offset calculation
    _ngDragOffset.x = (e.clientX - vpRect.left + viewport.scrollLeft) / _ngZoom - node.x;
    _ngDragOffset.y = (e.clientY - vpRect.top + viewport.scrollTop) / _ngZoom - node.y;

    const onMove = (me) => {
        if (!_ngDraggingNodeId) return;
        const nx = (me.clientX - vpRect.left + viewport.scrollLeft) / _ngZoom - _ngDragOffset.x;
        const ny = (me.clientY - vpRect.top + viewport.scrollTop) / _ngZoom - _ngDragOffset.y;
        node.x = Math.max(0, nx);
        node.y = Math.max(0, ny);

        const el = document.getElementById('gn-' + nodeId);
        if (el) {
            el.style.left = node.x + 'px';
            el.style.top = node.y + 'px';
        }
        drawEdges();
    };

    const onUp = () => {
        _ngDraggingNodeId = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// ── Render ────────────────────────────────────────────
function renderNodeGraph() {
    const container = document.getElementById('node-graph-nodes');
    const emptyEl = document.getElementById('node-graph-empty');
    const countEl = document.getElementById('dnd-step-count');
    if (!container) return;

    const nodes = state.graphNodes || [];
    countEl.textContent = `${nodes.length} node${nodes.length !== 1 ? 's' : ''}`;

    // Toggle Play Button
    const playBtn = document.getElementById('ng-play-btn');
    if (playBtn) {
        const hasInput = nodes.some(n => n.type === 'insertPayload' && (n.payload || '').trim().length > 0);
        playBtn.disabled = !hasInput;
    };

    if (nodes.length === 0) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.style.display = '';
        drawEdges();
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    container.innerHTML = nodes.map(node => {
        const meta = NODE_TYPES[node.type] || NODE_TYPES.insertPayload;
        const isSelected = _ngSelectedNode === node.id;

        let bodyHtml = '';
        if (node.type === 'insertPayload') {
            bodyHtml = `
                <label>JSON Payload</label>
                <textarea placeholder='{ "key": "value" }' onchange="updateGraphNode('${node.id}','payload',this.value)" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">${escHtml(node.payload || '{\n}')}</textarea>
            `;
        } else if (node.type === 'createSubset') {
            // Auto-populate input payload from connected Insert Payload node
            const connPayload = getConnectedPayload(node.id);
            let fieldCheckboxes = '';
            if (connPayload) {
                try {
                    const keys = Object.keys(JSON.parse(connPayload));
                    const selectedFields = (node.fields || '').split(',').map(f => f.trim()).filter(f => f);
                    if (keys.length > 0) {
                        fieldCheckboxes = '<div class="node-field-picker">' +
                            keys.map(k => {
                                const checked = selectedFields.includes(k) ? 'checked' : '';
                                return `<label class="node-checkbox"><input type="checkbox" ${checked} onchange="toggleSubsetField('${node.id}','${k}',this.checked)" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()"> ${escHtml(k)}</label>`;
                            }).join('') +
                            '</div>';
                    }
                } catch { /* invalid JSON */ }
            }
            bodyHtml = `
                <label>Input Payload</label>
                <textarea class="node-readonly-payload" readonly onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">${escHtml(connPayload || '(connect an Insert Payload block)')}</textarea>
                <label>Select Fields</label>
                ${fieldCheckboxes || '<input placeholder="e.g. firstName, lastName" value="' + escHtml(node.fields || '') + '" onchange="updateGraphNode(\'' + node.id + '\',\'fields\',this.value)" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">'}
                <p class="node-description">Extracts specified fields from incoming data.</p>
            `;
        } else if (node.type === 'apiCall') {
            const apiType = node.apiType || 'oData';
            const oDataType = node.oDataType || 'Entity';
            const crudType = node.crudType || 'READ';

            const apiTypeOpts = ['oData', 'REST'].map(t =>
                `<option value="${t}" ${apiType === t ? 'selected' : ''}>${t}</option>`
            ).join('');

            const oDataTypeOpts = ['Entity', 'Function Call'].map(t =>
                `<option value="${t}" ${oDataType === t ? 'selected' : ''}>${t}</option>`
            ).join('');

            const crudOpts = ['READ', 'CREATE', 'UPDATE', 'DELETE'].map(op =>
                `<option value="${op}" ${crudType === op ? 'selected' : ''}>${op}</option>`
            ).join('');

            let oDataDropdown = '';
            let expandHtml = '';
            if (apiType === 'oData') {
                oDataDropdown = `
                    <label>oData Type</label>
                    <select onchange="updateGraphNode('${node.id}','oDataType',this.value); renderNodeGraph()" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">
                        ${oDataTypeOpts}
                    </select>
                `;

                if (oDataType === 'Entity') {
                    const expands = node.expands || [];
                    const renderExpandTreeUI = (list, level = 0) => {
                        if (!list || list.length === 0) return '';
                        return list.map((exp) => `
                            <div class="expand-entry" style="margin-left: ${level * 10}px; margin-top: 4px;">
                                <div style="display:flex; gap:3px; align-items:center;">
                                    <input placeholder="Property (e.g. Items)" value="${escHtml(exp.name)}"
                                           onchange="updateExpandProp('${node.id}', '${exp.id}', 'name', this.value)"
                                           onclick="event.stopPropagation()" onmousedown="event.stopPropagation()"
                                           style="flex:1; font-size:10px; padding:2px 4px; border-radius:2px; height:20px; line-height:20px; border:1px solid var(--border); background:var(--bg);">
                                    <button onclick="event.stopPropagation(); addExpandChild('${node.id}', '${exp.id}')"
                                            title="Add sub-expand"
                                            style="border:none; background:none; color:var(--primary-light); cursor:pointer; font-size:14px; padding:0 2px; font-weight:bold;">+</button>
                                    <button onclick="event.stopPropagation(); removeExpandById('${node.id}', '${exp.id}')"
                                            title="Remove"
                                            style="border:none; background:none; color:var(--error-light); cursor:pointer; font-size:14px; padding:0 2px;">&times;</button>
                                </div>
                                ${renderExpandTreeUI(exp.expands, level + 1)}
                            </div>
                        `).join('');
                    };

                    expandHtml = `
                        <label>Expands (Graphical Tree)</label>
                        <div class="node-expands-list" style="background: rgba(0,0,0,0.1); padding: 6px; border-radius: 4px; margin-top: 4px;">
                            ${renderExpandTreeUI(expands)}
                            <button onclick="event.stopPropagation(); addExpand('${node.id}')" 
                                    style="width:100%; padding:4px; font-size:10px; border:1px dashed var(--border); background:var(--bg-elevated); color:var(--text-dim); border-radius:4px; cursor:pointer; margin-top:6px; transition:all 0.2s;">
                                + Add Root Navigation
                            </button>
                        </div>
                    `;
                }
            }

            bodyHtml = `
                <label>API Style</label>
                <select onchange="updateGraphNode('${node.id}','apiType',this.value); renderNodeGraph()" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">
                    ${apiTypeOpts}
                </select>
                ${oDataDropdown}
                <label>Operation</label>
                <select onchange="updateGraphNode('${node.id}','crudType',this.value)" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">
                    ${crudOpts}
                </select>
                <label>Service Name</label>
                <input placeholder="e.g. HRService" value="${escHtml(node.serviceName || '')}"
                       onchange="updateGraphNode('${node.id}','serviceName',this.value)" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">
                <label>${oDataType === 'Function Call' ? 'Function Name' : 'EntitySet'}</label>
                <input placeholder="${oDataType === 'Function Call' ? 'e.g. getDetails' : 'e.g. Employees'}" value="${escHtml(node.entitySet || '')}"
                       onchange="updateGraphNode('${node.id}','entitySet',this.value)" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">
                ${expandHtml}
            `;
        } else if (node.type === 'customFunction') {
            const inCount = state.graphEdges.filter(e => e.to === node.id).length;
            bodyHtml = `
                <label>Custom Logic (JavaScript)</label>
                <textarea onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" 
                          onchange="updateGraphNode('${node.id}','functionBody',this.value)"
                          style="font-family: monospace; white-space: pre;"
                          placeholder="async function(input1) { ... }">${escHtml(node.functionBody || 'async function(input1) {\n    return [];\n}')}</textarea>
                <p class="node-description">${inCount} input${inCount !== 1 ? 's' : ''} connected</p>
            `;
        } else if (node.type === 'returnObject') {
            const retTypeOpts = ['default', 'multi'].map(op =>
                `<option value="${op}" ${(!node.returnType && op === 'default') || node.returnType === op ? 'selected' : ''}>${op}</option>`
            ).join('');
            let multiHtml = '';
            if (node.returnType === 'multi') {
                const labels = node.returnLabels || [];
                multiHtml = `<div class="node-return-labels" style="margin-top:8px;">
                    ${labels.map((lbl, idx) => `
                        <div style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">
                            <div class="graph-port in-port" onclick="event.stopPropagation();startConnection('${node.id}','input',this)" style="padding:0; margin-left:-6px; cursor:crosshair; display:flex; align-items:center; opacity:0.8;">
                                <div class="graph-port-dot"></div>
                            </div>
                            <span style="font-size:10px; font-weight:700; color:var(--primary-light); cursor:default; user-select:none;">IN</span>
                            <input placeholder="Label ${idx + 1}" value="${escHtml(lbl)}" 
                                   onchange="updateReturnLabel('${node.id}', ${idx}, this.value)" 
                                   onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" style="flex:1; margin-left:4px;">
                            <button onclick="event.stopPropagation(); removeReturnLabel('${node.id}', ${idx})" style="padding:2px 4px; border:none; background:none; color:var(--text-dim); cursor:pointer;">&times;</button>
                        </div>
                    `).join('')}
                    <button onclick="event.stopPropagation(); addReturnLabel('${node.id}')" 
                            style="margin-top:10px; padding:6px 14px; font-size:12px; font-weight:600; cursor:pointer; border-radius:20px; border:1px solid var(--border); background:linear-gradient(135deg, var(--bg-hover) 0%, var(--bg-elevated) 100%); color:var(--primary-light); display:flex; align-items:center; justify-content:center; width:fit-content; margin-left:auto; margin-right:auto; box-shadow:0 2px 5px rgba(0,0,0,0.2); transition:transform 0.1s ease, filter 0.2s ease;">
                        + Add Input
                    </button>
                    ${labels.length === 0 ? '<p class="node-description" style="margin-top:4px; text-align:center;">Add inputs to return a structured JSON object.</p>' : ''}
                </div>`;
            }
            bodyHtml = `
                <label>Return Type</label>
                <select onchange="updateGraphNode('${node.id}','returnType',this.value); renderNodeGraph()" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">
                    ${retTypeOpts}
                </select>
                ${multiHtml}
                <p class="node-description" style="margin-top:8px;">Returns result(s) to caller.</p>
                ${node.returnType === 'multi' ? `<p class="node-description" style="margin-top:4px;">${state.graphEdges.filter(e => e.to === node.id).length} connection(s) mapped</p>` : ''}
            `;
        }

        // Ports
        let portsHtml = '<div class="graph-node-ports">';
        if (meta.hasInput && !(node.type === 'returnObject' && node.returnType === 'multi')) {
            portsHtml += `<div class="graph-port-group in-port-group">
                <div class="graph-port in-port" onclick="event.stopPropagation();startConnection('${node.id}','input',this)">
                    <div class="graph-port-dot"></div>
                    <span class="graph-port-label">In</span>
                </div>
            </div>`;
        } else {
            portsHtml += `<div class="graph-port-group in-port-group"></div>`;
        }
        if (meta.hasOutput) {
            portsHtml += `<div class="graph-port-group out-port-group" style="align-items:flex-end;">
                <div class="graph-port out-port" onclick="event.stopPropagation();startConnection('${node.id}','output',this)" style="flex-direction:row-reverse;">
                    <div class="graph-port-dot"></div>
                    <span class="graph-port-label">Out</span>
                </div>
            </div>`;
        } else {
            portsHtml += `<div class="graph-port-group out-port-group"></div>`;
        }
        portsHtml += '</div>';

        return `
            <div class="graph-node ${isSelected ? 'selected' : ''}" id="gn-${node.id}"
                 style="left:${node.x}px; top:${node.y}px;"
                 onmousedown="onNodeMouseDown(event,'${node.id}')">
                <div class="graph-node-header type-${node.type}">
                    <div class="graph-node-header-left">
                        <span class="graph-node-type-label">${meta.name}</span>
                    </div>
                    <button class="graph-node-delete" onclick="event.stopPropagation();deleteGraphNode('${node.id}')" title="Delete node">&times;</button>
                </div>
                <div class="graph-node-body">${bodyHtml}</div>
                ${portsHtml}
            </div>
        `;
    }).join('');

    // Draw connection lines after nodes are placed
    requestAnimationFrame(() => drawEdges());
    
    // Check if Play button should be enabled
    checkPlayEnabled();
}

function drawEdges() {
    const svg = document.getElementById('node-graph-svg');
    const viewport = document.getElementById('node-graph-viewport');
    if (!svg || !viewport) return;

    // Keep temp line if exists
    const tempLine = document.getElementById('temp-conn-line');

    // Clear all edges except temp
    svg.innerHTML = '';
    if (tempLine) svg.appendChild(tempLine);

    const vpRect = viewport.getBoundingClientRect();

    (state.graphEdges || []).forEach(edge => {
        const fromEl = document.getElementById('gn-' + edge.from);
        const toEl = document.getElementById('gn-' + edge.to);
        if (!fromEl || !toEl) return;

        // Find output port of "from" node
        const fromPorts = fromEl.querySelectorAll('.out-port .graph-port-dot');
        const fromPort = fromPorts.length > 0 ? fromPorts[0] : null;

        // Find input port of "to" node
        const toPorts = toEl.querySelectorAll('.in-port .graph-port-dot');
        let toPort = null;
        if (toPorts.length > 0) {
            // Find which index this edge is among all incoming edges
            const allEdgesToTarget = state.graphEdges.filter(e => e.to === edge.to);
            const edgeIndex = allEdgesToTarget.findIndex(e => e.from === edge.from);

            // Route the edge to the correct port if multiple exist (e.g. multi-return mode)
            if (edgeIndex >= 0 && edgeIndex < toPorts.length) {
                toPort = toPorts[edgeIndex];
            } else {
                toPort = toPorts[0]; // Fallback to first port
            }
        }

        if (!fromPort || !toPort) return;

        const fromRect = fromPort.getBoundingClientRect();
        const toRect = toPort.getBoundingClientRect();

        const x1 = (fromRect.left - vpRect.left + viewport.scrollLeft) / _ngZoom + 6 / _ngZoom;
        const y1 = (fromRect.top - vpRect.top + viewport.scrollTop) / _ngZoom + 6 / _ngZoom;
        const x2 = (toRect.left - vpRect.left + viewport.scrollLeft) / _ngZoom + 6 / _ngZoom;
        const y2 = (toRect.top - vpRect.top + viewport.scrollTop) / _ngZoom + 6 / _ngZoom;

        const dx = Math.abs(x2 - x1) * 0.5;
        const d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;

        // Invisible hit area for clicking
        const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hitArea.setAttribute('d', d);
        hitArea.classList.add('node-connection-hitarea');
        hitArea.addEventListener('dblclick', () => deleteEdge(edge.from, edge.to));
        svg.appendChild(hitArea);

        // Visible line
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const isSelected = _ngSelectedEdge && _ngSelectedEdge.from === edge.from && _ngSelectedEdge.to === edge.to;
        path.setAttribute('d', d);
        path.classList.add('node-connection');
        if (isSelected) path.classList.add('selected');

        const selectHandler = (e) => {
            e.stopPropagation();
            _ngSelectedNode = null;
            _ngSelectedEdge = { from: edge.from, to: edge.to };
            document.querySelectorAll('.graph-node.selected').forEach(n => n.classList.remove('selected'));
            document.querySelectorAll('.node-connection.selected').forEach(l => l.classList.remove('selected'));
            path.classList.add('selected');
        };

        hitArea.addEventListener('mousedown', selectHandler);
        path.addEventListener('mousedown', selectHandler);

        hitArea.addEventListener('dblclick', (e) => { e.stopPropagation(); deleteEdge(edge.from, edge.to); });
        path.addEventListener('dblclick', (e) => { e.stopPropagation(); deleteEdge(edge.from, edge.to); });
        svg.appendChild(path);
    });
}

// ── Clear / Generate ──────────────────────────────────
function clearDnDWorkflow() {
    if (!confirm('Clear all nodes and connections?')) return;
    state.graphNodes = [];
    state.graphEdges = [];
    _ngSelectedNode = null;
    _ngConnecting = null;
    renderNodeGraph();
    document.getElementById('dnd-code-output').style.display = 'none';
    const configOut = document.getElementById('dnd-config-output');
    if (configOut) configOut.style.display = 'none';
    showToast('Workflow cleared', 'success');
}

// ── Recursive Expansion Generator ──────────────────
function generateColumnsCode(expands) {
    if (!expands || expands.length === 0) return '';

    function gen(list, depth = 0) {
        const items = list.filter(e => (e.name || '').trim());
        if (items.length === 0) return '';

        const subIndent = '    '.repeat(depth + 1);
        const closingIndent = '    '.repeat(depth);

        let s = `c => {\n${subIndent}c('*');`;
        items.forEach(k => {
            const sub = gen(k.expands || [], depth + 1);
            s += `\n${subIndent}c.${k.name.trim()}${sub || '()'};`;
        });
        s += `\n${closingIndent}}`;
        return s;
    }

    return `.columns(${gen(expands, 1)})`;
}

function generateDnDCode() {
    const nodes = state.graphNodes || [];
    const edges = state.graphEdges || [];

    if (nodes.length === 0) {
        showToast('No nodes in workflow', 'error');
        return;
    }

    const sorted = topologicalSort(nodes, edges);
    const lines = [
        'async (cds, inputPayload) => {',
        '    const results = {};',
        '',
    ];

    const varNames = {};

    sorted.forEach((node, i) => {
        const stepNum = i + 1;
        const varName = `step${stepNum}`;
        varNames[node.id] = varName;

        const inputEdges = edges.filter(e => e.to === node.id);
        const inputVars = inputEdges.map(e => varNames[e.from] || 'inputPayload');

        if (node.type === 'insertPayload') {
            lines.push(`    // Step ${stepNum}: Insert Payload`);
            try {
                const parsedPayload = JSON.parse(node.payload || '{}');
                lines.push(`    const ${varName} = ${JSON.stringify(parsedPayload, null, 2).split('\n').map((l, li) => li === 0 ? l : '    ' + l).join('\n')};`);
            } catch {
                lines.push(`    const ${varName} = { ...inputPayload };`);
            }
            lines.push('');

        } else if (node.type === 'createSubset') {
            const inputVar = inputVars[0] || 'inputPayload';
            const fields = (node.fields || '').split(',').map(f => f.trim()).filter(f => f);
            lines.push(`    // Step ${stepNum}: Create Payload Subset`);
            if (fields.length > 0) {
                const picks = fields.map(f => `'${f}'`).join(', ');
                lines.push(`    const ${varName} = {};`);
                lines.push(`    for (const key of [${picks}]) {`);
                lines.push(`        if (${inputVar}[key] !== undefined) ${varName}[key] = ${inputVar}[key];`);
                lines.push(`    }`);
            } else {
                lines.push(`    const ${varName} = { ...${inputVar} };`);
            }
            lines.push('');

        } else if (node.type === 'apiCall') {
            const inputVar = inputVars[0] || 'inputPayload';
            const svc = node.serviceName || 'UnknownService';
            const ent = node.entitySet || 'UnknownEntity';
            const crud = node.crudType || 'READ';
            lines.push(`    // Step ${stepNum}: API ${crud} → ${svc} / ${ent}`);
            lines.push(`    const srv_${varName} = await cds.connect.to('${svc}');`);
            if (crud === 'READ') {
                let columnsHtml = '';
                if (node.apiType === 'oData' && node.oDataType === 'Entity' && node.expands && node.expands.length > 0) {
                    columnsHtml = generateColumnsCode(node.expands);
                }
                lines.push(`    const query_${varName} = SELECT.from('${ent}').where(${inputVar})${columnsHtml};`);
                lines.push(`    const ${varName} = await srv_${varName}.run(query_${varName});`);
            } else if (crud === 'CREATE') {
                lines.push(`    const query_${varName} = INSERT.into('${ent}').entries(${inputVar});`);
                lines.push(`    const ${varName} = await srv_${varName}.run(query_${varName});`);
            } else if (crud === 'UPDATE') {
                lines.push(`    const query_${varName} = UPDATE('${ent}').with(${inputVar});`);
                lines.push(`    const ${varName} = await srv_${varName}.run(query_${varName});`);
            } else if (crud === 'DELETE') {
                lines.push(`    const query_${varName} = DELETE.from('${ent}').where(${inputVar});`);
                lines.push(`    const ${varName} = await srv_${varName}.run(query_${varName});`);
            }
            lines.push(`    results['${ent}'] = ${varName};`);
            lines.push('');

        } else if (node.type === 'customFunction') {
            const params = inputVars.length > 0 ? inputVars.join(', ') : 'inputPayload';
            lines.push(`    // Step ${stepNum}: Custom Function`);
            const fnBody = node.functionBody || 'async function(input1) {\n    return [];\n}';
            lines.push(`    const ${varName} = await (${fnBody})(${params});`);
            lines.push('');

        } else if (node.type === 'returnObject') {
            lines.push(`    // Step ${stepNum}: Return`);
            if (node.returnType === 'multi') {
                const labels = node.returnLabels || [];
                if (labels.length === 0) {
                    lines.push('    return {};');
                } else {
                    lines.push(`    return {`);
                    labels.forEach((lbl, idx) => {
                        const valVar = inputVars[idx] || 'undefined';
                        lines.push(`        "${lbl || 'param' + (idx + 1)}": ${valVar},`);
                    });
                    lines.push('    };');
                }
            } else {
                lines.push(`    return ${inputVars[0] || 'results'};`);
            }
            lines.push('');
        }
    });

    const hasReturn = nodes.some(n => n.type === 'returnObject');
    if (!hasReturn) lines.push('    return results;');
    lines.push('}');

    const code = lines.join('\n');
    const codeOutput = document.getElementById('dnd-code-output');
    const codePreview = document.getElementById('dnd-code-preview');
    if (codeOutput && codePreview) {
        codeOutput.style.display = '';
        codePreview.value = code;
        autoGrow(codePreview);
    }

    // Output Configuration JSON
    const configOutput = document.getElementById('dnd-config-output');
    const configPreview = document.getElementById('dnd-config-preview');
    if (configOutput && configPreview) {
        const configFlow = {
            nodes: nodes.map(n => {
                const cleanNode = { ...n };
                delete cleanNode._inputCount;
                return cleanNode;
            }),
            edges: edges
        };
        configOutput.style.display = '';
        configPreview.value = JSON.stringify(configFlow, null, 4);
        autoGrow(configPreview);
    }

    showToast('Code & config generated from node graph', 'success');
}

function topologicalSort(nodes, edges) {
    const inDegree = {};
    const adj = {};
    nodes.forEach(n => { inDegree[n.id] = 0; adj[n.id] = []; });
    edges.forEach(e => {
        if (inDegree[e.to] !== undefined) inDegree[e.to]++;
        if (adj[e.from]) adj[e.from].push(e.to);
    });

    const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    const sorted = [];
    const visited = new Set();

    while (queue.length > 0) {
        const id = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        sorted.push(nodes.find(n => n.id === id));

        (adj[id] || []).forEach(next => {
            inDegree[next]--;
            if (inDegree[next] === 0) queue.push(next);
        });
    }

    // Add any unvisited nodes (disconnected)
    nodes.forEach(n => { if (!visited.has(n.id)) sorted.push(n); });

    return sorted;
}

// Initialize
const _ngInit = document.readyState === 'loading'
    ? null
    : setTimeout(() => { initNodeGraphListeners(); renderNodeGraph(); }, 100);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => { initNodeGraphListeners(); renderNodeGraph(); }, 200);
    });
}

// ═══════════════════════════════════════════════════════════
//  Save
// ═══════════════════════════════════════════════════════════
async function saveAll() {
    syncCurrentEdits();
    try {
        const res = await fetch('/api/agents', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agents: state.agents }),
        });
        if (!res.ok) throw new Error('Save failed');

        // Notify UI5 wrapper to trigger CAP V2 OData creations for the tool I am in
        if (state.currentAgent !== null && state.currentTool !== null) {
            const tool = state.agents[state.currentAgent].tools[state.currentTool];
            const queryCode = document.getElementById('fn-code-preview').value;

            // Build the clean configuration flow JSON from the actual current graph state
            const configFlow = {
                nodes: (state.graphNodes || []).map(n => {
                    const cleanNode = { ...n };
                    // Ensure defaults are persisted even if data was legacy
                    if (cleanNode.type === 'apiCall') {
                        if (!cleanNode.apiType) cleanNode.apiType = 'oData';
                        if (!cleanNode.oDataType) cleanNode.oDataType = 'Entity';
                        if (!cleanNode.expands) cleanNode.expands = [];

                        // Deep clean empty expands
                        const cleanList = (list) => (list || [])
                            .filter(e => e.name && e.name.trim())
                            .map(e => ({ ...e, name: e.name.trim(), expands: cleanList(e.expands) }));

                        cleanNode.expands = cleanList(cleanNode.expands);
                    }
                    delete cleanNode._inputCount;
                    return cleanNode;
                }),
                edges: state.graphEdges || []
            };
            const configJson = JSON.stringify(configFlow, null, 4);

            window.parent.postMessage({
                action: 'saveTool',
                tool: tool,
                sampleForm: state.sampleFormDef,
                queryCode: queryCode,
                configJson: configJson
            }, '*');
        }

        showToast('Saved successfully', 'success');
    } catch (e) { showToast('Save error: ' + e.message, 'error'); }
}

function syncCurrentEdits() {
    if (state.currentAgent !== null && state.agents[state.currentAgent]) {
        const agent = state.agents[state.currentAgent];
        const nameEl = document.getElementById('det-agent-name');
        const defEl = document.getElementById('det-agent-def');
        if (nameEl) agent.agentName = nameEl.value;
        if (defEl) agent.agentDefinition = defEl.value;

        if (state.currentTool !== null && agent.tools && agent.tools[state.currentTool]) {
            const tool = agent.tools[state.currentTool];
            const tn = document.getElementById('det-tool-name');
            const td = document.getElementById('det-tool-def');
            const tact = document.getElementById('det-tool-active');
            const trv = document.getElementById('det-tool-default-report-view');
            const tt = document.getElementById('det-tool-title');
            const tkn = document.getElementById('det-tool-knowledge');
            const tal = document.getElementById('det-tool-applink');
            const tsi = document.getElementById('det-tool-static-instruction');
            const tot = document.getElementById('det-tool-operation-type');
            const tost = document.getElementById('det-tool-operation-subtype');
            const fj = document.getElementById('form-json-editor');

            if (tn) tool.toolName = tn.value;
            if (td) tool.toolDefinition = td.value;
            if (tact) tool.active = tact.checked;
            if (trv) tool.defaultReportView = trv.checked;
            if (tt) tool.title = tt.value;
            if (tkn) tool.knowledge = tkn.value;
            if (tal) tool.appLink = tal.value;
            if (tsi) tool.staticInstruction = tsi.value;
            if (tot) tool.operationType = tot.value;
            if (tost) tool.operationSubtype = tost.value;
            if (tadv) tool.advancedCodeExec = tadv.checked;
            if (fj) { try { tool.formToBeSent = JSON.parse(fj.value); } catch { } }
            tool.apiCalls = state.apiCalls || [];
            tool.graphNodes = state.graphNodes || [];
            tool.graphEdges = state.graphEdges || [];
        }
    }
}

// ═══════════════════════════════════════════════════════════
//  Chat
// ═══════════════════════════════════════════════════════════
function toggleChat() {
    document.getElementById('chat-panel').classList.toggle('hidden');
}

async function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    const area = document.getElementById('chat-messages');

    const userDiv = document.createElement('div');
    userDiv.className = 'chat-msg user';
    userDiv.textContent = msg;
    area.appendChild(userDiv);
    area.scrollTop = area.scrollHeight;

    try {
        const res = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, thread_id: state.chatThreadId }),
        });
        const data = await res.json();
        state.chatThreadId = data.thread_id;

        for (const step of data.steps) {
            await sleep(300);
            const d = document.createElement('div');
            d.className = 'chat-step';
            d.innerHTML = `
                <div class="step-node">${step.node}</div>
                <div class="step-msg">${step.message || ''}</div>
                ${step.next_agent ? `<div class="step-route">-> ${step.next_agent}</div>` : ''}
                ${step.tool_call ? `<div class="step-route">-> tool: ${step.tool_call}</div>` : ''}
            `;
            area.appendChild(d);
            area.scrollTop = area.scrollHeight;
        }
    } catch (e) {
        const d = document.createElement('div');
        d.className = 'chat-msg system';
        d.textContent = 'Error: ' + e.message;
        area.appendChild(d);
    }
}

// ═══════════════════════════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════════════════════════
function truncate(s, n) { return s.length > n ? s.slice(0, n) + '...' : s; }

function autoGrow(el) {
    el.style.height = 'auto';
    const maxHeight = window.innerHeight * 0.6; // Expanding to about 60% of the page
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
}

function showToast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type || ''}`;
    setTimeout(() => t.classList.add('hidden'), 2500);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
