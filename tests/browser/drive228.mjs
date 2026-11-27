import { launchDrive, finish, tapById } from './harness.mjs';
import { createFetchStub, featureStub } from './create-fixture.mjs';
import fs from 'node:fs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();

// drive228: the surface walk - every blue menu surface, both modes,
// snow standing at each stop (Andrew's ruling, 2026-11-26).

const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`);
  return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const ROUTE_PANES = ['rmMain', 'rmListPane', 'rmCreatePane', 'rmCityListPane', 'rmCityPane', 'rmNamePane'];
const SET_PANES = ['setMainPane', 'setStatusPane', 'setJobPane', 'setChimePane', 'setBackupPane', 'setAboutPane'];

// ---------- the snow trio, sampled at a stop ----------
const effOp = async () => { const v = await ev(`(() => { const el = document.getElementById('snowCv'); if (!el) return -1; let o = 1, n = el;
  while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); if (n === document.documentElement) break; n = n.parentElement; }
  return Math.round(o * 1000) / 1000; })()`); return typeof v === 'number' ? v : -1; };
const sample = async (menuId) => {
  const a = await J(`({ running: window.__snow ? window.__snow.running() : null, frames: window.__snow ? window.__snow.frames() : -1,
    vis: getComputedStyle(document.getElementById('snowCv')).visibility,
    away: document.getElementById('snowCv').classList.contains('away'),
    menuBg: ${menuId ? `getComputedStyle(document.getElementById('${menuId}')).backgroundImage` : `'skip'`} })`);
  a.op = await effOp();
  await sleep(300);
  a.f2 = await J(`window.__snow ? window.__snow.frames() : -1`);
  return a;
};
const trio = (s, needBg) => s.running === true && s.f2 > s.frames && s.vis === 'visible' && s.op >= 0.99 && s.away === false && (!needBg || s.menuBg === 'none');
const paneOn = id => poll(`document.getElementById('${id}').classList.contains('on')`, 10000).then(() => true).catch(() => false);
const judged = {};
const stop = async (label, paneId, menuId) => {
  const on = paneId ? await paneOn(paneId) : true;
  const s = await sample(menuId);
  const pass = on === true && trio(s, !!menuId);
  if (paneId) judged[paneId] = judged[paneId] === true || pass;
  ok(label + ' | ' + JSON.stringify(s), pass);
  return pass;
};

// ---------- create-flow fixtures (the drive150 seam, Bordeaux only) ----------
const FIXDATA = JSON.parse(fs.readFileSync(new URL('./fixtures/create-osm.json', import.meta.url), 'utf8'));
const FIXTURE = {
  nominatim: [{ display_name: 'Bordeaux Drive, Vaughan, Ontario, Canada', lat: '43.798972', lon: '-79.574666', address: { city: 'Vaughan' } }],
  nominatimCity: [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8367', lon: '-79.4982', boundingbox: ['43.7256', '43.9538', '-79.6120', '-79.3858'], class: 'place', type: 'city',
    address: { city: 'Vaughan', state: 'Ontario', country: 'Canada' } }],
  overpass: { 'Bordeaux Drive': FIXDATA.overpass['Bordeaux Drive'], 'Alderson Avenue': FIXDATA.overpass['Alderson Avenue'] }
};
const installStub = createFetchStub(FIXTURE);
const installFeatureStub = featureStub;
const pickCityVaughan = async () => {
  await ev(`(() => { const i = document.getElementById('crCityInput'); i.value = 'Vaughan'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rows = await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 1`, 10000).then(() => true).catch(() => false);
  if (rows) await ev(`document.querySelector('#crCityResults .routeRow').click()`);
  return await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 15000).then(() => true).catch(() => false);
};
const toNamePane = async () => {
  const ready = await poll(`crPrepState === 'ready'`, 10000).then(() => true).catch(() => false);
  if (!ready) { await ev(`crStartPrep({ lat: 43.798972, lng: -79.574666 })`); await poll(`crPrepState === 'ready'`, 25000).catch(() => false); }
  await ev(installFeatureStub);
  await ev(`(() => { window.__fixtureRoads = ['Bordeaux Drive']; map.fire('click', { lngLat: { lat: 43.798972, lng: -79.574666 }, point: { x: 210, y: 320 }, originalEvent: {} }); return true; })()`);
  const got = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux Drive']`, 20000).then(() => true).catch(() => false);
  if (!got) return false;
  await ev(`document.getElementById('crDoneBtn').click()`);
  const pv = await poll(`document.getElementById('previewSheet').classList.contains('on')`, 10000).then(() => true).catch(() => false);
  if (!pv) return false;
  await ev(`document.getElementById('pvSaveBtn').click()`);
  return await paneOn('rmNamePane');
};
const exitCreate = async () => {
  await ev(`document.getElementById('crNameBack').click()`);
  await poll(`document.getElementById('previewSheet').classList.contains('on')`, 10000).catch(() => false);
  await ev(`document.getElementById('pvStartOverBtn').click()`);
  const dlg = await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 3000).then(() => true).catch(() => false);
  if (dlg) await ev(`document.getElementById('crModalYes').click()`);
  return await paneOn('rmCreatePane');
};

// ================= BOOT MODE =================
const splashSeen = await poll(`!!document.getElementById('splash')`, 15000).then(() => true).catch(() => false);
await poll(`!!window.__snow && window.__snow.running()`, 15000).catch(() => false);
const sSplash = await sample(null);
const splashPass = splashSeen === true && trio(sSplash, false);
judged['splash'] = splashPass;
ok('W1 boot splash: the snow stands at the cold start | splash ' + splashSeen + ' ' + JSON.stringify(sSplash), splashPass);
await poll(`document.getElementById('routeMenu').classList.contains('show')`, 30000).catch(() => false);
await stop('W2 boot rmMain (the boot picker)', 'rmMain', 'routeMenu');
await ev(installStub);
await tapById(ev, 'rmChoose');
await stop('W3 boot rmListPane (Choose a route)', 'rmListPane', 'routeMenu');
await tapById(ev, 'rmBack');
await paneOn('rmMain');
await tapById(ev, 'rmCreate');
await stop('W4 boot rmCreatePane (the create doors)', 'rmCreatePane', 'routeMenu');
await tapById(ev, 'crDoorList');
await stop('W5 boot rmCityListPane (Select from list)', 'rmCityListPane', 'routeMenu');
await tapById(ev, 'rmCityListBack');
await paneOn('rmCreatePane');
await tapById(ev, 'crDoorManual');
await stop('W6 boot rmCityPane (manual city search)', 'rmCityPane', 'routeMenu');
const inPickB = await pickCityVaughan();
const namedB = inPickB ? await toNamePane() : false;
if (namedB) await stop('W7 boot rmNamePane (name your route)', 'rmNamePane', 'routeMenu');
else ok('W7 boot rmNamePane (name your route) | the create flow never reached the name pane (inPick ' + inPickB + ')', false);
await exitCreate();
await tapById(ev, 'rmBack2');
await paneOn('rmMain');

// ================= TAB MODE =================
await tapById(ev, 'rmChoose');
await paneOn('rmListPane');
await ev(`(() => { const r = document.querySelector('#rmRoutes .routeRow'); if (r) { r.click(); const b = r.nextElementSibling && r.nextElementSibling.querySelector('.dropLoad'); if (b) b.click(); } return true; })()`);
const loaded = await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000).then(() => true).catch(() => false);
await poll(`!document.getElementById('splash')`, 20000).catch(() => false);
ok('W0 the walk crossed into tab mode on a genuine boot pick | routeLoaded ' + loaded, loaded === true);
await tapById(ev, 'routesBtn');
await stop('W8 tab rmMain (Routes home)', 'rmMain', 'routeMenu');
await tapById(ev, 'rmChoose');
await stop('W9 tab rmListPane (Choose a route)', 'rmListPane', 'routeMenu');
await tapById(ev, 'rmBack');
await paneOn('rmMain');
await tapById(ev, 'rmCreate');
await stop('W10 tab rmCreatePane (the create doors)', 'rmCreatePane', 'routeMenu');
await tapById(ev, 'crDoorList');
await stop('W11 tab rmCityListPane (Select from list)', 'rmCityListPane', 'routeMenu');
await tapById(ev, 'rmCityListBack');
await paneOn('rmCreatePane');
await tapById(ev, 'crDoorManual');
await stop('W12 tab rmCityPane (manual city search)', 'rmCityPane', 'routeMenu');
await ev(installStub);
const inPickT = await pickCityVaughan();
const namedT = inPickT ? await toNamePane() : false;
if (namedT) await stop('W13 tab rmNamePane (name your route)', 'rmNamePane', 'routeMenu');
else ok('W13 tab rmNamePane (name your route) | the create flow never reached the name pane (inPick ' + inPickT + ')', false);
await exitCreate();
await tapById(ev, 'rmClose');
await sleep(500);

// ================= SETTINGS (tab mode) =================
await tapById(ev, 'setBtn');
await stop('W14 setMainPane (Settings home)', 'setMainPane', 'setMenu');
await tapById(ev, 'stBtn');
await stop('W15 setStatusPane (System Health)', 'setStatusPane', 'setMenu');
await tapById(ev, 'statusBack');
await paneOn('setMainPane');
await tapById(ev, 'jobBtn');
await stop('W16 setJobPane (Display and Sound)', 'setJobPane', 'setMenu');
await tapById(ev, 'chimeRow');
await stop('W17 setChimePane (the chime list)', 'setChimePane', 'setMenu');
await tapById(ev, 'chimeBack');
await paneOn('setJobPane');
await tapById(ev, 'jobBack');
await paneOn('setMainPane');
await tapById(ev, 'exportBtn');
await stop('W18 setBackupPane (Backup)', 'setBackupPane', 'setMenu');
await tapById(ev, 'setBack');
await paneOn('setMainPane');
await tapById(ev, 'aboutBtn');
await stop('W19 setAboutPane (About)', 'setAboutPane', 'setMenu');
await tapById(ev, 'aboutBack');
await paneOn('setMainPane');
await tapById(ev, 'setClose');

const livePanes = await J(`({ rm: [...document.querySelectorAll('#routeMenu .rmPane')].map(e => e.id),
  st: [...document.querySelectorAll('#setMenu .rmPane')].map(e => e.id) })`);
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const covered = Object.keys(judged).filter(k => judged[k]);
ok('W20 the walk judged every live pane: route ' + JSON.stringify(livePanes.rm) + ' settings ' + JSON.stringify(livePanes.st) + ' judged ' + JSON.stringify(covered.sort()),
  sameSet(livePanes.rm || [], ROUTE_PANES) && sameSet(livePanes.st || [], SET_PANES) && sameSet(covered, [...ROUTE_PANES, ...SET_PANES, 'splash']));

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
