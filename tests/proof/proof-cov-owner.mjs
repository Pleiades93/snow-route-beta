// proof-cov-owner.mjs - Section 1 step 5 (Architecture #17, Beta 1.281).
// THE COVERAGE RECORD HAS AN OWNER, AND POINT CLEANING HAS ONE BODY.
// Through Beta 1.280 two kinds of duplication sat in the coverage machinery:
// (1) the point normalisation (1e7 rounding, drop a point within 0.1 m of
// the last kept one) was spelled out twice - in crIndexWays for fetched
// geometry and again in crCleanPts for stored pairs, whose own header said
// it "mirrors" the other; (2) the cache restore in create-cache.js wrote
// the coverage record's byId and boxes DIRECTLY, beside crCovMerge, the
// record's one composing function. Now crCleanPtPush (parts/create-citydata.js)
// is the one normalisation both cleaners call, and the record's mutations
// are crCovFold (validated ways + one answered box land; nothing else
// happens) and crCovReindex (the byName rebuild), with crCovMerge composing
// them for a single answered extract. The A-02 discipline is preserved
// exactly: the restore folds per cell through crCovFold, and the reindex +
// search refresh still land ONCE, after its loop (proof-1254 check 9 pins
// that textually, including the fold body's purity). This proof grades the
// behaviour: the two cleaners agree point-for-point on the same road, each
// keeps its own admission rules, and the fold/reindex/merge sequence lands
// the same record the direct writes used to.
// Run from the repo root:  node tests/proof/proof-cov-owner.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const app1 = read('parts/app1.js');
const citydata = read('parts/create-citydata.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

function extractFn(src, header) {
  const at = src.indexOf(header);
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0, str = null, esc = false, line = false, block = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === str) str = null; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { str = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return '';
}

// ---------- 1-2: one normalisation body, called by both cleaners ----------
const pushFn = extractFn(citydata, 'function crCleanPtPush(');
check('1a: crCleanPtPush exists in create-citydata.js and holds the 1e7 rounding + 0.1 m rule',
  !!pushFn && pushFn.includes('Math.round(lat * 1e7) / 1e7') && pushFn.includes('> 0.1'));
check('1b: crIndexWays calls the shared normalisation and no longer rounds inline',
  extractFn(citydata, 'function crIndexWays(').includes('crCleanPtPush(pts, g.lat, g.lon)')
  && !extractFn(citydata, 'function crIndexWays(').includes('Math.round'));
check('1c: crCleanPts calls the shared normalisation and no longer rounds inline',
  extractFn(citydata, 'function crCleanPts(').includes('crCleanPtPush(pts, gp[0], gp[1])')
  && !extractFn(citydata, 'function crCleanPts(').includes('Math.round'));
check('2: the restore in create-cache.js writes the record only through the owner (no direct byId/boxes writes left)',
  !read('parts/create-cache.js').includes('crCov.byId[id] = byId[id]')
  && !read('parts/create-cache.js').includes('crCov.boxes.push(cell.box)')
  && read('parts/create-cache.js').includes('crCovFold(byId, cell.box);'));

// ---------- 3-5: the cleaners' behaviour, run for real ----------
const prelude = [
  (app1.split('\n').find((l) => l.startsWith('const MLAT')) || ''),
  extractFn(app1, 'function distM('),
  'let crCov = null; let crCovGen = 0; let refreshCount = 0;',
  'function crRefreshSearch() { refreshCount++; }',
  pushFn,
  extractFn(citydata, 'function crIndexWays('),
  extractFn(citydata, 'function crCleanPts('),
  extractFn(citydata, 'function crCovFromWays('),
  extractFn(citydata, 'function crCovEnsure()'),
  extractFn(citydata, 'function crCovFold('),
  extractFn(citydata, 'function crCovReindex()'),
  extractFn(citydata, 'function crCovMerge('),
].join('\n');
check('3a: the prelude extracted whole', prelude.includes('crCovFold') && prelude.includes('crCleanPtPush') && prelude.includes('distM'));

const clean = vm.runInNewContext(prelude + `
  const els = [
    { type: 'way', id: 1, tags: { name: 'A St' }, geometry: [ { lat: 43.80000004, lon: -79.50000003 }, { lat: 43.8000001, lon: -79.5000001 }, { lat: 43.801, lon: -79.501 } ] },
    { type: 'way', id: 2, tags: { name: 'B St' }, geometry: [ { lat: 43.81, lon: -79.51 }, { lat: 43.8100001, lon: -79.5100001 } ] },
    { type: 'node', id: 3, tags: { name: 'C St' }, geometry: [ { lat: 43.82, lon: -79.52 }, { lat: 43.821, lon: -79.521 } ] },
    { type: 'way', id: 4, tags: { name: '' }, geometry: [ { lat: 43.83, lon: -79.53 }, { lat: 43.831, lon: -79.531 } ] },
  ];
  const byId = crIndexWays(els, Object.create(null));
  const stored = crCleanPts([[43.80000004, -79.50000003], [43.8000001, -79.5000001], [43.801, -79.501]]);
  const poisoned = crCleanPts([[NaN, -79.5], [43.8, -79.5], [91, 0], [43.801, -79.501], 'junk', [43.802]]);
  const collapsed = crCleanPts([[43.81, -79.51], [43.8100001, -79.5100001]]);
  ({ byId, stored, poisoned, collapsed });`, {});
check('3b: crIndexWays keeps the honest way, drops the sub-0.1 m duplicate, rounds to 1e7',
  !!clean.byId[1] && JSON.stringify(clean.byId[1].pts) === JSON.stringify([[43.8, -79.5], [43.801, -79.501]]));
check('3c: a way whose points collapse to one is not indexed; nodes and nameless ways are skipped',
  !clean.byId[2] && !clean.byId[3] && !clean.byId[4]);
check('4a: crCleanPts on the same road returns the identical points (the unification equivalence)',
  JSON.stringify(clean.stored) === JSON.stringify(clean.byId[1].pts));
check('4b: crCleanPts keeps its own admission rules - NaN / out-of-range / malformed pairs are skipped, the way survives on its valid points',
  JSON.stringify(clean.poisoned) === JSON.stringify([[43.8, -79.5], [43.801, -79.501]]));
check('4c: crCleanPts still refuses a list that cleans to fewer than 2 points', clean.collapsed === null);

// ---------- 6: fold / reindex / merge land the record, in the A-02 order ----------
const cov = vm.runInNewContext(prelude + `
  const P = [[43.8, -79.5], [43.801, -79.501]];
  const boxB = { s: 43.7, w: -79.6, n: 43.9, e: -79.4 };
  const boxC = { s: 43.9, w: -79.6, n: 44.1, e: -79.4 };
  crCovFold({ 1: { name: 'A St', pts: P } }, boxB);
  const afterFold1 = { byId: Object.keys(crCov.byId).length, boxes: crCov.boxes.length, byName: Object.keys(crCov.byName).length, refresh: refreshCount };
  crCovFold({ 2: { name: 'A St', pts: P } }, boxB);
  const afterFold2 = { byId: Object.keys(crCov.byId).length, boxes: crCov.boxes.length, byName: Object.keys(crCov.byName).length, refresh: refreshCount };
  crCovReindex();
  const afterReindex = { aWays: (crCov.byName['A St'] || []).length, refresh: refreshCount };
  crCovMerge([{ type: 'way', id: 3, tags: { name: 'B St' }, geometry: [ { lat: 43.95, lon: -79.55 }, { lat: 43.951, lon: -79.551 } ] }], boxC);
  const afterMerge = { byId: Object.keys(crCov.byId).length, boxes: crCov.boxes.length, bWays: (crCov.byName['B St'] || []).length, refresh: refreshCount };
  ({ afterFold1, afterFold2, afterReindex, afterMerge });`, {});
check('6a: a fold lands ways + box and does NOT reindex or refresh (the A-02 discipline, inside the owner)',
  cov.afterFold1.byId === 1 && cov.afterFold1.boxes === 1 && cov.afterFold1.byName === 0 && cov.afterFold1.refresh === 0);
check('6b: a second fold of the same box dedupes the box and still does not reindex',
  cov.afterFold2.byId === 2 && cov.afterFold2.boxes === 1 && cov.afterFold2.byName === 0);
check('6c: the reindex rebuilds byName from byId, once, without a refresh',
  cov.afterReindex.aWays === 2 && cov.afterReindex.refresh === 0);
check('6d: a merge folds the extract, joins its box, reindexes and refreshes exactly once',
  cov.afterMerge.byId === 3 && cov.afterMerge.boxes === 2 && cov.afterMerge.bWays === 1 && cov.afterMerge.refresh === 1);

console.log(`proof-cov-owner: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
