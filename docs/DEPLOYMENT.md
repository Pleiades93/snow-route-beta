# Deployment

## How GitHub Pages serves the app

Pages publishes the **root of the `main` branch**. `index.html` and `sw.js`
must stay at the root: the service worker's scope is the root and the app
registers it by relative path. `src/`, `scripts/`, `tests/` and `docs/` are
ordinary folders (Pages serves them too — the source is public by design).

## Build

```
python3 scripts/release-op.py
```

The one local release operation (architecture #22) owns the build end
to end: it derives the README battery counts from the suite,
assembles `parts/` (the canonical app source, in its fixed order)
into `src/tracker-source.html`, stamps the Content-Security-Policy,
writes `index.html` + `sw.js` at the root, then re-runs the three
`--check` forms (assemble, release, build-pages) as independent
verification and prints the artifact hashes. The steps it runs are
the standing scripts themselves — `scripts/release.py`,
`scripts/assemble.py`, `scripts/build-pages.py` — so the operation
cannot drift from them; run one individually only to debug it.

The generated files are never hand-edited: `src/tracker-source.html`,
`index.html` and the root `sw.js` are outputs. Edit the part (or
`src/sw.js`) and re-run the operation.

## Release flow

1. Work on a branch — never commit a release straight to `main`. Edit the
   app (assembled into `src/tracker-source.html`; `src/sw.js` when the
   worker changes). The version lives in exactly one place: the top
   `CHANGELOG.md` entry — assembly stamps it into the `#ver` label and
   the `WHATSNEW` entry (`parts/whatsnew.js`), and the build gate fails
   the build if the stamped copies disagree (the What's New comparison
   is gated since Beta 1.133; before that a stale entry shipped once and
   only a registry probe noticed). If the worker changed, bump its cache
   name (`snowroute-shell-vN`) too.
2. Run `python3 scripts/release-op.py` — the one release operation: it
   derives the README battery counts from the suite and rewrites them
   (generated bookkeeping is never typed by hand; the build asserts the
   same derivation, so skipping the operation fails the build),
   assembles the page, stamps and writes the artifacts, and verifies
   the result end to end.
3. Run the build and the gate (`docs/TESTING.md`) locally — since the
   testing-efficiency rollout (2026-11-23) every pull request runs the
   full battery; there are no tiers.
4. Push the branch. CI runs the build gate, the service-worker suite, and
   the full sharded browser
   battery and the offline end-to-end suite.
5. Merge to `main` only under the merge gate in `DEVELOPMENT_RULES.md`:
   the merged tree is proven identical to the tested branch tree, and
   `main` then runs the build gate plus the browser-smoke subset. The
   full battery runs on every pull request and again nightly on `main`
   as the environment-drift audit (there are no tiers since the
   2026-11-23 testing-efficiency rollout).
   Pages serves `main`, so the merge is the release.
6. Pages picks the files up within a few minutes; GitHub's edge cache can
   lag ~10 minutes behind the push.

## Updating the installed app

Open the app → Settings (the gear tab) → **Update**. It fetches the served
page without cache, compares its version label with the running one, and
reloads into the new build, confirming "Updated to vX.Y ✓". If it reports
you are up to date but the version at the bottom right of Settings shows an older one,
the edge cache has not caught up yet — wait a few minutes and retry.

## Rollback

Revert the release commit, or re-push the previous release's files. Every
release's generated files are reproducible from its own `src/` with the
build script, and the previous release is always reachable in history.

## Verifying a deployment

Settings shows the running build's version at the bottom right — compare it
with the release you intended to ship.
