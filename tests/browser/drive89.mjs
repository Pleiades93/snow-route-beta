import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route


// drive89: v5.54 Finish pop-up + delete/back navigation
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const exc = () => consoleLog.filter(c => c.type === 'EXCEPTION').length;
const pollRead = async (expr, pred, ms = 9000) => {   // state-polling wait: fixed sleeps raced the pop-up's own timing on a slow CI runner; assertions unchanged, only the waiting is state-based. Hardened per audit T-02 (2026-10-28): the sampled value resets every iteration; a read that errors (page mid-reload) or returns a non-string counts as not-ready instead of reusing the previous read; a timeout returns {} (explicit not-ready), never the last sampled state.
  const t0 = Date.now();
  do {
    let v;
    try {
      const raw = await ev(expr);
      if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { v = undefined; } }
    } catch { v = undefined; }
    if (v !== undefined && pred(v)) return v;
    await sleep(150);
  } while (Date.now() - t0 < ms);
  return {};
};
const mark3 = () => ev(`(() => { const base = Date.now() - 3600000; runStart = base - 300000; saveStart();
  [['Velmar', 0], ['Mellings', 720000], ['Astona', 1500000]].forEach(([n, off]) => { doneSet.add(n); doneTimes[n] = new Date(base + off).toISOString(); doneVia[n] = 'tap'; });
  refreshAll(); return true; })()`);
await sleep(3000);
await ev(`(() => { localStorage.clear(); location.reload(); return true; })()`); await sleep(1200);   // floor wait: let the reload actually begin before polling, so the poll cannot be answered by the pre-reload page
await bootThrough(ev, poll); // Beta 1.95 (SR-194-07 re-baseline): the strict harness exposed that this drive ran its whole flow after this reload with NO route loaded (pieces empty) - mark3's refreshAll threw on the empty board and the old {error} return swallowed it, the mutations before the throw carrying the checks. The flow now runs against a loaded route, as it reads.
// T1: the button is FINISH, wearing Start's splash blue (Beta 1.100: Start and Finish share one style rule)
let A = await pollRead(`(() => { const b = $('resetBtn'); const cs = getComputedStyle(b); return JSON.stringify({ label: b.textContent, bg: cs.backgroundColor }); })()`, v => v.label === 'FINISH');
ok('T1 button says FINISH', A.label === 'FINISH');
ok('T1 button wears the shared splash-blue of Start (Beta 1.100)', A.bg === 'rgb(43, 75, 242)');
// T2: pop-up flow - No changes nothing
await ev(`(() => { $('resetBtn').click(); return true; })()`); await sleep(300);
A = JSON.parse(await ev(`(() => JSON.stringify({ vis: !$('finModal').classList.contains('hidden'), msg: $('finMsg').textContent }))()`));
ok('T2 Finish opens the Yes/No pop-up', A.vis && /Nothing is marked/.test(A.msg));
await ev(`(() => { $('finNo').click(); return true; })()`); await sleep(300);
A = JSON.parse(await ev(`(() => JSON.stringify({ vis: !$('finModal').classList.contains('hidden'), h: history.length }))()`));
ok('T2 No closes the pop-up, nothing saved', !A.vis && A.h === 0);
// T3: Yes saves the clean (with its note); the button stays FINISH - no Undo follows (Beta 1.110)
await mark3();
await ev(`(() => { setNoteText('Velmar', 'Blocked driveway at #12'); return true; })()`);
await ev(`(() => { $('resetBtn').click(); return true; })()`); await sleep(300);
A = JSON.parse(await ev(`(() => JSON.stringify({ msg: $('finMsg').textContent }))()`));
ok('T3 pop-up summarises streets + notes', /3 of 34 streets/.test(A.msg) && /notes on 1 street/.test(A.msg));
await ev(`(() => { $('finYes').click(); return true; })()`);
A = await pollRead(`(() => JSON.stringify({ h: history.length, done: doneSet.size, label: $('resetBtn').textContent, hn: history[0] && history[0].notes && history[0].notes.Velmar ? history[0].notes.Velmar[0].text : '' }))()`, v => v.h === 1 && v.done === 0);
ok('T3 Yes archives the clean with its notes', A.h === 1 && A.done === 0 && /Blocked driveway/.test(A.hn));
ok('T3 after Yes the button shows NO Undo - label stays FINISH (Beta 1.110)', A.label === 'FINISH');
// T4: NO Undo exists any more (Beta 1.110, Andrew): the Yes tap is the whole gate. T4 builds its
// own finish, then watches the button for a full 9 seconds (past the old 8s window): the label must
// never read Undo, the finished run must never come back, and tapping the button again must open
// the finish pop-up for the CURRENT board - not resurrect anything.
await ev(`(() => { history = []; saveHistory(); return true; })()`);
await mark3();
await ev(`(() => { $('resetBtn').click(); return true; })()`);
await pollRead(`(() => JSON.stringify({ open: !$('finModal').classList.contains('hidden') }))()`, v => v.open === true, 4000); // the pop-up must actually be open before Yes is tapped
await sleep(600); // outlast the app's 400ms double-tap guard: a prior Yes tap can be <400ms old on a fast runner - a human cannot re-tap that fast, a test can
await ev(`(() => { $('finYes').click(); return true; })()`);
A = await pollRead(`(() => JSON.stringify({ h: history.length, done: doneSet.size }))()`, v => v.h === 1 && v.done === 0);
ok('T4 setup: the second clean archived', A.h === 1 && A.done === 0);
const labels = [];
const t4end = Date.now() + 9000;
while (Date.now() < t4end) { labels.push(await ev(`(() => $('resetBtn').textContent + '|' + $('resetBtn').classList.contains('undoing'))()`)); await sleep(400); }
ok('T4 no Undo is offered at any moment in the 9s after Yes | samples ' + labels.length + ' saw ' + JSON.stringify([...new Set(labels)]), labels.length >= 10 && labels.every(l => l === 'FINISH|false'));
await ev(`(() => { $('resetBtn').click(); return true; })()`);
A = await pollRead(`(() => JSON.stringify({ open: !$('finModal').classList.contains('hidden'), h: history.length, done: doneSet.size }))()`, v => v.open === true, 4000);
ok('T4 tapping the button after a finish opens the pop-up - the run does NOT come back', A.open === true && A.h === 1 && A.done === 0);
await ev(`(() => { $('finNo').click(); return true; })()`); await sleep(200);
// T5: finish again, then delete returns to Previous cleans (the bug fix)
// Hardened (audit round 3): every tap waits for its observable EFFECT before the next tap - the fixed
// sleeps raced the app's real double-tap guards (T5's resetBtn tap can land inside the 400ms guard
// window of T4's Undo tap on the same button and be silently eaten, stranding the whole chain).
const step = async (tapExpr, effectExpr, pred) => { await ev(tapExpr); return await pollRead(effectExpr, pred, 6000); };
await sleep(600); // same guard window: T4's last tap on this very button can be <400ms old here
await step(`(() => { $('resetBtn').click(); return true; })()`, `(() => JSON.stringify({ open: !$('finModal').classList.contains('hidden') }))()`, v => v.open === true);
await step(`(() => { $('finYes').click(); return true; })()`, `(() => JSON.stringify({ label: $('resetBtn').textContent, h: history.length }))()`, v => v.label === 'FINISH' && v.h === 1);
await step(`(() => { openPace(); return true; })()`, `(() => JSON.stringify({ vis: !$('pacePanel').classList.contains('hidden') }))()`, v => v.vis === true);
await step(`(() => { $('histHead').click(); return true; })()`, `(() => JSON.stringify({ rows: document.querySelectorAll('.histRow').length }))()`, v => v.rows >= 1);
await step(`(() => { document.querySelector('.histRow').click(); return true; })()`, `(() => JSON.stringify({ cvOpen: !$('cleanView').classList.contains('hidden') }))()`, v => v.cvOpen === true);
A = JSON.parse(await ev(`(() => JSON.stringify({ cvOpen: !$('cleanView').classList.contains('hidden') }))()`));
ok('T5 clean detail opened from Previous cleans', A.cvOpen);
await step(`(() => { $('cleanView').querySelector('.cvDel').click(); return true; })()`, `(() => JSON.stringify({ armed: $('cleanView').querySelector('.cvDel').classList.contains('armed') }))()`, v => v.armed === true);
await ev(`(() => { $('cleanView').querySelector('.cvDel').click(); return true; })()`); // confirm tap IMMEDIATELY: the arm expires after 5s, so no poll may sit between the two taps
A = await pollRead(`(() => JSON.stringify({ h: history.length, sheetOpen: $('sheet').classList.contains('open'), paceVis: !$('pacePanel').classList.contains('hidden'), cvHidden: $('cleanView').classList.contains('hidden'), histRows: document.querySelectorAll('.histRow').length }))()`, v => v.h === 0 && !v.sheetOpen && v.paceVis && v.cvHidden, 6000);
ok('T5 clean deleted', A.h === 0);
ok('T5 after delete: Previous cleans showing, NOT the Streets list', !A.sheetOpen && A.paceVis && A.cvHidden);
// T6: Back also returns to Previous cleans
await mark3();
await ev(`(() => { performReset(); openClean(0); return true; })()`);
await pollRead(`(() => JSON.stringify({ cvOpen: !$('cleanView').classList.contains('hidden') }))()`, v => v.cvOpen === true, 6000);
await step(`(() => { $('cleanView').querySelector('.cvBack').click(); return true; })()`, `(() => JSON.stringify({ sheetOpen: $('sheet').classList.contains('open'), paceVis: !$('pacePanel').classList.contains('hidden'), histRows: document.querySelectorAll('.histRow').length }))()`, v => !v.sheetOpen && v.paceVis && v.histRows === 1);
A = JSON.parse(await ev(`(() => JSON.stringify({ sheetOpen: $('sheet').classList.contains('open'), paceVis: !$('pacePanel').classList.contains('hidden'), histRows: document.querySelectorAll('.histRow').length }))()`));
ok('T6 Back returns to Previous cleans too', !A.sheetOpen && A.paceVis && A.histRows === 1);
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);

