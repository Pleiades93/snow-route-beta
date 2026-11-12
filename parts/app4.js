
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
  if (strict) { const rs = rawRead(LS.snap); if (rs === RAW_READ_FAILED) return undefined; rawSnap = rs; } // Beta 1.136: through the shared rawRead - the strict failure mode (undefined) is unchanged
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
    for (const f of ROUTE_FIELDS) { const key = (activeRoute && p.id === activeRoute.id && LS[f] !== rk[f]) ? LS[f] : rk[f]; const v = rawRead(key); if (v === RAW_READ_FAILED) return null; if (v != null) data[f] = v; }
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
      else { const rawSnap = rawRead(rk.snap); if (rawSnap === RAW_READ_FAILED) return null; const pv = validateSnap(parseJ(rawSnap, null), +startStr, packGeometry(p)); if (pv) snapObj = { at: +startStr, pieces: pv.pieces, pieceTimes: pv.pieceTimes, done: pv.done, times: pv.times, via: pv.via, cov: pv.cov }; } // Beta 1.117 (F6): a non-active pack's snapshot validates against ITS OWN geometry
      if (snapObj) data.snap = JSON.stringify(snapObj);
    }
    routes[p.id] = data;
  } // Beta 1.92 (deep audit F02): the ACTIVE route exports from the key mapping it is actually running on - on a legacy-fallback boot (migration failed) LS points at the legacy keys, and reading the fresh slot would emit a valid-looking EMPTY backup
  const night = rawRead(LS_GLOBAL.night); if (night === RAW_READ_FAILED) return null;
  const nightExp = rawRead(LS_GLOBAL.nightExp); if (nightExp === RAW_READ_FAILED) return null;
  const o = { app: 'snowroute-backup', v: 2, at: new Date().toISOString(), routes };
  if (!upStoreComplete) return null; // Beta 1.166: created-route definitions ride from the verified in-memory picture of the IndexedDB store (create-packs.js: userPackCache) - and a boot whose store read failed never gets to claim completeness: the export refuses (the B04 strictness this line has carried since 1.118, re-seated on the new home) rather than ship a valid-looking backup that silently loses routes living only in the store
  if (Object.keys(userPackCache).length) o.userpacks = { ...userPackCache }; // Beta 1.118: created routes are Andrew's data - their definitions ride every backup
  if (night != null) o.night = night;
  if (nightExp != null) o.nightExp = nightExp; // Beta 1.77: the theme override and its expiry travel together (an override without its expiry is read as expiring at the next boundary)
  const stg = rawRead(SETTINGS_KEY); if (stg === RAW_READ_FAILED) return null; if (stg != null) o.settings = stg; // Beta 1.166: the Settings toggles (app1's record: vibration, chime, chime sound) ride every backup too, read with the same B04 strictness as the night pair - a backup whose promise is "restart from where you had it" may not silently drop them. Additive like nightExp before it: older builds ignore the unknown field, older backups simply omit it
  return o;
}
function buildBackup() { const o = backupObj(); return o ? JSON.stringify(o, null, 1) : null; }
let recoveryDisclosure = null; // Beta 1.142 (Package B, DA-09): the names of created routes the LAST recovery build could not carry a definition for (their entries were excluded - see recoveryObj); shareRecovery names them in its result message, so an incomplete recovery file is never silent about what it lacks
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
  { const fl = rawRead(routeKeys(activeRoute.id).flip); if (fl !== RAW_READ_FAILED && fl != null) data.flip = fl; } // a read that fails simply leaves the field out (the recovery export's best-effort mode)
  // Beta 1.142 (Package B, DA-09): the created-route definitions this file must carry are settled
  // FIRST, before any route entry is built. When the stored record reads cleanly it is carried as
  // before (1.118); when it cannot be read at all, the definitions come from the in-memory packs -
  // each re-validated through normalizePack, the one validator - because a recovery file whose
  // created route has progress but no definition is rejected WHOLESALE by a fresh device
  // ("unknown route"), in exactly the storage-failure states this export exists for. A route whose
  // definition cannot be carried even from memory is excluded from the file entirely (its progress
  // would make the file unrestorable) and named in recoveryDisclosure for shareRecovery's message.
  // Beta 1.166: "the stored record" in the paragraph above is now the IndexedDB store, read at boot
  // into userPackCache (create-packs.js): when that read earned completeness, the cache is the
  // carried set (a superset of the old record read - it also covers routes whose legacy record
  // has drained away); when it did not, the fallback below runs per route the cache lacks.
  recoveryDisclosure = null;
  let upsCarry = null; const excluded = new Set();
  if (upStoreComplete) upsCarry = { ...userPackCache };
  else { upsCarry = {}; const badNames = [];
    for (const pk of ROUTE_PACKS) { if (SHIPPED_PACK_IDS.has(pk.id)) continue; if (userPackCache[pk.id]) { upsCarry[pk.id] = userPackCache[pk.id]; continue; } const v = normalizePack(pk, {}); if (v.ok) { v.pack.id = pk.id; upsCarry[pk.id] = v.pack; } else { excluded.add(pk.id); badNames.push(pk.name || pk.id); } }
    if (badNames.length) recoveryDisclosure = badNames;
  }
  if (excluded.has(activeRoute.id)) return null; // the open route's own definition cannot be carried - no honest recovery file exists, and shareRecovery's unavailable message is the truthful result
  const routes = {}; routes[activeRoute.id] = data;
  for (const pk of ROUTE_PACKS) { if (pk.id === activeRoute.id || excluded.has(pk.id)) continue; const rk = routeKeys(pk.id); const d = {}; for (const f of ROUTE_FIELDS) { const v = rawRead(rk[f]); if (v !== RAW_READ_FAILED && v != null) d[f] = v; } if (d.start === undefined) d.start = null;
    if (d.start) { const rawSnap = rawRead(rk.snap); if (rawSnap !== RAW_READ_FAILED && rawSnap != null) { const pv = validateSnap(parseJ(rawSnap, null), +d.start, packGeometry(pk)); if (pv) d.snap = JSON.stringify({ at: +d.start, pieces: pv.pieces, pieceTimes: pv.pieceTimes, done: pv.done, times: pv.times, via: pv.via, cov: pv.cov }); } } // Beta 1.142 (Package B, DA-08): a non-active RUNNING route's cancel snapshot rides the recovery file too, validated against its own geometry and normalized exactly as the normal backup carries it (1.97) - pre-1.142 recovery copied ROUTE_FIELDS only, so a run restored from a recovery file lost its exact Cancel. Recovery stays best-effort: a snapshot read that fails simply leaves it out.
    if (Object.keys(d).length) routes[pk.id] = d; } // Beta 1.97 (audit loop CG-196-01): an untouched pack in a recovery file asserts idle like any complete backup
  const o = { app: 'snowroute-backup', v: 2, recovery: true, at: new Date().toISOString(), routes };
  if (upsCarry && Object.keys(upsCarry).length) o.userpacks = upsCarry; // Beta 1.118: created-route definitions ride the recovery backup too. Beta 1.142: from the strict record read, or from validated memory when the record cannot be read (DA-09)
  { const nt = rawRead(LS_GLOBAL.night); if (nt !== RAW_READ_FAILED) { if (nt != null) o.night = nt; const ne = rawRead(LS_GLOBAL.nightExp); if (ne !== RAW_READ_FAILED && ne != null) o.nightExp = ne; } } // the pair keeps its pre-1.136 one-try shape (Codex verify, 1.136 fix cycle): a FAILED night read skips the nightExp read entirely - the two values travel together, so a recovery file never carries an expiry whose override failed to read
  o.settings = JSON.stringify({ vib: settings.vib, chime: settings.chime, chimeSound: settings.chimeSound }); // Beta 1.166: the Settings toggles ride the recovery file too - from the LIVE settings object (this export never reads the board from storage, and the toggles are no different), serialized in exactly the record shape saveSettings writes, so a restore validates and lands it identically to a normal backup's
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
  const setFor = id => { const p = (restoreOverlayPacks ? restoreOverlayPacks[id] : null) || ROUTE_PACKS.find(x => x.id === id); return p ? new Set(Object.keys(p.roads || {})) : new Set(); }; // Beta 1.118: a route whose definition rides THIS backup (restoreOverlayPacks) is known too. Beta 1.142 (Package B, DA-01): the backup's own definition wins the lookup - a replaced route's names are judged against the streets it is about to have, not the ones it had
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
function canonicalSettings(raw) { // Beta 1.166: the one validator for a backup's settings field - loadSettings' own rules (app1) applied to the candidate and re-serialized canonically, so what a restore writes is exactly what a load would have made of it. Returns the canonical record string, or null when the value is not a settings record at all (a string holding a JSON object); individual field VALUES sanitize exactly as the loader sanitizes them - an unknown chime sound falls back to the default rather than refusing the whole restore
  if (typeof raw !== 'string') return null;
  let p; try { p = JSON.parse(raw); } catch (e) { return null; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  return JSON.stringify({ vib: typeof p.vib === 'boolean' ? p.vib : SETTINGS_DEF.vib, chime: typeof p.chime === 'boolean' ? p.chime : SETTINGS_DEF.chime, chimeSound: CHIME_KEYS.includes(p.chimeSound) ? p.chimeSound : SETTINGS_DEF.chimeSound });
}
let restoreOverlayPacks = null; // Beta 1.118: during restoreBackup, the validated created-route definitions carried by the backup itself - visible to countUnknownNames and the route lookups so a route restored WITH its definition is never reported (or rejected) as unknown
async function restoreBackup(parsed) { // production doRestore semantics: validate EVERYTHING before writing; snapshot; write + verify each; verified rollback on any failure. Beta 1.166: ASYNC - a backup carrying created-route definitions now writes them to the IndexedDB store (per-route verified puts, phase 1 below) ahead of the localStorage write set, with the store's own strict snapshot + rollback alongside the record one; every refusal and rollback keeps the validate-then-write order this function has always kept
  if (!parsed || parsed.app !== 'snowroute-backup') { toast('That is not a Snow Route backup', 3200); return; }
  const FIELD_SHAPES = { done: 'arr', times: 'obj', hist: 'arr', notes: 'obj', via: 'obj', trail: 'arr', cov: 'obj', sides: 'obj', sess: 'arr' };
  const entries = []; // [targetKey, value]
  const pushField = (targetKey, field, v, label, nameSet) => {
    if (typeof v !== 'string') { toast('Backup has a bad value for ' + label + ' — nothing was changed', 3200); return false; }
    if (field === 'start') { // Beta 1.150 (security-audit fix round, finding restore-start-scalar-unvalidated): the run-start has no FIELD_SHAPES entry, so its check is semantic, not a shape - the storage contract makes it an epoch-ms digit string, and the loader range-bounds every other epoch it accepts (946684800..4102444800 s), so the restore accepts exactly that band in milliseconds. A crafted '1' used to be committed verbatim through this verified write set and coerced by the loader into a phantom run whose Cancel wiped the route
      if (!/^\d+$/.test(v) || !isFinite(+v) || +v < 946684800000 || +v > 4102444800000) { toast('Backup has a bad value for ' + label + ' — nothing was changed', 3200); return false; }
    }
    if (field === 'night' && v !== '0' && v !== '1') { toast('Backup has a bad value for ' + label + ' — nothing was changed', 3200); return false; } // Beta 1.150: night rode the same unchecked path - its writer (setThemeOverride) stores only the enum '0'/'1'. Its pair nightExp was already validated (1.92 F01) and both keys already land in this one verified write set with rollback, so the pair stays atomic; only the enum was missing
    const shape = FIELD_SHAPES[field];
    if (shape) {
      let pv; try { pv = JSON.parse(v); } catch (e) { toast('Backup value for ' + label + ' is not valid JSON — nothing was changed', 3200); return false; }
      if (field === 'done' && pv && typeof pv === 'object' && !Array.isArray(pv)) {
        v = JSON.stringify(Object.keys(pv).filter(nm => pv[nm] && (nameSet || STREETSET).has(nm))); // legacy done-set was a street->time map; migrate like the loader does. Beta 1.117 (F6): filtered against the TARGET route's names (nameSet), not the open route's
      } else if (shape === 'arr' ? !Array.isArray(pv) : !(pv && typeof pv === 'object' && !Array.isArray(pv))) { toast('Backup value for ' + label + ' has the wrong shape — nothing was changed', 3200); return false; }
      if ((field === 'trail' || field === 'sess') && Array.isArray(pv) && pv.length > TRAIL_MAX) { // Beta 1.152 (NV round, NV4): the writers' caps, enforced inside restore validation (validate-then-write: the STORED value is the capped one, so no backup can hand the load an oversized array). Only crafted backups are affected - a genuine backup never exceeds the caps its writers enforce. Beta 1.167 (B1): history is NO LONGER capped here - the writers (appendHistory at finish/save) and the loader dropped the 10-clean cap together, so a backup's history is stored whole; the trail and the session markers keep their newest entries, as their writers keep them. Markers are first given the loader's own sanitize (finite, de-duplicated, sorted) so the stored value is exactly what the load would have made of it, capped.
        if (field === 'trail') v = JSON.stringify(pv.slice(pv.length - TRAIL_MAX));
        else { const cs = [...new Set(pv.map(x => Number(x)).filter(x => Number.isFinite(x)))].sort((a, b) => a - b); v = JSON.stringify(cs.slice(Math.max(0, cs.length - TRAIL_MAX))); }
      }
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
      allPacks = ROUTE_PACKS.filter(p => !restoredPacks[p.id]).concat(Object.values(restoredPacks)); // Beta 1.142 (Package B, DA-01): ONE entry per route id, the INCOMING definition in it - everything below that iterates allPacks (session clearing, derived sides, the rollback scope) must see the definition this backup installs, never a duplicate of the one it replaces
    }
    for (const id of Object.keys(parsed.routes)) {
      const pack = (restoredPacks ? restoredPacks[id] : null) || ROUTE_PACKS.find(p => p.id === id); if (!pack) { toast('Backup mentions an unknown route (' + id + ') — nothing was changed', 3200); return; } // Beta 1.118: a route whose definition rides this same backup is known. Beta 1.142 (Package B, DA-01): the incoming definition is judged FIRST - pre-1.142 the existing pack won this lookup, so a replaced route's name filter and snapshot validation ran against its OLD geometry while the new definition was installed underneath them
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
    if (parsed.settings !== undefined) { const cs = canonicalSettings(parsed.settings); if (cs === null) { toast('Backup has a bad settings value — nothing was changed', 3200); return; } entries.push([SETTINGS_KEY, cs]); } // Beta 1.166: the Settings toggles restore inside this same verified write set (SETTINGS_KEY joins the rollback scope unconditionally below, like the night pair, so a failed restore puts the device's toggles back too). A backup WITHOUT the field - every backup written before 1.166 - leaves the device's settings untouched: the missing-key rule, as always
  } else if (parsed.v === 1) { // Beta 1.76: a v1 backup is the pre-routes format - its data map (keyed by the legacy storage names) belongs to Route 5W and lands in the 5W slot
    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) { toast('That is not a Snow Route backup', 3200); return; }
    const rk5 = routeKeys('5w');
    const pack5 = ROUTE_PACKS.find(p => p.id === '5w'); const pg5 = pack5 ? packGeometry(pack5) : null; // Beta 1.117 (F6): a v1 backup's names filter against the 5W pack's own set
    for (const f of ROUTE_FIELDS) { const lv = parsed.data[LEGACY_KEYS[f]]; if (lv === undefined) continue; if (!pushField(rk5[f], f, lv, 'Route 5W ' + f, pg5 ? pg5.set : null)) return; }
    if (parsed.data['snowroute.v2.night'] !== undefined && !pushField(LS_GLOBAL.night, 'night', parsed.data['snowroute.v2.night'], 'night')) return;
  } else { toast('Unsupported backup version (' + String(parsed.v) + ') — nothing was changed', 3200); return; }
  let packPriors = null; // Beta 1.166: the store values a geometry-carrying restore is about to overwrite, snapshotted STRICTLY before anything is written - the store phase's rollback material, and the DA-05 strict gate re-seated: a route whose current definition cannot be read refuses the restore here, before a single write, instead of being silently overwritten (1.142's merge-base refusal, carried to the definitions' new home)
  if (restoredPacks) {
    packPriors = {};
    for (const rid of Object.keys(restoredPacks)) { const cur = await upGet(rid); if (cur === UP_READ_FAILED) { toast('Restore stopped — your created-routes store could not be read, so nothing was changed', 3600); return; } packPriors[rid] = cur; }
    const legacy = readUserPacks(); // a not-yet-drained legacy record still SHADOWS the store at boot for the ids it holds (create-packs.js: the legacy copy wins per id while it stands), so a restored id must leave the legacy record too, inside this same verified write set - and a legacy record that cannot be read refuses the restore for the same DA-05 reason its merge base once did
    if (legacy === null) { toast('Restore stopped — your created-routes record could not be read, so nothing was changed', 3600); return; }
    if (Object.keys(legacy).some(rid => rid in restoredPacks)) { const shadow = { ...legacy }; for (const rid of Object.keys(restoredPacks)) delete shadow[rid]; entries.push([USERPACKS_KEY, Object.keys(shadow).length ? JSON.stringify(shadow) : null]); }
  } // Beta 1.166: the definitions themselves land in the IndexedDB store as per-route verified writes (phase 1 of the write stage below, ahead of the localStorage write set). A restore adds/updates routes - it does not delete ones the backup predates: the store keeps every id this backup does not carry, and packPriors covers exactly the ids it overwrites. The reload that ends every restore re-registers the definitions at boot before their state is read
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
  for (const rid of (parsed.v === 2 ? Object.keys(parsed.routes) : ['5w'])) entries.push([routeKeys(rid).finclean, null]); // Beta 1.150 (security-audit fix round, needs-validation record restore-finclean-discharge-outside-transaction - settled CONFIRMED by fault injection, drive176): the finish-cleanup discharge joins the VERIFIED write set as a null (verified-delete) entry, and the rollback scope below gains the finclean keys. Pre-1.150 a bare lsDel after the commit loop discarded its result: a refused delete left the obligation armed over just-restored data, the restore reported success, and the next load's cleanup wiped the restored notes/coverage. A failed discharge now fails the restore with a rollback, like every other write here
  restoreOverlayPacks = restoredPacks; const droppedNames = countUnknownNames(parsed); restoreOverlayPacks = null; // Beta 1.95 (SR-194-08): counted from the RAW backup before any normalization - see countUnknownNames. Beta 1.118: judged with this backup's own created-route definitions overlaid
  if (!entries.length) { toast('Nothing in that backup to restore', 3000); return; }
  const SCOPE = []; for (const p of allPacks) SCOPE.push(...slotKeys(p.id)); if (restoredPacks) SCOPE.push(USERPACKS_KEY); SCOPE.push(LS_GLOBAL.night, LS_GLOBAL.nightExp, SETTINGS_KEY); for (const p of allPacks) SCOPE.push(routeKeys(p.id).finclean); // Beta 1.166: SETTINGS_KEY joins the scope unconditionally (SETTINGS_DEF's home record) - a restore that writes the toggles must be able to put the device's own back, and one that does not write them snapshots-and-restores them to themselves, a no-op // Beta 1.150: the finclean keys join the rollback scope - a restore that discharges an obligation must be able to put the armed record back when a later write fails // Beta 1.136: the per-route keys come from slotKeys (app1) - the same ROUTE_FIELDS + snap list, enumerated in one place // Beta 1.118: the created-routes record and restored routes' slots join the rollback scope // Beta 1.96 (SR-195-02): the snapshot key joins the rollback scope - a restore that writes a carried snapshot must be able to put the previous one back
  const snap = {}; let snapOk = true;
  for (const k of SCOPE) { const v = rawRead(k); if (v === RAW_READ_FAILED) snapOk = false; else snap[k] = v; }
  if (!snapOk) { toast('Restore stopped — your current data could not be read for safekeeping, so nothing was changed', 3600); return; }
  const rollback = () => { // Beta 1.102 (Phase 4, C3): the restore-all rollback on the verified primitives - every scoped key put back (or removed) and read back
    let okBack = true;
    for (const k of SCOPE) { const r = snap[k] === null ? txDel(k) : txSet(k, snap[k]); if (!r.ok) okBack = false; }
    return okBack;
  };
  const rollbackPacks = async () => { // Beta 1.166: the store phase's rollback - every overwritten route put back to its strict snapshot (or deleted again, when this restore introduced it), each undoing write verified like the write it undoes
    let okBack = true;
    for (const rid of Object.keys(packPriors)) { const r = packPriors[rid] === null ? await upDel(rid) : await upPut(rid, packPriors[rid]); if (!r) okBack = false; }
    return okBack;
  };
  if (restoredPacks) { // Beta 1.166, phase 1: the geometry writes land FIRST, while nothing else has been written - a failure here has only the store to put back, and the localStorage state is still exactly what the snapshot below describes
    let packFail = null;
    for (const rid of Object.keys(restoredPacks)) { if (!(await upPut(rid, restoredPacks[rid]))) { packFail = rid; break; } }
    if (packFail) {
      if (await rollbackPacks()) toast('Restore failed while saving the created route (' + packFail + ') — your current data was put back, nothing was changed', 3800);
      else toast('Restore failed while saving the created route (' + packFail + ') — and your previous data could NOT be fully put back. Restore from a known-good backup', 4200);
      return;
    }
  }
  for (const pair of entries) {
    const k = pair[0], v = pair[1];
    const wr = v === null ? txDel(k) : txSet(k, v); // Beta 1.97 (CG-196-01) + 1.102 (Phase 4): a null entry is a DELETE (the idle assertion) - every entry written and verified by the same primitives
    if (!wr.ok) {
      const lsOk = rollback(); const pkOk = restoredPacks ? await rollbackPacks() : true; // Beta 1.166: a localStorage failure after phase 1 rolls BOTH homes back - the result message only claims "put back" when both verifiably are
      if (lsOk && pkOk) toast('Restore failed while writing ' + k + ' \u2014 your current data was put back, nothing was changed', 3800);
      else toast('Restore failed while writing ' + k + ' \u2014 and your previous data could NOT be fully put back. Restore from a known-good backup', 4200);
      return;
    }
  }
  if (restoredPacks) for (const rid of Object.keys(restoredPacks)) userPackCache[rid] = restoredPacks[rid]; // Beta 1.166: the backup picture joins the commit - the reload follows immediately, but the cache must never describe a store state that was rolled back or never written
  // Beta 1.141 (Package A, DA-10) discharge note: the finish-cleanup discharge itself moved INTO the verified write set above in Beta 1.150 (see the finclean entries) - the 1.141 rule stands unchanged (a restore discharges the obligations of exactly the routes it rewrites; an omitted route's obligation stays armed), only its mechanism is now verified like every other write in this function
  restoring = true; markClean('trail'); markClean('aux'); markClean('sess'); // the reload's pagehide flush must not write the old in-memory trail/coverage over the restored data
  toast('Backup restored — reloading' + (droppedNames ? ' · ' + droppedNames + ' unknown street name' + (droppedNames === 1 ? '' : 's') + ' in the backup were ignored' : '') + (snapDropped ? ' · the saved start snapshot was not usable, so Cancel will rebuild from the marks made during the run' : ''), snapDropped ? 4600 : undefined); // Beta 1.94 (audit F-05): the drop count is part of the result, not a silent loader detail. Beta 1.96 (SR-195-02): a dropped start snapshot is reported the same way
  setTimeout(() => location.reload(), 600);
}
let restoreInFlight = false; // Beta 1.170 (Carbon fix round Phase 2, C-09): single-flight for the restore door, same shape as preloadRunning below - restoreBackup is ASYNC (its created-route store writes await), so through 1.169 a second tap, or a file pick landing while a paste restore ran, started a competing restore whose pre-write snapshot could capture the first restore's half-written state
function doRestore() {
  if (restoreInFlight) return;
  let parsed;
  try { parsed = JSON.parse($('xText').value); } catch (e) { toast('That is not a valid backup — paste the whole backup text', 3200); return; }
  restoreInFlight = true;
  Promise.resolve(restoreBackup(parsed)).catch(() => {}).finally(() => { restoreInFlight = false; }); // restoreBackup reports its own refusals by contract and is not expected to throw; the catch is belt-and-braces so the flag can never wedge the door shut
}
$('xImp').addEventListener('click', () => doRestore());

// ===== PRELOAD (offline route maps) =====
function tileNums(lng, lat, z) { const n = 2 ** z; const x = Math.floor((lng + 180) / 360 * n); const la = lat * Math.PI / 180; const y = Math.floor((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n); return [x, y]; }
let preloadRunning = false; // Beta 1.92 (deep audit F07): single-flight - a second tap while a download runs starts no competing job
function packTileUrls(pk) { // Beta 1.117 (F5): the TILE urls attributable to ONE pack - its offline area (pack.box; a pack without one falls back to its own roads' bounds) at z8-14 plus its z15 route core. Sprites and glyphs are shared chrome, attributable to no route. preloadUrlList unions this over every known pack; the per-route preload record counts against it.
  // Beta 1.152 (NV round, NV3b): the enumeration itself is budgeted - PACK_TILES_MAX tile iterations for this pack, each zoom's span counted BEFORE its loop runs and the zoom skipped whole when it does not fit. normalizePack's extent ceiling (NV3a) rejects such a pack at every import path, but a pack record planted straight into storage never passes through the validator, and this function runs at every boot that carries a preload record: a worldwide box is ~356.8M iterations per source and never returned (measured). Under the budget the output is identical to the unbudgeted enumeration - proven against the frozen 897-URL fixture by tests/browser/selftest-nv1152.mjs.
  const urls = new Set();
  let budget = PACK_TILES_MAX;
  for (const key of ['day', 'night']) {
    const stj = GL_STYLES[key];
    for (const srcName of Object.keys(stj.sources || {})) {
      const src = stj.sources[srcName];
      if (src.type !== 'vector' || !src.tiles) continue;
      const maxz = Math.min(14, src.maxzoom || 14);
      const ex = pk.box || computeRouteBox(pk.roads || {});
      // tile y grows SOUTHWARD: the north edge (y1) is the smaller number - looping y0..y1 (the pre-1.34 code) silently downloaded ZERO tiles; drive123 A8 counts the fetched tile URLs so this can never pass unnoticed again
      // Beta 1.72 (Phase 3, item R04): the wide zooms join the set - the map itself allows zoom 8 (minZoom), but the preload stopped at z10, so offline at z8-9 the basemap had nothing to draw. Over the Vaughan box those zooms are 3 tiles (1 + 2).
      if (ex) for (let z = 8; z <= maxz; z++) { const [x0, y1] = tileNums(ex.w, ex.n, z); const [x1, y0] = tileNums(ex.e, ex.s, z); const span = (x1 - x0 + 1) * (y0 - y1 + 1) * src.tiles.length; if (!(span <= budget)) continue; budget -= Math.max(0, span); for (let x = x0; x <= x1; x++) for (let y = y1; y <= y0; y++) for (const t of src.tiles) urls.add(t.replace('{z}', z).replace('{x}', x).replace('{y}', y)); }
      // Beta 1.41: display zooms 15-19 all render from z15 tiles (the source's maxzoom) - yet the set above stops at 14, so the working zoom band was the LEAST cached. Add z15 over the route core only (the pack's own roads bounds + margin, so it cannot drift): 15 tiles for 5W. z15 over the whole Vaughan box would be ~1,400 files for streets he never opens.
      if ((src.maxzoom || 14) >= 15) { const rb = computeRouteBox(pk.roads || {}); if (rb) { const cb = { w: rb.w - 0.005, s: rb.s - 0.004, e: rb.e + 0.005, n: rb.n + 0.004 }; const [cx0, cy1] = tileNums(cb.w, cb.n, 15); const [cx1, cy0] = tileNums(cb.e, cb.s, 15); const span15 = (cx1 - cx0 + 1) * (cy0 - cy1 + 1) * src.tiles.length; if (span15 <= budget) { budget -= Math.max(0, span15); for (let x = cx0; x <= cx1; x++) for (let y = cy1; y <= cy0; y++) for (const t of src.tiles) urls.add(t.replace('{z}', 15).replace('{x}', x).replace('{y}', y)); } } }
    }
  }
  return urls;
}
function preloadUrlList() { // Beta 1.95 (deep audit SR-194-06): the deterministic preload set, extracted from the download handler so the offline-pack migration below derives its manifest from the SAME list - one source of truth, the two can never drift apart. Beta 1.117 (F5): the tile part is the UNION over every pack the app knows (each pack's area + core, the packTileUrls enumeration inlined per source so the list's ORDER - and therefore the pack fingerprint the offline contract pins - is unchanged from the single-pack era). With only Route 5W shipped the list is exactly the frozen 897: the 5W pack's box IS the Beta 1.34 Vaughan box (Vaughan + nearby at full street detail; day and night are two skins over these SAME tiles, so this one set covers both modes). It reads PACK data only, never the live route, so it is identical before any route is chosen.
  const urls = new Set();
  const budgets = new Map(); // Beta 1.152 (NV round, NV3b): the per-pack tile budget (see packTileUrls) - this enumeration nests style > source > pack, so each pack's remaining budget travels in a Map keyed by the pack object; the semantics are identical.
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
        let budget = budgets.get(pk) ?? PACK_TILES_MAX;
        if (ex) for (let z = 8; z <= maxz; z++) { const [x0, y1] = tileNums(ex.w, ex.n, z); const [x1, y0] = tileNums(ex.e, ex.s, z); const span = (x1 - x0 + 1) * (y0 - y1 + 1) * src.tiles.length; if (!(span <= budget)) continue; budget -= Math.max(0, span); for (let x = x0; x <= x1; x++) for (let y = y1; y <= y0; y++) for (const t of src.tiles) urls.add(t.replace('{z}', z).replace('{x}', x).replace('{y}', y)); }
        // Beta 1.41: display zooms 15-19 all render from z15 tiles (the source's maxzoom) - yet the set above stops at 14, so the working zoom band was the LEAST cached. Add z15 over the route core only (the pack's own roads bounds + margin, derived from the pack's own data so it cannot drift): 15 tiles for 5W. z15 over the whole Vaughan box would be ~1,400 files for streets he never opens.
        if ((src.maxzoom || 14) >= 15) { const rb = computeRouteBox(pk.roads || {}); if (rb) { const cb = { w: rb.w - 0.005, s: rb.s - 0.004, e: rb.e + 0.005, n: rb.n + 0.004 }; const [cx0, cy1] = tileNums(cb.w, cb.n, 15); const [cx1, cy0] = tileNums(cb.e, cb.s, 15); const span15 = (cx1 - cx0 + 1) * (cy0 - cy1 + 1) * src.tiles.length; if (span15 <= budget) { budget -= Math.max(0, span15); for (let x = cx0; x <= cx1; x++) for (let y = cy1; y <= cy0; y++) for (const t of src.tiles) urls.add(t.replace('{z}', 15).replace('{x}', x).replace('{y}', y)); } } }
        budgets.set(pk, budget);
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
    const paint = () => { fill.style.width = (list.length ? shown / list.length * 100 : 0) + '%'; st.textContent = 'Downloading… ' + (list.length ? Math.round(shown / list.length * 100) : 0) + '%'; }; // Beta 1.176 (Andrew's standing rule): a loading readout shows a percentage, never a count - the line now reads the same fraction the bar already painted (the sweep still eases the shown value toward the true one, so the percentage sweeps exactly as the count did). The job's COMPLETION line below ('saved X of Y files') is an outcome report, not a readout, and keeps its counts
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
function parseVerLabel(s) { const m = typeof s === 'string' ? s.trim().match(/^Beta (\d+)\.(\d+)$/) : null; return m ? [Number(m[1]), Number(m[2])] : null; } // Beta 1.150 (security-audit fix round): the version ordering the update check compares by - two numeric components, nothing else parses
$('updBtn').addEventListener('click', async () => {
  if (!tapGuard('updBtn')) return;
  toast('Checking for a newer version…');
  try {
    if (navigator.serviceWorker) { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); }
    const r = await fetch(location.pathname + '?updprobe=1&v=' + Date.now(), { cache: 'no-store' }); // Beta 1.150 (finding update-check-reports-cached-copy-as-server-copy): the probe carries the updprobe marker and the worker answers it with the network itself or a network error, NEVER its cached shell (src/sw.js) - pre-1.150 this fetch went through netFirst, which substitutes the cached shell on any error status, rejection or stall, so a server answering 503 still produced 'Up to date' from the cache
    if (!r.ok) { updState = 'fail'; toast('Could not check for updates — the server answered with an error (' + r.status + '). Nothing was changed', 3400); return; }
    const html = await r.text();
    const m = html.match(/id="ver">([^<]+)</);
    const served = m && m[1].trim();
    const mine = $('ver').textContent.trim();
    if (!served) { updState = 'fail'; toast('Could not check for updates — the server copy could not be read. Nothing was changed', 3400); return; }
    if (served === mine) { updState = 'ok'; toast('✓ Up to date (' + mine + ')', 2800); return; }
    const sv = parseVerLabel(served), mv = parseVerLabel(mine); // Beta 1.150 (finding update-check-treats-any-difference-as-newer): a difference is an update only when it is strictly NEWER - an older server build is a fact to report, never a version to install, and an unparseable label cannot be ordered so it is never installed on a guess
    if (sv && mv) {
      if (sv[0] < mv[0] || (sv[0] === mv[0] && sv[1] < mv[1])) { updState = 'older'; toast('The server is serving an older version (' + served + ') — this copy (' + mine + ') was kept', 3600); return; }
      updState = 'avail';
      toast('New version found — reloading…', 2600);
      setTimeout(() => location.replace(location.pathname + '?v=' + Date.now()), 900);
      return;
    }
    updState = 'diff'; toast('The server is serving a different version (' + served + ') — this copy (' + mine + ') was kept', 3600);
  } catch (e) { updState = 'fail'; toast('Could not check for updates — the server did not answer. Nothing was changed', 3400); } // Beta 1.150: a failed check is reported as a failed check - the pre-1.150 catch reloaded 'to be safe', which could only land on the same cached shell the probe just failed to get past
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
$('setBack').addEventListener('click', () => { const onBackup = $('setBackupPane').classList.contains('on'); if (onBackup && xMode === 'text') showX('restore'); else if (onBackup && xMode === 'restore') showX('menu'); else showSetPane('setMainPane'); }); // Beta 1.89: one Back walks the backup tree up a level at a time; from the backup menu it lands on the settings main pane. Beta 1.170 (Carbon fix round Phase 2, C-06): the xMode walk belongs to the BACKUP pane alone - through 1.169 it ran wherever Back was pressed, so with xMode left at 'text'/'restore' by an earlier Backup visit, Back on any other Settings pane reset the hidden Backup view instead of returning to the main pane.
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
  const disc = (recoveryDisclosure && recoveryDisclosure.length) ? ' · WARNING: the definition for ' + recoveryDisclosure.join(', ') + ' could not be carried, so that route is NOT in this file' : ''; // Beta 1.142 (Package B, DA-09): an excluded route is named in the result - the file is honest about what it lacks
  let f = null; try { f = new File([b], 'snowroute-recovery.json', { type: 'application/json' }); } catch (e) { /* older engine: the text share below still works */ }
  if (f && navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); noteExported(); toast((viaFallback ? 'Backup could not be saved — recovery backup shared instead: ' : 'Recovery backup shared — ') + 'the open route is the live on-screen state, not fully saved on this device; other routes are included as last saved' + disc, 4200); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  if (navigator.share) { try { await navigator.share({ text: b }); noteExported(); toast((viaFallback ? 'Backup could not be saved — recovery backup shared instead: ' : 'Recovery backup shared — ') + 'the open route is the live on-screen state, not fully saved on this device; other routes are included as last saved' + disc, 4200); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  dl(new Blob([b], { type: 'application/json' }), 'snowroute-recovery.json'); noteExported(); toast((viaFallback ? 'Backup could not be saved — recovery backup downloaded instead: ' : 'Recovery backup downloaded — ') + 'the open route is the live on-screen state, not fully saved on this device; other routes are included as last saved' + disc, 4200); // Beta 1.96 (audit-2, N-5b): the wording distinguishes what the file actually holds - the ACTIVE route is serialized from live memory; any other route pack in the same file is read from storage, as last saved
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
$('swAwake').addEventListener('click', () => { const prevAwake = settings.awake; settings.awake = !settings.awake; if (!saveSettings()) { settings.awake = prevAwake; toast('Not saved — storage problem'); } renderSwitch($('swAwake'), settings.awake); if (settings.awake !== prevAwake) syncWake(); }); // syncWake applies the new gate at once: ON mid-run requests the lock, OFF (or a run ending) releases it; an absent WakeLock API makes the request a silent no-op while the toggle still saves (app3). Beta 1.170 (Carbon fix round Phase 2, C-02): the Beta 1.113 save-honesty contract applied to the one Settings switch that skipped it - through 1.169 a failed save still flipped the switch and synced the wake lock on a value storage never took; a failure now reverts the value and toasts, and syncWake runs only when the value actually changed. The awake value itself stays session-only by design (Beta 1.112); this is failure-surfacing only, and saveSettings is still the write the handler owes its answer to.
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
async function packState() { // how much of the deterministic manifest (preloadUrlList - the same list the download writes and the pack migration certifies) is actually in the pack cache right now; falls back to the preload record when the cache census cannot run. Beta 1.170 (Carbon fix round Phase 2, C-04): the result also carries per-route counts - the manifest is a UNION over routes, and Status used to label the union total as the active route's alone
  const list = preloadUrlList(); const total = list.length;
  let cached = -1;
  let haveSet = null;
  try {
    if ('caches' in window) {
      const oc = await caches.open('snowroute-offline-v1');
      const have = new Set((await oc.keys()).map(r => r.url));
      haveSet = have;
      cached = 0;
      for (const u of list) { let href = u; try { href = new URL(u).href; } catch (e) {} if (have.has(href)) cached++; }
    }
  } catch (e) { cached = -1; }
  if (cached < 0) { const rec = parseJ(lsGet(LS.pre), null); cached = rec ? Math.min(total, rec.saved || 0) : 0; }
  const countsByRoute = ROUTE_PACKS.map(pk => { const sub = packTileUrls(pk); let c = 0; // a route's own share: its tile list against the same census (chrome - styles, sprites, glyphs - belongs to no route and stays union-only); on the census-failure path, the route's own stored download record stands in, in the same spirit as the union fallback above
    if (haveSet) { for (const u of sub) { let href = u; try { href = new URL(u).href; } catch (e) {} if (haveSet.has(href)) c++; } }
    else { const rec = parseJ(lsGet(routeKeys(pk.id).pre), null); c = rec ? Math.min(sub.size, rec.routeSaved || 0) : 0; }
    return { id: pk.id, name: pk.name, total: sub.size, cached: c }; });
  return { total, cached, complete: total > 0 && cached >= total, countsByRoute };
}
function setHealth(icoId, valId, state, text) { // state: 'ok' green tick / 'warn' amber warning / 'idle' neutral dash - honesty over decoration: a state that is merely unknown is never painted green
  const ico = $(icoId);
  ico.textContent = state === 'ok' ? '✓' : state === 'warn' ? '⚠' : '–';
  ico.className = 'm-chk' + (state === 'warn' ? ' warn' : state === 'idle' ? ' idle' : '');
  $(valId).textContent = '— ' + text;
}
async function renderStatus(resetStat) {
  const ps = await packState();
  const multiRoute = ROUTE_PACKS.length > 1; // Beta 1.170 (C-04): the counts above are the UNION over every route - the label says so when there is more than one route to union over; the single-route label is unchanged
  const area = multiRoute ? ROUTE_PACKS.length + ' routes' : ((activeRoute ? activeRoute.name : 'Route') + ' area');
  if (ps.complete) { $('stMapsLine').innerHTML = 'Offline maps: Downloaded <span class="m-tick">&#10003;</span>'; $('stMapsSub').textContent = ps.total + ' files · ' + area; }
  else if (ps.cached > 0) { $('stMapsLine').textContent = 'Offline maps: Partial'; $('stMapsSub').textContent = ps.cached + ' of ' + ps.total + ' files · ' + area; }
  else { $('stMapsLine').textContent = 'Offline maps: Not downloaded'; $('stMapsSub').textContent = ps.total + ' files · ' + area; }
  if (multiRoute) { const act = ps.countsByRoute.find(r => activeRoute && r.id === activeRoute.id); if (act) $('stMapsSub').textContent += ' · this route: ' + act.cached + ' of ' + act.total; } // the active route's own share, named as its own - never the union wearing its name
  $('xPre').textContent = ps.complete ? 'Re-download' : 'Download';
  $('stDel').style.display = ps.cached > 0 ? '' : 'none';
  if (resetStat && !preloadRunning) { const rec = parseJ(lsGet(LS.pre), null) || ROUTE_PACKS.map(p => parseJ(lsGet(routeKeys(p.id).pre), null)).find(r => r && r.saved > 0) || null; $('xPreStat').textContent = rec ? 'Offline maps downloaded ' + new Date(rec.at).toLocaleDateString() + ' (' + rec.saved + ' files)' : 'Offline maps not downloaded yet — download for offline use.'; $('xPreBar').classList.remove('on'); $('xPreFill').style.width = '0%'; } // the bar/stat belong to a live download - landing on Status with none running starts them clean (the 1.87 reset, re-homed with the elements). Beta 1.170 (C-04): the record read falls back to ANY route's download record - through 1.169 it read only the active route's slot, so right after a route switch this line could say 'not downloaded yet' directly under a 'Downloaded' maps line for the pack another route had fetched
  // HEALTH - each row from a real signal at this moment:
  let storageOk = false;
  try { storageOk = lsSet('snowroute.v2.healthprobe', '1') && lsGet('snowroute.v2.healthprobe') === '1'; lsDel('snowroute.v2.healthprobe'); } catch (e) { storageOk = false; } // a scratch-key write + read-back + delete - the same guarded helpers every save uses
  setHealth('stIcoStorage', 'stValStorage', storageOk ? 'ok' : 'warn', storageOk ? 'saving normally' : 'storage problem — export a backup');
  setHealth('stIcoMaps', 'stValMaps', ps.complete ? 'ok' : 'warn', ps.complete ? 'complete' : ps.cached > 0 ? 'partial — ' + ps.cached + ' of ' + ps.total : 'not downloaded');
  if (updState === 'ok') setHealth('stIcoVer', 'stValVer', 'ok', 'up to date (' + $('ver').textContent.trim() + ')');
  else if (updState === 'avail') setHealth('stIcoVer', 'stValVer', 'warn', 'update available');
  else if (updState === 'fail') setHealth('stIcoVer', 'stValVer', 'warn', 'could not check — the server did not answer');
  else if (updState === 'older') setHealth('stIcoVer', 'stValVer', 'warn', 'the server has an older version');
  else if (updState === 'diff') setHealth('stIcoVer', 'stValVer', 'warn', 'the server has a different version');
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
  v: 'Beta 1.181', items: ["Every road on the map is drawn half again as wide — your route streets and all the other streets too — so the coloured roads, finished sides and the selection glow are easier to see and tap. Your routes and saved progress are unchanged."] };
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
  if (anySheet && !e.target.closest('.sheet') && !e.target.closest('#hud') && !e.target.closest('.modal')) { closeSheets(); spendTap(400); } // Beta 1.30 (Andrew): the closing tap is spent here - the map never sees it
  // The two banners count as menus too (Andrew: ANY menu): a tap outside one is its Dismiss / Keep going.
  if (!$('suggest').classList.contains('hidden') && !e.target.closest('#suggest')) { $('suggest').classList.add('hidden'); spendTap(400); }
  if (!$('stale').classList.contains('hidden') && !e.target.closest('#stale')) { $('stale').classList.add('hidden'); spendTap(400); }
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
function anyPreloadRecord() { // Beta 1.170 (Carbon fix round Phase 2, C-03): was a pack EVER downloaded on this device, under ANY route? The two callers below used to read only the ACTIVE route's preload record (LS names whichever route is active - at boot, the eval-time default), so a pack downloaded under another route alone never earned its migration/heal pass. Every route's own record is the honest test; the manifest migratePack heals against is already the union over all packs (preloadUrlList).
  return ROUTE_PACKS.some(p => !!parseJ(lsGet(routeKeys(p.id).pre), null));
}
async function migratePack() { // Beta 1.95 (deep audit SR-194-05/06): the one-time move of a pre-1.94 pack from the browsing cache into the protected pack cache, under an honest contract. 1.94 copied EVERY browsing-cache key (any stray the map had ever fetched came along) through per-file catch-alls, then set the completion flag unconditionally - a partial copy was marked complete and never retried. Now: only the deterministic preload manifest (preloadUrlList) is migrated; non-manifest entries already in the pack cache are pruned, so the pack is exactly the manifest; the completion flag is set only after VERIFYING that everything that exists in either cache is present in the pack cache; any failed copy leaves the flag unset and the next boot retries (the function is idempotent). Returns a status object so the test battery can drive it directly.
  try {
    if (!('caches' in window)) return { ok: false, why: 'nocache' };
    if (!anyPreloadRecord()) return { ok: true, skipped: true }; // no pack was ever downloaded on this install (Beta 1.170, C-03: under any route - see anyPreloadRecord)
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
// Beta 1.143 (DA-07): the boot invocation of migratePack() no longer lives here. It fired during
// this part's evaluation and captured preloadUrlList() as its manifest BEFORE create.js evaluated
// and registered the created packs - the captured set was the shipped packs only, so the migration
// pruned a created route's downloaded tiles and certified the smaller set. The call now sits in
// create.js immediately after mergeUserPacks(), where the manifest is the true union.
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
  // Boot the moment the intro has actually finished on THIS device, plus a
  // breath - never on a fixed clock, so a slow first paint cannot push the
  // boot chunks back into the animation. Beta 1.180: the trigger re-anchors
  // from the retired title slide to the icon's own fade (splashIconIn, the
  // intro's remaining CSS entrance). The icon's animation ends at 1.6s,
  // where the title's slide ended at 2.15s, so the breath is 700ms rather
  // than 150ms and the boot tail lands at the same ~2.3s point it always
  // has. The 2.6s timer remains only a fallback if the event never lands.
  const __iconEl = document.getElementById('splashIcon');
  if (__iconEl) __iconEl.addEventListener('animationend', () => setTimeout(__bootTail, 700), { once: true });
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
  // Beta 1.148 (Tranche 5, A4(ii)): the reset knowledge now lives with the state
  // owners - this block only CALLS the owners' hooks (each hook preserves the
  // order its own writes ran in below) and clears app1's dirty flags through
  // markClean, app1's own accessor. It writes no foreign global itself: a new
  // session field's reset is added in its owner's hook, not here.
  resetNotesHistorySession(); // app3: runSnap, history panel + clean-delete arming, modal note, suggestion set + banners
  resetStreetsSession(); // app2: selection (deselect), note editor + its timer, Streets filter, street-row cache, storage-warning episode
  markClean('trail'); markClean('sess'); markClean('snap'); markClean('start'); markClean('aux'); markClean('primary'); // the dirty flags described the outgoing route's pending writes; the flush above landed what it could, and the incoming route's state (loaded next) starts clean - a stale flag must never re-fire against the new slot
  // (The two hook calls above replace this block's former inline writes, line
  // for line in count, so every census-pinned line below this block stands.)
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
  const rm = $('routeMenu'); rm.classList.remove('tab', 'open'); rm.classList.add('boot', 'show'); const bl = $('brandLayer'); if (bl) bl.classList.remove('off', 'bye'); /* Beta 1.155: the picker return revives the landed title in its layer (finish() parked it at the pick) */ showRmPane('rmMain'); renderRouteLists();
  syncWake();
}
async function deleteRoute(id) { // Beta 1.124 (Andrew): delete a route HE created - the shipped packs are refused (SHIPPED_PACK_IDS), so the built-in 5W can never be deleted. Order is the safety: (1) the userpacks definition goes first, through a strict read and a VERIFIED write - on any failure nothing else is touched, the route stays listed and fully intact, and a toast names the storage problem; (2) only then is the pack unregistered and every key of its slot wiped - enumerated from routeKeys (ROUTE_FIELDS + snap + mig + its preload record), never hand-listed, so a future field joins the sweep by construction; (3) if it was the active route, the app returns to the boot picker; (4) the list re-renders without it. Beta 1.166: the definition's home is the IndexedDB store - step (1) is a verified store delete, PLUS the removal of any not-yet-drained legacy shadow copy (while a legacy record stands, its copy wins at boot, so leaving one would resurrect the route); a shadow-removal failure puts the store entry back rather than strand a half-deleted route.
  const ix = ROUTE_PACKS.findIndex(p => p.id === id); if (ix < 0 || SHIPPED_PACK_IDS.has(id)) return;
  const pack = ROUTE_PACKS[ix];
  const legacy = readUserPacks(); // strict, as ever: a legacy record that cannot be read is never rewritten blind - rescuing one deletion must never cost every created route
  if (legacy === null) { toast('Storage problem — the route could not be deleted', 4000); return; }
  if (!(await upDel(id))) { toast('Storage problem — the route could not be deleted', 4000); return; } // the storage-outcome contract, unchanged: the definition's removal is verified before any data is wiped - a route whose definition survived keeps its data and its row
  if (legacy[id]) {
    const shadow = { ...legacy }; delete shadow[id];
    const okShadow = Object.keys(shadow).length ? (lsSet(USERPACKS_KEY, JSON.stringify(shadow)) && !(readUserPacks() || {})[id]) : (lsDel(USERPACKS_KEY) && localStorage.getItem(USERPACKS_KEY) === null);
    if (!okShadow) { await upPut(id, pack); toast('Storage problem — the route could not be deleted', 4000); return; }
  }
  delete userPackCache[id]; // the backup picture joins the commit
  const wasActive = !!(activeRoute && activeRoute.id === id && routeLoaded);
  ROUTE_PACKS.splice(ix, 1);
  const rk = routeKeys(id); let wipeFailed = false; for (const k of Object.values(rk)) { if (!txDel(k).ok) wipeFailed = true; } // Beta 1.146 (census C2): the slot wipe is VERIFIED like the definition write above it (txDel - the app's own verified delete), every key attempted even after a failure. The old lsDel loop ignored every result: a failed delete left residue in an orphaned slot, and uniqueRouteId checks ROUTE_PACKS only, so a later same-named route regenerated the same slug and loadRouteState loaded the residue as the new route's own progress/history/notes.
  // Reference sweep (1.124): nothing else keys on a route id - the IndexedDB city cache is keyed by CITY (a deleted route's city stays cached for the next route there), LS_GLOBAL.lastArea is a city name, and PACKMIG's fingerprint derives from preloadUrlList() over ROUTE_PACKS, so removing the pack honestly un-certifies the old union download (the tiles themselves stay cached; the Settings line simply offers the current set's download again).
  if (wasActive) unloadRouteToBoot(); else renderRouteLists();
  if (wipeFailed) toast('Route deleted — but some of its saved data could not be deleted (storage problem)', 4200); // Beta 1.146 (census C2): the definition IS gone (verified above) and the pack stays unregistered - in-memory tenancy matches storage - but the success toast must NOT fire over a slot that could not be fully wiped; the failure is said out loud, on deleteRoute's own storage-problem surface (the same toast form its definition-write failures use)
  else toast('Route deleted', 2600);
}
function askDeleteRoute(id) { // Beta 1.124: the Delete button on a created route's row (app2's routeRowEl) - the shared create confirm asks, with the deletion labels; the confirm's card is the theme-token surface in both day and night.
  const pack = ROUTE_PACKS.find(p => p.id === id); if (!pack || SHIPPED_PACK_IDS.has(id)) return;
  crConfirm('Delete ' + pack.name + '?', 'The route and everything saved for it on this phone — progress, notes, history — will be removed. This can’t be undone.', () => deleteRoute(id), { yes: 'Delete', no: 'Cancel', danger: true });
}
