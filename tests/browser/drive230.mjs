import fs from 'node:fs';
import { launchDrive, finish, bootThrough } from './harness.mjs';

// drive230: page pinch is blocked at the gesture level everywhere
// except the map; every surface that scrolls still scrolls.

const index = JSON.parse(fs.readFileSync(new URL('../../packs/index.json', import.meta.url), 'utf8'));
const { proc, send, S, ev, poll, sleep } = await launchDrive();
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`);
  return typeof raw === 'string' ? JSON.parse(raw) : {}; };

// synthetic events: this rig never fires real gesture events
const gesture = (selector, type) => ev(`(() => {
  const event = new Event(${JSON.stringify(type)}, { bubbles: true, cancelable: true });
  document.querySelector(${JSON.stringify(selector)}).dispatchEvent(event);
  return event.defaultPrevented;
})()`);

const wheelPoint = (id) => J(`(() => {
  const el = document.getElementById(${JSON.stringify(id)});
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { x, y, hits: !!(hit && hit.closest('#' + ${JSON.stringify(id)})),
    before: el.scrollTop, overflow: el.scrollHeight > el.clientHeight };
})()`);
const wheelScrolls = async (id) => {
  const p = await wheelPoint(id);
  if (p.hits) await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p.x, y: p.y, deltaX: 0, deltaY: 240 }, S);
  const moved = p.hits ? await poll(`document.getElementById(${JSON.stringify(id)}).scrollTop > ${p.before}`, 3000) : false;
  return { ...p, moved };
};

if (!await poll(`document.querySelector('#map canvas.maplibregl-canvas')
  && document.getElementById('routeMenu').classList.contains('show')`, 30000)) {
  throw new Error('The map and cold-open Routes menu did not boot');
}

// the one surface that never scrolls carries the CSS block; the
// menus keep theirs off, because they scroll
for (const [selector, expected, label] of [['#splash', true, '#splash touch-action is none'], ['#routeMenu', false, '#routeMenu touch-action is not none'], ['#setMenu', false, '#setMenu touch-action is not none']]) {
  const action = await ev(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).touchAction`);
  ok(label, (action === 'none') === expected);
}

// synthetic pinches: stopped on every app surface, never on the map
for (const selector of ['#splash', '#routeMenu', '#setMenu']) {
  for (const type of ['gesturestart', 'gesturechange']) {
    ok(`${type} on ${selector} is stopped`, await gesture(selector, type));
  }
}
for (const [type, label] of [['gesturestart', 'gesturestart on the map canvas is not stopped'], ['gesturechange', 'gesturechange on the map canvas is not stopped']]) {
  ok(label, (await gesture('#map canvas.maplibregl-canvas', type)) === false);
}

// the Routes city list populates and scrolls inside the route menu
// (the file-based harness cannot fetch the shipped catalog directly)
await ev(`(() => {
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = (url, options) => String(url).includes('packs/index.json')
    ? Promise.resolve(new Response(${JSON.stringify(JSON.stringify(index))}))
    : fetchOriginal(url, options);
  crPackIndexP = null;
  crPackIndexKnown = false;
  crWarmCityLibrary();
  document.getElementById('rmCreate').click();
  document.getElementById('crDoorList').click();
})()`);
const listReady = await poll(`(() => {
  const list = document.getElementById('crCityList');
  return document.getElementById('rmCityListPane').classList.contains('on')
    && list.querySelectorAll('.routeRow').length === ${index.cities.length}
    && list.scrollHeight > list.clientHeight;
})()`, 10000);
ok('the populated city list overflows inside the Routes menu', listReady);
const cityScroll = await wheelScrolls('crCityList');
ok('the wheel target is inside the visible city list', cityScroll.hits);
ok('wheel input scrolls the Routes city list', cityScroll.moved);

// back out of the create flow and load Route 5W through the real doors
await ev(`document.getElementById('rmCityListBack').click()`);
await ev(`document.getElementById('rmBack2').click()`);
await bootThrough(ev, poll);

// the net is wide: only a gesture starting inside the map passes
ok('gesturestart on the dock is stopped', await gesture('#dock', 'gesturestart'));
ok('gesturestart on the loaded map canvas is not stopped', (await gesture('#map canvas.maplibregl-canvas', 'gesturestart')) === false);

// the open sheet: its body keeps its pan-y contract, a pinch on it
// is stopped, and it still scrolls
await ev(`document.getElementById('streetsBtn').click()`);
ok('the list sheet opens', await poll(`document.getElementById('sheet').classList.contains('open')`, 5000));
await poll(`(() => { const t = document.getElementById('sheet').getBoundingClientRect().top;
  const prev = (window.__d230SheetTop || 0); window.__d230SheetTop = t; return prev !== 0 && Math.abs(t - prev) < 0.5; })()`, 5000);
const sheetAction = await ev(`getComputedStyle(document.getElementById('sheetBody')).touchAction`);
ok('#sheetBody touch-action is still pan-y', sheetAction === 'pan-y');
ok('gesturestart on the sheet body is stopped', await gesture('#sheetBody', 'gesturestart'));
const sheetScroll = await wheelScrolls('sheetBody');
ok('the wheel target is inside the open sheet body', sheetScroll.hits);
ok('wheel input scrolls the open sheet body', sheetScroll.moved);
await ev(`document.getElementById('streetsBtn').click()`);
await poll(`!document.getElementById('sheet').classList.contains('open')`, 5000);

// the Settings menu itself scrolls: shrink the viewport until its
// content genuinely overflows, then wheel over it
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 380, deviceScaleFactor: 2, mobile: true }, S);
await sleep(600);
await ev(`document.getElementById('setBtn').click()`);
ok('the Settings menu opens', await poll(`document.getElementById('setMenu').classList.contains('open')`, 5000));
await ev(`document.getElementById('stBtn').click()`);
await poll(`document.getElementById('setStatusPane').classList.contains('on')`, 5000);
await poll(`(() => { const h = document.getElementById('setMenu').getBoundingClientRect().height;
  const prev = (window.__d230SetH || 0); window.__d230SetH = h; return prev !== 0 && Math.abs(h - prev) < 0.5; })()`, 5000);
const setScroll = await wheelScrolls('setMenu');
ok('the Settings menu overflows at the shrunken height', setScroll.overflow);
ok('the wheel target is inside the Settings menu', setScroll.hits);
ok('wheel input scrolls the Settings menu', setScroll.moved);
await ev(`document.getElementById('setClose').click()`);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);

finish(R, proc);
