import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync('parts/engine.js', 'utf8');

const MLAT = 111132, MLNG = 82000;
const LAT0 = 43.8, LNG0 = -79.5;
const pt = (xM, yM) => [LAT0 + yM / MLAT, LNG0 + xM / MLNG];
const xOfGJ = c => (c[0] - LNG0) * MLNG;

const STRETCH = {
  MainSt: { runs: [{ parts: [
    [pt(-120, 0), pt(-80, 0), pt(-40, 0), pt(0, 0)],
    [pt(0, 0), pt(20, 0), pt(40, 0), pt(60, 0)],
    [pt(60, 0), pt(80, 0), pt(100, 0), pt(120, 0)],
  ] }] },
  Cross1: { runs: [{ parts: [[pt(0, -60), pt(0, -20), pt(0, 0), pt(0, 20), pt(0, 60)]] }] },
  Cross2: { runs: [{ parts: [[pt(60, -60), pt(60, -20), pt(60, 0), pt(60, 20), pt(60, 60)]] }] },
  EndWest: { runs: [{ parts: [[pt(-120, -60), pt(-120, -20), pt(-120, 0), pt(-120, 20), pt(-120, 60)]] }] },
  SplitSt: { runs: [
    { parts: [[pt(-60, 200), pt(-30, 200), pt(0, 200)]] },
    { parts: [[pt(60, 200), pt(90, 200), pt(120, 200)]] },
  ] },
  SplitCross1: { runs: [{ parts: [[pt(0, 150), pt(0, 180), pt(0, 200), pt(0, 220), pt(0, 250)]] }] },
  SplitCross2: { runs: [{ parts: [[pt(60, 150), pt(60, 180), pt(60, 200), pt(60, 220), pt(60, 250)]] }] },
};
const names = Object.keys(STRETCH);
const ROADS = Object.fromEntries(names.map(n => [n, STRETCH[n].runs.flatMap(r => r.parts)]));

const host = {
  MAIN: new Set(['MainSt']),
  MLAT,
  MLNG,
  jDistM: (a, b) => Math.hypot((b[1] - a[1]) * MLNG, (b[0] - a[0]) * MLAT),
  ptSegM(p, a, b) {
    const px = p[1] * MLNG, py = p[0] * MLAT;
    const ax = a[1] * MLNG, ay = a[0] * MLAT;
    const bx = b[1] * MLNG, by = b[0] * MLAT;
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2));
    return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
  },
  names,
  STRETCH,
  ROADS,
  SPOT: {},
  pieces: { MainSt: [0, 0, 0], Cross1: [0], Cross2: [0], EndWest: [0], SplitSt: [0, 0], SplitCross1: [0], SplitCross2: [0] },
  selStretch: null,
  selSet: [],
  isNight: () => false,
  activeRoute: { name: 'Proof' },
  glHideLabels: () => {},
};

const sources = {}, layers = [];
const mockGLM = {
  getStyle: () => ({ layers }),
  getSource: id => sources[id],
  addSource: (id, spec) => { sources[id] = { data: spec.data, setData(d) { this.data = d; } }; },
  getLayer: id => layers.find(l => l.id === id),
  addLayer: l => { layers.push(l); },
  setLayerZoomRange: () => {},
  setLayoutProperty: () => {},
  setPaintProperty: () => {},
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

const spanX = fc => {
  const coords = fc.features[0].geometry.coordinates;
  return [xOfGJ(coords[0]), xOfGJ(coords[coords.length - 1])];
};

// 1. Interior pending stretch on continuing street keeps unclipped ends at J1 (x=0) and J2 (x=60)
host.pieces.MainSt = [0, 0, 0];
host.selStretch = { name: 'MainSt', idx: 1 };
GLP.sync(); GLP.syncSel();
{
  const [x0, x1] = spanX(sources.sel.data);
  check('interior pending stretch unclipped in sel', Math.abs(x0 - 0) < 0.01 && Math.abs(x1 - 60) < 0.01, `got [${x0.toFixed(2)}, ${x1.toFixed(2)}]`);
  const [g0, g1] = spanX(sources.selGlow.data);
  check('interior pending stretch unclipped in selGlow', Math.abs(g0 - 0) < 0.01 && Math.abs(g1 - 60) < 0.01, `got [${g0.toFixed(2)}, ${g1.toFixed(2)}]`);
}

// 2. Interior completed band stretch on continuing band street keeps unclipped ends at J1 and J2
host.pieces.MainSt = [3, 3, 3];
host.selStretch = { name: 'MainSt', idx: 1 };
GLP.sync(); GLP.syncSel();
{
  const [x0, x1] = spanX(sources.selBand.data);
  check('interior band stretch unclipped in selBand', Math.abs(x0 - 0) < 0.01 && Math.abs(x1 - 60) < 0.01, `got [${x0.toFixed(2)}, ${x1.toFixed(2)}]`);
}

// 3. Family change at J1 (band -> pending) clips start at J1, while continuing pending at J2 stays unclipped
host.pieces.MainSt = [3, 0, 0];
host.selStretch = { name: 'MainSt', idx: 1 };
GLP.sync(); GLP.syncSel();
{
  const [x0, x1] = spanX(sources.sel.data);
  check('family-boundary start clipped at J1 and continuing end unclipped at J2', Math.abs(x0 - 3.3) < 0.05 && Math.abs(x1 - 60) < 0.01, `got [${x0.toFixed(2)}, ${x1.toFixed(2)}]`);
}

// 4. Street-start stretch (idx=0) clips at street end (x=-120) and stays unclipped at continuing J1 (x=0)
host.pieces.MainSt = [0, 0, 0];
host.selStretch = { name: 'MainSt', idx: 0 };
GLP.sync(); GLP.syncSel();
{
  const [x0, x1] = spanX(sources.sel.data);
  check('street-start stretch clipped at outer end and unclipped at continuing junction', Math.abs(x0 - (-116.7)) < 0.05 && Math.abs(x1 - 0) < 0.01, `got [${x0.toFixed(2)}, ${x1.toFixed(2)}]`);
}

// 5. Disconnected multi-run street still clips run boundaries even when both runs share the same state
host.selStretch = { name: 'SplitSt', idx: 0 };
GLP.syncSel();
const [, splitRun0End] = spanX(sources.sel.data);
host.selStretch = { name: 'SplitSt', idx: 1 };
GLP.syncSel();
const [splitRun1Start] = spanX(sources.sel.data);
check('disconnected run-gap ends remain clipped at junctions', Math.abs(splitRun0End - (-3.3)) < 0.05 && Math.abs(splitRun1Start - 63.3) < 0.05, `got end=${splitRun0End.toFixed(2)}, start=${splitRun1Start.toFixed(2)}`);

process.exit(failed ? 1 : 0);
