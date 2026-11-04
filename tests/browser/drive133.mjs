import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive133: Beta 1.49 recording boundary (Andrew's rule, 2026-10-31).
// The Locate tab alone NEVER records route data: a view-only watch writes no
// trail and no coverage, while still showing the live dot. Recording belongs
// to a clean (Start Clean) and to its own GPS; pressing Locate during an
// open clean resumes that clean's recording; after the clean ends, Locate
// is view-only again.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
await sleep(3000);
ok('G0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`));
// (No clear+reload slate-wipe: the harness gives every drive a fresh browser
// profile, so storage starts empty - and a reload would stall the local
// rig's second boot without adding any isolation.)

await ev(`(() => { window.__wpOk = null; navigator.geolocation.watchPosition = (ok2) => { window.__wpOk = ok2; return 4242; }; navigator.geolocation.clearWatch = () => {}; return true; })()`);
const feed = async (lat, lng) => ev('window.__wpOk({ coords: { latitude: ' + lat + ', longitude: ' + lng + ', accuracy: 10, speed: 0, heading: null }, timestamp: Date.now() })'); // string concatenation, not a nested template substitution (drive126's pattern): the nested form inserts the literal text ${lat} into the page, where it is a syntax error and every feed silently dies
const march = async () => { for (const p of PTS) { await feed(p[0], p[1]); await sleep(130); } await sleep(500); };
const PTS = JSON.parse(await ev(`(() => { const L = STRETCH.Velmar.line; return JSON.stringify([12, 15, 18, 21, 24, 27].map(i => L[i])); })()`));
const state = async () => JSON.parse(await ev(`(() => JSON.stringify({ wid: watchId, run: gpsFromRun, clean: !!runStart, trail: trail.length, cov: Object.values(coveredIdx).reduce((a, s) => a + s.length, 0), kinds: ((map.getSource('gps') || {})._data || { features: [] }).features.map(f => f.properties.k) }))()`));

// Phase V: Locate only - live dot, zero recording.
await ev(`startGps(false)`);
await march();
let ST = await state();
ok('V1 view-only watch records no trail and no coverage | ' + JSON.stringify(ST), ST.wid === 4242 && ST.run === false && ST.clean === false && ST.trail === 0 && ST.cov === 0);
ok('V2 the live dot still shows in view-only mode | kinds ' + JSON.stringify(ST.kinds), ST.kinds.includes('dot'));

// Phase R: Start Clean on the already-running watch - recording begins.
await ev(`startClean()`);
await march();
ST = await state();
const trailAfterClean = ST.trail;
ok('R1 a clean records trail and coverage on the same watch | ' + JSON.stringify(ST), ST.run === true && ST.clean === true && ST.trail >= 6 && ST.cov > 0);
const drawn = JSON.parse(await ev(`(() => { const d = (map.getSource('trail') || {})._data || { features: [] }; return JSON.stringify(d.features.length); })()`));
ok('R2 the recorded trail is drawn | features ' + drawn, drawn >= 1);
const recOn = await ev(`$('gpsBtn').classList.contains('rec')`);
ok('R3 the Locate tab wears its recording face (red) when a clean starts on an already-running view-only watch (Beta 1.64, audit F06) | rec ' + recOn, recOn === true);

// Phase S: clean cancelled - Locate is view-only again, nothing more records.
await ev(`cancelStart()`);
await sleep(700);
await ev(`$('gpsBtn').click()`);
await sleep(300);
await march();
ST = await state();
ok('S1 after cancel, Locate is view-only, the cancelled run trail is erased (Beta 1.91, Andrew) and does not grow | ' + JSON.stringify(ST) + ' was ' + trailAfterClean, ST.run === false && ST.clean === false && ST.trail === 0);

// Phase M: Locate pressed during an open clean resumes that clean's GPS.
await ev(`startClean()`);
await ev(`stopGps()`);
await sleep(700);
await ev(`$('gpsBtn').click()`);
await sleep(300);
ST = await state();
ok('M1 Locate during an open clean resumes run GPS | ' + JSON.stringify(ST), ST.clean === true && ST.wid === 4242 && ST.clean === true);
await ev(`stopGps()`);

// S9 (Beta 1.93, follow-up audit R01): cancel on a RESUMED run (no snapshot -
// the app reloaded mid-run) reverts only the run's own marks; pre-Start
// progress survives.
await ev(`markDone('Velmar', 'test')`);
await ev(`(function(){ pieceTimes.Velmar = { 0: ['2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z'] }; saveAll(); return true; })()`); // Velmar's marks are stamped long before any run
await ev(`startClean()`);
await ev(`(function(){ runSnap = null; return true; })()`); // exactly the post-reload state: runStart persisted, snapshot gone
await ev(`markDone('Astona', 'test')`);
await ev(`cancelStart()`);
await sleep(300);
ok('S9 resumed-run cancel reverts the run marks (Astona) and KEEPS pre-Start progress (Velmar)', await ev(`(function(){ try { return doneSet.has('Velmar') && pieces.Astona.every(v => v === 0) && runStart === 0; } catch (e) { return false; } })()`));

// S10 (Beta 1.93, follow-up audit R07): if the trail cleanup cannot be saved,
// the cancel message must say so instead of claiming full erasure.
await ev(`startClean()`); await sleep(200);
await ev(`(function(){ var orig = lsSet; window.__lsOrig133 = orig; lsSet = function(k, v){ if (k === LS.trail) return false; return orig(k, v); }; return true; })()`);
await ev(`cancelStart()`);
await sleep(200);
const S10 = JSON.parse(await ev(`(() => JSON.stringify({ toast: $('toast').textContent, dirty: trailDirty }))()`));
ok('S10 a failed trail save qualifies the cancel message (no false erasure claim) | ' + JSON.stringify(S10), /could not be saved yet/.test(S10.toast) && S10.dirty === true);
await ev(`(function(){ if (window.__lsOrig133) lsSet = window.__lsOrig133; flushAux(true); return true; })()`);

// S11 (Beta 1.94, deep audit SR-193-02): Start PERSISTS its pre-Start
// snapshot (LS.snap, stamped with the run). A resumed run's cancel restores
// from it - including a pre-Start side that was UNMARKED mid-run, the case
// the 1.93 stamp journal cannot see (unmarking erases the stamp).
await ev(`markDone('Velmar', 'test')`);
await ev(`(function(){ pieceTimes.Velmar = { 0: ['2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z'] }; saveAll(); return true; })()`); // Velmar's completion predates the run
await ev(`startClean()`);
const S11a = JSON.parse(await ev(`(() => { const s = JSON.parse(localStorage.getItem(LS.snap) || 'null'); return JSON.stringify({ at: s && s.at, run: runStart, velmar: !!(s && s.pieces && s.pieces.Velmar && s.pieces.Velmar.every(v => v === 3)) }); })()`));
ok('S11a Start persists the pre-Start snapshot, stamped with the run (Beta 1.94, SR-193-02) | ' + JSON.stringify(S11a), S11a.at === S11a.run && S11a.run > 0 && S11a.velmar === true);
await ev(`(function(){ runSnap = null; return true; })()`); // exactly the post-reload state: in-memory snapshot gone, the persisted one remains
await ev(`markUndone('Velmar')`); // the journal-blind act: a pre-Start completion removed mid-run
await ev(`markDone('Astona', 'test')`);
await ev(`cancelStart()`);
await sleep(300);
ok('S11b resumed cancel restores the pre-Start board from the persisted snapshot - the unmarked Velmar returns, the run mark (Astona) goes, the snapshot is consumed', await ev(`(function(){ try { return doneSet.has('Velmar') && pieces.Astona.every(v => v === 0) && runStart === 0 && localStorage.getItem(LS.snap) === null; } catch (e) { return false; } })()`));


// S12 (Beta 1.95, deep audit SR-194-03): a DAMAGED persisted snapshot must
// never be applied raw. The 1.94 branch checked only the stamp and the
// object-ness of two fields, then assigned the stored structures straight
// into live state - the audit's injected {Velmar:[99]} became the board
// AND was saved onward, destroying a valid mark. Each variant below must
// fall back to the stamp journal (which protects the pre-Start marks here)
// with the board and the stored record left sane.
const corruptCycle = async (mutate) => {
  await ev(`markDone('Velmar', 'test')`);
  await ev(`(function(){ pieceTimes.Velmar = { 0: ['2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z'] }; saveAll(); return true; })()`);
  await ev(`startClean()`);
  await ev(`(function(){ const s = JSON.parse(localStorage.getItem(LS.snap)); (${mutate})(s); localStorage.setItem(LS.snap, JSON.stringify(s)); runSnap = null; return true; })()`);
  await ev(`markDone('Astona', 'test')`);
  await ev(`cancelStart()`);
  await sleep(300);
  return JSON.parse(await ev(`(() => { const stored = JSON.parse(localStorage.getItem(LS.sides) || '{"p":{}}'); return JSON.stringify({ velmarDone: doneSet.has('Velmar'), astona: pieces.Astona ? pieces.Astona.every(v => v === 0) : 'missing', velmarVal: pieces.Velmar ? pieces.Velmar[0] : 'missing', stored99: JSON.stringify(stored).includes('99'), covBad: (coveredIdx.Velmar || []).some(i => typeof i !== 'number' || i < 0 || i > 5000), stray: doneSet.has('Nowhere Road'), toast: $('toast').textContent }); })()`));
};
const S12a = await corruptCycle(`s => { s.pieces = { Velmar: [99] }; }`);
ok('S12a a snapshot with an out-of-range value and missing streets is rejected whole - journal fallback, no corruption saved (Beta 1.95, SR-194-03) | ' + JSON.stringify(S12a), S12a.velmarDone === true && S12a.astona === true && S12a.velmarVal === 3 && S12a.stored99 === false && /damaged/.test(S12a.toast));
const S12b = await corruptCycle(`s => { s.pieces.Velmar = [3]; s.pieceTimes.Velmar = { 0: 'garbage' }; }`);
ok('S12b a snapshot with a wrong-length street and garbage times is rejected whole | ' + JSON.stringify(S12b), S12b.velmarDone === true && S12b.astona === true && S12b.velmarVal === 3 && S12b.stored99 === false);
const S12c = await corruptCycle(`s => { s.cov = { Velmar: [99999] }; s.done = ['Velmar', 'Nowhere Road']; }`);
ok('S12c a snapshot with out-of-range coverage and an unknown street is rejected whole | ' + JSON.stringify(S12c), S12c.velmarDone === true && S12c.astona === true && S12c.covBad === false && S12c.stray === false);

// S12d (Beta 1.96, deep audit SR-195-04): snapshot validation applies the
// LOADER'S OWN rule to timestamp VALUES - app1's loader deletes a completion
// time that does not Date.parse, so a snapshot carrying one is not a snapshot
// the loader would honour. 1.95 checked only that the values were strings,
// so 'not-a-date' sailed through both the times map and a piece stamp.
await ev(`markDone('Velmar', 'test')`);
await ev(`startClean()`);
const S12d = JSON.parse(await ev(`(() => { const base = JSON.parse(localStorage.getItem(LS.snap)); const good = JSON.parse(JSON.stringify(base)); const badT = JSON.parse(JSON.stringify(base)); badT.times = { Velmar: 'not-a-date' }; const badS = JSON.parse(JSON.stringify(base)); badS.pieceTimes.Velmar = [['not-a-date', null]]; return JSON.stringify({ good: !!validateSnap(good, good.at), badTimes: validateSnap(badT, badT.at) === null, badStamp: validateSnap(badS, badS.at) === null }); })()`));
await ev(`cancelStart()`); await sleep(300); // leave no run open behind this check
ok('S12d a snapshot whose completion time or piece stamp is not a real date is rejected whole (Beta 1.96, SR-195-04) | ' + JSON.stringify(S12d), S12d.good === true && S12d.badTimes === true && S12d.badStamp === true);

// S14 (Beta 1.96, deep audit SR-195-01): the combined failure - the saved
// snapshot is DAMAGED and the trail cleanup cannot be saved. 1.95's message
// chain evaluated the damage branch first, so the erasure message masked the
// unsaved-cleanup warning entirely. The storage warning must survive, with
// the rebuild explanation attached - and once storage recovers, the pending
// cleanup must land on retry.
await ev(`markDone('Astona', 'test')`);
await ev(`startClean()`);
await ev(`togglePiece('Velmar', 0, 0)`);
await ev(`(function(){ const s2 = JSON.parse(localStorage.getItem(LS.snap)); s2.pieces = { Velmar: [99] }; localStorage.setItem(LS.snap, JSON.stringify(s2)); return true; })()`);
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
await ev(`(function(){ window.__toasts133 = []; const t = $('toast'); new MutationObserver(() => { const x = t.textContent; if (x && window.__toasts133[window.__toasts133.length - 1] !== x) window.__toasts133.push(x); }).observe(t, { childList: true, characterData: true, subtree: true }); return true; })()`);
await ev(`loadRoute('5w'); true`); await sleep(700);
await ev(`(function(){ window.__lsSetOrig = lsSet; lsSet = (k, v) => (k === LS.trail || k === LS.sess) ? false : window.__lsSetOrig(k, v); return true; })()`);
await ev(`cancelStart()`); await sleep(300);
const S14a = JSON.parse(await ev(`JSON.stringify(window.__toasts133 || [])`));
ok('S14a damaged snapshot + unsaved trail cleanup: the message carries the cleanup warning AND the rebuild explanation - the erasure claim never stands alone (Beta 1.96, SR-195-01) | ' + JSON.stringify(S14a), S14a.some(t => /trail cleanup could not be saved/.test(t) && /rebuilt from the marks/.test(t)));
await ev(`(function(){ lsSet = window.__lsSetOrig; flushAux(true); return true; })()`); await sleep(200);
ok('S14b when storage recovers the pending trail cleanup lands on retry (Beta 1.96, SR-195-01)', (await ev(`trailDirty === false && sessDirty === false`)) === true);

// S13 (Beta 1.95, deep audit SR-194-04): a run resumed WITHOUT a usable
// cancel snapshot must say so at load - its Cancel guarantee is reduced to
// the stamp journal, and 1.94 resumed it in silence. Start itself still
// never blocks (the settled 1.63 stance); the honesty moves to resume.
await ev(`markDone('Velmar', 'test')`);
await ev(`startClean()`);
await ev(`(function(){ localStorage.removeItem(LS.snap); return true; })()`); // the snapshot never landed / was lost - the run itself is legitimately open
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
await ev(`(function(){ window.__toasts133 = []; const t = $('toast'); new MutationObserver(() => { const x = t.textContent; if (x && window.__toasts133[window.__toasts133.length - 1] !== x) window.__toasts133.push(x); }).observe(t, { childList: true, characterData: true, subtree: true }); return true; })()`);
await ev(`loadRoute('5w'); true`); await sleep(700);
const S13a = JSON.parse(await ev(`JSON.stringify(window.__toasts133 || [])`));
ok('S13a a resumed run with no snapshot warns that Cancel is reduced (Beta 1.95, SR-194-04) | ' + JSON.stringify(S13a), S13a.some(t => /no usable cancel snapshot/.test(t)));
await ev(`cancelStart()`); await sleep(300);
await ev(`startClean()`); await sleep(300); // a fresh Start writes a fresh, valid snapshot
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
await ev(`(function(){ window.__toasts133 = []; const t = $('toast'); new MutationObserver(() => { const x = t.textContent; if (x && window.__toasts133[window.__toasts133.length - 1] !== x) window.__toasts133.push(x); }).observe(t, { childList: true, characterData: true, subtree: true }); return true; })()`);
await ev(`loadRoute('5w'); true`); await sleep(700);
const S13b = JSON.parse(await ev(`JSON.stringify(window.__toasts133 || [])`));
ok('S13b a resumed run WITH its snapshot stays silent | ' + JSON.stringify(S13b), !S13b.some(t => /no usable cancel snapshot/.test(t)));
await ev(`cancelStart()`); await sleep(300);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

