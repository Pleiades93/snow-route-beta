
// ===== EXPORT / BACKUP / RESTORE (production showX model: one panel, four modes) =====
function fmtStamp(iso) { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString() + ' ' + fmtClock(d); }
function buildReport() {
  const byTime = m => (a, b) => String(m[a] || '').localeCompare(String(m[b] || ''));
  const ts = [...doneSet].map(n => Date.parse(doneTimes[n])).filter(t => !isNaN(t)).sort((a, b) => a - b);
  const L = ['Snow Route — snow log', 'Exported: ' + fmtStamp(new Date().toISOString()), 'Completed: ' + doneSet.size + ' of ' + STREETNAMES.length]; // Beta 1.94 (audit F-01): the total derives from the route's street list
  if (ts.length) {
    const startMs = (runStart && runStart <= ts[0]) ? runStart : ts[0]; // Beta 1.71 (audit B05): one start for the whole log - the real clean start when it is recorded, the first completion only as the fallback for states that never recorded one. The 1.70 round had aligned the distance to the real start but left Started/Duration on the first completion, so the log disagreed with itself
    L.push('Started: ' + fmtStamp(new Date(startMs).toISOString()) + '   Last: ' + fmtStamp(new Date(ts[ts.length - 1]).toISOString()) + '   Duration: ' + fmtDur(ts[ts.length - 1] - startMs));
    if (trail.length > 1) L.push('GPS distance since start: ' + trailKm(startMs).toFixed(1) + ' km');
  }
  L.push('', 'Street, Completed');
  [...doneSet].sort(byTime(doneTimes)).forEach(n => L.push(n + ', ' + (doneTimes[n] ? fmtStamp(doneTimes[n]) : '(no time)') + (doneVia[n] === 'gps' ? ' (GPS-verified)' : '')));
  const todo = STREETNAMES.filter(n => !doneSet.has(n));
  if (todo.length) L.push('', 'Not done: ' + todo.join(', '));
  const fl = STREETNAMES.filter(n => notes[n] && notes[n].length);
  if (fl.length) { L.push('', 'Notes & flags:'); fl.forEach(n => L.push(n + ' — ' + flagText(n))); }
  history.slice().reverse().forEach(h => {
    const items = h.items || {}, ks = Object.keys(items).sort(byTime(items));
    L.push('', 'Archived run (finished ' + fmtStamp(h.at) + ', ' + ks.length + ' streets' + (h.startedAt ? ', started ' + fmtStamp(h.startedAt) : '') + (h.km ? ', ' + h.km + ' km' : '') + ')');
    ks.forEach(n => L.push(n + ', ' + (items[n] ? fmtStamp(items[n]) : '(no time)') + ((h.via || {})[n] === 'gps' ? ' (GPS-verified)' : '')));
  });
  return L.join('\n');
}
function buildGpx() { // Beta 1.99 (Phase 2, C1): segmentation - gap rule (1.70, audit A07: separate sessions get separate segments instead of one line stitched across days), session-start splits (1.71, B02) and the marker pointer walk with its backward re-seek (1.73 C07 / 1.74 D01) - lives in trailSegments (app1) now; this consumer only renders the segments as GPX tracks
  const pt = p => '<trkpt lat="' + p[0] + '" lon="' + p[1] + '"><time>' + new Date(p[2] * 1000).toISOString() + '</time></trkpt>\n';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Snow Route Beta"><trk><name>Snow Route trail</name><trkseg>\n' + trailSegments(trail, trailSessions).map(seg => seg.map(pt).join('')).join('</trkseg><trkseg>\n') + '</trkseg></trk></gpx>';
}
let xMode = 'menu';
function showX(mode) { // Beta 1.89 (Andrew): the backup pane is a small menu tree, not a form - the menu holds exactly Backup (JSON) / Restore backup (Beta 1.111: Download offline maps moved to the Status pane, machinery and all); Restore backup opens the restore menu (Import JSON / Import Text); Import Text opens the paste box with Import backup under it. The always-on text box and the Share/Copy buttons are gone: Backup (JSON)'s save prompt IS the share now
  xMode = mode;
  const menu = mode === 'menu', restore = mode === 'restore', text = mode === 'text';
  $('xOpts').style.display = menu ? '' : 'none';
  $('xRestoreOpts').style.display = restore ? '' : 'none';
  const ta = $('xText');
  ta.style.display = text ? '' : 'none';
  ta.readOnly = !text;
  $('xImp').style.display = text ? '' : 'none';
  $('xTitle').textContent = menu ? 'Backup' : restore ? 'Restore' : 'Import Text';
  if (text) { ta.value = ''; ta.placeholder = 'Paste a backup here, then tap Import backup'; }
}
function openExport() { showX('menu'); showSetPane('setBackupPane'); $('setVer').textContent = $('ver').textContent; $('setMenu').classList.add('open'); } // Beta 1.89: opening Backup lands on the backup menu (Beta 1.111: two options - the maps download lives in Status now)
$('xBak').addEventListener('click', () => shareBackup());
$('xRes').addEventListener('click', () => showX('restore'));
$('xImpText').addEventListener('click', () => showX('text'));
$('xImpFile').addEventListener('click', () => $('xFile').click());
$('xFile').addEventListener('change', async () => { const f = $('xFile').files && $('xFile').files[0]; $('xFile').value = ''; if (!f) return; let t = ''; try { t = await f.text(); } catch (e) { toast('That file could not be read', 3200); return; } $('xText').value = t; doRestore(); }); // Import JSON: the picked file feeds the SAME restore path as pasted text - one validator, one verdict, no second door to keep honest
function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400); }
function snapForExport(strict) { // Beta 1.97 (audit loop CG-196-02): the ACTIVE route's cancel snapshot in normalized object form - from the in-memory snapshot when there is one, else from the persisted copy after validation; null when the run has neither. Extracted from 1.96's recoveryObj so the normal backup carries the identical object through the identical construction. Verify cycle 1 (CG-196-02): in STRICT mode (the normal backup) a snapshot READ failure returns undefined instead of null - lsGet swallows read errors, which would silently ship a snapshot-less backup that looks complete; the strict caller fails the whole export, the recovery caller stays best-effort.
  if (!runStart) return null;
  if (runSnap) return { at: runStart, pieces: runSnap.pieces, pieceTimes: runSnap.pieceTimes, done: runSnap.done, times: runSnap.times, via: runSnap.via, cov: runSnap.cov };
  let rawSnap = null;
  if (strict) { try { rawSnap = localStorage.getItem(LS.snap); } catch (e) { return undefined; } }
  else rawSnap = lsGet(LS.snap);
  const pv = validateSnap(parseJ(rawSnap, null), runStart);
  return pv ? { at: runStart, pieces: pv.pieces, pieceTimes: pv.pieceTimes, done: pv.done, times: pv.times, via: pv.via, cov: pv.cov } : null;
}
function backupObj() { // Beta 1.76: format v2 - routes carry their own slots ({routes: {id: {field: raw}}}) and the night preference rides at top level. Reads stay RAW (Beta 1.48, audit B04): a failed read fails the whole export (null) instead of producing a valid-looking backup with a piece silently missing.
  flushAux(true); // Beta 1.92 (deep audit F04): flush the buffered trail/coverage first - a backup must not lag the work it claims to hold
  // Beta 1.94 (deep audit SR-193-01): the PRIMARY records get the same reconciliation the aux
  // records got in 1.93 (R02) - but only when a reconciliation is OWED, which is exactly when
  // a primary save has failed (primaryDirty, SR-193-05): memory is then ahead of storage, and
  // the raw export below would ship the OLD board as current, silently, in a valid-looking
  // file. Attempt the verified save first; if it still cannot land, refuse the export (null),
  // exactly like R02. When no save has failed, storage already holds the last verified save,
  // so the export reads it raw and writes nothing - an export of never-resaved loaded state
  // (drive121's frozen fixture) stays byte-true to what is stored, loader derivations and
  // all. Quiet on purpose: the caller's 'could not be read' message is the honest report.
  if (routeLoaded && writePending('primary')) { const okPrim = saveAll().ok; if (!okPrim) return null; }
  if (writePending('trail') || writePending('aux') || writePending('sess')) return null; // Beta 1.93 (follow-up audit R02): the flush did not land - refuse the export (the caller's 'could not be read' message) rather than ship a valid-looking backup with stale trail/coverage inside
  const routes = {};
  for (const p of ROUTE_PACKS) {
    const rk = routeKeys(p.id); const data = {};
    for (const f of ROUTE_FIELDS) { const key = (activeRoute && p.id === activeRoute.id && LS[f] !== rk[f]) ? LS[f] : rk[f]; let v = null; try { v = localStorage.getItem(key); } catch (e) { return null; } if (v != null) data[f] = v; }
    // Beta 1.97 (audit loop CG-196-01/-02): the route's lifecycle state rides EXPLICITLY, never by
    // omission. A run's start is asserted as its timestamp string; NO run is asserted as start: null -
    // so a restore can tell "this backup says idle" from an older backup that simply omits the field
    // (the missing-key rule, which leaves the destination's state alone). A run's validated cancel
    // snapshot rides along (CG-196-02 - 1.96 carried it in recovery backups only): the active route's
    // from the shared exporter, any other pack's from its stored copy after validation.
    const isActive = !!(activeRoute && p.id === activeRoute.id && routeLoaded);
    const startStr = isActive ? (runStart ? String(runStart) : null) : (data.start !== undefined ? data.start : null);
    data.start = startStr;
    if (startStr) {
      let snapObj = null;
      if (isActive) { snapObj = snapForExport(true); if (snapObj === undefined) return null; } // a snapshot read failure fails the whole export (B04 discipline) - never a valid-looking backup missing the snapshot
      else { let rawSnap = null; try { rawSnap = localStorage.getItem(rk.snap); } catch (e) { return null; } const pv = validateSnap(parseJ(rawSnap, null), +startStr); if (pv) snapObj = { at: +startStr, pieces: pv.pieces, pieceTimes: pv.pieceTimes, done: pv.done, times: pv.times, via: pv.via, cov: pv.cov }; }
      if (snapObj) data.snap = JSON.stringify(snapObj);
    }
    routes[p.id] = data;
  } // Beta 1.92 (deep audit F02): the ACTIVE route exports from the key mapping it is actually running on - on a legacy-fallback boot (migration failed) LS points at the legacy keys, and reading the fresh slot would emit a valid-looking EMPTY backup
  let night = null; try { night = localStorage.getItem(LS_GLOBAL.night); } catch (e) { return null; }
  let nightExp = null; try { nightExp = localStorage.getItem(LS_GLOBAL.nightExp); } catch (e) { return null; }
  const o = { app: 'snowroute-backup', v: 2, at: new Date().toISOString(), routes };
  if (night != null) o.night = night;
  if (nightExp != null) o.nightExp = nightExp; // Beta 1.77: the theme override and its expiry travel together (an override without its expiry is read as expiring at the next boundary)
  return o;
}
function buildBackup() { const o = backupObj(); return o ? JSON.stringify(o, null, 1) : null; }
function recoveryObj() { // Beta 1.95 (deep audit SR-194-02): the RECOVERY backup - the live IN-MEMORY state of the active route, serialized directly. The normal Backup reads storage and REFUSES when storage is behind memory (it would ship a stale board as current); that refusal left the storage-failure warnings' "export a backup now" unactionable in exactly the state they fire in - the marks at risk had no exit before a reload. This export is that exit: same envelope (it restores through the normal path), plus the recovery marker, and the file/labels say plainly that it holds unsaved live data. It never reads the board from storage and never writes anything.
  if (!routeLoaded || !activeRoute) return null;
  const data = {};
  data.sides = JSON.stringify({ p: pieces, t: pieceTimes });
  data.done = JSON.stringify([...doneSet]);
  data.times = JSON.stringify(doneTimes);
  data.via = JSON.stringify(doneVia);
  data.notes = JSON.stringify(notes);
  data.hist = JSON.stringify(history);
  data.trail = JSON.stringify(trail);
  data.cov = JSON.stringify(coveredIdx);
  data.sess = JSON.stringify(trailSessions);
  data.start = runStart ? String(runStart) : null; // Beta 1.97 (audit loop CG-196-01): the recovery backup asserts idle explicitly too - it is a complete backup by construction
  if (runStart) { // Beta 1.96 (deep audit SR-195-02, Andrew's pick: carry it, do not just warn): the run's cancel snapshot rides INSIDE the recovery file, so a run restored from it - on this phone or another - keeps the exact-restore Cancel it had. 1.95's recovery carried every field except the snapshot, quietly demoting a restored run's Cancel to the stamp journal (which cannot see an unmark). Taken from the in-memory snapshot when there is one, else from the persisted copy after validation; a run with neither simply carries none, and the restore side says so.
    const snapObj = snapForExport(); // Beta 1.97 (audit loop CG-196-02): the shared construction - the recovery and normal backups carry the identical object
    if (snapObj) data.snap = JSON.stringify(snapObj);
  }
  try { const fl = localStorage.getItem(routeKeys(activeRoute.id).flip); if (fl != null) data.flip = fl; } catch (e) { /* a read that fails simply leaves the field out */ }
  const routes = {}; routes[activeRoute.id] = data;
  for (const pk of ROUTE_PACKS) { if (pk.id === activeRoute.id) continue; const rk = routeKeys(pk.id); const d = {}; for (const f of ROUTE_FIELDS) { try { const v = localStorage.getItem(rk[f]); if (v != null) d[f] = v; } catch (e) {} } if (d.start === undefined) d.start = null; if (Object.keys(d).length) routes[pk.id] = d; } // Beta 1.97 (audit loop CG-196-01): an untouched pack in a recovery file asserts idle like any complete backup
  const o = { app: 'snowroute-backup', v: 2, recovery: true, at: new Date().toISOString(), routes };
  try { const nt = localStorage.getItem(LS_GLOBAL.night); if (nt != null) o.night = nt; const ne = localStorage.getItem(LS_GLOBAL.nightExp); if (ne != null) o.nightExp = ne; } catch (e) {}
  return o;
}
function buildRecovery() { const o = recoveryObj(); return o ? JSON.stringify(o, null, 1) : null; }
// Beta 1.96: downloadBackup follows the same one-button rule as shareBackup - a build failure is the recovery fallback, never a dead-end refusal.
function downloadBackup() { const b = buildBackup(); if (!b) { shareRecovery(true); return; } dl(new Blob([b], { type: 'application/json' }), 'snowroute-backup.json'); noteExported(); toast('Backup downloaded'); } // Beta 1.48 (audit B09): the filename still carried the retired 5W name; the backup format and its internal marker are unchanged
function clearTrailAll() { // Beta 1.88: the Clear trail BUTTON left with the old Snow log (Andrew: the clearing gets re-homed in a later round) - the clearing itself stays as one callable piece, two-tap guard and all its storage honesty intact, so the re-home is a button wired to this, not a rebuild
  trail = []; trailSessions = []; const okSessClr = saveSess().ok; if (!okSessClr) markDirty('sess'); drawTrail(true); // Beta 1.71 (audit B02): the markers describe this trail - clearing the trail clears them. Beta 1.73 (audit C05): the marker write is CHECKED like the trail write - 1.71 dropped its result, so 'Trail cleared' could be claimed while the markers stayed stored
  // The clear is a storage write like any other: if it fails, the stored trail still holds every point and
  // would resurrect on the next load - say so honestly and keep the clear pending (trailDirty) so the flush retries it.
  const okTrailClr = saveTrail().ok;
  if (okTrailClr && okSessClr) { markClean('trail'); lastTrailSave = Date.now(); toast('Trail cleared'); }
  else if (okTrailClr) { toast('Trail cleared, but the session markers could not be saved — will keep retrying', 3200); }
  else { markDirty('trail'); toast('Trail cleared on screen, but saving failed — will keep retrying', 3200); }
}
function countUnknownNames(parsed) { // Beta 1.95 (deep audit SR-194-08): how many street names in a backup this route does not know - counted from the RAW parsed backup, BEFORE any normalization, each name ONCE. 1.94 counted what survived pushField into the write list: an object-form done map was filtered to known streets before it was pushed (its unknowns invisible), history entries in the legacy array form were skipped entirely, and a name repeated across fields counted per occurrence. The restore itself is unchanged; only the report is honest now.
  const bad = new Set();
  const noteName = n => { if (typeof n === 'string' && !STREETSET.has(n)) bad.add(n); };
  const fromObj = o => { if (o && typeof o === 'object' && !Array.isArray(o)) for (const k of Object.keys(o)) noteName(k); };
  const scanData = (data) => {
    if (!data || typeof data !== 'object') return;
    const done = parseJ(data.done, null); if (Array.isArray(done)) { for (const n of done) noteName(n); } else fromObj(done);
    fromObj(parseJ(data.times, null)); fromObj(parseJ(data.via, null)); fromObj(parseJ(data.cov, null));
    const notesRaw = parseJ(data.notes, null); if (Array.isArray(notesRaw)) { for (const e of notesRaw) { if (e && typeof e === 'object') noteName(e.k); } } else fromObj(notesRaw); // Beta 1.96 (deep audit SR-195-05): notes in the OBJECT form ({street: [entries]}) - a shape the app itself never writes, but the restore's shape check accepts it and the loader then drops its names; 1.95's counter scanned only the array form, so those names vanished uncounted
    const sides = parseJ(data.sides, null); if (sides && typeof sides === 'object') { fromObj(sides.p); fromObj(sides.t); }
    const hist = parseJ(data.hist, null); if (Array.isArray(hist)) for (const h of hist) { if (h && typeof h === 'object') { if (Array.isArray(h.items)) { for (const n of h.items) noteName(n); } else fromObj(h.items); } }
  };
  if (parsed.v === 2 && parsed.routes && typeof parsed.routes === 'object') { for (const id of Object.keys(parsed.routes)) scanData(parsed.routes[id]); }
  else if (parsed.v === 1 && parsed.data && typeof parsed.data === 'object') { const lf = {}; for (const f of Object.keys(LEGACY_KEYS)) { if (parsed.data[LEGACY_KEYS[f]] != null) lf[f] = parsed.data[LEGACY_KEYS[f]]; } scanData(lf); }
  return bad.size;
}
function restoreBackup(parsed) { // production doRestore semantics: validate EVERYTHING before writing; snapshot; write + verify each; verified rollback on any failure
  if (!parsed || parsed.app !== 'snowroute-backup') { toast('That is not a Snow Route backup', 3200); return; }
  const FIELD_SHAPES = { done: 'arr', times: 'obj', hist: 'arr', notes: 'obj', via: 'obj', trail: 'arr', cov: 'obj', sides: 'obj', sess: 'arr' };
  const entries = []; // [targetKey, value]
  const pushField = (targetKey, field, v, label) => {
    if (typeof v !== 'string') { toast('Backup has a bad value for ' + label + ' — nothing was changed', 3200); return false; }
    const shape = FIELD_SHAPES[field];
    if (shape) {
      let pv; try { pv = JSON.parse(v); } catch (e) { toast('Backup value for ' + label + ' is not valid JSON — nothing was changed', 3200); return false; }
      if (field === 'done' && pv && typeof pv === 'object' && !Array.isArray(pv)) {
        v = JSON.stringify(Object.keys(pv).filter(nm => pv[nm] && STREETSET.has(nm))); // legacy done-set was a street->time map; migrate like the loader does
      } else if (shape === 'arr' ? !Array.isArray(pv) : !(pv && typeof pv === 'object' && !Array.isArray(pv))) { toast('Backup value for ' + label + ' has the wrong shape — nothing was changed', 3200); return false; }
    }
    entries.push([targetKey, v]); return true;
  };
  let snapDropped = false; // Beta 1.96 (SR-195-02): set when a backup CARRIES a start snapshot that cannot be restored with its run - the result message must say so
  if (parsed.v === 2) {
    if (!parsed.routes || typeof parsed.routes !== 'object' || Array.isArray(parsed.routes)) { toast('That is not a Snow Route backup', 3200); return; }
    for (const id of Object.keys(parsed.routes)) {
      const pack = ROUTE_PACKS.find(p => p.id === id); if (!pack) { toast('Backup mentions an unknown route (' + id + ') — nothing was changed', 3200); return; }
      const data = parsed.routes[id]; if (!data || typeof data !== 'object' || Array.isArray(data)) { toast('That is not a Snow Route backup', 3200); return; }
      const rk = routeKeys(id);
      for (const f of ROUTE_FIELDS) { if (data[f] === undefined) continue; if (f === 'start' && data[f] === null) continue; if (!pushField(rk[f], f, data[f], pack.name + ' ' + f)) return; }
      if (data.start === null) { entries.push([rk.start, null]); entries.push([rk.snap, null]); if (data.snap !== undefined && data.snap !== null) snapDropped = true; } // Beta 1.97 (audit loop CG-196-01): an explicit idle assertion (start: null, a current-format complete backup) clears the destination's run state INSIDE the verified write set, so a failed restore rolls the clearing back too. An OMITTED start (older backups) keeps the missing-key rule: the destination's run is left alone.
      else if (data.snap !== undefined) { // Beta 1.96 (SR-195-02): a carried start snapshot (recovery backups) is restored WITH its run. Beta 1.97 verify cycle 1 (CG-196-01): ELSE - an explicit idle assertion already consumed this route's lifecycle state above; a snap string riding an idle assertion is dropped (and reported), never validated against the deleted start and written back - it earns a write only by passing validateSnap against the start this same backup carries for the route, and it is written in its normalized form through the same verified entries as every other field, so a failed restore rolls it back too. A snapshot that fails validation, or one whose run's start is not in the backup, is dropped and reported in the result message - never applied, never silently kept.
        const startEnt = entries.find(e => e[0] === rk.start);
        let restoredSnap = null;
        if (startEnt && typeof data.snap === 'string') { try { const valid = validateSnap(JSON.parse(data.snap), +startEnt[1]); if (valid) restoredSnap = JSON.stringify({ at: +startEnt[1], pieces: valid.pieces, pieceTimes: valid.pieceTimes, done: valid.done, times: valid.times, via: valid.via, cov: valid.cov }); } catch (e) { /* an unparseable snapshot is a dropped snapshot */ } }
        if (restoredSnap) entries.push([rk.snap, restoredSnap]); else snapDropped = true;
      }
    }
    if (parsed.night !== undefined && !pushField(LS_GLOBAL.night, 'night', parsed.night, 'night')) return;
    if (parsed.nightExp !== undefined) { const ne = parsed.nightExp; if (typeof ne !== 'string' || !isFinite(+ne) || +ne <= 0) { toast('Backup has a bad value for night override expiry — nothing was changed', 3200); return; } if (!pushField(LS_GLOBAL.nightExp, 'nightExp', ne, 'night override expiry')) return; } // Beta 1.92 (audit F01): the expiry must be a finite positive epoch string - any other text used to sail through and poison the next boot
  } else if (parsed.v === 1) { // Beta 1.76: a v1 backup is the pre-routes format - its data map (keyed by the legacy storage names) belongs to Route 5W and lands in the 5W slot
    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) { toast('That is not a Snow Route backup', 3200); return; }
    const rk5 = routeKeys('5w');
    for (const f of ROUTE_FIELDS) { const lv = parsed.data[LEGACY_KEYS[f]]; if (lv === undefined) continue; if (!pushField(rk5[f], f, lv, 'Route 5W ' + f)) return; }
    if (parsed.data['snowroute.v2.night'] !== undefined && !pushField(LS_GLOBAL.night, 'night', parsed.data['snowroute.v2.night'], 'night')) return;
  } else { toast('Unsupported backup version (' + String(parsed.v) + ') — nothing was changed', 3200); return; }
  // Beta 1.73 (audit C06, Andrew's call): a backup that replaces a route's TRAIL but carries no
  // session markers of its own must not inherit the CURRENT trail's markers - they describe the
  // trail being replaced and would split the restored trail at wrong places. Clear them as part
  // of this restore: the entry is written and verified like every other, and the snapshot +
  // rollback below cover the markers too. Applies per route (today: the 5W slot in both formats).
  for (const p of ROUTE_PACKS) { const rk = routeKeys(p.id); if (entries.some(e => e[0] === rk.trail) && !entries.some(e => e[0] === rk.sess)) entries.push([rk.sess, '[]']); }
  // Beta 1.92 (deep audit F06, Andrew's pick (a)): a backup carrying a route's completion
  // list but NO side-marks record (the old v1 shape) used to restore into silence - the
  // loader trusts the side-marks and rebuilt the list from the phone's existing ones,
  // erasing the restore while reporting success. Derive the side-marks from the list
  // instead, by the loader's own rule for streets with no sides record: a completed
  // street is all-sides-done, stamped with its completion time. Scoped to backups that
  // lack sides entirely; a backup WITH sides restores exactly as written.
  for (const p of ROUTE_PACKS) {
    const rk = routeKeys(p.id);
    const doneEnt = entries.find(e => e[0] === rk.done);
    if (!doneEnt || entries.some(e => e[0] === rk.sides)) continue;
    try {
      const names = JSON.parse(doneEnt[1]);
      if (!Array.isArray(names)) continue;
      const timesEnt = entries.find(e => e[0] === rk.times);
      const times = timesEnt ? (JSON.parse(timesEnt[1]) || {}) : {};
      const P = {}, T = {};
      for (const n of names) { if (typeof n !== 'string' || !STREETSET.has(n) || !STRETCH[n]) continue; P[n] = STRETCH[n].parts.map(() => 3); T[n] = STRETCH[n].parts.map(() => [times[n] || null, times[n] || null]); }
      entries.push([rk.sides, JSON.stringify({ p: P, t: T })]); // Beta 1.93 (follow-up audit R03): ALWAYS write the derived authority when the backup carries done-but-no-sides - an explicitly EMPTY list ('[]') is an intentional empty state, and {} reads back as nothing done; skipping the write used to leave the phone's old sides in charge
    } catch (e) { /* a list that cannot be parsed was already rejected during validation - never invent sides from rubble */ }
  }
  const droppedNames = countUnknownNames(parsed); // Beta 1.95 (SR-194-08): counted from the RAW backup before any normalization - see countUnknownNames
  if (!entries.length) { toast('Nothing in that backup to restore', 3000); return; }
  const SCOPE = []; for (const p of ROUTE_PACKS) { const rk = routeKeys(p.id); for (const f of ROUTE_FIELDS) SCOPE.push(rk[f]); SCOPE.push(rk.snap); } SCOPE.push(LS_GLOBAL.night, LS_GLOBAL.nightExp); // Beta 1.96 (SR-195-02): the snapshot key joins the rollback scope - a restore that writes a carried snapshot must be able to put the previous one back
  const snap = {}; let snapOk = true;
  for (const k of SCOPE) { try { snap[k] = localStorage.getItem(k); } catch (e) { snapOk = false; } }
  if (!snapOk) { toast('Restore stopped — your current data could not be read for safekeeping, so nothing was changed', 3600); return; }
  const rollback = () => { // Beta 1.102 (Phase 4, C3): the restore-all rollback on the verified primitives - every scoped key put back (or removed) and read back
    let okBack = true;
    for (const k of SCOPE) { const r = snap[k] === null ? txDel(k) : txSet(k, snap[k]); if (!r.ok) okBack = false; }
    return okBack;
  };
  for (const pair of entries) {
    const k = pair[0], v = pair[1];
    const wr = v === null ? txDel(k) : txSet(k, v); // Beta 1.97 (CG-196-01) + 1.102 (Phase 4): a null entry is a DELETE (the idle assertion) - every entry written and verified by the same primitives
    if (!wr.ok) {
      if (rollback()) toast('Restore failed while writing ' + k + ' \u2014 your current data was put back, nothing was changed', 3800);
      else toast('Restore failed while writing ' + k + ' \u2014 and your previous data could NOT be fully put back. Restore from a known-good backup', 4200);
      return;
    }
  }
  restoring = true; markClean('trail'); markClean('aux'); markClean('sess'); // the reload's pagehide flush must not write the old in-memory trail/coverage over the restored data
  toast('Backup restored — reloading' + (droppedNames ? ' · ' + droppedNames + ' unknown street name' + (droppedNames === 1 ? '' : 's') + ' in the backup were ignored' : '') + (snapDropped ? ' · the saved start snapshot was not usable, so Cancel will rebuild from the marks made during the run' : ''), snapDropped ? 4600 : undefined); // Beta 1.94 (audit F-05): the drop count is part of the result, not a silent loader detail. Beta 1.96 (SR-195-02): a dropped start snapshot is reported the same way
  setTimeout(() => location.reload(), 600);
}
function doRestore() {
  let parsed;
  try { parsed = JSON.parse($('xText').value); } catch (e) { toast('That is not a valid backup — paste the whole backup text', 3200); return; }
  restoreBackup(parsed);
}
$('xImp').addEventListener('click', () => doRestore());

// ===== PRELOAD (offline route maps) =====
function tileNums(lng, lat, z) { const n = 2 ** z; const x = Math.floor((lng + 180) / 360 * n); const la = lat * Math.PI / 180; const y = Math.floor((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n); return [x, y]; }
let preloadRunning = false; // Beta 1.92 (deep audit F07): single-flight - a second tap while a download runs starts no competing job
function preloadUrlList() { // Beta 1.95 (deep audit SR-194-06): the deterministic preload set, extracted from the download handler so the offline-pack migration below derives its manifest from the SAME list - one source of truth, the two can never drift apart
  const urls = new Set();
  for (const key of ['day', 'night']) {
    const stj = GL_STYLES[key]; // Beta 1.33: the styles are embedded objects (pmstyles.js) - already in the shell, nothing to fetch
    const spr = Array.isArray(stj.sprite) ? stj.sprite[0].url : stj.sprite;
    if (spr) { urls.add(spr + '.json'); urls.add(spr + '.png'); urls.add(spr + '@2x.json'); urls.add(spr + '@2x.png'); }
    if (stj.glyphs) { const stack = 'Noto Sans Regular'; for (let a = 0; a <= 255; a++) urls.add(stj.glyphs.replace('{fontstack}', stack).replace('{range}', a * 256 + '-' + (a * 256 + 255))); } // the stack GL actually requests per style (Stage 2, audit G-5)
    const ex = { w: -79.75, s: 43.70, e: -79.35, n: 44.05 }; // Beta 1.34 (Andrew's pick): the offline area is Vaughan + nearby at full street detail (z10-14), not just the route. Day and night are two skins over these SAME tiles, so this one set covers both modes
    for (const srcName of Object.keys(stj.sources || {})) {
      const src = stj.sources[srcName];
      if (src.type !== 'vector' || !src.tiles) continue;
      const maxz = Math.min(14, src.maxzoom || 14);
      // tile y grows SOUTHWARD: the north edge (y1) is the smaller number - looping y0..y1 (the pre-1.34 code) silently downloaded ZERO tiles; drive123 A8 counts the fetched tile URLs so this can never pass unnoticed again
      // Beta 1.72 (Phase 3, item R04): the wide zooms join the set - the map itself allows zoom 8 (minZoom), but the preload stopped at z10, so offline at z8-9 the basemap had nothing to draw. Over this box those zooms are 3 tiles (1 + 2).
      for (let z = 8; z <= maxz; z++) { const [x0, y1] = tileNums(ex.w, ex.n, z); const [x1, y0] = tileNums(ex.e, ex.s, z); for (let x = x0; x <= x1; x++) for (let y = y1; y <= y0; y++) for (const t of src.tiles) urls.add(t.replace('{z}', z).replace('{x}', x).replace('{y}', y)); }
      // Beta 1.41: display zooms 15-19 all render from z15 tiles (the source's maxzoom) - yet the set above stops at 14, so the working zoom band was the LEAST cached. Add z15 over the route core only (routeBox + margin, derived from the app's own route bounds so it cannot drift): 15 tiles. z15 over the whole Vaughan box would be ~1,400 files for streets he never opens.
      if ((src.maxzoom || 14) >= 15) { const cb = { w: routeBox.w - 0.005, s: routeBox.s - 0.004, e: routeBox.e + 0.005, n: routeBox.n + 0.004 }; const [cx0, cy1] = tileNums(cb.w, cb.n, 15); const [cx1, cy0] = tileNums(cb.e, cb.s, 15); for (let x = cx0; x <= cx1; x++) for (let y = cy1; y <= cy0; y++) for (const t of src.tiles) urls.add(t.replace('{z}', 15).replace('{x}', x).replace('{y}', y)); }
    }
  }
  return [...urls];
}
$('xPre').addEventListener('click', async () => {
  if (!tapGuard('xPre')) return;
  if (preloadRunning) { toast('Offline download already running'); return; }
  preloadRunning = true;
  const st = $('xPreStat'); st.textContent = 'Preparing map list…';
  // Beta 1.53: the files are SAVED by the service worker as they pass through it - with no
  // worker controlling this page, fetching all 894 files saves nothing (2026-11-01: Andrew's
  // phone fetched everything and stored 0, because the app's own security policy blocked the
  // worker's registration). Confirm control first and refuse honestly instead of burning a
  // full download on a guaranteed zero. EVERY wait here is raced: serviceWorker.ready never
  // resolves at all when no registration exists - exactly the broken case - so an unraced
  // await would hang the button forever instead of delivering the refusal. The file:
  // exception is the local test rig only: it loads the page without a worker by design and
  // exercises the fetch/count path below.
  if (location.protocol !== 'file:') {
    let swOk = ('serviceWorker' in navigator) && !!navigator.serviceWorker.controller;
    if (!swOk) {
      try { await Promise.race([navigator.serviceWorker.ready, new Promise(res => setTimeout(res, 2500))]); } catch (e) {}
      if (('serviceWorker' in navigator) && !navigator.serviceWorker.controller) await Promise.race([
        new Promise(res => navigator.serviceWorker.addEventListener('controllerchange', res, { once: true })),
        new Promise(res => setTimeout(res, 3000))]);
      swOk = ('serviceWorker' in navigator) && !!navigator.serviceWorker.controller;
    }
    if (!swOk) { st.textContent = 'Offline maps NOT saved: the part of the app that saves them is not running' + (window.__swErr ? ' (' + window.__swErr + ')' : '') + '. The live map is unaffected.'; preloadRunning = false; return; } // Beta 1.57: wording stands on its own (second audit, item 5)
  }
  try {
const list = preloadUrlList();
    // Beta 1.94 (audit F-03): the downloaded pack is written into its OWN cache
    // ('snowroute-offline-v1'), which the service worker serves FIRST for map data and
    // whose contents the browsing cache's eviction can never touch. Before 1.94 the pack
    // lived only in 'snowroute-tiles-v1' - the same cache ordinary browsing fills, whose
    // FIFO eviction (cap 3,000) starts deleting the OLDEST entries once ~2,100 net-new
    // tiles have been browsed: the pack, silently, oldest first. The worker still
    // pass-through-caches these fetches into the browsing cache as it always has; once
    // the pack copy is confirmed below, the duplicate browsing copies are deleted again,
    // so the pack lives in exactly one place.
    let packCache = null; try { packCache = await caches.open('snowroute-offline-v1'); } catch (e) { packCache = null; }
    let done = 0, nextU = 0;
    // Beta 1.87 (Andrew's request): a slim green progress bar under the buttons, and the
    // count SWEEPS up to the real number instead of jumping - the five workers finish
    // files in clusters and the pre-1.87 text only repainted every 200 files, so the
    // display leapt 0 -> 200 -> 400. The sweep is display-only (a 30ms interval eases
    // the shown count toward the true one, through every number in between); the
    // downloads stay five-wide and the final line below still reports the CONFIRMED
    // cache count, exactly as before.
    const bar = $('xPreBar'), fill = $('xPreFill');
    let shown = 0;
    const paint = () => { fill.style.width = (list.length ? shown / list.length * 100 : 0) + '%'; st.textContent = 'Downloading… ' + shown + '/' + list.length; };
    bar.classList.add('on'); paint();
    const sweep = setInterval(() => { if (shown < done) { shown = Math.min(done, shown + Math.max(1, Math.ceil((done - shown) / 5))); paint(); } }, 30);
    // Beta 1.96 (audit-2, N-2): the fetch above uses cache 'reload' - a deliberate Download is a reload, not an ordinary request. Before 1.96 the request went through the service worker like any other, mapFetch answered from the very pack being refreshed, and the rebuilt pack stored the pack's own responses back: re-downloading could never refresh anything. The worker honours the mode (mapFetch's reload bypass, src/sw.js).
    const preFetch = async (u) => { const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 30000); try { const res = await fetch(u, { mode: 'cors', signal: ctl.signal, cache: 'reload' }); if (res && res.ok && packCache) { try { await packCache.put(u, res.clone()); } catch (e) { /* a failed pack write simply never confirms in the count below */ } } } catch (e) { /* failures and timeouts simply never confirm below */ } clearTimeout(to); }; // Beta 1.92 (audit F07): one stalled file gives up at 30 s instead of holding the whole job open forever. Beta 1.94 (F-03): a good response is ALSO stored into the pack cache by the page itself - the worker's pass-through copy in the browsing cache is the duplicate that gets cleaned up below, never the guarantee
    const preWorker = async () => { while (nextU < list.length) { const u = list[nextU++]; await preFetch(u); done++; } }; // Beta 1.50 (audit P07): 894 files strictly one at a time was the slowest single wait in the app - five at a time (bounded, never unlimited); same list, same honest confirmed count below
    await Promise.all([preWorker(), preWorker(), preWorker(), preWorker(), preWorker()]);
    clearInterval(sweep); shown = done; paint();
    let saved = 0; const confirmed = [];
    for (const u of list) { try { if (packCache ? await packCache.match(u) : await caches.match(u)) { saved++; confirmed.push(u); } } catch (e) {} } // Stage 2 (audit G-5): report only resources CONFIRMED in the offline cache. Beta 1.94 (F-03): the confirmation reads the PACK cache - a file that only reached the browsing cache does not count as saved, because the eviction could still take it. Beta 1.96 (audit-2, N-1): the confirmation set is kept - the cleanup below may only delete what this loop confirmed
    if (packCache) { try { const tc = await caches.open('snowroute-tiles-v1'); for (const u of confirmed) await tc.delete(u); } catch (e) {} } // Beta 1.94 (F-03): the worker's pass-through copies of the pack leave the browsing cache - the pack lives in exactly one place. Beta 1.96 (N-1): ONLY the confirmed URLs are deleted - 1.95 deleted every manifest URL unconditionally, so a file whose pack write had failed (storage quota) lost BOTH copies: fetched, honestly counted as unsaved, and actually gone
    if (packCache && saved === list.length) lsSet(PACKMIG_KEY, packMigFingerprint(list)); // Beta 1.96 (SR-195-03): a complete download leaves the pack exactly at the manifest - it earns the same completion fingerprint the migration writes, so the next boot takes the fast path
    fill.style.width = (list.length ? saved / list.length * 100 : 0) + '%'; // the bar settles on the CONFIRMED fraction, matching the line below
    lsSet(LS.pre, JSON.stringify({ at: Date.now(), saved, total: list.length }));
    st.textContent = 'Offline maps: saved ' + saved + ' of ' + list.length + ' files (tiles are kept by the offline cache)';
    toast('Offline maps: ' + saved + '/' + list.length);
  } catch (e) { st.textContent = 'Preload failed — check connection and retry.'; } finally { preloadRunning = false; if ($('setStatusPane').classList.contains('on')) renderStatus(false); } // Beta 1.111: the download lives in Status now - when it ends with Status on screen, the maps line, buttons and health row re-read the pack state it just wrote (the stat line itself is the download's own report and is left alone)
});

// ===== UPDATE CHECK =====
let updState = ''; // Beta 1.111: the Status health row's App-version state - '' = not checked yet this session, 'ok' = up to date, 'avail' = a newer version was served. In-memory on purpose: a fresh boot honestly reports "not checked yet" again instead of trusting a stale stamp.
$('updBtn').addEventListener('click', async () => {
  if (!tapGuard('updBtn')) return;
  toast('Checking for a newer version…');
  try {
    if (navigator.serviceWorker) { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); }
    const r = await fetch(location.pathname + '?v=' + Date.now(), { cache: 'no-store' });
    const html = await r.text();
    const m = html.match(/id="ver">([^<]+)</);
    const served = m && m[1].trim();
    const mine = $('ver').textContent.trim();
    if (!served) { toast('Could not read the server copy', 3000); return; }
    if (served === mine) { updState = 'ok'; toast('✓ Up to date (' + mine + ')', 2800); return; }
    updState = 'avail';
    toast('New version found — reloading…', 2600);
    setTimeout(() => location.replace(location.pathname + '?v=' + Date.now()), 900);
  } catch (e) { toast('Update check failed — reloading to be safe', 2800); setTimeout(() => location.reload(), 900); }
});

// ===== FAN / NIGHT / FLIP / HOME =====
const ICONS = { // Pack D "iOS Filled" (Andrew's pick, Beta 1.28): solid silhouettes throughout - no line-work, so every glyph stays crisp at tab size; the sun is drawn fresh in the same language
  streets: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M9.6 3.4h4.8L19.6 20.6H4.4zM11.1 16.9h1.8l.5 2.6h-2.8zM11.4 12.4h1.2l.4 2h-2zM11.7 8.6h.6l.3 1.6h-1.2z"/></svg>',
  pace: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" d="M5.8 2.8h2.1V21H5.8zM9.2 3.8h9.3l-2.6 3.6 2.6 3.6H9.2z"/></svg>',
  routes: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5.5" cy="18.5" r="2.7" fill="currentColor" stroke="none"/><circle cx="18.5" cy="5.5" r="2.7" fill="currentColor" stroke="none"/><path d="M8.2 18.5h3.3a3.5 3.5 0 0 0 0-7h1a3.5 3.5 0 0 1 0-7h3.3" fill="none" stroke="currentColor" stroke-width="2.3"/></svg>', /* Beta 1.76 (Andrew's pick): the route-path glyph for the Routes tab */
  clear: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" d="M9.2 5.3L4.6 9.9l4.6 4.6v-3.3h5.1a3.6 3.6 0 0 1 0 7.2H11v2h3.3a5.6 5.6 0 0 0 0-11.2H9.2V5.3z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  upd: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" d="M19.9 12a7.9 7.9 0 1 1-2.3-5.7l-1.7 1.8A5.7 5.7 0 1 0 17.7 12z"/><path fill="currentColor" stroke="none" d="M21.4 2.8v5.6h-5.6z"/></svg>',
  flip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v13M7 4L4 7M7 4l3 3M17 20V7M17 20l3-3M17 20l-3-3"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" d="M20.4 13.8A8.8 8.8 0 1 1 10.2 3.6a7.2 7.2 0 0 0 10.2 10.2z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none"/><path fill="currentColor" stroke="none" d="M10.75 6.20 L11.22 2.60 L12.78 2.60 L13.25 6.20 ZM15.22 7.01 L18.10 4.80 L19.20 5.90 L16.99 8.78 ZM17.80 10.75 L21.40 11.22 L21.40 12.78 L17.80 13.25 ZM16.99 15.22 L19.20 18.10 L18.10 19.20 L15.22 16.99 ZM13.25 17.80 L12.78 21.40 L11.22 21.40 L10.75 17.80 ZM8.78 16.99 L5.90 19.20 L4.80 18.10 L7.01 15.22 ZM6.20 13.25 L2.60 12.78 L2.60 11.22 L6.20 10.75 ZM7.01 8.78 L4.80 5.90 L5.90 4.80 L8.78 7.01 Z"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 3.4 2.6 11.8h2.8V21h13.2v-9.2h2.8zM10.2 21v-6h3.6v6z"/></svg>',
  gps: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" d="M12 2.6 19.6 20.6 12 17l-7.6 3.6z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M8.98 4.70 L9.66 1.87 L14.34 1.87 L15.02 4.70 L15.02 4.70 L17.51 3.18 L20.82 6.49 L19.30 8.98 L19.30 8.98 L22.13 9.66 L22.13 14.34 L19.30 15.02 L19.30 15.02 L20.82 17.51 L17.51 20.82 L15.02 19.30 L15.02 19.30 L14.34 22.13 L9.66 22.13 L8.98 19.30 L8.98 19.30 L6.49 20.82 L3.18 17.51 L4.70 15.02 L4.70 15.02 L1.87 14.34 L1.87 9.66 L4.70 8.98 L4.70 8.98 L3.18 6.49 L6.49 3.18 L8.98 4.70 ZM12 8.70 a3.30 3.30 0 1 0 0.001 0 Z"/></svg>', /* Pack D language, drawn for the Settings tab (Beta 1.29) */
  pin: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 2.8c-3.86 0-7 3.13-7 7 0 5.25 7 11.2 7 11.2s7-5.95 7-11.2c0-3.87-3.14-7-7-7zM12 7a2.8 2.8 0 1 0 .001 0z"/></svg>', /* Pack D language (Beta 1.30): the Streets row jump-to pin */
  note: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M6.5 2.8h7.2l4.8 4.8v13.6H6.5zM9.3 12.2h5.9v2H9.3zM9.3 16h5.9v2H9.3z"/></svg>', /* Pack D language (Beta 1.30): the note glyph for rows and the selection pop-up */
  exp: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" d="M11 3h2v9.2l2.4-2.4 1.5 1.5L12 16.2l-4.9-4.9 1.5-1.5L11 12.2z"/><path fill="currentColor" stroke="none" d="M4.4 15.6h3.4v2.6h8.4v-2.6h3.4V21H4.4z"/></svg>'
};
$('streetsBtn').innerHTML = ICONS.streets; $('paceBtn').innerHTML = ICONS.pace;
['homeBtn', 'gpsBtn', 'clearBtn', 'routesBtn'].forEach(id => { $(id).querySelector('.tabIco').innerHTML = ICONS[{ homeBtn: 'home', gpsBtn: 'gps', clearBtn: 'clear', routesBtn: 'routes' }[id]]; }); // Beta 1.88: Backup and Update carry no tab icons anymore - they are text rows on the blue settings panes
$('setBtn').querySelector('.tabIco').innerHTML = ICONS.gear;
$('selNote').innerHTML = ICONS.note;
$('setBtn').addEventListener('click', () => { if (!tapGuard('setBtn')) return; showSetPane('setMainPane'); $('setVer').textContent = $('ver').textContent; $('setMenu').classList.add('open'); }); // the Settings menu (Beta 1.88, Andrew): a blue full-screen takeover like Routes - it always lands on the main pane, and the version re-syncs from the title's on every open
const SET_PANES = ['setMainPane', 'setStatusPane', 'setJobPane', 'setChimePane', 'setBackupPane', 'setAboutPane'];
function showSetPane(id) { for (const p of SET_PANES) $(p).classList.toggle('on', p === id); if (id === 'setMainPane') renderBakAge(); } // Beta 1.111: the pane set grew from two to six; landing on main refreshes the Backup button's last-backup line from the export stamp
$('setClose').addEventListener('click', () => $('setMenu').classList.remove('open'));
$('setBack').addEventListener('click', () => { if (xMode === 'text') showX('restore'); else if (xMode === 'restore') showX('menu'); else showSetPane('setMainPane'); }); // Beta 1.89: one Back walks the backup tree up a level at a time; from the backup menu it lands on the settings main pane
$('exportBtn').addEventListener('click', () => { if (!tapGuard('exportBtn')) return; openExport(); });
function noteExported() { // Beta 1.111: the Settings main pane's "Last backup" line reads this stamp. It rides the EXISTING export record (LS.exp - the backup-nudge record) as one added field, so no new key exists and the nudge's own field (nudgedAt) is untouched. Stamped only at a successful hand-off (share accepted / download dispatched) - a cancelled share sheet stamps nothing, so the line never claims a backup that never left the phone.
  try { const st = parseJ(lsGet(LS.exp), {}); st.exportedAt = Date.now(); lsSet(LS.exp, JSON.stringify(st)); } catch (e) { /* the line is a courtesy - a failed stamp never breaks an export */ }
}
async function shareBackup() { // Beta 1.88 (Andrew), moved into the backup menu in 1.89 (his correction): the Backup (JSON) press both backs up AND asks where to save it - one tap. A real FILE share where the platform offers it (Save to Files keeps the .json name), the text share next, and the plain download where no share exists at all (desktops, the test rig). Cancelling the prompt is a shrug, not an error - the backup menu stays open behind it
  const b = buildBackup();
  if (!b) { shareRecovery(true); return; } // Beta 1.96 (Andrew's design): ONE Backup button - a backup that cannot be built because saving failed falls back AUTOMATICALLY to the recovery export (live state, snapshot carried) instead of refusing and sending him to a second button mid-clean. shareRecovery(true) labels the result loudly: the file is recovery-marked, recovery-named, and its message says the save could not be done first. A cancelled SHARE never reaches here - the fallback triggers on the build failure only
  let f = null; try { f = new File([b], 'snowroute-backup.json', { type: 'application/json' }); } catch (e) { /* older engine: the text share below still works */ }
  if (f && navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); noteExported(); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  if (navigator.share) { try { await navigator.share({ text: b }); noteExported(); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  dl(new Blob([b], { type: 'application/json' }), 'snowroute-backup.json'); noteExported(); toast('Backup downloaded');
}
async function shareRecovery(viaFallback) { // Beta 1.95 (SR-194-02): the recovery export - same share sheet, but the file is NAMED recovery and the result message repeats what it is: the live on-screen state, not fully saved on this device. Beta 1.96: since Andrew's one-button change this runs as Backup's AUTOMATIC fallback (viaFallback) - the standalone Recovery menu option is gone
  const b = buildRecovery();
  if (!b) { toast('Recovery backup unavailable — open the route first', 3600); return; }
  let f = null; try { f = new File([b], 'snowroute-recovery.json', { type: 'application/json' }); } catch (e) { /* older engine: the text share below still works */ }
  if (f && navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); noteExported(); toast((viaFallback ? 'Backup could not be saved — recovery backup shared instead: ' : 'Recovery backup shared — ') + 'the open route is the live on-screen state, not fully saved on this device; other routes are included as last saved', 4200); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  if (navigator.share) { try { await navigator.share({ text: b }); noteExported(); toast((viaFallback ? 'Backup could not be saved — recovery backup shared instead: ' : 'Recovery backup shared — ') + 'the open route is the live on-screen state, not fully saved on this device; other routes are included as last saved', 4200); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  dl(new Blob([b], { type: 'application/json' }), 'snowroute-recovery.json'); noteExported(); toast((viaFallback ? 'Backup could not be saved — recovery backup downloaded instead: ' : 'Recovery backup downloaded — ') + 'the open route is the live on-screen state, not fully saved on this device; other routes are included as last saved', 4200); // Beta 1.96 (audit-2, N-5b): the wording distinguishes what the file actually holds - the ACTIVE route is serialized from live memory; any other route pack in the same file is read from storage, as last saved
}
$('updBtn').addEventListener('click', () => $('setMenu').classList.remove('open')); // the update check reports by toast over the map - the menu steps aside for it (the old pop-up's pick-and-close)

// ===== SETTINGS PANES (Beta 1.111, Andrew's approved redesign) =====
// Six panes on the blue takeover: main (Status / On the job / Backup / About),
// Status (maps + health), On the job (toggles + chime nav), Done chime,
// Backup (slimmed to its two export options), About (info + What's new +
// Update). The design is the approved mockups' (beta1/work/settings-mockups/);
// the behaviour settings themselves live in app1 (SETTINGS_KEY).
function bakAgeText() { // the Backup button's second line, from the export stamp (LS.exp's exportedAt, written by noteExported at every successful hand-off)
  const st = parseJ(lsGet(LS.exp), null);
  const at = st && +st.exportedAt;
  if (!at || !isFinite(at)) return 'never';
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const d1 = new Date(at); d1.setHours(0, 0, 0, 0);
  const days = Math.round((d0 - d1) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return days + ' days ago';
}
function renderBakAge() { const el = $('bakAge'); if (el) el.textContent = 'Last backup: ' + bakAgeText(); }
function renderSwitch(el, on) { el.classList.toggle('on', !!on); el.setAttribute('aria-checked', on ? 'true' : 'false'); }
// ---- On the job ----
function renderJob() {
  renderSwitch($('swAwake'), settings.awake);
  renderSwitch($('swVib'), settings.vib);
  $('chimeVal').textContent = settings.chime ? CHIME_SOUNDS[settings.chimeSound].name : 'Off';
}
$('swAwake').addEventListener('click', () => { settings.awake = !settings.awake; saveSettings(); renderSwitch($('swAwake'), settings.awake); syncWake(); }); // syncWake applies the new gate at once: ON mid-run requests the lock, OFF (or a run ending) releases it; an absent WakeLock API makes the request a silent no-op while the toggle still saves (app3)
$('swVib').addEventListener('click', () => { const prevVib = settings.vib; settings.vib = !settings.vib; if (!saveSettings()) { settings.vib = prevVib; renderSwitch($('swVib'), settings.vib); toast('Not saved — storage problem'); return; } renderSwitch($('swVib'), settings.vib); if (settings.vib && navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} } }); // Beta 1.113 (round 112, CG-112-03): a failed save reverts the value AND the switch and warns - the 1.101 save-honesty contract every other save path honours; on a saved flip, a confirming buzz where the platform supports vibration at all
$('chimeRow').addEventListener('click', () => { renderChime(); showSetPane('setChimePane'); });
$('jobBtn').addEventListener('click', () => { renderJob(); showSetPane('setJobPane'); });
$('jobBack').addEventListener('click', () => showSetPane('setMainPane'));
// ---- Done chime: WebAudio-synthesized sounds (no files) ----
const CHIME_SOUNDS = {
  bell: { name: 'Classic Bell', desc: 'Single soft bell tone' },
  two: { name: 'Two-Tone', desc: 'Two notes, up' },
  rising: { name: 'Rising Notes', desc: 'Three notes climbing' },
  pop: { name: 'Soft Pop', desc: 'Short, quiet blip' },
  melody: { name: 'Chime Melody', desc: 'Four-note finish melody' }
};
let AC = null; // one shared AudioContext, created/resumed only inside user-gesture handlers (a preview tap, a marking tap)
function acNow() { try { const ACtor = window.AudioContext || window.webkitAudioContext; if (!ACtor) return null; if (!AC) AC = new ACtor(); if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; } }
function toneAt(ac, freq, t0, dur, type, vol, slideTo) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function playChime(key, times) { // FULLY guarded: an audio failure can never break marking - sound is decoration
  try {
    const ac = acNow(); if (!ac) return;
    const seqs = {
      bell: (a, t) => { toneAt(a, 1568, t, 0.9, 'sine', 0.22); toneAt(a, 3136, t, 0.45, 'sine', 0.06); return 0.95; }, // a single soft bell: fundamental + a quiet harmonic, ~0.9 s decay
      two: (a, t) => { toneAt(a, 1319, t, 0.11, 'sine', 0.2); toneAt(a, 1760, t + 0.12, 0.16, 'sine', 0.2); return 0.32; },
      rising: (a, t) => { [1047, 1319, 1569].forEach((f, i) => toneAt(a, f, t + i * 0.11, 0.14, 'sine', 0.2)); return 0.4; },
      pop: (a, t) => { toneAt(a, 330, t, 0.07, 'triangle', 0.25, 170); return 0.1; }, // one short low blip with a quick pitch fall
      melody: (a, t) => { [1047, 1319, 1569, 2093].forEach((f, i) => toneAt(a, f, t + i * 0.12, 0.18, 'sine', 0.2)); return 0.6; }
    };
    const fn = seqs[key] || seqs.two;
    let t = ac.currentTime + 0.01;
    const n = Math.max(1, times || 1);
    for (let i = 0; i < n; i++) { const len = fn(ac, t); t += len + 0.18; }
  } catch (e) { /* silent by design */ }
}
function onStreetComplete() { // Beta 1.111: called by the marking funnel (applyPiece's completion branch and markDone in app2) the moment a street flips false-to-true complete. Feedback only, guarded end to end - it can never throw into marking.
  try {
    if (settings.chime) playChime(settings.chimeSound, 1);
    if (settings.vib && navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} } // iOS web apps cannot vibrate: a designed no-op there (Andrew knows - the toggle is a persisted placeholder for a possible native app)
  } catch (e) {}
}
function onFinishFeedback() { // Beta 1.111: the confirmed-Finish fanfare, called by finishRun only on its committed path: the selected sound twice around - except Chime Melody once, it is already a four-note finish - plus the longer vibration pattern when vibration is on
  try {
    if (settings.chime) playChime(settings.chimeSound, settings.chimeSound === 'melody' ? 1 : 2);
    if (settings.vib && navigator.vibrate) { try { navigator.vibrate([90, 70, 90]); } catch (e) {} }
  } catch (e) {}
}
function renderChime() {
  renderSwitch($('swChime'), settings.chime);
  const list = $('chimeList'); list.innerHTML = '';
  for (const key of CHIME_KEYS) {
    const snd = CHIME_SOUNDS[key]; const sel = settings.chimeSound === key;
    const row = document.createElement('button');
    row.className = 'm-card m-sndRow' + (sel ? ' sel' : ''); row.dataset.snd = key;
    row.innerHTML = '<div class="m-togTxt"><div class="m-togLbl">' + snd.name + '</div><div class="m-togDesc">' + snd.desc + '</div></div>' + (sel ? '<div class="m-selTick">&#10003;</div>' : '<div class="m-play">&#9654;</div>'); // one fixed 30px right slot per row, per the mockup: the tick on the selected row, the play affordance on the rest
    row.addEventListener('click', () => { const prevSnd = settings.chimeSound; settings.chimeSound = key; if (!saveSettings()) { settings.chimeSound = prevSnd; renderChime(); renderJob(); toast('Not saved — storage problem'); return; } renderChime(); renderJob(); playChime(key, 1); }); // a tap PREVIEWs and selects (the mockup's contract). The preview is a deliberate tap, so it sounds even while the chime toggle is off - the toggle gates only the in-clean playback. Beta 1.113 (round 112, CG-112-03): an unsaved pick reverts and warns instead of previewing a selection storage never took
    list.appendChild(row);
  }
}
$('swChime').addEventListener('click', () => { const prevChime = settings.chime; settings.chime = !settings.chime; if (!saveSettings()) { settings.chime = prevChime; renderSwitch($('swChime'), settings.chime); renderJob(); toast('Not saved — storage problem'); return; } renderSwitch($('swChime'), settings.chime); renderJob(); }); // Beta 1.113 (round 112, CG-112-03): same save-honesty as the vibration switch - a failed save reverts and warns
$('chimeBack').addEventListener('click', () => { renderJob(); showSetPane('setJobPane'); });
// ---- Status: maps + health, every value read live at pane open ----
async function packState() { // how much of the deterministic manifest (preloadUrlList - the same list the download writes and the pack migration certifies) is actually in the pack cache right now; falls back to the preload record when the cache census cannot run
  const list = preloadUrlList(); const total = list.length;
  let cached = -1;
  try {
    if ('caches' in window) {
      const oc = await caches.open('snowroute-offline-v1');
      const have = new Set((await oc.keys()).map(r => r.url));
      cached = 0;
      for (const u of list) { let href = u; try { href = new URL(u).href; } catch (e) {} if (have.has(href)) cached++; }
    }
  } catch (e) { cached = -1; }
  if (cached < 0) { const rec = parseJ(lsGet(LS.pre), null); cached = rec ? Math.min(total, rec.saved || 0) : 0; }
  return { total, cached, complete: total > 0 && cached >= total };
}
function setHealth(icoId, valId, state, text) { // state: 'ok' green tick / 'warn' amber warning / 'idle' neutral dash - honesty over decoration: a state that is merely unknown is never painted green
  const ico = $(icoId);
  ico.textContent = state === 'ok' ? '✓' : state === 'warn' ? '⚠' : '–';
  ico.className = 'm-chk' + (state === 'warn' ? ' warn' : state === 'idle' ? ' idle' : '');
  $(valId).textContent = '— ' + text;
}
async function renderStatus(resetStat) {
  const ps = await packState();
  const area = (activeRoute ? activeRoute.name : 'Route') + ' area';
  if (ps.complete) { $('stMapsLine').innerHTML = 'Offline maps: Downloaded <span class="m-tick">&#10003;</span>'; $('stMapsSub').textContent = ps.total + ' files · ' + area; }
  else if (ps.cached > 0) { $('stMapsLine').textContent = 'Offline maps: Partial'; $('stMapsSub').textContent = ps.cached + ' of ' + ps.total + ' files · ' + area; }
  else { $('stMapsLine').textContent = 'Offline maps: Not downloaded'; $('stMapsSub').textContent = ps.total + ' files · ' + area; }
  $('xPre').textContent = ps.complete ? 'Re-download' : 'Download';
  $('stDel').style.display = ps.cached > 0 ? '' : 'none';
  if (resetStat && !preloadRunning) { const rec = parseJ(lsGet(LS.pre), null); $('xPreStat').textContent = rec ? 'Offline maps downloaded ' + new Date(rec.at).toLocaleDateString() + ' (' + rec.saved + ' files)' : 'Offline maps not downloaded yet — download for offline use.'; $('xPreBar').classList.remove('on'); $('xPreFill').style.width = '0%'; } // the bar/stat belong to a live download - landing on Status with none running starts them clean (the 1.87 reset, re-homed with the elements)
  // HEALTH - each row from a real signal at this moment:
  let storageOk = false;
  try { storageOk = lsSet('snowroute.v2.healthprobe', '1') && lsGet('snowroute.v2.healthprobe') === '1'; lsDel('snowroute.v2.healthprobe'); } catch (e) { storageOk = false; } // a scratch-key write + read-back + delete - the same guarded helpers every save uses
  setHealth('stIcoStorage', 'stValStorage', storageOk ? 'ok' : 'warn', storageOk ? 'saving normally' : 'storage problem — export a backup');
  setHealth('stIcoMaps', 'stValMaps', ps.complete ? 'ok' : 'warn', ps.complete ? 'complete' : ps.cached > 0 ? 'partial — ' + ps.cached + ' of ' + ps.total : 'not downloaded');
  if (updState === 'ok') setHealth('stIcoVer', 'stValVer', 'ok', 'up to date (' + $('ver').textContent.trim() + ')');
  else if (updState === 'avail') setHealth('stIcoVer', 'stValVer', 'warn', 'update available');
  else setHealth('stIcoVer', 'stValVer', 'idle', 'not checked yet');
  if (gpsDenied) setHealth('stIcoGps', 'stValGps', 'warn', 'location permission is off');
  else if (watchId != null || (lastGood && Date.now() - lastGood.at < 120000)) setHealth('stIcoGps', 'stValGps', 'ok', 'ready');
  else setHealth('stIcoGps', 'stValGps', 'idle', 'not started yet');
}
$('stBtn').addEventListener('click', () => { showSetPane('setStatusPane'); renderStatus(true); });
$('statusBack').addEventListener('click', () => showSetPane('setMainPane'));
$('stDel').addEventListener('click', async () => {
  if (!tapGuard('stDel')) return;
  if (preloadRunning) { toast('Wait for the download to finish first'); return; }
  // Beta 1.113 (round 112, CG-112-02): verify the pack is actually GONE before clearing anything or announcing success - the old handler swallowed a failed delete and still toasted 'Offline maps deleted' over a pack that was still there. caches.delete resolving false means the name was not deleted; the pack counts as gone only when it is also verifiably absent (caches.has). On failure the metadata stays and the failure is reported
  let gone = false;
  try {
    if ('caches' in window) gone = (await caches.delete('snowroute-offline-v1')) || !(await caches.has('snowroute-offline-v1'));
    else gone = true; // no Cache Storage in this browser: no pack exists to delete
  } catch (e) { gone = false; }
  if (!gone) { toast('Offline maps could not be deleted — they are still on this device'); renderStatus(true); return; }
  lsDel(PACKMIG_KEY); lsDel(LS.pre); // the completion flag and the ACTIVE route's preload record go with the pack; the browsing tile cache ('snowroute-tiles-v1') is a cache, not the pack - it stays
  toast('Offline maps deleted');
  renderStatus(true);
});
// ---- About / What's new ----
const WHATSNEW = [ // the curated in-app list: plain words, newest first. Ships WITH each version like the CHANGELOG - a release that changes what Andrew sees adds its entry here in the same change
  { v: 'Beta 1.113', items: ['Fixed: a note could say "Saved" when it had not saved', 'Delete maps now only says deleted when the maps really are gone', 'The Last backup line no longer resets when you dismiss the backup reminder', 'Settings switches now tell you if a change could not be saved', 'Turning screen-awake off now always lets the screen sleep again'] },
  { v: 'Beta 1.112', items: ['Keep screen awake now resets when the app closes — turn it on per session when you want it'] },
  { v: 'Beta 1.111', items: ['Settings rebuilt: Status, On the job, Backup, About', 'Keep the screen awake during a clean', 'Done chime — five sounds to choose from', 'Offline maps now live in Status'] },
  { v: 'Beta 1.110', items: ['Finish is final: no more Undo after you confirm'] },
  { v: 'Beta 1.109', items: ['Streets list: Mains / Secondaries, with a Completed pill'] }
];
function renderAbout() {
  const cur = $('ver').textContent.trim();
  $('wnHead').textContent = "WHAT'S NEW · " + cur; // the header names the LIVE version, read from the title's version element - never a second hard-coded copy that can go stale
  const list = $('wnList'); list.innerHTML = '';
  WHATSNEW.forEach((entry, i) => {
    if (i > 0 || entry.v !== cur) { const h = document.createElement('div'); h.className = 'm-secLbl'; h.textContent = entry.v; list.appendChild(h); } // the current version's items sit directly under the header; older versions get their own numbered subhead
    for (const item of entry.items) { const d = document.createElement('div'); d.className = 'm-wnItem'; const dot = document.createElement('span'); dot.className = 'm-wnDot'; dot.innerHTML = '&middot;'; const tx = document.createElement('span'); tx.textContent = item; d.appendChild(dot); d.appendChild(tx); list.appendChild(d); }
  });
}
$('aboutBtn').addEventListener('click', () => { renderAbout(); showSetPane('setAboutPane'); });
$('aboutBack').addEventListener('click', () => showSetPane('setMainPane'));

// Click-away (Andrew, Beta 1.14): tapping anywhere outside an open menu closes it - no hunting for a
// Close button. Header buttons keep their own toggle behaviour; a tap on a dialog's dimmed backdrop
// acts as that dialog's Cancel / Not yet / Close (each is a plain hide - nothing gets committed).
document.addEventListener('pointerdown', e => {
  const anySheet = !!document.querySelector('.sheet.open'); // Beta 1.77 (Andrew, live catch): ANY open sheet, read from the DOM - the hand-listed pair missed the Routes sheet in 1.76, so tapping away from it did nothing (and the tap fell through to the map)
  if (anySheet && !e.target.closest('.sheet') && !e.target.closest('#hud') && !e.target.closest('.modal')) { closeSheets(); swallowClickUntil = Date.now() + 400; } // Beta 1.30 (Andrew): the closing tap is spent here - the map never sees it
  // The two banners count as menus too (Andrew: ANY menu): a tap outside one is its Dismiss / Keep going.
  if (!$('suggest').classList.contains('hidden') && !e.target.closest('#suggest')) { $('suggest').classList.add('hidden'); swallowClickUntil = Date.now() + 400; }
  if (!$('stale').classList.contains('hidden') && !e.target.closest('#stale')) { $('stale').classList.add('hidden'); swallowClickUntil = Date.now() + 400; }
});
['finModal', 'noteModal'].forEach(id => { const mEl = $(id); mEl.addEventListener('pointerdown', e => { if (e.target === mEl) mEl.classList.add('hidden'); }); });
function applyNight() { document.body.classList.toggle('night', isNight()); const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute('content', isNight() ? '#14171d' : '#eceff2'); $('nightBtn').innerHTML = isNight() ? ICONS.sun : ICONS.moon; } // the button shows where it TAKES you (Beta 1.28, Andrew): in day it offers Night (moon), in night it offers Day (sun). Beta 1.88: the button is the round chip at top-right - the icon alone flips, there is no label
$('nightBtn').addEventListener('click', () => { if (!tapGuard('nightBtn')) return; setThemeOverride(!isNight()); applyNight(); setBasemap(); }); // Beta 1.77: the button sets a session override - the sun takes over again at the next sunrise/sunset or the next full app open (theme block, app1)
$('homeBtn').addEventListener('click', () => { if (!tapGuard('homeBtn')) return; map.fitBounds([[routeBox.w, routeBox.s], [routeBox.e, routeBox.n]], { padding: 28 }); });
// ===== SERVICE WORKER + BOOT =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => { window.__swErr = (e && e.name) || 'error'; }); // Beta 1.53: a refused registration (e.g. policy-blocked) used to vanish into this catch - record WHY; online use is unaffected either way, but the offline preload below refuses to run without the worker and can now say why
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist().catch(() => {}); } catch (e) {} } // Beta 1.57 (second audit, item 6): ask the platform to exempt this origin's data (progress + offline maps) from automatic storage eviction where supported. An installed home-screen app is already outside Safari's 7-day tab eviction; this covers tab use and other browsers. Fire-and-forget - the answer changes nothing in the UI.
  // Stage 2 (audit G-6): the first-ever boot is not worker-controlled, so the map's own style
  // fetches cache nothing and the map cannot load offline until some later visit. Once the
  // worker is ready this page IS controlled - warm both style files through it if they are
  // missing, so a first install becomes offline-ready on its first boot.
  window.__warm = 'pending';
  navigator.serviceWorker.ready.then(async () => {
    try {
      // 'ready' can resolve before THIS page is actually controlled (the claim lands a beat
      // later); a fetch sent in that gap bypasses the worker and caches nothing - the exact
      // failure drive119 caught (warm=fetched:200/200, cache empty). Wait for control.
      if (!navigator.serviceWorker.controller) await Promise.race([
        new Promise(res => navigator.serviceWorker.addEventListener('controllerchange', res, { once: true })),
        new Promise(res => setTimeout(res, 3000))]);
      // Beta 1.33: both basemap styles are embedded in this page (pmstyles.js), so a first
      // install is offline-ready by construction - no style fetch exists to warm. (Tiles and
      // glyphs still warm through ordinary use and the Preload button.)
      window.__warm = 'embedded';
      // Beta 1.41: pre-warm the OTHER theme's sprites through the worker - the two sprite
      // flavours are a theme flip's only network fetch, so the first flip should never
      // wait on them. (After an offline Preload both flavours are cached already.)
      try { const otherKey = isNight() ? 'day' : 'night'; const oSpr = GL_STYLES[otherKey] && (Array.isArray(GL_STYLES[otherKey].sprite) ? GL_STYLES[otherKey].sprite[0].url : GL_STYLES[otherKey].sprite); if (oSpr) { window.__spriteWarm = otherKey; for (const suf of ['.json', '.png', '@2x.json', '@2x.png']) fetch(oSpr + suf).catch(() => {}); } } catch (e) {}
    } catch (e) { window.__warm = 'error:' + (e && e.message || e); }
  }).catch(() => { window.__warm = 'no-worker'; });
}
// Beta 1.94 (audit F-03, one-time migration): installs that downloaded the offline pack
// before 1.94 hold it in the browsing cache ('snowroute-tiles-v1'), where the tile
// eviction can still eat it. While a preload record exists and the pack cache is still
// empty, copy the browsing cache's contents into the pack cache ('snowroute-offline-v1')
// so the protection applies without a re-download; a flag key ends the migration. After
// it, the pack cache is the pack's only home (new downloads write there directly and
// clean their browsing duplicates up). Best-effort: a failed copy retries on the next
// boot, and a fresh Download offline maps always rebuilds the pack cache directly.
const PACKMIG_KEY = 'snowroute.v5.packmig';
function packMigFingerprint(list) { // Beta 1.96 (deep audit SR-195-03): the pack-migration completion flag stops being the constant '1' and becomes a fingerprint of the manifest it certifies - a stored flag is believable only for the exact manifest it was earned on (a styles update changes tile/glyph URLs, hence the list, hence the fingerprint, and the full pass runs again). djb2 over the joined list: deterministic, dependency-free, cheap at 897 entries.
  let h = 0; const s = list.join('\n');
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return 'v1:' + list.length + ':' + (h >>> 0).toString(36);
}
async function migratePack() { // Beta 1.95 (deep audit SR-194-05/06): the one-time move of a pre-1.94 pack from the browsing cache into the protected pack cache, under an honest contract. 1.94 copied EVERY browsing-cache key (any stray the map had ever fetched came along) through per-file catch-alls, then set the completion flag unconditionally - a partial copy was marked complete and never retried. Now: only the deterministic preload manifest (preloadUrlList) is migrated; non-manifest entries already in the pack cache are pruned, so the pack is exactly the manifest; the completion flag is set only after VERIFYING that everything that exists in either cache is present in the pack cache; any failed copy leaves the flag unset and the next boot retries (the function is idempotent). Returns a status object so the test battery can drive it directly.
  try {
    if (!('caches' in window)) return { ok: false, why: 'nocache' };
    if (!parseJ(lsGet(LS.pre), null)) return { ok: true, skipped: true }; // no pack was ever downloaded on this install
    const list = preloadUrlList();
    const fp = packMigFingerprint(list);
    if (lsGet(PACKMIG_KEY) === fp) { try { const ocF = await caches.open('snowroute-offline-v1'); if ((await ocF.keys()).length === list.length) return { ok: true, skipped: true, fast: true }; } catch (e) { /* a census that cannot run proves nothing - fall through to the full pass */ } } // Beta 1.96 (SR-195-03): the FAST PATH - 1.95 wrote the completion flag and never read it, so every boot with a preload record re-ran the full ~1,800-match verification sweep. The flag is now read, and believed only with a cheap census agreeing (exactly the manifest's count in the pack); any doubt - flag absent or stale, count off - runs the full pass below, which also HEALS a shrunken pack from the browsing cache
    const want = new Set(list.map(u => { try { return new URL(u).href; } catch (e) { return u; } })); // stored cache keys are URL-normalized (the glyph ranges' 'Noto Sans Regular' is stored %20-encoded) - the prune below must compare like with like, or it deletes the pack's own glyphs (the first CI run of 1.95 did exactly that: pack 897 -> 641)
    const oc = await caches.open('snowroute-offline-v1');
    const tc = await caches.open('snowroute-tiles-v1');
    let failed = 0;
    for (const u of list) {
      if (await oc.match(u)) continue;
      const hit = await tc.match(u);
      if (!hit) continue; // exists in neither cache - nothing to migrate (a re-download rebuilds the pack directly)
      try { await oc.put(u, hit); } catch (e) { failed++; }
    }
    if (failed > 0) return { ok: false, failed };
    let pruneOk = true;
    for (const rq of await oc.keys()) { if (!want.has(rq.url)) { try { await oc.delete(rq.url); } catch (e) { pruneOk = false; /* a stray that will not delete is inert - the pack still serves the manifest; Beta 1.96 (SR-195-07): the failure is REPORTED in the status now, not swallowed - copies are the readiness question, the prune is maintenance */ } } }
    for (const u of list) { if (!(await oc.match(u)) && (await tc.match(u))) return { ok: false, why: 'verify' }; } // verify BEFORE the flag: everything recoverable must be in the pack cache
    const flagOk = lsSet(PACKMIG_KEY, fp); // Beta 1.96 (SR-195-07): the flag write is CHECKED - the fast path believes this flag, so a migration whose flag could not be persisted is not complete and must not report ok
    return { ok: flagOk, flag: flagOk ? fp : null, pruneOk };
  } catch (e) { return { ok: false, why: String((e && e.message) || e) }; }
}
if (parseJ(lsGet(LS.pre), null)) migratePack(); // boot: fire-and-forget - it never blocks the boot, and because the flag is earned, an incomplete migration simply runs again next boot
// Beta 1.18 (Andrew's phone report): the on-screen keyboard shrinks the VISIBLE screen
// (visualViewport) and iOS pans the page to the focused note box, stranding the header
// and menus off-screen - and it does not pan back. Track the visible screen in CSS vars
// (--vvt top offset, --vvh height, --vvb hidden strip below) that the chrome is anchored
// to, and cancel any leftover page pan once no text field is focused.
// Beta 1.54 (Andrew's deep-dive, 2026-11-01): SETTLED-SIZE ANCHOR. The old code sized
// everything from whatever the phone LAST reported as the visible height - and iOS
// sometimes reports a too-short height and then says nothing more: at cold start
// (his ~2-in-10 launches with a strip under the bottom bar) and after the keyboard
// closes (the strip would return until the app was relaunched once or twice). The
// app now remembers the true height (fullH: the tallest report with no keyboard up;
// in a home-screen install the web view IS the full screen, so screen.height is
// knowable from the first frame) and, when a short report arrives with no keyboard
// up, trusts the settled size instead - a stuck report can no longer paint a strip.
// Beta 1.55 CORRECTION: 1.54 additionally PINNED the top/bottom offsets while the
// keyboard was up - that stopped the menus riding above the keyboard (their
// pre-1.54 behaviour) and put the note box behind it, out of sight (Andrew,
// 2026-11-01). The pin is OUT: offsets follow the live report while typing, as
// before; the settled anchor and the settle-release remain.
let fullH = 0;
const inStandalone = () => !!(window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
function syncViewport() {
  try {
    const vv = window.visualViewport; if (!vv) return;
    const de = document.documentElement;
    const kb = document.body.classList.contains('kb');
    if (kb) return; // Beta 1.61: while typing, the layout variables stay frozen at their pre-keyboard values - the keyboard overlays the app instead of resizing it. The live-chase (1.55) re-fit the sheets on every keyboard animation tick and the note menus flickered and jumped (Andrew, 2026-11-01). The settle sampler reads the live report directly and this function republishes everything when the keyboard leaves.
    if (!kb && vv.height > fullH) fullH = vv.height;
    if (!kb && inStandalone() && window.innerHeight >= window.innerWidth && window.screen.height > fullH) fullH = window.screen.height;
    const t = vv.offsetTop, h = vv.height, b = Math.max(0, window.innerHeight - t - h); // Beta 1.62: the live report rules, always. The 1.54 trust override (publishing the remembered full height when a report ran short) is retired together with the 1.58 nudges: since 1.60 the document-height floor is what guarantees the full stage - the browser's own sizing, not an app override - and the strip is device-confirmed gone.
    de.style.setProperty('--vvt', t + 'px');
    de.style.setProperty('--vvh', h + 'px');
    de.style.setProperty('--vvb', b + 'px');
    const ae = document.activeElement;
    if ((!ae || (ae.tagName !== 'TEXTAREA' && ae.tagName !== 'INPUT')) && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
    if (typeof map !== 'undefined' && map) { const mc = map.getContainer(); const mw = mc.clientWidth, mh = mc.clientHeight; if (mw !== syncViewport._w || mh !== syncViewport._h) { syncViewport._w = mw; syncViewport._h = mh; map.resize(); } } // Beta 1.50 (audit P10): this fires on every visual-viewport scroll tick - only pay for a map resize when the container actually changed size
  } catch (e) { /* map/viewport not up yet */ }
}
if (window.visualViewport) { window.visualViewport.addEventListener('resize', syncViewport); window.visualViewport.addEventListener('scroll', syncViewport); }
window.addEventListener('resize', syncViewport);
// Beta 1.31: the keyboard state - while ANY text field has focus, the sheets stop resizing and
// animating (body.kb rules in the stylesheet). This is what made note editing feel broken:
// the sheet kept re-animating its height against the keyboard's own motion on every viewport tick.
// Beta 1.54/1.55: the keyboard lifecycle. Closing: do NOT drop the frozen state the moment the field blurs (1.31 did, while the
// keyboard was still sliding away and the reported height still growing - the sheet's
// animation switched back on against a moving target and 'reanimated up like opening
// for the first time', Andrew 2026-11-01). Instead wait until the reported height
// SETTLES (back at the settled size, or unchanged across samples, capped ~1.5s), then
// release in one clean state change and re-measure. Every wait terminates.
let kbSettle = null;
let kbInSettle = null, kbShiftHost = null, kbVisH = -1, kbShiftPx = 0;
document.addEventListener('focusin', e => {
  if (!e.target.matches('textarea, input')) return;
  if (kbSettle) { clearInterval(kbSettle); kbSettle = null; }
  if (kbShiftHost) { kbShiftHost.style.transform = ''; kbShiftHost = null; kbShiftPx = 0; }
  document.body.classList.add('kb');
  // Beta 1.61: once the keyboard's rise settles, make sure the field is
  // actually visible above it - by scrolling the menu's own list or
  // shifting its card, never by resizing the layout (see syncViewport).
  if (kbInSettle) clearInterval(kbInSettle);
  // Beta 1.69 (audit N02): unchanged samples alone no longer prove the keyboard has settled - iOS can report the full height for the first few hundred ms BEFORE the keyboard starts moving the viewport, and the old sampler concluded 'settled' inside that window and lined the field up against the wrong geometry, never to recheck. Early conclusion now requires a real observed drop from the focus-time height; the 700 ms cap still bounds the wait, and a viewport resize while the keyboard is open re-runs the visibility check (below).
  let lastH = -1, stable = 0, sawDrop = false; const t0 = Date.now(); const h0 = window.visualViewport ? window.visualViewport.height : 0;
  const step = () => {
    const vv = window.visualViewport; const h = vv ? vv.height : 0;
    if (h0 && h < h0 - 20) sawDrop = true;
    if (h === lastH) stable++; else { stable = 0; lastH = h; }
    if ((sawDrop && stable >= 2) || Date.now() - t0 > 700) { clearInterval(kbInSettle); kbInSettle = null; ensureFieldVisible(); }
  };
  kbInSettle = setInterval(step, 80); step();
});
function ensureFieldVisible() { // Beta 1.61: the keyboard overlays the frozen layout, so a field it would cover is surfaced locally - the sheet's own list scrolls (instantly, as in 1.56) or the pop-up/modal card shifts up by the overlap; the shift is cleared when the keyboard leaves (startKbSettle's release, or the next focusin).
  try {
    const ae = document.activeElement; if (!ae || (ae.tagName !== 'TEXTAREA' && ae.tagName !== 'INPUT')) return;
    const vv = window.visualViewport; if (!vv) return;
    kbVisH = vv.height;
    const floor = vv.height - 8; // the visible bottom edge while the keyboard is up
    const r = ae.getBoundingClientRect();
    if (r.bottom <= floor && r.top >= 0 && !kbShiftHost) return; // Beta 1.70 (audit A02): with a card shift already applied, fall through - the host branch below may need to grow, shrink or clear it
    const sb = $('sheetBody');
    if (sb && sb.contains(ae)) {
      if (r.bottom > floor) sb.scrollTop += (r.bottom - floor) + 12;
      else if (r.top < sb.getBoundingClientRect().top) sb.scrollTop -= (sb.getBoundingClientRect().top - r.top) + 12;
      return;
    }
    const host = ae.closest('#selPop, .modal .card');
    if (host) { const rawBottom = r.bottom + (host === kbShiftHost ? kbShiftPx : 0); if (rawBottom > floor) { const over = Math.ceil(rawBottom - floor) + 12; host.style.transform = 'translateY(' + (-over) + 'px)'; kbShiftHost = host; kbShiftPx = over; } else if (host === kbShiftHost) { host.style.transform = ''; kbShiftHost = null; kbShiftPx = 0; } } // Beta 1.70 (audit A02): measure from the UNSHIFTED rect (the tracked shift added back) - the old code measured the already-shifted card and replaced its shift with a smaller one, dropping the field back under a grown keyboard
  } catch (e) { /* visibility is best-effort; the layout never depends on it */ }
}
// Beta 1.69 (audit N02, second half): while the keyboard is open, a viewport
// resize that materially changes the height re-runs the field-visibility check -
// the layout variables stay frozen (syncViewport still returns early); only the
// local scroll/shift that surfaces the field is re-evaluated, so a late-arriving
// keyboard can no longer leave the field covered after an early conclusion.
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => {
  if (!document.body.classList.contains('kb') || kbInSettle) return;
  const h = window.visualViewport.height;
  if (kbVisH >= 0 && Math.abs(h - kbVisH) > 4) ensureFieldVisible();
});
function startKbSettle() { // Beta 1.56: the settle sampler has ONE home - focusout and kbSync both start it here
  if (!document.body.classList.contains('kb')) return;
  if (kbSettle) clearInterval(kbSettle);
  // Beta 1.70 (audit A03): the mirror of the N02 opening fix - two unchanged samples at the still-short height no longer prove the keyboard has retracted (iOS can sit at the short height for a few hundred ms after blur before it starts growing). An early release now requires an observed RISE from the blur-time height (or the confirmed full height); the 1.5 s cap still bounds every dismissal.
  let lastH = -1, stable = 0, sawRise = false; const t0 = Date.now(); const hB = window.visualViewport ? window.visualViewport.height : 0;
  const step = () => {
    const ae2 = document.activeElement;
    if (ae2 && (ae2.tagName === 'TEXTAREA' || ae2.tagName === 'INPUT')) { clearInterval(kbSettle); kbSettle = null; return; }
    const vv = window.visualViewport; const h = vv ? vv.height : 0;
    if (hB && h > hB + 20) sawRise = true;
    if (h === lastH) stable++; else { stable = 0; lastH = h; }
    if ((sawRise && stable >= 2) || (fullH && h >= fullH - 2) || Date.now() - t0 > 1500) {
      clearInterval(kbSettle); kbSettle = null;
      if (kbShiftHost) { kbShiftHost.style.transform = ''; kbShiftHost = null; kbShiftPx = 0; } // Beta 1.61: undo the field-visibility shift with the keyboard gone
      document.body.classList.remove('kb'); syncViewport(); setTimeout(syncViewport, 350);
    }
  };
  kbSettle = setInterval(step, 100); step();
}
function kbSync() { // Beta 1.56: the keyboard state's single owner is this lifecycle. A render that destroys the focused editor (app2) calls kbSync() instead of removing the class itself - the release then goes through the same settle path as a normal blur, never an instant mid-animation unfreeze (external audit Issue B1, 2026-11-01)
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return; // still typing in another field
  startKbSettle();
}
document.addEventListener('focusout', e => {
  if (!e.target.matches('textarea, input')) return;
  setTimeout(() => {
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return;   // moved to another field - still typing
    startKbSettle();
  }, 0);
});
document.addEventListener('focusout', () => setTimeout(syncViewport, 60));
syncViewport();
// Beta 1.51: iOS sometimes hands a home-screen app a too-short screen height
// at launch and corrects it silently, with no resize event (Andrew's report:
// the bottom bar floats with a pale-or-dark band under it - and merely
// reopening the app often just RESUMES the same frozen page, keeping the bad
// measurement, which is why a reopen only sometimes fixed it). Measuring is
// cheap and changes nothing when the size was already right, so re-measure at
// every moment the size is known to have settled: page shown or resumed,
// return to the front, rotation, and a short ladder of post-boot re-checks.
window.addEventListener('pageshow', syncViewport);
window.addEventListener('orientationchange', () => { fullH = 0; setTimeout(syncViewport, 250); }); // Beta 1.54: the settled size belongs to the old rotation - forget it and let it re-derive
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncViewport(); });
[400, 1200, 3000, 6500].forEach(ms => setTimeout(syncViewport, ms));
let __tailDone = false;
window.__tailAt = Date.now();
function __bootTail() { if (__tailDone) return; __tailDone = true; bootMap(); applyNight(); } // Beta 1.76: the route-scoped boot steps (state load, render, stale check, wake sync, in-progress run resume) happen in loadRoute, when a route is chosen
// Beta 1.44: the heavy boot waits for the splash intro to finish, so the
// animation gets the phone to itself and every open feels like a warm one.
// Reduced-motion (no splash) and no-splash pages boot immediately, as before.
const __splashEl = document.getElementById('splash');
if (__splashEl && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // Boot the moment the intro has actually finished on THIS device (the title's
  // slide is the intro's only moving piece), plus a breath - never on a fixed clock, so a
  // slow first paint cannot push the boot chunks back into the animation. The
  // 2.6s timer is only a fallback if the animation event never lands.
  const __titleEl = document.getElementById('splashTitle');
  if (__titleEl) __titleEl.addEventListener('animationend', () => setTimeout(__bootTail, 150), { once: true });
  setTimeout(__bootTail, 2600);
} else __bootTail();
// Beta 1.33: no other-style pre-warm fetch - both Protomaps styles are embedded in the page, so the first day/night swap is instant by construction.

// ===== ROUTE LOADING + SPLASH EXIT (Beta 1.76, Andrew) =====
// The intro plays on its own (CSS). The gate waits for the app to be genuinely
// ready behind the splash - map live (glOk) and at least one basemap tile drawn
// (tilesOk) - with a minimum beat so the moment never just flashes, and a 6s
// failsafe so a dead network can never trap anyone behind the splash. At the
// gate the BRAND slides out to the right and the route menu takes the same
// blue screen: Choose a route / Create new route (a placeholder). The map
// behind carries NO route until one is chosen. Picking a route loads it
// (state, paint, camera, run resume), fades the blue, and REMOVES the splash.
// Beta 1.78: the splash plays once per cold load and can never replay - but
// the route menu is NOT removed with it: finish() parks it below the screen
// and the Routes tab slides it back up (app2's openRouteMenu).
function introToRoute() { // Beta 1.77 (Andrew): a pick opens WIDE on the route's area and flies in to the fitted view as the splash leaves, instead of the map simply appearing already zoomed in. Beta 1.81 (Andrew): the wide view dwells longer on the Route 5W point of interest and the flight in is slower and gentler - the old one was over before he could take the map in
  const b = [[routeBox.w, routeBox.s], [routeBox.e, routeBox.n]];
  const fit0 = () => { try { map.fitBounds(b, { padding: 28, animate: false }); } catch (e) {} };
  if (!map.cameraForBounds || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { fit0(); return; }
  let fit = null; try { fit = map.cameraForBounds(b, { padding: 28 }); } catch (e) {}
  if (!fit || !fit.center || typeof fit.zoom !== 'number') { fit0(); return; }
  try { map.jumpTo({ center: fit.center, zoom: Math.max(8, fit.zoom - 3) }); } catch (e) { fit0(); return; }
  setTimeout(() => { if (!map) return; try { map.flyTo({ center: fit.center, zoom: fit.zoom, duration: 3000, curve: 1.2, essential: false }); } catch (e) {} }, 1500); // 1500ms: the splash's exit (780ms) has finished and the wide view - the Route 5W point of interest - has had a moment to sit, before the slow flight in
}
function loadRoute(id) {
  if (routeLoaded) return;
  const pack = ROUTE_PACKS.find(p => p.id === id); if (!pack) return;
  document.documentElement.classList.remove('boot'); /* Beta 1.86: a loaded route IS the end of the boot state, whichever path loaded it - the boot pick, a relaunch, a test harness. The chrome returns as the state flips (in the pick flow that is still before the blue fade, so the reveal choreography is unchanged) */
  loadRouteState(id);
  activeRoute = pack; routeLoaded = true;
  renderRouteLists();
  if (map) {
    if (typeof glOk !== 'undefined' && glOk && window.GLP) { if (!map.getSource('centres')) window.GLP.init(map, GL_HOST); else window.GLP.sync(); }
    introToRoute();
  }
  refreshAll(); drawTrail(true); checkStale(); syncWake();
  if (runStart && !validateSnap(parseJ(lsGet(LS.snap), null), runStart)) toast('Resumed run — no usable cancel snapshot, so Cancel will rebuild from the marks made during the run', 4600); // Beta 1.95 (deep audit SR-194-04): the honesty lives at RESUME - Start still never blocks (the settled 1.63 stance: he is standing in the snow), but a run whose cancel snapshot is missing or damaged is resumed with its reduced Cancel guarantee stated, not silent
  if (runStart) startGps(true);
}
(() => {
  const sp = $('splash'); if (!sp) return;
  const t0 = Date.now(); let gone = false;
  const finish = () => { if (gone) return; gone = true; clearInterval(iv); sp.remove(); document.documentElement.classList.remove('boot'); /* Beta 1.85: the splash is gone - the root frame returns to the app's own colour (the html.boot rule) */ const rm = $('routeMenu'); if (rm) { rm.classList.add('notrans'); rm.classList.remove('boot', 'show', 'bye'); void rm.offsetWidth; rm.classList.remove('notrans'); } }; // Beta 1.78: park the menu below the screen without animating the swap
  const arm = () => { const wait = Math.max(0, 1900 - (Date.now() - t0)); setTimeout(() => { if (!gone) { sp.classList.add('menu'); $('routeMenu').classList.add('show'); document.documentElement.classList.remove('boot'); /* Beta 1.86: the boot state also ends HERE, when the menu arms - the still-to-live handover window (the unsettled first frames the chrome-absence protects) is long past by the gate's 1900ms minimum, and the opaque menu covers the chrome while it paints beneath. Every later state (a post-reload session at the menu, the pick, a direct load) must find a functional shell; the pick/loadRoute/finish removals stay as backstops */ } }, wait); };
  const iv = setInterval(() => {
    if (!map && Date.now() - t0 > 4000) __bootTail();
    if ((typeof glOk !== 'undefined' && glOk && typeof tilesOk !== 'undefined' && tilesOk > 0) || Date.now() - t0 > 6000) { clearInterval(iv); arm(); }
  }, 120);
  window.__bootPickRoute = id => { loadRoute(id); document.documentElement.classList.remove('boot'); /* Beta 1.86: the boot state flips FIRST, while both blue layers are still opaque - the finished app (chrome included) paints beneath them, and the fade below reveals it whole, instead of the chrome popping in after the blue is gone (the 1.67 weirdness Andrew flagged) */ let faded = false; const fade = () => { if (faded) return; faded = true; sp.classList.add('go'); $('routeMenu').classList.add('bye'); setTimeout(finish, 780); }; requestAnimationFrame(fade); setTimeout(fade, 150); }; // the boot-mode row pick (app2 wires the rows and the pane buttons): load the route, flip the boot state, fade both blue layers, then finish() removes the splash and parks the menu
})();
