# Type-safety rollout - COMPLETE

Status: complete as of S1-FINISH (2026-11-27). The base program covers
all 16 parts at zero errors, and the strict-null gate covers the five
storage parts at zero errors with the remaining backlog capped.

The app parts form one classic script. Persisted shapes live in
[the storage schema](STORAGE-SCHEMA.md) and in `scripts/app1-types.d.ts`.
Where an included part needs a binding from another part, the surface it
uses is declared in section 2 of that file with the owning file named;
a section-2 mirror is removed in the same change that includes its
owning part. Section 2 now holds only the two `create-citydata.js`
mirrors (`crPackIndexLoad`, `crPackLoad`), kept because the creation
flow's callers still read them across the part boundary.

## The base program (landed, stages 1-3)

`scripts/tsconfig.json` includes all 16 parts (`data.js`, `app1.js`,
`engine.js`, `pmstyles.js`, `app4.js`, `create-packs.js`, `app3.js`,
`app5.js`, `create-save.js`, `create-cache.js`, `create-fetch.js`,
`create-citydata.js`, `create-pick.js`, `app2.js`, `whatsnew.js`,
`brand-snow.js`) with `strict: false`, `noImplicitAny: true`,
`strictNullChecks: false`, and reports zero errors. CI runs it as the
step "Type check (all 16 parts; noImplicitAny on - scope in
scripts/tsconfig.json)".

The rollout order followed the save-family calls, Web Storage reads and
writes, and IndexedDB transaction owners. `app3.js` (stage 2b) landed
last, in S1-FINISH: it was blocked on dead code - `_fxEncodeEntry`, a
second fixlog encoder that was never called and whose own helper
`_fxScalar` was defined nowhere. The dead function was deleted (proof
of deadness in the round's RECORD), S1's banked annotation patch was
applied, the 38 app3 section-2 mirrors were retired, and the file
joined the program at zero errors.

## The strict-null gate (landed, stage 4 - as built)

The design sketched during planning (a separate
`tsconfig.storage.json` covering five parts) was superseded by the
wiring S1 shipped: `scripts/tsconfig.snc.json` extends the base config
with `strictNullChecks: true` over all 16 parts, and
`scripts/check-snc.py` gates the result in CI as the step "Strict-null
check (storage files clean; global backlog capped)":

- The storage set - `app4.js`, `create-packs.js`, `app3.js`,
  `app5.js`, `create-save.js` - must carry zero strict-null
  diagnostics. `app3.js` joined the set in S1-FINISH, its 90
  diagnostics burned to zero with annotation only (casts, JSDoc
  widenings, and type predicates on the fixlog codec's finiteness
  guards); no runtime token changed.
- The diagnostics in the remaining parts form a capped backlog:
  `CEILING = 196` in `scripts/check-snc.py`. The measured set after
  S1-FINISH is byte-identical to the pre-round set - the honest
  `dispShownPos` return type briefly added two diagnostics in
  `app2.js`, burned in the same round. The cap only ever moves down:
  a future round that burns backlog lowers it to the new measured
  value in the same change.

## Schema gaps - resolved

The plan's open gap is closed. `snowroute.prep.v1` was documented as a
flag, but the part source only ever declared its key in `LS_GLOBAL` -
no code read or wrote the key at any point. S1-FINISH deleted the dead
declaration (`LS_GLOBAL.prep`). The key stays documented in
STORAGE-SCHEMA.md as a historical key that may sit in legacy profiles;
nothing reads it, and the offline e2e setup removes it defensively.
There is no record shape to type.

## What remains

Nothing in this plan. Burning the 196-diagnostic strict-null backlog
in the non-storage parts is future work under the cap rule above, one
part at a time, each landing with its own round.
