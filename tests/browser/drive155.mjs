import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCreateRig, serveRepo, makeResults, finishCreate, sleep } from './harness-create.mjs';

// drive155: Beta 1.126 - CREATE AFTER DELETE (Andrew's device report,
// 2026-11-06, on 1.124/1.125). He deleted the route he had created
// (it was the ACTIVE route), went back to Create new route, and the
// creation screen was broken: (a) the street search bar never showed
// up; (b) after finally selecting a road, the bottom panel listing the
// selected roads never appeared. First-time creation on the same
// phone (1.123, before any delete) worked end to end.
// ROOT CAUSE (proven by A1/A2 below on the 1.125 tree): 1.124's
// unloadRouteToBoot re-adds the `boot` class to <html>, claiming to
// mirror a cold boot. But a cold boot's RESTING picker state has NO
// html.boot: the boot tail's arm() removes it when the menu arms
// (~1900ms), precisely so the shell is functional from then on. The
// 1.86 rule `html.boot body > *:not(#splash):not(#routeMenu):not(#map)
// { display: none !important }` therefore stays in force after a
// delete for the whole session: #routeMenu (excepted) still works,
// the map (excepted) still takes taps, but #createBar, #createSheet,
// #createResults and #createHint are force-hidden no matter what
// classes the create flow sets - the exact two symptoms reported
// (plus the 'Route deleted' toast, also a body child, never paints).
// The class assertions alone CANNOT see this (setCreateStage sets .on
// correctly), so every visibility assertion here reads the COMPUTED
// display, not the class list.
//   A (the reported path): seed created routes, load route-2, delete
//      it ACTIVE through the real UI (row Delete -> confirm Yes),
//      land on the boot picker, then Create -> Select from list ->
//      Vaughan: the pick stage is reached, html carries NO boot class
//      at the resting picker, #createBar + #createSheet are COMPUTED
//      visible, the street search returns a selectable result whose
//      panel is computed visible, and a tapped street lands in the
//      draft with the bottom sheet VISIBLE and naming it.
//   B (sibling control): delete a NON-active created route (5W stays
//      loaded), then create the same way from the tab entry - the
//      same visibility + add assertions. Green on 1.125 too: it pins
//      that the breakage belongs to the active-delete path alone.
// Red side (pristine 1.125 tree): A1 fails (html.boot present at the
// resting picker), A2 fails (computed display 'none' for the bar and
// the sheet), A3 fails on its visibility half (results exist in the
// DOM but compute to 'none'), A4 fails on its visibility half (the
// street adds invisibly; the sheet naming it computes to 'none').
// B1/B2 pass there - the control is green on both trees by design.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKFX = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'browser', 'fixtures', 'city-pack-vaughan.json'), 'utf8'));
const INDEXFX = JSON.parse(fs.readFileSync(path.join(REPO, 'packs', 'index.json'), 'utf8'));
const VAUGHAN_NAME = (INDEXFX.cities.find(c => c.slug === 'vaughan') || {}).name; // premise derivation (Tranche 4 / T2, 2026-11-08): expectations about the shipped world derive from source - see pack-expect.mjs (the list-row name for the vaughan pack derives from the shipped index, keyed by its slug)
const { R, ok } = makeResults();

const STREET_BORDEAUX = [
  { place_id: 991001, osm_type: 'way', osm_id: 555001, lat: '43.798972', lon: '-79.574666', category: 'highway', type: 'residential', place_rank: 26, name: 'Bordeaux Drive', display_name: 'Bordeaux Drive, Woodbridge, Vaughan, York Region, Ontario, Canada', address: { road: 'Bordeaux Drive', suburb: 'Woodbridge', city: 'Vaughan', county: 'York Region', state: 'Ontario', country: 'Canada', country_code: 'ca' } }
];
const TEST_PACK = name => ({ name, area: 'Vaughan', mains: [], roads: { 'Test Street': [[[43.8, -79.57], [43.801, -79.571]]] }, reference: {} });

// ---- static server + CDP rig (shared: harness-create.mjs; this drive's routing table is fulfil, below) ----
const { server, ORIGIN } = await serveRepo(REPO);
async function fulfil(sessionId, p, H) {
  const send = H.send;
  const url = p.request.url;
  const json = (obj, code) => H.json(sessionId, p, obj, code);
  try {
    const pn = new URL(url).pathname;
    if (pn.endsWith('/packs/index.json')) { wire.push({ kind: 'packindex', url }); return await json(INDEXFX); }
    if (pn.endsWith('/packs/vaughan.json')) { wire.push({ kind: 'packfile', slug: 'vaughan.json', url }); return await json(PACKFX); }
    if (/\/packs\/[^/]+\.json$/.test(pn)) { wire.push({ kind: 'packfile', slug: pn.split('/').pop(), url }); return await json('nf', 404); }
    if (url.indexOf('nominatim.openstreetmap.org') >= 0) {
      wire.push({ kind: 'nominatim', url });
      if (/bordeaux/i.test(decodeURIComponent(url))) return await json(STREET_BORDEAUX);
      return await json([]);
    }
    if (url.indexOf('overpass') >= 0) { wire.push({ kind: 'overpass', url }); return await json({ elements: [] }); }
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: r.status, responseHeaders: [{ name: 'Content-Type', value: r.headers.get('content-type') || 'application/octet-stream' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: buf.toString('base64') }, sessionId);
  } catch (e) { try { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); } catch (e2) {} }
}
const wire = [];
const rig = await startCreateRig({ profile: '/tmp/d155profile-' + Date.now(), fulfil, jsonMode: 'coded' });
const { proc, send, PAGE_S, ev2, poll, consoleLog, J, bootRoute } = rig;
const openListTab = async () => {
  await ev2(`openRouteMenu()`);
  await ev2(`document.getElementById('rmChoose').click()`);
  return await poll(`document.getElementById('rmListPane').classList.contains('on') && !!document.querySelector('#rmRoutes .routeRow')`, 10000);
};
const deleteViaUi = async (id) => {
  await ev2(`(() => { const r = document.querySelector('#rmRoutes .routeRow[data-route="${id}"] .routeDel'); if (r) r.click(); return true; })()`);
  await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
  await ev2(`document.getElementById('crModalYes').click()`);
};
const pickVaughanFromList = async () => {
  await ev2(`document.getElementById('crDoorList').click()`);
  await poll(`document.getElementById('rmCityListPane').classList.contains('on')`, 10000);
  await poll(`document.querySelectorAll('#crCityList .routeRow').length === ${INDEXFX.cities.length}`, 15000); // premise fix (2026-11-07, Andrew-approved, test-only): index-derived count - the baked-in 5 expired silently (a 15 s timeout) when the catalogue grew to twelve
  await ev2(`(() => { const r = [...document.querySelectorAll('#crCityList .routeRow')].find(x => { const n = x.querySelector('.routeName'); return n && n.textContent === ${JSON.stringify(VAUGHAN_NAME)}; }); if (r) r.click(); return true; })()`);
  const inPick = await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 15000);
  const ready = await poll(`crPrepState === 'ready'`, 30000);
  return inPick === true && ready === true;
};
const typeStreet = q => ev2(`(() => { const i = document.getElementById('crSearchInput'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const installFeatureSeam = () => ev2(`(() => { if (!map.__qrfOrig) map.__qrfOrig = map.queryRenderedFeatures.bind(map); window.__fixtureRoads = []; map.queryRenderedFeatures = () => window.__fixtureRoads.map(n => ({ type: 'Feature', sourceLayer: 'roads', properties: { name: n }, geometry: { type: 'LineString', coordinates: [] } })); return true; })()`);
const tapStreet = name => ev2(`(() => { window.__fixtureRoads = [${JSON.stringify(name)}]; map.fire('click', { lngLat: { lat: 43.798972, lng: -79.574666 }, point: { x: 210, y: 320 }, originalEvent: {} }); return true; })()`);
const visState = () => J(`({ htmlBoot: document.documentElement.classList.contains('boot'), bar: getComputedStyle(document.getElementById('createBar')).display, sheet: getComputedStyle(document.getElementById('createSheet')).display, hint: getComputedStyle(document.getElementById('createHint')).display, results: getComputedStyle(document.getElementById('createResults')).display })`);
const sheetState = () => J(`({ count: document.getElementById('crCount').textContent, list: document.getElementById('crPickList').textContent, sheet: getComputedStyle(document.getElementById('createSheet')).display })`);

// ---- seed created routes through the real userpacks record ----
await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
await poll(`!!document.getElementById('ver')`, 20000);
await poll(`typeof routeKeys === 'function' && typeof readUserPacks === 'function'`, 20000);
await ev2(`(() => { const rec = { 'route-2': ${JSON.stringify(TEST_PACK('Route 2'))}, 'route-3': ${JSON.stringify(TEST_PACK('Route 3'))}, 'route-4': ${JSON.stringify(TEST_PACK('Route 4'))} }; localStorage.setItem('snowroute.v2.userpacks', JSON.stringify(rec)); for (const id of Object.keys(rec)) { const rk = routeKeys(id); const vals = { done: '[]', times: '{}', hist: '[]', notes: '{}', via: '{}', trail: '[]', cov: '{}', start: '0', flip: '{}', sides: '{"p":{},"t":{}}', sess: '[]', pre: '{"at":0}', snap: '{"x":1}', mig: '1' }; for (const f of Object.keys(rk)) localStorage.setItem(rk[f], vals[f] || 'x'); } return true; })()`);
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await bootRoute();

// ---- phase A: delete the ACTIVE created route, then create again ----
await openListTab();
await ev2(`(() => { const r = document.querySelector('#rmRoutes .routeRow[data-route="route-2"]'); if (r) r.click(); return true; })()`);
const loadedA = await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true && activeRoute && activeRoute.id === 'route-2'`, 20000);
await openListTab();
await deleteViaUi('route-2');
const bootA = await poll(`routeLoaded === false && activeRoute === null && document.getElementById('routeMenu').classList.contains('boot') && document.getElementById('routeMenu').classList.contains('show') && document.getElementById('rmMain').classList.contains('on')`, 15000);
const restA = await J(`({ htmlBoot: document.documentElement.classList.contains('boot'), rmBoot: document.getElementById('routeMenu').classList.contains('boot'), rmShow: document.getElementById('routeMenu').classList.contains('show') })`);
ok('A1 THE RESTING PICKER AFTER AN ACTIVE DELETE CARRIES NO html.boot: the menu is in boot mode and shown, but <html> does NOT carry the boot class - a cold boot\'s arm() removes it when the menu arms, and that removal is what makes the shell functional; 1.124\'s unload re-added it and nothing removed it again | loaded first: ' + loadedA + ', landed on picker: ' + bootA + ' | ' + JSON.stringify(restA),
  loadedA === true && bootA === true && restA.rmBoot === true && restA.rmShow === true && restA.htmlBoot === false);
await ev2(`document.getElementById('rmCreate').click()`);
await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
const readyA = await pickVaughanFromList();
const visA = await visState();
ok('A2 THE SEARCH BAR AND THE BOTTOM SHEET ARE COMPUTED VISIBLE IN THE PICK STAGE: after the active delete, Create -> Select from list -> Vaughan reaches a ready pick stage with #createBar and #createSheet actually displayed (computed style, not just the .on class the 1.86 boot rule overrides) | ready: ' + readyA + ' | ' + JSON.stringify(visA),
  readyA === true && visA.bar === 'flex' && visA.sheet === 'flex' && visA.htmlBoot === false);
await typeStreet('Bordeaux');
const resA = await poll(`document.querySelectorAll('#createResults .crResult').length >= 1`, 15000);
const resVisA = await J(`({ results: getComputedStyle(document.getElementById('createResults')).display, first: (document.querySelector('#createResults .crResult') || {}).textContent || '' })`);
await ev2(`(() => { const b = document.querySelector('#createResults .crResult'); if (b) b.click(); return true; })()`);
const pickedA = await poll(`!document.getElementById('createResults').classList.contains('on') && Math.abs(map.getCenter().lng - (-79.574666)) < 0.01 && Math.abs(map.getCenter().lat - 43.798972) < 0.01`, 15000);
ok('A3 THE STREET SEARCH WORKS AND ITS RESULTS PANEL IS VISIBLE: typing "Bordeaux" returns the selectable result in a panel that computes to displayed, and selecting it closes the results and flies to the street | results found: ' + resA + ', picked: ' + pickedA + ' | ' + JSON.stringify(resVisA),
  resA === true && resVisA.results === 'block' && resVisA.first.indexOf('Bordeaux Drive') === 0 && pickedA === true);
await installFeatureSeam();
await tapStreet('Bordeaux Drive');
const addedA = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux Drive']`, 15000);
const sheetA = await sheetState();
ok('A4 THE BOTTOM PANEL APPEARS AND NAMES THE SELECTED ROAD: tapping Bordeaux adds it to the draft and the count sheet is displayed, reads "1 streets" and lists Bordeaux - the exact panel Andrew reported missing | added: ' + addedA + ' | ' + JSON.stringify(sheetA),
  addedA === true && sheetA.sheet === 'flex' && sheetA.count.indexOf('1 roads') === 0 && sheetA.list.indexOf('Bordeaux') >= 0); // Beta 1.127 premise update: the picked-roads panel header counts 'N roads' (the old count sheet said 'N streets'); the list still names Bordeaux
await ev2(`exitCreate()`);

// ---- phase B: delete a NON-active created route, then create (control) ----
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await bootRoute();
await openListTab();
await deleteViaUi('route-4');
const goneB = await poll(`!document.querySelector('#rmRoutes .routeRow[data-route="route-4"]') && routeLoaded === true && activeRoute && activeRoute.id === '5w'`, 15000);
await ev2(`document.getElementById('rmCreate').click()`);
await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
const readyB = await pickVaughanFromList();
const visB = await visState();
ok('B1 CONTROL - CREATE AFTER A NON-ACTIVE DELETE: 5W stayed loaded through route-4\'s deletion, and the pick stage readies with the bar and sheet computed visible (this path was never broken - it pins the breakage to the active-delete unload) | deleted: ' + goneB + ', ready: ' + readyB + ' | ' + JSON.stringify(visB),
  goneB === true && readyB === true && visB.bar === 'flex' && visB.sheet === 'flex' && visB.htmlBoot === false);
await installFeatureSeam();
await tapStreet('Bordeaux Drive');
const addedB = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux Drive']`, 15000);
const sheetB = await sheetState();
ok('B2 CONTROL - THE SHEET NAMES THE ROAD THERE TOO: the tapped street lands in the draft and the visible count sheet lists it | added: ' + addedB + ' | ' + JSON.stringify(sheetB),
  addedB === true && sheetB.sheet === 'flex' && sheetB.count.indexOf('1 roads') === 0 && sheetB.list.indexOf('Bordeaux') >= 0); // Beta 1.127 premise update: the panel header counts 'N roads'
await ev2(`exitCreate()`);

R.exceptions = consoleLog.filter(l => l.indexOf('EXCEPTION') === 0);
finishCreate(R, proc, server, { pretty: true });
