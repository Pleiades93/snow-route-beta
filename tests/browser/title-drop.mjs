// title-drop.mjs - drive216's title-drop judge (amended decision C,
// Andrew 2026-11-23). Single source of truth for the predicate that
// decides whether a street title DROPPED during a gesture phase.
// Extracted from drive216's in-page expression so the decision logic is
// fixture-tested in plain Node (docs/TESTING.md rule 1: judging logic
// ships with fixtures) - proven by tests/browser/selftest-title-drop.mjs,
// wired into the build-and-test CI job.
//
// The rule: a title counts as dropped only when it is placed in the
// window's FIRST and LAST sample (present before and after the gesture)
// AND absent from THREE OR MORE CONSECUTIVE samples in between. The old
// any-single-sample rule convicted the Bell Harbour case, which the
// 2026-11-22 investigation proved was a queryRenderedFeatures blind spot
// in the settle after the camera stops - the name renders at full ink
// while the query misses it for a sample or two. The graded property is
// unchanged: a real teardown (the 1.261 heal's blackout) misses for many
// consecutive samples, throttled or not.
//
// judgeTitleDrops(win): win is the phase's sample window - an array of
// samples, each sample an array of placed title names (drive216's
// sampler records one sample every 50 ms). Returns the phase report
// drive216 grades: { samples, before, after, dropped }.
//
// Samples may be { t: [names], ok: bool }. Only a phase that opts
// in (the theme swap) streams loaded samples only: its setStyle
// blackout is not title evidence, but a source reload elsewhere
// still is - the flag dips for both.
export const DROP_RUN = 3;

export function judgeTitleDrops(win, opts = {}) {
  const names = s => Array.isArray(s) ? s : s.t;
  const stream = (opts.loadedOnly ? win.filter(s => Array.isArray(s) || s.ok === true) : win).map(names);
  const before = new Set(stream[0] || []), after = new Set(stream[stream.length - 1] || []);
  const both = [...before].filter(n => after.has(n));
  const dropped = both.filter(n => { let run = 0; for (const sm of stream) { run = sm.includes(n) ? 0 : run + 1; if (run >= DROP_RUN) return true; } return false; });
  return { samples: win.length, loaded: stream.length, before: before.size, after: after.size, dropped };
}
