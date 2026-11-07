# Architecture

## Overview

Snow Route Beta is a single-page app for one operator clearing driveway
windrows on both sides of a route's streets. It is built as a multi-route
system: routes are data packs with per-route storage, and Route 5W in
Vaughan, Ontario (34 streets) is the pack that ships today — the app
itself is not tied to any one area. It is a
from-scratch MapLibre GL application (no Leaflet): the vector basemap IS the
map, and the tracker's own roads are painted as GeoJSON layers inserted into
the basemap's road stack. There is no server and no account; all state lives
on the device.

The canonical source is assembled, not hand-written as one file. The
parts live in the repo's `parts/` folder (Beta 1.94, audit F-02 — they
previously lived only in the maintainer's tree) and are concatenated by
`scripts/assemble.py` into `src/tracker-source.html` — exactly one inline
`<script>` and one inline `<style>` — then `scripts/build-pages.py`
produces the deployed `index.html` by stamping a Content-Security-Policy
(see `scripts/csp_stamp.py`) and runs `--check` gates (the source being
exactly what the parts assemble to, byte parity with the source, SRI
integrity of the two MapLibre CDN files, and the stamped policy
naming all three map hosts). Since Beta 1.133 the same gates also pin
the release bookkeeping: the What's New entry's version must equal the
displayed version, and the battery counts quoted in README.md must equal
the derivation of `scripts/release.py` — that script is the single
source for the counts, deriving them from the test suite itself
(`tests/browser/run.mjs`'s ALL list and the suites' assertion call
sites); the counts are generated, never hand-kept. Generated files are
never hand-edited.

Boot flow (Beta 1.76): the splash brand animates in, and at the readiness
gate (map engine up and a first tile landed, with a time failsafe) it
slides away to reveal a route menu on the same blue screen — Choose a
route, or Create new route (a placeholder). The map boots to a plain
area view with no route painted; picking a route runs `loadRoute(id)`,
which loads that route's stored state (migrating pre-1.76 data into its
slot on first load), paints it, frames it, and resumes an in-progress
clean. Route packs are data (`ROUTE_PACKS` in `data.js`: metadata —
name, area, main streets, label anchors, tile spellings, offline area —
plus the street geometry); Route 5W is the only pack today.

Separation (Beta 1.117, the segregation audit's F1–F8): the app holds NO
route of its own. No street geometry is computed at script eval — the
live containers (`ROADS`, `STRETCH`, `STREETNAMES`/`STREETSET`, `MAIN`,
`SPOT`, samples, `routeBox`, tile names, and the paint engine's own
geometry) all start empty and are rebuilt per load from the active pack
by `buildGeometry(pack)` (app1) and `GLP.rebuildRoute()` (engine), the
containers refilled in place so captured references stay valid.
`loadRoute` is also the live switch (the Routes tab's pick): it flushes
the outgoing route's pending writes into its slot, resets session state
in one block (`resetSwitchSession`), then builds the new pack's geometry
BEFORE loading its state, so the loader's sanitizers judge the new
route's records by its own streets. Switch semantics = a cold boot on
the target route plus that pre-flush: a run in progress on the route
you leave is not ended — it persists in its slot and resumes when its
route is picked again (the persisted cancel snapshot survives; only the
in-memory copy is cleared, so Cancel after switching back is exactly
Cancel after a reload). GPS is device state and is not switched.

## Part files (assembly order)

| Part | Responsibility |
|------|----------------|
| `head.html` | Markup and CSS: tab bar, dock, sheets, the route and settings full-screen menus, chips, toasts, splash. Design tokens as CSS variables; day/night via `body.night`. The splash icon is a placeholder token in this part — `scripts/assemble.py` inlines the exact bytes of `icon-512.png` at assembly time (Beta 1.133), so the part carries no 281 KB base64 line. |
| `data.js` | Route packs only: `ROUTE_PACKS` — per pack, metadata (name, area, mains, label anchors, tile spellings, offline area) + street geometry + reference features. Route 5W's coordinates are verbatim production data. |
| `app1.js` | Core: constants (Metro palette), storage keys and guarded storage, stitch/cut geometry (87 stretches, 174 sides on 5W), state, the double-tap guard. Beta 1.117: the geometry builders are pure functions of a pack (`computeStretches`, `computeRouteBox`); `buildGeometry(pack)` refills the live geometry containers per load. |
| `engine.js` | The paint engine (namespace `GLP`): builds GeoJSON families (centres, side bands/edges, selection, labels, route POI) from app state and syncs them to GL sources. Full rebuild + signature cache on state change. Beta 1.117: its geometry is built by `buildEngineGeometry()` from the host's current data — empty at eval, rebuilt per load via `GLP.rebuildRoute()`. |
| `pmstyles.js` | The two embedded Protomaps basemap styles (PM_DAY / PM_NIGHT). GENERATED by `scripts/genstyles.mjs` — never hand-edit. |
| `app2.js` | Map boot and interaction: GL map creation, basemap swap + restack, selection, side chips, street panel, list sheet, draggable/flickable sheets, map-failure notice. |
| `app3.js` | Work lifecycle: pace, Start/Finish, history and Previous cleans, notes, Clear, GPS (smoothing, trail, heading-up camera), coverage suggestions. |
| `app4.js` | System: the backup menu tree (Backup (JSON); Restore via Import JSON / Import Text; offline preload), update check, the day/night chip, service-worker registration, boot wiring. |

## The map

- GL JS 4.7.1 from CDN with SRI. Both styles are EMBEDDED Protomaps styles
  (generated in-repo as PM_DAY / PM_NIGHT); vector tiles for both come from
  `tiles.basemaps.cartocdn.com`, glyphs and sprites from
  `protomaps.github.io` — those two hosts are in the stamped CSP,
  gate-verified.
- The basemap keeps ALL of its own labels, restyled to one font/size system
  across both styles (the engine's stack hook); route street names come from
  the app's own label layers (point labels below GL zoom 16.2, line labels
  above; a route POI below the 12.6 pop point). Route paint pops at zoom
  12.6 rather than fading (zero-duration opacity transitions).
- Road colours are the Metro palette: unfinished mains gold `#ffc233`,
  other roads raspberry `#ef476f`, finished mint `#06d6a0`. A marked side is
  a green edge hugging that physical side of the centreline; both sides
  done greens the stretch.
- 3D buildings (Beta 1.90): both styles carry a `buildings-3d`
  fill-extrusion layer just below the labels, generated into the styles by
  `work/genstyles/gen.mjs`. The tiles carry footprints but no heights for
  residential streets, so the height is an estimate (7 m, or a recorded
  `height` where the tile has one), rising from zero between zooms 15 and
  15.3; the flat footprint fill hands over to the extrusion's top face, so
  the top-down map is unchanged.
- Failure model: GL `error` events are not fatal. Fatal = `load` not fired
  within 15s, or the style fetch itself failing before first load → the
  map-failure notice shows; marking and all data features keep working.

## Data and persistence

All data is `localStorage` under the serving origin, laid out since
Beta 1.76 as one storage slot per route (`snowroute.<routeId>.`) plus a
few global keys — see `docs/STORAGE-SCHEMA.md` for the full schema, the
per-key formats, the legacy migration, and the versioning rules. Restore
is transactional (validate → snapshot → write + verify → verified
rollback). Finishing is confirmed once (the Yes/No pop-up) and is
final — there is no post-Finish undo (Beta 1.110, Andrew's call); the
finish itself remains a verified transaction whose failure leaves the
run intact.

Beta 1.117: backup and restore judge every route by its OWN geometry
(`packGeometry(pack)` in app4) — snapshot validation, the unknown-name
count, the legacy done-map filter and the derived-sides path no longer
read the open route's geometry, so a record belonging to route B is
never silently dropped for not matching route A's streets. Unknown-route
backups still fail closed, wholesale.

## Creating routes (Beta 1.118, Step 2 of the route programme)

The Routes menu's "Create new route" opens a hybrid flow (Andrew's
approved mockups) with two doors landing in one shared preview.

**Pack format (defined once).** A route pack is
`{name, area, mains: [street names], roads: {street: [segment, ...]},
reference: {street: [segment, ...]}, tileNames?: [...]}` — the shape of
a `ROUTE_PACKS` entry in `parts/data.js`; each segment is an array of
`[lat, lng]` points. `normalizePack` (app4) is the single validator and
normalizer for every pack that enters the app — draft import, save,
backup restore, boot merge — fail-closed with named errors, nothing
half-applied. The set of fields a pack carries is defined ONCE in
`PACK_FIELDS` (app1, beside `ROUTE_FIELDS`): `normalizePack` builds the
validated pack by walking that list (Beta 1.131, maintainability
programme A — before, the return literal in `normalizePack` was a
second, hand-kept copy of the format, and a field missing from it
would have been silently dropped). The storage-slot field `snap` is
deliberately NOT a pack field and stays out of the list.

**Door 1 — from a photo.** The app takes the photo and holds it in an
honest waiting state ("Photo received — your draft is being built…",
with a Web Share affordance where the platform offers one). Reading
street names off a photo is deliberately NOT an app function: the photo
is read and the draft built by Muse outside the app, and the draft
returns as a pack-format JSON file that "Import my draft" validates and
loads into the preview. A bare roads object (the route-creation
sandbox's candidate shape) is accepted as a roads-only draft.

**Door 2 — select streets myself (Beta 1.121: city first, then the
whole city prepared; Beta 1.123: the gate is a chooser; Beta 1.124:
the gate opens on two doors).** Manual
creation STARTS by choosing a city. 1.121's gate was a typed city
search; on Andrew's phone it dead-ended (the defect below), so
1.123 made the Create pane itself the gate. 1.124 restructures it
again (Andrew's approved mockup): the Create pane is titled
"Create new route" and opens on TWO primary doors — **Select from
list** (sub: "Choose a city that's ready to load instantly"), which
opens its own pane titled "Select the city you'll be cleaning in"
listing the pack library's cities as rows with their street counts
("4,477 streets · ready to load") rendered from `packs/index.json`
(the last-used city, `snowroute.v2.lastArea`, rides first when the
library holds it), and **Search manually** (sub: "Any other city
or address — loaded from the map service"), which opens the typed
search. The photo door sits quieter below a divider. Back links
walk pane to pane (list/manual/photo → doors → main). The
cold-start picker and the Routes menu show the SAME routeMenu
and the SAME panes, so the gate exists once and both entries
reach it (drive153 + drive154 prove both). Beta 1.130: the
catalogue itself is prefetched during BOOT — the boot tail's
menu-arming slot fires `crWarmCityLibrary()` (Andrew's suggestion:
load it during the splash; adjudicated to the catalogue only —
the pack files stay on-demand), and the Create button, `openDoors`
and `openRouteMenu` re-trigger the warm as no-ops on
`crPackIndexLoad`'s cached promise (at most one catalogue fetch
per session). 1.129 requested it for the first time at the
Select-from-list tap, so a cold open's list waited out the whole
fetch (drive159 proves the boot start, the instant warmed walk,
and the in-flight state below). While a fetch is genuinely in
flight, the list pane shows a "Loading cities…" row in the city
rows' own styling, replaced by the rows when it lands. A list-row tap is a city pick
through the same `crPickCity` the typed search uses, carrying the
catalogue's own bounds. The typed search keeps its form:
a debounced Nominatim query (`featuretype=city`) offers populated
places only (a place of type city/town/village/hamlet/suburb, or
an administrative boundary), with the last-used city as a one-tap
choice. Picking a city — either door — scopes the creation (name
+ centre + bounding box), flies the map to it, biases the street
search to the city's box (viewbox, bounded=0 — a bias, never a
restriction), and STARTS the city's preparation (below). Both
doors land on the SAME pick stage, so the street search bar with
its autocomplete is present and behaves identically after a list
pick (drive154 proves it end to end on both paths).
A draft
that already names its city (the photo door) pre-answers the step;
the city stays changeable from the pick sheet without losing the
draft. **The 1.121 dead end, for the record:** the app requests
Nominatim `format=jsonv2`, whose results carry the place kind in a
field named `category`; the place filter read the older format's
`class`, which jsonv2 does not send — every real result was
rejected and the suggestion list silently emptied (the battery's
fixture cities carried the old field, so the rig never saw it).
The filter now reads `category` (with `class` as fallback), an
empty answer renders a "No city matched" line instead of nothing,
a failed request toasts as before, and drive153 stubs the real
jsonv2 payload shape. The street search is otherwise the 1.120 form: Nominatim
(street/address search only — intersections are known not to
resolve), suggestions as he types (500 ms debounce, 3+ characters,
sequence token + AbortController against stale answers), Search /
Enter run the typed query at once, tapping away dismisses the
dropdown, and the ✕ clears text and results before it exits.

Street shapes are NOT fetched per tap. A picked city's shapes are
prepared as a **whole-city grid extract** (Andrew's second gate
amendment, at the verify gate: he rejected the working-box-only
preparation — picking a city loads the WHOLE city): the city's
bounding box (a ~16 × 16 km box on the centre when the lookup gave
none) is divided into ~4 × 4 km cells — Vaughan is roughly two
dozen — and each cell is one batch request (`way["name"]["highway"]`
over the cell) through the extract source seam (below), at most 3
in flight. Each cell's answer commits to the merged extract the
moment it lands (progress is real: the hint reads "Loading
<City> — part N of M · T s" on the service path; a pack-backed
load is one download, so its hint instead reads "Loading <City>
from the app's own library… T s" — elapsed only, no part counts
for a single file); a failed cell retries once inside the
run, then is marked failed while the rest continue — the state
settles as ready, degraded ("loaded except K parts", with a
Retry-missing-parts action that fetches ONLY the missing cells),
or failed. Cancel stops scheduling and aborts the downloads in
flight but KEEPS every committed cell, and re-entering the city
resumes only the missing cells. Committed cells are also written
through to the **on-device city cache** (IndexedDB — see
STORAGE-SCHEMA.md), so picking a city with a saved extract is
instant and download-free, the hint says when it was loaded, and a
Refresh affordance re-fetches the whole city. A first load is
honest about its cost ("can take a few minutes — after that it's
instant"); the constraint was never download size (~14 MB a city)
but the service's compute time per query, which the grid bounds.

Every extract — a grid cell, the fallback box, a street top-up —
comes through ONE source seam, **`crSourceExtract(box, name, …)`**:
given a coverage box (and optionally one street name) it returns
the extract for that box. Two sources answer behind the seam. The
**city packs** (Beta 1.123) are primary when the picked city has
one: pre-generated whole-city street files, generated once from
OpenStreetMap and published beside the app under `packs/` — one
`<slug>.json` per city (raw street segments per name, unchained;
the app chains at resolve time) plus `packs/index.json`, the
library's catalogue (slug, name, bbox, sizes, street count,
generation date). `crCityPrepare` resolves the picked city against
the catalogue (by name; the pack's own bounding box must contain
the grid's box) and sets a pack context; the seam then answers
each call from the ONE downloaded pack (adapted once into the
Overpass element shape, with negative synthetic way ids so a pack
way can never collide with a service way in the merged index),
filtered by the same point-in-box membership the service's
bounding-box query applies. The grid, the cache write-through, the
settled-state judge and everything downstream consume the identical
result shape — a pack city commits, caches, resumes and refreshes
exactly as a service-loaded city does (Refresh re-downloads the
pack). If the pack fails to load, the context flips to the service
for the rest of that preparation and the hint says the library
didn't load. The **live Overpass service** is the other source —
for cities with no pack, for boxes reaching past a pack's bounds,
and as that fallback: the query is built by the single builder
`crQL` and fetched by `crOverpassFetch` under ONE deadline per
request spanning connect + body + parse, with per-attempt budgets
inside it (the primary instance gets the larger share; the
fallback keeps the reserve), the body consumed as a stream with a
2 MB cap enforced while streaming, an HTTP-200 Overpass `remark`
treated as a failed extract, and the clock re-checked after the
synchronous parse before anything commits. **The catalogue is
data, not code: publishing a new city's pack file plus its index
entry lights that city up in the chooser and at this seam with NO
app change.** The service worker does not intercept `packs/*.json`
at all (an explicit pass-through in `src/sw.js`): before it, the
generic same-origin netFirst branch would have stored
multi-megabyte pack JSON in the shell cache and served a stale
copy on an error status — hiding exactly the failure the seam's
fallback keys on. Packs are network-only; offline, the fetch fails
and the grid fallback applies only if the service is reachable,
else the existing honest failure stands.

Outside a picked/saved city — an anchor beyond the city's coverage,
or a name-only city whose lookup failed — the **fallback
preparation** still exists: one bounded box (~4 × 4 km picking box
plus a 1 km buffer ring) around an anchor — (a) a picked
street-search result outside the city, or (b) the map centre via a
one-tap "Prepare this area" at zoom ≥ 14 — never a silent download
while panning, session-only (never cached). Either way, the ways
land in the SAME merged extract: indexed by name, deduped by way
id (a way returned by two cells is stored once, so a street
crossing a cell border stitches whole), with the SET of verified
boxes (landed cells + fallback boxes) as the coverage record.

Tapping a road identifies the street from the basemap's roads layer
— the tile feature's NAME is the identity, never its geometry
(display tiles re-segment streets and misplace joins, proven in the
sandbox) — and the tap then resolves LOCALLY from the extract:
`chainWays` stitches the name's ways (the sandbox's greedy endpoint
chaining at 1.5 m tolerance; a run whose joins were all exact keeps
its ways as segments, a bridged join is stored as its single
stitched line, a divided road chains into its hairpin) and the run
nearest the tap is the street tapped — subject to a fail-closed
completeness check: a run end is CLOSED only when it lies inside
verified coverage — the extract's box SET (any continuation starts
there, inside a query that was actually answered, and would have
been returned). An end outside verified coverage is unproven —
however many other streets touch it (the verify round's
adversarial case: a cross street touching the endpoint says
nothing about a same-name continuation running wholly outside the
box; an earlier "junction proof" form was removed as unsound,
CG-PF-08) — so the street gets ONE targeted top-up (through the
same source seam, its own budgets on the same measured profile —
60 s primary of 90 s, CG-PF-07 — the name over a bounded box
centred on the run's open end, merged by way id, resolved again
against that box); still beyond coverage, it stays PENDING —
listed as pending in the pick sheet, never added, never counted —
with a wider-preparation offer that prepares around the street's
own open end (a fresh preparation also sweeps pending streets —
a pending street completes when the union of verified boxes
closes its run). Before the extract is ready a tap still
identifies the street and says preparation is pending (a tap in a
part of the city that has already landed resolves even while the
rest still loads); a name absent from the extract gets an honest
"no shape found" (or, outside coverage, a re-prepare offer). Names are
shortened by the app convention (suffix strip; ordinal avenues
spell out — 5th Avenue is Fifth). Picked streets join as
SECONDARIES by default and light up on the map in route colours.
A map tap on an ALREADY-PICKED street opens its sectors (Beta
1.128, Andrew's fork from his 1.127 device session: 1.127's
tap-again-to-deselect is retired — on device he tapped picked
roads expecting their sections, and whole-street picking was all
the map ever offered). Removal lives only on the panel row's ✕,
the preview's ✕ and Clear all, through the one removal path
(`crRemoveStreet`); streets still enter only once their geometry
has resolved, so the honesty line stands.

**The picked-roads panel (Beta 1.127; Andrew's approved mockups,
beta1/work/create-sectors-mockups/; the surface itself rebuilt in
Beta 1.129).** The pick stage's bottom surface is ONE persistent
object: the sheet element itself (`#createSheet`) is the card —
it owns the surface tokens (`--card-solid` background, shadow,
radius) and its GEOMETRY is the state, via the `crG-panel` /
`crG-strip` / `crG-bar` classes (panel = flush full-width with
square bottom corners; strip and sector bar = the same box
contracted to the tucked footprint — 12 px side insets, lifted
12 px off the bottom, fully rounded: the "absorbed from all
angles" shape). Inside it sit three CONTENT faces — the PANEL,
the STRIP it tucks into, and the SECTOR BAR (below) — which
carry no surface of their own (padding and layout only); exactly
one shows at rest (`syncCrPanel` lands the rest state). The
PANEL: "Your route so far", a live "N roads · X m", one compact
row per street — category dot, name, a sub-line that always
carries the sector affordance, the MAIN/2ND chip in the row, ✕ —
plus a Clear all that empties the draft's streets behind the
shared confirm, the city/session staying, and a footer whose
only button reads "Done". The panel never exceeds the sheet cap
(~half the visible viewport); its rows scroll inside it with
header and footer fixed. TUCK-AWAY: dragging or flicking the
grab handle / header downward — or tapping it — collapses the
panel to the slim bottom bar ("N roads picked · X m" + Review
▴); Review restores it. FACE CHANGES MORPH THE ONE OBJECT (Beta
1.129, `crMorphTo`): the sheet's height springs between the two
resting heights on the sheets' own closed-form spring
(`springSheet`), the same progress drives the margin/radius
lerp toward the destination shape, and the two faces cross-fade
pinned inside the moving box — the container is never
display:none, never empty and never teleports, in both
directions, for every pair (panel ⇄ strip, panel ⇄ sector bar,
sector bar → panel); the header-drag gesture transforms the
sheet itself and hands its release position/velocity to the
same morph. This is the third attempt at the motion: 1.127
hard-swapped faces at a spring's end and 1.128's two-card morph
still read on Andrew's phone as "slides down, disappears, a
pill appears" — 1.129 removes the second surface entirely
rather than re-choreographing a swap between two. drive158
samples the container's bounding box and computed background on
every animation frame (collapse, expand, panel → sector bar,
sector bar → panel; day and night) and asserts presence in
every frame, monotonic edges, distinct intermediate heights
between the rests, and the resting boxes unchanged. The bar
exists at ZERO picks too ("No roads picked yet"), and the panel
retracts/restores at any pick count; while collapsed, a new
pick does not force the panel back — the bar's counts update
live. The one surface wears the theme tokens in day and night.

**Sectors (Beta 1.127; entry + honesty reworked in 1.128).** A street in the draft can be trimmed to
the junction-to-junction pieces actually cleaned. TWO doors open
sector mode: tapping its panel row, and tapping the picked
street itself on the map (Beta 1.128 — the door Andrew's finger
actually used). Sector mode shows the sector bar
(street name, "N of M sectors picked · X m", Cancel, Whole road,
Done with this road) and the draft renders the street as one feature per
sector — chosen in its category colour, unchosen thin grey, with
a wide invisible hit layer picked with the same ±16/±28 px
discipline as street taps. The sector boundaries are
the ONE junction-cut finishing policy — `finishJunctionCuts` (app1):
4 m join tolerance, cuts merged under 15 m, none within 12 m of an
end — shared verbatim with `computeStretches` since Beta 1.131
(maintainability programme N2; the two cutters previously carried
independent copies of the rule). It is applied to the street's
stitched line, but the junction set is the prepared EXTRACT (every
other street's vertices within 12 m of the line) — never the
draft's current contents — so a street's sectors are its real
cross-street pieces and do not shift as other streets join or
leave the draft (`crStreetParts`, cached per draft). Sector state
lives ONLY in the draft (`draft.sectors[short]` = the chosen part
indexes; an absent entry means the whole road, which is also the
first-pick state). Entering sector mode — from either door —
snapshots the street's state as it was (`crSectorSnapshot`:
undefined = no session open, null = whole road, otherwise the
selection array in force); the bar's CANCEL restores that
snapshot exactly (state, panel row sub-line, draft paint, every
billed length) and returns to the panel, while Done keeps the
session's trims (Beta 1.129 — Andrew's "I still need a way to
cancel selections while I'm selecting something"). The snapshot
is taken only on fresh entry and cleared when the session ends,
so a Cancel can never reach back past the current session.
Un-picking every sector of a multi-piece
street removes the street. A street whose computed parts are
exactly ONE (measured on the shipped Vaughan pack: 221 of 1,299
streets ≥ 500 m — their crossings cluster where the 15 m merge
and 12 m end margins erase them) cannot be trimmed: its bar
says "One piece · X m — no cross-streets to split it at", and
tapping its sole sector changes nothing (Beta 1.128; in 1.127
that tap silently removed the street). At Save,
`crFilteredRoads` stores ONLY the chosen sectors'
polylines — the pack format is unchanged (roads = segment lists)
and everything downstream derives from the stored geometry as
always. Every length the flow states — panel header and rows,
preview count, name-it summary, the preview's map framing — bills
chosen geometry only.

**Shared preview + name-it.** "Is this correct?" draws the draft on the
map (framed on the geometry that will save — chosen sectors, not whole
streets) and lists every street with its length; corrections (flip,
remove, "+ Add a street" through the same picker — the pick panel's
button there reads "Done" and returns here) happen here. The preview's
primary button reads "Save route" (Beta 1.128 — the 1.127 compound
"Looks right - save route" label is gone) and advances to name-it,
which stays its own final step: name + area with pre-fills, a
read-only summary billing chosen geometry, and its own "Save route"
— the only actual save. (Folding the naming into the preview was
drafted for this build and vetoed by Andrew the same evening; the
flow is pick → Done → check → name-it → saved.)

**Draft isolation.** A draft is session state only. It renders through
its own GeoJSON source (`crDraft`) computed from the draft's own roads
(per-sector features while creating, Beta 1.127) — the active route's geometry, engine sources
and storage are never touched, and the marking tap handler stands down
while `creating` (app2). Leaving mid-draft asks first; "Start over"
discards behind a confirm. drive150 proves the active route's slot
byte-identical across create-save-switch-mark and create-discard
cycles.

**Pick resilience (Beta 1.121; supersedes the 1.120 per-tap form).**
Why the rewrite: on Andrew's phone, tapping a street in 1.118–1.120
said "Loading…" for over a minute and then failed — every street,
every time. Audit round pickfetch found the root cause in the app's
own bytes: the shape query was malformed (`way["name="X"]` — the
equals sign inside the quoted key), so Overpass rejected every tap
from the day the flow shipped; the 1.120 patience work treated a
symptom, and 1.120's drive passed its network sections with zero
geometry ever received. Around it: 40 s per-attempt timeouts
excluded the measured 40.6/52.7 s successes (~123 s total burn), and
the attempt timer was cleared at headers, before the body was read.
The 1.121 shape (above) removes the per-tap fetch entirely. What
carries over from 1.120: both Overpass hosts stay named in the
stamped CSP's connect-src (overpass-api.de + overpass.kumi.systems,
now the two attempts inside the one deadline); the pick's busy flag
still resets on EVERY exit path (a `finally`) for the one async pick
path that remains (the top-up); and every async completion —
preparation, top-up, searches, the remembered-city lookup — binds
to (creation session, coverage generation), so a completion that
lands after an exit or a newer preparation mutates nothing.
Cancellation is real, not just discarding: Cancel, exit and
supersede abort the in-flight fetch itself (CG-PF-10), and a
competing city pick aborts a held remembered-city lookup
(CG-PF-11). Preparation remedies are working actions, not wording
(CG-PF-09): a tap outside ready coverage, a pending street and a
too-dense failure each leave a hint button that prepares exactly
where it points (the tap point, the street's open end, the map's
current centre). The failure taxonomy is explicit
in code and UI: unreachable / answered-with-error (HTTP status or
remark) / ready-but-no-shape / too-dense are distinct states with
distinct messages; toasts are for brief acknowledgments, persistent
states live in the hint. While creating, the create surfaces wear
the app's theme tokens (they stayed hardcoded-white at night in
1.118/1.119), and the loaded route's engine paint hides behind a
per-pack point-of-interest backdrop (`crSetBackdrop`: every pack's
centre + name, the zoomed-out POI treatment) so the map he picks
from is uncluttered; exiting restores the recorded layer
visibilities exactly. drive150's network sections were rebuilt with
the fix (section (j) grades the real POST bodies, replays the
measured latency, splits headers/body, runs the failure matrix,
proves offline-after-extract adds, and races the generations) after
being demonstrated red on the 1.120 tree.

**Persistence.** Created packs persist on-device in the global
`snowroute.v2.userpacks` record (see STORAGE-SCHEMA) and merge into the
runtime pack list at boot, so they are listed, switchable through the
1.117 machinery, and covered by the offline manifest union (F5) like
any pack. A freshly saved route gets an honest preload record (none of
its area downloaded yet) and the save toast points at Settings →
Status → Download. Backups carry the definitions (see the backup
envelope in STORAGE-SCHEMA).

**Deletion (Beta 1.124).** A created route's row in Choose a route
carries a Delete button (shipped packs never do, and `deleteRoute`
refuses shipped ids in code). The shared create confirm asks first
(Cancel / Delete, the Yes in the destructive red; the confirm card
is the `--card` theme-token surface in both day and night, and the
modal's z-index rises above the full-screen menus so it can be
asked from inside the route list). On confirm, in order: the
definition is removed from the userpacks record through a strict
read + verified write (a storage failure leaves the route listed
and intact, with a toast naming the problem); every key of the
route's slot is wiped, enumerated from `routeKeys` — never
hand-listed, so a future field joins the sweep by construction;
if the deleted route was the active one, the app returns to the
boot-picker state (no geometry, no state loaded, LS at its eval
default, menu in boot mode). Nothing else keys on a route id: the
IndexedDB city cache is keyed by city and survives; the offline
fingerprint derives from the pack list, so removal honestly
un-certifies the old union download (the tiles stay cached).
drive154 proves the affordance split, the ask, both themes, Cancel,
the full wipe, the active-route boot return and the
storage-failure path. The boot-picker state the return mirrors is
the RESTING picker: its <html> carries no `boot` class (the boot
tail's arm() removes it when the menu arms, because the 1.86
chrome-absence rule force-hides every non-menu body child while it
stands). Beta 1.126: unloadRouteToBoot originally re-added that
class, which left the whole create stage display:none after an
active-route delete — drive155 pins the resting state and the
create stage's computed visibility after both delete paths.

**Back hit area (Beta 1.127).** The blue menus' panes are flex
columns, which stretched every `.rmBack` button to full pane
width — a tap anywhere along its row navigated back, far right of
the visible words (Andrew, on device, in both the route menus and
Settings, which share the class). `align-self: flex-start` on the
one shared rule shrinks every Back in both menus to its words
(padding kept); drive156 presses 60 px right of the button's edge
in a route pane AND a Settings pane and proves nothing happens,
then proves the words themselves still go back.

## GPS and coverage

Fixes pass a validity gate (finite, on-Earth), an out-of-order timestamp
guard, and a constant-velocity Kalman filter (one per axis, measurement
noise scaled by the fix's accuracy). Through a single frame-synced render
loop, the displayed position coasts on the filter's predicted track —
the estimate extrapolated along its own velocity (horizon capped at
2.5 s) — with each fix's correction absorbed into an offset that decays
over ~0.3 s, so the dot flows between fixes instead of stepping at fix
cadence (Beta 1.115); the smoothing is display-only, and trail, coverage
and pace consume the raw accepted estimate. A follow camera keeps the
dot centred whenever location is on and rotates heading-up (course over
ground) while a run is active; a user drag suspends the follow (the
camera, pan and bearing, stays where it was put) until the re-centre
button below the day/night button — or the Locate tab — resumes it. The trail records only during a run, but the stored trail retains
every session and rides in backups; only the on-map display is scoped
to the current run. Coverage samples each street's centreline every 15m; a fix covers
samples within 22m; at 85% of a street's samples the app SUGGESTS the
street — it never marks it. Confirmation flies to and selects the street;
marking is always manual.

## Offline

`src/sw.js` (deployed as `sw.js`): integrity-checked core (the two MapLibre
files) in the shell cache `snowroute-shell-v1`; navigations network-first
with cache fallback. Map data lives in TWO caches (Beta 1.94, audit F-03):
the downloaded offline pack in `snowroute-offline-v1`, and ordinary
browsing in `snowroute-tiles-v1` (FIFO-trimmed at 3,000 entries). Every
map request is answered by `mapFetch`, which checks the pack cache FIRST
and only falls through to the per-kind strategies (sprites stale-while-
revalidate, styles network-first, tiles cache-first) in the browsing
cache — so browsing can never evict the pack the operator downloaded.
The day/night map styles themselves are embedded in the page (generated
Protomaps styles), so no style document is ever fetched.
Activate deletes only `snowroute-` caches (plus the two pre-rename beta cache names, once) except the three
current ones (shell, tiles, offline) — disjoint from production's
`snow5w-` prefix, so the two apps can share an origin safely. An in-app
preload ("Download offline maps") warms tiles (zooms 8-14 over the area - the
wide zooms added in Beta 1.72 so the map's own minimum zoom works offline -
plus a zoom-15 route core), sprites and glyphs — 897 files in all, written
into the pack cache. A phone upgrading from a pre-1.94 build has its
existing download migrated into the pack cache automatically on boot
(`migratePack`, Beta 1.95, SR-194-05/06): only the deterministic preload
manifest (the shared `preloadUrlList` the download itself uses) is
copied, the pack is pruned to exactly that manifest, and the completion
flag (`snowroute.v5.packmig`) is set only after the destination is
verified — a failed copy retries on the next boot instead of being
marked done. Beta 1.96 (SR-195-03): the completion flag is a
fingerprint of the manifest, and it is READ on boot — a matching
fingerprint with a pack census of exactly the manifest count skips the
verification sweep entirely; anything else runs the full pass, which
also heals a shrunken pack from the browsing cache. A re-download is a
true refresh (Beta 1.96, audit-2 N-2): the download fetches in `reload`
mode and the worker bypasses both caches for it, and the browsing-cache
cleanup afterwards deletes only copies the pack confirmed it holds
(N-1). Beta 1.117 (F5): the preload manifest is the UNION over every
known pack — each pack contributes its offline area (z8–14) and its z15
route core — computed from pack data only, so it is identical before any
route is chosen; with only Route 5W shipped it remains exactly the
frozen 897-file Offline Contract v1 set, fingerprint unchanged. The
per-route preload record additionally carries the route's own
tile-subset counts (see STORAGE-SCHEMA.md); the packmig flag stays a
global certificate of the one shared pack cache against that union
manifest — it is not a per-route completion flag, and is not read as
one. The first-ever
boot also self-warms once the worker controls the page, so the map works
offline from the first install — drive119's first session proves it
without any manual reload.

## Backups: one button, automatic recovery fallback (Beta 1.96, Andrew)

Beta 1.97 (audit-loop round 196) hardened what a backup ASSERTS: every route entry carries its start state explicitly (a run's timestamp, or `start: null` for idle), a restore honours the idle assertion by clearing the destination's start + cancel snapshot inside the verified transaction, and normal backups carry the run's validated cancel snapshot — the construction the recovery backup introduced in 1.96, now shared (`snapForExport`). The same round funnelled every board mutation through one Finish-Undo invalidation helper and gated the marking outcome toasts on the save result.

Settings → Backup has ONE backup action. The normal backup is built
from saved storage and still refuses to be built when the state cannot
be saved first (it would ship stale data) — but the refusal is no
longer a dead end: the press falls back automatically to the recovery
export (live in-memory state, marked `"recovery": true`, shared as
`snowroute-recovery.json`) and the result message says the save could
not be done. The fallback triggers on the BUILD failure only; a
cancelled share sheet is a shrug, never a fallback. drive136 F12 pins
both directions (broken save → recovery file + loud toast; healthy
save → normal file, no marker).

## Settings (Beta 1.111, Andrew's approved redesign)

The Settings takeover has six panes (`showSetPane` over `SET_PANES`):
**main** (Status / On the job / Backup / About — the Backup row shows a
"Last backup" age from the `exportedAt` stamp `noteExported` writes
into the existing export record at every successful backup hand-off),
**Status**, **On the job**, **Done chime**, **Backup** (slimmed to
Backup (JSON) / Restore backup; its internal Back walk is unchanged),
and **About** (app line, map credits, the curated `WHATSNEW` entry —
latest release only since 1.114 (Andrew): each release replaces it
rather than accumulating, and the CHANGELOG is the full history;
header version read from the live `#ver` — and the Update button,
moved from the main pane with both handlers).

Status owns the offline-maps download (moved from Backup, machinery
unchanged: `preloadUrlList`, the pack cache, the progress bar/stat) and
a Delete maps action (pack cache + PACKMIG flag + the active route's
preload record; the browsing tile cache stays). Its maps line and the
health block are computed live at pane open (`renderStatus` /
`packState`): storage by a scratch-key write/read-back probe, maps from
a pack-cache census against the deterministic manifest, app version
from the update check's session state (`updState`), GPS from the watch
state / last fix / the `gpsDenied` flag.

Device-behaviour toggles live in ONE new global key,
`snowroute.v2.settings` (`{awake, vib, chime, chimeSound}`; all
toggles default OFF, sound defaults to Two-Tone — see
docs/STORAGE-SCHEMA.md). The wake lock (`syncWake`, app3) is gated on
`awake`. Completion feedback (chime + vibration) fires from the
marking funnel — `applyPiece`'s completion branch and `markDone`
(app2) call `onStreetComplete`; `finishRun` calls `onFinishFeedback`
on its committed path only. Sounds are WebAudio-synthesized in app4
(`playChime`), fully guarded so audio can never break marking.

## Service worker updates (deliberate, audit F-11)

The worker calls `skipWaiting()` on install and `clients.claim()` on
activate, so an update takes control promptly instead of waiting for
every tab of the old version to close. This is deliberate for a field
tool: the operator's one update path should not strand him on a stale
build mid-season. The takeover is bounded — claim changes which worker
controls an open page; it never reloads the page. The running page
keeps its loaded code and its on-device state, and the new version
applies on the next load or via Settings → About → Update. All state is
localStorage in version-tolerant shapes (the loaders sanitize what
they read), so a controller change mid-clean cannot strand a run.

## Viewport (deliberate, audit F-06)

The page's viewport meta blocks pinch-zoom of the INTERFACE
(`maximum-scale=1, user-scalable=no`). That is a deliberate choice for a
gloved, in-truck app: an accidental two-finger touch must never rescale
the controls mid-clean. The MAP's own zoom is MapLibre's (pinch, buttons,
double-tap) and is unaffected. iOS ignores the directive in any case; it
is kept for the platforms that honour it, as a considered trade, not an
oversight.

## Testing

CI runs the build gate, the service-worker unit suite, and the
deterministic browser drives on every push to any branch. The drives boot
the real app (file:// with fulfilled map requests; two drives use a local
HTTP origin for true service-worker behaviour, including fully
disconnected restarts). See `docs/TESTING.md` and
`DEVELOPMENT_RULES.md`.
