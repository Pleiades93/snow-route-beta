// selftest-lane219 - fixtures for the boot-phase presence lane's judge
// (lane-judge.mjs, extracted from drive219), per docs/TESTING.md rule 1:
// judging logic is proven against hand-derived fixtures, positive AND
// negative. The two negative fixtures are the Codex findings on PR #162
// stated as data: a group aggregated by its minimum acquits an escaped
// layer, and a lane that suspends judgment on invisible samples
// acquits the visible -> invisible -> visible blink.
import { laneViolations, groupHeldViolations, crossBracket, bracketsOverlap, syncVerdict } from './lane-judge.mjs';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const S = (t, held, groups) => ({ t, held, mult: held ? 0 : 1, groups });
const G = (names, effMax, effMin) => ({ names, effMax, effMin: effMin === undefined ? effMax : effMin });

// ---------- the lane: a sustained absence after appearing convicts ----------
// (Re-derived 2026-11-25, flake census 2: the sampler provably
// misses a rendered name for a sample or two - title-drop's
// DROP_RUN evidence - so conviction needs the full run bound.)
check('F1 a name placed visibly, absent for three consecutive samples, then back: convicted',
  JSON.stringify(laneViolations([
    S(0, false, { titles: G({ Velmar: 1 }, 1) }),
    S(50, false, { titles: G({}, 1) }),
    S(100, false, { titles: G({}, 1) }),
    S(150, false, { titles: G({}, 1) }),
    S(200, false, { titles: G({ Velmar: 1 }, 1) })
  ], 'titles')) === '["Velmar"]');
check('F1b a name absent for one sample, then back: acquitted - the proven sampler blind spot',
  laneViolations([
    S(0, false, { titles: G({ Velmar: 1 }, 1) }),
    S(50, false, { titles: G({}, 1) }),
    S(100, false, { titles: G({ Velmar: 1 }, 1) })
  ], 'titles').length === 0);
check('F1c a name absent for two consecutive samples, then back: acquitted - still inside the blind spot',
  laneViolations([
    S(0, false, { titles: G({ Velmar: 1 }, 1) }),
    S(50, false, { titles: G({}, 1) }),
    S(100, false, { titles: G({}, 1) }),
    S(150, false, { titles: G({ Velmar: 1 }, 1) })
  ], 'titles').length === 0);

// ---------- the lane: a sustained opacity drop convicts (Codex's case, at the run bound) ----------
check('F2 a name at opacity 1, at opacity 0 for three consecutive samples, back at 1: convicted - no sample suspends judgment, each counts toward the run',
  JSON.stringify(laneViolations([
    S(0, false, { titles: G({ Velmar: 1 }, 1) }),
    S(50, false, { titles: G({ Velmar: 0 }, 0) }),
    S(100, false, { titles: G({ Velmar: 0 }, 0) }),
    S(150, false, { titles: G({ Velmar: 0 }, 0) }),
    S(200, false, { titles: G({ Velmar: 1 }, 1) })
  ], 'titles')) === '["Velmar"]');
check('F2b a name at opacity 0 for a single sample between full-opacity samples: acquitted - inside the blind spot',
  laneViolations([
    S(0, false, { titles: G({ Velmar: 1 }, 1) }),
    S(50, false, { titles: G({ Velmar: 0 }, 0) }),
    S(100, false, { titles: G({ Velmar: 1 }, 1) })
  ], 'titles').length === 0);

// ---------- the designed load-in shape acquits ----------
check('F3 the designed shape - names held at 0, one monotonic ramp crossing, stable visible after: no violations',
  laneViolations([
    S(0, true, { titles: G({ Velmar: 0, Astona: 0 }, 0) }),
    S(50, true, { titles: G({ Velmar: 0, Astona: 0 }, 0) }),
    S(100, false, { titles: G({ Velmar: 0.4, Astona: 0.4 }, 0.4) }),
    S(150, false, { titles: G({ Velmar: 0.8, Astona: 0.8 }, 0.8) }),
    S(200, false, { titles: G({ Velmar: 1, Astona: 1 }, 1) }),
    S(250, false, { titles: G({ Velmar: 1, Astona: 1 }, 1) })
  ], 'titles').length === 0);

// ---------- a drop below the visible line after the reveal convicts ----------
check('F4 a name visible after the reveal, then faded to 0.2 and held there for three samples: convicted',
  JSON.stringify(laneViolations([
    S(0, false, { titles: G({ Velmar: 1 }, 1) }),
    S(50, false, { titles: G({ Velmar: 1 }, 1) }),
    S(100, false, { titles: G({ Velmar: 0.2 }, 0.2) }),
    S(150, false, { titles: G({ Velmar: 0.2 }, 0.2) }),
    S(200, false, { titles: G({ Velmar: 0.2 }, 0.2) })
  ], 'titles')) === '["Velmar"]');

// ---------- the held assertion reads the MAXIMUM, never the minimum ----------
check('F5 a held group whose minimum is 0 but whose maximum is 1 (one layer escaped): the held assertion convicts it',
  groupHeldViolations([
    S(0, true, { road: G({ 'Weston Road': 0 }, 1, 0) })
  ], ['road']).length === 1);
check('F6 a held group with every layer at 0 (max 0): the held assertion acquits',
  groupHeldViolations([
    S(0, true, { road: G({ 'Weston Road': 0 }, 0, 0) }),
    S(50, true, { titles: G({ Velmar: 0 }, 0, 0) })
  ], ['road', 'titles']).length === 0);
check('F7 the held assertion ignores samples where the hold does not stand',
  groupHeldViolations([
    S(0, false, { road: G({ 'Weston Road': 1 }, 1, 1) })
  ], ['road']).length === 0);

// ---------- brackets: one fade overlaps, a sequence does not ----------
const oneFade = [
  S(0, true, { titles: G({}, 0), road: G({}, 0) }),
  S(100, false, { titles: G({}, 0.3), road: G({}, 0.3) }),
  S(200, false, { titles: G({}, 1), road: G({}, 1) })
];
check('F8 two groups crossing inside the same window: brackets overlap',
  bracketsOverlap([crossBracket(oneFade, 'titles'), crossBracket(oneFade, 'road')]) === true);
const sequence = [
  S(0, true, { titles: G({}, 0), road: G({}, 0) }),
  S(100, false, { titles: G({}, 1), road: G({}, 0) }),
  S(200, false, { titles: G({}, 1), road: G({}, 0) }),
  S(300, false, { titles: G({}, 1), road: G({}, 1) })
];
check('F9 titles crossing a full window before the road names (the old blink shape): brackets do not overlap',
  bracketsOverlap([crossBracket(sequence, 'titles'), crossBracket(sequence, 'road')]) === false);

// ---------- the sync rule (drive219 A6): same wave passes, hold-and-release fails ----------
const N = (pairs) => pairs.map(([t, n]) => ({ t, n }));
check('S1 the census shape - titles complete at once, road names streaming slowly to +3155: same wave, passes',
  syncVerdict(N([[0, 30], [500, 30], [3155, 30]]), N([[0, 5], [100, 9], [900, 20], [2000, 33], [3155, 40]])).pass === true);
check('S2 the 1.266 defect - road names complete early, titles held then released in a burst at +4000: fails',
  syncVerdict(N([[0, 0], [4000, 0], [4100, 12], [4300, 30]]), N([[0, 5], [100, 20], [400, 40]])).pass === false);
check('S3 both groups streaming slowly together over ~4 s with a small completion gap: passes',
  syncVerdict(N([[0, 0], [500, 8], [2000, 20], [4000, 30]]), N([[0, 3], [700, 15], [2500, 30], [4200, 40]])).pass === true);
check('S4 titles complete at once, road names absent for 6 s then bursting in: fails',
  syncVerdict(N([[0, 30], [6300, 30]]), N([[0, 0], [6000, 0], [6150, 22], [6300, 40]])).pass === false);
check('S5 a fast joint landing - both complete inside the 3000 ms floor: passes',
  syncVerdict(N([[0, 0], [300, 30]]), N([[0, 0], [900, 40]])).pass === true);
check('S6 an empty series never passes',
  syncVerdict([], N([[0, 40]])).pass === false);

console.log(`selftest-lane219: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
