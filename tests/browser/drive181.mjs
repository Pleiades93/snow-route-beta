import { launchDrive, finish } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// drive181: Beta 1.154 (B3 build) - the create flow's formalized state,
// proven against the 2026-11-09 lifecycle trace (beta1/work/
// b3-lifecycle-trace/TRACE-RECORD.md: all 13 candidate prep-state edges
// OBSERVED through the real UI, 0 inferred). The build (a) routed every
// crPrepState write through crSetPrepState + the CR_PREP_EDGES table in
// create-fetch.js - exactly the trace's 13 edges; a transition outside
// the table is refused (the state does not move) and recorded in
// crPrepViolations (a write of the state already held is a re-assertion,
// passed unrecorded - the settle sites are re-entrant, and this drive's
// first CI run caught exactly those re-assertions in healthy flows);
// (b) folded the sector session's four loose bindings
// into crSectorSession { street, snapshot, collapsed, face }, with
// crSectorReset still closing the (street, snapshot) pair ONLY; (c)
// named each counter family's current-check under the cr<Family>Current
// convention (G3 option (i)); (d) fixed the trace's three warts: the
// dead S2 copy of crGridFinish's failed-handling is deleted,
// crFailFromGrid clears at crCityPrepare (S6) and exitCreate (S10), and
// crRenderHint's failed branch applies the crWanted label override.
// THIS DRIVE asserts the full observed table through REAL flows on the
// new code (the trace drives' arms, adapted to the battery's harness),
// the three warts, the sector record's stage-change semantics, the new
// predicates' input shapes, and the TEETH: out-of-table writes through
// the setter are refused, leave the state unmoved and are recorded -
// while no real flow in this drive ever records a violation (the final
// check pins crPrepViolations to EXACTLY the teeth sections' entries).
// World = drive152's (j) / driveT1's fixture world, self-contained: a
// 2 x 2 Vaughan grid over [43.785..43.845] x [-79.610..-79.5105], with
// per-cell failure rules (window.__tFailCells), an answer delay
// (window.__jDelayMs) and abort counting at the fetch seam.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

// ---------- fixtures (driveT1's, verbatim where shared; Bordeaux/Alderson from the shared fixture file) ----------
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
const TAP_POINTS = { 'Faraway Avenue': { lat: 43.8150, lng: -79.5600 }, 'Bordeaux Drive': { lat: 43.798972, lng: -79.574666 } };
const tapStreet = name => `(() => { window.__fixtureRoads = [${JSON.stringify(name)}]; const tp = ${JSON.stringify(TAP_POINTS)}[${JSON.stringify(name)}]; map.fire('click', { lngLat: tp, point: { x: 210, y: 320 }, originalEvent: {} }); return true; })()`;

// ---------- the trace stub (driveT1's: two fixture cities' data + cell/box failure rules + delay) ----------
const JDATA = (() => {
  const byId = {};
  for (const k of Object.keys(elsByName)) for (const e of elsByName[k]) byId[e.id] = { name: k, geometry: e.geometry };
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
  const s = await J(`({ state: crPrepState, fail: crPrepFail ? { kind: crPrepFail.kind, status: crPrepFail.status || null } : null, ffg: crFailFromGrid, wanted: crWanted ? crWanted.label : null, btn: document.getElementById('crHintBtn').textContent, btnShown: document.getElementById('crHintBtn').style.display !== 'none', viol: crPrepViolations.slice(), grid: crGrid ? { done: crGridDoneCount(), failed: crGridFailedCount(), pending: crGridPendingCount(), stopped: crGrid.stopped } : null, sec: { street: crSectorSession.street, snap: crSectorSession.snapshot === undefined ? 'undef' : (crSectorSession.snapshot === null ? null : 'array'), collapsed: crSectorSession.collapsed, face: crSectorSession.face } })`);
  console.log('SNAP ' + tag + ' ' + JSON.stringify(s));
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
await ev(installFeatureStub);

// ---------- A0: the record + the G3 predicates exist with their true input shapes ----------
const A0 = await J(`({ setter: typeof crSetPrepState === 'function', edges: typeof CR_PREP_EDGES === 'object' && CR_PREP_EDGES !== null, viol: Array.isArray(crPrepViolations) ? crPrepViolations.length : -1, searchNow: crSearchCurrent(crSearchSeq), searchStale: crSearchCurrent(crSearchSeq + 999), cityNow: crCitySearchCurrent(crCitySeq, crSession), cityWrongSession: crCitySearchCurrent(crCitySeq, crSession + 999), citySeqOnly: crCitySearchSeqCurrent(crCitySeq), citySeqStale: crCitySearchSeqCurrent(crCitySeq + 999), lookupStale: crCityLookupCurrent(crCityLookupSeq + 999, crSession), prepNow: typeof crPrepCurrent === 'function', gridNow: typeof crGridCurrent === 'function', sector: typeof crSectorSession === 'object' && crSectorSession !== null && 'street' in crSectorSession && 'snapshot' in crSectorSession && 'collapsed' in crSectorSession && 'face' in crSectorSession })`);
ok('A0 (the record + G3 predicates) crSetPrepState/CR_PREP_EDGES/crPrepViolations exist; crSearchCurrent answers seq-only (current true, stale false); crCitySearchCurrent needs seq AND session; crCitySearchSeqCurrent is seq-only; crCityLookupCurrent refuses a stale seq; crSectorSession carries street/snapshot/collapsed/face | ' + JSON.stringify(A0),
  A0.setter === true && A0.edges === true && A0.viol === 0 && A0.searchNow === true && A0.searchStale === false && A0.cityNow === true && A0.cityWrongSession === false && A0.citySeqOnly === true && A0.citySeqStale === false && A0.lookupStale === false && A0.prepNow === true && A0.gridNow === true && A0.sector === true);

// ---------- S1: healthy pick - edges none->preparing (S6), preparing->ready (S5), ready->none (S10) ----------
const E1 = await jEnter();
const readyA = await poll(`crPrepState === 'ready'`, 40000).catch(() => false);
const SA = await snap('S1-healthy-ready');
ok('S1 (healthy city pick) none->preparing->ready through S6+S5, every cell done, and the setter recorded NO refusal on the way | entered=' + JSON.stringify(E1) + ' state=' + SA.state + ' viol=' + JSON.stringify(SA.viol),
  E1.inPick === true && readyA === true && SA.grid && SA.grid.done === 4 && SA.grid.failed === 0 && SA.viol.length === 0);

// ---------- TEETH 1: out-of-table writes from a settled READY are refused, unmoving, recorded ----------
const TH1 = await J(`({ r1: crSetPrepState('degraded'), s1: crPrepState, r2: crSetPrepState('failed'), s2: crPrepState, viol: crPrepViolations.slice() })`);
ok('TEETH1 (refusal from ready) crSetPrepState(\'degraded\') and (\'failed\') from READY both return false, the state does not move, and both refusals are recorded in order | ' + JSON.stringify(TH1),
  TH1.r1 === false && TH1.s1 === 'ready' && TH1.r2 === false && TH1.s2 === 'ready' && JSON.stringify(TH1.viol) === JSON.stringify(['ready->degraded', 'ready->failed']));
await jExitDiscard();
const afterExitA = await J(`({ state: crPrepState, creating })`);
ok('S1-exit (edge ready->none, S10) after the teeth the ordinary exit still lands none - the exit write is in-table from ready | ' + JSON.stringify(afterExitA),
  afterExitA.state === 'none' && afterExitA.creating === false);

// ---------- TEETH 2: out-of-table writes from NONE refused; the legal pair still passes ----------
const TH2 = await J(`({ r1: crSetPrepState('ready'), s1: crPrepState, r2: crSetPrepState('failed'), s2: crPrepState, r3: crSetPrepState('preparing'), s3: crPrepState, r4: crSetPrepState('none'), s4: crPrepState, viol: crPrepViolations.slice() })`);
ok('TEETH2 (refusal from none + the legal pair) from NONE: ->ready and ->failed refused and recorded, the state unmoved; ->preparing (edge 1) and ->none (edge 7) both pass through the same setter | ' + JSON.stringify(TH2),
  TH2.r1 === false && TH2.s1 === 'none' && TH2.r2 === false && TH2.s2 === 'none' && TH2.r3 === true && TH2.s3 === 'preparing' && TH2.r4 === true && TH2.s4 === 'none' && JSON.stringify(TH2.viol) === JSON.stringify(['ready->degraded', 'ready->failed', 'none->ready', 'none->failed']));
const TEETH_SO_FAR = 4;

// ---------- S2: wholly-failed grid (edge preparing->failed via S5's LIVE copy), then wart (b) at S6 ----------
await ev(`window.__tFailCells = 'ALL'`);
const E2 = await jEnter();
const failedB = await poll(`crPrepState === 'failed'`, 40000).catch(() => false);
const SB1 = await snap('S2-wholly-failed');
ok('S2a (wholly-failed grid, S5) settles FAILED with the grid failure adopted (crFailFromGrid true - crGridFinish\'s LIVE failed-handling, the dead S2 copy\'s twin) and the no-offer button reading Retry | state=' + SB1.state + ' ffg=' + SB1.ffg + ' btn="' + SB1.btn + '" viol=' + SB1.viol.length,
  E2.inPick === true && failedB === true && SB1.grid && SB1.grid.failed === 4 && SB1.grid.done === 0 && SB1.ffg === true && !!SB1.fail && SB1.btn === 'Retry' && SB1.viol.length === TEETH_SO_FAR);
await ev(`window.__tFailCells = null`);
await ev(`window.__jDelayMs = 2500`); // hold the re-pick's preparing window open so the latch sample lands mid-flight
await ev(`document.getElementById('crCityChange').click()`);
const repick = await pickCityVaughan();
const prepWindow = await poll(`crPrepState === 'preparing'`, 15000).catch(() => false);
const SB2 = await snap('S2-repick-preparing');
ok('S2b (wart b at S6) re-picking a city from FAILED: crCityPrepare clears crFailFromGrid AT ENTRY - during the new preparation the flag is already false (through 1.153 it stayed true through the whole next load) | preparing=' + prepWindow + ' ffg=' + SB2.ffg,
  repick.inPick === true && prepWindow === true && SB2.state === 'preparing' && SB2.ffg === false);
const readyB = await poll(`crPrepState === 'ready'`, 40000).catch(() => false);
const SB3 = await snap('S2-repick-ready');
await ev(`window.__jDelayMs = 0`);
ok('S2c (edge failed->preparing->ready via S6+S5) the re-picked city readies with the flag still clear and no refusal recorded | state=' + SB3.state + ' viol=' + SB3.viol.length,
  readyB === true && SB3.ffg === false && SB3.viol.length === TEETH_SO_FAR);
await jExitDiscard();

// ---------- S3: failed again, then EXIT from failed (edge failed->none, S10) ----------
await ev(`window.__tFailCells = 'ALL'`);
await jEnter();
const failedC = await poll(`crPrepState === 'failed'`, 40000).catch(() => false);
const SC0 = await snap('S3-failed-before-exit');
await jExitDiscard();
const SC1 = await J(`({ state: crPrepState, ffg: crFailFromGrid, creating })`);
ok('S3 (wart b at S10 + edge failed->none) exiting a FAILED session lands none AND clears crFailFromGrid with the session - the flag is false before any new session starts (through 1.153 it survived the exit) | pre-exit ffg=' + SC0.ffg + ' post=' + JSON.stringify(SC1),
  failedC === true && SC0.ffg === true && SC1.state === 'none' && SC1.ffg === false && SC1.creating === false);

// ---------- S4: failed once more; the out-of-coverage tap - wart (c) label + the S1/S2 fallback landing ----------
await jEnter(); // __tFailCells still 'ALL': the grid wholly fails again
const failedD = await poll(`crPrepState === 'failed'`, 40000).catch(() => false);
await ev(`window.__tFailCells = null`); // the fallback box itself will answer
await ev(tapStreet('Faraway Avenue'));
const wantedSet = await poll(`!!crWanted`, 10000).catch(() => false);
const SD1 = await snap('S4-failed-with-wanted');
ok('S4a (wart c) in the FAILED state with an out-of-coverage tap outstanding, the hint button reads the offer\'s own label - "' + SD1.btn + '" - NOT \'Retry\': the click starts the fallback preparation at the wanted anchor, and the label now says so (through 1.153 it read Retry) | wanted=' + SD1.wanted + ' btnShown=' + SD1.btnShown,
  failedD === true && wantedSet === true && SD1.wanted === 'Prepare this area' && SD1.btn === 'Prepare this area' && SD1.btnShown === true);
await ev(`document.getElementById('crHintBtn').click()`); // the handler's wanted branch starts the fallback (edge failed->preparing via S1)
const landedD = await poll(`crPrep === null && crPrepState === 'degraded'`, 25000).catch(() => false);
const SD2 = await snap('S4-fallback-landing');
ok('S4b (edges failed->preparing via S1, preparing->degraded via S2) the fallback box lands SUCCESSFULLY over the wholly-failed grid and the state is DEGRADED - the settled judge\'s stopped branch, exactly as the trace observed (never failed, crPrepFail null, flag false: the deleted S2 copy stays dead because it never fired) | state=' + SD2.state + ' fail=' + JSON.stringify(SD2.fail) + ' ffg=' + SD2.ffg + ' viol=' + SD2.viol.length,
  landedD === true && SD2.grid && SD2.grid.done === 0 && SD2.grid.failed === 4 && SD2.grid.stopped === 'superseded' && SD2.fail === null && SD2.ffg === false && SD2.viol.length === TEETH_SO_FAR);
await jExitDiscard();

// ---------- S5: one failed cell - degraded via S5, resume via S8 (edges preparing->degraded, degraded->preparing) ----------
await ev(`window.__tFailCells = [[43.820929, -79.56024]]`);
await jEnter();
const degE = await poll(`crPrepState === 'degraded'`, 40000).catch(() => false);
const SE1 = await snap('S5-degraded');
ok('S5a (one failed cell, S5) settles DEGRADED - 3 done / 1 failed - with the resume offer on the button | state=' + SE1.state + ' btn="' + SE1.btn + '"',
  degE === true && SE1.grid && SE1.grid.done === 3 && SE1.grid.failed === 1 && SE1.btn === 'Retry missing parts');
await ev(`window.__tFailCells = null`);
await ev(`document.getElementById('crHintBtn').click()`); // degraded remedy: crGridResume (S8)
const readyE = await poll(`crPrepState === 'ready'`, 30000).catch(() => false);
const SE2 = await snap('S5-resumed-ready');
ok('S5b (edge degraded->preparing via S8, then ->ready) Resume fetches only the missing cell and the city readies whole, no refusal recorded | state=' + SE2.state + ' done=' + (SE2.grid && SE2.grid.done) + ' viol=' + SE2.viol.length,
  readyE === true && SE2.grid && SE2.grid.done === 4 && SE2.viol.length === TEETH_SO_FAR);
await jExitDiscard();

// ---------- S6: exit MID-LOAD (edge preparing->none, S10) ----------
await ev(`window.__jDelayMs = 6000`);
await jEnter();
const flyingF = await poll(`!!(crGrid && crGrid.cells.some(c => c.state === 'fetching'))`, 15000).catch(() => false);
await ev(`document.getElementById('crExit').click()`); // empty draft: exits without the discard confirm
const exitedF = await poll(`typeof creating !== 'undefined' && creating === false`, 10000).catch(() => false);
const SF = await J(`({ state: crPrepState, ffg: crFailFromGrid, viol: crPrepViolations.length })`);
await ev(`window.__jDelayMs = 0`);
ok('S6 (exit mid-load, S10) exiting during PREPARING lands none, session closed, no refusal recorded | flying=' + flyingF + ' exited=' + exitedF + ' post=' + JSON.stringify(SF),
  flyingF === true && exitedF === true && SF.state === 'none' && SF.viol === TEETH_SO_FAR);

// ---------- S7: the sector session record ----------
await jEnter();
const readyG = await poll(`crPrepState === 'ready'`, 40000).catch(() => false);
await ev(tapStreet('Bordeaux Drive'));
const pickedG = await poll(`!!(draft && draft.roads['Bordeaux Drive'])`, 10000).catch(() => false);
await ev(`crOpenSectors('Bordeaux Drive')`);
const SG1 = await snap('S7-sectors-open');
ok('S7a (sector record, entry) opening a picked street\'s sectors puts the session in the record - street set, snapshot null (the whole road was the entry pick), face travelling to the bar | street=' + SG1.sec.street + ' snap=' + SG1.sec.snap,
  readyG === true && pickedG === true && SG1.sec.street === 'Bordeaux Drive' && SG1.sec.snap === null);
const faceBar = await poll(`crSectorSession.face === 'bar'`, 10000).catch(() => false);
await ev(`crCancelSectors()`); // restore the entry pick exactly, close the pair
const faceBack = await poll(`crSectorSession.face === 'panel'`, 10000).catch(() => false); // the face RESTS at panel when the return morph settles - poll its terminal state, not the click (the morph is the app's own animation; a first cut of this drive read the face mid-flight and failed on its own sampling)
const SG2 = await snap('S7-sectors-cancelled');
ok('S7b (sector record, Cancel) Cancel closes the PAIR in the record (street null, snapshot undefined again), the street stays in the draft untouched, and the face rests back at the panel | faceBar=' + faceBar + ' faceBack=' + faceBack + ' post=' + JSON.stringify(SG2.sec) + ' draft=' + JSON.stringify(await J(`draftStreets()`)),
  faceBar === true && faceBack === true && SG2.sec.street === null && SG2.sec.snap === 'undef' && SG2.sec.face === 'panel');
await ev(`crOpenSectors('Bordeaux Drive')`);
await ev(`crSectorSession.collapsed = true`); // scenario seed: the panel tucked away before the stage change (the gesture path is drives 156-158's claim)
await ev(`setCreateStage('preview')`);
const SG3 = await snap('S7-stage-change');
ok('S7c (sector record, stage change) moving to the preview stage resets the PAIR (street null, snapshot dropped) and deliberately leaves COLLAPSED set - crSectorReset closes the pair only, exactly as through 1.153 | ' + JSON.stringify(SG3.sec),
  SG3.sec.street === null && SG3.sec.snap === 'undef' && SG3.sec.collapsed === true);
await ev(`crSectorSession.collapsed = false`); // un-seed before exit
await jExitDiscard();

// ---------- FINAL: the violations list is EXACTLY the teeth sections' entries ----------
const FIN = await J(`({ viol: crPrepViolations.slice(), state: crPrepState })`);
ok('FINAL (parity across every real flow in this drive) crPrepViolations holds EXACTLY the four teeth entries and nothing else - no live transition in any section was ever refused, so the formalized table and the app\'s real behaviour agree edge for edge | ' + JSON.stringify(FIN.viol),
  JSON.stringify(FIN.viol) === JSON.stringify(['ready->degraded', 'ready->failed', 'none->ready', 'none->failed']) && FIN.state === 'none');

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
