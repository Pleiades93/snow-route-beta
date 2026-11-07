# Development Rules — Snow Route Beta → Version 1.0

These rules govern every change to this repository. They exist so the app evolves
incrementally: preserve what works, prove that changes work, protect user data, and
turn every discovered bug into a permanent regression test.

## 1. The change process (every change, no exceptions)

1. **Define the goal** — one sentence: what changes and why.
2. **Inspect dependencies** — read the code and tests the change touches; check what
   else uses the same functions, storage keys, or contracts before editing anything.
3. **Assess risks** — name which existing features, data structures, or workflows
   could be affected, and what the rollback is.
4. **Branch** — work happens on a feature branch created from `main`
   (`github.py ref create-branch <name>`). Never commit feature work directly to
   `main`. `main` is the known-good line. **Exception (2026-11-05, Andrew —
   the shipping standard in §3): the visual tier ships directly to `main`.**
5. **Implement the smallest appropriate change** — no unrelated refactoring in the
   same change. Visual changes must not alter backend behaviour; backend changes
   must not unexpectedly alter the interface.
6. **Test** — run the applicable automated tests (see §3, including the test
   tiers). A test counts as passed only if it was actually executed and its
   result observed.
7. **Review the diff** — re-read the complete diff before merging; check for
   accidental edits, stale text, and claims the code does not enforce. Before
   pushing, run `scripts/premise-lint.py` against the branch's `parts/` diff:
   every drive premise (label, selector, contract string) the diff removes
   must have its drives updated in the same change, or the expiry recorded in
   the flake log the same day (Beta 1.136, programme E — the Beta 1.132 label
   rename silently expiring three drives is the worked example).
8. **Document** — update the docs the change makes stale, in the same change.
9. **Merge only when safe** — per the tier rules of §3 (2026-11-05
   standard): the visual tier has no branch and no battery; the feature tier
   merges with its build checks and touched-surface drives green; the merge
   gate of §3 (tree identity, `main` smoke + build green, live read-back)
   applies to branch merges.

**Source layout (Beta 1.94, audit F-02).** The app is edited in `parts/`
only. After editing a part, run `python3 scripts/assemble.py`, then
`python3 scripts/build-pages.py`; the build FAILS if
`src/tracker-source.html` is not exactly what the parts assemble to, so a
hand-edit of the generated file (or a forgotten assembly) cannot ship.
`parts/pmstyles.js` is itself generated — regenerate it with
`scripts/genstyles.mjs`, never hand-edit it. The generator's
`@protomaps/basemaps` dependency is PINNED exactly
(`scripts/package.json` + `scripts/package-lock.json`; install with
`npm ci` inside `scripts/`) — never regenerate from an unpinned install
(Beta 1.95, audit SR-194-11; the pinned 5.7.2 reproduces the shipped
styles byte-for-byte). The generator's OTHER input, CARTO's dark-matter
style, is VENDORED at `scripts/carto-dark-matter-style.json` (Beta
1.96, audit SR-195-08): the generator reads the vendored copy and
stamps its sha256 into the banner — no live fetch, no generation date,
so a regeneration from the same repo state is byte-identical.
Refreshing the vendored copy is deliberate: `node genstyles.mjs
--refresh-carto`, and the banner-hash change in the diff is the review
signal.

**Test harness contract (Beta 1.95, audit SR-194-07).** A page-side
evaluation error THROWS in the harness (`harness.mjs` /
`harness-http.mjs`) and fails the drive — it never returns a truthy
object a check could read as a pass. Checks record a pass only on
literal `true` (`cond === true` in every drive's `ok()`), and the runner
counts anything else as a failure. `tests/browser/selftest-runner.mjs`
pins all three behaviours (fixture-throw, fixture-truthy); run it after
any harness change. Browser STARTUP is the one retried step (Beta 1.96,
audit SR-195-09): a launch that never prints its DevTools line, or a
browser that exits first, is retried up to 3 attempts with the failed
attempt's stderr logged — the cold-runner first-launch failure that
killed a shard of scheduled run 41859112876 twice. The retry wraps only
the launch, before any page exists; three failures still crash the
drive and FAIL it. `fixture-startup` in the selftest pins both sides
(a fail-once browser passes via the retry; a dead browser fails). A check whose expression can throw transiently
(mid-reload reads) wraps itself in try/catch and returns an explicit
boolean — that is the drive's job, not the harness's.

**Tooling fallback (audit F-09).** The `github.py` helper is the normal
route for branch/push/merge/runs, but it is not the only one: if a
subcommand fails transiently (a branch creation did, 2026-11-04), drive
the same GitHub API through the helper module's `api()` function, plain
HTTPS git, or the web UI. The discipline above (branch → battery → merge
gate) is identical whichever route carries it — a tooling hiccup is
never a reason to skip a step, and never a blocker to report before the
fallbacks have been tried.

## 2. Per-change report (required with every merge)

- What changed and why.
- Which existing features or data structures could be affected.
- Tests executed and their actual results (counts, not adjectives).
- Any known limitations or remaining risks.
- How to roll back the change if necessary.

## 3. The regression gate

CI (`.github/workflows/checks.yml`) runs on every push to any branch:
`build-pages.py --check` (parity + integrity + CSP), the shard-coverage guard,
the service-worker unit suite, and the deterministic browser drives
(`tests/browser/run.mjs`). Since Beta 1.83 the drives run in four parallel
shards balanced by measured duration (since Beta 1.136 the lists are
GENERATED by `scripts/gen-shards.py` from the drive roster plus the measured
durations in `scripts/shard-durations.json` — re-measure and regenerate,
never hand-balance; the coverage guard fails the build if the shard lists
ever stop covering every drive exactly once, and every job carries a
`timeout-minutes` cap).
A push to `main` runs the build checks plus a critical-path smoke subset
instead of the full suite, and a nightly scheduled run repeats the full
sharded suite on `main` as the environment-drift audit.

- **Shipping standard (set 2026-11-05, Andrew — supersedes the 2026-10-30
  tiers below wherever they conflict).** Three tiers:
  - *Visual tier* — small visual changes (CSS, images, icons, moving a menu
    or button, adding a button, small menu changes): ship DIRECTLY to `main`
    with NO test battery. Kept steps are mechanical integrity only: the build
    check (`assemble.py` + `build-pages.py --check`), a hash-verified push
    (remote blobs compared to local files), and the live read-back.
  - *Feature tier* — new features and deep mechanics (GPS, storage handling,
    route handling, anything that could really break): branch + build checks
    + the drives covering the touched surface — enough to show the change
    does not break the app. The full battery is NOT required before merge.
  - *Full battery* — the complete suite runs ONLY on the nightly schedule
    (06:00 UTC on `main`, with the 4 AM catch-up dispatch and 6 AM summary),
    as the once-a-day net over everything that landed.
- **Test tiers (set 2026-10-30, Andrew; the pre-merge full-battery
  requirement for data-critical changes was retired by the 2026-11-05
  standard above — the nightly run is now that net).** Iteration and the merge gate are
  priced differently, so tinkering stays fast without weakening the gate:
  - *Tinkering iterations on a branch:* quick checks only — the build check,
    syntax checks, and the drives that cover the surface the change touches.
    Small tweaks may batch into one branch and one run. A full-battery
    read-back is not required per iteration.
  - *Data-critical changes* — storage keys or formats, backup/restore,
    GPS/coverage logic, finish/history, the service worker: the full battery
    runs on the branch before merge, every time, no exceptions.
  - *The merge gate (revised 2026-11-03, Andrew — CI-speed round):* the
    branch's final commit must have a green full battery. After merging, the
    gate is a proof, not a second sampling: the merged tree must be shown
    identical to the tested branch tree (file hashes at both commits — the
    same "same code" definition GitHub's own CI uses), `main`'s build checks
    and smoke subset must be green, and the live page is read back against
    the build. If the trees differ by even one byte, the full sharded suite
    is re-run on `main` (workflow_dispatch) before the round is called
    shipped — fail closed, no exceptions. The nightly full run on `main`
    covers what a tree hash cannot see (runner and browser drift). Test
    evidence is still recorded against exact commits (§6); a re-run that
    turns a failure green counts as green for that commit and is logged as a
    flake in the goal's flake log — a check that flakes three times is
    hardened or quarantined out of the gate, never just re-run forever.
- **Never weaken or delete a test assertion to obtain a pass.** When a test fails,
  establish whether the defect is in the app or in the test (state dumps, step
  traces, reproduction), fix the defective side, and say which it was. The
  drive89 history (docs/archive/AUDIT-REMEDIATION-REPORT.md §8) is the worked example:
  one genuine app defect (F-1) and several test-sequencing artifacts, each proven
  before being fixed.
- Every bug fixed gets a regression test that fails without the fix, added in the
  same change whenever the test surface allows it.
- The critical-scenario benchmark is the drive battery itself; new critical
  workflows join it as they are discovered.

## 4. Data protection and backward compatibility

- Storage keys and the backup envelope (`{app:'snowroute-backup', v:1, at, data}`) are
  a contract with production v5.81 and with every existing beta install. Changing
  any key, shape, or the missing-key policy requires: a documented schema note,
  an explicit migration, migration tests (synthetic AND captured-data), and
  Andrew's approval — it is never a drive-by edit.
- Restore stays transactional: validate → snapshot → write + verify → verified
  rollback → honest failure reporting. Do not weaken any step.
- GPS suggestions never mark a street; manual confirmation is a product invariant.
- Coverage thresholds (15m sampling / 22m radius / 85%) change only with
  reproducible-test evidence, never on a hunch.
- Production (`snow-route-5w-tracker`) is never modified as part of beta work.

## 5. Releases and rollback

- Known-good states are tagged (`baseline-*`, `v1.0.0`, …) so any state can be
  restored exactly. Rollback = push the tagged tree to `main` (or re-point Pages)
  and re-run the battery.
- Version identity (cache names, title, `#ver` label) changes only in a release
  change, never inside a feature change.
- Release bookkeeping is generated, not hand-kept (Beta 1.133, programme C):
  `scripts/release.py` is the single source for the battery counts quoted in
  README.md — it derives them from the suite, and `build-pages.py` asserts
  that derivation (and the What's New version alignment) on every build, so
  stale bookkeeping fails the build. The CHANGELOG entry and the What's New
  prose stay editorial; everything derivable is derived.
- Version 1.0 readiness requires, together: all critical workflows passing, zero
  open high-severity defects, existing beta data compatible, backup/restoration
  verified, offline behaviour verified under real disconnected conditions, the
  release process documented, and Andrew's explicit acceptance.

## 6. Honesty rules

- **Verification evidence is commit-bound** (set 2026-10-30, Andrew). Every
  test result is associated with the exact commit that was tested; a result
  is never transferred from one commit to another. After merging a change,
  verify the exact resulting commit on the target branch. Every verification
  record carries: the commit SHA, the CI run identifier, the executed test
  suites, the check counts, any failures, and the final outcome. Historical
  reports stay intact, but are labelled historical evidence for their own
  state only — e.g. the Beta 1.16 remediation battery (152/152 across 12
  drives) proves that state, never a later one.
- Never claim a test passed, a fix works, or a state was verified without the
  tool result that proves it.
- Distinguish confirmed defects, validation gaps, and unverified risks in every
  report; a suspicion is labelled a suspicion.
- If a check cannot be run (environment, access), say so and name what would
  unblock it — do not route around the admission.
