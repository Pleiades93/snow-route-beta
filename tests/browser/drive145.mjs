import { launchDrive, finish } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();

// drive145: Beta 1.76 route menu + multi-route storage.
// Boot flow: the splash brand hands over to a route menu on the same blue
// screen (Choose a route / Create new route placeholder); the map behind
// carries NO route until one is picked. Picking Route 5W loads it, removes
// the splash, and the Routes tab then opens a sheet with the loaded route
// marked Currently loaded. Storage: every route owns a slot under
// snowroute.<routeId>.; pre-1.76 data moves into the 5W slot copy-and-
// verified on first load (legacy keys kept as fallback; a failed copy
// aborts the move, wipes the partial slot, and the legacy keys stay
// authoritative for that boot). Backups are v2; a v1 backup restores into
// the 5W slot (and the C06 rule clears its session markers).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const SIDES_5W = JSON.stringify({ Velmar: Array(14).fill(3) });
const DONE_5W = JSON.stringify(['Velmar']);

// --- the menu phase: nothing is loaded yet -------------------------------
await ev(`localStorage.clear(); true`);
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
ok('N1 the splash hands over to the route menu (main pane up, Choose + Create offered)', await poll(`(function(){ var sp = document.getElementById('splash'); return !!sp && sp.classList.contains('menu') && document.getElementById('rmMain').classList.contains('on') && !!document.getElementById('rmChoose') && !!document.getElementById('rmCreate'); })()`, 20000));
ok('N2 no route is loaded behind the menu (no state, no route source)', await ev(`routeLoaded === false && activeRoute === null && !(typeof map !== 'undefined' && map && map.getSource('centres'))`));
await ev(`document.getElementById('rmChoose').click(); true`); await sleep(500);
ok('N3 Choose lists Route 5W, unbadged while nothing is loaded', await ev(`(function(){ var rows = document.querySelectorAll('#rmRoutes .routeRow'); return document.getElementById('rmListPane').classList.contains('on') && rows.length === 1 && rows[0].textContent.indexOf('Route 5W') >= 0 && !rows[0].querySelector('.routeBadge'); })()`));
await ev(`document.getElementById('rmBack').click(); true`); await sleep(400);
ok('N4 Back returns to the main pane', await ev(`document.getElementById('rmMain').classList.contains('on') && !document.getElementById('rmListPane').classList.contains('on')`));
await ev(`document.getElementById('rmCreate').click(); true`); await sleep(400);
ok('N5 Create is an honest placeholder', await ev(`document.getElementById('rmCreatePane').classList.contains('on') && document.getElementById('rmCreatePane').textContent.indexOf('Coming soon') >= 0`));
await ev(`document.getElementById('rmBack2').click(); true`); await sleep(400);

// --- the pick -------------------------------------------------------------
await ev(`document.getElementById('rmChoose').click(); true`); await sleep(400);
await ev(`document.querySelector('#rmRoutes .routeRow').click(); true`);
ok('N6 picking Route 5W loads it and removes the splash for good', (await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true && !!activeRoute && activeRoute.id === '5w'`, 15000)) && (await poll(`!document.getElementById('splash')`, 15000)));

// --- Settings order + theme from its new home -----------------------------
await ev(`$('setBtn').click(); true`); await sleep(500);
ok('N7 Settings order is Night/Day, Update, Backup', await ev(`(function(){ var ids = [...document.querySelectorAll('#setMenu .setRow')].map(b => b.id); return JSON.stringify(ids) === JSON.stringify(['nightBtn', 'updBtn', 'exportBtn']); })()`));
const nightBefore = await ev(`isNight()`);
await ev(`$('nightBtn').click(); true`); await sleep(400);
ok('N8 the theme row in Settings actually flips the theme', (await ev(`isNight()`)) !== nightBefore);
await ev(`(function(){ if (isNight() !== ${nightBefore}) $('nightBtn').click(); return true; })()`); await sleep(300);

// --- the Routes sheet ------------------------------------------------------
await ev(`$('routesBtn').click(); true`);
ok('N9 Routes opens its sheet with the loaded route marked Currently loaded', (await poll(`$('routeSheet').classList.contains('open')`, 5000)) && await ev(`(function(){ var rows = document.querySelectorAll('#routeList .routeRow'); var b = rows.length === 1 && rows[0].querySelector('.routeBadge'); return rows.length === 1 && !!b && b.textContent === 'Currently loaded'; })()`));
await ev(`$('routeClose').click(); true`); await sleep(300);

// --- storage slot shape -----------------------------------------------------
ok('N10 route slots are per-route and disjoint; night stays a global key', await ev(`(function(){ var a = routeKeys('5w'), b = routeKeys('zz9'); var av = Object.values(a), bv = Object.values(b); return a.sides === 'snowroute.5w.v5.sides' && b.sides === 'snowroute.zz9.v5.sides' && av.every(v => v.indexOf('snowroute.5w.') === 0) && bv.every(v => v.indexOf('snowroute.zz9.') === 0) && !av.some(v => bv.indexOf(v) >= 0) && LS.night === 'snowroute.v2.night'; })()`));

// --- legacy migration: the copy lands, the fallback stays -------------------
await ev(`localStorage.clear(); true`);
await ev(`localStorage.setItem('snowroute.v5.sides', ${JSON.stringify(SIDES_5W)}); localStorage.setItem('snowroute.v2', ${JSON.stringify(DONE_5W)}); true`);
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(600);
ok('N11 first load moves legacy data into the 5W slot (copy verified, legacy kept as fallback)', await ev(`(function(){ return localStorage.getItem('snowroute.5w.v5.sides') === ${JSON.stringify(SIDES_5W)} && localStorage.getItem('snowroute.v5.sides') === ${JSON.stringify(SIDES_5W)} && doneSet.has('Velmar'); })()`));

// --- migration abort: a failed copy leaves legacy authoritative -------------
await ev(`localStorage.clear(); true`);
await ev(`localStorage.setItem('snowroute.v5.sides', ${JSON.stringify(SIDES_5W)}); localStorage.setItem('snowroute.v2', ${JSON.stringify(DONE_5W)}); true`);
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
await ev(`(function(){ var orig = lsSet; window.__origLsSet = orig; lsSet = function(k, v){ if (k === 'snowroute.5w.v5.sides') return false; return orig(k, v); }; return true; })()`);
await ev(`loadRoute('5w'); true`); await sleep(600);
ok('N12 a failed copy aborts the move: partial slot wiped, legacy state loads instead', await ev(`(function(){ return localStorage.getItem('snowroute.5w.v5.sides') === null && localStorage.getItem('snowroute.5w.v2') === null && doneSet.has('Velmar'); })()`));
await ev(`(function(){ if (window.__origLsSet) lsSet = window.__origLsSet; return true; })()`);

// --- v1 backup restores into the slot; C06 clears its markers ---------------
const TRAIL_5W = JSON.stringify([[43.8, -79.5, 1762000000], [43.8005, -79.5005, 1762000060]]);
const v1 = JSON.stringify({ app: 'snowroute-backup', v: 1, at: '2026-11-02T00:00:00.000Z', data: { 'snowroute.v5.sides': SIDES_5W, 'snowroute.v2': DONE_5W, 'snowroute.v4.trail': TRAIL_5W } });
await ev(`localStorage.clear(); true`);
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(500);
await ev(`(function(){ document.getElementById('xText').value = ${JSON.stringify(v1)}; doRestore(); return true; })()`);
await sleep(900);
await poll(`!!window.__bootAt`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(600);
ok('N13 a v1 backup restores into the 5W slot, markers cleared by the C06 rule (trail without its sessions)', await ev(`(function(){ return doneSet.has('Velmar') && localStorage.getItem('snowroute.5w.v5.sess') === '[]' && JSON.parse(localStorage.getItem('snowroute.5w.v4.trail') || '[]').length === 2; })()`));

// --- backups are v2 now ------------------------------------------------------
ok('N14 buildBackup emits the v2 per-route shape', await ev(`(function(){ var b = JSON.parse(buildBackup()); return b.app === 'snowroute-backup' && b.v === 2 && !!b.routes && typeof b.routes['5w'].sides === 'string' && typeof b.routes['5w'].trail === 'string'; })()`));

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
