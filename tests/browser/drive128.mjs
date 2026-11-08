import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive128: Beta 1.28 multi-select (Andrew: tap several sections, then mark a side
// or both sides on all of them at once). Taps accumulate, tapping a selected section
// removes just it, an empty-map tap clears all, the chips act on the whole set with
// complete-the-set semantics, and the selBar pill marks both sides of the set.
// Single-select behaviour must stay exactly as before.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
await sleep(3000);
ok('F0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

const MIDS = JSON.parse(await ev(`(() => { // tap points chosen for a clean win: Velmar's stitched line revisits some vertices
  // (parts 2, 5 and 6 have a midpoint exactly on a neighbour's line - a 0.00 m tie that screen
  // rounding decides by lottery), so each part contributes the vertex FARTHEST from every other part
  const MLAT = 111320, MLNG = 80386;
  const seg = (p, a, b) => { const vx = b[1]*MLNG - a[1]*MLNG, vy = b[0]*MLAT - a[0]*MLAT; const L2 = vx*vx + vy*vy; let t = L2 ? (((p[1]*MLNG - a[1]*MLNG) * vx) + ((p[0]*MLAT - a[0]*MLAT) * vy)) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[1]*MLNG - (a[1]*MLNG + vx*t), p[0]*MLAT - (a[0]*MLAT + vy*t)); };
  const parts = STRETCH.Velmar.parts; const out = [];
  for (let idx = 0; idx < 3; idx++) {
    let bestPt = null, bestMargin = -1;
    for (const v of parts[idx]) {
      const ds = parts.map((p2, j) => { let d = 1e9; for (let i = 1; i < p2.length; i++) d = Math.min(d, seg(v, p2[i-1], p2[i])); return d; });
      const others = Math.min(...ds.filter((_, j) => j !== idx));
      if (others > bestMargin) { bestMargin = others; bestPt = v; }
    }
    out.push(bestPt);
  }
  return JSON.stringify(out); })()`));
const tapAt = async (ll) => { // a REAL dispatched tap (CDP mouse events at the projected point) - map.fire('click') resolved each tap to the PREVIOUS tap's stretch in this rig (ids came back 0,0,1 for taps 0,1,2), so the synthetic shortcut cannot be trusted; the real path is also what a finger does
  await ev(`(() => { map.jumpTo({ center: [${ll[1]}, ${ll[0]}], zoom: 16 }); return true; })()`); await sleep(300);
  const pt = JSON.parse(await ev(`(() => { const p = map.project([${ll[1]}, ${ll[0]}]); return JSON.stringify({ x: p.x, y: p.y }); })()`));
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 }, S);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 }, S);
  await sleep(300); };
const selState = async () => JSON.parse(await ev(`(() => JSON.stringify({ ids: selSet.map(en => en.idx).join(','), n: selSet.length, bar: !$('selPop').classList.contains('hidden'), txt: $('selName').textContent, pieces: [0, 1, 2].map(i => pieces.Velmar[i]), chips: document.querySelectorAll('.sideChip').length, selFeats: ((map.getSource('sel') || {})._data || {}).features ? map.getSource('sel')._data.features.length : -1 }))()`));
const popMetrics = async () => JSON.parse(await ev(`(() => { const r = $('selPop').getBoundingClientRect(); return JSON.stringify({ h: r.height, w: r.width, status: getComputedStyle($('selStatus')).display, statusTxt: $('selStatus').textContent, note: $('selNote').style.display, btn: $('selBtn').style.display }); })()`));

// ---- M1: three consecutive taps accumulate ----
// Beta 1.42: the start-up splash overlays the first seconds by design and a real
// tap on it goes nowhere - wait until it has removed itself before tapping, or
// the first tap is silently swallowed. (drive132 owns the splash's own checks.)
await poll120(`!document.getElementById('splash')`, 20000);
await tapAt(MIDS[0]); await tapAt(MIDS[1]); await tapAt(MIDS[2]);
let SS = await selState();
ok('M1 three taps select three sections, the pill shows, and all three highlight | ' + JSON.stringify(SS),
  SS.n === 3 && SS.bar === true && SS.txt === '3 sections selected' && SS.selFeats === 3 && SS.chips === 2); // (pop-up wording since 1.34)

const PM1 = await popMetrics();
ok('M1 multi (same road) is the SAME card as a single (Beta 1.34): status line present with the set sides tally, note + whole-street buttons stay out | ' + JSON.stringify(PM1),
  PM1.status !== 'none' && /^\d+ of 6 sides done$/.test(PM1.statusTxt) && PM1.note === 'none' && PM1.btn === 'none');

// ---- M2: one side chip marks that side on ALL selected ----
await ev(`document.querySelectorAll('.sideChip .chipBtn')[1].click()`); await sleep(400);
SS = await selState();
ok('M2 the side chip marks side 1 on every selected section | ' + JSON.stringify(SS.pieces), SS.pieces.every(p => (p & 2) === 2) && SS.n === 3);

// ---- M3: Mark both sides completes the set ----
await ev(`$('selAllBtn').click()`); await sleep(400);
SS = await selState();
ok('M3 Mark both sides completes every selected section | ' + JSON.stringify(SS.pieces), SS.pieces.every(p => p === 3));

// ---- M4: a chip on a fully-done side clears that side everywhere ----
await sleep(500);
await ev(`document.querySelectorAll('.sideChip .chipBtn')[0].click()`); await sleep(400);
SS = await selState();
ok('M4 the chip on a fully-done side clears side 0 on every selected section | ' + JSON.stringify(SS.pieces), SS.pieces.every(p => p === 2));

// ---- M5: tapping a selected section removes just it ----
await tapAt(MIDS[1]);
SS = await selState();
ok('M5 tapping a selected section removes only it | ' + JSON.stringify(SS),
  SS.n === 2 && SS.bar === true && SS.pieces[1] === 2 && SS.pieces[0] === 2 && SS.pieces[2] === 2);

// ---- M6: an empty-map tap clears the whole selection ----
await tapAt([MIDS[0][0] + 0.05, MIDS[0][1] + 0.05]);
SS = await selState();
ok('M6 tapping empty map clears the selection and hides the pop-up | ' + JSON.stringify(SS), SS.n === 0 && SS.bar === false && SS.chips === 0);

// ---- M7: single-select is unchanged - fresh selection, chip touches one stretch only ----
await ev(`(() => { selectStretch('Velmar', 0, [${MIDS[0][0]}, ${MIDS[0][1]}]); return true; })()`); await sleep(300);
await ev(`document.querySelectorAll('.sideChip .chipBtn')[0].click()`); await sleep(400);
SS = await selState();
ok('M7 single-select: the chip toggles only the one stretch and the merged pop-up shows the street (one pop-up for every selection since 1.30) | ' + JSON.stringify(SS),
  SS.n === 1 && SS.bar === true && SS.txt === 'Velmar' && SS.pieces[0] === 3 && SS.pieces[1] === 2 && SS.pieces[2] === 2);
const PM7 = await popMetrics();
ok('M7 a single selection shows the card with its status line | ' + JSON.stringify(PM7), PM7.status !== 'none');
// M7b (Beta 1.34, Andrew): adding a second section must NOT change the pop-up's size -
// one box for one section or many, measured both ways.
await ev(`(() => { tapStretch('Velmar', 1, STRETCH.Velmar.line[10]); return true; })()`); await sleep(300);
const PM7b = await popMetrics();
ok('M7b the two-section pop-up is exactly the single card size (same width, same height) | single ' + JSON.stringify(PM7) + ' multi ' + JSON.stringify(PM7b),
  Math.abs(PM7b.w - PM7.w) <= 1 && Math.abs(PM7b.h - PM7.h) <= 1 && PM7b.status !== 'none');
await ev(`(() => { selectStretch('Velmar', 0, [${MIDS[0][0]}, ${MIDS[0][1]}]); return true; })()`); await sleep(300);
const L7 = JSON.parse(await ev(`(() => { const nm = $('selName').getBoundingClientRect(), acts = document.querySelector('.selActs').getBoundingClientRect(); return JSON.stringify({ nameH: nm.height, actsBelow: acts.top >= nm.bottom - 1, shadow: getComputedStyle($('selPop')).boxShadow }); })()`));
ok('M7 the card is stacked clean: one-line name on top, actions in their own row below, gold edge for the unfinished main road | ' + JSON.stringify(L7),
  L7.nameH <= 24 && L7.actsBelow === true && L7.shadow.includes('255, 194, 51'));

// M11 (Beta 1.39, Andrew): Mark completed and Mark both sides are ONE green -
// the both-sides green (#2ecc71) is the official one. Measured as computed
// style on the live buttons, not read from the stylesheet.
const GRN = JSON.parse(await ev(`(() => { const b1 = getComputedStyle($('selBtn')), b2 = getComputedStyle($('selAllBtn')); return JSON.stringify({ a: b1.backgroundColor, b: b2.backgroundColor, vis: b1.display !== 'none' }); })()`));
ok('M11 Mark completed and Mark both sides share the one official green (both-sides button hides when the stretch is fully done - its colour is still read live) | ' + JSON.stringify(GRN),
  GRN.vis && GRN.a === 'rgb(46, 204, 113)' && GRN.b === 'rgb(46, 204, 113)');

// ---- M8: tap away from a menu spends the tap (Beta 1.30) ----
await ev(`(() => { $('sheet').classList.add('open'); return true; })()`); await sleep(300);
const tapPx = async (x, y) => { // a real tap at raw viewport pixels (the open sheet covers the centre, so tapAt's centred tap would land on the sheet itself)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, S);
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, S);
  await sleep(300);
};
await tapPx(30, 200); // open map, above the sheet, clear of the header and the pop-up
const M8 = JSON.parse(await ev(`(() => JSON.stringify({ sheetOpen: $('sheet').classList.contains('open'), n: selSet.length }))()`));
ok('M8 tapping away closes the sheet AND the same tap never reaches the map (selection intact) | ' + JSON.stringify(M8),
  M8.sheetOpen === false && M8.n === 1);

// ---- M9: two sections on two DIFFERENT roads - the same compact pill ----
await ev(`(() => { deselect(); tapStretch('Velmar', 0, STRETCH.Velmar.line[10]); tapStretch('Astona', 0, STRETCH.Astona.line[10]); return true; })()`); await sleep(300);
const SS9 = await selState(); const PM9 = await popMetrics();
ok('M9 two roads selected: same card, same wording, sides tally on the status line | ' + JSON.stringify({ SS9, PM9 }),
  SS9.n === 2 && SS9.txt === '2 sections selected' && PM9.status !== 'none' && /^\d+ of 4 sides done$/.test(PM9.statusTxt));
await ev(`deselect()`);

// ---- M10: the colour edge mirrors the street's state ----
await ev(`(() => { selectStretch('Boddy', 0, STRETCH.Boddy.line[3]); return true; })()`); await sleep(250);
let AC = await ev(`getComputedStyle($('selPop')).boxShadow`);
ok('M10 a regular unfinished street wears the raspberry edge | ' + AC, AC.includes('239, 71, 111'));
await ev(`(() => { $('selBtn').click(); return true; })()`); await sleep(400);
AC = await ev(`getComputedStyle($('selPop')).boxShadow`);
ok('M10 once the street is complete the edge turns mint | ' + AC, AC.includes('6, 214, 160'));
await ev(`(() => { markUndone('Boddy'); deselect(); return true; })()`);

// ---- M12: Beta 1.146 (census C3) - Mark both sides on a FAILED save ----
// selAllBtn used to test the storage-outcome OBJECT for truthiness
// ({ok:false} is truthy), so the '✓ Street · time' success toasts fired
// beside the storage warning. Fault-inject the sides write (the drive118
// seam), select EVERY Velmar stretch so Mark both sides completes the
// street, and click: NO success toast may appear - the toast must be the
// storage warning (or the plain 'Not saved' of finishChangeMarked).
await ev(`(() => { deselect(); STRETCH.Velmar.parts.forEach((_, i) => tapStretch('Velmar', i, STRETCH.Velmar.line[0])); return true; })()`); await sleep(300);
const sel12 = JSON.parse(await ev(`JSON.stringify({ n: selSet.length, total: STRETCH.Velmar.parts.length })`));
await ev(`(() => { window.__origSI12 = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === LS.sides) throw new Error('injected quota failure'); return window.__origSI12.call(this, k, v); }; return true; })()`);
await ev(`$('selAllBtn').click()`); await sleep(400);
const toast12 = await ev(`$('toast').textContent`);
await ev(`(() => { Storage.prototype.setItem = window.__origSI12; saveAll(); return true; })()`); await sleep(200);
ok('M12 Mark both sides on a failed save: NO success toast - the storage warning stands alone (selection was all ' + sel12.n + ' of ' + sel12.total + ' Velmar stretches) | toast: ' + JSON.stringify(toast12),
  sel12.n === sel12.total && sel12.total >= 2 && !/✓/.test(toast12) && /Storage is not saving|Not saved/.test(toast12));
await ev(`(() => { markUndone('Velmar'); deselect(); return true; })()`);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

