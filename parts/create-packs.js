// ===== Beta 1.118: CREATE A ROUTE (Step 2 of the route programme; Andrew's approved mockups) =====
// The flow: two doors (Select from list, Manual search) pick a city, the
// area's street shapes are prepared on-device, and Andrew TAPs roads on
// the map - a tap chooses a street's IDENTITY from the basemap's roads
// layer, never its geometry: the street's true shape comes from the
// prepared extract and is stitched with the sandbox's rules (endpoint
// chaining, divided roads chain into their hairpin). Both doors land in
// one shared preview ("Review selection") with corrections, then a
// name-it step, then the pack is saved on-device (below). (Beta 1.243:
// the photo door - a photo read by Muse outside the app, the returned
// draft file imported back - is removed whole; this file's normalizePack
// keeps its draft option for the validator's own completeness.)
// PACK FORMAT (defined once, here and in docs/ARCHITECTURE.md): the same
// shape as a ROUTE_PACKS entry - { name, area, primaries: [names], roads:
// { street: [segment, ...] }, reference: {...}, tileNames?: [...] }, each
// segment an array of [lat, lng] points. normalizePack is the one validator
// every entry path (save, backup restore, boot merge) uses.
const USERPACKS_KEY = 'snowroute.v2.userpacks'; // the on-device record of created routes: { <id>: <pack> }. Shipped packs live in data.js; created packs live here.
const SHIPPED_PACK_IDS = new Set(ROUTE_PACKS.map(p => p.id)); // captured at eval, BEFORE any user pack merges - data.js holds shipped packs only
const SHIPPED_DELETED_KEY = 'snowroute.v2.shippeddeleted'; // Beta 1.271 (Andrew, 2026-11-21: EVERY route gets a Delete, the shipped 5W included): the tombstone record for deleted SHIPPED packs. A shipped pack's definition lives in data.js (code), so its deletion cannot remove a stored definition the way a created route's delete does - the delete writes this record instead (verified, like every house write) and every boot unregisters the named packs before the first render (the filter below). A DEVICE record - this phone's route list - never backed up: a backup carries route data, not this phone's deletions.
function readShippedDeleted() { // the stored tombstone list, or null when it cannot be read/parsed at all (the readUserPacks discipline: strict writers treat null as a failure and never rewrite blind)
  try { const raw = localStorage.getItem(SHIPPED_DELETED_KEY); if (raw == null) return []; const o = JSON.parse(raw); return Array.isArray(o) ? o.filter(x => typeof x === 'string') : null; } catch (e) { return null; }
}
function loadShippedDeleted() { const r = readShippedDeleted(); return r || []; }
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
// ===== Beta 1.259: boundary ends - the ONE computation of where route paint
// must feather out (Andrew's decision, 2026-11-20, option C). A boundary end
// is a run end where the street continues past the route into a NON-route
// street: the paint ends AT the join (the boundary street's first centreline,
// measured from the approach side) with a gradient fade over the last 15 m
// (the engine's half of the rule lives in engine.js). A run end shared with
// another route street is a junction - the junction machinery owns it, never
// a feather. A run end no non-route street crosses near is a dead end (or a
// mid-block pick end) - the street ends there; since Beta 1.267 the DEAD
// class earns its own record from the sibling computation below (10 m,
// Andrew's Option 1) while a pick end still earns none. Records:
// { street: [[endLat, endLng, joinLat, joinLng, fadeM], ...] } - fadeM is
// per-record data since 1.267; 4-element records from older packs default
// to 15 in the engine.
// Called by the create save with the prepared extract, and by
// scripts/derive-pack-ends.mjs for the shipped pack (the extract there is
// the city pack's street library) - one computation, both callers.
const BOUNDARY_FADE_M = 15; // Beta 1.259: a boundary end's fade length, carried ON each record (element 5) since Beta 1.267 made the length per-record data
const DEAD_FADE_M = 10; // Beta 1.267 (Andrew, Option 1): a dead end's fade length, likewise per-record
function endsPtSeg(p, a, b) { // distance from p to segment a-b, flat-metre space (projOnLine's axes) - shared by both end computations (hoisted at Beta 1.267 from computeBoundaryEnds' closure, verbatim)
  const ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, px = p[1] * MLNG, py = p[0] * MLAT;
  const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
  let t = L2 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}
function computeBoundaryEnds(roads, allStreets) {
  const out = {};
  if (!roads || !allStreets) return out;
  const routeNames = Object.keys(roads);
  const runsCache = {};
  const runsOf = n => runsCache[n] || (runsCache[n] = stitchRuns(n, roads));
  const ptSeg = endsPtSeg;
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
      const atD = d => { // the point at along-run distance d (sliceLine's interpolation)
        for (let i = 1; i < line.length; i++) { if (d <= cum[i] || i === line.length - 1) { const span = cum[i] - cum[i - 1] || 1; const t = Math.max(0, Math.min(1, (d - cum[i - 1]) / span)); return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t]; } }
        return line[line.length - 1];
      };
      for (const atStart of [true, false]) {
        const E = atStart ? line[0] : line[line.length - 1];
        let junction = false; // another route street's vertex at E: a route junction owns this end
        for (const m of routeNames) { if (m === n || junction) continue; for (const rl of runsOf(m)) { for (const v of rl) if (Math.abs(v[0] - E[0]) < 0.00004 && Math.abs(v[1] - E[1]) < 0.00004 && distM(v, E) <= 2) { junction = true; break; } if (junction) break; } }
        if (junction) continue;
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
              // a segment running ALONG the run is the street's own continuation (the extract
              // names it in full - 'Valeria Boulevard' against the pack's 'Valeria'), never a boundary
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
        if (!crossings.length) continue; // no crossing: not a boundary end - computeDeadEnds below decides whether it is a dead end (record) or a pick end (none)
        let minBehind = Infinity; for (const c of crossings) if (c.behind < minBehind) minBehind = c.behind;
        const street0 = crossings.find(c => c.behind === minBehind).street; // the boundary street is the closest crossing's
        let joinBehind = minBehind; // the join is that street's FURTHEST-back crossing near the end - its first centreline (a divided road's near carriageway); the cluster bound keeps a second, unrelated crossing of the same street from dragging the join away
        for (const c of crossings) if (c.street === street0 && c.behind <= minBehind + 20 && c.behind > joinBehind) joinBehind = c.behind;
        const join = atD(atStart ? joinBehind : total - joinBehind);
        const r6 = v => Math.round(v * 1e6) / 1e6;
        (out[n] = out[n] || []).push([r6(E[0]), r6(E[1]), r6(join[0]), r6(join[1]), BOUNDARY_FADE_M]); // Beta 1.267: element 5 is the fade length - per-record data the engine reads (older 4-element records default to 15 there)
      }
    }
  }
  return out;
}
// ===== Beta 1.267: dead ends - the sibling computation (Andrew's decision,
// 2026-11-21, Option 1: dead ends feather too, over 10 m; boundary ends stay
// 15 m). A dead end is a run end that is NOT a junction (no other route
// street's vertex there), NOT a boundary end (no non-route street crosses
// near it - computeBoundaryEnds owns that class and its records win), and
// where the street's OWN extract geometry terminates: an own way ends at
// the run end and no own point extends past it along the run's outward
// direction. That last pair is what separates a true dead end from a
// mid-block pick end (the street continues past the pick, so its geometry
// extends past the end and no record is written) - the distinction the
// dead-end count record (dead-end-count-2026-11-21) proved on Route 5W:
// exactly 8 (Dianawood SW, Julian W, Bayside E, Tina N, Topper E, Boddy N,
// Angie NW, Ferrari S), reconciling 53 junctions + 7 boundary + 8 dead = 68
// run ends. A record's join IS its end (the paint dies AT the terminus) and
// element 5 carries DEAD_FADE_M. Own-way matching is name-prefix based (the
// shipped pack's short names against the library's full names) but every
// signal is judged geometrically within 50 m, so a same-prefix street
// across the city (Julian Drive vs Julian Court) can never qualify an end.
// Conservative extras from the count record's evidence bar: any OTHER
// street passing within 4 m of the end, or ending within 12 m of it,
// disqualifies the end - a terminus something else nearly touches is not
// painted as a dead end on this evidence. Called from the same two call
// sites as computeBoundaryEnds (the create save, derive-pack-ends.mjs).
function computeDeadEnds(roads, allStreets) {
  const out = {};
  if (!roads || !allStreets) return out;
  const routeNames = Object.keys(roads);
  const boundary = computeBoundaryEnds(roads, allStreets);
  const runsCache = {};
  const runsOf = n => runsCache[n] || (runsCache[n] = stitchRuns(n, roads));
  const r6 = v => Math.round(v * 1e6) / 1e6;
  for (const n of routeNames) {
    const ownNames = Object.keys(allStreets).filter(m => m === n || m.startsWith(n + ' ') || n.startsWith(m + ' ')); // the street's own extract names - exact name first: a CREATE draft keys its roads by the FULL street name, so the exact-name key IS a route name and must not be vetoed by route membership (Codex P2, PR #163: with the veto, a created route's own geometry was excluded at both filters and its dead ends never feathered)
    for (const line of runsOf(n)) {
      for (const atStart of [true, false]) {
        const E = atStart ? line[0] : line[line.length - 1];
        const inward = atStart ? line[1] : line[line.length - 2];
        if (!inward) continue;
        let junction = false; // the boundary computation's own test, verbatim in shape: another route street's vertex at E owns the end
        for (const m of routeNames) { if (m === n || junction) continue; for (const rl of runsOf(m)) { for (const v of rl) if (Math.abs(v[0] - E[0]) < 0.00004 && Math.abs(v[1] - E[1]) < 0.00004 && distM(v, E) <= 2) { junction = true; break; } if (junction) break; } }
        if (junction) continue;
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
    const out = Object.create(null); const names = Object.keys(obj); // Beta 1.169 (Carbon fix round, D-05 + X-05): prototype-free - on a plain object the duplicate test below reads ({}).constructor / ({}).toString as truthy and '__proto__' as the prototype itself, so a FIRST street carrying one of those names was falsely rejected as a duplicate (and a '__proto__' street could not be stored at all). The 1.150 city-cache fold set this precedent for stored names.
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
  const primariesIn = raw.primaries; // the ONE stored key (2026-11-15, Andrew's override completing the Beta 1.205 rename at the storage layer): no aliases - a pack written by an older build (field 'main', or a draft-side 'mains') normalizes to an empty primaries list with its streets intact, never a rejection
  const primaries = [];
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
  if (box && (box.w < -180 || box.e > 180 || box.s < -90 || box.n > 90 || box.e - box.w > PACK_BOX_MAX_DEG || box.n - box.s > PACK_BOX_MAX_DEG)) return bad('the route area is too big'); // Beta 1.152 (NV round, NV3a): extent and world-bounds validation, fail-closed like every other check here, over the declared box and the derived one alike. A box is an offline-download area and the tile enumerators (app4) iterate it zoom by zoom: a worldwide box enumerates ~356.8M tile URLs per source and never returns (measured) - it is a preload wedge, not a route. The ceiling (~7.6x the widest shipped city bbox, 10x the declared 5W box) rejects it at EVERY entry point, this validator being the single gate for draft import, save, backup restore and the boot merge. The enumerators carry their own budget as well (NV3b), for records that never pass through here.
  const ends = {}; // Beta 1.259: boundary-end records, cleaned leniently like primaries - records naming a real road with four in-range coordinates survive (rounded to the pack's own 1e-6 grid); anything else is dropped, never a rejection: a malformed ends field must not block a save or a restore of an otherwise valid route
  if (raw.ends && typeof raw.ends === 'object' && !Array.isArray(raw.ends)) {
    for (const nm of Object.keys(raw.ends)) {
      if (!rc.roads[nm] || !Array.isArray(raw.ends[nm])) continue;
      const list = [];
      for (const r of raw.ends[nm]) {
        if (!Array.isArray(r) || r.length < 4) continue;
        const a = r[0], b = r[1], c = r[2], d = r[3];
        if (!isFinite(a) || !isFinite(b) || !isFinite(c) || !isFinite(d) || Math.abs(a) > 90 || Math.abs(b) > 180 || Math.abs(c) > 90 || Math.abs(d) > 180) continue;
        const rec = [Math.round(a * 1e6) / 1e6, Math.round(b * 1e6) / 1e6, Math.round(c * 1e6) / 1e6, Math.round(d * 1e6) / 1e6];
        if (isFinite(r[4]) && r[4] > 0 && r[4] <= 100) rec.push(Math.round(r[4] * 10) / 10); // Beta 1.267: element 5, the per-record fade length - a sane value survives; an absent or bad one leaves the 4-element form and the engine's 15 m default applies
        list.push(rec);
      }
      if (list.length) ends[nm] = list;
    }
  }
  const cleaned = { name, area, primaries, spot: {}, tileNames: [...tileSet], box, roads: rc.roads, reference, ends };
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
const shippedDead = loadShippedDeleted(); for (let i = ROUTE_PACKS.length - 1; i >= 0; i--) { if (shippedDead.includes(ROUTE_PACKS[i].id)) ROUTE_PACKS.splice(i, 1); } // Beta 1.271: the tombstone applies BEFORE the created-pack merge - mergeUserPacks' collision rule (a created pack wins its id) is Andrew's-data-wins, and a created pack must never be hidden by a shipped pack's tombstone
mergeUserPacks(); // Beta 1.166: this synchronous pass is now the LEGACY half of the boot - the pre-1.166 record registers exactly as every earlier build registered it, so a first 1.166 boot is fully usable on the legacy data before the store read lands, and the record stays the fallback read until initUserPacks' drain has verified every route into the store
window.__userPacksReady = initUserPacks(); // Beta 1.166: the store half of the boot + the migration drain, exposed (with the status reader below) so the battery can await and inspect it - the migratePack/__migrateStatus precedent. Fire-and-forget for the app itself: it never blocks the boot, and because the marker is earned, an incomplete drain simply runs again next boot
window.__userPacksStatus = () => upStatus;
window.__userPacksReady.then(() => { if (anyPreloadRecord()) migratePack(); }); // Beta 1.170 (Carbon fix round Phase 2, C-03): the gate reads EVERY route's preload record, not just the eval-default route's - see anyPreloadRecord (app4). Beta 1.143 (DA-07), re-seated in 1.166: the pack migration starts only after created packs have registered from BOTH homes - the manifest migratePack captures from preloadUrlList() must be the union over shipped + created packs wherever they live now (through 1.165 this fired directly after the synchronous merge above; the store half of registration is asynchronous, so the start chains on its settle - which resolves on EVERY path, failure included, leaving the legacy-only union as the floor)
function uniqueRouteId(name) { // a slug from the name, uniqueness-checked against shipped + created ids
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'route';
  let id = base, i = 2;
  while (ROUTE_PACKS.some(p => p.id === id) || Object.prototype.hasOwnProperty.call(userPackCache, id)) { id = base + '-' + i; i++; }
  return id;
}
function nextRouteNameGuess() { let mx = 1; for (const p of ROUTE_PACKS) { const m = /^Route (\d+)$/.exec(p.name || ''); if (m) mx = Math.max(mx, +m[1] + 1); } return 'Route ' + Math.max(mx, ROUTE_PACKS.length + 1); }

