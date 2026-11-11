import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCreateRig, serveRepo, makeResults, finishCreate, sleep } from './harness-create.mjs';

// drive189: Beta 1.169 (Carbon fix round) - the create-flow graded fixes:
//   A: D-05 (+X-05) - normalizePack's duplicate map is prototype-free:
//      a first street named 'constructor' / 'toString' / '__proto__'
//      validates and stores as an own key (and can be a main), while a
//      genuine trim-collision duplicate is still rejected.
//   B: D-05 - a PENDING street named 'constructor' renders its row in
//      the pick list (the own-key test replaced the truthiness read
//      that hid it through the prototype).
//   C: D-02 - importDraft populates draft.osmNames (every imported key
//      maps to itself), so an imported street's own OSM ways are
//      skipped when its sectors are cut, exactly like a tapped street.
//   D: D-08 - picking a city that REPLACES a chosen one mid-draft goes
//      through askDiscard and lands a FULL reset (fresh draft, pending
//      cleared, area follows the new city); a FIRST pick keeps its
//      draft and never prompts.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKFX = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'browser', 'fixtures', 'city-pack-vaughan.json'), 'utf8'));
const INDEXFX = JSON.parse(fs.readFileSync(path.join(REPO, 'packs', 'index.json'), 'utf8'));
const { R, ok } = makeResults();

const CITY_VAUGHAN = { place_id: 351671075, osm_type: 'relation', osm_id: 324212, lat: '43.7941544', lon: '-79.5268023', category: 'boundary', type: 'administrative', place_rank: 16, importance: 0.489, addresstype: 'city', name: 'Vaughan', display_name: 'Vaughan, York Region, Ontario, Canada', address: { city: 'Vaughan', county: 'York Region', state: 'Ontario', country: 'Canada', country_code: 'ca' }, boundingbox: ['43.7498436', '43.9243511', '-79.7106948', '-79.4200471'] };
const CITY_MARKHAM = { place_id: 351671076, osm_type: 'relation', osm_id: 324213, lat: '43.8561000', lon: '-79.3370000', category: 'boundary', type: 'administrative', place_rank: 16, importance: 0.44, addresstype: 'city', name: 'Markham', display_name: 'Markham, York Region, Ontario, Canada', address: { city: 'Markham', county: 'York Region', state: 'Ontario', country: 'Canada', country_code: 'ca' }, boundingbox: ['43.7700000', '43.9500000', '-79.4500000', '-79.2200000'] };

const { server, ORIGIN } = await serveRepo(REPO);
async function fulfil(sessionId, p, H) {
  const send = H.send;
  const url = p.request.url;
  const json = (obj, code) => H.json(sessionId, p, obj, code);
  try {
    const pn = new URL(url).pathname;
    if (pn.endsWith('/packs/index.json')) return await json(INDEXFX);
    if (pn.endsWith('/packs/vaughan.json')) return await json(PACKFX);
    if (/\/packs\/[^/]+\.json$/.test(pn)) return await json('nf', 404);
    if (url.indexOf('nominatim.openstreetmap.org') >= 0) {
      if (url.indexOf('featuretype=city') >= 0) {
        const q = decodeURIComponent((/[?&]q=([^&]+)/.exec(url) || [])[1] || '');
        if (/markham/i.test(q)) return await json([CITY_MARKHAM]);
        return await json([CITY_VAUGHAN]);
      }
      return await json([]);
    }
    if (url.indexOf('overpass') >= 0) return await json({ elements: [] });
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: r.status, responseHeaders: [{ name: 'Content-Type', value: r.headers.get('content-type') || 'application/octet-stream' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: buf.toString('base64') }, sessionId);
  } catch (e) { try { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); } catch (e2) {} }
}
const rig = await startCreateRig({ profile: '/tmp/d189profile-' + Date.now(), fulfil, jsonMode: 'coded' });
const { proc, send, PAGE_S, ev2, poll, J } = rig;
const SEG = [[[43.8, -79.5], [43.801, -79.499]]];

try {
  await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
  await rig.bootRoute();

  // ---- A: D-05 normalizePack prototype names ----
  const a = await J(`(() => {
    const seg = ${JSON.stringify(SEG)};
    // the roads map is parsed from raw JSON TEXT on purpose: an object literal cannot carry an own '__proto__' key (the literal form sets the prototype instead, and stringify then drops it) - JSON text is how such a name really arrives (imports, stored packs)
    const roadsIn = JSON.parse('{"constructor":' + JSON.stringify(seg) + ',"toString":' + JSON.stringify(seg) + ',"__proto__":' + JSON.stringify(seg) + '}');
    const v = normalizePack({ name: 'Proto Test', roads: roadsIn });
    const v2 = normalizePack({ name: 'Proto Test', roads: { 'constructor': seg }, mains: ['constructor'] });
    const dup = normalizePack({ name: 'Proto Test', roads: { 'Main Street': seg, ' Main Street ': seg } });
    return {
      ok: v.ok, keys: v.ok ? Object.keys(v.pack.roads).sort() : [],
      ownProto: v.ok ? Object.prototype.hasOwnProperty.call(v.pack.roads, '__proto__') : false,
      main: v2.ok ? v2.pack.main : [], dupOk: dup.ok, dupErr: dup.ok ? '' : dup.error
    };
  })()`);
  ok('A1 a first street named constructor/toString/__proto__ VALIDATES (no false duplicate through the prototype) | ' + JSON.stringify(a), a.ok === true && JSON.stringify(a.keys) === JSON.stringify(['__proto__', 'constructor', 'toString']) && a.ownProto === true);
  ok('A2 a prototype-named street can be a main | main: ' + JSON.stringify(a.main), JSON.stringify(a.main) === JSON.stringify(['constructor']));
  ok('A3 a genuine duplicate (trim collision) is still rejected | ' + JSON.stringify({ dupOk: a.dupOk, dupErr: a.dupErr }), a.dupOk === false && /appears twice/.test(a.dupErr || ''));

  // ---- B: D-05 pending row renders ----
  const b = await J(`(() => {
    draft = newDraft();
    crPending = { 'constructor': { osmName: 'constructor', lngLat: [-79.5, 43.8] } };
    renderCrLists();
    const rows = document.querySelectorAll('#crPickList .crRow.pending').length;
    const txt = document.getElementById('crPickList').textContent;
    crPending = {}; draft = null;
    return { rows, txt };
  })()`);
  ok('B1 a pending street named constructor RENDERS in the pick list (visible, so it can be dropped) | rows: ' + b.rows, b.rows === 1 && /constructor/i.test(b.txt || ''));

  // ---- C: D-02 importDraft carries osmNames ----
  const cDraft = JSON.stringify({ name: 'Imported Route', area: 'Vaughan', roads: { 'Alpha Street': SEG, 'Beta Road': SEG } });
  await ev2(`importDraft(${JSON.stringify(cDraft)}); true`);
  const cReady = await poll(`typeof draft !== 'undefined' && !!draft && !!draft.osmNames && Object.keys(draft.osmNames).length === 2`, 10000).catch(() => false);
  const c = await J(`({ osm: draft ? draft.osmNames : null, creating: typeof creating !== 'undefined' && creating === true })`);
  ok('C1 importDraft maps every imported street key to itself in osmNames | ' + JSON.stringify(c), cReady === true && c.creating === true && c.osm && c.osm['Alpha Street'] === 'Alpha Street' && c.osm['Beta Road'] === 'Beta Road');

  // ---- D: D-08 city switch discard + full reset ----
  await ev2(`exitCreate(); true`);
  await ev2(`openRouteMenu(); document.getElementById('rmCreate').click(); true`);
  await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
  await ev2(`document.getElementById('crDoorManual').click(); true`);
  await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
  await ev2(`crPickCity(${JSON.stringify(CITY_VAUGHAN)}); true`);
  const dFirst = await poll(`typeof crCity !== 'undefined' && !!crCity && crCity.name === 'Vaughan'`, 10000).catch(() => false);
  const dModal0 = await J(`({ hidden: document.getElementById('crModal').classList.contains('hidden') })`);
  ok('D1 a FIRST city pick lands directly - no discard prompt, draft kept | first: ' + dFirst + ', modal hidden: ' + dModal0.hidden, dFirst === true && dModal0.hidden === true);
  await ev2(`(() => { draft.roads['Test Street'] = ${JSON.stringify(SEG)}; draft.osmNames['Test Street'] = 'Test Street'; crPending = { 'Pending Street': { osmName: 'Pending Street', lngLat: [-79.5, 43.8] } }; return true; })()`);
  await ev2(`crPickCity(${JSON.stringify(CITY_MARKHAM)}); true`);
  const dPrompt = await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000).catch(() => false);
  const dHeld = await J(`({ city: crCity && crCity.name, streets: draftStreets().length })`);
  ok('D2 switching city mid-draft PROMPTS before anything moves (city and draft untouched while the ask is up) | ' + JSON.stringify(dHeld), dPrompt === true && dHeld.city === 'Vaughan' && dHeld.streets === 1);
  await ev2(`document.getElementById('crModalYes').click(); true`);
  const dSwitched = await poll(`typeof crCity !== 'undefined' && !!crCity && crCity.name === 'Markham'`, 10000).catch(() => false);
  const dAfter = await J(`({ streets: draftStreets().length, pending: Object.keys(crPending).length, area: draft && draft.area })`);
  ok('D3 confirming lands the FULL reset: fresh draft, pending cleared, area follows the new city | ' + JSON.stringify(dAfter), dSwitched === true && dAfter.streets === 0 && dAfter.pending === 0 && dAfter.area === 'Markham');
} catch (e) {
  ok('drive189 completed without a harness-level throw: ' + String(e && e.message || e), false);
}
finishCreate(R, proc, server);
