import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Beta 1.251 proof (cross-audit fix round, R-02) — pack cache identity.
//
// The defect: a saved city-cache record was bound to its grid by bounding
// box alone. Pack way ids are file-order counters (create-citydata adapts
// a downloaded pack by position), so a REPUBLISHED pack can renumber every
// street while the box stays identical - and the old record restored, or a
// queued write merged, across that boundary, certifying coverage for ways
// the new dataset never contained (a street can read covered with a gap).
//
// The fix: every record carries a dataset identity (rec.ds) - a pack
// city's is 'pack:<slug>@<catalogue generatedAt>', the live service's is
// 'overpass' - judged by ONE extracted fit test, crCacheRecFits, at BOTH
// places the duplicated bbox check used to live (restore in crCityPrepare,
// the queued write in crCacheSaveCell). A mismatch starts the record over,
// exactly like a bbox mismatch. A side that cannot state an identity (a
// pre-1.251 record, an unanswered catalogue) is no evidence of mismatch.
//
// This proof extracts the shipped functions verbatim and runs them in vms
// against planted state. On unmodified main the extraction itself fails
// (crCacheRecFits does not exist) and the proof fails; with the fix all
// checks pass.

const cacheSrc = readFileSync('parts/create-cache.js', 'utf8');
const citySrc = readFileSync('parts/create-citydata.js', 'utf8');

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

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  (' + detail + ')'));
}

function extractAsyncFn(src, name) {
  const at = src.indexOf('async function ' + name);
  if (at < 0) throw new Error('async function not found: ' + name);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('unbalanced braces extracting ' + name);
}

const fitsSrc = extractFn(cacheSrc, 'crCacheRecFits(rec, bbox, ds)');
const dsIdSrc = extractFn(cacheSrc, 'crDatasetId(pk)');
const saveSrc = extractFn(cacheSrc, 'crCacheSaveCell(cityName, bbox, totalCells, key, ways, ds)');
const slugOkSrc = extractFn(citySrc, 'crPackSlugOk(s)');
const indexLoadSrc = extractFn(citySrc, 'crPackIndexLoad()');
const resolveSrc = extractAsyncFn(citySrc, 'crPackResolveCity(name, bbox)');

const BOX = { s: 43.8, w: -79.5, n: 43.9, e: -79.4 };
const BOX2 = { s: 43.7, w: -79.5, n: 43.9, e: -79.4 };

// ---- The fit test itself ----
{
  const ctx = vm.createContext({});
  vm.runInContext(fitsSrc, ctx);
  const fits = vm.runInContext('crCacheRecFits', ctx);
  check('fits: same box + same dataset fits', fits({ bbox: BOX, ds: 'pack:vaughan@G1', cells: {} }, BOX, 'pack:vaughan@G1') === true, '');
  check('fits: a republished pack (new stamp) does NOT fit', fits({ bbox: BOX, ds: 'pack:vaughan@G1', cells: {} }, BOX, 'pack:vaughan@G2') === false, '');
  check('fits: a pack record does NOT fit a service preparation', fits({ bbox: BOX, ds: 'pack:vaughan@G1', cells: {} }, BOX, 'overpass') === false, '');
  check('fits: a different box does NOT fit (the old guard, unchanged)', fits({ bbox: BOX2, ds: 'overpass', cells: {} }, BOX, 'overpass') === false, '');
  check('fits: a pre-1.251 record (no stamp) is no evidence of mismatch', fits({ bbox: BOX, cells: {} }, BOX, 'pack:vaughan@G2') === true, '');
  check('fits: an unstated current identity (catalogue silent) judges by box alone', fits({ bbox: BOX, ds: 'pack:vaughan@G1', cells: {} }, BOX, null) === true, '');
  check('fits: no record does not fit', fits(null, BOX, 'overpass') === false, '');
}

// ---- The catalogue resolve carries the version stamp; identity derives ----
{
  const catalogue = { cities: [{ name: 'Vaughan', slug: 'vaughan', bbox: [43.7, -79.6, 44.0, -79.3], generatedAt: '2026-11-06T17:24:53Z' }] };
  const ctx = vm.createContext({ setTimeout, clearTimeout });
  vm.runInContext(`
let crPackIndexP = null, crPackIndexKnown = false;
const __catalogue = ${JSON.stringify(catalogue)};
function fetch(url) { return Promise.resolve({ ok: true, json: () => Promise.resolve(__catalogue) }); }
`, ctx);
  vm.runInContext(slugOkSrc + '\n' + indexLoadSrc + '\n' + resolveSrc + '\n' + dsIdSrc, ctx);
  const out = await vm.runInContext(`(async () => {
    const pk = await crPackResolveCity('Vaughan', ${JSON.stringify(BOX)});
    const none = await crPackResolveCity('Nowhere', ${JSON.stringify(BOX)});
    return { pk, known: crPackIndexKnown, idForPack: crDatasetId(pk), idForNone: crDatasetId(none) };
  })()`, ctx);
  check('resolve: a pack hit carries its version stamp', !!out.pk && out.pk.gen === '2026-11-06T17:24:53Z', JSON.stringify(out.pk));
  check('identity: a pack city is pack:<slug>@<stamp>', out.idForPack === 'pack:vaughan@2026-11-06T17:24:53Z', out.idForPack);
  check('identity: an answered catalogue with no pack means the service dataset', out.known === true && out.idForNone === 'overpass', 'known=' + out.known + ' id=' + out.idForNone);
}
{
  const ctx = vm.createContext({ setTimeout, clearTimeout });
  vm.runInContext(`
let crPackIndexP = null, crPackIndexKnown = false;
function fetch(url) { return Promise.reject(new Error('offline')); }
`, ctx);
  vm.runInContext(slugOkSrc + '\n' + indexLoadSrc + '\n' + resolveSrc + '\n' + dsIdSrc, ctx);
  const out = await vm.runInContext(`(async () => {
    const pk = await crPackResolveCity('Vaughan', ${JSON.stringify(BOX)});
    return { pk, known: crPackIndexKnown, id: crDatasetId(pk) };
  })()`, ctx);
  check('identity: a silent catalogue states NO identity (box-only judging, offline restore intact)', out.pk === null && out.known === false && out.id === null, JSON.stringify(out));
}

// ---- Queued writes are judged against the record under them ----
{
  const ctx = vm.createContext({});
  vm.runInContext(`
const __store = new Map();
let crSession = 7, crCacheQueue = Promise.resolve(), crCacheNote = '', crCacheNoteCity = '', crCacheNoteSession = 0;
const CR_TIMING = { cityCapBytes: 10000000 };
async function crIdbGet(name) { return __store.has(name) ? __store.get(name) : null; }
async function crIdbPut(rec) { __store.set(rec.cityName, rec); return true; }
function crCacheDisclose() { throw new Error('disclose must not fire in this proof'); }
`, ctx);
  vm.runInContext(fitsSrc + '\n' + saveSrc, ctx);
  const W = [[-1, 'Alpha St', [[43.8, -79.5], [43.81, -79.49]]]];
  const run = (expr) => vm.runInContext(expr, ctx);
  await run(`crCacheSaveCell('Vaughan', ${JSON.stringify(BOX)}, 4, 'r0c0', ${JSON.stringify(W)}, 'pack:vaughan@G1')`);
  let rec = await run(`crIdbGet('Vaughan')`);
  check('write: a fresh record is stamped with its dataset', !!rec && rec.ds === 'pack:vaughan@G1' && !!rec.cells.r0c0, JSON.stringify(rec && rec.ds));
  await run(`crCacheSaveCell('Vaughan', ${JSON.stringify(BOX)}, 4, 'r0c1', ${JSON.stringify(W)}, 'pack:vaughan@G2')`);
  rec = await run(`crIdbGet('Vaughan')`);
  check('write: a queued write from a republished pack starts the record over', !!rec && rec.ds === 'pack:vaughan@G2' && !rec.cells.r0c0 && !!rec.cells.r0c1, 'cells: ' + JSON.stringify(rec && Object.keys(rec.cells)));
  await run(`crCacheSaveCell('Vaughan', ${JSON.stringify(BOX)}, 4, 'r0c2', ${JSON.stringify(W)}, 'pack:vaughan@G2')`);
  rec = await run(`crIdbGet('Vaughan')`);
  check('write: a same-dataset write merges into the record', !!rec && !!rec.cells.r0c1 && !!rec.cells.r0c2, 'cells: ' + JSON.stringify(rec && Object.keys(rec.cells)));
  await run(`__store.set('Legacy', { cityName: 'Legacy', bbox: ${JSON.stringify(BOX)}, cells: { r0c0: { at: 1, ways: [] } }, savedAt: 1, totalCells: 4 })`);
  await run(`crCacheSaveCell('Legacy', ${JSON.stringify(BOX)}, 4, 'r0c1', ${JSON.stringify(W)}, 'overpass')`);
  rec = await run(`crIdbGet('Legacy')`);
  check('write: a pre-1.251 record merges and gains the stamp on its first fitting write', !!rec && !!rec.cells.r0c0 && !!rec.cells.r0c1 && rec.ds === 'overpass', JSON.stringify(rec && { cells: Object.keys(rec.cells), ds: rec.ds }));
  await run(`crCacheSaveCell('Legacy', ${JSON.stringify(BOX2)}, 4, 'r0c2', ${JSON.stringify(W)}, 'overpass')`);
  rec = await run(`crIdbGet('Legacy')`);
  check('write: a different box still starts the record over (the old guard, via the one test)', !!rec && !rec.cells.r0c0 && !!rec.cells.r0c2, 'cells: ' + JSON.stringify(rec && Object.keys(rec.cells)));
}

// ---- The duplication is gone: one test, both call sites ----
{
  const inline = (cacheSrc.match(/rec\.bbox\.s !== bbox\.s/g) || []).length;
  check('structure: the inline box compare survives ONLY inside crCacheRecFits', inline === 1, 'occurrences: ' + inline);
  const calls = (cacheSrc.match(/crCacheRecFits\(rec, bbox/g) || []).length;
  check('structure: crCacheRecFits is defined once and called at BOTH former copy sites', calls === 3, 'occurrences: ' + calls);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
