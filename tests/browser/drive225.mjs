import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive225: Beta 1.295 (spin-out 6d-2) GPS gap surfacing.
// Grades the gap clean end to end: record stamp, banner after finish, both faces.
// The GPS stub is drive207's pattern; the silence is staged by ageing the stamps.
const BANNER_FACE = `window.__bannerFace = () => { const cs = getComputedStyle($('banner'));
const lum = (rgb) => { const c = rgb.match(/\\d+(\\.\\d+)?/g).slice(0, 3).map(v => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const lb = lum(cs.backgroundColor), lt = lum(cs.color);
return { bg: cs.backgroundColor, ratio: (Math.max(lb, lt) + 0.05) / (Math.min(lb, lt) + 0.05) }; };`;
await ev(`(() => { ${BANNER_FACE} return true; })()`);
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); 
return typeof raw === 'string' ? JSON.parse(raw) : {}; };

await sleep(2500);
ok('F0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));
await poll120(`!document.getElementById('splash')`, 20000);
const base = JSON.parse(await ev(`(() => { const part = STRETCH.Velmar.parts[0]; const mid = part[Math.floor(part.length / 2)]; return JSON.stringify({ lat: mid[0], lng: mid[1] }); })()`));
await ev(`(() => { window.__wpCalls = 0; window.__wpOk = null; navigator.geolocation.watchPosition = (ok2) => { window.__wpCalls++; window.__wpOk = ok2; return 4242; }; 
navigator.geolocation.clearWatch = () => {}; window.__feed = { on: false, lat: ${base.lat}, lng: ${base.lng} }; 
window.__feedTimer = setInterval(() => { const f = window.__feed; if (!f.on || !window.__wpOk) return; 
window.__wpOk({ coords: { latitude: f.lat, longitude: f.lng, accuracy: 8, speed: 2, heading: 90 }, timestamp: Date.now() }); }, 1000); return true; })()`);

// ---- the gap clean: fix lands, then the watch goes silent ----
await ev(`(() => { startClean(); window.__feed.on = true; return true; })()`);
const s1Fix = await poll120(`lastFixAt > 0`, 20000);
ok('S1 setup: the clean is running and GPS took a fix', s1Fix === true && await J(`!!runStart`));
await ev(`(() => { const ns = STREETNAMES.slice(0, 3); for (const n of ns) markStreet(n, true); return true; })()`);
await ev(`(() => { window.__feed.on = false; runStart = Date.now() - 120000; lastFixAt = Date.now() - 60000; watchStartedAt = Date.now() - 120000; return true; })()`); // the run is two minutes old and its watch has been silent a minute
const calls0 = await J(`window.__wpCalls`);
const restarted = await poll120(`window.__wpCalls > ${calls0}`, 30000);
ok('G1 the silent run watch is restarted by the watchdog', restarted === true);
ok('G2 the restart is recorded as a gap on this run', await J(`gpsGapRuns.get(LS.start) === runStart`));
ok('G3 no banner before the finish', await J(`!$('banner').classList.contains('show') && getComputedStyle($('banner')).visibility === 'hidden'`));

// ---- finish: the record lands first, the banner advises after ----
const hist0 = await J(`history.length`);
const tFinish = Date.now();
await ev(`(() => { $('resetBtn').click(); return true; })()`); await sleep(300);
await ev(`(() => { $('finYes').click(); return true; })()`); await sleep(1000);
const A = await J(`(() => { const b = $('banner'), t = document.querySelector('#hud .title'); const br = b.getBoundingClientRect(), tr = t.getBoundingClientRect(); 
const face = window.__bannerFace();
return { h: history.length, gap: history.length && history[history.length - 1].gpsGap === true, show: b.classList.contains('show'), head: $('bannerHead').textContent, line: $('bannerLine').textContent,
top: br.top, titleTop: tr.top, left: br.left, titleLeft: tr.left, right: br.right, vw: window.innerWidth,
bg: face.bg, ratio: face.ratio }; })()`);
ok('G4 the clean archived with gpsGap stamped on its record', A.h === hist0 + 1 && A.gap === true);
ok('G5 the banner shows the decided wording', A.show === true && A.head === 'GPS gap in this clean' && A.line === 'Part of this clean was not tracked');
ok('G6 the banner rests level with the title (top and left aligned, title span)', Math.abs(A.top - A.titleTop) <= 2 && Math.abs(A.left - A.titleLeft) <= 2 && Math.abs(A.right - (A.vw - 12)) <= 2);
ok('G7 day face: white card, headline contrast >= 4.5 | bg ' + A.bg + ', ratio ' + (A.ratio || 0).toFixed(2), A.bg === 'rgb(255, 255, 255)' && A.ratio >= 4.5);
const gone = await poll120(`getComputedStyle($('banner')).visibility === 'hidden' && !$('banner').classList.contains('show')`, 9000);
ok('G8 the banner leaves on its own | gone after ' + (Date.now() - tFinish) + ' ms', gone === true);

// ---- night face: same banner, dark card, measured contrast ----
await ev(`(() => { setThemeOverride(true); return true; })()`);
await poll120(`document.body.classList.contains('night')`, 10000);
await ev(`(() => { showBanner('GPS gap in this clean', 'Part of this clean was not tracked', 'gps'); return true; })()`); await sleep(900);
const N = await J(`(() => window.__bannerFace())()`);
ok('G9 night face: dark card, headline contrast >= 4.5 | bg ' + N.bg + ', ratio ' + (N.ratio || 0).toFixed(2), N.bg === 'rgb(32, 33, 37)' && N.ratio >= 4.5);
await poll120(`getComputedStyle($('banner')).visibility === 'hidden'`, 9000);
await ev(`(() => { clearThemeOverride(); return true; })()`);

// ---- control: a clean with no gap archives silently ----
await ev(`(() => { startClean(); window.__feed.on = true; return true; })()`);
const s2Fix = await poll120(`lastFixAt > Date.now() - 10000`, 20000);
await ev(`(() => { const ns = STREETNAMES.slice(0, 3); for (const n of ns) markStreet(n, true); return true; })()`);
const hist1 = await J(`history.length`);
await ev(`(() => { $('resetBtn').click(); return true; })()`); await sleep(300);
await ev(`(() => { $('finYes').click(); return true; })()`); await sleep(1000);
const C = await J(`({ h: history.length, gapProp: history.length ? ('gpsGap' in history[history.length - 1]) : null, show: $('banner').classList.contains('show') })`);
ok('G10 control setup took a fix', s2Fix === true);
ok('G11 control: no stamp on the record, no banner', C.h === hist1 + 1 && C.gapProp === false && C.show === false);
await ev(`(() => { window.__feed.on = false; stopGps(); return true; })()`);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
