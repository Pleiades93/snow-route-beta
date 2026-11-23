// proof-topo-vertices.mjs - Architecture programme #11, stage 2 (Beta 1.283).
// THE SHARED-VERTEX INDEX HAS ONE OWNER. Through Beta 1.282 the index of
// which streets meet at which stitched vertex was built three times:
// buildJunctions' local map, junctionPairs' per-call rebuild, and the
// memoized sharedVertexMap whose hand invalidation (null the memo in the
// geometry build) was the 1.117 lesson. TOPO (parts/engine.js) owns it
// now: the index accumulates as buildEngineGeometry seats each street,
// in the same H.names x stitched order all three copies used, and every
// consumer (buildJunctions, junctionPairs, throughOK, the strand
// builders, the boundary defence) reads TOPO.verts / TOPO.at. Checks
// 1-2 pin the ownership shape; checks 3-5 run the REAL build over the
// shipped 5W pack's roads (the proof-topo-ranges fixture: three streets
// split into two runs, one synthetic three-run street) and grade the
// index against an INDEPENDENT derivation from GEO, then grade the real
// buildJunctions' JUNC against the same derivation carried through the
// junction rule - contents and per-street entry order alike, because
// JUNC's consumers .find over its lists. The mutation receipt for this
// file lives in tests/mutation-receipts.json.
// Run from the repo root:  node tests/proof/proof-topo-vertices.mjs
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

// ---------- 1: the three hand-built copies are gone as code ----------
check('1a: the memoized map and its invalidation are retired (no declaration, no memo, no nulling)',
  !engine.includes('function sharedVertexMap(') && !engine.includes('let SVMAP') && !engine.includes('SVMAP = {}') && !engine.includes('SVMAP = null'));
check('1b: no hand-rolled index construction survives (the H.names x stitched accumulation line exists only inside TOPO.index)',
  count(engine, '(at[k] = at[k] || []).push') === 0 && count(engine, 'H.names.forEach(n => GEO[n].stitched.forEach((pt, vi)') === 0);

// ---------- 2: the owner and its readers ----------
const topoAt = engine.indexOf('const TOPO = {');
const topoSrc = topoAt > -1 ? engine.slice(topoAt, engine.indexOf('\n};', topoAt) + 3) : '';
check('2a: TOPO declares the index accumulation and both readers',
  topoSrc.includes('index(n, stitched)') && topoSrc.includes('verts()') && topoSrc.includes('at(key)'));
check('2b: the geometry build accumulates the index as it seats each street',
  extractFn(engine, 'function buildEngineGeometry()').includes('TOPO.index(n, stitched);'));
check('2c: buildJunctions and junctionPairs derive from the owner (no local map)',
  extractFn(engine, 'function buildJunctions()').includes('const at = TOPO.verts();') && extractFn(engine, 'function junctionPairs()').includes('const at = TOPO.verts();'));
check('2d: the point readers read TOPO.at (throughOK, clipEndAtJunction, clipStrandEnds)',
  count(engine, 'TOPO.at(coordKey(') === 2 && engine.includes('TOPO.at(vKey)'));

// ---------- 3-5: the real build, graded against an independent index ----------
const packs = vm.runInNewContext(data + '\n;ROUTE_PACKS;', {});
const pack = packs[0];
const ROADS = pack.roads;
const chainOf = segs => { const out = []; segs.forEach((sg, i) => { out.push(...(i === 0 ? sg : sg.slice(1))); }); return out; };
const SPLIT = ['Dianawood', 'Santa Barbara', 'Blackburn'];
const STRETCH = {};
for (const n of Object.keys(ROADS)) {
  const chain = chainOf(ROADS[n]);
  if (SPLIT.includes(n)) {
    const a = Math.floor(chain.length * 0.4), b = Math.floor(chain.length * 0.6);
    STRETCH[n] = { runs: [{ parts: [chain.slice(0, a)] }, { parts: [chain.slice(b)] }] };
  } else STRETCH[n] = { runs: [{ parts: [chain] }] };
}
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
const line = starts => engine.split('\n').find(l => l.startsWith(starts));
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
  extractFn(engine, 'function buildJunctions()'),
].join('\n');
check('3a: the prelude carries the real build, the real owner and the real buildJunctions',
  prelude.includes('function buildEngineGeometry()') && prelude.includes('const TOPO = {') && prelude.includes('function buildJunctions()'));
const out = vm.runInNewContext(prelude + `
  buildEngineGeometry();
  const res = { mismatches: [], keys: 0, entries: 0, sharedKeys: 0, totalVerts: 0, juncBad: [], juncEntries: 0 };
  // the independent index: built here, from GEO alone, in build order
  const want = {};
  for (const n of H.names) GEO[n].stitched.forEach((p, vi) => { const k = coordKey(p); (want[k] = want[k] || []).push({ n, vi }); res.totalVerts++; });
  const got = TOPO.verts();
  const wk = Object.keys(want), gk = Object.keys(got);
  res.keys = wk.length; res.entries = Object.values(got).reduce((s, l) => s + l.length, 0);
  if (JSON.stringify(wk) !== JSON.stringify(gk)) res.mismatches.push('key set/order differs: want ' + wk.length + ' keys, got ' + gk.length);
  for (const k of wk) {
    const a = want[k], b = got[k] || [];
    if (a.length !== b.length || a.some((e, i) => e.n !== b[i].n || e.vi !== b[i].vi)) res.mismatches.push('entries differ at ' + k);
    if (new Set(a.map(e => e.n)).size >= 2) res.sharedKeys++;
    // TOPO.at reads the same list back
    const at = TOPO.at(k);
    if (at.length !== a.length || at.some((e, i) => e.n !== a[i].n || e.vi !== a[i].vi)) res.mismatches.push('TOPO.at differs at ' + k);
  }
  if (TOPO.at('0.0000000,0.0000000').length !== 0) res.mismatches.push('TOPO.at of an unshared point is not empty');
  // JUNC, derived by the real buildJunctions from TOPO's index, against
  // the same junction rule carried over the independent index (the
  // direction window is TOPO.win's - stage 1's proven predicate)
  buildJunctions();
  const dirAt = (n, vi) => { const st = GEO[n].stitched; const [lo, hi] = TOPO.win(n, vi, st.length); const a = XYOf(st[lo]), b = XYOf(st[hi]); const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m]; };
  const wantJ = {}; H.names.forEach(n => { wantJ[n] = []; });
  Object.values(want).forEach(list => {
    if (new Set(list.map(e => e.n)).size < 2) return;
    list.forEach(A => list.forEach(B => {
      if (A.n === B.n) return;
      const dA = dirAt(A.n, A.vi), dB = dirAt(B.n, B.vi);
      wantJ[A.n].push({ B: B.n, viA: A.vi, V: GEO[A.n].stitched[A.vi], dB, nB: [-dB[1], dB[0]], sin: Math.abs(dA[0] * dB[1] - dA[1] * dB[0]) });
    }));
  });
  for (const n of H.names) {
    const a = wantJ[n], b = JUNC[n] || [];
    res.juncEntries += b.length;
    if (a.length !== b.length) { res.juncBad.push(n + ': ' + a.length + ' want vs ' + b.length + ' got'); continue; }
    a.forEach((e, i) => {
      const g = b[i];
      const near = (x, y) => Math.abs(x - y) < 1e-9;
      if (e.B !== g.B || e.viA !== g.viA || e.V[0] !== g.V[0] || e.V[1] !== g.V[1] || !near(e.sin, g.sin) || !near(e.dB[0], g.dB[0]) || !near(e.dB[1], g.dB[1]) || !near(e.nB[0], g.nB[0]) || !near(e.nB[1], g.nB[1])) res.juncBad.push(n + ' entry ' + i);
    });
  }
  // a rebuild with a smaller route clears the index with the geometry
  H.names = ['Velmar']; buildEngineGeometry();
  const after = TOPO.verts();
  res.afterRebuild = [Object.values(after).every(l => l.every(e => e.n === 'Velmar')), Object.keys(after).length > 0, TOPO.at(Object.keys(want)[0]).length];
  res;`, { H });
check('3b: TOPO\'s index equals the independent derivation exactly - every key, every entry, in build order',
  out.mismatches.length === 0);
check('3c: the index census - every stitched vertex is indexed exactly once (' + out.entries + ' entries over ' + out.keys + ' keys, ' + out.sharedKeys + ' shared)',
  out.entries === out.totalVerts && out.sharedKeys > 0);
check('4: JUNC derived from TOPO\'s index equals JUNC derived from the independent index - contents and per-street order (' + out.juncEntries + ' entries)',
  out.juncBad.length === 0 && out.juncEntries > 0);
check('5: a rebuild clears the index with the geometry (only the new route\'s vertices remain)',
  JSON.stringify(out.afterRebuild.slice(0, 2)) === JSON.stringify([true, true]));

console.log(`proof-topo-vertices: ${pass} passed, ${fail} failed`);
if (fail) { for (const m of (out && out.mismatches) || []) console.log('  mismatch:', m); for (const m of ((out && out.juncBad) || []).slice(0, 10)) console.log('  juncBad:', m); }
process.exit(fail ? 1 : 0);
