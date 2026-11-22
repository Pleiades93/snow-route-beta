import { launchDrive, finish, pinDayTheme } from './harness.mjs';
import { laneViolations, groupHeldViolations } from './lane-judge.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true }, S); // this lane grades presence and paint, not pixels: at the harness's retina factor the software-rendered headless map eats the main thread and the 50 ms sampler starves to a few ticks a second (measured), which would stretch the very timings under grade. At factor 1 the sampler holds its 50 ms median (measured).

// drive219: Beta 1.270 - THE BOOT-PHASE PRESENCE LANE, re-pointed at the
// synchronised-streaming load-in. Andrew's verdict on Beta 1.266's unified
// hold (2026-11-21): the blink was gone, but the flight landed on a
// nameless map and every name popped in at once seconds later. His design:
// the route titles load in SYNCED with the basemap's own load-in - placed
// once at stack build, streaming in area by area on the map's rhythm, one
// name set only, no preloading. The 1.266 hold cycle is retired whole.
// What survives is the 1.248 anchor re-place as a CONDITIONAL cure: the
// pick flight's guard (app5's armTitleRePlace) counts the placed titles
// at moveend - zero placed means every title's first placement happens
// against the settled scene and the teardown is skipped; any placed means
// the one re-place runs at idle inside a TITLES-ONLY hold, so the cure
// cannot blink either and the basemap is never held in any path.
// This drive samples title + basemap presence every 50 ms from BEFORE
// the pick. THE SETTLED-FRAME RULE for every lane below: a name is judged
// only over samples at or after the flight's moveend. During the flight
// the camera crosses a wide view (the fit zoomed out 3 levels), and a
// basemap name visible there can legitimately leave the frame or its
// zoom band as the flight zooms in - measured on this drive's first run:
// Valeria Boulevard and Belview Avenue stand ON through the wide phase
// and are absent at home (Valeria's home name is the route title; its
// basemap label is excluded on route streets). That is a stock map
// streaming, not a blink. The blink this lane exists to catch - the
// 1.248 teardown's - lands at the idle AFTER moveend, inside the judged
// window. (Under 1.266 the distinction was invisible: the hold kept
// every name unplaced until after the settle anyway.) Basemap names get
// one more allowance, measured on this drive's adjudication runs: the
// placement pass is ONE collision space shared by every symbol layer,
// so while the title source is still arriving a marginal basemap label
// can lose its seat when the titles complete (Belview Avenue, a
// non-route street, drops at the final placement pass as the title set
// lands; Valeria Boulevard's basemap copy is excluded by design in the
// same pass). The app's promises for basemap names are narrower and are
// what the lane grades: it never writes their paint or visibility
// (phase D), route streets' basemap copies are gone once the scene
// completes (A7), and a basemap name standing once BOTH sources have
// completed never drops afterwards (A5, judged from the titles'
// completion sample on).
// The phases grade:
//   A  the streaming load-in: the guard's check runs and SKIPS (no
//      re-place, no teardown, no hold ever engages); no name, once
//      visibly appeared, ever returns to zero; titles and basemap road
//      names COMPLETE inside the same bracket (the sync property).
//   F  movement after the load-in: a pan settles with no teardown and
//      no re-place - the 1.263 behaviour.
//   B  a theme swap mid-flight resolves by streaming: it completes,
//      no re-place runs, and the lane holds from the swap on.
//   C  a second route pick during the window resolves sanely: it
//      completes, nothing is stuck held or invisible at the end.
//   D  THE FIRED CURE: the guard's count is forced at its own seam (the
//      drive wraps the map's rendered-features query so the guard sees
//      a title placed mid-flight - the sandbox cannot make a title place
//      mid-flight on its own, the phone defect's precondition): the
//      re-place runs exactly once, its teardown lands inside the
//      titles-only hold, the basemap names are never hidden and never
//      drop, and the titles' natural paint is restored verbatim after.
//   G  the instant-fit settle (reduced motion): no flight, no guard,
//      the names simply stream at the settled camera.
//   H  deleting the route mid-window, then picking again, completes.
//   I  entering create mode mid-window and leaving: the backdrop's
//      visibility snapshot meets no hold transient, and the titles
//      stand natural and placed after the exit.
//   J  unloading WHILE the cure hold stands (PR #166, Codex P1): the
//      release must be invoked while still registered, or its own
//      identity check refuses it and the hold never lets go.
// On the 1.269 tree the lane fails at A: the hold engages on the pick,
// the re-place runs unconditionally, and the titles complete seconds
// after the basemap names - the hold-then-pop this design replaces.
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
  window.__li = { samples: [], tears: [], replaces: 0, replaceAt: 0, idles: [], naturals: null, guardChecks: 0, cureStubUsed: false, moveEndAt: 0 };
  map.on('idle', () => { try { window.__li.idles.push(performance.now()); } catch (e) {} });
  map.on('moveend', () => { try { window.__li.moveEndAt = performance.now(); } catch (e) {} }); // the settled frame's start - the lanes judge from here (see the header's settled-frame rule)
  const origRS = map.removeSource.bind(map);
  map.removeSource = (id) => { if (id === 'labelpts') { try { window.__li.tears.push({ t: performance.now(), mult: (typeof nameFade !== 'undefined' ? nameFade.mult : null) }); if (window.__liUnloadOnTear && !window.__liUnloaded) { window.__liUnloaded = true; setTimeout(() => { try { unloadRouteToBoot(); } catch (e) {} }, 0); } } catch (e) {} } return origRS(id); }; // phase J's hook: armed only there - the teardown schedules the route unload on the next task, so it lands after rePlaceTitles' synchronous rebuild completes but inside the re-parse window, while the cure's hold still stands (a CDP-timed unload cannot hit that window reliably, and CPU throttling to widen it starves the placement worker the phase also needs)
  if (window.GLP && window.GLP.rePlaceTitles) { const o = window.GLP.rePlaceTitles.bind(window.GLP); window.GLP.rePlaceTitles = () => { window.__li.replaces++; window.__li.replaceAt = performance.now(); window.__liForceCure = false; return o(); }; } // the cure's own call disarms the phase D stub - the precondition has done its work
  // The guard's seam: its check is a rendered-features query whose layer
  // list is a non-empty subset of the four title tiers. Count those calls
  // (the sampler's own query mixes title and basemap layers, so it never
  // counts). Phase D arms window.__liForceCure: while armed, EVERY
  // title-only call answers with one placed title, until the re-place
  // itself disarms it. Answering only the first call raced the app's own
  // title queries (an engine consumer took the stub on one run and the
  // guard counted real features - zero - and skipped; the next run the
  // guard took it and fired): the guard's check is not the only
  // title-only reader in the window, so the precondition is stated for
  // the whole window instead. Everything downstream of the count (the
  // idle gate, the titles-only hold, the re-place, the release) is the
  // app's real code running for real.
  const TITLE_IDS = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'];
  const origQRF = map.queryRenderedFeatures.bind(map);
  map.queryRenderedFeatures = (...args) => {
    try {
      const opts = args[args.length - 1];
      const layers = opts && opts.layers;
      if (Array.isArray(layers) && layers.length && layers.every((id) => TITLE_IDS.includes(id))) {
        window.__li.guardChecks++;
        if (window.__liForceCure) { window.__li.cureStubUsed = true; window.__li.cureStubServes = (window.__li.cureStubServes || 0) + 1; return [{ properties: { name: '__forced__' }, layer: { id: 'streetnamespt1' } }]; }
        if (window.__liForceSkip) { return []; } // the streaming phases' precondition, stated at the same seam: the guard's count is ZERO, so it skips - deterministic in every environment (on the fast CI runners a title genuinely places mid-flight on an unstaged pick and the guard fires a legitimate cure, which the PR #166 gate's phase A convicted as a hold: A2/A3 failed there with replaces 1 while the app behaved exactly as designed). Everything downstream of the count is the app's real code, as with the cure stub
      }
    } catch (e) {}
    return origQRF(...args);
  };
  const applied = (id) => { try { const v = map.getPaintProperty(id, 'text-opacity'); if (v === undefined) return 1; if (typeof v === 'number') return v; if (Array.isArray(v) && v[0] === '*') return v[2]; return -1; } catch (e) { return -1; } };
  // EFFECTIVE opacity: what a layer's live text-opacity spec actually
  // evaluates to at the current zoom (undefined = 1, a number = itself, a
  // zoom interpolate/step evaluated over its stops). The lane grades THIS,
  // never the app's own multiplier bookkeeping (the 1.266 round's first
  // judge trusted the multiplier and missed a real escape - a wrapped
  // paint value the validator silently refused). The judging itself
  // lives in lane-judge.mjs (extracted, fixture-tested by
  // selftest-lane219.mjs): per-name values from each name's own layer.
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
  const enumerate = () => {
    try {
      const layers = map.getStyle().layers;
      const base = layers.filter(L => L.type === 'symbol' && L.layout && L.layout['text-field'] && L['source-layer']).map(L => L.id);
      window.__liLayers = {
        base,
        road: base.filter(id => /road|street|motorway|path|ferry/i.test(id)),
        place: base.filter(id => !/road|street|motorway|path|ferry/i.test(id)),
        titles: TITLE_IDS.filter(id => map.getLayer(id))
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
      // Per-layer effective opacity, computed once per tick; the groups
      // carry each name with ITS OWN layer's value (the lane judges per
      // name) plus the group's max/min (the held assertion reads the
      // max - see lane-judge.mjs for why the min must never acquit).
      const z = map.getZoom();
      const layerEff = {};
      for (const id of [...L.titles, ...L.base]) { try { layerEff[id] = map.getLayoutProperty(id, 'visibility') === 'none' ? 0 : effOf(map.getPaintProperty(id, 'text-opacity'), z); } catch (e) { layerEff[id] = 1; } } // a hidden layer renders nothing whatever its paint says - visibility reads as effective opacity 0
      const stats = (ids) => { if (!ids.length) return { names: {}, effMax: null, effMin: null }; const es = ids.map((id) => layerEff[id]); return { names: {}, effMax: Math.max(...es), effMin: Math.min(...es) }; };
      const groups = { titles: stats(L.titles), road: stats(L.road), place: stats(L.place) };
      let nRoad = 0;
      const roadSet = new Set(L.road), placeSet = new Set(L.place), titleSet = new Set(L.titles);
      for (const f of origQRF({ layers: [...L.titles, ...L.base] })) {
        const nm = f.properties && f.properties.name; if (!nm) continue;
        const lid = f.layer && f.layer.id;
        if (titleSet.has(lid)) groups.titles.names[nm] = layerEff[lid];
        else if (roadSet.has(lid)) { groups.road.names[nm] = layerEff[lid]; nRoad++; }
        else if (placeSet.has(lid)) groups.place.names[nm] = layerEff[lid];
      }
      window.__li.samples.push({ t: performance.now(),
        mult: (typeof nameFade !== 'undefined' ? nameFade.mult : 1), held: (typeof nameFade !== 'undefined' ? nameFade.held : false),
        groups,
        titles: Object.keys(groups.titles.names), road: Object.keys(groups.road.names), place: Object.keys(groups.place.names), nRoad,
        visR: L.road.length > 0 && L.road.every((id) => { try { return map.getLayoutProperty(id, 'visibility') === 'none'; } catch (e) { return false; } }),
        effT: groups.titles.effMax, effR: groups.road.effMax, effP: groups.place.effMax,
        mTitles: L.titles.length ? applied(L.titles[0]) : null, mRoad: L.road.length ? applied(L.road[0]) : null, mPlace: L.place.length ? applied(L.place[0]) : null });
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
const waitCureDone = async (ms) => poll(`(() => { try { const last = window.__li.samples[window.__li.samples.length - 1]; return !!last && last.titles.length >= 30 && (typeof nameFade === 'undefined' || (nameFade.mult === 1 && !nameFade.held)); } catch (e) { return false; } })()`, ms);

// ================= Phase A: the streaming load-in =================
await bootToPicker();
await ev(INSTRUMENT);
await ev(`(() => { window.__liForceSkip = true; return true; })()`); // the skip precondition at the guard's own seam (see the instrument): phase A grades the streaming path, so the guard's count is staged at zero - phase D stages the opposite
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
const aDone = await waitSettled(40000);
await sleep(700);
const A = await J(`window.__li`);
console.log('drive219 A: samples ' + A.samples.length + ', tears ' + A.tears.length + ', replaces ' + A.replaces + ', guardChecks ' + A.guardChecks + ', settled ' + aDone);
ok('A1 the load-in completes by streaming: the titles reach full placement with no reveal to wait for (settled poll: ' + aDone + ', final titles placed: ' + (A.samples.length ? A.samples[A.samples.length - 1].titles.length : 0) + ', samples: ' + A.samples.length + ')',
  aDone === true && A.samples.length > 0 && A.samples[A.samples.length - 1].titles.length >= 30);
ok('A2 NO HOLD EVER ENGAGES on a normal pick - not one sample stands held, and no layer is recorded unheld (held samples: ' + A.samples.filter((s) => s.held).length + ', unheld: ' + JSON.stringify(A.unheld || {}) + '): the 1.266 cycle is retired, not dormant',
  A.samples.every((s) => !s.held) && Object.keys(A.unheld || {}).length === 0);
ok('A3 the guard RAN and SKIPPED: its moveend count was taken (title-only queries seen: ' + A.guardChecks + ') and it owed no cure - zero re-places, zero labelpts teardowns (replaces: ' + A.replaces + ', teardowns: ' + A.tears.length + '). The count is staged at zero at the guard\'s own seam: unstaged, the count is environment-dependent (0 on every cold pick locally; on the fast CI runners a title places mid-flight and the guard fires - correctly - which is phase D\'s subject, not a streaming defect). With the count at zero the unconditional rebuild 1.266 shipped is exactly the waste this check removes',
  A.guardChecks >= 1 && A.replaces === 0 && A.tears.length === 0);
const aSettled = A.samples.filter((x) => x.t >= A.moveEndAt);
const aLaneT = laneViolations(aSettled, 'titles');
const aCT = completeAt(A.samples, 'titles'), aCR = completeAt(A.samples, 'road');
const aLaneR = laneViolations(A.samples.filter((x) => x.t >= aCT), 'road');
ok('A4 THE LANE, titles: no title, once visibly appeared, ever returns to zero inside the settled frame (samples from the flight\'s moveend on, per the settled-frame rule; violations: ' + JSON.stringify(aLaneT) + '; sampling: ' + A.samples.length + ' samples, median gap ' + Math.round(medianGap(A.samples)) + ' ms - the blink this lane exists to catch lasts ~1-2 s, ~4.9 s throttled, and it lands after moveend by construction)',
  aLaneT.length === 0);
ok('A5 THE LANE, basemap road names: no visible road name ever returns to zero once the scene has completed (judged from the titles\' completion sample on - while the title source is still arriving, the shared collision space is still filling and a marginal basemap label can lose its seat to the completing titles, which is the basemap engine\'s own placement, measured in the adjudication runs: Belview Avenue; violations after completion: ' + JSON.stringify(aLaneR.slice(0, 6)) + ')',
  aLaneR.length === 0);
const aLastRoad = A.samples.length ? A.samples[A.samples.length - 1].road : [];
const aLastTitles = A.samples.length ? A.samples[A.samples.length - 1].titles : [];
ok('A7 ONE NAME SET at the end of the window: the observed route street\'s basemap copy is gone once the scene completes (the exclusion has landed - road names in the final sample contain Valeria Boulevard: ' + aLastRoad.includes('Valeria Boulevard') + ') and its name is carried by the route title instead (titles contain Valeria: ' + aLastTitles.includes('Valeria') + ') - never doubled, never nameless',
  !aLastRoad.includes('Valeria Boulevard') && aLastTitles.includes('Valeria'));
ok('A6 THE SYNC: titles and basemap road names COMPLETE inside the same bracket - each group\'s placed-name count reaches its window total within 3000 ms of the other\'s (titles complete at +' + Math.round(aCT - A.samples[0].t) + ' ms, road names at +' + Math.round(aCR - A.samples[0].t) + ' ms, from the first sample; the 3000 ms bracket is the sampler\'s own resolution under this VM\'s load - the investigation\'s event-level spans put the two tile pipelines 23 ms apart - set against the shipped 1.266 wait of 3.1-6.7 s of nameless map AFTER landing, which this bracket excludes by a wide margin)',
  aCT > 0 && aCR > 0 && Math.abs(aCT - aCR) <= 3000);

// ================= Phase F: movement after the load-in (same page) =================
const fTears0 = A.tears.length, fRep0 = A.replaces;
await ev(`(() => { map.panBy([140, 60], { duration: 800 }); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 30000);
await sleep(2200);
const F = await J(`({ tears: window.__li.tears.length, replaces: window.__li.replaces })`);
ok('F1 a pan after the load-in settles with NO teardown and NO re-place - movement behaviour is the 1.263 behaviour exactly (teardowns ' + fTears0 + ' -> ' + F.tears + ', re-places ' + fRep0 + ' -> ' + F.replaces + ')',
  F.tears === fTears0 && F.replaces === fRep0);

// ================= Phase B: theme swap mid-flight =================
await send('Page.reload', {}, S);
await bootToPicker();
await ev(INSTRUMENT);
await ev(`(() => { window.__liForceSkip = true; return true; })()`); // the streaming precondition, as phase A: the swap is graded, not the guard
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
await sleep(2200); // the flight runs 1500 -> 4500 ms: this lands mid-flight
const bSwapAt = await J(`performance.now()`);
await ev(`(() => { setThemeOverride(true); applyNight(); setBasemap(); return true; })()`);
const bDone = await waitSettled(40000);
await sleep(500);
const B = await J(`window.__li`);
console.log('drive219 B: samples ' + B.samples.length + ', tears ' + B.tears.length + ', replaces ' + B.replaces + ', settled ' + bDone);
const bAfter = B.samples.filter((s) => s.t >= Math.max(bSwapAt, B.moveEndAt || 0)); // settled-frame rule for the TITLES: from the later of the swap and the flight's end
const bLaneT = laneViolations(bAfter, 'titles');
const bLaneR = laneViolations(B.samples.filter((x) => x.t >= completeAt(B.samples, 'titles')), 'road'); // the ROAD lane is judged from the titles' completion, as A5 and D2 judge theirs: a style swap restreams BOTH families into the one shared collision space, and until the last family completes a marginal basemap label can legitimately lose its seat mid-restream and return (PR #166 gate, head 9125206f: Chancellor Drive and Ansley Grove Road dropped and returned on the CI runners - the basemap engine's own placement while the scene was still filling, not a name the app dropped)
ok('B1 a theme swap mid-flight resolves by streaming: the load-in completes on the new style, no re-place runs, and neither name family drops a visible name once its frame settles - the titles from the later of the swap and the flight\'s end, the basemap road names from the titles\' completion (while the swapped scene is still filling, the shared collision space is still seating labels; a style swap restacks every layer - basemap names re-stream too, which is the reference behaviour Andrew\'s sync target names; settled: ' + bDone + ', replaces: ' + B.replaces + ', title violations after the swap: ' + JSON.stringify(bLaneT.slice(0, 6)) + ', road violations after completion: ' + JSON.stringify(bLaneR.slice(0, 6)) + ', final titles: ' + (B.samples.length ? B.samples[B.samples.length - 1].titles.length : 0) + ')',
  bDone === true && B.replaces === 0 && bLaneT.length === 0 && bLaneR.length === 0 && B.samples[B.samples.length - 1].titles.length >= 30);

// ================= Phase C: a second pick during the window =================
await send('Page.reload', {}, S);
await bootToPicker();
await ev(INSTRUMENT);
await ev(`(() => { window.__liForceSkip = true; return true; })()`); // the streaming precondition, as phase A: both picks' guards count zero and skip
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
await sleep(600); // inside the first pick's dwell - its flight has not even launched
await ev(`(() => { try { const p = JSON.parse(JSON.stringify(ROUTE_PACKS[0])); p.id = '5x'; p.name = 'Route 5X'; ROUTE_PACKS.push(p); loadRoute('5x'); } catch (e) { window.__li.pokeErr = String(e && e.message || e); } return true; })()`);
const cDone = await waitSettled(40000);
await sleep(500);
const C = await J(`window.__li`);
console.log('drive219 C: samples ' + C.samples.length + ', tears ' + C.tears.length + ', replaces ' + C.replaces + ', settled ' + cDone + ', pokeErr ' + (C.pokeErr || 'none'));
const cLast = C.samples.length ? C.samples[C.samples.length - 1] : { titles: [], mult: 1, held: true };
ok('C1 a second route pick during the window (a page-side clone pack, the sandbox ships one route) resolves sanely: the incoming route completes, no name is stuck held or invisible at the end, and any teardown that ran landed inside a titles-only cure hold (settled: ' + cDone + ', replaces: ' + C.replaces + ', teardowns: ' + JSON.stringify(C.tears.map((t) => t.mult)) + ', final titles: ' + cLast.titles.length + ', final held: ' + cLast.held + ', final multiplier: ' + cLast.mult + ', poke error: ' + (C.pokeErr || 'none') + ')',
  cDone === true && cLast.titles.length >= 30 && cLast.held === false && cLast.mult === 1 && C.tears.every((t) => t.mult === 0) && C.replaces <= 1);

// ================= Phase D: the fired cure =================
// The phase retries its staging up to 3 times; the ONLY break is the
// firing itself (replaces 1). Two CI lessons from PR #166 shaped this
// staging, and both are recorded so they are not relearned:
// (1) A served title-only call is not proof the guard decided - an
// engine consumer can take the stub's answer while the guard's own
// check never queries (first gate: guard checks 1, replaces 0, the
// attempt wrongly accepted as decided). With the stub armed, ANY
// title-only query the guard makes fires the cure, so the firing is
// the only honest proof the staging held.
// (2) The attempt must be judged only after the guard's WHOLE decision
// window has closed. The check runs at moveend (pick + ~4.5 s) or at
// the arm-time backstop (pick + ~8 s; the layers can lag past the
// flight under load, and a check that finds no title layers takes no
// count and stands down). On the fast CI runners the streaming
// completed and the read landed BEFORE the backstop fired - three
// attempts each recorded guard checks 0 with the backstop still
// pending, and each retry's reload wiped it (second gate: D1 failed,
// guard checks 0 across 3 attempts, while phase J - which polls for
// the firing itself - fired in the same run). So the loop polls for
// the firing for 20 s (moveend, the backstop and the idle gate, with
// margin) before it reads anything, and three unfired attempts fail
// D1 honestly.
let D = null, dDone = false, dAttempts = 0;
for (let attempt = 1; attempt <= 3; attempt++) {
  dAttempts = attempt;
  await send('Page.reload', {}, S);
  await bootToPicker();
  await ev(INSTRUMENT);
  await ev(`(() => { window.__liForceCure = true; return true; })()`); // armed BEFORE the pick: the guard's moveend count is a title-only query inside the window
  await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
  const fired = await poll(`!!(window.__li && window.__li.replaces === 1)`, 20000); // the guard's whole decision window, waited out (lesson 2 above)
  if (fired) { dDone = await waitCureDone(45000); await sleep(700); D = await J(`window.__li`); break; }
  D = await J(`window.__li`);
}
console.log('drive219 D: attempts ' + dAttempts + ', samples ' + D.samples.length + ', tears ' + JSON.stringify(D.tears) + ', replaces ' + D.replaces + ', guardChecks ' + D.guardChecks + ', stubUsed ' + D.cureStubUsed + ', done ' + dDone);
ok('D1 THE CURE FIRES on a placed-mid-flight count: the re-place ran exactly once and its labelpts teardown landed INSIDE the titles-only hold (staging attempts: ' + dAttempts + ', stub served: ' + D.cureStubUsed + ' x' + (D.cureStubServes || 0) + ', guard checks: ' + D.guardChecks + ', replaces: ' + D.replaces + ', teardowns: ' + D.tears.length + ', teardown multipliers: ' + JSON.stringify(D.tears.map((t) => t.mult)) + ') - a guard that never fires in tests is an assertion, not a proof; this phase is the firing',
  D.cureStubUsed === true && D.replaces === 1 && D.tears.length === 1 && D.tears[0].mult === 0);
const dHeldTitles = groupHeldViolations(D.samples, ['titles']);
const dRoadHidden = D.samples.filter((s) => s.held && s.visR);
const dLaneR = laneViolations(D.samples.filter((x) => x.t >= completeAt(D.samples, 'titles')), 'road'); // judged from the titles' completion, as phase A's A5 - the shared collision space is still filling until then
ok('D2 while the cure hold stands, the TITLES are really held on the rendered surface (held-sample title violations: ' + JSON.stringify(dHeldTitles.slice(0, 3)) + ') and the BASEMAP IS NEVER HELD: in no held sample are the road layers hidden (held samples with road layers hidden: ' + dRoadHidden.length + '), and no visible basemap road name ever drops across the whole cure (road lane violations: ' + JSON.stringify(dLaneR.slice(0, 6)) + ') - the basemap ban (drive216 P3) holds on the cure path too',
  dHeldTitles.length === 0 && dRoadHidden.length === 0 && dLaneR.length === 0);
await poll(`typeof nameFade !== 'undefined' && nameFade.mult === 1 && !nameFade.held`, 20000); // the LIVE release state, not the sampler's last sample - the sampler lags the live ramp under this VM's load, and a mid-ramp read compares a scaled paint against the natural and convicts a restore that has not finished yet (the adjudication probe read all four layers matching after the live settle)
await sleep(500);
const dRestored = await J(`(() => {
  const nat = window.__li.naturals || {};
  const one = (id) => { try { const live = map.getPaintProperty(id, 'text-opacity'); return JSON.stringify(live === undefined ? '__undef' : live) === JSON.stringify(nat[id]); } catch (e) { return 'ERR:' + String(e && e.message || e); } };
  return { pt1: one('streetnamespt1'), captured: Object.keys(nat).length };
})()`);
const dLast = D.samples.length ? D.samples[D.samples.length - 1] : { titles: [] };
ok('D3 the cure completes and lets go: the titles stand placed at their natural paint again verbatim (cycle: ' + dDone + ', final titles: ' + dLast.titles.length + ', streetnamespt1 restored: ' + dRestored.pt1 + ', naturals captured: ' + dRestored.captured + ' layers)',
  dDone === true && dLast.titles.length >= 30 && dRestored.pt1 === true && dRestored.captured >= 1);

// ================= Phase G: the instant-fit settle (reduced motion) =================
await send('Page.reload', {}, S);
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, S);
await bootToPicker();
await ev(INSTRUMENT);
await ev(`(() => { window.__liForceSkip = true; return true; })()`); // the streaming precondition, as phase A (the instant-fit path owes no check anyway - this is insurance, not a crutch)
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
const gDone = await waitSettled(40000);
await sleep(500);
const G = await J(`window.__li`);
const gLaneT = laneViolations(G.samples, 'titles');
ok('G1 the instant-fit settle (reduced motion emulated: no flight, so no guard is armed and no check is owed) simply streams: the titles complete, NO re-place runs and NO teardown lands, and the title lane holds (settled: ' + gDone + ', replaces: ' + G.replaces + ', teardowns: ' + G.tears.length + ', lane violations: ' + JSON.stringify(gLaneT.slice(0, 6)) + ', final titles: ' + (G.samples.length ? G.samples[G.samples.length - 1].titles.length : 0) + ')',
  gDone === true && G.replaces === 0 && G.tears.length === 0 && gLaneT.length === 0 && G.samples[G.samples.length - 1].titles.length >= 30);
await send('Emulation.setEmulatedMedia', { features: [] }, S);

// ================= Phase H: deleting the route mid-window =================
await send('Page.reload', {}, S);
await bootToPicker();
await ev(INSTRUMENT);
await ev(`(() => { window.__liForceSkip = true; return true; })()`); // the streaming precondition, as phase A: no cure hold can stand across the unload in this phase - phase J grades the unload with one standing
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
await sleep(900); // inside the dwell - the window is wide open
await ev(`(() => { unloadRouteToBoot(); return true; })()`); // the delete path's own unload: with no hold standing there is nothing to strand - the picker's basemap names simply carry on
await sleep(800);
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
const hDone = await waitSettled(40000);
await sleep(500);
const H = await J(`window.__li`);
const hLast = H.samples.length ? H.samples[H.samples.length - 1] : { titles: [], held: true, mult: 0 };
ok('H1 unloading the route mid-window (the delete path) and picking again completes cleanly: the second load-in streams to full placement and nothing stands held at the end (settled: ' + hDone + ', final titles: ' + hLast.titles.length + ', final held: ' + hLast.held + ', final multiplier: ' + hLast.mult + ')',
  hDone === true && hLast.titles.length >= 30 && hLast.held === false && hLast.mult === 1);

// ================= Phase I: entering create mode mid-window =================
await send('Page.reload', {}, S);
await bootToPicker();
await ev(INSTRUMENT);
await ev(`(() => { window.__liForceSkip = true; return true; })()`); // the streaming precondition, as phase A: with the count staged at zero no hold can stand when the backdrop snapshots - the phase's premise, made deterministic
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
await poll(`!!(window.map && map.isMoving())`, 15000); // creation opens MID-FLIGHT, while the stream is genuinely running - the staging this phase's premise names (the old fixed 900 ms sleep lands inside the pick's 1500 ms dwell on a fast machine, before the flight has even launched)
await ev(`(() => { enterCreate('pick'); return true; })()`); // the backdrop snapshots the route stack's visibility NOW - with no hold standing, the snapshot reads the naturals directly (the PR #162 transient-none hazard has no hold to rise from on this path; a cure hold is the only one left, and it never spans a pick)
await sleep(1500);
const iDuring = await J(`(() => { const ids = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].filter((id) => map.getLayer(id)); return { hidden: ids.every((id) => map.getLayoutProperty(id, 'visibility') === 'none'), layers: ids.length, creating: (typeof creating !== 'undefined' ? creating : '?') }; })()`);
await ev(`(() => { exitCreate(); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 30000);
// Poll the re-placement itself, never a fixed sleep (the one-shot read
// after a 1200 ms sleep also convicted plain re-placement lag, the
// class phases D and J judge by polling the live state). Thirty
// seconds of no placement still fails I1 honestly on the read below.
// BOTH reads here go through the MIXED layer list - the four title
// layers plus one basemap symbol layer, filtered back to title-layer
// features in the read - never a title-only query: this phase arms
// the skip stub at that seam for the guard, and a title-only read is
// the stub's exact target, so the phase's own title-only reads
// answered [] forever and I1 recorded placed 0 while a stub-free
// probe of the same sequence placed 34 (PR #166 gate, head 9125206f;
// the sampler has always read mixed, which is why the sampler-judged
// phases never saw this). A stub at a shared seam intercepts the
// test's own reads too - read reality the way the sampler does.
await ev(`window.__iRead = () => { const ids = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].filter((id) => map.getLayer(id)); const vis = ids.map((id) => map.getLayoutProperty(id, 'visibility') || 'visible'); const style = map.getStyle(); const mixer = style && style.layers ? (style.layers.find((l) => l.type === 'symbol' && l['source-layer']) || {}).id : null; const s = new Set(); if (ids.length) { for (const f of map.queryRenderedFeatures({ layers: mixer ? ids.concat([mixer]) : ids })) if (f.layer && ids.includes(f.layer.id) && f.properties && f.properties.name) s.add(f.properties.name); } return { vis, placed: s.size }; }`);
await poll(`(() => { try { return window.__iRead().placed >= 30; } catch (e) { return false; } })()`, 30000);
const iAfter = await J(`window.__iRead()`);
ok('I1 entering create mode mid-window and leaving: during creation the backdrop\'s hide holds (titles hidden: ' + iDuring.hidden + '), and after the exit the titles stand at their natural visibility and place (during: ' + JSON.stringify(iDuring) + ', visibilities after exit: ' + JSON.stringify(iAfter.vis) + ', titles placed: ' + iAfter.placed + ')',
  iDuring.hidden === true && iAfter.vis.every((v) => v !== 'none') && iAfter.placed >= 30);

// ================= Phase J: unloading WHILE the cure hold stands (PR #166, Codex P1) =================
// Phase D proves the cure releases on its own idle; phase H unloads with
// no hold standing. The seam between them: the cure has fired, its
// titles-only hold stands, and the route is unloaded BEFORE the rebuilt
// source's idle releases it. unloadRouteToBoot calls releaseTitleCure,
// which must invoke the release while it is still registered - the
// closure opens with an identity check (titleCureRelease !== release ->
// stand down) that retires stale invocations, so a clear-first caller
// makes the callback refuse itself: the hold never releases and the
// titles stay invisible indefinitely, the incoming route's included.
// The phase stages phase D's firing, and the unload is timed IN-PAGE:
// the instrument's teardown hook schedules unloadRouteToBoot on the
// next task after the labelpts teardown - after rePlaceTitles'
// synchronous rebuild completes, inside the re-parse window, while the
// hold still stands. (Two earlier stagings failed honestly and are
// recorded here so they are not retried: a CDP-timed unload cannot hit
// the re-parse window reliably, and 6x CPU throttling to widen the
// window starves the placement worker past the runner's cap.) The
// re-pick is then CONFIRMED, not assumed (a click at a stale or absent
// row silently no-ops). Staging retries follow phase D's rule: only a
// staging miss (the cure never fired) retries.
let jFired = false, jAttempts = 0;
for (let attempt = 1; attempt <= 3 && !jFired; attempt++) {
  jAttempts = attempt;
  await send('Page.reload', {}, S);
  await bootToPicker();
  await ev(INSTRUMENT);
  await ev(`(() => { window.__liForceCure = true; window.__liUnloadOnTear = true; return true; })()`); // phase D's stub (the guard's count is served so the cure fires) + the teardown hook (the unload lands inside the hold)
  await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
  jFired = await poll(`!!(window.__li && window.__liUnloaded)`, 45000); // the hook fired = the cure fired AND the unload landed inside its hold
  if (jFired) {
    await poll(`typeof activeRoute !== 'undefined' && !activeRoute`, 20000); // the unload's own landing (no route active) - so the pick confirmation below cannot read the stale route
    await poll(`!!document.querySelector('#rmRoutes .routeRow')`, 30000);
    await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
    const took = await poll(`typeof activeRoute !== 'undefined' && !!activeRoute`, 20000);
    if (!took) { await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`); await poll(`typeof activeRoute !== 'undefined' && !!activeRoute`, 20000); }
  }
}
const jDone = jFired ? await waitCureDone(60000) : false;
// Judge the end state on the LIVE release state first, as phase D does:
// the re-pick's own guard may legitimately fire its own cure at its
// idle (titles placed mid-flight on the re-pick is the guard's exact
// precondition), and a sampler read taken inside that cure's hold
// convicts a healthy app - the full-drive run measured exactly that
// (settled true, 34 titles, last sample caught inside the second cure).
// The stranded-hold defect this phase exists for never releases at all,
// so the live poll separates the two cleanly.
const jReleased = jFired ? await poll(`typeof nameFade !== 'undefined' && nameFade.mult === 1 && !nameFade.held`, 20000) : false;
// Then wait for the SAMPLER to catch up to the released state before
// judging its last sample: the sampler ticks behind the live state
// under load, and a last-sample read taken in the lag convicts the
// released app with the previous hold's sample (measured: the live
// state free while the newest sample still showed the re-pick's own
// legitimate cure). The stranded hold never lets the sampler catch up.
const jCaught = jReleased ? await poll(`(() => { try { const s = window.__li.samples; const last = s[s.length - 1]; return !!last && !last.held && last.mult === 1 && last.titles.length >= 30; } catch (e) { return false; } })()`, 20000) : false;
const J219 = await J(`window.__li`);
const jLast = J219.samples.length ? J219.samples[J219.samples.length - 1] : { titles: [], held: true, mult: 0 };
console.log('drive219 J: attempts ' + jAttempts + ', fired ' + jFired + ', settled ' + jDone + ', released ' + jReleased + ', sampler caught up ' + jCaught + ', final ' + JSON.stringify({ titles: jLast.titles.length, held: jLast.held, mult: jLast.mult }));
ok('J1 unloading WHILE the cure hold stands releases it (the PR #166 Codex P1 seam): the re-pick streams to full placement at natural paint and nothing stands held at the end (staging attempts: ' + jAttempts + ', cure fired: ' + jFired + ', settled: ' + jDone + ', live release: ' + jReleased + ', sampler caught up: ' + jCaught + ', final titles: ' + jLast.titles.length + ', final held: ' + jLast.held + ', final multiplier: ' + jLast.mult + ')',
  jFired === true && jDone === true && jReleased === true && jCaught === true && jLast.titles.length >= 30 && jLast.held === false && jLast.mult === 1);

finish(R, proc);
