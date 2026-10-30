// Tests for the PLAN-CORE block of index.html (pure planner helpers, no DOM). Run: node tests/plan.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const a = html.indexOf('// PLAN-CORE start'), b = html.indexOf('// PLAN-CORE end');
if (a < 0 || b < a) throw new Error('PLAN-CORE start/end markers not found in index.html');
const core = vm.runInNewContext(html.slice(a, b) + '\n;({ migrateV3, planTarget, ballastText, opFromFinal, XL_MAP, keepOps, autoDisch, sensorMap, sensorParse, SENSOR_TAG })');
const { migrateV3, planTarget, ballastText, opFromFinal, XL_MAP, keepOps, autoDisch, sensorMap, sensorParse, SENSOR_TAG } = core;

let n = 0;
const test = (name, fn) => { fn(); n++; };

test('migrateV3 v2', () => {
  const st = migrateV3({ v: 2, plan: { port: 'X', seq: [1] } });
  assert.equal(st.v, 3);
  assert.equal(st.ops.length, 1);
  assert.equal(st.ops[0].type, 'load');
  assert.equal(st.ops[0].cy, 1);
  assert.equal(st.ops[0].port, 'X');
  assert.equal(st.opCur, 0);
  assert.ok(!('plan' in st));
});
test('migrateV3 idempotent', () => {
  const st = migrateV3(migrateV3({ v: 2, plan: { port: 'X' } }));
  assert.equal(st.ops.length, 1);
});
test('migrateV3 without plan', () => {
  const st = migrateV3({ v: 2 });
  assert.equal(st.ops[0].type, 'load');
});
test('planTarget', () => {
  assert.equal(planTarget('load', 200, 6000), 6200);
  assert.equal(planTarget('disch', 7000, 1000), 6000);
  assert.equal(planTarget('disch', 7000, ''), 0);
});
test('planTarget clamps', () => {
  assert.equal(planTarget('disch', 500, 1000), 0);
});
test('ballastText', () => {
  assert.equal(ballastText('load', [{ name: '1W', first: 300, last: 20, minPct: 5, lastPct: 2 }]), 'DEBALLASTING WBT 1W (5%)');
  assert.equal(ballastText('load', []), 'NO DEBALLASTING');
  assert.equal(ballastText('disch', [{ name: '5W', first: 120, last: 900, minPct: 10, lastPct: 61.4 }]), 'BALLASTING WBT 5W (61%)');
  assert.equal(ballastText('disch', [{ name: '5W', first: 120, last: 120.03, minPct: 10, lastPct: 9 }]), 'NIL');
});
test('opFromFinal', () => {
  const base = { rob: { t: {}, tk: {}, mode: 'vol' }, parcels: [{ mt: '500' }], seq: [] };
  const op = opFromFinal(base, { cy: 2, grade: 'VLSFO', port: 'SG' },
    { snd: { COTK3P: 8301, COTK1P: 0 }, bal: { WBTK5P: 120 }, rho: 0.9503, temp: 42 }, 'opX');
  assert.equal(op.type, 'disch');
  assert.equal(op.cy, 2);
  assert.equal(op.id, 'opX');
  assert.equal(op.rob.mode, 'snd');
  assert.equal(op.rob.t.COTK3P.val, 8301);
  assert.ok(!('COTK1P' in op.rob.t));
  assert.equal(op.rob.tk.WBTK5P, 120);
  assert.equal(op.parcels[0].rho, 0.9503);
  assert.equal(op.parcels[0].mt, '');
  assert.equal(op.grade, 'VLSFO');
  assert.equal(base.rob.mode, 'vol');
});
test('XL_MAP', () => {
  assert.equal(XL_MAP.disch.sheet, 'PLAN');
  assert.equal(XL_MAP.disch.w2[0], 'E105');
  assert.equal(XL_MAP.disch.pages[3], 202);
  assert.equal(XL_MAP.load.navtex, 'B112');
});

test('keepOps keeps the current cycle when a condition is opened', () => {
  const cur = { ops: [{ type: 'load', cy: 1 }, { type: 'disch', cy: 1 }], opCur: 1 };
  const st = keepOps({ v: 2, name: 'old', plan: { port: 'OLD' } }, cur);
  assert.equal(st.v, 3);
  assert.equal(st.name, 'old');
  assert.equal(st.ops.length, 2);
  assert.equal(st.ops[1].type, 'disch');
  assert.equal(st.opCur, 1);
  assert.ok(!('plan' in st));
});

// autoDisch fixture: tanks are 10 m tall boxes (vol = cap * cm / 1000); trim grows as forward cargo leaves, forward ballast pulls it down
const caps = { C1P: 600, C1S: 600, C3P: 1000, C3S: 1000, C4P: 900, C4S: 900 };
const volAt = (id, cm) => caps[id] * Math.min(1000, Math.max(0, cm)) / 1000;
const full = f => Object.fromEntries(Object.keys(caps).map(id => [id, caps[id] * f]));
const balCap = { FWP: 100, FWS: 100, W1P: 300, W1S: 300, FPT: 90 };
const arm = { C1P: 0.004, C1S: 0.004, C3P: 0.002, C3S: 0.002, C4P: 0.0005, C4S: 0.0005 }, barm = { FWP: 0.006, FWS: 0.006, W1P: 0.003, W1S: 0.003, FPT: 0.008 };
const trimOf = base => (cv, bv) => base + Object.keys(caps).reduce((a, id) => a + arm[id] * (caps[id] * 0.9 - cv[id]), 0) - Object.keys(balCap).reduce((a, id) => a + barm[id] * (bv[id] || 0), 0);
const AD = o => autoDisch({ pairs: [['C3P', 'C3S'], ['C4P', 'C4S']], tanks: full(0.9), volAt, minCm: 15, total: 1950, bal0: {}, balCap,
  balPairs: [['FWP', 'FWS'], ['W1P', 'W1S'], ['FPT']], trimOf: trimOf(0.5), ...o });
const sum = (o, ids) => ids.reduce((a, id) => a + (o[id] || 0), 0);
const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('autoDisch splits the discharge into four equal stages', () => {
  const r = AD({ trimOf: () => 0.5 });
  assert.equal(r.stages.length, 4);
  r.stages.forEach((s, k) => near(sum(full(0.9), Object.keys(caps)) - sum(s.cv, Object.keys(caps)), 1950 * (k + 1) / 4));
});
test('autoDisch empties the first pair to the minimum level before the next pair', () => {
  const r = AD({ trimOf: () => 0.5 }), f = r.stages[3].cv;
  near(f.C3P, volAt('C3P', 15)); near(f.C3S, volAt('C3S', 15));
  near(f.C4P + f.C4S, 1620 - (1950 - (1800 - 30)));
  near(r.stages[0].cv.C4P, 810);
});
test('autoDisch keeps P and S of a pair at the same sounding', () => {
  const t = full(0.9); t.C3S = 850;
  const r = AD({ trimOf: () => 0.5, tanks: t, total: 600 }), s = r.stages[1].cv;
  assert.ok(s.C3P <= 900 && s.C3S <= 850);
  near(s.C3P / 1000, s.C3S / 1000);
});
test('autoDisch with a blank nomination discharges every chosen tank to the minimum level', () => {
  const r = AD({ trimOf: () => 0.5, total: null }), f = r.stages[3].cv;
  ['C3P', 'C3S', 'C4P', 'C4S'].forEach(id => near(f[id], volAt(id, 15)));
  near(f.C1P, 540);
});
test('autoDisch warns when the nomination is more than the chosen tanks hold', () => {
  const r = AD({ trimOf: () => 0.5, total: 5000 });
  assert.ok(r.warn.includes('short'));
  ['C3P', 'C3S', 'C4P', 'C4S'].forEach(id => near(r.stages[3].cv[id], volAt(id, 15)));
});
test('autoDisch adds no ballast while trim stays within 2.0 m', () => {
  const r = AD({ trimOf: () => 1.9 });
  r.stages.forEach(s => assert.equal(sum(s.bv, Object.keys(balCap)), 0));
});
test('autoDisch fills FWD WBT P&S to 95% first when trim exceeds 2.0 m', () => {
  const r = AD({ pairs: [['C1P', 'C1S']], total: 1000, trimOf: trimOf(0.2) });
  const k = r.stages.findIndex(s => s.bv.FWP > 0);
  assert.ok(k >= 0);
  near(r.stages[k].bv.FWP, 95); near(r.stages[k].bv.FWS, 95);
  r.stages.forEach(s => assert.ok(s.trim <= 2.0 + 1e-6, 'trim ' + s.trim));
});
test('autoDisch moves on to WBT 1 when FWD WBT at 95% leaves trim above 1.5 m', () => {
  const r = AD({ pairs: [['C1P', 'C1S']], total: 1000, trimOf: trimOf(1.3) }), f = r.stages[3];
  near(f.bv.FWP, 95);
  assert.ok(f.bv.W1P > 0);
  assert.ok(f.trim <= 2.0 + 1e-6);
});
test('autoDisch fills a pair only partly when 95% would drop trim below 0.6 m', () => {
  const r = AD({ pairs: [['C1P', 'C1S']], total: 1000, trimOf: trimOf(-0.3), balCap: { ...balCap, FWP: 400, FWS: 400 } });
  const s = r.stages.find(x => x.bv.FWP > 0);
  assert.ok(s.bv.FWP < 380);
  near(s.trim, 1.0, 0.02);
});
test('autoDisch carries ballast into later stages', () => {
  const r = AD({ pairs: [['C1P', 'C1S']], total: 1000, trimOf: trimOf(0.2) });
  const k = r.stages.findIndex(s => s.bv.FWP > 0);
  for (let j = k; j < 4; j++) assert.ok(r.stages[j].bv.FWP >= r.stages[k].bv.FWP - 1e-9);
});
test('autoDisch warns when every forward ballast tank is at 95% and trim is still above 2.0 m', () => {
  const r = AD({ pairs: [['C1P', 'C1S']], total: 1000, trimOf: trimOf(8) });
  assert.ok(r.stages.some(s => s.warn.includes('trim')));
  near(r.stages[3].bv.FPT, 85.5);
});

// sensorMap: sensor tank JSON -> app tank ids (cm), cargo temperature weighted by volume
const SENS_IDS = ['COTK1P','COTK1S','SLOPTKP','RESIDTKP','FPTKC','FWDWBTKP','WBTK1P','MGOSERTK2S','TECHWTKP','POTWTKC','LNG'];
const sensJson = () => ({ ok: true, time: '2026-10-30T20:14:47',
  cargo: [{ tank: 'COTK1. (P)', ullage_mm: 9623, temp_c: 35.3, pressure_raw: -40 }, { tank: 'COTK1. (S)', ullage_mm: 2840, temp_c: 30.0 },
          { tank: 'SlopTK. (P)', ullage_mm: null, temp_c: 28 }],
  resid: [{ tank: 'RESID. T.(P)', temp_c: 38.5 }],
  other: [{ tank: 'FPTK.(C)', sounding_cm: 184 }, { tank: 'FWD WBTK.(P)', sounding_cm: 0 }, { tank: 'MGO.SER.TK2 (P)', sounding_cm: 120 },
          { tank: 'TECH. F.W.T.(P)', sounding_cm: 250 }, { tank: 'POT.W,TK.(C)', sounding_cm: 300 }, { tank: 'LNG TK.', sounding_cm: null }, { tank: 'XYZ', sounding_cm: 5 }] });
const sensOpt = { ids: SENS_IDS, ref: { COTK1P: 984.2, COTK1S: 984.0, SLOPTKP: 919.9 }, volAt: (id, cm) => cm * 2 };

test('sensorMap cargo ullage mm becomes sounding cm from the reference height', () => {
  const r = sensorMap(sensJson(), sensOpt);
  near(r.cargo.COTK1P, 21.9); near(r.cargo.COTK1S, 700);
  assert.ok(!('SLOPTKP' in r.cargo));
  assert.equal(r.time, '2026-10-30T20:14:47');
});
test('sensorMap cargo temperature is weighted by volume', () => {
  const r = sensorMap(sensJson(), sensOpt); // volumes 43.8 and 1400
  near(r.temp, (35.3 * 43.8 + 30 * 1400) / 1443.8);
});
test('sensorMap other tanks: sounding cm, aliases, empty kept, null and unknown skipped', () => {
  const r = sensorMap(sensJson(), sensOpt);
  assert.equal(r.other.FPTKC, 184); assert.equal(r.other.FWDWBTKP, 0);
  assert.equal(r.other.MGOSERTK2S, 120); assert.equal(r.other.TECHWTKP, 250); assert.equal(r.other.POTWTKC, 300);
  assert.ok(!('LNG' in r.other)); assert.ok(!('RESIDTKP' in r.cargo) && !('RESIDTKP' in r.other));
  assert.equal(r.skipped.join(), 'XYZ');
});
test('sensorMap clamps ullage beyond the reference height to 0', () => {
  const j = sensJson(); j.cargo[0].ullage_mm = 9900;
  assert.equal(sensorMap(j, sensOpt).cargo.COTK1P, 0);
});
test('sensorMap no temperature when no cargo tank holds cargo', () => {
  const j = sensJson(); j.cargo = j.cargo.map(c => ({ ...c, ullage_mm: 9900 }));
  assert.equal(sensorMap(j, sensOpt).temp, null);
});
test('sensorMap throws the server error', () => {
  assert.throws(() => sensorMap({ ok: false, error: 'read timeout' }, sensOpt), /read timeout/);
});

// sensorParse: text copied in Titania Sync -> the tank JSON
test('sensorParse reads the tagged JSON, ignoring spaces around it', () => {
  const j = sensorParse('  ' + SENSOR_TAG + JSON.stringify(sensJson()) + '\n');
  assert.equal(j.time, '2026-10-30T20:14:47'); assert.equal(j.cargo[0].ullage_mm, 9623);
  near(sensorMap(j, sensOpt).cargo.COTK1P, 21.9);
});
test('sensorParse rejects text that is not from Titania Sync', () => {
  assert.throws(() => sensorParse(''), /Titania Sync/);
  assert.throws(() => sensorParse('hello'), /Titania Sync/);
  assert.throws(() => sensorParse(JSON.stringify(sensJson())), /Titania Sync/);
});
test('sensorParse rejects broken data', () => {
  assert.throws(() => sensorParse(SENSOR_TAG + '{"ok":true,"cargo":['), /damaged/);
  assert.throws(() => sensorParse(SENSOR_TAG + '[1,2]'), /damaged/);
});

console.log(`ok ${n} tests`);
