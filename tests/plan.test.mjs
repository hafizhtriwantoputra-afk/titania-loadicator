// Tests for the PLAN-CORE block of index.html (pure planner helpers, no DOM). Run: node tests/plan.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const a = html.indexOf('// PLAN-CORE start'), b = html.indexOf('// PLAN-CORE end');
if (a < 0 || b < a) throw new Error('PLAN-CORE start/end markers not found in index.html');
const core = vm.runInNewContext(html.slice(a, b) + '\n;({ migrateV3, planTarget, ballastText, opFromFinal, XL_MAP, keepOps })');
const { migrateV3, planTarget, ballastText, opFromFinal, XL_MAP, keepOps } = core;

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

console.log(`ok ${n} tests`);
