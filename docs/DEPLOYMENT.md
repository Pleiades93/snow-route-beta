# Deployment

## How GitHub Pages serves the app

Pages publishes the **root of the `main` branch**. `index.html` and `sw.js`
must stay at the root: the service worker's scope is the root and the app
registers it by relative path. `src/`, `scripts/`, `tests/` and `docs/` are
ordinary folders (Pages serves them too — the source is public by design).

## Build

```
python3 scripts/build-pages.py
```

Reads `src/tracker-source.html` + `src/sw.js`, writes `index.html` +
`sw.js` at the root, and runs the parity and integrity checks. Never
hand-edit `index.html` or the root `sw.js`.

## Release flow

1. Work on a branch — never commit a release straight to `main`. Edit the
   app (assembled into `src/tracker-source.html`; `src/sw.js` when the
   worker changes). Bump the version in both places that carry it: the
   `#ver` label in the page and the top `CHANGELOG.md` entry — the build
   gate fails the build if they disagree. If the worker changed, bump its
   cache name (`snowroute-shell-vN`) too.
2. Run the build and the full battery (`docs/TESTING.md`) locally.
3. Push the branch. CI runs the build gate, the service-worker suite, the
   full sharded browser battery and the offline end-to-end suite.
4. Merge to `main` only under the merge gate in `DEVELOPMENT_RULES.md`:
   the merged tree is proven identical to the tested branch tree, and
   `main` then runs the build gate, a smoke subset and the offline suite.
   Pages serves `main`, so the merge is the release.
5. Pages picks the files up within a few minutes; GitHub's edge cache can
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
