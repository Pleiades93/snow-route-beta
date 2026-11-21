// drive215: Beta 1.262 (fix_id: intersection-1262) - the intersection
// search polish, Andrew's decisions of 2026-11-20. The create flow's
// street search speaks only in intersections (Beta 1.234); through
// 1.261 a result tap flew the map to max(current zoom, 15) and left the
// bar holding whatever fragment he had typed - the crossing he picked
// was named nowhere and marked nowhere. 1.262 lands the decided shape:
// (1) the tap writes the FULL chosen intersection name into the search
// bar, where it stays until he backspaces or taps the clear disc;
// (2) the flight lands at zoom 17 (never zooming out past it - the
// 1.120 max() form with the decided floor); (3) the crossing is marked
// by a native map-engine POI - a GeoJSON source ('crIsect') with two
// circle layers, the GPS stack's own family, never a DOM overlay: a
// solid #2C4AD2 core of radius 7 with NO white ring, and a halo of the
// same blue swelling easeOutQuad from the core to 3x (21 px) while its
// alpha fades 0.38 -> 0, on the approved sample's 1800 ms cycle
// (intersection-sample-2026-11-20/RECORD3); under reduced motion the
// halo rests invisible and the steady core alone marks the crossing;
// (4) bar text and marker are ONE temporary-POI surface with one
// lifecycle owner (crIsectSet / crIsectClear): set together at the pick,
// cleared together - as if it was never there - at the first road
// selection, at the clear disc, when the search text is emptied, and
// when the creation flow closes.
// The world is drive166's fixture Vaughan (the base stub + the tap
// feature stub, copied in the battery's established pattern): its one
// crossing is Bordeaux Drive & Alderson Avenue. The pulse is measured
// from the live style's own paint properties over time (the values the
// engine is painting), in day and night, and the marker's native claim
// is read off the style itself (layers present, typed circle, sourced
// from 'crIsect') against a DOM that must hold no marker element.
import { launchDrive, finish } from './harness.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const FIXDATA = JSON.parse(fs.readFileSync(new URL('./fixtures/create-osm.json', import.meta.url), 'utf8'));
const elsByName = FIXDATA.overpass;
const CITY_FIXTURE = [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8367', lon: '-79.4982', boundingbox: ['43.7256', '43.9538', '-79.6120', '-79.3858'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada' } },
  { display_name: 'Vaughan Road, Toronto, Ontario, Canada', lat: '43.6830', lon: '-79.4260', class: 'highway', type: 'residential', address: { road: 'Vaughan Road', city: 'Toronto' } }];
const FIXTURE = {
  nominatim: [{ display_name: 'Bordeaux Drive, Vaughan, Ontario, Canada', lat: '43.798972', lon: '-79.574666', address: { city: 'Vaughan' } }],
  nominatimCity: CITY_FIXTURE,
  overpass: { 'Bordeaux Drive': elsByName['Bordeaux Drive'], 'Alderson Avenue': elsByName['Alderson Avenue'] }
};
const installStub = `(() => {
  const FIX = ${JSON.stringify(FIXTURE)};
  const orig = window.fetch.bind(window);
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('nominatim.openstreetmap.org') >= 0) {
      if (u.indexOf('featuretype=city') >= 0) return Promise.resolve(new Response(JSON.stringify(FIX.nominatimCity), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return Promise.resolve(new Response(JSON.stringify(FIX.nominatim), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) {
      const raw = decodeURIComponent((opts && opts.body) || '');
      if (raw.indexOf('["highway"]') >= 0) { const els = []; for (const k of Object.keys(FIX.overpass)) els.push(...FIX.overpass[k]); return Promise.resolve(new Response(JSON.stringify({ elements: els }), { status: 200, headers: { 'Content-Type': 'application/json' } })); }
      const m = /"name"="([^"]+)"/.exec(raw);
      const els = (m && FIX.overpass[m[1]]) || [];
      return Promise.resolve(new Response(JSON.stringify({ elements: els }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return orig(url, opts);
  };
  return true;
})()`;
const installFeatureStub = `(() => {
  if (!map.__qrfOrig) map.__qrfOrig = map.queryRenderedFeatures.bind(map);
  window.__fixtureRoads = [];
  map.queryRenderedFeatures = () => window.__fixtureRoads.map(n => ({ type: 'Feature', sourceLayer: 'roads', properties: { name: n }, geometry: { type: 'LineString', coordinates: [] } }));
  return true;
})()`;
const TAP_POINTS = { 'Bordeaux Drive': { lat: 43.798972, lng: -79.574666 }, 'Alderson Avenue': { lat: 43.8000667, lng: -79.573051 } };
const tapStreet = name => `(() => { window.__fixtureRoads = [${JSON.stringify(name)}]; const tp = ${JSON.stringify(TAP_POINTS)}[${JSON.stringify(name)}]; map.fire('click', { lngLat: tp, point: { x: 210, y: 320 }, originalEvent: {} }); return true; })()`;
const pickCityVaughan = async () => {
  await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
  await ev(`(() => { const i = document.getElementById('crCityInput'); i.value = 'Vaughan'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rows = await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 1`, 10000).catch(() => false);
  if (rows === true) await ev(`document.querySelector('#crCityResults .routeRow').click()`);
  return await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 10000).catch(() => false);
};
const typeText = v => `(() => { const i = document.getElementById('crSearchInput'); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
const poiState = () => J(`({ poi: (typeof crIsectPoi !== 'undefined' && crIsectPoi) ? { name: crIsectPoi.name, lat: crIsectPoi.lat, lon: crIsectPoi.lon } : null, val: document.getElementById('crSearchInput').value, disc: document.getElementById('crClear').classList.contains('on'), feats: (() => { const s = map && map.getSource('crIsect'); if (!s) return -1; const d = s._data || {}; return d.type === 'Feature' ? 1 : (d.features ? d.features.length : -2); })() })`);
const pickCrossing = async () => { // type the fragment, wait for the one row, read its item, tap it, wait out the flight
  await ev(typeText('borde'));
  const rows = await poll(`document.querySelectorAll('#createResults .crResult').length === 1`, 10000).catch(() => false);
  if (rows !== true) return null;
  const item = await J(`(() => { const b = document.querySelector('#createResults .crResult'); const it = b && b._crItem; return it ? { name: it.display_name, lat: parseFloat(it.lat), lon: parseFloat(it.lon) } : null; })()`);
  await ev(`document.querySelector('#createResults .crResult').click()`);
  await poll(`!map.isMoving()`, 15000).catch(() => false);
  await sleep(250);
  return item;
};
const samplePulse = async (ms) => { // [t, haloRadius, haloOpacity, dotRadius] read once per painted frame from the live style - the values the engine is painting, frame by frame (a timer sampler starves in this rig: 10 firings in 3.9 s at a 90 ms interval, against the pulse's own frame cadence)
  const raw = await ev(`new Promise(res => { const out = []; const t0 = performance.now(); const step = () => { try { out.push([Math.round(performance.now() - t0), map.getPaintProperty('crIsectHalo', 'circle-radius'), map.getPaintProperty('crIsectHalo', 'circle-opacity'), map.getPaintProperty('crIsectDot', 'circle-radius')]); } catch (e) { out.push([-1, null, null, null]); } if (performance.now() - t0 < ${ms}) requestAnimationFrame(step); else res(JSON.stringify(out)); }; requestAnimationFrame(step); })`);
  try { return JSON.parse(raw); } catch (e) { return []; }
};
const peaksOf = (samples) => { // opacity peak times: a sample above both neighbours and above 0.25
  const pk = [];
  for (let i = 1; i < samples.length - 1; i++) { const o = samples[i][2]; if (typeof o === 'number' && o > 0.25 && o >= samples[i - 1][2] && o >= samples[i + 1][2]) pk.push(samples[i][0]); }
  return pk.filter((t, i) => i === 0 || t - pk[i - 1] > 400);
};

// ---------- boot 5W, enter create, pick the fixture city ----------
await poll(`typeof loadRoute === 'function'`, 20000);
await poll(`!!window.__bootAt`, 30000);
await ev(`document.getElementById('rmChoose').click()`);
await ev(`document.querySelector('#rmRoutes .routeRow').click()`);
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
await poll(`!document.getElementById('splash')`, 20000);
await poll(`typeof map === 'undefined' || !map || !map.isMoving()`, 25000);
await ev(installStub);
await ev(installFeatureStub);
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
const inPick = await pickCityVaughan();
const ready = await poll(`typeof crPrepState !== 'undefined' && crPrepState === 'ready'`, 60000).catch(() => false);
ok('S0 setup: the manual door lands in the pick stage and the fixture city preparation completes', inPick === true && ready === true);

// ---------- the pick: bar text, zoom 17, the native marker ----------
await ev(`map.jumpTo({ zoom: 13 })`); // start well under the decided floor, so the flight's landing is the pick's own work
const item = await pickCrossing();
const P0 = await J(`({ zoom: map.getZoom(), c: map.getCenter(), item: ${JSON.stringify(item)} })`);
const centreOffM = item ? Math.hypot((P0.c.lng - item.lon) * 80386, (P0.c.lat - item.lat) * 111320) : 9999;
const PS = await poiState();
ok('P1 the pick writes the FULL intersection name into the search bar (not the typed fragment) | ' + JSON.stringify(PS),
  !!item && PS.val === item.name && PS.val.indexOf('&') > 0);
ok('P2 the clear disc stands while the picked name holds the bar', PS.disc === true);
ok('P3 the flight lands at zoom 17 on the crossing itself (from 13; centre within 25 m) | zoom ' + P0.zoom + ', off ' + Math.round(centreOffM) + ' m',
  Math.abs(P0.zoom - 17) < 0.1 && centreOffM < 25);
const LAY = await J(`(() => { const ls = (map.getStyle() && map.getStyle().layers) || []; const dot = ls.find(l => l.id === 'crIsectDot'), halo = ls.find(l => l.id === 'crIsectHalo'); const spec = l => l ? { type: l.type, source: l.source, paint: l.paint || {} } : null; return { dot: spec(dot), halo: spec(halo), markers: document.querySelectorAll('.maplibregl-marker').length, poi: (typeof crIsectPoi !== 'undefined' && crIsectPoi) ? { name: crIsectPoi.name, lat: crIsectPoi.lat, lon: crIsectPoi.lon } : null, srcPt: (() => { const s = map.getSource('crIsect'); const d = s && s._data; return d && d.geometry ? d.geometry.coordinates : null; })() }; })()`);
ok('P4 the marker is NATIVE: two circle layers on the crIsect GeoJSON source in the style itself, and the DOM holds no marker element | ' + JSON.stringify(LAY).slice(0, 220),
  !!LAY.dot && !!LAY.halo && LAY.dot.type === 'circle' && LAY.halo.type === 'circle' && LAY.dot.source === 'crIsect' && LAY.halo.source === 'crIsect' && LAY.markers === 0);
ok('P5 the core is the decided dot: solid app link blue #2C4AD2 at radius 7, NO white ring (no stroke on the core) | ' + JSON.stringify(LAY.dot && LAY.dot.paint),
  !!LAY.dot && LAY.dot.paint['circle-color'] === '#2C4AD2' && LAY.dot.paint['circle-radius'] === 7 && !(LAY.dot.paint['circle-stroke-width'] > 0) && !LAY.dot.paint['circle-stroke-color']);
ok('P6 the surface state and the source point sit on the picked crossing | ' + JSON.stringify(LAY.poi) + ' vs ' + JSON.stringify(item),
  !!item && !!LAY.poi && LAY.poi.name === item.name && Math.abs(LAY.poi.lat - item.lat) < 1e-9 && Math.abs(LAY.poi.lon - item.lon) < 1e-9 && !!LAY.srcPt && Math.abs(LAY.srcPt[0] - item.lon) < 1e-6 && Math.abs(LAY.srcPt[1] - item.lat) < 1e-6);

// ---------- the pulse, measured off the live style (day) ----------
const S1 = await samplePulse(3900);
const r1 = S1.map(s => s[1]).filter(v => typeof v === 'number'), o1 = S1.map(s => s[2]).filter(v => typeof v === 'number'), d1 = S1.map(s => s[3]).filter(v => typeof v === 'number');
const pk1 = peaksOf(S1);
// The pulse law, graded as a LAW, not by catching its extremes: with
// opacity o = 0.38*(1-t) and radius r = 7 + 14*(1-(1-t)^2), eliminating
// t gives r = 21 - 14*(o/0.38)^2 exactly - every painted frame must lie
// on that curve (the documented rest frame, 7/0, excepted). Frame
// cadence in this rig swings 5-60 fps under load, so extremes are luck;
// the curve is not.
const onCurve = S1.filter(s => typeof s[1] === 'number' && typeof s[2] === 'number' && !(s[1] === 7 && s[2] === 0)).every(s => Math.abs(s[1] - (21 - 14 * Math.pow(s[2] / 0.38, 2))) < 1.0);
ok('P7 (day) the halo pulses on the decided cycle: every painted frame lies on the sample law (radius 21 - 14*(opacity/0.38)^2 - easeOutQuad swelling 7 -> 21 while alpha fades 0.38 -> 0), the sweep spans both ends, peaks land ~1800 ms apart, the core never moves | n=' + S1.length + ' rMin=' + Math.min(...r1) + ' rMax=' + Math.max(...r1) + ' oMax=' + Math.max(...o1) + ' peaks=' + JSON.stringify(pk1),
  S1.length >= 8 && onCurve && Math.max(...o1) > 0.25 && Math.min(...o1) < 0.12 && (Math.max(...r1) - Math.min(...r1)) > 10 && d1.every(v => v === 7) && pk1.length >= 2 && (pk1[1] - pk1[0]) >= 1400 && (pk1[1] - pk1[0]) <= 2200);

// ---------- the same surface at night (style swap re-seats the layers) ----------
await ev(`setThemeOverride(true); applyNight(); setBasemap(); true`);
await poll(`!!map.getLayer('crIsectDot')`, 15000).catch(() => false);
await sleep(600);
const NS = await poiState();
const S2 = await samplePulse(4500); // a long window on purpose: the night style's tile reload starves the frame loop in this rig (7 frames in 2.1 s, each one mid-sweep) - the claim is the sweep's range, so the window spans cycles even at that cadence
const r2 = S2.map(s => s[1]).filter(v => typeof v === 'number'), o2 = S2.map(s => s[2]).filter(v => typeof v === 'number');
const NL = await J(`(() => { const l = (map.getStyle().layers || []).find(x => x.id === 'crIsectDot'); return l ? l.paint['circle-color'] : null; })()`);
ok('P8 (night) the surface survives the basemap swap: layers re-seated, state + bar + point intact, the halo still sweeping, the core still the same blue | ' + JSON.stringify(NS) + ' night colour ' + NL + ' pulse n=' + S2.length + ' rMin=' + (r2.length ? Math.min(...r2) : 'x') + ' rMax=' + (r2.length ? Math.max(...r2) : 'x') + ' oMax=' + (o2.length ? Math.max(...o2) : 'x'),
  NS.poi && NS.poi.name === (item && item.name) && NS.val === (item && item.name) && NS.feats === 1 && r2.length >= 5 && (Math.max(...r2) - Math.min(...r2)) > 10 && Math.max(...o2) > 0.25 && NL === '#2C4AD2');
await ev(`setThemeOverride(false); applyNight(); setBasemap(); true`);
await poll(`!!map.getLayer('crIsectDot')`, 15000).catch(() => false);
await sleep(400);

// ---------- the frame-driven pulse's two engine contracts (gate round, Codex P2s on PR #158) ----------
// (i) MapLibre's default paint transition is 300 ms: without zero-duration
// overrides the painted halo would chase each frame's target instead of
// wearing it, smearing the law P7 grades off the targets. The overrides
// are what make target == painted, so they are pinned on the style spec.
const TR = await J(`(() => { const l = (map.getStyle().layers || []).find(x => x.id === 'crIsectHalo'); return l ? { r: l.paint['circle-radius-transition'], o: l.paint['circle-opacity-transition'] } : null; })()`);
ok('P5b the halo carries zero-duration paint transitions, so the frame loop paints its values directly (no 300 ms default-transition smear across the cycle reset) | ' + JSON.stringify(TR),
  !!TR && !!TR.r && TR.r.duration === 0 && !!TR.o && TR.o.duration === 0);
// (ii) The pulse's per-frame paint updates fire styledata; the basemap-swap
// restoration must not answer them - a standing pulse that rebuilt the
// draft + route POI sources every frame would tax the phone for as long
// as the crossing stands. Count renderDraft calls over 2 s of standing.
await ev(`window.__rdN = 0; window.__rdOrig = renderDraft; renderDraft = function () { window.__rdN++; return window.__rdOrig.apply(this, arguments); }; true`);
await sleep(2000);
const rdN = await ev(`window.__rdN`);
await ev(`renderDraft = window.__rdOrig; true`);
ok('P9 a standing pulse does not rebuild the creation sources: renderDraft calls over 2 s of standing pulse | n=' + rdN, typeof rdN === 'number' && rdN <= 2);
// (iii) The stand-down's one order-sensitive duty (gate round 2, Codex P2):
// the backdrop hides the loaded route's layers by id, and a basemap swap's
// GLP.init re-creates them visible AFTER this listener's restoration turn.
// This world loads no route, so a stand-in layer wears a route layer's id:
// recorded + hidden (the backdrop's state), then re-created visible (GLP's
// move) - the pulse's own styledata beats must re-hide it.
await ev(`map.addLayer({ id: 't1-fill', type: 'circle', source: 'crIsect', paint: { 'circle-radius': 3, 'circle-color': '#000000' } }); crHiddenLayers = [['t1-fill', 'visible']]; map.setLayoutProperty('t1-fill', 'visibility', 'none'); true`);
await ev(`map.removeLayer('t1-fill'); map.addLayer({ id: 't1-fill', type: 'circle', source: 'crIsect', paint: { 'circle-radius': 3, 'circle-color': '#000000' } }); true`);
await sleep(1500);
const driftVis = await ev(`map.getLayoutProperty('t1-fill', 'visibility')`);
await ev(`if (map.getLayer('t1-fill')) map.removeLayer('t1-fill'); crHiddenLayers = []; true`);
ok('P10 the backdrop is re-applied when a recorded route layer stands visible again after a swap-order restoration (stand-in layer, re-created visible like GLP.init leaves it) | visibility ' + driftVis, driftVis === 'none');

// ---------- lifecycle L1: the clear disc takes the whole surface ----------
await ev(`document.getElementById('crClear').click()`);
await sleep(200);
const L1 = await poiState();
ok('L1 the clear disc clears the pair together: bar empty, state gone, the source holds no point | ' + JSON.stringify(L1),
  L1.val === '' && L1.poi === null && L1.feats === 0 && L1.disc === false);

// ---------- zoom floor: a pick from above 17 never zooms out ----------
await ev(`map.jumpTo({ zoom: 18.5 })`);
const item2 = await pickCrossing();
const Z2 = await J(`map.getZoom()`);
const PS2 = await poiState();
ok('Z2 a pick made from zoom 18.5 lands the surface again and the flight does NOT zoom out to 17 | zoom ' + Z2,
  !!item2 && Z2 > 18.3 && PS2.poi !== null && PS2.val === item2.name);

// ---------- lifecycle L2: emptying the text takes the whole surface ----------
await ev(typeText(''));
await sleep(200);
const L2 = await poiState();
ok('L2 backspacing the bar empty clears the pair together (state gone, source empty) | ' + JSON.stringify(L2),
  L2.val === '' && L2.poi === null && L2.feats === 0);

// ---------- reduced motion: the halo rests, the core still marks ----------
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, S);
const item3 = await pickCrossing();
await sleep(150);
const S3 = await samplePulse(1200);
const RM = await poiState();
ok('R1 under reduced motion the surface still sets (bar + point + steady core) but the halo RESTS - every sampled radius 7, every opacity 0 | n=' + S3.length + ' ' + JSON.stringify(RM),
  !!item3 && RM.poi !== null && RM.feats === 1 && S3.length >= 8 && S3.every(s => s[1] === 7 && s[2] === 0 && s[3] === 7));
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: '' }] }, S);
await ev(`document.getElementById('crClear').click()`);
await sleep(200);

// ---------- lifecycle L3: the first road selection takes the surface ----------
const item4 = await pickCrossing();
const preTap = await poiState();
await ev(tapStreet('Bordeaux Drive'));
const added = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux Drive']`, 15000).catch(() => false);
await sleep(200);
const L3 = await poiState();
ok('L3 the FIRST road selection clears the pair as if it was never there: the street joins the draft, the bar empties, the state and point are gone | set before tap: ' + JSON.stringify(preTap.poi) + ', after: ' + JSON.stringify(L3),
  !!item4 && preTap.poi !== null && added === true && L3.val === '' && L3.poi === null && L3.feats === 0);

// ---------- lifecycle L4: closing the flow takes a live surface ----------
const item5 = await pickCrossing();
const preExit = await poiState();
await ev(`document.getElementById('crExit').click()`);
await sleep(400);
await ev(`(() => { const y = document.getElementById('crModalYes'); if (y && !document.getElementById('crModal').classList.contains('hidden')) y.click(); return true; })()`);
await sleep(500);
const L4 = await J(`({ creating, val: document.getElementById('crSearchInput').value, poi: (typeof crIsectPoi !== 'undefined' && crIsectPoi) ? crIsectPoi.name : null })`);
ok('L4 closing the creation flow clears a live surface with the session (bar empty, state gone, flow closed) | set before exit: ' + JSON.stringify(preExit.poi) + ', after: ' + JSON.stringify(L4),
  !!item5 && preExit.poi !== null && L4.creating === false && L4.val === '' && L4.poi === null);

finish(R, proc);
