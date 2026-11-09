// (comment-only re-trigger: lands the run for the workflow commit before it.)
import { launchDrive, finish } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// driveT7 (DIAGNOSTIC - B3 lifecycle trace, 2026-11-09; NOT part of the
// battery): the S10 (exitCreate) edges into 'none', one per reachable
// from-state - ready, degraded, failed, preparing. Each arm settles
// into its state, exits through the real #crExit control (confirming
// the discard modal when it appears), and snapshots the post-exit
// record: state, grid, creating flag and the counters exitCreate bumps.
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
const installStubT = `(() => {
  const DATA = ${JSON.stringify(JDATA)};
  const CITY = ${JSON.stringify(JCITY)};
  const prev = window.fetch.bind(window);
  window.__jDelayMs = 0; window.__geoLog = []; window.__jAborted = 0;
  window.__tFailCells = null;
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
  const delayed = (make, ms, opts) => new Promise((res, rej) => { const to = setTimeout(() => res(make()), ms); const s = opts && opts.signal; if (s) s.addEventListener('abort', () => { window.__jAborted++; clearTimeout(to); const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
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
      if (box && window.__tFailCells) {
        const origins = window.__tFailCells === 'ALL' ? CELL_ORIGINS : window.__tFailCells;
        if (origins.some(o => Math.abs(box.s - o[0]) < 0.0005 && Math.abs(box.w - o[1]) < 0.0005)) return refused();
      }
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
  await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
  await ev(`(() => { const i = document.getElementById('crCityInput'); i.value = 'Vaughan'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rows = await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 1`, 10000).catch(() => false);
  if (rows === true) await ev(`document.querySelector('#crCityResults .routeRow').click()`);
  await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 10000).catch(() => false);
};
const jEnter = async () => { await jWipe(); await ev(`openRouteMenu()`); await ev(`document.getElementById('rmCreate').click()`); await ev(`document.getElementById('crDoorManual').click()`); await pickCityVaughan(); };
const exitAndSnap = async (tag) => {
  await ev(`document.getElementById('crExit').click()`);
  await sleep(500);
  await ev(`(() => { const y = document.getElementById('crModalYes'); if (y && !document.getElementById('crModal').classList.contains('hidden')) y.click(); return true; })()`);
  const out = await poll(`creating === false && crPrepState === 'none'`, 12000).catch(() => false);
  const s = await snap(tag);
  return { out: out === true, s };
};
const snap = async (tag) => {
  const s = await J(`({ state: crPrepState, grid: crGrid ? crGrid.name : null, creating: creating, ctr: { session: crSession, gen: crCovGen, searchSeq: crSearchSeq, citySeq: crCitySeq, lookupSeq: crCityLookupSeq, geomGen: crGeomGen } })`);
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

// E-ready: exit from READY
await jEnter();
const eReady = await poll(`crPrepState === 'ready'`, 30000).catch(() => false);
const preR = await snap('T7-pre-exit-from-ready');
const R7 = await exitAndSnap('T7-post-exit-from-ready');
ok('T7 exit from READY (S10): pre state=' + preR.state + ' -> post state=' + R7.s.state + ' grid=' + R7.s.grid + ' creating=' + R7.s.creating + ' | counter deltas across S10: session +' + (R7.s.ctr.session - preR.ctr.session) + ' gen +' + (R7.s.ctr.gen - preR.ctr.gen) + ' searchSeq +' + (R7.s.ctr.searchSeq - preR.ctr.searchSeq) + ' lookupSeq +' + (R7.s.ctr.lookupSeq - preR.ctr.lookupSeq),
  eReady === true && R7.out && R7.s.state === 'none' && R7.s.grid === null && R7.s.creating === false);

// E-degraded: exit from DEGRADED
await ev(`window.__tFailCells = [[43.820929, -79.56024]]`);
await jEnter();
const eDeg = await poll(`crPrepState === 'degraded'`, 40000).catch(() => false);
const preD = await snap('T7-pre-exit-from-degraded');
const D7 = await exitAndSnap('T7-post-exit-from-degraded');
ok('T7 exit from DEGRADED (S10): pre state=' + preD.state + ' -> post state=' + D7.s.state + ' grid=' + D7.s.grid + ' creating=' + D7.s.creating,
  eDeg === true && D7.out && D7.s.state === 'none' && D7.s.grid === null && D7.s.creating === false);
await ev(`window.__tFailCells = null`);

// E-failed: exit from FAILED
await ev(`window.__tFailCells = 'ALL'`);
await jEnter();
const eFail = await poll(`crPrepState === 'failed'`, 40000).catch(() => false);
const preF = await snap('T7-pre-exit-from-failed');
const F7 = await exitAndSnap('T7-post-exit-from-failed');
ok('T7 exit from FAILED (S10): pre state=' + preF.state + ' -> post state=' + F7.s.state + ' grid=' + F7.s.grid + ' creating=' + F7.s.creating,
  eFail === true && F7.out && F7.s.state === 'none' && F7.s.grid === null && F7.s.creating === false);
await ev(`window.__tFailCells = null`);

// E-preparing: exit from PREPARING (grid mid-load)
await ev(`window.__jDelayMs = 6000`);
await jEnter();
const ePrep = await poll(`!!(crGrid && crGrid.cells.some(c => c.state === 'fetching')) && crPrepState === 'preparing'`, 15000).catch(() => false);
const preP = await snap('T7-pre-exit-from-preparing');
const P7 = await exitAndSnap('T7-post-exit-from-preparing');
ok('T7 exit from PREPARING (S10): pre state=' + preP.state + ' -> post state=' + P7.s.state + ' grid=' + P7.s.grid + ' creating=' + P7.s.creating,
  ePrep === true && P7.out && P7.s.state === 'none' && P7.s.grid === null && P7.s.creating === false);
await ev(`window.__jDelayMs = 0`);

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
