import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive130: the street-name rule (Andrew's decision, 2026-11-20; Beta 1.258).
// THE MAP'S OWN NAMES: the basemap's native road labels name every street,
// route streets included, in their full suffixed spelling (Ferrari Court,
// Santa Barbara Place), at the basemap's own zoom behaviour (major names
// from zoom 11, minor names from zoom 15). The app's own titles - the
// engine's streetnamespt1-4 point layers over the labelpts source, which
// named the route streets from Beta 1.40 to 1.257 while app2 excluded
// those names from the basemap by filter - are RETIRED: they carried the
// variable-anchor placement defect Beta 1.248 diagnosed, and this round's
// measurements on the live 1.257 build showed its one-shot heal could not
// hold the class (one zoom in and back after a clean settle re-stuck
// Marconi 21.1 px and Flatbush 14.4 px off their streets). The Beta 1.40
// basemap clone layers stay retired. Day basemap road names keep their
// readable dark restyle; our old line-following labels stay retired; the
// West link reference line no longer draws. The L2/L4/L7 checks grade the
// new rule in the rendered page: stock filters and stock zoom ranges on
// the originals, and the basemap itself printing a route street's full
// name at close zoom.
//
// Beta 1.261 addendum (Andrew's label-mix decision, 2026-11-20, the same
// evening - it supersedes the 1.258 rule above BELOW zoom 15): the app
// titles are restored under a maxzoom-15 cap, and the basemap major layer
// is split at 15 - the original owns 15-and-up with its stock filter and
// a '-pre15' copy carries the route-name exclusion across 11-15, so below
// 15 the app titles name the route streets and the basemap cannot double
// them; at 15 and up the 1.258 rule stands exactly as written above.
// L1b flips (titles present again), L2 becomes band-aware (originals keep
// stock filters; the exclusion lives on the -pre15 copy), L4 becomes
// band-aware (major original now starts at 15, minor at 15, the -pre15
// copy from 11), L9 flips its titles clause (titles present at night) and
// keeps the night lift. L7 stands verbatim - at close zoom the basemap
// prints the full name and the capped titles are gone, so nothing doubles.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
// Beta 1.83 (flake hardening): this drive's first-read crash has tripped four
// merge-commit runs (1.77, 1.78, 1.81, 1.82) - always the first read after
// bootThrough dying with '"[object Object]" is not valid JSON' before any check
// ran: the eval can land while the page context is still settling and hand back
// a raw object instead of the IIFE's JSON string. jread retries the read until
// it parses; a read that never parses still fails the drive, just honestly.
const jread = async (expr) => {
  let lastErr = null;
  for (let i = 0; i < 12; i++) {
    try {
      const raw = await ev(expr);
      if (typeof raw === 'string') return JSON.parse(raw);
      lastErr = new Error('non-string eval result: ' + Object.prototype.toString.call(raw));
    } catch (e) { lastErr = e; }
    await sleep(750);
  }
  throw lastErr;
};
// 2026-11-09 (L7 root hardening, part 1 - the camera thief; tests-only): picking the
// route started introToRoute's choreography (app4): a jumpTo to the wide view, then -
// on a 1500 ms timer - a 3000 ms flyTo to the fitted view. bootThrough's readiness
// poll reads !map.isMoving(), which holds BEFORE the timer fires: the flight is
// still PENDING and invisible to every readiness signal, so a drive that jumps the
// camera inside that window has its view stolen back mid-check (diag4 trace, run
// 42619724117: the Malden pair placed at +1.2 s, then progressively wider label sets
// as the flight eased out, frozen at the fitted view from +4 s - the classic L7
// failure read). Whether a session raced depended on whether its pre-L7 work
// straddled the timer - the family's bimodality across identical code. The gate
// below waits for the choreography's own terminal state before ANY check reads
// the map: the flight's moveend, or - when the flight already ended before this
// listener armed, or never ran - the choreography's own constants (1500 ms timer
// + 3000 ms flight + margin) elapsed since bootThrough returned (which is after
// the pick, so the elapsed test can only fire late, never early) with the map at
// rest. An expired gate fails the drive here, like bootThrough's own readiness.
await ev(`(() => { window.__introMoved = false; map.once('moveend', () => { window.__introMoved = true; }); return true; })()`);
const introT0 = Date.now();
let introDone = false;
while (Date.now() - introT0 < 30000) {
  const st = await jread(`(() => JSON.stringify({ moved: window.__introMoved === true, moving: map.isMoving() }))()`).catch(() => null);
  if (st && !st.moving && (st.moved || Date.now() - introT0 > 6000)) { introDone = true; break; }
  await sleep(300);
}
if (!introDone) throw new Error('drive130: readiness "intro flight finished" not met within 30000ms');
ok('L0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

const S1 = await jread(`(() => {
  const maj = map.getLayer('roads_labels_major');
  const min = map.getLayer('roads_labels_minor');
  return JSON.stringify({
    streetnamesGone: !map.getLayer('streetnames'),
    titlesHere: !!map.getLayer('streetnamespt1') && !!map.getLayer('streetnamespt2') && !!map.getLayer('streetnamespt3') && !!map.getLayer('streetnamespt4'),
    labelSrcHere: !!map.getSource('labelpts'),
    preHere: !!map.getLayer('roads_labels_major-pre15'),
    preMin: map.getLayer('roads_labels_major-pre15') ? map.getLayer('roads_labels_major-pre15').minzoom : null,
    preFilter: map.getLayer('roads_labels_major-pre15') ? JSON.stringify(map.getFilter('roads_labels_major-pre15')) : '',
    cloneMaj: !!map.getLayer('roads_labels_major-route'),
    cloneMin: !!map.getLayer('roads_labels_minor-route'),
    cloneOpacity: map.getLayer('roads_labels_major-route') ? JSON.stringify(map.getPaintProperty('roads_labels_major-route', 'text-opacity')) : '',
    cloneFilter: map.getLayer('roads_labels_minor-route') ? JSON.stringify(map.getFilter('roads_labels_minor-route')) : '',
    origFilter: JSON.stringify(map.getFilter('roads_labels_major')),
    origFilterMin: JSON.stringify(map.getFilter('roads_labels_minor')),
    majMin: maj ? maj.minzoom : null,
    minMin: min ? min.minzoom : null,
    dayColor: String(map.getPaintProperty('roads_labels_major', 'text-color')),
    dayHalo: String(map.getPaintProperty('roads_labels_minor', 'text-halo-width')),
    refFeatures: map.getSource('ref') ? map.querySourceFeatures('ref').length : -1
  });
})()`);
ok('L1 our line-following streetnames layer is retired | streetnamesGone ' + S1.streetnamesGone, S1.streetnamesGone === true);
ok('L1b the app title layers and their labelpts source are BACK (Beta 1.261: restored under the zoom-15 cap) | titlesHere ' + S1.titlesHere + ' labelSrcHere ' + S1.labelSrcHere,
  S1.titlesHere === true && S1.labelSrcHere === true);
ok('L2 band-aware: the ORIGINALS carry their STOCK filters, and the route-name exclusion lives on the -pre15 copy only (Beta 1.261) | major ' + S1.origFilter.slice(0, 60) + ' minor ' + S1.origFilterMin.slice(0, 60) + ' pre15 excludes Velmar: ' + S1.preFilter.includes('Velmar Drive'),
  !S1.origFilter.includes('Velmar Drive') && S1.origFilter.includes('"highway"') && S1.origFilter.includes('"major_road"') && !S1.origFilterMin.includes('Velmar Drive') && S1.origFilterMin.includes('"minor_road"') && S1.preHere === true && S1.preFilter.includes('Velmar Drive'));
ok('L3 route-name clone layers are retired (Beta 1.208: never built) | clones ' + S1.cloneMaj + '/' + S1.cloneMin,
  S1.cloneMaj === false && S1.cloneMin === false);
ok('L4 band-aware zoom ranges: the major ORIGINAL now starts at 15 (the split narrowed it), minor from 15, and the -pre15 copy carries the 11-15 band (Beta 1.261) | minzooms major ' + S1.majMin + ' minor ' + S1.minMin + ' pre15 ' + S1.preMin,
  S1.majMin === 15 && S1.minMin === 15 && S1.preMin === 11);
ok('L5 day road names wear the readable restyle | color ' + S1.dayColor + ' halo ' + S1.dayHalo, S1.dayColor === '#333333' && S1.dayHalo === '1.5');
ok('L6 the reference source draws nothing (West link off the map) | ref features ' + S1.refFeatures, S1.refFeatures === 0);
const poiTxt = await ev(`map.getLayer('routepoi-txt') ? JSON.stringify(map.getLayoutProperty('routepoi-txt', 'text-field')) : 'missing'`);
ok('L6b the point of interest wears the route name, not the app name (Beta 1.79, Andrew) | poi ' + poiTxt, poiTxt === '"Route 5W"');

// The rendered proof at close zoom (Beta 1.258 form): centred on Woolacott, the
// BASEMAP itself prints the route street's name in its full suffixed spelling
// (Woolacott Road) on the originals - the names the app titles used to carry
// now come from the map, and no app-drawn name exists to double them.
// 2026-11-09 (L7 root hardening, part 2 - Andrew's flake-gate order; tests-only): with
// the camera provably at rest (part 1, the intro gate at the top of this drive), the
// read is gated on the render pipeline's TERMINAL state, not on a momentary predicate.
// Diagnosis (flake log, L7 family; diag branch drive130-diag, run 42612695745 trace):
// after the jump the z17.5 tiles stream in and every arrival re-runs symbol placement,
// so a rendered-feature read is a snapshot of a pipeline still converging - the set
// pair can be empty, half-arrived or wide-view, and it can CHANGE after the check's
// predicate first reads true (run 42354426386: the 1.136 predicate poll settled, then
// the graded sample found the clones missing Malden Street - placement had moved on).
// The wait below samples the sets themselves and settles only when the map reports
// loaded, an idle event has fired since the jump, the check's own predicate holds,
// AND the full orig name set is identical across 4 consecutive samples
// (~1.2 s): no tile, placement or fade input then remains that could change the
// graded sample - and the graded sample IS the last stable sample, not a fresh read
// taken after the wait. A page that never converges still fails, on its final sample.
await ev(`(() => { window.__l7idleAt = 0; map.once('idle', () => { window.__l7idleAt = Date.now(); }); map.jumpTo({ center: [-79.56061255176667, 43.8186978701749], zoom: 17.5 }); return true; })()`);
let S2 = { orig: [] };
let settled = false, l7PrevKey = '', l7Streak = 0, l7Samples = 0;
const l7T0 = Date.now();
while (Date.now() - l7T0 < 60000) {
  l7Samples++;
  const s = await jread(`(() => JSON.stringify({
    loaded: map.loaded(),
    idle: (window.__l7idleAt || 0) > 0,
    orig: map.queryRenderedFeatures({ layers: ['roads_labels_major', 'roads_labels_minor'] }).map(f => f.properties.name)
  }))()`).catch(() => null);
  if (s) {
    S2 = { orig: s.orig };
    const key = JSON.stringify([...new Set(s.orig)].sort());
    const pred = s.orig.includes('Woolacott Road');
    if (s.loaded && s.idle && pred && key === l7PrevKey) { l7Streak++; if (l7Streak >= 3) { settled = true; break; } }
    else { l7Streak = 0; l7PrevKey = key; }
  }
  await sleep(400);
}
ok('L7 at close zoom the basemap itself prints the route name in full (Woolacott Road, suffix and all) | orig ' + JSON.stringify(S2.orig) + ' | settle ' + (settled ? (Date.now() - l7T0) + 'ms' : 'NEVER') + ' samples ' + l7Samples,
  settled === true && S2.orig.includes('Woolacott Road'));

// Night: the basemap names wear the night lift and the clones stay retired.
await ev(`(() => { localStorage.setItem('snowroute.v2.night', '1'); localStorage.setItem('snowroute.v2.nightExp', '4102444800000'); location.reload(); return true; })()`); // Beta 1.77: a stored override carries its sun-boundary expiry with it
await sleep(3000);
await bootThrough(ev, poll, { pinTheme: false }); // Beta 1.76: the reload returns to the route menu - pick 5W so the engine rebuilds the titles under the night style; Beta 1.77: keep the seeded night override (no day pin)
ok('L8 night boot with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true && document.body.classList.contains('night')`, 30000));
const S3 = await jread(`(() => JSON.stringify({
  clone: !!map.getLayer('roads_labels_major-route'),
  titlesHere: !!map.getLayer('streetnamespt1'),
  col: map.getLayer('roads_labels_major') ? String(map.getPaintProperty('roads_labels_major', 'text-color')) : ''
}))()`);
ok('L9 night: the basemap names wear the night lift (#ccd6df), the titles are present under the night style too, and no clones return (Beta 1.261) | clone ' + S3.clone + ' titlesHere ' + S3.titlesHere + ' color ' + S3.col, S3.clone === false && S3.titlesHere === true && S3.col === '#ccd6df');

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

