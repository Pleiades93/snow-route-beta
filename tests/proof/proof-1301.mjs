// proof-1301.mjs - addGpsLayers characterization: GPS layer
// installation and puck lifecycle, pinned before its split.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { extractFn } from '../browser/extract-fn.mjs';

const app2 = readFileSync(new URL('../../parts/app2.js', import.meta.url), 'utf8');
const body = ['ensureGpsBeamImage', 'addGpsUnderlayLayers', 'createGpsPuckLayer', 'addGpsLayers']
  .map(n => extractFn(app2, 'function ' + n + '(')).join('\n');
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond === true) pass++; else { fail++; console.log('FAIL:', name); } };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const calls = [], layers = [], logs = [];
let rejectLayer;
const image = { width: 4, height: 2, data: new Uint8ClampedArray(32) };
const canvas = { clientWidth: 100, clientHeight: 80, width: 200, height: 160 };
let source, hasImage = false, projected;
const map = {
  getSource: () => source,
  addSource: (id, spec) => { calls.push([id, spec]); source = spec; },
  hasImage: () => hasImage,
  addImage: (...args) => { calls.push(args); hasImage = true; },
  addLayer: layer => { calls.push([layer.id]); if (layer.id === rejectLayer) throw new Error(layer.id); layers.push(layer); },
  getCanvas: () => canvas, getPitch: () => 0,
  project: pt => { projected = pt; return { x: 50, y: 40 }; },
};
const context = vm.createContext({
  map, dispPos: null, dispShownPos: () => [43, -79],
  console: { log: line => logs.push(line) },
  makeBeamImage: () => ({
    width: image.width, height: image.height,
    getContext: kind => ({ getImageData: (...args) => {
      calls.push([kind, ...args]); return image;
    } }),
  }),
});
const install = vm.runInContext(body + '\naddGpsLayers', context);
install();
check('empty GPS source and ImageData precede beam, ring, outline, and puck',
  equal(calls.map(args => args[0]), ['gps', '2d', 'beam-img', 'gps-beam', 'gps-ring', 'gps-ring-line', 'gps-puck-shader']) &&
  equal(calls[0][1], { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }) &&
  equal(calls[1], ['2d', 0, 0, 4, 2]) && calls[2][1] === image && calls[2][2].pixelRatio === 2);
check('existing source short-circuits all installation',
  (() => { const count = calls.length; install(); return calls.length === count; })());
const puck = layers.at(-1);
source = null;
calls.length = 0;
install();
check('existing image survives installation on a style without a GPS source',
  equal(calls.map(args => args[0]), ['gps', 'gps-beam', 'gps-ring', 'gps-ring-line', 'gps-puck-shader']));

source = null;
rejectLayer = 'gps-ring';
calls.length = 0;
let rejected;
try { install(); } catch (error) { rejected = error.message; }
install();
check('a layer failure propagates with the source still seated, so same-style retry stops',
  rejected === 'gps-ring' && equal(calls.map(args => args[0]), ['gps', 'gps-beam', 'gps-ring']));

const gpuCalls = [];
const program = {}, buffer = {};
const state = new Map(Object.entries({
  CURRENT_PROGRAM: 'old-program', ARRAY_BUFFER_BINDING: 'old-buffer', BLEND: false,
  DEPTH_TEST: true, DEPTH_WRITEMASK: true, STENCIL_TEST: true, SCISSOR_TEST: true,
  BLEND_SRC_RGB: 'SRC_ALPHA', BLEND_DST_RGB: 'DST_ALPHA',
}));
const gl = {
  ...Object.fromEntries([...state.keys(), ...('COMPILE_STATUS LINK_STATUS VERTEX_SHADER FRAGMENT_SHADER ' +
    'ARRAY_BUFFER STATIC_DRAW ONE ONE_MINUS_SRC_ALPHA FLOAT TRIANGLE_STRIP').split(' ')].map(key => [key, key])),
  createShader: type => type, getShaderParameter: shader => shader !== 'FRAGMENT_SHADER',
  getShaderInfoLog: () => 'bad fragment', createProgram: () => program, createBuffer: () => buffer,
  getProgramParameter: () => false, getProgramInfoLog: () => 'bad link',
  getAttribLocation: () => 4, getUniformLocation: (_, name) => name,
  getParameter: name => state.get(name),
};
for (const method of ('shaderSource compileShader attachShader linkProgram bindBuffer bufferData disable depthMask ' +
  'enable blendFunc useProgram enableVertexAttribArray vertexAttribPointer uniform4f uniform1f drawArrays ' +
  'disableVertexAttribArray deleteProgram deleteBuffer').split(' ')) {
  gl[method] = (...args) => gpuCalls.push([method, ...args]);
}
puck.onRemove(map, gl);
context.dispPos = [44, -80];
puck.render(gl);
check('uninitialized puck neither cleans up nor renders GPU resources', !gpuCalls.length);
puck.onAdd(map, gl);
check('shader failures log diagnostics while program and quad setup continue',
  equal(logs, ['PUCKSHADER compile failed: bad fragment', 'PUCKSHADER link failed: bad link']) &&
  puck._prog === program && puck._buf === buffer &&
  equal(Array.from(gpuCalls.find(call => call[0] === 'bufferData')[2]), [-1, -1, 1, -1, -1, 1, 1, 1]));

gpuCalls.length = 0;
context.dispPos = null;
puck.render(gl);
context.dispPos = [44, -80];
canvas.clientHeight = 0;
puck.render(gl);
check('no fix or zero-size canvas avoids projection and draw', !gpuCalls.length && projected === undefined);
canvas.clientHeight = 80;
puck.render(gl);
check('render projects the shown fix and draws the centered strip',
  equal(projected, [-79, 43]) &&
  equal(gpuCalls.find(call => call[0] === 'drawArrays'), ['drawArrays', 'TRIANGLE_STRIP', 0, 4]) &&
  equal(gpuCalls.find(call => call[0] === 'uniform4f').slice(0, 4), ['uniform4f', 'u_rect', 0, 0]));
check('draw restores incoming GL program, buffer, blend, depth, stencil and scissor',
  equal(gpuCalls.slice(-9), [
    ['disableVertexAttribArray', 4], ['bindBuffer', 'ARRAY_BUFFER', 'old-buffer'], ['useProgram', 'old-program'],
    ['blendFunc', 'SRC_ALPHA', 'DST_ALPHA'], ['disable', 'BLEND'], ['enable', 'DEPTH_TEST'],
    ['depthMask', true], ['enable', 'STENCIL_TEST'], ['enable', 'SCISSOR_TEST'],
  ]));
gpuCalls.length = 0;
puck.onRemove(map, gl);
check('removal deletes owned resources and invalidates the program',
  equal(gpuCalls, [['deleteProgram', program], ['deleteBuffer', buffer]]) && puck._prog === null);

console.log(`proof-add-gps-layers: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
