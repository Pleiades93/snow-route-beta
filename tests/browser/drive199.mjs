import { launchDrive, finish, PATTERNS_GITHUB_IO, tapById } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });

// drive199: Beta 1.203 - Andrew's two calls in one build, each check measuring
// the failure property directly in the rendered page, never a proxy.
// PART 1, THE TILTED DEFAULT VIEW: the route load-in flight, the Home button
// and a route switch all land on the same default view - pitch 45, north up,
// at the centre and zoom the FLAT fit computes (Andrew: "keep the zoom level
// the same, just tilt it to 45"). The zoom equality is judged against a flat
// fit computed independently in the page (cameraForBounds read at pitch 0),
// the framing by projecting EVERY road coordinate through the landed camera
// into the clear area above the bottom chrome (the tilt sample's basis).
// Both themes, both phone sizes. The no-route boot still opens flat, and the
// intro's tilt is ANIMATED (intermediate pitches sampled during the flight),
// not a jump. Framing note, measured on this drive's first run: the route
// BOX's two southern corners overshoot the screen edges by 1.5px at 430x932
// - perspective magnifies the near edge - but those corners are roadless
// (the southernmost latitude crossed with the extreme longitudes); every
// actual road coordinate sits inside with 40px+ of margin at both sizes,
// which is the property "the route is framed" means.
// PART 2, THE SPEED CIRCLE (Beta 1.220 re-derivation): the top-centre pill of
// Beta 1.200 is REPLACED by Andrew's approved circle - 64px across at the top
// LEFT under the title, its top edge level with the night button's top edge
// (measured, both themes), the speed number big and centred with "KM/H"
// centred directly below it, on the app's glass tokens (parity judged on the
// glass properties against the #count pill's computed styles, day and night).
// Its gate is unchanged: hidden at boot and whenever location is off, shown
// by startGps reading 0, updated per fix (10.5 m/s -> 38), reading 0 at rest
// instead of vanishing, hidden by stopGps - through the real gpsBtn presses
// and through a clean's own GPS. The retired #spd chip must not exist.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const overlaps = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;
const setSize = async (w, h) => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }, S); await sleep(700); };

// the flat fit, computed independently of the landed camera: read
// cameraForBounds at pitch 0 / bearing 0 (its no-options form IS the flat
// fit), then restore the camera exactly as it was.
const flatFit = () => J(`(() => { const b = [[routeBox.w, routeBox.s], [routeBox.e, routeBox.n]];
  const cam = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
  map.jumpTo({ pitch: 0, bearing: 0 }); const f = map.cameraForBounds(b, { padding: 28 });
  map.jumpTo(cam); return { lng: f.center.lng, lat: f.center.lat, zoom: f.zoom }; })()`);
const camState = () => J(`(() => { const c = map.getCenter(); return { lng: c.lng, lat: c.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), moving: map.isMoving() }; })()`);
const framing = () => J(`(() => { const W = window.innerWidth, H = window.innerHeight;
  const dockTop = document.getElementById('dock').getBoundingClientRect().top;
  let n = 0, out = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const name of Object.keys(STRETCH)) for (const p of STRETCH[name].line) { const s = map.project([p[1], p[0]]); n++;
    if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x; if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y;
    if (s.x < 0 || s.x > W || s.y < 0 || s.y > dockTop) out++; }
  const cs = [[routeBox.w, routeBox.s], [routeBox.w, routeBox.n], [routeBox.e, routeBox.s], [routeBox.e, routeBox.n]].map(p => map.project(p));
  return { W, H, dockTop: Math.round(dockTop), n, out, minX: Math.round(minX * 10) / 10, maxX: Math.round(maxX * 10) / 10, minY: Math.round(minY * 10) / 10, maxY: Math.round(maxY * 10) / 10,
    corners: cs.map(p => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]) }; })()`);
const framingOk = (F) => F.n > 500 && F.out === 0;
const landedOk = (C, F) => Math.abs(C.pitch - 45) <= 0.5 && Math.abs(C.zoom - F.zoom) <= 0.01 && Math.abs(C.bearing) <= 0.5 &&
  Math.abs(C.lng - F.lng) < 0.00005 && Math.abs(C.lat - F.lat) < 0.00005;

// ---------- boot: no route, flat map, no pill, no chip ----------
await poll(`typeof loadRoute === 'function'`, 20000);
await poll(`!!window.__bootAt`, 30000);
await poll(`!!document.querySelector('#rmRoutes .routeRow')`, 30000);
await sleep(600);
const boot = await J(`(() => ({ loaded: typeof routeLoaded !== 'undefined' && routeLoaded === true, pitch: map ? map.getPitch() : -1,
  spd: !!document.getElementById('spd'), pill: !!document.getElementById('spdPill'),
  pillShown: (() => { const e = document.getElementById('spdPill'); return !!e && e.getBoundingClientRect().height > 0; })() }))()`);
ok('B0 no-route boot unchanged: no route loaded, map flat (pitch 0), #spdPill present but hidden, #spd nowhere | ' + JSON.stringify(boot),
  boot.loaded === false && boot.pitch === 0 && boot.spd === false && boot.pill === true && boot.pillShown === false);

// ---------- the pick: the intro flight tilts as it flies ----------
await ev(`document.getElementById('rmChoose').click()`);
await ev(`(() => { const r = document.querySelector('#rmRoutes .routeRow'); if (r) { r.click(); const b = r.nextElementSibling && r.nextElementSibling.querySelector('.dropLoad'); if (b) b.click(); } return true; })()`);
const samples = [];
for (let i = 0; i < 40; i++) { const p = await ev(`map ? map.getPitch() : -1`); if (typeof p === 'number' && p >= 0) samples.push(Math.round(p * 10) / 10); if (samples.length && Math.abs(samples[samples.length - 1] - 45) <= 0.5 && await ev(`!map.isMoving()`)) break; await sleep(200); }
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
await poll(`!document.getElementById('splash')`, 20000);
await poll(`!map.isMoving()`, 25000);
ok('T1 the load-in flight ANIMATES the tilt (an intermediate pitch between 2 and 43 was sampled on the way to 45 - a jump cut would show none) | samples ' + JSON.stringify(samples),
  samples.some(p => p > 2 && p < 43));
let C = await camState(); let F = await flatFit();
ok('T2 the intro lands on the tilted default: pitch 45, bearing 0, centre and zoom equal to the independent flat fit | cam ' + JSON.stringify(C) + ' fit ' + JSON.stringify(F),
  landedOk(C, F));

// pin day for the deterministic theme sections (bootThrough's rule)
if (await ev(`document.body.classList.contains('night')`)) { await tapById(ev, 'nightBtn'); await sleep(800); }

// ---------- Home at 390x844, day: landing + framing ----------
await setSize(390, 844);
await ev(`(() => { map.jumpTo({ center: [(routeBox.w + routeBox.e) / 2 + 0.05, (routeBox.s + routeBox.n) / 2 + 0.05], zoom: 12, pitch: 0, bearing: 30 }); return true; })()`);
await sleep(300);
await tapById(ev, 'homeBtn');
await poll(`!map.isMoving()`, 15000); await sleep(300);
C = await camState(); F = await flatFit();
ok('T3 Home (390x844, day) lands tilted: pitch 45, bearing 0, the flat fit\'s centre/zoom from a scrambled camera (zoom 12, pitch 0, bearing 30) | cam ' + JSON.stringify(C) + ' fit ' + JSON.stringify(F),
  landedOk(C, F));
let FR = await framing();
ok('T4 framing at 390x844: every road coordinate projects inside the clear area above the dock | ' + JSON.stringify(FR), framingOk(FR));

// ---------- Home at 430x932, day ----------
await setSize(430, 932);
await ev(`(() => { map.jumpTo({ zoom: 12, pitch: 10, bearing: 0 }); return true; })()`); await sleep(300);
await tapById(ev, 'homeBtn');
await poll(`!map.isMoving()`, 15000); await sleep(300);
C = await camState(); F = await flatFit();
ok('T5 Home (430x932, day) lands tilted at that size\'s flat fit | cam ' + JSON.stringify(C) + ' fit ' + JSON.stringify(F), landedOk(C, F));
FR = await framing();
ok('T6 framing at 430x932: every road coordinate inside the clear area (the box\'s roadless southern corners overshoot 1.5px - see the header note) | ' + JSON.stringify(FR), framingOk(FR));

// ---------- Home at 390x844, night ----------
await setSize(390, 844);
await tapById(ev, 'nightBtn'); await sleep(800);
ok('T7 night is on for the night sections', await ev(`document.body.classList.contains('night')`));
await tapById(ev, 'homeBtn');
await poll(`!map.isMoving()`, 15000); await sleep(300);
C = await camState(); F = await flatFit();
ok('T8 Home (390x844, night) lands tilted at the flat fit | cam ' + JSON.stringify(C) + ' fit ' + JSON.stringify(F), landedOk(C, F));
FR = await framing();
ok('T9 framing at night: every road coordinate inside the clear area | ' + JSON.stringify(FR), framingOk(FR));
await tapById(ev, 'nightBtn'); await sleep(800);

// ---------- a route switch lands on the same tilted default ----------
const sw = await J(`(() => { const p = JSON.parse(JSON.stringify(ROUTE_PACKS[0])); p.id = 'drive199-switch'; p.name = 'Drive199 Switch'; ROUTE_PACKS.push(p); loadRoute('drive199-switch'); return { id: activeRoute && activeRoute.id }; })()`);
await poll(`!map.isMoving()`, 15000); await sleep(300);
C = await camState(); F = await flatFit();
ok('T10 a route switch frames the new route on the tilted default (pitch 45, flat-fit centre/zoom, bearing 0) | switched to ' + JSON.stringify(sw) + ' cam ' + JSON.stringify(C),
  sw.id === 'drive199-switch' && landedOk(C, F));
await ev(`loadRoute(ROUTE_PACKS[0].id)`);
await poll(`!map.isMoving()`, 15000); await sleep(300);
C = await camState();
ok('T11 switching back lands tilted too | cam ' + JSON.stringify(C), Math.abs(C.pitch - 45) <= 0.5 && Math.abs(C.bearing) <= 0.5);

// ---------- the speed circle: gate, values, rest state ----------
const pillState = () => J(`(() => { const e = document.getElementById('spdPill'); const b = e.getBoundingClientRect();
  const nb = document.getElementById('nightBtn').getBoundingClientRect();
  const tt = document.querySelector('#hud .title').getBoundingClientRect();
  const num = document.getElementById('spdNum'), unit = document.getElementById('spdUnit');
  const nr = num.getBoundingClientRect(), ur = unit.getBoundingClientRect();
  return { shown: b.height > 0, txt: num.textContent, unit: unit.textContent, x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom, cx: b.x + b.width / 2,
    nightTop: nb.y, titleTop: tt.y, numCx: nr.x + nr.width / 2, unitCx: ur.x + ur.width / 2, unitBelow: ur.y >= nr.y, br: getComputedStyle(e).borderRadius }; })()`);
let P = await pillState();
ok('P1 route loaded, location off: the pill is hidden | ' + JSON.stringify(P), P.shown === false);
await ev(`(() => { window.__wp = null; Object.defineProperty(navigator, 'geolocation', { value: { watchPosition: (okCb, errCb) => { window.__wp = okCb; return 4242; }, clearWatch: () => {} }, configurable: true }); return true; })()`);
await tapById(ev, 'gpsBtn'); await sleep(500);
P = await pillState();
const wid = await ev(`watchId`);
ok('P2 pressing Locate (the real gpsBtn path, stubbed watch) shows the circle at once, reading 0 with KM/H under it, before any fix | ' + JSON.stringify(P) + ' watchId ' + wid,
  wid === 4242 && P.shown === true && P.txt === '0' && P.unit === 'KM/H');
ok('P3 the circle: 64px across at the top LEFT, keeping its own 78px seat - 53px below the title top, both measured live - while the night button top edge stands LEVEL with the title top edge (0.5px; Beta 1.228 raised the button to the title line, the circle did not move), round, number and KM/H a centred stacked pair | ' + JSON.stringify(P),
  Math.abs(P.w - 64) <= 0.5 && Math.abs(P.h - 64) <= 0.5 && P.x <= 20 && Math.abs(P.nightTop - P.titleTop) <= 0.5 && Math.abs(P.y - (P.titleTop + 53)) <= 0.5 && (P.br === '50%' || P.br === '32px') && Math.abs(P.numCx - P.cx) <= 1 && Math.abs(P.unitCx - P.cx) <= 1 && P.unitBelow);
const base = await J(`(() => { const part = STRETCH.Velmar.parts[0]; const mid = part[Math.floor(part.length / 2)]; return { lat: mid[0], lng: mid[1] }; })()`);
const feed = async (lat, lng, spd, ts) => ev(`window.__wp({ coords: { latitude: ${lat}, longitude: ${lng}, accuracy: 8, speed: ${spd}, heading: 90 }, timestamp: ${ts} })`);
const T0 = Date.now();
await feed(base.lat, base.lng, 10.5, T0); await sleep(400);
P = await pillState();
ok('P4 a fix at 10.5 m/s prices the circle: 38 | ' + JSON.stringify(P), P.txt === '38' && P.unit === 'KM/H');
await feed(base.lat, base.lng + 0.0002, 0, T0 + 2000); await sleep(400);
P = await pillState();
ok('P5 at rest the circle reads 0 and STAYS shown (it does not vanish the way the old chip did) | ' + JSON.stringify(P), P.txt === '0' && P.shown === true);
await feed(base.lat, base.lng + 0.0003, null, T0 + 4000); await sleep(400);
P = await pillState();
ok('P6 a fix reporting no speed also reads 0, still shown | ' + JSON.stringify(P), P.txt === '0' && P.shown === true);

// ---------- overlaps, with the circle live ----------
const ov = await J(`(() => { const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return b.height > 0 ? { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom } : null; };
  const ts = document.querySelector('#hud .titleStack').getBoundingClientRect();
  return { pill: r('spdPill'), night: r('nightBtn'), centre: r('centreBtn'), title: { x: ts.x, y: ts.y, w: ts.width, h: ts.height, r: ts.right, b: ts.bottom } }; })()`);
ok('P7 the circle overlaps nothing at the top: not the day/night button, not the re-centre button, not the HUD title block | ' + JSON.stringify(ov),
  !!ov.pill && (!ov.night || !overlaps(ov.pill, ov.night)) && (!ov.centre || !overlaps(ov.pill, ov.centre)) && !overlaps(ov.pill, ov.title));
await ev(`(() => { markDone('Velmar', 'tap'); const line = STRETCH.Velmar.line; selectStretch('Velmar', 0, line[Math.floor(line.length / 2)]); return true; })()`);
await poll(`(() => { const e = document.getElementById('selPop'); return !e.classList.contains('hidden') && e.getBoundingClientRect().height > 0; })()`, 8000);
const ov2 = await J(`(() => { const r = (id) => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; }; return { pill: r('spdPill'), pop: r('selPop') }; })()`);
ok('P8 with a street selected, the circle clears the selection pop-up below it | ' + JSON.stringify(ov2), !overlaps(ov2.pill, ov2.pop) && ov2.pop.y - ov2.pill.b >= 10);
await ev(`deselect()`); await sleep(300);

// ---------- glass parity with the #count pill (day, then night) ----------
const parity = () => J(`(() => { const a = getComputedStyle(document.getElementById('spdPill')); const c = getComputedStyle(document.getElementById('count'));
  const pick = (s) => ({ ff: s.fontFamily, bg: s.backgroundColor, col: s.color, bc: s.borderColor, bs: s.boxShadow, bf: s.backdropFilter });
  return { pill: pick(a), count: pick(c) }; })()`);
let par = await parity();
ok('P9 glass parity (day): the circle\'s computed font family, glass background, ink colour, border, shadow and blur EQUAL the #count pill\'s (the glass language is shared; the shape is the circle\'s own) | pill ' + JSON.stringify(par.pill) + ' count ' + JSON.stringify(par.count),
  JSON.stringify(par.pill) === JSON.stringify(par.count));
// P10's height comparison is measured in the P13 segment below, where a clean is
// running: since Beta 1.202 the #count pill renders ONLY while a clean runs, so its
// rendered height exists only in that state (the computed-style parity above is
// state-independent and stays here). Re-derived at the Beta 1.203 landing; the
// property - same height as #count - is unchanged.
await tapById(ev, 'nightBtn'); await sleep(800);
par = await parity();
const psN = await pillState();
ok('P11 glass parity (night): the same equality on the dark glass, and the title line holds at night too - the night button top levels with the title top and the circle keeps its seat 53px below it | pill ' + JSON.stringify(par.pill) + ' count ' + JSON.stringify(par.count),
  JSON.stringify(par.pill) === JSON.stringify(par.count) && par.pill.bg !== 'rgba(255, 255, 255, 0.78)' && Math.abs(psN.nightTop - psN.titleTop) <= 0.5 && Math.abs(psN.y - (psN.titleTop + 53)) <= 0.5);
await tapById(ev, 'nightBtn'); await sleep(800);

// ---------- the gate closes: Locate off hides it; a clean's GPS shows it ----------
await tapById(ev, 'gpsBtn'); await sleep(500);
P = await pillState();
ok('P12 pressing Locate again (stopGps) hides the circle | ' + JSON.stringify(P) + ' watchId ' + (await ev(`watchId`)), P.shown === false);
await ev(`startClean()`); await sleep(600);
P = await pillState();
const runGate = await J(`({ run: !!runStart, fromRun: gpsFromRun, wid: watchId })`);
ok('P13 a clean\'s own GPS shows the circle too (startClean -> startGps(true)) | ' + JSON.stringify(P) + ' ' + JSON.stringify(runGate),
  P.shown === true && P.txt === '0' && runGate.run === true && runGate.fromRun === true && runGate.wid === 4242);
const heights = await J(`(() => { const b = document.getElementById('spdPill').getBoundingClientRect(); return { w: b.width, h: b.height }; })()`);
ok('P10 the circle measures exactly 64 x 64 in the run state too | ' + JSON.stringify(heights), Math.abs(heights.w - 64) <= 0.5 && Math.abs(heights.h - 64) <= 0.5);
await ev(`stopGps()`); await sleep(400);
P = await pillState();
ok('P14 stopGps hides the circle on the run path too | ' + JSON.stringify(P), P.shown === false);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);
