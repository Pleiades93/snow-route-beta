'use strict';
// ===== FRESH APP CORE (Beta 1 rebuild) — state, storage, geometry =====
const $ = id => document.getElementById(id);
const MLAT = 111320, MLNG = 80386;
const vvHeight = () => (window.visualViewport ? window.visualViewport.height : window.innerHeight); // visible-screen height (shrinks when the phone keyboard opens)
const YELLOW = '#ffc233', RED = '#ef476f', GREEN = '#06d6a0';
const MAIN = new Set(); // Beta 1.117: the active pack's main streets - filled per load by buildGeometry from pack.main (the values live in the pack, data.js)
const SPOT = {}; // Beta 1.117: the active pack's label-anchor hints - filled per load by buildGeometry from pack.spot
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
// Beta 1.117 (route separation, Andrew): ROUTE_PACKS itself is declared in
// data.js - packs are DATA (metadata + roads + reference), and the app holds
// no route of its own. ROADS/REFERENCE below are the LIVE working copies of
// the ACTIVE pack's geometry: empty until a pack loads, refilled in place by
// buildGeometry on every load/switch (never rebound, so every captured
// reference - GL_HOST's included - stays valid across a switch).
const ROADS = {};
const REFERENCE = {};
function routeKeys(id) { const p = 'snowroute.' + id + '.'; return { done: p + 'v2', times: p + 'v2.times', hist: p + 'v2.history', notes: p + 'v4.notes', via: p + 'v4.via', trail: p + 'v4.trail', cov: p + 'v4.cov', start: p + 'v5.start', flip: p + 'v5.flip', sides: p + 'v5.sides', sess: p + 'v5.sess', pre: p + 'v5.preload', snap: p + 'v5.snap', mig: p + 'v2.migrated', finclean: p + 'v5.finclean' }; } // Beta 1.94 (deep audit SR-193-02/03): two slot-local records join the layout - 'snap' is the running clean's persisted pre-Start board (Start writes it, Finish/Cancel delete it; transient, never backed up, not in ROUTE_FIELDS) and 'mig' is the legacy migration's explicit completion marker (see migrateLegacyRoute). Neither is a backup field. Beta 1.141 (Package A, DA-10): 'finclean' joins them on the same terms - the durable finish-cleanup obligation (finishRun's transaction writes it, saveAll's success discharges it, completeFinishCleanup completes it at load); transient, never backed up, not in ROUTE_FIELDS.
const LS_GLOBAL = { night: 'snowroute.v2.night', nightExp: 'snowroute.v2.nightExp', exp: 'snowroute.v5.export', prep: 'snowroute.prep.v1', lastArea: 'snowroute.v2.lastarea' }; // Beta 1.118: lastArea = the create flow's area pre-fill memory
const LEGACY_KEYS = { done: 'snowroute.v2', times: 'snowroute.v2.times', hist: 'snowroute.v2.history', notes: 'snowroute.v4.notes', via: 'snowroute.v4.via', trail: 'snowroute.v4.trail', cov: 'snowroute.v4.cov', start: 'snowroute.v5.start', flip: 'snowroute.v5.flip', sides: 'snowroute.v5.sides', sess: 'snowroute.v5.sess', snap: 'snowroute.v5.snap', finclean: 'snowroute.v5.finclean' }; // snap rides here too so LS.snap is defined on a legacy-fallback boot (the pre-1.76 app never wrote one - the key is simply absent there, which the cancel path already treats as 'no snapshot'); finclean rides for the same reason (Beta 1.141)
const ROUTE_FIELDS = ['done', 'times', 'hist', 'notes', 'via', 'trail', 'cov', 'start', 'flip', 'sides', 'sess'];
const PACK_FIELDS = ['name', 'area', 'main', 'spot', 'tileNames', 'box', 'roads', 'reference']; // Beta 1.131 (maintainability programme A): the ONE list of fields a route pack carries - normalizePack (create-packs.js) builds every validated pack by walking THIS list, so a field joins the pack format by joining this list (with its cleaner there); a field absent from the list does not survive validation, by construction. Deliberately distinct from ROUTE_FIELDS above: those are storage-slot fields, and 'snap' in particular is a slot field that is NOT a pack field (hand-carried at restore scope by design) - it must never be added here.
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
const GPS_STALE_MS = 45000; // a watch silent this long is restarted (app3) - a GPS policy
const TRAIL_FLUSH_MS = 45000; // the buffered trail write's flush interval (flushAux, below) - a STORAGE policy; see the fence above
const COV_SAVE_MS = 15000; // the coverage write's throttle window (flushAux, below; declared here with the rule constants since Beta 1.136 - its 1.135 flush discipline is unchanged)
const PACK_NAME_MAX = 60, PACK_AREA_MAX = 60, PACK_STREET_NAME_MAX = 60; // the pack validator's per-field character caps (normalizePack, create.js) - separate constants per field, per the fence above
const PACK_STREETS_MAX = 300, PACK_SEGS_MAX = 80, PACK_SEG_PTS_MAX = 4000, PACK_POINTS_MAX = 150000; // the pack validator's shape caps (normalizePack, create.js); PACK_SEGS_MAX (segments per street) and PACK_TILENAME_MAX (characters per tile name) both happen to be 80 - different policies, separate constants
const PACK_TILENAME_MAX = 80, PACK_TILENAMES_MAX = 400;
function slotKeys(id) { const rk = routeKeys(id); return ROUTE_FIELDS.map(f => rk[f]).concat(rk.snap); } // Beta 1.136 (programme F): a route slot's BACKUP keys as one list - the ROUTE_FIELDS keys plus the cancel snapshot - for the callers that enumerate keys without needing field names (the restore's rollback scope). Backup field loops keep walking ROUTE_FIELDS itself (they need the names), and route deletion keeps enumerating routeKeys' values (it wipes slots the backup never carries, pre/mig included).
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
function lsDel(k) { try { localStorage.removeItem(k); return true; } catch (e) { flagStorage(); return false; } }
const RAW_READ_FAILED = {}; // Beta 1.136 (programme F): rawRead's failure sentinel - a unique object no stored value can equal, so a THROWN read is distinguishable from an absent key (getItem's null), which lsGet deliberately cannot tell apart
function rawRead(k) { try { return localStorage.getItem(k); } catch (e) { return RAW_READ_FAILED; } } // Beta 1.136 (programme F): the ONE raw storage read for the backup paths - they read RAW by design (Beta 1.48, audit B04) and each caller keeps its own failure mode against the sentinel: the strict export aborts (null/undefined), the recovery export skips the field, the restore stops before writing // Beta 1.63 (audit F03): deletions report like writes - a failed removeItem used to be invisible while saveStart claimed success
// Storage outcomes (Beta 1.101, architecture Phase 3 / C2): every save-family function
// returns ONE shape - { ok, failedKey, retryPending } - so no caller ever has to guess
// what a save did. failedKey names the first record that failed (null on success);
// retryPending says a retry is armed in the dirty machinery. The raw layer below this
// contract stays primitive (lsSet/lsDel report a boolean, lsGet returns null); the
// contract lives in the save family (saveAll, saveStart, saveSnap, saveTrail, saveSess)
// and everything above it. Storage code never speaks to the user - messaging belongs
// to the app layer (saveAllWarned in app2).
function storeOk() { return { ok: true, failedKey: null, retryPending: false }; }
function storeFail(failedKey, retryPending) { return { ok: false, failedKey: failedKey || null, retryPending: !!retryPending }; }
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
function txSet(key, value) { if (!lsSet(key, value)) return Object.assign(storeFail(key, true), { failKind: 'write' }); return lsGet(key) === value ? storeOk() : Object.assign(storeFail(key, true), { failKind: 'verify' }); }
function txDel(key) { if (!lsDel(key)) return Object.assign(storeFail(key, true), { failKind: 'write' }); return rawRead(key) === null ? storeOk() : Object.assign(storeFail(key, true), { failKind: 'verify' }); } // Beta 1.141 verify cycle 1: a delete verifies through rawRead, never lsGet - lsGet reads a THROWN read as absent, so an unverifiable delete could claim success; through rawRead the thrown read is the RAW_READ_FAILED sentinel, a 'verify' failure like any other disagreement
function runTx(steps) {
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
function finishReconcileAction(startMs, lastStartedMs, boardEmpty) { if (!startMs || !lastStartedMs || startMs !== lastStartedMs) return 'none'; return boardEmpty ? 'complete' : 'rollback'; } function finishBoardMatch(entry, P, T, names) { if (!entry || !entry.sides || typeof entry.sides !== 'object' || !entry.sides.p || typeof entry.sides.p !== 'object') return false; const EP = entry.sides.p, ET = entry.sides.t && typeof entry.sides.t === 'object' ? entry.sides.t : {}; for (const n of names) { const ep = EP[n], cp = P[n]; if (!Array.isArray(ep) || !Array.isArray(cp) || ep.length !== cp.length) return false; for (let i = 0; i < ep.length; i++) if (ep[i] !== cp[i]) return false; const et = Array.isArray(ET[n]) ? ET[n] : [], ct = T && Array.isArray(T[n]) ? T[n] : [], lim = Math.max(et.length, ct.length); for (let i = 0; i < lim; i++) { const a = Array.isArray(et[i]) ? et[i] : null, b = Array.isArray(ct[i]) ? ct[i] : null; if ((a ? a[0] || null : null) !== (b ? b[0] || null : null) || (a ? a[1] || null : null) !== (b ? b[1] || null : null)) return false; } } return true; } function finishReconcileNoRunAction(markerRun, markerAt, lastRunId, boardEmpty, boardMatch) { if (markerRun !== 0 || !markerAt || !lastRunId || markerAt !== lastRunId || boardEmpty || !boardMatch) return 'none'; return 'rollback'; } // pure - fixture-proven in tests/browser/selftest-tx.mjs. Beta 1.104 (round 103, CG-103-02): the second argument is the newest archive entry's run identity (its runId), NOT its startedAt - strict equality on the identity is the whole contract // pure - fixture-proven in tests/browser/selftest-tx.mjs. Beta 1.146 (census C1): the no-run reconciliation's exactness witness - the loaded board still equals the archive entry's own snapshot (entry.sides, buildSnap's deep copy of pieces/pieceTimes) exactly: pieces elementwise, stamp pairs normalized to [string|null, string|null] so the loader's sanitize round-trip (sparse holes and JSON nulls both read as null) cannot false-mismatch. Any doubt reads as NO match (fail-closed: nothing is removed). // pure - fixture-proven in tests/browser/selftest-tx.mjs. Beta 1.146 (census C1): the NO-RUN interrupted finish's signature - the finclean marker of a run-less finish (run: 0, at: the finish time) and the newest entry's runId carrying that same at (finishRun stamps it), the board still holding the archived work exactly. An empty board means the finish completed (the entry stands; completeFinishCleanup owns the marker); anything missing or mismatched means nothing happens.
function parseJ(raw, fb) { if (raw == null) return fb; try { const v = JSON.parse(raw); return v == null ? fb : v; } catch (e) { return fb; } }
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
function loadSettings() {
  const raw = parseJ(lsGet(SETTINGS_KEY), null);
  const s = { vib: SETTINGS_DEF.vib, chime: SETTINGS_DEF.chime, chimeSound: SETTINGS_DEF.chimeSound };
  if (raw && typeof raw === 'object') {
    if (typeof raw.vib === 'boolean') s.vib = raw.vib;
    if (typeof raw.chime === 'boolean') s.chime = raw.chime;
    if (CHIME_KEYS.indexOf(raw.chimeSound) >= 0) s.chimeSound = raw.chimeSound;
  }
  s.awake = false; // Beta 1.112 (Andrew): screen-awake is SESSION-ONLY - forced OFF at every load, whatever any stored record says; the On-the-job toggle flips this in-memory field for the session only
  return s;
}
let settings = loadSettings();
function saveSettings() { return lsSet(SETTINGS_KEY, JSON.stringify({ vib: settings.vib, chime: settings.chime, chimeSound: settings.chimeSound })); } // only the persistent three - settings.awake is never written (Beta 1.112)
// Tap guard — 400 ms per control
const tapLast = {};
function tapGuard(key) { const now = Date.now(); if (tapLast[key] && now - tapLast[key] < 400) return false; tapLast[key] = now; return true; }

// ===== STRETCHES — stitch each street, cut at junctions (checklist SS1) =====
function stitchRuns(name, roads) { // Beta 1.144 (Package C, DA-02/C1): a street's segments chained into their CONNECTED RUNS - the pre-1.144 stitchLine growth (exact endpoint equality, same scan order, same concat operations) repeated per component, so a street whose segments form several disconnected runs (non-adjacent sector picks at create; genuinely split streets) keeps EVERY run instead of only the one connected to segment 0. Run 1 is byte-identical to the old stitchLine output for any street; a fully connected street has exactly one run and nothing changes anywhere.
  const segs = (roads || ROADS)[name].map(s => s.slice());
  const used = new Array(segs.length).fill(false);
  const eq = (p, q) => p[0] === q[0] && p[1] === q[1];
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
function stitchLine(name, roads) { return stitchRuns(name, roads)[0]; } // the first run - the pre-1.144 meaning, kept for callers that need a street's principal line
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
function finishJunctionCuts(line, cum, total, cuts) { // Beta 1.131 (maintainability programme N2): the ONE junction-cut finishing policy - sort the candidate cuts, merge cuts closer than 15 m into one, drop cuts within 12 m of either end, then slice the line at the surviving bounds. BOTH cutters finish through here: computeStretches (junctions = the route's own streets) and the create flow's sector cutter crStreetParts (junctions = the prepared extract). The junction SOURCES stay distinct by design; only this finishing policy is shared, with its exact inequalities and merge order - the pieces it returns are identical to the pre-1.131 duplicated blocks (identity proven in the 1.131 comparison harnesses).
  cuts.sort((a, b) => a - b);
  const merged = [];
  for (const c of cuts) { if (merged.length && c - merged[merged.length - 1] < 15) continue; merged.push(c); }
  const inner = merged.filter(c => c >= 12 && c <= total - 12);
  const bounds = [0, ...inner, total];
  const parts = [];
  for (let i = 1; i < bounds.length; i++) parts.push(sliceLine(line, cum, bounds[i - 1], bounds[i]));
  return parts;
}
const STRETCH = {};
function computeStretches(roads) { // Beta 1.117: the stretch builder as a PURE function of a roads object - the pre-1.117 eval-time IIFE, parameterized. buildGeometry fills the live STRETCH from it on every load; backup/restore (app4's packGeometry) builds a non-active pack's geometry from it without touching the live one (F6). Beta 1.144 (Package C, DA-02/C1): the builder runs PER RUN (stitchRuns) - each run is cut at the junctions ITS OWN line meets (other streets' vertices from ALL their runs; a street never cuts itself), the street's parts are the runs' parts concatenated in run order, and total is the SUM over runs, so a disconnected street is tracked whole: marking, totals and pace all see every metre that was saved. line/cum keep the first run (the principal line) for the readers that need a single line (fly-to centres); runs carries {line, cum, total, parts} per run for the consumers that must see them all (coverage samples, the paint engine). For a single-run street every field is exactly the pre-1.144 value.
  const out = {};
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
      for (const m of Object.keys(roads)) {
        if (m === n) continue;
        for (const mr of runsOf[m]) for (const v of mr.line) { const pr = projOnLine(run.line, run.cum, v); if (pr.off <= 4) cuts.push(pr.d); }
      }
      run.parts = finishJunctionCuts(run.line, run.cum, run.total, cuts);
      for (const p of run.parts) parts.push(p);
    }
    const r0 = runsOf[n][0];
    out[n] = { line: r0.line, cum: r0.cum, total: totals[n], parts, runs: runsOf[n] };
  }
  return out;
}
function computeRouteBox(roads) { // the roads' bounding box, or null for an empty pack (no route baked in: pre-load there is no box at all)
  let w = 1e9, s = 1e9, e = -1e9, n = -1e9, any = false;
  for (const nm of Object.keys(roads)) for (const seg of roads[nm]) for (const p of seg) { any = true; w = Math.min(w, p[1]); e = Math.max(e, p[1]); s = Math.min(s, p[0]); n = Math.max(n, p[0]); }
  return any ? { w, s, e, n } : null;
}
const STREETNAMES = [];
const names = STREETNAMES; // the paint engine's name for the street list

// ===== STATE =====
const STREETSET = new Set();
function buildGeometry(pack) { // Beta 1.117 (F1): ALL route geometry is (re)built HERE, per load, from the pack - nothing route-shaped is computed at script eval any more. The live containers (ROADS/REFERENCE/STRETCH/STREETNAMES/STREETSET/MAIN/SPOT, app2's routeBox and ROUTE_TILE_NAMES, app3's SAMPLES) are refilled IN PLACE, never rebound, so references captured earlier (GL_HOST's plain entries above all) stay valid. Runs BEFORE loadRouteState: the state sanitizers filter against this geometry. buildSamples (app3) and the paint engine's rebuild (GLP.rebuildRoute, called by loadRoute) complete the per-load rebuild.
  const roads = (pack && pack.roads) || {}, reference = (pack && pack.reference) || {};
  for (const k of Object.keys(ROADS)) delete ROADS[k]; Object.assign(ROADS, roads);
  for (const k of Object.keys(REFERENCE)) delete REFERENCE[k]; Object.assign(REFERENCE, reference);
  const built = computeStretches(ROADS);
  for (const k of Object.keys(STRETCH)) delete STRETCH[k]; Object.assign(STRETCH, built);
  STREETNAMES.length = 0; for (const n of Object.keys(ROADS)) STREETNAMES.push(n);
  STREETSET.clear(); for (const n of STREETNAMES) STREETSET.add(n);
  MAIN.clear(); for (const n of ((pack && pack.main) || [])) if (STREETSET.has(n)) MAIN.add(n);
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
function isFullRun(h) { return !!(h && h.items && Object.keys(h.items).length >= STREETNAMES.length); } // Beta 1.94 (audit F-01): the street count derives from the route's own street list, never a hard-coded 34 - the same derivation replaces every hard-coded count in the app this round
function trimHistory(list) { const out = list.slice(); while (out.length > 10) { const i = out.findIndex(h => !isFullRun(h)); out.splice(i >= 0 ? i : 0, 1); } return out; }
function trimHistoryForFinish(list, entry) { const old = list.slice(); while (old.length > 9) { const i = old.findIndex(h => !isFullRun(h)); old.splice(i >= 0 ? i : 0, 1); } return [...old, entry]; } // Beta 1.104 (round 103, CG-103-01): the finish path's append - eviction is chosen ONLY among the pre-existing entries (oldest non-full first, else oldest overall - the trimHistory rule, capped at 9 kept) so the incoming archive can never evict itself; trimHistory itself is unchanged for saveHistory. Fixture-proven in tests/browser/selftest-history.mjs
function saveHistory() { history = trimHistory(history); return lsSet(LS.hist, JSON.stringify(history)); } // Beta 1.63 (audit F04): the delete-clean handler branches on this
let startDirty = false; // Beta 1.92 (deep audit F05): a failed start write/delete arms this retry, walked by the flushAux heartbeat until it lands - a stale start key must never resurrect a finished run on the next boot
let snapDirty = false; // Beta 1.94 (deep audit SR-193-02): the same retry discipline for the persisted pre-Start snapshot (saveSnap, app3) - a failed snapshot write is retried by flushAux until it lands
function saveStart() { const ok = runStart ? lsSet(LS.start, String(runStart)) : lsDel(LS.start); startDirty = !ok; return ok ? storeOk() : storeFail('start', true); } // Beta 1.57: reports its result like every other write, for the saveAll contract
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
  reconcileInterruptedFinish(); // Beta 1.102 (Phase 4, CG-196-04): resolve a finish that died between its gates before anything renders this state
  completeFinishCleanup(); // Beta 1.141 (Package A, DA-10): complete a committed finish's metadata cleanup if its writes failed and a reload outlived the in-memory retry
}
function reconcileInterruptedFinish() { // a finish killed mid-transaction runs no rollback; its two harmful prefixes share one signature in EXISTING records - the newest archive entry belongs to the run still marked active (its runId === the stored start; a later run's start is a later millisecond, so no live state collides). Board still marked: the archive write was the only gate that landed - remove that entry (verified) and the run resumes intact. Board already cleared: the finish effectively happened - delete the start key (verified) and it stands committed. No signature: nothing to do. An under-3 finish writes no archive, so its prefixes look exactly like a fresh empty run - coherent as one, left alone. Beta 1.104 (round 103, CG-103-02): the signature key is the entry's runId, never startedAt - startedAt is the real work start and predates the stored start whenever a street was marked before Start was pressed, which used to defeat both branches; entries written before 1.104 carry no runId and are never reconciled (missing identity = no signature). Beta 1.146 (census C1): the NO-RUN finish (marked board, never Started) gets the parallel signature below - its entry's runId is the finish's own finclean marker time (finishRun stamps it), so a kill between the archive and sides gates is resolvable exactly the same way: marker run 0 + entry runId === marker at + the board still equalling the entry's snapshot removes the phantom entry (verified write first; the marker is cleared only after that removal verifies, so a failed removal leaves the full signature for the next boot); an empty board means that finish completed and its entry stands.
  if (!history.length) return;
  const last = history[history.length - 1];
  const lastMs = last && last.runId ? (+last.runId || 0) : 0; // Beta 1.104 (CG-103-02): the entry's run identity; an entry without one yields 0 and can never match a run start. Beta 1.146: in the no-run branch below this same value must equal the finclean marker's at
  const boardEmpty = STREETNAMES.every(n => pieces[n].every(v => v === 0));
  if (runStart) { const act = finishReconcileAction(runStart, lastMs, boardEmpty); if (act === 'rollback') { const trimmed = history.slice(0, -1); if (txSet(LS.hist, JSON.stringify(trimmed)).ok) history = trimmed; } else if (act === 'complete') { if (txDel(LS.start).ok) runStart = 0; } return; }
  const marker = parseJ(lsGet(LS.finclean), null); const markerRun = marker && typeof marker === 'object' && !Array.isArray(marker) ? marker.run : null; const markerAt = marker && typeof marker === 'object' ? (+marker.at || 0) : 0; const boardMatch = !boardEmpty && finishBoardMatch(last, pieces, pieceTimes, STREETNAMES);
  if (finishReconcileNoRunAction(markerRun, markerAt, lastMs, boardEmpty, boardMatch) === 'rollback') { const trimmed = history.slice(0, -1); if (txSet(LS.hist, JSON.stringify(trimmed)).ok) { history = trimmed; txDel(LS.finclean); } }
}
function completeFinishCleanup() { // Beta 1.141 (Package A, DA-10): finishRun's transaction writes the slot's finclean record as its first step, so a COMMITTED finish whose post-commit metadata writes then failed (notes/coverage refuse; the primaryDirty retry is in-memory and dies with the page) leaves a DURABLE obligation behind. This completes it at load. Guards, all required: the obligation exists; no run is live (a live run owns notes/coverage - its data is never touched); the loaded board is the cleared board a committed finish leaves (a restored or cancelled live board is non-empty and untouchable). The cleanup is two verified writes of the same '{}' saveAll writes for a finished board; only when BOTH verify do the in-memory copies clear and the obligation delete. Any failure leaves the obligation (and the loaded state, which then matches storage) for the next load - idempotent, safe on every load, a single read on a clean slot.
  if (runStart) return;
  if (lsGet(LS.finclean) === null) return;
  if (!STREETNAMES.every(n => pieces[n].every(v => v === 0))) return;
  if (!txSet(LS.notes, '{}').ok) return;
  if (!txSet(LS.cov, '{}').ok) return;
  notes = {}; coveredIdx = {}; suggested = new Set();
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
// record is named in the returned result's failedKey. Callers that warn go
// through saveAllWarned (app2), which raises one warning per failure episode;
// the finish transaction calls saveAll directly and does its own gated
// writes and messaging. (Beta 1.101, Phase 3: the old global failure key, the
// quiet toggle and the warned flag are retired - outcomes travel in the
// returned result, and messaging lives in the app layer.)
let primaryDirty = false; // Beta 1.94 (deep audit SR-193-05): a failed saveAll arms this flag and flushAux's heartbeat retries the primary save until it lands. Before 1.94 the heartbeat retried only the auxiliary records and the start key, so a failed metadata write (notes/times/via/done/history) waited for the next incidental save - while Finish's own message promised a retry nothing performed.
function saveAll() { // Beta 1.101 (Phase 3 / C2): returns the storage-outcome result - the first failing record is named in failedKey and a retry is armed via primaryDirty. No toast here: storage never speaks to the user (saveAllWarned in app2 owns the warning).
  let failedKey = null;
  if (!lsSet(LS.sides, JSON.stringify({ p: pieces, t: pieceTimes }))) failedKey = 'sides';
  else {
    if (!lsSet(LS.done, JSON.stringify([...doneSet]))) failedKey = 'done';
    if (!lsSet(LS.times, JSON.stringify(doneTimes)) && !failedKey) failedKey = 'times';
    if (!lsSet(LS.via, JSON.stringify(doneVia)) && !failedKey) failedKey = 'via';
    if (!lsSet(LS.notes, JSON.stringify(notes)) && !failedKey) failedKey = 'notes';
    if (!lsSet(LS.hist, JSON.stringify(history)) && !failedKey) failedKey = 'history';
    if (!saveStart().ok && !failedKey) failedKey = 'start';
    if (!lsSet(LS.cov, JSON.stringify(coveredIdx)) && !failedKey) failedKey = 'coverage';
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
function markDirty(kind) { if (kind === 'trail') trailDirty = true; else if (kind === 'sess') sessDirty = true; else if (kind === 'snap') snapDirty = true; else if (kind === 'start') startDirty = true; else if (kind === 'aux') auxDirty = true; else if (kind === 'primary') primaryDirty = true; }
function markClean(kind) { if (kind === 'trail') trailDirty = false; else if (kind === 'sess') sessDirty = false; else if (kind === 'snap') snapDirty = false; else if (kind === 'start') startDirty = false; else if (kind === 'aux') auxDirty = false; else if (kind === 'primary') primaryDirty = false; }
function writePending(kind) { return kind === 'trail' ? trailDirty : kind === 'sess' ? sessDirty : kind === 'snap' ? snapDirty : kind === 'start' ? startDirty : kind === 'aux' ? auxDirty : kind === 'primary' ? primaryDirty : false; }
// Aux flush (production model): the trail JSON is the big write (~250 KB at cap) - at most every 45 s while
// recording, always when forced (page hide/close). Dirty flags clear ONLY when the write actually lands, so a
// failed write is retried by the next flush instead of silently dropping GPS points. While `restoring` is set
// (a restore is mid-flight), flushes are refused so the restore's reload cannot clobber the restored data.
let trailDirty = false, auxDirty = false, sessDirty = false, lastTrailSave = 0, restoring = false; // Beta 1.73 (audit C04/C05): sessDirty is the session markers' retry flag, same discipline as trailDirty - a failed marker write is retried by flushAux instead of being silently dropped
function saveTrail() { const ok = lsSet(LS.trail, JSON.stringify(trail)); return ok ? storeOk() : storeFail('trail', true); }
function saveSess() { const ok = lsSet(LS.sess, JSON.stringify(trailSessions)); return ok ? storeOk() : storeFail('sess', true); }
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
function flushAux(force) {
  if (restoring) return;
  if (auxDirty && (force || Date.now() - lastCovSave >= COV_SAVE_MS) && lsSet(LS.cov, JSON.stringify(coveredIdx))) { auxDirty = false; lastCovSave = Date.now(); }
  if (trailDirty && (force || Date.now() - lastTrailSave > TRAIL_FLUSH_MS) && saveTrail().ok) { trailDirty = false; lastTrailSave = Date.now(); }
  if (sessDirty && saveSess().ok) sessDirty = false;
  if (startDirty) saveStart(); // Beta 1.92 (audit F05): saveStart re-arms the flag itself on failure
  if (snapDirty && typeof saveSnap === 'function') saveSnap(); // Beta 1.94 (SR-193-02): the cancel snapshot retries on the same heartbeat (saveSnap lives in app3 beside runSnap; the typeof probe keeps this safe in any partial-load state)
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
// the plain entries are the LIVE containers (MAIN/SPOT/STRETCH/ROADS/names)
// - buildGeometry refills them in place per load, so the engine's captured
// references stay valid across a switch and GLP.rebuildRoute re-reads them.
// Guarded by tests/browser/selftest-engine-surface.mjs (the frozen list).
const GL_HOST = {
  MLAT, MLNG, MAIN, SPOT, STRETCH, ROADS, names, jDistM, ptSegM, isNight,
  get pieces() { return pieces; },
  get selSet() { return selSet; },
  get selStretch() { return selStretch; },
  get activeRoute() { return activeRoute; },
  get glHideLabels() { return glHideLabels; },
};
