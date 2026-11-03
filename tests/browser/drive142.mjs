import { readFileSync } from 'node:fs';
import { launchDrive, finish } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120 } = await launchDrive();



// drive118: audit remediation regression suite (spec 2026-10-29). Covers the gaps the older drives do not:
// invalid coverage indexes (F-2), invalid GPS fixes (G-1), coverage suggestion behaviour incl. parallel
// streets (spec GPS), restore write failure + rollback (suite 5), failed rollback verification (suite 6),
// invalid nested history (suite 3), current-format backup round-trip (suite 1), failed history write at
// finish (suite 11), partial multi-key save consistency (suite 12).
// drive142: Beta 1.69 audit fixes (two external audits of 1.66, adjudicated 2026-11-02).
// T1: exactly ONE startRenderLoop declaration exists in the shipped source (the
// duplicate silently disabled the starvation pump in 1.65-1.68), and the trail /
// honesty call sites the audits required are present in their function bodies.
// T2: with animation frames BLOCKED, the 100 ms pump alone advances the glide.
// T3: a queued callback from a stopped watcher is ignored (generation tag, N04).
// T4: Cancel Start reports a storage failure honestly instead of claiming success (N03).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const src = readFileSync(new URL('../../src/tracker-source.html', import.meta.url), 'utf8');
const bodyOf = (name, next) => { const i = src.indexOf('function ' + name); const j = src.indexOf('function ' + next, i + 10); return i >= 0 && j > i ? src.slice(i, j) : ''; };
ok('T1a exactly one startRenderLoop declaration in the shipped source | count ' + (src.split('function startRenderLoop').length - 1), (src.split('function startRenderLoop').length - 1) === 1);
ok('T1b finishRun / doUndo / cancelStart each force a trail redraw | finish ' + bodyOf('finishRun', 'performReset').includes('drawTrail(true)') + ' undo ' + bodyOf('doUndo', 'checkStale').includes('drawTrail(true)') + ' cancel ' + bodyOf('cancelStart', 'clearAllMarks').includes('drawTrail(true)'), bodyOf('finishRun', 'performReset').includes('drawTrail(true)') && bodyOf('doUndo', 'checkStale').includes('drawTrail(true)') && bodyOf('cancelStart', 'clearAllMarks').includes('drawTrail(true)'));
ok('T0 app script and map object are live (the 1.69 mechanics need the script + map, not tile completion - glOk boot coverage lives in drives 124/126)', await poll120(`typeof map !== 'undefined' && !!map && typeof startGps === 'function' && typeof cancelStart === 'function'`, 90000));
const base = JSON.parse(await ev(`(() => { const L = STRETCH.Velmar.line; return JSON.stringify(L[Math.floor(L.length / 2)]); })()`));
const feed142 = async (lat, lng) => ev('window.__wpOk({ coords: { latitude: ' + lat + ', longitude: ' + lng + ', accuracy: 10, speed: 3, heading: 90 }, timestamp: Date.now() })');
// T3: watcher generation - a live callback works; after stopGps the SAME callback is dead.
await ev(`(() => { window.__wpOk = null; navigator.geolocation.watchPosition = (ok) => { window.__wpOk = ok; return 4242; }; navigator.geolocation.clearWatch = () => {}; startGps(false); return true; })()`);
await feed142(base[0], base[1]); await sleep(300);
const liveTs = await ev(`lastFixTs`);
await ev(`(() => { stopGps(); return true; })()`);
await sleep(120);
await feed142(base[0], base[1] + 0.002); await sleep(300);
const afterTs = await ev(`lastFixTs`);
ok('T3 a queued callback from the stopped watcher is ignored even with a fresh timestamp | live ' + liveTs + ' after-stop ' + afterTs, liveTs > 0 && afterTs === liveTs);
// T2: starvation - block animation frames entirely; the pump must advance the glide alone.
await ev(`(() => { startGps(false); return true; })()`);
await feed142(base[0], base[1]); await sleep(800);
await ev(`(() => { window.__realRaf = window.requestAnimationFrame; window.requestAnimationFrame = () => 990001; return true; })()`);
await sleep(250);
await feed142(base[0], base[1] + 0.0037);
const d0 = await ev(`distM(dispPos, [` + base[0] + `, ` + (base[1] + 0.0037) + `])`);
await sleep(1100);
const st = JSON.parse(await ev(`(() => JSON.stringify({ d: distM(dispPos, [` + base[0] + `, ` + (base[1] + 0.0037) + `]), pump: renderPump !== 0 }))()`));
ok('T2 with animation frames blocked, the starvation pump advances the glide on its own | from ' + Math.round(d0) + 'm to ' + Math.round(st.d) + 'm, pump armed ' + st.pump, st.pump === true && d0 > 150 && st.d < d0 * 0.45);
await ev(`(() => { window.requestAnimationFrame = window.__realRaf; stopGps(); return true; })()`);
await sleep(200);
// T4: Cancel Start honesty - break storage, cancel, read the message.
await ev(`(() => { runStart = Date.now(); saveAll(); window.__realLsSet = lsSet; lsSet = () => false; return true; })()`);
await ev(`(() => { cancelStart(); return true; })()`);
const t4 = JSON.parse(await ev(`(() => JSON.stringify({ toast: $('toast').textContent, mem: runStart }))()`));
await ev(`(() => { lsSet = window.__realLsSet; return true; })()`);
ok('T4 Cancel Start with storage broken warns instead of claiming success | ' + JSON.stringify(t4), t4.mem === 0 && t4.toast.indexOf('could not be saved') >= 0);
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);

