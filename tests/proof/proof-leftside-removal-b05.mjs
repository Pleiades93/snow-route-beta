import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

// LEFTSIDE removal proof (B-05 closure, 2026-11-16).
//
// B-05 (Graphify audit round, 2026-11-14, Andrew approved): LEFTSIDE in
// parts/engine.js was written-never-read dead state - a census of the
// whole repo found its declaration, two write sites (the rebuild clear
// loop and the per-street assignment in buildEngineGeometry) and NO
// reader anywhere. The removal deletes the declaration, both writes and
// the comment mentions, so the assembled app carries no LEFTSIDE string.
//
// LEFTBIT was a different, LIVE variable and was NOT touched by the
// B-05 removal: checks 4-6 then pinned its declaration, its write and
// its read verbatim. (Its read - `const leftOff = LEFTBIT[n] === 0 ?
// ...` - sat inside the block the LEFTSIDE assignment was removed
// from.)
//
// Beta 1.258 addendum (2026-11-20): LEFTBIT's ONLY reader was that
// leftOff line, which computed the street-title anchor's offset. The
// title system retired in 1.258, leaving LEFTBIT written-never-read -
// B-05's own defect - so it retired in the same round (declaration,
// the rebuild clear loop and the write, with its canonicalForward
// helper). Checks 4-6 now pin its ABSENCE, mirroring checks 1-3.
//
// Geometry identity: GEO is closure-private inside GLP, so the
// geometry's observable outputs are the paint sources the engine
// emits. Checks 7-8 drive the shipped engine over a synthetic
// three-street network (the mergeStrands proof's network) in two
// board states and pin canonical sha256 hashes of the paint sources.
// The 1.215-era pins covered ALL eleven sources; the 1.258 pins cover
// the TEN that remain and were DERIVED, not re-measured blind: hashing
// the unmodified 1.257 engine's sources with labelpts excluded gives
// exactly these values, and every surviving source's individual hash
// is unchanged - the retirement removes one source and changes no
// paint geometry byte.
//
// Beta 1.259 addendum (2026-11-20): the road-end feather adds two paint
// sources (fades, selFades) to the engine. Over this synthetic network
// they are EMPTY by construction - the fixture streets carry no boundary
// 'ends' records, so the feather is inert and no paint geometry byte
// changes. Checks 7-8 keep their 1.258 pins over the same ten sources
// (the fade sources excluded from the hash, by the same derivation the
// 1.258 addendum used for labelpts), and checks 9-10 pin the new
// invariant directly: the fade sources exist and carry no features in
// either state - no ends, no fades, geometry untouched.
//
// On unmodified main checks 1-3 FAIL and 4-8 pass; with the removal all
// eight pass. (On the 1.257 tree checks 4-8 now fail by design: LEFTBIT
// stands there and the labelpts source still exists.)

const engine = readFileSync('parts/engine.js', 'utf8');
const assembled = readFileSync('index.html', 'utf8');
const source = readFileSync('src/tracker-source.html', 'utf8');

let failed = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`PASS: ${label}`);
  else { failed++; console.log(`FAIL: ${label}${detail ? ' — ' + detail : ''}`); }
}

check('LEFTSIDE absent from parts/engine.js', !engine.includes('LEFTSIDE'));
check('LEFTSIDE absent from the assembled index.html', !assembled.includes('LEFTSIDE'));
check('LEFTSIDE absent from src/tracker-source.html', !source.includes('LEFTSIDE'));
check('LEFTBIT absent from parts/engine.js (Beta 1.258: written-never-read after the title retirement)', !engine.includes('LEFTBIT'));
check('LEFTBIT absent from the assembled index.html', !assembled.includes('LEFTBIT'));
check('LEFTBIT absent from src/tracker-source.html', !source.includes('LEFTBIT'));

// --- geometry identity over the synthetic network, two board states ---
const MLAT = 111132, MLNG = 82000;
const LAT0 = 43.8, LNG0 = -79.5;
const pt = (xM, yM) => [LAT0 + yM / MLAT, LNG0 + xM / MLNG];
const seg = (x0, y0, x1, y1) => {
  const pts = [];
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 20));
  for (let k = 0; k <= n; k++) pts.push(pt(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n));
  return pts;
};
const STRETCH = {
  LongAve: { runs: [{ parts: [seg(-120, 0, 0, 0), seg(0, 0, 60, 0), seg(60, 0, 120, 0)] }] },
  NorthAve: { runs: [{ parts: [seg(-120, 60, 0, 60), seg(0, 60, 60, 60), seg(60, 60, 120, 60)] }] },
  CrossSt: { runs: [{ parts: [seg(0, -60, 0, 0), seg(0, 0, 0, 60), seg(0, 60, 0, 120)] }] },
};
const names = Object.keys(STRETCH);

function canon(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(Math.round(v * 1e9) / 1e9);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(String(v));
}
const hash = o => createHash('sha256').update(canon(o)).digest('hex');

function sourcesHash(pieces) {
  const host = {
    PRIMARIES: new Set(), MLAT, MLNG,
    jDistM: (a, b) => Math.hypot((b[1] - a[1]) * MLNG, (b[0] - a[0]) * MLAT),
    ptSegM(p, a, b) {
      const px = p[1] * MLNG, py = p[0] * MLAT;
      const ax = a[1] * MLNG, ay = a[0] * MLAT;
      const bx = b[1] * MLNG, by = b[0] * MLAT;
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2));
      return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
    },
    names, STRETCH,
    ROADS: Object.fromEntries(names.map(n => [n, STRETCH[n].runs.flatMap(r => r.parts)])),
    SPOT: {}, pieces,
    selStretch: null, selSet: [], isNight: () => false,
    activeRoute: { name: 'Proof' }, glUnifyLabels: () => {},
  };
  const sources = {}, layers = [];
  const mockGLM = {
    getStyle: () => ({ layers }),
    getSource: id => sources[id],
    addSource: (id, spec) => { sources[id] = { data: spec.data, setData(d) { this.data = d; } }; },
    getLayer: id => layers.find(l => l.id === id),
    addLayer: l => { layers.push(l); },
    setLayerZoomRange: () => {}, setLayoutProperty: () => {}, setPaintProperty: () => {},
  };
  const ctx = { GL_HOST: host, window: {}, setInterval: () => 1, clearInterval: () => {} };
  vm.runInNewContext(engine, ctx);
  ctx.window.GLP.init(mockGLM, host);
  const byId = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v.data]));
  const ten = Object.fromEntries(Object.entries(byId).filter(([k]) => k !== 'fades' && k !== 'selFades'));
  const fadesEmpty = !!(byId.fades && byId.selFades && (byId.fades.features || []).length === 0 && (byId.selFades.features || []).length === 0);
  return { tenHash: hash(ten), fadesEmpty };
}

const stateA = sourcesHash({ LongAve: [2, 1, 2], NorthAve: [1, 2, 1], CrossSt: [1, 2, 1] });
const stateB = sourcesHash({ LongAve: [1, 0, 3], NorthAve: [3, 1, 0], CrossSt: [0, 3, 2] });
check('geometry identity, state A (pieces 2/1/2 - 1/2/1 - 1/2/1): the ten surviving paint sources byte-identical to the unmodified engine minus labelpts (Beta 1.258 derivation)',
  stateA.tenHash === '5db11af0bf1e7c77a97e77c595bd5615c62d82d1b8666edffce76e3578bb6fd9');
check('geometry identity, state B (pieces 1/0/3 - 3/1/0 - 0/3/2): the ten surviving paint sources byte-identical to the unmodified engine minus labelpts (Beta 1.258 derivation)',
  stateB.tenHash === '1cfd3e1d0acd5f0da3fa38cb5544ddb9fa387c8b0befb0e0f5c49a70ae6234b8');
check('Beta 1.259: the fade sources exist and are empty in state A (no boundary records in the fixture - the feather is inert)',
  stateA.fadesEmpty);
check('Beta 1.259: the fade sources exist and are empty in state B',
  stateB.fadesEmpty);

process.exit(failed ? 1 : 0);
