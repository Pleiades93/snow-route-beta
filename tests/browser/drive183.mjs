import { launchDrive, finish, PATTERNS_GITHUB_IO } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll, url } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });

// drive183: Beta 1.166 - the created-route MONOLITH migration. Through
// 1.165 every created route's geometry lived in ONE localStorage record
// (snowroute.v2.userpacks); 1.166 moves each route to its own record in
// the IndexedDB store (snowroute-userdata / packs). The claims:
//   M1 a seeded legacy monolith (two small routes + one LARGE route,
//      ~120k points / ~2.9 MB serialized) drains whole: every route is
//      registered and loadable, every store record is content-equal to
//      the legacy value it came from.
//   M2 marker semantics: the migration marker is written, the legacy
//      record is deleted, and localStorage holds ZERO created-route
//      geometry afterwards.
//   M3 interrupted drain: with store writes fault-blocked, the boot
//      completes on the legacy data (routes listed, a backup still
//      exports them), NO marker is written and the legacy record is
//      untouched; the next unblocked boot completes the drain.
//   M4 a legacy record planted AFTER migration (the downgrade shape)
//      is read, drained and deleted again - never stranded.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const UPKEY = 'snowroute.v2.userpacks';
const MIGKEY = 'snowroute.v2.userpacks.migrated';
const PACK = (name, street) => ({ name, area: 'Vaughan', mains: [], roads: { [street]: [[[43.8, -79.57], [43.801, -79.571]]] }, reference: {} });
// The large pack is generated IN-PAGE by a deterministic builder (a ~3 MB
// fixture string would have to cross CDP otherwise); the same builder
// re-derives the expected value at verify time, so parity is judged
// against the generator, never against a transported copy. Its shape is
// a REAL large pack's shape - 150 streets x 8 segments x 100 points
// (120,000 points, ~3 MB): the segment count is what the geometry
// machinery's cost scales with, and a real city extract has long
// segments, not thousands of stubs (a 6,000-stub-segment first draft of
// this fixture made loadRoute's chaining pass burn minutes of CPU -
// the fixture was unrealistic, not the app slow).
const BIG_BUILDER = `(() => { const roads = {}; for (let s = 0; s < 150; s++) { const segs = []; for (let g = 0; g < 8; g++) { const pts = []; for (let p = 0; p < 100; p++) pts.push([43.8 + s * 0.001 + g * 0.006 + p * 0.00005, -79.57 - s * 0.001 - p * 0.00004]); segs.push(pts); } roads['Big Street ' + s] = segs; } return { name: 'Big Route', area: 'Vaughan', mains: [], roads, reference: {} }; })()`;
const seedLegacy = () => ev(`(() => { const big = ${BIG_BUILDER}; const rec = { 'route-small-a': ${JSON.stringify(PACK('Small A', 'Alpha Street'))}, 'route-small-b': ${JSON.stringify(PACK('Small B', 'Beta Street'))}, 'route-big': big }; localStorage.setItem('${UPKEY}', JSON.stringify(rec)); return JSON.stringify({ bytes: JSON.stringify(rec).length, bigPts: Object.values(big.roads).flat().reduce((a, sg) => a + sg.length, 0) }); })()`);
const navigate = async () => { await send('Page.navigate', { url }, S); await sleep(3000); }; // the house post-navigate settle (drive163's reboot shape): the new document must own the session before any status is read
const waitInit = async () => { await poll(`!!window.__userPacksStatus && window.__userPacksStatus().state !== 'boot'`, 30000); await ev(`window.__userPacksReady`); };

ok('S0 app boots for the migration tests', await poll(`!!window.maplibregl && !!document.querySelector('#map canvas')`, 45000));

// ---------- M1/M2: the seeded monolith drains whole ----------
const seedInfo = JSON.parse(await seedLegacy());
ok('M0 setup: the seeded monolith is genuinely large (' + seedInfo.bytes + ' bytes, big pack ' + seedInfo.bigPts + ' points)', seedInfo.bytes > 2000000 && seedInfo.bigPts === 120000);
await navigate(); await waitInit();
const m1 = JSON.parse(await ev(`(async () => { const stored = await upGetAll(); const big = ${BIG_BUILDER}; return JSON.stringify({ status: window.__userPacksStatus(), storeKeys: stored ? Object.keys(stored).sort() : null, bigParity: !!stored && !!stored['route-big'] && upCanon(stored['route-big']) === upCanon({ ...big, id: 'route-big' }), aParity: !!stored && !!stored['route-small-a'] && stored['route-small-a'].name === 'Small A' && !!stored['route-small-a'].roads['Alpha Street'], registered: ROUTE_PACKS.map(p => p.id).sort(), marker: localStorage.getItem('${MIGKEY}'), legacy: localStorage.getItem('${UPKEY}') }); })()`));
ok('M1 the drain reports every route migrated (3 from legacy, 3 drained, marker earned, legacy deleted) | ' + JSON.stringify(m1.status),
  m1.status.fromLegacy === 3 && m1.status.drained === 3 && m1.status.migrated === true && m1.status.legacyDeleted === true);
ok('M1b the store holds exactly the three routes, the large one content-equal to its legacy value | store=' + JSON.stringify(m1.storeKeys) + ' bigParity=' + m1.bigParity,
  JSON.stringify(m1.storeKeys) === JSON.stringify(['route-big', 'route-small-a', 'route-small-b']) && m1.bigParity === true && m1.aParity === true);
ok('M2 marker written, legacy record gone, all three routes registered | marker=' + m1.marker + ' registered=' + JSON.stringify(m1.registered),
  m1.marker === '1' && m1.legacy === null && ['route-big', 'route-small-a', 'route-small-b'].every(id => m1.registered.includes(id)));
await ev(`loadRoute('route-big'); true`); await sleep(2500);
const m1c = JSON.parse(await ev(`JSON.stringify({ loaded: typeof routeLoaded !== 'undefined' && routeLoaded === true && !!activeRoute && activeRoute.id === 'route-big', streets: typeof STREETNAMES !== 'undefined' ? STREETNAMES.length : -1 })`));
ok('M1c the migrated LARGE route actually loads (150 streets of geometry) | ' + JSON.stringify(m1c), m1c.loaded === true && m1c.streets === 150);
await ev(`loadRoute('route-small-a'); true`); await sleep(1200);
const m1d = await ev(`typeof routeLoaded !== 'undefined' && routeLoaded === true && !!activeRoute && activeRoute.id === 'route-small-a'`);
ok('M1d a migrated small route loads too', m1d === true);

// ---------- M3: an interrupted drain leaves the app whole on legacy ----------
// Re-seed a fresh legacy record (a second device shape: marker already
// set from M1, store already holding copies - the drain must still be
// all-or-nothing for the NEW record's routes), block store writes at
// the IndexedDB seam via a document-start patch gated on a flag key,
// and boot. The legacy routes must serve the boot; nothing may commit.
await ev(`(async () => { await upDel('route-small-a'); await upDel('route-small-b'); await upDel('route-big'); return true; })()`);
const seed2 = JSON.parse(await seedLegacy());
await ev(`localStorage.setItem('__d183block', '1'); true`);
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const orig = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...a) { let blocked = false; try { blocked = !!localStorage.getItem('__d183block'); } catch (e) {} if (blocked && this.name === 'packs') throw new DOMException('drive183 blocked put', 'QuotaExceededError'); return orig.apply(this, a); }; })();` }, S);
await navigate(); await waitInit();
const m3 = JSON.parse(await ev(`(async () => { const stored = await upGetAll(); const bak = buildBackup(); return JSON.stringify({ status: window.__userPacksStatus(), storeKeys: stored ? Object.keys(stored) : null, legacyThere: localStorage.getItem('${UPKEY}') !== null, registered: ROUTE_PACKS.map(p => p.id).sort(), bakPacks: bak ? Object.keys(JSON.parse(bak).userpacks || {}).sort() : null }); })()`));
ok('M3 interrupted drain commits NOTHING: no marker claim, store still empty, legacy record untouched | ' + JSON.stringify(m3.status),
  m3.status.migrated === false && JSON.stringify(m3.storeKeys) === '[]' && m3.legacyThere === true);
ok('M3b the app is fully usable on the legacy data mid-failure: all three routes registered and a backup still exports all three definitions | bak=' + JSON.stringify(m3.bakPacks),
  ['route-big', 'route-small-a', 'route-small-b'].every(id => m3.registered.includes(id)) && JSON.stringify(m3.bakPacks) === JSON.stringify(['route-big', 'route-small-a', 'route-small-b']));
await ev(`localStorage.removeItem('__d183block'); true`);
await navigate(); await waitInit();
const m3b = JSON.parse(await ev(`(async () => { const stored = await upGetAll(); return JSON.stringify({ status: window.__userPacksStatus(), storeKeys: stored ? Object.keys(stored).sort() : null, legacy: localStorage.getItem('${UPKEY}'), marker: localStorage.getItem('${MIGKEY}') }); })()`));
ok('M3c the next unblocked boot RETRIES and completes the drain (marker + legacy deletion land) | ' + JSON.stringify(m3b.status),
  m3b.status.migrated === true && m3b.legacy === null && m3b.marker === '1' && JSON.stringify(m3b.storeKeys) === JSON.stringify(['route-big', 'route-small-a', 'route-small-b']));

// ---------- M4: a post-migration legacy record is never stranded ----------
await ev(`(() => { localStorage.setItem('${UPKEY}', JSON.stringify({ 'route-decoy': ${JSON.stringify(PACK('Decoy Route', 'Decoy Street'))} })); return true; })()`);
await navigate(); await waitInit();
const m4 = JSON.parse(await ev(`(async () => { const stored = await upGetAll(); return JSON.stringify({ decoyInStore: !!stored && !!stored['route-decoy'], registered: ROUTE_PACKS.some(p => p.id === 'route-decoy'), legacy: localStorage.getItem('${UPKEY}') }); })()`));
ok('M4 a legacy record planted after migration (the downgrade shape) is registered, drained into the store, and the record deleted again | ' + JSON.stringify(m4),
  m4.decoyInStore === true && m4.registered === true && m4.legacy === null);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);
