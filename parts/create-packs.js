// ===== Beta 1.118: CREATE A ROUTE (Step 2 of the route programme; Andrew's approved mockups) =====
// The HYBRID flow: Door 1 turns a photo of a route map into a draft (the
// photo is read by Muse OUTSIDE the app - the app has no photo reader by
// design; see docs/ARCHITECTURE.md) and imports the returned draft file;
// Door 2 searches a street (Nominatim), flies there, and lets Andrew TAP
// roads on the map - a tap chooses a street's IDENTITY from the basemap's
// roads layer, never its geometry: the street's true shape is fetched from
// the Overpass API at tap time and stitched with the sandbox's rules
// (endpoint chaining, divided roads chain into their hairpin). Both doors
// land in one shared preview ("Review selection") with corrections, then a
// name-it step, then the pack is saved on-device (below).
// PACK FORMAT (defined once, here and in docs/ARCHITECTURE.md): the same
// shape as a ROUTE_PACKS entry - { name, area, mains: [names], roads:
// { street: [segment, ...] }, reference: {...}, tileNames?: [...] }, each
// segment an array of [lat, lng] points. normalizePack is the one validator
// every entry path (draft import, save, backup restore, boot merge) uses.
const USERPACKS_KEY = 'snowroute.v2.userpacks'; // the on-device record of created routes: { <id>: <pack> }. Shipped packs live in data.js; created packs live here.
const SHIPPED_PACK_IDS = new Set(ROUTE_PACKS.map(p => p.id)); // captured at eval, BEFORE any user pack merges - data.js holds shipped packs only
function readUserPacks() { // the stored record, or null when it cannot be read/parsed at all (callers that must not lose data treat null as a failure; lenient callers use loadUserPacks)
  try { const raw = localStorage.getItem(USERPACKS_KEY); if (raw == null) return {}; const o = JSON.parse(raw); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null; } catch (e) { return null; }
}
function loadUserPacks() { const r = readUserPacks(); return r || {}; }
// ===== Beta 1.166: created routes live in IndexedDB, one record per route =====
// The legacy record above was ONE localStorage value holding EVERY created route's geometry: a single legal pack can be 1-4 MB inside the ~5 MB localStorage budget shared with everything else, one failed save of it endangered every route in it, and a corrupt record failed the strict writers for routes that had nothing to do with the corruption. The store below gives each route its own record and its own transaction: a save touches one route, a failure refuses one route, and boot never waits on any of it. The database is a SIBLING of the city cache (docs/STORAGE-SCHEMA.md contracts snowroute-citycache as a re-downloadable cache, never user data) so the two failure domains stay separate. Every write is VERIFIED by read-back before its caller may proceed - the same discipline lsSet's read-back gives localStorage writes, carried to a store that has no synchronous verify of its own.
const UP_IDB_NAME = 'snowroute-userdata', UP_IDB_STORE = 'packs';
const UP_MIG_KEY = 'snowroute.v2.userpacks.migrated'; // '1' once a legacy drain has completed with parity verified. Housekeeping only: boot reads the legacy record whenever one is present, marker or not, so a downgrade-then-upgrade cycle can never strand routes an older build wrote back into the record
const UP_READ_FAILED = {}; // strict-read sentinel (RAW_READ_FAILED's sibling): a FAILED store read must stay distinguishable from an absent route - a writer about to overwrite a route it could not read first refuses, before anything is written
const UP_TX_FAILED = {}; // internal: a store transaction that errored, aborted, or never opened - distinct from a successful read of an absent key
let userPackCache = {}; // the merged {id: pack} picture of BOTH homes (the store + any not-yet-drained legacy entries, legacy winning per id) - what the synchronous backup export serializes. It only ever reflects VERIFIED writes and the boot read: every writer updates it at its commit point and nowhere else
let upStoreComplete = false; // true once the boot store read has succeeded, i.e. once userPackCache is provably the COMPLETE created-route picture. A failed boot read leaves it false and the strict backup export refuses (audit B04: never ship a valid-looking backup that silently lost routes) while the best-effort recovery export tops the cache up from validated memory instead
let upStatus = { state: 'boot' }; // the init outcome, exposed as window.__userPacksStatus for the battery (the migratePack status-object precedent)
function upCanon(v) { if (v === null || typeof v !== 'object') return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(upCanon).join(',') + ']'; return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + upCanon(v[k])).join(',') + '}'; } // key-order-insensitive canonical form for read-back equality: a structured-clone round-trip through IndexedDB is not a byte channel, so equality is judged on content, never on key order
function upIdbOpen() { return new Promise(res => { let rq; try { rq = indexedDB.open(UP_IDB_NAME, 1); } catch (e) { res(null); return; } rq.onupgradeneeded = () => { const db = rq.result; if (!db.objectStoreNames.contains(UP_IDB_STORE)) db.createObjectStore(UP_IDB_STORE, { keyPath: 'id' }); }; rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); rq.onblocked = () => res(null); }); }
function upTx(mode, fn) { return new Promise(res => { upIdbOpen().then(db => { if (!db) { res(UP_TX_FAILED); return; } let req; try { const tx = db.transaction(UP_IDB_STORE, mode); tx.oncomplete = () => { db.close(); res(req ? req.result : true); }; tx.onerror = () => { db.close(); res(UP_TX_FAILED); }; tx.onabort = () => { db.close(); res(UP_TX_FAILED); }; req = fn(tx.objectStore(UP_IDB_STORE)); } catch (e) { try { db.close(); } catch (e2) {} res(UP_TX_FAILED); } }); }); } // one short transaction per operation, the crIdb* shape - and a write counts at transaction COMPLETE, never at request success alone
async function upGetAll() { const all = await upTx('readonly', st => st.getAll()); if (all === UP_TX_FAILED || !Array.isArray(all)) return null; const map = {}; for (const rec of all) if (rec && typeof rec === 'object' && typeof rec.id === 'string') map[rec.id] = rec; return map; } // {id: pack} for the whole store; null on any failure
async function upGet(id) { const rec = await upTx('readonly', st => st.get(id)); if (rec === UP_TX_FAILED) return UP_READ_FAILED; return rec === undefined ? null : rec; } // one pack: the pack, null when absent, UP_READ_FAILED when the read itself failed - a failed transaction and an absent key resolve differently above, and the distinction is the point
async function upPut(id, pack) { const rec = { ...pack, id }; const w = await upTx('readwrite', st => st.put(rec)); if (w === UP_TX_FAILED) return false; const back = await upGet(id); return !!back && back !== UP_READ_FAILED && upCanon(back) === upCanon(rec); } // a created-route write counts only when the record reads back content-equal - the verified half of the house write discipline, and the gate every caller refuses on
async function upDel(id) { const w = await upTx('readwrite', st => st.delete(id)); if (w === UP_TX_FAILED) return false; return (await upGet(id)) === null; } // deletion likewise: verified absent before the caller may treat the route as gone
async function initUserPacks() { // first-1.166-launch migration + every later boot's store registration. Never rejects and never blocks boot: the synchronous legacy registration below has already run, so any failure here leaves the app fully usable on the legacy data and the drain simply retries next launch
  const result = { state: 'done', fromStore: 0, fromLegacy: 0, drained: 0, migrated: false, legacyDeleted: false };
  try {
    const legacy = readUserPacks(); // null = a corrupt record: left exactly as it stands (never deleted blind), its routes unavailable this boot exactly as before 1.166, the store still registers below
    const stored = await upGetAll();
    if (stored) {
      upStoreComplete = true;
      userPackCache = { ...stored };
      for (const id of Object.keys(stored)) { if (ROUTE_PACKS.some(p => p.id === id)) continue; const v = normalizePack(stored[id], {}); if (!v.ok) continue; v.pack.id = id; ROUTE_PACKS.push(v.pack); result.fromStore++; } // fill-only (the rk.migfill discipline): an id the legacy pass already registered keeps the legacy copy - for drained ids the two are content-equal by the parity check below, and a legacy record an older build wrote after a downgrade is the NEWER copy, so it wins
    }
    if (legacy) {
      userPackCache = { ...userPackCache, ...legacy };
      result.fromLegacy = Object.keys(legacy).length;
      if (stored && result.fromLegacy) { // the drain: every legacy route lands in the store, verified, before the marker may commit
        let drainedAll = true;
        for (const id of Object.keys(legacy)) { if (id in stored) continue; if (await upPut(id, legacy[id])) { result.drained++; stored[id] = legacy[id]; } else { drainedAll = false; break; } }
        if (drainedAll) { const check = await upGetAll(); if (check && Object.keys(legacy).every(id => id in check && upCanon(check[id]) === upCanon({ ...legacy[id], id }))) { if (lsSet(UP_MIG_KEY, '1') && lsGet(UP_MIG_KEY) === '1') { result.migrated = true; if (lsDel(USERPACKS_KEY) && localStorage.getItem(USERPACKS_KEY) === null) result.legacyDeleted = true; } } } // parity re-checked against a FRESH full read before the marker commits (never delete the only copy; the marker write is itself verified; a failed legacy delete is inert - the record simply drains again next boot against an already-complete store). The expected form carries the id: a stored record is the pack WITH its key as its id field (upPut's shape), while a legacy value may or may not embed it - app-written ones do, planted ones need not, and parity judges the route's content, not the envelope
      }
    }
  } catch (e) { result.state = 'failed'; }
  upStatus = result;
  if (typeof renderRouteLists === 'function') renderRouteLists();
  return result;
}
function normalizePack(raw, opts) { // -> { ok: true, pack } | { ok: false, error } - fail-closed with a named error, nothing half-built
  opts = opts || {};
  const bad = m => ({ ok: false, error: m });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('it is not a route pack');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (name.length > PACK_NAME_MAX) return bad('the route name is too long');
  if (!opts.draft && !name) return bad('the route has no name');
  const area = typeof raw.area === 'string' ? raw.area.trim().slice(0, PACK_AREA_MAX) : '';
  let totalPts = 0;
  let totalLen = 0;
  const cleanRoads = (obj, label) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { error: 'the ' + label + ' are missing or the wrong shape' };
    const out = {}; const names = Object.keys(obj);
    if (names.length > PACK_STREETS_MAX) return { error: 'too many streets in the ' + label };
    for (const nm0 of names) {
      const nm = nm0.trim();
      if (!nm || nm.length > PACK_STREET_NAME_MAX) return { error: 'a street name in the ' + label + ' is missing or too long' };
      if (out[nm]) return { error: 'the street "' + nm + '" appears twice' };
      const segsIn = obj[nm0];
      if (!Array.isArray(segsIn) || !segsIn.length || segsIn.length > PACK_SEGS_MAX) return { error: 'the street "' + nm + '" has no usable shape' };
      const segs = [];
      for (const segIn of segsIn) {
        if (!Array.isArray(segIn) || segIn.length < 2 || segIn.length > PACK_SEG_PTS_MAX) return { error: 'the street "' + nm + '" has a bad segment' };
        const seg = [];
        for (const pt of segIn) {
          if (!Array.isArray(pt) || pt.length < 2 || !isFinite(pt[0]) || !isFinite(pt[1]) || Math.abs(pt[0]) > 90 || Math.abs(pt[1]) > 180) return { error: 'the street "' + nm + '" has a bad map point' };
          const p = [Math.round(pt[0] * 1e7) / 1e7, Math.round(pt[1] * 1e7) / 1e7];
          if (!seg.length || seg[seg.length - 1][0] !== p[0] || seg[seg.length - 1][1] !== p[1]) seg.push(p);
          if (++totalPts > PACK_POINTS_MAX) return { error: 'the route is too big' };
        }
        if (seg.length > 1) { segs.push(seg); for (let li = 1; li < seg.length; li++) totalLen += distM(seg[li - 1], seg[li]); if (totalLen > PACK_LENGTH_MAX_M) return { error: 'the route is too long' }; } // Beta 1.152 (NV round, NV1): the total-length ceiling, accumulated over the CLEANED segments (roads and reference alike). Nothing else bounds a pack's length - the point caps alone allow one crafted street of ~246,000 km - and samplesFor (app3) lays one sample per COV_SAMPLE_M over whatever it is given: the audit measured 16.4M samples / ~756 MB from a single crafted street. The ceiling (~4x the worst legitimate pack, the 300 longest Toronto streets at 2,962 km) bounds every validated pack to ~800,000 samples.
      }
      if (!segs.length) return { error: 'the street "' + nm + '" has no usable shape' };
      out[nm] = segs;
    }
    return { roads: out };
  };
  const rc = cleanRoads(raw.roads, 'roads'); if (rc.error) return bad(rc.error);
  if (!Object.keys(rc.roads).length) return bad(opts.draft ? 'the draft has no streets' : 'the route has no streets');
  let reference = {};
  if (raw.reference !== undefined) { const fc = cleanRoads(raw.reference, 'reference features'); if (fc.error) return bad(fc.error); reference = fc.roads; for (const nm of Object.keys(reference)) if (rc.roads[nm]) delete reference[nm]; }
  const mainsIn = raw.mains !== undefined ? raw.mains : raw.main;
  const mains = [];
  if (mainsIn !== undefined) {
    if (!Array.isArray(mainsIn)) return bad('the mains list is the wrong shape');
    for (const m of mainsIn) if (typeof m === 'string' && rc.roads[m] && !mains.includes(m)) mains.push(m);
  }
  const tileSet = new Set(Object.keys(rc.roads));
  if (Array.isArray(raw.tileNames)) for (const t of raw.tileNames) if (typeof t === 'string' && t && t.length <= PACK_TILENAME_MAX && tileSet.size < PACK_TILENAMES_MAX) tileSet.add(t);
  if (opts.tileNames) for (const t of opts.tileNames) if (typeof t === 'string' && t && t.length <= PACK_TILENAME_MAX && tileSet.size < PACK_TILENAMES_MAX) tileSet.add(t);
  let box = null;
  if (raw.box && isFinite(raw.box.w) && isFinite(raw.box.s) && isFinite(raw.box.e) && isFinite(raw.box.n) && raw.box.w < raw.box.e && raw.box.s < raw.box.n) box = { w: raw.box.w, s: raw.box.s, e: raw.box.e, n: raw.box.n };
  else { const cb = computeRouteBox({ ...rc.roads, ...reference }); if (cb) box = { w: Math.max(-180, cb.w - 0.03), s: Math.max(-90, cb.s - 0.025), e: Math.min(180, cb.e + 0.03), n: Math.min(90, cb.n + 0.025) }; }
  if (box && (box.w < -180 || box.e > 180 || box.s < -90 || box.n > 90 || box.e - box.w > PACK_BOX_MAX_DEG || box.n - box.s > PACK_BOX_MAX_DEG)) return bad('the route area is too big'); // Beta 1.152 (NV round, NV3a): extent and world-bounds validation, fail-closed like every other check here, over the declared box and the derived one alike. A box is an offline-download area and the tile enumerators (app4) iterate it zoom by zoom: a worldwide box enumerates ~356.8M tile URLs per source and never returns (measured) - it is a preload wedge, not a route. The ceiling (~7.6x the widest shipped city bbox, 10x the declared 5W box) rejects it at EVERY entry point, this validator being the single gate for draft import, save, backup restore and the boot merge. The enumerators carry their own budget as well (NV3b), for records that never pass through here.
  const cleaned = { name, area, main: mains, spot: {}, tileNames: [...tileSet], box, roads: rc.roads, reference };
  const pack = {};
  for (const f of PACK_FIELDS) { if (f in cleaned) pack[f] = cleaned[f]; else if (raw[f] !== undefined) pack[f] = raw[f]; } // Beta 1.131 (programme A): the pack is built by walking PACK_FIELDS (app1) - the list is the single source for what a pack carries. Every listed field has a cleaner above today, so the raw fall-through never fires; it exists so a future field added to the list (before its cleaner lands) is carried through rather than silently dropped - the pre-1.131 trap was the hand-written return literal here forgetting a field.
  return { ok: true, pack };
}
function mergeUserPacks() { // boot: the runtime pack list = shipped packs + created packs (a created pack wins an id collision - created ids are generated slugs that never collide with a shipped id, so a collision means the record was hand-edited; the created route is Andrew's data and wins)
  const rec = loadUserPacks();
  for (const id of Object.keys(rec)) {
    const v = normalizePack(rec[id], {});
    if (!v.ok) continue; // a created pack that no longer validates is skipped, never half-loaded; its record and slot stay on the device untouched
    v.pack.id = id;
    const ix = ROUTE_PACKS.findIndex(p => p.id === id);
    if (ix >= 0) ROUTE_PACKS[ix] = v.pack; else ROUTE_PACKS.push(v.pack);
  }
}
mergeUserPacks(); // Beta 1.166: this synchronous pass is now the LEGACY half of the boot - the pre-1.166 record registers exactly as every earlier build registered it, so a first 1.166 boot is fully usable on the legacy data before the store read lands, and the record stays the fallback read until initUserPacks' drain has verified every route into the store
window.__userPacksReady = initUserPacks(); // Beta 1.166: the store half of the boot + the migration drain, exposed (with the status reader below) so the battery can await and inspect it - the migratePack/__migrateStatus precedent. Fire-and-forget for the app itself: it never blocks the boot, and because the marker is earned, an incomplete drain simply runs again next boot
window.__userPacksStatus = () => upStatus;
window.__userPacksReady.then(() => { if (parseJ(lsGet(LS.pre), null)) migratePack(); }); // Beta 1.143 (DA-07), re-seated in 1.166: the pack migration starts only after created packs have registered from BOTH homes - the manifest migratePack captures from preloadUrlList() must be the union over shipped + created packs wherever they live now (through 1.165 this fired directly after the synchronous merge above; the store half of registration is asynchronous, so the start chains on its settle - which resolves on EVERY path, failure included, leaving the legacy-only union as the floor)
function uniqueRouteId(name) { // a slug from the name, uniqueness-checked against shipped + created ids
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'route';
  let id = base, i = 2;
  while (ROUTE_PACKS.some(p => p.id === id)) { id = base + '-' + i; i++; }
  return id;
}
function nextRouteNameGuess() { let mx = 1; for (const p of ROUTE_PACKS) { const m = /^Route (\d+)$/.exec(p.name || ''); if (m) mx = Math.max(mx, +m[1] + 1); } return 'Route ' + Math.max(mx, ROUTE_PACKS.length + 1); }

