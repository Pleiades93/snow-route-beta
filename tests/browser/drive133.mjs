import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive133: Beta 1.49 recording boundary (Andrew's rule, 2026-10-31).
// The Locate tab alone NEVER records route data: a view-only watch writes no
// trail and no coverage, while still showing the live dot. Recording belongs
// to a clean (Start Clean) and to its own GPS; pressing Locate during an
// open clean resumes that clean's recording; after the clean ends, Locate
// is view-only again.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
await sleep(3000);
ok('G0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`));
// (No clear+reload slate-wipe: the harness gives every drive a fresh browser
// profile, so storage starts empty - and a reload would stall the local
// rig's second boot without adding any isolation.)

await ev(`(() => { window.__wpOk = null; navigator.geolocation.watchPosition = (ok2) => { window.__wpOk = ok2; return 4242; }; navigator.geolocation.clearWatch = () => {}; return true; })()`);
const feed = async (lat, lng) => ev('window.__wpOk({ coords: { latitude: ' + lat + ', longitude: ' + lng + ', accuracy: 10, speed: 0, heading: null }, timestamp: Date.now() })'); // string concatenation, not a nested template substitution (drive126's pattern): the nested form inserts the literal text ${lat} into the page, where it is a syntax error and every feed silently dies
const march = async () => { for (const p of PTS) { await feed(p[0], p[1]); await sleep(130); } await sleep(500); };
const PTS = JSON.parse(await ev(`(() => { const L = STRETCH.Velmar.line; return JSON.stringify([12, 15, 18, 21, 24, 27].map(i => L[i])); })()`));
const state = async () => JSON.parse(await ev(`(() => JSON.stringify({ wid: watchId, run: gpsFromRun, clean: !!runStart, trail: trail.length, cov: Object.values(coveredIdx).reduce((a, s) => a + s.length, 0), kinds: ((map.getSource('gps') || {})._data || { features: [] }).features.map(f => f.properties.k) }))()`));

// Phase V: Locate only - live dot, zero recording.
await ev(`startGps(false)`);
await march();
let ST = await state();
ok('V1 view-only watch records no trail and no coverage | ' + JSON.stringify(ST), ST.wid === 4242 && ST.run === false && ST.clean === false && ST.trail === 0 && ST.cov === 0);
ok('V2 the live dot still shows in view-only mode | kinds ' + JSON.stringify(ST.kinds), ST.kinds.includes('dot'));

// Phase R: Start Clean on the already-running watch - recording begins.
await ev(`startClean()`);
await march();
ST = await state();
const trailAfterClean = ST.trail;
ok('R1 a clean records trail and coverage on the same watch | ' + JSON.stringify(ST), ST.run === true && ST.clean === true && ST.trail >= 6 && ST.cov > 0);
const drawn = JSON.parse(await ev(`(() => { const d = (map.getSource('trail') || {})._data || { features: [] }; return JSON.stringify(d.features.length); })()`));
ok('R2 the recorded trail is drawn | features ' + drawn, drawn >= 1);
const recOn = await ev(`$('gpsBtn').classList.contains('rec')`);
ok('R3 the Locate tab wears its recording face (red) when a clean starts on an already-running view-only watch (Beta 1.64, audit F06) | rec ' + recOn, recOn === true);

// Phase S: clean cancelled - Locate is view-only again, nothing more records.
await ev(`cancelStart()`);
await sleep(700);
await ev(`$('gpsBtn').click()`);
await sleep(300);
await march();
ST = await state();
ok('S1 after the clean, Locate is view-only and the trail does not grow | ' + JSON.stringify(ST) + ' was ' + trailAfterClean, ST.run === false && ST.clean === false && ST.trail === trailAfterClean);

// Phase M: Locate pressed during an open clean resumes that clean's GPS.
await ev(`startClean()`);
await ev(`stopGps()`);
await sleep(700);
await ev(`$('gpsBtn').click()`);
await sleep(300);
ST = await state();
ok('M1 Locate during an open clean resumes run GPS | ' + JSON.stringify(ST), ST.clean === true && ST.wid === 4242 && ST.clean === true);
await ev(`stopGps()`);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

