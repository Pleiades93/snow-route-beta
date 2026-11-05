import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive147: Beta 1.102, architecture Phase 4 (C3) - boot reconciliation of an
// interrupted finish (CG-196-04, deferred by the round-196 audit loop to this
// phase). A finish killed between its gates runs no rollback; at boot
// (loadRouteState): board still marked -> remove the duplicate archive entry,
// the run resumes intact; board already cleared -> remove the start key, the
// finish stands committed. Anything else - a different run's archive, no
// archive, no active run - is left exactly as stored.
// Beta 1.104 (round 103, CG-103-02): the match key is the archive entry's
// dedicated run identity (runId, stamped by finishRun from the active run's
// start), NOT startedAt - startedAt is the real work start and can predate
// Start when a street was marked before Start was pressed (R6/R7). Matching
// is strict: a previous run's identity never matches a new run (R3/R8), and
// an entry with no identity (written before 1.104) is never reconciled (R9).
// R10 proves finishRun stamps the identity while startedAt keeps the
// pre-Start mark; R11 proves CG-103-01: a finish can never evict its own
// incoming archive entry.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
ok('T0 app script is live', await poll(`typeof reconcileInterruptedFinish === 'function' && typeof finishReconcileAction === 'function'`, 90000));

const virgin = async () => { await ev(`(() => { localStorage.clear(); location.reload(); return true; })()`); await sleep(1200); await bootThrough(ev, poll); };
const seed = async (mark, spec) => {
  const T = Date.now() - 7200000;
  const entry = spec ? { at: new Date(T + 3600000).toISOString(), items: { Velmar: new Date(T + 1800000).toISOString() }, via: {}, notes: {}, startedAt: new Date(T + spec.startedOffset).toISOString(), ...(spec.runIdOffset != null ? { runId: T + spec.runIdOffset } : {}) } : null;
  return JSON.parse(await ev(`(() => {
  const T = ${T};
  runStart = T; saveStart();
  history = ${entry ? JSON.stringify([entry]) : '[]'};
  if (${mark ? 'true' : 'false'}) { pieces.Velmar[0] = 1; pieceTimes.Velmar[0] = [new Date(T + 1800000).toISOString(), null]; }
  saveAll();
  return JSON.stringify({ T });
})()`));
};
const reboot = async () => { await ev(`(() => { location.reload(); return true; })()`); await sleep(1200); await bootThrough(ev, poll); };
const state = async () => JSON.parse(await ev(`(() => JSON.stringify({ runStart, hist: history.length, storedStart: localStorage.getItem(LS.start), storedHist: JSON.parse(localStorage.getItem(LS.hist) || '[]').length }))()`));

// R1: died after gate 1 (archive landed, board still marked) -> archive removed, run resumes
await virgin();
let sd = await seed(true, { startedOffset: 0, runIdOffset: 0 });
await reboot();
let st = await state();
ok('R1 interrupted finish (board live): duplicate archive removed, run resumes intact | ' + JSON.stringify(st), st.hist === 0 && st.storedHist === 0 && st.runStart === sd.T && st.storedStart === String(sd.T));
// R2: died after gate 2 (archive landed, board already cleared) -> start removed, finish stands
await virgin();
sd = await seed(false, { startedOffset: 0, runIdOffset: 0 });
await reboot();
st = await state();
ok('R2 interrupted finish (board cleared): start key removed, finish stands | ' + JSON.stringify(st), st.hist === 1 && st.storedHist === 1 && st.runStart === 0 && st.storedStart === null);
// R3: the newest archive belongs to an EARLIER run -> nothing is touched
await virgin();
sd = await seed(true, { startedOffset: -86400000, runIdOffset: -86400000 });
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
sd = await seed(false, { startedOffset: 0, runIdOffset: 0 });
await ev(`(() => { runStart = 0; saveStart(); return true; })()`);
await reboot();
st = await state();
ok('R5 archive, no active run: left alone | ' + JSON.stringify(st), st.hist === 1 && st.runStart === 0 && st.storedStart === null);
// R6 (CG-103-02, kill point 1): the run has a PRE-START mark, so the archive's
// startedAt predates the stored start - the identity still matches, board live
await virgin();
sd = await seed(true, { startedOffset: -1800000, runIdOffset: 0 });
await reboot();
st = await state();
ok('R6 interrupted finish with pre-Start mark (board live): archive removed, run resumes | ' + JSON.stringify(st), st.hist === 0 && st.storedHist === 0 && st.runStart === sd.T && st.storedStart === String(sd.T));
// R7 (CG-103-02, kill point 2): same identity, board already cleared
await virgin();
sd = await seed(false, { startedOffset: -1800000, runIdOffset: 0 });
await reboot();
st = await state();
ok('R7 interrupted finish with pre-Start mark (board cleared): start removed, finish stands | ' + JSON.stringify(st), st.hist === 1 && st.storedHist === 1 && st.runStart === 0 && st.storedStart === null);
// R8 (false-positive control): startedAt EQUALS the stored start but the entry's
// identity belongs to an earlier run -> matching is on identity, never startedAt
await virgin();
sd = await seed(true, { startedOffset: 0, runIdOffset: -86400000 });
await reboot();
st = await state();
ok('R8 startedAt matches but identity is an earlier run: left exactly as stored | ' + JSON.stringify(st), st.hist === 1 && st.runStart === sd.T && st.storedStart === String(sd.T));
// R9 (legacy entry): startedAt equals the stored start but the entry carries NO
// identity (written before 1.104) -> missing identity = no reconciliation
await virgin();
sd = await seed(true, { startedOffset: 0, runIdOffset: null });
await reboot();
st = await state();
ok('R9 pre-1.104 entry (no identity): left exactly as stored | ' + JSON.stringify(st), st.hist === 1 && st.runStart === sd.T && st.storedStart === String(sd.T));
// R10: a real finish stamps the identity from the active run; startedAt keeps
// the pre-Start mark (the km/path work-start semantics are untouched)
await virgin();
const r10 = JSON.parse(await ev(`(() => {
  const T = Date.now() - 7200000;
  runStart = T; saveStart();
  doneSet = new Set(['Velmar', 'Angie', 'Astona']);
  doneTimes = { Velmar: new Date(T - 1800000).toISOString(), Angie: new Date(T + 600000).toISOString(), Astona: new Date(T + 1200000).toISOString() };
  for (const n of doneSet) pieces[n][0] = 3;
  finishRun();
  const h = JSON.parse(localStorage.getItem(LS.hist) || '[]');
  const e = h[h.length - 1] || {};
  return JSON.stringify({ T, n: h.length, runId: e.runId || null, startedAt: e.startedAt || null, wantStarted: new Date(T - 1800000).toISOString(), items: e.items ? Object.keys(e.items).length : 0 });
})()`));
ok('R10 finish stamps runId === run start; startedAt keeps the pre-Start mark | ' + JSON.stringify(r10), r10.n === 1 && r10.runId === r10.T && r10.startedAt === r10.wantStarted && r10.items === 3);
// R11 (CG-103-01): history full of 10 FULL cleans; a new partial finish must
// keep its own archive (the oldest pre-existing entry is evicted instead)
await virgin();
const r11 = JSON.parse(await ev(`(() => {
  const T = Date.now() - 7200000;
  const day = 86400000;
  history = Array.from({ length: 10 }, (_, i) => ({ at: new Date(T - (10 - i) * day).toISOString(), items: Object.fromEntries(STREETNAMES.map(n => [n, new Date(T - 3600000).toISOString()])), via: {}, notes: {}, startedAt: new Date(T - (10 - i) * day).toISOString() }));
  saveHistory();
  runStart = T; saveStart();
  doneSet = new Set(['Velmar', 'Angie', 'Astona']);
  doneTimes = { Velmar: new Date(T + 600000).toISOString(), Angie: new Date(T + 900000).toISOString(), Astona: new Date(T + 1200000).toISOString() };
  for (const n of doneSet) pieces[n][0] = 3;
  finishRun();
  const h = JSON.parse(localStorage.getItem(LS.hist) || '[]');
  const last = h[h.length - 1] || {};
  return JSON.stringify({ n: h.length, firstAt: h.length ? h[0].at : null, wantFirstAt: new Date(T - 9 * day).toISOString(), lastItems: last.items ? Object.keys(last.items).length : 0, lastRunId: last.runId || null, T });
})()`));
ok('R11 10 full cleans + new partial finish: incoming archive retained, oldest pre-existing evicted | ' + JSON.stringify(r11), r11.n === 10 && r11.firstAt === r11.wantFirstAt && r11.lastItems === 3 && r11.lastRunId === r11.T);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
