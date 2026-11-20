import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync('parts/engine.js', 'utf8');

function makeHost() {
  const state = {
    MLAT: 111320,
    MLNG: 80000,
    names: ['Main'],
    PRIMARIES: new Set(['Main']),
    STRETCH: {
      Main: {
        runs: [{
          parts: [
            [[43.0, -79.0], [43.001, -79.0]],
            [[43.001, -79.0], [43.002, -79.0]],
          ],
        }],
      },
    },
    ROADS: {
      Main: [[[43.0, -79.0], [43.002, -79.0]]],
    },
    SPOT: { Main: [0, 0.5] },
    pieces: { Main: [0, 0] },
    selStretch: null,
    selSet: [],
    activeRoute: { name: 'Test Route' },
    jDistM(a, b) {
      return Math.hypot((b[1] - a[1]) * this.MLNG, (b[0] - a[0]) * this.MLAT);
    },
    ptSegM(p, a, b) {
      const px = p[1] * this.MLNG, py = p[0] * this.MLAT;
      const ax = a[1] * this.MLNG, ay = a[0] * this.MLAT;
      const bx = b[1] * this.MLNG, by = b[0] * this.MLAT;
      const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
      return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
    },
    isNight() { return false; },
    glUnifyLabels() {},
  };
  return state;
}

function makeMockGL() {
  const sources = new Map();
  const layers = new Map();
  return {
    sources,
    layers,
    getStyle() { return { layers: [...layers.values()] }; },
    getSource(id) { return sources.get(id); },
    addSource(id, spec) {
      const s = {
        data: spec.data,
        setData(d) { this.data = d; },
      };
      sources.set(id, s);
    },
    getLayer(id) { return layers.get(id); },
    addLayer(layer) { layers.set(layer.id, { ...layer }); },
    setLayerZoomRange() {},
    setLayoutProperty() {},
    setPaintProperty() {},
  };
}

function loadEngine(host) {
  const win = {};
  const fn = new Function('GL_HOST', 'window', `${src}; return GLP;`);
  const GLP = fn(host, win);
  GLP.rebuildRoute();
  return GLP;
}

// Check 1: Selection changed while GLM is null (via syncSel during fallback) updates CUR.sel on GLP.init
{
  const host = makeHost();
  const GLP = loadEngine(host);
  const gl1 = makeMockGL();
  GLP.init(gl1, host);
  assert.equal(gl1.getSource('sel').data.features.length, 0, 'initially no selection');

  GLP.drop();
  host.selStretch = { name: 'Main', idx: 0 };
  GLP.syncSel(); // called while GLM is null

  const gl2 = makeMockGL();
  GLP.init(gl2, host);
  GLP.sync(); // even if sync() is called after init, lastSig matches so it used to stay stale

  const selCount = gl2.getSource('sel').data.features.length;
  const glowCount = gl2.getSource('selGlow').data.features.length;
  assert.equal(selCount, 1, 'expected vibrant sel source to have 1 feature after re-init');
  assert.equal(glowCount, 1, 'expected selGlow source to have 1 feature after re-init');
  console.log('PASS Check 1: selection changed while GLM was null is reflected in CUR.sel on GLP.init');
}

// Check 2: selStretch changed without syncSel while GLM is null is also picked up by GLP.init
{
  const host = makeHost();
  const GLP = loadEngine(host);
  host.selStretch = { name: 'Main', idx: 0 };
  GLP.syncSel();
  const gl1 = makeMockGL();
  GLP.init(gl1, host);
  assert.equal(gl1.getSource('sel').data.features.length, 1);

  GLP.drop();
  host.selStretch = null; // deselected while dropped

  const gl2 = makeMockGL();
  GLP.init(gl2, host);
  assert.equal(gl2.getSource('sel').data.features.length, 0, 'expected sel source cleared on re-init');
  assert.equal(gl2.getSource('selGlow').data.features.length, 0, 'expected selGlow source cleared on re-init');
  console.log('PASS Check 2: deselection while GLM was null clears CUR.sel and selGlow on GLP.init');
}

// Check 3: Pieces marked while GLM is null rebuilds CUR families on GLP.init immediately
{
  const host = makeHost();
  const GLP = loadEngine(host);
  const gl1 = makeMockGL();
  GLP.init(gl1, host);
  assert.equal(gl1.getSource('bands').data.features.length, 0, 'initially no completed bands');

  GLP.drop();
  host.pieces.Main[0] = 3; // completed while GLM is null
  GLP.sync(); // no-op while GLM is null

  const gl2 = makeMockGL();
  GLP.init(gl2, host);
  assert.equal(gl2.getSource('bands').data.features.length, 1, 'expected bands rebuilt during GLP.init');
  console.log('PASS Check 3: pieces changed while GLM was null rebuilds CUR families on GLP.init');
}

process.exit(0);

