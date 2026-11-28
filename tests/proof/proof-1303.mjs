// proof-1303.mjs - mergeRestoreEntries characterization: resident-first
// restore merge and fail-closed planning, pinned before its split.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { extractFn } from '../browser/extract-fn.mjs';

const read = name => readFileSync(new URL('../../parts/' + name, import.meta.url), 'utf8');
const app1 = read('app1.js');
const app4 = read('app4.js');
const declaration = name => app1.match(new RegExp('^const ' + name + ' = [^;]+;', 'm'))[0];
const source = [
  ...['routeKeys', 'parseJ', 'trailWindow', 'slotKeys', 'sanitizePieceTimes'].map(name => extractFn(app1, 'function ' + name + '(')),
  ...['ROUTE_FIELDS', 'LEGACY_KEYS', 'LS_GLOBAL', 'SETTINGS_KEY', 'TRAIL_WINDOW_S'].map(declaration),
  extractFn(read('create-packs.js'), 'function upCanon('),
  // the merge region: the hoisted helpers, the four sections and the host are contiguous in app4
  app4.slice(app4.indexOf('const own = (o, k)'),
    app4.indexOf('function mergeRestoreEntries(') + extractFn(app4, 'function mergeRestoreEntries(').length),
  'const BOARD = {' + ['snapshotObject', 'serialiseSnap'].map(name =>
    extractFn(app1, name + '(snap, at) {')).join(',') + '};',
  'const RESTORE = {' + extractFn(app4, 'plan(parsed) {') + '};',
].join('\n');
const RAW_READ_FAILED = Symbol('failed read');
const pack = { id: '5w', name: 'Route 5W' };
const names = ['A', 'B', 'C', 'D'];
const G = {
  names, set: new Set(names),
  stretch: Object.fromEntries(names.map(n => [n, { parts: [[0, 1]] }])),
  samples: { A: [0, 1] },
};
let resident, reads;
const context = vm.createContext({
  RAW_READ_FAILED,
  rawRead: key => { reads.push(key); return resident.get(key) ?? null; },
  packGeometry: () => G,
  LS: { fixlog: 'snowroute.v1.fixlog' },
  nextSunBoundary: now => now + 1000,
  Date: class extends Date { static now() { return 1764547200000; } },
  SHIPPED_PACK_IDS: new Set(['5w']),
  ROUTE_PACKS: [pack],
  countUnknownNames: () => 0,
});
const api = vm.runInContext(source + '\n({routeKeys, mergeRestoreEntries, RESTORE, LEGACY_KEYS, LS_GLOBAL, SETTINGS_KEY})', context);
const rk = api.routeKeys(pack.id);
const { night, nightExp, fixlog } = api.LS_GLOBAL;
const settings = api.SETTINGS_KEY;
const j = JSON.stringify;
const equal = (a, b) => j(a) === j(b);
const at = '2025-12-01T00:00:00.000Z';
const start = String(Date.parse(at));
const before = '2025-11-30T00:00:00.000Z';
const after = '2025-12-02T00:00:00.000Z';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond === true) pass++;
  else { fail++; console.log('FAIL:', name); }
}
function setup(current) {
  reads = [];
  resident = new Map(Object.entries(current));
}
function merge(current, backup, packs = [pack]) {
  setup(current);
  return Object.fromEntries(api.mergeRestoreEntries(Object.entries(backup), packs));
}
function throwsMessage(current, backup, expected) {
  try { merge(current, backup); }
  catch (error) { return error.message === expected; }
  return false;
}

// §4 missing-key policy: add absent board records and preserve resident values.
check('empty backup returns no writes and reads no keys', equal(merge({}, {}), {}) && !reads.length);
for (const field of ['times', 'via', 'cov']) {
  const [a, b] = { times: [at, after], via: ['tap', 'gps'], cov: [[0], [1]] }[field];
  const key = rk[field];
  check(field + ': resident and backup-only streets survive together',
    equal(JSON.parse(merge({ [key]: j({ A: a, C: a }) }, { [key]: j({ A: b, B: b }) })[key]), { A: a, C: a, B: b }));
}
check('present flip and fix log win whole, even with false or empty values',
  equal(merge({ [rk.flip]: '0', [fixlog]: '[]' }, { [rk.flip]: '1', [fixlog]: '{"e":3,"s":[]}' }), {}));
check('absent flip and fix log copy verbatim',
  equal(merge({}, { [rk.flip]: '1', [fixlog]: '{ "e": 3, "s": [] }' }), { [rk.flip]: '1', [fixlog]: '{ "e": 3, "s": [] }' }));

const note = { k: 'note', at, text: 'resident' };
const other = { k: 'note', at: after, text: 'backup' };
const marks = [{ k: 'hazard', at }, { k: 'hazard', at, text: '' }];
const backupNotes = { A: [other, note, ...marks, ...marks], B: [other, note], C: [other, note] };
const noteWrites = merge({ [rk.notes]: j({ A: [note, marks[0]], C: [] }) }, { [rk.notes]: j(backupNotes) });
const nullText = merge({ [rk.notes]: j({ A: [{ k: 'hazard', at }] }) }, { [rk.notes]: j({ A: [{ k: 'hazard', at, text: null }] }) });
check('resident text note wins, and missing versus empty text have distinct identities',
  equal(JSON.parse(noteWrites[rk.notes]).A, [note, ...marks]) &&
  equal(JSON.parse(nullText[rk.notes] || '{}').A, [{ k: 'hazard', at }, { k: 'hazard', at, text: null }]));
check('first text note wins on new and resident streets without a text note',
  equal([JSON.parse(noteWrites[rk.notes]).B, JSON.parse(noteWrites[rk.notes]).C], [[other], [other]]));
check('an absent notes slot also keeps just the first text note',
  equal(JSON.parse(merge({}, { [rk.notes]: j({ A: [other, note] }) })[rk.notes]), { A: [other] }));

const sides = { p: { A: [1], B: [0] }, t: { A: [[at, null]] }, extra: true };
const incomingSides = { p: { A: [3], B: [2], C: [1] }, t: { B: [[null, after]] } };
const board = merge(
  { [rk.sides]: j(sides), [rk.done]: j(['C']) },
  { [rk.sides]: j(incomingSides), [rk.done]: j(['A', 'C', 'D', 'Unknown']), [rk.times]: j({ D: after }) },
);
check('resident marks and legacy completion beat backup sides and done; filler can be filled',
  equal(JSON.parse(board[rk.done]), ['C', 'D']) &&
  equal(JSON.parse(board[rk.sides]), {
    p: { A: [1], B: [2], D: [3] },
    t: { A: [[at, null]], B: [[null, after]], D: [[after, after]] }, extra: true,
  }));

check('absent side slot preserves the legacy side shape; empty done fills its own key',
  equal(merge({}, { [rk.sides]: '{ "A": [1] }', [rk.done]: '[]' }),
    { [rk.done]: '[]', [rk.sides]: '{ "A": [1] }' }));
check('a stamp-only resident side is a record and protects against backup completion',
  equal(merge({ [rk.sides]: j({ p: { A: [0] }, t: { A: [[at, null]] } }) },
    { [rk.done]: '["A"]', [rk.sides]: '{"A":[3]}' }), {}));

// §4 storage shape compatibility: legacy clean identity uses full stamped data.
const legacy = { at, items: { A: at }, sides: { A: [3] } };
const legacyReordered = { sides: { A: [3] }, items: { A: at }, at };
const legacyDifferent = { ...legacy, sides: { A: [1] } };
const modern = { at: after, runId: +start + 1000, items: { B: after }, km: 1 };
const old = { at: before, items: { C: before } };
check('legacy exact duplicates skip despite key reorder; same-stamp distinct cleans survive',
  equal(JSON.parse(merge({ [rk.hist]: j([legacy, modern]) }, {
    [rk.hist]: j([{ ...modern, km: 9 }, legacyDifferent, legacyReordered, old, legacyDifferent]),
  })[rk.hist]), [old, legacy, legacyDifferent, modern]));
check('duplicate-only history leaves resident bytes alone',
  equal(merge({ [rk.hist]: j([legacy]) }, { [rk.hist]: j([legacyReordered]) }), {}));
check('absent history imports in backup order; an empty archive fills an absent slot',
  equal(merge({}, { [rk.hist]: j([legacy, old]) }), { [rk.hist]: j([legacy, old]) }) &&
  equal(merge({}, { [rk.hist]: '[]' }), { [rk.hist]: '[]' }));

// §4 missing-key policy: globals fill only absent keys; the theme pair lands together.
check('settings preserve false, zero and resident-only keys while filling absent keys',
  equal(merge({ [settings]: j({ gps: false, pace: 0, theme: true }) },
    { [settings]: j({ gps: true, pace: 9, extra: true }) }),
  { [settings]: j({ gps: false, pace: 0, theme: true, extra: true }) }));
check('an absent settings key carries backup bytes',
  equal(merge({}, { [settings]: '{ "gps": false }' }), { [settings]: '{ "gps": false }' }));
check('expiry conflicts hold the whole theme pair, while equal expiry permits the override',
  equal(merge({ [nightExp]: start }, { [night]: '1', [nightExp]: String(+start + 2000) }), {}) &&
  equal(merge({ [nightExp]: start }, { [night]: '1', [nightExp]: start }), { [night]: '1' }));
check('missing expiry gets a fallback; an existing night override wins',
  equal(merge({}, { [night]: '1' }), { [night]: '1', [nightExp]: String(+start + 1000) }) &&
  equal(merge({ [night]: '0' }, { [night]: '1', [nightExp]: start }), {}));

// §4 transactional validation: run clusters plan together, and bad reads stop planning.
const sec = +start / 1000;
const trail = [[43, -79, sec - 1], [43, -79, sec], [91, -79, sec + 1]];
const cluster = { [rk.start]: start, [rk.trail]: j(trail) };
check('fresh live run retains only legal in-run trail points and seats an empty session',
  equal(merge({}, cluster), { [rk.start]: start, [rk.trail]: j([trail[1]]), [rk.sess]: '[]' }));
check('resident live run, conflicting orphan session or matching archive withholds cluster',
  [{ [rk.start]: String(+start - 1000) }, { [rk.sess]: '[1]' },
    { [rk.hist]: j([{ ...modern, runId: +start }]) }].every(current => equal(merge(current, cluster), {})));
check('a runless trail is cleared on import only into an unoccupied trail slot',
  equal(merge({}, { [rk.trail]: j(trail) }), { [rk.trail]: '[]' }) &&
  equal(merge({ [rk.sess]: '[1]' }, { [rk.trail]: j(trail) }), {}));
check('history cannot archive either the resident or newly admitted live run',
  [{ [rk.start]: start }, {}].every(current => {
    const result = merge(current, { [rk.start]: start, [rk.hist]: j([{ ...modern, runId: +start }, old]) });
    return equal(JSON.parse(result[rk.hist]), [old]);
  }));
check('a start without trail discards carried sessions but matching resident sessions permit a trail cluster',
  equal(merge({}, { [rk.start]: start, [rk.sess]: j([sec]) }), { [rk.start]: start }) &&
  equal(merge({ [rk.sess]: '[]' }, cluster), { [rk.start]: start, [rk.trail]: j([trail[1]]) }));
const snap = {
  at: +start, pieces: { A: [3], B: [0], C: [0], D: [0] },
  pieceTimes: { A: [[before, before]], B: [[null, null]], C: [[null, null]], D: [[null, null]] },
  done: [], times: {}, via: {}, cov: {},
};
const snapWrites = merge({
  [rk.sides]: j({ p: { A: [1] }, t: { A: [[at, null]] } }),
  [rk.done]: j(['A']), [rk.times]: j({ A: at }), [rk.via]: j({ A: 'tap' }), [rk.cov]: j({ A: [1] }),
}, { [rk.start]: start, [rk.snap]: j(snap) });
check('imported Cancel baseline folds in resident board progress',
  equal(JSON.parse(snapWrites[rk.snap]), {
    ...snap, pieces: { ...snap.pieces, A: [1] }, pieceTimes: { ...snap.pieceTimes, A: [[at, null]] },
    done: ['A'], times: { A: at }, via: { A: 'tap' }, cov: { A: [1] },
  }));
check('finish cleanup is discharged only when that route changes',
  merge({ [rk.finclean]: start }, { [rk.flip]: '1' })[rk.finclean] === null &&
  equal(merge({ [rk.finclean]: start, [rk.flip]: '1' }, { [rk.flip]: '0' }), {}));
check('unreadable or malformed current slots and pending legacy migration abort the plan',
  throwsMessage({ [rk.flip]: RAW_READ_FAILED }, { [rk.flip]: '1' }, rk.flip) &&
  throwsMessage({ [rk.hist]: '{}' }, { [rk.hist]: '[]' }, rk.hist) &&
  throwsMessage({ [rk.sides]: '{"p":[]}' }, { [rk.done]: '[]' }, rk.sides) &&
  throwsMessage({ [api.LEGACY_KEYS.sides]: '{}' }, { [rk.flip]: '1' }, 'Route 5W migration pending'));

// §4 backward compatibility: the restore planner honors boot's tombstone-filtered pack list.
for (const backup of [
  { v: 1, data: { 'snowroute.v2': '["A"]', [night]: '1' } },
  { v: 2, routes: { '5w': { done: '["A"]' } }, night: '1' },
]) {
  setup({});
  const livePlan = api.RESTORE.plan({ app: 'snowroute-backup', ...backup });
  context.ROUTE_PACKS = [];
  setup({});
  const deadPlan = api.RESTORE.plan({ app: 'snowroute-backup', ...backup });
  context.ROUTE_PACKS = [pack];
  check('v' + backup.v + ': tombstoned 5W is skipped while unrelated theme restores',
    Object.fromEntries(livePlan.entries)[rk.done] === '["A"]' &&
    equal(deadPlan.deadSkipped, ['5w']) &&
    equal(Object.fromEntries(deadPlan.entries), { [night]: '1', [nightExp]: String(+start + 1000) }) &&
    !reads.some(key => key.startsWith('snowroute.5w.')));
}

console.log(`proof-merge-restore-entries: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
