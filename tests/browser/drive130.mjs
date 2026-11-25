// Beta 1.263 addendum (Andrew's naming-revert decision, 2026-11-21): the
// 1.258 retirement and the 1.261 mix are both reverted - this drive is back
// to its 1.257 form above (titles at every zoom, originals excluding route
// names, no clones), which is again the live rule. proof-1263 pins the
// shape; drive216 grades presence during settles.
// Beta 1.294: L2/L3/L7/L9 grade the handover (titles fade 15-16, capped at 16; clones name route streets above).
import { launchDrive, finish, bootThrough, forceRouteTitlesOn } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route
await forceRouteTitlesOn(ev, poll); // Beta 1.293: this drive grades the titles - force the source switch on



// drive130: the street-name rule (Andrew, Beta 1.40; revised Beta 1.208). OUR titles
// name the route streets - one name per street at its anchor (labelpts) - at EVERY
// zoom; the basemap never prints a route street's name (the originals exclude them
// by filter). Beta 1.40's handover (titles fade out across 15.4-16.4 while basemap
// clones fade in) is retired in 1.208: the clones repeated a name 4-5 times down a
// close-zoom screen, and widening their line repeat is not a cure in this renderer
// (measured in this drive's own view: a 300 px repeat loses Malden Street's label,
// 400 px loses every label - anchors earn their place per tile segment). Day
// basemap road names are restyled dark for readability; our old line-following
// labels are retired; the West link reference line no longer draws. The L4/L7
// rendered-feature checks are the ones that would have caught the Beta 1.33-era
// clash, where the exclusion filter was silently rejected and basemap names
// printed on route streets at every zoom.
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
  const pt = map.getLayer('streetnamespt4');
  return JSON.stringify({
    streetnamesGone: !map.getLayer('streetnames'),
    ptOpacity: pt ? JSON.stringify(map.getPaintProperty('streetnamespt4', 'text-opacity')) : '',
    ptMax: pt ? pt.maxzoom : null,
    cloneMaj: !!map.getLayer('roads_labels_major-route'),
    cloneMin: !!map.getLayer('roads_labels_minor-route'),
    cloneOpacity: map.getLayer('roads_labels_major-route') ? JSON.stringify(map.getPaintProperty('roads_labels_major-route', 'text-opacity')) : '',
    cloneFilter: map.getLayer('roads_labels_minor-route') ? JSON.stringify(map.getFilter('roads_labels_minor-route')) : '',
    origFilter: JSON.stringify(map.getFilter('roads_labels_major')),
    dayColor: String(map.getPaintProperty('roads_labels_major', 'text-color')),
    dayHalo: String(map.getPaintProperty('roads_labels_minor', 'text-halo-width')),
    refFeatures: map.getSource('ref') ? map.querySourceFeatures('ref').length : -1
  });
})()`);
ok('L1 our line-following streetnames layer is retired | streetnamesGone ' + S1.streetnamesGone, S1.streetnamesGone === true);
ok('L2 our titles fade out across 15-16 and end at maxzoom 16 (Beta 1.294 handover: the 1.208 no-fade form is superseded by Andrew\'s decision) | opacity ' + S1.ptOpacity + ' maxzoom ' + S1.ptMax,
  S1.ptOpacity.includes('15,1') && S1.ptOpacity.includes('16,0') && S1.ptMax === 16);
ok('L3 the handover clones are built (Beta 1.294: the 1.208 retirement is superseded) with the spec fade in across 15-16 and a route-only filter | clones ' + S1.cloneMaj + '/' + S1.cloneMin + ' opacity ' + S1.cloneOpacity + ' filter ' + S1.cloneFilter.slice(0, 60),
  S1.cloneMaj === true && S1.cloneMin === true && S1.cloneOpacity.includes('15,0') && S1.cloneOpacity.includes('16,1') && S1.cloneFilter.includes('Velmar Drive') && !S1.cloneFilter.includes('"!"'));
ok('L4 originals exclude route names by a valid combined filter | orig ' + S1.origFilter.slice(0, 60),
  S1.origFilter.startsWith('["all"') && S1.origFilter.includes('Velmar Drive'));
ok('L5 day road names wear the readable restyle | color ' + S1.dayColor + ' halo ' + S1.dayHalo, S1.dayColor === '#333333' && S1.dayHalo === '1.5');
ok('L6 the reference source draws nothing (West link off the map) | ref features ' + S1.refFeatures, S1.refFeatures === 0);
const poiTxt = await ev(`map.getLayer('routepoi-txt') ? JSON.stringify(map.getLayoutProperty('routepoi-txt', 'text-field')) : 'missing'`);
ok('L6b the point of interest wears the route name, not the app name (Beta 1.79, Andrew) | poi ' + poiTxt, poiTxt === '"Route 5W"');

// The rendered proof at close zoom (Beta 1.294 form): at zoom 17.5 the titles are
// gone (maxzoom 16), the route name prints on the clones, the originals print none.
// Clone repeats are the renderer's own placement and are not counted.
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
// AND the full clone/orig name sets are identical across 4 consecutive samples
// (~1.2 s): no tile, placement or fade input then remains that could change the
// graded sample - and the graded sample IS the last stable sample, not a fresh read
// taken after the wait. A page that never converges still fails, on its final sample.
await ev(`(() => { window.__l7idleAt = 0; map.once('idle', () => { window.__l7idleAt = Date.now(); }); map.jumpTo({ center: [-79.56061255176667, 43.8186978701749], zoom: 17.5 }); return true; })()`);
let S2 = { titles: [], clone: [], orig: [] };
let settled = false, l7PrevKey = '', l7Streak = 0, l7Samples = 0;
const l7T0 = Date.now();
while (Date.now() - l7T0 < 60000) {
  l7Samples++;
  const s = await jread(`(() => JSON.stringify({
    loaded: map.loaded(),
    idle: (window.__l7idleAt || 0) > 0,
    titles: map.queryRenderedFeatures({ layers: ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'] }).map(f => f.properties.name),
    clone: map.queryRenderedFeatures({ layers: ['roads_labels_major-route', 'roads_labels_minor-route'] }).map(f => f.properties.name),
    orig: map.queryRenderedFeatures({ layers: ['roads_labels_major', 'roads_labels_minor'] }).map(f => f.properties.name)
  }))()`).catch(() => null);
  if (s) {
    S2 = { titles: s.titles, clone: s.clone, orig: s.orig };
    const key = JSON.stringify([[...new Set(s.titles)].sort(), [...new Set(s.clone)].sort(), [...new Set(s.orig)].sort()]);
    const pred = s.titles.length === 0 && s.clone.includes('Woolacott Road') && !s.orig.includes('Woolacott Road') && !s.orig.includes('Malden Street') && !s.orig.includes('Cartwright Boulevard');
    if (s.loaded && s.idle && pred && key === l7PrevKey) { l7Streak++; if (l7Streak >= 3) { settled = true; break; } }
    else { l7Streak = 0; l7PrevKey = key; }
  }
  await sleep(400);
}
ok('L7 at close zoom the route name prints on the handover clones, the titles print nothing, and the originals print no route name (Beta 1.294: the 1.208 titles-print form is inverted by the handover) | titles ' + JSON.stringify(S2.titles) + ' clone ' + JSON.stringify(S2.clone) + ' orig ' + JSON.stringify(S2.orig) + ' | settle ' + (settled ? (Date.now() - l7T0) + 'ms' : 'NEVER') + ' samples ' + l7Samples,
  settled === true && S2.titles.length === 0 && S2.clone.includes('Woolacott Road') && !S2.orig.includes('Woolacott Road') && !S2.orig.includes('Malden Street') && !S2.orig.includes('Cartwright Boulevard'));

// Night: the titles wear the engine's night colour and the handover clones are built under the night style too.
await ev(`(() => { localStorage.setItem('snowroute.v2.night', '1'); localStorage.setItem('snowroute.v2.nightExp', '4102444800000'); location.reload(); return true; })()`); // Beta 1.77: a stored override carries its sun-boundary expiry with it
await sleep(3000);
await bootThrough(ev, poll, { pinTheme: false }); // Beta 1.76: the reload returns to the route menu - pick 5W so the engine rebuilds the titles under the night style; Beta 1.77: keep the seeded night override (no day pin)
await forceRouteTitlesOn(ev, poll); // Beta 1.293: the reload reset the flag - force the switch on again for the night sections
ok('L8 night boot with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true && document.body.classList.contains('night')`, 30000));
const S3 = await jread(`(() => JSON.stringify({
  clone: !!map.getLayer('roads_labels_major-route'),
  col: map.getLayer('streetnamespt4') ? String(map.getPaintProperty('streetnamespt4', 'text-color')) : ''
}))()`);
ok('L9 night titles wear the lifted name colour and the handover clones are built under the night style | clone ' + S3.clone + ' color ' + S3.col, S3.clone === true && S3.col === '#e8e8e8');

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

