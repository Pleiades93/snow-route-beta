import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive130: Beta 1.40 label handover (Andrew): zoomed out, OUR titles name the route
// streets; zooming in, they fade out across 15.4-16.4 while the basemap's own road names
// fade in on route streets (clone layers) across the same band; day basemap road names
// are restyled dark for readability; our old line-following labels are retired; the
// West link reference line no longer draws. The L4 rendered-feature check is the one
// that would have caught the Beta 1.33-era clash, where the exclusion filter was
// silently rejected and basemap names printed on route streets at every zoom.
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
ok('L2 our titles fade out across the 15.4-16.4 handover band | opacity ' + S1.ptOpacity + ' maxzoom ' + S1.ptMax,
  S1.ptOpacity.includes('15.4') && S1.ptOpacity.includes('16.4') && S1.ptMax === 16.4);
ok('L3 route-name clone layers exist with the fade-in ramp | clones ' + S1.cloneMaj + '/' + S1.cloneMin + ' opacity ' + S1.cloneOpacity,
  S1.cloneMaj && S1.cloneMin && S1.cloneOpacity.includes('interpolate') && S1.cloneOpacity.includes('15.4'));
ok('L4 originals exclude route names by a valid combined filter | orig ' + S1.origFilter.slice(0, 60) + ' clone ' + S1.cloneFilter.slice(0, 60),
  S1.origFilter.startsWith('["all"') && S1.origFilter.includes('Velmar Drive') && S1.cloneFilter.includes('Velmar Drive'));
ok('L5 day road names wear the readable restyle | color ' + S1.dayColor + ' halo ' + S1.dayHalo, S1.dayColor === '#333333' && S1.dayHalo === '1.5');
ok('L6 the reference source draws nothing (West link off the map) | ref features ' + S1.refFeatures, S1.refFeatures === 0);
const poiTxt = await ev(`map.getLayer('routepoi-txt') ? JSON.stringify(map.getLayoutProperty('routepoi-txt', 'text-field')) : 'missing'`);
ok('L6b the point of interest wears the route name, not the app name (Beta 1.79, Andrew) | poi ' + poiTxt, poiTxt === '"Route 5W"');

// The rendered proof at close zoom: on Malden/Cartwright the basemap names arrive on the
// CLONE layers only - the originals must return none of them (no doubling, ever).
// 2026-11-09 (L7 root hardening - Andrew's flake-gate order; tests-only): the read is
// gated on the render pipeline's TERMINAL state, not on a momentary predicate.
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
await ev(`(() => { window.__l7idleAt = 0; map.once('idle', () => { window.__l7idleAt = Date.now(); }); map.jumpTo({ center: [-79.5622, 43.8197], zoom: 17.5 }); return true; })()`);
const agg = { n: 0, loaded: 0, idle: 0, pred: 0, firstCloneAt: 0, lastKey: '', tr: [] }; // DIAG3 (scratch only)
let S2 = { clone: [], orig: [] };
let settled = false, l7PrevKey = '', l7Streak = 0, l7Samples = 0;
const l7T0 = Date.now();
while (Date.now() - l7T0 < 60000) {
  l7Samples++;
  const s = await jread(`(() => JSON.stringify({
    loaded: map.loaded(),
    idle: (window.__l7idleAt || 0) > 0,
    zoom: Math.round(map.getZoom() * 100) / 100,
    ctr: map.getCenter().toArray().map(v => Math.round(v * 10000) / 10000),
    rtn: (() => { const f = map.getFilter('roads_labels_major-route'); const lit = f && f[2] && f[2][1]; return Array.isArray(lit) ? lit.length : -1; })(),
    clone: map.queryRenderedFeatures({ layers: ['roads_labels_major-route', 'roads_labels_minor-route'] }).map(f => f.properties.name),
    orig: map.queryRenderedFeatures({ layers: ['roads_labels_major', 'roads_labels_minor'] }).map(f => f.properties.name)
  }))()`).catch(() => null);
  if (s) {
    S2 = { clone: s.clone, orig: s.orig };
    const key = JSON.stringify([[...new Set(s.clone)].sort(), [...new Set(s.orig)].sort()]);
    const pred = s.clone.includes('Malden Street') && s.clone.includes('Cartwright Boulevard') && !s.orig.includes('Malden Street') && !s.orig.includes('Cartwright Boulevard');
    if (s.loaded && s.idle && pred && key === l7PrevKey) { l7Streak++; if (l7Streak >= 3) { settled = true; break; } }
    else { l7Streak = 0; l7PrevKey = key; }
    // DIAG3 instrumentation (scratch only): aggregates + set transitions
    agg.n++; if (s.loaded) agg.loaded++; if (s.idle) agg.idle++; if (pred) agg.pred++;
    if (s.clone.length && !agg.firstCloneAt) agg.firstCloneAt = Date.now() - l7T0;
    if (key !== agg.lastKey) { agg.lastKey = key; if (agg.tr.length < 40) agg.tr.push({ t: Date.now() - l7T0, loaded: s.loaded, idle: s.idle, zoom: s.zoom, ctr: s.ctr, rtn: s.rtn, clone: [...new Set(s.clone)].sort(), orig: [...new Set(s.orig)].sort() }); }
  }
  await sleep(400);
}
ok('L7 at close zoom the basemap names print on the clones only | clone ' + JSON.stringify(S2.clone) + ' orig ' + JSON.stringify(S2.orig) + ' | settle ' + (settled ? (Date.now() - l7T0) + 'ms' : 'NEVER') + ' samples ' + l7Samples,
  settled === true && S2.clone.includes('Malden Street') && S2.clone.includes('Cartwright Boulevard') && !S2.orig.includes('Malden Street') && !S2.orig.includes('Cartwright Boulevard'));

// Night: the clones are rebuilt per restack and wear the night lift.
await ev(`(() => { localStorage.setItem('snowroute.v2.night', '1'); localStorage.setItem('snowroute.v2.nightExp', '4102444800000'); location.reload(); return true; })()`); // Beta 1.77: a stored override carries its sun-boundary expiry with it
await sleep(3000);
await bootThrough(ev, poll, { pinTheme: false }); // Beta 1.76: the reload returns to the route menu - pick 5W so the engine rebuilds the clones under the night style; Beta 1.77: keep the seeded night override (no day pin)
ok('L8 night boot with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true && document.body.classList.contains('night')`, 30000));
const S3 = await jread(`(() => JSON.stringify({
  clone: !!map.getLayer('roads_labels_major-route'),
  col: map.getLayer('roads_labels_major-route') ? String(map.getPaintProperty('roads_labels_major-route', 'text-color')) : ''
}))()`);
ok('L7DIAG3 agg ' + JSON.stringify({ n: agg.n, loaded: agg.loaded, idle: agg.idle, pred: agg.pred, firstCloneAt: agg.firstCloneAt, transitions: agg.tr.length }), false);
const aggJson = JSON.stringify(agg.tr);
for (let c = 0; c * 1500 < aggJson.length && c < 10; c++) ok('L7DIAG3 trace[' + c + '] ' + aggJson.slice(c * 1500, (c + 1) * 1500), false);
ok('L9 night clones rebuilt with the lifted name colour | clone ' + S3.clone + ' color ' + S3.col, S3.clone === true && S3.col === '#ccd6df');

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

