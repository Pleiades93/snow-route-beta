// proof-topo-ranges.mjs - Architecture programme #11, stage 1 (Beta 1.283).
// THE RUN STRUCTURE HAS ONE OWNER. Through Beta 1.282 the route's run
// structure (which vertices of a street's stitched line belong to which
// run) survived the geometry build only as a bare per-street Set of the
// vertex indices where later runs start, and 25 sites across the engine
// re-derived what that set MEANS: a real segment vs the bridge between
// two runs, a run-interior vertex, the direction window clamped at a
// run's ends (the clamp written out twice, verbatim, in buildJunctions'
// dirAt and mergeStrands' dirLL). TOPO (parts/engine.js) owns it now:
// buildEngineGeometry seats each street's run ranges as it concatenates
// the runs, and every consumer reads the owner's predicates (runStart,
// segReal, interior, win). Checks 1-2 pin the ownership shape; checks
// 3-5 run the REAL buildEngineGeometry (extracted verbatim, with the
// real TOPO) over the shipped 5W pack's roads - three streets split
// into two runs each over their real coordinates, plus one synthetic
// three-run street - and grade TOPO against an INDEPENDENT derivation:
// the run starts implied by GEO's cuts (a cut opens a new run exactly
// where its start vertex does not continue the previous cut's end -
// the cuts arithmetic this stage did not touch). The mutation receipt
// for this file lives in tests/mutation-receipts.json.
// Run from the repo root:  node tests/proof/proof-topo-ranges.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const engine = read('parts/engine.js');
const data = read('parts/data.js');

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
const count = (hay, needle) => hay.split(needle).length - 1;

// ---------- 1: the gap set is gone as code; the owner and its seats ----------
check('1a: no operative gap-set read survives in the engine (no .gaps field read, no gap-set test)',
  !engine.includes('.gaps') && !engine.includes('gaps.has(') && !engine.includes('gaps:'));
check('1b: the GEO record no longer carries the set - the geometry literal is the six fields',
  extractFn(engine, 'function buildEngineGeometry()').includes('GEO[n] = { stitched, cuts, off0, off1, offH0, offH1 };'));
const topoAt = engine.indexOf('const TOPO = {');
const topoSrc = topoAt > -1 ? engine.slice(topoAt, engine.indexOf('\n};', topoAt) + 3) : '';
check('1c: TOPO is declared with its seat, its reset and its four predicates',
  topoSrc.includes('seat(n, ranges)') && topoSrc.includes('reset()') && topoSrc.includes('runStart(n, k)') && topoSrc.includes('segReal(n, si)') && topoSrc.includes('interior(n, vi, len)') && topoSrc.includes('win(n, vi, len)'));
check('1d: the geometry build resets the table and seats every street as it builds',
  extractFn(engine, 'function buildEngineGeometry()').includes('TOPO.reset();') && extractFn(engine, 'function buildEngineGeometry()').includes('TOPO.seat(n, ranges);'));

// ---------- 2: every former gap site reads the owner ----------
check('2a: the direction-window clamp lives exactly once - both former copies (dirAt, dirLL) call TOPO.win',
  count(engine, 'TOPO.win(') === 2);
check('2b: the spans predicate lives exactly once - both former copies call TOPO.interior',
  count(engine, 'TOPO.interior(') === 2);
check('2c: the segment walks read TOPO.segReal (14 sites) and the run-boundary reads read TOPO.runStart (9 calls)',
  count(engine, 'TOPO.segReal(') === 14 && count(engine, 'TOPO.runStart(') === 9);

// ---------- 3-5: the real build, graded against the cuts derivation ----------
// The shipped 5W pack's roads, verbatim from parts/data.js.
const packs = vm.runInNewContext(data + '\n;ROUTE_PACKS;', {});
const pack = packs[0];
const ROADS = pack.roads;
const chainOf = segs => { const out = []; segs.forEach((sg, i) => { out.push(...(i === 0 ? sg : sg.slice(1))); }); return out; };
// Three real streets split into two runs over their real coordinates (the
// middle of the street left out - the non-adjacent-picks shape that makes
// a street multi-run in the first place); the rest run whole.
const SPLIT = ['Dianawood', 'Santa Barbara', 'Blackburn'];
const STRETCH = {};
for (const n of Object.keys(ROADS)) {
  const chain = chainOf(ROADS[n]);
  if (SPLIT.includes(n)) {
    const a = Math.floor(chain.length * 0.4), b = Math.floor(chain.length * 0.6);
    STRETCH[n] = { runs: [{ parts: [chain.slice(0, a)] }, { parts: [chain.slice(b)] }] };
  } else STRETCH[n] = { runs: [{ parts: [chain] }] };
}
// One synthetic three-run street: chained parts inside runs 1 and 3 (the
// shared-vertex path), a lone part in run 2.
const MLAT = 111132, MLNG = 82000, LAT0 = 43.8, LNG0 = -79.5;
const pt = (xM, yM) => [LAT0 + yM / MLAT, LNG0 + xM / MLNG];
const seg = (x0, y0, x1, y1) => { const pts = []; const m = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 20)); for (let k = 0; k <= m; k++) pts.push(pt(x0 + (x1 - x0) * k / m, y0 + (y1 - y0) * k / m)); return pts; };
STRETCH['MultiRun'] = { runs: [{ parts: [seg(0, 0, 50, 0), seg(50, 0, 100, 0)] }, { parts: [seg(200, 0, 260, 0)] }, { parts: [seg(300, 0, 340, 0), seg(340, 0, 390, 0)] }] };
ROADS['MultiRun'] = [seg(0, 0, 390, 0)];
const names = Object.keys(STRETCH);
const H = {
  names, STRETCH, ROADS, SPOT: pack.spot, PRIMARIES: new Set(pack.primaries), MLAT, MLNG,
  jDistM: (a, b) => Math.hypot((b[1] - a[1]) * MLNG, (b[0] - a[0]) * MLAT),
  ptSegM(p, a, b) { const px = p[1] * MLNG, py = p[0] * MLAT, ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)); return Math.hypot(px - (ax + t * vx), py - (ay + t * vy)); },
};
const xyLine = engine.split('\n').find(l => l.startsWith('const XYOf ='));
const gjLine = engine.split('\n').find(l => l.startsWith('const GJ ='));
const widthLine = engine.split('\n').find(l => l.startsWith('const WIDTH_K ='));
const coordLine = engine.split('\n').find(l => l.startsWith('const coordKey ='));   // Beta 1.283 (#11 stage 2): TOPO.index keys the shared-vertex index by coordKey
const prelude = [
  xyLine, gjLine, widthLine, coordLine,
  extractFn(engine, 'function segLenM('),
  extractFn(engine, 'function offsetLine('),
  'const GEO = {};', topoSrc, 'const LEFTBIT = {};',
  'const labelFeatures = [];', 'const labelPointFeatures = [];',
  'let JUNC = null;',
  'const ROUTEPOI = { type: \'Feature\', properties: {}, geometry: { type: \'Point\', coordinates: [0, 0] } };',
  'const HIT = { type: \'FeatureCollection\', features: [] };',
  extractFn(engine, 'function buildEngineGeometry()'),
  extractFn(engine, 'function nudgeFifth()'),
  extractFn(engine, 'function assignTiers()'),
  extractFn(engine, 'function assignAnchors('),   // label round: the geometry build ends with the anchor pass; the prelude carries it like its siblings
  extractFn(engine, 'function boundaryRecAt('),   // Beta 1.283 (#11 stage 3): the build ends by classifying run ends, and the classification's record matcher comes with it
].join('\n');
check('3a: the prelude carries the real build and the real owner',
  prelude.includes('function buildEngineGeometry()') && prelude.includes('const TOPO = {') && prelude.includes('function offsetLine('));
const out = vm.runInNewContext(prelude + `
  buildEngineGeometry();
  const res = { streets: 0, rangesTotal: 0, startsTotal: 0, mismatches: [], predChecks: 0, predBad: [] };
  for (const n of H.names) {
    res.streets++;
    const g = GEO[n], cuts = g.cuts, len = g.stitched.length;
    // the independent derivation: a cut opens a new run exactly where its
    // start vertex does not continue the previous cut's end vertex
    const derived = new Set();
    for (let j = 1; j < cuts.length; j++) if (cuts[j][0] > cuts[j - 1][1]) derived.add(cuts[j][0]);
    const ranges = TOPO.ranges(n);
    res.rangesTotal += ranges.length;
    const starts = new Set(ranges.slice(1).map(r => r.start));
    res.startsTotal += starts.size;
    if (ranges.length !== derived.size + 1 || ![...starts].every(s => derived.has(s)) || ![...derived].every(s => starts.has(s)))
      res.mismatches.push(n + ': ranges ' + JSON.stringify(ranges) + ' vs cuts-derived starts ' + JSON.stringify([...derived]));
    // the ranges chain over the cuts: each range is a maximal run of cuts
    // joined at shared vertices, and together they cover every cut once
    let ci = 0, chainBad = false;
    for (const r of ranges) {
      if (!cuts[ci] || cuts[ci][0] !== r.start) { chainBad = true; break; }
      while (ci < cuts.length && cuts[ci][1] <= r.end) { if (cuts[ci][1] === r.end) { ci++; break; } ci++; }
    }
    if (chainBad || ci !== cuts.length) res.mismatches.push(n + ': ranges do not chain over the cuts');
    // predicate agreement at every vertex and segment of the street
    for (let k = 0; k <= len; k++) { res.predChecks++; if (TOPO.runStart(n, k) !== derived.has(k)) res.predBad.push(n + ' runStart@' + k); }
    for (let si = 0; si + 1 < len; si++) { res.predChecks++; if (TOPO.segReal(n, si) === derived.has(si + 1)) res.predBad.push(n + ' segReal@' + si); }
    for (let vi = 0; vi < len; vi++) {
      res.predChecks++;
      const wantIn = vi > 0 && vi < len - 1 && !derived.has(vi) && !derived.has(vi + 1);
      if (TOPO.interior(n, vi, len) !== wantIn) res.predBad.push(n + ' interior@' + vi);
      const wantWin = [derived.has(vi) ? vi : Math.max(0, vi - 1), derived.has(vi + 1) ? vi : Math.min(len - 1, vi + 1)];
      const gotWin = TOPO.win(n, vi, len);
      if (gotWin[0] !== wantWin[0] || gotWin[1] !== wantWin[1]) res.predBad.push(n + ' win@' + vi);
    }
  }
  // an unseated street reads as one implicit run (no consumer iterates one,
  // but the contract is pinned): no run starts, every segment real
  res.unknown = [TOPO.ranges('NoSuchStreet').length, TOPO.runStart('NoSuchStreet', 3), TOPO.segReal('NoSuchStreet', 3)];
  // a rebuild with a smaller route clears the old streets' structure
  H.names = ['Velmar']; buildEngineGeometry();
  res.afterRebuild = [TOPO.ranges('Dianawood').length, TOPO.runStart('Dianawood', 5), 'Dianawood' in GEO, TOPO.ranges('Velmar').length];
  res;`, { H });
check('3b: the build ran over the shipped pack (34 streets) plus the synthetic street', out.streets === 35);
check('3c: TOPO\'s ranges reconstruct exactly the run starts the cuts imply, on every street',
  out.mismatches.length === 0);
check('3d: the range census - 40 ranges, 5 later-run starts (3 split streets x 1, MultiRun x 2)',
  out.rangesTotal === 40 && out.startsTotal === 5);
check('4: every predicate agrees with the cuts-derived set at every vertex and segment (' + out.predChecks + ' readings)',
  out.predBad.length === 0);
check('5a: an unseated street reads as one implicit run', JSON.stringify(out.unknown) === JSON.stringify([0, false, true]));
check('5b: a rebuild clears the previous route\'s structure (no stale street survives in TOPO or GEO)',
  JSON.stringify(out.afterRebuild) === JSON.stringify([0, false, false, 1]));

console.log(`proof-topo-ranges: ${pass} passed, ${fail} failed`);
if (fail) { for (const m of (out && out.mismatches) || []) console.log('  mismatch:', m); for (const m of ((out && out.predBad) || []).slice(0, 10)) console.log('  predBad:', m); }
process.exit(fail ? 1 : 0);
