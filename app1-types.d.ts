// Type declarations for the A1 pilot (Beta 1.149, Improvement Tranche 5):
// JSDoc + checkJs over parts/app1.js ONLY (tsconfig.json in this folder is
// the whole scope - no other part is checked, and this file is never
// assembled into the page; scripts/assemble.py's PARTS list is untouched).
//
// Three kinds of declarations live here, kept apart on purpose:
//
// 1. STORAGE + GEOMETRY TYPEDEFS. The core shapes are taken from
//    docs/STORAGE-SCHEMA.md, the data contract: the storage outcome
//    {ok, failedKey, retryPending} (the Phase 3 contract the schema's
//    save-family records travel in), the v5.snap snapshot, the pack shape
//    (PACK_FIELDS, Beta 1.118/1.131 sections), the history entry, the
//    v5.sides record, the v4.notes entry and the snowroute.v2.settings
//    record. Where a field exists in the code but NOT in the schema it is
//    marked CODE-ONLY below instead of being silently schema-claimed:
//    HistoryEntry.runId (stamped by finishRun, app3, Beta 1.104) is absent
//    from the schema's History entry line - that gap is recorded in the
//    tranche's SHIP-RECORD-A1.md, not papered over here.
//
// 2. CROSS-PART GLOBALS. app1.js is one part of a single assembled classic
//    script, not a module: it consumes bindings declared by later parts.
//    Each declaration below mirrors the real declaration in its home part
//    (named in its comment) - nothing here invents a shape the owning part
//    does not actually hold.
//
// 3. BROWSER SURFACE. The stock DOM lib is deliberately NOT loaded (the
//    tsconfig's lib is ES2022 only): its global `history` models
//    window.History, but in this assembled script the bare name `history`
//    is app1's own top-level `let history` (the archived cleans), which
//    shadows window.history for the whole script - the DOM lib therefore
//    reports a false redeclare plus a cascade against the app's binding.
//    So this file declares exactly the browser surface app1.js uses, with
//    the shapes it uses: the elements app1 asks for by id all exist in
//    parts/head.html and are dereferenced directly (the pilot config runs
//    with strictNullChecks off, so element nullability is not modelled).

// ---- 1. Typedefs (docs/STORAGE-SCHEMA.md unless marked CODE-ONLY) ----

/** A map point as [lat, lng] - the pack/trail coordinate pair used throughout the schema. */
type LatLng = [number, number];

/** Any point whose first two elements are [lat, lng]: distM and ptSegM read only those two, and both plain geometry points and trail triples (which carry a third, time, element) pass through them. */
type AnyPoint = [number, number, ...number[]];

/** A GPS trail point: [lat, lng, epochSeconds] (schema, v4.trail row). */
type TrailPoint = [number, number, number];

/** Street geometry as a pack carries it: street name -> segments -> points (schema, pack sections). */
type RoadsMap = { [street: string]: LatLng[][] };

/** A route's bounding box (schema, pack `box`; computeRouteBox's return in app1). */
type RouteBox = { w: number, s: number, e: number, n: number };

/** One stretch's two side stamps, each an ISO time or null (schema, v5.sides `t`). */
type PieceTimePair = [string | null, string | null];

/** Per-street piece-time pairs (schema, v5.sides `t`). */
type PieceTimesMap = { [street: string]: PieceTimePair[] };

/** Per-street side flags, 0..3 per stretch (schema, v5.sides `p`). */
type PiecesMap = { [street: string]: number[] };

/** The v5.sides record, the source of truth for progress: {p, t} (schema, v5.sides row). */
type SidesRecord = { p: PiecesMap, t: PieceTimesMap };

/** The storage outcome every save-family function returns: {ok, failedKey, retryPending} (schema save contract; app1 Phase 3 comment). */
type StorageOutcome = { ok: boolean, failedKey: string | null, retryPending: boolean };

/** A verified-write outcome: the storage outcome plus which failure kind occurred (CODE-ONLY, app1 Phase 4 comment - not a stored shape). */
type TxStorageOutcome = StorageOutcome & { failKind?: string };

/** One transaction step for runTx: a named verified write (its result may carry failKind - runTx reads it) and its undo (CODE-ONLY, app1 Phase 4 comment). */
type TxStep = { name: string, write: () => TxStorageOutcome, undo: () => StorageOutcome };

/** runTx's result: the outcome word, the failing step if any, and its failure kind (CODE-ONLY, app1 Phase 4 comment). */
type TxOutcome = { outcome: string, failedStep: string | null, failKind?: string | null };

/** The v5.snap pre-Start snapshot for Cancel: {at, pieces, pieceTimes, done, times, via, cov} (schema, v5.snap row). */
type Snap = { at: number, pieces: PiecesMap, pieceTimes: PieceTimesMap, done: string[], times: { [street: string]: string }, via: { [street: string]: string }, cov: { [street: string]: number[] } };

/** One per-street note/flag entry: {k, at, text?} (schema, v4.notes row). */
type NoteEntry = { k: string, at: string, text?: string };

/** One archived clean: {at, items, via, notes, sides, km, startedAt, path?} (schema, History entry section). runId is CODE-ONLY (Beta 1.104, app3 finishRun) - the schema's History entry line does not list it. */
type HistoryEntry = { at: string, items: { [street: string]: string | null }, via: { [street: string]: string }, notes: { [street: string]: NoteEntry[] }, sides: SidesRecord, km: number, startedAt: string | null, path?: TrailPoint[], runId?: number };

/** A route pack as validated/carried (schema, Beta 1.118 + PACK_FIELDS sections): the fields of PACK_FIELDS in app1. */
type RoutePack = { name: string, area: string, main: string[], spot: { [street: string]: number[] }, tileNames: string[], box: RouteBox | null, roads: RoadsMap, reference: RoadsMap };

/** The stored snowroute.v2.settings record: {vib, chime, chimeSound} (schema, global keys). */
type SettingsRecord = { vib: boolean, chime: boolean, chimeSound: string };

/** The in-memory settings state: the stored record plus the session-only awake flag (schema, Beta 1.112 note). awake is modelled optional because the stored record never carries it - loadSettings builds the record fields first and attaches awake (forced OFF) before returning, so every value loadSettings returns does carry it. */
type SettingsState = SettingsRecord & { awake?: boolean };

/** One connected run of a street's geometry, as computeStretches builds it (CODE-ONLY geometry shape, app1 Beta 1.144 comment). */
type StretchRun = { line: LatLng[], cum: number[], total: number, parts: LatLng[][] | null };

/** A street's built stretch geometry (CODE-ONLY, app1 computeStretches comment). */
type Stretch = { line: LatLng[], cum: number[], total: number, parts: LatLng[][], runs: StretchRun[] };

/** All streets' stretch geometry by name. */
type StretchMap = { [street: string]: Stretch };

/** A route slot's storage keys as routeKeys builds them: every value is a full localStorage key (schema, Layout section). */
type RouteKeys = { done: string, times: string, hist: string, notes: string, via: string, trail: string, cov: string, start: string, flip: string, sides: string, sess: string, pre: string, snap: string, mig: string, migfill: string, finclean: string };

/** sunTimes' return: the day's sunrise/sunset as epoch ms, null when the sun never rises or sets that day (CODE-ONLY, app1). */
type SunTimes = { rise: number | null, set: number | null };

// ---- 2. Cross-part globals (home part named per declaration) ----

/** app2.js: `let routeBox = null` - the active pack's bounding box, set by buildGeometry (app1) on every load. */
declare var routeBox: RouteBox | null;

/** app2.js: `const ROUTE_TILE_NAMES = []` - refilled in place by buildGeometry (app1) on every load. */
declare var ROUTE_TILE_NAMES: string[];

/** app3.js: `const SAMPLES = {}` - per-street coverage sample points, refilled by buildSamples. */
declare var SAMPLES: { [street: string]: LatLng[] };

/** app3.js: rebuilds SAMPLES from the live geometry; called by buildGeometry (app1). */
declare function buildSamples(): void;

/** app3.js: `let suggested = new Set()` - the run-scoped coverage suggestion set; app1 rebinds it in completeFinishCleanup. */
declare var suggested: Set<string>;

/** app3.js: the last accepted GPS fix {ll, at}, or null before any fix. */
declare var lastGood: { ll: number[], at: number } | null;

/** app4.js: repaints the day/night theme; called by themeTick (app1) at a boundary. */
declare function applyNight(): void;

/** app2.js: the MapLibre map instance or null. The pilot does not model MapLibre's API - app1 only null-tests the binding and passes it nowhere - so it is typed as any rather than given an invented class shape. */
declare var map: any;

/** app2.js: re-applies the basemap style after a theme flip; called by themeTick (app1). */
declare function setBasemap(): void;

/** app3.js: persists the pre-Start snapshot (LS.snap); retried by flushAux (app1). Returns the storage outcome. */
declare function saveSnap(): StorageOutcome;

/** app2.js: the current stretch selection entries {name, idx, anchor}. app1 only forwards the array through GL_HOST's getter and never reads an entry's fields, so the entries are not field-typed here. */
declare var selSet: any[];

/** app2.js: `let selStretch = null` - the anchor selection {name, idx} the paint engine reads. */
declare var selStretch: { name: string, idx: number } | null;

/** app2.js: normalizes basemap label layers for a map; app1 only forwards the function through GL_HOST's getter. Its map parameter is MapLibre's, unmodelled in this pilot (see `map` above). */
declare function glHideLabels(m: any): void;

// ---- 3. Browser surface actually used by app1.js ----

/** The classList surface app1 uses. */
interface AppClassList {
  add(...classes: string[]): void;
  remove(...classes: string[]): void;
  contains(c: string): boolean;
  toggle(c: string, force?: boolean): void;
}

/** An element as app1 uses it: text content and its class list. */
interface AppElement {
  textContent: string;
  classList: AppClassList;
}

/** The Web Storage surface app1 uses (localStorage / sessionStorage). */
interface AppStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

declare var document: {
  getElementById(id: string): AppElement;
  body: AppElement;
  addEventListener(type: string, listener: () => void): void;
  visibilityState: string;
};

declare var window: {
  visualViewport: { height: number } | null;
  innerHeight: number;
  addEventListener(type: string, listener: () => void): void;
};

declare var localStorage: AppStorage;
declare var sessionStorage: AppStorage;

declare function setTimeout(fn: () => void, ms?: number): number;
declare function clearTimeout(id: number): void;
declare function setInterval(fn: () => void, ms?: number): number;
