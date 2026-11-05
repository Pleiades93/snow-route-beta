import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, url, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive136: Beta 1.57 Phase 2 storage integrity (external audit Section 7).
// saveAll() has a failure CONTRACT (the authority sides record is written
// first, every write is checked, the first failure is named in the save result's failedKey);
// Finish and Undo are verified transactions whose gated writes land before
// any state changes. Failures are INJECTED by stubbing
// Storage.prototype.setItem for one key at a time - lsSet converts the throw
// into the false return the contract consumes, which is the failure signal a
// real quota error produces. Each case asserts the user-visible outcome:
// honest toast, run intact, storage coherent.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
await sleep(3000);
ok('S0 app boots for the storage transaction tests', await poll120(`!!window.maplibregl && !!document.querySelector('#map canvas')`, 45000));
const INSTALL_STUB = `(() => { window.__stubKey = null; const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (window.__stubKey && k === window.__stubKey) throw new Error('injected quota failure'); return orig.call(this, k, v); }; window.__stub = k => { window.__stubKey = k; }; window.__unstub = () => { window.__stubKey = null; }; return typeof window.__stub === 'function'; })()`;
ok('S0b fault-injection stub installed', await ev(INSTALL_STUB) === true);
const seed = async () => { await ev(`(() => { markDone('Velmar', 'test'); markDone('Mellings', 'test'); markDone('Astona', 'test'); return doneSet.size; })()`); await sleep(250); };
const state = async () => JSON.parse(await ev(`JSON.stringify({ done: doneSet.size, label: $('resetBtn').textContent, toast: $('toast').textContent, hist: history.length, lsHist: JSON.parse(localStorage.getItem('snowroute.5w.v2.history') || '[]').length, snap: !!undoSnap })`));
await seed();
let st = await state();
ok('S1 seeded clean: 3 streets done, nothing archived yet | ' + JSON.stringify(st), st.done === 3 && st.hist === 0 && st.lsHist === 0);
// F3: the ARCHIVE write fails during Finish - the pre-1.57 gate already
// stopped this; regression-pin it inside the transaction suite.
await ev(`__stub('snowroute.5w.v2.history')`);
await ev(`(() => { performReset(); return true; })()`); await sleep(300);
st = await state();
ok('F3 archive write fails: finish stops, run intact, nothing archived | ' + JSON.stringify(st), st.done === 3 && st.lsHist === 0 && st.label === 'FINISH' && /finish stopped/.test(st.toast));
await ev(`__unstub()`);
// F2: the cleared AUTHORITY write fails during Finish - the archive write
// lands first and must be ROLLED BACK; the clean survives whole.
await ev(`__stub('snowroute.5w.v5.sides')`);
await ev(`(() => { performReset(); return true; })()`); await sleep(300);
st = await state();
const sidesKept = JSON.parse(await ev(`(() => { const s = JSON.parse(localStorage.getItem('snowroute.5w.v5.sides') || '{}'); return JSON.stringify({ velmar: (s.p && s.p.Velmar) ? s.p.Velmar.some(v => v > 0) : false }); })()`));
ok('F2 authority write fails: finish stops, archive rolled back, run intact, stored sides untouched | ' + JSON.stringify(st) + ' ' + JSON.stringify(sidesKept), st.done === 3 && st.lsHist === 0 && st.label === 'FINISH' && /clean is intact/.test(st.toast) && sidesKept.velmar === true);
await ev(`__unstub()`);
// F1: a MARK whose authority write fails reports the failure (contract +
// episode warning) and does not persist on reload.
await ev(`__stub('snowroute.5w.v5.sides')`);
await ev(`(() => { togglePiece('Boddy', 0, 0); return true; })()`); await sleep(300);
st = await state();
ok('F1 mark with failing authority write: failure named (sides) + storage warning shown | ' + JSON.stringify(st), /not saving \(sides\)/.test(st.toast));
await ev(`__unstub()`);
await send('Page.navigate', { url: url }, S);
await sleep(3000);
await ev(INSTALL_STUB); // the reload wiped the page-side injection - reinstall it for F4/F5 (the F4/F5 failures in the first local run traced to exactly this, not to the app)
await ev(`loadRoute('5w'); true`); await sleep(600); // Beta 1.76: the navigate landed on the route menu
ok('F1b after reload the failed mark is absent and the seeded clean survives whole', await poll120(`doneSet.size === 3 && !streetComplete('Boddy')`, 30000));
// F4: a METADATA write (notes) fails during Finish - the finish completes
// (authority + archive agree) and says so honestly.
await ev(`__stub('snowroute.5w.v4.notes')`);
await ev(`(() => { performReset(); return true; })()`); await sleep(300);
st = await state();
ok('F4 notes write fails: finish completes, archive landed, warning names the gap | ' + JSON.stringify(st), st.done === 0 && st.lsHist === 1 && st.label === 'Undo' && /could not be written \(notes\)/.test(st.toast));
await ev(`__unstub()`);
// F5: the AUTHORITY write fails during Undo - the undo stays on offer
// (snapshot retained), then succeeds once storage recovers.
await ev(`__stub('snowroute.5w.v5.sides')`);
await ev(`(() => { doUndo(); return true; })()`); await sleep(300);
st = await state();
ok('F5 authority write fails during undo: undo stopped and STILL on offer, board untouched | ' + JSON.stringify(st), st.done === 0 && st.snap === true && st.label === 'Undo' && /undo stopped/.test(st.toast) && st.lsHist === 1);
await ev(`__unstub()`);
await ev(`(() => { doUndo(); return true; })()`); await sleep(300);
st = await state();
ok('F5b undo succeeds after storage recovers: run restored, archive un-happened | ' + JSON.stringify(st), st.done === 3 && st.lsHist === 0 && st.label === 'FINISH' && /Finish undone/.test(st.toast));
// F8 (Beta 1.94, deep audit SR-193-04): the restored run's START write is a
// gate in doUndo, taken BEFORE the snapshot is consumed. It used to ride
// the post-swap saveAll (snapshot already nulled), so a failed start write
// plus a reload restored the board but lost the run itself. The run is
// opened by hand here (runStart + saveAll) rather than via Start, to keep
// this drive's GPS untouched - Finish and Undo only read the value.
const f8start = await ev(`(() => { runStart = Date.now(); saveAll(); return runStart; })()`);
await ev(`(() => { performReset(); return true; })()`); await sleep(300);
let st8 = await state();
ok('F8 setup: finish landed with a live run waiting to be restored | ' + JSON.stringify(st8), st8.done === 0 && st8.snap === true && st8.label === 'Undo' && st8.lsHist === 1);
await ev(`__stub('snowroute.5w.v5.start')`);
await ev(`(() => { doUndo(); return true; })()`); await sleep(300);
st8 = await state();
const f8ls = JSON.parse(await ev(`JSON.stringify({ hist: JSON.parse(localStorage.getItem('snowroute.5w.v2.history') || '[]').length, start: localStorage.getItem('snowroute.5w.v5.start') })`));
ok('F8 start write fails during undo: undo stopped, STILL on offer, both gated writes rolled back | ' + JSON.stringify(st8) + ' ' + JSON.stringify(f8ls), st8.done === 0 && st8.snap === true && st8.label === 'Undo' && /undo stopped/.test(st8.toast) && f8ls.hist === 1 && f8ls.start === null);
await ev(`__unstub()`);
await ev(`(() => { doUndo(); return true; })()`); await sleep(300);
st8 = await state();
const f8run = await ev(`runStart`);
ok('F8b undo succeeds after storage recovers: the run is restored WITH its start time | ' + JSON.stringify(st8), st8.done === 3 && st8.label === 'FINISH' && f8run === f8start);
// F6 (Beta 1.63, audit F02): the ROLLBACK write itself fails - the archive
// write lands, the authority write fails, and rolling the archive back
// fails too. The stored history and the stored board now disagree, and
// the app must SAY so (never 'your clean is intact'). Needs a sequenced
// stub: the first history write passes, every later one throws, and the
// sides write always throws.
await ev(`(() => { const orig = Storage.prototype.setItem; let histWrites = 0; Storage.prototype.setItem = function (k, v) { if (k === 'snowroute.5w.v5.sides') throw new Error('injected quota failure'); if (k === 'snowroute.5w.v2.history') { histWrites++; if (histWrites > 1) throw new Error('injected quota failure'); } return orig.call(this, k, v); }; window.__seqOrig = orig; return true; })()`);
await ev(`(() => { performReset(); return true; })()`); await sleep(300);
st = await state();
ok('F6 rollback write fails: finish stops, run intact in memory, the divergence is REPORTED (archive persisted, no intact claim) | ' + JSON.stringify(st), st.done === 3 && st.lsHist === 1 && /could not be undone/.test(st.toast) && !/clean is intact/.test(st.toast));
await ev(`(() => { Storage.prototype.setItem = window.__seqOrig; return true; })()`);
await send('Page.navigate', { url: url }, S);
await sleep(3000); await ev(`loadRoute('5w'); true`); await sleep(600); // Beta 1.76
ok('F6b after reload the app boots on the diverged store without crashing (the archive is simply there)', await poll120(`typeof doneSet !== 'undefined'`, 30000));
// F7 (Beta 1.63, audit F03): a failing removeItem must surface through
// saveStart() - the delete path reports like every other write.
await ev(`(() => { const orig = Storage.prototype.removeItem; Storage.prototype.removeItem = function (k) { throw new Error('injected delete failure'); }; window.__delOrig = orig; return true; })()`);
const delFail = await ev(`(() => { runStart = 0; return saveStart().ok; })()`);
await ev(`(() => { Storage.prototype.removeItem = window.__delOrig; return true; })()`);
const delOk = await ev(`(() => { runStart = 0; return saveStart().ok; })()`);
ok('F7 removeItem failure: saveStart reports false; healthy storage reports true | fail ' + delFail + ' ok ' + delOk, delFail === false && delOk === true);
// F9 (Beta 1.94, deep audit SR-193-05): a failed saveAll arms the primary
// retry flag; the flushAux heartbeat then lands the save on its own once
// storage recovers. Before 1.94 a failed metadata write (notes/times/via)
// waited for the next incidental save - possibly forever under quota.
// The stub is reinstalled first: F6b's reload wiped the page-side injection
// (the same trap F1b's comment records).
await ev(INSTALL_STUB);
await ev(`__stub('snowroute.5w.v4.notes')`);
const f9a = JSON.parse(await ev(`(() => { const r = saveAll(); return JSON.stringify({ ok: r.ok, dirty: primaryDirty, fk: r.failedKey }); })()`));
ok('F9a a failed primary save arms the retry flag and names the failed record | ' + JSON.stringify(f9a), f9a.ok === false && f9a.dirty === true && f9a.fk === 'notes');
await ev(`__unstub()`);
const f9b = JSON.parse(await ev(`(() => { flushAux(true); return JSON.stringify({ dirty: primaryDirty, stored: localStorage.getItem('snowroute.5w.v4.notes') === JSON.stringify(notes) }); })()`));
ok('F9b the flush retry lands the failed save once storage recovers | ' + JSON.stringify(f9b), f9b.dirty === false && f9b.stored === true);

// F10 (Beta 1.95, deep audit SR-194-02): when storage is failing, the
// normal Backup REFUSES by design (it would ship the stale stored board) -
// and in 1.94 the failure warnings' "export a backup now" was therefore
// unactionable: the very marks at risk had no exit. The RECOVERY backup
// serializes the live in-memory state instead and is labelled as such.
const f10v0 = await ev(`pieces.Velmar[0]`);
await ev(`__stub('snowroute.5w.v5.sides')`);
await ev(`togglePiece('Velmar', 0, 0); true`); await sleep(200);
const f10a = JSON.parse(await ev(`(() => { try { const rec = buildRecovery(); const o = rec ? JSON.parse(rec) : null; const stored = JSON.parse(localStorage.getItem('snowroute.5w.v5.sides') || '{"p":{}}'); return JSON.stringify({ refused: buildBackup() === null, dirty: primaryDirty, hasRec: !!o, flagged: !!o && o.recovery === true, recVal: o ? JSON.parse(o.routes['5w'].sides).p.Velmar[0] : null, memVal: pieces.Velmar[0], storedVal: stored.p.Velmar ? stored.p.Velmar[0] : null }); } catch (e) { return JSON.stringify({ err: String(e) }); } })()`));
ok('F10a under a sides-write failure: Backup refuses, the labelled RECOVERY backup carries the live in-memory board (Beta 1.95, SR-194-02) | ' + JSON.stringify(f10a), f10a.refused === true && f10a.dirty === true && f10a.hasRec === true && f10a.flagged === true && f10a.recVal === f10a.memVal && f10a.recVal !== f10a.storedVal && f10a.memVal !== f10v0);
await ev(`__unstub()`);
await ev(`(function(){ notes.Velmar = [{ k: 'f10probe', at: '2026-11-04T00:00:00.000Z', text: 'recovery keeps me' }]; return true; })()`);
await ev(`__stub('snowroute.5w.v4.notes')`);
const f10save = await ev(`saveAll().ok`);
const f10b = JSON.parse(await ev(`(() => { try { const o = JSON.parse(buildRecovery()); return JSON.stringify({ notes: JSON.parse(o.routes['5w'].notes) }); } catch (e) { return JSON.stringify({ err: String(e) }); } })()`));
await ev(`__unstub()`);
await ev(`flushAux(true); true`); await sleep(200);
ok('F10b under a notes-write failure the recovery backup carries the in-memory notes too | save ' + f10save + ' ' + JSON.stringify(f10b), f10save === false && !!f10b.notes && JSON.stringify(f10b.notes).includes('recovery keeps me'));
const f10mem = await ev(`pieces.Velmar[0]`);
const f10c = await (async () => {
  await ev(`(function(){ sessionStorage.setItem('__rec136', buildRecovery()); return true; })()`);
  await ev(`(function(){ localStorage.clear(); return true; })()`);
  await ev(`location.reload(); true`);
  await bootThrough(ev, poll);
  const bm = await ev(`window.__bootAt`);
  await ev(`(function(){ document.getElementById('xText').value = sessionStorage.getItem('__rec136'); doRestore(); return true; })()`);
  await sleep(900);
  await poll(`!!window.__bootAt && window.__bootAt !== ${JSON.stringify(bm)}`, 30000);
  await ev(`loadRoute('5w'); true`); await sleep(600);
  return JSON.parse(await ev(`(() => { try { return JSON.stringify({ val: pieces.Velmar[0], note: JSON.stringify(notes.Velmar || []).includes('recovery keeps me') }); } catch (e) { return JSON.stringify({ err: String(e) }); } })()`));
})();
ok('F10c a recovery backup restores through the normal restore path - marks and notes recovered | ' + JSON.stringify(f10c), f10c.val === f10mem && f10c.note === true);

// --- F11 (Beta 1.96, deep audit SR-195-02): the recovery backup CARRIES the
// run's cancel snapshot (Andrew's pick: carry it, do not just warn). 1.95's
// recovery file held every route field EXCEPT the snapshot, so a restored
// run's Cancel fell back to the stamp journal and a pre-Start side unmarked
// during the run stayed unmarked - the exact loss SR-194-01 fixed in-app,
// reopened by the recovery path.
await ev(`markDone('Astona', 'tap')`); await sleep(200);
await ev(`startClean()`); await sleep(200);
await ev(`togglePiece('Astona', 0, 0)`); // unmark one side of the pre-Start-completed street during the run
const f11a = JSON.parse(await ev(`(function(){ const o = JSON.parse(buildRecovery()); let snap = null; try { snap = JSON.parse(o.routes['5w'].snap); } catch (e) {} return JSON.stringify({ hasSnap: !!snap, atOk: !!snap && snap.at === runStart, astonaInSnap: !!snap && snap.pieces.Astona && snap.pieces.Astona[0] === 3 }); })()`));
ok('F11a a recovery backup carries the cancel snapshot of the active run, stamped with the run start (Beta 1.96, SR-195-02) | ' + JSON.stringify(f11a), f11a.hasSnap && f11a.atOk && f11a.astonaInSnap);
await ev(`(function(){ sessionStorage.setItem('f11rec', buildRecovery()); return true; })()`);
await ev(`(function(){ localStorage.clear(); location.reload(); return true; })()`); await sleep(1200);
await bootThrough(ev, poll);
await ev(`(function(){ document.getElementById('xText').value = sessionStorage.getItem('f11rec'); doRestore(); return true; })()`); await sleep(1500);
await bootThrough(ev, poll);
const f11b = JSON.parse(await ev(`(function(){ let okSnap = false; try { okSnap = !!validateSnap(JSON.parse(localStorage.getItem(LS.snap)), runStart); } catch (e) {} return JSON.stringify({ run: runStart > 0, snapOk: okSnap }); })()`));
ok('F11b the restored recovery run has its snapshot back on disk, validated against the restored start (Beta 1.96, SR-195-02) | ' + JSON.stringify(f11b), f11b.run && f11b.snapOk);
await ev(`cancelStart()`); await sleep(300);
ok('F11c cancel after a recovery restore restores the pre-Start board exactly - the side unmarked during the run returns (Beta 1.96, SR-195-02)', (await ev(`doneSet.has('Astona') && pieces.Astona.every(v => v === 3)`)) === true);
// F11d: a recovery file whose snapshot field is corrupt - the restore must
// land the run, drop the snapshot WITH a warning, and store no garbage.
await ev(`markDone('Velmar', 'tap')`); await sleep(200);
await ev(`startClean()`); await sleep(200);
await ev(`(function(){ const o = JSON.parse(buildRecovery()); o.routes['5w'].snap = JSON.stringify({ at: 1, pieces: { Velmar: [99] }, pieceTimes: {}, done: [], times: {}, via: {}, cov: {} }); sessionStorage.setItem('f11bad', JSON.stringify(o)); return true; })()`);
await ev(`(function(){ localStorage.clear(); location.reload(); return true; })()`); await sleep(1200);
await bootThrough(ev, poll);
const toast11d = await ev(`(function(){ document.getElementById('xText').value = sessionStorage.getItem('f11bad'); doRestore(); return document.getElementById('toast').textContent; })()`); await sleep(1500);
await bootThrough(ev, poll);
const f11d = JSON.parse(await ev(`(function(){ return JSON.stringify({ run: runStart > 0, velmar: doneSet.has('Velmar'), snapStored: localStorage.getItem(LS.snap) }); })()`));
ok('F11d a corrupt snapshot inside a recovery file is dropped with a warning; the restore itself is unharmed (Beta 1.96, SR-195-02) | ' + toast11d + ' ' + JSON.stringify(f11d), /start snapshot was not usable/.test(toast11d) && f11d.run && f11d.velmar && f11d.snapStored === null);
await ev(`cancelStart()`); await sleep(200);


// --- F12 (Beta 1.96, Andrew's design): ONE Backup button. When the normal
// backup cannot be built because saving failed, the Backup press falls back
// AUTOMATICALLY to the recovery export and says so loudly - no second
// button to hunt for mid-clean. A healthy save still produces a normal
// backup with no recovery marker. The share is captured by stubbing
// navigator.share into the text branch.
await ev(`(function(){ window.__shared136 = null; try { Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true }); } catch (e) {} navigator.share = (arg) => { window.__shared136 = arg && arg.text ? arg.text : 'NO-TEXT'; return Promise.resolve(); }; return true; })()`);
await ev(INSTALL_STUB); // F11's reloads wiped the fault-injection stub - reinstall before stubbing
await ev(`__stub('snowroute.5w.v5.sides')`);
await ev(`togglePiece('Velmar', 1, 0); true`); await sleep(200);
await ev(`shareBackup(); true`);
await poll(`!!window.__shared136`, 15000); await sleep(200);
const f12a = JSON.parse(await ev(`(() => { try { const o = JSON.parse(window.__shared136); return JSON.stringify({ isRec: o.recovery === true, toast: $('toast').textContent }); } catch (e) { return JSON.stringify({ err: String(e) }); } })()`));
ok('F12a with saving broken, the Backup press shares a RECOVERY file and the toast says so | ' + JSON.stringify(f12a), f12a.isRec === true && f12a.toast.indexOf('recovery backup') >= 0 && f12a.toast.indexOf('could not be saved') >= 0);
await ev(`__unstub()`);
await ev(`flushAux(true); window.__shared136 = null; true`); await sleep(200);
await ev(`shareBackup(); true`);
await poll(`!!window.__shared136`, 15000); await sleep(200);
const f12b = JSON.parse(await ev(`(() => { try { const o = JSON.parse(window.__shared136); return JSON.stringify({ isRec: o.recovery === true, app: o.app }); } catch (e) { return JSON.stringify({ err: String(e) }); } })()`));
ok('F12b with saving healthy, the Backup press shares a NORMAL backup (no recovery marker) | ' + JSON.stringify(f12b), f12b.isRec === false && f12b.app === 'snowroute-backup');

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);


