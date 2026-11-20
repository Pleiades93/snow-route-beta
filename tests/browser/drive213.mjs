import { launchDrive, finish } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// drive213: /correct Phase 2, round C10 - the shipped form must match
// Andrew's APPROVED form, measured rendered, not asserted from the
// code. Phase 1's two instances, both corrected only when Andrew saw
// them himself (he was the check both times):
//   (1) Beta 1.237 (861393d): the approved centred-titles sample was
//       built SCOPED to the Routes menu - #routeMenu .rmTitle only -
//       leaving every Settings title at the left. His ruling widened
//       it the same evening: EVERY blue menu's titles (066ace3, the
//       base rule). Section A therefore ENUMERATES the class: every
//       .rmTitle in the document must compute text-align:center, and
//       a rendered sample across both menus must measure centred -
//       a scope narrowed to one menu fails here by construction,
//       because the check names no menu.
//   (2) Beta 1.238 (5d2b50c): the cold-open Select City was built as
//       a floating sheet with a snow exemption - showRmPane kept the
//       snowfall canvas live behind that one pane. Andrew reverted
//       it wholesale at 1.239 (0373018): the pane is the plain blue
//       menu again, and snow lives only on the splash/load screens.
//       Section B measures the cold-open Select City in its approved
//       form: the snow canvas AWAY behind the pane, the pane
//       full-bleed in its menu (no floating sheet), and the city
//       list block centred (his 1.241 ruling).
// Both sections were proven failing on their real historical trees
// before this drive counted (the /correct discipline; runs recorded
// in the round's RECORD): A fails at 861393d on the Settings titles,
// B fails at 5d2b50c on the snow exemption and the sheet geometry.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

// ---------- B first: the cold-open Select City, in boot mode ----------
await poll(`typeof loadRoute === 'function'`, 20000);
await poll(`!!window.__bootAt`, 30000);
await ev(`document.getElementById('rmCreate').click()`);
await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
await ev(`document.getElementById('crDoorList').click()`);
const paneB = await poll(`document.getElementById('rmCityListPane').classList.contains('on')`, 10000).catch(() => false);
await sleep(600); // let the pane's entrance settle before measuring
const B = await J(`(() => {
  const menu = document.getElementById('routeMenu');
  const pane = document.getElementById('rmCityListPane');
  const list = document.getElementById('crCityList');
  const snow = document.getElementById('snowCv');
  const cs = getComputedStyle(pane);
  const mr = menu.getBoundingClientRect(), lr = list.getBoundingClientRect();
  return { boot: menu.classList.contains('boot'), snowAway: snow ? snow.classList.contains('away') : null,
    bgImg: cs.backgroundImage, radius: cs.borderRadius, shadow: cs.boxShadow,
    listCx: lr.left + lr.width / 2, listW: lr.width, menuCx: mr.left + mr.width / 2 };
})()`);
ok('B1 (approved form: no snow behind a menu) at the cold-open Select City the snowfall canvas is AWAY - snow lives on the splash/load screens only, never behind a menu pane (the 1.238 exemption kept it live behind this one pane) | ' + JSON.stringify(B),
  paneB === true && B.boot === true && B.snowAway === true);
ok('B2 (approved form: the plain menu, not a floating sheet) the Select City pane wears NO sheet form - transparent over the menu\'s own ground, square corners, no shadow (the 1.236-1.238 sheet wore the gradient itself at 26px radius with a shadow, floating over the scene) | ' + JSON.stringify(B),
  B.bgImg === 'none' && B.radius === '0px' && B.shadow === 'none');
ok('B3 (approved form: the centred block, 1.241) the city list block sits centred in the menu | ' + JSON.stringify(B),
  B.listW > 200 && Math.abs(B.listCx - B.menuCx) <= 3);

// ---------- load 5W for the tab-mode surfaces ----------
await ev(`document.querySelector('#rmCityListBack') ? document.getElementById('rmCityListBack').click() : true`);
await ev(`document.getElementById('rmBack2') ? document.getElementById('rmBack2').click() : true`);
await ev(`document.getElementById('rmChoose').click()`);
await ev(`document.querySelector('#rmRoutes .routeRow').click()`);
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
await poll(`!document.getElementById('splash')`, 20000);

// ---------- A: the centring class, enumerated ----------
const census = await J(`[...document.querySelectorAll('.rmTitle')].map(t => ({ text: t.textContent.trim(), align: getComputedStyle(t).textAlign, menu: t.closest('#setMenu') ? 'settings' : (t.closest('#routeMenu') ? 'routes' : 'other') }))`);
const uncentred = census.filter(t => t.align !== 'center' && t.align !== 'centre');
ok('A1 (the class, enumerated - 1.237\'s scope failure cannot recur silently) EVERY .rmTitle in the document computes text-align:center - ' + census.length + ' titles across both blue menus, none named, none exempt | uncentred: ' + JSON.stringify(uncentred),
  census.length >= 10 && uncentred.length === 0);

// Rendered centre proof on a sample spanning both menus: the title
// TEXT's own box (a Range over its text node) centred in its pane.
const measureTitle = async (paneId) => J(`(() => {
  const pane = document.getElementById(${JSON.stringify(paneId)});
  const t = pane ? pane.querySelector('.rmTitle') : null;
  if (!t) return { missing: true };
  const r = document.createRange(); r.selectNodeContents(t);
  const tr = r.getBoundingClientRect(), pr = pane.getBoundingClientRect();
  return { text: t.textContent.trim(), d: Math.abs((tr.left + tr.width / 2) - (pr.left + pr.width / 2)) };
})()`);
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmChoose').click()`);
await poll(`document.getElementById('rmListPane').classList.contains('on')`, 10000);
const mRoutes = await measureTitle('rmListPane');
await ev(`document.getElementById('rmBack').click()`);
await ev(`document.getElementById('rmCreate').click()`);
await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
const mCreate = await measureTitle('rmCreatePane');
await ev(`document.getElementById('rmClose').click()`);
await sleep(400);
await ev(`document.getElementById('setBtn').click()`);
await poll(`document.getElementById('setMenu').classList.contains('open')`, 10000);
await ev(`document.getElementById('stBtn').click()`);
await poll(`document.getElementById('setStatusPane').classList.contains('on')`, 10000);
const mSettings = await measureTitle('setStatusPane');
await ev(`document.getElementById('setClose').click()`);
ok('A2 (rendered centre, both menus) the title text measures centred in its pane on the Routes list pane, the Create pane and the Settings menu - geometry, not just the declared rule | ' + JSON.stringify({ mRoutes, mCreate, mSettings }),
  !mRoutes.missing && mRoutes.d <= 3 && !mCreate.missing && mCreate.d <= 3 && !mSettings.missing && mSettings.d <= 3);

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
