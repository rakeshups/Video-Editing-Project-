'use strict';
/* =====================================================================
   READY-MADE EXAMPLE CIRCUITS
   ===================================================================== */
const EXAMPLES = {};
(function () {
  let id = 1;
  const C = (type, x, y, props = {}, rot = 0) => ({ id: 'c' + id++, type, x, y, rot, props });
  const W = (...pts) => ({ id: 'w' + id++, pts });
  const T = (text, x, y, size = 16) => C('text', x, y, { text, size });
  const finish = (name, comps, wires, program) => ({ version: 1, name, comps, wires, program: program || defaultProgram(), nextId: id + 1 });

  /* ---------------- 1. DOL STARTER ---------------- */
  id = 1;
  EXAMPLES.dol = finish('DOL Starter (Power + Control)', [
    T('DOL STARTER – Power circuit', 2, 0, 16), T('Control circuit (230V AC)', 14, 2, 14),
    C('supply3', 2, 2),
    C('mcb3', 3, 7, { tag: 'Q1', rating: '32A' }),
    C('contactor3', 3, 13, { tag: 'K1' }),
    C('olr3', 3, 19, { tag: 'F1', setting: '11A' }),
    C('motor3', 3, 26, { tag: 'M1', kw: '5.5 kW' }),
    C('mcb1', 16, 6, { tag: 'Q2', rating: '6A' }),
    C('contact_nc', 16, 11, { tag: 'F1' }),
    C('pb_nc', 16, 16, { tag: 'S1', color: 'red' }),
    C('pb_no', 16, 21, { tag: 'S2', color: 'green' }),
    C('contact_no', 20, 21, { tag: 'K1' }),
    C('coil', 16, 27, { tag: 'K1', volt: '230V AC', desc: 'Main contactor' }),
    C('contact_no', 24, 21, { tag: 'K1' }),
    C('lamp', 24, 27, { tag: 'H1', color: 'green', desc: 'RUN' }),
    C('contact_no', 28, 21, { tag: 'F1' }),
    C('lamp', 28, 27, { tag: 'H2', color: 'red', desc: 'TRIP' }),
  ], [
    W([3, 4], [3, 7]), W([5, 4], [5, 7]), W([7, 4], [7, 7]),
    W([3, 11], [3, 13]), W([5, 11], [5, 13]), W([7, 11], [7, 13]),
    W([3, 17], [3, 19]), W([5, 17], [5, 19]), W([7, 17], [7, 19]),
    W([3, 23], [3, 26]), W([5, 23], [5, 26]), W([7, 23], [7, 26]),
    W([3, 5], [16, 5], [16, 6]),
    W([16, 10], [16, 11]), W([16, 15], [16, 16]), W([16, 20], [16, 21]),
    W([16, 21], [20, 21]), W([16, 25], [20, 25]), W([16, 25], [16, 27]),
    W([9, 4], [9, 6], [12, 6], [12, 33], [16, 33]), W([16, 31], [16, 33]),
    W([20, 21], [24, 21]), W([24, 25], [24, 27]), W([24, 31], [24, 33], [16, 33]),
    W([16, 10], [28, 10], [28, 21]), W([28, 25], [28, 27]), W([28, 31], [28, 33], [24, 33]),
  ]);

  /* ---------------- 2. FORWARD / REVERSE ---------------- */
  id = 1;
  EXAMPLES.fwdrev = finish('Forward / Reverse Starter with Interlock', [
    T('FORWARD / REVERSE STARTER', 2, 0, 16), T('K1 = Forward   K2 = Reverse (R & B swapped)', 22, 2, 13),
    C('supply3', 2, 2),
    C('mcb3', 3, 7, { tag: 'Q1', rating: '32A' }),
    C('contactor3', 3, 15, { tag: 'K1' }),
    C('contactor3', 11, 15, { tag: 'K2' }),
    C('olr3', 3, 23, { tag: 'F1', setting: '8A' }),
    C('motor3', 3, 30, { tag: 'M1', kw: '3.7 kW' }),
    C('mcb1', 22, 6, { tag: 'Q2', rating: '6A' }),
    C('contact_nc', 22, 11, { tag: 'F1' }),
    C('pb_nc', 22, 16, { tag: 'S1', color: 'red', desc: 'STOP' }),
    C('pb_no', 22, 21, { tag: 'S2', color: 'green', desc: 'FWD' }),
    C('contact_no', 26, 21, { tag: 'K1' }),
    C('contact_nc', 22, 27, { tag: 'K2' }),
    C('coil', 22, 33, { tag: 'K1', desc: 'Forward' }),
    C('pb_no', 32, 21, { tag: 'S3', color: 'blue', desc: 'REV' }),
    C('contact_no', 36, 21, { tag: 'K2' }),
    C('contact_nc', 32, 27, { tag: 'K1' }),
    C('coil', 32, 33, { tag: 'K2', desc: 'Reverse' }),
  ], [
    W([3, 4], [3, 7]), W([5, 4], [5, 7]), W([7, 4], [7, 7]),
    W([3, 11], [3, 15]), W([5, 11], [5, 15]), W([7, 11], [7, 15]),
    W([3, 12], [11, 12], [11, 15]), W([5, 13], [13, 13], [13, 15]), W([7, 14], [15, 14], [15, 15]),
    W([3, 19], [3, 23]), W([5, 19], [5, 23]), W([7, 19], [7, 23]),
    W([11, 19], [11, 21], [7, 21]), W([13, 19], [13, 20], [5, 20]), W([15, 19], [15, 22], [3, 22]),
    W([3, 27], [3, 30]), W([5, 27], [5, 30]), W([7, 27], [7, 30]),
    W([3, 5], [22, 5], [22, 6]),
    W([9, 4], [9, 6], [19, 6], [19, 40], [38, 40]),
    W([22, 10], [22, 11]), W([22, 15], [22, 16]), W([22, 20], [22, 21]),
    W([22, 21], [26, 21]), W([22, 25], [26, 25]), W([22, 25], [22, 27]), W([22, 31], [22, 33]), W([22, 37], [22, 40]),
    W([26, 21], [32, 21]), W([32, 21], [36, 21]), W([32, 25], [36, 25]), W([32, 25], [32, 27]), W([32, 31], [32, 33]), W([32, 37], [32, 40]),
  ]);

  /* ---------------- 3. STAR-DELTA ---------------- */
  id = 1;
  EXAMPLES.stardelta = finish('Automatic Star-Delta Starter', [
    T('AUTOMATIC STAR–DELTA STARTER', 2, 0, 16), T('K1 = Main   K3 = Star   K2 = Delta   KT1 = Star→Delta timer', 32, 2, 13),
    C('supply3', 2, 2),
    C('mcb3', 3, 7, { tag: 'Q1', rating: '63A' }),
    C('contactor3', 3, 13, { tag: 'K1' }),
    C('olr3', 3, 19, { tag: 'F1', setting: '17A' }),
    C('motor6', 3, 28, { tag: 'M1', kw: '15 kW' }),
    C('contactor3', 13, 29, { tag: 'K2' }),
    C('contactor3', 21, 39, { tag: 'K3' }),
    C('mcb1', 32, 6, { tag: 'Q2', rating: '6A' }),
    C('contact_nc', 32, 11, { tag: 'F1' }),
    C('pb_nc', 32, 16, { tag: 'S1', color: 'red', desc: 'STOP' }),
    C('pb_no', 32, 21, { tag: 'S2', color: 'green', desc: 'START' }),
    C('contact_no', 36, 21, { tag: 'K1' }),
    C('coil', 32, 38, { tag: 'K1', desc: 'Main' }),
    C('contact_nc', 40, 27, { tag: 'KT1' }),
    C('contact_nc', 40, 32, { tag: 'K2' }),
    C('coil', 40, 38, { tag: 'K3', desc: 'Star' }),
    C('contact_nc', 44, 32, { tag: 'K2' }),
    C('timer_on', 44, 38, { tag: 'KT1', preset: 5 }),
    C('contact_no', 48, 27, { tag: 'KT1' }),
    C('contact_no', 52, 27, { tag: 'K2' }),
    C('contact_nc', 48, 32, { tag: 'K3' }),
    C('coil', 48, 38, { tag: 'K2', desc: 'Delta' }),
  ], [
    W([3, 4], [3, 7]), W([5, 4], [5, 7]), W([7, 4], [7, 7]),
    W([3, 11], [3, 13]), W([5, 11], [5, 13]), W([7, 11], [7, 13]),
    W([3, 17], [3, 19]), W([5, 17], [5, 19]), W([7, 17], [7, 19]),
    W([3, 23], [3, 28]), W([5, 23], [5, 28]), W([7, 23], [7, 28]),
    W([3, 24], [13, 24], [13, 29]), W([5, 25], [15, 25], [15, 29]), W([7, 26], [17, 26], [17, 29]),
    W([13, 33], [13, 36], [7, 36], [7, 34]), W([15, 33], [15, 37], [3, 37], [3, 34]), W([17, 33], [17, 38], [5, 38], [5, 34]),
    W([15, 37], [21, 37], [21, 39]), W([17, 38], [23, 38], [23, 39]), W([13, 36], [25, 36], [25, 39]),
    W([21, 43], [23, 43]), W([23, 43], [25, 43]),
    W([3, 5], [32, 5], [32, 6]),
    W([9, 4], [9, 6], [30, 6], [30, 44], [50, 44]),
    W([32, 10], [32, 11]), W([32, 15], [32, 16]), W([32, 20], [32, 21]),
    W([32, 21], [36, 21]), W([32, 25], [36, 25]), W([32, 25], [32, 38]),
    W([36, 25], [40, 25]), W([40, 25], [48, 25]),
    W([40, 25], [40, 27]), W([40, 31], [40, 32]), W([40, 36], [40, 38]),
    W([44, 25], [44, 32]), W([44, 36], [44, 38]),
    W([48, 25], [48, 27]), W([48, 27], [52, 27]), W([48, 31], [52, 31]), W([48, 31], [48, 32]), W([48, 36], [48, 38]),
    W([32, 42], [32, 44]), W([40, 42], [40, 44]), W([44, 42], [44, 44]), W([48, 42], [48, 44]),
  ]);

  /* ---------------- 4. PLC START / STOP ---------------- */
  id = 1;
  const r0 = newRung(2);
  r0.comment = 'Start/Stop with self-holding (seal-in)';
  r0.cells[0][0] = { t: 'NO', a: 'I0.0' };
  r0.cells[0][1] = { t: 'NO', a: 'I0.1' };
  for (let c = 2; c < LC; c++) r0.cells[0][c] = { t: 'WIRE' };
  r0.cells[0][LC] = { t: 'OTE', a: 'Q0.0' };
  r0.cells[1][0] = { t: 'NO', a: 'Q0.0' };
  r0.v[0][0] = true; r0.v[0][1] = true;
  const r1 = newRung(1);
  r1.comment = 'Run lamp follows motor output';
  r1.cells[0][0] = { t: 'NO', a: 'Q0.0' };
  for (let c = 1; c < LC; c++) r1.cells[0][c] = { t: 'WIRE' };
  r1.cells[0][LC] = { t: 'OTE', a: 'Q0.1' };
  const r2 = newRung(1);
  r2.comment = 'After 5 s running, switch on Q0.2 (delayed lamp)';
  r2.cells[0][0] = { t: 'NO', a: 'Q0.0' };
  for (let c = 1; c < LC; c++) r2.cells[0][c] = { t: 'WIRE' };
  r2.cells[0][LC] = { t: 'TON', a: 'T0', p: 5 };
  const r3 = newRung(1);
  r3.cells[0][0] = { t: 'NO', a: 'T0' };
  for (let c = 1; c < LC; c++) r3.cells[0][c] = { t: 'WIRE' };
  r3.cells[0][LC] = { t: 'OTE', a: 'Q0.2' };
  EXAMPLES.plc = finish('PLC Start / Stop with Timer', [
    T('PLC START / STOP  (open the Ladder panel ↓)', 2, 0, 16),
    C('supplydc', 2, 2), C('supply1', 30, 2),
    C('pb_no', 19, 7, { tag: 'S1', color: 'green', desc: 'START' }),
    C('pb_nc', 25, 7, { tag: 'S2', color: 'red', desc: 'STOP' }),
    C('plc', 4, 14, { tag: 'PLC1' }),
    C('coil', 7, 26, { tag: 'K1', desc: 'Motor contactor' }),
    C('lamp', 11, 26, { tag: 'H1', color: 'green', desc: 'RUN' }),
    C('lamp', 15, 26, { tag: 'H2', color: 'yellow', desc: 'DELAYED' }),
  ], [
    W([5, 4], [5, 5], [28, 5]), W([3, 4], [3, 6], [28, 6]),
    W([5, 6], [5, 14]), W([7, 5], [7, 14]), W([9, 5], [9, 14]),
    W([19, 6], [19, 7]), W([19, 11], [19, 13], [11, 13], [11, 14]),
    W([25, 6], [25, 7]), W([25, 11], [25, 12], [13, 12], [13, 14]),
    W([31, 4], [31, 24], [5, 24], [5, 22]),
    W([7, 22], [7, 26]), W([9, 22], [9, 25], [11, 25], [11, 26]), W([11, 22], [11, 23], [15, 23], [15, 26]),
    W([33, 4], [33, 32], [7, 32]), W([7, 30], [7, 32]), W([11, 30], [11, 32]), W([15, 30], [15, 32]),
  ], {
    rungs: [r0, r1, r2, r3],
    symbols: { 'I0.0': 'START', 'I0.1': 'STOP', 'Q0.0': 'MOTOR', 'Q0.1': 'RUN_LAMP', 'Q0.2': 'DLY_LAMP', 'T0': 'DELAY' },
  });
})();
