import { launchDrive, finish } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// driveT5 (DIAGNOSTIC - B3 lifecycle trace, 2026-11-09; NOT part of the
// battery): G1 arm A2b, corrected. driveT1's attempt aimed its
// fail-the-fallback-box rule at the box around (43.9, -79.56), but the
// street tap anchors the fallback at the STREET's point (43.815,
// -79.56), whose outer box's south edge is 43.788051 - so the box
// succeeded and T1's A2b silently re-traced A2. Here the rule targets
// 43.788051: the grid wholly fails (S5), a street tap sets the wanted
// offer, the hint button starts the fallback, and the fallback itself
// is refused (503) - the S3 landing over a wholly-failed grid.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const FIXDATA = JSON.parse(fs.readFileSync(new URL('./fixtures/create-osm.json', import.meta.url), 'utf8'));
const elsByName = FIXDATA.overpass;
const CITY_FIXTURE = [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8367', lon: '-79.4982', boundingbox: ['43.7256', '43.9538', '-79.6120', '-79.3858'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada' } },
  { display_name: 'Vaughan Road, Toronto, Ontario, Canada', lat: '43.6830', lon: '-79.4260', class: 'highway', type: 'residential', address: { road: 'Vaughan Road', city: 'Toronto' } }];
const FIXTURE = {
  nominatim: [{ display_name: 'Bordeaux Drive, Vaughan, Ontario, Canada', lat: '43.798972', lon: '-79.574666', address: { city: 'Vaughan' } }],
  nominatimCity: CITY_FIXTURE,
  overpass: { 'Bordeaux Drive': elsByName['Bordeaux Drive'], 'Alderson Avenue': elsByName['Alderson Avenue'] }
};
const installStub = `(() => {
  const FIX = ${JSON.stringify(FIXTURE)};
  const orig = window.fetch.bind(window);
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('nominatim.openstreetmap.org') >= 0) {
      if (u.indexOf('featuretype=city') >= 0) return Promise.resolve(new Response(JSON.stringify(FIX.nominatimCity), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return Promise.resolve(new Response(JSON.stringify(FIX.nominatim), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) {
      const raw = decodeURIComponent((opts && opts.body) || '');
      (window.__geoLog = window.__geoLog || []).push({ host: u.indexOf('kumi') >= 0 ? 'kumi' : 'de', body: raw });
      if (raw.indexOf('["highway"]') >= 0) { const els = []; for (const k of Object.keys(FIX.overpass)) els.push(...FIX.overpass[k]); return Promise.resolve(new Response(JSON.stringify({ elements: els }), { status: 200, headers: { 'Content-Type': 'application/json' } })); }
      const m = /"name"="([^"]+)"/.exec(raw);
      const els = (m && FIX.overpass[m[1]]) || [];
      return Promise.resolve(new Response(JSON.stringify({ elements: els }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return orig(url, opts);
  };
  return true;
})()`;
const pickCityVaughan = async () => {
  const pane = await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
  await ev(`(() => { const i = document.getElementById('crCityInput'); i.value = 'Vaughan'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rows = await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 1`, 10000).catch(() => false);
  if (rows === true) await ev(`document.querySelector('#crCityResults .routeRow').click()`);
  const inPick = rows === true ? await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 10000).catch(() => false) : false;
  return { pane: pane === true, rows: rows === true, inPick: inPick === true };
};
const installFeatureStub = `(() => {
  if (!map.__qrfOrig) map.__qrfOrig = map.queryRenderedFeatures.bind(map);
  window.__fixtureRoads = [];
  map.queryRenderedFeatures = () => window.__fixtureRoads.map(n => ({ type: 'Feature', sourceLayer: 'roads', properties: { name: n }, geometry: { type: 'LineString', coordinates: [] } }));
  return true;
})()`;
const tapStreet = `(() => { window.__fixtureRoads = ['Faraway Avenue']; map.fire('click', { lngLat: { lat: 43.8150, lng: -79.5600 }, point: { x: 210, y: 320 }, originalEvent: {} }); return true; })()`;
const JDATA = (() => {
  const byId = {};
  const seg = (id, name, pts) => { byId[id] = { name, geometry: pts.map(p => ({ lat: p[0], lon: p[1] })) }; };
  seg(9001, 'Edgewater Avenue', [[43.8000, -79.5750], [43.8100, -79.5750], [43.8200, -79.5750]]);
  seg(9010, 'Faraway Avenue', [[43.8060, -79.5600], [43.8200, -79.5600], [43.8500, -79.5600]]);
  return { byId };
})();
const JCITY = [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8150', lon: '-79.5600', boundingbox: ['43.785', '43.845', '-79.610', '-79.5105'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada', country_code: 'ca' } }];
const installStubT = `(() => {
  const DATA = ${JSON.stringify(JDATA)};
  const CITY = ${JSON.stringify(JCITY)};
  const prev = window.fetch.bind(window);
  window.__jDelayMs = 0; window.__geoLog = []; window.__jAborted = 0;
  window.__tFailCells = 'ALL';
  window.__tFailBox = false; // refuse the fallback box anchored at the street point (43.815, -79.56): outer south edge 43.788051
  const CELL_ORIGINS = [[43.785, -79.61], [43.785, -79.56024], [43.820929, -79.61], [43.820929, -79.56024]];
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
  const refused = () => new Promise(res => setTimeout(() => res(new Response('refused by fixture', { status: 503, headers: { 'Content-Type': 'text/plain' } })), 300));
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('nominatim.openstreetmap.org') >= 0 && u.indexOf('featuretype=city') >= 0) {
      return Promise.resolve(new Response(JSON.stringify(CITY), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) {
      const raw = decodeURIComponent((opts && opts.body) || '').replace(/^data=/, '');
      window.__geoLog.push({ host: u.indexOf('kumi') >= 0 ? 'kumi' : 'de', body: raw });
      const box = boxOf(raw);
      if (box && window.__tFailBox && Math.abs(box.s - 43.788051) < 0.001) return refused();
      if (box && window.__tFailCells === 'ALL' && CELL_ORIGINS.some(o => Math.abs(box.s - o[0]) < 0.0005 && Math.abs(box.w - o[1]) < 0.0005)) return refused();
      const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
      return Promise.resolve(json({ elements: elsFor(raw) }));
    }
    return prev(url, opts);
  };
  return true;
})()`;
const jWipe = async () => { await ev(`(async () => { await new Promise(res => { try { const rq = indexedDB.deleteDatabase('snowroute-citycache'); rq.onsuccess = () => res(); rq.onerror = () => res(); rq.onblocked = () => res(); } catch (e) { res(); } }); return true; })()`); };
const snap = async (tag) => {
  const s = await J(`({ state: crPrepState, fail: crPrepFail ? { kind: crPrepFail.kind, status: crPrepFail.status || null } : null, ffg: crFailFromGrid, wanted: crWanted ? crWanted.label : null, anchor: crPrepAnchor, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent, grid: crGrid ? { name: crGrid.name, done: crGridDoneCount(), failed: crGridFailedCount(), pending: crGridPendingCount(), stopped: crGrid.stopped, gen: crGrid.gen, session: crGrid.session } : null, covBoxes: crCov ? crCov.boxes.length : -1, ctr: { session: crSession, gen: crCovGen, searchSeq: crSearchSeq, citySeq: crCitySeq, lookupSeq: crCityLookupSeq, geomGen: crGeomGen } })`);
  console.log('TRACE ' + tag + ' ' + JSON.stringify(s));
  return s;
};

await poll(`typeof loadRoute === 'function'`, 20000);
await poll(`!!window.__bootAt`, 30000);
await ev(`document.getElementById('rmChoose').click()`);
await ev(`document.querySelector('#rmRoutes .routeRow').click()`);
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
await poll(`!document.getElementById('splash')`, 20000);
await poll(`typeof map === 'undefined' || !map || !map.isMoving()`, 25000);
await ev(installStub);
const SETUP = await J(`({ names: STREETNAMES.slice() })`);
ok('setup: 5W loaded and the fixture stub installed', SETUP.names.length === PACK5W.names);
await ev(installStubT);
await ev(installFeatureStub);

await jWipe();
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan();
const gridFailed = await poll(`crPrepState === 'failed'`, 40000).catch(() => false);
const PRE = await snap('T5-pre-wholly-failed-grid');
await ev(`window.__tFailBox = true`);
await ev(tapStreet);
const wanted = await poll(`!!crWanted`, 10000).catch(() => false);
await ev(`document.getElementById('crHintBtn').click()`); // wanted branch -> crStartPrep(anchor); the box itself is refused
const prepSeen = await poll(`crPrepState === 'preparing' && !!crPrep`, 10000).catch(() => false);
const landed = await poll(`crPrep === null && crPrepState === 'failed'`, 30000).catch(() => false);
const POST = await snap('T5-fallback-FAILURE-over-wholly-failed-grid');
ok('T5 (fallback FAILURE over wholly-failed grid, S3 - corrected target) pre: state=' + PRE.state + ' ffg=' + PRE.ffg + ' | landing captured: prepSeen=' + prepSeen + ' landed=' + landed + ' | OBSERVED to-state "' + POST.state + '" crPrepFail=' + JSON.stringify(POST.fail) + ' ffg=' + POST.ffg + ' (S3 keeps the FALLBACK failure, not the grid one) anchor kept: ' + !!POST.anchor + ' grid stopped=' + (POST.grid && POST.grid.stopped) + ' hint="' + POST.hint + '" btn="' + POST.btn + '"',
  gridFailed === true && PRE.state === 'failed' && PRE.ffg === true && wanted === true && landed === true && POST.state === 'failed' && !!POST.fail && POST.fail.kind === 'error' && POST.fail.status === 503 && POST.ffg === false && POST.grid && POST.grid.stopped === 'superseded');

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
