'use strict';
/* =====================================================================
   SCHEMATIC EDITOR  (UI, drawing, mouse/keyboard, save/load, export)
   ===================================================================== */
let project = { version: 1, name: 'Untitled', comps: [], wires: [], program: defaultProgram(), nextId: 1 };
let undoStack = [], redoStack = [];
const view = { x: 60, y: 40, z: 1 };
let tool = { mode: 'select', type: null };
let sel = new Set();
let drag = null, wireDraw = null, pressedComp = null;
let mouseG = [0, 0];
let ghostRot = 0;
let clipboard = null;
let lastDeviceTag = 'K1';
let svgEl, worldEl;

const $ = s => document.querySelector(s);
const byId = id => project.comps.find(c => c.id === id);
const wireById = id => project.wires.find(w => w.id === id);

/* ---------- symbol CSS (shared by page and exports) ---------- */
const SYMBOL_CSS = `
.sym line,.sym rect,.sym circle,.sym path{stroke:#1d2733;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.sym rect,.sym circle{fill:#fff}
.sym .hit{fill:transparent;stroke:none}
.sym .dash{stroke-dasharray:4 3;stroke-width:1.5}
.sym .hot{stroke:#00a152;stroke-width:3}
.sym .hotf{stroke:#f57c00;fill:#ffe0b2}
.sym .on{fill:#69f0ae}
.sym .btn{stroke-width:1.5}
.sym .red{stroke:#e53935;fill:#e53935}
.sym .wave{stroke:#f57c00}
.sym .rotor{fill:#00a152;stroke:#00a152}
.sym .box{fill:#eceff1}
.sym .src{fill:#fff8e1}
.sym .plc{fill:#263238;stroke:#263238}
.sym text,.lbl,.tag{font-family:Segoe UI,Roboto,Arial,sans-serif;fill:#1d2733;stroke:none}
.sym .st{font-size:11px}
.sym .sm{font-size:10px}
.sym .xs{font-size:9px}
.sym .b{font-weight:700}
.sym .big{font-size:20px;font-weight:700}
.sym .w{fill:#cfd8dc}
.sym .plcT{fill:#90caf9;font-size:26px;font-weight:800;letter-spacing:4px}
.sym text.red{fill:#e53935;font-weight:700}
.tag{font-size:12px;font-weight:700}
.tag2{font-family:Segoe UI,Roboto,Arial,sans-serif;font-size:10px;fill:#455a64}
.tag2.al{fill:#e53935;font-weight:700}
.wire{stroke-width:2.5;fill:none;stroke-linejoin:round;stroke-linecap:round}
.wire.short{stroke-dasharray:6 4}
.jdot{stroke:none}
.lbl{font-weight:700}
`;

/* ---------- geometry ---------- */
function localBBox(c) {
  const d = DEFS[c.type];
  if (c.type === 'text') {
    const sz = +c.props.size || 16;
    return [0, -sz / G * 0.7, Math.max(1, String(c.props.text).length * sz * 0.56 / G), sz / G * 0.7];
  }
  return d.bbox;
}
function bboxOf(c) {
  const b = localBBox(c);
  const pts = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(p => rotPt(p[0], p[1], c.rot || 0));
  const xs = pts.map(p => p[0] + c.x), ys = pts.map(p => p[1] + c.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
function allTermPoints(exceptIds) {
  const m = new Map();
  for (const c of project.comps) {
    if (exceptIds && exceptIds.has(c.id)) continue;
    for (const t of compTerms(c)) m.set(t.x + ',' + t.y, { c, t });
  }
  return m;
}
function samePt(a, b) { return a[0] === b[0] && a[1] === b[1]; }
function cleanPts(pts) {
  const o = [];
  for (const p of pts) if (!o.length || !samePt(o[o.length - 1], p)) o.push([p[0], p[1]]);
  for (let i = o.length - 2; i >= 1; i--) {
    const a = o[i - 1], b = o[i], c = o[i + 1];
    if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) o.splice(i, 1);
  }
  return o;
}

/* ---------- undo / persistence ---------- */
function pushUndo() {
  undoStack.push(JSON.stringify(project));
  if (undoStack.length > 200) undoStack.shift();
  redoStack = [];
}
function undo() {
  if (Sim.run || !undoStack.length) return;
  redoStack.push(JSON.stringify(project));
  project = JSON.parse(undoStack.pop());
  sel.clear(); dirty(); renderAll();
}
function redo() {
  if (Sim.run || !redoStack.length) return;
  undoStack.push(JSON.stringify(project));
  project = JSON.parse(redoStack.pop());
  sel.clear(); dirty(); renderAll();
}
function dirty() { Sim.topo = null; saveLocal(); }
function saveLocal() { try { localStorage.setItem('esim.autosave', JSON.stringify(project)); } catch (e) { /* ignore */ } }

function sanitizeProject(p) {
  if (!p || !Array.isArray(p.comps) || !Array.isArray(p.wires)) throw new Error('Not a valid circuit file');
  p.comps = p.comps.filter(c => DEFS[c.type]);
  for (const c of p.comps) { c.props = Object.assign(JSON.parse(JSON.stringify(DEFS[c.type].props)), c.props || {}); c.rot = c.rot || 0; }
  p.wires = p.wires.filter(w => Array.isArray(w.pts) && w.pts.length >= 2);
  if (!p.program || !Array.isArray(p.program.rungs)) p.program = defaultProgram();
  if (!p.program.symbols) p.program.symbols = {};
  let mx = 0;
  for (const o of [...p.comps, ...p.wires]) { const n = parseInt(String(o.id).slice(1)); if (n > mx) mx = n; }
  p.nextId = Math.max(p.nextId || 1, mx + 1);
  p.version = 1;
  return p;
}
function loadProject(p, fit = true) {
  stopSim();
  if (project.comps.length) pushUndo();
  project = sanitizeProject(JSON.parse(JSON.stringify(p)));
  sel.clear(); wireDraw = null; setTool('select');
  dirty();
  if (fit) fitView();
  renderAll();
}

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* =====================================================================
   RENDERING
   ===================================================================== */
function wireColor(w) {
  if (!Sim.run || !Sim.nets || !Sim.topo) return { col: '#263238', cls: '' };
  const i = Sim.topo.wireIds.get(w.id);
  if (i === undefined) return { col: '#9e9e9e', cls: '' };
  const ls = Sim.nets.lab.get(Sim.nets.find(i));
  if (ls && ls.size === 1) return { col: SRC_COLOR[[...ls][0]], cls: '' };
  if (ls && ls.size > 1) return { col: '#ff00ff', cls: ' short' };
  return { col: '#b0bec5', cls: '' };
}

function drawContent(exportMode) {
  let s = '';
  const running = Sim.run;
  // junction degree
  const deg = new Map();
  const addDeg = (p, n) => { const k = p[0] + ',' + p[1]; deg.set(k, (deg.get(k) || 0) + n); };
  for (const w of project.wires) {
    w.pts.forEach((p, i) => addDeg(p, (i === 0 || i === w.pts.length - 1) ? 1 : 2));
    for (const e of [w.pts[0], w.pts[w.pts.length - 1]]) {
      for (const w2 of project.wires) {
        if (w2 === w) continue;
        for (let i = 1; i < w2.pts.length; i++) if (onSegInterior(e, w2.pts[i - 1], w2.pts[i])) addDeg(e, 2);
      }
    }
  }
  for (const w of project.wires) {
    const { col, cls } = wireColor(w);
    const d = 'M' + w.pts.map(p => p[0] * G + ',' + p[1] * G).join(' L');
    const isSel = sel.has('w:' + w.id);
    if (!exportMode) s += `<path class="whit" data-wid="${w.id}" d="${d}"/>`;
    if (isSel && !exportMode) s += `<path class="wsel" d="${d}"/>`;
    s += `<path class="wire${cls}" d="${d}" style="stroke:${col}"/>`;
  }
  for (const [k, n] of deg) {
    if (n < 3) continue;
    const [x, y] = k.split(',').map(Number);
    s += `<circle class="jdot" cx="${x * G}" cy="${y * G}" r="4" style="fill:#263238"/>`;
  }
  for (const c of project.comps) s += drawComp(c, exportMode);
  return s;
}

function drawComp(c, exportMode, ghost) {
  const d = DEFS[c.type];
  ensureSt(c);
  const isSel = !ghost && sel.has('c:' + c.id);
  const bb = bboxOf(c);
  const lb = localBBox(c);
  let s = `<g class="comp${isSel ? ' selc' : ''}${Sim.run && d.interact ? ' live' : ''}${ghost ? ' ghost' : ''}"${ghost ? '' : ` data-id="${c.id}"`}>`;
  if (isSel && !exportMode) s += `<rect class="selbox" x="${bb.x0 * G - 6}" y="${bb.y0 * G - 6}" width="${(bb.x1 - bb.x0) * G + 12}" height="${(bb.y1 - bb.y0) * G + 12}" rx="4"/>`;
  s += `<g class="sym" transform="translate(${c.x * G},${c.y * G}) rotate(${(c.rot || 0) * 90})">`;
  s += `<rect class="hit" x="${lb[0] * G - 4}" y="${lb[1] * G - 4}" width="${(lb[2] - lb[0]) * G + 8}" height="${(lb[3] - lb[1]) * G + 8}"/>`;
  s += d.draw(c, S, c.rot || 0);
  if (!exportMode && !Sim.run && !ghost) {
    for (const t of d.terms) s += `<circle class="term" data-cid="${c.id}" data-t="${esc(t.n)}" cx="${t.x * G}" cy="${t.y * G}" r="4"/>`;
  }
  s += '</g>';
  const lab = (d.label ? d.label(c) : [c.props.tag, c.props.desc]).filter(Boolean);
  if (lab.length) {
    const lx = bb.x1 * G + 6;
    const ly = (bb.y0 + bb.y1) / 2 * G - (lab.length - 1) * 7;
    lab.forEach((t, i) => {
      const al = /TRIPPED|BLOWN|SINGLE|OVER|OPEN!/.test(t) && i > 0;
      s += `<text class="${i === 0 ? 'tag' : 'tag2'}${al ? ' al' : ''}" x="${lx}" y="${ly + i * 14}" dominant-baseline="middle">${esc(t)}</text>`;
    });
  }
  return s + '</g>';
}

function renderSchematic() {
  const r = svgEl.getBoundingClientRect();
  worldEl.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.z})`);
  let s = `<rect x="${-view.x / view.z}" y="${-view.y / view.z}" width="${r.width / view.z}" height="${r.height / view.z}" fill="url(#gridPat)"/>`;
  s += drawContent(false);
  if (tool.mode === 'place' && tool.type && !Sim.run) {
    const d = DEFS[tool.type];
    const g = { id: 'ghost', type: tool.type, x: mouseG[0], y: mouseG[1], rot: d.noRotate ? 0 : ghostRot, props: JSON.parse(JSON.stringify(d.props)) };
    s += drawComp(g, true, true);
  }
  if (wireDraw) {
    const pts = wireDraw.pts.concat(orthoPath(wireDraw.pts[wireDraw.pts.length - 1], mouseG, wireDraw.pts));
    s += `<path class="wprev" d="M${pts.map(p => p[0] * G + ',' + p[1] * G).join(' L')}"/>`;
    s += `<circle class="wcur" cx="${mouseG[0] * G}" cy="${mouseG[1] * G}" r="5"/>`;
  } else if (tool.mode === 'wire' && !Sim.run) {
    s += `<circle class="wcur" cx="${mouseG[0] * G}" cy="${mouseG[1] * G}" r="5"/>`;
  }
  if (drag && drag.type === 'marquee') {
    const x = Math.min(drag.a[0], drag.b[0]), y = Math.min(drag.a[1], drag.b[1]);
    s += `<rect class="marq" x="${x}" y="${y}" width="${Math.abs(drag.a[0] - drag.b[0])}" height="${Math.abs(drag.a[1] - drag.b[1])}"/>`;
  }
  worldEl.innerHTML = s;
}

function renderProps() {
  const el = $('#props');
  if (sel.size === 0) {
    el.innerHTML = `<div class="hint"><b>Quick help</b><br>
      • Click a part in the palette, then click on the sheet to place it (R = rotate, Esc = stop).<br>
      • Click a terminal dot (or press <b>W</b>) to draw a wire. Click to add bends, click a terminal/wire to finish.<br>
      • Drag empty area = pan, wheel = zoom, Shift+drag = box select.<br>
      • Contacts follow a coil/timer/OLR by <b>tag</b> (e.g. K1) – just like a real drawing.<br>
      • Press <b>▶ Run</b> (Space) and operate buttons with the mouse.</div>`;
    return;
  }
  if (sel.size > 1) {
    el.innerHTML = `<h3>${sel.size} items selected</h3><button class="pbtn" onclick="rotateSel()">⟳ Rotate</button> <button class="pbtn danger" onclick="deleteSel()">🗑 Delete</button>`;
    return;
  }
  const [k] = sel;
  if (k.startsWith('w:')) {
    el.innerHTML = `<h3>Wire</h3><p class="muted">Wire ends that touch a terminal, another wire's end/bend, or the middle of another wire are connected (a dot appears at T-junctions). Crossing wires are NOT connected.</p><button class="pbtn danger" onclick="deleteSel()">🗑 Delete wire</button>`;
    return;
  }
  const c = byId(k.slice(2)); if (!c) { sel.clear(); return renderProps(); }
  const d = DEFS[c.type];
  const devs = project.comps.filter(x => DEFS[x.type].device).map(x => `<option value="${esc(x.props.tag)}">${esc(DEFS[x.type].name)}</option>`).join('');
  let h = `<h3>${esc(d.name)}</h3><div class="pform">`;
  for (const f of d.schema || []) {
    const v = c.props[f.k] ?? '';
    h += `<label>${esc(f.label)}`;
    if (f.type === 'select') h += `<select data-k="${f.k}">${f.options.map(o => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    else if (f.type === 'number') h += `<input type="number" step="any" data-k="${f.k}" value="${esc(v)}"/>`;
    else if (f.type === 'tagref') h += `<input list="devtags" data-k="${f.k}" value="${esc(v)}"/><datalist id="devtags">${devs}</datalist>`;
    else h += `<input type="text" data-k="${f.k}" value="${esc(v)}"/>`;
    h += '</label>';
  }
  h += '</div>';
  if (d.schema && d.schema.some(f => f.type === 'tagref')) {
    const target = project.comps.find(x => DEFS[x.type].device && x.props.tag === c.props.tag);
    h += target ? `<p class="ok">✔ Linked to ${esc(DEFS[target.type].name)} ${esc(c.props.tag)}</p>` : `<p class="bad">⚠ No coil/timer/OLR with tag "${esc(c.props.tag)}" yet</p>`;
  }
  const hints = {
    momentary: 'Simulation: press & hold with the mouse.', toggle: 'Simulation: click to toggle.', mcb: 'Simulation: click = ON/OFF. After a trip, click to reset.',
    fuse: 'Simulation: after it blows, click to replace.', olr: 'Simulation: click = test-trip / reset.', motor: 'Simulation: click = apply / remove mechanical overload (OLR trips after 3 s).',
    sensor: 'Simulation: click = target present / absent.', plc: 'Simulation: click = RUN / STOP. Program it in the Ladder panel.', cycle3: 'Simulation: click to cycle OFF → 1 → 2.',
  };
  if (d.interact && hints[d.interact]) h += `<p class="muted">${hints[d.interact]}</p>`;
  if (d.terms.length) h += `<p class="muted">Terminals: ${d.terms.map(t => t.n).join(', ')}</p>`;
  h += `<div class="prow">${d.noRotate ? '' : '<button class="pbtn" onclick="rotateSel()">⟳ Rotate (R)</button>'}<button class="pbtn" onclick="duplicateSel()">⧉ Duplicate</button><button class="pbtn danger" onclick="deleteSel()">🗑 Delete</button></div>`;
  el.innerHTML = h;
  el.querySelectorAll('[data-k]').forEach(inp => {
    inp.addEventListener('change', () => {
      if (Sim.run) { toast('Stop simulation to edit'); renderProps(); return; }
      pushUndo();
      const f = d.schema.find(x => x.k === inp.dataset.k);
      c.props[f.k] = f.type === 'number' ? (+inp.value || 0) : inp.value;
      if (d.device && f.k === 'tag') lastDeviceTag = inp.value;
      dirty(); renderSchematic(); renderProps();
    });
  });
}

function renderAlarms() {
  const el = $('#alarms');
  const list = [...Sim.alarms.values()].reverse().slice(0, 30);
  el.innerHTML = list.length ? list.map(a => `<div class="al ${a.level}">${esc(a.msg)}</div>`).join('') : `<div class="muted">${Sim.run ? 'No faults. ✔' : 'Run the simulation to see faults & messages here.'}</div>`;
}
function renderStatus() {
  const modeTxt = Sim.run ? '▶ SIMULATION RUNNING – click buttons/switches to operate' : tool.mode === 'place' ? `Placing: ${DEFS[tool.type].name} (R rotate, Esc stop)` : tool.mode === 'wire' ? 'Wire tool: click start, click bends, click terminal/wire to finish (Esc = done)' : 'Select / move';
  $('#status').innerHTML = `<span>${modeTxt}</span><span>X ${mouseG[0]}  Y ${mouseG[1]}</span><span>Zoom ${Math.round(view.z * 100)}%</span><span>Sim time ${(Sim.t / 1000).toFixed(1)} s</span><span>${project.comps.length} parts · ${project.wires.length} wires</span>`;
}
function renderAll() {
  renderSchematic(); renderProps(); renderAlarms(); renderStatus();
  if (document.body.classList.contains('show-ladder')) renderLadder();
  $('#btnUndo').disabled = !undoStack.length; $('#btnRedo').disabled = !redoStack.length;
}
function onSimFrame() {
  renderSchematic(); renderAlarms(); renderStatus();
  if (document.body.classList.contains('show-ladder')) renderLadder();
}
function onSimStateChange() {
  document.body.classList.toggle('running', Sim.run);
  $('#btnRun').innerHTML = Sim.run ? '■ Stop' : '▶ Run';
  $('#btnRun').classList.toggle('stop', Sim.run);
  renderAll();
}

/* =====================================================================
   TOOLS & ACTIONS
   ===================================================================== */
function setTool(mode, type) {
  tool = { mode, type: type || null };
  if (mode !== 'wire') wireDraw = null;
  document.querySelectorAll('.pal-item').forEach(b => b.classList.toggle('act', mode === 'place' && b.dataset.type === type));
  $('#btnSelect').classList.toggle('act', mode === 'select');
  $('#btnWire').classList.toggle('act', mode === 'wire');
  svgEl.style.cursor = mode === 'wire' || mode === 'place' ? 'crosshair' : '';
  renderSchematic(); renderStatus();
}

function nextTag(prefix) {
  const re = new RegExp('^' + prefix + '(\\d+)$');
  let mx = 0;
  for (const c of project.comps) { const m = String(c.props.tag || '').match(re); if (m) mx = Math.max(mx, +m[1]); }
  return prefix + (mx + 1);
}

function placeComp(gp) {
  const d = DEFS[tool.type];
  pushUndo();
  const c = { id: 'c' + project.nextId++, type: tool.type, x: gp[0], y: gp[1], rot: d.noRotate ? 0 : ghostRot, props: JSON.parse(JSON.stringify(d.props)) };
  if ('tag' in c.props) {
    if (d.prefix) c.props.tag = nextTag(d.prefix);
    else c.props.tag = lastDeviceTag;
  }
  if (d.device) lastDeviceTag = c.props.tag;
  project.comps.push(c);
  sel.clear(); sel.add('c:' + c.id);
  dirty(); renderAll();
}

function deleteSel() {
  if (Sim.run || !sel.size) return;
  pushUndo();
  project.comps = project.comps.filter(c => !sel.has('c:' + c.id));
  project.wires = project.wires.filter(w => !sel.has('w:' + w.id));
  sel.clear(); dirty(); renderAll();
}
function rotateSel() {
  if (Sim.run) return;
  if (tool.mode === 'place') { ghostRot = (ghostRot + 1) % 4; renderSchematic(); return; }
  const cs = project.comps.filter(c => sel.has('c:' + c.id) && !DEFS[c.type].noRotate);
  if (!cs.length) return;
  pushUndo();
  cs.forEach(c => c.rot = ((c.rot || 0) + 1) % 4);
  dirty(); renderAll();
}
function copySel() {
  const comps = project.comps.filter(c => sel.has('c:' + c.id));
  const wires = project.wires.filter(w => sel.has('w:' + w.id));
  if (!comps.length && !wires.length) return;
  clipboard = JSON.parse(JSON.stringify({ comps, wires }));
  toast(`Copied ${comps.length} parts, ${wires.length} wires`);
}
function pasteClip(offset = 2) {
  if (!clipboard || Sim.run) return;
  pushUndo();
  sel.clear();
  const data = JSON.parse(JSON.stringify(clipboard));
  for (const c of data.comps) {
    c.id = 'c' + project.nextId++; c.x += offset; c.y += offset;
    const d = DEFS[c.type];
    if (d.device || (d.prefix && !['K', 'KA', 'KT'].includes(d.prefix))) c.props.tag = nextTag(d.prefix || '');
    project.comps.push(c); sel.add('c:' + c.id);
  }
  for (const w of data.wires) {
    w.id = 'w' + project.nextId++; w.pts = w.pts.map(p => [p[0] + offset, p[1] + offset]);
    project.wires.push(w); sel.add('w:' + w.id);
  }
  clipboard.comps.forEach(c => { c.x += offset; c.y += offset; });
  clipboard.wires.forEach(w => { w.pts = w.pts.map(p => [p[0] + offset, p[1] + offset]); });
  dirty(); renderAll();
}
function duplicateSel() { const keep = clipboard; copySel(); pasteClip(); clipboard = keep; }

/* ---------- wiring ---------- */
function orthoPath(a, b, pts) {
  if (a[0] === b[0] || a[1] === b[1]) return [b];
  let lastH = false;
  if (pts && pts.length >= 2) { const p = pts[pts.length - 2]; lastH = p[1] === a[1] && p[0] !== a[0]; }
  else if (pts && pts.length === 1) lastH = false;
  const corner = lastH ? [a[0], b[1]] : (pts && pts.length >= 2 ? [b[0], a[1]] : [a[0], b[1]]);
  return [corner, b];
}
function isConnectPoint(gp) {
  if (allTermPoints().has(gp[0] + ',' + gp[1])) return true;
  for (const w of project.wires) {
    if (w.pts.some(p => samePt(p, gp))) return true;
    for (let i = 1; i < w.pts.length; i++) if (onSegInterior(gp, w.pts[i - 1], w.pts[i])) return true;
  }
  return false;
}
function startWire(gp) { wireDraw = { pts: [gp] }; if (tool.mode !== 'wire') tool.mode = 'wire-temp'; renderSchematic(); renderStatus(); }
function wireClick(gp) {
  if (!wireDraw) { startWire(gp); return; }
  const last = wireDraw.pts[wireDraw.pts.length - 1];
  if (samePt(last, gp)) { finishWire(); return; }
  wireDraw.pts.push(...orthoPath(last, gp, wireDraw.pts));
  if (isConnectPoint(gp)) finishWire();
  else renderSchematic();
}
function finishWire() {
  if (!wireDraw) return;
  const pts = cleanPts(wireDraw.pts);
  wireDraw = null;
  if (tool.mode === 'wire-temp') tool.mode = 'select';
  if (pts.length >= 2) {
    pushUndo();
    project.wires.push({ id: 'w' + project.nextId++, pts });
    dirty();
  }
  renderAll();
}

/* ---------- moving ---------- */
function startMove(gp) {
  const movingIds = new Set(project.comps.filter(c => sel.has('c:' + c.id)).map(c => c.id));
  const mvTerms = new Set();
  for (const c of project.comps) if (movingIds.has(c.id)) for (const t of compTerms(c)) mvTerms.add(t.x + ',' + t.y);
  const attach = [];
  for (const w of project.wires) {
    if (sel.has('w:' + w.id)) continue;
    const a = mvTerms.has(w.pts[0].join(',')), b = mvTerms.has(w.pts[w.pts.length - 1].join(','));
    if (a || b) attach.push({ w, orig: w.pts.map(p => p.slice()), a, b });
  }
  drag = {
    type: 'move', start: gp, moved: false,
    comps: project.comps.filter(c => movingIds.has(c.id)).map(c => ({ c, x: c.x, y: c.y })),
    wires: project.wires.filter(w => sel.has('w:' + w.id)).map(w => ({ w, orig: w.pts.map(p => p.slice()) })),
    attach,
  };
}
function rubber(orig, a, b, dx, dy) {
  let p = orig.map(q => q.slice());
  if (a && b) return p.map(q => [q[0] + dx, q[1] + dy]);
  const fix = (i, j) => {
    const horiz = p[i][1] === p[j][1], vert = p[i][0] === p[j][0];
    p[i] = [p[i][0] + dx, p[i][1] + dy];
    if (p.length > 2) { if (horiz && !vert) p[j][1] += dy; else if (vert && !horiz) p[j][0] += dx; }
  };
  if (a) fix(0, 1);
  if (b) fix(p.length - 1, p.length - 2);
  const out = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const q = out[out.length - 1], r = p[i];
    if (q[0] !== r[0] && q[1] !== r[1]) out.push(a && i === 1 ? [q[0], r[1]] : [r[0], q[1]]);
    out.push(r);
  }
  return out;
}
function applyMove(gp) {
  const dx = gp[0] - drag.start[0], dy = gp[1] - drag.start[1];
  if (!drag.moved && (dx || dy)) { pushUndo(); drag.moved = true; }
  if (!drag.moved) return;
  for (const o of drag.comps) { o.c.x = o.x + dx; o.c.y = o.y + dy; }
  for (const o of drag.wires) o.w.pts = o.orig.map(p => [p[0] + dx, p[1] + dy]);
  for (const o of drag.attach) o.w.pts = rubber(o.orig, o.a, o.b, dx, dy);
}

/* ---------- view ---------- */
function toWorld(e) {
  const r = svgEl.getBoundingClientRect();
  return [(e.clientX - r.left - view.x) / view.z, (e.clientY - r.top - view.y) / view.z];
}
const snap = p => [Math.round(p[0] / G), Math.round(p[1] / G)];

function contentBBox() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of project.comps) {
    const b = bboxOf(c);
    x0 = Math.min(x0, b.x0 * G); y0 = Math.min(y0, b.y0 * G); x1 = Math.max(x1, b.x1 * G + 110); y1 = Math.max(y1, b.y1 * G + 10);
  }
  for (const w of project.wires) for (const p of w.pts) { x0 = Math.min(x0, p[0] * G); y0 = Math.min(y0, p[1] * G); x1 = Math.max(x1, p[0] * G); y1 = Math.max(y1, p[1] * G); }
  if (x0 === Infinity) return { x: 0, y: 0, w: 800, h: 600 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function fitView() {
  const r = svgEl.getBoundingClientRect();
  const b = contentBBox();
  if (!r.width || !r.height) return;
  const z = Math.min(2, Math.max(0.25, Math.min((r.width - 60) / b.w, (r.height - 60) / b.h)));
  view.z = z;
  view.x = (r.width - b.w * z) / 2 - b.x * z;
  view.y = (r.height - b.h * z) / 2 - b.y * z;
  renderSchematic(); renderStatus();
}
function zoomBy(f, cx, cy) {
  const r = svgEl.getBoundingClientRect();
  if (cx === undefined) { cx = r.width / 2; cy = r.height / 2; }
  const nz = Math.min(4, Math.max(0.2, view.z * f));
  view.x = cx - (cx - view.x) * nz / view.z;
  view.y = cy - (cy - view.y) * nz / view.z;
  view.z = nz;
  renderSchematic(); renderStatus();
}

/* =====================================================================
   MOUSE / KEYBOARD
   ===================================================================== */
function onDown(e) {
  if (e.button === 2) return;
  const wp = toWorld(e), gp = snap(wp);
  mouseG = gp;
  if (e.button === 1 || (e.button === 0 && e.altKey)) { e.preventDefault(); drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; return; }
  if (Sim.run) {
    const g = e.target.closest('[data-id]');
    if (g) {
      const c = byId(g.dataset.id);
      if (c && DEFS[c.type].interact) { pressedComp = c; simInteract(c, 'down'); return; }
    }
    drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    return;
  }
  if (tool.mode === 'place') { placeComp(gp); return; }
  if (tool.mode === 'wire' || wireDraw) { wireClick(gp); return; }
  const term = e.target.closest('[data-t]');
  if (term) { startWire(gp); return; }
  const g = e.target.closest('[data-id]');
  const wh = e.target.closest('[data-wid]');
  const key = g ? 'c:' + g.dataset.id : wh ? 'w:' + wh.dataset.wid : null;
  if (key) {
    if (e.shiftKey || e.ctrlKey) { sel.has(key) ? sel.delete(key) : sel.add(key); }
    else if (!sel.has(key)) { sel.clear(); sel.add(key); }
    if (g) { const c = byId(g.dataset.id); if (DEFS[c.type].device) lastDeviceTag = c.props.tag; }
    startMove(gp);
    renderAll();
    return;
  }
  if (e.shiftKey) { drag = { type: 'marquee', a: wp, b: wp }; return; }
  if (sel.size) { sel.clear(); renderAll(); }
  drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
}
function onMove(e) {
  if (!svgEl) return;
  const r = svgEl.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  const wp = toWorld(e), gp = snap(wp);
  const changedG = gp[0] !== mouseG[0] || gp[1] !== mouseG[1];
  mouseG = gp;
  if (drag) {
    if (drag.type === 'pan') { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; renderSchematic(); return; }
    if (drag.type === 'marquee') { drag.b = wp; renderSchematic(); return; }
    if (drag.type === 'move' && changedG) { applyMove(gp); renderSchematic(); renderStatus(); return; }
    return;
  }
  if (inside && changedG && (tool.mode !== 'select' || wireDraw)) renderSchematic();
  if (inside && changedG) renderStatus();
}
function onUp() {
  if (pressedComp) { const c = pressedComp; pressedComp = null; if (Sim.run && DEFS[c.type].interact === 'momentary') simInteract(c, 'up'); }
  if (!drag) return;
  const d = drag; drag = null;
  if (d.type === 'move' && d.moved) {
    for (const w of project.wires) w.pts = cleanPts(w.pts);
    project.wires = project.wires.filter(w => w.pts.length >= 2);
    dirty(); renderAll();
  } else if (d.type === 'marquee') {
    const x0 = Math.min(d.a[0], d.b[0]) / G, x1 = Math.max(d.a[0], d.b[0]) / G, y0 = Math.min(d.a[1], d.b[1]) / G, y1 = Math.max(d.a[1], d.b[1]) / G;
    for (const c of project.comps) { const b = bboxOf(c); if (b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1) sel.add('c:' + c.id); }
    for (const w of project.wires) if (w.pts.every(p => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1)) sel.add('w:' + w.id);
    renderAll();
  }
}
function onRight(e) {
  e.preventDefault();
  if (wireDraw) { finishWire(); return; }
  if (tool.mode !== 'select') { setTool('select'); return; }
}
function onKey(e) {
  if (e.target.matches('input,textarea,select')) return;
  const k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'c') { copySel(); }
    else if (k === 'v') { e.preventDefault(); pasteClip(); }
    else if (k === 'd') { e.preventDefault(); duplicateSel(); }
    else if (k === 's') { e.preventDefault(); saveFile(); }
    else if (k === 'a') { e.preventDefault(); project.comps.forEach(c => sel.add('c:' + c.id)); project.wires.forEach(w => sel.add('w:' + w.id)); renderAll(); }
    return;
  }
  if (k === ' ') { e.preventDefault(); Sim.run ? stopSim() : startSim(); return; }
  if (Sim.run) return;
  if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); }
  else if (k === 'r') rotateSel();
  else if (k === 'w') setTool('wire');
  else if (k === 'v') setTool('select');
  else if (k === 'f') fitView();
  else if (k === 'escape') {
    if (wireDraw) finishWire();
    else if (tool.mode !== 'select') setTool('select');
    else { sel.clear(); renderAll(); }
  }
  else if (k === 'enter' && wireDraw) finishWire();
}

/* =====================================================================
   FILES & EXPORT
   ===================================================================== */
function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function fileBase() { return (project.name || 'circuit').replace(/[^\w\-]+/g, '_'); }
function saveFile() {
  const n = prompt('Save as (file name):', project.name || 'my-circuit');
  if (n === null) return;
  project.name = n || 'circuit';
  saveLocal();
  download(fileBase() + '.esim.json', JSON.stringify(project, null, 1), 'application/json');
}
function openFile() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,.esim,.esim.json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    f.text().then(t => { try { loadProject(JSON.parse(t)); toast('Opened ' + f.name); } catch (err) { alert('Could not open file: ' + err.message); } });
  };
  inp.click();
}
function exportSVGString() {
  const b = contentBBox(), pad = 30;
  const w = Math.ceil(b.w + pad * 2), h = Math.ceil(b.h + pad * 2);
  const vx = b.x - pad, vy = b.y - pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vx} ${vy} ${w} ${h}"><style>${SYMBOL_CSS}</style><rect x="${vx}" y="${vy}" width="${w}" height="${h}" fill="#ffffff"/>${drawContent(true)}</svg>`;
}
function exportSVG() { download(fileBase() + '.svg', exportSVGString(), 'image/svg+xml'); }
function exportPNG() {
  const str = exportSVGString();
  const img = new Image();
  const url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml' }));
  img.onload = () => {
    const sc = 2;
    const cv = document.createElement('canvas');
    cv.width = img.width * sc; cv.height = img.height * sc;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url);
    cv.toBlob(bl => { const a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = fileBase() + '.png'; a.click(); }, 'image/png');
  };
  img.src = url;
}

/* =====================================================================
   PALETTE
   ===================================================================== */
function paletteIcon(type) {
  const d = DEFS[type];
  const c = { id: 'pv', type, x: 0, y: 0, rot: 0, props: JSON.parse(JSON.stringify(d.props)) };
  if (type === 'text') c.props.text = 'Abc';
  ensureSt(c);
  const b = localBBox(c);
  const x = b[0] * G - 8, y = b[1] * G - 6, w = (b[2] - b[0]) * G + 16, h = (b[3] - b[1]) * G + 12;
  const save = Sim.run; // draw in normal (shelf) state
  return `<svg viewBox="${x} ${y} ${w} ${h}" width="46" height="46"><g class="sym">${d.draw(c, { run: false, active: () => false }, 0)}</g></svg>` + (save ? '' : '');
}
function buildPalette() {
  const el = $('#palette');
  let h = `<input id="palSearch" placeholder="Search parts…"/>`;
  for (const cat of CATS) {
    const items = Object.values(DEFS).filter(d => d.cat === cat);
    if (!items.length) continue;
    h += `<div class="pal-cat" data-cat="${cat}"><div class="pal-h">${cat}</div><div class="pal-grid">`;
    h += items.map(d => `<button class="pal-item" data-type="${d.type}" title="${esc(d.name)}">${paletteIcon(d.type)}<span>${esc(d.name)}</span></button>`).join('');
    h += '</div></div>';
  }
  el.innerHTML = h;
  el.addEventListener('click', e => {
    const b = e.target.closest('.pal-item'); if (!b) return;
    if (Sim.run) { toast('Stop the simulation to add parts'); return; }
    ghostRot = 0;
    setTool('place', b.dataset.type);
  });
  $('#palSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    el.querySelectorAll('.pal-item').forEach(b => b.style.display = b.title.toLowerCase().includes(q) ? '' : 'none');
    el.querySelectorAll('.pal-cat').forEach(cg => cg.style.display = [...cg.querySelectorAll('.pal-item')].some(b => b.style.display !== 'none') ? '' : 'none');
  });
}

/* =====================================================================
   INIT
   ===================================================================== */
function init() {
  const st = document.createElement('style'); st.textContent = SYMBOL_CSS; document.head.appendChild(st);
  svgEl = $('#canvas'); worldEl = $('#world');
  buildPalette();
  initLadderUI();
  svgEl.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  svgEl.addEventListener('contextmenu', onRight);
  svgEl.addEventListener('wheel', e => { e.preventDefault(); const r = svgEl.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  svgEl.addEventListener('dblclick', e => { const g = e.target.closest('[data-id]'); if (g && !Sim.run) { const i = $('#props input,#props select'); if (i) i.focus(); } });
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => renderSchematic());

  $('#btnSelect').onclick = () => setTool('select');
  $('#btnWire').onclick = () => setTool('wire');
  $('#btnRotate').onclick = rotateSel;
  $('#btnDelete').onclick = deleteSel;
  $('#btnUndo').onclick = undo;
  $('#btnRedo').onclick = redo;
  $('#btnRun').onclick = () => Sim.run ? stopSim() : startSim();
  $('#btnRestart').onclick = () => { stopSim(); startSim(); };
  $('#btnNew').onclick = () => { if (confirm('Start a new empty drawing? (unsaved changes will be lost – use Save first)')) loadProject({ comps: [], wires: [], program: defaultProgram(), name: 'Untitled' }, false); };
  $('#btnOpen').onclick = openFile;
  $('#btnSave').onclick = saveFile;
  $('#btnPng').onclick = exportPNG;
  $('#btnSvg').onclick = exportSVG;
  $('#btnFit').onclick = fitView;
  $('#btnZin').onclick = () => zoomBy(1.2);
  $('#btnZout').onclick = () => zoomBy(1 / 1.2);
  $('#btnLadder').onclick = () => { document.body.classList.toggle('show-ladder'); renderAll(); };
  $('#btnClearAl').onclick = () => { Sim.alarms.clear(); renderAlarms(); };
  $('#speed').onchange = e => { Sim.speed = +e.target.value; };
  const exSel = $('#selExamples');
  exSel.innerHTML = '<option value="">📂 Examples…</option>' + Object.entries(EXAMPLES).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('');
  exSel.onchange = () => { const k = exSel.value; exSel.value = ''; if (!k) return; loadProject(EXAMPLES[k]); if (EXAMPLES[k].program && EXAMPLES[k].program.rungs.some(r => r.cells.some(row => row.some(Boolean)))) document.body.classList.add('show-ladder'); renderAll(); setTimeout(fitView, 50); toast('Loaded: ' + EXAMPLES[k].name + ' – press ▶ Run'); };

  // ladder panel resize
  const rh = $('#ladResize');
  rh.addEventListener('mousedown', e => {
    e.preventDefault();
    const sy = e.clientY, sh = $('#ladder').offsetHeight;
    const mv = ev => { $('#ladder').style.height = Math.max(120, Math.min(window.innerHeight - 200, sh - (ev.clientY - sy))) + 'px'; renderSchematic(); };
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  });

  let loaded = false;
  try {
    const sv = localStorage.getItem('esim.autosave');
    if (sv) { project = sanitizeProject(JSON.parse(sv)); loaded = project.comps.length > 0; }
  } catch (e) { /* ignore */ }
  if (!loaded) project = sanitizeProject(JSON.parse(JSON.stringify(EXAMPLES.dol)));
  setTool('select');
  renderAll();
  setTimeout(fitView, 30);
}
window.addEventListener('DOMContentLoaded', init);
