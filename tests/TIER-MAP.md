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

Paths: `docs/`, `assets/`, `manifest.json`, any `*.md`, `parts/whatsnew.js`.
(Arch-1, 2026-11-18: `parts/whatsnew.js` joins this list — it is the
What's New data part: editorial prose whose version is stamped from the
CHANGELOG top by the assembler and whose alignment the build gate
enforces on every build, so a prose-only edit is a copy change. Its
render code lives in `parts/app5.js`, session family below.)
(Until 2026-11-17 this list also carried `parts/head.html`,
`parts/pmstyles.js` and `parts/brand-snow.js` — see the 2026-11-17
amendment below for where each went and why.)
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

Gate: build-and-test + the **core set** + the touched surface's family
(the protocol's "B = core + family" — the core union was added by the
2026-11-17 amendment below; before it, the selector ran the family
alone and the protocol text and the machine disagreed):

| Family | Paths | Drives |
| --- | --- | --- |
| create | `parts/create-cache.js`, `create-citydata.js`, `create-fetch.js`, `create-packs.js`, `create-pick.js`, `packs/` | 151 152 153 154 155 156 160 164 166 181 183 185 208 214 215 217 218 |
| map | `parts/engine.js` | 115 116 121 127 128 129 130 133 141 148 149 165 168 182 214 216 217 |
| session | `parts/app2.js`, `parts/app3.js`, `parts/app4.js`, `parts/app5.js` | 83 86 88 89* 114 118 125 135 136 140 145 146 147 159 161 162 163 169 170 184 203 207 210 211 212 213 214 218 219 |

*quarantined drives are removed from the set by the selector, unless
the change itself touches them — a touched drive always runs
(2026-11-17) — (drive89 today; drive181 was quarantined 2026-11-09 and re-admitted 2026-11-10
after its hardening proved out — entry removed in the housekeeping
cleanup; drive156 was quarantined 2026-11-11 — check 157-D1 flaked
twice on record and the drive was hardened in the drive156-harden
round — and is re-admitted in the spring-t0-fix round (Beta 1.172,
2026-11-11): the app's first-frame spring artifact behind the residual
failures is fixed, 157-D1 re-proved clean, entry removed there —
and RE-quarantined the same evening (2026-11-11) after check C1
flaked twice more on identical app code (quarantine.json records 2
and 3: the C1 press landing mid-layout, classified FLAKE both
times); it remained quarantined until the B5/B6 round (PR #30,
2026-11-13) proved the remaining failures a test synchronization
defect — the press fired while the sheet was mid-flight, so the
gesture never reached the panel head — and hardened the test with a
rest-wait on the app's terminal signal (B5/B6 passing 9/9 completed
exercises across local and CI runs); the quarantine is LIFTED
2026-11-14 on Andrew's decision and the drive gates in Tier A/B
again; the C section was then hardened the same day (Andrew's
call — 'Harden the C section anyway'): its presses now wait for
the menu entrance's terminal signal (computed transform 'none',
no animation running) before firing, and C2's outcome reads
judge the pane 'on' class alone (their inline-display clause
could not fail — Settings panes hide by class only), proven
with instrumented captures of both loss channels and 10/10
consecutive C-section exercises;
drive186 was quarantined 2026-11-11 — checks D1–D5 flaked twice on
record with the identical 'stitched' undefined signature (runs
43029275837 and 43060145115) and the drive was hardened in the
drive186-harden round — and is re-admitted in the same round
(2026-11-11): the flake was diagnosed TEST-class (a loadRoute fired
before bootMap leaves the paint engine's geometry unbuilt for the
page; the production route picker cannot reach that window),
loadSettled now gates loadRoute on the map existing, and the
hardened drive re-proved 13/13 in 10 consecutive local runs and in
the Tier C battery, entry removed there); they
are listed here so the family's full membership stays visible.

## Tier C — deep mechanics

Paths: `tests/` and `scripts/` and `.github/` and `src/` (for `tests/`,
read the amendments below first: drive files and proof files ride with
their feature, and only the machinery itself is Tier C on its own — the `tests/`
prefix remains the backstop for everything else under it, fixtures and
selftests included), `parts/app1.js` (route
state, storage slots, history, the finish state machine),
`parts/create-save.js` (the create→save write path), `parts/data.js`,
`sw.js`.
Gate: the FULL battery (all eight shards) + offline-e2e.
The nightly battery on main is unchanged: full battery + offline-e2e,
dispatched by Muse's cron via `workflow_dispatch` (01:00
America/Toronto, with a 04:00 catch-up dispatch and a 06:00 summary —
checks.yml carries no schedule trigger), whatever the day's changes
were. A manual `workflow_dispatch` can force any tier (`tier` input:
auto / A / B / C / full); the default is a full (Tier C) run, as
before. Since 2026-11-17 a dispatch is only honoured on `main`: the
plan job fails any dispatch on another ref, because a manual run on a
pull-request branch would post a skipped `tier drives` check on the
PR's head and GitHub counts a skipped required check as passing.

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

## Amendment — 2026-11-17 (protocol fix round, Andrew approved)

Four clauses from the 2026-11-17 protocol audit (Codex: SOUND WITH
FIXES) as adjudicated by the Claude third seat; Andrew approved the
full list the same day.

**Clause 1 — Tier B is core + family.** The protocol (§3) always said
"B = core + the touched family's drives"; the selector ran the family
alone. The machine now matches the text: every Tier B selection unions
the core set, and the selector fixtures assert the complete sets.

**Clause 2 — a touched drive always runs.** Quarantine removes a drive
from sets it was pulled into (core, family), never from a change that
edits the drive itself — its own checks must verify its own change.

**Clause 3 — Tier A narrows to what the core set can see.**
`parts/head.html` leaves Tier A: it holds the page structure (the
selection card's markup, found by ID from the code) plus the global
styles, so a filename-only Tier A could wave a behaviour break through
on a core set that never exercises it. `parts/brand-snow.js` leaves
too: it is a 240-line running animation program, not a style (this
supersedes clause 2 of the 2026-11-09 amendment above). Both now fall
to the map default (C). `parts/pmstyles.js` is a generated output
(`scripts/genstyles.mjs` from the vendored CARTO style; build-and-test
proves regeneration byte-identical), so it never classifies — its
sources under `scripts/` carry the tier.

**Clause 4 — proofs ride along, and the manifest is the wiring.**
Proof files (`tests/proof/**`) never classify a round, like drive
files: build-and-test runs every proof from `tests/proof/manifest.json`
at every tier (`scripts/run-proofs.py`), and
`scripts/check-proof-coverage.py` fails the build unless every proof
file is gate-run or retired with a reason. Registering a proof is one
manifest line — the old per-proof steps in checks.yml, whose edits
forced nearly every round to Tier C, are gone. The gate's own
machinery (workflows, bridge, selector, guards, this map) stays Tier C.

**Clause 5 — mutation receipts ride along (2026-11-21).**
The mutation receipts file (`tests/mutation-receipts.json`,
/correct Phase 3 round (b)) never classifies a round either: it is
bookkeeping that must accompany every check change, so classifying
it would escalate exactly the changes that carry regression tests
to Tier C (Codex P2 on PR #155). The tier comes from the change
itself; the receipts file rides with it.

**Clause 6 — the sibling census rides along (2026-11-21).**
The sibling census file (`tests/sibling-census.json`,
/correct Phase 3 round (c)) never classifies a round either: it is
bookkeeping that must accompany every parts change (the push gate
refuses a parts change no current census names), so classifying
it would escalate exactly the changes the census exists to
accompany. The tier comes from the change itself; the census
file rides with it.

Also in this round: drive201/drive202 left the session family (the
drives were deleted in Beta 1.221 with the icon-pack picker they
tested; the roster entries were the drift), drive203 joined this
document's session row to match the JSON, `scripts/check-tier-map.py`
now guards every roster entry and the JSON/MD pair on every build, and
the plan job fails any `workflow_dispatch` on a ref other than `main`
(the skipped-check hole — see the Tier C section above).

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
