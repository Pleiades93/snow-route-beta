import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Beta 1.250 proof (cross-audit fix round, 2026-11-19) — history preservation:
// the two writers that bypassed the A-05 merge (historyForWrite).
//
// Defect 1 (N-03, parts/app1.js): reconcileInterruptedFinish's dropPhantom
// picks its rollback source by where the SIGNATURE came from. When the raw
// tail is not an entry object (e.g. null), the signature stands in the
// sanitized view and the rollback wrote the bare view slice - permanently
// stripping every raw entry the load-time sanitizer had dropped (entries
// naming streets the route no longer has), the moment that write landed.
// The loss is a WINDOW: an ordinary save later in the session would have
// restored them via historyForWrite, but a page close before that save made
// the strip permanent. This proof reads the reconcile write ITSELF, with no
// later save - the page-close-before-save case.
//
// Defect 2 (parts/app4.js): recoveryObj serialised the bare view into
// data.hist, so a recovery file's restore dropped the same raw entries.
//
// The fix: both writes go through historyForWrite, like every other history
// writer since A-05. (Beta 1.272, architecture programme #2: the merge and
// the rollback moved into the HIST repository - the rollback is
// HIST.dropPhantom, the recovery export writes HIST.serialise() - with the
// semantics unchanged; this proof drives them there.) This proof extracts
// the shipped code verbatim and runs it in a vm against planted state. On
// unmodified main the two preservation checks FAIL (the phantom-removal
// checks pass both ways); with the fix all checks pass.

const app1 = readFileSync('parts/app1.js', 'utf8');
const app4 = readFileSync('parts/app4.js', 'utf8');

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
const histSrc = extractObj(app1, 'HIST');
const reconcileSrc = extractFn(app1, 'reconcileInterruptedFinish(rawHistory)');
const actionSrc = extractFn(app1, 'finishReconcileAction(startMs, lastStartedMs, boardEmpty)');
const boardMatchSrc = extractFn(app1, 'finishBoardMatch(entry, P, T, names)');
const noRunSrc = extractFn(app1, 'finishReconcileNoRunAction(markerRun, markerAt, lastRunId, boardEmpty, boardMatch)');
const recoverySrc = extractObj(app4, 'ENVELOPE'); // Beta 1.280 (architecture #8/#9): the recovery export is the envelope owner's recovery policy now - the proof extracts the owner and drives ENVELOPE.recovery, the same body under its new home

// Planted entries: one naming ONLY a street the route no longer has (the
// sanitizer drops it from the view; storage still holds it raw), one
// surviving entry, and - for scenario A - a non-object raw tail.
const E_FOREIGN = { at: '2026-11-01T12:00:00.000Z', items: { 'Old Street': '2026-11-01T12:05:00.000Z' }, workM: 901 };
const E_PHANTOM_RAW = { at: '2026-11-02T12:00:00.000Z', items: { Velmar: '2026-11-02T12:05:00.000Z' }, workM: 902, runId: 1700000000000 };
const E_PHANTOM_VIEW = { at: '2026-11-02T12:00:00.000Z', items: { Velmar: '2026-11-02T12:05:00.000Z' }, workM: 902, runId: 1700000000000 };
const E_KEEP_RAW = { at: '2026-11-03T12:00:00.000Z', items: { Velmar: '2026-11-03T12:05:00.000Z' }, workM: 903 };
const E_KEEP_VIEW = { at: '2026-11-03T12:00:00.000Z', items: { Velmar: '2026-11-03T12:05:00.000Z' }, workM: 903 };

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  (' + detail + ')'));
}

// ---- Scenario A: N-03 - the interrupted-finish rollback write itself ----
{
  const ctx = vm.createContext({});
  vm.runInContext(`
let history = [], runStart = 0, pieces = {}, pieceTimes = {};
const STREETNAMES = ['Velmar', 'Mellings'];
const LS = { hist: 'planted.hist', start: 'planted.start', finclean: 'planted.finclean' };
const __writes = [];
function txSet(k, v) { __writes.push([k, v]); return { ok: true }; }
function txDel(k) { __writes.push([k, null]); return { ok: true }; }
function lsGet(k) { return null; }
function parseJ(t, fb) { if (t == null) return fb; try { return JSON.parse(t); } catch (e) { return fb; } }
`, ctx);
  vm.runInContext(histSrc + '\n' + actionSrc + '\n' + boardMatchSrc + '\n' + noRunSrc + '\n' + reconcileSrc, ctx);
  const out = vm.runInContext(`
const rawList = [${JSON.stringify(E_FOREIGN)}, ${JSON.stringify(E_PHANTOM_RAW)}, null];
HIST._rawList = rawList;
HIST._rawView = [null, ${JSON.stringify(E_PHANTOM_VIEW)}, null];
history = [HIST._rawView[1]];
runStart = 1700000000000;
pieces = { Velmar: [1], Mellings: [0] };
pieceTimes = { Velmar: [], Mellings: [] };
reconcileInterruptedFinish(rawList);
({ writes: __writes, viewLen: history.length })
`, ctx);
  const histWrites = out.writes.filter(w => w[0] === 'planted.hist');
  check('N-03: the rollback performs exactly one history write', histWrites.length === 1, 'writes: ' + JSON.stringify(out.writes));
  const written = histWrites.length ? JSON.parse(histWrites[0][1]) : [];
  check('N-03: the phantom entry is removed by the rollback', !written.some(e => e && e.workM === 902), 'written workMs: ' + JSON.stringify(written.map(e => e && e.workM)));
  check('N-03: the strip-dropped raw entry survives the rollback write itself (page-close-before-save case)', written.some(e => e && e.workM === 901 && e.items && e.items['Old Street'] === '2026-11-01T12:05:00.000Z'), 'written: ' + JSON.stringify(written));
  check('N-03: the non-object raw tail rides back verbatim', written.length === 2 && written[1] === null, 'written length ' + written.length);
  check('N-03: memory drops the phantom too', out.viewLen === 0, 'view length ' + out.viewLen);
}

// ---- Scenario B: the recovery export carries the raw-preserving history ----
{
  const ctx = vm.createContext({});
  vm.runInContext(`
let history = [], runStart = 0;
let routeLoaded = true, activeRoute = { id: 'r1' }, recoveryDisclosure = null;
const RAW_READ_FAILED = '__RAW_READ_FAILED__';
const BOARD = { serialiseLive: () => ({ sides: 'S', done: 'D', times: 'T', via: 'V', cov: 'C' }) };
const notes = {}, trail = [], trailSessions = [];
function rawRead(k) { return null; }
function routeKeys(id) { return { flip: 'k.flip' }; }
const upStoreComplete = true, userPackCache = {}, ROUTE_PACKS = [], SHIPPED_PACK_IDS = new Set(), ROUTE_FIELDS = [];
function normalizePack(pk, o) { return { ok: false }; }
const LS_GLOBAL = { night: 'k.night', nightExp: 'k.nightExp' };
const settings = { vib: true, chime: false, chimeSound: 'ding' };
const fixLog = [];
`, ctx);
  vm.runInContext(histSrc + '\n' + recoverySrc, ctx);
  const out = vm.runInContext(`
HIST._rawList = [${JSON.stringify(E_FOREIGN)}, ${JSON.stringify(E_KEEP_RAW)}];
HIST._rawView = [null, ${JSON.stringify(E_KEEP_VIEW)}];
history = [HIST._rawView[1]];
const o = ENVELOPE.recovery();
({ app: o && o.app, hist: o ? JSON.parse(o.routes.r1.hist) : null })
`, ctx);
  check('recovery: the export builds', out.app === 'snowroute-backup' && Array.isArray(out.hist), 'app: ' + out.app);
  check('recovery: the strip-dropped raw entry rides the recovery file', Array.isArray(out.hist) && out.hist.some(e => e && e.workM === 901 && e.items && e.items['Old Street'] === '2026-11-01T12:05:00.000Z'), 'hist: ' + JSON.stringify(out.hist));
  check('recovery: the surviving entry rides in its raw form', Array.isArray(out.hist) && out.hist.some(e => e && e.workM === 903), 'hist workMs: ' + JSON.stringify((out.hist || []).map(e => e && e.workM)));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
