# Type-safety rollout

The app parts form one classic script. Use [the storage schema](STORAGE-SCHEMA.md)
for persisted shapes and keep those shapes in `scripts/app1-types.d.ts`.
Remove a section-2 mirror in the same change that includes its owning part.
Where an included part needs a binding from an excluded part, declare only
the surface it uses and name the owning file.

## Stage one and base-program expansion

Stage one enables `noImplicitAny` for the four files already covered.
Subsequent steps extend that program in the order below. The order follows
the save-family calls, Web Storage reads and writes, and IndexedDB transaction
owners. The last-area suggestion has lower priority than route
definitions and saved run state.

Each row lands with a refreshed Type check scope label/comment in
`.github/workflows/checks.yml` and a zero-error CI run of
`cd scripts && ./node_modules/.bin/tsc -p tsconfig.json`. The draft leaves
the workflow edit for the builder.

| Step | Files joining and reason | Flags | Section-2 mirrors to remove |
| --- | --- | --- | --- |
| 1 | Current set (`data.js`, `app1.js`, `engine.js`, `pmstyles.js`). Establish the baseline around the shared save and slot-migration helpers. | `strict: false`, `noImplicitAny: true`, `strictNullChecks: false` | None |
| 2a | `app4.js` + `create-packs.js`. Restore validates, writes, rolls back both stores Its IndexedDB counterpart joins too: both sides of the verified writes, the legacy drain. | Same as 1 | `ICONS`; any interim `create-packs.js` mirrors |
| 2b | `app3.js`. Start, Finish, and Cancel persist live run state, the history transaction, distance counters, fixlog. | Same as 1 | `SAMPLES`, `buildSamples`, `lastGood`, `saveSnap`, `saveFixLog`, `persistRunDist`, `bankRunDistMirror` |
| 2c | `app5.js`. Route switch flushes the outgoing slot, route deletion sweeps its keys, and pack migration verifies the shared cache. | Same as 1 | `applyNight` |
| 2d | `create-save.js`. Checks the creation flow's one verified pack write and its preload and last-area metadata. | Same as 1 | None currently |
| 3a | `create-cache.js`. Owns IndexedDB I/O for city shapes, which can be downloaded again if lost. | Same as 1 | None currently |
| 3b | `create-pick.js` + `create-fetch.js` + `create-citydata.js`. Check the remaining creation flow together, including last-area reads and writes and the inputs to the city cache. | Same as 1 | None currently |
| 3c | `app2.js`. Check the main UI, selection, and basemap integration once their persistence dependencies are covered. | Same as 1 | `routeBox`, `ROUTE_TILE_NAMES`, `map`, `setBasemap`, `selSet`, `selStretch`, `glUnifyLabels` |
| 3d | `whatsnew.js` + `brand-snow.js`. Finish with release data and decoration. | Same as 1 | None currently |

Remove any additional interim mirrors when their owning files join, even in
rows where the draft lists none.

## Stage two nullability check

After step 2d, prepare the five storage/restore parts in
`scripts/tsconfig.storage.json` for a second CI command,
`cd scripts && ./node_modules/.bin/tsc -p tsconfig.storage.json`. This config
inherits `strict: false` and `noImplicitAny: true`, overrides the include
list, and turns on `strictNullChecks`. Wire it in as a separate Type check
step once both programs report zero errors. Update the base Type check scope
label/comment and name the strict-null scope in the new step.

Type the backup decoder, slot field maps, write sets, rollback snapshots,
IndexedDB results, run and fixlog state, migration evidence, and save
outcomes before wiring it in. Preserve distinctions between a missing key,
an explicit idle assertion, and a failed read. Narrow nullable values at
the existing guards and review any unguarded use before changing behavior.

The storage program excludes app1 source, whose storage helpers remain
checked by the base program. Add storage-program-only cross-part
declarations for the helpers and other excluded owners the five files
actually use. Keep these declarations out of the base program, include them
explicitly in the storage config when wiring it in, and avoid mirrors of
owners included in the storage program. As an owner joins the base program,
move any mirror still needed by the storage program to that program's
declarations.

Keep the ES2022-only library to avoid the app's `history` collision.
Update the handcrafted browser declarations to represent nullable lookups,
file inputs, and IndexedDB results. For DOM IDs guaranteed by
`parts/head.html`, use a verified fixed-ID overload or an annotated helper
whose callers honor that guarantee. General lookups must retain
`AppElement | null`. Share declarations where the two programs use the
same browser surface. Run both CI commands at each subsequent include step.

## Schema gaps

The partial-pack migration census is code-only. The schema documents the
pack-migration fingerprint separately. The schema calls `snowroute.prep.v1`
a flag, and the part source only declares its key. There is no record shape
to type until the builder identifies a historical format that still needs
support.
