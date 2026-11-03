import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route


// drive65 tail: v5.39 audit-fix tests - load validators (BUG-04) + restore suite (BUG-01)
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
await sleep(3200);

// ---- Phase A: corrupt stored data is sanitized on load ----
await ev(`(() => {
  localStorage.setItem('snowroute.5w.v2', JSON.stringify(['Columbus']));
  localStorage.setItem('snowroute.5w.v2.times', JSON.stringify({ Columbus: '2026-10-26T12:00:00.000Z', Galloway: 'not-a-date', Narnia: '2026-10-26T12:00:00.000Z' }));
  localStorage.setItem('snowroute.5w.v2.history', JSON.stringify([
    { at: '2026-10-20T12:00:00.000Z', items: { Velmar: '2026-10-20T12:30:00.000Z' } },
    { at: 'junk', items: {} },
    { at: '2026-10-21T12:00:00.000Z', items: { Columbus: '2026-10-21T12:30:00.000Z', Bad: '2026-10-21T12:30:00.000Z', Velmar: 'junk-time' } },
    'garbage'
  ]));
  location.reload(); return true; })()`);
await sleep(3800);
await ev(`loadRoute('5w'); true`); await sleep(600); // Beta 1.76: a reload lands on the route menu
const A = JSON.parse(await ev(`(() => JSON.stringify({ times: Object.keys(doneTimes), hist: history.map(h => Object.keys(h.items)), done: [...doneSet] }))()`));
ok('A1 bad/foreign times dropped, good kept', JSON.stringify(A.times) === '["Columbus"]');
ok('A2 history keeps 2 valid runs', A.hist.length === 2);
ok('A3 history items sanitized', JSON.stringify(A.hist[1]) === '["Columbus"]');
ok('A4 doneSet intact', JSON.stringify(A.done) === '["Columbus"]');

// NOTE (port): the original drive65 Phase B (backup/restore through the
// export box) is intentionally not ported. It held the backup in a window
// variable that the restore-triggered page reload wipes, so its B2/B3/B5
// steps never reached the restore code - a test bug found 2026-10-26.
// drive66 is the corrected re-run of that suite and supersedes it; the
// Phase A validators above are drive65-only coverage and are kept.

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
ok('no page exceptions', R.exceptions.length === 0);
finish(R, proc);

