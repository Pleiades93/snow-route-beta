import { launchDrive, finish } from './harness.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// drive150: Beta 1.118 create-a-route (Step 2, hybrid flow). NETWORK
// FIXTURES: Nominatim + Overpass are stubbed IN-PAGE from the route-creation
// sandbox's real Vaughan OSM extract (osm-raw.json) - deterministic, no
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
// the created route's mark in ITS slot); (b) preview corrections (add via
// the picker from preview, remove in preview, start-over confirm
// discards - 5W slot still byte-identical); (c) the photo door (photo
// pick -> waiting state -> a MALFORMED draft fails closed with a named
// error and no state change -> the sandbox candidate draft imports into
// the preview with its 34 streets; a pack-envelope draft carries its name
// into name-it); (d) persistence (reload keeps the route; backup carries
// userpacks; wipe + restore brings the route AND its mark back).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

// ---------- fixtures ----------
const osm = JSON.parse(fs.readFileSync(new URL('../../..', import.meta.url).pathname + 'work/route-creation-sandbox/osm-raw.json', 'utf8'));
const elsByName = {};
for (const e of osm.elements) { if (e.type === 'way' && e.geometry && e.tags && e.tags.name) (elsByName[e.tags.name] = elsByName[e.tags.name] || []).push(e); }
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
const candidate = JSON.parse(fs.readFileSync(new URL('../../..', import.meta.url).pathname + 'work/route-creation-sandbox/candidate-route-roads.json', 'utf8'));
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
const candPath = new URL('../../..', import.meta.url).pathname + 'work/route-creation-sandbox/candidate-route-roads.json';
await setFile('#crDraftFile', candPath);
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

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
