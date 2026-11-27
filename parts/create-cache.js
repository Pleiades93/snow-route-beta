// ---- city grid + persistent cache ---- never user data: in no backup; losing it costs a re-download
const CR_IDB_NAME = 'snowroute-citycache', CR_IDB_STORE = 'cities';
let crCacheNote = ''; // the disclosed cache state for the current city ('' = saving fine)
let crCacheNoteCity = ''; // cache failure state binds to the city that earned it, never to whichever city is current when a write lands
let crCacheNoteSession = -1; // binds to (city, session): a closed session's failure never mutes the live session's writes; the write always lands
/** @type {Promise<any>} */
let crCacheQueue = Promise.resolve(); // serializes cache read-modify-writes (parallel cell commits must not clobber each other)
/** @returns {Promise<any>} */
function crIdbOpen() {
  return new Promise(res => {
    try {
      if (typeof indexedDB === 'undefined') { res(null); return; }
      const rq = indexedDB.open(CR_IDB_NAME, 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore(CR_IDB_STORE, { keyPath: 'cityName' }); } catch (e) {} };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
      rq.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
}
/** @param {string} name @returns {Promise<CrCacheRec|null>} */
async function crIdbGet(name) {
  const db = await crIdbOpen(); if (!db) return null;
  return /** @type {Promise<CrCacheRec|null>} */ (new Promise(res => {
    try {
      const rq = db.transaction(CR_IDB_STORE, 'readonly').objectStore(CR_IDB_STORE).get(name);
      rq.onsuccess = () => { const v = rq.result || null; try { db.close(); } catch (e) {} res(v); };
      rq.onerror = () => { try { db.close(); } catch (e) {} res(null); };
    } catch (e) { try { db.close(); } catch (e2) {} res(null); }
  }));
}
/** @param {CrCacheRec} rec @returns {Promise<boolean>} */
async function crIdbPut(rec) {
  const db = await crIdbOpen(); if (!db) return false;
  return /** @type {Promise<boolean>} */ (new Promise(res => {
    try {
      const tx = db.transaction(CR_IDB_STORE, 'readwrite');
      tx.objectStore(CR_IDB_STORE).put(rec);
      tx.oncomplete = () => { try { db.close(); } catch (e) {} res(true); };
      tx.onerror = () => { try { db.close(); } catch (e) {} res(false); };
      tx.onabort = () => { try { db.close(); } catch (e) {} res(false); };
    } catch (e) { try { db.close(); } catch (e2) {} res(false); }
  }));
}
/** @param {string} name @returns {Promise<void>} */
async function crIdbDelete(name) {
  const db = await crIdbOpen(); if (!db) return;
  return /** @type {Promise<void>} */ (new Promise(res => {
    try {
      const tx = db.transaction(CR_IDB_STORE, 'readwrite');
      tx.objectStore(CR_IDB_STORE).delete(name);
      tx.oncomplete = () => { try { db.close(); } catch (e) {} res(); };
      tx.onerror = () => { try { db.close(); } catch (e) {} res(); };
    } catch (e) { try { db.close(); } catch (e2) {} res(); }
  }));
}
/** @param {string} cityName @param {number} sess @returns {void} */
function crCacheDisclose(cityName, sess) { // the wording for cache failures (the session keeps working, the state is said), charged to the city whose write failed
  if (sess !== crSession) return; // a closed session's failure is dropped: recording it would charge the live session and suppress its writes
  if (crCacheNote && crCacheNoteCity === cityName && crCacheNoteSession === sess) return; // already disclosed for this city in this session: the state stands
  crCacheNoteCity = cityName; crCacheNoteSession = sess;
  crCacheNote = 'Couldn’t save ' + cityName + ' on this phone, it will reload next time';
  crRenderHint();
}
/** @param {CrCacheRec|null} rec @param {RouteBox} bbox @param {string|null} ds @returns {boolean} */
function crCacheRecFits(rec, bbox, ds) { // the one fit test: box and dataset identity must match this preparation; an unstated identity is no evidence of mismatch
  if (!rec) return false;
  if (rec.bbox && (rec.bbox.s !== bbox.s || rec.bbox.n !== bbox.n || rec.bbox.w !== bbox.w || rec.bbox.e !== bbox.e)) return false;
  if (ds && rec.ds && rec.ds !== ds) return false;
  return true;
}
/** @param {CrPackCity|null} pk @returns {string|null} */
function crDatasetId(pk) { // the identity: a pack city's is its catalogue stamp, an unlisted city the live service's, an unanswered catalogue none
  if (pk) return 'pack:' + pk.slug + '@' + pk.gen;
  return crPackIndexKnown ? 'overpass' : null;
}
/** @param{string} cityName @param{RouteBox} bbox @param{number} totalCells @param{string} key @param{any[]} ways @param{string|null} ds @returns{Promise<any>} */
function crCacheSaveCell(cityName, bbox, totalCells, key, ways, ds) { // write-through, serialized, one cell at a time; ds is captured with the call, never read from the live preparation
  const sess = crSession; // the commissioning session, captured with the call: suppression and disclosure bind to it; the write itself always lands
  crCacheQueue = crCacheQueue.then(async () => {
    if (crCacheNote && crCacheNoteCity === cityName && crCacheNoteSession === sess) return; // already refused or failed for this city in this session: stop writing; another failure never mutes this session
    let rec = await crIdbGet(cityName);
    if (!crCacheRecFits(rec, bbox, ds)) rec = null; // a record under another box or dataset is not this grid's cache: merging would certify coverage never downloaded here
    if (!rec) rec = /** @type {CrCacheRec} */ ({ cityName, bbox, cells: {}, savedAt: Date.now(), totalCells });
    rec.bbox = bbox; rec.totalCells = totalCells;
    if (ds) rec.ds = ds; // the record carries its dataset's identity; a fitting older record gains the stamp on its first write
    rec.cells[key] = { at: Date.now(), ways };
    rec.savedAt = Date.now();
    let size = 0;
    try { size = JSON.stringify(rec).length; } catch (e) {}
    if (size > CR_TIMING.cityCapBytes) { crCacheDisclose(cityName, sess); return; } // refuse BEFORE the write rather than dying mid-write (amendment C)
    if (!(await crIdbPut(rec))) crCacheDisclose(cityName, sess);
  }).catch(() => crCacheDisclose(cityName, sess));
  return crCacheQueue;
}
/** @param {RouteBox} bbox @returns {CrGridCell[]} */
function crGridCellsFor(bbox) { // the ~4x4 km grid over the box (row-major, south-west first); the last row and column clamp to the edge
  const dLat = CR_CELL_KM * 1000 / MLAT, dLng = CR_CELL_KM * 1000 / MLNG;
  const rows = Math.max(1, Math.ceil((bbox.n - bbox.s) / dLat - 1e-9)), cols = Math.max(1, Math.ceil((bbox.e - bbox.w) / dLng - 1e-9));
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    cells.push({ key: 'r' + r + 'c' + c,
      box: { s: +(bbox.s + r * dLat).toFixed(6), n: +Math.min(bbox.n, bbox.s + (r + 1) * dLat).toFixed(6), w: +(bbox.w + c * dLng).toFixed(6), e: +Math.min(bbox.e, bbox.w + (c + 1) * dLng).toFixed(6) },
      state: 'pending',
      tries: 0 });
  }
  return cells;
}
// the grid current-check under the one convention (at crSearchCurrent, create-pick.js); its true input is the grid object itself
/** @param {CrGrid|null} g @returns {boolean} */
function crGridCurrent(g) { return !!g && crGrid === g && creating && crSession === g.session && crCovGen === g.gen; }
/** @returns {number} */
function crGridDoneCount() { return crGrid ? crGrid.cells.filter(c => c.state === 'done').length : 0; }
/** @returns {number} */
function crGridFailedCount() { return crGrid ? crGrid.cells.filter(c => c.state === 'failed').length : 0; }
/** @returns {number} */
function crGridPendingCount() { return crGrid ? crGrid.cells.filter(c => c.state === 'pending' || c.state === 'fetching').length : 0; }
/** @returns {string} */
function crGridSettledState() { // a settled grid's honest state: all in ready, some in degraded (usable, resumable), none in failed or 'none'
  if (!crGrid) return crCov && crCov.boxes.length ? 'ready' : 'none';
  if (crGridPendingCount() > 0 && !crGrid.stopped) return 'preparing';
  if (crGridFailedCount() === 0 && crGridPendingCount() === 0) return 'ready';
  if (crGrid.stopped) return 'degraded'; // stopped with parts missing, even zero landed, is resumable, not 'none': the Resume offer must exist
  return crGridDoneCount() > 0 ? 'degraded' : 'failed';
}
/** @param {string} why @returns {void} */
function crGridStop(why) { // stop scheduling, abort the downloads in flight, KEEP every committed cell (amendment B)
  const g = crGrid; if (!g) return;
  g.stopped = why;
  if (g.ticker) { clearInterval(g.ticker); g.ticker = null; }
  for (const op of Array.from(g.ops)) crAbortOp(op);
  g.ops.clear(); g.active = 0;
  for (const c of g.cells) if (c.state === 'fetching') c.state = 'pending';
}
/** @param {CrGrid} g @returns {void} */
function crGridFinish(g) {
  if (g.ticker) { clearInterval(g.ticker); g.ticker = null; }
  crSetPrepState(crGridSettledState());
  if (crPrepState === 'failed' && g.lastFail) { crPrepFail = g.lastFail; crFailFromGrid = true; }
  if (crPrepState === 'ready' || crPrepState === 'degraded') crSweepPending();
  crRenderHint();
}
/** @param {CrGrid} g @returns {void} */
function crGridArmTicker(g) { // the grid's heartbeat, armed at preparation entry: it renders the readout and runs the progress watchdog below
  if (g.ticker) clearInterval(g.ticker);
  g.ticker = setInterval(() => {
    if (g.isCurrent() && crPrepState === 'preparing') { crGridWatchdog(g); if (g.isCurrent() && crPrepState === 'preparing') crRenderHint(); }
    else if (g.ticker) { clearInterval(g.ticker); g.ticker = null; }
  }, 1000);
}
/** @param {CrGrid} g @returns {void} */
function crGridWatchdog(g) { // the watchdog: past CR_TIMING.stallMs since anything landed, force the loud landing instead of a percentage that never moves
  if (!g.isCurrent() || g.stopped || crPrepState !== 'preparing') return;
  if (Date.now() - (g.lastProgressAt || g.startedAt) < CR_TIMING.stallMs) return;
  crGridStall(g);
}
/** @param {CrGrid} g @returns {void} */
function crGridStall(g) { // a stalled grid lands like a failed load: downloads aborted, unfinished cells failed, state settled honestly
  g.lastFail = g.lastFail || { ok: false, kind: 'unreachable' };
  for (const op of Array.from(g.ops)) crAbortOp(op);
  g.ops.clear(); g.active = 0;
  for (const c of g.cells) if (c.state !== 'done') c.state = 'failed';
  if (g.fromPack) { try { delete crPackLoads[g.fromPack]; } catch (e) {} crPackAbort(g.fromPack); } // the pack download may be wedged: drop its cached promise and abort its attempt, so Retry downloads fresh
  crCovGen++; // the stall orphans the generation, as Cancel does: in-flight callbacks land nowhere; resume re-adopts the grid
  crGridFinish(g);
}
/** @param {CrGrid} g @returns {void} */
function crGridPump(g) { // at most CR_GRID_PARALLEL in flight; a failed cell retries once, then is marked failed while the rest continue
  if (!g.isCurrent() || g.stopped) return;
  while (g.active < CR_GRID_PARALLEL) {
    const cell = g.cells.find(c => c.state === 'pending');
    if (!cell) break;
    cell.state = 'fetching'; cell.tries++;
    g.active++;
    const op = {}; g.ops.add(op);
    crSourceExtract(cell.box, null, CR_TIMING.budgetMs, CR_TIMING.attempt1Ms, () => g.isCurrent() && !g.stopped, op).then(res => {
      if (!g.ops.has(op)) return; // stopped or superseded since launch: a late answer lands nowhere, even if this grid is later resumed
      g.ops.delete(op); g.active--;
      if (!g.isCurrent()) return; // the session moved on: land nowhere (CG-PF-05)
      g.lastProgressAt = Date.now(); // a landed cell is progress: the watchdog's clock restarts here, whatever the answer was
      if (res.ok) {
        cell.state = 'done';
        crCovMerge(res.json.elements, cell.box);
        const ways = [];
        for (const el of res.json.elements || []) { const w = crCov.byId[el && el.id]; if (w) ways.push([el.id, w.name, w.pts]); }
        crCacheSaveCell(g.name, g.bbox, g.cells.length, cell.key, ways, g.ds);
      } else if (res.kind === 'stale' || g.stopped) { cell.state = 'pending'; }
      else if (cell.tries < CR_CELL_TRIES) { cell.state = 'pending'; g.lastFail = res; }
      else { cell.state = 'failed'; g.lastFail = res; }
      crRenderHint();
      crGridPump(g);
      if (g.active === 0 && crGridPendingCount() === 0) crGridFinish(g);
    });
  }
  if (g.active === 0 && crGridPendingCount() === 0) crGridFinish(g);
}
/** @returns {void} */
function crCityPrepare() { // load the picked city's whole extract: from the cache when saved, else the grid, resuming a saved partial
  if (!crCity || crCity.lat == null || !creating) return;
  const name = crCity.name;
  const bbox = crCity.bbox || crBoxAround(crCity.lat, crCity.lon, 8); // no bounding box from the lookup: a ~16 x 16 km box on the centre (amendment A fallback)
  const session = crSession, gen = ++crCovGen;
  if (crPrep) { clearInterval(crPrep.ticker); crAbortOp(crPrep.op); crPrep = null; }
  if (crGrid) crGridStop('superseded');
  crCov = crCovFromWays(Object.create(null), []);
  crCacheNote = ''; crCacheNoteCity = ''; // a fresh preparation starts with no failure state: the owner binding resets with the note
  crPackCtx = null; crPackNote = ''; // a new city's preparation re-decides its source (pack vs service) below
  const cells = crGridCellsFor(bbox);
  // lastProgressAt restarts at every landing; ds is the grid's dataset identity, set when the pack resolve lands
  const g = crGrid = /** @type {CrGrid} */ ({ name, bbox, cells, gen, session, startedAt: Date.now(),
    lastProgressAt: Date.now(), ticker: null, ops: new Set(), active: 0, fromCache: false, savedAt: null,
    stopped: null, lastFail: null, ds: null });
  // Resume re-adopts this record with a new generation.
  g.isCurrent = landIfCurrent(g, crGridCurrent); crPrepBegin(); // crFailFromGrid clears here too; the entry bundle itself lives on crPrepBegin (create-fetch.js)
  crRenderHint();
  crGridArmTicker(g); // the heartbeat runs from entry: the read and the resolve below are inside the watchdog's reach from here
  // the resolve lands before the read: the fit test needs the dataset identity, which is the resolve's answer
  crPackResolveCity(name, bbox).then(pk => {
    if (!g.isCurrent()) return; // the session moved on while the catalogue answered: land nowhere (CG-PF-05)
    g.lastProgressAt = Date.now(); // the pack resolve landing is progress: the read's and the pump's clocks start from here
    if (pk) { g.fromPack = pk.slug; crPackCtx = { slug: pk.slug, bbox: pk.bbox, failed: false }; }
    g.ds = crDatasetId(pk);
    crIdbGet(name).then(rec => {
    if (!g.isCurrent()) return;
    g.lastProgressAt = Date.now(); // the saved-grid read landing is progress, restored cells or none
    let restored = 0;
    if (!crCacheRecFits(rec, bbox, g.ds)) rec = null; // a record under another box or dataset is not this grid's cache: its cell keys would restore the wrong streets
    if (rec && rec.cells) {
      let folded = false; // set by the fold below; the byName rebuild runs once after the loop (see there)
      for (const cell of g.cells) {
        const saved = rec.cells[cell.key];
        if (saved && Array.isArray(saved.ways)) {
          const byId = /** @type {Record<string,{name: string, pts: LatLng[]}>} */ (Object.create(null)); // a stored way id of '__proto__' lands as an entry here, not as the map's prototype
          // every stored triple passes the extract's own cleaning (crCleanStoredWay, create-citydata.js) before it may enter coverage
          for (const sw of saved.ways) { const w = crCleanStoredWay(sw); if (w) byId[w.id] = { name: w.name, pts: w.pts }; }
          if (!Object.keys(byId).length && saved.ways.length) continue; // a cell certifies on one validated way or a legitimately empty list; an all-corrupt list stays pending, fetched fresh
          crCovFold(byId, cell.box); // the fold writes entries and box only, never crCovMerge: index and search refresh land once, after the loop
          cell.state = 'done'; restored++; folded = true;
        }
      }
      if (folded) { crCovReindex(); crRefreshSearch(); } // the byName index rebuilds once after the fold: nothing observes it mid-loop, so the rebuild lands the identical index
      if (restored) { g.fromCache = true; g.savedAt = rec.savedAt || null; }
    }
    if (restored === g.cells.length) { crSetPrepState('ready'); crSweepPending(); crRenderHint(); return; } // fully saved: instant ready, ZERO downloads (amendment C)
    crGridArmTicker(g); // re-armed fresh for the pump phase (the heartbeat has run since preparation entry)
    crRenderHint();
    crGridPump(g);
    });
  });
}
/** @returns {void} */
function crGridResume() { // the degraded/stopped remedy: fetch ONLY the missing cells (amendments A+B)
  const g = crGrid; if (!g || !creating) return;
  g.gen = ++crCovGen; // resuming adopts the grid into the live generation, or the pump would refuse it as obsolete and fetch nothing
  g.stopped = null; g.startedAt = Date.now(); g.lastProgressAt = Date.now(); // the resume restarts the watchdog's clock: the idle time before it is not a stall
  for (const c of g.cells) if (c.state === 'failed') { c.state = 'pending'; c.tries = 0; }
  crPrepBegin(); // the entry bundle lives on crPrepBegin (create-fetch.js)
  crGridArmTicker(g);
  crRenderHint();
  crGridPump(g);
}