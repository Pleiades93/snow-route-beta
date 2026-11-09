import { launchDrive, finish } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// driveT2 (DIAGNOSTIC - B3 lifecycle trace, 2026-11-09; NOT part of the
// battery, never in run.mjs ALL): G2 - the S6 (crCityPrepare) supersede
// from-states, driven through the REAL UI handlers (city chip ->
// crOpenCityPane('pick') -> typed city search -> result row click ->
// crPickCity -> crEnterPickFromCity -> crCityPrepare). From-states:
// none (the first pick itself), ready, degraded, failed, preparing.
// City A = drive152's fixture Vaughan (2 x 2 grid); city B = a fixture
// Markham on a same-size grid. Every arm prints TRACE snapshots with
// the six counter families before/after, the old grid's stopped marker
// and ops set, and what the interrupted preparation's late landings do.
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
  seg(9030, 'Markham Main Street', [[43.8400, -79.3100], [43.8600, -79.3100], [43.8800, -79.3100]]);
  seg(9031, 'Markham Main Street', [[43.8800, -79.3100], [43.8850, -79.3100]]);
  return { byId };
})();
const JCITY = [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8150', lon: '-79.5600', boundingbox: ['43.785', '43.845', '-79.610', '-79.5105'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada', country_code: 'ca' } }];
const MCITY = [{ display_name: 'Markham, Ontario, Canada', lat: '43.8600', lon: '-79.3100', boundingbox: ['43.830', '43.890', '-79.340', '-79.280'], class: 'place', type: 'city', address: { city: 'Markham', state: 'Ontario', country: 'Canada', country_code: 'ca' } }];
const installStubT = `(() => {
  const DATA = ${JSON.stringify(JDATA)};
  const CITY = ${JSON.stringify(JCITY)};
  const MARKHAM = ${JSON.stringify(MCITY)};
  const prev = window.fetch.bind(window);
  window.__jDelayMs = 0; window.__geoLog = []; window.__jAborted = 0;
  window.__tFailCells = null; // null | 'ALL' | [[s, w], ...] - Vaughan grid-cell origins the service refuses (503)
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
      const qm = /[?&]q=([^&]+)/.exec(u); const q = qm ? decodeURIComponent(qm[1]).toLowerCase() : '';
      const payload = q.indexOf('markham') >= 0 ? MARKHAM : CITY;
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
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
const typeCity = async (nm) => {
  await ev(`(() => { const i = document.getElementById('crCityInput'); i.value = ${JSON.stringify(nm)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  return await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 1`, 10000).catch(() => false);
};
const pickCityVaughan = async () => {
  const pane = await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
  const rows = await typeCity('Vaughan');
  if (rows === true) await ev(`document.querySelector('#crCityResults .routeRow').click()`);
  const inPick = rows === true ? await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 10000).catch(() => false) : false;
  return { pane: pane === true, rows: rows === true, inPick: inPick === true };
};
const jEnter = async () => { await jWipe(); await ev(`openRouteMenu()`); await ev(`document.getElementById('rmCreate').click()`); await ev(`document.getElementById('crDoorManual').click()`); return await pickCityVaughan(); };
const jExitDiscard = async () => { await ev(`document.getElementById('crExit').click()`); await sleep(400); await ev(`(() => { const y = document.getElementById('crModalYes'); if (y && !document.getElementById('crModal').classList.contains('hidden')) y.click(); return true; })()`); await sleep(400); };
// the city change through the real UI: city chip -> pane -> type -> row
const openChangePane = async () => {
  await ev(`document.getElementById('crCityChange').click()`);
  const pane = await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
  return pane === true;
};
const snap = async (tag) => {
  const s = await J(`({ state: crPrepState, fail: crPrepFail ? { kind: crPrepFail.kind, status: crPrepFail.status || null } : null, ffg: crFailFromGrid, wanted: crWanted ? crWanted.label : null, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent, grid: crGrid ? { name: crGrid.name, done: crGridDoneCount(), failed: crGridFailedCount(), pending: crGridPendingCount(), stopped: crGrid.stopped, gen: crGrid.gen, session: crGrid.session } : null, oldGrid: window.__oldGrid ? { name: window.__oldGrid.name, stopped: window.__oldGrid.stopped, ops: window.__oldGrid.ops.size, gen: window.__oldGrid.gen, isCurrent: crGridCurrent(window.__oldGrid), isLive: crGrid === window.__oldGrid } : null, covBoxes: crCov ? crCov.boxes.length : -1, covAllMarkham: crCov ? crCov.boxes.every(b => b.s >= 43.83 - 0.001 && b.n <= 43.89 + 0.001 && b.w >= -79.34 - 0.001 && b.e <= -79.28 + 0.001) : null, aborted: window.__jAborted, ctr: { session: crSession, gen: crCovGen, searchSeq: crSearchSeq, citySeq: crCitySeq, lookupSeq: crCityLookupSeq, geomGen: crGeomGen } })`);
  console.log('TRACE ' + tag + ' ' + JSON.stringify(s));
  return s;
};
const markhamReady = async () => await poll(`crPrepState === 'ready' && !!crGrid && crGrid.name === 'Markham'`, 30000).catch(() => false);

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
ok('setup: 5W loaded and the fixture stub installed', SETUP.names.length === PACK5W.names);
await ev(installStubT);

// ---------- N: S6 from NONE (the first pick itself) ----------
await jWipe();
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
const nPane = await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
const nRows = await typeCity('Vaughan');
const Npre = await snap('N-pre-first-pick');
await ev(`document.querySelector('#crCityResults .routeRow').click()`);
const Npost = await snap('N-post-first-pick-S6');
const nReady = await poll(`crPrepState === 'ready'`, 30000).catch(() => false);
ok('N (S6 from NONE, first pick through the city pane) pre: state=' + Npre.state + ' session=' + Npre.ctr.session + ' gen=' + Npre.ctr.gen + ' -> post: state=' + Npost.state + ' sessionDelta=' + (Npost.ctr.session - Npre.ctr.session) + ' genDelta=' + (Npost.ctr.gen - Npre.ctr.gen) + ' lookupDelta=' + (Npost.ctr.lookupSeq - Npre.ctr.lookupSeq) + ' | then settled ready: ' + nReady,
  nPane === true && nRows === true && Npre.state === 'none' && Npost.state === 'preparing' && nReady === true);
await jExitDiscard();

// ---------- R: S6 from READY ----------
await jEnter();
const rReady = await poll(`crPrepState === 'ready'`, 30000).catch(() => false);
await ev(`window.__oldGrid = crGrid`);
const rPane = await openChangePane();
const rRows = await typeCity('Markham');
const Rpre = await snap('R-pre-change-from-ready');
await ev(`document.querySelector('#crCityResults .routeRow').click()`);
const Rpost = await snap('R-post-change-S6');
const rSettled = await markhamReady();
const Rlate = await snap('R-late-markham-settled');
ok('R (S6 from READY via the city chip) from=' + Rpre.state + ' -> to=' + Rpost.state + ' | old grid stopped=' + (Rpost.oldGrid && Rpost.oldGrid.stopped) + ' genDelta=' + (Rpost.ctr.gen - Rpre.ctr.gen) + ' sessionDelta=' + (Rpost.ctr.session - Rpre.ctr.session) + ' | Markham settled ready: ' + rSettled + ', coverage boxes all Markham: ' + Rlate.covAllMarkham + ' (count ' + Rlate.covBoxes + ')',
  rReady === true && rPane === true && rRows === true && Rpre.state === 'ready' && Rpost.state === 'preparing' && Rpost.oldGrid && Rpost.oldGrid.stopped === 'superseded' && rSettled === true && Rlate.covAllMarkham === true);
await jExitDiscard();

// ---------- D: S6 from DEGRADED ----------
await ev(`window.__tFailCells = [[43.820929, -79.56024]]`);
await jEnter();
const dDeg = await poll(`crPrepState === 'degraded'`, 40000).catch(() => false);
await ev(`window.__oldGrid = crGrid`);
const dPane = await openChangePane();
const dRows = await typeCity('Markham');
const Dpre = await snap('D-pre-change-from-degraded');
await ev(`document.querySelector('#crCityResults .routeRow').click()`);
const Dpost = await snap('D-post-change-S6');
const dSettled = await markhamReady();
ok('D (S6 from DEGRADED via the city chip) from=' + Dpre.state + ' (done=' + (Dpre.grid && Dpre.grid.done) + ' failed=' + (Dpre.grid && Dpre.grid.failed) + ') -> to=' + Dpost.state + ' | old grid stopped=' + (Dpost.oldGrid && Dpost.oldGrid.stopped) + ' genDelta=' + (Dpost.ctr.gen - Dpre.ctr.gen) + ' sessionDelta=' + (Dpost.ctr.session - Dpre.ctr.session) + ' | Markham settled ready: ' + dSettled,
  dDeg === true && dPane === true && dRows === true && Dpre.state === 'degraded' && Dpost.state === 'preparing' && dSettled === true);
await ev(`window.__tFailCells = null`);
await jExitDiscard();

// ---------- F: S6 from FAILED ----------
await ev(`window.__tFailCells = 'ALL'`);
await jEnter();
const fFailed = await poll(`crPrepState === 'failed'`, 40000).catch(() => false);
await ev(`window.__oldGrid = crGrid`);
const fPane = await openChangePane();
const fRows = await typeCity('Markham');
const Fpre = await snap('F-pre-change-from-failed');
await ev(`document.querySelector('#crCityResults .routeRow').click()`);
const Fpost = await snap('F-post-change-S6');
const fSettled = await markhamReady();
ok('F (S6 from FAILED via the city chip) from=' + Fpre.state + ' ffg=' + Fpre.ffg + ' -> to=' + Fpost.state + ' | S6 side effects observed: crPrepFail cleared to null: ' + (Fpost.fail === null) + ', crFailFromGrid SURVIVES S6 (not cleared): ' + Fpost.ffg + ' | old grid stopped=' + (Fpost.oldGrid && Fpost.oldGrid.stopped) + ' | Markham settled ready: ' + fSettled,
  fFailed === true && fPane === true && fRows === true && Fpre.state === 'failed' && Fpre.ffg === true && Fpost.state === 'preparing' && Fpost.fail === null && Fpost.ffg === true && fSettled === true);
await ev(`window.__tFailCells = null`);
await jExitDiscard();

// ---------- P: S6 from PREPARING (the interrupted in-flight preparation) ----------
await ev(`window.__jDelayMs = 6000`);
await jEnter();
const pFlying = await poll(`!!(crGrid && crGrid.cells.some(c => c.state === 'fetching'))`, 15000).catch(() => false);
await ev(`window.__oldGrid = crGrid`);
const pPane = await openChangePane();
const pRows = await typeCity('Markham');
const Ppre = await snap('P-pre-change-from-preparing');
await ev(`window.__jDelayMs = 0`); // Markham's own cells answer at once; Vaughan's in-flight keep their 6 s
await ev(`document.querySelector('#crCityResults .routeRow').click()`);
const Ppost = await snap('P-post-change-S6');
const pSettled = await markhamReady();
await sleep(7000); // Vaughan's orphaned answers' arrival window passes (they were aborted at the stop)
const Plate = await snap('P-late-after-orphan-window');
ok('P (S6 from PREPARING via the city chip) from=' + Ppre.state + ' -> to=' + Ppost.state + ' (new grid ' + (Ppost.grid && Ppost.grid.name) + ') | interrupted grid: stopped=' + (Ppost.oldGrid && Ppost.oldGrid.stopped) + ' ops=' + (Ppost.oldGrid && Ppost.oldGrid.ops) + ' isCurrent=' + (Ppost.oldGrid && Ppost.oldGrid.isCurrent) + ' aborts ' + Ppre.aborted + '->' + Ppost.aborted + ' genDelta=' + (Ppost.ctr.gen - Ppre.ctr.gen) + ' sessionDelta=' + (Ppost.ctr.session - Ppre.ctr.session) + ' | after the orphan window: state=' + Plate.state + ' grid=' + (Plate.grid && Plate.grid.name) + ' coverage all Markham: ' + Plate.covAllMarkham,
  pFlying === true && pPane === true && pRows === true && Ppre.state === 'preparing' && Ppost.state === 'preparing' && Ppost.oldGrid && Ppost.oldGrid.stopped === 'superseded' && Ppost.oldGrid.ops === 0 && Ppost.oldGrid.isCurrent === false && Ppost.aborted > Ppre.aborted && pSettled === true && Plate.covAllMarkham === true && Plate.grid && Plate.grid.name === 'Markham');
await jExitDiscard();

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
