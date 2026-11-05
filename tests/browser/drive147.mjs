import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive147: Beta 1.102, architecture Phase 4 (C3) - boot reconciliation of an
// interrupted finish (CG-196-04, deferred by the round-196 audit loop to this
// phase). A finish killed between its gates runs no rollback; the harmful
// prefixes share one signature: the newest archive entry's startedAt equals the
// stored start key. At boot (loadRouteState): board still marked -> remove the
// duplicate archive entry, the run resumes intact; board already cleared ->
// remove the start key, the finish stands committed. Anything else - a
// different run's archive, no archive, no active run - is left exactly as stored.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
ok('T0 app script is live', await poll(`typeof reconcileInterruptedFinish === 'function' && typeof finishReconcileAction === 'function'`, 90000));

const virgin = async () => { await ev(`(() => { localStorage.clear(); location.reload(); return true; })()`); await sleep(1200); await bootThrough(ev, poll); };
const seed = async (mark, archiveOffset) => JSON.parse(await ev(`(() => {
  const T = Date.now() - 7200000;
  runStart = T; saveStart();
  history = ${archiveOffset === null ? '[]' : `[{ at: new Date(T + 3600000).toISOString(), items: { Velmar: new Date(T + 1800000).toISOString() }, via: {}, notes: {}, startedAt: new Date(T + (${archiveOffset})).toISOString() }]`};
  if (${mark ? 'true' : 'false'}) { pieces.Velmar[0] = 1; pieceTimes.Velmar[0] = [new Date(T + 1800000).toISOString(), null]; }
  saveAll();
  return JSON.stringify({ T });
})()`));
const reboot = async () => { await ev(`(() => { location.reload(); return true; })()`); await sleep(1200); await bootThrough(ev, poll); };
const state = async () => JSON.parse(await ev(`(() => JSON.stringify({ runStart, hist: history.length, storedStart: localStorage.getItem(LS.start), storedHist: JSON.parse(localStorage.getItem(LS.hist) || '[]').length }))()`));

// R1: died after gate 1 (archive landed, board still marked) -> archive removed, run resumes
await virgin();
let sd = await seed(true, 0);
await reboot();
let st = await state();
ok('R1 interrupted finish (board live): duplicate archive removed, run resumes intact | ' + JSON.stringify(st), st.hist === 0 && st.storedHist === 0 && st.runStart === sd.T && st.storedStart === String(sd.T));
// R2: died after gate 2 (archive landed, board already cleared) -> start removed, finish stands
await virgin();
sd = await seed(false, 0);
await reboot();
st = await state();
ok('R2 interrupted finish (board cleared): start key removed, finish stands | ' + JSON.stringify(st), st.hist === 1 && st.storedHist === 1 && st.runStart === 0 && st.storedStart === null);
// R3: the newest archive belongs to an EARLIER run -> nothing is touched
await virgin();
sd = await seed(true, -86400000);
await reboot();
st = await state();
ok('R3 archive of an earlier run: state left exactly as stored | ' + JSON.stringify(st), st.hist === 1 && st.runStart === sd.T && st.storedStart === String(sd.T));
// R4: an active run with no archive (a fresh run / an under-3 finish prefix) -> left alone
await virgin();
sd = await seed(false, null);
await reboot();
st = await state();
ok('R4 active run, no archive: left alone | ' + JSON.stringify(st), st.hist === 0 && st.runStart === sd.T && st.storedStart === String(sd.T));
// R5: an archive with no active run -> left alone
await virgin();
sd = await seed(false, 0);
await ev(`(() => { runStart = 0; saveStart(); return true; })()`);
await reboot();
st = await state();
ok('R5 archive, no active run: left alone | ' + JSON.stringify(st), st.hist === 1 && st.runStart === 0 && st.storedStart === null);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
