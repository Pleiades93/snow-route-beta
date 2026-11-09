// (comment-only re-trigger: the preceding workflow edit lands dead via the API token; a drive-only commit runs.)
import { launchDrive, finish } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// driveT4 (DIAGNOSTIC - B3 lifecycle trace, 2026-11-09; NOT part of the
// battery): G1 arm (d), the NO-GRID control, as the page's FIRST create
// session (driveT3's attempt ran inside a prior session whose exit did
// not take, so its snapshots were contaminated). The remembered city
// 'Vaughan' is seeded; its lookup is made to FAIL, so crCity becomes
// name-only (lat null), crEnterPickFromCity runs, crCityPrepare returns
// early, and NO grid ever exists. A street-search pick then starts the
// fallback box (S1) and its landing (S2's no-grid arm) is observed.
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
const JDATA = (() => {
  const byId = {};
  const seg = (id, name, pts) => { byId[id] = { name, geometry: pts.map(p => ({ lat: p[0], lon: p[1] })) }; };
  seg(9001, 'Edgewater Avenue', [[43.8000, -79.5750], [43.8100, -79.5750], [43.8200, -79.5750]]);
  seg(9010, 'Faraway Avenue', [[43.8060, -79.5600], [43.8200, -79.5600], [43.8500, -79.5600]]);
  return { byId };
})();
const JCITY = [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8150', lon: '-79.5600', boundingbox: ['43.785', '43.845', '-79.610', '-79.5105'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada', country_code: 'ca' } }];
const STREET_RESULTS = {
  faraway: [{ display_name: 'Faraway Avenue, Vaughan, Ontario, Canada', lat: '43.9000', lon: '-79.5600', address: { city: 'Vaughan' } }],
  other: [{ display_name: 'Bordeaux Drive, Vaughan, Ontario, Canada', lat: '43.798972', lon: '-79.574666', address: { city: 'Vaughan' } }]
};
const installStubT = `(() => {
  const DATA = ${JSON.stringify(JDATA)};
  const CITY = ${JSON.stringify(JCITY)};
  const STREETS = ${JSON.stringify(STREET_RESULTS)};
  const prev = window.fetch.bind(window);
  window.__jDelayMs = 0; window.__geoLog = []; window.__jAborted = 0;
  window.__tCityFail = false;
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
      const qm = /[?&]q=([^&]+)/.exec(u); const q = qm ? decodeURIComponent(qm[1]).toLowerCase() : '';
      if (u.indexOf('featuretype=city') >= 0) {
        if (window.__tCityFail) return Promise.reject(new TypeError('fixture city lookup offline'));
        return Promise.resolve(new Response(JSON.stringify(CITY), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      const payload = q.indexOf('faraway') >= 0 ? STREETS.faraway : STREETS.other;
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) {
      const raw = decodeURIComponent((opts && opts.body) || '').replace(/^data=/, '');
      window.__geoLog.push({ host: u.indexOf('kumi') >= 0 ? 'kumi' : 'de', body: raw });
      const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
      return Promise.resolve(json({ elements: elsFor(raw) }));
    }
    return prev(url, opts);
  };
  return true;
})()`;
const jWipe = async () => { await ev(`(async () => { await new Promise(res => { try { const rq = indexedDB.deleteDatabase('snowroute-citycache'); rq.onsuccess = () => res(); rq.onerror = () => res(); rq.onblocked = () => res(); } catch (e) { res(); } }); return true; })()`); };
const snap = async (tag) => {
  const s = await J(`({ state: crPrepState, fail: crPrepFail ? { kind: crPrepFail.kind, status: crPrepFail.status || null } : null, ffg: crFailFromGrid, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent, grid: crGrid ? { name: crGrid.name, stopped: crGrid.stopped } : null, covBoxes: crCov ? crCov.boxes.length : -1, covFaraway1: crCov ? crInAnyBox(crCov.boxes, 43.9, -79.56) : null, city: crCity ? { name: crCity.name, lat: crCity.lat } : null, creating: creating, stage: crStage, ctr: { session: crSession, gen: crCovGen, searchSeq: crSearchSeq, citySeq: crCitySeq, lookupSeq: crCityLookupSeq, geomGen: crGeomGen } })`);
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

// the FIRST create session of this page: remembered city, failing lookup
await ev(`(() => { localStorage.setItem(LS_GLOBAL.lastArea, 'Vaughan'); return true; })()`);
await ev(`window.__tCityFail = true`);
await jWipe();
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
const dPane = await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
const dLastVisible = await ev(`document.getElementById('crCityLast').style.display !== 'none'`);
await ev(`document.getElementById('crCityLast').click()`);
const dInPick = await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 10000).catch(() => false);
const D1 = await snap('T4-name-only-city-no-grid');
await ev(`(() => { const i = document.getElementById('crSearchInput'); i.value = 'Faraway'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const dRows = await poll(`document.querySelectorAll('#createResults .crResult').length === 1 && document.querySelector('#createResults .crResult').textContent.indexOf('Faraway Avenue') >= 0`, 12000).catch(() => false);
await ev(`document.querySelector('#createResults .crResult').click()`); // S1 with NO grid in existence
const dLanded = await poll(`crPrep === null && crPrepState === 'ready'`, 25000).catch(() => false);
const D2 = await snap('T4-fallback-landing-no-grid');
ok('T4 (no-grid control, S2 no-grid arm) name-only city established as the first session: creating=' + D1.creating + ' state=' + D1.state + ' grid=' + JSON.stringify(D1.grid) + ' city lat=' + (D1.city && D1.city.lat) + ' covBoxes=' + D1.covBoxes + ' session=' + D1.ctr.session + ' | the fallback box then landed with crGrid STILL null -> OBSERVED to-state "' + D2.state + '" covBoxes=' + D2.covBoxes + ' anchor covered: ' + D2.covFaraway1,
  dPane === true && dLastVisible === true && dInPick === true && D1.state === 'none' && D1.grid === null && D1.city && D1.city.lat === null && D1.covBoxes === 0 && dRows === true && dLanded === true && D2.state === 'ready' && D2.grid === null && D2.covBoxes === 1);

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
