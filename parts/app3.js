
// ===== PACE (one source) =====
function refRun() { // newest qualifying clean wins (history is chronological, so search from the end)
  for (let i = history.length - 1; i >= 0; i--) { const h = history[i]; if (h.items && cleanCount(h) === STREETNAMES.length) return h; } // Beta 1.94 (audit F-01): full = every street in the route's own list, not a hard-coded 34. Beta 1.169 (B-07): counted by cleanCount, like every other surface - a null-timestamped street still counts (it was cleaned), a foreign key never does
  for (let i = history.length - 1; i >= 0; i--) { const h = history[i]; if (h.items && cleanCount(h) >= 5) return h; }
  return null;
}
function cleanCount(h) { const items = (h && h.items) || {}; return Object.keys(items).filter(n => STREETSET.has(n)).length; } // Beta 1.169 (Carbon fix round, B-07): THE count of a clean's streets, in one place - the streets the clean covers: its item keys that belong to the route, timestamp or not (buildSnap writes a null time for a completed street whose moment was not recorded; the street was still cleaned, and openClean lists it). Through 1.168 refRun and the pace/detail headers counted raw keys while histDur counted only timestamped streets, so the same clean could read '34 streets' in one line and '33 of 34' in the next.
function snapHasStamps(h) { const T = h && h.sides && h.sides.t; if (!T || typeof T !== 'object') return false; for (const n of Object.keys(T)) { const arr = T[n]; if (!Array.isArray(arr)) continue; for (const pr of arr) { if (Array.isArray(pr) && ((typeof pr[0] === 'string' && !isNaN(Date.parse(pr[0]))) || (typeof pr[1] === 'string' && !isNaN(Date.parse(pr[1]))))) return true; } } return false; } // 2026-11-15 (denylist fix round, B-02): does the entry's stamp journal hold at least one real moment? A finish after a state restore archives with every stamp null, so buildSnap's window sum comes out 0 over NO evidence - that 0 was never measured. A measured 0 (the RP-05 case: real stamps, all before Start) always carries stamps.
function cleanWorkM(h) { // side-metres a saved clean actually covered
  if (h && typeof h.workM === 'number' && isFinite(h.workM) && h.workM >= 0 && (h.workM > 0 || snapHasStamps(h))) return h.workM; // Beta 1.167 (run/pace fix round, B2): cleans archived by 1.167+ carry the run-attributed figure Finish measured (buildSnap's workM) - it is read VERBATIM, so pre-Start work never counts (RP-05), a later geometry edit cannot re-price the clean (RP-06), and a partially-recorded sides map cannot short-circuit into an undercount (RP-09). 2026-11-15 (denylist fix round, B-02): the one exception is a stored 0 with no stamps anywhere in the entry - the finish-after-a-restore shape, where buildSnap's window sum measured nothing; that 0 is not trusted, and the entry derives below from its side bits like a legacy one. Legacy entries (no workM) derive below, exactly as they always have.
  const items = (h && h.items) || {}; let si = 0; for (const n of Object.keys(items)) if (STRETCH[n]) si += STRETCH[n].total * 2; // the items derivation: every completed street at both sides of its full length
  if (h && h.sides && h.sides.p && typeof h.sides.p === 'object') { let s = 0; for (const n of STREETNAMES) { const p = h.sides.p[n]; if (Array.isArray(p) && STRETCH[n]) { STRETCH[n].parts.forEach((part, i) => { const v = p[i] | 0; const L = segLenM(part); if (v & 1) s += L; if (v & 2) s += L; }); } else if (n in items && STRETCH[n]) s += STRETCH[n].total * 2; } if (s > 0) return s; } // Beta 1.169 (Carbon fix round, B-06): the sides branch used to price ONLY the sides map and return it the moment it priced anything - a PARTIALLY-recorded map (some completed streets carry no sides entry at all) short-circuited into the very RP-09 undercount the stored workM exists to prevent, alive in the legacy branch. The merge is now PER STREET: a street WITH a sides entry is priced by its bits (authoritative - it alone sees partial-side work, including on streets never completed), a completed street MISSING from the map falls back to the items derivation for that street.
  return si;
}
function workRateMh(workM, startMs, endMs, minH) { const h = (endMs - startMs) / 3600000; return (workM > 0 && h > minH) ? workM / h : null; } // NaN inputs fail the comparisons and yield null
function fmtRate(r) { return (r / 1000).toFixed(1) + ' km of sides/hr'; }
const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function fmtDate3(iso) { const d = new Date(iso); if (isNaN(d)) return ''; return DAY3[d.getDay()] + ', ' + MON3[d.getMonth()] + ' ' + d.getDate(); } // Beta 1.184: 'Tue, Nov 10' - the redesign date form for saved-clean rows and the detail header
function fmtHM(ms) { if (ms == null || isNaN(ms) || ms < 0) return '–'; const m = Math.round(ms / 60000); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); } // Beta 1.184: colon duration for the redesign stat cells and rows (1:24, 2:41) - presentation only; fmtDur keeps every existing surface
function fmtPaceKm(msPerKm) { if (msPerKm == null || isNaN(msPerKm) || !isFinite(msPerKm) || msPerKm <= 0) return null; const s = Math.round(msPerKm / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); } // Beta 1.184: '8:56' - minutes:seconds per ROAD km
function cleanPaceKm(h) { // Beta 1.184: a saved clean pace per ROAD km - its total elapsed (start to the Finish tap) over its road kilometres (cleanWorkM counts SIDES, so road km = cleanWorkM / 2000). null when underivable (a legacy clean with no usable times, or no recorded work)
  const d = histDur(h); if (!d) return null;
  const elapsed = Date.parse(h.at) - d.start; const roadKm = cleanWorkM(h) / 2000;
  if (!(elapsed > 0) || !(roadKm > 0)) return null;
  return fmtPaceKm(elapsed / roadKm);
}
function groupProgress(wantPrimary) { // Beta 1.184: Progress-by-group sums - a completed street counts 1, a street with any side done counts a half (the approved frame 3.5 of 6), else 0
  let sum = 0, cnt = 0;
  for (const n of STREETNAMES) { if (PRIMARIES.has(n) === wantPrimary) { cnt++; sum += streetComplete(n) ? 1 : (streetHalf(n) ? 0.5 : 0); } }
  return { sum, cnt };
}
function fmtCnt(v) { return v % 1 ? v.toFixed(1) : String(v); }
const PACE_ICONS = { // the Pace stat mint table: renderIcons (app4) fills every entry from the ACTIVE pack at boot, so the table ships EMPTY (Beta 1.220: the line glyphs that initialized it through Beta 1.219 went with their retired pack)
  clock: '',
  road: '',
  flag: '',
  list: '',
  cal: '',
  gauge: '',
  trail: ''
};
function statCell(ic, v, l) { return '<div class="cell"><span class="ic" data-ic="' + ic + '">' + PACE_ICONS[ic] + '</span><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; } // Beta 1.219: data-ic lets renderIcons re-stamp a rendered cell in place on a pack switch
function groupBar(name, g) {
  const pct = g.cnt ? (g.sum / g.cnt * 100) : 0;
  return '<div class="gbar"><div class="gb-top"><span class="gb-n">' + name + '</span><span class="gb-c">' + fmtCnt(g.sum) + ' of ' + g.cnt + ' streets</span></div><div class="gb-track"><div class="gb-fill" style="width:' + pct + '%"></div><div class="gb-half"></div></div></div>';
}
function paceInfo() { // Beta 1.91 (Andrew): pace is a WORK RATE - side-metres per hour, cumulative (work done so far / time so far) off the per-side mark stamps. Interleaved streets and same-street batched marks cannot distort a cumulative rate; a mark left late only makes the live reading lag until it lands, and the totals are never touched by stamp timing.
  const ref = refRun();
  const refRateMh = ref ? workRateMh(cleanWorkM(ref), Date.parse(ref.startedAt || ''), Date.parse(ref.at || ''), 0.05) : null;
  let rateMh = null, live = false;
  if (runStart) { const r = workRateMh(liveWorkM(), runStart, Date.now(), 0.02); if (r) { rateMh = r; live = true; } } // Beta 1.93 (audit R06): the numerator is the RUN's work (liveWorkM), not the whole board's
  if (!rateMh) rateMh = refRateMh;
  let etaTxt = '', etaClock = '';
  if (runStart && rateMh) { const leftM = totalWorkM() - workDoneM(); if (leftM > 0) { const leftH = leftM / rateMh; etaClock = fmtClock(new Date(Date.now() + leftH * 3600000)); etaTxt = 'ETA ' + fmtDur(leftH * 3600000) + ' · done ~' + etaClock; } }
  return { rateMh, refRateMh, live, etaTxt, etaClock, ref }; // Beta 1.184: etaClock is additive - the redesign ETA cell reads the done-at clock alone; etaTxt and statsLine are untouched
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
function renderPace() { // Beta 1.184 (Andrew): the approved redesign - This run stat grid, verdict banner, Progress by group, Saved cleans (always expanded). Every figure binds to the same live data the old lines read; the old Reference/Pace/This-run/Work-done lines and the Previous-cleans collapse retire into these slots (see the 1.184 datum mapping in the round record).
  const p = paceInfo();
  const ref = p.ref;
  const ph = $('paceHead');
  if (ph) { ph.innerHTML = ''; const phT = document.createElement('span'); phT.className = 'ph-t'; phT.textContent = 'Current clean'; const phS = document.createElement('span'); phS.className = 'ph-s'; phS.textContent = (activeRoute ? activeRoute.name : '') + (runStart ? ' · started ' + fmtClock(new Date(runStart)) : ' · not started'); ph.appendChild(phT); ph.appendChild(phS); } // Beta 1.184 (Codex review, PR #22): the route name is user-controlled (a created or restored route) - it reaches this header as TEXT, never markup, the same discipline as the Streets route line; a name carrying markup must not be able to mint elements (e.g. a second #paceCancel) inside the sheet
  // the verdict is honest only when a LIVE rate and a REFERENCE rate both exist: projected full-clean durations compared through the same totalWorkM the pace line always used. Otherwise the banner slot carries the reference line (or the no-reference line) - never a verdict against itself.
  let banner;
  if (runStart && p.live && p.rateMh && p.refRateMh) {
    const diffMin = Math.round((totalWorkM() / p.refRateMh - totalWorkM() / p.rateMh) * 60);
    const etaBit = p.etaClock ? ', ETA ' + p.etaClock : '';
    if (diffMin > 0) banner = '<div class="verd"><span class="vd-g">▲ Faster by ' + diffMin + ' min</span>. Verdict at today\'s pace' + etaBit + '</div>';
    else if (diffMin < 0) banner = '<div class="verd"><span class="vd-r">▼ Slower by ' + (-diffMin) + ' min</span>. Verdict at today\'s pace' + etaBit + '</div>';
    else banner = '<div class="verd"><span class="vd-g">On pace with the reference clean</span>. Verdict at today\'s pace' + etaBit + '</div>';
  } else if (ref) {
    const rd = histDur(ref), rp = cleanPaceKm(ref);
    banner = '<div class="verd ref">Reference clean (' + fmtDate3(ref.at) + ')' + (rd && rp ? ', ' + fmtHM(rd.durMs) + ' total · ' + rp + ' /km pace' : '') + '</div>';
  } else {
    banner = '<div class="verd ref">No reference clean yet. Finish a clean to set your pace</div>';
  }
  const last = history.length ? history[history.length - 1] : null; // most recent = the last element (history is chronological, append-only) - NOT the reference clean; the two can differ
  const ld = last ? histDur(last) : null;
  const lp = last ? cleanPaceKm(last) : null;
  let html =
    '<div class="statgrid">' +
    statCell('clock', runStart ? fmtHM(Date.now() - runStart) : '–', 'ELAPSED') +
    statCell('road', (workDoneM() / 2000).toFixed(1) + ' km', 'ROAD CLEARED') +
    statCell('flag', p.etaClock || '–', 'ETA') +
    statCell('list', STREETNAMES.filter(streetComplete).length + '/' + STREETNAMES.length, 'STREETS') +
    statCell('cal', ld ? fmtHM(ld.durMs) : '–', 'LAST CLEAN') +
    statCell('gauge', lp || '–', 'LAST PACE /KM') +
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
    const d = histDur(history[i]);
    if (!d) { html += '<div class="prow histRow" data-i="' + i + '"><span><span class="sc-d">' + fmtDate3(history[i].at) + '</span> <span class="sc-n">· ' + cleanCount(history[i]) + ' streets</span></span><span class="sc-t2">time not recorded</span></div>'; any++; continue; } // Beta 1.167 (B4, RP-04) carries: a legacy clean whose item times are all null is still LISTED - and opens, and deletes through the same two-tap flow
    html += '<div class="prow histRow" data-i="' + i + '"><span><span class="sc-d">' + fmtDate3(history[i].at) + '</span> <span class="sc-n">· ' + d.count + ' streets</span></span><span class="sc-t">' + fmtHM(d.durMs) + '</span></div>';
    any++;
  }
  if (!any) html += '<div style="font-size:13px;color:var(--ink-dim);padding:4px 2px">No cleans saved yet. When you finish a clean and tap Finish, it lands here with its total time.</div>';
  $('pacePad').innerHTML = html;
  const c = $('paceCancel'); if (c) c.addEventListener('click', () => { cancelStart(); closeSheets(); });
  $('pacePad').querySelectorAll('.histRow').forEach(r => r.addEventListener('click', () => openClean(+r.dataset.i)));
}
function showPaceMain() { // Beta 1.184: the Pace sheet main view - header + pace content visible, the clean detail hidden
  const cv = $('cleanView'); if (cv) { cv.style.display = 'none'; cv.classList.add('hidden'); }
  const ph = $('paceHead'); if (ph) ph.style.display = '';
  const pp = $('pacePad'); if (pp) pp.style.display = '';
  cleanIdx = null;
}
function openPace() { deselect(); closeSheets(); $('pacePanel').style.height = ''; $('pacePanel').style.maxHeight = ''; showPaceMain(); renderPace(); $('pacePanel').classList.add('open'); } // Beta 1.184: showPaceMain first - an open left on the clean detail returns to the Pace main view
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
  deselect();
  const d = histDur(h);
  // Beta 1.184: the detail lives INSIDE the Pace sheet now - the pace content yields, the detail takes its seat; the Pace sheet itself stays open (it no longer closes into the Streets sheet)
  const ph = $('paceHead'); if (ph) ph.style.display = 'none';
  const pp = $('pacePad'); if (pp) pp.style.display = 'none';
  const cv = $('cleanView');
  cv.classList.remove('hidden');
  cv.style.display = '';
  cv.innerHTML = '';
  const head = document.createElement('div'); head.className = 'cvHead';
  head.innerHTML = '<button class="cvBack">‹ Saved cleans</button><div class="cvTtlRow"><span class="cvTtl"></span><span class="cvSub"></span></div>';
  head.querySelector('.cvTtl').textContent = fmtDate3(h.at);
  head.querySelector('.cvSub').textContent = cleanCount(h) + ' streets · finished ' + fmtClock(new Date(h.at));
  head.querySelector('.cvBack').onclick = backToCleans;
  cv.appendChild(head);
  const stats = document.createElement('div'); stats.className = 'statgrid d2'; // Beta 1.184: the design 2x2 cells - TOTAL TIME is histDur span (the same interval the Saved-cleans row shows); ROAD CLEARED is work, GPS TRAIL is travel: different measures, distinct labels, never merged
  const cpk = cleanPaceKm(h);
  stats.innerHTML =
    statCell('clock', d ? fmtHM(d.durMs) : '–', 'TOTAL TIME') +
    statCell('road', (cleanWorkM(h) / 2000).toFixed(1) + ' km', 'ROAD CLEARED') +
    statCell('gauge', cpk ? cpk + ' /km' : '–', 'PACE') +
    statCell('trail', h.km ? (+h.km).toFixed(1) + ' km' : '–', 'GPS TRAIL');
  cv.appendChild(stats);
  const meta = document.createElement('div'); meta.className = 'cvMeta';
  const elapsedMs = d ? Date.parse(h.at) - d.start : NaN; // Beta 1.167 (B3, RP-08): the SECOND interval - the run's start to the Finish tap (h.at). Through 1.166 the single 'Total time' figure was histDur's start-to-LAST-COMPLETION span while the pace rate divided by start-to-Finish: two different intervals, one label, a 15.8% skew on a 30-minute tail. Both are shown now, each under its own label; the math is unchanged.
  const paceRate = (d && !isNaN(elapsedMs) && elapsedMs >= 0) ? workRateMh(cleanWorkM(h), d.start, Date.parse(h.at), 0.05) : null; // the pace divides the clean's work by the TOTAL ELAPSED window - the same window workRateMh uses for the reference figure in renderPace - and the meta line says so
  meta.textContent = (d ? ('Streets done in ' + fmtDur(d.durMs) + ' · Total elapsed ' + fmtDur(Math.max(0, elapsedMs)) + ' · ') : '') + cleanCount(h) + ' streets' + (h.km ? (' · ' + h.km + ' km of GPS trail') : '') + (h.pathShortened ? ' · saved GPS path shortened by the trail cap' : '') + (paceRate ? (' · Pace ' + fmtRate(paceRate) + ' (work / total elapsed)') : '') + (h.startedAt ? (' · started ' + fmtClock(new Date(h.startedAt))) : '') + '\nPace divides the clean\'s recorded work by its total elapsed time (start to the Finish tap). Per-street span = first side marked to last side marked (includes any work in between). Tap a street for its details.';
  cv.appendChild(meta);
  const secH = document.createElement('div'); secH.className = 'psec2'; secH.textContent = 'Streets'; cv.appendChild(secH);
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
    top.innerHTML = '<span class="dot dot-done"></span><div class="cvNm"></div><div class="cvTm"></div>'; // Beta 1.184: cleaned rows wear the done dot; NO pin anywhere in the detail (pins are the live list's locate control)
    top.querySelector('.cvNm').textContent = n;
    top.querySelector('.cvTm').textContent = (!isNaN(t) ? fmtClock(new Date(t)) : '–') + ((span > 0) ? (' · span ' + fmtDur(span)) : (stArr.length ? ' · marked in one go' : (!isNaN(dur) ? (' · gap ' + fmtDur(dur)) : ''))); // Beta 1.167 (B3, RP-07): a street whose recorded sides all carry ONE moment (span 0 - the whole-street mark) reads as marked in one go instead of inheriting the previous street's gap as its 'took'; the stamp-less fallback is a GAP since the previous completion, and is labelled as one
    rowEl.appendChild(top);
    const lines = cleanNoteLines((h.notes || {})[n]);
    if (lines.length) { const ni = document.createElement('span'); ni.className = 'cvNoteIco'; ni.innerHTML = ICONS.note; top.insertBefore(ni, top.querySelector('.cvTm')); } // Beta 1.184 (Andrew): a note icon ONLY on a street that had a note saved on THIS clean; tapping the row opens the note read-only (the .cvDet below)
    if (lines.length) { const p = document.createElement('div'); p.className = 'cvNt'; p.textContent = lines[0] + (lines.length > 1 ? ' (+' + (lines.length - 1) + ' more)' : ''); rowEl.appendChild(p); }
    const det = document.createElement('div'); det.className = 'cvDet'; det.style.display = 'none';
    const parts = [];
    parts.push('Marked: ' + (items[n] ? fmtWhen(items[n]) : 'no time recorded'));
    if (span > 0) parts.push('Span: ' + fmtDur(span) + ' - first side marked ' + fmtClock(new Date(Math.min.apply(null, stArr))) + ', last side ' + fmtClock(new Date(Math.max.apply(null, stArr))) + ' (includes any other work in between)'); else if (stArr.length) parts.push('Marked in one go - every recorded side of this street carries the same moment'); else if (!isNaN(dur)) parts.push('Gap since previous street: ' + fmtDur(dur) + ' (no side times recorded for this street; measured from the previous completion, or the clean start)');
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
      top.innerHTML = '<span class="dot ' + (PRIMARIES.has(n) ? 'dot-gold' : 'dot-rose') + '"></span><div class="cvNm"></div>'; // Beta 1.184: not-cleaned rows wear their group pending dot
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
    if (!okDel) toast('Storage problem - the delete could not be saved; the clean may return on reload', 4200); // Beta 1.63 (audit F04)
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
  const ok = lsSet(LS.snap, BOARD.serialiseSnap(runSnap, runStart)); // Arch-2: the snapshot string is the board module's one construction
  if (ok) markClean('snap'); else markDirty('snap'); return ok ? storeOk() : storeFail('snap', true);
}
// Beta 1.193 (trail redesign): startClean carries the Start fence - the four statements after
// persistRunDist inside it window the trail to the new run, so anything recorded before this
// Start is evicted here (finish/cancel already clear theirs; the fence makes the window
// invariant local to Start rather than trusting every exit path).
// Arch-2: the pre-Start snapshot is captured by the board module (BOARD.capture - its copy depths are the semantics Cancel relies on).
function startClean() { snapReset(); // Beta 1.204: Start Clean is the driving snap's HARD EXIT - the hold and the blend die at the tap itself, so the shown point is already back on the true position before the clean's first fix; snapFix's runStart gate then keeps snapping impossible for the whole clean
  runSnap = BOARD.capture(); runStart = Date.now(); runDist = { run: runStart, m: 0, end: null }; runDistWrote = { run: 0, m: 0, end: null }; persistRunDist(true); const trailAtStart = trail.length; trail = trailWindow(trail, runStart); if (trail.length !== trailAtStart) markDirty('trail'); const okSnap = saveSnap(); const okSess = noteSessionStart(); const okStart = saveAllWarned(); startGps(true); updateCount(); syncWake(); if (!okStart.ok) toast('Clean started - warning: the clean state could not be saved (storage problem)', 4200); else if (!okSess.ok) toast('Clean started - warning: the session marker could not be saved; it will keep retrying', 4200); else if (!okSnap.ok) toast('Clean started - warning: the cancel safety snapshot could not be saved; it will keep retrying', 4200); checkStale(); } // Beta 1.221 gate fix (Codex P2, PR #98): the snapshot branch is guarded by !okSnap.ok - when the toast cuts removed the old success pill, the chain's last branch lost its condition and EVERY healthy Start showed this failure warning; the healthy path must stay silent (drive146 S1/S2) // Beta 1.167 (B5): startClean banks a fresh distance counter for the new run (the runDist assignment + persistRunDist(true) beside runStart above), so even an instant reload resumes THIS run's counter. // Beta 1.73 (audit C04): the marker save is part of the start's honesty check, not a silent side write // Beta 1.63 (audit F04): the clean still starts - he is standing in the snow - but the message stops claiming a saved state that does not exist
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
    if (runSnap) { BOARD.restore(runSnap); } // Arch-2: snapshot application is the board module's
    else { // No in-memory snapshot (the app reloaded mid-run). Beta 1.94 (deep audit SR-193-02): the PERSISTED snapshot Start wrote (LS.snap, stamped with this run's start) restores the pre-Start board exactly - including a pre-Start side that was UNMARKED during the run, which the 1.93 stamp journal could not see (unmarking erases the stamp). Only when no usable persisted snapshot exists (written before 1.94, or its write never landed) does the 1.93 journal fallback below run: revert ONLY sides stamped at or after Start - anything older is pre-Start progress and is not this run's to erase; the 1.91 full-board wipe could destroy it.
      const persisted = parseJ(lsGet(LS.snap), null);
      const validSnap = persisted ? validateSnap(persisted, runStart) : null; // Beta 1.95 (SR-194-03): validated + normalized before a single field is applied - never the raw stored structures
      if (validSnap) { BOARD.restore(validSnap); }
      else {
        if (persisted) snapDamaged = true; else snapAbsent = true;
        BOARD.revertRunMarks(runStart); // Arch-2: the journal fallback (unmark at/after Start, re-derive, drop coverage) is the board module's one operation
      }
    }
    lsDel(LS.snap); markClean('snap'); resetRunDist(); lsDel(LS.rundist); lsDel(LS.rundist2); // Beta 1.167 (B5): the cancelled run's distance record goes with it. Beta 1.193: its mirror copy (LS.rundist2) goes too. The run is cancelled - its snapshot goes with it (a stale one could never match a future run's start stamp, but there is no reason to keep it)
    markDirty('trail'); markDirty('sess');
  }
  runSnap = null;
  runStart = 0; suggested = new Set(); sugQueue = []; $('suggest').classList.add('hidden');
  const okCancel = saveAllWarned().ok; flushAux(true);
  const trailPending = writePending('trail') || writePending('sess'); // Beta 1.93 (follow-up audit R07): the erasure claim below is gated on the trail/session writes having actually landed
  if (wasRunGps) stopGps();
  if (window.GLP) window.GLP.sync(); renderPanel(); renderStreets();
  updateCount(); syncWake();
  const rebuiltWhy = snapDamaged ? 'the saved snapshot was damaged' : (snapAbsent ? 'no start snapshot was saved' : ''); // Beta 1.96 (deep audit SR-195-01): the message is COMPOSED, not chained - 1.95's if-chain evaluated the damage branch before the unsaved-cleanup branch, so in the combined case (damaged snapshot AND a trail cleanup that could not be saved) the erasure message masked the storage warning entirely. The storage warning now leads whenever it applies, with the rebuild explanation attached; each single-failure message keeps its exact prior wording.
  if (okCancel && trailPending) toast('Start cancelled - erased here, but the trail cleanup could not be saved yet; it will keep retrying' + (rebuiltWhy ? ' - the board was rebuilt from the marks made during the clean (' + rebuiltWhy + ')' : ''), 4600);
  else if (okCancel && snapDamaged) toast('Start cancelled - clean erased (the saved snapshot was damaged, so the board was rebuilt from the marks made during the clean)', 4600); // Beta 1.221 gate fix (drive133 S12a, CI): the DAMAGED disclosure was cut with the plain success pill, but it is not a confirmation - it is the ONLY surface that tells him the cancel REBUILT the board approximately because the saved snapshot was corrupt (the Beta 1.95 SR-194-03 design). Andrew's named cut was the PLAIN form, which stays cut, and the ABSENT form stays cut too (drive143 C1/C2 assert a clean cancel with no snapshot fires no pill - through the real Start path an absent snapshot already warned at Start, when saveSnap failed). The damaged form is an adjudicated keep beside the trail-cleanup warning, under his severe + no-other-surface rule
  else if (!okCancel) toast('Start cancelled - warning: the cancellation could not be saved; the clean may return on reload', 4200);
} // Beta 1.69 (audits N03 + trail): cancelStart ignored saveAll's result and claimed success unconditionally; it also never refreshed the trail, so a cancelled run's line lingered
$('startBtn').addEventListener('click', () => { if (!tapGuard('startBtn')) return; startClean(); });
// CLEAR (Andrew, Beta 1.7): header button beside Pace - one tap wipes EVERY mark on the board (all streets,
// both sides), plus the completion times/vias and the GPS coverage that would instantly re-suggest them.
// The run itself (start time, trail, notes, history) is untouched - this is the mistake eraser, not a finish.
function clearAllMarks() {
  const any = doneSet.size > 0 || STREETNAMES.some(n => pieces[n].some(v => v !== 0)) || Object.keys(coveredIdx).length > 0 || suggested.size > 0; // Beta 1.70 (audit A04): coverage-only state is something to clear too - the old guard claimed 'nothing to clear' while coverage and suggestions sat untouched
  if (!any) { return; }
  BOARD.zeroMarks(); suggested = new Set(); sugQueue = []; // Arch-2: the board emptying is the module's in-place zero
  $('suggest').classList.add('hidden'); delete $('suggest').dataset.n; // Beta 1.71 (audit B01): the one path the 1.70 dismissal sweep missed - Clear wiped the coverage behind the panel but left the panel itself up, its Yes still able to select the street
  deselect(); const okClear = finishChange();
  if (!okClear.ok) toast('Storage problem - the clear could not be saved; marks may return on reload', 4200); // Beta 1.63 (audit F04)
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
// The counter accumulates each accepted fix's segment AT RECORD TIME (acceptFix), under
// trailKm's own pair rule (both endpoints in the run, <=300 s apart, <=1000 m), so the total
// survives any later trail truncation; buildSnap reads it when it belongs to the finishing
// run. It persists (LS.rundist) so a mid-run reload resumes it; a lost or foreign record
// re-derives from the surviving trail (adoptRunDist) - the pre-1.167 figure, never worse.
// Beta 1.186 (storage fix round, P2) extended the never-worse rule to a matching but STALE
// record: adoption reconciles a banked figure against the surviving trail by max(), and
// flushAux's forced flush (app1) banks the counter at page death.
// Beta 1.193 (trail redesign + counter hardening, Andrew's adopted design): the trail is
// now a backend-only rolling window - only the live run's last 60 minutes of points
// (TRAIL_WINDOW_S, app1) - kept solely as this counter's fallback; there is no drawn trail
// line and no archived path, so the 1.167 capped flag (which meant "the trail lost this
// run's points, the stored path is shorter") retires with the surface it described: under
// a window, eviction is the design, not an event, and nothing branches on it. The counter
// is hardened instead: persistRunDist banks on EVERY recorded fix (the 30 s / 25 m throttle
// is gone - the record is a few dozen characters, overwritten in place, so the storage
// footprint is unchanged) and a second copy rides LS.rundist2, written only by the
// trail-flush path (bankRunDistMirror via flushAux, app1) so the two records fail
// independently. THE RECONCILIATION INVARIANT: every recovery candidate is a LOWER BOUND
// of the run's true total - a banked record only ever accumulates real recorded segments,
// and the window's trailKm sums a SUBSET of the run's recorded pairs under the same pair
// rule - so max() can raise a stale bank toward truth but can never overstate it, and the
// trail derivation is never the authority for a span the window does not cover. The named
// residual: if BOTH counter copies are dead, recovery is exactly the window's own
// distance - the last hour, nothing more is promised.
// The record also carries the counter's ENDPOINT (end - the last recorded point).
// Per-fix banking writes the counter synchronously while the trail's own write is
// buffered in flushAux, so a process death inside that buffer leaves the banked
// total AHEAD of the stored trail; without the endpoint, adoption would restore
// the newer total while the next segment is measured from the stored trail's
// older tail - counting the in-between travel twice (gate round on PR #38,
// Codex P2). Adoption restores the endpoint as the counter's SEGMENT ANCHOR
// (runDist.end, read by acceptFix when it is newer than the trail's tail) -
// deliberately NOT as a point in the trail: an appended endpoint would hand
// trailKm a synthetic edge (flushed tail -> endpoint) that was never a
// recorded pair, and where the lost span held pair-rule-rejected jumps that
// edge's chord could invent distance the counter never banked (gate round 2,
// Codex P2). Held outside the trail, the endpoint steers only the next
// segment's measurement; the derivation keeps summing recorded pairs alone.
// Records written before this round carry no endpoint and adopt as they did.
let runDist = { run: 0, m: 0, end: null };
let runDistWrote = { run: 0, m: 0, end: null };
let runDistMirrorWrote = '';
function persistRunDist(force) {
  if (runStart && runDist.run !== runStart) adoptRunDist(); // Beta 1.186 (gate round, Codex finding): never bank an UN-ADOPTED counter. Adoption is lazy (buildSnap, the first recorded fix) and runDist boots as { run: 0, m: 0 }, so after a mid-run reload the forced flush in flushAux (app1) could fire before either adoption point and write the zero record over the banked one - through 1.190 that loss was permanent for a capped run (its trail was truncated by design, so re-derivation understated). Every other caller already guarantees the match (startClean sets the run before banking; acceptFix adopts before banking), so the guard is a no-op outside that window and the writer itself can no longer clobber a record it has not adopted.
  if (!force && runDistWrote.run === runDist.run && runDistWrote.m === runDist.m && runDistWrote.end === runDist.end) return; // Beta 1.193: no throttle - the only gate left is CHANGE. acceptFix calls this after every recorded fix, so the banked record is current to the last fix, not to the last 30 s / 25 m window (the pre-1.193 throttle, whose staleness the 1.186 reconciliation existed to absorb). The end term keeps the gate honest now that the endpoint rides the record: end is REPLACED (never mutated) on every recorded fix, so identity-equality means truly unchanged.
  if (lsSet(LS.rundist, JSON.stringify(runDist))) runDistWrote = { run: runDist.run, m: runDist.m, end: runDist.end };
}
function bankRunDistMirror() { // Beta 1.193 (counter hardening): the counter's second copy (LS.rundist2), called ONLY by flushAux's trail-flush path (app1) - a different writer, trigger and cadence from persistRunDist's per-fix direct write, so a lost, torn or clobbered primary leaves this copy intact and vice versa. Banks the ADOPTED counter only (the same never-bank-an-un-adopted rule as persistRunDist: a post-reload flush before adoption must not mint the zero counter into the mirror either).
  if (!runStart) return;
  if (runDist.run !== runStart) adoptRunDist();
  const s = JSON.stringify(runDist);
  if (s === runDistMirrorWrote) return;
  if (lsSet(LS.rundist2, s)) runDistMirrorWrote = s;
}
function adoptRunDist() {
  if (!runStart) { runDist = { run: 0, m: 0, end: null }; return; }
  let best = -1, bestEnd = null; // Beta 1.193: adoption order is primary (LS.rundist), then the mirror (LS.rundist2), then trail derivation - judged by VALUE, not by order: every candidate is a lower bound of the true total (the header invariant), so the largest matching bank is the closest to truth, and the derivation reconciles it upward only across the span the window still covers. Legacy records carrying the retired capped field are read for {run, m} and the field is ignored - under the window its old exemption (a capped bank as sole authority) is moot, because the derivation can no longer outvote a bank: it can only raise a stale one toward a truth it partially measures. The winning record's endpoint (end) is tracked beside its total for the anchor below; a record without one (written before this round) leaves bestEnd null and adopts exactly as it did.
  for (const key of [LS.rundist, LS.rundist2]) { let raw = null; try { raw = JSON.parse(lsGet(key) || 'null'); } catch (e) { raw = null; } if (raw && raw.run === runStart && typeof raw.m === 'number' && isFinite(raw.m) && raw.m >= 0) { const rawEnd = (Array.isArray(raw.end) && raw.end.length === 3 && Number.isFinite(raw.end[0]) && Number.isFinite(raw.end[1]) && Number.isFinite(raw.end[2]) && raw.end[2] >= Math.floor(runStart / 1000)) ? raw.end : null; if (raw.m > best || (raw.m === best && rawEnd && (!bestEnd || rawEnd[2] > bestEnd[2]))) { best = raw.m; bestEnd = rawEnd; } } } // Beta 1.193 (gate round 3, Codex P2): on a totals TIE the NEWER endpoint wins - a failed primary write beside a landed mirror leaves equal totals carrying different endpoints (rejected jumps advance the endpoint without adding distance), and anchoring on the older one would re-measure the span the newer already covers. bestEnd only ever comes from a record whose total IS the winning one (or its tie) - a lower record's endpoint sits behind the winner's true position and must not anchor.
  runDist = { run: runStart, m: Math.max(best, trailKm(runStart) * 1000), end: (bestEnd && (!trail.length || bestEnd[2] > trail[trail.length - 1][2])) ? bestEnd : (trail.length ? trail[trail.length - 1] : bestEnd) }; // Beta 1.193 (gate rounds, Codex P2 x2): the endpoint that survives is the NEWER of the winning bank's endpoint and the trail's own tail - it becomes the segment anchor (see the header): never appended to the trail, so the derivation below can never be handed a synthetic edge.
}
function resetRunDist() { runDist = { run: 0, m: 0, end: null }; runDistWrote = { run: 0, m: 0, end: null }; runDistMirrorWrote = ''; }
function geoFingerprint() { // Beta 1.167 (B2): a cheap fingerprint of the route geometry AS CLEANED - street names + each street's total side-metres at 0.1 m precision, FNV-1a hashed. Recorded on every new archive entry (snap.geoFP) so a later geometry edit is DETECTABLE against the entry priced under the old geometry; the pace math reads the stored workM, so the fingerprint is evidence, not an input.
  let fp = 2166136261 >>> 0; const str = STREETNAMES.map(n => n + ':' + (STRETCH[n] ? STRETCH[n].total.toFixed(1) : '0')).join('|');
  for (let i = 0; i < str.length; i++) { fp ^= str.charCodeAt(i); fp = Math.imul(fp, 16777619) >>> 0; }
  return ('0000000' + fp.toString(16)).slice(-8);
}
function buildSnap() { // production archive shape: items is a street->time map; km is the run-distance counter's total (trailKm only for a run the counter never saw). Beta 1.193: no GPS path is baked any more - the trail is a backend-only fallback window, so entries carry no path and no pathShortened; pre-1.193 entries keep theirs for the life of the entry.
  if (!doneSet.size && !Object.keys(notes).length) return null;
  const ts = [...doneSet].map(n => Date.parse(doneTimes[n])).filter(t => !isNaN(t)).sort((a, b) => a - b);
  const startMs = (runStart && ts.length && runStart <= ts[0]) ? runStart : (ts.length ? ts[0] : (runStart || null)); // Beta 1.170 (Carbon fix round Phase 2, B-12): a live run whose streets carry NO recorded stamps (every doneTime null - a finish after a state restore, say) still STARTED: fall back to the run start itself. Through 1.169 this read null, and the archived clean lost its startedAt - and with it the work metre and path bake below, both keyed off startMs // Beta 1.70 (audit A05): distance and path are measured from the clean's actual start, not its first completed street - driving before the first street was silently dropped
  if (runStart && runDist.run !== runStart) adoptRunDist(); // Beta 1.167 (B5): the counter is the archive's distance source - adopt (or re-derive) before reading it
  const snap = { at: new Date().toISOString(), items: {}, via: { ...doneVia }, notes: JSON.parse(JSON.stringify(notes)), sides: BOARD.sidesCopy(), km: startMs ? +(((runStart && runDist.run === runStart) ? runDist.m / 1000 : trailKm(startMs))).toFixed(1) : 0, startedAt: startMs ? new Date(startMs).toISOString() : null };
  doneSet.forEach(n => { snap.items[n] = doneTimes[n] || null; });
  // Beta 1.167 (run/pace fix round, B2 - RP-05/06/09): the run's own figures are BAKED INTO the entry, and cleanWorkM prefers them for the life of the entry. workM sums this snapshot's side stamps INSIDE the run's own window [the Start press, the Finish tap] - liveWorkM's stamp attribution (Beta 1.93) applied to the archived record. The window opens at runStart, NOT at startMs: when a street was marked before Start, startMs falls back to that first completion (A05), and opening the window there would count the pre-Start work right back in - so work banked before Start never counts toward this clean (RP-05), a later geometry edit cannot re-price it (RP-06; geoFP records the geometry it was priced against), and a partially-recorded sides map cannot short-circuit the derivation into an undercount (RP-09). winStart is runStart when a run is live, else startMs (a no-run finish has no earlier boundary to honour). Legacy entries carry none of these fields and derive exactly as before. (km above likewise reads the B5 counter's true total when it belongs to this run - trailKm only as the fallback for a run the counter never saw.)
  if (startMs) { let wm = 0; const endMs = Date.parse(snap.at); const winStart = runStart || startMs; for (const n of Object.keys(snap.sides.p)) { const pv = snap.sides.p[n] || [], T = snap.sides.t[n] || []; const parts = STRETCH[n] ? STRETCH[n].parts : []; parts.forEach((part, i) => { const L = segLenM(part); const st = T[i] || [null, null]; if ((pv[i] & 1) && st[0]) { const ts = Date.parse(st[0]); if (ts >= winStart && ts <= endMs) wm += L; } if ((pv[i] & 2) && st[1]) { const ts = Date.parse(st[1]); if (ts >= winStart && ts <= endMs) wm += L; } }); } snap.workM = Math.round(wm); }
  snap.totalWorkM = Math.round(totalWorkM());
  snap.geoFP = geoFingerprint();
  // Beta 1.193 (trail redesign): no path bake and no pathShortened stamp - through 1.190 the entry carried a thinned copy of the trail (the 1.70 A05 bake) and flagged it when the trail cap had truncated it (1.167 RP-02). The trail's only remaining job is the counter's fallback, so the archive keeps the counter's km and nothing else; the bake and its thinning helpers are retired with the surface.
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
  const cleared = BOARD.clearedSides(); // Arch-2: the zeroed sides a committed finish writes are built by the board module
  const prevSidesRaw = lsGet(LS.sides); // kept so the start step's rollback can restore this write exactly (including its absence)
  // Beta 1.102 (Phase 4, C3): the finish transaction on the ONE coordinator - the
  // 1.57-1.93 gate discipline mechanized: archive, cleared authority, start-key
  // delete; verified writes; verified rollback in reverse. A kill between gates
  // leaves a signature reconcileInterruptedFinish resolves at boot (CG-196-04).
  const fSteps = [];
  fSteps.push({ name: 'finclean', write: () => txSet(LS.finclean, JSON.stringify({ run: runStart || 0, at: finishAt })), undo: () => txDel(LS.finclean) }); // Beta 1.141 (Package A, DA-10): the metadata-cleanup obligation is the transaction's FIRST step, so every prefix reconciliation can call a committed finish carries it, and a rolled-back finish undoes it with the rest. The post-commit saveAll below normally discharges it at once; if those writes fail and the page dies first, completeFinishCleanup (app1) completes the cleanup at the next load instead of leaving the finished run's notes/coverage live forever.
  if (archiving) fSteps.push({ name: 'archive', write: () => txSet(LS.hist, JSON.stringify(historyForWrite(newHist))), undo: () => txSet(LS.hist, JSON.stringify(historyForWrite(prevHist))) }); // 2026-11-15 (denylist fix round, A-05): the archive write and its rollback write the historyForWrite merge, not the bare view - a finish is an ordinary save for the entries it does not touch, and the load strip stays a view through it and through its undo
  fSteps.push({ name: 'sides', write: () => txSet(LS.sides, JSON.stringify(cleared)), undo: () => prevSidesRaw === null ? txDel(LS.sides) : txSet(LS.sides, prevSidesRaw) });
  if (runStart) fSteps.push({ name: 'start', write: () => txDel(LS.start), undo: () => txSet(LS.start, String(runStart)) });
  const fTx = runTx(fSteps);
  if (fTx.outcome !== 'committed') {
    if (fTx.outcome === 'degraded') { toast(fTx.failedStep === 'sides' && archiving ? 'Storage failure - finish stopped, but the archive could not be undone - export a backup now' : 'Storage failure - finish stopped, but the rollback could not be verified - export a backup now', 6000); return; } // Beta 1.141 verify cycle 1: degraded is judged FIRST - an archive failure whose rollback could not be verified is not "run intact", whatever step failed
    if (fTx.failedStep === 'archive') { toast('Storage full - finish stopped, clean intact', 3600); return; }
    toast('Storage problem - finish stopped, your clean is intact', 4200); return;
  }
  lsDel(LS.snap); markClean('snap'); resetRunDist(); lsDel(LS.rundist); lsDel(LS.rundist2); trail = []; markDirty('trail'); // Beta 1.167 (B5): the distance counter is consumed into the archive entry (km) - its record goes with the run. Beta 1.193: its mirror copy goes too, and the trail window is cleared with them - the run is over, so the fallback's only consumer is gone (the Start fence and the load window would evict the points anyway; clearing here keeps the stored trail honest between runs). Beta 1.94 (SR-193-02): the run is finished - its cancel snapshot goes with it. Ungated on purpose: a leftover snapshot is stamped with THIS run's start, so it can never match a future run, and the next Start overwrites it anyway
  if (archiving) history = newHist;
  BOARD.zeroMarks(); notes = {}; runStart = 0; runSnap = null; suggested = new Set(); sugQueue = []; $('suggest').classList.add('hidden'); // Arch-2: the board half of this reset is the module's in-place zero // Beta 1.70 (audit A04): the suggestion set is run-scoped too - finishRun used to clear the coverage but keep the set, so suggested streets never suggested again
  stopGps(); deselect(); // Beta 1.193: through 1.190 this also force-drew the trail to clear the finished line (Beta 1.69) - there is no line any more; the window itself was cleared with the counter records above
  const restRes = saveAll(); const restOk = restRes.ok; // the gated sides write already landed; this pass carries the metadata - a failure here warns but cannot resurrect anything (authority + archive agree)
  finishChange();
  if (!restOk) toast((archiving ? 'Clean archived · ' + Object.keys(snap.items).length + ' streets' : 'Board cleared - under 3 streets, nothing saved') + ' - some details could not be written (' + restRes.failedKey + '); they retry on the next save', 3400); // Beta 1.221 adjudication: the finish SUCCESS pill is cut (the board and history are the report), but its failure suffix is a storage-problem warning with no other surface - the pill survives for the failure case only, text verbatim
  onFinishFeedback(); // Beta 1.111: only on the COMMITTED path (every failure return above leaves the run intact and silent) - the Done chime plays twice here (once for Chime Melody) plus the finish vibration pattern, per the On-the-job settings; fully guarded in app4
}
function performReset() { finishRun(); } // production's name for the finish action (the test battery calls it directly)
function checkStale() {
  const stale = runStart && (Date.now() - runStart > 12 * 3600000);
  $('stale').classList.toggle('hidden', !stale);
  if (stale) $('staleText').textContent = 'This clean started ' + fmtClock(new Date(runStart)) + ', over 12 hours ago. Finish it, or keep going?';
}
$('staleYes').addEventListener('click', () => { $('stale').classList.add('hidden'); $('resetBtn').click(); });
$('staleNo').addEventListener('click', () => $('stale').classList.add('hidden'));

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
function openNote(name) { noteFor = name; $('noteTitle').textContent = 'Note: ' + name; $('noteText').value = noteTextOf(name); $('noteModal').classList.remove('hidden'); }
$('noteNo').addEventListener('click', () => $('noteModal').classList.add('hidden'));
$('noteYes').addEventListener('click', () => {
  if (!noteFor) return;
  const okNote = setNoteText(noteFor, $('noteText').value);
  $('noteModal').classList.add('hidden'); renderStreets(); if (!okNote.ok) toast('Storage problem - the note could not be saved', 4200); // Beta 1.63 (audit F04)
});

// ===== GPS (checklist SS7) =====
// Beta 1.64 (audit R01): lastFixTs is the last accepted fix's OWN timestamp - a callback carrying an older one is stale
let watchId = null, watchGen = 0, gpsFromRun = false, gpsPos = null, dispPos = null, lastFixAt = 0, lastFixTs = 0, lastFixSpd = 0, lastGood = null, spdTimer = 0, offRouteArmed = true, followPaused = false, staleWatchTimer = 0; // Beta 1.198: lastFixSpd = the last ACCEPTED fix's own speed (m/s) — followCam's correction cap is relative to it (see the cap's comment there)
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
    feats.push({ type: 'Feature', properties: { k: 'beam', rot: Math.round((beamDeg != null ? beamDeg : facingDeg) * 10) / 10 }, geometry: { type: 'Point', coordinates: [dispShownPos()[1], dispShownPos()[0]] } }); // Beta 1.220: the painted rot is beamDeg - facingDeg smoothed per frame by beamTick (below); facingDeg remains the heading of record everywhere else // Beta 1.194: drawn features sit on the rendered point (dispShownPos) with the puck they belong to
  }
  if (dispPos) {
    // Beta 1.188: the puck itself is NOT a feature any more - the gps-puck-shader custom layer (addGpsLayers, app2) draws it in screen space straight off dispPos on every rendered frame, so the 1.182 ground discs (puckwhite / puckblue) and their 14-110 px clamp machinery are retired from here. pushGps keeps the facing beam (above) and the accuracy ring (below); the puck's visibility rule is unchanged - drawn exactly while dispPos is set, the same condition that gated the discs.
    if (gpsAccM > 0) { const ring = []; const R = gpsAccM; for (let a = 0; a <= 28; a++) { const th = a / 28 * Math.PI * 2; ring.push([dispShownPos()[1] + (R * Math.sin(th)) / MLNG, dispShownPos()[0] + (R * Math.cos(th)) / MLAT]); } feats.push({ type: 'Feature', properties: { k: 'ring' }, geometry: { type: 'Polygon', coordinates: [ring] } }); }
  }
  src.setData({ type: 'FeatureCollection', features: feats });
}
let gpsAccM = 0;
// Beta 1.193 (trail redesign): drawTrail is RETIRED with the surface it served - there is no
// trail line on the map any more (the 'trail' source and 'trail-line' layer went with it,
// app2). Through 1.190 this block filtered the stored trail to the live run and painted it
// (run-scoped since Beta 1.64, throttled since 1.135). The stored trail itself survives as
// the distance counter's backend fallback window (see the counter block above); its
// remaining readers are trailKm (the derivation) and buildGpx (internal only, app4).
let renderRaf = 0, renderPump = 0, lastFrameAt = 0, lastCamAt = 0, lastPushKey = ''; // Beta 1.65 (Andrew's road report: the GPS motion stuttered; third audit item 1): ONE frame-synced render loop drives the dot and the camera - the 40 ms glide timer and the 50 ms camera timer used to overlap at ~45 unsynced updates a second, and the camera's per-tick easing sped up whenever they overlapped
let dispOff = [0, 0], lastDispAt = 0; // Beta 1.115 (Andrew's drive report: the dot stepped once a second): the display no longer glides toward a fixed aim and stops - it COASTS on the estimator's predicted track (kfPredict, by the filter below) every frame, and a fix's correction is absorbed into dispOff (metres, [lat, lng]) and decayed away over ~0.3 s, so a fix never teleports the dot either. Smoothing is DISPLAY-ONLY: trail, coverage and pace keep consuming the raw accepted estimate (gpsPos) exactly as before.
function dispSettled() { return Math.abs(dispOff[0]) < 0.05 && Math.abs(dispOff[1]) < 0.05; }
// Beta 1.194 (display stillness hold, round-3 judging REPORT3 S2): standing still, Andrew's puck
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
let dispHoldRaw = null; // the raw fix position at engagement (the displacement exit is judged on raw travel - at rest the raw position never moves more than 0.4 m in any window, a 3.75x margin under the exit threshold, while the display's own arrival convergence would false-trip a display-based exit)
let dispHoldPrev = null; // dispPos at the previous fix - the display-step basis the engage test reads
let dispHoldSteps = []; // the last 3 display steps (m)
let dispHoldN = 0; // fixes the state machine has seen (the engage test needs three real steps behind it)
let dispHoldLow = 0, dispHoldFast = 0, dispHoldFar = 0; // consecutive-fix counters: slow (engage), >= 0.5 m/s and raw-displaced (exit)
function dispShownPos() { return dispHoldPt || snapBlendPt() || dispPos; } // THE rendered position: the stillness hold's point while it is engaged, else the road snap's blended point while a driving snap holds (Beta 1.204, the snap block below), else the display track. Every rendered consumer reads this; every recording consumer keeps reading dispPos/gpsPos. The two display transforms can never fight: the hold engages under 0.5 m/s and the snap only above 4 m/s, and the hold is read first regardless.
function dispHoldReset() { dispHoldPt = null; dispHoldRaw = null; dispHoldPrev = null; dispHoldSteps = []; dispHoldN = 0; dispHoldLow = 0; dispHoldFast = 0; dispHoldFar = 0; }
function dispHoldFix(speed, ll) { // fed once per accepted fix, at the same instant fixLogOut reads dispPos - the basis the judging simulation (analyze6c) was proven on
  const dp = dispPos;
  const step = (dp && dispHoldPrev) ? distM(dispHoldPrev, dp) : 0;
  if (dp) dispHoldPrev = dp.slice();
  dispHoldSteps.push(step); if (dispHoldSteps.length > 3) dispHoldSteps.shift();
  dispHoldN++;
  const spd = (typeof speed === 'number' && isFinite(speed)) ? speed : null; // a fix reporting no speed is no evidence either way: it neither engages nor releases on speed (the raw-displacement exit still guards it)
  if (!dispHoldPt) {
    if (spd !== null && spd < 0.5) {
      dispHoldLow++;
      if (dispHoldLow >= 2 && dispHoldN >= 4 && dispHoldSteps.length >= 3 && dispHoldSteps.every(s => s < 0.3) && dp) { dispHoldPt = dp.slice(); dispHoldRaw = ll.slice(); dispHoldFast = 0; dispHoldFar = 0; } // engage: 2 slow fixes AND the last 3 display steps each under 0.3 m - the settled test is what keeps the hold out of the arrival glide (a naive engage-on-speed hold false-fired repeatedly in simulation, exiting mid-stop with 1-3 m jumps)
    } else dispHoldLow = 0;
    return;
  }
  dispHoldFast = (spd !== null && spd >= 0.5) ? dispHoldFast + 1 : 0;
  dispHoldFar = (dispHoldRaw && distM(ll, dispHoldRaw) > 1.5) ? dispHoldFar + 1 : 0;
  if ((spd !== null && spd >= 0.8) || dispHoldFast >= 2 || dispHoldFar >= 2) { dispHoldPt = null; dispHoldRaw = null; dispHoldLow = 0; dispHoldFast = 0; dispHoldFar = 0; } // exit: one fix at honest moving speed, or two at creep threshold, or the raw position really has travelled - on the real data every exit jump measured 0.20-1.18 m and the one real creep released at its second fix with a 0.34 m jump
}
// Beta 1.204 (driving road snap, Andrew's ask + the map-matching study, work/mapmatch-study):
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
const SNAP_ACC_M = 20; // engagement only on fixes reporting accuracy at least this good (design (a); measured inert on the acceptance drives - their fixes report 12-14 m)
const SNAP_FAR_M = 10; // evidence timeout: fixes farther than this from the held road...
const SNAP_FAR_N = 5; // ...this many in a row release the hold to the true position even with no dominant rival (design (a)'s build addition; measured inert on the acceptance drives)
const SNAP_BLEND_S = 0.8; // the shown point eases between the true position and the centreline over ~this long, both ways - engaging and releasing BLEND, never a teleport (Andrew's no-popping condition, confirmed on the sample)
let snapHeld = null; // the held road: { name, pts } - ONE polyline (one street run of the index), or null
let snapRival = null; // the switch challenger: { poly, n } - the rival polyline and its consecutive margin wins
let snapFar = 0; // consecutive fixes farther than SNAP_FAR_M from the held road (the evidence timeout's counter)
let snapW = 0; // the blend weight, 0..1: 0 = the true display point, 1 = fully on the centreline. Advanced per frame in renderTick toward (snapHeld ? 1 : 0)
let snapOutPt = null; // the outgoing TARGET, kept when an ordinary release drops the hold mid-blend: the point the current blend weight reproduces the rendered point from, so snapBlendPt can ease the shown point back to the true position as the weight decays (cleared on engagement, on hard reset, and when the weight settles at 0)
let snapAnchor = null; // the rendered point a road change (rival switch, drop-and-reengage, engage over a blend-out) eases FROM: the blend's origin while the weight re-rises toward the new road's projection, so a switch never teleports either (cleared when the weight settles at 1, on drop, and on hard reset)
let snapReject = null; // the polyline the evidence timeout last rejected: re-entry hysteresis - it cannot be re-taken by any path while fixes land farther than SNAP_FAR_M from it (the band between SNAP_FAR_M and SNAP_ENGAGE_M would otherwise re-take it on the very next fix and loop the timeout forever, sweeping the puck sideways on a ~6-fix cycle). Cleared when any road is taken, when a fix lands within SNAP_FAR_M of it (the take then proceeds), and on hard reset.
let snapSegHint = 0; // the held line's segment the last projection landed on (the per-frame projection searches outward from here)
let snapFixN = 0; // fixes the matcher has processed (the acceptance drive's denominator guard)
function snapDropHold() { // an ordinary release: the blend-out's TARGET is captured BEFORE the hold clears, normalized by the current weight - snapOutPt is the point the CURRENT weight must reproduce the rendered point from (rendered = dispPos + (snapOutPt - dispPos) * snapW), so storing the rendered point itself would apply the weight twice and jump by offset * w * (1 - w) at any partial weight. Normalized, the capture is idempotent across repeated drops and the decay walks the rendered point straight to the true position. At zero weight there is nothing showing to preserve.
  if (snapW > 0.001 && dispPos) { const cur = snapBlendPt(); if (cur) snapOutPt = [dispPos[0] + (cur[0] - dispPos[0]) / snapW, dispPos[1] + (cur[1] - dispPos[1]) / snapW]; }
  snapHeld = null; snapRival = null; snapFar = 0; snapSegHint = 0; snapAnchor = null;
}
function snapReset() { snapDropHold(); snapW = 0; snapOutPt = null; snapAnchor = null; snapReject = null; } // the snap retires outright (watch stop, Start Clean): no blend-out - the state is simply gone before the next frame can show it (the weight is zeroed, so the captured outgoing point can never render, and it is cleared besides)
function ptSegProj(p, a, b) { // ptSegM's twin (app1) that also returns the projected point, in [lat, lng]
  const ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, px = p[1] * MLNG, py = p[0] * MLAT;
  const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
  let t = L2 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  const qx = ax + vx * t, qy = ay + vy * t;
  return { d: Math.hypot(px - qx, py - qy), pt: [qy / MLAT, qx / MLNG] };
}
function snapProject(ll) { // the nearest point of ll on the held road's line, or null when nothing is held. The search starts around the last segment and widens only when the best point sits at the window's edge - a held run is one street run (tens of segments), so even the widened scan is cheap, and the window keeps the per-frame cost flat on the long highway runs.
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
function snapBlendPt() { // the snapped rendering of the display track at the current blend weight, or null when the snap is showing nothing (no hold and no outgoing projection, no display point, or the blend fully out). While a hold stands the target is its live projection; during a release blend-out it is the outgoing target captured (weight-normalized) at the drop, so the shown point walks back to the true position as the weight decays instead of teleporting the full offset in one frame. The blend's ORIGIN is the true position normally, or the anchor after a road change (snapTakeHold), so a switch eases across from what was on screen.
  if (!dispPos || snapW <= 0.001) return null;
  const pr = snapHeld ? snapProject(dispPos) : snapOutPt; if (!pr) return null;
  if (snapW >= 0.999) return pr;
  const org = snapAnchor || dispPos;
  return [org[0] + (pr[0] - org[0]) * snapW, org[1] + (pr[1] - org[1]) * snapW];
}
function snapTakeHold(poly, seg) { // every road change funnels through here (engage, drop-and-reengage, rival switch). The projection hint is SEEDED from the nearest search's own segment: snapProject's per-frame window trusts its hint, and a hint of 0 on a curved or looping run accepts an interior local minimum - a projection potentially hundreds of metres from the fix, which the full-line distance check cannot release (it reads the true distance). And when the snap is currently SHOWING something (weight up), the rendered point becomes the anchor and the weight restarts, so the shown point walks to the new road instead of teleporting; from free (weight 0) nothing is showing and the plain engage blend runs.
  if (snapW > 0.001 && dispPos) { const cur = snapBlendPt(); if (cur) { snapAnchor = cur; snapW = 0; } }
  snapHeld = poly; snapSegHint = seg; snapFar = 0; snapRival = null; snapOutPt = null; snapReject = null;
}
// ---- the road index: the active route's lines + one shipped city pack, segment-gridded ----
let snapCat = null; // the pack catalogue once loaded ([{ slug, name, bbox: [s, w, n, e] }]); null before, [] when the library failed to load
let snapCatKicked = false; // the catalogue request has been fired
let snapGeo = null; // { key, polys: [{ name, pts }], grid: Map<'gx:gy', flat [polyIdx, segIdx, ...]> } - the index the matcher reads
let snapGeoBusy = false; // an async pack build is in flight
let snapGeoFailSlug = '', snapGeoFailAt = 0; // the last failed pack build (60 s cooldown: a dead pack is retried at most once a minute, never per fix)
const SNAP_CELL_M = 60; // the index grid cell; a 3x3 lookup around a fix always covers >= 60 m - past every decision distance (engage 12, drop 18), so one ring of cells is a complete candidate search
function snapRoutePolys() { const out = []; for (const n of Object.keys(STRETCH)) { const st = STRETCH[n]; if (!st || !st.runs) continue; for (const r of st.runs) if (r.line && r.line.length > 1) out.push({ name: n, pts: r.line }); } return out; }
function snapBuildIndex(polys, key) {
  const grid = new Map();
  for (let pi = 0; pi < polys.length; pi++) { const pts = polys[pi].pts; for (let i = 0; i < pts.length - 1; i++) { const ax = pts[i][1] * MLNG, ay = pts[i][0] * MLAT, bx = pts[i + 1][1] * MLNG, by = pts[i + 1][0] * MLAT; const x0 = Math.floor(Math.min(ax, bx) / SNAP_CELL_M), x1 = Math.floor(Math.max(ax, bx) / SNAP_CELL_M), y0 = Math.floor(Math.min(ay, by) / SNAP_CELL_M), y1 = Math.floor(Math.max(ay, by) / SNAP_CELL_M); for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) { const k = gx + ':' + gy; let arr = grid.get(k); if (!arr) { arr = []; grid.set(k, arr); } arr.push(pi, i); } } }
  return { key, polys, grid };
}
function snapSlugFor(ll) { if (!snapCat) return null; for (const c of snapCat) { if (c && Array.isArray(c.bbox) && c.bbox.length === 4 && ll[0] >= c.bbox[0] && ll[0] <= c.bbox[2] && ll[1] >= c.bbox[1] && ll[1] <= c.bbox[3]) return c.slug; } return ''; }
function snapGeoEnsure(ll) { // make the index match the area ll is in. Async by nature (a pack download), and never blocking: while a pack is in flight the route-only index serves, and before the first build there is simply no index (no snap). An index install drops any hold - the held line's identity belongs to the index it was picked from.
  if (!snapCat && !snapCatKicked) { snapCatKicked = true; crPackIndexLoad().then(cs => { snapCat = cs || []; }, () => { snapCat = []; }); }
  const routeKey = (typeof activeRoute !== 'undefined' && activeRoute && activeRoute.id) || '';
  const slug = snapSlugFor(ll); // null while the catalogue is in flight, '' outside every pack city
  if (slug === null) { if (!snapGeo) snapGeo = snapBuildIndex(snapRoutePolys(), routeKey + '|~'); return; } // route streets only for now; the '~' key can never equal a settled want, so the first fix after the catalogue lands rebuilds with the pack
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
function snapNearest(ll) { // the nearest indexed polyline to ll: { poly, d, seg } or null - seg is the polyline's own nearest segment, the seed every take of the hold hands snapProject (see snapTakeHold). One ring of grid cells is a complete search (see SNAP_CELL_M): nothing found means no road within ~60 m, past every decision distance.
  if (!snapGeo) return null;
  const cx = Math.floor(ll[1] * MLNG / SNAP_CELL_M), cy = Math.floor(ll[0] * MLAT / SNAP_CELL_M);
  const best = new Map();
  for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) { const arr = snapGeo.grid.get(gx + ':' + gy); if (!arr) continue; for (let j = 0; j < arr.length; j += 2) { const poly = snapGeo.polys[arr[j]]; const d = ptSegM(ll, poly.pts[arr[j + 1]], poly.pts[arr[j + 1] + 1]); const cur = best.get(arr[j]); if (!cur || d < cur.d) best.set(arr[j], { d, seg: arr[j + 1] }); } }
  let bp = null, bd = Infinity, bs = 0; for (const [pi, b] of best) if (b.d < bd) { bd = b.d; bp = snapGeo.polys[pi]; bs = b.seg; }
  return bp ? { poly: bp, d: bd, seg: bs } : null;
}
function snapHeldDist(ll) { let bd = Infinity; const pts = snapHeld.pts; for (let i = 0; i < pts.length - 1; i++) { const d = ptSegM(ll, pts[i], pts[i + 1]); if (d < bd) bd = d; } return bd; }
function snapFix(speed, acc, ll) { // fed once per accepted fix, beside dispHoldFix - the study sim's state machine (measure3) on the raw fix, plus design (a)'s accuracy gate and evidence timeout and design (b)'s hard clean exit. Display-only: it writes nothing but the snap state above; the blend in renderTick/dispShownPos is its only mouth.
  snapFixN++;
  if (runStart) { snapDropHold(); return; } // a clean running is a HARD EXIT: snapping is impossible for the whole clean, not merely disengaged - and startClean already called snapReset at the tap, so the shown point is back on the true position before the clean's first fix lands
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
  if (hd > SNAP_DROP_M) { // the held road is gone: drop it, and let this same fix take a fresh candidate if one is close (the sim's drop-and-reengage)
    snapDropHold();
    if (near && near.d <= SNAP_ENGAGE_M && acc <= SNAP_ACC_M && !(near.poly === snapReject && near.d > SNAP_FAR_M)) { snapTakeHold(near.poly, near.seg); hd = snapHeldDist(ll); } else return; // the accuracy gate guards this fresh take exactly as it guards the from-free engage: an unreliable fix releases the old road, it does not lock the puck onto another one
  }
  if (hd > SNAP_FAR_M) { if (++snapFar >= SNAP_FAR_N) { const rej = snapHeld; snapDropHold(); snapReject = rej; return; } } else snapFar = 0; // the evidence timeout: persistently far from the held road with no dominant rival - release to the true position rather than ride a wrong road, and REJECT it (snapReject): without the hysteresis the next fix inside the wider engage gate re-takes it and the timeout loops forever
  if (near && near.poly !== snapHeld && hd - near.d >= SNAP_SWITCH_M && !(near.poly === snapReject && near.d > SNAP_FAR_M)) {
    if (snapRival && snapRival.poly === near.poly) snapRival.n++; else snapRival = { poly: near.poly, n: 1 };
    if (snapRival.n >= SNAP_SWITCH_N) snapTakeHold(near.poly, near.seg);
  } else snapRival = null;
}
function renderTick(now) {
  const pred = kfPredict(); // Beta 1.115: the predicted track at THIS frame - between fixes it advances on the estimated velocity, so the dot flows instead of bursting once a second
  if (pred) {
    const pNow = performance.now();
    const dtF = lastDispAt ? Math.min(0.25, Math.max(0, (pNow - lastDispAt) / 1000)) : 0; lastDispAt = pNow;
    if (dtF > 0 && !dispSettled()) { const k = Math.pow(0.2, dtF / 0.3); dispOff = [dispOff[0] * k, dispOff[1] * k]; if (dispSettled()) dispOff = [0, 0]; } // the correction offset decays with a ~0.3 s time constant, on the same performance clock the prediction reads
    dispPos = [pred[0] + dispOff[0] / MLAT, pred[1] + dispOff[1] / MLNG];
    { const tgt = snapHeld ? 1 : 0; if (dtF > 0 && snapW !== tgt) { snapW = tgt + (snapW - tgt) * Math.pow(0.1, dtF / SNAP_BLEND_S); if (Math.abs(snapW - tgt) < 0.002) snapW = tgt; if (snapW === 0) snapOutPt = null; else if (snapW === 1) snapAnchor = null; } } // Beta 1.204: the snap blend advances per frame toward the held state (in on engage, out on release - the same ease both ways, so the shown point never teleports), on this same frame clock and step (dtF) as the correction decay above
  }
  let camKey = ''; // Beta 1.182: the camera state that sizes the puck joins the push key, bucketed - quarter-zoom (sets the scale), half-degree bearing (rotates the projected measure), 2-degree pitch (sets its anisotropy), the puck's own projected position on a 16 px grid and the viewport size (Codex's fourth catch on PR #19: under pitch the local stretch varies across the viewport, so PANNING a pitched map with a stationary fix moves the puck through the perspective gradient without changing zoom, bearing or pitch - the stale radii could carry it past the cap near the viewport's bottom edge). Together these are every input the projection of a static ground point depends on, so any change that could resize the puck re-pushes the glyph even when nothing moved.
  if (map) { camKey = Math.round(map.getZoom() * 4) / 4 + ',' + Math.round(map.getBearing() * 2) / 2 + ',' + Math.round(map.getPitch() / 2) * 2 + ',' + map.getCanvas().clientWidth + 'x' + map.getCanvas().clientHeight; if (dispPos) { const pp = map.project([dispShownPos()[1], dispShownPos()[0]]); camKey += ',' + Math.round(pp.x / 16) + ':' + Math.round(pp.y / 16); } } // Beta 1.194: the puck's projected position is the RENDERED point (dispShownPos) - keyed on what is actually drawn, so a held puck does not re-push frames for display-track motion nobody sees
  const key = dispPos ? dispShownPos()[0] + ',' + dispShownPos()[1] + ',' + (beamDeg != null ? Math.round(beamDeg * 10) / 10 : facingDeg) + ',' + gpsAccM + ',' + camKey : ''; // Beta 1.220: the key carries the PAINTED beam rot, so the per-frame spring repaints through this same gate and the pushes stop when the spring rests
  if (key !== lastPushKey) { lastPushKey = key; pushGps(); } // redraw the dot/ring/beam only when something actually moved - the old timers rebuilt it on every tick regardless
  beamTick(now); followCam(now); headCam(now); syncCentreBtn();
}
function renderLoop(now) {
  lastFrameAt = now;
  renderTick(now);
  if (watchId == null && dispSettled() && camSpringsRest()) { renderRaf = 0; return; } // nothing left to animate: the loop parks itself until the next fix or GPS start (Beta 1.198: the camera springs join the test — a spring still carrying velocity is something left to animate)
  renderRaf = requestAnimationFrame(renderLoop);
}
function startRenderLoop() { if (!renderRaf) { lastCamAt = lastFrameAt = performance.now(); renderRaf = requestAnimationFrame(renderLoop); } if (!renderPump) renderPump = setInterval(() => { if ((watchId != null || !dispSettled()) && performance.now() - lastFrameAt > 100) renderTick(performance.now()); if (watchId == null && dispSettled() && camSpringsRest() && !renderRaf) { clearInterval(renderPump); renderPump = 0; } }, 100); } // the pump is a starvation fallback only: a browser that is not painting (headless, occluded) delivers no animation frames, and the GPS state must still advance - on a painting phone it never fires; it parks itself when nothing is left to render
// Beta 1.198 (camera glide, Andrew — designed and measured in the camera-glide study on his own
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
// display track (the dispOff decay — its own follow-up, deliberately NOT in this round) are
// untouched.
let camVel = [0, 0]; // the centre spring's velocity state (m/s, local metres, [lng, lat] axes), carried between frames; zeroed whenever the follow is not the camera's owner (suspended, GPS off, a teleport), so every re-engage starts from rest
let camBVel = 0; // the bearing spring's velocity state (deg/s), same rule
let camUncapped = false; // a centre TRAVERSE is in flight — the centre spring's correction cap is suspended while the centre error is traverse-scale (> 25 m), however the gap arose. Set by resumeFollow (an explicit re-centre — Beta 1.198, Codex P2, PR #45) and, since Beta 1.201, by followCam itself the moment the error it measures exceeds 25 m; cleared when the error closes under 25 m and whenever the follow is not the camera's owner. The cap exists for GPS re-anchor corrections (median 2.0 m, max 17.6 m on the judged drive); applied to a traverse it strands the camera: per-call travel (20 + lastFixSpd) x dt with dt clamped to 100 ms makes convergence a call-count problem — 1 km at 20 m/s is a 50 s crawl even at 60 fps, and a 643 m gap needs >= 271 calls at ANY cadence (drive126 F2, adjudicated APP on 1.198). The uncapped spring is self-limiting — critically damped, it never overshoots — so a traverse is a bounded S-curve, not a chase. THE RULE: per-call travel is capped ONLY when the remaining error is a correction-scale distance (<= 25 m)
function camSmoothDamp(cur, tgt, vel, smoothTime, dt) { // one spring step: returns [value, velocity]. The overshoot guard pins the value at the target but leaves the velocity as computed — the study's simulated form verbatim; its acceptance numbers were measured on exactly this arithmetic
  const omega = 2 / smoothTime, x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - tgt;
  const temp = (vel + omega * change) * dt;
  const nvel = (vel - omega * temp) * exp;
  let out = tgt + (change + temp) * exp;
  if ((tgt - cur > 0) === (out > tgt)) out = tgt;
  return [out, nvel];
}
function camSmoothDampAngle(cur, tgt, vel, smoothTime, dt) { // the spring on the wrapped angle: run in delta space (0 = at cur, headDelta(cur, tgt) = at tgt) so the 360/0 seam never exists inside the integrator
  const r = camSmoothDamp(0, headDelta(cur, tgt), vel, smoothTime, dt);
  return [cur + r[0], r[1]];
}
function camSpringsRest() { return Math.hypot(camVel[0], camVel[1]) < 0.25 && Math.abs(camBVel) < 0.5; } // the render loop's parking test beside dispSettled(): the camera is at rest when neither spring carries meaningful velocity. While GPS is off the follow guards below zero the velocities on every tick, so parking behaves exactly as before; the term exists so the loop can never park mid-glide in a state where the springs do own the camera
function followCam(now) {
  if (!map || !dispPos || followPaused || watchId == null) { lastCamAt = now; camVel = [0, 0]; camUncapped = false; return; } // Beta 1.146 (census C4): the no-map guard in the SAME idiom as northUp/pushGps - in the map-failure world (MapLibre script dead, map === null) renderTick reaches this on every fix and the unguarded map.getCanvas() below threw before the fix could record. follow whenever location is ON (Beta 1.27, Andrew) - it used to engage only during a run, so the dot wandered off-screen on a plain drive. Trail recording stays run-only; heading-up applies whenever location is on and the camera follows (Beta 1.122, Andrew). Beta 1.198: the centre spring's velocity zeroes in the same breath — whenever the follow is not the camera's owner the spring is at rest, so a re-engage starts from rest and camSpringsRest can trust the state.
  const dt = Math.min(100, Math.max(1, now - lastCamAt)) / 1000; lastCamAt = now;
  const c = map.getCenter(); const cx = c.lng * MLNG, cy = c.lat * MLAT; // Beta 1.198: the spring works on the camera centre in WORLD metres (the study's simulated form) — zoom-independent, where the old panBy fraction converged in pixels. The centre is read fresh every frame, so a camera moved by anything else (a flyTo, a resume) is absorbed as the new starting point, never fought.
  const tgt = dispShownPos(); const tx = tgt[1] * MLNG, ty = tgt[0] * MLAT; // Beta 1.194: the follow target is the rendered point - while the stillness hold is engaged the camera rests with the puck instead of creeping after the display track's re-settling
  const err = Math.hypot(tx - cx, ty - cy);
  if (err > 25) camUncapped = true; // Beta 1.201: the traverse exemption engages on the centre ERROR ITSELF, however the gap arose — one governing rule: the relative cap below governs CORRECTIONS (error <= 25 m); a traverse-scale gap is closed by the uncapped spring. Through 1.198 the exemption engaged only via resumeFollow (an explicit re-centre), so a gap the FOLLOW itself acquired — a teleporting fix feed (drive126's F2 scenario), a reacquisition after a long outage — closed at (20 + lastFixSpd) x dt per call with dt clamped to 100 ms: >= 271 calls for a 643 m gap at any cadence (~27 s at a perfect 60 fps; minutes under frame starvation, where the pre-1.198 chase closed a fixed fraction of the gap per call — 5 calls at any cadence). Real re-anchor corrections never reach this line (max 17.6 m on the judged drive), so the correction regime the 1.198 acceptance measured is untouched
  if (camUncapped && err < 25) camUncapped = false; // Beta 1.198 (Codex P2, PR #45): the re-centre return has closed into correction range (25 m sits above every re-anchor the follow itself generates — p99 9.9 m, max 17.6 m on the judged drive) — the cap governs again from here
  if (err < 0.05 && Math.hypot(camVel[0], camVel[1]) < 0.25) return; // Beta 1.198: the rest threshold replaces the 0.5 px deadband — the map write is skipped only when the error AND the spring's velocity are both ~0. The deadband's pan/skip alternation at its edge was a ~30 Hz limit cycle (the study's M4: a fine judder that fattened the jerk distribution even on straights); a spring at rest has nothing to alternate. (The settle band drive126 judges is 12% of the screen, two orders wider than anything here.)
  const sx = camSmoothDamp(cx, tx, camVel[0], 0.32, dt), sy = camSmoothDamp(cy, ty, camVel[1], 0.32, dt); // smoothTime 0.32 s (the study's mix): centre time-lag ~323 ms median on the judged drive (2.58 m at 8 m/s; under a metre at driveway pace), offset p95 ~5 px at z17 against the app's own ~47 px follow tolerance
  camVel = [sx[1], sy[1]];
  let nx = sx[0], ny = sy[0];
  const step = Math.hypot(nx - cx, ny - cy), maxStep = (20 + lastFixSpd) * dt; // the correction cap, RELATIVE to the vehicle's own speed (Codex P2, PR #45): a fix's re-anchor can hand the display a 17.6 m correction (fix 200 of the judged drive) and the shipped chase moved the camera at 44 m/s absorbing it — the cap makes the correction component of the camera's motion at most 20 m/s: this frame's travel is clamped to (20 + the last fix's speed) and the spring's velocity state is left as computed, so the glide resumes coherently once the cap releases. An ABSOLUTE 20 m/s cap was the first form and it was wrong: above 72 km/h the camera could not even track the vehicle and fell behind without bound (~600 m in a minute at 30 m/s in Codex's mock run) — the judged drive never exceeds ~16 m/s, so the study could not see it. At rest lastFixSpd is ~0 and the cap is exactly the studied 20 m/s. The cap governs CORRECTIONS only: a traverse (camUncapped — set by resumeFollow for an explicit re-centre, and by followCam itself whenever the centre error exceeds 25 m, Beta 1.201) is exempt until it closes under 25 m — a user who panned a kilometre away and tapped Re-centre is owed a traverse, not a 50 s crawl, and so is a follow that acquired a traverse-scale gap on its own
  if (!camUncapped && step > maxStep) { const k = maxStep / step; nx = cx + (nx - cx) * k; ny = cy + (ny - cy) * k; }
  map.jumpTo({ center: [nx / MLNG, ny / MLAT] });
}
function syncCentreBtn() { const b = $('centreBtn'); if (b) b.classList.toggle('hidden', !(watchId != null && followPaused && !!dispPos)); } // Beta 1.115 (Andrew): the re-centre button exists ONLY in the suspended state - location on, a position known, and the follow yielded to the user. Called on every render tick so the button's state can never drift from the follow's.
function resumeFollow() { if (watchId == null || !followPaused) return; followPaused = false; camVel = [0, 0]; camBVel = 0; camUncapped = true; syncCentreBtn(); startRenderLoop(); } // Beta 1.198: the springs re-engage from rest (velocities zeroed) — the spring IS the ease back: it carries the camera back to the dot on an S-curve, no snap, no jump. The return is exempt from the 20 m/s correction cap (camUncapped) until it closes under 25 m (Codex P2, PR #45: capped, a far re-centre crawls — 1 km would take ~50 s)
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
let lastHeadFixAt = 0; // Beta 1.187 (GPS package, TURN A): when the previous heading fix landed - the heading path is sized by the TIME between fixes, not by fix count
let lastHeadFixPerf = 0; // Beta 1.194: the performance-clock twin of lastHeadFixAt (kf keeps the same at/atF pair) - headCam's camera lead is measured on the frame clock
let headF = null; // Beta 1.194 (heading filter 2a): the filter state beside smHeading (theta itself stays in smHeading - headCam, fixLogOut and northUp already read and reset it there; northUp's smHeading = null re-initializes the filter through updateHeading's init branch). {om: turn rate deg/s, p00/p01/p10/p11: the [theta, omega] covariance (NOT symmetric after an update - the predict uses both off-diagonals, exactly as the replayed prototype carries them), gate: the previous gated innovation's signed value (0 = none)}
const HEAD_Q = 400; // Beta 1.194: 2a's process noise, deg^2/s^3 - the configuration the round-3 judging replay proved on Andrew's two real drives (REPORT3 S3: session-2 fixes over 20 deg of heading error 52 shipped -> 5 at q = 400 with the step escape). Its gate is the round-2 simulator's heading-burst guard; the mandated fallback on a guard failure is q = 100 (replay: 52 -> 8), never a tuned guard.
function headSigma(v) { return 6 + 18 / Math.max(v, 0.5); } // the OS course's noise falls with speed (round-2 sim noise model; Claude's 2a R) - at rest the course is stale or absent, at speed it sharpens
function headDelta(a, b) { return ((((b - a + 180) % 360) + 360) % 360) - 180; }
function updateHeading(hdg, speed, now) {
  if (followPaused) return; // Beta 1.122 (Andrew): the heading state is maintained whenever location is on, not only during a run - headCam applies it whenever the camera follows; while the follow is suspended the state freezes with the camera (drive148 R3)
  const spd = (typeof speed === 'number' && isFinite(speed)) ? speed : 0; // a fix reporting no speed is no evidence of motion: it takes the hold branch below, where the course is treated as the stale thing it is at rest
  if (typeof hdg !== 'number' || isNaN(hdg)) { // Beta 1.194 (Codex P2, PR #40): no course on this fix (the OS reports none at rest) - no measurement exists, but a STOPPED state's turn rate must still decay: without this, headCam extrapolates the last moving turn rate at its 1 s cap forever and the parked camera sits a full omega off the frozen heading. A moving fix with no course changes nothing (a dropout mid-drive is not evidence about the rate).
    if (headF && smHeading !== null && spd < 1) { const dt = Math.min(3, Math.max(0.05, (now - lastHeadFixAt) / 1000)); lastHeadFixAt = now; lastHeadFixPerf = performance.now(); headF.om *= Math.pow(0.5, dt); headF.gate = 0; }
    return;
  }
  if (smHeading === null || !headF) { smHeading = hdg; headF = { om: 0, p00: headSigma(spd) ** 2, p01: 0, p10: 0, p11: 900, gate: 0 }; lastHeadFixAt = now; lastHeadFixPerf = performance.now(); return; }
  const dt = Math.min(3, Math.max(0.05, (now - lastHeadFixAt) / 1000)); lastHeadFixAt = now; lastHeadFixPerf = performance.now(); // the clamp is the 1.187 smoother's own (inert on the real drives: their fixes land 0.996-1.001 s apart); it bounds the predict after a long silence
  if (spd < 1) { headF.om *= Math.pow(0.5, dt); headF.gate = 0; return; } // Beta 1.194 (2a hold): under ~1 m/s the course is unreliable - frozen by the OS at rest and through the pause before a reverse (round-3 judging, labelled) - so theta holds, the turn rate decays, and NO reverse-specific handling exists anywhere: while the course is frozen the innovations are ~0 and theta holds on its own (excursion over the confirmed reverse: 0.3 deg on replay)
  // Beta 1.194 (heading filter 2a, replacing the 1.187 time-normalized EMA): the EMA lagged a
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
    if (!(headF.gate !== 0 && (y > 0) === (headF.gate > 0))) { R *= 9; S = p00 + R; } // ...but a SECOND consecutive gated innovation of the same sign is a manoeuvre, not noise (the step escape): accept it at normal R. Two same-sign surprises in a row are the vehicle turning, and fighting them is what made the EMA chase a post-reverse course snap for ~9 s (replay: 2a settles it in 1 fix)
    headF.gate = y;
  } else headF.gate = 0;
  const K0 = p00 / S, K1 = p10 / S;
  smHeading = smHeading + headF.om * dt + K0 * y;
  headF.om = Math.max(-40, Math.min(40, headF.om + K1 * y)); // the turn-rate clamp: a plow turns slowly; anything faster is a course step being absorbed, and the clamp bounds the overshoot it can store
  headF.p00 = (1 - K0) * p00; headF.p01 = (1 - K0) * p01; headF.p10 = p10 - K1 * p00; headF.p11 = p11 - K1 * p01;
}
// Beta 1.115: heading-up is applied per render tick, fractionally, in the same pipeline
// as followCam's pan. It used to be a map.easeTo fired from updateHeading - but a camera
// ease is cancelled by the next panBy, and while following, followCam pans on nearly every
// frame, so the rotation starved whenever the dot was off-centre (measured in the rig:
// smHeading chased 90 -> 170 while the bearing sat at 90). Tick application rides with the
// pan instead of fighting it, and is frame-smooth like the rest of the follow.
let lastHeadAt = 0;
function headCam(now) {
  if (!map || watchId == null || followPaused || smHeading === null) { lastHeadAt = now; camBVel = 0; return; } // Beta 1.146 (census C4): no-map guard, same idiom as followCam above - headCam is the other renderTick caller that dereferenced the map unguarded. Beta 1.198: the bearing spring's velocity zeroes in the same breath — whenever headCam is not the camera's owner (suspended, GPS off, heading reset by northUp) the spring is at rest, so a re-engage starts from rest.
  const cur = map.getBearing();
  const h = lastHeadFixPerf ? Math.min(1, Math.max(0, (performance.now() - lastHeadFixPerf) / 1000)) : 0; // Beta 1.194 (2a): the camera reads theta + omega * h - the filter's own turn rate leads the bearing between fixes, capped at 1 s of lead, so a steady turn is tracked through the gaps instead of stair-stepping fix to fix
  const tgt = smHeading + (headF ? headF.om : 0) * h;
  const d = headDelta(cur, tgt);
  const dt = Math.min(100, Math.max(1, now - (lastHeadAt || now))) / 1000; lastHeadAt = now;
  if (Math.abs(d) < 0.02 && Math.abs(camBVel) < 0.5) return; // Beta 1.198: the rest threshold replaces the 0.3 deg deadband (the study's simulated values) — the write is skipped only when the error AND the spring's velocity are both ~0, so a turning spring is never parked mid-swing by a momentarily small error
  const r = camSmoothDampAngle(cur, tgt, camBVel, 0.22, dt); // smoothTime 0.22 s (the study's mix): on the judged drive the worst per-frame bearing step falls 10.18 -> 4.50 deg while corner error vs theta stays at parity with the shipped chase (11.1 vs 11.0 deg mean) — the spring hands back the omega*h lead the chase exploited and pays its own tracking lag, and the two cancel. NO slew cap: one was simulated and rejected (corner error vs target blew out to a 20 deg mean — the map pointed the wrong way for seconds); the spring's 270 deg/s peak occurs only inside the post-reverse snap, where the target itself teleports
  camBVel = r[1];
  map.jumpTo({ bearing: r[0] });
}
function northUp() { smHeading = null; camBVel = 0; if (!map) return; if (Math.abs(map.getBearing()) > 0.5) map.easeTo({ bearing: 0, duration: 400 }); } // Beta 1.76: same no-map tolerance as pushGps - a finish on a map-less page must reach its transaction, not throw here. Beta 1.198: the bearing spring's velocity dies with the heading it chased (headCam's guard would zero it on the next tick regardless — this keeps the state honest in the interval)
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
// Beta 1.220 (Andrew's field report): the puck's direction light stepped about once a second -
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
// ===== RAW FIX LOG (Beta 1.189 — a DEBUGGING instrument, Andrew approved on the third-seat
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
// fault fails silent and can never touch the estimator, camera, trail or runDist), the
// per-fix cost is one in-memory append, and persistence rides the trail's throttled flush.
// Entry shape: [timestamp, lat, lng, accuracy, speed, heading, out, run] — out is null
// until the estimator has run on the fix (a gated fix keeps null forever: delivered,
// refused, and the refusal is itself replay data), else [filteredLat, filteredLng,
// displayLat, displayLng, smoothedHeading] at the trail's precision.
let fixLog = [], fixLogSession = null, fixLogCount = 0;
let fixLogEnabled = false; // Beta 1.195 (Andrew's toggle conversion): the log records ONLY while this flag is on. It is RUNTIME-ONLY state, by design and by his spec: a plain in-memory let, re-initialized OFF at every boot (every cold open, every reload), never written into any record — it is not a member of SETTINGS / canonicalSettings, not a key in LS_GLOBAL, and not a field in any backup, so nothing stored anywhere can switch logging on and a restore cannot enable it; there is no stored representation for boot to honour even if one were planted. The Settings switch (app4) reaches the flag ONLY through the two doors below, and recording is gated at the one entry point (fixLogRaw) — while the flag is off, the watch runs exactly as if the logger did not exist and the stored log is never touched.
function fixLogIsEnabled() { return fixLogEnabled; }
function fixLogSetEnabled(on) { fixLogEnabled = !!on; } // flipping off stops recording at the next fix; it deliberately does NOT close the session or touch the stored log — the recorded sessions stay whole for the backup export Andrew makes after the drive
// ===== Beta 1.190: the fix log's STORED form ("e3") =====
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
// { e: 3, s: [{ v, t0, n, b, f }] } — an object, not 1.189's top-level array, so a
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
//   adds it back onto the previous fix's pattern and recovers the EXACT double,
//   bit for bit. An entry that cannot delta (a null or non-finite coordinate on
//   either side — a refused fix — a non-integer timestamp, or a bit delta beyond
//   2^53) is written as a keyframe instead.
// - accuracy/speed/heading ride as bit-pattern deltas against the previous fix
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
// the refusal data, per the PR #29 Codex fix); a structurally broken entry ends
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
function _fxState(e) { // the delta state an absolute entry leaves behind for the next entry's encoding (nulls where a field cannot anchor a delta)
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
function _fxEncEntry(w, e, st) { // append one entry's bytes; returns the state the NEXT entry chains from. The one encoder: save, measure and decode-mirror all follow it
  const out = Array.isArray(e[6]) ? e[6] : null;
  let key = !st || st.latB === null || st.lngB === null || !_fxFin(e[1]) || !_fxFin(e[2]) || !Number.isInteger(e[0]) || !Number.isInteger(st.ts);
  let dLat = null, dLng = null;
  if (!key) { dLat = _fxDelta(e[1], _fxUUnbits(st.latB)); dLng = _fxDelta(e[2], _fxUUnbits(st.lngB)); if (dLat === null || dLng === null) key = true; }
  if (!key && e[0] < st.ts) key = true; // a backwards timestamp (the out-of-order fix the logger records before the gate refuses it) cannot ride the unsigned gap varint — the entry keyframes instead
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
  const runV = (_fxFin(e[7]) && Number.isInteger(e[7]) && e[7] >= 0) ? e[7] : 0; // 2026-11-15 (load sanitizer round, B-02 ride-along): the run rides w.uv(BigInt(runV)) below - BigInt throws on a fractional value and a negative one corrupts the unsigned varint stream. e[7]'s only sources (runStart || 0 at live construction, the decoder's unsigned varint) are non-negative integers, so the guard changes no reachable encoding (byte-identity corpus in tests/proof/proof-fixlog-runv-guard-b02.mjs); it hardens the encoder boundary only
  const runCh = !st || runV !== st.run;
  w.u8((key ? 1 : 0) | (out ? 2 : 0) | (outFull ? 4 : 0) | (runCh ? 8 : 0));
  if (key) {
    if (_fxFin(e[0])) { w.u8(1); w.uv(_fxUBits(e[0])); } else w.u8(0); // the absolute timestamp rides as its float64 bit pattern: integer, fractional or negative, the exact delivered value survives (an integer-only conversion throws on a fractional timestamp — Codex P2, PR #31)
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
function fixLogDecodeSessions(parsed) { // any stored / backup fix log value -> the absolute in-memory sessions, through the one lens (see the e3 note above); a value that is not a fix log at all decodes to []
  const numOrNull = x => (typeof x === 'number' && isFinite(x)) ? x : null;
  const sessions = [];
  const pushS = (s, fixes) => { if (fixes.length) sessions.push({ v: typeof s.v === 'string' ? s.v : '', t0: Number.isFinite(s.t0) ? s.t0 : 0, f: fixes }); };
  if (Array.isArray(parsed)) { // the v1 form (≤ Beta 1.189): absolute entries, the 1.189 lens verbatim
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
        if (r.i !== s.b) throw new Error('fx trailing'); // the stream must be consumed exactly — a length or count lie ends the session whole rather than trusting a prefix counted wrong
      } catch (err) { continue; } // a broken packed session is dropped whole (see the e3 note) — never the boot, never the other sessions
      pushS(s, fixes);
    }
  }
  return sessions;
}
const _fxAcct = new WeakMap(); // session -> { b, bl }: the session's byte account (encoded bytes total + per-entry lengths). Kept in a WeakMap, never on the session object itself, so the in-memory sessions stay exactly the 1.189 shape for every other reader — backup rides, validators, snapshots — and the bookkeeping dies with its session
function _fxMeasure(s) { // (re)build a session's byte account. Runs the one encoder into a scratch writer, so the account can never drift from the stored form
  const w = _FxWriter(); let st = null; const bl = [];
  for (const e of s.f) { const before = w.b.length; st = _fxEncEntry(w, e, st); bl.push(w.b.length - before); }
  _fxAcct.set(s, { b: w.b.length, bl });
}
function fixLogEstChars() { // the stored record's estimated length in characters, from the byte accounts: 7 bits ride per packed character, plus each session's JSON shell and the record's own shell and key — deliberately rounded up, so the estimate never under-reads the truth
  let t = 48;
  for (const s of fixLog) { const a = _fxAcct.get(s); t += 80 + Math.ceil((a ? a.b : 0) * 8 / 7); }
  return t;
}
try { fixLog = fixLogDecodeSessions(parseJ(lsGet(LS.fixlog), [])); for (const s of fixLog) { fixLogCount += s.f.length; _fxMeasure(s); } } catch (e) { fixLog = []; fixLogCount = 0; } // a damaged log record costs the debug history, never the boot
function fixLogTrim() { // the caps, enforced at open and at every append: whole oldest sessions go first; only a lone session over a cap is head-trimmed (its newest fixes survive). Two caps (app1): FIXLOG_MAX fixes, and FIXLOG_MAX_CHARS characters of stored record — the second is judged on fixLogEstChars, the byte-accounted estimate, so a stream denser than any model is trimmed by size before the quota can break
  for (const s of fixLog) if (!_fxAcct.has(s)) _fxMeasure(s); // a session that arrived without its byte account (a planted or pre-accounting record) is measured before any cap is judged on it
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
      let drop = 0, rs = 0; const excess = fixLogEstChars() - FIXLOG_MAX_CHARS + 128; // ONE computed drop per trim, walked 128 characters past the excess so the estimate's own deliberate over-read is covered and the landing is under the cap in a single pass
      const share = () => Math.ceil(a.b * 8 / 7) - Math.ceil(Math.max(0, a.b - rs) * 8 / 7); // the drop is judged on the AGGREGATE packed size, exactly as fixLogEstChars reads it — summing per-entry ceilings over-counts by up to a character per entry and the walk would stop hundreds of characters short of the cap
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
function fixLogRaw(pos) { // acceptFix's first act: the raw fix, before any gate. Returns the live entry for fixLogOut, or null (no session, or any fault — the GPS path never hears about it)
  try {
    if (!fixLogEnabled) return null; // Beta 1.195: THE gate — off means the fix is never recorded and the log's storage is never touched
    if (!fixLogSession) fixLogOpen(); // the switch may have been flipped on mid-watch (startGps's fixLogOpen was a no-op while off): open the session now, so recording starts with THIS fix
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
function fixLogOut(e) { // the same fix, after the estimator has run on it: gpsPos IS the filtered position, dispPos the display's re-anchored point, smHeading the camera's course
  try {
    if (!e) return;
    e[6] = [+gpsPos[0].toFixed(6), +gpsPos[1].toFixed(6), dispPos ? +dispPos[0].toFixed(6) : null, dispPos ? +dispPos[1].toFixed(6) : null, smHeading != null ? Math.round(smHeading * 10) / 10 : null];
    const a = fixLogSession ? _fxAcct.get(fixLogSession) : null;
    if (a) { // the output grew the entry: re-measure it and correct the byte account
      const f = fixLogSession.f; let idx = f.length - 1;
      if (f[idx] !== e) idx = f.lastIndexOf(e);
      if (idx >= 0 && a.bl[idx] !== undefined) { const w = _FxWriter(); _fxEncEntry(w, e, idx > 0 ? _fxState(f[idx - 1]) : null); a.b += w.b.length - a.bl[idx]; a.bl[idx] = w.b.length; }
    }
    fixLogTrim(); // the output may have grown the account past the character cap since fixLogRaw's trim — re-apply the caps now, not at the next append: a save + reload in between would meet the overage at boot (Codex P2, PR #31)
  } catch (err) {}
}
function fixLogClose() { if (!fixLogSession) return; fixLogSession = null; markDirty('fixlog'); } // the tail flushes on the normal cadence (heartbeat / forced flush), like the trail's. Beta 1.195: the no-session early return is load-bearing for the toggle — with logging off, fixLogOpen never opened a session, and a close that still marked the log dirty would make the next flush WRITE an (empty) record, breaking the off state's zero-writes rule (drive194 T1 caught exactly that: a stop with the switch off landed {"e":3,"s":[]} in storage)
/** @returns {StorageOutcome} */ function saveFixLog() { const ok = lsSet(LS.fixlog, JSON.stringify(fixLogEncodeSessions(fixLog))); return ok ? storeOk() : storeFail('fixlog', true); } // Beta 1.190: the record lands in the e3 stored form (see the codec note at the loader) — the in-memory sessions stay absolute
function acceptFix(pos) {
  const fxEnt = fixLogRaw(pos); // Beta 1.189: the raw fix is logged BEFORE every gate below — a refused fix is recorded as delivered, with no estimator output
  const now = Date.now(); const ll = [pos.coords.latitude, pos.coords.longitude]; const acc = pos.coords.accuracy || 999;
  if (!Number.isFinite(ll[0]) || !Number.isFinite(ll[1]) || Math.abs(ll[0]) > 90 || Math.abs(ll[1]) > 180) return; // audit G1: never let a non-finite or off-Earth fix reach the smoothing, trail or coverage math
  if (typeof pos.timestamp === 'number' && lastFixTs && pos.timestamp < lastFixTs) return; // Beta 1.64 (audit R01): a delayed or out-of-order callback must not move the dot, trail or coverage backwards
  if (acc > GPS_ACCURACY_M && lastGood && now - lastGood.at < 10000) return;
  if (acc <= GPS_ACCURACY_M) lastGood = { ll, at: now };
  const speed = pos.coords.speed;
  lastFixAt = now; if (typeof pos.timestamp === 'number') lastFixTs = pos.timestamp; gpsAccM = acc; gpsDenied = false; if (typeof speed === 'number' && isFinite(speed) && speed >= 0) lastFixSpd = speed; // Beta 1.111: a live fix clears any earlier denial for the Status row. Beta 1.198 (Codex P2, PR #45): the tracked-speed credit for followCam's relative correction cap, refreshed here — past every refusal return above, so only an accepted fix can set it; the platform speed is Doppler-derived (the vehicle's true speed), so a position re-anchor can never inflate it
  renderTick(performance.now()); // Beta 1.66's settle, kept: advance the display to NOW on the OLD track before re-anchoring - a display re-anchored from a stale position makes the dot chase leftover distance, which is exactly the wander drive127 S1/S2 measure
  const { est: sm, snap } = kfUpdate(ll, acc, now); // the filter subsumes the old deadband: sub-noise moves barely shift the estimate, so no fix needs swallowing
  const firstFix = !gpsPos;
  gpsPos = sm;
  const pred = kfPredict(); // Beta 1.115: re-anchor the display on the NEW track without a jump - the gap between where the dot is drawn and where the new track puts it becomes the decaying offset; a reacquisition (snap) takes the new position outright
  if (snap || !dispPos || !pred) { dispOff = [0, 0]; if (pred) dispPos = pred; }
  else dispOff = [(dispPos[0] - pred[0]) * MLAT, (dispPos[1] - pred[1]) * MLNG];
  startRenderLoop(); // the old glide started the loop here; the coasting display needs it just as much (a fix can arrive on an existing watch and must still render)
  updateHeading(pos.coords.heading, speed, now);
  dispHoldFix(speed, ll); // Beta 1.194: the stillness hold's per-fix feed, at the same instant fixLogOut below reads dispPos - the basis the judging simulation was proven on. Display-only: nothing recorded reads its state.
  snapFix(speed, acc, ll); // Beta 1.204: the driving snap's per-fix feed, beside the hold's - raw fix in, snap state out. Display-only by the same invariant: it runs BEFORE fixLogOut and the recording block below, and neither reads its state (they read gpsPos/dispPos, which the snap never writes).
  if (typeof pos.coords.heading === 'number' && speed && speed >= 1) { lastCourseAt = now; setFacing(pos.coords.heading, 0.5); } // moving: face along the course
  fixLogOut(fxEnt); // Beta 1.189: the estimator has run — filtered position, display position and smoothed heading join the raw fix in the log
  const spd = $('spdNum'); // Beta 1.220: the speed circle's number, written on the same per-fix cadence the retired pill used. Visibility is the WATCH's alone now (startGps shows the circle, stopGps hides it - Andrew's gate is the location button), so a fix only ever updates the number: at rest, or with no speed reported, it reads 0 km/h rather than vanishing
  spd.textContent = String(Math.round(Math.max(0, speed || 0) * 3.6)); // the bare number - the KM/H unit is the circle's own centred label now
  if (firstFix && map && (gpsFromRun || watchId != null) && !followPaused) { map.jumpTo({ center: [sm[1], sm[0]], zoom: Math.max(map.getZoom(), 15) }); camVel = [0, 0]; camBVel = 0; camUncapped = false; } // Beta 1.198: a teleport voids the camera springs' velocity state — the glide starts from rest at the jumped centre // Beta 1.146 (census C4): the map && guard - this first-fix jump sat BEFORE the trail/coverage block below, so in the map-failure world its throw starved recording on fix 1 exactly as followCam's did from fix 2 on // Beta 1.116 (audit CG-115-02): a drag made while waiting for this fix already claimed the camera - the fix still records the position (gpsPos/dispPos above), and with dispPos set the syncCentreBtn rule lights the re-centre button as the way back; no jump, no clear
  // outside-route note (route box + 400 m)
  const inB = routeBox ? (sm[0] > routeBox.s - 0.0036 && sm[0] < routeBox.n + 0.0036 && sm[1] > routeBox.w - 0.005 && sm[1] < routeBox.e + 0.005) : true; // Beta 1.117: no box (no route / empty pack) - no area to be outside of, so no note
  if (!inB && offRouteArmed) { offRouteArmed = false; }
  if (inB) offRouteArmed = true;
  if (runStart && gpsFromRun) { // Beta 1.49 (Andrew's rule): route data is recorded ONLY by a clean's own GPS - the Locate tab's view-only watch never writes trail or coverage, even if a stale flag disagrees
    if (runDist.run !== runStart) adoptRunDist(); // Beta 1.167 (B5): first recorded fix of a run the counter has not met (a mid-run reload, a pre-1.167 start) - adopt the banked record or re-derive from the surviving trail
    const stillFix = typeof speed === 'number' && speed >= 0 && speed < GPS_STILL_MPS; // Beta 1.187 (GPS package, STOP B): a stopped fix records nothing - no trail point, no banked segment; coverage below still runs on it (a truck edging a driveway at creep pace keeps earning its streets), and the next moving fix measures its segment from the last RECORDED point, so genuine distance survives the guard. A fix reporting no speed is no evidence of stillness and records as before.
    if (!stillFix) {
      const runSec = Math.floor(runStart / 1000);
      const prevPt = (runDist.end && (!trail.length || runDist.end[2] > trail[trail.length - 1][2])) ? runDist.end : (trail.length ? trail[trail.length - 1] : null); // Beta 1.193 (gate rounds, Codex P2 x2): the segment anchor is the counter's endpoint when it is newer than the trail's tail (the crash case - the bank ahead of the flushed trail); the endpoint is never written into the trail, so trailKm keeps summing only recorded pairs. In the normal case end IS the trail's tail (it is replaced with every recorded point, just below) and nothing changes.
      const newPt = [+sm[0].toFixed(6), +sm[1].toFixed(6), Math.floor(now / 1000)];
      if (prevPt && prevPt[2] >= runSec && newPt[2] - prevPt[2] <= 300) { const seg = distM(prevPt, newPt); if (seg <= 1000) runDist.m += seg; } // trailKm's own pair rule, applied at record time so the total survives the cap below
      trail.push(newPt);
      runDist.end = newPt; // Beta 1.193 (gate rounds, Codex P2 x2): the endpoint rides the banked record - adoption restores it as the segment anchor (never as a trail point), so a crash that loses the trail's buffered tail cannot make the next segment re-measure banked travel, and no synthetic edge ever reaches the derivation
      while (trail.length && trail[0][2] < newPt[2] - TRAIL_WINDOW_S) trail.shift(); // Beta 1.193 (trail redesign): the window eviction, applied at append - points are chronological, so the head is the oldest; everything older than the newest point minus 60 minutes leaves. Through 1.190 a TRAIL_MAX point cap spliced the head and flagged the counter (capped) when it ate this run's points; under the window the eviction is routine, flags nothing, and the counter above is the authority the fallback stands behind.
      persistRunDist(false);
      markDirty('trail');
    }
    flushAux(false);
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
  if (e && e.code === 1) { gpsDenied = true; toast('Location is off - allow location for this site in your browser settings', 4200); stopGps(); return; }
  if (Date.now() - weakToastAt > 60000) { weakToastAt = Date.now(); toast('GPS signal weak - still trying', 2600); }
}
function startGps(fromRun, restart) {
  if (watchId != null) { if (fromRun) { gpsFromRun = true; $('gpsBtn').classList.add('on'); $('gpsBtn').classList.toggle('rec', true); renderIcons(); } return; } // Beta 1.64 (audit F06): reusing a view-only watcher for a clean must still flip the Locate tab to its recording face - the class sync sits below this early return, so the tab used to stay blue while recording
  if (!navigator.geolocation) { toast('This device has no GPS access here', 3000); return; }
  gpsFromRun = !!fromRun; if (!restart) followPaused = false; lastPushKey = ''; startCompass(); // Beta 1.116 (audit CG-115-01): the stale-watch restart passes restart=true - it is the app's own housekeeping, not a user action, so it must not clear a suspension the user deliberately made; only an explicit start begins un-suspended
  const wg = ++watchGen; watchId = navigator.geolocation.watchPosition(p => { if (wg === watchGen) acceptFix(p); }, e => { if (wg === watchGen) gpsError(e); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }); // Beta 1.69 (audit N04): callbacks carry their watcher's generation - a queued callback from a stopped or replaced watcher is dropped even when its timestamp is fresh (R01's guard cannot tell watchers apart)
  fixLogOpen(); // Beta 1.189: a new watch is a new log session (the stale-watch restart re-opens one too - each locate-on period is segmented honestly)
  startRenderLoop(); // Beta 1.65: the frame-synced loop keeps centring between fixes (the Beta 1.28 camTimer's job, drive126 F2) - on the display's own clock now, not a second timer
  clearInterval(staleWatchTimer);
  staleWatchTimer = setInterval(() => { if (watchId != null && Date.now() - lastFixAt > GPS_STALE_MS && lastFixAt) { const wasRunGps = gpsFromRun; stopGps(true); startGps(wasRunGps, true); } }, 15000); // Beta 1.48 (audit B02): capture run ownership BEFORE stopGps clears it - the restart used to always come back as non-run GPS, so a mid-run watcher lost its run. Beta 1.116 (CG-115-01): the restart also preserves followPaused (startGps's restart flag) - a dead zone must not hand the camera back
  $('gpsBtn').classList.add('on');
  $('gpsBtn').classList.toggle('rec', gpsFromRun); // Beta 1.49: recording wears red on the Locate tab; view-only wears blue
  renderIcons(); // Beta 1.218: the Locate face (red view-only / green recording, per pack) follows the state flip at once
  $('spdNum').textContent = '0'; $('spdPill').classList.remove('hidden'); // Beta 1.220: the speed circle's gate is the watch itself - it appears as location turns on, reading 0 until the first fix prices a speed; stopGps hides it again
}
function stopGps(silent) {
  watchGen++; // Beta 1.69: invalidate any callback still queued from this watcher
  fixLogClose(); // Beta 1.189: the log session ends with the watch
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null; gpsFromRun = false; clearInterval(staleWatchTimer); dispOff = [0, 0]; dispHoldReset(); snapReset(); beamDeg = null; beamVel = 0; lastBeamAt = 0; // Beta 1.220: the beam spring resets with the display state // Beta 1.194: the stillness hold retires with the watch (dispHoldReset, beside the display offset's own reset) - a held point must never freeze the puck across location sessions. Beta 1.204: the road snap retires with it, for the same reason (snapReset, beside dispHoldReset).
  if (renderRaf) { cancelAnimationFrame(renderRaf); renderRaf = 0; }
  clearInterval(renderPump); renderPump = 0; stopCompass(); // Beta 1.64 (audit F08); Beta 1.65: the render loop stops with the watch
  if (map) pushGps(); // Beta 1.48 (audit B05): the facing beam is only built while watchId lives - without a fresh push the last beam stayed drawn after stop
  $('gpsBtn').classList.remove('on'); $('gpsBtn').classList.remove('rec'); renderIcons(); $('spdPill').classList.add('hidden'); syncCentreBtn(); // Beta 1.115: location off - the re-centre button goes with it. Beta 1.203: the speed pill goes with it too - its gate is the watch
}
$('gpsBtn').addEventListener('click', () => { if (!tapGuard('gpsBtn')) return; if (watchId != null) { if (followPaused) { resumeFollow(); } else stopGps(); } else if (runStart) { startGps(true); } else { startGps(false); } }); // Beta 1.49 (Andrew's rule): the Locate tab alone never records - with no clean open it is view-only; pressed during an open clean it resumes that clean's recording and says so. Beta 1.115 (Andrew): with the follow suspended, Locate means "take me back to my dot" and resumes it - off is the tap while following.
$('centreBtn').addEventListener('click', () => { if (!tapGuard('centreBtn')) return; resumeFollow(); }); // Beta 1.115: the top-right re-centre button (below day/night) - visible only while suspended (syncCentreBtn)
