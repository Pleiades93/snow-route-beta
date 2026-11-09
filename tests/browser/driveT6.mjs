import { launchDrive, finish } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// driveT6 (DIAGNOSTIC - B3 lifecycle trace, 2026-11-09; NOT part of the
// battery): G2's S1-from-PREPARING supersede through the search-result
// tap, corrected. driveT3's attempt clicked a STALE result: its poll
// accepted the first search's still-displayed row, so the click
// re-anchored the in-flight box itself and crStartPrep's dedupe guard
// (create-citydata.js: the in-flight anchor's inner box) correctly
// refused. Here each pick waits for the result row whose TEXT names
// the intended street. Fallback #1 (43.9, -79.56) hangs 5 s; the
// Farfaraway pick (43.95, -79.40) sits outside #1's dedupe box, so S1
// must abort #1, bump the generation, and land #2 alone.
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
  farfaraway: [{ display_name: 'Farfaraway Avenue, Vaughan, Ontario, Canada', lat: '43.9500', lon: '-79.4000', address: { city: 'Vaughan' } }],
  faraway: [{ display_name: 'Faraway Avenue, Vaughan, Ontario, Canada', lat: '43.9000', lon: '-79.5600', address: { city: 'Vaughan' } }],
  other: [{ display_name: 'Bordeaux Drive, Vaughan, Ontario, Canada', lat: '43.798972', lon: '-79.574666', address: { city: 'Vaughan' } }]
};
const installStubT = `(() => {
  const DATA = ${JSON.stringify(JDATA)};
  const CITY = ${JSON.stringify(JCITY)};
  const STREETS = ${JSON.stringify(STREET_RESULTS)};
  const prev = window.fetch.bind(window);
  window.__jDelayMs = 0; window.__geoLog = []; window.__jAborted = 0;
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
  const delayed = (make, ms, opts) => new Promise((res, rej) => { const to = setTimeout(() => res(make()), ms); const s = opts && opts.signal; if (s) s.addEventListener('abort', () => { window.__jAborted++; clearTimeout(to); const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('nominatim.openstreetmap.org') >= 0) {
      const qm = /[?&]q=([^&]+)/.exec(u); const q = qm ? decodeURIComponent(qm[1]).toLowerCase() : '';
      if (u.indexOf('featuretype=city') >= 0) return Promise.resolve(new Response(JSON.stringify(CITY), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      const payload = q.indexOf('farfaraway') >= 0 ? STREETS.farfaraway : (q.indexOf('faraway') >= 0 ? STREETS.faraway : STREETS.other);
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) {
      const raw = decodeURIComponent((opts && opts.body) || '').replace(/^data=/, '');
      window.__geoLog.push({ host: u.indexOf('kumi') >= 0 ? 'kumi' : 'de', body: raw });
      const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
      const d = window.__jDelayMs || 0;
      const make = () => json({ elements: elsFor(raw) });
      return d > 0 ? delayed(make, d, opts) : Promise.resolve(make());
    }
    return prev(url, opts);
  };
  return true;
})()`;
const jWipe = async () => { await ev(`(async () => { await new Promise(res => { try { const rq = indexedDB.deleteDatabase('snowroute-citycache'); rq.onsuccess = () => res(); rq.onerror = () => res(); rq.onblocked = () => res(); } catch (e) { res(); } }); return true; })()`); };
const pickCityVaughan = async () => {
  const pane = await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
  await ev(`(() => { const i = document.getElementById('crCityInput'); i.value = 'Vaughan'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rows = await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 1`, 10000).catch(() => false);
  if (rows === true) await ev(`document.querySelector('#crCityResults .routeRow').click()`);
  const inPick = rows === true ? await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 10000).catch(() => false) : false;
  return { pane: pane === true, rows: rows === true, inPick: inPick === true };
};
// type a street search and wait for the row whose TEXT names the street
// (driveT3's bug was accepting the previous search's still-shown row)
const searchPick = async (q, textNeedle, excludeNeedle) => {
  await ev(`(() => { const i = document.getElementById('crSearchInput'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const pred = `(() => { const b = document.querySelector('#createResults .crResult'); return !!b && b.textContent.indexOf(${JSON.stringify(textNeedle)}) >= 0 ${excludeNeedle ? `&& b.textContent.indexOf(${JSON.stringify(excludeNeedle)}) < 0` : ''}; })()`;
  return await poll(pred, 15000).catch(() => false);
};
const snap = async (tag) => {
  const s = await J(`({ state: crPrepState, fail: crPrepFail ? { kind: crPrepFail.kind, status: crPrepFail.status || null } : null, ffg: crFailFromGrid, hint: document.getElementById('createHint').textContent, grid: crGrid ? { name: crGrid.name, done: crGridDoneCount(), failed: crGridFailedCount(), pending: crGridPendingCount(), stopped: crGrid.stopped } : null, prep: crPrep ? { gen: crPrep.gen, session: crPrep.session, anchor: crPrep.anchor } : null, covBoxes: crCov ? crCov.boxes.length : -1, covFaraway1: crCov ? crInAnyBox(crCov.boxes, 43.9, -79.56) : null, covFaraway2: crCov ? crInAnyBox(crCov.boxes, 43.95, -79.4) : null, aborted: window.__jAborted, ctr: { session: crSession, gen: crCovGen, searchSeq: crSearchSeq, citySeq: crCitySeq, lookupSeq: crCityLookupSeq, geomGen: crGeomGen } })`);
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

await jWipe();
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan();
const ready = await poll(`crPrepState === 'ready'`, 30000).catch(() => false);
await ev(`window.__jDelayMs = 5000`);
const r1 = await searchPick('Faraway', 'Faraway Avenue', 'Farfaraway');
await ev(`document.querySelector('#createResults .crResult').click()`); // (43.9, -79.56): outside the grid -> S1 fallback #1
const flying = await poll(`crPrepState === 'preparing' && !!crPrep`, 10000).catch(() => false);
const MID = await snap('T6-fallback1-in-flight');
const r2 = await searchPick('Farfaraway', 'Farfaraway Avenue', null);
const PRE2 = await snap('T6-pre-second-pick');
await ev(`window.__jDelayMs = 0`);
await ev(`document.querySelector('#createResults .crResult').click()`); // (43.95, -79.40): outside #1's dedupe box -> S1 supersedes
const landed = await poll(`crPrep === null && crPrepState === 'ready' && crInAnyBox(crCov.boxes, 43.95, -79.4)`, 25000).catch(() => false);
const POST = await snap('T6-after-supersede-landing');
ok('T6 (S1 from PREPARING via the search-result tap - corrected pick) fallback #1 in flight: state=' + MID.state + ' prep gen=' + (MID.prep && MID.prep.gen) + ' (the settled grid was stopped by S1: stopped=' + (MID.grid && MID.grid.stopped) + ') | the second pick SUPERSEDES: gen ' + PRE2.ctr.gen + ' -> ' + POST.ctr.gen + ', aborts ' + PRE2.aborted + ' -> ' + POST.aborted + ', searchSeq ' + PRE2.ctr.searchSeq + ' -> ' + POST.ctr.searchSeq + ' | landed ready: ' + landed + '; box #2 covers its anchor: ' + POST.covFaraway2 + '; box #1 NEVER landed (anchor uncovered): ' + (POST.covFaraway1 === false) + '; final state=' + POST.state,
  ready === true && r1 === true && flying === true && r2 === true && MID.state === 'preparing' && POST.ctr.gen === PRE2.ctr.gen + 1 && POST.aborted > PRE2.aborted && landed === true && POST.covFaraway2 === true && POST.covFaraway1 === false && POST.state === 'ready');

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
