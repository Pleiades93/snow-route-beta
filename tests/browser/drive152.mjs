import { launchDrive, bootThrough, finish } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs'; // premise derivation (Tranche 4 / T2, 2026-11-08): expectations about the shipped world derive from source - see pack-expect.mjs
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// drive152: the grid x fallback x cache coherence battery (audit round
// pickfetch, VERIFY-2 findings CG-PF-13/14/15; split out of drive150
// section (k) when the added scenarios pushed drive150 past the 300 s
// per-drive CI cap). The network seam and fixture city are drive150's
// (j) world, replicated self-contained as every drive in this battery
// is: the in-page stub answers from ONE dataset filtered by each
// request's own decoded bbox, and records every geometry request. The
// fixture city is the same small 2 x 2 grid over [43.785..43.845] x
// [-79.610..-79.5105]. Scenarios: K1 a fallback started MID-GRID-LOAD
// must stop the grid (downloads aborted, no cell orphaned in
// 'fetching') and Resume must still finish the city (CG-PF-13); K2 a
// fallback landing over a grid that settled with a FAILED cell must not
// promote the city to READY (CG-PF-14); K3 a cache record written under
// two different bounding boxes must not carry the old box's cells into
// the new grid, in the record or at restore (CG-PF-15). All three were
// demonstrated RED against the 1.121 branch tree (df9072ff) before the
// fixes: drive150's red run is preserved in the round's build evidence.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

// ---------- fixtures ----------
const FIXDATA = JSON.parse(fs.readFileSync(new URL('./fixtures/create-osm.json', import.meta.url), 'utf8'));
const elsByName = FIXDATA.overpass;
const MLAT = 111320, MLNG = 80386;
const dM = (a, b) => Math.hypot((a[1] - b[1]) * MLNG, (a[0] - b[0]) * MLAT);
const wayLen = g => { let s = 0; for (let i = 1; i < g.length; i++) s += dM([g[i - 1].lat, g[i - 1].lon], [g[i].lat, g[i].lon]); return s; };
const fixtureLen = name => (elsByName[name] || []).reduce((a, e) => a + wayLen(e.geometry), 0);
const CITY_FIXTURE = [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8367', lon: '-79.4982', boundingbox: ['43.7256', '43.9538', '-79.6120', '-79.3858'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada' } },
  { display_name: 'Vaughan Road, Toronto, Ontario, Canada', lat: '43.6830', lon: '-79.4260', class: 'highway', type: 'residential', address: { road: 'Vaughan Road', city: 'Toronto' } }]; // the second row is a STREET named like the city: the city step's populated-place filter must drop it
const FIXTURE = {
  nominatim: [{ display_name: 'Bordeaux Drive, Vaughan, Ontario, Canada', lat: '43.798972', lon: '-79.574666', address: { city: 'Vaughan' } }],
  nominatimCity: CITY_FIXTURE,
  overpass: { 'Bordeaux Drive': elsByName['Bordeaux Drive'], 'Alderson Avenue': elsByName['Alderson Avenue'] }
};
fs.writeFileSync('/tmp/d150-photo.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
fs.writeFileSync('/tmp/d150-bad.json', '{this is not a draft');
const candidate = FIXDATA.candidate;
fs.writeFileSync('/tmp/d150-candidate.json', JSON.stringify(candidate));
const envelope = { name: 'Envelope Route', area: 'Vaughan', mains: ['Bordeaux'], roads: { Bordeaux: [elsByName['Bordeaux Drive'][0].geometry.map(g => [g.lat, g.lon])], Alderson: [elsByName['Alderson Avenue'][0].geometry.map(g => [g.lat, g.lon])] } };
fs.writeFileSync('/tmp/d150-envelope.json', JSON.stringify(envelope));
const candLen = Object.values(candidate).reduce((a, segs) => a + segs.reduce((b, s) => b + wayLen(s.map(p => ({ lat: p[0], lon: p[1] }))), 0), 0);

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
      (window.__geoLog = window.__geoLog || []).push({ host: u.indexOf('kumi') >= 0 ? 'kumi' : 'de', body: raw }); // Beta 1.121: every geometry request is recorded DECODED - section (j) grades the app's real query grammar from these bodies (CG-PF-06)
      if (raw.indexOf('["highway"]') >= 0) { const els = []; for (const k of Object.keys(FIX.overpass)) els.push(...FIX.overpass[k]); return Promise.resolve(new Response(JSON.stringify({ elements: els }), { status: 200, headers: { 'Content-Type': 'application/json' } })); } // the batch extract: every named way in the box (the fixture IS the box's content)
      const m = /"name"="([^"]+)"/.exec(raw);
      const els = (m && FIX.overpass[m[1]]) || [];
      return Promise.resolve(new Response(JSON.stringify({ elements: els }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return orig(url, opts);
  };
  return true;
})()`;
const dump5wSrc = `(() => { const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('snowroute.5w.') === 0) ks.push(k); } ks.sort(); const o = {}; for (const k of ks) o[k] = localStorage.getItem(k); return JSON.stringify(o); })()`;
const setFile = async (selector, path) => {
  await send('DOM.enable', {}, S);
  const doc = await send('DOM.getDocument', {}, S);
  const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector }, S);
  await send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [path] }, S);
  await sleep(400);
  const vis = await J(`!!document.querySelector('${selector}')`);
  return vis;
};
const TAP_POINTS = { 'Bordeaux Drive': { lat: 43.798972, lng: -79.574666 }, 'Alderson Avenue': { lat: 43.8000667, lng: -79.573051 }, 'Edgewater Avenue': { lat: 43.8100, lng: -79.5750 }, 'Faraway Avenue': { lat: 43.8150, lng: -79.5600 }, 'Farfaraway Avenue': { lat: 43.8200, lng: -79.5600 } };
// Beta 1.126 TEST-PREMISE UPDATE: 1.125 restyled the manual-search city
// results from .rmBtn boxes to .routeRow rows (.routeName + .routeArea);
// this helper's selectors and its first-row text read follow the shipped
// shape. The assertions' meanings are unchanged.
// Beta 1.121: Door 2 now opens the CITY pane - this helper walks it
// (type the city, wait for the populated-place results, pick Vaughan,
// land in the pick stage) and reports what it saw for the checks.
const pickCityVaughan = async () => {
  const pane = await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
  await ev(`(() => { const i = document.getElementById('crCityInput'); i.value = 'Vaughan'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rows = await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 1`, 10000).catch(() => false);
  const first = rows === true ? await ev(`(() => { const b = document.querySelector('#crCityResults .routeRow'); if (!b) return ''; const n = b.querySelector('.routeName'); const a = b.querySelector('.routeArea'); return (n ? n.textContent : '') + ', ' + (a ? a.textContent : ''); })()`) : '';
  if (rows === true) await ev(`document.querySelector('#crCityResults .routeRow').click()`);
  const inPick = rows === true ? await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 10000).catch(() => false) : false;
  return { pane: pane === true, rows: rows === true, first, inPick: inPick === true };
};
// start the area preparation at the Bordeaux anchor and wait for ready
// (the same call a street-search pick makes - anchor rule (a))
const prepAtBordeaux = async () => { await ev(`crStartPrep({ lat: 43.798972, lng: -79.574666 })`); return await poll(`crPrepState === 'ready'`, 20000).catch(() => false); };
const installFeatureStub = `(() => {
  if (!map.__qrfOrig) map.__qrfOrig = map.queryRenderedFeatures.bind(map);
  window.__fixtureRoads = [];
  map.queryRenderedFeatures = () => window.__fixtureRoads.map(n => ({ type: 'Feature', sourceLayer: 'roads', properties: { name: n }, geometry: { type: 'LineString', coordinates: [] } }));
  return true;
})()`;
const tapStreet = name => `(() => { window.__fixtureRoads = [${JSON.stringify(name)}]; const tp = ${JSON.stringify(TAP_POINTS)}[${JSON.stringify(name)}]; map.fire('click', { lngLat: tp, point: { x: 210, y: 320 }, originalEvent: {} }); return true; })()`;
const tapNothing = `(() => { window.__fixtureRoads = []; map.fire('click', { lngLat: { lat: 43.798972, lng: -79.574666 }, point: { x: 210, y: 320 }, originalEvent: {} }); return true; })()`;

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

const JDATA = (() => {
  const byId = {};
  for (const k of Object.keys(FIXTURE.overpass)) for (const e of FIXTURE.overpass[k]) byId[e.id] = { name: k, geometry: e.geometry };
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
const edgewaterLen = [9001, 9002, 9004].reduce((a, id) => a + wayLen(JDATA.byId[id].geometry), 0);
const farawayLen = wayLen(JDATA.byId[9010].geometry);
const farfarawayLen = wayLen(JDATA.byId[9011].geometry);
const crosscellLen = [9020, 9021].reduce((a, id) => a + wayLen(JDATA.byId[id].geometry), 0);
const JCITY = [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8150', lon: '-79.5600', boundingbox: ['43.785', '43.845', '-79.610', '-79.5105'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada', country_code: 'ca' } }];
const installStubJ = `(() => {
  const DATA = ${JSON.stringify(JDATA)};
  const CITY = ${JSON.stringify(JCITY)};
  const TORONTO = [{ display_name: 'Toronto, Ontario, Canada', lat: '43.6532', lon: '-79.3832', boundingbox: ['43.5810', '43.8555', '-79.6393', '-79.1150'], class: 'place', type: 'city', address: { city: 'Toronto', state: 'Ontario', country: 'Canada' } }];
  const prev = window.fetch.bind(window);
  window.__jMode = 'healthy'; window.__jDelayMs = 0; window.__jStatus = 503; window.__geoLog = []; window.__jAborted = 0; window.__jCityHold = false;
  const boxOf = raw => { const m = /\\(([-\\d.]+),([-\\d.]+),([-\\d.]+),([-\\d.]+)\\)/.exec(raw); return m ? { s: +m[1], w: +m[2], n: +m[3], e: +m[4] } : null; };
  const elsFor = raw => {
    const box = boxOf(raw); if (!box) return [];
    const nm = /"name"="([^"]+)"/.exec(raw); // the CORRECT grammar's name filter (quote-name-quote-equals-quote); the 1.120-era /name="/ pattern only ever matched the malformed form - a fossil of CG-PF-01 inside the old stubs
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
  const hang = opts => new Promise((res, rej) => { const s = opts && opts.signal; if (s) s.addEventListener('abort', () => { window.__jAborted++; const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('nominatim.openstreetmap.org') >= 0 && u.indexOf('featuretype=city') >= 0) {
      const qm = /[?&]q=([^&]+)/.exec(u); const q = qm ? decodeURIComponent(qm[1]).toLowerCase() : '';
      if (window.__jMode === 'cityfail') return Promise.reject(new TypeError('fixture city lookup offline'));
      const payload = q.indexOf('toronto') >= 0 ? TORONTO : CITY;
      const mk = () => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (window.__jCityHold && q.indexOf('vaughan') >= 0) return delayed(mk, 4000, opts); // CG-PF-11's race: the remembered-city lookup is HELD while a competing pick lands
      return Promise.resolve(mk());
    }
    if (u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) {
      const raw = decodeURIComponent((opts && opts.body) || '').replace(/^data=/, ''); // the QL itself, form-field prefix stripped - __geoLog grades the query, not the envelope
      window.__geoLog.push({ host: u.indexOf('kumi') >= 0 ? 'kumi' : 'de', body: raw });
      const mode = window.__jMode;
      const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
      if (mode === 'throw') return Promise.reject(new TypeError('fixture offline'));
      if (mode === 'silent') return hang(opts);
      if (mode === 'status') return Promise.resolve(new Response('fixture status', { status: window.__jStatus || 503 }));
      if (mode === 'remark') return Promise.resolve(json({ remark: 'fixture remark: simulated runtime error', elements: elsFor(raw) }));
      if (mode === 'badjson') return Promise.resolve(new Response('this is not json{', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      if (mode === 'dense') return Promise.resolve(new Response(JSON.stringify({ elements: [], pad: 'x'.repeat(2300000) }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      if (mode === 'stallbody') {
        const s = opts && opts.signal;
        const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"elements":[')); if (s) s.addEventListener('abort', () => { try { c.error(new Error('aborted')); } catch (e) {} }); } });
        return Promise.resolve(new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (mode === 'supersede') { const box = boxOf(raw); const inSmall = box && (Math.abs(box.s - 43.785) < 0.001 || Math.abs(box.s - 43.82093) < 0.001) && (Math.abs(box.w - (-79.61)) < 0.001 || Math.abs(box.w - (-79.56024)) < 0.001); return inSmall ? delayed(() => json({ elements: elsFor(raw) }), 3000, opts) : Promise.resolve(json({ elements: [] })); } // only the fixture city's OWN cell boxes (their exact grid edges) are slow - a bigger city's cells never share both edges
      const d = window.__jDelayMs || 0;
      const make = () => json({ elements: elsFor(raw) });
      return d > 0 ? delayed(make, d, opts) : Promise.resolve(make());
    }
    return prev(url, opts);
  };
  return true;
})()`;
const jWipe = async () => { await ev(`(async () => { await new Promise(res => { try { const rq = indexedDB.deleteDatabase('snowroute-citycache'); rq.onsuccess = () => res(); rq.onerror = () => res(); rq.onblocked = () => res(); } catch (e) { res(); } }); return true; })()`); };
const jEnter = async () => { await jWipe(); await ev(`openRouteMenu()`); await ev(`document.getElementById('rmCreate').click()`); await ev(`document.getElementById('crDoorManual').click()`); await pickCityVaughan(); };
const jExitDiscard = async () => { await ev(`document.getElementById('crExit').click()`); await sleep(400); await ev(`(() => { const y = document.getElementById('crModalYes'); if (y && !document.getElementById('crModal').classList.contains('hidden')) y.click(); return true; })()`); await sleep(400); };
const geoCount = async () => await ev(`(window.__geoLog || []).length`);
const geoSince = async n => await ev(`window.__geoLog.slice(` + n + `)`);
const batchBodies = log => (Array.isArray(log) ? log : []).map(x => x.body).filter(b => b.indexOf('["highway"]') >= 0);
const nameBodies = (log, name) => (Array.isArray(log) ? log : []).map(x => x.body).filter(b => b.indexOf('"name"="' + name + '"') >= 0);

await ev(installStubJ);
await ev(installFeatureStub);

// ---------- (k) grid x fallback x cache coherence (VERIFY-2: CG-PF-13/14/15) ----------
// The three sequences VERIFY-2 reproduced against the 1.121 branch and
// the first battery never combined: a fallback started DURING a grid
// load, a fallback landing AFTER a grid settled with a failed cell, and
// a cache record written under two different bounding boxes.
// K1 (CG-PF-13): the fallback's start must STOP the grid - its live
// downloads aborted, its in-flight cells returned to 'pending' - so a
// later Resume can still finish the city. On the defective tree the
// fallback's generation bump orphans the in-flight cells: their answers
// settle while the grid is orphaned, their handlers discard them, and
// the cells sit in 'fetching' with no live request behind them -
// Resume only resets 'failed' cells, so the city can never finish.
await jWipe();
await ev(`window.__jDelayMs = 6000`);
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan();
const k1Flying = await poll(`!!(typeof crGrid !== 'undefined' && crGrid && crGrid.cells.some(c => c.state === 'fetching'))`, 15000).catch(() => false);
const abK1a = await ev(`window.__jAborted`);
await ev(`window.__jDelayMs = 0`); // the fallback answers at once; the grid's in-flight requests keep their 6 s
await ev(`crStartPrep({ lat: 43.9, lng: -79.56 })`); // an anchor outside the city: the fallback box, started MID-GRID-LOAD
await sleep(600);
const K1mid = await J(`({ aborted: window.__jAborted, fetching: crGrid ? crGrid.cells.filter(c => c.state === 'fetching').length : -1, stopped: crGrid && crGrid.stopped })`);
ok('K1a (fallback mid-grid, CG-PF-13) starting the fallback STOPS the grid: its downloads are aborted (aborts ' + abK1a + ' -> ' + K1mid.aborted + ') and NO cell is left in the fetching state (orphaned cells: ' + K1mid.fetching + ', grid stop: ' + K1mid.stopped + ') | grid was flying: ' + k1Flying,
  k1Flying === true && K1mid.aborted > abK1a && K1mid.fetching === 0);
await sleep(6500); // on the defective tree the orphaned answers settle inside this window and are discarded; on the fixed tree the grid is already stopped and nothing moves
const k1Deg = await poll(`crPrepState === 'degraded'`, 15000).catch(() => false);
await ev(`document.getElementById('crHintBtn').click()`); // Retry missing parts -> crGridResume
const k1Ready = await poll(`crPrepState === 'ready'`, 25000).catch(() => false);
const K1b = await J(`({ state: crPrepState, done: crGrid ? crGrid.cells.filter(c => c.state === 'done').length : -1, total: crGrid ? crGrid.cells.length : -1, fetching: crGrid ? crGrid.cells.filter(c => c.state === 'fetching').length : -1 })`);
ok('K1b (fallback mid-grid, CG-PF-13) after the interruption the city still RESUMES to fully ready - every cell fetched, none wedged (degraded first: ' + k1Deg + ') | ' + JSON.stringify(K1b),
  k1Deg === true && k1Ready === true && K1b.done === K1b.total && K1b.fetching === 0);
await jExitDiscard();
// K2 (CG-PF-14): one cell of the city refuses (503) on every attempt, so
// the grid settles DEGRADED with the missing part disclosed; a fallback
// box landing afterwards must NOT promote the city to plain READY - the
// failed cell still counts.
const installStubK = `(() => {
  const prev = window.fetch.bind(window);
  window.__kFailCell = null; // { s, w } of the ONE grid cell the service refuses, or null
  const boxOf = raw => { const m = /\\(([-\\d.]+),([-\\d.]+),([-\\d.]+),([-\\d.]+)\\)/.exec(raw); return m ? { s: +m[1], w: +m[2] } : null; };
  window.fetch = (url, opts) => {
    const u = String(url);
    if ((u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) && window.__kFailCell) {
      const b = boxOf(decodeURIComponent((opts && opts.body) || ''));
      if (b && Math.abs(b.s - window.__kFailCell.s) < 0.0005 && Math.abs(b.w - window.__kFailCell.w) < 0.0005) return new Promise(res => setTimeout(() => res(new Response('refused by fixture (one cell)', { status: 503 })), 300));
    }
    return prev(url, opts);
  };
  return true;
})()`;
await ev(installStubK);
await ev(`window.__kFailCell = { s: 43.820932, w: -79.56024 }`); // cell r1c1 of the fixture city
await jEnter();
const k2Deg = await poll(`crPrepState === 'degraded'`, 30000).catch(() => false);
const K2a = await J(`({ failed: crGrid ? crGrid.cells.filter(c => c.state === 'failed').length : -1, done: crGrid ? crGrid.cells.filter(c => c.state === 'done').length : -1, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent })`);
ok('K2a (one failed cell) the grid settles DEGRADED with the missing part disclosed ("loaded except 1 part", Retry missing parts offered) | ' + JSON.stringify(K2a),
  k2Deg === true && K2a.failed === 1 && K2a.done === 3 && K2a.hint.indexOf('loaded except 1 part') >= 0 && K2a.btn === 'Retry missing parts');
await ev(`crStartPrep({ lat: 43.9, lng: -79.56 })`); // the fallback box, outside the city - it lands successfully
const k2Box = await poll(`!!(crCov && crCov.boxes.some(b => 43.9 >= b.s && 43.9 <= b.n && -79.56 >= b.w && -79.56 <= b.e))`, 20000).catch(() => false);
await sleep(300);
const K2b = await J(`({ state: crPrepState, failed: crGrid ? crGrid.cells.filter(c => c.state === 'failed').length : -1, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent })`);
ok('K2b (fallback over a failed cell, CG-PF-14) the fallback box landed (' + k2Box + ') but the city is NOT promoted to ready: the settled state still counts the failed cell - DEGRADED, the missing part still disclosed, Retry missing parts still offered | ' + JSON.stringify(K2b),
  k2Box === true && K2b.state === 'degraded' && K2b.failed === 1 && K2b.hint.indexOf('loaded except 1 part') >= 0 && K2b.btn === 'Retry missing parts');
await ev(`window.__kFailCell = null`);
await jExitDiscard();
// K3 (CG-PF-15): the same city NAME saved under two different bounding
// boxes (the lookup's answer changed between visits). A save under the
// new box must start the record over - the old box's cells must neither
// survive in the record nor be restored as coverage for the new grid
// (the restore-time guard compares the record's bbox, so overwriting
// the bbox while keeping the cells defeats it).
await jWipe();
await ev(`crCacheNote = ''`); // an earlier scenario's disclosed refusal must not mute these saves - the app's own write path is graded directly here
const KBOX_A = { s: 43.785, n: 43.845, w: -79.61, e: -79.5105 }; // the fixture city's box, as first saved
const KBOX_B = { s: 43.7, n: 43.76, w: -79.61, e: -79.5105 }; // the same city's name under a DIFFERENT box
await ev(`(async () => { const A = ${JSON.stringify(KBOX_A)}; await crCacheSaveCell('Vaughan', A, 4, 'r0c0', [[101, 'Alpha Street', [[43.79, -79.6], [43.8, -79.6]]]]); await crCacheSaveCell('Vaughan', A, 4, 'r0c1', [[102, 'Beta Street', [[43.79, -79.55], [43.8, -79.55]]]]); return true; })()`);
await ev(`(async () => { const B = ${JSON.stringify(KBOX_B)}; await crCacheSaveCell('Vaughan', B, 4, 'r1c0', [[103, 'Gamma Street', [[43.71, -79.6], [43.72, -79.6]]]]); return true; })()`);
const K3rec = JSON.parse(await ev(`(async () => { const r = await crIdbGet('Vaughan'); return JSON.stringify(r ? { bbox: r.bbox, keys: Object.keys(r.cells || {}).sort() } : null); })()`));
ok('K3a (cache bbox change, CG-PF-15) after a save under a DIFFERENT bounding box, the stored record carries the new box and ONLY the new box\'s cell - the old box\'s cells are discarded, not merged under the new bbox | ' + JSON.stringify(K3rec),
  !!K3rec && JSON.stringify(K3rec.bbox) === JSON.stringify(KBOX_B) && K3rec.keys.join() === 'r1c0');
await ev(`window.__jDelayMs = 4000`); // the new grid's own fetches stay in flight while the restore is graded
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await ev(`crPickCity({ display_name: 'Vaughan, Ontario, Canada', lat: '43.73', lon: '-79.56', boundingbox: ['43.700', '43.760', '-79.610', '-79.5105'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada' } })`);
await sleep(1200); // the cache read + restore land well inside this window
const K3b = await J(`({ names: crCov ? Object.keys(crCov.byName) : [], doneCells: crGrid ? crGrid.cells.filter(c => c.state === 'done').map(c => c.key) : [] })`);
ok('K3b (cache bbox change, CG-PF-15) restoring the city under its NEW box never certifies the old box\'s streets: neither Alpha nor Beta is in the extract, and neither old cell is marked done from cache | ' + JSON.stringify(K3b),
  !K3b.names.includes('Alpha Street') && !K3b.names.includes('Beta Street') && !K3b.doneCells.includes('r0c0') && !K3b.doneCells.includes('r0c1'));
await ev(`window.__jDelayMs = 0`);
await jExitDiscard();

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
