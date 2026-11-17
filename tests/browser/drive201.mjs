import { launchDrive, finish, bootThrough, tapSelector } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive201 (SESSION tier): Beta 1.218 - the icon-pack picker (TESTING ONLY); Beta 1.219
// retired Puffy; Beta 1.220 re-derivation: Andrew retired the Pulsar and Original packs
// too and imported Material Filled + Windows 10, so the picker stands at THREE packs -
// Glyph Neue (the DEFAULT), Material Filled, Windows 10 - all three monochrome mask
// packs. Every check stands at its earlier strength, re-pointed at the live roster.
// Andrew's acceptance, proven live in the rendered app:
//  - the section stands in Settings (On-the-job pane) with THREE pack rows - Glyph Neue,
//    Material Filled, Windows 10 - the active row carrying the green CURRENT pill;
//    default = glyph (fresh installs start on Glyph; nothing stored);
//  - tapping a row accordion-expands a preview strip under it (the other strip closes):
//    a mini home screen built from that pack's REAL assets - moon chip top-right, centre
//    chip directly under it, dock row (Streets, START, Pace), tab bar (Locate, Routes,
//    Home, Clear, Settings) - with Locate shown in its RECORDING (green) face, the
//    approved caption, and a full-width Use button ("In use" on the current pack). The
//    strip's own contents never overflow its box (measured in the rendered page);
//  - "Use this pack" is SEAMLESS (Andrew, explicit): a marker planted on window survives
//    (no reload), every icon host re-stamps to the other pack and back, the Settings
//    pane stays open on the picker with its scroll kept, the map does not move, and the
//    choice persists (a reload keeps it);
//  - the Locate state colours hold for ALL THREE packs in both themes - viewing RED
//    (day #D92C1E / night #FF6B5E), recording GREEN #06D6A0, off = the pack's normal
//    face - and every pack's artwork flips black (day) / white (night);
//  - a stored retired id ('pulsar', 'original', 'puffy') boots cleanly onto Glyph;
//  - icon boxes and the tab bar do not move: 27px .tabIco slot, 51px bar, under every pack.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const openJobPane = async () => { await ev(`(() => { showSetPane('setMainPane'); document.getElementById('setMenu').classList.add('open'); renderJob(); showSetPane('setJobPane'); return true; })()`); await sleep(200); }; // the app's own doors: setBtn opens #setMenu on the main pane, jobBtn lands on setJobPane
const pkState = () => J(`(() => {
  const card = document.getElementById('pkCard');
  const rows = [...card.querySelectorAll('.pkPack')].map(w => ({
    id: w.querySelector('.pkRow').dataset.pkrow, cur: !!w.querySelector('.pkCur'),
    stripOpen: !!w.querySelector('.pkStrip'), useLabel: (w.querySelector('.pkUse') || {}).textContent || null,
    imgs: w.querySelectorAll('.pkStrip img').length, svgs: w.querySelectorAll('.pkStrip svg').length,
  }));
  const lbl = [...document.querySelectorAll('#setJobPane .m-secLbl')].map(e => e.textContent).find(t => /ICON PACK/.test(t)) || null;
  return { active: iconPackId(), stored: lsGet(LS.iconpack), rows, label: lbl, note: !!document.querySelector('#setJobPane .pkNote') };
})()`);
const stripGeom = () => J(`(() => {
  const strip = document.querySelector('.pkStrip'); if (!strip) return null;
  const sr = strip.getBoundingClientRect();
  const chips = strip.querySelectorAll('.pkChip'); const moon = chips[0], centre = chips[1];
  const mr = moon.getBoundingClientRect(), cr = centre.getBoundingClientRect();
  const dock = strip.querySelector('.pkDockRow').getBoundingClientRect();
  const bar = strip.querySelector('.pkTabs').getBoundingClientRect();
  const kids = [...strip.querySelectorAll('*')].map(e => e.getBoundingClientRect());
  const overflowX = kids.some(r => r.right > sr.right + 1 || r.left < sr.left - 1);
  return { centreUnder: Math.abs(cr.left - mr.left) < 2 && cr.top >= mr.bottom - 1, moonRight: Math.abs(mr.right - (sr.right - 8)) < 3, barBelow: bar.top >= dock.bottom - 1, overflowX }; // the chips float at the scene's top-right (like the app) - the dock row shares their band, the tab bar closes the scene below it
})()`);
const hosts = () => J(`(() => {
  const tab = {}; document.querySelectorAll('#tabBar .tabItem').forEach(t => { const k = t.querySelector('.tabIco'); tab[t.id] = k ? k.innerHTML : ''; });
  const img = (sel) => { const i = document.querySelector(sel); return i ? i.getAttribute('src') : null; };
  return {
    tab,
    night: document.querySelector('#nightBtn').innerHTML,
    pace: document.querySelector('#paceBtn').innerHTML,
    gpsImg: img('#gpsBtn .tabIco img'), homeImg: img('#homeBtn .tabIco img'),
    streetsImg: img('#streetsBtn img'), nightImg: img('#nightBtn img'),
  };
})()`);
const PK = () => J(`(() => {
  const out = {};
  for (const [p, M] of [['g', GLYPH_ICONS], ['m', MAT_ICONS], ['w', WIN10_ICONS]]) for (const k of Object.keys(M)) { out[p + '_' + k + '_d'] = M[k].d; out[p + '_' + k + '_n'] = M[k].n; }
  for (const [p, S] of [['g', GLYPH_GPS_STATES], ['m', MAT_GPS_STATES], ['w', WIN10_GPS_STATES]]) { out[p + '_vd'] = S.vd; out[p + '_vn'] = S.vn; out[p + '_rd'] = S.rd; out[p + '_rn'] = S.rn; }
  return out;
})()`);
const setGps = async (on, rec) => { await ev(`(() => { const b = document.getElementById('gpsBtn'); b.classList.toggle('on', ${on}); b.classList.toggle('rec', ${rec}); renderIcons(); return true; })()`); };
const gpsFace = () => J(`(() => {
  const b = document.getElementById('gpsBtn');
  const img = b.querySelector('.tabIco img');
  return { label: getComputedStyle(b).color, img: img ? img.getAttribute('src') : null, svg: !!b.querySelector('.tabIco svg') };
})()`);

// ---------- P: the section stands, default glyph, three rows ----------
await openJobPane();
let st = await pkState();
ok('P1: the section label reads ICON PACK - TESTING ONLY', /ICON PACK/.test(st.label || '') && /TESTING ONLY/.test(st.label || ''));
ok('P2: three rows in order glyph / material / win10, CURRENT on glyph, the note stands',
  st.rows.length === 3 && st.rows[0].id === 'glyph' && st.rows[1].id === 'material' && st.rows[2].id === 'win10' && st.rows[0].cur && !st.rows[1].cur && !st.rows[2].cur && st.note === true);
ok('P3: the default pack is glyph and nothing is stored yet', st.active === 'glyph' && st.stored === null);
const retired = await J(`(() => ({ pulsar: typeof PULSAR_ICONS, packd: typeof PACKD_ICONS, puffy: typeof PUFFY_ICONS }))()`);
ok('P4: the retired packs are gone from the page (no PULSAR_ICONS, no PACKD_ICONS, no PUFFY_ICONS)', retired.pulsar === 'undefined' && retired.packd === 'undefined' && retired.puffy === 'undefined');

// ---------- X: preview strips from the real assets, accordion ----------
let h0 = await hosts();
const pk = await PK();
ok('X1: hosts open on glyph artwork (gps off = the black day fill)', h0.gpsImg === pk.g_gps_d);
await tapSelector(ev, '.pkRow[data-pkrow="glyph"]'); await sleep(200);
st = await pkState();
ok('X2: tapping the glyph row expands its strip (9 images, no svg), Use reads In use',
  st.rows[0].stripOpen && st.rows[0].imgs === 9 && st.rows[0].svgs === 0 && /In use/.test(st.rows[0].useLabel || ''));
let g = await stripGeom();
ok('X3: the strip geometry holds (centre under the moon chip, dock then tab bar, no overflow)',
  !!g && g.centreUnder && g.moonRight && g.barBelow && !g.overflowX);
const stripGps = await ev(`(() => { const i = document.querySelector('.pkPack.open .pkTab .pkTabIc img'); return i ? i.getAttribute('src') : null; })()`);
ok('X4: the strip shows Locate in its RECORDING face (the green glyph fill)', stripGps === pk.g_rd);
const cap = await ev(`(() => (document.querySelector('.pkCap') || {}).textContent || '')()`);
ok('X5: the approved caption stands under the strip', cap.includes('Locate is shown green') && cap.includes('Just viewing is red.'));
await tapSelector(ev, '.pkRow[data-pkrow="material"]'); await sleep(200);
st = await pkState();
ok('X6: accordion - opening Material closes Glyph; the Material strip is 9 images',
  !st.rows[0].stripOpen && st.rows[1].stripOpen && st.rows[1].imgs === 9 && st.rows[1].svgs === 0);
const mStripGps = await ev(`(() => { const i = document.querySelector('.pkPack.open .pkTab .pkTabIc img'); return i ? i.getAttribute('src') : null; })()`);
ok('X7: the Material strip Locate is its green recording fill', mStripGps === pk.m_rd);
g = await stripGeom();
ok('X8: the Material strip geometry holds too', !!g && g.centreUnder && !g.overflowX);
await tapSelector(ev, '.pkRow[data-pkrow="win10"]'); await sleep(200);
st = await pkState();
ok('X9: accordion - opening Windows 10 closes Material; its strip is 9 images',
  !st.rows[1].stripOpen && st.rows[2].stripOpen && st.rows[2].imgs === 9 && st.rows[2].svgs === 0);
const wStripGps = await ev(`(() => { const i = document.querySelector('.pkPack.open .pkTab .pkTabIc img'); return i ? i.getAttribute('src') : null; })()`);
ok('X10: the Windows 10 strip Locate is its green recording fill', wStripGps === pk.w_rd);
g = await stripGeom();
ok('X11: the Windows 10 strip geometry holds too', !!g && g.centreUnder && !g.overflowX);

// ---------- S: the seamless switch to Material (Andrew's acceptance) ----------
await ev(`(() => { window.__pkMark = 'still-here'; document.getElementById('setMenu').scrollTop = 120; return true; })()`); // #setMenu is the scroller (overflow-y auto) - the pane itself never scrolls
const scrollBefore = await ev(`(() => document.getElementById('setMenu').scrollTop)()`);
await poll(`(() => !map.isMoving() && !map.isZooming())()`, 15000); // bootThrough's route flight must settle before the centre means anything
const mapC = await ev(`(() => JSON.stringify(map.getCenter()) + '@' + map.getZoom())()`);
await tapSelector(ev, '.pkRow[data-pkrow="material"]'); await sleep(150);
await tapSelector(ev, '.pkUse[data-pkuse="material"]'); await sleep(250);
st = await pkState();
const alive = await J(`(() => ({ mark: window.__pkMark, sheet: document.getElementById('setMenu').classList.contains('open'), pane: document.getElementById('setJobPane').classList.contains('on'), scroll: document.getElementById('setMenu').scrollTop }))()`);
const mapC2 = await ev(`(() => JSON.stringify(map.getCenter()) + '@' + map.getZoom())()`);
ok('S1: NO reload - the window marker survives the switch', alive.mark === 'still-here');
ok('S2: the Settings pane stays open on the picker, scroll kept', alive.sheet === true && alive.pane === true && scrollBefore > 0 && Math.abs(alive.scroll - scrollBefore) <= 2); // 2px: the re-render can round the menu's fractional scroll offset by a pixel - the property is no jump, no reset
ok('S3: the map position is untouched', mapC === mapC2);
ok('S4: the choice is stored and CURRENT moved to Material', st.stored === 'material' && st.active === 'material' && st.rows[1].cur && !st.rows[0].cur);
let h1 = await hosts();
ok('S5: every host re-stamped to Material (all images, the day fills)',
  h1.gpsImg === pk.m_gps_d && h1.homeImg === pk.m_home_d && h1.streetsImg === pk.m_streets_d && h1.nightImg === pk.m_moon_d);
ok('S6: the hosts actually CHANGED (no host kept the glyph stamp)', Object.keys(h0.tab).every(k => h1.tab[k] !== h0.tab[k]) && h1.night !== h0.night);

// ---------- B: and back to Glyph, still seamless ----------
await tapSelector(ev, '.pkRow[data-pkrow="glyph"]'); await sleep(150);
await tapSelector(ev, '.pkUse[data-pkuse="glyph"]'); await sleep(250);
st = await pkState(); const h2 = await hosts();
ok('B1: switching back re-stamps every host to glyph and the marker still lives',
  st.active === 'glyph' && h2.gpsImg === pk.g_gps_d && h2.tab.gpsBtn === h0.tab.gpsBtn && (await ev(`(() => window.__pkMark)()`)) === 'still-here');
const dims = await J(`(() => ({ bar: document.getElementById('tabBar').offsetHeight, slot: document.querySelector('#gpsBtn .tabIco').offsetHeight }))()`);
ok('B2: sizes unmoved under glyph - bar 51px, slot 27px', dims.bar === 51 && dims.slot === 27);

// ---------- Y: the Windows 10 pack, seamless + its own day/night faces ----------
await tapSelector(ev, '.pkRow[data-pkrow="win10"]'); await sleep(150);
await tapSelector(ev, '.pkUse[data-pkuse="win10"]'); await sleep(250);
st = await pkState(); const h3 = await hosts();
ok('Y1: the Windows 10 switch is seamless too - marker alive, stored win10, CURRENT on Windows 10, hosts on the black day artwork',
  (await ev(`(() => window.__pkMark)()`)) === 'still-here' && st.stored === 'win10' && st.active === 'win10' && st.rows[2].cur && h3.gpsImg === pk.w_gps_d && h3.homeImg === pk.w_home_d && h3.streetsImg === pk.w_streets_d);
await ev(`(() => { setThemeOverride(true); applyNight(); return true; })()`);
let gf = await gpsFace();
ok('Y2: win10 at night - the faces flip to the WHITE artwork (gps off = white target)', gf.img === pk.w_gps_n && (await hosts()).homeImg === pk.w_home_n);
await setGps(true, false); gf = await gpsFace();
ok('Y3: win10 night viewing - light-red fill + light-red label', gf.img === pk.w_vn && gf.label === 'rgb(255, 107, 94)');
await setGps(true, true); gf = await gpsFace();
ok('Y4: win10 night recording - green fill + green label', gf.img === pk.w_rn && gf.label === 'rgb(6, 214, 160)');
await setGps(false, false);
await ev(`(() => { setThemeOverride(false); applyNight(); return true; })()`);
await setGps(true, false); const gv = await gpsFace();
await setGps(true, true); const gr = await gpsFace();
await setGps(false, false);
ok('Y5: win10 day viewing/recording fills + labels', gv.img === pk.w_vd && gv.label === 'rgb(217, 44, 30)' && gr.img === pk.w_rd && gr.label === 'rgb(6, 214, 160)');
await ev(`(() => { useIconPack('glyph'); return true; })()`);

// ---------- D: Locate colours, glyph (day) + the flip rule ----------
await setGps(false, false); let f = await gpsFace();
ok('D1: glyph day off - the black Locate fill', f.img === pk.g_gps_d);
await setGps(true, false); f = await gpsFace();
ok('D2: glyph day viewing - RED fill + red label', f.img === pk.g_vd && f.label === 'rgb(217, 44, 30)');
await setGps(true, true); f = await gpsFace();
ok('D3: glyph day recording - GREEN fill + green label (green wins over viewing)', f.img === pk.g_rd && f.label === 'rgb(6, 214, 160)');
await setGps(false, false);
ok('D4: every pack artwork flips day to night (black by day, white by night)', pk.g_home_d !== pk.g_home_n && pk.m_home_d !== pk.m_home_n && pk.w_home_d !== pk.w_home_n && pk.g_gps_d !== pk.g_gps_n);
const otherTab = await ev(`(() => { const b = document.getElementById('routesBtn'); b.classList.add('on'); const c = getComputedStyle(b).color; b.classList.remove('on'); return c; })()`);
ok('D5: the OTHER tabs keep the blue selected colour (the scoping rule)', otherTab === 'rgb(44, 74, 210)');

// ---------- M: Locate colours, material (day + night) ----------
await ev(`(() => { useIconPack('material'); return true; })()`);
await setGps(true, false); f = await gpsFace();
ok('M1: material day viewing - RED fill + red label', f.img === pk.m_vd && f.label === 'rgb(217, 44, 30)');
await setGps(true, true); f = await gpsFace();
ok('M2: material day recording - GREEN fill + green label', f.img === pk.m_rd && f.label === 'rgb(6, 214, 160)');
await setGps(false, false);
await ev(`(() => { setThemeOverride(true); applyNight(); return true; })()`);
await setGps(true, false); f = await gpsFace();
ok('M3: material night viewing - light-red fill + light-red label', f.img === pk.m_vn && f.label === 'rgb(255, 107, 94)');
await setGps(true, true); f = await gpsFace();
ok('M4: material night recording - green fill + green label', f.img === pk.m_rn && f.label === 'rgb(6, 214, 160)');
await setGps(false, false);
const dimsN = await J(`(() => ({ bar: document.getElementById('tabBar').offsetHeight, slot: document.querySelector('#gpsBtn .tabIco').offsetHeight }))()`);
ok('M5: sizes unmoved at night under Material - bar 51px, slot 27px', dimsN.bar === 51 && dimsN.slot === 27);
await ev(`(() => { setThemeOverride(false); applyNight(); return true; })()`);

// ---------- R: persistence across a reload + the retired-id fallbacks ----------
await ev(`(() => { location.reload(); return true; })()`);
await poll(`(() => typeof map !== 'undefined' && !!map && typeof ICONS !== 'undefined')()`, 30000);
await sleep(600);
st = await pkState();
ok('R1: the stored choice survives a reload (Material active)', st.stored === 'material' && st.active === 'material');
const hr = await hosts();
ok('R2: the reloaded app stamps Material hosts from boot', hr.gpsImg === pk.m_gps_d);
for (const dead of ['pulsar', 'original', 'puffy']) {
  await ev(`(() => { lsSet(LS.iconpack, '${dead}'); location.reload(); return true; })()`);
  await poll(`(() => typeof map !== 'undefined' && !!map && typeof ICONS !== 'undefined')()`, 30000);
  await sleep(600);
  st = await pkState(); const hd = await hosts();
  ok(`R3-${dead}: a stored '${dead}' boots cleanly onto Glyph (the default), hosts on the glyph fills`, st.active === 'glyph' && hd.gpsImg === pk.g_gps_d);
}
await ev(`(() => { useIconPack('glyph'); return true; })()`);
await ev(`(() => { location.reload(); return true; })()`);
await poll(`(() => typeof map !== 'undefined' && !!map && typeof ICONS !== 'undefined')()`, 30000);
await sleep(600);
st = await pkState(); const hg = await hosts();
ok('R4: Glyph persists across a reload too (black day fills from boot)', st.active === 'glyph' && hg.gpsImg === pk.g_gps_d);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
ok('Z: zero page exceptions across the whole drive', R.exceptions.length === 0);
finish(R, proc);
