import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Denylist fix proof (fix_id: rerun-denylist-b02-a05, 2026-11-15) — B-02 of
// the 2026-11-15 Carbon sweep re-run, graded REAL by the assessment round.
//
// The defect (parts/app3.js): buildSnap bakes workM by summing side stamps
// inside the run window. A finish after a state restore archives with every
// stamp null, so the sum is 0 - and cleanWorkM returns any stored finite
// workM >= 0 VERBATIM, so the sides derivation that could price the clean
// from its own recorded side bits never runs. The archived clean reports
// zero work metres (and no pace) for the life of the entry.
//
// The fix: a stored 0 is trusted only when the entry carries at least one
// parseable side stamp (snapHasStamps) - a MEASURED 0, e.g. the RP-05 case
// (real stamps, all before Start). A stamp-less 0 measured nothing and the
// entry falls through to the existing derivation. workM > 0 is untouched.
//
// This proof extracts cleanWorkM (and snapHasStamps, when present) verbatim
// from parts/app3.js and runs them in a vm against a two-street stub
// geometry. On unmodified main the stamp-less-0 checks FAIL; with the fix
// all checks pass, and the measured-0 / verbatim / legacy checks pass both
// ways (behaviour for cleans with real timestamps is preserved).

const src = readFileSync('parts/app3.js', 'utf8');

function extractFn(name) {
  const at = src.indexOf('function ' + name);
  if (at < 0) return '';
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('unbalanced braces extracting ' + name);
}

const cleanWorkMSrc = extractFn('cleanWorkM(h)');
if (!cleanWorkMSrc.includes('return h.workM')) throw new Error('cleanWorkM extraction does not look right');
const snapSrc = src.includes('function snapHasStamps') ? extractFn('snapHasStamps(h)') : '';

const ctx = vm.createContext({
  STREETNAMES: ['Velmar', 'Mellings'],
  STRETCH: {
    Velmar: { total: 100, parts: [{ len: 60 }, { len: 40 }] },
    Mellings: { total: 50, parts: [{ len: 50 }] }
  },
  segLenM: p => p.len
});
vm.runInContext(snapSrc + '\n' + cleanWorkMSrc, ctx);
const cleanWorkM = vm.runInContext('cleanWorkM', ctx);

const T1 = '2026-11-10T05:00:00.000Z', T2 = '2026-11-10T05:01:00.000Z';
const restoreEntry = { // finish after a restore: bits recorded, every stamp null, baked workM 0
  at: '2026-11-10T06:00:00.000Z', startedAt: '2026-11-10T04:55:00.000Z', workM: 0,
  items: { Velmar: null },
  sides: { p: { Velmar: [3, 0] }, t: { Velmar: [[null, null], [null, null]] } }
};
const restoreFull = { // same, both parts both sides
  at: '2026-11-10T06:00:00.000Z', startedAt: '2026-11-10T04:55:00.000Z', workM: 0,
  items: { Velmar: null },
  sides: { p: { Velmar: [3, 3] }, t: { Velmar: [[null, null], [null, null]] } }
};
const measuredZero = { // RP-05: real stamps exist (all before Start) - the 0 was measured
  at: '2026-11-10T06:00:00.000Z', startedAt: '2026-11-10T05:30:00.000Z', workM: 0,
  items: { Velmar: T1 },
  sides: { p: { Velmar: [3, 0] }, t: { Velmar: [[T1, T2], [null, null]] } }
};
const verbatim = { ...restoreEntry, workM: 500 }; // a positive stored figure is read verbatim
const legacy = { at: restoreEntry.at, items: { Velmar: null }, sides: restoreEntry.sides }; // no workM at all
const noSides = { at: restoreEntry.at, startedAt: restoreEntry.startedAt, workM: 0, items: { Velmar: null } }; // baked 0, no sides record at all

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  (got ' + actual + ', want ' + expected + ')');
}

check('B-02: stamp-less stored 0 derives from side bits (one part, both sides)', cleanWorkM(restoreEntry), 120);
check('B-02: stamp-less stored 0 derives from side bits (both parts)', cleanWorkM(restoreFull), 200);
check('B-02: baked 0 with no sides record derives from items', cleanWorkM(noSides), 200);
check('RP-05 preserved: measured 0 (stamps present) stays 0', cleanWorkM(measuredZero), 0);
check('verbatim preserved: positive stored workM read as-is', cleanWorkM(verbatim), 500);
check('legacy preserved: no workM derives from side bits', cleanWorkM(legacy), 120);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
