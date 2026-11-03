import { launchDrive, finish } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// drive145: Beta 1.76 route menu + multi-route storage.
// Boot flow: the splash brand hands over to a route menu on the same blue
// screen (Choose a route / Create new route placeholder); the map behind
// carries NO route until one is picked. Picking Route 5W loads it, removes
// the splash. Beta 1.78 (Andrew): the Routes tab reopens that same
// full-screen blue menu (slide-up takeover; badge and its own X exist only
// in that mode) - the small Routes sheet is retired, and boot-mode renders
// never carry the badge (the 1.77 pick flicker). Storage: every route owns a slot under
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
ok('N1 the splash hands over to the route menu (menu shown, main pane up, Choose + Create offered)', await poll(`(function(){ var sp = document.getElementById('splash'); return !!sp && sp.classList.contains('menu') && document.getElementById('routeMenu').classList.contains('show') && document.getElementById('rmMain').classList.contains('on') && !!document.getElementById('rmChoose') && !!document.getElementById('rmCreate'); })()`, 20000));
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
ok('N6b a boot-mode render never badges the loaded route (the 1.77 pick flicker, killed at the source)', await ev(`(function(){ renderRouteLists(); var r = document.querySelector('#rmRoutes .routeRow'); return !!r && !r.querySelector('.routeBadge'); })()`));
ok('N6c after the boot pick the route menu is parked, not gone (the Routes tab can bring it back)', await ev(`(function(){ var rm = document.getElementById('routeMenu'); return !!rm && !rm.classList.contains('open') && !rm.classList.contains('boot') && getComputedStyle(rm).visibility === 'hidden'; })()`));

// --- Settings order + theme from its new home -----------------------------
await ev(`$('setBtn').click(); true`); await sleep(500);
ok('N7 Settings order is Night/Day, Update, Backup', await ev(`(function(){ var ids = [...document.querySelectorAll('#setMenu .setRow')].map(b => b.id); return JSON.stringify(ids) === JSON.stringify(['nightBtn', 'updBtn', 'exportBtn']); })()`));
const nightBefore = await ev(`isNight()`);
await ev(`$('nightBtn').click(); true`); await sleep(400);
ok('N8 the theme row in Settings actually flips the theme', (await ev(`isNight()`)) !== nightBefore);
await ev(`(function(){ if (isNight() !== ${nightBefore}) $('nightBtn').click(); return true; })()`); await sleep(300);

// --- the Routes tab's full-screen menu (Beta 1.78) ---------------------------
await ev(`$('routesBtn').click(); true`);
ok('N9 the Routes tab opens the full-screen blue route menu, main pane up', await poll(`$('routeMenu').classList.contains('open') && $('routeMenu').classList.contains('tab') && $('rmMain').classList.contains('on')`, 5000));
await ev(`$('rmChoose').click(); true`); await sleep(400);
ok('N9b the loaded route wears Currently loaded in the tab-opened menu', await ev(`(function(){ var rows = document.querySelectorAll('#rmRoutes .routeRow'); var b = rows.length === 1 && rows[0].querySelector('.routeBadge'); return rows.length === 1 && !!b && b.textContent === 'Currently loaded'; })()`));
await ev(`$('rmBack').click(); true`); await sleep(400);
await ev(`$('rmClose').click(); true`); await sleep(600);
ok('N9c the menu X closes the full-screen menu', await ev(`!$('routeMenu').classList.contains('open') && !$('routeMenu').classList.contains('tab')`));

// --- menu consistency (Beta 1.77, Andrew's standing rule: a new menu carries
// everything the others have - sheets share the corner X and tap-away; the
// full-screen route menu is a takeover by design (1.78) whose close is
// Andrew's own translucent bottom-centre circle (1.79, N15b) - all checked
// by enumeration
// so a future menu is covered the day it exists) ------------------------------
ok('N15 every sheet close X wears the one shared corner-X style', await ev(`(function(){ var props = ['color', 'backgroundColor', 'width', 'height', 'fontSize', 'fontWeight', 'position', 'paddingTop']; var btns = [...document.querySelectorAll('.sheet .sheetHead button')]; if (btns.length < 2) return false; var ref = getComputedStyle(btns[0]); return btns.every(b => { var cs = getComputedStyle(b); return props.every(p => cs[p] === ref[p]); }) && ref.color === 'rgb(230, 58, 46)' && ref.width === '38px' && ref.backgroundColor === 'rgba(0, 0, 0, 0)'; })()`));
await ev(`$('routesBtn').click(); true`); await poll(`$('routeMenu').classList.contains('open')`, 5000);
ok('N15b the route menu close is the bare white X at bottom centre, no circle (Beta 1.80, Andrew - option E of six)', await ev(`(function(){ var b = document.getElementById('rmClose'); var cs = getComputedStyle(b); var r = b.getBoundingClientRect(); return cs.display !== 'none' && r.width === 44 && r.height === 44 && cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.color === 'rgb(255, 255, 255)' && cs.fontSize === '30px' && cs.fontWeight === '800' && Math.abs((r.left + r.width / 2) - innerWidth / 2) <= 2 && (innerHeight - r.bottom) <= 90; })()`));
await ev(`$('rmClose').click(); true`); await sleep(600);
await ev(`selectStretch('Velmar', 0, [43.8207, -79.5670]); true`); await sleep(300);
await ev(`$('routesBtn').click(); true`); await poll(`$('routeMenu').classList.contains('open')`, 5000);
const swBefore = await ev(`swallowClickUntil`);
await ev(`document.getElementById('map').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); true`); await sleep(400);
ok('N16 the full-screen route menu is a takeover: no tap-away dismisses it, no tap is spent, the selection survives', await ev(`$('routeMenu').classList.contains('open') && !!selStretch`) && (await ev(`swallowClickUntil`)) === swBefore);
await ev(`$('rmClose').click(); true`); await sleep(600);
ok('N17 tap-away closes EVERY sheet (enumerated by class, present and future)', await ev(`(function(){ var sheets = [...document.querySelectorAll('.sheet')]; if (sheets.length < 2) return false; for (const s of sheets) { closeSheets(); s.classList.add('open'); document.getElementById('map').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); if (s.classList.contains('open')) return false; } closeSheets(); return true; })()`));
await ev(`deselect(); true`); await sleep(200);

// --- automatic day/night (Beta 1.77): the sun math is asserted in UTC so the
// checks hold in any timezone the battery runs in; Vaughan reference values
// verified against the real sun (Jan 5 2026: 12:52 / 21:55 UTC; Jun 21 2026:
// 09:36 UTC / 01:03 UTC next day) ---------------------------------------------
ok('N18 the computed sunrise/sunset land on the real Vaughan sun', await ev(`(function(){ var w = sunTimes(Date.UTC(2026, 0, 5, 12, 0), 43.82, -79.57), s = sunTimes(Date.UTC(2026, 5, 21, 12, 0), 43.82, -79.57); return Math.abs(w.rise - Date.UTC(2026, 0, 5, 12, 52)) <= 360000 && Math.abs(w.set - Date.UTC(2026, 0, 5, 21, 55)) <= 360000 && Math.abs(s.rise - Date.UTC(2026, 5, 21, 9, 36)) <= 360000 && Math.abs(s.set - Date.UTC(2026, 5, 22, 1, 3)) <= 360000; })()`)); // instants, not clock readings: the June sunset is 01:03 UTC on the 22nd - asserting the date is the point (a same-date clamp lands it a day early)
ok('N19 automatic mode reads the sun correctly across the year', await ev(`(function(){ return autoNightAt(Date.UTC(2026, 0, 5, 17, 0)) === false && autoNightAt(Date.UTC(2026, 0, 6, 1, 0)) === true && autoNightAt(Date.UTC(2026, 0, 5, 8, 0)) === true && autoNightAt(Date.UTC(2026, 5, 21, 16, 0)) === false && autoNightAt(Date.UTC(2026, 5, 22, 3, 0)) === true; })()`));
ok('N20 a manual override flips the theme at once and hands back at its boundary', await ev(`(function(){ clearThemeOverride(); var auto = autoNightAt(Date.now()); setThemeOverride(!auto); var flipped = isNight() === !auto && !!localStorage.getItem(LS.nightExp) && themeOverrideUntil > Date.now(); themeOverrideUntil = Date.now() - 1; themeTick(); return flipped && themeOverride === null && isNight() === autoNightAt(Date.now()); })()`));
ok('N20b a backup written under an override carries the override pair', await ev(`(function(){ setThemeOverride(true); var b = JSON.parse(buildBackup()); var carried = typeof b.night === 'string' && typeof b.nightExp === 'string'; clearThemeOverride(); return carried; })()`));

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
const bootMark13 = await ev(`window.__bootAt`);
await ev(`(function(){ document.getElementById('xText').value = ${JSON.stringify(v1)}; doRestore(); return true; })()`);
await sleep(900);
await poll(`!!window.__bootAt && window.__bootAt !== ${JSON.stringify(bootMark13)}`, 30000); // the restore's reload is app-triggered and async - a bare __bootAt poll can return on the OLD page (its marker is still set), and the loadRoute below would then no-op on already-loaded state
await ev(`loadRoute('5w'); true`); await sleep(600);
ok('N13 a v1 backup restores into the 5W slot, markers cleared by the C06 rule (trail without its sessions)', await ev(`(function(){ return doneSet.has('Velmar') && localStorage.getItem('snowroute.5w.v5.sess') === '[]' && JSON.parse(localStorage.getItem('snowroute.5w.v4.trail') || '[]').length === 2; })()`));

// --- backups are v2 now ------------------------------------------------------
ok('N14 buildBackup emits the v2 per-route shape', await ev(`(function(){ var b = JSON.parse(buildBackup()); return b.app === 'snowroute-backup' && b.v === 2 && !!b.routes && typeof b.routes['5w'].sides === 'string' && typeof b.routes['5w'].trail === 'string'; })()`));

// --- a full close forgets the override (Beta 1.77): the session marker is
// what separates "opened again" from "cold open" ------------------------------
await ev(`setThemeOverride(true); true`); await sleep(200);
await ev(`sessionStorage.removeItem('snowroute.session'); location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
ok('N21 after a cold open the override is gone and the sun is in charge again', await ev(`themeOverride === null && localStorage.getItem(LS.night) === null && isNight() === autoNightAt(Date.now())`));

// --- the route intro flight (Beta 1.77, Andrew): a pick opens wide on the
// area and flies in to the fitted view instead of appearing already zoomed --
await ev(`document.getElementById('rmChoose').click(); true`);
await poll(`document.querySelectorAll('#rmRoutes .routeRow').length > 0`, 15000);
await ev(`document.querySelector('#rmRoutes .routeRow').click(); true`);
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
ok('N22 a route pick starts the camera wide of the fitted view', await ev(`(function(){ var fit = map.cameraForBounds([[routeBox.w, routeBox.s], [routeBox.e, routeBox.n]], { padding: 28 }); return map.getZoom() < fit.zoom - 1.5; })()`));
await sleep(1200); // the flight starts at +800ms by design (as the splash finishes leaving) - wait until it is actually under way before polling for the settle, or the poll reads the pre-flight stillness and N23 measures the wide start
await poll(`!map.isMoving()`, 25000);
ok('N23 the intro flight lands exactly on the fitted route view', await ev(`(function(){ var fit = map.cameraForBounds([[routeBox.w, routeBox.s], [routeBox.e, routeBox.n]], { padding: 28 }); return Math.abs(map.getZoom() - fit.zoom) < 0.05 && Math.abs(map.getCenter().lng - fit.center.lng) < 0.001 && Math.abs(map.getCenter().lat - fit.center.lat) < 0.001; })()`));

// ---- sheet stops + seamless drag (Beta 1.79, Andrew): both bottom sheets
// open at HALF height; three stops - closed / half / full (drag or flick up
// to fill, down to half, down again to close). A drag follows the finger
// from the first pixels (the 9px dead zone through 1.78 is gone) with the
// frosted blur dropped mid-drag - the per-frame blur repaint that made
// drags stutter behind the finger. Real CDP mouse drags on the head strip;
// a 200ms pause before each release keeps the snap position-based (no
// flick) so the stops are what is measured. --------------------------------
await ev(`$('streetsBtn').click(); true`); await sleep(700);
const hOpen = await ev(`$('sheet').offsetHeight`);
ok('N24 the Streets sheet opens at HALF height (Beta 1.79 three stops: closed / half / full) | h ' + hOpen, Math.abs(hOpen - 450) <= 8);
const headPt = async () => JSON.parse(await ev(`(() => { const r = $('sheet').querySelector('.sheetHead').getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 12) }); })()`));
const mDown = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, S); };
const mMove = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left' }, S); };
const mUp = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, S); };
let hp = await headPt();
await mDown(hp.x, hp.y); await mMove(hp.x, hp.y - 5); await sleep(80);
const drag5 = JSON.parse(await ev(`(() => JSON.stringify({ h: $('sheet').offsetHeight, bf: getComputedStyle($('sheet')).backdropFilter }))()`));
ok('N25 the drag follows from the first pixels and the blur is dropped mid-drag | ' + JSON.stringify(drag5), drag5.h >= 453 && drag5.bf === 'none');
await mMove(hp.x, hp.y - 60); await sleep(60); await mMove(hp.x, hp.y - 150); await sleep(80);
const drag150 = await ev(`$('sheet').offsetHeight`);
ok('N26 the drag follows the finger 1:1 | h ' + drag150 + ' at +150px of travel', Math.abs(drag150 - 600) <= 4);
await mMove(hp.x, hp.y - 300); await sleep(200); await mUp(hp.x, hp.y - 300); await sleep(650);
const full = JSON.parse(await ev(`(() => JSON.stringify({ h: $('sheet').offsetHeight, full: $('sheet').classList.contains('full') }))()`));
ok('N27 release past the midpoint snaps to FULL | ' + JSON.stringify(full), Math.abs(full.h - 846) <= 8 && full.full === true);
hp = await headPt();
await mDown(hp.x, hp.y); await mMove(hp.x, hp.y + 130); await sleep(60); await mMove(hp.x, hp.y + 250); await sleep(200); await mUp(hp.x, hp.y + 250); await sleep(650);
const half = JSON.parse(await ev(`(() => JSON.stringify({ h: $('sheet').offsetHeight, full: $('sheet').classList.contains('full'), open: $('sheet').classList.contains('open') }))()`));
ok('N28 drag down from full settles back at HALF | ' + JSON.stringify(half), Math.abs(half.h - 450) <= 8 && half.full === false && half.open === true);
hp = await headPt();
await mDown(hp.x, hp.y); await mMove(hp.x, hp.y + 140); await sleep(60); await mMove(hp.x, hp.y + 260); await sleep(200); await mUp(hp.x, hp.y + 260); await sleep(650);
ok('N29 drag down from half CLOSES the sheet', await ev(`!$('sheet').classList.contains('open')`));

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
