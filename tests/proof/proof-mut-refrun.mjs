import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Mutation-run proof (2026-11-19, snow-mutation-run): refRun (parts/app3.js)
// picks the Pace reference clean - the NEWEST history entry that is a full
// clean (every street in the route's own list), falling back to the newest
// entry with at least 5 cleans, else null. The 2026-11-19 mutation run
// showed the fast suite caught none of four breaks in this function:
// flipping the full-clean comparison to !==, widening the first loop's
// guard from && to ||, starting the first loop one past the newest entry
// (which dereferences undefined), and breaking the fallback loop's bound
// so it never runs. This proof extracts refRun verbatim and runs it
// against stub history/cleanCount/STREETNAMES (the harness supplies the
// scope, the same way sibling proofs supply stub state; cleanCount here
// counts an entry's cleaned streets, which is its contract in app3).
// On the clean tree all checks pass; each break above fails at least one.

const src = readFileSync('parts/app3.js', 'utf8');
const start = src.indexOf('function refRun()');
if (start < 0) { console.log('FAIL: refRun not found in parts/app3.js'); process.exit(1); }
let depth = 0, end = -1;
for (let i = src.indexOf('{', start); i < src.length; i++) {
  if (src[i] === '{') depth++;
  if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
}
const fnText = src.slice(start, end);

const NAMES = Array.from({ length: 34 }, (_, i) => 'S' + i);
const entry = n => ({ items: Object.fromEntries(NAMES.slice(0, n).map(k => [k, 1])) });
function makeRefRun(history) {
  const ctx = vm.createContext({
    history,
    STREETNAMES: NAMES,
    cleanCount: h => Object.keys(h.items || {}).length,
  });
  vm.runInContext(fnText + '\nthis.__refRun = refRun;', ctx);
  return ctx.__refRun;
}

let fails = 0;
function check(label, cond) { console.log((cond ? 'PASS: ' : 'FAIL: ') + label); if (!cond) fails++; }

// Newest is a partial (6), an older entry is a full clean: the full clean wins.
{
  const full = entry(34), partial = entry(6);
  check('full clean beats a newer partial', makeRefRun([full, partial])() === full);
}
// No full clean: the newest entry with >= 5 cleans is the reference.
{
  const a = entry(3), b = entry(7), c = entry(4);
  check('fallback picks the newest entry with >= 5 cleans', makeRefRun([a, b, c])() === b);
}
// Nothing qualifies: null.
{
  check('no qualifying entry returns null', makeRefRun([entry(2), entry(4)])() === null);
  check('empty history returns null', makeRefRun([])() === null);
}
// The newest entry itself is the full clean: it is returned (the search
// must include index length-1, and must not dereference past it).
{
  const full = entry(34);
  check('newest entry is found when it is the full clean', makeRefRun([entry(9), full])() === full);
}
console.log(fails ? `proof-mut-refrun: ${fails} FAILING` : 'proof-mut-refrun: all pass');
process.exit(fails ? 1 : 0);
