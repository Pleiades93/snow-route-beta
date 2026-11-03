import { launchDrive, PATTERNS_PROTOMAPS, bootThrough } from './harness.mjs';
let failTiles = false;   // when true, GL map-host requests are failed on purpose (total-basemap-outage simulation) - the harness consults it via failWhen
const { proc, ev, consoleLog, sleep, poll } = await launchDrive({ patterns: PATTERNS_PROTOMAPS, failWhen: u => failTiles && (u.includes('tiles.basemaps.cartocdn.com') || u.includes('protomaps.github.io')) });
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route


const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const exc = () => consoleLog.filter(c => c.type === 'EXCEPTION').length;

// drive115: Beta map-failure notice. The header variant in this drive can
// fail every GL style-host request (failTiles flag in handlePaused),
// simulating a total basemap outage: the vector style can never load.
// Asserts the notice appears when no GL load ever lands, that the streets
// list and marking keep working with no map at all (the beta has no raster
// fallback, by design), that recovery auto-hides it, that dismissal sticks for the
// session, and the Design QA layout measurements in both themes.
const waitBoot = async () => { for (let i = 0; i < 25; i++) { try { if (await ev(`!!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const reload = async (ms) => { await ev(`location.reload(); true`); await sleep(500); await waitBoot(); await sleep(ms || 4000); await ev(`loadRoute('5w'); true`); await sleep(600); }; // Beta 1.76: a reload lands on the route menu - load 5W (works with the map dead; GLP catches up via onStyleReady)
const noteVisible = async () => ev(`!document.getElementById('mapNote').classList.contains('hidden')`);
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 12000)) { if (await fn()) return true; await sleep(300); } return false; };
const rects = async () => ev(`(function(){ const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, btm: b.bottom }; }; return { note: r('mapNote'), gear: r('tabBar'), info: r('info'), vw: window.innerWidth, vh: window.innerHeight }; })()`);
const overlaps = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.btm && b.y < a.btm;

try {
  await ev(`localStorage.clear(); true`);
  // Phase A: total failure from a cold start.
  failTiles = true;
  await reload(4000);
  ok('A1 notice shows when the basemap can never draw (tile hosts dead)', await until(noteVisible, 18000));
  ok('A2 notice text explains streets still work', await ev(`/still work/.test(document.querySelector('#mapNote span').textContent)`));
  ok('A3 basemap death recorded (the embedded style loads, but no tile ever arrives)', await until(async () => await ev(`typeof basemapDead !== 'undefined' && basemapDead === true`), 15000));
  ok('A4 streets list still renders with no map (34 rows)', await ev(`document.querySelectorAll('#streetList .srow').length === 34`));
  await ev(`togglePiece('Velmar', 0, 0); true`); await sleep(600);
  ok('A5 marking still works on the dead map', await ev(`pieces.Velmar[0] === 1`));
  let R1 = await rects();
  ok('A6 layout (day): notice fully in viewport', R1.note && R1.note.x >= 0 && R1.note.y >= 0 && R1.note.r <= R1.vw && R1.note.btm <= R1.vh);
  ok('A7 layout (day): notice does not overlap the tab bar | note ' + JSON.stringify(R1.note) + ' gear ' + JSON.stringify(R1.gear), !overlaps(R1.note, R1.gear));
  ok('A8 layout (day): dismiss button is a full-size tap target', await ev(`document.getElementById('mapNoteNo').getBoundingClientRect().height >= 44`));

  // Phase C: recovery - tiles come back, notice clears itself (no dismiss).
  failTiles = false;
  await ev(`setBasemap(); true`);
  // waits-hardening: recovery re-fetches the whole style + tiles; on a slow runner that
  // outruns the 12s default this helper carries (the death direction already budgets 18s).
  ok('C1 first successful GL load auto-hides the notice', await until(async () => await ev(`glOk === true`) && !(await noteVisible()), 30000));

  // Phase B: failure again after reload; dismissal sticks while still dead.
  failTiles = true;
  await reload(4000);
  ok('B1 notice shows again on a fresh dead boot', await until(noteVisible, 18000));
  await ev(`document.getElementById('mapNoteNo').click(); true`); await sleep(400);
  ok('B2 dismiss hides the notice', !(await noteVisible()));
  await ev(`setBasemap(); true`); await sleep(2500);
  ok('B3 dismissal sticks while the map stays dead', !(await noteVisible()) && await ev(`typeof basemapDead !== 'undefined' && basemapDead === true`));

  // Phase D: healthy boot, night theme - notice stays away; forced layout check at night.
  failTiles = false;
  await reload(2500);
  ok('D1 healthy boot: no notice', await until(async () => await ev(`glOk === true`), 20000) && !(await noteVisible()));
  await ev(`document.getElementById('nightBtn').click(); true`);
  ok('D2 night basemap loads, still no notice', await until(async () => await ev(`isNight() === true && glOk === true && !!map.getSource('centres')`), 20000) && !(await noteVisible()));
  failTiles = true;
  await reload(4000);   // night persists across reload (stored), so this boots night-themed on a dead map
  ok('D3 notice appears in night theme', await ev(`isNight() === true`) && await until(noteVisible, 18000));
  let R2 = await rects();
  ok('D4 layout (night): notice fully in viewport', R2.note && R2.note.h > 40 && R2.note.x >= 0 && R2.note.y >= 0 && R2.note.r <= R2.vw && R2.note.btm <= R2.vh);
  ok('D5 layout (night): notice does not overlap the tab bar | note ' + JSON.stringify(R2.note) + ' gear ' + JSON.stringify(R2.gear), !overlaps(R2.note, R2.gear));
  await ev(`document.getElementById('mapNoteNo').click(); true`); await sleep(300);
  ok('D6 night dismiss works', !(await noteVisible()));
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
console.log(JSON.stringify(R, null, 1));
// Explicit exit: open CDP/Chrome handles otherwise keep the process alive
// after results print (drive113 lesson, 2026-10-28).
process.exit(0);
