# Storage Schema — the data contract

Status: **contract**. Changing any key name, value shape, or the missing-key
policy requires a documented migration, migration tests, and Andrew's
approval (DEVELOPMENT_RULES.md §4). Values live in `localStorage` under
the serving origin, with TWO IndexedDB exceptions, each documented in its
own section below: the city shape cache (Beta 1.121 — a re-downloadable
cache, not user data) and the created-route store (Beta 1.166 — user data:
the created-route definitions moved out of localStorage). Formats below were verified against the app source and
the loaders' sanitizers; the slot layout and backup v2 landed in Beta 1.76
(2026-11-02).

## Layout: per-route slots + globals (Beta 1.76)

Every route owns a storage slot: `snowroute.<routeId>.` followed by a field
tail. Route 5W (id `5w`) is the first tenant. A few keys are **global** —
they describe the app, not a route — and keep their historical names:
`snowroute.v2.night` (+ its `nightExp` pair), `snowroute.v5.export`,
`snowroute.prep.v1`, `snowroute.v5.packmig`.

The pre-1.76 layout is the same tails under a bare `snowroute.` prefix
(e.g. `snowroute.v5.sides`). Those keys are now the **legacy fallback copy**
for Route 5W (see Migration).

Beta 1.117 (route separation): switching routes never moves or rewrites
another route's slot. A switch first flushes the outgoing route's pending
writes into its own slot, then loads the target slot read-only. A run in
progress survives a switch exactly as it survives a reload: its records
(including the persisted `v5.snap`) stay in its slot untouched — only the
in-memory copy of the snapshot is dropped, so a Cancel performed after
switching back validates the persisted snapshot, precisely the
post-reload path.

Beta 1.118 (created routes): one more global record,
`snowroute.v2.userpacks` = `{<routeId>: <pack>}` — the definitions of
routes Andrew created in the app (shipped packs live in `parts/data.js`,
never in storage). At boot the record's packs are validated
(`normalizePack`) and merged into the runtime pack list — a created pack
wins an id collision; the fields a pack may carry are defined once in
`PACK_FIELDS` (app1), and `normalizePack` builds from that list
(Beta 1.131); created ids are slugs generated from the route
name, uniqueness-checked against shipped + created ids, so collisions
do not arise from the app itself. A created route's own data lives in
its ordinary per-route slot (`snowroute.<id>.` + tails), exactly like a
shipped route's. A pack in the record that fails validation is skipped
at boot, never half-loaded; its record entry and slot stay untouched.
One more global rides along: `snowroute.v2.lastarea`, the create flow's
last-used area (a name-it pre-fill memory, nothing more).

Beta 1.166 (created routes move to IndexedDB): the definitions record
above is the LEGACY home. The definitions now live in the IndexedDB
store documented below (IndexedDB: created routes); `snowroute.v2.userpacks`
survives only as the pre-1.166 record — read at every boot while one is
present (it wins per id over the store copy while it stands), drained
into the store on the first 1.166 launch, and deleted once the drain's
parity check passes (the marker `snowroute.v2.userpacks.migrated` —
below). A created route's own data still lives in its ordinary
per-route slot, unchanged.

Beta 1.127 (sectors): NO storage change. Sector selections made
while creating live only in the creation draft (in-memory); the
saved pack's `roads[name]` simply contains the chosen sectors'
segment lists — the pack format itself is unchanged (roads =
segment lists, as since 1.117), so a trimmed route is stored,
backed up, restored and switched exactly like any other, and no
migration exists or is needed.

Beta 1.124 (route deletion): deleting a created route removes its
entry from `snowroute.v2.userpacks` and deletes EVERY key of its
per-route slot — the full `routeKeys(id)` family (all `ROUTE_FIELDS`
tails plus `v5.snap`, `v2.migrated`, `v2.migfill` and `v5.preload`), enumerated
from `routeKeys` at deletion time rather than hand-listed, so a
field added later joins the sweep automatically. The userpacks
removal is the gated step: it goes through a strict read and a
verified write, and on any failure nothing else is touched — the
route stays listed with its slot intact. Shipped packs cannot be
deleted (no entry exists in the record, and the deletion path
refuses shipped ids). If the deleted route was the active one, the
app returns to the boot-picker state; its slot keys are gone either
way. Two neighbours deliberately survive a deletion: the IndexedDB
city cache (keyed by CITY, not route — the next route in that city
reuses it) and `snowroute.v2.lastarea` (a city name, not a route
reference). The offline pack-migration fingerprint is computed
from the live pack list, so a deletion un-certifies the previous
union download; the cached tiles themselves are not removed.
Beta 1.166: the userpacks removal described above is now a verified
IndexedDB store delete plus the removal of any not-yet-drained legacy
shadow copy (a shadow-removal failure restores the store entry and the
deletion refuses); the gate's strictness and refusal semantics are
unchanged.

## Keys (tails; read `snowroute.5w.<tail>` for Route 5W)

| Tail | Content | Shape |
|------|---------|-------|
| `v2` | Completed streets (derived cache) | JSON array of street names. Re-derived from `v5.sides` at every load; a non-array value is ignored, never fatal (audit F-3). |
| `v2.times` | Completion time per street | JSON object `{street: ISO time}`. |
| `v2.history` | Archived cleans, oldest first — UNCAPPED since Beta 1.167 (was max 10 through 1.166) | JSON array of history entries (below). Load sanitizer drops malformed entries. |
| `v4.notes` | Per-street notes and flags | JSON object `{street: [ {k, at, text?}, … ]}`; `k` is `note` or a flag kind (`car`, `hazard`, `missed`, `salt`). |
| `v4.via` | How each street was marked | JSON object `{street: string}`. |
| `v4.trail` | GPS trail, all sessions (recorded only during a run) | JSON array of `[lat, lng, epochSeconds]` triples; sanitizer enforces finite, in-range values. |
| `v5.sess` | GPS session markers (Beta 1.71) | JSON array of epoch-second clean-start times, sorted and de-duplicated; written when a clean starts, cleared with the trail. Restore rule (Beta 1.73, audit C06 — applied per route since 1.76): a restore that replaces a route's trail but carries no markers for it clears that route's markers as part of the restore (they describe the replaced trail); a restore without that route's trail leaves its markers untouched. The clear is written, verified and rolled back like every other restore entry. |
| `v4.cov` | Coverage sample indexes per street | JSON object `{street: [integers]}`; each index must be an integer in `[0, samples)` — enforced at load (audit F-2). |
| `v5.start` | Run start | Raw epoch-milliseconds digit string (not JSON). |
| `v5.flip` | Legacy flip flag | Retained for format compatibility; unused by the beta (flip was removed in Beta 1.14). Still backed up. |
| `v5.sides` | **Source of truth for progress** | JSON `{p: {street: [0..3 per stretch]}, t: {street: {stretchIdx: [timeA, timeB]}}}`. Values are bit flags: 1 = side A, 2 = side B, 3 = both. Load normalizes values to 0..3 (audit G-3). |
| `v5.snap` | Pre-Start snapshot for Cancel (Beta 1.94, audit SR-193-02) | JSON `{at, pieces, pieceTimes, done, times, via, cov}` — the board as Start found it, stamped with the run's start time (`at` === `v5.start`). Written at Start, deleted by Finish and by Cancel. A resumed run's Cancel restores from it when `at` matches the live run; it is transient working state — not a backup field, not migration-copied. Beta 1.96 (SR-195-04): validation also applies the loader's own rule to time VALUES — a completion time or piece stamp that fails `Date.parse` rejects the snapshot, exactly as the loader deletes such times. Beta 1.96 (SR-195-02): a RECOVERY backup may carry a copy of the snapshot as an optional per-route `snap` field (see the backup section) — the key itself is still never a backup field. Beta 1.97 (audit loop CG-196-02): NORMAL backups carry the snapshot the same way, through the same construction. Beta 1.95 (SR-194-03): the restore validates the snapshot strictly against the loader's structural rules first — a damaged snapshot is never applied raw; the mark-stamp journal is the fallback and the cancel message says the board was rebuilt. Beta 1.95 (SR-194-01): Finish carries the snapshot into its undo record, and Undo re-persists it as a verified gate, so Finish → Undo → Cancel restores exactly. Beta 1.110: the Undo is removed (Andrew's call) — that carry is gone with it; Finish simply deletes the key, exactly as the first sentences of this cell describe. |
| `v2.migrated` | Migration completion marker (Beta 1.94, audit SR-193-03) | The string `'1'`, written only after every legacy field the slot should hold is verified present in it (see Migration). Its presence is the ONLY thing that makes the slot authoritative; without it the legacy keys stay authoritative and the move retries. Not backed up. |
| `v2.migfill` | Migration fill record (Beta 1.150, security-audit fix round) | JSON `{field: value}` — for each route field, the exact value the legacy migration's most recent landed fill wrote into the slot. It exists only while a migration is incomplete: each verified fill updates it (verified write), and it is deleted when the `v2.migrated` marker commits. On a retry it separates migration-owned fills (a slot value still equal to its record — re-copied when the legacy value has moved on, e.g. a fallback boot saved over it) from values another writer owns (a restore's — they win and their record is dropped). Transient working state — not a backup field, not migration-copied. |
| `v5.finclean` | Finish-cleanup obligation (Beta 1.141, Package A / DA-10) | JSON `{run, at}` — the finishing run's start (or 0) and the finish time; forensic content only, the completion guards are state-based. Written as the FIRST step of Finish's transaction, so a committed finish whose post-commit notes/coverage writes failed carries a durable obligation instead of relying on the in-memory retry flag. Discharged by any fully successful saveAll, and by a successful restore (which replaces the slot's truth wholesale). Completed at load by `completeFinishCleanup` only when no run is live and the loaded board is the cleared post-finish board: `v4.notes` and `v4.cov` are rewritten to `'{}'` as verified writes and the key is deleted. Transient working state — not a backup field, not migration-copied. |
| `v5.rundist` | Run-distance counter (Beta 1.167, B5) | JSON `{run, m, capped}` — the running clean's accumulated GPS distance in metres, accumulated at fix-record time so the archived `km` stays the true run total even when the 8,000-point trail cap truncates the stored trail; `run` is the run's start stamp (a record naming another run is never adopted), `capped` records that the trail splice dropped points from this run. Written at Start and throttled during the run; deleted by Finish (consumed into the archive entry) and by Cancel. Transient working state — not a backup field, not migration-copied. |
| `v5.preload` | Preload record `{at, saved, total, routeSaved, routeTotal}` (local only) | Per-route; not backed up. `saved`/`total` count the whole offline pack (the union manifest — the pack is ONE shared cache). Beta 1.117: `routeSaved`/`routeTotal` count THIS route's own tile subset (its area + route core), so completion is accounted per route; records written before 1.117 lack the pair and read as pack-level only. Delete maps clears EVERY route's record along with the pack. |

Global keys: `snowroute.v2.night` + `snowroute.v2.nightExp` (the theme
override pair, Beta 1.77: since 1.77 the day/night theme is automatic by
sunrise/sunset, computed on-device; `night` holds a manual override
('1'/'0') and `nightExp` the epoch-ms of the next sun boundary, at which
the override hands back to automatic. Both are cleared on a fresh app
session — a sessionStorage marker (`snowroute.session`) is what tells a
reload inside the session from a cold open — and both are backed up,
travelling together; an override restored without its expiry is read as
expiring at the next boundary),
`snowroute.v5.export` (last export summary; local only, not backed up;
Beta 1.111: `noteExported` also stamps an `exportedAt` epoch-ms into the
same record at every successful backup hand-off — the Settings main
pane's "Last backup" line reads it; a cancelled share stamps nothing),
`snowroute.v2.settings` (Beta 1.111, additive — no migration: the
Settings redesign's PERSISTENT device-behaviour toggles as one JSON
object `{vib, chime, chimeSound}`, `chimeSound` one of
`bell|two|rising|pop|melody`; defaults all toggles OFF and `chimeSound`
`'two'`; a corrupt or partial value falls back per-field to the
defaults; read/written only through `loadSettings`/`saveSettings` in
app1. Beta 1.166: the record IS backed up — it rides the v2 envelope as
the top-level `settings` field (see Backup envelope); before 1.166 it
was local only. Beta 1.112: Keep screen awake
(`settings.awake`) is NOT part of this record — it is session-only
in-memory state, forced OFF at every load and never written; a
Beta 1.111 record still carrying an `awake` field is never read for
it),
`snowroute.prep.v1` (offline-prep flag; local only, not backed up),
`snowroute.v5.packmig` (Beta 1.94; semantics hardened Beta 1.95,
SR-194-05/06: set only after the manifest-bounded pack migration has
VERIFIED the pack cache holds everything recoverable from the browsing
cache — a failed copy leaves it unset and the migration retries on the
next boot; see ARCHITECTURE.md, Offline; local only, not backed up).
Beta 1.96 (SR-195-03/07): the stored value is no longer the constant `1`
but a FINGERPRINT of the manifest it certifies (`v1:<count>:<hash>`,
`packMigFingerprint` in app4) — a complete download earns the same
fingerprint. On boot the flag is finally READ: a matching fingerprint
plus a pack census of exactly the manifest count takes a fast path and
skips the verification sweep; any doubt runs (and heals via) the full
pass. The migration's status now also reports prune and flag-write
failures instead of swallowing them. Beta 1.117: the flag certifies the
ONE shared pack cache against the UNION manifest over all known packs —
it is deliberately a global cache certificate, NOT a per-route
completion flag; per-route completion lives in each route's own
`v5.preload` record (above).
`snowroute.v2.userpacks.migrated` (Beta 1.166: the created-route
migration marker — the constant `'1'`, written (and verified) only
after the legacy `snowroute.v2.userpacks` record has drained into the
IndexedDB store with parity re-checked against a fresh full read; the
legacy record is deleted in the same step. Housekeeping only: boot
reads the legacy record whenever one is present, marker or not, so the
marker never gates a read; local only, not backed up).

## Migration: legacy → 5W slot (Beta 1.76; commit rule revised Beta 1.94)

On `loadRoute('5w')`, the `v2.migrated` marker is the commit record
(Beta 1.94, audit SR-193-03). Marker present → the slot is authoritative,
full stop. Marker absent and the legacy `snowroute.v5.sides` exists →
the app fills ONLY the fields the slot lacks (a field already in the slot
is never overwritten — a partially-restored slot can hold NEWER data than
the legacy copy), verifying every fill by read-back; any failed fill
aborts the move (no marker) and the boot reads the **legacy keys**
instead. When every legacy field is verified present in the slot, the
marker is written. Legacy keys are never deleted — they remain the
fallback copy until the marker exists. Earlier designs wiped partial
slot copies on failure (1.76) and treated field parity as the commit
record (1.93, audit R04); both could destroy a newer restored record,
which is what the marker + fill-only rule exists to prevent. The
migration is 5W-only by construction (only 5W has a legacy layout).
Regression coverage: drive145 N11/N12/N12c/N12d/N12e.

## Migration: userpacks record → IndexedDB store (Beta 1.166)

On the first 1.166 launch (and every launch while a legacy record
stands), the created-route definitions move from the single
localStorage record `snowroute.v2.userpacks` into the IndexedDB store
below. The discipline is the house no-wipe rule, the same shape as the
5W slot migration and the 1.150 rk.migfill: (1) the legacy record
registers SYNCHRONOUSLY at boot exactly as before — the app is fully
usable on the legacy data before the store read lands, and the record
remains the fallback read until the migration is verified; (2) the
store registers fill-only (an id the legacy pass registered keeps the
legacy copy — for drained ids the two are content-equal by the parity
check, and a legacy record an older build wrote after a downgrade is
the newer copy, so it wins); (3) the drain copies every legacy route
into the store, each write verified by read-back; (4) parity is
re-checked against a FRESH full store read, and only then is the
marker (`snowroute.v2.userpacks.migrated`) written — itself verified —
and the legacy record deleted (a failed delete is inert: the record
drains again next boot against an already-complete store). A failed or
interrupted drain commits nothing: no marker, the legacy record
untouched, the app fully usable on it, and the drain retries next
launch. A corrupt legacy record is never deleted blind and never
blocks the store half of the boot. Regression coverage: drive183.

## History entry

`{at, items, via, notes, sides, km, startedAt, path?, workM?, totalWorkM?,
geoFP?, pathShortened?}` — `items` maps street → completion ISO time or
null; `notes` and `sides` are deep snapshots taken at Finish; `path` is the
thinned GPS path (optional). An entry archives ONLY when a run finishes
with ≥ 3 streets. **Beta 1.167 (run/pace fix round, B1): the store is
UNCAPPED** — through 1.166 it capped at 10 entries, evicting non-full runs
first (full = every street in the route pack — 34 for Route 5W; Beta 1.94,
audit F-01); all four enforcement points (finish, save, load, restore) were
retired together, and entries are retained whole at any count.
**Beta 1.167 (B2):** entries archived by 1.167+ also carry `workM` (the
run-attributed side-metres Finish measured from the entry's own side stamps
inside the run's window), `totalWorkM` (the route's total side-metres at
Finish) and `geoFP` (a fingerprint of the route geometry as cleaned); pace
computations read `workM` verbatim when present and derive from `sides`
exactly as before when it is absent — pre-1.167 entries are never rewritten.
**Beta 1.167 (B5):** `km` is the run-distance counter's true total (see
`v5.rundist` below), and `pathShortened: true` is set when the 8,000-point
trail cap truncated the saved `path` — the detail view discloses it.

## Backup envelope

**v2 (current):** `{app: 'snowroute-backup', v: 2, at, routes, night?, nightExp?, userpacks?, settings?}` where
`routes` maps each route id to an object of field name → raw stored string,
the field names being `done, times, hist, notes, via, trail, cov, start,
flip, sides, sess` (the 11 stored fields; the per-route preload record is
not backed up), and `night` is the raw global night value when present. Export reads every field raw; **any failed read fails
the whole export** (audit 1.48 B04) rather than emitting a partial backup.

**v1 (restore-only):** `{app: 'snowroute-backup', v: 1, at, data}` where
`data` maps the 12 legacy key names to raw strings. Restoring a v1 backup
writes into the **5W slot** (legacy name → slot field), with `night` taken
from `data['snowroute.v2.night']`. **Missing-key policy (both versions):** a
field absent from the backup leaves the current value untouched on restore
(the one exception is the explicit `start: null` idle assertion above).
A legacy done value that is a bare object migrates to the sides-derived set
(street-name filtered). A v2 backup naming an unknown route id is rejected
whole. Two Beta 1.94 hardenings: **export** first reconciles the primary
save (and the auxiliary flush) and fails whole if either cannot land, so a
backup can never carry a staler board than the one on screen (audit
SR-193-01, extending 1.93's R02); and a **restore** counts street names
in the backup that the route does not know and reports the count in its
result message, instead of the loaders dropping them silently (audit
F-05). Beta 1.95 (SR-194-08): the count is taken from the RAW backup
before any normalization, each unknown name once — object-form done maps
and array-form history items included. Beta 1.95 (SR-194-02): a second
export, the **recovery backup**, shares this envelope with one added
marker (`"recovery": true`): it serializes the live in-memory state of
the active route directly, for the storage-failure moments when the
normal backup refuses by design; it restores through this same path.
The transient fields (`v5.snap`, `v2.migrated`, `v5.finclean`, `v5.rundist`) are never part of
a backup as fields of their own. Beta 1.96 (SR-195-02): a recovery
backup additionally carries the active run's cancel snapshot as an
optional per-route `snap` string (the snapshot object, serialized) when
a run is open; on restore it is written back to the route's `v5.snap`.
Since later in Beta 1.96 (Andrew's one-button design) the recovery
export is also the Backup button's AUTOMATIC fallback: when the normal
backup cannot be built because saving failed, the press produces this
recovery file instead — recovery-marked and recovery-named, with a
result message that says the save could not be done first. There is no
separate Recovery menu option anymore.
key — inside the restore transaction and its rollback scope — only if
it passes `validateSnap` against the start the same backup carries for
that route. Beta 1.118: `userpacks` (when present and non-empty) carries
the created-route definitions — `{<routeId>: <pack>}`, the same objects
as the on-device record. Both exporters (normal and recovery) include
it under strict-read discipline. On restore the definitions are
validated FIRST (shape via `normalizePack`; ids must be slug-shaped and
must NOT collide with a shipped pack — a collision fails the whole
restore closed, since app-generated ids never collide), then written as
ONE entry in the same verified write set — merged over the device's
current record (a restore adds/updates created routes; it does not
delete ones the backup predates) — inside the rollback scope, BEFORE
any route state is applied; the reload that ends every restore
re-registers them at boot before their state is read, and route ids
known only through this field are accepted by the routes loop and the
unknown-name count. Backups without the field (anything written before
1.118) restore exactly as before. Beta 1.166 (the write target moved):
on restore the definitions still validate FIRST, but they now land in
the IndexedDB store: the store values they will overwrite are read
STRICTLY beforehand (an unreadable route refuses the restore before any
write), the definitions land as per-route verified puts in a first
phase ahead of the localStorage write set, any failure rolls BOTH homes
back, restored ids are also removed from any not-yet-drained legacy
record inside the same write set (the legacy copy would otherwise win
at the next boot and shadow the restore), and the exporters read the
definitions from the verified in-memory picture of both homes
(`userPackCache`, create-packs.js) — a boot whose store read failed
fails the strict export whole, and the recovery export tops the picture
up from validated memory. A restore adds/updates created routes; it
does not delete ones the backup predates — unchanged. A carried snapshot that fails validation (or whose run's
start is absent) is dropped and the result message says so. Beta 1.97
(audit loop CG-196-01/-02): ordinary backups carry the field too, and
every route entry in a current-format backup asserts its lifecycle
state explicitly — `start` is always present, as the run's timestamp
string or as `null` for no run. On restore, `start: null` is an idle
ASSERTION, not an omission: the destination's `v5.start` and `v5.snap`
are deleted inside the restore transaction (verified, rolled back on
failure like every entry), so an idle backup restored over an active
run leaves no inherited run behind. A backup that OMITS `start`
entirely (anything written before 1.97) keeps the missing-key rule
below: the destination's run state is left untouched. Beta 1.166:
`settings` (when present) is the Settings record VERBATIM — the raw
`snowroute.v2.settings` string (the recovery export serializes the live
settings object in the same shape). It is additive: builds before
1.166 ignore it, and backups written before 1.166 omit it and leave the
device's toggles untouched (the missing-key rule). On restore it is
validated by `canonicalSettings` (the loader's per-field sanitize
rules, re-serialized canonically; a value that is not a string holding
a JSON object refuses the whole restore before any write) and lands
inside the verified write set, with `snowroute.v2.settings` in the
rollback scope.

## IndexedDB: the city shape cache (Beta 1.121 — a cache, NOT user data)

One IndexedDB database lives beside the localStorage contract above:
`snowroute-citycache` (version 1), object store `cities` (keyPath
`cityName`). It holds the create flow's whole-city street-shape extracts
(Andrew's second gate amendment, audit round pickfetch): when a city is
picked for route creation, its street shapes are downloaded once as a
grid of ~4 × 4 km cells and saved here, so every later creation in that
city is instant.

Record shape: `{ cityName, bbox: {s, n, w, e}, totalCells, savedAt,
cells: { <cellKey>: { at, ways } } }`. `ways` is the cell's streets in
compact parsed form — `[[wayId, streetName, [[lat, lng], ...]], ...]` —
never raw service JSON. A record is valid only for the exact `bbox` it
was saved under; a lookup whose bounding box differs ignores the record
whole. The write side honours the same rule (VERIFY-3, CG-PF-15): a cell
save arriving under a different `bbox` starts the record over instead of
merging into it — the old box's cells are never carried under a new
`bbox`, so the restore-time comparison can never be defeated by the
record's own writes. A record whose serialized size would exceed 60 MB is refused
BEFORE writing (the refusal is disclosed in the create UI); a failed
write (quota, private mode) degrades the cache to session-only with the
same disclosure — the cache never fails silently and never blocks
creation.

Contract status: this store is a **re-downloadable cache**, deliberately
outside the backup envelope and outside the restore transaction —
backups neither carry it nor restore it, and losing it (browser data
clear, eviction) costs a re-download of the city's shapes, nothing
else. It holds no route data, no progress, no user content. Adding it
was approved by Andrew as part of the 1.121 gate amendment
(DEVELOPMENT_RULES.md §4 note: a new storage surface with a documented
schema — this section — and the owner's request as the approval).

## IndexedDB: created routes (Beta 1.166 — user data)

A second IndexedDB database lives beside the cache above:
`snowroute-userdata` (version 1), object store `packs` (keyPath `id`).
It holds the created-route DEFINITIONS — one record per route, the
record being the pack object verbatim (the same object the legacy
record held as its value, `id` included). This is USER data, the
opposite contract from the city cache: it rides every backup (as the
envelope's `userpacks` field), losing it loses the routes themselves,
and it is never re-downloadable. The database is a sibling of the city
cache — not a second store inside it — so the cache's failure domain
(a re-download) never touches user data.

Every write is one short transaction for ONE route, verified by
read-back before its caller proceeds (`upPut`/`upDel` in
parts/create-packs.js; equality is judged on canonical content, since
a structured-clone round-trip is not a byte channel). A save touches
one route and only that route; a failed save refuses that route only,
disclosed, and boot never depends on any created-route write. Boot
registration and the legacy drain are specified in the migration
section above. The synchronous backup export reads `userPackCache` —
the in-memory picture of both homes, updated only at verified commit
points (boot read, save, delete, restore, drain) — so the export's
all-or-nothing discipline survives the store's asynchrony: a boot
whose store read failed leaves the picture provably incomplete
(`upStoreComplete` false) and the strict export refuses, while the
recovery export tops it up from validated memory (the DA-09 rule).
Writers: the create flow's save, route deletion, and backup restore;
readers: boot registration, both exporters. Approved by Andrew
2026-11-10 (the storage fix round) under the same §4 note as the
cache: a new storage surface with a documented schema — this section.

## Restore transaction (invariant)

1. Validate envelope identity, version (1 or 2), and per-field string/shape
   BEFORE writing anything; reject malformed backups whole.
2. Snapshot every key in scope — every known route's slot keys plus the
   global night key; abort honestly if the snapshot cannot be read.
3. Write each key and re-read to verify.
4. On any failure, roll back from the snapshot and verify the rollback; if
   the rollback itself cannot be verified, say so ("could NOT be fully put
   back").
5. Reload with the `restoring` flag set, so the unload flush cannot clobber
   the restored data. Nested content is sanitized by the loaders on that
   reload (documented design, audit G-2).
6. Beta 1.166: when the backup carries created-route definitions, the
   transaction gains a store phase — the overwritten routes' current
   store values are snapshotted strictly in step 2 (an unreadable one
   aborts the restore), the definitions are written as per-route
   verified puts in step 3 BEFORE the localStorage write set, and a
   failure in either home rolls BOTH homes back under step 4's rule.

## Versioning rules

- A format change ships as: this document updated, a loader that reads BOTH
  the old and new shapes, a migration on first load, and regression tests for
  both directions (old data loads; new data round-trips).
- Writers never emit a shape the previous release's loaders would crash on
  without a version bump of the envelope (`v`) or key suffix.
- Corrupt values degrade to empty/default at load — never to a boot crash.
