// proof-topo-ends.mjs - Architecture programme #11, stage 3 (Beta 1.283).
// EVERY RUN END IS CLASSIFIED ONCE. Through Beta 1.282 the feather
// split's end rule was re-derived at every slice end: boundarySplit
// matched the street's end records by point (boundaryRecAt) and then
// re-checked the shared-vertex map to defend junctions, per slice, per
// build. TOPO (parts/engine.js) classifies every run end once at the
// geometry build - 'junction' when another street shares the end
// vertex, 'feather' carrying the matched record, else 'end' - and
// boundarySplit reads the classification. Checks 1-2 pin the ownership
// shape; checks 3-4 run the REAL build over the shipped 5W pack (the
// real STRETCH, from app1's computeStretches extracted verbatim) and
// pin the census against the route's ground truth: 68 run ends = 53
// junction + 15 feather + 0 plain, every pack record claimed exactly
// once; check 5 grades boundarySplit's DECISIONS (the splitter itself
// is a recording stub - its geometry is proof-1259's and the feather
// drives') against the old rule re-derived independently per cut end.
// The mutation receipt for this file lives in
// tests/mutation-receipts.json.
// Run from the repo root:  node tests/proof/proof-topo-ends.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const engine = read('parts/engine.js');
const app1 = read('parts/app1.js');
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
function extract(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('extraction failed: ' + sig);
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); } }
  throw new Error('unbalanced ' + sig);
}

// ---------- 1: the classification's shape ----------
const topoAt = engine.indexOf('const TOPO = {');
const topoSrc = topoAt > -1 ? engine.slice(topoAt, engine.indexOf('\n};', topoAt) + 3) : '';
check('1a: TOPO declares the once-per-build classification and its reader',
  topoSrc.includes('classifyEnds()') && topoSrc.includes('endAt(n, vi)'));
check('1b: the geometry build classifies after seating and indexing',
  extractFn(engine, 'function buildEngineGeometry()').includes('TOPO.classifyEnds();'));

// ---------- 2: boundarySplit reads the classification, nothing else ----------
const bsSrc = extractFn(engine, 'function boundarySplit(n, ab, pts, kind, col, withCasing)');
check('2a: boundarySplit judges both ends through TOPO.endAt',
  bsSrc.includes('TOPO.endAt(n, atStart ? ab[0] : ab[1])') && bsSrc.includes("cls.kind !== 'feather'"));
check('2b: the per-slice re-derivation is gone from boundarySplit (no record scan, no vertex-map defence)',
  !bsSrc.includes('boundaryRecAt(') && !bsSrc.includes('TOPO.verts()') && !bsSrc.includes('coordKey('));
check('2c: boundaryRecAt survives only as the classification\'s record matcher (its definition plus exactly one call, in TOPO.classifyEnds)',
  (engine.match(/boundaryRecAt\(n,/g) || []).length === 2 && topoSrc.includes('boundaryRecAt(n, v)'));

// ---------- 3-5: the real build over the shipped pack ----------
const packs = vm.runInNewContext(data + '\n;ROUTE_PACKS;', {});
const pack = packs[0];
const mline = app1.match(/const MLAT = [0-9.]+, MLNG = [0-9.]+/)[0];
const factory = new Function(`
  ${mline};
  ${extract(app1, 'function distM(')}
  ${extract(app1, 'function segLenM(')}
  ${extract(app1, 'function stitchRuns(')}
  ${extract(app1, 'function projOnLine(')}
  ${extract(app1, 'function sliceLine(')}
  ${extract(app1, 'function finishJunctionCuts(')}
  ${extract(app1, 'function computeStretches(')}
  return { distM, computeStretches };`)();
const STRETCH = factory.computeStretches(pack.roads);
for (const n of Object.keys(pack.ends || {})) if (STRETCH[n] && pack.ends[n].length) STRETCH[n].ends = pack.ends[n];
const names = Object.keys(pack.roads);
const MLAT = Number(mline.match(/MLAT = ([0-9.]+)/)[1]), MLNG = Number(mline.match(/MLNG = ([0-9.]+)/)[1]);
const H = {
  names, STRETCH, ROADS: pack.roads, SPOT: pack.spot, PRIMARIES: new Set(pack.primaries), MLAT, MLNG,
  jDistM: factory.distM,
  ptSegM(p, a, b) { const px = p[1] * MLNG, py = p[0] * MLAT, ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)); return Math.hypot(px - (ax + t * vx), py - (ay + t * vy)); },
};
const line = s => engine.split('\n').find(l => l.startsWith(s));
const prelude = [
  line('const XYOf ='), line('const GJ ='), line('const WIDTH_K ='), line('const coordKey ='),
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
  extractFn(engine, 'function fadeMOf('),
  extractFn(engine, 'function boundaryRecAt('),
  'const splitCalls = [];',
  'const splitBoundaryEnd = (pts, join, atStart, fadeM) => { splitCalls.push([join[0], join[1], atStart, fadeM]); return { solid: pts, fade: null }; };',
  bsSrc,
].join('\n');
check('3a: the prelude carries the real build, the real owner and the real boundarySplit',
  prelude.includes('function buildEngineGeometry()') && prelude.includes('const TOPO = {') && prelude.includes('function boundarySplit('));
const out = vm.runInNewContext(prelude + `
  buildEngineGeometry();
  const res = { ends: 0, junction: 0, feather: 0, plain: 0, feathers: [], claimed: new Set(), nullBad: 0, splitBad: [] };
  const endVerts = new Set();
  for (const n of H.names) for (const r of TOPO.ranges(n)) { endVerts.add(n + '|' + r.start); endVerts.add(n + '|' + r.end); }
  for (const n of H.names) {
    const g = GEO[n];
    for (let vi = 0; vi < g.stitched.length; vi++) {
      const cls = TOPO.endAt(n, vi);
      if (!endVerts.has(n + '|' + vi)) { if (cls !== null) res.nullBad++; continue; }
      res.ends++;
      if (!cls) { res.nullBad++; continue; }
      if (cls.kind === 'junction') res.junction++;
      else if (cls.kind === 'feather') { res.feather++; res.feathers.push(n + '|' + (vi === TOPO.ranges(n).find(r => r.start === vi || r.end === vi).start ? 'S' : 'E') + '|fade' + cls.rec[4]); res.claimed.add(n + '|' + cls.rec[0] + ',' + cls.rec[1]); }
      else res.plain++;
    }
  }
  res.claimedCount = res.claimed.size;
  res.feathers.sort();
  // boundarySplit's decisions over every cut of every street, against
  // the old rule re-derived here: a cut end splits iff it is a run end
  // whose classification is feather (the stub records the splitter's
  // join and fade for each judged end)
  for (const n of H.names) {
    const g = GEO[n];
    g.cuts.forEach((ab, ci) => {
      splitCalls.length = 0;
      boundarySplit(n, ab, g.stitched.slice(ab[0], ab[1] + 1), 'c', 'k', false);
      const want = [];
      [[true, ab[0]], [false, ab[1]]].forEach(([atStart, vi]) => {
        const cls = TOPO.endAt(n, vi);
        if (cls && cls.kind === 'feather') want.push([cls.rec[2], cls.rec[3], atStart, fadeMOf(cls.rec)]);
      });
      if (JSON.stringify(splitCalls) !== JSON.stringify(want)) res.splitBad.push(n + ' cut ' + ci + ': got ' + JSON.stringify(splitCalls) + ' want ' + JSON.stringify(want));
    });
  }
  res;`, { H });
check('3b: the census is the ground truth - 68 run ends = 53 junction + 15 feather + 0 plain',
  out.ends === 68 && out.junction === 53 && out.feather === 15 && out.plain === 0);
check('3c: every pack record is claimed by exactly one feather end (15 of 15)',
  out.claimedCount === 15);
check('3d: the feathers are the named ends - 7 boundary at fade 15, the 8 dead ends at fade 10',
  JSON.stringify(out.feathers) === JSON.stringify(['Angie|E|fade10', 'Astona|E|fade15', 'Bayside|S|fade10', 'Boddy|E|fade10', 'Dianawood|S|fade10', 'Ferrari|S|fade10', 'Greenpark|E|fade15', 'Julian|E|fade10', 'Tina|E|fade10', 'Topper|E|fade10', 'Valeria|E|fade15', 'Valeria|S|fade15', 'Velmar|E|fade15', 'Velmar|S|fade15', 'Woolacott|E|fade15']));
check('4: TOPO.endAt is null at every non-run-end vertex and present at every run end',
  out.nullBad === 0);
check('5: boundarySplit splits exactly the feather ends, with each record\'s own join and fade length',
  out.splitBad.length === 0);

console.log(`proof-topo-ends: ${pass} passed, ${fail} failed`);
if (fail) { for (const m of (out && out.splitBad) || []) console.log('  splitBad:', m); }
process.exit(fail ? 1 : 0);
