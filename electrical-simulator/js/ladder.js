'use strict';
/* =====================================================================
   PLC LADDER LOGIC  – data model, scan engine and editor
   Rung = grid of rows x 8 columns. Columns 0..6 = contacts / wire,
   column 7 = output instruction. v[r][b] = vertical link between row r
   and r+1 at boundary b (b=0 is the left rail, b=7 is before outputs).
   ===================================================================== */
const LC = 7;            // logic columns
const NCOL = LC + 1;

function newPlcMem() {
  return { I: Array(16).fill(false), Q: Array(16).fill(false), M: {}, T: {}, C: {} };
}
function newRung(rows = 1) {
  return { rows, comment: '', cells: [...Array(rows)].map(() => Array(NCOL).fill(null)), v: [...Array(rows)].map(() => Array(NCOL).fill(false)) };
}
function defaultProgram() { return { rungs: [newRung(1)], symbols: {} }; }

const ADDR_RE = /^(I|Q)(\d)\.([0-7])$|^(M)(\d{1,3})$|^(T)(\d{1,2})$|^(C)(\d{1,2})$/;
function normAddr(a) { return String(a || '').trim().toUpperCase().replace(/\s+/g, ''); }
function validAddr(a) { return ADDR_RE.test(normAddr(a)); }

function getBit(mem, a) {
  const m = normAddr(a).match(ADDR_RE);
  if (!m) return false;
  if (m[1]) { const i = +m[2] * 8 + +m[3]; return !!(m[1] === 'I' ? mem.I[i] : mem.Q[i]); }
  if (m[4]) return !!mem.M[m[5]];
  if (m[6]) return !!(mem.T[m[7]] && mem.T[m[7]].dn);
  if (m[8]) return !!(mem.C[m[9]] && mem.C[m[9]].dn);
  return false;
}
function setBit(mem, a, val) {
  const m = normAddr(a).match(ADDR_RE);
  if (!m) return;
  if (m[1] === 'Q') mem.Q[+m[2] * 8 + +m[3]] = val;
  else if (m[1] === 'I') mem.I[+m[2] * 8 + +m[3]] = val;
  else if (m[4]) mem.M[m[5]] = val;
}

function cellPass(cell, mem) {
  if (!cell) return false;
  switch (cell.t) {
    case 'WIRE': return true;
    case 'NO': return getBit(mem, cell.a);
    case 'NC': return !getBit(mem, cell.a);
    default: return false;
  }
}
function mergeRows(rg, b, arr) {
  const out = arr.slice();
  let start = 0;
  for (let r = 0; r < rg.rows; r++) {
    if (r === rg.rows - 1 || !rg.v[r][b]) {
      let any = false;
      for (let k = start; k <= r; k++) any = any || out[k];
      for (let k = start; k <= r; k++) out[k] = any;
      start = r + 1;
    }
  }
  return out;
}
function execOut(cell, inp, mem, dt) {
  if (!cell) return;
  const m = normAddr(cell.a).match(ADDR_RE);
  switch (cell.t) {
    case 'OTE': setBit(mem, cell.a, inp); break;
    case 'SET': if (inp) setBit(mem, cell.a, true); break;
    case 'RST':
      if (!inp) break;
      if (m && m[6]) mem.T[m[7]] = { acc: 0, dn: false };
      else if (m && m[8]) mem.C[m[9]] = { cv: 0, dn: false, prev: false };
      else setBit(mem, cell.a, false);
      break;
    case 'TON': case 'TOF': {
      if (!m || !m[6]) break;
      const t = mem.T[m[7]] || (mem.T[m[7]] = { acc: 0, dn: false });
      const pt = (+cell.p || 0) * 1000;
      t.pt = pt; t.type = cell.t;
      if (cell.t === 'TON') {
        if (inp) { if (!t.dn) { t.acc += dt; if (t.acc >= pt) { t.acc = pt; t.dn = true; } } }
        else { t.acc = 0; t.dn = false; }
      } else {
        if (inp) { t.dn = true; t.acc = 0; }
        else if (t.dn) { t.acc += dt; if (t.acc >= pt) { t.acc = pt; t.dn = false; } }
      }
      t.en = inp;
      break;
    }
    case 'CTU': case 'CTD': {
      if (!m || !m[8]) break;
      const k = mem.C[m[9]] || (mem.C[m[9]] = { cv: 0, dn: false, prev: false });
      const pv = +cell.p || 0;
      k.pv = pv;
      if (inp && !k.prev) k.cv += cell.t === 'CTU' ? 1 : -1;
      k.prev = inp;
      k.dn = cell.t === 'CTU' ? k.cv >= pv : k.cv <= 0;
      break;
    }
  }
}

function plcScan(prog, mem, dt, record) {
  const pows = [];
  prog.rungs.forEach((rg) => {
    let pw = Array(rg.rows).fill(false); pw[0] = true;
    pw = mergeRows(rg, 0, pw);
    const rec = { b: [pw.slice()], o: [] };
    for (let c = 0; c < LC; c++) {
      const out = pw.map((p, r) => p && cellPass(rg.cells[r][c], mem));
      rec.o.push(out);
      pw = mergeRows(rg, c + 1, out);
      rec.b.push(pw);
    }
    for (let r = 0; r < rg.rows; r++) execOut(rg.cells[r][LC], pw[r], mem, dt);
    pows.push(rec);
  });
  if (record) Sim.ladderPow = pows;
}

/* =====================================================================
   LADDER EDITOR (renders into #ladderSvg)
   ===================================================================== */
const LW = 92, LH = 64, LX0 = 44, LTOP = 10, RUNG_HDR = 22;
const Lad = { tool: 'NO', addr: 'I0.0', preset: 5 };

const LTOOLS = [
  { t: 'NO', label: '┤ ├', tip: 'NO contact (XIC) – examine if ON' },
  { t: 'NC', label: '┤/├', tip: 'NC contact (XIO) – examine if OFF' },
  { t: 'WIRE', label: '───', tip: 'Horizontal wire' },
  { t: 'OTE', label: '( )', tip: 'Output coil' },
  { t: 'SET', label: '(S)', tip: 'Set / Latch coil' },
  { t: 'RST', label: '(R)', tip: 'Reset / Unlatch (also resets T / C)' },
  { t: 'TON', label: 'TON', tip: 'On-delay timer (address T0..T99, preset seconds)' },
  { t: 'TOF', label: 'TOF', tip: 'Off-delay timer' },
  { t: 'CTU', label: 'CTU', tip: 'Up counter (address C0..C99, preset count)' },
  { t: 'VL', label: '┬ L', tip: 'Branch link at LEFT edge of clicked cell (connects to row above)' },
  { t: 'VR', label: '┬ R', tip: 'Branch link at RIGHT edge of clicked cell (connects to row above)' },
  { t: 'DEL', label: '✕', tip: 'Erase cell' },
];
const OUT_TYPES = new Set(['OTE', 'SET', 'RST', 'TON', 'TOF', 'CTU', 'CTD']);

function rungY(i) {
  let y = LTOP;
  for (let k = 0; k < i; k++) y += RUNG_HDR + project.program.rungs[k].rows * LH + 12;
  return y;
}

function ladderSym(cell, pin, pout, mem) {
  const hi = 'lp', lo = 'lw';
  const ci = pin ? hi : lo, co = pout ? hi : lo;
  const mid = LH / 2;
  const sym = (s) => `<g>${s}</g>`;
  if (!cell) return '';
  const sname = (a) => { const s = project.program.symbols && project.program.symbols[normAddr(a)]; return s ? s : ''; };
  switch (cell.t) {
    case 'WIRE': return `<line class="${ci}" x1="0" y1="${mid}" x2="${LW}" y2="${mid}"/>`;
    case 'NO': case 'NC': {
      const on = mem ? getBit(mem, cell.a) : false;
      return sym(`<line class="${ci}" x1="0" y1="${mid}" x2="${LW / 2 - 8}" y2="${mid}"/>`
        + `<line class="${co}" x1="${LW / 2 + 8}" y1="${mid}" x2="${LW}" y2="${mid}"/>`
        + `<line class="lc${on ? ' on' : ''}" x1="${LW / 2 - 8}" y1="${mid - 12}" x2="${LW / 2 - 8}" y2="${mid + 12}"/>`
        + `<line class="lc${on ? ' on' : ''}" x1="${LW / 2 + 8}" y1="${mid - 12}" x2="${LW / 2 + 8}" y2="${mid + 12}"/>`
        + (cell.t === 'NC' ? `<line class="lc" x1="${LW / 2 - 10}" y1="${mid + 12}" x2="${LW / 2 + 10}" y2="${mid - 12}"/>` : '')
        + `<text class="la" x="${LW / 2}" y="${mid - 18}">${esc(cell.a)}</text>`
        + `<text class="ls" x="${LW / 2}" y="${mid + 24}">${esc(sname(cell.a))}</text>`);
    }
    case 'OTE': case 'SET': case 'RST': {
      const on = mem ? (cell.t === 'OTE' ? pin : getBit(mem, cell.a)) : false;
      const letter = cell.t === 'SET' ? 'S' : cell.t === 'RST' ? 'R' : '';
      return sym(`<line class="${ci}" x1="0" y1="${mid}" x2="${LW / 2 - 12}" y2="${mid}"/>`
        + `<path class="lc${on ? ' on' : ''}" d="M${LW / 2 - 6},${mid - 12} A14,14 0 0 0 ${LW / 2 - 6},${mid + 12} M${LW / 2 + 6},${mid - 12} A14,14 0 0 1 ${LW / 2 + 6},${mid + 12}"/>`
        + `<text class="la" x="${LW / 2}" y="${mid + 1}" dominant-baseline="middle">${letter}</text>`
        + `<text class="la" x="${LW / 2}" y="${mid - 18}">${esc(cell.a)}</text>`
        + `<text class="ls" x="${LW / 2}" y="${mid + 24}">${esc(sname(cell.a))}</text>`);
    }
    case 'TON': case 'TOF': case 'CTU': case 'CTD': {
      const m = normAddr(cell.a).match(ADDR_RE);
      let info = '', dn = false;
      if (mem && m) {
        if (m[6]) { const t = mem.T[m[7]]; if (t) { info = (t.acc / 1000).toFixed(1) + 's'; dn = t.dn; } }
        if (m[8]) { const k = mem.C[m[9]]; if (k) { info = 'CV=' + k.cv; dn = k.dn; } }
      }
      const isT = cell.t[0] === 'T';
      return sym(`<line class="${ci}" x1="0" y1="${mid}" x2="10" y2="${mid}"/>`
        + `<rect class="lbox${dn ? ' dn' : ''}" x="10" y="6" width="${LW - 14}" height="${LH - 12}" rx="3"/>`
        + `<text class="lt" x="${LW / 2 + 2}" y="18">${cell.t} ${esc(cell.a)}</text>`
        + `<text class="ls" x="${LW / 2 + 2}" y="32">${isT ? 'PT ' + cell.p + 's' : 'PV ' + cell.p}</text>`
        + `<text class="ls" x="${LW / 2 + 2}" y="46">${info}${dn ? ' DN' : ''}</text>`);
    }
  }
  return '';
}

function renderLadder() {
  const svg = document.getElementById('ladderSvg');
  if (!svg) return;
  const prog = project.program;
  const plc = project.comps.find(c => c.type === 'plc');
  const mem = (Sim.run && plc && plc.st) ? plc.st.mem : null;
  const live = Sim.run && plc && plc.st && plc.st.pw && plc.st.run;
  let s = '';
  const totalH = rungY(prog.rungs.length) + 20;
  const W = LX0 + NCOL * LW + 30;
  prog.rungs.forEach((rg, ri) => {
    const y0 = rungY(ri);
    const pw = live ? Sim.ladderPow[ri] : null;
    s += `<g transform="translate(0,${y0})">`;
    s += `<text class="lr" x="4" y="14">R${ri}</text>`;
    s += `<foreignObject x="${LX0}" y="0" width="${LW * 5}" height="20"><input xmlns="http://www.w3.org/1999/xhtml" class="rcomment" data-rung="${ri}" value="${esc(rg.comment || '')}" placeholder="Rung comment…"/></foreignObject>`;
    s += `<g class="rbtns"><text class="rb" data-act="addrow" data-rung="${ri}" x="${LX0 + LW * 5 + 10}" y="14">+row</text>`
      + `<text class="rb" data-act="delrow" data-rung="${ri}" x="${LX0 + LW * 5 + 54}" y="14">−row</text>`
      + `<text class="rb" data-act="ins" data-rung="${ri}" x="${LX0 + LW * 5 + 98}" y="14">+rung↓</text>`
      + `<text class="rb red" data-act="delrung" data-rung="${ri}" x="${LX0 + LW * 5 + 158}" y="14">delete</text></g>`;
    const top = RUNG_HDR;
    // rails
    s += `<line class="${live ? 'lp' : 'lw'} rail" x1="${LX0}" y1="${top}" x2="${LX0}" y2="${top + rg.rows * LH}"/>`;
    s += `<line class="lw rail" x1="${LX0 + NCOL * LW}" y1="${top}" x2="${LX0 + NCOL * LW}" y2="${top + rg.rows * LH}"/>`;
    for (let r = 0; r < rg.rows; r++) {
      for (let c = 0; c < NCOL; c++) {
        const x = LX0 + c * LW, y = top + r * LH;
        const cell = rg.cells[r][c];
        const pin = pw ? pw.b[c][r] : false;
        const pout = pw ? (c < LC ? pw.o[c][r] : false) : false;
        s += `<g transform="translate(${x},${y})">`
          + `<rect class="lcell${c === LC ? ' outcol' : ''}" data-rung="${ri}" data-row="${r}" data-col="${c}" x="0" y="0" width="${LW}" height="${LH}"/>`
          + `<g pointer-events="none">${ladderSym(cell, pin, pout, mem)}</g>`
          + '</g>';
        // connect output coil to right rail
        if (c === LC && cell) { const x1 = ['OTE', 'SET', 'RST'].includes(cell.t) ? x + LW / 2 + 12 : x + LW - 4; s += `<line class="lw" x1="${x1}" y1="${y + LH / 2}" x2="${x + LW}" y2="${y + LH / 2}"/>`; }
      }
      if (r < rg.rows - 1) {
        for (let b = 0; b <= LC; b++) {
          if (!rg.v[r][b]) continue;
          const x = LX0 + b * LW;
          const on = pw ? (pw.b[b][r] || pw.b[b][r + 1]) : false;
          s += `<line class="${on ? 'lp' : 'lw'}" x1="${x}" y1="${top + r * LH + LH / 2}" x2="${x}" y2="${top + (r + 1) * LH + LH / 2}"/>`;
        }
      }
    }
    s += '</g>';
  });
  svg.setAttribute('width', W);
  svg.setAttribute('height', totalH);
  svg.innerHTML = s;
  renderIoTable(mem);
}

function renderIoTable(mem) {
  const el = document.getElementById('ioTable');
  if (!el) return;
  const plc = project.comps.find(c => c.type === 'plc');
  let h = '';
  if (!plc) h += `<div class="warnbox">No PLC on the schematic. Add one from <b>PLC</b> in the palette and wire its inputs/outputs.</div>`;
  else if (Sim.run && !plc.st.pw) h += `<div class="warnbox">PLC has no power (wire L+ / M to 24V DC).</div>`;
  const row = (a, on, cls) => `<div class="io ${on ? cls : ''}"><span class="led"></span>${a}<i>${esc((project.program.symbols || {})[a] || '')}</i></div>`;
  h += '<div class="ioh">Inputs</div>';
  for (let i = 0; i < PLC_IN; i++) h += row('I0.' + i, mem && mem.I[i], 'in');
  h += '<div class="ioh">Outputs</div>';
  for (let i = 0; i < PLC_OUT; i++) h += row('Q0.' + i, mem && mem.Q[i], 'out');
  if (mem) {
    const ms = Object.keys(mem.M).filter(k => mem.M[k]);
    if (ms.length) h += '<div class="ioh">Memory ON</div>' + ms.map(k => row('M' + k, true, 'in')).join('');
    const ts = Object.keys(mem.T);
    if (ts.length) h += '<div class="ioh">Timers</div>' + ts.map(k => `<div class="io">T${k}: ${(mem.T[k].acc / 1000).toFixed(1)}/${((mem.T[k].pt || 0) / 1000)}s ${mem.T[k].dn ? '<b>DN</b>' : ''}</div>`).join('');
    const cs = Object.keys(mem.C);
    if (cs.length) h += '<div class="ioh">Counters</div>' + cs.map(k => `<div class="io">C${k}: ${mem.C[k].cv}/${mem.C[k].pv || 0} ${mem.C[k].dn ? '<b>DN</b>' : ''}</div>`).join('');
  }
  el.innerHTML = h;
}

function autoWireRow(rg, r, upTo) {
  // fill empty logic cells between start and upTo with wire
  let start = r === 0 ? 0 : -1;
  if (start < 0) {
    for (let c = 0; c < LC; c++) if (rg.cells[r][c] || rg.v[r - 1] && rg.v[r - 1][c]) { start = c; break; }
    if (start < 0) return;
  }
  for (let c = start; c < upTo; c++) if (!rg.cells[r][c]) rg.cells[r][c] = { t: 'WIRE' };
}

function ladderClick(ri, r, c) {
  if (Sim.run) { toast('Stop the simulation to edit the ladder program'); return; }
  const rg = project.program.rungs[ri];
  const tool = Lad.tool;
  const addr = normAddr(document.getElementById('ladAddr').value);
  const pre = +document.getElementById('ladPre').value || 0;
  pushUndo();
  if (tool === 'DEL') { rg.cells[r][c] = null; }
  else if (tool === 'VL' || tool === 'VR') {
    if (r === 0) { toast('Click a cell on a lower (branch) row – the link connects it to the row above'); undoStack.pop(); return; }
    const b = tool === 'VL' ? c : c + 1;
    if (b > LC) { toast('Branches must close before the output column'); undoStack.pop(); return; }
    rg.v[r - 1][b] = !rg.v[r - 1][b];
  } else if (tool === 'WIRE') {
    if (c === LC) { toast('Output column takes coils / timers / counters'); undoStack.pop(); return; }
    rg.cells[r][c] = { t: 'WIRE' };
  } else if (OUT_TYPES.has(tool)) {
    if (c !== LC) { toast('Coils, timers & counters go in the last (output) column'); undoStack.pop(); return; }
    if (!validAddr(addr)) { toast('Invalid address. Use I0.0–I0.7, Q0.0–Q0.5, M0, T0, C0'); undoStack.pop(); return; }
    if ((tool === 'TON' || tool === 'TOF') && !/^T\d+$/.test(addr)) { toast('Timer address must be T0, T1 …'); undoStack.pop(); return; }
    if (tool === 'CTU' && !/^C\d+$/.test(addr)) { toast('Counter address must be C0, C1 …'); undoStack.pop(); return; }
    if ((tool === 'OTE' || tool === 'SET') && /^[ITC]/.test(addr)) { toast('Coils can write Q or M addresses only'); undoStack.pop(); return; }
    rg.cells[r][c] = { t: tool, a: addr, p: pre };
    autoWireRow(rg, r, LC);
  } else {
    if (c === LC) { toast('Contacts go in columns 1–7, not in the output column'); undoStack.pop(); return; }
    if (!validAddr(addr)) { toast('Invalid address. Use I0.0–I0.7, Q0.0–Q0.5, M0, T0, C0'); undoStack.pop(); return; }
    rg.cells[r][c] = { t: tool, a: addr };
    autoWireRow(rg, r, c);
  }
  saveLocal();
  renderLadder();
}

function ladderAction(act, ri) {
  if (Sim.run) { toast('Stop the simulation to edit the ladder program'); return; }
  const P = project.program;
  const rg = P.rungs[ri];
  pushUndo();
  if (act === 'addrow') {
    rg.rows++; rg.cells.push(Array(NCOL).fill(null)); rg.v.push(Array(NCOL).fill(false));
  } else if (act === 'delrow') {
    if (rg.rows > 1) { rg.rows--; rg.cells.pop(); rg.v.pop(); rg.v[rg.rows - 1] = Array(NCOL).fill(false); }
  } else if (act === 'ins') {
    P.rungs.splice(ri + 1, 0, newRung(1));
  } else if (act === 'delrung') {
    P.rungs.splice(ri, 1);
    if (!P.rungs.length) P.rungs.push(newRung(1));
  }
  saveLocal();
  renderLadder();
}

function initLadderUI() {
  const tb = document.getElementById('ladTools');
  tb.innerHTML = LTOOLS.map(t => `<button class="ltool${t.t === Lad.tool ? ' act' : ''}" data-lt="${t.t}" title="${t.tip}">${t.label}</button>`).join('');
  tb.addEventListener('click', e => {
    const b = e.target.closest('[data-lt]'); if (!b) return;
    Lad.tool = b.dataset.lt;
    tb.querySelectorAll('.ltool').forEach(x => x.classList.toggle('act', x === b));
    const addr = document.getElementById('ladAddr');
    if (/^T/.test(Lad.tool) && !/^T/.test(addr.value)) addr.value = 'T0';
    if (/^C/.test(Lad.tool) && !/^C/.test(addr.value)) addr.value = 'C0';
  });
  const svg = document.getElementById('ladderSvg');
  svg.addEventListener('click', e => {
    const cell = e.target.closest('[data-col]');
    if (cell) { ladderClick(+cell.dataset.rung, +cell.dataset.row, +cell.dataset.col); return; }
    const btn = e.target.closest('[data-act]');
    if (btn) ladderAction(btn.dataset.act, +btn.dataset.rung);
  });
  svg.addEventListener('contextmenu', e => {
    const cell = e.target.closest('[data-col]');
    if (!cell) return;
    e.preventDefault();
    const rg = project.program.rungs[+cell.dataset.rung];
    const cv = rg.cells[+cell.dataset.row][+cell.dataset.col];
    if (cv && cv.a) {
      const na = prompt('Edit address (e.g. I0.0, Q0.1, M5, T0, C0):', cv.a);
      if (na === null) return;
      if (!validAddr(na)) { toast('Invalid address'); return; }
      pushUndo(); cv.a = normAddr(na);
      if (cv.p !== undefined) { const np = prompt(cv.t[0] === 'C' ? 'Preset count:' : 'Preset time (seconds):', cv.p); if (np !== null) cv.p = +np || 0; }
      saveLocal(); renderLadder();
    }
  });
  svg.addEventListener('change', e => {
    if (e.target.classList.contains('rcomment')) {
      project.program.rungs[+e.target.dataset.rung].comment = e.target.value; saveLocal();
    }
  });
  document.getElementById('ladAddRung').onclick = () => { if (Sim.run) return; pushUndo(); project.program.rungs.push(newRung(1)); saveLocal(); renderLadder(); };
  document.getElementById('ladSymbols').onclick = editSymbols;
}

function editSymbols() {
  const syms = project.program.symbols || (project.program.symbols = {});
  const txt = Object.entries(syms).map(([k, v]) => `${k}=${v}`).join('; ');
  const r = prompt('Symbol names, separated by ;   ADDRESS=NAME\n(e.g.  I0.0=START; I0.1=STOP; Q0.0=MOTOR)', txt || 'I0.0=START; I0.1=STOP; Q0.0=MOTOR');
  if (r === null) return;
  pushUndo();
  const out = {};
  r.split(/\n|;/).forEach(l => { const [k, v] = l.split('='); if (k && v && validAddr(k)) out[normAddr(k)] = v.trim(); });
  project.program.symbols = out;
  saveLocal(); renderLadder();
}
