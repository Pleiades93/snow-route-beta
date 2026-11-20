'use strict';
// ===== FRESH APP CORE (Beta 1 rebuild) — state, storage, geometry =====
/** @type {(id: string) => AppElement} */ const $ = id => document.getElementById(id);
const MLAT = 111320, MLNG = 80386;
/** @type {() => number} */ const vvHeight = () => (window.visualViewport ? window.visualViewport.height : window.innerHeight); // visible-screen height (shrinks when the phone keyboard opens)
const YELLOW = '#ffc233', RED = '#ef476f', GREEN = '#06d6a0';
const PRIMARIES = new Set(); // Beta 1.117: the active pack's primary streets - filled per load by buildGeometry from pack.primaries (the values live in the pack, data.js)
const SPOT = {}; // Beta 1.117: the active pack's label-anchor hints - filled per load by buildGeometry from pack.spot
const TRAIL_MAX = 8000;
const TRAIL_WINDOW_S = 3600; // Beta 1.193 (trail redesign, Andrew's adopted design): the trail's retention window, in SECONDS of recorded points. Since 1.193 the trail is a backend-only fallback for the run-distance counter (no map line, no archived path): it keeps ONLY the live run's points from its last 60 minutes, windowed by trailWindow below at load, at append (acceptFix, app3), at Start, at Finish and at restore (app4). TRAIL_MAX above survives as the session markers' cap and the loader's absolute backstop - the point cap itself no longer bounds the trail (the window does: ~3,600 points at 1 Hz).
const FIXLOG_MAX = 3600; // Beta 1.195 (the toggle conversion): the raw fix log's cap, in FIXES (app3's fixLogTrim enforces it: oldest sessions evicted whole, a lone oversize session head-trimmed). 3,600 = ONE HOUR of 1 Hz fixes — Andrew's cap for the log's new life as a deliberate debugging capture behind the Settings switch: he turns it on for a drive he wants examined, and an hour covers the judging drives with room to spare. The Beta 1.190 sizing (36,000, ten hours, fitted to 6-8 h cleans) belonged to the always-on design and is retired with it; cleans themselves stay unlimited, this never touched them.
const FIXLOG_MAX_CHARS = 200000; // Beta 1.195: the same log's second cap, in CHARACTERS of its stored record (fixLogTrim enforces it beside FIXLOG_MAX, on a byte-accounted estimate; drive194 asserts the real serialized length). Sizing, from the codec's MEASURED worst case: the Beta 1.190 soak's densest stream ran 1,655,295 characters at the old 36,000-fix cap = ~46.0 characters per fix, so 3,600 fixes at that density need ~165,600 characters; this cap is set at 200,000 — about 55.6 characters per fix, a ~21% margin over the measured worst case, so the fix cap binds first in any stream resembling the measured ones and the character cap only trims a stream denser than anything yet recorded. The binding storage limit stays WebKit's: localStorage allows 5 MB per origin and persists strings as UTF-16 — 2 bytes per character, so the whole origin holds 2,500,000 characters (WebKit's LocalStorageManager quota; webkit.org bug 245479). The budget now: 200,000 (this log) + ~112,000 (the trail at its most — the Beta 1.193 window's ~3,600 points) + a 250,000-character board/settings/history allowance = ~562,000 ≤ 2,500,000, with most of the quota standing empty.
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
// Beta 1.117 (route separation, Andrew): ROUTE_PACKS itself is declared in
// data.js - packs are DATA (metadata + roads + reference), and the app holds
// no route of its own. ROADS/REFERENCE below are the LIVE working copies of
// the ACTIVE pack's geometry: empty until a pack loads, refilled in place by
// buildGeometry on every load/switch (never rebound, so every captured
// reference - GL_HOST's included - stays valid across a switch).
/** @type {RoadsMap} */ const ROADS = {};
/** @type {RoadsMap} */ const REFERENCE = {};
/** @param {string} id @returns {RouteKeys} */ function routeKeys(id) { const p = 'snowroute.' + id + '.'; return { done: p + 'v2', times: p + 'v2.times', hist: p + 'v2.history', notes: p + 'v4.notes', via: p + 'v4.via', trail: p + 'v4.trail', cov: p + 'v4.cov', start: p + 'v5.start', flip: p + 'v5.flip', sides: p + 'v5.sides', sess: p + 'v5.sess', pre: p + 'v5.preload', snap: p + 'v5.snap', mig: p + 'v2.migrated', migfill: p + 'v2.migfill', finclean: p + 'v5.finclean', rundist: p + 'v5.rundist', rundist2: p + 'v5.rundist2' }; } // Beta 1.94 (deep audit SR-193-02/03): two slot-local records join the layout - 'snap' is the running clean's persisted pre-Start board (Start writes it, Finish/Cancel delete it; transient, and not a ROUTE_FIELDS member - it rides backups only in normalized form, via snapForExport in app4, since Beta 1.96/1.97) and 'mig' is the legacy migration's explicit completion marker (see migrateLegacyRoute) and never a backup field. Beta 1.141 (Package A, DA-10): 'finclean' joins them on the same terms - the durable finish-cleanup obligation (finishRun's transaction writes it, saveAll's success discharges it, completeFinishCleanup completes it at load); transient, never backed up, not in ROUTE_FIELDS. Beta 1.150 (security-audit fix round): 'migfill' joins them on the same terms - the migration's per-field fill record (see migrateLegacyRoute); written only while a migration is incomplete, deleted when its marker commits. Beta 1.167 (run/pace fix round, B5): 'rundist' joins on the finclean terms WITHOUT any backup ride - the running clean's accumulated-distance record (app3's runDist), genuinely never backed up: Finish bakes its value into the archive entry's km, and a lost record re-derives from the surviving trail (adoptRunDist, app3).
const LS_GLOBAL = { night: 'snowroute.v2.night', nightExp: 'snowroute.v2.nightExp', exp: 'snowroute.v5.export', prep: 'snowroute.prep.v1', lastArea: 'snowroute.v2.lastarea', fixlog: 'snowroute.v1.fixlog', dp: 'snowroute.v1.dp' }; // Beta 1.118: lastArea = the create flow's area pre-fill memory. Beta 1.189: fixlog = the raw GPS fix log (app3) - a DEVICE record, not route data (it spans routes and locate sessions), so it lives with the globals and rides backups at top level like the settings record, never as a ROUTE_FIELDS member. Beta 1.230: dp = the device profile's stored tier hint (the DEVICE PROFILE section below) - a DEVICE record on fixlog's storage terms (global, spans routes, never a ROUTE_FIELDS member) but NOT backed up: the hint is a measurement of THIS device, and a backup restored onto another phone must not import it; a missing key is the standing default (full quality, no hint)
const LEGACY_KEYS = { done: 'snowroute.v2', times: 'snowroute.v2.times', hist: 'snowroute.v2.history', notes: 'snowroute.v4.notes', via: 'snowroute.v4.via', trail: 'snowroute.v4.trail', cov: 'snowroute.v4.cov', start: 'snowroute.v5.start', flip: 'snowroute.v5.flip', sides: 'snowroute.v5.sides', sess: 'snowroute.v5.sess', snap: 'snowroute.v5.snap', finclean: 'snowroute.v5.finclean', rundist: 'snowroute.v5.rundist', rundist2: 'snowroute.v5.rundist2' }; // Beta 1.193: 'rundist2' rides here on rundist's terms - the counter's second copy (bankRunDistMirror, app3), written only by the trail-flush path in flushAux below, never backed up; adoption reads it when the primary is lost (adoptRunDist, app3). snap rides here too so LS.snap is defined on a legacy-fallback boot (the pre-1.76 app never wrote one - the key is simply absent there, which the cancel path already treats as 'no snapshot'); finclean rides for the same reason (Beta 1.141); rundist rides for the same reason (Beta 1.167, B5)
const ROUTE_FIELDS = ['done', 'times', 'hist', 'notes', 'via', 'trail', 'cov', 'start', 'flip', 'sides', 'sess'];
const PACK_FIELDS = ['name', 'area', 'primaries', 'spot', 'tileNames', 'box', 'roads', 'reference']; // Beta 1.131 (maintainability programme A): the ONE list of fields a route pack carries - normalizePack (create-packs.js) builds every validated pack by walking THIS list, so a field joins the pack format by joining this list (with its cleaner there); a field absent from the list does not survive validation, by construction. Deliberately distinct from ROUTE_FIELDS above: those are storage-slot fields, and 'snap' in particular is a slot field that is NOT a pack field (hand-carried at restore scope by design) - it must never be added here.
// ===== RULE CONSTANTS (Beta 1.136, maintainability programme F): every number that IS a
// product rule lives HERE, named once - coverage, GPS acceptance and the pack validator's
// caps. A rule changes by changing its constant (with the evidence DEVELOPMENT_RULES asks
// for), never by hunting literals. The fence, stated once and binding: equal numbers that
// serve DIFFERENT policies stay SEPARATE constants - GPS_STALE_MS and TRAIL_FLUSH_MS are
// both 45 s today by coincidence, not by reference, and must be free to drift apart; the
// validator's three 60-character caps and two 80 caps are likewise separate per field.
const COV_SAMPLE_M = 15; // coverage samples are laid along a street every this many metres (samplesFor, app3)
const COV_RADIUS_M = 22; // a GPS fix covers the samples within this radius of it (coverFix, app3)
const COV_FRAC = 0.85; // the covered fraction at which an unmarked street is SUGGESTED (never auto-marked - coverFix, app3)
const GPS_ACCURACY_M = 65; // fixes reported worse than this are rejected while a fresh good fix exists; the accept comparison (<=) and the reject comparison (>) are ONE rule - this constant (acceptFix, app3)
const GPS_STILL_MPS = 0.5; // Beta 1.187 (GPS package, STOP B): a recorded fix reporting under this speed is a stopped fix - acceptFix's trail guard banks no distance and records no trail point from it (a parked truck's fix wander was banking a median 138 phantom metres a minute into saved cleans). The position path is NOT gated by it: the dot follows every accepted fix exactly as before. (A tighter 28 m accuracy gate and a stationary position hold were priced in the same harness and did NOT ship - both measured neutral-to-worse; the round record carries the numbers.)
const GPS_STALE_MS = 45000; // a watch silent this long is restarted (app3): silence runs from the later of the last accepted fix and the current watch's own start, so this one value is also a fresh watch's first-fix window (Beta 1.252, R-01 - one threshold by design; a longer cold-fix window, if ever wanted, becomes a sibling constant HERE, never a second literal in app3) - a GPS policy
const TRAIL_FLUSH_MS = 45000; // the buffered trail write's flush interval (flushAux, below) - a STORAGE policy; see the fence above
const COV_SAVE_MS = 15000; // the coverage write's throttle window (flushAux, below; declared here with the rule constants since Beta 1.136 - its 1.135 flush discipline is unchanged)
const PACK_NAME_MAX = 60, PACK_AREA_MAX = 60, PACK_STREET_NAME_MAX = 60; // the pack validator's per-field character caps (normalizePack, create.js) - separate constants per field, per the fence above
const PACK_STREETS_MAX = 300, PACK_SEGS_MAX = 80, PACK_SEG_PTS_MAX = 4000, PACK_POINTS_MAX = 150000; // the pack validator's shape caps (normalizePack, create.js); PACK_SEGS_MAX (segments per street) and PACK_TILENAME_MAX (characters per tile name) both happen to be 80 - different policies, separate constants
const PACK_TILENAME_MAX = 80, PACK_TILENAMES_MAX = 400;
const PACK_BOX_MAX_DEG = 4, PACK_LENGTH_MAX_M = 12000000; // Beta 1.152 (NV round): the pack validator's extent and total-length ceilings (normalizePack, create-packs.js), beside the shape caps they extend. Sized from the measured real maxima across all 12 shipped city datasets (44,405 streets): the widest city bounding box spans 0.526 degrees (Toronto), the declared Route 5W box 0.40, and the worst legitimate pack - the 300 longest Toronto streets as stitched runs - totals 2,962 km of street; the ceilings sit ~7.6x and ~4x above those. The length ceiling is what bounds samplesFor (app3): at one sample per COV_SAMPLE_M it caps a validated pack at ~800,000 samples.
const PACK_TILES_MAX = 20000; // Beta 1.152 (NV round): the per-pack tile-URL iteration budget inside the preload enumerators (app4) - ~29x the largest legitimate pack reference (a Toronto-sized box over the 5W core enumerates 689 tile URLs; Route 5W itself 633). A stored pack with a worldwide box is a boot wedge, not a route: its oversized zooms are skipped and enumeration terminates bounded.
/** @param {string} id @returns {string[]} */ function slotKeys(id) { const rk = routeKeys(id); return ROUTE_FIELDS.map(f => rk[f]).concat(rk.snap); } // Beta 1.136 (programme F): a route slot's BACKUP keys as one list - the ROUTE_FIELDS keys plus the cancel snapshot - for the callers that enumerate keys without needing field names (the restore's rollback scope). Backup field loops keep walking ROUTE_FIELDS itself (they need the names), and route deletion keeps enumerating routeKeys' values (it wipes slots the backup never carries, pre/mig included).
/** @type {Object.<string, string>} */ let LS = { ...routeKeys('5w'), ...LS_GLOBAL };
/** @param {string} id @returns {boolean} */ function migrateLegacyRoute(id) { // one-time, 5W only. Beta 1.94 (deep audit SR-193-03): the COMMIT RECORD is the explicit marker key (rk.mig), never field presence. The 1.93 parity gate (R04) could not tell an interrupted copy from a legitimately partial slot - sides restored from a backup, no history yet - and its retry recopied legacy sides OVER the newer restored ones. Now: with the marker absent, the copy fills ONLY fields the slot lacks (a present slot field is never overwritten), each fill verified by read-back; any failure reports false and the caller reads the legacy keys for this boot - verified fills already landed may stay, since without the marker they are never mistaken for a completed move, and each is an exact copy of the legacy value. Parity is re-checked before the marker is written. The legacy keys themselves are never deleted - they stay as the fallback copy. Beta 1.150 (security-audit fix round, finding legacy-migration-fallback-boot-stale-fill): the fill-only rule had one hole - when a fill failed PARTWAY, the fallback boot ran on the legacy keys and its saves wrote NEWER legacy values, and the next boot's retry skipped the fields that had already landed, so the stale partial copy became permanent under the committed marker. The record that tells a migration-owned fill from everyone else's write is rk.migfill: for each field, the exact value a landed fill wrote, persisted (verified) as each fill lands. On a retry, a slot value still EQUAL to its recorded fill is migration's own and is re-copied when the legacy value has moved on; a slot value that DIFFERS from its recorded fill was written by someone else (a restore) - it wins and its record is dropped, which is exactly the 1.94 protection, kept. The record is deleted when the marker commits; from then on the marker alone governs, as before.
  if (id !== '5w') return true;
  const rk = routeKeys(id);
  const migGet = k => { const v = rawRead(k); return v === RAW_READ_FAILED ? undefined : v; }; // Beta 1.169 (Carbon fix round, A-02): THIS pass's decision reads go through rawRead, not lsGet - lsGet reads a THROWN read as an absent key, and deciding what is absent is this pass's whole job: a transient throw on a legacy field used to read as 'legacy no longer holds it', the parity check below agreed, and the marker committed with that field never copied. undefined here means UNKNOWN, and every decision below treats it as 'not migrated - retry next boot', the fail-safe the commit's own comment already states. (The verified fill writes keep their lsSet/lsGet read-backs: a thrown read-back already fails those closed.)
  const migMark = migGet(rk.mig); if (migMark === undefined) return false; if (migMark !== null) return true; // the move committed on an earlier boot - the slot is never re-examined against legacy again
  const legSides = migGet(LEGACY_KEYS.sides); if (legSides === undefined) return false; if (legSides === null) return true; // nothing legacy to move
  let prog = {};
  try { const rawProg = migGet(rk.migfill); if (rawProg === undefined) return false; if (rawProg) { const p = JSON.parse(rawProg); if (p && typeof p === 'object' && !Array.isArray(p)) prog = p; } } catch (e) { prog = {}; }
  let progDirty = false;
  const saveProg = () => { if (!progDirty) return true; const s = JSON.stringify(prog); if (!lsSet(rk.migfill, s) || lsGet(rk.migfill) !== s) return false; progDirty = false; return true; };
  for (const f of ROUTE_FIELDS) {
    const raw = migGet(LEGACY_KEYS[f]);
    if (raw === undefined) return false; // A-02: an unreadable legacy field blocks the pass - it is not an absent one
    if (raw === null) { if (f in prog) { delete prog[f]; progDirty = true; } continue; } // legacy no longer holds the field: its fill record is moot
    const slot = migGet(rk[f]); if (slot === undefined) return false;
    if (slot === null) { if (!lsSet(rk[f], raw) || lsGet(rk[f]) !== raw) return false; prog[f] = raw; progDirty = true; if (!saveProg()) return false; continue; } // fill the gap, verified, and record the fill as migration-owned before moving on
    if (f in prog && slot === prog[f]) { if (raw !== prog[f]) { if (!lsSet(rk[f], raw) || lsGet(rk[f]) !== raw) return false; prog[f] = raw; progDirty = true; if (!saveProg()) return false; } continue; } // migration's own earlier fill, and the legacy value has moved on (a fallback boot saved over it): re-copy, so the stale fill never becomes permanent
    if (f in prog) { delete prog[f]; progDirty = true; } // the slot value is NOT what migration wrote - someone else (a restore) owns it now; it wins, untouched
  }
  for (const f of ROUTE_FIELDS) { const lg = migGet(LEGACY_KEYS[f]); if (lg === undefined) return false; if (lg !== null) { const sl = migGet(rk[f]); if (sl === undefined || sl === null) return false; } } // parity before committing: every field legacy holds must now be present in the slot (A-02: a field that cannot be READ on either side blocks the commit - parity over unknowns is not parity)
  if (!saveProg()) return false;
  lsSet(rk.mig, '1'); // commit. If THIS write fails the next boot re-runs the pass (by then a no-op) and retries the marker - safe either way
  lsDel(rk.migfill); // the marker governs from here - the fill record has no further meaning. If this delete fails, the stale record is inert: the marker short-circuits every later call before the record is read
  return true;
}

/** @param {AnyPoint} a @param {AnyPoint} b @returns {number} */ function distM(a, b) { const dx = (a[1] - b[1]) * MLNG, dy = (a[0] - b[0]) * MLAT; return Math.hypot(dx, dy); }
const jDistM = distM; // the paint engine's name for the same two-point distance
/** @param {TrailPoint[]} trail @param {number[]} [trailSessions] @returns {TrailPoint[][]} */ function trailSegments(trail, trailSessions) { // Beta 1.99 (architecture Phase 2, C1): THE trail segment-acceptance rule, in exactly one place - a segment breaks when the gap exceeds 300 s, the jump exceeds 1000 m, or (when session markers are supplied) a recorded session start falls between the two points. trailKm and buildGpx consume this (drawTrail did too, until Beta 1.193 retired the drawn line); before 1.99 each carried its own copy and three audit rounds (1.70/1.71) had to force them back into agreement by hand. Pure: points in, segments (arrays of the same point references) out. The parameters deliberately keep buildGpx's names so its 1.73/1.74 pointer walk (C07/D01) moves VERBATIM: markers are walked with a pointer, and when a point steps BACKWARD below markers already passed, the pointer re-seeks before testing - chronological trails never re-seek, so the walk stays linear (drive143 X6/X7 parity, fixtures in tests/browser/selftest-trail-segments.mjs).
  trailSessions = trailSessions || [];
  const segs = []; let seg = []; let sessAt = 0;
  for (let i = 0; i < trail.length; i++) { const p = trail[i]; if (i > 0) { if (sessAt > 0 && trailSessions[sessAt - 1] > trail[i - 1][2]) { let lo = 0, hi = sessAt; while (lo < hi) { const mid = (lo + hi) >> 1; if (trailSessions[mid] <= trail[i - 1][2]) lo = mid + 1; else hi = mid; } sessAt = lo; } while (sessAt < trailSessions.length && trailSessions[sessAt] <= trail[i - 1][2]) sessAt++; } if (i > 0 && (p[2] - trail[i - 1][2] > 300 || distM(trail[i - 1], p) > 1000 || (sessAt < trailSessions.length && trailSessions[sessAt] <= p[2]))) { segs.push(seg); seg = []; } seg.push(p); }
  if (seg.length) segs.push(seg);
  return segs;
}
/** @param {TrailPoint[]} points @param {number} runStartMs @returns {TrailPoint[]} */ function trailWindow(points, runStartMs) { // Beta 1.193 (trail redesign): THE trail retention rule, in exactly one place - the trail keeps only the live run's points from its last TRAIL_WINDOW_S seconds. No live run (runStartMs 0) means no consumer exists and the window is empty. The window is anchored at the NEWEST point's own timestamp, not at wall-clock now: the fallback a crashed run leaves behind is the last 60 minutes of RECORDING, whenever the app happens to reopen. Points are chronological in every writer, but the anchor takes the maximum timestamp so a planted or crafted array cannot widen the window by disorder. Load, restore (app4) and the Start fence (app3) filter through here; the append path (acceptFix) evicts the same boundary inline, point by point.
  if (!runStartMs || !points.length) return [];
  const runSec = Math.floor(runStartMs / 1000);
  let newest = 0; for (const p of points) if (p[2] > newest) newest = p[2];
  const cut = Math.max(runSec, newest - TRAIL_WINDOW_S);
  return points.filter(p => p[2] >= cut);
}
/** @param {AnyPoint} p @param {AnyPoint} a @param {AnyPoint} b @returns {number} */ function ptSegM(p, a, b) { // metres from point p to segment a-b (the engine's helper)
  const ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, px = p[1] * MLNG, py = p[0] * MLAT;
  const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
  let t = L2 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}
/** @param {Date} d @returns {string} */ function fmtClock(d) { let h = d.getHours(), m = d.getMinutes(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ' ' + ap; }
/** @param {number} ms @returns {string} */ function fmtDur(ms) { const s = Math.round(ms / 1000); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return m + ' min'; return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; }
/** @param {LatLng[]} pts @returns {number} */ function segLenM(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += distM(pts[i - 1], pts[i]); return s; } // the APP-global segment length (plain distM) - workDoneM's progress math. NOT a duplicate of the paint engine's private segLenM inside the GLP closure, which sums jDistM for label/anchor geometry: different scope, different metric, both load-bearing (third audit's 'delete one' was wrong - removing this one broke the progress meter, drive141 F07b caught it)
// Toast (native dialogs are banned)
let toastTimer = 0;
// Toast placement (Beta 1.221, Andrew's bar: the pill must never sit on a
// control - "make those perfect"). No fixed offset can promise that: the
// dock stack's top rides at ~208px, the note banner's band sits above it,
// sheets and modals bring their own controls, and the pill's own height
// changes with its text. So the pill is placed by MEASUREMENT at fire
// time: it starts at its CSS floor and hops above anything it would
// cover - the app's interactive inventory below - until its band is
// clear, keeping a 6px gap. drive204 measures the result in the rendered
// page across every state a surviving toast can fire, day and night.
const TOAST_CLEAR_OF = ['#dock button', '#tabBar button', '#setMenu button', '#setMenu input', '#setMenu .swRow', '.sheet button', '#sheet .srow', '#mapNote', '#mapNote button', '#mapNote textarea', '#finModal .card', '#finModal button', '#createSheet button', '#createBar input', '#createBar button', '#selPop', '#selPop button', '#spdPill', '#nightBtn', '#centreBtn'];
/** @param {HTMLElement} t @returns {void} */ function placeToast(t) {
  t.style.bottom = ''; // back to the CSS floor; re-measured on every fire
  for (let hop = 0; hop < 8; hop++) {
    const r = t.getBoundingClientRect();
    // the resting (shown) band: the pill's rise transition may be partway
    // (a re-fire can land mid-fade of the previous pill), so read the LIVE
    // transform offset - the shown state always lands at offset 0
    let ty = 0;
    try { ty = new DOMMatrixReadOnly(getComputedStyle(t).transform).m42 || 0; } catch (e) { /* transform 'none' reads as 0 */ }
    const top = r.top - ty, bottom = r.bottom - ty;
    let raise = 0;
    for (const sel of TOAST_CLEAR_OF) document.querySelectorAll(sel).forEach(e => {
      if (e === t) return;
      const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
      if (!(b.width > 0 && b.height > 0) || cs.display === 'none' || cs.visibility === 'hidden') return;
      // An element running its entrance animation (the menuRise family)
      // starts at opacity 0 and 10px low, then rises into its resting
      // band - it counts as the obstruction it is BECOMING: never skip it
      // for the fade, and judge it by its resting top, not its first frame.
      let restTop = b.top;
      const rising = (e.getAnimations ? e.getAnimations() : []).some(a => a.animationName);
      if (cs.opacity === '0' && !rising) return;
      if (rising) { try { restTop = b.top - (new DOMMatrixReadOnly(cs.transform).m42 || 0); } catch (err) { /* keep the live top */ } }
      const ox = Math.min(r.right, b.right) - Math.max(r.left, b.left);
      if (ox > 0 && top < restTop + b.height && restTop < bottom) raise = Math.max(raise, bottom - restTop + 6);
    });
    if (!raise) return;
    t.style.bottom = (window.innerHeight - bottom + raise) + 'px';
  }
}
/** @param {string} msg @param {number} [ms] @returns {void} */ function toast(msg, ms) { const t = $('toast'); t.textContent = msg; placeToast(t); t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2400); }
// Storage — guarded; a failure is SHOWN, never silent
/** @returns {void} */ function flagStorage() { document.body.classList.add('storage-bad'); }
/** @param {string} k @returns {string | null} */ function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { flagStorage(); return null; } }
/** @param {string} k @param {string} v @returns {boolean} */ function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { flagStorage(); return false; } }
/** @param {string} k @returns {boolean} */ function lsDel(k) { try { localStorage.removeItem(k); return true; } catch (e) { flagStorage(); return false; } }
// ===== DEVICE PROFILE (Beta 1.230, Andrew) =====
// Andrew opened the beta on his Pixel 7 and found one set of settings serving
// every phone: marking a side green took about a second there while the
// iPhone's stronger chip hides the same cost. The profile grades THIS device
// by MEASURED render speed - never by model name (UA model strings lie, and
// the core/RAM hints are coarse and Chromium-only) - and, ON ANDROID ONLY,
// trades canvas resolution for speed when the measurements prove the device
// needs it. The one knob is the map canvas pixel ratio: the round's
// measurement (Pixel-class profile, throttled CPU, software GL) put a mark's
// repaint at ~3.1s of a ~7.6s mark-to-painted at ratio 2, falling to ~1.7s of
// ~4.5s at 1.25 - the ratio is the lever with a measured effect; the engine's
// per-mark geometry rebuild is shared, junction-correct machinery and is NOT
// forked per platform. Tiers: 0 full (ratio 2, today's exact behaviour),
// 1 mid (1.5), 2 low (1.25).
// TOTAL SEPARATION (Andrew, locked): the Android machinery - the fit rules
// (head.html's html.android rule, syncViewport's Android anchor in app4), the
// grading application, the reduced settings - activates ONLY on Android. On
// iPhone it does not run at all: dpBoot returns before the Android branch is
// entered (DP.entered stays false), no class is set, no sampler runs, no
// listener is attached, and dpPixelRatio() answers the literal 2 the map
// constructor always used. The grading machinery below the gate is
// platform-neutral code; everything it can CHANGE sits behind the gate.
// ANDREW'S EIGHT GRADING RULES, as built: (1) never a single measurement -
// the boot grade is the MEDIAN of at least 24 work frames, session grades
// are medians of the last 72; (2) the sampler times real work for the whole
// session - the grade is a living estimate, not a boot verdict; (3) a
// session change needs SUSTAINED evidence - two consecutive agreeing
// evaluations over full windows - plus a 45s minimum dwell between applied
// changes, so the tier cannot flap, and a pending upgrade is held to the
// latest verdict - an evaluation that stops supporting it cancels it, to be
// re-earned, never landed on stale measurements; (4) the default is FULL quality and the
// burden of proof is on slowness (the grade thresholds sit far past smooth:
// a window's median frame must exceed 26ms to leave full, 45ms to reach
// low); (5) the grade recovers when the phone recovers - an earned upgrade
// applies LIVE through map.setPixelRatio, no reload; (6) the stored record
// is only the starting hint - the fresh boot median judges the session
// within the first minute, and the record follows the session's sustained
// verdicts in both directions (a slowdown writes it at once under rule 8;
// a recovery, or sustained agreement with the applied tier, rewrites it
// once two consecutive evaluations agree), so a launch never inherits a
// grade the last session already disproved; (7) NO VISIBLE FLIPS - an earned
// change applies only when the map is fully idle (not moving, no pointer
// down, 600ms quiet since the last touch, no keyboard up), never
// mid-gesture or mid-mark; (8) UPGRADES ONLY MID-SESSION - live re-grading
// can only RAISE the tier during a session; a downgrade is written to the
// stored record and takes effect at the NEXT launch, judged there by the
// cold phone's fresh median together with the record (the boot grade may
// apply in either direction, inside its first-minute window, before work
// starts - after that window a pending downgrade is dropped, never
// applied late).
const DP_PLATFORM = (() => { try { const ua = (window.navigator && navigator.userAgent) || ''; if (/Android/i.test(ua)) return 'android'; if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'; if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1) return 'ios'; return 'other'; } catch (e) { return 'other'; } })(); // iPadOS asks for the desktop UA - a 'Macintosh' agent with a multi-touch screen is an iPad, never an Android
const DP_ANDROID = DP_PLATFORM === 'android';
const DP_TIERS = [{ pr: 2 }, { pr: 1.5 }, { pr: 1.25 }]; // the closed knob list: canvas pixel ratio per tier (0 full / 1 mid / 2 low)
const DP = { platform: DP_PLATFORM, entered: false, tier: 0, hint: 0, stored: -1, bootGrade: -1, booted: false, bootApplyUntil: 0, pending: -1, lastEvalTier: -1, agree: 0, lastApplyAt: 0, lastInteractAt: 0, pointerDown: false, renderSeen: false, hooked: false, samples: [] };
/** @returns {number} */ function dpPixelRatio() { return DP_ANDROID ? DP_TIERS[DP.tier].pr : 2; } // the map constructor's ratio: on Android the applied tier's, everywhere else the literal 2 the constructor carried through 1.229 (drive131's W1 reads it live)
/** @param {number[]} a @returns {number} */ function dpMedian(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
/** @param {number} ms @returns {number} */ function dpGradeOf(ms) { return ms <= 26 ? 0 : (ms <= 45 ? 1 : 2); } // median work-frame ms -> tier: full holds ~38fps+ through real render work; past 45ms the full-quality canvas is the strain the Pixel showed
/** @param {number} t @returns {void} */ function dpWriteStore(t) { if (DP.stored === t) return; DP.stored = t; try { lsSet(LS_GLOBAL.dp, JSON.stringify({ t, at: Date.now() })); } catch (e) { /* the hint is a cache of a measurement - a failed write costs nothing, the next evaluation rewrites it */ } }
/** @returns {void} */ function dpBootGrade() { // the launch judgment (rules 1 + 6): the fresh median of the boot's first draws grades the session; the stored hint only chose the starting tier while these frames accumulated
  DP.booted = true;
  const g = dpGradeOf(dpMedian(DP.samples));
  DP.bootGrade = g;
  dpWriteStore(g);
  if (g !== DP.tier) DP.pending = g; // either direction - this is the launch judging, before work starts; dpTryApply lands it at the first idle inside the window
}
/** @returns {void} */ function dpEvaluate() { // a session evaluation over the living window (rules 2 + 3 + 8)
  const w = DP.samples.slice(-72); if (w.length < 36) return;
  const cand = dpGradeOf(dpMedian(w));
  if (DP.pending >= 0 && DP.pending < DP.tier && cand > DP.pending) DP.pending = -1; // a pending upgrade lives only while the latest verdict supports it: an evaluation that stops supporting it cancels it (to be re-earned below), so an earned upgrade blocked by a gesture or the dwell can never land later on stale measurements
  if (cand < DP.tier) { // faster than the applied tier: two consecutive agreeing evaluations earn the upgrade (applied at idle by dpTryApply)
    if (DP.pending > DP.tier) DP.pending = -1; // fresh evidence acquits a pending boot downgrade
    if (DP.lastEvalTier === cand) DP.agree++; else { DP.lastEvalTier = cand; DP.agree = 1; }
    if (DP.agree >= 2) DP.pending = cand;
    if (DP.agree >= 2) dpWriteStore(cand); // the same sustained verdict refreshes the stored record: a session that recovered does not hand the next launch the stale slower hint it already disproved
  } else if (cand > DP.tier) { // slower: NEVER applied this session (rule 8) - the stored record carries it to the next launch's judgment
    DP.lastEvalTier = cand; DP.agree = 0; if (DP.pending < 0 || DP.pending >= DP.tier) DP.pending = -1;
    dpWriteStore(cand);
  } else { // evidence matches the applied tier: a pending boot downgrade is acquitted, and the agreement count runs on this candidate too
    if (DP.lastEvalTier === cand) DP.agree++; else { DP.lastEvalTier = cand; DP.agree = 1; }
    if (DP.pending > DP.tier) DP.pending = -1;
    if (DP.agree >= 2) dpWriteStore(cand); // sustained agreement with the applied tier also rewrites a stale slower record (the session that slowed, stored low, then recovered to its own tier)
  }
}
/** @returns {void} */ function dpTryApply() { // lands a pending tier, only at a fully idle moment (rule 7), inside its direction's window (rule 8), past the dwell (rule 3)
  if (DP.pending < 0) return;
  if (DP.pending === DP.tier) { DP.pending = -1; return; }
  const now = Date.now();
  if (DP.pending > DP.tier && now > DP.bootApplyUntil) { DP.pending = -1; return; } // a downgrade applies only as the launch judgment, inside the first minute - never late
  if (DP.lastApplyAt && now - DP.lastApplyAt < 45000) return; // minimum dwell between applied changes
  let idle = false;
  try { idle = typeof map !== 'undefined' && !!map && !map.isMoving() && !DP.pointerDown && (now - DP.lastInteractAt > 600) && !(document.body && document.body.classList.contains('kb')); } catch (e) { idle = false; }
  if (!idle) return;
  DP.tier = DP.pending; DP.pending = -1; DP.lastApplyAt = now;
  try { if (typeof map !== 'undefined' && map && typeof map.setPixelRatio === 'function') map.setPixelRatio(DP_TIERS[DP.tier].pr); } catch (e) { /* a map without the setter keeps the constructor's ratio; the tier still governs the next map built */ }
}
/** @returns {void} */ function dpSamplerStart() { // times REAL work only: a frame counts when the map rendered since the last frame or is moving - an idle screen earns no samples and can neither convict nor acquit
  let last = performance.now(), sinceEval = 0;
  const frame = now => {
    requestAnimationFrame(frame);
    const dt = now - last; last = now;
    if (document.hidden) return;
    let work = DP.renderSeen; DP.renderSeen = false;
    try { if (typeof map !== 'undefined' && map) { if (!DP.hooked) { DP.hooked = true; map.on('render', () => { DP.renderSeen = true; }); } if (map.isMoving()) work = true; } } catch (e) { /* the map is not up yet - frames before it exists are not work samples */ }
    if (!work || !(dt > 0) || dt > 1000) return; // a >1s frame is a stall or a tab switch, not a speed sample - it must not convict the device alone. The cap stands at 1s, not lower: the devices this profile exists for render their honest work frames in the hundreds of ms (the round's throttled QA starved its own boot grade at a 250ms cap - every boot frame was discarded as a 'stall' and the grade never landed), and hidden tabs are already excluded by the document.hidden check above
    DP.samples.push(dt); if (DP.samples.length > 240) DP.samples.splice(0, DP.samples.length - 240);
    sinceEval++;
    if (!DP.booted) { if (DP.samples.length >= 24) dpBootGrade(); }
    else if (sinceEval >= 30) { sinceEval = 0; dpEvaluate(); }
  };
  requestAnimationFrame(frame);
}
/** @returns {void} */ function dpBoot() {
  window.__dp = DP; // the diagnostic handle: the QA profiles and drives read the profile's state here (entered / tier / samples), the same way they read the app's other live state
  if (!DP_ANDROID) return; // TOTAL SEPARATION: off Android the branch is never entered - no class, no sampler, no listeners, no stored hint read
  DP.entered = true;
  document.documentElement.classList.add('android'); // the fit rules' gate (head.html): the class exists only where the Android branch ran
  let hint = 0;
  try { const raw = lsGet(LS_GLOBAL.dp); if (raw) { const o = JSON.parse(raw); if (o && (o.t === 1 || o.t === 2)) hint = o.t; } } catch (e) { /* a corrupt hint is no hint - full quality stands */ }
  DP.hint = hint; DP.tier = hint; DP.stored = hint; DP.bootApplyUntil = Date.now() + 60000;
  const down = () => { DP.pointerDown = true; DP.lastInteractAt = Date.now(); };
  const up = () => { DP.pointerDown = false; DP.lastInteractAt = Date.now(); };
  document.addEventListener('pointerdown', down, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
  document.addEventListener('touchstart', down, { capture: true, passive: true }); document.addEventListener('touchend', up, { capture: true, passive: true });
  document.addEventListener('wheel', () => { DP.lastInteractAt = Date.now(); }, { capture: true, passive: true });
  dpSamplerStart();
  setInterval(dpTryApply, 500);
}
dpBoot();
const RAW_READ_FAILED = {}; // Beta 1.136 (programme F): rawRead's failure sentinel - a unique object no stored value can equal, so a THROWN read is distinguishable from an absent key (getItem's null), which lsGet deliberately cannot tell apart
/** @param {string} k @returns {string | Object | null} */ function rawRead(k) { try { return localStorage.getItem(k); } catch (e) { return RAW_READ_FAILED; } } // Beta 1.136 (programme F): the ONE raw storage read for the backup paths - they read RAW by design (Beta 1.48, audit B04) and each caller keeps its own failure mode against the sentinel: the strict export aborts (null/undefined), the recovery export skips the field, the restore stops before writing // Beta 1.63 (audit F03): deletions report like writes - a failed removeItem used to be invisible while saveStart claimed success
// Storage outcomes (Beta 1.101, architecture Phase 3 / C2): every save-family function
// returns ONE shape - { ok, failedKey, retryPending } - so no caller ever has to guess
// what a save did. failedKey names the first record that failed (null on success);
// retryPending says a retry is armed in the dirty machinery. The raw layer below this
// contract stays primitive (lsSet/lsDel report a boolean, lsGet returns null); the
// contract lives in the save family (saveAll, saveStart, saveSnap, saveTrail, saveSess)
// and everything above it. Storage code never speaks to the user - messaging belongs
// to the app layer (saveAllWarned in app2).
/** @returns {StorageOutcome} */ function storeOk() { return { ok: true, failedKey: null, retryPending: false }; }
/** @param {string | null} failedKey @param {boolean} [retryPending] @returns {StorageOutcome} */ function storeFail(failedKey, retryPending) { return { ok: false, failedKey: failedKey || null, retryPending: !!retryPending }; }
// Verified writes + the transaction coordinator (Beta 1.102, architecture Phase 4 / C3).
// txSet/txDel are the ONLY verified-write shapes: a write earns trust by reading back
// (a delete by reading back absent). runTx runs a step list - { name, write, undo },
// each returning a Phase 3 result - in order; the first failing write stops the
// transaction and every completed step is undone in REVERSE order, each undo attempted
// even if an earlier undo fails. Outcome: 'committed', 'rolled-back', or 'degraded'
// (a rollback step itself failed - the stored records may disagree, which is the one
// outcome that changes what the user must be told). The flows (finishRun,
// restoreBackup) keep their own message texts and select them from (outcome,
// failedStep) exactly as they selected them from their hand-built gates before.
// Beta 1.141 (Package A, DA-03): a failed verification is two different events and
// the result now says which - failKind 'write' (the lsSet/lsDel call itself failed:
// the write provably never landed, so the step's prior state stands untouched) vs
// 'verify' (the write returned success but the read-back disagreed: the write may
// have landed, so the state is unknown until restored). runTx therefore undoes the
// FAILING step too - first, as the newest write - and verifies that undo like any
// other; a failing step whose undo cannot be verified makes the outcome 'degraded',
// never a clean 'rolled-back'. The one exception is a 'write'-kind failure: nothing
// landed, there is nothing to undo, and an undo write against the same failing
// storage would only muddy the verdict. A failure carrying no failKind (a
// hand-built step) is treated as 'verify' - fail-safe. runTx's result carries the
// failing write's failKind alongside failedStep. Fixture-proven in
// tests/browser/selftest-tx.mjs, including the landed-write/lying-read-back shape.
/** @param {string} key @param {string} value @returns {TxStorageOutcome} */ function txSet(key, value) { if (!lsSet(key, value)) return Object.assign(storeFail(key, true), { failKind: 'write' }); return lsGet(key) === value ? storeOk() : Object.assign(storeFail(key, true), { failKind: 'verify' }); }
/** @param {string} key @returns {TxStorageOutcome} */ function txDel(key) { if (!lsDel(key)) return Object.assign(storeFail(key, true), { failKind: 'write' }); return rawRead(key) === null ? storeOk() : Object.assign(storeFail(key, true), { failKind: 'verify' }); } // Beta 1.141 verify cycle 1: a delete verifies through rawRead, never lsGet - lsGet reads a THROWN read as absent, so an unverifiable delete could claim success; through rawRead the thrown read is the RAW_READ_FAILED sentinel, a 'verify' failure like any other disagreement
/** @param {TxStep[]} steps @returns {TxOutcome} */ function runTx(steps) {
  const done = [];
  for (const st of steps) {
    const r = st.write();
    if (!r.ok) {
      let degraded = false;
      if (r.failKind !== 'write' && !st.undo().ok) degraded = true; // the failing step is undone first - unless its write provably never landed
      for (let i = done.length - 1; i >= 0; i--) { if (!done[i].undo().ok) degraded = true; }
      return { outcome: degraded ? 'degraded' : 'rolled-back', failedStep: st.name, failKind: r.failKind || null };
    }
    done.push(st);
  }
  return { outcome: 'committed', failedStep: null };
}
/** @param {number} startMs @param {number} lastStartedMs @param {boolean} boardEmpty @returns {string} */ function finishReconcileAction(startMs, lastStartedMs, boardEmpty) { if (!startMs || !lastStartedMs || startMs !== lastStartedMs) return 'none'; return boardEmpty ? 'complete' : 'rollback'; } /** @param {HistoryEntry} entry @param {PiecesMap} P @param {PieceTimesMap} T @param {string[]} names @returns {boolean} */ function finishBoardMatch(entry, P, T, names) { if (!entry || !entry.sides || typeof entry.sides !== 'object' || !entry.sides.p || typeof entry.sides.p !== 'object') return false; const EP = entry.sides.p, ET = entry.sides.t && typeof entry.sides.t === 'object' ? entry.sides.t : {}; for (const n of names) { const ep = EP[n], cp = P[n]; if (!Array.isArray(ep) || !Array.isArray(cp) || ep.length !== cp.length) return false; for (let i = 0; i < ep.length; i++) if (ep[i] !== cp[i]) return false; const et = Array.isArray(ET[n]) ? ET[n] : [], ct = T && Array.isArray(T[n]) ? T[n] : [], lim = Math.max(et.length, ct.length); for (let i = 0; i < lim; i++) { const a = Array.isArray(et[i]) ? et[i] : null, b = Array.isArray(ct[i]) ? ct[i] : null; if ((a ? a[0] || null : null) !== (b ? b[0] || null : null) || (a ? a[1] || null : null) !== (b ? b[1] || null : null)) return false; } } return true; } /** @param {number | null} markerRun @param {number} markerAt @param {number} lastRunId @param {boolean} boardEmpty @param {boolean} boardMatch @returns {string} */ function finishReconcileNoRunAction(markerRun, markerAt, lastRunId, boardEmpty, boardMatch) { if (markerRun !== 0 || !markerAt || !lastRunId || markerAt !== lastRunId || boardEmpty || !boardMatch) return 'none'; return 'rollback'; } // pure - fixture-proven in tests/browser/selftest-tx.mjs. Beta 1.104 (round 103, CG-103-02): the second argument is the newest archive entry's run identity (its runId), NOT its startedAt - strict equality on the identity is the whole contract // pure - fixture-proven in tests/browser/selftest-tx.mjs. Beta 1.146 (census C1): the no-run reconciliation's exactness witness - the loaded board still equals the archive entry's own snapshot (entry.sides, buildSnap's deep copy of pieces/pieceTimes) exactly: pieces elementwise, stamp pairs normalized to [string|null, string|null] so the loader's sanitize round-trip (sparse holes and JSON nulls both read as null) cannot false-mismatch. Any doubt reads as NO match (fail-closed: nothing is removed). // pure - fixture-proven in tests/browser/selftest-tx.mjs. Beta 1.146 (census C1): the NO-RUN interrupted finish's signature - the finclean marker of a run-less finish (run: 0, at: the finish time) and the newest entry's runId carrying that same at (finishRun stamps it), the board still holding the archived work exactly. An empty board means the finish completed (the entry stands; completeFinishCleanup owns the marker); anything missing or mismatched means nothing happens.
/** @param {string | null} raw @param {*} fb @returns {*} */ function parseJ(raw, fb) { if (raw == null) return fb; try { const v = JSON.parse(raw); return v == null ? fb : v; } catch (e) { return fb; } }
// ===== SETTINGS (Beta 1.111, settings redesign) =====
// One GLOBAL key, additive - no existing data migrates and nothing else reads
// it. It holds the Settings redesign's PERSISTENT device-behaviour toggles
// (vibration, chime on/off, chime sound). Defaults: ALL toggles OFF (features
// that change device behaviour - vibration, sound - start off until Andrew
// flips them; the approved mockups showed switches ON as state examples,
// not default decisions); only the chime's sound pick defaults, to Two-Tone.
// A corrupt or partial stored value falls back per-field to the defaults.
// Beta 1.112 (Andrew): 'awake' (Keep screen awake) is NOT persistent - it is
// session-only in-memory state, always OFF at a cold open, and it is
// deliberately absent from the stored record and from SETTINGS_DEF; a 1.111
// record that still carries an awake field is simply never read for it, and
// saveSettings never writes it. Documented in docs/STORAGE-SCHEMA.md
// (DEVELOPMENT_RULES section 4).
const SETTINGS_KEY = 'snowroute.v2.settings';
const CHIME_KEYS = ['bell', 'two', 'rising', 'pop', 'melody'];
const SETTINGS_DEF = { vib: false, chime: false, chimeSound: 'two' };
/** @returns {SettingsState} */ function loadSettings() {
  const raw = parseJ(lsGet(SETTINGS_KEY), null);
  /** @type {SettingsState} */ const s = { vib: SETTINGS_DEF.vib, chime: SETTINGS_DEF.chime, chimeSound: SETTINGS_DEF.chimeSound };
  if (raw && typeof raw === 'object') {
    if (typeof raw.vib === 'boolean') s.vib = raw.vib;
    if (typeof raw.chime === 'boolean') s.chime = raw.chime;
    if (CHIME_KEYS.indexOf(raw.chimeSound) >= 0) s.chimeSound = raw.chimeSound;
  }
  s.awake = false; // Beta 1.112 (Andrew): screen-awake is SESSION-ONLY - forced OFF at every load, whatever any stored record says; the On-the-job toggle flips this in-memory field for the session only
  return s;
}
let settings = loadSettings();
/** @returns {boolean} */ function saveSettings() { return lsSet(SETTINGS_KEY, JSON.stringify({ vib: settings.vib, chime: settings.chime, chimeSound: settings.chimeSound })); } // only the persistent three - settings.awake is never written (Beta 1.112)
// Tap guard — 400 ms per control
const tapLast = {};
/** @param {string} key @returns {boolean} */ function tapGuard(key) { const now = Date.now(); if (tapLast[key] && now - tapLast[key] < 400) return false; tapLast[key] = now; return true; }

// ===== STRETCHES — stitch each street, cut at junctions (checklist SS1) =====
/** @param {string} name @param {RoadsMap} [roads] @returns {LatLng[][]} */ function stitchRuns(name, roads) { // Beta 1.144 (Package C, DA-02/C1): a street's segments chained into their CONNECTED RUNS - the pre-1.144 stitchLine growth (exact endpoint equality, same scan order, same concat operations) repeated per component, so a street whose segments form several disconnected runs (non-adjacent sector picks at create; genuinely split streets) keeps EVERY run instead of only the one connected to segment 0. Run 1 is byte-identical to the old stitchLine output for any street; a fully connected street has exactly one run and nothing changes anywhere.
  const segs = (roads || ROADS)[name].map(s => s.slice());
  const used = new Array(segs.length).fill(false);
  /** @type {(p: LatLng, q: LatLng) => boolean} */ const eq = (p, q) => p[0] === q[0] && p[1] === q[1];
  const runs = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    let line = segs[s0].slice(); used[s0] = true;
    for (let guard = 0; guard < segs.length + 2; guard++) {
      let grew = false;
      for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue;
        const s = segs[i], a = s[0], b = s[s.length - 1], L0 = line[0], L1 = line[line.length - 1];
        if (eq(a, L1)) { line = line.concat(s.slice(1)); } else if (eq(b, L1)) { line = line.concat(s.slice(0, -1).reverse()); }
        else if (eq(b, L0)) { line = s.slice(0, -1).concat(line); } else if (eq(a, L0)) { line = s.slice(1).reverse().concat(line); }
        else continue;
        used[i] = true; grew = true;
      }
      if (!grew) break;
    }
    runs.push(line);
  }
  return runs;
}
/** @param {string} name @param {RoadsMap} [roads] @returns {LatLng[]} */ function stitchLine(name, roads) { return stitchRuns(name, roads)[0]; } // the first run - the pre-1.144 meaning, kept for callers that need a street's principal line
/** @param {LatLng[]} pts @param {number[]} cum @param {LatLng} p @returns {{ d: number, off: number }} */ function projOnLine(pts, cum, p) { // nearest projection: {d: distance along line, off: metres off line}
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
/** @param {LatLng[]} pts @param {number[]} cum @param {number} d0 @param {number} d1 @returns {LatLng[]} */ function sliceLine(pts, cum, d0, d1) {
  const out = [];
  /** @type {(d: number) => LatLng} */ const at = d => { for (let i = 1; i < pts.length; i++) { if (d <= cum[i] || i === pts.length - 1) { const span = cum[i] - cum[i - 1] || 1; const t = Math.max(0, Math.min(1, (d - cum[i - 1]) / span)); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; } } return pts[pts.length - 1]; };
  out.push(at(d0));
  for (let i = 0; i < pts.length; i++) if (cum[i] > d0 && cum[i] < d1) out.push(pts[i]);
  out.push(at(d1));
  return out;
}
/** @param {LatLng[]} line @param {number[]} cum @param {number} total @param {number[]} cuts @returns {LatLng[][]} */ function finishJunctionCuts(line, cum, total, cuts) { // Beta 1.131 (maintainability programme N2): the ONE junction-cut finishing policy - sort the candidate cuts, merge cuts closer than 15 m into one, drop cuts within 12 m of either end, then slice the line at the surviving bounds. BOTH cutters finish through here: computeStretches (junctions = the route's own streets) and the create flow's sector cutter crStreetParts (junctions = the prepared extract). The junction SOURCES stay distinct by design; only this finishing policy is shared, with its exact inequalities and merge order - the pieces it returns are identical to the pre-1.131 duplicated blocks (identity proven in the 1.131 comparison harnesses).
  cuts.sort((a, b) => a - b);
  const merged = [];
  for (const c of cuts) { if (merged.length && c - merged[merged.length - 1] < 15) continue; merged.push(c); }
  const inner = merged.filter(c => c >= 12 && c <= total - 12);
  const bounds = [0, ...inner, total];
  const parts = [];
  for (let i = 1; i < bounds.length; i++) parts.push(sliceLine(line, cum, bounds[i - 1], bounds[i]));
  return parts;
}
/** @type {StretchMap} */ const STRETCH = {};
/** @param {RoadsMap} roads @returns {StretchMap} */ function computeStretches(roads) { // Beta 1.117: the stretch builder as a PURE function of a roads object - the pre-1.117 eval-time IIFE, parameterized. buildGeometry fills the live STRETCH from it on every load; backup/restore (app4's packGeometry) builds a non-active pack's geometry from it without touching the live one (F6). Beta 1.144 (Package C, DA-02/C1): the builder runs PER RUN (stitchRuns) - each run is cut at the junctions ITS OWN line meets (other streets' vertices from ALL their runs; a street never cuts itself), the street's parts are the runs' parts concatenated in run order, and total is the SUM over runs, so a disconnected street is tracked whole: marking, totals and pace all see every metre that was saved. line/cum keep the first run (the principal line) for the readers that need a single line (fly-to centres); runs carries {line, cum, total, parts} per run for the consumers that must see them all (coverage samples, the paint engine). For a single-run street every field is exactly the pre-1.144 value.
  /** @type {StretchMap} */ const out = {};
  const runsOf = {}, totals = {};
  for (const n of Object.keys(roads)) {
    const runs = stitchRuns(n, roads).map(L => { const cum = [0]; for (let i = 1; i < L.length; i++) cum.push(cum[i - 1] + distM(L[i - 1], L[i])); return { line: L, cum, total: cum[cum.length - 1], parts: null }; });
    runsOf[n] = runs;
    totals[n] = runs.reduce((a, r) => a + r.total, 0);
  }
  for (const n of Object.keys(roads)) {
    const parts = [];
    for (const run of runsOf[n]) {
      const cuts = [];
      // Beta 1.152 (NV round, NV2): bounding-box prefilter, mirroring crStreetParts (create-pick.js). A foreign vertex outside this run's bbox grown by the margin projects more than 4 m from every segment of the run - the bbox uses the same flat-earth axes as projOnLine's metre space, and the margin is the same 12 m crStreetParts uses - so skipping it cannot change the cuts, and finishJunctionCuts sorts the survivors: the output is identical (parity pinned by selftest-nv1152 digests). Without it this loop is the full street-x-vertex cross product (490,000 projections measured on a 50-street x 200-point grid, 5.2 s).
      let bw = Infinity, bs = Infinity, be = -Infinity, bn = -Infinity;
      for (const p of run.line) { if (p[0] < bs) bs = p[0]; if (p[0] > bn) bn = p[0]; if (p[1] < bw) bw = p[1]; if (p[1] > be) be = p[1]; }
      const mLat = 12 / MLAT, mLng = 12 / MLNG;
      for (const m of Object.keys(roads)) {
        if (m === n) continue;
        for (const mr of runsOf[m]) for (const v of mr.line) { if (v[0] < bs - mLat || v[0] > bn + mLat || v[1] < bw - mLng || v[1] > be + mLng) continue; const pr = projOnLine(run.line, run.cum, v); if (pr.off <= 4) cuts.push(pr.d); }
      }
      run.parts = finishJunctionCuts(run.line, run.cum, run.total, cuts);
      for (const p of run.parts) parts.push(p);
    }
    const r0 = runsOf[n][0];
    out[n] = { line: r0.line, cum: r0.cum, total: totals[n], parts, runs: runsOf[n] };
  }
  return out;
}
/** @param {RoadsMap} roads @returns {RouteBox | null} */ function computeRouteBox(roads) { // the roads' bounding box, or null for an empty pack (no route baked in: pre-load there is no box at all)
  let w = 1e9, s = 1e9, e = -1e9, n = -1e9, any = false;
  for (const nm of Object.keys(roads)) for (const seg of roads[nm]) for (const p of seg) { any = true; w = Math.min(w, p[1]); e = Math.max(e, p[1]); s = Math.min(s, p[0]); n = Math.max(n, p[0]); }
  return any ? { w, s, e, n } : null;
}
const STREETNAMES = [];
const names = STREETNAMES; // the paint engine's name for the street list

// ===== STATE =====
const STREETSET = new Set();
/** @param {RoutePack} pack @returns {void} */ function buildGeometry(pack) { // Beta 1.117 (F1): ALL route geometry is (re)built HERE, per load, from the pack - nothing route-shaped is computed at script eval any more. The live containers (ROADS/REFERENCE/STRETCH/STREETNAMES/STREETSET/PRIMARIES/SPOT, app2's routeBox and ROUTE_TILE_NAMES, app3's SAMPLES) are refilled IN PLACE, never rebound, so references captured earlier (GL_HOST's plain entries above all) stay valid. Runs BEFORE loadRouteState: the state sanitizers filter against this geometry. buildSamples (app3) and the paint engine's rebuild (GLP.rebuildRoute, called by loadRoute) complete the per-load rebuild.
  const roads = (pack && pack.roads) || {}, reference = (pack && pack.reference) || {};
  for (const k of Object.keys(ROADS)) delete ROADS[k]; Object.assign(ROADS, roads);
  for (const k of Object.keys(REFERENCE)) delete REFERENCE[k]; Object.assign(REFERENCE, reference);
  const built = computeStretches(ROADS);
  for (const k of Object.keys(STRETCH)) delete STRETCH[k]; Object.assign(STRETCH, built);
  STREETNAMES.length = 0; for (const n of Object.keys(ROADS)) STREETNAMES.push(n);
  STREETSET.clear(); for (const n of STREETNAMES) STREETSET.add(n);
  PRIMARIES.clear(); for (const n of ((pack && pack.primaries) || [])) if (STREETSET.has(n)) PRIMARIES.add(n);
  for (const k of Object.keys(SPOT)) delete SPOT[k]; Object.assign(SPOT, (pack && pack.spot) || {});
  routeBox = computeRouteBox(ROADS);
  ROUTE_TILE_NAMES.length = 0; ROUTE_TILE_NAMES.push(...((pack && pack.tileNames && pack.tileNames.length) ? pack.tileNames : STREETNAMES));
  buildSamples();
}
// Beta 1.76: state loads when a route is CHOSEN, not at script eval - before
// that, the globals below sit at their empty defaults and nothing route-shaped
// is read, drawn, or offered. loadRoute (app4) resolves the pack, this loads
// its slot. The load body is the pre-1.76 eval-time block VERBATIM (same
// sanitizers, same order), wrapped.
let doneSet = new Set(), doneTimes = {}, doneVia = {}, notes = {}, history = [], runStart = 0, trail = [], trailSessions = [], coveredIdx = {}, pieces = {}, pieceTimes = {};
/** @param {HistoryEntry[]} list @param {HistoryEntry} entry @returns {HistoryEntry[]} */ function appendHistory(list, entry) { return [...list, entry]; } // Beta 1.167 (run/pace fix round, B1 - Andrew's requirement, run/pace audit RP-03/RP-01): THE HISTORY CAP IS GONE. Through 1.166 the archive was capped at 10 cleans per route - trimHistory (save), trimHistoryForFinish (finish) and capHistoryList (load + app4's restore) enforced one eviction rule (oldest non-full first, else oldest overall) at four points, and clean #11 silently erased an older clean; an interrupted finish at the cap could lose the evicted clean for good even though the finish itself rolled back. All four points are retired together: this append never drops, saveHistory writes history whole, loadRouteState below keeps everything its (linear) sanitizer passes, and app4's pushField stores a backup's history whole. The 1.152 NV round's crafted-oversize protection (NV4) is re-homed, not lost: the quadratic trim it defended against no longer exists, every remaining history consumer is linear (the load sanitizer, the save stringify, the pace render, the backup scan), and an oversize planted value is bounded by localStorage's own quota and the restore's verified write set. Retention is fixture-proven in tests/browser/selftest-history.mjs, the cap's absence in selftest-nv1152.mjs, and both at page level in drive177/drive186.
let histRawList = null, histRawView = null; // 2026-11-15 (denylist fix round, A-05): the load-time history snapshot - histRawList is the raw stored array (the second parse in loadRouteState), histRawView runs parallel to it: the view entry each raw entry produced at load, or null when the sanitizer dropped it. Writers persist historyForWrite(...), never the bare view: a load-time strip is a view, never a write (the rule dropPhantom already honours for its rollback write).
/** @param {HistoryEntry[]} list @returns {HistoryEntry[]} */ function historyForWrite(list) { // 2026-11-15 (A-05): the array a history writer may persist. Raw entries the sanitizer dropped ride back verbatim (invisible in the view, undeletable from it, still storage's); surviving entries are written in their RAW form - entries are never mutated after load (deletes splice the array, finishes append), so raw is the stored truth and the strip never becomes permanent; entries appended since load ride at the end, in view order. A surviving entry missing from `list` was deleted by the user this session and stays deleted. No snapshot (no load ran for this slot, or the route was unloaded): the list is the whole truth and is written as-is.
  if (!histRawList || !histRawView) return list;
  const alive = new Set(list); const seen = new Set(); const out = [];
  for (let i = 0; i < histRawList.length; i++) { const v = histRawView[i]; if (v == null) { out.push(histRawList[i]); continue; } seen.add(v); if (alive.has(v)) out.push(histRawList[i]); }
  for (const h of list) if (!seen.has(h)) out.push(h);
  return out;
}
/** @returns {void} */ function resetHistorySnapshot() { histRawList = null; histRawView = null; } // 2026-11-15 (A-05): unloadRouteToBoot (app4) calls this when it empties the route state - the snapshot dies with the route it describes, and a stale one must never merge into another route's slot. A call, not a foreign write: app4 never assigns app1's bindings directly (the foreign-write census discipline).
/** @returns {boolean} */ function saveHistory() { return lsSet(LS.hist, JSON.stringify(historyForWrite(history))); } // Beta 1.63 (audit F04): the delete-clean handler branches on this. Beta 1.167 (B1): no trim on the way out - history is written whole, however long it grows
let startDirty = false; // Beta 1.92 (deep audit F05): a failed start write/delete arms this retry, walked by the flushAux heartbeat until it lands - a stale start key must never resurrect a finished run on the next boot
let snapDirty = false; // Beta 1.94 (deep audit SR-193-02): the same retry discipline for the persisted pre-Start snapshot (saveSnap, app3) - a failed snapshot write is retried by flushAux until it lands
/** @returns {StorageOutcome} */ function saveStart() { const ok = runStart ? lsSet(LS.start, String(runStart)) : lsDel(LS.start); startDirty = !ok; return ok ? storeOk() : storeFail('start', true); } // Beta 1.57: reports its result like every other write, for the saveAll contract
/** @param {string} n @returns {boolean} */ function streetComplete(n) { const p = pieces[n]; if (!Array.isArray(p)) return doneSet.has(n); return p.every(v => v === 3); }
/** @param {*} raw @param {number} count @returns {PieceTimePair[]} */ function sanitizePieceTimes(raw, count) { // Beta 1.64 (audit F07): only [stringOrNull, stringOrNull] pairs survive - a nested string used to reach applyPiece and throw under strict mode. Accepts the array shape the app writes and the numeric-keyed object a JSON round-trip of a sparse structure can produce. Beta 1.70 (audit A06): indexes are bounded by the street's real stretch count - a corrupt key like 10000 used to inflate a sparse array to that length (~50 KB of nulls per street, worse for larger keys).
  /** @type {(pr: *) => PieceTimePair} */ const pair = pr => Array.isArray(pr) ? [typeof pr[0] === 'string' ? pr[0] : null, typeof pr[1] === 'string' ? pr[1] : null] : [null, null];
  const lim = Number.isInteger(count) && count > 0 ? count : 0;
  const out = [];
  if (Array.isArray(raw)) { const n = Math.min(raw.length, lim); for (let i = 0; i < n; i++) out[i] = pair(raw[i]); return out; }
  if (raw && typeof raw === 'object') { for (const k of Object.keys(raw)) { const i = Number(k); if (Number.isInteger(i) && i >= 0 && i < lim) out[i] = pair(raw[k]); } return out; }
  return out;
}

// ===== THE ROUTE BOARD MODULE (Arch-2, 2026-11-19) =====
// The board (pieces, pieceTimes, doneSet, doneTimes, doneVia, coveredIdx -
// declared above) has ONE owner: this module. Emptying, capture, restore,
// serialise, load and the field rules live here and nowhere else; the other
// parts call these operations instead of reassigning the bindings or
// rebuilding the snapshot shape by hand (through Arch-1 the empty reset was
// written out in five places, the snapshot literal in six, and the field
// rules twice - as load repair below and as validateSnap's reject rules).
// Two semantics stay DISTINCT by design, over one shared set of per-field
// rules (sanitizePieceTimes, the 0..3 side clamp, the parseable-stamp
// standard): load REPAIRS a stored board into the closest honest state;
// validateSnap REJECTS a snapshot whole on any violation. Storage keys and
// formats are untouched - every string this module produces is byte-identical
// to the hand-built string it replaces.
function validateSnap(raw, expectAt, G) { // Beta 1.95 (deep audit SR-194-03): a persisted cancel snapshot is DATA FROM STORAGE, not trusted state - it earns application only by passing the same structural rules the loader enforces (every street present at its true stretch count, side values 0..3 only, stamp pairs of null-or-parseable strings, known street names everywhere, coverage indexes inside the street's samples). 1.94 checked only the stamp and the object-ness of two fields, then assigned the stored structures raw: an injected {Velmar:[99]} became the live board and was saved onward, destroying a valid mark. Any violation rejects the WHOLE snapshot (never a partial application); the caller falls back to the stamp journal. Returns a normalized deep copy, or null. Beta 1.117 (F6): the geometry it validates against is a parameter (G = {set, names, stretch, samples}) defaulting to the LIVE route's - backup/restore pass the TARGET pack's geometry (app4's packGeometry), so a snapshot belonging to a non-active route is judged by its own streets, not the open one's.
  const set = G ? G.set : STREETSET, names = G ? G.names : STREETNAMES, stretch = G ? G.stretch : STRETCH, samples = G ? G.samples : SAMPLES;
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (raw.at !== expectAt) return null;
    const P = raw.pieces, T = raw.pieceTimes, D = raw.done, TM = raw.times, V = raw.via, C = raw.cov;
    if (!P || typeof P !== 'object' || Array.isArray(P)) return null;
    if (!T || typeof T !== 'object' || Array.isArray(T)) return null;
    if (!Array.isArray(D)) return null;
    if (!TM || typeof TM !== 'object' || Array.isArray(TM)) return null;
    if (!V || typeof V !== 'object' || Array.isArray(V)) return null;
    if (!C || typeof C !== 'object' || Array.isArray(C)) return null;
    for (const k of Object.keys(P)) if (!set.has(k)) return null;
    for (const k of Object.keys(T)) if (!set.has(k)) return null;
    const pieces = {}, pieceTimes = {};
    for (const n of names) {
      const arr = P[n];
      if (!Array.isArray(arr) || arr.length !== stretch[n].parts.length) return null;
      for (const v of arr) if (v !== 0 && v !== 1 && v !== 2 && v !== 3) return null;
      pieces[n] = arr.slice();
      const tn = T[n];
      if (tn !== undefined && (!tn || typeof tn !== 'object')) return null; // a stamp record that is not a structure at all rejects the snapshot
      pieceTimes[n] = sanitizePieceTimes(tn, stretch[n].parts.length); // the LOADER'S OWN sanitizer is the shape authority (it produces the array form the live state carries, accepting the numeric-keyed object form too) - the first 1.95 draft hand-rolled an object-only assumption and rejected every genuine snapshot; strictness lives in the structural checks around this call, not in a parallel shape
    }
    for (const n of names) { for (const pr of pieceTimes[n]) { if ((pr[0] !== null && isNaN(Date.parse(pr[0]))) || (pr[1] !== null && isNaN(Date.parse(pr[1])))) return null; } } // Beta 1.96 (SR-195-04): the sanitizer keeps any STRING stamp; the loader's standard for time values is a parseable date, so an unparseable stamp rejects the snapshot like an unparseable completion time below
    const done = [];
    for (const d of D) { if (typeof d !== 'string' || !set.has(d)) return null; if (!done.includes(d)) done.push(d); }
    const times = {}, via = {};
    for (const k of Object.keys(TM)) { if (!set.has(k) || typeof TM[k] !== 'string' || isNaN(Date.parse(TM[k]))) return null; times[k] = TM[k]; } // Beta 1.96 (deep audit SR-195-04): the VALUE must be a real date too - the loader itself deletes completion times that fail Date.parse (app1), so a snapshot carrying one asserts a state the loader would not honour
    for (const k of Object.keys(V)) { if (!set.has(k) || typeof V[k] !== 'string') return null; via[k] = V[k]; }
    const cov = {};
    for (const k of Object.keys(C)) {
      if (!set.has(k) || !samples[k] || !Array.isArray(C[k])) return null;
      const arr = [];
      for (const i of C[k]) { if (!Number.isInteger(i) || i < 0 || i >= samples[k].length) return null; arr.push(i); }
      cov[k] = arr;
    }
    return { pieces, pieceTimes, done, times, via, cov };
  } catch (e) { return null; }
}
const BOARD = {
  /** @returns {{pieces: *, pieceTimes: *, doneSet: *, doneTimes: *, doneVia: *, coveredIdx: *}} */ state() { return { pieces, pieceTimes, doneSet, doneTimes, doneVia, coveredIdx }; }, // the live bindings as one object - GL_HOST's pieces getter reads through this, so the engine always sees the current binding after a restore or reset
  validate: validateSnap, // the reject-semantics entry, under the module's roof (the global function above keeps the drives' compatibility surface)
  /** @returns {*} */ capture() { // the pre-Start snapshot (startClean, app3): pieces/pieceTimes/cov deep-copied, done array-copied, times/via shallow-copied - the copy depths are the semantics Cancel relies on, kept exactly
    return { pieces: JSON.parse(JSON.stringify(pieces)), pieceTimes: JSON.parse(JSON.stringify(pieceTimes)), done: [...doneSet], times: { ...doneTimes }, via: { ...doneVia }, cov: JSON.parse(JSON.stringify(coveredIdx)) };
  },
  /** @param {*} snap @param {number} at @returns {*} */ snapshotObject(snap, at) { // the one snapshot-object shape ({at, pieces, pieceTimes, done, times, via, cov}, key order fixed): REFERENCES into the source, no copy - snapForExport and the backup builders return exactly this
    return { at, pieces: snap.pieces, pieceTimes: snap.pieceTimes, done: snap.done, times: snap.times, via: snap.via, cov: snap.cov };
  },
  /** @param {*} snap @param {number} at @returns {string} */ serialiseSnap(snap, at) { return JSON.stringify(BOARD.snapshotObject(snap, at)); }, // saveSnap's persisted string and the restore's re-serialised snapshot
  /** @param {*} snap @returns {void} */ restore(snap) { // apply a normalized snapshot whole (cancelStart, both branches): the six bindings are replaced from the snapshot, done re-set from its array
    pieces = snap.pieces; pieceTimes = snap.pieceTimes; doneSet = new Set(snap.done); doneTimes = snap.times; doneVia = snap.via; coveredIdx = snap.cov;
  },
  /** @returns {void} */ rederive() { // THE board invariant, one home: doneSet is derived from pieces, and times/via are pruned to the streets that are complete. loadSides' tail and cancelStart's journal fallback both land here.
    doneSet = new Set(STREETNAMES.filter(streetComplete));
    for (const k of Object.keys(doneTimes)) if (!doneSet.has(k)) delete doneTimes[k];
    for (const k of Object.keys(doneVia)) if (!doneSet.has(k)) delete doneVia[k];
  },
  /** @param {number} startMs @returns {void} */ revertRunMarks(startMs) { // cancelStart's journal fallback, whole: revert ONLY sides stamped at or after the run's start (anything older is pre-Start progress and is not this run's to erase), re-derive, and drop coverage - it cannot be attributed without a snapshot, and unlike hand marks it is GPS-derived and re-earns itself as he drives; drive143 C1 holds this line
    for (const n of STREETNAMES) { const P = pieces[n], T = pieceTimes[n] || {}; for (let i = 0; i < P.length; i++) { const st = T[i] || [null, null]; if ((P[i] & 1) && st[0] && Date.parse(st[0]) >= startMs) { P[i] &= ~1; st[0] = null; } if ((P[i] & 2) && st[1] && Date.parse(st[1]) >= startMs) { P[i] &= ~2; st[1] = null; } } }
    BOARD.rederive();
    coveredIdx = {};
  },
  /** @returns {void} */ zeroMarks() { // the in-place empty (Clear, Finish): pieces zeroed per street - the pieces object itself is KEPT, only its per-street arrays are replaced - and the completion/coverage bindings rebound empty. The run's own state (notes, runStart, suggestions) is the caller's to clear.
    for (const n of STREETNAMES) { pieces[n] = STRETCH[n].parts.map(() => 0); pieceTimes[n] = {}; }
    doneSet = new Set(); doneTimes = {}; doneVia = {}; coveredIdx = {};
  },
  /** @returns {void} */ emptyBoard() { // the rebind empty (unloadRouteToBoot): all six bindings replaced with the eval empties - pieces/pieceTimes become {} and their identity is dropped, unlike zeroMarks. Notes/history/run state are the caller's.
    doneSet = new Set(); doneTimes = {}; doneVia = {}; coveredIdx = {}; pieces = {}; pieceTimes = {};
  },
  /** @returns {void} */ clearNotesAndCoverage() { notes = {}; coveredIdx = {}; }, // completeFinishCleanup's board part: a committed finish's leftover notes/coverage clear once its verified writes land
  /** @returns {{sides: string, done: string, times: string, via: string, cov: string}} */ serialiseLive() { // the live board's stored strings, one construction: saveAll writes them as the primary save and the recovery export reads them verbatim
    return { sides: JSON.stringify({ p: pieces, t: pieceTimes }), done: JSON.stringify([...doneSet]), times: JSON.stringify(doneTimes), via: JSON.stringify(doneVia), cov: JSON.stringify(coveredIdx) };
  },
  /** @returns {string} */ serialiseCov() { return JSON.stringify(coveredIdx); }, // flushAux's throttled coverage write
  /** @returns {*} */ sidesCopy() { return JSON.parse(JSON.stringify({ p: pieces, t: pieceTimes })); }, // buildSnap's archived sides: a deep copy in the stored {p, t} shape
  /** @returns {*} */ clearedSides() { // finishRun's transaction input: the zeroed sides maps a committed finish writes as the cleared authority
    const p = {}, t = {};
    for (const n of STREETNAMES) { p[n] = STRETCH[n].parts.map(() => 0); t[n] = {}; }
    return { p, t };
  },
  /** @returns {void} */ loadDoneMeta() { // loadRouteState segment 1 (repair): the stored done set and its times/via, per-field sanitized
    const _doneRaw = parseJ(lsGet(LS.done), []);
    doneSet = new Set(Array.isArray(_doneRaw) ? _doneRaw.filter(n => typeof n === 'string' && STREETSET.has(n)) : []); // audit D2: a non-array value (legacy object, number) made new Set() throw and killed the boot; loadSides re-derives this from pieces below regardless
    doneTimes = parseJ(lsGet(LS.times), {});
    if (!doneTimes || typeof doneTimes !== 'object' || Array.isArray(doneTimes)) doneTimes = {}; // Beta 1.64 (audit F07): normalize BEFORE the cleanup loop below - a stored JSON string made its `delete` throw under strict mode and killed the boot
    for (const k of Object.keys(doneTimes)) { if (typeof doneTimes[k] !== 'string' || isNaN(Date.parse(doneTimes[k]))) delete doneTimes[k]; }
    doneVia = parseJ(lsGet(LS.via), {});
    if (!doneVia || typeof doneVia !== 'object' || Array.isArray(doneVia)) doneVia = {};
    for (const k of Object.keys(doneVia)) { if (typeof doneVia[k] !== 'string') delete doneVia[k]; } // 2026-11-15 (load sanitizer round, A-01): via values get the doneTimes treatment above - the app writes only strings here ('gps'/'tap'/'sides'; validateSnap enforces the same string standard on cancel snapshots), so a non-string value can only arrive via a crafted restore or planted storage; every consumer compares === 'gps', and an unchecked value would otherwise be re-saved verbatim and ride backups
  },
  /** @returns {void} */ loadCoverage() { // loadRouteState segment 2 (repair): the stored coverage indexes, bounded to the street's real samples
    coveredIdx = parseJ(lsGet(LS.cov), {});
    if (!coveredIdx || typeof coveredIdx !== 'object' || Array.isArray(coveredIdx)) coveredIdx = {};
    for (const n of Object.keys(coveredIdx)) { if (!SAMPLES[n] || !Array.isArray(coveredIdx[n])) { delete coveredIdx[n]; continue; } coveredIdx[n] = coveredIdx[n].filter(i => Number.isInteger(i) && i >= 0 && i < SAMPLES[n].length); } // audit D1: was upper-bound only - negatives, fractions and text values survived and each inflated the coverage count. Beta 1.76: this pass used to sit at script eval in app3, over the state the old eval-time load had just parsed; now that state loads on route pick, the pass lives here, over the data it just loaded (the eval-time copy saw an empty object and sanitized nothing).
  },
  /** @returns {void} */ loadSides() { // loadRouteState segment 3 (repair): the stored sides become the live board - values clamped to the 0..3 the app writes, a missing street derived from the done set, complete streets' done-times inherited into their side stamps, and times/via pruned to complete streets (the rederive invariant, applied after inheritance)
    pieces = {}; pieceTimes = {};
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
      if (streetComplete(n) && doneTimes[n]) { // Beta 1.169 (Carbon fix round, A-03): the done-time inheritance fills MISSING stamps, not only wholly-empty maps - through 1.168 a partially-recorded street (one stretch stamped, the next not) kept its holes, and liveWorkM read the unstamped stretches as never worked, undercounting the run's side-metres. A recorded stamp is never overwritten; a missing one inherits the street's done time exactly as the empty-map case always has.
        const full = pieces[n].map(v => [v & 1 ? doneTimes[n] : null, v & 2 ? doneTimes[n] : null]);
        if (!Object.keys(pieceTimes[n]).length) pieceTimes[n] = full;
        else { const T2 = pieceTimes[n], out = []; for (let i = 0; i < full.length; i++) { const cur = T2[i]; out[i] = [(cur && cur[0]) || full[i][0], (cur && cur[1]) || full[i][1]]; } pieceTimes[n] = out; }
      }
    }
    for (const k of Object.keys(doneTimes)) if (!streetComplete(k)) delete doneTimes[k];
    for (const k of Object.keys(doneVia)) if (!streetComplete(k)) delete doneVia[k];
  },
};
let routeLoaded = false, activeRoute = null; // Beta 1.76: set by loadRoute (app4) once a pack is chosen; app2's paint/render gates read them
/** @param {string} id @returns {void} */ function loadRouteState(id) {
  LS = migrateLegacyRoute(id) ? { ...routeKeys(id), ...LS_GLOBAL } : { ...LEGACY_KEYS, ...LS_GLOBAL };
BOARD.loadDoneMeta(); // Arch-2: the board's load-repair lives in the module (BOARD.loadDoneMeta / loadCoverage / loadSides)
notes = parseJ(lsGet(LS.notes), {});
// Notes model (production): {street: [{k:'note', at, text} | {k:'car'|'hazard'|'missed'|'salt', at}]} - normalize at load:
// a non-array value (e.g. a legacy string) is dropped, entries keep only object shapes with a string kind,
// a string text when one is present, and a parseable date string at when one is present (2026-11-15, A-02 -
// an object text rendered '[object Object]' in note lines and a bad at rendered 'NaN:NaN AM' flag times).
if (!notes || typeof notes !== 'object' || Array.isArray(notes)) notes = {};
Object.keys(notes).forEach(n => { if (!STREETSET.has(n) || !Array.isArray(notes[n])) delete notes[n]; else notes[n] = notes[n].filter(f => f && typeof f === 'object' && typeof f.k === 'string' && (f.text === undefined || typeof f.text === 'string') && (f.at === undefined || (typeof f.at === 'string' && !isNaN(Date.parse(f.at))))); });
const _histText = lsGet(LS.hist);
history = parseJ(_histText, []);
const rawHistory = parseJ(_histText, []); // Beta 1.170 (Carbon fix round Phase 2, A-04): a SECOND parse of the same text - the sanitizer below mutates the surviving entries in place, so the reconciliation at the end of this load needs its own untouched copy of the stored array (see reconcileInterruptedFinish).
// History (production): chronological (oldest first); items is a street->time MAP (legacy array entries migrate to it).
// Sanitized at load: real entries only, real streets only, times null or parseable - anything else is dropped, never crashes.
if (!Array.isArray(history)) history = [];
// 2026-11-15 (denylist fix round, A-05): the sanitizer runs as ONE indexed pass over the parsed array - the same predicates and the same items rewrite as the filter/map/filter it replaces, in the same order - and records the A-05 snapshot as it goes: histRawList is the raw parse (rawHistory below, the same text parsed twice, so index i is the same entry in both), histRawView[i] is the view entry raw entry i produced, or null when the pass dropped it. The view the user works with is unchanged; the snapshot is what lets the writers keep the strip a view (historyForWrite).
histRawList = Array.isArray(rawHistory) ? rawHistory : [];
histRawView = [];
{ const _view = [];
  for (let i = 0; i < history.length; i++) {
    const h = history[i]; let v = null;
    if (h && typeof h === 'object' && !Array.isArray(h) && !isNaN(Date.parse(h.at)) && h.items && typeof h.items === 'object') {
      const m = {};
      if (Array.isArray(h.items)) { for (const n of h.items) if (typeof n === 'string' && STREETSET.has(n)) m[n] = (h.times && typeof h.times[n] === 'string' && !isNaN(Date.parse(h.times[n]))) ? h.times[n] : null; }
      else { for (const n of Object.keys(h.items)) { const t = h.items[n]; if (STREETSET.has(n) && (t === null || (typeof t === 'string' && !isNaN(Date.parse(t))))) m[n] = t; } }
      h.items = m;
      if (Object.keys(m).length > 0) v = h;
    }
    histRawView.push(v);
    if (v) _view.push(v);
  }
  history = _view;
}
// Beta 1.167 (B1): NO load cap (through 1.166 this line trimmed a planted oversize history to the writers' 10 with the linear capHistoryList). History is retained whole now; the sanitizer above is linear in the stored size, so a planted oversize array costs one linear pass and is bounded by the storage quota itself - and the quadratic trim such an array used to threaten no longer exists (appendHistory).
// Run start (production): epoch milliseconds, stored as a bare digit string (NOT JSON).
runStart = 0;
try { const s = lsGet(LS.start); runStart = (typeof s === 'string' && /^\d+$/.test(s) && isFinite(+s) && +s >= 946684800000 && +s <= 4102444800000) ? +s : 0; } catch (e) { runStart = 0; } // Beta 1.150 (security-audit fix round, finding restore-start-scalar-unvalidated, loader half): the stored start is parsed as strictly as the restore now validates it - a digit string inside the epoch-ms band. The old '+lsGet(...) || 0' coerced a crafted '1' into a live phantom run (and 'Infinity' into an endless one) whose Cancel wiped the route; every other epoch this loader accepts is band-checked the same way (trail sessions and trail points, below)
trail = parseJ(lsGet(LS.trail), []);
trailSessions = parseJ(lsGet(LS.sess), []); // Beta 1.71 (audit B02): the epoch-second start of each clean that recorded trail points - the session identity the flat trail never carried, so exports can split cleans exactly instead of guessing from gaps. Pre-1.71 trails simply have no markers and keep the gap heuristic.
trailSessions = Array.isArray(trailSessions) ? [...new Set(trailSessions.filter(t => Number.isFinite(t) && t >= 946684800 && t <= 4102444800))].sort((a, b) => a - b) : [];
if (trailSessions.length > TRAIL_MAX) trailSessions = trailSessions.slice(trailSessions.length - TRAIL_MAX); // Beta 1.152 (NV round, NV4): no writer cap exists for session markers (one is appended per clean run start, noteSessionStart in app3) - the load bounds them at the trail's own cap, keeping the newest (the list is sorted ascending here). Every consumer is linear (the day list, the load-notice count), so this is a storage bound, sized to the structure it describes.
// Trail (production): [lat, lng, epochSeconds] triples; out-of-range or impossible points are dropped at load (SEC-9a bounds).
trail = Array.isArray(trail) ? trail.filter(p => Array.isArray(p) && p.length === 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]) && p[2] >= 946684800 && p[2] <= 4102444800 && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180) : [];
if (trail.length > TRAIL_MAX) trail = trail.slice(trail.length - TRAIL_MAX);
const trailBeforeWindow = trail.length; trail = trailWindow(trail, runStart); if (trail.length !== trailBeforeWindow) markDirty('trail'); if (trailBeforeWindow > 0 && !trail.length && !runStart && trailSessions.length) { trailSessions = []; markDirty('sess'); } // Beta 1.193 (trail redesign): the window binds at load like everywhere else - a 1.190-era resident trail (every clean, up to the old point cap) is cut to the live run's last 60 minutes on the first 1.191 boot, and with no live run it empties: the fallback has no run to protect. runStart was parsed above (line order is load-bearing: the start record is read before the trail for exactly this). The binding is STORED, not just in memory: a shortened trail is marked dirty so the next flush writes the windowed value (a backup reads storage raw - it must never carry points the window forbids), and when the window empties a trail that EXISTED with no live run, its session markers go with it - markers never outlive their trail (the C-01 pair rule, applied at load; a live run keeps its markers, its own start among them). The clear is scoped to the window's own act (trailBeforeWindow > 0): markers stored with NO trail at all are not the window's business - the migration and restore layers govern those (C-01/C06), and clearing them here would eat records those layers legitimately carry (the slot migration's copied sess field - drive145 N12d caught exactly that in this round's first gate). // Beta 1.152 (NV round, NV4): the writer caps the trail at TRAIL_MAX by dropping the OLDEST points (recordFix, app3) - the load keeps the same end of the same cap, so a planted slot cannot resurrect an unbounded trail.
BOARD.loadCoverage();
BOARD.loadSides();
  reconcileInterruptedFinish(rawHistory); // Beta 1.102 (Phase 4, CG-196-04): resolve a finish that died between its gates before anything renders this state. Beta 1.170 (A-04): it judges the RAW stored array, not the sanitized one above
  completeFinishCleanup(); // Beta 1.141 (Package A, DA-10): complete a committed finish's metadata cleanup if its writes failed and a reload outlived the in-memory retry
}
/** @param {HistoryEntry[]} rawHistory @returns {void} */ function reconcileInterruptedFinish(rawHistory) { // a finish killed mid-transaction runs no rollback; its two harmful prefixes share one signature in EXISTING records - the newest archive entry belongs to the run still marked active (its runId === the stored start; a later run's start is a later millisecond, so no live state collides). Board still marked: the archive write was the only gate that landed - remove that entry (verified) and the run resumes intact. Board already cleared: the finish effectively happened - delete the start key (verified) and it stands committed. No signature: nothing to do. An under-3 finish writes no archive, so its prefixes look exactly like a fresh empty run - coherent as one, left alone. Beta 1.104 (round 103, CG-103-02): the signature key is the entry's runId, never startedAt - startedAt is the real work start and predates the stored start whenever a street was marked before Start was pressed, which used to defeat both branches; entries written before 1.104 carry no runId and are never reconciled (missing identity = no signature). Beta 1.146 (census C1): the NO-RUN finish (marked board, never Started) gets the parallel signature below - its entry's runId is the finish's own finclean marker time (finishRun stamps it), so a kill between the archive and sides gates is resolvable exactly the same way: marker run 0 + entry runId === marker at + the board still equalling the entry's snapshot removes the phantom entry (verified write first; the marker is cleared only after that removal verifies, so a failed removal leaves the full signature for the next boot); an empty board means that finish completed and its entry stands.
  // Beta 1.170 (Carbon fix round Phase 2, A-04): the signature is judged on the RAW newest entry and a rollback writes the raw array minus its tail. Through 1.169 both read the load-SANITIZED array, with two consequences: a newest entry the sanitizer dropped (a pack edit stripped every street it named) hid its interrupted finish from reconciliation entirely - the run start stayed live over a finish that had in fact archived - and a rollback that did fire wrote the sanitized array back, persisting the sanitizer's strips over entries storage was still holding raw.
  const rawList = Array.isArray(rawHistory) ? rawHistory : [];
  const rawLast = rawList.length ? rawList[rawList.length - 1] : null;
  const last = history.length ? history[history.length - 1] : null;
  if (!last && !rawLast) return;
  const sig = (rawLast && typeof rawLast === 'object' && !Array.isArray(rawLast)) ? rawLast : last; // a raw tail that is not an entry object can carry no run identity - the sanitized tail stands in for it
  const lastMs = sig && sig.runId ? (+sig.runId || 0) : 0; // Beta 1.104 (CG-103-02): the entry's run identity; an entry without one yields 0 and can never match a run start. Beta 1.146: in the no-run branch below this same value must equal the finclean marker's at
  const boardEmpty = STREETNAMES.every(n => pieces[n].every(v => v === 0));
  const dropPhantom = () => { // the verified rollback write: storage loses the signature entry only (when the signature came from the raw array, everything else storage holds stays byte-for-byte - a load-time strip is a view, never a write); memory drops the phantom too when the sanitized tail IS that entry (same run identity), and needs no drop when the sanitizer already removed it
    const src = (sig === rawLast && rawLast !== null) ? rawList : history;
    if (!txSet(LS.hist, JSON.stringify(src === rawList ? src.slice(0, -1) : historyForWrite(src.slice(0, -1)))).ok) return false; // Beta 1.250 (cross-audit fix round, N-03): the FALLBACK branch (raw tail not an entry object, so the signature stands in the sanitized view) used to write the bare view slice - permanently stripping every raw entry the sanitizer had dropped the moment this write landed, if the page closed before an ordinary save could restore them. It now writes the historyForWrite merge like every other history writer (A-05): the phantom, a surviving entry missing from the slice, stays deleted; the dropped raw entries ride back verbatim
    if (src === rawList && histRawList === rawList) { histRawList.pop(); histRawView.pop(); } // 2026-11-15 (A-05): the A-05 snapshot pops in step with the raw array this write just shortened, so a later ordinary save cannot resurrect the phantom from the snapshot
    if (last && last.runId && +last.runId === lastMs) history = history.slice(0, -1);
    return true;
  };
  if (runStart) { const act = finishReconcileAction(runStart, lastMs, boardEmpty); if (act === 'rollback') { dropPhantom(); } else if (act === 'complete') { if (txDel(LS.start).ok) runStart = 0; } return; }
  const marker = parseJ(lsGet(LS.finclean), null); const markerRun = marker && typeof marker === 'object' && !Array.isArray(marker) ? marker.run : null; const markerAt = marker && typeof marker === 'object' ? (+marker.at || 0) : 0; const boardMatch = !boardEmpty && finishBoardMatch(sig, pieces, pieceTimes, STREETNAMES);
  if (finishReconcileNoRunAction(markerRun, markerAt, lastMs, boardEmpty, boardMatch) === 'rollback') { if (dropPhantom()) txDel(LS.finclean); }
}
/** @returns {void} */ function completeFinishCleanup() { // Beta 1.141 (Package A, DA-10): finishRun's transaction writes the slot's finclean record as its first step, so a COMMITTED finish whose post-commit metadata writes then failed (notes/coverage refuse; the primaryDirty retry is in-memory and dies with the page) leaves a DURABLE obligation behind. This completes it at load. Guards, all required: the obligation exists; no run is live (a live run owns notes/coverage - its data is never touched); the loaded board is the cleared board a committed finish leaves (a restored or cancelled live board is non-empty and untouchable). The cleanup is two verified writes of the same '{}' saveAll writes for a finished board; only when BOTH verify do the in-memory copies clear and the obligation delete. Any failure leaves the obligation (and the loaded state, which then matches storage) for the next load - idempotent, safe on every load, a single read on a clean slot.
  if (runStart) return;
  if (lsGet(LS.finclean) === null) return;
  if (!STREETNAMES.every(n => pieces[n].every(v => v === 0))) return;
  if (!txSet(LS.notes, '{}').ok) return;
  if (!txSet(LS.cov, '{}').ok) return;
  BOARD.clearNotesAndCoverage(); suggested = new Set(); sugQueue = [];
  txDel(LS.finclean);
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
/** @param {number} ms @param {number} lat @param {number} lng @returns {SunTimes} */ function sunTimes(ms, lat, lng) { // the sun events of the position-local day containing ms, as epoch ms
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
  /** @type {(isRise: boolean) => (number | null)} */ const one = isRise => {
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
/** @returns {number[]} */ function themePos() { try { if (typeof lastGood !== 'undefined' && lastGood && lastGood.ll) return lastGood.ll; } catch (e) {} try { if (typeof routeBox !== 'undefined' && routeBox) return [(routeBox.s + routeBox.n) / 2, (routeBox.w + routeBox.e) / 2]; } catch (e) {} return [43.82, -79.57]; } // Beta 1.92 (deep audit F01): lastGood/routeBox are declared LATER in the assembled script - a bare typeof probe throws in the temporal dead zone during early boot (initTheme runs before they exist), which killed the boot outright when a stored override had no usable expiry. The probes are guarded so the fixed fallback below is actually reachable.
/** @param {number} ms @returns {boolean} */ function autoNightAt(ms) { const p = themePos(), st = sunTimes(ms, p[0], p[1]); if (!st || st.rise == null || st.set == null) return false; return ms >= st.set || ms < st.rise; }
/** @param {number} ms @returns {number} */ function nextSunBoundary(ms) { const p = themePos(), out = []; for (let d = 0; d <= 1; d++) { const st = sunTimes(ms + d * 86400000, p[0], p[1]); if (st) { if (st.rise != null) out.push(st.rise); if (st.set != null) out.push(st.set); } } const nx = out.filter(t => t > ms).sort((a, b) => a - b)[0]; return nx || ms + 12 * 3600000; }
/** @returns {boolean} */ function isNight() { return themeOverride !== null ? themeOverride : autoNightAt(Date.now()); }
/** @returns {void} */ function clearThemeOverride() { themeOverride = null; themeOverrideUntil = 0; lsDel(LS.night); lsDel(LS.nightExp); }
/** @param {boolean} night @returns {void} */ function setThemeOverride(night) { themeOverride = night; themeOverrideUntil = nextSunBoundary(Date.now()); const okNight = lsSet(LS.night, night ? '1' : '0'); const okExp = lsSet(LS.nightExp, String(themeOverrideUntil)); if (!okNight || !okExp) toast('Not saved - storage problem'); } // Beta 1.170 (Carbon fix round Phase 2, A-08): a failed write is SURFACED, per the storage layer's rule - through 1.169 both writes rode bare lsSet, whose only signal was the storage banner, while every sibling save path pairs its toast. The override itself still applies for this session (it lives in memory); what failed is only its persistence, and a reload that finds the flag without its expiry recomputes the boundary (Beta 1.92, F01).
/** @returns {void} */ function themeTick() { // the boundary hand-back, and the automatic cycle itself: if the effective theme no longer matches the screen, repaint
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
/** @returns {number} */ function workDoneM() { let s = 0; for (const n of STREETNAMES) { const p = pieces[n]; STRETCH[n].parts.forEach((part, i) => { const L = segLenM(part); if (p[i] & 1) s += L; if (p[i] & 2) s += L; }); } return s; }
/** @returns {number} */ function liveWorkM() { // Beta 1.93 (follow-up audit R06): the RUN's work only - sides stamped at or after Start. workDoneM counts the whole board, so marks made before Start used to inflate the live rate (real progress, wrong clock).
  if (!runStart) return 0; let s = 0;
  for (const n of STREETNAMES) { const p = pieces[n], T = pieceTimes[n] || {}; STRETCH[n].parts.forEach((part, i) => { const L = segLenM(part); const st = T[i] || [null, null]; if ((p[i] & 1) && st[0] && Date.parse(st[0]) >= runStart) s += L; if ((p[i] & 2) && st[1] && Date.parse(st[1]) >= runStart) s += L; }); }
  return s; }
/** @returns {number} */ function totalWorkM() { let s = 0; for (const n of STREETNAMES) s += STRETCH[n].total * 2; return s; }
// Beta 1.57 (Phase 2 storage integrity, external audit Section 7): saveAll has a
// failure CONTRACT now. The sides record is the AUTHORITY for completion - the
// boot block re-derives the done set from it and prunes times/via against it -
// so it is written FIRST: if it fails, the save stops and the previous coherent
// state survives whole. Every other write is checked too; the first failing
// record is named in the returned result's failedKey. Callers that warn go
// through saveAllWarned (app2), which raises one warning per failure episode;
// the finish transaction calls saveAll directly and does its own gated
// writes and messaging. (Beta 1.101, Phase 3: the old global failure key, the
// quiet toggle and the warned flag are retired - outcomes travel in the
// returned result, and messaging lives in the app layer.)
let primaryDirty = false; // Beta 1.94 (deep audit SR-193-05): a failed saveAll arms this flag and flushAux's heartbeat retries the primary save until it lands. Before 1.94 the heartbeat retried only the auxiliary records and the start key, so a failed metadata write (notes/times/via/done/history) waited for the next incidental save - while Finish's own message promised a retry nothing performed.
/** @returns {StorageOutcome} */ function saveAll() { // Beta 1.101 (Phase 3 / C2): returns the storage-outcome result - the first failing record is named in failedKey and a retry is armed via primaryDirty. No toast here: storage never speaks to the user (saveAllWarned in app2 owns the warning).
  if (restoring) return storeFail('restoring', false); // Beta 1.147 (hypothesis H1, CONFIRMED): while a restore's reload is pending the in-memory board is still the PRE-restore one, so any save here would resurrect it over the restored records - fenced exactly like flushAux below: no write, and NO primaryDirty arm, so no retry ever fires against the restored data. Callers branch on the outcome object as for any failed save.
  let failedKey = null;
  const ser = BOARD.serialiseLive(); // Arch-2: the board's stored strings are built once, in the module
  if (!lsSet(LS.sides, ser.sides)) failedKey = 'sides';
  else {
    if (!lsSet(LS.done, ser.done)) failedKey = 'done';
    if (!lsSet(LS.times, ser.times) && !failedKey) failedKey = 'times';
    if (!lsSet(LS.via, ser.via) && !failedKey) failedKey = 'via';
    if (!lsSet(LS.notes, JSON.stringify(notes)) && !failedKey) failedKey = 'notes';
    if (!lsSet(LS.hist, JSON.stringify(historyForWrite(history))) && !failedKey) failedKey = 'history'; // 2026-11-15 (A-05): the ordinary save writes the merge, never the bare view - the load strip stays a view
    if (!saveStart().ok && !failedKey) failedKey = 'start';
    if (!lsSet(LS.cov, ser.cov) && !failedKey) failedKey = 'coverage';
  }
  if (failedKey) { primaryDirty = true; return storeFail(failedKey, true); }
  primaryDirty = false;
  if (lsGet(LS.finclean) !== null) lsDel(LS.finclean); // Beta 1.141 (Package A, DA-10): a fully landed primary save discharges the finish-cleanup obligation - the stored notes/coverage ARE the in-memory ones now, whoever's they are; the obligation only ever outlives FAILED saves
  return storeOk();
}
// Dirty-flag access (Beta 1.101, Phase 3 / C2): the flags themselves stay storage-owned
// state in this file; code in app3/app4 arms, clears and reads them ONLY through these
// three functions, so the retry machinery has one doorway. Kinds: trail, sess, snap,
// start, aux, primary. (The episode-warning state is NOT one of these - it is app-layer
// messaging state and lives in app2 with saveAllWarned.)
/** @param {string} kind @returns {void} */ function markDirty(kind) { if (kind === 'trail') trailDirty = true; else if (kind === 'sess') sessDirty = true; else if (kind === 'snap') snapDirty = true; else if (kind === 'start') startDirty = true; else if (kind === 'aux') auxDirty = true; else if (kind === 'primary') primaryDirty = true; else if (kind === 'fixlog') fixlogDirty = true; }
/** @param {string} kind @returns {void} */ function markClean(kind) { if (kind === 'trail') trailDirty = false; else if (kind === 'sess') sessDirty = false; else if (kind === 'snap') snapDirty = false; else if (kind === 'start') startDirty = false; else if (kind === 'aux') auxDirty = false; else if (kind === 'primary') primaryDirty = false; else if (kind === 'fixlog') fixlogDirty = false; }
/** @param {string} kind @returns {boolean} */ function writePending(kind) { return kind === 'trail' ? trailDirty : kind === 'sess' ? sessDirty : kind === 'snap' ? snapDirty : kind === 'start' ? startDirty : kind === 'aux' ? auxDirty : kind === 'primary' ? primaryDirty : kind === 'fixlog' ? fixlogDirty : false; }
// Aux flush (production model): the trail JSON is the big write (~250 KB at cap) - at most every 45 s while
// recording, always when forced (page hide/close). Dirty flags clear ONLY when the write actually lands, so a
// failed write is retried by the next flush instead of silently dropping GPS points. While `restoring` is set
// (a restore is mid-flight), flushes are refused so the restore's reload cannot clobber the restored data.
let trailDirty = false, auxDirty = false, sessDirty = false, lastTrailSave = 0, restoring = false; // Beta 1.73 (audit C04/C05): sessDirty is the session markers' retry flag, same discipline as trailDirty - a failed marker write is retried by flushAux instead of being silently dropped
let fixlogDirty = false, lastFixLogSave = 0; // Beta 1.189: the raw fix log's retry flag and flush window, the trail's discipline exactly (saveFixLog itself lives in app3 beside the log it writes; flushAux probes for it like saveSnap)
/** @returns {StorageOutcome} */ function saveTrail() { const ok = lsSet(LS.trail, JSON.stringify(trail)); return ok ? storeOk() : storeFail('trail', true); }
/** @returns {StorageOutcome} */ function saveSess() { const ok = lsSet(LS.sess, JSON.stringify(trailSessions)); return ok ? storeOk() : storeFail('sess', true); }
// Beta 1.135 (maintainability programme D): the coverage write is THROTTLED. acceptFix calls
// flushAux on EVERY fix, and through 1.134 each call re-stringified the whole coverage map
// (~1 Hz for the length of a clean). Unforced flushes now write coverage at most once per
// COV_SAVE_MS; FORCED flushes (visibility hidden, pagehide, the route switch's pre-flush)
// always write, so nothing earned is ever held back at a moment that matters. The window
// starts only on a SUCCESSFUL write - a failed write leaves auxDirty set and the very next
// flush retries, exactly the flag discipline above. Between windows the 15 s heartbeat is
// the backstop, and saveAll still writes coverage unconditionally on every primary save.
// (COV_SAVE_MS itself is declared with the rule constants at the top of this file, Beta 1.136.)
let lastCovSave = 0; // the last successful coverage write (0 = never: the first flush writes at once)
/** @param {boolean} [force] @returns {void} */ function flushAux(force) {
  if (restoring) return;
  if (auxDirty && (force || Date.now() - lastCovSave >= COV_SAVE_MS) && lsSet(LS.cov, BOARD.serialiseCov())) { auxDirty = false; lastCovSave = Date.now(); }
  if (trailDirty && (force || Date.now() - lastTrailSave > TRAIL_FLUSH_MS) && saveTrail().ok) { trailDirty = false; lastTrailSave = Date.now(); }
  if (sessDirty && saveSess().ok) sessDirty = false;
  if (fixlogDirty && typeof saveFixLog === 'function' && (force || Date.now() - lastFixLogSave > TRAIL_FLUSH_MS) && saveFixLog().ok) { fixlogDirty = false; lastFixLogSave = Date.now(); } // Beta 1.189: the fix log flushes on the trail's cadence (its JSON is the same size family - re-stringifying it per fix is out); forced flushes always write, so a backup or page death never leaves it behind
  if (startDirty) saveStart(); // Beta 1.92 (audit F05): saveStart re-arms the flag itself on failure
  if (snapDirty && typeof saveSnap === 'function') saveSnap(); // Beta 1.94 (SR-193-02): the cancel snapshot retries on the same heartbeat (saveSnap lives in app3 beside runSnap; the typeof probe keeps this safe in any partial-load state)
  if (force && runStart && typeof persistRunDist === 'function') persistRunDist(true); // Beta 1.186 (storage fix round, P2): a FORCED flush is the page's last word (pagehide, visibility hidden, the route switch's pre-flush), so the run-distance counter banks with it. Through 1.185 flushAux never carried the counter, so a mid-run reload inside the throttle window resumed the stale banked figure and buildSnap baked it into the archived clean - the trail itself was always fully flushed; only the counter lagged. Beta 1.193 (counter hardening): the counter's own throttle is gone - persistRunDist banks on every recorded fix - so this forced bank is now a formality kept for the page-death path, and the mirror bank below rides EVERY flush, forced or not. The runStart gate matters: with no run in flight there is no counter to bank, and an ungated call would mint the zero record into the outgoing route's slot on every route switch - drive184's field-for-field round-trip caught exactly that.
  if (runStart && typeof bankRunDistMirror === 'function') bankRunDistMirror(); // Beta 1.193 (counter hardening): the counter's SECOND copy (LS.rundist2) is written only from this flush path - a different writer, trigger and cadence from persistRunDist's per-fix direct write, so the two records fail independently: a lost or clobbered primary (the 1.186 species) leaves the mirror intact and vice versa. It is coherent with the trail flushed beside it - both lag together, and a forced flush lands both. bankRunDistMirror lives in app3 beside the counter; the typeof probe mirrors the saveSnap line above.
  if (primaryDirty) saveAll(); // Beta 1.94 (SR-193-05): a failed primary save retries here - saveAll clears the flag itself when a save lands whole
}
setInterval(() => { flushAux(false); themeTick(); }, 15000); // Beta 1.77: the same 15 s heartbeat also walks the day/night cycle across its boundaries
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAux(true); });
window.addEventListener('pagehide', () => flushAux(true));

// Beta 1.103 (architecture Phase 6, C5): the paint engine's host. The engine
// (parts/engine.js) reads NOTHING from the app directly any more - every app
// value, helper, callback and piece of live state it consumes arrives
// through this one object (the engine aliases it as H; GLP.init(map, host)
// adopts the same object). Plain entries are the values themselves;
// group (c) - state the app REBINDS (pieces on load/restore, the
// selection on every tap, the active route on load) - is exposed through
// getters so the engine always reads the CURRENT binding, exactly as its
// old free-global reads behaved. glHideLabels is also behind a getter: it
// is declared in app2.js, after this part, and the getter resolves it at
// call time. Built here, at the end of app1.js, because the engine
// evaluates immediately after this part in the assembled page. Beta 1.117:
// the plain entries are the LIVE containers (PRIMARIES/SPOT/STRETCH/ROADS/names)
// - buildGeometry refills them in place per load, so the engine's captured
// references stay valid across a switch and GLP.rebuildRoute re-reads them.
// Guarded by tests/browser/selftest-engine-surface.mjs (the frozen list).
const GL_HOST = {
  MLAT, MLNG, PRIMARIES, SPOT, STRETCH, ROADS, names, jDistM, ptSegM, isNight,
  get pieces() { return BOARD.state().pieces; }, // Arch-2: read through the board module, so the engine sees the current binding after any restore/reset
  get selSet() { return selSet; },
  get selStretch() { return selStretch; },
  get activeRoute() { return activeRoute; },
  get glHideLabels() { return glHideLabels; },
};
