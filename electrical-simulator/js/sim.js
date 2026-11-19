'use strict';
/* =====================================================================
   SIMULATION ENGINE
   - Builds a net list from wires (union-find on grid points)
   - Each iteration: closed contacts merge nets, sources label nets,
     loads see the voltage between their two nets, devices (coils,
     timers, PLC) update -> repeat until stable.
   ===================================================================== */
const Sim = {
  run: false,
  t: 0,
  timer: null,
  topo: null,
  nets: null,           // last computed nets {find, lab, shorted}
  alarms: new Map(),    // key -> {msg, level, t}
  ladderPow: [],        // per rung power flow (from last PLC scan)
  speed: 1,
};

/** Context object passed to component functions */
const S = {
  get run() { return Sim.run; },
  active(tag) {
    if (!Sim.topo) return false;
    const c = Sim.topo.devByTag.get(tag);
    if (!c) return false;
    return !!DEFS[c.type].isActive(c);
  },
};

function compTerms(c) {
  const d = DEFS[c.type];
  return d.terms.map(t => {
    const [rx, ry] = rotPt(t.x, t.y, c.rot || 0);
    return { n: t.n, x: c.x + rx, y: c.y + ry };
  });
}
function rotPt(x, y, r) {
  r = ((r % 4) + 4) % 4;
  if (r === 0) return [x, y];
  if (r === 1) return [-y, x];
  if (r === 2) return [-x, -y];
  return [y, -x];
}
function onSegInterior(p, a, b) {
  if (a[0] === b[0] && p[0] === a[0]) return p[1] > Math.min(a[1], b[1]) && p[1] < Math.max(a[1], b[1]);
  if (a[1] === b[1] && p[1] === a[1]) return p[0] > Math.min(a[0], b[0]) && p[0] < Math.max(a[0], b[0]);
  return false;
}

function buildTopo(prj) {
  const idx = new Map(); let n = 0;
  const id = (x, y) => { const k = x + ',' + y; let v = idx.get(k); if (v === undefined) { v = n++; idx.set(k, v); } return v; };
  const compT = new Map();
  const devByTag = new Map();
  const dupTags = [];
  for (const c of prj.comps) {
    const m = {};
    for (const t of compTerms(c)) m[t.n] = id(t.x, t.y);
    compT.set(c.id, m);
    const d = DEFS[c.type];
    if (d.device && c.props.tag) {
      if (devByTag.has(c.props.tag)) dupTags.push(c.props.tag);
      devByTag.set(c.props.tag, c);
    }
  }
  const unions = [];
  const wireIds = new Map();
  for (const w of prj.wires) {
    const ids = w.pts.map(p => id(p[0], p[1]));
    wireIds.set(w.id, ids[0]);
    for (let i = 1; i < ids.length; i++) unions.push([ids[0], ids[i]]);
  }
  // T-junctions: wire end lying on another wire's segment
  for (const w of prj.wires) {
    for (const e of [w.pts[0], w.pts[w.pts.length - 1]]) {
      for (const w2 of prj.wires) {
        if (w2 === w) continue;
        for (let i = 1; i < w2.pts.length; i++) {
          if (onSegInterior(e, w2.pts[i - 1], w2.pts[i])) unions.push([id(e[0], e[1]), id(w2.pts[0][0], w2.pts[0][1])]);
        }
      }
    }
  }
  const parent = [...Array(n).keys()];
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const [a, b] of unions) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
  return { n, parent, compT, devByTag, dupTags, wireIds, idx };
}

function computeNets(skipIds) {
  const topo = Sim.topo;
  const P = topo.parent.slice();
  const find = x => { while (P[x] !== x) { P[x] = P[P[x]]; x = P[x]; } return x; };
  const uni = (a, b) => { if (a === undefined || b === undefined) return; a = find(a); b = find(b); if (a !== b) P[a] = b; };
  for (const c of project.comps) {
    if (skipIds && skipIds.has(c.id)) continue;
    const d = DEFS[c.type];
    if (!d.conducts) continue;
    const tm = topo.compT.get(c.id);
    for (const [a, b] of d.conducts(c, S)) uni(tm[a], tm[b]);
  }
  const lab = new Map();
  for (const c of project.comps) {
    const d = DEFS[c.type];
    if (!d.sources) continue;
    const tm = topo.compT.get(c.id);
    for (const [t, l] of d.sources(c)) {
      const r = find(tm[t]);
      let s = lab.get(r); if (!s) { s = new Set(); lab.set(r, s); }
      s.add(l);
    }
  }
  const shorted = new Set();
  for (const [r, s] of lab) if (s.size > 1) shorted.add(r);
  return { find, lab, shorted };
}

function labelOfIdx(nets, i) {
  if (i === undefined) return null;
  const s = nets.lab.get(nets.find(i));
  if (!s || s.size !== 1) return null;
  return s.values().next().value;
}

function alarm(key, msg, level = 'warn') {
  if (!Sim.alarms.has(key)) Sim.alarms.set(key, { msg, level, t: Sim.t });
}

function ensureSt(c) {
  if (!Object.prototype.hasOwnProperty.call(c, 'st')) {
    const d = DEFS[c.type];
    Object.defineProperty(c, 'st', { value: d.init ? d.init(c) : {}, writable: true, enumerable: false, configurable: true });
  }
  return c.st;
}
function resetRuntime() {
  for (const c of project.comps) { delete c.st; ensureSt(c); }
  Sim.alarms.clear(); Sim.t = 0; Sim.ladderPow = [];
}

function ratingAmps(c) { return parseFloat(c.props.rating) || 999; }

/** Handle short circuit: trip the most selective protective device */
function handleShort(nets) {
  const prot = project.comps.filter(c => DEFS[c.type].protective && DEFS[c.type].conducts(c, S).length);
  const inShort = prot.filter(c => {
    const tm = Sim.topo.compT.get(c.id);
    return Object.values(tm).some(i => nets.shorted.has(nets.find(i)));
  });
  if (!inShort.length) return false;
  // which single device clears the short?
  const clears = inShort.filter(c => computeNets(new Set([c.id])).shorted.size === 0);
  let toTrip;
  if (clears.length) { clears.sort((a, b) => ratingAmps(a) - ratingAmps(b)); toTrip = [clears[0]]; }
  else toTrip = inShort;
  for (const c of toTrip) {
    c.st.tripped = true;
    alarm('short-' + c.id + '-' + Sim.t, `⚡ SHORT CIRCUIT! ${c.props.tag} ${DEFS[c.type].name.startsWith('Fuse') ? 'blown' : 'tripped'} – find & fix the fault, then reset`, 'error');
  }
  return true;
}

function solve(dt) {
  if (!Sim.topo) Sim.topo = buildTopo(project);
  const topo = Sim.topo;
  for (const c of project.comps) ensureSt(c);
  if (topo.dupTags.length) alarm('dup', `Duplicate device tag(s): ${[...new Set(topo.dupTags)].join(', ')} – each coil/timer/OLR needs a unique tag`, 'warn');
  const dtUsed = new Set();
  const ctx = {
    takeDt(id) { if (dtUsed.has(id)) return 0; dtUsed.add(id); return dt; },
    record: true,
  };
  let nets, iter;
  const MAX = 40;
  for (iter = 0; iter < MAX; iter++) {
    nets = computeNets();
    if (nets.shorted.size) {
      if (handleShort(nets)) { iter--; if (iter < -20) break; continue; }
      alarm('deadshort', '⚡ DEAD SHORT with no MCB/fuse in the path! Simulation stopped. Add protection.', 'error');
      Sim.nets = nets;
      stopSim(true);
      return;
    }
    const V = (c) => {
      const tm = topo.compT.get(c.id);
      return (a, b) => voltage(labelOfIdx(nets, tm[a]), labelOfIdx(nets, tm[b]));
    };
    let changed = false;
    for (const c of project.comps) {
      const d = DEFS[c.type];
      if (d.evaluate && d.evaluate(c, V(c), ctx)) changed = true;
    }
    if (!changed) break;
  }
  if (iter >= MAX) alarm('osc', 'Circuit is oscillating (relay chatter) – check your logic/interlocks', 'warn');
  Sim.nets = nets;
  // post evaluation (motors) & warnings
  const pctx = {
    lab: (c, t) => labelOfIdx(nets, topo.compT.get(c.id)[t]),
    root: (c, t) => nets.find(topo.compT.get(c.id)[t]),
    warn: (m) => alarm('w-' + m, m, 'warn'),
  };
  for (const c of project.comps) {
    const d = DEFS[c.type];
    if (d.post) d.post(c, pctx);
    if (c.st.over) alarm('ov-' + c.id, `${c.props.tag}: coil over-voltage (${c.st.v}V on ${c.props.volt} coil) – coil will burn!`, 'error');
  }
}

/* ---------------- run loop ---------------- */
const TICK = 50;
function tick() {
  const dt = TICK * Sim.speed;
  Sim.t += dt;
  for (const c of project.comps) {
    const d = DEFS[c.type];
    if (d.tick) d.tick(c, dt);
    if (c.st.run !== undefined && d.interact === 'motor') {
      if (c.st.run) {
        const sp = c.st.mode === 'STAR' ? 6 : 14;
        c.st.ang = ((c.st.ang || 0) + (c.st.dir < 0 ? -sp : sp) * Sim.speed) % 360;
        if (c.st.ovl) {
          c.st.ovlT += dt;
          if (c.st.ovlT > 3000) { c.st.ovlT = 0; tripOlrFor(c); }
        }
      } else c.st.ovlT = 0;
    }
  }
  solve(dt);
  if (Sim.run) onSimFrame();
}

function tripOlrFor(m) {
  const nets = Sim.nets, topo = Sim.topo;
  const mRoots = new Set(Object.values(topo.compT.get(m.id)).map(i => nets.find(i)));
  let found = false;
  for (const c of project.comps) {
    if (c.type !== 'olr3' || c.st.tripped) continue;
    const tm = topo.compT.get(c.id);
    if (['2', '4', '6'].some(t => mRoots.has(nets.find(tm[t])))) {
      c.st.tripped = true; found = true;
      alarm('olr-' + c.id + Sim.t, `🔥 OVERLOAD: ${c.props.tag} tripped because motor ${m.props.tag} is overloaded. Remove overload, then reset OLR.`, 'error');
    }
  }
  if (!found) alarm('noolr-' + m.id, `🔥 Motor ${m.props.tag} overloaded but no OLR protects it – motor winding would burn!`, 'error');
}

function startSim() {
  if (Sim.run) return;
  Sim.topo = buildTopo(project);
  resetRuntime();
  Sim.run = true;
  solve(0);
  if (Sim.run) {
    Sim.timer = setInterval(tick, TICK);
    onSimStateChange();
  }
}
function stopSim(keepAlarms) {
  if (Sim.timer) clearInterval(Sim.timer);
  Sim.timer = null;
  const was = Sim.run;
  Sim.run = false;
  if (!keepAlarms) Sim.alarms.clear();
  for (const c of project.comps) { delete c.st; ensureSt(c); }
  Sim.ladderPow = [];
  if (was || keepAlarms) onSimStateChange();
}

/** user interaction while running */
function simInteract(c, kind) {
  const d = DEFS[c.type], st = c.st;
  switch (d.interact) {
    case 'momentary': st.pressed = kind === 'down'; break;
    case 'toggle': if (kind === 'down') st.on = !st.on; break;
    case 'cycle3': if (kind === 'down') st.pos = st.pos === 0 ? 1 : st.pos === 1 ? 2 : 0; break;
    case 'sensor': if (kind === 'down') st.det = !st.det; break;
    case 'mcb': if (kind === 'down') { if (st.tripped) { st.tripped = false; st.off = false; } else st.off = !st.off; } break;
    case 'fuse': if (kind === 'down' && st.tripped) st.tripped = false; break;
    case 'olr': if (kind === 'down') st.tripped = !st.tripped; break;
    case 'motor': if (kind === 'down') { st.ovl = !st.ovl; st.ovlT = 0; } break;
    case 'plc': if (kind === 'down') st.run = !st.run; break;
    default: return false;
  }
  solve(0);
  onSimFrame();
  return true;
}
