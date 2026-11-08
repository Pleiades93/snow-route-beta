import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route

// drive167: Beta 1.146 (state-machine census C1) - a finish with NO run has a
// reconciliation signature. finishRun stamps a run-less archive entry's runId
// with the finclean marker's `at` (the finish's own identity; the marker's
// {run: 0, at} shape is unchanged), and reconcileInterruptedFinish's no-run
// branch removes the phantom entry when the FULL signature holds: marker
// present with run 0, newest entry's runId === marker at, and the loaded
// board still equalling the entry's own snapshot exactly (the sides gate
// never landed). A completed no-run finish (board cleared) keeps its entry.
// Scenarios stage the post-kill storage state DIRECTLY (the drive114 pattern:
// the archive txSet and the finclean txSet landed, the sides txSet did not),
// then reload for real and read the reconciled state.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const waitBoot = async () => { for (let i = 0; i < 25; i++) { try { if (await ev(`!!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const reload = async () => { await ev(`location.reload(); true`); await sleep(500); await waitBoot(); await sleep(3200); await ev(`loadRoute('5w'); true`); await sleep(600); };
const stage = async (clearBoard) => JSON.parse(await ev(`(() => { markDone('Velmar', 'test'); markDone('Mellings', 'test'); markDone('Astona', 'test'); const e = buildSnap(); const at = Date.now(); e.runId = at; const h = [...history, e]; localStorage.setItem(LS.hist, JSON.stringify(h)); localStorage.setItem(LS.finclean, JSON.stringify({ run: 0, at })); if (${clearBoard ? 'true' : 'false'}) { const cp = {}, ct = {}; for (const n of STREETNAMES) { cp[n] = STRETCH[n].parts.map(() => 0); ct[n] = {}; } localStorage.setItem(LS.sides, JSON.stringify({ p: cp, t: ct })); localStorage.setItem(LS.done, '[]'); localStorage.setItem(LS.times, '{}'); localStorage.setItem(LS.via, '{}'); } return JSON.stringify({ n: h.length, at }); })()`));
const state = async () => JSON.parse(await ev(`JSON.stringify({ hist: history.length, done: doneSet.size, run: runStart, marker: localStorage.getItem(LS.finclean), velmar: pieces.Velmar ? pieces.Velmar.join(',') : '' })`));

try {
  ok('S0 app boots with a loaded route and an empty history', (await state()).hist === 0);
  // ---- Scenario 1: the interrupted no-run finish (archive landed, sides did not) ----
  const s1 = await stage(false);
  await reload();
  let st = await state();
  ok('A1 the phantom entry is GONE after reload (staged ' + s1.n + ' -> ' + st.hist + ') and the board is intact (3 streets still done, Velmar fully marked) | ' + JSON.stringify(st),
    st.hist === s1.n - 1 && st.done === 3 && st.run === 0 && st.velmar.split(',').every(v => v === '3'));
  ok('A2 the finclean marker was cleared with the phantom (its cleanup obligation is moot once the finish is un-done)', st.marker === null);
  // Then a real Finish of the same board archives it exactly ONCE.
  await ev(`performReset(); true`); await sleep(400);
  st = await state();
  ok('A3 the next Finish archives exactly ONE legitimate entry (no double archive of the same work): history ' + (s1.n - 1) + ' -> ' + st.hist + ', board cleared | ' + JSON.stringify(st),
    st.hist === s1.n && st.done === 0 && st.marker === null);
  // ---- Scenario 2: the completed no-run finish (sides gate landed too) ----
  const s2 = await stage(true);
  await reload();
  st = await state();
  ok('B1 a completed no-run finish STANDS after reload: its entry is kept (' + st.hist + ' of staged ' + s2.n + '), the board is the cleared board | ' + JSON.stringify(st),
    st.hist === s2.n && st.done === 0 && st.run === 0);
  ok('B2 the completed finish\'s marker is discharged by the load cleanup (completeFinishCleanup), not by reconcile', st.marker === null);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 220));
finish(R, proc);
