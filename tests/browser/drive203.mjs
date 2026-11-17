import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive203 (SESSION tier): Beta 1.220 - the puck's direction beam rotates at FRAME
// RATE (Andrew's field report: forward motion and the camera glide were smooth, but
// the puck's own rotation stepped about once a second, at the GPS fix rate). The
// beam's painted rotation (the gps source's beam feature 'rot') is now a spring
// (beamDeg) chasing the heading of record (facingDeg) per frame; facingDeg itself,
// the recorded position and the camera are untouched.
// Proven here by replaying a turn the way a real drive delivers it: fixes at 1 Hz
// whose headings step 0 -> 30 -> 60 -> 90 -> 90 (setFacing blends each fix halfway,
// so the heading of record itself walks up in fix-sized steps). The painted rot is
// sampled every 50 ms for the whole manoeuvre. On the unmodified base the painted
// rot IS facingDeg, so the samples move only when a fix lands - a handful of
// distinct values, and frozen the moment the fixes stop - and T2/T3 fail there
// by construction. Here the spring must fill the gaps: many intermediate
// angles, a continued sweep after the last fix, and the beam landing on the
// final heading once the fixes converge.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

await sleep(1500);
ok('T0 app boots with the map active', await poll(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// a fix on Velmar facing north, then the sampler, then the turning fixes at 1 Hz
const base = await J(`(() => { const part = STRETCH.Velmar.parts[0]; const mid = part[Math.floor(part.length / 2)]; return { lat: mid[0], lng: mid[1] }; })()`);
await ev(`(() => { watchId = 4242; followPaused = true; return true; })()`);
const feed = (lat, lng, hdg) => ev(`(() => { (window.__fixT = window.__fixT || []).push(performance.now()); acceptFix({ coords: { latitude: ${lat}, longitude: ${lng}, accuracy: 5, speed: 3, heading: ${hdg} }, timestamp: Date.now() }); return true; })()`);
await feed(base.lat, base.lng, 0);
await sleep(800); // the beam starts ON the first heading (no sweep from nothing)
const start = await J(`(() => { const f = ((map.getSource('gps') || {})._data || { features: [] }).features.find(f => f.properties.k === 'beam'); return { rot: f ? f.properties.rot : null, facing: facingDeg }; })()`);
ok('T1 the beam paints the first heading before the turn (rot 0, facing 0)', start.rot === 0 && start.facing === 0);

// the turn replay: fixes land on their 1 Hz schedule from here, and the painted
// sequence is recorded PAGE-SIDE by wrapping pushGps itself - every call is one
// paint of the gps source, so the log is the painted rotation at the app's own
// cadence (page timers and CDP polling both starve in a headless window; the
// paint path cannot). Fix times ride the same performance.now clock.
await ev(`(() => { window.__paint = []; const orig = pushGps;
  pushGps = function () { const r = orig.apply(this, arguments);
    const f = ((map.getSource('gps') || {})._data || { features: [] }).features.find(f => f.properties.k === 'beam');
    window.__paint.push([Math.round(performance.now()), f ? f.properties.rot : null]); return r; };
  return true; })()`);
const FEEDS = [[30], [60], [90], [90], [90], [90], [90], [90]];
for (let fi = 0; fi < FEEDS.length; fi++) {
  await feed(base.lat + 0.00003 * (fi + 1), base.lng, FEEDS[fi][0]);
  await sleep(1000);
}
await sleep(5000);
const S = await J(`(() => ({ rots: window.__paint, facing: facingDeg, fixT: window.__fixT || [] }))()`);
const vals = (S.rots || []).map(r => r[1]).filter(v => v != null);
const distinct = [...new Set(vals.map(v => Math.round(v * 10) / 10))];
let maxStep = 0;
for (let i = 1; i < vals.length; i++) { let d = Math.abs(vals[i] - vals[i - 1]); if (d > 180) d = 360 - d; if (d > maxStep) maxStep = d; }
const changed = vals.filter((v, i) => i > 0 && v !== vals[i - 1]).length;
ok('T2 the painted rotation takes INTERMEDIATE angles during the turn (no 1 Hz staircase) | paints ' + vals.length + ', distinct ' + distinct.length + ', changed ' + changed,
  vals.length >= 25 && distinct.length >= 10 && changed >= 10);
// the settle test: after the LAST fix the heading of record never moves again,
// so on the base the painted rotation is frozen from that moment (it IS the
// heading of record). On the fixed tree the spring keeps sweeping toward the
// final heading for seconds after the last fix lands.
const srows = (S.rots || []).filter(r => r[1] != null);
const lastFix = S.fixT[S.fixT.length - 1];
const settle = srows.filter(r => r[0] > lastFix + 300);
const settleDistinct = [...new Set(settle.map(r => Math.round(r[1] * 10) / 10))];
ok('T3 after the last fix lands, the painted rotation KEEPS SWEEPING toward the final heading (on the base it is frozen from that moment by construction) | settle paints ' + settle.length + ', distinct ' + settleDistinct.length + ', max step ' + maxStep.toFixed(1),
  settle.length >= 3 && settleDistinct.length >= 3 && maxStep <= 60);
const last = vals[vals.length - 1];
ok('T4 the beam lands on the final heading and the heading of record converged on it | last rot ' + last + ', facing ' + S.facing,
  Math.abs(S.facing - 90) <= 2 && Math.abs(last - S.facing) <= 5);
const rec = await J(`(() => gpsPos ? { lat: gpsPos[0], lng: gpsPos[1] } : null)()`);
ok('T5 the recorded position stands on the fed fixes (presentation never moved it) | gpsPos ' + JSON.stringify(rec),
  !!rec && Math.abs(rec.lng - base.lng) < 0.0002 && Math.abs(rec.lat - (base.lat + 0.00024)) < 0.0002);
await ev(`(() => { stopGps(); return true; })()`);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
ok('Z: zero page exceptions across the whole drive', R.exceptions.length === 0);
finish(R, proc);
