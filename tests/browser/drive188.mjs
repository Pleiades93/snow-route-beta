import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive188: Beta 1.169 (Carbon fix round) - the app-side graded fixes,
// proven end-to-end in a real page:
//   A: B-07 - one definition of a clean's street count (cleanCount):
//      a full clean with one null-timestamped street counts 34 in
//      histDur, qualifies as refRun's full reference, and reads the
//      same in the pace list, the reference line and the clean detail.
//   B: B-06 - cleanWorkM's legacy merge is PER STREET: a completed
//      street missing from the sides map falls back to the items
//      derivation for that street (no more RP-09 short-circuit), and
//      a street present in the map is priced by its bits - including
//      partial-side work on a street items never completed.
//   C: B-11 + B-02 - GPS suggestions QUEUE (a second qualifying street
//      takes the banner when the first is answered instead of being
//      overwritten into silence), and sugYes with map === null still
//      selects the street (the 1.146 C4 guard idiom) instead of
//      throwing on map.getZoom().
//   D: A-01 - the note editor's blur save and street-switch flush
//      surface a failed write: blur answers in the hint with the
//      debounced path's own words; a switch flush whose episode
//      warning already fired is owed the plain 'not saved' toast
//      (the Beta 1.97 finishChangeMarked contract).
//   E: A-03 - loadSides' done-time inheritance fills MISSING piece
//      stamps on a partially-recorded street, never overwriting a
//      recorded one.
//   F: A-02 - the legacy migration cannot commit on an unreadable
//      field: a throwing legacy read blocks migrateLegacyRoute (the
//      marker stays unwritten) and the unpatched pass then migrates
//      cleanly with parity.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const waitBoot = async () => { for (let i = 0; i < 40; i++) { try { if (await ev(`typeof restoreBackup === 'function' && !!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const toMenu = async () => { await ev(`localStorage.clear(); location.reload(); true`); await waitBoot(); await sleep(2200); };
const loadSettled = async () => { await ev(`loadRoute('5w'); true`); await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000); await poll(`typeof map === 'undefined' || !map || !map.isMoving()`, 25000); await sleep(300); };
const exc = () => consoleLog.filter(c => c.type === 'EXCEPTION').length;

try {
  await toMenu(); await loadSettled();

  // ---- A: B-07 one count everywhere ----
  const a = await J(`(() => {
    const names = STREETNAMES.slice();
    const t0 = Date.parse('2026-01-05T10:00:00.000Z');
    const items = {}; names.forEach((n, i) => { items[n] = new Date(t0 + (i + 1) * 60000).toISOString(); });
    items[names[5]] = null; // one completed street whose moment was never recorded (buildSnap writes exactly this)
    const h = { at: new Date(t0 + 3600000).toISOString(), startedAt: new Date(t0).toISOString(), items, via: {}, notes: {}, sides: { p: {}, t: {} }, km: 0 };
    const d = histDur(h);
    history = [h];
    const ref = refRun();
    histOpen = true; renderPace();
    const pad = document.getElementById('pacePad').textContent;
    openClean(0);
    const meta = document.querySelector('#cleanView .cvMeta').textContent;
    return { n: names.length, dcount: d && d.count, refIs: ref === h, pad, meta };
  })()`);
  ok('A1 histDur counts the null-timestamped street (count === route size) | ' + JSON.stringify({ n: a.n, dcount: a.dcount }), a.dcount === a.n && a.n > 5);
  ok('A2 refRun takes the clean as the FULL reference (a null time is still a cleaned street) | refIs=' + a.refIs, a.refIs === true);
  ok('A3 the pace list and reference line read the same count | pad has "' + a.n + ' of ' + a.n + ' streets" and "(' + a.n + ' streets)"', a.pad.includes(a.n + ' of ' + a.n + ' streets') && a.pad.includes('(' + a.n + ' streets)'));
  ok('A4 the clean detail header agrees | meta: ' + (a.meta || '').slice(0, 120), (a.meta || '').includes(a.n + ' streets'));

  // ---- B: B-06 the fuller legacy derivation ----
  const b = await J(`(() => {
    const t0 = '2026-01-05T10:00:00.000Z';
    const full = n => STRETCH[n].parts.map(() => 3);
    // partial sides: Velmar's sides recorded, Mellings (also completed) has NO sides entry
    const hPartial = { at: t0, items: { Velmar: t0, Mellings: t0 }, sides: { p: { Velmar: full('Velmar') }, t: {} } };
    const itemsDeriv = STRETCH.Velmar.total * 2 + STRETCH.Mellings.total * 2;
    const sidesOnly = (() => { let s = 0; STRETCH.Velmar.parts.forEach((part, i) => { const v = full('Velmar')[i] | 0; const L = segLenM(part); if (v & 1) s += L; if (v & 2) s += L; }); return s; })();
    const gotPartial = cleanWorkM(hPartial);
    // richer sides: an extra partially-marked street (Astona, one side of one part) that items never completed
    const extra = STRETCH.Astona.parts.map((_, i) => i === 0 ? 1 : 0);
    const hRich = { at: t0, items: { Velmar: t0 }, sides: { p: { Velmar: full('Velmar'), Astona: extra }, t: {} } };
    const gotRich = cleanWorkM(hRich);
    const richItemsOnly = STRETCH.Velmar.total * 2;
    return { gotPartial, itemsDeriv, sidesOnly, gotRich, richItemsOnly };
  })()`);
  ok('B1 a partial sides map reaches the fuller items derivation (no RP-09 short-circuit) | got ' + Math.round(b.gotPartial) + ', items ' + Math.round(b.itemsDeriv) + ', sides-only ' + Math.round(b.sidesOnly), Math.abs(b.gotPartial - b.itemsDeriv) < 0.5 && b.sidesOnly < b.itemsDeriv - 1);
  ok('B2 a richer sides map still wins (partial-side work on an uncompleted street counts) | got ' + Math.round(b.gotRich) + ' > items-only ' + Math.round(b.richItemsOnly), b.gotRich > b.richItemsOnly + 0.5);

  // ---- C: B-11 queue + B-02 no-map sugYes ----
  const c0 = await J(`(() => { suggested = new Set(['Velmar', 'Mellings']); sugQueue = []; showSuggest('Velmar'); showSuggest('Mellings'); return { shown: document.getElementById('suggest').dataset.n, q: sugQueue.slice() }; })()`);
  ok('C1 the second suggestion QUEUES behind the first instead of overwriting it | ' + JSON.stringify(c0), c0.shown === 'Velmar' && JSON.stringify(c0.q) === JSON.stringify(['Mellings']));
  await ev(`document.getElementById('sugNo').click(); true`); await sleep(150);
  const c1 = await J(`({ shown: document.getElementById('suggest').dataset.n, hidden: document.getElementById('suggest').classList.contains('hidden') })`);
  ok('C2 dismissing the first suggestion brings the queued street to the banner | ' + JSON.stringify(c1), c1.shown === 'Mellings' && c1.hidden === false);
  const excBefore = exc();
  const c2 = await J(`(() => { const m = map; map = null; let err = ''; try { document.getElementById('sugYes').click(); } catch (e) { err = String(e && e.message || e); } const selName = sel && sel.name; map = m; return { err, selName, hidden: document.getElementById('suggest').classList.contains('hidden') }; })()`);
  ok('C3 sugYes with NO map still selects the suggested street (no throw on the unguarded flyTo) | ' + JSON.stringify(c2), c2.err === '' && c2.selName === 'Mellings' && c2.hidden === true);
  ok('C4 no page exception across the suggestion flow | exc before ' + excBefore + ', now ' + exc(), exc() === excBefore);

  // ---- D: A-01 note flush surfaces ----
  await ev(`if (!document.getElementById('sheet').classList.contains('open')) document.getElementById('streetsBtn').click(); true`); await sleep(300); // the sheet must be OPEN (the button TOGGLES - section A may have left it open) - a hidden textarea cannot take focus, and blur is the event under test
  const d0 = await J(`(() => { closeClean(); listFilter = 'mains'; noteOpenFor = 'Velmar'; renderStreets(); const ta = document.querySelector('.noteEd textarea'); return { hasTa: !!ta }; })()`); // closeClean: section A's openClean hid #streetList (display:none) - a hidden textarea cannot take focus
  ok('D0 the note editor opens on Velmar | ' + JSON.stringify(d0), d0.hasTa === true);
  const d1 = await J(`(() => {
    const orig = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('quota'); };
    const ta = document.querySelector('.noteEd textarea'); ta.focus(); ta.value = 'drive188 blur note';
    ta.blur();
    const hint = document.querySelector('.noteEd .nhint').textContent;
    Storage.prototype.setItem = orig;
    return { hint };
  })()`);
  ok('D1 a blur save that FAILS says so in the hint, in the debounced path\'s own words | hint: ' + d1.hint, d1.hint === 'Not saved — storage problem');
  const d2 = await J(`(() => {
    saveWarned = true; // the episode warning already fired earlier in this session - saveAllWarned will NOT toast again
    const orig = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('quota'); };
    noteOpenFor = 'Velmar'; renderStreets();
    const ta = document.querySelector('.noteEd textarea'); if (ta) ta.value = 'drive188 switch note';
    noteOpenFor = 'Mellings'; renderStreets(); // switching streets finalizes Velmar's editor through the :408 flush
    Storage.prototype.setItem = orig; saveWarned = false;
    const t = document.getElementById('toast');
    return { toast: t.textContent, shown: t.classList.contains('show') };
  })()`);
  ok('D2 a street-switch flush that fails with the episode warning already spent is owed the plain not-saved toast | ' + JSON.stringify(d2), d2.toast === 'Not saved — storage problem' && d2.shown === true);

  // ---- E: A-03 partial pieceTimes inheritance ----
  const e = await J(`(() => {
    const n = STREETNAMES.find(x => STRETCH[x].parts.length >= 2);
    const rk = routeKeys('5w');
    const T0 = '2026-01-05T10:00:00.000Z', T1 = '2026-01-05T10:05:00.000Z';
    const cnt = STRETCH[n].parts.length;
    const p = {}; p[n] = Array.from({ length: cnt }, () => 3);
    const t = {}; t[n] = [[T0, T0]]; // ONLY the first stretch carries stamps - the rest are the partial-record holes
    const times = {}; times[n] = T1;
    localStorage.setItem(rk.sides, JSON.stringify({ p, t }));
    localStorage.setItem(rk.times, JSON.stringify(times));
    localStorage.setItem(rk.done, JSON.stringify([n]));
    loadRouteState('5w');
    return { n, cnt, pt: pieceTimes[n] };
  })()`);
  ok('E1 the unstamped stretches inherit the street\'s done time; the recorded stamp is untouched | ' + JSON.stringify(e.pt), e.pt && e.pt.length === e.cnt && e.pt[0][0] === '2026-01-05T10:00:00.000Z' && e.pt[1][0] === '2026-01-05T10:05:00.000Z' && e.pt[1][1] === '2026-01-05T10:05:00.000Z');

  // ---- F: A-02 migration cannot commit on an unreadable field ----
  const f = await J(`(() => {
    const rk = routeKeys('5w');
    localStorage.removeItem(rk.mig); localStorage.removeItem(rk.hist); localStorage.removeItem(rk.sides);
    localStorage.setItem(LEGACY_KEYS.sides, JSON.stringify({ p: {}, t: {} }));
    localStorage.setItem(LEGACY_KEYS.hist, JSON.stringify([{ at: '2026-01-01T00:00:00.000Z', items: {} }]));
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) { if (k === LEGACY_KEYS.hist) throw new Error('flaky storage'); return orig.call(this, k); };
    const blocked = migrateLegacyRoute('5w');
    Storage.prototype.getItem = orig;
    const markerAfterBlock = localStorage.getItem(rk.mig);
    const clean = migrateLegacyRoute('5w');
    return { blocked, markerAfterBlock, clean, marker: localStorage.getItem(rk.mig), slotHist: localStorage.getItem(rk.hist) === localStorage.getItem(LEGACY_KEYS.hist) };
  })()`);
  ok('F1 a THROWING legacy read blocks the migration (returns false, marker never written) | ' + JSON.stringify({ blocked: f.blocked, markerAfterBlock: f.markerAfterBlock }), f.blocked === false && f.markerAfterBlock === null);
  ok('F2 the unpatched pass migrates cleanly with parity (marker set, history copied) | ' + JSON.stringify({ clean: f.clean, marker: f.marker, slotHist: f.slotHist }), f.clean === true && f.marker === '1' && f.slotHist === true);
} catch (e) {
  ok('drive188 completed without a harness-level throw: ' + String(e && e.message || e), false);
}
finish(R, proc);
