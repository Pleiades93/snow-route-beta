// proof-sync-perf.mjs - Beta 1.284 (issue #169).
// ONE MARK MUST NOT REBUILD THE WORLD. Through Beta 1.283 every mark
// ran GLP.sync over the whole board, and mergeStrands' greedy fixpoint
// rescanned every ordered pair of slices on every pass, building the
// merged geometry for every candidate though only one winner per pass
// is kept: ~150 ms per toggle on Route 5W and ~5.8 s on a 102-street
// pack (the audit's measurements). The fix indexes mergeStrands'
// candidate pairs by slice end (the winner rule is unchanged) and
// caches each street's centre/band/fill slices on its own pieces
// vector. Output equivalence over 729 board states (the round's
// harness, golden hashes from the pre-fix engine) is recorded in the
// mutation receipt; THIS proof pins the time bound on the big host:
// the shipped 5W pack tiled x3 (102 streets, 261 stretches), median
// of 15 single-mark flips, bound 1500 ms - the pre-fix engine's
// median on the same host and pattern measured 7293 ms on the
// round's rig (receipt: sync-perf-1284), so the bound carries ~10x
// headroom over the fixed engine and the pre-fix engine cannot meet
// it. Checks 1-2 are liveness: the timed syncs must be doing real
// work (a flip changes the painted sources), so a future no-op sync
// cannot pass the bound by doing nothing.
// Run from the repo root:  node tests/proof/proof-sync-perf.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
function extract(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('extraction failed: ' + sig);
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); } }
  throw new Error('unbalanced: ' + sig);
}

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---- the host: the shipped 5W pack, app1's geometry verbatim ----
const dataCtx = {};
vm.runInNewContext(read('parts/data.js') + '\n;globalThis.__RP = ROUTE_PACKS;', dataCtx);
const PACK5W = dataCtx.__RP[0];
const app1 = read('parts/app1.js');
const factory = new Function(`
  ${app1.match(/const MLAT = [0-9]+, MLNG = [0-9]+/)[0]};
  const ROADS = {}, REFERENCE = {}, STRETCH = {}, SPOT = {};
  const STREETNAMES = [], STREETSET = new Set(), PRIMARIES = new Set(), ROUTE_TILE_NAMES = [];
  let routeBox = null;
  function buildSamples() {}
  ${extract(app1, 'function distM(')}
  ${extract(app1, 'function segLenM(')}
  ${extract(app1, 'function stitchRuns(')}
  ${extract(app1, 'function projOnLine(')}
  ${extract(app1, 'function sliceLine(')}
  ${extract(app1, 'function finishJunctionCuts(')}
  ${extract(app1, 'function computeStretches(')}
  ${extract(app1, 'function computeRouteBox(')}
  ${extract(app1, 'function ptSegM(')}
  const jDistM = distM;
  ${extract(app1, 'function buildGeometry(')}
  return { ROADS, REFERENCE, STRETCH, SPOT, STREETNAMES, PRIMARIES, MLAT, MLNG, buildGeometry, jDistM, ptSegM };
`)();
const host = {
  MLAT: factory.MLAT, MLNG: factory.MLNG,
  PRIMARIES: factory.PRIMARIES, SPOT: factory.SPOT, STRETCH: factory.STRETCH, ROADS: factory.ROADS,
  names: factory.STREETNAMES,
  jDistM: factory.jDistM, ptSegM: factory.ptSegM,
  isNight: () => false,
  pieces: {}, selSet: [], selStretch: null,
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
function seatHost(pack) {
  factory.buildGeometry(pack);
  const b = {};
  for (const n of factory.STREETNAMES) b[n] = Array(factory.STRETCH[n].runs.reduce((a, r) => a + r.parts.length, 0)).fill(0);
  host.pieces = b;
  return b;
}
// The engine builds its own geometry from the host at eval, so the
// shipped pack is seated BEFORE the engine script runs.
const board5W = seatHost(PACK5W);
const ctx = { GL_HOST: host, window: {}, setInterval: () => 1, clearInterval: () => {} };
vm.runInNewContext(read('parts/engine.js'), ctx);
const GLP = ctx.window.GLP;

// ---- liveness on the shipped pack ----
{
  const b = board5W;
  GLP.init(mockGLM, host);
  const before = JSON.stringify(sources.centres.data) + JSON.stringify(sources.edges.data);
  b['Velmar'][0] = 3;
  GLP.sync();
  const after = JSON.stringify(sources.centres.data) + JSON.stringify(sources.edges.data);
  check('1: a mark flip repaints the sources (the sync does real work)', before !== after);
  b['Velmar'][0] = 0;
  GLP.sync();
  check('2: clearing the mark repaints them back', JSON.stringify(sources.centres.data) + JSON.stringify(sources.edges.data) === before);
}

// ---- the bound: tiled x3 host, median of 15 flips ----
{
  const roads = {}, primaries = [];
  for (let t = 0; t < 3; t++) for (const n of Object.keys(PACK5W.roads)) {
    const nn = t === 0 ? n : `${n}~${t}`;
    roads[nn] = PACK5W.roads[n].map(line => line.map(p => [p[0] + t * 0.06, p[1] + t * 0.02]));
    if (PACK5W.primaries.includes(n)) primaries.push(nn);
  }
  const b = seatHost({ ...PACK5W, roads, primaries, ends: {}, spot: {}, tileNames: Object.keys(roads) });
  GLP.rebuildRoute();
  const NAMES = [...factory.STREETNAMES];
  const spots = [[NAMES[0], 0], [NAMES[5], 1], [NAMES[10], 0], [NAMES[20], 2], [NAMES[30], 0]];
  for (let k = 0; k < 3; k++) { const [n, s] = spots[k % spots.length]; b[n][s] = b[n][s] === 3 ? 0 : 3; GLP.sync(); } // warm
  const times = [];
  for (let k = 0; k < 15; k++) {
    const [n, s] = spots[k % spots.length];
    const t0 = performance.now();
    b[n][s] = b[n][s] === 3 ? 0 : 3; GLP.sync();
    times.push(performance.now() - t0);
  }
  times.sort((a, b2) => a - b2);
  const median = times[7];
  console.log(`proof-sync-perf: 102-street host median flip ${median.toFixed(1)} ms (min ${times[0].toFixed(1)}, max ${times[14].toFixed(1)})`);
  check(`3: the median single-mark sync on the 102-street host is under 1500 ms (got ${median.toFixed(1)})`, median < 1500);
}

console.log(`proof-sync-perf: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
