'use strict';
// ===== FRESH APP CORE: state, storage, geometry =====
/** @type {(id: string) => AppElement} */ const $ = id => document.getElementById(id);
const MLAT = 111320, MLNG = 80386;
/** @type {() => number} */ const vvHeight = () => (window.visualViewport ? window.visualViewport.height : window.innerHeight); // visible-screen height (shrinks when the phone keyboard opens)
const YELLOW = '#ffc233', RED = '#ef476f', GREEN = '#06d6a0';
const PRIMARIES = new Set(); // the pack's primary streets: filled per load by buildGeometry from pack.primaries (values live in the pack)
const SPOT = {}; // the active pack's label-anchor hints: filled per load by buildGeometry from pack.spot
const TRAIL_MAX = 8000;
const TRAIL_WINDOW_S = 3600; // the trail window (seconds): the trail is a distance fallback, keeping only the live run's last 60 minutes
const FIXLOG_MAX = 3600; // the fix log's cap: a debug capture behind the Settings switch (3,600 fixes = one hour at 1 Hz)
const FIXLOG_MAX_CHARS = 200000; // the character cap: 200,000 (this log), sized from the worst case (~46 chars/fix) with margin; the fix cap binds first
// a route = pack + its own slot; LS = the active route's slot, resolved before any state is read
// null-prototype: a '__proto__' street must land as an entry, not run the prototype setter and vanish
/** @type {RoadsMap} */ const ROADS = Object.create(null);
/** @type {RoadsMap} */ const REFERENCE = Object.create(null);
/** @param {string} id @returns {RouteKeys} */ function routeKeys(id) { const p = 'snowroute.' + id + '.'; return { done: p + 'v2', times: p + 'v2.times', hist: p + 'v2.history', notes: p + 'v4.notes', via: p + 'v4.via', trail: p + 'v4.trail', cov: p + 'v4.cov', start: p + 'v5.start', flip: p + 'v5.flip', sides: p + 'v5.sides', sess: p + 'v5.sess', pre: p + 'v5.preload', snap: p + 'v5.snap', mig: p + 'v2.migrated', migfill: p + 'v2.migfill', finclean: p + 'v5.finclean', rundist: p + 'v5.rundist', rundist2: p + 'v5.rundist2' }; } // Beta 1.94 (deep audit SR-193-02/03): two slot-local records join the layout - 'snap' is the running clean's persisted pre-Start board (Start writes it, Finish/Cancel delete it; transient, and not a ROUTE_FIELDS member - it rides backups only in normalized form, via snapForExport in app4, since Beta 1.96/1.97) and 'mig' is the legacy migration's explicit completion marker (see migrateLegacyRoute) and never a backup field. Beta 1.141 (Package A, DA-10): 'finclean' joins them on the same terms - the durable finish-cleanup obligation (finishRun's transaction writes it, saveAll's success discharges it, completeFinishCleanup completes it at load); transient, never backed up, not in ROUTE_FIELDS. Beta 1.150 (security-audit fix round): 'migfill' joins them on the same terms - the migration's per-field fill record (see migrateLegacyRoute); written only while a migration is incomplete, deleted when its marker commits. Beta 1.167 (run/pace fix round, B5): 'rundist' joins on the finclean terms WITHOUT any backup ride - the running clean's accumulated-distance record (app3's runDist), genuinely never backed up: Finish bakes its value into the archive entry's km, and a lost record re-derives from the surviving trail (RUNDIST.adopt, app3).
// lastArea pre-fills the area; fixlog + dp are device records (global, spanning routes); dp is never backed up
const LS_GLOBAL = { night: 'snowroute.v2.night', nightExp: 'snowroute.v2.nightExp', exp: 'snowroute.v5.export', prep: 'snowroute.prep.v1', lastArea: 'snowroute.v2.lastarea', fixlog: 'snowroute.v1.fixlog', dp: 'snowroute.v1.dp' };
const LEGACY_KEYS = { done: 'snowroute.v2', times: 'snowroute.v2.times', hist: 'snowroute.v2.history', notes: 'snowroute.v4.notes', via: 'snowroute.v4.via', trail: 'snowroute.v4.trail', cov: 'snowroute.v4.cov', start: 'snowroute.v5.start', flip: 'snowroute.v5.flip', sides: 'snowroute.v5.sides', sess: 'snowroute.v5.sess', pre: 'snowroute.5w.v5.preload', snap: 'snowroute.v5.snap', finclean: 'snowroute.v5.finclean', rundist: 'snowroute.v5.rundist', rundist2: 'snowroute.v5.rundist2' }; // Beta 1.193: 'rundist2' rides here on rundist's terms - the counter's second copy (bankRunDistMirror, app3), written only by the trail-flush path in PERSIST.flush below, never backed up; adoption reads it when the primary is lost (RUNDIST.adopt, app3). snap rides here too so LS.snap is defined on a legacy-fallback boot (the pre-1.76 app never wrote one - the key is simply absent there, which the cancel path already treats as 'no snapshot'); finclean rides for the same reason (Beta 1.141); rundist rides for the same reason (Beta 1.167, B5). Beta 1.254 (O-01): 'pre' rides too, naming the LIVE slot (routeKeys('5w').pre) - through 1.253 a fallback boot had LS.pre undefined, so the preload writer stored its record under a localStorage key literally named "undefined" and the readers read it back from there; the fallback session's preload record now lands where a later migrated boot looks for it
const ROUTE_FIELDS = ['done', 'times', 'hist', 'notes', 'via', 'trail', 'cov', 'start', 'flip', 'sides', 'sess'];
const PACK_FIELDS = ['name', 'area', 'primaries', 'spot', 'tileNames', 'box', 'roads', 'reference', 'ends']; // the one list of pack fields: normalizePack walks it; an absent field fails validation by construction
// ===== RULE CONSTANTS ===== every product-rule number lives here, named once; equal numbers for different policies stay separate constants
const COV_SAMPLE_M = 15; // coverage samples are laid along a street every this many metres (samplesFor, app3)
const COV_RADIUS_M = 22; // a GPS fix covers the samples within this radius of it (coverFix, app3)
const GPS_ACCURACY_M = 65; // worse fixes are rejected while a fresh good one exists: accept (<=) and reject (>) are one rule
const GPS_STILL_MPS = 0.5; // under this speed a fix is stopped: no distance or point banks from it (position is not gated)
const GPS_STALE_MS = 45000; // silence this long restarts the watch, running from the later of last fix and watch start
const TRAIL_FLUSH_MS = 45000; // the buffered trail write's flush interval (PERSIST.flush, below) - a STORAGE policy; see the fence above
const COV_SAVE_MS = 15000; // the coverage write's throttle window (PERSIST.flush below; declared here with the rule constants)
const PACK_NAME_MAX = 60, PACK_AREA_MAX = 60, PACK_STREET_NAME_MAX = 60; // the pack validator's per-field character caps (normalizePack, create.js) - separate constants per field, per the fence above
const PACK_STREETS_MAX = 300, PACK_SEGS_MAX = 80, PACK_SEG_PTS_MAX = 4000, PACK_POINTS_MAX = 150000; // the validator's shape caps: two of them are both 80 by coincidence - different policies, separate constants
const PACK_TILENAME_MAX = 80, PACK_TILENAMES_MAX = 400;
const PACK_BOX_MAX_DEG = 4, PACK_LENGTH_MAX_M = 12000000; // the validator's extent/length ceilings, sized ~7.6x/~4x above the measured maxima; the length ceiling bounds samplesFor
const PACK_TILES_MAX = 20000; // the tile-URL iteration budget: a worldwide-box pack is a boot wedge, not a route - enumeration terminates bounded
// a slot's backup keys as one list (ROUTE_FIELDS + the snapshot), for callers enumerating keys without field names
/** @param {string} id @returns {string[]} */ function slotKeys(id) { const rk = routeKeys(id); return ROUTE_FIELDS.map(f => rk[f]).concat(rk.snap); }
/** @type {Object.<string, string>} */ let LS = { ...routeKeys('5w'), ...LS_GLOBAL };
// 5W only: the marker (rk.mig) commits the migration; absent it, fills land only where the slot lacks
/** @param {string} id @returns {boolean} */ function migrateLegacyRoute(id) {
  if (id !== '5w') return true;
  const rk = routeKeys(id);
  const migGet = k => { const v = rawRead(k); return v === RAW_READ_FAILED ? undefined : v; }; // reads go through rawRead, not lsGet (throws read as absent there): unknown means retry next boot
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
    // migration's own fill, but the legacy value moved on: re-copy, so the stale fill never becomes permanent
    if (f in prog && slot === prog[f]) { if (raw !== prog[f]) { if (!lsSet(rk[f], raw) || lsGet(rk[f]) !== raw) return false; prog[f] = raw; progDirty = true; if (!saveProg()) return false; } continue; }
    if (f in prog) { delete prog[f]; progDirty = true; } // the slot value is NOT what migration wrote - someone else (a restore) owns it now; it wins, untouched
  }
  // parity before committing: every legacy field must be present in the slot; an unreadable field blocks it
  for (const f of ROUTE_FIELDS) { const lg = migGet(LEGACY_KEYS[f]); if (lg === undefined) return false; if (lg !== null) { const sl = migGet(rk[f]); if (sl === undefined || sl === null) return false; } }
  if (!saveProg()) return false;
  lsSet(rk.mig, '1'); // commit: if this write fails, next boot re-runs the pass and retries the marker - safe either way
  lsDel(rk.migfill); // the marker governs: a failed delete leaves the fill record inert (the marker short-circuits before it is read)
  return true;
}

/** @param {AnyPoint} a @param {AnyPoint} b @returns {number} */ function distM(a, b) { const dx = (a[1] - b[1]) * MLNG, dy = (a[0] - b[0]) * MLAT; return Math.hypot(dx, dy); }
const jDistM = distM; // the paint engine's name for the same two-point distance
// the rule, in one place: a segment breaks at gap >300 s, jump >1000 m, or a session start between
/** @param {TrailPoint[]} trail @param {number[]} [trailSessions] @returns {TrailPoint[][]} */ function trailSegments(trail, trailSessions) {
  trailSessions = trailSessions || [];
  const segs = []; let seg = []; let sessAt = 0;
  for (let i = 0; i < trail.length; i++) { const p = trail[i]; if (i > 0) { if (sessAt > 0 && trailSessions[sessAt - 1] > trail[i - 1][2]) { let lo = 0, hi = sessAt; while (lo < hi) { const mid = (lo + hi) >> 1; if (trailSessions[mid] <= trail[i - 1][2]) lo = mid + 1; else hi = mid; } sessAt = lo; } while (sessAt < trailSessions.length && trailSessions[sessAt] <= trail[i - 1][2]) sessAt++; } if (i > 0 && (p[2] - trail[i - 1][2] > 300 || distM(trail[i - 1], p) > 1000 || (sessAt < trailSessions.length && trailSessions[sessAt] <= p[2]))) { segs.push(seg); seg = []; } seg.push(p); }
  if (seg.length) segs.push(seg);
  return segs;
}
// the retention rule: the live run's last TRAIL_WINDOW_S of points only, anchored at the newest point's timestamp
/** @param {TrailPoint[]} points @param {number} runStartMs @returns {TrailPoint[]} */ function trailWindow(points, runStartMs) {
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
// placement is by measurement at fire time: no fixed offset can promise the pill never covers a control
const TOAST_CLEAR_OF = ['#dock button', '#tabBar button', '#setMenu button', '#setMenu input', '#setMenu .swRow', '.sheet button', '#sheet .srow', '#mapNote', '#mapNote button', '#mapNote textarea', '#finModal .card', '#finModal button', '#createSheet button', '#createBar input', '#createBar button', '#selPop', '#selPop button', '#spdPill', '#nightBtn', '#centreBtn'];
/** @param {HTMLElement} t @returns {void} */ function placeToast(t) {
  t.style.bottom = ''; // back to the CSS floor; re-measured on every fire
  for (let hop = 0; hop < 8; hop++) {
    const r = t.getBoundingClientRect();
    // the band: a re-fire can land mid-fade, so read the live transform offset (shown lands at 0)
    let ty = 0;
    try { ty = new DOMMatrixReadOnly(getComputedStyle(t).transform).m42 || 0; } catch (e) { /* transform 'none' reads as 0 */ }
    const top = r.top - ty, bottom = r.bottom - ty;
    let raise = 0;
    for (const sel of TOAST_CLEAR_OF) document.querySelectorAll(sel).forEach(e => {
      if (e === t) return;
      const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
      if (!(b.width > 0 && b.height > 0) || cs.display === 'none' || cs.visibility === 'hidden') return;
      // one mid-entrance counts as the obstruction it is becoming: judge its resting top, not its first frame
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
// ===== DEVICE PROFILE ===== Android only, graded by measured speed; on iPhone this machinery never runs at all
const DP_PLATFORM = (() => { try { const ua = (window.navigator && navigator.userAgent) || ''; if (/Android/i.test(ua)) return 'android'; if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'; if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1) return 'ios'; return 'other'; } catch (e) { return 'other'; } })(); // iPadOS asks for the desktop UA - a 'Macintosh' agent with a multi-touch screen is an iPad, never an Android
const DP_ANDROID = DP_PLATFORM === 'android';
const DP_TIERS = [{ pr: 2 }, { pr: 1.5 }, { pr: 1.25 }]; // the closed knob list: canvas pixel ratio per tier (0 full / 1 mid / 2 low)
const DP = { platform: DP_PLATFORM, entered: false, tier: 0, hint: 0, stored: -1, bootGrade: -1, booted: false, bootApplyUntil: 0, pending: -1, lastEvalTier: -1, agree: 0, lastApplyAt: 0, lastInteractAt: 0, pointerDown: false, renderSeen: false, hooked: false, samples: [] };
// the constructor's ratio: on Android the applied tier's, everywhere else the literal 2
/** @returns {number} */ function dpPixelRatio() { return DP_ANDROID ? DP_TIERS[DP.tier].pr : 2; }
/** @param {number[]} a @returns {number} */ function dpMedian(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
/** @param {number} ms @returns {number} */ function dpGradeOf(ms) { return ms <= 26 ? 0 : (ms <= 45 ? 1 : 2); } // median work-frame ms -> tier: full holds ~38fps+ through real render work; past 45ms the full-quality canvas is the strain the Pixel showed
/** @param {number} t @returns {void} */ function dpWriteStore(t) { if (DP.stored === t) return; try { if (lsSet(LS_GLOBAL.dp, JSON.stringify({ t, at: Date.now() }))) DP.stored = t; } catch (e) { /* the hint is a cache of a measurement - a failed write costs nothing, the next evaluation rewrites it */ } } // Beta 1.254 (N-02): DP.stored advances ONLY on a successful write - through 1.253 it was set before lsSet ran, and lsSet reports failure by returning false rather than throwing, so one failed write marked the tier stored forever and suppressed every retry the catch comment promised
// the judgment: the fresh median of first draws grades the session; the hint only chose the starting tier
/** @returns {void} */ function dpBootGrade() {
  DP.booted = true;
  const g = dpGradeOf(dpMedian(DP.samples));
  DP.bootGrade = g;
  dpWriteStore(g);
  if (g !== DP.tier) DP.pending = g; // either direction (launch judging, before work starts): dpTryApply lands it at the idle in the window
}
/** @returns {void} */ function dpEvaluate() { // a session evaluation over the living window (rules 2 + 3 + 8)
  const w = DP.samples.slice(-72); if (w.length < 36) return;
  const cand = dpGradeOf(dpMedian(w));
  if (DP.pending >= 0 && DP.pending < DP.tier && cand > DP.pending) DP.pending = -1; // a pending upgrade lives only while the latest verdict supports it: losing support cancels it, to be re-earned
  if (cand < DP.tier) { // faster than the applied tier: two consecutive agreeing evaluations earn the upgrade (applied at idle by dpTryApply)
    if (DP.pending > DP.tier) DP.pending = -1; // fresh evidence acquits a pending boot downgrade
    if (DP.lastEvalTier === cand) DP.agree++; else { DP.lastEvalTier = cand; DP.agree = 1; }
    if (DP.agree >= 2) DP.pending = cand;
    if (DP.agree >= 2) dpWriteStore(cand); // the same verdict refreshes the record: a recovered session never hands the next launch a disproved hint
  } else if (cand > DP.tier) { // slower: NEVER applied this session (rule 8) - the stored record carries it to the next launch's judgment
    DP.lastEvalTier = cand; DP.agree = 0; if (DP.pending < 0 || DP.pending >= DP.tier) DP.pending = -1;
    dpWriteStore(cand);
  } else { // evidence matches the applied tier: a pending boot downgrade is acquitted, and the agreement count runs on this candidate too
    if (DP.lastEvalTier === cand) DP.agree++; else { DP.lastEvalTier = cand; DP.agree = 1; }
    if (DP.pending > DP.tier) DP.pending = -1;
    if (DP.agree >= 2) dpWriteStore(cand); // sustained agreement with the applied tier also rewrites a stale slower record
  }
}
// lands a pending tier only at a fully idle moment, inside its direction's window, past the dwell
/** @returns {void} */ function dpTryApply() {
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
// real work only: a frame counts when the map rendered or is moving; idle screens earn no samples
/** @returns {void} */ function dpSamplerStart() {
  let last = performance.now(), sinceEval = 0;
  const frame = now => {
    requestAnimationFrame(frame);
    const dt = now - last; last = now;
    if (document.hidden) return;
    let work = DP.renderSeen; DP.renderSeen = false;
    try { if (typeof map !== 'undefined' && map) { if (!DP.hooked) { DP.hooked = true; map.on('render', () => { DP.renderSeen = true; }); } if (map.isMoving()) work = true; } } catch (e) { /* the map is not up yet - frames before it exists are not work samples */ }
    if (!work || !(dt > 0) || dt > 1000) return; // a >1 s frame is a stall or tab switch, not a sample: it never convicts a device alone
    DP.samples.push(dt); if (DP.samples.length > 240) DP.samples.splice(0, DP.samples.length - 240);
    sinceEval++;
    if (!DP.booted) { if (DP.samples.length >= 24) dpBootGrade(); }
    else if (sinceEval >= 30) { sinceEval = 0; dpEvaluate(); }
  };
  requestAnimationFrame(frame);
}
/** @returns {void} */ function dpBoot() {
  window.__dp = DP; // the diagnostic handle: QA and drives read the profile's state here (entered / tier / samples)
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
const RAW_READ_FAILED = {}; // rawRead's failure sentinel: a unique object no stored value can equal - a thrown read, distinguishable from absence
/** @param {string} k @returns {string | Object | null} */ function rawRead(k) { try { return localStorage.getItem(k); } catch (e) { return RAW_READ_FAILED; } } // Beta 1.136 (programme F): the ONE raw storage read for the backup paths - they read RAW by design (Beta 1.48, audit B04) and each caller keeps its own failure mode against the sentinel: the strict export aborts (null/undefined), the recovery export skips the field, the restore stops before writing // Beta 1.63 (audit F03): deletions report like writes - a failed removeItem used to be invisible while saveStart claimed success
// every save-family function returns one shape { ok, failedKey, retryPending }; storage code never speaks to the user
/** @returns {StorageOutcome} */ function storeOk() { return { ok: true, failedKey: null, retryPending: false }; }
/** @param {string | null} failedKey @param {boolean} [retryPending] @returns {StorageOutcome} */ function storeFail(failedKey, retryPending) { return { ok: false, failedKey: failedKey || null, retryPending: !!retryPending }; }
// trust is earned by read-back; runTx undoes in reverse, the failing step first (unless 'write'-kind)
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
// ===== SETTINGS ===== one global key; persistent toggles default ALL OFF (device behaviour starts off until flipped)
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
  s.awake = false; // screen-awake is session-only: forced off at load whatever the record says; the toggle flips memory only
  return s;
}
let settings = loadSettings();
// only the persistent three: settings.awake is never written
/** @returns {boolean} */ function saveSettings() { return lsSet(SETTINGS_KEY, JSON.stringify({ vib: settings.vib, chime: settings.chime, chimeSound: settings.chimeSound })); }
// Tap guard — 400 ms per control
const tapLast = {};
/** @param {string} key @param {{ timeStamp: number }} ev @returns {boolean} */ function tapGuard(key, ev) { const timestamp = ev.timeStamp; if (tapLast[key] !== undefined && timestamp - tapLast[key] < 400) return false; tapLast[key] = timestamp; return true; }

// ===== STRETCHES — stitch each street, cut at junctions (checklist SS1) =====
// segments chained into connected runs: a street with several runs keeps EVERY run, not only segment 0's
/** @param {string} name @param {RoadsMap} [roads] @returns {LatLng[][]} */ function stitchRuns(name, roads) {
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
/** @type {StretchMap} */ const STRETCH = Object.create(null); // null-prototype like ROADS: buildGeometry refills it by Object.assign from street-name keys
// the stretch builder: pure, per-run - a disconnected street is tracked whole by marking, totals and pace
/** @param {RoadsMap} roads @returns {StretchMap} */ function computeStretches(roads) {
  // name-keyed by assignment: a plain object swallows a '__proto__' street into its prototype
  /** @type {StretchMap} */ const out = Object.create(null);
  const runsOf = Object.create(null), totals = Object.create(null);
  for (const n of Object.keys(roads)) {
    const runs = stitchRuns(n, roads).map(L => { const cum = [0]; for (let i = 1; i < L.length; i++) cum.push(cum[i - 1] + distM(L[i - 1], L[i])); return { line: L, cum, total: cum[cum.length - 1], parts: null }; });
    runsOf[n] = runs;
    totals[n] = runs.reduce((a, r) => a + r.total, 0);
  }
  for (const n of Object.keys(roads)) {
    const parts = [];
    for (const run of runsOf[n]) {
      const cuts = [];
      // bbox prefilter: a vertex outside the box is >4 m from every segment, so skipping changes no cuts
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
// the roads' bounding box, or null for an empty pack (pre-load there is no box at all)
/** @param {RoadsMap} roads @returns {RouteBox | null} */ function computeRouteBox(roads) {
  let w = 1e9, s = 1e9, e = -1e9, n = -1e9, any = false;
  for (const nm of Object.keys(roads)) for (const seg of roads[nm]) for (const p of seg) { any = true; w = Math.min(w, p[1]); e = Math.max(e, p[1]); s = Math.min(s, p[0]); n = Math.max(n, p[0]); }
  return any ? { w, s, e, n } : null;
}
const STREETNAMES = [];
const names = STREETNAMES; // the paint engine's name for the street list

// ===== STATE =====
const STREETSET = new Set();
// geometry rebuilds here per load: containers refill in place (references stay valid); runs before loadRouteState
/** @param {RoutePack} pack @returns {void} */ function buildGeometry(pack) {
  const roads = (pack && pack.roads) || {}, reference = (pack && pack.reference) || {};
  for (const k of Object.keys(ROADS)) delete ROADS[k]; Object.assign(ROADS, roads);
  for (const k of Object.keys(REFERENCE)) delete REFERENCE[k]; Object.assign(REFERENCE, reference);
  const built = computeStretches(ROADS);
  for (const k of Object.keys(STRETCH)) delete STRETCH[k]; Object.assign(STRETCH, built);
  const endsIn = (pack && pack.ends) || {}; // boundary ends ride onto the stretch table: a street with none has no entry, every end natural
  for (const n of Object.keys(endsIn)) if (STRETCH[n] && Array.isArray(endsIn[n]) && endsIn[n].length) STRETCH[n].ends = endsIn[n];
  STREETNAMES.length = 0; for (const n of Object.keys(ROADS)) STREETNAMES.push(n);
  STREETSET.clear(); for (const n of STREETNAMES) STREETSET.add(n);
  PRIMARIES.clear(); for (const n of ((pack && pack.primaries) || [])) if (STREETSET.has(n)) PRIMARIES.add(n);
  for (const k of Object.keys(SPOT)) delete SPOT[k]; Object.assign(SPOT, (pack && pack.spot) || {});
  ROUTE_TILE_NAMES.length = 0; ROUTE_TILE_NAMES.push(...((pack && pack.tileNames && pack.tileNames.length) ? pack.tileNames : STREETNAMES)); // MIX SAMPLE restore (pre-1.258 verbatim): the basemap exclusion's name list, refilled per load
  routeBox = computeRouteBox(ROADS);
  buildSamples();
}
// state loads at pick time, not eval: before, nothing route-shaped is read, drawn or offered
let doneSet = new Set(), doneTimes = {}, doneVia = {}, notes = {}, history = [], runStart = 0, trail = [], trailSessions = [], coveredIdx = {}, pieces = {}, pieceTimes = {};
const HIST = { // the history repository: the one owner of the record's load, projection, append, delete, rollback and serialisation
  _rawList: null, _rawView: null, // snapshot: _rawList the raw array, _rawView[i] its view entry or null; writers persist forWrite(...), never the view
  // the load parses the text twice (the sanitizer mutates survivors): sanitizes into the view, records the snapshot
  /** @param {string} text @returns {HistoryEntry[]} */ loadFrom(text) {
    const parsed = parseJ(text, []);
    const raw = parseJ(text, []);
    // chronological (oldest first); items is a street->time map; sanitized at load: real entries/streets only, rest dropped
    const list = Array.isArray(parsed) ? parsed : [];
    // one indexed pass (same predicates, same order) recording the snapshot as it goes
    this._rawList = Array.isArray(raw) ? raw : [];
    this._rawView = [];
    const _view = [];
    for (let i = 0; i < list.length; i++) {
      const h = list[i]; let v = null;
      if (h && typeof h === 'object' && !Array.isArray(h) && !isNaN(Date.parse(h.at)) && h.items && typeof h.items === 'object') {
        const m = {};
        if (Array.isArray(h.items)) { for (const n of h.items) if (typeof n === 'string' && STREETSET.has(n)) m[n] = (h.times && typeof h.times[n] === 'string' && !isNaN(Date.parse(h.times[n]))) ? h.times[n] : null; }
        else { for (const n of Object.keys(h.items)) { const t = h.items[n]; if (STREETSET.has(n) && (t === null || (typeof t === 'string' && !isNaN(Date.parse(t))))) m[n] = t; } }
        h.items = m;
        if (Object.keys(m).length > 0) v = h;
      }
      this._rawView.push(v);
      if (v) _view.push(v);
    }
    history = _view;
    // no cap: history is retained whole, and the sanitizer is linear, so an oversize array costs one pass
    return raw;
  },
  /** @returns {HistoryEntry[]} */ rawList() { return Array.isArray(this._rawList) ? this._rawList : []; }, // the raw parse reconcileInterruptedFinish judges (A-04) - the same array loadFrom returned
  // what writers persist: dropped raw entries ride back verbatim (a strip is a view, never a write)
  /** @param {HistoryEntry[]} list @returns {HistoryEntry[]} */ forWrite(list) {
    if (!this._rawList || !this._rawView) return list;
    const alive = new Set(list); const seen = new Set(); const out = [];
    for (let i = 0; i < this._rawList.length; i++) { const v = this._rawView[i]; if (v == null) { out.push(this._rawList[i]); continue; } seen.add(v); if (alive.has(v)) out.push(this._rawList[i]); }
    for (const h of list) if (!seen.has(h)) out.push(h);
    return out;
  },
  // the one serialised form every history writer persists
  /** @param {HistoryEntry[]} [list] @returns {string} */ serialise(list) { return JSON.stringify(this.forWrite(list === undefined ? history : list)); },
  // the delete handler branches on this; no trim on the way out: history writes whole
  /** @returns {boolean} */ save() { return lsSet(LS.hist, this.serialise()); },
  // the history cap is gone: appends never drop, saves write history whole, load keeps what its sanitizer passes
  /** @param {HistoryEntry} entry @returns {HistoryEntry[]} */ appended(entry) { return [...history, entry]; },
  /** @param {number} i @returns {void} */ deleteAt(i) { history.splice(i, 1); }, // the delete-clean mutation (app3) - the save that persists it is the caller's (the handler branches on save()'s result)
  /** @param {HistoryEntry[]} list @returns {void} */ replaceView(list) { history = list; }, // the finish commit (app3): the transaction has already persisted this list through serialise; the view adopts it whole
  /** @param {*} sig @param {*} rawLast @param {*} last @param {number} lastMs @returns {boolean} */ dropPhantom(sig, rawLast, last, lastMs) { // reconcileInterruptedFinish's verified rollback, under the repository's roof: storage loses the signature entry only (when the signature came from the raw array, everything else storage holds stays byte-for-byte - a load-time strip is a view, never a write); memory drops the phantom too when the sanitized tail IS that entry (same run identity), and needs no drop when the sanitizer already removed it
    const rawList = this.rawList();
    const src = (sig === rawLast && rawLast !== null) ? rawList : history;
    // the fallback branch writes the forWrite merge like every writer: the phantom stays deleted, dropped entries ride back
    if (!txSet(LS.hist, JSON.stringify(src === rawList ? src.slice(0, -1) : this.forWrite(src.slice(0, -1)))).ok) return false;
    if (src === rawList) { this._rawList.pop(); this._rawView.pop(); } // the snapshot pops with the shortened raw array, so a later save cannot resurrect the phantom
    if (last && last.runId && +last.runId === lastMs) history = history.slice(0, -1);
    return true;
  },
  // called at unload: the snapshot dies with its route and must never merge into another route's slot
  /** @returns {void} */ unload() { history = []; this._rawList = null; this._rawView = null; },
};
/** @returns {StorageOutcome} */ function saveStart() { const ok = runStart ? lsSet(LS.start, String(runStart)) : lsDel(LS.start); if (ok) markClean('start'); else markDirty('start'); return ok ? storeOk() : storeFail('start', true); } // Beta 1.57: reports its result like every other write, for the saveAll contract. Beta 1.275 (architecture #3): the flag itself is PERSIST's now (below) - this writer arms/clears it through the doorway like every other file; its retry rationale (1.92 F05: a stale start key must never resurrect a finished run) lives in the PERSIST header
/** @param {string} n @returns {boolean} */ function streetComplete(n) { const p = pieces[n]; if (!Array.isArray(p)) return doneSet.has(n); return p.every(v => v === 3); }
// only [stringOrNull, stringOrNull] pairs survive; indexes are bounded by the street's real stretch count
/** @param {*} raw @param {number} count @returns {PieceTimePair[]} */ function sanitizePieceTimes(raw, count) {
  /** @type {(pr: *) => PieceTimePair} */ const pair = pr => Array.isArray(pr) ? [typeof pr[0] === 'string' ? pr[0] : null, typeof pr[1] === 'string' ? pr[1] : null] : [null, null];
  const lim = Number.isInteger(count) && count > 0 ? count : 0;
  const out = [];
  if (Array.isArray(raw)) { const n = Math.min(raw.length, lim); for (let i = 0; i < n; i++) out[i] = pair(raw[i]); return out; }
  if (raw && typeof raw === 'object') { for (const k of Object.keys(raw)) { const i = Number(k); if (Number.isInteger(i) && i >= 0 && i < lim) out[i] = pair(raw[k]); } return out; }
  return out;
}

// ===== THE ROUTE BOARD MODULE (Arch-2, 2026-11-19) =====
function validateSnap(raw, expectAt, G) { // a cancel snapshot is untrusted: it applies by passing the loader's rules whole; any violation rejects it
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
      pieceTimes[n] = sanitizePieceTimes(tn, stretch[n].parts.length); // the loader's sanitizer is the shape authority: strictness lives in the checks around this call
    }
    // the sanitizer keeps any string stamp; the loader's standard is parseable, so an unparseable stamp rejects
    for (const n of names) { for (const pr of pieceTimes[n]) { if ((pr[0] !== null && isNaN(Date.parse(pr[0]))) || (pr[1] !== null && isNaN(Date.parse(pr[1])))) return null; } }
    const done = [];
    for (const d of D) { if (typeof d !== 'string' || !set.has(d)) return null; if (!done.includes(d)) done.push(d); }
    const times = {}, via = {};
    for (const k of Object.keys(TM)) { if (!set.has(k) || typeof TM[k] !== 'string' || isNaN(Date.parse(TM[k]))) return null; times[k] = TM[k]; } // the value must be a real date too (the loader deletes times failing Date.parse)
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
  // the pre-Start snapshot (deep pieces/pieceTimes/cov, array done, shallow times/via): the copy depths are Cancel's semantics
  /** @returns {*} */ capture() {
    return { pieces: JSON.parse(JSON.stringify(pieces)), pieceTimes: JSON.parse(JSON.stringify(pieceTimes)), done: [...doneSet], times: { ...doneTimes }, via: { ...doneVia }, cov: JSON.parse(JSON.stringify(coveredIdx)) };
  },
  // the one snapshot shape ({at, pieces, pieceTimes, done, times, via, cov}, key order fixed): references, no copy
  /** @param {*} snap @param {number} at @returns {*} */ snapshotObject(snap, at) {
    return { at, pieces: snap.pieces, pieceTimes: snap.pieceTimes, done: snap.done, times: snap.times, via: snap.via, cov: snap.cov };
  },
  /** @param {*} snap @param {number} at @returns {string} */ serialiseSnap(snap, at) { return JSON.stringify(BOARD.snapshotObject(snap, at)); }, // saveSnap's persisted string and the restore's re-serialised snapshot
  // apply a normalized snapshot whole: the six bindings replace from it, done re-set from its array
  /** @param {*} snap @returns {void} */ restore(snap) {
    pieces = snap.pieces; pieceTimes = snap.pieceTimes; doneSet = new Set(snap.done); doneTimes = snap.times; doneVia = snap.via; coveredIdx = snap.cov;
  },
  // the board invariant, one home: doneSet derives from pieces; times/via prune to complete streets
  /** @returns {void} */ rederive() {
    doneSet = new Set(STREETNAMES.filter(streetComplete));
    for (const k of Object.keys(doneTimes)) if (!doneSet.has(k)) delete doneTimes[k];
    for (const k of Object.keys(doneVia)) if (!doneSet.has(k)) delete doneVia[k];
  },
  // the fallback: revert only sides stamped at/after the run's start, re-derive, drop coverage (it re-earns)
  /** @param {number} startMs @returns {void} */ revertRunMarks(startMs) {
    for (const n of STREETNAMES) { const P = pieces[n], T = pieceTimes[n] || {}; for (let i = 0; i < P.length; i++) { const st = T[i] || [null, null]; if ((P[i] & 1) && st[0] && Date.parse(st[0]) >= startMs) { P[i] &= ~1; st[0] = null; } if ((P[i] & 2) && st[1] && Date.parse(st[1]) >= startMs) { P[i] &= ~2; st[1] = null; } } }
    BOARD.rederive();
    coveredIdx = {};
  },
  // the in-place empty (Clear, Finish): the pieces object is KEPT, only its per-street arrays replaced
  /** @returns {void} */ zeroMarks() {
    for (const n of STREETNAMES) { pieces[n] = STRETCH[n].parts.map(() => 0); pieceTimes[n] = {}; }
    doneSet = new Set(); doneTimes = {}; doneVia = {}; coveredIdx = {};
  },
  // the rebind empty (unload): all six bindings replaced, identity dropped - unlike zeroMarks' in-place empty
  /** @returns {void} */ emptyBoard() {
    doneSet = new Set(); doneTimes = {}; doneVia = {}; coveredIdx = {}; pieces = {}; pieceTimes = {};
  },
  /** @returns {void} */ clearNotesAndCoverage() { notes = {}; coveredIdx = {}; }, // completeFinishCleanup's board part: a committed finish's leftover notes/coverage clear once its verified writes land
  // the board's stored strings, one construction: saveAll writes them, the recovery export reads them verbatim
  /** @returns {{sides: string, done: string, times: string, via: string, cov: string}} */ serialiseLive() {
    return { sides: JSON.stringify({ p: pieces, t: pieceTimes }), done: JSON.stringify([...doneSet]), times: JSON.stringify(doneTimes), via: JSON.stringify(doneVia), cov: JSON.stringify(coveredIdx) };
  },
  /** @returns {string} */ serialiseCov() { return JSON.stringify(coveredIdx); }, // PERSIST.flush's throttled coverage write
  /** @returns {*} */ sidesCopy() { return JSON.parse(JSON.stringify({ p: pieces, t: pieceTimes })); }, // buildSnap's archived sides: a deep copy in the stored {p, t} shape
  /** @returns {*} */ clearedSides() { // finishRun's transaction input: the zeroed sides maps a committed finish writes as the cleared authority
    const p = {}, t = {};
    for (const n of STREETNAMES) { p[n] = STRETCH[n].parts.map(() => 0); t[n] = {}; }
    return { p, t };
  },
  /** @param {string} name @param {number} idx @param {number} side @param {boolean} on @returns {{completed: (string|null), uncompleted: boolean}} */ setSide(name, idx, side, on) { // Beta 1.274 (programme #1): applyPiece's mutation under the module's roof - the piece write with NO rendering and NO feedback; the completion flip and the un-completion are REPORTED and the caller fires the feedback, so the observable order is the old one exactly
    const bit = side ? 2 : 1; const was = pieces[name][idx];
    const now = on ? (was | bit) : (was & ~bit);
    if (now === was) return { completed: null, uncompleted: false };
    pieces[name][idx] = now;
    if (!pieceTimes[name][idx]) pieceTimes[name][idx] = [null, null];
    pieceTimes[name][idx][side] = on ? new Date().toISOString() : null;
    // the exact false-to-true completion flip: the wrapper fires onStreetComplete on this report
    if (streetComplete(name) && !doneSet.has(name)) { doneSet.add(name); doneTimes[name] = new Date().toISOString(); doneVia[name] = 'sides'; return { completed: name, uncompleted: false }; }
    if (!streetComplete(name) && doneSet.has(name)) { doneSet.delete(name); delete doneTimes[name]; delete doneVia[name]; return { completed: null, uncompleted: true }; }
    return { completed: null, uncompleted: false };
  },
  // whole street done: marked sides keep their times, the rest inherit the completion moment; no feedback here
  /** @param {string} name @param {string} via @param {string} at @returns {{flipped: boolean}} */ completeStreet(name, via, at) {
    const wasComplete = streetComplete(name); // the feedback fires only on a real false-to-true flip, which this reports
    pieces[name] = STRETCH[name].parts.map(() => 3);
    const mts = at || new Date().toISOString();
    const cur = (pieceTimes[name] && typeof pieceTimes[name] === 'object') ? pieceTimes[name] : {};
    pieceTimes[name] = STRETCH[name].parts.map((_, i) => { const pr = Array.isArray(cur[i]) ? cur[i] : [null, null]; return [pr[0] || mts, pr[1] || mts]; });
    doneSet.add(name); doneTimes[name] = mts; doneVia[name] = via || 'tap';
    return { flipped: !wasComplete };
  },
  /** @param {string} name @returns {void} */ clearStreet(name) { // markUndone's mutation: the street zeroed whole, its completion record dropped
    pieces[name] = STRETCH[name].parts.map(() => 0);
    pieceTimes[name] = STRETCH[name].parts.map(() => [null, null]);
    doneSet.delete(name); delete doneTimes[name]; delete doneVia[name];
  },
  /** @returns {void} */ loadDoneMeta() { // loadRouteState segment 1 (repair): the stored done set and its times/via, per-field sanitized
    const _doneRaw = parseJ(lsGet(LS.done), []);
    doneSet = new Set(Array.isArray(_doneRaw) ? _doneRaw.filter(n => typeof n === 'string' && STREETSET.has(n)) : []); // a non-array (legacy object, number) made new Set() throw, killing the boot; loadSides re-derives this anyway
    doneTimes = parseJ(lsGet(LS.times), {});
    if (!doneTimes || typeof doneTimes !== 'object' || Array.isArray(doneTimes)) doneTimes = {}; // normalize before the cleanup loop: a JSON string's `delete` threw under strict mode, killing the boot
    for (const k of Object.keys(doneTimes)) { if (typeof doneTimes[k] !== 'string' || isNaN(Date.parse(doneTimes[k]))) delete doneTimes[k]; }
    doneVia = parseJ(lsGet(LS.via), {});
    if (!doneVia || typeof doneVia !== 'object' || Array.isArray(doneVia)) doneVia = {};
    for (const k of Object.keys(doneVia)) { if (typeof doneVia[k] !== 'string') delete doneVia[k]; } // via values get doneTimes treatment: only strings are written here, and an unchecked non-string would be re-saved and ride backups
  },
  /** @returns {void} */ loadCoverage() { // loadRouteState segment 2 (repair): the stored coverage indexes, bounded to the street's real samples
    coveredIdx = parseJ(lsGet(LS.cov), {});
    if (!coveredIdx || typeof coveredIdx !== 'object' || Array.isArray(coveredIdx)) coveredIdx = {};
    // negatives, fractions and text survived an upper-bound-only pass and inflated coverage; the pass lives here now
    for (const n of Object.keys(coveredIdx)) { if (!SAMPLES[n] || !Array.isArray(coveredIdx[n])) { delete coveredIdx[n]; continue; } coveredIdx[n] = coveredIdx[n].filter(i => Number.isInteger(i) && i >= 0 && i < SAMPLES[n].length); }
  },
  // repair: stored sides become the live board (clamped 0..3, missing derived from done, times/via pruned)
  /** @returns {void} */ loadSides() {
    pieces = {}; pieceTimes = {};
    const raw = parseJ(lsGet(LS.sides), null);
    let P = null, T = {};
    if (raw && typeof raw === 'object') { if (raw.p) { P = raw.p; T = raw.t || {}; } else P = raw; }
    for (const n of STREETNAMES) {
      const count = STRETCH[n].parts.length;
      // normalize sides to the 0..3 the app writes: a crafted 99 counted via bitwise reads while streetComplete disagreed
      let arr = (P && Array.isArray(P[n]) && P[n].length === count) ? P[n].map(v => (v === 1 || v === 2 || v === 3) ? v : 0) : null;
      if (!arr) arr = new Array(count).fill(doneSet.has(n) ? 3 : 0);
      pieces[n] = arr;
      pieceTimes[n] = sanitizePieceTimes(T && T[n], STRETCH[n].parts.length);
    }
    // complete streets inherit their done-time on every side; doneSet is derived from pieces
    doneSet = new Set(STREETNAMES.filter(streetComplete));
    for (const n of STREETNAMES) {
      if (streetComplete(n) && doneTimes[n]) { // inheritance fills missing stamps, not only empty maps: holes read as never worked and undercounted the run
        const full = pieces[n].map(v => [v & 1 ? doneTimes[n] : null, v & 2 ? doneTimes[n] : null]);
        if (!Object.keys(pieceTimes[n]).length) pieceTimes[n] = full;
        else { const T2 = pieceTimes[n], out = []; for (let i = 0; i < full.length; i++) { const cur = T2[i]; out[i] = [(cur && cur[0]) || full[i][0], (cur && cur[1]) || full[i][1]]; } pieceTimes[n] = out; }
      }
    }
    for (const k of Object.keys(doneTimes)) if (!streetComplete(k)) delete doneTimes[k];
    for (const k of Object.keys(doneVia)) if (!streetComplete(k)) delete doneVia[k];
  },
};
let routeLoaded = false, activeRoute = null; // set by loadRoute (app4) once a pack is chosen; app2's paint/render gates read them
/** @param {string} id @returns {void} */ function loadRouteState(id) {
  LS = migrateLegacyRoute(id) ? { ...routeKeys(id), ...LS_GLOBAL } : { ...LEGACY_KEYS, ...LS_GLOBAL };
BOARD.loadDoneMeta(); // Arch-2: the board's load-repair lives in the module (BOARD.loadDoneMeta / loadCoverage / loadSides)
notes = parseJ(lsGet(LS.notes), {});
// notes normalize at load: non-arrays dropped; entries keep object shapes, string kinds and parseable dates only
if (!notes || typeof notes !== 'object' || Array.isArray(notes)) notes = {};
Object.keys(notes).forEach(n => { if (!STREETSET.has(n) || !Array.isArray(notes[n])) delete notes[n]; else notes[n] = notes[n].filter(f => f && typeof f === 'object' && typeof f.k === 'string' && (f.text === undefined || typeof f.text === 'string') && (f.at === undefined || (typeof f.at === 'string' && !isNaN(Date.parse(f.at))))); });
const rawHistory = HIST.loadFrom(lsGet(LS.hist)); // the repository parses, sanitizes and snapshots; the raw parse it returns is reconcileInterruptedFinish's judge
// Run start (production): epoch milliseconds, stored as a bare digit string (NOT JSON).
runStart = 0;
// the start parses strictly (digit string, epoch-ms band): a crafted '1' once became a phantom run
try { const s = lsGet(LS.start); runStart = (typeof s === 'string' && /^\d+$/.test(s) && isFinite(+s) && +s >= 946684800000 && +s <= 4102444800000) ? +s : 0; } catch (e) { runStart = 0; }
trail = parseJ(lsGet(LS.trail), []);
trailSessions = parseJ(lsGet(LS.sess), []); // each clean's epoch-second start (for cleans that recorded points): the session identity exports split cleans by
trailSessions = Array.isArray(trailSessions) ? [...new Set(trailSessions.filter(t => Number.isFinite(t) && t >= 946684800 && t <= 4102444800))].sort((a, b) => a - b) : [];
if (trailSessions.length > TRAIL_MAX) trailSessions = trailSessions.slice(trailSessions.length - TRAIL_MAX); // no cap for session markers (one per clean start): load bounds them at the trail's cap, newest kept
// Trail (production): [lat, lng, epochSeconds] triples; out-of-range or impossible points are dropped at load (SEC-9a bounds).
trail = Array.isArray(trail) ? trail.filter(p => Array.isArray(p) && p.length === 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]) && p[2] >= 946684800 && p[2] <= 4102444800 && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180) : [];
if (trail.length > TRAIL_MAX) trail = trail.slice(trail.length - TRAIL_MAX);
const trailBeforeWindow = trail.length; trail = trailWindow(trail, runStart); if (trail.length !== trailBeforeWindow) markDirty('trail'); if (trailBeforeWindow > 0 && !trail.length && !runStart && trailSessions.length) { trailSessions = []; markDirty('sess'); } // Beta 1.193 (trail redesign): the window binds at load like everywhere else - a 1.190-era resident trail (every clean, up to the old point cap) is cut to the live run's last 60 minutes on the first 1.191 boot, and with no live run it empties: the fallback has no run to protect. runStart was parsed above (line order is load-bearing: the start record is read before the trail for exactly this). The binding is STORED, not just in memory: a shortened trail is marked dirty so the next flush writes the windowed value (a backup reads storage raw - it must never carry points the window forbids), and when the window empties a trail that EXISTED with no live run, its session markers go with it - markers never outlive their trail (the C-01 pair rule, applied at load; a live run keeps its markers, its own start among them). The clear is scoped to the window's own act (trailBeforeWindow > 0): markers stored with NO trail at all are not the window's business - the migration and restore layers govern those (C-01/C06), and clearing them here would eat records those layers legitimately carry (the slot migration's copied sess field - drive145 N12d caught exactly that in this round's first gate). // Beta 1.152 (NV round, NV4): the writer caps the trail at TRAIL_MAX by dropping the OLDEST points (recordFix, app3) - the load keeps the same end of the same cap, so a planted slot cannot resurrect an unbounded trail.
BOARD.loadCoverage();
BOARD.loadSides();
  reconcileInterruptedFinish(rawHistory); // resolve a finish that died between gates, before rendering; judged on raw, not the sanitized array
  completeFinishCleanup(); // complete a committed finish's metadata cleanup if its writes failed and a reload outlived the in-memory retry
}
// signature: the entry's runId === stored start - marked board, entry removed; cleared board, finish stands
/** @param {HistoryEntry[]} rawHistory @returns {void} */ function reconcileInterruptedFinish(rawHistory) {
  // judged on the raw newest entry; a rollback writes the raw array minus its tail
  const rawList = Array.isArray(rawHistory) ? rawHistory : [];
  const rawLast = rawList.length ? rawList[rawList.length - 1] : null;
  const last = history.length ? history[history.length - 1] : null;
  if (!last && !rawLast) return;
  const sig = (rawLast && typeof rawLast === 'object' && !Array.isArray(rawLast)) ? rawLast : last; // a raw tail that is no entry object carries no identity: the sanitized tail stands in
  const lastMs = sig && sig.runId ? (+sig.runId || 0) : 0; // the entry's identity (none yields 0); in the no-run branch it must equal the finclean marker's at
  const boardEmpty = STREETNAMES.every(n => pieces[n].every(v => v === 0));
  if (runStart) { const act = finishReconcileAction(runStart, lastMs, boardEmpty); if (act === 'rollback') { HIST.dropPhantom(sig, rawLast, last, lastMs); } else if (act === 'complete') { if (txDel(LS.start).ok) runStart = 0; } return; }
  const marker = parseJ(lsGet(LS.finclean), null); const markerRun = marker && typeof marker === 'object' && !Array.isArray(marker) ? marker.run : null; const markerAt = marker && typeof marker === 'object' ? (+marker.at || 0) : 0; const boardMatch = !boardEmpty && finishBoardMatch(sig, pieces, pieceTimes, STREETNAMES);
  if (finishReconcileNoRunAction(markerRun, markerAt, lastMs, boardEmpty, boardMatch) === 'rollback') { if (HIST.dropPhantom(sig, rawLast, last, lastMs)) txDel(LS.finclean); }
}
// a committed finish with failed metadata writes leaves a durable obligation: completed here at load, guarded and idempotent
/** @returns {void} */ function completeFinishCleanup() {
  if (runStart) return;
  if (lsGet(LS.finclean) === null) return;
  if (!STREETNAMES.every(n => pieces[n].every(v => v === 0))) return;
  if (!txSet(LS.notes, '{}').ok) return;
  if (!txSet(LS.cov, '{}').ok) return;
  BOARD.clearNotesAndCoverage();
  txDel(LS.finclean);
}
// ===== DAY/NIGHT ===== theme follows the sun (computed on-device, offline); the override holds until the next sun event
let themeOverride = null, themeOverrideUntil = 0; // null = automatic
/** @param {number} ms @param {number} lat @param {number} lng @returns {SunTimes} */ function sunTimes(ms, lat, lng) { // the sun events of the position-local day containing ms, as epoch ms
  // date is the position's solar frame (its longitude), never the device's zone: the instant is physical
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
  const rise = one(true), set = one(false);
  // when neither event exists the day is polar: midday cosH discriminates (>1 never rises, <-1 never sets)
  let /** @type {'day' | 'night' | null} */ polar = null;
  if (rise == null && set == null) {
    const t = N + (12 - lngHour) / 24, M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634; L = ((L % 360) + 360) % 360;
    const sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    polar = cosH > 1 ? 'night' : 'day';
  }
  return { rise, set, polar };
}
/** @returns {number[]} */ function themePos() { try { if (typeof lastGood !== 'undefined' && lastGood && lastGood.ll) return lastGood.ll; } catch (e) {} try { if (typeof routeBox !== 'undefined' && routeBox) return [(routeBox.s + routeBox.n) / 2, (routeBox.w + routeBox.e) / 2]; } catch (e) {} return [43.82, -79.57]; } // Beta 1.92 (deep audit F01): lastGood/routeBox are declared LATER in the assembled script - a bare typeof probe throws in the temporal dead zone during early boot (initTheme runs before they exist), which killed the boot outright when a stored override had no usable expiry. The probes are guarded so the fixed fallback below is actually reachable.
/** @param {number} ms @returns {boolean} */ function autoNightAt(ms) { const p = themePos(), st = sunTimes(ms, p[0], p[1]); if (!st) return false; if (st.rise != null && st.set != null) return ms >= st.set || ms < st.rise; if (st.rise == null && st.set == null) return st.polar === 'night'; // issue #180: a polar day is day and a polar night is night - the missing pair alone used to read as day either way
  if (st.set != null) return ms >= st.set; // one boundary only: the sun set without rising today (it was up from before) - night from the set on
  return ms < st.rise; } // the sun rises without setting today - night until the rise
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
    themeOverride = stored === '1'; themeOverrideUntil = (exp && isFinite(exp)) ? exp : nextSunBoundary(Date.now()); // a non-finite expiry (missing, corrupt, Infinity) recomputes the boundary instead of crashing or sticking forever
  }
})();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') themeTick(); });
/** @returns {number} */ function workDoneM() { let s = 0; for (const n of STREETNAMES) { const p = pieces[n]; STRETCH[n].parts.forEach((part, i) => { const L = segLenM(part); if (p[i] & 1) s += L; if (p[i] & 2) s += L; }); } return s; }
// the run's work only (stamped at/after Start): pre-Start marks would otherwise inflate the live rate
/** @returns {number} */ function liveWorkM() {
  if (!runStart) return 0; let s = 0;
  for (const n of STREETNAMES) { const p = pieces[n], T = pieceTimes[n] || {}; STRETCH[n].parts.forEach((part, i) => { const L = segLenM(part); const st = T[i] || [null, null]; if ((p[i] & 1) && st[0] && Date.parse(st[0]) >= runStart) s += L; if ((p[i] & 2) && st[1] && Date.parse(st[1]) >= runStart) s += L; }); }
  return s; }
/** @returns {number} */ function totalWorkM() { let s = 0; for (const n of STREETNAMES) s += STRETCH[n].total * 2; return s; }
// the sides record is the authority for completion, so it writes first: on failure the earlier coherent state survives
// returns the result (failedKey names the first failure; the primary flag arms a retry); storage never speaks
/** @returns {StorageOutcome} */ function saveAll() {
  if (PERSIST.fenced()) return storeFail('restoring', false); // while a restore pends, memory holds the pre-restore board: a save would resurrect it - fenced
  let failedKey = null;
  const ser = BOARD.serialiseLive(); // Arch-2: the board's stored strings are built once, in the module
  if (!lsSet(LS.sides, ser.sides)) failedKey = 'sides';
  else {
    if (!lsSet(LS.done, ser.done)) failedKey = 'done';
    if (!lsSet(LS.times, ser.times) && !failedKey) failedKey = 'times';
    if (!lsSet(LS.via, ser.via) && !failedKey) failedKey = 'via';
    if (!lsSet(LS.notes, JSON.stringify(notes)) && !failedKey) failedKey = 'notes';
    if (!lsSet(LS.hist, HIST.serialise()) && !failedKey) failedKey = 'history'; // the save writes the merge through the repository, never the bare view: the load strip stays a view
    if (!saveStart().ok && !failedKey) failedKey = 'start';
    if (!lsSet(LS.cov, ser.cov) && !failedKey) failedKey = 'coverage';
  }
  if (failedKey) { markDirty('primary'); return storeFail(failedKey, true); }
  markClean('primary');
  if (lsGet(LS.finclean) !== null) lsDel(LS.finclean); // a landed save discharges the cleanup obligation: stored notes/coverage are the in-memory ones now
  return storeOk();
}
// PERSIST, the scheduling owner: a flag clears only when its write lands; late writers resolve by name at flush time
/** @param {string} name @returns {Function|null} */ function lateFn(name) { const f = globalThis[name]; return typeof f === 'function' ? f : null; } // the step table's one late-writer resolution: app3 loads after app1, so its writers are resolved by name at flush time (and a partial load simply skips the step, exactly what the old typeof probes did)
const PERSIST = {
  flags: { trail: false, sess: false, snap: false, start: false, aux: false, primary: false, fixlog: false },
  windows: { trail: 0, cov: 0, fixlog: 0 }, // the last SUCCESSFUL write per throttled kind (0 = never: the first flush writes at once)
  fence: false,
  /** @param {string} kind @returns {void} */ markDirty(kind) { if (kind in this.flags) this.flags[kind] = true; },
  /** @param {string} kind @returns {void} */ markClean(kind) { if (kind in this.flags) this.flags[kind] = false; },
  /** @param {string} kind @returns {boolean} */ writePending(kind) { return !!this.flags[kind]; },
  /** @returns {boolean} */ fenced() { return this.fence; },
  /** @returns {void} */ fenceUp() { this.fence = true; },
  /** @returns {void} */ fenceDown() { this.fence = false; },
  /** @param {string} kind @returns {void} */ noteWrite(kind) { if (kind === 'trail') this.windows.trail = Date.now(); }, // a writer that landed its own write outside the flush (clearTrailAll, app4) restarts the kind's throttle window here
  /** @param {boolean} [force] @returns {void} */ flush(force) {
    if (this.fence) return;
    if (this.flags.aux && (force || Date.now() - this.windows.cov >= COV_SAVE_MS) && lsSet(LS.cov, BOARD.serialiseCov())) { this.flags.aux = false; this.windows.cov = Date.now(); }
    if (this.flags.trail && (force || Date.now() - this.windows.trail > TRAIL_FLUSH_MS) && saveTrail().ok) { this.flags.trail = false; this.windows.trail = Date.now(); }
    if (this.flags.sess && saveSess().ok) this.flags.sess = false;
    const saveFixLogFn = lateFn('saveFixLog');
    // the fix log flushes on the trail's cadence (re-stringifying it per fix is out); forced flushes always write
    if (this.flags.fixlog && saveFixLogFn && (force || Date.now() - this.windows.fixlog > TRAIL_FLUSH_MS) && saveFixLogFn().ok) { this.flags.fixlog = false; this.windows.fixlog = Date.now(); }
    if (this.flags.start) saveStart(); // saveStart re-arms the flag itself on failure
    const saveSnapFn = lateFn('saveSnap');
    if (this.flags.snap && saveSnapFn) saveSnapFn(); // the cancel snapshot retries on the same heartbeat (saveSnap, app3, manages its own flag via the doorway)
    const persistRunDistFn = lateFn('persistRunDist');
    if (force && runStart && persistRunDistFn) persistRunDistFn(true); // a forced flush is the page's last word: the counter banks with it, gated on a live run
    const bankMirrorFn = lateFn('bankRunDistMirror');
    if (runStart && bankMirrorFn) bankMirrorFn(); // the second copy writes only from this flush path (a different writer/cadence), so the records fail independently
    if (this.flags.primary) saveAll(); // a failed primary save retries here: saveAll clears the flag itself when a save lands whole
  },
};
// dirty-flag access: app3/app4 touch the flags only through these three functions, the retry machinery's one doorway
/** @param {string} kind @returns {void} */ function markDirty(kind) { PERSIST.markDirty(kind); }
/** @param {string} kind @returns {void} */ function markClean(kind) { PERSIST.markClean(kind); }
/** @param {string} kind @returns {boolean} */ function writePending(kind) { return PERSIST.writePending(kind); }
/** @returns {StorageOutcome} */ function saveTrail() { const ok = lsSet(LS.trail, JSON.stringify(trail)); return ok ? storeOk() : storeFail('trail', true); }
/** @returns {StorageOutcome} */ function saveSess() { const ok = lsSet(LS.sess, JSON.stringify(trailSessions)); return ok ? storeOk() : storeFail('sess', true); }
// the published flush handle (the walk is PERSIST.flush): drives force the page-death flush through this delegation
/** @param {boolean} [force] @returns {void} */ function flushAux(force) { PERSIST.flush(force); }
setInterval(() => { PERSIST.flush(false); themeTick(); }, 15000); // the same 15 s heartbeat also walks the day/night cycle across its boundaries
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') PERSIST.flush(true); });
window.addEventListener('pagehide', () => PERSIST.flush(true));

// the engine's host: it reads nothing directly; everything arrives through this object (getters for rebound state)
const GL_HOST = {
  MLAT, MLNG, PRIMARIES, SPOT, STRETCH, ROADS, names, jDistM, ptSegM, isNight,
  get pieces() { return BOARD.state().pieces; }, // Arch-2: read through the board module, so the engine sees the current binding after any restore/reset
  get selSet() { return selSet; },
  get selStretch() { return selStretch; },
  get activeRoute() { return activeRoute; },
  get glUnifyLabels() { return glUnifyLabels; },
};
