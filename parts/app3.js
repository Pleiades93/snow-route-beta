
// ===== PACE (one source) =====
function refRun() { // newest qualifying clean wins (history is chronological, so search from the end)
  for (let i = history.length - 1; i >= 0; i--) { const h = history[i]; if (h.items && cleanCount(h) === STREETNAMES.length) return h; } // Beta 1.94 (audit F-01): full = every street in the route's own list, not a hard-coded 34. Beta 1.169 (B-07): counted by cleanCount, like every other surface - a null-timestamped street still counts (it was cleaned), a foreign key never does
  for (let i = history.length - 1; i >= 0; i--) { const h = history[i]; if (h.items && cleanCount(h) >= 5) return h; }
  return null;
}
function cleanCount(h) { const items = (h && h.items) || {}; return Object.keys(items).filter(n => STREETSET.has(n)).length; } // Beta 1.169 (Carbon fix round, B-07): THE count of a clean's streets, in one place - the streets the clean covers: its item keys that belong to the route, timestamp or not (buildSnap writes a null time for a completed street whose moment was not recorded; the street was still cleaned, and openClean lists it). Through 1.168 refRun and the pace/detail headers counted raw keys while histDur counted only timestamped streets, so the same clean could read '34 streets' in one line and '33 of 34' in the next.
function cleanWorkM(h) { // side-metres a saved clean actually covered
  if (h && typeof h.workM === 'number' && isFinite(h.workM) && h.workM >= 0) return h.workM; // Beta 1.167 (run/pace fix round, B2): cleans archived by 1.167+ carry the run-attributed figure Finish measured (buildSnap's workM) - it is read VERBATIM, so pre-Start work never counts (RP-05), a later geometry edit cannot re-price the clean (RP-06), and a partially-recorded sides map cannot short-circuit into an undercount (RP-09). Legacy entries (no workM) derive below, exactly as they always have.
  const items = (h && h.items) || {}; let si = 0; for (const n of Object.keys(items)) if (STRETCH[n]) si += STRETCH[n].total * 2; // the items derivation: every completed street at both sides of its full length
  if (h && h.sides && h.sides.p && typeof h.sides.p === 'object') { let s = 0; for (const n of STREETNAMES) { const p = h.sides.p[n]; if (Array.isArray(p) && STRETCH[n]) { STRETCH[n].parts.forEach((part, i) => { const v = p[i] | 0; const L = segLenM(part); if (v & 1) s += L; if (v & 2) s += L; }); } else if (items[n] && STRETCH[n]) s += STRETCH[n].total * 2; } if (s > 0) return s; } // Beta 1.169 (Carbon fix round, B-06): the sides branch used to price ONLY the sides map and return it the moment it priced anything - a PARTIALLY-recorded map (some completed streets carry no sides entry at all) short-circuited into the very RP-09 undercount the stored workM exists to prevent, alive in the legacy branch. The merge is now PER STREET: a street WITH a sides entry is priced by its bits (authoritative - it alone sees partial-side work, including on streets never completed), a completed street MISSING from the map falls back to the items derivation for that street.
  return si;
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
  return { count: cleanCount(h), durMs: ts[ts.length - 1] - start, start }; // Beta 1.169 (B-07): the DURATION still spans the timestamped streets (ks above - a span needs moments), but the COUNT is cleanCount: every street the clean covers, null-timestamped ones included
}
let histOpen = false;
function renderPace() {
  const p = paceInfo();
  const ref = p.ref;
  let html =
    '<div>Reference clean: <b>' + (ref ? new Date(ref.at).toLocaleDateString() + ' (' + cleanCount(ref) + ' streets)' : 'none yet — finish a clean to set your pace') + '</b></div>' +
    '<div>Pace: <b>' + (p.rateMh ? fmtRate(p.rateMh) + ' · full clean ≈ ' + fmtDur(totalWorkM() / p.rateMh * 3600000) + (p.live ? ' (this run so far)' : ' (reference clean)') : '—') + '</b></div>' +
    '<div>This run: <b>' + (runStart ? 'started ' + fmtClock(new Date(runStart)) + (p.etaTxt ? ' · ' + p.etaTxt : '') : 'not started') + '</b></div>' +
    '<div>Work done: <b>' + Math.round(workDoneM()) + ' m of ' + Math.round(totalWorkM()) + ' m of street sides</b></div>' +
    (runStart ? '<button class="red" id="paceCancel">Cancel start</button>' : '');
  html += '<div class="psec" id="histHead">Previous cleans ' + (histOpen ? '▲' : '▼') + '</div>';
  if (histOpen) {
    let any = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const d = histDur(history[i]);
      if (!d) { html += '<div class="prow histRow" data-i="' + i + '"><span>' + fmtWhen(history[i].at) + '</span><span>time not recorded · ' + cleanCount(history[i]) + ' of ' + STREETNAMES.length + ' streets ›</span></div>'; any++; continue; } // Beta 1.167 (B4, RP-04): a legacy clean whose item times are all null is still LISTED - and opens, and deletes through the same two-tap flow. Through 1.166 histDur's null skipped it here while refRun could still pick it as the pace reference: it existed, set the pace, and could never be seen or removed.
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
  const elapsedMs = d ? Date.parse(h.at) - d.start : NaN; // Beta 1.167 (B3, RP-08): the SECOND interval - the run's start to the Finish tap (h.at). Through 1.166 the single 'Total time' figure was histDur's start-to-LAST-COMPLETION span while the pace rate divided by start-to-Finish: two different intervals, one label, a 15.8% skew on a 30-minute tail. Both are shown now, each under its own label; the math is unchanged.
  const paceRate = (d && !isNaN(elapsedMs) && elapsedMs >= 0) ? workRateMh(cleanWorkM(h), d.start, Date.parse(h.at), 0.05) : null; // the pace divides the clean's work by the TOTAL ELAPSED window - the same window workRateMh uses for the reference figure in renderPace - and the meta line says so
  meta.textContent = (d ? ('Streets done in ' + fmtDur(d.durMs) + ' · Total elapsed ' + fmtDur(Math.max(0, elapsedMs)) + ' · ') : '') + cleanCount(h) + ' streets' + (h.km ? (' · ' + h.km + ' km of GPS trail') : '') + (h.pathShortened ? ' · saved GPS path shortened by the trail cap' : '') + (paceRate ? (' · Pace ' + fmtRate(paceRate) + ' (work / total elapsed)') : '') + (h.startedAt ? (' · started ' + fmtClock(new Date(h.startedAt))) : '') + '\nPace divides the clean\'s recorded work by its total elapsed time (start to the Finish tap). Per-street span = first side marked to last side marked (includes any work in between). Tap a street for its details.';
  cv.appendChild(meta);
  const items = h.items || {};
  const order = Object.keys(items).filter(n => STREETSET.has(n)).sort((x, y) => String(items[x] || '9999').localeCompare(String(items[y] || '9999')));
  let prev = h.startedAt ? Date.parse(h.startedAt) : NaN;
  order.forEach(n => {
    const t = items[n] ? Date.parse(items[n]) : NaN;
    const dur = (!isNaN(t) && !isNaN(prev) && t >= prev) ? t - prev : NaN; // Beta 1.167 (B3, RP-07): a completion stamped BEFORE the previous one (a skewed import) yields no gap at all - never a negative duration
    const stArr = (h.sides && h.sides.t && Array.isArray(h.sides.t[n])) ? h.sides.t[n].flat().map(x => Date.parse(x)).filter(x => !isNaN(x)) : []; // Beta 1.91: the street's own side stamps - span = first side marked to last side marked
    const span = stArr.length ? Math.max.apply(null, stArr) - Math.min.apply(null, stArr) : NaN;
    if (!isNaN(t)) prev = t;
    const rowEl = document.createElement('div'); rowEl.className = 'cvRow';
    const top = document.createElement('div'); top.className = 'cvTop';
    top.innerHTML = '<div class="cvNm"></div><div class="cvTm"></div>';
    top.querySelector('.cvNm').textContent = n;
    top.querySelector('.cvTm').textContent = (!isNaN(t) ? fmtClock(new Date(t)) : '—') + ((span > 0) ? (' · span ' + fmtDur(span)) : (stArr.length ? ' · marked in one go' : (!isNaN(dur) ? (' · gap ' + fmtDur(dur)) : ''))); // Beta 1.167 (B3, RP-07): a street whose recorded sides all carry ONE moment (span 0 - the whole-street mark) reads as marked in one go instead of inheriting the previous street's gap as its 'took'; the stamp-less fallback is a GAP since the previous completion, and is labelled as one
    rowEl.appendChild(top);
    const lines = cleanNoteLines((h.notes || {})[n]);
    if (lines.length) { const p = document.createElement('div'); p.className = 'cvNt'; p.textContent = lines[0] + (lines.length > 1 ? ' (+' + (lines.length - 1) + ' more)' : ''); rowEl.appendChild(p); }
    const det = document.createElement('div'); det.className = 'cvDet'; det.style.display = 'none';
    const parts = [];
    parts.push('Marked: ' + (items[n] ? fmtWhen(items[n]) : 'no time recorded'));
    if (span > 0) parts.push('Span: ' + fmtDur(span) + ' - first side marked ' + fmtClock(new Date(Math.min.apply(null, stArr))) + ', last side ' + fmtClock(new Date(Math.max.apply(null, stArr))) + ' (includes any other work in between)'); else if (stArr.length) parts.push('Marked in one go - every recorded side of this street carries the same moment'); else if (!isNaN(dur)) parts.push('Gap since previous street: ' + fmtDur(dur) + ' (no side times recorded for this street; measured from the previous completion, or the run start)');
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
  const wantNow = () => !!runStart && document.visibilityState === 'visible' && settings.awake; // Beta 1.111: the wake lock is gated on the On-the-job toggle - the request/release machinery below is unchanged; where the API is absent the request is a silent no-op and nothing here throws. Beta 1.112 (Andrew): settings.awake is session-only state - always OFF at a cold open, never stored. Beta 1.113 (round 112, CG-112-04): eligibility is a FUNCTION, recomputed after the request await - capturing it once let a toggle-off (or a finish) landing mid-request leave the late-arriving lock held with the switch OFF
  try {
    if (wantNow() && !wakeLock && navigator.wakeLock) {
      const lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
      if (wantNow()) wakeLock = lock; // still wanted: hold it
      else { try { lock.release(); } catch (e) {} } // no longer wanted (toggle off / run finished / tab hidden during the request): release on arrival, wakeLock stays null
    }
    if (!wantNow() && wakeLock) { const w = wakeLock; wakeLock = null; w.release(); }
  } catch (e) { /* wake lock is best-effort */ }
}
document.addEventListener('visibilitychange', syncWake);
function noteSessionStart() { const s = Math.floor(runStart / 1000); if (trailSessions[trailSessions.length - 1] !== s) { trailSessions.push(s); if (saveSess().ok) return storeOk(); markDirty('sess'); return storeFail('sess', true); } return storeOk(); } // Beta 1.71 (audit B02): record the session boundary the moment the clean starts - a resumed run adds no new marker, because its Start already recorded one. Beta 1.73 (audit C04): the save result is RETURNED and a failure arms the flushAux retry - 1.71 dropped it, so a failed marker write was silent and a reload could join two cleans in the GPX export
let runSnap = null; // Beta 1.91: the board exactly as it was when Start was pressed - Cancel restores it, so a cancelled run erases ONLY what the run itself recorded (marks made before Start are not the run's to erase).
function saveSnap() { // Beta 1.94 (deep audit SR-193-02): the pre-Start board is ALSO persisted (LS.snap, stamped with the run's start time) the moment a clean starts. The in-memory runSnap dies with the page; after a reload mid-run, Cancel used to fall back to the mark-stamp journal (1.93 R01) - which cannot see an UNMARK, because unmarking erases the stamp, so a pre-Start side removed during the run stayed removed. The persisted snapshot is the board itself: a resumed Cancel restores it exactly, like a live one. A failed write arms snapDirty and the flushAux heartbeat retries (app1), on the same discipline as the start key and the session markers.
  if (!runSnap || !runStart) { markClean('snap'); return storeOk(); }
  const ok = lsSet(LS.snap, JSON.stringify({ at: runStart, pieces: runSnap.pieces, pieceTimes: runSnap.pieceTimes, done: runSnap.done, times: runSnap.times, via: runSnap.via, cov: runSnap.cov }));
  if (ok) markClean('snap'); else markDirty('snap'); return ok ? storeOk() : storeFail('snap', true);
}
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
function startClean() { runSnap = { pieces: JSON.parse(JSON.stringify(pieces)), pieceTimes: JSON.parse(JSON.stringify(pieceTimes)), done: [...doneSet], times: { ...doneTimes }, via: { ...doneVia }, cov: JSON.parse(JSON.stringify(coveredIdx)) }; runStart = Date.now(); runDist = { run: runStart, m: 0, capped: false }; runDistWrote = { at: 0, m: 0, capped: false }; persistRunDist(true); const okSnap = saveSnap(); const okSess = noteSessionStart(); const okStart = saveAllWarned(); startGps(true); updateCount(); syncWake(); if (okStart.ok && okSess.ok && okSnap.ok) toast('Clean started · ' + fmtClock(new Date())); else if (!okStart.ok) toast('Clean started — warning: the run state could not be saved (storage problem)', 4200); else if (!okSess.ok) toast('Clean started — warning: the session marker could not be saved; it will keep retrying', 4200); else toast('Clean started — warning: the cancel safety snapshot could not be saved; it will keep retrying', 4200); drawTrail(true); checkStale(); } // Beta 1.167 (B5): startClean banks a fresh distance counter for the new run (the runDist assignment + persistRunDist(true) beside runStart above), so even an instant reload resumes THIS run's counter. // Beta 1.73 (audit C04): the marker save is part of the start's honesty check, not a silent side write // Beta 1.63 (audit F04): the clean still starts - he is standing in the snow - but the message stops claiming a saved state that does not exist
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
    lsDel(LS.snap); markClean('snap'); resetRunDist(); lsDel(LS.rundist); // Beta 1.167 (B5): the cancelled run's distance record goes with it. The run is cancelled - its snapshot goes with it (a stale one could never match a future run's start stamp, but there is no reason to keep it)
    markDirty('trail'); markDirty('sess');
  }
  runSnap = null;
  runStart = 0; suggested = new Set(); sugQueue = []; $('suggest').classList.add('hidden');
  const okCancel = saveAllWarned().ok; flushAux(true);
  const trailPending = writePending('trail') || writePending('sess'); // Beta 1.93 (follow-up audit R07): the erasure claim below is gated on the trail/session writes having actually landed
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
  doneSet = new Set(); doneTimes = {}; doneVia = {}; coveredIdx = {}; suggested = new Set(); sugQueue = [];
  $('suggest').classList.add('hidden'); delete $('suggest').dataset.n; // Beta 1.71 (audit B01): the one path the 1.70 dismissal sweep missed - Clear wiped the coverage behind the panel but left the panel itself up, its Yes still able to select the street
  deselect(); const okClear = finishChange();
  if (okClear.ok) toast('All marks cleared'); else toast('Storage problem — the clear could not be saved; marks may return on reload', 4200); // Beta 1.63 (audit F04)
}
$('clearBtn').addEventListener('click', () => { if (!tapGuard('clearBtn')) return; clearAllMarks(); });
$('cancelStartBtn').addEventListener('click', () => { if (!tapGuard('cancelStartBtn')) return; cancelStart(); });
$('resetBtn').addEventListener('click', () => {
  // Beta 1.110 (Andrew): the Yes/No pop-up below is the ONLY finish gate - the post-Finish Undo is removed, so this button never means anything but Finish.
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
  for (const seg of trailSegments(trail)) for (let i = 1; i < seg.length; i++) { // Beta 1.99 (Phase 2, C1): the break rule (gap > 300 s, jump > 1000 m - audit B03: a break is not distance) lives in trailSegments now; the pairs inside a segment are exactly the pairs the old loop accepted, in the same order
    if (seg[i][2] < sinceSec || seg[i - 1][2] < sinceSec) continue; // Beta 1.70 (audit A05): a segment counts only when BOTH endpoints belong to the run
    d += distM(seg[i - 1], seg[i]);
  }
  return d / 1000;
}
// ===== RUN DISTANCE COUNTER (Beta 1.167, B5 - run/pace audit RP-02) =====
// The GPS trail is capped at TRAIL_MAX points (oldest dropped), so a long run's archived path
// silently loses its head - and through 1.166 the archived km was derived FROM that truncated
// path (trailKm), understating the run. This counter instead accumulates each accepted fix's
// segment AT RECORD TIME (acceptFix), under trailKm's own pair rule (both endpoints in the run,
// <=300 s apart, <=1000 m), so the total survives any later truncation; buildSnap reads it when
// it belongs to the finishing run. It persists (LS.rundist, throttled) so a mid-run reload
// resumes it; a lost or foreign record re-derives from the surviving trail (adoptRunDist) - the
// pre-1.167 figure, never worse. capped is set ONLY by direct observation (a live splice dropping
// this run's points, or a banked record that observed it), and Finish stamps it onto the entry
// (pathShortened) so the clean detail can say the saved path is shorter than the run.
let runDist = { run: 0, m: 0, capped: false };
let runDistWrote = { at: 0, m: 0, capped: false };
function persistRunDist(force) {
  const now = Date.now();
  if (!force && runDistWrote.at && now - runDistWrote.at < 30000 && Math.abs(runDist.m - runDistWrote.m) < 25 && runDistWrote.capped === runDist.capped) return;
  if (lsSet(LS.rundist, JSON.stringify(runDist))) runDistWrote = { at: now, m: runDist.m, capped: runDist.capped };
}
function adoptRunDist() {
  if (!runStart) { runDist = { run: 0, m: 0, capped: false }; return; }
  let raw = null; try { raw = JSON.parse(lsGet(LS.rundist) || 'null'); } catch (e) { raw = null; }
  if (raw && raw.run === runStart && typeof raw.m === 'number' && isFinite(raw.m) && raw.m >= 0) { runDist = { run: runStart, m: raw.m, capped: !!raw.capped }; return; }
  runDist = { run: runStart, m: trailKm(runStart) * 1000, capped: false };
}
function resetRunDist() { runDist = { run: 0, m: 0, capped: false }; runDistWrote = { at: 0, m: 0, capped: false }; }
function geoFingerprint() { // Beta 1.167 (B2): a cheap fingerprint of the route geometry AS CLEANED - street names + each street's total side-metres at 0.1 m precision, FNV-1a hashed. Recorded on every new archive entry (snap.geoFP) so a later geometry edit is DETECTABLE against the entry priced under the old geometry; the pace math reads the stored workM, so the fingerprint is evidence, not an input.
  let fp = 2166136261 >>> 0; const str = STREETNAMES.map(n => n + ':' + (STRETCH[n] ? STRETCH[n].total.toFixed(1) : '0')).join('|');
  for (let i = 0; i < str.length; i++) { fp ^= str.charCodeAt(i); fp = Math.imul(fp, 16777619) >>> 0; }
  return ('0000000' + fp.toString(16)).slice(-8);
}
function buildSnap() { // production archive shape: items is a street->time map; km is trail distance; the GPS path is thinned FROM the trail
  if (!doneSet.size && !Object.keys(notes).length) return null;
  const ts = [...doneSet].map(n => Date.parse(doneTimes[n])).filter(t => !isNaN(t)).sort((a, b) => a - b);
  const startMs = (runStart && ts.length && runStart <= ts[0]) ? runStart : (ts.length ? ts[0] : (runStart || null)); // Beta 1.170 (Carbon fix round Phase 2, B-12): a live run whose streets carry NO recorded stamps (every doneTime null - a finish after a state restore, say) still STARTED: fall back to the run start itself. Through 1.169 this read null, and the archived clean lost its startedAt - and with it the work metre and path bake below, both keyed off startMs // Beta 1.70 (audit A05): distance and path are measured from the clean's actual start, not its first completed street - driving before the first street was silently dropped
  if (runStart && runDist.run !== runStart) adoptRunDist(); // Beta 1.167 (B5): the counter is the archive's distance source - adopt (or re-derive) before reading it
  const snap = { at: new Date().toISOString(), items: {}, via: { ...doneVia }, notes: JSON.parse(JSON.stringify(notes)), sides: JSON.parse(JSON.stringify({ p: pieces, t: pieceTimes })), km: startMs ? +(((runStart && runDist.run === runStart) ? runDist.m / 1000 : trailKm(startMs))).toFixed(1) : 0, startedAt: startMs ? new Date(startMs).toISOString() : null };
  doneSet.forEach(n => { snap.items[n] = doneTimes[n] || null; });
  // Beta 1.167 (run/pace fix round, B2 - RP-05/06/09): the run's own figures are BAKED INTO the entry, and cleanWorkM prefers them for the life of the entry. workM sums this snapshot's side stamps INSIDE the run's own window [the Start press, the Finish tap] - liveWorkM's stamp attribution (Beta 1.93) applied to the archived record. The window opens at runStart, NOT at startMs: when a street was marked before Start, startMs falls back to that first completion (A05), and opening the window there would count the pre-Start work right back in - so work banked before Start never counts toward this clean (RP-05), a later geometry edit cannot re-price it (RP-06; geoFP records the geometry it was priced against), and a partially-recorded sides map cannot short-circuit the derivation into an undercount (RP-09). winStart is runStart when a run is live, else startMs (a no-run finish has no earlier boundary to honour). Legacy entries carry none of these fields and derive exactly as before. (km above likewise reads the B5 counter's true total when it belongs to this run - trailKm only as the fallback for a run the counter never saw.)
  if (startMs) { let wm = 0; const endMs = Date.parse(snap.at); const winStart = runStart || startMs; for (const n of Object.keys(snap.sides.p)) { const pv = snap.sides.p[n] || [], T = snap.sides.t[n] || []; const parts = STRETCH[n] ? STRETCH[n].parts : []; parts.forEach((part, i) => { const L = segLenM(part); const st = T[i] || [null, null]; if ((pv[i] & 1) && st[0]) { const ts = Date.parse(st[0]); if (ts >= winStart && ts <= endMs) wm += L; } if ((pv[i] & 2) && st[1]) { const ts = Date.parse(st[1]); if (ts >= winStart && ts <= endMs) wm += L; } }); } snap.workM = Math.round(wm); }
  snap.totalWorkM = Math.round(totalWorkM());
  snap.geoFP = geoFingerprint();
  if (runStart && runDist.run === runStart && runDist.capped) snap.pathShortened = true; // Beta 1.167 (B5, RP-02): the stored path below was truncated by the trail cap - the entry says so (km above is the counter's true total, not the path's)
  const sMs = Date.parse(snap.startedAt);
  if (!isNaN(sMs)) { const pp = thinPath(trail.filter(p => p[2] >= Math.floor(sMs / 1000))); if (pp.length > 1) snap.path = pp; } // Beta 1.70 (audit A05): the old 60 s look-back admitted points from the previous session. Beta 1.71 (audit B04): second-precision comparison, matching the stored timestamps
  return snap;
}
function finishRun() {
  northUp();
  const snap = buildSnap();
  const finishAt = Date.now(); if (snap) snap.runId = runStart || finishAt; // Beta 1.104 (round 103, CG-103-02): the archive carries the active run's identity, so an interrupted finish can be reconciled at boot even when startedAt predates Start; startedAt itself is NOT touched (km/path measure from the real work start, audit A05). Beta 1.146 (census C1): a NO-RUN finish (snap exists, no Start was ever pressed) stamps the SAME finishAt the finclean step below writes as its at - the marker's at is this finish's identity, so reconcileInterruptedFinish's no-run branch can match entry to marker exactly; the marker's shape ({run, at}) is unchanged, values only
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
  if (archiving) newHist = appendHistory(history, snap); // Beta 1.167 (B1): the incoming archive JOINS the history - nothing is evicted, at any size (through 1.166 trimHistoryForFinish applied the 10-clean cap here, Beta 1.104 CG-103-01 protecting only the incoming entry itself)
  const clearedPieces = {}, clearedTimes = {};
  for (const n of STREETNAMES) { clearedPieces[n] = STRETCH[n].parts.map(() => 0); clearedTimes[n] = {}; }
  const prevSidesRaw = lsGet(LS.sides); // kept so the start step's rollback can restore this write exactly (including its absence)
  // Beta 1.102 (Phase 4, C3): the finish transaction on the ONE coordinator - the
  // 1.57-1.93 gate discipline mechanized: archive, cleared authority, start-key
  // delete; verified writes; verified rollback in reverse. A kill between gates
  // leaves a signature reconcileInterruptedFinish resolves at boot (CG-196-04).
  const fSteps = [];
  fSteps.push({ name: 'finclean', write: () => txSet(LS.finclean, JSON.stringify({ run: runStart || 0, at: finishAt })), undo: () => txDel(LS.finclean) }); // Beta 1.141 (Package A, DA-10): the metadata-cleanup obligation is the transaction's FIRST step, so every prefix reconciliation can call a committed finish carries it, and a rolled-back finish undoes it with the rest. The post-commit saveAll below normally discharges it at once; if those writes fail and the page dies first, completeFinishCleanup (app1) completes the cleanup at the next load instead of leaving the finished run's notes/coverage live forever.
  if (archiving) fSteps.push({ name: 'archive', write: () => txSet(LS.hist, JSON.stringify(newHist)), undo: () => txSet(LS.hist, JSON.stringify(prevHist)) });
  fSteps.push({ name: 'sides', write: () => txSet(LS.sides, JSON.stringify({ p: clearedPieces, t: clearedTimes })), undo: () => prevSidesRaw === null ? txDel(LS.sides) : txSet(LS.sides, prevSidesRaw) });
  if (runStart) fSteps.push({ name: 'start', write: () => txDel(LS.start), undo: () => txSet(LS.start, String(runStart)) });
  const fTx = runTx(fSteps);
  if (fTx.outcome !== 'committed') {
    if (fTx.outcome === 'degraded') { toast(fTx.failedStep === 'sides' && archiving ? 'Storage failure \u2014 finish stopped, but the archive could not be undone. Export a backup now' : 'Storage failure \u2014 finish stopped, but the rollback could not be verified. Export a backup now', 6000); return; } // Beta 1.141 verify cycle 1: degraded is judged FIRST - an archive failure whose rollback could not be verified is not "run intact", whatever step failed
    if (fTx.failedStep === 'archive') { toast('Storage full \u2014 finish stopped, run intact', 3600); return; }
    toast('Storage problem \u2014 finish stopped, your clean is intact', 4200); return;
  }
  lsDel(LS.snap); markClean('snap'); resetRunDist(); lsDel(LS.rundist); // Beta 1.167 (B5): the distance counter is consumed into the archive entry (km/pathShortened) - its record goes with the run. Beta 1.94 (SR-193-02): the run is finished - its cancel snapshot goes with it. Ungated on purpose: a leftover snapshot is stamped with THIS run's start, so it can never match a future run, and the next Start overwrites it anyway
  if (archiving) history = newHist;
  doneSet = new Set(); doneTimes = {}; doneVia = {}; notes = {}; runStart = 0; runSnap = null; coveredIdx = {}; suggested = new Set(); sugQueue = []; $('suggest').classList.add('hidden'); // Beta 1.70 (audit A04): the suggestion set is run-scoped too - finishRun used to clear the coverage but keep the set, so suggested streets never suggested again
  for (const n of STREETNAMES) { pieces[n] = STRETCH[n].parts.map(() => 0); pieceTimes[n] = {}; }
  stopGps(); deselect(); drawTrail(true); // Beta 1.69 (audit visual check): the run is over and runStart is 0, so this clears the finished line now instead of leaving it until the next throttled refresh
  const restRes = saveAll(); const restOk = restRes.ok; // the gated sides write already landed; this pass carries the metadata - a failure here warns but cannot resurrect anything (authority + archive agree)
  finishChange();
  toast((archiving ? 'Clean archived · ' + Object.keys(snap.items).length + ' streets' : 'Board cleared — under 3 streets, nothing saved') + (restOk ? '' : ' — some details could not be written (' + restRes.failedKey + '); they retry on the next save'), 3400);
  if (archiving) maybeBackupNudge();
  onFinishFeedback(); // Beta 1.111: only on the COMMITTED path (every failure return above leaves the run intact and silent) - the Done chime plays twice here (once for Chime Melody) plus the finish vibration pattern, per the On-the-job settings; fully guarded in app4
}
function performReset() { finishRun(); } // production's name for the finish action (the test battery calls it directly)
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
$('bakLater').addEventListener('click', () => { const st = parseJ(lsGet(LS.exp), {}); st.nudgedAt = Date.now(); lsSet(LS.exp, JSON.stringify(st)); $('bakNudge').classList.add('hidden'); }); // Beta 1.113 (round 112, CG-112-05): MERGE nudgedAt into the export record (the noteExported pattern) - the record also carries 1.111's exportedAt, and replacing it here erased the Settings 'Last backup' stamp on every dismissal
$('bakSave').addEventListener('click', () => { const st = parseJ(lsGet(LS.exp), {}); st.nudgedAt = Date.now(); lsSet(LS.exp, JSON.stringify(st)); $('bakNudge').classList.add('hidden'); openExport(); downloadBackup(); }); // Beta 1.113 (round 112, CG-112-05): same merge as bakLater

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
  return saveAllWarned(); // Beta 1.63 (audit F04): callers announce from the result - since Beta 1.101 (Phase 3) the storage-outcome object
}
function flagText(n) { return (Array.isArray(notes[n]) ? notes[n] : []).map(f => f.k === 'note' ? ('📝 ' + (f.text || '')) : (FLAGS[f.k] || f.k) + (f.at ? ' ' + fmtClock(new Date(f.at)) : '')).join('; '); }
let noteFor = null;
function openNote(name) { noteFor = name; $('noteTitle').textContent = 'Note — ' + name; $('noteText').value = noteTextOf(name); $('noteModal').classList.remove('hidden'); }
$('noteNo').addEventListener('click', () => $('noteModal').classList.add('hidden'));
$('noteYes').addEventListener('click', () => {
  if (!noteFor) return;
  const okNote = setNoteText(noteFor, $('noteText').value);
  $('noteModal').classList.add('hidden'); renderStreets(); if (okNote.ok) toast('Note saved'); else toast('Storage problem — the note could not be saved', 4200); // Beta 1.63 (audit F04)
});

// ===== GPS (checklist SS7) =====
// Beta 1.64 (audit R01): lastFixTs is the last accepted fix's OWN timestamp - a callback carrying an older one is stale
let watchId = null, watchGen = 0, gpsFromRun = false, gpsPos = null, dispPos = null, lastFixAt = 0, lastFixTs = 0, lastGood = null, spdTimer = 0, offRouteArmed = true, followPaused = false, staleWatchTimer = 0;
const SAMPLES = {};
function samplesFor(stretch, names) { // Beta 1.117: the coverage samples as a PURE function of a stretch set - the pre-1.117 eval-time IIFE, parameterized. buildSamples refills the live SAMPLES from it on every load (via buildGeometry); app4's packGeometry builds a non-active pack's samples from it for snapshot validation (F6).
  const out = {};
  for (const n of names) { const pts = []; for (const run of stretch[n].runs) { const L = run.line, cum = run.cum; let i = 1; for (let d = 0; d <= run.total; d += COV_SAMPLE_M) { while (i < cum.length - 1 && cum[i] < d) i++; const span = cum[i] - cum[i - 1] || 1, t = (d - cum[i - 1]) / span; pts.push([L[i - 1][0] + (L[i][0] - L[i - 1][0]) * t, L[i - 1][1] + (L[i][1] - L[i - 1][1]) * t]); } } out[n] = pts; } // Beta 1.144 (Package C, DA-02/C1): samples are taken PER RUN - a disconnected street's later runs are covered streets too, and coverage must be able to suggest them. The 1.135 hoisted cursor resets per run (each run's distances rise monotonically on their own); a single-run street produces the identical sample list. // Beta 1.135 (programme D): the segment cursor i is hoisted out of the sample loop - sample distances rise monotonically, so a sample's segment never lies before the previous sample's, and the pre-1.135 per-sample restart re-walked the line from its start every 15 m (18,449 cursor-condition checks on Route 5W; the hoisted cursor advances at most once per segment). The samples produced are identical (the 1.135 fixture harness compares them byte-for-byte).
  return out;
}
function buildSamples() { const built = samplesFor(STRETCH, STREETNAMES); for (const k of Object.keys(SAMPLES)) delete SAMPLES[k]; Object.assign(SAMPLES, built); covSamplesGen++; } // Beta 1.135 (programme D): the generation bump invalidates coverFix's per-street sample boxes (below) - the samples they were measured from just changed
// (the coverage-index sanitizer lives in loadRouteState, app1 - Beta 1.76: it must run over the loaded state, and state now loads on route pick, not at eval)
let suggested = new Set();
function resetNotesHistorySession() { // Beta 1.148 (Tranche 5, A4(ii)): app3's OWN route-switch reset, called by app4's resetSwitchSession - the run-snapshot / history / modal-note / suggestion session's reset knowledge lives here, with its state
  resetRunDist(); // Beta 1.167 (B5): the in-memory distance counter belongs to the outgoing run; its persisted record stays in the outgoing slot (like LS.snap below) and is re-adopted lazily if he switches back mid-run
  runSnap = null; // F3: the in-memory cancel snapshot belongs to the outgoing run. The PERSISTED copy (LS.snap, in the outgoing slot) is deliberately untouched - after switching back, Cancel validates it exactly as it does after a reload
  histOpen = false; cleanIdx = null; cleanDelArmed = false; if (cleanDelTimer) { clearTimeout(cleanDelTimer); cleanDelTimer = 0; } // the history panel and its delete-arming
  noteFor = null; $('noteModal').classList.add('hidden'); // the modal note editor
  suggested = new Set(); sugQueue = []; $('suggest').classList.add('hidden'); $('stale').classList.add('hidden'); // run-scoped suggestion set + the two banners (checkStale re-judges the stale banner for the incoming route below)
}
function pushGps() {
  const src = map && map.getSource('gps'); if (!src) return;
  const feats = [];
  if (dispPos && watchId != null && facingDeg != null) { // the facing beam (Beta 1.49): a point carrying the facing - the gps-beam symbol layer paints the gradient fan image along it (Apple Maps style, Andrew's reference)
    feats.push({ type: 'Feature', properties: { k: 'beam', rot: Math.round(facingDeg * 10) / 10 }, geometry: { type: 'Point', coordinates: [dispPos[1], dispPos[0]] } });
  }
  if (dispPos) {
    { // Beta 1.182 (Andrew): the position marker is a PUCK, not the flat 1.49 dot - two ground-plane discs that the puck layers in addGpsLayers (app2) extrude as ONE stepped object: a white disc (r 16 m) standing 3.5 m with the blue disc (r 11.5 m) standing 5 m on the same base. From above it reads as the familiar blue dot inside its white rim (the Apple Maps marker, Andrew's reference); tilted, the rim rises WITH the blue - never a 3D blue standing on a flat white ring (the samples' split, rejected). Rendering only: the estimator, dispPos and the watch logic are untouched.
      const disc = r => { const pts = []; for (let a = 0; a <= 40; a++) { const th = a / 40 * Math.PI * 2; pts.push([dispPos[1] + (r * Math.sin(th)) / MLNG, dispPos[0] + (r * Math.cos(th)) / MLAT]); } return [pts]; };
      feats.push({ type: 'Feature', properties: { k: 'puckwhite' }, geometry: { type: 'Polygon', coordinates: disc(16) } });
      feats.push({ type: 'Feature', properties: { k: 'puckblue' }, geometry: { type: 'Polygon', coordinates: disc(11.5) } });
    }
    if (gpsAccM > 0) { const ring = []; const R = gpsAccM; for (let a = 0; a <= 28; a++) { const th = a / 28 * Math.PI * 2; ring.push([dispPos[1] + (R * Math.sin(th)) / MLNG, dispPos[0] + (R * Math.cos(th)) / MLAT]); } feats.push({ type: 'Feature', properties: { k: 'ring' }, geometry: { type: 'Polygon', coordinates: [ring] } }); }
  }
  src.setData({ type: 'FeatureCollection', features: feats });
}
let gpsAccM = 0;
let lastTrailDraw = 0, lastTrailPts = 0; // Beta 1.64: drawTrail throttle state (audit 3)
function drawTrail(force) {
  const src = map && map.getSource('trail'); if (!src) return;
  const t0s = runStart ? Math.floor(runStart / 1000) : 0; // Beta 1.64 (audit F05): only THIS clean's points draw as the active trail - the stored trail keeps every clean for the log and GPX; the display is run-scoped
  if (!force && performance.now() - lastTrailDraw < 3000) { // Beta 1.135 (programme D): the throttle is decided BEFORE the trail filter now. Its count arm needs only the run-scoped COUNT - a bare counting pass, never a filtered copy of up to 8,000 points built on every GPS fix just to be discarded (the pre-1.135 order); the decision itself is unchanged (skip iff under 3 s AND fewer than 5 undrawn points), and forced draws (run start, trail clear) still ignore the throttle whole (Beta 1.64, audit 3)
    let cnt = 0; if (runStart) for (const p of trail) if (p[2] >= t0s) cnt++;
    if (cnt - lastTrailPts < 5) return;
  }
  const pts = runStart ? trail.filter(p => p[2] >= t0s) : [];
  lastTrailDraw = performance.now(); lastTrailPts = pts.length;
  const feats = [];
  for (const seg of trailSegments(pts)) { if (seg.length > 1) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: seg.map(p => [p[1], p[0]]) } }); } // Beta 1.99 (Phase 2, C1): segmentation by the shared rule in trailSegments (was a private copy of the gap/jump test)
  src.setData({ type: 'FeatureCollection', features: feats });
}
let renderRaf = 0, renderPump = 0, lastFrameAt = 0, lastCamAt = 0, lastPushKey = ''; // Beta 1.65 (Andrew's road report: the GPS motion stuttered; third audit item 1): ONE frame-synced render loop drives the dot and the camera - the 40 ms glide timer and the 50 ms camera timer used to overlap at ~45 unsynced updates a second, and the camera's per-tick easing sped up whenever they overlapped
let dispOff = [0, 0], lastDispAt = 0; // Beta 1.115 (Andrew's drive report: the dot stepped once a second): the display no longer glides toward a fixed aim and stops - it COASTS on the estimator's predicted track (kfPredict, by the filter below) every frame, and a fix's correction is absorbed into dispOff (metres, [lat, lng]) and decayed away over ~0.3 s, so a fix never teleports the dot either. Smoothing is DISPLAY-ONLY: trail, coverage and pace keep consuming the raw accepted estimate (gpsPos) exactly as before.
function dispSettled() { return Math.abs(dispOff[0]) < 0.05 && Math.abs(dispOff[1]) < 0.05; }
function renderTick(now) {
  const pred = kfPredict(); // Beta 1.115: the predicted track at THIS frame - between fixes it advances on the estimated velocity, so the dot flows instead of bursting once a second
  if (pred) {
    const pNow = performance.now();
    const dtF = lastDispAt ? Math.min(0.25, Math.max(0, (pNow - lastDispAt) / 1000)) : 0; lastDispAt = pNow;
    if (dtF > 0 && !dispSettled()) { const k = Math.pow(0.2, dtF / 0.3); dispOff = [dispOff[0] * k, dispOff[1] * k]; if (dispSettled()) dispOff = [0, 0]; } // the correction offset decays with a ~0.3 s time constant, on the same performance clock the prediction reads
    dispPos = [pred[0] + dispOff[0] / MLAT, pred[1] + dispOff[1] / MLNG];
  }
  const key = dispPos ? dispPos[0] + ',' + dispPos[1] + ',' + facingDeg + ',' + gpsAccM : '';
  if (key !== lastPushKey) { lastPushKey = key; pushGps(); } // redraw the dot/ring/beam only when something actually moved - the old timers rebuilt it on every tick regardless
  followCam(now); headCam(now); syncCentreBtn();
}
function renderLoop(now) {
  lastFrameAt = now;
  renderTick(now);
  if (watchId == null && dispSettled()) { renderRaf = 0; return; } // nothing left to animate: the loop parks itself until the next fix or GPS start
  renderRaf = requestAnimationFrame(renderLoop);
}
function startRenderLoop() { if (!renderRaf) { lastCamAt = lastFrameAt = performance.now(); renderRaf = requestAnimationFrame(renderLoop); } if (!renderPump) renderPump = setInterval(() => { if ((watchId != null || !dispSettled()) && performance.now() - lastFrameAt > 100) renderTick(performance.now()); if (watchId == null && dispSettled() && !renderRaf) { clearInterval(renderPump); renderPump = 0; } }, 100); } // the pump is a starvation fallback only: a browser that is not painting (headless, occluded) delivers no animation frames, and the GPS state must still advance - on a painting phone it never fires; it parks itself when nothing is left to render
function followCam(now) {
  if (!map || !dispPos || followPaused || watchId == null) { lastCamAt = now; return; } // Beta 1.146 (census C4): the no-map guard in the SAME idiom as northUp/pushGps/drawTrail - in the map-failure world (MapLibre script dead, map === null) renderTick reaches this on every fix and the unguarded map.getCanvas() below threw before the fix could record. follow whenever location is ON (Beta 1.27, Andrew) - it used to engage only during a run, so the dot wandered off-screen on a plain drive. Trail recording stays run-only; heading-up applies whenever location is on and the camera follows (Beta 1.122, Andrew).
  const c = map.getCanvas(); const p = projLL(dispPos);
  const dx = p.x - c.clientWidth / 2, dy = p.y - c.clientHeight / 2;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) { lastCamAt = now; return; } // Beta 1.115: the deadband was 2 px - at driving zoom the dot had to drift ~7 m off-centre before the camera moved at all, so the camera lurched in pulses behind a smoothly coasting dot; half a pixel keeps it glued without jitter (the settle band drive126 judges is 12% of the screen, two orders wider)
  const dt = Math.min(100, Math.max(1, now - lastCamAt)); lastCamAt = now;
  const f = 1 - Math.pow(0.65, dt / 50); // Beta 1.65: the 1.28 ease (close 35% of the remaining offset per 50 ms) made time-based, so the convergence is identical at any frame rate - a gradual lock that keeps the dot kind of in the centre, never a snap and never a chase view
  map.panBy([dx * f, dy * f], { animate: false });
}
function syncCentreBtn() { const b = $('centreBtn'); if (b) b.classList.toggle('hidden', !(watchId != null && followPaused && !!dispPos)); } // Beta 1.115 (Andrew): the re-centre button exists ONLY in the suspended state - location on, a position known, and the follow yielded to the user. Called on every render tick so the button's state can never drift from the follow's.
function resumeFollow() { if (watchId == null || !followPaused) return; followPaused = false; syncCentreBtn(); startRenderLoop(); } // followCam's own ease carries the camera back to the dot - no snap, no jump
onMapReady(() => map.on('dragstart', () => { followPaused = true; syncCentreBtn(); }));
// Beta 1.115 (Andrew's drive report: "it locks and I'm not able to move around while I'm moving"):
// the dragstart above almost never fires while following - followCam's panBy on every frame keeps
// resetting MapLibre's drag-pan handler mid-gesture, so the drag never registers (measured in the
// rig: GPS on + following = dragstart x0 across a full drag; GPS off = it fires at once). Suspension
// therefore ALSO listens to the raw pointer stream, which no camera move can eat: a press on the
// canvas that moves >10 px yields the camera to the user, pan AND bearing both (the old dragend
// northUp haul is gone - while suspended the map stays exactly where he put it), until he re-centres.
// Beta 1.122 (Andrew, from the road): the PRESS itself suspends now - see the pointerdown below - so the map is movable from the first pixel and a plain tap takes the camera too; the >10 px move rule remains as a backstop for a press that began before the follow did (e.g. GPS started mid-press).
onMapReady(() => { const c = map.getCanvas(); let press = null; // {x, y, id} - the ONE pointer that pressed the canvas
  // Beta 1.116 (audit CG-115-03) - multi-touch policy, stated explicitly: only the pointer
  // that pressed the canvas can suspend the follow, and only ITS moves count. A second
  // pointerdown while a press is armed is IGNORED - it never re-arms the press, and its
  // moves never suspend (a finger resting or moving on an overlaid panel, or the second
  // half of a pinch, cannot take the camera). If the ARMING finger itself travels >10 px -
  // including as one half of a pinch - the follow suspends: that finger is on the map and
  // moving it, which is exactly the claim this seam exists for. Only the arming pointer's
  // own up/cancel releases the press.
  c.addEventListener('pointerdown', e => { if (!press) { press = { x: e.clientX, y: e.clientY, id: e.pointerId }; if (watchId != null && !followPaused) { followPaused = true; syncCentreBtn(); } } }); // Beta 1.122 (Andrew): the press ITSELF takes the camera - no 10 px toll before the map answers his finger; the re-centre button lights in the same instant as the way back
  window.addEventListener('pointermove', e => { if (press && e.pointerId === press.id && !followPaused && (Math.abs(e.clientX - press.x) > 10 || Math.abs(e.clientY - press.y) > 10)) { followPaused = true; syncCentreBtn(); } });
  window.addEventListener('pointerup', e => { if (press && e.pointerId === press.id) press = null; });
  window.addEventListener('pointercancel', e => { if (press && e.pointerId === press.id) press = null; });
  c.addEventListener('wheel', () => { if (!followPaused) { followPaused = true; syncCentreBtn(); } }, { passive: true }); });
// HEADING-UP (Andrew, Beta 1.14 - replaces Flip; Beta 1.122, Andrew: whenever location is on and the camera follows, run or not): the map rotates
// so his direction of travel points up - course-up from the GPS course, not the compass and not true
// north: 'my north' is wherever he is heading. Smoothed around the circle so low-speed wobble can't spin
// the map; under ~1 m/s the course is unreliable, so the map just holds its last bearing.
let smHeading = null;
function headDelta(a, b) { return ((b - a + 540) % 360) - 180; }
function updateHeading(hdg, speed) {
  if (typeof hdg !== 'number' || isNaN(hdg) || !speed || speed < 1) return;
  if (followPaused) return; // Beta 1.122 (Andrew): the smoothed course is maintained whenever location is on, not only during a run - headCam applies it whenever the camera follows
  smHeading = smHeading === null ? hdg : smHeading + headDelta(smHeading, hdg) * 0.35; // Beta 1.115: this only maintains the smoothed course now - headCam, in the render loop, applies it to the map
}
// Beta 1.115: heading-up is applied per render tick, fractionally, in the same pipeline
// as followCam's pan. It used to be a map.easeTo fired from updateHeading - but a camera
// ease is cancelled by the next panBy, and while following, followCam pans on nearly every
// frame, so the rotation starved whenever the dot was off-centre (measured in the rig:
// smHeading chased 90 -> 170 while the bearing sat at 90). Tick application rides with the
// pan instead of fighting it, and is frame-smooth like the rest of the follow.
let lastHeadAt = 0;
function headCam(now) {
  if (!map || watchId == null || followPaused || smHeading === null) { lastHeadAt = now; return; } // Beta 1.146 (census C4): no-map guard, same idiom as followCam above - headCam is the other renderTick caller that dereferenced the map unguarded
  const cur = map.getBearing();
  const d = headDelta(cur, smHeading);
  if (Math.abs(d) < 0.3) { lastHeadAt = now; return; }
  const dt = Math.min(100, Math.max(1, now - (lastHeadAt || now))); lastHeadAt = now;
  const f = 1 - Math.pow(0.65, dt / 50); // followCam's ease, time-based: identical convergence at any frame rate
  map.jumpTo({ bearing: cur + d * f });
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
  if (!kf) { kf = { ox: zx, oy: zy, at: now, atF: performance.now(), x: { p: 0, v: 0, a: R, b: 0, c: 4 }, y: { p: 0, v: 0, a: R, b: 0, c: 4 } }; return { est: ll.slice(), snap: true }; }
  const dt = Math.min(Math.max((now - kf.at) / 1000, 0.05), 5); kf.at = now;
  kfAxis(zx - kf.ox, kf.x, dt, R); kfAxis(zy - kf.oy, kf.y, dt, R);
  kf.atF = performance.now();
  const est = [(kf.oy + kf.y.p) / MLAT, (kf.ox + kf.x.p) / MLNG];
  return { est, snap: false };
}
// Beta 1.115: where the estimator's motion model says we are at THIS instant - the estimate
// extrapolated along its own velocity from the last fix. This (not the raw estimate) is what
// the display draws, so between fixes the dot coasts instead of freezing at the last one.
// The horizon is capped at 2.5 s: if fixes stop arriving the dot stops too, a little past
// the last one, instead of sailing away on a stale velocity. A reacquisition (the filter
// voiding itself above: >10 s silence or a >75 m jump) reports snap instead, and the
// display takes the new position immediately.
function kfPredict() { if (!kf) return null; const h = Math.min(Math.max((performance.now() - kf.atF) / 1000, 0), 2.5); return [(kf.oy + kf.y.p + kf.y.v * h) / MLAT, (kf.ox + kf.x.p + kf.x.v * h) / MLNG]; }
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
  if (acc > GPS_ACCURACY_M && lastGood && now - lastGood.at < 10000) return;
  if (acc <= GPS_ACCURACY_M) lastGood = { ll, at: now };
  const speed = pos.coords.speed;
  lastFixAt = now; if (typeof pos.timestamp === 'number') lastFixTs = pos.timestamp; gpsAccM = acc; gpsDenied = false; // Beta 1.111: a live fix clears any earlier denial for the Status row
  renderTick(performance.now()); // Beta 1.66's settle, kept: advance the display to NOW on the OLD track before re-anchoring - a display re-anchored from a stale position makes the dot chase leftover distance, which is exactly the wander drive127 S1/S2 measure
  const { est: sm, snap } = kfUpdate(ll, acc, now); // the filter subsumes the old deadband: sub-noise moves barely shift the estimate, so no fix needs swallowing
  const firstFix = !gpsPos;
  gpsPos = sm;
  const pred = kfPredict(); // Beta 1.115: re-anchor the display on the NEW track without a jump - the gap between where the dot is drawn and where the new track puts it becomes the decaying offset; a reacquisition (snap) takes the new position outright
  if (snap || !dispPos || !pred) { dispOff = [0, 0]; if (pred) dispPos = pred; }
  else dispOff = [(dispPos[0] - pred[0]) * MLAT, (dispPos[1] - pred[1]) * MLNG];
  startRenderLoop(); // the old glide started the loop here; the coasting display needs it just as much (a fix can arrive on an existing watch and must still render)
  updateHeading(pos.coords.heading, speed);
  if (typeof pos.coords.heading === 'number' && speed && speed >= 1) { lastCourseAt = now; setFacing(pos.coords.heading, 0.5); } // moving: face along the course
  const spd = $('spd');
  if (speed && speed > 0.5) { spd.textContent = Math.round(speed * 3.6) + ' km/h'; spd.classList.remove('hidden'); } else spd.classList.add('hidden');
  if (firstFix && map && (gpsFromRun || watchId != null) && !followPaused) { map.jumpTo({ center: [sm[1], sm[0]], zoom: Math.max(map.getZoom(), 15) }); } // Beta 1.146 (census C4): the map && guard - this first-fix jump sat BEFORE the trail/coverage block below, so in the map-failure world its throw starved recording on fix 1 exactly as followCam's did from fix 2 on // Beta 1.116 (audit CG-115-02): a drag made while waiting for this fix already claimed the camera - the fix still records the position (gpsPos/dispPos above), and with dispPos set the syncCentreBtn rule lights the re-centre button as the way back; no jump, no clear
  // outside-route note (route box + 400 m)
  const inB = routeBox ? (sm[0] > routeBox.s - 0.0036 && sm[0] < routeBox.n + 0.0036 && sm[1] > routeBox.w - 0.005 && sm[1] < routeBox.e + 0.005) : true; // Beta 1.117: no box (no route / empty pack) - no area to be outside of, so no note
  if (!inB && offRouteArmed) { offRouteArmed = false; toast("You are outside the route area — GPS won't mark streets here", 3600); }
  if (inB) offRouteArmed = true;
  if (runStart && gpsFromRun) { // Beta 1.49 (Andrew's rule): route data is recorded ONLY by a clean's own GPS - the Locate tab's view-only watch never writes trail or coverage, even if a stale flag disagrees
    if (runDist.run !== runStart) adoptRunDist(); // Beta 1.167 (B5): first recorded fix of a run the counter has not met (a mid-run reload, a pre-1.167 start) - adopt the banked record or re-derive from the surviving trail
    const runSec = Math.floor(runStart / 1000);
    const prevPt = trail.length ? trail[trail.length - 1] : null;
    const newPt = [+sm[0].toFixed(6), +sm[1].toFixed(6), Math.floor(now / 1000)];
    if (prevPt && prevPt[2] >= runSec && newPt[2] - prevPt[2] <= 300) { const seg = distM(prevPt, newPt); if (seg <= 1000) runDist.m += seg; } // trailKm's own pair rule, applied at record time so the total survives the cap below
    trail.push(newPt);
    if (trail.length > TRAIL_MAX) { const dropped = trail.splice(0, trail.length - TRAIL_MAX); if (dropped.some(pt => pt[2] >= runSec)) runDist.capped = true; }
    persistRunDist(false);
    markDirty('trail'); flushAux(false); drawTrail();
    coverFix(sm);
  }
}
// ---- coverage caches (Beta 1.135, maintainability programme D): coverFix runs on every
// accepted fix of a clean. Through 1.134 it rebuilt a Set from coveredIdx[n] for EVERY
// street on EVERY fix and distance-tested every still-uncovered sample of every street,
// though a fix can only ever cover samples within 22 m of itself. Two caches fix that:
// the per-street Sets now PERSIST across fixes, mirroring coveredIdx's arrays exactly
// (same insertion order, and written back in 1.134's own per-fix form, so the stored
// JSON - including its duplicate-index normalization - is byte-identical), and each
// street's samples are boxed once - bounds padded by the 22 m coverage radius - so a
// street the fix cannot reach skips its DISTANCE TESTS only, never its suggestion
// check: a street can sit at 85% from coverage loaded at boot with the suggestion set
// reset, and 1.134 re-offers it on the first fix wherever that fix lands (the 1.135
// Codex verify caught a box skip that swallowed this - the harness now covers it).
// The caches key on identity, never on content comparison: coveredIdx is only ever
// rebound wholesale (route load, cancel-restore, finish, clear - it is never edited in
// place outside this function), so a new object rebuilds the Sets; the boxes key on the
// buildSamples generation, bumped on every route load. Judged by drives 126/127 and the
// 1.135 fixture harness (identical coveredIdx JSON + suggestion sequence).
let covSetsFor = null, covSets = {}, covBoxesFor = -1, covBoxes = {}, covSamplesGen = 0;
function coverFix(ll) {
  if (covSetsFor !== coveredIdx) { covSets = {}; for (const n of Object.keys(coveredIdx)) covSets[n] = new Set(coveredIdx[n]); covSetsFor = coveredIdx; }
  if (covBoxesFor !== covSamplesGen) { covBoxes = {}; const pLat = COV_RADIUS_M / MLAT, pLng = COV_RADIUS_M / MLNG; for (const n of STREETNAMES) { const pts = SAMPLES[n]; if (!pts || !pts.length) continue; let a = 1e9, b = -1e9, c = 1e9, e = -1e9; for (const p of pts) { if (p[0] < a) a = p[0]; if (p[0] > b) b = p[0]; if (p[1] < c) c = p[1]; if (p[1] > e) e = p[1]; } covBoxes[n] = [a - pLat, b + pLat, c - pLng, e + pLng]; } covBoxesFor = covSamplesGen; }
  let changed = false;
  for (const n of STREETNAMES) {
    if (streetComplete(n) || suggested.has(n)) continue;
    const pts = SAMPLES[n]; const set = covSets[n] || (covSets[n] = new Set(coveredIdx[n] || []));
    const box = covBoxes[n]; const outOfBox = box && (ll[0] < box[0] || ll[0] > box[1] || ll[1] < box[2] || ll[1] > box[3]);
    if (!outOfBox) for (let i = 0; i < pts.length; i++) { if (!set.has(i) && distM(ll, pts[i]) <= COV_RADIUS_M) { set.add(i); changed = true; } }
    if (set.size) coveredIdx[n] = [...set];
    if (set.size >= Math.ceil(pts.length * COV_FRAC) && !streetComplete(n)) { suggested.add(n); showSuggest(n); }
  }
  if (changed) markDirty('aux');
}
let sugQueue = []; // Beta 1.169 (Carbon fix round, B-11): streets that qualify while the banner is busy showing another - each gets its turn instead of being overwritten into silence. Run-scoped like `suggested` itself: cleared at the same four resets (cancel, clear-all, finish, route switch)
function showSuggest(n) {
  const cur = $('suggest').dataset.n;
  if (!$('suggest').classList.contains('hidden') && cur && cur !== n) { if (!sugQueue.includes(n)) sugQueue.push(n); return; } // Beta 1.169 (B-11): the banner is showing another street - queue behind it. The street is already in `suggested`, so coverFix will never offer it again this run; through 1.168 this call simply overwrote the banner and the earlier street's one offer was gone for the run.
  $('sugText').textContent = n + ' looks fully covered by GPS but is not marked done.';
  $('suggest').dataset.n = n;
  $('suggest').classList.remove('hidden');
}
function sugNext() { // the banner was answered or dismissed: the next queued street takes it - one that has since been marked, or left the route, is skipped
  while (sugQueue.length && (streetComplete(sugQueue[0]) || !STREETSET.has(sugQueue[0]))) sugQueue.shift();
  const nxt = sugQueue.shift();
  if (nxt) { $('sugText').textContent = nxt + ' looks fully covered by GPS but is not marked done.'; $('suggest').dataset.n = nxt; $('suggest').classList.remove('hidden'); }
}
$('sugYes').addEventListener('click', () => { const n = $('suggest').dataset.n; $('suggest').classList.add('hidden'); if (n) { const c = STRETCH[n].line[Math.floor(STRETCH[n].line.length / 2)]; if (map) map.flyTo({ center: [c[1], c[0]], zoom: Math.max(map.getZoom(), 15.5) }); selectStretch(n, 0, c); } sugNext(); }); // Beta 1.169 (Carbon fix round, B-02): the flyTo rides the codebase's map===null discipline (the 1.146 C4 idiom - followCam, northUp): in the map-failure world the tap still SELECTS the street; through 1.168 map.getZoom() threw first and the selection never happened
$('sugNo').addEventListener('click', () => { $('suggest').classList.add('hidden'); sugNext(); });
let weakToastAt = 0;
let gpsDenied = false; // Beta 1.111: the Status health GPS row's amber state - set by a permission denial (gpsError code 1), cleared by any accepted fix
function gpsError(e) {
  if (e && e.code === 1) { gpsDenied = true; toast('Location is off — allow location for this site in your browser settings', 4200); stopGps(); return; }
  if (Date.now() - weakToastAt > 60000) { weakToastAt = Date.now(); toast('GPS signal weak — still trying', 2600); }
}
function startGps(fromRun, restart) {
  if (watchId != null) { if (fromRun) { gpsFromRun = true; $('gpsBtn').classList.add('on'); $('gpsBtn').classList.toggle('rec', true); } return; } // Beta 1.64 (audit F06): reusing a view-only watcher for a clean must still flip the Locate tab to its recording face - the class sync sits below this early return, so the tab used to stay blue while recording
  if (!navigator.geolocation) { toast('This device has no GPS access here', 3000); return; }
  gpsFromRun = !!fromRun; if (!restart) followPaused = false; lastPushKey = ''; startCompass(); // Beta 1.116 (audit CG-115-01): the stale-watch restart passes restart=true - it is the app's own housekeeping, not a user action, so it must not clear a suspension the user deliberately made; only an explicit start begins un-suspended
  const wg = ++watchGen; watchId = navigator.geolocation.watchPosition(p => { if (wg === watchGen) acceptFix(p); }, e => { if (wg === watchGen) gpsError(e); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }); // Beta 1.69 (audit N04): callbacks carry their watcher's generation - a queued callback from a stopped or replaced watcher is dropped even when its timestamp is fresh (R01's guard cannot tell watchers apart)
  startRenderLoop(); // Beta 1.65: the frame-synced loop keeps centring between fixes (the Beta 1.28 camTimer's job, drive126 F2) - on the display's own clock now, not a second timer
  clearInterval(staleWatchTimer);
  staleWatchTimer = setInterval(() => { if (watchId != null && Date.now() - lastFixAt > GPS_STALE_MS && lastFixAt) { const wasRunGps = gpsFromRun; stopGps(true); startGps(wasRunGps, true); } }, 15000); // Beta 1.48 (audit B02): capture run ownership BEFORE stopGps clears it - the restart used to always come back as non-run GPS, so a mid-run watcher lost its run. Beta 1.116 (CG-115-01): the restart also preserves followPaused (startGps's restart flag) - a dead zone must not hand the camera back
  $('gpsBtn').classList.add('on');
  $('gpsBtn').classList.toggle('rec', gpsFromRun); // Beta 1.49: recording wears red on the Locate tab; view-only wears blue
}
function stopGps(silent) {
  watchGen++; // Beta 1.69: invalidate any callback still queued from this watcher
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null; gpsFromRun = false; clearInterval(staleWatchTimer); dispOff = [0, 0]; if (renderRaf) { cancelAnimationFrame(renderRaf); renderRaf = 0; } clearInterval(renderPump); renderPump = 0; stopCompass(); // Beta 1.64 (audit F08); Beta 1.65: the render loop stops with the watch
  if (map) pushGps(); // Beta 1.48 (audit B05): the facing beam is only built while watchId lives - without a fresh push the last beam stayed drawn after stop
  $('gpsBtn').classList.remove('on'); $('gpsBtn').classList.remove('rec'); $('spd').classList.add('hidden'); syncCentreBtn(); // Beta 1.115: location off - the re-centre button goes with it
}
$('gpsBtn').addEventListener('click', () => { if (!tapGuard('gpsBtn')) return; if (watchId != null) { if (followPaused) { resumeFollow(); toast('Centred on you — following again', 1800); } else stopGps(); } else if (runStart) { startGps(true); toast('Clean in progress — recording your route', 2600); } else { startGps(false); toast('Location on — view only, not recording', 2400); } }); // Beta 1.49 (Andrew's rule): the Locate tab alone never records - with no clean open it is view-only; pressed during an open clean it resumes that clean's recording and says so. Beta 1.115 (Andrew): with the follow suspended, Locate means "take me back to my dot" and resumes it - off is the tap while following.
$('centreBtn').addEventListener('click', () => { if (!tapGuard('centreBtn')) return; resumeFollow(); }); // Beta 1.115: the top-right re-centre button (below day/night) - visible only while suspended (syncCentreBtn)
