// lane-judge - the boot-phase presence lane's judging logic, extracted
// from drive219 so it can be fixture-tested in plain Node
// (selftest-lane219.mjs), per docs/TESTING.md rule 1 and the Codex
// review of PR #162. The drive's in-page sampler records, per sample
// and per name group (titles / road / place):
//   names:  { <name>: <effective opacity of the layer that placed it> }
//   effMax: the MAXIMUM effective opacity over the group's layers
//   effMin: the MINIMUM, recorded only so a fixture can prove the judge
//           never reads it (the round's first judge aggregated groups
//           by minimum, which reports a group invisible while one of
//           its layers stands at full opacity - an escaped layer hides
//           behind its held siblings)
// Effective opacity is what a layer's live text-opacity spec evaluates
// to at the sample's zoom - the rendered truth, never the app's own
// multiplier bookkeeping.
//
// THE LANE RULE: once a name has VISIBLY appeared - placed in a
// sample with its own effective opacity over 0.5 - it must not then
// be missing or at 0.5 or below for LANE_DROP_RUN or more
// CONSECUTIVE samples. A shorter absence is not a blink: the
// sampler's queryRenderedFeatures read provably misses a rendered
// name for a sample or two around camera stops (the drive216
// investigation behind title-drop.mjs's DROP_RUN, the same bound).
// The blink class this lane exists for lasted ~1-2 s - tens of
// samples - so the bound costs the lane nothing it was built to
// catch. (The round's first judge suspended the check on samples
// that were themselves invisible, which acquitted exactly the
// visible -> invisible -> visible sequence the lane exists to
// catch; here every sample counts toward the run - judgment is
// never suspended, it is only not yet conclusive.)
// Names never seen visible are not judged: during the hold every
// name sits at 0 by design, and the ramp is monotonic, so a name
// crosses 0.5 exactly once, at the joint reveal. A name gone at
// the window's end is graded by the drives' final-count checks,
// not here.

export const LANE_DROP_RUN = 3;

export function laneViolations(samples, group) {
  const seen = new Set();
  const run = new Map();
  const bad = new Set();
  for (const s of samples) {
    const names = (s.groups && s.groups[group] && s.groups[group].names) || {};
    for (const n of Object.keys(names)) if (names[n] > 0.5 && !seen.has(n)) seen.add(n);
    for (const n of seen) {
      if (!(n in names) || names[n] <= 0.5) {
        const r = (run.get(n) || 0) + 1;
        run.set(n, r);
        if (r >= LANE_DROP_RUN) bad.add(n);
      } else run.set(n, 0);
    }
  }
  return [...bad];
}

// The held assertion: in every sample taken while the hold stands, no
// name group's MAXIMUM effective opacity may exceed 0.05 - if even one
// layer of a group escaped, something in that group can render.
export function groupHeldViolations(samples, groups) {
  const out = [];
  for (const s of samples) {
    if (!s.held) continue;
    for (const g of groups) {
      const st = s.groups && s.groups[g];
      if (st && st.effMax !== null && st.effMax !== undefined && st.effMax > 0.05) out.push({ t: s.t, group: g, effMax: st.effMax });
    }
  }
  return out;
}

// The visible-crossing bracket of a group: [the last sample at or
// under 0.5, the first sample over 0.5], read on effMax from the first
// held sample on. Honest under sparse sampling, where a point estimate
// of a 350 ms ramp is not measurable.
export function crossBracket(samples, group) {
  const h = samples.findIndex((x) => x.held);
  const from = h > -1 ? h : 0;
  let lo = -1, hi = -1;
  for (let i = from; i < samples.length; i++) {
    const st = samples[i].groups && samples[i].groups[group];
    if (!st || st.effMax === null || st.effMax === undefined) continue;
    if (st.effMax <= 0.5) lo = samples[i].t;
    else { hi = samples[i].t; break; }
  }
  return [lo, hi];
}

// One fade, not a sequence: the brackets of every group share a
// common moment.
export function bracketsOverlap(brackets) {
  if (brackets.some((b) => b[1] <= 0)) return false;
  return Math.max(...brackets.map((b) => b[0])) <= Math.min(...brackets.map((b) => b[1]));
}

// THE SYNC RULE (drive219's A6): two name groups landing from one
// flight are in sync when they complete in the same WAVE - the gap
// between their completion times no larger than the longer group's
// own streaming span (the slice opening when it is already
// placing then, else its first rise, to first reaching its window
// maximum), floored at SYNC_FLOOR_MS. A group
// held back and released in a burst - the shipped 1.266 defect,
// seconds of nameless map after landing - has a short span and a
// long gap and fails. Continuous slow streaming (tile fetches
// under runner load) stretches the span with the gap and passes:
// the old flat 3000 ms bracket measured fetch latency, not desync
// (flake census 2, 2026-11-25: road names completing at +3155 and
// +3247 ms against titles at +0, the pipelines 23 ms apart at
// event level). Series are plain { t, n } count series so the
// rule is fixture-testable without the sampler.
export const SYNC_FLOOR_MS = 3000;

export function syncVerdict(seriesA, seriesB) {
  const one = (series) => {
    if (!series.length) return { completeAt: null, span: 0 };
    const maxN = Math.max(...series.map((s) => s.n));
    const completeAt = series.find((s) => s.n === maxN).t;
    const rise = series.find((s) => s.n > series[0].n);
    // Already placing at the opening: it was streaming before the
    // slice, so the span runs from the opening. At zero, the span
    // runs from its first rise - a held group's dead time is not
    // streaming and must not excuse its gap.
    const from = series[0].n > 0 ? series[0].t : (rise ? rise.t : completeAt);
    return { completeAt, span: rise ? completeAt - from : 0 };
  };
  const a = one(seriesA), b = one(seriesB);
  if (a.completeAt === null || b.completeAt === null) {
    return { completeAtA: a.completeAt, completeAtB: b.completeAt, gap: null, span: 0, pass: false };
  }
  const gap = Math.abs(a.completeAt - b.completeAt);
  const span = Math.max(a.span, b.span);
  return { completeAtA: a.completeAt, completeAtB: b.completeAt, gap, span, pass: gap <= Math.max(SYNC_FLOOR_MS, span) };
}
