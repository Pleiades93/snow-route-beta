import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// mergeStrands best-score proof (dead-score fix, 2026-11-15).
//
// The defect: mergeStrands (parts/engine.js) picks the best strand join
// per scan by score - 2 for an exact endpoint join, 1 for a junction
// bridge - but the winner object never stored its score, so the
// comparison `c.score > best.score` ran against undefined and the FIRST
// candidate in scan order won every contest, including over exact joins
// offered later in the same scan. The fix stores the score
// (`best = { i, j, score: c.score, merged: c.merged }`); ties still keep
// the first of equal score.
//
// This proof drives the shipped engine (GLP, loaded verbatim from
// parts/engine.js) over a synthetic three-street network whose marked
// side lines produce exactly that contest at the CrossSt x NorthAve
// junction: in one scan of the edges merge, a score-1 bridge involving
// the contested slice is offered BEFORE a score-2 exact join for the
// same slice (instrumented scan log, 2026-11-15: candidates in order
// (1,3)=1, (1,5)=1, (3,1)=1, (3,6)=2, ...). The two merges are mutually
// exclusive, so the grouping of the final side-line paint shows which
// rule ran:
//   - dead rule: LongAve's west side line (y = -4.9) turns up CrossSt
//     and ends along NorthAve's FAR side (y = 65), reaching (-120, 65).
//   - fixed rule: the exact join wins - that same line turns onto
//     NorthAve's NEAR side (y = 55) and runs east to (60, 55).
// Centres/bands never carry score-1 candidates (pairs = null), so the
// centre lines are invariant; check 3 pins that too.
//
// On the unfixed engine checks 1-2 FAIL and check 3 passes; with the
// fix all three pass. Coordinates below are metres in the synthetic
// grid (x east, y north of the LongAve/CrossSt junction), matched with
// 0.75 m tolerance - the side lines sit SURF_HALF (4.95 m) off their
// centrelines, hence the 4.9/55/65 ordinates.

const src = readFileSync('parts/engine.js', 'utf8');

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
const host = {
  MAIN: new Set(),
  MLAT, MLNG,
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
  SPOT: {},
  pieces: { LongAve: [2, 1, 2], NorthAve: [1, 2, 1], CrossSt: [1, 2, 1] },
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
vm.runInNewContext(src, ctx);
const { GLP } = ctx.window;
GLP.init(mockGLM, host);

let failed = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`PASS: ${label}`);
  else { failed++; console.log(`FAIL: ${label}${detail ? ' — ' + detail : ''}`); }
}

// strands of a source as metre-space point lists
const strandsM = fc => fc.features.map(f => f.geometry.coordinates.map(c => [(c[0] - LNG0) * MLNG, (c[1] - LAT0) * MLAT]));
const near = (p, x, y) => Math.hypot(p[0] - x, p[1] - y) <= 0.75;
const strandWith = (strands, x, y) => strands.find(s => s.some(p => near(p, x, y)));

const edges = strandsM(sources.edges.data);
const westLine = strandWith(edges, -120, -4.9);   // LongAve's marked side line at its west end
check('side line under test exists (LongAve west end, y=-4.9)', !!westLine);
check('best score wins: the exact join carries LongAve\u2019s west side line onto NorthAve\u2019s near side, running east to (60, 55)',
  !!westLine && westLine.some(p => near(p, 60, 55)),
  westLine ? 'line instead reaches ' + JSON.stringify(westLine[westLine.length - 1].map(v => +v.toFixed(1))) : 'no line');
check('the dead rule\u2019s bridge grouping is gone: no single strand joins (-120, -4.9) to (-120, 65)',
  !edges.some(s => s.some(p => near(p, -120, -4.9)) && s.some(p => near(p, -120, 65))));

const centres = strandsM(sources.centres.data);
const longCentre = strandWith(centres, -120, 0);
check('centres invariant: LongAve\u2019s centre line is one strand spanning (-120, 0) to (120, 0)',
  centres.length === 3 && !!longCentre && longCentre.some(p => near(p, 120, 0)),
  `centres=${centres.length}`);

process.exit(failed ? 1 : 0);
