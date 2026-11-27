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

/** A finished clean as buildSnap (app3) bakes it: a history entry plus its GPS-gap flag. */
type ArchiveSnap = HistoryEntry & { gpsGap?: boolean };

/** CLEAN.summary's projection (app3): the Pace surfaces' read of one clean. */
type CleanSummary = { count: number, dur: { count: number, durMs: number, start: number } | null, workM: number, paceKm: string | null };

/** One street row of CLEAN.detail's projection (app3). */
type CleanStreet = { name: string, at: string | null, tMs: number, gapMs: number, stamps: number[], spanMs: number, via: string | undefined, noteLines: string[] };

/** One noted-but-not-cleaned row of CLEAN.detail's projection (app3). */
type CleanNoted = { name: string, primary: boolean, noteLines: string[] };

/** CLEAN.detail's projection (app3): everything the clean-detail view renders. */
type CleanDetail = { count: number, dur: { count: number, durMs: number, start: number } | null, workM: number, paceKm: string | null, elapsedMs: number, paceRate: number | null, streets: CleanStreet[], notedOnly: CleanNoted[] };

/** One entry of the shipped-city catalogue the road-snap index reads (create-citydata). */
type SnapCatEntry = { slug: string, name: string, bbox: number[] };

/** One element of a shipped city pack (create-citydata): a named geometry. */
type CrPackElement = { tags?: { name?: string }, geometry?: { lat: number, lon: number }[] };

/** One axis of the position Kalman filter (app3): estimate, velocity, covariance terms. */
type KfAxis = { p: number, v: number, a: number, b: number, c: number };

/** The position Kalman filter's state (app3). */
type KfState = { ox: number, oy: number, at: number, atF: number, x: KfAxis, y: KfAxis };

/** The heading filter's state beside smHeading (app3). */
type HeadFilter = { om: number, p00: number, p01: number, p10: number, p11: number, gate: number };

/** The fixlog codec's byte writer (app3). */
type FxWriter = { b: number[], u8: (v: number) => void, uv: (v: bigint) => void, sv: (n: bigint) => void };

/** The fixlog codec's byte reader (app3). */
type FxReader = { b: number[], i: number, u8: () => number, uv: () => bigint, sv: () => bigint };

/** The delta state one fixlog entry leaves for the next (app3). */
type FxState = { ts: number | null, latB: bigint | null, lngB: bigint | null, accB: bigint | null, spdB: bigint | null, hdgB: bigint | null, out: (number | null)[] | null, run: number };

/** One polyline of the road-snap index (app3). */
type SnapPoly = { name: string, pts: number[][] };

/** The road-snap index (app3): polylines plus their segment grid. */
type SnapGeo = { key: string, polys: SnapPoly[], grid: Map<string, number[]> };

/** One run-distance counter record (schema, rundist): end is the anchor trail point or null. */
type RunDistRec = { run: number, m: number, end: number[] | null };

/** The create flow's draft route (create-fetch): the pack being built. */
type CrDraft = { name: string, area: string, primaries: Set<string>, roads: RoadsMap, osmNames: Record<string, string>, tileNames?: string[], sectors: Record<string, any>, parts: Record<string, any> };

/** The merged coverage extract (create-fetch): ways by street name. */
type CrCov = { gen: number, byName: Record<string, { name: string, pts: LatLng[] }[]>, byId: Record<string, { name: string, pts: LatLng[] }>, boxes: RouteBox[], fetchedAt: number };

/** One cell of the create grid (create-cache): its box and fetch state. */
type CrGridCell = { key: string, box: RouteBox, state: string, tries: number };

/** The create grid preparation's record (create-fetch owns the binding, create-cache the logic). */
type CrGrid = { name: string, bbox: RouteBox, cells: CrGridCell[], gen: number, session: number,
  startedAt: number, lastProgressAt: number, ticker: number | null, ops: Set<any>, active: number,
  fromCache: boolean, savedAt: number | null, stopped: string | null, lastFail: any, ds: string | null,
  fromPack?: string, isCurrent: () => boolean };

/** One saved city grid in the persistent cache (create-cache): cells by key. */
type CrCacheRec = { cityName: string, bbox: RouteBox, cells: Record<string, { at: number, ways: any[] }>, savedAt: number, totalCells: number, ds?: string };

/** The picked city of the create flow (create-fetch). */
type CrCity = { name: string, lat: number | null, lon: number | null, bbox?: RouteBox };

/** A shipped city pack's catalogue identity (create-citydata). */
type CrPackCity = { slug: string, gen: string, bbox: RouteBox };

/** The create fetch timing budget (create-fetch, CR_TIMING). */
type CrTiming = { budgetMs: number, attempt1Ms: number, topupBudgetMs: number, topupAttempt1Ms: number, capBytes: number, cityCapBytes: number, attemptStallMs: number, packFirstByteMs: number, packStallMs: number, stallMs: number };

/** The fallback preparation's record (create-fetch owns the binding). */
type CrPrepRec = { gen: number, session: number, anchor: any, startedAt: number, ticker: number | null, op: any };

/** The preparation failure record (create-fetch): kind, plus optional status/remark. */
type CrPrepFail = { kind: string, status?: number, remark?: string };

/** The geolocation coordinate surface the GPS code reads. */
type GeolocationCoordinates = { latitude: number, longitude: number, accuracy: number, speed: number | null, heading: number | null };

/** The geolocation fix object the watch callbacks receive. */
type GeolocationPosition = { coords: GeolocationCoordinates, timestamp: number };

/** The geolocation error object: only the code is read. */
type GeolocationError = { code: number };

/** The wake-lock sentinel surface syncWake (app3) uses. */
type WakeLockSentinel = { release: () => void, addEventListener: (type: string, fn: () => void) => void };

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

/** S1 stage 2c: app5.js joined the type check and its mirrors
retired (applyNight, migratePack, PACKMIG_KEY, packMigFingerprint,
takePackWriteTurn). The applyNight mirror named app4.js, the
function's earlier home, until /correct Phase 3 round (d) - the declaration's type was right and only its provenance had
drifted, the direction tsc cannot see. */

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




/** app2.js: the day/night basemap style objects (pmstyles data). */
declare var GL_STYLES: Record<string, any>;

/** app2.js: the sheet stack owner (open/close with the shared animation). */
declare var SHEETS: { open: (el: AppElement, cb?: (() => void) | null, keepOpen?: boolean) => void, close: (el: AppElement) => void };

/** app2.js: clears the current stretch selection. */
declare function deselect(): void;

/** app2.js: closes every open sheet. */
declare function closeSheets(): void;

/** app2.js: true when exactly one side of the street is done. */
declare function streetHalf(n: string): boolean;

/** app2.js: refreshes the header counts. */
declare function updateCount(): void;

/** app2.js: re-renders the streets panel. */
declare function renderPanel(): void;

/** app2.js: re-renders the street list. */
declare function renderStreets(): void;

/** app2.js: the post-change save fan-out; returns the storage outcome. */
declare function finishChange(): StorageOutcome;

/** app2.js: the warned save-all; returns the storage outcome. */
declare function saveAllWarned(): StorageOutcome;

/** app2.js: registers a callback for when the map exists. */
declare function onMapReady(cb: () => void): void;

/** create-citydata.js: loads the shipped-city catalogue index; null when the library failed to load. */
declare function crPackIndexLoad(): Promise<SnapCatEntry[] | null>;

/** create-citydata.js: loads one shipped city pack's elements. */
declare function crPackLoad(slug: string): Promise<CrPackElement[]>;

/** app2.js: spends a tap (swallows the next click for ms). */
declare function spendTap(ms: number): void;

/** app2.js: builds the map at boot. */
declare function bootMap(): void;

/** app2.js: the Streets half of the route-switch session reset. */
declare function resetStreetsSession(): void;

/** app2.js: finalizes an open note draft against its street. */
declare function collapseNoteEditor(): void;

/** app2.js: adds the reference layers after a switch. */
declare function addReferenceLayers(): void;

/** app2.js: re-renders counts, panel and streets together. */
declare function refreshAll(): void;

/** app2.js: true once the GL layer stack is live. */
declare var glOk: boolean;

/** app2.js: shows one Routes-menu pane by id. */
declare function showRmPane(id: string): void;

/** create-pick.js: the create flow's shared confirmation. */
declare function crConfirm(title: string, msg: string, cb: () => void, labels?: any): void;

/** app3.js: hides the shared confirmation pill. */
declare function hideConfirm(): void;

/** app3.js: the stale-clean (over 12 hours) finish ask. */
declare function checkStale(): void;

/** app3.js: the run/history half of the route-switch session reset. */
declare function resetNotesHistorySession(): void;

/** app3.js: starts the geolocation watch (fromRun marks a recording watch). */
declare function startGps(fromRun?: boolean, restart?: boolean): void;

/** app3.js: stops the geolocation watch. */
declare function stopGps(silent?: boolean): void;

/** app3.js: true while the live watch is a recording (in-run) watch. */
declare var gpsFromRun: boolean;





/** create-pick.js: the draft geometry cache shared by the create consumers. */
declare function crDraftGeom(): any;

/** create-pick.js: one street's chosen length in metres. */
declare function crStreetChosenM(name: string, g: any): number;

/** create-pick.js: restores the boot chrome after the create flow. */
declare function restoreBootChrome(): void;

/** create-pick.js: parks the boot chrome for the create flow. */
declare function parkBootChrome(): void;

/** create-pick.js: sets the create flow's stage. */
declare function setCreateStage(stage: string): void;

/** create-pick.js: the roads the save stores (chosen sectors only). */
declare function crFilteredRoads(): RoadsMap;

/** create-pick.js: leaves the create flow. */
declare function exitCreate(): void;


/** app2.js: formats a length in metres for display. */
declare function fmtLenM(m: number): string;

/** app2.js: opens the route menu. */
declare function openRouteMenu(): void;

/** app2.js: closes the route menu. */
declare function closeRouteMenu(): void;

/** app2.js: tiles drawn so far on the live map. */
declare var tilesOk: number;



























/** create-pick.js: re-renders the create hint line. */
declare function crRenderHint(): void;

/** create-pick.js: adds one resolved street to the draft. */
declare function crAddStreet(name: string, segs: any): void;

/** create-pick.js: adds one further run to a drafted street. */
declare function crAddRun(name: string, segs: any): void;

/** create-pick.js: projects a point onto a segment, in metres. */
declare function crSegProjM(p: LatLng, a: LatLng, b: LatLng): { pt: LatLng, d: number };

/** create-pick.js: a line's length in metres. */
declare function crLineLen(pts: LatLng[]): number;

/** create-pick.js: stitches ways into runs by endpoint chaining. */
declare function chainWays(ways: LatLng[][]): { line: LatLng[], exact?: boolean, segments: LatLng[][] }[];

/** create-pick.js: the Overpass endpoints, primary plus fallback. */
declare var OVERPASS_URLS: string[];

/** create-pick.js: refreshes the street search after an index rebuild. */
declare function crRefreshSearch(): void;

/** app2.js: wraps a liveness check into a land-if-current function (G-B owner). */
declare function landIfCurrent(token: any, isCurrent: (g: any) => boolean): () => boolean;

// ---- 3. Browser surface actually used by the checked parts ----



/** whatsnew.js: the current release's About notes (one version block). Declared in this section, not section 2: the mirrors checker's provenance list cannot name whatsnew.js. Retires when whatsnew.js joins the check (stage 3d). */
declare var WHATSNEW: { v: string, items: string[] };

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
interface AppStyle {
  display: string;
  width: string;
  setProperty(name: string, value: string): void;
  [key: string]: string | ((name: string, value: string) => void);
}

/** The DOM Element name app5's standing JSDoc uses: the app's element surface. */
type Element = AppElement;

interface AppElement {
  textContent: string;
  innerHTML: string;
  /** The overlay-exit timer hideSurface stores on the element it is leaving (0 when no leave is pending). */
  _exitT: number;
  /** The reduced-motion stay timer showBanner stores on the banner (0 when none is pending). */
  _rmT: number;
  onanimationend: ((e: { animationName: string }) => void) | null;
  classList: AppClassList;
  style: AppStyle;
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
  addEventListener(type: string, listener: (e: any) => void, opts?: any): void;
  tagName: string;
  matches(sel: string): boolean;
  closest(sel: string): AppElement | null;
  getBoundingClientRect(): AppRect;
  contains(el: any): boolean;
  dispatchEvent(ev: any): boolean;
  offsetWidth: number;
  onclick: ((e: any) => void) | null;
  _subtleT?: number;
  click(): void;
  remove(): void;
  appendChild(child: any): void;
  querySelector(sel: string): AppElement;
  querySelectorAll(sel: string): { forEach(cb: (e: AppElement) => void): void };
  insertBefore(node: AppElement, ref: AppElement | null): void;
  scrollTop: number;
  replaceChildren(...nodes: any[]): void;
  append(...nodes: any[]): void;
  offsetHeight: number;
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
  querySelector(sel: string): AppElement | null;
  activeElement: AppElement | null;
  createElement(tag: string): AppElement;
  querySelectorAll(sel: string): { forEach(cb: (e: HTMLElement) => void): void };
  body: AppElement;
  documentElement: AppElement;
  addEventListener(type: string, listener: (e: any) => void, capture?: boolean | { capture?: boolean; passive?: boolean }): void;
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
  storage: { estimate(): Promise<any>, persist(): Promise<boolean> };
  geolocation: { watchPosition: (ok: (p: GeolocationPosition) => void, err?: (e: GeolocationError) => void, opts?: any) => number, clearWatch: (id: number) => void };
  wakeLock: { request: (type: string) => Promise<WakeLockSentinel> };
  locks: { request: (name: string, fn: () => Promise<void>) => Promise<any> };
};

/** The media-query surface the overlay-exit helper reads: only the reduced-motion answer is modelled. */
declare function matchMedia(query: string): { matches: boolean };

declare var window: {
  visualViewport: { height: number, offsetTop: number, addEventListener: (type: string, fn: (e: any) => void, opts?: any) => void } | null;
  innerHeight: number;
  innerWidth: number;
  screen: { width: number, height: number };
  scrollX: number;
  scrollY: number;
  scrollTo(x: number, y: number): void;
  __warm: string;
  __spriteWarm: string;
  __tailAt: number;
  __bootPickRoute: ((id: string) => void) | undefined;
  matchMedia: typeof matchMedia;
  navigator: { userAgent: string; maxTouchPoints: number, standalone?: boolean };
  addEventListener(type: string, listener: (e: any) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (e: any) => void, capture?: boolean): void;
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

declare var MouseEvent: { new (type: string, init?: any): any };

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
declare function cancelAnimationFrame(id: number): void;
/** The global isNaN coerces its argument (the parts pass Dates and strings). */
declare function isNaN(number: any): boolean;
declare var DeviceOrientationEvent: { requestPermission?: () => Promise<string> };

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
declare var TextDecoder: any;
declare var TextEncoder: any;

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
