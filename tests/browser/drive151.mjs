// Beta 1.144 TEST-PREMISE UPDATE (Package C, DA-04): draft keys are the FULL map names now ('Bordeaux Drive', 'Alderson Avenue') - the key reads below follow; display text still uses the short form.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCreateRig, serveRepo, makeResults, finishCreate, sleep } from './harness-create.mjs';

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
// fulfils. One fixture boundary (Beta 1.123): /packs/* requests are
// answered 404 - this drive's world predates the pack library, and its
// subject is the service path; drive153 grades the pack path. What it proves: the app's native fetch, under the shipped
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
const { R, ok } = makeResults();

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

// ---- static server + CDP rig (shared: harness-create.mjs; this drive's routing table is fulfil, below) ----
const { server, ORIGIN } = await serveRepo(REPO);
async function fulfil(sessionId, p, H) {
  const send = H.send;
  const url = p.request.url;
  const json = (obj, code) => H.json(sessionId, p, obj, code);
  try {
    if (new URL(url).pathname.indexOf('/packs/') >= 0) { wire.push({ kind: 'packs404', url }); return await json('nf', 404); } // Beta 1.123 fixture boundary: this drive grades the SERVICE path (grid + on-device cache) in a world where the pack library does not exist - the shipped packs/ tree would otherwise (correctly!) answer its fixture Vaughan from the real pack and there would be no grid left to grade. The pack path has its own drive (drive153); here every pack request 404s, the app finds no library, and preparation is the pure 1.121 service flow this drive was written for.
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

// ---- CDP plumbing (e2e-offline pattern: own browser, auto-attach, Fetch on every session) ----
const wire = [];
const rig = await startCreateRig({ profile: '/tmp/d151profile-' + Date.now(), fulfil, jsonMode: 'always200' });
const { proc, send, PAGE_S, ev2, poll, consoleLog, J, bootRoute } = rig;
// Beta 1.126 TEST-PREMISE UPDATE: 1.125 restyled the manual-search city results
// from .rmBtn boxes to .routeRow rows; the selectors in this helper follow.
const pickVaughan = async () => {
  await ev2(`openRouteMenu()`);
  await ev2(`document.getElementById('rmCreate').click()`);
  await ev2(`document.getElementById('crDoorManual').click()`);
  await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
  await ev2(`(() => { const i = document.getElementById('crCityInput'); i.value = 'Vaughan'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 1`, 15000);
  await ev2(`document.querySelector('#crCityResults .routeRow').click()`);
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
const gotB = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux Drive']`, 15000).catch(() => false);
await tapStreet('Alderson Avenue');
const gotA = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Alderson Avenue']`, 15000).catch(() => false);
const NT = await J(`({ b: draft && draft.roads['Bordeaux Drive'] ? Math.round(computeStretches(draft.roads)['Bordeaux Drive'].total) : -1, a: draft && draft.roads['Alderson Avenue'] ? Math.round(computeStretches(draft.roads)['Alderson Avenue'].total) : -1 })`);
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
const gotB2 = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux Drive']`, 15000).catch(() => false);
const NT2 = await J(`({ b: draft && draft.roads['Bordeaux Drive'] ? Math.round(computeStretches(draft.roads)['Bordeaux Drive'].total) : -1 })`);
ok('N8 the reloaded-from-cache city is fully usable: Bordeaux adds at its fixture length with still zero Overpass requests in phase 2 | ' + JSON.stringify(NT2) + ', phase-2 overpass: ' + wire.slice(wireMark).filter(w => w.kind === 'overpass').length,
  gotB2 === true && Math.abs(NT2.b - streetLen('Bordeaux Drive')) <= streetLen('Bordeaux Drive') * 0.03 && wire.slice(wireMark).filter(w => w.kind === 'overpass').length === 0);
const noStub = await ev2(`typeof window.__jMode === 'undefined' && typeof window.__geoLog === 'undefined'`);
ok('N9 the page\'s fetch was never replaced: no in-page stub state exists - every answer above crossed the browser\'s real network stack | noStub: ' + noStub, noStub === true);
R.exceptions = consoleLog.filter(l => l.indexOf('EXCEPTION') === 0);
finishCreate(R, proc, server);
