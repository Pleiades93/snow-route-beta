import { sleep, launch, closeBrowser, until, waitBoot, allExceptions, FIX } from './harness-http.mjs';
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const okS = (n, v) => ok(n, v === true);

// ---- Session 1: online boot, worker control, style cached, seed one marked side ----
// ---- the FROZEN FIXTURE ------------------------------------------------------
// A complete dataset in the exact shapes the current writers produce, frozen as a
// literal at Stage 3 (Beta 1.17). If a future format change makes this fixture fail
// to load losslessly, that IS the upgrade alarm: the change needs a migration, per
// docs/STORAGE-SCHEMA.md. Producing version: Beta 1.17 (2026-10-29).
const T1 = '2026-01-05T12:00:00.000Z', T2 = '2026-01-05T12:20:00.000Z', T3 = '2026-01-05T12:25:00.000Z';
const NAMES34 = ['Angie', 'Astona', 'Bayside', 'Bell Harbour', 'Blackburn', 'Bloomingdale', 'Boddy', 'Bourbon', 'Brownlee', 'Cartwright', 'Columbus', 'Conti', 'Dianawood', 'Ferrari', 'Fifth', 'Flatbush', 'Flushing', 'Frankie', 'Galloway', 'Greenpark', 'Julian', 'Kingsnorth', 'Malden', 'Marconi', 'Mellings', 'Radley', 'Romeo', 'Santa Barbara', 'Tina', 'Topper', 'Valeria', 'Velmar', 'Wilshire', 'Woolacott'];
const fullItems = {}; for (const n of NAMES34) fullItems[n] = T2;
const FIXTURE = {
  'snowroute.5w.v2': JSON.stringify(['Astona', 'Velmar']),
  'snowroute.5w.v2.times': JSON.stringify({ Astona: T3, Velmar: T2 }),
  'snowroute.5w.v2.history': JSON.stringify([
    { at: '2026-01-05T12:30:00.000Z', via: 'manual', items: fullItems, notes: {}, sides: { p: { Velmar: Array(14).fill(3) }, t: {} }, km: 17.67, startedAt: 1767650100000 },
    { at: '2026-01-04T11:00:00.000Z', via: 'gps', items: { Velmar: T2 }, notes: { Velmar: [{ k: 'note', at: T1, text: 'Earlier partial' }] }, sides: { p: { Velmar: [3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, t: {} }, km: 3.1, startedAt: 1767560100000 }]),
  // No night key in the fixture: since Beta 1.77 the theme is sun-automatic and
  // a cold open forgets any stored override, so a seeded one cannot survive
  // this drive's first boot by design. The override pair's backup carriage is
  // asserted in drive145 (N20b); the S1 probe below reads the pinned day.
  'snowroute.5w.v4.notes': JSON.stringify({ Woolacott: [{ k: 'car', at: '2026-01-05T12:10:00.000Z' }, { k: 'note', at: '2026-01-05T12:11:00.000Z', text: 'Bin at the curb' }] }),
  'snowroute.5w.v4.via': JSON.stringify({ Astona: 'manual', Velmar: 'gps' }),
  'snowroute.5w.v4.trail': JSON.stringify([[43.8207, -79.567, 1767650400], [43.821, -79.5675, 1767650460], [43.8213, -79.568, 1767650520]]),
  'snowroute.5w.v4.cov': JSON.stringify({ Velmar: [0, 1, 2, 3], Woolacott: [0] }),
  'snowroute.5w.v5.start': '1767650300000',
  'snowroute.5w.v5.flip': '0',
  'snowroute.5w.v5.sides': JSON.stringify({ p: { Astona: [3], Velmar: Array(14).fill(3), Woolacott: [3, 1, 0] }, t: { Velmar: { 0: [T1, '2026-01-05T12:01:00.000Z'] }, Woolacott: { 0: [T1, '2026-01-05T12:02:00.000Z'], 1: [T1, null] } } })
};
const FIXJ = JSON.stringify(FIXTURE);
const FIX_VELMAR_PARTS = JSON.parse(FIXTURE['snowroute.5w.v5.sides']).p.Velmar.length; // premise derivation (Tranche 4 / T2, 2026-11-08): expectations about the shipped world derive from source - see pack-expect.mjs (fixture-world: derived from this drive's own frozen fixture, not the catalogue)
const loadRouteWait = async () => { await until(async () => { const r = await b.ev(`(function(){ if (typeof routeLoaded === 'undefined') return false; if (!routeLoaded && typeof loadRoute === 'function') { try { loadRoute('5w'); } catch (e) {} } return routeLoaded === true && !!window.__bootAt; })()`); return r === true; }, 30000); }; // Beta 1.76: retry across the reload race

// ---- session 1: the fixture loads losslessly, and a backup round-trips it ----
let b = await launch(false);
ok('S1 fixture-era page boots', await waitBoot(b.ev));
await b.ev(`(() => { const F = ${FIXJ}; for (const k of Object.keys(F)) localStorage.setItem(k, F[k]); return true; })()`);
await b.ev('location.reload()');
await waitBoot(b.ev);
await loadRouteWait(); await sleep(400);
await b.ev(`setThemeOverride(true); applyNight(); true`); // Beta 1.77: the fixture no longer seeds a night flag - a cold open starts automatic by design, so the probe's night reading is set the way a user sets it, through the override
const probe = JSON.parse(await b.ev(`JSON.stringify({
  velmarAll3: pieces.Velmar.length === ${FIX_VELMAR_PARTS} && pieces.Velmar.every(v => v === 3),
  wool: pieces.Woolacott, done: [...doneSet].sort(),
  pt: pieceTimes.Woolacott[1], hist: history.length, histFull: Object.keys(history[0].items).length,
  notes: (notes.Woolacott || []).length, trail: trail.length, covV: coveredIdx.Velmar ? coveredIdx.Velmar.length : -1,
  runStart, night: document.body.classList.contains('night') })`));
ok('S1 fixture sides decode exactly (Velmar complete, Woolacott partial)', probe.velmarAll3 && JSON.stringify(probe.wool) === '[3,1,0]');
ok('S1 fixture done set + piece times survive', JSON.stringify(probe.done) === '["Astona","Velmar"]' && JSON.stringify(probe.pt) === JSON.stringify([T1, null]));
ok('S1 fixture history survives (2 entries, full run intact)', probe.hist === 2 && probe.histFull === NAMES34.length);
ok('S1 fixture notes/trail/coverage/run/night survive | probe ' + JSON.stringify(probe), probe.notes === 2 && probe.trail === 3 && probe.covV === 4 && probe.runStart === 1767650300000 && probe.night === true);
const rt = JSON.parse(await b.ev(`(() => { const o = JSON.parse(buildBackup()); const F = ${FIXJ}; const k2f = {}; for (const f of ROUTE_FIELDS) k2f[routeKeys('5w')[f]] = f; k2f[LS_GLOBAL.night] = 'night'; const out = {}; for (const k of Object.keys(F)) { const f = k2f[k]; const v = f === 'night' ? o.night : (o.routes['5w'] || {})[f]; try { out[k] = JSON.stringify(JSON.parse(v)) === JSON.stringify(JSON.parse(F[k])); } catch (e) { out[k] = v === F[k]; } } return JSON.stringify(out); })()`));
ok('S1 backup of the fixture state is meaning-identical on all 10 keys', Object.keys(rt).length === 10 && Object.values(rt).every(Boolean));

// ---- session 2: state B backup taken, state A restored, restore interrupted --
await b.ev(`(() => { pieces.Woolacott = [3, 3, 3]; saveAll(); return true; })()`);
const backupB = await b.ev(`buildBackup()`);
// State A is seeded without Woolacott's record, so the merge must add state B's completion back.
await b.ev(`(() => { const F = ${FIXJ}; for (const k of Object.keys(F)) localStorage.setItem(k, F[k]);
  const sd = JSON.parse(localStorage.getItem('snowroute.5w.v5.sides')); delete sd.p.Woolacott; delete sd.t.Woolacott;
  localStorage.setItem('snowroute.5w.v5.sides', JSON.stringify(sd));
  const dn = JSON.parse(localStorage.getItem('snowroute.5w.v2')); localStorage.setItem('snowroute.5w.v2', JSON.stringify(dn.filter(n => n !== 'Woolacott')));
  return true; })()`);
await b.ev('location.reload()');
await waitBoot(b.ev);
await loadRouteWait(); await sleep(400);
const s2state = await b.ev(`JSON.stringify({ stored: JSON.parse(localStorage.getItem('snowroute.5w.v5.sides')).p.Woolacott })`);
ok('S2 state A-minus seeded (fixture minus Woolacott record) | state ' + s2state, JSON.parse(s2state).stored === undefined);
await b.ev(`(() => { restoreBackup(JSON.parse(${JSON.stringify(backupB)})); return true; })()`);
// The restore has written and verified every key and is inside its 600ms reload
// pause. Kill the browser NOW - the harshest moment to interrupt it.
await closeBrowser(b);

// ---- session 3: relaunch - the restored state must be present -----------------
b = await launch(false);
await waitBoot(b.ev);
await loadRouteWait(); await sleep(400);
const s3state = await b.ev(`JSON.stringify({ w: pieces.Woolacott, stored: JSON.parse(localStorage.getItem('snowroute.5w.v5.sides')).p.Woolacott })`);
ok('S3 interrupted restore still landed state B (Woolacott complete) | state ' + s3state, JSON.stringify(JSON.parse(s3state).w) === '[3,3,3]');
ok('S3 restored state is stable across the relaunch boot', await b.ev(`[...doneSet].includes('Woolacott')`));
await closeBrowser(b);

// ---- session 4: the marker rule in merge form (Beta 1.287, issue #172) -----
// Resident run state is never displaced by a backup's trail or markers.
b = await launch(false);
ok('S4 legacy-era page boots', await waitBoot(b.ev));
await b.ev(`(() => { const F = ${FIXJ}; for (const k of Object.keys(F)) localStorage.setItem(k, F[k]); localStorage.setItem('snowroute.5w.v5.sess', '[1767650000]'); return true; })()`);
await b.ev('location.reload()');
await waitBoot(b.ev);
await sleep(1200);
const waitReload = async () => { await b.ev(`(() => { window.__preRestore = 1; return true; })()`); };
const waitApp = async () => !!(await until(async () => await b.ev(`typeof restoreBackup === 'function' && typeof buildBackup === 'function'`), 30000));
await waitApp();
const pollReload = async () => { const t0 = Date.now(); while (Date.now() - t0 < 25000) { const gone = await b.ev(`typeof window.__preRestore === 'undefined' && !!document.getElementById('ver')`); if (gone === true) return true; await sleep(400); } return false; };
const pollAddedNothing = async what => !!(await until(async () => { let t = null; try { t = await b.ev(`$('toast').textContent`); } catch (e) { /* a mid-navigation read is a miss, not a failure */ } return typeof t === 'string' && t.indexOf('Backup added nothing') >= 0 ? t : false; }, 9000, what));
const s4plan = await b.ev(`(() => { const p = RESTORE.plan(JSON.parse(${JSON.stringify(backupB)})); return p ? JSON.stringify(p.entries.map(e => e[0])) : 'null'; })()`);
await waitReload();
await b.ev(`(() => { restoreBackup(JSON.parse(${JSON.stringify(backupB)})); return true; })()`);
ok('S4a restore of the governed backup completes (page reloaded)', await pollReload());
await waitApp();
const s4a = JSON.parse(await b.ev(`JSON.stringify({ sess: localStorage.getItem('snowroute.5w.v5.sess'), trail: localStorage.getItem('snowroute.5w.v4.trail') })`));
ok('S4a a backup carrying a trail but no markers leaves the resident markers AND trail untouched; only the absent theme pair fills | plan keys ' + s4plan + ' ' + JSON.stringify(s4a), s4a.sess === '[1767650000]' && s4a.trail === JSON.parse(backupB).routes['5w'].trail && s4plan === '["snowroute.v2.night","snowroute.v2.nightExp"]');
await b.ev(`(() => { localStorage.setItem('snowroute.5w.v5.sess', '[1767650000]'); return true; })()`);
await b.ev(`(() => { const nb = JSON.parse(${JSON.stringify(backupB)}); delete nb.routes['5w'].trail; restoreBackup(nb); return true; })()`);
ok('S4b restore of the no-trail backup reports it added nothing', await pollAddedNothing('S4b added-nothing toast'));
await waitApp();
const s4b = await b.ev(`localStorage.getItem('snowroute.5w.v5.sess')`);
ok('S4b current-format restore without a trail leaves the markers untouched | sess ' + s4b, s4b === '[1767650000]');
await b.ev(`(() => { localStorage.setItem('snowroute.5w.v5.sess', '[1767650000,1767740000]'); return true; })()`);
const backupC = await b.ev(`buildBackup()`);
await b.ev(`(() => { localStorage.setItem('snowroute.5w.v5.sess', '[1]'); return true; })()`);
await b.ev(`(() => { restoreBackup(JSON.parse(${JSON.stringify(backupC)})); return true; })()`);
ok('S4c restore of the marker-carrying backup reports it added nothing', await pollAddedNothing('S4c added-nothing toast'));
await waitApp();
const s4c = await b.ev(`localStorage.getItem('snowroute.5w.v5.sess')`);
ok('S4c backup markers do not displace resident markers (run state is resident-governed) | sess ' + s4c, s4c === '[1]');
await b.ev(`(() => { localStorage.setItem('snowroute.5w.v4.trail', '[[43.9,-79.6,1767600000]]'); localStorage.setItem('snowroute.5w.v5.sess', '[1767650000]'); return true; })()`);
await b.ev(`(() => { restoreBackup(JSON.parse(${JSON.stringify(backupB)})); return true; })()`);
ok('S4d the governed restore reports it added nothing', await pollAddedNothing('S4d added-nothing toast'));
const s4d = JSON.parse(await b.ev(`(() => JSON.stringify({ toast: $('toast').textContent, trail: localStorage.getItem('snowroute.5w.v4.trail'), sess: localStorage.getItem('snowroute.5w.v5.sess') }))()`));
ok('S4d a no-addition restore writes nothing: the resident trail and markers stand exactly | ' + JSON.stringify(s4d), s4d.trail === '[[43.9,-79.6,1767600000]]' && s4d.sess === '[1767650000]' && s4d.toast.indexOf('Backup added nothing') >= 0);
await closeBrowser(b);

R.exceptions = allExceptions;
console.log(JSON.stringify(R, null, 1));
process.exit(0);
