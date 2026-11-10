import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive186: Beta 1.167 (run/pace fix round) - B1 unlimited retention and the
// B2 pace correctness pack, end-to-end in a real page.
//   A: 10 seeded cleans + two real finishes = 12 retained, zero evictions,
//      in memory, in storage, and across a reload.
//   B: the 12 ride a backup -> total wipe -> restore, stamp-for-stamp.
//   C: an interrupted finish AT THE OLD CAPACITY (the RP-01 signature:
//      archive write landed, board not cleared, finclean marker pending)
//      loses NOTHING: reconcile rolls the phantom entry back, all 10
//      originals stand, and the re-finish lands as the 11th clean. Under
//      1.166 the archive write itself would already have evicted the
//      oldest original before the interruption ever happened.
//   D: B2 - a finish with one street banked BEFORE Start and two marked
//      in-run archives workM counting ONLY the in-run work (RP-05), plus
//      totalWorkM and geoFP; cleanWorkM reads the stored figure verbatim
//      even after the route geometry is perturbed in memory (RP-06); a
//      legacy copy (workM stripped) falls back to the live derivation,
//      pre-Start work and all - the exposure the bake closes; and a
//      partially-recorded sides map cannot undercount a stored entry
//      (RP-09).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const waitBoot = async () => { for (let i = 0; i < 40; i++) { try { if (await ev(`typeof restoreBackup === 'function' && !!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const toMenu = async () => { await ev(`localStorage.clear(); location.reload(); true`); await waitBoot(); await sleep(2200); };
const SEED0 = new Date(1700000000000).toISOString();
const seed10 = async () => { await ev(`(() => { const rk = routeKeys('5w'); const hist = []; for (let i = 0; i < 10; i++) { const at = new Date(1700000000000 + i * 86400000).toISOString(); hist.push({ at, items: { Velmar: at }, via: {}, notes: {}, sides: { p: {}, t: {} }, km: 0, startedAt: at }); } localStorage.setItem(rk.hist, JSON.stringify(hist)); return true; })()`); };
const finish3 = async () => { await ev(`(() => { const T = Date.now() - 7200000; runStart = T; saveStart(); markDone('Velmar', 'tap', new Date(T + 600000).toISOString()); markDone('Mellings', 'tap', new Date(T + 900000).toISOString()); markDone('Astona', 'tap', new Date(T + 1200000).toISOString()); finishRun(); return true; })()`); await sleep(400); };

try {
  // ---- Phase A: retention through finish + reload ----
  await toMenu(); await seed10();
  await ev(`loadRoute('5w'); true`); await sleep(600);
  const a0 = await J(`({ n: history.length })`);
  ok('A0 the 10 seeded cleans load', a0.n === 10);
  await finish3(); await finish3();
  const a1 = await J(`(() => { const stored = JSON.parse(localStorage.getItem(routeKeys('5w').hist) || '[]'); return { n: history.length, stored: stored.length, first: history.length ? history[0].at : '' }; })()`);
  ok('A1 two finishes past the old cap: 12 retained in memory AND storage, the oldest seed intact (zero evictions) | ' + JSON.stringify(a1),
    a1.n === 12 && a1.stored === 12 && a1.first === SEED0);
  await ev(`location.reload(); true`); await waitBoot(); await sleep(1500);
  await ev(`loadRoute('5w'); true`); await sleep(600);
  const a2 = await J(`({ n: history.length, first: history.length ? history[0].at : '', ats: history.map(h => h.at) })`);
  ok('A2 after a reload the 12 are all still there', a2.n === 12 && a2.first === SEED0);

  // ---- Phase B: retention through backup -> wipe -> restore ----
  const bakStr = await ev(`buildBackup()`);
  ok('B0 a backup builds from the 12-clean state', typeof bakStr === 'string' && bakStr.length > 100);
  await toMenu();
  await ev('(async () => { await restoreBackup(JSON.parse(' + JSON.stringify(bakStr) + ')); return true; })()');
  await sleep(3500); await waitBoot(); await sleep(1200);
  await ev(`loadRoute('5w'); true`); await sleep(600);
  const b1 = await J(`({ n: history.length, ats: history.map(h => h.at) })`);
  ok('B1 the restore reproduces all 12 cleans, stamp-for-stamp, in order | n=' + b1.n,
    b1.n === 12 && JSON.stringify(b1.ats) === JSON.stringify(a2.ats));

  // ---- Phase C: the interrupted finish at the old capacity (RP-01) ----
  await toMenu(); await seed10();
  await ev(`loadRoute('5w'); true`); await sleep(600);
  const cStage = await J(`(() => { const T = Date.now() - 7200000; runStart = T; saveStart(); markDone('Velmar', 'test'); markDone('Mellings', 'test'); markDone('Astona', 'test'); const e = buildSnap(); e.runId = T; localStorage.setItem(LS.hist, JSON.stringify([...history, e])); localStorage.setItem(LS.finclean, JSON.stringify({ run: T, at: Date.now() })); return { T }; })()`);
  await ev(`location.reload(); true`); await waitBoot(); await sleep(1500);
  await ev(`loadRoute('5w'); true`); await sleep(800);
  const c1 = await J(`({ n: history.length, first: history.length ? history[0].at : '', done: doneSet.size, run: runStart })`);
  ok('C1 the interrupted finish at the old capacity loses NOTHING: the phantom entry rolls back, all 10 originals stand (oldest intact), the run resumes with its 3 streets | ' + JSON.stringify(c1),
    c1.n === 10 && c1.first === SEED0 && c1.done === 3 && c1.run === cStage.T);
  await ev(`performReset(); true`); await sleep(500);
  const c2 = await J(`({ n: history.length, first: history.length ? history[0].at : '', done: doneSet.size })`);
  ok('C2 the re-finish lands as the 11th clean - still nothing evicted | ' + JSON.stringify(c2),
    c2.n === 11 && c2.first === SEED0 && c2.done === 0);

  // ---- Phase D: B2 - the finish-baked pace figures ----
  const d = await J(`(() => {
    const T = Date.now();
    runStart = T - 3600000; saveStart();
    markDone('Velmar', 'tap', new Date(T - 7200000).toISOString());
    markDone('Mellings', 'tap', new Date(T - 1800000).toISOString());
    markDone('Astona', 'tap', new Date(T - 1740000).toISOString());
    const expected = Math.round((STRETCH.Mellings.total + STRETCH.Astona.total) * 2);
    const preInclusive = Math.round((STRETCH.Velmar.total + STRETCH.Mellings.total + STRETCH.Astona.total) * 2);
    finishRun();
    const e = history[history.length - 1];
    const legacy = JSON.parse(JSON.stringify(e)); delete legacy.workM;
    const legacyBefore = cleanWorkM(legacy);
    const savedParts = STRETCH.Mellings.parts;
    STRETCH.Mellings.parts = [[[43.8, -79.5], [43.9, -79.5]]];
    const storedAfter = cleanWorkM(e);
    const legacyAfter = cleanWorkM(legacy);
    STRETCH.Mellings.parts = savedParts;
    return { workM: e.workM, expected, preInclusive, totalWorkM: e.totalWorkM, wantTotal: Math.round(totalWorkM()), geoFP: e.geoFP, fpNow: geoFingerprint(), stored: cleanWorkM(e), storedAfter, legacyBefore, legacyAfter };
  })()`);
  ok('D1 the archived workM counts ONLY the in-run work (the pre-Start street is excluded) | ' + JSON.stringify({ workM: d.workM, expected: d.expected, preInclusive: d.preInclusive }),
    Math.abs(d.workM - d.expected) <= 1 && d.workM < d.preInclusive);
  ok('D2 totalWorkM is baked and equals the route total at Finish', d.totalWorkM === d.wantTotal);
  ok('D3 geoFP is baked and matches the live geometry fingerprint', d.geoFP === d.fpNow && /^[0-9a-f]{8}$/.test(d.geoFP || ''));
  ok('D4 cleanWorkM reads the stored figure verbatim - a geometry perturbation cannot re-price the clean (RP-06) | stored=' + d.stored + ' after=' + d.storedAfter,
    d.stored === d.workM && d.storedAfter === d.workM);
  ok('D5 the legacy fallback (workM stripped) still derives the OLD pre-Start-inclusive figure and follows live geometry - the exposure the bake closes | before=' + Math.round(d.legacyBefore || 0) + ' after=' + Math.round(d.legacyAfter || 0),
    Math.abs((d.legacyBefore || 0) - d.preInclusive) <= 1 && Math.abs((d.legacyAfter || 0) - (d.legacyBefore || 0)) > 1000);
  const d6 = await J(`(() => { const iso = new Date().toISOString(); const crafted = { at: iso, items: { Velmar: iso }, via: {}, notes: {}, sides: { p: { Velmar: [1] }, t: { Velmar: [[iso, null]] } }, km: 0, startedAt: iso, workM: 5000 }; const legacy = JSON.parse(JSON.stringify(crafted)); delete legacy.workM; return { stored: cleanWorkM(crafted), legacy: cleanWorkM(legacy), part: segLenM(STRETCH.Velmar.parts[0]) }; })()`);
  ok('D6 a partially-recorded sides map cannot undercount a stored entry (RP-09): the stored 5000 wins; the legacy derivation returns just the one recorded side | ' + JSON.stringify(d6),
    d6.stored === 5000 && Math.abs((d6.legacy || 0) - (d6.part || 0)) <= 1 && (d6.part || 0) < 5000);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
