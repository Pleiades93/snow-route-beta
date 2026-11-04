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
ok('W4 the label handover survived the new constructor (route clones present)', await poll120(`!!map.getLayer('roads_labels_major-route')`, 20000));

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

