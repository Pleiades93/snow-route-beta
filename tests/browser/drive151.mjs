import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// drive151: the create-flow preparation over the browser's REAL network
// stack (audit round pickfetch, CG-PF-12) + the persistent city cache's
// round-trip (Andrew's whole-city amendment). drive150 grades the app's
// request path at the in-page fetch seam - its stub IS the transport, so
// it cannot prove what a real browser does with the app's requests. This
// drive never touches the page's window.fetch: it runs its own CDP
// session (the e2e-offline pattern), enables Fetch interception at the
// NETWORK layer for every session, and fulfils the Nominatim + Overpass
// requests by COMPUTING the response from the intercepted request itself
// (the QL body is decoded; the payload is the fixture extract filtered
// by the body's own bounds / name filter). Everything else passes
// through to the real network via Node fetch, exactly as e2e-offline
// fulfils. What it proves: the app's native fetch, under the shipped
// CSP, on a real http origin, gets its city, fires the whole-city GRID
// (one grammatically correct request per cell), receives real geometry
// over the wire, adds streets from it - and after a full page RELOAD,
// re-picking the city is ready from the on-device cache with ZERO
// Overpass requests on the wire. The fixture city is small (a 2 x 2
// grid) so the wire counts stay exact. The tap's feature pick stays
// fixtured at the queryRenderedFeatures seam (the documented rig
// limit, shared with drive149/drive150: the basemap style never
// readies headless, so MapLibre's own tile picking cannot run here;
// Andrew's phone remains the test of the tap itself).
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'browser', 'fixtures', 'create-osm.json'), 'utf8'));
const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

// ---- the fixture world (the same frozen Vaughan extract drive150 uses) ----
const ALL_WAYS = [];
for (const n of Object.keys(FIX.overpass)) for (const w of FIX.overpass[n]) ALL_WAYS.push({ type: 'way', id: w.id, tags: { name: n }, geometry: w.geometry }); // the vendored fixture keys raw Overpass way elements by street name (the same shape drive150 grades)
const wayLen = g => { let m = 0; for (let i = 1; i < g.length; i++) { const dy = (g[i].lat - g[i - 1].lat) * 111320, dx = (g[i].lon - g[i - 1].lon) * 80386; m += Math.hypot(dx, dy); } return m; };
const streetLen = name => ALL_WAYS.filter(w => w.tags.name === name).reduce((a, w) => a + wayLen(w.geometry), 0);
const CITY = [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8150', lon: '-79.5600', boundingbox: ['43.785', '43.845', '-79.610', '-79.5105'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada', country_code: 'ca' } }];
function payloadFor(body) {
  const nm = /"name"="([^"]+)"/.exec(body);
  const bm = /\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/.exec(body);
  let els = ALL_WAYS;
  if (nm) els = els.filter(w => w.tags.name === nm[1]);
  if (bm) { const s = +bm[1], w = +bm[2], n = +bm[3], e = +bm[4]; els = els.filter(wy => wy.geometry.some(g => g.lat >= s - 0.001 && g.lat <= n + 0.001 && g.lon >= w - 0.001 && g.lon <= e + 0.001)); }
  return { elements: els };
}

// ---- a tiny static server for the repo (the app served on a real origin) ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/plain', '.py': 'text/plain', '.yml': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;

// ---- CDP plumbing (e2e-offline pattern: own browser, auto-attach, Fetch on every session) ----
const PROFILE = '/tmp/d151profile-' + Date.now();
const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-proxy-server', '--remote-debugging-port=0', '--disable-features=LocalNetworkAccessChecks', '--user-data-dir=' + PROFILE, '--window-size=420,900', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
const wsUrl = await new Promise((res, rej) => { let buf = ''; proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); setTimeout(() => rej(new Error('no devtools url')), 25000); });
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let nextId = 1; const pending = new Map(); const consoleLog = []; const sessions = new Set(); const wire = [];
let PAGE_S = null;
function send(method, params = {}, sessionId) { const id = nextId++; return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
async function fulfil(sessionId, p) {
  const url = p.request.url;
  const json = (obj) => send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(JSON.stringify(obj)).toString('base64') }, sessionId);
  try {
    if (url.indexOf('nominatim.openstreetmap.org') >= 0) {
      wire.push({ kind: 'nominatim', url });
      if (url.indexOf('featuretype=city') >= 0) return await json(CITY);
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
  await poll(`!!window.__bootAt`, 30000); // the boot stamp, not the element: rmChoose is rendered before its click handler is wired - clicking in that gap is a silent no-op and the route rows never render (drive150's boot polls the same stamp before clicking)
  await poll(`!!document.getElementById('rmChoose')`, 20000);
  await ev2(`document.getElementById('rmChoose').click()`);
  await poll(`!!document.querySelector('#rmRoutes .routeRow')`, 20000);
  await ev2(`document.querySelector('#rmRoutes .routeRow').click()`);
  await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 30000);
  await poll(`!document.getElementById('splash')`, 10000);
};
const pickVaughan = async () => {
  await ev2(`openRouteMenu()`);
  await ev2(`document.getElementById('rmCreate').click()`);
  await ev2(`document.getElementById('crDoorManual').click()`);
  await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
  await ev2(`(() => { const i = document.getElementById('crCityInput'); i.value = 'Vaughan'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await poll(`document.querySelectorAll('#crCityResults .rmBtn').length === 1`, 15000);
  await ev2(`document.querySelector('#crCityResults .rmBtn').click()`);
  return await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 15000);
};
const TAP_POINTS = { 'Bordeaux Drive': { lat: 43.798972, lng: -79.574666 }, 'Alderson Avenue': { lat: 43.8000667, lng: -79.573051 } };
const installFeatureSeam = () => ev2(`(() => { if (!map.__qrfOrig) map.__qrfOrig = map.queryRenderedFeatures.bind(map); window.__fixtureRoads = []; map.queryRenderedFeatures = () => window.__fixtureRoads.map(n => ({ type: 'Feature', sourceLayer: 'roads', properties: { name: n }, geometry: { type: 'LineString', coordinates: [] } })); return true; })()`);
const tapStreet = name => ev2(`(() => { window.__fixtureRoads = [${JSON.stringify(name)}]; const tp = ${JSON.stringify(TAP_POINTS[name])}; map.fire('click', { lngLat: tp, point: { x: 210, y: 320 }, originalEvent: {} }); return true; })()`);

// ---- phase 1: boot + the whole-city grid over the wire ----
await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
await bootRoute();
ok('N1 the app boots and loads Route 5W served on a real http origin, network interception at the CDP layer only (window.fetch is the browser\'s own - nothing was installed in the page)', true);
const inPick = await pickVaughan();
const NC = await J(`({ city: crCity && crCity.name })`);
ok('N2 the city step completes over the wire: the intercepted Nominatim answer picks Vaughan and creation enters the pick stage | ' + JSON.stringify(NC), inPick === true && NC.city === 'Vaughan');
const ready1 = await poll(`crPrepState === 'ready'`, 30000);
const batches = wire.filter(w => w.kind === 'overpass');
const cellKey = b => { const m = /\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/.exec(b); return m ? m.slice(1).join(',') : '?'; };
const distinctCells = new Set(batches.map(x => cellKey(x.body)));
ok('N3 the whole-city preparation fired the GRID over the real wire: exactly 4 Overpass POSTs, one per cell of the 2 x 2 fixture city, every decoded body carrying the correct batch grammar (way["name"]["highway"] over a cell inside the city box) - no malformed literal anywhere | posts: ' + batches.length + ', cells: ' + distinctCells.size,
  ready1 === true && batches.length === 4 && distinctCells.size === 4 && batches.every(x => /\["name"\]\["highway"\]/.test(x.body) && x.body.indexOf('"name="') < 0));
const NCov = await J(`({ bordeaux: crCov && crCov.byName['Bordeaux Drive'] ? crCov.byName['Bordeaux Drive'].length : 0, alderson: crCov && crCov.byName['Alderson Avenue'] ? crCov.byName['Alderson Avenue'].length : 0, boxes: crCov ? crCov.boxes.length : -1 })`);
ok('N4 geometry ARRIVED over the wire and indexed: the extract holds Bordeaux Drive (' + (FIX.overpass['Bordeaux Drive'] || []).length + ' fixture way) and Alderson Avenue (' + (FIX.overpass['Alderson Avenue'] || []).length + '), all 4 cell boxes verified | ' + JSON.stringify(NCov),
  NCov.bordeaux === (FIX.overpass['Bordeaux Drive'] || []).length && NCov.alderson === (FIX.overpass['Alderson Avenue'] || []).length && NCov.boxes === 4);
await installFeatureSeam();
await tapStreet('Bordeaux Drive');
const gotB = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 15000).catch(() => false);
await tapStreet('Alderson Avenue');
const gotA = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Alderson']`, 15000).catch(() => false);
const NT = await J(`({ b: draft && draft.roads['Bordeaux'] ? Math.round(computeStretches(draft.roads)['Bordeaux'].total) : -1, a: draft && draft.roads['Alderson'] ? Math.round(computeStretches(draft.roads)['Alderson'].total) : -1 })`);
ok('N5 both streets ADD from the wire-delivered geometry at their fixture lengths (Bordeaux ' + Math.round(streetLen('Bordeaux Drive')) + ' m, Alderson ' + Math.round(streetLen('Alderson Avenue')) + ' m) | ' + JSON.stringify(NT),
  gotB === true && gotA === true && Math.abs(NT.b - streetLen('Bordeaux Drive')) <= streetLen('Bordeaux Drive') * 0.03 && Math.abs(NT.a - streetLen('Alderson Avenue')) <= streetLen('Alderson Avenue') * 0.03);
ok('N6 after the extract, the adds made ZERO further Overpass requests (the wire count is still the 4 cells) | total overpass requests: ' + wire.filter(w => w.kind === 'overpass').length,
  wire.filter(w => w.kind === 'overpass').length === 4);
// ---- phase 2: reload - the saved city must load with ZERO Overpass requests ----
// The cell saves are a fire-and-forget write-through queue (by design -
// the cache is best-effort, never user data, and a partial record simply
// resumes). Reloading the moment the streets land would grade the
// queue's drain timing, not the persistence - on a loaded CI runner the
// reload landed mid-queue twice (phase-2 counts 2, then 3: the cells
// whose saves had not committed yet, fetched exactly as designed). Wait
// for the TERMINAL signal first: the stored record itself holding every
// cell (the harness rule - poll the terminal signal, never a proxy). If
// the record never completes, N7 fails honestly below.
const savedAll = await poll(`crIdbGet('Vaughan').then(r => !!r && !!r.cells && Object.keys(r.cells).length === 4)`, 30000);
const wireMark = wire.length;
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await bootRoute();
const inPick2 = await pickVaughan();
const ready2 = await poll(`crPrepState === 'ready'`, 20000);
const phase2Overpass = wire.slice(wireMark).filter(w => w.kind === 'overpass').length;
const NH = await J(`({ fromCache: crGrid && crGrid.fromCache, hint: document.getElementById('createHint').textContent })`);
ok('N7 PERSISTENCE ROUND-TRIP: after a full page reload, re-picking Vaughan is ready from the ON-DEVICE CACHE with ZERO Overpass requests on the wire (phase 2 count: ' + phase2Overpass + ') and the hint says when the city was loaded | ' + JSON.stringify(NH) + ' | record complete before reload: ' + savedAll,
  inPick2 === true && ready2 === true && phase2Overpass === 0 && NH.fromCache === true && NH.hint.indexOf('loaded') >= 0 && savedAll === true);
await installFeatureSeam();
await tapStreet('Bordeaux Drive');
const gotB2 = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 15000).catch(() => false);
const NT2 = await J(`({ b: draft && draft.roads['Bordeaux'] ? Math.round(computeStretches(draft.roads)['Bordeaux'].total) : -1 })`);
ok('N8 the reloaded-from-cache city is fully usable: Bordeaux adds at its fixture length with still zero Overpass requests in phase 2 | ' + JSON.stringify(NT2) + ', phase-2 overpass: ' + wire.slice(wireMark).filter(w => w.kind === 'overpass').length,
  gotB2 === true && Math.abs(NT2.b - streetLen('Bordeaux Drive')) <= streetLen('Bordeaux Drive') * 0.03 && wire.slice(wireMark).filter(w => w.kind === 'overpass').length === 0);
const noStub = await ev2(`typeof window.__jMode === 'undefined' && typeof window.__geoLog === 'undefined'`);
ok('N9 the page\'s fetch was never replaced: no in-page stub state exists - every answer above crossed the browser\'s real network stack | noStub: ' + noStub, noStub === true);
R.exceptions = consoleLog.filter(l => l.indexOf('EXCEPTION') === 0);
console.log(JSON.stringify(R));
try { proc.kill('SIGKILL'); } catch (e) {}
server.close();
process.exit(0);
