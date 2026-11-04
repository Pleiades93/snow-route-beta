// selftest-race-loss.mjs - fixture proof for the E17 race judge
// (tests/browser/race-loss.mjs), run in plain Node - no browser, no CI.
// Per the test-change gate (docs/TESTING.md): judging logic inside a test
// is proven against written fixtures BEFORE it judges a real run. The two
// positive fixtures are the documented kill-vs-commit signatures from the
// flake log (the wholesale one uses the exact app summaries captured on
// run 41923276328); the negatives are the mutations/gains that must still
// hard-fail - a retry that forgives those would mask real data loss.
//
// Run: node tests/browser/selftest-race-loss.mjs  (exit 0 = all fixtures hold)

import { isRaceLoss } from './race-loss.mjs';

const rep = (ch, n) => ch.repeat(n);
const before = {
  start: '1793830508971', sess: '[1793830508]', sides: rep('s', 1889),
  done: '["Velmar"]', times: rep('t', 37), via: rep('v', 16), trail: rep('p', 83),
  app: JSON.stringify({ run: 1793830508971, sess: [1793830508], velmar: 3, astona: 1, done: ['Velmar'], trailN: 3 }),
};
const clone = o => JSON.parse(JSON.stringify(o));

const cases = [];
const T = (name, snap, backOk, aOk, expect) => cases.push({ name, snap, backOk, aOk, expect });

// F1 - partial last-writes loss (flake log, run 41885400454 attempt 1):
// the last Astona mark and the trail, written inside the commit window, are
// gone; everything older survives.
{
  const after = clone(before);
  after.sides = rep('s', 1856); after.trail = null;
  after.app = JSON.stringify({ run: 1793830508971, sess: [1793830508], velmar: 3, astona: 0, done: ['Velmar'], trailN: 0 });
  T('F1 partial last-writes loss is the race', { before, after }, true, true, true);
}
// F2 - wholesale-empty (flake log, run 41885400454 attempt 2; captured live
// on run 41923276328 attempt 1): virgin storage, the run stamp itself lost.
// The judge's first version required the stamp to survive and misjudged
// exactly this case on run 41919355118 - this fixture is its regression test.
{
  const after = { start: null, sess: null, sides: null, done: null, times: null, via: null, trail: null,
    app: JSON.stringify({ run: 0, sess: [], velmar: 0, astona: 0, done: [], trailN: 0 }) };
  T('F2 wholesale-empty is the race', { before, after }, true, true, true);
}
// F3 - a value CHANGED (same length, different content): a mutation, never the race.
{
  const after = clone(before); after.sides = rep('s', 1888) + 'X';
  T('F3 mutated value is not the race', { before, after }, true, true, false);
}
// F4 - a value GREW: a gain, never the race.
{
  const after = clone(before); after.trail = rep('p', 90);
  after.app = JSON.stringify({ run: 1793830508971, sess: [1793830508], velmar: 3, astona: 1, done: ['Velmar'], trailN: 4 });
  T('F4 gained points are not the race', { before, after }, true, true, false);
}
// F5 - the run stamp changed to a DIFFERENT nonzero value: a different run, never the race.
{
  const after = clone(before); after.start = '1793839999999';
  after.app = JSON.stringify({ run: 1793839999999, sess: [1793830508], velmar: 3, astona: 1, done: ['Velmar'], trailN: 3 });
  T('F5 a different run stamp is not the race', { before, after }, true, true, false);
}
// F6 - identical states: nothing was lost, so there is nothing to forgive.
T('F6 identical states are not a loss', { before, after: clone(before) }, true, true, false);
// F7/F8 - the guards: a browser that never came back, or a setup that never
// verifiably persisted, earn no retry whatever the diff looks like.
{
  const after = { start: null, sess: null, sides: null, done: null, times: null, via: null, trail: null,
    app: JSON.stringify({ run: 0, sess: [], velmar: 0, astona: 0, done: [], trailN: 0 }) };
  T('F7 no relaunch, no retry', { before, after }, false, true, false);
  T('F8 unverified setup, no retry', { before, after }, true, false, false);
}
// F9 - the done set GREW a street: impossible under loss.
{
  const after = clone(before);
  after.app = JSON.stringify({ run: 1793830508971, sess: [1793830508], velmar: 3, astona: 1, done: ['Astona', 'Velmar'], trailN: 3 });
  T('F9 a gained street is not the race', { before, after }, true, true, false);
}
// F10 - a session marker APPEARED: impossible under loss.
{
  const after = clone(before);
  after.app = JSON.stringify({ run: 1793830508971, sess: [1793830508, 1793830600], velmar: 3, astona: 1, done: ['Velmar'], trailN: 3 });
  T('F10 a gained session marker is not the race', { before, after }, true, true, false);
}

let fails = 0;
for (const c of cases) {
  const got = isRaceLoss(c.snap.before, c.snap.after, c.backOk, c.aOk);
  const ok = got === c.expect;
  if (!ok) fails++;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + c.name + ' | expected ' + c.expect + ', got ' + got);
}
console.log('selftest-race-loss: ' + (cases.length - fails) + '/' + cases.length + ' fixtures hold');
process.exit(fails ? 1 : 0);
