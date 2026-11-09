import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive176: Beta 1.150 (security-audit fix round, needs-validation record
// restore-finclean-discharge-outside-transaction) - the restore committed
// its verified write set and then discharged each restored route's stale
// finish-cleanup record with a bare lsDel whose result was DISCARDED,
// outside the write set and outside the rollback scope. A failed discharge
// left the record armed while the restore reported full success; the next
// load's completeFinishCleanup - seeing an all-zero board (the restored
// one) - then replaced the JUST-RESTORED notes and coverage with '{}': a
// successful restore silently destroyed the data it had just restored.
// Settlement by fault injection (this drive): removeItem refuses only the
// finclean key during the restore. The fix discharges the record INSIDE the
// verified write set ([rk.finclean, null] per restored route, with the
// finclean keys added to the rollback scope), so a failed discharge fails
// the restore honestly with a rollback instead of arming a time bomb.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const waitBoot = async () => { for (let i = 0; i < 40; i++) { try { if (await ev(`typeof restoreBackup === 'function' && !!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const STALE_NOTES = '{"Velmar":[{"k":"hazard","at":"2026-01-01T00:00:00.000Z"}]}';
const STALE_COV = '{"Velmar":[0]}';
const NEW_NOTES = '{"Mellings":[{"k":"flag","at":"2026-02-02T00:00:00.000Z"}]}';
const NEW_COV = '{"Mellings":[1]}';
const seedArmed = async () => { await ev(`(() => { const rk = routeKeys('5w');
  localStorage.setItem(rk.finclean, JSON.stringify({ run: 7, at: Date.now() }));
  localStorage.setItem(rk.notes, ${JSON.stringify(STALE_NOTES)});
  localStorage.setItem(rk.cov, ${JSON.stringify(STALE_COV)});
  localStorage.setItem(rk.done, '[]'); return true; })()`); };
const backupObj = () => ({ app: 'snowroute-backup', v: 2, routes: { '5w': { done: '[]', notes: NEW_NOTES, cov: NEW_COV } } });

try {
  // ---- Phase 1: the injection - the discharge delete refuses ----
  await ev(`localStorage.clear(); location.reload(); true`); await waitBoot(); await sleep(2200); // back to the route menu (no route loaded: the cleanup must NOT fire yet)
  await seedArmed();
  await ev(`(() => { window.__origRemoveItem = Storage.prototype.removeItem; const bad = routeKeys('5w').finclean;
    Storage.prototype.removeItem = function (k) { if (k === bad) throw new Error('delete refused'); return window.__origRemoveItem.call(this, k); };
    window.__d176probe = 1; restoreBackup(${JSON.stringify(backupObj())}); return true; })()`);
  await sleep(1500); // a successful restore reloads at 600 ms; a failed one stays put with its toast
  await waitBoot(); // on the unfixed code the wrongful success reloads the page - wait for the new page's scripts before reading
  const p1 = await J(`({ probe: typeof window.__d176probe !== 'undefined', toast: $('toast').textContent,
    notes: localStorage.getItem(routeKeys('5w').notes), cov: localStorage.getItem(routeKeys('5w').cov), fin: localStorage.getItem(routeKeys('5w').finclean) })`);
  ok('P1 a refused discharge fails the restore honestly (no success, no reload) | ' + JSON.stringify(p1),
    p1.probe === true && /Restore failed/.test(p1.toast || ''));
  ok('P1 the rollback leaves the original slot data and the still-armed record intact',
    p1.notes === STALE_NOTES && p1.cov === STALE_COV && p1.fin !== null);
  // the obligation itself is real: with deletes working again, loading the
  // route completes the ORIGINAL cleanup against the ORIGINAL data
  await ev(`(() => { if (window.__origRemoveItem) Storage.prototype.removeItem = window.__origRemoveItem; loadRoute('5w'); return true; })()`); await sleep(900);
  const p1b = await J(`({ notes: localStorage.getItem(routeKeys('5w').notes), fin: localStorage.getItem(routeKeys('5w').finclean) })`);
  ok('P1 the armed record still does its own job once deletes work (original notes cleaned, record consumed)', p1b.notes === '{}' && p1b.fin === null);

  // ---- Phase 2 (control): no fault - the restore discharges cleanly ----
  await ev(`localStorage.clear(); location.reload(); true`); await waitBoot(); await sleep(2200);
  await seedArmed();
  await ev(`restoreBackup(${JSON.stringify(backupObj())}); true`);
  await sleep(2500); // success path reloads
  await waitBoot(); await sleep(1800);
  await ev(`loadRoute('5w'); true`); await sleep(900);
  const p2 = await J(`({ notes: localStorage.getItem(routeKeys('5w').notes), cov: localStorage.getItem(routeKeys('5w').cov), fin: localStorage.getItem(routeKeys('5w').finclean) })`);
  ok('P2 control: a clean restore discharges the record and the restored notes/coverage survive the next load | ' + JSON.stringify(p2),
    p2.notes === NEW_NOTES && p2.cov === NEW_COV && p2.fin === null);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
