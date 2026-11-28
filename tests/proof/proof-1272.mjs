import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Beta 1.280 (architecture programme #8, the grafted fast malformed-input
// cases) — the restore PLANNER's boundary, pinned without a browser.
//
// Through 1.279 restoreBackup validated inline as it planned; the refusal
// boundary (what a malformed backup may and may not get past) was graded
// only by the browser battery. The #8 split gives the boundary a name —
// RESTORE.plan (parts/app4.js) — and this proof extracts the shipped
// planner verbatim (with countUnknownNames, canonicalSettings and
// canonicalFixLog, its planning-boundary validators) and runs it in a vm
// against planted packs and stubs:
//
//   - every malformed input below is REFUSED at the boundary: plan
//     returns null and a refusal toast is recorded;
//   - the planning stage can write NOTHING: the vm context carries no
//     write primitive at all (no txSet/txDel, no upPut/upDel, no rawRead,
//     no PERSIST) — a planning-stage write would throw and fail the case;
//   - the fixlog codec stubs THROW when reached, proving the malformed
//     fixlog cases are refused by canonicalFixLog's shape gate before
//     any decoding;
//   - the control cases pin the plan's shape for valid inputs (entries,
//     the idle assertion, a dropped vs a carried snapshot, the
//     unknown-name count, the C06/C-01 session-marker passes, the F06
//     derived sides, the session-marker cap, the canonical settings
//     record, a v1 plan), so the refusals are refusals of a working
//     planner, not of a broken rig.
//
// Run from the repo root:  node tests/proof/proof-1272.mjs

const app1 = readFileSync('parts/app1.js', 'utf8');
const app4 = readFileSync('parts/app4.js', 'utf8');
const packsSrc = readFileSync('parts/create-packs.js', 'utf8');

function extractFn(src, name) {
  const at = src.indexOf('function ' + name);
  if (at < 0) throw new Error('function not found: ' + name);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('unbalanced braces extracting ' + name);
}
function extractObj(src, name) {
  const at = src.indexOf('const ' + name + ' = {');
  if (at < 0) throw new Error('object not found: ' + name);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1) + ';'; }
  }
  throw new Error('unbalanced braces extracting ' + name);
}
function literal(src, name) {
  const m = src.match(new RegExp('const ' + name + ' = ([^;]+);'));
  if (!m) throw new Error('literal not found: ' + name);
  return name + ' = ' + m[1] + ';';
}

const srcs = [
  literal(app1, 'ROUTE_FIELDS'), literal(app1, 'LEGACY_KEYS'),
  literal(app1, 'SETTINGS_DEF'), literal(app1, 'CHIME_KEYS'),
  literal(app1, 'FIXLOG_MAX'), literal(app1, 'FIXLOG_MAX_CHARS'),
  literal(app1, 'TRAIL_MAX'), literal(app1, 'TRAIL_WINDOW_S'),
  extractFn(app1, 'parseJ(raw, fb)'),
  extractFn(app1, 'routeKeys(id)'),
  extractFn(app1, 'slotKeys(id)'),
  extractFn(app1, 'trailWindow(points, runStartMs)'),
  extractFn(app4, 'countUnknownNames(parsed, packs = ROUTE_PACKS)'),
  extractFn(app4, 'canonicalSettings(raw)'),
  extractFn(app4, 'canonicalFixLog(raw)'),
  // the merge region: the hoisted helpers, the four sections and the host are contiguous in app4
  app4.slice(app4.indexOf('const own = (o, k)'),
    app4.indexOf('function mergeRestoreEntries(entries, allPacks)') + extractFn(app4, 'mergeRestoreEntries(entries, allPacks)').length),
  extractFn(packsSrc, 'upCanon(v)'),
  extractObj(app4, 'RESTORE'),
].join('\n');

const PLANT = `
let __toasts = [];
const RAW_READ_FAILED = {};
let __store = {};
function rawRead(k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; }
function nextSunBoundary(ms) { return ms + 43200000; }
function toast(m, ms) { __toasts.push(String(m)); }
let __banners = [];
function showBanner(h, l) { __banners.push(String(h)); }
const SHIPPED_PACK_IDS = new Set(['5w']);
const PACK5W = { id: '5w', name: 'Route 5W', roads: { Velmar: {}, Mellings: {} } };
let ROUTE_PACKS = [PACK5W];
const LS = { fixlog: 'k.fixlog' };
const LS_GLOBAL = { night: 'k.night', nightExp: 'k.nightExp' };
const SETTINGS_KEY = 'k.settings';
const USERPACKS_KEY = 'k.userpacks';
const UP_READ_FAILED = '__URF__';
let __snapValid = null;
function validateSnap(o, s, pg) { return __snapValid; }
const BOARD = { serialiseSnap: (snap, at) => JSON.stringify({ ser: snap, at }) };
let __packOk = true;
function normalizePack(o, opts) { return __packOk ? { ok: true, pack: Object.assign({}, o) } : { ok: false, error: 'planted bad pack' }; }
function packGeometry(pack) { const names = Object.keys(pack.roads || {}); const stretch = {}; for (const n of names) stretch[n] = { parts: [0, 0] }; return { names, set: new Set(names), stretch, samples: [] }; }
let __upGetImpl = async (id) => null;
async function upGet(id) { return __upGetImpl(id); }
let __legacy = {};
function readUserPacks() { return __legacy; }
function fixLogDecodeSessions(p) { throw new Error('fixlog codec reached from a planning case'); }
function fixLogEncodeSessions(s) { throw new Error('fixlog codec reached from a planning case'); }
`;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  (' + (detail || '') + ')'));
}

const START = '1762000000000'; // an in-band epoch-ms start string (the 1.150 band)
const rk = { done: 'snowroute.5w.v2', times: 'snowroute.5w.v2.times', sides: 'snowroute.5w.v5.sides', sess: 'snowroute.5w.v5.sess', start: 'snowroute.5w.v5.start', snap: 'snowroute.5w.v5.snap', finclean: 'snowroute.5w.v5.finclean' };

async function runCase(setup, parsed) {
  const ctx = vm.createContext({});
  vm.runInContext(PLANT, ctx);
  vm.runInContext(srcs, ctx);
  if (setup) vm.runInContext(setup, ctx);
  vm.runInContext('__toasts = []', ctx);
  const out = await vm.runInContext(`(async () => { const p = await RESTORE.plan(${JSON.stringify(parsed)}); return { plan: p, toasts: __toasts, banners: __banners }; })()`, ctx);
  return out;
}

const V2 = (routes, extra) => Object.assign({ app: 'snowroute-backup', v: 2, routes }, extra || {});

const REFUSALS = [
  ['null input', null, null],
  ['a bare string', null, 'just text'],
  ['wrong app marker', null, { app: 'other-backup', v: 2, routes: {} }],
  ['v2 routes is an array', null, V2([])],
  ['v2 routes is null', null, V2(null)],
  ['v2 route entry is a scalar', null, V2({ '5w': 42 })],
  ['v2 unknown route', 'unknown route', V2({ nope: {} })],
  ['field value not a string', 'bad value', V2({ '5w': { done: 42 } })],
  ['field value not JSON', 'not valid JSON', V2({ '5w': { done: 'not json' } })],
  ['done has the wrong shape (a JSON string)', 'wrong shape', V2({ '5w': { done: '"Velmar"' } })],
  ['times has the wrong shape (an array)', 'wrong shape', V2({ '5w': { times: '[1]' } })],
  ['start scalar below the band (the 1.150 case)', 'bad value', V2({ '5w': { start: '1' } })],
  ['start not a digit string', 'bad value', V2({ '5w': { start: '2026-13-45' } })],
  ['night outside its enum', 'bad value', V2({}, { night: '2' })],
  ['nightExp not a finite epoch', 'bad value', V2({}, { nightExp: 'abc' })],
  ['settings not a string', 'bad settings', V2({}, { settings: 42 })],
  ['settings a string holding a non-object', 'bad settings', V2({}, { settings: '"x"' })],
  ['fixlog a string holding a non-log', 'bad fix log', V2({}, { fixlog: '"x"' })],
  ['fixlog an unknown encoding marker', 'bad fix log', V2({}, { fixlog: '{"e":2,"s":[]}' })],
  ['userpacks not an object', 'bad created-routes', V2({}, { userpacks: [] })],
  ['userpacks id collides with a shipped pack', 'bad created route id', V2({}, { userpacks: { '5w': {} } })],
  ['userpacks id fails the slug shape', 'bad created route id', V2({}, { userpacks: { 'Bad Id': {} } })],
  ['userpacks pack fails validation', 'bad created route', V2({}, { userpacks: { newroute: {} } }), '__packOk = false'],
  ['unsupported version', 'Unsupported backup version', { app: 'snowroute-backup', v: 3, routes: {} }],
  ['v1 data not an object', null, { app: 'snowroute-backup', v: 1, data: [] }],
  ['v1 field value not a string', 'bad value', { app: 'snowroute-backup', v: 1, data: { 'snowroute.v2': 42 } }],
  ['created-route store unreadable at the priors snapshot', 'could not be read', V2({ newroute: {} }, { userpacks: { newroute: {} } }), '__upGetImpl = async (id) => __URF__'.replace('__URF__', 'UP_READ_FAILED')],
  ['legacy created-routes record unreadable at the priors snapshot', 'could not be read', V2({ newroute: {} }, { userpacks: { newroute: {} } }), '__legacy = null'],
];

for (const [name, frag, parsed, setup] of REFUSALS) {
  let out, err = null;
  try { out = await runCase(setup, parsed); } catch (e) { err = e; }
  check('refuses: ' + name, !err && out && out.plan === null && out.toasts.length === 0 && out.banners.length === 0,
    err ? String(err && err.message || err) : 'plan: ' + JSON.stringify(out && out.plan && Object.keys(out.plan)) + ' toasts: ' + JSON.stringify(out && out.toasts) + ' banners: ' + JSON.stringify(out && out.banners));
}

const has = (plan, k, v) => plan.entries.some(e => e[0] === k && (v === undefined || e[1] === v));

// C1: a valid minimal v2 plan (against an empty destination; the slot's
// finish-cleanup obligation is planted armed, so its discharge can fire)
{
  const out = await runCase(`__store = { 'snowroute.5w.v5.finclean': '{"armed":true}' }`, V2({ '5w': { done: '["Velmar"]', sides: '{"p":{"Velmar":[3,3]},"t":{}}' } }));
  const p = out.plan;
  check('control: a valid v2 backup plans', !!p, 'toasts: ' + JSON.stringify(out.toasts));
  check('control: the plan carries the done entry verbatim', !!p && has(p, rk.done, '["Velmar"]'));
  check('control: a slot that gained data discharges its armed finclean obligation (null entry)', !!p && has(p, rk.finclean, null));
  check('control: the rollback scope covers the written keys and the fixlog key', !!p && p.scope.includes(rk.done) && p.scope.includes('k.fixlog'));
  check('control: no unknown names counted', !!p && p.droppedNames === 0);
}
// C2: the explicit idle assertion (Beta 1.287: a merge never deletes - an
// idle assertion over a resident run adds nothing, and its snapshot drops)
{
  const out = await runCase(`__store = { 'snowroute.5w.v5.start': '${START}' }`, V2({ '5w': { start: null, snap: '{"x":1}' } }));
  check('control: an explicit idle assertion over a resident run plans nothing', out.plan === null, 'plan: ' + JSON.stringify(out.plan));
  check('control: the idle outcome is silent now (audit v2: no pop-up when nothing changed)', out.toasts.length === 0 && out.banners.length === 0, 'toasts: ' + JSON.stringify(out.toasts));
}
// C3: an unparseable carried snapshot is dropped, not fatal
{
  const out = await runCase(null, V2({ '5w': { start: START, snap: 'garbage' } }));
  const p = out.plan;
  check('control: an unparseable carried snapshot drops and the plan stands', !!p && p.snapDropped === true && !p.entries.some(e => e[0] === rk.snap), 'toasts: ' + JSON.stringify(out.toasts));
}
// C4: a valid carried snapshot lands as an entry
{
  const out = await runCase('__snapValid = { planted: "snap" }', V2({ '5w': { start: START, snap: '{"a":1}' } }));
  const p = out.plan;
  check('control: a valid carried snapshot lands normalized as an entry', !!p && p.snapDropped === false && has(p, rk.snap, JSON.stringify({ ser: { planted: 'snap' }, at: 1762000000000 })));
}
// C5: unknown names are counted from the raw backup
{
  const out = await runCase(null, V2({ '5w': { done: '["Velmar","Ghost St"]', sides: '{"p":{},"t":{}}' } }));
  check('control: an unknown street name is counted once', !!out.plan && out.plan.droppedNames === 1, 'dropped: ' + (out.plan && out.plan.droppedNames));
}
// C6: C06 — a trail arriving without markers gains the synthetic clear
{
  const out = await runCase(null, V2({ '5w': { start: START, trail: '[]' } }));
  check('control: a trail without markers gains the C06 session clear', !!out.plan && has(out.plan, rk.sess, '[]'));
}
// C7: C-01 — markers arriving without their trail add nothing under a merge
{
  const out = await runCase(null, V2({ '5w': { sess: '[1762000000000]' } }));
  check('control: markers without their trail plan nothing (C-01)', out.plan === null && out.toasts.length === 0 && out.banners.length === 0, 'plan: ' + JSON.stringify(out.plan) + ' toasts: ' + JSON.stringify(out.toasts));
}
// C8: F06 — done without sides derives the side-marks in the plan
{
  const out = await runCase(null, V2({ '5w': { done: '["Velmar"]', times: '{"Velmar":"2026-11-01T12:05:00.000Z"}' } }));
  const ent = out.plan && out.plan.entries.find(e => e[0] === rk.sides);
  const P = ent ? JSON.parse(ent[1]).p : null;
  check('control: done without sides derives the side-marks (F06)', !!P && JSON.stringify(P.Velmar) === '[3,3]', 'sides entry: ' + (ent && ent[1]));
}
// C9: the settings record is canonicalized into the plan
{
  const out = await runCase(null, V2({}, { settings: '{"vib":true}' }));
  check('control: settings land canonicalized', !!out.plan && has(out.plan, 'k.settings', '{"vib":true,"chime":false,"chimeSound":"two"}'));
}
// C10: a valid v1 plan lands on the 5W slot
{
  const out = await runCase(null, { app: 'snowroute-backup', v: 1, data: { 'snowroute.v2': '["Velmar"]' } });
  check('control: a valid v1 backup plans onto the 5W slot', !!out.plan && has(out.plan, rk.done, '["Velmar"]'), 'toasts: ' + JSON.stringify(out.toasts));
}
// C11: the session-marker cap is applied inside the plan (the stored value is the capped one)
{
  const many = Array.from({ length: 8005 }, (_, i) => 1762000000 + i);
  const out = await runCase(null, V2({ '5w': { start: START, trail: '[]', sess: JSON.stringify(many) } }));
  const ent = out.plan && out.plan.entries.find(e => e[0] === rk.sess);
  const v = ent ? JSON.parse(ent[1]) : null;
  check('control: an oversize session-marker list is sanitized and capped in the plan', Array.isArray(v) && v.length === 8000 && v[0] === 1762000005, 'len: ' + (v && v.length) + ' first: ' + (v && v[0]));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
