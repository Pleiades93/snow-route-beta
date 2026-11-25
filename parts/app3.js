
// ===== PACE (one source) ===== CLEAN holds every measure of a clean and both projections; the doorways delegate to it
const CLEAN = {
  /** @param {HistoryEntry} h @returns {number} */ count(h) { const items = (h && h.items) || {}; return Object.keys(items).filter(n => STREETSET.has(n)).length; }, // Beta 1.169 (Carbon fix round, B-07): THE count of a clean's streets, in one place - the streets the clean covers: its item keys that belong to the route, timestamp or not (buildSnap writes a null time for a completed street whose moment was not recorded; the street was still cleaned, and openClean lists it). Through 1.168 refRun and the pace/detail headers counted raw keys while histDur counted only timestamped streets, so the same clean could read '34 streets' in one line and '33 of 34' in the next.
  /** @param {HistoryEntry} h @returns {boolean} */ hasStamps(h) { const T = h && h.sides && h.sides.t; if (!T || typeof T !== 'object') return false; for (const n of Object.keys(T)) { const arr = T[n]; if (!Array.isArray(arr)) continue; for (const pr of arr) { if (Array.isArray(pr) && ((typeof pr[0] === 'string' && !isNaN(Date.parse(pr[0]))) || (typeof pr[1] === 'string' && !isNaN(Date.parse(pr[1]))))) return true; } } return false; }, // 2026-11-15 (denylist fix round, B-02): does the entry's stamp journal hold at least one real moment? A finish after a state restore archives with every stamp null, so buildSnap's window sum comes out 0 over NO evidence - that 0 was never measured. A measured 0 (the RP-05 case: real stamps, all before Start) always carries stamps.
  /** @param {HistoryEntry} h @returns {number} */ workM(h) {
   // side-metres a saved clean actually covered
    if (h && typeof h.workM === 'number' && isFinite(h.workM) && h.workM >= 0 && (h.workM > 0 || this.hasStamps(h))) return h.workM; // stored workM reads verbatim (pre-Start work never counts), except a stamp-less 0, which derives below
    const items = (h && h.items) || {}; let si = 0; for (const n of Object.keys(items)) if (STRETCH[n]) si += STRETCH[n].total * 2; // the items derivation: every completed street at both sides of its full length
    if (h && h.sides && h.sides.p && typeof h.sides.p === 'object') { let s = 0; for (const n of STREETNAMES) { const p = h.sides.p[n]; if (Array.isArray(p) && STRETCH[n]) { STRETCH[n].parts.forEach((part, i) => { const v = p[i] | 0; const L = segLenM(part); if (v & 1) s += L; if (v & 2) s += L; }); } else if (n in items && STRETCH[n]) s += STRETCH[n].total * 2; } if (s > 0) return s; } // Beta 1.169 (Carbon fix round, B-06): the sides branch used to price ONLY the sides map and return it the moment it priced anything - a PARTIALLY-recorded map (some completed streets carry no sides entry at all) short-circuited into the very RP-09 undercount the stored workM exists to prevent, alive in the legacy branch. The merge is now PER STREET: a street WITH a sides entry is priced by its bits (authoritative - it alone sees partial-side work, including on streets never completed), a completed street MISSING from the map falls back to the items derivation for that street.
    return si;
  },
  /** @param {HistoryEntry} h @returns {{count: number, durMs: number, start: number}|null} */ dur(h) {
    const items = (h && h.items) || {};
    const ks = Object.keys(items).filter(n => STREETSET.has(n) && items[n]);
    const ts = ks.map(n => Date.parse(items[n])).filter(t => !isNaN(t)).sort((a, b) => a - b);
    if (!ts.length) return null;
    const stA = Date.parse(h.startedAt);
    const start = (!isNaN(stA) && stA <= ts[0]) ? stA : ts[0];
    return { count: this.count(h), durMs: ts[ts.length - 1] - start, start }; // the DURATION spans the timestamped streets (a span needs moments), but the COUNT is cleanCount: null-timestamped streets included
  },
  /** @param {HistoryEntry} h @returns {string|null} */ paceKm(h) {
   // pace per road km: elapsed over road kilometres (cleanWorkM counts sides: road km = cleanWorkM / 2000)
    const d = this.dur(h); if (!d) return null;
    const elapsed = Date.parse(h.at) - d.start; const roadKm = this.workM(h) / 2000;
    if (!(elapsed > 0) || !(roadKm > 0)) return null;
    return fmtPaceKm(elapsed / roadKm);
  },
  // the reference rate: startedAt to the Finish tap at the 0.05 h floor - not the detail's paceRate
  /** @param {HistoryEntry} h @returns {number|null} */ refRateMh(h) { return workRateMh(this.workM(h), Date.parse(h.startedAt || ''), Date.parse(h.at || ''), 0.05); },
  /** @returns {HistoryEntry|null} */ ref() {
   // newest qualifying clean wins (history is chronological, so search from the end)
    // full = the streets in the route's list, counted by cleanCount: null-timestamped counts, a foreign key never
    for (let i = history.length - 1; i >= 0; i--) { const h = history[i]; if (h.items && this.count(h) === STREETNAMES.length) return h; }
    for (let i = history.length - 1; i >= 0; i--) { const h = history[i]; if (h.items && this.count(h) >= 5) return h; }
    return null;
  },
  // the summary projection: the read of a clean for the Pace surfaces; no renderer re-derives its figures
  /** @param {HistoryEntry} h @returns {object} */ summary(h) {
    return { count: this.count(h), dur: this.dur(h), workM: this.workM(h), paceKm: this.paceKm(h) };
  },
  // the detail projection: everything openClean renders, derived here; the renderer formats and builds DOM, interpreting no evidence
  /** @param {HistoryEntry} h @returns {object} */ detail(h) {
    const dur = this.dur(h);
    const workM = this.workM(h);
    const elapsedMs = dur ? Date.parse(h.at) - dur.start : NaN; // the interval from start to the Finish tap: one label once covered two intervals, skewing 15.8%
    const paceRate = (dur && !isNaN(elapsedMs) && elapsedMs >= 0) ? workRateMh(workM, dur.start, Date.parse(h.at), 0.05) : null; // the detail rate: work over dur's window (its start, else first stamp) - a different window from refRateMh's
    const items = h.items || {};
    const order = Object.keys(items).filter(n => STREETSET.has(n)).sort((x, y) => String(items[x] || '9999').localeCompare(String(items[y] || '9999')));
    const streets = [];
    let prev = h.startedAt ? Date.parse(h.startedAt) : NaN;
    for (const n of order) {
      const t = items[n] ? Date.parse(items[n]) : NaN;
      const gapMs = (!isNaN(t) && !isNaN(prev) && t >= prev) ? t - prev : NaN; // a completion before the earlier one (a skewed import) yields no gap at all - never a negative duration
      const stamps = (h.sides && h.sides.t && Array.isArray(h.sides.t[n])) ? h.sides.t[n].flat().map(x => Date.parse(x)).filter(x => !isNaN(x)) : []; // the street's own side stamps - span = first side marked to last side marked
      const spanMs = stamps.length ? Math.max.apply(null, stamps) - Math.min.apply(null, stamps) : NaN;
      if (!isNaN(t)) prev = t;
      streets.push({ name: n, at: items[n], tMs: t, gapMs, stamps, spanMs, via: (h.via || {})[n], noteLines: this.noteLines((h.notes || {})[n]) });
    }
    const notedOnly = Object.keys(h.notes || {}).filter(n => STREETSET.has(n) && !(n in items) && (Array.isArray(h.notes[n]) ? h.notes[n] : []).length).map(n => ({ name: n, primary: PRIMARIES.has(n), noteLines: this.noteLines(h.notes[n]) })); // issue #180: the Array.isArray guard - an inherited member ('constructor') is not a notes array
    return { count: this.count(h), dur, workM, paceKm: this.paceKm(h), elapsedMs, paceRate, streets, notedOnly };
  },
  /** @param {Array} entries @returns {string[]} */ noteLines(entries) { return (Array.isArray(entries) ? entries : []).map(f => f.k === 'note' ? ('📝 ' + (f.text || '')) : ((FLAGS[f.k] || f.k) + (f.at ? ' ' + fmtClock(new Date(f.at)) : ''))); },
};
function refRun() { return CLEAN.ref(); }
function cleanCount(h) { return CLEAN.count(h); }
function cleanWorkM(h) { return CLEAN.workM(h); }
function workRateMh(workM, startMs, endMs, minH) { const h = (endMs - startMs) / 3600000; return (workM > 0 && h > minH) ? workM / h : null; } // NaN inputs fail the comparisons and yield null
function fmtRate(r) { return (r / 1000).toFixed(1) + ' km of sides/hr'; }
const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// 'Tue, Nov 10' - the redesign date form for saved-clean rows and the detail header
function fmtDate3(iso) { const d = new Date(iso); if (isNaN(d)) return ''; return DAY3[d.getDay()] + ', ' + MON3[d.getMonth()] + ' ' + d.getDate(); }
// colon duration for the redesign stat cells and rows (1:24, 2:41) - presentation only; fmtDur keeps every surface
function fmtHM(ms) { if (ms == null || isNaN(ms) || ms < 0) return '–'; const m = Math.round(ms / 60000); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); }
// '8:56' - minutes:seconds per ROAD km
function fmtPaceKm(msPerKm) { if (msPerKm == null || isNaN(msPerKm) || !isFinite(msPerKm) || msPerKm <= 0) return null; const s = Math.round(msPerKm / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function cleanPaceKm(h) { return CLEAN.paceKm(h); }
// Progress-by-group sums: a completed street counts 1, any side done counts a half, else 0
function groupProgress(wantPrimary) {
  let sum = 0, cnt = 0;
  for (const n of STREETNAMES) { if (PRIMARIES.has(n) === wantPrimary) { cnt++; sum += streetComplete(n) ? 1 : (streetHalf(n) ? 0.5 : 0); } }
  return { sum, cnt };
}
function fmtCnt(v) { return v % 1 ? v.toFixed(1) : String(v); }
// the Pace stat mint table ships EMPTY: renderIcons (app4) fills every entry from the ACTIVE pack at boot
const PACE_ICONS = {
  clock: '',
  road: '',
  flag: '',
  list: '',
  cal: '',
  gauge: '',
  trail: ''
};
// data-ic lets renderIcons re-stamp a rendered cell in place on a pack switch
function statCell(ic, v, l) { return '<div class="cell"><span class="ic" data-ic="' + ic + '">' + PACE_ICONS[ic] + '</span><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }
function groupBar(name, g) {
  const pct = g.cnt ? (g.sum / g.cnt * 100) : 0;
  return '<div class="gbar"><div class="gb-top"><span class="gb-n">' + name + '</span><span class="gb-c">' + fmtCnt(g.sum) + ' of ' + g.cnt + ' streets</span></div><div class="gb-track"><div class="gb-fill" style="width:' + pct + '%"></div><div class="gb-half"></div></div></div>';
}
// pace is a work rate (side-metres/hour, cumulative off the stamps): interleaving cannot distort a cumulative rate
function paceInfo() {
  const ref = CLEAN.ref();
  const refRateMh = ref ? CLEAN.refRateMh(ref) : null;
  let rateMh = null, live = false;
  // the numerator is the RUN's work (liveWorkM), not the whole board's
  if (runStart) { const r = workRateMh(liveWorkM(), runStart, Date.now(), 0.02); if (r) { rateMh = r; live = true; } }
  if (!rateMh) rateMh = refRateMh;
  let etaTxt = '', etaClock = '';
  if (runStart && rateMh) { const leftM = totalWorkM() - workDoneM(); if (leftM > 0) { const leftH = leftM / rateMh; etaClock = fmtClock(new Date(Date.now() + leftH * 3600000)); etaTxt = 'ETA ' + fmtDur(leftH * 3600000) + ' · done ~' + etaClock; } }
  // etaClock is additive - the redesign ETA cell reads the done-at clock alone; etaTxt and statsLine are untouched
  return { rateMh, refRateMh, live, etaTxt, etaClock, ref };
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
function histDur(h) { return CLEAN.dur(h); }
let histOpen = false;
// the redesign: This run grid, verdict banner, Progress by group, Saved cleans, all on the same live data
function renderPace() {
  const p = paceInfo();
  const ref = p.ref;
  const ph = $('paceHead');
  if (ph) { ph.innerHTML = ''; const phT = document.createElement('span'); phT.className = 'ph-t'; phT.textContent = 'Current clean'; const phS = document.createElement('span'); phS.className = 'ph-s'; phS.textContent = (activeRoute ? activeRoute.name : '') + (runStart ? ' · started ' + fmtClock(new Date(runStart)) : ' · not started'); ph.appendChild(phT); ph.appendChild(phS); } // Beta 1.184 (Codex review, PR #22): the route name is user-controlled (a created or restored route) - it reaches this header as TEXT, never markup, the same discipline as the Streets route line; a name carrying markup must not be able to mint elements (e.g. a second #paceCancel) inside the sheet
  // a verdict needs live and reference rates both; otherwise the banner carries the reference line instead

  let banner;
  if (runStart && p.live && p.rateMh && p.refRateMh) {
    const diffMin = Math.round((totalWorkM() / p.refRateMh - totalWorkM() / p.rateMh) * 60);
    const etaBit = p.etaClock ? ', ETA ' + p.etaClock : '';
    if (diffMin > 0) banner = '<div class="verd"><span class="vd-g">▲ Faster by ' + diffMin + ' min</span>. Verdict at today\'s pace' + etaBit + '</div>';
    else if (diffMin < 0) banner = '<div class="verd"><span class="vd-r">▼ Slower by ' + (-diffMin) + ' min</span>. Verdict at today\'s pace' + etaBit + '</div>';
    else banner = '<div class="verd"><span class="vd-g">On pace with the reference clean</span>. Verdict at today\'s pace' + etaBit + '</div>';
  } else if (ref) {
    const rs = CLEAN.summary(ref);
    // named for what it measures (start to last done): 'total' names the other interval in the detail
    banner = '<div class="verd ref">Reference clean (' + fmtDate3(ref.at) + ')' + (rs.dur && rs.paceKm ? ', streets done in ' + fmtHM(rs.dur.durMs) + ' · ' + rs.paceKm + ' /km pace' : '') + '</div>';
  } else {
    banner = '<div class="verd ref">No reference clean yet. Finish a clean to set your pace</div>';
  }
  const last = history.length ? history[history.length - 1] : null; // most recent = the last element (history is chronological, append-only) - NOT the reference clean; the two can differ
  const ls = last ? CLEAN.summary(last) : null;
  let html =
    '<div class="statgrid">' +
    statCell('clock', runStart ? fmtHM(Date.now() - runStart) : '–', 'ELAPSED') +
    statCell('road', (workDoneM() / 2000).toFixed(1) + ' km', 'ROAD CLEARED') +
    statCell('flag', p.etaClock || '–', 'ETA') +
    statCell('list', STREETNAMES.filter(streetComplete).length + '/' + STREETNAMES.length, 'STREETS') +
    statCell('cal', ls && ls.dur ? fmtHM(ls.dur.durMs) : '–', 'LAST CLEAN') +
    statCell('gauge', (ls && ls.paceKm) || '–', 'LAST PACE /KM') +
    '</div>' +
    banner +
    (runStart ? '<button class="red" id="paceCancel">Cancel start</button>' : '') +
    '<div class="psec2">Progress by group</div>' +
    groupBar('Primaries', groupProgress(true)) +
    groupBar('Secondaries', groupProgress(false)) +
    '<div class="gb-cap">dashed line = halfway</div>' +
    '<div class="psec2">Saved cleans</div>';
  let any = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const s = CLEAN.summary(history[i]);
    if (!s.dur) { html += '<div class="prow histRow" data-i="' + i + '"><span><span class="sc-d">' + fmtDate3(history[i].at) + '</span> <span class="sc-n">· ' + s.count + ' streets</span></span><span class="sc-t2">time not recorded</span></div>'; any++; continue; } // Beta 1.167 (B4, RP-04) carries: a legacy clean whose item times are all null is still LISTED - and opens, and deletes through the same two-tap flow
    html += '<div class="prow histRow" data-i="' + i + '"><span><span class="sc-d">' + fmtDate3(history[i].at) + '</span> <span class="sc-n">· ' + s.dur.count + ' streets</span></span><span class="sc-t">' + fmtHM(s.dur.durMs) + '</span></div>';
    any++;
  }
  if (!any) html += '<div style="font-size:13px;color:var(--ink-dim);padding:4px 2px">No cleans saved yet. When you finish a clean and tap Finish, it lands here with its total time.</div>';
  $('pacePad').innerHTML = html;
  // the tap asks (askCancelStart): the discard is the unchanged one-tap path, run only by the danger button
  const c = $('paceCancel'); if (c) c.addEventListener('click', () => { askCancelStart(); });
  $('pacePad').querySelectorAll('.histRow').forEach(r => r.addEventListener('click', () => openClean(+r.dataset.i)));
}
function showPaceMain() { // the Pace sheet main view - header + pace content visible, the clean detail hidden
  const cv = $('cleanView'); if (cv) { cv.style.display = 'none'; cv.classList.add('hidden'); }
  const ph = $('paceHead'); if (ph) ph.style.display = '';
  const pp = $('pacePad'); if (pp) pp.style.display = '';
  cleanIdx = null;
  cleanDelArmedAt = NaN;
}
// showPaceMain first - an open left on the clean detail returns to the Pace main view
function openPace() { deselect(); closeSheets(); $('pacePanel').style.height = ''; $('pacePanel').style.maxHeight = ''; showPaceMain(); renderPace(); $('pacePanel').classList.add('open'); }
function closePace() { closeSheetEl($('pacePanel')); } // same animated close as every sheet

// ===== CLEAN DETAIL (production v5.53 model): one archived clean inside the list sheet - totals, its streets
// in mark order with per-street times, its notes, noted-but-not-cleaned group, two-tap delete. Back and Delete
// both land on Previous cleans (expanded), never on the Streets list. =====
const CLEAN_DEL_MIN_ARM_MS = 700;
let cleanIdx = null, cleanDelArmed = false, cleanDelTimer = 0, cleanDelArmedAt = NaN;
function cleanNoteLines(entries) { return CLEAN.noteLines(entries); }
function openClean(i) {
  const h = history[i];
  if (!h) return;
  cleanIdx = i; cleanDelArmed = false; cleanDelArmedAt = NaN;
  deselect();
  const pd = CLEAN.detail(h);
  const d = pd.dur;
  // the detail lives inside the Pace sheet: the pace content yields, the detail takes its seat

  const ph = $('paceHead'); if (ph) ph.style.display = 'none';
  const pp = $('pacePad'); if (pp) pp.style.display = 'none';
  const cv = $('cleanView');
  cv.classList.remove('hidden');
  cv.style.display = '';
  cv.innerHTML = '';
  const head = document.createElement('div'); head.className = 'cvHead';
  head.innerHTML = '<button class="cvBack">‹ Saved cleans</button><div class="cvTtlRow"><span class="cvTtl"></span><span class="cvSub"></span></div>';
  head.querySelector('.cvTtl').textContent = fmtDate3(h.at);
  head.querySelector('.cvSub').textContent = pd.count + ' streets · finished ' + fmtClock(new Date(h.at));
  head.querySelector('.cvBack').onclick = backToCleans;
  cv.appendChild(head);
  // the 2x2 cells: first is the histDur span ('Streets done in'); cleared is work, trail is travel
  const stats = document.createElement('div'); stats.className = 'statgrid d2';
  const cpk = pd.paceKm;
  stats.innerHTML =
    statCell('clock', d ? fmtHM(d.durMs) : '–', 'STREETS DONE IN') +
    statCell('road', (pd.workM / 2000).toFixed(1) + ' km', 'ROAD CLEARED') +
    statCell('gauge', cpk ? cpk + ' /km' : '–', 'PACE') +
    statCell('trail', h.km ? (+h.km).toFixed(1) + ' km' : '–', 'GPS TRAIL');
  cv.appendChild(stats);
  const meta = document.createElement('div'); meta.className = 'cvMeta';
  const elapsedMs = pd.elapsedMs; // the total-elapsed interval is the detail projection's measure now (CLEAN.detail carries the RP-08 two-interval history)
  // pace divides work by the total elapsed window (workRateMh's reference window too), and the meta line says so
  const paceRate = pd.paceRate;
  meta.textContent = (d ? ('Streets done in ' + fmtDur(d.durMs) + ' · Total elapsed ' + fmtDur(Math.max(0, elapsedMs)) + ' · ') : '') + pd.count + ' streets' + (h.km ? (' · ' + h.km + ' km of GPS trail') : '') + (h.pathShortened ? ' · saved GPS path shortened by the trail cap' : '') + (paceRate ? (' · Pace ' + fmtRate(paceRate) + ' (work / total elapsed)') : '') + (h.startedAt ? (' · started ' + fmtClock(new Date(h.startedAt))) : '') + '\nPace divides the clean\'s recorded work by its total elapsed time (start to the Finish tap). Per-street span = first side marked to last side marked (includes any work in between). Tap a street for its details.';
  cv.appendChild(meta);
  const secH = document.createElement('div'); secH.className = 'psec2'; secH.textContent = 'Streets'; cv.appendChild(secH);
  pd.streets.forEach(s => {
    const n = s.name;
    const t = s.tMs;
    const dur = s.gapMs;
    const stArr = s.stamps;
    const span = s.spanMs;
    const rowEl = document.createElement('div'); rowEl.className = 'cvRow';
    const top = document.createElement('div'); top.className = 'cvTop';
    // cleaned rows wear the done dot; NO pin in the detail (pins are the live list's locate control)
    top.innerHTML = '<span class="dot dot-done"></span><div class="cvNm"></div><div class="cvTm"></div>';
    top.querySelector('.cvNm').textContent = n;
    // one-moment sides (span 0) read as marked in one go; stamp-less falls back to a labelled gap
    top.querySelector('.cvTm').textContent = (!isNaN(t) ? fmtClock(new Date(t)) : '–') + ((span > 0) ? (' · span ' + fmtDur(span)) : (stArr.length ? ' · marked in one go' : (!isNaN(dur) ? (' · gap ' + fmtDur(dur)) : '')));
    rowEl.appendChild(top);
    const lines = s.noteLines;
    // an icon only on a street noted on THIS clean; tapping the row opens the note read-only
    if (lines.length) { const ni = document.createElement('span'); ni.className = 'cvNoteIco'; ni.innerHTML = ICONS.note; top.insertBefore(ni, top.querySelector('.cvTm')); }
    if (lines.length) { const p = document.createElement('div'); p.className = 'cvNt'; p.textContent = lines[0] + (lines.length > 1 ? ' (+' + (lines.length - 1) + ' more)' : ''); rowEl.appendChild(p); }
    const det = document.createElement('div'); det.className = 'cvDet'; det.style.display = 'none';
    const parts = [];
    parts.push('Marked: ' + (s.at ? fmtWhen(s.at) : 'no time recorded'));
    if (span > 0) parts.push('Span: ' + fmtDur(span) + ' - first side marked ' + fmtClock(new Date(Math.min.apply(null, stArr))) + ', last side ' + fmtClock(new Date(Math.max.apply(null, stArr))) + ' (includes any other work in between)'); else if (stArr.length) parts.push('Marked in one go - every recorded side of this street carries the same moment'); else if (!isNaN(dur)) parts.push('Gap since previous street: ' + fmtDur(dur) + ' (no side times recorded for this street; measured from the previous completion, or the clean start)');
    if (s.via) parts.push('How: ' + (s.via === 'gps' ? 'GPS suggestion' : 'marked by tap'));
    lines.forEach(L => parts.push(L));
    det.textContent = parts.join('\n');
    rowEl.appendChild(det);
    rowEl.onclick = () => { det.style.display = det.style.display === 'none' ? '' : 'none'; };
    cv.appendChild(rowEl);
  });
  const notedOnly = pd.notedOnly;
  if (notedOnly.length) {
    const sec = document.createElement('div'); sec.className = 'cvSec'; sec.textContent = 'Notes on streets not cleaned'; cv.appendChild(sec);
    notedOnly.forEach(s => {
      const n = s.name;
      const rowEl = document.createElement('div'); rowEl.className = 'cvRow';
      const top = document.createElement('div'); top.className = 'cvTop';
      top.innerHTML = '<span class="dot ' + (s.primary ? 'dot-gold' : 'dot-rose') + '"></span><div class="cvNm"></div>'; // not-cleaned rows wear their group pending dot
      top.querySelector('.cvNm').textContent = n;
      rowEl.appendChild(top);
      s.noteLines.forEach(L => { const p = document.createElement('div'); p.className = 'cvNt'; p.textContent = L; rowEl.appendChild(p); });
      cv.appendChild(rowEl);
    });
  }
  const del = document.createElement('button'); del.className = 'cvDel'; del.textContent = 'Delete this clean';
  del.onclick = ev => {
    const timestamp = ev?.timeStamp;
    if (!cleanDelArmed) {
      cleanDelArmed = true; del.classList.add('armed'); del.textContent = 'Tap again to confirm delete';
      cleanDelArmedAt = timestamp >= 0 && Number.isFinite(timestamp) ? timestamp : NaN;
      clearTimeout(cleanDelTimer);
      cleanDelTimer = setTimeout(() => { cleanDelArmed = false; cleanDelArmedAt = NaN; del.classList.remove('armed'); del.textContent = 'Delete this clean'; }, 5000);
      return;
    }
    if (!Number.isFinite(timestamp) || !(timestamp - cleanDelArmedAt >= CLEAN_DEL_MIN_ARM_MS)) return;
    clearTimeout(cleanDelTimer);
    HIST.deleteAt(cleanIdx);
    const okDel = HIST.save();
    backToCleans();
    if (!okDel) toast('Storage problem - the delete could not be saved; the clean may return on reload', 4200);
    updateCount();
  };
  cv.appendChild(del);
  $('pacePanel').classList.add('open');
  cv.scrollTop = 0;
}
function backToCleans() {
  closeClean();
  histOpen = true;
  openPace();
}
function closeClean() {
  cleanIdx = null;
  showPaceMain();
  renderPace();
}

// ===== RUN LIFECYCLE =====
// wakePending is the one in-flight request, shared by overlapping callers: two locks minted together orphaned the first
let wakeLock = null, wakePending = null;
async function syncWake() {
  // the want: a run with the awake toggle, or a live offline download. Recomputed after the request await
  const wantNow = () => document.visibilityState === 'visible' && ((!!runStart && settings.awake) || preloadRunning);
  try {
    if (wantNow() && !wakeLock && navigator.wakeLock) {
      if (!wakePending) {
        wakePending = (async () => {
          try {
            const lock = await navigator.wakeLock.request('screen');
            lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
            // still wanted: hold it - the sentinel is owned from here until its release
            if (wantNow()) wakeLock = lock;
            else { try { lock.release(); } catch (e) {} } // no longer wanted (toggle off / run finished / tab hidden during the request): release on arrival, wakeLock stays null
          } catch (e) { /* wake lock is best-effort */ }
          wakePending = null;
        })();
      }
      await wakePending; // every overlapping caller waits on the same one request - no second sentinel exists to leak
    }
    if (!wantNow() && wakeLock) { const w = wakeLock; wakeLock = null; w.release(); }
  } catch (e) { /* wake lock is best-effort */ }
}
document.addEventListener('visibilitychange', syncWake);
function noteSessionStart() { const s = Math.floor(runStart / 1000); if (trailSessions[trailSessions.length - 1] !== s) { trailSessions.push(s); if (saveSess().ok) return storeOk(); markDirty('sess'); return storeFail('sess', true); } return storeOk(); } // Beta 1.71 (audit B02): record the session boundary the moment the clean starts - a resumed run adds no new marker, because its Start already recorded one. Beta 1.73 (audit C04): the save result is RETURNED and a failure arms the PERSIST.flush retry - 1.71 dropped it, so a failed marker write was silent and a reload could join two cleans in the GPX export
// the board as it was at Start: Cancel restores it, erasing only what the run itself recorded
let runSnap = null;
// the pre-Start board is persisted too (LS.snap): a reloaded Cancel restores it exactly, unlike the journal
function saveSnap() {
  if (!runSnap || !runStart) { markClean('snap'); return storeOk(); }
  const ok = lsSet(LS.snap, BOARD.serialiseSnap(runSnap, runStart)); // Arch-2: the snapshot string is the board module's one construction
  if (ok) markClean('snap'); else markDirty('snap'); return ok ? storeOk() : storeFail('snap', true);
}
// the run's transitions have ONE owner - RUN
// Through 1.276 the four transitions each spelled their own reset ritual by
// hand: Start captured the snapshot, stamped runStart and opened the
// distance counter inline; Cancel and Finish each repeated the same
// teardown (the cancel snapshot's delete, its flag clean, the counter's
// end, the run identity zero) in their own order beside their own extras;
// and the route switch kept a fourth, state-only reset of the same session
// (the counter's state zero, the snapshot dropped, the history panel and
// the note editor closed down). The suggestion half of the recorded
// no candidate here: the suggestion offer is removed outright
// (showSuggest, the queue and the banner handlers are gone; coverage
// still computes and feeds the board), so no protocol remains to own -
// what remains is the transitions, and they are RUN's methods now. The
// state itself stays where it lives (runStart is app1's binding, runSnap
// is declared above with its 1.91 rationale): the owner holds the ACTS,
// each in its transition's old order. The four doorway functions
// (startClean, cancelStart, finishRun, resetNotesHistorySession) keep
// their names and signatures - the test battery calls them by name.
const RUN = {
  // the identity half: board captured, run stamped, counter opened; startClean keeps the saves around it
  /** @returns {void} */ begin() {
    runSnap = BOARD.capture(); runStart = Date.now(); RUNDIST.begin();
  },
  // the teardown: run consumed or erased, snapshot deleted, counter ended, identity zeroed; each caller keeps its extras in position
  /** @returns {void} */ end() {
    lsDel(LS.snap); markClean('snap'); RUNDIST.end(); runSnap = null; runStart = 0;
  },
  // the switch reset: counter zeroes (record stays for switch-back), in-memory snapshot drops, persisted copy untouched
  /** @returns {void} */ switchReset() {
    RUNDIST.reset();
    // the in-memory snapshot is the outgoing run's; the persisted copy stays untouched for a switch-back Cancel
    runSnap = null;
    histOpen = false; cleanIdx = null; cleanDelArmed = false; cleanDelArmedAt = NaN; if (cleanDelTimer) { clearTimeout(cleanDelTimer); cleanDelTimer = 0; }
    noteFor = null; $('noteModal').classList.add('hidden');
  },
};
// startClean carries the Start fence - the four statements after
// persistRunDist inside it window the trail to the new run, so anything recorded before this
// Start is evicted here (finish/cancel already clear theirs; the fence makes the window
// invariant local to Start rather than trusting every exit path).
// the snapshot is captured by the module (BOARD.capture - its copy depths are Cancel's semantics)
// Start is a hard exit: the shown point is back on the true position before the first fix
function startClean() { snapReset();
  RUN.begin(); const trailAtStart = trail.length; trail = trailWindow(trail, runStart); if (trail.length !== trailAtStart) markDirty('trail'); const okSnap = saveSnap(); const okSess = noteSessionStart(); const okStart = saveAllWarned(); startGps(true); updateCount(); syncWake(); if (!okStart.ok) toast('Clean started - warning: the clean state could not be saved (storage problem)', 4200); else if (!okSess.ok) toast('Clean started - warning: the session marker could not be saved; it will keep retrying', 4200); else if (!okSnap.ok) toast('Clean started - warning: the cancel safety snapshot could not be saved; it will keep retrying', 4200); checkStale(); } // Beta 1.221 gate fix (Codex P2, PR #98): the snapshot branch is guarded by !okSnap.ok - when the toast cuts removed the old success pill, the chain's last branch lost its condition and EVERY healthy Start showed this failure warning; the healthy path must stay silent (drive146 S1/S2) // Beta 1.167 (B5): Start banks a fresh distance counter for the new run (RUN.begin, the transition owner's Start half), so even an instant reload resumes THIS run's counter. // Beta 1.73 (audit C04): the marker save is part of the start's honesty check, not a silent side write // Beta 1.63 (audit F04): the clean still starts - he is standing in the snow - but the message stops claiming a saved state that does not exist
// Cancel start erases everything the run recorded - its trail points, its session
// marker, any sides marked during it, its coverage and suggestions - and stores nothing. Only Finish
// (Andrew's word - supersedes the call that kept the trail as history.)
function cancelStart() {
  const wasRunGps = gpsFromRun;
  const startSec = runStart ? Math.floor(runStart / 1000) : 0;
  // a persisted snapshot that exists but fails validation - the closing message must not claim an exact restore
  let snapDamaged = false;
  // no snapshot existed at all: the journal fallback runs, and the closing message names which reason applies
  let snapAbsent = false;
  if (runStart) {
    trail = trail.filter(p => (p[2] || 0) < startSec);
    trailSessions = trailSessions.filter(s => s !== startSec);
    if (runSnap) { BOARD.restore(runSnap); } // Arch-2: snapshot application is the board module's
    // the persisted snapshot restores the pre-Start board exactly (unmarks included); the stamp journal is only the fallback
    else {
      const persisted = parseJ(lsGet(LS.snap), null);
      // validated + normalized before a single field is applied - never the raw stored structures
      const validSnap = persisted ? validateSnap(persisted, runStart) : null;
      if (validSnap) { BOARD.restore(validSnap); }
      else {
        if (persisted) snapDamaged = true; else snapAbsent = true;
        BOARD.revertRunMarks(runStart); // Arch-2: the journal fallback (unmark at/after Start, re-derive, drop coverage) is the board module's one operation
      }
    }
    // the teardown is the owner's (RUN.end): snapshot delete, flag clean, counter end, identity zero
    RUN.end();
    markDirty('trail'); markDirty('sess');
  }
  const okCancel = saveAllWarned().ok; PERSIST.flush(true);
  // the erasure claim below is gated on the trail/session writes having actually landed
  const trailPending = writePending('trail') || writePending('sess');
  if (wasRunGps) stopGps();
  if (window.GLP) window.GLP.sync(); renderPanel(); renderStreets();
  updateCount(); syncWake();
  // the message is composed, not chained: the storage warning leads whenever it applies; single-failure messages keep their wording
  const rebuiltWhy = snapDamaged ? 'the saved snapshot was damaged' : (snapAbsent ? 'no start snapshot was saved' : '');
  if (okCancel && trailPending) toast('Start cancelled - erased here, but the trail cleanup could not be saved yet; it will keep retrying' + (rebuiltWhy ? ' - the board was rebuilt from the marks made during the clean (' + rebuiltWhy + ')' : ''), 4600);
  // the damaged disclosure stays: the only surface saying the cancel rebuilt approximately from a corrupt snapshot
  else if (okCancel && snapDamaged) toast('Start cancelled - clean erased (the saved snapshot was damaged, so the board was rebuilt from the marks made during the clean)', 4600);
  else if (!okCancel) toast('Start cancelled - warning: the cancellation could not be saved; the clean may return on reload', 4200);
// cancelStart once ignored saveAll's result and claimed success; it also never refreshed the trail
}
$('startBtn').addEventListener('click', ev => { if (!tapGuard('startBtn', ev)) return; startClean(); });
// CLEAR (Andrew): header button beside Pace - wipes EVERY mark on the board (all streets,
// both sides), plus the completion times/vias and the GPS coverage behind them.
// the tap ASKS first, through the shared confirmation (askClearAll) - through 1.270 this was the most
// destructive un-asked action in the app (the danger inventory's #17).
// The run itself (start time, trail, notes, history) is untouched - this is the mistake eraser, not a finish.
// coverage-only clears too: the guard is its own predicate - the tap reads it, clearAllMarks checks it first
function boardHasMarks() { return doneSet.size > 0 || STREETNAMES.some(n => pieces[n].some(v => v !== 0)) || Object.keys(coveredIdx).length > 0; }
function clearAllMarks() {
  const any = boardHasMarks();
  if (!any) { return; }
  BOARD.zeroMarks(); // Arch-2: the board emptying is the module's in-place zero
  deselect(); const okClear = finishChange();
  if (!okClear.ok) toast('Storage problem - the clear could not be saved; marks may return on reload', 4200);
}
$('clearBtn').addEventListener('click', ev => { if (!tapGuard('clearBtn', ev)) return; if (boardHasMarks()) askClearAll(); });
// the Clear ask: the shared confirmation, bound to its route; the wipe is clearAllMarks, unchanged
function askClearAll() {
  const forRoute = activeRoute ? activeRoute.id : null;
  showConfirm({ title: 'Clear all marks?', sub: 'Every mark, time and coverage on this route will be wiped. The run itself keeps going.', keep: 'Keep marks', danger: 'Clear all', onDanger: () => { if ((activeRoute ? activeRoute.id : null) === forRoute) clearAllMarks(); } });
}
// the dock's Cancel asks through the same confirmation: it once discarded in one tap, bypassing the question
$('cancelStartBtn').addEventListener('click', ev => { if (!tapGuard('cancelStartBtn', ev)) return; askCancelStart(); });
$('resetBtn').addEventListener('click', ev => {
  // the pop-up below is the only finish gate: the Undo is removed, so this button means only Finish

  if (!tapGuard('resetBtn', ev)) return;
  const nDone = doneSet.size, nNotes = Object.keys(notes).length;
  $('finMsg').textContent = (nDone || nNotes)
    ? (nDone + ' of ' + STREETNAMES.length + ' streets cleaned' + (nNotes ? ', notes on ' + nNotes + ' street' + (nNotes === 1 ? '' : 's') : '') + '. The clean is saved to Previous cleans with its notes, and the board clears for the next clean.' + (nDone < 3 && nDone < STREETNAMES.length ? ' Careful: under 3 streets, so this will clear WITHOUT being saved.' : '')) // issue #180: the warning matches finishRun's rule - a FULL clean of a short route (every street done) IS saved, so it is never warned as unsaved
    : 'Nothing is marked yet. Finishing just clears the board - nothing will be saved.';
  $('finModal').classList.remove('hidden');
});
$('finNo').addEventListener('click', () => $('finModal').classList.add('hidden'));
$('finYes').addEventListener('click', ev => { if (!tapGuard('finYes', ev)) return; $('finModal').classList.add('hidden'); finishRun(); });
// THE shared confirmation surface (head.html #confirmPill -
// the selection pill's faces and box, centred). The app grew three
// unrelated confirm patterns (the Finish modal, the Settings reset two-step,
// the saved-clean two-tap arm); this is the ONE reusable surface new
// confirmations take, first used by Cancel start.
// the backdrop ladder samples - his pick B1): the surface owns a backdrop
// (head.html #confirmBackdrop - a quarter dim, rgba(0,0,0,.25), under a 3px
// backdrop blur), shown and hidden with the pill by the two functions below,
// so every confirmation gets the same focus treatment and no call site ever
// adds its own. Buttons only: the backdrop is focus, not a tap target -
// there is no outside-tap dismissal, so a stray tap can neither confirm
// nor dismiss. showConfirm replaces any pending question wholesale - the
// stored danger callback is the only one the danger button can ever run.
let confirmDangerCb = null;
/** @param {{title: string, sub: string, keep: string, danger: string, onDanger: function(): void}} o @returns {void} */ function showConfirm(o) { const p = $('confirmPill'); p.querySelector('.cfTitle').textContent = o.title; p.querySelector('.cfSub').textContent = o.sub; $('cfKeep').textContent = o.keep; $('cfDanger').textContent = o.danger; confirmDangerCb = o.onDanger || null; $('confirmBackdrop').classList.add('on'); p.classList.remove('hidden'); }
/** @returns {void} */ function hideConfirm() { $('confirmBackdrop').classList.remove('on'); $('confirmPill').classList.add('hidden'); confirmDangerCb = null; }
$('cfKeep').addEventListener('click', hideConfirm);
$('cfDanger').addEventListener('click', () => { const f = confirmDangerCb; hideConfirm(); if (f) f(); });
/** @returns {void} */ function askCancelStart() { const forRoute = activeRoute ? activeRoute.id : null; const forRun = runStart; showConfirm({ title: 'Cancel this run?', sub: 'All progress will be lost.', keep: 'Keep going', danger: 'Yes, cancel', onDanger: () => { if (runStart === forRun && (activeRoute ? activeRoute.id : null) === forRoute) { cancelStart(); closeSheets(); } } }); } // Beta 1.255: THE cancel-start ask - every entry point (the Pace sheet's button, the dock's button) routes through this one function, so the confirmation and its route+run binding can never cover one door and miss the other (gate round 3, Codex P2: the dock's #cancelStartBtn still discarded in one tap)
function trailKm(sinceMs) {
  // timestamps are whole seconds: compare at the same precision, or a mid-second start discards the first segment
  const sinceSec = Math.floor(sinceMs / 1000);
  let d = 0;
  // the break rule (gap > 300 s, jump > 1000 m) lives in trailSegments now
  for (const seg of trailSegments(trail)) for (let i = 1; i < seg.length; i++) {
    if (seg[i][2] < sinceSec || seg[i - 1][2] < sinceSec) continue; // a segment counts only when BOTH endpoints belong to the run
    d += distM(seg[i - 1], seg[i]);
  }
  return d / 1000;
}
// ===== RUN DISTANCE COUNTER =====
// The counter accumulates each accepted fix's segment AT RECORD TIME (acceptFix), under
// trailKm's own pair rule (both endpoints in the run, <=300 s apart, <=1000 m), so the total
// survives any later trail truncation; buildSnap reads it when it belongs to the finishing
// run. It persists (LS.rundist) so a mid-run reload resumes it; a lost or foreign record
// re-derives from the surviving trail (RUNDIST.adopt) - the pre-1.167 figure, never worse.
// extended the never-worse rule to a matching but STALE
// record: adoption reconciles a banked figure against the surviving trail by max(), and
// PERSIST.flush's forced flush (app1) banks the counter at page death.
// the trail is
// now a backend-only rolling window - only the live run's last 60 minutes of points
// (TRAIL_WINDOW_S, app1) - kept solely as this counter's fallback; there is no drawn trail
// line and no archived path, so the 1.167 capped flag (which meant "the trail lost this
// run's points, the stored path is shorter") retires with the surface it described: under
// a window, eviction is the design, not an event, and nothing branches on it. The counter
// is hardened instead: persistRunDist banks on EVERY recorded fix (the 30 s / 25 m throttle
// is gone - the record is a few dozen characters, overwritten in place, so the storage
// footprint is unchanged) and a second copy rides LS.rundist2, written only by the
// trail-flush path (bankRunDistMirror via PERSIST.flush, app1) so the two records fail
// independently. THE RECONCILIATION INVARIANT: every recovery candidate is a LOWER BOUND
// of the run's true total - a banked record only ever accumulates real recorded segments,
// and the window's trailKm sums a SUBSET of the run's recorded pairs under the same pair
// rule - so max() can raise a stale bank toward truth but can never overstate it, and the
// trail derivation is never the authority for a span the window does not cover. The named
// residual: if BOTH counter copies are dead, recovery is exactly the window's own
// distance - the last hour, nothing more is promised.
// The record also carries the counter's ENDPOINT (end - the last recorded point).
// Per-fix banking writes the counter synchronously while the trail's own write is
// buffered in PERSIST.flush, so a process death inside that buffer leaves the banked
// total AHEAD of the stored trail; without the endpoint, adoption would restore
// the newer total while the next segment is measured from the stored trail's
// older tail - counting the in-between travel twice,
// Codex P2). Adoption restores the endpoint as the counter's SEGMENT ANCHOR
// (RUNDIST.cur.end, read by RUNDIST.record when it is newer than the trail's tail) -
// deliberately NOT as a point in the trail: an appended endpoint would hand
// trailKm a synthetic edge (flushed tail -> endpoint) that was never a
// recorded pair, and where the lost span held pair-rule-rejected jumps that
// edge's chord could invent distance the counter never banked,
// Codex P2). Held outside the trail, the endpoint steers only the next
// segment's measurement; the derivation keeps summing recorded pairs alone.
// Records written before carry no endpoint and adopt as they did.
// the counter has ONE owner - RUNDIST. Through
// 1.275 the record and its two bank ledgers were loose bindings down here and
// the lifecycle's obligations sat with the callers: Start assigned the record
// inline before banking, acceptFix adopted before recording, buildSnap adopted
// before reading, and Finish/Cancel each spelled the reset-plus-two-deletes
// teardown. The methods below are those obligations, moved in: every consumer
// (record, bank, flushMirror, distance) adopts-if-foreign FIRST, so no path
// can bank or read an un-adopted counter - the invariant persistRunDist's own
// 1.186 guard already enforced for the writer alone. The two published handles
// survive as one-line delegations under the owner (persistRunDist for
// PERSIST.flush's forced-bank step and bankRunDistMirror for its mirror step -
// app1 resolves both by name through lateFn, and scripts/app1-types.d.ts
// declares both); adoptRunDist and resetRunDist retire as globals.
const RUNDIST = {
  cur: { run: 0, m: 0, end: null },
  wrote: { run: 0, m: 0, end: null },
  mirrorWrote: '',
  // a fresh counter record, banked forced (an instant reload resumes this run); mirrorWrote is deliberately not reset
  /** @returns {void} */ begin() {
    this.cur = { run: runStart, m: 0, end: null }; this.wrote = { run: 0, m: 0, end: null }; this.bank(true);
  },
  // the counter half per fix: adopt, anchor, accumulate, bank (the trail append and eviction stay in acceptFix)
  /** @param {number[]} newPt @returns {void} */ record(newPt) {
    // first fix of an unmet run (a mid-run reload): adopt the record or re-derive from the trail
    if (this.cur.run !== runStart) this.adopt();
    const runSec = Math.floor(runStart / 1000);
    // the anchor is the endpoint when newer than the trail's tail (crash case); it never enters the trail
    const prevPt = (this.cur.end && (!trail.length || this.cur.end[2] > trail[trail.length - 1][2])) ? this.cur.end : (trail.length ? trail[trail.length - 1] : null);
    if (prevPt && prevPt[2] >= runSec && newPt[2] - prevPt[2] <= 300) { const seg = distM(prevPt, newPt); if (seg <= 1000) this.cur.m += seg; } // trailKm's own pair rule, applied at record time so the total survives the window eviction
    // the endpoint rides the record: adoption restores it as anchor, never a trail point, so crashes cannot re-measure
    this.cur.end = newPt;
    this.bank(false);
  },
  // the counter's metres for the live run (adopting first), else null - the caller falls back to trailKm
  /** @returns {number|null} */ distance() {
    if (runStart && this.cur.run !== runStart) this.adopt();
    return (runStart && this.cur.run === runStart) ? this.cur.m : null;
  },
  /** @param {boolean} [force] @returns {void} */ bank(force) {
    // never bank an un-adopted counter: a post-reload flush could write its zero record over the banked one
    if (runStart && this.cur.run !== runStart) this.adopt();
    // no throttle, only change gates: acceptFix banks after every fix, current to the last fix
    if (!force && this.wrote.run === this.cur.run && this.wrote.m === this.cur.m && this.wrote.end === this.cur.end) return;
    if (lsSet(LS.rundist, JSON.stringify(this.cur))) this.wrote = { run: this.cur.run, m: this.cur.m, end: this.cur.end };
  },
  // the second copy (LS.rundist2) writes only from the flush path, so the two copies fail independently
  /** @returns {void} */ flushMirror() {
    if (!runStart) return;
    if (this.cur.run !== runStart) this.adopt();
    const s = JSON.stringify(this.cur);
    if (s === this.mirrorWrote) return;
    if (lsSet(LS.rundist2, s)) this.mirrorWrote = s;
  },
  /** @returns {void} */ adopt() {
    if (!runStart) { this.cur = { run: 0, m: 0, end: null }; return; }
    // adoption (primary, mirror, derivation) is judged by value: every candidate lower-bounds the truth, the largest wins
    let best = -1, bestEnd = null;
    for (const key of [LS.rundist, LS.rundist2]) { let raw = null; try { raw = JSON.parse(lsGet(key) || 'null'); } catch (e) { raw = null; } if (raw && raw.run === runStart && typeof raw.m === 'number' && isFinite(raw.m) && raw.m >= 0) { const rawEnd = (Array.isArray(raw.end) && raw.end.length === 3 && Number.isFinite(raw.end[0]) && Number.isFinite(raw.end[1]) && Number.isFinite(raw.end[2]) && raw.end[2] >= Math.floor(runStart / 1000)) ? raw.end : null; if (raw.m > best || (raw.m === best && rawEnd && (!bestEnd || rawEnd[2] > bestEnd[2]))) { best = raw.m; bestEnd = rawEnd; } } } // Beta 1.193 (gate round 3, Codex P2): on a totals TIE the NEWER endpoint wins - a failed primary write beside a landed mirror leaves equal totals carrying different endpoints (rejected jumps advance the endpoint without adding distance), and anchoring on the older one would re-measure the span the newer already covers. bestEnd only ever comes from a record whose total IS the winning one (or its tie) - a lower record's endpoint sits behind the winner's true position and must not anchor.
    // the anchor is the newer of the endpoint and the trail's tail; it never becomes a trail point
    this.cur = { run: runStart, m: Math.max(best, trailKm(runStart) * 1000), end: (bestEnd && (!trail.length || bestEnd[2] > trail[trail.length - 1][2])) ? bestEnd : (trail.length ? trail[trail.length - 1] : bestEnd) };
  },
  // the state-only zero: the record stays in the slot and is re-adopted if he switches back mid-run
  /** @returns {void} */ reset() {
    this.cur = { run: 0, m: 0, end: null }; this.wrote = { run: 0, m: 0, end: null }; this.mirrorWrote = '';
  },
  // the teardown: the counter is consumed or discarded; its state zeroes, both copies go with the run
  /** @returns {void} */ end() {
    this.reset(); lsDel(LS.rundist); lsDel(LS.rundist2);
  },
};
// The published doorway: PERSIST.flush's step table (app1) resolves
// these two by name through lateFn, exactly as it resolved the loose helpers -
// the walk's steps keep their handles, the work is the owner's now.
/** @param {boolean} [force] @returns {void} */ function persistRunDist(force) { RUNDIST.bank(force); }
/** @returns {void} */ function bankRunDistMirror() { RUNDIST.flushMirror(); }
// a fingerprint of the geometry as cleaned (names + side-metres, FNV-1a): later edits are detectable against it
function geoFingerprint() {
  let fp = 2166136261 >>> 0; const str = STREETNAMES.map(n => n + ':' + (STRETCH[n] ? STRETCH[n].total.toFixed(1) : '0')).join('|');
  for (let i = 0; i < str.length; i++) { fp ^= str.charCodeAt(i); fp = Math.imul(fp, 16777619) >>> 0; }
  return ('0000000' + fp.toString(16)).slice(-8);
}
// archive shape: items a street->time map; km the counter's total (trailKm fallback); no GPS path is baked
function buildSnap() {
  if (!doneSet.size && !Object.keys(notes).length) return null;
  const ts = [...doneSet].map(n => Date.parse(doneTimes[n])).filter(t => !isNaN(t)).sort((a, b) => a - b);
  // a stamp-less run still started: fall back to its start, or the archive loses startedAt
  const startMs = (runStart && ts.length && runStart <= ts[0]) ? runStart : (ts.length ? ts[0] : (runStart || null));
  // the counter is the distance source: RUNDIST.distance adopts before reading, null for an unseen run
  const rdM = RUNDIST.distance();
  const snap = { at: new Date().toISOString(), items: {}, via: { ...doneVia }, notes: JSON.parse(JSON.stringify(notes)), sides: BOARD.sidesCopy(), km: startMs ? +(((rdM != null) ? rdM / 1000 : trailKm(startMs))).toFixed(1) : 0, startedAt: startMs ? new Date(startMs).toISOString() : null };
  doneSet.forEach(n => { snap.items[n] = doneTimes[n] || null; });
  // the run's figures bake into the entry (cleanWorkM prefers them): workM sums stamps inside [Start, Finish] only

  if (startMs) { let wm = 0; const endMs = Date.parse(snap.at); const winStart = runStart || startMs; for (const n of Object.keys(snap.sides.p)) { const pv = snap.sides.p[n] || [], T = snap.sides.t[n] || []; const parts = STRETCH[n] ? STRETCH[n].parts : []; parts.forEach((part, i) => { const L = segLenM(part); const st = T[i] || [null, null]; if ((pv[i] & 1) && st[0]) { const ts = Date.parse(st[0]); if (ts >= winStart && ts <= endMs) wm += L; } if ((pv[i] & 2) && st[1]) { const ts = Date.parse(st[1]); if (ts >= winStart && ts <= endMs) wm += L; } }); } snap.workM = Math.round(wm); }
  snap.totalWorkM = Math.round(totalWorkM());
  snap.geoFP = geoFingerprint();
  // no path bake: the trail's only job is the counter's fallback, so the archive keeps the km alone

  return snap;
}
function finishRun() {
  northUp();
  const snap = buildSnap();
  // the archive carries the run's identity (interrupted finishes reconcile at boot); a no-run finish stamps the marker's finishAt
  const finishAt = Date.now(); if (snap) snap.runId = runStart || finishAt;
  // under 3 streets clears unsaved, unless the clean is full: a short route's complete clean is real
  const archiving = !!(snap && (doneSet.size >= 3 || (doneSet.size > 0 && STREETNAMES.every(n => doneSet.has(n)))));
  const prevHist = history;
  // the finish is a small TRANSACTION -
  // both gated writes land BEFORE any state changes, so a storage failure
  // leaves the run fully intact instead of half-finished: (1) the archive
  // record, (2) the cleared authority (sides) record. Gate 2 failing rolls
  // gate 1 back. Before 1.57 only the archive was gated; the cleared board
  // written afterwards was not, so a failed sides write resurrected the
  // finished clean beside its own archive entry on the next launch.
  let newHist = null;
  // the incoming archive JOINS the history - nothing is evicted, at any size
  if (archiving) newHist = HIST.appended(snap);
  const cleared = BOARD.clearedSides(); // Arch-2: the zeroed sides a committed finish writes are built by the board module
  const prevSidesRaw = lsGet(LS.sides); // kept so the start step's rollback can restore this write exactly (including its absence)
  // the finish transaction on the ONE coordinator - the
  // 1.57-1.93 gate discipline mechanized: archive, cleared authority, start-key
  // delete; verified writes; verified rollback in reverse. A kill between gates
  // leaves a signature reconcileInterruptedFinish resolves at boot (CG-196-04).
  const fSteps = [];
  // the cleanup obligation is the transaction's first step, so every prefix carries it; the post-commit saveAll discharges it
  fSteps.push({ name: 'finclean', write: () => txSet(LS.finclean, JSON.stringify({ run: runStart || 0, at: finishAt })), undo: () => txDel(LS.finclean) });
  // the archive write and its rollback write the merge (HIST.serialise), never the bare view
  if (archiving) fSteps.push({ name: 'archive', write: () => txSet(LS.hist, HIST.serialise(newHist)), undo: () => txSet(LS.hist, HIST.serialise(prevHist)) });
  fSteps.push({ name: 'sides', write: () => txSet(LS.sides, JSON.stringify(cleared)), undo: () => prevSidesRaw === null ? txDel(LS.sides) : txSet(LS.sides, prevSidesRaw) });
  if (runStart) fSteps.push({ name: 'start', write: () => txDel(LS.start), undo: () => txSet(LS.start, String(runStart)) });
  const fTx = runTx(fSteps);
  if (fTx.outcome !== 'committed') {
    if (fTx.outcome === 'degraded') { toast(fTx.failedStep === 'sides' && archiving ? 'Storage failure - finish stopped, but the archive could not be undone - export a backup now' : 'Storage failure - finish stopped, but the rollback could not be verified - export a backup now', 6000); return; } // Beta 1.141 verify cycle 1: degraded is judged FIRST - an archive failure whose rollback could not be verified is not "run intact", whatever step failed
    if (fTx.failedStep === 'archive') { toast('Storage full - finish stopped, clean intact', 3600); return; }
    toast('Storage problem - finish stopped, your clean is intact', 4200); return;
  }
  // the teardown is the owner's (RUN.end): the counter bakes into the archive; copies and trail window go too
  RUN.end(); trail = []; markDirty('trail');
  if (archiving) HIST.replaceView(newHist);
  BOARD.zeroMarks(); notes = {}; // Arch-2: the board half of this reset is the module's in-place zero (the run identity zeroed with RUN.end above)
  // no line to force-draw any more; the window itself was cleared with the counter records above
  stopGps(); deselect();
  // the sides write already landed; this pass carries the metadata - a failure warns but cannot resurrect anything
  const restRes = saveAll(); const restOk = restRes.ok;
  finishChange();
  if (!restOk) toast((archiving ? 'Clean archived · ' + Object.keys(snap.items).length + ' streets' : 'Board cleared - under 3 streets, nothing saved') + ' - some details could not be written (' + restRes.failedKey + '); they retry on the next save', 3400); // Beta 1.221 adjudication: the finish SUCCESS pill is cut (the board and history are the report), but its failure suffix is a storage-problem warning with no other surface - the pill survives for the failure case only, text verbatim
  // only on the committed path: failures leave the run intact; the chime and vibration play here
  onFinishFeedback();
}
function performReset() { finishRun(); } // production's name for the finish action (the test battery calls it directly)
// the stale-clean ask (run over 12 hours) lives on the pill; the danger seat runs Finish's click
function checkStale() {
  if (!(runStart && (Date.now() - runStart > 12 * 3600000))) return;
  const forRun = runStart;
  showConfirm({ title: 'Finish this clean?', sub: 'It started ' + fmtClock(new Date(runStart)) + ', over 12 hours ago.', keep: 'Keep going', danger: 'Finish it', onDanger: () => { if (runStart === forRun) $('resetBtn').click(); } });
}

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
  return saveAllWarned(); // callers announce from the result - the storage-outcome object
}
function flagText(n) { return (Array.isArray(notes[n]) ? notes[n] : []).map(f => f.k === 'note' ? ('📝 ' + (f.text || '')) : (FLAGS[f.k] || f.k) + (f.at ? ' ' + fmtClock(new Date(f.at)) : '')).join('; '); }
let noteFor = null;
function openNote(name) { noteFor = name; $('noteTitle').textContent = 'Note: ' + name; $('noteText').value = noteTextOf(name); $('noteModal').classList.remove('hidden'); }
$('noteNo').addEventListener('click', () => $('noteModal').classList.add('hidden'));
$('noteYes').addEventListener('click', () => {
  if (!noteFor) return;
  const okNote = setNoteText(noteFor, $('noteText').value);
  $('noteModal').classList.add('hidden'); renderStreets(); if (!okNote.ok) toast('Storage problem - the note could not be saved', 4200);
});

// ===== GPS (checklist SS7) =====
// lastFixTs is the last accepted fix's OWN timestamp - a callback carrying an older one is stale
let watchId = null, watchGen = 0, gpsFromRun = false, gpsPos = null, dispPos = null, lastFixAt = 0, watchStartedAt = 0, lastFixTs = 0, lastFixSpd = 0, lastGood = null, spdTimer = 0, offRouteArmed = true, followPaused = false, staleWatchTimer = 0; // Beta 1.198: lastFixSpd = the last ACCEPTED fix's own speed (m/s) — followCam's correction cap is relative to it (see the cap's comment there)
// null-prototype like ROADS - buildSamples refills it by Object.assign from street-name keys
const SAMPLES = Object.create(null);
// samples as a pure function of a stretch set: buildSamples refills SAMPLES; app4 builds packs' from it
function samplesFor(stretch, names) {
  // filled by street-name assignment - a plain object would lose a '__proto__' street to its prototype
  const out = Object.create(null);
  for (const n of names) { const pts = []; for (const run of stretch[n].runs) { const L = run.line, cum = run.cum; let i = 1; for (let d = 0; d <= run.total; d += COV_SAMPLE_M) { while (i < cum.length - 1 && cum[i] < d) i++; const span = cum[i] - cum[i - 1] || 1, t = (d - cum[i - 1]) / span; pts.push([L[i - 1][0] + (L[i][0] - L[i - 1][0]) * t, L[i - 1][1] + (L[i][1] - L[i - 1][1]) * t]); } } out[n] = pts; } // Beta 1.144 (Package C, DA-02/C1): samples are taken PER RUN - a disconnected street's later runs are covered streets too, and coverage must be able to suggest them. The 1.135 hoisted cursor resets per run (each run's distances rise monotonically on their own); a single-run street produces the identical sample list. // Beta 1.135 (programme D): the segment cursor i is hoisted out of the sample loop - sample distances rise monotonically, so a sample's segment never lies before the previous sample's, and the pre-1.135 per-sample restart re-walked the line from its start every 15 m (18,449 cursor-condition checks on Route 5W; the hoisted cursor advances at most once per segment). The samples produced are identical (the 1.135 fixture harness compares them byte-for-byte).
  return out;
}
// the generation bump invalidates coverFix's per-street sample boxes - the samples they were measured from just changed
function buildSamples() { const built = samplesFor(STRETCH, STREETNAMES); for (const k of Object.keys(SAMPLES)) delete SAMPLES[k]; Object.assign(SAMPLES, built); covSamplesGen++; }
// (the coverage-index sanitizer lives in loadRouteState, app1: state loads on route pick, not at eval)

// the reset is the transition owner's (RUN.switchReset) - this doorway keeps the published handle app5 resolves
function resetNotesHistorySession() { RUN.switchReset(); }
function pushGps() {
  const src = map && map.getSource('gps'); if (!src) return;
  const feats = [];
  // the facing beam: a point carrying the facing; the gps-beam layer paints the gradient fan along it
  if (dispPos && watchId != null && facingDeg != null) {
    // painted rot is beamDeg (smoothed per frame); facingDeg is the heading of record
    feats.push({ type: 'Feature', properties: { k: 'beam', rot: Math.round((beamDeg != null ? beamDeg : facingDeg) * 10) / 10 }, geometry: { type: 'Point', coordinates: [dispShownPos()[1], dispShownPos()[0]] } });
  }
  if (dispPos) {
    // the puck is no feature: the shader layer draws it in screen space off dispPos each frame

    if (gpsAccM > 0) { const ring = []; const R = gpsAccM; for (let a = 0; a <= 28; a++) { const th = a / 28 * Math.PI * 2; ring.push([dispShownPos()[1] + (R * Math.sin(th)) / MLNG, dispShownPos()[0] + (R * Math.cos(th)) / MLAT]); } feats.push({ type: 'Feature', properties: { k: 'ring' }, geometry: { type: 'Polygon', coordinates: [ring] } }); }
  }
  src.setData({ type: 'FeatureCollection', features: feats });
}
let gpsAccM = 0;
// drawTrail is RETIRED with the surface it served - there is no
// trail line on the map any more (the 'trail' source and 'trail-line' layer went with it,
// app2). Through 1.190 this block filtered the stored trail to the live run and painted it
// (run-scoped, throttled). The stored trail itself survives as
// the distance counter's backend fallback window (see the counter block above); its
// remaining readers are trailKm (the derivation) and buildGpx (internal only, app4).
// one frame-synced loop drives dot and camera: two unsynced timers once overlapped and sped the easing up
let renderRaf = 0, renderPump = 0, lastFrameAt = 0, lastCamAt = 0, lastPushKey = '';
// the display coasts on the predicted track; corrections decay via dispOff over ~0.3 s (display-only)
let dispOff = [0, 0], lastDispAt = 0;
function dispSettled() { return Math.abs(dispOff[0]) < 0.05 && Math.abs(dispOff[1]) < 0.05; }
// standing still, Andrew's puck
// twitches - the position filter keeps re-settling in sub-metre steps (0.5-1.5 m display steps on
// fixes whose raw step is under 0.02 m; ~4 px hops at zoom 18) even though this phone's raw at-rest
// scatter measures 0.08-0.28 m. The twitch is a DISPLAY artefact, so the fix is display-only: once
// the display has genuinely settled, the rendered point freezes at the held point until the vehicle
// really moves. Nothing upstream changes - gpsPos, dispPos, coverage, trail, banking and the fix
// logger (which records the un-held display track, keeping its data comparable with the 1.189-1.193
// logs) all see true values exactly as before; only what is RENDERED (the puck, the beam and ring,
// the follow camera's target) reads dispShownPos(). An estimator-level hold (ZUPT) was judged and
// dropped on the same evidence: its target wander measured 20-70x smaller than its premise here.
let dispHoldPt = null; // the held [lat, lng] while engaged, else null
// raw position at engagement: exits judge raw travel (at rest it moves <0.4 m in any window)
let dispHoldRaw = null;
let dispHoldPrev = null; // dispPos at the prior fix - the display-step basis the engage test reads
let dispHoldSteps = []; // the last 3 display steps (m)
let dispHoldN = 0; // fixes the state machine has seen (the engage test needs three real steps behind it)
let dispHoldLow = 0, dispHoldFast = 0, dispHoldFar = 0; // consecutive-fix counters: slow (engage), >= 0.5 m/s and raw-displaced (exit)
// the rendered: hold point, else snap blend, else display track (hold and snap use disjoint speed bands)
function dispShownPos() { return dispHoldPt || snapBlendPt() || dispPos; }
function dispHoldReset() { dispHoldPt = null; dispHoldRaw = null; dispHoldPrev = null; dispHoldSteps = []; dispHoldN = 0; dispHoldLow = 0; dispHoldFast = 0; dispHoldFar = 0; }
// fed once per accepted fix, when fixLogOut reads dispPos - the basis the simulation was proven on
function dispHoldFix(speed, ll) {
  const dp = dispPos;
  const step = (dp && dispHoldPrev) ? distM(dispHoldPrev, dp) : 0;
  if (dp) dispHoldPrev = dp.slice();
  dispHoldSteps.push(step); if (dispHoldSteps.length > 3) dispHoldSteps.shift();
  dispHoldN++;
  // a fix reporting no speed is no evidence either way: it neither engages nor releases on speed
  const spd = (typeof speed === 'number' && isFinite(speed)) ? speed : null;
  if (!dispHoldPt) {
    if (spd !== null && spd < 0.5) {
      dispHoldLow++;
      // engage: 2 slow fixes, last 3 steps under 0.3 m (the settled test excludes the arrival glide)
      if (dispHoldLow >= 2 && dispHoldN >= 4 && dispHoldSteps.length >= 3 && dispHoldSteps.every(s => s < 0.3) && dp) { dispHoldPt = dp.slice(); dispHoldRaw = ll.slice(); dispHoldFast = 0; dispHoldFar = 0; }
    } else dispHoldLow = 0;
    return;
  }
  dispHoldFast = (spd !== null && spd >= 0.5) ? dispHoldFast + 1 : 0;
  dispHoldFar = (dispHoldRaw && distM(ll, dispHoldRaw) > 1.5) ? dispHoldFar + 1 : 0;
  // exit: one moving-speed fix, two at creep threshold, or real raw travel (measured jumps 0.20-1.18 m)
  if ((spd !== null && spd >= 0.8) || dispHoldFast >= 2 || dispHoldFar >= 2) { dispHoldPt = null; dispHoldRaw = null; dispHoldLow = 0; dispHoldFast = 0; dispHoldFar = 0; }
}
// the driving road snap (Andrew's ask + the map-matching study):
// driving, the puck drifts off the drawn road - measured on Andrew's two real logged drives,
// the DISPLAYED position sat a median 5.2 m (arterials) / 2.9 m (residential) off the nearest
// centreline, past 3.5 m for 59% / 41% of moving fixes, with sustained 6-9 m runs on Highway
// 27. The big apps answer this with map matching over a road graph; this app has no graph,
// and the study's continuity-hold matcher - proven in simulation on those same two drives
// (shown point within 3.5 m of the true road on 98.1% / 99.1% of engaged fixes, longest
// wrong-road lock 2-3 fixes) - is what ships here, in the study's design (b) shape: an
// explicit DRIVING state wrapping the hold, DISPLAY-ONLY throughout.
// THE INVARIANT (the 2026-11-13 rejection, reaffirmed by the study): the recorded position
// is never snapped. Coverage, trail, distance banking and the fix logger read gpsPos /
// dispPos exactly as before - the snap is a second presentation transform inside
// dispShownPos, beside the stillness hold, reachable only by rendered consumers. Three
// guarantees keep the driveway objection dead: (1) that data path - a snapped value has no
// route to any record; (2) the speed gate - engagement needs driving speed on EVERY fix
// (one sub-gate fix releases outright), while plow work runs 0.5-3 m/s; (3) the hard exit -
// a clean running makes snapping impossible, full stop (snapFix's runStart gate, and
// startClean calls snapReset at the tap itself, before the clean's first fix).
// ENTRY FORM (measured deviation from the study's (b) example, evidence in the build
// record): the study sketched a multi-fix sustained entry (~5 s); priced against the
// acceptance bars before this build, a 2-fix entry delay costs Drive 1 to 0.98113 and a
// 3-fix delay to 0.98077 against the study's 0.98148 - both below the bar. The shipped
// form therefore enters on the FIRST qualifying fix (the exact form the study simulated
// and the replay sample showed) and carries "sustained" the sim's way: the gate is
// re-earned on every single fix, so a hold can only ever persist through continuously
// driving-speed fixes. The switch margin (3 m x 3 fixes), the drop distance (18 m), the
// engage distance (12 m) and the speed gate (4 m/s) are the study's values exactly.
// ROAD DATA: the index is built from what the app itself holds - the ACTIVE ROUTE's street
// lines (always resident) plus the SHIPPED CITY PACK for the city containing the fix,
// loaded through the create flow's own pack loader (crPackLoad; one same-origin download
// per session per city, the download create mode already performs; packs are network-only
// by the service worker's design, so a failed load simply means no snap - silently,
// today's behaviour). Outside the twelve pack cities and the route's streets the app
// holds no road geometry, so nothing snaps there. Stale geometry degrades the same way:
// "no candidate nearby" is always answered with the true position, never a guess.
const SNAP_SPEED_MPS = 4; // the driving-speed gate: engage and hold are re-earned on every fix at or above it; one fix below it releases
const SNAP_ENGAGE_M = 12; // a candidate road must be within this of the fix to take the hold
const SNAP_DROP_M = 18; // the hold drops when the fix is farther than this from the held road
const SNAP_SWITCH_M = 3; // a rival road must beat the held road's distance by this margin...
const SNAP_SWITCH_N = 3; // ...on this many consecutive fixes to take the hold (the parallel-road / merge defence)
// engagement needs accuracy at least this good (inert on the acceptance drives: their fixes report 12-14 m)
const SNAP_ACC_M = 20;
const SNAP_FAR_M = 10; // evidence timeout: fixes farther than this from the held road...
// this many in a row release the hold even with no rival (inert on the acceptance drives)
const SNAP_FAR_N = 5;
// the point eases between truth and centreline over ~this long, both ways: blends, never a teleport
const SNAP_BLEND_S = 0.8;
let snapHeld = null; // the held road: { name, pts } - ONE polyline (one street run of the index), or null
let snapRival = null; // the switch challenger: { poly, n } - the rival polyline and its consecutive margin wins
let snapFar = 0; // consecutive fixes farther than SNAP_FAR_M from the held road (the evidence timeout's counter)
// the blend weight (0 = true point, 1 = centreline), advanced per frame toward the held state
let snapW = 0;
// the outgoing target, kept on a mid-blend release: the point the weight reproduces the rendered point from
let snapOutPt = null;
// what a road change eases from: the blend's origin while the weight re-rises toward the new projection
let snapAnchor = null;
// the timeout-rejected polyline: not re-takable while fixes land beyond SNAP_FAR_M (the hysteresis stops a timeout loop)
let snapReject = null;
let snapSegHint = 0; // the held line's segment the last projection landed on (the per-frame projection searches outward from here)
let snapFixN = 0; // fixes the matcher has processed (the acceptance drive's denominator guard)
// a release captures its target before the hold clears, weight-normalized: storing the rendered point would double-apply the weight
function snapDropHold() {
  if (snapW > 0.001 && dispPos) { const cur = snapBlendPt(); if (cur) snapOutPt = [dispPos[0] + (cur[0] - dispPos[0]) / snapW, dispPos[1] + (cur[1] - dispPos[1]) / snapW]; }
  snapHeld = null; snapRival = null; snapFar = 0; snapSegHint = 0; snapAnchor = null;
}
// the snap retires (watch stop, Start Clean): no blend-out - state is gone before the next frame
function snapReset() { snapDropHold(); snapW = 0; snapOutPt = null; snapAnchor = null; snapReject = null; }
function ptSegProj(p, a, b) { // ptSegM's twin (app1) that also returns the projected point, in [lat, lng]
  const ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, px = p[1] * MLNG, py = p[0] * MLAT;
  const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
  let t = L2 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  const qx = ax + vx * t, qy = ay + vy * t;
  return { d: Math.hypot(px - qx, py - qy), pt: [qy / MLAT, qx / MLNG] };
}
// ll's nearest point on the road, or null; the search widens only at the window's edge
function snapProject(ll) {
  if (!snapHeld) return null;
  const pts = snapHeld.pts; if (!pts || pts.length < 2) return null;
  let lo = Math.max(0, snapSegHint - 8), hi = Math.min(pts.length - 2, snapSegHint + 8);
  for (;;) {
    let best = null;
    for (let i = lo; i <= hi; i++) { const q = ptSegProj(ll, pts[i], pts[i + 1]); if (!best || q.d < best.d) best = { d: q.d, pt: q.pt, i }; }
    if ((best.i > lo && best.i < hi) || (lo === 0 && hi === pts.length - 2)) { snapSegHint = best.i; return best.pt; }
    lo = Math.max(0, lo - 16); hi = Math.min(pts.length - 2, hi + 16);
  }
}
// the snapped rendering at the weight, or null; during a release it is the captured outgoing target
function snapBlendPt() {
  if (!dispPos || snapW <= 0.001) return null;
  const pr = snapHeld ? snapProject(dispPos) : snapOutPt; if (!pr) return null;
  if (snapW >= 0.999) return pr;
  const org = snapAnchor || dispPos;
  return [org[0] + (pr[0] - org[0]) * snapW, org[1] + (pr[1] - org[1]) * snapW];
}
// road changes funnel here: the hint seeds from the search's segment (a 0 hint accepts far minima)
function snapTakeHold(poly, seg) {
  if (snapW > 0.001 && dispPos) { const cur = snapBlendPt(); if (cur) { snapAnchor = cur; snapW = 0; } }
  snapHeld = poly; snapSegHint = seg; snapFar = 0; snapRival = null; snapOutPt = null; snapReject = null;
}
// ---- the road index: the active route's lines + one shipped city pack, segment-gridded ----
// the catalogue once loaded ([{ slug, name, bbox }]); null before, [] when the library failed to load
let snapCat = null;
let snapCatKicked = false; // the catalogue request has been fired
let snapGeo = null; // { key, polys: [{ name, pts }], grid: Map<'gx:gy', flat [polyIdx, segIdx, ...]> } - the index the matcher reads
let snapGeoBusy = false; // an async pack build is in flight
// the last failed build (60 s cooldown: a pack retries at most once a minute, never per fix)
let snapGeoFailSlug = '', snapGeoFailAt = 0;
// a 3x3 lookup covers >= 60 m, past every decision distance: one ring is a complete search
const SNAP_CELL_M = 60;
function snapRoutePolys() { const out = []; for (const n of Object.keys(STRETCH)) { const st = STRETCH[n]; if (!st || !st.runs) continue; for (const r of st.runs) if (r.line && r.line.length > 1) out.push({ name: n, pts: r.line }); } return out; }
function snapBuildIndex(polys, key) {
  const grid = new Map();
  for (let pi = 0; pi < polys.length; pi++) { const pts = polys[pi].pts; for (let i = 0; i < pts.length - 1; i++) { const ax = pts[i][1] * MLNG, ay = pts[i][0] * MLAT, bx = pts[i + 1][1] * MLNG, by = pts[i + 1][0] * MLAT; const x0 = Math.floor(Math.min(ax, bx) / SNAP_CELL_M), x1 = Math.floor(Math.max(ax, bx) / SNAP_CELL_M), y0 = Math.floor(Math.min(ay, by) / SNAP_CELL_M), y1 = Math.floor(Math.max(ay, by) / SNAP_CELL_M); for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) { const k = gx + ':' + gy; let arr = grid.get(k); if (!arr) { arr = []; grid.set(k, arr); } arr.push(pi, i); } } }
  return { key, polys, grid };
}
function snapSlugFor(ll) { if (!snapCat) return null; for (const c of snapCat) { if (c && Array.isArray(c.bbox) && c.bbox.length === 4 && ll[0] >= c.bbox[0] && ll[0] <= c.bbox[2] && ll[1] >= c.bbox[1] && ll[1] <= c.bbox[3]) return c.slug; } return ''; }
// make the index match ll's area (async, never blocking): in flight the route-only index serves; installs drop holds
function snapGeoEnsure(ll) {
  if (!snapCat && !snapCatKicked) { snapCatKicked = true; crPackIndexLoad().then(cs => { snapCat = cs || []; }, () => { snapCat = []; }); }
  const routeKey = (typeof activeRoute !== 'undefined' && activeRoute && activeRoute.id) || '';
  const slug = snapSlugFor(ll); // null while the catalogue is in flight, '' outside every pack city
  // route streets only; the '~' key never equals a want, so the first fix after the catalogue rebuilds
  if (slug === null) { if (!snapGeo) snapGeo = snapBuildIndex(snapRoutePolys(), routeKey + '|~'); return; }
  const want = routeKey + '|' + slug;
  if (snapGeo && snapGeo.key === want) return;
  if (!slug) { snapGeo = snapBuildIndex(snapRoutePolys(), want); snapDropHold(); return; } // outside the shipped cities: the route's own streets are all the app holds here
  if (snapGeoFailSlug === slug && Date.now() - snapGeoFailAt < 60000) { if (!snapGeo) snapGeo = snapBuildIndex(snapRoutePolys(), routeKey + '|~'); return; } // this pack failed within the minute: route-only until the cooldown passes
  if (snapGeoBusy) return;
  snapGeoBusy = true;
  crPackLoad(slug).then(els => {
    snapGeoBusy = false;
    if (((typeof activeRoute !== 'undefined' && activeRoute && activeRoute.id) || '') !== routeKey) return; // the route changed while the pack downloaded: land nowhere; the next fix rebuilds for the new route
    const polys = snapRoutePolys();
    for (const el of els) { if (el && el.tags && typeof el.tags.name === 'string' && el.tags.name && Array.isArray(el.geometry) && el.geometry.length > 1) polys.push({ name: el.tags.name, pts: el.geometry.map(g => [g.lat, g.lon]) }); }
    snapGeo = snapBuildIndex(polys, want); snapDropHold();
  }, () => { snapGeoBusy = false; snapGeoFailSlug = slug; snapGeoFailAt = Date.now(); if (!snapGeo) snapGeo = snapBuildIndex(snapRoutePolys(), routeKey + '|~'); });
}
// the nearest polyline ({ poly, d, seg } or null): seg seeds every hold take
function snapNearest(ll) {
  if (!snapGeo) return null;
  const cx = Math.floor(ll[1] * MLNG / SNAP_CELL_M), cy = Math.floor(ll[0] * MLAT / SNAP_CELL_M);
  const best = new Map();
  for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) { const arr = snapGeo.grid.get(gx + ':' + gy); if (!arr) continue; for (let j = 0; j < arr.length; j += 2) { const poly = snapGeo.polys[arr[j]]; const d = ptSegM(ll, poly.pts[arr[j + 1]], poly.pts[arr[j + 1] + 1]); const cur = best.get(arr[j]); if (!cur || d < cur.d) best.set(arr[j], { d, seg: arr[j + 1] }); } }
  let bp = null, bd = Infinity, bs = 0; for (const [pi, b] of best) if (b.d < bd) { bd = b.d; bp = snapGeo.polys[pi]; bs = b.seg; }
  return bp ? { poly: bp, d: bd, seg: bs } : null;
}
function snapHeldDist(ll) { let bd = Infinity; const pts = snapHeld.pts; for (let i = 0; i < pts.length - 1; i++) { const d = ptSegM(ll, pts[i], pts[i + 1]); if (d < bd) bd = d; } return bd; }
// fed per fix beside dispHoldFix: the state machine on the fix, plus the accuracy gate and timeout
function snapFix(speed, acc, ll) {
  snapFixN++;
  // a clean is a hard exit: snapping is impossible throughout, and startClean reset the snap at the tap
  if (runStart) { snapDropHold(); return; }
  const spd = (typeof speed === 'number' && isFinite(speed)) ? speed : null;
  if (spd === null || spd < SNAP_SPEED_MPS) { snapDropHold(); return; } // no driving evidence (or none reported): the hold cannot survive it - the gate is re-earned on every fix
  snapGeoEnsure(ll);
  if (!snapGeo) { snapDropHold(); return; }
  const near = snapNearest(ll);
  if (!snapHeld) {
    if (near && near.d <= SNAP_ENGAGE_M && acc <= SNAP_ACC_M && !(near.poly === snapReject && near.d > SNAP_FAR_M)) snapTakeHold(near.poly, near.seg);
    return;
  }
  let hd = snapHeldDist(ll);
  if (hd > SNAP_DROP_M) { // the held road is gone: drop it, and let this fix take a candidate if one is close
    snapDropHold();
    // the accuracy gate guards this take too: an unreliable fix releases, it does not lock onto another road
    if (near && near.d <= SNAP_ENGAGE_M && acc <= SNAP_ACC_M && !(near.poly === snapReject && near.d > SNAP_FAR_M)) { snapTakeHold(near.poly, near.seg); hd = snapHeldDist(ll); } else return;
  }
  // the timeout: persistently far, no rival - release to truth and reject the road, or it loops forever
  if (hd > SNAP_FAR_M) { if (++snapFar >= SNAP_FAR_N) { const rej = snapHeld; snapDropHold(); snapReject = rej; return; } } else snapFar = 0;
  if (near && near.poly !== snapHeld && hd - near.d >= SNAP_SWITCH_M && !(near.poly === snapReject && near.d > SNAP_FAR_M)) {
    if (snapRival && snapRival.poly === near.poly) snapRival.n++; else snapRival = { poly: near.poly, n: 1 };
    if (snapRival.n >= SNAP_SWITCH_N) snapTakeHold(near.poly, near.seg);
  } else snapRival = null;
}
function renderTick(now) {
  // the predicted track at this frame: between fixes it advances on estimated velocity, so the dot flows
  const pred = kfPredict();
  if (pred) {
    const pNow = performance.now();
    const dtF = lastDispAt ? Math.min(0.25, Math.max(0, (pNow - lastDispAt) / 1000)) : 0; lastDispAt = pNow;
    if (dtF > 0 && !dispSettled()) { const k = Math.pow(0.2, dtF / 0.3); dispOff = [dispOff[0] * k, dispOff[1] * k]; if (dispSettled()) dispOff = [0, 0]; } // the correction offset decays with a ~0.3 s time constant, on the same performance clock the prediction reads
    dispPos = [pred[0] + dispOff[0] / MLAT, pred[1] + dispOff[1] / MLNG];
    { const tgt = snapHeld ? 1 : 0; if (dtF > 0 && snapW !== tgt) { snapW = tgt + (snapW - tgt) * Math.pow(0.1, dtF / SNAP_BLEND_S); if (Math.abs(snapW - tgt) < 0.002) snapW = tgt; if (snapW === 0) snapOutPt = null; else if (snapW === 1) snapAnchor = null; } } // Beta 1.204: the snap blend advances per frame toward the held state (in on engage, out on release - the same ease both ways, so the shown point never teleports), on this same frame clock and step (dtF) as the correction decay above
  }
  // the camera state joins the push key, bucketed: every projection input is in it, so any change re-pushes
  let camKey = '';
  if (map) { camKey = Math.round(map.getZoom() * 4) / 4 + ',' + Math.round(map.getBearing() * 2) / 2 + ',' + Math.round(map.getPitch() / 2) * 2 + ',' + map.getCanvas().clientWidth + 'x' + map.getCanvas().clientHeight; if (dispPos) { const pp = map.project([dispShownPos()[1], dispShownPos()[0]]); camKey += ',' + Math.round(pp.x / 16) + ':' + Math.round(pp.y / 16); } } // Beta 1.194: the puck's projected position is the RENDERED point (dispShownPos) - keyed on what is actually drawn, so a held puck does not re-push frames for display-track motion nobody sees
  // the key carries the painted beam rot: the spring repaints through this gate, stopping when it rests
  const key = dispPos ? dispShownPos()[0] + ',' + dispShownPos()[1] + ',' + (beamDeg != null ? Math.round(beamDeg * 10) / 10 : facingDeg) + ',' + gpsAccM + ',' + camKey : '';
  if (key !== lastPushKey) { lastPushKey = key; pushGps(); } // redraw the dot/ring/beam only when something actually moved - the old timers rebuilt it on every tick regardless
  beamTick(now); followCam(now); headCam(now); syncCentreBtn();
}
function renderLoop(now) {
  lastFrameAt = now;
  renderTick(now);
  // nothing left to animate (springs included): the loop parks until the next fix or GPS start
  if (watchId == null && dispSettled() && camSpringsRest()) { renderRaf = 0; return; }
  renderRaf = requestAnimationFrame(renderLoop);
}
function startRenderLoop() { if (!renderRaf) { lastCamAt = lastFrameAt = performance.now(); renderRaf = requestAnimationFrame(renderLoop); } if (!renderPump) renderPump = setInterval(() => { if ((watchId != null || !dispSettled()) && performance.now() - lastFrameAt > 100) renderTick(performance.now()); if (watchId == null && dispSettled() && camSpringsRest() && !renderRaf) { clearInterval(renderPump); renderPump = 0; } }, 100); } // the pump is a starvation fallback only: a browser that is not painting (headless, occluded) delivers no animation frames, and the GPS state must still advance - on a painting phone it never fires; it parks itself when nothing is left to render
// the camera glide (Andrew) - designed and measured in the camera-glide study on his own
// recorded drive): both camera chases are now critically-damped springs (the SmoothDamp form —
// Game Programming Gems 4 ch. 1.10, Unity's Mathf.SmoothDamp) instead of exponential chases. The
// old chase (close 35% of the gap per 50 ms, tau ~116 ms) applies its largest step on the FIRST
// frame of every chase — maximum velocity at the instant an error appears — which is the "abrupt,
// then settle" Andrew reported: replaying his session-2 drive through the shipped path, the worst
// bearing step measured 10.18 deg in a single frame (611 deg/s) and the smoothed centre jerk p95
// 1,021 m/s^3, every worst event within ~50 ms of a fix landing. A spring carries VELOCITY between
// frames, so a stepped target is absorbed into an S-curve: it starts at the velocity it already
// has, peaks mid-travel and lands soft. The exp term is a polynomial in omega*dt, so convergence
// is frame-rate independent exactly as the old time-based ease was. TARGETS ARE UNCHANGED —
// followCam still centres dispShownPos(), headCam still reads theta + omega*h from heading filter
// 2a; only the per-frame controllers changed. The estimator, 2a, the stillness hold and the
// display track (the dispOff decay - its own follow-up, deliberately not here) are
// untouched.
// the spring's velocity, carried between frames; zeroed whenever the follow is not the owner, so re-engages rest-start
let camVel = [0, 0];
let camBVel = 0; // the bearing spring's velocity state (deg/s), same rule
// a traverse suspends the cap while error exceeds 25 m: capped, a 1 km gap crawls ~50 s
let camUncapped = false;
// one spring step, [value, velocity]: the overshoot guard pins the value, leaving the velocity as computed
function camSmoothDamp(cur, tgt, vel, smoothTime, dt) {
  const omega = 2 / smoothTime, x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - tgt;
  const temp = (vel + omega * change) * dt;
  const nvel = (vel - omega * temp) * exp;
  let out = tgt + (change + temp) * exp;
  if ((tgt - cur > 0) === (out > tgt)) out = tgt;
  return [out, nvel];
}
// the spring runs in delta space (0 = at cur), so the 360/0 seam never exists inside it
function camSmoothDampAngle(cur, tgt, vel, smoothTime, dt) {
  const r = camSmoothDamp(0, headDelta(cur, tgt), vel, smoothTime, dt);
  return [cur + r[0], r[1]];
}
// the parking test: at rest when neither spring carries meaningful velocity, so the loop never parks mid-glide
function camSpringsRest() { return Math.hypot(camVel[0], camVel[1]) < 0.25 && Math.abs(camBVel) < 0.5; }
function followCam(now) {
  // the no-map guard: unguarded, getCanvas() threw on a fix in the map-failure world before the fix could record
  if (!map || !dispPos || followPaused || watchId == null) { lastCamAt = now; camVel = [0, 0]; camUncapped = false; return; }
  const dt = Math.min(100, Math.max(1, now - lastCamAt)) / 1000; lastCamAt = now;
  // the spring works in world metres (zoom-independent); the centre reads fresh per frame, absorbing outside moves
  const c = map.getCenter(); const cx = c.lng * MLNG, cy = c.lat * MLAT;
  // the target is the rendered point: while held, the camera rests with the puck, not the track
  const tgt = dispShownPos(); const tx = tgt[1] * MLNG, ty = tgt[0] * MLAT;
  const err = Math.hypot(tx - cx, ty - cy);
  // the exemption engages on the error, however the gap arose: the cap governs corrections (<= 25 m) only
  if (err > 25) camUncapped = true;
  // the return has closed into correction range (25 m exceeds every self-made re-anchor): the cap governs again
  if (camUncapped && err < 25) camUncapped = false;
  // skip only when error and velocity are both ~0: the rest threshold replaced the juddering deadband
  if (err < 0.05 && Math.hypot(camVel[0], camVel[1]) < 0.25) return;
  // smoothTime 0.32 s: lag ~323 ms median on the judged drive, offset p95 ~5 px at z17
  const sx = camSmoothDamp(cx, tx, camVel[0], 0.32, dt), sy = camSmoothDamp(cy, ty, camVel[1], 0.32, dt);
  camVel = [sx[1], sy[1]];
  let nx = sx[0], ny = sy[0];
  // the cap is relative to speed: travel clamps to (20 + lastFixSpd), velocity left as computed
  const step = Math.hypot(nx - cx, ny - cy), maxStep = (20 + lastFixSpd) * dt;
  if (!camUncapped && step > maxStep) { const k = maxStep / step; nx = cx + (nx - cx) * k; ny = cy + (ny - cy) * k; }
  map.jumpTo({ center: [nx / MLNG, ny / MLAT] });
}
// the re-centre button exists only while suspended (location on, position known, follow yielded); re-synced every tick
function syncCentreBtn() { const b = $('centreBtn'); if (b) b.classList.toggle('hidden', !(watchId != null && followPaused && !!dispPos)); }
// re-engage from rest: the spring is the ease back (no snap), cap-exempt until under 25 m
function resumeFollow() { if (watchId == null || !followPaused) return; followPaused = false; camVel = [0, 0]; camBVel = 0; camUncapped = true; syncCentreBtn(); startRenderLoop(); }
onMapReady(() => map.on('dragstart', () => { followPaused = true; syncCentreBtn(); }));
// 'it locks and I'm not able to move around while I'm moving' (Andrew's drive report):
// the dragstart above almost never fires while following - followCam's panBy on every frame keeps
// resetting MapLibre's drag-pan handler mid-gesture, so the drag never registers (measured in the
// rig: GPS on + following = dragstart x0 across a full drag; GPS off = it fires at once). Suspension
// therefore ALSO listens to the raw pointer stream, which no camera move can eat: a press on the
// canvas that moves >10 px yields the camera to the user, pan AND bearing both (the old dragend
// northUp haul is gone - while suspended the map stays exactly where he put it), until he re-centres.
// the press itself suspends (map movable from the first pixel); the >10 px rule remains as backstop

onMapReady(() => { const c = map.getCanvas(); let press = null; // {x, y, id} - the ONE pointer that pressed the canvas
  // multi-touch policy, stated explicitly: only the pointer
  // that pressed the canvas can suspend the follow, and only ITS moves count. A second
  // pointerdown while a press is armed is IGNORED - it never re-arms the press, and its
  // moves never suspend (a finger resting or moving on an overlaid panel, or the second
  // half of a pinch, cannot take the camera). If the ARMING finger itself travels >10 px -
  // including as one half of a pinch - the follow suspends: that finger is on the map and
  // moving it, which is exactly the claim this seam exists for. Only the arming pointer's
  // own up/cancel releases the press.
  // the press takes the camera (no 10 px toll); the re-centre button lights in the same instant
  c.addEventListener('pointerdown', e => { if (!press) { press = { x: e.clientX, y: e.clientY, id: e.pointerId }; if (watchId != null && !followPaused) { followPaused = true; syncCentreBtn(); } } });
  window.addEventListener('pointermove', e => { if (press && e.pointerId === press.id && !followPaused && (Math.abs(e.clientX - press.x) > 10 || Math.abs(e.clientY - press.y) > 10)) { followPaused = true; syncCentreBtn(); } });
  window.addEventListener('pointerup', e => { if (press && e.pointerId === press.id) press = null; });
  window.addEventListener('pointercancel', e => { if (press && e.pointerId === press.id) press = null; });
  c.addEventListener('wheel', () => { if (!followPaused) { followPaused = true; syncCentreBtn(); } }, { passive: true }); });
// HEADING-UP (Andrew): whenever location is on and the camera follows, run or not, the map rotates

// so his direction of travel points up - course-up from the GPS course, not the compass and not true
// north: 'my north' is wherever he is heading. Smoothed around the circle so low-speed wobble can't spin
// the map; under ~1 m/s the course is unreliable, so the map just holds its last bearing.
let smHeading = null;
// when the prior fix landed: the heading path is sized by the time between fixes, not fix count
let lastHeadFixAt = 0;
// the performance-clock twin of lastHeadFixAt - headCam's camera lead is measured on the frame clock
let lastHeadFixPerf = 0;
// the filter state beside smHeading (theta stays there): {om turn rate, p00..p11 covariance, gate last gated innovation}
let headF = null;
// 2a's process noise (deg^2/s^3), the replay-proven configuration; the mandated fallback on guard failure is q = 100
const HEAD_Q = 400;
// course noise falls with speed: at rest the course is stale or absent, at speed it sharpens
function headSigma(v) { return 6 + 18 / Math.max(v, 0.5); }
function headDelta(a, b) { return ((((b - a + 180) % 360) + 360) % 360) - 180; }
function updateHeading(hdg, speed, now) {
  // state is maintained whenever location is on, not only in a run; suspended, it freezes with the camera
  if (followPaused) return;
  // a speedless fix is no evidence of motion: it takes the hold branch, the course treated as stale
  const spd = (typeof speed === 'number' && isFinite(speed)) ? speed : 0;
  // no course here: a stopped state's turn rate must still decay, or headCam extrapolates it forever
  if (typeof hdg !== 'number' || isNaN(hdg)) {
    if (headF && smHeading !== null && spd < 1) { const dt = Math.min(3, Math.max(0.05, (now - lastHeadFixAt) / 1000)); lastHeadFixAt = now; lastHeadFixPerf = performance.now(); headF.om *= Math.pow(0.5, dt); headF.gate = 0; }
    return;
  }
  if (smHeading === null || !headF) { smHeading = hdg; headF = { om: 0, p00: headSigma(spd) ** 2, p01: 0, p10: 0, p11: 900, gate: 0 }; lastHeadFixAt = now; lastHeadFixPerf = performance.now(); return; }
  // the clamp is the smoother's (inert on the real drives); it bounds the predict after a long silence
  const dt = Math.min(3, Math.max(0.05, (now - lastHeadFixAt) / 1000)); lastHeadFixAt = now; lastHeadFixPerf = performance.now();
  // under ~1 m/s the course is unreliable: theta holds, the rate decays, no reverse-specific handling exists
  if (spd < 1) { headF.om *= Math.pow(0.5, dt); headF.gate = 0; return; }
  // the EMA lagged a
  // steady turn by omega * tau (tau = 2.32 s - the 60 deg peak the field test measured) and
  // chased the OS course's STEPS for 5-9 s after every corner on Andrew's real drives (52 of
  // 659 fixes over 20 deg out). This filter carries the turn rate as a state: predict theta
  // forward by omega * dt, weigh each course fix by R = sigma(v)^2, soften outliers through
  // the gate below - a steady turn then has no lag to chase, and a genuine step is classified
  // as a manoeuvre within two fixes by the step escape.
  const q = HEAD_Q;
  const p00 = headF.p00 + dt * (headF.p10 + headF.p01) + dt * dt * headF.p11 + q * dt ** 3 / 3;
  const p01 = headF.p01 + dt * headF.p11 + q * dt * dt / 2;
  const p10 = headF.p10 + dt * headF.p11 + q * dt * dt / 2;
  const p11 = headF.p11 + q * dt;
  const y = headDelta(smHeading + headF.om * dt, hdg);
  let R = headSigma(spd) ** 2, S = p00 + R;
  if (Math.abs(y) > 3 * Math.sqrt(S)) { // the soft gate: a lone large innovation is probably noise - down-weight it ninefold...
    // a second consecutive same-sign innovation is a manoeuvre, not noise (the step escape): accept at normal R
    if (!(headF.gate !== 0 && (y > 0) === (headF.gate > 0))) { R *= 9; S = p00 + R; }
    headF.gate = y;
  } else headF.gate = 0;
  const K0 = p00 / S, K1 = p10 / S;
  smHeading = smHeading + headF.om * dt + K0 * y;
  // the turn-rate clamp: a plow turns slowly - anything faster is a course step, its overshoot bounded
  headF.om = Math.max(-40, Math.min(40, headF.om + K1 * y));
  headF.p00 = (1 - K0) * p00; headF.p01 = (1 - K0) * p01; headF.p10 = p10 - K1 * p00; headF.p11 = p11 - K1 * p01;
}
// heading-up is applied per render tick, fractionally, in the same pipeline
// as followCam's pan. The old form was a map.easeTo fired from updateHeading - but a camera
// ease is cancelled by the next panBy, and while following, followCam pans on nearly every
// frame, so the rotation starved whenever the dot was off-centre (measured in the rig:
// smHeading chased 90 -> 170 while the bearing sat at 90). Tick application rides with the
// pan instead of fighting it, and is frame-smooth like the rest of the follow.
let lastHeadAt = 0;
function headCam(now) {
  // no-map guard; the bearing spring zeroes whenever headCam is not the owner, so re-engages start from rest
  if (!map || watchId == null || followPaused || smHeading === null) { lastHeadAt = now; camBVel = 0; return; }
  const cur = map.getBearing();
  // the camera reads theta + omega * h (the rate leads between fixes, capped at 1 s)
  const h = lastHeadFixPerf ? Math.min(1, Math.max(0, (performance.now() - lastHeadFixPerf) / 1000)) : 0;
  const tgt = smHeading + (headF ? headF.om : 0) * h;
  const d = headDelta(cur, tgt);
  const dt = Math.min(100, Math.max(1, now - (lastHeadAt || now))) / 1000; lastHeadAt = now;
  // the rest threshold replaces the deadband: skip only when error and velocity are ~0, never parking mid-swing
  if (Math.abs(d) < 0.02 && Math.abs(camBVel) < 0.5) return;
  // smoothTime 0.22 s (bearing step 10.18 -> 4.50 deg at parity); no slew cap - simulated and rejected
  const r = camSmoothDampAngle(cur, tgt, camBVel, 0.22, dt);
  camBVel = r[1];
  map.jumpTo({ bearing: r[0] });
}
// no-map tolerance as pushGps: a map-less finish must reach its transaction, not throw here
function northUp() { smHeading = null; camBVel = 0; if (!map) return; if (Math.abs(map.getBearing()) > 0.5) map.easeTo({ bearing: 0, duration: 400 }); }
// ===== POSITION FILTER =====
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
// where the estimator's motion model says we are at THIS instant - the estimate
// extrapolated along its own velocity from the last fix. This (not the raw estimate) is what
// the display draws, so between fixes the dot coasts instead of freezing at the last one.
// The horizon is capped at 2.5 s: if fixes stop arriving the dot stops too, a little past
// the last one, instead of sailing away on a stale velocity. A reacquisition (the filter
// voiding itself above: >10 s silence or a >75 m jump) reports snap instead, and the
// display takes the new position immediately.
function kfPredict() { if (!kf) return null; const h = Math.min(Math.max((performance.now() - kf.atF) / 1000, 0), 2.5); return [(kf.oy + kf.y.p + kf.y.v * h) / MLAT, (kf.ox + kf.x.p + kf.x.v * h) / MLNG]; }
// ===== FACING =====
// One funnel for every facing source, smoothed around the circle so the beam never
// snaps. Sources: the GPS course while moving (truest inside a steel vehicle), the
// device compass while still. On iOS the compass needs a permission granted from a
// tap, so it is requested from startGps - a genuine user gesture.
let facingDeg = null, lastCourseAt = 0, compassOn = false;
// the puck's direction light stepped about once a second -
// facingDeg only moves when a fix or compass event lands, while the position and the camera
// glide per frame. beamDeg is the beam's RENDERED angle: a critically-damped spring
// (camSmoothDampAngle - the camera bearing spring's own controller, the same 0.22 s smoothTime)
// chases facingDeg on every rendered frame, so a turn sweeps continuously between fixes and
// lands exactly on facingDeg at rest. Presentation only: facingDeg, the recorded position,
// the position glide and the camera are untouched, and the spring converges to the same
// heading - no accuracy is added or taken away.
let beamDeg = null, beamVel = 0, lastBeamAt = 0;
function beamTick(now) {
  if (facingDeg == null) { beamDeg = null; beamVel = 0; lastBeamAt = now; return; }
  if (beamDeg == null) { beamDeg = facingDeg; beamVel = 0; lastBeamAt = now; return; } // first sighting: start on the heading, never sweep to it
  const dt = Math.min(100, Math.max(1, now - lastBeamAt)) / 1000; lastBeamAt = now;
  if (Math.abs(headDelta(beamDeg, facingDeg)) < 0.02 && Math.abs(beamVel) < 0.5) { if (beamDeg !== facingDeg) { beamDeg = facingDeg; beamVel = 0; } return; } // at rest: land exactly and stop (headCam's rest rule)
  const r = camSmoothDampAngle(beamDeg, facingDeg, beamVel, 0.22, dt);
  beamDeg = ((r[0] % 360) + 360) % 360; beamVel = r[1];
}
function setFacing(deg, w) {
  if (typeof deg !== 'number' || isNaN(deg)) return;
  const before = facingDeg;
  facingDeg = facingDeg === null ? deg : ((facingDeg + headDelta(facingDeg, deg) * (w || 0.3)) % 360 + 360) % 360;
  if (watchId != null && dispPos && (before === null || Math.abs(headDelta(before, facingDeg)) > 1.5)) pushGps();
}
// the orientation handler is a stable reference so stopGps can remove it (a per-start closure never was)
let compassHandler = null, compassGen = 0;
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
// ===== RAW FIX LOG - a DEBUGGING instrument =====
// pass's recommendation): every GPS verdict so far rests on a simulator whose fixes are
// white noise; a real phone's fixes are autocorrelated, and only the phone's own record can
// say by how much. This log is that record: EVERY fix the watch delivers, captured in
// acceptFix BEFORE any gate (the finite/on-Earth check, the out-of-order drop, the accuracy
// gate) can refuse it — the raw input exactly as delivered (timestamp, lat, lng, reported
// accuracy, speed, course — nulls kept, they are data: a stationary fix reporting no speed
// is half of what a replay needs) — with the estimator's outputs for the same fix beside it
// (filtered position, display position, smoothed heading), so a replay compares raw against
// filtered without re-deriving either. Segmented by SESSION (one locate-on period, opened
// by startGps, closed by stopGps; each session stamps the app version that recorded it) and
// every fix carries the Start-Clean run stamp live at its delivery (0 = no clean running),
// so cleans are marked inside the stream. BOUNDARY (the trail's standing rule, identically):
// on-device only, it rides inside Andrew's own backup JSON and NOWHERE else — there is NO
// display, export or share surface for it anywhere in the app; it leaves the phone only
// inside a backup he exports and hands over himself. It is debug data, not clean data:
// capped at FIXLOG_MAX fixes and FIXLOG_MAX_CHARS stored characters (app1) with
// oldest-session eviction, where cleans are unlimited. And it is a pure observer: every entry point is failure-isolated (a logging
// fault fails silent and can never touch the estimator, camera, trail or the distance counter), the
// per-fix cost is one in-memory append, and persistence rides the trail's throttled flush.
// Entry shape: [timestamp, lat, lng, accuracy, speed, heading, out, run] — out is null
// until the estimator has run on the fix (a gated fix keeps null forever: delivered,
// refused, and the refusal is itself replay data), else [filteredLat, filteredLng,
// displayLat, displayLng, smoothedHeading] at the trail's precision.
let fixLog = [], fixLogSession = null, fixLogCount = 0;
// records only while this flag is on: runtime-only, off at boot, never stored; the gate is fixLogRaw
let fixLogEnabled = false;
function fixLogIsEnabled() { return fixLogEnabled; }
// flipping off stops recording at the next fix without closing the session or touching the stored log
function fixLogSetEnabled(on) { fixLogEnabled = !!on; }
// ===== the fix log's STORED form ("e3") =====
// 1.189 stored the log as plain JSON of the in-memory sessions (~169 characters/fix
// at full precision), and WebKit's localStorage quota is 5 MB per origin with
// strings persisted as UTF-16 — 2 bytes per character, so the WHOLE origin holds
// 2,500,000 characters (LocalStorageManager's quota constant; webkit.org bug
// 245479, comment 5). A plain 36,000-fix log alone would need ~6.1M characters.
// The e3 form is a LOSSLESS packed encoding of exactly the same in-memory
// sessions, applied only at the storage boundary: saveFixLog encodes, the boot
// load below and canonicalFixLog (app4) decode through fixLogDecodeSessions, and
// everything in between (fixLogRaw, fixLogOut, fixLogTrim) works on the absolute
// in-memory entries exactly as in 1.189. The record is an object
// { e: 3, s: [{ v, t0, n, b, f }] } - an object, not an array, so a
// 1.189 build that meets an e3 record ignores it whole (its loader required an
// array) instead of misreading packed data as absolute fixes; this decoder
// accepts BOTH forms, so every 1.189 record and backup still loads and restores.
// Inside a session, f is the session's entry byte stream packed 7 bits per
// character (code points 0x100-0x17F, all single UTF-16 units needing no JSON
// escape); b is the stream's byte length and n the entry count, so a decoder can
// prove it consumed exactly what was written. The byte stream is a chain of
// entries in a small varint code (LEB128; signed values zigzag):
// - a flags byte: keyframe / estimator output present / output in full form /
//   run stamp carried by this entry.
// - keyframes carry absolute values; delta entries carry the millisecond gap
//   and the SIGNED DIFFERENCE OF THE COORDINATES' IEEE-754 BIT PATTERNS — decode
// adds it back onto the prior fix's pattern and recovers the EXACT double,
//   bit for bit. An entry that cannot delta (a null or non-finite coordinate on
//   either side — a refused fix — a non-integer timestamp, or a bit delta beyond
//   2^53) is written as a keyframe instead.
// accuracy/speed/heading ride as bit-pattern deltas against the prior fix
//   (tag 1), an absolute pattern (tag 2), or the null tag (0) — non-finite leaf
//   values collapse to null, exactly as JSON serialization treated them in v1.
// - the estimator output rides as micro-degree integer deltas of the four
//   positions plus a tenths delta of the heading (fixLogOut only ever writes
//   6dp positions and a 1dp heading, so the integers restore them exactly);
//   whenever a delta would not restore a value exactly, the full form carries
//   the absolutes instead (micro-degree integers, or raw bit patterns when a
//   value is not even on the micro grid).
// The decoder is the ONE lens for the boot load and the backup validator, as in
// 1.189: leaf fields pass the number-or-null lens (a null coordinate survives —
// the refusal data); a structurally broken entry ends
// its session there (later entries chain from it and cannot be recovered) —
// never the boot, never the other sessions. Sizing is enforced by TWO caps
// (app1): FIXLOG_MAX fixes, and FIXLOG_MAX_CHARS characters of stored record —
// the logger keeps an exact per-entry byte account as it appends, so the
// character cap is enforced on the packed size itself, not on a hope about
// stream density. Measured on worst-case-realistic full-precision streams:
// ~48 characters/fix at transit speed with stepwise accuracy (~55 with accuracy
// jumping full-range every fix — a harsher model than the OS produces), ~44 at
// plow pace, ~33 parked; drive194 asserts the measured characters against the
// quota arithmetic in FIXLOG_MAX_CHARS' comment.
const _fxDv = new DataView(new ArrayBuffer(8));
function _fxBits(x) { _fxDv.setFloat64(0, x); return _fxDv.getBigInt64(0); }
function _fxUnbits(b) { _fxDv.setBigInt64(0, b); return _fxDv.getFloat64(0); }
function _fxUBits(x) { _fxDv.setFloat64(0, x); return _fxDv.getBigUint64(0); }
function _fxUUnbits(b) { _fxDv.setBigUint64(0, b & 0xFFFFFFFFFFFFFFFFn); return _fxDv.getFloat64(0); }
function _fxFin(x) { return typeof x === 'number' && isFinite(x); }
function _fxMuExact(v) { return _fxFin(v) && Math.round(v * 1e6) / 1e6 === v; } // an output position survives micro-degree delta encoding exactly
function _fxHtExact(v) { return _fxFin(v) && Math.round(v * 10) / 10 === v; } // an output heading survives tenths delta encoding exactly
const _FX_LIM = 1n << 53n;
function _fxDelta(a, b) { // the signed difference of two doubles' bit patterns, or null when it cannot ride exactly
  let d = _fxUBits(a) - _fxUBits(b);
  if (d > (1n << 63n)) d -= (1n << 64n); else if (d < -(1n << 63n)) d += (1n << 64n);
  return (d <= _FX_LIM && d >= -_FX_LIM) ? d : null;
}
function _FxWriter() { return { b: [], u8(v) { this.b.push(v & 255); }, uv(v) { while (v > 127n) { this.b.push(Number(v & 127n) | 128); v >>= 7n; } this.b.push(Number(v)); }, sv(n) { this.uv(n >= 0n ? n * 2n : -n * 2n - 1n); } }; }
function _FxReader(bytes) { return { b: bytes, i: 0, u8() { if (this.i >= this.b.length) throw new Error('fx eof'); return this.b[this.i++]; }, uv() { let v = 0n, s = 0n; for (;;) { const c = this.u8(); v |= BigInt(c & 127) << s; if (!(c & 128)) return v; s += 7n; if (s > 70n) throw new Error('fx varint'); } }, sv() { const u = this.uv(); return (u & 1n) === 0n ? u / 2n : -(u + 1n) / 2n; } }; }
function _fxPack7(bytes) { let out = '', acc = 0, nb = 0; for (let i = 0; i < bytes.length; i++) { acc = (acc << 8) | bytes[i]; nb += 8; while (nb >= 7) { nb -= 7; out += String.fromCharCode(0x100 + ((acc >> nb) & 127)); } acc &= (1 << nb) - 1; } if (nb > 0) out += String.fromCharCode(0x100 + ((acc << (7 - nb)) & 127)); return out; }
function _fxUnpack7(f, nbytes) { const bytes = []; let acc = 0, nb = 0; for (let i = 0; i < f.length; i++) { const v = f.charCodeAt(i) - 0x100; if (v < 0 || v > 127) throw new Error('fx pack char'); acc = (acc << 7) | v; nb += 7; while (nb >= 8) { nb -= 8; bytes.push((acc >> nb) & 255); } acc &= (1 << nb) - 1; if (bytes.length > nbytes) throw new Error('fx pack overflow'); } if (bytes.length !== nbytes) throw new Error('fx pack length'); return bytes; }
// the delta state an entry leaves for the next entry's encoding (nulls where a field cannot anchor)
function _fxState(e) {
  return { ts: _fxFin(e[0]) ? e[0] : null, latB: _fxFin(e[1]) ? _fxUBits(e[1]) : null, lngB: _fxFin(e[2]) ? _fxUBits(e[2]) : null, accB: _fxFin(e[3]) ? _fxUBits(e[3]) : null, spdB: _fxFin(e[4]) ? _fxUBits(e[4]) : null, hdgB: _fxFin(e[5]) ? _fxUBits(e[5]) : null, out: Array.isArray(e[6]) ? e[6] : null, run: _fxFin(e[7]) ? e[7] : 0 };
}
function _fxScalarW(w, v, prevB) { // one raw leaf (acc/spd/hdg): null tag, bit-pattern delta, or absolute pattern
  if (!_fxFin(v)) { w.u8(0); return; }
  const p = _fxUBits(v);
  if (prevB !== null && prevB !== undefined) { const d = _fxDelta(v, _fxUUnbits(prevB)); if (d !== null) { w.u8(1); w.sv(d); return; } }
  w.u8(2); w.uv(p);
}
function _fxScalarR(r, prevB) {
  const t = r.u8();
  if (t === 0) return null;
  if (t === 1) { if (prevB === null || prevB === undefined) throw new Error('fx scalar base'); return _fxUUnbits(prevB + r.sv()); }
  if (t === 2) return _fxUUnbits(r.uv());
  throw new Error('fx scalar tag');
}
// append an entry's bytes, returning the state the next chains from: the one encoder all follow
function _fxEncEntry(w, e, st) {
  const out = Array.isArray(e[6]) ? e[6] : null;
  let key = !st || st.latB === null || st.lngB === null || !_fxFin(e[1]) || !_fxFin(e[2]) || !Number.isInteger(e[0]) || !Number.isInteger(st.ts);
  let dLat = null, dLng = null;
  if (!key) { dLat = _fxDelta(e[1], _fxUUnbits(st.latB)); dLng = _fxDelta(e[2], _fxUUnbits(st.lngB)); if (dLat === null || dLng === null) key = true; }
  // a backwards timestamp cannot ride the unsigned gap varint - the entry keyframes instead
  if (!key && e[0] < st.ts) key = true;
  let outFull = false;
  if (out) {
    outFull = key || !st || !st.out;
    if (!outFull) {
      const p = st.out;
      for (let k = 0; k < 4 && !outFull; k++) if (!_fxMuExact(out[k]) || !_fxMuExact(p[k])) outFull = true;
      if (!outFull && (out[4] === null || out[4] === undefined) !== (p[4] === null || p[4] === undefined)) outFull = true;
      if (!outFull && out[4] !== null && out[4] !== undefined && (!_fxHtExact(out[4]) || !_fxHtExact(p[4]))) outFull = true;
    }
  }
  // BigInt(runV) throws on fractions and negatives corrupt the varint: this guard hardens the encoder boundary only
  const runV = (_fxFin(e[7]) && Number.isInteger(e[7]) && e[7] >= 0) ? e[7] : 0;
  const runCh = !st || runV !== st.run;
  w.u8((key ? 1 : 0) | (out ? 2 : 0) | (outFull ? 4 : 0) | (runCh ? 8 : 0));
  if (key) {
    // the absolute timestamp rides as its float64 bit pattern: integer, fractional or negative, the exact delivered value survives
    if (_fxFin(e[0])) { w.u8(1); w.uv(_fxUBits(e[0])); } else w.u8(0);
    if (_fxFin(e[1])) { w.u8(1); w.uv(_fxUBits(e[1])); } else w.u8(0);
    if (_fxFin(e[2])) { w.u8(1); w.uv(_fxUBits(e[2])); } else w.u8(0);
  } else { w.uv(BigInt(e[0] - st.ts)); w.sv(dLat); w.sv(dLng); }
  _fxScalarW(w, e[3], st ? st.accB : null); _fxScalarW(w, e[4], st ? st.spdB : null); _fxScalarW(w, e[5], st ? st.hdgB : null);
  if (out) {
    if (outFull) {
      const p = out;
      if (_fxMuExact(p[0]) && _fxMuExact(p[1]) && _fxMuExact(p[2]) && _fxMuExact(p[3]) && (p[4] === null || p[4] === undefined || _fxHtExact(p[4]))) {
        w.u8(0);
        for (let k = 0; k < 4; k++) w.sv(BigInt(Math.round(p[k] * 1e6)));
        if (p[4] === null || p[4] === undefined) w.u8(0); else { w.u8(1); w.sv(BigInt(Math.round(p[4] * 10))); }
      } else {
        w.u8(1);
        for (let k = 0; k < 4; k++) { if (_fxFin(p[k])) { w.u8(1); w.uv(_fxUBits(p[k])); } else w.u8(0); }
        if (_fxFin(p[4])) { w.u8(1); w.uv(_fxUBits(p[4])); } else w.u8(0);
      }
    } else {
      const p = st.out;
      for (let k = 0; k < 4; k++) w.sv(BigInt(Math.round(out[k] * 1e6) - Math.round(p[k] * 1e6)));
      if (out[4] === null || out[4] === undefined) w.u8(0); else { w.u8(1); w.sv(BigInt(Math.round(out[4] * 10) - Math.round(p[4] * 10))); }
    }
  }
  if (runCh) w.uv(BigInt(runV));
  return _fxState(e);
}
function _fxDecEntry(r, st) { // read one entry back to its absolute in-memory form; throws on any structural fault (the caller ends the session there)
  const fl = r.u8(), key = !!(fl & 1), hasOut = !!(fl & 2), outFull = !!(fl & 4), runCh = !!(fl & 8);
  let ts, lat, lng;
  if (key) {
    ts = r.u8() === 1 ? _fxUUnbits(r.uv()) : null;
    lat = r.u8() === 1 ? _fxUUnbits(r.uv()) : null;
    lng = r.u8() === 1 ? _fxUUnbits(r.uv()) : null;
  } else {
    if (!st || st.latB === null || st.lngB === null || !Number.isInteger(st.ts)) throw new Error('fx delta base');
    ts = st.ts + Number(r.uv());
    lat = _fxUUnbits(st.latB + r.sv());
    lng = _fxUUnbits(st.lngB + r.sv());
  }
  const acc = _fxScalarR(r, st ? st.accB : null), spd = _fxScalarR(r, st ? st.spdB : null), hdg = _fxScalarR(r, st ? st.hdgB : null);
  let out = null;
  if (hasOut) {
    if (outFull) {
      const t = r.u8();
      if (t === 0) { out = [0, 0, 0, 0, null]; for (let k = 0; k < 4; k++) out[k] = Number(r.sv()) / 1e6; out[4] = r.u8() === 1 ? Number(r.sv()) / 10 : null; }
      else if (t === 1) { out = [null, null, null, null, null]; for (let k = 0; k < 4; k++) out[k] = r.u8() === 1 ? _fxUUnbits(r.uv()) : null; out[4] = r.u8() === 1 ? _fxUUnbits(r.uv()) : null; }
      else throw new Error('fx out form');
    } else {
      if (!st || !st.out) throw new Error('fx out base');
      const p = st.out; out = [0, 0, 0, 0, null];
      for (let k = 0; k < 4; k++) out[k] = (Math.round(p[k] * 1e6) + Number(r.sv())) / 1e6;
      out[4] = r.u8() === 1 ? (Math.round(p[4] * 10) + Number(r.sv())) / 10 : null;
    }
  }
  const run = runCh ? Number(r.uv()) : (st ? st.run : 0);
  const e = [ts, lat, lng, acc, spd, hdg, out, run];
  return { e, st: _fxState(e) };
}
function _fxEncodeEntry(e, prev) {
  const key = ['K', e[0], e[1], e[2], _fxScalar(e[3]), _fxScalar(e[4]), _fxScalar(e[5]), e[6], Number.isFinite(e[7]) ? e[7] : 0];
  if (!prev) return key;
  const dTs = (typeof e[0] === 'number' && typeof prev[0] === 'number') ? e[0] - prev[0] : NaN;
  if (!Number.isInteger(dTs)) return key; // an unanchored or fractional timestamp cannot delta — the entry keyframes
  if (typeof e[1] !== 'number' || typeof prev[1] !== 'number' || !isFinite(e[1]) || !isFinite(prev[1]) || typeof e[2] !== 'number' || typeof prev[2] !== 'number' || !isFinite(e[2]) || !isFinite(prev[2])) return key; // a refused (null / non-finite) coordinate on either side keyframes
  const dLat = _fxBits(e[1]) - _fxBits(prev[1]), dLng = _fxBits(e[2]) - _fxBits(prev[2]), LIM = 9007199254740991n;
  if (dLat > LIM || dLat < -LIM || dLng > LIM || dLng < -LIM) return key;
  let outSlot = null;
  if (e[6]) {
    outSlot = ['F', e[6][0], e[6][1], e[6][2], e[6][3], e[6][4]];
    const p = prev[6];
    if (p && _fxMuExact(e[6][0]) && _fxMuExact(e[6][1]) && _fxMuExact(e[6][2]) && _fxMuExact(e[6][3]) && _fxMuExact(p[0]) && _fxMuExact(p[1]) && _fxMuExact(p[2]) && _fxMuExact(p[3])) {
      const d = [Math.round(e[6][0] * 1e6) - Math.round(p[0] * 1e6), Math.round(e[6][1] * 1e6) - Math.round(p[1] * 1e6), Math.round(e[6][2] * 1e6) - Math.round(p[2] * 1e6), Math.round(e[6][3] * 1e6) - Math.round(p[3] * 1e6)];
      if (e[6][4] === null || e[6][4] === undefined) outSlot = ['D', d[0], d[1], d[2], d[3], 'n'];
      else if (_fxHtExact(e[6][4]) && _fxHtExact(p[4])) outSlot = ['D', d[0], d[1], d[2], d[3], Math.round(e[6][4] * 10) - Math.round(p[4] * 10)];
    }
  }
  return [dTs, Number(dLat), Number(dLng), _fxScalar(e[3]), _fxScalar(e[4]), _fxScalar(e[5]), outSlot, e[7] === prev[7] ? null : (Number.isFinite(e[7]) ? e[7] : 0)];
}
function fixLogEncodeSessions(sessions) { return { e: 3, s: sessions.map(s => { const w = _FxWriter(); let st = null; for (const e of s.f) st = _fxEncEntry(w, e, st); return { v: s.v, t0: s.t0, n: s.f.length, b: w.b.length, f: _fxPack7(w.b) }; }) }; }
// any stored or backup value -> the absolute sessions, through the one lens; a non-log decodes to []
function fixLogDecodeSessions(parsed) {
  const numOrNull = x => (typeof x === 'number' && isFinite(x)) ? x : null;
  const sessions = [];
  const pushS = (s, fixes) => { if (fixes.length) sessions.push({ v: typeof s.v === 'string' ? s.v : '', t0: Number.isFinite(s.t0) ? s.t0 : 0, f: fixes }); };
  if (Array.isArray(parsed)) { // the v1 form: absolute entries, the 1.189 lens verbatim
    for (const s of parsed) {
      if (!s || typeof s !== 'object' || Array.isArray(s) || !Array.isArray(s.f)) continue;
      const fixes = [];
      for (const e of s.f) {
        if (!Array.isArray(e) || e.length < 6) continue;
        const out = (Array.isArray(e[6]) && e[6].length === 5) ? e[6].map(numOrNull) : null;
        fixes.push([numOrNull(e[0]), numOrNull(e[1]), numOrNull(e[2]), numOrNull(e[3]), numOrNull(e[4]), numOrNull(e[5]), out, Number.isFinite(e[7]) ? e[7] : 0]);
      }
      pushS(s, fixes);
    }
    return sessions;
  }
  if (parsed && typeof parsed === 'object' && parsed.e === 3 && Array.isArray(parsed.s)) {
    for (const s of parsed.s) {
      if (!s || typeof s !== 'object' || Array.isArray(s) || typeof s.f !== 'string' || !Number.isInteger(s.n) || s.n < 0 || !Number.isInteger(s.b) || s.b < 0) continue;
      const fixes = [];
      try {
        const r = _FxReader(_fxUnpack7(s.f, s.b));
        let st = null;
        for (let i = 0; i < s.n; i++) { const d = _fxDecEntry(r, st); fixes.push(d.e); st = d.st; }
        // the stream is consumed exactly: a length or count lie ends the session, never trusting a prefix
        if (r.i !== s.b) throw new Error('fx trailing');
      } catch (err) { continue; } // a broken packed session is dropped whole (see the e3 note) — never the boot, never the other sessions
      pushS(s, fixes);
    }
  }
  return sessions;
}
// the account lives in a WeakMap, never on the session object, so sessions keep their shape for readers
const _fxAcct = new WeakMap();
// (re)build the account by running the encoder into a scratch writer: it can never drift from storage
function _fxMeasure(s) {
  const w = _FxWriter(); let st = null; const bl = [];
  for (const e of s.f) { const before = w.b.length; st = _fxEncEntry(w, e, st); bl.push(w.b.length - before); }
  _fxAcct.set(s, { b: w.b.length, bl });
}
// the record's estimated length from the byte accounts (7 bits per character plus shells), deliberately rounded up
function fixLogEstChars() {
  let t = 48;
  for (const s of fixLog) { const a = _fxAcct.get(s); t += 80 + Math.ceil((a ? a.b : 0) * 8 / 7); }
  return t;
}
try { fixLog = fixLogDecodeSessions(parseJ(lsGet(LS.fixlog), [])); for (const s of fixLog) { fixLogCount += s.f.length; _fxMeasure(s); } } catch (e) { fixLog = []; fixLogCount = 0; } // a damaged log record costs the debug history, never the boot
// the caps (at open and every append): oldest sessions evict whole; a lone over-cap session head-trims, newest surviving
function fixLogTrim() {
  // a session that arrived without its byte account is measured before any cap is judged on it
  for (const s of fixLog) if (!_fxAcct.has(s)) _fxMeasure(s);
  while (fixLogCount > FIXLOG_MAX && fixLog.length) {
    const s = fixLog[0];
    if (fixLog.length === 1) { const drop = s.f.length - FIXLOG_MAX; if (drop > 0) { s.f.splice(0, drop); const a = _fxAcct.get(s); const rb = a.bl.splice(0, drop); let rs = 0; for (const x of rb) rs += x; a.b = Math.max(0, a.b - rs); if (s.f.length) { const w = _FxWriter(); _fxEncEntry(w, s.f[0], null); a.b += w.b.length - (a.bl[0] || 0); a.bl[0] = w.b.length; } else a.b = 0; fixLogCount -= drop; } break; } // a LONE session is head-trimmed, live or not (at boot there is no live session, and evicting a whole log for a hair over a cap would be the tail eating the dog); with several sessions the oldest still goes whole. The new head's account entry is RE-MEASURED in its keyframe form, never bumped by an allowance: an allowance the per-entry lengths never repay would accumulate on every trim and inflate the estimate until the character cap ate the log (Codex P2, PR #31)
    fixLogCount -= s.f.length; fixLog.shift();
  }
  while (fixLogEstChars() > FIXLOG_MAX_CHARS && fixLog.length) {
    const s = fixLog[0];
    if (fixLog.length === 1) {
      if (!s.f.length) break;
      const a = _fxAcct.get(s);
      // one drop per trim, walked 128 characters past the excess: under the cap in a single pass
      let drop = 0, rs = 0; const excess = fixLogEstChars() - FIXLOG_MAX_CHARS + 128;
      // the drop judges the aggregate packed size (as fixLogEstChars reads it): per-entry ceilings over-count and stop short
      const share = () => Math.ceil(a.b * 8 / 7) - Math.ceil(Math.max(0, a.b - rs) * 8 / 7);
      while (drop < s.f.length && share() < excess) { rs += (a.bl[drop] || 0); drop++; }
      if (!drop) break;
      s.f.splice(0, drop); a.bl.splice(0, drop); a.b = Math.max(0, a.b - rs); if (s.f.length) { const w = _FxWriter(); _fxEncEntry(w, s.f[0], null); a.b += w.b.length - (a.bl[0] || 0); a.bl[0] = w.b.length; } else a.b = 0; fixLogCount -= drop;
      break;
    }
    fixLogCount -= s.f.length; fixLog.shift();
  }
}
fixLogTrim(); // a log written under a larger cap (or planted) is bounded at load too
function fixLogOpen() { if (!fixLogEnabled) return; try { fixLogSession = { v: ($('ver') ? $('ver').textContent.trim() : ''), t0: Date.now(), f: [] }; _fxAcct.set(fixLogSession, { b: 0, bl: [] }); fixLog.push(fixLogSession); fixLogTrim(); markDirty('fixlog'); } catch (e) { fixLogSession = null; } }
// the fix, before any gate: returns the live entry for fixLogOut or null, faults silent to GPS
function fixLogRaw(pos) {
  try {
    if (!fixLogEnabled) return null; // THE gate - off means the fix is never recorded and the log's storage is never touched
    // the switch may have been flipped on mid-watch: open the session now, so recording starts with THIS fix
    if (!fixLogSession) fixLogOpen();
    if (!fixLogSession) return null;
    const c = pos.coords || {};
    const e = [typeof pos.timestamp === 'number' ? pos.timestamp : null, c.latitude, c.longitude, c.accuracy != null ? c.accuracy : null, c.speed != null ? c.speed : null, c.heading != null ? c.heading : null, null, runStart || 0];
    const f = fixLogSession.f, w = _FxWriter();
    _fxEncEntry(w, e, f.length ? _fxState(f[f.length - 1]) : null); // measure the entry through the one encoder, so its byte account is exact
    let a = _fxAcct.get(fixLogSession); if (!a) { a = { b: 0, bl: [] }; _fxAcct.set(fixLogSession, a); }
    f.push(e); a.bl.push(w.b.length); a.b += w.b.length; fixLogCount++; fixLogTrim(); markDirty('fixlog');
    return e;
  } catch (err) { return null; }
}
// the same fix after the estimator: gpsPos is the filtered position, dispPos the display's, smHeading the course
function fixLogOut(e) {
  try {
    if (!e) return;
    e[6] = [+gpsPos[0].toFixed(6), +gpsPos[1].toFixed(6), dispPos ? +dispPos[0].toFixed(6) : null, dispPos ? +dispPos[1].toFixed(6) : null, smHeading != null ? Math.round(smHeading * 10) / 10 : null];
    const a = fixLogSession ? _fxAcct.get(fixLogSession) : null;
    if (a) { // the output grew the entry: re-measure it and correct the byte account
      const f = fixLogSession.f; let idx = f.length - 1;
      if (f[idx] !== e) idx = f.lastIndexOf(e);
      if (idx >= 0 && a.bl[idx] !== undefined) { const w = _FxWriter(); _fxEncEntry(w, e, idx > 0 ? _fxState(f[idx - 1]) : null); a.b += w.b.length - a.bl[idx]; a.bl[idx] = w.b.length; }
    }
    // the output may have outgrown the character cap: re-apply the caps now, not at the next append
    fixLogTrim();
  } catch (err) {}
}
// the tail flushes on cadence; the no-session return is load-bearing: off must never mark the log dirty
function fixLogClose() { if (!fixLogSession) return; fixLogSession = null; markDirty('fixlog'); }
// the record lands in e3 form (the codec note at the loader); in-memory sessions stay absolute
/** @returns {StorageOutcome} */ function saveFixLog() { const ok = lsSet(LS.fixlog, JSON.stringify(fixLogEncodeSessions(fixLog))); return ok ? storeOk() : storeFail('fixlog', true); }
function acceptFix(pos) {
  // the fix is logged BEFORE every gate below - a refused fix is recorded as delivered, with no estimator output
  const fxEnt = fixLogRaw(pos);
  const now = Date.now(); const ll = [pos.coords.latitude, pos.coords.longitude]; const acc = pos.coords.accuracy || 999;
  // never let a non-finite or off-Earth fix reach the smoothing, trail or coverage math
  if (!Number.isFinite(ll[0]) || !Number.isFinite(ll[1]) || Math.abs(ll[0]) > 90 || Math.abs(ll[1]) > 180) return;
  // a delayed or out-of-order callback must not move the dot, trail or coverage backwards
  if (typeof pos.timestamp === 'number' && lastFixTs && pos.timestamp < lastFixTs) return;
  if (acc > GPS_ACCURACY_M && lastGood && now - lastGood.at < 10000) return;
  if (acc <= GPS_ACCURACY_M) lastGood = { ll, at: now };
  const speed = pos.coords.speed;
  // a live fix clears any earlier denial; the tracked-speed credit refreshes here, past every refusal return
  lastFixAt = now; if (typeof pos.timestamp === 'number') lastFixTs = pos.timestamp; gpsAccM = acc; gpsDenied = false; if (typeof speed === 'number' && isFinite(speed) && speed >= 0) lastFixSpd = speed;
  // advance the display to now on the old track first: re-anchoring stale makes the dot chase leftovers
  renderTick(performance.now());
  const { est: sm, snap } = kfUpdate(ll, acc, now); // the filter subsumes the old deadband: sub-noise moves barely shift the estimate, so no fix needs swallowing
  const firstFix = !gpsPos;
  gpsPos = sm;
  // re-anchor on the new track jump-free: the gap becomes the decaying offset; snaps take the position
  const pred = kfPredict();
  if (snap || !dispPos || !pred) { dispOff = [0, 0]; if (pred) dispPos = pred; }
  else dispOff = [(dispPos[0] - pred[0]) * MLAT, (dispPos[1] - pred[1]) * MLNG];
  // the old glide started the loop here; the coasting display needs it just as much
  startRenderLoop();
  updateHeading(pos.coords.heading, speed, now);
  // the hold's per-fix feed, at the same instant fixLogOut reads dispPos - display-only: nothing recorded reads its state
  dispHoldFix(speed, ll);
  // the snap feed, beside the hold's: raw fix in, snap state out - display-only, runs before fixLogOut
  snapFix(speed, acc, ll);
  if (typeof pos.coords.heading === 'number' && speed && speed >= 1) { lastCourseAt = now; setFacing(pos.coords.heading, 0.5); } // moving: face along the course
  // the estimator has run: filtered position, display position and smoothed heading join the fix in the log
  fixLogOut(fxEnt);
  // the speed number updates per fix only: visibility is the watch's alone; at rest it reads 0 km/h
  const spd = $('spdNum');
  spd.textContent = String(Math.round(Math.max(0, speed || 0) * 3.6)); // the bare number - the KM/H unit is the circle's own centred label now
  // a teleport voids the springs; the map guard keeps this jump from starving the recording block
  if (firstFix && map && (gpsFromRun || watchId != null) && !followPaused) { map.jumpTo({ center: [sm[1], sm[0]], zoom: Math.max(map.getZoom(), 15) }); camVel = [0, 0]; camBVel = 0; camUncapped = false; }
  // outside-route note (route box + 400 m)
  // no box (no route / empty pack) - no area to be outside of, so no note
  const inB = routeBox ? (sm[0] > routeBox.s - 0.0036 && sm[0] < routeBox.n + 0.0036 && sm[1] > routeBox.w - 0.005 && sm[1] < routeBox.e + 0.005) : true;
  if (!inB && offRouteArmed) { offRouteArmed = false; }
  if (inB) offRouteArmed = true;
  // route data is recorded ONLY by a clean's GPS - the Locate view-only watch never writes trail or coverage
  if (runStart && gpsFromRun) {
    // a stopped fix records nothing; coverage still runs, and the next fix measures from the last recorded point
    const stillFix = typeof speed === 'number' && speed >= 0 && speed < GPS_STILL_MPS;
    if (!stillFix) {
      const newPt = [+sm[0].toFixed(6), +sm[1].toFixed(6), Math.floor(now / 1000)];
      // the counter's half is the owner's (RUNDIST.record); the trail append stays in acceptFix, eviction following it
      RUNDIST.record(newPt);
      trail.push(newPt);
      // the window eviction at append: everything older than the newest point minus 60 minutes leaves, flagging nothing
      while (trail.length && trail[0][2] < newPt[2] - TRAIL_WINDOW_S) trail.shift();
      markDirty('trail');
    }
    PERSIST.flush(false);
    coverFix(sm);
  }
}
// ---- coverage caches: coverFix runs on every
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
// the suggestion offer is cut below: nothing offers a street any more; the coverage computation is untouched

let covSetsFor = null, covSets = {}, covBoxesFor = -1, covBoxes = {}, covSamplesGen = 0;
function coverFix(ll) {
  if (covSetsFor !== coveredIdx) { covSets = {}; for (const n of Object.keys(coveredIdx)) covSets[n] = new Set(coveredIdx[n]); covSetsFor = coveredIdx; }
  if (covBoxesFor !== covSamplesGen) { covBoxes = {}; const pLat = COV_RADIUS_M / MLAT, pLng = COV_RADIUS_M / MLNG; for (const n of STREETNAMES) { const pts = SAMPLES[n]; if (!pts || !pts.length) continue; let a = 1e9, b = -1e9, c = 1e9, e = -1e9; for (const p of pts) { if (p[0] < a) a = p[0]; if (p[0] > b) b = p[0]; if (p[1] < c) c = p[1]; if (p[1] > e) e = p[1]; } covBoxes[n] = [a - pLat, b + pLat, c - pLng, e + pLng]; } covBoxesFor = covSamplesGen; }
  let changed = false;
  for (const n of STREETNAMES) {
    if (streetComplete(n)) continue;
    // Array.isArray: a 'constructor' street reads the inherited function on the plain object, and new Set() throws
    const pts = SAMPLES[n]; const set = covSets[n] || (covSets[n] = new Set(Array.isArray(coveredIdx[n]) ? coveredIdx[n] : []));
    const box = covBoxes[n]; const outOfBox = box && (ll[0] < box[0] || ll[0] > box[1] || ll[1] < box[2] || ll[1] > box[3]);
    if (!outOfBox) for (let i = 0; i < pts.length; i++) { if (!set.has(i) && distM(ll, pts[i]) <= COV_RADIUS_M) { set.add(i); changed = true; } }
    if (set.size) coveredIdx[n] = [...set];
  }
  if (changed) markDirty('aux');
}
// the suggestion offer is removed (showSuggest, sugQueue, banner handlers gone); coverage still computes as before

let weakToastAt = 0;
// the Status GPS row's amber state: set by a permission denial (code 1), cleared by any accepted fix
let gpsDenied = false;
function gpsError(e) {
  if (e && e.code === 1) { gpsDenied = true; toast('Location is off - allow location for this site in your browser settings', 4200); stopGps(); return; }
  if (Date.now() - weakToastAt > 60000) { weakToastAt = Date.now(); toast('GPS signal weak - still trying', 2600); }
}
function startGps(fromRun, restart) {
  // a view-only reused for a clean must flip Locate to recording (the sync sits below this return)
  if (watchId != null) { if (fromRun) { gpsFromRun = true; $('gpsBtn').classList.add('on'); $('gpsBtn').classList.toggle('rec', true); renderIcons(); } return; }
  if (!navigator.geolocation) { toast('This device has no GPS access here', 3000); return; }
  // the stale-watch restart passes restart=true (housekeeping, not a user action): it must not clear a deliberate suspension
  gpsFromRun = !!fromRun; if (!restart) followPaused = false; lastPushKey = ''; startCompass();
  // every start records its session start (the watchdog's clock): restarts are bounded to one per stale window
  watchStartedAt = Date.now();
  // callbacks carry their watcher's generation: a queued one from a stopped watcher drops, however fresh
  const wg = ++watchGen; watchId = navigator.geolocation.watchPosition(p => { if (wg === watchGen) acceptFix(p); }, e => { if (wg === watchGen) gpsError(e); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  fixLogOpen(); // a new watch is a new log session (the stale-watch restart re-opens one too)
  // the frame-synced loop keeps centring between fixes - on the display's own clock now, not a second timer
  startRenderLoop();
  clearInterval(staleWatchTimer);
  staleWatchTimer = setInterval(() => { const silentSince = Math.max(lastFixAt, watchStartedAt); if (watchId != null && silentSince && Date.now() - silentSince > GPS_STALE_MS) { const wasRunGps = gpsFromRun; stopGps(true); startGps(wasRunGps, true); } }, 15000); // Beta 1.48 (audit B02): capture run ownership BEFORE stopGps clears it - the restart used to always come back as non-run GPS, so a mid-run watcher lost its run. Beta 1.116 (CG-115-01): the restart also preserves followPaused (startGps's restart flag) - a dead zone must not hand the camera back
  $('gpsBtn').classList.add('on');
  $('gpsBtn').classList.toggle('rec', gpsFromRun); // recording wears red on the Locate tab; view-only wears blue
  renderIcons(); // the Locate face follows the state flip at once
  // the speed gate is the watch: it appears with location on, reading 0 until a fix prices speed
  $('spdNum').textContent = '0'; $('spdPill').classList.remove('hidden');
}
function stopGps(silent) {
  watchGen++; // invalidate any callback still queued from this watcher
  fixLogClose(); // the log session ends with the watch
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  // the beam spring resets here; the hold and snap retire with the watch, never freezing across sessions
  watchId = null; gpsFromRun = false; clearInterval(staleWatchTimer); dispOff = [0, 0]; dispHoldReset(); snapReset(); beamDeg = null; beamVel = 0; lastBeamAt = 0;
  if (renderRaf) { cancelAnimationFrame(renderRaf); renderRaf = 0; }
  clearInterval(renderPump); renderPump = 0; stopCompass(); // the render loop stops with the watch
  // the beam is built only while watchId lives: without a fresh push the last beam stayed drawn
  if (map) pushGps();
  // location off: the re-centre button and the speed pill go with it (their gate is the watch)
  $('gpsBtn').classList.remove('on'); $('gpsBtn').classList.remove('rec'); renderIcons(); $('spdPill').classList.add('hidden'); syncCentreBtn();
}
// Locate never records: no clean open means view-only; during a clean it resumes recording and says so
$('gpsBtn').addEventListener('click', ev => { if (!tapGuard('gpsBtn', ev)) return; if (watchId != null) { if (followPaused) { resumeFollow(); } else stopGps(); } else if (runStart) { startGps(true); } else { startGps(false); } });
// the top-right re-centre button (below day/night) - visible only while suspended (syncCentreBtn)
$('centreBtn').addEventListener('click', ev => { if (!tapGuard('centreBtn', ev)) return; resumeFollow(); });
