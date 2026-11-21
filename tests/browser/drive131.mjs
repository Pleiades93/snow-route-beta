import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive131: the street-name rule (Andrew's decision, 2026-11-20; Beta 1.258): the
// MAP'S OWN names - the app's own titles are retired and the basemap's native
// road labels name every street, route streets included (drive130 grades the
// rendered rule; W4 below pins that the retirement survives the constructor).
// Beta 1.261 addendum (Andrew's label-mix decision, the same evening): below
// zoom 15 the app titles are restored (capped there) and the basemap major
// layer is split at 15 with the route-name exclusion on its '-pre15' copy -
// W4 flips: the titles and their source are present again after the
// constructor runs, and the 1.208 route clones stay retired.
// Day
// basemap road names are restyled dark for readability; our old line-following
// labels are retired; the West link reference line no longer draws. The L4
// rendered-feature check is the one that would have caught the Beta 1.33-era clash, where the exclusion filter was
// silently rejected and basemap names printed on route streets at every zoom.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
ok('W0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// W1-W3: the Beta 1.41 constructor values are actually in force (read from the live
// map, not the source text). fadeDuration and the cache sizes have no public getter
// in MapLibre 4.7.1, so the checks read the library's own fields - pinned to this
// library version on purpose; if a future upgrade renames them, this drive says so.
// Beta 1.77: a basemap switch now rebuilds the style in full ({ diff: false }), and
// the boot's theme pin is such a switch - wait for the rebuilt style's tile source
// to exist before reading its fields, or the read can land inside the rebuild.
await poll120(`!!(map.style && map.style.sourceCaches && map.style.sourceCaches.protomaps)`, 20000);
const W = JSON.parse(await ev(`(() => { const sc = map.style && map.style.sourceCaches && map.style.sourceCaches.protomaps; return JSON.stringify({ pr: (typeof map.getPixelRatio === 'function') ? map.getPixelRatio() : null, fade: map._fadeDuration, mcs: sc ? sc._maxTileCacheSize : null, mcz: sc ? sc._maxTileCacheZoomLevels : null, clone: !!map.getLayer('roads_labels_major-route') }); })()`));
ok('W1 canvas pixel ratio is capped at 2 | ' + JSON.stringify(W), W.pr === 2);
ok('W2 tile fade duration is 200ms (tiles melt in, no snap) | fade=' + W.fade, W.fade === 200);
ok('W3 tile cache sized for a zoom sweep and back (200 tiles / 6 zoom levels) | ' + W.mcs + '/' + W.mcz, W.mcs === 200 && W.mcz === 6);
const W4 = JSON.parse(await ev(`(() => JSON.stringify({ titlesHere: !!map.getLayer('streetnamespt1') && !!map.getSource('labelpts'), clone: !!map.getLayer('roads_labels_major-route') }))()`));
ok('W4 the label rule survived the new constructor (Beta 1.261: app titles and their source restored under the zoom-15 cap, route clones retired in Beta 1.208)', W4.titlesHere === true && W4.clone === false);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

