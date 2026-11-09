// ---- the city grid + the persistent city cache (second amendment) ----
// A picked city is covered by a grid of ~4 x 4 km cells over its bounding
// box. Cells fetch through the source seam with at most CR_GRID_PARALLEL
// in flight; each answer commits to the merged extract (and to the
// on-device cache) the moment it lands, so progress is real and a stopped
// preparation resumes by fetching only the missing cells. The cache is
// IndexedDB (docs/STORAGE-SCHEMA.md): one record per city holding its
// cells' ways in compact parsed form. It is a CACHE, never user data - it
// is not part of any backup, and losing it costs a re-download, nothing
// else. A city whose stored form would exceed the cap is refused with
// the refusal DISCLOSED; a write failure degrades to session-only with
// the same disclosure - never a silent un-save.
const CR_IDB_NAME = 'snowroute-citycache', CR_IDB_STORE = 'cities';
let crCacheNote = ''; // the disclosed cache state for the current city ('' = saving fine)
let crCacheNoteCity = ''; // Beta 1.143 (DA-06): the city the current crCacheNote belongs to - cache failure state binds to the city that EARNED it, never to whichever city happens to be current when a queued write lands
let crCacheNoteSession = -1; // Beta 1.143 (DA-06): the crSession that earned the current crCacheNote - suppression binds to (city, session) together, so a closed session's failure never mutes the live session's writes for the same city. (The verify-cycle-2 draft bound this to a per-preparation generation counter and dropped the WRITES themselves; CI drive150 J11a proved queued cell writes must survive a preparation's cancel/resume - the register's binding is the SESSION, and the write always lands.)
let crCacheQueue = Promise.resolve(); // serializes cache read-modify-writes (parallel cell commits must not clobber each other)
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
async function crIdbGet(name) {
  const db = await crIdbOpen(); if (!db) return null;
  return new Promise(res => {
    try {
      const rq = db.transaction(CR_IDB_STORE, 'readonly').objectStore(CR_IDB_STORE).get(name);
      rq.onsuccess = () => { const v = rq.result || null; try { db.close(); } catch (e) {} res(v); };
      rq.onerror = () => { try { db.close(); } catch (e) {} res(null); };
    } catch (e) { try { db.close(); } catch (e2) {} res(null); }
  });
}
async function crIdbPut(rec) {
  const db = await crIdbOpen(); if (!db) return false;
  return new Promise(res => {
    try {
      const tx = db.transaction(CR_IDB_STORE, 'readwrite');
      tx.objectStore(CR_IDB_STORE).put(rec);
      tx.oncomplete = () => { try { db.close(); } catch (e) {} res(true); };
      tx.onerror = () => { try { db.close(); } catch (e) {} res(false); };
      tx.onabort = () => { try { db.close(); } catch (e) {} res(false); };
    } catch (e) { try { db.close(); } catch (e2) {} res(false); }
  });
}
async function crIdbDelete(name) {
  const db = await crIdbOpen(); if (!db) return;
  return new Promise(res => {
    try {
      const tx = db.transaction(CR_IDB_STORE, 'readwrite');
      tx.objectStore(CR_IDB_STORE).delete(name);
      tx.oncomplete = () => { try { db.close(); } catch (e) {} res(); };
      tx.onerror = () => { try { db.close(); } catch (e) {} res(); };
    } catch (e) { try { db.close(); } catch (e2) {} res(); }
  });
}
function crCacheDisclose(cityName, sess) { // the one wording for every cache failure (cap, quota, private mode): the session keeps working, the state is SAID. Beta 1.143 (DA-06): the failure is recorded against the city whose WRITE failed (the queued step's own city) - through 1.142 this named the global crCity, so a write failing after a city switch charged the failure to the new city
  if (sess !== crSession) return; // the failure belongs to a CLOSED session (the register's session binding): it is dropped - recording it would charge a dead session's failure to the live one and suppress its writes
  if (crCacheNote && crCacheNoteCity === cityName && crCacheNoteSession === sess) return; // already disclosed for this city in this session: the state stands
  crCacheNoteCity = cityName; crCacheNoteSession = sess;
  crCacheNote = 'Couldn’t save ' + cityName + ' on this phone — it will reload next time';
  crRenderHint();
}
function crCacheSaveCell(cityName, bbox, totalCells, key, ways) { // write-through, one cell at a time, serialized; ways in the compact stored form [[id, name, pts], ...]
  const sess = crSession; // Beta 1.143 (DA-06): the commissioning session, captured with the call - suppression and disclosure below bind to it; the WRITE itself always lands, as it did through 1.142 (queued cells must survive a preparation's cancel/resume: drive150 J6a/J11a)
  crCacheQueue = crCacheQueue.then(async () => {
    if (crCacheNote && crCacheNoteCity === cityName && crCacheNoteSession === sess) return; // already refused/failed for THIS city in THIS session: stop writing, the disclosure stands (Beta 1.143, DA-06: another city's - or a closed session's - failure never mutes this session's writes)
    let rec = await crIdbGet(cityName);
    if (rec && rec.bbox && (rec.bbox.s !== bbox.s || rec.bbox.n !== bbox.n || rec.bbox.w !== bbox.w || rec.bbox.e !== bbox.e)) rec = null; // CG-PF-15: a record saved under a DIFFERENT bounding box is not this grid's cache - its cells were downloaded for another grid. Merging a fresh cell into it while overwriting its bbox would defeat the restore-time bbox guard in crCityPrepare and certify coverage that was never downloaded for this grid; a changed box starts the record over
    if (!rec) rec = { cityName, bbox, cells: {}, savedAt: Date.now(), totalCells };
    rec.bbox = bbox; rec.totalCells = totalCells;
    rec.cells[key] = { at: Date.now(), ways };
    rec.savedAt = Date.now();
    let size = 0;
    try { size = JSON.stringify(rec).length; } catch (e) {}
    if (size > CR_TIMING.cityCapBytes) { crCacheDisclose(cityName, sess); return; } // refuse BEFORE the write rather than dying mid-write (amendment C)
    if (!(await crIdbPut(rec))) crCacheDisclose(cityName, sess);
  }).catch(() => crCacheDisclose(cityName, sess));
  return crCacheQueue;
}
function crGridCellsFor(bbox) { // the ~4 x 4 km grid over a city bounding box (row-major, south-west first); the last row/column clamps to the box edge
  const dLat = CR_CELL_KM * 1000 / MLAT, dLng = CR_CELL_KM * 1000 / MLNG;
  const rows = Math.max(1, Math.ceil((bbox.n - bbox.s) / dLat - 1e-9)), cols = Math.max(1, Math.ceil((bbox.e - bbox.w) / dLng - 1e-9));
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    cells.push({ key: 'r' + r + 'c' + c, box: { s: +(bbox.s + r * dLat).toFixed(6), n: +Math.min(bbox.n, bbox.s + (r + 1) * dLat).toFixed(6), w: +(bbox.w + c * dLng).toFixed(6), e: +Math.min(bbox.e, bbox.w + (c + 1) * dLng).toFixed(6) }, state: 'pending', tries: 0 });
  }
  return cells;
}
function crGridCurrent(g) { return !!g && crGrid === g && creating && crSession === g.session && crCovGen === g.gen; }
function crGridDoneCount() { return crGrid ? crGrid.cells.filter(c => c.state === 'done').length : 0; }
function crGridFailedCount() { return crGrid ? crGrid.cells.filter(c => c.state === 'failed').length : 0; }
function crGridPendingCount() { return crGrid ? crGrid.cells.filter(c => c.state === 'pending' || c.state === 'fetching').length : 0; }
function crGridSettledState() { // the honest state of a settled grid: all in = ready; some in = degraded (usable + resumable); none in = failed - or 'none' when Andrew stopped it before anything landed
  if (!crGrid) return crCov && crCov.boxes.length ? 'ready' : 'none';
  if (crGridPendingCount() > 0 && !crGrid.stopped) return 'preparing';
  if (crGridFailedCount() === 0 && crGridPendingCount() === 0) return 'ready';
  if (crGrid.stopped) return 'degraded'; // stopped with parts missing - even zero landed - is resumable, not 'none': the Resume offer must exist (the city is part-known, its grid state is the point)
  return crGridDoneCount() > 0 ? 'degraded' : 'failed';
}
function crGridStop(why) { // stop scheduling, abort the downloads in flight, KEEP every committed cell (amendment B)
  const g = crGrid; if (!g) return;
  g.stopped = why;
  if (g.ticker) { clearInterval(g.ticker); g.ticker = null; }
  for (const op of Array.from(g.ops)) crAbortOp(op);
  g.ops.clear(); g.active = 0;
  for (const c of g.cells) if (c.state === 'fetching') c.state = 'pending';
}
function crGridFinish(g) {
  if (g.ticker) { clearInterval(g.ticker); g.ticker = null; }
  crPrepState = crGridSettledState();
  if (crPrepState === 'failed' && g.lastFail) { crPrepFail = g.lastFail; crFailFromGrid = true; }
  if (crPrepState === 'ready' || crPrepState === 'degraded') crSweepPending();
  crRenderHint();
}
function crGridPump(g) { // keep at most CR_GRID_PARALLEL cell fetches in flight; a cell that fails is retried once inside the run, then marked failed while the rest continue (amendment A)
  if (!crGridCurrent(g) || g.stopped) return;
  while (g.active < CR_GRID_PARALLEL) {
    const cell = g.cells.find(c => c.state === 'pending');
    if (!cell) break;
    cell.state = 'fetching'; cell.tries++;
    g.active++;
    const op = {}; g.ops.add(op);
    crSourceExtract(cell.box, null, CR_TIMING.budgetMs, CR_TIMING.attempt1Ms, () => crGridCurrent(g) && !g.stopped, op).then(res => {
      if (!g.ops.has(op)) return; // stopped/superseded since launch: crGridStop already zeroed the accounting - a late answer lands NOWHERE, even if this grid is later resumed under a new generation
      g.ops.delete(op); g.active--;
      if (!crGridCurrent(g)) return; // the session moved on: land nowhere (CG-PF-05)
      if (res.ok) {
        cell.state = 'done';
        crCovMerge(res.json.elements, cell.box);
        const ways = [];
        for (const el of res.json.elements || []) { const w = crCov.byId[el && el.id]; if (w) ways.push([el.id, w.name, w.pts]); }
        crCacheSaveCell(g.name, g.bbox, g.cells.length, cell.key, ways);
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
function crCityPrepare() { // a city is picked: load its whole extract - from the on-device cache when saved (instant, zero downloads), else the grid, resuming whatever a saved partial already holds (amendments A-C)
  if (!crCity || crCity.lat == null || !creating) return;
  const name = crCity.name;
  const bbox = crCity.bbox || crBoxAround(crCity.lat, crCity.lon, 8); // no bounding box from the lookup: a ~16 x 16 km box on the centre (amendment A fallback)
  const session = crSession, gen = ++crCovGen;
  if (crPrep) { clearInterval(crPrep.ticker); crAbortOp(crPrep.op); crPrep = null; }
  if (crGrid) crGridStop('superseded');
  crCov = crCovFromWays(Object.create(null), []);
  crCacheNote = ''; crCacheNoteCity = ''; // a fresh preparation starts with no failure state (Beta 1.143, DA-06: the owner binding resets with the note)
  crPackCtx = null; crPackNote = ''; // Beta 1.123: a new city's preparation re-decides its source (pack vs service) below
  const cells = crGridCellsFor(bbox);
  const g = crGrid = { name, bbox, cells, gen, session, startedAt: Date.now(), ticker: null, ops: new Set(), active: 0, fromCache: false, savedAt: null, stopped: null, lastFail: null };
  crPrepState = 'preparing'; crPrepFail = null; crWanted = null;
  crRenderHint();
  crIdbGet(name).then(rec => {
    if (!crGridCurrent(g)) return;
    let restored = 0;
    if (rec && rec.bbox && (rec.bbox.s !== bbox.s || rec.bbox.n !== bbox.n || rec.bbox.w !== bbox.w || rec.bbox.e !== bbox.e)) rec = null; // a record saved under a DIFFERENT bounding box (the lookup's answer changed) is not this grid's cache - its cell keys would restore the wrong streets
    if (rec && rec.cells) {
      for (const cell of g.cells) {
        const saved = rec.cells[cell.key];
        if (saved && Array.isArray(saved.ways)) {
          const byId = Object.create(null); // Beta 1.150: a stored way id of '__proto__' lands as an entry here, not as the map's prototype
          for (const sw of saved.ways) { const w = crCleanStoredWay(sw); if (w) byId[w.id] = { name: w.name, pts: w.pts }; } // Beta 1.150 (security-audit fix round, finding city-cache-restore-skips-way-validation): every stored triple passes the extract's own cleaning (crCleanStoredWay, create-citydata.js) before it may enter coverage - pre-1.150 this fold installed raw triples on array-shape checks alone, planting out-of-range / NaN / empty-named geometry the extract never held
          if (!Object.keys(byId).length && saved.ways.length) continue; // Beta 1.151 (hotfix for the 1.150 C2 gate's own regression): a cell is certified (box + done, below) when at least one VALIDATED way came out of it OR its stored list was legitimately EMPTY - phase 1 stores empty cells (no named streets: park/lake/city-edge) with ways: [], and the 1.150 rule conflated them with the audit's poison case, a NON-EMPTY list whose ways are all corrupt, which still stays pending here and is fetched fresh, never marked done on the cache's say-so
          crCovMerge([], null); // ensure the cov exists before the direct fold below
          for (const id of Object.keys(byId)) crCov.byId[id] = byId[id];
          const fresh = crCovFromWays(crCov.byId, crCov.boxes);
          crCov.byName = fresh.byName;
          if (!crCov.boxes.some(b => b.s === cell.box.s && b.w === cell.box.w && b.n === cell.box.n && b.e === cell.box.e)) crCov.boxes.push(cell.box);
          cell.state = 'done'; restored++;
        }
      }
      if (restored) { g.fromCache = true; g.savedAt = rec.savedAt || null; }
    }
    if (restored === g.cells.length) { crPrepState = 'ready'; crSweepPending(); crRenderHint(); return; } // fully saved: instant ready, ZERO downloads (amendment C)
    // Beta 1.123: resolve the pack BEFORE the pump starts, so the source
    // decision is the grid's from its first cell (and the hint can name
    // it). A pack city skips the minutes warning - its first load is one
    // static download, seconds not minutes.
    crPackResolveCity(name, bbox).then(pk => {
      if (!crGridCurrent(g)) return; // the session moved on while the catalogue answered: land nowhere (CG-PF-05)
      if (pk) { g.fromPack = pk.slug; crPackCtx = { slug: pk.slug, bbox: pk.bbox, failed: false }; }
      if (restored === 0 && !pk) toast('First load of ' + name + ' can take a few minutes — after that it’s instant', 5000); // timing honesty (amendment E): said once, when a real first download starts
      g.ticker = setInterval(() => { if (crGridCurrent(g) && crPrepState === 'preparing') crRenderHint(); else if (g.ticker) clearInterval(g.ticker); }, 1000);
      crRenderHint();
      crGridPump(g);
    });
  });
}
function crGridResume() { // the degraded/stopped remedy: fetch ONLY the missing cells (amendments A+B)
  const g = crGrid; if (!g || !creating) return;
  g.gen = ++crCovGen; // Cancel bumped the coverage generation to orphan late answers (CG-PF-05); resuming ADOPTS the grid into the live generation, or the pump would refuse it as obsolete and fetch nothing
  g.stopped = null; g.startedAt = Date.now();
  for (const c of g.cells) if (c.state === 'failed') { c.state = 'pending'; c.tries = 0; }
  crPrepState = 'preparing'; crPrepFail = null; crFailFromGrid = false; crWanted = null;
  if (g.ticker) clearInterval(g.ticker);
  g.ticker = setInterval(() => { if (crGridCurrent(g) && crPrepState === 'preparing') crRenderHint(); else if (g.ticker) clearInterval(g.ticker); }, 1000);
  crRenderHint();
  crGridPump(g);
}
// Beta 1.153 (Andrew): crGridRefresh is REMOVED. It was the saved city's Refresh
// affordance - drop the saved record and re-download the whole city - and its only
// door was the hint button in the healthy ready state. Andrew's rule: a city that
// loaded fine offers no reload; a FAILED load's remedy is Retry (crGridResume /
// crStartPrep), which was never this function. Nothing calls it any more.
function crFailText(f) { // the honest taxonomy (scope item 5): unreachable / answered-with-error / too-dense read differently because they ARE different
  if (!f) return '';
  if (f.kind === 'dense') return crGrid ? 'Parts of ' + (crCity ? crCity.name : 'the city') + ' were too dense to load — tap Retry to try those parts again' : 'That area is too dense to load at once — move the map to a less busy part of ' + (crCity ? crCity.name : 'the city') + ', then tap Prepare this area'; // box form per CG-PF-09: the footprint is FIXED, so zooming changes nothing - the working remedy is preparing a less dense area, and the button in this state does exactly that (map centre). Grid form: the dense cells are the failed parts, and Retry resumes exactly them
  if (f.kind === 'error') return 'The street-shape service answered with an error' + (f.status ? ' (' + f.status + ')' : '') + ' — tap Retry';
  if (f.kind === 'badjson') return 'The street-shape service sent back something unreadable — tap Retry';
  return 'The street-shape service didn’t answer — tap Retry';
}
