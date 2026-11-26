import { launchDrive, finish, bootThrough, tapById } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive226: Beta 1.299 - SNOW ON EVERY BLUE MENU, the fluidity proof.
// The menus run the splash engine's own snow, identical (Andrew's
// pick, 2026-11-26); this drive proves the snow costs the menus
// nothing, with frame timing on the real app. Budget, from the
// 60 fps frame (16.7 ms) and stated before measurement: from the
// click, first snow and first menu movement land within 51 ms;
// inside the 420 ms open/close, gaps <= 34 ms at p95, <= 51 ms
// ever, >= 20 intervals - the same under 4x CPU throttling. An
// in-page rAF recorder samples __snow.frames(), the menu's
// transform and timestamps around scripted opens and closes; the
// drive also proves the engine parks on the map, stops dead on
// close, holds the pile across menus, and keeps sub-pane ground.

const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`);
  return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const armRecorder = async () => {
  await ev(`(() => {
    window.__fr = { on: true, times: [], snow: [], menu: [] };
    const step = (ts) => {
      const F = window.__fr; if (!F || !F.on) return;
      F.times.push(ts);
      F.snow.push(window.__snow ? window.__snow.frames() : -1);
      const rm = document.getElementById('routeMenu');
      F.menu.push(rm ? getComputedStyle(rm).transform : '');
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  })()`);
};
const disarmRecorder = async () => { await ev(`(() => { if (window.__fr) window.__fr.on = false; return true; })()`); await sleep(60); };
const readRecorder = async () => J(`window.__fr ? { times: window.__fr.times, snow: window.__fr.snow, menu: window.__fr.menu } : { times: [], snow: [], menu: [] }`);
const markTap = async () => J(`({ t: performance.now(), m: getComputedStyle(document.getElementById('routeMenu')).transform })`);
const judgeSpan = (rec, mark, fPre) => {
  let i0 = rec.times.findIndex(t => t >= mark.t);
  if (i0 < 0) i0 = rec.times.length;
  let firstSnow = -1, firstMove = -1;
  for (let i = i0; i < rec.snow.length; i++) {
    if (firstSnow < 0 && fPre !== null && rec.snow[i] > fPre) firstSnow = i;
    if (firstMove < 0 && rec.menu[i] !== mark.m) firstMove = i;
    if ((fPre === null || firstSnow >= 0) && firstMove >= 0) break;
  }
  const ivals = [];
  for (let i = i0; i + 1 < rec.times.length && rec.times[i] - mark.t <= 430; i++) ivals.push(rec.times[i + 1] - rec.times[i]);
  const sorted = [...ivals].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 999;
  const max = sorted.length ? sorted[sorted.length - 1] : 999;
  return { snowMs: firstSnow >= 0 ? Math.round(rec.times[firstSnow] - mark.t) : -1, moveMs: firstMove >= 0 ? Math.round(rec.times[firstMove] - mark.t) : -1, n: ivals.length, p95, max };
};

// ---------- F1: parked on the map ----------
const P0 = await J(`({ running: window.__snow.running(), scene: document.body.classList.contains('snow-scene'), flakes: window.__snow.flakes().length })`);
ok('F1 on the map the engine is parked: not running, no snow-scene, and the one flake field exists (the splash density) | ' + JSON.stringify(P0),
  P0.running === false && P0.scene === false && P0.flakes > 300);
const N0 = P0.flakes;

// ---------- F2/F3/F4: Routes open - first frame, budget, alive ----------
await armRecorder();
const fPre = await J(`window.__snow.frames()`);
const markO = await markTap();
await tapById(ev, 'routesBtn');
await sleep(750);
await disarmRecorder();
const rec1 = await readRecorder();
const w1 = judgeSpan(rec1, markO, fPre);
ok('F2 first frame: from the click, the first painted snow frame and the menu\'s first movement each land within 51 ms, snow no later than the menu | ' + JSON.stringify(w1),
  w1.snowMs >= 0 && w1.moveMs >= 0 && w1.snowMs <= 51 && w1.moveMs <= 51 && w1.snowMs <= w1.moveMs);
ok('F3 open budget (60 fps frame = 16.7 ms): >= 20 intervals inside the 420 ms window, p95 gap <= 34 ms, max gap <= 51 ms | ' + JSON.stringify(w1),
  w1.n >= 20 && w1.p95 <= 34 && w1.max <= 51);
const A1 = await J(`({ running: window.__snow.running(), scene: document.body.classList.contains('snow-scene'), f: window.__snow.flakes().slice(0, 3) })`);
await sleep(300);
const A2 = await J(`window.__snow.flakes().slice(0, 3)`);
ok('F4 while Routes is open the snow runs and the flakes move | running ' + A1.running + ', moved ' + (JSON.stringify(A1.f) !== JSON.stringify(A2)),
  A1.running === true && A1.scene === true && JSON.stringify(A1.f) !== JSON.stringify(A2));

// ---------- F5/F6: close stops dead; the pile is held and resumes ----------
await armRecorder();
const markC = await markTap();
await tapById(ev, 'rmClose');
await sleep(750);
await disarmRecorder();
const recC = await readRecorder();
const wC = judgeSpan(recC, markC, null);
const C1 = await J(`({ frames: window.__snow.frames(), amount: window.__snow.amount(), f0: window.__snow.flakes()[0], n: window.__snow.flakes().length, vis: getComputedStyle(document.getElementById('snowCv')).visibility })`);
await sleep(300);
const C2 = await J(`({ frames: window.__snow.frames(), running: window.__snow.running(), scene: document.body.classList.contains('snow-scene') })`);
ok('F5 close stops the snow dead: the painted count is frozen, the engine is parked, the canvas is hidden | ' + JSON.stringify({ C1, C2 }),
  C1.frames === C2.frames && C2.running === false && C2.scene === false && C1.vis === 'hidden');
ok('F5b close budget: the menu moves within 51 ms of the click and the close\'s gaps hold the same budget (>= 20 intervals, p95 <= 34 ms, max <= 51 ms) | ' + JSON.stringify(wC),
  wC.moveMs >= 0 && wC.moveMs <= 51 && wC.n >= 20 && wC.p95 <= 34 && wC.max <= 51);
await tapById(ev, 'routesBtn');
const R1 = await J(`({ amount: window.__snow.amount(), f0: window.__snow.flakes()[0], n: window.__snow.flakes().length, running: window.__snow.running() })`);
await sleep(400);
ok('F6 the pile persists across menus: amount and the flake field at reopen are the held ones (amount drift <= 0.02, flake 0 within 2 px, same count) | '
  + JSON.stringify({ held: { amount: C1.amount, f0: C1.f0, n: C1.n }, reopened: R1 }),
  Math.abs(R1.amount - C1.amount) <= 0.02 && Math.abs(R1.f0.x - C1.f0.x) <= 2 && Math.abs(R1.f0.y - C1.f0.y) <= 2 && R1.n === N0 && C1.n === N0 && R1.running === true);
await tapById(ev, 'rmClose');
await sleep(700);

// ---------- F7: rapid toggle converges to one engine ----------
await tapById(ev, 'routesBtn'); await sleep(70);
await tapById(ev, 'routesBtn'); await sleep(70);
await tapById(ev, 'routesBtn'); await sleep(600);
const T1 = await J(`({ running: window.__snow.running(), n: window.__snow.flakes().length, frames: window.__snow.frames(), open: document.getElementById('routeMenu').classList.contains('open') })`);
await sleep(250);
const T2 = await J(`window.__snow.frames()`);
ok('F7 rapid open/close/open converges: menu open, exactly one field (same flake count), frames advancing | ' + JSON.stringify({ T1, T2 }),
  T1.open === true && T1.running === true && T1.n === N0 && T2 > T1.frames);
await tapById(ev, 'rmClose');
await sleep(700);

// ---------- F10/F11: the sub-pane ground, and Settings never inherits .away ----------
await tapById(ev, 'routesBtn');
await sleep(500);
await tapById(ev, 'rmChoose');
await poll(`document.getElementById('snowCv').classList.contains('away')`, 5000);
const P1 = await J(`({ away: document.getElementById('snowCv').classList.contains('away'),
  menuBgi: getComputedStyle(document.getElementById('routeMenu')).backgroundImage })`);
ok('F10 on a Routes sub-pane the snow hides (.away) AND the menu keeps its own blue ground - the map never shows through the menu | ' + JSON.stringify(P1),
  P1.away === true && P1.menuBgi.includes('linear-gradient') && P1.menuBgi.includes('rgb(61, 101, 239)'));
await tapById(ev, 'routesBtn');
await sleep(700);
await tapById(ev, 'setBtn');
await sleep(650);
const P2 = await J(`({ away: document.getElementById('snowCv').classList.contains('away'), running: window.__snow.running(), frames: window.__snow.frames() })`);
await sleep(250);
const P3 = await J(`window.__snow.frames()`);
ok('F11 Settings opened after a Routes sub-pane still gets its snow: no inherited .away, engine running, frames advancing | ' + JSON.stringify({ P2, P3 }),
  P2.away === false && P2.running === true && P3 > P2.frames);
await tapById(ev, 'setClose');
await sleep(700);

// ---------- F8: Settings carries the snow; the version seat clears the mound ----------
await tapById(ev, 'setBtn');
await sleep(650);
const S1 = await J(`({ running: window.__snow.running(), scene: document.body.classList.contains('snow-scene'),
  menuBgi: getComputedStyle(document.getElementById('setMenu')).backgroundImage, cvBgi: getComputedStyle(document.getElementById('snowCv')).backgroundImage,
  seat: window.innerHeight - document.getElementById('setVer').getBoundingClientRect().bottom, frames: window.__snow.frames() })`);
await sleep(250);
const S2 = await J(`window.__snow.frames()`);
ok('F8 Settings open: snow live behind it (menu stepped aside, the field wears the app gradient) and the version label seats >= 52 px clear of the viewport bottom, above the 51 px mound crest | ' + JSON.stringify({ S1, S2 }),
  S1.running === true && S1.scene === true && S1.menuBgi === 'none' && S1.cvBgi.includes('rgb(61, 101, 239)') && S1.cvBgi.includes('rgb(27, 47, 182)') && S1.seat >= 52 && S2 > S1.frames);
await tapById(ev, 'setClose');
await sleep(750);
const S3 = await J(`({ frames: window.__snow.frames(), running: window.__snow.running() })`);
await sleep(300);
const S4 = await J(`window.__snow.frames()`);
ok('F8b Settings close stops the snow dead too | ' + JSON.stringify({ S3, S4 }), S3.frames === S4 && S3.running === false);

// ---------- F9: throttled pass - the same budget under 4x CPU throttling ----------
await send('Emulation.setCPUThrottlingRate', { rate: 4 }, S);
await armRecorder();
const fPre9 = await J(`window.__snow.frames()`);
const mark9 = await markTap();
await tapById(ev, 'routesBtn');
await sleep(900);
await disarmRecorder();
const rec9 = await readRecorder();
const w9 = judgeSpan(rec9, mark9, fPre9);
ok('F9 throttled (4x CPU): from the click, first snow and first menu movement each still land within 51 ms, snow no later than the menu | ' + JSON.stringify(w9),
  w9.snowMs >= 0 && w9.moveMs >= 0 && w9.snowMs <= 51 && w9.moveMs <= 51 && w9.snowMs <= w9.moveMs);
ok('F9b throttled budget, unchanged: >= 20 intervals in the window, p95 gap <= 34 ms, max gap <= 51 ms | ' + JSON.stringify(w9),
  w9.n >= 20 && w9.p95 <= 34 && w9.max <= 51);
await armRecorder();
const markC9 = await markTap();
await tapById(ev, 'rmClose');
await sleep(900);
await disarmRecorder();
const recC9 = await readRecorder();
const wC9 = judgeSpan(recC9, markC9, null);
ok('F9c throttled close budget, unchanged: the menu moves within 51 ms of the click and the gaps hold (>= 20 intervals, p95 <= 34 ms, max <= 51 ms) | ' + JSON.stringify(wC9),
  wC9.moveMs >= 0 && wC9.moveMs <= 51 && wC9.n >= 20 && wC9.p95 <= 34 && wC9.max <= 51);
await send('Emulation.setCPUThrottlingRate', { rate: 1 }, S);

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
