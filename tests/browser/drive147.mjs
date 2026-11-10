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
// pre-Start mark; R11 proved CG-103-01 (a finish can never evict its own
// incoming archive entry) - Beta 1.167 retired the cap entirely, and R11
// now proves the stronger contract: NOTHING is evicted, ever.
//
// Test-suite restructure (2026-11-09): REWRITTEN table-driven, and drive167
// absorbed. The old drive ran R1-R9 as nine virgin()+reboot() cycles (~20
// app boots, 76.8 s) to exercise what is, at decision level, the pure
// finishReconcileAction(startMs, lastMs, boardEmpty) (app1.js) plus its
// no-run sibling finishReconcileNoRunAction. Now:
//   Part 1 tables BOTH pure functions over their full case tables in-page
//     (the R1-R9 / 167-A/B DECISIONS, incl. R8's identity-not-startedAt row:
//     the function receives the entry's runId as its second argument - what
//     loadRouteState passes - so a startedAt-shaped value is never its input).
//   Part 2 runs R1-R9 END-TO-END through loadRouteState('5w') called
//     in-page: seed() writes the same storage the old drive wrote (saveAll
//     persists sides/done/times/via/notes/hist/start/cov), and
//     loadRouteState re-reads it and reconciles - the identical code path a
//     real boot takes, minus the reload and the menu click-through. Every
//     original R assertion is preserved verbatim below.
//   Part 3 keeps R10/R11 in-page (they never needed a reload).
//   Part 4 is drive167 verbatim in scenario and assertion (the no-run
//     finish, census C1): staged storage + a REAL reload, because its A3
//     continues into a UI Finish (performReset) on the reconciled board.
// The full battery's remaining real-boot coverage of this surface: R1/R2's
// decisions are also reached by every other drive's ordinary boot (an
// unreconciled signature would corrupt their premises loudly), and Part 4
// keeps two true cold boots on the no-run branch.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
ok('T0 app script is live', await poll(`typeof reconcileInterruptedFinish === 'function' && typeof finishReconcileAction === 'function' && typeof finishReconcileNoRunAction === 'function' && typeof loadRouteState === 'function'`, 90000));

// ---- Part 1: the pure decision tables --------------------------------------
const T = 1700000000000, AT = 1700003600000;
const tbl = await J(`(() => {
  const F = finishReconcileAction, N = finishReconcileNoRunAction;
  return [
    ['R1/R6 decision (identity match, board live) -> rollback', F(${T}, ${T}, false), 'rollback'],
    ['R2/R7 decision (identity match, board cleared) -> complete', F(${T}, ${T}, true), 'complete'],
    ['R3 decision (earlier run archive, board live) -> none', F(${T}, ${T} - 86400000, false), 'none'],
    ['R3 decision (earlier run archive, board cleared) -> none', F(${T}, ${T} - 86400000, true), 'none'],
    ['R8 decision (identity off by a millisecond is a different run) -> none', F(${T}, ${T} + 1, false), 'none'],
    ['R9 decision (entry with no identity, lastMs 0) -> none', F(${T}, 0, false), 'none'],
    ['R5 decision (no active run, startMs 0) -> none', F(0, ${T}, false), 'none'],
    ['R4 decision (no run, no archive identity) -> none', F(0, 0, true), 'none'],
    ['167-A decision (no-run signature complete) -> rollback', N(0, ${AT}, ${AT}, false, true), 'rollback'],
    ['167-B decision (no-run, board empty: the finish completed) -> none', N(0, ${AT}, ${AT}, true, true), 'none'],
    ['167 board-match decision (board no longer equals the snapshot) -> none', N(0, ${AT}, ${AT}, false, false), 'none'],
    ['167 identity decision (entry runId differs from the marker) -> none', N(0, ${AT}, ${AT} + 1, false, true), 'none'],
    ['167 no-marker decision (markerRun null) -> none', N(null, ${AT}, ${AT}, false, true), 'none'],
    ['167 run-marker decision (marker of a real run, run != 0) -> none', N(12345, ${AT}, ${AT}, false, true), 'none']
  ];
})()`);
for (const row of (Array.isArray(tbl) ? tbl : [])) ok('TABLE ' + row[0], row[1] === row[2]);
ok('TABLE the case table itself ran complete (14 rows)', Array.isArray(tbl) && tbl.length === 14);

try {
  // ---- Part 2: R1-R9 end-to-end through loadRouteState ----------------------
  const wipe = async () => { await ev(`(() => { localStorage.clear(); return true; })()`); await ev(`loadRouteState('5w'); true`); };
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
  const state = async () => JSON.parse(await ev(`(() => JSON.stringify({ runStart, hist: history.length, storedStart: localStorage.getItem(LS.start), storedHist: JSON.parse(localStorage.getItem(LS.hist) || '[]').length }))()`));

  // R1: died after gate 1 (archive landed, board still marked) -> archive removed, run resumes
  await wipe();
  let sd = await seed(true, { startedOffset: 0, runIdOffset: 0 });
  await ev(`loadRouteState('5w'); true`);
  let st = await state();
  ok('R1 interrupted finish (board live): duplicate archive removed, run resumes intact | ' + JSON.stringify(st), st.hist === 0 && st.storedHist === 0 && st.runStart === sd.T && st.storedStart === String(sd.T));
  // R2: died after gate 2 (archive landed, board already cleared) -> start removed, finish stands
  await wipe();
  sd = await seed(false, { startedOffset: 0, runIdOffset: 0 });
  await ev(`loadRouteState('5w'); true`);
  st = await state();
  ok('R2 interrupted finish (board cleared): start key removed, finish stands | ' + JSON.stringify(st), st.hist === 1 && st.storedHist === 1 && st.runStart === 0 && st.storedStart === null);
  // R3: the newest archive belongs to an EARLIER run -> nothing is touched
  await wipe();
  sd = await seed(true, { startedOffset: -86400000, runIdOffset: -86400000 });
  await ev(`loadRouteState('5w'); true`);
  st = await state();
  ok('R3 archive of an earlier run: state left exactly as stored | ' + JSON.stringify(st), st.hist === 1 && st.runStart === sd.T && st.storedStart === String(sd.T));
  // R4: an active run with no archive (a fresh run / an under-3 finish prefix) -> left alone
  await wipe();
  sd = await seed(false, null);
  await ev(`loadRouteState('5w'); true`);
  st = await state();
  ok('R4 active run, no archive: left alone | ' + JSON.stringify(st), st.hist === 0 && st.runStart === sd.T && st.storedStart === String(sd.T));
  // R5: an archive with no active run -> left alone
  await wipe();
  sd = await seed(false, { startedOffset: 0, runIdOffset: 0 });
  await ev(`(() => { runStart = 0; saveStart(); return true; })()`);
  await ev(`loadRouteState('5w'); true`);
  st = await state();
  ok('R5 archive, no active run: left alone | ' + JSON.stringify(st), st.hist === 1 && st.runStart === 0 && st.storedStart === null);
  // R6 (CG-103-02, kill point 1): the run has a PRE-START mark, so the archive's
  // startedAt predates the stored start - the identity still matches, board live
  await wipe();
  sd = await seed(true, { startedOffset: -1800000, runIdOffset: 0 });
  await ev(`loadRouteState('5w'); true`);
  st = await state();
  ok('R6 interrupted finish with pre-Start mark (board live): archive removed, run resumes | ' + JSON.stringify(st), st.hist === 0 && st.storedHist === 0 && st.runStart === sd.T && st.storedStart === String(sd.T));
  // R7 (CG-103-02, kill point 2): same identity, board already cleared
  await wipe();
  sd = await seed(false, { startedOffset: -1800000, runIdOffset: 0 });
  await ev(`loadRouteState('5w'); true`);
  st = await state();
  ok('R7 interrupted finish with pre-Start mark (board cleared): start removed, finish stands | ' + JSON.stringify(st), st.hist === 1 && st.storedHist === 1 && st.runStart === 0 && st.storedStart === null);
  // R8 (false-positive control): startedAt EQUALS the stored start but the entry's
  // identity belongs to an earlier run -> matching is on identity, never startedAt
  await wipe();
  sd = await seed(true, { startedOffset: 0, runIdOffset: -86400000 });
  await ev(`loadRouteState('5w'); true`);
  st = await state();
  ok('R8 startedAt matches but identity is an earlier run: left exactly as stored | ' + JSON.stringify(st), st.hist === 1 && st.runStart === sd.T && st.storedStart === String(sd.T));
  // R9 (legacy entry): startedAt equals the stored start but the entry carries NO
  // identity (written before 1.104) -> missing identity = no reconciliation
  await wipe();
  sd = await seed(true, { startedOffset: 0, runIdOffset: null });
  await ev(`loadRouteState('5w'); true`);
  st = await state();
  ok('R9 pre-1.104 entry (no identity): left exactly as stored | ' + JSON.stringify(st), st.hist === 1 && st.runStart === sd.T && st.storedStart === String(sd.T));

  // ---- Part 3: R10/R11 in-page (verbatim scenarios; they never needed a reload) ----
  // R10: a real finish stamps the identity from the active run; startedAt keeps
  // the pre-Start mark (the km/path work-start semantics are untouched)
  await wipe();
  const r10 = JSON.parse(await ev(`(() => {
    const T = Date.now() - 7200000;
    runStart = T; saveStart();
    history = [];
    doneSet = new Set(['Velmar', 'Angie', 'Astona']);
    doneTimes = { Velmar: new Date(T - 1800000).toISOString(), Angie: new Date(T + 600000).toISOString(), Astona: new Date(T + 1200000).toISOString() };
    for (const n of doneSet) pieces[n][0] = 3;
    finishRun();
    const h = JSON.parse(localStorage.getItem(LS.hist) || '[]');
    const e = h[h.length - 1] || {};
    return JSON.stringify({ T, n: h.length, runId: e.runId || null, startedAt: e.startedAt || null, wantStarted: new Date(T - 1800000).toISOString(), items: e.items ? Object.keys(e.items).length : 0 });
  })()`));
  ok('R10 finish stamps runId === run start; startedAt keeps the pre-Start mark | ' + JSON.stringify(r10), r10.n === 1 && r10.runId === r10.T && r10.startedAt === r10.wantStarted && r10.items === 3);
  // R11 (CG-103-01, re-derived by Beta 1.167 B1): history full of 10 FULL
  // cleans; a new partial finish keeps its own archive AND every
  // pre-existing entry - the 10-clean cap that used to evict the oldest
  // pre-existing entry here is retired at all four enforcement points.
  await wipe();
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
    return JSON.stringify({ n: h.length, firstAt: h.length ? h[0].at : null, wantFirstAt: new Date(T - 10 * day).toISOString(), lastItems: last.items ? Object.keys(last.items).length : 0, lastRunId: last.runId || null, T });
  })()`));
  ok('R11 10 full cleans + new partial finish: incoming archive retained AND all 10 pre-existing kept (11 total, oldest intact) | ' + JSON.stringify(r11), r11.n === 11 && r11.firstAt === r11.wantFirstAt && r11.lastItems === 3 && r11.lastRunId === r11.T);

  // ---- Part 4: drive167 absorbed (Beta 1.146, state-machine census C1) ------
  // A finish with NO run has a reconciliation signature. finishRun stamps a
  // run-less archive entry's runId with the finclean marker's `at` (the
  // finish's own identity; the marker's {run: 0, at} shape is unchanged), and
  // reconcileInterruptedFinish's no-run branch removes the phantom entry when
  // the FULL signature holds: marker present with run 0, newest entry's runId
  // === marker at, and the loaded board still equalling the entry's own
  // snapshot exactly (the sides gate never landed). A completed no-run finish
  // (board cleared) keeps its entry. Scenarios stage the post-kill storage
  // state DIRECTLY (the drive114 pattern), then reload for real and read the
  // reconciled state - kept as true cold boots in the restructure because A3
  // continues into a UI Finish on the reconciled board.
  const waitBoot167 = async () => { for (let i = 0; i < 25; i++) { try { if (await ev(`!!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
  const reload167 = async () => { await ev(`location.reload(); true`); await sleep(500); await waitBoot167(); await sleep(3200); await ev(`loadRoute('5w'); true`); await sleep(600); };
  const stage167 = async (clearBoard) => JSON.parse(await ev(`(() => { markDone('Velmar', 'test'); markDone('Mellings', 'test'); markDone('Astona', 'test'); const e = buildSnap(); const at = Date.now(); e.runId = at; const h = [...history, e]; localStorage.setItem(LS.hist, JSON.stringify(h)); localStorage.setItem(LS.finclean, JSON.stringify({ run: 0, at })); if (${clearBoard ? 'true' : 'false'}) { const cp = {}, ct = {}; for (const n of STREETNAMES) { cp[n] = STRETCH[n].parts.map(() => 0); ct[n] = {}; } localStorage.setItem(LS.sides, JSON.stringify({ p: cp, t: ct })); localStorage.setItem(LS.done, '[]'); localStorage.setItem(LS.times, '{}'); localStorage.setItem(LS.via, '{}'); } return JSON.stringify({ n: h.length, at }); })()`));
  const state167 = async () => JSON.parse(await ev(`JSON.stringify({ hist: history.length, done: doneSet.size, run: runStart, marker: localStorage.getItem(LS.finclean), velmar: pieces.Velmar ? pieces.Velmar.join(',') : '' })`));

  await wipe();
  await ev(`loadRoute('5w'); true`); await sleep(300);
  ok('167-S0 app boots with a loaded route and an empty history', (await state167()).hist === 0);
  // ---- Scenario 1: the interrupted no-run finish (archive landed, sides did not) ----
  const s1 = await stage167(false);
  await reload167();
  let st167 = await state167();
  ok('167-A1 the phantom entry is GONE after reload (staged ' + s1.n + ' -> ' + st167.hist + ') and the board is intact (3 streets still done, Velmar fully marked) | ' + JSON.stringify(st167),
    st167.hist === s1.n - 1 && st167.done === 3 && st167.run === 0 && st167.velmar.split(',').every(v => v === '3'));
  ok('167-A2 the finclean marker was cleared with the phantom (its cleanup obligation is moot once the finish is un-done)', st167.marker === null);
  // Then a real Finish of the same board archives it exactly ONCE.
  await ev(`performReset(); true`); await sleep(400);
  st167 = await state167();
  ok('167-A3 the next Finish archives exactly ONE legitimate entry (no double archive of the same work): history ' + (s1.n - 1) + ' -> ' + st167.hist + ', board cleared | ' + JSON.stringify(st167),
    st167.hist === s1.n && st167.done === 0 && st167.marker === null);
  // ---- Scenario 2: the completed no-run finish (sides gate landed too) ----
  const s2 = await stage167(true);
  await reload167();
  st167 = await state167();
  ok('167-B1 a completed no-run finish STANDS after reload: its entry is kept (' + st167.hist + ' of staged ' + s2.n + '), the board is the cleared board | ' + JSON.stringify(st167),
    st167.hist === s2.n && st167.done === 0 && st167.run === 0);
  ok('167-B2 the completed finish\'s marker is discharged by the load cleanup (completeFinishCleanup), not by reconcile', st167.marker === null);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
