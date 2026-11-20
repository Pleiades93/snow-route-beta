import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive207: Beta 1.252 GPS session accounting (cross-audit fix round 3,
// R-01). The stale-GPS watchdog used to judge silence from lastFixAt
// alone, a stamp neither stopGps nor startGps ever reset - so it held
// the last accepted fix of an EARLIER session, and a watch started
// more than GPS_STALE_MS (45 s) after that fix was torn down at the
// watchdog's first 15 s tick and every tick after, until a fix landed
// within one tick of a restart. The watchdog now measures silence
// from the later of the last accepted fix and the current watch's own
// start (watchStartedAt). This drive grades the boundary in the real
// app, on real clocks (the watchdog's own 15 s interval is the clock
// under test): (B1) an hour-old previous fix + a fresh start + no fix
// coming = NO restart inside the first window - on the 1.251 tree the
// first tick restarts the watch and B1 fails; (B2) with no fix at
// all, exactly one restart lands, and only after the stale window;
// (B3) that restart buys a full window of its own (no second restart
// on the tick cadence - the restart records a new session start);
// (B4) control: the live-fix stale path still fires when a live
// watch's fix ages out (drive148's method), so the cure cannot have
// neutered the watchdog.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

await sleep(2500);
ok('F0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));
await poll120(`!document.getElementById('splash')`, 20000);
const base = JSON.parse(await ev(`(() => { const part = STRETCH.Velmar.parts[0]; const mid = part[Math.floor(part.length / 2)]; return JSON.stringify({ lat: mid[0], lng: mid[1] }); })()`));

// The GPS stub (drive148's pattern) with a watchPosition call counter -
// a watchdog restart is a new watchPosition call, so the counter IS the
// restart ledger.
await ev(`(() => { window.__wpCalls = 0; window.__wpOk = null; navigator.geolocation.watchPosition = (ok2) => { window.__wpCalls++; window.__wpOk = ok2; return 4242; }; navigator.geolocation.clearWatch = () => {}; window.__feed = { on: false, lat: ${base.lat}, lng: ${base.lng} }; window.__feedTimer = setInterval(() => { const f = window.__feed; if (!f.on || !window.__wpOk) return; window.__wpOk({ coords: { latitude: f.lat, longitude: f.lng, accuracy: 8, speed: 2, heading: 90 }, timestamp: Date.now() }); }, 1000); return true; })()`);

// ---- session 1: a fix lands, then the watch stops ----
await ev(`(() => { startGps(false); window.__feed.on = true; return true; })()`);
const s1Fix = await poll120(`lastFixAt > 0`, 20000);
await ev(`(() => { window.__feed.on = false; stopGps(); return true; })()`);
ok('S0 setup: the first session took a fix and stopped clean', s1Fix === true);

// ---- B1: an hour later, a fresh start must survive its first window ----
await ev(`(() => { lastFixAt = Date.now() - 3600000; return true; })()`); // the previous session's fix, aged an hour
const t0 = Date.now();
await ev(`(() => { startGps(false); return true; })()`); // feed stays OFF - no fix is coming
const calls0 = await J(`window.__wpCalls`);
await sleep(34000); // past two watchdog ticks (15 s each), inside the 45 s window
const b1 = await J(`(() => ({ calls: window.__wpCalls, wid: watchId }))()`);
ok('B1 a fresh watch with an hour-old previous fix is NOT restarted inside its first window | calls ' + calls0 + ' -> ' + b1.calls + ', watch live ' + (b1.wid != null), b1.calls === calls0 && b1.wid != null);

// ---- B2/B3: the deadline still bites - once, after the window, with a full window of its own ----
const restarted = await poll120(`window.__wpCalls > ${calls0}`, 45000);
const tRestart = Date.now();
const callsAfter = await J(`window.__wpCalls`);
ok('B2 with no fix at all, a restart lands only AFTER the stale window | elapsed ' + (tRestart - t0) + ' ms', restarted === true && (tRestart - t0) >= 43000 && callsAfter === calls0 + 1);
await sleep(34000); // two more ticks inside the restarted watch's own window
const b3 = await J(`window.__wpCalls`);
ok('B3 the restart bought a full window of its own - no second restart on the tick cadence | calls ' + b3, b3 === calls0 + 1);

// ---- B4 control: an aged LIVE fix still triggers the stale restart ----
await ev(`(() => { stopGps(); startGps(false); window.__feed.on = true; return true; })()`);
const s3Fix = await poll120(`lastFixAt > Date.now() - 10000`, 20000);
await ev(`(() => { window.__feed.on = false; return true; })()`);
const calls4 = await J(`window.__wpCalls`);
await ev(`(() => { lastFixAt = Date.now() - 60000; watchStartedAt = Date.now() - 120000; return true; })()`); // age BOTH stamps: the watch itself is two minutes old and its last fix is a minute old - ageing lastFixAt alone is no longer staleness under the session rule (a young watch's silence cannot exceed its own age, which is the fix working, not the watchdog asleep)
const restarted4 = await poll120(`window.__wpCalls > ${calls4}`, 30000);
ok('B4 control: a live watch whose fix ages past the stale window still restarts | setup fix ' + s3Fix + ', restarted ' + restarted4, s3Fix === true && restarted4 === true);
await ev(`(() => { stopGps(); return true; })()`);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
