// ---- draft state: session only (not a route, not in any slot) ----
let creating = false, crStage = 'pick', crBootParked = false, crAreaGuess = '', crPickBusy = false; // crReturnToPreview is gone: it existed only to rewrite the Done label, and the label never rewrites now
/** @type {CrDraft|null} */
let draft = null; // every street key is the full map name; an absent sectors entry means the whole road
// the name-keyed maps are prototype-free: a tapped '__proto__' street must land as an own key
/** @returns {CrDraft} */
function newDraft() { return { roads: Object.create(null), primaries: new Set(), osmNames: Object.create(null), tileNames: [], name: '', area: '', sectors: Object.create(null), parts: Object.create(null) }; }
/** @type {{ street: string|null, snapshot: any, collapsed: boolean, face: string }} */
let crSectorSession = { street: null, snapshot: undefined, collapsed: false, face: 'panel' }; // the sector/panel session as one record: street, entry snapshot (null = whole road), collapsed, face
/** @returns {void} */
function crSectorReset() { crSectorSession.street = null; crSectorSession.snapshot = undefined; } // a sector session's teardown in one place; it closes the pair only, collapsed/face cleared separately on purpose
/** @returns {string[]} */
function draftStreets() { return draft ? Object.keys(draft.roads) : []; }

// ---- city-first preparation ---- a picked city loads whole, once; every tap then resolves locally, no per-tap network
/** @type {CrTiming} */
const CR_TIMING = { budgetMs: 120000, attempt1Ms: 70000, topupBudgetMs: 90000, topupAttempt1Ms: 60000, capBytes: 2 * 1024 * 1024, cityCapBytes: 60 * 1024 * 1024, attemptStallMs: 60000, packFirstByteMs: 120000, packStallMs: 60000, stallMs: 180000 }; // Beta 1.229: stallMs - the no-progress bound for a whole street-grid / area preparation: if NOTHING has landed for this long the load cannot progress, and the watchdogs (crGridWatchdog in create-cache.js, crPrepWatchdog in create-citydata.js) force the existing failed/degraded landing instead of a readout percentage that never moves again (Andrew's Aurora stall). Sized off the fetch budget above: a full budget of honest trying (120s) plus a minute of slack, so a slow-but-alive load is never cut - the preparation watchdogs see LANDINGS, not bytes, so their bound must stay above the whole fetch budget or they would cut fetches the budget itself would have let live. Beta 1.246: attemptStallMs - the OTHER stall rule, one level down (Andrew's Apple-standard rule): inside crOverpassFetch, an attempt that has produced NO BYTES for this long is aborted and the fetch moves to its next instance inside the same budget; the answer landing and every chunk re-arm it, so a slow-but-alive download (bytes trickling) is never cut by it - it lives or dies by its attempt cap and the budget alone. The two rules are not interchangeable: the attempt rule cannot see the unbudgeted wedges the watchdogs exist for (a pack download, a saved-grid read - promises with no bytes to watch), and the watchdogs cannot see bytes. Beta 1.249: packFirstByteMs / packStallMs - the city pack download's own two windows (crPackDownload, create-citydata.js), the silence rules' third seat: a pack is ONE static file whose host spends real time producing a big city's answer before the first byte moves, so its pre-first-byte window is the generous 120 s (Andrew's ruling, 2026-11-19), and once bytes flow the window tightens to the same 60 s the attempt rule uses. A silence kill there retries inside crPackLoad's cached promise, bounded by stallMs itself (referenced from crPackLoad, never restated) - the preparation watchdogs stay the outer backstop, exactly as they were. The battery shrinks them like every other budget here. // ONE overall deadline per fetch with the attempt budgets defined INSIDE it - the primary may take at most attempt1Ms, so the fallback always keeps a meaningful reserve. Verify round (CG-PF-07): the TOP-UP budgets obey the same measured profile as the batch - the primary's measured successes were 40.6/52.7 s, so a 40 s top-up cap reproduced the PF-02 failure on the exception path; the top-up primary now gets 60 s of its 90 s. An object (not bare consts) as the honest test seam: the battery shrinks budgets and caps instead of waiting out real minutes.
const CR_INNER_KM = 2, CR_BUFFER_KM = 1, CR_TOPUP_RING_KM = 2; // the fallback footprint: a fixed ~4x4 km box plus 1 km buffer - geographic, never viewport-derived
const CR_CELL_KM = 4, CR_GRID_PARALLEL = 3, CR_CELL_TRIES = 2; // the grid: ~4x4 km cells, at most 3 fetches in flight, each cell retried once before it is marked failed
let crSession = 0; // bumped on every enterCreate and exitCreate
/** @type {CrCity|null} */
let crCity = null; // { name, lat, lon, bbox } - the city in scope (lat/lon/bbox null when only the name is known)
/** @type {CrCov|null} */
let crCov = null; // the merged extract taps resolve from: city cells + fallback boxes, one index (ids dedupe across cells)
/** @type {any} */
let crWanted = null; // an explicit preparation offer the hint's button acts on; cleared when a preparation starts
/** @type {any} */
let crTopOp = null; // the in-flight top-up's cancellation handle (crOverpassFetch's op), so exitCreate can stop its download too
let crCovGen = 0; // the coverage generation
/** @type {CrPrepRec|null} */
let crPrep = null; // { gen, session, anchor, startedAt, ticker, op } while a FALLBACK box preparation is in flight
/** @type {CrGrid|null} */
let crGrid = null; // the city grid preparation's record, kept after it settles for progress/resume state
let crPrepState = 'none'; // app writes go through crSetPrepState below; a direct assignment survives only as the battery's scenario seeding
// the prep state record: writes outside the observed transition table are refused and recorded in crPrepViolations
/** @type {Record<string,string[]>} */
const CR_PREP_EDGES = { none: ['preparing', 'none'], preparing: ['preparing', 'ready', 'degraded', 'failed', 'none'], ready: ['preparing', 'none'], degraded: ['preparing', 'none'], failed: ['preparing', 'none'] };
const crPrepViolations = []; // 'from->to' of every refused transition - empty in every healthy run; the battery's teeth checks (drive181) read it
/** @param {string} next @returns {boolean} */
function crSetPrepState(next) { if (next === crPrepState) return true; const row = CR_PREP_EDGES[crPrepState]; if (row && row.indexOf(next) >= 0) { crPrepState = next; return true; } crPrepViolations.push(crPrepState + '->' + next); return false; } // a write of the state the record already holds is a re-assertion, not a transition: the settle sites are re-entrant (two cell completions in one tick can both reach the grid's finish) and re-asserted the same value, unremarked, through 1.153 - the setter passes it, unrecorded (drive181's first CI run proved the re-assertions happen in healthy flows: ready->ready, failed->failed, degraded->degraded). A current state with no row in the table (a value the app itself never holds) refuses every CHANGE the same way - the record never throws
/** @type {CrPrepFail|null} */
let crPrepFail = null; // { kind: 'unreachable' | 'error' | 'dense' | 'badjson', status?, remark? }
let crFailFromGrid = false; // which one failed: Retry resumes a grid's cells but re-runs a box at its anchor; never confuse them
/** @returns {void} */
function crPrepBegin() { crSetPrepState('preparing'); crPrepFail = null; crFailFromGrid = false; crWanted = null; } // the entry bundle: state to 'preparing', failure cleared, offer answered; the generation bump stays at the sites
/** @type {any} */
let crPrepAnchor = null; // where Retry / a not-ready tap re-prepares
/** @type {Record<string,any>} */
let crPending = {}; // streets whose shape reaches beyond verified coverage (fail-closed): listed as pending, NEVER added half-known
/** @type {Record<string,boolean>} */
let crToppedUp = {}; // '<full name>@<gen>' -> true: a street's ONE top-up per coverage generation is spent
let crCityReturn = 'doors'; // where the city pane's Back lands
/** @param {number} lat @param {number} lng @param {number} halfKm @returns {RouteBox} */
function crBoxAround(lat, lng, halfKm) { const dLat = halfKm * 1000 / MLAT, dLng = halfKm * 1000 / MLNG; return { s: +(lat - dLat).toFixed(6), n: +(lat + dLat).toFixed(6), w: +(lng - dLng).toFixed(6), e: +(lng + dLng).toFixed(6) }; }
/** @param {RouteBox|null} box @param {number} lat @param {number} lng @returns {boolean} */
function crInBox(box, lat, lng) { return !!box && lat >= box.s && lat <= box.n && lng >= box.w && lng <= box.e; }
/** @param {RouteBox[]|null|undefined} boxes @param {number} lat @param {number} lng @returns {boolean} */
function crInAnyBox(boxes, lat, lng) { for (const b of boxes || []) { if (crInBox(b, lat, lng)) return true; } return false; } // verified coverage is a SET of boxes: an endpoint is verified when it lies inside ANY of them
// the one query builder: batch and top-up share its grammar; the battery decodes the bodies and grades this output
/** @param {string} filter @param {RouteBox} box @param {number} timeoutS @returns {string} */
function crQL(filter, box, timeoutS) { return '[out:json][timeout:' + timeoutS + '];way[' + filter + '](' + box.s + ',' + box.w + ',' + box.n + ',' + box.e + ');out geom;'; }
/** @param {RouteBox} box @param {number} timeoutS @returns {string} */
function crAreaQL(box, timeoutS) { return crQL('"name"]["highway"', box, timeoutS); }
/** @param {string} osmName @param {RouteBox} box @param {number} timeoutS @returns {string} */
function crNameQL(osmName, box, timeoutS) { return crQL('"name"="' + osmName.replace(/(["\\])/g, '\\$1') + '"', box, timeoutS); }
/** @param {any} op @returns {void} */
function crAbortOp(op) { try { if (op && op.ctl) op.ctl.abort(); } catch (e) {} } // stop an in-flight fetch's download, not just its right to land (CG-PF-10: Cancel/exit/supersede abort the request itself)
/** @param {any} r @param {((total: number) => string|null)|undefined} onChunk @returns {Promise<any>} */
async function crReadBodyText(r, onChunk) { // the shared response consumption (stream, accumulate, decode); every policy (timers, caps, checks) stays at the callers
  if (!r.body || typeof r.body.getReader !== 'function') return { fallback: true };
  const reader = r.body.getReader(), /** @type {Uint8Array[]} */ chunks = []; let total = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    const verdict = onChunk ? onChunk(total) : null;
    if (verdict) { try { await reader.cancel(); } catch (e) {} return { stopped: verdict }; }
    chunks.push(part.value);
  }
  const buf = new Uint8Array(total); let off = 0; for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return { text: new TextDecoder().decode(buf) };
}
/** @param{string} ql @param{number} budgetMs @param{number} attempt1Ms @param{(() => boolean)|null|undefined} sessionOk @param{any} op @returns{Promise<any>} */
async function crOverpassFetch(ql, budgetMs, attempt1Ms, sessionOk, op) {
  // one deadline: attempt 1 capped inside it (fallback keeps a reserve); the byte cap is enforced as bytes arrive
  const t0 = Date.now(), deadline = t0 + budgetMs;
  let lastFail = /** @type {any} */ ({ ok: false, kind: 'unreachable' });
  for (let i = 0; i < OVERPASS_URLS.length; i++) {
    if (sessionOk && !sessionOk()) return { ok: false, kind: 'stale' };
    const remain = deadline - Date.now(); if (remain <= 0) break;
    const cap = i === 0 ? Math.min(attempt1Ms, remain) : remain;
    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (op) op.ctl = ctl; // the caller can stop THIS download (Cancel / exit / supersede - CG-PF-10)
    const to = ctl ? setTimeout(() => { try { ctl.abort(); } catch (e) {} }, cap) : null;
    // the attempt's silence timer beside its cap timer: armed at start, re-armed per chunk; clearTimers retires both together
    let /** @type {number|null} */ stallTo = null;
    const armStall = () => { if (!ctl) return; if (stallTo) clearTimeout(stallTo); stallTo = setTimeout(() => { try { ctl.abort(); } catch (e) {} }, CR_TIMING.attemptStallMs); };
    const clearTimers = () => { if (to) clearTimeout(to); if (stallTo) clearTimeout(stallTo); };
    armStall();
    try {
      const r = await fetch(OVERPASS_URLS[i], { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(ql), signal: ctl ? ctl.signal : undefined });
      armStall(); // the answer landing is progress: the body's silence clock starts from here
      if (!r.ok) { lastFail = { ok: false, kind: 'error', status: r.status }; clearTimers(); continue; }
      let text;
      if (r.body && typeof r.body.getReader === 'function') {
        const read = await crReadBodyText(r, (total) => { // consumption is crReadBodyText's; the policies ride the hook in order: byte cap, silence re-arm, session check
          if (total > CR_TIMING.capBytes) return 'dense';
          armStall(); // a landed chunk is progress
          if (sessionOk && !sessionOk()) return 'stale';
          return null;
        });
        if (read.stopped === 'dense') { try { if (ctl) ctl.abort(); } catch (e) {} clearTimers(); return { ok: false, kind: 'dense' }; }
        if (read.stopped === 'stale') { clearTimers();
        crAbortOp(op);
        return { ok: false, kind: 'stale' };
        } // superseded mid-stream: stop the download, don't just discard its result (CG-PF-10) - the reader was cancelled inside crReadBodyText
        text = read.text;
      } else { const cl = (r.headers && typeof r.headers.get === 'function') ? +(r.headers.get('content-length') || 0) : 0; if (cl > CR_TIMING.capBytes) { clearTimers(); return { ok: false, kind: 'dense' }; } text = await r.text(); if (new TextEncoder().encode(text).length > CR_TIMING.capBytes) { clearTimers(); return { ok: false, kind: 'dense' }; } } // Beta 1.170 (Carbon fix round Phase 2, D-07): the no-stream fallback measures the cap the way the streaming branch does - a declared Content-Length over the cap refuses BEFORE the body is buffered, and the buffered text is measured in BYTES (TextEncoder), where through 1.169 the only check ran after the full buffer landed and compared UTF-16 code units against the byte cap (a multi-byte body passed at up to twice the cap). What a reader-less response still cannot do is abort MID-body - that residual is inherent to the fallback, and is why the streaming branch is the primary. Beta 1.246: the fallback likewise cannot SEE mid-body progress, so its silence timer runs from the answer landing - a text() that wedges is cut by the silence rule, where a trickling one cannot be told apart (the streaming branch remains the primary on every browser that has it)
      clearTimers();
      let json = null;
      try { json = JSON.parse(text); } catch (e) { lastFail = { ok: false, kind: 'badjson' }; continue; }
      if (Date.now() > deadline) { lastFail = { ok: false, kind: 'unreachable' }; continue; } // the parse itself ate the deadline (CG-PF-03): a late success is not committed
      if (json && json.remark) return { ok: false, kind: 'error', remark: String(json.remark).slice(0, 120) }; // an error remark fails the extract even on HTTP 200: partial output is never promoted to ready
      if (!json || !Array.isArray(json.elements)) { lastFail = { ok: false, kind: 'badjson' }; continue; }
      return { ok: true, json, ms: Date.now() - t0 };
    } catch (e) {
      clearTimers();
      if (sessionOk && !sessionOk()) return { ok: false, kind: 'stale' };
      lastFail = { ok: false, kind: 'unreachable' };
    }
  }
  return lastFail;
}
/** @param{RouteBox} box @param{string|null} name @param{number} budgetMs @param{number} attempt1Ms @param{(() => boolean)|null|undefined} sessionOk @param{any} op @returns{Promise<any>} */
async function crSourceExtract(box, name, budgetMs, attempt1Ms, sessionOk, op) {
  // the seam: every extract comes through this one function; packs plug in behind it, the service is the fallback
  const pk = await crPackServe(box, name, sessionOk);
  if (pk) return pk;
  const ql = name ? crNameQL(name, box, Math.ceil(budgetMs / 1000)) : crAreaQL(box, Math.ceil(budgetMs / 1000));
  return crOverpassFetch(ql, budgetMs, attempt1Ms, sessionOk, op);
}
