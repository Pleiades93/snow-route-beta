# Tier map — which gate a change runs (test-suite restructure, 2026-11-09)

The checks workflow no longer runs the full battery for every change. A
`plan` job diffs the change, and `scripts/select-tier.py` applies THIS map
(the operative table is `tests/tier-map.json`; this document is its human
form — keep the two in step). `build-and-test` (build parity, the shard
coverage guard, the type check, and every selftest gate) runs at EVERY
tier. Precedence: **C beats B beats A**. A change touching several
families runs the union of their drives. An app-code path no rule matches
falls to Tier C: an unmapped surface gets the full battery, never a free
pass.

## Tier A — small visual / constant / copy changes

Paths: `parts/head.html`, `parts/pmstyles.js`, `parts/brand-snow.js`
(the boot/menu snow layer — see the amendment below), `docs/`, `assets/`,
`manifest.json`, any `*.md`.
Gate: build-and-test + the **core set** (~40 s of drives):
`drive131 drive160 drive161 drive168 drive174 drive180`.
`drive180` (the assembled-page census) is mandatory in the core set.
`drive89` is EXCLUDED while quarantined (see below) — it was a core-set
member of the old main-push smoke list, along with `drive123` and
`drive145`, which also leave the fast gate here: 123 carries an app-side
30 s timeout stall (recorded as a deferred follow-up), 145 is a 90 s
session battery. The main-push job runs this same Tier A core set (the
merge gate remains the tree-identity proof plus this set plus the live
read-back, as before).

## Tier B — feature work

Gate: build-and-test + the touched surface's family:

| Family | Paths | Drives |
| --- | --- | --- |
| create | `parts/create-cache.js`, `create-citydata.js`, `create-fetch.js`, `create-packs.js`, `create-pick.js`, `packs/` | 151 152 153 154 155 156 160 164 166 181 183 185 |
| map | `parts/engine.js` | 115 116 121 127 128 129 130 133 141 148 149 165 168 182 |
| session | `parts/app2.js`, `parts/app3.js`, `parts/app4.js` | 83 86 88 89* 114 118 125 135 136 140 145 146 147 159 161 162 163 169 170 184 |

*quarantined drives are removed from the set by the selector (drive89
today; drive181 was quarantined 2026-11-09 and re-admitted 2026-11-10
after its hardening proved out — entry removed in the housekeeping
cleanup); they are listed here so the family's full membership stays
visible.

## Tier C — deep mechanics

Paths: `tests/` and `scripts/` and `.github/` and `src/` (for `tests/`,
read the amendment below first: drive files ride with their feature,
and only the machinery itself is Tier C on its own — the `tests/`
prefix remains the backstop for everything else under it, fixtures and
selftests included), `parts/app1.js` (route
state, storage slots, history, the finish state machine),
`parts/create-save.js` (the create→save write path), `parts/data.js`,
`sw.js`.
Gate: the FULL battery (all eight shards) + offline-e2e.
The nightly battery on main is unchanged: full battery + offline-e2e on
schedule, whatever the day's changes were. A manual `workflow_dispatch`
can force any tier (`tier` input: auto / A / B / C / full); the default
is a full (Tier C) run, as before.

## Amendment — 2026-11-09 (Andrew approved)

Two clauses, approved by Andrew on 2026-11-09 after the Beta 1.159 ship:
that round was a purely visual change (a landing value, pill styling,
the title's lifetime, the snow layer) whose tests-first drive work and
snow placement classified it Tier C under the original map, and Andrew
overrode the gate for the ship ("Just do the small test. The visual
test. That's all it is."). This amendment fixes the map so the override
is not needed again.

**Clause 1 — test changes follow their feature.** The drive files
(`tests/browser/drive*.mjs`) are how a feature's checks ship; they are
not deep mechanics. A change to drive files therefore never escalates
a round by itself: when drives accompany an app change, the tier comes
from the app paths alone and the touched drives join the gate set (so
the drive carrying the change's own checks always runs). A change to
drive files only is Tier B and runs the touched drives. What DOES stay
Tier C on its own is the test *machinery* — the thing that decides and
runs the verdicts: `tests/browser/harness.mjs`, the runners
(`tests/**/run*.mjs`), `scripts/select-tier.py`, the checks workflow,
this map (both files) and `tests/quarantine.json`. Everything else
under `tests/` (fixtures, selftests, the service-worker test) keeps
the Tier C backstop it had.

One corollary, without which clause 1 could never fire for a real
ship: the generated outputs — `index.html` and
`src/tracker-source.html` — never classify a change. They are rebuilt
from `parts/` on every ship, and `build-and-test` (which runs at every
tier) proves them byte-equal to their sources; a hand-edited or stale
output fails there, not at the tier gate. The sources alone carry the
tier.

**Clause 2 — the snow stands on its own.** The falling-snow engine
(the "Falls and settles" layer, Beta 1.158/1.159) used to live at the
end of `parts/create-save.js`, so a snow-only change inherited the
save path's Tier C. The engine now lives in its own part,
`parts/brand-snow.js`, assembled immediately after `create-save.js`
(the shipped bytes are identical — the split moved text, nothing
else), and it classifies as what it is: a Tier A visual path.
`parts/create-save.js` stays Tier C for its save logic.

## The flake rule (replaces the 2026-11-09 whole-battery rule)

On any failure, classify it **APP** (the app is wrong — stop, record,
report), **TEST** (the test is wrong — fix it in the round), or **FLAKE**
(the machinery hiccuped — same tree passes on a focused re-run, with
evidence). A FLAKE gets **ONE focused re-run of that drive or family
only** — whole-battery re-runs are abolished. A drive that flakes twice
enters `tests/quarantine.json` and does not gate the fast tiers (A/B)
until it is hardened and the entry removed; it still runs and gates at
Tier C and nightly, where its surface matters most. Hardening means
fixing the synchronization at the root — never loosening an assertion,
never retry-until-pass.

## Service-worker shell finding

Does every ship change the service-worker shell, forcing offline-e2e on
every gate? **No.** The cache names are unversioned constants
(`snowroute-shell-v1` and siblings, `src/sw.js`), the worker script
changes only when `src/sw.js` itself is edited, and the offline pack is
the frozen Offline Contract v1 fixture set (897 URLs — identical across
the Beta 1.157 and 1.158 ships, asserted in both batteries). A version
bump changes app file bytes, not the shell's membership or identity.
offline-e2e therefore gates **Tier C and the nightly battery only** —
and any change that could touch it (`src/`, `sw.js`) is Tier C by this
map in the first place.
