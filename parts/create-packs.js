// ===== CREATE A ROUTE ===== taps choose identity, never geometry: shapes come from the extract, stitched by the sandbox's rules
const USERPACKS_KEY = 'snowroute.v2.userpacks'; // the on-device record of created routes: { <id>: <pack> }. Shipped packs live in data.js; created packs live here.
const SHIPPED_PACK_IDS = new Set(ROUTE_PACKS.map(p => p.id)); // captured at eval, BEFORE any user pack merges - data.js holds shipped packs only
const SHIPPED_DELETED_KEY = 'snowroute.v2.shippeddeleted'; // tombstones for deleted shipped packs: their definition lives in code, so deletion writes this record; device-only, never backed up
/** @returns {string[]|null} */
function readShippedDeleted() { // the stored tombstone list, or null when unreadable (strict writers treat null as failure, never rewrite blind)
  try { const raw = localStorage.getItem(SHIPPED_DELETED_KEY); if (raw == null) return []; const o = JSON.parse(raw); return Array.isArray(o) ? o.filter(x => typeof x === 'string') : null; } catch (e) { return null; }
}
function loadShippedDeleted() { const r = readShippedDeleted(); return r || []; }
function readUserPacks() { // the stored record, or null when unreadable (strict callers treat null as failure; lenient ones use loadUserPacks)
  try { const raw = localStorage.getItem(USERPACKS_KEY); if (raw == null) return {}; const o = JSON.parse(raw); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null; } catch (e) { return null; }
}
function loadUserPacks() { const r = readUserPacks(); return r || {}; }
// ===== created routes in IndexedDB, one record each ===== a save touches only its route; every write verified by read-back
const UP_IDB_NAME = 'snowroute-userdata', UP_IDB_STORE = 'packs';
const UP_MIG_KEY = 'snowroute.v2.userpacks.migrated'; // '1' once a legacy drain completed with parity verified; boot reads the legacy record whenever present, marker or not
const UP_READ_FAILED = {}; // a failed store read stays distinguishable from an absent route: overwriting an unread route is refused before writing
const UP_TX_FAILED = {}; // internal: a store transaction that errored, aborted, or never opened - distinct from a successful read of an absent key
let userPackCache = /** @type {UserPacksRecord} */ ({}); // the merged {id: pack} picture of both homes (the backup export's source); it reflects only verified writes
let upStoreComplete = false; // true once the boot read succeeded: only then is the cache provably complete and the strict backup export allowed
let upStatus = /** @type {UserPacksStatus} */ ({ state: 'boot' }); // the init outcome, exposed as window.__userPacksStatus for the battery (the migratePack status-object precedent)
/** @param {any} v @returns {string} */
function upCanon(v) { if (v === null || typeof v !== 'object') return JSON.stringify(v);
if (Array.isArray(v)) return '[' + v.map(upCanon).join(',') + ']';
return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + upCanon(v[k])).join(',') + '}';
} // key-order-insensitive canonical form: IndexedDB round-trips are not byte channels, so equality judges content, never key order
/** @returns {Promise<any>} */
function upIdbOpen() { return new Promise(res => { let rq; try { rq = indexedDB.open(UP_IDB_NAME,
  1); } catch (e) { res(null); return; } rq.onupgradeneeded = () => { const db = rq.result; if (!db.objectStoreNames.contains(UP_IDB_STORE)) db.createObjectStore(UP_IDB_STORE,
  { keyPath: 'id' }); }; rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); rq.onblocked = () => res(null); });
}
/** @param {string} mode @param {(store: AppIdbStore) => AppIdbRequest} fn @returns {Promise<any>} */
function upTx(mode, fn) { return new Promise(res => { upIdbOpen().then(db => { if (!db) { res(UP_TX_FAILED); return; } 
/** @type {AppIdbRequest|undefined} */
let req; try { const tx = db.transaction(UP_IDB_STORE, mode); tx.oncomplete = () => { db.close(); res(req ?
  req.result :
    true); }; tx.onerror = () => { db.close(); res(UP_TX_FAILED); }; tx.onabort = () => { db.close(); res(UP_TX_FAILED); }; req = fn(tx.objectStore(UP_IDB_STORE)); } catch (e) { try { db.close(); } catch (e2) {} res(UP_TX_FAILED); } }); });
} // one short transaction per operation: a write counts at transaction COMPLETE, never at request success alone
/** @returns {Promise<any>} */
async function upGetAll() { const all = await upTx('readonly', st => st.getAll()); if (all === UP_TX_FAILED || !Array.isArray(all)) return null;
const map = /** @type {Record<string,any>} */ ({});
for (const rec of all) if (rec && typeof rec === 'object' && typeof rec.id === 'string') map[rec.id] = rec; return map; } // {id: pack} for the whole store; null on any failure
// one pack: the pack, null when absent, UP_READ_FAILED when the read itself failed - the distinction is the point
/** @param {string} id @returns {Promise<any>} */
async function upGet(id) { const rec = await upTx('readonly', st => st.get(id)); if (rec === UP_TX_FAILED) return UP_READ_FAILED; return rec === undefined ? null : rec; }
/** @param {string} id @param {RoutePack} pack @returns {Promise<boolean>} */
async function upPut(id, pack) { const rec = { ...pack, id };
const w = await upTx('readwrite', st => st.put(rec));
if (w === UP_TX_FAILED) return false;
const back = await upGet(id);
return !!back && back !== UP_READ_FAILED && upCanon(back) === upCanon(rec);
} // a created-route write counts only when the record reads back content-equal - the gate every caller refuses on
/** @param {string} id @returns {Promise<boolean>} */
async function upDel(id) { const w = await upTx('readwrite', st => st.delete(id));
if (w === UP_TX_FAILED) return false;
return (await upGet(id)) === null;
} // deletion likewise: verified absent before the caller may treat the route as gone
/** @returns {Promise<UserPacksStatus>} */
async function initUserPacks() { // migration + boot registration; never blocks boot: on failure the app runs on legacy data and the drain retries
  const result = { state: 'done', fromStore: 0, fromLegacy: 0, drained: 0, migrated: false, legacyDeleted: false };
  try {
    const legacy = readUserPacks(); // null = corrupt: left exactly as it stands, never deleted blind; its routes sit out this boot
    const stored = await upGetAll();
    if (stored) {
      upStoreComplete = true;
      userPackCache = { ...stored };
      // fill-only: a legacy-registered id keeps the legacy copy (an older build's post-downgrade write is the newer copy)
      for (const id of Object.keys(stored)) { if (ROUTE_PACKS.some(p => p.id === id)) continue; const v = normalizePack(stored[id], {}); if (!v.ok) continue; v.pack.id = id; ROUTE_PACKS.push(v.pack); result.fromStore++; }
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
// ===== boundary ends ===== paint ends at the join, fading over the record's fadeM (15 m); junctions are never feathers
const BOUNDARY_FADE_M = 15; // a boundary end's fade length, carried on each record (element 5): the length is per-record data
const DEAD_FADE_M = 10; // a dead end's fade length, likewise per-record
/** @param {AnyPoint} p @param {AnyPoint} a @param {AnyPoint} b @returns {number} */
function endsPtSeg(p, a, b) { // distance from p to segment a-b in flat-metre space, shared by both end computations
  const ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, px = p[1] * MLNG, py = p[0] * MLAT;
  const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
  let t = L2 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}
/** @param {string[]} routeNames @param {(n: string) => LatLng[][]} runsOf @param {string} n @param {LatLng} E @returns {boolean} */
function endsJunction(routeNames, runsOf, n, E) { // another route street's vertex at the run end (<=2 m): the one junction test both end computations judge by
  for (const m of routeNames) { if (m === n) continue; for (const rl of runsOf(m)) for (const v of rl) if (Math.abs(v[0] - E[0]) < 0.00004 && Math.abs(v[1] - E[1]) < 0.00004 && distM(v, E) <= 2) return true; }
  return false;
}
/** @param {RoadsMap} roads @param {RoadsMap} allStreets @returns {Record<string,number[][]>} */
function computeBoundaryEnds(roads, allStreets) {
  const out = /** @type {Record<string,number[][]>} */ ({});
  if (!roads || !allStreets) return out;
  const routeNames = Object.keys(roads);
  const runsCache = /** @type {Record<string,LatLng[][]>} */ ({});
  /** @param {string} n @returns {LatLng[][]} */
  const runsOf = n => runsCache[n] || (runsCache[n] = stitchRuns(n, roads));
  const ptSeg = endsPtSeg;
  /** @param {AnyPoint} a @param {AnyPoint} b @param {AnyPoint} c @param {AnyPoint} d @returns {LatLng|null} */
  const segX = (a, b, c, d) => { // the two segments' crossing point, or null (parallel/collinear included)
    const ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, cx = c[1] * MLNG, cy = c[0] * MLAT, dx = d[1] * MLNG, dy = d[0] * MLAT;
    const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(den) < 1e-9) return null;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  for (const n of routeNames) {
    for (const line of runsOf(n)) {
      const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distM(line[i - 1], line[i]));
      const total = cum[cum.length - 1];
      /** @param {number} d @returns {LatLng} */
      const atD = d => { // the point at along-run distance d (sliceLine's interpolation)
        for (let i = 1;
        i < line.length;
        i++) { if (d <= cum[i] || i === line.length - 1) { const span = cum[i] - cum[i - 1] || 1;
        const t = Math.max(0, Math.min(1, (d - cum[i - 1]) / span));
        return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
        } }
        return line[line.length - 1];
      };
      for (const atStart of [true, false]) {
        const E = atStart ? line[0] : line[line.length - 1];
        if (endsJunction(routeNames, runsOf, n, E)) continue; // another route street's vertex at E: a route junction owns this end
        const crossings = []; // { street, behind, pt } - behind = metres from E back along the run
        for (const m of Object.keys(allStreets)) {
          if (routeNames.includes(m)) continue;
          const ways = allStreets[m]; if (!Array.isArray(ways)) continue;
          let collinear = false; const mine = [];
          for (const w of ways) {
            if (!Array.isArray(w)) continue;
            for (let i = 1; i < w.length; i++) {
              const a = w[i - 1], b = w[i];
              if (ptSeg(E, a, b) > 45) continue; // nothing this segment does can touch the end's window
              // a segment along the run is the street's own continuation, never a boundary
              const pa = projOnLine(line, cum, a), pb = projOnLine(line, cum, b);
              if (pa.off <= 1 && pb.off <= 1) { collinear = true; continue; }
              for (let j = 1; j < line.length; j++) {
                const dSeg = atStart ? cum[j] : total - cum[j - 1]; // this run segment's nearest behind value
                if (dSeg > 34 && (atStart ? cum[j - 1] : total - cum[j]) > 34) continue;
                const X = segX(line[j - 1], line[j], a, b);
                if (X) { const dX = cum[j - 1] + distM(line[j - 1], X); const behind = atStart ? dX : total - dX; if (behind >= -0.5 && behind <= 32) mine.push({ street: m, behind, pt: X }); }
              }
              for (const v of [a, b]) { // a way ENDING on the run (a T from the far side) is a crossing too
                const pv = projOnLine(line, cum, v);
                if (pv.off <= 0.75) { const behind = atStart ? pv.d : total - pv.d; if (behind >= -0.5 && behind <= 32) mine.push({ street: m, behind, pt: atD(pv.d) }); }
              }
            }
          }
          if (!collinear) crossings.push(...mine);
        }
        if (!crossings.length) continue; // no crossing: not a boundary end - computeDeadEnds below decides dead end (record) or pick end (none)
        let minBehind = Infinity; for (const c of crossings) if (c.behind < minBehind) minBehind = c.behind;
        const street0 = crossings.find(c => c.behind === minBehind).street; // the boundary street is the closest crossing's
        let joinBehind = minBehind; // the join is the street's furthest-back crossing near the end (its first centreline); the cluster bound excludes unrelated crossings
        for (const c of crossings) if (c.street === street0 && c.behind <= minBehind + 20 && c.behind > joinBehind) joinBehind = c.behind;
        const join = atD(atStart ? joinBehind : total - joinBehind);
        /** @param {number} v @returns {number} */
        const r6 = v => Math.round(v * 1e6) / 1e6;
        (out[n] = out[n] || []).push([r6(E[0]), r6(E[1]), r6(join[0]), r6(join[1]), BOUNDARY_FADE_M]); // element 5 is the fade length, per-record data the engine reads (older 4-element records default to 15 there)
      }
    }
  }
  return out;
}
// ===== dead ends ===== no junction, no boundary end, and the street's geometry terminates there; the join IS the end
/** @param {RoadsMap} roads @param {RoadsMap} allStreets @returns {Record<string,number[][]>} */
function computeDeadEnds(roads, allStreets) {
  const out = /** @type {Record<string,number[][]>} */ ({});
  if (!roads || !allStreets) return out;
  const routeNames = Object.keys(roads);
  const boundary = computeBoundaryEnds(roads, allStreets);
  const runsCache = /** @type {Record<string,LatLng[][]>} */ ({});
  /** @param {string} n @returns {LatLng[][]} */
  const runsOf = n => runsCache[n] || (runsCache[n] = stitchRuns(n, roads));
  /** @param {number} v @returns {number} */
  const r6 = v => Math.round(v * 1e6) / 1e6;
  for (const n of routeNames) {
    const ownNames = Object.keys(allStreets).filter(m => m === n || m.startsWith(n + ' ') || n.startsWith(m + ' ')); // exact name first: a draft's full-name key IS a route name and must not be vetoed by route membership
    for (const line of runsOf(n)) {
      for (const atStart of [true, false]) {
        const E = atStart ? line[0] : line[line.length - 1];
        const inward = atStart ? line[1] : line[line.length - 2];
        if (!inward) continue;
        if (endsJunction(routeNames, runsOf, n, E)) continue; // the shared junction test (endsJunction): another route street's vertex at E owns the end
        if ((boundary[n] || []).some(r => distM([r[0], r[1]], E) <= 1.5)) continue; // a boundary end: the 15 m class owns it
        // the run's outward direction at E, flat-metre space
        const ox = (E[1] - inward[1]) * MLNG, oy = (E[0] - inward[0]) * MLAT, oLen = Math.hypot(ox, oy) || 1;
        const ux = ox / oLen, uy = oy / oLen;
        let terminates = false, extendsPast = false, otherNear = false;
        for (const m of Object.keys(allStreets)) {
          const isOwn = ownNames.includes(m);
          if (routeNames.includes(m) && !isOwn) continue; // other selected streets are not evidence either way; the current street's own geometry is (the exact-name case above)
          const ways = allStreets[m]; if (!Array.isArray(ways)) continue;
          for (const w of ways) {
            if (!Array.isArray(w) || w.length < 2) continue;
            if (isOwn) {
              if (!w.some(p => distM(p, E) <= 50)) continue; // a same-prefix street across the city is not this street (the Julian Drive guard)
              if (distM(w[0], E) <= 2 || distM(w[w.length - 1], E) <= 2) terminates = true;
              for (const p of w) { const t = ((p[1] - E[1]) * MLNG) * ux + ((p[0] - E[0]) * MLAT) * uy; if (t > 2) { extendsPast = true; break; } }
            } else {
              if (distM(w[0], E) <= 12 || distM(w[w.length - 1], E) <= 12) { otherNear = true; continue; }
              for (let i = 1; i < w.length; i++) if (endsPtSeg(E, w[i - 1], w[i]) <= 4) { otherNear = true; break; }
            }
            if (extendsPast || otherNear) break;
          }
          if (extendsPast || otherNear) break;
        }
        if (!terminates || extendsPast || otherNear) continue; // a pick end (geometry continues), an end something else nearly touches, or no own geometry in hand: no record
        (out[n] = out[n] || []).push([r6(E[0]), r6(E[1]), r6(E[0]), r6(E[1]), DEAD_FADE_M]);
      }
    }
  }
  return out;
}
/** @param {any} raw @param {PackNormalizeOpts} opts @returns {NormalizePackResult} */
function normalizePack(raw, opts) { // -> { ok: true, pack } | { ok: false, error } - fail-closed with a named error, nothing half-built
  opts = opts || {};
  /** @param {string} m @returns {NormalizePackResult} */
  const bad = m => ({ ok: false, error: m });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('it is not a route pack');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (name.length > PACK_NAME_MAX) return bad('the route name is too long');
  if (!opts.draft && !name) return bad('the route has no name');
  const area = typeof raw.area === 'string' ? raw.area.trim().slice(0, PACK_AREA_MAX) : '';
  let totalPts = 0;
  let totalLen = 0;
  /** @param {any} obj @param {string} label @returns {CleanRoadsResult} */
  const cleanRoads = (obj, label) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { error: 'the ' + label + ' are missing or the wrong shape' };
    const out = Object.create(null); const names = Object.keys(obj); // prototype-free: on an object, a first 'constructor'/'__proto__' street read as a duplicate or could not be stored
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
        // the length ceiling over cleaned segments: unbounded, one crafted street would make samplesFor lay millions of samples
        if (seg.length > 1) { segs.push(seg); for (let li = 1; li < seg.length; li++) totalLen += distM(seg[li - 1], seg[li]); if (totalLen > PACK_LENGTH_MAX_M) return { error: 'the route is too long' }; }
      }
      if (!segs.length) return { error: 'the street "' + nm + '" has no usable shape' };
      out[nm] = segs;
    }
    return { roads: out };
  };
  const rc = cleanRoads(raw.roads, 'roads'); if (rc.error) return bad(rc.error);
  if (!Object.keys(rc.roads).length) return bad(opts.draft ? 'the draft has no streets' : 'the route has no streets');
  let reference = /** @type {RoadsMap} */ ({});
  if (raw.reference !== undefined) { const fc = cleanRoads(raw.reference, 'reference features'); if (fc.error) return bad(fc.error); reference = fc.roads; for (const nm of Object.keys(reference)) if (rc.roads[nm]) delete reference[nm]; }
  const primariesIn = raw.primaries; // the one key, no aliases: an older 'main'/'mains' field normalizes to empty primaries, streets intact, never rejected
  const primaries = /** @type {string[]} */ ([]);
  if (primariesIn !== undefined) {
    if (!Array.isArray(primariesIn)) return bad('the primaries list is the wrong shape');
    for (const m of primariesIn) if (typeof m === 'string' && rc.roads[m] && !primaries.includes(m)) primaries.push(m);
  }
  const tileSet = new Set(Object.keys(rc.roads));
  if (Array.isArray(raw.tileNames)) for (const t of raw.tileNames) if (typeof t === 'string' && t && t.length <= PACK_TILENAME_MAX && tileSet.size < PACK_TILENAMES_MAX) tileSet.add(t);
  if (opts.tileNames) for (const t of opts.tileNames) if (typeof t === 'string' && t && t.length <= PACK_TILENAME_MAX && tileSet.size < PACK_TILENAMES_MAX) tileSet.add(t);
  let box = null;
  if (raw.box && isFinite(raw.box.w) && isFinite(raw.box.s) && isFinite(raw.box.e) && isFinite(raw.box.n) && raw.box.w < raw.box.e && raw.box.s < raw.box.n) box = { w: raw.box.w, s: raw.box.s, e: raw.box.e, n: raw.box.n };
  else { const cb = computeRouteBox({ ...rc.roads, ...reference }); if (cb) box = { w: Math.max(-180, cb.w - 0.03), s: Math.max(-90, cb.s - 0.025), e: Math.min(180, cb.e + 0.03), n: Math.min(90, cb.n + 0.025) }; }
  // extent validation, fail-closed, over declared and derived boxes: a worldwide box enumerates ~356.8M tile URLs and never returns
  if (box && (box.w < -180 || box.e > 180 || box.s < -90 || box.n > 90 || box.e - box.w > PACK_BOX_MAX_DEG || box.n - box.s > PACK_BOX_MAX_DEG)) return bad('the route area is too big');
  const ends = /** @type {Record<string,number[][]>} */ ({}); // boundary records clean leniently: four in-range coordinates on a real road survive; the rest drop, never a rejection
  if (raw.ends && typeof raw.ends === 'object' && !Array.isArray(raw.ends)) {
    for (const nm of Object.keys(raw.ends)) {
      if (!rc.roads[nm] || !Array.isArray(raw.ends[nm])) continue;
      const list = [];
      for (const r of raw.ends[nm]) {
        if (!Array.isArray(r) || r.length < 4) continue;
        const a = r[0], b = r[1], c = r[2], d = r[3];
        if (!isFinite(a) || !isFinite(b) || !isFinite(c) || !isFinite(d) || Math.abs(a) > 90 || Math.abs(b) > 180 || Math.abs(c) > 90 || Math.abs(d) > 180) continue;
        const rec = [Math.round(a * 1e6) / 1e6, Math.round(b * 1e6) / 1e6, Math.round(c * 1e6) / 1e6, Math.round(d * 1e6) / 1e6];
        if (isFinite(r[4]) && r[4] > 0 && r[4] <= 100) rec.push(Math.round(r[4] * 10) / 10); // element 5: a sane fade length survives; absent or bad leaves the 4-element form and the engine default
        list.push(rec);
      }
      if (list.length) ends[nm] = list;
    }
  }
  const cleaned = /** @type {Record<string,any>} */ ({ name, area, primaries, spot: {}, tileNames: [...tileSet], box, roads: rc.roads, reference, ends });
  const pack = /** @type {RoutePack} */ ({});
  for (const f of PACK_FIELDS) { if (f in cleaned) pack[/** @type {keyof RoutePack} */ (f)] = cleaned[f];
  else if (raw[f] !== undefined) pack[/** @type {keyof RoutePack} */ (f)] = raw[f]; } // packs are built by walking PACK_FIELDS (app1): a listed field with no cleaner yet carries through, never drops
  return { ok: true, pack };
}
function mergeUserPacks() { // boot: shipped + created packs; a created pack wins an id collision (a collision means a hand-edited record)
  const rec = loadUserPacks();
  for (const id of Object.keys(rec)) {
    const v = normalizePack(rec[id], {});
    if (!v.ok) continue; // a created pack that no longer validates is skipped, never half-loaded; its record and slot stay on the device untouched
    v.pack.id = id;
    const ix = ROUTE_PACKS.findIndex(p => p.id === id);
    if (ix >= 0) ROUTE_PACKS[ix] = v.pack; else ROUTE_PACKS.push(v.pack);
  }
}
// the tombstone applies BEFORE the created-pack merge: a created pack must never be hidden by a shipped pack's tombstone
const shippedDead = loadShippedDeleted(); for (let i = ROUTE_PACKS.length - 1; i >= 0; i--) { if (shippedDead.includes(ROUTE_PACKS[i].id)) ROUTE_PACKS.splice(i, 1); }
mergeUserPacks(); // the legacy half of boot: the app is fully usable on legacy data before the store read lands
window.__userPacksReady = initUserPacks(); // the store half + drain, exposed for the battery; fire-and-forget, an incomplete drain reruns next boot
window.__userPacksStatus = () => upStatus;
window.__userPacksReady.then(() => { migratePack(); }); // chained on the packs settle so the manifest is the full union; migratePack self-gates when nothing was downloaded
/** @param {string} name @returns {string} */
function uniqueRouteId(name) { // a slug from the name, uniqueness-checked against shipped + created ids
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'route';
  let id = base, i = 2;
  // shipped ids stay reserved even when tombstoned: a created one taking one would be misread as shipped
  while (ROUTE_PACKS.some(p => p.id === id) || SHIPPED_PACK_IDS.has(id) || Object.prototype.hasOwnProperty.call(userPackCache, id)) { id = base + '-' + i; i++; }
  return id;
}
function nextRouteNameGuess() { let mx = 1; for (const p of ROUTE_PACKS) { const m = /^Route (\d+)$/.exec(p.name || ''); if (m) mx = Math.max(mx, +m[1] + 1); } return 'Route ' + Math.max(mx, ROUTE_PACKS.length + 1); }

