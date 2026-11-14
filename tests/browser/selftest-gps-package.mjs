// GPS package fixtures (Beta 1.187 gate). Andrew approved the five-item GPS
// package from the 2026-11-13 field-test investigation; the investigation's
// harness (same noise model, same centrelines, 10 seeds) priced every item
// before shipping, and only two passed their evidence gates:
//   TURN A - as of Beta 1.194 this name carries heading filter 2a, which
//     REPLACED the 1.187 time-normalized EMA the section used to pin
//     (re-derived 2026-11-14 from the round-3 judging, REPORT3 S3, over
//     Claude's [theta, omega] design): predict theta += omega*dt with
//     process noise Q = q*[[dt^3/3, dt^2/2],[dt^2/2, dt]] at q = HEAD_Q =
//     400, measurement noise R = sigma(v)^2 (sigma = 6 + 18/max(v, 0.5)
//     deg), a soft innovation gate (|y| > 3 sqrt(S) -> R x9) WITH the step
//     escape (a 2nd consecutive same-sign gated innovation is accepted at
//     normal R - two large same-sign innovations in a row are a
//     manoeuvre, not noise), omega clamped to +-40 deg/s, and a
//     speed < 1 hold (theta frozen, omega decays 0.5^dt). The 1.187 EMA
//     it replaced stepped by 1 - 0.65^dt per fix: on the real drives the
//     OS course moves in STEPS at corners and that smoother chased each
//     step for 5-9 s (52 fixes over 20 deg of error in one 11-minute
//     drive). Proven below from the shipped updateHeading, verbatim; the
//     same code path is replay-proven on both real sessions by drive197.
//   STOP B - a recorded fix reporting under 0.5 m/s banks no distance and
//     records no trail point (parked phantom distance 137.8 -> 13.6 m/min).
//     Proven below from the shipped acceptFix trail block, verbatim.
// Priced and NOT shipped (the round record carries the full table): driving
// the camera from the filter's velocity (peak error 59 -> 88 deg), a
// stationary position hold (wander RMS 5.9 -> 8.2 m, restart unchanged), and
// a tighter 28 m accuracy gate (median/p90/tail all flat-to-worse). The last
// is pinned below: GPS_ACCURACY_M stays 65.
import { readFileSync } from 'node:fs';
const app1 = readFileSync(new URL('../../parts/app1.js', import.meta.url), 'utf8');
const app3 = readFileSync(new URL('../../parts/app3.js', import.meta.url), 'utf8');
function extractFrom(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found');
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  return src.slice(i, j + 1);
}
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// ---- the constants, pinned from the shipped source ----
t('C1 GPS_STILL_MPS is 0.5 (the STOP B guard threshold)', /const GPS_STILL_MPS = 0\.5;/.test(app1));
t('C2 GPS_ACCURACY_M stays 65 (the 28 m gate was priced in the harness and declined)', /const GPS_ACCURACY_M = 65;/.test(app1));

// ---- TURN A (Beta 1.194: heading filter 2a): updateHeading, verbatim ----
const headQLine = app3.slice(app3.indexOf('const HEAD_Q'), app3.indexOf(';', app3.indexOf('const HEAD_Q')) + 1);
if (!/const HEAD_Q = 400;/.test(headQLine)) throw new Error('HEAD_Q pin: the shipped process-noise configuration is not 400');
const headFactory = new Function(`
  let smHeading = null, lastHeadFixAt = 0, lastHeadFixPerf = 0, followPaused = false;
  let headF = null;
  ${extractFrom(app3, 'headDelta')}
  ${headQLine}
  ${extractFrom(app3, 'headSigma')}
  ${extractFrom(app3, 'updateHeading')}
  return { updateHeading, get: () => smHeading, getF: () => headF, reset: () => { smHeading = null; lastHeadFixAt = 0; lastHeadFixPerf = 0; headF = null; } };
`)();
const herr = (z) => Math.abs(((((headFactory.get() - z + 180) % 360) + 360) % 360) - 180);
{ // T1: the first fix initializes theta outright - at ANY speed (the 1.187
  // smoother refused a first fix under 1 m/s; 2a takes it, because the
  // low-speed hold needs a theta to hold and the OS course at rest is
  // frozen, not absent)
  headFactory.reset();
  headFactory.updateHeading(200, 0.4, 1000);
  t('T1a first fix at 0.4 m/s initializes theta outright', headFactory.get() === 200 && headFactory.getF() !== null);
  headFactory.reset();
  headFactory.updateHeading(45, 4, 1000);
  t('T1b first fix at speed initializes theta outright', headFactory.get() === 45);
  headFactory.reset();
  headFactory.updateHeading(null, 4, 1000);
  t('T1c null heading: no heading is taken', headFactory.get() === null && headFactory.getF() === null);
}
{ // T2: the speed < 1 hold - theta frozen exactly, omega decays 0.5^dt
  headFactory.reset();
  headFactory.updateHeading(40, 4, 1000);
  headFactory.getF().om = 30; // plant a turn rate, then arrive at a stop
  headFactory.updateHeading(123, 0.5, 2000); // dt = 1 s, course says 123 - must be ignored
  t('T2 hold: theta frozen at low speed, omega decays by 0.5^dt (30 -> 15)', headFactory.get() === 40 && near(headFactory.getF().om, 15, 1e-9));
  headFactory.updateHeading(80, null, 3000); // null speed reads as the hold too
  t('T2b null speed: theta still frozen', headFactory.get() === 40);
}
{ // T3: a course TELEPORT (the post-reverse class: a ~176 deg step) - gated
  // on the first fix, released by the escape on the second consecutive
  // same-sign innovation. Basis, measured on the shipped filter: the gate
  // threshold is 3 sqrt(S) and S carries the filter's own uncertainty, so
  // at q = 400 ordinary 40-60 deg corner steps are NOT gated - the omega
  // state absorbs them (that step response is what drive197 proves on the
  // real sessions). The gate exists for innovations beyond ~90 deg, and a
  // step on the second-ever fix is initialization, not a manoeuvre (the
  // init omega variance is +-30 deg/s by design), so the step here is
  // planted after 10 settling fixes on a straight.
  headFactory.reset();
  for (let k = 0; k < 10; k++) headFactory.updateHeading(0, 4, 1000 * (k + 1));
  headFactory.updateHeading(170, 4, 11000);
  const e1 = herr(170);
  t(`T3a teleport fix: the soft gate holds most of a 170 deg step back (error ${e1.toFixed(1)} deg, bar > 20) and records the gated innovation`, e1 > 20 && headFactory.getF().gate === 170);
  headFactory.updateHeading(170, 4, 12000);
  const e2 = herr(170);
  t(`T3b next fix: the step escape accepts the manoeuvre (error ${e2.toFixed(1)} deg, bar < 5)`, e2 < 5);
}
{ // T4: omega never leaves the +-40 clamp under a violent alternating course
  headFactory.reset();
  headFactory.updateHeading(0, 5, 1000);
  let clamped = true;
  for (let k = 1; k <= 12; k++) {
    headFactory.updateHeading(k % 2 ? 179 : 0, 5, 1000 * (k + 1));
    if (Math.abs(headFactory.getF().om) > 40 || !isFinite(headFactory.get())) clamped = false;
  }
  t('T4 alternating 179 deg steps: omega stays inside the +-40 clamp and theta stays finite', clamped);
}
{ // T6: a fix with NO course while stopped (the OS reports none at rest) -
  // no measurement is taken, theta stays frozen, but the turn rate still
  // decays, so the camera lead (theta + omega*h, h capped at 1 s) dies
  // with it instead of parking the camera a full stale omega off the
  // heading (Codex P2, PR #40 - before the fix the null-heading return
  // skipped the decay entirely). A null course while MOVING changes
  // nothing: a dropout mid-drive is not evidence about the rate.
  headFactory.reset();
  for (let k = 0; k < 5; k++) headFactory.updateHeading(k * 20, 4, 1000 * (k + 1)); // turning at 20 deg/s: omega ~20, theta tracking behind the ramp
  const thRamp = headFactory.get(), omMoving = headFactory.getF().om;
  headFactory.updateHeading(null, 4, 6000); // moving dropout
  t('T6a null course while moving: theta and omega untouched', headFactory.get() === thRamp && headFactory.getF().om === omMoving);
  for (let k = 0; k < 5; k++) headFactory.updateHeading(null, 0, 7000 + 1000 * k); // stopped, no course reported
  t(`T6b null course while stopped: theta frozen, omega decayed ${omMoving.toFixed(1)} -> ${headFactory.getF().om.toFixed(2)} (bar < 1.5, so the 1 s camera lead errs by less)`, headFactory.get() === thRamp && headFactory.getF().om < 1.5);
}
{ // T5: the dt clamp - a long gap predicts with dt = 3, never more
  headFactory.reset();
  headFactory.updateHeading(50, 4, 1000);
  headFactory.updateHeading(80, 4, 100000); // 99 s later
  const th = headFactory.get();
  t('T5 long gap is clamped to dt = 3 s (theta moved toward the new course, finite, no overshoot)', isFinite(th) && th > 50 && th < 80);
}

// ---- STOP B: the shipped acceptFix trail block, verbatim, over stub state ----
const blkStart = app3.indexOf('const stillFix = typeof speed');
const blkEnd = app3.indexOf('coverFix(sm);') + 'coverFix(sm);'.length;
if (blkStart < 0 || blkEnd <= blkStart) throw new Error('trail block not found');
const trailBlock = app3.slice(blkStart, blkEnd);
const MLAT = 111320, MLNG = 80386;
const distM = (a, b) => Math.hypot((a[1] - b[1]) * MLNG, (a[0] - b[0]) * MLAT);
function makeTrailHarness() {
  const calls = { persist: 0, dirty: [], flush: 0, draw: 0, cover: 0 };
  const state = { trail: [], runDist: { m: 0, run: 1000000, capped: false } };
  const run = new Function('speed', 'sm', 'now', 'state', 'calls', 'env', `
    const GPS_STILL_MPS = 0.5, TRAIL_MAX = 100000, TRAIL_WINDOW_S = 3600; // Beta 1.193: the shipped block's window eviction names the app1 constant - the harness stubs it at its shipped value, like TRAIL_MAX beside it
    const runStart = 1000000, trail = state.trail, runDist = state.runDist;
    const distM = env.distM, persistRunDist = () => calls.persist++, markDirty = k => calls.dirty.push(k),
      flushAux = () => calls.flush++, drawTrail = () => calls.draw++, coverFix = () => calls.cover++;
    ${trailBlock}
  `);
  return { calls, state, fix: (speed, sm, now) => run(speed, sm, now, state, calls, env) };
}
const env = { distM };
const P = (lat, lng) => [lat, lng];
{ const h = makeTrailHarness();
  h.fix(2, P(43.8000, -79.5000), 1001000); // moving: records point 1
  t('S1 a moving fix records a trail point', h.state.trail.length === 1 && h.calls.persist === 1);
  const dirtyBefore = h.calls.dirty.length;
  h.fix(0.3, P(43.8001, -79.5001), 1002000); // stopped fix ~14 m of wander away
  t('S2 a stopped fix records no point, banks no distance, persists nothing', h.state.trail.length === 1 && h.state.runDist.m === 0 && h.calls.persist === 1 && !h.calls.dirty.slice(dirtyBefore).includes('trail'));
  t('S2b a stopped fix still runs coverage and the aux flush (Beta 1.193: the block makes NO draw call - drawTrail is retired with the map line, and the stub count staying at zero proves the shipped block never reaches for it)', h.calls.cover === 2 && h.calls.flush === 2 && h.calls.draw === 0);
  h.fix(0, P(43.8002, -79.5002), 1003000); // speed exactly 0: still stopped
  t('S3 a speed-0 fix records nothing either', h.state.trail.length === 1 && h.state.runDist.m === 0);
  h.fix(2, P(43.8010, -79.5000), 1004000); // moving again, ~111 m north of point 1
  t('S4 the next moving fix banks the segment from the last RECORDED point (real distance survives the guard)',
    h.state.trail.length === 2 && near(h.state.runDist.m, distM(P(43.8000, -79.5000), P(43.8010, -79.5000)), 0.01));
  h.fix(null, P(43.8011, -79.5000), 1005000); // no reported speed: no evidence of stillness
  t('S5 a fix with no reported speed records as before', h.state.trail.length === 3);
  h.fix(0.5, P(43.8012, -79.5000), 1006000); // exactly at the threshold: moving (guard is < 0.5)
  t('S6 a fix at exactly 0.5 m/s records (the guard is strictly under)', h.state.trail.length === 4);
}
console.log(`selftest-gps-package: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
