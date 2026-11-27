# Prohibition inventory

Every standing prohibition in the repo's guidance, judged one of
two ways: a mechanical check carries it, or it stays prose with
the reason a check cannot establish it recorded. Built in the
standards graft round G-A (2026-11-27). A deferral is a recorded
decision, never a silent drop; a row moves tables only when a
check demonstrably observes it.

Scope: standing source and diff rules in the root guidance and
top-level docs. Behavioural contracts are grouped by invariant
where a source scan cannot establish them. Release history and
individual drive cases are outside this inventory.

## Mechanically checkable

| Rule | Source | Check |
|---|---|---|
| Create the `labelpts` source only in `addRouteTitles`, rewrite its data only in `glUnifyLabels`, never remove it. | DEVELOPMENT_RULES §1 (route titles) | Parts scan source-ownership rule (converted in G-A; owners in parts/app2.js). |
| Test, return, or assign write outcomes, or supply an immediate named reason. | DEVELOPMENT_RULES §1.7 | Parts scan write-outcome check and `write-safe` exemptions (Phase 1). |
| Use shared code for duplicate bodies or group duplicate CSS blocks. | AGENTS rule 3, DEVELOPMENT_RULES §1.7 | Parts scan clone detector, standing pairs and named exemptions (Phase 1). The broader judgment stays prose below. |
| Keep touched comments to 20 words. | AGENTS rule 4 | PR limits judge counts full touched comments (Phase 1). |
| Keep commit additions within the product-line budget unless the PR carries `large-change`. | docs/APPROVAL-POLICY (the label) | PR limits judge checks per-commit additions and the label. |
| Assemble the app from parts with one inline script and one inline style, and keep deployed outputs in parity. | DEVELOPMENT_RULES §1 (source layout), §3 | Build check compares the derived outputs on every PR. |
| Regenerate `parts/pmstyles.js` from the pinned toolchain and vendored input. | DEVELOPMENT_RULES §1 (source layout) | CI regeneration step checks byte parity. |
| Keep the version in CHANGELOG and stamp its copies at assembly. | DEVELOPMENT_RULES §5 | Assembler placeholder and build checks; release counts are derived, not hand-kept. |
| Update drives whose premises the app diff removes, or record the expiry. | DEVELOPMENT_RULES §1.7 | Premise lint (blocking) finds removed literals still asserted by drives. Review covers expiry. |
| Carry current receipts and a covered sibling census, and keep mirrors in sync. | DEVELOPMENT_RULES §1 (push path), docs/TESTING rule 6-8 | Receipts, census, survivors and mirrors gates run in push.py and CI. |
| Generate the shard roster and cover every drive exactly once. | DEVELOPMENT_RULES §3 | Shard coverage guard compares the partition to the drive roster. |
| Keep offline fixture bytes reproducible and pin service-worker cache names and the tile cap. | docs/OFFLINE-CONTRACT | Offline and worker contract selftests check fixture parity and literals. |
| A parts/ change that changes a surface carries the surface map in the same change. | docs/SURFACE-MAP, DEVELOPMENT_RULES §1.8 | Census gate surface-map check (converted in G-A, coarse form: any parts/ change requires the map). |

The source-ownership rule set is deliberately small. Direct
dot-notation `addSource` and `removeSource` calls and chained
`getSource(...).setData(...)` calls with the literal name
`labelpts` are checked. Aliases, computed names, bracket
notation, indirect calls, and how often an allowed call executes
stay outside the static check. The owner names come from the
contract in DEVELOPMENT_RULES. The rule has zero exemptions,
and the clone baseline cannot suppress it.

## Stays in prose

| Rule | Source | Why a source or diff check cannot establish it |
|---|---|---|
| Keep one concern per change and avoid scope creep or unrelated refactoring. | AGENTS rule 1, DEVELOPMENT_RULES §1.5 | Paths and line counts cannot establish intent or whether changes share a concern. |
| Omit unreachable cases and unrequested features. | AGENTS rule 2 | Product reachability depends on runtime state, and requested scope comes from the task. |
| Prefer composition wherever a shared helper or grouped selectors would work, and justify refactors. | AGENTS rule 3 | Similar-looking bodies can have independent responsibilities, and semantic duplication can use different syntax. |
| Comments explain why and history goes in CHANGELOG. | AGENTS rule 4 | Word count and prohibition markers cannot distinguish rationale, history, and legitimate dates or identifiers. |
| Plan, inspect dependencies, assess risks, update stale docs, and run the applicable drives before pushing. | AGENTS rule 6, DEVELOPMENT_RULES §1 | Prior review, doc relevance, and test execution require evidence outside the diff. |
| Use the approved PR, push, label, review, merge, deployment, and rollback paths. | DEVELOPMENT_RULES §1, §3, §5; docs/APPROVAL-POLICY | Permissions, review evidence, and live state are external. |
| Flip route titles only through the flag, and leave title visibility alone outside the create backdrop. | DEVELOPMENT_RULES §1 (route titles) | Layer IDs and backdrop exceptions depend on runtime paths. |
| Keep route geometry and storage isolated, use the board and history owners, and keep restore planning free of writes. | docs/ARCHITECTURE, DEVELOPMENT_RULES §4 | Aliases and runtime state determine effects. |
| GPS suggestions cannot mark streets, and coverage thresholds require reproducible evidence to change. | DEVELOPMENT_RULES §4 | Marking depends on the runtime call path, and test evidence lives outside the diff. |
| Keep the debug toggle and awake setting session-only. | docs/STORAGE-SCHEMA | A write can reach storage through generic serializers or computed keys without naming the field at the call site. |
| Preserve compatibility, fill missing migration data, default corrupt values, and verify restore and rollback. | DEVELOPMENT_RULES §4, docs/STORAGE-SCHEMA | Version and failure order require execution. |
| Keep offline pack entries out of browsing eviction and certify migration only after verification. | docs/OFFLINE-CONTRACT | Cache selection and certification depend on asynchronous results and cache contents. |
| Keep offline expectations independent of app code and review fixture changes only with a contract bump. | docs/OFFLINE-CONTRACT | Reproducible bytes cannot establish oracle independence or that review occurred. |
| Keep the worker from reloading the open page, and preserve the viewport gesture behavior. | docs/ARCHITECTURE | Browser lifecycle and gesture outcomes require execution. |
| Propagate page errors, pass only literal `true`, and retry only the browser launch. | DEVELOPMENT_RULES §1 (harness contract) | Syntax alone cannot establish the runner's verdict and retry behavior. Runner fixtures exercise it. |
| Prove changes with effective fixtures, enumerate reset scope, and wait for terminal signals. | docs/TESTING | Receipt quality, reset overlap, and terminality require judgment. |
| Bump only for a qualifying release and report only evidence observed on the tested head. | DEVELOPMENT_RULES §5, §6 | Release significance and run evidence require review. |
| Give the cause and corrective action in failure diagnostics. | DEVELOPMENT_RULES (gate diagnostics) | Text alone cannot establish that the stated cause and action are accurate. The convention's presence is checked by review. |

## ESLint scope

ESLint checks classic browser scripts in `parts/`, ES modules in
`scripts/` and `tests/`, and CommonJS files in the Node trees. It
enables `no-debugger` and `no-dupe-args`. `no-undef` without an
assembly-aware scope model would flag cross-part bindings, and
`no-unused-vars` would treat declarations consumed by later parts
or browser drives as unused. Both are omitted. CI uses an exact
ESLint version through `npm exec` because there is no root
package manifest. Run the same command from the repo root:

```sh
npm exec --yes --package=eslint@9.39.1 -- eslint 'parts/*.js' '{scripts,tests}/**/*.{js,cjs,mjs}'
```

First real run (2026-11-27, G-A port): 0 errors. One warning -
an unused eslint-disable directive inside the vendored maplibre
copy under tests/browser/.sw-fixture, whose bytes are a pinned
fixture and are not edited for lint cosmetics.
