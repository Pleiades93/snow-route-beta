import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, url, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive162: Beta 1.141 (Package A / DA-10) - a committed finish whose metadata
// cleanup writes fail must not leave the finished run's notes/coverage live on
// the next board forever. The finish transaction now carries a durable cleanup
// obligation (the slot's finclean record, written as the transaction's first
// step); any successful saveAll discharges it; if a reload intervenes first,
// load reconciliation completes the cleanup idempotently (marker present, no
// live run, board in the cleared post-finish state) and clears the marker.
// Failures are injected with the drive136 pattern (setItem throws for chosen
// keys - here notes AND coverage together, the DA-10 storage-fault shape).
// Controls pin the other side: a live run's note is never touched, and a
// marker facing a NON-empty board (not a finished board) fires nothing.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
await sleep(3000);
ok('S0 app boots for the finish-cleanup tests', await poll120(`!!window.maplibregl && !!document.querySelector('#map canvas')`, 45000));
const INSTALL_STUB2 = `(() => { window.__failKeys = new Set(); const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (window.__failKeys.has(k)) throw new Error('injected quota failure'); return orig.call(this, k, v); }; window.__failKey = k => { window.__failKeys.add(k); }; window.__unfailAll = () => { window.__failKeys.clear(); }; return true; })()`;
ok('S0b two-key fault-injection stub installed', await ev(INSTALL_STUB2) === true);
const stored = async () => JSON.parse(await ev(`JSON.stringify({ notes: localStorage.getItem('snowroute.5w.v4.notes'), cov: localStorage.getItem('snowroute.5w.v4.cov'), hist: JSON.parse(localStorage.getItem('snowroute.5w.v2.history') || '[]').length, marker: (typeof LS !== 'undefined' && LS.finclean) ? localStorage.getItem(LS.finclean) : null })`));
// Seed a live run: three streets done (archiving threshold), a hazard note on
// Velmar, coverage on Velmar - all persisted healthy BEFORE the fault.
await ev(`(() => { markDone('Velmar', 'test'); markDone('Mellings', 'test'); markDone('Astona', 'test'); notes.Velmar = [{ k: 'hazard', at: '2026-11-07T00:00:00.000Z' }]; coveredIdx.Velmar = [0, 1]; startClean(); return doneSet.size; })()`);
await sleep(300);
let st = await stored();
ok('S1 seeded run stored: note + coverage + start persisted | ' + JSON.stringify(st), !!st.notes && st.notes.includes('hazard') && !!st.cov && st.cov.includes('Velmar') && st.hist === 0 && st.marker === null);
// The DA-10 window: finish COMMITS (its gated writes are healthy), then the
// metadata cleanup writes fail - notes and coverage both refuse.
await ev(`__failKey('snowroute.5w.v4.notes'); __failKey('snowroute.5w.v4.cov'); true`);
await ev(`(() => { performReset(); return true; })()`); await sleep(300);
st = await stored();
const toastA = await ev(`$('toast').textContent`);
ok('A1 finish committed and warned honestly: archive landed, cleanup gap named | ' + toastA + ' ' + JSON.stringify(st), st.hist === 1 && /could not be written \(notes\)/.test(toastA));
ok('A2 the failed cleanup is exactly the DA-10 state: old note + coverage still stored, obligation armed | ' + JSON.stringify(st), !!st.notes && st.notes.includes('hazard') && !!st.cov && st.cov.includes('Velmar') && st.marker !== null);
// Storage heals, and the route state is loaded again - loadRouteState is the
// exact entry a cold boot runs. (A polite Page.navigate would MASK the defect
// here: the old page's pagehide flush retries the failed save on its way out
// once storage heals, which is why DA-10's real shape is a kill/crash or a
// fault that outlives the page - the in-memory retry flag dies either way,
// and only the durable obligation can complete the cleanup at load.)
await ev(`__unfailAll()`);
await ev(`loadRouteState('5w'); true`); await sleep(300);
st = await stored();
const mem = JSON.parse(await ev(`JSON.stringify({ notes: Object.keys(notes).length, cov: Object.keys(coveredIdx).length, done: doneSet.size, run: runStart, hist: history.length })`));
ok('A3 at load the finished run\'s note + coverage are GONE (stored and in memory), archive kept, obligation discharged | ' + JSON.stringify(st) + ' ' + JSON.stringify(mem),
  !!st.notes && !st.notes.includes('hazard') && !!st.cov && !st.cov.includes('Velmar') && st.hist === 1 && st.marker === null && mem.notes === 0 && mem.cov === 0 && mem.done === 0 && mem.run === 0 && mem.hist === 1);
// And the completed cleanup is durable across a real reload.
await send('Page.navigate', { url: url }, S);
await sleep(3000);
await ev(`loadRoute('5w'); true`); await sleep(600);
st = await stored();
ok('A4 after a real reload the cleaned state persists - nothing resurrects | ' + JSON.stringify(st), !!st.notes && !st.notes.includes('hazard') && !!st.cov && !st.cov.includes('Velmar') && st.hist === 1 && st.marker === null);
// Control 1: a LIVE run's note (no finish, no obligation) is never touched by
// a reload - the cleanup fires only on the finish obligation.
await ev(`(() => { markDone('Velmar', 'test'); notes.Velmar = [{ k: 'hazard', at: '2026-11-07T01:00:00.000Z' }]; saveAll(); return true; })()`); await sleep(300);
st = await stored();
ok('C1a live run seeded, no obligation exists | ' + JSON.stringify(st), st.marker === null && !!st.notes && st.notes.includes('hazard'));
await send('Page.navigate', { url: url }, S);
await sleep(3000);
await ev(`loadRoute('5w'); true`); await sleep(600);
st = await stored();
ok('C1b after reload the live run\'s note survives whole | ' + JSON.stringify(st), !!st.notes && st.notes.includes('hazard') && (await ev(`doneSet.has('Velmar')`)) === true);
// Control 2: even with an obligation record present, a NON-empty board is not
// a finished board - the guard must leave the live data (and the marker)
// exactly as found.
await ev(`(() => { if (LS.finclean) localStorage.setItem(LS.finclean, JSON.stringify({ run: 0, at: Date.now() })); return true; })()`);
await send('Page.navigate', { url: url }, S);
await sleep(3000);
await ev(`loadRoute('5w'); true`); await sleep(600);
st = await stored();
ok('C2 marker + non-empty board: cleanup does NOT fire - note and marker both untouched | ' + JSON.stringify(st), !!st.notes && st.notes.includes('hazard') && st.marker !== null);
await ev(`(() => { if (LS.finclean) localStorage.removeItem(LS.finclean); return true; })()`);
// Verify-cycle-1 findings at the finish level: the archive write LANDS but
// its read-back lies once, and the rollback's undo delete then has its
// verification read THROW. A thrown read is not proof of absence, and an
// unverifiable rollback is not a clean one: Finish must warn that the
// rollback could not be verified, never the archive branch's "run intact"
// text - which used to be checked before the degraded outcome. The history
// key's reads are counted
// page-side: finishRun prepares from in-memory history, so read 1 is the
// archive write's own verification (the lie), and read 2+ throw (the undo
// delete's verification).
await ev(`(() => { markDone('Velmar', 'test'); markDone('Mellings', 'test'); markDone('Astona', 'test'); notes.Velmar = [{ k: 'hazard', at: '2026-11-07T02:00:00.000Z' }]; coveredIdx.Velmar = [0, 1]; startClean(); return doneSet.size; })()`); await sleep(300);
const INSTALL_GET_STUB = `(() => { window.__histReads = 0; const orig = Storage.prototype.getItem; window.__origGetItem = orig; Storage.prototype.getItem = function (k) { if (k === 'snowroute.5w.v2.history') { window.__histReads++; if (window.__histReads === 1) return '[]'; if (window.__histReads >= 2) throw new Error('injected read failure'); } return orig.call(this, k); }; return true; })()`;
ok('G0 history-read fault stub installed', await ev(INSTALL_GET_STUB) === true);
await ev(`(() => { finishRun(); return true; })()`);
const toastG = await ev(`$('toast').textContent`);
await ev(`(() => { if (window.__origGetItem) Storage.prototype.getItem = window.__origGetItem; return true; })()`);
st = await stored();
ok('G1 unverifiable archive rollback warns the rollback could not be verified, not "run intact" | got: ' + toastG, /rollback could not be verified/.test(toastG) && !/run intact/.test(toastG));
ok('G2 the archive entry itself was put back (the delete landed; only its verification failed) | ' + JSON.stringify(st), st.hist === 1);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);
