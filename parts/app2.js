
// ===== MAP BOOT + LAYERS (fresh, MapLibre-native) =====
const GL_STYLES = { day: PM_DAY, night: PM_NIGHT }; // Beta 1.33 (Andrew's pick): BOTH basemaps are Protomaps - one map in light + dark flavours - embedded by pmstyles.js, so a day/night switch is a local setStyle: nothing to fetch, nothing to break mid-switch
const glStyleFor = night => JSON.parse(JSON.stringify(GL_STYLES[night ? 'night' : 'day'])); // Beta 1.77: MapLibre rewrites fields of a style object it is handed - a night boot followed by a day flip rewrote PM_NIGHT's own sprite to the LIGHT sheet, and the offline preload (which enumerates these objects) then never fetched the dark sprites (drive123 A8: 893 files, not 897). The embedded styles are the single source of truth and are never handed over directly; every map gets a copy.
let glOk = false, mapNoteArmed = false, mapNoteOff = false, basemapDead = false, tilesOk = 0;
// Beta 1.44 (Andrew: the splash stuttered): the map is created by bootMap(), which
// app4 calls only AFTER the splash intro has played (~1.1s). Map creation, style
// processing and the first tile work arrive in a few big processor chunks; while
// they ran during the intro, the animation froze and lurched - worst on a cold
// open, invisible on a warm one. Anything that must register on the map before
// it exists goes through onMapReady and is replayed, in order, at creation.
let map = null;
const __onMap = [];
function onMapReady(fn) { if (map) fn(); else __onMap.push(fn); }
function bootMap() {
  if (map) return;
  window.__bootAt = Date.now();
  map = new maplibregl.Map({ container: 'map', style: glStyleFor(isNight()), attributionControl: false, fadeDuration: 200, pixelRatio: 2, maxTileCacheSize: 200, maxTileCacheZoomLevels: 6, minZoom: 8, maxZoom: 19, maxPitch: 60 });
  map.setCenter(routeBox ? [(routeBox.w + routeBox.e) / 2, (routeBox.s + routeBox.n) / 2] : [-79.57, 43.82]); map.setZoom(12); // Beta 1.76: a plain area view - the camera frames the ROUTE only when one is chosen (loadRoute does the fitBounds). Beta 1.117: no route is baked in, so before any pick there is no routeBox - the map opens on the plain fallback view (themePos's constants) behind the picker
  setTimeout(() => { if (!tilesOk) { basemapDead = true; noteMapState(); } }, 9000);
  for (const fn of __onMap) fn();
  __onMap.length = 0;
} // Beta 1.41 (performance round, Andrew approved): tiles MELT in over 200ms instead of snapping (fadeDuration was 0); the canvas renders at pixel ratio 2 instead of the phone's 3 - 4/9 the pixels per frame across all 106 layers, the biggest single fluidity win (labels are SDF and stay crisp); the tile cache is sized so a 13->17 sweep AND the trip back stay parsed. // full gestures (Beta 1.27, Andrew): drag/two-finger rotate and two-finger pitch stay ON, as in the prototype - the fresh build had them switched off
let routeBox = null; // Beta 1.117: the ACTIVE pack's bounding box - set by buildGeometry (app1) on every load via computeRouteBox; null before any route is chosen and for an empty pack. (Pre-1.117 this was an eval-time IIFE over the baked-in 5W ROADS.)
function noteMapState() { const dead = !mapNoteOff && ((mapNoteArmed && !glOk) || basemapDead); $('mapNote').classList.toggle('hidden', !dead); }
$('mapNoteNo').addEventListener('click', () => { if (!tapGuard('mapNoteNo')) return; mapNoteOff = true; noteMapState(); });
setTimeout(() => { if (!glOk) { mapNoteArmed = true; noteMapState(); } }, 15000);
onMapReady(() => map.on('error', e => { if (!glOk && e && e.error && /fetch|Failed/i.test(e.error.message || '') && !mapNoteArmed) { mapNoteArmed = true; noteMapState(); } }));
onMapReady(() => map.on('sourcedata', e => { if (e.dataType === 'source' && e.sourceId === 'protomaps' && e.tile) { tilesOk++; if (basemapDead) { basemapDead = false; noteMapState(); } } })); // Beta 1.33: proof the basemap is really drawing - and the moment a tile lands after an outage, the death notice clears itself
const ROUTE_TILE_NAMES = []; // Beta 1.40: every route street's name AS THE TILES SPELL IT (census of the protomaps 'roads' source layer, 2026-10-31: 34/34 matched exactly once; Fifth = '5th Avenue'). Drives the label handover in glHideLabels. Beta 1.117: the list itself is pack data (pack.tileNames in data.js) - this live array starts empty and buildGeometry refills it in place on every load.
function glHideLabels(m) { // BASEMAP LABEL UNIFICATION (Andrew, Beta 1.6): the day and night styles are two
  // different ready-made maps, each printing its own names in its own lettering and size. On every (re)stack,
  // normalize every basemap text layer: same typeface (each glyph service's own Noto Sans - the same face under
  // each service's naming), same size curve per kind of name, road names from the same zoom in both. The words
  // themselves come from the same map data in both styles. The engine calls this at the end of its stack build;
  // our own route layers are never touched (they carry no 'source-layer').
  try {
    const glyphs = (m.getStyle() && m.getStyle().glyphs) || '';
    const font = glyphs.indexOf('versatiles') >= 0 ? ['noto_sans_regular'] : ['Noto Sans Regular'];
    const SIZE = {
      road: ['interpolate', ['linear'], ['zoom'], 12, 10, 15, 13, 18, 15],
      place: ['interpolate', ['linear'], ['zoom'], 8, 12, 12, 14, 16, 16],
      water: ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 13],
      other: ['interpolate', ['linear'], ['zoom'], 15, 10, 18, 12]
    };
    // Beta 1.40: route-street CLONES of the two road-label layers (the handover, see the
    // road branch below). A zoom ramp cannot nest inside a name test in one paint value
    // ('zoom may only feed a top-level step/interpolate' - the map rejects it), so route
    // streets get their own copy of each label layer: only route names, fading in across
    // 15.4-16.4, restyled at creation for the current theme. The originals exclude route
    // names by filter instead. Rebuilt from the embedded style spec on every restack.
    const spec = (typeof isNight === 'function' && isNight()) ? PM_NIGHT : PM_DAY;
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const setL = (id, k, v) => { if (!eq(m.getLayoutProperty(id, k), v)) m.setLayoutProperty(id, k, v); }; // Beta 1.41: no-op guards - every redundant style mutation re-triggers symbol placement in the workers, and this pass runs on EVERY stack build (boot, every theme flip, every marking tap). When the value already matches, the mutation is skipped; the end state is identical.
    const setP = (id, k, v) => { if (!eq(m.getPaintProperty(id, k), v)) { try { m.setPaintProperty(id, k, v); } catch (e2) {} } };
    const convF = f => (Array.isArray(f) && f[0] === 'in' && typeof f[1] === 'string') ? ['in', ['get', f[1]], ['literal', f.slice(2)]] : f; // the generated styles author kind filters in legacy form; as expressions they must be rebuilt or any combined filter is rejected whole
    for (const baseId of ['roads_labels_major', 'roads_labels_minor']) {
      const cloneId = baseId + '-route';
      const specL = (spec.layers || []).find(x => x.id === baseId);
      if (m.getLayer(cloneId)) { // Beta 1.117: the clone already exists (built for a previous route) - refresh its name filter to the ACTIVE pack's tile names, or a switched route keeps the old route's label handover
        if (specL) { const cf = specL.filter ? ['all', convF(specL.filter), ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]]] : ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]]; if (!eq(m.getFilter(cloneId), cf)) { try { m.setFilter(cloneId, cf); } catch (e2) {} } }
        continue;
      }
      if (!m.getLayer(baseId)) continue;
      if (!specL) continue;
      const clone = JSON.parse(JSON.stringify(specL));
      clone.id = cloneId;
      clone.filter = specL.filter ? ['all', convF(specL.filter), ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]]] : ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]];
      clone.paint = clone.paint || {};
      clone.paint['text-opacity'] = ['interpolate', ['linear'], ['zoom'], 15.4, 0, 16.4, 1];
      if (typeof isNight === 'function' && isNight()) { clone.paint['text-color'] = '#ccd6df'; clone.paint['text-halo-color'] = 'rgba(8,10,14,0.9)'; clone.paint['text-halo-width'] = 1.3; }
      else { clone.paint['text-color'] = '#333333'; clone.paint['text-halo-color'] = 'rgba(255,255,255,.92)'; clone.paint['text-halo-width'] = 1.5; }
      const order = m.getStyle().layers.map(x => x.id);
      try { m.addLayer(clone, order[order.indexOf(baseId) + 1]); } catch (e2) {}
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
        // NIGHT READABILITY (Andrew, Beta 1.27): some of the dark style's own name colours sit almost
        // on top of its dark road colours and vanish. Lift every basemap name to one calm light grey
        // with a firm dark edge - readable, not loud. Night only; day keeps its native colours. (This
        // overrules the Beta 1.6 style-native-colours call for the night style, on his road report.)
        setP(L.id, 'text-color', '#ccd6df'); setP(L.id, 'text-halo-color', 'rgba(8,10,14,0.9)'); setP(L.id, 'text-halo-width', 1.3);
      }
      if (kind === 'place' && (sl === 'place_labels' || sl === 'places')) {
        // MORE PLACES (Andrew, Beta 1.31): a zoom gate buried in a filter (the night style holds
        // neighbourhoods back to z14 inside its hamlet layer's filter) relaxes to 9 so it agrees
        // with the earlier arrival the PLACE_EARLY zooms now allow. Native collision still thins a
        // crowded view on its own.
        // (Zoom ranges themselves live in ONE place: the engine's PLACE_EARLY table, applied by
        // tunePlaceLabels before this hook runs. What remains here is the filter-side gate.)
        if (L.filter) {
          const relax = f => Array.isArray(f) ? f.map((x, i) => (i === 2 && f[0] === '>=' && Array.isArray(f[1]) && f[1][0] === 'zoom' && typeof x === 'number' && x > 9) ? 9 : relax(x)) : f;
          const nf = relax(L.filter);
          if (JSON.stringify(nf) !== JSON.stringify(L.filter)) m.setFilter(L.id, nf);
        }
      }
      if (kind === 'road') {
        if ((L.minzoom || 0) !== 13 || (L.maxzoom === undefined ? 24 : L.maxzoom) !== 24) m.setLayerZoomRange(L.id, 13, 24); // Beta 1.41 guard: same no-op rule as setL/setP
        // LABEL HANDOVER (Andrew, Beta 1.40): zoomed out, OUR titles name the route streets;
        // zooming in, the basemap's own names take over - on route streets they fade IN across
        // 15.4-16.4 while our titles fade OUT on the same band (engine labelpts), so the two
        // never print together. Non-route streets keep their basemap names at every zoom.
        // (The Beta 1.7 clash-exclusion filter that used to live here silently stopped working:
        // it mixed legacy filter syntax with an expression, and the map rejected it outright.)
        if (id === 'roads_labels_major' || id === 'roads_labels_minor') {
          // The originals keep every NON-route name; route names move to the clones above.
          const specL = (spec.layers || []).find(x => x.id === id);
          const baseF = specL && specL.filter ? convF(specL.filter) : null;
          const targetF = baseF ? ['all', baseF, ['!', ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]]]] : ['!', ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]]];
          if (!eq(L.filter, targetF)) { try { m.setFilter(L.id, targetF); } catch (e2) {} } // Beta 1.41 guard
          if (!(typeof isNight === 'function' && isNight())) {
            // DAY READABILITY (Andrew, Beta 1.40): the stock day road names are pale and wash
            // out over the app's coloured route lines. Darken them to the app's own label ink
            // with a firm light edge - the same treatment our titles use. Day only; the night
            // branch above already lifts every name for the dark map.
            setP(L.id, 'text-color', '#333333'); setP(L.id, 'text-halo-color', 'rgba(255,255,255,.92)'); setP(L.id, 'text-halo-width', 1.5);
          }
        }
      }
    }
  } catch (e) { /* a style without label layers has nothing to normalize */ }
}
function addReferenceLayers() {
  const feats = [];
  for (const name of Object.keys(REFERENCE)) { if (name === 'Village Green' || name === 'Ott' || name === 'West link') continue; // Beta 1.32/1.40 (Andrew): ALL reference lines are OFF the map - Village Green and Ott duplicate roads the basemap already names, and West link traced a dashed line over Velmar's west leg toward Rutherford (his report, 2026-10-31). The data stays (production parity); nothing draws.
    const segs = REFERENCE[name]; for (const seg of segs) feats.push({ type: 'Feature', properties: { refName: name }, geometry: { type: 'LineString', coordinates: seg.map(p => [p[1], p[0]]) } }); } // production REFERENCE shape: { name: [segment, ...] } - the first cut wrongly iterated it as an array of {name, pts}, threw on every style-ready, and silently killed the GPS + trail layers queued after it (Andrew's missing GPS dot, 2026-10-30)
  if (map.getSource('ref')) { map.getSource('ref').setData({ type: 'FeatureCollection', features: feats }); return; } // Beta 1.117: a route switch re-points the existing source at the new pack's reference features instead of leaving the old route's drawn
  map.addSource('ref', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
  map.addLayer({ id: 'ref-line', type: 'line', source: 'ref', filter: ['has', 'refName'], layout: { 'line-cap': 'round' }, paint: { 'line-color': isNight() ? '#aab4c0' : '#8a929c', 'line-width': 3, 'line-opacity': 0.55, 'line-dasharray': [2, 1.6] } }, map.getLayer('t1-casing') ? 't1-casing' : undefined);
}
function makeBeamImage() { // Beta 1.49: the facing beam as a painted fan (Andrew's reference image) - strong at the dot, fading with distance, with a soft skirt at the edges. Two passes (a wide faint fan under a narrower stronger one) fake the blur a flat polygon cannot do.
  const S = 512, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const x = cv.getContext('2d'), c = S / 2;
  const pass = (halfDeg, len, a0) => {
    const g = x.createRadialGradient(c, c, 0, c, c, len);
    g.addColorStop(0, 'rgba(43,75,242,' + a0 + ')');
    g.addColorStop(0.55, 'rgba(43,75,242,' + (a0 * 0.55).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(43,75,242,0)');
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
  if (!map.hasImage('beam-img')) { const bcv = makeBeamImage(); map.addImage('beam-img', bcv.getContext('2d').getImageData(0, 0, bcv.width, bcv.height), { pixelRatio: 2 }); } // raw ImageData form: handing MapLibre the canvas element itself throws 'mismatched image size' (its size reads come back 0) and the throw silently killed this whole layer batch in the boot queue - found by drive129's layer checks before 1.49 ever shipped
  map.addLayer({ id: 'gps-shadow', type: 'circle', source: 'gps', filter: ['==', ['get', 'k'], 'dot'], paint: { 'circle-radius': 13, 'circle-color': '#000000', 'circle-opacity': 0.16, 'circle-blur': 1 } }); // Beta 1.49: the soft shadow under the dot (Andrew's reference image)
  map.addLayer({ id: 'gps-beam', type: 'symbol', source: 'gps', filter: ['==', ['get', 'k'], 'beam'], layout: { 'icon-image': 'beam-img', 'icon-size': 0.62, 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-anchor': 'center', 'icon-allow-overlap': true, 'icon-ignore-placement': true } }); // Beta 1.49: gradient fan symbol, painted under the accuracy ring and the dot - replaces the flat cone polygon (Beta 1.28), which read as cheap
  map.addLayer({ id: 'gps-ring', type: 'fill', source: 'gps', filter: ['==', ['get', 'k'], 'ring'], paint: { 'fill-color': '#2b4bf2', 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'gps-ring-line', type: 'line', source: 'gps', filter: ['==', ['get', 'k'], 'ring'], paint: { 'line-color': '#2b4bf2', 'line-width': 1.5, 'line-opacity': 0.5 } });
  map.addLayer({ id: 'gps-dot', type: 'circle', source: 'gps', filter: ['==', ['get', 'k'], 'dot'], paint: { 'circle-radius': 9.5, 'circle-color': '#2b4bf2', 'circle-stroke-width': 4, 'circle-stroke-color': '#ffffff' } });
}
function addTrailLayers() {
  if (map.getSource('trail')) return;
  map.addSource('trail', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'trail-line', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2b4bf2', 'line-width': 3, 'line-opacity': 0.7 } }, 'gps-shadow'); // Beta 1.65 (Andrew's road report): anchored UNDER the GPS stack - unanchored, the line could paint across the dot's face
}
function pickFontFromStyle() { // adopt a NOTO stack from the CURRENT basemap for OUR route labels (Beta 1.6: same
  // typeface day and night - Versatiles names it noto_sans_regular, CARTO lists Noto Sans Regular inside its
  // stacks; a guessed stack renders NO text, so prefer a stack the style itself carries and mentions Noto)
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
  for (const fn of [addReferenceLayers, addGpsLayers, addTrailLayers]) { try { fn(); } catch (e) { /* one bad layer must never kill the rest of the stack (the REFERENCE throw hid the GPS dot until 2026-10-30) */ } }
  pushGps(); drawTrail(); if (routeLoaded) refreshAll(); // Beta 1.76: before a route is chosen the map is basemap-only - no route paint, no streets list, no count
}
onMapReady(() => map.on('load', onStyleReady));
let restackArmed = false;
function setBasemap() {
  map.setStyle(glStyleFor(isNight()), { diff: false }); // Beta 1.77: never a diff - a diff keeps the existing tile source (and its errored tiles from an outage) when the style is unchanged, so a recovered connection never re-requested the basemap and the failure notice never cleared (drive115 C1, caught by the intro flight's wider errored-tile sweep). A basemap switch always rebuilds fully; the tiles themselves come back from cache.
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
let selSet = []; // [{name, idx, anchor}] - EVERY stretch currently selected (Beta 1.28 multi-select, Andrew); sel/selStretch stay the ANCHOR entry (last tapped) that positions the chips
let selStretch = null; // {name, idx} — the paint engine reads this global in syncSel()
let swallowClickUntil = 0;
function spendTap(ms) { swallowClickUntil = Date.now() + ms; } // Beta 1.148 (Tranche 5, A4(iii)): app2 is the SOLE writer of its tap-swallow variable - other parts spend a tap through this setter, never by assigning swallowClickUntil themselves
function projLL(p) { return map.project([p[1], p[0]]); }
function ptSegDistPx(p, a, b) { const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy; let t = L2 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t)); }
function nearestStreet(pt) { let best = null, bd = Infinity; for (const n of STREETNAMES) for (const seg of ROADS[n]) for (let i = 1; i < seg.length; i++) { const d = ptSegDistPx(pt, projLL(seg[i - 1]), projLL(seg[i])); if (d < bd) { bd = d; best = n; } } return { name: best, d: bd }; }
function nearestStretch(name, pt) { let bi = 0, bd = Infinity; STRETCH[name].parts.forEach((part, idx) => { for (let i = 1; i < part.length; i++) { const d = ptSegDistPx(pt, projLL(part[i - 1]), projLL(part[i])); if (d < bd) { bd = d; bi = idx; } } }); return { idx: bi, d: bd }; }
function geoSideFrame(name, idx, anchorLL) {
  // The engine's convention: side 0 = geographic LEFT of the stitched line (off0, +3.3 m), side 1 = RIGHT.
  // Returns the anchor's projection on the stretch + the geographic LEFT unit vector (metre space).
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
function groupSideDone(side) { const bit = side ? 2 : 1; return selSet.length > 0 && selSet.every(en => !!(pieces[en.name][en.idx] & bit)); } // a side reads done only when EVERY selected stretch has it
function showChips() {
  clearChips();
  if (!sel) return;
  const wrap = $('chips');
  [0, 1].forEach(side => {
    const d = document.createElement('div');
    d.className = 'sideChip' + (groupSideDone(side) ? ' done' : '');
    d.dataset.side = side;
    d.innerHTML = '<button class="chipBtn" aria-label="mark side"></button>';
    d.querySelector('.chipBtn').addEventListener('click', ev => { ev.stopPropagation(); if (!tapGuard('chip' + side)) return; togglePieceGroup(side); });
    wrap.appendChild(d);
  });
  positionChips();
}
function positionChips() {
  if (!sel || !map) return; // Beta 1.169 (Carbon fix round, B-02): the chips are placed by map projection - with no map there is nothing to project against, and throwing here (projLL) aborted the rest of refreshSelUI mid-selection
  const kids = $('chips').children; if (kids.length !== 2) return;
  const frame = geoSideFrame(sel.name, sel.idx, sel.anchor);
  const base = projLL(frame.baseLL);
  const probe = projLL([frame.baseLL[0] + frame.left[1] * 12 / MLAT, frame.baseLL[1] + frame.left[0] * 12 / MLNG]);
  let lx = probe.x - base.x, ly = probe.y - base.y; const LL = Math.hypot(lx, ly) || 1; lx /= LL; ly /= LL; // screen direction of geographic LEFT
  const cw = map.getCanvas().clientWidth, ch = map.getCanvas().clientHeight;
  // Stage 2 (drive120 V3): clamp the BASE point into the canvas first, so the two chips keep
  // their full separation near screen edges - clamping each chip independently squeezed them
  // together (measured 21.6px apart, overlapping) when the stretch point sat at the edge.
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
    if (btn.dataset.k !== ckey) { // Beta 1.50 (audit P02): positionChips runs on EVERY map move - rebuilding the chip's SVG each time was pure waste; rebuild only when the picture actually changes (done state, or the arrow's whole-degree direction)
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
function tapStretch(name, idx, anchor) { // map taps ACCUMULATE (Beta 1.28): tapping a selected stretch removes just it; the anchor follows the last remaining selection
  const i = selSet.findIndex(en => en.name === name && en.idx === idx);
  if (i >= 0) selSet.splice(i, 1); else selSet.push({ name, idx, anchor });
  if (!selSet.length) { deselect(); return; }
  const top = selSet[selSet.length - 1];
  sel = { name: top.name, idx: top.idx, anchor: top.anchor }; selStretch = { name: top.name, idx: top.idx };
  refreshSelUI();
}
function deselect() { sel = null; selStretch = null; selSet = []; clearChips(); if (window.GLP) window.GLP.syncSel(); renderPanel(); }
onMapReady(() => map.on('click', e => {
  if (creating) return; // Beta 1.118: in the create flow, map taps pick streets for the DRAFT - they never mark the active route
  if (Date.now() < swallowClickUntil) return;
  const pt = map.project([e.lngLat.lng, e.lngLat.lat]);
  const near = nearestStreet(pt);
  if (near.name && near.d <= 16) { const st = nearestStretch(near.name, pt); tapStretch(near.name, st.idx, [e.lngLat.lat, e.lngLat.lng]); }
  else deselect();
}));

// ===== MARKING (one finish path) =====
let saveWarned = false; // Beta 1.101 (Phase 3 / C2): the storage-warning episode state - app-layer messaging state, moved out of the storage layer with the warning itself. One warning per failure episode; resets on the next fully successful save (the 1.63 discipline, unchanged).
function saveAllWarned() { const r = saveAll(); if (!r.ok) { if (!saveWarned) { saveWarned = true; toast('Storage is not saving (' + r.failedKey + ') - export a recovery backup now', 4200); } } else saveWarned = false; return r; } // the non-transactional save path: saveAll plus the episode warning. The finish transaction calls saveAll directly and does its own gated messaging.
function finishChange() { if (window.GLP) window.GLP.sync(); renderPanel(); updateCount(); renderStreets(); const r = saveAllWarned(); syncWake(); return r; } // Beta 1.63 (audit F04): callers that announce an outcome branch on the save result - since Beta 1.101 (Phase 3) that result is the storage-outcome object
function finishChangeMarked() { const wb = saveWarned; const r = finishChange(); if (!r.ok && wb) toast('Not saved \u2014 storage problem', 3200); return r; } // Beta 1.97 (audit loop CG-196-05): the marking callers' half of the save-honesty contract - when the save fails, NO outcome toast may replace the storage warning; saveAll raises that warning once per episode (saveWarned), so when it was already raised before this call, the caller still owes a plain 'not saved' rather than silence
function applyPiece(name, idx, side, on) { // the piece mutation with NO rendering - returns the street name if this change completed it
  const bit = side ? 2 : 1; const was = pieces[name][idx];
  const now = on ? (was | bit) : (was & ~bit);
  if (now === was) return null;
  pieces[name][idx] = now;
  if (!pieceTimes[name][idx]) pieceTimes[name][idx] = [null, null];
  pieceTimes[name][idx][side] = on ? new Date().toISOString() : null;
  if (streetComplete(name) && !doneSet.has(name)) { doneSet.add(name); doneTimes[name] = new Date().toISOString(); doneVia[name] = 'sides'; onStreetComplete(name); return name; } // Beta 1.111: applyPiece is the piece-marking funnel - this branch is the exact false-to-true completion flip, so the Done-chime / vibration feedback (app4, fully guarded, can never throw into marking) fires here and in markDone, the only two places a street becomes complete
  if (!streetComplete(name) && doneSet.has(name)) { doneSet.delete(name); delete doneTimes[name]; delete doneVia[name]; }
  return null;
}
function togglePiece(name, idx, side) {
  const bit = side ? 2 : 1;
  const doneName = applyPiece(name, idx, side, !(pieces[name][idx] & bit));
  showChips(); const okTp = finishChangeMarked();
  if (doneName && okTp.ok) toast('✓ ' + doneName + ' · ' + fmtClock(new Date()));
}
function togglePieceGroup(side) { // one chip, whole selection: a side not done everywhere gets completed everywhere; a side done everywhere gets cleared everywhere
  if (!selSet.length) return;
  const on = !groupSideDone(side);
  const completed = [];
  for (const en of selSet) { const c = applyPiece(en.name, en.idx, side, on); if (c && !completed.includes(c)) completed.push(c); }
  showChips(); const okTg = finishChangeMarked();
  if (okTg.ok) completed.forEach(n => toast('✓ ' + n + ' · ' + fmtClock(new Date())));
}
$('selAllBtn').addEventListener('click', () => { if (!tapGuard('selAll')) return; const completed = []; for (const en of selSet) for (const side of [0, 1]) { const c = applyPiece(en.name, en.idx, side, true); if (c && !completed.includes(c)) completed.push(c); } showChips(); const okSa = finishChangeMarked(); if (okSa.ok) completed.forEach(n => toast('✓ ' + n + ' · ' + fmtClock(new Date()))); }); // Beta 1.146 (census C3): the outcome is the 1.101 storage-outcome OBJECT - {ok:false} is truthy, so the old bare test fired the success toasts beside the storage warning; every sibling marking caller (okTp/okTg/okMd/okMu) already branches on .ok
$('selClearBtn').addEventListener('click', () => { if (!tapGuard('selClear')) return; deselect(); });
function markDone(name, via, at) { // production contract: whole street done; sides already marked keep their real times, the rest inherit the completion moment
  const wasComplete111 = streetComplete(name); // Beta 1.111: whole-street marking bypasses applyPiece - the completion feedback fires only on a real false-to-true flip here too
  pieces[name] = STRETCH[name].parts.map(() => 3);
  const mts = at || new Date().toISOString();
  const cur = (pieceTimes[name] && typeof pieceTimes[name] === 'object') ? pieceTimes[name] : {};
  pieceTimes[name] = STRETCH[name].parts.map((_, i) => { const pr = Array.isArray(cur[i]) ? cur[i] : [null, null]; return [pr[0] || mts, pr[1] || mts]; });
  doneSet.add(name); doneTimes[name] = mts; doneVia[name] = via || 'tap';
  if (!wasComplete111) onStreetComplete(name); // Beta 1.111: see applyPiece
  const okMd = finishChangeMarked();
  if (okMd.ok) toast('✓ ' + name + ' · ' + fmtClock(new Date(mts)) + (doneSet.size === STREETNAMES.length ? ' — ALL ' + STREETNAMES.length + ' DONE' : '')); // Beta 1.94 (audit F-01): the total derives from the route's street list
}
function markUndone(name) {
  pieces[name] = STRETCH[name].parts.map(() => 0);
  pieceTimes[name] = STRETCH[name].parts.map(() => [null, null]);
  doneSet.delete(name); delete doneTimes[name]; delete doneVia[name];
  const okMu = finishChangeMarked();
  if (okMu.ok) toast('Unmarked ' + name);
}
function markStreet(name, done) { if (done) markDone(name, 'tap'); else markUndone(name); showChips(); }
function renderPanel() { // ONE selection pop-up (Beta 1.30, Andrew): the header strip and the multi-select pill are the same pop-up now - pill glass, every action inside, content follows the selection
  const p = $('selPop');
  if (!sel) { p.classList.add('hidden'); return; }
  p.classList.remove('hidden');
  const multi = selSet.length >= 2; // Beta 1.34 (Andrew): single and multi are the SAME size now - same box, same two rows; only the words and buttons change
  const streetsIn = new Set(selSet.map(en => en.name)).size;
  const oneStreet = streetsIn === 1;
  p.style.setProperty('--accent', !oneStreet ? 'transparent' : (streetComplete(sel.name) ? GREEN : (MAIN.has(sel.name) ? YELLOW : RED))); // the edge mirrors the street (Beta 1.32, Andrew): gold for a main road, raspberry for an unfinished regular road, mint once the street is complete
  if (!multi) {
    $('selName').textContent = sel.name;
    const total = STRETCH[sel.name].parts.length;
    const val = pieces[sel.name][sel.idx];
    const doneSides = (val & 1 ? 1 : 0) + (val & 2 ? 1 : 0);
    $('selStatus').textContent = 'Stretch ' + (sel.idx + 1) + ' of ' + total + (streetComplete(sel.name) ? ' · street complete' : doneSides === 2 ? ' · both sides done' : doneSides === 1 ? ' · 1 of 2 sides done' : ''); // Beta 1.32: concise - the chips on the map already show WHICH side
  } else {
    $('selName').textContent = selSet.length + ' sections selected';
    let dn = 0; for (const en of selSet) { const v = pieces[en.name][en.idx]; dn += (v & 1 ? 1 : 0) + (v & 2 ? 1 : 0); }
    $('selStatus').textContent = dn + ' of ' + (selSet.length * 2) + ' sides done'; // Beta 1.34: multi carries the same second line a single does - the sides tally for the whole set
  }
  $('selStatus').style.display = '';
  $('selNote').style.display = multi ? 'none' : ''; // Beta 1.31: multi carries ONLY the count, Mark both sides and Clear - the reference pill's contents, nothing crammed
  $('selAllBtn').style.display = multi ? '' : 'none';
  $('selClearBtn').style.display = multi ? '' : 'none';
  const b = $('selBtn');
  b.style.display = multi ? 'none' : '';
  if (!multi) {
    if (streetComplete(sel.name)) { b.textContent = 'Mark not done'; b.className = 'notdone'; b.disabled = false; }
    else { b.textContent = 'Mark completed'; b.className = ''; b.disabled = false; }
  }
}
$('selBtn').addEventListener('click', () => { if (!sel || !tapGuard('selBtn')) return; markStreet(sel.name, !streetComplete(sel.name)); });
$('selNote').addEventListener('click', () => { if (!sel || !tapGuard('selNote')) return; openNote(sel.name); });
function updateCount() {
  const n = STREETNAMES.filter(streetComplete).length;
  const tw = totalWorkM(); // Beta 1.170 (Carbon fix round Phase 2, A-05): the share's denominator, read once and GUARDED - a route with no work in it (an empty pack, or geometry whose totals are all zero) divided by zero through 1.169 and the counter read 'NaN%' with a 'NaN%' meter width; it now reads 0%
  const pct = tw > 0 ? Math.round(workDoneM() / tw * 100) : 0;
  $('countTxt').textContent = n + ' of ' + STREETNAMES.length + ' · ' + pct + '%'; $('countFill').style.width = (tw > 0 ? (workDoneM() / tw * 100) : 0) + '%'; // the meter fills with the same work fraction the % is computed from. Beta 1.94 (audit F-01): the total derives from the route's street list
  $('stats').textContent = statsLine();
  $('startBtn').style.display = runStart ? 'none' : '';
  $('cancelStartBtn').style.display = runStart ? '' : 'none'; // Beta 1.91: Cancel start is offered for the whole run - it erases the run's records, marks included
  $('resetBtn').style.display = runStart ? '' : 'none';
}

// ===== LIST SHEET =====
let listFilter = 'mains'; // Beta 1.109 (Andrew): the Streets filter is the route's two groups - Mains (the gold roads) or Secondaries (the raspberry ones) - replacing All / To do / Done; Mains is the opening view
let noteOpenFor = null, noteSaveTimer = 0, noteEdFor = null; // Beta 1.63 (audit F01): noteEdFor names the street whose editor is actually in the DOM - the draft's owner
let srowCache = { sig: '', rows: new Map() }; // Beta 1.50 (audit P06): rows kept between renders when the visible set is unchanged
function resetStreetsSession() { // Beta 1.148 (Tranche 5, A4(ii)): app2's OWN route-switch reset, called by app4's resetSwitchSession - the Streets session's reset knowledge lives here, with its state, so a new app2 session field's reset is added where its author is looking
  deselect(); // selection + chips + the engine's selection, through the one proven path
  noteOpenFor = null; noteEdFor = null; if (noteSaveTimer) { clearTimeout(noteSaveTimer); noteSaveTimer = 0; } // the note editor's pending debounced save must never fire into the new route (its flush already happened via collapseNoteEditor)
  listFilter = 'mains'; document.querySelectorAll('#filters button').forEach(x => x.classList.toggle('on', x.dataset.f === 'mains'));
  srowCache = { sig: '', rows: new Map() };
  saveWarned = false; // the storage-warning episode belonged to the outgoing route's saves
}
function fmtLenM(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' m'; } // Beta 1.107: street-length display for the Streets list's quiet line - whole metres, thousands separator, never kilometres
function renderStreets() { // production row design: tap a street's name area to open its inline note editor (auto-saves); the pin button flies to the street
  const el = $('streetList'); if (!el) return;
  const scroller = $('sheetBody'); const keepScroll = scroller ? scroller.scrollTop : 0; // Beta 1.31: a rebuild must not yank the list back to the top while he is working in it
  const openEd = el.querySelector('.noteEd textarea');
  const draft = openEd ? openEd.value : null; // an in-progress note survives re-renders
  const draftFor = openEd ? noteEdFor : null; // Beta 1.63 (audit F01): the draft belongs to draftFor's street only - never poured into another street's editor
  if (draft !== null && draftFor && draftFor !== noteOpenFor) { clearTimeout(noteSaveTimer); const wb = saveWarned; const r = setNoteText(draftFor, draft); if (!r.ok && wb) toast('Not saved \u2014 storage problem', 3200); } // switching streets finalizes the old editor against ITS street first (a destroyed editor's blur is not guaranteed to fire). Beta 1.169 (Carbon fix round, A-01): the flush's result used to be discarded - saveAllWarned toasts once per failure EPISODE, so when the warning had already fired, a failed finalization here was silent. The finishChangeMarked contract (Beta 1.97) is the codebase's answer for exactly this shape, applied verbatim: a fresh failure is covered by the warning setNoteText just raised; a suppressed one is owed the plain 'not saved'.
  let noteFlushed = false, noteFlushFailed = false; // Beta 1.79: a rebuild for the SAME street (the map style finishing its load, a theme flip - both end in refreshAll) replaces the open editor too. Finalize its pending save HERE, synchronously, instead of leaving the debounced timer pointing at a discarded textarea - that race is what stranded drive88's note checks when the style-ready refresh landed mid-edit
  if (draft !== null && draftFor && draftFor === noteOpenFor && noteSaveTimer) { clearTimeout(noteSaveTimer); noteSaveTimer = 0; if (setNoteText(draftFor, draft).ok) noteFlushed = true; else noteFlushFailed = true; } // Beta 1.113 (round 112, CG-112-01): setNoteText returns the 1.101 storage-outcome OBJECT - {ok:false} is truthy, so the old truthiness test marked a FAILED save flushed and the rebuilt editor announced 'Saved'
  const arr = STREETNAMES.filter(n => (listFilter === 'mains') === MAIN.has(n)); // Beta 1.109: the visible set is exactly the selected group - 6 mains or 28 secondaries on Route 5W
  arr.sort((a, b) => ((MAIN.has(a) ? 0 : 1) - (MAIN.has(b) ? 0 : 1)) || a.localeCompare(b)); // Beta 1.91 (Andrew): the Streets list leads with the mains (gold - cleaned first), then the secondary streets (raspberry), alphabetical inside each colour, in every filter view
  if (!arr.length) { el.innerHTML = '<div style="padding:14px 4px;color:#8fa0b3">No streets in this group</div>'; srowCache = { sig: '', rows: new Map() }; return; } // Beta 1.109: unreachable with shipped route data (both groups are non-empty by construction) - kept as the safety net it was
  // Beta 1.50 (audit P06): a routine mark used to rebuild all 34 rows from
  // scratch. When the visible set and order are unchanged and no note editor
  // is open, update the kept rows in place instead; anything structural
  // (filter change, editor open, a row gone) falls back to the full rebuild.
  const sig = listFilter + '|' + arr.join(',');
  if (!noteOpenFor && sig === srowCache.sig && !el.querySelector('.noteEd')) {
    let okAll = srowCache.rows.size === arr.length;
    if (okAll) for (const n of arr) { const c = srowCache.rows.get(n); if (!c || c.row.parentElement !== el) { okAll = false; break; } }
    if (okAll) {
      for (const n of arr) {
        const c = srowCache.rows.get(n);
        c.row.className = 'srow' + (streetComplete(n) ? ' done' : '') + (MAIN.has(n) ? ' main' : '');
        c.row.querySelector('.pill').style.display = streetComplete(n) ? '' : 'none'; // Beta 1.109: the COMPLETED pill rides the same done predicate as the row class (the mint dot comes from the .done rule)
        const doneAt = streetComplete(n) && doneTimes[n] ? fmtWhen(doneTimes[n]) : '';
        c.row.querySelector('.tm').textContent = (notes[n] && notes[n].some(f => f.k !== 'note') ? '⚑ ' : '') + (doneAt ? 'done ' + doneAt + ' (' + fmtAgo(doneTimes[n]) + ')' : '');
        c.paintNt();
      }
      if (scroller) scroller.scrollTop = keepScroll;
      kbSync(); // Beta 1.56: renders never touch the kb class - the keyboard owner (app4) reconciles
      return;
    }
  }
  el.innerHTML = '';
  srowCache = { sig, rows: new Map() };
  arr.forEach(n => {
    const d = document.createElement('div');
    d.className = 'srow' + (streetComplete(n) ? ' done' : '') + (MAIN.has(n) ? ' main' : '');
    d.innerHTML = '<div class="dot"></div><div class="nwrap"><div class="nmrow"><div class="nm"></div><span class="pill" style="display:none">COMPLETED</span></div><div class="nt"><span class="ntIco"></span><span class="ntTxt"></span></div></div><div class="tm"></div><button class="sbtn smap" title="Show on map"></button>';
    d.querySelector('.nm').textContent = n;
    if (streetComplete(n)) d.querySelector('.pill').style.display = ''; // Beta 1.109: a fully completed street (streetComplete - both sides done) wears the pill; a one-side partial never reaches this line's condition
    const ntEl = d.querySelector('.nt');
    d.querySelector('.smap').innerHTML = ICONS.pin; d.querySelector('.ntIco').innerHTML = ICONS.note; // Pack D glyphs (Beta 1.30) in place of the emoji
    const paintNt = () => { const t = noteTextOf(n); if (t) { d.querySelector('.ntTxt').textContent = t; d.querySelector('.ntIco').style.display = ''; ntEl.style.display = ''; } else { d.querySelector('.ntTxt').textContent = fmtLenM(STRETCH[n].total); d.querySelector('.ntIco').style.display = 'none'; ntEl.style.display = ''; } }; // Beta 1.107 (Andrew): the quiet line shows the street's length by default (live STRETCH total, exact); a note wins the slot while one exists
    paintNt();
    const doneAt = streetComplete(n) && doneTimes[n] ? fmtWhen(doneTimes[n]) : '';
    d.querySelector('.tm').textContent = (notes[n] && notes[n].some(f => f.k !== 'note') ? '⚑ ' : '') + (doneAt ? 'done ' + doneAt + ' (' + fmtAgo(doneTimes[n]) + ')' : '');
    d.querySelector('.smap').addEventListener('click', e => {
      e.stopPropagation();
      if (!tapGuard('li' + n)) return;
      closeSheets();
      const c = STRETCH[n].line[Math.floor(STRETCH[n].line.length / 2)];
      map.flyTo({ center: [c[1], c[0]], zoom: Math.max(map.getZoom(), 15.5) });
      selectStretch(n, 0, c);
    });
    d.addEventListener('click', () => {
      noteOpenFor = noteOpenFor === n ? null : n;
      renderStreets();
      const ta = el.querySelector('.noteEd textarea');
      if (ta) { ta.focus(); setTimeout(() => { const t2 = el.querySelector('.noteEd textarea'); const sc = $('sheetBody'); if (t2 && sc) { const tr = t2.getBoundingClientRect(), sr = sc.getBoundingClientRect(); if (tr.bottom > sr.bottom) sc.scrollTop += tr.bottom - sr.bottom + 8; else if (tr.top < sr.top) sc.scrollTop -= sr.top - tr.top + 8; } }, 400); } // Beta 1.56: container-local ensure-visible - 1.31's smooth scrollIntoView panned the whole page and fought iOS's own focus pan (external audit B4, 2026-11-01); adjusting the sheet's own scroll position moves nothing else
    });
    el.appendChild(d);
    srowCache.rows.set(n, { row: d, paintNt });
    if (noteOpenFor === n) {
      const ed = document.createElement('div');
      ed.className = 'noteEd';
      ed.innerHTML = '<textarea placeholder="Note for this street — e.g. driveway at #12 could not be cleaned, car blocking"></textarea><div class="nhint">Saves automatically</div>';
      const ta = ed.querySelector('textarea');
      ta.value = (draft !== null && draftFor === n) ? draft : noteTextOf(n); noteEdFor = n;
      const hint = ed.querySelector('.nhint'); if (noteFlushFailed && n === draftFor) hint.textContent = 'Not saved — storage problem'; else if (noteFlushed && n === draftFor) hint.textContent = 'Saved \u2713'; // Beta 1.113 (round 112, CG-112-01): a failed flush says so, in the debounced path's own words - never 'Saved' // Beta 1.79: the rebuilt editor tells the truth about the save the rebuild just finalized
      ta.addEventListener('input', () => {
        hint.textContent = 'Saving…';
        clearTimeout(noteSaveTimer);
        noteSaveTimer = setTimeout(() => { const ok = setNoteText(n, ta.value); paintNt(); hint.textContent = ok.ok ? 'Saved ✓' : 'Not saved — storage problem'; }, 400); // Beta 1.63 (audit F04): the hint tells the truth about the write
      });
      ta.addEventListener('blur', () => { clearTimeout(noteSaveTimer); const ok = setNoteText(n, ta.value); paintNt(); hint.textContent = ok.ok ? 'Saved ✓' : 'Not saved — storage problem'; }); // Beta 1.169 (Carbon fix round, A-01): blur finalizes like the debounced save above it - same result, same words in the same hint. Through 1.168 the result was discarded, so a blur save that failed (storage full, the episode warning already spent) told the user nothing while the editor still read 'Saves automatically'.
      el.appendChild(ed);
    }
  });
  if (scroller) scroller.scrollTop = keepScroll;
  if (!el.querySelector('.noteEd')) { noteEdFor = null; kbSync(); } // Beta 1.56: an editor removed by a rebuild must not leave the keyboard state stuck on - reported to the owner (app4 kbSync), which releases it through the settle path
}
function collapseNoteEditor() { // Beta 1.106 (Andrew): closing the Streets sheet resets the list - an editor left open must not still be open on the next open. Clearing noteOpenFor and re-rendering finalizes any pending debounced save first (renderStreets' draft flush runs against the editor's own street), so typed text is never lost; only the open-editor state resets. Called from BOTH close funnels of the Streets sheet: closeSheetEl (X, tab toggle, pin, opening another sheet, outside tap) and the drag settleClose landing in makeSheetDraggable.
  if (!noteOpenFor) return;
  noteOpenFor = null;
  renderStreets();
}
document.querySelectorAll('#filters button').forEach(b => b.addEventListener('click', () => { listFilter = b.dataset.f; document.querySelectorAll('#filters button').forEach(x => x.classList.toggle('on', x === b)); renderStreets(); }));
function closeSheetEl(s) { // Beta 1.30: the close now ANIMATES - freeze the height the sheet has at this moment for the whole slide-down, and clear it only after the motion ends. Clearing it instantly (the old way) snapped the sheet to its default height mid-close, which is why closing felt broken while opening felt fine. Beta 1.81: a running release spring is cancelled first (its finish never runs, so the takeover also drops .dragging); a leftover inline transform from an interrupted spring-close is cleared so the class transition owns the slide.
  cancelSheetSpring(s);
  if (s.id === 'sheet') collapseNoteEditor(); // Beta 1.106: any animated close of the Streets sheet resets an open note editor first
  if (!s.classList.contains('open')) { s.classList.remove('full'); s.classList.remove('dragging'); return; }
  const h = s.offsetHeight;
  s.style.height = h + 'px'; s.style.maxHeight = 'none'; s.style.transform = '';
  s.classList.remove('open'); s.classList.remove('full'); s.classList.remove('snapping'); s.classList.remove('dragging'); // the base (closing) transition and curve own the motion from here
  setTimeout(() => { if (!s.classList.contains('open')) { s.style.height = ''; s.style.maxHeight = ''; } }, 480);
}
function closeSheets() { document.querySelectorAll('.sheet').forEach(closeSheetEl); } // Beta 1.77: every sheet by class, present and future - no hand-kept list to fall behind a new menu
// Draggable sheets (Andrew, Beta 1.9 spec; refined 1.10 flick; refined 1.13 touch zone): the drag/flick touch
// zone is the panel's EMPTY TOP STRIP - the grab handle plus the title row - a comfortable area with no
// controls except Close (a flick starting on a button never starts a drag). The content area below is pure
// scrolling again, so flicks never fight the streets list. Three stops: flick/drag up = fill the screen
// (FULL), down = back to the standard open height (DEFAULT), down again = closed. Slow drags follow the
// finger; quick flicks throw the panel to the next stop on release. Taps pass through untouched.
const SHEET_DEF_VH = 0.50, SHEET_FULL_VH = 0.94, SHEET_MIN_PX = 150; // Beta 1.79 (Andrew): the three stops - closed / half (SHEET_DEF_VH, where a sheet opens) / full (SHEET_FULL_VH)
// Beta 1.81 (Andrew, reverse-engineered from his Waze screen recording): a drag release used to
// hand the sheet to a fixed 420ms CSS transition that restarted from rest - measured on the rig,
// a flick thrown at ~1600px/s crawled +3/+12/+21px in its first 120ms and only then accelerated
// away (on Pace's short sheet that slow start IS most of the trip, which is why it read as
// "just disappears"). The recording's settles instead start at the finger's speed and decay
// geometrically (tails halving each ~33ms frame, ~500px trips landing in ~230-300ms, no overshoot
// past a stop). So releases now run a critically-damped spring (omega 30/s) whose initial velocity
// IS the release velocity, and the sheet keeps .dragging (no CSS transition, blur off) until the
// motion lands - the phone never repaints the frosted blur mid-settle either. End states match
// the old snap exactly: full = inline full height + .full; half = cleared inline height, no .full;
// closed = .open off with inline geometry cleared.
const SHEET_OMEGA = 30;
function cancelSheetSpring(sheet) { if (sheet._spring) { cancelAnimationFrame(sheet._spring); sheet._spring = null; } }
function springSheet(sheet, q0, qT, v0, apply, finish) {
  cancelSheetSpring(sheet);
  // Closed form of the critically-damped spring, evaluated at the frame's timestamp -
  // NOT a per-frame Euler integration: the integrated form diverged at the slower frame
  // rate of the CI browser (drive145 N27 measured a sheet height of 582,683px on run
  // 41686175718) while passing at the local rig's 60fps. The closed form is exact at any
  // frame rate. With v0 clamped to 4000px/s it cannot overshoot a stop: crossing needs
  // v0 > omega * distance, and 30 * distance exceeds the clamp beyond ~134px of travel.
  const A = q0 - qT, B = Math.max(-4000, Math.min(4000, v0)) + SHEET_OMEGA * A;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(qT); finish(); return; }
  // Beta 1.172 (Andrew's call - the drive156-harden record's option (a)): the spring's
  // clock starts at the FIRST FRAME's rAF timestamp, not at performance.now() inside
  // the call. The call usually lands mid-frame during input dispatch, up to a frame
  // after that frame's start timestamp, while step is evaluated AT frame timestamps -
  // so the first step used to run the closed form at t ~ -10 ms, extrapolating backward
  // along the curve: a collapse's first applied height dipped ~8 px past the start and
  // rebounded (190 -> 182 -> 188), an expand's overshot (60 -> 73 -> 61) - the flight
  // departed from monotonic for its first two frames whenever the spring made the same
  // frame's callback batch. With t0 taken from the first step's own timestamp, t starts
  // at exactly 0 and the flight is the closed form from its true start.
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
    if (!moved && Math.abs(total) < 3) return; // Beta 1.79: near-zero dead zone - the old 9px threshold was the first hitch of the drag hesitation Andrew felt; the panel follows from the first pixels
    if (!moved) {
      moved = true;
      if (sheet._spring) { cancelSheetSpring(sheet); sheet.style.transform = ''; startY = e.clientY; lastY = e.clientY; startH = sheet.offsetHeight; samples = [{ t: performance.now(), y: e.clientY }]; } // a catch mid-settle restarts the drag from the sheet's live height
      sheet.classList.add('dragging'); sheet.classList.remove('snapping');
      try { sheet.setPointerCapture(pid); } catch (err) {}
    }
    const vh = vvHeight();
    // the panel follows the finger (the content area below the top strip scrolls natively - drags can't start there)
    const h = Math.max(SHEET_MIN_PX, Math.min(vh * SHEET_FULL_VH, startH + total));
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
    // Beta 1.82: the DEFAULT stop's target is the sheet's own natural open height, not
    // defH. Streets' content overflows the half cap so its natural height IS defH - but
    // Pace's content is short (its natural height is ~a quarter of the screen), and the
    // 1.81 spring aimed it at defH: it sprang to half, then snapped to its quarter the
    // moment the finish cleared the inline height (Andrew's live catch - "goes halfway,
    // stutters, goes back to its original quarter"). Measure the natural height by
    // clearing the inline geometry for one read, then spring to exactly that.
    const naturalH = (() => { const ph = sheet.style.height, pm = sheet.style.maxHeight; sheet.style.height = ''; sheet.style.maxHeight = ''; const nh = sheet.offsetHeight; sheet.style.height = ph; sheet.style.maxHeight = pm; return nh; })();
    // Release velocity from the last ~130ms of movement, px/ms, positive = upward.
    // The settle spring starts AT this velocity (Beta 1.81) - the old CSS snap restarted
    // from rest, which is what made swipe closes read as "just disappears" on Pace.
    let v = 0;
    if (panelMoved && samples.length > 1) {
      const now = performance.now();
      const s0 = samples.find(s => now - s.t <= 130) || samples[0];
      const dt = now - s0.t;
      if (dt >= 30) v = (s0.y - lastY) / dt;
    }
    // FLICK (Andrew, Beta 1.11 - the Waze gesture): a fast short swipe throws the panel
    // to its next stop on release instead of following the finger the whole way. Only when
    // the panel itself moved (a flick that scrolled the list stays a scroll).
    const flick = panelMoved && Math.abs(v) > 0.30 ? (v > 0 ? 1 : -1) : 0;
    const settleStop = targetH => { // spring the height to a stop; end state = the old snap's end state
      const isFull = targetH >= vh * SHEET_FULL_VH - 1;
      if (isFull) sheet.classList.add('full'); else sheet.classList.remove('full');
      sheet.style.maxHeight = 'none';
      springSheet(sheet, h, targetH, v * 1000, q => { sheet.style.height = q + 'px'; }, () => {
        sheet.classList.remove('dragging');
        if (isFull) sheet.style.height = (vh * SHEET_FULL_VH) + 'px';
        else { sheet.style.height = ''; sheet.style.maxHeight = ''; }
      });
    };
    const settleClose = () => { // spring the sheet off the bottom edge at the finger's speed, then land closed
      sheet.classList.remove('full');
      sheet.style.height = h + 'px'; sheet.style.maxHeight = 'none';
      springSheet(sheet, 0, h * 1.05 + 8, -v * 1000, q => { sheet.style.transform = 'translateY(' + q + 'px)'; }, () => {
        sheet.classList.remove('open');
        sheet.style.height = ''; sheet.style.maxHeight = ''; sheet.style.transform = '';
        if (sheet.id === 'sheet') collapseNoteEditor(); // Beta 1.106: a drag/flick close lands here, not in closeSheetEl - the note-editor reset rides both close funnels
        // Beta 1.83 (Andrew, live catch on 1.82): a flick close landed, then the sheet
        // popped back up and down again a split second later - on Streets and Pace both.
        // The stop landings never did it (flick up to full, flick down to the natural
        // stop): those finish with the sheet's computed values unchanged, so nothing
        // re-animates. The close landing was the one finish that ALSO removed .dragging
        // (transitions back on) in the same breath as flipping .open and clearing the
        // inline geometry - handing the landing to the browser's compositor with a
        // state change left to animate or commit in pieces (an intermediate
        // open-with-no-transform frame reads as exactly that pop). So the close now
        // lands entirely under .dragging (transition: none): classes and inline
        // geometry settle to the closed state first, and .dragging comes off two
        // frames later, when removing it changes no computed value and nothing can
        // animate. Guarded on still-closed so a reopen in between keeps its drag.
        requestAnimationFrame(() => requestAnimationFrame(() => { if (!sheet.classList.contains('open')) sheet.classList.remove('dragging'); }));
      });
    };
    if (flick > 0) { settleStop(vh * SHEET_FULL_VH); return; }
    if (flick < 0) { if (sheet.classList.contains('full')) settleStop(naturalH); else settleClose(); return; }
    if (h < defH * 0.55) { settleClose(); return; }
    if (h > (defH + vh * SHEET_FULL_VH) / 2) { settleStop(vh * SHEET_FULL_VH); return; }
    settleStop(naturalH);
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
}
makeSheetDraggable($('sheet'));
makeSheetDraggable($('pacePanel'));
// Beta 1.78 (Andrew): ONE route surface - the full-screen blue route menu.
// The splash borrows it at boot (.boot; a pick there runs app4's
// __bootPickRoute) and the Routes tab reopens it any time, sliding up over
// the app (.tab). The small Routes sheet is retired. The "Currently loaded"
// badge is a TAB-mode-only signal: at boot nothing is loaded yet, and in
// 1.76/1.77 the badge render landing mid-exit read as a flicker on the pick
// (Andrew, live catch). wireRouteRows binds the rows to the mode's chooser.
function routeRowShell(tag, name, sub, opts) { // Beta 1.136 (programme F): the ONE route-row builder - a .routeRow element carrying the .routeMeta column (a .routeName line, plus a .routeArea line unless sub is null) and, when opts.chevron, the .routeChev. Through 1.135 the row shape was hand-built at three sites (route rows below, the create flow's city rows and its manual-search rows); they all build through this now, so the shape can only drift in one place. Text is assigned via textContent throughout (the Beta 1.94 F-04 rule: pack/city names are data, never markup). opts.cls adds a class (the city list's loading row); callers hang their own extras (dataset, badge, Delete, listeners) on the returned row.
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
function routeRowEl(p) { // Beta 1.94 (audit F-04): rows are built as DOM nodes with textContent, never by interpolating pack data into innerHTML - a pack's name/area are data, and the day route creation lands, a typed name must not be able to become markup. The row shape (classes, badge rule) is unchanged; wireRouteRows' container delegation reads data-route as before. Beta 1.136: the row itself comes from routeRowShell above; this function adds the route-specific extras (the tab badge, a created route's Delete).
  const tab = $('routeMenu').classList.contains('tab');
  const user = !SHIPPED_PACK_IDS.has(p.id); // Beta 1.124: a route Andrew created (not a shipped pack) can be deleted - its row is a DIV, not a <button>, because the Delete control is a real button and buttons cannot nest; the row's choose behaviour is unchanged (the container delegation reads data-route on any .routeRow)
  const b = routeRowShell(user ? 'div' : 'button', p.name, p.area + ' · ' + Object.keys(p.roads).length + ' streets'); b.dataset.route = p.id;
  if (tab && activeRoute && activeRoute.id === p.id) { const bd = document.createElement('span'); bd.className = 'routeBadge'; bd.textContent = 'Currently loaded'; b.appendChild(bd); }
  if (user) { const del = document.createElement('button'); del.className = 'routeDel'; del.type = 'button'; del.textContent = 'Delete'; del.addEventListener('click', e => { e.stopPropagation(); askDeleteRoute(p.id); }); b.appendChild(del); } // the Delete tap stops here - it must never read as a tap on the row itself (which would load the route it is about to delete)
  return b;
}
function renderRouteLists() { document.querySelectorAll('.routeList').forEach(el => { el.replaceChildren(...ROUTE_PACKS.map(routeRowEl)); }); }
function wireRouteRows(container, choose) { container.addEventListener('click', e => { const row = e.target.closest('.routeRow'); if (row) choose(row.dataset.route); }); }
function showRmPane(id) { ['rmMain', 'rmListPane', 'rmCreatePane', 'rmCityListPane', 'rmPhotoPane', 'rmNamePane', 'rmCityPane'].forEach(p => $(p).classList.toggle('on', p === id)); const __away = id !== 'rmMain'; const __bl = $('brandLayer'); if (__bl) __bl.classList.toggle('away', __away); const __cv = $('snowCv'); if (__cv) __cv.classList.toggle('away', __away); } // Beta 1.159 (Andrew, title lifetime rule): the "Snow Route" title - and the snowfall with it - appears ONLY on the main pane; every other pane carries .away on the title's layer and the snow canvas, and returning to rmMain clears it. This function is the ONE pane choke point (every menu navigation in boot and tab mode passes through it), so the rule lives here and nowhere else; in tab mode the brand layer is parked (.off) and the canvas is gone with the splash, so both toggles are inert there.
function openRouteMenu() { crWarmCityLibrary(); const rm = $('routeMenu'); closeSheets(); showRmPane('rmMain'); rm.classList.add('tab'); renderRouteLists(); rm.classList.add('open'); } // Beta 1.130: showing the route menu warms the city catalogue - Create lives behind this menu, and the download is done or nearly done by the time the city list is tapped (the cold-open stutter fix; crWarmCityLibrary rides the cached promise, so this costs at most one small fetch per session)
function closeRouteMenu() { const rm = $('routeMenu'); rm.classList.remove('open'); rm.classList.remove('tab'); }
$('routesBtn').addEventListener('click', () => { if (!tapGuard('routesBtn')) return; if ($('routeMenu').classList.contains('open')) closeRouteMenu(); else openRouteMenu(); });
$('rmClose').addEventListener('click', closeRouteMenu);
$('rmChoose').addEventListener('click', () => { renderRouteLists(); showRmPane('rmListPane'); });
$('rmCreate').addEventListener('click', () => { crWarmCityLibrary(); showRmPane('rmCreatePane'); }); // Beta 1.124 (Andrew, approved mockup): the Create pane opens on the two doors - Select from list renders the city list fresh on ITS entry (crDoorList), not here. Beta 1.130: this tap IS the create gate opening for BOTH entries (the cold-start picker never passes through openRouteMenu, and the Routes menu shares this button), so the catalogue download starts here - by the Select-from-list tap it is in hand
$('rmBack').addEventListener('click', () => showRmPane('rmMain'));
$('rmBack2').addEventListener('click', () => showRmPane('rmMain'));
wireRouteRows($('rmRoutes'), id => {
  if ($('routeMenu').classList.contains('tab')) { closeRouteMenu(); if (!activeRoute || id !== activeRoute.id) loadRoute(id); }
  else if (window.__bootPickRoute) window.__bootPickRoute(id);
});
$('streetsBtn').addEventListener('click', () => { if (!tapGuard('streetsBtn')) return; const open = $('sheet').classList.contains('open'); closeSheets(); if (!open) { $('sheet').style.height = ''; $('sheet').style.maxHeight = ''; renderStreets(); $('sheet').classList.add('open'); } });
$('sheetClose').addEventListener('click', closeSheets);
$('paceClose').addEventListener('click', closeSheets);
$('paceBtn').addEventListener('click', () => { if (!tapGuard('paceBtn')) return; if ($('pacePanel').classList.contains('open')) closePace(); else openPace(); });
function refreshAll() { updateCount(); renderPanel(); renderStreets(); }
