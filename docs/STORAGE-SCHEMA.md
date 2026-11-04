# Storage Schema — the data contract

Status: **contract**. Changing any key name, value shape, or the missing-key
policy requires a documented migration, migration tests, and Andrew's
approval (DEVELOPMENT_RULES.md §4). All values live in `localStorage` under
the serving origin. Formats below were verified against the app source and
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

## Keys (tails; read `snowroute.5w.<tail>` for Route 5W)

| Tail | Content | Shape |
|------|---------|-------|
| `v2` | Completed streets (derived cache) | JSON array of street names. Re-derived from `v5.sides` at every load; a non-array value is ignored, never fatal (audit F-3). |
| `v2.times` | Completion time per street | JSON object `{street: ISO time}`. |
| `v2.history` | Archived cleans, oldest first, max 10 | JSON array of history entries (below). Load sanitizer drops malformed entries. |
| `v4.notes` | Per-street notes and flags | JSON object `{street: [ {k, at, text?}, … ]}`; `k` is `note` or a flag kind (`car`, `hazard`, `missed`, `salt`). |
| `v4.via` | How each street was marked | JSON object `{street: string}`. |
| `v4.trail` | GPS trail, all sessions (recorded only during a run) | JSON array of `[lat, lng, epochSeconds]` triples; sanitizer enforces finite, in-range values. |
| `v5.sess` | GPS session markers (Beta 1.71) | JSON array of epoch-second clean-start times, sorted and de-duplicated; written when a clean starts, cleared with the trail. Restore rule (Beta 1.73, audit C06 — applied per route since 1.76): a restore that replaces a route's trail but carries no markers for it clears that route's markers as part of the restore (they describe the replaced trail); a restore without that route's trail leaves its markers untouched. The clear is written, verified and rolled back like every other restore entry. |
| `v4.cov` | Coverage sample indexes per street | JSON object `{street: [integers]}`; each index must be an integer in `[0, samples)` — enforced at load (audit F-2). |
| `v5.start` | Run start | Raw epoch-milliseconds digit string (not JSON). |
| `v5.flip` | Legacy flip flag | Retained for format compatibility; unused by the beta (flip was removed in Beta 1.14). Still backed up. |
| `v5.sides` | **Source of truth for progress** | JSON `{p: {street: [0..3 per stretch]}, t: {street: {stretchIdx: [timeA, timeB]}}}`. Values are bit flags: 1 = side A, 2 = side B, 3 = both. Load normalizes values to 0..3 (audit G-3). |
| `v5.snap` | Pre-Start snapshot for Cancel (Beta 1.94, audit SR-193-02) | JSON `{at, pieces, pieceTimes, done, times, via, cov}` — the board as Start found it, stamped with the run's start time (`at` === `v5.start`). Written at Start, deleted by Finish and by Cancel. A resumed run's Cancel restores from it when `at` matches the live run; it is transient working state — not backed up, not migration-copied. |
| `v2.migrated` | Migration completion marker (Beta 1.94, audit SR-193-03) | The string `'1'`, written only after every legacy field the slot should hold is verified present in it (see Migration). Its presence is the ONLY thing that makes the slot authoritative; without it the legacy keys stay authoritative and the move retries. Not backed up. |
| `v5.preload` | Preload record `{at, saved, total}` (local only) | Per-route; not backed up. |

Global keys: `snowroute.v2.night` + `snowroute.v2.nightExp` (the theme
override pair, Beta 1.77: since 1.77 the day/night theme is automatic by
sunrise/sunset, computed on-device; `night` holds a manual override
('1'/'0') and `nightExp` the epoch-ms of the next sun boundary, at which
the override hands back to automatic. Both are cleared on a fresh app
session — a sessionStorage marker (`snowroute.session`) is what tells a
reload inside the session from a cold open — and both are backed up,
travelling together; an override restored without its expiry is read as
expiring at the next boundary),
`snowroute.v5.export` (last export summary; local only, not backed up),
`snowroute.prep.v1` (offline-prep flag; local only, not backed up),
`snowroute.v5.packmig` (Beta 1.94: set once the pre-1.94 downloaded map
pack has been copied into its own cache — see ARCHITECTURE.md, Offline;
local only, not backed up).

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

## History entry

`{at, items, via, notes, sides, km, startedAt, path?}` — `items` maps street →
completion ISO time or null; `notes` and `sides` are deep snapshots taken at
Finish; `path` is the thinned GPS path (optional). An entry archives ONLY when
a run finishes with ≥ 3 streets; the store caps at 10 entries, evicting
non-full runs first (full = every street in the route pack — 34 for
Route 5W; the count is derived from the pack, never restated — Beta 1.94,
audit F-01).

## Backup envelope

**v2 (current):** `{app: 'snowroute-backup', v: 2, at, routes, night?, nightExp?}` where
`routes` maps each route id to an object of field name → raw stored string,
the field names being `done, times, hist, notes, via, trail, cov, start,
flip, sides, sess` (the 11 stored fields; the per-route preload record is
not backed up), and `night` is the raw global night value when present. Export reads every field raw; **any failed read fails
the whole export** (audit 1.48 B04) rather than emitting a partial backup.

**v1 (restore-only):** `{app: 'snowroute-backup', v: 1, at, data}` where
`data` maps the 12 legacy key names to raw strings. Restoring a v1 backup
writes into the **5W slot** (legacy name → slot field), with `night` taken
from `data['snowroute.v2.night']`. **Missing-key policy (both versions):** a
field absent from the backup leaves the current value untouched on restore.
A legacy done value that is a bare object migrates to the sides-derived set
(street-name filtered). A v2 backup naming an unknown route id is rejected
whole. Two Beta 1.94 hardenings: **export** first reconciles the primary
save (and the auxiliary flush) and fails whole if either cannot land, so a
backup can never carry a staler board than the one on screen (audit
SR-193-01, extending 1.93's R02); and a **restore** counts street names
in the backup that the route does not know and reports the count in its
result message, instead of the loaders dropping them silently (audit
F-05). The transient fields (`v5.snap`, `v2.migrated`) are never part of
a backup.

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

## Versioning rules

- A format change ships as: this document updated, a loader that reads BOTH
  the old and new shapes, a migration on first load, and regression tests for
  both directions (old data loads; new data round-trips).
- Writers never emit a shape the previous release's loaders would crash on
  without a version bump of the envelope (`v`) or key suffix.
- Corrupt values degrade to empty/default at load — never to a boot crash.
