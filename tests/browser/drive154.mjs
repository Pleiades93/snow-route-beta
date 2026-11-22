import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCreateRig, serveRepo, makeResults, finishCreate, sleep } from './harness-create.mjs';

// drive154: Beta 1.124 - ROUTE DELETION + the doors-first create gate
// (Andrew, approved from the rendered mockup 2026-11-06). Same rig as
// drive153 (own CDP session, Fetch interception at the NETWORK layer,
// the page's window.fetch is the browser's own); the interception
// serves the shipped packs/index.json, the trimmed Vaughan fixture
// pack, jsonv2-shaped Nominatim city answers and a street answer for
// the pick-stage search. What it proves:
//   A (doors): the tab entry's Create pane is "Create new route" with
//      the two primary doors + their exact sub-lines and the QUIETER
//      photo door (smaller type); Back links walk pane to pane
//      (doors -> main, list -> doors, photo -> doors).
//   B (list pick + STREET SEARCH): Select from list renders the index
//      cities as rows with street counts; tapping Vaughan readies
//      from the pack with zero Overpass; the creation screen then
//      SHOWS the street search bar and typing "Bordeaux" returns the
//      selectable autocomplete result; selecting it closes the
//      results, flies to the street and names the area - exactly the
//      manual path's behaviour (Andrew's added requirement).
//   C (manual path parity): Manual search -> King (grid) -> the
//      same street search works there too.
//   D (boot entry): the cold-start picker shows the IDENTICAL doors
//      (same title, same door texts, same quiet photo door); its
//      manual door reaches the city pane and Back returns to doors.
//   E (delete, inactive): created routes are seeded through the real
//      userpacks record; their rows carry Delete, the shipped 5W row
//      does NOT; the Delete tap does NOT load the route (the menu
//      stays open, 5W stays active); the confirm is the shared modal
//      with the exact title/body/Cancel/Delete labels and the danger
//      Yes; its computed background + text colour EQUAL the theme
//      tokens in day AND night (Andrew's night requirement - red on
//      any hardcoded white); Cancel leaves everything; Delete removes
//      the userpacks entry, EVERY routeKeys key, and the row.
//   F (delete, ACTIVE): deleting the loaded created route returns
//      the app to the boot picker (route unloaded, menu in boot mode
//      over the main pane, zero geometry) with its keys wiped.
//   G (storage failure): with localStorage.setItem throwing on the
//      userpacks key, deletion toasts the storage problem and the
//      route stays listed with its data intact.
// Red side (against the pristine 1.123 tree): A/B/D cannot start
// (no #crDoorList / #rmCityListPane exist), E-G cannot start (no
// dropdown Delete, no deleteRoute) - every check here is red there.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'browser', 'fixtures', 'create-osm.json'), 'utf8'));
const PACKFX = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'browser', 'fixtures', 'city-pack-vaughan.json'), 'utf8'));
const INDEXFX = JSON.parse(fs.readFileSync(path.join(REPO, 'packs', 'index.json'), 'utf8'));
const VAUGHAN_NAME = (INDEXFX.cities.find(c => c.slug === 'vaughan') || {}).name; // premise derivation (Tranche 4 / T2, 2026-11-08): expectations about the shipped world derive from source - see pack-expect.mjs (the list-row name for the vaughan pack derives from the shipped index, keyed by its slug)
const { R, ok } = makeResults();

// ---- fixture worlds ----
const ALL_WAYS = [];
for (const n of Object.keys(FIX.overpass)) for (const w of FIX.overpass[n]) ALL_WAYS.push({ type: 'way', id: w.id, tags: { name: n }, geometry: w.geometry });
function payloadFor(body) {
  const nm = /"name"="([^"]+)"/.exec(body);
  const bm = /\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/.exec(body);
  let els = ALL_WAYS;
  if (nm) els = els.filter(w => w.tags.name === nm[1]);
  if (bm) { const s = +bm[1], w = +bm[2], n = +bm[3], e = +bm[4]; els = els.filter(wy => wy.geometry.some(g => g.lat >= s - 0.001 && g.lat <= n + 0.001 && g.lon >= w - 0.001 && g.lon <= e + 0.001)); }
  return { elements: els };
}
const CITY_KING = [
  { place_id: 340000001, osm_type: 'relation', osm_id: 324999, lat: '43.9500000', lon: '-79.6400000', category: 'boundary', type: 'administrative', place_rank: 16, importance: 0.31, addresstype: 'town', name: 'King', display_name: 'King, York Region, Ontario, Canada', address: { town: 'King', county: 'York Region', state: 'Ontario', country: 'Canada', country_code: 'ca' }, boundingbox: ['43.9300000', '43.9700000', '-79.6800000', '-79.6000000'] }
];
const STREET_BORDEAUX = [
  { place_id: 991001, osm_type: 'way', osm_id: 555001, lat: '43.798972', lon: '-79.574666', category: 'highway', type: 'residential', place_rank: 26, name: 'Bordeaux Drive', display_name: 'Bordeaux Drive, Woodbridge, Vaughan, York Region, Ontario, Canada', address: { road: 'Bordeaux Drive', suburb: 'Woodbridge', city: 'Vaughan', county: 'York Region', state: 'Ontario', country: 'Canada', country_code: 'ca' } }
];
const TEST_PACK = name => ({ name, area: 'Vaughan', primaries: [], roads: { 'Test Street': [[[43.8, -79.57], [43.801, -79.571]]] }, reference: {} });

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
      if (url.indexOf('featuretype=city') >= 0) {
        const q = decodeURIComponent((/[?&]q=([^&]+)/.exec(url) || [])[1] || '');
        if (/king/i.test(q)) return await json(CITY_KING);
        return await json([]);
      }
      if (/bordeaux/i.test(decodeURIComponent(url))) return await json(STREET_BORDEAUX);
      return await json([]);
    }
    if (url.indexOf('overpass') >= 0) {
      let raw = p.request.postData || '';
      if (!raw && p.request.postDataEntries && p.request.postDataEntries[0]) raw = Buffer.from(p.request.postDataEntries[0].bytes, 'base64').toString('utf8');
      const body = decodeURIComponent(raw.replace(/^data=/, '').replace(/\+/g, '%20'));
      wire.push({ kind: 'overpass', host: new URL(url).hostname, body });
      return await json(payloadFor(body));
    }
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: r.status, responseHeaders: [{ name: 'Content-Type', value: r.headers.get('content-type') || 'application/octet-stream' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: buf.toString('base64') }, sessionId);
  } catch (e) { try { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); } catch (e2) {} }
}
const wire = [];
const rig = await startCreateRig({ profile: '/tmp/d154profile-' + Date.now(), fulfil, jsonMode: 'coded' });
const { proc, send, PAGE_S, ev2, poll, consoleLog, J, bootRoute } = rig;
const openDoorsTab = async () => {
  await ev2(`openRouteMenu()`);
  await ev2(`document.getElementById('rmCreate').click()`);
  return await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
};
const openListTab = async () => { // tab mode -> Choose a route -> the list pane
  await ev2(`openRouteMenu()`);
  await ev2(`document.getElementById('rmChoose').click()`);
  return await poll(`document.getElementById('rmListPane').classList.contains('on') && !!document.querySelector('#rmRoutes .routeRow')`, 10000);
};
const typeStreet = q => ev2(`(() => { const i = document.getElementById('crSearchInput'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const typeCity = q => ev2(`(() => { const i = document.getElementById('crCityInput'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const count = kind => wire.filter(w => w.kind === kind).length;

// ---- phase A: the doors (tab entry) + the pane-to-pane Back chain ----
await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
await bootRoute();
const paneA = await openDoorsTab();
const doorsA = await J(`({ t: (document.querySelector('#rmCreatePane .rmTitle') || {}).textContent || '', list: document.getElementById('crDoorList').textContent, manual: document.getElementById('crDoorManual').textContent, photoGone: !document.getElementById('crDoorPhoto'), subs: document.querySelectorAll('#rmCreatePane .m-sub').length, fsList: parseFloat(getComputedStyle(document.getElementById('crDoorList')).fontSize) })`);
ok('A1 DOORS (tab entry; titles-only Beta 1.206, Andrew): Create opens on "Create new route" - TWO doors carrying TITLES ONLY, exactly "Select from list" / "Manual search", no description element in the pane, and the Upload photo door GONE (Beta 1.243) | ' + JSON.stringify(doorsA),
  paneA === true && doorsA.t === 'Create new route' && doorsA.list === 'Select from list' && doorsA.manual === 'Manual search' && doorsA.subs === 0 && doorsA.photoGone === true);
await ev2(`document.getElementById('crDoorList').click()`);
const toList = await poll(`document.getElementById('rmCityListPane').classList.contains('on')`, 10000);
await ev2(`document.getElementById('rmCityListBack').click()`);
const listBack = await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
await ev2(`document.getElementById('rmBack2').click()`);
const doorsBack = await poll(`document.getElementById('rmMain').classList.contains('on')`, 10000);
ok('A2 BACK CHAIN: every pane backs to the previous one (list -> doors, doors -> main) - no pane dead-ends or skips a level (Beta 1.243: the photo pane leg retires with the pane) | list:' + toList + ' listBack:' + listBack + ' doorsBack:' + doorsBack,
  toList === true && listBack === true && doorsBack === true);

// ---- phase B: list pick readies from the pack; the STREET SEARCH still works ----
await ev2(`document.getElementById('rmCreate').click()`);
await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
await ev2(`document.getElementById('crDoorList').click()`);
await poll(`document.getElementById('rmCityListPane').classList.contains('on')`, 10000);
const rowsB = await poll(`document.querySelectorAll('#crCityList .routeRow').length === ${INDEXFX.cities.length}`, 15000); // premise fix (2026-11-07, Andrew-approved, test-only): the row count derives from the shipped packs/index.json the drive serves - a future city self-adjusts
const listB = await J(`({ t: (document.querySelector('#rmCityListPane .rmTitle') || {}).textContent || '', names: [...document.querySelectorAll('#crCityList .routeRow')].map(r => ((r.querySelector('.routeName') || {}).childNodes && r.querySelector('.routeName').childNodes[0]) ? r.querySelector('.routeName').childNodes[0].textContent : ''), areas: [...document.querySelectorAll('#crCityList .routeRow')].filter(r => r.querySelector('.routeArea')).length })`);
ok('B1 LIST ROWS: the list pane is titled "Select City" and renders the index cities as NAME-ONLY rows - every index city present, no .routeArea element on any row (Beta 1.206, Andrew) | ' + JSON.stringify(listB),
  rowsB === true && listB.t === "Select City" && listB.areas === 0 && JSON.stringify(listB.names || []) === JSON.stringify(INDEXFX.cities.map(c => c.name)));
const wireB0 = wire.length;
await ev2(`(() => { const r = [...document.querySelectorAll('#crCityList .routeRow')].find(x => { const n = x.querySelector('.routeName'); return n && n.childNodes[0] && n.childNodes[0].textContent === ${JSON.stringify(VAUGHAN_NAME)}; }); if (r) r.click(); return true; })()`); // Beta 1.206: match the name's own text node - the last-used row's .routeName also carries the gold ' · last used' span
const readyB = await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick' && crPrepState === 'ready'`, 30000);
const wB = wire.slice(wireB0);
const barB = await J(`({ barOn: document.getElementById('createBar').classList.contains('on'), inputThere: !!document.getElementById('crSearchInput') })`);
ok('B2 LIST PICK READIES + THE SEARCH BAR IS THERE: Vaughan readies from the pack (zero Overpass) and the creation screen shows the street search bar (#createBar on, input present) - the list path lands on the same pick stage as the manual path | overpass: ' + wB.filter(w => w.kind === 'overpass').length + ' | ' + JSON.stringify(barB),
  readyB === true && wB.filter(w => w.kind === 'overpass').length === 0 && barB.barOn === true && barB.inputThere === true);
await typeStreet('Bordeaux');
const resB = await poll(`document.querySelectorAll('#createResults .crResult').length >= 1`, 15000);
const resTxtB = await J(`({ texts: [...document.querySelectorAll('#createResults .crResult')].map(b => b.textContent) })`);
await ev2(`(() => { const b = document.querySelector('#createResults .crResult'); if (b) b.click(); return true; })()`);
const pickedB = await poll(`!document.getElementById('createResults').classList.contains('on') && Math.abs(map.getCenter().lng - (-79.574666)) < 0.01 && Math.abs(map.getCenter().lat - 43.798972) < 0.01 && crAreaGuess === 'Vaughan'`, 15000);
ok('B3 STREET SEARCH AFTER A LIST PICK (Andrew\'s requirement): typing "Bordeaux" returns the selectable autocomplete result and selecting it behaves exactly as on the manual path - results close, the map flies to the street, the area is named | ' + JSON.stringify(resTxtB) + ' | street wire calls: ' + wire.filter(w => w.kind === 'nominatim' && /bordeaux/i.test(w.url)).length,
  resB === true && (resTxtB.texts || []).some(t => t.indexOf('Bordeaux Drive') === 0) && pickedB === true);
await ev2(`exitCreate()`);

// ---- phase C: the manual path's street search (parity) ----
// Beta 1.126 TEST-PREMISE UPDATE: 1.125 restyled the manual-search city
// results from .rmBtn to .routeRow; the selectors below follow.
await openDoorsTab();
await ev2(`document.getElementById('crDoorManual').click()`);
await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
await typeCity('King City');
await poll(`document.querySelectorAll('#crCityResults .routeRow').length >= 1`, 15000);
await ev2(`(() => { const b = document.querySelector('#crCityResults .routeRow'); if (b) b.click(); return true; })()`);
const readyC = await poll(`crPrepState === 'ready'`, 30000);
await typeStreet('Bordeaux');
const resC = await poll(`document.querySelectorAll('#createResults .crResult').length >= 1`, 15000);
await ev2(`(() => { const b = document.querySelector('#createResults .crResult'); if (b) b.click(); return true; })()`);
const pickedC = await poll(`!document.getElementById('createResults').classList.contains('on')`, 10000);
ok('C1 MANUAL PATH PARITY: King readies through the grid and the same street search returns + selects the Bordeaux result there too - one search behaviour, both doors | ready: ' + readyC + ', results: ' + resC + ', picked: ' + pickedC,
  readyC === true && resC === true && pickedC === true);
await ev2(`exitCreate()`);

// ---- phase D: boot entry - the IDENTICAL doors ----
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await poll(`!!document.getElementById('ver')`, 20000);
await poll(`!!window.__bootAt`, 30000);
await poll(`!!document.getElementById('rmCreate')`, 20000);
await ev2(`document.getElementById('rmCreate').click()`);
const paneD = await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
const doorsD = await J(`({ t: (document.querySelector('#rmCreatePane .rmTitle') || {}).textContent || '', list: document.getElementById('crDoorList').textContent, manual: document.getElementById('crDoorManual').textContent, photoGone: !document.getElementById('crDoorPhoto') })`);
ok('D1 BOOT ENTRY COHESION: the cold-start picker\'s Create shows the IDENTICAL doors surface (same title, same two door texts, the photo door gone in both entries) - one shared menu, not two copies | ' + JSON.stringify(doorsD),
  paneD === true && doorsD.t === doorsA.t && doorsD.list === doorsA.list && doorsD.manual === doorsA.manual && doorsD.photoGone === true && doorsA.photoGone === true);
await ev2(`document.getElementById('crDoorManual').click()`);
const cityD = await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
await ev2(`document.getElementById('crCityBack').click()`);
const backD = await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
ok('D2 BOOT MANUAL DOOR: from boot, Manual search reaches the typed city pane and its Back returns to the doors pane', cityD === true && backD === true);

// ---- seed created routes through the real userpacks record, then reload ----
await ev2(`(() => { const rec = { 'route-2': ${JSON.stringify(TEST_PACK('Route 2'))}, 'route-3': ${JSON.stringify(TEST_PACK('Route 3'))}, 'route-4': ${JSON.stringify(TEST_PACK('Route 4'))} }; localStorage.setItem('snowroute.v2.userpacks', JSON.stringify(rec)); for (const id of Object.keys(rec)) { const rk = routeKeys(id); const vals = { done: '[]', times: '{}', hist: '[]', notes: '{}', via: '{}', trail: '[]', cov: '{}', start: '0', flip: '{}', sides: '{"p":{},"t":{}}', sess: '[]', pre: '{"at":0}', snap: '{"x":1}', mig: '1' }; for (const f of Object.keys(rk)) localStorage.setItem(rk[f], vals[f] || 'x'); } return true; })()`);
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await bootRoute();
await ev2(`window.__userPacksReady`); // Beta 1.166: the seeded record drains into the IndexedDB store at this boot - settle the drain before any store-side assertion (the rows themselves register synchronously from the legacy record, exactly as a real first-1.166 boot shows them)

// ---- phase E: delete an INACTIVE created route ----
const listE = await openListTab();
const rowsE = await J(`({ ids: [...document.querySelectorAll('#rmRoutes .routeRow')].map(r => r.dataset.route), del: [...document.querySelectorAll('#rmRoutes .routeRow')].map(r => { const d = r.nextElementSibling; return { id: r.dataset.route, has: !!(d && d.classList.contains('routeDrop') && d.querySelector('.dropDel')), open: !!(d && d.classList.contains('open')), inRow: !!r.querySelector('.routeDel') }; }) })`);
ok('E1 DELETE AFFORDANCE (Beta 1.271, Option D): every route\'s row - the shipped 5W included - is followed by a CLOSED dropdown carrying a Delete pill, and no row carries the retired in-row Delete | ' + JSON.stringify(rowsE),
  listE === true && (rowsE.del || []).length === 4 && (rowsE.del || []).every(d => d.has === true && d.open === false && d.inRow === false));
await ev2(`(() => { const r = document.querySelector('#rmRoutes .routeRow[data-route="route-2"]'); if (r) r.click(); return true; })()`);
const togE = await J(`({ open: document.querySelector('#rmRoutes .routeDrop[data-route="route-2"]').classList.contains('open'), active: activeRoute && activeRoute.id, menuOpen: document.getElementById('routeMenu').classList.contains('open') })`);
await ev2(`(() => { const r = document.querySelector('#rmRoutes .routeRow[data-route="route-2"]'); if (r) r.click(); return true; })()`);
const togE2 = await J(`document.querySelector('#rmRoutes .routeDrop[data-route="route-2"]').classList.contains('open')`);
await ev2(`(() => { const r = document.querySelector('#rmRoutes .routeRow[data-route="route-2"]'); if (r) r.click(); return true; })()`);
const togE3 = await J(`document.querySelector('#rmRoutes .routeDrop[data-route="route-2"]').classList.contains('open')`);
ok('E1b THE TOGGLE (Andrew\'s wiring): a row press opens its dropdown WITHOUT loading (5W stays active, the menu stays open), the same press again closes it, a third press reopens it | ' + JSON.stringify(togE) + ' second press open: ' + togE2 + ' third press open: ' + togE3,
  togE.open === true && togE.active === '5w' && togE.menuOpen === true && togE2 === false && togE3 === true);
await ev2(`(() => { const d = document.querySelector('#rmRoutes .routeDrop[data-route="route-2"]'); const b = d && d.querySelector('.dropDel'); if (b) b.click(); return true; })()`);
const modalE = await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
const askE = await J(`({ title: document.getElementById('crModalTitle').textContent, msg: document.getElementById('crModalMsg').textContent, yes: document.getElementById('crModalYes').textContent, no: document.getElementById('crModalNo').textContent, danger: document.getElementById('crModalYes').classList.contains('danger'), active: activeRoute && activeRoute.id, loaded: routeLoaded, menuOpen: document.getElementById('routeMenu').classList.contains('open') })`);
ok('E2 THE ASK: the Delete tap does NOT load the route (5W stays active, the menu stays open) and the shared confirm asks "Delete Route 2?" with the exact body, Cancel / Delete labels and the danger-styled Yes | ' + JSON.stringify(askE),
  modalE === true && askE.title === 'Delete Route 2?' && askE.msg === 'The route and everything saved for it on this phone (progress, notes, history) will be removed. This can’t be undone.' && askE.yes === 'Delete' && askE.no === 'Cancel' && askE.danger === true && askE.active === '5w' && askE.loaded === true && askE.menuOpen === true);
// Beta 1.126 TEST-PREMISE REPAIR: both samples are PINNED through the app's own
// theme-override seam. The original code sampled "day" from the ambient theme -
// but the app's automatic theme is sunset-driven (autoNightAt), so any run after
// local sunset booted into night and the day sample read the night values
// (deterministic evening failure: local + branch CI 42302781608 shard 3).
await ev2(`(() => { setThemeOverride(false); applyNight(); return true; })()`);
await poll(`!document.body.classList.contains('night')`, 10000); // T4: poll the terminal state E3's day sample asserts (the day theme applied)
const dayE = await J(`(() => { const c = document.querySelector('#crModal .card'); const s = getComputedStyle(c); return { bg: s.backgroundColor, col: s.color }; })()`);
await ev2(`(() => { setThemeOverride(true); applyNight(); return true; })()`);
await poll(`document.body.classList.contains('night')`, 10000); // T4: poll the terminal state E3's night sample asserts (the night theme applied)
const nightE = await J(`(() => { const c = document.querySelector('#crModal .card'); const s = getComputedStyle(c); return { bg: s.backgroundColor, col: s.color }; })()`);
await ev2(`(() => { clearThemeOverride(); applyNight(); return true; })()`);
// Test-suite restructure (2026-11-09): E3's three setBasemap() calls are
// DELETED. E3 asserts computed CSS of a DOM modal; applyNight() is DOM-only
// (body class + theme-color + button icon) and the samples poll the body
// class - the terminal state they assert. setBasemap() only rebuilt the
// map style, which E3 never reads, and each rebuild opened a "Style is not
// done loading" window for the steps after it (the style-flake family).
ok('E3 NIGHT TOKENS (Andrew\'s requirement): the confirm card\'s computed background + text colour EQUAL the theme tokens in BOTH modes - day rgba(255, 255, 255, 0.92) / rgb(28, 37, 52), night rgba(32, 33, 37, 0.94) / rgb(237, 242, 249) - a hardcoded-white card fails the night half | day: ' + JSON.stringify(dayE) + ' night: ' + JSON.stringify(nightE),
  dayE.bg === 'rgba(255, 255, 255, 0.92)' && dayE.col === 'rgb(28, 37, 52)' && nightE.bg === 'rgba(32, 33, 37, 0.94)' && nightE.col === 'rgb(237, 242, 249)');
await ev2(`document.getElementById('crModalNo').click()`);
const cancelE = JSON.parse(await ev2(`(async () => { const rec = await upGet('route-2'); return JSON.stringify({ rec: !!rec, key: localStorage.getItem(routeKeys('route-2').done), row: !!document.querySelector('#rmRoutes .routeRow[data-route="route-2"]'), modalHidden: document.getElementById('crModal').classList.contains('hidden') }); })()`)); // Beta 1.166: the definition's home is the store - presence is read there
ok('E4 CANCEL LEAVES EVERYTHING: the record, the route\'s storage keys and the row all survive a Cancel | ' + JSON.stringify(cancelE),
  cancelE.rec === true && cancelE.key === '[]' && cancelE.row === true && cancelE.modalHidden === true);
await ev2(`(() => { const d = document.querySelector('#rmRoutes .routeDrop[data-route="route-2"]'); const r = document.querySelector('#rmRoutes .routeRow[data-route="route-2"]'); if (d && !d.classList.contains('open') && r) r.click(); const b = d && d.querySelector('.dropDel'); if (b) b.click(); return true; })()`);
await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
await ev2(`document.getElementById('crModalYes').click()`);
const goneE = await poll(`(async () => !(await upGet('route-2')) && !ROUTE_PACKS.some(p => p.id === 'route-2') && !document.querySelector('#rmRoutes .routeRow[data-route="route-2"]'))()`, 15000);
const keysE = await J(`({ left: Object.values(routeKeys('route-2')).filter(k => localStorage.getItem(k) !== null) })`);
ok('E5 DELETE LANDS: the store record is gone, the pack is unregistered, the row is gone, and EVERY routeKeys key of the route reads null in localStorage (the whole slot, preload record + snapshot + migration flag included) | surviving keys: ' + JSON.stringify(keysE.left),
  goneE === true && (keysE.left || []).length === 0);

// ---- phase F: delete the ACTIVE created route -> the boot picker ----
await ev2(`(() => { const r = document.querySelector('#rmRoutes .routeRow[data-route="route-3"]'); if (r) { r.click(); const b = r.nextElementSibling && r.nextElementSibling.querySelector('.dropLoad'); if (b) b.click(); } return true; })()`);
const loadedF = await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true && activeRoute && activeRoute.id === 'route-3'`, 20000);
await openListTab();
await ev2(`(() => { const d = document.querySelector('#rmRoutes .routeDrop[data-route="route-3"]'); const r = document.querySelector('#rmRoutes .routeRow[data-route="route-3"]'); if (d && !d.classList.contains('open') && r) r.click(); const b = d && d.querySelector('.dropDel'); if (b) b.click(); return true; })()`);
await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
await ev2(`document.getElementById('crModalYes').click()`);
const bootF = await poll(`routeLoaded === false && activeRoute === null && document.getElementById('routeMenu').classList.contains('boot') && document.getElementById('routeMenu').classList.contains('show') && !document.getElementById('routeMenu').classList.contains('tab') && document.getElementById('rmMain').classList.contains('on')`, 15000);
const stateF = JSON.parse(await ev2(`(async () => { const rec = await upGet('route-3'); return JSON.stringify({ names: STREETNAMES.length, rec: !!rec, left: Object.values(routeKeys('route-3')).filter(k => localStorage.getItem(k) !== null), row: !!document.querySelector('#rmRoutes .routeRow[data-route="route-3"]') }); })()`));
ok('F1 DELETE THE ACTIVE ROUTE: the app returns to the BOOT PICKER (route unloaded, menu in boot mode over the main pane, zero route geometry in memory), its record + keys are wiped and its row is gone | loaded first: ' + loadedF + ' | ' + JSON.stringify(stateF),
  loadedF === true && bootF === true && stateF.names === 0 && stateF.rec === false && (stateF.left || []).length === 0 && stateF.row === false);

// ---- phase G: a storage failure leaves the route listed and intact ----
await bootRoute();
await openListTab();
await ev2(`(() => { const orig = IDBObjectStore.prototype.delete; window.__origDel = orig; IDBObjectStore.prototype.delete = function (k) { if (this.name === 'packs') throw new DOMException('drive154 injected delete failure', 'QuotaExceededError'); return orig.apply(this, arguments); }; return true; })()`); // Beta 1.166: the gated write of a deletion is the STORE delete now - the fault seam moved from the localStorage record write to the IndexedDB delete, the claim is unchanged
await ev2(`(() => { const d = document.querySelector('#rmRoutes .routeDrop[data-route="route-4"]'); const r = document.querySelector('#rmRoutes .routeRow[data-route="route-4"]'); if (d && !d.classList.contains('open') && r) r.click(); const b = d && d.querySelector('.dropDel'); if (b) b.click(); return true; })()`);
await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
await ev2(`document.getElementById('crModalYes').click()`);
const toastG = await poll(`/Storage problem/.test(document.getElementById('toast').textContent)`, 15000);
const stateG = JSON.parse(await ev2(`(async () => { const rec = await upGet('route-4'); return JSON.stringify({ rec: !!rec, pack: ROUTE_PACKS.some(p => p.id === 'route-4'), row: !!document.querySelector('#rmRoutes .routeRow[data-route="route-4"]'), key: localStorage.getItem(routeKeys('route-4').done) }); })()`));
await ev2(`(() => { IDBObjectStore.prototype.delete = window.__origDel; return true; })()`);
ok('G1 STORAGE FAILURE: when the store delete throws, deletion toasts the storage problem and NOTHING is removed - the record, the pack, the row and the route\'s keys all stay | ' + JSON.stringify(stateG),
  toastG === true && stateG.rec === true && stateG.pack === true && stateG.row === true && stateG.key === '[]');

// ---- phase H: Beta 1.146 (census C2) - the slot wipe is VERIFIED ----
// Seed a fifth created route, then fault-inject the delete of ONE slot key
// (its history key) at the storage seam: deleteRoute must attempt every key
// through txDel, surface the failure honestly (NO 'Route deleted' success
// toast), while the verified definition removal stands (record + pack + row
// gone). The residue key must still be there - that is the failure being
// reported. Control: with the stub removed, a normal delete of route-4
// (which survived phase G) is fully verified-green, toast and all.
await ev2(`(() => { const rec = readUserPacks() || {}; rec['route-5'] = ${JSON.stringify(TEST_PACK('Route 5'))}; localStorage.setItem('snowroute.v2.userpacks', JSON.stringify(rec)); const rk = routeKeys('route-5'); const vals = { done: '[]', times: '{}', hist: '[]', notes: '{}', via: '{}', trail: '[]', cov: '{}', start: '0', flip: '{}', sides: '{"p":{},"t":{}}', sess: '[]', pre: '{"at":0}', snap: '{"x":1}', mig: '1' }; for (const f of Object.keys(rk)) localStorage.setItem(rk[f], vals[f] || 'x'); return true; })()`);
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await bootRoute();
await ev2(`window.__userPacksReady`); // Beta 1.166: route-5's fresh legacy record drains at this boot - settle it before the delete (its shadow-removal path is exercised separately in drive185)
await openListTab();
await ev2(`(() => { window.__origRm = Storage.prototype.removeItem; Storage.prototype.removeItem = function (k) { if (k === routeKeys('route-5').hist) throw new Error('injected delete failure'); return window.__origRm.call(this, k); }; return true; })()`);
await ev2(`(() => { const d = document.querySelector('#rmRoutes .routeDrop[data-route="route-5"]'); const r = document.querySelector('#rmRoutes .routeRow[data-route="route-5"]'); if (d && !d.classList.contains('open') && r) r.click(); const b = d && d.querySelector('.dropDel'); if (b) b.click(); return true; })()`);
await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
await ev2(`document.getElementById('crModalYes').click()`);
const toastH = await poll(`/could not be deleted/.test(document.getElementById('toast').textContent)`, 15000);
const stateH = JSON.parse(await ev2(`(async () => { const rec = await upGet('route-5'); return JSON.stringify({ toast: document.getElementById('toast').textContent, rec: !!rec, pack: ROUTE_PACKS.some(p => p.id === 'route-5'), row: !!document.querySelector('#rmRoutes .routeRow[data-route="route-5"]'), histLeft: localStorage.getItem(routeKeys('route-5').hist), doneLeft: localStorage.getItem(routeKeys('route-5').done), notesLeft: localStorage.getItem(routeKeys('route-5').notes) }); })()`));
await ev2(`(() => { Storage.prototype.removeItem = window.__origRm; return true; })()`);
ok('H1 VERIFIED WIPE, ONE KEY FAILS: the failure is SURFACED (toast says some saved data could not be deleted, never the plain success toast), the definition removal stands (record, pack and row all gone), every other key was still attempted and deleted, and the one failing key remains as the reported residue | ' + JSON.stringify(stateH),
  toastH === true && /could not be deleted/.test(stateH.toast || '') && stateH.toast !== 'Route deleted' && stateH.rec === false && stateH.pack === false && stateH.row === false && stateH.histLeft === '[]' && stateH.doneLeft === null && stateH.notesLeft === null);
await ev2(`(() => { const d = document.querySelector('#rmRoutes .routeDrop[data-route="route-4"]'); const r = document.querySelector('#rmRoutes .routeRow[data-route="route-4"]'); if (d && !d.classList.contains('open') && r) r.click(); const b = d && d.querySelector('.dropDel'); if (b) b.click(); return true; })()`);
await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
await ev2(`document.getElementById('crModalYes').click()`);
const goneH2 = await poll(`!document.querySelector('#rmRoutes .routeRow[data-route="route-4"]')`, 15000);
const keysH2 = await J(`({ left: Object.values(routeKeys('route-4')).filter(k => localStorage.getItem(k) !== null) })`);
ok('H2 NORMAL DELETE STILL FULLY GREEN: with healthy storage the row leaves and every slot key reads null (the success pill was cut in Beta 1.221 - the vanished row is the report) | surviving keys: ' + JSON.stringify(keysH2.left),
  goneH2 === true && (keysH2.left || []).length === 0);

// ---- phase H3: Beta 1.271 - the SHIPPED route's Delete is WIRED (Codex P2, PR #167) ----
// Andrew's ruling is Delete on EVERY route, the shipped 5W included - but the
// 1.124 guard inside askDeleteRoute/deleteRoute refused shipped packs, so the
// new dropdown's Delete on 5W was a silent no-op until this phase's subject
// landed. Seed two slot keys, open 5W's own dropdown, Delete: the ask must
// OPEN, the confirm must unregister the pack, wipe the slot and write the
// tombstone - and a reload must keep it gone (the boot filter) while the
// list still renders. Every earlier created route has been deleted by its
// own phase by now, so a survivor (route-9) is seeded first: without one,
// the post-delete list is legitimately EMPTY and "the list renders" has
// nothing to render (three runs failed on exactly that false premise -
// the reload state read packs: [] with fromStore: 0, the app correct).
await ev2(`(() => { const rec = readUserPacks() || {}; rec['route-9'] = ${JSON.stringify(TEST_PACK('Route 9'))}; localStorage.setItem('snowroute.v2.userpacks', JSON.stringify(rec)); const rk9 = routeKeys('route-9'); const vals = { done: '[]', times: '{}', hist: '[]', notes: '{}', via: '{}', trail: '[]', cov: '{}', start: '0', flip: '{}', sides: '{"p":{},"t":{}}', sess: '[]', pre: '{"at":0}', snap: '{"x":1}', mig: '1' }; for (const f of Object.keys(rk9)) localStorage.setItem(rk9[f], vals[f] || 'x'); const rk = routeKeys('5w'); localStorage.setItem(rk.notes, '{}'); localStorage.setItem(rk.hist, '[]'); return true; })()`);
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await ev2(`window.__userPacksReady`);
await poll(`!!document.querySelector('#rmRoutes .routeRow[data-route="route-9"]') && !!document.querySelector('#rmRoutes .routeRow[data-route="5w"]')`, 30000);
await openListTab();
await ev2(`(() => { const d = document.querySelector('#rmRoutes .routeDrop[data-route="5w"]'); const r = document.querySelector('#rmRoutes .routeRow[data-route="5w"]'); if (d && !d.classList.contains('open') && r) r.click(); const b = d && d.querySelector('.dropDel'); if (b) b.click(); return true; })()`);
const askH3 = await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
await ev2(`document.getElementById('crModalYes').click()`);
const goneH3 = await poll(`!document.querySelector('#rmRoutes .routeRow[data-route="5w"]')`, 15000);
const stH3 = JSON.parse(await ev2(`(() => JSON.stringify({ pack: ROUTE_PACKS.some(p => p.id === '5w'), dead: loadShippedDeleted(), notes: localStorage.getItem(routeKeys('5w').notes), hist: localStorage.getItem(routeKeys('5w').hist) }))()`));
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await ev2(`window.__userPacksReady`); // the store half of the boot settles before the list is read (phase H's own settle - the created routes register from IndexedDB, not the deleted legacy record)
await poll(`!!document.querySelector('#rmRoutes .routeRow[data-route="route-9"]')`, 30000);
const stH3b = JSON.parse(await ev2(`(() => JSON.stringify({ pack: ROUTE_PACKS.some(p => p.id === '5w'), row: !!document.querySelector('#rmRoutes .routeRow[data-route="5w"]'), rows: document.querySelectorAll('#rmRoutes .routeRow').length, survivor: !!document.querySelector('#rmRoutes .routeRow[data-route="route-9"]') }))()`));
ok('H3 SHIPPED DELETE IS WIRED: 5W\'s dropdown Delete opens the ask, the confirm unregisters the pack, wipes its slot and writes the tombstone - and a reload keeps it gone while the seeded survivor still renders | ' + JSON.stringify({ askH3, goneH3, stH3, stH3b }),
  askH3 === true && goneH3 === true && stH3.pack === false && (stH3.dead || []).includes('5w') && stH3.notes === null && stH3.hist === null && stH3b.pack === false && stH3b.row === false && stH3b.survivor === true);

// ---- phases H4/H5: the tombstone's two cousins (Codex P2s, PR #167, second review) ----
// H4: a shipped id stays RESERVED for route creation even while tombstoned -
// a created route named 5W must not be assigned '5w' (it would be misread as
// shipped by deleteRoute and refused by doRestore's created-id check).
const idH4 = await ev2(`uniqueRouteId('5W')`);
ok('H4 SHIPPED IDS STAY RESERVED: with 5W tombstoned, a new route named 5W is assigned ' + JSON.stringify(idH4) + ', never the shipped id itself', idH4 !== '5w' && /^5w-\d+$/.test(idH4 || ''));
// H5: restoring an earlier backup that carries the deleted shipped route's
// data must NOT abort the whole restore - the tombstoned route is skipped
// and reported, the surviving created route's data lands, and the shipped
// route stays deleted through the restore's own reload.
const preH5 = JSON.parse(await ev2(`(() => { const live = ROUTE_PACKS.find(p => !SHIPPED_PACK_IDS.has(p.id)); const bk = { app: 'snowroute-backup', v: 2, routes: { '5w': { notes: '{}' } }, userpacks: {} }; if (live) bk.routes[live.id] = { notes: '{}' }; document.getElementById('xText').value = JSON.stringify(bk); return JSON.stringify({ live: live ? live.id : null }); })()`)); // field values ride in their stored STRING form - pushField refuses anything else ('bad value', restore aborts), as drive136's real exports show
await ev2(`(() => { sessionStorage.removeItem('__h5toast'); const iv = setInterval(() => { const t = document.getElementById('toast').textContent; if (t) sessionStorage.setItem('__h5toast', t); }, 50); setTimeout(() => clearInterval(iv), 25000); return true; })()`); // the result toast lives only 600ms before the restore's own reload replaces the page - record it into sessionStorage (which survives the reload) instead of polling the doomed element
await ev2(`doRestore(); true`);
await poll(`!!sessionStorage.getItem('__h5toast')`, 20000);
const toastH5txt = await ev2(`sessionStorage.getItem('__h5toast')`);
const toastH5 = !!toastH5txt && /Backup restored/.test(toastH5txt) && /deleted on this phone/.test(toastH5txt);
await ev2(`window.__userPacksReady`);
await poll(`document.querySelectorAll('#rmRoutes .routeRow').length > 0`, 30000);
const stH5 = JSON.parse(await ev2(`(() => JSON.stringify({ pack: ROUTE_PACKS.some(p => p.id === '5w'), row: !!document.querySelector('#rmRoutes .routeRow[data-route="5w"]') }))()`));
ok('H5 RESTORE SKIPS THE TOMBSTONED ROUTE, RESTORES THE REST: the result names the skip, the restore completes and reloads, and 5W stays deleted | ' + JSON.stringify({ preH5, toastH5, toastH5txt, stH5 }),
  !!preH5.live && toastH5 === true && stH5.pack === false && stH5.row === false);

R.exceptions = consoleLog.filter(l => l.indexOf('EXCEPTION') === 0);
finishCreate(R, proc, server);
