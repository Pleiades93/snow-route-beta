import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// drive153: Beta 1.123 - the city PACKS as the primary street-shape
// source, and the manual door's typed-search fix; Beta 1.124 rewired
// the GATE NAVIGATION to Andrew's approved doors shape (premise
// change, same pattern as drive148-P/drive151: the Create pane opens
// on two doors - Select from list / Search manually - and the cities
// render as rows in their own list pane). Same rig as drive151 (own
// CDP session, Fetch
// interception at the NETWORK layer, the page's window.fetch is the
// browser's own); the interception additionally serves the pack files:
// packs/index.json is fulfilled with the repo's SHIPPED index (single
// source - the drive serves what the app ships), packs/vaughan.json
// with the trimmed fixture pack vendored under fixtures/ (cut
// programmatically from the real Vaughan pack), and every other pack
// slug with a 404. What it proves:
//   A (tab entry): the Create pane opens on the TWO DOORS (Beta
//      1.124) - "Create new route"; Select from list opens the list
//      pane ("Select City") with the 5 index
//      cities as rows carrying their street counts; tapping Vaughan
//      readies the city from the PACK with
//      ZERO Overpass requests and the hint naming the app's own
//      library; a pack street (Bordeaux) adds by tap at its pack
//      length.
//   B (reload): re-picking Vaughan is ready from the on-device
//      IndexedDB cache with ZERO pack-file and ZERO Overpass requests.
//   C (pack failure): with the cache deleted and the pack file 404ing,
//      preparation falls back to the Overpass grid (one POST per cell)
//      and the hint SAYS the library didn't load.
//   D (manual door): "Search manually" opens the typed city search;
//      against REAL jsonv2-shaped Nominatim answers (the payload
//      carries `category`, not the `class` field 1.121's filter read -
//      the defect that silently emptied every real result list) the
//      results render and are selectable; a city with NO pack (King)
//      prepares through the grid (Overpass POSTs, no pack context);
//      an empty answer shows an honest "No city matched" line and a
//      network failure says so (toast) instead of showing nothing.
//   E (boot entry): at the cold-start picker, Create reaches the SAME
//      doors surface (same pane, same doors, the list behind Select
//      from list) -
//      the two entries are one menu.
// Red side (run against the 1.122 tree before the build): A fails at
// the chooser (no #crCityChoices exists), D's result-render fails
// (crIsPlace reads a field jsonv2 doesn't send), B/C cannot start.
// The 1.124 doors navigation is red on the 1.123 tree by construction
// (no #crDoorList / #rmCityListPane there) - drive154 carries that
// red side for the new shape.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'browser', 'fixtures', 'create-osm.json'), 'utf8'));
const PACKFX = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'browser', 'fixtures', 'city-pack-vaughan.json'), 'utf8'));
const INDEXFX = JSON.parse(fs.readFileSync(path.join(REPO, 'packs', 'index.json'), 'utf8'));
const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

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
// The REAL jsonv2 shape (fetched live from Nominatim 2026-11-06 while
// diagnosing Andrew's dead search): results carry `category`, and NO
// `class` field exists. Vaughan, Ontario is the boundary/administrative
// item with the same bounding box the shipped pack was generated from.
const CITY_VAUGHAN = [
  { place_id: 351671075, osm_type: 'relation', osm_id: 324212, lat: '43.7941544', lon: '-79.5268023', category: 'boundary', type: 'administrative', place_rank: 16, importance: 0.489, addresstype: 'city', name: 'Vaughan', display_name: 'Vaughan, York Region, Ontario, Canada', address: { city: 'Vaughan', county: 'York Region', state: 'Ontario', country: 'Canada', country_code: 'ca' }, boundingbox: ['43.7498436', '43.9243511', '-79.7106948', '-79.4200471'] },
  { place_id: 337696909, osm_type: 'node', osm_id: 153709816, lat: '37.9014313', lon: '-87.6302941', category: 'place', type: 'hamlet', place_rank: 20, importance: 0.289, addresstype: 'hamlet', name: 'Vaughan', display_name: 'Vaughan, Vanderburgh County, Indiana, United States', address: { hamlet: 'Vaughan', county: 'Vanderburgh County', state: 'Indiana', country: 'United States', country_code: 'us' }, boundingbox: ['37.8814313', '37.9214313', '-87.6502941', '-87.6102941'] }
];
const CITY_KING = [
  { place_id: 340000001, osm_type: 'relation', osm_id: 324999, lat: '43.9500000', lon: '-79.6400000', category: 'boundary', type: 'administrative', place_rank: 16, importance: 0.31, addresstype: 'town', name: 'King', display_name: 'King, York Region, Ontario, Canada', address: { town: 'King', county: 'York Region', state: 'Ontario', country: 'Canada', country_code: 'ca' }, boundingbox: ['43.9300000', '43.9700000', '-79.6800000', '-79.6000000'] }
];
const segLen = pts => { let m = 0; for (let i = 1; i < pts.length; i++) { const dy = (pts[i][0] - pts[i - 1][0]) * 111320, dx = (pts[i][1] - pts[i - 1][1]) * 80386; m += Math.hypot(dx, dy); } return m; };
const packStreetLen = name => (PACKFX.streets[name] || []).reduce((a, s) => a + segLen(s), 0);
let packMode = 'ok'; // 'ok' | 'fail' - the vaughan pack file's wire behaviour
let packDelayMs = 0; // phase A slows the pack download so the in-progress hint wording is observable before the ready state replaces it

// ---- static server + CDP rig (drive151's pattern) ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/plain', '.py': 'text/plain', '.yml': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;
const PROFILE = '/tmp/d153profile-' + Date.now();
const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-proxy-server', '--remote-debugging-port=0', '--disable-features=LocalNetworkAccessChecks', '--user-data-dir=' + PROFILE, '--window-size=420,900', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
const wsUrl = await new Promise((res, rej) => { let buf = ''; proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); setTimeout(() => rej(new Error('no devtools url')), 25000); });
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let nextId = 1; const pending = new Map(); const consoleLog = []; const sessions = new Set(); const wire = [];
let PAGE_S = null;
function send(method, params = {}, sessionId) { const id = nextId++; return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
async function fulfil(sessionId, p) {
  const url = p.request.url;
  const json = (obj, code) => send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: code || 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)).toString('base64') }, sessionId);
  try {
    const pn = new URL(url).pathname;
    if (pn.endsWith('/packs/index.json')) { wire.push({ kind: 'packindex', url }); return await json(INDEXFX); }
    if (pn.endsWith('/packs/vaughan.json')) { wire.push({ kind: 'packfile', slug: 'vaughan.json', url }); if (packMode === 'fail') return await json('nf', 404); if (packDelayMs) await sleep(packDelayMs); return await json(PACKFX); }
    if (/\/packs\/[^/]+\.json$/.test(pn)) { wire.push({ kind: 'packfile', slug: pn.split('/').pop(), url }); return await json('nf', 404); }
    if (url.indexOf('nominatim.openstreetmap.org') >= 0) {
      wire.push({ kind: 'nominatim', url });
      if (url.indexOf('featuretype=city') >= 0) {
        const q = decodeURIComponent((/[?&]q=([^&]+)/.exec(url) || [])[1] || '');
        if (/failtown/i.test(q)) { try { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); } catch (e) {} return; }
        if (/king/i.test(q)) return await json(CITY_KING);
        if (/zzzzz/i.test(q)) return await json([]);
        return await json(CITY_VAUGHAN);
      }
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
ws.addEventListener('message', async ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Target.attachedToTarget') {
    const sid = msg.params.sessionId;
    if (!sessions.has(sid)) { sessions.add(sid); await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sid); }
    return;
  }
  if (msg.method === 'Fetch.requestPaused') { fulfil(msg.sessionId, msg.params); return; }
  if (msg.method === 'Runtime.exceptionThrown' && msg.sessionId === PAGE_S) { const d = msg.params.exceptionDetails; consoleLog.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text)); }
});
await send('Target.setAutoAttach', { autoAttach: true, flatten: true, waitForDebuggerOnStart: false });
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
PAGE_S = (await send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId;
await send('Page.enable', {}, PAGE_S);
await send('Runtime.enable', {}, PAGE_S);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, PAGE_S);
async function evaluate(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, PAGE_S); if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result && r.result.result ? r.result.result.value : undefined; }
const ev2 = async (code) => evaluate(code);
const poll = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { let v; try { v = await ev2(expr); } catch (e) { v = undefined; } if (v === true) return true; await sleep(400); } return false; };
const J = async (expr) => { const raw = await ev2(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const bootRoute = async () => {
  await poll(`!!document.getElementById('ver')`, 20000);
  await poll(`!!window.__bootAt`, 30000);
  await poll(`!!document.getElementById('rmChoose')`, 20000);
  await ev2(`document.getElementById('rmChoose').click()`);
  await poll(`!!document.querySelector('#rmRoutes .routeRow')`, 20000);
  await ev2(`document.querySelector('#rmRoutes .routeRow').click()`);
  await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 30000);
  await poll(`!document.getElementById('splash')`, 10000);
};
const openChooserTab = async () => { // Routes menu (a route is loaded) -> Create -> the DOORS pane (Beta 1.124)
  await ev2(`openRouteMenu()`);
  await ev2(`document.getElementById('rmCreate').click()`);
  return await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
};
const openCityList = async () => { // tap Select from list -> the list pane
  await ev2(`document.getElementById('crDoorList').click()`);
  return await poll(`document.getElementById('rmCityListPane').classList.contains('on')`, 10000);
};
const choicesReady = () => poll(`document.querySelectorAll('#crCityList .routeRow').length === 5`, 15000);
const clickChoice = name => ev2(`(() => { const b = [...document.querySelectorAll('#crCityList .routeRow')].find(x => { const n = x.querySelector('.routeName'); return n && n.textContent === ${JSON.stringify(name)}; }); if (b) { b.click(); return true; } return false; })()`);
const TAP_POINTS = { 'Bordeaux Drive': { lat: 43.798972, lng: -79.574666 } };
const installFeatureSeam = () => ev2(`(() => { if (!map.__qrfOrig) map.__qrfOrig = map.queryRenderedFeatures.bind(map); window.__fixtureRoads = []; map.queryRenderedFeatures = () => window.__fixtureRoads.map(n => ({ type: 'Feature', sourceLayer: 'roads', properties: { name: n }, geometry: { type: 'LineString', coordinates: [] } })); return true; })()`);
const tapStreet = name => ev2(`(() => { window.__fixtureRoads = [${JSON.stringify(name)}]; const tp = ${JSON.stringify(TAP_POINTS[name])}; map.fire('click', { lngLat: tp, point: { x: 210, y: 320 }, originalEvent: {} }); return true; })()`);
const typeCity = q => ev2(`(() => { const i = document.getElementById('crCityInput'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const count = kind => wire.filter(w => w.kind === kind).length;

// ---- phase A: tab entry -> doors -> list -> Vaughan readies from the PACK ----
await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
await bootRoute();
const paneA = await openChooserTab();
const doorsA = await J(`({ t: (document.querySelector('#rmCreatePane .rmTitle') || {}).textContent || '', list: document.getElementById('crDoorList').textContent, manual: document.getElementById('crDoorManual').textContent, photoQuiet: document.getElementById('crDoorPhoto').classList.contains('quiet') })`);
ok('A1 DOORS (tab entry, Beta 1.124): the Create pane\'s first screen is "Create new route" with the two doors and their sub-lines (Select from list / "Choose a city that\'s ready to load instantly"; Search manually / "Any other city or address") and the quieter photo door | ' + JSON.stringify(doorsA), paneA === true && doorsA.t === 'Create new route' && doorsA.list.indexOf('Select from list') === 0 && doorsA.list.includes("Choose a city that's ready to load instantly") && doorsA.manual.indexOf('Search manually') === 0 && doorsA.manual.includes('Any other city or address') && doorsA.photoQuiet === true);
const listA = await openCityList();
const chA = await choicesReady();
const namesA = await J(`({ rows: [...document.querySelectorAll('#crCityList .routeRow')].map(r => ({ n: (r.querySelector('.routeName') || {}).textContent || '', s: (r.querySelector('.routeArea') || {}).textContent || '' })), t: (document.querySelector('#rmCityListPane .rmTitle') || {}).textContent || '' })`);
ok('A2 the list pane ("Select City") renders the FIVE cities from the pack index as rows carrying their street counts + "ready to load" (index-driven, no hardcoded list in the app) | ' + JSON.stringify(namesA), listA === true && chA === true && namesA.t === "Select City" && JSON.stringify((namesA.rows || []).map(r => r.s)) === JSON.stringify(['5,401 streets · ready to load', '4,102 streets · ready to load', '2,181 streets · ready to load', '15,152 streets · ready to load', '4,477 streets · ready to load']) && ['Brampton', 'Markham', 'Richmond Hill', 'Toronto', 'Vaughan'].every(n => (namesA.rows || []).some(r => r.n === n)));
const wireA0 = wire.length;
packDelayMs = 2500;
await clickChoice('Vaughan');
const inPickA = await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 15000);
const libHintA = await poll(`/library/.test(document.getElementById('createHint').textContent) && crPrepState === 'preparing'`, 8000);
const hintDuringA = await J(`({ hint: document.getElementById('createHint').textContent })`);
const readyA = await poll(`crPrepState === 'ready'`, 30000);
packDelayMs = 0;
const wA = wire.slice(wireA0);
const gridA = await J(`({ fromPack: crGrid && crGrid.fromPack, cells: crGrid ? crGrid.cells.length : -1 })`);
ok('A3 PACK PATH: Vaughan readies with ZERO Overpass requests, exactly ONE pack-file download, the grid marked fromPack, and DURING the wait the hint names the app\'s own library (never the service) | overpass: ' + wA.filter(w => w.kind === 'overpass').length + ', packfiles: ' + wA.filter(w => w.kind === 'packfile').length + ' | hint during: ' + (hintDuringA.hint || '') + ' | ' + JSON.stringify(gridA),
  inPickA === true && libHintA === true && readyA === true && wA.filter(w => w.kind === 'overpass').length === 0 && wA.filter(w => w.kind === 'packfile' && w.slug === 'vaughan.json').length === 1 && gridA.fromPack === 'vaughan');
await installFeatureSeam();
await tapStreet('Bordeaux Drive');
const gotBA = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 15000).catch(() => false);
const lenBA = await J(`({ b: draft && draft.roads['Bordeaux'] ? Math.round(computeStretches(draft.roads)['Bordeaux'].total) : -1 })`);
ok('A4 a street FROM THE PACK adds by tap at its pack length (Bordeaux ' + Math.round(packStreetLen('Bordeaux Drive')) + ' m from the fixture pack) with still zero Overpass requests | ' + JSON.stringify(lenBA) + ', overpass total: ' + count('overpass'),
  gotBA === true && Math.abs(lenBA.b - packStreetLen('Bordeaux Drive')) <= packStreetLen('Bordeaux Drive') * 0.03 + 2 && count('overpass') === 0);

// ---- phase B: reload - the saved city readies from the on-device cache ----
const cellsTotal = gridA.cells > 0 ? gridA.cells : 30;
const savedAll = await poll(`crIdbGet('Vaughan').then(r => !!r && !!r.cells && Object.keys(r.cells).length === ${cellsTotal})`, 30000);
const wireB0 = wire.length;
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await bootRoute();
await openChooserTab();
await openCityList();
await choicesReady();
await clickChoice('Vaughan');
const readyB = await poll(`crPrepState === 'ready'`, 20000);
const wB = wire.slice(wireB0);
const gridB = await J(`({ fromCache: crGrid && crGrid.fromCache })`);
ok('B1 PERSISTENCE: after a full reload, re-picking Vaughan is ready from the ON-DEVICE CACHE with ZERO pack-file and ZERO Overpass requests (the pack is not re-downloaded; the cache owns it now) | packfiles: ' + wB.filter(w => w.kind === 'packfile').length + ', overpass: ' + wB.filter(w => w.kind === 'overpass').length + ' | record complete before reload: ' + savedAll,
  readyB === true && wB.filter(w => w.kind === 'packfile').length === 0 && wB.filter(w => w.kind === 'overpass').length === 0 && gridB.fromCache === true && savedAll === true);

// ---- phase C: pack file fails -> the grid fallback engages, and says so ----
await ev2(`exitCreate()`);
await ev2(`crIdbDelete('Vaughan')`);
await poll(`crIdbGet('Vaughan').then(r => !r)`, 10000);
packMode = 'fail';
const wireC0 = wire.length;
await openChooserTab();
await openCityList();
await choicesReady();
await clickChoice('Vaughan');
const readyC = await poll(`crPrepState === 'ready'`, 60000);
const wC = wire.slice(wireC0);
const hintC = await J(`({ hint: document.getElementById('createHint').textContent })`);
ok('C1 PACK FAILURE FALLBACK: with the pack file 404ing, preparation falls back to the Overpass GRID (one POST per cell: ' + cellsTotal + '), the city still readies, the pack was tried exactly once, and the hint SAYS the library didn\'t load and the street service is being used | overpass: ' + wC.filter(w => w.kind === 'overpass').length + ', packfiles: ' + wC.filter(w => w.kind === 'packfile').length + ' | hint: ' + (hintC.hint || ''),
  readyC === true && wC.filter(w => w.kind === 'overpass').length === cellsTotal && wC.filter(w => w.kind === 'packfile').length === 1 && /street service/.test(hintC.hint || ''));
packMode = 'ok';

// ---- phase D: the manual door - typed search fixed + honest states ----
// Beta 1.126 TEST-PREMISE UPDATE: Beta 1.125 (Andrew's direct ship) restyled the
// manual-search results from .rmBtn boxes to .routeRow rows (name in
// .routeName, the dim remainder in .routeArea); this phase's selectors and
// text reads follow the shipped shape. The assertions' meanings are unchanged.
await ev2(`exitCreate()`);
await openChooserTab();
await ev2(`document.getElementById('crDoorManual').click()`);
const paneD = await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
await typeCity('Vaughan');
const resultsD = await poll(`document.querySelectorAll('#crCityResults .routeRow').length >= 1`, 15000);
const btnD = await J(`({ texts: [...document.querySelectorAll('#crCityResults .routeRow')].map(b => { const n = b.querySelector('.routeName'); const a = b.querySelector('.routeArea'); return (n ? n.textContent : '') + ', ' + (a ? a.textContent : ''); }) })`);
ok('D1 MANUAL DOOR SEARCH (the 1.121 defect): typing "Vaughan" against REAL jsonv2-shaped answers (category, not class) renders SELECTABLE results - the place filter accepts the payload the service actually sends | ' + JSON.stringify(btnD.texts),
  paneD === true && resultsD === true && (btnD.texts || []).some(t => t.indexOf('Vaughan, York Region') === 0));
await ev2(`(() => { const b = [...document.querySelectorAll('#crCityResults .routeRow')].find(x => { const n = x.querySelector('.routeName'); const a = x.querySelector('.routeArea'); return n && n.textContent === 'Vaughan' && a && a.textContent.indexOf('York Region') === 0; }); if (b) b.click(); return true; })()`);
const inPickD = await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick' && crCity && crCity.name === 'Vaughan'`, 15000);
ok('D2 tapping the typed-search result picks the city and enters the pick stage (the door Andrew hit is walkable end to end)', inPickD === true);
await ev2(`exitCreate()`);
await openChooserTab();
await ev2(`document.getElementById('crDoorManual').click()`);
await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
const wireD0 = wire.length;
await typeCity('King City');
const resultsK = await poll(`document.querySelectorAll('#crCityResults .routeRow').length >= 1`, 15000);
await ev2(`(() => { const b = document.querySelector('#crCityResults .routeRow'); if (b) b.click(); return true; })()`);
const readyK = await poll(`crPrepState === 'ready'`, 30000);
const wD = wire.slice(wireD0);
const gridK = await J(`({ fromPack: crGrid && crGrid.fromPack, name: crGrid && crGrid.name })`);
ok('D3 NO-PACK CITY USES THE GRID: King (no pack in the index) prepares through the Overpass grid - 4 cell POSTs for its 2 x 2 box, no pack context, no pack download | overpass: ' + wD.filter(w => w.kind === 'overpass').length + ' | ' + JSON.stringify(gridK),
  resultsK === true && readyK === true && wD.filter(w => w.kind === 'overpass').length === 4 && !gridK.fromPack && wD.filter(w => w.kind === 'packfile').length === 0);
await ev2(`exitCreate()`);
await openChooserTab();
await ev2(`document.getElementById('crDoorManual').click()`);
await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
await typeCity('Zzzzz');
const emptyD = await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 0 && /No city matched/.test(document.getElementById('crCityResults').textContent)`, 15000);
ok('D4 HONEST EMPTY: a search with no matches shows a "No city matched" line in the results - not the 1.121 silence', emptyD === true);
await typeCity('Failtown');
const failD = await poll(`/internet connection/.test((document.getElementById('toast') || {}).textContent || '')`, 15000);
ok('D5 HONEST FAILURE: when the search request itself fails, the app SAYS so (a toast naming the connection) instead of showing nothing', failD === true);

// ---- phase E: boot entry - the SAME chooser at the cold-start picker ----
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await poll(`!!document.getElementById('ver')`, 20000);
await poll(`!!window.__bootAt`, 30000);
await poll(`!!document.getElementById('rmCreate')`, 20000);
await ev2(`document.getElementById('rmCreate').click()`);
const paneE = await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
const listE = await openCityList();
const chE = await choicesReady();
const doorE = await J(`({ manual: !!document.getElementById('crDoorManual'), manualLabel: (document.getElementById('crDoorManual') || {}).textContent || '', list: !!document.getElementById('crDoorList'), t: (document.querySelector('#rmCreatePane .rmTitle') || {}).textContent || '' })`);
await clickChoice('Vaughan');
const inPickE = await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 15000);
ok('E1 COHESION: the cold-start picker\'s Create reaches the SAME doors surface (same pane, "Create new route", both doors, the 5 index cities behind Select from list) and a city pick enters creation from boot too | ' + JSON.stringify(doorE),
  paneE === true && listE === true && chE === true && doorE.manual === true && doorE.manualLabel.indexOf('Search manually') === 0 && doorE.list === true && doorE.t === 'Create new route' && inPickE === true);

R.exceptions = consoleLog.filter(l => l.indexOf('EXCEPTION') === 0);
console.log(JSON.stringify(R));
try { proc.kill('SIGKILL'); } catch (e) {}
server.close();
process.exit(0);
