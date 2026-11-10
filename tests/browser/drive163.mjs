import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, url, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive163: Beta 1.142 (Package B: DA-05 / DA-01 / DA-09 / DA-08) - the
// created-routes record and the backup family must never lose a route
// definition to a bad read. Beta 1.166 RE-SEAMED this drive: the
// definitions moved from the single localStorage record to per-route
// IndexedDB records (snowroute-userdata / packs), so the fault
// injections moved to the seams the code actually reads and writes now.
// Every CLAIM below is the 1.142 claim verbatim; only the seam moved.
//   A (DA-05, save): a CORRUPT legacy record can no longer block a save
//      at all (the save reads no record - it is one route's own store
//      write). The save lands in the store; the drained routes and the
//      corrupt record itself stay byte-exact. (Pre-1.166 the save read
//      the record strictly and refused; the refusal's purpose - never
//      lose a definition to a bad read - is now structural.)
//   B (DA-05, save): the store write itself fails (the IndexedDB put
//      throws) - the save must REFUSE, disclose, and register nothing;
//      the store keeps exactly the routes it had.
//   C (DA-01): a restore whose backup REPLACES a created route (streets
//      renamed Old Street -> New Street) must judge the carried snapshot
//      and the name-filtered fields against the INCOMING definition, and
//      the incoming definition must land IN THE STORE.
//   D (DA-05, restore priors): the store read of the route about to be
//      overwritten FAILS (UP_READ_FAILED) - the restore must refuse
//      before writing anything, exactly as the 1.142 merge-base refusal
//      did at the old seam.
//   E (DA-09 + DA-08): a recovery export when the boot store read failed
//      (upStoreComplete false, the cache provably incomplete). The file
//      must carry the created route's definition from memory (validated)
//      AND its running snapshot, and must restore cleanly on a device
//      whose store is empty. A route whose in-memory definition cannot
//      be validated is excluded and disclosed, never carried
//      unrestorably.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
await sleep(3000);
ok('S0 app boots for the created-route data-safety tests', await poll120(`!!window.maplibregl && !!document.querySelector('#map canvas')`, 45000));

const UPKEY = 'snowroute.v2.userpacks';
const PACK = (name, street) => ({ name, area: 'Vaughan', mains: [], roads: { [street]: [[[43.8, -79.57], [43.801, -79.571]]] }, reference: {} });
const reboot5w = async () => { await send('Page.navigate', { url }, S); await sleep(3500); await ev(`window.__userPacksReady`); await ev(`loadRoute('5w'); true`); await sleep(500); };
const seedLegacyAB = () => ev(`(() => { localStorage.setItem('${UPKEY}', JSON.stringify({ 'route-a': ${JSON.stringify(PACK('Route A', 'Alpha Street'))}, 'route-b': ${JSON.stringify(PACK('Route B', 'Beta Street'))} })); return true; })()`);
const armDraft = async (nm) => ev(`(() => { draft = newDraft(); draft.roads['Test Street'] = [[[43.8, -79.57], [43.801, -79.571]]]; $('crNameInput').value = '${nm}'; $('crAreaInput').value = 'Vaughan'; return true; })()`);
const storeKeys = async () => JSON.parse(await ev(`(async () => { const m = await upGetAll(); return JSON.stringify(m ? Object.keys(m).sort() : null); })()`));

// ---------- A/B: the save's seams after the monolith ----------
// Seed a/b through the legacy record and let a boot drain them into the
// store (the real first-1.166-launch path), then run both save cases
// against the store.
await seedLegacyAB(); await reboot5w();
ok('S1 setup: route-a + route-b drained into the store at boot', JSON.stringify(await storeKeys()) === JSON.stringify(['route-a', 'route-b']));
// A: plant a CORRUPT legacy record (the downgrade-shadow shape) - the
// save must not even consult it.
await ev(`(() => { localStorage.setItem('${UPKEY}', 'corrupt{json'); return true; })()`);
await armDraft('Route C');
await ev(`saveDraftRoute()`);
await sleep(300);
const aRes = JSON.parse(await ev(`(async () => { const m = await upGetAll(); return JSON.stringify({ keys: m ? Object.keys(m).sort() : null, legacy: localStorage.getItem('${UPKEY}'), toast: $('toast').textContent, registered: ROUTE_PACKS.some(p => p.id === 'route-c') }); })()`));
ok('A1 DA-05 save with a CORRUPT legacy record present: the save LANDS in the store (no record is read to save one route), route-a + route-b stay, and the corrupt record is left exactly as found | ' + JSON.stringify(aRes.keys) + ' ' + aRes.toast,
  JSON.stringify(aRes.keys) === JSON.stringify(['route-a', 'route-b', 'route-c']) && aRes.legacy === 'corrupt{json' && aRes.registered === true);
await ev(`(() => { localStorage.removeItem('${UPKEY}'); return true; })()`);
// B: the store write itself fails - refusal, disclosure, nothing moves.
await armDraft('Route D');
await ev(`(() => { const orig = IDBObjectStore.prototype.put; window.__origPut = orig; IDBObjectStore.prototype.put = function (rec) { if (this.name === 'packs' && rec && rec.name === 'Route D') throw new DOMException('drive163 injected put failure', 'QuotaExceededError'); return orig.apply(this, arguments); }; return true; })()`);
await ev(`saveDraftRoute()`);
await sleep(300);
await ev(`(() => { IDBObjectStore.prototype.put = window.__origPut; return true; })()`);
const bRes = JSON.parse(await ev(`(async () => { const m = await upGetAll(); return JSON.stringify({ keys: m ? Object.keys(m).sort() : null, toast: $('toast').textContent, registered: ROUTE_PACKS.some(p => p.id === 'route-d') }); })()`));
ok('B1 DA-05 save with a FAILING store write: refusal toast, the store keeps exactly route-a + route-b + route-c, the new pack is never registered | ' + JSON.stringify(bRes.keys) + ' ' + bRes.toast,
  JSON.stringify(bRes.keys) === JSON.stringify(['route-a', 'route-b', 'route-c']) && /could not be saved/.test(bRes.toast) && bRes.registered === false);

// ---------- C: a replacing restore is judged against the INCOMING definition ----------
await ev(`(() => { localStorage.setItem('${UPKEY}', JSON.stringify({ 'route-x': ${JSON.stringify(PACK('Route X', 'Old Street'))} })); return true; })()`);
await reboot5w(); // boot registers route-x with the OLD geometry (and drains it into the store)
const setupC = await ev(`ROUTE_PACKS.some(p => p.id === 'route-x' && p.roads['Old Street'])`);
ok('C0 setup: route-x registered with its OLD street', setupC === true);
const cRes = JSON.parse(await ev(`(async () => {
  const NEWRAW = { name: 'Route X', area: 'Vaughan', mains: [], roads: { 'New Street': [[[43.9, -79.6], [43.901, -79.601]]] }, reference: {} };
  const v = normalizePack(NEWRAW, {}); if (!v.ok) return JSON.stringify({ setupFail: v.error });
  const g = packGeometry(v.pack); const TS = 1794000000000;
  const pieces = {}, pieceTimes = {};
  for (const n of g.names) { pieces[n] = g.stretch[n].parts.map(() => 0); pieceTimes[n] = g.stretch[n].parts.map(() => [null, null]); }
  const snap = { at: TS, pieces, pieceTimes, done: [], times: {}, via: {}, cov: {} };
  if (!validateSnap(snap, TS, g)) return JSON.stringify({ setupFail: 'fixture snap invalid against the new geometry' });
  const sides = { p: { 'New Street': g.stretch['New Street'].parts.map(() => 0) }, t: { 'New Street': g.stretch['New Street'].parts.map(() => [null, null]) } };
  const backup = { app: 'snowroute-backup', v: 2, at: new Date().toISOString(), routes: { 'route-x': { start: String(TS), snap: JSON.stringify(snap), done: '{"New Street":1700000000000}', times: '{}', hist: '[]', notes: '{}', via: '{}', trail: '[]', cov: '{}', sides: JSON.stringify(sides), sess: '[]' } }, userpacks: { 'route-x': NEWRAW } };
  await restoreBackup(backup);
  const rk = routeKeys('route-x');
  const stored = await upGet('route-x');
  return JSON.stringify({ snap: localStorage.getItem(rk.snap), done: localStorage.getItem(rk.done), storedNew: !!stored && !!stored.roads && !!stored.roads['New Street'], toast: $('toast').textContent });
})()`));
ok('C1 DA-01 the carried snapshot is judged against the INCOMING geometry and lands, naming the new street | ' + JSON.stringify(cRes).slice(0, 300),
  !cRes.setupFail && !!cRes.snap && cRes.snap.includes('New Street'));
ok('C2 DA-01 the done list is name-filtered against the INCOMING street set - New Street survives (legacy OBJECT form: the only form pushField name-filters; an array would pass unfiltered and prove nothing) | done=' + cRes.done,
  !cRes.setupFail && cRes.done === '["New Street"]');
ok('C3 DA-01 no unknown-name or dropped-snapshot report, and the incoming definition is installed IN THE STORE | ' + cRes.toast,
  !cRes.setupFail && !/unknown street name/.test(cRes.toast) && !/start snapshot was not usable/.test(cRes.toast) && cRes.storedNew === true);
await reboot5w(); // absorb the restore's reload

// ---------- D: a failed strict prior-read refuses the whole restore ----------
const doneBefore = await ev(`localStorage.getItem(routeKeys('5w').done)`);
const keysBeforeD = await storeKeys();
await ev(`(() => { const orig = window.upGet; window.__origUpGet = orig; let n = 0; window.upGet = async function (id) { n++; if (n === 1) return UP_READ_FAILED; return orig(id); }; return true; })()`);
const dRes = JSON.parse(await ev(`(async () => {
  const backup = { app: 'snowroute-backup', v: 2, at: new Date().toISOString(), routes: { '5w': { done: '["Velmar"]' } }, userpacks: { 'route-z': ${JSON.stringify(PACK('Route Z', 'Zeta Street'))} } };
  await restoreBackup(backup);
  return JSON.stringify({ done: localStorage.getItem(routeKeys('5w').done), toast: $('toast').textContent });
})()`));
await ev(`(() => { window.upGet = window.__origUpGet; return true; })()`);
ok('D1 DA-05 restore with a FAILED store prior-read: refusal toast naming the unreadable store | ' + dRes.toast,
  /created-routes store could not be read/.test(dRes.toast));
ok('D2 DA-05 nothing was written - the 5W board is untouched and the store gained no route-z | keys=' + JSON.stringify(await storeKeys()),
  dRes.done === doneBefore && JSON.stringify(await storeKeys()) === JSON.stringify(keysBeforeD));
await reboot5w();

// ---------- E: recovery export when the boot store read failed ----------
await ev(`(() => { localStorage.setItem('${UPKEY}', JSON.stringify({ 'route-r': ${JSON.stringify(PACK('Route R', 'Test Street'))} })); return true; })()`);
await reboot5w(); // boot registers route-r (drained into the store)
const eSetup = JSON.parse(await ev(`(() => {
  const pk = ROUTE_PACKS.find(p => p.id === 'route-r'); if (!pk) return JSON.stringify({ setupFail: 'route-r not registered' });
  const g = packGeometry(pk); const TS = 1794000000000;
  const pieces = {}, pieceTimes = {};
  for (const n of g.names) { pieces[n] = g.stretch[n].parts.map(() => 0); pieceTimes[n] = g.stretch[n].parts.map(() => [null, null]); }
  const snap = { at: TS, pieces, pieceTimes, done: [], times: {}, via: {}, cov: {} };
  if (!validateSnap(snap, TS, g)) return JSON.stringify({ setupFail: 'fixture snap invalid' });
  const rk = routeKeys('route-r');
  localStorage.setItem(rk.start, String(TS)); localStorage.setItem(rk.snap, JSON.stringify(snap)); localStorage.setItem(rk.done, '[]');
  return JSON.stringify({ ok: true });
})()`));
ok('E0 setup: route-r registered and running with a valid stored snapshot', eSetup.ok === true);
// The failed-boot-read state, induced on the app's own state variables:
// the store read did not earn completeness and the cache holds nothing
// for the route (the state initUserPacks leaves in exactly that case),
// so memory is the only source a recovery file can carry it from.
await ev(`(() => { upStoreComplete = false; userPackCache = {}; return true; })()`);
const recovRaw = await ev(`buildRecovery()`);
const recov = recovRaw ? JSON.parse(recovRaw) : null;
ok('E1 DA-09 recovery with a failed store read still carries the created route definition, from memory | userpacks=' + (recov && recov.userpacks ? Object.keys(recov.userpacks).join(',') : 'ABSENT'),
  !!recov && !!recov.userpacks && !!recov.userpacks['route-r'] && !!recov.userpacks['route-r'].roads['Test Street']);
let eSnap = null; try { eSnap = JSON.parse(recov.routes['route-r'].snap); } catch (e) {}
ok('E2 DA-08 the recovery file carries the non-active running route\'s validated snapshot | snap=' + (recov && recov.routes['route-r'] ? String(recov.routes['route-r'].snap).slice(0, 80) : 'ABSENT'),
  !!eSnap && !!eSnap.pieces && Array.isArray(eSnap.pieces['Test Street']));
// E4: a created route whose in-memory definition cannot be validated is
// excluded from the file and disclosed - never carried unrestorably.
await ev(`(() => { const pk = ROUTE_PACKS.find(p => p.id === 'route-r'); window.__savedRoads = pk.roads; pk.roads = { 'Broken Street': [] }; return true; })()`);
const recov2Raw = await ev(`buildRecovery()`);
const disclosure = await ev(`(typeof recoveryDisclosure !== 'undefined' && recoveryDisclosure) ? recoveryDisclosure.slice() : null`);
await ev(`(() => { const pk = ROUTE_PACKS.find(p => p.id === 'route-r'); if (pk && window.__savedRoads) pk.roads = window.__savedRoads; return true; })()`);
const recov2 = recov2Raw ? JSON.parse(recov2Raw) : null;
ok('E4 DA-09 an unvalidatable in-memory definition is EXCLUDED (its progress too) and NAMED in the recovery disclosure | disclosure=' + JSON.stringify(disclosure),
  !!recov2 && !(recov2.routes && recov2.routes['route-r']) && Array.isArray(disclosure) && disclosure.includes('Route R'));
// E3: the E1/E2 file restores cleanly on a device whose store is empty.
// route-r's definition leaves the store AND its slots are wiped, both
// proven before the restore - otherwise seeded state could fake the
// landing (the 1.142 Codex cycle-1 catch, re-seamed).
await ev(`(async () => { await upDel('route-r'); return true; })()`);
await reboot5w();
const e3Res = JSON.parse(await ev(`(async () => {
  const rk = routeKeys('route-r');
  for (const k of Object.values(rk)) localStorage.removeItem(k);
  const absent = localStorage.getItem(rk.start) === null && localStorage.getItem(rk.snap) === null && !(await upGet('route-r'));
  await restoreBackup(JSON.parse(${JSON.stringify(JSON.stringify(recov))}));
  const stored = await upGet('route-r');
  return JSON.stringify({ absent, stored: !!stored && !!stored.roads && !!stored.roads['Test Street'], snap: localStorage.getItem(routeKeys('route-r').snap), toast: $('toast').textContent });
})()`));
ok('E3 DA-09+DA-08 fresh-device restore of the recovery file: definition + slots proven absent first, definition rebuilt IN THE STORE, snapshot lands | ' + e3Res.toast,
  e3Res.absent === true && e3Res.stored === true && !!e3Res.snap && e3Res.snap.includes('Test Street') && /Backup restored/.test(e3Res.toast));

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);
