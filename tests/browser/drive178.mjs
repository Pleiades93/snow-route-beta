import { launchDrive, finish } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// Test-suite restructure (2026-11-09): drive179 is absorbed as an
// appended segment in this file (see the marker + reset above it).
// drive178: Beta 1.153 UX fix round, items 1+2+3+4+6 - the create
// flow's load-state surfaces after Andrew's phone-test fixes.
// (Item 1) The healthy ready-from-cache state offers NO refresh: the
// pre-1.153 'Refresh' button (crGridRefresh - drop the saved record and
// re-download the whole city) is gone from that state, and its handler
// with it. A FAILED load keeps its working remedy: the hint stays up
// (no auto-dismiss in a failure state) with its 'Retry' button, and
// activating it after the service recovers completes the load.
// (Item 3) The pill under the search bar in the ready-from-cache state
// reads '<City> - loaded <date>' only (no 'tap a road') and dismisses
// itself ~4 s after appearing; a dismissed confirmation stays dismissed
// across the re-renders road taps cause.
// (Item 4) Tapping a road shows no 'Added' toast any more.
// (Items 2+6) The pick panel is headed 'Current selection'; the review
// sheet is titled 'Review selection', carries no 'Check every street'
// sub-line, and still shows its count and street rows.
// The network seam and fixture city are drive152's (j) world,
// replicated self-contained: a 2 x 2 grid over [43.785..43.845] x
// [-79.610..-79.5105], plus a fixture kill switch (window.__failGeo)
// that makes every Overpass answer a 503.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const FIXDATA = JSON.parse(fs.readFileSync(new URL('./fixtures/create-osm.json', import.meta.url), 'utf8'));
const elsByName = FIXDATA.overpass;
const JDATA = (() => {
  const byId = {};
  for (const k of Object.keys(elsByName)) for (const e of elsByName[k]) byId[e.id] = { name: k, geometry: e.geometry };
  const seg = (id, name, pts) => { byId[id] = { name, geometry: pts.map(p => ({ lat: p[0], lon: p[1] })) }; };
  seg(9001, 'Edgewater Avenue', [[43.8000, -79.5750], [43.8100, -79.5750], [43.8200, -79.5750]]);
  seg(9002, 'Edgewater Avenue', [[43.8200, -79.5750], [43.8285, -79.5750]]);
  return { byId };
})();
const JCITY = [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8150', lon: '-79.5600', boundingbox: ['43.785', '43.845', '-79.610', '-79.5105'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada', country_code: 'ca' } }];
const installStubJ = `(() => {
  const DATA = ${JSON.stringify(JDATA)};
  const CITY = ${JSON.stringify(JCITY)};
  const prev = window.fetch.bind(window);
  window.__failGeo = false; window.__geoLog = [];
  const boxOf = raw => { const m = /\\(([-\\d.]+),([-\\d.]+),([-\\d.]+),([-\\d.]+)\\)/.exec(raw); return m ? { s: +m[1], w: +m[2], n: +m[3], e: +m[4] } : null; };
  const elsFor = raw => {
    const box = boxOf(raw); if (!box) return [];
    const nm = /"name"="([^"]+)"/.exec(raw);
    const out = [];
    for (const id of Object.keys(DATA.byId)) {
      const w = DATA.byId[id];
      if (nm && w.name !== nm[1]) continue;
      if (!nm && raw.indexOf('["highway"]') < 0) continue;
      if (w.geometry.some(g => g.lat >= box.s && g.lat <= box.n && g.lon >= box.w && g.lon <= box.e)) out.push({ type: 'way', id: +id, tags: { name: w.name }, geometry: w.geometry });
    }
    return out;
  };
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('nominatim.openstreetmap.org') >= 0 && u.indexOf('featuretype=city') >= 0) return Promise.resolve(new Response(JSON.stringify(CITY), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) {
      const raw = decodeURIComponent((opts && opts.body) || '').replace(/^data=/, '');
      window.__geoLog.push({ host: u.indexOf('kumi') >= 0 ? 'kumi' : 'de', body: raw });
      if (window.__failGeo) return Promise.resolve(new Response('fixture down', { status: 503 }));
      return Promise.resolve(new Response(JSON.stringify({ elements: elsFor(raw) }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return prev(url, opts);
  };
  return true;
})()`;
const installFeatureStub = `(() => {
  if (!map.__qrfOrig) map.__qrfOrig = map.queryRenderedFeatures.bind(map);
  window.__fixtureRoads = [];
  map.queryRenderedFeatures = () => window.__fixtureRoads.map(n => ({ type: 'Feature', sourceLayer: 'roads', properties: { name: n }, geometry: { type: 'LineString', coordinates: [] } }));
  return true;
})()`;
const TAP_POINTS = { 'Bordeaux Drive': { lat: 43.798972, lng: -79.574666 }, 'Alderson Avenue': { lat: 43.8000667, lng: -79.573051 } };
const tapStreet = name => `(() => { window.__fixtureRoads = [${JSON.stringify(name)}]; const tp = ${JSON.stringify(TAP_POINTS)}[${JSON.stringify(name)}]; map.fire('click', { lngLat: tp, point: { x: 210, y: 320 }, originalEvent: {} }); return true; })()`;
const pickCityVaughan = async () => {
  await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
  await ev(`(() => { const i = document.getElementById('crCityInput'); i.value = 'Vaughan'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rows = await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 1`, 10000).catch(() => false);
  if (rows === true) await ev(`document.querySelector('#crCityResults .routeRow').click()`);
  return await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 10000).catch(() => false);
};
const jWipe = async () => { await ev(`(async () => { await new Promise(res => { try { const rq = indexedDB.deleteDatabase('snowroute-citycache'); rq.onsuccess = () => res(); rq.onerror = () => res(); rq.onblocked = () => res(); } catch (e) { res(); } }); return true; })()`); };
const enterManual = async () => { await ev(`openRouteMenu()`); await ev(`document.getElementById('rmCreate').click()`); await ev(`document.getElementById('crDoorManual').click()`); return await pickCityVaughan(); };
const exitDiscard = async () => { await ev(`document.getElementById('crExit').click()`); await sleep(400); await ev(`(() => { const y = document.getElementById('crModalYes'); if (y && !document.getElementById('crModal').classList.contains('hidden')) y.click(); return true; })()`); await sleep(400); };
const hintSample = () => J(`({ state: typeof crPrepState !== 'undefined' ? crPrepState : '', on: document.getElementById('createHint').classList.contains('on'), text: document.getElementById('createHint').textContent, btnShown: document.getElementById('crHintBtn').style.display !== 'none', btnText: document.getElementById('crHintBtn').textContent })`);

// ---------- boot 5W ----------
await poll(`typeof loadRoute === 'function'`, 20000);
await poll(`!!window.__bootAt`, 30000);
await ev(`document.getElementById('rmChoose').click()`);
await ev(`document.querySelector('#rmRoutes .routeRow').click()`);
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
await poll(`!document.getElementById('splash')`, 20000);
await poll(`typeof map === 'undefined' || !map || !map.isMoving()`, 25000);
await ev(installStubJ);
await ev(installFeatureStub);
const SETUP = await J(`({ names: STREETNAMES.slice() })`);
ok('setup: 5W loaded and the fixture stub installed', SETUP.names.length === PACK5W.names);

// ---------- P1 (item 1b): a FAILED load - remedy present, no auto-dismiss, Retry completes it ----------
await jWipe();
await ev(`window.__failGeo = true`);
const inPick1 = await enterManual();
const failed = await poll(`typeof crPrepState !== 'undefined' && crPrepState === 'failed'`, 45000).catch(() => false);
const F1 = await hintSample();
ok('P1a (failed load) with the map service down the preparation settles FAILED and the hint shows the failure with a working remedy offered (entered pick: ' + inPick1 + ') | ' + JSON.stringify(F1),
  inPick1 === true && failed === true && F1.on === true && F1.text.indexOf('tap Retry') >= 0 && F1.btnShown === true && F1.btnText === 'Retry'); // the failure copy for an HTTP-status failure is the service-error wording ('The street-shape service answered with an error (503) — tap Retry') - the claim is the failure + remedy are shown, not one wording
await sleep(4600); // longer than the confirmation pill's 4 s: a failure must NOT dismiss itself
const F2 = await hintSample();
ok('P1b (failed load) 4.6 s later the failure is STILL up and actionable - failures never auto-dismiss | ' + JSON.stringify(F2),
  F2.state === 'failed' && F2.on === true && F2.btnShown === true && F2.btnText === 'Retry');
await ev(`window.__failGeo = false`);
await ev(`document.getElementById('crHintBtn').click()`); // the failed state's Retry: resume the grid's failed cells
const ready1 = await poll(`typeof crPrepState !== 'undefined' && crPrepState === 'ready'`, 30000).catch(() => false);
const F3 = await J(`({ state: crPrepState, done: crGrid ? crGrid.cells.filter(c => c.state === 'done').length : -1, total: crGrid ? crGrid.cells.length : -1 })`);
ok('P1c (failed load -> Retry) activating the failed state\'s Retry after the service recovers completes the load - every cell done, state ready | ' + JSON.stringify(F3),
  ready1 === true && F3.done === F3.total && F3.total > 0);
await exitDiscard();

// ---------- P2 (items 1a+3): the cached re-pick - no Refresh, confirmation pill, self-dismissal ----------
const inPick2 = await enterManual();
const ready2 = await poll(`typeof crPrepState !== 'undefined' && crPrepState === 'ready' && !!(crGrid && crGrid.fromCache)`, 30000).catch(() => false);
const C1 = await hintSample();
ok('P2a (cached re-pick) the city readies FROM CACHE and the pill is the plain load confirmation - city + loaded date, no \'tap a road\', and NO refresh control is shown in the healthy state | ' + JSON.stringify(C1),
  inPick2 === true && ready2 === true && C1.on === true && C1.text.indexOf('Vaughan — loaded') === 0 && C1.text.indexOf('tap a road') < 0 && C1.btnShown === false);
const dismissed = await poll(`!document.getElementById('createHint').classList.contains('on')`, 9000).catch(() => false);
const C2 = await hintSample();
ok('P2b (confirmation pill) the pill dismisses ITSELF a few seconds after appearing while the city stays ready | ' + JSON.stringify(C2),
  dismissed === true && C2.state === 'ready');

// ---------- P3 (items 4+2+3): road tap - no 'Added' toast, panel title, pill stays dismissed ----------
await ev(tapStreet('Bordeaux Drive'));
await sleep(500);
const T1 = await J(`({ toast: document.getElementById('toast').textContent, toastShown: document.getElementById('toast').classList.contains('show'), streets: draft ? draftStreets() : [], panel: document.querySelector('.crPanelTitle') ? document.querySelector('.crPanelTitle').textContent.trim() : '', pillOn: document.getElementById('createHint').classList.contains('on') })`);
ok('P3a (road tap) tapping a road adds it with NO \'Added\' popup - the toast never carries the removed confirmation | ' + JSON.stringify(T1),
  T1.streets.includes('Bordeaux Drive') && T1.toast.indexOf('Added') < 0);
ok('P3b (panel title) the pick panel is headed \'Current selection\' | ' + JSON.stringify(T1.panel),
  T1.panel.indexOf('Current selection') === 0);
ok('P3c (pill stays dismissed) the road tap\'s hint re-render does not resurrect the dismissed confirmation pill',
  T1.pillOn === false);

// ---------- P4 (item 6): the review sheet ----------
await ev(`document.getElementById('crDoneBtn').click()`);
const inPreview = await poll(`typeof crStage !== 'undefined' && crStage === 'preview' && document.getElementById('previewSheet').classList.contains('on')`, 10000).catch(() => false);
const V1 = await J(`({ title: document.querySelector('#previewSheet .csheetTitle') ? document.querySelector('#previewSheet .csheetTitle').textContent : '', sheet: document.getElementById('previewSheet').textContent, count: document.getElementById('pvCount').textContent, rows: document.querySelectorAll('#pvList .crRow').length })`);
ok('P4a (review sheet) the confirmation screen is titled \'Review selection\', its old explanatory line (\'Check every street. Fix anything that is wrong.\') is GONE, and the substance stands - the count and the street rows | ' + JSON.stringify({ title: V1.title, count: V1.count, rows: V1.rows }),
  inPreview === true && V1.title === 'Review selection' && V1.sheet.indexOf('Check every street') < 0 && V1.count.indexOf('1 street') === 0 && V1.rows === 1);
await exitDiscard();


// ---- segment reset: reload to a clean page (178's fetch stub and its
// queryRenderedFeatures stub die with the document), then wait for the
// new boot's terminal marker before 179's own boot polls take over. ----
await ev(`location.reload(); true`).catch(() => {});
{ let booted179 = false; for (let i = 0; i < 40 && !booted179; i++) { try { booted179 = (await ev(`!!window.__bootAt`)) === true; } catch (e) { booted179 = false; } if (!booted179) await sleep(400); } }

// ===== absorbed drive179 (test-suite restructure, 2026-11-09): the
// city-scoped street search, in this session after the reset above.
// Its exceptions ride on this drive's shared consoleLog (the tail
// assignment below reads it whole). =====
const R179 = await (async () => {
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const FIXDATA = JSON.parse(fs.readFileSync(new URL('./fixtures/create-osm.json', import.meta.url), 'utf8'));
const elsByName = FIXDATA.overpass;
const JDATA = (() => {
  const byId = {};
  for (const k of Object.keys(elsByName)) for (const e of elsByName[k]) byId[e.id] = { name: k, geometry: e.geometry };
  return { byId };
})();
const JCITY = [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8150', lon: '-79.5600', boundingbox: ['43.785', '43.845', '-79.610', '-79.5105'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada', country_code: 'ca' } }];
const STREET_RESULTS = [
  { display_name: 'Bordeaux Drive, Vaughan, Ontario, Canada', lat: '43.798972', lon: '-79.574666', address: { road: 'Bordeaux Drive', city: 'Vaughan' } },
  { display_name: 'Vaughan Road, Toronto, Ontario, Canada', lat: '43.6830', lon: '-79.4260', address: { road: 'Vaughan Road', city: 'Toronto' } }
];
const installStub = `(() => {
  const DATA = ${JSON.stringify(JDATA)};
  const CITY = ${JSON.stringify(JCITY)};
  const STREETS = ${JSON.stringify(STREET_RESULTS)};
  const prev = window.fetch.bind(window);
  window.__searchUrls = [];
  const boxOf = raw => { const m = /\\(([-\\d.]+),([-\\d.]+),([-\\d.]+),([-\\d.]+)\\)/.exec(raw); return m ? { s: +m[1], w: +m[2], n: +m[3], e: +m[4] } : null; };
  const elsFor = raw => {
    const box = boxOf(raw); if (!box) return [];
    const nm = /"name"="([^"]+)"/.exec(raw);
    const out = [];
    for (const id of Object.keys(DATA.byId)) {
      const w = DATA.byId[id];
      if (nm && w.name !== nm[1]) continue;
      if (!nm && raw.indexOf('["highway"]') < 0) continue;
      if (w.geometry.some(g => g.lat >= box.s && g.lat <= box.n && g.lon >= box.w && g.lon <= box.e)) out.push({ type: 'way', id: +id, tags: { name: w.name }, geometry: w.geometry });
    }
    return out;
  };
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('nominatim.openstreetmap.org') >= 0) {
      if (u.indexOf('featuretype=city') >= 0) return Promise.resolve(new Response(JSON.stringify(CITY), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      window.__searchUrls.push(u); // the STREET search: record the request, then answer with BOTH results whatever bound it carried - a service ignoring the bound
      return Promise.resolve(new Response(JSON.stringify(STREETS), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) {
      const raw = decodeURIComponent((opts && opts.body) || '').replace(/^data=/, '');
      return Promise.resolve(new Response(JSON.stringify({ elements: elsFor(raw) }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return prev(url, opts);
  };
  return true;
})()`;
const pickCityVaughan = async () => {
  await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
  await ev(`(() => { const i = document.getElementById('crCityInput'); i.value = 'Vaughan'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rows = await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 1`, 10000).catch(() => false);
  if (rows === true) await ev(`document.querySelector('#crCityResults .routeRow').click()`);
  return await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 10000).catch(() => false);
};
const runStreetSearch = async () => {
  await ev(`(() => { const i = document.getElementById('crSearchInput'); i.value = 'Vaughan'; document.getElementById('createResults').innerHTML = ''; return true; })()`); // cleared first, so the poll below can only be satisfied by THIS query's render
  await ev(`crSearch()`); // the search button's own path: cancel any debounce, run the typed query now
  return await poll(`document.querySelectorAll('#createResults .crResult').length > 0`, 10000).catch(() => false);
};
const resultSample = () => J(`({ rows: [...document.querySelectorAll('#createResults .crResult')].map(b => b.textContent), urls: (window.__searchUrls || []).slice() })`);

// ---------- boot 5W ----------
await poll(`typeof loadRoute === 'function'`, 20000);
await poll(`!!window.__bootAt`, 30000);
await ev(`document.getElementById('rmChoose').click()`);
await ev(`document.querySelector('#rmRoutes .routeRow').click()`);
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
await poll(`!document.getElementById('splash')`, 20000);
await poll(`typeof map === 'undefined' || !map || !map.isMoving()`, 25000);
await ev(installStub);
const SETUP = await J(`({ names: STREETNAMES.slice() })`);
ok('179 setup: 5W loaded and the fixture stub installed', SETUP.names.length === PACK5W.names);

// ---------- enter create (manual door): the pick stage stands, NO city loaded yet ----------
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
const noCity = await J(`({ pane: document.getElementById('rmCityPane').classList.contains('on'), city: typeof crCity !== 'undefined' && !!crCity })`);
ok('179 setup: creation is open at the city step with NO city loaded (the control state - the create session itself starts at the pick, so the premise is the city pane standing with crCity unset)', noCity.pane === true && noCity.city === false);

// ---------- control: no city loaded - the old bias, both results ----------
const ctlRan = await runStreetSearch();
const CTL = await resultSample();
ok('control (no city loaded) the search stays the old visible-map BIAS - the request carries bounded=0 and BOTH fixture results render, the Toronto one included | ' + JSON.stringify(CTL),
  ctlRan === true && CTL.rows.length === 2 && CTL.urls.length >= 1 && CTL.urls[CTL.urls.length - 1].indexOf('bounded=0') >= 0 && CTL.rows.some(t => t.indexOf('Toronto') >= 0));

// ---------- scoped: pick Vaughan, search again ----------
const inPick = await pickCityVaughan();
const ready = await poll(`typeof crPrepState !== 'undefined' && crPrepState === 'ready'`, 30000).catch(() => false);
await ev(`window.__searchUrls = []`);
const scopedRan = await runStreetSearch();
const SC = await resultSample();
ok('scoped (city loaded) the search request now carries the city BOUND (bounded=1 on the city viewbox) | ' + JSON.stringify(SC.urls),
  inPick === true && ready === true && scopedRan === true && SC.urls.length >= 1 && SC.urls[SC.urls.length - 1].indexOf('bounded=1') >= 0);
ok('scoped (city loaded) although the service returned BOTH results (it ignored the bound), only the in-city suggestion renders - the out-of-city Toronto result is filtered out | ' + JSON.stringify(SC.rows),
  SC.rows.length === 1 && SC.rows[0].indexOf('Bordeaux Drive') === 0 && !SC.rows.some(t => t.indexOf('Toronto') >= 0));

  return R;
})();
R.checks.push(...R179.checks);

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
