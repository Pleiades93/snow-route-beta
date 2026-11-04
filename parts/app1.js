'use strict';
// ===== FRESH APP CORE (Beta 1 rebuild) — state, storage, geometry =====
const $ = id => document.getElementById(id);
const MLAT = 111320, MLNG = 80386;
const vvHeight = () => (window.visualViewport ? window.visualViewport.height : window.innerHeight); // visible-screen height (shrinks when the phone keyboard opens)
const YELLOW = '#ffc233', RED = '#ef476f', GREEN = '#06d6a0';
const MAIN = new Set(['Velmar', 'Mellings', 'Astona', 'Santa Barbara', 'Valeria', 'Greenpark']);
const SPOT = { 'Columbus': [1, 0.47], 'Mellings': [1, 0.55], 'Valeria': [1, 0.45], 'Santa Barbara': [3, 0.40], 'Kingsnorth': [0, 0.57], 'Bell Harbour': [0, 0.45], 'Romeo': [-1, 0.40], 'Astona': [-1, 0.60], 'Bourbon': [-1, 0.55], 'Fifth': [-1, 0.55] };
const TRAIL_MAX = 8000;
// Beta 1.76 (Andrew): ROUTES. A route is a pack (geometry in data.js) plus its own
// storage slot: every route-scoped record lives under 'snowroute.<routeId>.',
// so a second route is a new tenant, never a reshuffle. App-wide records
// (night, backup-nudge, prep) stay global. LS always points at the ACTIVE
// route's slot; loadRouteState() resolves it (and runs the one-time legacy
// migration) before any state is read. LEGACY_KEYS are the pre-1.76 names,
// kept for that migration and for restoring v1 backups. Backup field list:
// session markers ride in backups (Beta 1.71, audit B02); an older backup
// simply lacks a field; restore follows the missing-key rule EXCEPT that a
// backup replacing the trail clears the current markers (Beta 1.73, C06).
const ROUTE_PACKS = [{ id: '5w', name: 'Route 5W', area: 'Vaughan', roads: ROADS, reference: REFERENCE }];
function routeKeys(id) { const p = 'snowroute.' + id + '.'; return { done: p + 'v2', times: p + 'v2.times', hist: p + 'v2.history', notes: p + 'v4.notes', via: p + 'v4.via', trail: p + 'v4.trail', cov: p + 'v4.cov', start: p + 'v5.start', flip: p + 'v5.flip', sides: p + 'v5.sides', sess: p + 'v5.sess', pre: p + 'v5.preload', snap: p + 'v5.snap', mig: p + 'v2.migrated' }; } // Beta 1.94 (deep audit SR-193-02/03): two slot-local records join the layout - 'snap' is the running clean's persisted pre-Start board (Start writes it, Finish/Cancel delete it; transient, never backed up, not in ROUTE_FIELDS) and 'mig' is the legacy migration's explicit completion marker (see migrateLegacyRoute). Neither is a backup field.
const LS_GLOBAL = { night: 'snowroute.v2.night', nightExp: 'snowroute.v2.nightExp', exp: 'snowroute.v5.export', prep: 'snowroute.prep.v1' };
const LEGACY_KEYS = { done: 'snowroute.v2', times: 'snowroute.v2.times', hist: 'snowroute.v2.history', notes: 'snowroute.v4.notes', via: 'snowroute.v4.via', trail: 'snowroute.v4.trail', cov: 'snowroute.v4.cov', start: 'snowroute.v5.start', flip: 'snowroute.v5.flip', sides: 'snowroute.v5.sides', sess: 'snowroute.v5.sess', snap: 'snowroute.v5.snap' }; // snap rides here too so LS.snap is defined on a legacy-fallback boot (the pre-1.76 app never wrote one - the key is simply absent there, which the cancel path already treats as 'no snapshot')
const ROUTE_FIELDS = ['done', 'times', 'hist', 'notes', 'via', 'trail', 'cov', 'start', 'flip', 'sides', 'sess'];
let LS = { ...routeKeys('5w'), ...LS_GLOBAL };
function migrateLegacyRoute(id) { // one-time, 5W only. Beta 1.94 (deep audit SR-193-03): the COMMIT RECORD is the explicit marker key (rk.mig), never field presence. The 1.93 parity gate (R04) could not tell an interrupted copy from a legitimately partial slot - sides restored from a backup, no history yet - and its retry recopied legacy sides OVER the newer restored ones. Now: with the marker absent, the copy fills ONLY fields the slot lacks (a present slot field is never overwritten), each fill verified by read-back; any failure reports false and the caller reads the legacy keys for this boot - verified fills already landed may stay, since without the marker they are never mistaken for a completed move, and each is an exact copy of the legacy value. Parity is re-checked before the marker is written. The legacy keys themselves are never deleted - they stay as the fallback copy.
  if (id !== '5w') return true;
  const rk = routeKeys(id);
  if (lsGet(rk.mig) !== null) return true; // the move committed on an earlier boot - the slot is never re-examined against legacy again
  if (lsGet(LEGACY_KEYS.sides) === null) return true; // nothing legacy to move
  for (const f of ROUTE_FIELDS) { const raw = lsGet(LEGACY_KEYS[f]); if (raw === null) continue; if (lsGet(rk[f]) !== null) continue; if (!lsSet(rk[f], raw) || lsGet(rk[f]) !== raw) return false; } // fill the gaps only, verified per key
  for (const f of ROUTE_FIELDS) { if (lsGet(LEGACY_KEYS[f]) !== null && lsGet(rk[f]) === null) return false; } // parity before committing: every field legacy holds must now be present in the slot
  lsSet(rk.mig, '1'); // commit. If THIS write fails the next boot re-runs the fill (by then a no-op) and retries the marker - safe either way
  return true;
}

function distM(a, b) { const dx = (a[1] - b[1]) * MLNG, dy = (a[0] - b[0]) * MLAT; return Math.hypot(dx, dy); }
const jDistM = distM; // the paint engine's name for the same two-point distance
function trailSegments(trail, trailSessions) { // Beta 1.99 (architecture Phase 2, C1): THE trail segment-acceptance rule, in exactly one place - a segment breaks when the gap exceeds 300 s, the jump exceeds 1000 m, or (when session markers are supplied) a recorded session start falls between the two points. trailKm, drawTrail and buildGpx all consume this; before 1.99 each carried its own copy and three audit rounds (1.70/1.71) had to force them back into agreement by hand. Pure: points in, segments (arrays of the same point references) out. The parameters deliberately keep buildGpx's names so its 1.73/1.74 pointer walk (C07/D01) moves VERBATIM: markers are walked with a pointer, and when a point steps BACKWARD below markers already passed, the pointer re-seeks before testing - chronological trails never re-seek, so the walk stays linear (drive143 X6/X7 parity, fixtures in tests/browser/selftest-trail-segments.mjs).
  trailSessions = trailSessions || [];
  const segs = []; let seg = []; let sessAt = 0;
  for (let i = 0; i < trail.length; i++) { const p = trail[i]; if (i > 0) { if (sessAt > 0 && trailSessions[sessAt - 1] > trail[i - 1][2]) { let lo = 0, hi = sessAt; while (lo < hi) { const mid = (lo + hi) >> 1; if (trailSessions[mid] <= trail[i - 1][2]) lo = mid + 1; else hi = mid; } sessAt = lo; } while (sessAt < trailSessions.length && trailSessions[sessAt] <= trail[i - 1][2]) sessAt++; } if (i > 0 && (p[2] - trail[i - 1][2] > 300 || distM(trail[i - 1], p) > 1000 || (sessAt < trailSessions.length && trailSessions[sessAt] <= p[2]))) { segs.push(seg); seg = []; } seg.push(p); }
  if (seg.length) segs.push(seg);
  return segs;
}
function ptSegM(p, a, b) { // metres from point p to segment a-b (the engine's helper)
  const ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, px = p[1] * MLNG, py = p[0] * MLAT;
  const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
  let t = L2 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}
function fmtClock(d) { let h = d.getHours(), m = d.getMinutes(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ' ' + ap; }
function fmtDur(ms) { const s = Math.round(ms / 1000); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return m + ' min'; return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; }
function segLenM(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += distM(pts[i - 1], pts[i]); return s; } // the APP-global segment length (plain distM) - workDoneM's progress math. NOT a duplicate of the paint engine's private segLenM inside the GLP closure, which sums jDistM for label/anchor geometry: different scope, different metric, both load-bearing (third audit's 'delete one' was wrong - removing this one broke the progress meter, drive141 F07b caught it)
// Toast (native dialogs are banned)
let toastTimer = 0;
function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2400); }
// Storage — guarded; a failure is SHOWN, never silent
function flagStorage() { document.body.classList.add('storage-bad'); }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { flagStorage(); return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { flagStorage(); return false; } }
function lsDel(k) { try { localStorage.removeItem(k); return true; } catch (e) { flagStorage(); return false; } } // Beta 1.63 (audit F03): deletions report like writes - a failed removeItem used to be invisible while saveStart claimed success
function parseJ(raw, fb) { if (raw == null) return fb; try { const v = JSON.parse(raw); return v == null ? fb : v; } catch (e) { return fb; } }
// Tap guard — 400 ms per control
const tapLast = {};
function tapGuard(key) { const now = Date.now(); if (tapLast[key] && now - tapLast[key] < 400) return false; tapLast[key] = now; return true; }

// ===== STRETCHES — stitch each street, cut at junctions (checklist SS1) =====
function stitchLine(name) {
  const segs = ROADS[name].map(s => s.slice());
  const used = new Array(segs.length).fill(false);
  let line = segs[0].slice(); used[0] = true;
  for (let guard = 0; guard < segs.length + 2; guard++) {
    let grew = false;
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      const s = segs[i], a = s[0], b = s[s.length - 1], L0 = line[0], L1 = line[line.length - 1];
      const eq = (p, q) => p[0] === q[0] && p[1] === q[1];
      if (eq(a, L1)) { line = line.concat(s.slice(1)); } else if (eq(b, L1)) { line = line.concat(s.slice(0, -1).reverse()); }
      else if (eq(b, L0)) { line = s.slice(0, -1).concat(line); } else if (eq(a, L0)) { line = s.slice(1).reverse().concat(line); }
      else continue;
      used[i] = true; grew = true;
    }
    if (!grew) break;
  }
  return line;
}
function projOnLine(pts, cum, p) { // nearest projection: {d: distance along line, off: metres off line}
  let best = { d: 0, off: Infinity };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, px = p[1] * MLNG, py = p[0] * MLAT;
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
    let t = L2 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const off = Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
    if (off < best.off) best = { d: cum[i - 1] + Math.sqrt(L2) * t, off };
  }
  return best;
}
function sliceLine(pts, cum, d0, d1) {
  const out = [];
  const at = d => { for (let i = 1; i < pts.length; i++) { if (d <= cum[i] || i === pts.length - 1) { const span = cum[i] - cum[i - 1] || 1; const t = Math.max(0, Math.min(1, (d - cum[i - 1]) / span)); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; } } return pts[pts.length - 1]; };
  out.push(at(d0));
  for (let i = 0; i < pts.length; i++) if (cum[i] > d0 && cum[i] < d1) out.push(pts[i]);
  out.push(at(d1));
  return out;
}
const STRETCH = {};
(function buildStretches() {
  const lines = {}, cums = {}, totals = {};
  for (const n of Object.keys(ROADS)) { const L = stitchLine(n); lines[n] = L; const cum = [0]; for (let i = 1; i < L.length; i++) cum.push(cum[i - 1] + distM(L[i - 1], L[i])); cums[n] = cum; totals[n] = cum[cum.length - 1]; }
  for (const n of Object.keys(ROADS)) {
    const cuts = [];
    for (const m of Object.keys(ROADS)) {
      if (m === n) continue;
      for (const v of lines[m]) { const pr = projOnLine(lines[n], cums[n], v); if (pr.off <= 4) cuts.push(pr.d); }
    }
    cuts.sort((a, b) => a - b);
    const merged = [];
    for (const c of cuts) { if (merged.length && c - merged[merged.length - 1] < 15) continue; merged.push(c); }
    const inner = merged.filter(c => c >= 12 && c <= totals[n] - 12);
    const bounds = [0, ...inner, totals[n]];
    const parts = [];
    for (let i = 1; i < bounds.length; i++) parts.push(sliceLine(lines[n], cums[n], bounds[i - 1], bounds[i]));
    STRETCH[n] = { line: lines[n], cum: cums[n], total: totals[n], parts };
  }
})();
const STREETNAMES = Object.keys(ROADS);
const names = STREETNAMES; // the paint engine's name for the street list

// ===== STATE =====
const STREETSET = new Set(STREETNAMES);
// Beta 1.76: state loads when a route is CHOSEN, not at script eval - before
// that, the globals below sit at their empty defaults and nothing route-shaped
// is read, drawn, or offered. loadRoute (app4) resolves the pack, this loads
// its slot. The load body is the pre-1.76 eval-time block VERBATIM (same
// sanitizers, same order), wrapped.
let doneSet = new Set(), doneTimes = {}, doneVia = {}, notes = {}, history = [], runStart = 0, trail = [], trailSessions = [], coveredIdx = {}, pieces = {}, pieceTimes = {};
function isFullRun(h) { return !!(h && h.items && Object.keys(h.items).length >= STREETNAMES.length); } // Beta 1.94 (audit F-01): the street count derives from the route's own street list, never a hard-coded 34 - the same derivation replaces every hard-coded count in the app this round
function trimHistory(list) { const out = list.slice(); while (out.length > 10) { const i = out.findIndex(h => !isFullRun(h)); out.splice(i >= 0 ? i : 0, 1); } return out; }
function saveHistory() { history = trimHistory(history); return lsSet(LS.hist, JSON.stringify(history)); } // Beta 1.63 (audit F04): the delete-clean handler branches on this
let startDirty = false; // Beta 1.92 (deep audit F05): a failed start write/delete arms this retry, walked by the flushAux heartbeat until it lands - a stale start key must never resurrect a finished run on the next boot
let snapDirty = false; // Beta 1.94 (deep audit SR-193-02): the same retry discipline for the persisted pre-Start snapshot (saveSnap, app3) - a failed snapshot write is retried by flushAux until it lands
function saveStart() { const ok = runStart ? lsSet(LS.start, String(runStart)) : lsDel(LS.start); startDirty = !ok; return ok; } // Beta 1.57: reports its result like every other write, for the saveAll contract
function streetComplete(n) { const p = pieces[n]; if (!Array.isArray(p)) return doneSet.has(n); return p.every(v => v === 3); }
function sanitizePieceTimes(raw, count) { // Beta 1.64 (audit F07): only [stringOrNull, stringOrNull] pairs survive - a nested string used to reach applyPiece and throw under strict mode. Accepts the array shape the app writes and the numeric-keyed object a JSON round-trip of a sparse structure can produce. Beta 1.70 (audit A06): indexes are bounded by the street's real stretch count - a corrupt key like 10000 used to inflate a sparse array to that length (~50 KB of nulls per street, worse for larger keys).
  const pair = pr => Array.isArray(pr) ? [typeof pr[0] === 'string' ? pr[0] : null, typeof pr[1] === 'string' ? pr[1] : null] : [null, null];
  const lim = Number.isInteger(count) && count > 0 ? count : 0;
  const out = [];
  if (Array.isArray(raw)) { const n = Math.min(raw.length, lim); for (let i = 0; i < n; i++) out[i] = pair(raw[i]); return out; }
  if (raw && typeof raw === 'object') { for (const k of Object.keys(raw)) { const i = Number(k); if (Number.isInteger(i) && i >= 0 && i < lim) out[i] = pair(raw[k]); } return out; }
  return out;
}
let routeLoaded = false, activeRoute = null; // Beta 1.76: set by loadRoute (app4) once a pack is chosen; app2's paint/render gates read them
function loadRouteState(id) {
  LS = migrateLegacyRoute(id) ? { ...routeKeys(id), ...LS_GLOBAL } : { ...LEGACY_KEYS, ...LS_GLOBAL };
const _doneRaw = parseJ(lsGet(LS.done), []);
doneSet = new Set(Array.isArray(_doneRaw) ? _doneRaw.filter(n => typeof n === 'string' && STREETSET.has(n)) : []); // audit D2: a non-array value (legacy object, number) made new Set() throw and killed the boot; loadSides re-derives this from pieces below regardless
doneTimes = parseJ(lsGet(LS.times), {});
if (!doneTimes || typeof doneTimes !== 'object' || Array.isArray(doneTimes)) doneTimes = {}; // Beta 1.64 (audit F07): normalize BEFORE the cleanup loop below - a stored JSON string made its `delete` throw under strict mode and killed the boot
for (const k of Object.keys(doneTimes)) { if (typeof doneTimes[k] !== 'string' || isNaN(Date.parse(doneTimes[k]))) delete doneTimes[k]; }
doneVia = parseJ(lsGet(LS.via), {});
if (!doneVia || typeof doneVia !== 'object' || Array.isArray(doneVia)) doneVia = {};
notes = parseJ(lsGet(LS.notes), {});
// Notes model (production): {street: [{k:'note', at, text} | {k:'car'|'hazard'|'missed'|'salt', at}]} - normalize at load:
// a non-array value (e.g. a legacy string) is dropped, entries keep only object shapes with a string kind.
if (!notes || typeof notes !== 'object' || Array.isArray(notes)) notes = {};
Object.keys(notes).forEach(n => { if (!STREETSET.has(n) || !Array.isArray(notes[n])) delete notes[n]; else notes[n] = notes[n].filter(f => f && typeof f === 'object' && typeof f.k === 'string'); });
history = parseJ(lsGet(LS.hist), []);
// History (production): chronological (oldest first); items is a street->time MAP (legacy array entries migrate to it).
// Sanitized at load: real entries only, real streets only, times null or parseable - anything else is dropped, never crashes.
if (!Array.isArray(history)) history = [];
history = history.filter(h => h && typeof h === 'object' && !Array.isArray(h) && !isNaN(Date.parse(h.at)) && h.items && typeof h.items === 'object');
for (const h of history) {
  const m = {};
  if (Array.isArray(h.items)) { for (const n of h.items) if (typeof n === 'string' && STREETSET.has(n)) m[n] = (h.times && typeof h.times[n] === 'string' && !isNaN(Date.parse(h.times[n]))) ? h.times[n] : null; }
  else { for (const n of Object.keys(h.items)) { const t = h.items[n]; if (STREETSET.has(n) && (t === null || (typeof t === 'string' && !isNaN(Date.parse(t))))) m[n] = t; } }
  h.items = m;
}
history = history.filter(h => Object.keys(h.items).length > 0);
// Run start (production): epoch milliseconds, stored as a bare digit string (NOT JSON).
runStart = 0;
try { runStart = +lsGet(LS.start) || 0; } catch (e) { runStart = 0; }
trail = parseJ(lsGet(LS.trail), []);
trailSessions = parseJ(lsGet(LS.sess), []); // Beta 1.71 (audit B02): the epoch-second start of each clean that recorded trail points - the session identity the flat trail never carried, so exports can split cleans exactly instead of guessing from gaps. Pre-1.71 trails simply have no markers and keep the gap heuristic.
trailSessions = Array.isArray(trailSessions) ? [...new Set(trailSessions.filter(t => Number.isFinite(t) && t >= 946684800 && t <= 4102444800))].sort((a, b) => a - b) : [];
// Trail (production): [lat, lng, epochSeconds] triples; out-of-range or impossible points are dropped at load (SEC-9a bounds).
trail = Array.isArray(trail) ? trail.filter(p => Array.isArray(p) && p.length === 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]) && p[2] >= 946684800 && p[2] <= 4102444800 && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180) : [];
coveredIdx = parseJ(lsGet(LS.cov), {});
if (!coveredIdx || typeof coveredIdx !== 'object' || Array.isArray(coveredIdx)) coveredIdx = {};
for (const n of Object.keys(coveredIdx)) { if (!SAMPLES[n] || !Array.isArray(coveredIdx[n])) { delete coveredIdx[n]; continue; } coveredIdx[n] = coveredIdx[n].filter(i => Number.isInteger(i) && i >= 0 && i < SAMPLES[n].length); } // audit D1: was upper-bound only - negatives, fractions and text values survived and each inflated the coverage count. Beta 1.76: this pass used to sit at script eval in app3, over the state the old eval-time load had just parsed; now that state loads on route pick, the pass lives here, over the data it just loaded (the eval-time copy saw an empty object and sanitized nothing).
pieces = {}; pieceTimes = {};
(function loadSides() {
  const raw = parseJ(lsGet(LS.sides), null);
  let P = null, T = {};
  if (raw && typeof raw === 'object') { if (raw.p) { P = raw.p; T = raw.t || {}; } else P = raw; }
  for (const n of STREETNAMES) {
    const count = STRETCH[n].parts.length;
    let arr = (P && Array.isArray(P[n]) && P[n].length === count) ? P[n].map(v => (v === 1 || v === 2 || v === 3) ? v : 0) : null; // audit G3: normalize side values to the 0..3 the app writes - a crafted 99 otherwise counted sides via bitwise reads while streetComplete (===3) disagreed
    if (!arr) arr = new Array(count).fill(doneSet.has(n) ? 3 : 0);
    pieces[n] = arr;
    pieceTimes[n] = sanitizePieceTimes(T && T[n], STRETCH[n].parts.length);
  }
  // complete streets inherit their done-time on every side; doneSet is derived from pieces
  doneSet = new Set(STREETNAMES.filter(streetComplete));
  for (const n of STREETNAMES) {
    if (streetComplete(n) && doneTimes[n] && !Object.keys(pieceTimes[n]).length) { pieceTimes[n] = pieces[n].map(v => [v & 1 ? doneTimes[n] : null, v & 2 ? doneTimes[n] : null]); }
  }
  for (const k of Object.keys(doneTimes)) if (!streetComplete(k)) delete doneTimes[k];
  for (const k of Object.keys(doneVia)) if (!streetComplete(k)) delete doneVia[k];
})();
}
// ===== DAY/NIGHT (Beta 1.77, Andrew): the theme follows the sun by default.
// Sunrise and sunset are computed on the device (the standard NOAA
// approximation - good to a few minutes, no network, works offline) for the
// best position known: the last GPS fix, else the route's own centre. The
// Settings row is a session OVERRIDE: it holds until the next sunrise or
// sunset after it was set (a timer and every return to the front re-check),
// or until the app is fully closed - a fresh app open always starts
// automatic. A reload inside the session (the Update flow, a crash) keeps
// the override: sessionStorage carries the session marker, and the stored
// override carries its own expiry, so nothing stale outlives its boundary.
let themeOverride = null, themeOverrideUntil = 0; // null = automatic
function sunTimes(ms, lat, lng) { // the sun events of the position-local day containing ms, as epoch ms
  // The date is taken in the position's own solar frame (from its longitude),
  // never the device's timezone - the answer is a physical instant and must
  // not move with the clock's zone. The raw UTC hour the formula gives is
  // normalized into the position-local day's span: at far longitudes the
  // event's UTC clock reading can sit on the neighbouring date (a June
  // sunset in Ontario reads 01:03 UTC the NEXT day), and clamping it into
  // the same date lands it a day early - drive145 N18/N19 are the guards.
  const shifted = new Date(ms + lng * 240000), y = shifted.getUTCFullYear(), mo = shifted.getUTCMonth(), da = shifted.getUTCDate();
  const rad = Math.PI / 180, N = Math.floor((Date.UTC(y, mo, da) - Date.UTC(y, 0, 0)) / 86400000), lngHour = lng / 15;
  const dayStart = Date.UTC(y, mo, da) - lng * 240000;
  const one = isRise => {
    const t = N + ((isRise ? 6 : 18) - lngHour) / 24, M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634; L = ((L % 360) + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad; RA = ((RA % 360) + 360) % 360; RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90; RA /= 15;
    const sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null; // the sun never rises (or never sets) that day - no boundary to give
    const H = (isRise ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
    const UT = ((H + RA - 0.06571 * t - 6.622 - lngHour) % 24 + 24) % 24;
    let cand = Date.UTC(y, mo, da) + UT * 3600000;
    while (cand < dayStart) cand += 86400000;
    while (cand >= dayStart + 86400000) cand -= 86400000;
    return cand;
  };
  return { rise: one(true), set: one(false) };
}
function themePos() { try { if (typeof lastGood !== 'undefined' && lastGood && lastGood.ll) return lastGood.ll; } catch (e) {} try { if (typeof routeBox !== 'undefined' && routeBox) return [(routeBox.s + routeBox.n) / 2, (routeBox.w + routeBox.e) / 2]; } catch (e) {} return [43.82, -79.57]; } // Beta 1.92 (deep audit F01): lastGood/routeBox are declared LATER in the assembled script - a bare typeof probe throws in the temporal dead zone during early boot (initTheme runs before they exist), which killed the boot outright when a stored override had no usable expiry. The probes are guarded so the fixed fallback below is actually reachable.
function autoNightAt(ms) { const p = themePos(), st = sunTimes(ms, p[0], p[1]); if (!st || st.rise == null || st.set == null) return false; return ms >= st.set || ms < st.rise; }
function nextSunBoundary(ms) { const p = themePos(), out = []; for (let d = 0; d <= 1; d++) { const st = sunTimes(ms + d * 86400000, p[0], p[1]); if (st) { if (st.rise != null) out.push(st.rise); if (st.set != null) out.push(st.set); } } const nx = out.filter(t => t > ms).sort((a, b) => a - b)[0]; return nx || ms + 12 * 3600000; }
function isNight() { return themeOverride !== null ? themeOverride : autoNightAt(Date.now()); }
function clearThemeOverride() { themeOverride = null; themeOverrideUntil = 0; lsDel(LS.night); lsDel(LS.nightExp); }
function setThemeOverride(night) { themeOverride = night; themeOverrideUntil = nextSunBoundary(Date.now()); lsSet(LS.night, night ? '1' : '0'); lsSet(LS.nightExp, String(themeOverrideUntil)); }
function themeTick() { // the boundary hand-back, and the automatic cycle itself: if the effective theme no longer matches the screen, repaint
  if (themeOverride !== null && Date.now() >= themeOverrideUntil) clearThemeOverride();
  if (typeof document !== 'undefined' && document.body && typeof applyNight === 'function' && isNight() !== document.body.classList.contains('night')) { applyNight(); if (typeof map !== 'undefined' && map && typeof setBasemap === 'function') setBasemap(); }
}
(function initTheme() { // boot resolution (script eval; the boot tail's applyNight makes it visible)
  let continuing = false; try { continuing = !!sessionStorage.getItem('snowroute.session'); sessionStorage.setItem('snowroute.session', '1'); } catch (e) {}
  const stored = lsGet(LS.night), exp = +(lsGet(LS.nightExp) || 0);
  if (!continuing) { if (stored != null) { lsDel(LS.night); lsDel(LS.nightExp); } return; } // the app was fully closed since: automatic
  if (stored === '1' || stored === '0') {
    if (exp && Date.now() >= exp) { lsDel(LS.night); lsDel(LS.nightExp); return; } // its boundary passed while the app was away
    themeOverride = stored === '1'; themeOverrideUntil = (exp && isFinite(exp)) ? exp : nextSunBoundary(Date.now()); // Beta 1.92 (audit F01): a non-finite expiry (missing, corrupt, Infinity) recomputes the boundary instead of crashing or sticking forever
  }
})();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') themeTick(); });
function workDoneM() { let s = 0; for (const n of STREETNAMES) { const p = pieces[n]; STRETCH[n].parts.forEach((part, i) => { const L = segLenM(part); if (p[i] & 1) s += L; if (p[i] & 2) s += L; }); } return s; }
function liveWorkM() { // Beta 1.93 (follow-up audit R06): the RUN's work only - sides stamped at or after Start. workDoneM counts the whole board, so marks made before Start used to inflate the live rate (real progress, wrong clock).
  if (!runStart) return 0; let s = 0;
  for (const n of STREETNAMES) { const p = pieces[n], T = pieceTimes[n] || {}; STRETCH[n].parts.forEach((part, i) => { const L = segLenM(part); const st = T[i] || [null, null]; if ((p[i] & 1) && st[0] && Date.parse(st[0]) >= runStart) s += L; if ((p[i] & 2) && st[1] && Date.parse(st[1]) >= runStart) s += L; }); }
  return s; }
function totalWorkM() { let s = 0; for (const n of STREETNAMES) s += STRETCH[n].total * 2; return s; }
// Beta 1.57 (Phase 2 storage integrity, external audit Section 7): saveAll has a
// failure CONTRACT now. The sides record is the AUTHORITY for completion - the
// boot block re-derives the done set from it and prunes times/via against it -
// so it is written FIRST: if it fails, the save stops and the previous coherent
// state survives whole. Every other write is checked too; the first failing
// record is named in saveFailKey. Callers that stay silent (saveQuiet, used by
// the finish/undo transactions, which do their own gated writes and messaging)
// suppress the episode warning; everyone else gets one warning per failure
// episode (saveWarned resets on the next fully successful save).
let saveFailKey = null, saveWarned = false, saveQuiet = false;
let primaryDirty = false; // Beta 1.94 (deep audit SR-193-05): a failed saveAll arms this flag and flushAux's heartbeat retries the primary save until it lands. Before 1.94 the heartbeat retried only the auxiliary records and the start key, so a failed metadata write (notes/times/via/done/history) waited for the next incidental save - while Finish's own message promised a retry nothing performed.
function saveAll() {
  saveFailKey = null;
  if (!lsSet(LS.sides, JSON.stringify({ p: pieces, t: pieceTimes }))) saveFailKey = 'sides';
  else {
    if (!lsSet(LS.done, JSON.stringify([...doneSet]))) saveFailKey = 'done';
    if (!lsSet(LS.times, JSON.stringify(doneTimes)) && !saveFailKey) saveFailKey = 'times';
    if (!lsSet(LS.via, JSON.stringify(doneVia)) && !saveFailKey) saveFailKey = 'via';
    if (!lsSet(LS.notes, JSON.stringify(notes)) && !saveFailKey) saveFailKey = 'notes';
    if (!lsSet(LS.hist, JSON.stringify(history)) && !saveFailKey) saveFailKey = 'history';
    if (!saveStart() && !saveFailKey) saveFailKey = 'start';
    if (!lsSet(LS.cov, JSON.stringify(coveredIdx)) && !saveFailKey) saveFailKey = 'coverage';
  }
  if (saveFailKey) { primaryDirty = true; if (!saveQuiet && !saveWarned) { saveWarned = true; toast('Storage is not saving (' + saveFailKey + ') - export a recovery backup now', 4200); } return false; }
  saveWarned = false; primaryDirty = false;
  return true;
}
// Aux flush (production model): the trail JSON is the big write (~250 KB at cap) - at most every 45 s while
// recording, always when forced (page hide/close). Dirty flags clear ONLY when the write actually lands, so a
// failed write is retried by the next flush instead of silently dropping GPS points. While `restoring` is set
// (a restore is mid-flight), flushes are refused so the restore's reload cannot clobber the restored data.
let trailDirty = false, auxDirty = false, sessDirty = false, lastTrailSave = 0, restoring = false; // Beta 1.73 (audit C04/C05): sessDirty is the session markers' retry flag, same discipline as trailDirty - a failed marker write is retried by flushAux instead of being silently dropped
function saveTrail() { return lsSet(LS.trail, JSON.stringify(trail)); }
function saveSess() { return lsSet(LS.sess, JSON.stringify(trailSessions)); }
function flushAux(force) {
  if (restoring) return;
  if (auxDirty && lsSet(LS.cov, JSON.stringify(coveredIdx))) auxDirty = false;
  if (trailDirty && (force || Date.now() - lastTrailSave > 45000) && saveTrail()) { trailDirty = false; lastTrailSave = Date.now(); }
  if (sessDirty && saveSess()) sessDirty = false;
  if (startDirty) saveStart(); // Beta 1.92 (audit F05): saveStart re-arms the flag itself on failure
  if (snapDirty && typeof saveSnap === 'function') saveSnap(); // Beta 1.94 (SR-193-02): the cancel snapshot retries on the same heartbeat (saveSnap lives in app3 beside runSnap; the typeof probe keeps this safe in any partial-load state)
  if (primaryDirty) saveAll(); // Beta 1.94 (SR-193-05): a failed primary save retries here - saveAll clears the flag itself when a save lands whole
}
setInterval(() => { flushAux(false); themeTick(); }, 15000); // Beta 1.77: the same 15 s heartbeat also walks the day/night cycle across its boundaries
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAux(true); });
window.addEventListener('pagehide', () => flushAux(true));
