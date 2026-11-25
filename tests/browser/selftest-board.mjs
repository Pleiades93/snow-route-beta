// Arch-2 gate fixtures: the route board module (BOARD, parts/app1.js) is
// the ONE owner of the board state - emptying, capture, restore, serialise,
// load and the field rules. These fixtures extract the shipped module
// verbatim (plus sanitizePieceTimes/streetComplete, its rule partners) and
// drive it in plain Node against fake geometry: the snapshot round-trip is
// an identity, the reject battery rejects, the load repair lands on the
// honest board, and the structural pins hold the other parts off the raw
// representation (no snapshot literal, no board rebinding outside app1).
import { readFileSync } from 'node:fs';
import { extractFn } from './extract-fn.mjs';
import vm from 'node:vm';

const read = p => readFileSync(new URL('../../parts/' + p, import.meta.url), 'utf8');
const app1 = read('app1.js'), app3 = read('app3.js'), app4 = read('app4.js'), app5 = read('app5.js');


let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const GEO = `
  const STREETNAMES = ['Alpha', 'Beta', 'Gamma'];
  const STREETSET = new Set(STREETNAMES);
  const STRETCH = { Alpha: { parts: [0, 0] }, Beta: { parts: [0] }, Gamma: { parts: [0, 0, 0] } };
  const SAMPLES = { Alpha: [0, 1], Beta: [0], Gamma: [0, 1, 2] };
  let pieces = {}, pieceTimes = {}, doneSet = new Set(), doneTimes = {}, doneVia = {}, coveredIdx = {}, notes = {}, runStart = 0;
  const parseJ = (raw, fb) => { if (raw == null) return fb; try { const v = JSON.parse(raw); return v == null ? fb : v; } catch (e) { return fb; } };
`;
const modStart = app1.indexOf('// ===== THE ROUTE BOARD MODULE');
const modEnd = app1.indexOf('let routeLoaded = false', modStart);
if (modStart < 0 || modEnd < 0) throw new Error('board module not found in parts/app1.js');
const moduleCode = GEO + extractFn(app1, 'function sanitizePieceTimes(') + '\n' + extractFn(app1, 'function streetComplete(') + '\n' + app1.slice(modStart, modEnd);

function makeCtx(extra = '') {
  const ctx = vm.createContext({ console });
  vm.runInContext(moduleCode + extra, ctx);
  return ctx;
}
const ser = ctx => vm.runInContext('JSON.stringify(BOARD.serialiseLive())', ctx);

const T1 = '2026-01-05T10:00:00.000Z', T2 = '2026-01-05T11:00:00.000Z', T3 = '2026-01-05T12:00:00.000Z';
const AT = 1767600000000;
const STATES = [
  ['empty', { pieces: { Alpha: [0, 0], Beta: [0], Gamma: [0, 0, 0] }, pieceTimes: { Alpha: {}, Beta: {}, Gamma: {} }, done: [], times: {}, via: {}, cov: {} }],
  ['full', { pieces: { Alpha: [3, 3], Beta: [3], Gamma: [3, 3, 3] }, pieceTimes: { Alpha: [[T1, T1], [T2, T2]], Beta: [[T3, T3]], Gamma: [[T1, T1], [T1, T1], [T2, T2]] }, done: ['Alpha', 'Beta', 'Gamma'], times: { Alpha: T2, Beta: T3, Gamma: T2 }, via: { Alpha: 'gps', Beta: 'tap', Gamma: 'sides' }, cov: { Alpha: [0, 1], Gamma: [2] } }],
  ['partial+sparse', { pieces: { Alpha: [3, 1], Beta: [0], Gamma: [2, 0, 3] }, pieceTimes: { Alpha: [[T1, T1], [T2, null]], Beta: {}, Gamma: [[null, T3], [null, null], [T1, T1]] }, done: [], times: {}, via: {}, cov: { Beta: [0] } }],
];
for (const [name, st] of STATES) {
  const ctx = makeCtx();
  vm.runInContext(`pieces = ${JSON.stringify(st.pieces)}; pieceTimes = ${JSON.stringify(st.pieceTimes)}; doneSet = new Set(${JSON.stringify(st.done)}); doneTimes = ${JSON.stringify(st.times)}; doneVia = ${JSON.stringify(st.via)}; coveredIdx = ${JSON.stringify(st.cov)};`, ctx);
  const before = ser(ctx);
  // capture -> serialise -> validate -> restore: an identity on the live
  // serialisation, up to validateSnap's one normalization (a street's
  // empty-object pieceTimes {} sanitizes to the array form []) - the same
  // result the pre-Arch-2 hand-built path produced (round-trip harness).
  vm.runInContext(`BOARD.restore(BOARD.validate(JSON.parse(BOARD.serialiseSnap(BOARD.capture(), ${AT})), ${AT}))`, ctx);
  const after = JSON.parse(ser(ctx));
  const expectSides = JSON.parse(before).sides.replace(/"Beta":\{\}/g, '"Beta":[]').replace(/"Alpha":\{\}/g, '"Alpha":[]').replace(/"Gamma":\{\}/g, '"Gamma":[]');
  t(name + ': capture/serialise/validate/restore round-trip (identity up to the {} -> [] stamp normalization)', after.sides === expectSides && after.done === JSON.parse(before).done && after.times === JSON.parse(before).times && after.via === JSON.parse(before).via && after.cov === JSON.parse(before).cov);
  // capture copy depths: pieces deep, and the snapshot survives live mutation
  const cap = vm.runInContext('BOARD.capture()', ctx);
  vm.runInContext('pieces.Alpha[0] = 9;', ctx);
  t(name + ': capture is a deep copy of pieces', cap.pieces.Alpha[0] !== 9);
  // zero + cleared shapes
  const ctx2 = makeCtx();
  vm.runInContext(`pieces = ${JSON.stringify(st.pieces)}; pieceTimes = ${JSON.stringify(st.pieceTimes)}; doneSet = new Set(${JSON.stringify(st.done)}); doneTimes = ${JSON.stringify(st.times)}; doneVia = ${JSON.stringify(st.via)}; coveredIdx = ${JSON.stringify(st.cov)}; BOARD.zeroMarks();`, ctx2);
  t(name + ': zeroMarks empties every street and binding', ser(ctx2) === JSON.stringify({ sides: JSON.stringify({ p: { Alpha: [0, 0], Beta: [0], Gamma: [0, 0, 0] }, t: { Alpha: {}, Beta: {}, Gamma: {} } }), done: '[]', times: '{}', via: '{}', cov: '{}' }));
  t(name + ': clearedSides is the zeroed stored shape', vm.runInContext('JSON.stringify(BOARD.clearedSides())', ctx2) === JSON.stringify({ p: { Alpha: [0, 0], Beta: [0], Gamma: [0, 0, 0] }, t: { Alpha: {}, Beta: {}, Gamma: {} } }));
  vm.runInContext('BOARD.emptyBoard()', ctx2);
  t(name + ': emptyBoard drops the board whole', ser(ctx2) === JSON.stringify({ sides: '{"p":{},"t":{}}', done: '[]', times: '{}', via: '{}', cov: '{}' }));
}

// reject battery
{
  const ctx = makeCtx();
  const good = { at: AT, pieces: { Alpha: [3, 3], Beta: [3], Gamma: [3, 3, 3] }, pieceTimes: { Alpha: [[T1, T1], [T1, T1]], Beta: [[T1, T1]], Gamma: [[T1, T1], [T1, T1], [T1, T1]] }, done: ['Alpha'], times: { Alpha: T1 }, via: { Alpha: 'gps' }, cov: { Alpha: [0] } };
  const v = (name, obj, at = AT) => t('validate: ' + name, vm.runInContext(`BOARD.validate(${JSON.stringify(obj)}, ${at})`, ctx));
  v('genuine snapshot passes', good);
  t('validate: wrong at rejects', vm.runInContext(`BOARD.validate(${JSON.stringify(good)}, ${AT + 1})`, ctx) === null);
  const bad = (name, mutate) => { const o = JSON.parse(JSON.stringify(good)); mutate(o); t('validate: ' + name + ' rejects', vm.runInContext(`BOARD.validate(${JSON.stringify(o)}, ${AT})`, ctx) === null); };
  bad('side value 99', o => { o.pieces.Alpha = [99, 3]; });
  bad('unknown street', o => { o.pieces.Nope = [3, 3]; });
  bad('unparseable stamp', o => { o.pieceTimes.Beta = [['not-a-date', null]]; });
  bad('unparseable done time', o => { o.times = { Alpha: 'not-a-date' }; });
  bad('coverage index out of range', o => { o.cov = { Alpha: [7] }; });
  bad('missing street', o => { delete o.pieces.Gamma; });
}

// journal fallback through the module
{
  const ctx = makeCtx();
  const RS = Date.parse(T2);
  vm.runInContext(`pieces = { Alpha: [3, 1], Beta: [3], Gamma: [0, 0, 0] }; pieceTimes = { Alpha: [[${JSON.stringify(T1)}, ${JSON.stringify(T1)}], [${JSON.stringify(T3)}, null]], Beta: [[${JSON.stringify(T3)}, ${JSON.stringify(T3)}]], Gamma: {} }; doneSet = new Set(['Beta']); doneTimes = { Beta: ${JSON.stringify(T3)}, Alpha: ${JSON.stringify(T1)} }; doneVia = { Beta: 'gps', Alpha: 'tap' }; coveredIdx = { Alpha: [0] }; BOARD.revertRunMarks(${RS});`, ctx);
  const out = JSON.parse(ser(ctx));
  t('revertRunMarks: pre-Start sides keep, run sides revert, invariant re-derived', out.sides === JSON.stringify({ p: { Alpha: [3, 0], Beta: [0], Gamma: [0, 0, 0] }, t: { Alpha: [[T1, T1], [null, null]], Beta: [[null, null]], Gamma: {} } }) && out.done === '[]' && out.times === '{}' && out.via === '{}' && out.cov === '{}');
}

// load repair over a corrupt store lands on the honest board
{
  const store = { done: '["Alpha","Nope",42]', times: JSON.stringify({ Alpha: T1, Beta: 'not-a-date', Gamma: 7 }), via: JSON.stringify({ Alpha: 'gps', Beta: 42 }), cov: JSON.stringify({ Alpha: [0, -1, 1.5, 9], Beta: 'x' }), sides: JSON.stringify({ p: { Alpha: [99, 3], Gamma: [3, 3] }, t: { Alpha: { 0: [T1, null] } } }) };
  const ctx = makeCtx(`; const STORE = ${JSON.stringify(store)}; var LS = { done: 'done', times: 'times', via: 'via', cov: 'cov', sides: 'sides' }; var lsGet = k => (k in STORE ? STORE[k] : null);`);
  vm.runInContext('BOARD.loadDoneMeta(); BOARD.loadCoverage(); BOARD.loadSides();', ctx);
  const out = JSON.parse(ser(ctx));
  // Gamma's stored sides have the wrong stretch count, so the street is
  // derived from the done set (which names only Alpha) and lands zeroed;
  // Alpha's 99 clamps to 0; times/via prune to complete streets (none).
  t('load repair: corrupt store sanitized (99 clamped, unknown dropped, cov bounded)', out.sides === JSON.stringify({ p: { Alpha: [0, 3], Beta: [0], Gamma: [0, 0, 0] }, t: { Alpha: [[T1, null]], Beta: [], Gamma: [] } }) && out.done === '[]' && out.times === '{}' && out.via === '{}' && out.cov === '{"Alpha":[0]}');
}

// structural pins: the raw representation lives in the module only
t('module: BOARD is defined in app1', app1.includes('const BOARD = {'));
t('module: validateSnap is defined in app1 (the board module)', app1.includes('function validateSnap(raw, expectAt, G)'));
t('app3: no validateSnap definition remains', !app3.includes('function validateSnap('));
t('app3/app4: no snapshot literal construction remains', !/pieces: (runSnap|pv|valid)\.pieces/.test(app3 + app4));
t('app3/app5: no board rebinding remains', !/(pieces|pieceTimes|doneSet|doneTimes|doneVia|coveredIdx) = (runSnap|validSnap|new Set\(\); )/.test(app3) && !app5.includes('coveredIdx = {}; pieces = {};'));
t('app4: no live-board serialisation literal remains', !app4.includes('data.sides = JSON.stringify({ p: pieces, t: pieceTimes })'));

console.log(`board selftest: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
