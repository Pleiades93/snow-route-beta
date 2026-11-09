import { launchDrive, finish } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// driveT1 (DIAGNOSTIC - B3 lifecycle trace, 2026-11-09; NOT part of the
// battery, never in run.mjs ALL): G1 - the crGridSettledState judge's
// inputs and the crPrepState landing at S5 (crGridFinish), S2 (fallback
// landing), S3 (fallback failure) and S4 (crCancelPrep) over grids in
// known cell states. World = drive152's (j)/(k) fixture world: the same
// small 2 x 2 Vaughan over [43.785..43.845] x [-79.610..-79.5105],
// replicated self-contained. Every arm prints TRACE lines (snapshots of
// state + judge inputs + counters) to stdout; the checks assert the
// trace REACHED each terminal snapshot, with the observed values carried
// in the check names.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

// ---------- fixtures (drive152's, verbatim where shared) ----------
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
const TAP_POINTS = { 'Faraway Avenue': { lat: 43.8150, lng: -79.5600 } };
const tapStreet = name => `(() => { window.__fixtureRoads = [${JSON.stringify(name)}]; const tp = ${JSON.stringify(TAP_POINTS)}[${JSON.stringify(name)}]; map.fire('click', { lngLat: tp, point: { x: 210, y: 320 }, originalEvent: {} }); return true; })()`;

// ---------- the trace stub (drive152's J machinery + two cities + cell/box failure rules) ----------
const JDATA = (() => {
  const byId = {};
  const seg = (id, name, pts) => { byId[id] = { name, geometry: pts.map(p => ({ lat: p[0], lon: p[1] })) }; };
  seg(9001, 'Edgewater Avenue', [[43.8000, -79.5750], [43.8100, -79.5750], [43.8200, -79.5750]]);
  seg(9002, 'Edgewater Avenue', [[43.8200, -79.5750], [43.8285, -79.5750]]);
  seg(9004, 'Edgewater Avenue', [[43.8285, -79.5750], [43.8360, -79.5750]]);
  seg(9003, 'Northgate Crescent', [[43.8285, -79.5800], [43.8285, -79.5750], [43.8285, -79.5700]]);
  seg(9010, 'Faraway Avenue', [[43.8060, -79.5600], [43.8200, -79.5600], [43.8500, -79.5600]]);
  seg(9011, 'Farfaraway Avenue', [[43.7950, -79.5600], [43.8440, -79.5600], [43.8750, -79.5600]]);
  seg(9020, 'Crosscell Avenue', [[43.8150, -79.5650], [43.82093, -79.5650], [43.8260, -79.5650]]);
  seg(9021, 'Crosscell Avenue', [[43.8260, -79.5650], [43.8320, -79.5650]]);
  return { byId };
})();
const JCITY = [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8150', lon: '-79.5600', boundingbox: ['43.785', '43.845', '-79.610', '-79.5105'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada', country_code: 'ca' } }];
const installStubT = `(() => {
  const DATA = ${JSON.stringify(JDATA)};
  const CITY = ${JSON.stringify(JCITY)};
  const prev = window.fetch.bind(window);
  window.__jDelayMs = 0; window.__geoLog = []; window.__jAborted = 0;
  window.__tFailCells = null; // null | 'ALL' | [[s, w], ...] - grid-cell origins the service refuses (503)
  window.__tFailBox = false;   // refuse the fallback box around (43.9, -79.56) too
  window.__tCityFail = false;  // city lookup rejects outright
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
      if (window.__tCityFail) return Promise.reject(new TypeError('fixture city lookup offline'));
      return Promise.resolve(new Response(JSON.stringify(CITY), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) {
      const raw = decodeURIComponent((opts && opts.body) || '').replace(/^data=/, '');
      window.__geoLog.push({ host: u.indexOf('kumi') >= 0 ? 'kumi' : 'de', body: raw });
      const box = boxOf(raw);
      if (box && window.__tFailBox && Math.abs(box.s - 43.873051) < 0.001) return refused();
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
const jEnter = async () => { await jWipe(); await ev(`openRouteMenu()`); await ev(`document.getElementById('rmCreate').click()`); await ev(`document.getElementById('crDoorManual').click()`); return await pickCityVaughan(); };
const jExitDiscard = async () => { await ev(`document.getElementById('crExit').click()`); await sleep(400); await ev(`(() => { const y = document.getElementById('crModalYes'); if (y && !document.getElementById('crModal').classList.contains('hidden')) y.click(); return true; })()`); await sleep(400); };
const snap = async (tag) => {
  const s = await J(`({ state: crPrepState, fail: crPrepFail ? { kind: crPrepFail.kind, status: crPrepFail.status || null } : null, ffg: crFailFromGrid, wanted: crWanted ? crWanted.label : null, anchor: crPrepAnchor, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent, grid: crGrid ? { name: crGrid.name, done: crGridDoneCount(), failed: crGridFailedCount(), pending: crGridPendingCount(), stopped: crGrid.stopped, gen: crGrid.gen, session: crGrid.session } : null, prep: crPrep ? { gen: crPrep.gen, session: crPrep.session } : null, covBoxes: crCov ? crCov.boxes.length : -1, ctr: { session: crSession, gen: crCovGen, searchSeq: crSearchSeq, citySeq: crCitySeq, lookupSeq: crCityLookupSeq, geomGen: crGeomGen } })`);
  console.log('TRACE ' + tag + ' ' + JSON.stringify(s));
  return s;
};

// ---------- boot 5W (drive152's sequence) ----------
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

// ---------- A1: the grid's OWN finish over a wholly-failed grid (S5) ----------
await ev(`window.__tFailCells = 'ALL'`);
await jEnter();
const a1Landed = await poll(`crPrepState === 'failed'`, 40000).catch(() => false);
const A1 = await snap('A1-grid-finish-wholly-failed');
ok('A1 (wholly-failed grid, own finish S5) terminal snapshot captured | state=' + A1.state + ' failed=' + (A1.grid && A1.grid.failed) + ' done=' + (A1.grid && A1.grid.done) + ' ffg=' + A1.ffg + ' fail=' + JSON.stringify(A1.fail),
  a1Landed === true && A1.grid && A1.grid.failed === 4 && A1.grid.done === 0 && A1.state === 'failed' && A1.ffg === true && !!A1.fail);

// ---------- A2: fallback box lands SUCCESSFULLY over the wholly-failed grid (S2 - THE G1 arm) ----------
await ev(tapStreet('Faraway Avenue'));
const a2Wanted = await poll(`!!crWanted`, 10000).catch(() => false);
const A2pre = await snap('A2-pre-tap-set-wanted');
await ev(`document.getElementById('crHintBtn').click()`); // the button reads Retry; the handler's wanted branch starts the fallback
const a2Prep = await poll(`crPrepState === 'preparing' && !!crPrep`, 10000).catch(() => false);
const a2Landed = await poll(`crPrep === null && crPrepState !== 'preparing'`, 25000).catch(() => false);
const A2 = await snap('A2-fallback-landing-over-wholly-failed-grid');
ok('A2-pre (failed state, street tap) the tap set the wanted offer while the button still reads "' + A2pre.btn + '" | wanted=' + A2pre.wanted,
  a2Wanted === true && !!A2pre.wanted);
ok('A2 (fallback SUCCESS over wholly-failed grid, S2) landing captured - judge inputs done=' + (A2.grid && A2.grid.done) + ' failed=' + (A2.grid && A2.grid.failed) + ' pending=' + (A2.grid && A2.grid.pending) + ' stopped=' + (A2.grid && A2.grid.stopped) + ' -> OBSERVED to-state "' + A2.state + '" | crPrepFail=' + JSON.stringify(A2.fail) + ' ffg=' + A2.ffg + ' hint="' + A2.hint + '" btn="' + A2.btn + '"',
  a2Prep === true && a2Landed === true && A2.grid && A2.grid.done === 0 && A2.grid.failed === 4 && A2.grid.pending === 0 && A2.grid.stopped === 'superseded');
ok('A2-verdict-input (the static prediction was DEGRADED via the stopped branch, with the :145 failed-handling never firing) observed state === degraded: ' + (A2.state === 'degraded') + ' | crPrepFail stayed null: ' + (A2.fail === null),
  A2.state === 'degraded' && A2.fail === null && A2.ffg === false);
await jExitDiscard();

// ---------- A2b: fallback box FAILS over the wholly-failed grid (S3) ----------
await jEnter(); // __tFailCells still 'ALL': the grid wholly fails again
const a2bGrid = await poll(`crPrepState === 'failed'`, 40000).catch(() => false);
await ev(`window.__tFailBox = true`);
await ev(tapStreet('Faraway Avenue'));
const a2bWanted = await poll(`!!crWanted`, 10000).catch(() => false);
await ev(`document.getElementById('crHintBtn').click()`);
const a2bLanded = await poll(`crPrep === null && crPrepState === 'failed'`, 25000).catch(() => false);
const A2B = await snap('A2b-fallback-FAILURE-over-wholly-failed-grid');
ok('A2b (fallback FAILURE over wholly-failed grid, S3) landing captured | state=' + A2B.state + ' crPrepFail=' + JSON.stringify(A2B.fail) + ' ffg=' + A2B.ffg + ' (S3 does NOT adopt the grid failure) anchor kept: ' + !!A2B.anchor + ' hint="' + A2B.hint + '" btn="' + A2B.btn + '"',
  a2bGrid === true && a2bWanted === true && a2bLanded === true && A2B.state === 'failed' && !!A2B.fail && A2B.fail.kind === 'error' && A2B.ffg === false);
await ev(`window.__tFailBox = false`);
await jExitDiscard();

// ---------- B: partially-failed grid - own finish (S5, control) then fallback landing over it (S2) ----------
await ev(`window.__tFailCells = [[43.820929, -79.56024]]`); // cell r1c1 only (drive152 K2's cell)
await jEnter();
const bDeg = await poll(`crPrepState === 'degraded'`, 40000).catch(() => false);
const B1 = await snap('B1-grid-finish-partially-failed');
ok('B1 (one failed cell, own finish S5 - CONTROL) settles degraded | done=' + (B1.grid && B1.grid.done) + ' failed=' + (B1.grid && B1.grid.failed) + ' hint="' + B1.hint + '" btn="' + B1.btn + '"',
  bDeg === true && B1.grid && B1.grid.done === 3 && B1.grid.failed === 1 && B1.state === 'degraded');
await ev(`crStartPrep({ lat: 43.9, lng: -79.56 })`); // the fallback box outside the city (drive152 K2's idiom)
const bLanded = await poll(`crPrep === null && crPrepState === 'degraded'`, 25000).catch(() => false);
const B2 = await snap('B2-fallback-landing-over-partially-failed-grid');
ok('B2 (fallback SUCCESS over partially-failed grid, S2 - CONTROL) landing captured - judge inputs done=' + (B2.grid && B2.grid.done) + ' failed=' + (B2.grid && B2.grid.failed) + ' pending=' + (B2.grid && B2.grid.pending) + ' stopped=' + (B2.grid && B2.grid.stopped) + ' -> to-state "' + B2.state + '" | hint="' + B2.hint + '" btn="' + B2.btn + '"',
  bLanded === true && B2.grid && B2.grid.done === 3 && B2.grid.failed === 1 && B2.grid.pending === 0 && B2.grid.stopped === 'superseded' && B2.state === 'degraded');
await ev(`window.__tFailCells = null`);
await jExitDiscard();

// ---------- C1: grid CANCELLED mid-load (S4) ----------
await ev(`window.__jDelayMs = 6000`);
await jEnter();
const c1Flying = await poll(`!!(crGrid && crGrid.cells.some(c => c.state === 'fetching'))`, 15000).catch(() => false);
await ev(`document.getElementById('crHintBtn').click()`); // Cancel while preparing (the hint handler's first branch)
const C1 = await snap('C1-cancelled-mid-load');
await sleep(7000); // the aborted answers' window passes; nothing may land
const C1late = await snap('C1-late-after-abort-window');
ok('C1 (cancel mid-load, S4) snapshot at the cancel - judge inputs done=' + (C1.grid && C1.grid.done) + ' failed=' + (C1.grid && C1.grid.failed) + ' pending=' + (C1.grid && C1.grid.pending) + ' stopped=' + (C1.grid && C1.grid.stopped) + ' -> to-state "' + C1.state + '" | hint="' + C1.hint + '" btn="' + C1.btn + '" aborts>0: ' + (await ev(`window.__jAborted`)) + ' and the late snapshot is unchanged (state ' + C1late.state + ', covBoxes ' + C1late.covBoxes + ')',
  c1Flying === true && C1.grid && C1.grid.stopped === 'cancelled' && C1.state === 'degraded' && C1late.state === 'degraded' && C1late.covBoxes === 0);
await ev(`window.__jDelayMs = 0`);
await jExitDiscard();

// ---------- C2: fallback landing over a MID-LOAD grid (S2; drive152 K1's scenario, landing snapshot) ----------
await ev(`window.__jDelayMs = 6000`);
await jEnter();
const c2Flying = await poll(`!!(crGrid && crGrid.cells.some(c => c.state === 'fetching'))`, 15000).catch(() => false);
await ev(`window.__jDelayMs = 0`); // the fallback answers at once; the grid's in-flight requests keep their 6 s
await ev(`crStartPrep({ lat: 43.9, lng: -79.56 })`);
const c2Landed = await poll(`crPrep === null && crPrepState !== 'preparing'`, 20000).catch(() => false);
const C2 = await snap('C2-fallback-landing-over-mid-load-grid');
ok('C2 (fallback SUCCESS over MID-LOAD grid, S2) landing captured - judge inputs done=' + (C2.grid && C2.grid.done) + ' failed=' + (C2.grid && C2.grid.failed) + ' pending=' + (C2.grid && C2.grid.pending) + ' stopped=' + (C2.grid && C2.grid.stopped) + ' -> to-state "' + C2.state + '"',
  c2Flying === true && c2Landed === true && C2.grid && C2.grid.pending > 0 && C2.grid.stopped === 'superseded' && C2.state === 'degraded');
await jExitDiscard();

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
