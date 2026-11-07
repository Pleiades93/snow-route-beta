import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
//   C (manual path parity): Search manually -> King (grid) -> the
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
// .routeDel, no deleteRoute) - every check here is red there.
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
const CITY_KING = [
  { place_id: 340000001, osm_type: 'relation', osm_id: 324999, lat: '43.9500000', lon: '-79.6400000', category: 'boundary', type: 'administrative', place_rank: 16, importance: 0.31, addresstype: 'town', name: 'King', display_name: 'King, York Region, Ontario, Canada', address: { town: 'King', county: 'York Region', state: 'Ontario', country: 'Canada', country_code: 'ca' }, boundingbox: ['43.9300000', '43.9700000', '-79.6800000', '-79.6000000'] }
];
const STREET_BORDEAUX = [
  { place_id: 991001, osm_type: 'way', osm_id: 555001, lat: '43.798972', lon: '-79.574666', category: 'highway', type: 'residential', place_rank: 26, name: 'Bordeaux Drive', display_name: 'Bordeaux Drive, Woodbridge, Vaughan, York Region, Ontario, Canada', address: { road: 'Bordeaux Drive', suburb: 'Woodbridge', city: 'Vaughan', county: 'York Region', state: 'Ontario', country: 'Canada', country_code: 'ca' } }
];
const TEST_PACK = name => ({ name, area: 'Vaughan', mains: [], roads: { 'Test Street': [[[43.8, -79.57], [43.801, -79.571]]] }, reference: {} });

// ---- static server + CDP rig (drive153's pattern) ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/plain', '.py': 'text/plain', '.yml': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;
const PROFILE = '/tmp/d154profile-' + Date.now();
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
const doorsA = await J(`({ t: (document.querySelector('#rmCreatePane .rmTitle') || {}).textContent || '', list: document.getElementById('crDoorList').textContent, manual: document.getElementById('crDoorManual').textContent, photo: document.getElementById('crDoorPhoto').textContent, photoQuiet: document.getElementById('crDoorPhoto').classList.contains('quiet'), fsList: parseFloat(getComputedStyle(document.getElementById('crDoorList')).fontSize), fsPhoto: parseFloat(getComputedStyle(document.getElementById('crDoorPhoto')).fontSize) })`);
ok('A1 DOORS (tab entry): Create opens on "Create new route" - "Select from list" + "Choose a city that\'s ready to load instantly", "Search manually" + "Any other city or address — loaded from the map service", and the photo door quieter (class + smaller type) with "Muse builds the draft from a photo of the route map" | ' + JSON.stringify(doorsA),
  paneA === true && doorsA.t === 'Create new route' && doorsA.list.indexOf('Select from list') === 0 && doorsA.list.includes("Choose a city that's ready to load instantly") && doorsA.manual.indexOf('Search manually') === 0 && doorsA.manual.includes('Any other city or address — loaded from the map service') && doorsA.photo.indexOf('From a photo') === 0 && doorsA.photo.includes('Muse builds the draft from a photo of the route map') && doorsA.photoQuiet === true && doorsA.fsPhoto < doorsA.fsList);
await ev2(`document.getElementById('crDoorList').click()`);
const toList = await poll(`document.getElementById('rmCityListPane').classList.contains('on')`, 10000);
await ev2(`document.getElementById('rmCityListBack').click()`);
const listBack = await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
await ev2(`document.getElementById('crDoorPhoto').click()`);
const toPhoto = await poll(`document.getElementById('rmPhotoPane').classList.contains('on')`, 10000);
await ev2(`document.getElementById('crPhotoBack').click()`);
const photoBack = await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
await ev2(`document.getElementById('rmBack2').click()`);
const doorsBack = await poll(`document.getElementById('rmMain').classList.contains('on')`, 10000);
ok('A2 BACK CHAIN: every pane backs to the previous one (list -> doors, photo -> doors, doors -> main) - no pane dead-ends or skips a level | list:' + toList + ' listBack:' + listBack + ' photo:' + toPhoto + ' photoBack:' + photoBack + ' doorsBack:' + doorsBack,
  toList === true && listBack === true && toPhoto === true && photoBack === true && doorsBack === true);

// ---- phase B: list pick readies from the pack; the STREET SEARCH still works ----
await ev2(`document.getElementById('rmCreate').click()`);
await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
await ev2(`document.getElementById('crDoorList').click()`);
await poll(`document.getElementById('rmCityListPane').classList.contains('on')`, 10000);
const rowsB = await poll(`document.querySelectorAll('#crCityList .routeRow').length === 5`, 15000);
const listB = await J(`({ t: (document.querySelector('#rmCityListPane .rmTitle') || {}).textContent || '', subs: [...document.querySelectorAll('#crCityList .routeRow')].map(r => (r.querySelector('.routeArea') || {}).textContent || '') })`);
ok('B1 LIST ROWS: the list pane is titled "Select City" and renders the five index cities as rows, each with its street count + "ready to load" | ' + JSON.stringify(listB),
  rowsB === true && listB.t === "Select City" && (listB.subs || []).includes('4,477 streets · ready to load') && (listB.subs || []).every(s => /streets · ready to load/.test(s)));
const wireB0 = wire.length;
await ev2(`(() => { const r = [...document.querySelectorAll('#crCityList .routeRow')].find(x => { const n = x.querySelector('.routeName'); return n && n.textContent === 'Vaughan'; }); if (r) r.click(); return true; })()`);
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
const doorsD = await J(`({ t: (document.querySelector('#rmCreatePane .rmTitle') || {}).textContent || '', list: document.getElementById('crDoorList').textContent, manual: document.getElementById('crDoorManual').textContent, photo: document.getElementById('crDoorPhoto').textContent, photoQuiet: document.getElementById('crDoorPhoto').classList.contains('quiet') })`);
ok('D1 BOOT ENTRY COHESION: the cold-start picker\'s Create shows the IDENTICAL doors surface (same title, same three door texts incl. sub-lines, same quiet photo door) - one shared menu, not two copies | ' + JSON.stringify(doorsD),
  paneD === true && doorsD.t === doorsA.t && doorsD.list === doorsA.list && doorsD.manual === doorsA.manual && doorsD.photo === doorsA.photo && doorsD.photoQuiet === true);
await ev2(`document.getElementById('crDoorManual').click()`);
const cityD = await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
await ev2(`document.getElementById('crCityBack').click()`);
const backD = await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
ok('D2 BOOT MANUAL DOOR: from boot, Search manually reaches the typed city pane and its Back returns to the doors pane', cityD === true && backD === true);

// ---- seed created routes through the real userpacks record, then reload ----
await ev2(`(() => { const rec = { 'route-2': ${JSON.stringify(TEST_PACK('Route 2'))}, 'route-3': ${JSON.stringify(TEST_PACK('Route 3'))}, 'route-4': ${JSON.stringify(TEST_PACK('Route 4'))} }; localStorage.setItem('snowroute.v2.userpacks', JSON.stringify(rec)); for (const id of Object.keys(rec)) { const rk = routeKeys(id); const vals = { done: '[]', times: '{}', hist: '[]', notes: '{}', via: '{}', trail: '[]', cov: '{}', start: '0', flip: '{}', sides: '{"p":{},"t":{}}', sess: '[]', pre: '{"at":0}', snap: '{"x":1}', mig: '1' }; for (const f of Object.keys(rk)) localStorage.setItem(rk[f], vals[f] || 'x'); } return true; })()`);
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await bootRoute();

// ---- phase E: delete an INACTIVE created route ----
const listE = await openListTab();
const rowsE = await J(`({ ids: [...document.querySelectorAll('#rmRoutes .routeRow')].map(r => r.dataset.route), del: [...document.querySelectorAll('#rmRoutes .routeRow')].map(r => ({ id: r.dataset.route, has: !!r.querySelector('.routeDel') })) })`);
ok('E1 DELETE AFFORDANCE: every created route\'s row carries a Delete button and the shipped 5W row carries NONE | ' + JSON.stringify(rowsE),
  listE === true && (rowsE.del || []).filter(d => d.id !== '5w').length === 3 && (rowsE.del || []).every(d => d.id === '5w' ? d.has === false : d.has === true));
await ev2(`(() => { const r = document.querySelector('#rmRoutes .routeRow[data-route="route-2"] .routeDel'); if (r) r.click(); return true; })()`);
const modalE = await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
const askE = await J(`({ title: document.getElementById('crModalTitle').textContent, msg: document.getElementById('crModalMsg').textContent, yes: document.getElementById('crModalYes').textContent, no: document.getElementById('crModalNo').textContent, danger: document.getElementById('crModalYes').classList.contains('danger'), active: activeRoute && activeRoute.id, loaded: routeLoaded, menuOpen: document.getElementById('routeMenu').classList.contains('open') })`);
ok('E2 THE ASK: the Delete tap does NOT load the route (5W stays active, the menu stays open) and the shared confirm asks "Delete Route 2?" with the exact body, Cancel / Delete labels and the danger-styled Yes | ' + JSON.stringify(askE),
  modalE === true && askE.title === 'Delete Route 2?' && askE.msg === 'The route and everything saved for it on this phone — progress, notes, history — will be removed. This can’t be undone.' && askE.yes === 'Delete' && askE.no === 'Cancel' && askE.danger === true && askE.active === '5w' && askE.loaded === true && askE.menuOpen === true);
// Beta 1.126 TEST-PREMISE REPAIR: both samples are PINNED through the app's own
// theme-override seam. The original code sampled "day" from the ambient theme -
// but the app's automatic theme is sunset-driven (autoNightAt), so any run after
// local sunset booted into night and the day sample read the night values
// (deterministic evening failure: local + branch CI 42302781608 shard 3).
await ev2(`(() => { setThemeOverride(false); applyNight(); setBasemap(); return true; })()`);
await sleep(300);
const dayE = await J(`(() => { const c = document.querySelector('#crModal .card'); const s = getComputedStyle(c); return { bg: s.backgroundColor, col: s.color }; })()`);
await ev2(`(() => { setThemeOverride(true); applyNight(); setBasemap(); return true; })()`);
await sleep(300);
const nightE = await J(`(() => { const c = document.querySelector('#crModal .card'); const s = getComputedStyle(c); return { bg: s.backgroundColor, col: s.color }; })()`);
await ev2(`(() => { clearThemeOverride(); applyNight(); setBasemap(); return true; })()`);
ok('E3 NIGHT TOKENS (Andrew\'s requirement): the confirm card\'s computed background + text colour EQUAL the theme tokens in BOTH modes - day rgba(255, 255, 255, 0.92) / rgb(28, 37, 52), night rgba(32, 33, 37, 0.94) / rgb(237, 242, 249) - a hardcoded-white card fails the night half | day: ' + JSON.stringify(dayE) + ' night: ' + JSON.stringify(nightE),
  dayE.bg === 'rgba(255, 255, 255, 0.92)' && dayE.col === 'rgb(28, 37, 52)' && nightE.bg === 'rgba(32, 33, 37, 0.94)' && nightE.col === 'rgb(237, 242, 249)');
await ev2(`document.getElementById('crModalNo').click()`);
const cancelE = await J(`({ rec: !!readUserPacks()['route-2'], key: localStorage.getItem(routeKeys('route-2').done), row: !!document.querySelector('#rmRoutes .routeRow[data-route="route-2"]'), modalHidden: document.getElementById('crModal').classList.contains('hidden') })`);
ok('E4 CANCEL LEAVES EVERYTHING: the record, the route\'s storage keys and the row all survive a Cancel | ' + JSON.stringify(cancelE),
  cancelE.rec === true && cancelE.key === '[]' && cancelE.row === true && cancelE.modalHidden === true);
await ev2(`(() => { const r = document.querySelector('#rmRoutes .routeRow[data-route="route-2"] .routeDel'); if (r) r.click(); return true; })()`);
await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
await ev2(`document.getElementById('crModalYes').click()`);
const goneE = await poll(`!readUserPacks()['route-2'] && !ROUTE_PACKS.some(p => p.id === 'route-2') && !document.querySelector('#rmRoutes .routeRow[data-route="route-2"]')`, 15000);
const keysE = await J(`({ left: Object.values(routeKeys('route-2')).filter(k => localStorage.getItem(k) !== null) })`);
ok('E5 DELETE LANDS: the userpacks entry is gone, the pack is unregistered, the row is gone, and EVERY routeKeys key of the route reads null in localStorage (the whole slot, preload record + snapshot + migration flag included) | surviving keys: ' + JSON.stringify(keysE.left),
  goneE === true && (keysE.left || []).length === 0);

// ---- phase F: delete the ACTIVE created route -> the boot picker ----
await ev2(`(() => { const r = document.querySelector('#rmRoutes .routeRow[data-route="route-3"]'); if (r) r.click(); return true; })()`);
const loadedF = await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true && activeRoute && activeRoute.id === 'route-3'`, 20000);
await openListTab();
await ev2(`(() => { const r = document.querySelector('#rmRoutes .routeRow[data-route="route-3"] .routeDel'); if (r) r.click(); return true; })()`);
await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
await ev2(`document.getElementById('crModalYes').click()`);
const bootF = await poll(`routeLoaded === false && activeRoute === null && document.getElementById('routeMenu').classList.contains('boot') && document.getElementById('routeMenu').classList.contains('show') && !document.getElementById('routeMenu').classList.contains('tab') && document.getElementById('rmMain').classList.contains('on')`, 15000);
const stateF = await J(`({ names: STREETNAMES.length, rec: !!readUserPacks()['route-3'], left: Object.values(routeKeys('route-3')).filter(k => localStorage.getItem(k) !== null), row: !!document.querySelector('#rmRoutes .routeRow[data-route="route-3"]') })`);
ok('F1 DELETE THE ACTIVE ROUTE: the app returns to the BOOT PICKER (route unloaded, menu in boot mode over the main pane, zero route geometry in memory), its record + keys are wiped and its row is gone | loaded first: ' + loadedF + ' | ' + JSON.stringify(stateF),
  loadedF === true && bootF === true && stateF.names === 0 && stateF.rec === false && (stateF.left || []).length === 0 && stateF.row === false);

// ---- phase G: a storage failure leaves the route listed and intact ----
await bootRoute();
await openListTab();
await ev2(`(() => { window.__origSet = localStorage.setItem.bind(localStorage); localStorage.setItem = (k, v) => { if (k === 'snowroute.v2.userpacks') throw new Error('quota'); return window.__origSet(k, v); }; return true; })()`);
await ev2(`(() => { const r = document.querySelector('#rmRoutes .routeRow[data-route="route-4"] .routeDel'); if (r) r.click(); return true; })()`);
await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
await ev2(`document.getElementById('crModalYes').click()`);
const toastG = await poll(`/Storage problem/.test(document.getElementById('toast').textContent)`, 15000);
const stateG = await J(`({ rec: !!readUserPacks()['route-4'], pack: ROUTE_PACKS.some(p => p.id === 'route-4'), row: !!document.querySelector('#rmRoutes .routeRow[data-route="route-4"]'), key: localStorage.getItem(routeKeys('route-4').done) })`);
await ev2(`(() => { localStorage.setItem = window.__origSet; return true; })()`);
ok('G1 STORAGE FAILURE: when the userpacks write throws, deletion toasts the storage problem and NOTHING is removed - the record, the pack, the row and the route\'s keys all stay | ' + JSON.stringify(stateG),
  toastG === true && stateG.rec === true && stateG.pack === true && stateG.row === true && stateG.key === '[]');

R.exceptions = consoleLog.filter(l => l.indexOf('EXCEPTION') === 0);
console.log(JSON.stringify(R));
try { proc.kill('SIGKILL'); } catch (e) {}
server.close();
process.exit(0);
