import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive169: Beta 1.147 (hypothesis round H1, CONFIRMED) - the restore-window
// write race. restoreBackup (app4) writes the restored records, sets
// `restoring = true` and reloads after 600 ms; before 1.147 that flag fenced
// only flushAux, and saveAll wrote the whole PRIMARY record set from the
// still-pre-restore in-memory board - one mark inside the window resurrected
// the entire pre-restore board over the restore (hypothesis rig driveH1
// reproduced it 3/3). The fix fences saveAll the same way: at its top, while
// `restoring` is set it returns the fenced outcome
// {ok:false, failedKey:'restoring', retryPending:false} WITHOUT arming
// primaryDirty, so the reload proceeds and no retry ever fires against the
// restored data. This drive is the rig's scenarios with the assertions
// inverted: the restore must now survive every in-window mark exactly.
//   board B (the backup)   = Velmar + Mellings done
//   board P (pre-restore)  = Mellings + Astona + Santa Barbara done
//   in-window mark         = Valeria (in neither B nor P)
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const MAINS = ['Velmar', 'Mellings', 'Astona', 'Santa Barbara', 'Valeria', 'Greenpark'];
const B_DONE = 'Mellings|Velmar';
const P_DONE = 'Astona|Mellings|Santa Barbara';

const waitBoot = async () => { for (let i = 0; i < 25; i++) { try { if (await ev(`!!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const waitReloaded = async () => { // tolerant: evaluates throw while the navigation tears the context down
  for (let i = 0; i < 40; i++) { try { if (await ev(`typeof window.__d169probe === 'undefined' && !!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(300); }
  return false;
};
const afterReload = async () => { // drive167's proven reload idiom
  const gone = await waitReloaded();
  await waitBoot(); await sleep(3200);
  try { await ev(`loadRoute('5w'); true`); } catch (e) {}
  await sleep(600);
  let loaded = false; for (let i = 0; i < 15 && !loaded; i++) { try { loaded = await ev(`routeLoaded === true`); } catch (e) {} if (!loaded) await sleep(400); }
  return gone && loaded;
};
const setBoard = async (names) => {
  await ev(`(() => { for (const n of ${JSON.stringify(MAINS)}) { if (pieces[n] && pieces[n].some(v => v !== 0)) markUndone(n); } return true; })()`);
  for (const n of names) await ev(`markDone(${JSON.stringify(n)}, 'd169'); true`);
  return await poll(`JSON.parse(localStorage.getItem(LS.done) || '[]').length === ${names.length}`, 10000);
};
const board = async () => JSON.parse(await ev(`JSON.stringify({ done: [...doneSet].sort().join('|'), velmar: pieces['Velmar'].join(','), valeria: pieces['Valeria'].join(',') })`));
const injectBackup = async (bkStr) => { await ev(`window.__d169b = ${JSON.stringify(bkStr)}; true`); };
const isB = (bd) => bd.done === B_DONE && bd.velmar.split(',').every(v => v === '3') && bd.valeria.split(',').every(v => v === '0');

try {
  // ---- Build the backup of board B with the app's own exporter ----
  ok('stage board B (Velmar+Mellings) cleanly', await setBoard(['Velmar', 'Mellings']));
  const bkStr = await ev(`buildBackup()`);
  ok('buildBackup() produced a backup string', typeof bkStr === 'string' && bkStr.length > 100);
  const bkDone = JSON.parse(JSON.parse(bkStr).routes['5w'].done).sort().join('|');
  ok('the backup carries exactly board B (done = ' + bkDone + ')', bkDone === B_DONE);

  // ---- CONTROL: restore with NO in-window mark -> board reloads as B ----
  ok('stage pre-restore board P', await setBoard(['Mellings', 'Astona', 'Santa Barbara']));
  await injectBackup(bkStr);
  await ev(`(() => { window.__d169probe = 1; restoreBackup(JSON.parse(window.__d169b)); return true; })()`);
  ok('control: page reloaded and route reloaded', await afterReload());
  let bd = await board();
  ok('CONTROL PASS: no in-window mark -> reloaded board is exactly the backup board B | ' + JSON.stringify(bd), isB(bd));

  // ---- FENCE: saveAll inside the window returns the fenced outcome and arms nothing ----
  ok('fence stage board P', await setBoard(['Mellings', 'Astona', 'Santa Barbara']));
  await injectBackup(bkStr);
  const fence = JSON.parse(await ev(`(() => { window.__d169probe = 1; restoreBackup(JSON.parse(window.__d169b)); const before = writePending('primary'); const r = saveAll(); return JSON.stringify({ before, ok: r.ok, failedKey: r.failedKey, retryPending: r.retryPending, after: writePending('primary'), storedDone: JSON.parse(localStorage.getItem(LS.done) || '[]').length }); })()`));
  ok('FENCE: saveAll() in the window returns {ok:false, failedKey:\'restoring\', retryPending:false} | ' + JSON.stringify(fence),
    fence.ok === false && fence.failedKey === 'restoring' && fence.retryPending === false);
  ok('FENCE: the fenced call arms NO primary retry (writePending unchanged) and writes nothing (the restored done record still holds board B\'s 2 entries) | ' + JSON.stringify(fence),
    fence.before === false && fence.after === false && fence.storedDone === 2);
  ok('fence: page reloaded and route reloaded', await afterReload());
  bd = await board();
  ok('FENCE PASS: after the direct fenced call the reloaded board is still exactly B | ' + JSON.stringify(bd), isB(bd));

  // ---- T1: markDone in the SAME task as the restore (deepest inside the window) ----
  ok('T1 stage board P', await setBoard(['Mellings', 'Astona', 'Santa Barbara']));
  await injectBackup(bkStr);
  const t1 = JSON.parse(await ev(`(() => { window.__d169probe = 1; const t0 = performance.now(); restoreBackup(JSON.parse(window.__d169b)); const t1 = performance.now(); markDone('Valeria', 'd169'); const t2 = performance.now(); return JSON.stringify({ restoreMs: Math.round(t1 - t0), markAfterRestoreMs: Math.round(t2 - t1) }); })()`));
  ok('T1 the mark executed inside the 600 ms window (mark completed ' + t1.markAfterRestoreMs + ' ms after restoreBackup returned; restore itself took ' + t1.restoreMs + ' ms)', t1.markAfterRestoreMs < 600);
  ok('T1 page reloaded and route reloaded', await afterReload());
  bd = await board();
  ok('T1 FIXED: the in-window whole-street mark did NOT overwrite the restore - reloaded board is exactly B (Velmar intact, Valeria absent) | ' + JSON.stringify(bd), isB(bd));

  // ---- T2: a single chip tap (togglePiece) inside the window ----
  ok('T2 stage board P', await setBoard(['Mellings', 'Astona', 'Santa Barbara']));
  await injectBackup(bkStr);
  await ev(`(() => { window.__d169probe = 1; restoreBackup(JSON.parse(window.__d169b)); togglePiece('Valeria', 0, 0); return true; })()`);
  ok('T2 page reloaded and route reloaded', await afterReload());
  bd = await board();
  ok('T2 FIXED: one chip-side tap in the window also leaves the restore intact (board exactly B) | ' + JSON.stringify(bd), isB(bd));

  // ---- T3: mark dispatched as a separate task right after the restore (realistic tap latency) ----
  ok('T3 stage board P', await setBoard(['Mellings', 'Astona', 'Santa Barbara']));
  await injectBackup(bkStr);
  await ev(`(() => { window.__d169probe = 1; window.__d169tR = performance.now(); restoreBackup(JSON.parse(window.__d169b)); return true; })()`);
  const gap = await ev(`(() => { const g = Math.round(performance.now() - window.__d169tR); markDone('Valeria', 'd169'); return g; })()`);
  ok('T3 page reloaded and route reloaded', await afterReload());
  bd = await board();
  ok('T3 FIXED at realistic dispatch latency: mark dispatched ' + gap + ' ms after the restore (inside the window) and the reloaded board is still exactly B | ' + JSON.stringify(bd),
    gap < 600 && isB(bd));

  // ---- POST: marking works normally again after the reload (the fence is window-scoped) ----
  await ev(`markDone('Valeria', 'd169'); true`);
  const post = await poll(`[...doneSet].sort().join('|') === 'Mellings|Valeria|Velmar'`, 10000);
  ok('POST: after the reload, marking Valeria lands and saves normally (the fence did not leak past the window)', post === true);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 220));
finish(R, proc);
