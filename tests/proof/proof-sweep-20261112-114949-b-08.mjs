import { readFileSync } from 'node:fs';

const src = readFileSync('parts/engine.js', 'utf8');

let night = false;
const MLAT = 111320, MLNG = 81000;
const pts = [[43.0, -79.0], [43.002, -79.0]];
const host = {
  MLAT,
  MLNG,
  MAIN: new Set(['Main']),
  names: ['Main'],
  STRETCH: { Main: { runs: [{ parts: [pts] }] } },
  ROADS: { Main: [pts] },
  SPOT: {},
  pieces: { Main: [0] },
  activeRoute: { name: 'Route 5W' },
  selStretch: null,
  selSet: [],
  isNight: () => night,
  glHideLabels: () => {},
  jDistM: (a, b) => Math.hypot((b[1] - a[1]) * MLNG, (b[0] - a[0]) * MLAT),
  ptSegM: () => 999,
};

const win = {};
new Function('window', 'GL_HOST', src)(win, host);
const GLP = win.GLP;

const sources = new Map();
const layers = new Map();
const mockGL = {
  getStyle: () => ({ layers: [...layers.values()] }),
  getSource: id => sources.get(id),
  addSource: (id, spec) => sources.set(id, { ...spec, setData(d) { this.data = d; } }),
  getLayer: id => layers.get(id),
  addLayer: spec => layers.set(spec.id, { ...spec, layout: { ...(spec.layout || {}) }, paint: { ...(spec.paint || {}) } }),
  setLayoutProperty: (id, k, v) => { const l = layers.get(id); if (l) l.layout[k] = v; },
  setPaintProperty: (id, k, v) => { const l = layers.get(id); if (l) l.paint[k] = v; },
  setLayerZoomRange: (id, min, max) => { const l = layers.get(id); if (l) { l.minzoom = min; l.maxzoom = max; } },
};

const CASING_IDS = ['t1-casing', 't1-casingb'];
const LABEL_IDS = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4', 'routepoi-txt'];

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ' (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

function checkPalette(phase, expCasing, expText, expHalo) {
  const casingOk = CASING_IDS.every(id => layers.get(id)?.paint['line-color'] === expCasing);
  const textOk = LABEL_IDS.every(id => layers.get(id)?.paint['text-color'] === expText);
  const haloOk = LABEL_IDS.every(id => layers.get(id)?.paint['text-halo-color'] === expHalo);
  check(`${phase}: casing line-color === ${expCasing}`, casingOk, CASING_IDS.map(id => `${id}=${layers.get(id)?.paint['line-color']}`).join(', '));
  check(`${phase}: label text-color === ${expText}`, textOk, LABEL_IDS.map(id => `${id}=${layers.get(id)?.paint['text-color']}`).join(', '));
  check(`${phase}: label text-halo-color === ${expHalo}`, haloOk, LABEL_IDS.map(id => `${id}=${layers.get(id)?.paint['text-halo-color']}`).join(', '));
}

GLP.init(mockGL, host);
checkPalette('initial day init', '#5a5f6a', '#333333', 'rgba(255,255,255,.9)');

check('GLP exposes syncTheme()', typeof GLP.syncTheme === 'function');

night = true;
GLP.setFont(['Inter Regular']);
GLP.sync();
checkPalette('restyle day->night via sync() without init()', '#000000', '#e8e8e8', 'rgba(0,0,0,.8)');

night = false;
if (typeof GLP.syncTheme === 'function') GLP.syncTheme();
checkPalette('night->day via GLP.syncTheme()', '#5a5f6a', '#333333', 'rgba(255,255,255,.9)');

night = true;
GLP.init(mockGL, host);
checkPalette('day->night via init() with surviving layers', '#000000', '#e8e8e8', 'rgba(0,0,0,.8)');

process.exit(failures ? 1 : 0);
