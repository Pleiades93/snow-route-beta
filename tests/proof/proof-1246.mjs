// proof-1246.mjs - Beta 1.246 (fix_id: stall-1246).
// THE ATTEMPT STALL (Andrew's Apple-standard rule, locked 2026-11-18):
// a create-flow street-data download that goes completely silent used to
// sit out its whole attempt cap (70 s) - and a silent FALLBACK attempt,
// after a fast first failure, could sit out nearly the whole 120 s
// budget. Now CR_TIMING.attemptStallMs (60000) bounds the silence INSIDE
// crOverpassFetch: a per-attempt timer, armed at the attempt's start,
// re-armed when the answer lands and on every streamed chunk, aborts
// THAT attempt through its own controller; the loop gives the next
// instance the budget that remains. No retry is added anywhere, and a
// trickling download re-arms the timer per chunk, so it lives or dies
// by its attempt cap and the total budget alone. THE PREPARATION
// WATCHDOGS DID NOT MOVE: their stallMs stays 180000 because they
// measure silence in LANDINGS, not bytes - at 60000 they would cut
// fetches the budget itself would have let live (a fallback preparation
// is ONE fetch under the 120 s budget: an honest 90 s answer would be
// failed and orphaned at 60; a grid's first wave of three 90 s cells
// would be aborted mid-flight), breaking the rule's own slow-but-alive
// clause. Checks 5-7 pin that adjudication mechanically: the watchdog
// files keep their exact stall tests, and the numeric relationship
// stallMs > budgetMs (the slow-but-alive protection at that level) is
// asserted from the literals themselves. The behaviour is graded by
// drive205 (silent attempt measured killed at the shrunk bound with
// the fallback's answer committed; a trickle surviving three silence
// windows inside one attempt; a killed attempt's late poison changing
// nothing; the no-stream fallback's wedged read bounded; the healthy
// path identical to 1.245) - its TIMING assertions fail on the 1.245
// tree, where the seam below does not exist (there the silent attempt
// runs to its whole attempt cap, kill measured at 20001 ms against
// the scaled 20000); the trickle / orphan / healthy sections are
// guards that hold on both trees, as they must - they pin behaviour
// the round promised not to change.
// Run from the repo root:  node tests/proof/proof-1246.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const fetchJs = read('parts/create-fetch.js');
const cache = read('parts/create-cache.js');
const citydata = read('parts/create-citydata.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- the seam ----------
const timingLine = (fetchJs.match(/const CR_TIMING = \{[^}]*\}/) || [''])[0];
const num = (k) => { const m = timingLine.match(new RegExp(k + ': (\\d+)')); return m ? +m[1] : NaN; };
check('1: the attempt stall bound is a CR_TIMING seam beside the budgets, at 60000',
  timingLine.includes('attemptStallMs: 60000'));
check('2: the preparation stall bound stands at 180000 beside it (the two rules are distinct seams)',
  timingLine.includes('stallMs: 180000'));
check('3: the attempt bound sits BELOW the first attempt cap, so it can fire on attempt 1 (60000 < 70000)',
  num('attemptStallMs') === 60000 && num('attempt1Ms') === 70000 && num('attemptStallMs') < num('attempt1Ms'));
check('4: the preparation bound stays ABOVE the whole fetch budget (180000 > 120000) - the slow-but-alive protection at the landing level',
  num('stallMs') === 180000 && num('budgetMs') === 120000 && num('stallMs') > num('budgetMs'));

// ---------- the timer's seat inside crOverpassFetch ----------
check('5: the silence timer is armed from CR_TIMING.attemptStallMs against the attempt\'s own controller',
  fetchJs.includes('stallTo = setTimeout(() => { try { ctl.abort(); } catch (e) {} }, CR_TIMING.attemptStallMs);'));
check('6: it is armed at the attempt start, re-armed on the answer landing, and re-armed on every chunk (three call sites, no more)',
  (fetchJs.match(/armStall\(\);/g) || []).length === 3
  && fetchJs.includes('armStall(); // the answer landing is progress')
  && fetchJs.includes('armStall(); // a landed chunk is progress'));
check('7: both timers retire together - one shared clear, and no bare cap-timer clear survives in the file',
  fetchJs.includes('const clearTimers = () => { if (to) clearTimeout(to); if (stallTo) clearTimeout(stallTo); };')
  && (fetchJs.match(/if \(to\) clearTimeout\(to\);/g) || []).length === 1);

// ---------- the preparation watchdogs are untouched ----------
check('8: the grid watchdog still tests its progress clock against stallMs',
  cache.includes('if (Date.now() - (g.lastProgressAt || g.startedAt) < CR_TIMING.stallMs) return;'));
check('9: the fallback watchdog still tests its start clock against stallMs',
  citydata.includes('if (Date.now() - prep.startedAt < CR_TIMING.stallMs) return;'));

// ---------- the release editorial ----------
check('10: the CHANGELOG top entry is Beta 1.246', changelog.includes('## Beta 1.246'));
check('11: What\'s New carries the CURRENT entry\'s bullet (rolled to 1.251: this check tracks the current entry each round)',
  whatsnew.includes('Picking an intersection now names it in the search bar and marks it with a pulsing blue dot.'));

console.log(`proof-1246: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
