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
// before the fix (beta1/work/create-prep-1121/).
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
const TAP_POINTS = { 'Bordeaux Drive': { lat: 43.798972, lng: -79.574666 }, 'Alderson Avenue': { lat: 43.8000667, lng: -79.573051 }, 'Edgewater Avenue': { lat: 43.8100, lng: -79.5750 }, 'Faraway Avenue': { lat: 43.8150, lng: -79.5600 } };
// Beta 1.121: Door 2 now opens the CITY pane - this helper walks it
// (type the city, wait for the populated-place results, pick Vaughan,
// land in the pick stage) and reports what it saw for the checks.
const pickCityVaughan = async () => {
  const pane = await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
  await ev(`(() => { const i = document.getElementById('crCityInput'); i.value = 'Vaughan'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rows = await poll(`document.querySelectorAll('#crCityResults .rmBtn').length === 1`, 10000).catch(() => false);
  const first = rows === true ? await ev(`(document.querySelector('#crCityResults .rmBtn') || {}).textContent || ''`) : '';
  if (rows === true) await ev(`document.querySelector('#crCityResults .rmBtn').click()`);
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
ok('A2c (Beta 1.121) the search pick ANCHORED the area preparation (anchor rule (a)): the extract is ready and holds both fixture streets - taps from here resolve locally | ' + JSON.stringify(A2c),
  A2c.state === 'ready' && A2c.cov && A2c.names.join() === 'Alderson Avenue,Bordeaux Drive');
await ev(installFeatureStub);
await ev(tapNothing);
await sleep(400);
const A2b = await J(`({ toast: document.getElementById('toast').textContent, streets: draft ? Object.keys(draft.roads).length : -1 })`);
ok('A2b a tap with no road feature under it says so and adds nothing | toast: ' + A2b.toast, A2b.toast.indexOf('No road there') >= 0 && A2b.streets === 0);
await ev(tapStreet('Bordeaux Drive'));
const gotB = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 20000);
ok('A3 tapping Bordeaux Drive (fixture roads feature through the real click handler) adds it from the prepared extract', gotB === true);
const A4 = await J(`({ streets: Object.keys(draft.roads), mains: draft.mains.size, count: document.getElementById('crCount').textContent, chip: (document.querySelector('#crPickList .crChip') || {}).textContent || '', total: Math.round(computeStretches(draft.roads)['Bordeaux'].total), src: (map.getSource('crDraft').serialize().data.features || []).length })`);
ok('A4 Bordeaux joined the draft as a SECONDARY (2ND chip, 0 mains) with its shape drawn on the draft overlay | ' + JSON.stringify(A4),
  A4.streets.length === 1 && A4.mains === 0 && A4.count.indexOf('1 streets') === 0 && A4.chip === '2ND' && A4.src === 1);
ok('A5 the fetched Bordeaux length matches the fixture geometry (' + Math.round(fixtureLen('Bordeaux Drive')) + ' m) within 2% | got ' + A4.total,
  Math.abs(A4.total - fixtureLen('Bordeaux Drive')) <= fixtureLen('Bordeaux Drive') * 0.02);
await ev(tapStreet('Alderson Avenue'));
const gotA = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Alderson']`, 20000);
ok('A5b tapping Alderson Avenue adds it too', gotA === true);
const A6 = await J(`({ streets: Object.keys(draft.roads).sort(), count: document.getElementById('crCount').textContent, ald: Math.round(computeStretches(draft.roads)['Alderson'].total) })`);
ok('A6 Alderson Avenue tapped and added (2 streets); its stitched length matches the 5-way fixture (' + Math.round(fixtureLen('Alderson Avenue')) + ' m) within 3% | ' + JSON.stringify(A6),
  A6.streets.length === 2 && A6.count.indexOf('2 streets') === 0 && Math.abs(A6.ald - fixtureLen('Alderson Avenue')) <= fixtureLen('Alderson Avenue') * 0.03);
await ev(`(() => { const rows = [...document.querySelectorAll('#crPickList .crRow')]; const row = rows.find(r => r.querySelector('.crName').textContent === 'Bordeaux'); row.querySelector('.crChip').click(); return true; })()`);
const A7 = await J(`({ mains: [...draft.mains], count: document.getElementById('crCount').textContent })`);
ok('A7 flipping Bordeaux to MAIN updates the count line (2 streets · 1 mains)', A7.mains.length === 1 && A7.mains[0] === 'Bordeaux' && A7.count.indexOf('1 mains') > 0);
await ev(`document.getElementById('crDoneBtn').click()`);
const A8 = await J(`({ stage: crStage, pv: document.getElementById('previewSheet').classList.contains('on'), bar: document.getElementById('createBar').classList.contains('on'), rows: document.querySelectorAll('#pvList .crRow').length, pvCount: document.getElementById('pvCount').textContent })`);
ok('A8 Done lands in the shared preview ("Is this correct?") with both streets and the count', A8.stage === 'preview' && A8.pv && !A8.bar && A8.rows === 2 && A8.pvCount.indexOf('2 streets') === 0);
await ev(`document.getElementById('pvSaveBtn').click()`);
await poll(`document.getElementById('rmNamePane').classList.contains('on')`, 10000);
const A9 = await J(`({ name: document.getElementById('crNameInput').value, area: document.getElementById('crAreaInput').value, summary: document.getElementById('crNameSummary').textContent })`);
ok('A9 name-it is its own step: area pre-filled from the search (Vaughan), summary reads 2 streets · 1 mains | ' + JSON.stringify(A9),
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
ok('B2 "+ Add a street" reopens the picker in add mode (Done reads "back to check")', B2.stage === 'pick' && B2.bar && B2.doneLbl.indexOf('back to check') >= 0);
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
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await pickCityVaughan();
await ev(`crStartPrep({ lat: 43.798972, lng: -79.574666 })`);
await sleep(150);
const F0 = await J(`({ state: crPrepState, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent, btnOn: document.getElementById('crHintBtn').style.display !== 'none' })`);
ok('F1 while the preparation is in flight, the hint carries the wait ("Preparing street shapes for Vaughan… N s") with a Cancel button beside it | ' + JSON.stringify(F0),
  F0.state === 'preparing' && /Preparing street shapes for Vaughan… \d+ s/.test(F0.hint) && F0.btn === 'Cancel' && F0.btnOn);
const fFailed = await poll(`crPrepState === 'failed'`, 15000).catch(() => false);
const F1 = await J(`({ state: crPrepState, kind: crPrepFail && crPrepFail.kind, status: crPrepFail && crPrepFail.status, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent, cov: !!crCov, streets: draft ? Object.keys(draft.roads).length : -1, busy: crPickBusy })`);
ok('F2 a shape service that refuses on BOTH instances (503) ends FAILED with the honest reason persistent in the hint, a Retry button, NO coverage committed, nothing added, and the picker free (the 1.119/1.120 wedge cannot recur at the preparation layer) | ' + JSON.stringify(F1),
  fFailed === true && F1.kind === 'error' && F1.status === 503 && F1.hint.indexOf('answered with an error') >= 0 && F1.btn === 'Retry' && F1.cov === false && F1.streets === 0 && F1.busy === false);
await ev(`window.__fHealthy = true`);
await ev(`document.getElementById('crHintBtn').click()`); // Retry
const fReady = await poll(`crPrepState === 'ready'`, 15000).catch(() => false);
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

// ---------- (j) the preparation battery (Beta 1.121, CG-PF-06) ----------
// The network seam, controlled at fetch level with the app's REAL request
// path intact (crStartPrep -> crQL -> crOverpassFetch -> fetch). The stub
// below answers from ONE dataset, filtered by the request's own decoded
// bbox - the honest seam for both the batch extract and the per-street
// top-up - and records every geometry request body in __geoLog. The
// dataset adds two synthetic streets to the real fixture: Edgewater
// Avenue crosses the extract's outer edge and is completed by its ONE
// top-up (a continuation way + a junction way wait in the wider box);
// Faraway Avenue crosses and is NOT completed even by the top-up, so it
// must stay PENDING. Profiles (window.__jMode): healthy / throw / silent
// / status / remark / badjson / dense / stallbody / supersede, plus
// __jDelayMs for honest latency. Delays honour the AbortSignal, as a
// real fetch does - a stub that ignores aborts grades nothing (the red
// drive's first run proved exactly that trap).
const JDATA = (() => {
  const byId = {};
  for (const k of Object.keys(FIXTURE.overpass)) for (const e of FIXTURE.overpass[k]) byId[e.id] = { name: k, geometry: e.geometry };
  const seg = (id, name, pts) => { byId[id] = { name, geometry: pts.map(p => ({ lat: p[0], lon: p[1] })) }; };
  seg(9001, 'Edgewater Avenue', [[43.8000, -79.5750], [43.8100, -79.5750], [43.8200, -79.5750]]);
  seg(9002, 'Edgewater Avenue', [[43.8200, -79.5750], [43.8285, -79.5750]]);
  seg(9004, 'Edgewater Avenue', [[43.8285, -79.5750], [43.8360, -79.5750]]);
  seg(9003, 'Northgate Crescent', [[43.8285, -79.5800], [43.8285, -79.5750], [43.8285, -79.5700]]);
  seg(9010, 'Faraway Avenue', [[43.8050, -79.5600], [43.8200, -79.5600], [43.8500, -79.5600]]);
  return { byId };
})();
const edgewaterLen = [9001, 9002, 9004].reduce((a, id) => a + wayLen(JDATA.byId[id].geometry), 0);
const installStubJ = `(() => {
  const DATA = ${JSON.stringify(JDATA)};
  const CITY = ${JSON.stringify([CITY_FIXTURE[0]])};
  const prev = window.fetch.bind(window);
  window.__jMode = 'healthy'; window.__jDelayMs = 0; window.__jStatus = 503; window.__geoLog = [];
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
  const delayed = (make, ms, opts) => new Promise((res, rej) => { const to = setTimeout(() => res(make()), ms); const s = opts && opts.signal; if (s) s.addEventListener('abort', () => { clearTimeout(to); const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
  const hang = opts => new Promise((res, rej) => { const s = opts && opts.signal; if (s) s.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('nominatim.openstreetmap.org') >= 0 && u.indexOf('featuretype=city') >= 0) return Promise.resolve(new Response(JSON.stringify(CITY), { status: 200, headers: { 'Content-Type': 'application/json' } }));
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
      if (mode === 'supersede') { const box = boxOf(raw); const isA = box && Math.abs((box.s + box.n) / 2 - 43.798972) < 0.002; return delayed(() => json({ elements: isA ? elsFor(raw) : [] }), 3000, opts); }
      const d = window.__jDelayMs || 0;
      const make = () => json({ elements: elsFor(raw) });
      return d > 0 ? delayed(make, d, opts) : Promise.resolve(make());
    }
    return prev(url, opts);
  };
  return true;
})()`;
const jEnter = async () => { await ev(`openRouteMenu()`); await ev(`document.getElementById('rmCreate').click()`); await ev(`document.getElementById('crDoorManual').click()`); await pickCityVaughan(); };
const jExitDiscard = async () => { await ev(`document.getElementById('crExit').click()`); await sleep(400); await ev(`(() => { const y = document.getElementById('crModalYes'); if (y && !document.getElementById('crModal').classList.contains('hidden')) y.click(); return true; })()`); await sleep(400); };
const geoCount = async () => await ev(`(window.__geoLog || []).length`);
await ev(installStubJ);
await ev(installFeatureStub);
await jEnter();
await ev(`window.__jDelayMs = 45000`);
const jt0 = Date.now();
await ev(`crStartPrep({ lat: 43.798972, lng: -79.574666 })`);
await sleep(8000);
const J2aMid = await J(`({ state: crPrepState, hint: document.getElementById('createHint').textContent, btn: document.getElementById('crHintBtn').textContent, btnOn: document.getElementById('crHintBtn').style.display !== 'none' })`);
ok('J2a (latency) 8 s into a preparation whose answer needs 45 s: still preparing, the hint ticks the elapsed seconds, Cancel is offered | ' + JSON.stringify(J2aMid),
  J2aMid.state === 'preparing' && /Preparing street shapes for Vaughan… [5-9] s/.test(J2aMid.hint) && J2aMid.btn === 'Cancel' && J2aMid.btnOn);
const jReady = await poll(`crPrepState === 'ready'`, 80000).catch(() => false);
const J2aMs = Date.now() - jt0;
ok('J2a (latency) a CORRECT answer arriving at a real 45 s (the measured overpass-api.de profile) SUCCEEDS inside the 120 s budget - 1.120 killed it at its 40 s attempt cap | elapsed ' + J2aMs + ' ms',
  jReady === true && J2aMs >= 44000);
await ev(`window.__jDelayMs = 0`);
const JLOG = await ev(`window.__geoLog.slice()`);
const batchBody = (Array.isArray(JLOG) ? JLOG : []).map(x => x.body).find(b => b.indexOf('["highway"]') >= 0) || '';
const bm = /^\[out:json\]\[timeout:\d+\];way\["name"\]\["highway"\]\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\);out geom;$/.exec(batchBody);
const expOuter = { s: 43.798972 - 3000 / 111320, w: -79.574666 - 3000 / 80386, n: 43.798972 + 3000 / 111320, e: -79.574666 + 3000 / 80386 };
ok('J1 (grammar) the batch request body DECODED from the wire is exactly [out:json][timeout:N];way["name"]["highway"](outer box);out geom; with the fixed footprint\'s bounds (inner 2 km + 1 km buffer around the anchor) | body: ' + batchBody.slice(0, 130),
  !!bm && Math.abs(+bm[1] - expOuter.s) < 0.002 && Math.abs(+bm[2] - expOuter.w) < 0.002 && Math.abs(+bm[3] - expOuter.n) < 0.002 && Math.abs(+bm[4] - expOuter.e) < 0.002);
const malformedSeen = (Array.isArray(JLOG) ? JLOG : []).some(x => /way\["name="/.test(x.body));
ok('J1b (grammar) NO recorded request carries the 1.118-1.120 malformed filter (the equals sign inside the quoted key)', malformedSeen === false);
await ev(`window.__jMode = 'throw'`);
const gcBefore = await geoCount();
await ev(tapStreet('Bordeaux Drive'));
await ev(tapStreet('Alderson Avenue'));
const gotJ5 = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux'] && !!draft.roads['Alderson']`, 15000).catch(() => false);
const gcAfter = await geoCount();
const J5 = await J(`({ b: draft && draft.roads['Bordeaux'] ? Math.round(computeStretches(draft.roads)['Bordeaux'].total) : -1, a: draft && draft.roads['Alderson'] ? Math.round(computeStretches(draft.roads)['Alderson'].total) : -1 })`);
ok('J5 (offline after ready) with Overpass now THROWING, taps still add Bordeaux + Alderson from the extract with their fixture lengths - and fire ZERO further geometry requests (' + gcBefore + ' -> ' + gcAfter + ') | ' + JSON.stringify(J5),
  gotJ5 === true && gcAfter === gcBefore && Math.abs(J5.b - fixtureLen('Bordeaux Drive')) <= fixtureLen('Bordeaux Drive') * 0.02 && Math.abs(J5.a - fixtureLen('Alderson Avenue')) <= fixtureLen('Alderson Avenue') * 0.03);
await ev(`window.__jMode = 'healthy'`);
await jExitDiscard();
// (j) the edge rule: one top-up completes Edgewater; Faraway stays pending
await jEnter();
await ev(`crStartPrep({ lat: 43.798972, lng: -79.574666 })`);
await poll(`crPrepState === 'ready'`, 15000);
const gcJ7 = await geoCount();
await ev(tapStreet('Edgewater Avenue'));
const gotEdge = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Edgewater']`, 20000).catch(() => false);
const J7log = await ev(`window.__geoLog.slice(` + gcJ7 + `)`);
const topBodies = (Array.isArray(J7log) ? J7log : []).map(x => x.body).filter(b => b.indexOf('Edgewater') >= 0);
const J7 = await J(`({ total: draft && draft.roads['Edgewater'] ? Math.round(computeStretches(draft.roads)['Edgewater'].total) : -1 })`);
ok('J7a (edge rule) Edgewater Avenue crosses the extract\'s edge: ONE targeted top-up fires with the correct grammar (way["name"="Edgewater Avenue"] over the expanded box), merges by way id, and the street joins WHOLE - stitched length ' + Math.round(edgewaterLen) + ' m across all three ways | top-ups: ' + topBodies.length + ', got ' + JSON.stringify(J7),
  gotEdge === true && topBodies.length === 1 && /\["name"="Edgewater Avenue"\]/.test(topBodies[0] || '') && Math.abs(J7.total - edgewaterLen) <= edgewaterLen * 0.03);
await ev(tapStreet('Faraway Avenue'));
const pendF = await poll(`!!crPending['Faraway']`, 20000).catch(() => false);
const J7all = await ev(`window.__geoLog.slice()`);
const farTopups = (Array.isArray(J7all) ? J7all : []).map(x => x.body).filter(b => b.indexOf('Faraway') >= 0).length;
const J7b = await J(`({ inDraft: !!(draft && draft.roads['Faraway']), pendRow: [...document.querySelectorAll('#crPickList .crRow')].some(r => r.className.indexOf('pending') >= 0 && r.textContent.indexOf('Faraway') >= 0 && r.textContent.indexOf('PENDING') >= 0), count: document.getElementById('crCount').textContent })`);
ok('J7b (edge rule, fail-closed) Faraway Avenue still reaches past the widened area after its ONE top-up (' + farTopups + ' fired): it stays PENDING - listed as pending in the pick sheet, NOT in the draft, NOT in the count | ' + JSON.stringify(J7b),
  pendF === true && J7b.inDraft === false && J7b.pendRow && J7b.count.indexOf('1 streets') === 0);
await jExitDiscard();
// (j) the failure matrix + the dense cap + silence + the stalled body
await jEnter();
const failPrep = async (mode, status) => {
  await ev(`window.__jMode = ${JSON.stringify(mode)}; window.__jStatus = ${status || 503}`);
  const before = await geoCount();
  await ev(`CR_TIMING.budgetMs = 4000; CR_TIMING.attempt1Ms = 2000`);
  const t = Date.now();
  await ev(`crStartPrep({ lat: 43.798972, lng: -79.574666 })`);
  const r = await poll(`crPrepState === 'failed'`, 15000).catch(() => false);
  const el = Date.now() - t;
  await ev(`CR_TIMING.budgetMs = 120000; CR_TIMING.attempt1Ms = 70000`);
  const after = await geoCount();
  const F = await J(`({ kind: crPrepFail && crPrepFail.kind, status: crPrepFail && crPrepFail.status, remark: crPrepFail && crPrepFail.remark, cov: !!crCov, hint: document.getElementById('createHint').textContent })`);
  return { r: r === true, el, reqs: after - before, F };
};
const M1 = await failPrep('status', 503);
ok('J4a (failure matrix) HTTP 503 from both instances -> FAILED kind=error with the status kept, exactly 2 bounded requests, no coverage committed | ' + JSON.stringify(M1), M1.r && M1.F.kind === 'error' && M1.F.status === 503 && M1.reqs === 2 && M1.F.cov === false);
const M2 = await failPrep('status', 429);
ok('J4b (failure matrix) HTTP 429 from both instances -> FAILED kind=error (429), 2 bounded requests, no coverage | ' + JSON.stringify(M2), M2.r && M2.F.kind === 'error' && M2.F.status === 429 && M2.reqs === 2 && M2.F.cov === false);
const M3 = await failPrep('remark');
ok('J4c (failure matrix) HTTP 200 WITH an Overpass remark AND elements attached -> FAILED kind=error: partial output is never promoted to ready | ' + JSON.stringify(M3), M3.r && M3.F.kind === 'error' && String(M3.F.remark || '').indexOf('fixture remark') >= 0 && M3.F.cov === false);
const M4 = await failPrep('badjson');
ok('J4d (failure matrix) malformed JSON from both instances -> FAILED kind=badjson, no coverage | ' + JSON.stringify(M4), M4.r && M4.F.kind === 'badjson' && M4.F.cov === false);
const M5 = await failPrep('dense');
ok('J8 (streaming cap) a 2.3 MB payload trips the 2 MB cap WHILE streaming -> FAILED kind=dense with the too-dense hint (prepare a smaller area is the offered remedy), no coverage | ' + JSON.stringify(M5), M5.r && M5.F.kind === 'dense' && M5.F.hint.indexOf('too dense') >= 0 && M5.F.cov === false);
const M6 = await failPrep('silent');
ok('J2b (latency) both instances SILENT: terminal honest failure (kind=unreachable) inside the budget - shrunk to 4 s here through the CR_TIMING seam; the budget STRUCTURE is what is graded, elapsed ' + M6.el + ' ms, 2 bounded attempts | ' + JSON.stringify(M6), M6.r && M6.F.kind === 'unreachable' && M6.el < 11000 && M6.reqs === 2);
const M7 = await failPrep('stallbody');
ok('J3 (body stall, CG-PF-03) headers land instantly but the body never finishes: the deadline still fires THROUGH body consumption - FAILED kind=unreachable in ' + M7.el + ' ms instead of hanging forever | ' + JSON.stringify(M7), M7.r && M7.F.kind === 'unreachable' && M7.el < 11000);
await ev(`window.__jMode = 'healthy'`);
await ev(`crStartPrep({ lat: 43.798972, lng: -79.574666 })`);
const mRec = await poll(`crPrepState === 'ready'`, 15000).catch(() => false);
ok('J4e after the failure matrix, a healthy preparation still succeeds in the same session (no failure latches)', mRec === true);
await jExitDiscard();
// (j) races: cancel / exit / supersede / top-up-after-exit
await jEnter();
await ev(`window.__jDelayMs = 3000`);
await ev(`crStartPrep({ lat: 43.798972, lng: -79.574666 })`);
await sleep(700);
await ev(`document.getElementById('crHintBtn').click()`); // Cancel
const J6a1 = await J(`({ state: crPrepState, cov: !!crCov })`);
await sleep(3200); // the cancelled answer lands inside this window - and must change nothing
const J6a2 = await J(`({ state: crPrepState, cov: !!crCov, hint: document.getElementById('createHint').textContent })`);
await ev(`window.__jDelayMs = 0`);
await ev(`crStartPrep({ lat: 43.798972, lng: -79.574666 })`);
const j6aReady = await poll(`crPrepState === 'ready'`, 15000).catch(() => false);
ok('J6a (race: cancel) Cancel mid-preparation drops the state at once; the late answer lands NOWHERE (still no coverage, no ready hint); a fresh preparation then succeeds | ' + JSON.stringify({ J6a1, J6a2 }),
  J6a1.state === 'none' && J6a1.cov === false && J6a2.state === 'none' && J6a2.cov === false && J6a2.hint.indexOf('ready') < 0 && j6aReady === true);
await jExitDiscard();
await jEnter();
await ev(`window.__jDelayMs = 2500`);
await ev(`crStartPrep({ lat: 43.798972, lng: -79.574666 })`);
await sleep(300);
await ev(`exitCreate()`);
await sleep(3000); // the answer lands while create mode is closed
await jEnter();
const J6b = await J(`({ state: crPrepState, cov: !!crCov, streets: draft ? Object.keys(draft.roads).length : -1 })`);
ok('J6b (race: exit) a preparation abandoned by exiting create mode cannot land in the NEXT session: fresh session, no coverage, empty draft | ' + JSON.stringify(J6b),
  J6b.state === 'none' && J6b.cov === false && J6b.streets === 0);
await ev(`window.__jDelayMs = 0`);
await jExitDiscard();
await jEnter();
await ev(`window.__jMode = 'supersede'`);
await ev(`crStartPrep({ lat: 43.798972, lng: -79.574666 })`); // anchor A: the full dataset after 3 s
await sleep(500);
await ev(`crStartPrep({ lat: 43.827000, lng: -79.574666 })`); // anchor B, outside A's inner box: supersedes; answers EMPTY after 3 s
const j6cReady = await poll(`crPrepState === 'ready'`, 15000).catch(() => false);
const J6c = await J(`({ anchorLat: crCov ? crCov.anchor.lat : null, names: crCov ? Object.keys(crCov.byName) : ['<none>'] })`);
ok('J6c (race: supersede) a second anchor during preparation supersedes the first: the committed coverage is B\'s (empty) extract - A\'s late full dataset never lands | ' + JSON.stringify(J6c),
  j6cReady === true && J6c.anchorLat !== null && Math.abs(J6c.anchorLat - 43.827) < 0.001 && !J6c.names.includes('Bordeaux Drive'));
await ev(`window.__jMode = 'healthy'`);
await jExitDiscard();
await jEnter();
await ev(`window.__jDelayMs = 2500`);
await ev(`crStartPrep({ lat: 43.798972, lng: -79.574666 })`);
await poll(`crPrepState === 'ready'`, 20000);
await ev(tapStreet('Faraway Avenue')); // edge street: its top-up is now in flight (2.5 s)
await sleep(300);
await ev(`exitCreate()`);
await sleep(3200); // the top-up completes into a closed session
await jEnter();
const J6d = await J(`({ pend: Object.keys(crPending).length, streets: draft ? Object.keys(draft.roads).length : -1, busy: crPickBusy })`);
ok('J6d (race: late top-up) a top-up completing after exit changes nothing: the next session opens clean (no pending, no draft streets, picker free) | ' + JSON.stringify(J6d),
  J6d.pend === 0 && J6d.streets === 0 && J6d.busy === false);
await ev(`window.__jDelayMs = 0`);
await jExitDiscard();
// (j) the no-search path: Prepare this area (anchor rule (b))
await jEnter();
await ev(`map.jumpTo({ center: [-79.574666, 43.798972], zoom: 15 })`);
await sleep(600); // the moveend hook refreshes the hint: the Prepare offer appears at picking zoom
const J9a = await J(`({ btn: document.getElementById('crHintBtn').textContent, btnOn: document.getElementById('crHintBtn').style.display !== 'none', state: crPrepState })`);
await ev(`document.getElementById('crHintBtn').click()`); // Prepare this area (anchor = map centre)
const j9Ready = await poll(`crPrepState === 'ready'`, 15000).catch(() => false);
await ev(tapStreet('Bordeaux Drive'));
const gotJ9 = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 15000).catch(() => false);
ok('J9 (no-search path) with NO street search at all: zoomed into a neighbourhood, the hint offers "Prepare this area"; one tap prepares around the map centre and street taps then resolve locally | ' + JSON.stringify(J9a),
  J9a.btn === 'Prepare this area' && J9a.btnOn && J9a.state === 'none' && j9Ready === true && gotJ9 === true);
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
