
// ===== MAP BOOT + LAYERS (fresh, MapLibre-native) =====
const GL_STYLES = { day: PM_DAY, night: PM_NIGHT }; // both basemaps are Protomaps flavours embedded by pmstyles.js: a day/night switch is a local setStyle
const glStyleFor = night => JSON.parse(JSON.stringify(GL_STYLES[night ? 'night' : 'day'])); // MapLibre rewrites a handed style's fields: the styles are never handed over directly, every map gets a copy
let glOk = false, mapNoteArmed = false, basemapDead = false, tilesOk = 0;
// bootMap() runs only after the intro: creation's chunks froze the animation mid-intro; registrations replay via onMapReady
let map = null;
const __onMap = [];
function onMapReady(fn) { if (map) fn(); else __onMap.push(fn); }
function bootMap() {
  if (map) return;
  window.__bootAt = Date.now();
  map = new maplibregl.Map({ container: 'map', style: glStyleFor(isNight()), attributionControl: false, fadeDuration: 200, pixelRatio: dpPixelRatio(), maxTileCacheSize: 200, maxTileCacheZoomLevels: 6, cancelPendingTileRequestsWhileZooming: false, minZoom: 8, maxZoom: 19, maxPitch: 60 }); // Beta 1.230: the canvas ratio comes from the device profile (app1) - on Android the applied tier's ratio (the boot starts from the stored hint, the boot grade lands it at the first idle), everywhere else dpPixelRatio() answers the literal 2 this constructor carried through 1.229, so an iPhone's map is built exactly as before (drive131's W1 reads the live value)
  map.setCenter(routeBox ? [(routeBox.w + routeBox.e) / 2, (routeBox.s + routeBox.n) / 2] : [-79.57, 43.82]); map.setZoom(12); // an area view until a route is chosen (loadRoute frames it); no route is baked in
  setTimeout(() => { if (!tilesOk) { basemapDead = true; noteMapState(); } }, 9000);
  for (const fn of __onMap) fn();
  __onMap.length = 0;
} // tiles melt in (200 ms); ratio 2 = 4/9 the pixels, the fluidity win; full gestures stay on
// Zoom keeps loading tiles so levels appear progressively, not abruptly at the end. One-line revert: drop the constructor option.
let routeBox = null; // the pack's box, set by buildGeometry on every load; null before any pick and for an empty pack
// the maps-failing notice is persistent state, not a pop-up: it shows while the map is dead and clears on recovery
function noteMapState() { $('mapNote').classList.toggle('hidden', !((mapNoteArmed && !glOk) || basemapDead)); }
setTimeout(() => { if (!glOk) { mapNoteArmed = true; noteMapState(); } }, 15000);
onMapReady(() => map.on('error', e => { if (!glOk && e && e.error && /fetch|Failed/i.test(e.error.message || '') && !mapNoteArmed) { mapNoteArmed = true; noteMapState(); } }));
// proof the basemap is drawing: the moment a tile lands after an outage, the death notice clears itself
onMapReady(() => map.on('sourcedata', e => { if (e.dataType === 'source' && e.sourceId === 'protomaps' && e.tile) { tilesOk++; if (basemapDead) { basemapDead = false; noteMapState(); } } }));
const ROUTE_TILE_NAMES = []; // every street's name as the tiles spell it (drives the exclusion in glUnifyLabels); pack data, refilled per load
function glUnifyLabels(m) { // BASEMAP LABEL UNIFICATION: the day and night styles are two different ready-made maps
  // on every restack, normalize every basemap text layer (typeface, size curve per kind); route layers are never touched
  try {
    const glyphs = (m.getStyle() && m.getStyle().glyphs) || '';
    const font = glyphs.indexOf('versatiles') >= 0 ? ['noto_sans_regular'] : ['Noto Sans Regular'];
    const SIZE = {
      road: ['interpolate', ['linear'], ['zoom'], 12, 10, 15, 13, 18, 15],
      place: ['interpolate', ['linear'], ['zoom'], 8, 12, 12, 14, 16, 16],
      water: ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 13],
      other: ['interpolate', ['linear'], ['zoom'], 15, 10, 18, 12]
    };
    // route names get their own label-layer copies (from 15.2, no fade): a filter cannot key on zoom
    const routeLabelMinZoom = 15.2;
    const spec = (typeof isNight === 'function' && isNight()) ? PM_NIGHT : PM_DAY;
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const setL = (id, k, v) => { if (!eq(m.getLayoutProperty(id, k), v)) m.setLayoutProperty(id, k, v); }; // no-op guards: this pass runs on every stack build, and a mutation re-triggers symbol placement - skip matches
    const setP = (id, k, v) => { if (!eq(m.getPaintProperty(id, k), v)) { try { m.setPaintProperty(id, k, v); } catch (e2) {} } };
    // kind filters are authored in legacy form: rebuilt as expressions, or any combined filter is rejected whole
    const convF = f => (Array.isArray(f) && f[0] === 'in' && typeof f[1] === 'string') ? ['in', ['get', f[1]], ['literal', f.slice(2)]] : f;
    const titlesOff = typeof ROUTE_TITLES_ON === 'undefined' || !ROUTE_TITLES_ON;
    const handover = !titlesOff && !(typeof creating !== 'undefined' && creating);
    for (const baseId of ['roads_labels_major', 'roads_labels_minor']) {
      const cloneId = baseId + '-route';
      if (m.getLayer(cloneId)) { try { m.removeLayer(cloneId); } catch (e2) {} } // rebuilt below in the handover state, gone in every other
      if (handover) {
        const specL = (spec.layers || []).find(x => x.id === baseId);
        if (specL) {
          const clone = JSON.parse(JSON.stringify(specL));
          clone.id = cloneId; clone.minzoom = routeLabelMinZoom; clone.maxzoom = 24;
          const baseF0 = specL.filter ? convF(specL.filter) : null;
          const routeF = ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]];
          clone.filter = baseF0 ? ['all', baseF0, routeF] : routeF;
          const live = m.getStyle().layers; const at = live.findIndex(x => x.id === baseId);
          const beforeId = at >= 0 && live[at + 1] ? live[at + 1].id : undefined; // the clone seats right after its base, so a remove-and-rebuild restores the same layer order
          try { m.addLayer(clone, beforeId); } catch (e2) {}
        }
      }
    }
    for (const L of m.getStyle().layers) {
      if (L.type !== 'symbol' || !L.layout || !L.layout['text-field'] || !L['source-layer']) continue;
      const sl = L['source-layer'], id = L.id || '';
      let kind = 'other';
      if (sl === 'street_labels' || sl === 'streets_polygons_labels' || sl === 'roads' || id.indexOf('roadname') === 0 || id.indexOf('label-street') === 0 || id.indexOf('label-motorway') === 0) kind = 'road';
      else if (sl === 'place_labels' || sl === 'places' || sl === 'boundary_labels' || id.indexOf('place_') === 0 || id.indexOf('label-place') === 0 || id.indexOf('label-boundary') === 0) kind = 'place';
      else if (sl.indexOf('water') === 0 || id.indexOf('water') === 0) kind = 'water';
      setL(L.id, 'text-font', font);
      setL(L.id, 'text-size', SIZE[kind]);
      if (typeof isNight === 'function' && isNight()) {
        // night names lift to one calm light grey with a dark edge: native colours vanish on dark roads
        setP(L.id, 'text-color', '#ccd6df'); setP(L.id, 'text-halo-color', 'rgba(8,10,14,0.9)'); setP(L.id, 'text-halo-width', 1.3);
      }
      if (kind === 'place' && (sl === 'place_labels' || sl === 'places')) {
        // a gate buried in the hamlet filter relaxes to 9, agreeing with the PLACE_EARLY zooms applied before this hook
        if (L.filter) {
          const relax = f => Array.isArray(f) ? f.map((x, i) => (i === 2 && f[0] === '>=' && Array.isArray(f[1]) && f[1][0] === 'zoom' && typeof x === 'number' && x > 9) ? 9 : relax(x)) : f;
          const nf = relax(L.filter);
          if (JSON.stringify(nf) !== JSON.stringify(L.filter)) m.setFilter(L.id, nf);
        }
      }
      if (kind === 'road') {
        const isClone = id === 'roads_labels_major-route' || id === 'roads_labels_minor-route';
        if (isClone) { if ((L.minzoom || 0) !== routeLabelMinZoom || (L.maxzoom === undefined ? 24 : L.maxzoom) !== 24) m.setLayerZoomRange(L.id, routeLabelMinZoom, 24); }
        else if ((L.minzoom || 0) !== 13 || (L.maxzoom === undefined ? 24 : L.maxzoom) !== 24) m.setLayerZoomRange(L.id, 13, 24); // guard: same no-op rule as setL/setP
        // LABEL RULE: titles name the route below 15.2; clones take route names over from 15.2
        setL(L.id, 'symbol-spacing', 250); // Andrew re-picked 250 on 2026-11-24: names repeat sooner when zoomed in.
        if (id === 'roads_labels_major' || id === 'roads_labels_minor') {
          // while creating, the exclusion is simply not added (every street named); `creating` is the single condition
          const specL = (spec.layers || []).find(x => x.id === id);
          const baseF = specL && specL.filter ? convF(specL.filter) : null;
          const exclF = ['!', ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]]];
          const targetF = ((typeof creating !== 'undefined' && creating) || titlesOff) ? baseF : (baseF ? ['all', baseF, exclF] : exclF);
          if (!eq(L.filter, targetF)) { try { m.setFilter(L.id, targetF); } catch (e2) {} } // guard
        }
        if ((id === 'roads_labels_major' || id === 'roads_labels_minor' || isClone) && !(typeof isNight === 'function' && isNight())) {
          // day names darken to the label ink with a light edge (stock names wash out over route lines)
          setP(L.id, 'text-color', '#333333'); setP(L.id, 'text-halo-color', 'rgba(255,255,255,.92)'); setP(L.id, 'text-halo-width', 1.5);
        }
      }
    }
  } catch (e) { /* a style without label layers has nothing to normalize */ }
}
function addReferenceLayers() {
  const feats = [];
  for (const name of Object.keys(REFERENCE)) { if (name === 'Village Green' || name === 'Ott' || name === 'West link') continue; // all reference lines are off the map (duplicates or over-traces); the data stays, nothing draws
    // reference shape: { name: [segment, ...] }; the {name, pts} misread threw per style-ready, killing queued layers
    const segs = REFERENCE[name]; for (const seg of segs) feats.push({ type: 'Feature', properties: { refName: name }, geometry: { type: 'LineString', coordinates: seg.map(p => [p[1], p[0]]) } }); }
  if (map.getSource('ref')) { map.getSource('ref').setData({ type: 'FeatureCollection', features: feats }); return; } // a switch re-points the source at the new pack's reference features (never the old route's)
  map.addSource('ref', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
  map.addLayer({ id: 'ref-line', type: 'line', source: 'ref', filter: ['has', 'refName'], layout: { 'line-cap': 'round' }, paint: { 'line-color': isNight() ? '#aab4c0' : '#8a929c', 'line-width': 3, 'line-opacity': 0.55, 'line-dasharray': [2, 1.6] } }, map.getLayer('t1-casing') ? 't1-casing' : undefined);
}
function makeBeamImage() { // the beam is a fan (strong at the dot, fading, soft-skirted); two passes fake the missing blur
  const S = 512, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const x = cv.getContext('2d'), c = S / 2;
  const pass = (halfDeg, len, a0) => {
    const g = x.createRadialGradient(c, c, 0, c, c, len);
    g.addColorStop(0, 'rgba(44,74,210,' + a0 + ')');
    g.addColorStop(0.55, 'rgba(44,74,210,' + (a0 * 0.55).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(44,74,210,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(c, c);
    const h = -Math.PI / 2, hd = halfDeg * Math.PI / 180;
    x.arc(c, c, len, h - hd, h + hd); x.closePath(); x.fill();
  };
  pass(48, 238, 0.13); pass(38, 238, 0.22); pass(29, 238, 0.34); // three nested fans: the steps between them are small enough to read as one soft edge
  return cv;
}
function addGpsLayers() {
  if (map.getSource('gps')) return;
  map.addSource('gps', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  // raw ImageData: handing over the canvas element throws 'mismatched image size' and killed this layer batch silently
  if (!map.hasImage('beam-img')) { const bcv = makeBeamImage(); map.addImage('beam-img', bcv.getContext('2d').getImageData(0, 0, bcv.width, bcv.height), { pixelRatio: 2 }); }
  map.addLayer({ id: 'gps-beam', type: 'symbol', source: 'gps', filter: ['==', ['get', 'k'], 'beam'], layout: { 'icon-image': 'beam-img', 'icon-size': 0.62, 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-anchor': 'center', 'icon-allow-overlap': true, 'icon-ignore-placement': true } }); // Beta 1.49: gradient fan symbol, painted under the accuracy ring and the dot - replaces the flat cone polygon (Beta 1.28), which read as cheap
  map.addLayer({ id: 'gps-ring', type: 'fill', source: 'gps', filter: ['==', ['get', 'k'], 'ring'], paint: { 'fill-color': '#2c4ad2', 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'gps-ring-line', type: 'line', source: 'gps', filter: ['==', ['get', 'k'], 'ring'], paint: { 'line-color': '#2c4ad2', 'line-width': 1.5, 'line-opacity': 0.5 } });
  map.addLayer({
    id: 'gps-puck-shader', type: 'custom', _prog: null, _buf: null, _aPos: -1, _u: {},
    onAdd(m, gl) {
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.log('PUCKSHADER compile failed: ' + gl.getShaderInfoLog(s)); return s; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, [
        'attribute vec2 a_pos;',
        'uniform vec4 u_rect;',
        'uniform float u_half;',
        'varying vec2 v_px;',
        'void main() { v_px = vec2(a_pos.x, -a_pos.y) * u_half; gl_Position = vec4(u_rect.xy + a_pos * u_rect.zw, 0.0, 1.0); }'
      ].join('\n')));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, [
        'precision highp float;',
        'varying vec2 v_px;',
        'uniform float u_D;',
        'uniform float u_L;',
        'uniform float u_faceK;',
        'uniform float u_aa;',
        'float sdEllipse(vec2 p, vec2 r) {',
        '  vec2 rp = p / r; float l = length(rp);',
        '  if (l < 1e-5) return -min(r.x, r.y);',
        '  vec2 g = vec2(p.x / (r.x * r.x), p.y / (r.y * r.y)) / l;',
        '  return (l - 1.0) / max(length(g), 1e-5);',
        '}',
        'float sdExtr(vec2 p, float L, vec2 r) {',
        '  float cy = clamp(p.y, -L, 0.0);',
        '  return sdEllipse(vec2(p.x, p.y - cy), r);',
        '}',
        'vec4 over(vec4 dst, vec4 src) { return src + dst * (1.0 - src.a); }',
        'void main() {',
        '  float Rx = u_D * 0.5;',
        '  float Ry = max(u_D * u_faceK * 0.5, 0.6);',
        '  vec2 rF = vec2(Rx, Ry);',
        '  vec4 outc = vec4(0.0);',
        '  float dSh = sdExtr(v_px - vec2(0.0, u_D * 0.10 + 1.5), u_L, rF * 1.05);',
        '  float aSh = 0.30 * (1.0 - smoothstep(-u_D * 0.10, u_D * 0.10, dSh));',
        '  outc = over(outc, vec4(vec3(0.0) * aSh, aSh));',
        '  float dW = sdExtr(v_px, u_L, rF);',
        '  float aW = 1.0 - smoothstep(-u_aa, u_aa, dW);',
        '  float grad = clamp((v_px.y + u_L + Ry) / max(2.0 * Ry + u_L, 1.0), 0.0, 1.0);',
        '  vec3 wallCol = mix(vec3(0.985), vec3(0.795, 0.83, 0.885), grad);',
        '  outc = over(outc, vec4(wallCol * aW, aW));',
        '  float dF = sdEllipse(v_px - vec2(0.0, -u_L), rF);',
        '  float aF = 1.0 - smoothstep(-u_aa, u_aa, dF);',
        '  vec3 rimCol = mix(vec3(1.0), vec3(0.95, 0.96, 0.985), clamp((v_px.y + u_L + Ry) / max(2.0 * Ry, 1.0), 0.0, 1.0));',
        '  outc = over(outc, vec4(rimCol * aF, aF));',
        '  float dC = sdEllipse(v_px - vec2(0.0, -u_L), rF * 0.62);',
        '  float aC = 1.0 - smoothstep(-u_aa, u_aa, dC);',
        '  outc = over(outc, vec4(vec3(0.173, 0.290, 0.824) * aC, aC));',
        '  gl_FragColor = outc;',
        '}'
      ].join('\n')));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.log('PUCKSHADER link failed: ' + gl.getProgramInfoLog(prog));
      this._prog = prog;
      this._buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this._aPos = gl.getAttribLocation(prog, 'a_pos');
      for (const n of ['u_rect', 'u_half', 'u_D', 'u_L', 'u_faceK', 'u_aa']) this._u[n] = gl.getUniformLocation(prog, n);
    },
    render(gl, matrix) {
      if (!dispPos || !this._prog) return;
      const cnv = map.getCanvas();
      const cssW = cnv.clientWidth, cssH = cnv.clientHeight;
      if (!cssW || !cssH || !cnv.width) return;
      const dev = cnv.width / cssW;
      const pt = map.project([dispShownPos()[1], dispShownPos()[0]]); // the puck centres on the rendered point: under the stillness hold that is the held point, still at rest
      const D = 0.054 * cssW * dev;
      const pitch = map.getPitch() * Math.PI / 180;
      const faceK = Math.max(0.30, Math.pow(Math.cos(pitch), 1.47));
      const L = 0.14 * D * Math.min(1, Math.sin(pitch) / Math.sin(Math.PI / 3));
      const half = D * 0.95;
      const nx = (pt.x * dev / cnv.width) * 2 - 1;
      const ny = 1 - (pt.y * dev / cnv.height) * 2;
      const prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
      const prevBuf = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      const prevBlend = gl.getParameter(gl.BLEND);
      const prevDepth = gl.getParameter(gl.DEPTH_TEST);
      const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
      const prevStencil = gl.getParameter(gl.STENCIL_TEST);
      const prevScissor = gl.getParameter(gl.SCISSOR_TEST);
      const prevSrc = gl.getParameter(gl.BLEND_SRC_RGB);
      const prevDst = gl.getParameter(gl.BLEND_DST_RGB);
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this._prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buf);
      gl.enableVertexAttribArray(this._aPos);
      gl.vertexAttribPointer(this._aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform4f(this._u.u_rect, nx, ny, half / cnv.width * 2, half / cnv.height * 2);
      gl.uniform1f(this._u.u_half, half);
      gl.uniform1f(this._u.u_D, D);
      gl.uniform1f(this._u.u_L, L);
      gl.uniform1f(this._u.u_faceK, faceK);
      gl.uniform1f(this._u.u_aa, Math.max(1.0, dev * 0.6));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(this._aPos);
      gl.bindBuffer(gl.ARRAY_BUFFER, prevBuf);
      gl.useProgram(prevProg);
      gl.blendFunc(prevSrc, prevDst);
      if (!prevBlend) gl.disable(gl.BLEND);
      if (prevDepth) gl.enable(gl.DEPTH_TEST);
      gl.depthMask(prevDepthMask);
      if (prevStencil) gl.enable(gl.STENCIL_TEST);
      if (prevScissor) gl.enable(gl.SCISSOR_TEST);
    },
    onRemove(m, gl) { if (this._prog) gl.deleteProgram(this._prog); if (this._buf) gl.deleteBuffer(this._buf); this._prog = null; }
  }); // one WebGL layer: a quad on project(dispPos) per frame, shader-shaped, depth off (buildings never cover it)
}
// no trail layer: his trail is the streets marked done; the stored trail is a distance fallback only
function pickFontFromStyle() { // adopt a NOTO stack from the CURRENT basemap for our route labels
  // a guessed stack renders NO text: prefer a stack the style itself carries and mentions Noto
  try {
    const syms = (map.getStyle().layers || []).filter(l => l.type === 'symbol' && l.layout && l.layout['text-font']);
    const notoRoad = syms.find(l => /road|highway|street|label/i.test(l.id) && /noto/i.test(l.layout['text-font'].join(' ')));
    const notoAny = syms.find(l => /noto/i.test(l.layout['text-font'].join(' ')));
    const road = syms.find(l => /road|highway|street|label/i.test(l.id));
    const pick = (notoRoad || notoAny || road || syms[0] || {}).layout && (notoRoad || notoAny || road || syms[0]).layout['text-font'];
    if (pick && window.GLP) window.GLP.setFont(pick);
  } catch (e) { /* keep the default stack */ }
}
function onStyleReady() {
  glOk = true; noteMapState();
  pickFontFromStyle();
  if (routeLoaded && window.GLP && !map.getSource('centres')) window.GLP.init(map, GL_HOST);
  else if (routeLoaded && window.GLP) window.GLP.sync();
  for (const fn of [addReferenceLayers, addGpsLayers]) { try { fn(); } catch (e) { /* one bad layer must never kill the rest of the stack (the REFERENCE throw hid the GPS dot until 2026-10-30) */ } }
  pushGps(); if (routeLoaded) refreshAll(); // before a route is chosen the map is basemap-only: no route paint, no streets list, no count
}
onMapReady(() => map.on('load', onStyleReady));
let restackArmed = false;
function setBasemap() {
  map.setStyle(glStyleFor(isNight()), { diff: false }); // never a diff: a diff keeps errored tiles, so recovery never re-requested the basemap; a switch rebuilds fully
  if (restackArmed) return;
  restackArmed = true;
  const go = () => { if (!restackArmed) return; restackArmed = false; map.off('styledata', waiter); onStyleReady(); };
  const waiter = () => { // prototype swap rule: restack as soon as the new style actually has layers and our sources are gone
    const st = map.getStyle();
    if (st && st.layers && st.layers.length && !map.getSource('centres')) go();
  };
  map.once('style.load', go); // fast path
  map.on('styledata', waiter); // the reliable path
  setTimeout(go, 12000);       // last resort (go is guarded; onStyleReady is idempotent)
}

// ===== SELECTION + CHIPS =====
let sel = null; // {name, idx, anchor:[lat,lng]}
let selSet = []; // every stretch currently selected; sel/selStretch stay the anchor entry (last tapped) that positions the chips
let selStretch = null; // {name, idx} — the paint engine reads this global in syncSel()
let swallowClickUntil = 0;
function spendTap(ms) { swallowClickUntil = Date.now() + ms; } // app2 is the sole writer of its tap-swallow variable: others spend a tap through this setter only
function projLL(p) { return map.project([p[1], p[0]]); }
function ptSegDistPx(p, a, b) { const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy; let t = L2 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t)); }
function nearestStreet(pt) { let best = null, bd = Infinity; for (const n of STREETNAMES) for (const seg of ROADS[n]) for (let i = 1; i < seg.length; i++) { const d = ptSegDistPx(pt, projLL(seg[i - 1]), projLL(seg[i])); if (d < bd) { bd = d; best = n; } } return { name: best, d: bd }; }
function nearestStretch(name, pt) { let bi = 0, bd = Infinity; STRETCH[name].parts.forEach((part, idx) => { for (let i = 1; i < part.length; i++) { const d = ptSegDistPx(pt, projLL(part[i - 1]), projLL(part[i])); if (d < bd) { bd = d; bi = idx; } } }); return { idx: bi, d: bd }; }
function geoSideFrame(name, idx, anchorLL) {
  // side 0 = geographic left, side 1 = right (the engine's convention); returns the projection + left vector
  const part = STRETCH[name].parts[idx];
  const px = anchorLL[1] * MLNG, py = anchorLL[0] * MLAT;
  let best = { d: Infinity, gx: 0, gy: 0, lx: 0, ly: 0 };
  for (let i = 1; i < part.length; i++) {
    const ax = part[i - 1][1] * MLNG, ay = part[i - 1][0] * MLAT, bx = part[i][1] * MLNG, by = part[i][0] * MLAT;
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
    let t = ((px - ax) * vx + (py - ay) * vy) / L2; t = Math.max(0, Math.min(1, t));
    const gx = ax + vx * t, gy = ay + vy * t, d = Math.hypot(px - gx, py - gy);
    if (d < best.d) { const L = Math.sqrt(L2); best = { d, gx, gy, lx: -vy / L, ly: vx / L }; }
  }
  return { baseLL: [best.gy / MLAT, best.gx / MLNG], left: [best.lx, best.ly] }; // left = [east, north] unit
}
function clearChips() { $('chips').innerHTML = ''; }
const GROUP_PATH_JOIN_M = 20; // sections join into a drive when ends sit within this (true joins: 0 m; nearest non-join: 58.7 m)
function groupSideMap(side) { // a press toggles the driver's side along the tap-order drive, read off the anchor - not the raw side
  const n = selSet.length;
  const raw = selSet.map(() => side);
  if (n < 2) return raw;
  const ends = selSet.map(en => { const p = STRETCH[en.name].parts[en.idx]; return [p[0], p[p.length - 1]]; });
  const join = [null]; // join[k]: {a, b} = ends where selSet[k] joins selSet[k-1]; null = a new drive at k
  for (let k = 1; k < n; k++) {
    let best = null;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const d = distM(ends[k - 1][a], ends[k][b]); if (d <= GROUP_PATH_JOIN_M && (!best || d < best.d)) best = { a, b, d }; }
    join.push(best);
  }
  const drives = [];
  for (let k = 0; k < n; k++) { if (k === 0 || !join[k]) drives.push([]); drives[drives.length - 1].push(k); }
  const withDir = new Array(n).fill(null); // withDir[k]: section k is travelled as drawn; null = a single-section drive (no direction)
  for (const drv of drives) {
    if (drv.length < 2) continue;
    drv.forEach((k, pos) => {
      const enter = pos > 0 ? join[k].b : null;
      const exit = pos < drv.length - 1 ? join[k + 1].a : null;
      if (enter !== null && exit !== null) withDir[k] = enter === exit ? enter === 0 : (enter === 0 && exit === 1);
      else if (enter !== null) withDir[k] = enter === 0;
      else withDir[k] = exit === 1;
    });
  }
  let ai = selSet.findIndex(en => sel && en.name === sel.name && en.idx === sel.idx);
  if (ai < 0) ai = n - 1;
  if (withDir[ai] === null) return raw;
  const driverRight = withDir[ai] ? side === 1 : side === 0;
  return selSet.map((en, k) => { if (withDir[k] === null) return side; return driverRight ? (withDir[k] ? 1 : 0) : (withDir[k] ? 0 : 1); });
}
// a side reads done only when every stretch has the side this press would toggle on it (groupSideMap)
function groupSideDone(side) { const map = groupSideMap(side); return selSet.length > 0 && selSet.every((en, k) => !!(pieces[en.name][en.idx] & (map[k] ? 2 : 1))); }
function showChips() {
  clearChips();
  if (!sel) return;
  const wrap = $('chips');
  [0, 1].forEach(side => {
    const d = document.createElement('div');
    d.className = 'sideChip' + (groupSideDone(side) ? ' done' : '');
    d.dataset.side = side;
    d.innerHTML = '<button class="chipBtn" aria-label="mark side"></button>';
    d.querySelector('.chipBtn').addEventListener('click', ev => { ev.stopPropagation(); if (!tapGuard('chip' + side, ev)) return; togglePieceGroup(side); });
    wrap.appendChild(d);
  });
  positionChips();
}
function positionChips() {
  if (!sel || !map) return; // chips are placed by projection: with no map, throwing here would abort the rest of refreshSelUI
  const kids = $('chips').children; if (kids.length !== 2) return;
  const frame = geoSideFrame(sel.name, sel.idx, sel.anchor);
  const base = projLL(frame.baseLL);
  const probe = projLL([frame.baseLL[0] + frame.left[1] * 12 / MLAT, frame.baseLL[1] + frame.left[0] * 12 / MLNG]);
  let lx = probe.x - base.x, ly = probe.y - base.y; const LL = Math.hypot(lx, ly) || 1; lx /= LL; ly /= LL; // screen direction of geographic LEFT
  const cw = map.getCanvas().clientWidth, ch = map.getCanvas().clientHeight;
  // clamp the base point into the canvas first: clamping each chip independently squeezed them together at edges
  base.x = Math.max(62, Math.min(cw - 62, base.x)); base.y = Math.max(62, Math.min(ch - 62, base.y));
  [0, 1].forEach(side => {
    const sgn = side === 0 ? 1 : -1; // side 0 sits on geographic LEFT, side 1 on geographic RIGHT - the same sides the engine paints
    let dx = lx * sgn, dy = ly * sgn;
    let x = base.x + dx * 40, y = base.y + dy * 40;
    x = Math.max(22, Math.min(cw - 22, x)); y = Math.max(22, Math.min(ch - 22, y));
    kids[side].style.left = (x - 20) + 'px'; kids[side].style.top = (y - 20) + 'px';
    const done = groupSideDone(side);
    const btn = kids[side].querySelector('.chipBtn');
    const ang = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
    const ckey = done ? 'done' : 'a' + ang;
    if (btn.dataset.k !== ckey) { // positionChips runs on every map move: rebuild the SVG only when the picture changes (done state, arrow direction)
      btn.dataset.k = ckey;
      btn.innerHTML = done
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 L9.5 18 L20 6"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(' + ang + 'deg)"><path d="M4 12 H19 M13 5.5 L19.5 12 L13 18.5"/></svg>';
    }
  });
}
onMapReady(() => map.on('move', positionChips));
function refreshSelUI() { if (window.GLP) window.GLP.syncSel(); showChips(); renderPanel(); }
function selectStretch(name, idx, anchor) { selSet = [{ name, idx, anchor }]; sel = { name, idx, anchor }; selStretch = { name, idx }; refreshSelUI(); } // a fresh single selection (streets list, drives)
function tapStretch(name, idx, anchor) { // map taps ACCUMULATE: tapping a selected stretch removes just it; the anchor follows the last remaining selection
  const i = selSet.findIndex(en => en.name === name && en.idx === idx);
  if (i >= 0) selSet.splice(i, 1); else selSet.push({ name, idx, anchor });
  if (!selSet.length) { deselect(); return; }
  const top = selSet[selSet.length - 1];
  sel = { name: top.name, idx: top.idx, anchor: top.anchor }; selStretch = { name: top.name, idx: top.idx };
  refreshSelUI();
}
function deselect() { sel = null; selStretch = null; selSet = []; clearChips(); if (window.GLP) window.GLP.syncSel(); renderPanel(); }
onMapReady(() => map.on('click', e => {
  if (creating) return; // in the create flow, map taps pick streets for the DRAFT: they never mark the active route
  if (Date.now() < swallowClickUntil) return;
  const pt = map.project([e.lngLat.lng, e.lngLat.lat]);
  const near = nearestStreet(pt);
  const tol = (window.GLP && GLP.tapTolPx) ? GLP.tapTolPx(map.getZoom()) : 24;
  // tolerance comes from the engine (GLP.tapTolPx), following the widest paint at this zoom, floored at 24 px
  if (near.name && near.d <= tol) { const st = nearestStretch(near.name, pt); tapStretch(near.name, st.idx, [e.lngLat.lat, e.lngLat.lng]); }
  else deselect();
}));

// ===== MARKING (one finish path) =====
let saveWarned = false; // the storage-warning episode state: one warning per failure episode; resets on the next fully successful save
// the non-transactional path: saveAll plus the episode warning; the finish transaction calls saveAll with its own messaging
function saveAllWarned() { const r = saveAll();
  if (!r.ok) { if (!saveWarned) { saveWarned = true; showBanner('Not saving', (r.failedKey || 'Changes') + ' could not be saved - export a recovery backup now'); } }
  else saveWarned = false; return r; }
// callers that announce an outcome branch on the save result - since the storage-outcome object, that is the object
function finishChange() { if (window.GLP) window.GLP.sync(); renderPanel(); updateCount(); renderStreets(); const r = saveAllWarned(); syncWake(); return r; }
// on failure, no outcome banner replaces the storage warning; if it already fired, 'not saved' is owed
function finishChangeMarked() { const wb = saveWarned; const r = finishChange(); if (!r.ok && wb) showBanner('Not saved'); return r; }
function applyPiece(name, idx, side, on) { // mutation is BOARD.setSide; this wrapper fires completion feedback on the false-to-true flip, returns the name
  const t = BOARD.setSide(name, idx, side, on);
  if (t.completed) onStreetComplete(t.completed);
  return t.completed;
}
function togglePiece(name, idx, side) {
  const bit = side ? 2 : 1;
  applyPiece(name, idx, side, !(pieces[name][idx] & bit));
  showChips(); finishChangeMarked();
}
function togglePieceGroup(side) { // one chip, selection: not-done-everywhere completes everywhere, done-everywhere clears; the side is the driver's (groupSideMap)
  if (!selSet.length) return;
  const on = !groupSideDone(side);
  const map = groupSideMap(side);
  selSet.forEach((en, k) => { applyPiece(en.name, en.idx, map[k], on); });
  showChips(); finishChangeMarked();
}
// the outcome is an OBJECT: {ok:false} is truthy, so branch on .ok, never the object
$('selAllBtn').addEventListener('click', ev => { if (!tapGuard('selAll', ev)) return; for (const en of selSet) for (const side of [0, 1]) { applyPiece(en.name, en.idx, side, true); } showChips(); finishChangeMarked(); });
$('selClearBtn').addEventListener('click', ev => { if (!tapGuard('selClear', ev)) return; deselect(); });
function markDone(name, via, at) { // mutation is BOARD.completeStreet: marked sides keep their real times, the rest inherit the completion moment
  const t = BOARD.completeStreet(name, via, at);
  if (t.flipped) onStreetComplete(name); // whole-street marking bypasses applyPiece: the completion feedback fires only on a real false-to-true flip here too
  finishChangeMarked(); // the total derives from the route's street list
}
function markUndone(name) { // the mutation is BOARD.clearStreet; the finish stays here
  BOARD.clearStreet(name);
  finishChangeMarked();
}
function markStreet(name, done) { if (done) markDone(name, 'tap'); else markUndone(name); showChips(); }
function renderPanel() { // one selection pop-up: header strip and multi-select pill are the same pop-up (pill glass, every action inside)
  const p = $('selPop');
  if (!sel) { p.classList.add('hidden'); return; }
  p.classList.remove('hidden'); // renderPanel no longer raises body.selOpen: its consumer is retired; the button holds its seat in every state
  const multi = selSet.length >= 2; // single and multi are the SAME size: same box, same two rows; only the words and buttons change
  if (!multi) {
    $('selName').textContent = sel.name;
    const total = STRETCH[sel.name].parts.length;
    const val = pieces[sel.name][sel.idx];
    const doneSides = (val & 1 ? 1 : 0) + (val & 2 ? 1 : 0);
    // concise: the chips on the map already show WHICH side
    $('selStatus').textContent = 'Stretch ' + (sel.idx + 1) + ' of ' + total + (streetComplete(sel.name) ? ' · street complete' : doneSides === 2 ? ' · both sides done' : doneSides === 1 ? ' · 1 of 2 sides done' : '');
  } else {
    $('selName').textContent = selSet.length + ' sections selected';
    let dn = 0; for (const en of selSet) { const v = pieces[en.name][en.idx]; dn += (v & 1 ? 1 : 0) + (v & 2 ? 1 : 0); }
    $('selStatus').textContent = dn + ' of ' + (selSet.length * 2) + ' sides done'; // multi carries the same second line a single does: the sides tally for the whole set
  }
  $('selStatus').style.display = '';
  $('selNote').style.display = multi ? 'none' : ''; // multi carries ONLY the count, Mark both sides and Clear - the reference pill's contents, nothing crammed
  $('selAllBtn').style.display = multi ? '' : 'none';
  $('selClearBtn').style.display = multi ? '' : 'none';
  const b = $('selBtn');
  b.style.display = multi ? 'none' : '';
  if (!multi) {
    if (streetComplete(sel.name)) { b.textContent = 'Mark not done'; b.className = 'notdone'; b.disabled = false; }
    else { b.textContent = 'Complete entire road'; b.className = ''; b.disabled = false; } // the button completes the whole road (markStreet) and says so: the label implied only the stretch
  }
}
$('selBtn').addEventListener('click', ev => { if (!sel || !tapGuard('selBtn', ev)) return; markStreet(sel.name, !streetComplete(sel.name)); });
$('selNote').addEventListener('click', ev => { if (!sel || !tapGuard('selNote', ev)) return; openNote(sel.name); });
function updateCount() {
  const n = STREETNAMES.filter(streetComplete).length;
  const tw = totalWorkM(); // the share's denominator, read once and guarded: an empty route divided by zero and read 'NaN%'
  const pct = tw > 0 ? Math.round(workDoneM() / tw * 100) : 0;
  // the meter fills with the same fraction the % uses; the total derives from the street list
  $('countTxt').textContent = n + ' of ' + STREETNAMES.length + ' · ' + pct + '%'; $('countFill').style.width = (tw > 0 ? (workDoneM() / tw * 100) : 0) + '%';
  $('stats').textContent = statsLine();
  $('startBtn').style.display = runStart ? 'none' : '';
  $('cancelStartBtn').style.display = runStart ? '' : 'none'; // Cancel start is offered for the whole run: it erases the run's records, marks included
  $('resetBtn').style.display = runStart ? '' : 'none';
  $('count').style.visibility = runStart ? 'visible' : 'hidden'; // the done pill shows only while a clean runs; visibility only, its dock slot permanently reserved
}

// ===== LIST SHEET =====
let listFilter = 'primaries'; // the Streets filter is the route's two groups: Primaries (gold) or Secondaries (raspberry); Primaries is the opening view
const NOTEEDIT = { // the note session owner: the editor's state and acts live here, not in the renderer
  openFor: null, // the street whose editor is open (the user's intent)
  edFor: null, // noteEdFor names the street whose editor is actually in the DOM: the draft's owner
  saveTimer: 0, // the pending debounced save; 0 = none armed
  raiseActive: false, // true while the sheet is at full because the editor raised it: a user's full sheet is never lowered
  capture(el) { const openEd = el.querySelector('.noteEd textarea'); return { draft: openEd ? openEd.value : null, draftFor: openEd ? this.edFor : null }; },
  // the flush's result is kept: fresh failures ride the warning; a suppressed one is owed 'not saved'
  flushSwitch(draft, draftFor) { clearTimeout(this.saveTimer); const wb = saveWarned; const r = setNoteText(draftFor, draft); if (!r.ok && wb) showBanner('Not saved'); },
  flushRebuild(draft, draftFor) { clearTimeout(this.saveTimer); this.saveTimer = 0; return setNoteText(draftFor, draft).ok; }, // setNoteText returns an OBJECT: {ok:false} is truthy, so the flush returns .ok, never the object
  scheduleSave(n, ta, hint, paintNt) { hint.textContent = 'Saving…'; clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => { const ok = setNoteText(n, ta.value); paintNt(); hint.textContent = ok.ok ? 'Saved ✓' : 'Not saved - Storage problem'; }, 400); }, // Beta 1.63 (audit F04): the hint tells the truth about the write
  // blur finalizes like the debounced save (same result, same hint): a failed blur save must say so
  saveNow(n, ta, hint, paintNt) { clearTimeout(this.saveTimer); const ok = setNoteText(n, ta.value); paintNt(); hint.textContent = ok.ok ? 'Saved ✓' : 'Not saved - Storage problem'; },
  toggle(n) { this.openFor = this.openFor === n ? null : n; },
  close() { this.openFor = null; },
  collapse() { if (!this.openFor) return false; this.openFor = null; return true; },
  reset() { this.openFor = null; this.edFor = null; if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = 0; } },
  takeDraft(n, draft, draftFor) { this.edFor = n; return (draft !== null && draftFor === n) ? draft : noteTextOf(n); },
  detach() { this.edFor = null; }
};
let srowCache = { sig: '', rows: new Map() }; // rows kept between renders when the visible set is unchanged
function resetStreetsSession() { // app2's route-switch reset (called by resetSwitchSession): the session's reset knowledge lives here, with its state
  deselect(); // selection + chips + the engine's selection, through the one proven path
  NOTEEDIT.reset(); // the note editor's pending debounced save must never fire into the new route (its flush already happened via collapseNoteEditor)
  listFilter = 'primaries'; document.querySelectorAll('#filters button').forEach(x => x.classList.toggle('on', x.dataset.f === 'primaries'));
  srowCache = { sig: '', rows: new Map() };
  saveWarned = false; // the storage-warning episode belonged to the outgoing route's saves
}
function fmtLenM(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' m'; }
function streetHalf(n) { const p = pieces[n]; return Array.isArray(p) && !streetComplete(n) && p.some(v => v !== 0); } // one side done: some bit set on some stretch, street not complete; list and Pace share this predicate
function srowClass(n) { return 'srow' + (streetComplete(n) ? ' done' : '') + (PRIMARIES.has(n) ? ' primary' : '') + (streetHalf(n) ? ' half' : ''); }
function srowStatus(n) { // the status slot: completed keeps the full string; else 'completed', 'one side done', or an em dash
  const flag = (Array.isArray(notes[n]) && notes[n].some(f => f.k !== 'note')) ? '⚑ ' : ''; // Array.isArray, not truthiness: a 'constructor' street would read the inherited member and .some would throw
  const doneAt = streetComplete(n) && doneTimes[n] ? fmtWhen(doneTimes[n]) : '';
  if (doneAt) return { t: flag + 'done ' + doneAt + ' (' + fmtAgo(doneTimes[n]) + ')', c: 'st-done' };
  if (streetComplete(n)) return { t: flag + 'completed', c: 'st-done' };
  if (streetHalf(n)) return { t: flag + 'one side done', c: 'st-half' };
  return { t: flag + '–', c: 'st-todo' };
} // street-length display for the quiet line: whole metres, thousands separator, never kilometres
function renderStreets() { // tap a street's name area to open its note editor (auto-saves); the pin button flies to the street
  const el = $('streetList'); if (!el) return;
  const scroller = $('sheetBody'); const keepScroll = scroller ? scroller.scrollTop : 0; // a rebuild must not yank the list back to the top while he is working in it
  const { draft, draftFor } = NOTEEDIT.capture(el); // an in-progress note survives re-renders: the draft belongs to its street only, never another's editor
  if (draft !== null && draftFor && draftFor !== NOTEEDIT.openFor) NOTEEDIT.flushSwitch(draft, draftFor); // switching streets finalizes the old editor against ITS street first (a destroyed editor's blur is not guaranteed to fire)
  let noteFlushed = false, noteFlushFailed = false; // a same-street rebuild replaces the editor too: finalize its pending save here, synchronously, not by its timer
  if (draft !== null && draftFor && draftFor === NOTEEDIT.openFor && NOTEEDIT.saveTimer) { if (NOTEEDIT.flushRebuild(draft, draftFor)) noteFlushed = true; else noteFlushFailed = true; }
  const arr = STREETNAMES.filter(n => (listFilter === 'primaries') === PRIMARIES.has(n)); // the visible set is exactly the selected group (6 primaries or 28 secondaries on Route 5W)
  arr.sort((a, b) => ((PRIMARIES.has(a) ? 0 : 1) - (PRIMARIES.has(b) ? 0 : 1)) || a.localeCompare(b));
  // the fixed head rewrites per render from the dock pill's own state (Road km = side-metres / 2000)
  const stR = $('stRouteN'), stS = $('stRouteS');
  if (stR && stS) { stR.textContent = activeRoute ? activeRoute.name : ''; stS.textContent = (activeRoute && activeRoute.area ? ' · ' + activeRoute.area : '') + (runStart ? ' · clean in progress' : ' · not started'); }
  const stH = $('stHero');
  if (stH) { const tw = totalWorkM(); stH.innerHTML = '<div class="stHeroN">' + STREETNAMES.filter(streetComplete).length + ' <span class="stHeroU">/ ' + STREETNAMES.length + ' streets</span></div><div class="stHeroL">streets completed so far</div><div class="stBar"><div class="stBarF" style="width:' + (tw > 0 ? (workDoneM() / tw * 100) : 0) + '%"></div></div><div class="stCaps"><span>' + (workDoneM() / 2000).toFixed(1) + ' km of road cleared</span><span>' + (tw / 2000).toFixed(1) + ' km total</span></div>'; }
  const stGN = $('stGroupN'), stGC = $('stGroupC');
  // the list leads with the primaries (gold, cleaned first), then the secondaries (raspberry), alphabetical inside each colour
  if (stGN && stGC) { stGN.textContent = listFilter === 'primaries' ? 'PRIMARIES' : 'SECONDARIES'; stGC.textContent = ' · ' + arr.length + ' streets'; }
  // unreachable with shipped route data (both groups non-empty by construction): kept as the safety net it was
  if (!arr.length) { el.innerHTML = '<div style="padding:14px 4px;color:#8fa0b3">No streets in this group</div>'; srowCache = { sig: '', rows: new Map() }; return; }
  // unchanged set/order and no editor open: update in place; anything structural rebuilds fully
  const sig = listFilter + '|' + arr.join(',');
  if (!NOTEEDIT.openFor && sig === srowCache.sig && !el.querySelector('.noteEd')) {
    let okAll = srowCache.rows.size === arr.length;
    if (okAll) for (const n of arr) { const c = srowCache.rows.get(n); if (!c || c.row.parentElement !== el) { okAll = false; break; } }
    if (okAll) {
      for (const n of arr) { srowCache.rows.get(n).paintNt(); } // paintNt is the row painter (class, status, note icon, quiet line): the cache path just calls it
      if (scroller) scroller.scrollTop = keepScroll;
      kbSync(); // renders never touch the kb class: the keyboard owner (app4) reconciles
      return;
    }
  }
  el.innerHTML = '';
  srowCache = { sig, rows: new Map() };
  arr.forEach(n => {
    const d = document.createElement('div');
    d.className = srowClass(n);
    d.innerHTML = '<div class="dot"></div><div class="nwrap"><div class="nmrow"><div class="nm"></div><button class="sbtn sloc">Locate</button><span class="nmNote" style="display:none"></span></div><div class="nt"><span class="ntIco"></span><span class="ntTxt"></span></div></div><div class="tm"></div>'; // Beta 1.184: the pin rides INSIDE the name row, immediately right of the name; a note icon joins it only while the street carries note text; the COMPLETED pill is retired - its state folds into the status slot (srowStatus). Beta 1.228 (Andrew): the pin is a labelled 'Locate' pill now - same seat in the name row, same handler below, but a word instead of a bare glyph (the glyph was too small to hit cleanly, and its press read as the row's own)
    d.querySelector('.nm').textContent = n;
    const ntEl = d.querySelector('.nt');
    d.querySelector('.ntIco').innerHTML = ICONS.note; d.querySelector('.nmNote').innerHTML = ICONS.note; // glyphs ride the chosen pack (ICONS.*), re-stamped on a switch; the locate control is stamped with nothing
    const paintNt = () => { // one painter for row state: class, status, note icon, quiet line (length, or note text while it exists)
      d.className = srowClass(n);
      const st = srowStatus(n); const tmEl = d.querySelector('.tm'); tmEl.textContent = st.t; tmEl.className = 'tm ' + st.c;
      const t = noteTextOf(n);
      d.querySelector('.nmNote').style.display = t ? '' : 'none';
      if (t) { d.querySelector('.ntTxt').textContent = t; d.querySelector('.ntIco').style.display = ''; ntEl.style.display = ''; }
      else { d.querySelector('.ntTxt').textContent = fmtLenM(STRETCH[n].total); d.querySelector('.ntIco').style.display = 'none'; ntEl.style.display = ''; }
    };
    paintNt();
    d.querySelector('.sloc').addEventListener('click', e => {
      e.stopPropagation();
      if (!tapGuard('li' + n, e)) return;
      closeSheets();
      const c = STRETCH[n].line[Math.floor(STRETCH[n].line.length / 2)];
      map.flyTo({ center: [c[1], c[0]], zoom: Math.max(map.getZoom(), 15.5) });
      selectStretch(n, 0, c);
    });
    d.addEventListener('click', () => {
      NOTEEDIT.toggle(n);
      renderStreets();
      const ta = el.querySelector('.noteEd textarea');
      if (ta) { ta.focus(); setTimeout(() => { const t2 = el.querySelector('.noteEd textarea'); const sc = $('sheetBody'); if (t2 && sc) { const tr = t2.getBoundingClientRect(), sr = sc.getBoundingClientRect(); if (tr.bottom > sr.bottom) sc.scrollTop += tr.bottom - sr.bottom + 8; else if (tr.top < sr.top) sc.scrollTop -= sr.top - tr.top + 8; } }, 400); } // Beta 1.56: container-local ensure-visible - 1.31's smooth scrollIntoView panned the whole page and fought iOS's own focus pan (external audit B4, 2026-11-01); adjusting the sheet's own scroll position moves nothing else
    });
    el.appendChild(d);
    srowCache.rows.set(n, { row: d, paintNt });
    if (NOTEEDIT.openFor === n) {
      const ed = document.createElement('div');
      ed.className = 'noteEd';
      ed.innerHTML = '<div class="nedLbl"></div><textarea placeholder="Note for this street. E.g. driveway at #12 could not be cleaned, car blocking"></textarea><div class="nedActs"><button class="nedSave">Save note</button><button class="nedDone">Done</button><div class="nhint">Saves automatically</div></div>'; // Beta 1.184: the redesign editor furniture - a Note label and explicit Save/Done actions over the SAME autosave mechanism (Save flushes the same setNoteText call now; Done closes the editor, like tapping the row again)
      ed.querySelector('.nedLbl').textContent = 'Note: ' + n;
      const ta = ed.querySelector('textarea');
      ta.value = NOTEEDIT.takeDraft(n, draft, draftFor);
      // a failed flush says so, never 'Saved': the editor tells the truth about the finalized save
      const hint = ed.querySelector('.nhint'); if (noteFlushFailed && n === draftFor) hint.textContent = 'Not saved - Storage problem'; else if (noteFlushed && n === draftFor) hint.textContent = 'Saved \u2713';
      ta.addEventListener('input', () => { NOTEEDIT.scheduleSave(n, ta, hint, paintNt); });
      ta.addEventListener('blur', () => { NOTEEDIT.saveNow(n, ta, hint, paintNt); });
      ed.querySelector('.nedSave').addEventListener('click', () => { NOTEEDIT.saveNow(n, ta, hint, paintNt); });
      ed.querySelector('.nedDone').addEventListener('click', () => { NOTEEDIT.close(); renderStreets(); });
      el.appendChild(ed);
    }
  });
  if (scroller) scroller.scrollTop = keepScroll;
  if (!el.querySelector('.noteEd')) { NOTEEDIT.detach(); kbSync(); } // an editor removed by a rebuild reports to the owner (kbSync), or the kb state sticks on
  syncNoteSheetRaise(); // the editor's sheet raise follows the editor's existence on every render
}
function syncNoteSheetRaise() { // at full while an editor is open: only then can the region lift the field above the keyboard
  const sh = $('sheet'); if (!sh) return;
  if (NOTEEDIT.openFor && sh.classList.contains('open')) {
    if (!sh.classList.contains('full')) { sh.classList.add('full'); sh.style.maxHeight = 'none'; sh.style.height = sheetFullH(vvHeight()) + 'px'; NOTEEDIT.raiseActive = true; }
  } else if (NOTEEDIT.raiseActive) {
    NOTEEDIT.raiseActive = false;
    if (sh.classList.contains('open')) { sh.classList.remove('full'); sh.style.height = ''; sh.style.maxHeight = ''; }
  }
}
function collapseNoteEditor() { // closing resets the list (no editor survives to the next open); the re-render finalizes pending saves first
  if (NOTEEDIT.collapse()) renderStreets();
}
document.querySelectorAll('#filters button').forEach(b => b.addEventListener('click', () => { listFilter = b.dataset.f; document.querySelectorAll('#filters button').forEach(x => x.classList.toggle('on', x === b)); renderStreets(); }));
function closeSheetEl(s) { // the close animates: freeze the height for the whole slide-down, clear it only when the motion ends
  cancelSheetSpring(s);
  if (s.id === 'sheet') collapseNoteEditor(); // any animated close of the Streets sheet resets an open note editor first
  if (!s.classList.contains('open')) { s.classList.remove('full'); s.classList.remove('dragging'); return; }
  const h = s.offsetHeight;
  s.style.height = h + 'px'; s.style.maxHeight = 'none'; s.style.transform = '';
  s.classList.remove('open'); s.classList.remove('full'); s.classList.remove('snapping'); s.classList.remove('dragging'); // the base (closing) transition and curve own the motion from here
  setTimeout(() => { if (!s.classList.contains('open')) { s.style.height = ''; s.style.maxHeight = ''; } }, 480);
}
function closeSheets() { document.querySelectorAll('.sheet').forEach(closeSheetEl); } // every sheet by class, present and future: no hand-kept list to fall behind a new menu
// the drag/flick zone is the empty top strip (handle + title row): content below is pure scrolling
const SHEET_DEF_VH = 0.50, SHEET_FULL_VH = 0.94, SHEET_MIN_PX = 150; // the three stops: closed, half (SHEET_DEF_VH), full (sheetFullH's title cap; SHEET_FULL_VH is the fallback)
const SHEET_FULL_MARGIN_PX = 8; // the full stop stands this far above the title's edge: covers the title, never the screen top
function sheetFullH(vh) { // the full stop's height, measured per call (drags are rare; a stale cache is how geometry rules drift)
  const t = document.querySelector('#hud .title');
  if (!t) return vh * SHEET_FULL_VH;
  const r = t.getBoundingClientRect();
  if (!r.height) return vh * SHEET_FULL_VH;
  const vvTop = window.visualViewport ? window.visualViewport.offsetTop : 0;
  return vh - Math.max(0, r.top - vvTop - SHEET_FULL_MARGIN_PX);
}
// a release runs a damped spring (omega 30/s) starting at velocity: a from-rest snap read as 'just disappears'
const SHEET_OMEGA = 30;
function cancelSheetSpring(sheet) { if (sheet._spring) { cancelAnimationFrame(sheet._spring); sheet._spring = null; } }
function springSheet(sheet, q0, qT, v0, apply, finish) {
  cancelSheetSpring(sheet);
  // closed form, not per-frame Euler: integration diverged at low frame rates; this is exact at any rate
  const A = q0 - qT, B = Math.max(-4000, Math.min(4000, v0)) + SHEET_OMEGA * A;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(qT); finish(); return; }
  // clock starts at the first frame's rAF timestamp: starting mid-frame made step one extrapolate backwards
  let t0 = null;
  const step = now => {
    if (t0 === null) t0 = now;
    const t = (now - t0) / 1000;
    const e = Math.exp(-SHEET_OMEGA * t);
    const q = qT + (A + B * t) * e;
    const vel = (B - SHEET_OMEGA * (A + B * t)) * e;
    if ((Math.abs(q - qT) < 0.7 && Math.abs(vel) < 15) || t > 1) { apply(qT); sheet._spring = null; finish(); return; }
    apply(q); sheet._spring = requestAnimationFrame(step);
  };
  sheet._spring = requestAnimationFrame(step);
}
function makeSheetDraggable(sheet) {
  let startY = 0, lastY = 0, startH = 0, dragging = false, moved = false, pid = null, panelMoved = false, samples = [];
  sheet.addEventListener('pointerdown', e => {
    if (dragging) return;
    if (e.target.closest('button')) return; // buttons keep their taps
    if (!e.target.closest('.grab, .sheetHead')) return; // drags start only in the empty top strip
    dragging = true; moved = false; panelMoved = false; pid = e.pointerId;
    startY = lastY = e.clientY; startH = sheet.offsetHeight;
    samples = [{ t: performance.now(), y: e.clientY }];
  });
  sheet.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== pid) return;
    const dy = e.clientY - lastY; lastY = e.clientY;
    const total = startY - e.clientY; // +ve = finger travelled up
    if (!moved && Math.abs(total) < 3) return; // near-zero dead zone: the old 9 px threshold was the first hitch of the drag hesitation
    if (!moved) {
      moved = true;
      if (sheet._spring) { cancelSheetSpring(sheet); sheet.style.transform = ''; startY = e.clientY; lastY = e.clientY; startH = sheet.offsetHeight; samples = [{ t: performance.now(), y: e.clientY }]; } // a catch mid-settle restarts the drag from the sheet's live height
      sheet.classList.add('dragging'); sheet.classList.remove('snapping');
      try { sheet.setPointerCapture(pid); } catch (err) {}
    }
    const vh = vvHeight();
    // the panel follows the finger (the content area below the top strip scrolls natively - drags can't start there)
    const h = Math.max(SHEET_MIN_PX, Math.min(sheetFullH(vh), startH + total));
    sheet.style.maxHeight = 'none';
    sheet.style.height = h + 'px';
    panelMoved = true;
    samples.push({ t: performance.now(), y: e.clientY });
    if (samples.length > 8) samples.shift();
    e.preventDefault();
  });
  const end = e => {
    if (!dragging || (e && e.pointerId !== pid)) return;
    dragging = false;
    if (!moved) return;
    // swallow the click this drag would otherwise deliver to a row/button
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); document.removeEventListener('click', swallow, true); };
    document.addEventListener('click', swallow, true);
    setTimeout(() => document.removeEventListener('click', swallow, true), 350);
    const vh = vvHeight(), h = sheet.offsetHeight, defH = vh * SHEET_DEF_VH;
    // the default stop targets the natural height, not defH: short sheets sprang to half, then snapped back
    const naturalH = (() => { const ph = sheet.style.height, pm = sheet.style.maxHeight; sheet.style.height = ''; sheet.style.maxHeight = ''; const nh = sheet.offsetHeight; sheet.style.height = ph; sheet.style.maxHeight = pm; return nh; })();
    // velocity from the last ~130 ms of movement (px/ms, up positive): the spring starts at it
    let v = 0;
    if (panelMoved && samples.length > 1) {
      const now = performance.now();
      const s0 = samples.find(s => now - s.t <= 130) || samples[0];
      const dt = now - s0.t;
      if (dt >= 30) v = (s0.y - lastY) / dt;
    }
    // a swipe throws the panel to its next stop on release - only when the panel itself moved
    const flick = panelMoved && Math.abs(v) > 0.30 ? (v > 0 ? 1 : -1) : 0;
    const settleStop = targetH => { // spring the height to a stop; end state = the old snap's end state
      const isFull = targetH >= sheetFullH(vh) - 1;
      if (isFull) sheet.classList.add('full'); else sheet.classList.remove('full');
      sheet.style.maxHeight = 'none';
      springSheet(sheet, h, targetH, v * 1000, q => { sheet.style.height = q + 'px'; }, () => {
        sheet.classList.remove('dragging');
        if (isFull) sheet.style.height = sheetFullH(vh) + 'px';
        else { sheet.style.height = ''; sheet.style.maxHeight = ''; }
      });
    };
    const settleClose = () => { // spring the sheet off the bottom edge at the finger's speed, then land closed
      sheet.classList.remove('full');
      sheet.style.height = h + 'px'; sheet.style.maxHeight = 'none';
      springSheet(sheet, 0, h * 1.05 + 8, -v * 1000, q => { sheet.style.transform = 'translateY(' + q + 'px)'; }, () => {
        sheet.classList.remove('open');
        sheet.style.height = ''; sheet.style.maxHeight = ''; sheet.style.transform = '';
        if (sheet.id === 'sheet') collapseNoteEditor(); // a drag/flick close lands here, not in closeSheetEl: the note-editor reset rides both close funnels
        // the close lands under .dragging: closed state settles first; .dragging lifts two frames later, unanimated
        requestAnimationFrame(() => requestAnimationFrame(() => { if (!sheet.classList.contains('open')) sheet.classList.remove('dragging'); }));
      });
    };
    if (flick > 0) { settleStop(sheetFullH(vh)); return; }
    if (flick < 0) { if (sheet.classList.contains('full')) settleStop(naturalH); else settleClose(); return; }
    if (h < defH * 0.55) { settleClose(); return; }
    if (h > (defH + sheetFullH(vh)) / 2) { settleStop(sheetFullH(vh)); return; }
    settleStop(naturalH);
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
}
makeSheetDraggable($('sheet'));
makeSheetDraggable($('pacePanel'));
// one route surface (boot splash and Routes tab share it); the loaded-route marker is a tab-mode-only signal
function routeRowShell(tag, name, sub, opts) { // the one builder: every row builds here (one place to drift); text via textContent, never markup
  opts = opts || {};
  const b = document.createElement(tag || 'button'); b.className = 'routeRow' + (opts.cls ? ' ' + opts.cls : '');
  const meta = document.createElement('span'); meta.className = 'routeMeta';
  const nm = document.createElement('span'); nm.className = 'routeName'; nm.textContent = name;
  meta.appendChild(nm);
  if (sub != null) { const ar = document.createElement('span'); ar.className = 'routeArea'; ar.textContent = sub; meta.appendChild(ar); }
  b.appendChild(meta);
  if (opts.chevron) { const chev = document.createElement('span'); chev.className = 'routeChev'; chev.textContent = '›'; b.appendChild(chev); }
  return b;
}
function routeRowEl(p) { // rows are nodes (textContent, never innerHTML); a row is a div - buttons cannot nest in a <button>
  const tab = $('routeMenu').classList.contains('tab');
  const b = routeRowShell('div', p.name, p.area + ' · ' + Object.keys(p.roads).length + ' streets'); b.dataset.route = p.id;
  // the route's Glyph check sits at the pill's right edge, appended last; its alt serves screen readers
  if (tab && activeRoute && activeRoute.id === p.id) { const ck = document.createElement('img'); ck.className = 'routeCheck'; ck.alt = 'Currently loaded'; ck.src = GLYPH_MENU.check; b.appendChild(ck); }
  return b;
}
function routeDropEl(p) { // dropdown (the row's sibling): Load over Delete, or the inert Loaded pill; Delete lives on every route
  const tab = $('routeMenu').classList.contains('tab');
  const card = document.createElement('div'); card.className = 'routeDrop'; card.dataset.route = p.id;
  const top = document.createElement('button'); top.type = 'button';
  if (tab && activeRoute && activeRoute.id === p.id) { top.className = 'dropLoaded'; top.textContent = 'Loaded'; } else { top.className = 'dropLoad'; top.textContent = 'Load'; }
  const del = document.createElement('button'); del.type = 'button'; del.className = 'dropDel'; del.textContent = 'Delete';
  const inn = document.createElement('div'); inn.className = 'routeDropIn'; inn.appendChild(top); inn.appendChild(del); card.appendChild(inn); // the pills ride an inner slider inside the growing clip (translateY(-100%) to 0)
  return card;
}
// each row renders with its dropdown card as its sibling
function renderRouteLists() { document.querySelectorAll('.routeList').forEach(el => { el.replaceChildren(...ROUTE_PACKS.flatMap(p => [routeRowEl(p), routeDropEl(p)])); menuListFade(el); }); }
function menuListFade(el) { // edges feather only while hiding content (30 px covered, none at rest); the arrow lives here too
  if (!el) return; const max = el.scrollHeight - el.clientHeight; el.classList.toggle('fadeT', el.scrollTop > 1); el.classList.toggle('fadeB', max > 1 && el.scrollTop < max - 1); if (el.id === 'crCityList') { const a = $('crCityArrow'); if (a) { const over = max > 1; a.classList.toggle('gone', !over); a.classList.toggle('hide', over && el.scrollTop > 1); } } }
function wireRouteRows(container, choose) { container.addEventListener('click', e => { // delegation sorts taps by target: Delete asks, Load chooses, Loaded spends it, anywhere else toggles the dropdown
  const del = e.target.closest('.dropDel'); if (del) { askDeleteRoute(del.closest('.routeDrop').dataset.route); return; }
  const load = e.target.closest('.dropLoad'); if (load) { choose(load.closest('.routeDrop').dataset.route); return; }
  if (e.target.closest('.dropLoaded')) return;
  const row = e.target.closest('.routeRow'); if (!row) return;
  const drop = row.nextElementSibling; if (!drop || !drop.classList.contains('routeDrop')) return;
  const wasOpen = drop.classList.contains('open');
  container.querySelectorAll('.routeDrop.open').forEach(d => { if (d !== drop) ddClose(d); }); // one open at a time, and the others now CLOSE (335 ms) rather than vanish
  if (wasOpen) ddClose(drop); else ddOpen(drop);
}); }
function ddOpen(drop) { // show, reflow (growth from height 0), then .open; a pending close timer cancels first
  const row = drop.previousElementSibling;
  clearTimeout(drop._ddT);
  const pane = drop.closest('.rmPane'); // an open pins the pane's top margin at its seat: growth runs purely downward, nothing above moves
  if (pane && !pane._ddPin) { pane._ddPin = true; let mt = parseFloat(getComputedStyle(pane).marginTop); if (!isFinite(mt)) mt = pane.getBoundingClientRect().top - pane.parentElement.getBoundingClientRect().top - 24; pane.style.marginTop = mt + 'px'; }
  drop.style.display = 'block';
  void drop.offsetHeight;
  drop.classList.add('open'); if (row && row.classList.contains('routeRow')) row.classList.add('ddOpen');
  const l = drop.closest('.routeList'); if (l) setTimeout(() => menuListFade(l), 430);
}
function ddClose(drop) { // close runs 335 ms on --ease-close; only when it has landed does the card leave the layout
  const row = drop.previousElementSibling;
  drop.classList.remove('open'); if (row && row.classList.contains('routeRow')) row.classList.remove('ddOpen');
  clearTimeout(drop._ddT);
  drop._ddT = setTimeout(() => { if (!drop.classList.contains('open')) { drop.style.display = 'none'; const l = drop.closest('.routeList'); if (l) menuListFade(l); } }, 345);
}
function showRmPane(id) { document.querySelectorAll('.rmPane').forEach(p => { if (p._ddPin) { p._ddPin = false; p.style.marginTop = ''; } }); ['rmMain', 'rmListPane', 'rmCreatePane', 'rmCityListPane', 'rmNamePane', 'rmCityPane'].forEach(p => $(p).classList.toggle('on', p === id)); menuListFade($('crCityList')); menuListFade($('rmRoutes')); const __away = id !== 'rmMain'; const __bl = $('brandLayer'); if (__bl) __bl.classList.toggle('away', __away); const __cv = $('snowCv'); if (__cv) __cv.classList.toggle('away', __away); } // Beta 1.159 (Andrew, title lifetime rule): the "Snow Route" title - and the snowfall with it - appears ONLY on the main pane; every other pane carries .away on the title's layer and the snow canvas, and returning to rmMain clears it. This function is the ONE pane choke point (every menu navigation in boot and tab mode passes through it), so the rule lives here and nowhere else; in tab mode the brand layer is parked (.off) and the canvas is gone with the splash, so both toggles are inert there. Beta 1.239 (Andrew's ruling, 2026-11-18): the 1.236 citySheet toggle and the 1.238 boot exemption that rode on this seat are both reverted - the toggle is the plain 1.159 form again in every mode, and no pane is exempted.
// showing the menu warms the catalogue (Create lives behind it): the download is nearly done by the list tap
function openRouteMenu() { crWarmCityLibrary(); const rm = $('routeMenu'); closeSheets(); showRmPane('rmMain'); rm.classList.add('tab'); renderRouteLists(); rm.classList.add('open'); }
function closeRouteMenu() { const rm = $('routeMenu'); rm.classList.remove('open'); rm.classList.remove('tab'); }
$('routesBtn').addEventListener('click', ev => { if (!tapGuard('routesBtn', ev)) return; if ($('routeMenu').classList.contains('open')) closeRouteMenu(); else openRouteMenu(); });
$('rmClose').addEventListener('click', closeRouteMenu);
['crCityList', 'rmRoutes'].forEach(id => { const el = $(id); if (el) el.addEventListener('scroll', () => menuListFade(el), { passive: true }); }); // the feather follows the scroll
window.addEventListener('resize', () => { menuListFade($('crCityList')); menuListFade($('rmRoutes')); }); // a taller or shorter window changes what the list edges cover
$('rmChoose').addEventListener('click', () => { renderRouteLists(); showRmPane('rmListPane'); });
$('rmCreate').addEventListener('click', () => { crWarmCityLibrary(); showRmPane('rmCreatePane'); }); // this tap is the create gate for both entries: the catalogue starts downloading here
$('rmBack').addEventListener('click', () => showRmPane('rmMain'));
$('rmBack2').addEventListener('click', () => showRmPane('rmMain'));
wireRouteRows($('rmRoutes'), id => {
  if ($('routeMenu').classList.contains('tab')) { closeRouteMenu(); if (!activeRoute || id !== activeRoute.id) loadRoute(id); }
  else if (window.__bootPickRoute) window.__bootPickRoute(id);
});
$('streetsBtn').addEventListener('click', ev => { if (!tapGuard('streetsBtn', ev)) return; const open = $('sheet').classList.contains('open'); closeSheets(); if (!open) { $('sheet').style.height = ''; $('sheet').style.maxHeight = ''; renderStreets(); $('sheet').classList.add('open'); } });
$('sheetClose').addEventListener('click', closeSheets);
$('paceClose').addEventListener('click', closeSheets);
$('paceBtn').addEventListener('click', ev => { if (!tapGuard('paceBtn', ev)) return; if ($('pacePanel').classList.contains('open')) closePace(); else openPace(); });
function refreshAll() { updateCount(); renderPanel(); renderStreets(); }
