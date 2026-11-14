// GPS package fixtures (Beta 1.187 gate). Andrew approved the five-item GPS
// package from the 2026-11-13 field-test investigation; the investigation's
// harness (same noise model, same centrelines, 10 seeds) priced every item
// before shipping, and only two passed their evidence gates:
//   TURN A - the heading smoother is sized by the TIME between fixes, not by
//     fix count (bursty peak turn error 62.5 -> 55.6 deg; regular cadence
//     unchanged). Proven below from the shipped updateHeading, verbatim.
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

// ---- TURN A: updateHeading, verbatim, in a stateful harness ----
const headFactory = new Function(`
  let smHeading = null, lastHeadFixAt = 0, followPaused = false;
  ${extractFrom(app3, 'headDelta')}
  ${extractFrom(app3, 'updateHeading')}
  return { updateHeading, get: () => smHeading, reset: () => { smHeading = null; lastHeadFixAt = 0; } };
`)();
const legacy = (() => { // the pre-1.187 per-fix smoother, for the equality checks
  let sm = null;
  return { step(hdg, speed) { if (typeof hdg !== 'number' || isNaN(hdg) || !speed || speed < 1) return; sm = sm === null ? hdg : sm + headFactoryDelta(sm, hdg) * 0.35; }, get: () => sm, reset: () => { sm = null; } };
  function headFactoryDelta(a, b) { return ((((b - a + 180) % 360) + 360) % 360) - 180; }
})();
{ // T1: at a steady 1 Hz the time-normalized step IS the old 0.35 step
  headFactory.reset(); legacy.reset();
  let okAll = true;
  for (let k = 0; k < 12; k++) {
    const hdg = (k * 17) % 360, now = 1000 * (k + 1);
    headFactory.updateHeading(hdg, 4, now); legacy.step(hdg, 4);
    if (!near(headFactory.get(), legacy.get(), 1e-9)) okAll = false;
  }
  t('T1 steady 1 Hz: time-normalized smoother equals the legacy per-fix smoother step for step', okAll);
}
{ // T2: a burst pair barely steps; the post-gap fix catches up hard
  headFactory.reset(); legacy.reset();
  headFactory.updateHeading(0, 4, 1000); legacy.step(0, 4); // settle at 0 deg
  headFactory.updateHeading(90, 4, 1150); legacy.step(90, 4); // burst fix, 0.15 s later, course now 90
  const burstNew = headFactory.get(), burstOld = legacy.get();
  t('T2a burst pair: the new smoother steps less than the legacy 0.35 step', burstNew < burstOld && burstNew > 0);
  headFactory.updateHeading(90, 4, 4150); legacy.step(90, 4); // 3 s gap, then the next fix
  t('T2b post-gap fix: the new smoother catches up past the legacy step', headFactory.get() > legacy.get() && headFactory.get() < 90);
}
{ // T3: the dt clamp - a 30 s gap steps by 1 - 0.65^3 = 0.7253, not ~1
  headFactory.reset();
  headFactory.updateHeading(0, 4, 1000);
  headFactory.updateHeading(90, 4, 31000);
  t('T3 long gap is clamped to dt = 3 s (step fraction 0.7253)', near(headFactory.get(), 90 * (1 - Math.pow(0.65, 3)), 1e-9));
}
{ // T4: gates preserved - low speed and null heading are no-ops; first fix sets outright
  headFactory.reset();
  headFactory.updateHeading(45, 0.5, 1000);
  t('T4a speed under the 1 m/s gate: no heading is taken', headFactory.get() === null);
  headFactory.updateHeading(null, 4, 1000);
  t('T4b null heading: no heading is taken', headFactory.get() === null);
  headFactory.updateHeading(45, 4, 1000);
  t('T4c first real fix sets the heading outright', headFactory.get() === 45);
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
    const GPS_STILL_MPS = 0.5, TRAIL_MAX = 100000;
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
  t('S2b a stopped fix still runs coverage and the aux flush', h.calls.cover === 2 && h.calls.flush === 2 && h.calls.draw === 2);
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
