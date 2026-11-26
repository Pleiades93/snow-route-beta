
// ===== EXPORT / BACKUP / RESTORE (production showX model: one panel, four modes) =====
function fmtStamp(iso) { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString() + ' ' + fmtClock(d); }
function buildReport() {
  const byTime = m => (a, b) => String(m[a] || '').localeCompare(String(m[b] || ''));
  const ts = [...doneSet].map(n => Date.parse(doneTimes[n])).filter(t => !isNaN(t)).sort((a, b) => a - b);
  const L = ['Snow Route: snow log', 'Exported: ' + fmtStamp(new Date().toISOString()), 'Completed: ' + doneSet.size + ' of ' + STREETNAMES.length]; // the total derives from the route's street list
  if (ts.length) {
    const startMs = (runStart && runStart <= ts[0]) ? runStart : ts[0]; // one start for the whole log: the real clean start when recorded, the first completion only as fallback
    L.push('Started: ' + fmtStamp(new Date(startMs).toISOString()) + '   Last: ' + fmtStamp(new Date(ts[ts.length - 1]).toISOString()) + '   Duration: ' + fmtDur(ts[ts.length - 1] - startMs));
    if (trail.length > 1) L.push('GPS distance since start: ' + trailKm(startMs).toFixed(1) + ' km');
  }
  L.push('', 'Street, Completed');
  [...doneSet].sort(byTime(doneTimes)).forEach(n => L.push(n + ', ' + (doneTimes[n] ? fmtStamp(doneTimes[n]) : '(no time)') + (doneVia[n] === 'gps' ? ' (GPS-verified)' : '')));
  const todo = STREETNAMES.filter(n => !doneSet.has(n));
  if (todo.length) L.push('', 'Not done: ' + todo.join(', '));
  const fl = STREETNAMES.filter(n => Array.isArray(notes[n]) && notes[n].length); // Array.isArray: a street named 'constructor' would read the inherited member, whose .length is arity, not a count
  if (fl.length) { L.push('', 'Notes & flags:'); fl.forEach(n => L.push(n + ': ' + flagText(n))); }
  history.slice().reverse().forEach(h => {
    const items = h.items || {}, ks = Object.keys(items).sort(byTime(items));
    L.push('', 'Archived clean (finished ' + fmtStamp(h.at) + ', ' + ks.length + ' streets' + (h.startedAt ? ', started ' + fmtStamp(h.startedAt) : '') + (h.km ? ', ' + h.km + ' km' : '') + ')');
    ks.forEach(n => L.push(n + ', ' + (items[n] ? fmtStamp(items[n]) : '(no time)') + ((h.via || {})[n] === 'gps' ? ' (GPS-verified)' : '')));
  });
  return L.join('\n');
}
function buildGpx() { // segmentation (gap rule, session-start splits, the marker walk) lives in trailSegments (app1); this consumer only renders GPX tracks
  const pt = p => '<trkpt lat="' + p[0] + '" lon="' + p[1] + '"><time>' + new Date(p[2] * 1000).toISOString() + '</time></trkpt>\n';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Snow Route Beta"><trk><name>Snow Route trail</name><trkseg>\n' + trailSegments(trail,
    trailSessions).map(seg => seg.map(pt).join('')).join('</trkseg><trkseg>\n') + '</trkseg></trk></gpx>';
}
let xMode = 'menu';
function showX(mode) { // the backup pane is a menu tree, not a form; Backup (JSON)'s save prompt IS the share
  xMode = mode;
  const menu = mode === 'menu', restore = mode === 'restore', text = mode === 'text';
  $('xOpts').style.display = menu ? '' : 'none';
  $('fxLogRow').style.display = menu ? '' : 'none'; // the GPS debug switch lives in the Backup menu mode; restore and import-text modes hide it
  $('xRestoreOpts').style.display = restore ? '' : 'none';
  const ta = $('xText');
  ta.style.display = text ? '' : 'none';
  ta.readOnly = !text;
  $('xImp').style.display = text ? '' : 'none';
  $('xTitle').textContent = menu ? 'Backup' : restore ? 'Restore' : 'Import Text';
  if (text) { ta.value = ''; ta.placeholder = 'Paste a backup here, then tap Import backup'; }
}
function openExport() { showX('menu'); showSetPane('setBackupPane'); $('setVer').textContent = $('ver').textContent; $('setMenu').classList.add('open'); } // opening Backup lands on the backup menu (the maps download lives in Status)
$('xBak').addEventListener('click', () => shareBackup());
$('xRes').addEventListener('click', () => showX('restore'));
// the GPS debug switch is runtime-only state: no saveSettings, no revert - a flip cannot fail to persist
$('swFixLog').addEventListener('click', () => { fixLogSetEnabled(!fixLogIsEnabled()); renderSwitch($('swFixLog'), fixLogIsEnabled()); });
$('xImpText').addEventListener('click', () => showX('text'));
$('xImpFile').addEventListener('click', () => $('xFile').click());
$('xFile').addEventListener('change', async () => { const f = $('xFile').files && $('xFile').files[0]; $('xFile').value = ''; if (!f) return; let t = ''; try { t = await f.text(); } catch (e) { return; } $('xText').value = t;
doRestore(); }); // Import JSON: the picked file feeds the SAME restore path as pasted text - one validator, one verdict, no second door to keep honest
function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400); }
function packGeometry(pack) { // a pack's geometry built purely from its own data (the live builders, no live state touched)
  const roads = (pack && pack.roads) || {};
  const names = Object.keys(roads);
  const stretch = computeStretches(roads);
  return { names, set: new Set(names), stretch, samples: samplesFor(stretch, names) };
}
function snapForExport(strict) { // the route's snapshot, normalized (memory, else validated storage); strict reads return undefined on failure, never silent null
  if (!runStart) return null;
  if (runSnap) return BOARD.snapshotObject(runSnap, runStart); // Arch-2: the snapshot-object shape is the board module's one construction
  let rawSnap = null;
  if (strict) { const rs = rawRead(LS.snap); if (rs === RAW_READ_FAILED) return undefined; rawSnap = rs; } // through the shared rawRead - the strict failure mode (undefined) is unchanged
  else rawSnap = lsGet(LS.snap);
  const pv = validateSnap(parseJ(rawSnap, null), runStart);
  return pv ? BOARD.snapshotObject(pv, runStart) : null;
}
// the envelope's one owner: strict reads storage raw and refuses on failure; recovery reads live memory, best-effort
const ENVELOPE = {
  // format v2 (routes carry their own slots); reads stay raw: a failed read fails the whole export
  /** @returns {object|null} */ strict() {
    PERSIST.flush(true); // flush the buffered trail/coverage first - a backup must not lag the work it claims to hold
    // reconcile only when a save failed: memory is ahead, and a raw export would ship the old board
    if (routeLoaded && writePending('primary')) { const okPrim = saveAll().ok; if (!okPrim) return null; }
    if (writePending('trail') || writePending('aux') || writePending('sess') || writePending('fixlog')) return null; // the flush did not land - refuse the export rather than ship a valid-looking backup with stale trail/coverage inside
    const routes = {};
    for (const p of ROUTE_PACKS) {
      const rk = routeKeys(p.id); const data = {};
      for (const f of ROUTE_FIELDS) { const key = (activeRoute && p.id === activeRoute.id && LS[f] !== rk[f]) ? LS[f] : rk[f]; const v = rawRead(key); if (v === RAW_READ_FAILED) return null; if (v != null) data[f] = v; }
      // lifecycle rides explicitly: a run asserts its start string, no run asserts start: null; the snapshot rides along
      const isActive = !!(activeRoute && p.id === activeRoute.id && routeLoaded);
      const startStr = isActive ? (runStart ? String(runStart) : null) : (data.start !== undefined ? data.start : null);
      data.start = startStr;
      if (startStr) {
        let snapObj = null;
        if (isActive) { snapObj = snapForExport(true); if (snapObj === undefined) return null; } // a snapshot read failure fails the whole export (B04 discipline) - never a valid-looking backup missing the snapshot
        // a non-active pack's snapshot validates against ITS OWN geometry
        else { const rawSnap = rawRead(rk.snap); if (rawSnap === RAW_READ_FAILED) return null; const pv = validateSnap(parseJ(rawSnap, null), +startStr, packGeometry(p)); if (pv) snapObj = BOARD.snapshotObject(pv, +startStr); }
        if (snapObj) data.snap = JSON.stringify(snapObj);
      }
      routes[p.id] = data;
    } // exports from the keys the route runs on: a legacy-fallback boot's fresh slot would emit an empty backup
    const night = rawRead(LS_GLOBAL.night); if (night === RAW_READ_FAILED) return null;
    const nightExp = rawRead(LS_GLOBAL.nightExp); if (nightExp === RAW_READ_FAILED) return null;
    const o = { app: 'snowroute-backup', v: 2, at: new Date().toISOString(), routes };
    if (!upStoreComplete) return null; // created-route definitions ride from the verified store picture; a failed store read refuses the export outright
    if (Object.keys(userPackCache).length) o.userpacks = { ...userPackCache }; // created routes are Andrew's data - their definitions ride every backup
    if (night != null) o.night = night;
    if (nightExp != null) o.nightExp = nightExp; // the icon-pack choice no longer rides (one set: Glyph); the theme override and its expiry travel together
    const stg = rawRead(SETTINGS_KEY); if (stg === RAW_READ_FAILED) return null; if (stg != null) o.settings = stg; // the Settings toggles ride every backup too, read with the same strictness as the night pair
    const fx = rawRead(LS.fixlog); if (fx === RAW_READ_FAILED) return null; if (fx != null) o.fixlog = fx; // the fix log rides every backup too (same strictness) - it is the log's ONLY channel off the device
    return o;
  },
  // the recovery backup: in-memory state serialized directly - the exit for marks a refusing normal backup would strand
  /** @returns {object|null} */ recovery() {
    if (!routeLoaded || !activeRoute) return null;
    const data = {};
    const ser = BOARD.serialiseLive(); // Arch-2: the live board's stored strings come from the board module
    data.sides = ser.sides;
    data.done = ser.done;
    data.times = ser.times;
    data.via = ser.via;
    data.notes = JSON.stringify(notes);
    data.hist = HIST.serialise(); // the recovery export writes the merge like every writer: the bare view would permanently drop hidden raw entries
    data.trail = JSON.stringify(trail);
    data.cov = ser.cov;
    data.sess = JSON.stringify(trailSessions);
    data.start = runStart ? String(runStart) : null; // the recovery backup asserts idle explicitly too - it is a complete backup by construction
    if (runStart) { // the cancel snapshot rides inside the recovery file, so a restored run keeps its exact-restore Cancel
      const snapObj = snapForExport(); // the shared construction - the recovery and normal backups carry the identical object
      if (snapObj) data.snap = JSON.stringify(snapObj);
    }
    { const fl = rawRead(routeKeys(activeRoute.id).flip); if (fl !== RAW_READ_FAILED && fl != null) data.flip = fl; } // a read that fails simply leaves the field out (the recovery export's best-effort mode)
    // definitions settle first: as stored, or re-validated from memory when unreadable (progress without one is rejected elsewhere)
    recoveryDisclosure = null;
    let upsCarry = null; const excluded = new Set();
    if (upStoreComplete) upsCarry = { ...userPackCache };
    else { upsCarry = {}; const badNames = [];
      for (const pk of ROUTE_PACKS) { if (SHIPPED_PACK_IDS.has(pk.id)) continue;
      if (userPackCache[pk.id]) { upsCarry[pk.id] = userPackCache[pk.id]; continue; } const v = normalizePack(pk, {});
      if (v.ok) { v.pack.id = pk.id; upsCarry[pk.id] = v.pack; } else { excluded.add(pk.id); badNames.push(pk.name || pk.id); } }
      if (badNames.length) recoveryDisclosure = badNames;
    }
    if (excluded.has(activeRoute.id)) return null; // the open route's definition cannot be carried: no honest recovery file exists, so the unavailable message is the truth
    const routes = {}; routes[activeRoute.id] = data;
    for (const pk of ROUTE_PACKS) { if (pk.id === activeRoute.id || excluded.has(pk.id)) continue;
    const rk = routeKeys(pk.id);
    const d = {};
    for (const f of ROUTE_FIELDS) { const v = rawRead(rk[f]); if (v !== RAW_READ_FAILED && v != null) d[f] = v; } if (d.start === undefined) d.start = null;
      // a non-active running route's snapshot rides too, validated on its geometry; a failed read leaves it out
      if (d.start) { const rawSnap = rawRead(rk.snap); if (rawSnap !== RAW_READ_FAILED && rawSnap != null) { const pv = validateSnap(parseJ(rawSnap, null), +d.start, packGeometry(pk)); if (pv) d.snap = BOARD.serialiseSnap(pv, +d.start); } }
      if (Object.keys(d).length) routes[pk.id] = d; } // an untouched pack in a recovery file asserts idle like any complete backup
    const o = { app: 'snowroute-backup', v: 2, recovery: true, at: new Date().toISOString(), routes };
    if (upsCarry && Object.keys(upsCarry).length) o.userpacks = upsCarry; // definitions ride recovery too: from the strict record read, or validated memory when unreadable
    { const nt = rawRead(LS_GLOBAL.night); if (nt !== RAW_READ_FAILED) { if (nt != null) o.night = nt; const ne = rawRead(LS_GLOBAL.nightExp); if (ne !== RAW_READ_FAILED && ne != null) o.nightExp = ne; } }

    o.settings = JSON.stringify({ vib: settings.vib, chime: settings.chime, chimeSound: settings.chimeSound }); // the Settings toggles ride recovery too - from the LIVE settings object, in exactly the record shape saveSettings writes
    if (fixLog.length) o.fixlog = JSON.stringify(fixLogEncodeSessions(fixLog)); // the fix log rides recovery too, from the live log, in exactly saveFixLog's record shape (e3 form)
    return o;
  },
};
function backupObj() { return ENVELOPE.strict(); } // the doorway - the strict policy is ENVELOPE.strict (above)
function buildBackup() { const o = backupObj(); return o ? JSON.stringify(o, null, 1) : null; }
let recoveryDisclosure = null; // Routes excluded from the last recovery build.
function recoveryObj() { return ENVELOPE.recovery(); } // the doorway - the recovery policy is ENVELOPE.recovery (above)
function buildRecovery() { const o = recoveryObj(); return o ? JSON.stringify(o, null, 1) : null; }
// downloadBackup follows the one-button rule: a build failure is the recovery fallback, never a dead-end refusal
function downloadBackup() { const b = buildBackup(); if (!b) { shareRecovery(true); return; } dl(new Blob([b], { type: 'application/json' }), 'snowroute-backup.json'); noteExported(); }
function clearTrailAll() { // the clearing stays as a callable piece (guard, storage honesty intact) so a re-homed button wires to it
  trail = []; trailSessions = []; const okSessClr = saveSess().ok; if (!okSessClr) markDirty('sess'); // the markers describe this trail - clearing the trail clears them; the marker write is CHECKED like the trail write
  const okTrailClr = saveTrail().ok;
  if (okTrailClr && okSessClr) { markClean('trail'); PERSIST.noteWrite('trail'); } // the trail window is PERSIST's - the stamp goes through its doorway, not a foreign write
  else if (!okTrailClr) markDirty('trail');
}
function countUnknownNames(parsed, packs = ROUTE_PACKS) { // unknown-name count: from the RAW backup, each name once, judged per route against its own pack's streets
  const bad = new Set();
  const setFor = id => { const p = packs.find(x => x.id === id); return p ? new Set(Object.keys(p.roads || {})) : new Set(); }; // use the definition that will govern the destination, including newly added routes
  const scanData = (data, set) => {
    const noteName = n => { if (typeof n === 'string' && !set.has(n)) bad.add(n); };
    const fromObj = o => { if (o && typeof o === 'object' && !Array.isArray(o)) for (const k of Object.keys(o)) noteName(k); };
    if (!data || typeof data !== 'object') return;
    const done = parseJ(data.done, null); if (Array.isArray(done)) { for (const n of done) noteName(n); } else fromObj(done);
    fromObj(parseJ(data.times, null)); fromObj(parseJ(data.via, null)); fromObj(parseJ(data.cov, null));
    // object-form notes ({street: [entries]}): never written, but restore accepts them, so the counter scans them too
    const notesRaw = parseJ(data.notes, null); if (Array.isArray(notesRaw)) { for (const e of notesRaw) { if (e && typeof e === 'object') noteName(e.k); } } else fromObj(notesRaw);
    const sides = parseJ(data.sides, null); if (sides && typeof sides === 'object') { fromObj(sides.p); fromObj(sides.t); }
    const hist = parseJ(data.hist, null); if (Array.isArray(hist)) for (const h of hist) { if (h && typeof h === 'object') { if (Array.isArray(h.items)) { for (const n of h.items) noteName(n); } else fromObj(h.items); } }
  };
  if (parsed.v === 2 && parsed.routes && typeof parsed.routes === 'object') { for (const id of Object.keys(parsed.routes)) scanData(parsed.routes[id], setFor(id)); }
  else if (parsed.v === 1 && parsed.data && typeof parsed.data === 'object') { const lf = {};
  for (const f of Object.keys(LEGACY_KEYS)) { if (parsed.data[LEGACY_KEYS[f]] != null) lf[f] = parsed.data[LEGACY_KEYS[f]]; } scanData(lf, setFor('5w'));
  }
  return bad.size;
}
function canonicalSettings(raw) { // the one settings validator: the loader's rules applied and re-serialized canonically; unknown values fall back, never refuse
  if (typeof raw !== 'string') return null;
  let p; try { p = JSON.parse(raw); } catch (e) { return null; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  return JSON.stringify({ vib: typeof p.vib === 'boolean' ? p.vib : SETTINGS_DEF.vib,
    chime: typeof p.chime === 'boolean' ? p.chime : SETTINGS_DEF.chime,
    chimeSound: CHIME_KEYS.includes(p.chimeSound) ? p.chimeSound : SETTINGS_DEF.chimeSound });
}
function canonicalFixLog(raw) { // the fixlog validator: loader rules, canonical e3 re-encode, both caps; refusal data is retained, never silently lost
  if (typeof raw !== 'string') return null;
  const parsed = parseJ(raw, null);
  if (!Array.isArray(parsed) && !(parsed && typeof parsed === 'object' && parsed.e === 3 && Array.isArray(parsed.s))) return null;
  const sessions = fixLogDecodeSessions(parsed);
  let total = 0; for (const s of sessions) total += s.f.length;
  while (total > FIXLOG_MAX && sessions.length) { if (sessions.length === 1) { const drop = sessions[0].f.length - FIXLOG_MAX; sessions[0].f.splice(0, drop); total -= drop; break; } total -= sessions[0].f.length; sessions.shift(); }
  let out = JSON.stringify(fixLogEncodeSessions(sessions));
  while (out.length > FIXLOG_MAX_CHARS && sessions.length) { // the character cap on the real encoded record (restores are rare, so the re-encode loop costs nothing)
    if (sessions.length === 1) { const s = sessions[0];
    let drop = Math.max(1, Math.ceil(s.f.length * (1 - FIXLOG_MAX_CHARS / out.length)));
    if (drop >= s.f.length) drop = s.f.length;
    s.f.splice(0, drop);
    if (!s.f.length) sessions.shift();
    }
    else sessions.shift();
    out = JSON.stringify(fixLogEncodeSessions(sessions));
  }
  return out;
}
// merge against raw resident records; unchanged records keep their exact strings; unmergeable shapes fail closed
function mergeRestoreEntries(entries, allPacks) {
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const incoming = new Map(entries);
  const merged = new Map();
  const read = key => {
    const raw = rawRead(key);
    if (raw === RAW_READ_FAILED) throw new Error(key);
    return raw;
  };
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const decode = (key, raw, accepts) => {
    const value = parseJ(raw, null);
    if (!accepts(value)) throw new Error(key);
    return value;
  };
  const noteId = entry => entry && typeof entry.k === 'string'
    ? JSON.stringify([entry.k, entry.at, own(entry, 'text'), entry.text]) : null;
  const cleanId = entry => entry && typeof entry.at === 'string' && Number.isFinite(Date.parse(entry.at))
    && entry.items && typeof entry.items === 'object' && Number.isFinite(entry.runId) && entry.runId > 0
    ? JSON.stringify([entry.at, entry.runId]) : null;
  // a no-ID legacy entry is identified by its full stamped data
  const histId = entry => cleanId(entry) ?? (entry && typeof entry === 'object' && typeof entry.at === 'string'
    && Number.isFinite(Date.parse(entry.at)) ? 'legacy:' + upCanon(entry) : null);
  const newEntries = (current, backup, identity) => {
    const seen = new Set(current.map(identity));
    return backup.filter(entry => {
      const id = identity(entry);
      if (id === null || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };
  const fields = ['times', 'via', 'cov', 'notes'];
  for (const pack of allPacks) {
    const rk = routeKeys(pack.id);
    if (![...ROUTE_FIELDS, 'snap'].some(f => incoming.has(rk[f]))) continue;
    if (pack.id === '5w' && read(rk.mig) === null && read(LEGACY_KEYS.sides) !== null) {
      // newer values can linger in legacy keys after an incomplete migration; a slot write would mask them
      throw new Error('Route 5W migration pending');
    }
    const liveStart = read(rk.start);
    const cleanTrail = raw => JSON.parse(raw).filter(q => Array.isArray(q) && q.length === 3
      && q.every(Number.isFinite) && q[2] >= 946684800 && q[2] <= 4102444800
      && Math.abs(q[0]) <= 90 && Math.abs(q[1]) <= 180);

    // A live run fills as one cluster; C06/C-01 apply inside the backup; conflicting orphan keys withhold it.
    if (incoming.has(rk.start) && liveStart === null) {
      const cluster = ['start', 'snap', 'trail', 'sess'];
      const start = +incoming.get(rk.start);
      const hist = parseJ(read(rk.hist), []);
      const trailRaw = incoming.get(rk.trail);
      if (trailRaw !== undefined) {
        incoming.set(rk.trail, JSON.stringify(trailWindow(cleanTrail(trailRaw), start)));
        if (!incoming.has(rk.sess)) incoming.set(rk.sess, '[]');
      } else incoming.delete(rk.sess);
      // The imported snapshot is the run's Cancel baseline: fold the resident board in, so Cancel cannot erase resident marks.
      if (incoming.has(rk.snap)) {
        const snapObj = parseJ(incoming.get(rk.snap), null);
        const resSides = parseJ(read(rk.sides), null);
        const resP = resSides && typeof resSides === 'object' ? (resSides.p || resSides) : null;
        const resDoneRaw = parseJ(read(rk.done), []);
        const marked = v => v === 1 || v === 2 || v === 3;
        const hasProgress = (Array.isArray(resDoneRaw) && resDoneRaw.length > 0)
          || (resP && Object.values(resP).some(a => Array.isArray(a) && a.some(marked)));
        if (snapObj && snapObj.pieces && hasProgress) {
          const G = packGeometry(pack);
          const resT = (resSides && resSides.t) || {};
          const pieces = {}, pieceTimes = {};
          for (const n of G.names) {
            const sp = snapObj.pieces[n] || [], st = snapObj.pieceTimes[n] || [];
            const rp = (resP && resP[n]) || [], rt = sanitizePieceTimes(resT[n], G.stretch[n].parts.length);
            pieces[n] = sp.map((v, i) => (marked(rp[i]) ? rp[i] : v));
            pieceTimes[n] = sp.map((v, i) => (marked(rp[i]) ? rt[i] : (st[i] || [null, null])));
          }
          const times = { ...snapObj.times };
          for (const [n, v] of Object.entries(parseJ(read(rk.times), {}))) if (G.set.has(n) && typeof v === 'string' && !isNaN(Date.parse(v))) times[n] = v;
          const via = { ...snapObj.via };
          for (const [n, v] of Object.entries(parseJ(read(rk.via), {}))) if (G.set.has(n) && typeof v === 'string') via[n] = v;
          const cov = { ...snapObj.cov };
          for (const [n, arr] of Object.entries(parseJ(read(rk.cov), {}))) {
            if (!G.set.has(n) || !Array.isArray(arr)) continue;
            cov[n] = [...new Set([...(cov[n] || []), ...arr.filter(i => Number.isInteger(i) && i >= 0 && i < G.samples[n].length)])];
          }
          const done = [...new Set([...snapObj.done, ...(Array.isArray(resDoneRaw) ? resDoneRaw.filter(n => G.set.has(n)) : [])])];
          incoming.set(rk.snap, BOARD.serialiseSnap({ pieces, pieceTimes, done, times, via, cov }, start));
        }
      }
      const current = cluster.map(f => read(rk[f]));
      // A finished archive with this run stamp makes boot reconciliation
      // interpret the imported start as an interrupted finish.
      if (!(Array.isArray(hist) && hist.some(h => h && +h.runId === start))
        && cluster.every((f, i) => current[i] === null || current[i] === incoming.get(rk[f]))) {
        for (const [i, f] of cluster.entries()) {
          if (current[i] === null && incoming.has(rk[f])) merged.set(rk[f], incoming.get(rk[f]));
        }
      }
    }
    // A trail carried without its start lands windowed only into a slot with no run-state remnants.
    if (incoming.has(rk.trail) && !incoming.has(rk.start) && liveStart === null && read(rk.trail) === null
      && (read(rk.sess) === null || read(rk.sess) === '[]')) {
      merged.set(rk.trail, JSON.stringify(trailWindow(cleanTrail(incoming.get(rk.trail)), 0)));
    }

    if (incoming.has(rk.hist)) {
      const raw = read(rk.hist);
      const current = raw === null ? [] : decode(rk.hist, raw, Array.isArray);
      const backup = JSON.parse(incoming.get(rk.hist));
      const start = +(liveStart || merged.get(rk.start));
      const candidates = backup.filter(h => !(start && h && +h.runId === start));
      // Legacy entries match by fingerprint (histId); only exact duplicates skip.
      const additions = newEntries(current, candidates, histId);
      if (additions.length || (raw === null && !backup.length)) {
        // HIST consumes chronological order, reconciling from the raw tail: insert in time order, residents stay in place
        const result = [];
        if (current.length) additions.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
        let next = 0;
        for (const h of current) {
          while (next < additions.length && Date.parse(additions[next].at) < Date.parse(h?.at)) result.push(additions[next++]);
          result.push(h);
        }
        for (; next < additions.length; next++) result.push(additions[next]);
        merged.set(rk.hist, JSON.stringify(result));
      }
    }

    for (const f of fields) {
      if (!incoming.has(rk[f])) continue;
      const key = rk[f], raw = read(key);
      const current = raw === null ? {} : decode(key, raw, object);
      const backup = JSON.parse(incoming.get(key));
      // The text note is a singleton per street: a backup version never joins a resident one.
      const noteGuard = (list, resident) => {
        let taken = resident;
        return list.filter(e => { if (e && e.k === 'note') { if (taken) return false; taken = true; } return true; });
      };
      const additions = [];
      for (const [name, value] of Object.entries(backup)) {
        if (!own(current, name)) additions.push([name, f === 'notes' && Array.isArray(value) ? noteGuard(value, false) : value]);
        else if (f === 'notes' && Array.isArray(current[name]) && Array.isArray(value)) {
          const guarded = noteGuard(value, current[name].some(e => e && e.k === 'note'));
          const notesAdded = newEntries(current[name], guarded, noteId);
          if (notesAdded.length) additions.push([name, [...current[name], ...notesAdded]]);
        }
      }
      if (raw === null) {
        if (f === 'notes') {
          let dropped = false;
          const guardedObj = {};
          for (const [n, v] of Object.entries(backup)) { const g = Array.isArray(v) ? noteGuard(v, false) : v; if (Array.isArray(v) && g.length !== v.length) dropped = true; guardedObj[n] = g; }
          merged.set(key, dropped ? JSON.stringify(guardedObj) : incoming.get(key));
        } else merged.set(key, incoming.get(key));
      }
      else if (additions.length) merged.set(key, JSON.stringify({ ...current, ...Object.fromEntries(additions) }));
    }

    if (incoming.has(rk.done) || incoming.has(rk.sides)) {
      const rawSides = read(rk.sides);
      const split = (raw, resident) => {
        const v = decode(rk.sides, raw, object);
        if (!v.p) return { p: v, t: {}, wrapped: false, raw: v };
        if (resident && (!object(v.p) || (own(v, 't') && !object(v.t)))) throw new Error(rk.sides);
        return { p: object(v.p) ? v.p : {}, t: object(v.t) ? v.t : {}, wrapped: true, raw: v };
      };
      const empty = { p: {}, t: {}, wrapped: true, raw: {} };
      const current = rawSides === null ? empty : split(rawSides, true);
      const hasSide = (side, name) => own(side.p, name) || own(side.t, name);
      const hasBackupSides = incoming.has(rk.sides);
      const backup = hasBackupSides ? split(incoming.get(rk.sides), false) : empty;
      const p = Object.assign(Object.create(null), current.p), t = Object.assign(Object.create(null), current.t);
      let sidesAdded = false, sidesDerived = false;
      const rawDone = read(rk.done);
      const currentDone = rawDone === null ? [] : decode(rk.done, rawDone, Array.isArray);
      const done = new Set(currentDone);

      // An entry with no marks and no stamps is saver filler, not a record.
      const entryMarked = (side, name) => {
        const bp = side.p[name], bt = side.t[name];
        return (Array.isArray(bp) && bp.some(v => v))
          || (bt && Object.values(bt).some(s => Array.isArray(s) && s.some(x => x)));
      };
      // A legacy completion is a resident board value; a backup side entry cannot un-complete it.
      for (const name of new Set([...Object.keys(backup.p), ...Object.keys(backup.t)])) {
        if (entryMarked(current, name) || done.has(name)) continue;
        if (!entryMarked(backup, name)) continue;
        if (own(backup.p, name)) p[name] = backup.p[name];
        if (own(backup.t, name)) t[name] = backup.t[name];
        sidesAdded = true;
      }
      if (incoming.has(rk.done)) {
        const { set, stretch } = packGeometry(pack);
        let times;
        const added = [];
        const backupDone = JSON.parse(incoming.get(rk.done));
        for (const name of backupDone) {
          if (done.has(name) || entryMarked(current, name) || !set.has(name)) continue;
          done.add(name);
          added.push(name);
          // F06: derive sides only for a newly added street without incoming sides, from the merged stamp.
          if (!entryMarked(backup, name)) {
            if (!times) times = parseJ(merged.get(rk.times) ?? read(rk.times), {});
            p[name] = stretch[name].parts.map(() => 3);
            t[name] = stretch[name].parts.map(() => [times[name] || null, times[name] || null]);
            sidesAdded = true;
            sidesDerived = true;
          }
        }
        if (added.length || (rawDone === null && !backupDone.length)) merged.set(rk.done, JSON.stringify([...currentDone, ...added]));
      }
      if (rawSides === null && hasBackupSides && !currentDone.length && !sidesDerived) {
        merged.set(rk.sides, incoming.get(rk.sides));
      } else if (sidesAdded) {
        merged.set(rk.sides, JSON.stringify({ ...(current.wrapped ? current.raw : {}), p, t }));
      }
    }
    if (incoming.has(rk.flip) && read(rk.flip) === null) merged.set(rk.flip, incoming.get(rk.flip));

    // The outstanding finish cleanup could erase merged notes/coverage at
    // boot. Discharge only an armed obligation for a slot actually changed.
    if ([...ROUTE_FIELDS, 'snap'].some(f => merged.has(rk[f])) && read(rk.finclean) !== null) merged.set(rk.finclean, null);
  }

  if (incoming.has(SETTINGS_KEY)) {
    const raw = read(SETTINGS_KEY);
    if (raw === null) merged.set(SETTINGS_KEY, incoming.get(SETTINGS_KEY));
    else {
      const current = decode(SETTINGS_KEY, raw, object);
      const missing = Object.entries(JSON.parse(incoming.get(SETTINGS_KEY))).filter(([k]) => !own(current, k));
      if (missing.length) merged.set(SETTINGS_KEY, JSON.stringify({ ...current, ...Object.fromEntries(missing) }));
    }
  }
  // Preserve the resident fix log whole: session stamps can collide, and merging could evict resident fixes.
  if (incoming.has(LS.fixlog) && read(LS.fixlog) === null) merged.set(LS.fixlog, incoming.get(LS.fixlog));
  if (incoming.has(LS_GLOBAL.night) && read(LS_GLOBAL.night) === null) {
    const expiry = read(LS_GLOBAL.nightExp);
    const carried = incoming.get(LS_GLOBAL.nightExp);
    if (expiry === null || expiry === carried) {
      merged.set(LS_GLOBAL.night, incoming.get(LS_GLOBAL.night));
      // A missing expiry takes initTheme's own fallback, written with the override so the pair commits together.
      if (expiry === null) merged.set(LS_GLOBAL.nightExp, carried ?? String(nextSunBoundary(Date.now())));
    }
  }
  return [...merged];
}
// two halves: the planner validates and writes nothing; the coordinator transacts (fence, snapshot, writes, rollback, commit, report)
const RESTORE = {
  /** @param {*} parsed @returns {object|Promise<object|null>|null} */ plan(parsed) {
    if (!parsed || parsed.app !== 'snowroute-backup') { return null; }
    const FIELD_SHAPES = { done: 'arr', times: 'obj', hist: 'arr', notes: 'obj', via: 'obj', trail: 'arr', cov: 'obj', sides: 'obj', sess: 'arr' };
    const entries = []; // validated backup candidates, before merge
    const pushField = (targetKey, field, v, label, nameSet) => {
      if (typeof v !== 'string') { return false; }
      if (field === 'start') { // the start validates semantically (epoch-ms digits, the loader's band): a crafted '1' once became a phantom run
        if (!/^\d+$/.test(v) || !isFinite(+v) || +v < 946684800000 || +v > 4102444800000) { return false; }
      }
      // night's writer stores only '0'/'1'; both keys land in this write set, so the pair stays atomic
      if (field === 'night' && v !== '0' && v !== '1') { return false; }
      const shape = FIELD_SHAPES[field];
      if (shape) {
        let pv; try { pv = JSON.parse(v); } catch (e) { return false; }
        if (field === 'done' && pv && typeof pv === 'object' && !Array.isArray(pv)) {
          v = JSON.stringify(Object.keys(pv).filter(nm => pv[nm] && (nameSet || STREETSET).has(nm))); // legacy done-set was a street->time map; migrate like the loader, filtered against the TARGET route's names
        } else if (shape === 'arr' ? !Array.isArray(pv) : !(pv && typeof pv === 'object' && !Array.isArray(pv))) { return false; }
        if (field === 'sess' && Array.isArray(pv) && pv.length > TRAIL_MAX) { // the caps enforced in validation (the stored value is the capped one); history stores whole, markers keep newest
          const cs = [...new Set(pv.map(x => Number(x)).filter(x => Number.isFinite(x)))].sort((a, b) => a - b); v = JSON.stringify(cs.slice(Math.max(0, cs.length - TRAIL_MAX)));
        }
      }
      entries.push([targetKey, v]); return true;
    };
    let snapDropped = false;
    const deadSkipped = [];
    let restoredPacks = null; // the created-route definitions this backup carries, validated before anything is written
    let allPacks = ROUTE_PACKS; // the routes this restore knows about: the runtime list, plus restoredPacks once validated
    if (parsed.v === 2) {
      if (!parsed.routes || typeof parsed.routes !== 'object' || Array.isArray(parsed.routes)) { return null; }
      if (parsed.userpacks !== undefined) { // validate definitions first (they register before state applies); an id colliding with a shipped pack is rejected
        if (!parsed.userpacks || typeof parsed.userpacks !== 'object' || Array.isArray(parsed.userpacks)) { return null; }
        restoredPacks = {};
        for (const rid of Object.keys(parsed.userpacks)) {
          if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(rid) || SHIPPED_PACK_IDS.has(rid)) { return null; }
          const v = normalizePack(parsed.userpacks[rid], {});
          if (!v.ok) { return null; }
          v.pack.id = rid; restoredPacks[rid] = v.pack;
        }
      }
    }
    let packPriors = null;
    const finishPlan = () => {
      if (parsed.v === 2) {
        for (const id of Object.keys(parsed.routes)) {
          if (SHIPPED_PACK_IDS.has(id) && !ROUTE_PACKS.some(p => p.id === id)) { deadSkipped.push(id); continue; } // a shipped route deleted on this phone: its backup data is skipped
          // use the destination definition for name filtering and snapshot validation
          const pack = allPacks.find(p => p.id === id); if (!pack) { return null; }
          const data = parsed.routes[id]; if (!data || typeof data !== 'object' || Array.isArray(data)) { return null; }
          const rk = routeKeys(id);
          const pg = packGeometry(pack); // this route's own geometry, for its name filter and snapshot validation below
          for (const f of ROUTE_FIELDS) { if (data[f] === undefined) continue; if (f === 'start' && data[f] === null) continue; if (!pushField(rk[f], f, data[f], pack.name + ' ' + f, pg.set)) return null; }
          if (data.start === null) {
            if (data.snap !== undefined && data.snap !== null) snapDropped = true;
          } else if (data.snap !== undefined) { // validate against the carried start and destination geometry, even when a resident run later wins
            const startEnt = entries.find(e => e[0] === rk.start);
            let restoredSnap = null;
            if (startEnt && typeof data.snap === 'string') { try { const valid = validateSnap(JSON.parse(data.snap), +startEnt[1], pg);
            if (valid) restoredSnap = BOARD.serialiseSnap(valid, +startEnt[1]);
            } catch (e) { /* an unparseable snapshot is a dropped snapshot */ } } // Beta 1.117 (F6): validated against THIS route's geometry (pg), not the open route's
            if (restoredSnap) entries.push([rk.snap, restoredSnap]); else snapDropped = true;
          }
        }
        if (parsed.night !== undefined && !pushField(LS_GLOBAL.night, 'night', parsed.night, 'night')) return null;

        if (parsed.nightExp !== undefined) { const ne = parsed.nightExp; if (typeof ne !== 'string' || !isFinite(+ne) || +ne <= 0) { return null;
        } if (!pushField(LS_GLOBAL.nightExp, 'nightExp', ne, 'night override expiry')) return null;
        } // Beta 1.92 (audit F01): the expiry must be a finite positive epoch string - any other text used to sail through and poison the next boot
        // toggles restore inside this write set (rollback scope included); a backup without the field leaves them untouched
        if (parsed.settings !== undefined) { const cs = canonicalSettings(parsed.settings); if (cs === null) { return null; } entries.push([SETTINGS_KEY, cs]); }
        // validate and cap the incoming record even when the resident log wins whole
        if (parsed.fixlog !== undefined) { const cf = canonicalFixLog(parsed.fixlog); if (cf === null) { return null; } entries.push([LS.fixlog, cf]); }
      } else if (parsed.v === 1) { // a v1 backup's data map belongs to Route 5W and lands in the 5W slot
        if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) { return null; }
        const rk5 = routeKeys('5w');
        const pack5 = ROUTE_PACKS.find(p => p.id === '5w'); const pg5 = pack5 ? packGeometry(pack5) : null; // a v1 backup's names filter against the 5W pack's own set
        const dead5 = SHIPPED_PACK_IDS.has('5w') && !pack5; if (dead5) deadSkipped.push('5w'); // v1 data belongs to 5W alone: tombstoned here, its fields are skipped
        if (!dead5) for (const f of ROUTE_FIELDS) { const lv = parsed.data[LEGACY_KEYS[f]]; if (lv === undefined) continue; if (!pushField(rk5[f], f, lv, 'Route 5W ' + f, pg5 ? pg5.set : null)) return null; }
        if (parsed.data['snowroute.v2.night'] !== undefined && !pushField(LS_GLOBAL.night, 'night', parsed.data['snowroute.v2.night'], 'night')) return null;

      } else { return null; }
      let writes;
      try { writes = mergeRestoreEntries(entries, allPacks); }
      catch (e) { return null; }
      const report = { snapDropped, droppedNames: countUnknownNames(parsed, allPacks), deadSkipped };
      if (!writes.length && !restoredPacks) return null;
      const scope = allPacks.flatMap(p => [...slotKeys(p.id), routeKeys(p.id).finclean]);
      if (restoredPacks) scope.push(USERPACKS_KEY);
      scope.push(LS_GLOBAL.night, LS_GLOBAL.nightExp, SETTINGS_KEY, LS.fixlog);
      return { entries: writes, restoredPacks, packPriors, scope, ...report };
    };
    const packIds = Object.keys(restoredPacks || {});
    if (packIds.length) return (async () => {
      const stored = {};
      for (const rid of packIds) {
        const cur = await upGet(rid);
        if (cur === UP_READ_FAILED) { return null; }
        stored[rid] = cur;
      }
      const legacy = readUserPacks();
      if (legacy === null) { return null; }
      const additions = {};
      packPriors = {};
      allPacks = ROUTE_PACKS.slice();
      for (const rid of packIds) {
        // both homes can hold a resident definition (the legacy shadow wins at boot); runtime counts too
        const index = allPacks.findIndex(p => p.id === rid);
        const shadowed = Object.prototype.hasOwnProperty.call(legacy, rid);
        const current = shadowed ? legacy[rid] : stored[rid];
        if (shadowed || current !== null) {
          const checked = normalizePack(current, {});
          if (!checked.ok) { return null; }
          const pack = { ...checked.pack, id: rid };
          if (index < 0) allPacks.push(pack); else allPacks[index] = pack;
        } else if (index < 0) {
          additions[rid] = restoredPacks[rid];
          packPriors[rid] = null;
          allPacks.push(additions[rid]);
        }
      }
      restoredPacks = Object.keys(additions).length ? additions : null;
      return finishPlan();
    })();
    restoredPacks = null;
    return finishPlan();
  },
  /** @param {object} plan @returns {Promise<void>} */ async execute(plan) {
    const entries = plan.entries, restoredPacks = plan.restoredPacks, packPriors = plan.packPriors, SCOPE = plan.scope;
    PERSIST.fenceUp(); // the fence rises before the snapshot: a flush landing unfenced writes records rollback would silently discard
    // failure exits end here: fence down, flags re-armed - fenced work lives only in memory until flushed
    const restoreFenceDown = () => { PERSIST.fenceDown(); markDirty('trail'); markDirty('sess'); markDirty('aux'); markDirty('primary'); markDirty('fixlog'); };
    const snap = {}; let snapOk = true;
    for (const k of SCOPE) { const v = rawRead(k); if (v === RAW_READ_FAILED) snapOk = false; else snap[k] = v; }
    if (!snapOk) { restoreFenceDown(); return; }
    const rollback = () => { // the restore-all rollback on the verified primitives - every scoped key put back (or removed) and read back
      let okBack = true;
      for (const k of SCOPE) { const r = snap[k] === null ? txDel(k) : txSet(k, snap[k]); if (!r.ok) okBack = false; }
      return okBack;
    };
    const packsWritten = [];
    const rollbackPacks = async () => { // undo only verified store transactions owned by this restore, including inserts whose read-back failed
      let okBack = true;
      for (const rid of packsWritten) { const r = packPriors[rid] === null ? await upDel(rid) : await upPut(rid, packPriors[rid]); if (!r) okBack = false; }
      return okBack;
    };
    if (restoredPacks) { // The created-route definitions still land before any localStorage write.
      let packFail = null;
      for (const rid of Object.keys(restoredPacks)) {
        // IDB add enforces absence inside the write transaction, so a later-saved route cannot be overwritten.
        const pack = restoredPacks[rid];
        const inserted = await upTx('readwrite', store => store.add(pack));
        if (inserted === UP_TX_FAILED) { packFail = rid; break; }
        packsWritten.push(rid);
        const back = await upGet(rid);
        if (!back || back === UP_READ_FAILED || upCanon(back) !== upCanon(pack)) { packFail = rid; break; }
      }
      if (packFail) {
        if (!(await rollbackPacks())) showBanner('Restore failed', 'Your old data could not be fully put back - restore from a known-good backup');
        restoreFenceDown();
        return;
      }
      // If scoped storage changed during the IDB await, another writer landed: abort before any localStorage write.
      if (SCOPE.some(k => rawRead(k) !== snap[k])) {
        const restored = await rollbackPacks();
        restoreFenceDown();
        if (!restored) showBanner('Restore failed', 'The new routes could not be fully removed');
        return;
      }
    }
    for (const pair of entries) {
      const k = pair[0], v = pair[1];
      const wr = v === null ? txDel(k) : txSet(k, v); // a null entry discharges an armed finish-cleanup obligation - every entry written and verified by the same primitives
      if (!wr.ok) {
        const lsOk = rollback(); const pkOk = restoredPacks ? await rollbackPacks() : true; // a failure after phase 1 rolls both homes back; 'put back' is claimed only when both verifiably are
        if (!lsOk || !pkOk) showBanner('Restore failed', 'Your old data could not be fully put back - restore from a known-good backup');
        restoreFenceDown();
        return;
      }
    }
    if (restoredPacks) for (const rid of Object.keys(restoredPacks)) userPackCache[rid] = restoredPacks[rid]; // the cache joins the commit: it must never describe a state that was rolled back or never written
    // Only a slot that gained data discharges its finish-cleanup obligation, inside the verified write set.
    PERSIST.fenceUp(); markClean('trail'); markClean('aux'); markClean('sess'); // the reload's pagehide flush must not write the old in-memory trail/coverage over the restored data
    setTimeout(() => location.reload(), 600);
  },
};
function restoreBackup(parsed) { const planned = RESTORE.plan(parsed); if (!planned) return Promise.resolve(); if (typeof planned.then === 'function') return planned.then(plan => (plan ? RESTORE.execute(plan) : undefined)); return RESTORE.execute(planned); } // Beta 1.280: the doorway - RESTORE.plan validates and plans, RESTORE.execute transacts (above). The dispatch adds NO suspension of its own: a plan the planner produced synchronously is executed in the same tick, exactly as the one-flow restore ran (the RESTORE header carries the contract). Production doRestore semantics, unchanged: validate EVERYTHING before writing; snapshot; write + verify each; verified rollback on any failure.
let restoreInFlight = false; // single-flight: a second tap or file pick mid-restore must not start a competing restore
function doRestore() {
  if (restoreInFlight) return;
  let parsed;
  try { parsed = JSON.parse($('xText').value); } catch (e) { return; }
  restoreInFlight = true;
  Promise.resolve(restoreBackup(parsed)).catch(() => {}).finally(() => { restoreInFlight = false; }); // restoreBackup reports its own refusals; this catch is belt-and-braces so the flag can never wedge the door
}
$('xImp').addEventListener('click', () => doRestore());

// ===== PRELOAD (offline route maps) =====
function tileNums(lng, lat, z) { const n = 2 ** z; const x = Math.floor((lng + 180) / 360 * n); const la = lat * Math.PI / 180; const y = Math.floor((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n); return [x, y]; }
let preloadRunning = false; // single-flight - a second tap while a download runs starts no competing job
const OFFLINE_PACK_CAP_BYTES = 250 * 1024 * 1024; // the pack's disclosed budget (250 MB), the cap's one home: preload and Status both weigh against it
function fmtStoreSize(n) { // sizes in plain form (whole KB/MB, one decimal GB); unmeasured formats as nothing, never invented
  if (!(n >= 0)) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  if (n < 1024 * 1024 * 1024) return Math.round(n / (1024 * 1024)) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' GB';
}
function packTileEnum(src, pk, budget) { // the one tile enumeration per (source, pack): zoom policy, span budgeting and z15 margins live here only
  const urls = [];
  const maxz = Math.min(14, src.maxzoom || 14);
  const ex = pk.box || computeRouteBox(pk.roads || {});
  // y grows southward: looping y0..y1 downloaded zero tiles; wide zooms join at z8, the map's minimum
  if (ex) for (let z = 8;
  z <= maxz;
  z++) { const [x0, y1] = tileNums(ex.w, ex.n, z);
  const [x1, y0] = tileNums(ex.e, ex.s, z);
  const span = (x1 - x0 + 1) * (y0 - y1 + 1) * src.tiles.length;
  if (!(span <= budget)) continue;
  budget -= Math.max(0, span);
  for (let x = x0; x <= x1; x++) for (let y = y1; y <= y0; y++) for (const t of src.tiles) urls.push(t.replace('{z}', z).replace('{x}', x).replace('{y}', y));
  }
  // zooms 15-19 render from z15: cached over the core only (the whole box would be ~1,400 files)
  if ((src.maxzoom || 14) >= 15) { const rb = computeRouteBox(pk.roads || {});
  if (rb) { const cb = { w: rb.w - 0.005, s: rb.s - 0.004, e: rb.e + 0.005, n: rb.n + 0.004 };
  const [cx0, cy1] = tileNums(cb.w, cb.n, 15);
  const [cx1, cy0] = tileNums(cb.e, cb.s, 15);
  const span15 = (cx1 - cx0 + 1) * (cy0 - cy1 + 1) * src.tiles.length;
  if (span15 <= budget) { budget -= Math.max(0, span15); for (let x = cx0; x <= cx1; x++) for (let y = cy1; y <= cy0; y++) for (const t of src.tiles) urls.push(t.replace('{z}', 15).replace('{x}', x).replace('{y}', y)); } } }
  return { urls, budget };
}
function packTileUrls(pk) { // one pack's tiles (its area z8-14 plus its z15 core); sprites and glyphs belong to no route
  // the enumeration is budgeted (PACK_TILES_MAX per pack, spans counted before looping): a worldwide box means ~356.8M iterations
  const urls = new Set();
  let budget = PACK_TILES_MAX;
  for (const key of ['day', 'night']) {
    const stj = GL_STYLES[key];
    for (const srcName of Object.keys(stj.sources || {})) {
      const src = stj.sources[srcName];
      if (src.type !== 'vector' || !src.tiles) continue;
      const r = packTileEnum(src, pk, budget); budget = r.budget;
      for (const u of r.urls) urls.add(u);
    }
  }
  return urls;
}
function preloadUrlList() { // the set: the union over every known pack, from pack data only, identical before any route is chosen
  const urls = new Set();
  const budgets = new Map(); // the budget travels in a Map keyed by the pack (the nesting is style > source > pack)
  for (const key of ['day', 'night']) {
    const stj = GL_STYLES[key]; // the styles are embedded objects (pmstyles.js) - already in the shell, nothing to fetch
    const spr = Array.isArray(stj.sprite) ? stj.sprite[0].url : stj.sprite;
    if (spr) { urls.add(spr + '.json'); urls.add(spr + '.png'); urls.add(spr + '@2x.json'); urls.add(spr + '@2x.png'); }
    if (stj.glyphs) { const stack = 'Noto Sans Regular'; for (let a = 0; a <= 255; a++) urls.add(stj.glyphs.replace('{fontstack}', stack).replace('{range}', a * 256 + '-' + (a * 256 + 255))); } // the stack GL actually requests per style
    for (const srcName of Object.keys(stj.sources || {})) {
      const src = stj.sources[srcName];
      if (src.type !== 'vector' || !src.tiles) continue;
      for (const pk of ROUTE_PACKS) {
        const r = packTileEnum(src, pk, budgets.get(pk) ?? PACK_TILES_MAX); // this loop keeps only the budget thread and the nesting the fingerprint's order depends on
        budgets.set(pk, r.budget);
        for (const u of r.urls) urls.add(u);
      }
    }
  }
  return [...urls];
}
$('xPre').addEventListener('click', async ev => {
  if (!tapGuard('xPre', ev)) return;
  if (preloadRunning) { return; }
  preloadRunning = true; syncWake(); let releasePack = () => {}; // the download holds its own wake want from this flip until the exits below clear it
  const st = $('xPreStat'); st.textContent = 'Preparing map list…';
  // files save via the worker as they pass through: no controlling worker, no saves - confirm control first
  if (location.protocol !== 'file:') {
    let swOk = ('serviceWorker' in navigator) && !!navigator.serviceWorker.controller;
    if (!swOk) {
      try { await Promise.race([navigator.serviceWorker.ready, new Promise(res => setTimeout(res, 2500))]); } catch (e) {}
      if (('serviceWorker' in navigator) && !navigator.serviceWorker.controller) await Promise.race([
        new Promise(res => navigator.serviceWorker.addEventListener('controllerchange', res, { once: true })),
        new Promise(res => setTimeout(res, 3000))]);
      swOk = ('serviceWorker' in navigator) && !!navigator.serviceWorker.controller;
    }
    if (!swOk) { st.textContent = 'Offline maps NOT saved: the part of the app that saves them is not running' + (window.__swErr ? ' (' + window.__swErr + ')' : '') + '. The live map is unaffected.';
    preloadRunning = false;
    syncWake();
    return;
    } // Beta 1.57: wording stands on its own (second audit, item 5)
  }
  try {
    releasePack = await takePackWriteTurn(); // the writers' turn is taken first: a pre-turn snapshot can be overtaken by a preceding writer's download
    await initUserPacks(); // refresh registrations: another tab's route is persisted but unregistered here; a stale manifest would orphan its tiles
const list = preloadUrlList();
    let pruneProven = false; // the prune runs only on a proven manifest: fresh store read succeeds, every route's tiles inside it
    try { const storedNow = await upGetAll();
    if (storedNow) { const wantP = new Set(list.map(u => { try { return new URL(u).href; } catch (e) { return u; } })); pruneProven = Object.keys(storedNow).every(id => { const nv = normalizePack(storedNow[id],
      {}); if (!nv.ok) return false; nv.pack.id = id; for (const u of packTileUrls(nv.pack)) { let h = u; try { h = new URL(u).href; } catch (e) {} if (!wantP.has(h)) return false; } return true; }); } } catch (e) { pruneProven = false;
    }
    // the pack lives in its own cache ('snowroute-offline-v1'): served first, safe from browsing eviction
    let packCache = null; try { packCache = await caches.open('snowroute-offline-v1'); } catch (e) { packCache = null; }
    let done = 0, nextU = 0;
    // budgeted at its only write path: weigh stored files per URL first, so re-downloads replace weight, never double-count
    let capHit = false, packBytes = 0; const packSizes = new Map();
    if (packCache) { try { for (const req of await packCache.keys()) { try { const r0 = await packCache.match(req);
    if (r0) { const sz0 = (await r0.blob()).size; packSizes.set(req.url, sz0); packBytes += sz0; } } catch (e) {} } } catch (e) {} }
    // prune what the manifest no longer names: orphans' weighed bytes otherwise block later downloads
    if (packCache && pruneProven) { const want = new Set(list.map(u => { try { return new URL(u).href; } catch (e) { return u; } }));
    try { for (const req of await packCache.keys()) { if (!want.has(req.url)) { try { if (await packCache.delete(req.url)) { packBytes -= packSizes.get(req.url) || 0;
    packSizes.delete(req.url);
    } } catch (e) {} } } } catch (e) {} } // the prune runs only under the pruneProven gate computed above the manifest: an unproven registration read preserves the cache whole
    // a retry fetches only census-missing entries; a complete pack's press stays the full refresh
    const hrefOf = u => { try { return new URL(u).href; } catch (e) { return u; } };
    const missing = list.filter(u => !packSizes.has(hrefOf(u)));
    const targets = missing.length ? missing : list;
    done = list.length - targets.length; // entries already held count toward the progress below from the start
    // the count sweeps up to the real number (30ms easing): workers finish in clusters, so per-200 repaints leapt
    const bar = $('xPreBar'), fill = $('xPreFill');
    let shown = 0;
    // a readout shows a percentage, never a count; the completion line is an outcome report and keeps counts
    const paint = () => { fill.style.width = (list.length ? shown / list.length * 100 : 0) + '%'; st.textContent = 'Downloading… ' + (list.length ? Math.round(shown / list.length * 100) : 0) + '%'; };
    bar.classList.add('on'); paint();
    const sweep = setInterval(() => { if (shown < done) { shown = Math.min(done, shown + Math.max(1, Math.ceil((done - shown) / 5))); paint(); } }, 30);
    // cache 'reload': a download must not be answered from the pack being refreshed (the worker honours it)
    const preFetch = async (u) => { if (capHit) return; const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 30000); try { const res = await fetch(u, { mode: 'cors', signal: ctl.signal, cache: 'reload' }); if (res && res.ok && packCache) { let sz = -1; try { sz = (await res.clone().blob()).size; } catch (e) { sz = -1; } // Beta 1.183 (storage audit §3 item 4): the write is WEIGHED before it lands - a file that would carry the pack over OFFLINE_PACK_CAP_BYTES is refused and stops the download (capHit ends the workers below), so the pack can never grow past the cap through this, its only, write path; a GROWING file's extra bytes are RESERVED in packBytes synchronously before the write is awaited, so the five workers cannot all pass the check against the same stale total (Codex P2, PR #21), a failed write releases its reservation, and a SHRINKING replacement reserves nothing and frees its bytes only after its write succeeds - freeing them earlier would let another worker spend headroom that a failed shrink silently takes back; a file whose size cannot be read is stored unweighed rather than lost
        let href = u; try { href = new URL(u).href; } catch (e) {}
        if (sz >= 0) { const prevSz = packSizes.get(href) || 0;
        const dSz = sz - prevSz;
        if (dSz > 0 && packBytes + dSz > OFFLINE_PACK_CAP_BYTES) capHit = true;
        else { if (dSz > 0) packBytes += dSz;
        try { await packCache.put(u, res.clone());
        packSizes.set(href, sz);
        if (dSz < 0) packBytes += dSz;
        } catch (e) { if (dSz > 0) packBytes -= dSz;
        /* a failed pack write releases its reservation (growth only) and never confirms in the count below */ } } }
        else { try { await packCache.put(u, res.clone()); } catch (e) { /* a failed pack write simply never confirms in the count below */ } } } } catch (e) { /* failures and timeouts simply never confirm below */ } clearTimeout(to); }; // Beta 1.92 (audit F07): one stalled file gives up at 30 s instead of holding the whole job open forever. Beta 1.94 (F-03): a good response is ALSO stored into the pack cache by the page itself - the worker's pass-through copy in the browsing cache is the duplicate that gets cleaned up below, never the guarantee
    const preWorker = async () => { while (nextU < targets.length && !capHit) { const u = targets[nextU++]; await preFetch(u); done++; } }; // five at a time: one at a time was the slowest wait; a cap stop ends workers too
    await Promise.all([preWorker(), preWorker(), preWorker(), preWorker(), preWorker()]);
    clearInterval(sweep); shown = done; paint();
    let saved = 0; const confirmed = [];
    // report only resources confirmed in the pack cache: a browsing-cache-only file could still be evicted
    for (const u of list) { try { if (packCache ? await packCache.match(u) : await caches.match(u)) { saved++; confirmed.push(u); } } catch (e) {} }
    // pass-through copies leave the browsing cache, confirmed URLs only: an unconfirmed file must keep its copy
    if (packCache) { try { const tc = await caches.open('snowroute-tiles-v1'); for (const u of confirmed) await tc.delete(u); } catch (e) {} }
    if (packCache && saved === list.length) lsSet(PACKMIG_KEY, packMigFingerprint(list)) /* write-safe: a missing fingerprint only sends the next boot through verification */;
    fill.style.width = (list.length ? saved / list.length * 100 : 0) + '%'; // the bar settles on the CONFIRMED fraction, matching the line below
    // the record carries both counts: union saved/total and this route's own subset, so completion accounts per route
    let routeSaved = saved, routeTotal = list.length;
    if (activeRoute) { const sub = packTileUrls(activeRoute); const confSet = new Set(confirmed); routeTotal = sub.size; routeSaved = 0; for (const u of sub) if (confSet.has(u)) routeSaved++; }
    lsSet(LS.pre, JSON.stringify({ at: Date.now(), saved, total: list.length, routeSaved, routeTotal })) /* write-safe: Status counts from the cache census; this record is only its fallback */;
    st.textContent = capHit ? 'Offline maps: saved ' + saved + ' of ' + list.length + ' files. Stopped at the ' + fmtStoreSize(OFFLINE_PACK_CAP_BYTES) + ' storage limit' : 'Offline maps: saved ' + saved + ' of ' + list.length + ' files (tiles are kept by the offline cache)'; // Beta 1.183 (storage audit §3 item 4): a cap stop is reported in the completion line's own idiom - the confirmed saved-so-far count plus the reason; what is already stored stays stored (a partial pack is a supported, disclosed state - Status renders it 'Partial')
  // when a download ends with Status on screen, its lines re-read the pack state it just wrote
  } catch (e) { st.textContent = 'Preload failed. Check connection and retry.'; } finally { preloadRunning = false; syncWake(); releasePack(); if ($('setStatusPane').classList.contains('on')) renderStatus(false); }
});

// ===== UPDATE CHECK =====
let updState = ''; // state: '' unchecked this session, 'ok' current, 'avail' newer served - in-memory on purpose, never stale
let storagePersist = null; // the persist() answer, recorded: true exempt, false refused, null no answer; read at pane open, never persisted
// the version ordering the update check compares by - two numeric components, nothing else parses
function parseVerLabel(s) { const m = typeof s === 'string' ? s.trim().match(/^Beta (\d+)\.(\d+)$/) : null; return m ? [Number(m[1]), Number(m[2])] : null; }
// the one version probe: the worker answers updprobe from the network itself, never its cached shell
async function probeServedVer(signal) {
  const r = await fetch(location.pathname + '?updprobe=1&v=' + Date.now(), { cache: 'no-store', signal });
  if (!r.ok) return null;
  const m = (await r.text()).match(/id="ver">([^<]+)</);
  return m ? m[1].trim() : null;
}
$('updBtn').addEventListener('click', async ev => {
  if (!tapGuard('updBtn', ev)) return;
  const updDone = () => { showSetPane('setStatusPane'); renderStatus(true); }; // the toasts are cut (Andrew's keep-list), so a finished check lands on the version row, rendered fresh
  try {
    if (navigator.serviceWorker) { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); }
    const served = await probeServedVer();
    const mine = $('ver').textContent.trim();
    if (!served) { updState = 'fail'; updDone(); return; }
    if (served === mine) { updState = 'ok'; updDone(); return; }
    const sv = parseVerLabel(served), mv = parseVerLabel(mine); // only a strictly newer build installs: older is reported, unparseable never installed on a guess
    if (sv && mv) {
      if (sv[0] < mv[0] || (sv[0] === mv[0] && sv[1] < mv[1])) { updState = 'older'; updDone(); return; }
      updState = 'avail';
      setTimeout(() => location.replace(location.pathname + '?updnav=1&v=' + Date.now()), 900); // the reload carries updnav: the worker loads the version over its network path, not the cached shell
      return;
    }
    updState = 'diff';
  } catch (e) { updState = 'fail'; } // a failure is reported as failed: reloading 'to be safe' lands on the same cached shell
  updDone(); // 'diff' and the catch's 'fail' land here: same trip to the version row as the early returns
});

// updnav is stripped at boot, and window.history is spelled out: the app's clean-history array shadows the bare name, which throws
try { if (/(^|[?&])updnav=/.test(location.search)) window.history.replaceState(null, '', location.pathname); } catch (e) {}

// ===== FAN / NIGHT / FLIP / HOME =====
const ICONS = { // the mint table ships empty: renderIcons fills it from the active pack at boot, before first paint
  streets: '', /* the straight-on road: a straight slab with centre dashes (Andrew's pick) */
  pace: '',
  routes: '', /* the route-path glyph for the Routes tab (Andrew's pick) */
  clear: '',
  menu: '',
  upd: '',
  flip: '',
  moon: '',
  sun: '',
  home: '',
  gps: '',
  centre: '', /* the re-centre glyph: stroked ring, four ticks, filled centre dot - ported verbatim from the approved mockup artwork */
  gear: '', /* the cog: 12 teeth, three spokes, one path; spokes overlap ring and hub so the silhouette connects */
  pin: '', /* the Streets row jump-to pin */
  note: '', /* the note glyph for rows and the selection pop-up */
  exp: ''
};
// Glyph Neue: Icons8 silhouettes filled through each PNG's alpha mask (near-black by day, white at night)
const GLYPH_ICONS = {
  gps: { d: 'data:image/webp;base64,@@GLYPH:icons-gps-d@@', n: 'data:image/webp;base64,@@GLYPH:icons-gps-n@@' },
  routes: { d: 'data:image/webp;base64,@@GLYPH:icons-routes-d@@', n: 'data:image/webp;base64,@@GLYPH:icons-routes-n@@' },
  home: { d: 'data:image/webp;base64,@@GLYPH:icons-home-d@@', n: 'data:image/webp;base64,@@GLYPH:icons-home-n@@' },
  clear: { d: 'data:image/webp;base64,@@GLYPH:icons-clear-d@@', n: 'data:image/webp;base64,@@GLYPH:icons-clear-n@@' },
  gear: { d: 'data:image/webp;base64,@@GLYPH:icons-gear-d@@', n: 'data:image/webp;base64,@@GLYPH:icons-gear-n@@' },
  streets: { d: 'data:image/webp;base64,@@GLYPH:icons-streets-d@@', n: 'data:image/webp;base64,@@GLYPH:icons-streets-n@@' },
  pace: { d: 'data:image/webp;base64,@@GLYPH:icons-pace-d@@', n: 'data:image/webp;base64,@@GLYPH:icons-pace-n@@' },
  moon: { d: 'data:image/webp;base64,@@GLYPH:icons-moon-d@@', n: 'data:image/webp;base64,@@GLYPH:icons-moon-n@@' },
  sun: { d: 'data:image/webp;base64,@@GLYPH:icons-sun-d@@', n: 'data:image/webp;base64,@@GLYPH:icons-sun-n@@' },
  centre: { d: 'data:image/webp;base64,@@GLYPH:icons-centre-d@@', n: 'data:image/webp;base64,@@GLYPH:icons-centre-n@@' }
};
const GLYPH_GPS_STATES = { vd: 'data:image/webp;base64,@@GLYPH:gps-states-vd@@', vn: 'data:image/webp;base64,@@GLYPH:gps-states-vn@@',
  rd: 'data:image/webp;base64,@@GLYPH:gps-states-rd@@', rn: 'data:image/webp;base64,@@GLYPH:gps-states-rn@@' };
// the Glyph extras: the same alpha-mask fills, for pin/note and the seven Pace stat glyphs
const GLYPH_EXTRAS = {
  pin: { d: 'data:image/webp;base64,@@GLYPH:extras-pin-d@@', n: 'data:image/webp;base64,@@GLYPH:extras-pin-n@@' },
  note: { d: 'data:image/webp;base64,@@GLYPH:extras-note-d@@', n: 'data:image/webp;base64,@@GLYPH:extras-note-n@@' }
};
// the create search bar's glyphs (same alpha-fill treatment); the results marker is the set's own pin, not here
const GLYPH_CREATE = {
  search: { d: 'data:image/webp;base64,@@GLYPH:create-search-d@@',
    n: 'data:image/webp;base64,@@GLYPH:create-search-n@@' },
  cancel: { d: 'data:image/webp;base64,@@GLYPH:create-cancel-d@@',
    n: 'data:image/webp;base64,@@GLYPH:create-cancel-n@@' },
  back: { d: 'data:image/webp;base64,@@GLYPH:create-back-d@@',
    n: 'data:image/webp;base64,@@GLYPH:create-back-n@@' }
};
const GLYPH_PACE_ICONS = {
  clock: { d: 'data:image/webp;base64,@@GLYPH:pace-clock-d@@', n: 'data:image/webp;base64,@@GLYPH:pace-clock-n@@' },
  road: { d: 'data:image/webp;base64,@@GLYPH:pace-road-d@@', n: 'data:image/webp;base64,@@GLYPH:pace-road-n@@' },
  flag: { d: 'data:image/webp;base64,@@GLYPH:pace-flag-d@@', n: 'data:image/webp;base64,@@GLYPH:pace-flag-n@@' },
  list: { d: 'data:image/webp;base64,@@GLYPH:pace-list-d@@', n: 'data:image/webp;base64,@@GLYPH:pace-list-n@@' },
  cal: { d: 'data:image/webp;base64,@@GLYPH:pace-cal-d@@', n: 'data:image/webp;base64,@@GLYPH:pace-cal-n@@' },
  gauge: { d: 'data:image/webp;base64,@@GLYPH:pace-gauge-d@@', n: 'data:image/webp;base64,@@GLYPH:pace-gauge-n@@' },
  trail: { d: 'data:image/webp;base64,@@GLYPH:pace-trail-d@@', n: 'data:image/webp;base64,@@GLYPH:pace-trail-n@@' }
};
const GLYPH_X = { corner: 'data:image/webp;base64,@@GLYPH:x-corner@@',
  bottom: 'data:image/webp;base64,@@GLYPH:x-bottom@@' }; // One ✕ image, two placements; mask-position picks the placement.
// ===== THE ICON SET ===== Glyph Neue is the one set: ten icons, Locate faces, extras, Pace glyphs
const MASK_PACKS = { // one row stands: the Glyph set's artwork maps, read by renderIcons from here
  glyph: { icons: GLYPH_ICONS, states: GLYPH_GPS_STATES, extras: GLYPH_EXTRAS, pace: GLYPH_PACE_ICONS, x: GLYPH_X }
};
const PACK_WRAP = { gps: 'T', routes: 'T', home: 'T', clear: 'T', gear: 'T', streets: 'D', pace: 'D', moon: 'D', sun: 'D', centre: 'D' }; // the 1.217 wrapper boxes: T = the tab 24px box, D = the dock 27px box
const GLYPH_MENU = { // two white faces live on the menus in both themes: the Back disc and the route's disc check
  back: 'data:image/webp;base64,@@GLYPH:menu-back@@', check: 'data:image/webp;base64,@@GLYPH:menu-check@@' };
function nightBtnHTML() { // both glyphs stacked: the moon wears its day art, the sun its night art; the theme shows one (recipe 09)
  const MAP = MASK_PACKS.glyph.icons;
  const wrap = (k, u) => `<span class="pwrap${PACK_WRAP[k]}"><img class="pico" data-k="${k}" src="${u}"></span>`;
  return `<span class="nbIco nbMoon">${wrap('moon', MAP.moon.d)}</span><span class="nbIco nbSun">${wrap('sun', MAP.sun.n)}</span>`;
}
function stampNightBtn() { // the faces persist across theme flips: re-stamping would birth them at their end state and kill the crossfade
  const b = $('nightBtn'); if (!b) return;
  const t = document.createElement('span'); t.innerHTML = nightBtnHTML();
  if (b.innerHTML !== t.innerHTML) b.innerHTML = t.innerHTML;
}
function renderIcons() { // re-mints ICONS from the active pack (theme + Locate state) and stamps every host; deterministic calls only
  const night = document.body.classList.contains('night');
  const MP = MASK_PACKS.glyph; // the one set's maps - read by the mint below AND by the ✕ stamp loops after it
  {
    const MAP = MP.icons, ST = MP.states; // the pack's day/night artwork maps + its Locate state faces
    const gb = $('gpsBtn'); const rec = gb.classList.contains('rec'), on = gb.classList.contains('on');
    for (const k of Object.keys(MAP)) {
      let u;
      if (k === 'gps') u = rec ? (night ? ST.rn : ST.rd) : on ? (night ? ST.vn : ST.vd) : (night ? MAP.gps.n : MAP.gps.d);
      else u = night ? MAP[k].n : MAP[k].d;
      ICONS[k] = `<span class="pwrap${PACK_WRAP[k]}"><img class="pico" data-k="${k}" src="${u}"></span>`;
    }
    const EX = MP.extras, PM = MP.pace;
    for (const k of Object.keys(EX)) ICONS[k] = `<img class="xico" data-k="${k}" src="${night ? EX[k].n : EX[k].d}">`;
    for (const k of Object.keys(PM)) PACE_ICONS[k] = `<img class="xico" data-k="${k}" src="${night ? PM[k].n : PM[k].d}">`;
  }
  $('streetsBtn').innerHTML = ICONS.streets; $('paceBtn').innerHTML = ICONS.pace; $('centreBtn').innerHTML = ICONS.centre;
  ['homeBtn', 'gpsBtn', 'clearBtn', 'routesBtn'].forEach(id => { $(id).querySelector('.tabIco').innerHTML = ICONS[{ homeBtn: 'home', gpsBtn: 'gps', clearBtn: 'clear', routesBtn: 'routes' }[id]]; });
  $('setBtn').querySelector('.tabIco').innerHTML = ICONS.gear;
  $('selNote').innerHTML = ICONS.note;
  stampNightBtn();
  // the pin host retired with the pin (the Locate pill is text); notes and stat icons re-stamp
  document.querySelectorAll('.ntIco, .nmNote, .cvNoteIco').forEach(el => { el.innerHTML = ICONS.note; });
  { const bx = $('crExit'); if (bx) bx.innerHTML = `<img class="crBackIco" alt="" src="${night ? GLYPH_CREATE.back.n : GLYPH_CREATE.back.d}">`; const si = $('crSearchIco'); if (si) si.innerHTML = `<img class="crMagIco" alt="" src="${night ? GLYPH_CREATE.search.n : GLYPH_CREATE.search.d}">`; const cl = $('crClear'); if (cl) cl.innerHTML = `<img class="crClrIco" alt="" src="${night ? GLYPH_CREATE.cancel.n : GLYPH_CREATE.cancel.d}">`; } // Beta 1.227: the create bar's hosts - the back pill wears the theme variant of the arrow. Beta 1.232: the bar is monochrome now, so the magnifier and the clear disc wear the theme variant too - dark on the white day bar, white on the night glass. Beta 1.243: the search wrap wears the white pill in BOTH themes now, so the magnifier and the clear disc wear the DARK variant in both themes - they follow the bar's surface, not the app theme (white glyphs would vanish on the white night bar); the back pill still flips with the theme, so its arrow keeps the theme variant. Beta 1.244: the bar is dark at night again (the shared token black), so the magnifier and the clear disc wear the theme variant once more - the 1.232 stamps restored; the 1.243 both-themes dark stamps retire with the scope error they served
  document.querySelectorAll('.crPin').forEach(el => { el.innerHTML = ICONS.pin; }); // the result rows' pins re-stamp with the extras, like the note hosts above
  document.querySelectorAll('.statgrid .ic[data-ic]').forEach(el => { el.innerHTML = PACE_ICONS[el.getAttribute('data-ic')]; });
  for (const id of ['sheetClose', 'paceClose', 'xClose']) { const el = $(id); if (el) el.innerHTML = `<img class="xico" alt="Close" src="${MP.x.corner}">`; } // the corner closes wear the pack artwork
  for (const id of ['rmClose', 'setClose']) { const el = $(id);
  if (el) el.innerHTML = `<img class="xico" alt="Close" src="${MP.x.bottom}">`;
  } // the bottom-centre pair on blue menus: the white job (the knocked-out ✕ shows the blue through it)
  document.querySelectorAll('.rmBack').forEach(el => { el.innerHTML = `<img class="rmBackIco" alt="" src="${GLYPH_MENU.back}"> Back`; });
  // every blue-menu Back wears the Back To disc; the markup's static arrow is the no-JS fallback only
}
$('streetsBtn').innerHTML = ICONS.streets; $('paceBtn').innerHTML = ICONS.pace; $('centreBtn').innerHTML = ICONS.centre; // the re-centre button wears the standard crosshair glyph; the Locate tab keeps its navigation arrow, untouched
// Backup and Update carry no tab icons anymore - they are text rows on the blue settings panes
['homeBtn', 'gpsBtn', 'clearBtn', 'routesBtn'].forEach(id => { $(id).querySelector('.tabIco').innerHTML = ICONS[{ homeBtn: 'home', gpsBtn: 'gps', clearBtn: 'clear', routesBtn: 'routes' }[id]]; });
$('setBtn').querySelector('.tabIco').innerHTML = ICONS.gear;
$('selNote').innerHTML = ICONS.note;
renderIcons(); // this puts every host on the Glyph set (current theme, Locate state) before anything is tapped or painted
// Settings: a blue full-screen takeover like Routes; it always lands on the main pane, version re-synced on open
$('setBtn').addEventListener('click', ev => { if (!tapGuard('setBtn', ev)) return; showSetPane('setMainPane'); $('setVer').textContent = $('ver').textContent; $('setMenu').classList.add('open'); });
const SET_PANES = ['setMainPane', 'setStatusPane', 'setJobPane', 'setChimePane', 'setBackupPane', 'setAboutPane'];
// Backup landing re-renders the debug switch from the runtime flag; main landing refreshes the last-backup line
function showSetPane(id) { for (const p of SET_PANES) $(p).classList.toggle('on', p === id); if (id === 'setMainPane') renderBakAge(); if (id === 'setBackupPane') renderSwitch($('swFixLog'), fixLogIsEnabled()); }
$('setClose').addEventListener('click', () => $('setMenu').classList.remove('open'));
$('setBack').addEventListener('click', () => { const onBackup = $('setBackupPane').classList.contains('on'); if (onBackup && xMode === 'text') showX('restore'); else if (onBackup && xMode === 'restore') showX('menu'); else showSetPane('setMainPane'); }); // Beta 1.89: one Back walks the backup tree up a level at a time; from the backup menu it lands on the settings main pane. Beta 1.170 (Carbon fix round Phase 2, C-06): the xMode walk belongs to the BACKUP pane alone - through 1.169 it ran wherever Back was pressed, so with xMode left at 'text'/'restore' by an earlier Backup visit, Back on any other Settings pane reset the hidden Backup view instead of returning to the main pane.
$('exportBtn').addEventListener('click', ev => { if (!tapGuard('exportBtn', ev)) return; openExport(); });
function noteExported() { // the 'Last backup' stamp rides the export record as one added field, stamped only at a successful hand-off
  try { const st = parseJ(lsGet(LS.exp), {}); st.exportedAt = Date.now(); lsSet(LS.exp, JSON.stringify(st))
    /* write-safe: the backup already succeeded; only its timestamp can go stale */;
  } catch (e) { /* the line is a courtesy - a failed stamp never breaks an export */ }
}
async function shareBackup() { // one tap backs up and asks where to save (file share, text share, download); cancelling is a shrug
  const b = buildBackup();
  if (!b) { shareRecovery(true); return; } // one Backup button: a build failure falls back automatically to the recovery export; a cancelled share never reaches here
  let f = null; try { f = new File([b], 'snowroute-backup.json', { type: 'application/json' }); } catch (e) { /* older engine: the text share below still works */ }
  if (f && navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); noteExported(); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  if (navigator.share) { try { await navigator.share({ text: b }); noteExported(); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  dl(new Blob([b], { type: 'application/json' }), 'snowroute-backup.json'); noteExported();
}
async function shareRecovery(viaFallback) {
  const b = buildRecovery();
  if (!b) { return; }
  const backupHandedOff = how => { // the fallback banner names what actually happened: shared, or downloaded
    noteExported();
    if (viaFallback) showBanner('Backup not saved', 'A recovery backup was ' + how + ' instead');
  };
  let f = null; try { f = new File([b], 'snowroute-recovery.json', { type: 'application/json' }); } catch (e) { /* older engine: the text share below still works */ }
  if (f && navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); backupHandedOff('shared'); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  if (navigator.share) { try { await navigator.share({ text: b }); backupHandedOff('shared'); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  dl(new Blob([b], { type: 'application/json' }), 'snowroute-recovery.json'); backupHandedOff('downloaded');
}
$('updBtn').addEventListener('click', () => $('setMenu').classList.remove('open')); // the menu steps aside for the update check: its result reads in the System Health version row

// ===== SETTINGS PANES ===== six panes on the blue takeover; the behaviour settings themselves live in app1
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
// ---- Display and Sound ----
function renderJob() {
  renderSwitch($('swAwake'), settings.awake);
  renderSwitch($('swVib'), settings.vib);
  $('chimeVal').textContent = settings.chime ? CHIME_SOUNDS[settings.chimeSound].name : 'Off';
}
$('swAwake').addEventListener('click', () => { const prevAwake = settings.awake; settings.awake = !settings.awake; if (!saveSettings()) { settings.awake = prevAwake; showBanner('Not saved');
} renderSwitch($('swAwake'), settings.awake); if (settings.awake !== prevAwake) syncWake(); }); // a failed save reverts the switch and says so; syncWake runs only on a saved flip
$('swVib').addEventListener('click', () => { const prevVib = settings.vib; settings.vib = !settings.vib; if (!saveSettings()) { settings.vib = prevVib; renderSwitch($('swVib'), settings.vib); showBanner('Not saved'); return;
} renderSwitch($('swVib'), settings.vib); if (settings.vib && navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} } }); // a failed save reverts the value and the render; a saved flip buzzes where supported
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
function onStreetComplete() { // called the moment a street flips complete: feedback only, guarded end to end, can never throw into marking
  try {
    if (settings.chime) playChime(settings.chimeSound, 1);
    if (settings.vib && navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} } // iOS apps cannot vibrate: a designed no-op there (the toggle is a persisted placeholder for a possible native app)
  } catch (e) {}
}
function onFinishFeedback() { // the Finish fanfare, committed path only: the sound twice around (Melody once, already four notes) plus vibration
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
    // one fixed 30px right slot per row: the tick on the selected row, the play affordance on the rest
    row.innerHTML = '<div class="m-togTxt"><div class="m-togLbl">' + snd.name + '</div><div class="m-togDesc">' + snd.desc + '</div></div>' + (sel ? '<div class="m-selTick">&#10003;</div>' : '<div class="m-play">&#9654;</div>');
    row.addEventListener('click', () => { const prevSnd = settings.chimeSound; settings.chimeSound = key; if (!saveSettings()) { settings.chimeSound = prevSnd; renderChime(); renderJob(); showBanner('Not saved'); return;
    } renderChime(); renderJob(); playChime(key, 1); }); // a tap previews and selects; a failed save reverts and says so
    list.appendChild(row);
  }
}
$('swChime').addEventListener('click', () => { const prevChime = settings.chime; settings.chime = !settings.chime; if (!saveSettings()) { settings.chime = prevChime; renderSwitch($('swChime'), settings.chime); renderJob();
showBanner('Not saved'); return; } renderSwitch($('swChime'), settings.chime); renderJob(); }); // Beta 1.113 (round 112, CG-112-03): same save-honesty as the vibration switch - a failed save reverts and warns
$('chimeBack').addEventListener('click', () => { renderJob(); showSetPane('setJobPane'); });
// ---- Status: maps + health, every value read live at pane open ----
async function packState() { // how much of the manifest is in the pack cache (record as fallback), with per-route counts and bytes
  const list = preloadUrlList(); const total = list.length;
  let cached = -1;
  let bytes = -1; // the pack's bytes ride the same census: -1 = unmeasured, and Status omits rather than invents a size
  let haveSet = null;
  try {
    if ('caches' in window) {
      const oc = await caches.open('snowroute-offline-v1');
      const reqs = await oc.keys();
      const have = new Set(reqs.map(r => r.url));
      haveSet = have;
      cached = 0;
      for (const u of list) { let href = u; try { href = new URL(u).href; } catch (e) {} if (have.has(href)) cached++; }
      bytes = 0; // the pack weighed as well as counted; renderStatus is only caller, so the reads happen once at open
      for (const req of reqs) { try { const resp = await oc.match(req); if (resp) bytes += (await resp.blob()).size; } catch (e) {} }
    }
  } catch (e) { cached = -1; }
  if (cached < 0) { const rec = parseJ(lsGet(LS.pre), null); cached = rec ? Math.min(total, rec.saved || 0) : 0; }
  const countsByRoute = ROUTE_PACKS.map(pk => { const sub = packTileUrls(pk); let c = 0; // a route's share against the same census (chrome belongs to none); on failure its stored record stands in
    if (haveSet) { for (const u of sub) { let href = u; try { href = new URL(u).href; } catch (e) {} if (haveSet.has(href)) c++; } }
    else { const rec = parseJ(lsGet(routeKeys(pk.id).pre), null); c = rec ? Math.min(sub.size, rec.routeSaved || 0) : 0; }
    return { id: pk.id, name: pk.name, total: sub.size, cached: c }; });
  return { total, cached, bytes, complete: total > 0 && cached >= total, countsByRoute };
}
function setHealth(icoId, valId, state, text) { // 'ok' green tick / 'warn' amber / 'idle' neutral dash: an unknown state is never painted green
  const ico = $(icoId);
  ico.textContent = state === 'ok' ? '✓' : state === 'warn' ? '⚠' : '–';
  ico.className = 'm-chk' + (state === 'warn' ? ' warn' : state === 'idle' ? ' idle' : '');
  $(valId).textContent = '– ' + text;
}
async function renderStatus(resetStat) {
  const ps = await packState();
  const multiRoute = ROUTE_PACKS.length > 1; // the counts are the union over every route: the label says so when more than one route exists
  const area = multiRoute ? ROUTE_PACKS.length + ' routes' : ((activeRoute ? activeRoute.name : 'Route') + ' area');
  const sizeTxt = ps.bytes >= 0 ? ' · ' + fmtStoreSize(ps.bytes) : ''; // the measured size rides the same line; unmeasured omits it - the line never carries an invented figure
  if (ps.complete) { $('stMapsLine').innerHTML = 'Offline maps: Downloaded <span class="m-tick">&#10003;</span>'; $('stMapsSub').textContent = ps.total + ' files' + sizeTxt + ' · ' + area; }
  else if (ps.cached > 0) { $('stMapsLine').textContent = 'Offline maps: Partial'; $('stMapsSub').textContent = ps.cached + ' of ' + ps.total + ' files' + sizeTxt + ' · ' + area; }
  else { $('stMapsLine').textContent = 'Offline maps: Not downloaded'; $('stMapsSub').textContent = ps.total + ' files' + sizeTxt + ' · ' + area; }
  if (multiRoute) { const act = ps.countsByRoute.find(r => activeRoute && r.id === activeRoute.id);
  if (act) $('stMapsSub').textContent += ' · this route: ' + act.cached + ' of ' + act.total;
  } // the active route's own share, named as its own - never the union wearing its name
  $('xPre').textContent = ps.complete ? 'Re-download' : 'Download';
  $('stDel').style.display = ps.cached > 0 ? '' : 'none';
  if (resetStat && !preloadRunning) { const rec = parseJ(lsGet(LS.pre), null) || ROUTE_PACKS.map(p => parseJ(lsGet(routeKeys(p.id).pre), null)).find(r => r && r.saved > 0) || null; $('xPreStat').textContent = rec ? 'Offline maps downloaded ' + new Date(rec.at).toLocaleDateString() + ' (' + rec.saved + ' files)' : 'Offline maps not downloaded yet. Download for offline use.'; $('xPreBar').classList.remove('on'); $('xPreFill').style.width = '0%'; } // the bar/stat belong to a live download - landing on Status with none running starts them clean (the 1.87 reset, re-homed with the elements). Beta 1.170 (C-04): the record read falls back to ANY route's download record - through 1.169 it read only the active route's slot, so right after a route switch this line could say 'not downloaded yet' directly under a 'Downloaded' maps line for the pack another route had fetched
  // HEALTH - each row from a real signal at this moment:
  let storageOk = false;
  try { storageOk = lsSet('snowroute.v2.healthprobe', '1') && lsGet('snowroute.v2.healthprobe') === '1';
  lsDel('snowroute.v2.healthprobe');
  } catch (e) { storageOk = false;
  } // a scratch-key write + read-back + delete - the same guarded helpers every save uses
  if (!storageOk) setHealth('stIcoStorage', 'stValStorage', 'warn', 'storage problem. Export a backup');
  else { // the row reports the recorded persist() answer and an estimate(): protected ok, refusal warn, unreported idle, never green
    let est = null; try { if (navigator.storage && navigator.storage.estimate) est = await navigator.storage.estimate(); } catch (e) { est = null; }
    const usedTxt = est && typeof est.usage === 'number' ? fmtStoreSize(est.usage) + ' used' : '';
    if (storagePersist === true) setHealth('stIcoStorage', 'stValStorage', 'ok', 'protected' + (usedTxt ? ' · ' + usedTxt : '') + (est && typeof est.quota === 'number' && est.quota > 0 ? ' of ~' + fmtStoreSize(est.quota) : ''));
    else if (storagePersist === false) setHealth('stIcoStorage', 'stValStorage', 'warn', 'not protected' + (usedTxt ? ' · ' + usedTxt : ''));
    else setHealth('stIcoStorage', 'stValStorage', 'idle', usedTxt ? usedTxt + ' · protection not reported by this browser' : 'not reported by this browser');
  }
  setHealth('stIcoMaps', 'stValMaps', ps.complete ? 'ok' : 'warn', ps.complete ? 'complete' : ps.cached > 0 ? 'partial: ' + ps.cached + ' of ' + ps.total : 'not downloaded');
  if (updState === 'ok') setHealth('stIcoVer', 'stValVer', 'ok', 'up to date (' + $('ver').textContent.trim() + ')');
  else if (updState === 'avail') setHealth('stIcoVer', 'stValVer', 'warn', 'update available');
  else if (updState === 'fail') setHealth('stIcoVer', 'stValVer', 'warn', 'could not check. The server did not answer');
  else if (updState === 'older') setHealth('stIcoVer', 'stValVer', 'warn', 'the server has an older version');
  else if (updState === 'diff') setHealth('stIcoVer', 'stValVer', 'warn', 'the server has a different version');
  else setHealth('stIcoVer', 'stValVer', 'idle', 'not checked yet');
  if (gpsDenied) setHealth('stIcoGps', 'stValGps', 'warn', 'location permission is off');
  else if (watchId != null || (lastGood && Date.now() - lastGood.at < 120000)) setHealth('stIcoGps', 'stValGps', 'ok', 'ready');
  else setHealth('stIcoGps', 'stValGps', 'idle', 'not started yet');
}
$('stBtn').addEventListener('click', () => { showSetPane('setStatusPane'); renderStatus(true); });
$('statusBack').addEventListener('click', () => showSetPane('setMainPane'));
$('stDel').addEventListener('click', async ev => {
  if (!tapGuard('stDel', ev)) return;
  if (preloadRunning) { return; }
  const releaseDel = await takePackWriteTurn(); // the delete takes the writers' turn, held across the delete and the metadata clears, like every pack mutation
  try {
    // verify the pack is actually gone before clearing or announcing: a swallowed failure once toasted success over it
    let gone = false;
    try {
      if ('caches' in window) gone = (await caches.delete('snowroute-offline-v1')) || !(await caches.has('snowroute-offline-v1'));
      else gone = true; // no Cache Storage in this browser: no pack exists to delete
    } catch (e) { gone = false; }
    if (!gone) { showBanner('Offline maps not deleted', 'They are still on this device'); renderStatus(true); return; }
    lsDel(PACKMIG_KEY); for (const p of ROUTE_PACKS) lsDel(routeKeys(p.id).pre); // every route's record goes with the pack; the browsing tile cache is a cache, not the pack
    renderStatus(true);
  } finally { releaseDel(); }
});
// ---- About ----
