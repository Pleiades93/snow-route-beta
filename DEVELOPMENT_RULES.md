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
   `main`. `main` is the known-good line. **No exceptions: every change
   rides the pull-request gate in §3 — the 2026-11-05 direct-to-`main` form
   and the 2026-11-12 Tier-1 direct-push exception are both retired (see §3).**
5. **Implement the smallest appropriate change** — no unrelated refactoring in the
   same change. Visual changes must not alter backend behaviour; backend changes
   must not unexpectedly alter the interface.
6. **Test** — run the applicable automated tests (see §3 — every pull
   request runs the full battery; the test tiers are retired). A test
   counts as passed only if it was actually executed and its result
   observed.
7. **Review the diff** — re-read the complete diff before merging; check for
   accidental edits, stale text, and claims the code does not enforce. Before
   pushing, run `scripts/premise-lint.py` against the branch's `parts/` diff:
   every drive premise (label, selector, contract string) the diff removes
   must have its drives updated in the same change, or the expiry recorded in
   the flake log the same day (Beta 1.136, programme E — the Beta 1.132 label
   rename silently expiring three drives is the worked example). When the
   change alters any user-facing wording, also run `scripts/sweep-check.py`
   with the OLD strings before pushing (the mechanical form of the
   whole-tests-tree sweep rule — the 1.223 dash sweep's missed copies in
   drive118/136/161 and e2e-offline are the worked example): every hit is
   re-pinned in the same change or adjudicated per-occurrence in the
   sweep's own output.
8. **Document** — update the docs the change makes stale, in the same change.
9. **Merge only when safe** — per §3 as restructured by the
   testing-efficiency rollout (2026-11-23, Andrew's decision — the tiers
   are retired): every pull request runs the full battery (build checks,
   all drive shards, offline-e2e) before merge; the merge gate of §3
   (tree identity, `main` smoke + build green, live read-back) applies
   to branch merges.

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

**The one supported push path (/correct Phase 2, C2+C8).** Every push of
files goes through `scripts/push.py` (`push <root> --branch B --message
M <repo-relative path>...`): it refuses basename-only entries (the
helper's basename default scattered five pushes to the repo root), it
refuses a parts/ push that does not carry the fresh derived artifacts
(src/tracker-source.html, index.html), and it verifies the PUSHED
tree's blobs against the local files after the transport push. A
`plan` run validates the set without touching the network. Do not push
through the helper directly — the discipline it cannot enforce is the
point. Since the #178 machinery round (2026-11-23), the receipts,
census and mirrors gates below also run as steps in CI's
`build-and-test` job, so the pull-request gate enforces them even
when a change did not arrive via this path; the registry gate
remains push-path-only (below). Since /correct Phase 3 round (a), a push also runs the
**registry gate** first: the fix-checks registry's grep probes run
serially against the push tree, and any failure outside the recorded
standing-failures baseline refuses the push — a round whose code
motion orphans a probe literal re-pins it in the same round, instead
of the orphan surfacing whenever someone next runs the registry by
hand (the C1 class: six stale patterns reached the Beta 1.258
close-out unrun, and eight more had accumulated by 1.260). The gate
runs against the prospective tree the push would create as well as
the local tree, so a fix that is not in the push set cannot certify
the push. This gate has no CI step: the registry lives outside the
repo, so it runs only where the registry is present (this push path
and the weekly runner); issue #178 tracks the open decision on its
merge-gate status. Since /correct Phase 3 round (b), a push also runs the
**receipts gate**: a check or judge file the push changes (proofs,
drives, selftests, fixture suites, and the gate scripts they
exercise — the scope lives in `scripts/check-receipts.py`) must be
named by a current mutation receipt in
`tests/mutation-receipts.json` — the durable record of the check
observed failing under a named mutation or on the historical tree
(TESTING.md rule 6, class N1: the rule as prose let fixtures that
stayed green with the judges neutered, a sweep that passed silently
empty, and a drive that measured the harness instead of the app all
ship; the receipt is now a precondition of the push, verified
against the prospective tree like the registry gate). Since
/correct Phase 3 round (c), a push that changes any `parts/` file
also runs the **census gate**: the push must be named by a current
sibling census in `tests/sibling-census.json` whose derived rows
are all marked covered or not-applicable-with-reason — the
pre-push enumeration of the touched surfaces' sibling paths
(every door, exit, caller, state binding and mutation, theme
face and gesture path, derived from the tree by
`scripts/check-census.py`; TESTING.md rule 7, class N2: first
submissions covered the named path while the review seat
enumerated the siblings afterwards — Beta 1.255's confirmation
took four heads for the unbound question, the dock's second
Cancel door and the sheet click-away exit). The gate re-derives
the rows from the prospective tree, so a hand-typed census that
omits a derived sibling cannot certify the push; a round that
changes no `parts/` surface records a machinery-exempt entry in
the same ledger instead. Since /correct Phase 3 round (d), a push
also runs the **mirrors gate**: `scripts/check-mirrors.py` verifies
the tree's hand-maintained mirrors against their sources — the
declaration file's typedefs and cross-part globals against the
parts, the foreign-write census's universe and named exclusions
against the assembler's part list, the selftests' CI wiring
against the disk, the shard lists against the generated
partition, and the receipts gate's judge list against the
`check-*.py` files on disk (TESTING.md rule 8, class C4
generalized: Phase 2's closure guarded the drive roster and the
same shape fired on every unguarded mirror after it — the types
file at 1.258 and again at 1.259, the packfields expectations,
the census universe silently missing an assembled part). A mirror
that can be derived is derived instead (the fixture rosters in
round (a); the packfields cap list in this round); the rest are
checked on every push, against the prospective tree like the
other gates.

## 2. Per-change report (required with every merge)

- What changed and why.
- Which existing features or data structures could be affected.
- Tests executed and their actual results (counts, not adjectives).
- Any known limitations or remaining risks.
- How to roll back the change if necessary.

## 3. The regression gate

CI (`.github/workflows/checks.yml`) runs on every pull request, on pushes
to `main`, and on manual dispatch (since the 2026-11-12 gate hardening a
branch push fires no run at all — the pull-request run is the only source
of the required checks for a PR head):
`build-pages.py --check` (parity + integrity + CSP), the shard-coverage guard,
the service-worker unit suite, and the deterministic browser drives
(`tests/browser/run.mjs`). Since Beta 1.83 the drives run in parallel
shards balanced by measured duration (eight shards since the 2026-11-09
test-suite restructure) (since Beta 1.136 the lists are
GENERATED by `scripts/gen-shards.py` from the drive roster plus the measured
durations in `scripts/shard-durations.json` — re-measure and regenerate,
never hand-balance; the coverage guard fails the build if the shard lists
ever stop covering every drive exactly once, and every job carries a
`timeout-minutes` cap).
A push to `main` runs the build checks plus a critical-path smoke subset
instead of the full suite, and a nightly scheduled run repeats the full
sharded suite on `main` as the environment-drift audit.

- **Absent checks — first diagnostic (grafted 2026-11-13 from SAFO's lessons, Andrew approved).** When a pull request shows NO checks at all — absent, not failed — read its mergeable state before suspecting the reviewers, the bridge, or the workflows: a PR that conflicts with `main` has no merge commit for GitHub to run checks against, so no run ever starts, and closing and reopening it does not help. Resolve the conflict (or rebase onto current `main`) and the checks appear. Status and audit reports name a CONFLICTING or BEHIND pull request as such, never as a gate failure.

- **Shipping standard (set 2026-11-05, Andrew — supersedes the 2026-10-30
  tiers below wherever they conflict; its tier mechanics were superseded
  by the 2026-11-09 test-suite restructure, and THE TIERS THEMSELVES WERE
  RETIRED by the testing-efficiency rollout, 2026-11-23, Andrew's
  decision).** Every pull request now runs the full battery before merge,
  whatever the change class; a hash-verified push (remote blobs compared
  to local files) and the live read-back close the ship; the complete
  suite also runs nightly on `main` as the once-a-day net over everything
  that landed — dispatched by Muse's 1 AM job via `workflow_dispatch`
  (checks.yml has carried no GitHub schedule trigger since 2026-11-10),
  with the 4 AM catch-up dispatch and 6 AM summary. (History: the
  2026-11-05 standard priced the gate by change class — a visual tier
  merging on build checks + the core drive set, a feature tier merging
  on build checks + the touched surface's drives, the full battery only
  for deep-mechanics changes and the nightly net. That pricing is over.)
- **Test tiers (set 2026-10-30, Andrew; the tier framing was retired
  by the testing-efficiency rollout, 2026-11-23 — every pull request now
  runs the full battery, so the data-critical rule below states the
  universal rule, and the nightly run remains the drift net).** Iteration and the merge gate are
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
    flake in the goal's flake log. The operative flake policy — the
    focused re-run and what a second flake triggers — is the FLAKE RULE
    stated in the header of `.github/workflows/checks.yml`; it governs,
    and this document does not restate it.
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

- **The pull-request gate (set 2026-11-11, Andrew — the standing shipping
  pipeline).** All feature work rides pull requests; `main` is protected and
  merges happen only through the gate:
  - Four required status checks, all on the PR's head commit: `plan`,
    `build-and-test`, `tier drives` (the fixed-name aggregator in
    checks.yml — it passes only when the full shard battery succeeded,
    and fails closed when it did not run),
    and `codex review gate`.
  - Codex's automatic cloud review is a required verdict, not a courtesy:
    it posts no check of its own, so `.github/workflows/codex-bridge.yml`
    (trigger: `pull_request_target`) runs `scripts/codex-bridge.py` from
    the BASE branch and reports Codex's verdict as the `codex review gate`
    check. The gate passes only when Codex's review of the exact head
    commit completed with no unresolved findings; findings, an unreadable
    state, or a 15-minute timeout all fail closed. Because the workflow and
    script come from the base branch, a PR cannot rewrite its own gate.
  - With auto-merge enabled on a PR, GitHub merges it itself once all four
    checks are green and the branch is up to date — nobody merges by hand
    around the gate. Administrators are bound by the same protection
    (enforce_admins on); force pushes and branch deletion are off.
  - Codex reviews draw on Andrew's ChatGPT plan allowance. Deliberate deep
    audits are a separate, unchanged process: each round still needs
    Andrew's explicit say-so.
  - Known limit: the bridge re-evaluates on PR lifecycle and commit events;
    if a review's findings are resolved without a new commit, re-run the
    `codex review gate` job from the Actions tab to refresh the verdict.
  - Codex reviews a PR when it is opened (or marked ready). After any later
    push changes the head, summon a fresh review with a `@codex review`
    comment — the bridge accepts only a verdict naming the current head
    commit, so an unsummoned push leaves the gate red by design.
  - Changes to the gate itself (checks.yml, the bridge workflow or script,
    the protection contexts) ride PRs like everything else. The bridge half
    takes effect on the NEXT pull request: the running gate always comes
    from the base branch, never from the PR being judged.
  - **No direct-push lane (2026-11-12, Andrew — the Tier-1 exception is
    retired the day it was decided).** The Tier-1 exception adopted on
    2026-11-12 (small visual changes — CSS, images, icons, moving or
    adding a menu, button or icon — shipping direct to `main` on
    mechanical integrity alone) is reversed: GitHub refused the first
    direct ref update under this protection (HTTP 422 — required status
    checks expected; with enforce_admins on, protection binds the push
    route too, not just merges). As of 2026-11-12 every change rides this
    gate, Tier-1 small visuals included.

- **Test machinery (Clause 1 of the retired tier map, carried here by
  the testing-efficiency rollout, 2026-11-23).** **Clause 1 — test changes follow their feature.** The drive files
  (`tests/browser/drive*.mjs`) are how a feature's checks ship; they are
  not deep mechanics, and a change to drive files is judged as part of
  its feature's change. What IS the test *machinery* — the thing that
  decides and runs the verdicts, changed only with verdict fixtures and
  mutation receipts — is `tests/browser/harness*.mjs`, the runners
  (`tests/**/run*.mjs`, `scripts/run-proofs.py`), the gate scripts
  (`scripts/check-*.py`, `scripts/push.py`, `scripts/gen-shards.py`) and
  the checks workflow. Everything else under `tests/` (fixtures,
  selftests, the service-worker test) is test content, not machinery.

## 4. Data protection and backward compatibility

- Storage keys and the backup envelope (`{app:'snowroute-backup', v:1, at, data}`) are
  a contract with every existing install (the contract originated with
  production v5.81; that repo was deleted on 2026-11-13 — final archive
  kept locally — and the contract now binds through the beta installs
  and the archived v5.81 backups). Changing
  any key, shape, or the missing-key policy requires: a documented schema note,
  an explicit migration, migration tests (synthetic AND captured-data), and
  Andrew's approval — it is never a drive-by edit.
- Restore stays transactional: validate → snapshot → write + verify → verified
  rollback → honest failure reporting. Do not weaken any step.
- GPS suggestions never mark a street; manual confirmation is a product invariant.
- Coverage thresholds (15m sampling / 22m radius / 85%) change only with
  reproducible-test evidence, never on a hunch.
- The old production repo (`snow-route-5w-tracker`) and the prototype repo
  were deleted on 2026-11-13 (Andrew's decision; final archives kept
  locally): Snow Route Beta is the only snow app, and no production
  surface remains to be modified as part of beta work.

## 5. Releases and rollback

- Known-good states are tagged (`baseline-*`, `v1.0.0`, …) so any state can be
  restored exactly. Rollback (revised 2026-11-17, protocol fix round) = a
  revert PR through the gate that restores the prior code under a NEW version
  label — the bad build's code is backed out but the label goes UP to N+1,
  with a CHANGELOG entry saying so — because the app's update check installs
  only a strictly newer label and ignores an older or equal one; a pure
  revert to N−1 would never reach the phones that took the bad build. Two
  limits, stated plainly: a phone that never comes online keeps the bad build
  until it does, and a rollback cannot undo data a bad build already wrote
  to storage.
- Version identity (cache names, title, `#ver` label) changes only in a release
  change, never inside a feature change.
- Release bookkeeping is generated, not hand-kept (Beta 1.133, programme C):
  `scripts/release.py` is the single source for the battery counts quoted in
  README.md — it derives them from the suite, and `build-pages.py` asserts
  that derivation (and the What's New version alignment) on every build, so
  stale bookkeeping fails the build. The CHANGELOG entry and the What's New
  prose stay editorial; everything derivable is derived.
- **Version rule (2026-11-12, Andrew):** the Beta number bumps only when a change is one Andrew would notice or asked for — a feature, a visual change, a behaviour change, or a fix for something he has seen. That PR carries the bump (version label + CHANGELOG top entry + WHATSNEW must agree). Maintenance merges silently with no bump: bot/sweep fixes, refactors, test and gate work, docs. Every bump's CHANGELOG entry notes 'plus N maintenance PRs since Beta <previous>' so silent merges stay accounted. The exact code at any moment is identified by the main commit SHA, not the version label.
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
