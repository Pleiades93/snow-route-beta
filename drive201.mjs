import { launchDrive, finish, bootThrough, tapSelector } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive201 (SESSION tier): Beta 1.218 - the icon-pack picker (TESTING ONLY).
// Andrew's acceptance, proven live in the rendered app:
//  - the section stands in Settings (On-the-job pane) with THREE pack rows - Pulsar Color,
//    Original, Glyph Neue (Andrew's third pack, added 2026-11-16) - the active row carrying
//    the green CURRENT pill; default = pulsar (the shipped 1.217 look, now the gradient set);
//  - tapping a row accordion-expands a preview strip under it (the other strip closes): a
//    mini home screen built from that pack's REAL assets - moon chip top-right, centre chip
//    directly under it, dock row (Streets, START, Pace), tab bar (Locate, Routes, Home,
//    Clear, Settings) - with Locate shown in its RECORDING (green) face, the approved
//    caption, and a full-width Use button ("In use" on the current pack). The strip's own
//    contents never overflow its box (measured in the rendered page, both themes);
//  - "Use this pack" is SEAMLESS (Andrew, explicit): a marker planted on window survives
//    (no reload), every icon host re-stamps to the other pack and back, the Settings pane
//    stays open on the picker with its scroll kept, the map does not move, and the choice
//    persists (a reload keeps it);
//  - the Locate state colours hold for ALL THREE packs in both themes - viewing RED
//    (day #D92C1E / night #FF6B5E), recording GREEN #06D6A0, off = the pack's normal face -
//    and the pulsar artwork is identical day and night (the gradient rule) while the glyph
//    artwork flips black/white;
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
  for (const k of Object.keys(PULSAR_ICONS)) { out['p_' + k + '_d'] = PULSAR_ICONS[k].d; out['p_' + k + '_n'] = PULSAR_ICONS[k].n; out['g_' + k + '_d'] = GLYPH_ICONS[k].d; out['g_' + k + '_n'] = GLYPH_ICONS[k].n; }
  out.p_vd = PULSAR_GPS_STATES.vd; out.p_vn = PULSAR_GPS_STATES.vn; out.p_rd = PULSAR_GPS_STATES.rd; out.p_rn = PULSAR_GPS_STATES.rn;
  out.g_vd = GLYPH_GPS_STATES.vd; out.g_vn = GLYPH_GPS_STATES.vn; out.g_rd = GLYPH_GPS_STATES.rd; out.g_rn = GLYPH_GPS_STATES.rn;
  return out;
})()`);
const setGps = async (on, rec) => { await ev(`(() => { const b = document.getElementById('gpsBtn'); b.classList.toggle('on', ${on}); b.classList.toggle('rec', ${rec}); renderIcons(); return true; })()`); };
const gpsFace = () => J(`(() => {
  const b = document.getElementById('gpsBtn');
  const img = b.querySelector('.tabIco img');
  return { label: getComputedStyle(b).color, img: img ? img.getAttribute('src') : null, svg: !!b.querySelector('.tabIco svg') };
})()`);

// ---------- P: the section stands, default pulsar, three rows ----------
await openJobPane();
let st = await pkState();
ok('P1: the section label reads ICON PACK - TESTING ONLY', /ICON PACK/.test(st.label || '') && /TESTING ONLY/.test(st.label || ''));
ok('P2: three rows in order pulsar / original / glyph, CURRENT on pulsar, the note stands',
  st.rows.length === 3 && st.rows[0].id === 'pulsar' && st.rows[1].id === 'original' && st.rows[2].id === 'glyph' && st.rows[0].cur && !st.rows[1].cur && !st.rows[2].cur && st.note === true);
ok('P3: the default pack is pulsar and nothing is stored yet', st.active === 'pulsar' && st.stored === null);

// ---------- X: preview strips from the real assets, accordion ----------
let h0 = await hosts();
const pk = await PK();
ok('X1: hosts open on pulsar artwork (gps off = the gradient Locate)', h0.gpsImg === pk.p_gps_d);
await tapSelector(ev, '.pkRow[data-pkrow="pulsar"]'); await sleep(200);
st = await pkState();
ok('X2: tapping the pulsar row expands its strip (9 images, no svg), Use reads In use',
  st.rows[0].stripOpen && st.rows[0].imgs === 9 && st.rows[0].svgs === 0 && /In use/.test(st.rows[0].useLabel || ''));
let g = await stripGeom();
ok('X3: the strip geometry holds (centre under the moon chip, dock then tab bar, no overflow)',
  !!g && g.centreUnder && g.moonRight && g.barBelow && !g.overflowX);
const stripGps = await ev(`(() => { const i = document.querySelector('.pkPack.open .pkTab .pkTabIc img'); return i ? i.getAttribute('src') : null; })()`);
ok('X4: the strip shows Locate in its RECORDING face (the green-rim gradient artwork)', stripGps === pk.p_rd);
const cap = await ev(`(() => (document.querySelector('.pkCap') || {}).textContent || '')()`);
ok('X5: the approved caption stands under the strip', cap.includes('Locate is shown green') && cap.includes('Just viewing is red.'));
await tapSelector(ev, '.pkRow[data-pkrow="original"]'); await sleep(200);
st = await pkState();
ok('X6: accordion - opening Original closes Pulsar; the Original strip is Pack D svg (9)',
  !st.rows[0].stripOpen && st.rows[1].stripOpen && st.rows[1].svgs === 9 && st.rows[1].imgs === 0);
g = await stripGeom();
ok('X7: the Original strip geometry holds too', !!g && g.centreUnder && !g.overflowX);
await tapSelector(ev, '.pkRow[data-pkrow="glyph"]'); await sleep(200);
st = await pkState();
ok('X8: accordion - opening Glyph closes Original; the Glyph strip is 9 solid-fill images',
  !st.rows[1].stripOpen && st.rows[2].stripOpen && st.rows[2].imgs === 9 && st.rows[2].svgs === 0);
const gStripGps = await ev(`(() => { const i = document.querySelector('.pkPack.open .pkTab .pkTabIc img'); return i ? i.getAttribute('src') : null; })()`);
ok('X9: the Glyph strip Locate is the green recording fill', gStripGps === pk.g_rd);
g = await stripGeom();
ok('X10: the Glyph strip geometry holds too', !!g && g.centreUnder && !g.overflowX);

// ---------- S: the seamless switch to Original (Andrew's acceptance) ----------
await ev(`(() => { window.__pkMark = 'still-here'; document.getElementById('setMenu').scrollTop = 120; return true; })()`); // #setMenu is the scroller (overflow-y auto) - the pane itself never scrolls
const scrollBefore = await ev(`(() => document.getElementById('setMenu').scrollTop)()`);
await poll(`(() => !map.isMoving() && !map.isZooming())()`, 15000); // bootThrough's route flight must settle before the centre means anything
const mapC = await ev(`(() => JSON.stringify(map.getCenter()) + '@' + map.getZoom())()`);
await tapSelector(ev, '.pkRow[data-pkrow="original"]'); await sleep(150);
await tapSelector(ev, '.pkUse[data-pkuse="original"]'); await sleep(250);
st = await pkState();
const alive = await J(`(() => ({ mark: window.__pkMark, sheet: document.getElementById('setMenu').classList.contains('open'), pane: document.getElementById('setJobPane').classList.contains('on'), scroll: document.getElementById('setMenu').scrollTop }))()`);
const mapC2 = await ev(`(() => JSON.stringify(map.getCenter()) + '@' + map.getZoom())()`);
ok('S1: NO reload - the window marker survives the switch', alive.mark === 'still-here');
ok('S2: the Settings pane stays open on the picker, scroll kept', alive.sheet === true && alive.pane === true && scrollBefore > 0 && alive.scroll === scrollBefore);
ok('S3: the map position is untouched', mapC === mapC2);
ok('S4: the choice is stored and CURRENT moved to Original', st.stored === 'original' && st.active === 'original' && st.rows[1].cur && !st.rows[0].cur);
let h1 = await hosts();
ok('S5: every host re-stamped to Pack D (tab bar all svg, no pico images anywhere)',
  Object.values(h1.tab).every(x => x.includes('<svg')) && !h1.night.includes('<img') && !h1.pace.includes('<img') && h1.gpsImg === null);
ok('S6: the hosts actually CHANGED (no host kept the pulsar stamp)', Object.keys(h0.tab).every(k => h1.tab[k] !== h0.tab[k]) && h1.night !== h0.night);

// ---------- B: and back to Pulsar, still seamless ----------
await tapSelector(ev, '.pkRow[data-pkrow="pulsar"]'); await sleep(150);
await tapSelector(ev, '.pkUse[data-pkuse="pulsar"]'); await sleep(250);
st = await pkState(); const h2 = await hosts();
ok('B1: switching back re-stamps every host to pulsar and the marker still lives',
  st.active === 'pulsar' && h2.gpsImg === pk.p_gps_d && h2.tab.gpsBtn === h0.tab.gpsBtn && (await ev(`(() => window.__pkMark)()`)) === 'still-here');
const dims = await J(`(() => ({ bar: document.getElementById('tabBar').offsetHeight, slot: document.querySelector('#gpsBtn .tabIco').offsetHeight }))()`);
ok('B2: sizes unmoved under pulsar - bar 51px, slot 27px', dims.bar === 51 && dims.slot === 27);

// ---------- Y: the Glyph pack, seamless + its own day/night faces ----------
await tapSelector(ev, '.pkRow[data-pkrow="glyph"]'); await sleep(150);
await tapSelector(ev, '.pkUse[data-pkuse="glyph"]'); await sleep(250);
st = await pkState(); const h3 = await hosts();
ok('Y1: the Glyph switch is seamless too - marker alive, stored glyph, CURRENT on Glyph, hosts on the black day fills',
  (await ev(`(() => window.__pkMark)()`)) === 'still-here' && st.stored === 'glyph' && st.active === 'glyph' && st.rows[2].cur && h3.gpsImg === pk.g_gps_d && h3.homeImg === pk.g_home_d && h3.streetsImg === pk.g_streets_d);
await ev(`(() => { setThemeOverride(true); applyNight(); return true; })()`);
let gf = await gpsFace();
ok('Y2: glyph at night - the faces flip to the WHITE fills (gps off = white navigation)', gf.img === pk.g_gps_n && (await hosts()).homeImg === pk.g_home_n);
await setGps(true, false); gf = await gpsFace();
ok('Y3: glyph night viewing - solid light-red fill + light-red label', gf.img === pk.g_vn && gf.label === 'rgb(255, 107, 94)');
await setGps(true, true); gf = await gpsFace();
ok('Y4: glyph night recording - solid green fill + green label', gf.img === pk.g_rn && gf.label === 'rgb(6, 214, 160)');
await setGps(false, false);
await ev(`(() => { setThemeOverride(false); applyNight(); return true; })()`);
await setGps(true, false); const gv = await gpsFace();
await setGps(true, true); const gr = await gpsFace();
await setGps(false, false);
ok('Y5: glyph day viewing/recording fills + labels', gv.img === pk.g_vd && gv.label === 'rgb(217, 44, 30)' && gr.img === pk.g_rd && gr.label === 'rgb(6, 214, 160)');
await ev(`(() => { useIconPack('pulsar'); return true; })()`);

// ---------- D: Locate colours, pulsar (day) ----------
await setGps(false, false); let f = await gpsFace();
ok('D1: pulsar day off - the gradient Locate', f.img === pk.p_gps_d);
await setGps(true, false); f = await gpsFace();
ok('D2: pulsar day viewing - RED artwork + red label', f.img === pk.p_vd && f.label === 'rgb(217, 44, 30)');
await setGps(true, true); f = await gpsFace();
ok('D3: pulsar day recording - GREEN artwork + green label (green wins over viewing)', f.img === pk.p_rd && f.label === 'rgb(6, 214, 160)');
await setGps(false, false);
ok('D4: pulsar day and night artwork are IDENTICAL (the gradient rule)', pk.p_home_d === pk.p_home_n && pk.p_gps_d === pk.p_gps_n && pk.p_moon_d === pk.p_moon_n);

// ---------- O: Locate colours, original (day) ----------
await ev(`(() => { useIconPack('original'); return true; })()`);
await setGps(true, false); f = await gpsFace();
ok('O1: original day viewing - Pack D svg face, RED label (the icon follows via currentColor)', f.svg === true && f.label === 'rgb(217, 44, 30)');
await setGps(true, true); f = await gpsFace();
ok('O2: original day recording - GREEN label', f.svg === true && f.label === 'rgb(6, 214, 160)');
await setGps(false, false);
const otherTab = await ev(`(() => { const b = document.getElementById('routesBtn'); b.classList.add('on'); const c = getComputedStyle(b).color; b.classList.remove('on'); return c; })()`);
ok('O3: the OTHER tabs keep the blue selected colour (the scoping rule)', otherTab === 'rgb(44, 74, 210)');

// ---------- N: night, pulsar + original ----------
await ev(`(() => { useIconPack('pulsar'); setThemeOverride(true); applyNight(); return true; })()`);
const hn = await hosts();
ok('N1: pulsar night hosts carry the SAME gradient artwork as day', hn.gpsImg === pk.p_gps_d && hn.homeImg === pk.p_home_d && hn.nightImg === pk.p_sun_d);
await setGps(true, false); f = await gpsFace();
ok('N2: pulsar night viewing - light-red artwork + light-red label', f.img === pk.p_vn && f.label === 'rgb(255, 107, 94)');
await setGps(true, true); f = await gpsFace();
ok('N3: pulsar night recording - green artwork + green label', f.img === pk.p_rn && f.label === 'rgb(6, 214, 160)');
await setGps(false, false);
await ev(`(() => { useIconPack('original'); return true; })()`);
await setGps(true, false); f = await gpsFace();
ok('N4: original night viewing - svg face, LIGHT-red label', f.svg === true && f.label === 'rgb(255, 107, 94)');
await setGps(true, true); f = await gpsFace();
ok('N5: original night recording - GREEN label', f.svg === true && f.label === 'rgb(6, 214, 160)');
await setGps(false, false);
const dimsN = await J(`(() => ({ bar: document.getElementById('tabBar').offsetHeight, slot: document.querySelector('#gpsBtn .tabIco').offsetHeight }))()`);
ok('N6: sizes unmoved at night under Original - bar 51px, slot 27px', dimsN.bar === 51 && dimsN.slot === 27);
await ev(`(() => { setThemeOverride(false); applyNight(); return true; })()`);

// ---------- R: persistence across a reload ----------
await ev(`(() => { location.reload(); return true; })()`);
await poll(`(() => typeof map !== 'undefined' && !!map && typeof ICONS !== 'undefined')()`, 30000);
await sleep(600);
st = await pkState();
ok('R1: the stored choice survives a reload (Original active)', st.stored === 'original' && st.active === 'original');
const hr = await hosts();
ok('R2: the reloaded app stamps Pack D hosts from boot', hr.gpsImg === null && hr.tab.gpsBtn.includes('<svg'));
await ev(`(() => { useIconPack('glyph'); return true; })()`);
await ev(`(() => { location.reload(); return true; })()`);
await poll(`(() => typeof map !== 'undefined' && !!map && typeof ICONS !== 'undefined')()`, 30000);
await sleep(600);
st = await pkState(); const hg = await hosts();
ok('R3: Glyph persists across a reload too (black day fills from boot)', st.active === 'glyph' && hg.gpsImg === pk.g_gps_d);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
ok('Z: zero page exceptions across the whole drive', R.exceptions.length === 0);
finish(R, proc);
