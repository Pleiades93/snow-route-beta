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

Paths: `parts/head.html`, `parts/pmstyles.js`, `docs/`, `assets/`,
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
| create | `parts/create-cache.js`, `create-citydata.js`, `create-fetch.js`, `create-packs.js`, `create-pick.js`, `packs/` | 151 152 153 154 155 156 160 164 166 181 |
| map | `parts/engine.js` | 115 116 121 127 128 129 130 133 141 148 149 165 168 182 |
| session | `parts/app2.js`, `parts/app3.js`, `parts/app4.js` | 83 86 88 89* 114 118 125 135 136 140 145 146 147 159 161 162 163 169 170 |

*quarantined drives are removed from the set by the selector (drive89
today); they are listed here so the family's full membership stays
visible.

## Tier C — deep mechanics

Paths: `tests/`, `scripts/`, `.github/`, `src/`, `parts/app1.js` (route
state, storage slots, history, the finish state machine),
`parts/create-save.js` (the create→save write path), `parts/data.js`,
`sw.js`, `index.html`.
Gate: the FULL battery (all eight shards) + offline-e2e.
The nightly battery on main is unchanged: full battery + offline-e2e on
schedule, whatever the day's changes were. A manual `workflow_dispatch`
can force any tier (`tier` input: auto / A / B / C / full); the default
is a full (Tier C) run, as before.

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
