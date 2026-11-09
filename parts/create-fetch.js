// ---- draft state: session only (not a route, not in any slot) ----
let creating = false, crStage = 'pick', crBootParked = false, crAreaGuess = '', crPhoto = null, crPickBusy = false; // Beta 1.128: crReturnToPreview is GONE - it existed only to rewrite the panel's Done label on the return-from-preview errand, and the label no longer rewrites (Andrew: the button reads "Done", always)
let draft = null; // { roads, mains: Set, osmNames, tileNames: [..], name, area, sectors, parts } - EVERY street key is the FULL map name (Beta 1.144, DA-04; osmNames maps a key to itself for tapped streets and stays empty for imported ones, whose pack keys are their own); sectors: {name: [chosen part indexes]} (Beta 1.127 - an ABSENT entry means the whole road), parts: {name: crStreetParts record} (session cache)
function newDraft() { return { roads: {}, mains: new Set(), osmNames: {}, tileNames: [], name: '', area: '', sectors: {}, parts: {} }; }
let crSectorStreet = null; // Beta 1.127: the street whose sectors are being trimmed (sector mode), or null
let crSectorSnapshot = undefined; // Beta 1.129: the street's sector pick as it stood when sector mode was ENTERED (null = the whole road; an array = the trim then in force) - the sector bar's Cancel restores exactly this. undefined = no sector session in flight
function crSectorReset() { crSectorStreet = null; crSectorSnapshot = undefined; } // Beta 1.136 (programme F): a sector session's teardown in ONE place - through 1.135 the pair (street cleared, Cancel snapshot dropped) was written out at six sites (street removal, sector close, stage change, creation start, creation exit, draft start-over); every one of them now calls this, so a seventh field in the session state would have exactly one home to join
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
let crGrid = null; // { name, bbox, cells: [{ key, box, state, tries }], gen, session, startedAt, ticker, ops: Set, active, fromCache, savedAt, stopped, lastFail } while a CITY grid preparation exists (kept after it settles, for progress/resume state)
let crPrepState = 'none'; // 'none' | 'preparing' | 'ready' | 'degraded' | 'failed'  ('degraded': a city grid settled with parts missing - what loaded is usable, the rest is resumable)
let crPrepFail = null; // { kind: 'unreachable' | 'error' | 'dense' | 'badjson', status?, remark? }
let crFailFromGrid = false; // which preparation produced crPrepFail - the Retry button resumes a failed GRID's missing cells but re-runs a failed fallback BOX at its anchor; the two must never be confused when both exist
let crPrepAnchor = null; // where Retry / a not-ready tap re-prepares
let crPending = {}; // full map name -> { osmName, lngLat }: streets whose full shape reaches beyond verified coverage (fail-closed) - listed as pending, NEVER added half-known
let crToppedUp = {}; // '<full name>@<gen>' -> true: a street's ONE top-up per coverage generation is spent
let crCityReturn = 'doors'; // where the city pane's Back lands
function crBoxAround(lat, lng, halfKm) { const dLat = halfKm * 1000 / MLAT, dLng = halfKm * 1000 / MLNG; return { s: +(lat - dLat).toFixed(6), n: +(lat + dLat).toFixed(6), w: +(lng - dLng).toFixed(6), e: +(lng + dLng).toFixed(6) }; }
function crInBox(box, lat, lng) { return !!box && lat >= box.s && lat <= box.n && lng >= box.w && lng <= box.e; }
function crInAnyBox(boxes, lat, lng) { for (const b of boxes || []) { if (crInBox(b, lat, lng)) return true; } return false; } // verified coverage is a SET of boxes (city cells + fallback boxes) - an endpoint is verified when it lies inside ANY of them
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
  // crCityPrepare when the picked city matches the pack
  // library), the pack answers the same call shape and the live Overpass
  // service becomes the fallback. The grid, the fallback box prep, the
  // top-up and everything downstream consume the identical result shape
  // either way.
  const pk = await crPackServe(box, name, sessionOk);
  if (pk) return pk;
  const ql = name ? crNameQL(name, box, Math.ceil(budgetMs / 1000)) : crAreaQL(box, Math.ceil(budgetMs / 1000));
  return crOverpassFetch(ql, budgetMs, attempt1Ms, sessionOk, op);
}
