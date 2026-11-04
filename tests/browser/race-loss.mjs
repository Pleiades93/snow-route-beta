// race-loss.mjs - the E17 kill-vs-commit race judge (Phase 1, N4).
//
// Single source of truth for the predicate e2e-offline.mjs uses to decide
// whether a failed E17 attempt carries the platform storage race signature
// (monotone loss) and so earns its one retry. Extracted from the e2e file so
// the decision logic can be fixture-tested in plain Node BEFORE CI ever sees
// it (docs/TESTING.md, the test-change gate): a test's judging logic is
// itself code, and code that decides pass/fail gets proven against written
// fixtures - both documented race signatures AND the mutations that must
// still hard-fail - before it is allowed to judge a run.
//
// The signatures (flake log, snow goal hidden_files/flake-log.md):
// - partial last-writes loss (run 41885400454 attempt 1): the last mark and
//   the trail points, written inside the async commit window, are gone;
//   everything older survives byte-for-byte.
// - wholesale-empty (run 41885400454 attempt 2; run 41923276328 attempt 1):
//   the relaunched app sees virgin storage - every key absent, the run
//   stamp itself lost (0). The stamp SURVIVING is therefore not required:
//   it either survives or is itself lost; a DIFFERENT nonzero stamp is a
//   mutation and never the race.

// appSummaryLoss(beforeApp, afterApp): the parsed in-app summary objects
// from snapState() ({run, sess[], velmar, astona, done[], trailN}).
export function appSummaryLoss(b, a) {
  return (a.run === b.run || a.run === 0)
    && a.velmar <= b.velmar && a.astona <= b.astona && a.trailN <= b.trailN
    && a.done.every(d => b.done.includes(d))
    && a.sess.every(t => b.sess.includes(t));
}

// isRaceLoss(before, after, backOk, aOk): before/after are snapState()
// results (storage keys start/sess/sides/done/times/via/trail as raw strings
// or null, plus app as a JSON string). True only when the attempt actually
// failed in the race's shape: the browser came back (backOk), the setup had
// verifiably persisted (aOk), at least one thing differs, every differing
// storage value is absent/emptied/a strict prefix of its pre-kill value,
// and the app summary only ever lost ground.
export function isRaceLoss(before, after, backOk, aOk) {
  if (!backOk || !aOk) return false;
  const keys = ['start', 'sess', 'sides', 'done', 'times', 'via', 'trail'];
  const anyDiff = keys.some(k => before[k] !== after[k]) || before.app !== after.app;
  if (!anyDiff) return false;
  let appLoss = false;
  try { appLoss = appSummaryLoss(JSON.parse(before.app), JSON.parse(after.app)); } catch (e) { return false; }
  return appLoss && keys.every(k => {
    const b = before[k], a = after[k];
    return a === b || a === null || a === ''
      || (typeof b === 'string' && typeof a === 'string' && a.length < b.length && b.startsWith(a));
  });
}
