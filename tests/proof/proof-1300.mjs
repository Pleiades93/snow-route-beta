// proof-1300.mjs - addStack characterization: source seating,
// layer order and refresh effects, pinned before its split.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { extractFn } from '../browser/extract-fn.mjs';

const engine = readFileSync(new URL('../../parts/engine.js', import.meta.url), 'utf8');
const body = ['addRouteStackSources', 'addRoutePaintLayers', 'addSelectionLayers', 'addRoutePoiLayers', 'addStack']
  .map(n => extractFn(engine, 'function ' + n + '(')).join('\n');
const sources = new Map(), layers = new Map();
const events = [], ranges = [];
const sourceIds = 'centres bands edges fills fades selFades sel selBand selFill selGlow hit routepoi'.split(' ');
const layerIds = ('t1-casing t1-casingb t1-surface t1-band t1-fill fade-casing fade-surf-y fade-surf-r fade-band-g fade-fill-g ' +
  'sel-glow4-s sel-glow4-b sel-glow5-s sel-glow5-b sel-glow1-s sel-glow1-b sel-glow2-s sel-glow2-b sel-glow3-s sel-glow3-b ' +
  't1-sel t1-selband sel-core-s sel-core-b t1-selfill selfade-y selfade-r selfade-g selfade-fill hit ' +
  'routepoi-ring routepoi-dot routepoi-txt').split(' ');
const CUR = Object.fromEntries(sourceIds.map(id => [id, { type: 'FeatureCollection', features: [] }]));
const labelpts = { type: 'FeatureCollection', features: [] };
const catalogue = engine.match(/^const LAYERS = \{[\s\S]*?^\};/m)[0];
const LAYERS = vm.runInNewContext(catalogue + '\nLAYERS');
const ranged = [...LAYERS.paint, ...LAYERS.glow];
const fontStack = ['Noto Sans Regular'];
const GLM = {
  getSource: id => sources.get(id),
  addSource: (id, spec) => { events.push('source:' + id); sources.set(id, spec); },
  getLayer: id => layers.get(id),
  addLayer: (layer, before) => { events.push('layer:' + before); layers.set(layer.id, layer); },
  setLayerZoomRange: (...args) => { ranges.push(args); },
};
let stackArgs;
const context = vm.createContext({
  GLM, CUR, fontStack, LABELPTS: labelpts, HIT: CUR.hit, ROUTEPOI: CUR.routepoi,
  LAYERS,
  H: {
    activeRoute: { name: 'Route 5W' }, isNight: () => true,
    glUnifyLabels: args => { events.push('labels'); stackArgs = args; },
  },
  tunePlaceLabels: () => events.push('tune'), firstSymbolId: () => 'road-label',
  buildSelGlow: () => CUR.selGlow, pushSources: () => events.push('push'),
  applyGlow: () => events.push('glow'), syncTheme: () => events.push('theme'),
  surfW: 8, surfCASE: 10, WIDTH_K: 1.3, wScale: (w, f) => w * f, wPlus: (w, n) => w + n,
  YELLOW: '#ffff00', RED: '#ff0000', GREEN: '#00ff00', MUGREEN: '#008800',
  mute: color => color,
});
const addStack = vm.runInContext(extractFn(engine, 'function fadeGrad(') + '\n' + body + '\naddStack', context);
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond === true) pass++; else { fail++; console.log('FAIL:', name); } };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

addStack();
check('sources precede layers, carry their own data, and enable metrics only for feathers',
  equal(events.slice(0, 13), ['tune', ...sourceIds.map(id => 'source:' + id)]) &&
  sourceIds.every(id => sources.get(id).data === CUR[id] &&
    sources.get(id).lineMetrics === (id === 'fades' || id === 'selFades' ? true : undefined)));
check('paint, feathers, selection, hit and POI register in drawing order before basemap symbols',
  equal([...layers.keys()], layerIds) && equal(events.slice(13, -4), layerIds.map(() => 'layer:road-label')));
check('unfiltered casing retains the default join and the night color; feathers carry their filter',
  !Object.hasOwn(layers.get('t1-casing'), 'filter') &&
  layers.get('t1-casing').layout['line-join'] === 'miter' &&
  layers.get('t1-casing').paint['line-color'] === '#000000' &&
  equal(layers.get('fade-band-g').filter, ['==', ['get', 'k'], 'b']));
check('paint and glow receive the zoom range, while POI keeps its own cut and route label',
  equal(ranges, ranged.map(id => [id, 12.5, 24])) &&
  equal(layers.get('routepoi-txt').paint['text-opacity'], ['step', ['zoom'], 1, 12.6, 0]) &&
  layers.get('routepoi-txt').layout['text-field'] === 'Route 5W');
check('title hook receives fresh-stack arguments before data, glow, and theme refresh',
  stackArgs.m === GLM && stackArgs.stack.newStack === true && stackArgs.stack.data === labelpts &&
  stackArgs.stack.ids === LAYERS.titles && stackArgs.stack.fontStack === fontStack &&
  equal(events.slice(-4), ['labels', 'push', 'glow', 'theme']));

const existing = layers.get('t1-casing');
layers.delete('hit');
events.length = 0;
addStack();
check('repeat preserves existing layers and sources, restores a missing layer, and reruns the refresh',
  layers.get('t1-casing') === existing && layers.has('hit') && stackArgs.stack.newStack === false &&
  equal(events, ['tune', 'layer:road-label', 'labels', 'push', 'glow', 'theme']));

console.log(`proof-add-stack: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
