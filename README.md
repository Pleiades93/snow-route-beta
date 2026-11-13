# Snow Route

**Status:** Beta

Snow Route is a mobile-first web app for tracking snow-clearing work route by route. It lets a snow-clearing operator choose an existing route or create a new one, then mark street sections and each side of a street as they are completed, so finished and remaining work are visible at a glance.

Each route keeps its own progress, notes, and history. Snow Route is designed for phone use in the field, with GPS follow, pace information, day and night maps, and downloadable maps for offline use. It has no account or server: data is stored on the device, and a backup can be exported as a file.

## Live app

- **Try Snow Route:** https://pleiades93.github.io/snow-route-beta/

## What it does

- **Choose or create a route:** Open an existing route or create a new route in the app. Each route keeps separate progress, notes, and history.
- **Track street sections and sides:** Streets are divided into sections at junctions. Each side of a section can be marked complete independently, and a whole street can also be completed from its information panel.
- **See work as it is completed:** Completed sections and sides are shown on the map, finished stretches join into a continuous line, and the app shows how much of each street and route is done.
- **Run a work session:** Start and finish a work session, review the streets completed during it, and compare pace with the most recent full work session. Previous work sessions remain available in the route history.
- **Use GPS without giving it control:** GPS follow keeps the operator’s position on the map during a work session. The app can suggest streets that appear covered, but it never marks a street automatically.
- **Keep street notes:** Notes can be kept with individual streets and reviewed as part of that route’s information.
- **Work in day or night conditions:** The map provides day and night styles, switches automatically according to the sun, and allows a manual override for the current session.
- **See buildings in three dimensions:** Tilting the map can show building footprints as three-dimensional forms while the top-down view remains unchanged.
- **Work offline:** Map data can be downloaded in advance for offline use. Maps viewed in the app are also cached for later use without a connection.

## Backup & restore

Snow Route stores its data on the device. From Settings, an operator can export a JSON backup containing route data and app settings, or restore a backup from a JSON file or pasted text. A restore checks the backup before applying it and reports the result.

The detailed storage format and restore rules are documented in `docs/STORAGE-SCHEMA.md` and `docs/ARCHITECTURE.md`.

## Files

| File | What it is |
|---|---|
| `parts/` | **The canonical application source — the only place the app itself is edited** (since Beta 1.94). Fifteen part files (markup/CSS, route data, the four core app parts, route creation in six, the paint engine, the snow layer, the generated basemap styles) that `scripts/assemble.py` concatenates into the single-file page, in the order listed in `docs/ARCHITECTURE.md`. |
| `src/tracker-source.html` | **Generated** by `scripts/assemble.py` from `parts/`. Never hand-edit — the build fails if it differs from what the parts assemble to. |
| `src/sw.js` | The authored service worker source (offline open + tile caching). Edited here; copied to the root by the build. |
| `index.html` | **Generated** deployable build: the source plus its stamped Content-Security-Policy. This is what GitHub Pages serves. Never hand-edit. |
| `sw.js` | **Generated** copy of `src/sw.js`. Must sit beside `index.html` on an https host. Never hand-edit. |
| `scripts/assemble.py` | Concatenates `parts/` into `src/tracker-source.html` (byte-exact recipe; `--check` verifies without writing). |
| `scripts/build-pages.py` | The repository-owned build: generates `index.html` + `sw.js` from `src/` and runs the assembly, parity, CSP, integrity and version gates. Standard library only. |
| `scripts/release.py` | The release bookkeeping generator (Beta 1.133): derives the battery counts quoted in this README from the suite itself and rewrites them — the counts are generated, never hand-kept — and prints the release checklist (generated steps vs editorial ones). The build fails if the README disagrees with its derivation. |
| `scripts/csp_stamp.py` | Computes the Content-Security-Policy the build stamps into the page. |
| `scripts/genstyles.mjs` | Regenerates `parts/pmstyles.js` (the two embedded Protomaps basemap styles) from the `@protomaps/basemaps` package (pinned exactly by `scripts/package.json` + `package-lock.json` — `npm ci` in `scripts/` first); run from `scripts/`. Never hand-edit its output. |
| `packs/` | The app's own street library: `index.json` (the catalogue) + 12 city pack JSONs, downloaded once per city by the create flow's city-pack seam. |
| `assets/launch/` | The 12 launch stills (one per device size). |
| `scripts/gen-shards.py` | Generates the CI browser-test shard lists in `.github/workflows/checks.yml` from the drive roster plus the measured durations in `scripts/shard-durations.json` — re-measure and regenerate, never hand-balance. |
| `scripts/check-shard-coverage.py` | The shard-coverage guard: fails the build if the CI shard lists ever stop covering every drive exactly once. |
| `scripts/premise-lint.py` | The premise lint (Beta 1.136): flags drive premises (labels, selectors, contract strings) that a `parts/` diff removes, so expired drives are caught in the same change. |
| `scripts/shard-durations.json` | The measured per-drive durations `scripts/gen-shards.py` balances the CI shards by. |
| `scripts/carto-dark-matter-style.json` | The vendored CARTO dark-matter basemap style (Beta 1.96): `scripts/genstyles.mjs` reads this copy and stamps its sha256 into the generated banner — no live fetch at generation time. |
| `tests/sw.test.mjs` | Service worker fetch-strategy tests (Node, mocked caches/fetch) — 33 checks. |
| `tests/browser/` | The deterministic browser drive battery (72 drives, 1205 checks) plus the offline end-to-end suite (46 checks) — see `docs/TESTING.md`. |
| `docs/` | `ARCHITECTURE.md`, `STORAGE-SCHEMA.md`, `TESTING.md`, `DEPLOYMENT.md`, `OFFLINE-CONTRACT.md` — the detailed references — plus `docs/archive/` (retired-era documents kept for history). |
| `DEVELOPMENT_RULES.md` | How changes are built, tested and merged in this repo. |
| `CHANGELOG.md` | What changed in each Beta version. |
| `manifest.json` | Home-screen install metadata (name, icons, full-screen launch). |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `icon-maskable-512.png` | App icons for the home screen (the Signal Asphalt design — glossy snowflake traced by an asphalt road — at every size; the maskable one is padded so round icon masks do not clip the snowflake or its road trace). |

## Build & parity

`index.html` is **generated** from `src/tracker-source.html` by the build
script in this repository — it is never hand-edited:

```
python3 scripts/assemble.py              # parts/ -> src/tracker-source.html
python3 scripts/build-pages.py           # build + verify (writes index.html, sw.js)
python3 scripts/build-pages.py --check   # verify only: committed files match a fresh build
node tests/sw.test.mjs                   # service worker tests
```

The only intentional difference between source and deployment is the
stamped Content-Security-Policy: the build reverses it and asserts the
result is byte-identical to the source, so any other difference fails the
build. The build also asserts that the service worker's library integrity
hashes match the page tags exactly, that the policy names every host the
styles use, that the version the app displays equals the top
`CHANGELOG.md` entry — a stale version label cannot ship — that the
What's New entry carries the same version, and that the battery counts
quoted in this README equal `scripts/release.py`'s derivation from the
suite. One more assembly-time step (Beta 1.133): `parts/head.html` holds
a placeholder where the splash icon belongs, and `scripts/assemble.py`
inlines the exact bytes of `icon-512.png` there — the shipped page is
unchanged, the source part is ~281 KB smaller and reviewable.

CI (GitHub Actions) runs the build gate and the service-worker suite on
every push; the browser battery runs sharded across eight jobs, at the
tier the change classifies for (`tests/TIER-MAP.md`): the Tier A core set on
`main` pushes, the touched families' drives (Tier B) or the full battery
(Tier C) on branches, and the full battery nightly — dispatched by Muse's
1 AM job, since checks.yml carries no schedule trigger. How changes are
merged is in `DEVELOPMENT_RULES.md`; functional testing is in
`docs/TESTING.md`; deployment is `docs/DEPLOYMENT.md`; architecture is
`docs/ARCHITECTURE.md`; the storage layout is `docs/STORAGE-SCHEMA.md`.

## Running it

GitHub Pages serves `index.html` straight from the `main` branch — merging
to `main` is the whole deploy. Without `sw.js` beside it, everything works
except the offline open; without `manifest.json` and the icons, the
home-screen install just loses its name and icon. Update an installed copy
from inside the app: Settings → About → **Update**.

Map data © OpenStreetMap contributors; vector styles: Protomaps; basemap
tiles: © CARTO.
