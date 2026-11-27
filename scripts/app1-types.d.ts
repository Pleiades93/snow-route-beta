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
// 1. STORAGE + GEOMETRY TYPEDEFS. Persisted shapes cite docs/STORAGE-SCHEMA.md.
//    Implementation-only shapes and undocumented fields are marked CODE-ONLY.
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
//    parts/head.html and are dereferenced directly (the base config runs
//    with strictNullChecks off. See docs/TYPE-SAFETY-PLAN.md for nullable lookups).

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
type PieceTimesMap = { [street: string]: Record<number, PieceTimePair> };

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
type RoutePack = { id?: string, name: string, area: string, primaries: string[], spot: { [street: string]: number[] }, tileNames: string[],
  box: RouteBox | null, roads: RoadsMap, reference: RoadsMap, ends: { [street: string]: number[][] } };

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

/** Schema, IndexedDB: created routes. */
type IdentifiedRoutePack = RoutePack & { id: string };

/** Schema, Layout and the userpacks migration. Legacy values may omit the embedded id. */
type UserPacksRecord = Record<string, RoutePack & { id?: string }>;

/** CODE-ONLY: the userpacks boot outcome (create-packs initUserPacks); the boot value carries state only. */
type UserPacksStatus = { state: string, fromStore?: number, fromLegacy?: number, drained?: number, migrated?: boolean, legacyDeleted?: boolean };

/** CODE-ONLY: normalizePack's options (create-packs). */
type PackNormalizeOpts = { draft?: boolean, tileNames?: string[] };

/** CODE-ONLY: normalizePack's fail-closed result (create-packs). */
type NormalizePackResult = { ok: true, pack: RoutePack } | { ok: false, error: string };

/** CODE-ONLY: normalizePack's per-map cleaner result (create-packs). */
type CleanRoadsResult = { error?: string, roads?: RoadsMap };

/** Schema, Backup envelope: raw slot strings, plus the idle assertion and serialized snapshot. */
type BackupFields = Partial<Record<'done' | 'times' | 'hist' | 'notes' | 'via' | 'trail' | 'cov' | 'flip' | 'sides' | 'sess', string>> & { start?: string | null };
type BackupRoute = BackupFields & { snap?: string };

type BackupV1 = { app: 'snowroute-backup', v: 1, at: string, data: Record<string, string> };

type BackupV2 = {
  app: 'snowroute-backup';
  v: 2;
  at: string;
  routes: Record<string, BackupRoute>;
  night?: string;
  nightExp?: string;
  userpacks?: UserPacksRecord;
  settings?: string;
  fixlog?: string;
  recovery?: true;
};

/** Schema, Keys: last export summary. */
type ExportSummary = { exportedAt?: number };

/** Schema, Keys: v5.preload. Older records omit the route counts. */
type PreloadRecord = { at: number, saved: number, total: number, routeSaved?: number, routeTotal?: number };

/** Schema, Keys: v2.migfill, v5.finclean, v5.rundist and v5.rundist2. */
type MigrationFillRecord = Partial<Record<keyof BackupFields, string>>;
type FinishCleanupRecord = { run: number, at: number };
type RunDistanceRecord = { run: number, m: number, end: TrailPoint | null };

/** Schema, Keys: device tier hint. */
type DeviceTierRecord = { t: number, at: number };

/** Schema, IndexedDB: the city shape cache. */
type CityShapeCell = { at: number, ways: [number, string, LatLng[]][] };
type CityShapeRecord = { cityName: string, bbox: RouteBox, totalCells: number, savedAt: number, cells: Record<string, CityShapeCell> };

/** Schema, Keys: e3 fixlog. Packed session field names are CODE-ONLY (app3 fixLogEncodeSessions). */
type FixLogRecord = { e: 3, s: { v: string, t0: number, n: number, b: number, f: string }[] };

/** CODE-ONLY: one decoded fixlog session (app3 fixLogDecodeSessions). */
type FixLogSession = { v: string, t0: number, f: FixLogEntry[] };

/** CODE-ONLY: decoded fixlog tuple layout in app3. */
type FixLogEntry = [
  timestamp: number | null, lat: number | null, lng: number | null,
  accuracy: number | null, speed: number | null, course: number | null,
  output: [number | null, number | null, number | null, number | null, number | null] | null,
  run: number,
];

/** CODE-ONLY: partial pack recognition census written by migratePack (app5). */
type PackMigrationCensus = { fp: string, set: string, n: number, bytes: number };

/** CODE-ONLY: route geometry used to validate a snapshot. */
type SnapshotGeometry = { set: Set<string>, names: string[], stretch: StretchMap, samples: Record<string, LatLng[]> };

/** CODE-ONLY: app3 writers resolved from the classic-script global object at flush time. */
type LateWriterGlobals = Record<string, Function | undefined>;

// CODE-ONLY: engine geometry, paint records and MapLibre boundary.
type EngineRange = { start: number, end: number };
type EngineStreet = { stitched: AnyPoint[], cuts: number[][], off0: AnyPoint[], off1: AnyPoint[], offH0: AnyPoint[], offH1: AnyPoint[] };
type EngineVertex = { n: string, vi: number };
type EngineEnd = EngineVertex & { side: number };
type EngineEndKey = 'e0' | 'e1';
type EngineJunction = { B: string, viA: number, V: AnyPoint, dB: AnyPoint, nB: AnyPoint, sin: number };
type EnginePairs = Record<string, { n2: string, vi2: number, side2: number, corner: AnyPoint | null }[]>;
type EngineClipTag = { clip: string, vi: number };
type EngineClipPiece = { pts: AnyPoint[], sTag: EngineClipTag | null, eTag: EngineClipTag | null };
type EngineMember = { n: string, idx: number, side?: number };
type EngineStrand = { pts: AnyPoint[], key: string, mem: EngineMember[], e0?: EngineEnd | null, e1?: EngineEnd | null, corner?: boolean };
type EngineFragment = { ci: number, band: boolean, pts: AnyPoint[] };
type EngineSelection = { name: string, idx: number };
type EngineFade = { pts: AnyPoint[], k: string, col: string };
type EngineFeature<P = Record<string, string | number>, C = AnyPoint | AnyPoint[]> = {
  type: string, properties: P, geometry: { type: string, coordinates: C }
};
type EngineCollection = { type: string, features: EngineFeature[] };
type EngineLayer = { id: string, type: string, minzoom?: number, maxzoom?: number, source?: string, layout?: Record<string, unknown>, paint?: Record<string, unknown>, filter?: unknown };
type EngineMap = {
  getSource(id: string): { setData(data: EngineCollection | EngineFeature): void } | undefined;
  getLayer(id: string): EngineLayer | undefined;
  getStyle(): { layers?: EngineLayer[] };
  addSource(id: string, source: { type: string, data: EngineCollection | EngineFeature, lineMetrics?: boolean }): void;
  addLayer(layer: EngineLayer, before?: string): void;
  setLayerZoomRange(id: string, min: number, max: number): void;
  setLayoutProperty(id: string, name: string, value: unknown): void;
  setPaintProperty(id: string, name: string, value: unknown): void;
};
type WidthCurve = [string, string[], string[], ...number[]];
type EngineGlowLayer = { p?: number, s?: number, b: number, o: number, a: number, c?: string };

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
/** app3.js: persists the packed fixlog record. */
declare function saveFixLog(): StorageOutcome;

/** app3.js: banks the run-distance counter (LS.rundist) - on every recorded fix since Beta 1.193 (the 30 s / 25 m throttle retired), and when forced by flushAux (app1) on a forced flush so a mid-run reload resumes the true figure (Beta 1.186, storage fix round P2). The force flag now only marks the page-death call; banking itself is change-gated. Returns nothing. */
declare function persistRunDist(force?: boolean): void;

/** app3.js: banks the counter's second copy (LS.rundist2) from flushAux's trail-flush path (app1) - a different writer, trigger and cadence from persistRunDist's per-fix direct write, so the two records fail independently (Beta 1.193, counter hardening). Returns nothing. */
declare function bankRunDistMirror(): void;

/** app2.js: the current stretch selection entries. */
declare var selSet: (EngineSelection & { anchor: AnyPoint })[];

/** app2.js: `let selStretch = null` - the anchor selection {name, idx} the paint engine reads. */
declare var selStretch: { name: string, idx: number } | null;

/** app2.js: rebuilds basemap labels and, when requested, updates route titles. */
declare function glUnifyLabels(options: { m: EngineMap, stack?: { newStack: boolean, data: EngineCollection, ids: string[], fontStack: string[] }, routeData?: EngineCollection }): void;

/** app2.js: re-renders the route lists in every .routeList element. */
declare function renderRouteLists(): void;

/** app5.js: migrates downloaded packs into the created-route store; self-gates when nothing was downloaded. */
declare function migratePack(): Promise<void>;

/** app3.js: GPS distance along the trail since the given epoch ms. */
declare function trailKm(sinceMs: number): number;

/** app3.js: the flags line for one street's notes. */
declare function flagText(n: string): string;

/** app3.js: the live fix log's decoded sessions. */
declare var fixLog: FixLogSession[];

/** app3.js: flips the runtime fix-log switch. */
declare function fixLogSetEnabled(on: boolean): void;

/** app3.js: reads the runtime fix-log switch. */
declare function fixLogIsEnabled(): boolean;

/** app3.js: encodes decoded sessions into the stored e3 record. */
declare function fixLogEncodeSessions(sessions: FixLogSession[]): FixLogRecord;

/** app3.js: decodes any stored or backup value into sessions. */
declare function fixLogDecodeSessions(parsed: any): FixLogSession[];

/** app3.js: coverage samples for a stretch set, by street. */
declare function samplesFor(stretch: StretchMap, names: string[]): { [street: string]: LatLng[] };

/** app3.js: the running clean's in-memory snapshot, or null. */
declare var runSnap: Snap | null;

/** app3.js: re-evaluates the wake-lock want. */
declare function syncWake(): Promise<void>;

/** app3.js: the icon mint table for the Pace stats. */
declare var PACE_ICONS: { [key: string]: string };

/** app3.js: true once the browser refused location permission. */
declare var gpsDenied: boolean;

/** app3.js: the live geolocation watch id, or null. */
declare var watchId: number | null;

/** app5.js: the pack-migration flag's storage key. */
declare var PACKMIG_KEY: string;

/** app5.js: the manifest fingerprint the migration flag certifies. */
declare function packMigFingerprint(list: string[]): string;

/** app5.js: takes the pack writers' turn; resolves to its release. */
declare function takePackWriteTurn(): Promise<() => void>;

/** app2.js: the day/night basemap style objects (pmstyles data). */
declare var GL_STYLES: Record<string, any>;

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
  /** The reduced-motion stay timer showBanner stores on the banner (0 when none is pending). */
  _rmT: number;
  onanimationend: ((e: { animationName: string }) => void) | null;
  classList: AppClassList;
  style: { [key: string]: string };
  value: string;
  placeholder: string;
  readOnly: boolean;
  files: any;
  download: string;
  href: string;
  className: string;
  dataset: { [key: string]: string };
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string;
  addEventListener(type: string, listener: (e: any) => void): void;
  click(): void;
  remove(): void;
  appendChild(child: any): void;
  querySelector(sel: string): AppElement;
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
  createElement(tag: string): AppElement;
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
  serviceWorker: any;
  canShare(data: any): boolean;
  share(data: any): Promise<void>;
  vibrate(pattern: any): boolean;
  storage: { estimate(): Promise<any> };
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
  /** The created-route store's boot promise, assigned by create-packs and read by the drives. */
  __userPacksReady: Promise<UserPacksStatus>;
  /** The created-route store's status reader, assigned by create-packs. */
  __userPacksStatus: () => UserPacksStatus;
  history: { replaceState(data: any, unused: string, url?: string): void };
  /** The service worker's last registration error, when one was recorded. */
  __swErr: any;
  AudioContext: any;
  webkitAudioContext: any;
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

declare function setTimeout(fn: (...args: any[]) => void, ms?: number): number;
declare function clearTimeout(id: number): void;
declare function setInterval(fn: (...args: any[]) => void, ms?: number): number;
declare function clearInterval(id: number): void;

/** The IndexedDB request surface the store helpers use: a result plus the four handler slots. */
interface AppIdbRequest {
  result: any;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
  onupgradeneeded: (() => void) | null;
}

/** The IndexedDB object-store surface the store helpers use. */
interface AppIdbStore {
  get(key: string): AppIdbRequest;
  getAll(): AppIdbRequest;
  put(value: any): AppIdbRequest;
  add(value: any): AppIdbRequest;
  delete(key: string): AppIdbRequest;
}

/** The IndexedDB transaction surface the store helpers use. */
interface AppIdbTx {
  objectStore(name: string): AppIdbStore;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
}

/** The IndexedDB database surface the store helpers use. */
interface AppIdbDb {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, options: { keyPath: string }): void;
  transaction(store: string, mode: string): AppIdbTx;
  close(): void;
}

declare var indexedDB: { open(name: string, version: number): AppIdbRequest };

/** The page location surface the parts use. */
declare var location: {
  protocol: string;
  pathname: string;
  search: string;
  href: string;
  reload(): void;
  replace(url: string): void;
};

/** The Cache Storage surface the preload and Status code use. */
interface AppCache {
  keys(): Promise<any[]>;
  match(request: any): Promise<any>;
  put(request: any, response: any): Promise<void>;
  delete(request: any): Promise<boolean>;
}

declare var caches: {
  open(name: string): Promise<AppCache>;
  match(request: any): Promise<any>;
  delete(name: string): Promise<boolean>;
  has(name: string): Promise<boolean>;
};

declare function fetch(url: string, options?: any): Promise<any>;

/** The abort surface the preload fetch timeout uses. */
declare class AbortController {
  signal: any;
  abort(): void;
}

/** The blob surface the downloads and cache weighing use. */
declare class Blob {
  constructor(parts?: any[], options?: { type?: string });
  size: number;
  text(): Promise<string>;
}

/** The file surface the share and import paths use. */
declare class File {
  constructor(parts: any[], name: string, options?: { type?: string });
  text(): Promise<string>;
}

/** The URL surface the parts use: parsing plus object URLs. */
declare class URL {
  constructor(url: string, base?: string);
  href: string;
  static createObjectURL(blob: any): string;
  static revokeObjectURL(url: string): void;
}
