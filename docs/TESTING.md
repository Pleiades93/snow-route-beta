# Testing

## Commands (run in CI on every push)

```
python3 scripts/build-pages.py --check   # generated files match source; parity + SRI integrity + CSP stamp
node tests/sw.test.mjs                   # service worker fetch-strategy tests
node tests/browser/run.mjs               # deterministic browser drives (the browser battery; in CI it runs sharded — see the CI shape note below)
node tests/browser/selftest-runner.mjs   # proves the runner's own verdicts (exit code, timeout)
```

The build check rebuilds `index.html` from `src/tracker-source.html` in
memory and fails if the committed file differs, if parity breaks, if the
service worker's integrity hashes drift from the page tags, or if the
page's stamped Content-Security-Policy (see `scripts/csp_stamp.py`) does
not match a fresh hash computation over the built page's own inline
script and style — a code change can never ship under a stale policy.

The service worker suite runs the worker's `cacheFirst` / `netFirst`
functions in Node with mocked caches and fetch — 22 cases: cache hits,
HTTP 503 with and without a cached copy, network failure, cache-write
failure, shell-vs-style confusion, slow-network responses (awaited, then
cached), tile error handling, and cache-write failures in `netFirst`.

CI shape (`checks.yml`): a build-and-test job (the build gate, a
shard-coverage guard that fails if the shard lists drift from the drive
list, and the service-worker suite); the browser battery split across
four shard jobs on branch pushes; a smoke subset (drives 89, 123, 132,
145) on pushes to `main`; the offline end-to-end job; and a nightly full
run on `main`. Merging follows the tree-identity gate in
`DEVELOPMENT_RULES.md`.

## Browser tests (in this repository, run in CI)

`tests/browser/` holds browser drives ported from the maintainer's local
battery — same filenames, same test bodies; only harness plumbing differs
(browser path, source path). Each drive boots the real app from
`src/tracker-source.html` in headless Chromium (Chrome DevTools Protocol,
Node built-ins only, no added dependencies), exercises it, and prints a
JSON result block; `run.mjs` aggregates the blocks and fails if any check
fails, any page exception occurs, a drive exits with a non-zero code, or a
drive overruns its timeout (300s default, `RUNNER_TIMEOUT_MS` overrides).
`selftest-runner.mjs` feeds the runner fixture drives — including one that
prints a passing block and then exits non-zero, and one that hangs — and
asserts each verdict, so the runner cannot silently go back to trusting
the printed block alone.

Drives boot through the shared preamble in `tests/browser/harness.mjs`
(`launchDrive` — browser spawn, CDP plumbing, request interception,
evaluate/poll helpers, and the `finish` tail), extracted verbatim from
the drives' former per-file copies. All 32 file:// drives are migrated
(Phase 1 pilot of five on 2026-11-02, the remaining 27 the same day —
local A/B and CI counts identical to the pre-migration baseline at
every step). Two drives needed harness options rather than plain
extraction: drive115 passes `failWhen` (its basemap-outage simulation
fails map-host requests on purpose) and drive116 passes `logDomain`
(its CSP checks read CDP Log entries). Drives 114/115/116 keep their
own tails (their exit paths differ from the standard finish). The
http-origin drives (119/121) boot through the sibling preamble in
`tests/browser/harness-http.mjs` (local-origin fixture servers plus the
same launch/until helpers), extracted the same way. drive117 is the
documented exception: its server switches content roots mid-drive
(the service-worker upgrade test), a genuinely different shape, so it
keeps its own preamble.

Since Beta 1.76 every boot ends at the route menu (no route is loaded
until one is picked), so file:// drives call `bootThrough(ev, poll)`
from the harness right after launch: it waits for the boot tail, clicks
Choose a route → Route 5W, and waits until the route is loaded and the
splash is gone. A route pick before the map exists is unreachable for a
real user (the menu only appears at the readiness gate, after the boot
tail), so `bootThrough` first waits for the boot to run — drives that
reload mid-test re-load the route after the reload (drive114's reload
helper; drive121's seeded sessions). drive145 is the menu's own drive:
the handover, both panes, the placeholder, the pick, the Settings order,
the Routes tab's full-screen menu and its badge, the per-route slot shape, the legacy→slot
migration and its abort fallback, and a v1 backup restoring into the
slot. drive132's splash checks now assert the menu handover and that
picking a route is what removes the splash; drive125 asserts the new
tab order and the three-row Settings menu. Beta 1.77 added the menu-
consistency checks to drive145 (N15–N17): every sheet's close X must
compute to the one shared corner-X style, and tap-away must close
every sheet — both enumerated from the DOM by class, so a future menu
is covered by the same checks the day it is built. The same drive
carries the automatic day/night checks (N18–N21: the computed sun
against the real Vaughan sun as absolute instants, automatic mode
across the year, the override's boundary hand-back and cold-open
reset, the override pair's backup carriage) and the route intro
flight (N22–N23: a pick starts wide of the fitted view and lands
exactly on it; the shared boot waits for the flight to settle). Beta 1.78 extends the same drive to the Routes
tab's full-screen route menu (N9–N9c: the takeover opens on the main
pane, the badge shows only in that mode, the menu's own X closes it;
N6b–N6c: a boot-mode render never badges, and after a pick the menu is
parked below the screen, not removed; N15 also compares the route
menu's X against the shared style; N16 asserts the takeover has no
tap-away; N17's tap-away enumeration covers the remaining sheets).

Coverage:

- `drive65` — stored-data validators: corrupt completion times and history
  are sanitized on load; good records survive.
- `drive66` — backup/restore: a valid backup restores exactly; unsupported
  versions and corrupt values are rejected; a mid-write storage failure is
  reported and the pre-restore state is kept.
- `drive83` — fault battery: prototype-key and malformed street/note data
  cannot corrupt state; a failed Finish (storage error) aborts honestly;
  a post-restore flush does not clobber restored data; a fully failed
  offline prep does not mark itself done.
- `drive86` — audit regression cases: restore and trail handling under
  malformed and legacy-shaped data.
- `drive88` — per-street notes and the per-clean detail view; the street
  counter respects dismissed suggestions.
- `drive89` — the Finish flow end to end: finish, history navigation, and
  the delete/clear pathways.
- `drive114` — migration regression: a partially completed record in the
  earlier bare sides format (and a street completed the street-level way)
  loads with its state exact, gains no fabricated per-side timestamps,
  keeps the work meter and pace inputs honest, and survives a
  backup/restore round-trip unchanged.
- `drive115` — the map-failure notice (v5.81): with every tile request
  refused, the notice appears, streets and marking keep working, the
  first successful tile clears it, dismissal sticks for the session, and
  the banner's layout is measured in both themes.
- `drive116` — the stamped build under its own Content-Security-Policy:
  the app boots with zero policy violations of its own, while an
  injected inline script and a foreign-host script are both refused.
- `drive117` — the service-worker upgrade lifecycle on a real local
  origin (the long-standing SW-02 gap): the app is served over HTTP from
  a per-run fixture (v1 = the shipped files; v2 = a bumped version label
  and shell cache name; the library CDNs are mirrored locally with
  byte-identical, SRI-verified files), the worker registers, activates
  and controls the page, and the app's own Update flow hands off to v2 —
  new shell cache in, old one deleted, the tiles cache and the marked
  route progress intact. Needs network access to download the two
  library files (verified against the SRI hashes in `src/sw.js`) and
  `openssl` to mint the mirror certificate.
- `drive118` — audit-remediation regression suite (2026-10-29): invalid
  coverage indexes and invalid GPS coordinates are rejected; coverage
  suggestion behaviour (partial coverage suggests nothing; a suggested
  street is never auto-marked; parallel streets do not bleed coverage);
  restore write failure with verified rollback; unverifiable rollback
  reported honestly; invalid nested history sanitized; current-format
  backup round-trip; a failed history write stops Finish with the run
  intact; a partial multi-key save reloads to a consistent state.
- `drive121` — data-safety rehearsal (Stage 3): a complete Beta 1.17 dataset
  frozen as a literal loads losslessly (sides, times, history, notes, trail,
  coverage, run state, night) and a backup of it is meaning-identical on all
  11 keys; then a restore whose browser is killed inside the reload pause
  still lands the restored state after relaunch. If a future format change
  fails this fixture, the change needs a migration — see STORAGE-SCHEMA.md.
- `drive120` — visual geometry (Stage 2): header controls in-bounds and
  non-overlapping in the default and street-selected states; the 40px side
  chips in-bounds with full separation, including with the stretch point
  pushed against the screen edge; the open menu column's 50px items in-bounds
  with clear gaps; the open list sheet fits the viewport; the closed sheet is
  fully hidden. Measurements only — no pixel comparison.
- `drive119` — true disconnected operation: online boot under worker
  control with the map style cached and one side seeded; the browser is
  killed and relaunched on the same profile with the network emulated
  OFFLINE — the app boots from its own caches, seeded progress is visible,
  the street is completed offline and persisted, and a second offline
  restart keeps the offline-made mark. Same local-origin fixture family
  as `drive117`.

Running locally:

```
node tests/browser/run.mjs            # all drives
node tests/browser/run.mjs drive83    # a single drive
```

The browser binary is chosen by the `CHROME_BIN` environment variable
when set (CI sets it by locating the runner's Chrome); otherwise the
maintainer's local Chromium is used when present, else `google-chrome`
from PATH. The drives fulfil the page's remote map/library requests
through Node fetch, so a run needs network access for those fetches; the
assertions themselves are all local app logic. In the file:// drives the
service worker file is deliberately 404'd to keep runs hermetic — worker
behaviour is covered by `tests/sw.test.mjs` and, end to end on a real
origin, by `drive117` and `drive119`.

## Local-only tests (not in CI)

The rest of the maintainer's drive battery runs locally on every release
but is intentionally not in CI:

- Animation and geometry drives — settings/menu geometry and measured icon
  spacing, menu and sheet animation profiles, the Pace/List motion
  comparison, header layout in every state. These assert pixel positions
  and mid-animation states; they are timing-sensitive and would be flaky
  in CI, so they stay local until a deterministic CI strategy exists.
- The SRI regression drive, which verifies the page refuses tampered
  library copies served from the live CDNs (network-dependent; the static
  hash-parity half of that guarantee is in the build check).
- GPS/coverage drives and the remaining historical regression drives.

CI therefore does **not** cover animation or fine geometry; those are
verified locally per release and, for layout, on device. GPS and coverage
LOGIC (fix validation, suggestion thresholds, parallel-street isolation)
is covered in CI by `drive118`; real-world GPS reception on the route
remains a device-only verification.

## The test-change gate (standing rule, Andrew, 2026-11-04)

A test that fails because of an error in the test itself burns the same CI
hour as a real defect and teaches nothing. Three e2e failures in one
afternoon (Phase 1, 2026-11-04) were all test bugs — a judging rule written
from an incomplete signature list, a setup wipe that deleted state later
checks depend on, a census taken while the work it measured was still
running. So a test change is not ready for CI until it passes this gate,
locally, first:

1. **Judging logic ships with fixtures.** Any predicate or comparison that
   decides pass/fail (retry rules, signature matchers, verdict math) is
   extracted into a shared module and proven in plain Node against written
   fixtures: every documented positive case AND the mutations/gains that
   must still fail. The fixture that covers a past misjudgment is that
   bug's permanent regression test. Current instance:
   `tests/browser/race-loss.mjs` + `selftest-race-loss.mjs` (runs in the
   offline-e2e CI job before the suite; also a snow fix-checks probe).
   Second instance (Phase 2, 2026-11-04): the app's own judging logic —
   the trail segment-acceptance rule in `trailSegments` — is proven by
   `tests/browser/selftest-trail-segments.mjs`, which extracts the shipped
   functions from the parts and checks them against golden outputs
   captured from the pre-refactor implementations
   (`tests/browser/fixtures/trail-golden.json`); runs in the build-and-test
   CI job, and also a snow fix-checks probe.
2. **A setup or reset enumerates its blast radius.** Before pushing, list
   the storage keys / caches / state the setup writes or deletes, and the
   keys every later check in the file reads. Overlap outside the check's
   own scope must be deliberate and commented, or the push stops. (The
   E17 attempt wipe once deleted the preload record, silently disabling
   the pack migration E19–E21 measure.)
3. **Waits poll the terminal signal, never a proxy.** A check waits for
   the system's own completion signal — an earned flag, a returned status
   object — not for an intermediate observable (entries appearing, counts
   moving). Where no signal exists, drive the function directly and await
   its return (E20's pattern) instead of observing side effects (E19's
   original pattern).
4. **Failures are classified before anything re-runs.** Every CI failure
   is entered in the snow goal's flake log as APP, TEST, or FLAKE with the
   evidence first. A failure that reproduces is not a flake; a TEST
   classification means the fix lands in the test and re-enters at step 1.

## Honest limitations

- The service-worker upgrade lifecycle is covered by `drive117` on a
  local origin in headless Chromium. The same handoff on the real
  Pages origin has **not** been run automatically — there it still
  rests on the versioned-cache design and on-device checks after
  each release.
- iOS installed-app behaviour (home-screen install, the standalone top
  band, update flow) is verified on a real device; no emulator covers it.
