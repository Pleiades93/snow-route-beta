# Changelog

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
