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
function crCleanPts(rawPts) { // Beta 1.150 (security-audit fix round): THE point cleaning for a stored [lat, lon] pair list, mirroring crIndexWays' rules (1e7 rounding, a point is kept only when it sits more than 0.1 m past the last kept one, at least 2 points must survive) plus the finiteness/range condition crResolve demands of every point it reads. A point that is not a finite in-range pair is skipped; the way survives on its remaining points or not at all
  if (!Array.isArray(rawPts)) return null;
  const pts = [];
  for (const gp of rawPts) {
    if (!Array.isArray(gp) || gp.length < 2 || !isFinite(gp[0]) || !isFinite(gp[1]) || gp[0] < -90 || gp[0] > 90 || gp[1] < -180 || gp[1] > 180) continue;
    const p = [Math.round(gp[0] * 1e7) / 1e7, Math.round(gp[1] * 1e7) / 1e7];
    if (!pts.length || distM(pts[pts.length - 1], p) > 0.1) pts.push(p);
  }
  return pts.length > 1 ? pts : null;
}
function crCleanStoredWay(entry) { // Beta 1.150: a city-cache record's stored triple [id, name, pts] earns installation only by passing the extract's own cleaning - a usable id, a non-empty string name, and geometry that cleans to at least 2 points. Anything else returns null and the way is dropped whole (the cache fold in create-cache.js is the caller)
  if (!Array.isArray(entry) || entry.length < 3) return null;
  if (entry[0] == null || typeof entry[1] !== 'string' || !entry[1]) return null;
  const pts = crCleanPts(entry[2]);
  return pts ? { id: entry[0], name: entry[1], pts } : null;
}
function crCovFromWays(byId, boxes) { // the coverage record: the extract's ways indexed by street name (ids kept in byId - grid cells and top-ups merge into the SAME index, deduped by way id), plus the SET of verified boxes completeness is judged against
  const byName = Object.create(null); // Beta 1.150 (security-audit fix round, finding covfromways-prototype-name-throw): street names are external data - on a plain object, a street named 'constructor' reads Object.prototype's member as if a run existed and the push below threw, and '__proto__' would write the prototype instead of an entry. A null-prototype index makes every name an own property
  for (const id of Object.keys(byId)) {
    const w = byId[id];
    (byName[w.name] = byName[w.name] || []).push(w);
  }
  return { gen: crCovGen, byName, byId, boxes: (boxes || []).slice(), fetchedAt: Date.now() };
}
function crCovEnsure() { if (!crCov) crCov = crCovFromWays(Object.create(null), []); return crCov; } // Beta 1.150: the coverage byId starts life null-prototype (as crCovFromWays' byName now does) - the cache fold writes stored way ids into it, and an id of '__proto__' must land as an entry, never as the index's prototype. Every coverage birth site (here, crCityPrepare) passes Object.create(null) for the same reason
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
function crPrepCurrent(gen, session) { return creating && crSession === session && crCovGen === gen && crPrepState === 'preparing'; } // Beta 1.154 (B3 build, G3 option (i)): the prep family's current-check under the one convention - cr<Family>Current(<the family's own invalidation inputs>), answering "may this landing still write?" (the convention is stated at crSearchCurrent in create-pick.js); this family's true inputs are (gen, session)
function crStartPrep(anchor) { // the FALLBACK preparation (second amendment, item D): one bounded box around an anchor, session-only - for places with no picked/saved city, and for anchors outside the city's coverage. The whole-city path is crCityPrepare below.
  if (!creating || !anchor || !isFinite(anchor.lat) || !isFinite(anchor.lng)) return;
  if (crCov && crInAnyBox(crCov.boxes, anchor.lat, anchor.lng) && crPrepState !== 'preparing') { crRenderHint(); return; } // verified coverage already includes this anchor - reuse it, no second download (CG-PF-04)
  if (crPrep && crPrepState === 'preparing' && crInBox(crBoxAround(crPrep.anchor.lat, crPrep.anchor.lng, CR_INNER_KM), anchor.lat, anchor.lng)) return; // the same preparation is already in flight - dedupe
  if (crPrep) crAbortOp(crPrep.op); // a superseding preparation stops the old download outright (CG-PF-10)
  if (crGrid) crGridStop('superseded'); // CG-PF-13: a fallback starting over a live grid must STOP the grid first - the generation bump below would otherwise orphan its in-flight cells in 'fetching' (their answers settle into the dead generation, their handlers discard them, and Resume - which only resets 'failed' cells - could never reschedule them, wedging the city mid-load forever). crGridStop aborts the grid's downloads and returns those cells to 'pending', so the city stays resumable; on a settled grid it changes nothing but the stopped marker, which crGridSettledState already reads correctly
  const session = crSession, gen = ++crCovGen;
  const outer = crBoxAround(anchor.lat, anchor.lng, CR_INNER_KM + CR_BUFFER_KM);
  crSetPrepState('preparing'); crPrepFail = null; crFailFromGrid = false; crPrepAnchor = anchor; crWanted = null; // starting a preparation IS the answer to any outstanding offer
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
      crSetPrepState(crGrid ? crGridSettledState() : 'ready'); // a fallback box landing does not pretend a part-missing city is whole: the settled state comes from the grid's own judge - CG-PF-14: the pending count alone promoted a city with a FAILED cell (nothing pending, one part refused) to plain 'ready', dropping the missing-parts disclosure and its Retry. Beta 1.154 (B3 build): the copy of crGridFinish's failed-handling that stood on the next line through 1.153 is DELETED as dead code - crStartPrep stops the grid first (CG-PF-13), so the grid's stopped marker reads 'superseded' at this landing and crGridSettledState's stopped branch answers 'degraded' before its done===0 test can ever say 'failed'; the 2026-11-09 lifecycle trace observed this landing as ready/degraded only, with crPrepFail null throughout (TRACE-RECORD G1). The live copy is crGridFinish's, at the grid's own finish, where stopped is null and 'failed' IS reachable
      crSweepPending();
    } else { crSetPrepState('failed'); crPrepFail = res; }
    crRenderHint();
  });
}
function crCancelPrep() { // stops the wait AND the downloads (CG-PF-10), keeps the draft, the city and every cell already loaded; the generation bump makes any late answer land nowhere
  if (crPrep) { clearInterval(crPrep.ticker); crAbortOp(crPrep.op); crPrep = null; }
  if (crGrid) crGridStop('cancelled');
  crCovGen++;
  crPrepFail = null;
  crSetPrepState(crGrid ? crGridSettledState() : (crCov && crCov.boxes.length ? 'ready' : 'none'));
  crRenderHint();
}
function crSweepPending() { // a fresh extract may complete streets that were pending on a narrower one
  if (!crCov || (crPrepState !== 'ready' && crPrepState !== 'degraded')) return;
  for (const pk of Object.keys(crPending)) {
    const p = crPending[pk]; if (!p) continue;
    const res = crResolve(p.osmName, p.lngLat);
    if (res.status === 'ok') { if (draft && draft.roads[pk]) { delete crPending[pk]; crAddRun(pk, res.segs); } else crAddStreet(pk, res.segs); } // Beta 1.144 (OPT-L1): a swept street that meanwhile entered the draft gains the resolved shape as a further run of the same entry, never an overwrite
  }
}
