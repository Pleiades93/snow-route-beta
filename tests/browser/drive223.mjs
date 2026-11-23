// drive223.mjs - Beta 1.284 (issue #174): THE SAVED-CLEAN DELETE KEEPS
// A MINIMUM ARM TIME. Through Beta 1.283 the clean view's delete armed
// on the first tap and deleted on the second with NO minimum delay -
// one accidental double-tap destroyed a saved clean. The delete now
// refuses a confirm that lands inside CLEAN_DEL_MIN_ARM_MS (700 ms) of
// the arming tap, judged on the taps' own event time (the #170 clock):
// the early confirm changes nothing and the arm stays up, so the
// deliberate second tap still works. D3 is the pin: on the pre-fix
// build the early confirm deletes the record and D3 fails.
// Seeding mirrors drive187 (one legacy-shape saved clean, opened in
// the clean view).
import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => JSON.parse(await ev(`JSON.stringify((${expr}))`));
await ev(`(() => { const t = new Date().toISOString(); history = [{ at: t, items: { Velmar: null, Mellings: null }, via: {}, notes: {}, sides: { p: {}, t: {} }, km: 0, startedAt: null }]; HIST.save(); openClean(0); return true; })()`);
await poll(`!!document.querySelector('.cvDel')`, 10000);
ok('D1 the delete control is offered, unarmed', await J(`document.querySelector('.cvDel').textContent === 'Delete this clean'`));
await ev(`document.querySelector('.cvDel').click()`);
ok('D2 the first tap arms the delete', await J(`document.querySelector('.cvDel').textContent === 'Tap again to confirm delete'`));
await sleep(120);
await ev(`document.querySelector('.cvDel').click()`);
ok('D3 a confirm inside the 700 ms minimum deletes NOTHING and the arm stays up', await J(`history.length === 1 && document.querySelector('.cvDel').textContent === 'Tap again to confirm delete'`));
await sleep(800);
await ev(`document.querySelector('.cvDel').click()`);
ok('D4 a confirm past the minimum deletes the clean', await poll(`history.length === 0`, 10000) === true);
ok('D5 the stored record is gone too', await J(`(localStorage.getItem(HIST.k) || '').indexOf('Velmar') < 0`));
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
