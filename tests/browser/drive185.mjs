import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll, url } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });

// drive185: Beta 1.166 - per-route save isolation. The monolith's core
// hazard was blast radius: one record, every route hostage to every
// save. With one IndexedDB record per route, the claims are:
//   I1 a save whose store write FAILS refuses that route only - the
//      refusal is disclosed, the route is never registered, and every
//      other route's stored record stays byte-identical.
//   I2 the same save succeeds once the fault clears, and the other
//      routes are STILL byte-identical afterwards (a save touches one
//      record, never a read-modify-write of all of them).
//   I3 a corrupt record planted in the store is skipped at boot while
//      its sibling routes register and load normally - one bad record
//      is one bad route, never a boot failure.
//   I4 deleting one route removes exactly its own record and slot;
//      the surviving routes' records stay byte-identical.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const UPKEY = 'snowroute.v2.userpacks';
const PACK = (name, street) => ({ name, area: 'Vaughan', mains: [], roads: { [street]: [[[43.8, -79.57], [43.801, -79.571]]] }, reference: {} });
const navigate = async () => { await send('Page.navigate', { url }, S); await sleep(3000); };
const storeCanon = async () => JSON.parse(await ev(`(async () => { const m = await upGetAll(); const out = {}; for (const id of Object.keys(m || {})) out[id] = upCanon(m[id]); return JSON.stringify(out); })()`));

await bootThrough(ev, poll);
ok('S0 app boots for the isolation tests', await poll(`!!window.maplibregl && !!document.querySelector('#map canvas')`, 45000));
await ev(`(() => { localStorage.setItem('${UPKEY}', JSON.stringify({ 'route-a': ${JSON.stringify(PACK('Route A', 'Alpha Street'))}, 'route-b': ${JSON.stringify(PACK('Route B', 'Beta Street'))}, 'route-c': ${JSON.stringify(PACK('Route C', 'Gamma Street'))} })); return true; })()`);
await navigate(); await ev(`window.__userPacksReady`);
const before = await storeCanon();
ok('S1 setup: three seeded routes migrated into the store | ' + JSON.stringify(Object.keys(before).sort()),
  JSON.stringify(Object.keys(before).sort()) === JSON.stringify(['route-a', 'route-b', 'route-c']));

// ---------- I1/I2: one route's failed save is that route's problem only ----------
await ev(`(() => { draft = newDraft(); draft.roads['Isolated Street'] = [[[43.8, -79.57], [43.801, -79.571]]]; $('crNameInput').value = 'Isolated Route'; $('crAreaInput').value = 'Vaughan'; return true; })()`);
// fault seam: the IndexedDB put itself throws, for THIS route's record only
await ev(`(() => { const orig = IDBObjectStore.prototype.put; window.__origPut = orig; IDBObjectStore.prototype.put = function (rec) { if (this.name === 'packs' && rec && rec.name === 'Isolated Route') throw new DOMException('drive185 injected save failure', 'QuotaExceededError'); return orig.apply(this, arguments); }; return true; })()`);
await ev(`saveDraftRoute()`);
await sleep(300);
const i1 = JSON.parse(await ev(`(async () => { const m = await upGetAll(); return JSON.stringify({ toast: $('toast').textContent, registered: ROUTE_PACKS.some(p => p.id === 'isolated-route'), storeKeys: m ? Object.keys(m).sort() : null }); })()`));
const afterFail = await storeCanon();
ok('I1 the faulted save REFUSES with the storage toast and the route is never registered | ' + i1.toast,
  /could not be saved/.test(i1.toast) && i1.registered === false && JSON.stringify(i1.storeKeys) === JSON.stringify(['route-a', 'route-b', 'route-c']));
ok('I1b every other route\'s stored record is byte-identical after the failed save', JSON.stringify(afterFail) === JSON.stringify(before));
await ev(`(() => { IDBObjectStore.prototype.put = window.__origPut; return true; })()`);
await ev(`saveDraftRoute()`);
await sleep(300);
const afterSave = await storeCanon();
ok('I2 the same save lands once the fault clears, and the three seeded records are STILL byte-identical (the save touched one record only) | store=' + JSON.stringify(Object.keys(afterSave).sort()),
  !!afterSave['isolated-route'] && afterSave['route-a'] === before['route-a'] && afterSave['route-b'] === before['route-b'] && afterSave['route-c'] === before['route-c']);

// ---------- I3: a corrupt stored record is one bad route, not a boot failure ----------
await ev(`(async () => { const db = await new Promise(res => { const rq = indexedDB.open('snowroute-userdata', 1); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); }); if (!db) return false; await new Promise(res => { const tx = db.transaction('packs', 'readwrite'); tx.oncomplete = () => res(true); tx.onerror = () => res(false); tx.objectStore('packs').put({ id: 'route-corrupt', name: 42, roads: 'junk' }); }); db.close(); return true; })()`);
await navigate(); await ev(`window.__userPacksReady`);
const i3 = JSON.parse(await ev(`JSON.stringify({ registered: ROUTE_PACKS.map(p => p.id).sort(), corruptRegistered: ROUTE_PACKS.some(p => p.id === 'route-corrupt') })`));
ok('I3 boot with a corrupt stored record: the corrupt route is skipped, every sibling registers | ' + JSON.stringify(i3.registered),
  i3.corruptRegistered === false && ['route-a', 'route-b', 'route-c', 'isolated-route'].every(id => i3.registered.includes(id)));
await ev(`loadRoute('route-a'); true`); await sleep(1200);
const i3b = await ev(`typeof routeLoaded !== 'undefined' && routeLoaded === true && !!activeRoute && activeRoute.id === 'route-a'`);
ok('I3b a sibling route loads normally in the same boot', i3b === true);

// ---------- I4: deleting one route touches exactly its own record + slot ----------
await ev(`(() => { localStorage.setItem(routeKeys('route-b').done, '[]'); localStorage.setItem(routeKeys('route-b').notes, '{}'); return true; })()`);
const preDel = await storeCanon();
await ev(`deleteRoute('route-b')`);
await sleep(300);
const i4 = JSON.parse(await ev(`(async () => { const m = await upGetAll(); return JSON.stringify({ storeKeys: m ? Object.keys(m).sort() : null, gone: !(await upGet('route-b')), done: localStorage.getItem(routeKeys('route-b').done), notes: localStorage.getItem(routeKeys('route-b').notes), registered: ROUTE_PACKS.some(p => p.id === 'route-b') }); })()`));
const postDel = await storeCanon();
ok('I4 the delete removes route-b\'s store record, unregisters it, and wipes its slot | ' + JSON.stringify(i4),
  i4.gone === true && i4.registered === false && i4.done === null && i4.notes === null && !i4.storeKeys.includes('route-b'));
ok('I4b the surviving routes\' records (route-a, route-c, isolated-route) are byte-identical across the delete',
  postDel['route-a'] === preDel['route-a'] && postDel['route-c'] === preDel['route-c'] && postDel['isolated-route'] === preDel['isolated-route']);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);
