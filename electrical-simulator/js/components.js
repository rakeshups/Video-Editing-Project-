'use strict';
/* =====================================================================
   COMPONENT LIBRARY
   Every component is defined in local grid units (1 grid = G px).
   Terminals sit on grid points. Drawing is done in local px coords.
   ===================================================================== */
const G = 20;

const SRC_COLOR = { R: '#e53935', Y: '#e0a800', B: '#1e6fe0', N: '#546e7a', '+': '#c2185b', '-': '#3949ab' };
const SRC_NAME = { R: 'R (L1)', Y: 'Y (L2)', B: 'B (L3)', N: 'N', '+': '+24V DC', '-': '0V DC' };
const AC = new Set(['R', 'Y', 'B', 'N']);
const DC = new Set(['+', '-']);

/** Voltage between two source labels (0 if none / incompatible) */
function voltage(a, b) {
  if (!a || !b || a === b) return 0;
  if (AC.has(a) && AC.has(b)) return (a === 'N' || b === 'N') ? 230 : 415;
  if (DC.has(a) && DC.has(b)) return 24;
  return 0;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function ln(x1, y1, x2, y2, cls) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${cls ? ` class="${cls}"` : ''}/>`;
}
/** text that stays upright even when the component is rotated */
function tx(x, y, s, rot, cls = 'st', anchor = 'middle') {
  const r = rot ? ` transform="rotate(${-rot * 90} ${x} ${y})"` : '';
  return `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle"${r}>${esc(s)}</text>`;
}

const DEFS = {};
const CATS = ['Supply', 'Protection', 'Switches & Sensors', 'Coils, Relays & Timers', 'Contacts', 'Loads & Motors', 'PLC', 'Misc'];
function def(type, d) { d.type = type; DEFS[type] = d; }

const TT = (a, b) => [{ n: a, x: 0, y: 0 }, { n: b, x: 0, y: 4 }];

/* ---------- property field helpers ---------- */
const F_TAG = { k: 'tag', label: 'Tag / Name', type: 'text' };
const F_TAGREF = { k: 'tag', label: 'Linked device tag (coil/timer/OLR)', type: 'tagref' };
const F_COLOR = opts => ({ k: 'color', label: 'Colour', type: 'select', options: opts });
const F_RATING = { k: 'rating', label: 'Rating', type: 'select', options: ['2A', '4A', '6A', '10A', '16A', '20A', '25A', '32A', '40A', '63A'] };
const F_VOLT = { k: 'volt', label: 'Coil voltage', type: 'select', options: ['230V AC', '415V AC', '24V DC'] };
const F_DESC = { k: 'desc', label: 'Description (shown on drawing)', type: 'text' };

const BTN_COL = { green: '#2e9e44', red: '#d32f2f', black: '#333', yellow: '#f2c200', blue: '#1e6fe0', white: '#f5f5f5' };
const LAMP_COL = { red: '#ff3b30', green: '#34c759', yellow: '#ffcc00', blue: '#2f7bff', white: '#ffffff', amber: '#ff9500' };

/* ---------- shared symbol drawing ---------- */
function contactSym(kind, closed, hot) {
  let s = ln(0, 0, 0, 28) + ln(0, 52, 0, 80);
  const h = hot ? 'hot' : '';
  if (kind === 'NO') {
    s += closed ? ln(0, 52, 0, 28, h) : ln(0, 52, -14, 30);
  } else {
    s += ln(0, 28, 12, 28);
    s += closed ? ln(0, 52, 13, 26, h) : ln(0, 52, -14, 30);
  }
  return s;
}
function bladeMid(kind, closed) {
  if (kind === 'NO') return closed ? 0 : -7;
  return closed ? 6 : -7;
}
function actuator(kind, closed) {
  return ln(bladeMid(kind, closed), 40, -22, 40, 'dash');
}

function pbDraw(kind, pressed, color, hot, label) {
  const closed = kind === 'NO' ? pressed : !pressed;
  let s = contactSym(kind, closed, hot) + actuator(kind, closed);
  s += ln(-22, 32, -22, 48);
  const fill = BTN_COL[color] || '#888';
  s += `<circle cx="${pressed ? -27 : -31}" cy="40" r="7" class="btn" style="fill:${fill}"/>`;
  return s;
}

function voltNum(v) { return v === '24V DC' ? 24 : v === '415V AC' ? 415 : 230; }

/* =====================================================================
   SUPPLIES
   ===================================================================== */
def('supply1', {
  name: '1Φ Supply 230V AC', cat: 'Supply', prefix: 'PS', noRotate: true,
  terms: [{ n: 'L', x: 1, y: 2 }, { n: 'N', x: 3, y: 2 }], bbox: [0, 0, 4, 2],
  props: { tag: 'L-N' }, schema: [F_TAG],
  sources: () => [['L', 'R'], ['N', 'N']],
  draw: () => `<rect class="box src" x="0" y="0" width="80" height="34" rx="4"/>`
    + tx(40, 10, '230V AC 1Φ', 0, 'st b') + tx(20, 26, 'L', 0, 'st sm') + tx(60, 26, 'N', 0, 'st sm')
    + ln(20, 34, 20, 40) + ln(60, 34, 60, 40),
  label: () => [],
});
def('supply3', {
  name: '3Φ Supply 415V AC', cat: 'Supply', prefix: 'PS', noRotate: true,
  terms: [{ n: 'R', x: 1, y: 2 }, { n: 'Y', x: 3, y: 2 }, { n: 'B', x: 5, y: 2 }, { n: 'N', x: 7, y: 2 }], bbox: [0, 0, 8, 2],
  props: { tag: 'MAINS' }, schema: [F_TAG],
  sources: () => [['R', 'R'], ['Y', 'Y'], ['B', 'B'], ['N', 'N']],
  draw: () => `<rect class="box src" x="0" y="0" width="160" height="34" rx="4"/>`
    + tx(80, 10, '415V AC 3Φ  50Hz', 0, 'st b')
    + ['R', 'Y', 'B', 'N'].map((p, i) => tx(20 + 40 * i, 26, p, 0, 'st sm') + ln(20 + 40 * i, 34, 20 + 40 * i, 40)).join(''),
  label: () => [],
});
def('supplydc', {
  name: '24V DC Supply (SMPS)', cat: 'Supply', prefix: 'PS', noRotate: true,
  terms: [{ n: '+', x: 1, y: 2 }, { n: '-', x: 3, y: 2 }], bbox: [0, 0, 4, 2],
  props: { tag: 'SMPS' }, schema: [F_TAG],
  sources: () => [['+', '+'], ['-', '-']],
  draw: () => `<rect class="box src" x="0" y="0" width="80" height="34" rx="4"/>`
    + tx(40, 10, '24V DC', 0, 'st b') + tx(20, 26, '+', 0, 'st sm') + tx(60, 26, '0V', 0, 'st sm')
    + ln(20, 34, 20, 40) + ln(60, 34, 60, 40),
  label: () => [],
});

/* =====================================================================
   PROTECTION
   ===================================================================== */
function mcbDef(type, poles) {
  const terms = [];
  for (let i = 0; i < poles; i++) { terms.push({ n: `${2 * i + 1}`, x: 2 * i, y: 0 }, { n: `${2 * i + 2}`, x: 2 * i, y: 4 }); }
  def(type, {
    name: `MCB ${poles}-Pole`, cat: 'Protection', prefix: 'Q', protective: true,
    terms, bbox: [-2, 0, 2 * (poles - 1) + 1, 4],
    props: { tag: 'Q1', rating: poles === 1 ? '6A' : '32A' }, schema: [F_TAG, F_RATING],
    init: () => ({ off: false, tripped: false }),
    interact: 'mcb',
    closed: c => !c.st.off && !c.st.tripped,
    conducts(c) { if (!this.closed(c)) return []; const r = []; for (let i = 0; i < poles; i++) r.push([`${2 * i + 1}`, `${2 * i + 2}`]); return r; },
    draw(c, S) {
      const cl = this.closed(c); let s = '';
      for (let i = 0; i < poles; i++) {
        const x = 40 * i;
        s += `<g transform="translate(${x},0)">` + ln(0, 0, 0, 28) + ln(0, 52, 0, 80) + ln(-4, 24, 4, 32) + ln(-4, 32, 4, 24)
          + (cl ? ln(0, 52, 0, 28, S.run ? 'hot' : '') : ln(0, 52, -14, 30)) + '</g>';
      }
      const midx = cl ? 0 : -7;
      s += ln(midx, 40, 40 * (poles - 1) + (cl ? 0 : -7), 40, 'dash');
      s += ln(midx, 40, -22, 40, 'dash');
      const col = c.st.tripped ? '#ff9800' : cl ? '#2e9e44' : '#9e9e9e';
      s += `<rect x="-36" y="33" width="14" height="14" rx="2" class="btn" style="fill:${col}"/>`;
      return s;
    },
    label: (c) => [c.props.tag, c.props.rating + (c.st && c.st.tripped ? ' TRIPPED' : (c.st && c.st.off ? ' OFF' : ''))],
  });
}
mcbDef('mcb1', 1); mcbDef('mcb2', 2); mcbDef('mcb3', 3);

def('fuse', {
  name: 'Fuse', cat: 'Protection', prefix: 'F', protective: true,
  terms: TT('1', '2'), bbox: [-1, 0, 1, 4],
  props: { tag: 'F1', rating: '6A' }, schema: [F_TAG, F_RATING],
  init: () => ({ tripped: false }), interact: 'fuse',
  conducts: c => c.st.tripped ? [] : [['1', '2']],
  draw: c => `<rect x="-7" y="20" width="14" height="40"/>` + (c.st.tripped
    ? ln(0, 0, 0, 34) + ln(0, 46, 0, 80) + ln(-5, 35, 5, 45, 'red') + ln(5, 35, -5, 45, 'red')
    : ln(0, 0, 0, 80)),
  label: c => [c.props.tag, c.props.rating + (c.st && c.st.tripped ? ' BLOWN' : '')],
});

def('olr3', {
  name: 'Overload Relay (OLR) 3P', cat: 'Protection', prefix: 'F', device: true,
  terms: [{ n: '1', x: 0, y: 0 }, { n: '2', x: 0, y: 4 }, { n: '3', x: 2, y: 0 }, { n: '4', x: 2, y: 4 }, { n: '5', x: 4, y: 0 }, { n: '6', x: 4, y: 4 }],
  bbox: [-2, 0, 5, 4],
  props: { tag: 'F2', setting: '5A' }, schema: [F_TAG, { k: 'setting', label: 'Current setting', type: 'text' }],
  init: () => ({ tripped: false }), interact: 'olr',
  isActive: c => c.st.tripped,
  conducts: () => [['1', '2'], ['3', '4'], ['5', '6']],
  draw(c) {
    let s = '';
    const cls = c.st.tripped ? ' style="fill:#ffcc80"' : '';
    for (let i = 0; i < 3; i++) {
      s += `<g transform="translate(${40 * i},0)">` + ln(0, 0, 0, 24) + `<rect x="-8" y="24" width="16" height="32"${cls}/>`
        + `<path d="M0,24 V32 H-4 V48 H0 V56"/>` + ln(0, 56, 0, 80) + '</g>';
    }
    s += ln(8, 40, 32, 40, 'dash') + ln(48, 40, 72, 40, 'dash') + ln(-8, 40, -22, 40, 'dash');
    s += `<rect x="-36" y="33" width="14" height="14" rx="2" class="btn" style="fill:${c.st.tripped ? '#ff9800' : '#90a4ae'}"/>`;
    return s;
  },
  label: c => [c.props.tag, 'OLR ' + c.props.setting + (c.st && c.st.tripped ? ' TRIPPED' : '')],
});

/* =====================================================================
   SWITCHES & SENSORS
   ===================================================================== */
def('pb_no', {
  name: 'Push Button NO (Start)', cat: 'Switches & Sensors', prefix: 'S',
  terms: TT('3', '4'), bbox: [-2, 0, 1, 4],
  props: { tag: 'S1', color: 'green' }, schema: [F_TAG, F_COLOR(Object.keys(BTN_COL)), F_DESC],
  init: () => ({ pressed: false }), interact: 'momentary',
  conducts: c => c.st.pressed ? [['3', '4']] : [],
  draw: (c, S) => pbDraw('NO', c.st.pressed, c.props.color, S.run && c.st.pressed),
});
def('pb_nc', {
  name: 'Push Button NC (Stop)', cat: 'Switches & Sensors', prefix: 'S',
  terms: TT('1', '2'), bbox: [-2, 0, 1, 4],
  props: { tag: 'S1', color: 'red' }, schema: [F_TAG, F_COLOR(Object.keys(BTN_COL)), F_DESC],
  init: () => ({ pressed: false }), interact: 'momentary',
  conducts: c => c.st.pressed ? [] : [['1', '2']],
  draw: (c, S) => pbDraw('NC', c.st.pressed, c.props.color, S.run && !c.st.pressed),
});
def('estop', {
  name: 'Emergency Stop (latching NC)', cat: 'Switches & Sensors', prefix: 'S',
  terms: TT('1', '2'), bbox: [-2, 0, 1, 4],
  props: { tag: 'ES1' }, schema: [F_TAG, F_DESC],
  init: () => ({ on: false }), interact: 'toggle',
  conducts: c => c.st.on ? [] : [['1', '2']],
  draw(c, S) {
    const cl = !c.st.on;
    return contactSym('NC', cl, S.run && cl) + actuator('NC', cl) + ln(-22, 32, -22, 48)
      + `<path d="M${c.st.on ? -18 : -22},28 A12,12 0 0 0 ${c.st.on ? -18 : -22},52 Z" class="btn" style="fill:#e53935"/>`;
  },
  label: c => [c.props.tag, c.st && c.st.on ? 'PRESSED' : ''],
});
def('sw_toggle', {
  name: 'Selector / Toggle Switch NO (latching)', cat: 'Switches & Sensors', prefix: 'S',
  terms: TT('13', '14'), bbox: [-2, 0, 1, 4],
  props: { tag: 'SS1' }, schema: [F_TAG, F_DESC],
  init: () => ({ on: false }), interact: 'toggle',
  conducts: c => c.st.on ? [['13', '14']] : [],
  draw(c, S) {
    const cl = c.st.on;
    return contactSym('NO', cl, S.run && cl) + actuator('NO', cl) + `<path d="M-22,32 L-26,32 L-26,48 L-30,48" />`;
  },
  label: c => [c.props.tag, c.st && c.st.on ? 'ON' : 'OFF'],
});
def('sel3', {
  name: 'Selector 3-Pos (1-0-2) e.g. Hand-Off-Auto', cat: 'Switches & Sensors', prefix: 'S',
  terms: [{ n: 'C', x: 0, y: 4 }, { n: '1', x: -1, y: 0 }, { n: '2', x: 1, y: 0 }], bbox: [-3, 0, 2, 4],
  props: { tag: 'SS1', p1: 'HAND', p2: 'AUTO' }, schema: [F_TAG, { k: 'p1', label: 'Position 1 name', type: 'text' }, { k: 'p2', label: 'Position 2 name', type: 'text' }],
  init: () => ({ pos: 0 }), interact: 'cycle3',
  conducts: c => c.st.pos === 1 ? [['C', '1']] : c.st.pos === 2 ? [['C', '2']] : [],
  draw(c, S) {
    const p = c.st.pos, h = S.run && p ? 'hot' : '';
    const end = p === 1 ? [-20, 28] : p === 2 ? [20, 28] : [-4, 24];
    return ln(0, 52, 0, 80) + ln(-20, 0, -20, 28) + ln(20, 0, 20, 28) + ln(0, 52, end[0], end[1], h)
      + ln(end[0] / 2, 40, -40, 40, 'dash') + `<path d="M-40,32 L-44,32 L-44,48 L-48,48"/>`
      + tx(-20, 14, '1', 0, 'st xs', 'end') + tx(26, 14, '2', 0, 'st xs', 'start');
  },
  label: c => [c.props.tag, c.st ? (c.st.pos === 1 ? c.props.p1 : c.st.pos === 2 ? c.props.p2 : 'OFF') : ''],
});
def('limit_no', {
  name: 'Limit Switch NO', cat: 'Switches & Sensors', prefix: 'LS',
  terms: TT('13', '14'), bbox: [-2, 0, 1, 4],
  props: { tag: 'LS1' }, schema: [F_TAG, F_DESC],
  init: () => ({ on: false }), interact: 'toggle',
  conducts: c => c.st.on ? [['13', '14']] : [],
  draw: (c, S) => contactSym('NO', c.st.on, S.run && c.st.on) + actuator('NO', c.st.on) + `<path d="M-22,33 L-30,40 L-22,47"/><circle cx="-33" cy="40" r="3"/>`,
  label: c => [c.props.tag, c.st && c.st.on ? 'ACTUATED' : ''],
});
def('limit_nc', {
  name: 'Limit Switch NC', cat: 'Switches & Sensors', prefix: 'LS',
  terms: TT('11', '12'), bbox: [-2, 0, 1, 4],
  props: { tag: 'LS1' }, schema: [F_TAG, F_DESC],
  init: () => ({ on: false }), interact: 'toggle',
  conducts: c => c.st.on ? [] : [['11', '12']],
  draw: (c, S) => contactSym('NC', !c.st.on, S.run && !c.st.on) + actuator('NC', !c.st.on) + `<path d="M-22,33 L-30,40 L-22,47"/><circle cx="-33" cy="40" r="3"/>`,
  label: c => [c.props.tag, c.st && c.st.on ? 'ACTUATED' : ''],
});
def('float_sw', {
  name: 'Float / Level Switch NO', cat: 'Switches & Sensors', prefix: 'LSW',
  terms: TT('13', '14'), bbox: [-2, 0, 1, 4],
  props: { tag: 'FS1' }, schema: [F_TAG, F_DESC],
  init: () => ({ on: false }), interact: 'toggle',
  conducts: c => c.st.on ? [['13', '14']] : [],
  draw: (c, S) => contactSym('NO', c.st.on, S.run && c.st.on) + actuator('NO', c.st.on) + `<circle cx="-28" cy="${c.st.on ? 34 : 46}" r="6"/>` + ln(-36, 52, -20, 52),
  label: c => [c.props.tag, c.st && c.st.on ? 'LEVEL HIGH' : 'LEVEL LOW'],
});
def('sensor_pnp', {
  name: 'Proximity Sensor PNP (3-wire)', cat: 'Switches & Sensors', prefix: 'B',
  terms: [{ n: 'BN', x: 0, y: 0 }, { n: 'BU', x: 0, y: 4 }, { n: 'BK', x: 2, y: 2 }], bbox: [-2, 0, 2, 4],
  props: { tag: 'PX1' }, schema: [F_TAG, F_DESC],
  init: () => ({ det: false, pw: false }), interact: 'sensor',
  conducts: c => (c.st.det && c.st.pw) ? [['BN', 'BK']] : [],
  evaluate(c, V) { const pw = V('BN', 'BU') > 0; const ch = pw !== c.st.pw; c.st.pw = pw; return ch; },
  draw(c) {
    const on = c.st.det && c.st.pw;
    return ln(0, 0, 0, 24) + ln(0, 56, 0, 80) + ln(16, 40, 40, 40)
      + `<path d="M0,24 L16,40 L0,56 L-16,40 Z"${on ? ' style="fill:#fff59d"' : ''}/>`
      + `<circle cx="0" cy="40" r="3" class="btn" style="fill:${on ? '#ff9800' : '#bbb'}"/>`
      + (c.st.det ? `<rect x="-36" y="30" width="10" height="20" style="fill:#90a4ae"/>` : '')
      + tx(5, 8, 'BN', 0, 'st xs', 'start') + tx(5, 72, 'BU', 0, 'st xs', 'start') + tx(30, 32, 'BK', 0, 'st xs');
  },
  label: c => [c.props.tag, c.st && c.st.det ? 'TARGET' : ''],
});

/* =====================================================================
   COILS / RELAYS / TIMERS (devices referenced by tag)
   ===================================================================== */
function coilEval(c, V) {
  const v = V('A1', 'A2');
  const rated = voltNum(c.props.volt || '230V AC');
  const dcCoil = rated === 24;
  const okDomain = v > 0 && ((v === 24) === dcCoil);
  const en = okDomain && v >= rated * 0.8;
  c.st.over = okDomain && v > rated * 1.2;
  c.st.v = v;
  const ch = en !== c.st.en; c.st.en = en; return ch;
}
function coilDef(type, name, prefix, tag) {
  def(type, {
    name, cat: 'Coils, Relays & Timers', prefix, device: true,
    terms: TT('A1', 'A2'), bbox: [-1, 0, 1, 4],
    props: { tag, volt: '230V AC' }, schema: [F_TAG, F_VOLT, F_DESC],
    init: () => ({ en: false }),
    isActive: c => c.st.en,
    evaluate: coilEval,
    draw: c => ln(0, 0, 0, 30) + ln(0, 50, 0, 80)
      + `<rect x="-16" y="30" width="32" height="20"${c.st.en ? ' class="on"' : ''}/>`
      + tx(-20, 10, 'A1', 0, 'st xs', 'end') + tx(-20, 70, 'A2', 0, 'st xs', 'end'),
    label: c => [c.props.tag, c.props.desc || ''],
  });
}
coilDef('coil', 'Contactor Coil', 'K', 'K1');
coilDef('relay', 'Auxiliary Relay Coil', 'KA', 'KA1');

function timerDef(type, name, kind) {
  def(type, {
    name, cat: 'Coils, Relays & Timers', prefix: 'KT', device: true,
    terms: TT('A1', 'A2'), bbox: [-1, 0, 1, 4],
    props: { tag: 'KT1', preset: 5, volt: '230V AC' }, schema: [F_TAG, { k: 'preset', label: 'Time delay (seconds)', type: 'number' }, F_VOLT, F_DESC],
    init: () => ({ en: false, done: false, acc: 0 }),
    isActive: c => c.st.done,
    evaluate(c, V) {
      coilEval(c, V);
      const st = c.st, prev = st.done;
      if (kind === 'on' && !st.en) { st.done = false; st.acc = 0; }
      if (kind === 'off' && st.en) { st.done = true; st.acc = 0; }
      return prev !== st.done;
    },
    tick(c, dt) {
      const st = c.st, pre = (+c.props.preset || 0) * 1000;
      if (kind === 'on' && st.en && !st.done) { st.acc += dt; if (st.acc >= pre) { st.acc = pre; st.done = true; } }
      if (kind === 'off' && !st.en && st.done) { st.acc += dt; if (st.acc >= pre) { st.acc = pre; st.done = false; } }
    },
    draw: c => ln(0, 0, 0, 30) + ln(0, 50, 0, 80)
      + `<rect x="-16" y="30" width="32" height="20"${c.st.en ? ' class="on"' : ''}/>`
      + `<rect x="-16" y="30" width="12" height="20"${c.st.done ? ' style="fill:#ffb74d"' : ''}/>`
      + (kind === 'on' ? ln(-16, 30, -4, 50) + ln(-4, 30, -16, 50) : `<rect x="-14" y="35" width="8" height="10" style="fill:#333"/>`)
      + tx(-20, 10, 'A1', 0, 'st xs', 'end') + tx(-20, 70, 'A2', 0, 'st xs', 'end'),
    label: c => [c.props.tag, `${c.st ? (c.st.acc / 1000).toFixed(1) : '0.0'}/${c.props.preset}s`],
  });
}
timerDef('timer_on', 'Timer ON-Delay (TON)', 'on');
timerDef('timer_off', 'Timer OFF-Delay (TOF)', 'off');

/* =====================================================================
   CONTACTS (follow a device by tag)
   ===================================================================== */
def('contact_no', {
  name: 'NO Contact (of K / KA / KT / F)', cat: 'Contacts', prefix: null,
  terms: TT('13', '14'), bbox: [-1, 0, 1, 4],
  props: { tag: 'K1' }, schema: [F_TAGREF],
  conducts: (c, S) => S.active(c.props.tag) ? [['13', '14']] : [],
  draw: (c, S) => { const cl = S.run && S.active(c.props.tag); return contactSym('NO', cl, cl); },
});
def('contact_nc', {
  name: 'NC Contact (of K / KA / KT / F)', cat: 'Contacts', prefix: null,
  terms: TT('21', '22'), bbox: [-1, 0, 1, 4],
  props: { tag: 'K1' }, schema: [F_TAGREF],
  conducts: (c, S) => S.active(c.props.tag) ? [] : [['21', '22']],
  draw: (c, S) => { const cl = !(S.run && S.active(c.props.tag)); return contactSym('NC', cl, S.run && cl); },
});
def('contactor3', {
  name: 'Contactor Main Contacts 3P', cat: 'Contacts', prefix: null,
  terms: [{ n: '1', x: 0, y: 0 }, { n: '2', x: 0, y: 4 }, { n: '3', x: 2, y: 0 }, { n: '4', x: 2, y: 4 }, { n: '5', x: 4, y: 0 }, { n: '6', x: 4, y: 4 }],
  bbox: [-1, 0, 5, 4],
  props: { tag: 'K1' }, schema: [F_TAGREF],
  conducts: (c, S) => S.active(c.props.tag) ? [['1', '2'], ['3', '4'], ['5', '6']] : [],
  draw(c, S) {
    const cl = S.run && S.active(c.props.tag); let s = '';
    for (let i = 0; i < 3; i++) s += `<g transform="translate(${40 * i},0)">${contactSym('NO', cl, cl)}<path d="M-5,26 A5,5 0 0 1 5,26" /></g>`;
    const m = cl ? 0 : -7;
    return s + ln(m, 40, 80 + m, 40, 'dash');
  },
});

/* =====================================================================
   LOADS & MOTORS
   ===================================================================== */
def('lamp', {
  name: 'Indicator Lamp', cat: 'Loads & Motors', prefix: 'H',
  terms: TT('X1', 'X2'), bbox: [-1, 0, 1, 4],
  props: { tag: 'H1', color: 'green', desc: '' }, schema: [F_TAG, F_COLOR(Object.keys(LAMP_COL)), F_DESC],
  init: () => ({ en: false }),
  evaluate(c, V) { c.st.en = V('X1', 'X2') > 0; return false; },
  draw(c) {
    const col = LAMP_COL[c.props.color] || '#fff';
    return ln(0, 0, 0, 26) + ln(0, 54, 0, 80)
      + (c.st.en ? `<circle cx="0" cy="40" r="22" style="fill:${col};stroke:none;opacity:.35"/>` : '')
      + `<circle cx="0" cy="40" r="14" style="fill:${c.st.en ? col : '#fff'}"/>`
      + ln(-10, 30, 10, 50) + ln(10, 30, -10, 50);
  },
  label: c => [c.props.tag, c.props.desc || c.props.color.toUpperCase()],
});
def('buzzer', {
  name: 'Buzzer / Hooter', cat: 'Loads & Motors', prefix: 'HA',
  terms: TT('1', '2'), bbox: [-1, 0, 1, 4],
  props: { tag: 'HA1' }, schema: [F_TAG, F_DESC],
  init: () => ({ en: false }),
  evaluate(c, V) { c.st.en = V('1', '2') > 0; return false; },
  draw: c => ln(0, 0, 0, 30) + ln(0, 50, 0, 80) + ln(-14, 30, 14, 30) + ln(-14, 50, 14, 50)
    + `<path d="M-14,30 A16,10 0 0 0 -14,50 M14,30 A16,10 0 0 1 14,50"${c.st.en ? ' class="hotf"' : ''}/>`
    + (c.st.en ? `<path class="wave" d="M20,32 Q26,40 20,48 M25,28 Q33,40 25,52"/>` : ''),
  label: c => [c.props.tag, c.props.desc || ''],
});
def('solenoid', {
  name: 'Solenoid Valve', cat: 'Loads & Motors', prefix: 'Y',
  terms: TT('1', '2'), bbox: [-1, 0, 2, 4],
  props: { tag: 'YV1' }, schema: [F_TAG, F_DESC],
  init: () => ({ en: false }),
  evaluate(c, V) { c.st.en = V('1', '2') > 0; return false; },
  draw: c => ln(0, 0, 0, 30) + ln(0, 50, 0, 80) + `<rect x="-14" y="30" width="28" height="20"${c.st.en ? ' class="on"' : ''}/>` + ln(-14, 50, 14, 30)
    + `<path d="M22,32 L38,48 M22,48 L38,32 M22,32 L22,48 M38,32 L38,48"${c.st.en ? ' style="stroke:#1e6fe0"' : ''}/>` + ln(14, 40, 22, 40),
  label: c => [c.props.tag, c.st && c.st.en ? 'OPEN' : 'CLOSED'],
});

function motorRotor(c) {
  if (!c.st.run) return '';
  const a = c.st.ang || 0;
  return `<g transform="rotate(${a} 40 ${c.type === 'motor6' ? 60 : 70})"><path class="rotor" d="M40,${c.type === 'motor6' ? 22 : 32} l-5,-6 l10,0 z"/></g>`;
}
def('motor3', {
  name: '3Φ Induction Motor', cat: 'Loads & Motors', prefix: 'M',
  terms: [{ n: 'U', x: 0, y: 0 }, { n: 'V', x: 2, y: 0 }, { n: 'W', x: 4, y: 0 }], bbox: [-1, 0, 5, 5],
  props: { tag: 'M1', kw: '5.5 kW' }, schema: [F_TAG, { k: 'kw', label: 'Power', type: 'text' }],
  init: () => ({ run: false, dir: 0, ang: 0, ovl: false, ovlT: 0, msg: '' }), interact: 'motor',
  post(c, ctx) {
    const ph = ['U', 'V', 'W'].map(t => ctx.lab(c, t));
    const st = c.st;
    const phases = ph.filter(p => p && 'RYB'.includes(p));
    const uniq = new Set(phases);
    st.run = false; st.msg = ''; st.mode = '';
    if (phases.length === 3 && uniq.size === 3) {
      st.run = true; st.dir = phaseDir(ph); st.msg = st.dir > 0 ? 'RUN FWD' : 'RUN REV';
    } else if (uniq.size === 2) {
      st.msg = 'SINGLE PHASING!'; ctx.warn(`${c.props.tag}: Single phasing – motor hums & overheats (only 2 phases)`);
    } else if (uniq.size === 1 && phases.length > 1) {
      st.msg = 'NO ROTATION';
    }
  },
  draw(c) {
    const run = c.st.run;
    return ln(0, 0, 0, 70) + ln(0, 70, 10, 70) + ln(40, 0, 40, 40) + ln(80, 0, 80, 70) + ln(80, 70, 70, 70)
      + `<circle cx="40" cy="70" r="30"${run ? ' class="on"' : (c.st.msg.startsWith('SINGLE') ? ' style="fill:#ffcdd2"' : '')}/>`
      + tx(40, 64, 'M', 0, 'st big') + tx(40, 82, '3~', 0, 'st sm')
      + tx(-4, 8, 'U', 0, 'st xs', 'end') + tx(36, 8, 'V', 0, 'st xs', 'end') + tx(76, 8, 'W', 0, 'st xs', 'end')
      + motorRotor(c) + (c.st.ovl ? tx(40, 108, 'OVERLOAD', 0, 'st xs red') : '');
  },
  label: c => [c.props.tag, c.props.kw, c.st ? c.st.msg : ''],
});
def('motor6', {
  name: '3Φ Motor 6-terminal (Star-Delta)', cat: 'Loads & Motors', prefix: 'M',
  terms: [{ n: 'U1', x: 0, y: 0 }, { n: 'V1', x: 2, y: 0 }, { n: 'W1', x: 4, y: 0 }, { n: 'U2', x: 0, y: 6 }, { n: 'V2', x: 2, y: 6 }, { n: 'W2', x: 4, y: 6 }],
  bbox: [-1, 0, 5, 6],
  props: { tag: 'M1', kw: '15 kW' }, schema: [F_TAG, { k: 'kw', label: 'Power', type: 'text' }],
  init: () => ({ run: false, dir: 0, ang: 0, ovl: false, ovlT: 0, msg: '', mode: '' }), interact: 'motor',
  post(c, ctx) {
    const st = c.st; st.run = false; st.msg = ''; st.mode = '';
    const L1 = ['U1', 'V1', 'W1'].map(t => ctx.lab(c, t));
    const L2 = ['U2', 'V2', 'W2'].map(t => ctx.lab(c, t));
    const isPh = p => p && 'RYB'.includes(p);
    const all = [...L1, ...L2].filter(isPh);
    const top3 = L1.every(isPh) && new Set(L1).size === 3;
    if (top3) {
      const r = ['U2', 'V2', 'W2'].map(t => ctx.root(c, t));
      if (r[0] === r[1] && r[1] === r[2] && !isPh(L2[0])) {
        st.run = true; st.mode = 'STAR'; st.dir = phaseDir(L1); st.msg = 'STAR ' + (st.dir > 0 ? 'FWD' : 'REV');
        return;
      }
      if (L2.every(isPh) && L2.every((p, i) => p !== L1[i])) {
        st.run = true; st.mode = 'DELTA'; st.dir = phaseDir(L1); st.msg = 'DELTA ' + (st.dir > 0 ? 'FWD' : 'REV');
        return;
      }
      st.msg = 'WINDINGS OPEN';
      return;
    }
    const uniq = new Set(all);
    if (uniq.size === 2) { st.msg = 'SINGLE PHASING!'; ctx.warn(`${c.props.tag}: Single phasing – check supply/contacts`); }
  },
  draw(c) {
    const run = c.st.run;
    return ln(0, 0, 0, 56) + ln(0, 56, 13, 56) + ln(40, 0, 40, 30) + ln(80, 0, 80, 56) + ln(80, 56, 67, 56)
      + ln(0, 120, 0, 66) + ln(0, 66, 13, 66) + ln(40, 120, 40, 90) + ln(80, 120, 80, 66) + ln(80, 66, 67, 66)
      + `<circle cx="40" cy="60" r="30"${run ? ' class="on"' : ''}/>`
      + tx(40, 54, 'M', 0, 'st big') + tx(40, 72, '3~', 0, 'st sm')
      + tx(-4, 8, 'U1', 0, 'st xs', 'end') + tx(36, 8, 'V1', 0, 'st xs', 'end') + tx(76, 8, 'W1', 0, 'st xs', 'end')
      + tx(-4, 112, 'U2', 0, 'st xs', 'end') + tx(36, 112, 'V2', 0, 'st xs', 'end') + tx(76, 112, 'W2', 0, 'st xs', 'end')
      + motorRotor(c) + (c.st.ovl ? tx(40, 100, 'OVERLOAD', 0, 'st xs red') : '');
  },
  label: c => [c.props.tag, c.props.kw, c.st ? c.st.msg : ''],
});
def('motor1', {
  name: '1Φ Motor / Fan / Pump', cat: 'Loads & Motors', prefix: 'M',
  terms: TT('L', 'N'), bbox: [-1, 0, 1, 4],
  props: { tag: 'M1' }, schema: [F_TAG, F_DESC],
  init: () => ({ run: false, ang: 0, ovl: false, ovlT: 0, msg: '' }), interact: 'motor',
  evaluate(c, V) { const v = V('L', 'N'); c.st.run = v >= 200 && v < 300; c.st.msg = c.st.run ? 'RUNNING' : (v > 300 ? 'OVERVOLTAGE!' : ''); return false; },
  draw: c => ln(0, 0, 0, 22) + ln(0, 58, 0, 80) + `<circle cx="0" cy="40" r="18"${c.st.run ? ' class="on"' : ''}/>`
    + tx(0, 35, 'M', 0, 'st b') + tx(0, 48, '1~', 0, 'st xs')
    + (c.st.run ? `<g transform="rotate(${c.st.ang || 0} 0 40)"><path class="rotor" d="M0,16 l-4,-5 l8,0 z"/></g>` : ''),
  label: c => [c.props.tag, c.props.desc || '', c.st ? c.st.msg : ''],
});

function phaseDir(ph) {
  const o = 'RYB', i = ph.map(p => o.indexOf(p));
  return ((i[1] - i[0] + 3) % 3 === 1) ? 1 : -1;
}

/* =====================================================================
   PLC  (8 DI, 6 relay DO)
   ===================================================================== */
const PLC_IN = 8, PLC_OUT = 6;
const plcTop = ['L+', 'M', '1M'].concat([...Array(PLC_IN)].map((_, i) => 'I0.' + i));
const plcBot = ['1L'].concat([...Array(PLC_OUT)].map((_, i) => 'Q0.' + i));
def('plc', {
  name: 'PLC  8 DI / 6 Relay DO', cat: 'PLC', prefix: 'PLC', noRotate: true,
  terms: plcTop.map((n, i) => ({ n, x: 1 + 2 * i, y: 0 })).concat(plcBot.map((n, i) => ({ n, x: 1 + 2 * i, y: 8 }))),
  bbox: [0, 0, 24, 8],
  props: { tag: 'PLC1' }, schema: [F_TAG],
  init: () => ({ pw: false, run: true, mem: newPlcMem() }), interact: 'plc',
  conducts(c) {
    if (!c.st.pw || !c.st.run) return [];
    const r = []; for (let i = 0; i < PLC_OUT; i++) if (c.st.mem.Q[i]) r.push(['1L', 'Q0.' + i]); return r;
  },
  evaluate(c, V, ctx) {
    const st = c.st, m = st.mem;
    const pw = V('L+', 'M') > 0;
    let ch = pw !== st.pw; st.pw = pw;
    for (let i = 0; i < PLC_IN; i++) m.I[i] = pw && V('I0.' + i, '1M') > 0;
    const before = m.Q.slice(0, PLC_OUT).join();
    if (pw && st.run) {
      plcScan(project.program, m, ctx.takeDt(c.id), ctx.record);
    } else {
      for (let i = 0; i < m.Q.length; i++) m.Q[i] = false;
    }
    if (m.Q.slice(0, PLC_OUT).join() !== before) ch = true;
    return ch;
  },
  draw(c) {
    const st = c.st, m = st.mem || newPlcMem();
    let s = `<rect class="box plc" x="0" y="10" width="480" height="140" rx="6"/>`;
    plcTop.forEach((n, i) => {
      const x = 20 + 40 * i;
      s += ln(x, 0, x, 10) + tx(x, 22, n, 0, 'st xs w');
      if (i >= 3) s += `<rect x="${x - 6}" y="32" width="12" height="8" class="btn" style="fill:${m.I[i - 3] ? '#00e676' : '#37474f'}"/>`;
    });
    plcBot.forEach((n, i) => {
      const x = 20 + 40 * i;
      s += ln(x, 150, x, 160) + tx(x, 138, n, 0, 'st xs w');
      if (i >= 1) s += `<rect x="${x - 6}" y="120" width="12" height="8" class="btn" style="fill:${m.Q[i - 1] ? '#ff9100' : '#37474f'}"/>`;
    });
    s += tx(380, 70, 'PLC', 0, 'st plcT');
    s += `<circle cx="300" cy="100" r="5" class="btn" style="fill:${st.pw ? '#00e676' : '#37474f'}"/>` + tx(312, 100, 'PWR', 0, 'st xs w', 'start');
    s += `<circle cx="360" cy="100" r="5" class="btn" style="fill:${st.pw && st.run ? '#00e676' : st.pw ? '#ffeb3b' : '#37474f'}"/>` + tx(372, 100, st.run ? 'RUN' : 'STOP', 0, 'st xs w', 'start');
    s += tx(420, 124, '(click: RUN/STOP)', 0, 'st xs w');
    return s;
  },
  label: () => [],
});

/* =====================================================================
   MISC
   ===================================================================== */
def('tb', {
  name: 'Terminal Block', cat: 'Misc', prefix: 'X',
  terms: TT('a', 'b'), bbox: [-1, 0, 1, 4],
  props: { tag: 'X1:1' }, schema: [F_TAG],
  conducts: () => [['a', 'b']],
  draw: () => ln(0, 0, 0, 32) + ln(0, 48, 0, 80) + `<circle cx="0" cy="40" r="8"/>` + ln(-6, 46, 6, 34),
});
def('text', {
  name: 'Text Label', cat: 'Misc', prefix: null, noRotate: true,
  terms: [], bbox: [0, -1, 8, 1],
  props: { text: 'Title text', size: 16 }, schema: [{ k: 'text', label: 'Text', type: 'text' }, { k: 'size', label: 'Font size', type: 'number' }],
  draw: c => `<text class="lbl" x="0" y="0" dominant-baseline="middle" style="font-size:${+c.props.size || 16}px">${esc(c.props.text)}</text>`,
  label: () => [],
});
