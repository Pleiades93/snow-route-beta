// ---- city packs ---- a pack in the catalogue lights its city up in the chooser with no app change
let crPackCtx = null; // { slug, bbox, failed } while the active city's preparation is pack-backed; null = the service is the source
let crPackNote = ''; // the disclosed pack state ('' = nothing to say); rides the hint like crCacheNote
let crPackIndexP = null; // the session's catalogue promise (null result cached too: no library this session)
let crPackIndexKnown = false; // the catalogue answered: an unlisted city is the live service's dataset ('overpass'); an unanswered catalogue states no identity
let crPackLoads = Object.create(null); // slug -> Promise<elements>: the session's downloaded packs, adapted once
const crPackCtls = Object.create(null); // slug -> the current download attempt's AbortController, owned by the load: dropping the load can abort the attempt itself
function crPackAbort(slug) { const c = crPackCtls[slug]; if (c) { delete crPackCtls[slug]; try { c.abort(); } catch (e) {} } }
function crPackSlugOk(s) { return typeof s === 'string' && /^[a-z0-9][a-z0-9_-]*$/i.test(s) && s.toLowerCase() !== 'index'; }
function crPackIndexLoad() {
  if (!crPackIndexP) {
    crPackIndexP = (async () => {
      try {
        const r = await fetch('packs/index.json', { cache: 'no-cache' });
        if (!r.ok) return null;
        const ix = await r.json();
        const cities = (ix && Array.isArray(ix.cities) && ix.cities.length) ? ix.cities : null;
        if (cities) crPackIndexKnown = true;
        return cities;
      } catch (e) { return null; }
    })();
  }
  return crPackIndexP;
}
function crWarmCityLibrary() { crPackIndexLoad(); } // the catalogue downloads from BOOT: a cold-open chooser tap otherwise waits the whole fetch before the list paints
async function crPackResolveCity(name, bbox) { // the pack's box must contain the grid box (less would certify coverage never downloaded); a slow catalogue cannot wedge preparation
  if (!name || !bbox) return null;
  const entries = await Promise.race([crPackIndexLoad(), new Promise(res => setTimeout(() => res(null), 8000))]);
  if (!entries) return null;
  const e = entries.find(x => x && typeof x.name === 'string' && crPackSlugOk(x.slug) && x.name.toLowerCase() === String(name).toLowerCase() && Array.isArray(x.bbox) && x.bbox.length === 4);
  if (!e) return null;
  const pb = { s: +e.bbox[0], w: +e.bbox[1], n: +e.bbox[2], e: +e.bbox[3] };
  if (![pb.s, pb.w, pb.n, pb.e].every(isFinite)) return null;
  const EPS = 1e-6;
  if (!(pb.s <= bbox.s + EPS && pb.n >= bbox.n - EPS && pb.w <= bbox.w + EPS && pb.e >= bbox.e - EPS)) return null;
  return { slug: e.slug, bbox: pb, gen: typeof e.generatedAt === 'string' ? e.generatedAt : '' }; // the catalogue's generatedAt is the pack's stamp: republishing re-stamps it, and the dataset identity binds saved records to it
}
async function crPackDownload(slug) { // one attempt: silence past packFirstByteMs, then packStallMs between bytes, aborts it with a tagged error the retry reads
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  if (ctl) crPackCtls[slug] = ctl; // the load owns this attempt's controller until it settles or the load is dropped (crPackAbort)
  let stallTo = null, sawByte = false, killed = false;
  const armStall = () => { if (!ctl) return; if (stallTo) clearTimeout(stallTo); stallTo = setTimeout(() => { killed = true; try { ctl.abort(); } catch (e) {} }, sawByte ? CR_TIMING.packStallMs : CR_TIMING.packFirstByteMs); };
  const clearStall = () => { if (stallTo) clearTimeout(stallTo); };
  armStall();
  try {
    const r = await fetch('packs/' + slug + '.json', { cache: 'no-cache', signal: ctl ? ctl.signal : undefined });
    if (!r.ok) { clearStall(); throw new Error('pack HTTP ' + r.status); }
    const read = await crReadBodyText(r, () => { // consumption is crReadBodyText's (create-fetch.js); the policies stay here: the hook records a byte, re-arms the silence clock
      sawByte = true;
      armStall(); // a landed chunk is progress: the silence clock restarts here, on the flowing window once the first byte has landed
      return null;
    });
    const text = read.fallback ? await r.text() : read.text; // no reader: the first-byte window bounds the whole read (no mid-body visibility exists)
    clearStall();
    const pack = JSON.parse(text); // a SyntaxError propagates untagged, exactly as r.json()'s did through 1.248
    if (!pack || !pack.streets || typeof pack.streets !== 'object') throw new Error('pack shape');
    return pack;
  } catch (e) {
    clearStall();
    if (killed) { const err = new Error('pack stall'); err.packStall = true; throw err; }
    throw e;
  } finally { if (ctl && crPackCtls[slug] === ctl) delete crPackCtls[slug]; } // a settled attempt unregisters itself; an aborted one was already unregistered by crPackAbort
}
function crPackLoad(slug, force) { // adapted into the extract shape; ids are negative (OSM ids are positive); a failed load is not cached
  if (!crPackSlugOk(slug)) return Promise.reject(new Error('pack slug'));
  if (!force && crPackLoads[slug]) return crPackLoads[slug];
  const t0 = Date.now();
  const p = (async () => {
    for (;;) {
      let pack;
      try { pack = await crPackDownload(slug); } catch (e) {
        // a silence kill retries here, invisible to callers; it stands down when the promise is dropped, or past stallMs
        if (e && e.packStall && crPackLoads[slug] === p && Date.now() - t0 < CR_TIMING.stallMs) continue;
        throw e;
      }
      const els = [];
      let idc = 0;
      for (const nm of Object.keys(pack.streets)) {
        const segs = pack.streets[nm];
        if (!Array.isArray(segs)) continue;
        for (const seg of segs) { if (Array.isArray(seg) && seg.length > 1) els.push({ type: 'way', id: -(++idc), tags: { name: nm }, geometry: seg.map(pt => ({ lat: pt[0], lon: pt[1] })) }); }
      }
      if (!els.length) throw new Error('pack empty');
      return els;
    }
  })();
  crPackLoads[slug] = p;
  p.catch(() => { if (crPackLoads[slug] === p) delete crPackLoads[slug]; });
  return p;
}
async function crPackServe(box, name, sessionOk) { // a way belongs when any of its points lies in the box, geometry returned whole; null when no pack applies
  const ctx = crPackCtx;
  if (!ctx || ctx.failed) return null;
  const EPS = 2e-6; // grid edges round to 6 decimals (~5 cm out): the grid's own rounding, not a coverage gap
  if (!(box.s >= ctx.bbox.s - EPS && box.n <= ctx.bbox.n + EPS && box.w >= ctx.bbox.w - EPS && box.e <= ctx.bbox.e + EPS)) return null; // outside the pack's coverage the service answers (its extract is the honest one there)
  let els = null;
  try { els = await crPackLoad(ctx.slug); } catch (e) { els = null; }
  if (sessionOk && !sessionOk()) return { ok: false, kind: 'stale' }; // superseded while the pack downloaded: land nowhere (CG-PF-05)
  if (!els) {
    ctx.failed = true;
    if (!crPackNote) { crPackNote = 'The app’s street library didn’t load - loading from the street service instead'; crRenderHint(); }
    return null;
  }
  const t0 = Date.now();
  const out = [];
  for (const el of els) { if (name && el.tags.name !== name) continue; if (el.geometry.some(g => g.lat >= box.s && g.lat <= box.n && g.lon >= box.w && g.lon <= box.e)) out.push(el); }
  return { ok: true, json: { elements: out }, ms: Date.now() - t0 };
}
// the point normalisation for both cleaners: 1e7 rounding; a point survives only past 0.1 m from the last kept
function crCleanPtPush(pts, lat, lon) { const p = [Math.round(lat * 1e7) / 1e7, Math.round(lon * 1e7) / 1e7]; if (!pts.length || distM(pts[pts.length - 1], p) > 0.1) pts.push(p); }
function crIndexWays(elements, byId) { // Overpass elements -> byId { id: { name, pts } }, cleaned by crCleanPtPush (1e7 rounding, sub-0.1 m duplicates dropped)
  for (const el of elements || []) {
    if (!el || el.type !== 'way' || el.id == null || !el.tags || typeof el.tags.name !== 'string' || !el.tags.name) continue;
    if (!Array.isArray(el.geometry) || el.geometry.length < 2) continue;
    const pts = [];
    for (const g of el.geometry) crCleanPtPush(pts, g.lat, g.lon);
    if (pts.length > 1) byId[el.id] = { name: el.tags.name, pts };
  }
  return byId;
}
function crCleanPts(rawPts) { // stored pairs clean through crCleanPtPush, plus the finiteness/range condition crResolve demands of every point it reads
  if (!Array.isArray(rawPts)) return null;
  const pts = [];
  for (const gp of rawPts) {
    if (!Array.isArray(gp) || gp.length < 2 || !isFinite(gp[0]) || !isFinite(gp[1]) || gp[0] < -90 || gp[0] > 90 || gp[1] < -180 || gp[1] > 180) continue;
    crCleanPtPush(pts, gp[0], gp[1]);
  }
  return pts.length > 1 ? pts : null;
}
function crCleanStoredWay(entry) { // a triple installs only by passing the extract's cleaning (usable id, non-empty name, 2+ cleaned points); else dropped whole
  if (!Array.isArray(entry) || entry.length < 3) return null;
  if (entry[0] == null || typeof entry[1] !== 'string' || !entry[1]) return null;
  const pts = crCleanPts(entry[2]);
  return pts ? { id: entry[0], name: entry[1], pts } : null;
}
function crCovFromWays(byId, boxes) { // the record: ways by name, ids in byId (cells and top-ups merge into one index), plus the verified boxes
  const byName = Object.create(null); // street names are external data: a null-prototype index keeps 'constructor'/'__proto__' as own properties, never the prototype
  for (const id of Object.keys(byId)) {
    const w = byId[id];
    (byName[w.name] = byName[w.name] || []).push(w);
  }
  return { gen: crCovGen, byName, byId, boxes: (boxes || []).slice(), fetchedAt: Date.now() };
}
function crCovEnsure() { if (!crCov) crCov = crCovFromWays(Object.create(null), []); return crCov; } // byId starts null-prototype too: a stored '__proto__' id must land as an entry, never the prototype
function crCovFold(byId, box) { const cov = crCovEnsure(); for (const id of Object.keys(byId)) cov.byId[id] = byId[id]; if (box && !cov.boxes.some(b => b.s === box.s && b.w === box.w && b.n === box.n && b.e === box.e)) cov.boxes.push(box); return cov; } // Architecture #17: the coverage record's FOLD - already-validated ways and one answered box land on the record, and nothing else happens: no reindex, no search refresh. The cache restore folds per restored cell through here (through 1.280 it wrote crCov.byId and crCov.boxes directly from create-cache.js); the once-only reindex + refresh after its loop stays the caller's discipline (Beta 1.254, A-02)
function crCovReindex() { const cov = crCovEnsure(); cov.byName = crCovFromWays(cov.byId, cov.boxes).byName; return cov; } // the byName rebuild: the name index is a pure function of byId, rebuilt when coverage settles, never per cell
function crCovMerge(elements, box) { // fold one answered extract into the coverage: ways dedupe by id, the answered box joins the verified set
  const cov = crCovEnsure();
  crIndexWays(elements, cov.byId);
  crCovReindex();
  if (box && !cov.boxes.some(b => b.s === box.s && b.w === box.w && b.n === box.n && b.e === box.e)) cov.boxes.push(box);
  cov.fetchedAt = Date.now();
  crRefreshSearch(); // a merge changes coverage: an open search re-runs against the fuller extract here, not its earlier answer
  return cov;
}
function crClipLineToBox(line, box) { // the sub-lines of a stitched line inside a box, cut at the boundary; pieces record cut-made ends (startCut/endCut)
  const pieces = [];
  let cur = null;
  const close = () => { if (cur && cur.line.length > 1) pieces.push(cur); cur = null; };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    let t0 = 0, t1 = 1, miss = false;
    const dx = b[1] - a[1], dy = b[0] - a[0];
    const P = [-dx, dx, -dy, dy], Q = [a[1] - box.w, box.e - a[1], a[0] - box.s, box.n - a[0]];
    for (let k = 0; k < 4; k++) {
      if (Math.abs(P[k]) < 1e-12) { if (Q[k] < 0) { miss = true; break; } }
      else { const r = Q[k] / P[k]; if (P[k] < 0) { if (r > t0) t0 = r; } else if (r < t1) t1 = r; if (t0 > t1) { miss = true; break; } }
    }
    if (miss) { close(); continue; }
    const A = t0 === 0 ? a : [a[0] + dy * t0, a[1] + dx * t0];
    const B = t1 === 1 ? b : [a[0] + dy * t1, a[1] + dx * t1];
    if (!cur) cur = { line: [A], startCut: t0 > 0, endCut: false };
    const last = cur.line[cur.line.length - 1];
    if (last[0] !== A[0] || last[1] !== A[1]) cur.line.push(A);
    if (B[0] !== A[0] || B[1] !== A[1]) cur.line.push(B);
    cur.endCut = t1 < 1;
    if (t1 < 1) close();
  }
  close();
  return pieces;
}
function crResolve(osmName, lngLat, boundary) { // a run end is closed only inside verified coverage (a continuation would have been returned); outside, the run is unproven
  const cov = crCov; if (!cov) return { status: 'nocov' };
  const ways = cov.byName[osmName];
  if (!ways || !ways.length) return { status: 'absent' };
  const runs = chainWays(ways.map(w => w.pts));
  let best = null, bestD = Infinity;
  for (const run of runs) for (const p of run.line) { const d = distM(p, [lngLat.lat, lngLat.lng]); if (d < bestD) { bestD = d; best = run; } }
  if (!best) return { status: 'absent' };
  // city clip: runs are cut at the boundary; a cut end is complete by definition, an original end is not
  if (!boundary && crCity && crCity.bbox && crInBox(crCity.bbox, lngLat.lat, lngLat.lng) && best.line.some(p => !crInBox(crCity.bbox, p[0], p[1]))) {
    const pieces = crClipLineToBox(best.line, crCity.bbox);
    // pieces are chosen by segment distance, not vertices: another piece's vertex can sit nearer the tap
    let piece = null, pieceD = Infinity;
    for (const pc of pieces) { let d = Infinity; for (let i = 1; i < pc.line.length; i++) { const sd = crSegProjM([lngLat.lat, lngLat.lng], pc.line[i - 1], pc.line[i]).d; if (sd < d) d = sd; } if (d < pieceD) { pieceD = d; piece = pc; } }
    if (piece) {
      let unproven = false;
      for (const end of [{ pt: piece.line[0], cut: piece.startCut }, { pt: piece.line[piece.line.length - 1], cut: piece.endCut }]) {
        if (!end.cut && !crInAnyBox(cov.boxes, end.pt[0], end.pt[1])) { unproven = true; break; }
      }
      if (!unproven) return { status: 'ok', segs: [piece.line] };
    }
  }
  for (const end of [best.line[0], best.line[best.line.length - 1]]) {
    const closed = boundary ? crInBox(boundary, end[0], end[1]) : crInAnyBox(cov.boxes, end[0], end[1]);
    if (!closed) return { status: 'edge', run: best };
  }
  return { status: 'ok', segs: best.exact ? best.segments.slice().sort((a, b) => crLineLen(b) - crLineLen(a)) : [best.line] };
}
// the prep family's current-check under the one convention (at crSearchCurrent, create-pick.js); this family's true inputs are (gen, session)
function crPrepCurrent(gen, session) { return creating && crSession === session && crCovGen === gen && crPrepState === 'preparing'; }
function crPrepWatchdog(prep, gen, session) { // the fallback's watchdog (the grid's mirror): past stallMs, force the failed landing, the wedged landing orphaned first
  if (!crPrepCurrent(gen, session) || crPrep !== prep) return;
  if (Date.now() - prep.startedAt < CR_TIMING.stallMs) return;
  clearInterval(prep.ticker);
  crCovGen++;
  crAbortOp(prep.op);
  crPrep = null;
  crSetPrepState('failed'); crPrepFail = { ok: false, kind: 'unreachable' };
  crRenderHint();
}
function crStartPrep(anchor) { // the fallback preparation: one bounded box around an anchor, session-only, for places with no picked or saved city
  if (!creating || !anchor || !isFinite(anchor.lat) || !isFinite(anchor.lng)) return;
  if (crCov && crInAnyBox(crCov.boxes, anchor.lat, anchor.lng) && crPrepState !== 'preparing') { crRenderHint(); return; } // verified coverage already includes this anchor - reuse it, no second download (CG-PF-04)
  if (crPrep && crPrepState === 'preparing' && crInBox(crBoxAround(crPrep.anchor.lat, crPrep.anchor.lng, CR_INNER_KM), anchor.lat, anchor.lng)) return; // the same preparation is already in flight - dedupe
  if (crPrep) crAbortOp(crPrep.op); // a superseding preparation stops the old download outright (CG-PF-10)
  if (crGrid) crGridStop('superseded'); // a fallback over a live grid stops the grid first: otherwise its cells orphan in 'fetching', unresumable forever
  const session = crSession, gen = ++crCovGen;
  const outer = crBoxAround(anchor.lat, anchor.lng, CR_INNER_KM + CR_BUFFER_KM);
  crPrepBegin(); crPrepAnchor = anchor; // starting a preparation IS the answer to an outstanding offer (it clears inside crPrepBegin); the anchor stays this site's own
  const prep = crPrep = { gen, session, anchor, startedAt: Date.now(), ticker: null, op: {} };
  crRenderHint();
  prep.ticker = setInterval(() => { crPrepWatchdog(prep, gen, session); if (crPrepCurrent(gen, session)) crRenderHint(); else clearInterval(prep.ticker); }, 1000); // every tick runs the progress watchdog before it renders
  crSourceExtract(outer, null, CR_TIMING.budgetMs, CR_TIMING.attempt1Ms, () => crPrepCurrent(gen, session), prep.op).then(res => {
    clearInterval(prep.ticker);
    if (!creating || crSession !== session || crCovGen !== gen) return; // obsolete: land NOWHERE - not the draft, not the hint, not a newer operation's state (CG-PF-05)
    if (crPrep === prep) crPrep = null;
    if (res.kind === 'stale') return; // superseded mid-flight; the newer operation owns the state
    if (res.ok) {
      crCovMerge(res.json.elements, outer);
      crSetPrepState(crGrid ? crGridSettledState() : 'ready'); // the settled state comes from the grid's judge: the pending count alone once hid a failed cell behind 'ready'
      crSweepPending();
    } else { crSetPrepState('failed'); crPrepFail = res; }
    crRenderHint();
  });
}
function crCancelPrep() { // stops the wait AND the downloads, keeps the draft, the city and every loaded cell; late answers land nowhere
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
    // a swept street that meanwhile entered the draft gains the resolved shape as a further run, never an overwrite
    if (res.status === 'ok') { if (draft && draft.roads[pk]) { delete crPending[pk]; crAddRun(pk, res.segs); } else crAddStreet(pk, res.segs); }
  }
}
