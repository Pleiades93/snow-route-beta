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
// THE LANE RULE (strict form): once a name has VISIBLY appeared -
// placed in a sample with its own effective opacity over 0.5 - every
// later sample in the window must still show it placed AND over 0.5.
// Absence is a violation, and so is a drop to 0.5 or below: a name that
// fades out after appearing has blinked, whatever its placement does.
// (The round's first judge suspended the check on samples that were
// themselves invisible, which acquitted exactly the
// visible -> invisible -> visible sequence the lane exists to catch.)
// Names never seen visible are not judged: during the hold every name
// sits at 0 by design, and the ramp is monotonic, so a name crosses
// 0.5 exactly once, at the joint reveal.

export function laneViolations(samples, group) {
  const seen = new Set();
  const bad = new Set();
  for (const s of samples) {
    const names = (s.groups && s.groups[group] && s.groups[group].names) || {};
    for (const n of Object.keys(names)) if (names[n] > 0.5 && !seen.has(n)) seen.add(n);
    for (const n of seen) if (!(n in names) || names[n] <= 0.5) bad.add(n);
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
