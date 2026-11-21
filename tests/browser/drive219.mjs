import { launchDrive, finish, pinDayTheme } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true }, S); // this lane grades presence and paint, not pixels: at the harness's retina factor the software-rendered headless map eats the main thread and the 50 ms sampler starves to a few ticks a second (measured), which would stretch the very timings under grade. At factor 1 the sampler holds its 50 ms median (measured).

// drive219: Beta 1.266 - THE BOOT-PHASE PRESENCE LANE, the standing watch
// over the load-in window drive216 never graded (it starts once the boot
// placement is stable; the blink lived BEFORE that, inside the pick).
// Andrew's report of 2026-11-21 on Beta 1.263: movement flicker gone, but
// on route load the route names showed during the fly-in, then blinked
// once as the fly-in ended and the surrounding map names finished
// loading. The diagnosis (cold-start-flicker-2026-11-21/RECORD.md) proved
// the mechanism: the one-flight hook's re-place tears the labelpts source
// down at the flight's idle, and all 33 titles vanish for the worker's
// re-parse (~1-2 s; ~4.9 s under 6x CPU throttle) in the same moment the
// basemap names complete their fade-in. The fix (Andrew's approved
// design): on the pick, ALL names - basemap text layers and the route
// titles - are held invisible (a multiplier over each layer's own
// text-opacity), the re-place runs inside the hold, and at the settled
// idle every name fades in together over one 350 ms ramp, with backstop
// reveals (6 s after the re-place; an absolute 15 s from the pick) so
// names never wait forever.
// This drive samples title + basemap presence every 50 ms from BEFORE
// the pick, through the flight, the settle and the reveal, and grades:
//   A  the main load-in: the hold engages; the one re-place runs exactly
//      once and its teardown lands at multiplier 0; NO name, once visibly
//      appeared (placed while the multiplier is past 0.5), ever returns
//      to zero inside the window (the blink is exactly that transition);
//      titles and basemap names cross visible inside the one fade
//      window; every layer's natural paint is restored verbatim after.
//   F  movement after the load-in is the 1.263 behaviour: a pan settles
//      with no further teardown and no further re-place.
//   B  a theme swap mid-load-in resolves through the same cycle.
//   C  a second route pick during a load-in resolves to exactly one
//      reveal, nothing stuck invisible.
//   D  the post-re-place backstop: with idle suppressed by a moving
//      camera after the re-place, the reveal still lands, off the 6 s
//      timer (no idle may fire in between - the drive counts them).
//   E  the absolute backstop: a hold engaged with no settle ever noted
//      still reveals, at ~15 s.
// On the 1.265 tree there is no hold at all: the teardown lands at
// multiplier 1 (visible) and the lane records the titles' blink - A
// fails. The lane rule is visibility-relative on purpose: while the
// multiplier is at or under 0.5 a name is invisible whether placed or
// not, so placement churn inside the hold is not a flicker.
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
  if (!await poll(`!!(window.map && map.getStyle && map.getStyle().layers && map.getStyle().layers.length > 10)`, 45000)) throw new Error('drive219: the basemap style never landed - the sampler would measure an empty map and pass vacuously');
};

const INSTRUMENT = `(() => {
  window.__li = { samples: [], tears: [], replaces: 0, replaceAt: 0, idles: [], naturals: null };
  map.on('idle', () => { try { window.__li.idles.push(performance.now()); } catch (e) {} });
  const origRS = map.removeSource.bind(map);
  map.removeSource = (id) => { if (id === 'labelpts') { try { window.__li.tears.push({ t: performance.now(), mult: (typeof nameFade !== 'undefined' ? nameFade.mult : null) }); } catch (e) {} } return origRS(id); };
  if (window.GLP && window.GLP.rePlaceTitles) { const o = window.GLP.rePlaceTitles.bind(window.GLP); window.GLP.rePlaceTitles = () => { window.__li.replaces++; window.__li.replaceAt = performance.now(); return o(); }; }
  const applied = (id) => { try { const v = map.getPaintProperty(id, 'text-opacity'); if (v === undefined) return 1; if (typeof v === 'number') return v; if (Array.isArray(v) && v[0] === '*') return v[2]; return -1; } catch (e) { return -1; } };
  // EFFECTIVE opacity: what a layer's live text-opacity spec actually
  // evaluates to at the current zoom (undefined = 1, a number = itself, a
  // zoom interpolate/step evaluated over its stops). The lane grades THIS,
  // never the app's own multiplier bookkeeping: this drive's first runs
  // trusted the multiplier and missed a real escape - the app's first hold
  // wrapped each expression-shaped paint in a ['*', natural, mult] value
  // that this MapLibre's paint validator silently refuses, so the titles
  // sat at natural paint while the bookkeeping said 0 (fixed by
  // transforming the paint instead - scaleNameStops in app2). A group's
  // effective opacity is the MINIMUM over its layers: the group is only
  // as visible as its least visible member is not - the conservative read.
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
  const groupEff = (ids) => { if (!ids.length) return null; const z = map.getZoom(); let m = Infinity; for (const id of ids) { try { m = Math.min(m, effOf(map.getPaintProperty(id, 'text-opacity'), z)); } catch (e) {} } return m === Infinity ? null : m; };
  // The layer sets are enumerated on styledata (a stack build, a theme
  // swap) and cached between ticks - a getStyle() clone per tick, this
  // drive's first shape, starved the sampler to ~2 ticks a second and
  // stretched the very timings it was measuring. One rendered-features
  // query per tick, bucketed by layer.
  window.__liLayers = null;
  const enumerate = () => {
    try {
      const layers = map.getStyle().layers;
      const base = layers.filter(L => L.type === 'symbol' && L.layout && L.layout['text-field'] && L['source-layer']).map(L => L.id);
      window.__liLayers = {
        base,
        road: base.filter(id => /road|street|motorway|path|ferry/i.test(id)),
        place: base.filter(id => !/road|street|motorway|path|ferry/i.test(id)),
        titles: ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].filter(id => map.getLayer(id))
      };
    } catch (e) {}
  };
  enumerate();
  map.on('styledata', enumerate);
  window.__liTimer = setInterval(() => {
    try {
      if (typeof nameFade !== 'undefined' && nameFade.held) { // the app's own capture registry, unioned across the whole hold: layers the stack build adds after the engage register when the label pass lands, so a one-shot snapshot would miss them
        window.__li.naturals = window.__li.naturals || {};
        for (const [k, v] of Object.entries(nameFade.orig)) if (!(k in window.__li.naturals)) window.__li.naturals[k] = v === undefined ? '__undef' : v;
      }
      if (typeof nameFade !== 'undefined') window.__li.unheld = { ...nameFade.unheld };
      const L = window.__liLayers || { base: [], road: [], place: [], titles: [] };
      const buckets = { titles: new Set(), road: new Set(), place: new Set() };
      let nRoad = 0;
      const roadSet = new Set(L.road), placeSet = new Set(L.place), titleSet = new Set(L.titles);
      for (const f of map.queryRenderedFeatures({ layers: [...L.titles, ...L.base] })) {
        const nm = f.properties && f.properties.name; if (!nm) continue;
        const lid = f.layer && f.layer.id;
        if (titleSet.has(lid)) buckets.titles.add(nm);
        else if (roadSet.has(lid)) { buckets.road.add(nm); nRoad++; }
        else if (placeSet.has(lid)) buckets.place.add(nm);
      }
      window.__li.samples.push({ t: performance.now(),
        mult: (typeof nameFade !== 'undefined' ? nameFade.mult : 1), held: (typeof nameFade !== 'undefined' ? nameFade.held : false),
        titles: [...buckets.titles], road: [...buckets.road], place: [...buckets.place], nRoad,
        effT: groupEff(L.titles), effR: groupEff(L.road), effP: groupEff(L.place),
        mTitles: L.titles.length ? applied(L.titles[0]) : null, mRoad: L.road.length ? applied(L.road[0]) : null, mPlace: L.place.length ? applied(L.place[0]) : null });
    } catch (e) {}
  }, 50);
  return true;
})()`;

const laneViolations = (samples, group, multOf) => {
  // a name violates the lane if, after its first VISIBLE appearance
  // (placed in a sample whose multiplier is past 0.5), it is absent from
  // any later sample in the window
  const seen = new Map();
  const bad = new Set();
  for (const s of samples) {
    const names = s[group] || [];
    const vis = multOf(s) > 0.5;
    for (const n of names) if (vis && !seen.has(n)) seen.set(n, true);
    if (vis) for (const n of seen.keys()) if (!names.includes(n)) bad.add(n);
  }
  return [...bad];
};
const maxGap = (samples) => { let g = 0; for (let i = 1; i < samples.length; i++) g = Math.max(g, samples[i].t - samples[i - 1].t); return g; };
const medianGap = (samples) => { const g = []; for (let i = 1; i < samples.length; i++) g.push(samples[i].t - samples[i - 1].t); g.sort((a, b) => a - b); return g.length ? g[Math.floor(g.length / 2)] : 0; };
const heldWindowGap = (samples) => { const h = samples.findIndex((x) => x.held); if (h < 0) return -1; let g = 0; for (let i = h + 1; i < samples.length; i++) g = Math.max(g, samples[i].t - samples[i - 1].t); return g; };
const waitCycle = async (ms) => poll(`(() => { try { const last = window.__li.samples[window.__li.samples.length - 1]; return !!last && last.titles.length >= 30 && (typeof nameFade === 'undefined' || (nameFade.mult === 1 && !nameFade.held)); } catch (e) { return false; } })()`, ms);

// ================= Phase A: the main load-in =================
await bootToPicker();
await ev(INSTRUMENT);
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
const aDone = await waitCycle(40000);
await sleep(700); // let the post-reveal samples land (the restore check reads live paint)
const A = await J(`window.__li`);
console.log('drive219 A: samples ' + A.samples.length + ', tears ' + JSON.stringify(A.tears) + ', replaces ' + A.replaces + ', cycle ' + aDone);
const effVis = (key) => (s) => (s[key] === null || s[key] === undefined ? 1 : s[key]);
const aLaneT = laneViolations(A.samples, 'titles', effVis('effT'));
const aLaneR = laneViolations(A.samples, 'road', effVis('effR'));
ok('A1 the load-in completes: names reach visible at the end (cycle poll: ' + aDone + ', final titles placed: ' + (A.samples.length ? A.samples[A.samples.length - 1].titles.length : 0) + ', samples: ' + A.samples.length + ')',
  aDone === true && A.samples.length > 15);
const aHeldSamples = A.samples.filter((s) => s.held);
const aEffHeld = aHeldSamples.every((s) => (s.effT === null || s.effT <= 0.05) && (s.effR === null || s.effR <= 0.05) && (s.effP === null || s.effP <= 0.05));
ok('A2 the hold is REAL on the rendered surface, not just in the app\'s bookkeeping: it engaged (held samples at multiplier 0: ' + aHeldSamples.filter((s) => s.mult === 0).length + '), and in EVERY held sample the effective opacity of all three name groups - each layer\'s live spec evaluated at the current zoom - stands at 0 (the first shape of this fix wrapped the titles\' paint in a value the map\'s validator silently refuses, and the titles sat visible under a bookkeeping 0; this check is that escape\'s regression pin), and no layer is recorded unheld (unheld: ' + JSON.stringify(A.unheld || {}) + ')',
  aHeldSamples.some((s) => s.mult === 0) && aEffHeld && Object.keys(A.unheld || {}).length === 0);
ok('A3 the one re-place ran exactly once, and its labelpts teardown landed INSIDE the hold (replaces: ' + A.replaces + ', teardowns: ' + A.tears.length + ', teardown multipliers: ' + JSON.stringify(A.tears.map((t) => t.mult)) + ')',
  A.replaces === 1 && A.tears.length === 1 && A.tears[0].mult === 0);
ok('A4 THE LANE, titles: no title, once visibly appeared, ever returns to zero inside the load-in window (violations: ' + JSON.stringify(aLaneT) + '; sampling: ' + A.samples.length + ' samples, median gap ' + Math.round(medianGap(A.samples)) + ' ms, worst gap inside the held window ' + Math.round(heldWindowGap(A.samples)) + ' ms - the blink this lane exists to catch lasts ~1-2 s, ~4.9 s throttled, and the lane\'s visibility test reads each group\'s effective opacity, so a name counts only when it would actually render)',
  aLaneT.length === 0);
ok('A5 THE LANE, basemap road names: no visible road name ever returns to zero inside the window (violations: ' + JSON.stringify(aLaneR.slice(0, 6)) + ')',
  aLaneR.length === 0);
const bracket = (samples, key) => { // the crossing bracket: [last sample not yet visible, first sample visible] on effective opacity, from the hold's start - honest under this sandbox's sparse sampling, where a point estimate of a 350 ms ramp is not measurable, and still convicting for the old shape (titles visible seconds before the basemap names: disjoint brackets)
  const h = samples.findIndex((x) => x.held); const from = h > -1 ? h : 0;
  let lo = -1, hi = -1;
  for (let i = from; i < samples.length; i++) { const v = samples[i][key]; if (v === null || v === undefined) continue; if (v <= 0.5) lo = samples[i].t; else { hi = samples[i].t; break; } }
  return [lo, hi];
};
const bT = bracket(A.samples, 'effT'), bR = bracket(A.samples, 'effR'), bP = bracket(A.samples, 'effP');
const bracketsOverlap = bT[1] > 0 && bR[1] > 0 && bP[1] > 0 && Math.max(bT[0], bR[0], bP[0]) <= Math.min(bT[1], bR[1], bP[1]);
ok('A6 the names fade in TOGETHER: the visible-crossing brackets of titles, road names and place names (last invisible sample -> first visible sample, on effective opacity) all share a common moment - one fade, not a sequence (brackets, ms from the first sample: titles [' + Math.round(bT[0] - A.samples[0].t) + ', ' + Math.round(bT[1] - A.samples[0].t) + '], road [' + Math.round(bR[0] - A.samples[0].t) + ', ' + Math.round(bR[1] - A.samples[0].t) + '], place [' + Math.round(bP[0] - A.samples[0].t) + ', ' + Math.round(bP[1] - A.samples[0].t) + '])',
  bracketsOverlap);
const restored = await J(`(() => {
  const nat = window.__li.naturals || {};
  const out = {};
  const one = (id) => { try { const live = map.getPaintProperty(id, 'text-opacity'); return JSON.stringify(live === undefined ? '__undef' : live) === JSON.stringify(nat[id]); } catch (e) { return 'ERR:' + String(e && e.message || e); } };
  out['streetnamespt1'] = one('streetnamespt1');
  const baseId = Object.keys(nat).find((k) => !k.startsWith('streetnamespt'));
  if (baseId) out[baseId] = one(baseId);
  return out;
})()`);
ok('A7 after the fade, every touched layer carries its natural paint again verbatim - the style outside a load-in is the pre-1.266 one (restored: ' + JSON.stringify(restored) + ', naturals captured: ' + Object.keys(A.naturals || {}).length + ' layers)',
  Object.keys(restored).length >= 2 && Object.values(restored).every((v) => v === true));

// ================= Phase F: movement after the load-in (same page) =================
const fTears0 = A.tears.length, fRep0 = A.replaces;
await ev(`(() => { map.panBy([140, 60], { duration: 800 }); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 30000);
await sleep(2200);
const F = await J(`({ tears: window.__li.tears.length, replaces: window.__li.replaces })`);
ok('F1 a pan after the load-in settles with NO further teardown and NO further re-place - movement behaviour is the 1.263 behaviour exactly (teardowns ' + fTears0 + ' -> ' + F.tears + ', re-places ' + fRep0 + ' -> ' + F.replaces + ')',
  F.tears === fTears0 && F.replaces === fRep0);

// ================= Phase B: theme swap mid-load-in =================
await send('Page.reload', {}, S);
await bootToPicker();
await ev(INSTRUMENT);
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
await sleep(2200); // the flight runs 1500 -> 4500 ms: this lands mid-flight
await ev(`(() => { setThemeOverride(true); applyNight(); setBasemap(); return true; })()`);
const bDone = await waitCycle(40000);
await sleep(500);
const B = await J(`window.__li`);
console.log('drive219 B: samples ' + B.samples.length + ', tears ' + JSON.stringify(B.tears) + ', replaces ' + B.replaces + ', cycle ' + bDone + ', final mult ' + (B.samples.length ? B.samples[B.samples.length - 1].mult : -1) + ', final titles ' + (B.samples.length ? B.samples[B.samples.length - 1].titles.length : 0));
const bLaneT = laneViolations(B.samples, 'titles', effVis('effT'));
ok('B1 a theme swap mid-load-in resolves through the same cycle: the load-in completes, the one re-place still ran once, every teardown landed inside the hold, and the title lane holds (cycle: ' + bDone + ', replaces: ' + B.replaces + ', teardowns: ' + JSON.stringify(B.tears.map((t) => t.mult)) + ', lane violations: ' + JSON.stringify(bLaneT.slice(0, 6)) + ')',
  bDone === true && B.replaces === 1 && B.tears.every((t) => t.mult === 0) && bLaneT.length === 0);

// ================= Phase C: a second pick during the load-in =================
await send('Page.reload', {}, S);
await bootToPicker();
await ev(INSTRUMENT);
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
await sleep(600); // inside the first pick's dwell - its flight has not even launched
await ev(`(() => { try { const p = JSON.parse(JSON.stringify(ROUTE_PACKS[0])); p.id = '5x'; p.name = 'Route 5X'; ROUTE_PACKS.push(p); loadRoute('5x'); } catch (e) { window.__li.pokeErr = String(e && e.message || e); } return true; })()`);
const cDone = await waitCycle(40000);
await sleep(500);
const C = await J(`window.__li`);
console.log('drive219 C: samples ' + C.samples.length + ', tears ' + JSON.stringify(C.tears) + ', replaces ' + C.replaces + ', cycle ' + cDone + ', pokeErr ' + (C.pokeErr || 'none'));
let upCrossings = 0;
for (let i = 1; i < C.samples.length; i++) if (C.samples[i - 1].mult <= 0.5 && C.samples[i].mult > 0.5) upCrossings++;
ok('C1 a second route pick during the load-in (a page-side clone pack, the sandbox ships one route) resolves sanely: the cycle completes, exactly ONE reveal crossing serves both picks, every teardown landed inside the hold, and no name is stuck invisible at the end (cycle: ' + cDone + ', reveal crossings: ' + upCrossings + ', replaces: ' + C.replaces + ', teardowns: ' + JSON.stringify(C.tears.map((t) => t.mult)) + ', final titles: ' + (C.samples.length ? C.samples[C.samples.length - 1].titles.length : 0) + ', poke error: ' + (C.pokeErr || 'none') + ')',
  cDone === true && upCrossings === 1 && C.tears.every((t) => t.mult === 0) && C.replaces <= 1 && C.samples[C.samples.length - 1].titles.length >= 30);

// ================= Phase D: the post-re-place backstop =================
await send('Page.reload', {}, S);
await bootToPicker();
await ev(INSTRUMENT);
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
if (!await poll(`window.__li.replaces === 1`, 30000)) throw new Error('drive219 D: the re-place never ran - the backstop drill has nothing to isolate');
const dBase = await J(`({ idles: window.__li.idles.length, replaceAt: window.__li.replaceAt, c: map.getCenter() })`);
let dRevealedAt = 0;
const jitter = setInterval(() => { ev(`(() => { const c = map.getCenter(); map.easeTo({ center: [c.lng + 0.004, c.lat + 0.002], duration: 480 }); return true; })()`).catch(() => {}); }, 230);
const dT0 = Date.now();
while (Date.now() - dT0 < 14000) {
  const st = await J(`({ mult: (typeof nameFade !== 'undefined' ? nameFade.mult : 1), held: (typeof nameFade !== 'undefined' ? nameFade.held : false), now: performance.now() })`);
  if (st.mult === 1 && !st.held) { dRevealedAt = st.now; break; }
  await sleep(200);
}
clearInterval(jitter);
const D = await J(`({ idles: window.__li.idles.length, samples: window.__li.samples })`);
const dRevealSample = D.samples.find((s, i) => i > 0 && !s.held && D.samples[i - 1].held); // the reveal's in-page start, off the sampler's own timestamps - the Node-side poll that first measured this drill inflated it by seconds of CDP lag under the camera storm (14.2 s read for a 6 s timer), so the graded figure is the in-page one
if (dRevealSample) dRevealedAt = dRevealSample.t;
const dDelay = dRevealedAt - dBase.replaceAt;
ok('D1 with idle suppressed by a moving camera after the re-place (idles during the drill: ' + (D.idles - dBase.idles) + '), the reveal still lands off the post-re-place backstop: the hold lets go ' + Math.round(dDelay) + ' ms after the re-place, read off the sampler\'s in-page timestamps (the timer is 6000 by design, pinned statically by proof-1266; the window runs 5000-12000 for this VM\'s main-thread timer lag under a deliberately hostile, never-resting camera, while the 5000 floor is what separates a timer reveal from an idle reveal, which would land with the rebuilt source at ~2-4 s)',
  dRevealedAt > 0 && (D.idles - dBase.idles) === 0 && dDelay >= 5000 && dDelay <= 12000);

// ================= Phase E: the absolute backstop =================
await send('Page.reload', {}, S);
await bootToPicker();
await ev(INSTRUMENT);
await ev(`(() => { map.jumpTo({ center: [-79.5495, 43.8338], zoom: 14 }); return true; })()`); // street level over the route's own area (the fixture's known home centre), so the basemap road names the hold must carry actually exist in frame - at the wide boot view there are none to hold
await poll(`!!(window.map && map.loaded())`, 30000);
await sleep(600);
const eT0 = await J(`performance.now()`);
try { await ev(`(() => { beginNameLoadIn(); return true; })()`); } catch (e) { /* a tree without the load-in (the red run) records the phase as failed through eDone below instead of crashing the drive here */ } // a cycle with no pick and no settle ever noted: only the absolute timer can end it
const eDone = await poll(`typeof nameFade !== 'undefined' && nameFade.mult === 1 && !nameFade.held`, 26000);
const E = await J(`window.__li`);
const eHeldAll = E.samples.filter((s) => s.held);
const eHeldRoad = eHeldAll.filter((s) => s.effR !== null && s.effR <= 0.05);
const eRevealSample = E.samples.find((s, i) => i > 0 && !s.held && E.samples[i - 1].held); // the reveal's own in-page timestamp: the first sample after the hold lets go - immune to the Node-side poll lag that inflates a wall-clock read on this VM
const eAt = eRevealSample ? eRevealSample.t : await J(`performance.now()`);
ok('E1 a hold engaged with no settle ever noted still reveals, off the absolute backstop: the hold lets go ' + Math.round(eAt - eT0) + ' ms after the engage, read off the sampler\'s own in-page timestamps (the timer is 15000 by design, pinned statically by proof-1266; the window runs 13500-18000 for the ramp\'s first frame plus this VM\'s timer lag - and no other reveal path exists in this phase at all: the settle gate was never satisfied, so any reveal here is the absolute timer\'s), and while held the road names were present but effectively invisible (held samples: ' + eHeldAll.length + ', every one at effective road opacity 0: ' + (eHeldAll.length === eHeldRoad.length) + ', road features present: ' + eHeldAll.some((s) => s.nRoad > 0) + ')',
  eDone === true && (eAt - eT0) >= 13500 && (eAt - eT0) <= 18000 && eHeldAll.length > 20 && eHeldAll.length === eHeldRoad.length && eHeldAll.some((s) => s.nRoad > 0));

// ================= Phase G: the instant-fit settle (reduced motion) =================
await send('Page.reload', {}, S);
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, S);
await bootToPicker();
await ev(INSTRUMENT);
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
const gDone = await waitCycle(40000);
await sleep(500);
const G = await J(`window.__li`);
const gLaneT = laneViolations(G.samples, 'titles', effVis('effT'));
ok('G1 the instant-fit settle (reduced motion emulated: no flight, so no re-place is owed) completes the same cycle: the hold engages, NO re-place runs and NO teardown lands, the names fade in at the settled camera, and the title lane holds (cycle: ' + gDone + ', replaces: ' + G.replaces + ', teardowns: ' + G.tears.length + ', lane violations: ' + JSON.stringify(gLaneT.slice(0, 6)) + ', final titles: ' + (G.samples.length ? G.samples[G.samples.length - 1].titles.length : 0) + ')',
  gDone === true && G.replaces === 0 && G.tears.length === 0 && gLaneT.length === 0 && G.samples[G.samples.length - 1].titles.length >= 30);
await send('Emulation.setEmulatedMedia', { features: [] }, S);

// ================= Phase H: deleting the route mid-load-in ends the cycle =================
await send('Page.reload', {}, S);
await bootToPicker();
await ev(INSTRUMENT);
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
await poll(`typeof nameFade !== 'undefined' && nameFade.held`, 15000);
await ev(`(() => { unloadRouteToBoot(); return true; })()`); // the delete path's own unload, called at the load-in's height: the cycle must end and the picker's names come back, not strand held
const hDone = await poll(`typeof nameFade !== 'undefined' && nameFade.mult === 1 && !nameFade.held`, 15000);
const H2 = await J(`({ held: window.__li.samples.some((s) => s.held), lastMult: (typeof nameFade !== 'undefined' ? nameFade.mult : 1) })`); // the final multiplier is read LIVE, not off the sampler's tail - on this VM the sampler's last sample can lag the live state by a ramp's width
ok('H1 unloading the route mid-load-in (the delete path) ends the cycle: the hold had engaged, the unload releases it, and the multiplier stands back at 1 - no name is stranded invisible over the boot view (hold seen: ' + H2.held + ', released: ' + hDone + ', final multiplier: ' + H2.lastMult + ')',
  H2.held === true && hDone === true && H2.lastMult === 1);

finish(R, proc);
