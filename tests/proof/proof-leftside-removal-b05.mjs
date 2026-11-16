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
// LEFTBIT is a different, LIVE variable and is NOT touched: checks 4-6
// pin its declaration, its write and its read verbatim. (Its read -
// `const leftOff = LEFTBIT[n] === 0 ? ...` - sits inside the block the
// LEFTSIDE assignment was removed from; the block's remaining lines are
// retained byte-identical by design.)
//
// Geometry identity: GEO/LEFTBIT are closure-private inside GLP, so the
// geometry's observable outputs are the paint sources the engine emits.
// Checks 7-8 drive the shipped engine over a synthetic three-street
// network (the mergeStrands proof's network) in two board states and
// pin canonical sha256 hashes of ALL eleven paint sources. The hashes
// were computed on the UNMODIFIED Beta 1.215 engine; the fixed engine
// must reproduce them exactly - the removal changes no geometry.
//
// On unmodified main checks 1-3 FAIL and 4-8 pass; with the removal all
// eight pass.

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
check('LEFTBIT declaration stands alone: const LEFTBIT = {};', engine.includes('const LEFTBIT = {};'));
check('LEFTBIT write verbatim', engine.includes('LEFTBIT[n] = canonicalForward ? 0 : 1;   // bit 0 is the left of the stitched direction'));
check('LEFTBIT read verbatim', engine.includes('const leftOff = LEFTBIT[n] === 0 ? off0 : off1, mid = Math.floor(stitched.length / 2);'));

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
    activeRoute: { name: 'Proof' }, glHideLabels: () => {},
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
  return hash(Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v.data])));
}

check('geometry identity, state A (pieces 2/1/2 - 1/2/1 - 1/2/1): all paint sources byte-identical to the unmodified engine',
  sourcesHash({ LongAve: [2, 1, 2], NorthAve: [1, 2, 1], CrossSt: [1, 2, 1] }) === '9000324c67f493a9d1f49ae9c1c545e61a0c9a05ee0e8dffc01214a3f4cd343d');
check('geometry identity, state B (pieces 1/0/3 - 3/1/0 - 0/3/2): all paint sources byte-identical to the unmodified engine',
  sourcesHash({ LongAve: [1, 0, 3], NorthAve: [3, 1, 0], CrossSt: [0, 3, 2] }) === '4dbea0ea4a9743297e6aea716a172a085b17e235d63dd01d6e17c4194102b9ea');

process.exit(failed ? 1 : 0);
