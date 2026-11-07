// ===== Beta 1.118: CREATE A ROUTE (Step 2 of the route programme; Andrew's approved mockups) =====
// The HYBRID flow: Door 1 turns a photo of a route map into a draft (the
// photo is read by Muse OUTSIDE the app - the app has no photo reader by
// design; see docs/ARCHITECTURE.md) and imports the returned draft file;
// Door 2 searches a street (Nominatim), flies there, and lets Andrew TAP
// roads on the map - a tap chooses a street's IDENTITY from the basemap's
// roads layer, never its geometry: the street's true shape is fetched from
// the Overpass API at tap time and stitched with the sandbox's rules
// (endpoint chaining, divided roads chain into their hairpin). Both doors
// land in one shared preview ("Is this correct?") with corrections, then a
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
function normalizePack(raw, opts) { // -> { ok: true, pack } | { ok: false, error } - fail-closed with a named error, nothing half-built
  opts = opts || {};
  const bad = m => ({ ok: false, error: m });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('it is not a route pack');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (name.length > 60) return bad('the route name is too long');
  if (!opts.draft && !name) return bad('the route has no name');
  const area = typeof raw.area === 'string' ? raw.area.trim().slice(0, 60) : '';
  let totalPts = 0;
  const cleanRoads = (obj, label) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { error: 'the ' + label + ' are missing or the wrong shape' };
    const out = {}; const names = Object.keys(obj);
    if (names.length > 300) return { error: 'too many streets in the ' + label };
    for (const nm0 of names) {
      const nm = nm0.trim();
      if (!nm || nm.length > 60) return { error: 'a street name in the ' + label + ' is missing or too long' };
      if (out[nm]) return { error: 'the street "' + nm + '" appears twice' };
      const segsIn = obj[nm0];
      if (!Array.isArray(segsIn) || !segsIn.length || segsIn.length > 80) return { error: 'the street "' + nm + '" has no usable shape' };
      const segs = [];
      for (const segIn of segsIn) {
        if (!Array.isArray(segIn) || segIn.length < 2 || segIn.length > 4000) return { error: 'the street "' + nm + '" has a bad segment' };
        const seg = [];
        for (const pt of segIn) {
          if (!Array.isArray(pt) || pt.length < 2 || !isFinite(pt[0]) || !isFinite(pt[1]) || Math.abs(pt[0]) > 90 || Math.abs(pt[1]) > 180) return { error: 'the street "' + nm + '" has a bad map point' };
          const p = [Math.round(pt[0] * 1e7) / 1e7, Math.round(pt[1] * 1e7) / 1e7];
          if (!seg.length || seg[seg.length - 1][0] !== p[0] || seg[seg.length - 1][1] !== p[1]) seg.push(p);
          if (++totalPts > 150000) return { error: 'the route is too big' };
        }
        if (seg.length > 1) segs.push(seg);
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
  if (Array.isArray(raw.tileNames)) for (const t of raw.tileNames) if (typeof t === 'string' && t && t.length <= 80 && tileSet.size < 400) tileSet.add(t);
  if (opts.tileNames) for (const t of opts.tileNames) if (typeof t === 'string' && t && t.length <= 80 && tileSet.size < 400) tileSet.add(t);
  let box = null;
  if (raw.box && isFinite(raw.box.w) && isFinite(raw.box.s) && isFinite(raw.box.e) && isFinite(raw.box.n) && raw.box.w < raw.box.e && raw.box.s < raw.box.n) box = { w: raw.box.w, s: raw.box.s, e: raw.box.e, n: raw.box.n };
  else { const cb = computeRouteBox({ ...rc.roads, ...reference }); if (cb) box = { w: Math.max(-180, cb.w - 0.03), s: Math.max(-90, cb.s - 0.025), e: Math.min(180, cb.e + 0.03), n: Math.min(90, cb.n + 0.025) }; }
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
mergeUserPacks();
function uniqueRouteId(name) { // a slug from the name, uniqueness-checked against shipped + created ids
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'route';
  let id = base, i = 2;
  while (ROUTE_PACKS.some(p => p.id === id)) { id = base + '-' + i; i++; }
  return id;
}
function nextRouteNameGuess() { let mx = 1; for (const p of ROUTE_PACKS) { const m = /^Route (\d+)$/.exec(p.name || ''); if (m) mx = Math.max(mx, +m[1] + 1); } return 'Route ' + Math.max(mx, ROUTE_PACKS.length + 1); }

// ---- draft state: session only (not a route, not in any slot) ----
let creating = false, crStage = 'pick', crBootParked = false, crAreaGuess = '', crPhoto = null, crPickBusy = false; // Beta 1.128: crReturnToPreview is GONE - it existed only to rewrite the panel's Done label on the return-from-preview errand, and the label no longer rewrites (Andrew: the button reads "Done", always)
let draft = null; // { roads, mains: Set, osmNames: {short: full}, tileNames: [..], name, area, sectors: {short: [chosen part indexes]} (Beta 1.127 - an ABSENT entry means the whole road), parts: {short: crStreetParts record} (session cache) }
function newDraft() { return { roads: {}, mains: new Set(), osmNames: {}, tileNames: [], name: '', area: '', sectors: {}, parts: {} }; }
let crSectorStreet = null; // Beta 1.127: the street whose sectors are being trimmed (sector mode), or null
let crSectorSnapshot = undefined; // Beta 1.129: the street's sector pick as it stood when sector mode was ENTERED (null = the whole road; an array = the trim then in force) - the sector bar's Cancel restores exactly this. undefined = no sector session in flight
let crPanelCollapsed = false; // Beta 1.127: the picked-roads panel's tucked-away state (the slim strip shows instead)
function draftStreets() { return draft ? Object.keys(draft.roads) : []; }

// ---- city-first preparation (Beta 1.121, audit round pickfetch) ----
// Andrew's amendment at the gate: manual creation STARTS by asking what
// city he will be cleaning in. He picks the city FIRST, and every tap
// then resolves LOCALLY from a prepared extract - no per-tap network
// (CG-PF-04). 1.118-1.120 fetched each street live at tap time, and the
// fetch itself was broken three ways: the query was malformed (CG-PF-01:
// the name filter carried its equals sign INSIDE the quoted key and lost
// the value's opening quote - so NO tap could ever succeed), the 40 s
// per-attempt timeouts excluded the measured 40.6/52.7 s successes and
// burned ~123 s across retries (CG-PF-02), and the attempt timer was
// cleared when the headers landed, before the body was read (CG-PF-03).
// SECOND AMENDMENT (Andrew, at the verify gate): he rejected the
// working-box-only preparation - picking a city loads the WHOLE CITY.
// The extract for a picked city is therefore a GRID of ~4 x 4 km cells
// over the city's bounding box, fetched with bounded parallelism,
// committed cell by cell, and PERSISTED on-device (IndexedDB, see the
// city cache below + docs/STORAGE-SCHEMA.md), so a city loads once and
// is instant forever after. The original bounded box survives as the
// FALLBACK preparation for places with no picked/saved city (an anchor
// outside the city, a name-only city), session-only. Download size was
// never the constraint (a whole city is ~14 MB); the service's compute
// time per query is - which is exactly what the grid bounds.
// Every async completion below binds to (creation session, coverage
// generation): exitCreate and every new preparation invalidate older
// generations, and an obsolete completion mutates nothing (CG-PF-05).
const CR_TIMING = { budgetMs: 120000, attempt1Ms: 70000, topupBudgetMs: 90000, topupAttempt1Ms: 60000, capBytes: 2 * 1024 * 1024, cityCapBytes: 60 * 1024 * 1024 }; // ONE overall deadline per fetch with the attempt budgets defined INSIDE it - the primary may take at most attempt1Ms, so the fallback always keeps a meaningful reserve. Verify round (CG-PF-07): the TOP-UP budgets obey the same measured profile as the batch - the primary's measured successes were 40.6/52.7 s, so a 40 s top-up cap reproduced the PF-02 failure on the exception path; the top-up primary now gets 60 s of its 90 s. An object (not bare consts) as the honest test seam: the battery shrinks budgets and caps instead of waiting out real minutes.
const CR_INNER_KM = 2, CR_BUFFER_KM = 1, CR_TOPUP_RING_KM = 2; // the FALLBACK preparation footprint: a fixed ~4 x 4 km picking box plus a 1 km buffer ring (Codex, debate 1: a fixed geographic footprint, never viewport-derived - the map can be panned anywhere)
const CR_CELL_KM = 4, CR_GRID_PARALLEL = 3, CR_CELL_TRIES = 2; // the city grid: ~4 x 4 km cells, at most 3 fetches in flight, each cell retried once inside a preparation before it is marked failed
let crSession = 0; // bumped on every enterCreate and exitCreate
let crCity = null; // { name, lat, lon, bbox } - the city this creation is scoped to (lat/lon/bbox null when only the name is known)
let crCov = null; // { gen, byName, byId, boxes: [verified boxes], fetchedAt } - the merged extract taps resolve from: city cells + fallback boxes, one index (ids dedupe across cells - a way returned by two cells is stored once)
let crWanted = null; // { anchor, label } - an explicit preparation offer the hint's button currently acts on (set when a tap lands outside coverage or a street pends; cleared when a preparation starts)
let crTopOp = null; // the in-flight top-up's cancellation handle (crOverpassFetch's op), so exitCreate can stop its download too
let crCovGen = 0; // the coverage generation
let crPrep = null; // { gen, session, anchor, startedAt, ticker, op } while a FALLBACK box preparation is in flight
let crGrid = null; // { name, bbox, cells: [{ key, box, state, tries }], gen, session, startedAt, ticker, ops: Set, active, fromCache, savedAt, stopped, lastFail } while a CITY grid preparation exists (kept after it settles, for progress/resume/refresh state)
let crPrepState = 'none'; // 'none' | 'preparing' | 'ready' | 'degraded' | 'failed'  ('degraded': a city grid settled with parts missing - what loaded is usable, the rest is resumable)
let crPrepFail = null; // { kind: 'unreachable' | 'error' | 'dense' | 'badjson', status?, remark? }
let crFailFromGrid = false; // which preparation produced crPrepFail - the Retry button resumes a failed GRID's missing cells but re-runs a failed fallback BOX at its anchor; the two must never be confused when both exist
let crPrepAnchor = null; // where Retry / a not-ready tap re-prepares
let crPending = {}; // short name -> { osmName, lngLat }: streets whose full shape reaches beyond verified coverage (fail-closed) - listed as pending, NEVER added half-known
let crToppedUp = {}; // '<short>@<gen>' -> true: a street's ONE top-up per coverage generation is spent
let crCityReturn = 'doors'; // where the city pane's Back lands
function crBoxAround(lat, lng, halfKm) { const dLat = halfKm * 1000 / MLAT, dLng = halfKm * 1000 / MLNG; return { s: +(lat - dLat).toFixed(6), n: +(lat + dLat).toFixed(6), w: +(lng - dLng).toFixed(6), e: +(lng + dLng).toFixed(6) }; }
function crInBox(box, lat, lng) { return !!box && lat >= box.s && lat <= box.n && lng >= box.w && lng <= box.e; }
function crInAnyBox(boxes, lat, lng) { for (const b of boxes || []) { if (crInBox(b, lat, lng)) return true; } return false; } // verified coverage is a SET of boxes (city cells + fallback boxes) - an endpoint is verified when it lies inside ANY of them
function crExpandBox(box, km) { const dLat = km * 1000 / MLAT, dLng = km * 1000 / MLNG; return { s: +(box.s - dLat).toFixed(6), n: +(box.n + dLat).toFixed(6), w: +(box.w - dLng).toFixed(6), e: +(box.e + dLng).toFixed(6) }; }
function crQL(filter, box, timeoutS) { return '[out:json][timeout:' + timeoutS + '];way[' + filter + '](' + box.s + ',' + box.w + ',' + box.n + ',' + box.e + ');out geom;'; } // THE one query builder - batch and top-up share its grammar (single source; the battery decodes the real POST bodies and grades THIS output). The name filter is "name"="..." - quote, name, quote, equals, quote. 1.118-1.120 hand-built the malformed form (equals inside the key quotes) inside fetchStreetGeometry and every tap failed on it (CG-PF-01).
function crAreaQL(box, timeoutS) { return crQL('"name"]["highway"', box, timeoutS); }
function crNameQL(osmName, box, timeoutS) { return crQL('"name"="' + osmName.replace(/(["\\])/g, '\\$1') + '"', box, timeoutS); }
function crAbortOp(op) { try { if (op && op.ctl) op.ctl.abort(); } catch (e) {} } // stop an in-flight fetch's download, not just its right to land (CG-PF-10: Cancel/exit/supersede abort the request itself)
async function crOverpassFetch(ql, budgetMs, attempt1Ms, sessionOk, op) {
  // One query against the public Overpass instances (OVERPASS_URLS) under
  // ONE overall deadline spanning connect + body + parse (CG-PF-02/03):
  // attempt 1 gets at most attempt1Ms of the budget, the fallback keeps
  // the rest; the body is consumed as a stream with the size cap enforced
  // WHILE it arrives (a post-parse length check bounds nothing); the
  // clock is re-checked after the synchronous parse - which no abort can
  // interrupt - before the answer is allowed to commit. Honest outcomes:
  // { ok: true, json, ms } or { ok: false, kind } with kind 'unreachable'
  // (no instance answered in budget - a throw, or our own deadline
  // abort), 'error' (HTTP status, or an Overpass remark riding an
  // HTTP 200), 'dense' (over the byte cap), 'badjson' (unreadable
  // answer), 'stale' (the caller's session/generation moved on).
  const t0 = Date.now(), deadline = t0 + budgetMs;
  let lastFail = { ok: false, kind: 'unreachable' };
  for (let i = 0; i < OVERPASS_URLS.length; i++) {
    if (sessionOk && !sessionOk()) return { ok: false, kind: 'stale' };
    const remain = deadline - Date.now(); if (remain <= 0) break;
    const cap = i === 0 ? Math.min(attempt1Ms, remain) : remain;
    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (op) op.ctl = ctl; // the caller can stop THIS download (Cancel / exit / supersede - CG-PF-10)
    const to = ctl ? setTimeout(() => { try { ctl.abort(); } catch (e) {} }, cap) : null;
    try {
      const r = await fetch(OVERPASS_URLS[i], { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(ql), signal: ctl ? ctl.signal : undefined });
      if (!r.ok) { lastFail = { ok: false, kind: 'error', status: r.status }; if (to) clearTimeout(to); continue; }
      let text;
      if (r.body && typeof r.body.getReader === 'function') {
        const reader = r.body.getReader(), chunks = []; let total = 0;
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          total += part.value.byteLength;
          if (total > CR_TIMING.capBytes) { try { if (ctl) ctl.abort(); } catch (e) {} if (to) clearTimeout(to); return { ok: false, kind: 'dense' }; }
          chunks.push(part.value);
          if (sessionOk && !sessionOk()) { if (to) clearTimeout(to); try { await reader.cancel(); } catch (e) {} crAbortOp(op); return { ok: false, kind: 'stale' }; } // superseded mid-stream: stop the download, don't just discard its result (CG-PF-10)
        }
        const buf = new Uint8Array(total); let off = 0; for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
        text = new TextDecoder().decode(buf);
      } else { text = await r.text(); if (text.length > CR_TIMING.capBytes) { if (to) clearTimeout(to); return { ok: false, kind: 'dense' }; } }
      if (to) clearTimeout(to);
      let json = null;
      try { json = JSON.parse(text); } catch (e) { lastFail = { ok: false, kind: 'badjson' }; continue; }
      if (Date.now() > deadline) { lastFail = { ok: false, kind: 'unreachable' }; continue; } // the parse itself ate the deadline (CG-PF-03): a late success is not committed
      if (json && json.remark) return { ok: false, kind: 'error', remark: String(json.remark).slice(0, 120) }; // an Overpass error remark fails the extract even on HTTP 200 with elements attached (Codex) - partial output is never promoted to ready
      if (!json || !Array.isArray(json.elements)) { lastFail = { ok: false, kind: 'badjson' }; continue; }
      return { ok: true, json, ms: Date.now() - t0 };
    } catch (e) {
      if (to) clearTimeout(to);
      if (sessionOk && !sessionOk()) return { ok: false, kind: 'stale' };
      lastFail = { ok: false, kind: 'unreachable' };
    }
  }
  return lastFail;
}
async function crSourceExtract(box, name, budgetMs, attempt1Ms, sessionOk, op) {
  // THE EXTRACT SOURCE SEAM (parent architecture note, 2026-11-06): every
  // street-shape extract this app obtains - a city grid cell, the fallback
  // box, a street top-up - comes through this ONE function: given a
  // coverage box (and optionally one street name), it returns the extract
  // for that box. Beta 1.123: the pre-generated city packs plug in BEHIND
  // this seam - when a pack context is active (crPackCtx, set by
  // crCityPrepare / crGridRefresh when the picked city matches the pack
  // library), the pack answers the same call shape and the live Overpass
  // service becomes the fallback. The grid, the fallback box prep, the
  // top-up and everything downstream consume the identical result shape
  // either way.
  const pk = await crPackServe(box, name, sessionOk);
  if (pk) return pk;
  const ql = name ? crNameQL(name, box, Math.ceil(budgetMs / 1000)) : crAreaQL(box, Math.ceil(budgetMs / 1000));
  return crOverpassFetch(ql, budgetMs, attempt1Ms, sessionOk, op);
}
// ---- the city packs (Beta 1.123): the app's own street library ----
// Pre-generated whole-city street-shape files, hosted beside the app on
// its own origin under packs/ (one <slug>.json per city + index.json,
// the library's catalogue). This is the app's offline philosophy applied
// to street shapes: a prepared city downloads ONCE from a static file
// (seconds, same origin - no third-party service in the path), commits
// through the same grid/cache machinery as a service load, and is then
// the phone's own copy. The catalogue is data, not code: publishing a
// new city's pack + index entry lights it up in the chooser and at this
// seam with NO app change. A city with no pack - or a pack that fails
// to load - uses the live Overpass grid exactly as 1.121 did, and the
// fallback is SAID in the hint (crPackNote), never silent.
let crPackCtx = null; // { slug, bbox, failed } while the active city's preparation is pack-backed; null = the service is the source
let crPackNote = ''; // the disclosed pack state ('' = nothing to say); rides the hint like crCacheNote
let crPackIndexP = null; // the session's catalogue promise (null result cached too: no library this session)
let crPackLoads = {}; // slug -> Promise<elements>: the session's downloaded packs, adapted once
function crPackIndexLoad() {
  if (!crPackIndexP) {
    crPackIndexP = (async () => {
      try {
        const r = await fetch('packs/index.json', { cache: 'no-cache' });
        if (!r.ok) return null;
        const ix = await r.json();
        return (ix && Array.isArray(ix.cities) && ix.cities.length) ? ix.cities : null;
      } catch (e) { return null; }
    })();
  }
  return crPackIndexP;
}
function crWarmCityLibrary() { crPackIndexLoad(); } // Beta 1.130 (Andrew's cold-open stutter): the catalogue used to be requested for the FIRST time inside crRenderCityChoices - at the Select-from-list tap itself - so on a cold open the list pane sat on its loading state for the fetch's whole duration (diagnosis beta1/work/cold-stutter-1130/DIAGNOSIS.md: tap->rows painted = the fetch duration to within ~25 ms, while the same tap with the catalogue in hand paints in ~21 ms; even a 1.5 s dwell at the doors bought nothing, because nothing had started the download). The download now starts during BOOT - Andrew's own suggestion, adjudicated to the catalogue only: the boot tail's menu-arming slot fires crWarmCityLibrary (see the boot IIFE) once first paint is safe, and the create gate (Create button / openDoors) plus the route menu (openRouteMenu) re-trigger it as no-ops on the SAME cached promise - still at most one catalogue fetch per session, and a failed one still lands the chooser on its honest Search-manually note.
async function crPackResolveCity(name, bbox) { // does the library hold THIS city? The match is by city name against the catalogue; the pack's own bounding box must CONTAIN the grid's box (a pack that covers less than the grid would certify coverage it never downloaded - the CG-PF-15 lesson, applied at the source). A slow catalogue never wedges preparation: past the race, the service path proceeds as if there were no pack.
  if (!name || !bbox) return null;
  const entries = await Promise.race([crPackIndexLoad(), new Promise(res => setTimeout(() => res(null), 8000))]);
  if (!entries) return null;
  const e = entries.find(x => x && typeof x.name === 'string' && typeof x.slug === 'string' && x.name.toLowerCase() === String(name).toLowerCase() && Array.isArray(x.bbox) && x.bbox.length === 4);
  if (!e) return null;
  const pb = { s: +e.bbox[0], w: +e.bbox[1], n: +e.bbox[2], e: +e.bbox[3] };
  if (![pb.s, pb.w, pb.n, pb.e].every(isFinite)) return null;
  const EPS = 1e-6;
  if (!(pb.s <= bbox.s + EPS && pb.n >= bbox.n - EPS && pb.w <= bbox.w + EPS && pb.e >= bbox.e - EPS)) return null;
  return { slug: e.slug, bbox: pb };
}
function crPackLoad(slug, force) { // one same-origin download per session per city, adapted ONCE into the Overpass element shape the extract machinery consumes ({ id, tags: { name }, geometry: [{ lat, lon }] }). The pack holds raw segments per street ([[lat, lng], ...] runs, unchained - the app chains at resolve time, as it does for service extracts). Synthetic ids are NEGATIVE and sequential: OSM way ids are positive, so a pack way can never collide with a service way in the merged by-id index. A failed load is NOT cached - a later preparation may retry it.
  if (!force && crPackLoads[slug]) return crPackLoads[slug];
  const p = (async () => {
    const r = await fetch('packs/' + slug + '.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('pack HTTP ' + r.status);
    const pack = await r.json();
    if (!pack || !pack.streets || typeof pack.streets !== 'object') throw new Error('pack shape');
    const els = [];
    let idc = 0;
    for (const nm of Object.keys(pack.streets)) {
      const segs = pack.streets[nm];
      if (!Array.isArray(segs)) continue;
      for (const seg of segs) { if (Array.isArray(seg) && seg.length > 1) els.push({ type: 'way', id: -(++idc), tags: { name: nm }, geometry: seg.map(pt => ({ lat: pt[0], lon: pt[1] })) }); }
    }
    if (!els.length) throw new Error('pack empty');
    return els;
  })();
  crPackLoads[slug] = p;
  p.catch(() => { if (crPackLoads[slug] === p) delete crPackLoads[slug]; });
  return p;
}
async function crPackServe(box, name, sessionOk) { // the seam's pack answer: the extract for `box` (optionally one street) filtered out of the active city's pack, in the seam's result shape. A way belongs to a box when any of its points lies in it - the same membership the service's bounding-box query applies - and its FULL geometry is returned, exactly as `out geom` returns it. Returns null when no pack applies (the caller then takes the service path): no context, a box reaching past the pack's bounds, or a pack that failed to load - and that failure flips the context to the service for the rest of the preparation and says so in the hint.
  const ctx = crPackCtx;
  if (!ctx || ctx.failed) return null;
  const EPS = 2e-6; // the grid rounds its cell edges to 6 decimals (crGridCellsFor), which can set an edge cell's side up to 5e-7 of a degree (~5 cm) outside the city's exact box - that is the grid's own rounding, not a coverage gap; anything beyond it is real and the service answers
  if (!(box.s >= ctx.bbox.s - EPS && box.n <= ctx.bbox.n + EPS && box.w >= ctx.bbox.w - EPS && box.e <= ctx.bbox.e + EPS)) return null; // outside the pack's coverage the service answers (its extract is the honest one there)
  let els = null;
  try { els = await crPackLoad(ctx.slug); } catch (e) { els = null; }
  if (sessionOk && !sessionOk()) return { ok: false, kind: 'stale' }; // superseded while the pack downloaded: land nowhere (CG-PF-05)
  if (!els) {
    ctx.failed = true;
    if (!crPackNote) { crPackNote = 'The app’s street library didn’t load — loading from the street service instead'; crRenderHint(); }
    return null;
  }
  const t0 = Date.now();
  const out = [];
  for (const el of els) { if (name && el.tags.name !== name) continue; if (el.geometry.some(g => g.lat >= box.s && g.lat <= box.n && g.lon >= box.w && g.lon <= box.e)) out.push(el); }
  return { ok: true, json: { elements: out }, ms: Date.now() - t0 };
}
function crIndexWays(elements, byId) { // Overpass elements -> byId { id: { name, pts } }, with the point cleaning the per-tap fetch used (1e7 rounding, sub-0.1 m duplicates dropped)
  for (const el of elements || []) {
    if (!el || el.type !== 'way' || el.id == null || !el.tags || typeof el.tags.name !== 'string' || !el.tags.name) continue;
    if (!Array.isArray(el.geometry) || el.geometry.length < 2) continue;
    const pts = [];
    for (const g of el.geometry) { const p = [Math.round(g.lat * 1e7) / 1e7, Math.round(g.lon * 1e7) / 1e7]; if (!pts.length || distM(pts[pts.length - 1], p) > 0.1) pts.push(p); }
    if (pts.length > 1) byId[el.id] = { name: el.tags.name, pts };
  }
  return byId;
}
function crCovFromWays(byId, boxes) { // the coverage record: the extract's ways indexed by street name (ids kept in byId - grid cells and top-ups merge into the SAME index, deduped by way id), plus the SET of verified boxes completeness is judged against
  const byName = {};
  for (const id of Object.keys(byId)) {
    const w = byId[id];
    (byName[w.name] = byName[w.name] || []).push(w);
  }
  return { gen: crCovGen, byName, byId, boxes: (boxes || []).slice(), fetchedAt: Date.now() };
}
function crCovEnsure() { if (!crCov) crCov = crCovFromWays({}, []); return crCov; }
function crCovMerge(elements, box) { // fold one answered extract (a grid cell, the fallback box, a top-up) into the merged coverage: ways dedupe by id, the answered box joins the verified set
  const cov = crCovEnsure();
  crIndexWays(elements, cov.byId);
  const fresh = crCovFromWays(cov.byId, cov.boxes);
  cov.byName = fresh.byName;
  if (box && !cov.boxes.some(b => b.s === box.s && b.w === box.w && b.n === box.n && b.e === box.e)) cov.boxes.push(box);
  cov.fetchedAt = Date.now();
  return cov;
}
function crResolve(osmName, lngLat, boundary) { // resolve a tapped street from the extract: the sandbox stitch + the run nearest the tap (the 1.118 rule), plus the fail-closed completeness check (Codex (c)): a run end is CLOSED only when it lies INSIDE verified coverage - any same-name continuation starts at that end, inside a query that was actually answered, and the source returns every way touching that box, so it would have been returned. Verified coverage is the extract's box SET (city cells + fallback boxes); an explicit boundary (a top-up's own box) replaces the set for that one resolution. Verify round (CG-PF-08): an earlier form also accepted an end touched by ANY other returned way ('junction proof') - unsound, and removed: a cross street touching the endpoint says nothing about a same-name continuation that starts there and runs wholly outside the box, which the extract never saw (Codex's adversarial fixture: Main Road certified complete by an unrelated Cross Road). Outside verified coverage the run is unproven, however many other streets touch it.
  const cov = crCov; if (!cov) return { status: 'nocov' };
  const ways = cov.byName[osmName];
  if (!ways || !ways.length) return { status: 'absent' };
  const runs = chainWays(ways.map(w => w.pts));
  let best = null, bestD = Infinity;
  for (const run of runs) for (const p of run.line) { const d = distM(p, [lngLat.lat, lngLat.lng]); if (d < bestD) { bestD = d; best = run; } }
  if (!best) return { status: 'absent' };
  for (const end of [best.line[0], best.line[best.line.length - 1]]) {
    const closed = boundary ? crInBox(boundary, end[0], end[1]) : crInAnyBox(cov.boxes, end[0], end[1]);
    if (!closed) return { status: 'edge', run: best };
  }
  return { status: 'ok', segs: best.exact ? best.segments.slice().sort((a, b) => crLineLen(b) - crLineLen(a)) : [best.line] };
}
function crPrepCurrent(gen, session) { return creating && crSession === session && crCovGen === gen && crPrepState === 'preparing'; }
function crStartPrep(anchor) { // the FALLBACK preparation (second amendment, item D): one bounded box around an anchor, session-only - for places with no picked/saved city, and for anchors outside the city's coverage. The whole-city path is crCityPrepare below.
  if (!creating || !anchor || !isFinite(anchor.lat) || !isFinite(anchor.lng)) return;
  if (crCov && crInAnyBox(crCov.boxes, anchor.lat, anchor.lng) && crPrepState !== 'preparing') { crRenderHint(); return; } // verified coverage already includes this anchor - reuse it, no second download (CG-PF-04)
  if (crPrep && crPrepState === 'preparing' && crInBox(crBoxAround(crPrep.anchor.lat, crPrep.anchor.lng, CR_INNER_KM), anchor.lat, anchor.lng)) return; // the same preparation is already in flight - dedupe
  if (crPrep) crAbortOp(crPrep.op); // a superseding preparation stops the old download outright (CG-PF-10)
  if (crGrid) crGridStop('superseded'); // CG-PF-13: a fallback starting over a live grid must STOP the grid first - the generation bump below would otherwise orphan its in-flight cells in 'fetching' (their answers settle into the dead generation, their handlers discard them, and Resume - which only resets 'failed' cells - could never reschedule them, wedging the city mid-load forever). crGridStop aborts the grid's downloads and returns those cells to 'pending', so the city stays resumable; on a settled grid it changes nothing but the stopped marker, which crGridSettledState already reads correctly
  const session = crSession, gen = ++crCovGen;
  const outer = crBoxAround(anchor.lat, anchor.lng, CR_INNER_KM + CR_BUFFER_KM);
  crPrepState = 'preparing'; crPrepFail = null; crFailFromGrid = false; crPrepAnchor = anchor; crWanted = null; // starting a preparation IS the answer to any outstanding offer
  const prep = crPrep = { gen, session, anchor, startedAt: Date.now(), ticker: null, op: {} };
  crRenderHint();
  prep.ticker = setInterval(() => { if (crPrepCurrent(gen, session)) crRenderHint(); else clearInterval(prep.ticker); }, 1000);
  crSourceExtract(outer, null, CR_TIMING.budgetMs, CR_TIMING.attempt1Ms, () => crPrepCurrent(gen, session), prep.op).then(res => {
    clearInterval(prep.ticker);
    if (!creating || crSession !== session || crCovGen !== gen) return; // obsolete: land NOWHERE - not the draft, not the hint, not a newer operation's state (CG-PF-05)
    if (crPrep === prep) crPrep = null;
    if (res.kind === 'stale') return; // superseded mid-flight; the newer operation owns the state
    if (res.ok) {
      crCovMerge(res.json.elements, outer);
      crPrepState = crGrid ? crGridSettledState() : 'ready'; // a fallback box landing does not pretend a part-missing city is whole: the settled state comes from the grid's own judge - CG-PF-14: the pending count alone promoted a city with a FAILED cell (nothing pending, one part refused) to plain 'ready', dropping the missing-parts disclosure and its Retry
      if (crPrepState === 'failed' && crGrid && crGrid.lastFail) { crPrepFail = crGrid.lastFail; crFailFromGrid = true; } // the box landed but the city had wholly failed: keep the grid's honest failure and its Retry (mirrors crGridFinish)
      crSweepPending();
    } else { crPrepState = 'failed'; crPrepFail = res; }
    crRenderHint();
  });
}
function crCancelPrep() { // stops the wait AND the downloads (CG-PF-10), keeps the draft, the city and every cell already loaded; the generation bump makes any late answer land nowhere
  if (crPrep) { clearInterval(crPrep.ticker); crAbortOp(crPrep.op); crPrep = null; }
  if (crGrid) crGridStop('cancelled');
  crCovGen++;
  crPrepFail = null;
  crPrepState = crGrid ? crGridSettledState() : (crCov && crCov.boxes.length ? 'ready' : 'none');
  crRenderHint();
}
function crSweepPending() { // a fresh extract may complete streets that were pending on a narrower one
  if (!crCov || (crPrepState !== 'ready' && crPrepState !== 'degraded')) return;
  for (const pk of Object.keys(crPending)) {
    const p = crPending[pk]; if (!p) continue;
    const res = crResolve(p.osmName, p.lngLat);
    if (res.status === 'ok') crAddStreet(pk, p.osmName, res.segs);
  }
}
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
function crCacheDisclose() { // the one wording for every cache failure (cap, quota, private mode): the session keeps working, the state is SAID
  if (crCity && !crCacheNote) { crCacheNote = 'Couldn’t save ' + crCity.name + ' on this phone — it will reload next time'; crRenderHint(); }
}
function crCacheSaveCell(cityName, bbox, totalCells, key, ways) { // write-through, one cell at a time, serialized; ways in the compact stored form [[id, name, pts], ...]
  crCacheQueue = crCacheQueue.then(async () => {
    if (crCacheNote) return; // already refused/failed for this city: stop writing, the disclosure stands
    let rec = await crIdbGet(cityName);
    if (rec && rec.bbox && (rec.bbox.s !== bbox.s || rec.bbox.n !== bbox.n || rec.bbox.w !== bbox.w || rec.bbox.e !== bbox.e)) rec = null; // CG-PF-15: a record saved under a DIFFERENT bounding box is not this grid's cache - its cells were downloaded for another grid. Merging a fresh cell into it while overwriting its bbox would defeat the restore-time bbox guard in crCityPrepare and certify coverage that was never downloaded for this grid; a changed box starts the record over
    if (!rec) rec = { cityName, bbox, cells: {}, savedAt: Date.now(), totalCells };
    rec.bbox = bbox; rec.totalCells = totalCells;
    rec.cells[key] = { at: Date.now(), ways };
    rec.savedAt = Date.now();
    let size = 0;
    try { size = JSON.stringify(rec).length; } catch (e) {}
    if (size > CR_TIMING.cityCapBytes) { crCacheDisclose(); return; } // refuse BEFORE the write rather than dying mid-write (amendment C)
    if (!(await crIdbPut(rec))) crCacheDisclose();
  }).catch(() => crCacheDisclose());
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
  crCov = crCovFromWays({}, []);
  crCacheNote = '';
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
          const byId = {};
          for (const sw of saved.ways) { if (Array.isArray(sw) && sw[2] && sw[2].length > 1) byId[sw[0]] = { name: sw[1], pts: sw[2] }; }
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
function crGridRefresh() { // the saved city's Refresh affordance: drop the saved record and load the whole city again
  const g = crGrid; if (!g || !creating) return;
  const name = g.name, bbox = g.bbox;
  crIdbDelete(name);
  crCacheNote = '';
  crPackNote = '';
  if (g.fromPack) crPackLoad(g.fromPack, true).catch(() => {}); // Beta 1.123: Refresh on a pack city re-downloads the PACK itself (forced past the session copy) - the fresh grid below then commits from it
  const session = crSession, gen = ++crCovGen;
  crCov = crCovFromWays({}, []);
  const g2 = crGrid = { name, bbox, cells: crGridCellsFor(bbox), gen, session, startedAt: Date.now(), ticker: null, ops: new Set(), active: 0, fromCache: false, savedAt: null, stopped: null, lastFail: null };
  if (g.fromPack) { g2.fromPack = g.fromPack; crPackCtx = { slug: g.fromPack, bbox: g.bbox, failed: false }; } // the refreshed preparation stays pack-backed, against the same bounds
  crPrepState = 'preparing'; crPrepFail = null;
  g2.ticker = setInterval(() => { if (crGridCurrent(g2) && crPrepState === 'preparing') crRenderHint(); else if (g2.ticker) clearInterval(g2.ticker); }, 1000);
  crRenderHint();
  crGridPump(g2);
}
function crFailText(f) { // the honest taxonomy (scope item 5): unreachable / answered-with-error / too-dense read differently because they ARE different
  if (!f) return '';
  if (f.kind === 'dense') return crGrid ? 'Parts of ' + (crCity ? crCity.name : 'the city') + ' were too dense to load — tap Retry to try those parts again' : 'That area is too dense to load at once — move the map to a less busy part of ' + (crCity ? crCity.name : 'the city') + ', then tap Prepare this area'; // box form per CG-PF-09: the footprint is FIXED, so zooming changes nothing - the working remedy is preparing a less dense area, and the button in this state does exactly that (map centre). Grid form: the dense cells are the failed parts, and Retry resumes exactly them
  if (f.kind === 'error') return 'The street-shape service answered with an error' + (f.status ? ' (' + f.status + ')' : '') + ' — tap Retry';
  if (f.kind === 'badjson') return 'The street-shape service sent back something unreadable — tap Retry';
  return 'The street-shape service didn’t answer — tap Retry';
}
function crRenderHint() { // the ONE writer of the pick-stage hint + its action button + the sheet's city chip: state-driven, so no stale text survives a state change
  if (!creating || crStage !== 'pick') return;
  const hint = $('createHint'), btn = $('crHintBtn');
  if (crSectorStreet) { hint.textContent = 'Tap sectors to add or remove them'; hint.classList.add('on'); btn.style.display = 'none'; return; } // Beta 1.127 (mockup screen 1): while trimming, the pill says the one thing there is to do
  let text = '', btnLabel = '';
  const secs = t0 => Math.max(0, Math.round((Date.now() - t0) / 1000));
  if (crPrepState === 'preparing' && crPrep) { text = 'Preparing street shapes for ' + (crCity ? crCity.name : 'this area') + '… ' + secs(crPrep.startedAt) + ' s'; btnLabel = 'Cancel'; } // the fallback box, when IT is the in-flight operation: it outranks the grid text - a settled (or still-loading) city grid must not label a box wait with stale part counts
  else if (crPrepState === 'preparing' && crGrid) { // the city grid: REAL progress - parts landed of parts total, and elapsed (amendment B: no fake percentages, the count is the count)
    const done = crGridDoneCount(), total = crGrid.cells.length, failed = crGridFailedCount();
    if (crGrid.fromPack && !crPackNote) text = 'Loading ' + crGrid.name + ' from the app’s own library… ' + secs(crGrid.startedAt) + ' s'; // Beta 1.123: a pack load is ONE download, not parts - the wording names the fast path and keeps only the honest elapsed clock (no part counts, no percentages, and never the service's name for the library's work)
    else text = 'Loading ' + crGrid.name + ' — part ' + done + ' of ' + total + ' · ' + secs(crGrid.startedAt) + ' s' + (failed ? ' · ' + failed + ' failed so far' : '');
    btnLabel = 'Cancel';
  }
  else if (crPrepState === 'degraded' && crGrid) {
    if (crGrid.stopped === 'cancelled') { text = 'Loading stopped — ' + crGridDoneCount() + ' of ' + crGrid.cells.length + ' parts of ' + crGrid.name + ' loaded'; btnLabel = 'Resume'; }
    else { text = crGrid.name + ' loaded except ' + (crGridFailedCount() + crGridPendingCount()) + ' part' + ((crGridFailedCount() + crGridPendingCount()) === 1 ? '' : 's') + ' — streets there may be missing'; btnLabel = 'Retry missing parts'; }
    if (crWanted) btnLabel = crWanted.label;
  }
  else if (crPrepState === 'failed') { text = crFailText(crPrepFail); btnLabel = crGrid ? 'Retry' : ((crPrepFail && crPrepFail.kind === 'dense') ? 'Prepare this area' : 'Retry'); } // grid failure: Retry resumes the missing cells. Box dense: Retry at the same anchor cannot help (fixed footprint) - the button prepares wherever the map now sits (CG-PF-09)
  else if (crPrepState === 'ready') {
    if (crGrid && crGrid.fromCache && crGrid.savedAt) { const d = new Date(crGrid.savedAt); text = crGrid.name + ' — loaded ' + d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + ' · tap a road'; btnLabel = 'Refresh'; }
    else text = draftStreets().length ? 'Tap a road on the map to add it' : 'Street shapes ready — tap a road';
    if (crWanted) btnLabel = crWanted.label; // an outstanding offer (a tap outside coverage, a pending street) keeps its working button in the ready state too (CG-PF-09: the first build's ready state hid it) - it outranks Refresh
  }
  else { text = crCity ? 'Search for a street in ' + crCity.name + ', or zoom in and prepare this area' : 'Search, fly to a street, then tap it on the map'; if (crWanted) btnLabel = crWanted.label; else if (map && map.getZoom() >= 14) btnLabel = 'Prepare this area'; }
  if (crCacheNote && crCity) text += ' · ' + crCacheNote; // the disclosed cache state rides the hint (amendment C: degradation is said, never silent)
  if (crPackNote && crCity) text += ' · ' + crPackNote; // Beta 1.123: the disclosed pack state rides the hint the same way - a fallen-back load says the library didn't load, in every state the hint shows
  hint.textContent = text; hint.classList.add('on');
  if (btnLabel) { btn.textContent = btnLabel; btn.style.display = ''; } else btn.style.display = 'none';
  const cc = $('crCityChange'); if (cc) { if (crCity) { cc.textContent = 'City: ' + crCity.name + ' — change'; cc.style.display = ''; } else cc.style.display = 'none'; }
}
function crAddStreet(short, osmName, segs) {
  draft.roads[short] = segs; draft.osmNames[short] = osmName; crGeomGen++; // a tapped street joins as a SECONDARY (fork 3) - flip it to MAIN in the list if it is one. Beta 1.135 (N3): the generation bump is the draft-geometry cache's invalidation for this in-place join (see crDraftGeom)
  delete crPending[short];
  renderDraft(); renderCrLists(); crRenderHint();
  toast('Added ' + short, 1800);
}
function crRemoveStreet(short) { // Beta 1.127: the ONE removal path - the panel's x, the preview's x and Clear all land here (Beta 1.128: those are the ONLY doors; a map tap on a picked street opens its sectors instead), so a street leaves with ALL of its draft state (geometry, main flag, names, sector pick, cached parts) and every face re-renders from the same state
  if (!draft || !draft.roads[short]) return;
  delete draft.roads[short]; draft.mains.delete(short); delete draft.osmNames[short]; crGeomGen++; // Beta 1.135 (N3): the removal invalidates the shared draft geometry (see crDraftGeom)
  if (draft.sectors) delete draft.sectors[short];
  if (draft.parts) delete draft.parts[short];
  delete crPending[short];
  if (crSectorStreet === short) { crSectorStreet = null; crSectorSnapshot = undefined; }
  renderDraft(); renderCrLists(); crRenderHint();
}
// ---- sectors (Beta 1.127, Andrew's approved mockups in beta1/work/create-sectors-mockups/):
// a picked street can be trimmed to the junction-to-junction pieces he
// actually cleans - a long road that runs past his subdivision enters
// the route only as far as he cleans it. Sector state lives ONLY in
// the draft (draft.sectors[short] = chosen part indexes; absent = the
// whole road); at Save the stored pack's roads[name] holds only the
// chosen sectors' polylines, so the pack format is unchanged and
// everything downstream derives from the stored geometry as always.
function crStreetParts(short) { // the street's sectors: its stitched line cut where OTHER streets of the prepared extract meet it - computeStretches' own cut rule (4 m join tolerance, cuts merged under 15 m, no cut within 12 m of an end) with the EXTRACT as the junction set. The extract, not the draft, is the context on purpose: the pieces are the real junction-to-junction pieces, and a street's sector boundaries never move as other streets join or leave the draft. Computed once per street per draft (cached on draft.parts); vertices are bbox-prefiltered to the line's neighbourhood, so a whole city's extract costs one bounded pass per street, paid only when sector mode first opens for it.
  if (!draft || !draft.roads[short]) return null;
  draft.parts = draft.parts || {};
  if (draft.parts[short]) return draft.parts[short];
  const one = {}; one[short] = draft.roads[short];
  const line = stitchLine(short, one);
  if (!line || line.length < 2) return null;
  const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distM(line[i - 1], line[i]));
  const total = cum[cum.length - 1];
  let w = 1e9, s = 1e9, e = -1e9, n = -1e9; for (const p of line) { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); }
  const mLat = 12 / MLAT, mLng = 12 / MLNG;
  const cuts = [];
  if (crCov && crCov.byName) {
    const own = draft.osmNames ? draft.osmNames[short] : null;
    for (const nm of Object.keys(crCov.byName)) {
      if (nm === own) continue; // the street's own ways never cut it
      for (const wy of crCov.byName[nm]) for (const v of wy.pts) {
        if (v[0] < s - mLat || v[0] > n + mLat || v[1] < w - mLng || v[1] > e + mLng) continue;
        const pr = projOnLine(line, cum, v); if (pr.off <= 4) cuts.push(pr.d);
      }
    }
  }
  const parts = finishJunctionCuts(line, cum, total, cuts); // Beta 1.131 (programme N2): the finishing policy is shared with computeStretches - see finishJunctionCuts (app1). Only the junction SOURCE differs (the prepared extract, collected above); the policy exists exactly once.
  const rec = { line, cum, total, parts };
  draft.parts[short] = rec;
  return rec;
}
function crChosenSet(short, rec) { const sel = draft && draft.sectors ? draft.sectors[short] : null; return new Set(sel || rec.parts.map((_, i) => i)); } // no entry = every sector chosen (the whole road)
function crSetChosen(short, rec, set) { // a FULL set stores as NO entry - "whole road" stays the draft's default state, so an untrimmed street carries no sector baggage into counts or the save
  draft.sectors = draft.sectors || {};
  if (set.size >= rec.parts.length) delete draft.sectors[short];
  else draft.sectors[short] = [...set].sort((a, b) => a - b);
}
function crChosenLenM(short, rec) { const set = crChosenSet(short, rec); let s = 0; for (const i of set) if (rec.parts[i]) s += crLineLen(rec.parts[i]); return s; }
function crStreetChosenM(short, g) { // a street's length AS PICKED - the whole street, or only its chosen sectors when trimmed. Every length the create flow states (panel header + rows, preview count, name-it summary) reads through here, so a trimmed street never bills its unchosen ends
  const sel = draft && draft.sectors ? draft.sectors[short] : null;
  if (!sel) return g && g[short] ? g[short].total : 0;
  const rec = crStreetParts(short); if (!rec) return 0;
  let s = 0; for (const i of sel) if (rec.parts[i]) s += crLineLen(rec.parts[i]);
  return s;
}
function crFilteredRoads() { // the roads object the SAVE stores: a trimmed street contributes ONLY its chosen sectors' polylines (each sector as one segment). The pack format is untouched (roads = segment lists); the unchosen ends simply never enter the pack
  const out = {};
  for (const n of draftStreets()) {
    const sel = draft.sectors ? draft.sectors[n] : null;
    if (sel && sel.length) { const rec = crStreetParts(n); out[n] = rec ? sel.map(i => rec.parts[i]).filter(p => p && p.length > 1) : draft.roads[n]; }
    else out[n] = draft.roads[n];
  }
  return out;
}
function crToggleSector(short, idx) {
  const rec = crStreetParts(short); if (!rec || idx < 0 || idx >= rec.parts.length) return;
  if (rec.parts.length === 1) { toast(short + ' is one piece — there are no cross-streets to trim it at', 2600); return; } // Beta 1.128: a one-piece street's only sector IS the whole road - tapping it in 1.127 un-picked the street entirely, the exact trap behind Andrew's report; the bar says it plainly and the tap changes nothing
  const set = crChosenSet(short, rec);
  if (set.has(idx)) set.delete(idx); else set.add(idx);
  if (!set.size) { crRemoveStreet(short); toast(short + ' removed - no sectors left picked', 2400); return; } // un-picking every sector removes the street (crRemoveStreet also closes its sector mode)
  crSetChosen(short, rec, set);
  renderDraft(); renderCrLists(); renderSectorBar();
}
function crSectorTap(lngLat) { // a map tap while trimming: the sector under the tap toggles. The rendered draft features answer first (the wide invisible crDraftHit layer, the street pick's own +/-16/28 px box discipline); the geometry fallback - the nearest part of THIS street - covers what the renderer cannot answer, and never reaches for another street
  const short = crSectorStreet; if (!short || !draft || !draft.roads[short]) return;
  const rec = crStreetParts(short); if (!rec) return;
  let idx = -1;
  if (map && typeof map.queryRenderedFeatures === 'function' && typeof map.project === 'function') {
    try {
      const pt = map.project([lngLat.lng, lngLat.lat]);
      for (const half of [16, 28]) {
        const feats = (map.queryRenderedFeatures([[pt.x - half, pt.y - half], [pt.x + half, pt.y + half]], { layers: ['crDraftHit'] }) || []).filter(f => f && f.properties && f.properties.name === short && typeof f.properties.sector === 'number' && f.properties.sector >= 0);
        if (!feats.length) continue;
        let bd = Infinity;
        for (const f of feats) { const d = crFeatDistM(lngLat, f.geometry); if (d < bd) { bd = d; idx = f.properties.sector; } }
        break;
      }
    } catch (e) {}
  }
  if (idx < 0) {
    let bd = Infinity;
    for (let i = 0; i < rec.parts.length; i++) { const d = crFeatDistM(lngLat, { type: 'LineString', coordinates: rec.parts[i].map(p => [p[1], p[0]]) }); if (d < bd) { bd = d; idx = i; } }
    if (bd > 75) idx = -1; // nowhere near the street being trimmed - not a sector tap
  }
  if (idx >= 0) crToggleSector(short, idx);
}
function crOpenSectors(short) { // opens a picked street's trimming - TWO doors since Beta 1.128 (Andrew's fork, decided from his 1.127 device session): the panel row (1.127) AND a map tap on the already-picked street (pickStreet routes here), which is where his finger went on device. Beta 1.129: entry SNAPSHOTS the street's pick as it stands (whole road, or the trim in force) - the sector bar's Cancel restores that snapshot exactly
  if (!draft || !draft.roads[short]) return;
  if (!crStreetParts(short)) return;
  if (crSectorStreet !== short) crSectorSnapshot = (draft.sectors && draft.sectors[short]) ? draft.sectors[short].slice() : null; // a fresh entry only - re-entering the same street's open session must not move Cancel's restore point
  crSectorStreet = short;
  renderSectorBar();
  const sheet = $('createSheet');
  if (sheet && sheet.classList.contains('on')) crMorphTo('bar');
  else syncCrPanel();
  renderDraft(); crRenderHint();
}
function crCloseSectors() { if (!crSectorStreet) return; crSectorStreet = null; crSectorSnapshot = undefined; const sheet = $('createSheet'); if (sheet && sheet.classList.contains('on')) crMorphTo(crWantedFace()); else syncCrPanel(); crRenderHint(); }
function crCancelSectors() { // Beta 1.129 (Andrew: "I still need a way to cancel selections while I'm selecting something"): the deliberate back-out of a sector session - the street's pick returns EXACTLY as it was when sector mode was entered (the whole road, or the trim then in force), every face repaints from the restored state, and sector mode closes back to the panel. Distinct from un-picking every sector by toggles, which still removes the street - that is a selection, this is an abandonment of the session's edits
  const s = crSectorStreet; if (!s || !draft) return;
  if (crSectorSnapshot) { draft.sectors = draft.sectors || {}; draft.sectors[s] = crSectorSnapshot.slice(); }
  else if (draft.sectors) delete draft.sectors[s];
  crCloseSectors();
  renderDraft(); renderCrLists();
}
function renderSectorBar() {
  const s = crSectorStreet; if (!s || !draft || !draft.roads[s]) return;
  const rec = crStreetParts(s); if (!rec) return;
  const chosen = crChosenSet(s, rec);
  $('crSbName').textContent = s;
  if (rec.parts.length === 1) { $('crSbSub').textContent = 'One piece · ' + fmtLenM(rec.total) + ' — no cross-streets to split it at, so it goes into your route whole'; return; } // Beta 1.128: honest about the streets the cut rules cannot split (measured on the shipped Vaughan pack: 221 of 1,299 streets ≥ 500 m compute to exactly one part) - 1.127's "tap sectors to trim it" promised a trim whose only outcome was deleting the road
  $('crSbSub').textContent = chosen.size >= rec.parts.length
    ? 'Entire road picked · ' + fmtLenM(rec.total) + ' — tap sectors to trim it'
    : chosen.size + ' of ' + rec.parts.length + ' sectors picked · ' + fmtLenM(crChosenLenM(s, rec)) + ' — the grey ends stay out of your route';
}
// ---- the pick sheet's ONE surface (Beta 1.129): the panel, the
// tucked-away strip and the sector bar are three CONTENTS of a single
// card - #createSheet itself, which carries the card's background,
// radius and shadow in every state (the .crG-* classes in head.html
// hold the three resting geometries; the contents carry none). A face
// change morphs the surface's OWN geometry - height, side insets,
// bottom inset and all four corner radii travel together on the
// sheets' closed-form spring, so the box contracts toward the bar's
// footprint on ALL sides at once (Andrew: "retracts into the pill
// form like it's being absorbed from all angles") while the two
// contents cross-fade INSIDE it. 1.127 hard-swapped three elements
// mid-spring; 1.128 sprang the sheet's height and slid the faces but
// the faces were still three separate boxes with their own margins
// and radii, landing in a rest state the eye had not been watching -
// on device it still read as: slides down, disappears, a pill
// appears. Now the thing on screen at the start of the motion IS the
// thing on screen at the end of it, at every frame between: one box,
// never display:none, never teleported.
let crMorph = null; // { from, to } while the surface morphs between faces, else null
let crFaceNow = 'panel'; // the face the surface currently rests as (a morph's origin; crMorph.to is its destination)
function crFaceEl(face) { return face === 'panel' ? $('crPanel') : face === 'strip' ? $('crStrip') : $('crSectorBar'); }
function crWantedFace() { // the face the current state asks for: the sector bar while trimming; the strip whenever the panel is tucked away (Beta 1.128: at ANY pick count, zero included - an empty draft retracts too, where 1.127's strip demanded a non-empty draft and collapse at zero sprang down and bounced back); else the panel
  if (crSectorStreet && draft && draft.roads[crSectorStreet]) return 'bar';
  if (crPanelCollapsed) return 'strip';
  return 'panel';
}
function syncCrPanel() { // the REST state: the surface wears the wanted face's geometry class and exactly that face's content shows. Animated switches run through crMorphTo and land here; renders and stage changes call this directly. While a morph is in flight this no-ops - the morph's finish lands the rest state, so a mid-flight re-render can never tear the surface
  const sheet = $('createSheet'), panel = $('crPanel'), strip = $('crStrip'), bar = $('crSectorBar'); if (!sheet || !panel || !strip || !bar) return;
  if (crMorph) return;
  const want = crWantedFace();
  crFaceNow = want;
  sheet.classList.toggle('crG-strip', want === 'strip');
  sheet.classList.toggle('crG-bar', want === 'bar');
  panel.style.display = want === 'panel' ? '' : 'none';
  strip.style.display = want === 'strip' ? '' : 'none';
  bar.style.display = want === 'bar' ? '' : 'none';
  if (want === 'bar') renderSectorBar();
}
function crGeoOf(sheet) { // the surface's border-box geometry as plain numbers - content height, the three insets, the four corner radii - read from computed style, so calc()/env() are already resolved to px by the engine
  const cs = getComputedStyle(sheet);
  const rad = (cs.borderRadius || '0px').trim().split(/\s+/).map(v => parseFloat(v) || 0);
  const R = rad.length === 1 ? [rad[0], rad[0], rad[0], rad[0]] : rad.length === 2 ? [rad[0], rad[1], rad[0], rad[1]] : rad.length === 3 ? [rad[0], rad[1], rad[2], rad[1]] : rad.slice(0, 4);
  return { h: sheet.offsetHeight, ml: parseFloat(cs.marginLeft) || 0, mr: parseFloat(cs.marginRight) || 0, mb: parseFloat(cs.marginBottom) || 0, r: R };
}
function crMorphCleanup() { // the surface returns to class-driven rest: every inline geometry/position the morph set is cleared, so the rest state the eye lands on is exactly the CSS geometry of the destination face
  const sheet = $('createSheet'); if (sheet) { sheet.style.height = ''; sheet.style.overflow = ''; sheet.style.marginLeft = ''; sheet.style.marginRight = ''; sheet.style.marginBottom = ''; sheet.style.borderRadius = ''; sheet.style.transform = ''; }
  for (const f of ['panel', 'strip', 'bar']) { const el = crFaceEl(f); if (!el) continue; el.style.position = ''; el.style.top = ''; el.style.left = ''; el.style.right = ''; el.style.bottom = ''; el.style.opacity = ''; }
  crMorph = null;
}
function crSettleMorph() { if (!crMorph) return; cancelSheetSpring($('createSheet')); crMorphCleanup(); syncCrPanel(); } // land an in-flight morph NOW (a grab on the panel head, or a new face decision superseding it)
function crMorphTo(to, opts) { // THE face change: one surface, its geometry springing between the two faces' resting shapes while the contents cross-fade inside. opts: { dy, v0 } from the head-drag release - the surface is already displaced dy px by the finger's transform, so the morph starts from that displaced bottom edge at the finger's own speed
  const sheet = $('createSheet'); if (!sheet) { syncCrPanel(); return; }
  opts = opts || {};
  crSettleMorph(); // a new decision supersedes an in-flight one - land it first
  const from = crFaceNow;
  if (from === to || !sheet.classList.contains('on')) { syncCrPanel(); return; }
  const fromEl = crFaceEl(from), toEl = crFaceEl(to);
  if (!fromEl || !toEl || fromEl.style.display === 'none') { syncCrPanel(); return; }
  const G0 = crGeoOf(sheet); // where the surface rests now
  fromEl.style.display = 'none'; toEl.style.display = ''; // measure the destination: its content in flow, its geometry class on
  sheet.classList.toggle('crG-strip', to === 'strip'); sheet.classList.toggle('crG-bar', to === 'bar');
  const G1 = crGeoOf(sheet);
  sheet.classList.toggle('crG-strip', from === 'strip'); sheet.classList.toggle('crG-bar', from === 'bar');
  const mb0 = opts.dy ? -opts.dy : G0.mb; // the finger left the surface dy px below its rest - the morph's bottom edge starts there, not at the rest position
  if (!G0.h || !G1.h || (Math.abs(G1.h - G0.h) < 2 && Math.abs(G1.ml - G0.ml) < 1 && Math.abs(G1.mb - mb0) < 1)) { syncCrPanel(); return; } // nothing to travel (or nothing measurable): land the rest state directly
  for (const el of [fromEl, toEl]) { el.style.display = ''; el.style.position = 'absolute'; el.style.top = '0px'; el.style.left = '0px'; el.style.right = '0px'; el.style.bottom = '0px'; } // both contents live inside the one surface for the motion
  fromEl.style.opacity = '1'; toEl.style.opacity = '0';
  sheet.style.transform = '';
  sheet.style.overflow = 'hidden'; sheet.style.height = G0.h + 'px';
  sheet.style.marginLeft = G0.ml + 'px'; sheet.style.marginRight = G0.mr + 'px'; sheet.style.marginBottom = mb0 + 'px';
  sheet.style.borderRadius = G0.r[0] + 'px ' + G0.r[1] + 'px ' + G0.r[2] + 'px ' + G0.r[3] + 'px';
  crMorph = { from, to };
  const L = (a, b, p) => a + (b - a) * p;
  springSheet(sheet, G0.h, G1.h, opts.v0 || 0, h => { // the closed-form spring drives the HEIGHT (px, the quantity its settle thresholds are calibrated for); every other property follows the same progress
    const p = Math.min(1, Math.max(0, (h - G0.h) / (G1.h - G0.h)));
    sheet.style.height = h + 'px';
    sheet.style.marginLeft = L(G0.ml, G1.ml, p) + 'px'; sheet.style.marginRight = L(G0.mr, G1.mr, p) + 'px';
    sheet.style.marginBottom = L(mb0, G1.mb, p) + 'px';
    sheet.style.borderRadius = L(G0.r[0], G1.r[0], p) + 'px ' + L(G0.r[1], G1.r[1], p) + 'px ' + L(G0.r[2], G1.r[2], p) + 'px ' + L(G0.r[3], G1.r[3], p) + 'px';
    fromEl.style.opacity = String(1 - Math.min(1, p / 0.45));
    toEl.style.opacity = String(Math.min(1, Math.max(0, (p - 0.3) / 0.7)));
  }, () => { crMorphCleanup(); syncCrPanel(); });
}
function crCollapsePanel(fromY, v0) { // tuck the surface away to the bottom bar: the one box contracts (Beta 1.129) - at any pick count, zero included
  if (crPanelCollapsed) { syncCrPanel(); return; }
  crPanelCollapsed = true;
  const sheet = $('createSheet');
  if (!sheet || !sheet.classList.contains('on')) { syncCrPanel(); return; }
  crMorphTo('strip', { dy: fromY || 0, v0: -(v0 || 0) }); // the height starts shrinking at the finger's speed: its velocity is the drag velocity negated
}
function crExpandPanel() { // Review: the bar hands back to the panel in the same one-object motion, reversed
  if (!crPanelCollapsed) return;
  crPanelCollapsed = false;
  crMorphTo('panel');
}
function crPendStreet(short, osmName, lngLat, run, boundary) { // fail-closed (Codex (c)): the shape reaches past verified coverage even after its one top-up - listed as PENDING, never added half-known; a wider preparation can still complete it (crSweepPending)
  let openEnd = null;
  if (run && run.line) { for (const end of [run.line[0], run.line[run.line.length - 1]]) { const inside = crCov && crInAnyBox(crCov.boxes, end[0], end[1]); if (!inside) { openEnd = { lat: end[0], lng: end[1] }; break; } } } // an end is OPEN only when no COMMITTED coverage holds it (the sweep's union rule): the top-up's box (the boundary argument) was fetched for this name only and never becomes coverage, so an end inside it but outside every committed box is still open; an end inside a loaded city cell needs no preparation - anchoring the wider preparation on either wrong end could never complete the street
  crPending[short] = { osmName, lngLat, openEnd };
  if (openEnd) crWanted = { anchor: openEnd, label: 'Prepare wider area' }; // verify round (CG-PF-09): the promised wider preparation is a REAL button - it prepares around the street's own open end, the point coverage must grow from
  renderCrLists(); crRenderHint();
  toast(short + ' runs past the prepared area — it is pending, not added. Prepare a wider area to complete it', 4200);
}
// ---- the city step (Andrew's amendment): Door 2 STARTS here ----
function crCityNameOf(it) { const a = (it && it.address) || {}; return a.city || a.town || a.village || a.municipality || a.county || String((it && it.display_name) || '').split(',')[0].trim(); }
function crIsPlace(it) { // populated places only: a city/town/village place, or an administrative boundary (a city's own boundary relation) - never a street, a POI or a postcode area
  if (!it) return false;
  const cls = it.category || it.class; // the app requests format=jsonv2, and jsonv2 names this field `category` - `class` was the older format's name and does not exist in a jsonv2 payload. 1.121 read only `class`, so EVERY real result was rejected here and the suggestion list silently emptied on Andrew's phone (the typed city search dead end, 2026-11-06). The battery's fixture cities carried the old field name, which is why the rig never saw it; drive153 stubs the real jsonv2 shape.
  if (cls === 'place') return ['city', 'town', 'village', 'hamlet', 'suburb'].includes(it.type);
  if (cls === 'boundary') return it.type === 'administrative';
  return false;
}
function crPickCity(it) {
  crCityLookupSeq++; if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} crCityLastCtl = null; } // a real pick supersedes any held last-city lookup (CG-PF-11)
  const lat = parseFloat(it.lat), lon = parseFloat(it.lon); if (!isFinite(lat) || !isFinite(lon)) return;
  const name = crCityNameOf(it); if (!name) return;
  let bbox = null;
  if (Array.isArray(it.boundingbox) && it.boundingbox.length === 4) { const bb = it.boundingbox.map(Number); if (bb.every(isFinite)) bbox = { s: bb[0], n: bb[1], w: bb[2], e: bb[3] }; }
  crCity = { name, lat, lon, bbox };
  crAreaGuess = name;
  if (draft && !draft.area) draft.area = name;
  try { lsSet(LS_GLOBAL.lastArea, name); } catch (e) {}
  crEnterPickFromCity();
}
function crEnterPickFromCity() { // the city is chosen: land in the pick stage, the map flown to the city, and its whole-city preparation started (from the on-device cache when saved - crCityPrepare)
  if (!creating) enterCreate('pick'); else { if (!routeLoaded) parkBootChrome(); else closeRouteMenu(); setCreateStage('pick'); }
  if (map && crCity && crCity.lat != null) { try { map.flyTo({ center: [crCity.lon, crCity.lat], zoom: 12, duration: 900 }); } catch (e) {} }
  crCityPrepare();
  crRenderHint();
}
// ---- the create gate: TWO DOORS, then the list (Beta 1.124, Andrew's
// redesign, approved from the rendered mockup 2026-11-06) ----
// The first screen of Create is "Create new route" with two primary
// doors: Select from list and Search manually (the photo door sits
// quieter below a divider). Select from list opens its own pane listing
// the library's cities as clean rows - no typing required to proceed.
// The list IS packs/index.json (the same catalogue the seam reads): a
// city appears the day its pack is published, and the app carries no
// hardcoded city names. Both entries into Create - the cold-start
// picker and the Routes menu - show the SAME routeMenu and the SAME
// panes, so this one surface is the gate for both.
function crRenderCityChoices() {
  const boxEl = $('crCityList'); if (!boxEl) return;
  boxEl.innerHTML = '';
  const loading = document.createElement('div'); loading.className = 'routeRow crLoadingRow'; // Beta 1.130: while the catalogue is genuinely in flight, the pane shows a ROW in the city rows' own styling (the shape the list itself takes) - the wait reads as the list arriving, not a bare note floating on an empty pane (the second, cosmetic half of Andrew's "loading screen" stutter; the wait itself is attacked by crWarmCityLibrary)
  const lmeta = document.createElement('span'); lmeta.className = 'routeMeta';
  const lnm = document.createElement('span'); lnm.className = 'routeName'; lnm.textContent = 'Loading cities…';
  const lsub = document.createElement('span'); lsub.className = 'routeArea'; lsub.textContent = 'Getting the city library';
  lmeta.append(lnm, lsub); loading.appendChild(lmeta); boxEl.appendChild(loading);
  crPackIndexLoad().then(entries => {
    if (!boxEl.isConnected) return;
    boxEl.innerHTML = '';
    if (!entries || !entries.length) { const d = document.createElement('div'); d.className = 'rmNote'; d.textContent = 'The city library isn’t available right now — go back and use Search manually.'; boxEl.appendChild(d); return; } // honest unavailability, and the manual door behind Back still works - the gate never dead-ends
    const last = (lsGet(LS_GLOBAL.lastArea) || '').toLowerCase();
    const sorted = entries.slice().sort((a, b) => (((b.name || '').toLowerCase() === last) ? 1 : 0) - (((a.name || '').toLowerCase() === last) ? 1 : 0)); // the last-used city rides first when the library holds it (a convenience, never a requirement - the full list is always there)
    for (const e of sorted) {
      if (!e || !e.name || !e.slug || !Array.isArray(e.bbox) || e.bbox.length !== 4) continue;
      const b = document.createElement('button'); b.className = 'routeRow';
      const meta = document.createElement('span'); meta.className = 'routeMeta';
      const nm = document.createElement('span'); nm.className = 'routeName'; nm.textContent = e.name;
      const sub = document.createElement('span'); sub.className = 'routeArea';
      sub.textContent = (typeof e.streets === 'number' && isFinite(e.streets) ? e.streets.toLocaleString('en-US') + ' streets · ' : '') + 'ready to load' + (String(e.name).toLowerCase() === last ? ' · last used' : '');
      meta.append(nm, sub);
      const chev = document.createElement('span'); chev.className = 'routeChev'; chev.textContent = '›';
      b.append(meta, chev);
      b.addEventListener('click', () => crPackPickCity(e));
      boxEl.appendChild(b);
    }
  });
}
function crPackPickCity(e) { // a chooser tap IS a city pick: it lands in the same crPickCity the typed search uses, with the catalogue's own bounds - so preparation, caching and the pick stage behave identically whichever door named the city
  draft = newDraft();
  const s = +e.bbox[0], w = +e.bbox[1], n = +e.bbox[2], ee = +e.bbox[3];
  crPickCity({ lat: String((s + n) / 2), lon: String((w + ee) / 2), boundingbox: [String(s), String(n), String(w), String(ee)], display_name: e.name + ', Ontario, Canada', address: { city: e.name, state: 'Ontario', country: 'Canada', country_code: 'ca' } });
}
function crOpenCityPane(ret) {
  crCityLookupSeq++; if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} crCityLastCtl = null; } // reopening the pane supersedes any held lookup (CG-PF-11)
  crCityReturn = ret;
  const last = lsGet(LS_GLOBAL.lastArea), lb = $('crCityLast');
  if (last) { lb.textContent = 'Use ' + last; lb.style.display = ''; } else lb.style.display = 'none';
  $('crCityInput').value = ''; $('crCityResults').innerHTML = '';
  if (creating) { if (!routeLoaded) restoreBootChrome(); else openRouteMenu(); }
  showRmPane('rmCityPane');
}
let crCityTimer = null, crCitySeq = 0, crCityCtl = null;
let crCityLookupSeq = 0, crCityLastCtl = null; // the one-tap last-city lookup's generation + abort handle (CG-PF-11: it is an async completion like any other - it binds to its generation, and any competing pick, Back, pane reopen or exit kills it)
async function crRunCitySearch() {
  const q = $('crCityInput').value.trim(), box = $('crCityResults');
  if (q.length < 3) { box.innerHTML = ''; return; }
  const seq = ++crCitySeq, session = crSession;
  if (crCityCtl) { try { crCityCtl.abort(); } catch (e) {} }
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null; crCityCtl = ctl;
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&featuretype=city&limit=6&q=' + encodeURIComponent(q), { headers: { 'Accept': 'application/json' }, signal: ctl ? ctl.signal : undefined });
    if (!r.ok) throw new Error('city search HTTP ' + r.status);
    const list = await r.json();
    if (seq !== crCitySeq || session !== crSession) return; // superseded, or the creation it belonged to has closed (CG-PF-05)
    box.innerHTML = '';
    const places = (Array.isArray(list) ? list : []).filter(crIsPlace);
    for (const it of places) {
      const b = document.createElement('button'); b.className = 'routeRow'; // Beta 1.125 (Andrew): manual-search results wear the SAME neat row as the city list - name on its own line, the rest of the address small and dim under it; full .rmBtn boxes stacked with no gap read as one bunched wall
      const dn = it.display_name || '', cut = dn.indexOf(',');
      const meta = document.createElement('span'); meta.className = 'routeMeta';
      const nm = document.createElement('span'); nm.className = 'routeName'; nm.textContent = cut > 0 ? dn.slice(0, cut).trim() : dn;
      meta.appendChild(nm);
      if (cut > 0 && dn.slice(cut + 1).trim()) { const sub = document.createElement('span'); sub.className = 'routeArea'; sub.textContent = dn.slice(cut + 1).trim(); meta.appendChild(sub); }
      b.appendChild(meta);
      b.addEventListener('click', () => crPickCity(it));
      box.appendChild(b);
    }
    if (!places.length) { const d = document.createElement('div'); d.className = 'rmNote'; d.textContent = 'No city matched that search — check the spelling, or go Back and pick from the list.'; box.appendChild(d); } // Beta 1.123: an empty answer SAYS so in the pane - 1.121 rendered nothing at all, which reads as a dead app (the same silence as the class/category defect, and just as unhelpful)
  } catch (e) { if (seq === crCitySeq && !(e && e.name === 'AbortError')) { box.innerHTML = ''; toast('City search needs an internet connection — try again', 3000); } }
}

// ---- draft geometry cache (Beta 1.135, maintainability programme N3): through 1.134 a
// single sector toggle recomputed computeStretches(draft.roads) TWICE - once in
// renderDraft, once in renderCrLists - ~87k segment tests per toggle on a six-street
// draft and ~1M on a full-size one, for geometry the toggle never touched. crDraftGeom
// computes it ONCE per draft-geometry change and every consumer shares the result.
// Invalidation is exact, keyed on identity + generation: the draft object and its roads
// object are replaced wholesale by every structural change except two (new draft,
// photo-door import, Clear all, exit), which the identity keys catch; the only in-place
// geometry mutations are crAddStreet joining a street and crRemoveStreet removing one,
// and both bump crGeomGen. Selection-only changes - sector picks, MAIN/2ND flips - touch
// neither key and never recompute. Identity-proven in the 1.135 fixture harness (the
// cached geometry deep-equals a fresh computeStretches at every step); drives 156-158
// judge the flows.
let crGeomCache = null, crGeomGen = 0;
function crDraftGeom() {
  if (crGeomCache && crGeomCache.draft === draft && crGeomCache.roads === draft.roads && crGeomCache.gen === crGeomGen) return crGeomCache.g;
  const g = computeStretches(draft.roads);
  crGeomCache = { draft, roads: draft.roads, gen: crGeomGen, g };
  return g;
}
const DRAFT_SRC = 'crDraft';
function ensureDraftLayers() {
  if (!map || typeof map.addSource !== 'function') return;
  try {
    if (!map.getSource(DRAFT_SRC)) map.addSource(DRAFT_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer('crDraftCase')) map.addLayer({ id: 'crDraftCase', type: 'line', source: DRAFT_SRC, filter: ['==', ['get', 'chosen'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': 'rgba(10,14,34,.55)', 'line-width': 8.5 } }); // Beta 1.127: the casing underlines CHOSEN geometry only - an unchosen sector wears no casing, like the mockup's plain grey ends
    if (!map.getLayer('crDraftLine')) map.addLayer({ id: 'crDraftLine', type: 'line', source: DRAFT_SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'chosen'], 1], ['case', ['==', ['get', 'main'], 1], '#ffc233', '#ef476f'], '#b9c1cb'], 'line-width': ['case', ['==', ['get', 'chosen'], 1], 4.5, 3] } }); // Beta 1.127: chosen = category colour at full width; unchosen = thin grey
    if (!map.getLayer('crDraftHit')) map.addLayer({ id: 'crDraftHit', type: 'line', source: DRAFT_SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 24 } }); // Beta 1.127: the sector pick's fat-finger target - invisible, queryable (crSectorTap)
  } catch (e) { /* the style may still be loading - renderDraft retries on every change */ }
}
function renderDraft() { // the DRAFT renders through its own GeoJSON source, computed from the draft's own roads - the active route's geometry, engine sources and storage are never touched by the create flow. Beta 1.127: a street carrying a sector pick (or open in sector mode) renders PER SECTOR - chosen sectors in its category colour, unchosen thin grey (the approved mockup's language); every other street renders as its whole line, exactly as before.
  ensureDraftLayers();
  if (!map || typeof map.getSource !== 'function') return;
  const src = map.getSource(DRAFT_SRC); if (!src) return;
  const feats = [];
  if (draft) {
    const g = crDraftGeom(); // Beta 1.135 (N3): the shared draft geometry - computed once per geometry change, not once per render
    for (const n of draftStreets()) {
      const main = draft.mains.has(n) ? 1 : 0;
      const sel = draft.sectors ? draft.sectors[n] : null;
      if (sel || crSectorStreet === n) {
        const rec = crStreetParts(n); if (!rec) continue;
        const set = crChosenSet(n, rec);
        for (let i = 0; i < rec.parts.length; i++) { const L = rec.parts[i]; if (L && L.length > 1) feats.push({ type: 'Feature', properties: { name: n, main, chosen: set.has(i) ? 1 : 0, sector: i }, geometry: { type: 'LineString', coordinates: L.map(p => [p[1], p[0]]) } }); }
      } else {
        const L = g[n] && g[n].line; if (L && L.length > 1) feats.push({ type: 'Feature', properties: { name: n, main, chosen: 1, sector: -1 }, geometry: { type: 'LineString', coordinates: L.map(p => [p[1], p[0]]) } });
      }
    }
  }
  src.setData({ type: 'FeatureCollection', features: feats });
}
onMapReady(() => map.on('styledata', () => { if (creating) { renderDraft(); crSetBackdrop(true); } })); // a basemap swap mid-create wipes custom layers - redraw the draft and re-hide the backdrop
onMapReady(() => { if (creating) crSetBackdrop(true); }); // creation entered before the map existed (boot mode): the backdrop lands when the map does

// ---- creation backdrop (Beta 1.120, Andrew's design): while creating, the
// loaded route's painted streets and selection would cover the very map he
// is picking from. They hide entirely, and in their place the map shows a
// POINT OF INTEREST for every route in the database - the same marker the
// map itself shows when zoomed out (white ring, raspberry dot, the route's
// name) at each pack's centre (the engine's ROUTEPOI is exactly that
// centre for the active pack; a pack's `spot` is its per-STREET label
// anchors, not the route POI). Orientation with zero clutter. The draft's
// own overlay (crDraft) is untouched, and exitCreate restores the exact
// visibility every hidden layer had before. ----
const CR_ROUTE_LAYERS = ['t1-casing', 't1-casingb', 't1-surface', 't1-band', 't1-edge', 't1-sel', 't1-selband', 't1-sele', 'sel-core-s', 'sel-core-b', 'hit', 'routepoi-ring', 'routepoi-dot', 'routepoi-txt']
  .concat([1, 2, 3, 4].map(t => 'streetnamespt' + t), [1, 2, 3, 4, 5].flatMap(i => ['sel-glow' + i + '-s', 'sel-glow' + i + '-b']));
let crHiddenLayers = null; // [[id, visibilityBefore], ...] recorded on the first hide; null = backdrop off
const CR_POI_SRC = 'crPoi';
function crPoiFeatures() {
  return ROUTE_PACKS.map(p => { const bb = computeRouteBox(p.roads); if (!bb) return null; return { type: 'Feature', properties: { name: p.name || '' }, geometry: { type: 'Point', coordinates: [(bb.w + bb.e) / 2, (bb.s + bb.n) / 2] } }; }).filter(Boolean);
}
function crPoiFont() { // the basemap's own Noto stack, read the way pickFontFromStyle reads it - a guessed stack renders no text
  try {
    const syms = (map.getStyle().layers || []).filter(l => l.type === 'symbol' && l.layout && l.layout['text-font']);
    const pick = syms.find(l => /noto/i.test(l.layout['text-font'].join(' '))) || syms[0];
    if (pick) return pick.layout['text-font'];
  } catch (e) {}
  return ['Noto Sans Regular'];
}
function ensureCrPoiLayers() {
  if (!map || typeof map.addSource !== 'function') return;
  try {
    const data = { type: 'FeatureCollection', features: crPoiFeatures() };
    if (!map.getSource(CR_POI_SRC)) map.addSource(CR_POI_SRC, { type: 'geojson', data });
    else map.getSource(CR_POI_SRC).setData(data);
    const night = isNight();
    if (!map.getLayer('crPoiRing')) map.addLayer({ id: 'crPoiRing', type: 'circle', source: CR_POI_SRC, paint: { 'circle-radius': 9, 'circle-color': '#ffffff', 'circle-stroke-color': 'rgba(10,14,34,.25)', 'circle-stroke-width': 1 } });
    if (!map.getLayer('crPoiDot')) map.addLayer({ id: 'crPoiDot', type: 'circle', source: CR_POI_SRC, paint: { 'circle-radius': 6, 'circle-color': '#ef476f' } });
    if (!map.getLayer('crPoiTxt')) map.addLayer({ id: 'crPoiTxt', type: 'symbol', source: CR_POI_SRC, layout: { 'text-field': ['get', 'name'], 'text-font': crPoiFont(), 'text-size': 11, 'text-anchor': 'left', 'text-offset': [1.1, 0], 'text-allow-overlap': true }, paint: { 'text-color': night ? '#e8e8e8' : '#333333', 'text-halo-color': night ? 'rgba(0,0,0,.8)' : 'rgba(255,255,255,.9)', 'text-halo-width': 1.6 } });
  } catch (e) { /* the style may still be loading - the styledata hook re-runs this while creating */ }
}
function crSetBackdrop(on) {
  if (!map || typeof map.setLayoutProperty !== 'function') return;
  if (on) {
    if (!crHiddenLayers) {
      crHiddenLayers = [];
      for (const id of CR_ROUTE_LAYERS) { try { if (map.getLayer(id)) crHiddenLayers.push([id, map.getLayoutProperty(id, 'visibility') || 'visible']); } catch (e) {} }
    }
    for (const pair of crHiddenLayers) { try { map.setLayoutProperty(pair[0], 'visibility', 'none'); } catch (e) {} }
    ensureCrPoiLayers();
  } else {
    if (crHiddenLayers) { for (const pair of crHiddenLayers) { try { if (map.getLayer(pair[0])) map.setLayoutProperty(pair[0], 'visibility', pair[1]); } catch (e) {} } crHiddenLayers = null; }
    for (const id of ['crPoiRing', 'crPoiDot', 'crPoiTxt']) { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} }
    try { if (map.getSource(CR_POI_SRC)) map.removeSource(CR_POI_SRC); } catch (e) {}
  }
}
function crRowEl(n, g) {
  const row = document.createElement('div'); row.className = 'crRow';
  const main = draft.mains.has(n);
  const dot = document.createElement('span'); dot.className = 'crDot ' + (main ? 'main' : 'sec'); row.appendChild(dot);
  const nm = document.createElement('span'); nm.className = 'crName'; nm.textContent = n; row.appendChild(nm);
  const ln = document.createElement('span'); ln.className = 'crLen'; ln.textContent = fmtLenM(crStreetChosenM(n, g)); row.appendChild(ln); // Beta 1.130 (maintainability re-scan N1): the preview's rows bill the CHOSEN length through the same helper as the panel's rows and every total - through 1.129 this read g[n].total, so a sector-trimmed street showed its WHOLE length on the check screen while the panel billed the trim and the preview's own total (renderCrLists sums crStreetChosenM) disagreed with its rows
  const chip = document.createElement('button'); chip.className = 'crChip ' + (main ? 'main' : 'sec'); chip.textContent = main ? 'MAIN' : '2ND';
  chip.addEventListener('click', () => { if (draft.mains.has(n)) draft.mains.delete(n); else draft.mains.add(n); renderDraft(); renderCrLists(); });
  row.appendChild(chip);
  const del = document.createElement('button'); del.className = 'crDel'; del.textContent = '✕'; del.title = 'Remove ' + n;
  del.addEventListener('click', () => crRemoveStreet(n)); // Beta 1.127: the shared removal path (sector state leaves with the street)
  row.appendChild(del);
  return row;
}
function crPanelRowEl(n, g) { // Beta 1.127 (Andrew's approved mockup, screen 2): one short row per picked road - category dot, name, "Entire road · X m" or "N of M sectors · X m", the MAIN/2ND chip IN the row (one tap flips the road's type), x to remove; tapping the row itself opens the street's sector trimming
  const main = draft.mains.has(n);
  const row = document.createElement('div'); row.className = 'crPRow';
  const dot = document.createElement('span'); dot.className = 'crDot ' + (main ? 'main' : 'sec'); row.appendChild(dot);
  const meta = document.createElement('span'); meta.className = 'crPMeta';
  const nm = document.createElement('span'); nm.className = 'crPName'; nm.textContent = n; meta.appendChild(nm);
  const sub = document.createElement('span'); sub.className = 'crPSub';
  const sel = draft.sectors ? draft.sectors[n] : null;
  if (sel) { const rec = crStreetParts(n); sub.textContent = sel.length + ' of ' + (rec ? rec.parts.length : sel.length) + ' sectors · ' + fmtLenM(crStreetChosenM(n, g)) + ' — tap row to adjust'; }
  else sub.textContent = 'Entire road · ' + fmtLenM(g[n] ? g[n].total : 0) + ' — tap row to adjust'; // Beta 1.128: the adjust affordance is stated BEFORE any trim exists - in 1.127 it appeared only after one, so an untrimmed row gave no hint it could be tapped at all
  meta.appendChild(sub); row.appendChild(meta);
  const chip = document.createElement('button'); chip.className = 'crPChip ' + (main ? 'main' : 'sec'); chip.textContent = main ? 'MAIN' : '2ND';
  chip.addEventListener('click', e => { e.stopPropagation(); if (draft.mains.has(n)) draft.mains.delete(n); else draft.mains.add(n); renderDraft(); renderCrLists(); });
  row.appendChild(chip);
  const del = document.createElement('button'); del.className = 'crPDel'; del.textContent = '✕'; del.title = 'Remove ' + n;
  del.addEventListener('click', e => { e.stopPropagation(); crRemoveStreet(n); });
  row.appendChild(del);
  row.addEventListener('click', () => crOpenSectors(n));
  return row;
}
function renderCrLists() {
  if (!draft) return;
  const g = crDraftGeom(); // Beta 1.135 (N3): shares renderDraft's computation through the draft geometry cache
  const names = draftStreets().sort((a, b) => a.localeCompare(b));
  let tot = 0; for (const n of names) tot += crStreetChosenM(n, g); // Beta 1.127: totals bill CHOSEN lengths - a trimmed street's unchosen ends never count
  $('crCount').textContent = names.length + ' roads · ' + fmtLenM(tot); // Beta 1.127: the panel header's count in the mockup's shape ("3 roads · 2,410 m")
  $('pvCount').textContent = names.length + ' streets · ' + draft.mains.size + ' mains · ' + fmtLenM(tot); // the preview keeps its fuller count line
  { const el = $('crPickList'); el.innerHTML = ''; for (const n of names) el.appendChild(crPanelRowEl(n, g)); }
  { const el = $('pvList'); el.innerHTML = ''; for (const n of names) el.appendChild(crRowEl(n, g)); }
  for (const pk of Object.keys(crPending).sort()) { // Beta 1.121: pending streets (shape reaches past verified coverage) list in the PICK sheet only - never in the preview, never in the count, never saved
    if (draft.roads[pk]) continue;
    const row = document.createElement('div'); row.className = 'crRow pending';
    const dot = document.createElement('span'); dot.className = 'crDot sec'; row.appendChild(dot);
    const nm = document.createElement('span'); nm.className = 'crName'; nm.textContent = pk; row.appendChild(nm);
    const chip = document.createElement('span'); chip.className = 'crChip pend'; chip.textContent = 'PENDING'; row.appendChild(chip);
    const del = document.createElement('button'); del.className = 'crDel'; del.textContent = '✕'; del.title = 'Drop ' + pk;
    del.addEventListener('click', () => { delete crPending[pk]; renderCrLists(); });
    row.appendChild(del);
    $('crPickList').appendChild(row);
  }
  $('crStripTitle').textContent = names.length ? names.length + (names.length === 1 ? ' road' : ' roads') + ' picked' : 'No roads picked yet'; // the tucked-away bar always carries the state (mockup screen 4) - Beta 1.128: at zero picks it says so, because the bar now exists at zero too
  $('crStripSub').textContent = names.length ? fmtLenM(tot) + ' · tap Review to see them' : 'Tap roads on the map to add them';
  $('crDoneBtn').disabled = !names.length;
  $('crDoneBtn').textContent = 'Done'; // Beta 1.128 (Andrew): one word, ALWAYS - the 1.127 "Looks right" / "Done - back to check" rewrite is gone with the confusion it caused; Done goes to the check screen from the fresh state and the return-from-preview state alike
  $('pvSaveBtn').disabled = !names.length;
  syncCrPanel();
}
let crConfirmCb = null;
let crConfirmOneBtn = false; // Beta 1.132: true while the current confirm wears the one-button shape (the discard ask)
function crConfirm(title, msg, cb, labels) { $('crModalTitle').textContent = title; $('crModalMsg').textContent = msg; crConfirmCb = cb; crConfirmOneBtn = !!(labels && labels.oneBtn); $('crModalYes').textContent = (labels && labels.yes) || 'Discard'; $('crModalYes').classList.toggle('danger', !!(labels && labels.danger) || crConfirmOneBtn); $('crModalNo').textContent = (labels && labels.no) || '✕'; $('crModalNo').style.display = crConfirmOneBtn ? 'none' : ''; $('crModalX').style.display = crConfirmOneBtn ? '' : 'none'; $('crModal').classList.remove('hidden'); } // Beta 1.124: labels are optional; route deletion passes {yes:'Delete', no:'Cancel', danger:true}. Beta 1.132 (Andrew): the DISCARD ask (askDiscard) passes {oneBtn:true} and changes shape - ONE red Discard button, nothing else in the row; dismissal lives on the card's plain red corner X (crModalX, styled by the shared corner-X rule in head.html) and on a tap of the backdrop, and dismissing always means keep editing. Every other confirm keeps its two-button row exactly as before. The card itself is the --card token surface in BOTH themes - the confirm never hardcodes a light background.
function crConfirmDismiss() { $('crModal').classList.add('hidden'); crConfirmCb = null; }
$('crModalYes').addEventListener('click', () => { $('crModal').classList.add('hidden'); const cb = crConfirmCb; crConfirmCb = null; if (cb) cb(); });
$('crModalNo').addEventListener('click', crConfirmDismiss);
$('crModalX').addEventListener('click', crConfirmDismiss);
$('crModal').addEventListener('click', (e) => { if (crConfirmOneBtn && e.target === $('crModal')) crConfirmDismiss(); }); // Beta 1.132: a backdrop tap dismisses ONLY in the one-button shape
function parkBootChrome() { const sp = $('splash'); if (sp) sp.style.visibility = 'hidden'; $('routeMenu').classList.remove('show'); crBootParked = true; }
function restoreBootChrome() { if (!crBootParked) return; crBootParked = false; const sp = $('splash'); if (sp) sp.style.visibility = ''; $('routeMenu').classList.add('show'); }
function setCreateStage(stage) {
  if (stage !== 'pick') { crSectorStreet = null; crSectorSnapshot = undefined; } // Beta 1.127: sector mode belongs to the pick stage - the preview never inherits a half-trimmed street's bar (Beta 1.129: its Cancel snapshot dies with it)
  crStage = stage;
  $('createBar').classList.toggle('on', stage === 'pick');
  $('createSheet').classList.toggle('on', stage === 'pick');
  $('previewSheet').classList.toggle('on', stage === 'preview');
  $('createResults').classList.remove('on');
  $('createHint').classList.toggle('on', stage === 'pick');
  if (stage === 'pick') crRenderHint(); else $('crHintBtn').style.display = 'none'; // Beta 1.121: the hint is state-driven now (crRenderHint owns it) - the preparation state must survive stage changes, not be overwritten by a static line
  renderCrLists(); renderDraft();
  if (stage === 'preview') fitDraft();
}
function enterCreate(stage) {
  if (!draft) draft = newDraft();
  creating = true;
  crSectorStreet = null; crSectorSnapshot = undefined; crPanelCollapsed = false; crSettleMorph(); // Beta 1.127: every creation starts un-trimmed with the panel up (Beta 1.129: any surface morph a previous creation left in flight lands first)
  crSession++; // a fresh creation session: async completions born in any earlier session are obsolete from here (CG-PF-05)
  document.body.classList.add('creating');
  followPaused = true; // the camera belongs to the picking now; GPS is device state and is not stopped - follow resumes from the Locate tab afterwards
  try { deselect(); } catch (e) {} closeSheets();
  if (routeLoaded) closeRouteMenu(); else parkBootChrome();
  crSetBackdrop(true); // Beta 1.120: the loaded route's paint steps aside for the picking (POIs only) - see crSetBackdrop
  setCreateStage(stage);
}
function exitCreate() {
  creating = false; draft = null; crStage = 'pick'; crAreaGuess = ''; crSectorStreet = null; crSectorSnapshot = undefined; crPanelCollapsed = false; // Beta 1.127: the panel + sector session state dies with the creation
  crSession++; crCovGen++; // every async completion born in this session is obsolete the moment the flow closes - it must not land in a later draft, hint or busy state (CG-PF-05)
  if (crPrep) { clearInterval(crPrep.ticker); crAbortOp(crPrep.op); crPrep = null; } // and the downloads themselves stop (CG-PF-10)
  if (crGrid) { crGridStop('exit'); crGrid = null; } // the grid's downloads stop too; its committed cells live on in the on-device city cache, by design
  crCacheNote = '';
  crPackCtx = null; crPackNote = ''; // Beta 1.123: the pack context belongs to the closed session's city - the next creation re-decides its source
  crAbortOp(crTopOp); crTopOp = null;
  crCityLookupSeq++; if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} crCityLastCtl = null; } // a held last-city lookup dies with the session (CG-PF-11)
  crCov = null; crCity = null; crPrepState = 'none'; crPrepFail = null; crPrepAnchor = null; crPending = {}; crToppedUp = {}; crWanted = null;
  $('crHintBtn').style.display = 'none';
  if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
  crSearchSeq++; if (crSearchCtl) { try { crSearchCtl.abort(); } catch (e) {} crSearchCtl = null; } // no in-flight suggestion may land after the flow has closed
  document.body.classList.remove('creating');
  for (const id of ['createBar', 'createSheet', 'previewSheet', 'createResults', 'createHint']) $(id).classList.remove('on');
  crSetBackdrop(false); // Beta 1.120: the loaded route's paint returns exactly as it was
  renderDraft(); // draft is null: the overlay clears, the active route was never touched
}
function openDoors() { crWarmCityLibrary(); if (!routeLoaded) { restoreBootChrome(); } else openRouteMenu(); showRmPane('rmCreatePane'); } // Beta 1.124: the doors pane needs no render on entry - the city list renders when ITS door is tapped. Beta 1.130: the doors ARE the create gate - opening them starts the catalogue download (crWarmCityLibrary), so it is in hand by the list tap
function askDiscard(then) { if (draft && draftStreets().length) crConfirm('Throw away this draft?', 'The ' + draftStreets().length + ' streets you picked will be lost.', then, { oneBtn: true }); else then(); }
function fitDraft() {
  if (!draft || !map) return;
  const bb = computeRouteBox(crFilteredRoads()); if (!bb) return; // Beta 1.127: the preview frames what will save (chosen sectors), not the whole streets
  try { map.fitBounds([[bb.w, bb.s], [bb.e, bb.n]], { padding: 56, duration: 800 }); } catch (e) {}
}
$('crExit').addEventListener('click', () => { // Beta 1.120: the ✕ beside the search first CLEARS the search (text + open results) when there is anything to clear - that is what a ✕ beside a search bar means; pressed with an empty search it exits creating, as before
  const box = $('createResults');
  if (box.classList.contains('on') || $('crSearchInput').value) {
    box.classList.remove('on'); $('crSearchInput').value = '';
    if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
    crSearchSeq++; if (crSearchCtl) { try { crSearchCtl.abort(); } catch (e) {} }
    return;
  }
  askDiscard(() => { const wasBoot = !routeLoaded; exitCreate(); if (wasBoot) openDoors(); });
});
$('pvStartOverBtn').addEventListener('click', () => askDiscard(() => { exitCreate(); openDoors(); }));

// ---- Door 1: photo -> waiting state -> draft import ----
$('crDoorPhoto').addEventListener('click', () => showRmPane('rmPhotoPane'));
$('crPhotoBack').addEventListener('click', () => showRmPane('rmCreatePane')); // Beta 1.124: the photo pane backs to the doors pane it came from (1.123's chooser pane was that pane's old shape)
$('crPhotoBtn').addEventListener('click', () => $('crPhotoFile').click());
$('crPhotoFile').addEventListener('change', () => {
  const f = $('crPhotoFile').files && $('crPhotoFile').files[0]; $('crPhotoFile').value = '';
  if (!f) return;
  crPhoto = f;
  $('crPhotoName').textContent = f.name || 'photo';
  $('crPhotoPick').style.display = 'none'; $('crPhotoWait').style.display = '';
  const sh = $('crShareBtn');
  let can = false; try { can = !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) {}
  sh.style.display = can ? '' : 'none'; // the share affordance exists only where the platform offers it - silent absence otherwise
});
$('crShareBtn').addEventListener('click', () => { if (crPhoto && navigator.share) navigator.share({ files: [crPhoto] }).catch(() => {}); });
$('crImportBtn').addEventListener('click', () => $('crDraftFile').click());
$('crDraftFile').addEventListener('change', async () => {
  const f = $('crDraftFile').files && $('crDraftFile').files[0]; $('crDraftFile').value = '';
  if (!f) return;
  let text = ''; try { text = await f.text(); } catch (e) { toast('That draft file could not be read', 3200); return; }
  importDraft(text);
});
function importDraft(text) { // fail closed, named errors, nothing half-applied - the same discipline as a backup restore
  let obj; try { obj = JSON.parse(text); } catch (e) { toast('That draft file could not be read — it is not valid JSON', 3600); return; }
  let raw = obj;
  if (obj && typeof obj === 'object' && !Array.isArray(obj) && obj.roads === undefined) { // the sandbox pipeline's candidate shape: a bare roads object
    const vals = Object.values(obj);
    if (vals.length && vals.every(v => Array.isArray(v))) raw = { roads: obj };
    else { toast('That draft file has no roads in it — nothing was imported', 3600); return; }
  }
  const v = normalizePack(raw, { draft: true });
  if (!v.ok) { toast('Draft not imported — ' + v.error, 4000); return; }
  draft = newDraft();
  draft.roads = v.pack.roads; draft.mains = new Set(v.pack.main); draft.name = v.pack.name || ''; draft.area = v.pack.area || ''; draft.tileNames = v.pack.tileNames.slice();
  enterCreate('preview');
  toast('Draft loaded — check it over', 2600);
}

// ---- Door 2: city first (Andrew's amendment) -> prepare the area's street shapes once -> tap roads, resolved locally ----
$('crDoorList').addEventListener('click', () => { showRmPane('rmCityListPane'); crRenderCityChoices(); }); // Beta 1.124: Select from list - the city rows render fresh on every entry to the list pane
$('rmCityListBack').addEventListener('click', () => showRmPane('rmCreatePane')); // the list pane backs to the doors pane (the mockup's pane-to-pane Back chain)
$('crDoorManual').addEventListener('click', () => { draft = newDraft(); crOpenCityPane('doors'); });
$('crCityInput').addEventListener('input', () => { if (crCityTimer) clearTimeout(crCityTimer); crCityTimer = setTimeout(() => { crCityTimer = null; crRunCitySearch(); }, 500); });
$('crCityLast').addEventListener('click', async () => {
  const last = lsGet(LS_GLOBAL.lastArea); if (!last) return;
  // resolve the remembered NAME back to a place (centre + bounds) through the same city search; if the lookup fails, the name alone still scopes the creation - anchors then come from street-search picks and Prepare this area.
  // CG-PF-11 (verify round): this completion binds to (lookup generation, creation session, the pane still being open) - a slow lookup must never overwrite a city picked in the meantime, and Back / exit / a competing pick abort it outright.
  const seq = ++crCityLookupSeq, session = crSession;
  if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} }
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null; crCityLastCtl = ctl;
  const stillMine = () => seq === crCityLookupSeq && session === crSession && $('rmCityPane').classList.contains('on');
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&featuretype=city&limit=6&q=' + encodeURIComponent(last), { headers: { 'Accept': 'application/json' }, signal: ctl ? ctl.signal : undefined });
    if (r.ok) { const list = await r.json(); if (!stillMine()) return; const hit = (Array.isArray(list) ? list : []).find(crIsPlace); if (hit) { crPickCity(hit); return; } }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  if (!stillMine()) return;
  crCity = { name: last, lat: null, lon: null, bbox: null };
  crAreaGuess = last; if (draft && !draft.area) draft.area = last;
  crEnterPickFromCity();
});
$('crCityBack').addEventListener('click', () => {
  crCityLookupSeq++; if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} crCityLastCtl = null; } // leaving the pane kills a held lookup (CG-PF-11)
  if (crCityReturn === 'preview' || crCityReturn === 'pick') { if (!routeLoaded) parkBootChrome(); else closeRouteMenu(); setCreateStage(crCityReturn); }
  else { showRmPane('rmCreatePane'); }
});
$('crCityChange').addEventListener('click', () => crOpenCityPane('pick'));
$('crHintBtn').addEventListener('click', () => {
  if (crPrepState === 'preparing') { crCancelPrep(); return; }
  if (crWanted) { crStartPrep(crWanted.anchor); return; } // an outstanding offer (outside-coverage tap / pending street) prepares exactly where it points - it outranks the state remedies below
  if (crPrepState === 'degraded') { crGridResume(); return; } // Resume / Retry missing parts: only the missing cells fetch (amendments A+B)
  if (crPrepState === 'failed') {
    if (crFailFromGrid) { crGridResume(); return; } // a failed GRID retries its missing cells
    if (crPrepFail && crPrepFail.kind === 'dense') { if (map) { const c = map.getCenter(); crStartPrep({ lat: c.lat, lng: c.lng }); } } // the dense remedy: prepare wherever the map now sits (CG-PF-09)
    else if (crPrepAnchor) crStartPrep(crPrepAnchor); // Retry: the same anchor again
    return;
  }
  if (crPrepState === 'ready' && crGrid && crGrid.fromCache) { crGridRefresh(); return; } // the saved city's Refresh: load the whole city again
  if (map) { const c = map.getCenter(); crStartPrep({ lat: c.lat, lng: c.lng }); } // Prepare this area: the anchor is the map centre he is looking at
});
onMapReady(() => map.on('moveend', () => { if (creating && crStage === 'pick' && crPrepState === 'none') crRenderHint(); })); // the Prepare-this-area offer follows the zoom (it appears only at picking zoom) - never a silent download while merely panning
$('crSearchBtn').addEventListener('click', crSearch);
$('crSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') crSearch(); });
// Beta 1.120 (Andrew): search AS YOU TYPE. 1.118/1.119 searched only on
// the Search button - his call then; on the phone he asked for
// suggestions while typing, and this supersedes it. The volume stays
// honest: a keystroke burst becomes ONE query (500 ms debounce, 3+
// characters), a newer query aborts and supersedes the one in flight
// (sequence token + AbortController, so a slow earlier answer can never
// overwrite newer results), and the Search button / Enter still run the
// typed query immediately. Results are biased toward the visible map
// (viewbox, bounded=0 - a bias, never a restriction).
let crSearchTimer = null, crSearchSeq = 0, crSearchCtl = null;
$('crSearchInput').addEventListener('input', () => {
  if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
  $('crSearchBtn').disabled = false;
  const q = $('crSearchInput').value.trim();
  if (q.length < 3) { crSearchSeq++; if (crSearchCtl) { try { crSearchCtl.abort(); } catch (e) {} } $('createResults').classList.remove('on'); return; }
  crSearchTimer = setTimeout(() => { crSearchTimer = null; crRunSearch(true); }, 500);
});
function crSearch() { // the button / Enter: cancel any pending debounce and run the typed query NOW
  if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
  crRunSearch(false);
}
async function crRunSearch(fromTyping) {
  const q = $('crSearchInput').value.trim(); if (!q) return;
  const seq = ++crSearchSeq;
  if (crSearchCtl) { try { crSearchCtl.abort(); } catch (e) {} }
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null; crSearchCtl = ctl;
  if (!fromTyping) $('crSearchBtn').disabled = true;
  try {
    let url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=' + encodeURIComponent(q);
    try { // Beta 1.121: with a city chosen, the street search is biased to the CITY (its Nominatim bounding box) - preparation and search live inside the city he picked; without one, the visible map biases as before. bounded=0 either way: a bias, never a restriction.
      if (crCity && crCity.bbox) url += '&viewbox=' + [crCity.bbox.w, crCity.bbox.n, crCity.bbox.e, crCity.bbox.s].map(v => +v.toFixed(5)).join(',') + '&bounded=0';
      else if (map) { const b = map.getBounds(); url += '&viewbox=' + [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].map(v => +v.toFixed(5)).join(',') + '&bounded=0'; }
    } catch (e) {}
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctl ? ctl.signal : undefined });
    if (!r.ok) throw new Error('search HTTP ' + r.status);
    const list = await r.json();
    if (seq !== crSearchSeq) return; // superseded while in flight - a newer query owns the dropdown
    renderCrResults(Array.isArray(list) ? list : []);
    if (!fromTyping && (!Array.isArray(list) || !list.length)) toast('No places matched that search', 3000);
  } catch (e) {
    if (seq === crSearchSeq && !(e && e.name === 'AbortError') && !fromTyping) toast('Search needs an internet connection — try again', 3200);
  }
  if (!fromTyping && seq === crSearchSeq) $('crSearchBtn').disabled = false;
}
document.addEventListener('pointerdown', (e) => { // Beta 1.120 (Andrew): tapping anywhere outside the results dropdown dismisses it - map taps included (the pick still runs: this only closes the list, in the capture phase, before the map's own click)
  if (!creating) return;
  const box = $('createResults');
  if (!box.classList.contains('on')) return;
  if (e.target && (box.contains(e.target) || $('createBar').contains(e.target))) return;
  box.classList.remove('on');
}, true);
function renderCrResults(list) {
  const box = $('createResults'); box.innerHTML = '';
  for (const it of list) {
    const b = document.createElement('button'); b.className = 'crResult'; b.textContent = it.display_name || '';
    b.addEventListener('click', () => {
      box.classList.remove('on');
      const lat = parseFloat(it.lat), lon = parseFloat(it.lon); if (!isFinite(lat) || !isFinite(lon)) return;
      const a = it.address || {}; crAreaGuess = a.city || a.town || a.village || a.municipality || a.county || '';
      if (map) map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 15), duration: 900 });
      if (crGrid && crCity && crInBox(crGrid.bbox, lat, lon)) { /* inside the picked city: its grid is the preparation (already running or saved) - no second download for a search pick */ }
      else crStartPrep({ lat, lng: lon }); // Beta 1.121: outside any city coverage, the search pick ANCHORS the fallback box preparation (anchor rule (a)) - taps then resolve locally from the extract
    });
    box.appendChild(b);
  }
  box.classList.toggle('on', list.length > 0);
}
const CR_SUFFIX = /\s+(Drive|Court|Boulevard|Lane|Street|Avenue|Crescent|Road|Place|Ridge|Way|Terrace|Circle|Gate|Heights|Trail|Parkway)$/;
const CR_ORDINALS = { '1st': 'First', '2nd': 'Second', '3rd': 'Third', '4th': 'Fourth', '5th': 'Fifth', '6th': 'Sixth', '7th': 'Seventh', '8th': 'Eighth', '9th': 'Ninth', '10th': 'Tenth', '11th': 'Eleventh', '12th': 'Twelfth' };
function shortStreetName(osm) { // the app's short-name convention (the sandbox's suffix rule; ordinal avenues spell out - 5th Avenue is Fifth)
  const m = /^(\d+(?:st|nd|rd|th))\s+Avenue$/i.exec(osm);
  if (m && CR_ORDINALS[m[1].toLowerCase()]) return CR_ORDINALS[m[1].toLowerCase()];
  const s = osm.replace(CR_SUFFIX, '');
  return s && s !== osm ? s : osm;
}
function crLineLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += distM(pts[i - 1], pts[i]); return s; }
function chainWays(ways) { // the sandbox's stitch: greedy endpoint chaining at 1.5 m tolerance into runs. A run whose joins were all exact keeps its ways as segments (the app's own stitcher re-chains them identically); a run with a bridged join is stored as its single stitched line.
  const pool = ways.map(w => w.slice());
  const runs = [];
  while (pool.length) {
    let bi = 0; for (let i = 1; i < pool.length; i++) if (crLineLen(pool[i]) > crLineLen(pool[bi])) bi = i;
    const first = pool.splice(bi, 1)[0];
    let line = first.slice(); const segs = [first]; let exact = true;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i], a = s[0], b = s[s.length - 1], L0 = line[0], L1 = line[line.length - 1];
        const dAL1 = distM(a, L1), dBL1 = distM(b, L1), dBL0 = distM(b, L0), dAL0 = distM(a, L0);
        let addLine = null, addSeg = null, dJoin = 0;
        if (dAL1 <= 1.5) { addLine = s.slice(1); addSeg = s; dJoin = dAL1; line = line.concat(addLine); }
        else if (dBL1 <= 1.5) { addLine = s.slice(0, -1).reverse(); addSeg = s.slice().reverse(); dJoin = dBL1; line = line.concat(addLine); }
        else if (dBL0 <= 1.5) { addLine = s.slice(0, -1); addSeg = s; dJoin = dBL0; line = addLine.concat(line); }
        else if (dAL0 <= 1.5) { addLine = s.slice(1).reverse(); addSeg = s.slice().reverse(); dJoin = dAL0; line = addLine.concat(line); }
        else continue;
        if (dJoin > 0.01) exact = false;
        segs.push(addSeg); pool.splice(i, 1); grew = true; break;
      }
    }
    runs.push({ segments: segs, line, exact });
  }
  return runs;
}
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']; // primary + fallback (both named in the stamped CSP's connect-src)
// Beta 1.121: overpassQuery + fetchStreetGeometry are GONE - they were the
// per-tap fetch (and the malformed query's home). All Overpass traffic now
// goes through crOverpassFetch with queries built by crQL/crAreaQL/
// crNameQL (see the preparation block above); taps resolve locally.
async function pickStreet(osmName, lngLat) {
  const short = shortStreetName(osmName);
  if (!draft) return;
  if (draft.roads[short]) { crOpenSectors(short); return; } // Beta 1.128 (Andrew's fork, decided from his 1.127 device session): a tap on an ALREADY-PICKED street opens its sectors - the map-level section picking he asked for. 1.127's tap-again-to-deselect is RETIRED: removal lives only on the panel row's ✕ and Clear all. The street is already resolved and validated, so this never re-resolves
  if (crPending[short]) { toast(short + ' is pending — it runs past the prepared area and is not in your route yet', 3400); return; }
  if (crPickBusy) return;
  // Beta 1.121: the tap resolves LOCALLY from the prepared extract - no
  // network on the ordinary path (CG-PF-04). Before the extract is ready
  // the tap still IDENTIFIES the street and says so honestly; it never
  // pretends to add it - nothing appears added until accurate geometry
  // is in hand and validated (the line the whole create flow holds).
  // A tap inside a part of the city that has ALREADY landed resolves
  // even while the rest still loads - progress is real (amendment B).
  if (crCov && crCov.boxes.length) {
    const res0 = crResolve(osmName, lngLat);
    if (res0.status === 'ok') { crAddStreet(short, osmName, res0.segs); return; }
    if (res0.status === 'absent') {
      if (crInAnyBox(crCov.boxes, lngLat.lat, lngLat.lng)) { toast('No shape found for ' + short + ' here — the map data holds no line for it', 3600); return; }
      if (crGrid && crInBox(crGrid.bbox, lngLat.lat, lngLat.lng)) {
        const cell = crGrid.cells.find(c => crInBox(c.box, lngLat.lat, lngLat.lng));
        if (cell && cell.state === 'failed') toast('That part of ' + crGrid.name + ' didn’t load — ' + short + ' can be added after Retry missing parts', 3800);
        else toast('That part of ' + (crCity ? crCity.name : 'the city') + ' is still loading — ' + short + ' can be added as soon as it lands', 3400);
        return;
      }
      crPrepAnchor = { lat: lngLat.lat, lng: lngLat.lng }; crWanted = { anchor: { lat: lngLat.lat, lng: lngLat.lng }, label: 'Prepare this area' }; crRenderHint(); toast(short + ' is outside the prepared area — prepare this area, then tap it again', 3800);
      return;
    }
    // edge (Codex (c)): the run reaches beyond verified coverage - ONE
    // targeted fetch for this name over an expanded bounded area (centred
    // on the run's open end), merged by way id, then resolved again
    // against that wider boundary. Still beyond afterwards: PENDING.
    const session = crSession, gen = crCovGen, topKey = short + '@' + gen;
    if (crToppedUp[topKey]) { crPendStreet(short, osmName, lngLat, res0.run, null); return; }
    crToppedUp[topKey] = true;
    crPickBusy = true;
    const hint = $('createHint'); hint.textContent = 'Checking the whole of ' + short + '…'; hint.classList.add('on');
    const op = {}; crTopOp = op; // exitCreate can stop this download too (CG-PF-10)
    try {
      let openEnd = { lat: lngLat.lat, lng: lngLat.lng };
      if (res0.run && res0.run.line) { for (const end of [res0.run.line[0], res0.run.line[res0.run.line.length - 1]]) { if (!crInAnyBox(crCov.boxes, end[0], end[1])) { openEnd = { lat: end[0], lng: end[1] }; break; } } }
      const box = crBoxAround(openEnd.lat, openEnd.lng, CR_INNER_KM + CR_BUFFER_KM + CR_TOPUP_RING_KM);
      const got = await crSourceExtract(box, osmName, CR_TIMING.topupBudgetMs, CR_TIMING.topupAttempt1Ms, () => creating && crSession === session && crCovGen === gen, op);
      if (!creating || crSession !== session || crCovGen !== gen || !draft) return; // obsolete: land nowhere (CG-PF-05)
      if (!got.ok) {
        if (got.kind === 'dense') toast('That area is too dense to check ' + short + ' against — it stays out of your route for now', 4000);
        else if (got.kind === 'error' || got.kind === 'badjson') toast('The street-shape service answered with an error — ' + short + ' was not added', 3800);
        else if (got.kind !== 'stale') toast('The street-shape service didn’t answer — ' + short + ' was not added', 3800);
        crRenderHint();
        return;
      }
      crCovMerge(got.json.elements, null); // merged by way id; the top-up's box verifies THIS resolution (below) but does not join the coverage set - a later street must earn its own proof
      const res = crResolve(osmName, lngLat, box);
      if (res.status === 'ok') crAddStreet(short, osmName, res.segs); else crPendStreet(short, osmName, lngLat, res.run, box);
    } finally { if (crTopOp === op) crTopOp = null; crPickBusy = false; } // Beta 1.120: EVERY exit path releases the picker - 1.119's early return on a null shape skipped this line and one refused fetch wedged tapping for the whole session (Andrew, on device). The session/generation guards above are what bind the COMPLETION (CG-PF-05); the busy flag can only be held by the one pick in flight, so releasing it here can never clear a newer operation's state.
    return;
  }
  if (crPrepState === 'preparing') { toast('Still preparing street shapes — ' + short + ' can be added as soon as they are ready', 3200); return; }
  crPrepAnchor = { lat: lngLat.lat, lng: lngLat.lng };
  crWanted = { anchor: { lat: lngLat.lat, lng: lngLat.lng }, label: 'Prepare this area' }; // the offer names THIS tap's area, and the hint button prepares exactly there (CG-PF-09)
  toast('Street shapes aren’t ready for this area yet — tap Prepare this area, then tap ' + short + ' again', 3800);
  crRenderHint();
}
function crFeatDistM(lngLat, geom) { // metres from the tap to the nearest point of a tile feature's line(s), in distM's flat-earth metres. CHOICE ONLY (see crMapTap): the number judges which named street a tap meant - it is never stored and never shapes the route
  if (!geom) return Infinity;
  const lines = geom.type === 'LineString' ? [geom.coordinates] : (geom.type === 'MultiLineString' ? geom.coordinates : []);
  const px = lngLat.lng * MLNG, py = lngLat.lat * MLAT;
  let best = Infinity;
  for (const line of lines) {
    if (!Array.isArray(line)) continue;
    for (let i = 0; i < line.length; i++) {
      const ax = line[i][0] * MLNG, ay = line[i][1] * MLAT;
      const d0 = Math.hypot(px - ax, py - ay); if (d0 < best) best = d0;
      if (i > 0) {
        const bx = line[i - 1][0] * MLNG, by = line[i - 1][1] * MLAT;
        const dx = ax - bx, dy = ay - by, L2 = dx * dx + dy * dy;
        let t = L2 ? ((px - bx) * dx + (py - by) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(px - (bx + t * dx), py - (by + t * dy)); if (d < best) best = d;
      }
    }
  }
  return best;
}
function crMapTap(e) {
  if (!creating || crStage !== 'pick' || !map) return;
  if (crSectorStreet) { crSectorTap(e.lngLat); return; } // Beta 1.127: while trimming, a map tap speaks only to the street being trimmed - it can neither add nor remove another street
  // Beta 1.119: query a small BOX around the tap, not the tap's single pixel.
  // Rendered road lines are a few px wide and a fingertip lands +/-10-20 px
  // off them, so the 1.118 point query almost never held a road and every
  // real tap toasted "No road there" (Andrew, on device). The tile
  // geometry's ONLY job here is to choose WHICH named street the tap meant
  // (the line passing closest to the tap wins); it is never stored - the
  // street's stored shape still comes from the accurate source - the
  // prepared Overpass extract (identity from the tile name, shape from
  // the extract - the approved reconciliation; display tiles re-segment
  // streets and misplace joins).
  const roadFeats = (half) => {
    let feats = [];
    try { feats = map.queryRenderedFeatures([[e.point.x - half, e.point.y - half], [e.point.x + half, e.point.y + half]]) || []; } catch (err) {}
    return feats.filter(x => x && x.sourceLayer === 'roads' && x.properties && typeof x.properties.name === 'string' && !!x.properties.name);
  };
  let pick = null;
  for (const half of [16, 28]) { // a finger's real tolerance first; one wider retry before giving up
    const named = roadFeats(half);
    if (!named.length) continue;
    let pickD = Infinity;
    for (const f of named) { const d = crFeatDistM(e.lngLat, f.geometry); if (d < pickD) { pickD = d; pick = f.properties.name; } }
    if (!pick) pick = named[0].properties.name; // a named road whose tile line is unusable still names the street - the name is the identity
    break; // the first box that names any road decides
  }
  if (!pick) { toast('No road there — tap right on a road line', 2400); return; }
  pickStreet(pick, e.lngLat);
}
onMapReady(() => map.on('click', crMapTap));
$('crDoneBtn').addEventListener('click', () => { if (draftStreets().length) setCreateStage('preview'); }); // "Done" (Beta 1.128: the panel footer's ONLY button - the 1.127 "+ Add a street" ghost is gone; it never added anything, it only tucked the panel, and tucking belongs to the head's grab/tap gesture)
$('crReviewBtn').addEventListener('click', () => crExpandPanel()); // the bar's way back (mockup screen 4)
$('crClearAll').addEventListener('click', () => { // Andrew's addition (2026-11-06): empty the picks at once - behind the shared confirm, the same discipline as Start over and route deletion; the city and the session stay
  const n = draft ? draftStreets().length : 0; if (!n) return;
  crConfirm('Clear all ' + n + (n === 1 ? ' road?' : ' roads?'), 'Every road you picked will be taken off this route. The city stays loaded.', () => {
    draft.roads = {}; draft.mains.clear(); draft.osmNames = {}; draft.sectors = {}; draft.parts = {};
    crSectorStreet = null; crSectorSnapshot = undefined;
    renderDraft(); renderCrLists(); crRenderHint();
  }, { yes: 'Clear all', no: 'Cancel', danger: true });
});
$('crSbWhole').addEventListener('click', () => { const s = crSectorStreet; if (!s) return; const rec = crStreetParts(s); if (rec) crSetChosen(s, rec, new Set(rec.parts.map((_, i) => i))); renderDraft(); renderCrLists(); renderSectorBar(); }); // Entire road: every sector back on (the pick is stored as no entry again)
$('crSbDone').addEventListener('click', () => crCloseSectors()); // Done: back to the panel
$('crSbCancel').addEventListener('click', () => crCancelSectors()); // Cancel (Beta 1.129): restore the pick as it was when sector mode was entered, and leave
(() => { // the panel's tuck-away gesture (mockup screens 3-4): drag or flick the grab handle / header downward to collapse; a plain tap there collapses too. Buttons inside the header keep their own taps (the check below), and the rows below scroll natively - drags never start there
  const sheet = $('createSheet'), head = $('crPanelHead'); if (!sheet || !head) return; // Beta 1.129: the drag moves the SURFACE (the one card), not a face inside it
  let pid = null, startY = 0, lastY = 0, samples = [], moved = false;
  head.addEventListener('pointerdown', e => {
    if (pid !== null || e.target.closest('button')) return;
    pid = e.pointerId; startY = lastY = e.clientY; samples = [{ t: performance.now(), y: e.clientY }]; moved = false;
    cancelSheetSpring(sheet); crSettleMorph(); // a grab mid-settle takes the surface over from its live position (and lands any face morph in flight)
  });
  head.addEventListener('pointermove', e => {
    if (pid === null || e.pointerId !== pid) return;
    lastY = e.clientY;
    samples.push({ t: performance.now(), y: e.clientY }); if (samples.length > 8) samples.shift();
    const dy = lastY - startY;
    if (Math.abs(dy) > 4) { if (!moved) { moved = true; try { head.setPointerCapture(pid); } catch (err) {} } }
    if (moved && dy > 0) { sheet.style.transform = 'translateY(' + dy + 'px)'; e.preventDefault(); }
  });
  const up = e => {
    if (pid === null || (e && e.pointerId !== pid)) return;
    pid = null;
    if (!moved) { crCollapsePanel(0, 0); return; } // a tap on the handle/header tucks the panel away
    const dy = Math.max(0, lastY - startY);
    const now = performance.now(); const s0 = samples.find(s => now - s.t <= 130) || samples[0];
    const dt = now - s0.t; const vy = dt >= 30 ? (lastY - s0.y) / dt : 0; // px/ms, positive = downward (the sheets' release-velocity rule)
    if (dy > 70 || vy > 0.45) crCollapsePanel(dy, vy * 1000);
    else springSheet(sheet, dy, 0, vy * 1000, q => { sheet.style.transform = 'translateY(' + q + 'px)'; }, () => { sheet.style.transform = ''; });
  };
  head.addEventListener('pointerup', up);
  head.addEventListener('pointercancel', up);
})();
$('pvAddBtn').addEventListener('click', () => { // back to picking for more streets; Done there returns to this same preview (Beta 1.128: the panel button never changes its label, so no return-mode state is needed)
  if (crCity) { setCreateStage('pick'); return; }
  if (draft && draft.area) { crCity = { name: draft.area, lat: null, lon: null, bbox: null }; setCreateStage('pick'); return; } // Beta 1.121: a draft that already names its city (the photo door) pre-answers the city step - still changeable from the pick sheet's city chip
  crOpenCityPane('preview');
});

// ---- name it + save (Beta 1.128: the step STAYS its own - a draft of
// this build folded naming into the preview and Andrew vetoed it the
// same evening; the preview's button is labelled "Save route" and
// advances here, and this pane's "Save route" remains the only save) ----
$('pvSaveBtn').addEventListener('click', openNameIt);
function openNameIt() {
  if (!draft || !draftStreets().length) return;
  $('crNameInput').value = draft.name || nextRouteNameGuess();
  $('crAreaInput').value = draft.area || crAreaGuess || lsGet(LS_GLOBAL.lastArea) || '';
  const g = crDraftGeom(); let tot = 0; for (const n of draftStreets()) tot += crStreetChosenM(n, g); // Beta 1.127: the summary bills what will actually save. Beta 1.135 (N3): the geometry comes through the shared cache like every other consumer
  $('crNameSummary').textContent = draftStreets().length + ' streets · ' + draft.mains.size + ' mains · ' + fmtLenM(tot) + ' of road';
  if (!routeLoaded) restoreBootChrome(); else openRouteMenu();
  showRmPane('rmNamePane');
}
$('crNameBack').addEventListener('click', () => { if (!routeLoaded) parkBootChrome(); else closeRouteMenu(); setCreateStage('preview'); });
$('crSaveBtn').addEventListener('click', saveDraftRoute);
function saveDraftRoute() {
  const name = $('crNameInput').value.trim();
  if (!name) { toast('Give the route a name first', 2600); return; }
  const area = $('crAreaInput').value.trim();
  const v = normalizePack({ name, area, mains: [...draft.mains], roads: crFilteredRoads(), reference: {} }, { tileNames: [...Object.values(draft.osmNames), ...(draft.tileNames || [])] }); // Beta 1.127: the SAVE stores chosen sectors only - the draft keeps the whole streets, the pack never sees the unchosen ends
  if (!v.ok) { toast('Could not save — ' + v.error, 4000); return; }
  const pack = v.pack; pack.id = uniqueRouteId(name);
  const rec = loadUserPacks(); rec[pack.id] = pack;
  if (!lsSet(USERPACKS_KEY, JSON.stringify(rec))) { toast('Storage problem — the route could not be saved', 4000); return; }
  ROUTE_PACKS.push(pack); // live in the runtime list at once - listed and switchable without a reload
  try { lsSet(routeKeys(pack.id).pre, JSON.stringify({ at: 0, saved: 0, total: preloadUrlList().length, routeSaved: 0, routeTotal: packTileUrls(pack).size })); } catch (e) {} // F5: the new route starts with an honest preload record - none of its area is downloaded yet; Status offers the (grown) union download
  if (area) lsSet(LS_GLOBAL.lastArea, area);
  const wasBoot = !routeLoaded, newId = pack.id;
  exitCreate();
  toast('Route saved — its maps are not downloaded yet; get them in Settings → Status → Download', 4600);
  if (wasBoot) { restoreBootChrome(); if (window.__bootPickRoute) window.__bootPickRoute(newId); }
  else { openRouteMenu(); showRmPane('rmListPane'); }
}

(() => {
  const sp = $('splash'); if (!sp) return;
  const t0 = Date.now(); let gone = false;
  const finish = () => { if (gone) return; gone = true; clearInterval(iv); sp.remove(); document.documentElement.classList.remove('boot'); /* Beta 1.85: the splash is gone - the root frame returns to the app's own colour (the html.boot rule) */ const rm = $('routeMenu'); if (rm) { rm.classList.add('notrans'); rm.classList.remove('boot', 'show', 'bye'); void rm.offsetWidth; rm.classList.remove('notrans'); } }; // Beta 1.78: park the menu below the screen without animating the swap
  const arm = () => { const wait = Math.max(0, 1900 - (Date.now() - t0)); setTimeout(() => { crWarmCityLibrary(); /* Beta 1.130: Andrew's own suggestion, adjudicated to the catalogue ONLY - the packs/index.json download fires in this deferred boot slot (the menu-arming moment: first tiles are in or the 6 s escape has passed, the 1900 ms splash floor has run, so it never competes with first paint), and a cold open has the catalogue in hand before Create is ever opened. The city PACK FILES stay on-demand per city - 6.5 MB of gzip across the library is not boot work. The cached promise keeps it to one fetch per session; the gate/menu warm calls remain as no-op re-triggers */ if (!gone) { sp.classList.add('menu'); $('routeMenu').classList.add('show'); document.documentElement.classList.remove('boot'); /* Beta 1.86: the boot state also ends HERE, when the menu arms - the still-to-live handover window (the unsettled first frames the chrome-absence protects) is long past by the gate's 1900ms minimum, and the opaque menu covers the chrome while it paints beneath. Every later state (a post-reload session at the menu, the pick, a direct load) must find a functional shell; the pick/loadRoute/finish removals stay as backstops */ } }, wait); };
  const iv = setInterval(() => {
    if (!map && Date.now() - t0 > 4000) __bootTail();
    if ((typeof glOk !== 'undefined' && glOk && typeof tilesOk !== 'undefined' && tilesOk > 0) || Date.now() - t0 > 6000) { clearInterval(iv); arm(); }
  }, 120);
  window.__bootPickRoute = id => { loadRoute(id); document.documentElement.classList.remove('boot'); /* Beta 1.86: the boot state flips FIRST, while both blue layers are still opaque - the finished app (chrome included) paints beneath them, and the fade below reveals it whole, instead of the chrome popping in after the blue is gone (the 1.67 weirdness Andrew flagged) */ let faded = false; const fade = () => { if (faded) return; faded = true; sp.classList.add('go'); $('routeMenu').classList.add('bye'); setTimeout(finish, 780); }; requestAnimationFrame(fade); setTimeout(fade, 150); }; // the boot-mode row pick (app2 wires the rows and the pane buttons): load the route, flip the boot state, fade both blue layers, then finish() removes the splash and parks the menu
})();
