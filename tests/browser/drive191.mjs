import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCreateRig, serveRepo, makeResults, finishCreate, sleep } from './harness-create.mjs';

// drive191: Beta 1.170 (Carbon fix round, Phase 2) - the create-flow
// graded fixes:
//   A: D-03 - saveDraftRoute is single-flight: two concurrent calls
//      register ONE route (through 1.169 both computed the same
//      uniqueRouteId before either registered, and the pack was pushed
//      twice under one id).
//   B: D-04 - "Clear all" bumps the geometry generation and clears the
//      pending rows, the two duties every other roads mutation obeys -
//      a cleared street can no longer be re-added by the pending sweep.
//   C: D-07 - the Overpass fallback branch (no readable stream) enforces
//      the byte cap the streaming branch's way: a declared
//      Content-Length over the cap refuses before the body is read, and
//      the buffered text is measured in BYTES, not UTF-16 code units.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKFX = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'browser', 'fixtures', 'city-pack-vaughan.json'), 'utf8'));
const INDEXFX = JSON.parse(fs.readFileSync(path.join(REPO, 'packs', 'index.json'), 'utf8'));
const { R, ok } = makeResults();

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
    if (url.indexOf('overpass') >= 0) return await json({ elements: [] });
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: r.status, responseHeaders: [{ name: 'Content-Type', value: r.headers.get('content-type') || 'application/octet-stream' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: buf.toString('base64') }, sessionId);
  } catch (e) { try { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); } catch (e2) {} }
}
const rig = await startCreateRig({ profile: '/tmp/d191profile-' + Date.now(), fulfil, jsonMode: 'coded' });
const { proc, send, PAGE_S, ev2, poll, J } = rig;
const JA = async (expr) => { const raw = await ev2(`(async () => { try { return JSON.stringify(await (${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const SEG = [[[43.8, -79.5], [43.801, -79.499]]];

try {
  await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
  await rig.bootRoute();

  // ---- A: D-03 saveDraftRoute single-flight ----
  const a = await JA(`(async () => {
    draft = newDraft();
    draft.roads['Alpha Street'] = ${JSON.stringify(SEG)};
    draft.osmNames['Alpha Street'] = 'Alpha Street';
    document.getElementById('crNameInput').value = 'Dup Test';
    document.getElementById('crAreaInput').value = 'Vaughan';
    const before = ROUTE_PACKS.length;
    const p1 = saveDraftRoute(); const p2 = saveDraftRoute(); // the double-tap: both calls land before the first store write settles
    await Promise.all([p1, p2]);
    await new Promise(r => setTimeout(r, 300));
    const mine = ROUTE_PACKS.filter(p => p.name === 'Dup Test');
    return { before, after: ROUTE_PACKS.length, mine: mine.length, ids: mine.map(p => p.id) };
  })()`);
  ok('A1 two concurrent saves register exactly ONE route | ' + JSON.stringify(a), a.mine === 1 && a.after === a.before + 1);
  ok('A2 the one registration carries one id | ids: ' + JSON.stringify(a.ids), a.ids.length === 1 && typeof a.ids[0] === 'string' && a.ids[0].length > 0);

  // ---- B: D-04 Clear all duties ----
  const b = await J(`(() => {
    draft = newDraft();
    draft.roads['Alpha Street'] = ${JSON.stringify(SEG)};
    draft.roads['Beta Road'] = ${JSON.stringify(SEG)};
    draft.osmNames['Alpha Street'] = 'Alpha Street'; draft.osmNames['Beta Road'] = 'Beta Road';
    crPending = { 'Ghost Pending': { osmName: 'Ghost Pending', lngLat: [-79.5, 43.8] } };
    crDraftGeom(); // prime the geometry cache on the pre-clear draft
    return { gen: crGeomGen, streets: draftStreets().length };
  })()`);
  await ev2(`document.getElementById('crClearAll').click(); true`);
  const bModal = await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000).catch(() => false);
  await ev2(`document.getElementById('crModalYes').click(); true`);
  await sleep(200);
  const b2 = await J(`({ streets: draftStreets().length, gen: crGeomGen, pending: Object.keys(crPending).length, geom: Object.keys(crDraftGeom()).length })`);
  ok('B1 Clear all still asks first (the shared confirm) | modal: ' + bModal, bModal === true);
  ok('B2 the clear empties the draft AND the pending rows, and bumps the geometry generation | ' + JSON.stringify({ before: b, after: b2 }), b.streets === 2 && b2.streets === 0 && b2.pending === 0 && b2.gen > b.gen && b2.geom === 0);

  // ---- C: D-07 Overpass fallback cap ----
  const c = await JA(`(async () => {
    const realFetch = window.fetch;
    const cap0 = CR_TIMING.capBytes; CR_TIMING.capBytes = 1000; // the documented test seam: shrink the cap instead of moving megabytes
    let textCalled = false;
    window.fetch = async () => ({ ok: true, status: 200, headers: new Headers({ 'content-length': '5000' }), body: null, text: async () => { textCalled = true; return ''; } });
    const r1 = await crOverpassFetch('x', 8000, 8000, null, null);
    window.fetch = async () => ({ ok: true, status: 200, headers: new Headers({ 'content-length': '10' }), body: null, text: async () => 'é'.repeat(600) }); // 600 UTF-16 units, 1200 bytes
    const r2 = await crOverpassFetch('x', 8000, 8000, null, null);
    window.fetch = async () => ({ ok: true, status: 200, headers: new Headers({}), body: null, text: async () => '{"elements":[]}' });
    const r3 = await crOverpassFetch('x', 8000, 8000, null, null);
    window.fetch = realFetch; CR_TIMING.capBytes = cap0;
    return { r1, textCalled, r2, r3ok: r3.ok };
  })()`);
  ok('C1 a declared Content-Length over the cap refuses as dense BEFORE the body is read | ' + JSON.stringify({ r1: c.r1, textCalled: c.textCalled }), c.r1 && c.r1.ok === false && c.r1.kind === 'dense' && c.textCalled === false);
  ok('C2 the buffered text is measured in BYTES (600 units / 1200 bytes vs a 1000 cap reads dense, not badjson) | ' + JSON.stringify(c.r2), c.r2 && c.r2.ok === false && c.r2.kind === 'dense');
  ok('C3 a small valid answer still parses ok through the fallback | r3ok: ' + c.r3ok, c.r3ok === true);
} catch (e) {
  ok('drive191 completed without a harness-level throw: ' + String(e && e.message || e), false);
}
finishCreate(R, proc, server);
