import { launchDrive, finish } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();

// drive227: Beta 1.300 - THE BOOT SCENE, the cold start's own snow.
// B1 judges the genuine cold start; B2 drops frame callbacks during the splash and judges the recovery.

const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`);
  return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const sceneFacts = () => J(`({ rmBoot: document.getElementById('routeMenu').classList.contains('boot'),
  running: window.__snow ? window.__snow.running() : null,
  frames: window.__snow ? window.__snow.frames() : -1,
  scene: document.body.classList.contains('snow-scene'),
  cvVis: getComputedStyle(document.getElementById('snowCv')).visibility,
  cvAway: document.getElementById('snowCv').classList.contains('away'),
  rmBg: getComputedStyle(document.getElementById('routeMenu')).backgroundImage })`);
const menuShown = () => poll(`!!document.getElementById('routeMenu') && document.getElementById('routeMenu').classList.contains('show')`, 30000);

// ---------- B1: the genuine cold start ----------
const splashSeen = await poll(`!!document.getElementById('splash')`, 15000);
const shown1 = await menuShown();
const A = await sceneFacts();
await sleep(450);
const B = await sceneFacts();
ok('B1 cold start, boot menu as the first scene (splash seen at load: ' + splashSeen + ', menu armed: ' + shown1 + ', boot class stands: ' + A.rmBoot + '): the snow is live while the picker stands - running ' + A.running
  + ', painted frames ' + A.frames + ' -> ' + B.frames + ', canvas ' + A.cvVis + ', menu background ' + JSON.stringify(A.rmBg),
  splashSeen === true && shown1 === true && A.rmBoot === true && A.running === true && B.frames > A.frames && A.scene === true && A.cvVis === 'visible' && A.cvAway === false && A.rmBg === 'none');

// ---------- B2: the stuck chain, and the seat that revives it ----------
await ev(`localStorage.clear(); sessionStorage.clear(); location.reload(); true`);
const engineUp = await poll(`!!window.__snow`, 20000);
await ev(`(() => { window.__rafOrig = window.requestAnimationFrame; window.__rafDropped = 0;
  window.requestAnimationFrame = function (cb) { window.__rafDropped++; return 0; }; return true; })()`);
await sleep(450);
const F1 = await J(`({ frames: window.__snow.frames(), dropped: window.__rafDropped || 0 })`);
await sleep(300);
const F2 = await J(`window.__snow.frames()`);
await ev(`(() => { if (window.__rafOrig) { window.requestAnimationFrame = window.__rafOrig; window.__rafOrig = null; } return true; })()`);
const stuckFlag = await J(`window.__snow.running()`);
ok('B2a the dropped callbacks leave the chain stuck with the flag still true: callbacks dropped ' + F1.dropped + ', painted frames ' + F1.frames + ' -> ' + F2 + ' across 300 ms (a live chain paints dozens), running reads ' + stuckFlag,
  engineUp === true && F1.dropped > 0 && F2 - F1.frames <= 1 && stuckFlag === true);
const shown2 = await menuShown();
const C = await sceneFacts();
await sleep(450);
const D = await sceneFacts();
ok('B2 the boot menu still snows after the stuck chain: arm\'s flips re-assert the scene - running ' + C.running + ', painted frames ' + C.frames + ' -> ' + D.frames + ', canvas ' + C.cvVis + ', menu background ' + JSON.stringify(C.rmBg),
  shown2 === true && C.rmBoot === true && C.running === true && D.frames > C.frames && C.scene === true && C.cvVis === 'visible' && C.cvAway === false && C.rmBg === 'none');

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
