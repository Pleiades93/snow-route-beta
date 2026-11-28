# Nightly fuzz

`tests/browser/fuzz.mjs` wanders the real app in the browser
harness, taking seeded random actions and checking state after
every one. It exists to catch what the scripted drives cannot:
breakage that only shows when features collide in an order no
one scripted. Its verdict is reported separately from the
scripted battery's green/red, and a fuzz failure is a finding
for triage - never a flake by default, and never retried into
green.

## Running it

Assemble the page first (the harness boots the assembled
source), then:

```
python3 scripts/assemble.py
node tests/browser/fuzz.mjs --seed 42 --steps 100 --work fuzz-out
```

Replay a recorded failure exactly:

```
node tests/browser/fuzz.mjs --replay fuzz-out/seed-42-step-3.json
```

Replay attempts the recorded action prefix with no new random
choices; it reproduces the stop it came from, or reports the
step where the prefix stopped reproducing.

## The nightly seat

`.github/workflows/fuzz.yml` runs on workflow_dispatch only -
it is not part of the pull-request gate, and nothing about the
merge gate depends on it. Each dispatch runs four seeds as
parallel jobs: seed base = UTC epoch day x 4, offsets 0-3, 100
steps per seed, a 480-second wall clock per seed inside a
ten-minute job cap. The 1 AM dispatch job calls it beside the
nightly battery; the 4 AM catch-up reuses that day's seeds.
Replay files are retained as job artifacts on failure and ride
the 6 AM summary as their own line:

```
FUZZ finding: L3
seed 42, step 3 (zero-based)
expected {"clones":true,"inclusion":true,"exclusion":true}; observed {"clones":true,"inclusion":true,"exclusion":false}
replay: node tests/browser/fuzz.mjs --replay <artifact-path>
```

A run that hits its wall clock writes a `seed-<n>-incomplete.json`
report and exits 3: that is incomplete coverage, reported as
such - not a finding and not a pass.

## The action alphabet

Every action is a pattern an existing drive already performs;
the fuzzer invents no gesture the app never sees in tests.
Boot picks Route 5W through the route picker (the harness's
bootThrough) and marks one side of Velmar through the app's
`togglePiece` path (drive196), so Clear has a real
confirmation to open.

| Action | Pattern in the existing drives |
| --- | --- |
| Map press | drive128 dispatches real pointer input to the map; the fuzzer uses CDP touch at the hittable canvas centre (drive148's canvas rectangle). |
| Zoom crossing | drive216 uses `map.zoomTo` at 15.7 and 13.98; the current zoom selects the opposite side of 15.2. |
| Tabs and menu buttons | drive196 presses the real Locate, Routes, Home, Clear and Settings targets; the route and settings menus open through their own controls. |
| Streets and Pace sheets | drive204 opens Streets (`streetsBtn`), drive212 opens Pace (`paceBtn`); both close through the app's own `sheetClose` / `paceClose` controls. |
| Clear, cancelled | drive212's Clear runs through `confirmPill` and presses Keep marks (`cfKeep`). |
| Draft Discard, cancelled | drive220 enters Create and seeds a real pack street; drive152 opens the discard ask with `crExit`, drive156 cancels it with `crModalNo`; the fixture then verifies Velmar survived the Cancel and exits Create. |
| Finish, cancelled | drive148 uses Start; drive89 opens `finModal` via `resetBtn` and closes it through `finNo`, polling the modal's own class. |

Excluded, deliberately: confirming Clear, Discard or Finish;
deleting routes; restore and import; the update flow; settings
mutations. The walk cancels every destructive dialog it opens.

## What is checked

After every action, two sets run. The harness health set is
execution-level: no page exceptions (the harness contract),
menu coherence (Routes and Settings mutually exclusive, the
current pane the rendered pane), and snow liveness on the blue
surfaces (drive226's `window.__snow` handles, cross-checked
against the DOM).

The invariant registry (`invariants` in fuzz.mjs) is the G-C
plug-in point named in docs/STATE-MODELS.md: every entry names
its model ID, and new model invariants a random walk can
observe register there.

| ID | What the walk observes |
| --- | --- |
| L1 | The wrong label carrier renders no route names on each side of the 15.2 crossing. |
| L2 | A positive witness: with route geometry in view at or above 13.98, the owning carrier renders at least one route name (an empty side fails - the drive216 P3 blindness). |
| L4 | No route name renders on both carriers at once (no overlap at the instant switch). |
| L3 | Style reads: the clone layers exist, their filters carry the route-name inclusion, and the originals' filters carry the exclusion. |
| L8 | Inside the Discard action: while creating, the clones are absent and the exclusion is lifted; after exit, both are restored. This is GAP-2's behavioural witness. |
| F3 | Exactly one `#banner` element exists - the single carrier. |
| C1 | Whenever a clean is live, the saved start key equals `runStart` (the identity half; drive225 S1 owns the full case). |

The finish flow is modelled as it behaves (Andrew's ruling,
2026-11-26): the fuzzer asserts no banner exclusion during
Finish, and no F1/F2/F5/F6 entry is registered - those stay
with drive225, drive232, proof-1304 and the formal trial. The
one banner guarantee in force is the shipped Beta 1.295 one,
which those checks own.

## Failure reports

A stop writes `seed-<seed>-step-<index>.json` under `--work`
(boot failures use index -1): the seed, the original step
budget, the attempted action prefix, the failing index, the
invariant name, expected and observed, and any page
exceptions. The file is the finding; triage replays it before
classifying anything APP, TEST or FLAKE.

## Determinism and its limits

The random choices are a pure function of the seed (a
mulberry-style PRNG in the file). A seeded run's action
sequence also depends on the state the walk observes -
hittability and app state gate the alphabet at each step -
so two runs of one seed on one tree walk the same path while
the app's state evolves identically; the replay file, not
the seed alone, is the exact record. Two named limits: the
label witness reads rendered features, so it depends on the
basemap tiles and fonts the harness fetches arriving (a
missing clone name with route geometry in view is a failure,
assets included); and the action loop starts after the
splash is removed, so splash snow is not exercised (the
live walk covers the splash on the real site).
