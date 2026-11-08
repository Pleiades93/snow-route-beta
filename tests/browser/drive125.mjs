import { launchDrive, finish, bootThrough } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs'; // premise derivation (Tranche 4 / T2, 2026-11-08): expectations about the shipped world derive from source - see pack-expect.mjs
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive118: audit remediation regression suite (spec 2026-10-29). Covers the gaps the older drives do not:
// invalid coverage indexes (F-2), invalid GPS fixes (G-1), coverage suggestion behaviour incl. parallel
// streets (spec GPS), restore write failure + rollback (suite 5), failed rollback verification (suite 6),
// invalid nested history (suite 3), current-format backup round-trip (suite 1), failed history write at
// finish (suite 11), partial multi-key save consistency (suite 12).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
await sleep(3000);

// drive120 (Stage 2, v1.0 plan): visual-geometry regression for the beta's CURRENT UI shapes.
// Every check measures the FAILURE property directly (overflow, overlap, out-of-bounds) in the
// rendered page at phone size, in both themes - never a proxy like a radius or a class name.
const RECTS = (sel) => `(() => [...document.querySelectorAll('${sel}')].filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }))()`;
const overlaps = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;
const inView = (r) => r.x >= -1 && r.y >= -1 && r.r <= 421 && r.b <= 901;
const noOverlap = (rs) => rs.every((a, i) => rs.every((b, j) => i === j || !overlaps(a, b)));
let A;

ok('S0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// Beta 1.22 (Andrew's phone round): one-word green Start; count as "N of 34 - P%";
// a dead strip under the dock so the iPhone home swipe cannot drag the map;
// the header slab is transparent so the map runs full-screen at the top too.
// Beta 1.42: the start-up splash overlays the first seconds by design - hit-test
// probes (elementFromPoint) must wait until it has removed itself, or they measure
// the splash instead of the app. (drive132 owns the splash's own checks.)
await poll120(`!document.getElementById('splash')`, 20000);
const S22 = JSON.parse(await ev(`(() => { const sb = $('startBtn'); const cs = getComputedStyle(sb);
  const strip = $('tabBar'); const sr = strip.getBoundingClientRect(); const br = sb.getBoundingClientRect();
  const atBottom = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 3);
  const atStart = document.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2);
  return JSON.stringify({ label: sb.textContent.trim(), bg: cs.backgroundColor, count: $('count').textContent,
    hudBg: getComputedStyle($('hud')).backgroundColor,
    strip: { x: sr.x, w: sr.width, top: sr.top, bottom: sr.bottom }, startB: br.bottom,
    atBottom: atBottom && (atBottom.id || (atBottom.closest('#tabBar') ? 'tabBar' : '')), atStart: atStart && atStart.id, color: cs.color, vw: window.innerWidth, vh: window.innerHeight }); })()`));
ok('S1 Start button: splash-blue circle, white START word (Beta 1.75) | ' + JSON.stringify(S22), S22.label === 'START' && S22.bg === 'rgb(43, 75, 242)' && S22.color === 'rgb(255, 255, 255)');
ok('S2 count reads "0 of 34 · 0%" (no "completed") | ' + S22.count, S22.count === '0 of ' + PACK5W.names + ' · 0%');
ok('S3 header slab is transparent (map full-screen at the top)', S22.hudBg === 'rgba(0, 0, 0, 0)');
ok('S4 tab bar spans the bottom edge and takes the touch there (the old dead-strip job), dock clear above it | ' + JSON.stringify(S22),
  S22.strip.x === 0 && S22.strip.w === S22.vw && Math.abs(S22.strip.bottom - S22.vh) <= 1 && S22.startB <= S22.strip.top + 1 && S22.atBottom === 'tabBar' && S22.atStart === 'startBtn');

// T (Beta 1.29, Andrew): menus are ONE family - the Streets/Pace sheets, the bottom
// bar and the Settings pop-up share a surface in each theme; day is light glass with
// dark text (never white-on-white over the bright map), night is a deep blue-black.
const T1 = JSON.parse(await ev(`(() => { const surf = el => getComputedStyle(el).backgroundColor; return JSON.stringify({
  sheetBg: surf($('sheet')), sheetCol: getComputedStyle($('sheet')).color, paceBg: surf($('pacePanel')),
  barBg: surf($('tabBar')), fillW: $('countFill').offsetWidth,
  order: [...document.querySelectorAll('#tabBar .tabItem')].map(b => b.id) }); })()`));
ok('T1 day menus share one light surface with dark text (bar = sheets; the Settings takeover is blue in both themes since 1.88, asserted at T3) | ' + JSON.stringify(T1),
  T1.sheetBg === 'rgba(255, 255, 255, 0.92)' && T1.sheetCol === 'rgb(28, 37, 52)' && T1.paceBg === T1.sheetBg && T1.barBg === T1.sheetBg);
ok('T2 tab order: Locate, Routes, Home dead centre, Clear, Settings (Beta 1.88: Day/Night is a floating button, not a tab) | ' + JSON.stringify(T1.order),
  JSON.stringify(T1.order) === JSON.stringify(['gpsBtn', 'routesBtn', 'homeBtn', 'clearBtn', 'setBtn']));
ok('T3 the meter starts empty | fillW ' + T1.fillW, T1.fillW === 0);
await ev(`(() => { $('setBtn').click(); return true; })()`); await sleep(600);
const T3b = JSON.parse(await ev(`(() => JSON.stringify({ open: $('setMenu').classList.contains('open'), bg: getComputedStyle($('setMenu')).backgroundColor,
  rows: [...document.querySelectorAll('#setMainPane .rmBtn')].map(b => b.id), ver: $('setVer').textContent, titleVer: $('ver').textContent,
  chipOut: !$('setMenu').contains($('nightBtn')), chipW: $('nightBtn').offsetWidth, paceW: $('paceBtn').offsetWidth }))()`));
ok('T3 Settings rises as the blue takeover: Status / On the job / Backup / About-What\'s new on the main pane (Beta 1.111 redesign - Update moved into About, offline maps into Status), the version riding bottom-right synced from the title, Day/Night out of the menu - its own button now, exactly Pace-sized (Beta 1.88) | ' + JSON.stringify(T3b),
  T3b.open === true && T3b.bg === 'rgb(43, 75, 242)' && JSON.stringify(T3b.rows) === JSON.stringify(['stBtn', 'jobBtn', 'exportBtn', 'aboutBtn']) && T3b.ver === T3b.titleVer && T3b.ver.length > 0 && T3b.chipOut && T3b.chipW === 56 && T3b.chipW === T3b.paceW);
await ev(`(() => { $('setClose').click(); return true; })()`); await sleep(600);
ok('T3 the bare X closes the Settings takeover', await ev(`$('setMenu').classList.contains('open')`) === false);
await ev(`(() => { $('setBtn').click(); return true; })()`); await sleep(500);
await ev(`(() => { $('exportBtn').click(); return true; })()`); await sleep(500);
const T3c1 = JSON.parse(await ev(`(() => JSON.stringify({ opts: [...document.querySelectorAll('#xOpts .bkBtn')].map(b => b.textContent), groupShown: $('xOpts').style.display !== 'none', title: $('xTitle').textContent }))()`));
await ev(`(() => { $('xRes').click(); return true; })()`); await sleep(300);
const T3c2 = JSON.parse(await ev(`(() => JSON.stringify({ opts: [...document.querySelectorAll('#xRestoreOpts .bkBtn')].map(b => b.textContent), title: $('xTitle').textContent }))()`));
await ev(`(() => { $('xImpText').click(); return true; })()`); await sleep(300);
const T3c3 = JSON.parse(await ev(`(() => JSON.stringify({ title: $('xTitle').textContent, box: $('xText').style.display !== 'none', imp: $('xImp').style.display !== 'none' }))()`));
await ev(`(() => { $('setBack').click(); return true; })()`); await sleep(300);
const T3c4 = JSON.parse(await ev(`(() => JSON.stringify({ title: $('xTitle').textContent }))()`));
await ev(`(() => { $('setBack').click(); return true; })()`); await sleep(300);
const T3c5 = JSON.parse(await ev(`(() => JSON.stringify({ title: $('xTitle').textContent }))()`));
// Beta 1.96 (Andrew): the Recovery option LEFT this menu in this round - ONE Backup button
// remains, and the recovery export is its automatic fallback when saving fails (drive136 F12
// pins the fallback).
ok('T3c the backup pane is a menu tree exactly as specced (Beta 1.89; the recovery option added Beta 1.95, SR-194-02; Beta 1.111 slimmed the menu to its two export options - Download offline maps moved to Status): Restore opens Import JSON / Import Text, Import Text opens the box with Import backup under it, Back walks up one level at a time | ' + JSON.stringify({ T3c1, T3c2, T3c3, T3c4, T3c5 }),
  JSON.stringify(T3c1.opts) === JSON.stringify(['Backup (JSON)', 'Restore backup'])&& T3c1.groupShown && T3c1.title === 'Backup' &&
  JSON.stringify(T3c2.opts) === JSON.stringify(['Import JSON', 'Import Text']) && T3c2.title === 'Restore' &&
  T3c3.title === 'Import Text' && T3c3.box && T3c3.imp && T3c4.title === 'Restore' && T3c5.title === 'Backup');
await ev(`(() => { $('setClose').click(); return true; })()`); await sleep(400);

// F03 (Beta 1.92, deep audit): restore feedback must be VISIBLE from inside
// the Settings takeover it was launched from.
await ev(`(() => { $('setBtn').click(); return true; })()`); await sleep(500);
await ev(`(() => { $('exportBtn').click(); return true; })()`); await sleep(400);
await ev(`(() => { document.getElementById('xText').value = 'not json'; doRestore(); return true; })()`); await sleep(300);
const F03 = JSON.parse(await ev(`(() => { const t = $('toast'); return JSON.stringify({ show: t.classList.contains('show'), z: +getComputedStyle(t).zIndex, menuZ: +getComputedStyle($('setMenu')).zIndex, txt: t.textContent }); })()`));
ok('F03 a restore rejection is visible from inside Settings (the toast rides above the takeover) | ' + JSON.stringify(F03), F03.show === true && F03.z > F03.menuZ && F03.txt.length > 0);
await ev(`(() => { $('setClose').click(); return true; })()`); await sleep(400);

// P1 (Beta 1.33, Protomaps): ONE places system - localities (cities/towns/villages) are
// gated by the tile data itself, size by size (the Apple/Google ladder); the app's tuning
// owns the neighbourhood layer's arrival (9) and the 15.5 cap where route labels take over.
const PL1 = JSON.parse(await ev(`(() => { const byId = {}; for (const L of map.getStyle().layers) byId[L.id] = { mn: L.minzoom, mx: L.maxzoom }; return JSON.stringify({ sub: byId['places_subplace'], loc: byId['places_locality'] }); })()`));
ok('P1 day map: Protomaps place ladder (neighbourhood layer in at 9, places capped at 15.5) | ' + JSON.stringify(PL1),
  !!PL1.sub && PL1.sub.mn === 9 && !!PL1.loc && PL1.loc.mx === 15.5);
// P3: the zooms are only a promise - prove the little places actually RENDER at a wide view.
await ev(`(() => { map.jumpTo({ center: [(routeBox.w + routeBox.e) / 2, (routeBox.s + routeBox.n) / 2], zoom: 10.5 }); return true; })()`);
let placeCount = 0;
for (let i = 0; i < 24 && placeCount < 5; i++) { await sleep(500); placeCount = await ev(`map.queryRenderedFeatures({ layers: ['places_locality', 'places_subplace'] }).filter(f => f.properties && f.properties.name).length`); }
ok('P3 at z10.5 the day map renders named little places, not just permits them | count ' + placeCount, placeCount >= 5);
// P3b (Andrew): zoomed out until the route is a dot, the REGION must still read like a map -
// the surrounding municipalities on the labels, so he can keep his bearings.
await ev(`(() => { map.jumpTo({ center: [(routeBox.w + routeBox.e) / 2, (routeBox.s + routeBox.n) / 2], zoom: 9.2 }); return true; })()`);
let regionNames = [];
for (let i = 0; i < 24; i++) { await sleep(500); regionNames = JSON.parse(await ev(`JSON.stringify(map.queryRenderedFeatures({ layers: ['places_locality'] }).map(f => f.properties && f.properties.name).filter(Boolean))`)); if (['Vaughan', 'Richmond Hill', 'Markham', 'Toronto', 'King City', 'Aurora', 'Newmarket'].filter(n => regionNames.includes(n)).length >= 2) break; }
ok('P3b at dot-zoom (z9.2) the surrounding cities/towns are on the map | ' + JSON.stringify(regionNames.slice(0, 14)),
  ['Vaughan', 'Richmond Hill', 'Markham', 'Toronto', 'King City', 'Aurora', 'Newmarket'].filter(n => regionNames.includes(n)).length >= 2);
await ev(`(() => { $('homeBtn').click(); return true; })()`); await sleep(600);

// S6/S7 (Beta 1.24): after Start, Cancel must float ABOVE the circle - clear of the
// tab bar and tappable; and the chrome icons must compute to bright colours on the
// dark glass (a duplicated dark colour value once rendered them invisible).
await ev(`(() => { $('startBtn').click(); return true; })()`);
await sleep(700);
const S6 = JSON.parse(await ev(`(() => { const c = $('cancelStartBtn'); const cr = c.getBoundingClientRect(); const tr = $('tabBar').getBoundingClientRect();
  const hit = document.elementFromPoint(cr.x + cr.width / 2, cr.y + cr.height / 2);
  return JSON.stringify({ disp: c.style.display, cancel: { y: cr.y, b: cr.bottom }, tabTop: tr.top, hit: hit && hit.id, moonIcon: (() => { const t = document.createElement('span'); t.innerHTML = ICONS.moon; return $('nightBtn').innerHTML === t.innerHTML; })(), // serialized-vs-serialized: a raw string compare against the ICONS source never matches (the HTML serializer normalizes the SVG)
    listCol: getComputedStyle($('streetsBtn')).color, paceCol: getComputedStyle($('paceBtn')).color, tabCol: getComputedStyle($('homeBtn')).color }); })()`));
ok('S6 Cancel start floats above the circle, clear of the tab bar, and takes the tap | ' + JSON.stringify(S6),
  S6.disp !== 'none' && S6.cancel.b <= S6.tabTop - 40 && S6.hit === 'cancelStartBtn');
ok('S7 day mode: chrome is light glass with dark icons (GPS-app behaviour) | ' + JSON.stringify(S6),
  S6.listCol === 'rgb(34, 38, 46)' && S6.paceCol === 'rgb(34, 38, 46)' && S6.tabCol === 'rgb(43, 48, 56)');
await ev(`(() => { $('nightBtn').click(); return true; })()`);
await sleep(600);
ok('S7 day mode: the day/night button offers Night - the moon shows where it takes you, not where you are (Beta 1.28)', S6.moonIcon === true);
const S7 = JSON.parse(await ev(`(() => JSON.stringify({ night: document.body.classList.contains('night'), sunIcon: (() => { const t = document.createElement('span'); t.innerHTML = ICONS.sun; return $('nightBtn').innerHTML === t.innerHTML; })(),
  listCol: getComputedStyle($('streetsBtn')).color, tabCol: getComputedStyle($('homeBtn')).color,
  barBg: getComputedStyle($('tabBar')).backgroundColor, countCol: getComputedStyle($('count')).color }))()`));
ok('S7 night mode: chrome flips to dark glass with bright icons | ' + JSON.stringify(S7),
  S7.night === true && S7.listCol === 'rgb(242, 244, 248)' && S7.tabCol === 'rgb(221, 229, 236)' && S7.barBg === 'rgba(32, 33, 37, 0.94)' && S7.countCol === 'rgb(238, 244, 238)');
const S7b = JSON.parse(await ev(`(() => { const l = map && map.getLayer('buildings-3d'); return JSON.stringify({ there: !!l, type: l && l.type, h: l && map.getPaintProperty('buildings-3d', 'fill-extrusion-height') }); })()`));
ok('S7b the 3D buildings layer survives a basemap swap (Beta 1.90): a fill-extrusion on the buildings source-layer with the estimated-height ramp, still there after the theme flip rebuilt the style | ' + JSON.stringify(S7b),
  S7b.there && S7b.type === 'fill-extrusion' && JSON.stringify(S7b.h).includes('coalesce'));
ok('S7 night mode: the day/night button now offers Day - sun icon, state in agreement', S7.sunIcon === true);
const T4 = JSON.parse(await ev(`(() => { const surf = el => getComputedStyle(el).backgroundColor; return JSON.stringify({
  sheetBg: surf($('sheet')), sheetCol: getComputedStyle($('sheet')).color, barBg: surf($('tabBar')) }); })()`));
ok('T4 night menus share the neutral charcoal (bar = sheets), text bright (Beta 1.75) | ' + JSON.stringify(T4),
  T4.sheetBg === 'rgba(32, 33, 37, 0.94)' && T4.sheetCol === 'rgb(237, 242, 249)' && T4.barBg === T4.sheetBg);
const PL2 = JSON.parse(await ev(`(() => { const byId = {}; for (const L of map.getStyle().layers) byId[L.id] = { mn: L.minzoom, mx: L.maxzoom }; return JSON.stringify({ sub: byId['places_subplace'], loc: byId['places_locality'] }); })()`));
ok('P2 night map too: same Protomaps ladder (subplace 9, locality capped 15.5) | ' + JSON.stringify(PL2),
  !!PL2.sub && PL2.sub.mn === 9 && !!PL2.loc && PL2.loc.mx === 15.5);
await ev(`(() => { markDone('Woolacott', 'tap'); selectStretch('Woolacott', 0, STRETCH.Woolacott.line[3]); return true; })()`); await sleep(300);
const NAC = await ev(`getComputedStyle($('selPop')).boxShadow`);
ok('P4 the colour edge survives the night theme (mint for the completed Woolacott) | ' + NAC, NAC.includes('6, 214, 160'));
await ev(`(() => { markUndone('Woolacott'); deselect(); return true; })()`);

// P5 (Beta 1.33, Andrew: "make sure nothing breaks when switching and everything stays
// the same"): with a street done, a selection up and the camera moved off home, flip
// night -> day -> night and prove selection, progress, camera, route stack and the tuned
// place zooms survive EVERY swap untouched.
await ev(`(() => { markDone('Woolacott', 'tap'); selectStretch('Woolacott', 0, STRETCH.Woolacott.line[3]); map.jumpTo({ center: [-79.5595, 43.8155], zoom: 14.2 }); return true; })()`); await sleep(500);
const swSnap = async () => JSON.parse(await ev(`(() => { const L = {}; for (const l of map.getStyle().layers) L[l.id] = l; return JSON.stringify({ night: document.body.classList.contains('night'), centre: map.getCenter().toArray(), zoom: map.getZoom(), name: $('selName').textContent, count: $('countTxt').textContent, route: !!map.getLayer('t1-surface'), gps: !!map.getLayer('gps-dot'), sub: L['places_subplace'] ? L['places_subplace'].minzoom : null, locMax: L['places_locality'] ? L['places_locality'].maxzoom : null }); })()`));
const swWait = async () => { for (let i = 0; i < 20; i++) { if (await ev(`!!(window.map && map.getLayer && map.getLayer('t1-surface'))`)) return; await sleep(400); } };
const SW0 = await swSnap();
await ev(`(() => { $('nightBtn').click(); return true; })()`); await swWait(); await sleep(300);
const SW1 = await swSnap();
ok('P5 switching to DAY keeps everything: selection, progress, camera, stack, place tuning | ' + JSON.stringify(SW1),
  SW1.night === false && SW1.name === SW0.name && SW1.count === SW0.count && Math.abs(SW1.centre[0] - SW0.centre[0]) < 0.0001 && Math.abs(SW1.centre[1] - SW0.centre[1]) < 0.0001 && Math.abs(SW1.zoom - SW0.zoom) < 0.01 && SW1.route && SW1.gps && SW1.sub === 9 && SW1.locMax === 15.5);
await ev(`(() => { $('nightBtn').click(); return true; })()`); await swWait(); await sleep(300);
const SW2 = await swSnap();
ok('P5 switching back to NIGHT keeps everything too | ' + JSON.stringify(SW2),
  SW2.night === true && SW2.name === SW0.name && SW2.count === SW0.count && Math.abs(SW2.centre[0] - SW0.centre[0]) < 0.0001 && Math.abs(SW2.centre[1] - SW0.centre[1]) < 0.0001 && Math.abs(SW2.zoom - SW0.zoom) < 0.01 && SW2.route && SW2.gps && SW2.sub === 9 && SW2.locMax === 15.5);
await ev(`(() => { markUndone('Woolacott'); deselect(); return true; })()`);

await ev(`(() => { $('cancelStartBtn').click(); return true; })()`);
await sleep(400);

await ev(`(() => { markDone('Woolacott', 'tap'); return true; })()`);
await sleep(400);
const C2 = await ev(`$('count').textContent`);
ok('S5 count climbs in the new format after a street is done | ' + C2, new RegExp('^1 of ' + PACK5W.names + ' · \\d+%$').test(C2));
await sleep(600);
const T5 = JSON.parse(await ev(`(() => JSON.stringify({ ratio: $('countFill').offsetWidth / $('count').offsetWidth, want: workDoneM() / totalWorkM(), txt: $('countTxt').textContent, count: $('count').textContent }))()`));
ok('T5 the pill meter fills with the same work fraction the % reports | ' + JSON.stringify(T5),
  Math.abs(T5.ratio - T5.want) < 0.04 && T5.want > 0 && T5.txt === T5.count);


R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

