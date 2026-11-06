import { launchDrive, bootThrough, finish } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// drive150: Beta 1.118 create-a-route (Step 2, hybrid flow). NETWORK
// FIXTURES: Nominatim + Overpass are stubbed IN-PAGE from fixtures frozen
// out of the route-creation sandbox's real Vaughan OSM extract
// (tests/browser/fixtures/create-osm.json, vendored so CI runs the same
// data) - deterministic, no
// live network for the create flow (basemap tiles still flow through the
// harness as usual). The tap's feature pick is fixtured at the map seam:
// in this headless rig the basemap style never readies (the known limit
// drive149 works around for GLP.init), so queryRenderedFeatures returns
// nothing at all here - the drive substitutes fixture roads features and
// fires REAL map click events through the app's registered handler, so
// the identification -> Overpass -> stitch -> draft path all runs for
// real; only MapLibre's own tile picking (a documented library API, live
// on device where tiles render) is stubbed. Sections: (a) the manual door end-to-end (search
// "borde" -> fly -> tap Bordeaux Drive + Alderson Avenue on the real
// basemap -> defaults secondary -> flip Bordeaux to main -> preview
// lengths match the fixture geometry -> name it -> save -> listed ->
// switch to it -> mark a street -> switch back: 5W slot BYTE-IDENTICAL,
// the created route's mark in ITS slot); (a2) the tap pick seam (Beta
// 1.119): a point query at the tap returns NO road (a fingertip never
// lands on the line's exact pixels) but a box query returns two named
// roads - the nearer line must be picked, the farther must not (1.118's
// point-only crMapTap fails this: "No road there" on every real tap);
// (b) preview corrections (add via
// the picker from preview, remove in preview, start-over confirm
// discards - 5W slot still byte-identical); (c) the photo door (photo
// pick -> waiting state -> a MALFORMED draft fails closed with a named
// error and no state change -> the sandbox candidate draft imports into
// the preview with its 34 streets; a pack-envelope draft carries its name
// into name-it); (d) persistence (reload keeps the route; backup carries
// userpacks; wipe + restore brings the route AND its mark back);
// (e) the CSP seam (Beta 1.119): a copy of the page stamped with the
// REAL policy (scripts/csp_stamp.py, as drive116 stamps) is booted with
// window.fetch NOT stubbed, and the app's actual crSearch /
// fetchStreetGeometry calls are fired at their real URLs - on the 1.118
// policy the app's own connect-src refuses both (securitypolicyviolation
// events + console refusals naming the hosts); on 1.119 the calls leave
// the page (whatever the rig's network then does with them) and no
// refusal is recorded. drive150's sections (a)-(d) stub fetch in-page,
// which is exactly why the 1.118 defect shipped unseen - this section
// never stubs. Beta 1.120 adds sections (f) the tap wedge + Overpass
// fallback, (g) search as you type, (h) the POI creation backdrop, and
// (i) theming / bar position / dropdown dismissal / the ✕.
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
const FIXTURE = {
  nominatim: [{ display_name: 'Bordeaux Drive, Vaughan, Ontario, Canada', lat: '43.798972', lon: '-79.574666', address: { city: 'Vaughan' } }],
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
    if (u.indexOf('nominatim.openstreetmap.org') >= 0) return Promise.resolve(new Response(JSON.stringify(FIX.nominatim), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (u.indexOf('overpass-api.de') >= 0) {
      const body = (opts && opts.body) || '';
      const m = /name=\\"([^\\"]+)\\"/.exec(decodeURIComponent(body)) || /name="([^"]+)"/.exec(decodeURIComponent(body));
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
const TAP_POINTS = { 'Bordeaux Drive': { lat: 43.798972, lng: -79.574666 }, 'Alderson Avenue': { lat: 43.8000667, lng: -79.573051 } };
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
const A1 = await J(`({ creating, body: document.body.classList.contains('creating'), bar: document.getElementById('createBar').classList.contains('on'), sheet: document.getElementById('createSheet').classList.contains('on'), menuOpen: document.getElementById('routeMenu').classList.contains('open') })`);
ok('A1 the manual door enters create mode on the map (bar + pick sheet up, menu closed)', A1.creating === true && A1.body && A1.bar && A1.sheet && !A1.menuOpen);
await ev(`document.getElementById('crSearchInput').value = 'borde'`);
await ev(`document.getElementById('crSearchBtn').click()`);
await poll(`document.querySelectorAll('#createResults .crResult').length === 1`, 15000);
const A2 = await J(`({ n: document.querySelectorAll('#createResults .crResult').length, txt: (document.querySelector('#createResults .crResult') || {}).textContent || '' })`);
ok('A2 search "borde" returns the fixture result (Bordeaux Drive, Vaughan)', A2.n === 1 && A2.txt.indexOf('Bordeaux Drive') >= 0);
await ev(`document.querySelector('#createResults .crResult').click()`);
await poll(`(() => { const c = map.getCenter(); return Math.abs(c.lat - 43.798972) < 0.004 && Math.abs(c.lng - (-79.574666)) < 0.004 && !map.isMoving(); })()`, 20000);
await ev(installFeatureStub);
await ev(tapNothing);
await sleep(400);
const A2b = await J(`({ toast: document.getElementById('toast').textContent, streets: draft ? Object.keys(draft.roads).length : -1 })`);
ok('A2b a tap with no road feature under it says so and adds nothing | toast: ' + A2b.toast, A2b.toast.indexOf('No road there') >= 0 && A2b.streets === 0);
await ev(tapStreet('Bordeaux Drive'));
const gotB = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 20000);
ok('A3 tapping Bordeaux Drive (fixture roads feature through the real click handler) starts its Overpass load', gotB === true);
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
await ev(installPickStub);
// a REAL MapLibre click's lngLat is by construction the unprojection of its
// point - fire the tap that way, so the nearest-line judge is measured
// against the same geometry the stub draws (section (a)'s canned lngLat
// belongs to a view the map is no longer showing here)
await ev(`(() => { const pt = { x: 210, y: 320 }; const ll = map.unproject([pt.x, pt.y]); map.fire('click', { lngLat: { lat: ll.lat, lng: ll.lng }, point: pt, originalEvent: {} }); return true; })()`);
const gotPick = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 20000);
const PK = await J(`({ streets: draft ? Object.keys(draft.roads) : [], total: draft && draft.roads['Bordeaux'] ? Math.round(computeStretches(draft.roads)['Bordeaux'].total) : -1, toast: document.getElementById('toast').textContent })`);
ok('P1 (pick seam) a tap whose exact pixel holds NO road still picks the street whose tile line passes nearest the tap (Bordeaux, 12 px) and the pick reaches pickStreet -> the Overpass fixture (length ' + Math.round(fixtureLen('Bordeaux Drive')) + ' m) | ' + JSON.stringify(PK),
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
await ev(tapStreet('Bordeaux Drive'));
const gotB2 = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux']`, 20000);
ok('B0 the second manual session picks Bordeaux again (feature stub still installed)', gotB2 === true);
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

// ---------- (f) the tap wedge + the Overpass fallback (Beta 1.120) ----------
// Andrew on device (1.119): a tap said "Loading", then nothing, and the
// picker never accepted another tap. Two layers, both reproduced here:
// pickStreet's early return on a failed shape fetch skipped the busy-flag
// release (one refused fetch latched the picker for the session), and the
// fetch had no patience (the public Overpass instance commonly answers
// slowly or 429/504; any non-OK was an instant silent null). The stub
// below makes 'Refused Road' fail on EVERY instance and 'Flaky Road' fail
// on the primary twice before the fallback answers with Bordeaux's ways.
// On the 1.119 code the first tap's failure leaves crPickBusy true
// forever, so F2's release assertion and F3's second-tap completion both
// fail there by construction (red-verified against the 1.119 page in the
// build's scratch drive - see beta1/work/create-round2-1120/).
const installStub2 = `(() => {
  const FIX = ${JSON.stringify(FIXTURE)};
  const prev = window.fetch.bind(window);
  window.__ovpLog = [];
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) {
      const body = (opts && opts.body) || '';
      const m = /name=\\"([^\\"]+)\\"/.exec(decodeURIComponent(body)) || /name="([^"]+)"/.exec(decodeURIComponent(body));
      const nm = m ? m[1] : '';
      window.__ovpLog.push((u.indexOf('kumi') >= 0 ? 'kumi' : 'de') + ':' + nm);
      if (nm === 'Refused Road') return Promise.resolve(new Response('refused by fixture', { status: 503 }));
      if (nm === 'Flaky Road') {
        if (u.indexOf('kumi') >= 0) return Promise.resolve(new Response(JSON.stringify({ elements: FIX.overpass['Bordeaux Drive'] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        return Promise.resolve(new Response('busy by fixture', { status: 503 }));
      }
      if (u.indexOf('kumi') >= 0) return Promise.resolve(new Response(JSON.stringify({ elements: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
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
await ev(tapRoad('Refused Road', 43.798972, -79.574666));
await sleep(600);
const F0 = await J(`({ hint: document.getElementById('createHint').textContent, busy: crPickBusy })`);
ok('F1 while the shape service is being retried, the hint carries the wait ("Loading Refused…") and the pick is in flight | ' + JSON.stringify(F0),
  F0.hint.indexOf('Loading Refused') >= 0 && F0.busy === true);
const fToast = await poll(`document.getElementById('toast').textContent.indexOf('street-shape service') >= 0`, 40000).catch(() => false);
const F1 = await J(`({ busy: crPickBusy, streets: draft ? Object.keys(draft.roads) : ['<no draft>'], log: (window.__ovpLog || []).filter(x => x.indexOf('Refused Road') >= 0) })`);
ok('F2 a shape service that never answers (503 on primary, retry and fallback) ends with the honest service message, adds nothing, and RELEASES the picker (crPickBusy false) | ' + JSON.stringify(F1),
  fToast === true && F1.busy === false && F1.streets.length === 0 && F1.log.length === 3 && F1.log[0].indexOf('de:') === 0 && F1.log[2].indexOf('kumi') === 0);
await ev(tapRoad('Flaky Road', 43.798972, -79.574666));
const gotFlaky = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Flaky']`, 40000).catch(() => false);
const F2 = await J(`({ busy: crPickBusy, log: (window.__ovpLog || []).filter(x => x.indexOf('Flaky Road') >= 0) })`);
ok('F3 after the refused tap, a SECOND tap still completes: Flaky Road is answered by the FALLBACK instance (de, de, kumi) and joins the draft - the picker is not wedged | ' + JSON.stringify(F2),
  gotFlaky === true && F2.busy === false && F2.log.length === 3 && F2.log[0].indexOf('de:') === 0 && F2.log[1].indexOf('de:') === 0 && F2.log[2].indexOf('kumi') === 0);
await ev(`document.getElementById('crExit').click()`);
await sleep(400);
await ev(`(() => { const y = document.getElementById('crModalYes'); if (y && !document.getElementById('crModal').classList.contains('hidden')) y.click(); return true; })()`);
await sleep(400);
const F3 = await J(`({ creating })`);
ok('F4 the wedge-probe draft discards cleanly and create mode exits', F3.creating === false);

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

// ---------- (e) the CSP seam: the app's real calls under the real stamped policy (Beta 1.119) ----------
// A throwaway copy of the current source, stamped by the repo's own tool
// (the single source of the policy, exactly as drive116 stamps), is booted
// fresh: window.fetch is NEVER stubbed on this page. The app's actual
// crSearch and fetchStreetGeometry are fired at their real URLs while the
// page's securitypolicyviolation events and the CDP log are watched for a
// refusal naming either host. (The CDP Fetch-interception form - pause the
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
await ev(`fetchStreetGeometry('Bordeaux Drive', { lat: 43.798972, lng: -79.574666 }).then(() => {}, () => {}); true`);
await sleep(5000);
const evAfterGeo = await ev(`window.__cspEv.slice()`);
const logAfterGeo = consoleLog.filter(c => /Refused to|Content Security Policy/i.test(c.text || '') && (c.text || '').includes('overpass-api.de')).length;
const evHitsGeo = (Array.isArray(evAfterGeo) ? evAfterGeo : []).filter(u => u.includes('overpass-api.de')).length;
ok('E4 (CSP seam) the app\'s real geometry call (fetchStreetGeometry -> overpass) is NOT refused by the page\'s own policy (violation events ' + evHitsGeo + ', console refusals ' + logAfterGeo + ')', evHitsGeo === 0 && logAfterGeo === 0);
try { fs.rmSync(TMP_PAGE_E, { force: true }); } catch (e) {}

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
