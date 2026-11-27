# Surface Map

Every surface the app can put in front of the user, its snow status,
and the rule that governs it. Seeded from the snow surface census of
2026-11-26 (Beta 1.300 tree) and updated by the round that lands a
surface change - briefs reference this map when a change touches a
surface.

S1 type-safety round (2026-11-27): parts/ changed by JSDoc
annotation only - no surface, element or behaviour changed. Map
reviewed against the change; no update needed.
Stage 2a (app4, create-packs join the type check; data and app5
touched by a cast and whitespace only): same verdict, no update
needed.
Stage 2c (app5 joins the type check): same verdict, no update
needed.
Stage 2d (create-save joins the type check): same verdict, no
update needed.
Stage 3a (create-cache joins the type check): same verdict, no
update needed.
Stage 3b-i (create-fetch and create-citydata join the type
check): same verdict, no update needed.
Stage 3b-ii (create-pick joins the type check): same verdict,
no update needed.
Stage 3c (app2 joins the type check): same verdict, no update
needed.
Stage 3d (whatsnew and brand-snow join the type check): same
verdict, no update needed.
Stage 4 (strict-null gate wired for the storage files): same
verdict, no update needed.
S1-FINISH (app3 joins the type check and the strict-null storage
set): parts/ changed by JSDoc annotation plus two proven-dead
declarations deleted (app3's _fxEncodeEntry, app1's LS_GLOBAL.prep
key) - no surface, element or behaviour changed. Same verdict, no
update needed.
MOUND-FIX (Beta 1.302, 2026-11-27): the bank's paint in
brand-snow render() samples one grid step past the right edge
and closes off-canvas, so the crest is no longer sliced at the
edge. No surface, element or snow status changed; the wave
profile itself is byte-identical. Map reviewed; no update
needed beyond this note.
PINCH-FIX (Beta 1.303, 2026-11-27): page pinch-zoom is now
blocked at the gesture level on every surface except the map
(a document-level handler in app5.js), and the splash carries
touch-action: none. No surface, element or snow status
changed - the guard changes what a two-finger gesture does,
not what any surface shows. Map reviewed; no update needed
beyond this note.
S2 ROUND 1 (2026-11-27): openClean in app3.js is split into
its four sections (summary, street rows, noted-only rows,
delete control) as sibling functions in the same part. The
clean-detail surface inside the Pace sheet renders exactly
as before - same elements, order and values, pinned by
proof-1299. No surface, element or snow status changed.
Map reviewed; no update needed beyond this note.
SOLID SHEETS (Beta 1.304, 2026-11-27): the Streets and Pace
sheets (the .sheet faces in the table below) are fully
opaque in both themes - they wear the solid card colour and
carry no backdrop blur, so nothing behind them tints
through. The tab bar keeps its frosted card face by
Andrew's explicit pick, pinned by drive231. The table row
for the sheets is updated with this note.
S2 ROUND 2 (2026-11-27): addStack in engine.js is split
into its four sections (stack sources, paint layers,
selection layers, POI layers) as sibling functions in the
same part. The route layer stack builds exactly as before
- same layers, order and paint, pinned by proof-1300. No
surface, element or snow status changed. Map reviewed; no
update needed beyond this note.

## The snow rule (one rule, app-wide)

Andrew, 2026-11-26: every blue menu has the snow, no exceptions.
One engine (parts/brand-snow.js) paints one body-level canvas
(#snowCv) behind the menus; the scene is live while the splash or
either blue menu is up, and parked on the map. The canvas never
steps aside for a pane: the step-aside retired in Beta 1.301.
Coverage: drive228 walks every surface below and judges the snow
standing at each stop; drive227 judges the cold start.

## Blue menu surfaces - snow: YES on all 13

| Surface | Element / pane | Reached by |
|---------|----------------|------------|
| Splash / boot scene | #splash + #brandLayer | cold start |
| Route menu, main pane | #routeMenu / rmMain | cold start after splash; Routes tab |
| Choose a route | rmListPane | rmMain -> Choose a route |
| Create doors | rmCreatePane | rmMain -> Create new route |
| Select City (bundled list) | rmCityListPane | create doors -> Select from list |
| City manual search | rmCityPane | create doors -> Manual search |
| Name your route | rmNamePane | a create flow's preview Save |
| Settings, main pane | #setMenu / setMainPane | Settings tab |
| Settings, System Health | setStatusPane | Settings -> System Health |
| Settings, Display and Sound | setJobPane | Settings -> Display and Sound |
| Settings, chime list | setChimePane | Display and Sound -> chime row |
| Settings, Backup | setBackupPane | Settings -> Backup |
| Settings, About | setAboutPane | Settings -> About |

Related but separate: the brand TITLE (#brandLayer) shows only on
the route menu's main pane - showRmPane (parts/app2.js) toggles its
.away per pane. That is a title rule, not a snow rule; the snow
canvas carries no .away since Beta 1.301.

## Not blue menu surfaces - no snow, by rule

| Surface | Why not |
|---------|---------|
| Create picking stage (#createBar, #createSheet, #previewSheet, #createResults) | card faces (white/charcoal) over the MAP; the map rule parks the engine there, and the cards sit below the canvas in z-order, so snow would paint over them |
| Streets sheet (#sheet), Pace sheet (#pacePanel) | solid card faces over the map |
| Selection pop (#selPop), notification banner (#banner), confirmation pill (#confirmPill), modals (#crModal, #finModal, #noteModal) | card faces, not menu blue; the banner is the one notification surface (Beta 1.295) |
| Map chrome (#tabBar, #dock, #hud, #spdPill) | not surfaces over a blue ground; the map rule governs |
