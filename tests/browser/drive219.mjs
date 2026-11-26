import { launchDrive, finish, pinDayTheme, forceRouteTitlesOn, forceRouteTitlesOff } from './harness.mjs';
import { laneViolations, syncVerdict } from './lane-judge.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true }, S); // this lane grades presence and paint, not pixels: at the harness's retina factor the software-rendered headless map eats the main thread and the 50 ms sampler starves to a few ticks a second (measured), which would stretch the very timings under grade. At factor 1 the sampler holds its 50 ms median (measured).

// drive219: the title lane. Phase 0 grades the shipped ON state, the
// middle phases centred spec-fixed titles, phase V the zoom 15.2
// instant switch, phase Z the forced-off contract.
// Settled-frame rule: names are judged only over samples at or after the
// flight's moveend (mid-flight, the wide view legitimately loses names).
// The lane grades that the app never dims or hides an ORIGINAL basemap
// layer (A5, B1); the clones are graded as their own group.
// Theme-swap limit (flagged, not fixed): setStyle recreates labelpts, so
// source identity breaks at a swap; the centre spec survives as layer
// spec and phase B grades exactly that boundary.
// Phases: 0 shipped ON state, A load-in stream, F pan, B theme swap,
// C second pick, D mid-flight centre spec, U 6x-throttle tour + cull
// count, V the handover journey, G instant fit, H unload mid-dwell,
// I create mode, J unload mid-flight, Z forced off state.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

// ---------- pre-pick boot (bootThrough's own first steps, split so the
// instrumentation lands BEFORE the pick - the window this drive grades
// opens at the click) ----------
const bootToPicker = async () => {
  if (!await poll(`typeof loadRoute === 'function'`, 20000)) throw new Error('drive219: loadRoute never defined');
  if (!await poll(`!!window.__bootAt`, 30000)) throw new Error('drive219: the app never booted (__bootAt)');
  await pinDayTheme(ev);
  await ev(`document.getElementById('rmChoose') && document.getElementById('rmChoose').click()`);
  const styleLanded = `!!(typeof map !== 'undefined' && map && map.getStyle && map.getStyle().layers && map.getStyle().layers.length > 10)`;
  // the bare binding only: window.map is a stale handle that stays
  // truthy while the binding sits at null between maps
  if (!await poll(styleLanded, 45000)) throw new Error('drive219: the basemap style never landed - the sampler would measure an empty map and pass vacuously');
};

const INSTRUMENT = `(() => {
  window.__li = { samples: [], tears: [], idles: [], moveEndAt: 0 };
  window.__liSrcSeq = 0; window.__liSrcMap = new WeakMap();
  map.on('idle', () => { try { window.__li.idles.push(performance.now()); } catch (e) {} });
  map.on('moveend', () => { try { window.__li.moveEndAt = performance.now(); } catch (e) {} }); // the settled frame's start - the lanes judge from here (see the header's settled-frame rule)
  const origRS = map.removeSource.bind(map);
  map.removeSource = (id) => { if (id === 'labelpts') { try { window.__li.tears.push({ t: performance.now() }); } catch (e) {} } return origRS(id); }; // a teardown counter: under the label-round contract the app never calls this for labelpts at all - the cure that did is deleted
  const srcToken = () => { try { const s = map.getSource('labelpts'); if (!s) return 0; let t = window.__liSrcMap.get(s); if (!t) { t = ++window.__liSrcSeq; window.__liSrcMap.set(s, t); } return t; } catch (e) { return -1; } };
  // EFFECTIVE opacity: what a layer's live text-opacity spec actually
  // evaluates to at the current zoom (undefined = 1, a number = itself, a
  // zoom interpolate/step evaluated over its stops). The lane grades THIS,
  // never bookkeeping. The judging itself lives in lane-judge.mjs
  // (extracted, fixture-tested by selftest-lane219.mjs): per-name values
  // from each name's own layer.
  const effOf = (v, z) => {
    if (v === undefined) return 1;
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) {
      if (v[0] === 'interpolate') { let prevIn = v[3], prevOut = v[4]; if (z <= prevIn) return prevOut; for (let i = 5; i + 1 < v.length; i += 2) { const zi = v[i], zo = v[i + 1]; if (z <= zi) { const k = zi === prevIn ? 1 : (z - prevIn) / (zi - prevIn); return prevOut + (zo - prevOut) * k; } prevIn = zi; prevOut = zo; } return prevOut; }
      if (v[0] === 'step') { let out = v[2]; for (let i = 3; i + 1 < v.length; i += 2) { if (z >= v[i]) out = v[i + 1]; } return out; }
      if (v[0] === '*') return effOf(v[1], z) * v[2];
    }
    return 1;
  };
  // The layer sets are enumerated on styledata (a stack build, a theme
  // swap) and cached between ticks - a getStyle() clone per tick starved
  // the sampler to ~2 ticks a second in this drive's first shape.
  window.__liLayers = null;
  const TITLE_IDS = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'];
  const enumerate = () => {
    try {
      const layers = map.getStyle().layers;
      const allBase = layers.filter(L => L.type === 'symbol' && L.layout && L.layout['text-field'] && L['source-layer']).map(L => L.id);
      const clones = allBase.filter(id => id === 'roads_labels_major-route' || id === 'roads_labels_minor-route');
      const base = allBase.filter(id => !clones.includes(id));
      window.__liLayers = {
        base, clones,
        road: base.filter(id => /road|street|motorway|path|ferry/i.test(id)),
        place: base.filter(id => !/road|street|motorway|path|ferry/i.test(id)),
        titles: TITLE_IDS.filter(id => map.getLayer(id))
      };
    } catch (e) {}
  };
  enumerate();
  map.on('styledata', enumerate);
  const origQRF = map.queryRenderedFeatures.bind(map);
  window.__liTimer = setInterval(() => {
    try {
      const L = window.__liLayers || { base: [], clones: [], road: [], place: [], titles: [] };
      // Per-layer effective opacity, computed once per tick; the groups
      // carry each name with ITS OWN layer's value (the lane judges per
      // name) plus the group's max/min.
      const z = map.getZoom();
      const layerEff = {};
      for (const id of [...L.titles, ...L.base, ...L.clones]) { try { layerEff[id] = map.getLayoutProperty(id, 'visibility') === 'none' ? 0 : effOf(map.getPaintProperty(id, 'text-opacity'), z); } catch (e) { layerEff[id] = 1; } } // a hidden layer renders nothing whatever its paint says - visibility reads as effective opacity 0
      const stats = (ids) => { if (!ids.length) return { names: {}, effMax: null, effMin: null }; const es = ids.map((id) => layerEff[id]); return { names: {}, effMax: Math.max(...es), effMin: Math.min(...es) }; };
      const groups = { titles: stats(L.titles), road: stats(L.road), place: stats(L.place), clone: stats(L.clones) };
      let nRoad = 0;
      const roadSet = new Set(L.road), placeSet = new Set(L.place), titleSet = new Set(L.titles), cloneSet = new Set(L.clones);
      for (const f of origQRF({ layers: [...L.titles, ...L.base, ...L.clones] })) {
        const nm = f.properties && f.properties.name; if (!nm) continue;
        const lid = f.layer && f.layer.id;
        if (titleSet.has(lid)) groups.titles.names[nm] = layerEff[lid];
        else if (cloneSet.has(lid)) groups.clone.names[nm] = layerEff[lid];
        else if (roadSet.has(lid)) { groups.road.names[nm] = layerEff[lid]; nRoad++; }
        else if (placeSet.has(lid)) groups.place.names[nm] = layerEff[lid];
      }
      let visNoneT = 0;
      for (const id of L.titles) { try { if (map.getLayoutProperty(id, 'visibility') === 'none') visNoneT++; } catch (e) {} }
      let specSig = '';
      try { const s = map.getSource('labelpts'); const d = s && s.serialize ? s.serialize().data : null; if (d && d.features && d.features.length) specSig = TITLE_IDS.filter((id) => map.getLayer(id)).map((id) => map.getLayoutProperty(id, 'text-anchor') + ':' + map.getLayoutProperty(id, 'text-radial-offset')).join('|') + '#' + d.features.length; } catch (e) {} // the centre spec as this tick sees it - D2 grades that it never changes inside a window
      window.__li.samples.push({ t: performance.now(),
        groups,
        titles: Object.keys(groups.titles.names), road: Object.keys(groups.road.names), place: Object.keys(groups.place.names), clone: Object.keys(groups.clone.names), nRoad,
        src: srcToken(), visNoneT, specSig });
    } catch (e) {}
  }, 50);
  return true;
})()`;

const medianGap = (samples) => { const g = []; for (let i = 1; i < samples.length; i++) g.push(samples[i].t - samples[i - 1].t); g.sort((a, b) => a - b); return g.length ? g[Math.floor(g.length / 2)] : 0; };
const completeAt = (samples, group) => { // the first sample where the group's placed-name count reaches the most it ever reaches in the window - completion read against the group's own total, honest under sparse sampling
  let total = 0; for (const s of samples) total = Math.max(total, Object.keys((s.groups && s.groups[group] && s.groups[group].names) || {}).length);
  if (!total) return -1;
  const hit = samples.find((s) => Object.keys((s.groups && s.groups[group] && s.groups[group].names) || {}).length >= total);
  return hit ? hit.t : -1;
};
const waitSettled = async (ms) => poll(`(() => { try { const last = window.__li.samples[window.__li.samples.length - 1]; return !!last && last.titles.length >= 30; } catch (e) { return false; } })()`, ms);
const srcTokens = (samples) => [...new Set(samples.map((s) => s.src).filter((t) => t > 0))]; // the distinct live labelpts source objects a window saw (0 = not yet created)
const readSpec = async () => J(`(() => { const layers = {}; for (const id of ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4']) layers[id] = map.getLayer(id) ? { a: map.getLayoutProperty(id, 'text-anchor'), r: map.getLayoutProperty(id, 'text-radial-offset') } : null; const s = map.getSource('labelpts'); const d = s && s.serialize ? s.serialize().data : null; return { layers, features: d && d.features ? d.features.length : 0 }; })()`);
const specIsCentre = (spec) => ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].every((id) => spec.layers[id] && spec.layers[id].a === 'center' && spec.layers[id].r === 0);
const pickRoute = async () => ev(`(() => { const r = document.querySelector('#rmRoutes .routeRow'); if (r) { r.click(); const b = r.nextElementSibling && r.nextElementSibling.querySelector('.dropLoad'); if (b) b.click(); } return true; })()`);

// ================= Phase 0: the shipped ON state =================
// No force: this phase grades the app exactly as it ships (Beta 1.294:
// the handover turned on).
await bootToPicker();
await pickRoute();
const nSettled = await poll(`(() => { try { const ids = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].filter((id) => map.getLayer(id)); if (!ids.length) return false; const s = new Set(); for (const f of map.queryRenderedFeatures({ layers: ids })) if (f.properties && f.properties.name) s.add(f.properties.name); return s.size >= 30; } catch (e) { return false; } })()`, 45000);
await sleep(600);
const nSpec = await readSpec();
const N = await J(`(() => { const out = { flag: (typeof ROUTE_TITLES_ON !== 'undefined') ? ROUTE_TITLES_ON : 'undefined' }; for (const id of ['roads_labels_major', 'roads_labels_minor', 'roads_labels_major-route', 'roads_labels_minor-route']) { const L = map.getStyle().layers.find((x) => x.id === id); out[id] = L ? { min: (typeof L.minzoom === 'number' ? L.minzoom : null), filt: L.filter ? JSON.stringify(L.filter) : '', spacing: map.getLayoutProperty(id, 'symbol-spacing'), op: JSON.stringify(map.getPaintProperty(id, 'text-opacity')) } : null; } return out; })()`);
const nTitles = await J(`(() => { const ids = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].filter((id) => map.getLayer(id)); const s = new Set(); for (const f of map.queryRenderedFeatures({ layers: ids })) if (f.properties && f.properties.name) s.add(f.properties.name); return s.size; })()`);
console.log('drive219 0: flag ' + N.flag + ', features ' + nSpec.features + ', titles rendered ' + nTitles + ', clones ' + JSON.stringify({ major: !!N['roads_labels_major-route'], minor: !!N['roads_labels_minor-route'] }));
ok('N1 THE SHIPPED SWITCH READS ON in the running app (ROUTE_TITLES_ON: ' + N.flag + ') - Beta 1.294 ships the handover turned on',
  N.flag === true);
ok('N2 THE TITLE BUILD IS LIVE AS SHIPPED: the labelpts source carries the full pack (features: ' + nSpec.features + ') and all four title layers carry the centre spec (spec: ' + JSON.stringify(nSpec.layers) + ')',
  nSpec.features >= 34 && specIsCentre(nSpec));
ok('N3 THE ORIGINALS EXCLUDE ROUTE NAMES as shipped: both road-label filters carry the exclusion (the route names are inlined inside it) - major filter names Valeria Boulevard: ' + ((N['roads_labels_major'] || {}).filt || '').includes('Valeria Boulevard') + ', minor filter: ' + ((N['roads_labels_minor'] || {}).filt || '').includes('Valeria Boulevard'),
  !!N['roads_labels_major'] && (N['roads_labels_major'].filt || '').includes('Valeria Boulevard') && (N['roads_labels_major'].filt || '').includes('"!"') &&
  !!N['roads_labels_minor'] && (N['roads_labels_minor'].filt || '').includes('Valeria Boulevard') && (N['roads_labels_minor'].filt || '').includes('"!"'));
ok('N4 THE HANDOVER CLONES EXIST AS SHIPPED with their shape: both -route layers present from minzoom 15.2, route-only filters ' +
  '(they name Valeria Boulevard with NO exclusion marker), and NO spec fade ramp (major clone: ' + JSON.stringify(N['roads_labels_major-route']) +
  ', minor clone: ' + JSON.stringify(N['roads_labels_minor-route']) + ')',
  !!N['roads_labels_major-route'] && !!N['roads_labels_minor-route'] &&
  N['roads_labels_major-route'].min === 15.2 && N['roads_labels_minor-route'].min === 15.2 &&
  (N['roads_labels_major-route'].filt || '').includes('Valeria Boulevard') && !(N['roads_labels_major-route'].filt || '').includes('"!"') &&
  (N['roads_labels_minor-route'].filt || '').includes('Valeria Boulevard') && !(N['roads_labels_minor-route'].filt || '').includes('"!"') &&
  !(N['roads_labels_major-route'].op || '').includes('15,0') && !(N['roads_labels_major-route'].op || '').includes('16,1') &&
  !(N['roads_labels_minor-route'].op || '').includes('15,0') && !(N['roads_labels_minor-route'].op || '').includes('16,1'));
ok('N5 THE REPETITION IS 250 ON ALL FOUR ROAD-LABEL LAYERS (Andrew\'s 2026-11-24 re-pick): major ' + (N['roads_labels_major'] || {}).spacing + ', minor ' + (N['roads_labels_minor'] || {}).spacing + ', major clone ' + (N['roads_labels_major-route'] || {}).spacing + ', minor clone ' + (N['roads_labels_minor-route'] || {}).spacing,
  N['roads_labels_major'] && N['roads_labels_major'].spacing === 250 && N['roads_labels_minor'] && N['roads_labels_minor'].spacing === 250 &&
  N['roads_labels_major-route'] && N['roads_labels_major-route'].spacing === 250 && N['roads_labels_minor-route'] && N['roads_labels_minor-route'].spacing === 250);
ok('N6 THE TITLES PLACE AT THE SETTLED VIEW AS SHIPPED: ' + nTitles + ' title names rendered at the fit view (settled poll: ' + nSettled + ') - the far-zoom half of the handover, live without any force',
  nSettled === true && nTitles >= 30);
await ev(`(() => { unloadRouteToBoot(); return true; })()`);
await poll(`!!document.querySelector('#rmRoutes .routeRow')`, 20000);

// ================= Phase A: the streaming load-in =================
await send('Page.reload', {}, S);
await bootToPicker();
await forceRouteTitlesOn(ev, poll);
// Fixture warm-up (unmeasured, before the instrument installs): one
// throwaway pick, settled, then unloaded back to the picker. The graded
// pick below is a normal boot-style pick from the picker state the
// unload restores; the warm pick leaves every asset it needs cached, so
// its layers exist before its flight and the sampler measures the app,
// not the sandbox's cold caches.
await pickRoute();
await poll(`(() => { try { const ids = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].filter((id) => map.getLayer(id)); if (!ids.length) return false; const s = new Set(); for (const f of map.queryRenderedFeatures({ layers: ids })) if (f.properties && f.properties.name) s.add(f.properties.name); return s.size >= 30; } catch (e) { return false; } })()`, 45000); // the warm pick's own settle, read off the real map (no instrument yet - a plain title-only read is honest here)
await ev(`(() => { unloadRouteToBoot(); return true; })()`);
await poll(`!!document.querySelector('#rmRoutes .routeRow')`, 20000);
await ev(INSTRUMENT);
await pickRoute();
const aDone = await waitSettled(40000);
await sleep(700);
const A = await J(`window.__li`);
const aMachinery = await J(`(() => ({ nameFade: typeof nameFade !== 'undefined', nameHoldSet: typeof nameHoldSet !== 'undefined', armTitleRePlace: typeof armTitleRePlace !== 'undefined', rePlaceTitles: !!(window.GLP && window.GLP.rePlaceTitles) }))()`);
console.log('drive219 A: samples ' + A.samples.length + ', tears ' + A.tears.length + ', src tokens ' + JSON.stringify(srcTokens(A.samples)) + ', settled ' + aDone + ', machinery ' + JSON.stringify(aMachinery));
ok('A1 the load-in completes by streaming: the titles reach full placement with no reveal to wait for (settled poll: ' + aDone + ', final titles placed: ' + (A.samples.length ? A.samples[A.samples.length - 1].titles.length : 0) + ', samples: ' + A.samples.length + ')',
  aDone === true && A.samples.length > 0 && A.samples[A.samples.length - 1].titles.length >= 30);
ok('A2 THE LOAD-IN MACHINERY IS ABSENT LIVE: no nameFade state, no nameHoldSet, no armTitleRePlace, no GLP.rePlaceTitles exists in the running app (live read: ' + JSON.stringify(aMachinery) + ') - the hold and the cure are deleted, not dormant',
  aMachinery.nameFade === false && aMachinery.nameHoldSet === false && aMachinery.armTitleRePlace === false && aMachinery.rePlaceTitles === false);
ok('A3 NO TEARDOWN, ONE SOURCE: zero labelpts removeSource calls across the whole load-in, and every sample that saw the source saw the SAME object (source tokens: ' + JSON.stringify(srcTokens(A.samples)) + ', teardowns: ' + A.tears.length + ') - the source the stack built is the source that settles',
  A.tears.length === 0 && srcTokens(A.samples).length === 1);
ok('A8 NO TITLE LAYER EVER STANDS AT VISIBILITY NONE on a normal pick (samples with a hidden title layer: ' + A.samples.filter((s) => s.visNoneT > 0).length + ' of ' + A.samples.length + ') - nothing hides the titles, so nothing can blink them',
  A.samples.every((s) => s.visNoneT === 0));
const aSettled = A.samples.filter((x) => x.t >= A.moveEndAt);
const aLaneT = laneViolations(aSettled, 'titles');
const aCT = completeAt(A.samples, 'titles');
const aRoadDim = A.samples.filter((x) => x.t >= aCT && x.groups && x.groups.road && (x.groups.road.effMin < 1 || x.groups.road.effMax < 1));
ok('A4 THE LANE, titles: no title, once visibly appeared, returns to zero for 3 or more consecutive samples inside the settled frame '
  + '(the run bound is the sampler\'s proven blind spot - the drive216 investigation showed the placement read misses a rendered name for a sample or two; '
  + 'samples from the flight\'s moveend on, per the settled-frame rule; violations: ' + JSON.stringify(aLaneT) + '; sampling: ' + A.samples.length
  + ' samples, median gap ' + Math.round(medianGap(A.samples)) + ' ms - the blink this lane exists to catch lasted ~1-2 s, ~4.9 s throttled, and it landed after moveend by construction)',
  aLaneT.length === 0);
ok('A5 THE LANE, basemap road names: the app never dims or hides a basemap layer - across every sample from the titles\' completion on, the road layers\' effective text-opacity never leaves 1 (dimmed samples: ' + aRoadDim.length + ' of ' + A.samples.filter((x) => x.t >= aCT).length + '). Basemap label PERSISTENCE is not asserted: those labels are the renderer\'s own collision placement over a still-streaming basemap, and a marginal one (Chancellor Drive, in both CI attempts on this PR, while every title lane held) can lose its seat after completion - the deleted name hold\'s sin was writing basemap opacity, and that is what this check grades',
  aRoadDim.length === 0);
const aLastRoad = A.samples.length ? A.samples[A.samples.length - 1].road : [];
const aLastTitles = A.samples.length ? A.samples[A.samples.length - 1].titles : [];
ok('A7 ONE NAME SET at the end of the window: the observed route street\'s basemap copy is gone once the scene completes (the exclusion has landed - road names in the final sample contain Valeria Boulevard: ' + aLastRoad.includes('Valeria Boulevard') + ') and its name is carried by the route title instead (titles contain Valeria: ' + aLastTitles.includes('Valeria') + ') - never doubled, never nameless',
  !aLastRoad.includes('Valeria Boulevard') && aLastTitles.includes('Valeria'));
const aSettledSlice = A.samples.filter((x) => x.t >= A.moveEndAt); // A6 judges the SETTLED frame only: over the whole window the road group reaches its max during the wide flight view whenever the warm pick left its tiles cached (measured: road completion at +359 ms against titles at +5400 ms on a warm local run - a completion-bracket artifact, not a desync), while the defect this check exists for is names missing AFTER landing
const countSeries = (samples, group) => samples.map((x) => ({ t: x.t, n: Object.keys((x.groups && x.groups[group] && x.groups[group].names) || {}).length }));
const aSync = syncVerdict(countSeries(aSettledSlice, 'titles'), countSeries(aSettledSlice, 'road'));
ok('A6 THE SYNC AT THE SETTLED FRAME: titles and basemap road names complete in the same WAVE once the flight lands - '
  + 'the gap between their completion times no larger than the longer group\'s own streaming span, floored at 3000 ms (titles complete at +'
  + Math.round((aSync.completeAtA ?? A.moveEndAt) - A.moveEndAt) + ' ms, road names at +' + Math.round((aSync.completeAtB ?? A.moveEndAt) - A.moveEndAt)
  + ' ms from moveend; gap ' + Math.round(aSync.gap ?? -1) + ' ms, span ' + Math.round(aSync.span) + ' ms. '
  + 'A group held back then released in a burst - the shipped 1.266 wait of 3.1-6.7 s of nameless map AFTER landing - has a short span and a long gap and fails; '
  + 'slow continuous streaming under load stretches the span with the gap, which the old flat 3000 ms bracket misread as desync: flake census 2, 2026-11-25, '
  + 'road names completing at +3155/+3247 ms against titles at +0, the two tile pipelines 23 ms apart at event level)',
  aSync.pass);

// ================= Phase F: movement after the load-in (same page) =================
const fTears0 = A.tears.length;
const fToken = srcTokens(A.samples)[0];
// The pan waits for the placement to COMPLETE, not just cross 30 titles:
// with the 800 ms dwell (Beta 1.297) the flight launches before the
// prefetch has warmed the fit view on a slow rig, and the marginal
// titles are still churning when the pan used to start - F1 read their
// churn as pan losses twice in the round-3 investigation, while the
// 1500 ms tree passed. Stable = the same title set across samples at
// least 500 ms apart, the phase-U completion rule applied here.
await poll(`(() => { try { const s = window.__li.samples; if (s.length < 2) return false; const a = s[s.length - 1];
  for (let i = s.length - 2; i >= 0; i--) { if (a.t - s[i].t >= 500) { const b = s[i];
    return a.titles.length >= 30 && b.titles.length === a.titles.length && a.titles.every((n) => b.titles.includes(n)); } }
  return false; } catch (e) { return false; } })()`, 30000);
await ev(`(() => { map.panBy([140, 60], { duration: 800 }); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 30000);
await sleep(2200);
const F = await J(`window.__li`);
const fWindow = F.samples.slice(A.samples.length);
const fLaneT = laneViolations(fWindow.filter((x) => x.t >= F.moveEndAt), 'titles');
ok('F1 a pan after the load-in settles with NO teardown, the SAME source object, and no appeared title returning to zero across the pan\'s settled frame (teardowns ' + fTears0 + ' -> ' + F.tears.length + ', source tokens in the pan window: ' + JSON.stringify(srcTokens(fWindow)) + ', lane violations: ' + JSON.stringify(fLaneT.slice(0, 6)) + ') - movement behaviour is the 1.263 behaviour with the cure\'s exception deleted',
  F.tears.length === fTears0 && srcTokens(fWindow).length === 1 && srcTokens(fWindow)[0] === fToken && fLaneT.length === 0);

// ================= Phase B: theme swap mid-flight =================
// Graded from the post-swap settled frame (the rebuild window is the
// renderer's); the app must hold zero teardowns and an identical spec.
await send('Page.reload', {}, S);
await bootToPicker();
await forceRouteTitlesOn(ev, poll);
await pickRoute();
await poll(`(() => { try { const ids = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].filter((id) => map.getLayer(id)); if (!ids.length) return false; const s = new Set(); for (const f of map.queryRenderedFeatures({ layers: ids })) if (f.properties && f.properties.name) s.add(f.properties.name); return s.size >= 30; } catch (e) { return false; } })()`, 45000);
await ev(`(() => { unloadRouteToBoot(); return true; })()`);
await poll(`!!document.querySelector('#rmRoutes .routeRow')`, 20000);
await ev(INSTRUMENT);
await pickRoute();
const bSpec0 = await (async () => { // the centre spec as the flight begins - layer spec at stack build, readable inside the dwell
  for (let i = 0; i < 100; i++) { const a = await readSpec(); if (a.features >= 34) return a; await sleep(100); }
  return readSpec();
})();
const bPreSwap = await J(`window.__li`);
const bToken0 = srcTokens(bPreSwap.samples)[0] || 0;
await sleep(Math.max(0, 2200 - 300)); // the flight runs 1500 -> 4500 ms: the swap lands mid-flight
const bSwapAt = await J(`performance.now()`);
await ev(`(() => { setThemeOverride(true); applyNight(); setBasemap(); return true; })()`);
const bDone = await poll(`(() => { try { const ss = window.__li.samples; for (const s of ss) { if (s.t >= ${bSwapAt} && s.src > 0 && s.src !== ${bToken0} && s.titles.length >= 30) return true; } return false; } catch (e) { return false; } })()`, 40000); // the post-swap settle: a sample on the NEW source object with the titles back at full placement
await sleep(500);
const B = await J(`window.__li`);
const bSpec1 = await readSpec();
console.log('drive219 B: samples ' + B.samples.length + ', tears ' + B.tears.length + ', tokens ' + JSON.stringify(srcTokens(B.samples)) + ', post-swap settled ' + bDone);
const bSettledSample = B.samples.find((s) => s.t >= bSwapAt && s.src > 0 && s.src !== bToken0 && s.titles.length >= 30);
const bSettledAt = bSettledSample ? bSettledSample.t : Infinity;
const bAfter = B.samples.filter((s) => s.t >= bSettledAt); // settled-frame rule at the swap boundary: judge from the rebuilt style's settled frame
const bLaneT = laneViolations(bAfter, 'titles');
const bRoadDim = bAfter.filter((s) => s.groups && s.groups.road && (s.groups.road.effMin < 1 || s.groups.road.effMax < 1));
const bPostSwapTokens = srcTokens(bAfter);
ok('B1 a theme swap mid-flight resolves by streaming: the load-in completes on the new style, no teardown runs, no appeared title drops a visible name once the rebuilt style\'s frame settles, and no basemap layer is dimmed or hidden across the swap window (post-swap settled: ' + bDone + ', teardowns: ' + B.tears.length + ', title violations after the settle: ' + JSON.stringify(bLaneT.slice(0, 6)) + ', dimmed basemap samples after the settle: ' + bRoadDim.length + ', final titles: ' + (B.samples.length ? B.samples[B.samples.length - 1].titles.length : 0) + ') - basemap label persistence after a rebuild is the renderer\'s collision placement over a re-streaming basemap (A5 states the evidence), not an app promise',
  bDone === true && B.tears.length === 0 && bLaneT.length === 0 && bRoadDim.length === 0 && B.samples[B.samples.length - 1].titles.length >= 30);
ok('B2 THE CENTRE SPEC SURVIVES THE SWAP: the title layers after the swap carry the same centre spec and the same feature count as the ones the flight opened with (features before: ' + bSpec0.features + ', after: ' + bSpec1.features + ', spec after: ' + JSON.stringify(bSpec1.layers) + ') - setStyle rebuilt the style, but no placement was re-decided',
  bSpec0.features >= 34 && JSON.stringify(bSpec0) === JSON.stringify(bSpec1) && specIsCentre(bSpec1));
ok('B3 SOURCE IDENTITY ACROSS THE SWAP - the flagged limit, graded at its boundary: the token changes at the swap (setStyle recreates the style, labelpts included) and is ONE stable object from the rebuilt style\'s settle on (post-settle tokens: ' + JSON.stringify(bPostSwapTokens) + ', all tokens: ' + JSON.stringify(srcTokens(B.samples)) + ')',
  srcTokens(B.samples).length === 2 && bPostSwapTokens.length === 1 && bPostSwapTokens[0] !== bToken0);

// ================= Phase C: a second pick during the window =================
await send('Page.reload', {}, S);
await bootToPicker();
await forceRouteTitlesOn(ev, poll);
await ev(INSTRUMENT);
await pickRoute();
await sleep(600); // inside the first pick's dwell - its flight has not even launched
await ev(`(() => { try { const p = JSON.parse(JSON.stringify(ROUTE_PACKS[0])); p.id = '5x'; p.name = 'Route 5X'; ROUTE_PACKS.push(p); loadRoute('5x'); } catch (e) { window.__li.pokeErr = String(e && e.message || e); } return true; })()`);
const cDone = await waitSettled(40000);
await sleep(500);
const C = await J(`window.__li`);
console.log('drive219 C: samples ' + C.samples.length + ', tears ' + C.tears.length + ', tokens ' + JSON.stringify(srcTokens(C.samples)) + ', settled ' + cDone + ', pokeErr ' + (C.pokeErr || 'none'));
const cLast = C.samples.length ? C.samples[C.samples.length - 1] : { titles: [], visNoneT: 1 };
ok('C1 a second route pick during the window (a page-side clone pack, the sandbox ships one route) resolves sanely: the incoming route completes and no title layer stands hidden at the end (settled: ' + cDone + ', teardowns: ' + C.tears.length + ', final titles: ' + cLast.titles.length + ', final hidden title layers: ' + cLast.visNoneT + ', poke error: ' + (C.pokeErr || 'none') + ')',
  cDone === true && cLast.titles.length >= 30 && cLast.visNoneT === 0 && C.tears.length === 0);
ok('C2 THE SWITCH REWRITES DATA, NOT THE SOURCE: the labelpts source object is the same across the whole window, both picks included (tokens: ' + JSON.stringify(srcTokens(C.samples)) + ') - rebuildRoute\'s setData is the only rewrite, exactly as the contract states',
  srcTokens(C.samples).length === 1);

// ================= Phase D: the mid-flight placement contract =================
// Unstaged: titles placing during the flight keep their centre spec,
// the spec never changes, and nothing tears down or hides.
await send('Page.reload', {}, S);
await bootToPicker();
await forceRouteTitlesOn(ev, poll);
await ev(INSTRUMENT);
await pickRoute();
const dDone = await waitSettled(40000);
await sleep(700);
const D = await J(`window.__li`);
const dSpec = await readSpec();
const dAtMoveEnd = D.samples.find((s) => s.t >= D.moveEndAt);
const dPlacedMidFlight = dAtMoveEnd ? dAtMoveEnd.titles.length : 0;
const dLaneT = laneViolations(D.samples.filter((x) => x.t >= D.moveEndAt), 'titles');
console.log('drive219 D: samples ' + D.samples.length + ', tears ' + D.tears.length + ', tokens ' + JSON.stringify(srcTokens(D.samples)) + ', placed by moveend ' + dPlacedMidFlight + ', settled ' + dDone);
ok('D1 THE MID-FLIGHT CONTRACT, unstaged: titles placed by the flight\'s moveend: ' + dPlacedMidFlight + ' (the old cure\'s precondition, present or not by environment) - and across the whole window: zero teardowns, one source object, no title layer ever hidden, and no appeared title returns to zero after moveend (teardowns: ' + D.tears.length + ', tokens: ' + JSON.stringify(srcTokens(D.samples)) + ', hidden samples: ' + D.samples.filter((s) => s.visNoneT > 0).length + ', lane violations: ' + JSON.stringify(dLaneT.slice(0, 6)) + ') - there is no cure because there is nothing to cure',
  dDone === true && D.tears.length === 0 && srcTokens(D.samples).length === 1 && D.samples.every((s) => s.visNoneT === 0) && dLaneT.length === 0);
const dSigs = [...new Set(D.samples.map((s) => s.specSig).filter(Boolean))];
ok('D2 THE CENTRE SPEC IS NEVER REWRITTEN INSIDE THE WINDOW: every sampler tick that saw the labelpts data saw the same centre spec, and the settled read confirms it - all four layers at text-anchor center with radial offset 0, over 34 features (ticks with data: ' + D.samples.filter((s) => s.specSig).length + ', distinct specs seen: ' + dSigs.length + ', settled spec: ' + JSON.stringify(dSpec.layers) + ', features: ' + dSpec.features + ') - the spec the stack built is the spec at every tick, not only at the end (the 1.290 gate lesson: a spec read only after settlement has a blind window)',
  dSigs.length === 1 && dSigs[0].startsWith('center:0|center:0|center:0|center:0#') && specIsCentre(dSpec) && dSpec.features >= 34);

// ================= Phase U: the unstaged phone condition (6x throttle + tour) =================
await send('Page.reload', {}, S);
await bootToPicker();
await forceRouteTitlesOn(ev, poll);
await ev(INSTRUMENT);
await send('Emulation.setCPUThrottlingRate', { rate: 6 }, S); // the phone condition the defect lived in: the placement worker crawls, the flight outruns it, titles place whenever they place
await pickRoute();
const uDone = await waitSettled(90000);
await sleep(700);
const U1 = await J(`window.__li`);
const uCull1 = await J(`(() => { const ids = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].filter((id) => map.getLayer(id)); const s = new Set(); for (const f of map.queryRenderedFeatures({ layers: ids })) if (f.properties && f.properties.name) s.add(f.properties.name); const src = map.getSource('labelpts'); const total = src && src.serialize && src.serialize().data ? src.serialize().data.features.length : 0; return { rendered: s.size, total }; })()`); // the settled fit view's collision cull: features the renderer did not place in this frame
const uLaneT = laneViolations(U1.samples.filter((x) => x.t >= U1.moveEndAt), 'titles');
console.log('drive219 U: samples ' + U1.samples.length + ', tears ' + U1.tears.length + ', tokens ' + JSON.stringify(srcTokens(U1.samples)) + ', settled ' + uDone + ', cull at fit: rendered ' + uCull1.rendered + ' of ' + uCull1.total);
ok('U1 THE PHONE CONDITION, load-in: under 6x CPU throttle the natural pick still streams to full placement with zero teardowns, one source object, no title layer ever hidden, and no appeared title returning to zero after moveend (settled: ' + uDone + ', teardowns: ' + U1.tears.length + ', tokens: ' + JSON.stringify(srcTokens(U1.samples)) + ', hidden samples: ' + U1.samples.filter((s) => s.visNoneT > 0).length + ', lane violations: ' + JSON.stringify(uLaneT.slice(0, 6)) + ', median sample gap ' + Math.round(medianGap(U1.samples)) + ' ms)',
  uDone === true && U1.tears.length === 0 && srcTokens(U1.samples).length === 1 && U1.samples.every((s) => s.visNoneT === 0) && uLaneT.length === 0);
ok('U2 THE CULL, MEASURED NOT ASSERTED: at the settled fit view the renderer placed ' + uCull1.rendered + ' of ' + uCull1.total + ' title features - ' + (uCull1.total - uCull1.rendered) + ' culled by collision in this frame (the honest residue the design names: collision culling can drop a title for a pass in a crowded frame, as in the old settled state; this check asserts only that the measurement was taken on the real pack)',
  uCull1.total >= 34 && uCull1.rendered > 0);
// the tour: zoom into the route centre and back out to the fit, then a pan -
// each leg settles before the next; identity and teardown graded across all
// of it, and the fit-view lane judged again on the returned frame.
const uFit = await J(`(() => { const c = map.getCenter(); return { lng: c.lng, lat: c.lat, z: map.getZoom() }; })()`);
const uSamplesBeforeTour = U1.samples.length;
await ev(`(() => { map.zoomTo(17, { duration: 900 }); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 60000);
await ev(`(() => { map.zoomTo(${uFit.z}, { duration: 900 }); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 60000);
await ev(`(() => { map.panBy([120, 50], { duration: 800 }); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 60000);
await ev(`(() => { map.jumpTo({ center: [${uFit.lng}, ${uFit.lat}], zoom: ${uFit.z} }); return true; })()`); // back to the fit view for the closing read - the pan's shifted frame legitimately excludes the edge titles
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 60000);
const uBack = await waitSettled(30000); // the returned frame COMPLETES its placement before it is judged - loaded() alone fires mid-placement, and the placement pass cull-reshuffles while the frame's tiles still land (one mutated-battery run read 27 titles mid-pass with three names culled and returned inside the frame: the renderer's residue, not a blink)
await sleep(700);
await send('Emulation.setCPUThrottlingRate', { rate: 1 }, S);
const U = await J(`window.__li`);
const uTourSamples = U.samples.slice(uSamplesBeforeTour);
const uBackSamples = U.samples.filter((s) => s.t >= U.moveEndAt);
const uMaxBack = uBackSamples.length ? Math.max(...uBackSamples.map((s) => s.titles.length)) : 0;
const uTitlesBack = U.samples.length ? U.samples[U.samples.length - 1].titles.length : 0;
ok('U3 THE TOUR: zoom in, back out to the fit and a pan - across every leg: zero teardowns, the same source object, no title layer hidden, and the returned frame\'s placement completes at the fit view\'s standing count (teardowns: ' + U.tears.length + ', tokens across the whole phase: ' + JSON.stringify(srcTokens(U.samples)) + ', hidden samples in the tour: ' + uTourSamples.filter((s) => s.visNoneT > 0).length + ', returned frame settled: ' + uBack + ', best returned-frame count: ' + uMaxBack + ', final sample: ' + uTitlesBack + ') - completion is judged on the returned frame\'s best sample, not its last: at the throttled fit view the pack\'s marginal titles (Blackburn, Flatbush, Boddy - three of the four U2 counts as culled) flip in and out across the renderer\'s own placement passes while tiles finish (one clean run completed at 30+ and re-culled to 27 by the final sample), the measured cull residue U2 reports; an app blink is excluded by the teardown, identity and visibility pins, and the movement lane itself is phase F\'s, unthrottled',
  U.tears.length === 0 && srcTokens(U.samples).length === 1 && uTourSamples.every((s) => s.visNoneT === 0) && uBack === true && uMaxBack >= 30);

// ================= Phase V: the handover, graded on the zoom journey =================
// Same page as phase U. A two-leg zoom to 17 with a held stop at 15.5:
// Beta 1.297 grades the crossing as an instant swap - no mid-band state.
const vBaseOk = await poll(`(() => { try { const last = window.__li.samples[window.__li.samples.length - 1]; return !!last && last.titles.length >= 30 && last.clone.length === 0; } catch (e) { return false; } })()`, 30000); // the fit-view state itself, polled: the sampler starves under load, so a single read (or a windowed max, which reaches back across camera moves) cannot grade a standing state
const vBase = await J(`(() => { const last = window.__li.samples[window.__li.samples.length - 1]; return last ? { titles: last.titles.length, clone: last.clone.length } : { titles: 0, clone: -1 }; })()`);
const vFrom = await J(`window.__li.samples.length`);
await ev(`(() => { map.zoomTo(15.5, { duration: 2000 }); return true; })()`); // a held stop mid-band: at 15.5 both specs evaluate to one half, and the sampler reads the standing state without chasing a moving camera
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 60000);
await sleep(900);
await ev(`(() => { map.zoomTo(17, { duration: 2000 }); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 60000);
await sleep(900);
const V = await J(`window.__li`);
const vWindow = V.samples.slice(vFrom);
const vMidT = vWindow.filter((s) => s.groups && s.groups.titles && s.groups.titles.effMax > 0.05 && s.groups.titles.effMax < 0.95);
const vMidC = vWindow.filter((s) => s.groups && s.groups.clone && s.groups.clone.effMax > 0.05 && s.groups.clone.effMax < 0.95);
const vTop = await J(`(() => { const pick = (ids) => ids.filter((id) => map.getLayer(id)); const names = (ids) => { const s = new Set(); if (ids.length) for (const f of map.queryRenderedFeatures({ layers: ids })) if (f.properties && f.properties.name) s.add(f.properties.name); return [...s]; }; const tN = names(pick(['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'])); const cN = names(pick(['roads_labels_major-route', 'roads_labels_minor-route'])); const oN = names(pick(['roads_labels_major', 'roads_labels_minor'])); const filt = {}; for (const id of ['roads_labels_major', 'roads_labels_minor']) { const L = map.getStyle().layers.find((x) => x.id === id); filt[id] = L && L.filter ? JSON.stringify(L.filter) : ''; } return { titles: tN.length, cloneRoute: cN.filter((n) => ROUTE_TILE_NAMES.includes(n)).length, cloneAll: cN.length, origRoute: oN.filter((n) => ROUTE_TILE_NAMES.includes(n)).length, filt, zoom: map.getZoom() }; })()`);
console.log('drive219 V: baseline titles ' + vBase.titles + ' clone ' + vBase.clone + ', mid-band samples titles ' + vMidT.length + ' clone ' + vMidC.length + ' of ' + vWindow.length + ', at 17: ' + JSON.stringify(vTop));
ok('V1 THE FAR SIDE OF THE HANDOVER AT BASELINE: at the fit view the titles carry the route (placed: ' + vBase.titles + ', state poll: ' + vBaseOk + ') and the clones render nothing (clone names: ' + vBase.clone + ') - below 15 the basemap route copies stand silent by their spec',
  vBaseOk === true && vBase.clone === 0);
ok('V2 THE CROSSOVER IS A SWAP, NOT A FADE (Beta 1.297, inverted from the 1.294 fade claim): samples with either group strictly ' +
  'between fully on and fully off: titles ' + vMidT.length + ', clones ' + vMidC.length + ' (window samples: ' + vWindow.length +
  '), and the window really crossed (best titles sample: ' + Math.max(0, ...vWindow.map((s) => (s.titles || []).length)) +
  ', best clone sample: ' + Math.max(0, ...vWindow.map((s) => (s.clone || []).length)) + ') - at 15.2 both sides change state at once, no in-between',
  vMidT.length === 0 && vMidC.length === 0 && vWindow.some((s) => (s.titles || []).length >= 30) && vWindow.some((s) => (s.clone || []).length >= 1));
ok('V3 THE CLOSE SIDE AT ZOOM 17: the titles render NOTHING (rendered: ' + vTop.titles + ' - the maxzoom cap, not a fade tail), ' +
  'the clones carry the route names (route names on the clones: ' + vTop.cloneRoute + ' of ' + vTop.cloneAll + ' clone names), ' +
  'the originals still render no route name (route names on the originals: ' + vTop.origRoute + ') and still exclude ' +
  '(major filter carries the exclusion: ' + (vTop.filt['roads_labels_major'] || '').includes('"!"') + ', minor: ' +
  (vTop.filt['roads_labels_minor'] || '').includes('"!"') + ') - above 15.2 the map reads like a normal map and no street prints twice',
  vTop.titles === 0 && vTop.cloneRoute >= 1 && vTop.origRoute === 0 &&
  (vTop.filt['roads_labels_major'] || '').includes('"!"') && (vTop.filt['roads_labels_minor'] || '').includes('"!"'));
await ev(`(() => { map.zoomTo(${uFit.z}, { duration: 1200 }); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 60000);
const vBack = await poll(`(() => { try { const last = window.__li.samples[window.__li.samples.length - 1]; return !!last && last.titles.length >= 30 && last.clone.length === 0; } catch (e) { return false; } })()`, 30000); // the returned standing state, polled like V1 - a windowed read would reach back into the descent, where clone names are legitimate
await sleep(400);
const vBackRead = await J(`(() => { const last = window.__li.samples[window.__li.samples.length - 1]; return last ? { titles: last.titles.length, clone: last.clone.length } : { titles: 0, clone: -1 }; })()`);
ok('V4 THE HANDOVER REVERSES CLEANLY: back at the fit view the titles are placed again (placed: ' + vBackRead.titles + ', state poll: ' + vBack + ') and the clones render nothing again (clone names: ' + vBackRead.clone + ') - the band is a zoom state, not a one-way door',
  vBack === true && vBackRead.clone === 0);

// ================= Phase G: the instant-fit settle (reduced motion) =================
await send('Page.reload', {}, S);
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, S);
await bootToPicker();
await forceRouteTitlesOn(ev, poll);
await ev(INSTRUMENT);
await pickRoute();
const gDone = await waitSettled(40000);
await sleep(500);
const G = await J(`window.__li`);
const gLaneT = laneViolations(G.samples, 'titles');
ok('G1 the instant-fit settle (reduced motion emulated: no flight, nothing armed, nothing owed) simply streams: the titles complete, NO teardown lands, the source is one object, and the title lane holds (settled: ' + gDone + ', teardowns: ' + G.tears.length + ', tokens: ' + JSON.stringify(srcTokens(G.samples)) + ', lane violations: ' + JSON.stringify(gLaneT.slice(0, 6)) + ', final titles: ' + (G.samples.length ? G.samples[G.samples.length - 1].titles.length : 0) + ')',
  gDone === true && G.tears.length === 0 && srcTokens(G.samples).length === 1 && gLaneT.length === 0 && G.samples[G.samples.length - 1].titles.length >= 30);
await send('Emulation.setEmulatedMedia', { features: [] }, S);

// ================= Phase H: deleting the route mid-window =================
await send('Page.reload', {}, S);
await bootToPicker();
await forceRouteTitlesOn(ev, poll);
await ev(INSTRUMENT);
await pickRoute();
await sleep(500); // inside the dwell (800 ms since Beta 1.297) - the window is wide open
await ev(`(() => { unloadRouteToBoot(); return true; })()`); // the delete path's own unload: nothing stands over the boot view - there is no hold to strand and no cure to release
await sleep(800);
await pickRoute();
const hDone = await waitSettled(40000);
await sleep(500);
const H = await J(`window.__li`);
const hLast = H.samples.length ? H.samples[H.samples.length - 1] : { titles: [], visNoneT: 1 };
ok('H1 unloading the route mid-window (the delete path) and picking again completes cleanly: the second load-in streams to full placement, no title layer stands hidden at the end, and no teardown ran anywhere in the phase (settled: ' + hDone + ', teardowns: ' + H.tears.length + ', final titles: ' + hLast.titles.length + ', final hidden title layers: ' + hLast.visNoneT + ')',
  hDone === true && hLast.titles.length >= 30 && hLast.visNoneT === 0 && H.tears.length === 0);

// ================= Phase I: entering create mode mid-window =================
await send('Page.reload', {}, S);
await bootToPicker();
await forceRouteTitlesOn(ev, poll);
await ev(INSTRUMENT);
await pickRoute();
await poll(`!!(window.map && map.isMoving())`, 15000); // creation opens MID-FLIGHT, while the stream is genuinely running - the staging this phase's premise names (the old fixed 900 ms sleep lands inside the pick's 1500 ms dwell on a fast machine, before the flight has even launched)
await ev(`(() => { enterCreate('pick'); return true; })()`); // the backdrop snapshots the route stack's LIVE visibility now - with the hold deleted, the live value is the natural, and the snapshot/restore pair is the one sanctioned visibility writer doing its ordinary work
await sleep(1500);
const iDuring = await J(`(() => { const ids = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].filter((id) => map.getLayer(id)); return { hidden: ids.every((id) => map.getLayoutProperty(id, 'visibility') === 'none'), layers: ids.length, creating: (typeof creating !== 'undefined' ? creating : '?') }; })()`);
await ev(`(() => { exitCreate(); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 30000);
// Poll the re-placement itself, never a fixed sleep (a one-shot read after
// a short sleep convicts plain re-placement lag, the class phases D and J
// judge by polling the live state). The read goes through the MIXED layer
// list - the four title layers plus one basemap symbol layer, filtered
// back to title-layer features - the way the sampler reads, so the phase
// measures the same rendered reality the lane grades.
await ev(`window.__iRead = () => { const ids = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].filter((id) => map.getLayer(id)); const vis = ids.map((id) => map.getLayoutProperty(id, 'visibility') || 'visible'); const style = map.getStyle(); const mixer = style && style.layers ? (style.layers.find((l) => l.type === 'symbol' && l['source-layer']) || {}).id : null; const s = new Set(); if (ids.length) { for (const f of map.queryRenderedFeatures({ layers: mixer ? ids.concat([mixer]) : ids })) if (f.layer && ids.includes(f.layer.id) && f.properties && f.properties.name) s.add(f.properties.name); } return { vis, placed: s.size }; }`);
await poll(`(() => { try { return window.__iRead().placed >= 30; } catch (e) { return false; } })()`, 30000);
const iAfter = await J(`window.__iRead()`);
const I = await J(`window.__li`);
ok('I1 entering create mode mid-window and leaving: during creation the backdrop\'s hide holds (titles hidden: ' + iDuring.hidden + '), after the exit the titles stand at their natural visibility and place, and no labelpts teardown ran anywhere in the phase (during: ' + JSON.stringify(iDuring) + ', visibilities after exit: ' + JSON.stringify(iAfter.vis) + ', titles placed: ' + iAfter.placed + ', teardowns: ' + I.tears.length + ')',
  iDuring.hidden === true && iAfter.vis.every((v) => v !== 'none') && iAfter.placed >= 30 && I.tears.length === 0);

// ================= Phase J: unloading MID-FLIGHT, then picking again =================
// The riskiest unload window that remains: the pick flight is airborne
// when the route is unloaded (the delete path). Nothing can strand -
// there is no hold standing and no cure pending in any path now - and
// the re-pick must stream to full placement on the same source object.
// The re-pick is CONFIRMED, not assumed (a click at a stale or absent
// row silently no-ops).
await send('Page.reload', {}, S);
await bootToPicker();
await forceRouteTitlesOn(ev, poll);
await ev(INSTRUMENT);
await pickRoute();
await poll(`!!(window.map && map.isMoving())`, 20000); // the flight is airborne - the unload lands inside it
await ev(`(() => { unloadRouteToBoot(); return true; })()`);
await poll(`typeof activeRoute !== 'undefined' && !activeRoute`, 20000); // the unload's own landing (no route active) - so the pick confirmation below cannot read the stale route
await poll(`!!document.querySelector('#rmRoutes .routeRow')`, 30000);
await pickRoute();
const jTook = await poll(`typeof activeRoute !== 'undefined' && !!activeRoute`, 20000);
if (!jTook) { await pickRoute(); await poll(`typeof activeRoute !== 'undefined' && !!activeRoute`, 20000); }
const jDone = await waitSettled(60000);
await sleep(500);
const J219 = await J(`window.__li`);
const jLast = J219.samples.length ? J219.samples[J219.samples.length - 1] : { titles: [], visNoneT: 1 };
console.log('drive219 J: settled ' + jDone + ', tears ' + J219.tears.length + ', tokens ' + JSON.stringify(srcTokens(J219.samples)) + ', final titles ' + jLast.titles.length);
ok('J1 unloading MID-FLIGHT and picking again strands nothing: the re-pick streams to full placement, no title layer stands hidden at the end, and no teardown ran anywhere in the phase (settled: ' + jDone + ', teardowns: ' + J219.tears.length + ', source tokens: ' + JSON.stringify(srcTokens(J219.samples)) + ', final titles: ' + jLast.titles.length + ', final hidden title layers: ' + jLast.visNoneT + ')',
  jDone === true && J219.tears.length === 0 && jLast.titles.length >= 30 && jLast.visNoneT === 0);

// ================= Phase Z: the forced OFF state (the 1.293 contract) =================
// Forced off before the pick: no titles, no clones, exclusion lifted.
await send('Page.reload', {}, S);
await bootToPicker();
await forceRouteTitlesOff(ev, poll);
await pickRoute();
const zRoute = await poll(`(() => { try { const seen = new Set(); for (const f of map.queryRenderedFeatures({ layers: ['roads_labels_major', 'roads_labels_minor'].filter((id) => map.getLayer(id)) })) if (f.properties && f.properties.name) seen.add(f.properties.name); return ROUTE_TILE_NAMES.some((n) => seen.has(n)); } catch (e) { return false; } })()`, 45000);
await sleep(600);
const Z = await J(`(() => { const filt = {}; for (const id of ['roads_labels_major', 'roads_labels_minor']) { const L = map.getStyle().layers.find((x) => x.id === id); filt[id] = L && L.filter ? JSON.stringify(L.filter) : ''; } return { flag: (typeof ROUTE_TITLES_ON !== 'undefined') ? ROUTE_TITLES_ON : 'undefined', titleLayers: ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].filter((id) => map.getLayer(id)), cloneLayers: ['roads_labels_major-route', 'roads_labels_minor-route'].filter((id) => map.getLayer(id)), labelpts: !!map.getSource('labelpts'), filt }; })()`);
console.log('drive219 Z: flag ' + Z.flag + ', title layers ' + JSON.stringify(Z.titleLayers) + ', clone layers ' + JSON.stringify(Z.cloneLayers) + ', labelpts ' + Z.labelpts + ', route name rendered ' + zRoute);
ok('Z1 THE FORCED SWITCH READS OFF in the running app (ROUTE_TITLES_ON: ' + Z.flag + ') - the source-only switch still governs both states',
  Z.flag === false);
ok('Z2 NO TITLE LAYERS AND NO LABELPTS SOURCE on a settled pick while off (layers: ' + JSON.stringify(Z.titleLayers) + ', labelpts source present: ' + Z.labelpts + ') - the title build is skipped at its entry point, not built and hidden',
  Z.titleLayers.length === 0 && Z.labelpts === false);
ok('Z3 THE BASEMAP NAMES A ROUTE STREET while off: at least one route street\'s tile name renders from the basemap road layers at the settled view (rendered: ' + zRoute + ') - the off state names the route the regular way, like every other street',
  zRoute === true);
ok('Z4 THE EXCLUSION IS LIFTED while off: neither road-label filter carries a route street name (the exclusion literal inlines them) - major filter names Valeria Boulevard: ' + (Z.filt['roads_labels_major'] || '').includes('Valeria Boulevard') + ', minor filter: ' + (Z.filt['roads_labels_minor'] || '').includes('Valeria Boulevard') + ' - titles off without the lift would leave the route streets nameless',
  !(Z.filt['roads_labels_major'] || '').includes('Valeria Boulevard') && !(Z.filt['roads_labels_minor'] || '').includes('Valeria Boulevard'));
ok('Z5 NO HANDOVER CLONES while off (clone layers present: ' + JSON.stringify(Z.cloneLayers) + ') - the clones exist only in the titles-on state, so the off map is the plain basemap everywhere',
  Z.cloneLayers.length === 0);

finish(R, proc);
