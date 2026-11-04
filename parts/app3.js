
// ===== PACE (one source) =====
function refRun() { // newest qualifying clean wins (history is chronological, so search from the end)
  for (let i = history.length - 1; i >= 0; i--) { const h = history[i]; if (h.items && Object.keys(h.items).length === STREETNAMES.length) return h; } // Beta 1.94 (audit F-01): full = every street in the route's own list, not a hard-coded 34
  for (let i = history.length - 1; i >= 0; i--) { const h = history[i]; if (h.items && Object.keys(h.items).length >= 5) return h; }
  return null;
}
function cleanWorkM(h) { // side-metres a saved clean actually covered: its recorded sides when present, else its completed streets at full length
  if (h && h.sides && h.sides.p && typeof h.sides.p === 'object') { let s = 0; for (const n of STREETNAMES) { const p = h.sides.p[n]; if (!Array.isArray(p)) continue; STRETCH[n].parts.forEach((part, i) => { const v = p[i] | 0; const L = segLenM(part); if (v & 1) s += L; if (v & 2) s += L; }); } if (s > 0) return s; }
  const items = (h && h.items) || {}; let s = 0; for (const n of Object.keys(items)) if (STRETCH[n]) s += STRETCH[n].total * 2; return s;
}
function workRateMh(workM, startMs, endMs, minH) { const h = (endMs - startMs) / 3600000; return (workM > 0 && h > minH) ? workM / h : null; } // NaN inputs fail the comparisons and yield null
function fmtRate(r) { return (r / 1000).toFixed(1) + ' km of sides/hr'; }
function paceInfo() { // Beta 1.91 (Andrew): pace is a WORK RATE - side-metres per hour, cumulative (work done so far / time so far) off the per-side mark stamps. Interleaved streets and same-street batched marks cannot distort a cumulative rate; a mark left late only makes the live reading lag until it lands, and the totals are never touched by stamp timing.
  const ref = refRun();
  const refRateMh = ref ? workRateMh(cleanWorkM(ref), Date.parse(ref.startedAt || ''), Date.parse(ref.at || ''), 0.05) : null;
  let rateMh = null, live = false;
  if (runStart) { const r = workRateMh(liveWorkM(), runStart, Date.now(), 0.02); if (r) { rateMh = r; live = true; } } // Beta 1.93 (audit R06): the numerator is the RUN's work (liveWorkM), not the whole board's
  if (!rateMh) rateMh = refRateMh;
  let etaTxt = '';
  if (runStart && rateMh) { const leftM = totalWorkM() - workDoneM(); if (leftM > 0) { const leftH = leftM / rateMh; etaTxt = 'ETA ' + fmtDur(leftH * 3600000) + ' · done ~' + fmtClock(new Date(Date.now() + leftH * 3600000)); } }
  return { rateMh, refRateMh, live, etaTxt, ref };
}
function statsLine() {
  const p = paceInfo();
  const bits = [];
  if (p.rateMh) bits.push(fmtRate(p.rateMh));
  if (p.etaTxt) bits.push(p.etaTxt);
  if (runStart) bits.push('started ' + fmtClock(new Date(runStart)));
  return bits.join(' · ');
}
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtWhen(iso) { const d = new Date(iso); if (isNaN(d)) return ''; const n = new Date(); const same = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); return same ? fmtClock(d) : MON3[d.getMonth()] + ' ' + d.getDate() + ', ' + fmtClock(d); }
function fmtAgo(iso) { const t = Date.parse(iso); if (isNaN(t)) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.floor(m / 60) + ' h ' + (m % 60) + ' m ago'; }
function histDur(h) {
  const items = (h && h.items) || {};
  const ks = Object.keys(items).filter(n => STREETSET.has(n) && items[n]);
  const ts = ks.map(n => Date.parse(items[n])).filter(t => !isNaN(t)).sort((a, b) => a - b);
  if (!ts.length) return null;
  const stA = Date.parse(h.startedAt);
  const start = (!isNaN(stA) && stA <= ts[0]) ? stA : ts[0];
  return { count: ks.length, durMs: ts[ts.length - 1] - start, start };
}
let histOpen = false;
function renderPace() {
  const p = paceInfo();
  const ref = p.ref;
  let html =
    '<div>Reference clean: <b>' + (ref ? new Date(ref.at).toLocaleDateString() + ' (' + Object.keys(ref.items).length + ' streets)' : 'none yet — finish a clean to set your pace') + '</b></div>' +
    '<div>Pace: <b>' + (p.rateMh ? fmtRate(p.rateMh) + ' · full clean ≈ ' + fmtDur(totalWorkM() / p.rateMh * 3600000) + (p.live ? ' (this run so far)' : ' (reference clean)') : '—') + '</b></div>' +
    '<div>This run: <b>' + (runStart ? 'started ' + fmtClock(new Date(runStart)) + (p.etaTxt ? ' · ' + p.etaTxt : '') : 'not started') + '</b></div>' +
    '<div>Work done: <b>' + Math.round(workDoneM()) + ' m of ' + Math.round(totalWorkM()) + ' m of street sides</b></div>' +
    (runStart ? '<button class="red" id="paceCancel">Cancel start</button>' : '');
  html += '<div class="psec" id="histHead">Previous cleans ' + (histOpen ? '▲' : '▼') + '</div>';
  if (histOpen) {
    let any = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const d = histDur(history[i]); if (!d) continue;
      html += '<div class="prow histRow" data-i="' + i + '"><span>' + fmtWhen(history[i].at) + '</span><span>' + fmtDur(d.durMs) + ' · ' + d.count + ' of ' + STREETNAMES.length + ' streets ›</span></div>';
      any++;
    }
    if (!any) html += '<div style="font-size:13px;color:var(--ink-dim);padding:4px 2px">No cleans saved yet — when you finish a run and tap Finish, it lands here with its total time.</div>';
  }
  $('pacePad').innerHTML = html;
  const c = $('paceCancel'); if (c) c.addEventListener('click', () => { cancelStart(); closeSheets(); });
  const hh = $('histHead'); if (hh) hh.addEventListener('click', () => { histOpen = !histOpen; renderPace(); });
  $('pacePad').querySelectorAll('.histRow').forEach(r => r.addEventListener('click', () => openClean(+r.dataset.i)));
}
function openPace() { deselect(); closeSheets(); $('pacePanel').style.height = ''; $('pacePanel').style.maxHeight = ''; renderPace(); $('pacePanel').classList.add('open'); }
function closePace() { closeSheetEl($('pacePanel')); } // same animated close as every sheet (Beta 1.30)

// ===== CLEAN DETAIL (production v5.53 model): one archived clean inside the list sheet - totals, its streets
// in mark order with per-street times, its notes, noted-but-not-cleaned group, two-tap delete. Back and Delete
// both land on Previous cleans (expanded), never on the Streets list. =====
let cleanIdx = null, cleanDelArmed = false, cleanDelTimer = 0;
function cleanNoteLines(entries) { return (Array.isArray(entries) ? entries : []).map(f => f.k === 'note' ? ('📝 ' + (f.text || '')) : ((FLAGS[f.k] || f.k) + (f.at ? ' ' + fmtClock(new Date(f.at)) : ''))); }
function openClean(i) {
  const h = history[i];
  if (!h) return;
  cleanIdx = i; cleanDelArmed = false;
  closePace(); deselect();
  $('filters').style.display = 'none';
  $('streetList').style.display = 'none';
  const cv = $('cleanView');
  cv.classList.remove('hidden');
  cv.innerHTML = '';
  const head = document.createElement('div'); head.className = 'cvHead';
  head.innerHTML = '<button class="cvBack">‹ Back</button><div class="cvTtl"></div>';
  head.querySelector('.cvTtl').textContent = 'Clean — ' + fmtWhen(h.at);
  head.querySelector('.cvBack').onclick = backToCleans;
  cv.appendChild(head);
  const d = histDur(h);
  const meta = document.createElement('div'); meta.className = 'cvMeta';
  meta.textContent = (d ? ('Total time ' + fmtDur(d.durMs) + ' · ') : '') + (h.items ? Object.keys(h.items).length : 0) + ' streets' + (h.km ? (' · ' + h.km + ' km of GPS trail') : '') + (h.startedAt ? (' · started ' + fmtClock(new Date(h.startedAt))) : '') + '\nPer-street span = first side marked to last side marked (includes any work in between). Tap a street for its details.';
  cv.appendChild(meta);
  const items = h.items || {};
  const order = Object.keys(items).filter(n => STREETSET.has(n)).sort((x, y) => String(items[x] || '9999').localeCompare(String(items[y] || '9999')));
  let prev = h.startedAt ? Date.parse(h.startedAt) : NaN;
  order.forEach(n => {
    const t = items[n] ? Date.parse(items[n]) : NaN;
    const dur = (!isNaN(t) && !isNaN(prev)) ? t - prev : NaN;
    const stArr = (h.sides && h.sides.t && Array.isArray(h.sides.t[n])) ? h.sides.t[n].flat().map(x => Date.parse(x)).filter(x => !isNaN(x)) : []; // Beta 1.91: the street's own side stamps - span = first side marked to last side marked
    const span = stArr.length ? Math.max.apply(null, stArr) - Math.min.apply(null, stArr) : NaN;
    if (!isNaN(t)) prev = t;
    const rowEl = document.createElement('div'); rowEl.className = 'cvRow';
    const top = document.createElement('div'); top.className = 'cvTop';
    top.innerHTML = '<div class="cvNm"></div><div class="cvTm"></div>';
    top.querySelector('.cvNm').textContent = n;
    top.querySelector('.cvTm').textContent = (!isNaN(t) ? fmtClock(new Date(t)) : '—') + ((span > 0) ? (' · span ' + fmtDur(span)) : (!isNaN(dur) ? (' · took ' + fmtDur(dur)) : ''));
    rowEl.appendChild(top);
    const lines = cleanNoteLines((h.notes || {})[n]);
    if (lines.length) { const p = document.createElement('div'); p.className = 'cvNt'; p.textContent = lines[0] + (lines.length > 1 ? ' (+' + (lines.length - 1) + ' more)' : ''); rowEl.appendChild(p); }
    const det = document.createElement('div'); det.className = 'cvDet'; det.style.display = 'none';
    const parts = [];
    parts.push('Marked: ' + (items[n] ? fmtWhen(items[n]) : 'no time recorded'));
    if (span > 0) parts.push('Span: ' + fmtDur(span) + ' - first side marked ' + fmtClock(new Date(Math.min.apply(null, stArr))) + ', last side ' + fmtClock(new Date(Math.max.apply(null, stArr))) + ' (includes any other work in between)'); else if (!isNaN(dur)) parts.push('Time taken: ' + fmtDur(dur) + ' (from the previous street or the start)');
    if ((h.via || {})[n]) parts.push('How: ' + ((h.via || {})[n] === 'gps' ? 'GPS suggestion' : 'marked by tap'));
    lines.forEach(L => parts.push(L));
    det.textContent = parts.join('\n');
    rowEl.appendChild(det);
    rowEl.onclick = () => { det.style.display = det.style.display === 'none' ? '' : 'none'; };
    cv.appendChild(rowEl);
  });
  const notedOnly = Object.keys(h.notes || {}).filter(n => STREETSET.has(n) && !(n in items) && (h.notes[n] || []).length);
  if (notedOnly.length) {
    const sec = document.createElement('div'); sec.className = 'cvSec'; sec.textContent = 'Notes on streets not cleaned'; cv.appendChild(sec);
    notedOnly.forEach(n => {
      const rowEl = document.createElement('div'); rowEl.className = 'cvRow';
      const top = document.createElement('div'); top.className = 'cvTop';
      top.innerHTML = '<div class="cvNm"></div>';
      top.querySelector('.cvNm').textContent = n;
      rowEl.appendChild(top);
      cleanNoteLines(h.notes[n]).forEach(L => { const p = document.createElement('div'); p.className = 'cvNt'; p.textContent = L; rowEl.appendChild(p); });
      cv.appendChild(rowEl);
    });
  }
  const del = document.createElement('button'); del.className = 'cvDel'; del.textContent = 'Delete this clean';
  del.onclick = () => {
    if (!cleanDelArmed) {
      cleanDelArmed = true; del.classList.add('armed'); del.textContent = 'Tap again to confirm delete';
      clearTimeout(cleanDelTimer);
      cleanDelTimer = setTimeout(() => { cleanDelArmed = false; del.classList.remove('armed'); del.textContent = 'Delete this clean'; }, 5000);
      return;
    }
    clearTimeout(cleanDelTimer);
    history.splice(cleanIdx, 1);
    const okDel = saveHistory();
    backToCleans();
    if (okDel) toast('Clean deleted'); else toast('Storage problem — the delete could not be saved; the clean may return on reload', 4200); // Beta 1.63 (audit F04)
    updateCount();
  };
  cv.appendChild(del);
  $('sheet').classList.add('open');
}
function backToCleans() {
  closeClean();
  $('sheet').classList.remove('open');
  histOpen = true;
  openPace();
}
function closeClean() {
  cleanIdx = null;
  const cv = $('cleanView');
  if (cv) cv.classList.add('hidden');
  const f = $('filters'); if (f) f.style.display = '';
  const sl = $('streetList'); if (sl) sl.style.display = '';
  renderStreets();
}

// ===== RUN LIFECYCLE =====
let wakeLock = null;
async function syncWake() {
  const want = !!runStart && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!want && wakeLock) { const w = wakeLock; wakeLock = null; w.release(); }
  } catch (e) { /* wake lock is best-effort */ }
}
document.addEventListener('visibilitychange', syncWake);
function noteSessionStart() { const s = Math.floor(runStart / 1000); if (trailSessions[trailSessions.length - 1] !== s) { trailSessions.push(s); if (saveSess()) return true; sessDirty = true; return false; } return true; } // Beta 1.71 (audit B02): record the session boundary the moment the clean starts - undo restores the original runStart, so a resumed run correctly adds no new marker. Beta 1.73 (audit C04): the save result is RETURNED and a failure arms the flushAux retry - 1.71 dropped it, so a failed marker write was silent and a reload could join two cleans in the GPX export
let runSnap = null; // Beta 1.91: the board exactly as it was when Start was pressed - Cancel restores it, so a cancelled run erases ONLY what the run itself recorded (marks made before Start are not the run's to erase).
function saveSnap() { // Beta 1.94 (deep audit SR-193-02): the pre-Start board is ALSO persisted (LS.snap, stamped with the run's start time) the moment a clean starts. The in-memory runSnap dies with the page; after a reload mid-run, Cancel used to fall back to the mark-stamp journal (1.93 R01) - which cannot see an UNMARK, because unmarking erases the stamp, so a pre-Start side removed during the run stayed removed. The persisted snapshot is the board itself: a resumed Cancel restores it exactly, like a live one. A failed write arms snapDirty and the flushAux heartbeat retries (app1), on the same discipline as the start key and the session markers.
  if (!runSnap || !runStart) { snapDirty = false; return true; }
  const ok = lsSet(LS.snap, JSON.stringify({ at: runStart, pieces: runSnap.pieces, pieceTimes: runSnap.pieceTimes, done: runSnap.done, times: runSnap.times, via: runSnap.via, cov: runSnap.cov }));
  snapDirty = !ok; return ok;
}
function validateSnap(raw, expectAt) { // Beta 1.95 (deep audit SR-194-03): a persisted cancel snapshot is DATA FROM STORAGE, not trusted state - it earns application only by passing the same structural rules the loader enforces (every street present at its true stretch count, side values 0..3 only, stamp pairs of null-or-parseable strings, known street names everywhere, coverage indexes inside the street's samples). 1.94 checked only the stamp and the object-ness of two fields, then assigned the stored structures raw: an injected {Velmar:[99]} became the live board and was saved onward, destroying a valid mark. Any violation rejects the WHOLE snapshot (never a partial application); the caller falls back to the stamp journal. Returns a normalized deep copy, or null.
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
    for (const k of Object.keys(P)) if (!STREETSET.has(k)) return null;
    for (const k of Object.keys(T)) if (!STREETSET.has(k)) return null;
    const pieces = {}, pieceTimes = {};
    for (const n of STREETNAMES) {
      const arr = P[n];
      if (!Array.isArray(arr) || arr.length !== STRETCH[n].parts.length) return null;
      for (const v of arr) if (v !== 0 && v !== 1 && v !== 2 && v !== 3) return null;
      pieces[n] = arr.slice();
      const tn = T[n];
      if (tn !== undefined && (!tn || typeof tn !== 'object')) return null; // a stamp record that is not a structure at all rejects the snapshot
      pieceTimes[n] = sanitizePieceTimes(tn, STRETCH[n].parts.length); // the LOADER'S OWN sanitizer is the shape authority (it produces the array form the live state carries, accepting the numeric-keyed object form too) - the first 1.95 draft hand-rolled an object-only assumption and rejected every genuine snapshot; strictness lives in the structural checks around this call, not in a parallel shape
    }
    for (const n of STREETNAMES) { for (const pr of pieceTimes[n]) { if ((pr[0] !== null && isNaN(Date.parse(pr[0]))) || (pr[1] !== null && isNaN(Date.parse(pr[1])))) return null; } } // Beta 1.96 (SR-195-04): the sanitizer keeps any STRING stamp; the loader's standard for time values is a parseable date, so an unparseable stamp rejects the snapshot like an unparseable completion time below
    const done = [];
    for (const d of D) { if (typeof d !== 'string' || !STREETSET.has(d)) return null; if (!done.includes(d)) done.push(d); }
    const times = {}, via = {};
    for (const k of Object.keys(TM)) { if (!STREETSET.has(k) || typeof TM[k] !== 'string' || isNaN(Date.parse(TM[k]))) return null; times[k] = TM[k]; } // Beta 1.96 (deep audit SR-195-04): the VALUE must be a real date too - the loader itself deletes completion times that fail Date.parse (app1), so a snapshot carrying one asserts a state the loader would not honour
    for (const k of Object.keys(V)) { if (!STREETSET.has(k) || typeof V[k] !== 'string') return null; via[k] = V[k]; }
    const cov = {};
    for (const k of Object.keys(C)) {
      if (!STREETSET.has(k) || !SAMPLES[k] || !Array.isArray(C[k])) return null;
      const arr = [];
      for (const i of C[k]) { if (!Number.isInteger(i) || i < 0 || i >= SAMPLES[k].length) return null; arr.push(i); }
      cov[k] = arr;
    }
    return { pieces, pieceTimes, done, times, via, cov };
  } catch (e) { return null; }
}
function startClean() { runSnap = { pieces: JSON.parse(JSON.stringify(pieces)), pieceTimes: JSON.parse(JSON.stringify(pieceTimes)), done: [...doneSet], times: { ...doneTimes }, via: { ...doneVia }, cov: JSON.parse(JSON.stringify(coveredIdx)) }; runStart = Date.now(); const okSnap = saveSnap(); const okSess = noteSessionStart(); const okStart = saveAll(); startGps(true); updateCount(); syncWake(); if (okStart && okSess && okSnap) toast('Clean started · ' + fmtClock(new Date())); else if (!okStart) toast('Clean started — warning: the run state could not be saved (storage problem)', 4200); else if (!okSess) toast('Clean started — warning: the session marker could not be saved; it will keep retrying', 4200); else toast('Clean started — warning: the cancel safety snapshot could not be saved; it will keep retrying', 4200); drawTrail(true); checkStale(); } // Beta 1.73 (audit C04): the marker save is part of the start's honesty check, not a silent side write // Beta 1.63 (audit F04): the clean still starts - he is standing in the snow - but the message stops claiming a saved state that does not exist
// Beta 1.91 (Andrew): Cancel start erases everything the run recorded - its trail points, its session
// marker, any sides marked during it, its coverage and suggestions - and stores nothing. Only Finish
// stores a run. (Supersedes the Beta 1.70 A04 call that kept the trail as history - Andrew's word.)
function cancelStart() {
  const wasRunGps = gpsFromRun;
  const startSec = runStart ? Math.floor(runStart / 1000) : 0;
  let snapDamaged = false; // Beta 1.95 (SR-194-03): a persisted snapshot that exists but fails validation - the closing message must not claim an exact restore
  let snapAbsent = false; // Beta 1.96 (SR-195-06): no snapshot existed at all (its Start-time write never landed, or a pre-1.94 run) - the journal fallback runs for a different reason than damage, and the closing message names which
  if (runStart) {
    trail = trail.filter(p => (p[2] || 0) < startSec);
    trailSessions = trailSessions.filter(s => s !== startSec);
    if (runSnap) { pieces = runSnap.pieces; pieceTimes = runSnap.pieceTimes; doneSet = new Set(runSnap.done); doneTimes = runSnap.times; doneVia = runSnap.via; coveredIdx = runSnap.cov; }
    else { // No in-memory snapshot (the app reloaded mid-run). Beta 1.94 (deep audit SR-193-02): the PERSISTED snapshot Start wrote (LS.snap, stamped with this run's start) restores the pre-Start board exactly - including a pre-Start side that was UNMARKED during the run, which the 1.93 stamp journal could not see (unmarking erases the stamp). Only when no usable persisted snapshot exists (written before 1.94, or its write never landed) does the 1.93 journal fallback below run: revert ONLY sides stamped at or after Start - anything older is pre-Start progress and is not this run's to erase; the 1.91 full-board wipe could destroy it.
      const persisted = parseJ(lsGet(LS.snap), null);
      const validSnap = persisted ? validateSnap(persisted, runStart) : null; // Beta 1.95 (SR-194-03): validated + normalized before a single field is applied - never the raw stored structures
      if (validSnap) { pieces = validSnap.pieces; pieceTimes = validSnap.pieceTimes; doneSet = new Set(validSnap.done); doneTimes = validSnap.times; doneVia = validSnap.via; coveredIdx = validSnap.cov; }
      else {
        if (persisted) snapDamaged = true; else snapAbsent = true;
        for (const n of STREETNAMES) { const P = pieces[n], T = pieceTimes[n] || {}; for (let i = 0; i < P.length; i++) { const st = T[i] || [null, null]; if ((P[i] & 1) && st[0] && Date.parse(st[0]) >= runStart) { P[i] &= ~1; st[0] = null; } if ((P[i] & 2) && st[1] && Date.parse(st[1]) >= runStart) { P[i] &= ~2; st[1] = null; } } }
        doneSet = new Set(STREETNAMES.filter(streetComplete));
        for (const k of Object.keys(doneTimes)) if (!doneSet.has(k)) delete doneTimes[k];
        for (const k of Object.keys(doneVia)) if (!doneSet.has(k)) delete doneVia[k];
        coveredIdx = {}; // coverage cannot be attributed without a snapshot - and unlike hand marks it is GPS-derived and re-earns itself as he drives; drive143 C1 holds this line
      }
    }
    lsDel(LS.snap); snapDirty = false; // the run is cancelled - its snapshot goes with it (a stale one could never match a future run's start stamp, but there is no reason to keep it)
    trailDirty = true; sessDirty = true;
  }
  runSnap = null;
  runStart = 0; suggested = new Set(); $('suggest').classList.add('hidden');
  const okCancel = saveAll(); flushAux(true);
  const trailPending = trailDirty || sessDirty; // Beta 1.93 (follow-up audit R07): the erasure claim below is gated on the trail/session writes having actually landed
  if (wasRunGps) stopGps();
  if (window.GLP) window.GLP.sync(); renderPanel(); renderStreets();
  drawTrail(true); updateCount(); syncWake();
  const rebuiltWhy = snapDamaged ? 'the saved snapshot was damaged' : (snapAbsent ? 'no start snapshot was saved' : ''); // Beta 1.96 (deep audit SR-195-01): the message is COMPOSED, not chained - 1.95's if-chain evaluated the damage branch before the unsaved-cleanup branch, so in the combined case (damaged snapshot AND a trail cleanup that could not be saved) the erasure message masked the storage warning entirely. The storage warning now leads whenever it applies, with the rebuild explanation attached; each single-failure message keeps its exact prior wording.
  if (okCancel && trailPending) toast('Start cancelled — erased here, but the trail cleanup could not be saved yet; it will keep retrying' + (rebuiltWhy ? ' — the board was rebuilt from the marks made during the run (' + rebuiltWhy + ')' : ''), 4600);
  else if (okCancel && snapDamaged) toast('Start cancelled — run erased (the saved snapshot was damaged, so the board was rebuilt from the marks made during the run)', 4600);
  else if (okCancel && snapAbsent) toast('Start cancelled — run erased (no start snapshot was saved, so the board was rebuilt from the marks made during the run)', 4600);
  else if (okCancel) toast('Start cancelled — run erased');
  else toast('Start cancelled - warning: the cancellation could not be saved; the run may return on reload', 4200);
} // Beta 1.69 (audits N03 + trail): cancelStart ignored saveAll's result and claimed success unconditionally; it also never refreshed the trail, so a cancelled run's line lingered
$('startBtn').addEventListener('click', () => { if (!tapGuard('startBtn')) return; startClean(); });
// CLEAR (Andrew, Beta 1.7): header button beside Pace - one tap wipes EVERY mark on the board (all streets,
// both sides), plus the completion times/vias and the GPS coverage that would instantly re-suggest them.
// The run itself (start time, trail, notes, history) is untouched - this is the mistake eraser, not a finish.
function clearAllMarks() {
  const any = doneSet.size > 0 || STREETNAMES.some(n => pieces[n].some(v => v !== 0)) || Object.keys(coveredIdx).length > 0 || suggested.size > 0; // Beta 1.70 (audit A04): coverage-only state is something to clear too - the old guard claimed 'nothing to clear' while coverage and suggestions sat untouched
  if (!any) { toast('Nothing marked to clear'); return; }
  for (const n of STREETNAMES) { pieces[n] = STRETCH[n].parts.map(() => 0); pieceTimes[n] = {}; }
  doneSet = new Set(); doneTimes = {}; doneVia = {}; coveredIdx = {}; suggested = new Set();
  $('suggest').classList.add('hidden'); delete $('suggest').dataset.n; // Beta 1.71 (audit B01): the one path the 1.70 dismissal sweep missed - Clear wiped the coverage behind the panel but left the panel itself up, its Yes still able to select the street
  deselect(); const okClear = finishChange();
  if (okClear) toast('All marks cleared'); else toast('Storage problem — the clear could not be saved; marks may return on reload', 4200); // Beta 1.63 (audit F04)
}
$('clearBtn').addEventListener('click', () => { if (!tapGuard('clearBtn')) return; clearAllMarks(); });
$('cancelStartBtn').addEventListener('click', () => { if (!tapGuard('cancelStartBtn')) return; cancelStart(); });
let undoSnap = null, undoTimer = 0;
$('resetBtn').addEventListener('click', () => {
  // Undo is checked BEFORE the double-tap guard (audit finding, drive89 T4): the guard exists to stop a
  // repeated OPEN of the finish pop-up, but the same button means Undo once a finish lands - a fast
  // Finish > Yes > Undo sequence lands inside the 400ms guard window and the Undo tap was silently
  // swallowed (proven by drive89's state dump: label Undo, snapshot present, tap never acted). doUndo
  // nulls the snapshot, so it cannot double-fire; the pop-up branch keeps its guard.
  if (undoSnap) { doUndo(); return; }
  if (!tapGuard('resetBtn')) return;
  const nDone = doneSet.size, nNotes = Object.keys(notes).length;
  $('finMsg').textContent = (nDone || nNotes)
    ? (nDone + ' of ' + STREETNAMES.length + ' streets cleaned' + (nNotes ? ', notes on ' + nNotes + ' street' + (nNotes === 1 ? '' : 's') : '') + '. The clean is saved to Previous cleans with its notes, and the board clears for the next clean.' + (nDone < 3 ? ' Careful: under 3 streets, so this will clear WITHOUT being saved.' : ''))
    : 'Nothing is marked yet. Finishing just clears the board - nothing will be saved.';
  $('finModal').classList.remove('hidden');
});
$('finNo').addEventListener('click', () => $('finModal').classList.add('hidden'));
$('finYes').addEventListener('click', () => { if (!tapGuard('finYes')) return; $('finModal').classList.add('hidden'); finishRun(); });
function thinOnce(pts, stepSec) {
  const out = []; let last = -Infinity;
  for (const p of pts) { if (p[2] - last >= stepSec) { out.push(p); last = p[2]; } }
  if (pts.length && out.length && out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}
function thinPath(pts) {
  let step = 15, out = thinOnce(pts, step);
  while (out.length > 3000) { step *= 2; const nx = thinOnce(out, step); if (nx.length >= out.length) break; out = nx; }
  return out;
}
function trailKm(sinceMs) {
  const sinceSec = Math.floor(sinceMs / 1000); // Beta 1.71 (audit B04): trail timestamps are whole seconds - the boundary is compared at the same precision, or a start mid-second discards the run's first legitimate segment (the map's trail filter has floored its boundary since 1.64)
  let d = 0;
  for (let i = 1; i < trail.length; i++) {
    if (trail[i][2] < sinceSec || trail[i - 1][2] < sinceSec || trail[i][2] - trail[i - 1][2] > 300 || distM(trail[i - 1], trail[i]) > 1000) continue; // Beta 1.70 (audit A05): a segment counts only when BOTH endpoints belong to the run. Beta 1.71 (audit B03): a jump over 1000 m is a break, not distance - the same acceptance rule the trail display and the GPX export already apply, so the number and the drawn line can no longer disagree
    d += distM(trail[i - 1], trail[i]);
  }
  return d / 1000;
}
function buildSnap() { // production archive shape: items is a street->time map; km is trail distance; the GPS path is thinned FROM the trail
  if (!doneSet.size && !Object.keys(notes).length) return null;
  const ts = [...doneSet].map(n => Date.parse(doneTimes[n])).filter(t => !isNaN(t)).sort((a, b) => a - b);
  const startMs = (runStart && ts.length && runStart <= ts[0]) ? runStart : (ts.length ? ts[0] : null); // Beta 1.70 (audit A05): distance and path are measured from the clean's actual start, not its first completed street - driving before the first street was silently dropped
  const snap = { at: new Date().toISOString(), items: {}, via: { ...doneVia }, notes: JSON.parse(JSON.stringify(notes)), sides: JSON.parse(JSON.stringify({ p: pieces, t: pieceTimes })), km: startMs ? +trailKm(startMs).toFixed(1) : 0, startedAt: startMs ? new Date(startMs).toISOString() : null };
  doneSet.forEach(n => { snap.items[n] = doneTimes[n] || null; });
  const sMs = Date.parse(snap.startedAt);
  if (!isNaN(sMs)) { const pp = thinPath(trail.filter(p => p[2] >= Math.floor(sMs / 1000))); if (pp.length > 1) snap.path = pp; } // Beta 1.70 (audit A05): the old 60 s look-back admitted points from the previous session. Beta 1.71 (audit B04): second-precision comparison, matching the stored timestamps
  return snap;
}
function finishRun() {
  northUp();
  const snap = buildSnap();
  const archiving = !!(snap && doneSet.size >= 3); // production rule: under 3 streets clears WITHOUT being saved
  const prevHist = history;
  // Beta 1.57: the finish is a small TRANSACTION (Phase 2 storage integrity) -
  // both gated writes land BEFORE any state changes, so a storage failure
  // leaves the run fully intact instead of half-finished: (1) the archive
  // record, (2) the cleared authority (sides) record. Gate 2 failing rolls
  // gate 1 back. Before 1.57 only the archive was gated; the cleared board
  // written afterwards was not, so a failed sides write resurrected the
  // finished clean beside its own archive entry on the next launch.
  let newHist = null;
  if (archiving) {
    newHist = trimHistory([...history, snap]);
    if (!lsSet(LS.hist, JSON.stringify(newHist))) { toast('Storage full — finish stopped, run intact', 3600); return; } // verified write BEFORE anything clears
  }
  const clearedPieces = {}, clearedTimes = {};
  for (const n of STREETNAMES) { clearedPieces[n] = STRETCH[n].parts.map(() => 0); clearedTimes[n] = {}; }
  const prevSidesRaw = lsGet(LS.sides); // Beta 1.93 (audit R05): kept so the start-key gate below can roll this write back
  if (!lsSet(LS.sides, JSON.stringify({ p: clearedPieces, t: clearedTimes }))) {
    if (archiving) { // roll the archive back - the finish did not happen. Beta 1.63 (audit F02): the rollback is CHECKED and READ BACK - if it fails, the stored history and the stored board disagree, and the message must say so instead of claiming the clean is intact.
      const rbOk = lsSet(LS.hist, JSON.stringify(prevHist)) && lsGet(LS.hist) === JSON.stringify(prevHist);
      if (!rbOk) { toast('Storage failure — finish stopped, but the archive could not be undone. Export a recovery backup now', 6000); return; }
    }
    toast('Storage problem — finish stopped, your clean is intact', 4200);
    return;
  }
  // Beta 1.93 (follow-up audit R05): the start-key delete is a GATE, taken before anything
  // mutates. 1.92's retry (startDirty) still left a window: die before the retry lands and
  // the stale start key resurrects this finished run on the next boot. If the delete cannot
  // land, both gated writes roll back (checked, as at gate 2) and the finish stops with the
  // run intact - a committed finish never carries a stale start key.
  if (runStart && !lsDel(LS.start)) {
    const rbSides = prevSidesRaw === null ? lsDel(LS.sides) : (lsSet(LS.sides, prevSidesRaw) && lsGet(LS.sides) === prevSidesRaw);
    let rbHist = true;
    if (archiving) rbHist = lsSet(LS.hist, JSON.stringify(prevHist)) && lsGet(LS.hist) === JSON.stringify(prevHist);
    if (rbSides && rbHist) toast('Storage problem — finish stopped, your clean is intact', 4200);
    else toast('Storage failure — finish stopped, but the rollback could not be verified. Export a recovery backup now', 6000);
    return;
  }
  const undoSnapData = runSnap ? JSON.parse(JSON.stringify(runSnap)) : validateSnap(parseJ(lsGet(LS.snap), null), runStart); // Beta 1.95 (deep audit SR-194-01): the cancel snapshot travels INTO the undo before it is deleted here - from memory when the run never reloaded, from its persisted copy (validated, SR-194-03) when it did. 1.94 deleted the snapshot and never carried it, so Finish -> Undo -> Cancel fell back to the stamp journal, blind to a pre-Start side unmarked mid-run.
  lsDel(LS.snap); snapDirty = false; // Beta 1.94 (SR-193-02): the run is finished - its cancel snapshot goes with it. Ungated on purpose: a leftover snapshot is stamped with THIS run's start, so it can never match a future run, and the next Start overwrites it anyway
  if (archiving) history = newHist;
  undoSnap = { done: [...doneSet], times: { ...doneTimes }, via: { ...doneVia }, notes: JSON.parse(JSON.stringify(notes)), pieces: JSON.parse(JSON.stringify(pieces)), pieceTimes: JSON.parse(JSON.stringify(pieceTimes)), runStart, cov: JSON.parse(JSON.stringify(coveredIdx)), hist: prevHist.slice(), gpsWas: gpsFromRun, snap: undoSnapData };
  doneSet = new Set(); doneTimes = {}; doneVia = {}; notes = {}; runStart = 0; runSnap = null; coveredIdx = {}; suggested = new Set(); $('suggest').classList.add('hidden'); // Beta 1.70 (audit A04): the suggestion set is run-scoped too - finishRun used to clear the coverage but keep the set, so suggested streets never suggested again
  for (const n of STREETNAMES) { pieces[n] = STRETCH[n].parts.map(() => 0); pieceTimes[n] = {}; }
  stopGps(); deselect(); drawTrail(true); // Beta 1.69 (audit visual check): the run is over and runStart is 0, so this clears the finished line now instead of leaving it until the next throttled refresh
  saveQuiet = true; const restOk = saveAll(); saveQuiet = false; // the gated sides write already landed; this pass carries the metadata - a failure here warns but cannot resurrect anything (authority + archive agree)
  finishChange();
  const rb = $('resetBtn'); rb.textContent = 'Undo'; rb.classList.add('undoing'); rb.style.display = '';
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { undoSnap = null; rb.textContent = 'Finish'; rb.classList.remove('undoing'); updateCount(); }, 8000);
  toast((archiving ? 'Clean archived · ' + Object.keys(snap.items).length + ' streets' : 'Board cleared — under 3 streets, nothing saved') + (restOk ? '' : ' — some details could not be written (' + saveFailKey + '); they retry on the next save'), 3400);
  if (archiving) maybeBackupNudge();
}
function performReset() { finishRun(); } // production's name for the finish action (the test battery calls it directly)
function doUndo() {
  if (!undoSnap) return;
  // Beta 1.57: the undo follows the same transaction discipline - the restored
  // history and authority records are written from the snapshot FIRST; a
  // failure keeps the undo on offer (snapshot retained, button unchanged)
  // instead of half-undoing.
  if (!lsSet(LS.hist, JSON.stringify(undoSnap.hist))) { toast('Storage problem — undo stopped, nothing changed', 3600); return; }
  if (!lsSet(LS.sides, JSON.stringify({ p: undoSnap.pieces, t: undoSnap.pieceTimes }))) { const rbOk = lsSet(LS.hist, JSON.stringify(history)) && lsGet(LS.hist) === JSON.stringify(history); toast(rbOk ? 'Storage problem — undo stopped, nothing changed' : 'Storage failure — undo stopped, but the history restore could not be undone. Export a recovery backup now', rbOk ? 3600 : 6000); return; } // Beta 1.63 (audit F02): the mirror rollback is verified too
  // Beta 1.94 (deep audit SR-193-04): the restored run's START is a gate too, taken BEFORE the
  // snapshot below is consumed. It used to ride the saveAll after the state swap (with
  // undoSnap already nulled), so a failed start write plus a reload restored the board but
  // lost the run itself - marks with no run to finish or cancel. A failure here rolls BOTH
  // gated writes back (each checked by read-back, as elsewhere) and returns with the undo
  // still on offer: nothing half-committed.
  const startOk = undoSnap.runStart ? (lsSet(LS.start, String(undoSnap.runStart)) && lsGet(LS.start) === String(undoSnap.runStart)) : lsDel(LS.start);
  if (!startOk) {
    const rbHist = lsSet(LS.hist, JSON.stringify(history)) && lsGet(LS.hist) === JSON.stringify(history);
    const rbSides = lsSet(LS.sides, JSON.stringify({ p: pieces, t: pieceTimes })) && lsGet(LS.sides) === JSON.stringify({ p: pieces, t: pieceTimes });
    toast((rbHist && rbSides) ? 'Storage problem — undo stopped, nothing changed' : 'Storage failure — undo stopped, but the rollback could not be verified. Export a recovery backup now', (rbHist && rbSides) ? 3600 : 6000);
    return;
  }
  // Beta 1.95 (deep audit SR-194-01): the restored run's cancel SNAPSHOT is a gate too,
  // on the same discipline as the start gate above: the undo is complete only when the
  // snapshot is persisted again (read back) for the restored run, because a later reload
  // leaves Cancel nothing else exact to restore from. A failure rolls all three gated
  // writes back (each checked) and returns with the undo still on offer.
  if (undoSnap.snap) {
    const snapRaw = JSON.stringify({ at: undoSnap.runStart, pieces: undoSnap.snap.pieces, pieceTimes: undoSnap.snap.pieceTimes, done: undoSnap.snap.done, times: undoSnap.snap.times, via: undoSnap.snap.via, cov: undoSnap.snap.cov });
    if (!(lsSet(LS.snap, snapRaw) && lsGet(LS.snap) === snapRaw)) {
      const rbHist = lsSet(LS.hist, JSON.stringify(history)) && lsGet(LS.hist) === JSON.stringify(history);
      const rbSides = lsSet(LS.sides, JSON.stringify({ p: pieces, t: pieceTimes })) && lsGet(LS.sides) === JSON.stringify({ p: pieces, t: pieceTimes });
      const rbStart = lsDel(LS.start);
      toast((rbHist && rbSides && rbStart) ? 'Storage problem — undo stopped, nothing changed' : 'Storage failure — undo stopped, but the rollback could not be verified. Export a recovery backup now', (rbHist && rbSides && rbStart) ? 3600 : 6000);
      return;
    }
  }
  clearTimeout(undoTimer);
  const undoHadSnap = !!undoSnap.snap; // Beta 1.96 (SR-195-06): captured before undoSnap is consumed - the success message below must say when the restored run carries NO snapshot (its Cancel is journal-grade), which 1.95 restored in silence
  const undoSnapGpsWas = !!undoSnap.gpsWas; // undo restores the pre-finish state: GPS restarts only if it was actually running for the run (a fresh watch's first error toast would otherwise overwrite the 'Finish undone' toast)
  doneSet = new Set(undoSnap.done); doneTimes = undoSnap.times; doneVia = undoSnap.via; notes = undoSnap.notes || {}; pieces = undoSnap.pieces; pieceTimes = undoSnap.pieceTimes; runStart = undoSnap.runStart; coveredIdx = undoSnap.cov; runSnap = undoSnap.snap ? JSON.parse(JSON.stringify(undoSnap.snap)) : null; if (undoSnap.snap) snapDirty = false; // Beta 1.95 (SR-194-01): the restored run carries its cancel snapshot again - in memory and (gate above) on disk
  history = undoSnap.hist;
  suggested = new Set(); $('suggest').classList.add('hidden'); // Beta 1.70 (audit A04): the restored coverage starts with a clean suggestion set
  undoSnap = null;
  const rb = $('resetBtn'); rb.textContent = 'Finish'; rb.classList.remove('undoing');
  saveQuiet = true; const metaOk = saveAll(); saveQuiet = false; const fcOk = finishChange(); if (runStart && undoSnapGpsWas) startGps(true);
  drawTrail(true); // Beta 1.69: the restored run's trail redraws at once
  if (metaOk && fcOk && runStart && !undoHadSnap) toast('Finish undone — run restored, but no start snapshot is saved for it, so its Cancel will rebuild from the marks made during the run', 4600); // Beta 1.96 (SR-195-06)
  else if (metaOk && fcOk) toast('Finish undone — run restored'); else toast('Finish undone — run restored, but some details could not be saved (' + (saveFailKey || 'storage') + '); they retry on the next save', 4200); // Beta 1.70 (audit A01): the gated writes (history, sides) already landed - it is the metadata pass that can fail, and the old unconditional toast claimed a durability it did not have
}
function checkStale() {
  const stale = runStart && (Date.now() - runStart > 12 * 3600000);
  $('stale').classList.toggle('hidden', !stale);
  if (stale) $('staleText').textContent = 'This clean started ' + fmtClock(new Date(runStart)) + ' — over 12 hours ago. Finish it, or keep going?';
}
$('staleYes').addEventListener('click', () => { $('stale').classList.add('hidden'); $('resetBtn').click(); });
$('staleNo').addEventListener('click', () => $('stale').classList.add('hidden'));
// Backup nudge
function maybeBackupNudge() {
  const st = parseJ(lsGet(LS.exp), {});
  if (st.nudgedAt && Date.now() - st.nudgedAt < 7 * 86400000) return;
  $('bakText').textContent = 'Clean saved. Export a backup so your history survives a lost phone.';
  $('bakNudge').classList.remove('hidden');
}
$('bakLater').addEventListener('click', () => { lsSet(LS.exp, JSON.stringify({ nudgedAt: Date.now() })); $('bakNudge').classList.add('hidden'); });
$('bakSave').addEventListener('click', () => { lsSet(LS.exp, JSON.stringify({ nudgedAt: Date.now() })); $('bakNudge').classList.add('hidden'); openExport(); downloadBackup(); });

// ===== NOTES (production model: notes[street] = [{k:'note', at, text} | {k: flag kind, at}]) =====
const FLAGS = { car: 'Car blocking', hazard: 'Hazard', missed: 'Missed spot', salt: 'Needs salt' };
function noteEntry(n) { return (Array.isArray(notes[n]) ? notes[n] : []).find(f => f.k === 'note'); }
function noteTextOf(n) { const e = noteEntry(n); return e && typeof e.text === 'string' ? e.text : ''; }
function setNoteText(n, txt) {
  const t = (txt || '').trim();
  const arr = Array.isArray(notes[n]) ? notes[n].slice() : [];
  const i = arr.findIndex(f => f.k === 'note');
  if (!t) { if (i >= 0) arr.splice(i, 1); }
  else if (i >= 0) { arr[i] = Object.assign({}, arr[i], { text: t, at: new Date().toISOString() }); }
  else arr.push({ k: 'note', at: new Date().toISOString(), text: t });
  if (arr.length) notes[n] = arr; else delete notes[n];
  return saveAll(); // Beta 1.63 (audit F04): callers announce from the result
}
function flagText(n) { return (Array.isArray(notes[n]) ? notes[n] : []).map(f => f.k === 'note' ? ('📝 ' + (f.text || '')) : (FLAGS[f.k] || f.k) + (f.at ? ' ' + fmtClock(new Date(f.at)) : '')).join('; '); }
let noteFor = null;
function openNote(name) { noteFor = name; $('noteTitle').textContent = 'Note — ' + name; $('noteText').value = noteTextOf(name); $('noteModal').classList.remove('hidden'); }
$('noteNo').addEventListener('click', () => $('noteModal').classList.add('hidden'));
$('noteYes').addEventListener('click', () => {
  if (!noteFor) return;
  const okNote = setNoteText(noteFor, $('noteText').value);
  $('noteModal').classList.add('hidden'); renderStreets(); if (okNote) toast('Note saved'); else toast('Storage problem — the note could not be saved', 4200); // Beta 1.63 (audit F04)
});

// ===== GPS (checklist SS7) =====
// Beta 1.64 (audit R01): lastFixTs is the last accepted fix's OWN timestamp - a callback carrying an older one is stale
let watchId = null, watchGen = 0, gpsFromRun = false, gpsPos = null, dispPos = null, lastFixAt = 0, lastFixTs = 0, lastGood = null, spdTimer = 0, offRouteArmed = true, followPaused = false, staleWatchTimer = 0;
const SAMPLES = {};
(function buildSamples() { for (const n of STREETNAMES) { const L = STRETCH[n].line, cum = STRETCH[n].cum, pts = []; for (let d = 0; d <= STRETCH[n].total; d += 15) { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const span = cum[i] - cum[i - 1] || 1, t = (d - cum[i - 1]) / span; pts.push([L[i - 1][0] + (L[i][0] - L[i - 1][0]) * t, L[i - 1][1] + (L[i][1] - L[i - 1][1]) * t]); } SAMPLES[n] = pts; } })();
// (the coverage-index sanitizer lives in loadRouteState, app1 - Beta 1.76: it must run over the loaded state, and state now loads on route pick, not at eval)
let suggested = new Set();
function pushGps() {
  const src = map && map.getSource('gps'); if (!src) return;
  const feats = [];
  if (dispPos && watchId != null && facingDeg != null) { // the facing beam (Beta 1.49): a point carrying the facing - the gps-beam symbol layer paints the gradient fan image along it (Apple Maps style, Andrew's reference)
    feats.push({ type: 'Feature', properties: { k: 'beam', rot: Math.round(facingDeg * 10) / 10 }, geometry: { type: 'Point', coordinates: [dispPos[1], dispPos[0]] } });
  }
  if (dispPos) {
    feats.push({ type: 'Feature', properties: { k: 'dot' }, geometry: { type: 'Point', coordinates: [dispPos[1], dispPos[0]] } });
    if (gpsAccM > 0) { const ring = []; const R = gpsAccM; for (let a = 0; a <= 28; a++) { const th = a / 28 * Math.PI * 2; ring.push([dispPos[1] + (R * Math.sin(th)) / MLNG, dispPos[0] + (R * Math.cos(th)) / MLAT]); } feats.push({ type: 'Feature', properties: { k: 'ring' }, geometry: { type: 'Polygon', coordinates: [ring] } }); }
  }
  src.setData({ type: 'FeatureCollection', features: feats });
}
let gpsAccM = 0;
let lastTrailDraw = 0, lastTrailPts = 0; // Beta 1.64: drawTrail throttle state (audit 3)
function drawTrail(force) {
  const src = map && map.getSource('trail'); if (!src) return;
  const t0s = runStart ? Math.floor(runStart / 1000) : 0; // Beta 1.64 (audit F05): only THIS clean's points draw as the active trail - the stored trail keeps every clean for the log and GPX; the display is run-scoped
  const pts = runStart ? trail.filter(p => p[2] >= t0s) : [];
  if (!force && performance.now() - lastTrailDraw < 3000 && pts.length - lastTrailPts < 5) return; // Beta 1.64 (audit 3): the rebuild is O(trail) up to 8000 points - redraw at most every 3 s, or once 5 undrawn points have accumulated, whichever comes first; forced draws (run start, trail clear) ignore the throttle
  lastTrailDraw = performance.now(); lastTrailPts = pts.length;
  const feats = [];
  if (pts.length > 1) {
    let seg = pts.length ? [pts[0]] : [];
    for (let i = 1; i < pts.length; i++) { const gap = pts[i][2] - pts[i - 1][2] > 300 || distM(pts[i - 1], pts[i]) > 1000; if (gap) { if (seg.length > 1) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: seg.map(p => [p[1], p[0]]) } }); seg = [pts[i]]; } else seg.push(pts[i]); }
    if (seg.length > 1) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: seg.map(p => [p[1], p[0]]) } });
  }
  src.setData({ type: 'FeatureCollection', features: feats });
}
function havM(a, b) { const R = 6371000, dLa = (b[0] - a[0]) * Math.PI / 180, dLo = (b[1] - a[1]) * Math.PI / 180; const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }
let renderRaf = 0, renderPump = 0, lastFrameAt = 0, lastCamAt = 0, lastPushKey = ''; // Beta 1.65 (Andrew's road report: the GPS motion stuttered; third audit item 1): ONE frame-synced render loop drives the dot and the camera - the 40 ms glide timer and the 50 ms camera timer used to overlap at ~45 unsynced updates a second, and the camera's per-tick easing sped up whenever they overlapped
let glideFrom = null, glideTarget = null, glideT0 = 0, glideDur = 0, glideActive = false;
function glideTo(target) {
  glideFrom = dispPos ? dispPos.slice() : target.slice();
  glideTarget = target.slice();
  const d = havM(glideFrom, glideTarget); glideDur = Math.max(200, Math.min(1500, d * 30));
  glideT0 = performance.now(); glideActive = true; startRenderLoop(); // the glide is STATE now, not a timer - the render loop advances it from the clock; the smoothstep easing itself is unchanged (Beta 1.28). The loop starts here, not only in startGps: a fix can arrive on an existing watch (or be fed directly) and must still render
}
function renderTick(now) {
  if (glideActive && glideTarget) {
    const t = Math.min(1, (now - glideT0) / glideDur);
    const e = t * t * (3 - 2 * t); // smoothstep: the glide eases in and out instead of starting/stopping dead (Beta 1.28) - linear segments meeting at each fix were half the visible jaggedness
    dispPos = [glideFrom[0] + (glideTarget[0] - glideFrom[0]) * e, glideFrom[1] + (glideTarget[1] - glideFrom[1]) * e];
    if (t >= 1) glideActive = false;
  }
  const key = dispPos ? dispPos[0] + ',' + dispPos[1] + ',' + facingDeg + ',' + gpsAccM : '';
  if (key !== lastPushKey) { lastPushKey = key; pushGps(); } // redraw the dot/ring/beam only when something actually moved - the old timers rebuilt it on every tick regardless
  followCam(now);
}
function renderLoop(now) {
  lastFrameAt = now;
  renderTick(now);
  if (watchId == null && !glideActive) { renderRaf = 0; return; } // nothing left to animate: the loop parks itself until the next glide or GPS start
  renderRaf = requestAnimationFrame(renderLoop);
}
function startRenderLoop() { if (!renderRaf) { lastCamAt = lastFrameAt = performance.now(); renderRaf = requestAnimationFrame(renderLoop); } if (!renderPump) renderPump = setInterval(() => { if ((watchId != null || glideActive) && performance.now() - lastFrameAt > 100) renderTick(performance.now()); if (watchId == null && !glideActive && !renderRaf) { clearInterval(renderPump); renderPump = 0; } }, 100); } // the pump is a starvation fallback only: a browser that is not painting (headless, occluded) delivers no animation frames, and the GPS state must still advance - on a painting phone it never fires; it parks itself when nothing is left to render
function followCam(now) {
  if (!dispPos || followPaused || watchId == null) { lastCamAt = now; return; } // follow whenever location is ON (Beta 1.27, Andrew) - it used to engage only during a run, so the dot wandered off-screen on a plain drive. Trail recording and heading-up stay run-only.
  const c = map.getCanvas(); const p = projLL(dispPos);
  const dx = p.x - c.clientWidth / 2, dy = p.y - c.clientHeight / 2;
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) { lastCamAt = now; return; }
  const dt = Math.min(100, Math.max(1, now - lastCamAt)); lastCamAt = now;
  const f = 1 - Math.pow(0.65, dt / 50); // Beta 1.65: the 1.28 ease (close 35% of the remaining offset per 50 ms) made time-based, so the convergence is identical at any frame rate - a gradual lock that keeps the dot kind of in the centre, never a snap and never a chase view
  map.panBy([dx * f, dy * f], { animate: false });
}
onMapReady(() => map.on('dragstart', () => { followPaused = true; }));
onMapReady(() => map.on('dragend', () => { if (runStart) northUp(); })); // during a run: ease back to north-up like a nav app. Outside a run (Beta 1.27): a rotation/tilt he deliberately set stays put.
// HEADING-UP (Andrew, Beta 1.14 - replaces Flip): while the camera follows during a run, the map rotates
// so his direction of travel points up - course-up from the GPS course, not the compass and not true
// north: 'my north' is wherever he is heading. Smoothed around the circle so low-speed wobble can't spin
// the map; under ~1 m/s the course is unreliable, so the map just holds its last bearing.
let smHeading = null;
function headDelta(a, b) { return ((b - a + 540) % 360) - 180; }
function updateHeading(hdg, speed) {
  if (typeof hdg !== 'number' || isNaN(hdg) || !speed || speed < 1) return;
  if (!runStart || followPaused) return;
  smHeading = smHeading === null ? hdg : smHeading + headDelta(smHeading, hdg) * 0.35;
  const cur = map.getBearing();
  const d = headDelta(cur, smHeading);
  if (Math.abs(d) > 3) map.easeTo({ bearing: cur + d, duration: 350 });
}
function northUp() { smHeading = null; if (!map) return; if (Math.abs(map.getBearing()) > 0.5) map.easeTo({ bearing: 0, duration: 400 }); } // Beta 1.76: same no-map tolerance as drawTrail/pushGps - a finish on a map-less page must reach its transaction, not throw here
// ===== POSITION FILTER (Beta 1.28, Andrew: the dot jitters at slow speed) =====
// A Kalman filter [the estimator navigation apps use: it carries a position AND a
// velocity, and weighs each new fix by its stated accuracy against how well the fix
// fits the motion so far] replaces the 3-fix weighted average. The average let every
// noisy fix drag the dot metres sideways - worst at driveway speeds, where raw GPS
// wander is bigger than the real movement. The filter discounts wander (at low speed
// the estimate barely creeps) and trusts steady motion (at speed it tracks fully).
// Worked per-axis in local metres around the first fix's origin. The hard gates in
// acceptFix (finite/on-Earth, accuracy) still run BEFORE a fix reaches the filter.
let kf = null; // {ox, oy, at, x:{p,v,a,b,c}, y:{...}} - a/b/c are the axis covariance terms
const KF_Q = 0.5; // process noise: how much real acceleration to expect between fixes
function kfAxis(z, ax, dt, R) {
  ax.p += ax.v * dt; // predict: coast on the estimated velocity
  const a = ax.a + 2 * dt * ax.b + dt * dt * ax.c + KF_Q * dt ** 4 / 4;
  const b = ax.b + dt * ax.c + KF_Q * dt ** 3 / 2;
  const c = ax.c + KF_Q * dt * dt;
  const y = z - ax.p, S = a + R, K0 = a / S, K1 = b / S; // gain: high when the motion model is unsure or the fix is precise
  ax.p += K0 * y; ax.v += K1 * y;
  ax.a = (1 - K0) * a; ax.b = (1 - K0) * b; ax.c = c - K1 * b;
}
function kfUpdate(ll, acc, now) {
  const zx = ll[1] * MLNG, zy = ll[0] * MLAT, R = Math.max(acc, 5) ** 2;
  if (kf) {
    const dt0 = (now - kf.at) / 1000;
    if (dt0 > 10 || Math.hypot(zx - kf.ox - kf.x.p, zy - kf.oy - kf.y.p) > 75) kf = null; // reacquisition: a long silence or a far jump voids the motion model
  }
  if (!kf) { kf = { ox: zx, oy: zy, at: now, x: { p: 0, v: 0, a: R, b: 0, c: 4 }, y: { p: 0, v: 0, a: R, b: 0, c: 4 } }; return { est: ll.slice(), aim: ll.slice() }; }
  const dt = Math.min(Math.max((now - kf.at) / 1000, 0.05), 5); kf.at = now;
  kfAxis(zx - kf.ox, kf.x, dt, R); kfAxis(zy - kf.oy, kf.y, dt, R);
  const est = [(kf.oy + kf.y.p) / MLAT, (kf.ox + kf.x.p) / MLNG];
  // gentle lookahead: the glide aims a fraction of a second along the estimated velocity
  // (capped at 3 m), so the dot keeps flowing between fixes instead of bursting once a second
  const lx = Math.max(-3, Math.min(3, kf.x.v * 0.45)), ly = Math.max(-3, Math.min(3, kf.y.v * 0.45));
  return { est, aim: [(kf.oy + kf.y.p + ly) / MLAT, (kf.ox + kf.x.p + lx) / MLNG] };
}
// ===== FACING (Beta 1.28, Andrew: the Apple Maps light beam on the dot) =====
// One funnel for every facing source, smoothed around the circle so the beam never
// snaps. Sources: the GPS course while moving (truest inside a steel vehicle), the
// device compass while still. On iOS the compass needs a permission granted from a
// tap, so it is requested from startGps - a genuine user gesture.
let facingDeg = null, lastCourseAt = 0, compassOn = false;
function setFacing(deg, w) {
  if (typeof deg !== 'number' || isNaN(deg)) return;
  const before = facingDeg;
  facingDeg = facingDeg === null ? deg : ((facingDeg + headDelta(facingDeg, deg) * (w || 0.3)) % 360 + 360) % 360;
  if (watchId != null && dispPos && (before === null || Math.abs(headDelta(before, facingDeg)) > 1.5)) pushGps();
}
let compassHandler = null, compassGen = 0; // Beta 1.64 (audit F08): the orientation handler is a stable reference so stopGps can actually remove it - it used to be a closure re-registered on every start and never removed
function startCompass() {
  if (compassOn) return;
  if (!compassHandler) compassHandler = e => {
    let deg = null;
    if (typeof e.webkitCompassHeading === 'number') deg = e.webkitCompassHeading; // iOS: degrees clockwise from north, ready to use
    else if (e.absolute && typeof e.alpha === 'number') deg = (360 - e.alpha) % 360;
    if (deg === null || Date.now() - lastCourseAt < 3000) return; // while the course is fresh it outranks the compass
    setFacing(deg, 0.25);
  };
  const gen = compassGen;
  const listen = () => { if (gen !== compassGen) return; compassOn = true; window.addEventListener('deviceorientationabsolute', compassHandler, true); window.addEventListener('deviceorientation', compassHandler, true); };
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') listen(); }).catch(() => {});
  else listen();
}
function stopCompass() { compassGen++; if (compassHandler) { window.removeEventListener('deviceorientationabsolute', compassHandler, true); window.removeEventListener('deviceorientation', compassHandler, true); } compassOn = false; }
function acceptFix(pos) {
  const now = Date.now(); const ll = [pos.coords.latitude, pos.coords.longitude]; const acc = pos.coords.accuracy || 999;
  if (!Number.isFinite(ll[0]) || !Number.isFinite(ll[1]) || Math.abs(ll[0]) > 90 || Math.abs(ll[1]) > 180) return; // audit G1: never let a non-finite or off-Earth fix reach the smoothing, trail or coverage math
  if (typeof pos.timestamp === 'number' && lastFixTs && pos.timestamp < lastFixTs) return; // Beta 1.64 (audit R01): a delayed or out-of-order callback must not move the dot, trail or coverage backwards
  if (acc > 65 && lastGood && now - lastGood.at < 10000) return;
  if (acc <= 65) lastGood = { ll, at: now };
  const speed = pos.coords.speed;
  lastFixAt = now; if (typeof pos.timestamp === 'number') lastFixTs = pos.timestamp; gpsAccM = acc;
  const { est: sm, aim } = kfUpdate(ll, acc, now); // the filter subsumes the old deadband: sub-noise moves barely shift the estimate, so no fix needs swallowing
  renderTick(performance.now()); // Beta 1.66: settle the running glide to NOW before re-anchoring on the new aim - a glide that is re-aimed from a stale position (few ticks in a non-painting browser) makes the dot chase leftover distance, which is exactly the wander drive127 S1/S2 measure
  const firstFix = !gpsPos;
  gpsPos = sm;
  glideTo(aim);
  updateHeading(pos.coords.heading, speed);
  if (typeof pos.coords.heading === 'number' && speed && speed >= 1) { lastCourseAt = now; setFacing(pos.coords.heading, 0.5); } // moving: face along the course
  const spd = $('spd');
  if (speed && speed > 0.5) { spd.textContent = Math.round(speed * 3.6) + ' km/h'; spd.classList.remove('hidden'); } else spd.classList.add('hidden');
  if (firstFix && (gpsFromRun || watchId != null)) { map.jumpTo({ center: [sm[1], sm[0]], zoom: Math.max(map.getZoom(), 15) }); followPaused = false; }
  // outside-route note (route box + 400 m)
  const inB = sm[0] > routeBox.s - 0.0036 && sm[0] < routeBox.n + 0.0036 && sm[1] > routeBox.w - 0.005 && sm[1] < routeBox.e + 0.005;
  if (!inB && offRouteArmed) { offRouteArmed = false; toast("You are outside the route area — GPS won't mark streets here", 3600); }
  if (inB) offRouteArmed = true;
  if (runStart && gpsFromRun) { // Beta 1.49 (Andrew's rule): route data is recorded ONLY by a clean's own GPS - the Locate tab's view-only watch never writes trail or coverage, even if a stale flag disagrees
    trail.push([+sm[0].toFixed(6), +sm[1].toFixed(6), Math.floor(now / 1000)]);
    if (trail.length > TRAIL_MAX) trail.splice(0, trail.length - TRAIL_MAX);
    trailDirty = true; flushAux(false); drawTrail();
    coverFix(sm);
  }
}
function coverFix(ll) {
  let changed = false;
  for (const n of STREETNAMES) {
    if (streetComplete(n) || suggested.has(n)) continue;
    const pts = SAMPLES[n]; const set = new Set(coveredIdx[n] || []);
    for (let i = 0; i < pts.length; i++) { if (!set.has(i) && distM(ll, pts[i]) <= 22) { set.add(i); changed = true; } }
    if (set.size) coveredIdx[n] = [...set];
    if (set.size >= Math.ceil(pts.length * 0.85) && !streetComplete(n)) { suggested.add(n); showSuggest(n); }
  }
  if (changed) auxDirty = true;
}
function showSuggest(n) {
  $('sugText').textContent = n + ' looks fully covered by GPS but is not marked done.';
  $('suggest').dataset.n = n;
  $('suggest').classList.remove('hidden');
}
$('sugYes').addEventListener('click', () => { const n = $('suggest').dataset.n; $('suggest').classList.add('hidden'); if (n) { const c = STRETCH[n].line[Math.floor(STRETCH[n].line.length / 2)]; map.flyTo({ center: [c[1], c[0]], zoom: Math.max(map.getZoom(), 15.5) }); selectStretch(n, 0, c); } });
$('sugNo').addEventListener('click', () => $('suggest').classList.add('hidden'));
let weakToastAt = 0;
function gpsError(e) {
  if (e && e.code === 1) { toast('Location is off — allow location for this site in your browser settings', 4200); stopGps(); return; }
  if (Date.now() - weakToastAt > 60000) { weakToastAt = Date.now(); toast('GPS signal weak — still trying', 2600); }
}
function startGps(fromRun) {
  if (watchId != null) { if (fromRun) { gpsFromRun = true; $('gpsBtn').classList.add('on'); $('gpsBtn').classList.toggle('rec', true); } return; } // Beta 1.64 (audit F06): reusing a view-only watcher for a clean must still flip the Locate tab to its recording face - the class sync sits below this early return, so the tab used to stay blue while recording
  if (!navigator.geolocation) { toast('This device has no GPS access here', 3000); return; }
  gpsFromRun = !!fromRun; followPaused = false; lastPushKey = ''; startCompass();
  const wg = ++watchGen; watchId = navigator.geolocation.watchPosition(p => { if (wg === watchGen) acceptFix(p); }, e => { if (wg === watchGen) gpsError(e); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }); // Beta 1.69 (audit N04): callbacks carry their watcher's generation - a queued callback from a stopped or replaced watcher is dropped even when its timestamp is fresh (R01's guard cannot tell watchers apart)
  startRenderLoop(); // Beta 1.65: the frame-synced loop keeps centring after a glide ends (the Beta 1.28 camTimer's job, drive126 F2) - on the display's own clock now, not a second timer
  clearInterval(staleWatchTimer);
  staleWatchTimer = setInterval(() => { if (watchId != null && Date.now() - lastFixAt > 45000 && lastFixAt) { const wasRunGps = gpsFromRun; stopGps(true); startGps(wasRunGps); } }, 15000); // Beta 1.48 (audit B02): capture run ownership BEFORE stopGps clears it - the restart used to always come back as non-run GPS, so a mid-run watcher lost its run
  $('gpsBtn').classList.add('on');
  $('gpsBtn').classList.toggle('rec', gpsFromRun); // Beta 1.49: recording wears red on the Locate tab; view-only wears blue
}
function stopGps(silent) {
  watchGen++; // Beta 1.69: invalidate any callback still queued from this watcher
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null; gpsFromRun = false; clearInterval(staleWatchTimer); glideActive = false; if (renderRaf) { cancelAnimationFrame(renderRaf); renderRaf = 0; } clearInterval(renderPump); renderPump = 0; stopCompass(); // Beta 1.64 (audit F08); Beta 1.65: the render loop stops with the watch
  if (map) pushGps(); // Beta 1.48 (audit B05): the facing beam is only built while watchId lives - without a fresh push the last beam stayed drawn after stop
  $('gpsBtn').classList.remove('on'); $('gpsBtn').classList.remove('rec'); $('spd').classList.add('hidden');
}
$('gpsBtn').addEventListener('click', () => { if (!tapGuard('gpsBtn')) return; if (watchId != null) stopGps(); else if (runStart) { startGps(true); toast('Clean in progress — recording your route', 2600); } else { startGps(false); toast('Location on — view only, not recording', 2400); } }); // Beta 1.49 (Andrew's rule): the Locate tab alone never records - with no clean open it is view-only; pressed during an open clean it resumes that clean's recording and says so
