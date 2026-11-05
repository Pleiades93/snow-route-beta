import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive148: Beta 1.115 GPS follow + smoothness (Andrew's drive report 2026-11-05):
// (S) at 8 m/s with 1 Hz fixes the DISPLAYED dot must advance continuously between
// fixes (estimator prediction), not step once a second - measured on stepped fake
// clocks (drive127's method: the rig's real timers are too coarse to judge 50 ms
// sampling); (D) a real drag while following must SUSPEND the follow - camera
// stays where the user put it, dot keeps moving - and the re-centre button
// (top-right, below day/night, same 56 px) appears only in that state and resumes
// the follow; (R) heading-up during a run yields the same way, and the Locate tab
// also resumes from suspension. Pre-1.115 numbers (this drive, 2026-11-05): the
// dot sat still up to 784 ms of every 1 s between fixes on real clocks (stepped
// run: see work/gps-follow-smooth/), there was no re-centre button, and a mid-run
// dragend hauled the bearing back to north.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const MLNG = 80386, MLAT = 111320;
const hav = (a, b) => Math.hypot((b[0] - a[0]) * MLAT, (b[1] - a[1]) * MLNG);
const bDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
await sleep(2500);
ok('F0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));
await poll120(`!document.getElementById('splash')`, 20000);
const base = JSON.parse(await ev(`(() => { const part = STRETCH.Velmar.parts[0]; const mid = part[Math.floor(part.length / 2)]; return JSON.stringify({ lat: mid[0], lng: mid[1] }); })()`));
const centreBtnState = async () => J(`(() => { const b = $('centreBtn'); if (!b) return { exists: false }; const r = b.getBoundingClientRect(); const n = $('nightBtn').getBoundingClientRect(); const cs = getComputedStyle(b); return { exists: true, hidden: b.classList.contains('hidden') || cs.display === 'none', w: r.width, top: r.top, bottom: r.bottom, right: r.right, nBottom: n.bottom, nRight: n.right }; })()`);
let CB = await centreBtnState();
ok('V0 no re-centre button while location is off | ' + JSON.stringify(CB), CB.exists === true && CB.hidden === true);

// ---- S: smoothness at 8 m/s, 1 Hz fixes, on stepped clocks (drive127's method) ----
await ev(`(() => { window.__realDN = Date.now; window.__realPN = performance.now.bind(performance); window.__fakeT0 = Date.now(); window.__fakeNow = window.__fakeT0; const rp = performance.now(); Date.now = () => window.__fakeNow; performance.now = () => rp - 3600000 + (window.__fakeNow - window.__fakeT0); watchId = 4242; followPaused = false; window.__rec = []; return true; })()`);
const SAMPUSH = `if (dispPos) { const c = map.getCenter(); const pr = kfPredict(); window.__rec.push([window.__fakeNow - window.__fakeT0, (dispPos[1] - ${base.lng}) * ${MLNG}, (c.lng - ${base.lng}) * ${MLNG}, pr ? (pr[1] - ${base.lng}) * ${MLNG} : (dispPos[1] - ${base.lng}) * ${MLNG}]); }`;
const stepFeed = async (fixes, gapMs) => { for (const f of fixes) { await ev(`(() => { const end = window.__fakeNow + ${gapMs}; while (window.__fakeNow < end) { window.__fakeNow = Math.min(end, window.__fakeNow + 50); renderTick(performance.now()); ${SAMPUSH} } const f = ${JSON.stringify(f)}; acceptFix({ coords: { latitude: f[0], longitude: f[1], accuracy: 8, speed: 8, heading: 90 }, timestamp: Date.now() }); return true; })()`); await sleep(15); } };
const sFixes = [];
for (let i = 0; i < 10; i++) sFixes.push([base.lat, base.lng + (8 * i) / MLNG]);
await stepFeed(sFixes, 1000);
await ev(`(() => { const end = window.__fakeNow + 4000; while (window.__fakeNow < end) { window.__fakeNow = Math.min(end, window.__fakeNow + 50); renderTick(performance.now()); ${SAMPUSH} } return true; })()`);
const REC = JSON.parse(await ev(`JSON.stringify(window.__rec)`));
const win = REC.filter(s => s[0] > 3200 && s[0] < 10200);
let maxStretch = 0, maxStep = 0, camStretch = 0, predDev = 0, predDevLate = 0;
for (let i = 0; i < win.length; i++) { let j = i; while (j + 1 < win.length && Math.abs(win[j + 1][1] - win[i][1]) < 0.3) j++; maxStretch = Math.max(maxStretch, win[j][0] - win[i][0]); let k = i; while (k + 1 < win.length && Math.abs(win[k + 1][2] - win[i][2]) < 0.3) k++; camStretch = Math.max(camStretch, win[k][0] - win[i][0]); if (i) maxStep = Math.max(maxStep, Math.abs(win[i][1] - win[i - 1][1])); const pd = Math.abs(win[i][1] - win[i][3]); predDev = Math.max(predDev, pd); if (win[i][0] % 1000 >= 600 && win[i][0] % 1000 <= 950) predDevLate = Math.max(predDevLate, pd); }
ok('S1 the dot never sits still while moving at 8 m/s (max stationary stretch <= 250 ms) | measured ' + Math.round(maxStretch) + ' ms over ' + win.length + ' stepped samples', maxStretch <= 250);
ok('S2 no single-step jump over 2 m at 50 ms steps | measured ' + maxStep.toFixed(2) + ' m', maxStep <= 2);
ok('S3 the camera also glides (max stationary stretch <= 400 ms) | measured ' + Math.round(camStretch) + ' ms', camStretch <= 400);
ok('S4a the display faithfully renders the estimator predicted track: by late in each fix interval the correction offset has decayed away | late-interval deviation ' + predDevLate.toFixed(2) + ' m, peak deviation ' + predDev.toFixed(2) + ' m right after a fix (the estimator own truth lag at 1 Hz is drive127 S3 territory - its endpoint, not the display)', predDevLate < 1.5);
const SENDP2 = await J(`(() => ({ gps: gpsPos, fix: [${base.lat}, ${base.lng} + 72 / ${MLNG}] }))()`);
ok('S4c the estimator itself still arrives within its proven envelope: final gpsPos within 8 m of the final fix | err ' + (SENDP2.gps ? hav(SENDP2.gps, SENDP2.fix).toFixed(2) : 'n/a') + ' m', SENDP2.gps && hav(SENDP2.gps, SENDP2.fix) < 8);
const settle = REC.filter(s => s[0] >= 13200);
const sFirst = settle.length ? settle[0][1] : null, sLast = settle.length ? settle[settle.length - 1][1] : null;
ok('S4b when fixes stop, the coast is bounded by the 2.5 s horizon cap and then the dot is frozen (no runaway) | settled at ' + (sLast !== null ? sLast.toFixed(1) : 'n/a') + ' m east of a 72 m final fix, last-second drift ' + (sFirst !== null && sLast !== null ? Math.abs(sLast - sFirst).toFixed(2) : 'n/a') + ' m', sLast !== null && sLast <= 72 + 22 && Math.abs(sLast - sFirst) < 0.5);
await ev(`(() => { Date.now = window.__realDN; performance.now = window.__realPN; watchId = null; kf = null; gpsPos = null; dispPos = null; return true; })()`);
await sleep(300);

// ---- D: a real drag suspends the follow (real clocks, real startGps path) ----
await ev(`(() => { window.__wpOk = null; navigator.geolocation.watchPosition = (ok2) => { window.__wpOk = ok2; return 4242; }; navigator.geolocation.clearWatch = () => {}; window.__feed = { on: false, n: 0, lat: ${base.lat}, lng: ${base.lng}, speed: 8, heading: 90, acc: 8 }; window.__feedTimer = setInterval(() => { const f = window.__feed; if (!f.on || !window.__wpOk) return; f.n++; const e = f.speed * f.n; const rad = (90 - f.heading) * Math.PI / 180; const de = Math.cos(rad) * e, dn = Math.sin(rad) * e; window.__lastFix = [f.lat + dn / ${MLAT}, f.lng + de / ${MLNG}]; window.__wpOk({ coords: { latitude: window.__lastFix[0], longitude: window.__lastFix[1], accuracy: f.acc, speed: f.speed, heading: f.heading }, timestamp: Date.now() }); }, 1000); window.__dragEv = { start: 0, end: 0 }; map.on('dragstart', () => window.__dragEv.start++); map.on('dragend', () => window.__dragEv.end++); return true; })()`);
await ev(`(() => { startGps(false); window.__feed.on = true; return true; })()`);
const followReady = await poll120(`(() => { if (!gpsPos || !dispPos || followPaused) return false; const c = map.getCenter(); return Math.abs((c.lng - dispPos[1]) * ${MLNG}) < 25 && Math.abs((c.lat - dispPos[0]) * ${MLAT}) < 25; })()`, 25000); // CI runners deliver the first fixes late under load - never drag against a follow that has not engaged (the 2026-11-05 branch run's V2/D3/D4/D5 cascade was exactly that race)
ok('D0 the follow is engaged (dot live, camera centred) before the drag | ready ' + followReady, followReady === true);
CB = await centreBtnState();
ok('V1 no re-centre button while following normally | ' + JSON.stringify(CB), CB.hidden === true);
const preDrag = await J(`(() => { const c = map.getCenter(); return { lng: c.lng, lat: c.lat, paused: followPaused, dev: window.__dragEv }; })()`);
const cv = JSON.parse(await ev(`(() => { const r = map.getCanvas().getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); })()`));
const dragMouse = async (cx, cy, dx) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 }, S); const steps = Math.round(Math.abs(dx) / 24); for (let i = 1; i <= steps; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + Math.sign(dx) * i * 24, y: cy, button: 'left', buttons: 1 }, S); await sleep(85); } await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + dx, y: cy, button: 'left', buttons: 0, clickCount: 1 }, S); };
await dragMouse(cv.x, cv.y, -168);
await sleep(350);
const postDrag = await J(`(() => { const c = map.getCenter(); return { lng: c.lng, lat: c.lat, paused: followPaused, dev: window.__dragEv }; })()`);
const dragMovedM = hav([preDrag.lat, preDrag.lng], [postDrag.lat, postDrag.lng]);
ok('D1 the drag genuinely pans the map while following - well beyond the ~10 m the follow alone would drift in the drag window (the rig registers only part of any drag; the state teeth are D2/D3) | moved ' + dragMovedM.toFixed(0) + ' m, dragstart x' + (postDrag.dev ? postDrag.dev.start : '?'), dragMovedM > 25);
ok('D2 the drag suspends the follow | followPaused ' + postDrag.paused, postDrag.paused === true);
CB = await centreBtnState();
ok('V2 the re-centre button appears while suspended: 56 px, right-aligned with day/night, directly below it | ' + JSON.stringify(CB), CB.exists === true && CB.hidden === false && Math.abs(CB.w - 56) <= 1.5 && Math.abs(CB.right - CB.nRight) <= 2 && CB.top >= CB.nBottom + 3 && CB.top <= CB.nBottom + 22);
const dotBefore = await J(`dispPos`);
await sleep(3500); // 3+ more fixes land while suspended
const heldCam = await J(`(() => { const c = map.getCenter(); return { lng: c.lng, lat: c.lat, paused: followPaused }; })()`);
const dotAfter = await J(`dispPos`);
ok('D3 the camera stays where the user put it across 3 s of fixes | drift ' + hav([postDrag.lat, postDrag.lng], [heldCam.lat, heldCam.lng]).toFixed(1) + ' m', hav([postDrag.lat, postDrag.lng], [heldCam.lat, heldCam.lng]) < 25 && heldCam.paused === true);
ok('D4 the dot keeps moving while the camera is suspended | advanced ' + (dotBefore && dotAfter ? hav(dotBefore, dotAfter).toFixed(1) : 'n/a') + ' m', dotBefore && dotAfter && hav(dotBefore, dotAfter) > 15);
// resume via the Locate tab this time (spec: it also re-centres from suspension)
await ev(`$('gpsBtn').click()`);
await sleep(400);
const resumedTab = await J(`(() => ({ paused: followPaused, wid: watchId }))()`);
ok('D5 tapping Locate while suspended resumes the follow (GPS stays on) | ' + JSON.stringify(resumedTab), resumedTab.paused === false && resumedTab.wid !== null);
const recentred = await poll120(`(() => { if (!dispPos) return false; const c = map.getCenter(); return Math.abs((c.lng - dispPos[1]) * ${MLNG}) < 25 && Math.abs((c.lat - dispPos[0]) * ${MLAT}) < 25; })()`, 6000);
ok('D6 the camera eases back to the dot after resuming', recentred === true);
await ev(`(() => { window.__feed.on = false; return true; })()`);

// ---- R: heading-up during a run yields to a drag the same way ----
await ev(`(() => { const f = window.__feed; f.lat = ${base.lat}; f.lng = ${base.lng}; f.n = 0; f.heading = 90; return true; })()`);
await ev(`$('startBtn').click()`);
await sleep(600);
await ev(`(() => { window.__feed.on = true; return true; })()`);
await poll120(`(() => Math.abs(((map.getBearing() - 90 + 540) % 360) - 180) < 30)()`, 20000); // wait for heading-up to actually engage, however loaded the runner is
const B1 = await J(`(() => ({ b: map.getBearing(), run: !!runStart, paused: followPaused, smH: smHeading, fromRun: gpsFromRun }))()`);
ok('R1 heading-up engages during a run (bearing chases the 90 deg course) | ' + JSON.stringify(B1), B1.run === true && bDiff(B1.b, 90) < 30);
await dragMouse(cv.x, cv.y, -132);
await sleep(700);
const BD = await J(`(() => ({ b: map.getBearing(), paused: followPaused }))()`);
ok('R2 a drag mid-run suspends the follow and the bearing is NOT hauled back to north on release | bearing ' + (BD.b || 0).toFixed(0) + ' (was ' + (B1.b || 0).toFixed(0) + '), paused ' + BD.paused, BD.paused === true && bDiff(BD.b, B1.b) < 18);
CB = await centreBtnState();
ok('V3 the re-centre button is also offered mid-run while suspended | hidden ' + CB.hidden, CB.exists === true && CB.hidden === false);
await ev(`(() => { window.__feed.heading = 180; const f = window.__feed; const lf = window.__lastFix; f.lat = lf[0]; f.lng = lf[1]; f.n = 0; return true; })()`);
await sleep(3200);
const B2 = await J(`(() => ({ b: map.getBearing() }))()`);
ok('R3 while suspended, heading-up does not chase a new course | bearing ' + (B2.b || 0).toFixed(0) + ' vs held ' + (BD.b || 0).toFixed(0), bDiff(B2.b, BD.b) < 15);
const cbPt2 = await J(`(() => { const b = $('centreBtn'); if (!b) return { x: 210, y: 100, missing: true }; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cbPt2.x, y: cbPt2.y, button: 'left', buttons: 1, clickCount: 1 }, S);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cbPt2.x, y: cbPt2.y, button: 'left', buttons: 0, clickCount: 1 }, S);
await sleep(3600);
const B3 = await J(`(() => ({ b: map.getBearing(), paused: followPaused }))()`);
ok('R4 after re-centre, heading-up re-engages toward the new course | bearing ' + (B3.b || 0).toFixed(0) + ', paused ' + B3.paused, B3.paused === false && bDiff(B3.b, 180) < 35);
await ev(`(() => { window.__feed.on = false; stopGps(); return true; })()`);
CB = await centreBtnState();
ok('V4 the re-centre button is gone once location is off | ' + JSON.stringify(CB), CB.hidden === true);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
