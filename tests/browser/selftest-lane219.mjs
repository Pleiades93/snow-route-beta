// selftest-lane219 - fixtures for the boot-phase presence lane's judge
// (lane-judge.mjs, extracted from drive219), per docs/TESTING.md rule 1:
// judging logic is proven against hand-derived fixtures, positive AND
// negative. The two negative fixtures are the Codex findings on PR #162
// stated as data: a group aggregated by its minimum acquits an escaped
// layer, and a lane that suspends judgment on invisible samples
// acquits the visible -> invisible -> visible blink.
import { laneViolations, groupHeldViolations, crossBracket, bracketsOverlap } from './lane-judge.mjs';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const S = (t, held, groups) => ({ t, held, mult: held ? 0 : 1, groups });
const G = (names, effMax, effMin) => ({ names, effMax, effMin: effMin === undefined ? effMax : effMin });

// ---------- the lane: absence after a visible appearance convicts ----------
check('F1 a name placed visibly, absent in a later visible sample, then back: convicted',
  JSON.stringify(laneViolations([
    S(0, false, { titles: G({ Velmar: 1 }, 1) }),
    S(50, false, { titles: G({}, 1) }),
    S(100, false, { titles: G({ Velmar: 1 }, 1) })
  ], 'titles')) === '["Velmar"]');

// ---------- the lane: an opacity drop after a visible appearance convicts (Codex's exact case) ----------
check('F2 a name present at opacity 1, present at opacity 0, present at opacity 1: convicted - the middle sample must not suspend judgment',
  JSON.stringify(laneViolations([
    S(0, false, { titles: G({ Velmar: 1 }, 1) }),
    S(50, false, { titles: G({ Velmar: 0 }, 0) }),
    S(100, false, { titles: G({ Velmar: 1 }, 1) })
  ], 'titles')) === '["Velmar"]');

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
check('F4 a name visible after the reveal, then fading to 0.2 in a later sample: convicted',
  JSON.stringify(laneViolations([
    S(0, false, { titles: G({ Velmar: 1 }, 1) }),
    S(50, false, { titles: G({ Velmar: 1 }, 1) }),
    S(100, false, { titles: G({ Velmar: 0.2 }, 0.2) })
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

console.log(`selftest-lane219: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
