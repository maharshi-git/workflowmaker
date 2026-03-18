/* ═══════════════════════════════════════════════════════════
   Workflow Maker — Agent & Tool Configuration Editor
   ═══════════════════════════════════════════════════════════ */

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
    document.getElementById('det-tool-active').checked = !!tool.active;
    document.getElementById('det-tool-default-report-view').checked = !!tool.defaultReportView;
    document.getElementById('det-tool-title').value = tool.title || '';
    document.getElementById('det-tool-knowledge').value = tool.knowledge || '';
    document.getElementById('det-tool-applink').value = tool.appLink || '';
    document.getElementById('det-tool-static-instruction').value = tool.staticInstruction || '';
    document.getElementById('det-tool-operation-type').value = tool.operationType || '';
    updateOperationSubtypeOptions(tool.operationType || '');
    document.getElementById('det-tool-operation-subtype').value = tool.operationSubtype || '';
    document.getElementById('form-json-editor').value = JSON.stringify(tool.formToBeSent || {}, null, 2);

    document.getElementById('det-tool-name').onchange = function () { tool.toolName = this.value; publishToUI5(); };
    document.getElementById('det-tool-def').onchange = function () { tool.toolDefinition = this.value; publishToUI5(); };
    document.getElementById('det-tool-active').onchange = function () { tool.active = this.checked; publishToUI5(); };
    document.getElementById('det-tool-default-report-view').onchange = function () { tool.defaultReportView = this.checked; publishToUI5(); };
    document.getElementById('det-tool-title').onchange = function () { tool.title = this.value; publishToUI5(); };
    document.getElementById('det-tool-knowledge').onchange = function () { tool.knowledge = this.value; publishToUI5(); };
    document.getElementById('det-tool-applink').onchange = function () { tool.appLink = this.value; publishToUI5(); };
    document.getElementById('det-tool-static-instruction').onchange = function () { tool.staticInstruction = this.value; publishToUI5(); };
    document.getElementById('det-tool-operation-subtype').onchange = function () { tool.operationSubtype = this.value; publishToUI5(); };
    document.getElementById('form-json-editor').onchange = function () {
        try {
            tool.formToBeSent = JSON.parse(this.value);
            publishToUI5();
        }
        catch { showToast('Invalid JSON', 'error'); }
    }

    // Init form editor from current formToBeSent
    try {
        const json = tool.formToBeSent || {};
        state.sampleFormDef = (Object.keys(json).length > 0) ? jsonToFormDef(json) : [];
    } catch { state.sampleFormDef = []; }
    renderFormEditor();

    // Init API calls
    state.apiCalls = (tool.apiCalls || []).map(a => ({ ...a }));
    renderApiCalls();
    generateFunctionCode();

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
            window.parent.postMessage({
                action: 'saveTool',
                tool: tool,
                sampleForm: state.sampleFormDef,
                queryCode: queryCode
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
            if (fj) { try { tool.formToBeSent = JSON.parse(fj.value); } catch { } }
            tool.apiCalls = state.apiCalls || [];
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
