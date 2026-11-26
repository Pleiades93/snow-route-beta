// Type declarations for the type check (begun as the A1 pilot, Beta
// 1.149, Improvement Tranche 5): JSDoc + checkJs over the parts listed
// in tsconfig.json in this folder (the whole scope - a part is checked
// iff it is listed there; this file is never assembled into the page;
// scripts/assemble.py's PARTS list is untouched). The scope expands
// part by part (retro-fixes round, 2026-11-14): when a part joins the
// include list, its section-2 mirrors below are REMOVED in the same
// change - the part's real declarations govern, and a mirror left
// behind reports a false redeclare against them.
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
//    So this file declares exactly the browser surface the checked parts
//    use, with the shapes they use: the elements app1 asks for by id all exist in
//    parts/head.html and are dereferenced directly (the pilot config runs
//    with strictNullChecks off, so element nullability is not modelled).

// ---- 1. Typedefs (docs/STORAGE-SCHEMA.md unless marked CODE-ONLY) ----

/** A map point as [lat, lng] - the pack/trail coordinate pair used throughout the schema. */
type LatLng = [number, number];

/** Any point whose first two elements are [lat, lng]: distM and ptSegM read only those two, and both plain geometry points and trail triples (which carry a third, time, element) pass through them. Typed as a plain number array (retro-fixes round, 2026-11-14): the geometry code builds points dynamically, so the checker cannot prove tuple shape at those call sites - the [lat, lng] contract is prose, as it was at runtime all along. */
type AnyPoint = number[];

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
type HistoryEntry = { at: string, items: { [street: string]: string | null }, via: { [street: string]: string }, notes: { [street: string]: NoteEntry[] }, sides: SidesRecord, km: number, startedAt: string | null, path?: TrailPoint[], runId?: number, workM?: number, totalWorkM?: number, geoFP?: string, pathShortened?: boolean }; // Beta 1.167 (B2/B5): workM/totalWorkM/geoFP are the finish-baked pace figures; pathShortened flags a trail-cap-truncated saved path. All four are absent on pre-1.167 entries, which derive exactly as before

/** A route pack as validated/carried (schema, Beta 1.118 + PACK_FIELDS sections): the fields of PACK_FIELDS in app1. */
type RoutePack = { name: string, area: string, primaries: string[], spot: { [street: string]: number[] }, tileNames: string[], box: RouteBox | null, roads: RoadsMap, reference: RoadsMap, ends: { [street: string]: number[][] } };

/** The stored snowroute.v2.settings record: {vib, chime, chimeSound} (schema, global keys). */
type SettingsRecord = { vib: boolean, chime: boolean, chimeSound: string };

/** The in-memory settings state: the stored record plus the session-only awake flag (schema, Beta 1.112 note). awake is modelled optional because the stored record never carries it - loadSettings builds the record fields first and attaches awake (forced OFF) before returning, so every value loadSettings returns does carry it. */
type SettingsState = SettingsRecord & { awake?: boolean };

/** One connected run of a street's geometry, as computeStretches builds it (CODE-ONLY geometry shape, app1 Beta 1.144 comment). */
type StretchRun = { line: LatLng[], cum: number[], total: number, parts: LatLng[][] | null };

/** A street's built stretch geometry (CODE-ONLY, app1 computeStretches comment). */
type Stretch = { line: LatLng[], cum: number[], total: number, parts: LatLng[][], runs: StretchRun[], ends?: number[][] };

/** All streets' stretch geometry by name. */
type StretchMap = { [street: string]: Stretch };

/** A route slot's storage keys as routeKeys builds them: every value is a full localStorage key (schema, Layout section). */
type RouteKeys = { done: string, times: string, hist: string, notes: string, via: string, trail: string, cov: string, start: string, flip: string, sides: string, sess: string, pre: string, snap: string, mig: string, migfill: string, finclean: string, rundist: string, rundist2: string };

/** sunTimes' return: the day's sunrise/sunset as epoch ms, null when the sun never rises or sets that day (CODE-ONLY, app1). */
type SunTimes = { rise: number | null, set: number | null, polar: 'day' | 'night' | null };

// ---- 2. Cross-part globals (home part named per declaration) ----

/** app2.js: `let routeBox = null` - the active pack's bounding box, set by buildGeometry (app1) on every load. */
declare var routeBox: RouteBox | null;

/** app2.js: `const ROUTE_TILE_NAMES = []` - refilled in place by buildGeometry (app1) on every load. (Beta 1.263: the naming revert restored the pre-1.258 exclusion, which reads it at every zoom; removed in 1.258 with the retirement, restored in 1.261 for the pre-15 band.) */
declare var ROUTE_TILE_NAMES: string[];

/** app3.js: `const SAMPLES = {}` - per-street coverage sample points, refilled by buildSamples. */
declare var SAMPLES: { [street: string]: LatLng[] };

/** app3.js: rebuilds SAMPLES from the live geometry; called by buildGeometry (app1). */
declare function buildSamples(): void;

/** app3.js: the last accepted GPS fix {ll, at}, or null before any fix. */
declare var lastGood: { ll: number[], at: number } | null;

/** app5.js: repaints the day/night theme; called by themeTick (app1) at a boundary. (The mirror named app4.js, the function's earlier home, until /correct Phase 3 round (d) - the declaration's type was right and only its provenance had drifted, the direction tsc cannot see.) */
declare function applyNight(): void;

/** app2.js: the MapLibre map instance or null. The pilot does not model MapLibre's API - app1 only null-tests the binding and passes it nowhere - so it is typed as any rather than given an invented class shape. */
declare var map: any;

/** app2.js: re-applies the basemap style after a theme flip; called by themeTick (app1). */
declare function setBasemap(): void;

/** app3.js: persists the pre-Start snapshot (LS.snap); retried by flushAux (app1). Returns the storage outcome. */
declare function saveSnap(): StorageOutcome;
declare function saveFixLog(): StorageOutcome;

/** app3.js: banks the run-distance counter (LS.rundist) - on every recorded fix since Beta 1.193 (the 30 s / 25 m throttle retired), and when forced by flushAux (app1) on a forced flush so a mid-run reload resumes the true figure (Beta 1.186, storage fix round P2). The force flag now only marks the page-death call; banking itself is change-gated. Returns nothing. */
declare function persistRunDist(force?: boolean): void;

/** app3.js: banks the counter's second copy (LS.rundist2) from flushAux's trail-flush path (app1) - a different writer, trigger and cadence from persistRunDist's per-fix direct write, so the two records fail independently (Beta 1.193, counter hardening). Returns nothing. */
declare function bankRunDistMirror(): void;

/** app2.js: the current stretch selection entries {name, idx, anchor}. app1 only forwards the array through GL_HOST's getter and never reads an entry's fields, so the entries are not field-typed here. */
declare var selSet: any[];

/** app2.js: `let selStretch = null` - the anchor selection {name, idx} the paint engine reads. */
declare var selStretch: { name: string, idx: number } | null;

/** app2.js: normalizes basemap label layers for a map; app1 only forwards the function through GL_HOST's getter. Its map parameter is MapLibre's, unmodelled in this pilot (see `map` above). */
declare function glUnifyLabels(m: any): void;

/** app4.js: `const ICONS = {...}` - the icon mint table, filled by renderIcons; showBanner (app1) reads a named entry for the banner's chip. */
declare var ICONS: { [key: string]: string };

// ---- 3. Browser surface actually used by the checked parts ----

/** Source-only title switch, provided by flags.js before the parts execute. */
declare var ROUTE_TITLES_ON: boolean;

/** The classList surface app1 uses. */
interface AppClassList {
  add(...classes: string[]): void;
  remove(...classes: string[]): void;
  contains(c: string): boolean;
  toggle(c: string, force?: boolean): void;
}

/** A measured element's band (Beta 1.221: placeToast measures the pill and every control it must clear). */
interface AppRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/** An element as app1 uses it: text content, its class list, and (Beta 1.221, placeToast) its inline bottom offset, its measured band and its running animations. */
interface AppElement {
  textContent: string;
  innerHTML: string;
  /** The overlay-exit timer hideSurface stores on the element it is leaving (0 when no leave is pending). */
  _exitT: number;
  onanimationend: ((e: { animationName: string }) => void) | null;
  classList: AppClassList;
  style: { bottom: string };
  getBoundingClientRect(): AppRect;
  getAnimations(): { animationName?: string }[];
}

/** The element name placeToast's JSDoc uses: the same element shape as AppElement (every element app1 holds is one). */
interface HTMLElement extends AppElement {}

/** The computed-style fields placeToast reads (Beta 1.221). */
interface AppComputedStyle {
  transform: string;
  display: string;
  visibility: string;
  opacity: string;
}

declare function getComputedStyle(el: any): AppComputedStyle;

/** The transform reader placeToast uses: constructed from a computed transform string, only m42 (the Y offset) is read. */
declare class DOMMatrixReadOnly {
  constructor(transform?: string);
  readonly m42: number;
}

/** The Web Storage surface app1 uses (localStorage / sessionStorage). */
interface AppStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

declare var document: {
  getElementById(id: string): AppElement;
  querySelectorAll(sel: string): { forEach(cb: (e: HTMLElement) => void): void };
  body: AppElement;
  documentElement: AppElement;
  addEventListener(type: string, listener: () => void, capture?: boolean | { capture?: boolean; passive?: boolean }): void;
  visibilityState: string;
  hidden: boolean;
};

/** The navigator surface the device profile reads (Beta 1.230): the agent string and the touch-point count its platform gate is built from. */
declare var navigator: {
  userAgent: string;
  maxTouchPoints: number;
};

/** The media-query surface the overlay-exit helper reads: only the reduced-motion answer is modelled. */
declare function matchMedia(query: string): { matches: boolean };

declare var window: {
  visualViewport: { height: number } | null;
  innerHeight: number;
  matchMedia: typeof matchMedia;
  navigator: { userAgent: string; maxTouchPoints: number };
  addEventListener(type: string, listener: () => void, capture?: boolean): void;
  /** The app's own paint host, assigned by engine.js (`window.GLP = GLP`) and read by app2.js. Typed as any like `map` above: its shape is engine's own returned object, not modelled here. */
  GLP: any;
  /** The device profile's state object, assigned by app1 (`window.__dp = DP`, Beta 1.230) and read by QA and the drives. Typed as any like `map` above: its shape is app1's own record, not modelled here. */
  __dp: any;
};

declare var localStorage: AppStorage;
declare var sessionStorage: AppStorage;

/** The console surface the parts use (retro-fixes round, 2026-11-14: engine/app2 log through it). */
declare var console: {
  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
};

/** The clock and frame surface the device profile's sampler uses (Beta 1.230). */
declare var performance: { now(): number };
declare function requestAnimationFrame(fn: (now: number) => void): number;

declare function setTimeout(fn: () => void, ms?: number): number;
declare function clearTimeout(id: number): void;
declare function setInterval(fn: () => void, ms?: number): number;
declare function clearInterval(id: number): void;
