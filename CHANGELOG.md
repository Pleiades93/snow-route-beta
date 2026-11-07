# Changelog

## Beta 1.143 — 2026-11-07
Packages D+E of the deep-audit fixes (DA-07 HIGH + DA-06 MEDIUM + DA-12 MEDIUM), gated build. DA-07: the one-time offline pack migration fired during app4's evaluation and captured its manifest from preloadUrlList() before create.js registered the created packs — the captured set was the shipped packs only (897 URLs), so the migration pruned a created route's downloaded tiles from the pack cache and certified the smaller set. The boot invocation now sits in create.js immediately after mergeUserPacks(), so the manifest is the true union over shipped + created packs; migratePack itself is unchanged, the 5W-only list still equals the frozen Offline Contract fixture exactly, and deleting a route still un-certifies. DA-06: the city cache's write queue captured the city name for its record key, but its failure suppression read the global cache note and its disclosure named whichever city was current — switching cities while a write was in flight charged the old city's failure to the new one and muted its writes for the session. The failure state now binds to the write's origin: the note carries an owner (crCacheNoteCity) and every queued write captures its commissioning session (crSession). Disclosure records the city whose write failed — and only while that session is still live; suppression applies only to that city's own steps in the same session; the hint shows the note only for the city it belongs to. The write itself always lands, exactly as before: queued cell writes must survive a preparation's cancel/resume (an earlier draft of this fix bound the state to the preparation instead of the session and dropped queued writes across a resume — CI's drive150 caught it before merge, and the binding was corrected to the session). DA-12: the city search's short/cleared-query branch returned before bumping its sequence counter and aborting the in-flight request, so a late answer repopulated a cleared field; reopening the pane invalidated only the last-city lookup. The short branch now invalidates + aborts like every longer query (the street search's established pattern), pane open/Back invalidate the search the same way, and the input handler itself invalidates + aborts at the event on every change — a response landing inside the 500 ms debounce window can no longer render into a field the user has already moved past. New: drive164 (stale-city cache failure + city search invalidation, 15 checks) and e2e-offline E23 (boot migration union certification); battery now 55 drives / 848 checks, e2e 40.

## Beta 1.142 — 2026-11-07
Package B of the deep-audit fixes (DA-05 + DA-01 + DA-09 + DA-08), gated build — one subsystem: backup / restore / the created-routes record. DA-05 (CRITICAL): saving a route and the restore merge both read-modify-wrote the whole created-routes record over the LENIENT loader, which turns a storage throw or a corrupt record into {} — one bad read rewrote the record holding only the new/restored routes and silently deleted every other created route's definition. Both sites now read STRICTLY (readUserPacks): a failed read refuses the operation with an honest message and writes nothing; the lenient loader remains for boot/display only, and parse-corrupt counts as failure, not empty. DA-01 (HIGH): a restore replacing a created route judged the incoming snapshot and street names against the OLD definition (the runtime pack won every lookup, and the pack list carried the id twice). The incoming definition now wins every restore lookup — the main loop, the unknown-name count, and a deduplicated allPacks. DA-09 (HIGH): the recovery export silently omitted created-route definitions when their record read failed, minting a file a fresh phone rejects wholesale. Recovery now settles definitions first: from the strict record read, or — when that fails — from the in-memory packs re-validated through normalizePack; a route whose definition cannot be carried is excluded from the file and NAMED in the result message (and a recovery for an open route whose own definition cannot be carried is refused). DA-08 (HIGH): recovery backups now carry each other running route's validated cancel snapshot, normalized against its own geometry exactly as the normal backup carries it (best-effort reads, as recovery is). New: drive163 (created-route data safety, 14 checks); battery now 54 drives / 832 checks.

## Beta 1.141 — 2026-11-07
Package A of the deep-audit fixes (DA-03 + DA-10), gated build. DA-03 (CRITICAL): the transaction coordinator never undid the FAILING step, so a finish whose cleared-board write landed but failed its read-back reported "your clean is intact" over a cleared board. txSet/txDel now tag failures with failKind ('write' = the write call failed, nothing landed; 'verify' = the read-back disagreed, the write may have landed), and runTx undoes the failing step first — verified like every undo — unless the failure is 'write'-kind; an unverifiable failing-step undo yields 'degraded', never a clean 'rolled-back'. DA-10 (MEDIUM): a committed finish whose notes/coverage cleanup writes failed lost the retry obligation with the page, leaving the old clean's notes/coverage live forever. The finish transaction's first step now writes a durable cleanup obligation (new slot record v5.finclean, transient like v5.snap, never backed up); any successful saveAll discharges it; completeFinishCleanup() completes it at load under guards (obligation present, no live run, board in the cleared post-finish state) with verified writes; a successful restore discharges it by replacement. New: selftest-tx failing-step cases (31 checks) and drive162 (finish-cleanup obligation, 10 checks); battery now 53 drives / 815 checks.

## Beta 1.140 — 2026-11-07
No sideways scroll in the menu lists (Andrew, direct ship at his order — mechanical integrity only, no test battery): the 1.138 scroll boxes computed overflow-x to auto alongside overflow-y, and the 1.139 row gutter gave the content a few px of horizontal give — the city list could be dragged left/right and names slid under the edge. Both boxes (#crCityList, #rmRoutes) are now overflow-x: hidden. CSS only.

## Beta 1.139 — 2026-11-07
City-list polish (Andrew, direct ship at his order — mechanical integrity only, no test battery): the Select-from-list pane title is now just "Select City"; city rows (and route rows, same geometry) carry a 12px right gutter so the scroll bar rides beside the bubbles instead of over them; the "last used" tag on a city row is its own span in the app's gold (#ffc233, bold) instead of plain text trailing the sub-line. The two drives that assert the pane title (153/154) had the title literal rolled to match; their other premises are untouched.

## Beta 1.138 — 2026-11-07
Capped blue-menu lists (Andrew's pick from three options, direct ship at his order — mechanical integrity only, no test battery): the 1.137 whole-menu scroll left the Select-from-list pane's title riding at the very top of the screen and scrolled the title away with the list. Now #crCityList and #rmRoutes (the Choose-a-route list, same shape) are capped at .52 of the visible height — the sheets' half-height language — and scroll inside their own box with overscroll contained; the pane title and Back button stay pinned. CSS only.

## Beta 1.137 — 2026-11-07
Routes-menu scrolling (Andrew's report, direct ship at his order — mechanical integrity only, no test battery): with all 12 city packs published, the Create new route → Select from list pane outgrew the screen, and #routeMenu — unlike #setMenu, which got its overflow rule in 1.111 — had no scrolling at all, so the list could not be moved. #routeMenu now carries the same treatment as Settings: overflow-y auto on the menu plus flex-shrink 0 / auto vertical margins on its panes, so every blue-menu pane centres when it fits and scrolls from the top when it does not. CSS only; no behaviour or data changes.

## Beta 1.136 — 2026-11-07
Programme build 5 — candidates E (test & CI machinery) + F (small consolidations) from the 2026-11-06 maintainability scan (adjudicated; re-scan confirmed on 1.129). Feature tier: branch + battery on touched surfaces + the standing Codex verify gate before merge. App behaviour does not change: the F consolidations are value- and output-identical by construction (the battery is the judge), and the E items touch tests, CI and docs only.

**E — test & CI machinery**
- **drive130 L7 hardened (the prescribed fix, six CI sightings of the flake family).** The check waited on a proxy — the clone label layers holding the two street names — then sampled the clone/original sets once; the sample could land mid tile-settle with the sets inverted. The wait now polls the terminal settle signal itself, the check's own full predicate (clones hold both names AND originals hold neither), before the unchanged read + assertion. A page that never settles still fails, on the read shown.
- **Shards rebalanced by measurement, and generated.** Per-drive durations were measured from the timestamped job logs of the four most recent full-battery runs (median per drive; `scripts/shard-durations.json` records the method and the runs). The hand-kept lists had drifted to 359/133/289/245 s; the generated partition holds 472/473/466/472 s. NEW `scripts/gen-shards.py` generates the four lists from `run.mjs`'s ALL (the single source) + the durations file by longest-processing-time; the shard-coverage guard stays in CI as the tripwire that any lists present partition ALL exactly once.
- **`timeout-minutes` on every checks.yml job** (build-and-test 20, browser-tests 45, browser-smoke 30, offline-e2e 30) — through 1.135 no job had one, so a hung job ran to GitHub's 6-hour default.
- **NEW `scripts/premise-lint.py`** — given a diff of parts/, it extracts the string literals the diff removes, drops any that survive in the head of their own file, and reports every drive still asserting one. Wired as a pre-ship step in DEVELOPMENT_RULES §1, as item 5 of the test-change gate in docs/TESTING.md, and as an advisory step on pull requests in CI. Proven against the Beta 1.132 expiry shape: a rename of "Entire road" flags exactly the drive premise it would expire. This build's own app diff raises no flags.
- **Smoke set grown 4 → 6.** NEW drive160 (the create gate opens: doors, both sub-doors, Back — from a cold boot) and drive161 (Settings opens: main pane, Status, Backup, close) join drives 89/123/132/145 on main pushes.
- **The drive compatibility surface is frozen in docs/TESTING.md.** Census (this tree): 44 of 52 drives call app functions directly; 107 distinct globals, loadRoute ×16, togglePiece ×12, buildBackup ×10 at the top. (Corrected in the verify cycle: the first census missed the `async function` declarations and said 99.) The surface is named a compatibility contract: renaming or re-contracting a surfaced global is a test change under the gate.

**F — small consolidations (behaviour identical)**
- **Named rule-constants block (app1).** The product rules that were numeric literals now live in one block: the coverage trio (COV_SAMPLE_M 15 / COV_RADIUS_M 22 / COV_FRAC 0.85), the GPS accuracy gate (GPS_ACCURACY_M 65 — one constant behind the two complementary comparisons), and the pack validator's caps (PACK_NAME_MAX / PACK_AREA_MAX / PACK_STREET_NAME_MAX 60, PACK_STREETS_MAX 300, PACK_SEGS_MAX 80, PACK_SEG_PTS_MAX 4000, PACK_POINTS_MAX 150000, PACK_TILENAME_MAX 80, PACK_TILENAMES_MAX 400). The fence is honoured in the block's own text: equal numbers serving different policies stay separate constants — GPS_STALE_MS and TRAIL_FLUSH_MS are both 45 s by coincidence, never by reference, and the validator's per-field 60s and 80s are likewise separate. COV_SAVE_MS (1.135) is declared in the block; its flush discipline is unchanged. Call sites: samplesFor, coverFix, acceptFix, the stale-watch restart, flushAux, normalizePack. The packfields fixture gate's sandbox now receives the caps from the block (extracted like PACK_FIELDS) and pins their values (its P3 fence) — the branch CI caught the sandbox gap the local loop misread, which is what the gate is for; a second CI pass caught the extraction matching only the first name in each comma-chained const line (PACK_AREA_MAX), and the extractor now accepts the chain comma as an introducer.
- **SLOT_KEYS helper (app1).** `slotKeys(id)` returns a route slot's backup keys (the ROUTE_FIELDS keys + the cancel snapshot) for key-only enumerations; the restore's rollback scope builds from it. Backup field loops keep walking ROUTE_FIELDS (they need the names) and deletion keeps enumerating routeKeys' values — both deliberate, documented at the helper.
- **Codex verify fix cycle (pre-merge).** The verify pass caught one real behaviour difference in the item below: the recovery export's night/nightExp pair had lost its one-try short-circuit (a failed night read no longer skipped the expiry read). The pair again reads the expiry only when the override read succeeded — proven identical to 1.135 on a five-case differential (reads taken + object built). The same cycle restored the hoisted engine veto's body to byte-identity with the 1.135 inner copies (indentation included) and corrected the census above.
- **Backup raw-read helper (app1 + app4).** `rawRead(key)` with its RAW_READ_FAILED sentinel is now the one raw storage read behind all nine backup-path getItem sites (snapForExport, both export objects, the restore's safekeeping snapshot). Each site keeps its exact failure mode: the strict export aborts on a thrown read, the recovery export skips the field, the restore stops before writing. app4.js carries no direct `localStorage.getItem` any more.
- **One route-row builder (app2 + create).** `routeRowShell(tag, name, sub, opts)` builds the .routeRow shape (meta column, name line, optional area line, optional chevron) for all three hand-built sites: the route list's rows (routeRowEl now adds only the badge/Delete extras), the city chooser's rows + loading row, and the manual-search result rows.
- **Engine bridge veto, one copy (engine).** `pathBadNear` was defined identically inside both mergeStrands and bridgeStragglers (verified byte-identical before the move); it now lives once at engine level and both passes call it.
- **CR_FACES table (create).** The create sheet's three faces (element id + geometry class each) live in one table; crFaceEl, syncCrPanel, crMorphCleanup and crMorphTo all read it — the five hand-listed sites collapse to the table.
- **crSectorReset() (create).** A sector session's teardown (street cleared, Cancel snapshot dropped) was written out at six sites; all six call the one function now.
- Registry probes pin the new shapes (constants block, rawRead, slotKeys, row builder, CR_FACES, crSectorReset, the hoisted veto, generated shards, premise lint, the timeouts, the frozen surface).


## Beta 1.135 — 2026-11-07
Programme build 4 — candidates D (driving-path speed) + N3 (sector-toggle recompute) from the 2026-11-06 maintainability scan (adjudicated; re-scan confirmed on 1.129). Feature tier: branch + battery on touched surfaces + the standing Codex verify gate before merge. The build's invariant is byte-identical outputs — coverage contents and suggestions, trail rendering decisions, stretch/sector geometry — proven on fixtures before/after (the harness lives in the build's work pack) and judged by drives 126/127 (coverage) and 156–158 (sectors).

- **Coverage persistence is throttled (app1).** `flushAux` re-stringified the whole coverage map on EVERY GPS fix (~1 Hz for a whole clean). Unforced flushes now write the coverage record at most once every 15 s (`COV_SAVE_MS`); forced flushes — visibility hidden, pagehide, the route switch's pre-flush — always write. The throttle window starts only on a successful write, so a failed write keeps `auxDirty` set and retries on the very next flush, and `saveAll` still writes coverage unconditionally. On the fixture's 20 fix-flushes: 20 coverage writes → 2, with the forced/failure/retry sequence behaving identically.
- **coverFix tests only reachable streets (app3).** Through 1.134 each fix rebuilt a Set from `coveredIdx[n]` for every street and distance-tested every uncovered sample of every street. The Sets now persist across fixes (mirroring `coveredIdx`'s arrays in the same insertion order, written back in 1.134's own per-fix form — the stored JSON is byte-identical), and each street's samples are boxed once, bounds padded by the 22 m radius, so a street the fix cannot reach skips its distance tests — never its suggestion check, which 1.134 runs for every candidate street on every fix (a street can sit at 85% from coverage loaded at boot with the suggestion set reset). Caches key on identity: `coveredIdx` is only ever rebound wholesale (load, cancel-restore, finish, clear), and the boxes key on the `buildSamples` generation. On a scripted drive over three streets: 333,628 distance tests → 23,465 (14×), with identical coverage snapshots at every checkpoint, an identical suggestion sequence, and an identical dirty-mark count. The Codex verify's first pass caught two ways an earlier draft of this fix broke the byte-identical invariant (the swallowed reload suggestion above, and duplicate-index normalization in the write-back); both are fixed, harness-covered, and were confirmed on the verify's second pass.
- **drawTrail throttles before it filters (app3).** The redraw throttle (3 s / 5 undrawn points, Beta 1.64) is now decided from a bare counting pass; the filtered copy of up to 8,000 trail points is built only when a redraw actually happens. The throttle decision and every drawn payload are unchanged (fixture-verified hashes).
- **samplesFor walks each line once (app3).** The segment cursor is hoisted out of the 15 m sample loop — sample distances rise monotonically, so the cursor advances at most once per segment instead of restarting at the line's start for every sample. Route 5W: 18,449 cursor-condition checks → 1,859; the 1,197 samples are byte-identical.
- **One draft geometry per change (create.js; programme N3).** A sector toggle recomputed `computeStretches(draft.roads)` twice (draft render + lists) — 87,106 segment tests per toggle on a six-street draft, ~998,538 on a full-size one. `crDraftGeom` now computes it once per draft-geometry change and shares it with every consumer (render, lists, name-it summary); invalidation is exact — street add/remove bump a generation counter, every other structural change replaces the draft or roads object the cache keys on, and selection-only changes (sector picks, MAIN/2ND flips) never recompute. Proven by the fixture harness (cached geometry deep-equals a fresh computation at every step of an add/remove/clear-all/replace sequence) and by drives 156–158.
- Five fix-checks registry probes pin the new shapes (coverage throttle, coverFix box skip, drawTrail order, samples cursor, draft-geometry cache).

## Beta 1.134 — 2026-11-07
Programme build 3 — candidate B from the 2026-11-06 maintainability scan (adjudicated; re-scan confirmed on 1.129): `parts/app4.js` split at the create banner. Feature tier: branch + battery on touched surfaces + the standing Codex verify gate before merge.

- `parts/app4.js` (2,581 lines) split at the Beta 1.118 create banner (its line 968). Everything before the banner — backup/restore, preload, update check, Settings, service worker + boot, route loading — stays in `app4.js`; everything from the banner to the end of the old file (created-route packs + the one validator, city preparation, picking, sectors, the panel, the shared confirm — and the boot-tail IIFE that physically follows the create section) is the new `parts/create.js`. `scripts/assemble.py`'s PARTS list is the single place the new part joins the assembly, immediately after app4.js.
- No behaviour change, proven by bytes: with only this release's version strings and What's New entry reverted, the assembled page hashes identically to Beta 1.133's (sha256 9444456b0810…), and the shipped index.html matches under the same normalization (the CSP script hash is a function of those same strings). The split changes which FILE a line lives in, never the shipped script's bytes or order.
- Costs paid deliberately (the scan named them up front): 62 fix-checks registry probes re-pointed to the file their subject code now lives in — 61 by measured content location, and the Phase-3 `saveQuiet` absence probe retargeted at the assembled source, the one target that still covers both halves; `tests/browser/selftest-packfields.mjs` extracts `normalizePack` from create.js now (the only selftest whose subject moved — the round-112, SW-contract and trail-segments extractions all read platform code that stayed). docs/ARCHITECTURE.md's part table gains the create.js row; the `normalizePack` pointer moves with it.

## Beta 1.133 — 2026-11-07
Programme build 2 — candidate C from the 2026-11-06 maintainability scan (adjudicated; re-scan confirmed on 1.129): the release bookkeeping is generated, not hand-kept — plus, as this build's first job, the repair of the drive premises Beta 1.132's renames expired. Feature tier: branch + battery on touched surfaces + the standing Codex verify gate before merge.

- NEW `scripts/release.py` — the single source for the README battery counts. It derives them from the suite itself (the drive count from `tests/browser/run.mjs`'s ALL list; the check counts from the suites' own assertion call sites, by the counting rule stated in the script) and rewrites the README lines; `--check` fails when the README disagrees. `build-pages.py` asserts the same derivation on every build, so a stale count now fails the build instead of drifting silently. `release.py` also prints the release checklist, separating the generated steps from the editorial ones (the CHANGELOG entry and the What's New prose stay editorial).
- The build now gates What's New alignment: `build-pages.py` asserts `WHATSNEW.v` equals the displayed version (before this build the gate compared only #ver against the CHANGELOG — the 1.125 direct ship left WHATSNEW stale and only a registry probe noticed). A stale `WHATSNEW.v` fails the build; demonstrated on a deliberately staled copy during this build.
- Splash injection: `parts/head.html` no longer carries the splash icon as a 281 KB base64 line — it carries a placeholder token, and `scripts/assemble.py` inlines the exact bytes of `icon-512.png` at assembly time. The artwork is untouched (this is NOT the declined re-encode) and the shipped page is unchanged: the new tree with only this release's version strings reverted builds to the exact Beta 1.132 page hash. head.html itself drops from ~348 KB to ~67 KB of reviewable source.
- Drive premises repaired (the KNOWN-EXPIRED-BY-1132 note): drives 156/157/158 assertions now use the 1.132 labels ("Entire road", "Done", "Entire road picked · ", "Entire road · ") — labels only, every assertion's meaning unchanged.
## Beta 1.132 — 2026-11-06
Cosmetics, shipped DIRECT to main at Andrew's explicit order (2026-11-06, "push without testing"; visual tier): mechanical integrity only — assemble + build check + hash-verified push + live read-back. No test battery, no Codex gate.

- Sector bar labels: "Whole road" → "Entire road" (the button, the picked-rows' descriptor and the sector bar's own status line renamed together — one concept, one label); "Done with this road" → "Done".
- Entire road on the night map: the button's text colour comes from --link, which is #2b4bf2 in BOTH themes — measured on the shipped 1.131 build at 5.66:1 against the day card but only 2.44:1 against the night card, which is why it vanished on the dark map. A night-scoped rule now gives it --sec for text and outline, the blue-grey token that does flip at night (#9fb4c8). Day treatment untouched.
- The discard ask changes shape (Andrew): askDiscard's confirm now passes {oneBtn:true} to crConfirm — ONE red Discard button and nothing else in the row, dismissal on the card's plain red corner ✕ (the new crModalX joins the app's shared corner-X rule) and on a tap of the backdrop; dismissing always means keep editing. Route Delete, Clear all and every other confirm keep their two-button shape.
- Pill-gap touch guard (Andrew): in the create sheet's two floating geometries (crG-strip / crG-bar) an invisible strip under #createSheet now absorbs touches in the 12px + safe-area gap below the pill, so a swipe starting there no longer pans the map. The flush panel geometry is unchanged, and there is no visual change.

Known-expired by this ship: the label changes expire text assertions in drives 156/157/158; a KNOWN-EXPIRED-BY-1132 note is appended to the snow goal's flake-log for repair at the next gated build (the drives are deliberately NOT edited in a direct ship).

## Beta 1.131 — 2026-11-06
Maintainability programme, build 1 of 4 — the programme Andrew approved in full on 2026-11-06 (A–F + N2 + N3, in sequence) after the three-seat maintainability re-scan of Beta 1.129. This build lands A (one pack-field list) + N2 (one junction-cut finishing policy). Internal only: NO behaviour change, and the identity is proven, not asserted (below).

A — ONE PACK-FIELD LIST. `normalizePack` rebuilt every validated pack from a hand-written field literal; a field that joined the pack format but not that literal would have been silently dropped on every created, imported and restored route — the re-scan's top-ranked silent-loss trap (Claude seat's candidate 1, re-verified on 1.129). The format's fields now live in ONE list, `PACK_FIELDS` (app1, beside `ROUTE_FIELDS`), and `normalizePack` builds the pack by walking it. Fences kept, per the adjudication: `snap` stays OUT of the list (it is a storage-slot field, hand-carried at restore scope by design; `ROUTE_FIELDS` is untouched); sectors keep flattening into `roads` at save (no new pack field); built-in packs unchanged. Proof (test-change gate): new `tests/browser/selftest-packfields.mjs`, wired into the build-and-test CI job — the fixture cases' expected outputs were captured from the PRISTINE 1.130 validator before the change (`tests/browser/fixtures/packfields-cases.json`) and the new code reproduces them serialized-identically, values and key order; and the trap is proven dead in the harness — a field name appended to the list is carried through, the same field unlisted is dropped, and `snap` stays dropped either way.

N2 — ONE JUNCTION-CUT FINISHING POLICY. The finishing rule for cutting a street at its junctions (sort the cuts; merge cuts closer than 15 m; drop cuts within 12 m of either end; slice at the surviving bounds) was implemented twice: cleaning stretches (`computeStretches`, app1) and sector cutting (`crStreetParts`, app4) — two copies free to drift apart. It now exists exactly once, `finishJunctionCuts` (app1), and both cutters finish through it, with its exact inequalities and merge order. The junction SOURCES stay distinct by design (the route's own streets for stretches; the prepared extract for sectors) — only the finishing policy is shared. Proof: comparison harnesses (kept in beta1/work/maint-programme-1131/) — `computeStretches` over the shipped 5W pack produces the identical stretch structure (34 streets, 87 stretches, full-structure hash equal), and `crStreetParts` over the shipped Vaughan pack produces identical parts for all 4,477 streets (10,708 parts, zero differences). Sector drives 156/157/158 green unchanged.

This build passed the programme's Codex verification gate before merge (verdict and session recorded in the ship record). Pack format unchanged; storage untouched.

## Beta 1.130 — 2026-11-06
Create-flow round 5 — Andrew's cold-open report on 1.129: cold open the app → Create new route → Select from list → "a glitch or a stutter… like a loading screen before the city list shows up." Diagnosed first, with timing evidence from cold profiles (beta1/work/cold-stutter-1130/DIAGNOSIS.md): with the catalogue download artificially delayed 1,500 ms, the Select-from-list tap → rows painted measured 1,540 ms, of which the fetch itself was 1,510 ms and everything else (pane switch 1 ms, row build + paint ~20 ms) was noise; with the catalogue instant, the same tap painted in 21 ms. And the fetch started AT the tap — 0 ms before it — even after a 1.5 s dwell at the doors, because nothing in the app requested packs/index.json until crRenderCityChoices ran on the door tap itself (its only other caller runs during city preparation, after a pick). On the phone that fetch is a cold, network-only request, and it WAS the loading screen.

THE FIX: the catalogue download no longer waits for the list tap. Andrew's own suggestion — load it during the splash screen — was adopted for the CATALOGUE ONLY and moved as early as is safe: a fire-and-forget warm (crWarmCityLibrary, riding crPackIndexLoad's cached promise — still at most one catalogue fetch per session) fires in the boot tail's menu-arming slot, the deferred moment when first tiles are in (or the 6 s escape has passed) and the splash's 1900 ms floor has run, so it never competes with first paint — a cold open has the catalogue in hand before Create is ever opened. The city PACK FILES were explicitly NOT pulled into boot (6.5 MB of gzip across the library; packs stay on-demand per city, as designed). The Create button's handler, openDoors and openRouteMenu re-trigger the warm as harmless no-ops on the cached promise. And while a fetch is genuinely still in flight, the list pane no longer floats a bare note on an empty pane: it shows a "Loading cities…" row in the city rows' own routeRow styling, replaced by the real rows when the download lands. A failed catalogue degrades exactly as before — the honest "isn't available — use Search manually" note (1.124); no other surface changes behaviour.

Proof: new drive159, on cold profiles with the catalogue stub-delayed at the network seam — the catalogue request starts during boot with no tap at all; with it landed, the Create → Select-from-list walk renders the five city rows immediately (under 2.5 s against a 6 s stub delay, i.e. no fetch in flight at tap time, and exactly one catalogue request for the session); with the fetch in flight the pane shows the Loading cities row in routeRow styling and the rows replace it when it lands; a 404 catalogue still lands on the honest note. The timing/loading-row assertions are red on the pristine 1.129 tree (there the request starts at the list tap and the in-flight state is the bare note). Pack format unchanged; storage untouched.

ALSO IN THIS BUILD — two findings from the same evening's maintainability re-scan (Codex seat, verified first-hand): N1, a user-visible wrong number: the preview's rows billed the WHOLE road for a sector-trimmed street (crRowEl read the whole-road total) while the picking panel billed the chosen length and the preview's own total summed the chosen lengths — the check screen disagreed with itself. The preview's rows now read through the same helper (crStreetChosenM) as every other stated length; drive156 proves a trimmed street shows its trimmed length on both the panel and the preview, and that the preview total equals the sum of its rows (red on 1.129). N4, a test-honesty correction: the 1.129 entry below says drive158 asserts "per-frame movement bounded against each edge's total travel" — it does not, and never did: drive158 computes the worst per-frame steps and PRINTS them, but its pass predicate is presence in every frame + monotonic edges + distinct intermediate heights (the cadence-independent proof a face swap cannot pass). The wording is corrected here and in drive158 itself, whose failure names now also classify the evidence — OBSERVED DISCONTINUITY vs INSUFFICIENT OBSERVATION — with no assertion loosened.

## Beta 1.129 — 2026-11-06
Create-flow round 4 — Andrew's two remaining complaints from his 1.128 device session (his verdict on 1.128 otherwise: "now the sectors works").

CANCEL WHILE SELECTING: sector mode gains a Cancel button beside Whole road / Done with this road. Entering sector mode — from the map re-tap or the panel row — snapshots the street's pick exactly as it stands (whole road, or the trim then in force); Cancel restores that snapshot exactly (draft state, panel row, painted geometry, every stated length) and leaves sector mode. Done keeps the session's trims, as before. Cancel is the deliberate back-out, distinct from un-picking every sector by toggles, which still removes the street. (The audit the brief asked for: exiting CREATION mid-draft already asks first — `askDiscard` guards both the pick stage's ✕, once the search is clear, and the preview's Start over — so no new flow was invented there.)

THE PANEL IS ONE OBJECT: the pick sheet's three faces were still three separate boxes — 1.128 sprang the sheet's height and slid them, but each face carried its own margins and radii and the rest state landed in a shape the eye had not been watching; on Andrew's phone it still read as "animate down, then disappears, and a pill appears". Now #createSheet ITSELF is the card — it carries the background, shadow and radius in every state — and the panel / strip / sector bar are CONTENTS inside it (the .crG-* classes hold the three resting geometries; the contents carry no card styling of their own). A face change (crMorphTo) springs the surface's own height on the closed-form spring and derives every other property from the same progress: side insets, bottom inset and all four corner radii travel together, so the box contracts toward the bottom bar's footprint on ALL sides at once — "retracted into the pill form like it's being absorbed from all angles" — while the outgoing and incoming contents cross-fade inside it. The box on screen at the start of the motion is the box on screen at the end, at every frame between: it is never display:none and it never teleports. All four transitions (panel ⇄ bar, panel ⇄ sector bar) run through it, and the head-drag now moves the surface itself, the morph starting from the finger's displaced edge at the finger's speed. Resting geometries are unchanged — the panel still caps at ~half the viewport with rows scrolling inside, the bar is the same slim shape, the sector bar the same shape — and the bar still exists at zero picks.

Proof: new drive158 samples the one surface's bounding box and computed background on EVERY animation frame (a requestAnimationFrame sampler in the page) across collapse, expand and the panel ⇄ sector-bar transitions, in both themes, and asserts the surface is visibly present in every frame, no edge teleports (per-frame movement bounded against each edge's total travel), and the resting boxes are the approved geometries — the failure property itself, after two builds passed proxy checks (springs ran, rest faces correct) while the device-visible motion was wrong. On the pristine 1.128 tree those assertions fail by construction (the sheet there is transparent; the card teleports between three elements). drive158 also proves the sector Cancel: restoring a just-trimmed street to whole, restoring a previous trim after further toggles, Done keeping trims, and the snapshot discipline on both entry doors (map re-tap and panel row). Premise updates, marked in place: drive150 I2 and drive156 B2 now read the one surface where they read a face's card before (the meaning — the pick sheet wears --card-solid, no hardcoded white — is unchanged). Pack format unchanged; storage untouched.

## Beta 1.128 — 2026-11-06
Create-flow round 3 — Andrew's device feedback on 1.127, the same evening he approved its mockups: sectors could not be reached the way he actually works, the finish chain confused him, the panel's tuck-away glitched, and an empty panel could not be put away. A read-only diagnosis first (beta1/work/sector-diagnosis-1128/DIAGNOSIS.md) ranked the causes; this build answers all of them.

SECTORS OPEN FROM THE MAP (the headline fix): sector mode's only door in 1.127 was tapping the picked road's ROW in the panel — nothing on the map ever entered it, so every map tap picked the whole street, which is what Andrew reported ("it still selects the entire road"). His fork, decided in chat: tapping an ALREADY-PICKED road on the map now opens ITS sectors (pickStreet routes there; the row door stays). 1.127's tap-again-to-deselect is RETIRED — removal lives only on the panel row's ✕ and Clear all.

ONE-PIECE STREETS ARE HONEST: the diagnosis measured the shipped Vaughan pack with the app's own cut rules — 221 of 1,299 streets ≥ 500 m compute to exactly ONE sector (crossings clustered at the mouth are merged/erased by the 15 m merge and 12 m end margins). In 1.127 such a street's sector bar said "tap sectors to trim it", and tapping its only sector un-picked the street entirely. Now the bar says "One piece · X m — no cross-streets to split it at, so it goes into your route whole", and tapping the sole sector changes nothing (a toast says why). The cut rules themselves are unchanged — they mirror the cleaning stretches by design. Un-picking every sector of a MULTI-piece street still removes it.

WORDING + FLOW (Andrew's words): the picking panel's footer loses "+ Add a street" entirely (it never added anything — it only tucked the panel; tucking belongs to the head's grab/tap) and its primary button reads "Done" — always; the "Done — back to check" rewrite is deleted with the return-mode state (crReturnToPreview) that existed only to drive it. The preview keeps "+ Add a street" (Done there returns to the same preview), and its primary button reads exactly "Save route" — it advances to name-it, as the old button did; the compound "Looks right - save route" is what he objected to. NAMING STAYS ITS OWN STEP (Andrew's veto, same evening): a draft of this build folded the name field into the preview; Andrew vetoed it before ship — name-it remains the separate final step, exactly as it worked, and its "Save route" button remains the only actual save.

THE PANEL SLIDES INTO A BOTTOM BAR: 1.127's syncCrPanel hard-swapped three elements mid-spring (panel slides down → instant cut → a smaller rounded bar at a different size — the "glitch into a pill"). Face changes are now ONE continuous motion (crMorphFaces): the sheet's own height springs between the two faces' heights on the sheets' closed-form spring, the old face slides down out of the clipped sheet, and the new face rises/fades into exactly the bottom slot (its own margins) it rests in — the rest state (syncCrPanel) then applies to the geometry the eye already sees, so nothing jumps. Both directions, and panel↔sector-bar too.

EMPTY STATE: the bottom bar exists at ZERO picks ("No roads picked yet — tap roads on the map to add them") and the panel retracts to it / restores from it at any pick count; 1.127's strip demanded a non-empty draft, so collapse at zero sprang down and bounced back.

DISCOVERABILITY: untrimmed panel rows now carry "— tap row to adjust" from the start (1.127 showed it only after a trim existed).

Proof: new drive157 (map-tap sector entry through the real crMapTap seam, tap-again no longer removing, one-piece honesty, the Done/Save-route wording in both flow states, the kept name-it flow saving end-to-end under a typed name, collapse/expand sampled as a continuous motion with both faces live mid-change, the zero-pick bar) — red on the pristine 1.127 tree. drive156 premises updated where 1.127 behaviours were deliberately replaced (B4 tap-again, B5 the Add-a-street tuck, and the face-swap settle waits); drive150 premises updated for the labels (B2's Done label; A9/C6 keep the name-it flow). Pack format unchanged; storage untouched.

## Beta 1.127 — 2026-11-06
Creating a route gets the selection redesign Andrew approved from rendered mockups (beta1/work/create-sectors-mockups/), plus his two additions made while approving (Clear all; the panel must never bury the map) and a defect he reported the same evening (Back buttons firing along their whole row).

SECTORS: a picked street can now be trimmed to the junction-to-junction pieces he actually cleans. Tapping a street's row in the panel opens sector mode: the street renders per sector (chosen in its category colour, unchosen thin grey), taps toggle sectors, the bar counts "N of M sectors picked · X m", Whole road restores everything, Done returns to the panel. Sector boundaries are computed with computeStretches' own cut rule (4 m join tolerance, cuts merged under 15 m, 12 m end margins) over the street's stitched line, with the prepared extract as the junction set — so the pieces are the real cross-street pieces and never shift as other streets join or leave the draft. Sector state lives only in the draft (draft.sectors; an absent entry means the whole road); at Save, crFilteredRoads stores ONLY the chosen sectors' polylines — the pack format is unchanged (roads = segment lists) and everything downstream derives from the stored geometry as always. Un-picking every sector removes the street. Every length the flow states (panel header and rows, preview count, name-it summary, preview framing) bills chosen geometry only.

TAP AGAIN TO DESELECT: a second map tap on a picked street removes it instantly (toast names the removal), through the one removal path (crRemoveStreet) the panel's ✕ and the preview's ✕ also use.

THE PANEL replaces the pick-stage count sheet: "Your route so far" header with the live count and Clear all (behind the shared confirm, the delete/start-over discipline; the city stays loaded); one compact row per road — category dot, name, "Whole road · X m" or "N of M sectors · X m — tap row to adjust", the MAIN/2ND chip in the row, ✕. Footer: + Add a street / Looks right →. The panel never exceeds the sheet cap (~half the screen); rows scroll inside it. TUCK-AWAY: drag or flick the grab handle / header down (or tap it) and the panel springs away on the sheets' own closed-form spring, leaving the slim strip "N roads picked · X m" + Review ▴; Review springs it back. All three faces (panel, strip, sector bar) wear the theme tokens in both day and night.

BACK HIT AREA (defect): the blue menus' panes are flex columns, which stretched every .rmBack button to full pane width — a tap anywhere along the row, far right of the visible "← Back", navigated back (Andrew, on device, in both the route menus and Settings). align-self: flex-start on the one shared class shrinks every Back in both menus to its visible words.

Proof: new drive156 (the sector round-trip incl. the saved pack's shrunken geometry, tap-again removal, the in-row chip, Clear all behind its confirm, the panel cap + scrolling list at 8 streets, collapse/Review, and the Back hit area in a route pane AND a Settings pane). Premise updates where the panel legitimately replaced the count sheet: drive150 A4/A6/A7 + its I2 theme probe (now reads the panel face), drive155 A4/B2 (the header count's new shape) — assertions preserved in meaning, marked in place.

## Beta 1.126 — 2026-11-06
Creating a route after deleting one was broken (Andrew's device report on 1.124/1.125): he deleted his created route — it was the active one — then Create new route showed no street search bar, and the bottom panel listing the selected roads never appeared, though taps on the map still quietly added streets.
Root cause: 1.124's unloadRouteToBoot re-added the `boot` class to <html>, intending to mirror a cold boot. But a cold boot's RESTING picker has no html.boot: the boot tail's arm() removes it when the route menu arms (~1900 ms), precisely because the 1.86 chrome-absence rule — `html.boot body > *:not(#splash):not(#routeMenu):not(#map) { display: none !important }` — force-hides every other body child while it stands. After an active-route delete, nothing removed the class again until a route was picked, so #createBar, #createSheet, #createResults and #createHint (and the 'Route deleted' toast) stayed display:none for the whole session while the excepted map still took taps — the exact reported symptoms. drive154's boot-return check read the menu's own classes and could not see it.
Fix: unloadRouteToBoot now REMOVES html.boot, holding it to its own claim — the state it mirrors is the resting picker, where the class is absent. The route menu keeps its own boot class (its slide-in choreography), which never governed chrome visibility.
Proof: new drive155 (6 checks) — red on 1.125 with the computed evidence (picker reached, prep ready, streets added, yet bar/sheet/results all computed display:none), green here; its phase B pins the sibling path (deleting a NON-active route never broke creation) as a control. Registry: the no-html-boot invariant is probe-pinned (grep_absent) alongside the drive.
Also in this build (test premises, no app change): 1.125's restyle of the manual-search results (.rmBtn boxes → .routeRow rows) had silently expired the city-result selectors in drives 150/151/152/153/154 — 1.125 shipped without a battery at Andrew's order, so nothing caught it; the selectors and text reads now follow the shipped shape, assertions unchanged in meaning. Separately, drive154's E3 (the delete confirm's theme tokens) sampled its "day" values from the ambient theme — the app's automatic theme is sunset-driven, so any battery run after local sunset read night values for the day sample (local + branch CI); both samples are now pinned through the app's own theme-override control. Assertions unchanged.

## Beta 1.125 — 2026-11-06
- Manual city-search results render as the same neat rows as the Select-from-list cities (name line + small dim remainder) — Andrew: the full-address .rmBtn boxes stacked with no gap were bunched and ugly.
- Typing caret pinned visible app-wide (`caret-color: currentColor` on inputs/textareas) — Andrew: every search bar and field must show the flashing line beside the last letter as he types.
- Shipped direct to main at Andrew's explicit order ("push without testing") — visual tier; the nightly battery judges it.

## Beta 1.124 — 2026-11-06
Two changes from Andrew's same-day calls, both approved from a
rendered mockup before build. ROUTES HE CREATED CAN NOW BE DELETED:
each created route's row in Choose a route carries a red-tinted
Delete button (the shipped Route 5W gets none and is refused in
code); the shared confirm pop-up asks with Cancel / Delete, and on
confirm the route's definition is removed from the userpacks record
through a strict read + verified write (a storage failure leaves
the route listed and intact, with a toast naming the problem), then
every key of the route's storage slot is wiped — enumerated from
routeKeys, never hand-listed — and if the deleted route was the one
loaded, the app returns to the boot picker exactly as a cold boot
looks before any pick. THE CREATE GATE OPENS ON TWO DOORS: Create's
first screen is now "Create new route" — Select from list (sub:
"Choose a city that's ready to load instantly") opens its own pane
listing the library cities as rows with their street counts
("4,477 streets · ready to load"), Search manually (sub: "Any other
city or address — loaded from the map service") opens the typed
search as before, and From a photo sits quieter below a divider.
Back links walk pane to pane; both entries (cold start, Routes
menu) share the one surface. After picking a city from the list,
the creation screen still shows the street search bar with its
autocomplete — the pick stage is the same funnel for both paths,
and drive154 proves the search end to end on the list path.
NIGHT TOKENS (Andrew's added requirement): the delete confirm is
the app's existing modal, whose card is the --card token surface —
light in day, dark (#202125 family via body.night) at night — and a
drive assertion pins the confirm's computed background and text
colour to the tokens in BOTH modes. The one modal change is
z-index: it rises above the full-screen menus (10000) so the
confirm can be asked from inside the route list (the toast is the
precedent). Tests: drive153's gate navigation rewired to the new
panes (premise change from Andrew's approved redesign; all pack /
cache / fallback / manual-search assertions kept); new drive154
(doors + subs + quiet photo row, list rows with street counts,
street search after a list pick, both-entries cohesion, delete
Cancel / Delete / active-route / storage-failure, confirm tokens
in both themes). Battery: 45 drives / 736 checks + e2e-offline 31
+ sw.test 27 + Node selftests; registry 383 → 395 probes.

## Beta 1.123 — 2026-11-06
Creating a route is rebuilt around two of Andrew's calls from the road.
THE GATE IS A CHOOSER NOW: 1.121's first create screen asked him to
TYPE a city and pick from suggestions — on his phone the suggestions
never came (below), so Create was a dead end from both entries. The
first screen of Create now reads "Select the city you'll be cleaning
in" and lists the library cities as tappable buttons; a separate
"Search manually" door keeps the typed search for anywhere else. Both
entries (the cold-start picker and the Routes menu) show the same
menu and the same chooser surface — it is implemented once.
THE CITY PACKS ARE THE PRIMARY SOURCE: pre-generated whole-city
street-shape files (Vaughan, Toronto, Markham, Richmond Hill,
Brampton — generated once from OpenStreetMap, validated, incl. an
independent Vaughan name cross-check) are published beside the app
under packs/, catalogued by packs/index.json. Picking one of those
cities downloads its pack from the app's own origin (Vaughan: 878 KB
on the wire) behind the existing preparation seam (crSourceExtract):
the pack answers every grid cell locally, commits through the same
IndexedDB city cache, and settles ready in seconds. Cities without a
pack — and any pack that fails to load — fall back to the 1.121
Overpass grid, with the hint saying so when the library didn't load.
The catalogue is data: publishing a new pack + index entry lights the
city up in the chooser and at the seam with no app change. The
service worker does not intercept packs/*.json at all (network-only);
before this, the generic same-origin netFirst branch would have
shell-cached multi-megabyte JSON and served a stale copy on an error
status, hiding exactly the failure the fallback keys on.
THE TYPED SEARCH DEFECT (why 1.121 dead-ended): the app requests
Nominatim format=jsonv2, whose results carry the place kind in a
field named `category`; crIsPlace read the older format's `class`,
which jsonv2 does not send — so every real result was filtered out
and the list silently emptied. The battery's fixture cities carried
the old field name, so the rig never saw it. Fixed (category, with
class as a fallback), an empty answer now renders a "No city matched"
line instead of nothing, and drive153 stubs the real jsonv2 shape.
Proof: drive153 (new) — chooser from both entries, pack ready with
zero Overpass requests, reload ready from cache with zero downloads,
pack-404 grid fallback with the disclosure in the hint, manual-door
search selectable + honest empty/failure, no-pack city on the grid.

## Beta 1.122 — 2026-11-06
- Heading-up whenever location is on and the camera follows (Beta 1.14 made it run-only) — Andrew, from the road: travel direction always points up, like a car GPS.
- The follow yields on the press itself (canvas pointerdown), not after 10 px of movement — the map is draggable from the first pixel and the re-centre button lights in the same instant. Shipped direct to main at Andrew's explicit order for immediate phone testing; the full battery judges it on the nightly run.

## Beta 1.121 — 2026-11-06
The converged fix from audit round "round-pickfetch" (Codex audit +
debate, Andrew's gate amendment), after 1.120 failed on Andrew's phone
exactly like 1.118/1.119: tap a street, long "Loading…", then "the shape
service didn't answer" — every street, every time.
THE ROOT CAUSE (CG-PF-01): the app's own shape request was malformed.
fetchStreetGeometry built `way["name="Bordeaux Drive"]` — the equals
sign inside the quoted key, the value's opening quote missing — instead
of `way["name"="Bordeaux Drive"]`. Overpass rejected it on every tap
since 1.118. 1.120's patience work treated a symptom; its exhibits used
a hand-written correct query, so they never tested the app's bytes.
Around it: 40 s per-attempt timeouts excluded the measured 40.6/52.7 s
successes and burned ~123 s across retries (CG-PF-02); the attempt
timer was cleared when headers landed, before the body was read, so a
stalled body hung forever (CG-PF-03); async pick completions could
write into a replacement draft (CG-PF-05); and drive150's network
sections passed with zero geometry ever received (CG-PF-06).
THE FIX (Andrew's amendments: city first, then the WHOLE city):
manual creation now STARTS with "What city will you be cleaning in?" —
he picks the city, and its street shapes are prepared as a GRID of
~4 × 4 km cells over the whole city bounding box (bounded parallelism,
each cell committed as it lands, real progress in the hint, a failed
cell retried once then marked — the load settles ready, degraded with
a Retry-missing-parts action, or failed). Committed cells persist
on-device (IndexedDB city cache), so a city loads once and is instant
forever after, with the loaded date shown and a Refresh affordance;
a first load says plainly it can take a few minutes. The original
bounded box (~4 × 4 km + 1 km buffer, anchor: a street-search pick
outside the city, or a one-tap "Prepare this area" — never a silent
download while panning) survives as the session-only FALLBACK for
places with no picked/saved city. Taps resolve LOCALLY from the
merged extract via the existing chainWays stitch + nearest-run rule.
One query builder serves cells, box and top-up alike, behind ONE
source seam (crSourceExtract) that 1.122's pre-generated city packs
can plug into. The fetcher runs under a single deadline per request
spanning connect+body+parse with per-attempt budgets inside it,
consumes the body as a stream with the 2 MB cap enforced while
streaming, treats an HTTP-200 Overpass `remark` as a failed extract,
and re-checks the clock after the parse before committing. A street
whose run reaches beyond verified coverage gets ONE targeted top-up
over a bounded box centred on its open end; still beyond coverage it
stays PENDING (listed, never added).
Every async completion binds to (creation session, coverage
generation); exit and new preparations invalidate older generations.
Honest taxonomy throughout: unreachable / answered-with-error /
ready-but-no-shape / too-dense. The hint carries the preparation state
("Preparing street shapes for <City>… N s") with Cancel / Retry /
Prepare-this-area as a real button. drive150 rebuilt at the fetch seam:
it decodes the app's real POST bodies and grades the query grammar,
replays the measured latency profile, splits headers/body, runs the
failure matrix, proves offline-after-extract adds with zero further
requests, and races cancel/exit/supersede/late-top-up — demonstrated
RED on the 1.120 tree first (grammar, latency and body-stall each
reproduced independently).
THE VERIFY ROUND (Codex, on the branch before merge — six further
findings, all confirmed first-hand and fixed in the same cycle):
the top-up kept a 40 s primary cap that reproduced the latency failure
on the exception path — its budgets now follow the same measured
profile (60 s of 90 s) (CG-PF-07); the completeness check's
"junction proof" was unsound — a cross street touching a run's
out-of-area endpoint certified nothing about a same-name continuation
— and is removed: an endpoint is closed only inside the fetched
boundary (CG-PF-08); three preparation remedies were wording without
working actions (a tap outside ready coverage, a pending street's
wider preparation, the too-dense retry) — each is now a real button
that prepares exactly where it points (CG-PF-09); Cancel and exit
discarded results but never stopped the download — they now abort
the fetch itself (CG-PF-10); the remembered-city one-tap lookup raced
competing picks unguarded — it now binds to its generation and is
aborted by any competing pick, Back or exit (CG-PF-11); and drive151
joins the battery for the native-transport half (real browser network
interception, the page's fetch untouched) (CG-PF-12).
THE BATTERY THEN FOUND FOUR MORE in the new machinery, each fixed
before this build shipped: the city cache opened a fresh IndexedDB
connection per call and never closed it — leaked connections block a
cache wipe forever and queue later reads behind it (every operation
now closes its connection); Cancel's generation bump orphaned the
city grid itself, so Resume fetched nothing (resuming now adopts the
grid into the live generation, and a stopped cell's late answer lands
nowhere even after a resume); a pending street's "prepare wider area"
anchor was computed against the wrong coverage — first an end the
city already covered (nothing new to fetch, the street pended
forever), then an end inside the top-up's name-only box (no anchor at
all) — it now names the first end no committed coverage holds; and
the hint labelled a fallback-box wait with the city grid's stale part
counts — the in-flight operation now owns the hint text.

## Beta 1.120 — 2026-11-06
Round 2 of create-a-route fixes, all from Andrew's real phone use of
1.119.
(1) THE TAP WEDGE. Tapping a street said "Loading", then nothing, and
the picker never accepted another tap. Two layers: pickStreet's early
return on a failed shape fetch skipped the line that released its busy
flag, so ONE refused fetch latched the picker shut for the whole
session; and the fetch itself had no patience — the public Overpass
instance (overpass-api.de) commonly answers slowly or 429/504, and any
non-OK answer was an instant silent null. Now the busy flag resets in
a `finally` (every exit path), the hint line carries "Loading
<street>…" for the whole wait, the query tries the primary instance,
pauses, tries again, then asks the fallback instance
(overpass.kumi.systems — added to the stamped CSP's connect-src, with
the build gate and the CSP selftest rolled forward to all three
creation hosts), and the failure word is honest: the service not
answering and the service holding no line for the name say different
things.
(2) SEARCH AS YOU TYPE (Andrew's ask, superseding the 1.118
button-only design): suggestions while typing — a 500 ms debounce
makes a keystroke burst one query (3+ characters), a sequence token
plus AbortController keeps a slow earlier answer from overwriting
newer results, results are biased toward the visible map (viewbox,
bounded=0), and Search / Enter still run the typed query immediately.
(3) DAY/NIGHT: the create surfaces (search bar, results dropdown, the
"Your route" sheet and its rows/chips) wear the app's own theme tokens
(--card-solid / --ink / --ink-dim / --hair / --chip) — in 1.118/1.119
they were hardcoded white and stayed bright at night.
(4) DROPDOWN + BAR POSITION: tapping anywhere outside the results
dropdown dismisses it (map taps included; the pick still runs), the ✕
beside the search clears the text and results before it exits, and
the whole search row sits lower by half its own height — the row's
height is fixed at 50px and the 25px shift (--cr-shift) is added to
the resting tops of the bar, the dropdown and the hint.
(5) CREATION BACKDROP: entering create mode with a route loaded no
longer leaves that route's painted streets and selection covering the
map he picks from. While `creating`, the engine's route paint and
street-name layers hide, and a point of interest for EVERY pack in the
database (white ring, raspberry dot, the route's name — the map's own
zoomed-out treatment, at each pack's centre) gives orientation with
zero clutter; exiting restores the recorded layer visibilities
exactly. drive150 gains sections for the wedge + fallback, the
as-you-type search (debounce count, stale-answer guard), the backdrop,
the theming, the bar position and the dropdown dismissal.

## Beta 1.119 — 2026-11-06
Two defects in the 1.118 create-a-route flow, both caught by Andrew on
his phone within minutes of trying it, both fixed here.
(1) THE APP'S OWN CSP BLOCKED THE CREATE FLOW'S NETWORK CALLS. The
stamped Content-Security-Policy's connect-src named only 'self' and the
map/style hosts; the create flow's two service calls — Nominatim street
search and the Overpass API street geometry — were refused by the policy
before they left the phone, and the flow's catch reported "needs an
internet connection" on an online phone. connect-src now also names
https://nominatim.openstreetmap.org and https://overpass-api.de (the
only third-party calls the app itself makes — a fetch census of every
call site in the app confirms no other origin is needed). The seam that
let this ship is closed three ways: build-pages.py --check asserts both
hosts inside connect-src (a policy edit that drops them fails the
build); tests/browser/selftest-csp-connect-src.mjs re-proves it against
the built page in CI; drive150's new section (e) boots the page under
its REAL stamped policy with fetch unstubbed and fires the app's actual
search and geometry calls, asserting no policy refusal names either
host (1.118's drive150 stubbed fetch in-page, so no real request ever
met the policy — the interception form of the same proof was exercised
in a standalone CDP rig: on the 1.118 policy neither request ever
reached interception and both violation events fired; on 1.119 both
pause, are fulfilled with the fixture payloads, and complete).
(2) TAPPING A ROAD NEVER IDENTIFIED IT. crMapTap asked
queryRenderedFeatures for the tap's single pixel; rendered road lines
are a few pixels wide, so a fingertip tap almost never landed on the
line's pixels and every tap toasted "No road there". The tap now
queries a small box around the point (±16 px — a finger's real
tolerance — retrying once at ±28 px), and when the box names several
streets the one whose tile line passes closest to the tap wins. Tile
geometry is used ONLY to choose among candidates — never stored; the
stored shape still comes from Overpass (the approved reconciliation).
drive150's new section (a2) proves it: a point query returns no road, a
box query returns two named roads (the farther listed first), and the
nearer street is the one picked.

## Beta 1.118 — 2026-11-05
Step 2 of the route programme (Andrew's direction, mockups approved
2026-11-05): THE HYBRID CREATE-A-ROUTE FLOW. The Routes menu's "Create new
route" now opens two doors, and both land in one shared checking screen.
(1) FROM A PHOTO: pick a photo of the route map and the app holds it in an
honest waiting state ("Photo received — your draft is being built…") with
a Share button where the platform offers one. Reading the photo is
Muse's job, OUTSIDE the app by design (a web app cannot read street names
off a photo): the draft comes back as a pack-format JSON file and "Import
my draft" loads it into the preview after full validation — fail closed,
named errors, nothing half-applied, the same discipline as a backup
restore. A bare roads object (the route-creation sandbox's candidate
shape) is accepted as a roads-only draft.
(2) SELECT STREETS MYSELF: a search bar queries Nominatim (street/address
search only — intersections are known not to resolve; one user-initiated
query per tap, no autocomplete), a result flies the map there, and tapping
a road on the map picks the street's IDENTITY from the basemap's roads
layer — never its geometry (display tiles re-segment streets and misplace
joins, proven in the sandbox). The street's true shape is fetched at tap
time from the Overpass API and stitched with the sandbox's rules (greedy
endpoint chaining at 1.5 m; a divided road chains into its hairpin; the
run nearest the tap is the street tapped). Streets join as SECONDARIES by
default and light up on the map in route colours (gold main / raspberry
secondary); the bottom sheet keeps the running count and the picked list
with MAIN/2ND flip chips and per-street remove.
(3) SHARED PREVIEW — "Is this correct?": the draft drawn on the map in
route colours with every street's length; flip main/secondary, remove a
street, or "+ Add a street" (the same picker, returning to the preview).
"Start over" discards behind a confirm; leaving mid-draft asks first.
(4) NAME IT (its own step): name + area (pre-filled with the next
"Route N" guess / the searched area / the last-used area), a read-only
summary, Save.
PERSISTENCE: created packs live on-device in a new global record
(snowroute.v2.userpacks = {id: pack}); at boot the runtime pack list is
shipped packs + created packs (a created pack wins an id collision;
created ids are slugs generated from the name, uniqueness-checked against
both lists). Backups (normal AND recovery) now carry the definitions:
restore validates them like everything else, registers them in the same
verified write set (rollback scope included) BEFORE any route state is
applied, and rejects an id that collides with a shipped pack; older
backups without the field restore exactly as before. The offline manifest
(F5 union) includes created packs once known; a freshly saved route gets
an honest preload record (none of its area downloaded yet) and the save
toast points at Settings → Status → Download.
DRAFT SAFETY: a draft is session state only — it renders through its own
GeoJSON overlay computed from the draft's own roads and NEVER touches the
active route's geometry, engine sources or storage (drive150 proves the
5W slot byte-identical across a full create-mark-discard cycle, and the
marking tap is disabled while creating).
Proof: new drive150 (deterministic network fixtures from the sandbox's
real Vaughan OSM extract — Nominatim and Overpass stubbed in-page, no
live network) covers the manual door end-to-end, preview corrections,
the photo door + fail-closed malformed import, and persistence across
reload and backup-wipe-restore.

## Beta 1.117 — 2026-11-05
Step 1 of the route programme (Andrew's direction): COMPLETE APP/ROUTE
SEPARATION. The app is now route-agnostic and Route 5W is one pack among
any — the segregation audit's fix list F1–F8, implemented:
(1) F1: no route is baked in. All geometry that was computed at script
eval from 5W (STRETCH/STREETNAMES/STREETSET, MAIN/SPOT, SAMPLES,
routeBox/ROUTE_TILE_NAMES, the paint engine's GEO/labels/POI/hit) is now
rebuilt per load from the active pack via buildGeometry(pack); the
engine rebuilds through GLP.rebuildRoute. At boot, before a pick, no
street geometry exists. data.js holds packs only (metadata + geometry);
5W's coordinates are byte-for-byte unchanged — only the wrapper moved.
(2) Switching works: Routes tab → pick another route and the app loads
it live. Switch semantics = a cold boot on the target route, plus a
pre-flush a reboot only gets via pagehide: the outgoing route's pending
writes are flushed to its own slot first (F2), session state is reset in
one block (F3: the in-memory cancel snapshot is cleared — the persisted
one survives, so Cancel after switching back works exactly as after a
reload; F4: selection, note editor, history panel, modal note,
suggested set, dirty flags), and a run in progress on the route you
leave is NOT ended — it persists in its slot and resumes when you pick
that route again. GPS is device state (F8), untouched by a switch.
(3) F5 (minimal honest form): the offline preload manifest is the union
over every known pack (per-pack area + z15 core); with only 5W shipped
it is byte-identical to the frozen 897-file contract (fingerprint
unchanged). Preload records are per-route and now carry the route's own
tile-subset counts alongside the pack totals; Delete maps clears every
route's record. PACKMIG stays a global certificate of the one shared
pack cache — documented as such, not a per-route flag.
(4) F6: backup/restore judge every route by its OWN geometry —
snapshot validation, the unknown-name count, the legacy done-map
filter and the derived-sides path all go through packGeometry(pack);
a done-only entry for route B restored while route A is open now
derives B's sides from B's streets. F7: unknown-route backups still
fail closed; the vestigial flip/prep keys are documented, unchanged.
Proof: drive149 (boot with no geometry; 5W work → switch → fixture
work → switch back with the 5W storage slot byte-identical; empty-pack
load; restore-under-B derivation; preload union growth).

## Beta 1.116 — 2026-11-05
Audit round 115 fixes: the Beta 1.115 GPS follow, hardened at its edges
(Codex audit → adjudication → Andrew's scope gate; all five findings were
reproduced before they counted).
(1) CG-115-01: the >45 s stale-watch restart no longer clears a follow
suspension — startGps gained a restart flag the automatic restart passes,
so a signal dead zone cannot silently hand the camera back; an explicit
user start still begins un-suspended. (2) CG-115-02: the first fix no
longer overrides a drag made while waiting for it — when a suspension is
already armed, the firstFix branch records the position and lights the
re-centre button instead of jumpTo-ing and clearing. (3) CG-115-04, as
amended by Andrew at the gate (his design call, replacing the auditors'
tab-face proposal): the Locate tab is completely untouched; the top-right
centre button's icon becomes the standard GPS re-centre glyph — the
target/crosshair (ring, centre dot, four ticks) other map apps use —
drawn in the pack's filled icon language. Its show/hide rule, placement,
size and tap behaviour are unchanged. (4) CG-115-05 (tests): drive148's
suspended-camera drift tolerance tightened 25 m → <2 m with a mid-window
sample (the shipped behaviour measured 0.0 m — the guard was looser than
its own claim), plus the two branch checks the audit found missing: a
wheel gesture suspends the follow, and Locate tapped while FOLLOWING
stops GPS. (5) CG-115-03: the suspension pointer seam tracks the
initiating pointerId — only the pointer that pressed the canvas can
suspend, and only its own moves count; a second pointerdown while a
press is armed is ignored (the multi-touch policy is stated in the code).

## Beta 1.115 — 2026-11-05
Two GPS fixes from Andrew's drive test. (1) The follow camera no longer
locks the map: while location is on and following, dragging the map now
suspends the follow — the dot keeps updating, the camera (pan and bearing)
stays where he put it — and a re-centre button appears at top-right,
directly below the day/night button (same 56 px dock button); tapping it,
or tapping the Locate tab while suspended, eases the camera back to the
dot and resumes the follow. Root cause: followCam's per-frame panBy kept
resetting MapLibre's drag-pan handler mid-gesture, so dragstart almost
never fired and the drag-pause never engaged; suspension now also listens
to the raw pointer stream (>10 px of movement), and the mid-run dragend
no longer hauls the bearing back to north. Heading-up during a run yields
while suspended and re-engages on re-centre. (2) GPS motion is smooth:
the displayed position (dot, accuracy ring, facing beam origin, follow
camera target) now coasts on the Kalman estimator's predicted track every
frame, with each fix's correction absorbed into a decaying offset — no
more move-stop-move at the 1 Hz fix cadence (measured before: the dot sat
still up to 950 ms of every second). Smoothing is display-only: trail
recording, coverage and pace keep consuming the raw accepted fixes, and a
reacquisition (>75 m jump or >10 s silence) still snaps. Regression:
drive148 (new), drives 126/127/129 unchanged and green.

## Beta 1.114 — 2026-11-05
What's New in Settings → About now shows ONLY the latest release's
notes (Andrew's call — the accumulated per-version list cluttered the
pane). The in-app WHATSNEW entry is REPLACED by each release rather
than accumulated from here on; older releases' notes live here in the
changelog, not in the app. No behaviour change beyond the About pane.

## Beta 1.113 — 2026-11-05
Audit round 112 (Codex audit, all five findings approved by Andrew):
the honesty fixes. (1) A street note whose save failed during a
same-street list rebuild could announce "Saved ✓" — the rebuild's
flush tested the truthiness of the 1.101 storage-outcome object
({ok:false} is truthy); it now reads .ok, and a failed flush shows
"Not saved — storage problem". (2) Delete maps announced success
even when the cache delete failed; it now verifies the pack is gone
(delete resolved true, or verifiably absent) before clearing the
completion flag and preload record or toasting success, and reports
the failure honestly otherwise. (3) Dismissing the backup nudge
replaced the whole export record and erased the 1.111 last-backup
stamp; both nudge handlers now merge nudgedAt into the record.
(4) The vibration / chime / chime-sound handlers ignored a failed
settings write — the switch rendered ON and silently reverted on
reload; a failed save now restores the previous value and switch
and warns. (5) Turning screen-awake off (or finishing a run) while
a wake-lock request was still in flight left the late-arriving lock
held with the switch OFF; syncWake now recomputes eligibility after
the request resolves and releases an unwanted lock on arrival.
Regression gate: tests/browser/selftest-round112.mjs (verbatim
extractions, red on 1.112 / green here) wired into CI.

## Beta 1.112 — 2026-11-05
Keep screen awake (the On the job toggle) is now session-only
(Andrew's call): every cold open starts with it OFF, however it was
left, so it can never quietly stay armed between app sessions. The
toggle works within a session exactly as before. It is no longer
written into the stored settings record at all — the record now
holds only the persistent three {vib, chime, chimeSound} — and a
Beta 1.111 record still carrying an awake field is simply never read
for it. Vibration, the chime on/off and the chime sound pick are
unchanged and stay persistent.

## Beta 1.111 — 2026-11-05
Settings is rebuilt (Andrew's mockup-approved design): the main pane is
four rows - Status, On the job, Backup, About / What's new - and the
Backup row carries a small second line ("Last backup: ...") read from a
stamp now written into the existing export record at every successful
backup hand-off (a cancelled share stamps nothing). New panes: Status
(the offline-maps download MOVED here from the Backup pane - same
machinery, progress bar and stat line - plus a Delete maps action and a
health block whose four rows are computed live at pane open: a storage
write/read-back probe, the maps state, the update-check state, the GPS
state), On the job (Keep screen awake - the existing wake lock, now
gated on the toggle; Vibration when marking; the Done chime nav row),
Done chime (five WebAudio-synthesized sounds - no files; tap a row to
preview and select; the sound fires when a street becomes complete and
twice at a confirmed Finish, Chime Melody once), and About (the app
line, map credits, a curated What's new list whose header reads the
live version, and the Update button, MOVED here from the main pane with
both of its handlers). The Backup pane keeps only Backup (JSON) /
Restore backup. One new global key, snowroute.v2.settings, holds the
toggles ({awake, vib, chime, chimeSound}); every toggle defaults OFF
and the chime sound defaults to Two-Tone. The completion feedback hook
is the marking funnel itself: applyPiece's completion branch and
markDone, the only two places a street flips to complete.

## Beta 1.110 — 2026-11-05
The post-Finish Undo is removed (Andrew's call): Finish already asks for
confirmation in the Yes/No pop-up, and that confirmation is now the whole
gate - pressing Yes archives the clean and clears the board, and the button
returns to its normal state with no 8-second Undo window after it. doUndo,
the undo snapshot, the undo-invalidation helper and the .undoing button
state are gone. The finish transaction and its rollback messages, Cancel
Start and its snapshots, and the interrupted-finish reconciliation are
unchanged.

## Beta 1.109 — 2026-11-05
The Streets sheet filter changes from All / To do / Done to the route's two
groups (Andrew's mockup pick, 2026-11-05: the V2 two-chip layout with V1's
completed pill): exactly two chips, Mains and Secondaries, and the list
shows only the selected group - the 6 gold main roads or the 28 raspberry
secondary streets. Mains is the opening view. A fully completed street's
row now also wears a small COMPLETED pill after its name (soft mint pill,
from the V1 mockup), on top of the existing mint dot and green name tint;
a street with only one side done is not completed and gets no pill.
Everything else about the rows is unchanged: the pin button, the quiet
line (length, or the note preview while a note exists) and the done-time
stamp.

## Beta 1.108 — 2026-11-05
Repo hygiene release (Andrew approved the full cleanup plan, 2026-11-05):
the 12 iOS launch stills move from the repo root into assets/launch/ (the
startup-image references in the page head point at the new folder; the
images themselves are byte-identical), docs/AUDIT-REMEDIATION-REPORT.md
moves into docs/archive/ beside the v5-era archive, and .gitignore now
covers the local service-worker test fixture directory. No behaviour
change: same splash images, same app, new shelf locations.

## Beta 1.107 — 2026-11-05
Each Streets-list row now shows the street's length on the quiet second line
under its name (Andrew's pick of the investigated options, 2026-11-05). The
value is the app's own live per-street centreline length (STRETCH total),
formatted as whole metres with a thousands separator ("48 m", "1,686 m"),
read at render time - nothing hardcoded. Precedence: a street note preview
wins the slot while a note exists (notes are working information, the length
is reference); clearing the note brings the length back. Row structure, the
done stamp and the pin button are unchanged, and the note editor's open/
close behaviour (build 106) is untouched.

## Beta 1.106 — 2026-11-05
Closing the Streets sheet now resets an open inline note editor: reopening
the sheet shows plain street rows instead of the editor still open on the
street last edited (Andrew, 2026-11-05). The reset rides both close funnels
(closeSheetEl and the drag/flick settleClose landing) via a new
collapseNoteEditor() in app2.js; a still-pending debounced note save is
finalized by renderStreets' existing draft flush before the editor is torn
down, so no typed text is lost. Note storage, the 400 ms auto-save and the
editor's appearance while open are unchanged.

## Beta 1.105 — 2026-11-05
Pressed feedback for route rows in the blue route menu: tapping a route in
the Choose-a-route list now lights up exactly like the menu's own buttons
(.rmBtn). One CSS rule added (#routeMenu .routeRow:active, same .28 white
wash); no behaviour, layout or JS changes. Reported by Andrew 2026-11-05:
the Choose / Create buttons lit up when pressed but a route row did not,
because .routeRow never had an :active rule.

## Beta 1.104 — 2026-11-04
Codex audit round 103 fixes (both P1, both in the finish/archive path).
(1) CG-103-02: the interrupted-Finish recovery added in 1.102 matched an
archive to its run by startedAt, but startedAt is the real work start - a
street marked before Start was pressed made it earlier than the stored
start, so the recovery missed the run entirely and a second Finish
archived a duplicate. Archive entries written by Finish now carry a
dedicated run identity (runId, the active run's start) and the recovery
matches on that, strictly; startedAt itself is unchanged (distances and
the saved path still measure from the real work start). Entries written
before this build carry no identity and are never reconciled.
(2) CG-103-01: with ten full cleans in history, finishing a new partial
clean evicted the archive it had just written - it was the only non-full
entry the trim could find - while announcing "Clean archived." The
finish trim now chooses evictions only among the pre-existing entries;
the incoming archive is always kept. No storage keys or formats changed;
the history loader already preserved the extra entry field.

## Beta 1.103 — 2026-11-04
Architecture Phase 6 (candidate C5, the engine adapter): the paint engine
(parts/engine.js) no longer reads app globals freely. Every app value,
helper, callback and piece of live state it consumes - the frozen census
list of 15 names (172 reads, zero writes) - arrives through one host
object (GL_HOST, built in app1.js, aliased as H inside the engine and
passed to GLP.init(map, host)); live state (pieces, selSet, selStretch,
activeRoute) is exposed through getters so an app rebind is seen on the
next read, exactly as a free-global read behaved. No paint behaviour
changes: same layers, label math, colours and sync semantics; storage,
formats and messages untouched. Guarded by
tests/browser/selftest-engine-surface.mjs in CI.

## Beta 1.102 — 2026-11-04
Architecture Phase 4 (transaction coordinator, from the 2026-11-04 architecture scan): Finish, Undo and Restore now run their multi-step saves through ONE standard routine — each step is written and read back to prove it landed, and a failure undoes the earlier steps in reverse order. Before, that careful dance was hand-built separately in each place, slightly differently each time. Also new: if the app is killed in the middle of a Finish (phone dies, app swiped away), the next launch now recognises the half-finished state and quietly puts it right — either removing the duplicate archive entry so the run resumes, or completing the finish — using only what is already stored. No data formats, messages or behaviour otherwise changed.

## Beta 1.101 — 2026-11-04
Architecture Phase 3 (storage outcomes contract, from the 2026-11-04 architecture scan): every save now reports back in one standard shape — did it land, which record failed first, and whether a retry is armed — instead of each save inventing its own answer. The storage layer owns saving, checking and retrying, and no longer talks to the user directly: the warning message moved to the app side, word-for-word unchanged. The retry flags (trail, session markers, snapshot, start, coverage, main records) are now reached through one doorway in the storage code. No data, keys, formats, save order or messages changed. This build also syncs the test battery to the FINISH capitals from 1.100 (several checks still compared the old title-case word).

## Beta 1.100 — 2026-11-04
Start and Finish are the same button in every way but the word (Andrew). The Start circle went splash-blue with white text in 1.75, but Finish kept the superseded 1.23 treatment (black, volt-yellow text, 19 px instead of 21 px) — the swap changed the whole look. #startBtn and #resetBtn now share one CSS rule, so the two states can never drift apart again. The button's word is now FINISH in capitals, matching START (it was title-case before). The Undo state keeps its green (a different signal, unchanged).

## Beta 1.99 — 2026-11-04
Internal refactor only — no behaviour change (architecture scan Phase 2, candidate C1). The trail segment-acceptance rule (break on a gap over 300 s, a jump over 1000 m, or a recorded session start between two points) existed as three hand-kept copies in trailKm, drawTrail and buildGpx; it now lives in one shared pure function, trailSegments (app1), and all three call it — buildGpx's session-marker pointer walk moved verbatim. Parity is fixture-proven, not asserted: tests/browser/selftest-trail-segments.mjs extracts the shipped functions and checks them against golden outputs captured from the 1.98 implementations (GPX strings byte-equal, distances exactly equal), runs in CI before the browser battery, and fails on a one-second change to the gap constant. drive143's X8 measuring oracle stays independent, as designed.

## Beta 1.98 — 2026-11-04
- Dragging the Streets or Pace sheet no longer turns it see-through: while a drag drops the frosted blur (the 1.79 anti-stutter measure), the sheet now wears the solid card colour (new --card-solid, both themes) instead of the near-opaque glass colour.

## Beta 1.97 — 2026-11-04

The audit-loop round-196 fixes (Codex audit of Beta 1.96, adjudicated and debated to convergence, gate approved by Andrew):

- **Backups assert idle explicitly (CG-196-01).** Every route entry in a backup now carries its start state: a run's timestamp, or `start: null` for no run. Restoring an idle backup onto a device with an active run clears that run's start and cancel snapshot inside the verified write set (rolled back like any other field if the restore fails) — an idle backup can no longer inherit another run's Start, whose snapshot would later erase restored marks. Older backups, which omit the field, keep the missing-key rule.
- **Normal backups carry the cancel snapshot (CG-196-02).** A backup made mid-run now includes the run's validated start snapshot (the construction 1.96's recovery backup introduced, now shared), so a restored run's Cancel restores the Start-moment board exactly instead of falling back to the mark-stamp journal, which cannot see a side unmarked during the run.
- **Every board mutation kills a pending Finish Undo (CG-196-03).** One `invalidateFinishUndo()` helper now serves all mutation paths — side chips and group chips (via `applyPiece`), mark-all, whole-street mark/unmark, an effective Clear, and starting a new run. Before, only whole-street marking invalidated, so a mark made in the 8-second Undo window was silently discarded by an Undo tap.
- **Marking toasts are gated on the save (CG-196-05).** The completion/unmark toasts on all marking paths now show only when the save landed. On failure the storage warning stands, and a later failure in the same warning episode still says "Not saved — storage problem" instead of going silent.
- Finding CG-196-04 (Finish's gated writes vs process death between them) is recorded as a design input to the architecture program's Phase 4 transaction coordinator; no patch, by adjudication.

## Beta 1.96 — 2026-11-04

The Beta 1.95 audit round — BOTH deep audits (the SR-195 series and the independent F-status/N-findings review), consolidated scope as approved. Finding SR-195-10 (per-route street registries) stays with the future multi-route project, untouched here.

- **SR-195-01 — Cancel's closing message is composed, not chained.** With a damaged snapshot AND a trail cleanup that could not be saved, 1.95 showed the damage message and masked the storage warning. The warning now leads whenever it applies, with the rebuild explanation attached; each single-failure message keeps its exact wording.
- **SR-195-02 — The recovery backup carries the run's cancel snapshot** (the include remedy). Restoring a recovery file restores the snapshot with its run — validated against the backup's own start stamp, written in normalized form inside the restore transaction (rollback covers it) — so Cancel after a restore is exact again. A carried snapshot that fails validation is dropped and the result message says so.
- **SR-195-03/07 — Pack migration has a fast path and an honest status.** The completion flag is now a fingerprint of the manifest and is read on boot: fingerprint + exact pack census skips the ~1,800-match verification sweep; any doubt runs the full pass, which also heals a shrunken pack. A complete download earns the same fingerprint. Prune and flag-write failures are reported in the migration status instead of swallowed.
- **SR-195-04 — Snapshot validation checks time VALUES.** A completion time or piece stamp that is not a parseable date rejects the snapshot — the loader's own rule, now applied by the validator too.
- **SR-195-05 — Unknown-name counting covers object-form notes** (the one notes shape the counter missed).
- **SR-195-06 — Undo and Cancel say when a run has no snapshot.** An undo that restores a run without one, and a journal-fallback cancel with none saved, both name the reduced guarantee instead of restoring in silence.
- **SR-195-08 — Style generation is reproducible from the repo.** CARTO's dark-matter style is vendored (`scripts/carto-dark-matter-style.json`, hash stamped into the banner); the banner carries no date. Regeneration from the vendored inputs reproduces the shipped styles byte-for-byte; `--refresh-carto` is the deliberate refresh.
- **SR-195-09 — Browser startup is retried in the test harnesses.** A launch that never prints its DevTools line (or a browser that exits first) retries up to 3 attempts with diagnostics; three failures still fail the drive. The cold-runner first-launch failure that killed a shard of the first scheduled run, twice, is the target.
- **Audit-2 N-1 — Download cleanup deletes only confirmed copies.** A file whose pack write failed keeps its browsing copy; 1.95 deleted it anyway and lost both.
- **Audit-2 N-2 — Re-download actually refreshes.** Downloads fetch in `reload` mode and the worker bypasses both caches for them; before, a re-download re-stored the pack's own responses.
- **Audit-2 N-3 — README route wording corrected.** It described per-route packs as a present capability; it now separates the design from what ships (one pack, no in-app switching yet).
- **Audit-2 N-5b — Recovery wording is precise.** The share text now says the open route is the live state while any other route in the file is included as last saved.
- **Audit F-08 — CI actions pinned by commit SHA** (tags kept as comments), and **F-11 recorded as a decision**: the worker's prompt takeover (`skipWaiting` + `clients.claim`) is deliberate — it never reloads a page, and state is version-tolerant; see ARCHITECTURE.md.
- **One Backup button (Andrew's design, added to this round at his direction).** The separate "Recovery backup" menu option is gone. When the normal backup cannot be built because saving failed, the Backup press falls back AUTOMATICALLY to the recovery export — and says so loudly: the file is recovery-marked, recovery-named, and its message opens "Backup could not be saved — recovery backup shared/downloaded instead". A cancelled share sheet never triggers the fallback (it fires on the build failure only). The storage-failure warnings now point at "a backup" — the one button covers both.

## Beta 1.95 — 2026-11-04

The Beta 1.94 deep-audit round (SR-194 series), full scope as approved: every confirmed defect plus the recovery export. Findings 09 (release engineering) and 10 (route switching) stay separate decisions, untouched here.

- **SR-194-01 — Finish → Undo → Cancel restores exactly again.** The finish captures the run's cancel snapshot into the undo (from memory, or from its persisted copy validated as below); the undo re-persists it as a verified gate before the run resumes — a failed snapshot write stops the undo with all gated writes rolled back and the undo still on offer.
- **SR-194-03 — Persisted snapshots are validated, never applied raw.** A strict validator (the loader's own structural rules) must pass the whole snapshot before a single field is applied; a damaged snapshot falls back to the mark-stamp journal and the cancel message says the board was rebuilt, not restored.
- **SR-194-02 — Recovery backup.** A second, clearly labelled export in Settings → Backup serializes the live in-memory state (marked as a recovery file, restorable through the normal path) for exactly the moments the normal Backup refuses by design — storage failure. The failure warnings now point at it.
- **SR-194-04 — Resume honesty.** Start still never blocks; a run resumed without a usable cancel snapshot now says so at load.
- **SR-194-05/06 — Pack migration, verified and manifest-bounded.** The one-time offline-pack migration is a named function: it copies only the deterministic preload manifest (now a single shared list builder), prunes the pack to exactly that manifest, and sets its completion flag only after verifying the destination — a failed copy retries next boot instead of being marked done.
- **SR-194-07 — Test harness strictness.** A page-side evaluation error now fails the drive instead of returning a truthy object that `!!cond` read as a pass; checks record literal `true` only; runner selftests pin both.
- **SR-194-08 — Unknown-name counting reads the raw backup.** Restore reports unique unknown street names counted before normalization — object-form done maps and array-form history items included.
- **SR-194-11 — Basemap generation pinned.** The style generator's dependency is pinned with a lockfile, and the generated banner records the toolchain and upstream style version.

## Beta 1.94 — 2026-11-04

The double deep-audit round: two independent audits of Beta 1.93, every
finding adjudicated against the live code, each real one fixed at its
source. No new features — the recovery cases come first.

- **A backup can no longer ship a stale board (SR-193-01).** If the
  primary save had failed, the export read the older stored board and
  handed over a valid-looking backup missing the newest marks. When a
  save has failed, the export now attempts that save again first and
  is refused outright if it still cannot land; when no save has
  failed, the export reads storage as before and writes nothing.
- **Cancel after a reload restores the exact pre-Start board
  (SR-193-02).** Start now persists its snapshot. A resumed run's cancel
  restores from it — including a pre-Start side that was unmarked mid-run,
  which the 1.93 timestamp journal could not see (unmarking erases the
  stamp). The journal remains as the fallback when no snapshot exists.
- **The storage migration can never overwrite newer data (SR-193-03).**
  Completion is now an explicit marker key, written only after every
  legacy field is verified present in the slot. A retry fills only the
  fields the slot lacks — the old parity gate could recopy legacy data
  over a newer restored record.
- **Undo gates the run's start time (SR-193-04).** Undoing a finish now
  writes the restored start time as a gated step before the undo snapshot
  is consumed; a failed write stops the undo with everything rolled back
  and the undo still on offer.
- **Failed saves retry on their own (SR-193-05).** Any failed primary
  save arms a retry flag that the periodic flush acts on, instead of
  waiting for the next incidental save.
- **An empty test run now fails (SR-193-06).** The browser test runner
  treated a drive that collected zero checks as a pass; it now fails the
  run and names the empty drive.
- **The street count is derived, never restated (F-01).** Every place
  that named the route's street total now reads it from the route pack
  itself, so a future pack cannot inherit a stale number.
- **Downloaded offline maps get their own cache (F-03).** The preload
  pack now lives in a dedicated cache the map's rolling tile cache can
  never evict; an existing download is carried over automatically on
  first boot after the update.
- **Route names are rendered as text, never markup (F-04).** The route
  menu rows are built as DOM nodes with text content, closing an
  injection path for a future route pack with markup in its name.
- **Unknown streets in a backup are counted and reported (F-05).** A
  restore now tells you how many street names in the backup matched
  nothing in the route, instead of dropping them silently.
- **The app source lives in the repo (F-02).** The page is assembled
  from `parts/` by `scripts/assemble.py`; the assembled file is
  generated, never hand-edited, and the build proves the two agree.
- Housekeeping (F-08): the CI workflow now declares read-only
  permissions.

## Beta 1.93 — 2026-11-03

The follow-up audit round: seven residual findings from the independent
Beta 1.92 audit, each reproduced first, then fixed at its source.

- **Cancel after a reload no longer erases pre-Start progress (R01).** The
  pre-Start snapshot lives only in memory, so a cancelled resumed run fell
  back to wiping the whole board. It now reverts only the sides marked at
  or after Start — the mark timestamps are the run's journal — and keeps
  everything older.
- **Live pace counts only this run's work (R06).** The rate's numerator was
  the whole board over the run's clock, so streets marked before Start
  inflated it. It now counts sides stamped during the run; the remaining-
  work side of the ETA is unchanged.
- **A backup is refused when its data cannot be flushed (R02).** If the
  pre-export flush of trail/coverage fails, the export now fails openly
  instead of shipping a valid-looking backup with stale data inside.
- **Cancel's message matches what was saved (R07).** If the trail cleanup
  could not be written, the message says exactly that (and the retry stays
  armed) instead of claiming the run was fully erased.
- **Finish cannot leave a stale start behind (R05).** Clearing the run's
  start time is now a gated step inside Finish itself: if the delete
  cannot land, the finish stops with the run intact, replacing the retry
  window where an app death could resurrect a finished run.
- **An empty completion list restores as empty (R03).** A backup whose
  completion list is explicitly empty now derives an empty side record
  too, instead of leaving the phone's old marks in charge.
- **Migration completeness is verified, not assumed (R04).** A route slot
  counts as migrated only when every field the legacy data holds is
  present in it; a partial copy is re-copied, never adopted.
- Test gap closed (V02): the offline download now has a stalled-file
  check — one file that never answers is abandoned by the 30-second
  timeout and the download still completes honestly.

## Beta 1.92 — 2026-11-03

The deep-audit fix round: all seven code findings of the external Beta 1.90
deep audit, each fixed at its source and covered by a fault-injection check.

- **Boot crash on a damaged theme override (F01).** A stored day/night
  override whose expiry value was missing, corrupt, or infinite could abort
  the whole startup: the sunrise fallback probed two values that do not exist
  yet at that point in the boot, and JavaScript throws on the probe itself.
  The probes are now guarded so the fallback is reachable, a non-finite
  expiry recomputes the next sun boundary instead of sticking or crashing,
  and Backup/Restore now rejects a non-numeric expiry instead of accepting
  any text.
- **Backups taken on the storage fallback were silently empty (F02).** When
  the one-time storage migration fails, the app runs on the legacy keys —
  but the backup read the fresh (just-wiped) slot and emitted a valid-looking
  backup with nothing in it. A backup now exports from the key mapping the
  app is actually running on.
- **Migration cleanup verified (F08).** The failed-copy cleanup wipes the
  side-marks record first and re-checks it, so a partial slot can never be
  mistaken for a completed migration on the next boot.
- **Backup/restore messages visible again (F03).** Feedback messages now
  stack above the full-screen Settings screen; errors raised from inside
  Backup/Restore were previously hidden behind its opaque blue.
- **Backups no longer lag the GPS trail (F04).** Exporting flushes the
  buffered trail and coverage first — a backup taken mid-clean previously
  could miss the last stretch of trail.
- **A finished run can no longer resurrect (F05).** If the delete that
  clears the run's start time fails during Finish, the failure is retried
  by the app's 15-second heartbeat until it lands, instead of the next
  launch mistaking the stale start time for a live run.
- **One offline download at a time (F07).** The Download offline maps
  button is single-flight (a second tap is refused with a message), and
  every file gives up after 30 seconds instead of one stalled file holding
  the whole download open.
- **Old backups restore for real (F06, Andrew's pick).** A backup carrying
  a street completion list but no side-marks record (the old format) used to
  report success and change nothing — the app trusts the side-marks and
  rebuilt the list from the phone's existing ones. Such a restore now
  derives the side-marks from the list, by the same rule the loader uses
  for streets with no side-marks record. Backups that carry side-marks
  restore exactly as written, as before.
- Docs: the storage schema's backup envelope now lists the override expiry
  field it always carried (F12).

## Beta 1.91 — 2026-11-03

- Pace rebuilt on metres (Andrew): pace is now a work rate — side-metres completed per hour, cumulative from the per-side mark stamps — instead of completed streets per hour. His real pattern (one side of a long street, both sides of a short one, back to the first) cannot distort a cumulative rate: every marked side adds its real metres the moment it lands, the ETA divides the side-metres remaining by that rate, and saved cleans compare in km of sides/hr with a projected full-clean time. Batched marks on one street cost only a few minutes of lag in the live reading; the totals never move. Per-street times in a saved clean are now the street's span — first side marked to last side marked — labelled as including any work in between (the old 'from the previous street' gap stays as the fallback for cleans recorded before side stamps existed).
- Cancel start erases the run (Andrew): cancelling a start now wipes everything that run recorded — its trail points, its session marker, any sides marked during it, its coverage and suggestions — and stores nothing; only Finish stores a run. (Supersedes the Beta 1.70 call that kept a cancelled run's trail as history.) Cancel is offered for the whole run, not just before the first street completes.
- Streets list order (Andrew): the Streets menu leads with the mains (gold — cleaned first), then the secondary streets (raspberry), alphabetical inside each colour, in every filter view.
- Tests: drive114 gains M6c/M6d (the metre rate, live, within 5% of an independent recompute; no streets/hr anywhere), M7a (cancel wipes marks, trail points and the session marker) and M11 (the list order, read from the rendered rows); drive133's S1 now asserts the cancelled run's trail is erased. drive114's M6 was also fixed: it called workEvents(), a production-only helper that does not exist in the beta — the harness returns a truthy {error} object for a thrown expression, so the check had been passing vacuously; it now reads the side stamps directly inside a try/catch.


## Beta 1.90 — 2026-11-03

- 3D buildings (Andrew's pick, option 1): both basemaps gain a fill-extrusion layer ('buildings-3d', just below the labels) built from the footprints already in the map tiles. The tiles record no heights for his streets (checked directly: 492 buildings in the route tile, none with a height), so the height is an estimate — a standard two-storey 7 m, using a real recorded height on the rare building that carries one. Blocks rise between zoom 15 and 15.3, so they appear as you zoom in and tilt; from directly above, the extrusion's top face is the old footprint fill (same colour, same blend) and the flat fill underneath is retired, so the top-down map is unchanged. Same tiles as before — the offline download is untouched (897 files), and the layer is inside the embedded styles, so it survives day/night swaps by construction.
- The generator (work/genstyles/gen.mjs) carries the same transform, so a future style regeneration keeps the layer.
- Tests: drive125 gains S7b — after a theme flip rebuilds the style, the extrusion layer is still there with its height ramp.


## Beta 1.89 — 2026-11-03

- A correction round, Andrew's exact structure (1.88 put the one-tap share on the settings row and left the backup pane a form): the settings main pane is Backup and Update, and the Backup row only OPENS the backup menu. The backup menu holds exactly three options - Backup (JSON) (the one-tap build + save prompt, moved here), Restore backup, and Download offline maps (the progress bar and status line are that option's feedback) - and the always-on text box and the Share/Copy buttons are gone.
- Restore backup opens its own menu with two options: Import JSON (new - the system file picker; the picked file feeds the SAME restore path as pasted text, one validator and one verdict) and Import Text (the paste box with Import backup under it). One Back button walks the tree up a level at a time; the version still rides bottom-right in every state.
- Tests: drive83's SEC-2 reads buildBackup() directly (the backup is no longer rendered into a box to read); drive125 gains T3c, a walk of the whole menu tree asserting Andrew's exact options and titles at every level.


## Beta 1.88 — 2026-11-03

- Settings is a blue full-screen takeover like the Routes menu (Andrew: the menus are cohesive on the blue): the Settings tab slides it up on the shared menu motion, the main pane holds Backup and Update, a bare white X at bottom centre closes it, and Andrew's picked version text rides at bottom-right in BOTH panes, re-synced from the main title's version on every open so it can never go stale.
- The Snow log pop-up is retired into the takeover's Backup pane: the backup box, Share and Copy, Restore with its paste-and-Import flow, and Download offline maps with the 1.87 progress bar (restyled on the blue) all live there now. Summary, GPX trail and Clear trail are REMOVED from the menu at Andrew's word; the trail clearing itself stays in the code as one callable piece (clearTrailAll) for its later re-home, and buildGpx stays for the architecture program.
- The Backup row is Backup (JSON) and earns the name (Andrew, same day): one press builds the backup AND opens the save/share prompt - a real .json file share where the platform offers it (Save to Files), the text share next, a plain download where no share exists. The backup pane opens behind the prompt, so cancelling still lands where Copy, Restore and the offline download live.
- Day/Night leaves the settings menu: it is now a round button at top-right of the map, built from the dock buttons' own class - measured identical to Pace and Streets (56px, same glass, same 27px icon) - showing the moon in day and the sun in night, with the same sun-auto and session-override behaviour.
- Tests: drive83's export checks ride the new pane (SEC-2 opens the backup pane; SEC-9a exercises buildGpx directly), drive86/drive144 clear the trail through clearTrailAll, drive125/drive145 assert the takeover's structure instead of the pop-up's rows.


## Beta 1.87 — 2026-11-03

- Settings menu reordered at Andrew's request: Night/Day on top, Backup second, Update last.
- The offline-maps download gets a progress bar (Andrew's request): a slim green bar, full width of the Snow log panel under the buttons, shown while a download runs — plus the counter now sweeps smoothly up to the real number through every value in between. The jumps he saw (0 → 200 → 400) were the display, not the download: five files fetch in parallel and finish in clusters, and the old status text only repainted every 200 files. The sweep is display-only — downloads stay five-wide, and the final line still reports the confirmed-in-cache count exactly as before; the bar settles on that confirmed fraction.

## Beta 1.86 — 2026-11-03

- Splash, fourth pass — Andrew's design: the splash is no longer a lid over a finished app. His frame-checked 1.85 recording showed the real remaining artifact at the still-to-live takeover (~3 frames): the icon ghost-doubling and the app's own tab bar bleeding in at the bottom — the app underneath the lid, showing through while the lid's first frames settle. Now boot is a state of the app itself: while booting, the app's chrome (tab bar, top HUD, dock, sheets, pop-ups) is not painted at all — absent, not covered — and the map's frame wears splash blue, so the live page during boot contains only the blue screen and there is no second surface to clash with the launch still. When a route is picked, the boot state flips while both blue layers are still fully opaque: the finished app paints beneath them, complete and in place, and the blue fade then reveals it whole — the chrome never pops or "loads in" afterwards (the failure of the old hide-everything attempt). The splash icon also returns to the exact original PNG artwork, embedded in the page: the launch still on Andrew's phone was captured from that artwork, and the compressed JPEG copy used in 1.85 renders its edges slightly differently — a plausible source of the ghost outline. Page grows by the difference (~280KB). Device cold opens are the verdict, as always.

## Beta 1.85 — 2026-11-03

- Splash, third pass — matching the still instead of hiding from it. Beta 1.84's blank-blue workaround is reverted: Andrew's recording of a 1.84 cold open shows the handover is a clean cut, not a blend — the still's icon vanished for ~0.9s (the blank live page) and then faded back in, an artifact the workaround itself created. The same recording is the good news: with a trivially simple live page, the seam frames were otherwise clean (no strip bleed, no doubled icon in any frame). So the live first frame now matches the launch still exactly: (1) the brand is visible from the first frame again (no fade delay); (2) the splash icon is embedded directly in the page (a data-URI copy of the same icon art, visually verified against the original) so no separate image fetch or decode can delay or drop it from the first paint; (3) while the splash is up, the page's root frame colour and theme colour are splash blue — the app's light day-frame colour (#eceff2) can no longer flash at any edge or first frame the splash hasn't covered yet; the boot class comes off at the same moment the splash is removed. The 1.83 tweaks (icon layer hint removed, title slide delayed to 1s) stay. Device cold opens are the verdict, as before.

## Beta 1.84 — 2026-11-03

- Splash workaround (Andrew's call after Beta 1.83's cold opens cleared the last two code suspects — the icon's leftover layer hint and the title's slide timing — with the glitch identical): stop trying to fix the still-to-live handover and hide it instead. The brand (icon + title) now starts invisible and fades in at 1s, so during the handover window the live page is plain splash blue with nothing on it for iOS's blend to double or leak. The title's slide, the splash timing, and the route-menu flow are unchanged; reduced-motion devices show the brand immediately as before. Device cold opens are the verdict.

## Beta 1.83 — 2026-11-03
- Sheet flick-close pop FIXED (Andrew, live catch on 1.82): a flick down to fully close landed, then the sheet popped back up and down a split second later — Streets and Pace both; flick up to full and flick down to the natural stop were clean. The close was the one landing that removed .dragging (transitions back on) in the same breath as flipping .open and clearing the inline geometry, leaving the browser's compositor a state change to animate/commit in pieces; the rig reproduces it (the closed sheet's top edge re-enters after first crossing). The close now lands entirely under .dragging and removes it two frames later, when it changes no computed value and nothing can animate (drive145 N34 pins the landing frame + no-re-entry; red on the old code, green on the fix).
- Splash glitch TEST tweaks (Andrew approved testing both in this beta): #splashIcon's dead `will-change: transform` removed (a leftover from the retired pre-1.76 icon-rush exit — nothing has transformed the icon since), and the splash title's slide-in delayed from 0.1s to 1s so it no longer crosses the screen during the still-to-live handover (the launch still carries no title); the slide itself is unchanged. Andrew's cold opens are the verdict: an identical glitch clears both items permanently and exhausts the code side.

## Beta 1.82 — 2026-11-03
Fix for a glitch Andrew caught live in 1.81: flicking the Pace sheet down from full, it sprang to halfway, stuttered, and snapped back to its own quarter-height rest. The 1.81 spring aimed every sheet's default stop at the half-height number, but Pace's content is short — its natural open height is about a quarter of the screen — so the spring landed on empty height and the finish step snapped it home. The default stop now targets the sheet's own natural open height (Streets is unchanged: its natural height is the half). Everything else from 1.81 is untouched.

## Beta 1.81 — 2026-11-03
Sheet swipe animations rebuilt from a measurement of Andrew's Waze screen recording. A drag release used to hand the sheet to a fixed 420ms CSS transition that restarted from rest: rig-measured, a flick thrown at ~1600px/s crawled in its first 120ms, then accelerated away — on Pace's short sheet that slow start was most of the trip, which is why a swipe down sometimes read as "just disappears." Releases now run a critically-damped spring (omega 30/s) whose starting velocity is the finger's own release velocity, matching the recording's settles (start at flick speed, geometric decay, ~500px trips landing in ~230-300ms, no overshoot past a stop). The sheet keeps its blur off until the motion lands, so the phone never repaints the frosted background mid-settle. Stop positions, end states, and the tap / X / tap-away animations Andrew approved are unchanged.
The route intro flight is slower and gentler (Andrew): the wide view now sits on the Route 5W point of interest for about 1.5 seconds (was 0.8), then flies in over 3 seconds on a flatter curve (was 2.1 seconds).

## Beta 1.80 — 2026-11-03
The route menu's close is now a bare white ✕ — no circle, no frosting — still floating at the bottom centre of the blue screen, still tab mode only. Andrew picked it from six rendered options (frosted light, Apple-Maps grey, dark frosted, solid white, bare white, bare black). The invisible 44-pixel touch target stays, and a soft shadow keeps the glyph readable on the blue. The translucent circle from 1.79 is retired.

## Beta 1.79 — 2026-11-03
The route menu's close is now Andrew's own design: a translucent circular ✕ floating at the bottom centre of the blue screen, Apple-style, replacing the red corner ✕ the menu briefly shared with the sheets in 1.78. It appears only when the menu is opened from the Routes tab — at boot there is still no close, because there is nowhere to go back to. The sheets and dialogs keep the shared red corner ✕.
The map's point of interest — the dot at the route's centre, shown when zoomed out — is now labelled with the route's name (Route 5W) instead of the app name (Andrew).
The two bottom sheets (Streets and Pace) now open at HALF height, with three stops — closed, half, full: drag or flick up to fill the screen, down to settle back at half, down again to close (Andrew). Dragging is seamless now: the panel follows the finger from the first pixels (a 9-pixel dead zone before it started moving is gone) and the frosted-glass blur is dropped while dragging, since repainting a full-screen blur every frame was making drags stutter behind the finger.
Also fixed in this round: if the street list rebuilt itself while a street note was mid-save (the map finishing loading, a day/night flip), the note's pending save could be stranded — the rebuild now finalizes the save on the spot and the reopened editor shows the truthful “Saved” state.

## Beta 1.78 — 2026-11-03
The Routes tab now opens the full-screen blue route menu (Andrew): the same menu the splash shows at boot — Choose a route / Create new route — sliding up from the bottom to take the whole screen, and the small Routes sheet is retired. The menu carries its own close X in this mode (at boot there is nowhere to go back to, so the X stays hidden there), styled by the same shared corner-X rule as every other menu. The loaded route's "Currently loaded" badge belongs to this menu.
No badge at boot (Andrew, caught live on 1.77): picking a route on a cold open briefly flashed "Currently loaded" as the menu left, because loading the route re-rendered the list mid-exit with the badge on it. The badge is now rendered only when the menu is opened from the Routes tab — boot-mode renders never carry it, so nothing can flash it during the pick.

## Beta 1.77 — 2026-11-03
Menu consistency (Andrew, caught live on 1.76): the Routes sheet's close X rendered as a boxed default button — it was missing from the one shared corner-X style rule — and tapping away from the Routes sheet did nothing, because the tap-away handler listed the sheets by hand and the new sheet was never added (the tap fell through to the map). Both shared mechanisms are fixed at the root: the Routes X joins the shared rule, and the tap-away check plus Close-all now read the sheets from the page by their shared class, so any future sheet is covered the day it exists. A new battery check compares every sheet's X styling and taps away from every sheet, so a menu that misses a shared treatment fails the tests instead of reaching the phone.
Automatic day/night (Andrew): the theme now follows the sun — sunrise and sunset are computed on the device for the last GPS position (or the route's centre before a fix), and the map and menus switch at those times on their own, including while the app sits open or in the background. The Settings Night/Day row is now an override for the session: it holds until the next sunrise or sunset after it was set, or until the app is fully closed — backgrounding and reopening keeps the choice, and a cold open always starts automatic.
Route intro flight (Andrew): picking a route no longer lands on a map that is simply already zoomed in — the camera opens wide on the route's area as the splash leaves and flies smoothly in to the fitted route view (about two seconds; skipped when the system asks for reduced motion).
Fix the automatic theme exposed: the map library rewrites fields of a style object it is handed, so a night boot followed by a flip to day silently rewrote the night style's own sprite sheet to the day one — the offline download then never fetched the night sprites (893 files instead of 897), and flipping back would have drawn the night map with day artwork. The map now always receives a copy; the built-in day/night styles are never handed over directly.
Fix the intro flight exposed: a basemap switch used to be applied as a difference, which keeps the existing tile source — including tiles that errored during a connection outage — so when the connection recovered, the map never asked for its tiles again and the "maps can't load" notice never cleared. A basemap switch now always rebuilds in full (tiles still come from the local cache), so recovery is real.

## Beta 1.76 — 2026-11-02
Andrew's route-menu round. On open, the splash brand (icon + title) now slides out to the right at the ready gate and a route menu takes the same blue screen: Choose a route / Create new route (a placeholder for now). The map behind carries no route until one is picked; picking Route 5W loads it (state, paint, camera, and an in-progress clean resumes). Storage is multi-route from the start (Andrew: no cleans yet, so this is the free moment): every route owns a storage slot under snowroute.<routeId>., Route 5W is the first tenant, and the first launch moves any pre-1.76 data into its slot copy-and-verified, legacy keys kept as a fallback. Backups are format v2 (per-route slots + night); v1 backups still restore, into the 5W slot. Tab bar: Night/Day moves into Settings (menu order is now Night/Day, Update, Backup) and its tab slot becomes Routes (route-path icon, Andrew's pick); in the map, Routes opens a Streets-family sheet listing the routes with the loaded one marked Currently loaded.
Hardening found by the pre-ship test battery: the trail and GPS paint helpers now tolerate being called before the map exists (they already returned when their map source was missing; they now return when there is no map yet), so no paint call can throw during the menu phase. The same tolerance now covers the north-up reset on the finish path. One real regression the battery caught in the restructure itself: the coverage-index cleanup (audit D1) used to run over the stored data as the page loaded; with state now loading on route pick it briefly ran over nothing, so junk coverage indexes would have survived a load — the cleanup again runs over the loaded data, in the loader.

## Beta 1.75
- Clear tab icon: the eraser is replaced by the undo-arrow glyph (option D from Andrew's icon sheet, picked 2026-11-02).
- Pace dock icon: the stopwatch is replaced by the flag glyph (option D from Andrew's icon sheet, picked 2026-11-02). The Streets dock icon was reviewed over three option rounds and stays as-is at Andrew's call.
- Start button: label is now START ( capitals, same font), and the circle is splash blue #2b4bf2 with a white word - superseding the Beta 1.23 black/volt treatment. drive125 S1 updated to the new spec.
- Blue unification (Andrew): every UI blue now matches the splash blue #2b4bf2 - HUD/banner buttons, the sheet filter's selected state, the note dialog's Yes, the active tab (day #1f6fd0 and night #4da3ff), the chip tint hue, and the GPS dot/ring/glow family (was #1a8cff), the link colour (was #1f6fd6 day / #7db4e8 night), and the GPS trail line (was sky #38bdf8). A full sweep of the built page confirms #2b4bf2 is the only UI blue left; the remaining blue-ish values are the basemap style's own paint and blue-grey secondary-text tones. Route colours (Metro gold/raspberry/mint) and the Finish button's black/volt are untouched.
Night menus take a new colour at Andrew's direction (2026-11-02), sampled from a Google Maps dark-mode reference he supplied: the menu surface was a near-black blue-black (7,10,17); it is now a neutral charcoal (32,33,37) - #202125 - at the same 94% opacity, and the floating glass surfaces (buttons, chips, the selection pop-up) take the same charcoal at their existing 78%. Text fields on those menus take the reference's raised tone #3c4043 (its search-bar colour). Day mode is untouched, as are the night ink/accent colours. Preview screenshots were rendered and measured (sheet samples at #202125) and approved by Andrew before this shipped.
Tests: no test asserts the old colour values; the full battery runs unchanged.

## Beta 1.74
The Beta 1.73 follow-up audit round (adjudicated 2026-11-02). One export correctness fix with its regression test, one harder offline test, and a phone checklist.
1. **GPX export splits correctly on out-of-order trails (D01).** The 1.73 export walked the session markers with a pointer that only moved forward - exact for trails in time order (and proven so), but a stored trail is not guaranteed ordered (older trails, restored backups), and a trail that crossed a session start, stepped back below it, and crossed again lost the second split, merging two cleans into one exported segment. The walk now re-seeks when a point steps backward; in-order trails are unaffected and still export in one pass, and no saved data changes shape or order. A regression test with exactly that out-of-order shape failed before this fix (2 segments instead of 3) and passes after.
Tests: drive143 gains X7 (the out-of-order parity case). The offline end-to-end gains E16: the browser process itself is killed mid-download (the 1.73 test killed only the page), relaunched on the same saved profile, and the resumed download must restore the full set. Also delivered with this round: a short manual iOS regression checklist (in the tracker's documents) covering airplane-mode launch, offline zooms, day/night switching, relaunch, interrupted download, storage persistence and GPS background/resume - the automated suite runs in Chromium, and the checklist is the iOS-side evidence.

## Beta 1.73
The Beta 1.72 deep-audit round (adjudicated 2026-11-02; the audit's findings C01-C08 verified against the source first). Two small data-integrity fixes, one approved restore rule, one export tidy-up, and a test suite that now proves what it claims.
1. **Session-marker saves tell the truth (C04 + C05).** The marker write when a clean starts, and the marker clear when the trail is cleared, were the last two storage writes whose results were dropped - a failure was silent. Both are now checked like every other write: the start and the clear warn accurately, the clean still starts, and a failed marker write is retried by the background flush until it lands.
2. **Legacy restores no longer inherit the wrong markers (C06, approved).** Restoring a pre-1.71 backup - which carries a trail but no session markers - used to leave your CURRENT markers in place, where they described a different trail and could split the restored one at wrong places. Such a restore now clears the markers as part of the restore itself (written, verified and rolled back like every other entry). A legacy backup without a trail still leaves markers untouched, and current-format backups restore their own markers as before.
3. **GPX export walks the markers once (C07).** The exporter re-scanned the whole marker list for every GPS point; it now walks the sorted list with a single pointer. A test proves the segmentation is identical to the old scan on a marker-dense trail.
Tests: new drive144 (marker-save failures injected at clean start and at Clear Trail, warning + retry recovery); drive121 gains the four C06 restore cases (legacy-with-trail clears, legacy-without-trail keeps, current-format restores its own, failed restore rolls trail and markers back); drive143 gains the C07 parity check (120 points, 25 markers, segment starts identical). The offline end-to-end is rebuilt where the audit found it weak: the interrupted-download case (C01) now starts from an empty cache with throttled responses, verifies a partial count on disk, kills the page, and requires the resumed download to restore the full key set the verified download had - plus a dead-network burst case that must finish short and honest, then recover fully; the offline boot case (C02) now restarts the whole browser on the same saved profile with the network dead from the first instant; the wide-zoom cases (C03) drive the map to the actual wide zooms, verify every tile covering the view inside the download area is cached, and count any failed request for a download-area tile; and the day/night switch is proven fully offline. C08 (two clean starts inside one second) was adjudicated negligible - the recorded marker still bounds the second clean - and closed with no format change.

## Beta 1.72
Offline Phase 3 (the parked remainder of the reliability audits, built 2026-11-02): one app fix plus the end-to-end proofs that were missing.
1. **Offline maps cover the wide zooms (R04).** The map lets you zoom out to zoom 8, but the offline download only fetched zoom 10 and closer - so with no signal, zooming out past 10 showed a blank basemap. The download now includes zooms 8 and 9 over the same Vaughan area (3 extra tiles): 633 tiles, 897 files in all. Your next download picks them up; the count on the button is the honest new total.
Tests: the offline end-to-end gains Phase 3 cases - a cold boot with the network dead must render the map from the saved files alone (E8), the basemap must still arrive at zooms 8.4 and 9.4 offline (E9/E10), a behind-the-scenes app update must take over without losing the saved maps (E11), and killing the app mid-download must still end at the full count on the next run (E12). drive123's download count updated to 633 tiles / 897 files.

## Beta 1.71
The Beta 1.70 deep-audit round (adjudicated 2026-11-02). Small corrective patches plus one approved format addition; no Kalman parameters, geometry, paint or fullscreen changes.
1. **Clear dismisses the suggestion panel (B01).** Clear wiped the coverage behind the GPS suggestion panel but left the panel itself visible, its Yes still able to select the street. It now hides the panel and clears its street reference, like Cancel/Finish/Undo already did.
2. **One segment rule for distance (B03).** trailKm now treats a jump over 1000 m as a break, matching the trail display and the GPX export — the archived distance can no longer count GPS teleports the map refuses to draw.
3. **Second-precision boundaries (B04).** Trail timestamps are whole seconds; run-start boundaries are now compared at that precision (trailKm and the archive path filter; the display already did), so a start mid-second no longer discards the clean's first segment.
4. **GPS session markers (B02 — format addition, approved).** A new storage key (snowroute.v5.sess) records each clean's start in epoch seconds; GPX segmentation splits at recorded session starts exactly — a cancelled-and-restarted clean now exports as two tracks — while pre-1.71 trail keeps the gap heuristic. The key joins BACKUP_KEYS (12): new backups carry it, older backups restore exactly as before (the missing key leaves current markers untouched), and clearing the trail clears the markers.
5. **Snow Log start consistency (B05).** Started and Duration use the clean's actual start when recorded (the first-completion fallback is kept for states without one), matching the distance window.
Tests: drive143 gains B01/B02/B03/B04/B05 cases, and its archive-distance check now verifies against an independently computed meridian-arc expectation instead of the app's own distance function.

## Beta 1.70
The Beta 1.69 audit round (two external audits, adjudicated 2026-11-02). The deep audit verified 1.69 clean; the full audit's nine findings are fixed here, in its phase order. No Kalman parameters, thresholds, geometry, paint, storage keys or backup shapes changed.
1. **Undo reports its metadata save (A01).** Undo's gated writes (history, sides) were already transactional, but the follow-up save of notes/times/start was ignored behind an unconditional 'run restored' toast. It now branches on the result like Finish does and names the failed key.
2. **Keyboard pair (A02 + A03).** The pop-up/modal card shift is computed from the card's unshifted position (the applied shift is tracked and added back), so a keyboard that grows after the first correction no longer drops the field back underneath it; a shrink clears a shift that is no longer needed. The closing sampler gets the opening sampler's discipline: two unchanged samples at the still-short height no longer prove dismissal - an observed rise (or the confirmed full height) is required, with the same bounded cap.
3. **GPS session boundaries (A04 + A05).** Coverage and suggestions are run-scoped: Cancel and Finish both clear them now (Finish kept the suggestion set), and Clear counts coverage-only state as something to clear. Archived distance is measured from the clean's actual start (not its first completed street), a GPS segment counts only when both endpoints belong to the run, archived paths no longer admit points from 60 s before the start, and the snow-log report uses the same start for its distance.
4. **Defensive + export (A06 + A07).** The piece-time sanitizer is bounded by each street's real stretch count (a corrupt key like 10000 inflated a ~50 KB sparse array). GPX exports split track segments at session gaps (same 300 s / 1000 m rule as the map's trail display).
5. **Markup + docs (A08 + A09).** The duplicated sheetHead/sheetTitle IDs (Streets and Pace panels) are now shared classes, with the CSS and drag selector updated together. ARCHITECTURE.md describes the Kalman filter, the multi-session trail and the embedded styles as they are.
Tests: new drive143 (undo honesty under failing metadata saves, coverage lifecycle, distance/path boundaries, sanitizer bound, GPX segmentation, ID uniqueness); drive135 gains K01 (sequential keyboard growth against a modal card) and K02 (delayed dismissal).

## Beta 1.69
The two-audit fix round (external audits of Beta 1.66, adjudicated 2026-11-02). Five fixes, no estimator, threshold, geometry, styling or storage-format changes:
1. **The starvation pump lives again (N01, both audits).** Two declarations of startRenderLoop stood back to back since the 1.65 lifecycle repair: the full version (frame loop + 100 ms starvation pump) and a stripped leftover (frame loop only) that JavaScript silently preferred - the pump described in the 1.65/1.66 entries never ran. The duplicate is deleted; a test now counts declarations and proves the pump advances GPS state with animation frames blocked.
2. **Keyboard settle hardened (N02).** The focus sampler could declare the keyboard settled after two unchanged height readings before the keyboard had even begun moving the viewport, lining the field up against the wrong geometry with no recheck. Early conclusion now requires a real observed drop in height (the time cap remains), and a viewport resize while the keyboard is open re-runs the field-visibility check.
3. **Cancel Start tells the truth (N03).** It was the last save path still claiming success unconditionally; it now branches on the save result like every other path.
4. **GPS watcher generations (N04).** Watcher callbacks carry a generation tag; a queued callback from a stopped or replaced watcher is dropped even when its timestamp is fresh.
5. **Trail refreshes on run end.** Finish, undo and cancel-start now force a trail redraw, so a finished or cancelled run's line no longer lingers until the next throttled refresh.
Tests: new drive142 (declaration count, pump-under-starvation, watcher generation, cancel honesty, trail-refresh calls); drive126 asserts the pump installs and clears with GPS start/stop; the keyboard drive gains a delayed-keyboard scenario.

## Beta 1.68
Experiment 1 REVERTED (Andrew's device verdict, 2026-11-02): on Beta 1.67 the launch glitch persisted unchanged - which answers the experiment's question: the flashing tab bar does NOT come from this page's live tab-bar layer. The hiding rule also made the tab bar pop in a beat after the app revealed, which reads worse than the original reveal, so both Experiment 1 rules are removed in full and the launch is back to the Beta 1.66 design. The investigation's remaining results (Probes C/D/E) are recorded with the audit; the tab-bar image is now attributed to a previously captured app image on the evidence of elimination.

## Beta 1.67
Launch-ghosting investigation, Experiment 1 (external audit of the splash handover, adopted 2026-11-01). Two live-layer isolations, nothing else changed: while the splash element exists, the bottom tab bar is hidden outright (if the tab bar still flashes in a slow-motion launch recording, it is not coming from this page's live tab bar layer); and the splash container itself carries the opaque splash blue during the intro, scoped to before the exit starts so the icon rush still reveals the app as designed. Splash timing, geometry and the exit animation are untouched. Device protocol (Andrew): repeated cold launches recorded in slow motion, each classified doubled-icon / tab-bar flash / both / clean.
Tests: drive132 gains S6 (tab bar hidden and container opaque during the splash, tab bar restored after).

## Beta 1.66
Render-loop refinement (drive127 arbitration): a running glide is settled to the current instant at each new fix before it re-anchors on the new aim, so the dot never chases leftover distance from a stale position in a browser that paints slowly; the frame-starvation pump checks every 100 ms instead of 250 ms. No threshold, estimator, or glide parameter changed - Beta 1.65's merge-commit battery caught drive127's stationary-wander and backtrack measures over their lines twice while the identical branch battery passed; the stale re-anchor is the mechanism, and this is its fix.

## Beta 1.65
Smooth GPS round (Andrew's road test of 1.64 + the third audit's render item).
- One frame-synced render loop now drives the GPS dot and the follow camera, replacing the 40 ms glide timer and the 50 ms camera timer that used to overlap at ~45 unsynced updates a second. The glide keeps its smoothstep easing and the camera keeps its 35%-per-50 ms convergence, both computed from the clock now, so the motion is the same at any frame rate - and the dot, ring and beam redraw only when something actually moved. Andrew's report on 1.64 was that the GPS jumped instead of gliding; this is the fix, and the loop also ends the two-timer battery waste the audit flagged.
- The trail line is anchored under the GPS layers: it could paint across the dot's face (Andrew's road report); the layer order is now pinned where the layers are created.
- The splash cover overshoots the screen top and bottom by 70 px, so while the screen size settles in the first frames no sliver of the app beneath (the tab bar) can flash under the splash. The other half of Andrew's splash report - the icon jumping up at the handover - is the launch still iOS froze at install time (pre-fix geometry); it cannot be refreshed from the app side.
- Tests: drive126's lifecycle check now asserts the render loop (it asserted the retired camera timer); the full battery arbitrates the motion drives.

## Beta 1.64
GPS and defensive round (deep audit F05-F09 + R01; third audit's trail item).
- Starting a clean on an already-running view-only GPS watch now flips the Locate tab to its red recording face; the state sync sat below an early return and never ran (F06, drive133 R3).
- The on-map trail now shows only the current clean; the stored trail (snow log, GPX, backups) still keeps every clean (F05, drive141).
- Trail redraws are throttled - at most every 3 seconds, or once 5 new points have accumulated - instead of a full rebuild of up to 8,000 points on every fix (third audit; drive141).
- A GPS callback whose own timestamp is older than the last accepted fix is ignored, so a delayed callback cannot move the dot, trail or coverage backwards (R01, drive141).
- Stored shapes are normalized at load: a string in place of the completion-times object no longer kills the boot in the cleanup loop, and side timestamps are sanitized to [time, time] pairs so marking cannot throw on a nested string (F07, drive141).
- Service-worker network waits are now bounded for every request class: a request that never answers falls back to its cached copy after about 11.5 seconds instead of hanging (F09, sw.test).
- The compass listener is removed when GPS stops; it used to be re-registered on every start and never removed (F08, drive141).
- Dead code removed (an unused escaping helper, two leftover paint helpers from the half-band era, an unused distance helper, an unused glow constant). The two segLenM functions are NOT duplicates - the paint engine's private one sums a different metric for label geometry, the app-global one serves the progress meter - both stay, now commented as such.
- Tests: new drive141 (7 checks), drive133 gains R3, sw.test gains the stalled-request case (22 total).

## Beta 1.63 - 2026-11-01
Data correctness, from the Beta 1.60 deep audit (adjudicated the same
day; findings F01-F04):
- F01: a note draft now belongs to its street. renderStreets records
  which street's editor is in the DOM (noteEdFor); switching streets
  finalizes the old editor against ITS street before the new one
  renders, and a draft is only ever restored into its own street's
  editor. One street's note can no longer appear in - or be saved to -
  another street.
- F02: the Finish rollback is verified (write checked + read back).
  If rolling the archive back fails, the message says the archive
  could not be undone and asks for a backup export, instead of
  claiming the clean is intact. The Undo mirror rollback is verified
  the same way.
- F03: lsDel returns its result and saveStart propagates it, so a
  failed deletion of the run-start record surfaces through saveAll
  like any other failed write (it used to report success regardless).
- F04: success messages now branch on the save result - Saved /
  Note saved / Clean deleted / All marks cleared / Clean started are
  only claimed when the write landed; otherwise the message names
  the storage problem.
Tests: drive136 gains the rollback-failure (F6) and removeItem (F7)
fault cases; new drive140 covers the note-draft matrix (switch with a
pending draft, both streets noted, same-street re-render).
## Beta 1.62 - 2026-11-01
Cleanup, at Andrew's direction (the post-strip soak deferral was lifted
the same day): the strip-era machinery comes out now that the
document-height floor (1.60) holds the full stage on its own.
- The 1.58 recovery nudges are REMOVED (function, counters, and the
  syncViewport call): they moved the page by design and could still
  twitch once during the splash handoff even though the stage now
  always arrives full.
- The 1.54 viewport trust override is REMOVED: syncViewport publishes
  the live report, always. fullH remains only as the keyboard settle
  sampler's reference.
- The #diag diagnostic readout (1.55, always labelled temporary) is
  REMOVED, element and tap handler together; its job - classifying the
  strip - is done and device-verified.
- The four strip-test probe pages are removed from the site.
drive135's trust assertions are rewritten to the live-rules contract
(V4/V5); drive137 (the nudge test) is retired with the machinery.
## Beta 1.61 - 2026-11-01
Keyboard overlay, at Andrew's direction: while a note field is focused,
the keyboard now slides OVER the app instead of resizing it. The layout
variables (--vvt/--vvh/--vvb) freeze at their pre-keyboard values for the
whole typing session (syncViewport returns early while body.kb), and the
sheets keep their pre-keyboard size and place (the 1.31 near-full-height
sheet rule is gone). This replaces 1.55's live-tracking, whose per-tick
re-fitting of the sheets against the keyboard's rise animation made both
note menus flicker and jump (pre-dating 1.60; Andrew's readout caught the
visible height chasing 932 -> 740 mid-animation). Field visibility -
the problem 1.55's tracking was solving - is now handled inside the
menu: once the keyboard's rise settles, ensureFieldVisible scrolls the
sheet's own list so the field sits above the keyboard, or shifts the
pop-up/modal card up by the overlap (cleared when the keyboard leaves).
drive135's keyboard contract is rewritten to the freeze (V2c) plus a
holds-against-the-tick-stream check (F1).
## Beta 1.60 - 2026-11-01
The short-stage FIX, at the source: a document-height floor on the root
element (min-height: min(100lvh, calc(100% + env(safe-area-inset-top)))).
The strip investigation's final lead, from third-party iOS 26/27 reports:
WebKit keeps a Home Screen app's layout viewport short while its document
is no taller than that viewport, and grants the full screen once the
document is at least screen-tall - which is also why ordinary (long,
scrollable) websites never showed the defect. Proven on Andrew's iPhone
(iOS 27.2) the same day with bare probe pages, fresh installs (the worst
bucket): base probe innerHeight 873 at cold launch/resume/keyboard;
probes with this rule (A) and with a screen-height JS floor (B) both held
932 through all three. A is ported (pure CSS, effective from first
layout). Beta 1.59's boot heal is RETIRED UNMERGED - with the sizing
fixed at the source, a reload would only recreate the same document. The
1.54-1.58 viewport machinery stays for now as inert fallback (it never
engages at full size); its removal is a separate round once 1.60 has
soaked on the phone. The diagnostic readout also stays until the strip
has been absent across Andrew's 30-launch acceptance count. drive139
pins the rule's presence, its document-tall precondition, and unchanged
layout; the cure itself is WebKit behaviour and is phone-judged.
## Beta 1.59 - 2026-11-01
Boot heal for the short-stage launches. The strip investigation (same day)
closed the root-cause question: iOS chooses the layout viewport's size
before the page's first layout - intermittently 59pt short on this
install, permanently short on fresh installs - and no page code can reach
the missing strip (proven with a bare reproduction page; WebKit 313800).
One mechanism remained untried and evidence-led: a fresh layout sometimes
lands full (reopening the app fixes some bad launches), so when a launch
is still short after the settle window the app now reloads ONCE, behind
the splash, to re-roll the layout - standalone only, portrait only, never
over an open clean, loop-guarded per launch. Every outcome is tallied in
local storage and shown in the diagnostic readout as "heal A/R/S"
(attempted / recovered / still short): if iOS locks the size per launch,
R stays 0 and the mechanism comes back out. The 1.58 nudges stay for the
mid-session (keyboard) cases. drive138 pins the heal.
## Beta 1.58 — 2026-11-01
- **Fullscreen strip: classified, and now actively fought (with receipts).** The diagnostic screenshots settled the cause: in the bad state the window height, visible area, bottom bar's lower edge and map's lower edge *all* read 873 against a 932 physical screen — a shortfall of exactly 59px, the status-bar height. iOS intermittently sizes the installed app's window short; the app inside it is laid out correctly and cannot paint into screen it does not own. So instead of another layout layer, the app now *detects* the shortfall (it knows the settled height) and jolts the browser toward recomputing the window — a one-frame root-height toggle plus a scroll nudge — at the moments the shrink appears (launch, resume, keyboard close). Nudges are rate-limited (2.5s apart) and capped (12 per session), and the diagnostic readout now counts attempts/recoveries (`nudge A/R`), so real-world launches will show whether the jolts ever recover the full screen. The separate lever remains deleting and re-adding the home-screen shortcut, which refreshes the launch configuration iOS froze when it was first added.

## Beta 1.57 — 2026-11-01
- **Storage integrity (external audit Phase 2 + Section 7).** Saving progress has a failure contract now: the side-completion record — the authority the board rebuilds itself from at launch — is written first, every write is checked, and the first failure is named; a failed save warns once per episode ("Storage is not saving — export a backup now") instead of silently desyncing. **Finish is a transaction:** the archive record and the cleared board are both written and verified *before* any state changes, and a failure rolls the archive back — a storage error can no longer leave a finished clean resurrecting beside its own archive entry. **Undo follows the same discipline** and stays on offer if its writes fail. A metadata-only failure during Finish completes the finish with an honest note in the confirmation.
- **Offline-cache upkeep (second audit).** The tile-cache trim counter is now seeded from the cache's real size when the background worker wakes (iOS stops the worker constantly, which kept resetting the in-memory count and could let the cache drift past its cap). Opaque (status-unknowable) responses are no longer cached for CDN files. The app now also asks the platform to exempt its data from automatic storage eviction where supported (`storage.persist()` — an installed home-screen app is already outside Safari's 7-day tab rule; this covers tab use and other browsers).
- **Wording:** the offline-download refusal message no longer ends with an instruction that only made sense to the author.
- **Documentation sweep (known leftover B09, confirmed by the second audit):** README and architecture docs described retired map technology (OpenFreeMap, Esri fallback tiles, VersaTiles, even Leaflet); they now describe the actual stack — embedded Protomaps styles, CARTO vector tiles, MapLibre GL.

## Beta 1.56 — 2026-11-01
- **Keyboard ownership (external audit Phase 1).** The typing freeze (`body.kb`) had three owners: the keyboard lifecycle plus two street-list rebuild paths that removed the class directly — a rebuild mid-typing could unfreeze the sheet while the keyboard was still moving. Now the lifecycle in app4 is the single owner: rebuilds call `kbSync()`, which routes through the same settle-release as a normal blur. The settle sampler itself was extracted unchanged into `startKbSettle()`.
- **Competing scroll removed (audit B4).** The note editor no longer runs a delayed smooth `scrollIntoView` (which pans the whole page and fights iOS's own focus pan). It now nudges only the sheet's own scroll position, instantly, if the editor sits outside the sheet's visible box.
- **Diagnostic readout extended** with the element-edge measurements the audit specified: bottom-bar bottom edge, map bottom edge, document/body heights, visual-viewport pageTop and scale. These discriminate an app-owned gap from a browser-owned one: if the bar's edge equals the window height while the window itself is short of the physical screen, the browser owns the strip.

## Beta 1.55 — 2026-11-01
- **Keyboard fix (regression from 1.54, Andrew's report).** 1.54 pinned the menus to their pre-keyboard positions while typing, intending to stop jitter — instead it stopped the menus *riding above the keyboard* (their long-standing behaviour), leaving the note box behind the keyboard and off the visible screen in both the Streets sheet and the selection pop-up. The pin is removed; offsets follow the live visible-area report while typing again. 1.54's other two pieces stay: the settled-size anchor and the freeze-until-settled release (separate mechanisms, not implicated).
- **Temporary diagnostic for the cold-start strip** (still present on 1.54): tap the version label 5 times to toggle a live readout of the size numbers (window height, visible-area height/offset, screen size, settled size, published sizes). One screenshot of it in the bad state identifies which measurement is short, so the next fix lands on the right layer instead of another inference. Removed when the strip is closed.

## Beta 1.54 — 2026-11-01
- **Fullscreen + keyboard hardening (Andrew's deep-dive).** Cold starts still showed the bottom strip ~2 times in 10, and a keyboard cycle (open a note, type, close) could glitch the Streets/selection menus ("reanimates up like opening for the first time") and bring the strip back until the app was relaunched. Root causes: everything was sized from whatever height the phone *last reported*, with no memory of the true size, and iOS sometimes stops reporting after a wrong one; and the menus' freeze-while-typing protection lifted the instant a field lost focus, while the keyboard was still sliding away, so sizes animated against a moving target. Now: the app keeps a **settled size** (the tallest no-keyboard report; in a home-screen install the full screen height is known from the first frame) and trusts it over a stuck short report, so the strip cannot paint; while typing, the bars hold the positions captured as the keyboard opened and only the usable height follows the keyboard; and the freeze now releases only once the reported height has **settled** (back at the settled size or stable across samples, capped ~1.5 s), in one clean change. New drive135 simulates the whole cycle.
- **The version label was stale — fixed and gated.** The 1.53 build still displayed "Beta 1.52" (a label edit in an earlier round silently matched nothing; the in-app update checker compares that text, so the Update button could not have detected the release). The label is corrected, and the build now **refuses to ship** unless the displayed version equals the CHANGELOG's top entry.

## Beta 1.53 — 2026-11-01
- **Offline maps actually save now (the "saved 0 of 894" fix).** Andrew's phone downloaded the offline set and reported "saved 0 of 894 files" on a working connection. Root cause, proven end-to-end: the app's own Content Security Policy stamped `worker-src blob:` only — and the service worker (the component that saves tiles as they pass through it) is a same-origin file, so its registration was **policy-blocked on every load**. The app worked perfectly online (nothing visibly wrong), the registration error was swallowed by a catch labelled "SW is optional", and no offline copy was ever stored. Fix: `csp_stamp.py` now stamps `worker-src blob: 'self'; child-src blob: 'self'` (`blob:` stays for the map library's internal workers), and the build's CSP verification **asserts** `'self'` is present — the build refuses to ship a policy that blocks the worker ever again.
- **The download refuses to lie.** The preload handler now confirms the service worker actually controls the page before fetching (waiting for control the same way the first-boot warm path does); if it still doesn't, the download stops immediately with "Offline maps NOT saved: the part of the app that saves them is not running" instead of burning 894 fetches on a guaranteed zero. A refused registration now records its reason (`window.__swErr`) so the message can name it.
- Same defect exists in production's stamp (v5.81) — flagged to Andrew 2026-11-01; patching production is his separate call.

User-facing changes and important reliability fixes. Versions are the
in-app labels (header, under the app name). Since Beta 1.36 the label is
just "Beta X.Y" and the app is called Snow Route Beta.

## Beta 1.52 — 2026-11-01

The title and version in the top-left move down 10px more (Andrew's calibration: exactly the measured height of the letter B in the big title — his ruler for the distance). They now sit 18px lower than where they started two rounds ago.

## Beta 1.51 — 2026-10-31

Two fixes from Andrew's phone. (1) THE FLOATING BOTTOM BAR: on some launches the app was handed a slightly too-short screen height by the phone and never measured again, so the bottom bar floated with a pale (day) or dark (night) band under it — and reopening the app often just resumed the same frozen page, which is why a reopen only sometimes helped. The app now re-measures the screen at every moment the size is known to have settled: when the page is shown or resumed, when it comes back to the front, on rotation, and in a few automatic re-checks during the first seconds after launch. Measuring costs nothing when the size was already right. (2) The title and version in the top-left sit a little lower (Andrew's ask).

## Beta 1.50 — 2026-10-31

PERFORMANCE TEST ROUND — the outside audit's Groups A and B, built as one removable layer over Beta 1.49. Nothing about how the app looks or behaves is supposed to change; it should just feel lighter: selecting a street no longer re-sends the whole route's data to the map, only the selection; the two side arrows are no longer rebuilt from scratch on every map movement, only when their picture actually changes; the selection's breathing glow pauses while the app isn't on screen instead of repainting twenty times a second into the void; marking a street updates its row in the list instead of rebuilding all 34 rows; the map is only told to resize when its size truly changed; and the offline map download now fetches five files at a time instead of strictly one by one (same 894 files, same honest saved-count), with the behind-the-scenes cache tidying itself in batches instead of after every single tile. If anything feels worse than 1.49, say so — this entire round comes off in one step and 1.49 (with its GPS and beam fixes) stays.

## Beta 1.49 — 2026-10-31

YOUR TWO RULES, BUILT IN. First: location now has two honest modes. The Locate tab by itself only shows you live — where you are and which way you're facing — and never records anything; your route is recorded only while a clean is running, by that clean's own location, exactly as you set it down. You'll always know which mode you're in: the Locate tab wears blue for view-only and red while a clean is recording, and it tells you in words when it starts ("view only, not recording" / "recording your route"). If you tap Locate in the middle of a clean you've started, it resumes that clean's recording and says so — recording always belongs to the clean, never to the tab alone. Second: the direction beam is rebuilt to match the picture you sent — a smooth fan that's strong at the dot and fades with distance, soft at the edges instead of a hard flat wedge, with a softer shadow under a slightly bolder dot.

## Beta 1.48 — 2026-10-31

RELIABILITY ROUND (from an outside audit of Beta 1.44 — every claim was checked against the app before any fix was made). The headline is a test, not the app: the GPS centring test was switching location on through a side door, so the camera helper that runs for real users never ran in the test — the app was fixed for this back in Beta 1.28, the test never got the update, and its random-looking failures were the test's own shadow. The test now starts location the real way, proves it can tell following from not-following, and keeps its original strictness. Real fixes in the app: if your signal goes stale mid-clean and location restarts itself, it now remembers it belongs to your clean; the direction beam no longer lingers after location is turned off; a backup that cannot read a piece of your data now refuses instead of quietly leaving the piece out; a network connection that never answers can no longer hang the app's start when a saved copy exists (slow connections still get their full chance); the background refresh of the map's icon sheets can no longer be cut off mid-update; and your backup file is finally named snowroute-backup.json instead of the retired 5W name — the file itself is unchanged and old backups still restore. One audit claim needed no fix: finishing a clean already refuses to clear your board if the save does not land.

## Beta 1.47 — 2026-10-31

FULL SCREEN, FINISHED (Andrew: other apps cover the whole screen, this one should too). The phone paints a frame around the page in Safari — its top strip and the area behind its bottom bar — in a colour the app chooses. Ours was set to near-black in both modes, so by day a dark band wrapped the light map and the app looked boxed in. The frame colour now follows the app: light by day, dark by night, switching the moment the mode switches. Together with 1.46 (no reserved strip in the Home Screen app), the app now covers the screen edge to edge the way the others do.

## Beta 1.46 — 2026-10-31

SPLASH HANDOFF, SMOOTH (Andrew's report: in the browser it was fine, but as a Home Screen app the icon dropped a step at the very start). The cause was not the splash at all: the app told the phone to keep a black bar across the top, so the frozen first picture filled the whole screen while the app itself started below that bar — everything centred about half an inch lower, and the icon visibly stepped down when the picture handed over. The app now fills the whole screen like a native app (the clock and battery float over it), so the picture and the splash line up exactly — measured within a single pixel. Four newer/larger phone sizes also got their frozen first pictures (the biggest Pro Max screens, the 16 Pro size, the Air, and the mini size).

## Beta 1.45 — 2026-10-31

SPLASH, SIMPLER (Andrew's call after living with it): the icon no longer animates in. The still picture the phone shows first has the icon sitting still — so when the splash took over and the icon vanished and rose again, that little replay felt like a glitch no matter how smoothly it ran. Now the icon sits exactly as it does in the still from the first frame, and the only movement at the start is the "Snow Route" words sliding in. The exit is unchanged: the flake still rushes at you and dissolves into the app.

## Beta 1.44 — 2026-10-31

SPLASH SMOOTHNESS (Andrew: it still glitched and stuttered on the phone). The animation itself never changed after 1.42 — what changed from open to open was how much start-up work landed on top of it: creating the map, processing the map style and drawing the first tiles arrive in a few big chunks, and when one of those chunks hit during the half-second the icon is rising, the animation froze and lurched (worst on a cold open, invisible on a warm one — which is why some opens looked perfect). Now the app waits: the splash intro plays first with nothing competing, and the heavy start-up begins the moment the intro finishes. The icon also drops its shadow for the final rush (a scaled-up shadow is just a smear, and an expensive one). Same animation, same look — it just gets the phone to itself.

## Beta 1.43 — 2026-10-31

START-UP IMAGE FIX (Andrew spotted it): the still image the phone shows before the app loads had the app icon pasted in as a plain square, while the animated splash that follows it shows the icon with rounded corners and a soft shadow — so the icon flickered square-to-rounded on every cold open. The stills are regenerated to match the animated splash's resting frame exactly: same rounded corners, same shadow, same size, same spot on the screen. Nothing else changes.

## Beta 1.42 — 2026-10-31

START-UP SPLASH (Andrew approved the design from the mockups): opening the app cold now starts on the icon blue with the snowflake icon rising in and "Snow Route" sliding in from the right; the pair hold while the map loads behind them, then the flake rushes at you until its white covers the whole screen and dissolves into the app. The exit waits for the map to be genuinely ready (with a safety release so a dead connection can never trap you behind it), and afterwards the splash is removed entirely — it plays once per cold open and never replays. iPhone still launch images (the frozen frame the phone shows before the app loads) ship for current screen sizes, in the same blue with the same icon, so the still and the animation read as one moment.

## Beta 1.41 — 2026-10-31

PERFORMANCE ROUND (Andrew approved, from the 2026-10-31 performance audit — all five levers, each small and reversible):

- Map constructor: `fadeDuration` 0 → 200, so tiles melt in together instead of snapping in one by one; `pixelRatio` capped at 2 (the phone was rendering all 106 layers at its native ratio 3 — 2.25× the pixels; SDF labels stay crisp); `maxTileCacheSize` 200 and `maxTileCacheZoomLevels` 6, so a zoom sweep and the trip back stay parsed instead of re-drawing.
- Offline preload adds z15 over the route core (15 tiles): display zooms 15–19 all render from z15 tiles, which were never preloaded — the working band was the least cached. drive123 A8 now expects 630 tiles / 894 files.
- Theme-flip diet: `glHideLabels` and `tunePlaceLabels` skip style mutations whose value already matches (the pass runs on every stack build — boot, flips, every marking tap — and each redundant mutation re-triggers symbol placement in the workers); the other theme's sprites pre-warm at boot through the service worker; sprite JSON in the worker is now stale-while-revalidate instead of a 3.5 s network race.
- New drive131 pins the constructor values so none of this silently regresses.

## Beta 1.40 — 2026-10-31
Street names now hand over as you zoom. Zoomed out, the app's own titles
name your streets; as you zoom in they fade out while the map's own road
names fade in along the roads — one set at a time, never doubled. The day
map's road names are darker with a firmer edge, so they stay readable
over the coloured route streets instead of washing out. Also gone: the
dashed guide line that traced over Velmar toward Rutherford — no
reference lines draw on the map anymore.

## Beta 1.39 — 2026-10-31
One official green in the selection pop-up: "Mark completed" now uses
the "Mark both sides" green, so both buttons match exactly.

## Beta 1.38 — 2026-10-31
The rename goes all the way down: the app's internal storage names, its
offline-map storage, and the backup file's ID stamp now use the Snow
Route name too, so the app is fully separate from the old app's storage
(they silently shared it before). Nothing visible changes. Saved data
under the old names is not carried over — there was none to carry (no
cleans recorded, no backups made yet) — and the old offline-map storage
is cleaned off the device on first update; offline maps just need one
fresh download.

## Beta 1.37 — 2026-10-31
The rename reaches everything else: the map's route label, the install
description, and this repo's own docs now say Snow Route, and the GitHub
repo itself is renamed to snow-route-beta (the old link redirects to the
new one). The pre-beta v5-era entries that used to fill this file moved
to docs/archive/CHANGELOG-v5-era.md, kept as history.

## Beta 1.36 — 2026-10-31
The app is renamed: Snow Route Beta in the header, the page title, and
the home-screen/install names (it was "Route 5W Beta" before). The
version label drops its old prefix — it now reads just "Beta 1.36" and
counts up from there until version 1.0. Saved progress, backups, and
offline maps are untouched.

## Beta 1.0–1.35
The earlier beta rounds are recorded in this repo's git log (one merge
per round, each verified by the full test battery on the exact commit).
