// selftest-title-drop.mjs - fixture proof for drive216's title-drop
// judge (tests/browser/title-drop.mjs), run in plain Node - no browser.
// Per docs/TESTING.md rule 1: judging logic inside a test is proven
// against written fixtures BEFORE it judges a real run. The positives
// are the blackout shapes that must convict (a real teardown misses a
// title for many consecutive samples); the negatives are the harmless
// shapes that must still pass - above all the Bell Harbour blind spot
// (the 2026-11-22 investigation: queryRenderedFeatures misses a title
// for a sample or two in the settle while it renders at full ink), which
// the pre-decision-C any-single-sample rule wrongly convicted.
//
// Run: node tests/browser/selftest-title-drop.mjs  (exit 0 = all hold)

import { judgeTitleDrops, DROP_RUN } from './title-drop.mjs';

const cases = [];
const T = (name, win, expect, opts) => cases.push({ name, win, expect, opts });

// --- negatives: gaps that must NOT convict ---
T('stable window, no misses', [['A', 'B'], ['A', 'B'], ['A', 'B']], []);
T('one missed sample (Bell Harbour shape)', [['A'], ['A'], [], ['A'], ['A']], []);
T('two consecutive misses', [['A'], [], [], ['A'], ['A']], []);
T('two separate two-miss runs', [['A'], [], [], ['A'], [], [], ['A']], []);
T('counter resets on a hit: 2 misses, hit, 2 misses', [['A'], [], [], ['A'], [], [], ['A'], ['A']], []);

// --- positives: blackouts that must convict ---
T('three consecutive misses', [['A'], [], [], [], ['A']], ['A']);
T('five consecutive misses', [['A'], [], [], [], [], [], ['A']], ['A']);
T('blackout spanning the window middle, title back by the last sample', [['A', 'B'], ['B'], ['B'], ['B'], ['A', 'B']], ['A']);
T('one title blacked out while another only blips', [['A', 'B'], ['B'], [], ['B'], ['B'], ['A', 'B']], ['A']);

// --- the before/after gate: a title absent from either end is not judged ---
T('title gone by the last sample is a placement change, not a drop', [['A'], [], [], [], []], []);
T('title appearing only from the second sample is not judged', [[], ['A'], [], [], [], ['A']], []);

// --- style-blackout samples (7c): only an opted-in phase exempts them ---
const L = (t) => ({ t, ok: true }), U = (t) => ({ t, ok: false });
T('an opted-in blackout alone does not convict (the 1.293 P6 shape)', [L(['A']), U([]), U([]), U([]), U([]), L(['A'])], [], { loadedOnly: true });
T('the same blackout convicts without the opt-in (a source reload is evidence)', [L(['A']), U([]), U([]), U([]), U([]), L(['A'])], ['A']);
T('a teardown spanning a blackout still convicts on loaded samples', [L(['A']), L([]), U([]), L([]), L([]), L(['A'])], ['A'], { loadedOnly: true });
T('a window ending mid-blackout judges from the last loaded sample', [L(['A']), L(['A']), U([])], [], { loadedOnly: true });
T('a window opening mid-blackout judges from the first loaded sample', [U([]), L(['A']), L(['A'])], [], { loadedOnly: true });

// --- report shape ---
T('empty window', [], []);

let fails = 0;
for (const c of cases) {
  const r = judgeTitleDrops(c.win, c.opts);
  const pass = JSON.stringify(r.dropped) === JSON.stringify(c.expect);
  if (!pass) { fails++; console.log('FAIL', c.name, '- dropped', JSON.stringify(r.dropped), 'expected', JSON.stringify(c.expect)); }
  else console.log('PASS', c.name);
}
{
  const r = judgeTitleDrops([['A', 'B'], ['B'], ['A', 'B']]);
  const shapeOk = r.samples === 3 && r.loaded === 3 && r.before === 2 && r.after === 2 && Array.isArray(r.dropped);
  if (!shapeOk) { fails++; console.log('FAIL report shape -', JSON.stringify(r)); } else console.log('PASS report shape {samples, loaded, before, after, dropped}');
}
{
  const r = judgeTitleDrops([L(['A']), U([]), U([]), L(['A'])], { loadedOnly: true });
  const shapeOk = r.samples === 4 && r.loaded === 2 && r.before === 1 && r.after === 1;
  if (!shapeOk) { fails++; console.log('FAIL loaded-stream shape -', JSON.stringify(r)); } else console.log('PASS loaded-stream shape (samples counts the window, loaded the judged stream)');
}
if (DROP_RUN !== 3) { fails++; console.log('FAIL DROP_RUN is', DROP_RUN, '- amended decision C fixes it at 3'); }
else console.log('PASS DROP_RUN == 3 (amended decision C)');

console.log(fails ? `selftest-title-drop: ${fails} FAIL` : 'selftest-title-drop: all fixtures hold');
process.exit(fails ? 1 : 0);
