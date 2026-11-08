import { launchDrive, bootThrough } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs'; // premise derivation (Tranche 4 / T2, 2026-11-08): expectations about the shipped world derive from source - see pack-expect.mjs
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route


// drive89: v5.54 Finish pop-up + delete/back navigation
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const exc = () => consoleLog.filter(c => c.type === 'EXCEPTION').length;

// drive114: D-01 migration regression (2026-10-28 audit) - partially completed
// OLDER records under the current app. Fixture = a v5.77-era device: Velmar
// completed the street-level way (doneSet + doneTimes, NO sides record),
// Woolacott partially done in the v5.77 BARE sides format {street: [bits]}
// with no per-side timestamps anywhere, plus one v5.77-era history entry
// (no sides snapshot). Asserts the audit's list: completion preserved,
// unfinished stays unfinished, progress exact, missing timestamps never
// fabricate history (a complete street inherits ONLY its recorded
// completion instant; a partial street gets no times at all), pace inputs
// stay honest, save/reload is stable, and a backup -> wipe -> restore
// round-trip reproduces the migrated state exactly.
const VTIME = '2026-10-20T11:00:00.000Z';
const waitBoot = async () => { for (let i = 0; i < 25; i++) { try { if (await ev(`!!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const reload = async () => { await ev(`location.reload(); true`); await sleep(500); await waitBoot(); await sleep(3200); await ev(`loadRoute('5w'); true`); await sleep(600); }; // Beta 1.76: a reload lands on the route menu - load 5W before reading state (also exercises the legacy->slot migration)
const setLS = async (k, v) => ev(`localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)}); true`);
const noValidTimes = async (n) => ev(`(function(){ const T = pieceTimes[${JSON.stringify(n)}]; if (!T) return true; const flat = []; T.forEach(pr => { if (Array.isArray(pr)) pr.forEach(x => flat.push(x)); }); return flat.every(x => typeof x !== 'string' || isNaN(Date.parse(x))); })()`);

try {
  await ev(`localStorage.clear(); true`);
  await setLS('snowroute.v2', '["Velmar"]');
  await setLS('snowroute.v2.times', JSON.stringify({ Velmar: VTIME }));
  await setLS('snowroute.v5.sides', JSON.stringify({ Woolacott: [3, 1, 0] }));   // BARE v5.77 format: no {p,t} wrapper, no times
  await setLS('snowroute.v2.history', JSON.stringify([{ at: '2026-10-20T12:30:00.000Z', items: { Velmar: VTIME }, via: 'tap', notes: {}, km: 1.7, startedAt: '2026-10-20T10:45:00.000Z' }]));
  await reload();

  ok('M1 partial pieces preserved exactly', await ev(`JSON.stringify(pieces.Woolacott) === '[3,1,0]'`));
  ok('M2 street-level completion migrated to all pieces done', await ev(`pieces.Velmar.length === ${PACK5W.partsByStreet.Velmar} && pieces.Velmar.every(v => v === 3)`));
  ok('M2b complete street inherits only its recorded completion instant', await ev(`pieceTimes.Velmar.every(pr => pr[0] === '${VTIME}' && pr[1] === '${VTIME}')`));
  ok('M3 unfinished street stays unfinished (count 1 of 34)', await ev(`!doneSet.has('Woolacott') && doneSet.has('Velmar') && document.getElementById('count').textContent.replace(/\\s+/g, ' ').includes('1 of ${PACK5W.names}')`));
  ok('M4 partial street has NO fabricated side times', await noValidTimes('Woolacott'));
  // Tranche-1 premise repair (2026-11-07): STRETCH records no longer carry a .lens array - computeStretches now stores .parts and the app measures each part with segLenM (the same function workDoneM uses). M5's expectation is re-derived from .parts via segLenM; the asserted meaning (the work meter equals the seed-derived side-metres exactly) is unchanged. This read had been silently unreachable: the drive stopped here on a TypeError, which its try/catch recorded as fatal while the runner still read the surviving checks as PASS.
  ok('M5 work meter equals seed-derived side-metres exactly', await ev(`(function(){ const lens = n => STRETCH[n].parts.map(p => segLenM(p)); const L = lens('Woolacott'); const exp = lens('Velmar').reduce((a, b) => a + 2 * b, 0) + 2 * L[0] + L[1]; return Math.abs(workDoneM() - exp) < 0.01; })()`));
  ok('M6 pace input stamps are exactly the inherited instants, nothing invented', await ev(`(function(){ try { const all = []; for (const n of STREETNAMES) { const T = pieceTimes[n]; if (Array.isArray(T)) T.forEach(pr => { if (Array.isArray(pr)) pr.forEach(x => { if (typeof x === 'string' && !isNaN(Date.parse(x))) all.push(Date.parse(x)); }); }); } return all.length === ${2 * PACK5W.partsByStreet.Velmar} && all.every(ms => ms === Date.parse('${VTIME}')); } catch (e) { return false; } })()`)); // Beta 1.91 fix: the old M6 called workEvents() - a production-only helper that does not exist in the beta; the thrown ReferenceError came back from the harness as a truthy {error} object, so the check passed vacuously. Now reads pieceTimes directly, in a try/catch that returns a real boolean.
  ok('M6b paceInfo runs safely on migrated data', await ev(`(function(){ try { const P = paceInfo(); return !!P && typeof P === 'object'; } catch (e) { return false; } })()`));
  // M6c's expectation reads liveWorkM, not the whole board: the live rate is scoped to run-stamped work (Beta 1.93, audit R06). This note lives OUTSIDE the ev template on purpose - through 1.144 it sat inside the single-line template, where its // commented out the rest of the page expression: the cooked string was a SyntaxError, the evaluation threw, and this drive silently stopped at M6b (8 of its 23 checks) while still reporting PASS. Found by the improvement scan's Codex verify (2026-11-07); the static gate selftest-ev-syntax.mjs now parse-checks every static page expression so the shape cannot recur.
  ok('M6c pace is a metre work rate (side-metres / elapsed), live once work lands', await ev(`(function(){ try { const keep = runStart; runStart = Date.now() - 3600000; markDone('Tina', 'test'); const P = paceInfo(); const w = liveWorkM(); const expect = w / ((Date.now() - runStart) / 3600000); const good = !!P.rateMh && Math.abs(P.rateMh - expect) / expect < 0.05 && P.live === true && /ETA/.test(P.etaTxt); markUndone('Tina'); runStart = keep; return good; } catch (e) { return false; } })()`));
  ok('M6d stats line carries the metre rate, never streets/hr', await ev(`(function(){ try { return !/streets\\/hr/.test(statsLine()); } catch (e) { return false; } })()`));
  ok('M12a marks made BEFORE Start do not count as run work (Beta 1.93, audit R06)', await ev(`(function(){ try { const keep = runStart; markDone('Tina', 'test'); runStart = Date.now(); const P = paceInfo(); const good = liveWorkM() === 0 && P.live === false; markUndone('Tina'); runStart = keep; return good; } catch (e) { return false; } })()`));
  ok('M12b work marked DURING the run counts at its full side length', await ev(`(function(){ try { const keep = runStart; runStart = Date.now() - 60000; markDone('Tina', 'test'); const w = liveWorkM(); const expect = STRETCH.Tina.total * 2; const good = w > 0 && Math.abs(w - expect) < 1; markUndone('Tina'); runStart = keep; return good; } catch (e) { return false; } })()`));
  ok('M7 legacy history entry (no sides snap) loads', await ev(`history.length === 1`));

  // New work on the migrated record: one more side, marked the app's own way.
  await ev(`togglePiece('Woolacott', 2, 0); true`); await sleep(700);
  ok('M8 new side marked on migrated record', await ev(`JSON.stringify(pieces.Woolacott) === '[3,1,1]'`));
  const stamp = await ev(`pieceTimes.Woolacott[2][0]`);
  ok('M8b new side got a real timestamp', typeof stamp === 'string' && !isNaN(Date.parse(stamp)));
  // Tranche-1 premise repair (2026-11-07): pieceTimes for a street with no recorded times is a SPARSE array (the sanitizer returns [] and a later mark lands at its own index, leaving holes) - the app's own readers defend with T[i] || [null, null]. M8c/M10c spread T[0]/T[1] directly and threw on the holes; they now flatten through the same defensive read. Meaning unchanged: no old side carries a fabricated time.
  ok('M8c old sides still carry no times', await ev(`(function(){ const T = pieceTimes.Woolacott; const flat = []; [0, 1].forEach(i => { const pr = T[i] || [null, null]; flat.push(pr[0], pr[1]); }); const t2 = T[2] || [null, null]; return flat.every(x => typeof x !== 'string' || isNaN(Date.parse(x))) && !t2[1]; })()`));

  await reload();
  ok('M9 save/reload keeps migrated state stable', await ev(`JSON.stringify(pieces.Woolacott) === '[3,1,1]' && doneSet.has('Velmar') && !doneSet.has('Woolacott')`));
  ok('M9b the one real timestamp survives reload unchanged', await ev(`pieceTimes.Woolacott[2][0] === ${JSON.stringify(stamp)}`));

  // Backup -> wipe -> restore round-trip of the migrated state.
  const bak = await ev(`buildBackup()`);
  await ev(`localStorage.clear(); true`); await reload();
  await ev(`(function(){ document.getElementById('xText').value = ${JSON.stringify(bak)}; doRestore(); return true; })()`);
  await sleep(600); await waitBoot(); await sleep(3200); await ev(`loadRoute('5w'); true`); await sleep(600);
  ok('M10 round-trip: pieces identical', await ev(`JSON.stringify(pieces.Woolacott) === '[3,1,1]' && pieces.Velmar.every(v => v === 3)`));
  ok('M10b round-trip: completion + times intact', await ev(`doneSet.has('Velmar') && !doneSet.has('Woolacott') && doneTimes.Velmar === '${VTIME}' && pieceTimes.Woolacott[2][0] === ${JSON.stringify(stamp)}`));
  ok('M10c round-trip: still no fabricated times for old sides', await ev(`(function(){ const T = pieceTimes.Woolacott; const flat = []; [0, 1].forEach(i => { const pr = T[i] || [null, null]; flat.push(pr[0], pr[1]); }); return flat.every(x => typeof x !== 'string' || isNaN(Date.parse(x))); })()`));
  ok('M11 streets list order: Mains view is the 6 mains alphabetical, Secondaries view the 28 others alphabetical (Beta 1.109 two-group filter)', await ev(`(function(){ try { listFilter = 'mains'; renderStreets(); const gm = [...document.querySelectorAll('#streetList .srow .nm')].map(e => e.textContent); listFilter = 'secondaries'; renderStreets(); const gs = [...document.querySelectorAll('#streetList .srow .nm')].map(e => e.textContent); listFilter = 'mains'; renderStreets(); const wm = [...MAIN].sort((a, b) => a.localeCompare(b)); const ws = STREETNAMES.filter(n => !MAIN.has(n)).sort((a, b) => a.localeCompare(b)); return gm.length === ${PACK5W.mains} && gs.length === ${PACK5W.names - PACK5W.mains} && JSON.stringify(gm) === JSON.stringify(wm) && JSON.stringify(gs) === JSON.stringify(ws); } catch (e) { return false; } })()`));
  ok('M7a cancel start erases ONLY the run record - the board returns to its Start-moment state', await ev(`(function(){ try { const wBefore = workDoneM(); startClean(); const sSec = Math.floor(runStart / 1000); markDone('Tina', 'tap'); trail.push([43.82, -79.56, sSec + 60]); const had = runStart > 0 && doneSet.has('Tina') && trailSessions.includes(sSec); cancelStart(); return had && runStart === 0 && !doneSet.has('Tina') && doneSet.has('Velmar') && workDoneM() === wBefore && !trailSessions.includes(sSec) && !trail.some(p => (p[2] || 0) >= sSec); } catch (e) { return false; } })()`));
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
console.log(JSON.stringify(R, null, 1));
// Explicit exit: open CDP/Chrome handles otherwise keep the process alive
// after results print (drive113 lesson, 2026-10-28).
process.exit(0);
