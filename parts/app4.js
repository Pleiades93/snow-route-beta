
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
function packGeometry(pack) { // Beta 1.117 (F6): a pack's geometry built PURELY from its own data - the same builders the live route uses (computeStretches / samplesFor), with no live state touched. Backup and restore judge a NON-active route's records by its own geometry through this, never by the open route's - pre-1.117 they read the live STRETCH/STREETSET/SAMPLES, so a second route's snapshot validation, unknown-name count and derived sides were all silently judged against Route 5W's streets.
  const roads = (pack && pack.roads) || {};
  const names = Object.keys(roads);
  const stretch = computeStretches(roads);
  return { names, set: new Set(names), stretch, samples: samplesFor(stretch, names) };
}
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
      else { let rawSnap = null; try { rawSnap = localStorage.getItem(rk.snap); } catch (e) { return null; } const pv = validateSnap(parseJ(rawSnap, null), +startStr, packGeometry(p)); if (pv) snapObj = { at: +startStr, pieces: pv.pieces, pieceTimes: pv.pieceTimes, done: pv.done, times: pv.times, via: pv.via, cov: pv.cov }; } // Beta 1.117 (F6): a non-active pack's snapshot validates against ITS OWN geometry
      if (snapObj) data.snap = JSON.stringify(snapObj);
    }
    routes[p.id] = data;
  } // Beta 1.92 (deep audit F02): the ACTIVE route exports from the key mapping it is actually running on - on a legacy-fallback boot (migration failed) LS points at the legacy keys, and reading the fresh slot would emit a valid-looking EMPTY backup
  let night = null; try { night = localStorage.getItem(LS_GLOBAL.night); } catch (e) { return null; }
  let nightExp = null; try { nightExp = localStorage.getItem(LS_GLOBAL.nightExp); } catch (e) { return null; }
  const o = { app: 'snowroute-backup', v: 2, at: new Date().toISOString(), routes };
  const ups = readUserPacks(); if (ups === null) return null; if (Object.keys(ups).length) o.userpacks = ups; // Beta 1.118: created routes are Andrew's data - their definitions ride every backup, read with the same B04 strictness as everything else here: an unreadable created-routes record fails the export rather than shipping a valid-looking backup that silently loses his routes
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
  try { const upsR = readUserPacks(); if (upsR && Object.keys(upsR).length) o.userpacks = upsR; } catch (e) {} // Beta 1.118: created-route definitions ride the recovery backup too
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
function countUnknownNames(parsed) { // Beta 1.95 (deep audit SR-194-08): how many street names in a backup this route does not know - counted from the RAW parsed backup, BEFORE any normalization, each name ONCE. 1.94 counted what survived pushField into the write list: an object-form done map was filtered to known streets before it was pushed (its unknowns invisible), history entries in the legacy array form were skipped entirely, and a name repeated across fields counted per occurrence. The restore itself is unchanged; only the report is honest now. Beta 1.117 (F6): "known" is judged PER ROUTE - each entry against its own pack's street set, not the open route's.
  const bad = new Set();
  const setFor = id => { const p = ROUTE_PACKS.find(x => x.id === id) || (restoreOverlayPacks ? restoreOverlayPacks[id] : null); return p ? new Set(Object.keys(p.roads || {})) : new Set(); }; // Beta 1.118: a route whose definition rides THIS backup (restoreOverlayPacks) is known too
  const scanData = (data, set) => {
    const noteName = n => { if (typeof n === 'string' && !set.has(n)) bad.add(n); };
    const fromObj = o => { if (o && typeof o === 'object' && !Array.isArray(o)) for (const k of Object.keys(o)) noteName(k); };
    if (!data || typeof data !== 'object') return;
    const done = parseJ(data.done, null); if (Array.isArray(done)) { for (const n of done) noteName(n); } else fromObj(done);
    fromObj(parseJ(data.times, null)); fromObj(parseJ(data.via, null)); fromObj(parseJ(data.cov, null));
    const notesRaw = parseJ(data.notes, null); if (Array.isArray(notesRaw)) { for (const e of notesRaw) { if (e && typeof e === 'object') noteName(e.k); } } else fromObj(notesRaw); // Beta 1.96 (deep audit SR-195-05): notes in the OBJECT form ({street: [entries]}) - a shape the app itself never writes, but the restore's shape check accepts it and the loader then drops its names; 1.95's counter scanned only the array form, so those names vanished uncounted
    const sides = parseJ(data.sides, null); if (sides && typeof sides === 'object') { fromObj(sides.p); fromObj(sides.t); }
    const hist = parseJ(data.hist, null); if (Array.isArray(hist)) for (const h of hist) { if (h && typeof h === 'object') { if (Array.isArray(h.items)) { for (const n of h.items) noteName(n); } else fromObj(h.items); } }
  };
  if (parsed.v === 2 && parsed.routes && typeof parsed.routes === 'object') { for (const id of Object.keys(parsed.routes)) scanData(parsed.routes[id], setFor(id)); }
  else if (parsed.v === 1 && parsed.data && typeof parsed.data === 'object') { const lf = {}; for (const f of Object.keys(LEGACY_KEYS)) { if (parsed.data[LEGACY_KEYS[f]] != null) lf[f] = parsed.data[LEGACY_KEYS[f]]; } scanData(lf, setFor('5w')); }
  return bad.size;
}
let restoreOverlayPacks = null; // Beta 1.118: during restoreBackup, the validated created-route definitions carried by the backup itself - visible to countUnknownNames and the route lookups so a route restored WITH its definition is never reported (or rejected) as unknown
function restoreBackup(parsed) { // production doRestore semantics: validate EVERYTHING before writing; snapshot; write + verify each; verified rollback on any failure
  if (!parsed || parsed.app !== 'snowroute-backup') { toast('That is not a Snow Route backup', 3200); return; }
  const FIELD_SHAPES = { done: 'arr', times: 'obj', hist: 'arr', notes: 'obj', via: 'obj', trail: 'arr', cov: 'obj', sides: 'obj', sess: 'arr' };
  const entries = []; // [targetKey, value]
  const pushField = (targetKey, field, v, label, nameSet) => {
    if (typeof v !== 'string') { toast('Backup has a bad value for ' + label + ' — nothing was changed', 3200); return false; }
    const shape = FIELD_SHAPES[field];
    if (shape) {
      let pv; try { pv = JSON.parse(v); } catch (e) { toast('Backup value for ' + label + ' is not valid JSON — nothing was changed', 3200); return false; }
      if (field === 'done' && pv && typeof pv === 'object' && !Array.isArray(pv)) {
        v = JSON.stringify(Object.keys(pv).filter(nm => pv[nm] && (nameSet || STREETSET).has(nm))); // legacy done-set was a street->time map; migrate like the loader does. Beta 1.117 (F6): filtered against the TARGET route's names (nameSet), not the open route's
      } else if (shape === 'arr' ? !Array.isArray(pv) : !(pv && typeof pv === 'object' && !Array.isArray(pv))) { toast('Backup value for ' + label + ' has the wrong shape — nothing was changed', 3200); return false; }
    }
    entries.push([targetKey, v]); return true;
  };
  let snapDropped = false; // Beta 1.96 (SR-195-02): set when a backup CARRIES a start snapshot that cannot be restored with its run - the result message must say so
  let restoredPacks = null; // Beta 1.118: the created-route definitions this backup carries, validated before anything is written
  let allPacks = ROUTE_PACKS; // the routes this restore knows about: the runtime list, plus restoredPacks once validated
  if (parsed.v === 2) {
    if (!parsed.routes || typeof parsed.routes !== 'object' || Array.isArray(parsed.routes)) { toast('That is not a Snow Route backup', 3200); return; }
    if (parsed.userpacks !== undefined) { // Beta 1.118: validate the created-route definitions FIRST - they register before any route state is applied, fail-closed like everything else in this function. An id that collides with a SHIPPED pack is rejected outright: created ids are generated slugs that never collide, so a collision means the file is corrupt or tampered with.
      if (!parsed.userpacks || typeof parsed.userpacks !== 'object' || Array.isArray(parsed.userpacks)) { toast('Backup has a bad created-routes record — nothing was changed', 3200); return; }
      restoredPacks = {};
      for (const rid of Object.keys(parsed.userpacks)) {
        if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(rid) || SHIPPED_PACK_IDS.has(rid)) { toast('Backup has a bad created route id (' + rid + ') — nothing was changed', 3200); return; }
        const v = normalizePack(parsed.userpacks[rid], {});
        if (!v.ok) { toast('Backup has a bad created route (' + rid + ': ' + v.error + ') — nothing was changed', 3200); return; }
        v.pack.id = rid; restoredPacks[rid] = v.pack;
      }
      allPacks = ROUTE_PACKS.concat(Object.values(restoredPacks));
    }
    for (const id of Object.keys(parsed.routes)) {
      const pack = ROUTE_PACKS.find(p => p.id === id) || (restoredPacks ? restoredPacks[id] : null); if (!pack) { toast('Backup mentions an unknown route (' + id + ') — nothing was changed', 3200); return; } // Beta 1.118: a route whose definition rides this same backup is known
      const data = parsed.routes[id]; if (!data || typeof data !== 'object' || Array.isArray(data)) { toast('That is not a Snow Route backup', 3200); return; }
      const rk = routeKeys(id);
      const pg = packGeometry(pack); // Beta 1.117 (F6): this route's own geometry, for its name filter and snapshot validation below
      for (const f of ROUTE_FIELDS) { if (data[f] === undefined) continue; if (f === 'start' && data[f] === null) continue; if (!pushField(rk[f], f, data[f], pack.name + ' ' + f, pg.set)) return; }
      if (data.start === null) { entries.push([rk.start, null]); entries.push([rk.snap, null]); if (data.snap !== undefined && data.snap !== null) snapDropped = true; } // Beta 1.97 (audit loop CG-196-01): an explicit idle assertion (start: null, a current-format complete backup) clears the destination's run state INSIDE the verified write set, so a failed restore rolls the clearing back too. An OMITTED start (older backups) keeps the missing-key rule: the destination's run is left alone.
      else if (data.snap !== undefined) { // Beta 1.96 (SR-195-02): a carried start snapshot (recovery backups) is restored WITH its run. Beta 1.97 verify cycle 1 (CG-196-01): ELSE - an explicit idle assertion already consumed this route's lifecycle state above; a snap string riding an idle assertion is dropped (and reported), never validated against the deleted start and written back - it earns a write only by passing validateSnap against the start this same backup carries for the route, and it is written in its normalized form through the same verified entries as every other field, so a failed restore rolls it back too. A snapshot that fails validation, or one whose run's start is not in the backup, is dropped and reported in the result message - never applied, never silently kept.
        const startEnt = entries.find(e => e[0] === rk.start);
        let restoredSnap = null;
        if (startEnt && typeof data.snap === 'string') { try { const valid = validateSnap(JSON.parse(data.snap), +startEnt[1], pg); if (valid) restoredSnap = JSON.stringify({ at: +startEnt[1], pieces: valid.pieces, pieceTimes: valid.pieceTimes, done: valid.done, times: valid.times, via: valid.via, cov: valid.cov }); } catch (e) { /* an unparseable snapshot is a dropped snapshot */ } } // Beta 1.117 (F6): validated against THIS route's geometry (pg), not the open route's
        if (restoredSnap) entries.push([rk.snap, restoredSnap]); else snapDropped = true;
      }
    }
    if (parsed.night !== undefined && !pushField(LS_GLOBAL.night, 'night', parsed.night, 'night')) return;
    if (parsed.nightExp !== undefined) { const ne = parsed.nightExp; if (typeof ne !== 'string' || !isFinite(+ne) || +ne <= 0) { toast('Backup has a bad value for night override expiry — nothing was changed', 3200); return; } if (!pushField(LS_GLOBAL.nightExp, 'nightExp', ne, 'night override expiry')) return; } // Beta 1.92 (audit F01): the expiry must be a finite positive epoch string - any other text used to sail through and poison the next boot
  } else if (parsed.v === 1) { // Beta 1.76: a v1 backup is the pre-routes format - its data map (keyed by the legacy storage names) belongs to Route 5W and lands in the 5W slot
    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) { toast('That is not a Snow Route backup', 3200); return; }
    const rk5 = routeKeys('5w');
    const pack5 = ROUTE_PACKS.find(p => p.id === '5w'); const pg5 = pack5 ? packGeometry(pack5) : null; // Beta 1.117 (F6): a v1 backup's names filter against the 5W pack's own set
    for (const f of ROUTE_FIELDS) { const lv = parsed.data[LEGACY_KEYS[f]]; if (lv === undefined) continue; if (!pushField(rk5[f], f, lv, 'Route 5W ' + f, pg5 ? pg5.set : null)) return; }
    if (parsed.data['snowroute.v2.night'] !== undefined && !pushField(LS_GLOBAL.night, 'night', parsed.data['snowroute.v2.night'], 'night')) return;
  } else { toast('Unsupported backup version (' + String(parsed.v) + ') — nothing was changed', 3200); return; }
  if (restoredPacks) { const merged = { ...loadUserPacks(), ...restoredPacks }; entries.push([USERPACKS_KEY, JSON.stringify(merged)]); } // Beta 1.118: the definitions land as ONE verified entry in the same write set (merged over the device's current record - a restore adds/updates routes, it does not delete ones the backup predates), inside the rollback scope below, and the reload that ends every restore re-registers them at boot before their state is read
  // Beta 1.73 (audit C06, Andrew's call): a backup that replaces a route's TRAIL but carries no
  // session markers of its own must not inherit the CURRENT trail's markers - they describe the
  // trail being replaced and would split the restored trail at wrong places. Clear them as part
  // of this restore: the entry is written and verified like every other, and the snapshot +
  // rollback below cover the markers too. Applies per route (today: the 5W slot in both formats).
  for (const p of allPacks) { const rk = routeKeys(p.id); if (entries.some(e => e[0] === rk.trail) && !entries.some(e => e[0] === rk.sess)) entries.push([rk.sess, '[]']); }
  // Beta 1.92 (deep audit F06, Andrew's pick (a)): a backup carrying a route's completion
  // list but NO side-marks record (the old v1 shape) used to restore into silence - the
  // loader trusts the side-marks and rebuilt the list from the phone's existing ones,
  // erasing the restore while reporting success. Derive the side-marks from the list
  // instead, by the loader's own rule for streets with no sides record: a completed
  // street is all-sides-done, stamped with its completion time. Scoped to backups that
  // lack sides entirely; a backup WITH sides restores exactly as written.
  for (const p of allPacks) {
    const rk = routeKeys(p.id);
    const doneEnt = entries.find(e => e[0] === rk.done);
    if (!doneEnt || entries.some(e => e[0] === rk.sides)) continue;
    try {
      const names = JSON.parse(doneEnt[1]);
      if (!Array.isArray(names)) continue;
      const timesEnt = entries.find(e => e[0] === rk.times);
      const times = timesEnt ? (JSON.parse(timesEnt[1]) || {}) : {};
      const P = {}, T = {};
      const pg = packGeometry(p); // Beta 1.117 (F6): derive through the TARGET route's own geometry - pre-1.117 this read the ACTIVE route's STREETSET/STRETCH, so a done-only entry for another route was derived against the wrong streets and its names silently dropped
      for (const n of names) { if (typeof n !== 'string' || !pg.set.has(n) || !pg.stretch[n]) continue; P[n] = pg.stretch[n].parts.map(() => 3); T[n] = pg.stretch[n].parts.map(() => [times[n] || null, times[n] || null]); }
      entries.push([rk.sides, JSON.stringify({ p: P, t: T })]); // Beta 1.93 (follow-up audit R03): ALWAYS write the derived authority when the backup carries done-but-no-sides - an explicitly EMPTY list ('[]') is an intentional empty state, and {} reads back as nothing done; skipping the write used to leave the phone's old sides in charge
    } catch (e) { /* a list that cannot be parsed was already rejected during validation - never invent sides from rubble */ }
  }
  restoreOverlayPacks = restoredPacks; const droppedNames = countUnknownNames(parsed); restoreOverlayPacks = null; // Beta 1.95 (SR-194-08): counted from the RAW backup before any normalization - see countUnknownNames. Beta 1.118: judged with this backup's own created-route definitions overlaid
  if (!entries.length) { toast('Nothing in that backup to restore', 3000); return; }
  const SCOPE = []; for (const p of allPacks) { const rk = routeKeys(p.id); for (const f of ROUTE_FIELDS) SCOPE.push(rk[f]); SCOPE.push(rk.snap); } if (restoredPacks) SCOPE.push(USERPACKS_KEY); SCOPE.push(LS_GLOBAL.night, LS_GLOBAL.nightExp); // Beta 1.118: the created-routes record and restored routes' slots join the rollback scope // Beta 1.96 (SR-195-02): the snapshot key joins the rollback scope - a restore that writes a carried snapshot must be able to put the previous one back
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
function packTileUrls(pk) { // Beta 1.117 (F5): the TILE urls attributable to ONE pack - its offline area (pack.box; a pack without one falls back to its own roads' bounds) at z8-14 plus its z15 route core. Sprites and glyphs are shared chrome, attributable to no route. preloadUrlList unions this over every known pack; the per-route preload record counts against it.
  const urls = new Set();
  for (const key of ['day', 'night']) {
    const stj = GL_STYLES[key];
    for (const srcName of Object.keys(stj.sources || {})) {
      const src = stj.sources[srcName];
      if (src.type !== 'vector' || !src.tiles) continue;
      const maxz = Math.min(14, src.maxzoom || 14);
      const ex = pk.box || computeRouteBox(pk.roads || {});
      // tile y grows SOUTHWARD: the north edge (y1) is the smaller number - looping y0..y1 (the pre-1.34 code) silently downloaded ZERO tiles; drive123 A8 counts the fetched tile URLs so this can never pass unnoticed again
      // Beta 1.72 (Phase 3, item R04): the wide zooms join the set - the map itself allows zoom 8 (minZoom), but the preload stopped at z10, so offline at z8-9 the basemap had nothing to draw. Over the Vaughan box those zooms are 3 tiles (1 + 2).
      if (ex) for (let z = 8; z <= maxz; z++) { const [x0, y1] = tileNums(ex.w, ex.n, z); const [x1, y0] = tileNums(ex.e, ex.s, z); for (let x = x0; x <= x1; x++) for (let y = y1; y <= y0; y++) for (const t of src.tiles) urls.add(t.replace('{z}', z).replace('{x}', x).replace('{y}', y)); }
      // Beta 1.41: display zooms 15-19 all render from z15 tiles (the source's maxzoom) - yet the set above stops at 14, so the working zoom band was the LEAST cached. Add z15 over the route core only (the pack's own roads bounds + margin, so it cannot drift): 15 tiles for 5W. z15 over the whole Vaughan box would be ~1,400 files for streets he never opens.
      if ((src.maxzoom || 14) >= 15) { const rb = computeRouteBox(pk.roads || {}); if (rb) { const cb = { w: rb.w - 0.005, s: rb.s - 0.004, e: rb.e + 0.005, n: rb.n + 0.004 }; const [cx0, cy1] = tileNums(cb.w, cb.n, 15); const [cx1, cy0] = tileNums(cb.e, cb.s, 15); for (let x = cx0; x <= cx1; x++) for (let y = cy1; y <= cy0; y++) for (const t of src.tiles) urls.add(t.replace('{z}', 15).replace('{x}', x).replace('{y}', y)); } }
    }
  }
  return urls;
}
function preloadUrlList() { // Beta 1.95 (deep audit SR-194-06): the deterministic preload set, extracted from the download handler so the offline-pack migration below derives its manifest from the SAME list - one source of truth, the two can never drift apart. Beta 1.117 (F5): the tile part is the UNION over every pack the app knows (each pack's area + core, the packTileUrls enumeration inlined per source so the list's ORDER - and therefore the pack fingerprint the offline contract pins - is unchanged from the single-pack era). With only Route 5W shipped the list is exactly the frozen 897: the 5W pack's box IS the Beta 1.34 Vaughan box (Vaughan + nearby at full street detail; day and night are two skins over these SAME tiles, so this one set covers both modes). It reads PACK data only, never the live route, so it is identical before any route is chosen.
  const urls = new Set();
  for (const key of ['day', 'night']) {
    const stj = GL_STYLES[key]; // Beta 1.33: the styles are embedded objects (pmstyles.js) - already in the shell, nothing to fetch
    const spr = Array.isArray(stj.sprite) ? stj.sprite[0].url : stj.sprite;
    if (spr) { urls.add(spr + '.json'); urls.add(spr + '.png'); urls.add(spr + '@2x.json'); urls.add(spr + '@2x.png'); }
    if (stj.glyphs) { const stack = 'Noto Sans Regular'; for (let a = 0; a <= 255; a++) urls.add(stj.glyphs.replace('{fontstack}', stack).replace('{range}', a * 256 + '-' + (a * 256 + 255))); } // the stack GL actually requests per style (Stage 2, audit G-5)
    for (const srcName of Object.keys(stj.sources || {})) {
      const src = stj.sources[srcName];
      if (src.type !== 'vector' || !src.tiles) continue;
      const maxz = Math.min(14, src.maxzoom || 14);
      for (const pk of ROUTE_PACKS) {
        const ex = pk.box || computeRouteBox(pk.roads || {});
        // tile y grows SOUTHWARD: the north edge (y1) is the smaller number - looping y0..y1 (the pre-1.34 code) silently downloaded ZERO tiles; drive123 A8 counts the fetched tile URLs so this can never pass unnoticed again
        // Beta 1.72 (Phase 3, item R04): the wide zooms join the set - the map itself allows zoom 8 (minZoom), but the preload stopped at z10, so offline at z8-9 the basemap had nothing to draw. Over the Vaughan box those zooms are 3 tiles (1 + 2).
        if (ex) for (let z = 8; z <= maxz; z++) { const [x0, y1] = tileNums(ex.w, ex.n, z); const [x1, y0] = tileNums(ex.e, ex.s, z); for (let x = x0; x <= x1; x++) for (let y = y1; y <= y0; y++) for (const t of src.tiles) urls.add(t.replace('{z}', z).replace('{x}', x).replace('{y}', y)); }
        // Beta 1.41: display zooms 15-19 all render from z15 tiles (the source's maxzoom) - yet the set above stops at 14, so the working zoom band was the LEAST cached. Add z15 over the route core only (the pack's own roads bounds + margin, derived from the pack's own data so it cannot drift): 15 tiles for 5W. z15 over the whole Vaughan box would be ~1,400 files for streets he never opens.
        if ((src.maxzoom || 14) >= 15) { const rb = computeRouteBox(pk.roads || {}); if (rb) { const cb = { w: rb.w - 0.005, s: rb.s - 0.004, e: rb.e + 0.005, n: rb.n + 0.004 }; const [cx0, cy1] = tileNums(cb.w, cb.n, 15); const [cx1, cy0] = tileNums(cb.e, cb.s, 15); for (let x = cx0; x <= cx1; x++) for (let y = cy1; y <= cy0; y++) for (const t of src.tiles) urls.add(t.replace('{z}', 15).replace('{x}', x).replace('{y}', y)); } }
      }
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
    // Beta 1.117 (F5): the preload record lives in the ACTIVE route's slot and now carries BOTH counts - saved/total over the whole union manifest (the pack is one shared cache; the Status census reads those) and routeSaved/routeTotal over THIS route's own tile subset (packTileUrls), so completion is accounted per route instead of one route's download silently standing for every route's.
    let routeSaved = saved, routeTotal = list.length;
    if (activeRoute) { const sub = packTileUrls(activeRoute); const confSet = new Set(confirmed); routeTotal = sub.size; routeSaved = 0; for (const u of sub) if (confSet.has(u)) routeSaved++; }
    lsSet(LS.pre, JSON.stringify({ at: Date.now(), saved, total: list.length, routeSaved, routeTotal }));
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
  centre: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" fill="none" stroke="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/></svg>', /* Beta 1.116 (CG-115-04, Andrew's pick 2026-11-05 from the centre-icon mockup sheet, candidate #2 "Crosshair"): the Google-Maps-style re-centre glyph - stroked ring, four ticks, filled centre dot - ported verbatim from the approved mockup artwork, coloured by the button like the rest of the pack */
  gear: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M8.98 4.70 L9.66 1.87 L14.34 1.87 L15.02 4.70 L15.02 4.70 L17.51 3.18 L20.82 6.49 L19.30 8.98 L19.30 8.98 L22.13 9.66 L22.13 14.34 L19.30 15.02 L19.30 15.02 L20.82 17.51 L17.51 20.82 L15.02 19.30 L15.02 19.30 L14.34 22.13 L9.66 22.13 L8.98 19.30 L8.98 19.30 L6.49 20.82 L3.18 17.51 L4.70 15.02 L4.70 15.02 L1.87 14.34 L1.87 9.66 L4.70 8.98 L4.70 8.98 L3.18 6.49 L6.49 3.18 L8.98 4.70 ZM12 8.70 a3.30 3.30 0 1 0 0.001 0 Z"/></svg>', /* Pack D language, drawn for the Settings tab (Beta 1.29) */
  pin: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 2.8c-3.86 0-7 3.13-7 7 0 5.25 7 11.2 7 11.2s7-5.95 7-11.2c0-3.87-3.14-7-7-7zM12 7a2.8 2.8 0 1 0 .001 0z"/></svg>', /* Pack D language (Beta 1.30): the Streets row jump-to pin */
  note: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M6.5 2.8h7.2l4.8 4.8v13.6H6.5zM9.3 12.2h5.9v2H9.3zM9.3 16h5.9v2H9.3z"/></svg>', /* Pack D language (Beta 1.30): the note glyph for rows and the selection pop-up */
  exp: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path fill="currentColor" stroke="none" d="M11 3h2v9.2l2.4-2.4 1.5 1.5L12 16.2l-4.9-4.9 1.5-1.5L11 12.2z"/><path fill="currentColor" stroke="none" d="M4.4 15.6h3.4v2.6h8.4v-2.6h3.4V21H4.4z"/></svg>'
};
$('streetsBtn').innerHTML = ICONS.streets; $('paceBtn').innerHTML = ICONS.pace; $('centreBtn').innerHTML = ICONS.centre; // Beta 1.116 (Andrew): the re-centre button wears the standard GPS crosshair/target glyph other map apps use - the Locate tab keeps the navigation arrow and is otherwise untouched
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
  lsDel(PACKMIG_KEY); for (const p of ROUTE_PACKS) lsDel(routeKeys(p.id).pre); // the completion flag and EVERY route's preload record go with the pack (Beta 1.117: the records are per-route - clearing only the active route's would leave another route claiming a download that no longer exists); the browsing tile cache ('snowroute-tiles-v1') is a cache, not the pack - it stays
  toast('Offline maps deleted');
  renderStatus(true);
});
// ---- About / What's new ----
const WHATSNEW = { // the curated in-app notes: plain words, LATEST RELEASE ONLY (Beta 1.114, Andrew: the accumulated list cluttered the About pane). A release REPLACES this entry with its own in the same change - it never accumulates; the full history lives in CHANGELOG.md, not the app
  v: 'Beta 1.132', items: ["Sector buttons are renamed: Entire road and Done — and Entire road is easy to read on the night map now", "Throwing away a draft asks with one red Discard button — the red X in the corner, or a tap anywhere outside, keeps you editing instead", "Swipes in the gap under the tucked-away route pill no longer move the map"]
};
function renderAbout() {
  const cur = $('ver').textContent.trim();
  $('wnHead').textContent = "WHAT'S NEW · " + cur; // the header names the LIVE version, read from the title's version element - never a second hard-coded copy that can go stale
  const list = $('wnList'); list.innerHTML = '';
  for (const item of WHATSNEW.items) { const d = document.createElement('div'); d.className = 'm-wnItem'; const dot = document.createElement('span'); dot.className = 'm-wnDot'; dot.innerHTML = '&middot;'; const tx = document.createElement('span'); tx.textContent = item; d.appendChild(dot); d.appendChild(tx); list.appendChild(d); } // exactly one version block: the current release's items directly under the header, no older-version subheads (1.114)
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
$('homeBtn').addEventListener('click', () => { if (!tapGuard('homeBtn')) return; if (!routeBox) return; map.fitBounds([[routeBox.w, routeBox.s], [routeBox.e, routeBox.n]], { padding: 28 }); }); // Beta 1.117: no route loaded (or an empty pack) - no box to frame
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
  if (!routeBox) return; // Beta 1.117: an empty pack has no area to fly to - the map simply stays where it is
  const b = [[routeBox.w, routeBox.s], [routeBox.e, routeBox.n]];
  const fit0 = () => { try { map.fitBounds(b, { padding: 28, animate: false }); } catch (e) {} };
  if (!map.cameraForBounds || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { fit0(); return; }
  let fit = null; try { fit = map.cameraForBounds(b, { padding: 28 }); } catch (e) {}
  if (!fit || !fit.center || typeof fit.zoom !== 'number') { fit0(); return; }
  try { map.jumpTo({ center: fit.center, zoom: Math.max(8, fit.zoom - 3) }); } catch (e) { fit0(); return; }
  setTimeout(() => { if (!map) return; try { map.flyTo({ center: fit.center, zoom: fit.zoom, duration: 3000, curve: 1.2, essential: false }); } catch (e) {} }, 1500); // 1500ms: the splash's exit (780ms) has finished and the wide view - the Route 5W point of interest - has had a moment to sit, before the slow flight in
}
function resetSwitchSession() { // Beta 1.117 (F3/F4): the ONE reset block a route switch runs - everything that names the OUTGOING route's session dies here, before the new pack's geometry or state exists. Runs after the F2 flush (loadRoute calls collapseNoteEditor first, so an open note draft has already finalized against the outgoing street).
  runSnap = null; // F3: the in-memory cancel snapshot belongs to the outgoing run. The PERSISTED copy (LS.snap, in the outgoing slot) is deliberately untouched - after switching back, Cancel validates it exactly as it does after a reload
  deselect(); // selection + chips + the engine's selection, through the one proven path
  noteOpenFor = null; noteEdFor = null; if (noteSaveTimer) { clearTimeout(noteSaveTimer); noteSaveTimer = 0; } // the note editor's pending debounced save must never fire into the new route (its flush already happened via collapseNoteEditor)
  listFilter = 'mains'; document.querySelectorAll('#filters button').forEach(x => x.classList.toggle('on', x.dataset.f === 'mains'));
  srowCache = { sig: '', rows: new Map() };
  histOpen = false; cleanIdx = null; cleanDelArmed = false; if (cleanDelTimer) { clearTimeout(cleanDelTimer); cleanDelTimer = 0; } // the history panel and its delete-arming
  noteFor = null; $('noteModal').classList.add('hidden'); // the modal note editor
  suggested = new Set(); $('suggest').classList.add('hidden'); $('stale').classList.add('hidden'); // run-scoped suggestion set + the two banners (checkStale re-judges the stale banner for the incoming route below)
  saveWarned = false; // the storage-warning episode belonged to the outgoing route's saves
  markClean('trail'); markClean('sess'); markClean('snap'); markClean('start'); markClean('aux'); markClean('primary'); // the dirty flags described the outgoing route's pending writes; the flush above landed what it could, and the incoming route's state (loaded next) starts clean - a stale flag must never re-fire against the new slot
}
function loadRoute(id) {
  const pack = ROUTE_PACKS.find(p => p.id === id); if (!pack) return;
  if (routeLoaded && activeRoute && activeRoute.id === id) return; // picking the route already loaded changes nothing (the Routes tab handler guards this too)
  // Beta 1.117: loadRoute is BOTH the boot pick and the live switch (pre-1.117 a
  // `if (routeLoaded) return;` guard made it boot-only, and the Routes tab's pick
  // was a silent no-op - segregation audit F1-F4). SWITCH SEMANTICS (= a cold
  // boot on the target route, plus the pre-flush a reboot only gets via
  // pagehide): a run in progress on the outgoing route is NOT ended - it
  // persists whole in its own slot (start, board, trail, sessions, persisted
  // cancel snapshot) and resumes through this same path when its route is
  // picked again; the GPS watch is device state (F8) and is not stopped or
  // restarted by a switch beyond the resume call below.
  const switching = routeLoaded;
  if (switching) {
    collapseNoteEditor(); // an open note draft finalizes against the OUTGOING street first (renderStreets' draft flush, through saveAllWarned)
    flushAux(true); // F2: the outgoing route's pending trail/session/snapshot/start/coverage writes land in ITS slot before LS repoints
    if (writePending('primary')) { const okPrim = saveAll(); if (!okPrim.ok) toast('Storage problem — some changes on the route you left could not be saved', 4200); } // F2: one verified retry of a failed primary save before the repoint; a failure is said out loud, never silently dropped
    resetSwitchSession(); // F3/F4
  }
  document.documentElement.classList.remove('boot'); /* Beta 1.86: a loaded route IS the end of the boot state, whichever path loaded it - the boot pick, a relaunch, a test harness. The chrome returns as the state flips (in the pick flow that is still before the blue fade, so the reveal choreography is unchanged) */
  buildGeometry(pack); // Beta 1.117 (F1): geometry BEFORE state - loadRouteState's sanitizers filter against the NEW pack's streets
  loadRouteState(id);
  activeRoute = pack; routeLoaded = true;
  renderRouteLists();
  if (map) {
    if (window.GLP) window.GLP.rebuildRoute(); // Beta 1.117: the engine's geometry + CUR follow the pack on EVERY load - the boot pick included (pre-1.117 the engine's geometry existed from script eval, so init could build from it; now rebuildRoute is what builds it, and it is safe before the style is ready: its map touches are source-guarded and the deferred init in onStyleReady then finds CUR already correct)
    if (typeof glOk !== 'undefined' && glOk && window.GLP) {
      if (!map.getSource('centres')) window.GLP.init(map, GL_HOST); else if (!switching) window.GLP.sync();
    }
    if (switching) { try { addReferenceLayers(); } catch (e) {} if (routeBox) { try { map.fitBounds([[routeBox.w, routeBox.s], [routeBox.e, routeBox.n]], { padding: 28 }); } catch (e) {} } } // a switch frames the new route at once - the wide dwell + slow flight (introToRoute) is boot choreography only
    else introToRoute();
  }
  refreshAll(); drawTrail(true); checkStale(); syncWake();
  if (runStart && !validateSnap(parseJ(lsGet(LS.snap), null), runStart)) toast('Resumed run — no usable cancel snapshot, so Cancel will rebuild from the marks made during the run', 4600); // Beta 1.95 (deep audit SR-194-04): the honesty lives at RESUME - Start still never blocks (the settled 1.63 stance: he is standing in the snow), but a run whose cancel snapshot is missing or damaged is resumed with its reduced Cancel guarantee stated, not silent
  if (runStart) startGps(true);
}
function unloadRouteToBoot() { // Beta 1.124: the ACTIVE route was deleted - return the app to the boot-picker state, mirroring a cold boot before any pick (no geometry at eval, no state loaded, LS at its eval default, the menu in boot mode over rmMain). The mirror is of the RESTING picker, whose html carries NO boot class (Beta 1.126 - see the remove() below). Unlike a route SWITCH there is no flush: the outgoing slot's keys are wiped by deleteRoute right after, so nothing may write into them here - resetSwitchSession's clearing (note timer, dirty flags) is exactly the teardown needed, and its flush steps are deliberately NOT run.
  const hadRun = !!runStart;
  resetSwitchSession();
  if (hadRun) stopGps(true); // a clean on a deleted route cannot keep recording - its trail's slot no longer exists
  buildGeometry({ roads: {}, reference: {}, mains: [] }); // the eval-time emptiness a cold boot shows before any pick (drive149's zero-geometry state)
  if (map && window.GLP) window.GLP.rebuildRoute();
  doneSet = new Set(); doneTimes = {}; doneVia = {}; notes = {}; history = []; runStart = 0; trail = []; trailSessions = []; coveredIdx = {}; pieces = {}; pieceTimes = {}; // the eval empties (app1's declarations)
  LS = { ...routeKeys('5w'), ...LS_GLOBAL }; // the eval default - the next pick repoints it via loadRoute
  activeRoute = null; routeLoaded = false;
  document.documentElement.classList.remove('boot'); // Beta 1.126: NOT add. A cold boot's RESTING picker carries no html.boot - the boot tail's arm() removes it when the menu arms (finish()/loadRoute are backstops), because while it stands the 1.86 chrome-absence rule (html.boot body > *:not(#splash):not(#routeMenu):not(#map) { display: none !important }) force-hides every other body child. 1.124 re-added it here and nothing on the create path removed it again, so after deleting the active route the whole create stage (#createBar, #createSheet, #createResults, #createHint - and the 'Route deleted' toast) was display:none for the rest of the session: Andrew's search bar and selected-roads panel never painted, though the map (excepted from the rule) still took taps and the draft filled invisibly. drive155 A1-A4 pin the resting state + computed visibility.
  const rm = $('routeMenu'); rm.classList.remove('tab', 'open'); rm.classList.add('boot', 'show'); showRmPane('rmMain'); renderRouteLists();
  syncWake();
}
function deleteRoute(id) { // Beta 1.124 (Andrew): delete a route HE created - the shipped packs are refused (SHIPPED_PACK_IDS), so the built-in 5W can never be deleted. Order is the safety: (1) the userpacks definition goes first, through a strict read and a VERIFIED write - on any failure nothing else is touched, the route stays listed and fully intact, and a toast names the storage problem; (2) only then is the pack unregistered and every key of its slot wiped - enumerated from routeKeys (ROUTE_FIELDS + snap + mig + its preload record), never hand-listed, so a future field joins the sweep by construction; (3) if it was the active route, the app returns to the boot picker; (4) the list re-renders without it.
  const ix = ROUTE_PACKS.findIndex(p => p.id === id); if (ix < 0 || SHIPPED_PACK_IDS.has(id)) return;
  const rec = readUserPacks(); // strict: a record that cannot be read is never rewritten blind - rescuing one deletion must never cost every created route
  if (!rec || !rec[id]) { toast('Storage problem — the route could not be deleted', 4000); return; }
  delete rec[id];
  if (!lsSet(USERPACKS_KEY, JSON.stringify(rec))) { toast('Storage problem — the route could not be deleted', 4000); return; }
  const back = readUserPacks(); if (!back || back[id]) { toast('Storage problem — the route could not be deleted', 4000); return; } // the storage-outcome contract: the write is verified before any data is wiped - a route whose definition survived keeps its data and its row
  const wasActive = !!(activeRoute && activeRoute.id === id && routeLoaded);
  ROUTE_PACKS.splice(ix, 1);
  const rk = routeKeys(id); for (const k of Object.values(rk)) lsDel(k);
  // Reference sweep (1.124): nothing else keys on a route id - the IndexedDB city cache is keyed by CITY (a deleted route's city stays cached for the next route there), LS_GLOBAL.lastArea is a city name, and PACKMIG's fingerprint derives from preloadUrlList() over ROUTE_PACKS, so removing the pack honestly un-certifies the old union download (the tiles themselves stay cached; the Settings line simply offers the current set's download again).
  if (wasActive) unloadRouteToBoot(); else renderRouteLists();
  toast('Route deleted', 2600);
}
function askDeleteRoute(id) { // Beta 1.124: the Delete button on a created route's row (app2's routeRowEl) - the shared create confirm asks, with the deletion labels; the confirm's card is the theme-token surface in both day and night.
  const pack = ROUTE_PACKS.find(p => p.id === id); if (!pack || SHIPPED_PACK_IDS.has(id)) return;
  crConfirm('Delete ' + pack.name + '?', 'The route and everything saved for it on this phone — progress, notes, history — will be removed. This can’t be undone.', () => deleteRoute(id), { yes: 'Delete', no: 'Cancel', danger: true });
}
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
  if (name.length > 60) return bad('the route name is too long');
  if (!opts.draft && !name) return bad('the route has no name');
  const area = typeof raw.area === 'string' ? raw.area.trim().slice(0, 60) : '';
  let totalPts = 0;
  const cleanRoads = (obj, label) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { error: 'the ' + label + ' are missing or the wrong shape' };
    const out = {}; const names = Object.keys(obj);
    if (names.length > 300) return { error: 'too many streets in the ' + label };
    for (const nm0 of names) {
      const nm = nm0.trim();
      if (!nm || nm.length > 60) return { error: 'a street name in the ' + label + ' is missing or too long' };
      if (out[nm]) return { error: 'the street "' + nm + '" appears twice' };
      const segsIn = obj[nm0];
      if (!Array.isArray(segsIn) || !segsIn.length || segsIn.length > 80) return { error: 'the street "' + nm + '" has no usable shape' };
      const segs = [];
      for (const segIn of segsIn) {
        if (!Array.isArray(segIn) || segIn.length < 2 || segIn.length > 4000) return { error: 'the street "' + nm + '" has a bad segment' };
        const seg = [];
        for (const pt of segIn) {
          if (!Array.isArray(pt) || pt.length < 2 || !isFinite(pt[0]) || !isFinite(pt[1]) || Math.abs(pt[0]) > 90 || Math.abs(pt[1]) > 180) return { error: 'the street "' + nm + '" has a bad map point' };
          const p = [Math.round(pt[0] * 1e7) / 1e7, Math.round(pt[1] * 1e7) / 1e7];
          if (!seg.length || seg[seg.length - 1][0] !== p[0] || seg[seg.length - 1][1] !== p[1]) seg.push(p);
          if (++totalPts > 150000) return { error: 'the route is too big' };
        }
        if (seg.length > 1) segs.push(seg);
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
  if (Array.isArray(raw.tileNames)) for (const t of raw.tileNames) if (typeof t === 'string' && t && t.length <= 80 && tileSet.size < 400) tileSet.add(t);
  if (opts.tileNames) for (const t of opts.tileNames) if (typeof t === 'string' && t && t.length <= 80 && tileSet.size < 400) tileSet.add(t);
  let box = null;
  if (raw.box && isFinite(raw.box.w) && isFinite(raw.box.s) && isFinite(raw.box.e) && isFinite(raw.box.n) && raw.box.w < raw.box.e && raw.box.s < raw.box.n) box = { w: raw.box.w, s: raw.box.s, e: raw.box.e, n: raw.box.n };
  else { const cb = computeRouteBox({ ...rc.roads, ...reference }); if (cb) box = { w: Math.max(-180, cb.w - 0.03), s: Math.max(-90, cb.s - 0.025), e: Math.min(180, cb.e + 0.03), n: Math.min(90, cb.n + 0.025) }; }
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
function uniqueRouteId(name) { // a slug from the name, uniqueness-checked against shipped + created ids
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'route';
  let id = base, i = 2;
  while (ROUTE_PACKS.some(p => p.id === id)) { id = base + '-' + i; i++; }
  return id;
}
function nextRouteNameGuess() { let mx = 1; for (const p of ROUTE_PACKS) { const m = /^Route (\d+)$/.exec(p.name || ''); if (m) mx = Math.max(mx, +m[1] + 1); } return 'Route ' + Math.max(mx, ROUTE_PACKS.length + 1); }

// ---- draft state: session only (not a route, not in any slot) ----
let creating = false, crStage = 'pick', crBootParked = false, crAreaGuess = '', crPhoto = null, crPickBusy = false; // Beta 1.128: crReturnToPreview is GONE - it existed only to rewrite the panel's Done label on the return-from-preview errand, and the label no longer rewrites (Andrew: the button reads "Done", always)
let draft = null; // { roads, mains: Set, osmNames: {short: full}, tileNames: [..], name, area, sectors: {short: [chosen part indexes]} (Beta 1.127 - an ABSENT entry means the whole road), parts: {short: crStreetParts record} (session cache) }
function newDraft() { return { roads: {}, mains: new Set(), osmNames: {}, tileNames: [], name: '', area: '', sectors: {}, parts: {} }; }
let crSectorStreet = null; // Beta 1.127: the street whose sectors are being trimmed (sector mode), or null
let crSectorSnapshot = undefined; // Beta 1.129: the street's sector pick as it stood when sector mode was ENTERED (null = the whole road; an array = the trim then in force) - the sector bar's Cancel restores exactly this. undefined = no sector session in flight
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
let crGrid = null; // { name, bbox, cells: [{ key, box, state, tries }], gen, session, startedAt, ticker, ops: Set, active, fromCache, savedAt, stopped, lastFail } while a CITY grid preparation exists (kept after it settles, for progress/resume/refresh state)
let crPrepState = 'none'; // 'none' | 'preparing' | 'ready' | 'degraded' | 'failed'  ('degraded': a city grid settled with parts missing - what loaded is usable, the rest is resumable)
let crPrepFail = null; // { kind: 'unreachable' | 'error' | 'dense' | 'badjson', status?, remark? }
let crFailFromGrid = false; // which preparation produced crPrepFail - the Retry button resumes a failed GRID's missing cells but re-runs a failed fallback BOX at its anchor; the two must never be confused when both exist
let crPrepAnchor = null; // where Retry / a not-ready tap re-prepares
let crPending = {}; // short name -> { osmName, lngLat }: streets whose full shape reaches beyond verified coverage (fail-closed) - listed as pending, NEVER added half-known
let crToppedUp = {}; // '<short>@<gen>' -> true: a street's ONE top-up per coverage generation is spent
let crCityReturn = 'doors'; // where the city pane's Back lands
function crBoxAround(lat, lng, halfKm) { const dLat = halfKm * 1000 / MLAT, dLng = halfKm * 1000 / MLNG; return { s: +(lat - dLat).toFixed(6), n: +(lat + dLat).toFixed(6), w: +(lng - dLng).toFixed(6), e: +(lng + dLng).toFixed(6) }; }
function crInBox(box, lat, lng) { return !!box && lat >= box.s && lat <= box.n && lng >= box.w && lng <= box.e; }
function crInAnyBox(boxes, lat, lng) { for (const b of boxes || []) { if (crInBox(b, lat, lng)) return true; } return false; } // verified coverage is a SET of boxes (city cells + fallback boxes) - an endpoint is verified when it lies inside ANY of them
function crExpandBox(box, km) { const dLat = km * 1000 / MLAT, dLng = km * 1000 / MLNG; return { s: +(box.s - dLat).toFixed(6), n: +(box.n + dLat).toFixed(6), w: +(box.w - dLng).toFixed(6), e: +(box.e + dLng).toFixed(6) }; }
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
  // crCityPrepare / crGridRefresh when the picked city matches the pack
  // library), the pack answers the same call shape and the live Overpass
  // service becomes the fallback. The grid, the fallback box prep, the
  // top-up and everything downstream consume the identical result shape
  // either way.
  const pk = await crPackServe(box, name, sessionOk);
  if (pk) return pk;
  const ql = name ? crNameQL(name, box, Math.ceil(budgetMs / 1000)) : crAreaQL(box, Math.ceil(budgetMs / 1000));
  return crOverpassFetch(ql, budgetMs, attempt1Ms, sessionOk, op);
}
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
function crCovFromWays(byId, boxes) { // the coverage record: the extract's ways indexed by street name (ids kept in byId - grid cells and top-ups merge into the SAME index, deduped by way id), plus the SET of verified boxes completeness is judged against
  const byName = {};
  for (const id of Object.keys(byId)) {
    const w = byId[id];
    (byName[w.name] = byName[w.name] || []).push(w);
  }
  return { gen: crCovGen, byName, byId, boxes: (boxes || []).slice(), fetchedAt: Date.now() };
}
function crCovEnsure() { if (!crCov) crCov = crCovFromWays({}, []); return crCov; }
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
function crPrepCurrent(gen, session) { return creating && crSession === session && crCovGen === gen && crPrepState === 'preparing'; }
function crStartPrep(anchor) { // the FALLBACK preparation (second amendment, item D): one bounded box around an anchor, session-only - for places with no picked/saved city, and for anchors outside the city's coverage. The whole-city path is crCityPrepare below.
  if (!creating || !anchor || !isFinite(anchor.lat) || !isFinite(anchor.lng)) return;
  if (crCov && crInAnyBox(crCov.boxes, anchor.lat, anchor.lng) && crPrepState !== 'preparing') { crRenderHint(); return; } // verified coverage already includes this anchor - reuse it, no second download (CG-PF-04)
  if (crPrep && crPrepState === 'preparing' && crInBox(crBoxAround(crPrep.anchor.lat, crPrep.anchor.lng, CR_INNER_KM), anchor.lat, anchor.lng)) return; // the same preparation is already in flight - dedupe
  if (crPrep) crAbortOp(crPrep.op); // a superseding preparation stops the old download outright (CG-PF-10)
  if (crGrid) crGridStop('superseded'); // CG-PF-13: a fallback starting over a live grid must STOP the grid first - the generation bump below would otherwise orphan its in-flight cells in 'fetching' (their answers settle into the dead generation, their handlers discard them, and Resume - which only resets 'failed' cells - could never reschedule them, wedging the city mid-load forever). crGridStop aborts the grid's downloads and returns those cells to 'pending', so the city stays resumable; on a settled grid it changes nothing but the stopped marker, which crGridSettledState already reads correctly
  const session = crSession, gen = ++crCovGen;
  const outer = crBoxAround(anchor.lat, anchor.lng, CR_INNER_KM + CR_BUFFER_KM);
  crPrepState = 'preparing'; crPrepFail = null; crFailFromGrid = false; crPrepAnchor = anchor; crWanted = null; // starting a preparation IS the answer to any outstanding offer
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
      crPrepState = crGrid ? crGridSettledState() : 'ready'; // a fallback box landing does not pretend a part-missing city is whole: the settled state comes from the grid's own judge - CG-PF-14: the pending count alone promoted a city with a FAILED cell (nothing pending, one part refused) to plain 'ready', dropping the missing-parts disclosure and its Retry
      if (crPrepState === 'failed' && crGrid && crGrid.lastFail) { crPrepFail = crGrid.lastFail; crFailFromGrid = true; } // the box landed but the city had wholly failed: keep the grid's honest failure and its Retry (mirrors crGridFinish)
      crSweepPending();
    } else { crPrepState = 'failed'; crPrepFail = res; }
    crRenderHint();
  });
}
function crCancelPrep() { // stops the wait AND the downloads (CG-PF-10), keeps the draft, the city and every cell already loaded; the generation bump makes any late answer land nowhere
  if (crPrep) { clearInterval(crPrep.ticker); crAbortOp(crPrep.op); crPrep = null; }
  if (crGrid) crGridStop('cancelled');
  crCovGen++;
  crPrepFail = null;
  crPrepState = crGrid ? crGridSettledState() : (crCov && crCov.boxes.length ? 'ready' : 'none');
  crRenderHint();
}
function crSweepPending() { // a fresh extract may complete streets that were pending on a narrower one
  if (!crCov || (crPrepState !== 'ready' && crPrepState !== 'degraded')) return;
  for (const pk of Object.keys(crPending)) {
    const p = crPending[pk]; if (!p) continue;
    const res = crResolve(p.osmName, p.lngLat);
    if (res.status === 'ok') crAddStreet(pk, p.osmName, res.segs);
  }
}
// ---- the city grid + the persistent city cache (second amendment) ----
// A picked city is covered by a grid of ~4 x 4 km cells over its bounding
// box. Cells fetch through the source seam with at most CR_GRID_PARALLEL
// in flight; each answer commits to the merged extract (and to the
// on-device cache) the moment it lands, so progress is real and a stopped
// preparation resumes by fetching only the missing cells. The cache is
// IndexedDB (docs/STORAGE-SCHEMA.md): one record per city holding its
// cells' ways in compact parsed form. It is a CACHE, never user data - it
// is not part of any backup, and losing it costs a re-download, nothing
// else. A city whose stored form would exceed the cap is refused with
// the refusal DISCLOSED; a write failure degrades to session-only with
// the same disclosure - never a silent un-save.
const CR_IDB_NAME = 'snowroute-citycache', CR_IDB_STORE = 'cities';
let crCacheNote = ''; // the disclosed cache state for the current city ('' = saving fine)
let crCacheQueue = Promise.resolve(); // serializes cache read-modify-writes (parallel cell commits must not clobber each other)
function crIdbOpen() {
  return new Promise(res => {
    try {
      if (typeof indexedDB === 'undefined') { res(null); return; }
      const rq = indexedDB.open(CR_IDB_NAME, 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore(CR_IDB_STORE, { keyPath: 'cityName' }); } catch (e) {} };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
      rq.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
}
async function crIdbGet(name) {
  const db = await crIdbOpen(); if (!db) return null;
  return new Promise(res => {
    try {
      const rq = db.transaction(CR_IDB_STORE, 'readonly').objectStore(CR_IDB_STORE).get(name);
      rq.onsuccess = () => { const v = rq.result || null; try { db.close(); } catch (e) {} res(v); };
      rq.onerror = () => { try { db.close(); } catch (e) {} res(null); };
    } catch (e) { try { db.close(); } catch (e2) {} res(null); }
  });
}
async function crIdbPut(rec) {
  const db = await crIdbOpen(); if (!db) return false;
  return new Promise(res => {
    try {
      const tx = db.transaction(CR_IDB_STORE, 'readwrite');
      tx.objectStore(CR_IDB_STORE).put(rec);
      tx.oncomplete = () => { try { db.close(); } catch (e) {} res(true); };
      tx.onerror = () => { try { db.close(); } catch (e) {} res(false); };
      tx.onabort = () => { try { db.close(); } catch (e) {} res(false); };
    } catch (e) { try { db.close(); } catch (e2) {} res(false); }
  });
}
async function crIdbDelete(name) {
  const db = await crIdbOpen(); if (!db) return;
  return new Promise(res => {
    try {
      const tx = db.transaction(CR_IDB_STORE, 'readwrite');
      tx.objectStore(CR_IDB_STORE).delete(name);
      tx.oncomplete = () => { try { db.close(); } catch (e) {} res(); };
      tx.onerror = () => { try { db.close(); } catch (e) {} res(); };
    } catch (e) { try { db.close(); } catch (e2) {} res(); }
  });
}
function crCacheDisclose() { // the one wording for every cache failure (cap, quota, private mode): the session keeps working, the state is SAID
  if (crCity && !crCacheNote) { crCacheNote = 'Couldn’t save ' + crCity.name + ' on this phone — it will reload next time'; crRenderHint(); }
}
function crCacheSaveCell(cityName, bbox, totalCells, key, ways) { // write-through, one cell at a time, serialized; ways in the compact stored form [[id, name, pts], ...]
  crCacheQueue = crCacheQueue.then(async () => {
    if (crCacheNote) return; // already refused/failed for this city: stop writing, the disclosure stands
    let rec = await crIdbGet(cityName);
    if (rec && rec.bbox && (rec.bbox.s !== bbox.s || rec.bbox.n !== bbox.n || rec.bbox.w !== bbox.w || rec.bbox.e !== bbox.e)) rec = null; // CG-PF-15: a record saved under a DIFFERENT bounding box is not this grid's cache - its cells were downloaded for another grid. Merging a fresh cell into it while overwriting its bbox would defeat the restore-time bbox guard in crCityPrepare and certify coverage that was never downloaded for this grid; a changed box starts the record over
    if (!rec) rec = { cityName, bbox, cells: {}, savedAt: Date.now(), totalCells };
    rec.bbox = bbox; rec.totalCells = totalCells;
    rec.cells[key] = { at: Date.now(), ways };
    rec.savedAt = Date.now();
    let size = 0;
    try { size = JSON.stringify(rec).length; } catch (e) {}
    if (size > CR_TIMING.cityCapBytes) { crCacheDisclose(); return; } // refuse BEFORE the write rather than dying mid-write (amendment C)
    if (!(await crIdbPut(rec))) crCacheDisclose();
  }).catch(() => crCacheDisclose());
  return crCacheQueue;
}
function crGridCellsFor(bbox) { // the ~4 x 4 km grid over a city bounding box (row-major, south-west first); the last row/column clamps to the box edge
  const dLat = CR_CELL_KM * 1000 / MLAT, dLng = CR_CELL_KM * 1000 / MLNG;
  const rows = Math.max(1, Math.ceil((bbox.n - bbox.s) / dLat - 1e-9)), cols = Math.max(1, Math.ceil((bbox.e - bbox.w) / dLng - 1e-9));
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    cells.push({ key: 'r' + r + 'c' + c, box: { s: +(bbox.s + r * dLat).toFixed(6), n: +Math.min(bbox.n, bbox.s + (r + 1) * dLat).toFixed(6), w: +(bbox.w + c * dLng).toFixed(6), e: +Math.min(bbox.e, bbox.w + (c + 1) * dLng).toFixed(6) }, state: 'pending', tries: 0 });
  }
  return cells;
}
function crGridCurrent(g) { return !!g && crGrid === g && creating && crSession === g.session && crCovGen === g.gen; }
function crGridDoneCount() { return crGrid ? crGrid.cells.filter(c => c.state === 'done').length : 0; }
function crGridFailedCount() { return crGrid ? crGrid.cells.filter(c => c.state === 'failed').length : 0; }
function crGridPendingCount() { return crGrid ? crGrid.cells.filter(c => c.state === 'pending' || c.state === 'fetching').length : 0; }
function crGridSettledState() { // the honest state of a settled grid: all in = ready; some in = degraded (usable + resumable); none in = failed - or 'none' when Andrew stopped it before anything landed
  if (!crGrid) return crCov && crCov.boxes.length ? 'ready' : 'none';
  if (crGridPendingCount() > 0 && !crGrid.stopped) return 'preparing';
  if (crGridFailedCount() === 0 && crGridPendingCount() === 0) return 'ready';
  if (crGrid.stopped) return 'degraded'; // stopped with parts missing - even zero landed - is resumable, not 'none': the Resume offer must exist (the city is part-known, its grid state is the point)
  return crGridDoneCount() > 0 ? 'degraded' : 'failed';
}
function crGridStop(why) { // stop scheduling, abort the downloads in flight, KEEP every committed cell (amendment B)
  const g = crGrid; if (!g) return;
  g.stopped = why;
  if (g.ticker) { clearInterval(g.ticker); g.ticker = null; }
  for (const op of Array.from(g.ops)) crAbortOp(op);
  g.ops.clear(); g.active = 0;
  for (const c of g.cells) if (c.state === 'fetching') c.state = 'pending';
}
function crGridFinish(g) {
  if (g.ticker) { clearInterval(g.ticker); g.ticker = null; }
  crPrepState = crGridSettledState();
  if (crPrepState === 'failed' && g.lastFail) { crPrepFail = g.lastFail; crFailFromGrid = true; }
  if (crPrepState === 'ready' || crPrepState === 'degraded') crSweepPending();
  crRenderHint();
}
function crGridPump(g) { // keep at most CR_GRID_PARALLEL cell fetches in flight; a cell that fails is retried once inside the run, then marked failed while the rest continue (amendment A)
  if (!crGridCurrent(g) || g.stopped) return;
  while (g.active < CR_GRID_PARALLEL) {
    const cell = g.cells.find(c => c.state === 'pending');
    if (!cell) break;
    cell.state = 'fetching'; cell.tries++;
    g.active++;
    const op = {}; g.ops.add(op);
    crSourceExtract(cell.box, null, CR_TIMING.budgetMs, CR_TIMING.attempt1Ms, () => crGridCurrent(g) && !g.stopped, op).then(res => {
      if (!g.ops.has(op)) return; // stopped/superseded since launch: crGridStop already zeroed the accounting - a late answer lands NOWHERE, even if this grid is later resumed under a new generation
      g.ops.delete(op); g.active--;
      if (!crGridCurrent(g)) return; // the session moved on: land nowhere (CG-PF-05)
      if (res.ok) {
        cell.state = 'done';
        crCovMerge(res.json.elements, cell.box);
        const ways = [];
        for (const el of res.json.elements || []) { const w = crCov.byId[el && el.id]; if (w) ways.push([el.id, w.name, w.pts]); }
        crCacheSaveCell(g.name, g.bbox, g.cells.length, cell.key, ways);
      } else if (res.kind === 'stale' || g.stopped) { cell.state = 'pending'; }
      else if (cell.tries < CR_CELL_TRIES) { cell.state = 'pending'; g.lastFail = res; }
      else { cell.state = 'failed'; g.lastFail = res; }
      crRenderHint();
      crGridPump(g);
      if (g.active === 0 && crGridPendingCount() === 0) crGridFinish(g);
    });
  }
  if (g.active === 0 && crGridPendingCount() === 0) crGridFinish(g);
}
function crCityPrepare() { // a city is picked: load its whole extract - from the on-device cache when saved (instant, zero downloads), else the grid, resuming whatever a saved partial already holds (amendments A-C)
  if (!crCity || crCity.lat == null || !creating) return;
  const name = crCity.name;
  const bbox = crCity.bbox || crBoxAround(crCity.lat, crCity.lon, 8); // no bounding box from the lookup: a ~16 x 16 km box on the centre (amendment A fallback)
  const session = crSession, gen = ++crCovGen;
  if (crPrep) { clearInterval(crPrep.ticker); crAbortOp(crPrep.op); crPrep = null; }
  if (crGrid) crGridStop('superseded');
  crCov = crCovFromWays({}, []);
  crCacheNote = '';
  crPackCtx = null; crPackNote = ''; // Beta 1.123: a new city's preparation re-decides its source (pack vs service) below
  const cells = crGridCellsFor(bbox);
  const g = crGrid = { name, bbox, cells, gen, session, startedAt: Date.now(), ticker: null, ops: new Set(), active: 0, fromCache: false, savedAt: null, stopped: null, lastFail: null };
  crPrepState = 'preparing'; crPrepFail = null; crWanted = null;
  crRenderHint();
  crIdbGet(name).then(rec => {
    if (!crGridCurrent(g)) return;
    let restored = 0;
    if (rec && rec.bbox && (rec.bbox.s !== bbox.s || rec.bbox.n !== bbox.n || rec.bbox.w !== bbox.w || rec.bbox.e !== bbox.e)) rec = null; // a record saved under a DIFFERENT bounding box (the lookup's answer changed) is not this grid's cache - its cell keys would restore the wrong streets
    if (rec && rec.cells) {
      for (const cell of g.cells) {
        const saved = rec.cells[cell.key];
        if (saved && Array.isArray(saved.ways)) {
          const byId = {};
          for (const sw of saved.ways) { if (Array.isArray(sw) && sw[2] && sw[2].length > 1) byId[sw[0]] = { name: sw[1], pts: sw[2] }; }
          crCovMerge([], null); // ensure the cov exists before the direct fold below
          for (const id of Object.keys(byId)) crCov.byId[id] = byId[id];
          const fresh = crCovFromWays(crCov.byId, crCov.boxes);
          crCov.byName = fresh.byName;
          if (!crCov.boxes.some(b => b.s === cell.box.s && b.w === cell.box.w && b.n === cell.box.n && b.e === cell.box.e)) crCov.boxes.push(cell.box);
          cell.state = 'done'; restored++;
        }
      }
      if (restored) { g.fromCache = true; g.savedAt = rec.savedAt || null; }
    }
    if (restored === g.cells.length) { crPrepState = 'ready'; crSweepPending(); crRenderHint(); return; } // fully saved: instant ready, ZERO downloads (amendment C)
    // Beta 1.123: resolve the pack BEFORE the pump starts, so the source
    // decision is the grid's from its first cell (and the hint can name
    // it). A pack city skips the minutes warning - its first load is one
    // static download, seconds not minutes.
    crPackResolveCity(name, bbox).then(pk => {
      if (!crGridCurrent(g)) return; // the session moved on while the catalogue answered: land nowhere (CG-PF-05)
      if (pk) { g.fromPack = pk.slug; crPackCtx = { slug: pk.slug, bbox: pk.bbox, failed: false }; }
      if (restored === 0 && !pk) toast('First load of ' + name + ' can take a few minutes — after that it’s instant', 5000); // timing honesty (amendment E): said once, when a real first download starts
      g.ticker = setInterval(() => { if (crGridCurrent(g) && crPrepState === 'preparing') crRenderHint(); else if (g.ticker) clearInterval(g.ticker); }, 1000);
      crRenderHint();
      crGridPump(g);
    });
  });
}
function crGridResume() { // the degraded/stopped remedy: fetch ONLY the missing cells (amendments A+B)
  const g = crGrid; if (!g || !creating) return;
  g.gen = ++crCovGen; // Cancel bumped the coverage generation to orphan late answers (CG-PF-05); resuming ADOPTS the grid into the live generation, or the pump would refuse it as obsolete and fetch nothing
  g.stopped = null; g.startedAt = Date.now();
  for (const c of g.cells) if (c.state === 'failed') { c.state = 'pending'; c.tries = 0; }
  crPrepState = 'preparing'; crPrepFail = null; crFailFromGrid = false; crWanted = null;
  if (g.ticker) clearInterval(g.ticker);
  g.ticker = setInterval(() => { if (crGridCurrent(g) && crPrepState === 'preparing') crRenderHint(); else if (g.ticker) clearInterval(g.ticker); }, 1000);
  crRenderHint();
  crGridPump(g);
}
function crGridRefresh() { // the saved city's Refresh affordance: drop the saved record and load the whole city again
  const g = crGrid; if (!g || !creating) return;
  const name = g.name, bbox = g.bbox;
  crIdbDelete(name);
  crCacheNote = '';
  crPackNote = '';
  if (g.fromPack) crPackLoad(g.fromPack, true).catch(() => {}); // Beta 1.123: Refresh on a pack city re-downloads the PACK itself (forced past the session copy) - the fresh grid below then commits from it
  const session = crSession, gen = ++crCovGen;
  crCov = crCovFromWays({}, []);
  const g2 = crGrid = { name, bbox, cells: crGridCellsFor(bbox), gen, session, startedAt: Date.now(), ticker: null, ops: new Set(), active: 0, fromCache: false, savedAt: null, stopped: null, lastFail: null };
  if (g.fromPack) { g2.fromPack = g.fromPack; crPackCtx = { slug: g.fromPack, bbox: g.bbox, failed: false }; } // the refreshed preparation stays pack-backed, against the same bounds
  crPrepState = 'preparing'; crPrepFail = null;
  g2.ticker = setInterval(() => { if (crGridCurrent(g2) && crPrepState === 'preparing') crRenderHint(); else if (g2.ticker) clearInterval(g2.ticker); }, 1000);
  crRenderHint();
  crGridPump(g2);
}
function crFailText(f) { // the honest taxonomy (scope item 5): unreachable / answered-with-error / too-dense read differently because they ARE different
  if (!f) return '';
  if (f.kind === 'dense') return crGrid ? 'Parts of ' + (crCity ? crCity.name : 'the city') + ' were too dense to load — tap Retry to try those parts again' : 'That area is too dense to load at once — move the map to a less busy part of ' + (crCity ? crCity.name : 'the city') + ', then tap Prepare this area'; // box form per CG-PF-09: the footprint is FIXED, so zooming changes nothing - the working remedy is preparing a less dense area, and the button in this state does exactly that (map centre). Grid form: the dense cells are the failed parts, and Retry resumes exactly them
  if (f.kind === 'error') return 'The street-shape service answered with an error' + (f.status ? ' (' + f.status + ')' : '') + ' — tap Retry';
  if (f.kind === 'badjson') return 'The street-shape service sent back something unreadable — tap Retry';
  return 'The street-shape service didn’t answer — tap Retry';
}
function crRenderHint() { // the ONE writer of the pick-stage hint + its action button + the sheet's city chip: state-driven, so no stale text survives a state change
  if (!creating || crStage !== 'pick') return;
  const hint = $('createHint'), btn = $('crHintBtn');
  if (crSectorStreet) { hint.textContent = 'Tap sectors to add or remove them'; hint.classList.add('on'); btn.style.display = 'none'; return; } // Beta 1.127 (mockup screen 1): while trimming, the pill says the one thing there is to do
  let text = '', btnLabel = '';
  const secs = t0 => Math.max(0, Math.round((Date.now() - t0) / 1000));
  if (crPrepState === 'preparing' && crPrep) { text = 'Preparing street shapes for ' + (crCity ? crCity.name : 'this area') + '… ' + secs(crPrep.startedAt) + ' s'; btnLabel = 'Cancel'; } // the fallback box, when IT is the in-flight operation: it outranks the grid text - a settled (or still-loading) city grid must not label a box wait with stale part counts
  else if (crPrepState === 'preparing' && crGrid) { // the city grid: REAL progress - parts landed of parts total, and elapsed (amendment B: no fake percentages, the count is the count)
    const done = crGridDoneCount(), total = crGrid.cells.length, failed = crGridFailedCount();
    if (crGrid.fromPack && !crPackNote) text = 'Loading ' + crGrid.name + ' from the app’s own library… ' + secs(crGrid.startedAt) + ' s'; // Beta 1.123: a pack load is ONE download, not parts - the wording names the fast path and keeps only the honest elapsed clock (no part counts, no percentages, and never the service's name for the library's work)
    else text = 'Loading ' + crGrid.name + ' — part ' + done + ' of ' + total + ' · ' + secs(crGrid.startedAt) + ' s' + (failed ? ' · ' + failed + ' failed so far' : '');
    btnLabel = 'Cancel';
  }
  else if (crPrepState === 'degraded' && crGrid) {
    if (crGrid.stopped === 'cancelled') { text = 'Loading stopped — ' + crGridDoneCount() + ' of ' + crGrid.cells.length + ' parts of ' + crGrid.name + ' loaded'; btnLabel = 'Resume'; }
    else { text = crGrid.name + ' loaded except ' + (crGridFailedCount() + crGridPendingCount()) + ' part' + ((crGridFailedCount() + crGridPendingCount()) === 1 ? '' : 's') + ' — streets there may be missing'; btnLabel = 'Retry missing parts'; }
    if (crWanted) btnLabel = crWanted.label;
  }
  else if (crPrepState === 'failed') { text = crFailText(crPrepFail); btnLabel = crGrid ? 'Retry' : ((crPrepFail && crPrepFail.kind === 'dense') ? 'Prepare this area' : 'Retry'); } // grid failure: Retry resumes the missing cells. Box dense: Retry at the same anchor cannot help (fixed footprint) - the button prepares wherever the map now sits (CG-PF-09)
  else if (crPrepState === 'ready') {
    if (crGrid && crGrid.fromCache && crGrid.savedAt) { const d = new Date(crGrid.savedAt); text = crGrid.name + ' — loaded ' + d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + ' · tap a road'; btnLabel = 'Refresh'; }
    else text = draftStreets().length ? 'Tap a road on the map to add it' : 'Street shapes ready — tap a road';
    if (crWanted) btnLabel = crWanted.label; // an outstanding offer (a tap outside coverage, a pending street) keeps its working button in the ready state too (CG-PF-09: the first build's ready state hid it) - it outranks Refresh
  }
  else { text = crCity ? 'Search for a street in ' + crCity.name + ', or zoom in and prepare this area' : 'Search, fly to a street, then tap it on the map'; if (crWanted) btnLabel = crWanted.label; else if (map && map.getZoom() >= 14) btnLabel = 'Prepare this area'; }
  if (crCacheNote && crCity) text += ' · ' + crCacheNote; // the disclosed cache state rides the hint (amendment C: degradation is said, never silent)
  if (crPackNote && crCity) text += ' · ' + crPackNote; // Beta 1.123: the disclosed pack state rides the hint the same way - a fallen-back load says the library didn't load, in every state the hint shows
  hint.textContent = text; hint.classList.add('on');
  if (btnLabel) { btn.textContent = btnLabel; btn.style.display = ''; } else btn.style.display = 'none';
  const cc = $('crCityChange'); if (cc) { if (crCity) { cc.textContent = 'City: ' + crCity.name + ' — change'; cc.style.display = ''; } else cc.style.display = 'none'; }
}
function crAddStreet(short, osmName, segs) {
  draft.roads[short] = segs; draft.osmNames[short] = osmName; // a tapped street joins as a SECONDARY (fork 3) - flip it to MAIN in the list if it is one
  delete crPending[short];
  renderDraft(); renderCrLists(); crRenderHint();
  toast('Added ' + short, 1800);
}
function crRemoveStreet(short) { // Beta 1.127: the ONE removal path - the panel's x, the preview's x and Clear all land here (Beta 1.128: those are the ONLY doors; a map tap on a picked street opens its sectors instead), so a street leaves with ALL of its draft state (geometry, main flag, names, sector pick, cached parts) and every face re-renders from the same state
  if (!draft || !draft.roads[short]) return;
  delete draft.roads[short]; draft.mains.delete(short); delete draft.osmNames[short];
  if (draft.sectors) delete draft.sectors[short];
  if (draft.parts) delete draft.parts[short];
  delete crPending[short];
  if (crSectorStreet === short) { crSectorStreet = null; crSectorSnapshot = undefined; }
  renderDraft(); renderCrLists(); crRenderHint();
}
// ---- sectors (Beta 1.127, Andrew's approved mockups in beta1/work/create-sectors-mockups/):
// a picked street can be trimmed to the junction-to-junction pieces he
// actually cleans - a long road that runs past his subdivision enters
// the route only as far as he cleans it. Sector state lives ONLY in
// the draft (draft.sectors[short] = chosen part indexes; absent = the
// whole road); at Save the stored pack's roads[name] holds only the
// chosen sectors' polylines, so the pack format is unchanged and
// everything downstream derives from the stored geometry as always.
function crStreetParts(short) { // the street's sectors: its stitched line cut where OTHER streets of the prepared extract meet it - computeStretches' own cut rule (4 m join tolerance, cuts merged under 15 m, no cut within 12 m of an end) with the EXTRACT as the junction set. The extract, not the draft, is the context on purpose: the pieces are the real junction-to-junction pieces, and a street's sector boundaries never move as other streets join or leave the draft. Computed once per street per draft (cached on draft.parts); vertices are bbox-prefiltered to the line's neighbourhood, so a whole city's extract costs one bounded pass per street, paid only when sector mode first opens for it.
  if (!draft || !draft.roads[short]) return null;
  draft.parts = draft.parts || {};
  if (draft.parts[short]) return draft.parts[short];
  const one = {}; one[short] = draft.roads[short];
  const line = stitchLine(short, one);
  if (!line || line.length < 2) return null;
  const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distM(line[i - 1], line[i]));
  const total = cum[cum.length - 1];
  let w = 1e9, s = 1e9, e = -1e9, n = -1e9; for (const p of line) { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); }
  const mLat = 12 / MLAT, mLng = 12 / MLNG;
  const cuts = [];
  if (crCov && crCov.byName) {
    const own = draft.osmNames ? draft.osmNames[short] : null;
    for (const nm of Object.keys(crCov.byName)) {
      if (nm === own) continue; // the street's own ways never cut it
      for (const wy of crCov.byName[nm]) for (const v of wy.pts) {
        if (v[0] < s - mLat || v[0] > n + mLat || v[1] < w - mLng || v[1] > e + mLng) continue;
        const pr = projOnLine(line, cum, v); if (pr.off <= 4) cuts.push(pr.d);
      }
    }
  }
  const parts = finishJunctionCuts(line, cum, total, cuts); // Beta 1.131 (programme N2): the finishing policy is shared with computeStretches - see finishJunctionCuts (app1). Only the junction SOURCE differs (the prepared extract, collected above); the policy exists exactly once.
  const rec = { line, cum, total, parts };
  draft.parts[short] = rec;
  return rec;
}
function crChosenSet(short, rec) { const sel = draft && draft.sectors ? draft.sectors[short] : null; return new Set(sel || rec.parts.map((_, i) => i)); } // no entry = every sector chosen (the whole road)
function crSetChosen(short, rec, set) { // a FULL set stores as NO entry - "whole road" stays the draft's default state, so an untrimmed street carries no sector baggage into counts or the save
  draft.sectors = draft.sectors || {};
  if (set.size >= rec.parts.length) delete draft.sectors[short];
  else draft.sectors[short] = [...set].sort((a, b) => a - b);
}
function crChosenLenM(short, rec) { const set = crChosenSet(short, rec); let s = 0; for (const i of set) if (rec.parts[i]) s += crLineLen(rec.parts[i]); return s; }
function crStreetChosenM(short, g) { // a street's length AS PICKED - the whole street, or only its chosen sectors when trimmed. Every length the create flow states (panel header + rows, preview count, name-it summary) reads through here, so a trimmed street never bills its unchosen ends
  const sel = draft && draft.sectors ? draft.sectors[short] : null;
  if (!sel) return g && g[short] ? g[short].total : 0;
  const rec = crStreetParts(short); if (!rec) return 0;
  let s = 0; for (const i of sel) if (rec.parts[i]) s += crLineLen(rec.parts[i]);
  return s;
}
function crFilteredRoads() { // the roads object the SAVE stores: a trimmed street contributes ONLY its chosen sectors' polylines (each sector as one segment). The pack format is untouched (roads = segment lists); the unchosen ends simply never enter the pack
  const out = {};
  for (const n of draftStreets()) {
    const sel = draft.sectors ? draft.sectors[n] : null;
    if (sel && sel.length) { const rec = crStreetParts(n); out[n] = rec ? sel.map(i => rec.parts[i]).filter(p => p && p.length > 1) : draft.roads[n]; }
    else out[n] = draft.roads[n];
  }
  return out;
}
function crToggleSector(short, idx) {
  const rec = crStreetParts(short); if (!rec || idx < 0 || idx >= rec.parts.length) return;
  if (rec.parts.length === 1) { toast(short + ' is one piece — there are no cross-streets to trim it at', 2600); return; } // Beta 1.128: a one-piece street's only sector IS the whole road - tapping it in 1.127 un-picked the street entirely, the exact trap behind Andrew's report; the bar says it plainly and the tap changes nothing
  const set = crChosenSet(short, rec);
  if (set.has(idx)) set.delete(idx); else set.add(idx);
  if (!set.size) { crRemoveStreet(short); toast(short + ' removed - no sectors left picked', 2400); return; } // un-picking every sector removes the street (crRemoveStreet also closes its sector mode)
  crSetChosen(short, rec, set);
  renderDraft(); renderCrLists(); renderSectorBar();
}
function crSectorTap(lngLat) { // a map tap while trimming: the sector under the tap toggles. The rendered draft features answer first (the wide invisible crDraftHit layer, the street pick's own +/-16/28 px box discipline); the geometry fallback - the nearest part of THIS street - covers what the renderer cannot answer, and never reaches for another street
  const short = crSectorStreet; if (!short || !draft || !draft.roads[short]) return;
  const rec = crStreetParts(short); if (!rec) return;
  let idx = -1;
  if (map && typeof map.queryRenderedFeatures === 'function' && typeof map.project === 'function') {
    try {
      const pt = map.project([lngLat.lng, lngLat.lat]);
      for (const half of [16, 28]) {
        const feats = (map.queryRenderedFeatures([[pt.x - half, pt.y - half], [pt.x + half, pt.y + half]], { layers: ['crDraftHit'] }) || []).filter(f => f && f.properties && f.properties.name === short && typeof f.properties.sector === 'number' && f.properties.sector >= 0);
        if (!feats.length) continue;
        let bd = Infinity;
        for (const f of feats) { const d = crFeatDistM(lngLat, f.geometry); if (d < bd) { bd = d; idx = f.properties.sector; } }
        break;
      }
    } catch (e) {}
  }
  if (idx < 0) {
    let bd = Infinity;
    for (let i = 0; i < rec.parts.length; i++) { const d = crFeatDistM(lngLat, { type: 'LineString', coordinates: rec.parts[i].map(p => [p[1], p[0]]) }); if (d < bd) { bd = d; idx = i; } }
    if (bd > 75) idx = -1; // nowhere near the street being trimmed - not a sector tap
  }
  if (idx >= 0) crToggleSector(short, idx);
}
function crOpenSectors(short) { // opens a picked street's trimming - TWO doors since Beta 1.128 (Andrew's fork, decided from his 1.127 device session): the panel row (1.127) AND a map tap on the already-picked street (pickStreet routes here), which is where his finger went on device. Beta 1.129: entry SNAPSHOTS the street's pick as it stands (whole road, or the trim in force) - the sector bar's Cancel restores that snapshot exactly
  if (!draft || !draft.roads[short]) return;
  if (!crStreetParts(short)) return;
  if (crSectorStreet !== short) crSectorSnapshot = (draft.sectors && draft.sectors[short]) ? draft.sectors[short].slice() : null; // a fresh entry only - re-entering the same street's open session must not move Cancel's restore point
  crSectorStreet = short;
  renderSectorBar();
  const sheet = $('createSheet');
  if (sheet && sheet.classList.contains('on')) crMorphTo('bar');
  else syncCrPanel();
  renderDraft(); crRenderHint();
}
function crCloseSectors() { if (!crSectorStreet) return; crSectorStreet = null; crSectorSnapshot = undefined; const sheet = $('createSheet'); if (sheet && sheet.classList.contains('on')) crMorphTo(crWantedFace()); else syncCrPanel(); crRenderHint(); }
function crCancelSectors() { // Beta 1.129 (Andrew: "I still need a way to cancel selections while I'm selecting something"): the deliberate back-out of a sector session - the street's pick returns EXACTLY as it was when sector mode was entered (the whole road, or the trim then in force), every face repaints from the restored state, and sector mode closes back to the panel. Distinct from un-picking every sector by toggles, which still removes the street - that is a selection, this is an abandonment of the session's edits
  const s = crSectorStreet; if (!s || !draft) return;
  if (crSectorSnapshot) { draft.sectors = draft.sectors || {}; draft.sectors[s] = crSectorSnapshot.slice(); }
  else if (draft.sectors) delete draft.sectors[s];
  crCloseSectors();
  renderDraft(); renderCrLists();
}
function renderSectorBar() {
  const s = crSectorStreet; if (!s || !draft || !draft.roads[s]) return;
  const rec = crStreetParts(s); if (!rec) return;
  const chosen = crChosenSet(s, rec);
  $('crSbName').textContent = s;
  if (rec.parts.length === 1) { $('crSbSub').textContent = 'One piece · ' + fmtLenM(rec.total) + ' — no cross-streets to split it at, so it goes into your route whole'; return; } // Beta 1.128: honest about the streets the cut rules cannot split (measured on the shipped Vaughan pack: 221 of 1,299 streets ≥ 500 m compute to exactly one part) - 1.127's "tap sectors to trim it" promised a trim whose only outcome was deleting the road
  $('crSbSub').textContent = chosen.size >= rec.parts.length
    ? 'Entire road picked · ' + fmtLenM(rec.total) + ' — tap sectors to trim it'
    : chosen.size + ' of ' + rec.parts.length + ' sectors picked · ' + fmtLenM(crChosenLenM(s, rec)) + ' — the grey ends stay out of your route';
}
// ---- the pick sheet's ONE surface (Beta 1.129): the panel, the
// tucked-away strip and the sector bar are three CONTENTS of a single
// card - #createSheet itself, which carries the card's background,
// radius and shadow in every state (the .crG-* classes in head.html
// hold the three resting geometries; the contents carry none). A face
// change morphs the surface's OWN geometry - height, side insets,
// bottom inset and all four corner radii travel together on the
// sheets' closed-form spring, so the box contracts toward the bar's
// footprint on ALL sides at once (Andrew: "retracts into the pill
// form like it's being absorbed from all angles") while the two
// contents cross-fade INSIDE it. 1.127 hard-swapped three elements
// mid-spring; 1.128 sprang the sheet's height and slid the faces but
// the faces were still three separate boxes with their own margins
// and radii, landing in a rest state the eye had not been watching -
// on device it still read as: slides down, disappears, a pill
// appears. Now the thing on screen at the start of the motion IS the
// thing on screen at the end of it, at every frame between: one box,
// never display:none, never teleported.
let crMorph = null; // { from, to } while the surface morphs between faces, else null
let crFaceNow = 'panel'; // the face the surface currently rests as (a morph's origin; crMorph.to is its destination)
function crFaceEl(face) { return face === 'panel' ? $('crPanel') : face === 'strip' ? $('crStrip') : $('crSectorBar'); }
function crWantedFace() { // the face the current state asks for: the sector bar while trimming; the strip whenever the panel is tucked away (Beta 1.128: at ANY pick count, zero included - an empty draft retracts too, where 1.127's strip demanded a non-empty draft and collapse at zero sprang down and bounced back); else the panel
  if (crSectorStreet && draft && draft.roads[crSectorStreet]) return 'bar';
  if (crPanelCollapsed) return 'strip';
  return 'panel';
}
function syncCrPanel() { // the REST state: the surface wears the wanted face's geometry class and exactly that face's content shows. Animated switches run through crMorphTo and land here; renders and stage changes call this directly. While a morph is in flight this no-ops - the morph's finish lands the rest state, so a mid-flight re-render can never tear the surface
  const sheet = $('createSheet'), panel = $('crPanel'), strip = $('crStrip'), bar = $('crSectorBar'); if (!sheet || !panel || !strip || !bar) return;
  if (crMorph) return;
  const want = crWantedFace();
  crFaceNow = want;
  sheet.classList.toggle('crG-strip', want === 'strip');
  sheet.classList.toggle('crG-bar', want === 'bar');
  panel.style.display = want === 'panel' ? '' : 'none';
  strip.style.display = want === 'strip' ? '' : 'none';
  bar.style.display = want === 'bar' ? '' : 'none';
  if (want === 'bar') renderSectorBar();
}
function crGeoOf(sheet) { // the surface's border-box geometry as plain numbers - content height, the three insets, the four corner radii - read from computed style, so calc()/env() are already resolved to px by the engine
  const cs = getComputedStyle(sheet);
  const rad = (cs.borderRadius || '0px').trim().split(/\s+/).map(v => parseFloat(v) || 0);
  const R = rad.length === 1 ? [rad[0], rad[0], rad[0], rad[0]] : rad.length === 2 ? [rad[0], rad[1], rad[0], rad[1]] : rad.length === 3 ? [rad[0], rad[1], rad[2], rad[1]] : rad.slice(0, 4);
  return { h: sheet.offsetHeight, ml: parseFloat(cs.marginLeft) || 0, mr: parseFloat(cs.marginRight) || 0, mb: parseFloat(cs.marginBottom) || 0, r: R };
}
function crMorphCleanup() { // the surface returns to class-driven rest: every inline geometry/position the morph set is cleared, so the rest state the eye lands on is exactly the CSS geometry of the destination face
  const sheet = $('createSheet'); if (sheet) { sheet.style.height = ''; sheet.style.overflow = ''; sheet.style.marginLeft = ''; sheet.style.marginRight = ''; sheet.style.marginBottom = ''; sheet.style.borderRadius = ''; sheet.style.transform = ''; }
  for (const f of ['panel', 'strip', 'bar']) { const el = crFaceEl(f); if (!el) continue; el.style.position = ''; el.style.top = ''; el.style.left = ''; el.style.right = ''; el.style.bottom = ''; el.style.opacity = ''; }
  crMorph = null;
}
function crSettleMorph() { if (!crMorph) return; cancelSheetSpring($('createSheet')); crMorphCleanup(); syncCrPanel(); } // land an in-flight morph NOW (a grab on the panel head, or a new face decision superseding it)
function crMorphTo(to, opts) { // THE face change: one surface, its geometry springing between the two faces' resting shapes while the contents cross-fade inside. opts: { dy, v0 } from the head-drag release - the surface is already displaced dy px by the finger's transform, so the morph starts from that displaced bottom edge at the finger's own speed
  const sheet = $('createSheet'); if (!sheet) { syncCrPanel(); return; }
  opts = opts || {};
  crSettleMorph(); // a new decision supersedes an in-flight one - land it first
  const from = crFaceNow;
  if (from === to || !sheet.classList.contains('on')) { syncCrPanel(); return; }
  const fromEl = crFaceEl(from), toEl = crFaceEl(to);
  if (!fromEl || !toEl || fromEl.style.display === 'none') { syncCrPanel(); return; }
  const G0 = crGeoOf(sheet); // where the surface rests now
  fromEl.style.display = 'none'; toEl.style.display = ''; // measure the destination: its content in flow, its geometry class on
  sheet.classList.toggle('crG-strip', to === 'strip'); sheet.classList.toggle('crG-bar', to === 'bar');
  const G1 = crGeoOf(sheet);
  sheet.classList.toggle('crG-strip', from === 'strip'); sheet.classList.toggle('crG-bar', from === 'bar');
  const mb0 = opts.dy ? -opts.dy : G0.mb; // the finger left the surface dy px below its rest - the morph's bottom edge starts there, not at the rest position
  if (!G0.h || !G1.h || (Math.abs(G1.h - G0.h) < 2 && Math.abs(G1.ml - G0.ml) < 1 && Math.abs(G1.mb - mb0) < 1)) { syncCrPanel(); return; } // nothing to travel (or nothing measurable): land the rest state directly
  for (const el of [fromEl, toEl]) { el.style.display = ''; el.style.position = 'absolute'; el.style.top = '0px'; el.style.left = '0px'; el.style.right = '0px'; el.style.bottom = '0px'; } // both contents live inside the one surface for the motion
  fromEl.style.opacity = '1'; toEl.style.opacity = '0';
  sheet.style.transform = '';
  sheet.style.overflow = 'hidden'; sheet.style.height = G0.h + 'px';
  sheet.style.marginLeft = G0.ml + 'px'; sheet.style.marginRight = G0.mr + 'px'; sheet.style.marginBottom = mb0 + 'px';
  sheet.style.borderRadius = G0.r[0] + 'px ' + G0.r[1] + 'px ' + G0.r[2] + 'px ' + G0.r[3] + 'px';
  crMorph = { from, to };
  const L = (a, b, p) => a + (b - a) * p;
  springSheet(sheet, G0.h, G1.h, opts.v0 || 0, h => { // the closed-form spring drives the HEIGHT (px, the quantity its settle thresholds are calibrated for); every other property follows the same progress
    const p = Math.min(1, Math.max(0, (h - G0.h) / (G1.h - G0.h)));
    sheet.style.height = h + 'px';
    sheet.style.marginLeft = L(G0.ml, G1.ml, p) + 'px'; sheet.style.marginRight = L(G0.mr, G1.mr, p) + 'px';
    sheet.style.marginBottom = L(mb0, G1.mb, p) + 'px';
    sheet.style.borderRadius = L(G0.r[0], G1.r[0], p) + 'px ' + L(G0.r[1], G1.r[1], p) + 'px ' + L(G0.r[2], G1.r[2], p) + 'px ' + L(G0.r[3], G1.r[3], p) + 'px';
    fromEl.style.opacity = String(1 - Math.min(1, p / 0.45));
    toEl.style.opacity = String(Math.min(1, Math.max(0, (p - 0.3) / 0.7)));
  }, () => { crMorphCleanup(); syncCrPanel(); });
}
function crCollapsePanel(fromY, v0) { // tuck the surface away to the bottom bar: the one box contracts (Beta 1.129) - at any pick count, zero included
  if (crPanelCollapsed) { syncCrPanel(); return; }
  crPanelCollapsed = true;
  const sheet = $('createSheet');
  if (!sheet || !sheet.classList.contains('on')) { syncCrPanel(); return; }
  crMorphTo('strip', { dy: fromY || 0, v0: -(v0 || 0) }); // the height starts shrinking at the finger's speed: its velocity is the drag velocity negated
}
function crExpandPanel() { // Review: the bar hands back to the panel in the same one-object motion, reversed
  if (!crPanelCollapsed) return;
  crPanelCollapsed = false;
  crMorphTo('panel');
}
function crPendStreet(short, osmName, lngLat, run, boundary) { // fail-closed (Codex (c)): the shape reaches past verified coverage even after its one top-up - listed as PENDING, never added half-known; a wider preparation can still complete it (crSweepPending)
  let openEnd = null;
  if (run && run.line) { for (const end of [run.line[0], run.line[run.line.length - 1]]) { const inside = crCov && crInAnyBox(crCov.boxes, end[0], end[1]); if (!inside) { openEnd = { lat: end[0], lng: end[1] }; break; } } } // an end is OPEN only when no COMMITTED coverage holds it (the sweep's union rule): the top-up's box (the boundary argument) was fetched for this name only and never becomes coverage, so an end inside it but outside every committed box is still open; an end inside a loaded city cell needs no preparation - anchoring the wider preparation on either wrong end could never complete the street
  crPending[short] = { osmName, lngLat, openEnd };
  if (openEnd) crWanted = { anchor: openEnd, label: 'Prepare wider area' }; // verify round (CG-PF-09): the promised wider preparation is a REAL button - it prepares around the street's own open end, the point coverage must grow from
  renderCrLists(); crRenderHint();
  toast(short + ' runs past the prepared area — it is pending, not added. Prepare a wider area to complete it', 4200);
}
// ---- the city step (Andrew's amendment): Door 2 STARTS here ----
function crCityNameOf(it) { const a = (it && it.address) || {}; return a.city || a.town || a.village || a.municipality || a.county || String((it && it.display_name) || '').split(',')[0].trim(); }
function crIsPlace(it) { // populated places only: a city/town/village place, or an administrative boundary (a city's own boundary relation) - never a street, a POI or a postcode area
  if (!it) return false;
  const cls = it.category || it.class; // the app requests format=jsonv2, and jsonv2 names this field `category` - `class` was the older format's name and does not exist in a jsonv2 payload. 1.121 read only `class`, so EVERY real result was rejected here and the suggestion list silently emptied on Andrew's phone (the typed city search dead end, 2026-11-06). The battery's fixture cities carried the old field name, which is why the rig never saw it; drive153 stubs the real jsonv2 shape.
  if (cls === 'place') return ['city', 'town', 'village', 'hamlet', 'suburb'].includes(it.type);
  if (cls === 'boundary') return it.type === 'administrative';
  return false;
}
function crPickCity(it) {
  crCityLookupSeq++; if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} crCityLastCtl = null; } // a real pick supersedes any held last-city lookup (CG-PF-11)
  const lat = parseFloat(it.lat), lon = parseFloat(it.lon); if (!isFinite(lat) || !isFinite(lon)) return;
  const name = crCityNameOf(it); if (!name) return;
  let bbox = null;
  if (Array.isArray(it.boundingbox) && it.boundingbox.length === 4) { const bb = it.boundingbox.map(Number); if (bb.every(isFinite)) bbox = { s: bb[0], n: bb[1], w: bb[2], e: bb[3] }; }
  crCity = { name, lat, lon, bbox };
  crAreaGuess = name;
  if (draft && !draft.area) draft.area = name;
  try { lsSet(LS_GLOBAL.lastArea, name); } catch (e) {}
  crEnterPickFromCity();
}
function crEnterPickFromCity() { // the city is chosen: land in the pick stage, the map flown to the city, and its whole-city preparation started (from the on-device cache when saved - crCityPrepare)
  if (!creating) enterCreate('pick'); else { if (!routeLoaded) parkBootChrome(); else closeRouteMenu(); setCreateStage('pick'); }
  if (map && crCity && crCity.lat != null) { try { map.flyTo({ center: [crCity.lon, crCity.lat], zoom: 12, duration: 900 }); } catch (e) {} }
  crCityPrepare();
  crRenderHint();
}
// ---- the create gate: TWO DOORS, then the list (Beta 1.124, Andrew's
// redesign, approved from the rendered mockup 2026-11-06) ----
// The first screen of Create is "Create new route" with two primary
// doors: Select from list and Search manually (the photo door sits
// quieter below a divider). Select from list opens its own pane listing
// the library's cities as clean rows - no typing required to proceed.
// The list IS packs/index.json (the same catalogue the seam reads): a
// city appears the day its pack is published, and the app carries no
// hardcoded city names. Both entries into Create - the cold-start
// picker and the Routes menu - show the SAME routeMenu and the SAME
// panes, so this one surface is the gate for both.
function crRenderCityChoices() {
  const boxEl = $('crCityList'); if (!boxEl) return;
  boxEl.innerHTML = '';
  const loading = document.createElement('div'); loading.className = 'routeRow crLoadingRow'; // Beta 1.130: while the catalogue is genuinely in flight, the pane shows a ROW in the city rows' own styling (the shape the list itself takes) - the wait reads as the list arriving, not a bare note floating on an empty pane (the second, cosmetic half of Andrew's "loading screen" stutter; the wait itself is attacked by crWarmCityLibrary)
  const lmeta = document.createElement('span'); lmeta.className = 'routeMeta';
  const lnm = document.createElement('span'); lnm.className = 'routeName'; lnm.textContent = 'Loading cities…';
  const lsub = document.createElement('span'); lsub.className = 'routeArea'; lsub.textContent = 'Getting the city library';
  lmeta.append(lnm, lsub); loading.appendChild(lmeta); boxEl.appendChild(loading);
  crPackIndexLoad().then(entries => {
    if (!boxEl.isConnected) return;
    boxEl.innerHTML = '';
    if (!entries || !entries.length) { const d = document.createElement('div'); d.className = 'rmNote'; d.textContent = 'The city library isn’t available right now — go back and use Search manually.'; boxEl.appendChild(d); return; } // honest unavailability, and the manual door behind Back still works - the gate never dead-ends
    const last = (lsGet(LS_GLOBAL.lastArea) || '').toLowerCase();
    const sorted = entries.slice().sort((a, b) => (((b.name || '').toLowerCase() === last) ? 1 : 0) - (((a.name || '').toLowerCase() === last) ? 1 : 0)); // the last-used city rides first when the library holds it (a convenience, never a requirement - the full list is always there)
    for (const e of sorted) {
      if (!e || !e.name || !e.slug || !Array.isArray(e.bbox) || e.bbox.length !== 4) continue;
      const b = document.createElement('button'); b.className = 'routeRow';
      const meta = document.createElement('span'); meta.className = 'routeMeta';
      const nm = document.createElement('span'); nm.className = 'routeName'; nm.textContent = e.name;
      const sub = document.createElement('span'); sub.className = 'routeArea';
      sub.textContent = (typeof e.streets === 'number' && isFinite(e.streets) ? e.streets.toLocaleString('en-US') + ' streets · ' : '') + 'ready to load' + (String(e.name).toLowerCase() === last ? ' · last used' : '');
      meta.append(nm, sub);
      const chev = document.createElement('span'); chev.className = 'routeChev'; chev.textContent = '›';
      b.append(meta, chev);
      b.addEventListener('click', () => crPackPickCity(e));
      boxEl.appendChild(b);
    }
  });
}
function crPackPickCity(e) { // a chooser tap IS a city pick: it lands in the same crPickCity the typed search uses, with the catalogue's own bounds - so preparation, caching and the pick stage behave identically whichever door named the city
  draft = newDraft();
  const s = +e.bbox[0], w = +e.bbox[1], n = +e.bbox[2], ee = +e.bbox[3];
  crPickCity({ lat: String((s + n) / 2), lon: String((w + ee) / 2), boundingbox: [String(s), String(n), String(w), String(ee)], display_name: e.name + ', Ontario, Canada', address: { city: e.name, state: 'Ontario', country: 'Canada', country_code: 'ca' } });
}
function crOpenCityPane(ret) {
  crCityLookupSeq++; if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} crCityLastCtl = null; } // reopening the pane supersedes any held lookup (CG-PF-11)
  crCityReturn = ret;
  const last = lsGet(LS_GLOBAL.lastArea), lb = $('crCityLast');
  if (last) { lb.textContent = 'Use ' + last; lb.style.display = ''; } else lb.style.display = 'none';
  $('crCityInput').value = ''; $('crCityResults').innerHTML = '';
  if (creating) { if (!routeLoaded) restoreBootChrome(); else openRouteMenu(); }
  showRmPane('rmCityPane');
}
let crCityTimer = null, crCitySeq = 0, crCityCtl = null;
let crCityLookupSeq = 0, crCityLastCtl = null; // the one-tap last-city lookup's generation + abort handle (CG-PF-11: it is an async completion like any other - it binds to its generation, and any competing pick, Back, pane reopen or exit kills it)
async function crRunCitySearch() {
  const q = $('crCityInput').value.trim(), box = $('crCityResults');
  if (q.length < 3) { box.innerHTML = ''; return; }
  const seq = ++crCitySeq, session = crSession;
  if (crCityCtl) { try { crCityCtl.abort(); } catch (e) {} }
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null; crCityCtl = ctl;
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&featuretype=city&limit=6&q=' + encodeURIComponent(q), { headers: { 'Accept': 'application/json' }, signal: ctl ? ctl.signal : undefined });
    if (!r.ok) throw new Error('city search HTTP ' + r.status);
    const list = await r.json();
    if (seq !== crCitySeq || session !== crSession) return; // superseded, or the creation it belonged to has closed (CG-PF-05)
    box.innerHTML = '';
    const places = (Array.isArray(list) ? list : []).filter(crIsPlace);
    for (const it of places) {
      const b = document.createElement('button'); b.className = 'routeRow'; // Beta 1.125 (Andrew): manual-search results wear the SAME neat row as the city list - name on its own line, the rest of the address small and dim under it; full .rmBtn boxes stacked with no gap read as one bunched wall
      const dn = it.display_name || '', cut = dn.indexOf(',');
      const meta = document.createElement('span'); meta.className = 'routeMeta';
      const nm = document.createElement('span'); nm.className = 'routeName'; nm.textContent = cut > 0 ? dn.slice(0, cut).trim() : dn;
      meta.appendChild(nm);
      if (cut > 0 && dn.slice(cut + 1).trim()) { const sub = document.createElement('span'); sub.className = 'routeArea'; sub.textContent = dn.slice(cut + 1).trim(); meta.appendChild(sub); }
      b.appendChild(meta);
      b.addEventListener('click', () => crPickCity(it));
      box.appendChild(b);
    }
    if (!places.length) { const d = document.createElement('div'); d.className = 'rmNote'; d.textContent = 'No city matched that search — check the spelling, or go Back and pick from the list.'; box.appendChild(d); } // Beta 1.123: an empty answer SAYS so in the pane - 1.121 rendered nothing at all, which reads as a dead app (the same silence as the class/category defect, and just as unhelpful)
  } catch (e) { if (seq === crCitySeq && !(e && e.name === 'AbortError')) { box.innerHTML = ''; toast('City search needs an internet connection — try again', 3000); } }
}

const DRAFT_SRC = 'crDraft';
function ensureDraftLayers() {
  if (!map || typeof map.addSource !== 'function') return;
  try {
    if (!map.getSource(DRAFT_SRC)) map.addSource(DRAFT_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer('crDraftCase')) map.addLayer({ id: 'crDraftCase', type: 'line', source: DRAFT_SRC, filter: ['==', ['get', 'chosen'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': 'rgba(10,14,34,.55)', 'line-width': 8.5 } }); // Beta 1.127: the casing underlines CHOSEN geometry only - an unchosen sector wears no casing, like the mockup's plain grey ends
    if (!map.getLayer('crDraftLine')) map.addLayer({ id: 'crDraftLine', type: 'line', source: DRAFT_SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'chosen'], 1], ['case', ['==', ['get', 'main'], 1], '#ffc233', '#ef476f'], '#b9c1cb'], 'line-width': ['case', ['==', ['get', 'chosen'], 1], 4.5, 3] } }); // Beta 1.127: chosen = category colour at full width; unchosen = thin grey
    if (!map.getLayer('crDraftHit')) map.addLayer({ id: 'crDraftHit', type: 'line', source: DRAFT_SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 24 } }); // Beta 1.127: the sector pick's fat-finger target - invisible, queryable (crSectorTap)
  } catch (e) { /* the style may still be loading - renderDraft retries on every change */ }
}
function renderDraft() { // the DRAFT renders through its own GeoJSON source, computed from the draft's own roads - the active route's geometry, engine sources and storage are never touched by the create flow. Beta 1.127: a street carrying a sector pick (or open in sector mode) renders PER SECTOR - chosen sectors in its category colour, unchosen thin grey (the approved mockup's language); every other street renders as its whole line, exactly as before.
  ensureDraftLayers();
  if (!map || typeof map.getSource !== 'function') return;
  const src = map.getSource(DRAFT_SRC); if (!src) return;
  const feats = [];
  if (draft) {
    const g = computeStretches(draft.roads);
    for (const n of draftStreets()) {
      const main = draft.mains.has(n) ? 1 : 0;
      const sel = draft.sectors ? draft.sectors[n] : null;
      if (sel || crSectorStreet === n) {
        const rec = crStreetParts(n); if (!rec) continue;
        const set = crChosenSet(n, rec);
        for (let i = 0; i < rec.parts.length; i++) { const L = rec.parts[i]; if (L && L.length > 1) feats.push({ type: 'Feature', properties: { name: n, main, chosen: set.has(i) ? 1 : 0, sector: i }, geometry: { type: 'LineString', coordinates: L.map(p => [p[1], p[0]]) } }); }
      } else {
        const L = g[n] && g[n].line; if (L && L.length > 1) feats.push({ type: 'Feature', properties: { name: n, main, chosen: 1, sector: -1 }, geometry: { type: 'LineString', coordinates: L.map(p => [p[1], p[0]]) } });
      }
    }
  }
  src.setData({ type: 'FeatureCollection', features: feats });
}
onMapReady(() => map.on('styledata', () => { if (creating) { renderDraft(); crSetBackdrop(true); } })); // a basemap swap mid-create wipes custom layers - redraw the draft and re-hide the backdrop
onMapReady(() => { if (creating) crSetBackdrop(true); }); // creation entered before the map existed (boot mode): the backdrop lands when the map does

// ---- creation backdrop (Beta 1.120, Andrew's design): while creating, the
// loaded route's painted streets and selection would cover the very map he
// is picking from. They hide entirely, and in their place the map shows a
// POINT OF INTEREST for every route in the database - the same marker the
// map itself shows when zoomed out (white ring, raspberry dot, the route's
// name) at each pack's centre (the engine's ROUTEPOI is exactly that
// centre for the active pack; a pack's `spot` is its per-STREET label
// anchors, not the route POI). Orientation with zero clutter. The draft's
// own overlay (crDraft) is untouched, and exitCreate restores the exact
// visibility every hidden layer had before. ----
const CR_ROUTE_LAYERS = ['t1-casing', 't1-casingb', 't1-surface', 't1-band', 't1-edge', 't1-sel', 't1-selband', 't1-sele', 'sel-core-s', 'sel-core-b', 'hit', 'routepoi-ring', 'routepoi-dot', 'routepoi-txt']
  .concat([1, 2, 3, 4].map(t => 'streetnamespt' + t), [1, 2, 3, 4, 5].flatMap(i => ['sel-glow' + i + '-s', 'sel-glow' + i + '-b']));
let crHiddenLayers = null; // [[id, visibilityBefore], ...] recorded on the first hide; null = backdrop off
const CR_POI_SRC = 'crPoi';
function crPoiFeatures() {
  return ROUTE_PACKS.map(p => { const bb = computeRouteBox(p.roads); if (!bb) return null; return { type: 'Feature', properties: { name: p.name || '' }, geometry: { type: 'Point', coordinates: [(bb.w + bb.e) / 2, (bb.s + bb.n) / 2] } }; }).filter(Boolean);
}
function crPoiFont() { // the basemap's own Noto stack, read the way pickFontFromStyle reads it - a guessed stack renders no text
  try {
    const syms = (map.getStyle().layers || []).filter(l => l.type === 'symbol' && l.layout && l.layout['text-font']);
    const pick = syms.find(l => /noto/i.test(l.layout['text-font'].join(' '))) || syms[0];
    if (pick) return pick.layout['text-font'];
  } catch (e) {}
  return ['Noto Sans Regular'];
}
function ensureCrPoiLayers() {
  if (!map || typeof map.addSource !== 'function') return;
  try {
    const data = { type: 'FeatureCollection', features: crPoiFeatures() };
    if (!map.getSource(CR_POI_SRC)) map.addSource(CR_POI_SRC, { type: 'geojson', data });
    else map.getSource(CR_POI_SRC).setData(data);
    const night = isNight();
    if (!map.getLayer('crPoiRing')) map.addLayer({ id: 'crPoiRing', type: 'circle', source: CR_POI_SRC, paint: { 'circle-radius': 9, 'circle-color': '#ffffff', 'circle-stroke-color': 'rgba(10,14,34,.25)', 'circle-stroke-width': 1 } });
    if (!map.getLayer('crPoiDot')) map.addLayer({ id: 'crPoiDot', type: 'circle', source: CR_POI_SRC, paint: { 'circle-radius': 6, 'circle-color': '#ef476f' } });
    if (!map.getLayer('crPoiTxt')) map.addLayer({ id: 'crPoiTxt', type: 'symbol', source: CR_POI_SRC, layout: { 'text-field': ['get', 'name'], 'text-font': crPoiFont(), 'text-size': 11, 'text-anchor': 'left', 'text-offset': [1.1, 0], 'text-allow-overlap': true }, paint: { 'text-color': night ? '#e8e8e8' : '#333333', 'text-halo-color': night ? 'rgba(0,0,0,.8)' : 'rgba(255,255,255,.9)', 'text-halo-width': 1.6 } });
  } catch (e) { /* the style may still be loading - the styledata hook re-runs this while creating */ }
}
function crSetBackdrop(on) {
  if (!map || typeof map.setLayoutProperty !== 'function') return;
  if (on) {
    if (!crHiddenLayers) {
      crHiddenLayers = [];
      for (const id of CR_ROUTE_LAYERS) { try { if (map.getLayer(id)) crHiddenLayers.push([id, map.getLayoutProperty(id, 'visibility') || 'visible']); } catch (e) {} }
    }
    for (const pair of crHiddenLayers) { try { map.setLayoutProperty(pair[0], 'visibility', 'none'); } catch (e) {} }
    ensureCrPoiLayers();
  } else {
    if (crHiddenLayers) { for (const pair of crHiddenLayers) { try { if (map.getLayer(pair[0])) map.setLayoutProperty(pair[0], 'visibility', pair[1]); } catch (e) {} } crHiddenLayers = null; }
    for (const id of ['crPoiRing', 'crPoiDot', 'crPoiTxt']) { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} }
    try { if (map.getSource(CR_POI_SRC)) map.removeSource(CR_POI_SRC); } catch (e) {}
  }
}
function crRowEl(n, g) {
  const row = document.createElement('div'); row.className = 'crRow';
  const main = draft.mains.has(n);
  const dot = document.createElement('span'); dot.className = 'crDot ' + (main ? 'main' : 'sec'); row.appendChild(dot);
  const nm = document.createElement('span'); nm.className = 'crName'; nm.textContent = n; row.appendChild(nm);
  const ln = document.createElement('span'); ln.className = 'crLen'; ln.textContent = fmtLenM(crStreetChosenM(n, g)); row.appendChild(ln); // Beta 1.130 (maintainability re-scan N1): the preview's rows bill the CHOSEN length through the same helper as the panel's rows and every total - through 1.129 this read g[n].total, so a sector-trimmed street showed its WHOLE length on the check screen while the panel billed the trim and the preview's own total (renderCrLists sums crStreetChosenM) disagreed with its rows
  const chip = document.createElement('button'); chip.className = 'crChip ' + (main ? 'main' : 'sec'); chip.textContent = main ? 'MAIN' : '2ND';
  chip.addEventListener('click', () => { if (draft.mains.has(n)) draft.mains.delete(n); else draft.mains.add(n); renderDraft(); renderCrLists(); });
  row.appendChild(chip);
  const del = document.createElement('button'); del.className = 'crDel'; del.textContent = '✕'; del.title = 'Remove ' + n;
  del.addEventListener('click', () => crRemoveStreet(n)); // Beta 1.127: the shared removal path (sector state leaves with the street)
  row.appendChild(del);
  return row;
}
function crPanelRowEl(n, g) { // Beta 1.127 (Andrew's approved mockup, screen 2): one short row per picked road - category dot, name, "Entire road · X m" or "N of M sectors · X m", the MAIN/2ND chip IN the row (one tap flips the road's type), x to remove; tapping the row itself opens the street's sector trimming
  const main = draft.mains.has(n);
  const row = document.createElement('div'); row.className = 'crPRow';
  const dot = document.createElement('span'); dot.className = 'crDot ' + (main ? 'main' : 'sec'); row.appendChild(dot);
  const meta = document.createElement('span'); meta.className = 'crPMeta';
  const nm = document.createElement('span'); nm.className = 'crPName'; nm.textContent = n; meta.appendChild(nm);
  const sub = document.createElement('span'); sub.className = 'crPSub';
  const sel = draft.sectors ? draft.sectors[n] : null;
  if (sel) { const rec = crStreetParts(n); sub.textContent = sel.length + ' of ' + (rec ? rec.parts.length : sel.length) + ' sectors · ' + fmtLenM(crStreetChosenM(n, g)) + ' — tap row to adjust'; }
  else sub.textContent = 'Entire road · ' + fmtLenM(g[n] ? g[n].total : 0) + ' — tap row to adjust'; // Beta 1.128: the adjust affordance is stated BEFORE any trim exists - in 1.127 it appeared only after one, so an untrimmed row gave no hint it could be tapped at all
  meta.appendChild(sub); row.appendChild(meta);
  const chip = document.createElement('button'); chip.className = 'crPChip ' + (main ? 'main' : 'sec'); chip.textContent = main ? 'MAIN' : '2ND';
  chip.addEventListener('click', e => { e.stopPropagation(); if (draft.mains.has(n)) draft.mains.delete(n); else draft.mains.add(n); renderDraft(); renderCrLists(); });
  row.appendChild(chip);
  const del = document.createElement('button'); del.className = 'crPDel'; del.textContent = '✕'; del.title = 'Remove ' + n;
  del.addEventListener('click', e => { e.stopPropagation(); crRemoveStreet(n); });
  row.appendChild(del);
  row.addEventListener('click', () => crOpenSectors(n));
  return row;
}
function renderCrLists() {
  if (!draft) return;
  const g = computeStretches(draft.roads);
  const names = draftStreets().sort((a, b) => a.localeCompare(b));
  let tot = 0; for (const n of names) tot += crStreetChosenM(n, g); // Beta 1.127: totals bill CHOSEN lengths - a trimmed street's unchosen ends never count
  $('crCount').textContent = names.length + ' roads · ' + fmtLenM(tot); // Beta 1.127: the panel header's count in the mockup's shape ("3 roads · 2,410 m")
  $('pvCount').textContent = names.length + ' streets · ' + draft.mains.size + ' mains · ' + fmtLenM(tot); // the preview keeps its fuller count line
  { const el = $('crPickList'); el.innerHTML = ''; for (const n of names) el.appendChild(crPanelRowEl(n, g)); }
  { const el = $('pvList'); el.innerHTML = ''; for (const n of names) el.appendChild(crRowEl(n, g)); }
  for (const pk of Object.keys(crPending).sort()) { // Beta 1.121: pending streets (shape reaches past verified coverage) list in the PICK sheet only - never in the preview, never in the count, never saved
    if (draft.roads[pk]) continue;
    const row = document.createElement('div'); row.className = 'crRow pending';
    const dot = document.createElement('span'); dot.className = 'crDot sec'; row.appendChild(dot);
    const nm = document.createElement('span'); nm.className = 'crName'; nm.textContent = pk; row.appendChild(nm);
    const chip = document.createElement('span'); chip.className = 'crChip pend'; chip.textContent = 'PENDING'; row.appendChild(chip);
    const del = document.createElement('button'); del.className = 'crDel'; del.textContent = '✕'; del.title = 'Drop ' + pk;
    del.addEventListener('click', () => { delete crPending[pk]; renderCrLists(); });
    row.appendChild(del);
    $('crPickList').appendChild(row);
  }
  $('crStripTitle').textContent = names.length ? names.length + (names.length === 1 ? ' road' : ' roads') + ' picked' : 'No roads picked yet'; // the tucked-away bar always carries the state (mockup screen 4) - Beta 1.128: at zero picks it says so, because the bar now exists at zero too
  $('crStripSub').textContent = names.length ? fmtLenM(tot) + ' · tap Review to see them' : 'Tap roads on the map to add them';
  $('crDoneBtn').disabled = !names.length;
  $('crDoneBtn').textContent = 'Done'; // Beta 1.128 (Andrew): one word, ALWAYS - the 1.127 "Looks right" / "Done - back to check" rewrite is gone with the confusion it caused; Done goes to the check screen from the fresh state and the return-from-preview state alike
  $('pvSaveBtn').disabled = !names.length;
  syncCrPanel();
}
let crConfirmCb = null;
let crConfirmOneBtn = false; // Beta 1.132: true while the current confirm wears the one-button shape (the discard ask)
function crConfirm(title, msg, cb, labels) { $('crModalTitle').textContent = title; $('crModalMsg').textContent = msg; crConfirmCb = cb; crConfirmOneBtn = !!(labels && labels.oneBtn); $('crModalYes').textContent = (labels && labels.yes) || 'Discard'; $('crModalYes').classList.toggle('danger', !!(labels && labels.danger) || crConfirmOneBtn); $('crModalNo').textContent = (labels && labels.no) || '✕'; $('crModalNo').style.display = crConfirmOneBtn ? 'none' : ''; $('crModalX').style.display = crConfirmOneBtn ? '' : 'none'; $('crModal').classList.remove('hidden'); } // Beta 1.124: labels are optional; route deletion passes {yes:'Delete', no:'Cancel', danger:true}. Beta 1.132 (Andrew): the DISCARD ask (askDiscard) passes {oneBtn:true} and changes shape - ONE red Discard button, nothing else in the row; dismissal lives on the card's plain red corner X (crModalX, styled by the shared corner-X rule in head.html) and on a tap of the backdrop, and dismissing always means keep editing. Every other confirm keeps its two-button row exactly as before. The card itself is the --card token surface in BOTH themes - the confirm never hardcodes a light background.
function crConfirmDismiss() { $('crModal').classList.add('hidden'); crConfirmCb = null; }
$('crModalYes').addEventListener('click', () => { $('crModal').classList.add('hidden'); const cb = crConfirmCb; crConfirmCb = null; if (cb) cb(); });
$('crModalNo').addEventListener('click', crConfirmDismiss);
$('crModalX').addEventListener('click', crConfirmDismiss);
$('crModal').addEventListener('click', (e) => { if (crConfirmOneBtn && e.target === $('crModal')) crConfirmDismiss(); }); // Beta 1.132: a backdrop tap dismisses ONLY in the one-button shape
function parkBootChrome() { const sp = $('splash'); if (sp) sp.style.visibility = 'hidden'; $('routeMenu').classList.remove('show'); crBootParked = true; }
function restoreBootChrome() { if (!crBootParked) return; crBootParked = false; const sp = $('splash'); if (sp) sp.style.visibility = ''; $('routeMenu').classList.add('show'); }
function setCreateStage(stage) {
  if (stage !== 'pick') { crSectorStreet = null; crSectorSnapshot = undefined; } // Beta 1.127: sector mode belongs to the pick stage - the preview never inherits a half-trimmed street's bar (Beta 1.129: its Cancel snapshot dies with it)
  crStage = stage;
  $('createBar').classList.toggle('on', stage === 'pick');
  $('createSheet').classList.toggle('on', stage === 'pick');
  $('previewSheet').classList.toggle('on', stage === 'preview');
  $('createResults').classList.remove('on');
  $('createHint').classList.toggle('on', stage === 'pick');
  if (stage === 'pick') crRenderHint(); else $('crHintBtn').style.display = 'none'; // Beta 1.121: the hint is state-driven now (crRenderHint owns it) - the preparation state must survive stage changes, not be overwritten by a static line
  renderCrLists(); renderDraft();
  if (stage === 'preview') fitDraft();
}
function enterCreate(stage) {
  if (!draft) draft = newDraft();
  creating = true;
  crSectorStreet = null; crSectorSnapshot = undefined; crPanelCollapsed = false; crSettleMorph(); // Beta 1.127: every creation starts un-trimmed with the panel up (Beta 1.129: any surface morph a previous creation left in flight lands first)
  crSession++; // a fresh creation session: async completions born in any earlier session are obsolete from here (CG-PF-05)
  document.body.classList.add('creating');
  followPaused = true; // the camera belongs to the picking now; GPS is device state and is not stopped - follow resumes from the Locate tab afterwards
  try { deselect(); } catch (e) {} closeSheets();
  if (routeLoaded) closeRouteMenu(); else parkBootChrome();
  crSetBackdrop(true); // Beta 1.120: the loaded route's paint steps aside for the picking (POIs only) - see crSetBackdrop
  setCreateStage(stage);
}
function exitCreate() {
  creating = false; draft = null; crStage = 'pick'; crAreaGuess = ''; crSectorStreet = null; crSectorSnapshot = undefined; crPanelCollapsed = false; // Beta 1.127: the panel + sector session state dies with the creation
  crSession++; crCovGen++; // every async completion born in this session is obsolete the moment the flow closes - it must not land in a later draft, hint or busy state (CG-PF-05)
  if (crPrep) { clearInterval(crPrep.ticker); crAbortOp(crPrep.op); crPrep = null; } // and the downloads themselves stop (CG-PF-10)
  if (crGrid) { crGridStop('exit'); crGrid = null; } // the grid's downloads stop too; its committed cells live on in the on-device city cache, by design
  crCacheNote = '';
  crPackCtx = null; crPackNote = ''; // Beta 1.123: the pack context belongs to the closed session's city - the next creation re-decides its source
  crAbortOp(crTopOp); crTopOp = null;
  crCityLookupSeq++; if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} crCityLastCtl = null; } // a held last-city lookup dies with the session (CG-PF-11)
  crCov = null; crCity = null; crPrepState = 'none'; crPrepFail = null; crPrepAnchor = null; crPending = {}; crToppedUp = {}; crWanted = null;
  $('crHintBtn').style.display = 'none';
  if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
  crSearchSeq++; if (crSearchCtl) { try { crSearchCtl.abort(); } catch (e) {} crSearchCtl = null; } // no in-flight suggestion may land after the flow has closed
  document.body.classList.remove('creating');
  for (const id of ['createBar', 'createSheet', 'previewSheet', 'createResults', 'createHint']) $(id).classList.remove('on');
  crSetBackdrop(false); // Beta 1.120: the loaded route's paint returns exactly as it was
  renderDraft(); // draft is null: the overlay clears, the active route was never touched
}
function openDoors() { crWarmCityLibrary(); if (!routeLoaded) { restoreBootChrome(); } else openRouteMenu(); showRmPane('rmCreatePane'); } // Beta 1.124: the doors pane needs no render on entry - the city list renders when ITS door is tapped. Beta 1.130: the doors ARE the create gate - opening them starts the catalogue download (crWarmCityLibrary), so it is in hand by the list tap
function askDiscard(then) { if (draft && draftStreets().length) crConfirm('Throw away this draft?', 'The ' + draftStreets().length + ' streets you picked will be lost.', then, { oneBtn: true }); else then(); }
function fitDraft() {
  if (!draft || !map) return;
  const bb = computeRouteBox(crFilteredRoads()); if (!bb) return; // Beta 1.127: the preview frames what will save (chosen sectors), not the whole streets
  try { map.fitBounds([[bb.w, bb.s], [bb.e, bb.n]], { padding: 56, duration: 800 }); } catch (e) {}
}
$('crExit').addEventListener('click', () => { // Beta 1.120: the ✕ beside the search first CLEARS the search (text + open results) when there is anything to clear - that is what a ✕ beside a search bar means; pressed with an empty search it exits creating, as before
  const box = $('createResults');
  if (box.classList.contains('on') || $('crSearchInput').value) {
    box.classList.remove('on'); $('crSearchInput').value = '';
    if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
    crSearchSeq++; if (crSearchCtl) { try { crSearchCtl.abort(); } catch (e) {} }
    return;
  }
  askDiscard(() => { const wasBoot = !routeLoaded; exitCreate(); if (wasBoot) openDoors(); });
});
$('pvStartOverBtn').addEventListener('click', () => askDiscard(() => { exitCreate(); openDoors(); }));

// ---- Door 1: photo -> waiting state -> draft import ----
$('crDoorPhoto').addEventListener('click', () => showRmPane('rmPhotoPane'));
$('crPhotoBack').addEventListener('click', () => showRmPane('rmCreatePane')); // Beta 1.124: the photo pane backs to the doors pane it came from (1.123's chooser pane was that pane's old shape)
$('crPhotoBtn').addEventListener('click', () => $('crPhotoFile').click());
$('crPhotoFile').addEventListener('change', () => {
  const f = $('crPhotoFile').files && $('crPhotoFile').files[0]; $('crPhotoFile').value = '';
  if (!f) return;
  crPhoto = f;
  $('crPhotoName').textContent = f.name || 'photo';
  $('crPhotoPick').style.display = 'none'; $('crPhotoWait').style.display = '';
  const sh = $('crShareBtn');
  let can = false; try { can = !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) {}
  sh.style.display = can ? '' : 'none'; // the share affordance exists only where the platform offers it - silent absence otherwise
});
$('crShareBtn').addEventListener('click', () => { if (crPhoto && navigator.share) navigator.share({ files: [crPhoto] }).catch(() => {}); });
$('crImportBtn').addEventListener('click', () => $('crDraftFile').click());
$('crDraftFile').addEventListener('change', async () => {
  const f = $('crDraftFile').files && $('crDraftFile').files[0]; $('crDraftFile').value = '';
  if (!f) return;
  let text = ''; try { text = await f.text(); } catch (e) { toast('That draft file could not be read', 3200); return; }
  importDraft(text);
});
function importDraft(text) { // fail closed, named errors, nothing half-applied - the same discipline as a backup restore
  let obj; try { obj = JSON.parse(text); } catch (e) { toast('That draft file could not be read — it is not valid JSON', 3600); return; }
  let raw = obj;
  if (obj && typeof obj === 'object' && !Array.isArray(obj) && obj.roads === undefined) { // the sandbox pipeline's candidate shape: a bare roads object
    const vals = Object.values(obj);
    if (vals.length && vals.every(v => Array.isArray(v))) raw = { roads: obj };
    else { toast('That draft file has no roads in it — nothing was imported', 3600); return; }
  }
  const v = normalizePack(raw, { draft: true });
  if (!v.ok) { toast('Draft not imported — ' + v.error, 4000); return; }
  draft = newDraft();
  draft.roads = v.pack.roads; draft.mains = new Set(v.pack.main); draft.name = v.pack.name || ''; draft.area = v.pack.area || ''; draft.tileNames = v.pack.tileNames.slice();
  enterCreate('preview');
  toast('Draft loaded — check it over', 2600);
}

// ---- Door 2: city first (Andrew's amendment) -> prepare the area's street shapes once -> tap roads, resolved locally ----
$('crDoorList').addEventListener('click', () => { showRmPane('rmCityListPane'); crRenderCityChoices(); }); // Beta 1.124: Select from list - the city rows render fresh on every entry to the list pane
$('rmCityListBack').addEventListener('click', () => showRmPane('rmCreatePane')); // the list pane backs to the doors pane (the mockup's pane-to-pane Back chain)
$('crDoorManual').addEventListener('click', () => { draft = newDraft(); crOpenCityPane('doors'); });
$('crCityInput').addEventListener('input', () => { if (crCityTimer) clearTimeout(crCityTimer); crCityTimer = setTimeout(() => { crCityTimer = null; crRunCitySearch(); }, 500); });
$('crCityLast').addEventListener('click', async () => {
  const last = lsGet(LS_GLOBAL.lastArea); if (!last) return;
  // resolve the remembered NAME back to a place (centre + bounds) through the same city search; if the lookup fails, the name alone still scopes the creation - anchors then come from street-search picks and Prepare this area.
  // CG-PF-11 (verify round): this completion binds to (lookup generation, creation session, the pane still being open) - a slow lookup must never overwrite a city picked in the meantime, and Back / exit / a competing pick abort it outright.
  const seq = ++crCityLookupSeq, session = crSession;
  if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} }
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null; crCityLastCtl = ctl;
  const stillMine = () => seq === crCityLookupSeq && session === crSession && $('rmCityPane').classList.contains('on');
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&featuretype=city&limit=6&q=' + encodeURIComponent(last), { headers: { 'Accept': 'application/json' }, signal: ctl ? ctl.signal : undefined });
    if (r.ok) { const list = await r.json(); if (!stillMine()) return; const hit = (Array.isArray(list) ? list : []).find(crIsPlace); if (hit) { crPickCity(hit); return; } }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  if (!stillMine()) return;
  crCity = { name: last, lat: null, lon: null, bbox: null };
  crAreaGuess = last; if (draft && !draft.area) draft.area = last;
  crEnterPickFromCity();
});
$('crCityBack').addEventListener('click', () => {
  crCityLookupSeq++; if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} crCityLastCtl = null; } // leaving the pane kills a held lookup (CG-PF-11)
  if (crCityReturn === 'preview' || crCityReturn === 'pick') { if (!routeLoaded) parkBootChrome(); else closeRouteMenu(); setCreateStage(crCityReturn); }
  else { showRmPane('rmCreatePane'); }
});
$('crCityChange').addEventListener('click', () => crOpenCityPane('pick'));
$('crHintBtn').addEventListener('click', () => {
  if (crPrepState === 'preparing') { crCancelPrep(); return; }
  if (crWanted) { crStartPrep(crWanted.anchor); return; } // an outstanding offer (outside-coverage tap / pending street) prepares exactly where it points - it outranks the state remedies below
  if (crPrepState === 'degraded') { crGridResume(); return; } // Resume / Retry missing parts: only the missing cells fetch (amendments A+B)
  if (crPrepState === 'failed') {
    if (crFailFromGrid) { crGridResume(); return; } // a failed GRID retries its missing cells
    if (crPrepFail && crPrepFail.kind === 'dense') { if (map) { const c = map.getCenter(); crStartPrep({ lat: c.lat, lng: c.lng }); } } // the dense remedy: prepare wherever the map now sits (CG-PF-09)
    else if (crPrepAnchor) crStartPrep(crPrepAnchor); // Retry: the same anchor again
    return;
  }
  if (crPrepState === 'ready' && crGrid && crGrid.fromCache) { crGridRefresh(); return; } // the saved city's Refresh: load the whole city again
  if (map) { const c = map.getCenter(); crStartPrep({ lat: c.lat, lng: c.lng }); } // Prepare this area: the anchor is the map centre he is looking at
});
onMapReady(() => map.on('moveend', () => { if (creating && crStage === 'pick' && crPrepState === 'none') crRenderHint(); })); // the Prepare-this-area offer follows the zoom (it appears only at picking zoom) - never a silent download while merely panning
$('crSearchBtn').addEventListener('click', crSearch);
$('crSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') crSearch(); });
// Beta 1.120 (Andrew): search AS YOU TYPE. 1.118/1.119 searched only on
// the Search button - his call then; on the phone he asked for
// suggestions while typing, and this supersedes it. The volume stays
// honest: a keystroke burst becomes ONE query (500 ms debounce, 3+
// characters), a newer query aborts and supersedes the one in flight
// (sequence token + AbortController, so a slow earlier answer can never
// overwrite newer results), and the Search button / Enter still run the
// typed query immediately. Results are biased toward the visible map
// (viewbox, bounded=0 - a bias, never a restriction).
let crSearchTimer = null, crSearchSeq = 0, crSearchCtl = null;
$('crSearchInput').addEventListener('input', () => {
  if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
  $('crSearchBtn').disabled = false;
  const q = $('crSearchInput').value.trim();
  if (q.length < 3) { crSearchSeq++; if (crSearchCtl) { try { crSearchCtl.abort(); } catch (e) {} } $('createResults').classList.remove('on'); return; }
  crSearchTimer = setTimeout(() => { crSearchTimer = null; crRunSearch(true); }, 500);
});
function crSearch() { // the button / Enter: cancel any pending debounce and run the typed query NOW
  if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
  crRunSearch(false);
}
async function crRunSearch(fromTyping) {
  const q = $('crSearchInput').value.trim(); if (!q) return;
  const seq = ++crSearchSeq;
  if (crSearchCtl) { try { crSearchCtl.abort(); } catch (e) {} }
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null; crSearchCtl = ctl;
  if (!fromTyping) $('crSearchBtn').disabled = true;
  try {
    let url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=' + encodeURIComponent(q);
    try { // Beta 1.121: with a city chosen, the street search is biased to the CITY (its Nominatim bounding box) - preparation and search live inside the city he picked; without one, the visible map biases as before. bounded=0 either way: a bias, never a restriction.
      if (crCity && crCity.bbox) url += '&viewbox=' + [crCity.bbox.w, crCity.bbox.n, crCity.bbox.e, crCity.bbox.s].map(v => +v.toFixed(5)).join(',') + '&bounded=0';
      else if (map) { const b = map.getBounds(); url += '&viewbox=' + [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].map(v => +v.toFixed(5)).join(',') + '&bounded=0'; }
    } catch (e) {}
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctl ? ctl.signal : undefined });
    if (!r.ok) throw new Error('search HTTP ' + r.status);
    const list = await r.json();
    if (seq !== crSearchSeq) return; // superseded while in flight - a newer query owns the dropdown
    renderCrResults(Array.isArray(list) ? list : []);
    if (!fromTyping && (!Array.isArray(list) || !list.length)) toast('No places matched that search', 3000);
  } catch (e) {
    if (seq === crSearchSeq && !(e && e.name === 'AbortError') && !fromTyping) toast('Search needs an internet connection — try again', 3200);
  }
  if (!fromTyping && seq === crSearchSeq) $('crSearchBtn').disabled = false;
}
document.addEventListener('pointerdown', (e) => { // Beta 1.120 (Andrew): tapping anywhere outside the results dropdown dismisses it - map taps included (the pick still runs: this only closes the list, in the capture phase, before the map's own click)
  if (!creating) return;
  const box = $('createResults');
  if (!box.classList.contains('on')) return;
  if (e.target && (box.contains(e.target) || $('createBar').contains(e.target))) return;
  box.classList.remove('on');
}, true);
function renderCrResults(list) {
  const box = $('createResults'); box.innerHTML = '';
  for (const it of list) {
    const b = document.createElement('button'); b.className = 'crResult'; b.textContent = it.display_name || '';
    b.addEventListener('click', () => {
      box.classList.remove('on');
      const lat = parseFloat(it.lat), lon = parseFloat(it.lon); if (!isFinite(lat) || !isFinite(lon)) return;
      const a = it.address || {}; crAreaGuess = a.city || a.town || a.village || a.municipality || a.county || '';
      if (map) map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 15), duration: 900 });
      if (crGrid && crCity && crInBox(crGrid.bbox, lat, lon)) { /* inside the picked city: its grid is the preparation (already running or saved) - no second download for a search pick */ }
      else crStartPrep({ lat, lng: lon }); // Beta 1.121: outside any city coverage, the search pick ANCHORS the fallback box preparation (anchor rule (a)) - taps then resolve locally from the extract
    });
    box.appendChild(b);
  }
  box.classList.toggle('on', list.length > 0);
}
const CR_SUFFIX = /\s+(Drive|Court|Boulevard|Lane|Street|Avenue|Crescent|Road|Place|Ridge|Way|Terrace|Circle|Gate|Heights|Trail|Parkway)$/;
const CR_ORDINALS = { '1st': 'First', '2nd': 'Second', '3rd': 'Third', '4th': 'Fourth', '5th': 'Fifth', '6th': 'Sixth', '7th': 'Seventh', '8th': 'Eighth', '9th': 'Ninth', '10th': 'Tenth', '11th': 'Eleventh', '12th': 'Twelfth' };
function shortStreetName(osm) { // the app's short-name convention (the sandbox's suffix rule; ordinal avenues spell out - 5th Avenue is Fifth)
  const m = /^(\d+(?:st|nd|rd|th))\s+Avenue$/i.exec(osm);
  if (m && CR_ORDINALS[m[1].toLowerCase()]) return CR_ORDINALS[m[1].toLowerCase()];
  const s = osm.replace(CR_SUFFIX, '');
  return s && s !== osm ? s : osm;
}
function crLineLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += distM(pts[i - 1], pts[i]); return s; }
function chainWays(ways) { // the sandbox's stitch: greedy endpoint chaining at 1.5 m tolerance into runs. A run whose joins were all exact keeps its ways as segments (the app's own stitcher re-chains them identically); a run with a bridged join is stored as its single stitched line.
  const pool = ways.map(w => w.slice());
  const runs = [];
  while (pool.length) {
    let bi = 0; for (let i = 1; i < pool.length; i++) if (crLineLen(pool[i]) > crLineLen(pool[bi])) bi = i;
    const first = pool.splice(bi, 1)[0];
    let line = first.slice(); const segs = [first]; let exact = true;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i], a = s[0], b = s[s.length - 1], L0 = line[0], L1 = line[line.length - 1];
        const dAL1 = distM(a, L1), dBL1 = distM(b, L1), dBL0 = distM(b, L0), dAL0 = distM(a, L0);
        let addLine = null, addSeg = null, dJoin = 0;
        if (dAL1 <= 1.5) { addLine = s.slice(1); addSeg = s; dJoin = dAL1; line = line.concat(addLine); }
        else if (dBL1 <= 1.5) { addLine = s.slice(0, -1).reverse(); addSeg = s.slice().reverse(); dJoin = dBL1; line = line.concat(addLine); }
        else if (dBL0 <= 1.5) { addLine = s.slice(0, -1); addSeg = s; dJoin = dBL0; line = addLine.concat(line); }
        else if (dAL0 <= 1.5) { addLine = s.slice(1).reverse(); addSeg = s.slice().reverse(); dJoin = dAL0; line = addLine.concat(line); }
        else continue;
        if (dJoin > 0.01) exact = false;
        segs.push(addSeg); pool.splice(i, 1); grew = true; break;
      }
    }
    runs.push({ segments: segs, line, exact });
  }
  return runs;
}
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']; // primary + fallback (both named in the stamped CSP's connect-src)
// Beta 1.121: overpassQuery + fetchStreetGeometry are GONE - they were the
// per-tap fetch (and the malformed query's home). All Overpass traffic now
// goes through crOverpassFetch with queries built by crQL/crAreaQL/
// crNameQL (see the preparation block above); taps resolve locally.
async function pickStreet(osmName, lngLat) {
  const short = shortStreetName(osmName);
  if (!draft) return;
  if (draft.roads[short]) { crOpenSectors(short); return; } // Beta 1.128 (Andrew's fork, decided from his 1.127 device session): a tap on an ALREADY-PICKED street opens its sectors - the map-level section picking he asked for. 1.127's tap-again-to-deselect is RETIRED: removal lives only on the panel row's ✕ and Clear all. The street is already resolved and validated, so this never re-resolves
  if (crPending[short]) { toast(short + ' is pending — it runs past the prepared area and is not in your route yet', 3400); return; }
  if (crPickBusy) return;
  // Beta 1.121: the tap resolves LOCALLY from the prepared extract - no
  // network on the ordinary path (CG-PF-04). Before the extract is ready
  // the tap still IDENTIFIES the street and says so honestly; it never
  // pretends to add it - nothing appears added until accurate geometry
  // is in hand and validated (the line the whole create flow holds).
  // A tap inside a part of the city that has ALREADY landed resolves
  // even while the rest still loads - progress is real (amendment B).
  if (crCov && crCov.boxes.length) {
    const res0 = crResolve(osmName, lngLat);
    if (res0.status === 'ok') { crAddStreet(short, osmName, res0.segs); return; }
    if (res0.status === 'absent') {
      if (crInAnyBox(crCov.boxes, lngLat.lat, lngLat.lng)) { toast('No shape found for ' + short + ' here — the map data holds no line for it', 3600); return; }
      if (crGrid && crInBox(crGrid.bbox, lngLat.lat, lngLat.lng)) {
        const cell = crGrid.cells.find(c => crInBox(c.box, lngLat.lat, lngLat.lng));
        if (cell && cell.state === 'failed') toast('That part of ' + crGrid.name + ' didn’t load — ' + short + ' can be added after Retry missing parts', 3800);
        else toast('That part of ' + (crCity ? crCity.name : 'the city') + ' is still loading — ' + short + ' can be added as soon as it lands', 3400);
        return;
      }
      crPrepAnchor = { lat: lngLat.lat, lng: lngLat.lng }; crWanted = { anchor: { lat: lngLat.lat, lng: lngLat.lng }, label: 'Prepare this area' }; crRenderHint(); toast(short + ' is outside the prepared area — prepare this area, then tap it again', 3800);
      return;
    }
    // edge (Codex (c)): the run reaches beyond verified coverage - ONE
    // targeted fetch for this name over an expanded bounded area (centred
    // on the run's open end), merged by way id, then resolved again
    // against that wider boundary. Still beyond afterwards: PENDING.
    const session = crSession, gen = crCovGen, topKey = short + '@' + gen;
    if (crToppedUp[topKey]) { crPendStreet(short, osmName, lngLat, res0.run, null); return; }
    crToppedUp[topKey] = true;
    crPickBusy = true;
    const hint = $('createHint'); hint.textContent = 'Checking the whole of ' + short + '…'; hint.classList.add('on');
    const op = {}; crTopOp = op; // exitCreate can stop this download too (CG-PF-10)
    try {
      let openEnd = { lat: lngLat.lat, lng: lngLat.lng };
      if (res0.run && res0.run.line) { for (const end of [res0.run.line[0], res0.run.line[res0.run.line.length - 1]]) { if (!crInAnyBox(crCov.boxes, end[0], end[1])) { openEnd = { lat: end[0], lng: end[1] }; break; } } }
      const box = crBoxAround(openEnd.lat, openEnd.lng, CR_INNER_KM + CR_BUFFER_KM + CR_TOPUP_RING_KM);
      const got = await crSourceExtract(box, osmName, CR_TIMING.topupBudgetMs, CR_TIMING.topupAttempt1Ms, () => creating && crSession === session && crCovGen === gen, op);
      if (!creating || crSession !== session || crCovGen !== gen || !draft) return; // obsolete: land nowhere (CG-PF-05)
      if (!got.ok) {
        if (got.kind === 'dense') toast('That area is too dense to check ' + short + ' against — it stays out of your route for now', 4000);
        else if (got.kind === 'error' || got.kind === 'badjson') toast('The street-shape service answered with an error — ' + short + ' was not added', 3800);
        else if (got.kind !== 'stale') toast('The street-shape service didn’t answer — ' + short + ' was not added', 3800);
        crRenderHint();
        return;
      }
      crCovMerge(got.json.elements, null); // merged by way id; the top-up's box verifies THIS resolution (below) but does not join the coverage set - a later street must earn its own proof
      const res = crResolve(osmName, lngLat, box);
      if (res.status === 'ok') crAddStreet(short, osmName, res.segs); else crPendStreet(short, osmName, lngLat, res.run, box);
    } finally { if (crTopOp === op) crTopOp = null; crPickBusy = false; } // Beta 1.120: EVERY exit path releases the picker - 1.119's early return on a null shape skipped this line and one refused fetch wedged tapping for the whole session (Andrew, on device). The session/generation guards above are what bind the COMPLETION (CG-PF-05); the busy flag can only be held by the one pick in flight, so releasing it here can never clear a newer operation's state.
    return;
  }
  if (crPrepState === 'preparing') { toast('Still preparing street shapes — ' + short + ' can be added as soon as they are ready', 3200); return; }
  crPrepAnchor = { lat: lngLat.lat, lng: lngLat.lng };
  crWanted = { anchor: { lat: lngLat.lat, lng: lngLat.lng }, label: 'Prepare this area' }; // the offer names THIS tap's area, and the hint button prepares exactly there (CG-PF-09)
  toast('Street shapes aren’t ready for this area yet — tap Prepare this area, then tap ' + short + ' again', 3800);
  crRenderHint();
}
function crFeatDistM(lngLat, geom) { // metres from the tap to the nearest point of a tile feature's line(s), in distM's flat-earth metres. CHOICE ONLY (see crMapTap): the number judges which named street a tap meant - it is never stored and never shapes the route
  if (!geom) return Infinity;
  const lines = geom.type === 'LineString' ? [geom.coordinates] : (geom.type === 'MultiLineString' ? geom.coordinates : []);
  const px = lngLat.lng * MLNG, py = lngLat.lat * MLAT;
  let best = Infinity;
  for (const line of lines) {
    if (!Array.isArray(line)) continue;
    for (let i = 0; i < line.length; i++) {
      const ax = line[i][0] * MLNG, ay = line[i][1] * MLAT;
      const d0 = Math.hypot(px - ax, py - ay); if (d0 < best) best = d0;
      if (i > 0) {
        const bx = line[i - 1][0] * MLNG, by = line[i - 1][1] * MLAT;
        const dx = ax - bx, dy = ay - by, L2 = dx * dx + dy * dy;
        let t = L2 ? ((px - bx) * dx + (py - by) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(px - (bx + t * dx), py - (by + t * dy)); if (d < best) best = d;
      }
    }
  }
  return best;
}
function crMapTap(e) {
  if (!creating || crStage !== 'pick' || !map) return;
  if (crSectorStreet) { crSectorTap(e.lngLat); return; } // Beta 1.127: while trimming, a map tap speaks only to the street being trimmed - it can neither add nor remove another street
  // Beta 1.119: query a small BOX around the tap, not the tap's single pixel.
  // Rendered road lines are a few px wide and a fingertip lands +/-10-20 px
  // off them, so the 1.118 point query almost never held a road and every
  // real tap toasted "No road there" (Andrew, on device). The tile
  // geometry's ONLY job here is to choose WHICH named street the tap meant
  // (the line passing closest to the tap wins); it is never stored - the
  // street's stored shape still comes from the accurate source - the
  // prepared Overpass extract (identity from the tile name, shape from
  // the extract - the approved reconciliation; display tiles re-segment
  // streets and misplace joins).
  const roadFeats = (half) => {
    let feats = [];
    try { feats = map.queryRenderedFeatures([[e.point.x - half, e.point.y - half], [e.point.x + half, e.point.y + half]]) || []; } catch (err) {}
    return feats.filter(x => x && x.sourceLayer === 'roads' && x.properties && typeof x.properties.name === 'string' && !!x.properties.name);
  };
  let pick = null;
  for (const half of [16, 28]) { // a finger's real tolerance first; one wider retry before giving up
    const named = roadFeats(half);
    if (!named.length) continue;
    let pickD = Infinity;
    for (const f of named) { const d = crFeatDistM(e.lngLat, f.geometry); if (d < pickD) { pickD = d; pick = f.properties.name; } }
    if (!pick) pick = named[0].properties.name; // a named road whose tile line is unusable still names the street - the name is the identity
    break; // the first box that names any road decides
  }
  if (!pick) { toast('No road there — tap right on a road line', 2400); return; }
  pickStreet(pick, e.lngLat);
}
onMapReady(() => map.on('click', crMapTap));
$('crDoneBtn').addEventListener('click', () => { if (draftStreets().length) setCreateStage('preview'); }); // "Done" (Beta 1.128: the panel footer's ONLY button - the 1.127 "+ Add a street" ghost is gone; it never added anything, it only tucked the panel, and tucking belongs to the head's grab/tap gesture)
$('crReviewBtn').addEventListener('click', () => crExpandPanel()); // the bar's way back (mockup screen 4)
$('crClearAll').addEventListener('click', () => { // Andrew's addition (2026-11-06): empty the picks at once - behind the shared confirm, the same discipline as Start over and route deletion; the city and the session stay
  const n = draft ? draftStreets().length : 0; if (!n) return;
  crConfirm('Clear all ' + n + (n === 1 ? ' road?' : ' roads?'), 'Every road you picked will be taken off this route. The city stays loaded.', () => {
    draft.roads = {}; draft.mains.clear(); draft.osmNames = {}; draft.sectors = {}; draft.parts = {};
    crSectorStreet = null; crSectorSnapshot = undefined;
    renderDraft(); renderCrLists(); crRenderHint();
  }, { yes: 'Clear all', no: 'Cancel', danger: true });
});
$('crSbWhole').addEventListener('click', () => { const s = crSectorStreet; if (!s) return; const rec = crStreetParts(s); if (rec) crSetChosen(s, rec, new Set(rec.parts.map((_, i) => i))); renderDraft(); renderCrLists(); renderSectorBar(); }); // Entire road: every sector back on (the pick is stored as no entry again)
$('crSbDone').addEventListener('click', () => crCloseSectors()); // Done: back to the panel
$('crSbCancel').addEventListener('click', () => crCancelSectors()); // Cancel (Beta 1.129): restore the pick as it was when sector mode was entered, and leave
(() => { // the panel's tuck-away gesture (mockup screens 3-4): drag or flick the grab handle / header downward to collapse; a plain tap there collapses too. Buttons inside the header keep their own taps (the check below), and the rows below scroll natively - drags never start there
  const sheet = $('createSheet'), head = $('crPanelHead'); if (!sheet || !head) return; // Beta 1.129: the drag moves the SURFACE (the one card), not a face inside it
  let pid = null, startY = 0, lastY = 0, samples = [], moved = false;
  head.addEventListener('pointerdown', e => {
    if (pid !== null || e.target.closest('button')) return;
    pid = e.pointerId; startY = lastY = e.clientY; samples = [{ t: performance.now(), y: e.clientY }]; moved = false;
    cancelSheetSpring(sheet); crSettleMorph(); // a grab mid-settle takes the surface over from its live position (and lands any face morph in flight)
  });
  head.addEventListener('pointermove', e => {
    if (pid === null || e.pointerId !== pid) return;
    lastY = e.clientY;
    samples.push({ t: performance.now(), y: e.clientY }); if (samples.length > 8) samples.shift();
    const dy = lastY - startY;
    if (Math.abs(dy) > 4) { if (!moved) { moved = true; try { head.setPointerCapture(pid); } catch (err) {} } }
    if (moved && dy > 0) { sheet.style.transform = 'translateY(' + dy + 'px)'; e.preventDefault(); }
  });
  const up = e => {
    if (pid === null || (e && e.pointerId !== pid)) return;
    pid = null;
    if (!moved) { crCollapsePanel(0, 0); return; } // a tap on the handle/header tucks the panel away
    const dy = Math.max(0, lastY - startY);
    const now = performance.now(); const s0 = samples.find(s => now - s.t <= 130) || samples[0];
    const dt = now - s0.t; const vy = dt >= 30 ? (lastY - s0.y) / dt : 0; // px/ms, positive = downward (the sheets' release-velocity rule)
    if (dy > 70 || vy > 0.45) crCollapsePanel(dy, vy * 1000);
    else springSheet(sheet, dy, 0, vy * 1000, q => { sheet.style.transform = 'translateY(' + q + 'px)'; }, () => { sheet.style.transform = ''; });
  };
  head.addEventListener('pointerup', up);
  head.addEventListener('pointercancel', up);
})();
$('pvAddBtn').addEventListener('click', () => { // back to picking for more streets; Done there returns to this same preview (Beta 1.128: the panel button never changes its label, so no return-mode state is needed)
  if (crCity) { setCreateStage('pick'); return; }
  if (draft && draft.area) { crCity = { name: draft.area, lat: null, lon: null, bbox: null }; setCreateStage('pick'); return; } // Beta 1.121: a draft that already names its city (the photo door) pre-answers the city step - still changeable from the pick sheet's city chip
  crOpenCityPane('preview');
});

// ---- name it + save (Beta 1.128: the step STAYS its own - a draft of
// this build folded naming into the preview and Andrew vetoed it the
// same evening; the preview's button is labelled "Save route" and
// advances here, and this pane's "Save route" remains the only save) ----
$('pvSaveBtn').addEventListener('click', openNameIt);
function openNameIt() {
  if (!draft || !draftStreets().length) return;
  $('crNameInput').value = draft.name || nextRouteNameGuess();
  $('crAreaInput').value = draft.area || crAreaGuess || lsGet(LS_GLOBAL.lastArea) || '';
  const g = computeStretches(draft.roads); let tot = 0; for (const n of draftStreets()) tot += crStreetChosenM(n, g); // Beta 1.127: the summary bills what will actually save
  $('crNameSummary').textContent = draftStreets().length + ' streets · ' + draft.mains.size + ' mains · ' + fmtLenM(tot) + ' of road';
  if (!routeLoaded) restoreBootChrome(); else openRouteMenu();
  showRmPane('rmNamePane');
}
$('crNameBack').addEventListener('click', () => { if (!routeLoaded) parkBootChrome(); else closeRouteMenu(); setCreateStage('preview'); });
$('crSaveBtn').addEventListener('click', saveDraftRoute);
function saveDraftRoute() {
  const name = $('crNameInput').value.trim();
  if (!name) { toast('Give the route a name first', 2600); return; }
  const area = $('crAreaInput').value.trim();
  const v = normalizePack({ name, area, mains: [...draft.mains], roads: crFilteredRoads(), reference: {} }, { tileNames: [...Object.values(draft.osmNames), ...(draft.tileNames || [])] }); // Beta 1.127: the SAVE stores chosen sectors only - the draft keeps the whole streets, the pack never sees the unchosen ends
  if (!v.ok) { toast('Could not save — ' + v.error, 4000); return; }
  const pack = v.pack; pack.id = uniqueRouteId(name);
  const rec = loadUserPacks(); rec[pack.id] = pack;
  if (!lsSet(USERPACKS_KEY, JSON.stringify(rec))) { toast('Storage problem — the route could not be saved', 4000); return; }
  ROUTE_PACKS.push(pack); // live in the runtime list at once - listed and switchable without a reload
  try { lsSet(routeKeys(pack.id).pre, JSON.stringify({ at: 0, saved: 0, total: preloadUrlList().length, routeSaved: 0, routeTotal: packTileUrls(pack).size })); } catch (e) {} // F5: the new route starts with an honest preload record - none of its area is downloaded yet; Status offers the (grown) union download
  if (area) lsSet(LS_GLOBAL.lastArea, area);
  const wasBoot = !routeLoaded, newId = pack.id;
  exitCreate();
  toast('Route saved — its maps are not downloaded yet; get them in Settings → Status → Download', 4600);
  if (wasBoot) { restoreBootChrome(); if (window.__bootPickRoute) window.__bootPickRoute(newId); }
  else { openRouteMenu(); showRmPane('rmListPane'); }
}

(() => {
  const sp = $('splash'); if (!sp) return;
  const t0 = Date.now(); let gone = false;
  const finish = () => { if (gone) return; gone = true; clearInterval(iv); sp.remove(); document.documentElement.classList.remove('boot'); /* Beta 1.85: the splash is gone - the root frame returns to the app's own colour (the html.boot rule) */ const rm = $('routeMenu'); if (rm) { rm.classList.add('notrans'); rm.classList.remove('boot', 'show', 'bye'); void rm.offsetWidth; rm.classList.remove('notrans'); } }; // Beta 1.78: park the menu below the screen without animating the swap
  const arm = () => { const wait = Math.max(0, 1900 - (Date.now() - t0)); setTimeout(() => { crWarmCityLibrary(); /* Beta 1.130: Andrew's own suggestion, adjudicated to the catalogue ONLY - the packs/index.json download fires in this deferred boot slot (the menu-arming moment: first tiles are in or the 6 s escape has passed, the 1900 ms splash floor has run, so it never competes with first paint), and a cold open has the catalogue in hand before Create is ever opened. The city PACK FILES stay on-demand per city - 6.5 MB of gzip across the library is not boot work. The cached promise keeps it to one fetch per session; the gate/menu warm calls remain as no-op re-triggers */ if (!gone) { sp.classList.add('menu'); $('routeMenu').classList.add('show'); document.documentElement.classList.remove('boot'); /* Beta 1.86: the boot state also ends HERE, when the menu arms - the still-to-live handover window (the unsettled first frames the chrome-absence protects) is long past by the gate's 1900ms minimum, and the opaque menu covers the chrome while it paints beneath. Every later state (a post-reload session at the menu, the pick, a direct load) must find a functional shell; the pick/loadRoute/finish removals stay as backstops */ } }, wait); };
  const iv = setInterval(() => {
    if (!map && Date.now() - t0 > 4000) __bootTail();
    if ((typeof glOk !== 'undefined' && glOk && typeof tilesOk !== 'undefined' && tilesOk > 0) || Date.now() - t0 > 6000) { clearInterval(iv); arm(); }
  }, 120);
  window.__bootPickRoute = id => { loadRoute(id); document.documentElement.classList.remove('boot'); /* Beta 1.86: the boot state flips FIRST, while both blue layers are still opaque - the finished app (chrome included) paints beneath them, and the fade below reveals it whole, instead of the chrome popping in after the blue is gone (the 1.67 weirdness Andrew flagged) */ let faded = false; const fade = () => { if (faded) return; faded = true; sp.classList.add('go'); $('routeMenu').classList.add('bye'); setTimeout(finish, 780); }; requestAnimationFrame(fade); setTimeout(fade, 150); }; // the boot-mode row pick (app2 wires the rows and the pane buttons): load the route, flip the boot state, fade both blue layers, then finish() removes the splash and parks the menu
})();
