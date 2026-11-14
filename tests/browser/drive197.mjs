import { launchDrive, finish, bootThrough } from './harness.mjs';
import { readFileSync } from 'node:fs';
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive197: Beta 1.194 acceptance - heading filter 2a + display stillness hold, proven on
// REAL data (round-3 judging, REPORT3 S3.3/S2). Both of Andrew's recorded drives
// (fixtures/gps-replay-sessions.json: S1 = 218-fix road drive, S2 = 659-fix drive among
// houses, slimmed from the verified decodes) are replayed fix-by-fix through the SHIPPED
// acceptFix under a stepped fake clock at the sessions' own cadence (0.996-1.001 s), and
// the shipped code's per-fix outputs are judged against the bars the judging set from the
// offline prototype's replay:
//   heading: S2 fixes with |error| > 20 deg <= 10 (shipped EMA: 52; prototype: 5);
//     S1 <= 2 (shipped 2; prototype 0); settle (step fix -> |error| < 5 sustained 3)
//     <= 3 fixes on every S2 episode the SHIPPED record defines except the idx-638
//     episode, and <= 2 fixes on the post-reverse episode. EPISODE COUNT: REPORT3's
//     prose says 15, but its own algorithm run verbatim on the data gives 14 (as
//     REPORT2 counted), and its settle table (13 episodes at 0-1 fixes + idx 638 at
//     5) sums to 14 - the bars here follow the DATA: 14 episodes, idx 638 the one
//     allowed exception (the prototype itself settles it in 5); straight-line RMS
//     <= 1.0 deg in both
//     sessions; theta within 3 deg of the frozen course on every fix of the confirmed
//     reverse (S2 idx 650-653, ground truth: Andrew was backing up).
//   hold: engages exactly once inside each of the 4 recorded stops (S1 idx 9-21, 94-107,
//     111-127; S2 idx 319-347) and NOWHERE else (in particular not in the S2 pre-reverse
//     pause, idx 630-659); the rendered point is bit-frozen while engaged; every exit
//     jump <= 1.2 m; the S1 creep between stops 2 and 3 (idx 108-109, speeds 0.53/1.09)
//     releases at its second fix with a jump < 0.5 m (simulation: idx 109, 0.34 m).
// Episode/settle arithmetic replicates the judging's analyze7.py exactly (episodes are
// defined on the SHIPPED smoother's recorded errors, merged across gaps <= 2).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
await sleep(3000);
ok('F0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

const FX = JSON.parse(readFileSync(new URL('./fixtures/gps-replay-sessions.json', import.meta.url), 'utf8'));
const hd = (a, b) => ((((b - a + 180) % 360) + 360) % 360) - 180;
const distM = (a, b) => Math.hypot((b[1] - a[1]) * 80386, (b[0] - a[0]) * 111320);

await ev(`(() => { watchId = 4242; followPaused = false; window.__fakeT0 = Date.now(); window.__fakeNow = window.__fakeT0; const rp = performance.now(); Date.now = () => window.__fakeNow; performance.now = () => rp - 3600000 + (window.__fakeNow - window.__fakeT0); return true; })()`);
const resetState = async () => ev(`(() => { smHeading = null; headF = null; lastHeadFixAt = 0; lastHeadFixPerf = 0; kf = null; gpsPos = null; dispPos = null; dispOff = [0, 0]; lastFixTs = 0; lastGood = null; lastFixAt = 0; gpsAccM = 0; facingDeg = null; dispHoldReset(); window.__smpl = []; return true; })()`);
const replay = async (fixes) => {
  await resetState();
  for (let i = 0; i < fixes.length; i++) {
    const f = fixes[i];
    const gap = i ? f[0] - fixes[i - 1][0] : 0;
    await ev(`(() => { const end = window.__fakeNow + ${gap}; while (window.__fakeNow < end) { window.__fakeNow = Math.min(end, window.__fakeNow + 50); renderTick(performance.now()); } acceptFix({ coords: { latitude: ${f[1]}, longitude: ${f[2]}, accuracy: ${f[3]}, speed: ${f[4]}, heading: ${f[5]} }, timestamp: ${f[0]} }); window.__smpl.push({ th: smHeading, om: headF ? headF.om : null, dp: dispPos && dispPos.slice(), shown: dispShownPos() && dispShownPos().slice(), held: !!dispHoldPt, hpt: dispHoldPt && dispHoldPt.slice() }); return true; })()`);
  }
  return J(`window.__smpl`);
};

function episodesOf(shipErr) {
  const eps = []; let cur = [];
  for (let i = 0; i < shipErr.length; i++) {
    if (shipErr[i] > 20) cur.push(i);
    else { if (cur.length) { eps.push(cur); cur = []; } }
  }
  if (cur.length) eps.push(cur);
  const merged = [];
  for (const e of eps) {
    if (merged.length && e[0] - merged[merged.length - 1][merged[merged.length - 1].length - 1] <= 2) merged[merged.length - 1].push(...e);
    else merged.push([...e]);
  }
  return merged;
}
function settle(errs, start, limit = 20) {
  let run = 0;
  for (let k = start; k < Math.min(errs.length, start + limit); k++) {
    if (Math.abs(errs[k]) < 5) { run++; if (run === 3) return k - 2 - start; }
    else run = 0;
  }
  return null;
}

const sessions = [['S1', FX.s1], ['S2', FX.s2]];
const sampled = {};
for (const [name, fixes] of sessions) sampled[name] = await replay(fixes);

// ---------- heading bars ----------
for (const [name, fixes] of sessions) {
  const S = sampled[name];
  const protoErr = fixes.map((f, i) => Math.abs(hd(S[i].th, f[5])));
  const shipErr = fixes.map((f) => Math.abs(hd(f[6], f[5])));
  const over = protoErr.filter(e => e > 20).length;
  ok(`${name} H1 fixes with heading error > 20 deg: ${over} (bar ${name === 'S2' ? '<= 10' : '<= 2'}; shipped EMA ${shipErr.filter(e => e > 20).length})`, over <= (name === 'S2' ? 10 : 2));
  ok(`${name} H2 theta finite and omega inside the +-40 clamp on every fix`, S.every(s => typeof s.th === 'number' && isFinite(s.th) && s.om !== null && Math.abs(s.om) <= 40));
  const eps = episodesOf(shipErr);
  const epIdx = new Set();
  for (const e of eps) for (let i = Math.max(0, e[0] - 3); i < Math.min(fixes.length, e[e.length - 1] + 4); i++) epIdx.add(i);
  const straight = fixes.map((f, i) => i).filter(i => !epIdx.has(i) && fixes[i][4] > 3);
  const rms = Math.sqrt(straight.reduce((a, i) => a + (hd(S[i].th, fixes[i][5])) ** 2, 0) / straight.length);
  ok(`${name} H3 straight-line RMS heading error ${rms.toFixed(2)} deg (bar <= 1.0)`, rms <= 1.0);
  if (name === 'S2') {
    ok(`S2 H4 the shipped record defines 14 corner episodes (got ${eps.length}; REPORT3 prose says 15 - its own algorithm on the data gives 14)`, eps.length === 14);
    let within = 0, postRev = null; const exceptions = [];
    for (const e of eps) {
      let stepI = Math.max(0, e[0] - 2);
      let best = -1;
      for (let i = Math.max(0, e[0] - 2); i < Math.min(fixes.length, e[e.length - 1] + 2); i++) {
        const v = i > 0 ? Math.abs(hd(fixes[i - 1][5], fixes[i][5])) : 0;
        if (v > best) { best = v; stepI = i; }
      }
      const st = settle(protoErr, stepI);
      if (st !== null && st <= 3) within++;
      else exceptions.push(e[0]);
      if (e[e.length - 1] >= 654) postRev = st;
    }
    ok(`S2 H5 settle <= 3 fixes on ${within}/14 episodes, the only exception starting at idx ${exceptions.join(',') || 'none'} (bar: >= 13 within, exception only the idx-638 episode - the prototype's own behaviour)`, within >= 13 && exceptions.every(x => x === 638));
    ok(`S2 H6 post-reverse episode settles in ${postRev} fixes (bar <= 2)`, postRev !== null && postRev <= 2);
    const revMax = Math.max(...[650, 651, 652, 653].map(i => Math.abs(hd(S[i].th, fixes[i][5]))));
    ok(`S2 H7 theta excursion during the confirmed reverse ${revMax.toFixed(2)} deg (bar <= 3; course frozen at ${fixes[650][5]})`, revMax <= 3);
  }
}

// ---------- display-hold bars ----------
const stops = { S1: [[9, 21], [94, 107], [111, 127]], S2: [[319, 347]] };
let totalEngage = 0;
for (const [name, fixes] of sessions) {
  const S = sampled[name];
  const engages = [], exits = [];
  for (let i = 0; i < S.length; i++) {
    if (S[i].held && !(i && S[i - 1].held)) engages.push(i);
    if (!S[i].held && i && S[i - 1].held) exits.push(i);
  }
  totalEngage += engages.length;
  for (const [a, b] of stops[name]) {
    const inside = engages.filter(i => i >= a && i <= b);
    ok(`${name} D1 hold engages exactly once inside the recorded stop idx ${a}-${b} (at ${inside.join(',') || 'none'})`, inside.length === 1);
  }
  // rendered point bit-frozen across every held run
  let frozen = true;
  for (let i = 1; i < S.length; i++) if (S[i].held && S[i - 1].held && (S[i].shown[0] !== S[i - 1].shown[0] || S[i].shown[1] !== S[i - 1].shown[1])) frozen = false;
  ok(`${name} D2 rendered position frozen (0.00 m movement) while the hold is engaged`, frozen);
  for (const x of exits) {
    // the rendered jump: the exit fix's rendered point (the live display track again)
    // against the held point sampled on the last held fix
    const jump = distM(S[x].shown, S[x - 1].hpt);
    ok(`${name} D3 exit at idx ${x}: rendered jump ${jump.toFixed(2)} m (bar <= 1.2)`, jump <= 1.2);
  }
  if (name === 'S1') {
    // the creep: stop 2's engagement must release at the second creep fix (idx 109)
    const creepExit = exits.find(x => x > 107 && x < 111);
    ok(`S1 D4 the 2.86 m creep is not eaten: release at idx ${creepExit} (the second creep fix, 109)`, creepExit === 109);
    if (creepExit) {
      const jump = distM(S[creepExit].shown, S[creepExit - 1].hpt);
      ok(`S1 D5 creep release jump ${jump.toFixed(2)} m (bar < 0.5; simulation 0.34)`, jump < 0.5);
    }
  }
  if (name === 'S2') {
    ok('S2 D6 no engagement in the pre-reverse pause (idx 630-659)', !engages.some(i => i >= 630));
  }
}
ok(`D7 exactly 4 engagements across both sessions, nowhere else (got ${totalEngage})`, totalEngage === 4);

// ---------- replay fidelity: the display track the hold feeds on ----------
// The recorded display positions came from the phone's real frame timing; the harness
// steps its frame clock at 50 ms. The hold's engage test reads display steps, so the
// replay's display track must track the recorded one closely - measured here so a
// future change that bends the display path shows up as a number, not a mystery.
// Two bar classes, from the measured mechanism (first run, 2026-11-14): away from
// transients the tracks agree to ~1 m (S1 worst 0.98 m over all 218 fixes); at the
// recorded track's own discontinuities (a one-step recorded display jump > 2 m -
// the corner re-convergence snaps and the reverse exit, where REPORT2 measured the
// display lagging the raw position by up to 9.0 m) the per-fix value depends on
// frame interleaving the harness cannot reproduce, so those windows (+-3 fixes)
// carry a looser 5 m cap and everything else carries 1.5 m.
for (const [name, fixes] of sessions) {
  const S = sampled[name];
  const dev = fixes.map((f, i) => distM(S[i].dp, [f[7], f[8]]));
  const transient = new Set();
  for (let i = 1; i < fixes.length; i++) {
    if (distM([fixes[i][7], fixes[i][8]], [fixes[i - 1][7], fixes[i - 1][8]]) > 2) for (let k = Math.max(0, i - 3); k <= Math.min(fixes.length - 1, i + 3); k++) transient.add(k);
  }
  let worstCalm = 0, worstTrans = 0;
  for (let i = 0; i < fixes.length; i++) { if (transient.has(i)) { if (dev[i] > worstTrans) worstTrans = dev[i]; } else if (dev[i] > worstCalm) worstCalm = dev[i]; }
  ok(`${name} F1 replay display track: worst calm deviation ${worstCalm.toFixed(2)} m (bar <= 1.5), worst transient-window deviation ${worstTrans.toFixed(2)} m (bar <= 5)`, worstCalm <= 1.5 && worstTrans <= 5);
}

await finish(R, proc, consoleLog);
