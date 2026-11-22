import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, send, S, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive221: Beta 1.272 (architecture programme #2 + graft 1) - the history
// repository's page-level contract, deterministic (fixed timestamps, no
// wall-clock assertions): the persistence/reload outcomes of BOTH stores.
//   H1 localStorage, shipped route: a slot planted with a surviving entry,
//      a strip-dropped entry (streets the pack no longer has) and an
//      unparseable entry loads to the one-entry view; the repository's
//      serialise carries all three back; a delete + save persists the
//      deletion and leaves the strip-dropped entries byte-intact.
//   H2 the identified-finish rollback at page level (proof-1250's scenario
//      in a real page): a marked board + a live start + a phantom archive
//      tail with the run's id reconciles at load - the phantom is removed
//      by the verified rollback write, the strip-dropped entry survives
//      THAT write, and the run resumes (its start key stands).
//   H3 IndexedDB created route: a created pack (legacy record drained into
//      the store at boot, drive163's path) with its own planted history
//      slot - the view, the merge and a full page reload all round-trip.
//   H4 the recovery export's hist field is the repository's serialise
//      (the strip-dropped entry rides the file).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const waitBoot = async () => { for (let i = 0; i < 40; i++) { try { if (await ev(`typeof restoreBackup === 'function' && !!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };

const E_KEEP = { at: '2026-01-02T12:00:00.000Z', items: { Velmar: '2026-01-02T12:05:00.000Z' }, workM: 901 };
const E_FOREIGN = { at: '2026-01-01T12:00:00.000Z', items: { 'Ghost Street': '2026-01-01T12:05:00.000Z' }, workM: 902 };
const E_BAD = { at: 'not a date', items: { Velmar: null }, workM: 903 };
const RUN_MS = 1794000000000;
const E_PHANTOM = { at: '2026-01-03T12:00:00.000Z', items: { Velmar: '2026-01-03T12:05:00.000Z' }, workM: 904, runId: RUN_MS };
const C_KEEP = { at: '2026-01-04T12:00:00.000Z', items: { 'Alpha Street': '2026-01-04T12:05:00.000Z' }, workM: 905 };
const C_FOREIGN = { at: '2026-01-05T12:00:00.000Z', items: { 'Ghost Street': '2026-01-05T12:05:00.000Z' }, workM: 906 };
const PACK = { name: 'Route Hist', area: 'Vaughan', primaries: [], roads: { 'Alpha Street': [[[43.8, -79.57], [43.801, -79.571]]] }, reference: {} };

try {
  // ---------- H1: the shipped route's slot ----------
  await ev(`localStorage.clear(); location.reload(); true`); await waitBoot(); await sleep(1500);
  await ev(`(() => { const rk = routeKeys('5w'); localStorage.setItem(rk.hist, ${JSON.stringify(JSON.stringify([E_FOREIGN, E_KEEP, E_BAD]))}); return true; })()`);
  await ev(`loadRoute('5w'); true`); await sleep(600);
  const h1 = await J(`(() => { const stored = JSON.parse(localStorage.getItem(routeKeys('5w').hist));
    return { view: history.map(h => h.workM), ser: JSON.parse(HIST.serialise()).map(h => h && h.workM), stored: stored.map(h => h && h.workM) }; })()`);
  ok('H1 load: the view is exactly the surviving entry | ' + JSON.stringify(h1), JSON.stringify(h1.view) === '[901]');
  ok('H1 serialise: the merge carries all three planted entries back (strip-dropped + unparseable ride verbatim, slot order preserved, the view version winning in place) | ' + JSON.stringify(h1.ser), JSON.stringify(h1.ser) === '[902,901,903]');
  const h1b = await J(`(() => { HIST.deleteAt(0); const saved = HIST.save(); const stored = JSON.parse(localStorage.getItem(routeKeys('5w').hist));
    return { saved, stored: stored.map(h => h && h.workM), foreignIntact: stored.some(h => h && h.workM === 902 && h.items['Ghost Street'] === '2026-01-01T12:05:00.000Z') }; })()`);
  ok('H1 delete + save: the deletion persists and the strip-dropped entries survive the write | ' + JSON.stringify(h1b), h1b.saved === true && JSON.stringify(h1b.stored) === '[902,903]' && h1b.foreignIntact === true);

  // ---------- H2: the interrupted-finish rollback, page level ----------
  await ev(`(() => { markDone('Velmar', 'tap'); saveAll(); return true; })()`); await sleep(300);
  await ev(`(() => { const rk = routeKeys('5w');
    localStorage.setItem(rk.hist, ${JSON.stringify(JSON.stringify([E_FOREIGN, E_PHANTOM]))});
    localStorage.setItem(rk.start, '${RUN_MS}'); return true; })()`);
  await ev(`location.reload(); true`); await waitBoot(); await sleep(1500);
  await ev(`loadRoute('5w'); true`); await sleep(600);
  const h2 = await J(`(() => { const stored = JSON.parse(localStorage.getItem(routeKeys('5w').hist));
    return { stored: stored.map(h => h && h.workM), start: localStorage.getItem(routeKeys('5w').start), view: history.map(h => h.workM), velmarDone: streetComplete('Velmar') }; })()`);
  ok('H2 rollback: the phantom archive entry is removed by the load reconcile | ' + JSON.stringify(h2), JSON.stringify(h2.stored) === '[902]' && JSON.stringify(h2.view) === '[]');
  ok('H2 rollback: the strip-dropped entry survives the rollback write itself, and the run resumes intact (start stands, board still marked) | ' + JSON.stringify(h2), h2.start === String(RUN_MS) && h2.velmarDone === true);

  // ---------- H3: the created route (IndexedDB definition + localStorage slot) ----------
  await ev(`(() => { localStorage.setItem('snowroute.v2.userpacks', JSON.stringify({ 'route-hist': ${JSON.stringify(PACK)} })); return true; })()`);
  await ev(`location.reload(); true`); await waitBoot();
  const drained = await poll(`upGetAll().then(m => !!m && Object.keys(m).includes('route-hist'))`, 20000);
  ok('H3 setup: the created pack drained into the IndexedDB store at boot', drained === true);
  await ev(`(() => { const rk = routeKeys('route-hist'); localStorage.setItem(rk.hist, ${JSON.stringify(JSON.stringify([C_FOREIGN, C_KEEP]))}); return true; })()`);
  await ev(`loadRoute('route-hist'); true`); await sleep(600);
  const h3 = await J(`(() => { HIST.save(); const stored = JSON.parse(localStorage.getItem(routeKeys('route-hist').hist));
    return { view: history.map(h => h.workM), stored: stored.map(h => h && h.workM) }; })()`);
  ok('H3 created route: the view is its surviving entry and a save keeps the strip-dropped entry in its slot | ' + JSON.stringify(h3), JSON.stringify(h3.view) === '[905]' && JSON.stringify(h3.stored) === '[906,905]');
  await ev(`location.reload(); true`); await waitBoot(); await ev(`window.__userPacksReady`); await sleep(800);
  await ev(`loadRoute('route-hist'); true`); await sleep(600);
  const h3b = await J(`(() => { const stored = JSON.parse(localStorage.getItem(routeKeys('route-hist').hist));
    return { view: history.map(h => h.workM), stored: stored.map(h => h && h.workM) }; })()`);
  ok('H3 reload: the created route re-picks from the store and its history round-trips whole | ' + JSON.stringify(h3b), JSON.stringify(h3b.view) === '[905]' && JSON.stringify(h3b.stored) === '[906,905]');

  // ---------- H4: the recovery export carries the merge ----------
  const h4 = await J(`(() => { const o = recoveryObj(); const hist = o ? JSON.parse(o.routes['route-hist'].hist) : null;
    return { hist: hist && hist.map(h => h && h.workM), ser: JSON.parse(HIST.serialise()).map(h => h && h.workM) }; })()`);
  ok('H4 recovery export: its hist field equals the repository serialise (strip-dropped entry rides the file) | ' + JSON.stringify(h4), JSON.stringify(h4.hist) === '[906,905]' && JSON.stringify(h4.hist) === JSON.stringify(h4.ser));
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
