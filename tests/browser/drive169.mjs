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

  // ---- C-01 (Beta 1.186, storage fix round): markers without their trail ----
  // The mirror of the 1.73 C06 guard above it in restoreBackup. A backup carrying
  // a route's session markers but NOT its trail (a genuine shape: a clean that was
  // started but never recorded a fix exports sess with no trail key) used to lay
  // those markers over the trail that STAYS, splitting it at a session boundary
  // that never happened on it. The restore now clears them inside the verified
  // write set. Control: a backup carrying the pair restores the pair untouched.
  const C01B = 1762000000; // fixed epoch base (seconds) for the staged trail
  const C01PTS = []; for (let i = 0; i <= 10; i++) C01PTS.push([+(43.9 + i * 0.001).toFixed(6), -79.5, C01B + i * 60]);
  const sessTrailState = async () => JSON.parse(await ev(`(() => { const rk = routeKeys('5w'); const tr = JSON.parse(localStorage.getItem(rk.trail) || '[]'); const se = JSON.parse(localStorage.getItem(rk.sess) || '[]'); return JSON.stringify({ sess: se, pts: tr.length, segs: trailSegments(tr, se).length }); })()`));
  await ev(`(() => { const rk = routeKeys('5w'); localStorage.setItem(rk.trail, ${JSON.stringify(JSON.stringify(C01PTS))}); localStorage.setItem(rk.sess, ${JSON.stringify(JSON.stringify([C01B]))}); return true; })()`);
  const c01pre = await sessTrailState();
  ok('C-01 staged: a resident trail with its OWN marker reads as one segment | ' + JSON.stringify(c01pre),
    c01pre.pts === 11 && c01pre.segs === 1 && c01pre.sess.length === 1 && c01pre.sess[0] === C01B);
  const bkSessOnly = JSON.stringify({ app: 'snowroute-backup', v: 2, at: C01B * 1000, routes: { '5w': { sess: JSON.stringify([C01B + 300]) } } });
  await injectBackup(bkSessOnly);
  await ev(`(() => { window.__d169probe = 1; restoreBackup(JSON.parse(window.__d169b)); return true; })()`);
  ok('C-01 restore (markers only) reloaded', await afterReload());
  const c01post = await sessTrailState();
  ok('C-01 FIXED: the foreign markers were cleared in the write set - the resident trail still reads as ONE segment | ' + JSON.stringify(c01post),
    c01post.pts === 11 && c01post.segs === 1 && c01post.sess.length === 0);
  const bkPair = JSON.stringify({ app: 'snowroute-backup', v: 2, at: C01B * 1000, routes: { '5w': { trail: JSON.stringify(C01PTS), sess: JSON.stringify([C01B]) } } });
  await injectBackup(bkPair);
  await ev(`(() => { window.__d169probe = 1; restoreBackup(JSON.parse(window.__d169b)); return true; })()`);
  ok('C-01 control restore (trail + markers together) reloaded', await afterReload());
  const c01ctl = await sessTrailState();
  ok('C-01 control: a backup carrying the pair restores the pair untouched | ' + JSON.stringify(c01ctl),
    c01ctl.pts === 11 && c01ctl.segs === 1 && c01ctl.sess.length === 1 && c01ctl.sess[0] === C01B);

  // ---- P1 (Beta 1.186, storage fix round): the fence rises BEFORE the snapshot ----
  // Fault injection in this drive's family. The backup carries a created route, so
  // phase 1's IndexedDB puts are the restore's one yield; upPut is gated on a
  // promise this drive controls, making the window deterministic. Inside the
  // window a GPS fix lands and its flush fires; the entries stage is then refused
  // (the 5w start delete throws). Through 1.185 the fence rose only after the
  // commit, so the in-window flush WROTE the live trail and the rollback rewrote
  // it from the pre-window snapshot - the point was discarded under a "nothing
  // was changed" message. Now: the fence is already up during phase 1 (the flush
  // is refused), and the failure exit drops the fence with the dirty flags
  // re-armed, so the in-window fix flushes from memory afterwards and survives.
  const P1T = 1762100000; // staged trail base (seconds)
  const p1stage = JSON.parse(await ev(`(() => { const rk = routeKeys('5w');
    trail = [[43.9, -79.5, ${P1T}], [43.901, -79.501, ${P1T} + 60]];
    trailSessions = [${P1T}];
    saveTrail(); saveSess();
    localStorage.setItem(rk.start, String(${P1T} * 1000));
    return JSON.stringify({ storedTrail: JSON.parse(localStorage.getItem(rk.trail)).length, start: localStorage.getItem(rk.start) });
  })()`));
  ok('P1 staged: live trail (2 points) and a run start in storage | ' + JSON.stringify(p1stage),
    p1stage.storedTrail === 2 && p1stage.start === String(P1T * 1000));
  const P1PACK = { name: 'D169 P1 Route', area: 'Vaughan', mains: [], roads: { 'Test Street': [[[43.8, -79.57], [43.801, -79.571]]] }, reference: {} };
  const bkP1 = JSON.stringify({ app: 'snowroute-backup', v: 2, at: P1T * 1000, userpacks: { 'route-d169p1': P1PACK }, routes: { '5w': { start: null } } });
  await injectBackup(bkP1);
  await ev(`(() => {
    window.__p1OrigUpPut = upPut;
    window.__p1InWindow = false;
    window.__p1Gate = new Promise(res => { window.__p1Release = res; });
    upPut = async (id, pack) => { window.__p1InWindow = true; await window.__p1Gate; return window.__p1OrigUpPut(id, pack); };
    window.__p1OrigRemove = localStorage.removeItem.bind(localStorage);
    window.__p1StartKey = routeKeys('5w').start;
    localStorage.removeItem = (k) => { if (k === window.__p1StartKey) throw new Error('d169 refused delete'); return window.__p1OrigRemove(k); };
    return true;
  })()`);
  await ev(`(() => { window.__p1Settled = false; window.__d169probe = 1; restoreBackup(JSON.parse(window.__d169b)).then(() => { window.__p1Settled = true; }, () => { window.__p1Settled = true; }); return true; })()`);
  const inWindow = await poll(`window.__p1InWindow === true`, 15000);
  ok('P1 phase 1 reached (the gated store write is in flight - the window is open)', inWindow === true);
  const p1win = JSON.parse(await ev(`(() => { const rk = routeKeys('5w');
    const fenceUp = restoring;
    trail.push([43.902, -79.502, ${P1T} + 120]); markDirty('trail'); flushAux(true);
    return JSON.stringify({ fenceUp, storedTrailNow: JSON.parse(localStorage.getItem(rk.trail)).length, memTrail: trail.length });
  })()`));
  ok('P1 the fence is UP during phase 1 and the in-window flush was refused (storage still holds the 2 staged points; the new fix lives only in memory) | ' + JSON.stringify(p1win),
    p1win.fenceUp === true && p1win.storedTrailNow === 2 && p1win.memTrail === 3);
  await ev(`window.__p1Release(); true`);
  const settled = await poll(`window.__p1Settled === true`, 20000);
  ok('P1 the sabotaged restore ran its failure path to completion (a failure never reloads)', settled === true);
  const p1truth = JSON.parse(await ev(`(() => { const rk = routeKeys('5w'); return JSON.stringify({ start: localStorage.getItem(rk.start), fenceNow: restoring, pendingTrail: writePending('trail') }); })()`));
  ok('P1 the rollback told the truth (the run start is the pre-restore one) and the fence came down after the failure | ' + JSON.stringify(p1truth),
    p1truth.start === String(P1T * 1000) && p1truth.fenceNow === false);
  ok('P1 the trail dirty flag is re-armed on the failure exit (the in-window work is owed a flush) | ' + JSON.stringify(p1truth),
    p1truth.pendingTrail === true);
  const p1after = JSON.parse(await ev(`(() => { const rk = routeKeys('5w'); flushAux(true); return JSON.stringify({ storedTrail: JSON.parse(localStorage.getItem(rk.trail)).length }); })()`));
  ok('P1 FIXED: the in-window fix SURVIVES - the post-failure flush lands all 3 points | ' + JSON.stringify(p1after),
    p1after.storedTrail === 3);
  await ev(`(() => { upPut = window.__p1OrigUpPut; localStorage.removeItem = window.__p1OrigRemove; return true; })()`);

  // ---- P1b (Beta 1.186 gate round, Codex finding): a primary edit refused by ----
  // the fence is retried after a FAILED restore. Same fault-injection window as
  // P1 above; inside it a street is marked. Its saveAll is refused by the fence
  // and - by the 1.147 design that binds the SUCCESS path - arms nothing, so the
  // mark lives only in memory. The P1 failure exit originally re-armed only
  // trail/sess/aux, so the mark was never retried: a reload after the failed
  // restore lost it. The exit now re-arms primary too - the rollback has put
  // storage back to the pre-restore board, so the heartbeat retry writes the
  // live board, in-window edit included.
  await ev(`(() => {
    window.__p1bOrigUpPut = upPut;
    window.__p1bInWindow = false;
    window.__p1bGate = new Promise(res => { window.__p1bRelease = res; });
    upPut = async (id, pack) => { window.__p1bInWindow = true; await window.__p1bGate; return window.__p1bOrigUpPut(id, pack); };
    window.__p1bOrigRemove = localStorage.removeItem.bind(localStorage);
    window.__p1bStartKey = routeKeys('5w').start;
    localStorage.removeItem = (k) => { if (k === window.__p1bStartKey) throw new Error('d169 refused delete'); return window.__p1bOrigRemove(k); };
    return true;
  })()`);
  const P1BPACK = { name: 'D169 P1b Route', area: 'Vaughan', mains: [], roads: { 'Test Street': [[[43.8, -79.57], [43.801, -79.571]]] }, reference: {} };
  const bkP1b = JSON.stringify({ app: 'snowroute-backup', v: 2, at: P1T * 1000, userpacks: { 'route-d169p1b': P1BPACK }, routes: { '5w': { start: null } } });
  await injectBackup(bkP1b);
  await ev(`(() => { window.__p1bSettled = false; window.__d169probe = 1; restoreBackup(JSON.parse(window.__d169b)).then(() => { window.__p1bSettled = true; }, () => { window.__p1bSettled = true; }); return true; })()`);
  const inWindowB = await poll(`window.__p1bInWindow === true`, 15000);
  ok('P1b phase 1 reached (the window is open)', inWindowB === true);
  const p1bwin = JSON.parse(await ev(`(() => { const rk = routeKeys('5w');
    const target = ['Velmar', 'Mellings', 'Astona', 'Santa Barbara', 'Valeria', 'Greenpark'].find(n => !doneSet.has(n));
    window.__p1bTarget = target;
    markDone(target, 'd169');
    const storedDone = JSON.parse(localStorage.getItem(rk.done) || '[]');
    return JSON.stringify({ target, fenceUp: restoring, armedInWindow: writePending('primary'), storedHas: storedDone.includes(target), memHas: doneSet.has(target) });
  })()`));
  ok('P1b inside the window the mark is memory-only (the fenced save was refused and armed nothing) | ' + JSON.stringify(p1bwin),
    p1bwin.fenceUp === true && p1bwin.memHas === true && p1bwin.storedHas === false && p1bwin.armedInWindow === false);
  await ev(`window.__p1bRelease(); true`);
  const settledB = await poll(`window.__p1bSettled === true`, 20000);
  ok('P1b the sabotaged restore ran its failure path to completion', settledB === true);
  const p1bpost = JSON.parse(await ev(`(() => { return JSON.stringify({ fenceNow: restoring, pendingPrimary: writePending('primary') }); })()`));
  ok('P1b the failure exit re-arms the PRIMARY retry (the in-window edit is owed a save) | ' + JSON.stringify(p1bpost),
    p1bpost.fenceNow === false && p1bpost.pendingPrimary === true);
  const p1bafter = JSON.parse(await ev(`(() => { const rk = routeKeys('5w'); flushAux(true); const storedDone = JSON.parse(localStorage.getItem(rk.done) || '[]'); return JSON.stringify({ storedHas: storedDone.includes(window.__p1bTarget) }); })()`));
  ok('P1b FIXED: the in-window mark SURVIVES the failed restore - the re-armed retry lands it on the next flush | ' + JSON.stringify(p1bafter),
    p1bafter.storedHas === true);
  await ev(`(() => { upPut = window.__p1bOrigUpPut; localStorage.removeItem = window.__p1bOrigRemove; return true; })()`);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 220));
finish(R, proc);
