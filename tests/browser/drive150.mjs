import { launchDrive, bootThrough, finish, resetRoute } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs'; // premise derivation (Tranche 4 / T2, 2026-11-08): expectations about the shipped world derive from source - see pack-expect.mjs
// Beta 1.144 TEST-PREMISE UPDATE (Package C, DA-04): the create draft and the packs it saves now key streets by their FULL map name ('Bordeaux Drive', 'Alderson Avenue'); through 1.143 they keyed on the shortened name. Every key read in this drive (draft.roads, computeStretches, mains, markDone/streetComplete on the created route, saved-pack mains) follows the full name; DISPLAY reads (panel/preview row text, search text) still match the short form, and the photo-import fixtures' authored keys (the envelope's 'Bordeaux') are unchanged - the import keeps the file's own keys. Ship-gate completion (2026-11-07 night): the J-section fixture-street reads ('Faraway Avenue', 'Farfaraway Avenue', 'Edgewater Avenue', 'Crosscell Avenue', incl. the crPending key) and P1's saved-key expectation were missed by the first repair pass and are full-name now; the first local run exposed them as 6 failures + ~150 s of dead polls (TEST, flake log).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// Tranche 1 split (2026-11-07): sections (f)-(j) and (e) moved to
// drive166 - this drive keeps the boot + baseline and sections (a)-(d).
// The 96 checks are unchanged in name, meaning and total across the two
// drives (45 here, 51 there; census in the tranche SHIP-RECORD). The
// split buys per-drive cap headroom only - drive150 ran ~279 s against
// the 300 s per-drive CI cap - and claims no wall-clock saving.
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
const CAND_N = Object.keys(candidate).length; // premise derivation (Tranche 4 / T2, 2026-11-08): expectations about the shipped world derive from source - see pack-expect.mjs (the candidate's street count derives from the candidate fixture itself)
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
ok('setup: 5W loaded with baseline work (Velmar done + note) and the fixture stub installed', G0.names.length === PACK5W.names);

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
await poll(`document.getElementById('toast').textContent.indexOf('No road there') >= 0`, 10000); // T4: poll the terminal state A2b asserts (the no-road toast)
const A2b = await J(`({ toast: document.getElementById('toast').textContent, streets: draft ? Object.keys(draft.roads).length : -1 })`);
ok('A2b a tap with no road feature under it says so and adds nothing | toast: ' + A2b.toast, A2b.toast.indexOf('No road there') >= 0 && A2b.streets === 0);
await ev(tapStreet('Bordeaux Drive'));
const gotB = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux Drive']`, 20000);
ok('A3 tapping Bordeaux Drive (fixture roads feature through the real click handler) adds it from the prepared extract', gotB === true);
const A4 = await J(`({ streets: Object.keys(draft.roads), mains: draft.mains.size, count: document.getElementById('crCount').textContent, chip: (document.querySelector('#crPickList .crPChip') || {}).textContent || '', total: Math.round(computeStretches(draft.roads)['Bordeaux Drive'].total), src: (map.getSource('crDraft').serialize().data.features || []).length })`); // Beta 1.127 premise updates in this drive: the pick rows are the picked-roads panel's rows - chip is .crPChip (A4), the panel header counts 'N roads' (A4/A6), the chip flip's proof is its own MAIN text (A7), and the theme probe reads the panel face #crPanel (I2)
ok('A4 Bordeaux joined the draft as a SECONDARY (2ND chip, 0 mains) with its shape drawn on the draft overlay | ' + JSON.stringify(A4),
  A4.streets.length === 1 && A4.mains === 0 && A4.count.indexOf('1 roads') === 0 && A4.chip === '2ND' && A4.src === 1);
ok('A5 the fetched Bordeaux length matches the fixture geometry (' + Math.round(fixtureLen('Bordeaux Drive')) + ' m) within 2% | got ' + A4.total,
  Math.abs(A4.total - fixtureLen('Bordeaux Drive')) <= fixtureLen('Bordeaux Drive') * 0.02);
await ev(tapStreet('Alderson Avenue'));
const gotA = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Alderson Avenue']`, 20000);
ok('A5b tapping Alderson Avenue adds it too', gotA === true);
const A6 = await J(`({ streets: Object.keys(draft.roads).sort(), count: document.getElementById('crCount').textContent, ald: Math.round(computeStretches(draft.roads)['Alderson Avenue'].total) })`);
ok('A6 Alderson Avenue tapped and added (2 streets); its stitched length matches the 5-way fixture (' + Math.round(fixtureLen('Alderson Avenue')) + ' m) within 3% | ' + JSON.stringify(A6),
  A6.streets.length === 2 && A6.count.indexOf('2 roads') === 0 && Math.abs(A6.ald - fixtureLen('Alderson Avenue')) <= fixtureLen('Alderson Avenue') * 0.03);
await ev(`(() => { const rows = [...document.querySelectorAll('#crPickList .crPRow')]; const row = rows.find(r => r.querySelector('.crPName').textContent === 'Bordeaux'); row.querySelector('.crPChip').click(); return true; })()`); // Beta 1.127 premise update: the chip lives in the panel row (.crPRow/.crPName/.crPChip)
const A7 = await J(`({ mains: [...draft.mains], chip: (() => { const rows = [...document.querySelectorAll('#crPickList .crPRow')]; const row = rows.find(r => (r.querySelector('.crPName') || {}).textContent === 'Bordeaux'); return row ? (row.querySelector('.crPChip') || {}).textContent || '' : ''; })() })`); // Beta 1.127 premise update: the panel header has no mains count - the flipped chip's MAIN text is the visible proof
ok('A7 flipping Bordeaux to MAIN updates its panel chip (2ND -> MAIN)', A7.mains.length === 1 && A7.mains[0] === 'Bordeaux Drive' && A7.chip === 'MAIN'); // Beta 1.127 premise update: chip text replaces the old header mains count
await ev(`document.getElementById('crDoneBtn').click()`);
const A8 = await J(`({ stage: crStage, pv: document.getElementById('previewSheet').classList.contains('on'), bar: document.getElementById('createBar').classList.contains('on'), rows: document.querySelectorAll('#pvList .crRow').length, pvCount: document.getElementById('pvCount').textContent })`);
ok('A8 Done lands in the shared preview ("Review selection") with both streets and the count', A8.stage === 'preview' && A8.pv && !A8.bar && A8.rows === 2 && A8.pvCount.indexOf('2 streets') === 0);
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
  !!A10.rec['route-6w'] && Object.keys(A10.rec['route-6w'].roads).length === 2 && A10.rec['route-6w'].main.join() === 'Bordeaux Drive' && A10.listed && A10.pre && A10.pre.routeSaved === 0 && A10.pre.routeTotal > 0);
await ev(`document.querySelector('#rmRoutes .routeRow[data-route="route-6w"]').click()`);
await poll(`typeof activeRoute !== 'undefined' && activeRoute && activeRoute.id === 'route-6w'`, 20000);
await poll(`typeof map === 'undefined' || !map || !map.isMoving()`, 25000);
const A11 = await J(`({ names: STREETNAMES.slice().sort(), count2: document.body.innerText.indexOf('of 2') >= 0 })`);
ok('A11 the created route loads through the 1.117 machinery (2 streets, count reads "of 2")', A11.names.join() === 'Alderson Avenue,Bordeaux Drive' && A11.count2);
await ev(`markDone('Bordeaux Drive', 'drive150')`);
const A12 = await J(`({ done: streetComplete('Bordeaux Drive'), slot: (localStorage.getItem('snowroute.route-6w.v5.sides') || '').indexOf('Bordeaux') >= 0 })`);
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
const gotPick = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux Drive']`, 20000);
const PK = await J(`({ streets: draft ? Object.keys(draft.roads) : [], total: draft && draft.roads['Bordeaux Drive'] ? Math.round(computeStretches(draft.roads)['Bordeaux Drive'].total) : -1, toast: document.getElementById('toast').textContent })`);
ok('P1 (pick seam) a tap whose exact pixel holds NO road still picks the street whose tile line passes nearest the tap (Bordeaux, 12 px) and the pick reaches pickStreet -> the prepared extract (length ' + Math.round(fixtureLen('Bordeaux Drive')) + ' m) | ' + JSON.stringify(PK),
  gotPick === true && PK.streets.join() === 'Bordeaux Drive' && Math.abs(PK.total - fixtureLen('Bordeaux Drive')) <= fixtureLen('Bordeaux Drive') * 0.02);
ok('P2 (pick seam) the farther street inside the same box (Alderson, 15 px, listed first) is NOT picked', !PK.streets.includes('Alderson Avenue'));
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
const gotB2 = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux Drive']`, 20000);
ok('B0 the second manual session (city step + preparation again) picks Bordeaux again (feature stub still installed)', gotB2 === true);
await ev(`document.getElementById('crDoneBtn').click()`);
const B1 = await J(`({ rows: document.querySelectorAll('#pvList .crRow').length })`);
ok('B1 a one-street draft reaches the preview', B1.rows === 1);
await ev(`document.getElementById('pvAddBtn').click()`);
const B2 = await J(`({ stage: crStage, bar: document.getElementById('createBar').classList.contains('on'), doneLbl: document.getElementById('crDoneBtn').textContent })`);
ok('B2 "+ Add a street" reopens the picker (Beta 1.128: the panel button reads "Done" in every state - the "back to check" rewrite is gone)', B2.stage === 'pick' && B2.bar && B2.doneLbl === 'Done');
await ev(tapStreet('Alderson Avenue'));
await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Alderson Avenue']`, 20000);
await ev(`document.getElementById('crDoneBtn').click()`);
const B3 = await J(`({ rows: document.querySelectorAll('#pvList .crRow').length, count: document.getElementById('pvCount').textContent })`);
ok('B3 the added street returns to the same preview (2 streets)', B3.rows === 2 && B3.count.indexOf('2 streets') === 0);
await ev(`(() => { const rows = [...document.querySelectorAll('#pvList .crRow')]; const row = rows.find(r => r.querySelector('.crName').textContent === 'Bordeaux'); row.querySelector('.crDel').click(); return true; })()`);
const B4 = await J(`({ streets: Object.keys(draft.roads), count: document.getElementById('pvCount').textContent })`);
ok('B4 removing Bordeaux in the preview updates the draft and the count (1 street left)', B4.streets.join() === 'Alderson Avenue' && B4.count.indexOf('1 streets') === 0);
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
await poll(`document.getElementById('toast').textContent.indexOf('could not be read') >= 0`, 10000); // T4: poll the terminal state C2 asserts (the named error toast)
let C2 = await J(`({ creating, draft: draft === null, toast: document.getElementById('toast').textContent })`);
if (!C2.toast) { await ev(`document.getElementById('crDraftFile').dispatchEvent(new Event('change'))`); await sleep(600); C2 = await J(`({ creating, draft: draft === null, toast: document.getElementById('toast').textContent })`); }
ok('C2 a MALFORMED draft file fails closed: named error toast, no create mode, no draft | toast: ' + C2.toast,
  C2.creating === false && C2.draft && C2.toast.indexOf('could not be read') >= 0);
await setFile('#crDraftFile', '/tmp/d150-candidate.json');
await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'preview'`, 10000).catch(() => false);
let C3 = await J(`({ creating, stage: crStage, streets: draft ? Object.keys(draft.roads).length : -1, rows: document.querySelectorAll('#pvList .crRow').length, total: draft ? Math.round(Object.values(computeStretches(draft.roads)).reduce((a, s) => a + s.total, 0)) : -1 })`);
if (!C3.creating) { await ev(`document.getElementById('crDraftFile').dispatchEvent(new Event('change'))`); await poll(`typeof creating !== 'undefined' && creating === true`, 10000); C3 = await J(`({ creating, stage: crStage, streets: draft ? Object.keys(draft.roads).length : -1, rows: document.querySelectorAll('#pvList .crRow').length, total: draft ? Math.round(Object.values(computeStretches(draft.roads)).reduce((a, s) => a + s.total, 0)) : -1 })`); }
ok('C3 the sandbox candidate draft (bare roads shape) imports into the preview with all 34 streets, total length matching the candidate (' + Math.round(candLen) + ' m) within 1% | ' + JSON.stringify(C3),
  C3.creating && C3.stage === 'preview' && C3.streets === CAND_N && C3.rows === CAND_N && Math.abs(C3.total - candLen) <= candLen * 0.01);
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
await resetRoute(ev, '5w'); await resetRoute(ev, 'route-6w', ['snowroute.v2.userpacks']); // T7: scoped reset - D3 owns both routes' slots + the created-routes record, nothing else (premise statement in INVENTORY-T47.md)
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
const P4 = await J(`({ names: STREETNAMES.length, bordeaux: streetComplete('Bordeaux Drive') })`);
ok('D5 the restored created route loads with its mark intact (Bordeaux still complete)', P4.names === 2 && P4.bordeaux === true);
await ev(`openRouteMenu()`);
await ev(`document.querySelector('#rmRoutes .routeRow[data-route="5w"]').click()`);
await poll(`typeof activeRoute !== 'undefined' && activeRoute && activeRoute.id === '5w'`, 20000);
const P5 = await J(`({ velmar: streetComplete('Velmar'), note: noteTextOf('Velmar') })`);
ok('D6 5W\'s own state rode the same round trip (Velmar complete, note intact)', P5.velmar === true && P5.note === 'drive150 baseline');

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
