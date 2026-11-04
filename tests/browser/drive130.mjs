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
await ev(`(() => { map.jumpTo({ center: [-79.5622, 43.8197], zoom: 17.5 }); return true; })()`);
const settled = await poll120(`(() => { const c = map.queryRenderedFeatures({ layers: ['roads_labels_major-route', 'roads_labels_minor-route'] }).map(f => f.properties.name); return c.includes('Malden Street') && c.includes('Cartwright Boulevard'); })()`, 25000);
const S2 = await jread(`(() => JSON.stringify({
  clone: map.queryRenderedFeatures({ layers: ['roads_labels_major-route', 'roads_labels_minor-route'] }).map(f => f.properties.name),
  orig: map.queryRenderedFeatures({ layers: ['roads_labels_major', 'roads_labels_minor'] }).map(f => f.properties.name)
}))()`);
ok('L7 at close zoom the basemap names print on the clones only | clone ' + JSON.stringify(S2.clone) + ' orig ' + JSON.stringify(S2.orig),
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
ok('L9 night clones rebuilt with the lifted name colour | clone ' + S3.clone + ' color ' + S3.col, S3.clone === true && S3.col === '#ccd6df');

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

