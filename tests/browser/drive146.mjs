import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive146: Beta 1.97, audit-loop round 196 (Codex audit of 1.96, adjudicated + debated to
// convergence 2026-11-04, gate approved by Andrew incl. CG-196-02).
// A: CG-196-02 - a NORMAL backup carries the active run's cancel snapshot; a run restored
//    from it keeps the exact-restore Cancel (a pre-Start side unmarked mid-run comes back).
// B: CG-196-01 - an idle backup asserts idle explicitly (start: null); restoring it onto a
//    device with an active run clears that run's start + snapshot transactionally.
// C: CG-196-03 - every board mutation kills a pending Finish Undo (side chip, group chip,
//    whole-street unmark, effective Clear, new Start); markDone already did (guard).
// D: CG-196-05 - marking outcome toasts are gated on the save result; a failed save never
//    gets a success toast, and a later failure in the same episode still says "not saved".
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

ok('T0 app script is live', await poll(`typeof finishRun === 'function' && typeof buildBackup === 'function' && typeof restoreBackup === 'function'`, 90000));

// Capture an IDLE backup (B's fixture + B0's shape assertion): one pre-run mark on the
// board, NO run active - so the fixture carries a real board AND asserts idle.
await ev(`togglePiece('Velmar', 0, 0); true`); await sleep(250);
const idleBk = await ev(`buildBackup()`);
const idleParsed = JSON.parse(JSON.parse(JSON.stringify(idleBk)));
ok('B0 an idle backup asserts idle explicitly (start: null, not an omitted key) (CG-196-01) | routes ' + JSON.stringify(Object.keys(idleParsed.routes || {})), !!idleParsed.routes && !!idleParsed.routes['5w'] && ('start' in idleParsed.routes['5w']) && idleParsed.routes['5w'].start === null);

// ---- A: snapshot in a normal backup ---- //
// (the pre-Start mark is the fixture's Velmar side, marked above)
await ev(`startClean(); true`); await sleep(250);
await ev(`togglePiece('Velmar', 0, 0); true`); await sleep(250); // unmark it mid-run - the journal-blind act
const bkA = JSON.parse(JSON.parse(JSON.stringify(await ev(`buildBackup()`))));
const snapA = (() => { try { return JSON.parse(bkA.routes['5w'].snap); } catch (e) { return null; } })();
ok('A1 a normal backup made mid-run carries the cancel snapshot (CG-196-02) | snap ' + (bkA.routes['5w'].snap ? 'present' : 'ABSENT'), typeof bkA.routes['5w'].snap === 'string');
ok('A2 the carried snapshot holds the pre-Start board (Velmar side still marked in it) | ' + JSON.stringify(snapA && snapA.pieces && snapA.pieces.Velmar), !!snapA && (snapA.pieces.Velmar[0] & 1) === 1);
ok('A3 the backup carries the run start alongside | start ' + bkA.routes['5w'].start, typeof bkA.routes['5w'].start === 'string' && +bkA.routes['5w'].start > 0);
const bkAText = JSON.stringify(bkA);
await ev(`(() => { localStorage.clear(); location.reload(); return true; })()`); await sleep(1200);
await bootThrough(ev, poll);
await ev(`(() => { $('xText').value = ${JSON.stringify(bkAText)}; doRestore(); return true; })()`); await sleep(1600);
await bootThrough(ev, poll);
await poll(`typeof cancelStart === 'function' && runStart > 0`, 30000);
const preCancel = JSON.parse(await ev(`(() => JSON.stringify({ run: runStart, snap: localStorage.getItem(LS.snap) !== null, velmar: pieces.Velmar[0] }))()`));
ok('A4 setup: the restored run is active with its snapshot on disk | ' + JSON.stringify(preCancel), preCancel.run > 0 && preCancel.snap === true && (preCancel.velmar & 1) === 0);
await ev(`cancelStart(); true`); await sleep(300);
const postCancel = JSON.parse(await ev(`(() => JSON.stringify({ run: runStart, velmar: pieces.Velmar[0] }))()`));
ok('A5 cancel after a normal-backup restore restores the unmarked pre-Start side exactly (snapshot, not journal) (CG-196-02) | ' + JSON.stringify(postCancel), postCancel.run === 0 && (postCancel.velmar & 1) === 1);

// ---- B: idle backup clears a destination run ---- //
await ev(`startClean(); true`); await sleep(250);
await ev(`togglePiece('Astona', 0, 0); true`); await sleep(250);
const preB = JSON.parse(await ev(`(() => JSON.stringify({ start: localStorage.getItem(LS.start), snap: localStorage.getItem(LS.snap) }))()`));
ok('B1 setup: destination holds an active run (start + snapshot stored) | start ' + !!preB.start + ' snap ' + !!preB.snap, !!preB.start && !!preB.snap);
await ev(`(() => { $('xText').value = ${JSON.stringify(idleBk)}; doRestore(); return true; })()`); await sleep(1600);
await bootThrough(ev, poll);
await poll(`typeof runStart !== 'undefined'`, 30000);
const postB = JSON.parse(await ev(`(() => JSON.stringify({ start: localStorage.getItem(LS.start), snap: localStorage.getItem(LS.snap), run: runStart, done: doneSet.size, astona: pieces.Astona[0], velmar: pieces.Velmar[0] }))()`));
ok('B2 restoring an idle backup clears the destination run start + snapshot - no inherited run (CG-196-01) | ' + JSON.stringify(postB), postB.start === null && postB.snap === null && postB.run === 0);
ok('B3 the restored board is the idle backup board (fixture mark present, the run mark gone) | ' + JSON.stringify(postB), postB.done === 0 && postB.astona === 0 && (postB.velmar & 1) === 1);

// ---- C: undo invalidation ---- //
const setupFinish = async () => { await ev(`(() => { runStart = Date.now() - 3600000; markDone('Velmar', 'tap'); markDone('Mellings', 'tap'); markDone('Astona', 'tap'); finishRun(); return true; })()`); await sleep(300); };
await setupFinish();
const c0 = JSON.parse(await ev(`(() => JSON.stringify({ undo: !!undoSnap, btn: $('resetBtn').textContent }))()`));
ok('C0 setup: finish offers Undo | ' + JSON.stringify(c0), c0.undo === true && c0.btn === 'Undo');
await ev(`togglePiece('Boddy', 0, 0); true`); await sleep(200);
const c1 = JSON.parse(await ev(`(() => JSON.stringify({ undo: !!undoSnap, btn: $('resetBtn').textContent }))()`));
ok('C1 a side-chip mark kills the pending Undo and restores the Finish label (CG-196-03) | ' + JSON.stringify(c1), c1.undo === false && c1.btn === 'Finish');
await ev(`doUndo(); true`); await sleep(200);
ok('C1b the dead Undo cannot fire - the new mark survives | Boddy ' + await ev(`pieces.Boddy[0]`), (await ev(`pieces.Boddy[0] & 1`)) === 1);
await setupFinish();
await ev(`(() => { selSet = [{ name: 'Boddy', idx: 0 }]; togglePieceGroup(1); return true; })()`); await sleep(200);
ok('C2 a group-chip mark kills the pending Undo (CG-196-03) | undo ' + await ev(`!!undoSnap`), (await ev(`!!undoSnap`)) === false);
await setupFinish();
await ev(`markUndone('Velmar'); true`); await sleep(200);
const c3 = JSON.parse(await ev(`(() => JSON.stringify({ undo: !!undoSnap, velmar: pieces.Velmar.every(v => v === 0) }))()`));
ok('C3 a whole-street unmark kills the pending Undo (CG-196-03) | ' + JSON.stringify(c3), c3.undo === false && c3.velmar === true);
await ev(`doUndo(); true`); await sleep(200);
ok('C3b the dead Undo cannot resurrect the unmarked street | Velmar done ' + await ev(`doneSet.has('Velmar')`), (await ev(`doneSet.has('Velmar')`)) === false);
await setupFinish();
await ev(`markDone('Boddy', 'tap'); true`); await sleep(200);
ok('C4 whole-street mark still kills the pending Undo (pre-existing behaviour, guard) | undo ' + await ev(`!!undoSnap`), (await ev(`!!undoSnap`)) === false);
await setupFinish();
await ev(`(() => { pieces.Boddy[0] = 1; clearAllMarks(); return true; })()`); await sleep(200);
const c5 = JSON.parse(await ev(`(() => JSON.stringify({ undo: !!undoSnap, boddy: pieces.Boddy[0] }))()`));
ok('C5 an effective Clear kills the pending Undo (CG-196-03) | ' + JSON.stringify(c5), c5.undo === false && c5.boddy === 0);
await setupFinish();
await ev(`startClean(); true`); await sleep(250);
const c6 = JSON.parse(await ev(`(() => JSON.stringify({ undo: !!undoSnap, run: runStart > 0 }))()`));
ok('C6 starting a new run kills the pending Undo (CG-196-03) | ' + JSON.stringify(c6), c6.undo === false && c6.run === true);
await ev(`cancelStart(); true`); await sleep(250);

// ---- D: toast gating on save failure ---- //
await ev(`markDone('Boddy', 'tap'); true`); await sleep(200);
ok('D0 healthy save: the completion toast shows | ' + await ev(`$('toast').textContent`), (await ev(`$('toast').textContent`)).indexOf('✓ Boddy') === 0);
await ev(`(() => { window.__ls146 = lsSet; lsSet = () => false; $('toast').textContent = ''; return true; })()`);
await ev(`markDone('Velmar', 'tap'); true`); await sleep(200);
const d1 = await ev(`$('toast').textContent`);
ok('D1 failed save: NO success toast - the storage warning stands instead (CG-196-05) | ' + JSON.stringify(d1), d1.indexOf('✓') !== 0 && /not saving|storage/i.test(d1));
await ev(`(() => { $('toast').textContent = ''; return true; })()`);
await ev(`togglePiece('Astona', 0, 0); true`); await sleep(200);
const d2 = await ev(`$('toast').textContent`);
ok('D2 a later failure in the same episode still says not saved (the episode warning only fires once) (CG-196-05) | ' + JSON.stringify(d2), d2 === 'Not saved — storage problem');
await ev(`(() => { lsSet = window.__ls146; return true; })()`);
await ev(`markUndone('Velmar'); true`); await sleep(200);
ok('D3 healthy again: the outcome toast returns | ' + await ev(`$('toast').textContent`), (await ev(`$('toast').textContent`)) === 'Unmarked Velmar');

// ---- E: verify-cycle-1 corrections (Codex, 2026-11-04) ---- //
await ev(`startClean(); true`); await sleep(250);
const realSnapObj = JSON.parse(await ev(`localStorage.getItem(LS.snap)`));
await ev(`cancelStart(); true`); await sleep(250);
await ev(`startClean(); true`); await sleep(250); // the destination holds a live run (start + snapshot stored)
const crafted = JSON.parse(JSON.parse(JSON.stringify(idleBk)));
crafted.routes['5w'].snap = JSON.stringify({ ...realSnapObj, at: 0 });
await ev(`(() => { $('xText').value = ${JSON.stringify(JSON.stringify(crafted))}; doRestore(); return true; })()`); await sleep(1600);
await bootThrough(ev, poll);
await poll(`typeof runStart !== 'undefined'`, 30000);
const e1 = JSON.parse(await ev(`(() => JSON.stringify({ start: localStorage.getItem(LS.start), snap: localStorage.getItem(LS.snap) }))()`));
ok('E1 an idle assertion paired with a crafted at:0 snapshot still clears BOTH keys - the snap branch never runs against a deleted start (CG-196-01, verify cycle 1) | ' + JSON.stringify(e1), e1.start === null && e1.snap === null);
await ev(`startClean(); true`); await sleep(250);
await ev(`togglePiece('Velmar', 0, 0); true`); await sleep(250); // unmark the fixture side mid-run
await ev(`(() => { runSnap = null; window.__og146 = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { if (k === LS.snap) throw new Error('read fail'); return window.__og146.call(this, k); }; return true; })()`);
const refused = await ev(`buildBackup()`);
ok('E2 a snapshot READ failure fails the normal export whole - never a valid-looking backup missing the snapshot (CG-196-02, verify cycle 1) | refused ' + (refused === null), refused === null);
await ev(`(() => { Storage.prototype.getItem = window.__og146; return true; })()`);
const healthy = JSON.parse(JSON.parse(JSON.stringify(await ev(`buildBackup()`))));
ok('E2b healthy again: the export carries the snapshot | snap ' + (typeof healthy.routes['5w'].snap), typeof healthy.routes['5w'].snap === 'string');
await ev(`cancelStart(); true`); await sleep(250);

R.exceptions = consoleLog.filter(l => l.type === 'error');
await finish(R, proc);
