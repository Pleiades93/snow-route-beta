import { launchDrive, finish } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// drive145: Beta 1.76 route menu + multi-route storage.
// Boot flow: the splash brand hands over to a route menu on the same blue
// screen (Choose a route / Create new route); the map behind
// carries NO route until one is picked. Picking Route 5W loads it, removes
// the splash. Beta 1.78 (Andrew): the Routes tab reopens that same
// full-screen blue menu (slide-up takeover; badge and its own X exist only
// in that mode) - the small Routes sheet is retired, and boot-mode renders
// never carry the badge (the 1.77 pick flicker). Storage: every route owns a slot under
// snowroute.<routeId>.; pre-1.76 data moves into the 5W slot copy-and-
// verified on first load (legacy keys kept as fallback; a failed copy
// aborts the move and the legacy keys stay authoritative for that boot).
// Beta 1.94 (SR-193-03): the move's commit record is an explicit marker
// key - a retry fills only the fields the slot lacks and never overwrites
// a present one. Backups are v2; a v1 backup restores into
// the 5W slot (and the C06 rule clears its session markers).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const SIDES_5W = JSON.stringify({ Velmar: Array(14).fill(3) });
const DONE_5W = JSON.stringify(['Velmar']);
const RESTORED_5W = JSON.stringify({ p: { Velmar: [0] }, t: {} }); // a NEWER slot record, as a backup restore would leave it - the SR-193-03 migration must never overwrite it with the legacy copy

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
ok('N5 Create opens the two doors (Beta 1.118 remap: the 1.117 "Coming soon" placeholder is replaced by the real flow - From a photo / Select streets myself, and the placeholder text is gone)', await ev(`document.getElementById('rmCreatePane').classList.contains('on') && !!document.getElementById('crDoorPhoto') && !!document.getElementById('crDoorManual') && document.getElementById('rmCreatePane').textContent.indexOf('Coming soon') < 0`));
await ev(`document.getElementById('rmBack2').click(); true`); await sleep(400);

// --- the pick -------------------------------------------------------------
await ev(`document.getElementById('rmChoose').click(); true`); await sleep(400);
await ev(`document.querySelector('#rmRoutes .routeRow').click(); true`);
ok('N6 picking Route 5W loads it and removes the splash for good', (await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true && !!activeRoute && activeRoute.id === '5w'`, 15000)) && (await poll(`!document.getElementById('splash')`, 15000)));
ok('N6b a boot-mode render never badges the loaded route (the 1.77 pick flicker, killed at the source)', await ev(`(function(){ renderRouteLists(); var r = document.querySelector('#rmRoutes .routeRow'); return !!r && !r.querySelector('.routeBadge'); })()`));
ok('N6c after the boot pick the route menu is parked, not gone (the Routes tab can bring it back)', await ev(`(function(){ var rm = document.getElementById('routeMenu'); return !!rm && !rm.classList.contains('open') && !rm.classList.contains('boot') && getComputedStyle(rm).visibility === 'hidden'; })()`));

// --- Settings order + theme from its new home -----------------------------
await ev(`$('setBtn').click(); true`); await sleep(500);
ok('N7 Settings main pane is Status / On the job / Backup / About-What\'s new (Beta 1.111 redesign; Beta 1.88: the blue takeover; the theme got its own button, still out of the menu)', await ev(`(function(){ var ids = [...document.querySelectorAll('#setMainPane .rmBtn')].map(b => b.id); return JSON.stringify(ids) === JSON.stringify(['stBtn', 'jobBtn', 'exportBtn', 'aboutBtn']) && !$('setMenu').contains($('nightBtn')); })()`));
const nightBefore = await ev(`isNight()`);
await ev(`$('nightBtn').click(); true`); await sleep(400);
ok('N8 the day/night button actually flips the theme', (await ev(`isNight()`)) !== nightBefore);
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
await ev(`markDone('Velmar', 'tap'); true`); await sleep(200);
ok('N20c a backup taken mid-recording contains the buffered trail + coverage - flushed first (Beta 1.92, deep audit F04)', await ev(`(function(){ try { trail.push([43.9999, -79.9999, 1999999999]); trailDirty = true; coveredIdx.__f04 = [0]; auxDirty = true; var b = JSON.parse(buildBackup()); var tr = JSON.parse(b.routes['5w'].trail || '[]'); var cv = JSON.parse(b.routes['5w'].cov || '{}'); var good = tr.some(p => p[0] === 43.9999) && !!cv.__f04; trail.pop(); delete coveredIdx.__f04; return good; } catch (e) { return false; } })()`));
await ev(`(function(){ var orig = lsSet; window.__lsOrig145 = orig; lsSet = function(k, v){ if (k === LS.trail) return false; return orig(k, v); }; return true; })()`);
ok('N20d a backup whose trail flush FAILS is refused outright, never shipped stale (Beta 1.93, audit R02)', await ev(`(function(){ try { trail.push([43.9998, -79.9998, 1999999998]); trailDirty = true; var b = buildBackup(); trail.pop(); return b === null; } catch (e) { return false; } })()`));
await ev(`(function(){ if (window.__lsOrig145) lsSet = window.__lsOrig145; return true; })()`);
await ev(`(function(){ var orig = lsSet; window.__lsOrig145b = orig; lsSet = function(k, v){ if (k === LS.sides) return false; return orig(k, v); }; return true; })()`);
await ev(`(function(){ try { togglePiece('Velmar', 0, 0); } catch (e) {} return true; })()`); // the auditor's repro sequence: a mutation whose save FAILS - memory is now ahead of storage
ok('N20e a backup is refused when a failed save leaves memory ahead of storage - never shipped with the old board inside (Beta 1.94, deep audit SR-193-01)', await ev(`(function(){ try { return primaryDirty === true && buildBackup() === null; } catch (e) { return false; } })()`));
await ev(`(function(){ if (window.__lsOrig145b) lsSet = window.__lsOrig145b; try { togglePiece('Velmar', 0, 0); } catch (e) {} flushAux(true); return true; })()`); // storage healthy again: undo the probe mutation and let the retry land, leaving the board as the section found it

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
ok('N12 a failed copy aborts the move: no marker written, legacy state loads instead (Beta 1.94, SR-193-03: a verified fill may stay - done landed - but without the marker it is never treated as a completed move)', await ev(`(function(){ return localStorage.getItem('snowroute.5w.v5.sides') === null && localStorage.getItem('snowroute.5w.v2') === ${JSON.stringify(DONE_5W)} && localStorage.getItem('snowroute.5w.v2.migrated') === null && doneSet.has('Velmar'); })()`));
await ev(`(function(){ if (window.__origLsSet) lsSet = window.__origLsSet; return true; })()`);
ok('N12b a backup taken on the legacy fallback exports the LEGACY data, not the wiped slot (Beta 1.92, deep audit F02; compared semantically since 1.94 - SR-193-01 reconciles the save first, which stores the same marks in the current sides format)', await ev(`(function(){ try { var b = JSON.parse(buildBackup()); if (!b.routes || !b.routes['5w'] || b.routes['5w'].done !== ${JSON.stringify(DONE_5W)}) return false; var sd = JSON.parse(b.routes['5w'].sides); var arr = sd && sd.p ? sd.p.Velmar : sd && sd.Velmar; return Array.isArray(arr) && arr.length === 14 && arr.every(v => v === 3); } catch (e) { return false; } })()`));

// --- R04 (Beta 1.93): a partial slot (sides only) is not a completed migration
await ev(`localStorage.clear(); true`);
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
await ev(`localStorage.setItem('snowroute.v5.sides', ${JSON.stringify(SIDES_5W)}); localStorage.setItem('snowroute.v2', ${JSON.stringify(DONE_5W)}); localStorage.setItem('snowroute.v5.sess', '[1762000000]'); localStorage.setItem('snowroute.5w.v5.sides', ${JSON.stringify(SIDES_5W)}); true`); // seeded AFTER the reload, on the fresh unloaded page: seeding before it raced the old page's pagehide flush, which could write its own session record back over the seeded one (CI caught this; the app was never wrong)
await ev(`loadRoute('5w'); true`); await sleep(600);
ok('N12c a partial slot is NOT adopted as migrated - the missing fields are copied (Beta 1.93, audit R04)', await ev(`localStorage.getItem('snowroute.5w.v5.sess') === '[1762000000]' && doneSet.has('Velmar')`));

// --- SR-193-03 (Beta 1.94): the marker is the commit record - a partial
// slot's present fields are NEVER overwritten by the legacy copy, and once
// the marker exists the slot is never re-examined against legacy again.
// (The auditor's repro: legacy sides OLD + slot sides RESTORED + no slot
// history - the 1.93 parity gate recopied OLD over RESTORED.)
await ev(`localStorage.clear(); true`);
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
await ev(`localStorage.setItem('snowroute.v5.sides', ${JSON.stringify(SIDES_5W)}); localStorage.setItem('snowroute.v2', ${JSON.stringify(DONE_5W)}); localStorage.setItem('snowroute.v5.sess', '[1762000000]'); localStorage.setItem('snowroute.5w.v5.sides', ${JSON.stringify(RESTORED_5W)}); true`); // seeded AFTER the reload, on the fresh unloaded page (the N12c lesson)
await ev(`loadRoute('5w'); true`); await sleep(600);
ok('N12d a partial slot keeps its NEWER sides: the migration fills only the gaps and writes the marker (Beta 1.94, deep audit SR-193-03)', await ev(`(function(){ return localStorage.getItem('snowroute.5w.v5.sides') === ${JSON.stringify(RESTORED_5W)} && localStorage.getItem('snowroute.5w.v5.sess') === '[1762000000]' && localStorage.getItem('snowroute.5w.v2.migrated') === '1'; })()`));
await ev(`localStorage.setItem('snowroute.v5.sides', ${JSON.stringify(SIDES_5W)}); true`); // legacy changes its mind afterwards - with the marker written, it no longer matters
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(600);
ok('N12e with the marker written, later legacy changes never re-enter the slot', await ev(`localStorage.getItem('snowroute.5w.v5.sides') === ${JSON.stringify(RESTORED_5W)}`));

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

// --- F06 (Beta 1.92, Andrew's pick (a)): a done-only backup derives its sides
const v1doneOnly = JSON.stringify({ app: 'snowroute-backup', v: 1, at: '2026-11-02T00:00:00.000Z', data: { 'snowroute.v2': DONE_5W } });
await ev(`localStorage.clear(); true`);
await ev(`localStorage.setItem('snowroute.5w.v5.sides', JSON.stringify({ p: { Velmar: [0] }, t: {} })); localStorage.setItem('snowroute.5w.v4.trail', JSON.stringify([[43.8, -79.5, 1762000000]])); true`); // the trail seed keeps N14's v2-shape precondition (a stored trail) true after this section's clear
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(500);
ok('N13a baseline: the seeded side-marks say Velmar is NOT done', await ev(`!doneSet.has('Velmar')`));
const bootMark13b = await ev(`window.__bootAt`);
await ev(`(function(){ document.getElementById('xText').value = ${JSON.stringify(v1doneOnly)}; doRestore(); return true; })()`);
await sleep(900);
await poll(`!!window.__bootAt && window.__bootAt !== ${JSON.stringify(bootMark13b)}`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(600);
ok('N13b a done-only backup restores for real: the side-marks are derived from the list', await ev(`(function(){ try { return doneSet.has('Velmar') && pieces.Velmar.every(v => v === 3); } catch (e) { return false; } })()`));

// --- R03 (Beta 1.93): an explicitly EMPTY done list is applied, not skipped --
const v1doneEmpty = JSON.stringify({ app: 'snowroute-backup', v: 1, at: '2026-11-02T00:00:00.000Z', data: { 'snowroute.v2': '[]' } });
await ev(`localStorage.clear(); true`);
await ev(`localStorage.setItem('snowroute.5w.v5.sides', ${JSON.stringify(SIDES_5W)}); localStorage.setItem('snowroute.5w.v4.trail', JSON.stringify([[43.8, -79.5, 1762000000]])); true`);
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(500);
ok('N13c-a baseline: Velmar starts out done', await ev(`doneSet.has('Velmar')`));
const bootMark13c = await ev(`window.__bootAt`);
await ev(`(function(){ document.getElementById('xText').value = ${JSON.stringify(v1doneEmpty)}; doRestore(); return true; })()`);
await sleep(900);
await poll(`!!window.__bootAt && window.__bootAt !== ${JSON.stringify(bootMark13c)}`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(600);
ok('N13c-b restoring an EMPTY completion list clears the board (Beta 1.93, audit R03)', await ev(`(function(){ try { return !doneSet.has('Velmar') && pieces.Velmar.every(v => v === 0); } catch (e) { return false; } })()`));

// --- F-05 (Beta 1.94): street names the route does not know are counted and
// reported in the restore result, not silently dropped by the loaders ------
const v2badNames = JSON.stringify({ app: 'snowroute-backup', v: 2, at: '2026-11-04T00:00:00.000Z', routes: { '5w': { done: JSON.stringify(['Velmar', 'Nosuch Avenue']), sides: JSON.stringify({ p: { Velmar: Array(14).fill(3), 'Nosuch Avenue': [3], 'Different Nowhere': [3] }, t: {} }) } } });
const bootMark13d = await ev(`window.__bootAt`);
const toast13d = await ev(`(function(){ document.getElementById('xText').value = ${JSON.stringify(v2badNames)}; doRestore(); return document.getElementById('toast').textContent; })()`);
await sleep(900);
await poll(`!!window.__bootAt && window.__bootAt !== ${JSON.stringify(bootMark13d)}`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(600);
ok('N13d a restore carrying unknown street names reports how many UNIQUE names were ignored - Nosuch Avenue appears twice, counts once (Beta 1.94 F-05; unique counting Beta 1.95, SR-194-08) | ' + toast13d, /2 unknown street names/.test(toast13d) && (await ev(`doneSet.has('Velmar')`)) === true);

// --- SR-194-08 (Beta 1.95): the unknown-name count reads the RAW backup,
// before any normalization filters names away, and counts each name once.
// 1.94 counted only what survived pushField: an object-form done map was
// filtered before counting (its unknowns invisible) and array-form history
// items were skipped entirely; repeats counted per occurrence.
const v1badNames = JSON.stringify({ app: 'snowroute-backup', v: 1, at: '2026-11-04T00:00:00.000Z', data: { 'snowroute.v2': JSON.stringify({ Velmar: '2026-11-01T00:00:00.000Z', 'Nosuch Avenue': '2026-11-01T00:00:00.000Z', 'Ghost Road': '2026-11-01T00:00:00.000Z' }), 'snowroute.v2.times': JSON.stringify({ Velmar: '2026-11-01T00:00:00.000Z', 'Nosuch Avenue': '2026-11-01T00:00:00.000Z' }) } });
const bootMark13e = await ev(`window.__bootAt`);
const toast13e = await ev(`(function(){ document.getElementById('xText').value = ${JSON.stringify(v1badNames)}; doRestore(); return document.getElementById('toast').textContent; })()`);
await sleep(900);
await poll(`!!window.__bootAt && window.__bootAt !== ${JSON.stringify(bootMark13e)}`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(600);
ok('N13e a v1 restore counts unknown names from the raw backup, each name once - object-form done included (Beta 1.95, SR-194-08) | ' + toast13e, /2 unknown street names/.test(toast13e) && (await ev(`doneSet.has('Velmar')`)) === true);
const v2arrHist = JSON.stringify({ app: 'snowroute-backup', v: 2, at: '2026-11-04T00:00:00.000Z', routes: { '5w': { done: JSON.stringify(['Velmar']), sides: JSON.stringify({ p: { Velmar: Array(14).fill(3) }, t: {} }), hist: JSON.stringify([{ at: '2026-11-02T00:00:00.000Z', startedAt: '2026-11-02T00:00:00.000Z', items: ['Velmar', 'Phantom Crescent'] }]) } } });
const bootMark13f = await ev(`window.__bootAt`);
const toast13f = await ev(`(function(){ document.getElementById('xText').value = ${JSON.stringify(v2arrHist)}; doRestore(); return document.getElementById('toast').textContent; })()`);
await sleep(900);
await poll(`!!window.__bootAt && window.__bootAt !== ${JSON.stringify(bootMark13f)}`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(600);
ok('N13f unknown names inside ARRAY-form history items are counted too (Beta 1.95, SR-194-08) | ' + toast13f, /1 unknown street name/.test(toast13f));

// N13g (Beta 1.96, deep audit SR-195-05): OBJECT-form notes ({street: [entries]})
// pass the restore's shape check and their names are dropped by the loader -
// 1.95's counter scanned only the array form, so they vanished uncounted.
const v2objNotes = JSON.stringify({ app: 'snowroute-backup', v: 2, at: '2026-11-04T00:00:00.000Z', routes: { '5w': { done: JSON.stringify(['Velmar']), times: JSON.stringify({ Velmar: '2026-11-01T00:00:00.000Z' }), notes: JSON.stringify({ 'Phantom Lane': [{ at: '2026-11-01T00:00:00.000Z', text: 'gate code 4' }] }) } } });
const bootMark13g = await ev(`window.__bootAt`);
const toast13g = await ev(`(function(){ document.getElementById('xText').value = ${JSON.stringify(v2objNotes)}; doRestore(); return document.getElementById('toast').textContent; })()`);
await sleep(900);
await poll(`!!window.__bootAt && window.__bootAt !== ${JSON.stringify(bootMark13g)}`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(600);
ok('N13g unknown names inside OBJECT-form notes are counted too (Beta 1.96, SR-195-05) | ' + toast13g, /1 unknown street name/.test(toast13g) && (await ev(`doneSet.has('Velmar')`)) === true);

// --- backups are v2 now ------------------------------------------------------
ok('N14 buildBackup emits the v2 per-route shape', await ev(`(function(){ var b = JSON.parse(buildBackup()); return b.app === 'snowroute-backup' && b.v === 2 && !!b.routes && typeof b.routes['5w'].sides === 'string' && typeof b.routes['5w'].trail === 'string'; })()`));

// --- R05 (Beta 1.93, follow-up audit): the start delete is a finish GATE ----
// A blocked delete stops the finish with the run intact; it no longer relies
// on a retry surviving long enough to land.
await ev(`markDone('Velmar', 'tap'); true`); await sleep(200);
await ev(`(function(){ window.__rmOrig = Storage.prototype.removeItem; Storage.prototype.removeItem = function(k){ if (k === 'snowroute.5w.v5.start') throw new Error('injected delete failure'); return window.__rmOrig.call(this, k); }; return true; })()`);
await ev(`startClean(); true`); await sleep(300);
await ev(`finishRun(); true`); await sleep(400);
ok('N25a (fault live) a blocked start delete STOPS the finish - run intact, board untouched', await ev(`(function(){ try { return runStart > 0 && doneSet.has('Velmar'); } catch (e) { return false; } })()`));
await ev(`(function(){ Storage.prototype.removeItem = window.__rmOrig; return true; })()`);
await ev(`finishRun(); true`); await sleep(400);
ok('N25b with the delete working again the finish completes and the start key is gone', await ev(`runStart === 0 && localStorage.getItem('snowroute.5w.v5.start') === null`));
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(500);
ok('N25c no phantom run after the reload', await ev(`runStart === 0`));

// --- Beta 1.110: Finish is FINAL (the Finish -> Undo -> Cancel chain went
// with the Undo itself - Andrew: the Yes confirmation is the whole gate).
// What survives of the SR-194-01 concern: a finish takes the run's cancel
// snapshot with it (no stale LS.snap may linger pretending a live run
// exists), and the finished state persists across a reload.
await ev(`clearAllMarks(); true`); await sleep(200);
await ev(`markDone('Velmar', 'tap'); true`);
await ev(`startClean(); true`); await sleep(200);
await ev(`togglePiece('Velmar', 0, 0); true`); // a pre-Start side unmarked mid-run - the snapshot exists for Cancel, and Finish must retire it
await ev(`markDone('Astona', 'tap'); markDone('Mellings', 'tap'); markDone('Boddy', 'tap'); true`); await sleep(200); // 3 complete streets at the finish, so the clean ARCHIVES (Velmar's unmark dropped it out of the done set)
const h145before = await ev(`history.length`);
await ev(`finishRun(); true`); await sleep(300);
ok('N35a finish retires the cancel snapshot - board cleared, run over, no LS.snap lingers (Beta 1.110)', await ev(`(function(){ try { return runStart === 0 && doneSet.size === 0 && localStorage.getItem(LS.snap) === null && localStorage.getItem(LS.start) === null; } catch (e) { return false; } })()`));
await ev(`location.reload(); true`);
await poll(`!!window.__bootAt`, 30000);
await ev(`loadRoute('5w'); true`); await sleep(600);
const n35b = JSON.parse(await ev(`(() => JSON.stringify({ run: runStart, done: doneSet.size, h: history.length }))()`));
ok('N35b after a reload the finish stands - board still clear, no run, the archive kept (Beta 1.110) | ' + JSON.stringify(n35b), n35b.run === 0 && n35b.done === 0 && n35b.h === h145before + 1);

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
await sleep(2200); // Beta 1.81: the flight starts at +1500ms by design (the wide view dwells on the Route 5W point of interest first) - wait until it is actually under way before polling for the settle, or the poll reads the pre-flight stillness and N23 measures the wide start
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
// N30/N31 (Beta 1.81): a flick-down close must CONTINUE at the finger's speed - the old
// CSS ease-close restarted from rest (rig-measured: +3/+12/+21px in the first 120ms),
// which read as "just disappears" on Pace's short sheet. The spring settle keeps the
// release velocity: sample the top edge right after release - it must already be well
// on its way - and the sheet must land fully closed.
await ev(`(function(){ renderStreets(); $('sheet').classList.add('open'); })()`); await sleep(650);
hp = await headPt();
const topNow = async () => Math.round(await ev(`$('sheet').getBoundingClientRect().top`));
await mDown(hp.x, hp.y);
let fy = hp.y; for (let i = 0; i < 5; i++) { fy += 26; await mMove(hp.x, fy); await sleep(16); }
await mUp(hp.x, fy);
const topR = await topNow();
await sleep(45); const top1 = await topNow();
await sleep(45); const top2 = await topNow();
ok('N30 a flick-down close keeps the finger speed (no restart from rest) | top ' + topR + ' -> ' + top1 + ' -> ' + top2, top1 >= topR && (top2 - topR) >= 45);
await sleep(900);
const closedState = JSON.parse(await ev(`(() => JSON.stringify({ open: $('sheet').classList.contains('open'), vis: getComputedStyle($('sheet')).visibility, tf: $('sheet').style.transform, h: $('sheet').style.height }))()`));
ok('N31 the spring close lands fully closed with inline geometry cleared | ' + JSON.stringify(closedState), closedState.open === false && closedState.vis === 'hidden' && closedState.tf === '' && closedState.h === '');
// N34 (Beta 1.83): the close landing must be CLEAN - Andrew on 1.82: a flick close
// landed, then the sheet popped back up and down a split second later (Streets and
// Pace). The stop landings never did it: they finish with computed values unchanged.
// The close finish was the one landing that removed .dragging (transitions back on)
// in the same breath as flipping .open and clearing the inline geometry. The fix
// lands the close entirely under .dragging and removes it two frames later, when it
// changes nothing. Pinned two ways: (a) in the landing frame itself (spring done,
// .open off) .dragging is STILL on, and it is off shortly after; (b) once the sheet's
// top edge first passes the bottom of the screen it never re-enters (no pop).
await ev(`(function(){ renderStreets(); $('sheet').classList.add('open'); })()`); await sleep(650);
await ev(`(function(){ const s = $('sheet'); window.__popTrace = []; const t0 = performance.now(); const tick = () => { const r = s.getBoundingClientRect(); window.__popTrace.push({ top: Math.round(r.top), drag: s.classList.contains('dragging'), spr: !!s._spring, open: s.classList.contains('open') }); if (performance.now() - t0 < 1500) requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`);
hp = await headPt();
fy = hp.y; await mDown(hp.x, hp.y); for (let i = 0; i < 5; i++) { fy += 26; await mMove(hp.x, fy); await sleep(16); } await mUp(hp.x, fy);
await sleep(1700);
const popTrace = JSON.parse(await ev(`(() => JSON.stringify(window.__popTrace || []))()`));
const crossIdx = popTrace.findIndex(p => p.top >= 898);
const reentry = crossIdx >= 0 ? popTrace.slice(crossIdx).some(p => p.top < 890) : true;
const landIdx = popTrace.findIndex(p => !p.spr && !p.open);
const dragAtLand = landIdx >= 0 ? popTrace[landIdx].drag : false;
const dragLater = landIdx >= 0 ? popTrace.slice(landIdx + 6).some(p => !p.drag) : false;
ok('N34 the flick close lands clean - no pop back up, transitions stay off through the landing | n ' + popTrace.length + ' cross ' + crossIdx + ' reentry ' + reentry + ' dragAtLand ' + dragAtLand + ' dragLater ' + dragLater, crossIdx >= 0 && !reentry && dragAtLand === true && dragLater === true);
// N32/N33 (Beta 1.82): the DEFAULT stop is the sheet's OWN natural open height.
// Pace's content is short - its natural height is ~204px (a quarter screen), not the
// 450px half. The 1.81 spring aimed Pace at 450 and snapped it to 204 when the
// finish cleared the inline height (Andrew, live: "goes halfway, stutters, goes
// back to its quarter"). Slow drags with pauses keep these on the position path
// (the rig's CDP dispatch is too slow for true flicks); the flick path shares
// the same settle target. Mid-settle samples discriminate: the buggy spring
// heads UP toward 450, the fixed one heads DOWN toward the natural height.
await ev(`openPace()`); await sleep(700);
const paceNat = await ev(`$('pacePanel').offsetHeight`);
ok('N32 setup: the Pace sheet natural open height is its short content height | ' + paceNat, paceNat > 150 && paceNat < 300);
const paceHead = async () => JSON.parse(await ev(`(() => { const r = $('pacePanel').querySelector('.sheetHead').getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 12) }); })()`));
let pp = await paceHead();
await mDown(pp.x, pp.y); await mMove(pp.x, pp.y - 40); await sleep(200); await mMove(pp.x, pp.y - 80); await sleep(200); await mUp(pp.x, pp.y - 80);
await sleep(150); const paceMid = await ev(`$('pacePanel').offsetHeight`);
await sleep(600);
const paceEnd = JSON.parse(await ev(`(() => JSON.stringify({ h: $('pacePanel').offsetHeight, inl: $('pacePanel').style.height, open: $('pacePanel').classList.contains('open') }))()`));
ok('N32 a Pace release settles to its OWN natural height, never up toward the half | mid ' + paceMid + ' end ' + JSON.stringify(paceEnd), paceMid < paceNat + 120 && Math.abs(paceEnd.h - paceNat) <= 6 && paceEnd.inl === '' && paceEnd.open === true);
await ev(`(function(){ const s = $('pacePanel'); s.style.maxHeight = 'none'; s.style.height = (vvHeight() * 0.94) + 'px'; s.classList.add('full'); })()`); await sleep(100);
pp = await paceHead();
await mDown(pp.x, pp.y); await mMove(pp.x, pp.y + 115); await sleep(200); await mMove(pp.x, pp.y + 230); await sleep(200); await mUp(pp.x, pp.y + 230);
await sleep(150); const paceMid2 = await ev(`$('pacePanel').offsetHeight`);
await sleep(600);
const paceEnd2 = JSON.parse(await ev(`(() => JSON.stringify({ h: $('pacePanel').offsetHeight, full: $('pacePanel').classList.contains('full'), open: $('pacePanel').classList.contains('open') }))()`));
ok('N33 drag down from full settles Pace at its natural height (no halfway stutter) | mid ' + paceMid2 + ' end ' + JSON.stringify(paceEnd2), paceMid2 < 350 && Math.abs(paceEnd2.h - paceNat) <= 6 && paceEnd2.full === false && paceEnd2.open === true);
await ev(`closeSheets()`); await sleep(600);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
