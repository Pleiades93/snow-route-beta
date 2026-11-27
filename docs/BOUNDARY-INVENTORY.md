# Boundary inventory and check

Snapshot: Beta 1.301, base `3897062c`. Report-only, except the
enforced rows named below (STD-02 at assembly level: only the
owning module touches its state, checked mechanically where the
ownership model allows).

The inventory follows the physical files in `parts/`, including
the split `create-*.js` files. A state is a binding, data record,
DOM property or related property family, map source/layer family,
or other mutable resource. Owners follow the feature that
controls the state and its lifecycle. The declaration, initial
markup, or generic write primitive is supporting evidence. A call
to an owner function is attributed to the file containing the
actual mutation.

The existing [binding census](../tests/browser/fixtures/foreign-writes-census.json)
uses declaration ownership and groups the Create files. This
inventory adds container changes and uses feature ownership where
the source establishes it. `head.html` supplies markup and styles
with no app inline event handlers. `data.js` supplies the shipped
pack list, whose runtime mutations are listed below. `pmstyles.js`
and `whatsnew.js` supply data to consumers.

**107 states** (95 with a named owner, 12 ambiguous), **192
confirmed foreign state/write seats**, **19 rows enforced** (18
by this scanner, 1 by the source-ownership rule in the same
scanner).

## Owned states

| State ID | State | Owner | Other writers | Foreign-write seats | Enforcement |
|---|---|---|---|---|---|
| `snow-scene` | Body class `snow-scene` | `brand-snow.js` | None | — | ENFORCED |
| `trailSessions` | Runtime binding or container `trailSessions` | `app1.js` | app3.js, app4.js, app5.js | 4 | report-only |
| `runStart` | Runtime binding or container `runStart` | `app1.js` | app3.js, app5.js | 3 | report-only |
| `trail` | Runtime binding or container `trail` | `app1.js` | app3.js, app4.js, app5.js | 7 | report-only |
| `notes` | Runtime binding or container `notes` | `app1.js` | app3.js, app5.js | 4 | report-only |
| `coveredIdx` | Runtime binding or container `coveredIdx` | `app1.js` | app3.js | 1 | report-only |
| `userPackCache` | Runtime binding or container `userPackCache` | `create-packs.js` | app4.js, app5.js, create-save.js | 3 | report-only |
| `settings` | Runtime binding or container `settings` | `app1.js` | app4.js | 8 | report-only |
| `activeRoute` | Runtime binding or container `activeRoute` | `app1.js` | app5.js | 2 | report-only |
| `routeLoaded` | Runtime binding or container `routeLoaded` | `app1.js` | app5.js | 2 | report-only |
| `gpsFromRun` | Runtime binding or container `gpsFromRun` | `app3.js` | app5.js | 1 | report-only |
| `LS` | Runtime binding or container `LS` | `app1.js` | app5.js | 1 | report-only |
| `ROUTE_PACKS` | Runtime binding or container `ROUTE_PACKS` | `data.js` | app5.js, create-packs.js, create-save.js | 6 | report-only |
| `crPackLoads` | Runtime binding or container `crPackLoads` | `create-citydata.js` | create-cache.js | 1 | report-only |
| `crPrep` | Runtime binding or container `crPrep` | `create-citydata.js` | create-cache.js, create-pick.js | 2 | report-only |
| `crPackCtx` | Runtime binding or container `crPackCtx` | `create-citydata.js` | create-cache.js, create-pick.js | 3 | report-only |
| `crPackNote` | Runtime binding or container `crPackNote` | `create-citydata.js` | create-cache.js, create-pick.js | 2 | report-only |
| `crGrid` | Runtime binding or container `crGrid` | `create-cache.js` | create-pick.js | 1 | report-only |
| `draft` | Runtime binding or container `draft` | `create-pick.js` | None | — | ENFORCED |
| `followPaused` | Runtime binding or container `followPaused` | `app3.js` | create-pick.js | 1 | report-only |
| `crCacheNote` | Runtime binding or container `crCacheNote` | `create-cache.js` | create-pick.js | 1 | report-only |
| `crCacheNoteCity` | Runtime binding or container `crCacheNoteCity` | `create-cache.js` | create-pick.js | 1 | report-only |
| `storage-done` | Route slot `snowroute.<id>.v2` (`done`) | `app1.js` | app4.js, app5.js | 4 | report-only |
| `storage-times` | Route slot `snowroute.<id>.v2.times` (`times`) | `app1.js` | app4.js, app5.js | 4 | report-only |
| `storage-hist` | Route slot `snowroute.<id>.v2.history` (`hist`) | `app1.js` | app3.js, app4.js, app5.js | 6 | report-only |
| `storage-notes` | Route slot `snowroute.<id>.v4.notes` (`notes`) | `app1.js` | app4.js, app5.js | 4 | report-only |
| `storage-via` | Route slot `snowroute.<id>.v4.via` (`via`) | `app1.js` | app4.js, app5.js | 4 | report-only |
| `storage-trail` | Route slot `snowroute.<id>.v4.trail` (`trail`) | `app1.js` | app4.js, app5.js | 4 | report-only |
| `storage-cov` | Route slot `snowroute.<id>.v4.cov` (`cov`) | `app1.js` | app4.js, app5.js | 4 | report-only |
| `storage-start` | Route slot `snowroute.<id>.v5.start` (`start`) | `app1.js` | app3.js, app4.js, app5.js | 6 | report-only |
| `storage-flip` | Route slot `snowroute.<id>.v5.flip` (`flip`) | `app1.js` | app4.js, app5.js | 4 | report-only |
| `storage-sides` | Route slot `snowroute.<id>.v5.sides` (`sides`) | `app1.js` | app3.js, app4.js, app5.js | 7 | report-only |
| `storage-sess` | Route slot `snowroute.<id>.v5.sess` (`sess`) | `app1.js` | app4.js, app5.js | 4 | report-only |
| `storage-pre` | Route slot `snowroute.<id>.v5.preload` (`pre`) | `app4.js` | app5.js, create-save.js | 2 | report-only |
| `storage-snap` | Route slot `snowroute.<id>.v5.snap` (`snap`) | `app3.js` | app4.js, app5.js | 4 | report-only |
| `storage-mig` | Route slot `snowroute.<id>.v2.migrated` (`mig`) | `app1.js` | app5.js | 1 | report-only |
| `storage-migfill` | Route slot `snowroute.<id>.v2.migfill` (`migfill`) | `app1.js` | app5.js | 1 | report-only |
| `storage-rundist` | Route slot `snowroute.<id>.v5.rundist` (`rundist`) | `app3.js` | app5.js | 1 | report-only |
| `storage-rundist2` | Route slot `snowroute.<id>.v5.rundist2` (`rundist2`) | `app3.js` | app5.js | 1 | report-only |
| `storage-night` | LocalStorage `snowroute.v2.night` | `app1.js` | app4.js | 3 | report-only |
| `storage-nightExp` | LocalStorage `snowroute.v2.nightExp` | `app1.js` | app4.js | 3 | report-only |
| `storage-fixlog` | LocalStorage `snowroute.v1.fixlog` | `app3.js` | app4.js | 3 | report-only |
| `storage-settings` | LocalStorage `snowroute.v2.settings` | `app1.js` | app4.js | 3 | report-only |
| `storage-userpacks` | LocalStorage `snowroute.v2.userpacks` | `create-packs.js` | app4.js, app5.js | 4 | report-only |
| `storage-packmig` | LocalStorage `snowroute.v5.packmig` | `app5.js` | app4.js | 2 | report-only |
| `storage-userpack-idb` | IndexedDB `snowroute-userdata/packs[id]` | `create-packs.js` | app4.js, app5.js, create-save.js | 6 | report-only |
| `gps-rec` | Locate recording class | `app3.js` | app5.js | 1 | report-only |
| `route-menu-open` | Route menu open/tab classes | `app2.js` | app5.js | 1 | report-only |
| `splash-visibility` | Intro splash visibility and lifecycle | `create-save.js` | create-pick.js | 2 | report-only |
| `brand-off` | Intro brand off/bye classes | `create-save.js` | app5.js | 1 | report-only |
| `city-list-arrow` | City picker scroll arrow classes | `create-pick.js` | app2.js | 2 | report-only |
| `gps-source` | MapLibre GeoJSON source `gps` | `app2.js` | app3.js | 1 | report-only |
| `route-stack-visibility` | MapLibre route-stack visibility, including title and route POI layers (hide/restore owned by setRouteBackdrop) | `app2.js` | None | — | ENFORCED |
| `map-pixel-ratio` | Map canvas pixel ratio controlled by the device profile | `app1.js` | None | — | ENFORCED |
| `map-listeners` | MapLibre listener registration on the shared map | `app2.js` | app1.js, app3.js, create-pick.js | 5 | report-only |
| `pace-sheet-lifecycle` | Pace sheet lifecycle classes and detent geometry | `app2.js` | None | — | ENFORCED |
| `streets-sheet-scroll` | Streets sheet body scroll offset | `app2.js` | app5.js | 2 | report-only |
| `brand-parked` | Create-from-boot parking class | `create-pick.js` | None | — | ENFORCED |
| `html-boot` | Root intro class | `create-save.js` | app5.js | 2 | report-only |
| `route-title-label-source` | MapLibre route title source `labelpts` (created in addRouteTitles, updated in glUnifyLabels) | `app2.js` | None | — | ENFORCED (source-ownership rule) |
| `offline-pack-cache` | Explicit offline route-pack cache | `app4.js` | app5.js | 2 | report-only |
| `routeBox` | Active route geometry bounds populated by buildGeometry | `app1.js` | None | — | ENFORCED |
| `ROUTE_TILE_NAMES` | Route tile-name list populated by buildGeometry and read by the basemap label exclusion | `app1.js` | None | — | ENFORCED |
| `crCitySeq` | City search request sequence | `create-pick.js` | None | — | ENFORCED |
| `restackArmed` | Pending basemap restack flag | `app2.js` | None | — | ENFORCED |
| `crSession` | Creation lifetime token bumped on enter and exit | `create-pick.js` | None | — | ENFORCED |
| `creating` | Creation lifetime flag set on enter and exit | `create-pick.js` | None | — | ENFORCED |
| `crStage` | Create-route stage set by stage transitions and exit | `create-pick.js` | None | — | ENFORCED |
| `last-area` | Last accepted city/area for create-route suggestions | `create-pick.js` | create-save.js | 1 | report-only |
| `brand-away` | Route pane away state projected onto the brand layer | `app2.js` | None | — | ENFORCED |
| `streets-sheet-lifecycle` | Streets sheet lifecycle and detent geometry | `app2.js` | None | — | ENFORCED |
| `basemap-label-policy` | Basemap layout, paint, exclusions, and route-name handover clones | `app2.js` | engine.js | 1 | report-only |
| `preview-save-enabled` | Save action availability on the create preview | `create-save.js` | create-pick.js | 1 | report-only |
| `map-viewport-size` | Resize of the shared MapLibre canvas | `app2.js` | app5.js | 1 | report-only |
| `streets-icons` | Streets open button, note button and note-row icon markup | `app2.js` | app4.js | 4 | report-only |
| `pace-icons` | Pace button markup | `app3.js` | app4.js | 2 | report-only |
| `gps-icons` | Recenter button markup | `app3.js` | app4.js | 2 | report-only |
| `create-icons` | Create back and search icon markup | `create-pick.js` | app4.js | 2 | report-only |
| `pace-icon-table` | Pace icon mint table populated by renderIcons | `app4.js` | None | — | ENFORCED |
| `snow-canvas-render` | Snow canvas bitmap size and frame rendering | `brand-snow.js` | None | — | ENFORCED |
| `home-tab-icon` | Tab icon markup for home | `app5.js` | app4.js | 2 | report-only |
| `routes-tab-icon` | Tab icon markup for routes | `app2.js` | app4.js | 2 | report-only |
| `clear-tab-icon` | Tab icon markup for clear | `app3.js` | app4.js | 2 | report-only |
| `gps-tab-icon` | Tab icon markup for gps | `app3.js` | app4.js | 2 | report-only |
| `streets-note-icons` | Streets row note icon markup | `app2.js` | app4.js | 1 | report-only |
| `clean-note-icons` | Clean detail note icon markup | `app3.js` | app4.js | 1 | report-only |
| `create-pin-icons` | Create search result pin markup | `create-pick.js` | app4.js | 1 | report-only |
| `pace-stat-icons` | Pace stat icon markup | `app3.js` | app4.js | 1 | report-only |
| `route-back-icons` | Route menu Back icon markup | `app2.js` | app4.js | 1 | report-only |
| `sheetClose-icon` | Close button icon markup | `app2.js` | app4.js | 1 | report-only |
| `paceClose-icon` | Close button icon markup | `app3.js` | app4.js | 1 | report-only |
| `rmClose-icon` | Close button icon markup | `app2.js` | app4.js | 1 | report-only |
| `map-canvas-listeners` | Gesture listeners installed on the MapLibre canvas | `app2.js` | app3.js | 2 | report-only |
| `map-repaint` | Frame scheduling for the shared MapLibre renderer | `app2.js` | create-pick.js | 2 | report-only |
| `keyboard-card-transform` | Keyboard shift state for the focused-field card (host, offset, settle flag, visible height) | `app5.js` | None | — | ENFORCED |

## Ambiguous states

No owner is assigned where the tree does not name one. These rows
carry no recognition patterns and are never enforced; their
writers are recorded so a future owner round can adjudicate from
evidence.

| State ID | Candidate owners | Why it stays ambiguous |
|---|---|---|
| `crSectorSession` | parts/create-fetch.js (reset) / parts/create-pick.js (session and face transitions) | Written by the fetch layer's reset and the pick layer's session handling; no single seat exists. |
| `crCov` | create-cache.js (grid reset) / create-citydata.js (merge/index) / create-pick.js (teardown) | Built by the cache/citydata pipeline and torn down by the session seat; ownership is split by pipeline stage. |
| `crCovGen` | parts/create-cache.js (grid) / parts/create-citydata.js (fallback) / parts/create-pick.js (lifetime invalidation) | The generation token is bumped by each pipeline stage and by session invalidation; no single seat exists. |
| `crPrepFail` | create-fetch.js (entry) / create-cache.js (grid) / create-citydata.js (fallback) / create-pick.js (teardown) | Written by every stage that can fail, and cleared at teardown. |
| `crFailFromGrid` | parts/create-fetch.js (entry) / parts/create-cache.js (grid) / parts/create-pick.js (teardown) | Error provenance follows the same multi-stage write pattern as crPrepFail. |
| `crPrepAnchor` | parts/create-citydata.js (preparation) / parts/create-pick.js (tap and teardown) | The retry anchor is set during preparation and consumed/cleared by the pick layer. |
| `crPending` | parts/create-pick.js (queue, re-render, removal) / parts/create-citydata.js (coverage sweep) | The pending-street collection is managed by the pick layer and swept by the coverage builder. |
| `crWanted` | parts/create-pick.js (offer) / parts/create-fetch.js (transition clears the offer) | The extension offer is raised by the pick layer and cleared by a fetch transition. |
| `storage-finclean` | app3.js (arms in the finish transaction) / app1.js (reconciles at load) / app4.js (restore discharge) | A cross-module transaction obligation: each writer is a different step of one protocol; no single seat exists. |
| `storagePersist` | parts/app4.js (declaration, reads, presentation) / parts/app5.js (sole writer: the boot persist() answer) | Home and sole writer are different modules by construction; the tree names no owner. |
| `route-menu-boot-chrome` | parts/create-save.js (intro) / parts/app5.js (return to picker) / parts/create-pick.js (park and resume) | The boot/show/bye/notrans classes are a lifecycle shared by the three boot-path seats. |
| `map-camera` | app2.js (selection) / app3.js (GPS follow) / app5.js (route framing) / create-pick.js (create framing) | Framed by four features by design; no single seat exists. |

## Retired states

- `snow-canvas-away` (the `#snowCv.away` step-aside, owned by
  brand-snow.js in the draft inventory): the mechanism was
  retired in Beta 1.301 (snow on every blue menu) - the class,
  its CSS rule and its last writer are gone, so the state no
  longer exists and the row is removed, not baselined.

## Delta from the draft inventory (Beta 1.300, 199 seats)

- 199 -> 192 seats, zero new seats. The seven removed seats are
  the Phase 3 sheet owner (4 Pace lifecycle writes left app3.js
  for the SHEETS owner in app2.js), the Phase 6 label owner (2
  route-stack visibility writes left create-pick.js for
  setRouteBackdrop in app2.js), and the retired snow-canvas-away
  seat (1).
- Owner changes: `route-title-label-source` and
  `route-stack-visibility` moved from engine.js to app2.js with
  the Phase 6 label owner.
- `keyboard-card-transform` resolved from ambiguous to app5.js:
  every kbShift binding and transform write sits in that file's
  keyboard module; the other candidates were surfaces it serves,
  not writers.
- The other 12 ambiguous states were re-checked seat by seat and
  stay ambiguous for the reasons tabled above.

## Enforcement

A row enforces - a NEW foreign write refuses the push and the
gate - only when all four hold: (a) its owner is unambiguous,
(b) the owner exists today as a single seat (one part file whose
writes to the state are the state's whole write set, in an owner
scope where the tree has one), (c) the regenerated scan finds
zero foreign seats for it, and (d) its recognition is exact
(literal class/key/binding names, never a broad family pattern).
Everything else stays report-only against the baseline: a new
foreign write prints and counts, and a round that adds one
refreshes the baseline by command with the seat reviewed.

`basemap-label-policy` is the worked non-example: its owner
(app2.js) is real, but one baselined seat remains - engine.js's
`tunePlaceLabels` place-label zoom write. Moving that write is
app work, so the row stays report-only until it lands.

`route-title-label-source` is enforced by the scan-parts
source-ownership rule (addSource/removeSource/setData on
`labelpts`, receiver-agnostic, owner functions named) rather
than by this scanner's patterns, which only see the map/GLM
receiver forms. One check per row, never two.

## Scanner contract

[The owner map](../scripts/parts-boundary-owners.json) records
state kinds, keys, owning files, recognition patterns, the
ambiguous rows with their candidates, and the exemption list.
The TypeScript AST traversal matches assignment/update targets
and direct member mutators, calls and their arguments, and the
documented function-local aliases. Binding rules verify the
write's root binding against its declaration file through the
type checker. Alias patterns with computed receivers cover the
named source locations. Dynamic values outside those patterns
still need manual review.

[The baseline](../scripts/parts-boundary-baseline.json) records
every confirmed foreign seat. Its identity is state ID, writer
file, enclosing function and the 1-based write ordinal for that
state within the function; lines are for display. Regenerate it
only by command (`node scripts/scan-parts.cjs .
--write-boundary-baseline`), never by hand; regeneration is
refused when the scan fails. In scan output, KNOWN seats count
silently, NEW and EXEMPT seats print per write, and the totals
line reports baselined / exempted / new plus the enforced-state
count. An `exemptions` entry in the owner map names the exact
site and gives a reason:

```json
{
  "state": "snow-scene",
  "file": "parts/app3.js",
  "fn": "paint",
  "occ": 1,
  "name": "temporary-preview",
  "why": "Preview has a separate exit path."
}
```

An exemption takes precedence over the baseline and over
enforcement, and appears in both the site diagnostic and the
totals. An exemption with a blank name or reason is ignored.
Review stale and duplicate exemptions and refresh this inventory
after owner moves.

## Coverage limits

The inventory is a static census of traced writes. Exhaustiveness
is NOT claimed for arbitrary aliases, destructuring targets, or
computed map IDs outside the traced families - the totals cover
the traced inventory. Patterns still need coverage for arbitrary
DOM and object aliases. MapLibre's internal effects are outside
the parts census. Scanner counts describe matches to the current
rules.

Strategic debt: the binding census, owner patterns, inventory
and baseline can drift independently. Derive the shared binding
evidence from one traversal before widening enforcement.
