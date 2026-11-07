import { launchDrive, bootThrough, finish } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// drive150: create-a-route (Step 2, hybrid flow; Beta 1.121 city-first +
// preparation). NETWORK FIXTURES: Nominatim + Overpass are stubbed
// IN-PAGE from fixtures frozen out of the route-creation sandbox's real
// Vaughan OSM extract (tests/browser/fixtures/create-osm.json, vendored
// so CI runs the same data) - deterministic, no live network for the
// create flow (basemap tiles still flow through the harness as usual).
// The tap's feature pick is fixtured at the map seam: in this headless
// rig the basemap style never readies (the known limit drive149 works
// around for GLP.init), so queryRenderedFeatures returns nothing at all
// here - the drive substitutes fixture roads features and fires REAL map
// click events through the app's registered handler, so the
// identification -> prepared extract -> stitch -> draft path all runs
// for real; only MapLibre's own tile picking (a documented library API,
// live on device where tiles render) is stubbed. Sections: (a) the
// manual door end-to-end (CITY STEP first - Beta 1.121, Andrew's
// amendment: "What city will you be cleaning in?", populated places
// only -> pick Vaughan -> search "borde" -> the pick anchors the area
// preparation -> tap Bordeaux Drive + Alderson Avenue, resolved locally
// -> defaults secondary -> flip Bordeaux to main -> preview lengths
// match the fixture geometry -> name it -> save -> listed -> switch to
// it -> mark a street -> switch back: 5W slot BYTE-IDENTICAL, the
// created route's mark in ITS slot); (a2) the tap pick seam (Beta
// 1.119): a point query at the tap returns NO road (a fingertip never
// lands on the line's exact pixels) but a box query returns two named
// roads - the nearer line must be picked, the farther must not (1.118's
// point-only crMapTap fails this: "No road there" on every real tap);
// (b) preview corrections (add via the picker from preview, remove in
// preview, start-over confirm discards - 5W slot still byte-identical);
// (c) the photo door (photo pick -> waiting state -> a MALFORMED draft
// fails closed with a named error and no state change -> the sandbox
// candidate draft imports into the preview with its 34 streets; a
// pack-envelope draft carries its name into name-it); (d) persistence
// (reload keeps the route; backup carries userpacks; wipe + restore
// brings the route AND its mark back);
// (e) the CSP seam (Beta 1.119): a copy of the page stamped with the
// REAL policy (scripts/csp_stamp.py, as drive116 stamps) is booted with
// window.fetch NOT stubbed, and the app's actual crSearch /
// crOverpassFetch calls are fired at their real URLs - on the 1.118
// policy the app's own connect-src refuses both (securitypolicyviolation
// events + console refusals naming the hosts); on 1.119+ the calls leave
// the page (whatever the rig's network then does with them) and no
// refusal is recorded. drive150's other sections stub fetch in-page,
// which is exactly why the 1.118 defect shipped unseen - this section
// never stubs. Beta 1.120 added sections (f) the tap wedge + Overpass
// fallback, (g) search as you type, (h) the POI creation backdrop, and
// (i) theming / bar position / dropdown dismissal / the ✕. Beta 1.121
// REBUILDS the network sections (audit round pickfetch, CG-PF-06: the
// old ones passed with zero geometry ever received): (f) is now
// preparation failure + Retry; (j) grades the REAL request path at the
// fetch seam - it decodes the app's actual POST bodies (query grammar +
// bounds for the batch AND the top-up), replays the measured latency
// profile (a correct answer at a real 45 s succeeds inside the 120 s
// budget; silence fails honestly inside it), splits headers from a
// stalled body, runs the failure matrix (statuses, malformed JSON,
// HTTP-200-with-remark, over-cap payload), proves offline-after-extract
// adds with ZERO further geometry requests, exercises the edge rule
// (one top-up completes Edgewater Avenue; Faraway Avenue stays
// PENDING), races cancel / exit / supersede / top-up-after-exit, and
// walks the no-search Prepare-this-area path. The grammar, latency and
// body-stall assertions were each demonstrated RED on the 1.120 tree
// before the fix (beta1/work/create-prep-1121/). The VERIFY round then
// added (CG-PF-07..11): the top-up graded at a real 45 s primary answer,
// Codex's adversarial junction fixture, the dense / outside-coverage /
// pending remedies graded on the REQUESTS they fire rather than their
// wording, Cancel and exit proven to abort the download itself via the
// stub's abort counter, and the held remembered-city lookup raced
// against a competing pick. CG-PF-12's native-transport half (real
// browser interception, window.fetch untouched) is drive151. Andrew's
// SECOND gate amendment then replaced the single-box preparation with
// the WHOLE-CITY grid + the persistent on-device city cache: (j) now
// runs against a small 2 x 2 fixture city and grades grid grammar and
// progress, cross-cell merge/dedupe by way id, cancel-keeps-parts +
// resume-fetches-only-missing, the saved city loading with ZERO
// requests, and the disclosed storage-cap refusal - every scenario
// starting from a wiped cache.
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

// ---------- boot 5W, settle a baseline ----------
await poll(`typeof loadRoute === 'function'`, 20000);
await poll(`!!window.__bootAt`, 30000);
await ev(`document.getElementById('rmChoose').click()`);
await ev(`document.querySelector('#rmRoutes .routeRow').click()`);
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
await poll(`!document.getElementById('splash')`, 20000);
await poll(`typeof map === 'undefined' || !map || !map.isMoving()`, 25000);
await ev(installStub);
await ev(`markDone('Velmar', 'drive150')`);
await ev(`setNoteText('Velmar', 'drive150 baseline')`);
const D0 = await ev(dump5wSrc);
const G0 = await J(`({ names: STREETNAMES.slice(), totals: Object.fromEntries(Object.entries(STRETCH).map(([n, s]) => [n, Math.round(s.total)])) })`);
ok('setup: 5W loaded with baseline work (Velmar done + note) and the fixture stub installed', G0.names.length === 34);

// ---------- (a) manual door end-to-end ----------
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
const A0 = await J(`({ doors: document.getElementById('rmCreatePane').classList.contains('on'), photo: !!document.getElementById('crDoorPhoto'), manual: !!document.getElementById('crDoorManual') })`);
ok('A0 the Create pane shows the two doors (photo / select streets myself)', A0.doors && A0.photo && A0.manual);
await ev(`document.getElementById('crDoorManual').click()`);
const AC0 = await J(`({ pane: document.getElementById('rmCityPane').classList.contains('on'), creating, title: document.querySelector('#rmCityPane .rmTitle').textContent })`);
ok('A0b (Beta 1.121, Andrew\'s amendment) the manual door now opens the CITY STEP first - "What city will you be cleaning in?" - before any picking (not yet creating) | ' + JSON.stringify(AC0),
  AC0.pane && AC0.creating === false && AC0.title.indexOf('What city') === 0);
const AC = await pickCityVaughan();
ok('A0c the city suggestions list populated places only: exactly ONE row for "Vaughan" (the same-named STREET in the fixture is filtered out) | ' + JSON.stringify(AC),
  AC.rows && AC.first.indexOf('Vaughan, Ontario') === 0);
const A1 = await J(`({ creating, body: document.body.classList.contains('creating'), bar: document.getElementById('createBar').classList.contains('on'), sheet: document.getElementById('createSheet').classList.contains('on'), menuOpen: document.getElementById('routeMenu').classList.contains('open'), city: crCity && crCity.name, chip: (document.getElementById('crCityChange') || {}).textContent || '' })`);
ok('A1 picking the city enters create mode on the map (bar + pick sheet up, menu closed), scoped to Vaughan - the sheet names the city with a change affordance | ' + JSON.stringify(A1),
  AC.inPick && A1.creating === true && A1.body && A1.bar && A1.sheet && !A1.menuOpen && A1.city === 'Vaughan' && A1.chip.indexOf('Vaughan') >= 0);
await ev(`document.getElementById('crSearchInput').value = 'borde'`);
await ev(`document.getElementById('crSearchBtn').click()`);
await poll(`document.querySelectorAll('#createResults .crResult').length === 1`, 15000);
const A2 = await J(`({ n: document.querySelectorAll('#createResults .crResult').length, txt: (document.querySelector('#createResults .crResult') || {}).textContent || '' })`);
ok('A2 search "borde" returns the fixture result (Bordeaux Drive, Vaughan)', A2.n === 1 && A2.txt.indexOf('Bordeaux Drive') >= 0);
await ev(`document.querySelector('#createResults .crResult').click()`);
await poll(`(() => { const c = map.getCenter(); return Math.abs(c.lat - 43.798972) < 0.004 && Math.abs(c.lng - (-79.574666)) < 0.004 && !map.isMoving(); })()`, 20000);
await poll(`crPrepState === 'ready'`, 15000).catch(() => false);
const A2c = await J(`({ state: crPrepState, cov: !!crCov, names: crCov ? Object.keys(crCov.byName).sort() : [] })`);
ok('A2c (Beta 1.121, whole-city amendment) picking the city started its whole-city preparation: the extract is ready and holds both fixture streets - taps from here resolve locally | ' + JSON.stringify(A2c),
  A2c.state === 'ready' && A2c.cov && A2c.names.join() === 'Alderson Avenue,Bordeaux Drive');
await ev(installFeatureStub);
await ev(tapNothing);
await sleep(400);
const A2b = await J(`({ toast: document.getElementById('toast').textContent, streets: draft ? Object.keys(draft.roads).length : -1 })`);
ok('A2b a tap with no road feature under it says so and adds nothing | toast: ' + A2b.toast, A2b.toast.indexOf('No road there') >= 0 && A2b.streets === 0);
await ev(tapStreet('Bordeaux Drive'));
const gotB = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 20000);
ok('A3 tapping Bordeaux Drive (fixture roads feature through the real click handler) adds it from the prepared extract', gotB === true);
const A4 = await J(`({ streets: Object.keys(draft.roads), mains: draft.mains.size, count: document.getElementById('crCount').textContent, chip: (document.querySelector('#crPickList .crPChip') || {}).textContent || '', total: Math.round(computeStretches(draft.roads)['Bordeaux'].total), src: (map.getSource('crDraft').serialize().data.features || []).length })`); // Beta 1.127 premise updates in this drive: the pick rows are the picked-roads panel's rows - chip is .crPChip (A4), the panel header counts 'N roads' (A4/A6), the chip flip's proof is its own MAIN text (A7), and the theme probe reads the panel face #crPanel (I2)
ok('A4 Bordeaux joined the draft as a SECONDARY (2ND chip, 0 mains) with its shape drawn on the draft overlay | ' + JSON.stringify(A4),
  A4.streets.length === 1 && A4.mains === 0 && A4.count.indexOf('1 roads') === 0 && A4.chip === '2ND' && A4.src === 1);
ok('A5 the fetched Bordeaux length matches the fixture geometry (' + Math.round(fixtureLen('Bordeaux Drive')) + ' m) within 2% | got ' + A4.total,
  Math.abs(A4.total - fixtureLen('Bordeaux Drive')) <= fixtureLen('Bordeaux Drive') * 0.02);
await ev(tapStreet('Alderson Avenue'));
const gotA = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Alderson']`, 20000);
ok('A5b tapping Alderson Avenue adds it too', gotA === true);
const A6 = await J(`({ streets: Object.keys(draft.roads).sort(), count: document.getElementById('crCount').textContent, ald: Math.round(computeStretches(draft.roads)['Alderson'].total) })`);
ok('A6 Alderson Avenue tapped and added (2 streets); its stitched length matches the 5-way fixture (' + Math.round(fixtureLen('Alderson Avenue')) + ' m) within 3% | ' + JSON.stringify(A6),
  A6.streets.length === 2 && A6.count.indexOf('2 roads') === 0 && Math.abs(A6.ald - fixtureLen('Alderson Avenue')) <= fixtureLen('Alderson Avenue') * 0.03);
await ev(`(() => { const rows = [...document.querySelectorAll('#crPickList .crPRow')]; const row = rows.find(r => r.querySelector('.crPName').textContent === 'Bordeaux'); row.querySelector('.crPChip').click(); return true; })()`); // Beta 1.127 premise update: the chip lives in the panel row (.crPRow/.crPName/.crPChip)
const A7 = await J(`({ mains: [...draft.mains], chip: (() => { const rows = [...document.querySelectorAll('#crPickList .crPRow')]; const row = rows.find(r => (r.querySelector('.crPName') || {}).textContent === 'Bordeaux'); return row ? (row.querySelector('.crPChip') || {}).textContent || '' : ''; })() })`); // Beta 1.127 premise update: the panel header has no mains count - the flipped chip's MAIN text is the visible proof
ok('A7 flipping Bordeaux to MAIN updates its panel chip (2ND -> MAIN)', A7.mains.length === 1 && A7.mains[0] === 'Bordeaux' && A7.chip === 'MAIN'); // Beta 1.127 premise update: chip text replaces the old header mains count
await ev(`document.getElementById('crDoneBtn').click()`);
const A8 = await J(`({ stage: crStage, pv: document.getElementById('previewSheet').classList.contains('on'), bar: document.getElementById('createBar').classList.contains('on'), rows: document.querySelectorAll('#pvList .crRow').length, pvCount: document.getElementById('pvCount').textContent })`);
ok('A8 Done lands in the shared preview ("Is this correct?") with both streets and the count', A8.stage === 'preview' && A8.pv && !A8.bar && A8.rows === 2 && A8.pvCount.indexOf('2 streets') === 0);
await ev(`document.getElementById('pvSaveBtn').click()`);
await poll(`document.getElementById('rmNamePane').classList.contains('on')`, 10000);
const A9 = await J(`({ name: document.getElementById('crNameInput').value, area: document.getElementById('crAreaInput').value, summary: document.getElementById('crNameSummary').textContent })`);
ok('A9 name-it is its own step (kept, Andrew - the preview\'s "Save route" advances here): area pre-filled from the search (Vaughan), summary reads 2 streets · 1 mains | ' + JSON.stringify(A9),
  A9.area === 'Vaughan' && A9.summary.indexOf('2 streets') >= 0 && A9.summary.indexOf('1 mains') >= 0);
await ev(`document.getElementById('crNameInput').value = 'Route 6W'`);
await ev(`document.getElementById('crSaveBtn').click()`);
await poll(`ROUTE_PACKS.some(p => p.id === 'route-6w') && !creating`, 10000);
const A10 = await J(`({ rec: JSON.parse(localStorage.getItem('snowroute.v2.userpacks') || '{}'), listed: !!document.querySelector('#rmRoutes .routeRow[data-route="route-6w"]'), pre: JSON.parse(localStorage.getItem('snowroute.route-6w.v5.preload') || 'null') })`);
ok('A10 save persists the pack in snowroute.v2.userpacks (2 streets, Bordeaux main), lists it in the Routes menu, and gives it an honest preload record (0 of its tiles) | ' + JSON.stringify({ keys: Object.keys(A10.rec), pre: A10.pre }),
  !!A10.rec['route-6w'] && Object.keys(A10.rec['route-6w'].roads).length === 2 && A10.rec['route-6w'].main.join() === 'Bordeaux' && A10.listed && A10.pre && A10.pre.routeSaved === 0 && A10.pre.routeTotal > 0);
await ev(`document.querySelector('#rmRoutes .routeRow[data-route="route-6w"]').click()`);
await poll(`typeof activeRoute !== 'undefined' && activeRoute && activeRoute.id === 'route-6w'`, 20000);
await poll(`typeof map === 'undefined' || !map || !map.isMoving()`, 25000);
const A11 = await J(`({ names: STREETNAMES.slice().sort(), count2: document.body.innerText.indexOf('of 2') >= 0 })`);
ok('A11 the created route loads through the 1.117 machinery (2 streets, count reads "of 2")', A11.names.join() === 'Alderson,Bordeaux' && A11.count2);
await ev(`markDone('Bordeaux', 'drive150')`);
const A12 = await J(`({ done: streetComplete('Bordeaux'), slot: (localStorage.getItem('snowroute.route-6w.v5.sides') || '').indexOf('Bordeaux') >= 0 })`);
ok('A12 a street marked on the created route persists in ITS slot', A12.done && A12.slot);
await ev(`openRouteMenu()`);
await ev(`document.querySelector('#rmRoutes .routeRow[data-route="5w"]').click()`);
await poll(`typeof activeRoute !== 'undefined' && activeRoute && activeRoute.id === '5w'`, 20000);
const D1 = await ev(dump5wSrc);
const G1 = await J(`({ names: STREETNAMES.slice(), totals: Object.fromEntries(Object.entries(STRETCH).map(([n, s]) => [n, Math.round(s.total)])) })`);
ok('A13 after the full create -> save -> switch -> mark -> switch-back cycle, the 5W slot is BYTE-IDENTICAL and its geometry is unchanged', D1 === D0 && JSON.stringify(G1) === JSON.stringify(G0));

// ---------- (a2) the tap pick seam: box query + nearest line wins (Beta 1.119) ----------
// 1.118's crMapTap asked queryRenderedFeatures for the tap's single PIXEL:
// rendered road lines are a few px wide, so a real fingertip (landing
// +/-10-20 px off the line) almost never returned a road and every tap
// toasted "No road there". This stub reproduces the fingertip exactly: a
// POINT query returns no road at all, while a BOX query returns two named
// roads - Alderson's line 15 px off the tap, Bordeaux's 12 px - with the
// FARTHER street first in the array, so only a nearest-line choice (never
// array order, never the bare name list) can pick Bordeaux.
const installPickStub = `(() => {
  if (!map.__qrfOrig) map.__qrfOrig = map.queryRenderedFeatures.bind(map);
  map.queryRenderedFeatures = (arg) => {
    if (!Array.isArray(arg)) return []; // the single-pixel point query: NO road under the exact pixel
    const cx = (arg[0][0] + arg[1][0]) / 2, cy = (arg[0][1] + arg[1][1]) / 2;
    const mk = (name, dy) => { const a = map.unproject([cx - 40, cy + dy]); const b = map.unproject([cx + 40, cy + dy]); return { type: 'Feature', sourceLayer: 'roads', properties: { name }, geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } }; };
    return [mk('Alderson Avenue', 15), mk('Bordeaux Drive', -12)];
  };
  return true;
})()`;
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan();
await prepAtBordeaux(); // the pick below resolves from the prepared extract (Beta 1.121) - prepared here directly, the same call a search pick makes
await ev(installPickStub);
// a REAL MapLibre click's lngLat is by construction the unprojection of its
// point - fire the tap that way, so the nearest-line judge is measured
// against the same geometry the stub draws (section (a)'s canned lngLat
// belongs to a view the map is no longer showing here)
await ev(`(() => { const pt = { x: 210, y: 320 }; const ll = map.unproject([pt.x, pt.y]); map.fire('click', { lngLat: { lat: ll.lat, lng: ll.lng }, point: pt, originalEvent: {} }); return true; })()`);
const gotPick = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 20000);
const PK = await J(`({ streets: draft ? Object.keys(draft.roads) : [], total: draft && draft.roads['Bordeaux'] ? Math.round(computeStretches(draft.roads)['Bordeaux'].total) : -1, toast: document.getElementById('toast').textContent })`);
ok('P1 (pick seam) a tap whose exact pixel holds NO road still picks the street whose tile line passes nearest the tap (Bordeaux, 12 px) and the pick reaches pickStreet -> the prepared extract (length ' + Math.round(fixtureLen('Bordeaux Drive')) + ' m) | ' + JSON.stringify(PK),
  gotPick === true && PK.streets.join() === 'Bordeaux' && Math.abs(PK.total - fixtureLen('Bordeaux Drive')) <= fixtureLen('Bordeaux Drive') * 0.02);
ok('P2 (pick seam) the farther street inside the same box (Alderson, 15 px, listed first) is NOT picked', !PK.streets.includes('Alderson'));
await ev(`document.getElementById('crExit').click()`);
await sleep(300);
await ev(`document.getElementById('crExit').click()`); // Beta 1.120: the ✕ clears a leftover search text FIRST (section (a) left "borde" in the box) - the second press is the exit this section means
await sleep(500);
await ev(`(() => { const y = document.getElementById('crModalYes'); if (y && !document.getElementById('crModal').classList.contains('hidden')) y.click(); return true; })()`);
await sleep(400);
await ev(installFeatureStub); // restore section (a)'s stub for the sections that follow
const PK3 = await J(`({ creating })`);
ok('P3 (pick seam) the probe draft is discarded and create mode exits cleanly', PK3.creating === false);

// ---------- (b) preview corrections + start-over discard ----------
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan();
await prepAtBordeaux();
await ev(tapStreet('Bordeaux Drive'));
const gotB2 = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 20000);
ok('B0 the second manual session (city step + preparation again) picks Bordeaux again (feature stub still installed)', gotB2 === true);
await ev(`document.getElementById('crDoneBtn').click()`);
const B1 = await J(`({ rows: document.querySelectorAll('#pvList .crRow').length })`);
ok('B1 a one-street draft reaches the preview', B1.rows === 1);
await ev(`document.getElementById('pvAddBtn').click()`);
const B2 = await J(`({ stage: crStage, bar: document.getElementById('createBar').classList.contains('on'), doneLbl: document.getElementById('crDoneBtn').textContent })`);
ok('B2 "+ Add a street" reopens the picker (Beta 1.128: the panel button reads "Done" in every state - the "back to check" rewrite is gone)', B2.stage === 'pick' && B2.bar && B2.doneLbl === 'Done');
await ev(tapStreet('Alderson Avenue'));
await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Alderson']`, 20000);
await ev(`document.getElementById('crDoneBtn').click()`);
const B3 = await J(`({ rows: document.querySelectorAll('#pvList .crRow').length, count: document.getElementById('pvCount').textContent })`);
ok('B3 the added street returns to the same preview (2 streets)', B3.rows === 2 && B3.count.indexOf('2 streets') === 0);
await ev(`(() => { const rows = [...document.querySelectorAll('#pvList .crRow')]; const row = rows.find(r => r.querySelector('.crName').textContent === 'Bordeaux'); row.querySelector('.crDel').click(); return true; })()`);
const B4 = await J(`({ streets: Object.keys(draft.roads), count: document.getElementById('pvCount').textContent })`);
ok('B4 removing Bordeaux in the preview updates the draft and the count (1 street left)', B4.streets.join() === 'Alderson' && B4.count.indexOf('1 streets') === 0);
await ev(`document.getElementById('pvStartOverBtn').click()`);
const B5 = await J(`({ modal: !document.getElementById('crModal').classList.contains('hidden'), creating })`);
ok('B5 Start over on a non-empty draft asks first (confirm modal, still creating)', B5.modal && B5.creating === true);
await ev(`document.getElementById('crModalYes').click()`);
const B6 = await J(`({ creating, draft: draft === null, doors: document.getElementById('rmCreatePane').classList.contains('on') })`);
ok('B6 confirming discards the draft and lands back at the doors', B6.creating === false && B6.draft && B6.doors);
const D2 = await ev(dump5wSrc);
ok('B7 the create-and-DISCARD cycle never touched the 5W slot (byte-identical)', D2 === D0);

// ---------- (c) photo door: waiting state, fail-closed import, candidate import ----------
await ev(`document.getElementById('crDoorPhoto').click()`);
const C0 = await J(`({ pane: document.getElementById('rmPhotoPane').classList.contains('on') })`);
ok('C0 the photo door opens its pane', C0.pane);
await setFile('#crPhotoFile', '/tmp/d150-photo.png');
await poll(`document.getElementById('crPhotoWait').style.display !== 'none'`, 8000).catch(() => false);
let C1 = await J(`({ wait: document.getElementById('crPhotoWait').style.display !== 'none', name: document.getElementById('crPhotoName').textContent, copy: document.getElementById('crPhotoWait').textContent.indexOf('your draft is being built') >= 0 })`);
if (!C1.wait) { await ev(`document.getElementById('crPhotoFile').dispatchEvent(new Event('change'))`); await sleep(500); C1 = await J(`({ wait: document.getElementById('crPhotoWait').style.display !== 'none', name: document.getElementById('crPhotoName').textContent, copy: document.getElementById('crPhotoWait').textContent.indexOf('your draft is being built') >= 0 })`); }
ok('C1 picking a photo lands in the honest waiting state (photo named, "your draft is being built")', C1.wait && C1.name === 'd150-photo.png' && C1.copy);
await setFile('#crDraftFile', '/tmp/d150-bad.json');
await sleep(600);
let C2 = await J(`({ creating, draft: draft === null, toast: document.getElementById('toast').textContent })`);
if (!C2.toast) { await ev(`document.getElementById('crDraftFile').dispatchEvent(new Event('change'))`); await sleep(600); C2 = await J(`({ creating, draft: draft === null, toast: document.getElementById('toast').textContent })`); }
ok('C2 a MALFORMED draft file fails closed: named error toast, no create mode, no draft | toast: ' + C2.toast,
  C2.creating === false && C2.draft && C2.toast.indexOf('could not be read') >= 0);
await setFile('#crDraftFile', '/tmp/d150-candidate.json');
await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'preview'`, 10000).catch(() => false);
let C3 = await J(`({ creating, stage: crStage, streets: draft ? Object.keys(draft.roads).length : -1, rows: document.querySelectorAll('#pvList .crRow').length, total: draft ? Math.round(Object.values(computeStretches(draft.roads)).reduce((a, s) => a + s.total, 0)) : -1 })`);
if (!C3.creating) { await ev(`document.getElementById('crDraftFile').dispatchEvent(new Event('change'))`); await poll(`typeof creating !== 'undefined' && creating === true`, 10000); C3 = await J(`({ creating, stage: crStage, streets: draft ? Object.keys(draft.roads).length : -1, rows: document.querySelectorAll('#pvList .crRow').length, total: draft ? Math.round(Object.values(computeStretches(draft.roads)).reduce((a, s) => a + s.total, 0)) : -1 })`); }
ok('C3 the sandbox candidate draft (bare roads shape) imports into the preview with all 34 streets, total length matching the candidate (' + Math.round(candLen) + ' m) within 1% | ' + JSON.stringify(C3),
  C3.creating && C3.stage === 'preview' && C3.streets === 34 && C3.rows === 34 && Math.abs(C3.total - candLen) <= candLen * 0.01);
await ev(`document.getElementById('pvStartOverBtn').click()`);
await ev(`document.getElementById('crModalYes').click()`);
const C4 = await J(`({ creating, doors: document.getElementById('rmCreatePane').classList.contains('on') })`);
ok('C4 the imported candidate draft discards cleanly back to the doors', C4.creating === false && C4.doors);
await ev(`document.getElementById('crDoorPhoto').click()`);
await setFile('#crDraftFile', '/tmp/d150-envelope.json');
await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'preview'`, 10000).catch(() => false);
let C5 = await J(`({ creating, name: draft ? draft.name : '', mains: draft ? [...draft.mains] : [] })`);
if (!C5.creating) { await ev(`document.getElementById('crDraftFile').dispatchEvent(new Event('change'))`); await poll(`typeof creating !== 'undefined' && creating === true`, 10000); C5 = await J(`({ creating, name: draft ? draft.name : '', mains: draft ? [...draft.mains] : [] })`); }
ok('C5 a pack-envelope draft imports with its name and mains carried into the draft', C5.creating && C5.name === 'Envelope Route' && C5.mains.join() === 'Bordeaux');
await ev(`document.getElementById('pvSaveBtn').click()`);
await poll(`document.getElementById('rmNamePane').classList.contains('on')`, 10000);
const C6 = await J(`({ name: document.getElementById('crNameInput').value })`);
ok('C6 name-it pre-fills the imported draft\'s name', C6.name === 'Envelope Route');
await ev(`document.getElementById('crNameBack').click()`);
await ev(`document.getElementById('pvStartOverBtn').click()`);
await ev(`document.getElementById('crModalYes').click()`);
const D3 = await ev(dump5wSrc);
ok('C7 the photo-door cycles (import, discard, import, discard) never touched the 5W slot', D3 === D0);

// ---------- (d) persistence: reload, backup, wipe, restore ----------
const origin0 = await ev(`performance.timeOrigin`);
await ev(`location.reload()`);
await sleep(1200);
await poll(`performance.timeOrigin !== ${origin0}`, 20000);
await poll(`!!window.__bootAt`, 30000);
await ev(`document.getElementById('rmChoose').click()`);
const P1 = await J(`({ rows: [...document.querySelectorAll('#rmRoutes .routeRow')].map(r => r.getAttribute('data-route')) })`);
ok('D1 after a reload the created route is still listed (boot merge from the userpacks record) | ' + JSON.stringify(P1.rows), P1.rows.includes('route-6w') && P1.rows.includes('5w'));
await ev(`document.querySelector('#rmRoutes .routeRow[data-route="5w"]').click()`);
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
await poll(`!document.getElementById('splash')`, 20000);
const bak = await ev(`buildBackup()`);
const bakObj = JSON.parse(bak);
ok('D2 the backup carries the created route\'s definition (userpacks) and its route state',
  !!bakObj.userpacks && !!bakObj.userpacks['route-6w'] && Object.keys(bakObj.userpacks['route-6w'].roads).length === 2 && !!bakObj.routes['route-6w']);
await ev(`localStorage.clear()`);
const origin1 = await ev(`performance.timeOrigin`);
await ev(`location.reload()`);
await sleep(1200);
await poll(`performance.timeOrigin !== ${origin1}`, 20000);
await poll(`!!window.__bootAt`, 30000);
await ev(`document.getElementById('rmChoose').click()`);
const P2 = await J(`({ rows: [...document.querySelectorAll('#rmRoutes .routeRow')].map(r => r.getAttribute('data-route')) })`);
ok('D3 after a wipe only the shipped pack remains (the created route is gone)', JSON.stringify(P2.rows) === JSON.stringify(['5w']));
await ev(`document.querySelector('#rmRoutes .routeRow[data-route="5w"]').click()`);
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
await poll(`!document.getElementById('splash')`, 20000);
await ev('window.__bakText = ' + JSON.stringify(bak));
await ev(`document.getElementById('xText').value = window.__bakText; doRestore();`); // the pane's own path: xText -> doRestore -> restoreBackup
await sleep(1500);
await poll(`typeof ROUTE_PACKS !== 'undefined'`, 30000);
await poll(`!!window.__bootAt`, 30000);
await ev(`document.getElementById('rmChoose').click()`);
const P3 = await J(`({ rows: [...document.querySelectorAll('#rmRoutes .routeRow')].map(r => r.getAttribute('data-route')), rec: Object.keys(JSON.parse(localStorage.getItem('snowroute.v2.userpacks') || '{}')) })`);
ok('D4 restore re-registers the created route (record written, route listed after the restore reload)', P3.rows.includes('route-6w') && P3.rec.includes('route-6w'));
await ev(`document.querySelector('#rmRoutes .routeRow[data-route="route-6w"]').click()`);
await poll(`typeof activeRoute !== 'undefined' && activeRoute && activeRoute.id === 'route-6w'`, 20000);
const P4 = await J(`({ names: STREETNAMES.length, bordeaux: streetComplete('Bordeaux') })`);
ok('D5 the restored created route loads with its mark intact (Bordeaux still complete)', P4.names === 2 && P4.bordeaux === true);
await ev(`openRouteMenu()`);
await ev(`document.querySelector('#rmRoutes .routeRow[data-route="5w"]').click()`);
await poll(`typeof activeRoute !== 'undefined' && activeRoute && activeRoute.id === '5w'`, 20000);
const P5 = await J(`({ velmar: streetComplete('Velmar'), note: noteTextOf('Velmar') })`);
ok('D6 5W\'s own state rode the same round trip (Velmar complete, note intact)', P5.velmar === true && P5.note === 'drive150 baseline');

// ---------- (f) preparation failure + Retry (Beta 1.121) ----------
// 1.120's section (f) proved the per-tap wedge (a refused fetch latched
// the picker shut); the per-tap fetch is gone, and what must hold now is
// the preparation's failure shape: both instances refusing ends in the
// FAILED state with the honest reason persistent in the hint and a Retry
// button - never a hung "Loading", never a latched picker - and Retry
// against a healthy service completes the preparation and taps work.
// The stub answers every Overpass request with a slightly delayed 503
// until window.__fHealthy flips (the delay makes the in-flight state
// observable instead of racy).
const installStub2 = `(() => {
  const prev = window.fetch.bind(window);
  window.__fHealthy = false;
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) {
      if (!window.__fHealthy) return new Promise(res => setTimeout(() => res(new Response('refused by fixture', { status: 503 })), 300));
    }
    return prev(url, opts);
  };
  return true;
})()`;
const tapRoad = (name, lat, lng) => `(() => { window.__fixtureRoads = [${JSON.stringify(name)}]; map.fire('click', { lngLat: { lat: ${lat}, lng: ${lng} }, point: { x: 210, y: 320 }, originalEvent: {} }); return true; })()`;
await ev(installStub); // section (d)'s reloads wiped the in-page stubs - restore the base fixture first
await ev(installStub2);
await ev(installFeatureStub);
await ev(`(async () => { await new Promise(res => { try { const rq = indexedDB.deleteDatabase('snowroute-citycache'); rq.onsuccess = () => res(); rq.onerror = () => res(); rq.onblocked = () => res(); } catch (e) { res(); } }); return true; })()`); // the city cache is on-device state: earlier sections SAVED Vaughan - this scenario must load it for real, not read it back
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan(); // the pick itself starts the whole-city grid now
await sleep(2500);
const F0 = await J(`({ state: crPrepState, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent, btnOn: document.getElementById('crHintBtn').style.display !== 'none' })`);
ok('F1 while the city load is in flight, the hint carries the REAL progress ("Loading Vaughan — part N of 35 · T s") with a Cancel button beside it | ' + JSON.stringify(F0),
  F0.state === 'preparing' && /Loading Vaughan — part \d+ of 35 · \d+ s/.test(F0.hint) && F0.btn === 'Cancel' && F0.btnOn);
const fFailed = await poll(`crPrepState === 'failed'`, 45000).catch(() => false);
const F1 = await J(`({ state: crPrepState, kind: crPrepFail && crPrepFail.kind, status: crPrepFail && crPrepFail.status, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent, boxes: crCov ? crCov.boxes.length : -1, streets: draft ? Object.keys(draft.roads).length : -1, busy: crPickBusy })`);
ok('F2 a shape service that refuses on BOTH instances (503) fails EVERY cell and ends FAILED with the honest reason persistent in the hint, a Retry button, NO coverage committed, nothing added, and the picker free (the 1.119/1.120 wedge cannot recur at the preparation layer) | ' + JSON.stringify(F1),
  fFailed === true && F1.kind === 'error' && F1.status === 503 && F1.hint.indexOf('answered with an error') >= 0 && F1.btn === 'Retry' && F1.boxes === 0 && F1.streets === 0 && F1.busy === false);
await ev(`window.__fHealthy = true`);
await ev(`document.getElementById('crHintBtn').click()`); // Retry: resumes the grid's missing cells (all of them)
const fReady = await poll(`crPrepState === 'ready'`, 30000).catch(() => false);
await ev(tapStreet('Bordeaux Drive'));
const gotF = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 15000).catch(() => false);
ok('F3 Retry against the now-healthy service completes the preparation, and a tap then adds Bordeaux from the extract - failure left nothing latched | ready: ' + fReady,
  fReady === true && gotF === true);
await ev(`document.getElementById('crExit').click()`);
await sleep(400);
await ev(`(() => { const y = document.getElementById('crModalYes'); if (y && !document.getElementById('crModal').classList.contains('hidden')) y.click(); return true; })()`);
await sleep(400);
const F3 = await J(`({ creating })`);
ok('F4 the failure-probe draft discards cleanly and create mode exits', F3.creating === false);

// ---------- (g) search as you type (Beta 1.120) ----------
// Andrew's ask, superseding the 1.118 button-only design: suggestions
// while typing. The stub records every Nominatim query and answers
// 'slowville' after 1500 ms - long after a newer 'borde' search has
// rendered - so the stale-answer guard (sequence token + abort) is what
// keeps the slow answer out of the dropdown.
const installStub3 = `(() => {
  const prev = window.fetch.bind(window);
  window.__nomCalls = [];
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('nominatim.openstreetmap.org') >= 0) {
      if (u.indexOf('featuretype=city') >= 0) return prev(url, opts); // Beta 1.121: the CITY step's queries pass through to the base stub unrecorded - __nomCalls grades the STREET search only
      const qm = /[?&]q=([^&]+)/.exec(u); const q = qm ? decodeURIComponent(qm[1]) : '';
      window.__nomCalls.push(q);
      const slow = q.indexOf('slowville') >= 0;
      const payload = slow ? [{ display_name: 'Slowville, Far Away', lat: '43.900000', lon: '-79.400000', address: { city: 'Slowville' } }] : ${JSON.stringify(FIXTURE.nominatim)};
      const body = JSON.stringify(payload);
      if (slow) return new Promise(res => setTimeout(() => res(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })), 1500));
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return prev(url, opts);
  };
  return true;
})()`;
const typeText = v => `(() => { const i = document.getElementById('crSearchInput'); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
await ev(installStub3);
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan(); // Beta 1.121: the city step precedes the street search (its query passed through unrecorded, so G1's call log still grades only the street search)
for (const p of ['b', 'bo', 'bor', 'bord']) { await ev(typeText(p)); await sleep(120); }
await ev(typeText('borde'));
const sgRows = await poll(`document.querySelectorAll('#createResults .crResult').length === 1`, 8000).catch(() => false);
await sleep(700); // any second debounced query would have fired by now
const SG1 = await J(`({ calls: window.__nomCalls.slice(), rows: document.querySelectorAll('#createResults .crResult').length, txt: (document.querySelector('#createResults .crResult') || {}).textContent || '' })`);
ok('G1 typing "borde" keystroke by keystroke fires exactly ONE debounced query (for the full text) and renders its row | ' + JSON.stringify(SG1),
  sgRows === true && SG1.calls.length === 1 && SG1.calls[0] === 'borde' && SG1.rows === 1 && SG1.txt.indexOf('Bordeaux Drive') >= 0);
await ev(typeText('slowville'));
await poll(`window.__nomCalls.indexOf('slowville') >= 0`, 8000);
await ev(typeText('borde'));
await poll(`document.querySelectorAll('#createResults .crResult').length === 1 && document.querySelector('#createResults .crResult').textContent.indexOf('Bordeaux') >= 0`, 8000);
await sleep(1800); // the slow 'slowville' answer lands inside this window - and must be dropped
const SG2 = await J(`({ txt: (document.querySelector('#createResults .crResult') || {}).textContent || '', calls: window.__nomCalls.slice() })`);
ok('G2 a slow earlier answer arriving after a newer search does NOT overwrite the newer results (stale guard) | ' + JSON.stringify(SG2),
  SG2.txt.indexOf('Bordeaux') >= 0 && SG2.txt.indexOf('Slowville') < 0 && SG2.calls.join() === 'borde,slowville,borde');
await ev(typeText('bor'));
await sleep(120);
await ev(`document.getElementById('crSearchInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
await sleep(250); // well inside the 500 ms debounce: only Enter can have queried
const SG3a = await J(`({ calls: window.__nomCalls.slice() })`);
await sleep(700); // the cancelled debounce must NOT fire a duplicate
const SG3 = await J(`({ calls: window.__nomCalls.slice() })`);
ok('G3 Enter runs the typed query immediately and cancels the pending debounce (no duplicate "bor" query) | ' + JSON.stringify(SG3),
  SG3a.calls.filter(c => c === 'bor').length === 1 && SG3.calls.filter(c => c === 'bor').length === 1);
await ev(`document.getElementById('crExit').click()`); // input holds text: this click CLEARS (Beta 1.120) - covered in full in section (i)
await sleep(200);
await ev(`document.getElementById('crExit').click()`); // now empty: exits (the draft is empty, so no confirm)
await sleep(400);
const SG4 = await J(`({ creating })`);
ok('G4 the search-probe session exits create mode cleanly', SG4.creating === false);

// ---------- (h) the creation backdrop: POIs only (Beta 1.120) ----------
// With 5W loaded, entering create used to leave its painted streets and
// selection covering the picking map. Now the engine's route paint and
// street-name layers hide, and a POI for EVERY pack in the database
// (the map's own zoomed-out treatment) gives orientation instead.
const FX150 = { id: 'fx150', name: 'Fixture Route', area: 'Nowhere', main: [], roads: { 'Fixture Alpha': [[[43.845, -79.575], [43.845, -79.565]]], 'Fixture Beta': [[[43.855, -79.575], [43.855, -79.565]]] }, reference: {} };
await ev(`(() => { ROUTE_PACKS.push(${JSON.stringify(FX150)}); return true; })()`);
const engReady = await poll(`!!(window.map && map.getLayer && map.getLayer('t1-surface'))`, 30000).catch(() => false);
const H0 = await J(`({ surf: map.getLayoutProperty('t1-surface', 'visibility') || 'visible', names: map.getLayoutProperty('streetnamespt1', 'visibility') || 'visible', sel: map.getLayoutProperty('t1-sel', 'visibility') || 'visible', packs: ROUTE_PACKS.map(p => p.name) })`);
const Dpre = await ev(dump5wSrc);
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan(); // Beta 1.121: create mode (and its backdrop) now starts at the city pick
await sleep(600);
const H1 = await J(`({ surf: map.getLayoutProperty('t1-surface', 'visibility') || 'visible', names: map.getLayoutProperty('streetnamespt1', 'visibility') || 'visible', sel: map.getLayoutProperty('t1-sel', 'visibility') || 'visible', rec: (typeof crHiddenLayers !== 'undefined' && crHiddenLayers) ? crHiddenLayers.length : -1, poi: map.getSource('crPoi') ? map.getSource('crPoi').serialize().data.features.map(f => f.properties.name) : null, poiLayers: ['crPoiRing', 'crPoiDot', 'crPoiTxt'].map(id => !!map.getLayer(id)), draftSrc: !!map.getSource('crDraft') })`);
ok('H1 entering create hides the loaded route\'s paint, selection and street names (engine layers visibility none) - engine stack ready in this session: ' + engReady + ' (in the local rig the basemap style never readies, the documented drive149 limit, so no engine layers exist to hide and the recorded set is empty; CI readies the stack and exercises the hide for real; the hide/restore logic itself is proven against a faithful fake layer registry in the build evidence) | ' + JSON.stringify(H1),
  (engReady === true && H1.surf === 'none' && H1.names === 'none' && H1.sel === 'none' && H1.rec === 28) || (engReady !== true && H1.rec === 0));
ok('H2 while creating, the backdrop shows a POI for EVERY pack in the database (5W, the created route, the fixture) and the draft overlay still exists | ' + JSON.stringify(H1.poi),
  !!H1.poi && H1.poi.length === H0.packs.length && H1.poi.indexOf('Route 5W') >= 0 && H1.poi.indexOf('Fixture Route') >= 0 && H1.poiLayers.every(Boolean) && H1.draftSrc === true);
await ev(`document.getElementById('crExit').click()`);
await sleep(500);
const H2 = await J(`({ surf: map.getLayoutProperty('t1-surface', 'visibility') || 'visible', names: map.getLayoutProperty('streetnamespt1', 'visibility') || 'visible', sel: map.getLayoutProperty('t1-sel', 'visibility') || 'visible', poi: !!map.getSource('crPoi'), creating })`);
ok('H3 exiting create restores the route paint exactly as it was and removes the POI backdrop (engine stack ready in this session: ' + engReady + ') | ' + JSON.stringify(H2),
  H2.creating === false && H2.poi === false && (engReady !== true || (H2.surf === H0.surf && H2.names === H0.names && H2.sel === H0.sel)));
const Dpost = await ev(dump5wSrc);
ok('H4 the backdrop cycle never touched the 5W slot (byte-identical)', Dpost === Dpre);

// ---------- (i) theming, bar position, dropdown dismissal, the ✕ (Beta 1.120) ----------
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan();
await sleep(300);
const barRect = `(() => { const r = document.getElementById('createBar').getBoundingClientRect(); return { top: r.top, height: r.height }; })()`;
const IBday = await J(barRect);
await ev(`document.body.classList.add('night')`);
const IBnight = await J(barRect);
// Beta 1.129 premise update: the pick sheet's card is #createSheet itself now (one surface) - I2's "sheet" probe reads it instead of the #crPanel content, which is transparent by design. The meaning is unchanged: the create sheet wears --card-solid in both modes.
const themeProbe = `(() => { const cs = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).backgroundColor : ''; }; const probe = document.createElement('div'); probe.style.background = 'var(--card-solid)'; document.body.appendChild(probe); const token = getComputedStyle(probe).backgroundColor; probe.remove(); return { wrap: cs('#crSearchWrap'), sheet: cs('#createSheet'), res: cs('#createResults'), row: cs('.crResult'), token }; })()`;
const ITnight = await J(themeProbe);
await ev(`document.body.classList.remove('night')`);
const ITday = await J(themeProbe);
ok('I1 the search row sits lower by half its own height (fixed 50px row; top = 10 + 25 in the rig, no safe-area inset) in BOTH themes, nothing clipped | day ' + JSON.stringify(IBday) + ' night ' + JSON.stringify(IBnight),
  Math.abs(IBday.height - 50) <= 2 && Math.abs((IBday.top - 10) - IBday.height / 2) <= 3 && Math.abs(IBnight.height - 50) <= 2 && Math.abs((IBnight.top - 10) - IBnight.height / 2) <= 3);
ok('I2 the create surfaces wear the app\'s theme token: search bar + "Your route" sheet backgrounds EQUAL --card-solid by day and by night, and the two modes differ | day ' + JSON.stringify(ITday) + ' night ' + JSON.stringify(ITnight),
  ITday.wrap === ITday.token && ITday.sheet === ITday.token && ITnight.wrap === ITnight.token && ITnight.sheet === ITnight.token && ITday.wrap !== ITnight.wrap);
ok('I3 the results dropdown is themed too (background equals --card-solid in both modes - never the 1.119 hardcoded white at night) and its rows sit transparent over it | night res ' + ITnight.res,
  ITday.res === ITday.token && ITnight.res === ITnight.token && ITnight.res !== 'rgb(255, 255, 255)' && ITnight.row === 'rgba(0, 0, 0, 0)');
await ev(typeText('borde'));
await poll(`document.getElementById('createResults').classList.contains('on') && document.querySelectorAll('#createResults .crResult').length === 1`, 8000);
const I4a = await J(`({ on: document.getElementById('createResults').classList.contains('on') })`);
await ev(`(() => { const c = document.querySelector('#map canvas') || document.getElementById('map'); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true; })()`);
await sleep(250);
const I4 = await J(`({ on: document.getElementById('createResults').classList.contains('on'), creating })`);
ok('I4 tapping away (a pointerdown on the map) dismisses the results dropdown; create mode is untouched', I4a.on === true && I4.on === false && I4.creating === true);
await prepAtBordeaux(); // Beta 1.121: the tap below resolves from the prepared extract
await ev(tapStreet('Bordeaux Drive'));
const gotI = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 20000).catch(() => false);
ok('I5 after dismissing the dropdown, tapping a road still picks it (the dismissal never eats the pick)', gotI === true);
await ev(typeText('borde'));
await poll(`document.getElementById('createResults').classList.contains('on') && document.querySelectorAll('#createResults .crResult').length === 1`, 8000);
await ev(`document.getElementById('crExit').click()`);
const I6 = await J(`({ val: document.getElementById('crSearchInput').value, on: document.getElementById('createResults').classList.contains('on'), creating })`);
ok('I6 the ✕ beside the search first CLEARS the text and closes the results - it does not exit creating | ' + JSON.stringify(I6),
  I6.val === '' && I6.on === false && I6.creating === true);
await ev(`document.getElementById('crExit').click()`);
await sleep(400);
await ev(`(() => { const y = document.getElementById('crModalYes'); if (y && !document.getElementById('crModal').classList.contains('hidden')) y.click(); return true; })()`);
await sleep(400);
const I7 = await J(`({ creating })`);
ok('I7 pressed again with an empty search, the ✕ exits creating (the discard confirm still guards the draft)', I7.creating === false);

// ---------- (j) the preparation battery (Beta 1.121, CG-PF-06 + the whole-city amendment) ----------
// The network seam, controlled at fetch level with the app's REAL request
// path intact (crCityPrepare / crStartPrep -> crSourceExtract -> crQL ->
// crOverpassFetch -> fetch). The stub below answers from ONE dataset,
// filtered by the request's own decoded bbox - the honest seam for the
// grid cells, the fallback box and the per-street top-up alike - and
// records every geometry request body in __geoLog. The fixture city is
// SMALL (a 2 x 2 grid of ~4 km cells over [43.785..43.845] x
// [-79.610..-79.5105]) so the whole-city machinery runs at battery scale.
// The dataset adds synthetic streets to the real fixture: Edgewater
// Avenue (wholly inside the city - local now), Crosscell Avenue (crosses
// a CELL border - its ways arrive from two cells and one way is returned
// by BOTH, so the merged index must dedupe it by id and stitch it
// whole), Faraway Avenue (crosses the CITY edge - completed by its ONE
// top-up), Farfaraway Avenue (crosses and is NOT completed even by the
// top-up - it must stay PENDING until a wider preparation sweeps it).
// Profiles (window.__jMode): healthy / throw / silent / status / remark
// / badjson / dense / stallbody / supersede / cityfail, plus __jDelayMs
// for honest latency. Delays honour the AbortSignal, as a real fetch
// does - a stub that ignores aborts grades nothing (the red drive's
// first run proved exactly that trap). Every scenario starts from a
// WIPED city cache: the cache is on-device state, and a scenario that
// inherits another's saved city grades nothing (the run-6 lesson).
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
// S1: grid grammar + real progress + cross-cell merge/dedupe + offline adds
await ev(`window.__jDelayMs = 5000`);
await jEnter();
await sleep(3200);
const S1mid = await J(`({ state: crPrepState, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent, btnOn: document.getElementById('crHintBtn').style.display !== 'none' })`);
ok('J2a (grid progress) mid-load the hint carries REAL progress - "Loading Vaughan — part N of 4 · T s" - with Cancel beside it | ' + JSON.stringify(S1mid),
  S1mid.state === 'preparing' && /Loading Vaughan — part \d of 4 · \d+ s/.test(S1mid.hint) && S1mid.btn === 'Cancel' && S1mid.btnOn);
const s1Ready = await poll(`crPrepState === 'ready'`, 30000).catch(() => false);
await ev(`window.__jDelayMs = 0`);
const S1log = await geoSince(0);
const s1Batches = batchBodies(S1log);
const cellKey = b => { const m = /\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(b); return m ? m.slice(1).join(',') : '?'; };
const s1Cells = new Set(s1Batches.map(cellKey));
const s1Grammar = s1Batches.every(b => /^\[out:json\]\[timeout:\d+\];way\["name"\]\["highway"\]\([-\d.,]+\);out geom;$/.test(b));
const s1InCity = s1Batches.every(b => { const m = /\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(b); return m && +m[1] >= 43.784 && +m[3] <= 43.846 && +m[2] >= -79.611 && +m[4] <= -79.5095; });
ok('J1 (grammar, whole-city) picking Vaughan fired the GRID: exactly 4 cell requests (2 x 2 over the fixture city), every decoded body the single builder\'s correct batch grammar (way["name"]["highway"] over a cell inside the city box), no malformed literal anywhere | cells: ' + s1Cells.size + ', bodies: ' + s1Batches.length,
  s1Ready === true && s1Batches.length === 4 && s1Cells.size === 4 && s1Grammar && s1InCity && !S1log.some(x => /way\["name="/.test(x.body)));
const S1cov = await J(`({ cross: crCov && crCov.byName['Crosscell Avenue'] ? crCov.byName['Crosscell Avenue'].length : -1, boxes: crCov ? crCov.boxes.length : -1, w9020: crCov ? Object.keys(crCov.byId).filter(id => id === '9020').length : -1 })`);
await ev(tapRoad('Crosscell Avenue', 43.8230, -79.5650));
const gotCross = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Crosscell']`, 15000).catch(() => false);
const S1x = await J(`({ total: draft && draft.roads['Crosscell'] ? Math.round(computeStretches(draft.roads)['Crosscell'].total) : -1 })`);
ok('J1c (cross-cell merge) Crosscell Avenue crosses a cell border: way 9020 was returned by BOTH row cells yet is stored ONCE (dedupe by way id), and the tap stitches the street WHOLE from the merged index (' + Math.round(crosscellLen) + ' m across both cells) | ' + JSON.stringify(S1cov) + ' ' + JSON.stringify(S1x),
  S1cov.cross === 2 && S1cov.boxes === 4 && S1cov.w9020 === 1 && gotCross === true && Math.abs(S1x.total - crosscellLen) <= crosscellLen * 0.03);
const gcS1 = await geoCount();
await ev(`window.__jMode = 'throw'`);
await ev(tapStreet('Bordeaux Drive'));
const gotB5 = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 15000).catch(() => false);
await ev(tapStreet('Alderson Avenue'));
const gotA5 = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Alderson']`, 15000).catch(() => false);
const gcS1b = await geoCount();
ok('J5 (offline after ready) with the service now THROWING on every request, Bordeaux and Alderson still add from the loaded city at full length - and the geometry request count does not move (' + gcS1 + ' -> ' + gcS1b + ')',
  gotB5 === true && gotA5 === true && gcS1b === gcS1);
await ev(`window.__jMode = 'healthy'`);
await jExitDiscard();
// S2: the fallback box at the measured latency (the fetcher's budgets, via the seam)
await jEnter();
await poll(`crPrepState === 'ready'`, 20000);
await ev(`window.__jDelayMs = 45000`);
const bt0 = Date.now();
await ev(`crStartPrep({ lat: 43.9, lng: -79.56 })`); // an anchor OUTSIDE the city: the fallback box path
await sleep(6000);
const S2mid = await J(`({ state: crPrepState, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent })`);
const s2Ready = await poll(`crPrepState === 'ready'`, 80000).catch(() => false);
const s2Ms = Date.now() - bt0;
await ev(`window.__jDelayMs = 0`);
ok('J2a2 (latency, fallback box) a CORRECT answer arriving at a real 45 s (the measured overpass-api.de profile) SUCCEEDS inside the 120 s budget - mid-wait the hint ticks with Cancel up; 1.120 killed this answer at its 40 s attempt cap | mid: ' + JSON.stringify(S2mid) + ', elapsed ' + s2Ms + ' ms',
  S2mid.state === 'preparing' && /Preparing street shapes for Vaughan… \d+ s/.test(S2mid.hint) && S2mid.btn === 'Cancel' && s2Ready === true && s2Ms >= 44000);
await jExitDiscard();
// S3: the failure matrix on the GRID - every cell failing ends honestly
const failGrid = async (mode, status) => {
  await ev(`window.__jMode = '` + mode + `'` + (status ? `; window.__jStatus = ` + status : ''));
  const gc0 = await geoCount();
  await jEnter();
  const r = await poll(`crPrepState === 'failed' || crPrepState === 'degraded'`, 30000).catch(() => false);
  const F = await J(`({ state: crPrepState, kind: crPrepFail && crPrepFail.kind, status: crPrepFail && crPrepFail.status, remark: crPrepFail && crPrepFail.remark, boxes: crCov ? crCov.boxes.length : -1, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent })`);
  const reqs = (await geoCount()) - gc0;
  await jExitDiscard();
  await ev(`window.__jMode = 'healthy'`);
  return { r, F, reqs };
};
const G1m = await failGrid('status', 503);
ok('J4a (failure matrix, grid) HTTP 503 from both instances for EVERY cell -> FAILED kind=error (503), no cell committed, bounded requests (' + G1m.reqs + ' for 4 cells x 2 tries x 2 hosts max 16), Retry offered | ' + JSON.stringify(G1m.F),
  G1m.r && G1m.F.state === 'failed' && G1m.F.kind === 'error' && G1m.F.status === 503 && G1m.F.boxes === 0 && G1m.reqs > 0 && G1m.reqs <= 16 && G1m.F.btn === 'Retry');
const G2m = await failGrid('status', 429);
ok('J4b (failure matrix, grid) HTTP 429 for every cell -> FAILED kind=error (429), no coverage | ' + JSON.stringify(G2m.F),
  G2m.r && G2m.F.state === 'failed' && G2m.F.kind === 'error' && G2m.F.status === 429 && G2m.F.boxes === 0);
const G3m = await failGrid('remark');
ok('J4c (failure matrix, grid) HTTP 200 WITH an Overpass remark AND elements attached, for every cell -> FAILED kind=error: partial output is never promoted | ' + JSON.stringify(G3m.F),
  G3m.r && G3m.F.state === 'failed' && G3m.F.kind === 'error' && String(G3m.F.remark || '').indexOf('fixture remark') >= 0 && G3m.F.boxes === 0);
const G4m = await failGrid('badjson');
ok('J4d (failure matrix, grid) malformed JSON for every cell -> FAILED kind=badjson, no coverage | ' + JSON.stringify(G4m.F),
  G4m.r && G4m.F.state === 'failed' && G4m.F.kind === 'badjson' && G4m.F.boxes === 0);
const G5m = await failGrid('dense');
ok('J8 (dense, grid) a >2 MB payload for every cell is cut off WHILE streaming -> FAILED kind=dense with the too-dense hint, no coverage | ' + JSON.stringify(G5m.F),
  G5m.r && G5m.F.state === 'failed' && G5m.F.kind === 'dense' && G5m.F.hint.indexOf('too dense') >= 0 && G5m.F.boxes === 0);
await jEnter();
await poll(`crPrepState === 'ready'`, 20000);
ok('J4e after the failure matrix, a healthy city load still succeeds in a fresh session (no failure latches)', true);
await jExitDiscard();
// S4: silence + the stalled body, on the fallback box with shrunk budgets
const failBox = async mode => {
  await jEnter();
  await poll(`crPrepState === 'ready'`, 20000);
  await ev(`window.__jMode = '` + mode + `'`);
  await ev(`window.__savedTiming = [CR_TIMING.budgetMs, CR_TIMING.attempt1Ms]; CR_TIMING.budgetMs = 2500; CR_TIMING.attempt1Ms = 1500`);
  const gc0 = await geoCount();
  const t0 = Date.now();
  await ev(`crStartPrep({ lat: 43.9, lng: -79.56 })`);
  const r = await poll(`crPrepState === 'failed'`, 20000).catch(() => false);
  const el = Date.now() - t0;
  const F = await J(`({ state: crPrepState, kind: crPrepFail && crPrepFail.kind, fromGrid: crFailFromGrid })`);
  const reqs = (await geoCount()) - gc0;
  await ev(`CR_TIMING.budgetMs = window.__savedTiming[0]; CR_TIMING.attempt1Ms = window.__savedTiming[1]`);
  await ev(`window.__jMode = 'healthy'`);
  await ev(`document.getElementById('crHintBtn').click()`); // Retry: the BOX again (not a grid resume - crFailFromGrid must say so)
  const rec = await poll(`crPrepState === 'ready'`, 20000).catch(() => false);
  await jExitDiscard();
  return { r, F, el, reqs, rec };
};
const FB1 = await failBox('silent');
ok('J2b (latency) both instances SILENT on the fallback box: terminal honest failure (kind=unreachable) inside the budget - shrunk to 2.5 s through the CR_TIMING seam; the budget STRUCTURE is what is graded, elapsed ' + FB1.el + ' ms, ' + FB1.reqs + ' bounded attempts; Retry then re-runs the BOX and recovers | ' + JSON.stringify(B1.F),
  FB1.r && FB1.F.kind === 'unreachable' && FB1.F.fromGrid === false && FB1.el < 11000 && FB1.reqs === 2 && FB1.rec === true);
const FB2 = await failBox('stallbody');
ok('J3 (body stall, CG-PF-03) headers land instantly but the body never finishes: the deadline still fires THROUGH body consumption - FAILED kind=unreachable in ' + FB2.el + ' ms instead of hanging forever | ' + JSON.stringify(B2.F),
  FB2.r && FB2.F.kind === 'unreachable' && FB2.el < 11000 && FB2.reqs === 2);
// S5: cancel keeps the loaded parts; resume fetches ONLY the missing; the saved city then loads with ZERO requests
await ev(`window.__jDelayMs = 2500`);
await jEnter();
await sleep(900);
const abS5a = await ev(`window.__jAborted`);
await ev(`document.getElementById('crHintBtn').click()`); // Cancel
await sleep(300);
const abS5b = await ev(`window.__jAborted`);
const S5a = await J(`({ state: crPrepState, done: crGrid ? crGrid.cells.filter(c => c.state === 'done').length : -1, total: crGrid ? crGrid.cells.length : -1, boxes: crCov ? crCov.boxes.length : -1, btn: document.getElementById('crHintBtn').textContent })`);
const gcS5a = await geoCount();
await sleep(1500);
const gcS5b = await geoCount();
await ev(`window.__jDelayMs = 0`);
await ev(`document.getElementById('crHintBtn').click()`); // Resume
const s5Ready = await poll(`crPrepState === 'ready'`, 20000).catch(() => false);
const gcS5c = await geoCount();
ok('J6a (race: cancel + resume) Cancel mid-load aborts the in-flight downloads themselves (aborts ' + abS5a + ' -> ' + abS5b + ', CG-PF-10), stops scheduling (requests frozen ' + gcS5a + ' -> ' + gcS5b + '), and KEEPS the parts already loaded; Resume then fetches ONLY the missing parts (' + (gcS5c - gcS5b) + ' requests for ' + (S5a.total - S5a.done) + ' missing) | ' + JSON.stringify(S5a),
  abS5b > abS5a && gcS5b === gcS5a && S5a.done >= 0 && S5a.boxes === S5a.done && s5Ready === true && (gcS5c - gcS5b) === (S5a.total - S5a.done));
await jExitDiscard();
const gcS5d = await geoCount();
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan();
const s5Cached = await poll(`crPrepState === 'ready'`, 15000).catch(() => false);
const gcS5e = await geoCount();
const S5b = await J(`({ fromCache: crGrid && crGrid.fromCache, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent })`);
ok('J11a (persistence) re-picking the completed city loads it from the ON-DEVICE CACHE: ready with ZERO new geometry requests (' + gcS5d + ' -> ' + gcS5e + '), the hint says when it was loaded, Refresh is offered | ' + JSON.stringify(S5b),
  s5Cached === true && gcS5e === gcS5d && S5b.fromCache === true && S5b.hint.indexOf('loaded') >= 0 && S5b.btn === 'Refresh');
await jExitDiscard();
// S6: exit mid-load - the downloads stop; nothing lands in the next session
await jWipe();
await ev(`window.__jDelayMs = 2500`);
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan();
await poll(`!!(typeof crGrid !== 'undefined' && crGrid && crGrid.ops && crGrid.ops.size >= 1)`, 10000).catch(() => false); // the downloads must actually be IN FLIGHT before the exit - the grid's first fetch waits on the cache read, and an exit that lands before it has nothing to abort (the invariant is that exit stops live downloads, graded on live downloads)
await sleep(300);
const abS6a = await ev(`window.__jAborted`);
await jExitDiscard();
await sleep(300);
const abS6b = await ev(`window.__jAborted`);
await ev(`window.__jDelayMs = 0`);
await jEnter();
const S6 = await J(`({ streets: draft ? Object.keys(draft.roads).length : -1, pend: Object.keys(crPending).length, busy: crPickBusy })`);
const s6Ready = await poll(`crPrepState === 'ready' || crPrepState === 'degraded'`, 20000).catch(() => false);
ok('J6b (race: exit) leaving mid-load aborts the downloads themselves (aborts ' + abS6a + ' -> ' + abS6b + ', CG-PF-10); the next session opens clean (no draft streets, no pending, picker free) and its own load proceeds | ' + JSON.stringify(S6),
  abS6b > abS6a && S6.streets === 0 && S6.pend === 0 && S6.busy === false && s6Ready === true);
await jExitDiscard();
// S7: a city switch supersedes the old grid - its late cells land nowhere
await jWipe();
await ev(`window.__jMode = 'supersede'`);
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan(); // Vaughan's cells: delayed 3 s by the supersede profile
await sleep(500);
await ev(`crPickCity({ display_name: 'Toronto, Ontario, Canada', lat: '43.6532', lon: '-79.3832', boundingbox: ['43.5810', '43.8555', '-79.6393', '-79.1150'], class: 'place', type: 'city', address: { city: 'Toronto', state: 'Ontario', country: 'Canada' } })`);
const s7Ready = await poll(`crPrepState === 'ready'`, 25000).catch(() => false);
await sleep(3500); // Vaughan's delayed cells land inside this window - in the OLD grid's name only
const S7 = await J(`({ city: crCity && crCity.name, gridName: crGrid && crGrid.name, names: crCov ? Object.keys(crCov.byName) : ['<none>'], boxes: crCov ? crCov.boxes.length : -1, cells: crGrid ? crGrid.cells.length : -1 })`);
await ev(`window.__jMode = 'healthy'`);
ok('J6c (race: supersede) switching city mid-load supersedes the old grid: Toronto\'s own (empty) extract commits, and Vaughan\'s late full dataset NEVER lands in it | ' + JSON.stringify(S7),
  s7Ready === true && S7.city === 'Toronto' && S7.gridName === 'Toronto' && S7.names.length === 0 && S7.boxes === S7.cells);
await jExitDiscard();
// S8: the edge chain - top-up completes Faraway; Farfaraway pends; the wider preparation sweeps it; an outside tap leaves a working remedy
await jEnter();
await poll(`crPrepState === 'ready'`, 20000);
await ev(tapRoad('Ghost Avenue', 43.91, -79.5)); // absent AND outside the city (east of it - a box there touches no fixture street)
const S8g = await J(`({ btn: document.getElementById('crHintBtn').textContent, btnOn: document.getElementById('crHintBtn').style.display !== 'none', state: crPrepState })`);
await ev(`document.getElementById('crHintBtn').click()`); // Prepare this area - at the TAP point
const s8gPrep = await poll(`crCov && crCov.boxes.some(b => 43.91 >= b.s && 43.91 <= b.n && -79.5 >= b.w && -79.5 <= b.e)`, 20000).catch(() => false);
ok('J9b (remedy works, CG-PF-09) with the city READY, a tap outside it still leaves a visible "Prepare this area" button (' + JSON.stringify(S8g) + '); tapping it prepares around the TAPPED point and the new coverage contains it | covered: ' + s8gPrep,
  S8g.btn === 'Prepare this area' && S8g.btnOn && S8g.state === 'ready' && s8gPrep === true);
const gcS8 = await geoCount();
await ev(`window.__jDelayMs = 45000`);
const ft0 = Date.now();
await ev(tapStreet('Faraway Avenue'));
const gotFar = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Faraway']`, 90000).catch(() => false);
const fMs = Date.now() - ft0;
await ev(`window.__jDelayMs = 0`);
const S8log = await geoSince(gcS8);
const farTopups = nameBodies(S8log, 'Faraway Avenue');
const S8a = await J(`({ total: draft && draft.roads['Faraway'] ? Math.round(computeStretches(draft.roads)['Faraway'].total) : -1 })`);
ok('J7a (edge rule + CG-PF-07) Faraway Avenue crosses the CITY edge: ONE targeted top-up fires with the correct grammar (way["name"="Faraway Avenue"]), its primary answer landing at a real 45 s is ACCEPTED (elapsed ' + fMs + ' ms - the verified build\'s 40 s top-up cap killed exactly this), and the street joins WHOLE (' + Math.round(farawayLen) + ' m) | top-ups: ' + farTopups.length + ', got ' + JSON.stringify(S8a),
  gotFar === true && fMs >= 44000 && farTopups.length === 1 && Math.abs(S8a.total - farawayLen) <= farawayLen * 0.03);
await ev(tapStreet('Farfaraway Avenue'));
const pendFF = await poll(`crPending['Farfaraway'] !== undefined`, 20000).catch(() => false);
const S8b = await J(`({ inDraft: !!(draft && draft.roads['Farfaraway']), pendRow: (document.getElementById('crPickList').textContent || '').indexOf('PENDING') >= 0, count: document.getElementById('crCount').textContent })`);
ok('J7b (edge rule, fail-closed) Farfaraway Avenue still reaches past the widened area after its ONE top-up: it stays PENDING - listed as pending, NOT in the draft, NOT in the count | ' + JSON.stringify(S8b),
  pendFF === true && S8b.inDraft === false && S8b.pendRow && S8b.count.indexOf('Faraway') < 0);
const S8c0 = await J(`({ btn: document.getElementById('crHintBtn').textContent, btnOn: document.getElementById('crHintBtn').style.display !== 'none' })`);
await ev(`document.getElementById('crHintBtn').click()`); // Prepare wider area - around the street's open end; the landing box SWEEPS the pending street complete (its other end is verified by a city cell)
const sweptFF = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Farfaraway']`, 25000).catch(() => false);
const S8c = await J(`({ total: draft && draft.roads['Farfaraway'] ? Math.round(computeStretches(draft.roads)['Farfaraway'].total) : -1, pend: Object.keys(crPending).length })`);
ok('J9c (remedy works, CG-PF-09) the pending street offers a working "Prepare wider area" button (' + JSON.stringify(S8c0) + '): the wider preparation lands and the street completes WHOLE (' + Math.round(farfarawayLen) + ' m) by the sweep - pending cleared, no re-tap needed | ' + JSON.stringify(S8c),
  S8c0.btn === 'Prepare wider area' && S8c0.btnOn && sweptFF === true && Math.abs(S8c.total - farfarawayLen) <= farfarawayLen * 0.03 && S8c.pend === 0);
await ev(tapStreet('Edgewater Avenue'));
const gotEdge2 = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Edgewater']`, 15000).catch(() => false);
const S8d = await J(`({ total: draft && draft.roads['Edgewater'] ? Math.round(computeStretches(draft.roads)['Edgewater'].total) : -1 })`);
ok('J7c (whole-city contrast) Edgewater Avenue - the OLD box design\'s edge case, completed only by a top-up - now resolves LOCALLY from the city extract (' + Math.round(edgewaterLen) + ' m), no top-up at all | ' + JSON.stringify(S8d),
  gotEdge2 === true && Math.abs(S8d.total - edgewaterLen) <= edgewaterLen * 0.03);
await jExitDiscard();
// S9: the top-up-after-exit race
await jEnter();
await poll(`crPrepState === 'ready'`, 20000);
await ev(`window.__jDelayMs = 2500`);
await ev(tapStreet('Faraway Avenue')); // edge street: its top-up is now in flight
await sleep(300);
await ev(`exitCreate()`);
await sleep(3200); // the top-up completes into a closed session
await ev(`window.__jDelayMs = 0`);
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan();
const S9 = await J(`({ pend: Object.keys(crPending).length, streets: draft ? Object.keys(draft.roads).length : -1, busy: crPickBusy })`);
ok('J6d (race: late top-up) a top-up completing after exit changes nothing: the next session opens clean (no pending, no draft streets, picker free) | ' + JSON.stringify(S9),
  S9.pend === 0 && S9.streets === 0 && S9.busy === false);
await jExitDiscard();
// S10: the adversarial junction, against the shipped resolver (CG-PF-08)
const ADV = await ev(`(() => { const els = [
  { type: 'way', id: 1, tags: { name: 'Main Road' }, geometry: [{ lat: 0.5, lon: 0.5 }, { lat: 0.5, lon: 2 }] },
  { type: 'way', id: 2, tags: { name: 'Cross Road' }, geometry: [{ lat: 0.6, lon: 0.6 }, { lat: 0.5, lon: 2 }] }
]; const keep = crCov; crCov = crCovFromWays(crIndexWays(els, {}), [{ s: 0, w: 0, n: 1, e: 1 }]); const r = crResolve('Main Road', { lat: 0.5, lng: 0.75 }); crCov = keep; return r.status; })()`);
ok('J8b (adversarial junction, CG-PF-08) a cross street touching an out-of-coverage endpoint does NOT certify the street complete: resolve returns edge, not ok | got ' + ADV, ADV === 'edge');
// S11: a name-only city (the lookup failed) still gets the fallback box - and its dense remedy
await ev(`window.__jMode = 'cityfail'`);
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
await ev(`document.getElementById('crCityLast').click()`); // the lookup fails in this profile: the remembered NAME alone scopes the creation
const s11Pick = await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick' && crGrid === null`, 10000).catch(() => false);
await ev(`window.__jMode = 'dense'`);
await ev(`map.jumpTo({ center: [-79.574666, 43.798972], zoom: 15 })`);
await sleep(600);
await ev(`document.getElementById('crHintBtn').click()`); // Prepare this area - the box, which the dense profile refuses
const s11Dense = await poll(`crPrepState === 'failed' && crPrepFail && crPrepFail.kind === 'dense'`, 20000).catch(() => false);
const S11a = await J(`({ btn: document.getElementById('crHintBtn').textContent, grid: !!crGrid })`);
await ev(`map.jumpTo({ center: [-79.56, 43.815], zoom: 13 })`);
const gcS11 = await geoCount();
await ev(`window.__jMode = 'healthy'`);
await ev(`document.getElementById('crHintBtn').click()`);
const s11Ready = await poll(`crPrepState === 'ready'`, 20000).catch(() => false);
const S11log = await geoSince(gcS11);
const s11Body = batchBodies(S11log)[0] || '';
const s11M = /\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(s11Body);
ok('J9/J8c (no-city fallback + dense remedy) with the city lookup DOWN, the remembered name alone still reaches the pick stage with NO grid (' + s11Pick + '); Prepare-this-area runs the fallback box; a dense refusal leaves a working "Prepare this area" button (' + JSON.stringify(S11a) + ') - moving the map and tapping it prepares the NEW centre\'s box (bounds ' + (s11M ? s11M.slice(1).join(',') : '?') + ') | dense failed: ' + s11Dense + ', ready after remedy: ' + s11Ready,
  s11Pick === true && s11Dense === true && S11a.btn === 'Prepare this area' && S11a.grid === false && s11Ready === true && !!s11M && Math.abs(+s11M[1] - 43.788054) < 0.002 && Math.abs(+s11M[3] - 43.841946) < 0.002);
await jExitDiscard();
// S12: the quota/cap degradation is DISCLOSED, and the session still works
await jWipe();
await ev(`CR_TIMING.cityCapBytes = 10`); // a cap no real city fits: the save must be refused, out loud
await jEnter();
const s12Ready = await poll(`crPrepState === 'ready'`, 20000).catch(() => false);
await sleep(600); // the serialized cache writes settle
const S12 = await J(`({ note: crCacheNote, hint: document.getElementById('createHint').textContent })`);
const s12Rec = await ev(`crIdbGet('Vaughan').then(r => r ? Object.keys(r.cells || {}).length : -1)`);
await ev(`CR_TIMING.cityCapBytes = 60 * 1024 * 1024`);
ok('J11b (cache cap, amendment C) with the storage cap shrunk below any city, the load still completes - and the refusal is DISCLOSED in the hint ("Couldn\'t save Vaughan on this phone"), with nothing silently half-saved (record cells: ' + s12Rec + ') | ' + JSON.stringify(S12),
  s12Ready === true && S12.note.indexOf('Couldn’t save') === 0 && S12.hint.indexOf('Couldn’t save Vaughan') >= 0 && s12Rec <= 0);
await jExitDiscard();
// S13: the last-city lookup race (CG-PF-11), end to end through the real UI
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
const hasLastJ = await poll(`document.getElementById('crCityLast').style.display !== 'none'`, 5000).catch(() => false);
await ev(`window.__jCityHold = true`);
await ev(`document.getElementById('crCityLast').click()`); // the held lookup starts
await sleep(300);
await ev(`(() => { const i = document.getElementById('crCityInput'); i.value = 'toronto'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 1`, 10000);
await ev(`document.querySelector('#crCityResults .routeRow').click()`);
await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 10000);
await sleep(4500); // the held Vaughan lookup lands inside this window
await ev(`window.__jCityHold = false`);
const J10 = await J(`({ city: crCity && crCity.name, area: draft && draft.area, stage: crStage })`);
ok('J10 (last-city race, CG-PF-11) the remembered-city button is offered (' + hasLastJ + '); its lookup held 4 s while Toronto is searched and picked - the late Vaughan answer CANNOT overwrite the session: city and draft area stay Toronto | ' + JSON.stringify(J10),
  hasLastJ === true && J10.city === 'Toronto' && J10.area === 'Toronto' && J10.stage === 'pick');
await jExitDiscard();

// ---------- (e) the CSP seam: the app's real calls under the real stamped policy (Beta 1.119) ----------
// A throwaway copy of the current source, stamped by the repo's own tool
// (the single source of the policy, exactly as drive116 stamps), is booted
// fresh: window.fetch is NEVER stubbed on this page. The app's actual
// crSearch and fetchStreetGeometry are fired at their real URLs while the
// page's securitypolicyviolation events and the CDP log are watched for a
// refusal naming either host. Beta 1.121: the geometry call fired here is
// the preparation's own path (crAreaQL's batch query through
// crOverpassFetch) - fetchStreetGeometry no longer exists. (The CDP Fetch-interception form - pause the
// request, fulfil it with the fixture payloads, watch the street land in
// the draft - cannot run inside this drive: the shared harness owns
// paused-request fulfilment and answers every paused request with a
// body-less Node fetch of its URL, which cannot return Overpass data for
// the app's POST. That form was exercised in a standalone rig instead -
// see beta1/work/csp-fix-1119/. What ships here is the deterministic half
// of the seam: a policy-blocked call announces itself by name, instantly.)
const REPO_ROOT_E = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TMP_PAGE_E = path.join(REPO_ROOT_E, 'src', '.csp-drive150.html');
fs.copyFileSync(path.join(REPO_ROOT_E, 'src', 'tracker-source.html'), TMP_PAGE_E);
execFileSync('python3', [path.join(REPO_ROOT_E, 'scripts', 'csp_stamp.py'), 'apply', TMP_PAGE_E], { stdio: 'pipe' });
await send('Log.enable', {}, S);
await send('Page.navigate', { url: 'file://' + TMP_PAGE_E }, S);
await sleep(800);
await ev(`localStorage.clear(); location.reload(); true`);
await sleep(500);
await poll(`!!document.getElementById('ver')`, 20000);
await bootThrough(ev, poll);
const polE = await ev(`(function(){ const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]'); return m ? m.getAttribute('content') : ''; })()`);
const csTokens = (() => { const d = (polE || '').split(';').map(s => s.trim()).find(s => s === 'connect-src' || s.indexOf('connect-src ') === 0); return d ? d.split(/\s+/) : []; })();
ok('E1 (CSP seam) the stamped page\'s connect-src names https://nominatim.openstreetmap.org (the create-flow search origin)', csTokens.includes('https://nominatim.openstreetmap.org'));
ok('E2 (CSP seam) the stamped page\'s connect-src names https://overpass-api.de (the create-flow geometry origin)', csTokens.includes('https://overpass-api.de'));
ok('E2b (CSP seam) the stamped page\'s connect-src names https://overpass.kumi.systems (the create-flow geometry FALLBACK, Beta 1.120)', csTokens.includes('https://overpass.kumi.systems'));
await ev(`window.__cspEv = []; document.addEventListener('securitypolicyviolation', e => { window.__cspEv.push(String(e.blockedURI || '') + ' | ' + String(e.violatedDirective || '')); }); true`);
await ev(`document.getElementById('crSearchInput').value = 'Bordeaux Drive'; crSearch(); true`);
await sleep(5000);
const evAfterSearch = await ev(`window.__cspEv.slice()`);
const logAfterSearch = consoleLog.filter(c => /Refused to|Content Security Policy/i.test(c.text || '') && (c.text || '').includes('nominatim.openstreetmap.org')).length;
const evHitsSearch = (Array.isArray(evAfterSearch) ? evAfterSearch : []).filter(u => u.includes('nominatim.openstreetmap.org')).length;
ok('E3 (CSP seam) the app\'s real search call (crSearch -> nominatim) is NOT refused by the page\'s own policy (violation events ' + evHitsSearch + ', console refusals ' + logAfterSearch + ')', evHitsSearch === 0 && logAfterSearch === 0);
await ev(`window.__e4 = null; crOverpassFetch(crAreaQL({ s: 43.77, w: -79.61, n: 43.83, e: -79.54 }, 30), 4000, 2000, null).then(r => { window.__e4 = r ? (r.ok ? 'ok' : r.kind) : 'null'; }, () => { window.__e4 = 'threw'; }); true`);
await sleep(5000);
const evAfterGeo = await ev(`window.__cspEv.slice()`);
const logAfterGeo = consoleLog.filter(c => /Refused to|Content Security Policy/i.test(c.text || '') && (c.text || '').includes('overpass-api.de')).length;
const evHitsGeo = (Array.isArray(evAfterGeo) ? evAfterGeo : []).filter(u => u.includes('overpass-api.de')).length;
ok('E4 (CSP seam) the app\'s real geometry call (the preparation batch: crAreaQL -> crOverpassFetch -> overpass) is NOT refused by the page\'s own policy (violation events ' + evHitsGeo + ', console refusals ' + logAfterGeo + ')', evHitsGeo === 0 && logAfterGeo === 0);
try { fs.rmSync(TMP_PAGE_E, { force: true }); } catch (e) {}

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
