import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive127: Beta 1.28 GPS smoothness (Andrew: the dot jitters and jagged-steps at slow
// speed). The Kalman position filter must keep a noisy stationary dot still, walk a
// slow drift inside a tight corridor with no teleports or reversals, and still track
// real driving speed without lag. Every check measures the displayed path itself.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
await sleep(3000);
ok('F0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// deterministic pseudo-noise (metres, [east, north]) - fixed table, no RNG, so a CI
// failure reproduces exactly. First entry is (0,0): the filter initialises on truth.
const NOISE = [[0,0],[5,-3],[-6,2],[3,6],[-2,-6],[7,1],[-5,-4],[1,7],[-7,-1],[4,-5],[-3,3],[6,5],[-1,-7],[2,2],[-4,6],[5,-2]];
const base = JSON.parse(await ev(`(() => { const part = STRETCH.Velmar.parts[0]; const mid = part[Math.floor(part.length / 2)]; return JSON.stringify({ lat: mid[0], lng: mid[1] }); })()`));
const M = (e, n) => [base.lat + n / 111320, base.lng + e / 80386];
// Flake hardening (2026-11-02, v2): the S-metrics integrate the displayed path
// over time, and both clocks that path runs on - Date.now inside the estimator
// and the render loop's frame clock - were the test machine's real wall clock,
// so the integrals straddled their lines under load (S2 backtrack printed
// 1.49-1.55 m across runs of IDENTICAL code; it failed the 1.71 branch run at
// 1.52). The page's clocks are now stepped exactly, 50 ms at a time, with a
// render tick and a position sample at every step: Date.now advances exactly
// gapMs between fixes, and the glide/camera machinery experiences the same
// flow of time it would on a real phone, just quantized. (v1 of this fix froze
// the frame clock between fixes, so glides never completed and S3 read a
// permanently mid-glide dot - err 8.51 m. The stepping is the fix.) Same
// fixes, same noise table, same thresholds - the only thing removed is the
// machine's mood.
await ev(`(() => { watchId = 4242; followPaused = false; window.__fakeT0 = Date.now(); window.__fakeNow = window.__fakeT0; const rp = performance.now(); Date.now = () => window.__fakeNow; performance.now = () => rp - 3600000 + (window.__fakeNow - window.__fakeT0); window.__rec = []; window.__recT = 0; return true; })()`);
const feedAll = async (fixes, gapMs) => { for (const f of fixes) { await ev(`(() => { const f = ${JSON.stringify(f)}; const end = window.__fakeNow + ${gapMs}; while (window.__fakeNow < end) { window.__fakeNow = Math.min(end, window.__fakeNow + 50); renderTick(performance.now()); if (dispPos) window.__rec.push([dispPos[0], dispPos[1]]); } acceptFix({ coords: { latitude: f[0], longitude: f[1], accuracy: f[2], speed: f[3], heading: 90 }, timestamp: Date.now() }); return true; })()`); await sleep(20); } await ev(`(() => { const end = window.__fakeNow + 2000; while (window.__fakeNow < end) { window.__fakeNow = Math.min(end, window.__fakeNow + 50); renderTick(performance.now()); if (dispPos) window.__rec.push([dispPos[0], dispPos[1]]); } return true; })()`); };
const recLen = async () => ev(`window.__rec.length`);
const hav = (a, b) => Math.hypot((b[0]-a[0]) * 111320, (b[1]-a[1]) * 80386); // flat-earth at route latitude (MLNG is already the local value)

// ---- S1: stationary under noise - the dot must stay put ----
const s1fixes = NOISE.map(([e, n]) => { const ll = M(e, n); return [ll[0], ll[1], 12, 0]; });
const s1start = await recLen();
await feedAll(s1fixes, 300); await sleep(1800);
const s1 = JSON.parse(await ev(`JSON.stringify(window.__rec.slice(${s1start}))`));
const P = [base.lat, base.lng];
let s1max = 0, s1path = 0;
for (let i = 0; i < s1.length; i++) { s1max = Math.max(s1max, hav(P, s1[i])); if (i) s1path += hav(s1[i-1], s1[i]); }
ok('S1 a stationary dot under +-7 m fix noise stays within 3 m of truth | max ' + s1max.toFixed(2) + ' m over ' + s1.length + ' samples', s1max < 3);
ok('S1 the displayed path barely moves while stationary (no wander-walk) | path ' + s1path.toFixed(2) + ' m', s1path < 25);

// ---- S2: slow drift 1.2 m/s east under noise - tight corridor, no steps, no reversals ----
const s2fixes = [];
for (let i = 0; i < 40; i++) { const [ne, nn] = NOISE[i % NOISE.length]; const ll = M(i * 0.36 + ne * 0.7, nn * 0.7); s2fixes.push([ll[0], ll[1], 10, 1.2]); }
const s2start = await recLen();
await feedAll(s2fixes, 300); await sleep(1200);
const s2 = JSON.parse(await ev(`JSON.stringify(window.__rec.slice(${s2start}))`));
let s2lat = 0, s2step = 0, s2back = 0, s2maxE = -1e9;
for (let i = 0; i < s2.length; i++) {
  const e = (s2[i][1] - base.lng) * 80386, n = Math.abs((s2[i][0] - base.lat) * 111320);
  s2lat = Math.max(s2lat, n);
  if (i) { s2step = Math.max(s2step, hav(s2[i-1], s2[i])); if (e < s2maxE) s2back = Math.max(s2back, s2maxE - e); }
  s2maxE = Math.max(s2maxE, e);
}
const s2end = JSON.parse(await ev(`JSON.stringify(gpsPos)`));
const s2err = hav(M(14.04, 0), s2end);
ok('S2 slow drift stays in a 4 m corridor | max lateral ' + s2lat.toFixed(2) + ' m', s2lat < 4);
ok('S2 no teleports: max 100 ms step under 2.5 m | max ' + s2step.toFixed(2) + ' m', s2step < 2.5);
ok('S2 no jagged reversals: never backs up more than 1.5 m | max backtrack ' + s2back.toFixed(2) + ' m', s2back < 1.5);
ok('S2 the estimate still arrives: within 5 m of the true endpoint after 14 m at 1.2 m/s | err ' + s2err.toFixed(2) + ' m', s2err < 5);

// ---- S3: real driving speed - the filter must not lag ----
const s3fixes = [];
for (let i = 0; i < 20; i++) { const ll = M(14.04 + i * 2.4, 0); s3fixes.push([ll[0], ll[1], 8, 8]); }
await feedAll(s3fixes, 300); await sleep(800);
const s3end = JSON.parse(await ev(`JSON.stringify(gpsPos)`));
const s3err = hav(M(14.04 + 19 * 2.4, 0), s3end);
ok('S3 at 8 m/s the estimate tracks within 8 m of truth (no over-smoothing lag) | err ' + s3err.toFixed(2) + ' m', s3err < 8);
await ev(`(() => { clearInterval(window.__recT); watchId = null; return true; })()`);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

