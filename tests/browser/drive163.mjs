import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, url, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive163: Beta 1.142 (Package B: DA-05 / DA-01 / DA-09 / DA-08) - the
// created-routes record and the backup family must never lose a route
// definition to a bad read. Four fault shapes, all injected at the
// localStorage seam (the drive136/drive162 stub pattern; stubs are page-side
// and a reload wipes them, so every post-reload case re-installs its own):
//   A/B (DA-05, save): the userpacks read throws / returns corrupt JSON
//       during saveDraftRoute - the save must REFUSE and the stored record
//       (and the runtime registry) must stay exactly as seeded. Pre-1.142
//       the lenient loader turned the failure into {} and the save rewrote
//       the record with only the new route in it.
//   C (DA-01): a restore whose backup REPLACES a created route (streets
//       renamed Old Street -> New Street) must judge the carried snapshot
//       and the name-filtered fields against the INCOMING definition.
//       Pre-1.142 the existing definition won every lookup: the snapshot
//       was dropped as unusable and the done list filtered to empty.
//   D (DA-05, restore merge): the userpacks read throws on its FIRST read
//       only (transient - the rollback-scope snapshot read right after
//       succeeds). The restore must refuse before writing anything.
//       Pre-1.142 the merge built the replacement record from {} and the
//       restore committed it, deleting the other definitions.
//   E (DA-09 + DA-08): a recovery export while the userpacks read throws.
//       The file must carry the created route's definition from memory
//       (validated) AND its running snapshot, and must restore cleanly on
//       a device whose record is gone. A route whose in-memory definition
//       cannot be validated is excluded and disclosed, never carried
//       unrestorably. Pre-1.142 both were silently omitted.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
await sleep(3000);
ok('S0 app boots for the created-route data-safety tests', await poll120(`!!window.maplibregl && !!document.querySelector('#map canvas')`, 45000));

const UPKEY = 'snowroute.v2.userpacks';
const PACK = (name, street) => ({ name, area: 'Vaughan', mains: [], roads: { [street]: [[[43.8, -79.57], [43.801, -79.571]]] }, reference: {} });
const reboot5w = async () => { await send('Page.navigate', { url }, S); await sleep(3500); await ev(`loadRoute('5w'); true`); await sleep(500); };
const UNSTUB = `(() => { if (window.__origGet) Storage.prototype.getItem = window.__origGet; return true; })()`;
const GET_THROW = `(() => { const orig = Storage.prototype.getItem; window.__origGet = orig; Storage.prototype.getItem = function (k) { if (k === '${UPKEY}') throw new Error('injected read failure'); return orig.call(this, k); }; return true; })()`;
const GET_CORRUPT = `(() => { const orig = Storage.prototype.getItem; window.__origGet = orig; Storage.prototype.getItem = function (k) { if (k === '${UPKEY}') return 'corrupt{json'; return orig.call(this, k); }; return true; })()`;
const GET_THROW_FIRST = `(() => { const orig = Storage.prototype.getItem; window.__origGet = orig; window.__upReads = 0; Storage.prototype.getItem = function (k) { if (k === '${UPKEY}') { window.__upReads++; if (window.__upReads === 1) throw new Error('injected transient read failure'); } return orig.call(this, k); }; return true; })()`;

// ---------- A/B: saveDraftRoute must refuse on a failed strict read ----------
const seedAB = async () => ev(`(() => { localStorage.setItem('${UPKEY}', JSON.stringify({ 'route-a': ${JSON.stringify(PACK('Route A', 'Alpha Street'))}, 'route-b': ${JSON.stringify(PACK('Route B', 'Beta Street'))} })); return true; })()`);
const armDraft = async (nm) => ev(`(() => { draft = newDraft(); draft.roads['Test Street'] = [[[43.8, -79.57], [43.801, -79.571]]]; $('crNameInput').value = '${nm}'; $('crAreaInput').value = 'Vaughan'; return true; })()`);
const readRecord = async () => JSON.parse(await ev(`JSON.stringify({ raw: localStorage.getItem('${UPKEY}'), toast: $('toast').textContent })`));
const saveCase = async (stub, nm, id) => {
  await seedAB(); await armDraft(nm);
  await ev(stub);
  await ev(`saveDraftRoute(); true`);
  await ev(UNSTUB);
  const st = await readRecord();
  let keys = null; try { keys = Object.keys(JSON.parse(st.raw)).sort(); } catch (e) {}
  const registered = await ev(`ROUTE_PACKS.some(p => p.id === '${id}')`);
  return { st, keys, registered };
};
const aRes = await saveCase(GET_THROW, 'Route C', 'route-c');
ok('A1 DA-05 save with a THROWING userpacks read: refusal toast, record keeps route-a + route-b exactly, new pack never registered | ' + JSON.stringify(aRes.keys) + ' ' + aRes.st.toast,
  JSON.stringify(aRes.keys) === JSON.stringify(['route-a', 'route-b']) && /could not be saved/.test(aRes.st.toast) && aRes.registered === false);
const bRes = await saveCase(GET_CORRUPT, 'Route D', 'route-d');
ok('B1 DA-05 save with a CORRUPT userpacks record: same refusal - parse failure is a failure, not an empty record | ' + JSON.stringify(bRes.keys) + ' ' + bRes.st.toast,
  JSON.stringify(bRes.keys) === JSON.stringify(['route-a', 'route-b']) && /could not be saved/.test(bRes.st.toast) && bRes.registered === false);

// ---------- C: a replacing restore is judged against the INCOMING definition ----------
await ev(`(() => { localStorage.setItem('${UPKEY}', JSON.stringify({ 'route-x': ${JSON.stringify(PACK('Route X', 'Old Street'))} })); return true; })()`);
await reboot5w(); // boot merge registers route-x with the OLD geometry
const setupC = await ev(`ROUTE_PACKS.some(p => p.id === 'route-x' && p.roads['Old Street'])`);
ok('C0 setup: route-x registered with its OLD street', setupC === true);
const cRes = JSON.parse(await ev(`(() => {
  const NEWRAW = { name: 'Route X', area: 'Vaughan', mains: [], roads: { 'New Street': [[[43.9, -79.6], [43.901, -79.601]]] }, reference: {} };
  const v = normalizePack(NEWRAW, {}); if (!v.ok) return JSON.stringify({ setupFail: v.error });
  const g = packGeometry(v.pack); const TS = 1794000000000;
  const pieces = {}, pieceTimes = {};
  for (const n of g.names) { pieces[n] = g.stretch[n].parts.map(() => 0); pieceTimes[n] = g.stretch[n].parts.map(() => [null, null]); }
  const snap = { at: TS, pieces, pieceTimes, done: [], times: {}, via: {}, cov: {} };
  if (!validateSnap(snap, TS, g)) return JSON.stringify({ setupFail: 'fixture snap invalid against the new geometry' });
  const sides = { p: { 'New Street': g.stretch['New Street'].parts.map(() => 0) }, t: { 'New Street': g.stretch['New Street'].parts.map(() => [null, null]) } };
  const backup = { app: 'snowroute-backup', v: 2, at: new Date().toISOString(), routes: { 'route-x': { start: String(TS), snap: JSON.stringify(snap), done: '["New Street"]', times: '{}', hist: '[]', notes: '{}', via: '{}', trail: '[]', cov: '{}', sides: JSON.stringify(sides), sess: '[]' } }, userpacks: { 'route-x': NEWRAW } };
  restoreBackup(backup);
  const rk = routeKeys('route-x');
  return JSON.stringify({ snap: localStorage.getItem(rk.snap), done: localStorage.getItem(rk.done), rec: localStorage.getItem('${UPKEY}'), toast: $('toast').textContent });
})()`));
ok('C1 DA-01 the carried snapshot is judged against the INCOMING geometry and lands, naming the new street | ' + JSON.stringify(cRes).slice(0, 300),
  !cRes.setupFail && !!cRes.snap && cRes.snap.includes('New Street'));
ok('C2 DA-01 the done list is name-filtered against the INCOMING street set - New Street survives | done=' + cRes.done,
  !cRes.setupFail && cRes.done === '["New Street"]');
ok('C3 DA-01 no unknown-name or dropped-snapshot report, and the incoming definition is installed in the record | ' + cRes.toast,
  !cRes.setupFail && !/unknown street name/.test(cRes.toast) && !/start snapshot was not usable/.test(cRes.toast) && !!cRes.rec && cRes.rec.includes('New Street'));
await reboot5w(); // absorb the restore's reload

// ---------- D: a transient merge-time read failure refuses the whole restore ----------
await seedAB();
const doneBefore = await ev(`localStorage.getItem(routeKeys('5w').done)`);
await ev(GET_THROW_FIRST);
const dRes = JSON.parse(await ev(`(() => {
  const backup = { app: 'snowroute-backup', v: 2, at: new Date().toISOString(), routes: { '5w': { done: '["Velmar"]' } }, userpacks: { 'route-c': ${JSON.stringify(PACK('Route C', 'Gamma Street'))} } };
  restoreBackup(backup);
  return JSON.stringify({ rec: localStorage.getItem('${UPKEY}'), done: localStorage.getItem(routeKeys('5w').done), toast: $('toast').textContent });
})()`));
await ev(UNSTUB);
let dKeys = null; try { dKeys = Object.keys(JSON.parse(dRes.rec)).sort(); } catch (e) {}
ok('D1 DA-05 restore with a TRANSIENT merge-time read failure: refusal toast naming the unreadable record | ' + dRes.toast,
  /created-routes record could not be read/.test(dRes.toast));
ok('D2 DA-05 nothing was written - the record keeps route-a + route-b and the 5W board is untouched | ' + JSON.stringify(dKeys),
  JSON.stringify(dKeys) === JSON.stringify(['route-a', 'route-b']) && dRes.done === doneBefore);
await reboot5w();

// ---------- E: recovery export under a dead userpacks read ----------
await ev(`(() => { localStorage.setItem('${UPKEY}', JSON.stringify({ 'route-r': ${JSON.stringify(PACK('Route R', 'Test Street'))} })); return true; })()`);
await reboot5w(); // boot merge registers route-r
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
await ev(GET_THROW);
const recovRaw = await ev(`buildRecovery()`);
await ev(UNSTUB);
const recov = recovRaw ? JSON.parse(recovRaw) : null;
ok('E1 DA-09 recovery with a dead userpacks read still carries the created route definition, from memory | userpacks=' + (recov && recov.userpacks ? Object.keys(recov.userpacks).join(',') : 'ABSENT'),
  !!recov && !!recov.userpacks && !!recov.userpacks['route-r'] && !!recov.userpacks['route-r'].roads['Test Street']);
let eSnap = null; try { eSnap = JSON.parse(recov.routes['route-r'].snap); } catch (e) {}
ok('E2 DA-08 the recovery file carries the non-active running route\'s validated snapshot | snap=' + (recov && recov.routes['route-r'] ? String(recov.routes['route-r'].snap).slice(0, 80) : 'ABSENT'),
  !!eSnap && !!eSnap.pieces && Array.isArray(eSnap.pieces['Test Street']));
// E4: a created route whose in-memory definition cannot be validated is
// excluded from the file and disclosed - never carried unrestorably.
await ev(`(() => { const pk = ROUTE_PACKS.find(p => p.id === 'route-r'); window.__savedRoads = pk.roads; pk.roads = { 'Broken Street': [] }; return true; })()`);
await ev(GET_THROW);
const recov2Raw = await ev(`buildRecovery()`);
const disclosure = await ev(`(typeof recoveryDisclosure !== 'undefined' && recoveryDisclosure) ? recoveryDisclosure.slice() : null`);
await ev(UNSTUB);
await ev(`(() => { const pk = ROUTE_PACKS.find(p => p.id === 'route-r'); if (pk && window.__savedRoads) pk.roads = window.__savedRoads; return true; })()`);
const recov2 = recov2Raw ? JSON.parse(recov2Raw) : null;
ok('E4 DA-09 an unvalidatable in-memory definition is EXCLUDED (its progress too) and NAMED in the recovery disclosure | disclosure=' + JSON.stringify(disclosure),
  !!recov2 && !(recov2.routes && recov2.routes['route-r']) && Array.isArray(disclosure) && disclosure.includes('Route R'));
// E3: the E1/E2 file restores cleanly on a device whose record is gone.
await ev(`localStorage.removeItem('${UPKEY}'); true`);
await reboot5w();
const e3Res = JSON.parse(await ev(`(() => {
  restoreBackup(JSON.parse(${JSON.stringify(JSON.stringify(recov))}));
  return JSON.stringify({ rec: localStorage.getItem('${UPKEY}'), snap: localStorage.getItem(routeKeys('route-r').snap), toast: $('toast').textContent });
})()`));
let e3Keys = null; try { e3Keys = Object.keys(JSON.parse(e3Res.rec)); } catch (e) {}
ok('E3 DA-09+DA-08 fresh-device restore of the recovery file: definition rebuilt in the record, snapshot lands | ' + e3Res.toast,
  !!e3Keys && e3Keys.includes('route-r') && !!e3Res.snap && e3Res.snap.includes('Test Street') && /Backup restored/.test(e3Res.toast));

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);
