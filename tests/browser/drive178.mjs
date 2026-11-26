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
// (Item 3, SUPERSEDED Beta 1.223, Andrew) The ready state shows NO pill at
// all: the loaded-city confirmation ('<City> - loaded ...', cached and
// fresh forms) is removed whole - silence means loaded. P1d/P1e/P2a/P2b
// below are re-derived to assert exactly that absence at the same strength
// (ready + pill off + empty text + no button, held past the old 4 s clock).
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
const hintSample = () => J(`({ state: typeof crPrepState !== 'undefined' ? crPrepState : '', on: !!document.getElementById('createHint'), text: !!document.getElementById('createHint'), btnShown: document.getElementById('crHintBtn').style.display !== 'none', btnText: document.getElementById('crHintBtn').textContent })`);

// ---------- boot 5W ----------
await poll(`typeof loadRoute === 'function'`, 20000);
await poll(`!!window.__bootAt`, 30000);
await ev(`document.getElementById('rmChoose').click()`);
await ev(`(() => { const r = document.querySelector('#rmRoutes .routeRow'); if (r) { r.click(); const b = r.nextElementSibling && r.nextElementSibling.querySelector('.dropLoad'); if (b) b.click(); } return true; })()`);
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
ok('P1a (failed load) with the map service down the preparation settles FAILED and the remedy stands on the button (Retry) - the failure TEXT is cut since Beta 1.296: no hint surface exists (entered pick: ' + inPick1 + ') | ' + JSON.stringify(F1),
  inPick1 === true && failed === true && F1.on === false && F1.btnShown === true && F1.btnText === 'Retry'); // the failure copy for an HTTP-status failure is the service-error wording ('The street-shape service answered with an error (503). Tap Retry' - the Beta 1.223 dash sweep split the old em-dash form into two sentences) - the claim is the failure + remedy are shown, not one wording
await sleep(4600); // longer than the confirmation pill's 4 s: a failure must NOT dismiss itself
const F2 = await hintSample();
ok('P1b (failed load) 4.6 s later the failure state and its Retry button STILL stand - the remedy never auto-dismisses | ' + JSON.stringify(F2),
  F2.state === 'failed' && F2.on === false && F2.btnShown === true && F2.btnText === 'Retry');
const gapAt178 = async (w, h) => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }, S); await ev(`crRenderHint()`); return await J(`(() => { const hr = document.getElementById('createBar').getBoundingClientRect(), br = document.getElementById('crHintBtn').getBoundingClientRect(); return { gap: Math.round((br.top - hr.bottom) * 10) / 10, overlap: br.top < hr.bottom - 0.5, pillH: Math.round(hr.height) }; })()`); };
const GP390 = await gapAt178(390, 844);
const GP430 = await gapAt178(430, 932);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
await ev(`crRenderHint()`);
ok('P1m (button placement, re-derived 1.296: the failure pill is gone) with the failure standing, the Retry button hangs BELOW the create bar BY MEASUREMENT: gap > 0 and zero overlap at 390 px and 430 px | ' + JSON.stringify({ GP390, GP430 }),
  GP390.gap > 0 && GP390.overlap === false && GP430.gap > 0 && GP430.overlap === false);
await ev(`window.__failGeo = false`);
await ev(`document.getElementById('crHintBtn').click()`); // the failed state's Retry: resume the grid's failed cells
const ready1 = await poll(`typeof crPrepState !== 'undefined' && crPrepState === 'ready'`, 30000).catch(() => false);
const F3 = await J(`({ state: crPrepState, done: crGrid ? crGrid.cells.filter(c => c.state === 'done').length : -1, total: crGrid ? crGrid.cells.length : -1 })`);
ok('P1c (failed load -> Retry) activating the failed state\'s Retry after the service recovers completes the load - every cell done, state ready | ' + JSON.stringify(F3),
  ready1 === true && F3.done === F3.total && F3.total > 0);
const F4 = await hintSample();
ok('P1d (no loaded confirmation, Beta 1.223 - re-derived from the Beta 1.176 fresh-load confirmation check) the load the Retry just completed was FRESH (not restored from cache), the state is ready, and the hint shows NOTHING: pill off, empty text, no button - silence means loaded | ' + JSON.stringify(F4),
  F4.state === 'ready' && F4.on === false && F4.text === false && F4.btnShown === false);
await sleep(4600); // past the retired confirmation's 4 s clock: nothing may appear late either
const F5 = await hintSample();
ok('P1e (no loaded confirmation, Beta 1.223) 4.6 s after the fresh load readied the hint is STILL off with empty text while the city stays ready - no confirmation appears, late or otherwise | ' + JSON.stringify(F5),
  F5.state === 'ready' && F5.on === false && F5.text === false);
await exitDiscard();

// ---------- P2 (items 1a+3): the cached re-pick - no Refresh, no confirmation pill (Beta 1.223) ----------
const inPick2 = await enterManual();
const ready2 = await poll(`typeof crPrepState !== 'undefined' && crPrepState === 'ready' && !!(crGrid && crGrid.fromCache)`, 30000).catch(() => false);
const C1 = await hintSample();
ok('P2a (cached re-pick, Beta 1.223) the city readies FROM CACHE and the hint shows NOTHING - no loaded confirmation, no tap-a-road line, and NO refresh control in the healthy state | ' + JSON.stringify(C1),
  inPick2 === true && ready2 === true && C1.on === false && C1.text === false && C1.btnShown === false);
await sleep(4600); // past the retired confirmation's 4 s clock
const C2 = await hintSample();
ok('P2b (no confirmation pill, Beta 1.223) seconds after the cached re-pick readied, no hint surface exists while the city stays ready | ' + JSON.stringify(C2),
  C2.state === 'ready' && C2.on === false && C2.text === false);

// ---------- P3 (items 4+2+3): road tap - no 'Added' toast, panel title, pill stays dismissed ----------
await ev(tapStreet('Bordeaux Drive'));
await sleep(500);
const T1 = await J(`({ toast: document.getElementById('banner').classList.contains('show'), toastShown: document.getElementById('banner').classList.contains('show'), streets: draft ? draftStreets() : [], panel: document.querySelector('.crPanelTitle') ? document.querySelector('.crPanelTitle').textContent.trim() : '', pillOn: !!document.getElementById('createHint') })`);
ok('P3a (road tap) tapping a road adds it with NO popup at all since Beta 1.296 - the add is silent | ' + JSON.stringify(T1),
  T1.streets.includes('Bordeaux Drive') && T1.toast === false);
ok('P3b (panel title) the pick panel is headed \'Current selection\' | ' + JSON.stringify(T1.panel),
  T1.panel.indexOf('Current selection') === 0);
ok('P3c (no confirmation to resurrect, Beta 1.223) the road tap\'s hint re-render keeps the hint off - the loaded confirmation no longer exists',
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
const runStreetSearch = async (q, wantHint) => { // Beta 1.234 re-derived: the query and the expected shape are the caller's - a hint poll for the no-answer cases, a row poll for the crossing case (the helper's 1.229/1.233 form typed 'Vaughan' and polled for rows the service no longer returns, because there is no service)
  await ev(`(() => { const i = document.getElementById('crSearchInput'); i.value = ${JSON.stringify(q)}; return true; })()`);
  await ev(`crSearch()`); // the Enter path (Beta 1.227: the Search button is gone): cancel any debounce, run the typed query now
  return await poll(wantHint ? `document.querySelectorAll('#createResults .crHintRow').length === 1` : `document.querySelectorAll('#createResults .crResult').length > 0`, 10000).catch(() => false);
};
const resultSample = () => J(`({ rows: [...document.querySelectorAll('#createResults .crResult')].map(b => b.textContent), hint: (document.querySelector('#createResults .crHintRow') || {}).textContent || '', urls: (window.__searchUrls || []).slice() })`);

// ---------- boot 5W ----------
await poll(`typeof loadRoute === 'function'`, 20000);
await poll(`!!window.__bootAt`, 30000);
await ev(`document.getElementById('rmChoose').click()`);
await ev(`(() => { const r = document.querySelector('#rmRoutes .routeRow'); if (r) { r.click(); const b = r.nextElementSibling && r.nextElementSibling.querySelector('.dropLoad'); if (b) b.click(); } return true; })()`);
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

// ---------- control: no city loaded - the Ontario bound (Beta 1.229), both results ----------
// Beta 1.229 PREMISE UPDATE (Andrew's standing rule: every creating-a-route
// search returns Ontario results only): through 1.228 the no-city street
// search carried the visible-map BIAS (bounded=0 over whatever the map
// happened to show). It now carries the Ontario BOUND - countrycodes=ca,
// the province viewbox, bounded=1 - and the results are filtered to Ontario
// on the client (crInOntario). Both fixture results still render here: both
// ARE Ontario places (the Toronto result sits inside the province bounds),
// so the province filter passes them; the bound that drops the Toronto one
// is the CITY bound, proven by the scoped section below.
// Beta 1.233 PREMISE UPDATE (fix round 2): Package C made every street-search
// row NAME ONLY (crResultName) - the grey address tail the row used to carry
// ("Vaughan Road, Toronto, Ontario, ...") is gone by Andrew's design, so the
// word Toronto can no longer appear in ANY row's text. The two row probes
// below are re-derived to the name-only format at the same strength: the
// control proves both fixtures render by their names (Bordeaux Drive AND
// Vaughan Road - the Vaughan Road fixture IS the Toronto result), and the
// scoped section proves the city bound dropped it by the absence of its
// name. CI on e734da45/c2d2d51d showed the behaviour itself was always
// right (rows exactly ["Bordeaux Drive","Vaughan Road"], URL bounded);
// only the tail-text probe had died.
// Beta 1.234 PREMISE UPDATE: the street search makes NO request at all -
// it answers from the loaded extract (intersections only), so the 1.229
// Ontario bound's street-search half is satisfied by construction: no
// request can leave the province because no request leaves the device.
// The bound's live half is the CITY search, graded by this drive's city
// sections above. The two street sections below are re-derived to the
// no-request contract at the same strength: the stub records every
// search URL the app attempts, and the sections assert the record stays
// EMPTY while the on-device answer (a hint with no city, the fixture
// crossing with one) renders.
await ev(`window.__searchUrls = []`); // the record starts empty for this section, so empty at the sample is the section's own evidence
const ctlRan = await runStreetSearch('Vaughan', true);
const CTL = await resultSample();
ok('control (no city loaded) (Beta 1.234 re-derived) the street search attempts NO request - the Ontario bound holds by construction - and with no city loaded its whole answer is the choose-a-city hint, no rows | ' + JSON.stringify(CTL),
  ctlRan === true && CTL.rows.length === 0 && CTL.urls.length === 0 && CTL.hint === 'Choose a city first, then search an intersection');

// ---------- scoped: pick Vaughan, search again ----------
const inPick = await pickCityVaughan();
const ready = await poll(`typeof crPrepState !== 'undefined' && crPrepState === 'ready'`, 30000).catch(() => false);
await ev(`window.__searchUrls = []`);
const scopedRan = await runStreetSearch('Bordeaux', false);
const SC = await resultSample();
ok('scoped (city loaded) (Beta 1.234 re-derived) the street search still attempts NO request with a city loaded - the record the stub kept stays empty | ' + JSON.stringify(SC.urls),
  inPick === true && ready === true && scopedRan === true && SC.urls.length === 0);
ok('scoped (city loaded) (Beta 1.234 re-derived) the answer is the fixture city\'s own crossing - Bordeaux Drive & Alderson Avenue, the one junction the extract holds (a shared node) - and nothing out-of-city can render, because nothing is fetched: the city bound the 1.229 client filter enforced now lives in the crossings computation itself (proof-1232 check 1p) | ' + JSON.stringify(SC.rows),
  SC.rows.length === 1 && SC.rows[0] === 'Bordeaux Drive & Alderson Avenue');

  return R;
})();
R.checks.push(...R179.checks);

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
