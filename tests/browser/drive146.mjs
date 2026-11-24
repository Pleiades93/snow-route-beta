import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive146: Beta 1.97, audit-loop round 196 (Codex audit of 1.96, adjudicated + debated to
// convergence 2026-11-04, gate approved by Andrew incl. CG-196-02).
// A: CG-196-02 - a NORMAL backup carries the active run's cancel snapshot; a run restored
//    from it keeps the exact-restore Cancel (a pre-Start side unmarked mid-run comes back).
// B: CG-196-01 - an idle backup asserts idle explicitly (start: null). Beta 1.287
//    (issue #172): under merge restore the assertion no longer clears a resident
//    run - merge never deletes, so the resident start + snapshot survive.
// C: Beta 1.110 - post-finish board work: the Undo is removed, so mutations after a
//    confirmed finish are simply new work and the archived clean never comes back
//    (this section was CG-196-03's undo-invalidation suite).
// D: CG-196-05 - marking outcomes are gated on the save result; a failed save never
//    gets a success claim, and a later failure in the same episode still says "not saved".
//    (Beta 1.221: the success pills themselves are cut - D0/D3 assert the silence.)
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
const S1 = JSON.parse(await ev(`(() => JSON.stringify({ show: $('toast').classList.contains('show'), text: $('toast').textContent }))()`));
ok('S1 a HEALTHY Start shows NO snapshot-failure warning (Beta 1.221 gate regression - Codex P2 on PR #98: cutting the success pill left the warning branch unguarded, so every healthy Start cried storage failure) | ' + JSON.stringify(S1), !(S1.show && S1.text.indexOf('cancel safety snapshot') >= 0));
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
ok('B2 restoring an idle backup does NOT clear the destination run: start + snapshot survive (merge never deletes; the CG-196-01 replace-era idle assertion is superseded for restore) | ' + JSON.stringify(postB), postB.start !== null && postB.snap !== null && postB.run > 0);
ok('B3 the board after an idle restore is the union (the backup board stands, the run mark survives) | ' + JSON.stringify(postB), postB.done === 0 && postB.astona === 1 && (postB.velmar & 1) === 1);

// ---- C: post-finish board work (Beta 1.110) ---- //
const setupFinish = async () => { await ev(`(() => { runStart = Date.now() - 3600000; markDone('Velmar', 'tap'); markDone('Mellings', 'tap'); markDone('Astona', 'tap'); finishRun(); return true; })()`); await sleep(300); };
await setupFinish();
const c0 = JSON.parse(await ev(`(() => JSON.stringify({ btn: $('resetBtn').textContent, undoing: $('resetBtn').classList.contains('undoing'), h: history.length }))()`));
ok('C0 setup: finish archived and offers NO Undo - the button is back to FINISH (Beta 1.110) | ' + JSON.stringify(c0), c0.btn === 'FINISH' && c0.undoing === false && c0.h >= 1);
const hC = c0.h;
await ev(`togglePiece('Boddy', 0, 0); true`); await sleep(200);
ok('C1 a side-chip mark after the finish lands as new work; the archive is untouched | Boddy ' + await ev(`pieces.Boddy[0]`) + ' h ' + await ev(`history.length`), (await ev(`pieces.Boddy[0] & 1`)) === 1 && (await ev(`history.length`)) === hC);
await ev(`(() => { $('resetBtn').click(); return true; })()`); await sleep(300);
const c1b = JSON.parse(await ev(`(() => JSON.stringify({ open: !$('finModal').classList.contains('hidden'), h: history.length, done: doneSet.size }))()`));
await ev(`(() => { $('finNo').click(); return true; })()`);
ok('C1b the button after a finish opens the pop-up - the archived clean does NOT come back | ' + JSON.stringify(c1b), c1b.open === true && c1b.h === hC && c1b.done === 0);
await setupFinish();
await ev(`(() => { selSet = [{ name: 'Boddy', idx: 0 }]; togglePieceGroup(1); return true; })()`); await sleep(200);
ok('C2 a group-chip mark after the finish lands as new work | Boddy ' + await ev(`pieces.Boddy[0]`), (await ev(`pieces.Boddy[0] & 2`)) === 2);
await setupFinish();
await ev(`markDone('Velmar', 'tap'); true`); await sleep(200);
await ev(`markUndone('Velmar'); true`); await sleep(200);
ok('C3 a whole-street mark + unmark after the finish behaves as fresh work | Velmar done ' + await ev(`doneSet.has('Velmar')`), (await ev(`doneSet.has('Velmar')`)) === false);
await setupFinish();
await ev(`(() => { pieces.Boddy[0] = 1; clearAllMarks(); return true; })()`); await sleep(200);
const c5 = JSON.parse(await ev(`(() => JSON.stringify({ boddy: pieces.Boddy[0], h: history.length }))()`));
ok('C5 an effective Clear after the finish clears the fresh board; the archive is untouched | ' + JSON.stringify(c5), c5.boddy === 0 && c5.h === hC + 3);
await setupFinish();
await ev(`startClean(); true`); await sleep(250);
const c6 = JSON.parse(await ev(`(() => JSON.stringify({ run: runStart > 0, h: history.length }))()`));
ok('C6 starting a new run after the finish begins cleanly; the archived cleans stay archived | ' + JSON.stringify(c6), c6.run === true && c6.h === hC + 4);
await ev(`cancelStart(); true`); await sleep(250);

// ---- D: toast gating on save failure ---- //
// Beta 1.221 re-derivation: the marking outcome pills are CUT (Andrew's
// toast rule) - a healthy save fires NO pill at all now. The gating
// property survives on the failure side, which is the side CG-196-05
// exists for: a failed save still warns, and never claims success.
await ev(`(() => { $('toast').textContent = ''; $('toast').classList.remove('show'); return true; })()`); // isolate the action's own pill (the D1/D2 idiom below): an ambient KEPT pill standing from boot (the rig's location-off warning) is not this save's pill
await ev(`markDone('Boddy', 'tap'); true`); await sleep(200);
ok('D0 healthy save: NO completion pill fires since Beta 1.221 | ' + await ev(`$('toast').textContent`), (await ev(`$('toast').textContent`)).indexOf('✓') !== 0 && (await ev(`$('toast').classList.contains('show')`)) === false);
await ev(`(() => { window.__ls146 = lsSet; lsSet = () => false; $('toast').textContent = ''; return true; })()`);
await ev(`markDone('Velmar', 'tap'); true`); await sleep(200);
const d1 = await ev(`$('toast').textContent`);
ok('D1 failed save: NO success toast - the storage warning stands instead (CG-196-05) | ' + JSON.stringify(d1), d1.indexOf('✓') !== 0 && /not saving|storage/i.test(d1));
await ev(`(() => { $('toast').textContent = ''; return true; })()`);
await ev(`togglePiece('Astona', 0, 0); true`); await sleep(200);
const d2 = await ev(`$('toast').textContent`);
ok('D2 a later failure in the same episode still says not saved (the episode warning only fires once) (CG-196-05) | ' + JSON.stringify(d2), d2 === 'Not saved - storage problem');
await ev(`(() => { lsSet = window.__ls146; $('toast').textContent = ''; $('toast').classList.remove('show'); return true; })()`); // same isolation: D2's KEPT storage pill may still be standing inside its display window - it is not the unmark's pill
await ev(`markUndone('Velmar'); true`); await sleep(200);
ok('D3 healthy again: the unmark lands and no pill fires since Beta 1.221 | ' + await ev(`$('toast').textContent`), (await ev(`!doneSet.has('Velmar') && !$('toast').classList.contains('show')`)) === true);

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
ok('E1 a snapshot carried without its run start never lands: the resident run start + snapshot are untouched (merge form of the CG-196-01 verify-cycle-1 rule) | ' + JSON.stringify(e1), e1.start !== null && e1.snap !== null && JSON.parse(e1.snap).at > 0);
await ev(`startClean(); true`); await sleep(250);
await ev(`togglePiece('Velmar', 0, 0); true`); await sleep(250); // unmark the fixture side mid-run
await ev(`(() => { runSnap = null; window.__og146 = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { if (k === LS.snap) throw new Error('read fail'); return window.__og146.call(this, k); }; return true; })()`);
const refused = await ev(`buildBackup()`);
ok('E2 a snapshot READ failure fails the normal export whole - never a valid-looking backup missing the snapshot (CG-196-02, verify cycle 1) | refused ' + (refused === null), refused === null);
await ev(`(() => { Storage.prototype.getItem = window.__og146; return true; })()`);
const healthy = JSON.parse(JSON.parse(JSON.stringify(await ev(`buildBackup()`))));
ok('E2b healthy again: the export carries the snapshot | snap ' + (typeof healthy.routes['5w'].snap), typeof healthy.routes['5w'].snap === 'string');
await ev(`cancelStart(); true`); await sleep(250);

// ---- S2: the snapshot warning lives, gated on the failure (Beta 1.221 gate fix) ---- //
await ev(`(() => { window.__os146 = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === LS.snap) throw new Error('rig: snap write fails'); return window.__os146.call(this, k, v); }; window.__pillLog146 = []; window.__pillRec146 = setInterval(() => { const t = $('toast'); window.__pillLog146.push(t.classList.contains('show') ? t.textContent : ''); }, 25); return true; })()`);
await ev(`startClean(); true`); await sleep(1200);
const S2 = JSON.parse(await ev(`(() => { clearInterval(window.__pillRec146); return JSON.stringify(window.__pillLog146); })()`));
ok('S2 a FAILED snapshot save at Start DOES warn - the warning is gated on !okSnap.ok, not deleted (Beta 1.221 gate fix; an in-page recorder samples the pill every 25 ms because the ambient location-off pill legitimately overwrites it within a second) | saw snapshot warning: ' + S2.some(x => x.indexOf('cancel safety snapshot could not be saved') >= 0), S2.some(x => x.indexOf('cancel safety snapshot could not be saved') >= 0));
await ev(`(() => { Storage.prototype.setItem = window.__os146; cancelStart(); return true; })()`); await sleep(250);

R.exceptions = consoleLog.filter(l => l.type === 'error');
await finish(R, proc);
