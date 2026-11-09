import { launchDrive, finish } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// driveT3 (DIAGNOSTIC - B3 lifecycle trace, 2026-11-09; NOT part of the
// battery, never in run.mjs ALL): two traces.
// (1) G2's second half - S1 (crStartPrep) from PREPARING through its
// only unguarded UI caller, the street-search result tap
// (renderCrResults' click handler): a fallback box is in flight, a
// second search result outside its coverage is tapped, and the S1
// supersede is recorded - from->to, gen bump, the first box's abort,
// and proof its landing never reaches coverage.
// (2) G1 arm (d), the NO-GRID control: a name-only city (the remembered
// city's lookup fails, crCity.lat stays null, crCityPrepare returns
// early, crGrid never exists) - a search-pick fallback box lands and
// S2's no-grid arm must answer 'ready'.
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
  const delayed = (make, ms, opts) => new Promise((res, rej) => { const to = setTimeout(() => res(make()), ms); const s = opts && opts.signal; if (s) s.addEventListener('abort', () => { window.__jAborted++; clearTimeout(to); const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('nominatim.openstreetmap.org') >= 0) {
      const qm = /[?&]q=([^&]+)/.exec(u); const q = qm ? decodeURIComponent(qm[1]).toLowerCase() : '';
      if (u.indexOf('featuretype=city') >= 0) {
        if (window.__tCityFail) return Promise.reject(new TypeError('fixture city lookup offline'));
        return Promise.resolve(new Response(JSON.stringify(CITY), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
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
const jEnter = async () => { await jWipe(); await ev(`openRouteMenu()`); await ev(`document.getElementById('rmCreate').click()`); await ev(`document.getElementById('crDoorManual').click()`); return await pickCityVaughan(); };
const jExitDiscard = async () => { await ev(`document.getElementById('crExit').click()`); await sleep(400); await ev(`(() => { const y = document.getElementById('crModalYes'); if (y && !document.getElementById('crModal').classList.contains('hidden')) y.click(); return true; })()`); await sleep(400); };
const streetSearchPick = async (q) => {
  await ev(`(() => { const i = document.getElementById('crSearchInput'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rows = await poll(`document.querySelectorAll('#createResults .crResult').length === 1`, 12000).catch(() => false);
  return rows === true;
};
const snap = async (tag) => {
  const s = await J(`({ state: crPrepState, fail: crPrepFail ? { kind: crPrepFail.kind, status: crPrepFail.status || null } : null, ffg: crFailFromGrid, wanted: crWanted ? crWanted.label : null, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent, grid: crGrid ? { name: crGrid.name, done: crGridDoneCount(), failed: crGridFailedCount(), pending: crGridPendingCount(), stopped: crGrid.stopped, gen: crGrid.gen, session: crGrid.session } : null, prep: crPrep ? { gen: crPrep.gen, session: crPrep.session, anchor: crPrep.anchor } : null, covBoxes: crCov ? crCov.boxes.length : -1, covFaraway1: crCov ? crInAnyBox(crCov.boxes, 43.9, -79.56) : null, covFaraway2: crCov ? crInAnyBox(crCov.boxes, 43.95, -79.4) : null, city: crCity ? { name: crCity.name, lat: crCity.lat } : null, aborted: window.__jAborted, ctr: { session: crSession, gen: crCovGen, searchSeq: crSearchSeq, citySeq: crCitySeq, lookupSeq: crCityLookupSeq, geomGen: crGeomGen } })`);
  console.log('TRACE ' + tag + ' ' + JSON.stringify(s));
  return s;
};

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

// ---------- (1) S1 from PREPARING via the search-result tap ----------
await jEnter();
const sReady = await poll(`crPrepState === 'ready'`, 30000).catch(() => false);
await ev(`window.__jDelayMs = 5000`);
const sr1 = await streetSearchPick('Faraway');
const S1pre = await snap('S1tap-pre-first-pick');
await ev(`document.querySelector('#createResults .crResult').click()`); // Faraway result at (43.9, -79.56): outside the city grid -> S1 starts fallback #1
const s1Flying = await poll(`crPrepState === 'preparing' && !!crPrep`, 10000).catch(() => false);
const S1mid = await snap('S1tap-fallback1-in-flight');
const sr2 = await streetSearchPick('Farfaraway');
const S1pre2 = await snap('S1tap-pre-second-pick');
await ev(`window.__jDelayMs = 0`); // fallback #2 answers at once; #1 is aborted by the supersede itself
await ev(`document.querySelector('#createResults .crResult').click()`); // Farfaraway at (43.95, -79.40): outside fallback #1's coverage -> S1 supersedes
const s1Landed = await poll(`crPrepState === 'ready' && !!crCov && crInAnyBox(crCov.boxes, 43.95, -79.4)`, 25000).catch(() => false);
const S1post = await snap('S1tap-after-supersede-landing');
ok('S1tap (S1 from PREPARING via the search-result tap) first pick from ready: state ' + S1pre.state + ' -> preparing (fallback #1 gen ' + (S1mid.prep && S1mid.prep.gen) + '; the settled city grid was stopped by S1: stopped=' + (S1mid.grid && S1mid.grid.stopped) + ') | second pick supersedes: gen ' + S1pre2.ctr.gen + ' -> ' + S1post.ctr.gen + ', aborts ' + S1pre2.aborted + ' -> ' + S1post.aborted + ', searchSeq ' + S1pre2.ctr.searchSeq + ' -> ' + S1post.ctr.searchSeq + ' | landed ready: ' + s1Landed + '; box #2 covers its anchor: ' + S1post.covFaraway2 + '; box #1 NEVER landed (its anchor uncovered): ' + (S1post.covFaraway1 === false),
  sReady === true && sr1 === true && s1Flying === true && sr2 === true && S1pre.state === 'ready' && S1mid.grid && S1mid.grid.stopped === 'superseded' && S1post.ctr.gen === S1pre2.ctr.gen + 1 && S1post.aborted > S1pre2.aborted && s1Landed === true && S1post.covFaraway2 === true && S1post.covFaraway1 === false);
await jExitDiscard();

// ---------- (2) G1 arm (d): the NO-GRID fallback landing (name-only city) ----------
await ev(`(() => { localStorage.setItem(LS_GLOBAL.lastArea, 'Vaughan'); return true; })()`);
await ev(`window.__tCityFail = true`); // the remembered-city lookup will FAIL -> name-only city
await jWipe();
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
const dPane = await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
const dLastVisible = await ev(`document.getElementById('crCityLast').style.display !== 'none'`);
await ev(`document.getElementById('crCityLast').click()`);
const dInPick = await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 10000).catch(() => false);
const D1 = await snap('D-name-only-city-no-grid');
const srD = await streetSearchPick('Faraway');
await ev(`document.querySelector('#createResults .crResult').click()`); // S1 with NO grid in existence
const dLanded = await poll(`crPrep === null && crPrepState === 'ready'`, 25000).catch(() => false);
const D2 = await snap('D-fallback-landing-no-grid');
ok('D (no-grid control, S2 no-grid arm) name-only city established: state=' + D1.state + ' grid=' + JSON.stringify(D1.grid) + ' city lat=' + (D1.city && D1.city.lat) + ' (crCityPrepare returned early) | the fallback box landed with crGrid still null -> OBSERVED to-state "' + D2.state + '" (the code arm is crGrid ? settled : ready) | covBoxes=' + D2.covBoxes,
  dPane === true && dLastVisible === true && dInPick === true && D1.state === 'none' && D1.grid === null && D1.city && D1.city.lat === null && srD === true && dLanded === true && D2.state === 'ready' && D2.grid === null);
await ev(`window.__tCityFail = false`);
await jExitDiscard();

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
