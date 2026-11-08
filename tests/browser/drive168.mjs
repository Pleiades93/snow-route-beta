import { launchDrive, finish, bootThrough } from './harness.mjs';
// drive168: Beta 1.146 (state-machine census C4) - in the MAP-FAILURE world a
// run must still RECORD. The MapLibre script request is failed at the network
// layer (the harness's failWhen seam, drive115's machinery), so bootMap throws
// on the missing constructor, __tailDone stays latched, map stays null - and
// the app still arms, loads the route and starts GPS. Before 1.146 the fix
// path then threw per fix (acceptFix's unguarded first-fix map.jumpTo before
// the trail block; followCam's map.getCanvas via renderTick from fix 2 on;
// headCam's map.getBearing) and ZERO trail/coverage was recorded. The guards
// (northUp/pushGps idiom: if (!map) return / map &&) must let recording
// proceed with map === null. GPS is fed through the drive126/133 geolocation
// stub: watchPosition's own callback is captured and driven with fixes laid
// exactly on one street's coverage samples.
const { proc, ev, consoleLog, sleep, poll } = await launchDrive({ failWhen: u => u.includes('maplibre-gl') && u.includes('.js') });
await bootThrough(ev, poll);

const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const exc = () => consoleLog.filter(c => c.type === 'EXCEPTION');
const state = async () => JSON.parse(await ev(`JSON.stringify({ mapNull: typeof map !== 'undefined' && map === null, gl: typeof window.maplibregl, run: runStart, wid: watchId, fromRun: gpsFromRun, trail: trail.length, covStreets: Object.keys(coveredIdx).length, covPts: Object.values(coveredIdx).reduce((a, s) => a + s.length, 0), gpsPos: !!gpsPos })`));

try {
  const w = await state();
  ok('W1 the map-failure world is real: the MapLibre script never loaded and map is null, yet the route loaded | ' + JSON.stringify(w), w.mapNull === true && w.gl === 'undefined');
  const bootExc = exc().length;
  ok('W2 the world\'s defining failure is on record: bootMap\'s throw was captured as a page exception (baseline for the no-new-exceptions checks below) | baseline ' + bootExc, bootExc >= 1);
  await ev(`(() => { window.__wpOk = null; navigator.geolocation.watchPosition = (ok2) => { window.__wpOk = ok2; return 4242; }; navigator.geolocation.clearWatch = () => {}; return true; })()`);
  await ev(`startClean(); true`); await sleep(300);
  let st = await state();
  ok('S1 a run starts in the map-failure world: run live, the watch is the stub\'s, GPS owns recording | ' + JSON.stringify(st), st.run > 0 && st.wid === 4242 && st.fromRun === true);
  // Feed 8 fixes along Velmar's own coverage samples (15 m apart, accuracy 5 m,
  // moving with a course so updateHeading/headCam state is live too).
  const pts = JSON.parse(await ev(`JSON.stringify(SAMPLES.Velmar.slice(0, 8))`));
  ok('S2 the feed fixture is real: 8 coverage samples for Velmar', Array.isArray(pts) && pts.length === 8);
  const t0 = Date.now();
  for (let i = 0; i < pts.length; i++) {
    await ev(`window.__wpOk({ coords: { latitude: ${pts[i][0]}, longitude: ${pts[i][1]}, accuracy: 5, speed: 2, heading: 90 }, timestamp: ${t0 + i * 1000} }); true`);
    await sleep(60);
  }
  st = await state();
  const cov1 = st.covPts;
  ok('A1 trail RECORDS with no map: every fed fix appended a trail point (8 fed, ' + st.trail + ' recorded) | ' + JSON.stringify(st), st.trail >= 8 && st.gpsPos === true);
  ok('A2 coverage RECORDS with no map: Velmar gained covered samples across the fed fixes (' + st.covPts + ' covered points over ' + st.covStreets + ' street(s)) - the count trails the fix count by design: coverage consumes the FILTERED estimate (kfUpdate), not the raw fed point, so the first fixes settle the filter before samples start landing inside the 22 m radius', st.covPts >= 5 && st.covStreets >= 1);
  ok('A3 no fix threw: the page-exception count is unchanged since the boot baseline (' + bootExc + ' -> ' + exc().length + ')', exc().length === bootExc);
  // A second burst keeps recording (the followCam/headCam throw was a fix-2+ failure).
  const pts2 = JSON.parse(await ev(`JSON.stringify(SAMPLES.Velmar.slice(8, 12))`));
  for (let i = 0; i < pts2.length; i++) {
    await ev(`window.__wpOk({ coords: { latitude: ${pts2[i][0]}, longitude: ${pts2[i][1]}, accuracy: 5, speed: 2, heading: 90 }, timestamp: ${t0 + (8 + i) * 1000} }); true`);
    await sleep(60);
  }
  st = await state();
  ok('A4 recording CONTINUES across later fixes: trail and coverage both grew again | ' + JSON.stringify(st), st.trail >= 12 && st.covPts > cov1 && exc().length === bootExc);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
// The result block's exceptions are the exceptions DURING the recording
// scenario: bootMap's own throw is the simulated world's defining event - it
// is asserted as the baseline in W2 and A3/A4 pin that the count never grew.
R.exceptions = exc().slice(1).map(c => String(c.text || '').slice(0, 220));
finish(R, proc);
