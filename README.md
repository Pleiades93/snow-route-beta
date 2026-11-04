# Snow Route Beta

A snow-clearing route tracker built for one operator working from a phone in a
truck — in the dark, with gloves-adjacent tapping and spotty signal.

It started as a tracker for one 34-street route in Vaughan, Ontario, and has
grown into a small route system: routes are **data packs**, and storage,
backups and the route menu are all per-route. **Route 5W (Vaughan)** is the
pack that ships today; nothing in the app is tied to Vaughan — a new area is
a new pack, not a new app. There is no server and no account; all progress
lives on the device.

## Live

- **GitHub Pages:** https://pleiades93.github.io/snow-route-beta/

## What it does

- **Route menu:** the app opens on a route menu (Choose a route; route
  creation is a placeholder for now). The Routes tab reopens it any time.
  Picking a route loads that route's own progress, notes and history.
- **Streets and sides:** route streets are drawn from real OpenStreetMap
  centrelines, cut into stretches at every junction, and each stretch's two
  physical sides are marked separately — the road plow leaves a windrow on
  both sides, and the two sides are rarely cleaned in the same pass. Tap a
  stretch and use the arrow chips that pop up on each side of the road; a
  cleaned side shows as a green edge line, and consecutive finished
  stretches join into one continuous line. Main streets (cleaned first) are
  gold, the rest raspberry, finished mint; a street counts done when every
  stretch is done on both sides, and the info panel can still complete a
  whole street in one tap.
- **Runs:** Start / Finish with an 8-second Undo, a pace readout against
  your last full clean, a per-street progress count, and a history of
  previous cleans. Per-street notes ride along.
- **GPS:** follow mode with a heading-up camera during a run, a recorded
  trail (only while a clean's own GPS is running), and coverage suggestions
  — a street that looks covered is *offered*, never auto-marked.
- **Sheets:** the Streets list and the Pace panel are draggable sheets with
  three stops (closed / natural / full) and a spring settle.
- **Day and night:** both basemaps are embedded Protomaps styles (day and
  night flavours of the same map). The theme follows the sun — computed on
  the device — with a manual override chip at the top right for the session.
- **3D buildings:** tilt the map (two fingers, swipe up) and the buildings
  stand up: the footprints already in the map tiles, extruded. The tiles
  record no heights for residential streets, so heights are a standard
  two-storey estimate (a real recorded height is used where one exists).
  From directly above, the map looks exactly as it did before.
- **Offline:** Settings → Backup → **Download offline maps** saves the
  area's vector tiles (zooms 8–14, plus the route core at zoom 15), styles,
  glyphs and sprites — 897 files — and reports the count it actually saved.
  Tiles are also cached as you view them, so a later cold start with no
  signal still shows a map under the route.

## Backup & restore

Settings → **Backup** is a small menu of three options: **Backup (JSON)**,
**Restore backup**, and **Download offline maps**.

- **Backup (JSON)** builds the backup and immediately offers to save or
  share it — one tap. The format is one JSON file, versioned (v2): every
  route's stored fields under its own route id, plus the global theme
  preference.
- **Restore backup** offers **Import JSON** (pick the backup file) or
  **Import Text** (paste it instead). Both feed the same restore path.
- Restore validates the file first — format version and every value's
  shape — before anything is written; a bad file changes nothing. Before
  writing, restore snapshots the current data. Each restored value is
  verified by reading it back; on any failure the snapshot is put back and
  that rollback is itself verified. The result message reports what
  actually happened, including if a rollback could not be completed.
- **Missing fields:** a field absent from a backup leaves the current value
  on the device untouched. Restore replaces what the backup contains; it
  does not clear what it does not mention. This is deliberate.
- **Legacy data:** v1 backups (the pre-multi-route format, including the
  oldest form where the completion set was an object map instead of a list)
  are accepted and converted on import.

## Files

| File | What it is |
|---|---|
| `parts/` | **The canonical application source — the only place the app itself is edited** (since Beta 1.94). Eight part files (markup/CSS, route data, the app in four parts, the paint engine, the generated basemap styles) that `scripts/assemble.py` concatenates into the single-file page, in the order listed in `docs/ARCHITECTURE.md`. |
| `src/tracker-source.html` | **Generated** by `scripts/assemble.py` from `parts/`. Never hand-edit — the build fails if it differs from what the parts assemble to. |
| `src/sw.js` | The authored service worker source (offline open + tile caching). Edited here; copied to the root by the build. |
| `index.html` | **Generated** deployable build: the source plus its stamped Content-Security-Policy. This is what GitHub Pages serves. Never hand-edit. |
| `sw.js` | **Generated** copy of `src/sw.js`. Must sit beside `index.html` on an https host. Never hand-edit. |
| `scripts/assemble.py` | Concatenates `parts/` into `src/tracker-source.html` (byte-exact recipe; `--check` verifies without writing). |
| `scripts/build-pages.py` | The repository-owned build: generates `index.html` + `sw.js` from `src/` and runs the assembly, parity, CSP, integrity and version gates. Standard library only. |
| `scripts/csp_stamp.py` | Computes the Content-Security-Policy the build stamps into the page. |
| `scripts/genstyles.mjs` | Regenerates `parts/pmstyles.js` (the two embedded Protomaps basemap styles) from the `@protomaps/basemaps` package (pinned exactly by `scripts/package.json` + `package-lock.json` — `npm ci` in `scripts/` first); run from `scripts/`. Never hand-edit its output. |
| `tests/sw.test.mjs` | Service worker fetch-strategy tests (Node, mocked caches/fetch) — 26 checks. |
| `tests/browser/` | The deterministic browser drive battery (36 drives, 485 checks) plus the offline end-to-end suite (29 checks) — see `docs/TESTING.md`. |
| `docs/` | `ARCHITECTURE.md`, `STORAGE-SCHEMA.md`, `TESTING.md`, `DEPLOYMENT.md` — the detailed references. |
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
styles use, and that the version the app displays equals the top
`CHANGELOG.md` entry — a stale version label cannot ship.

CI (GitHub Actions) runs the build gate and the service-worker suite on
every push; the browser battery runs sharded across four jobs on branches,
as a smoke subset on `main`, and in full every night. How changes are
merged is in `DEVELOPMENT_RULES.md`; functional testing is in
`docs/TESTING.md`; deployment is `docs/DEPLOYMENT.md`; architecture is
`docs/ARCHITECTURE.md`; the storage layout is `docs/STORAGE-SCHEMA.md`.

## Running it

GitHub Pages serves `index.html` straight from the `main` branch — merging
to `main` is the whole deploy. Without `sw.js` beside it, everything works
except the offline open; without `manifest.json` and the icons, the
home-screen install just loses its name and icon. Update an installed copy
from inside the app: Settings → **Update**.

Map data © OpenStreetMap contributors; vector styles: Protomaps; basemap
tiles: © CARTO.
