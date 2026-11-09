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
mergeUserPacks();
if (parseJ(lsGet(LS.pre), null)) migratePack(); // Beta 1.143 (DA-07): the pack migration starts HERE - after mergeUserPacks has registered the created packs, so the manifest migratePack captures from preloadUrlList() is the union over shipped + created packs (through 1.142 this fired during app4's evaluation, before this part ran; see the note there). Fire-and-forget, exactly as before: it never blocks the boot, and because the flag is earned, an incomplete migration simply runs again next boot
function uniqueRouteId(name) { // a slug from the name, uniqueness-checked against shipped + created ids
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'route';
  let id = base, i = 2;
  while (ROUTE_PACKS.some(p => p.id === id)) { id = base + '-' + i; i++; }
  return id;
}
function nextRouteNameGuess() { let mx = 1; for (const p of ROUTE_PACKS) { const m = /^Route (\d+)$/.exec(p.name || ''); if (m) mx = Math.max(mx, +m[1] + 1); } return 'Route ' + Math.max(mx, ROUTE_PACKS.length + 1); }

