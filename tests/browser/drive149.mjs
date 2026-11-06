import { launchDrive, finish } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// drive149: Beta 1.117 route separation (segregation audit F1-F8). The app
// must boot with NO route baked in, load Route 5W as a pack, switch live to
// a second pack (injected here as a test fixture only, the segregation
// drive's pattern - never in the shipped ROUTE_PACKS), and switch back with
// the 5W storage slot BYTE-IDENTICAL. Switch semantics under test (= a cold
// boot on the target route plus a pre-flush): a run in progress on the
// outgoing route is NOT ended - it persists in its slot and resumes on
// return; the outgoing route's pending writes (an armed trail point and an
// unsaved note, armed in the SAME evaluate as the switch so no heartbeat
// can land them first) must be flushed by the switch itself (F2); the
// in-memory cancel snapshot is cleared (F3) while the persisted one
// survives, so Cancel after switching back restores through the persisted
// snapshot exactly as after a reload. Also: an empty pack loads clean
// (F1), the preload manifest is the frozen 897 before any pick and GROWS
// when a second pack is known (F5), and a restore performed while route B
// is open derives route A's sides through A's OWN geometry (F6).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const FIXTURE = {
  id: 'fx149', name: 'Fixture Route', area: 'Testville', main: ['Fixture Main'],
  roads: {
    'Fixture Main': [[[43.82, -79.575], [43.82, -79.57], [43.82, -79.565]]],
    'Fixture Alpha': [[[43.815, -79.57], [43.82, -79.57], [43.825, -79.57]]],
    'Fixture Beta': [[[43.816, -79.56], [43.818, -79.558]]],
    'Fixture Gamma': [[[43.845, -79.57], [43.845, -79.566]]]
  },
  reference: {}
};
const dump5wSrc = `(() => { const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('snowroute.5w.') === 0) ks.push(k); } ks.sort(); const o = {}; for (const k of ks) o[k] = localStorage.getItem(k); return JSON.stringify(o); })()`;

// ---------- B: boot with no route baked in ----------
await poll(`typeof loadRoute === 'function'`, 20000);
await poll(`!!window.__bootAt`, 30000);
await poll(`!document.getElementById('splash') || document.getElementById('routeMenu').classList.contains('show')`, 30000);
const B = await J(`({ loaded: routeLoaded, names: STREETNAMES.length, stretch: Object.keys(STRETCH).length, box: routeBox, mains: MAIN.size, spots: Object.keys(SPOT).length, roads: Object.keys(ROADS).length })`);
ok('B1 at boot no route is loaded and NO street geometry exists (names/stretch/roads empty, routeBox null) | ' + JSON.stringify(B),
  B.loaded === false && B.names === 0 && B.stretch === 0 && B.box === null && B.mains === 0 && B.spots === 0 && B.roads === 0);
await ev(`document.getElementById('rmChoose').click()`);
const rows = await J(`({ n: document.querySelectorAll('#rmRoutes .routeRow').length, first: (document.querySelector('#rmRoutes .routeRow') || {}).textContent || '' })`);
ok('B2 the boot picker offers exactly the one shipped pack (Route 5W) | ' + JSON.stringify(rows), rows.n === 1 && rows.first.indexOf('Route 5W') >= 0);
const B3 = await J(`({ n: preloadUrlList().length, fp: packMigFingerprint(preloadUrlList()) })`);
ok('B3 the offline manifest is the frozen 897 (fingerprint v1:897:mm56ak) BEFORE any route is chosen - it reads pack data, never a live route | ' + JSON.stringify(B3), B3.n === 897 && B3.fp === 'v1:897:mm56ak');

// ---------- L: load 5W through the real boot pick ----------
await ev(`document.querySelector('#rmRoutes .routeRow').click()`);
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
await poll(`!document.getElementById('splash')`, 20000);
await poll(`typeof map === 'undefined' || !map || !map.isMoving()`, 25000);
const L = await J(`({ names: STREETNAMES.length, mains: MAIN.size, velmar: Math.round(STRETCH.Velmar.total), total: Math.round(totalWorkM()), parts: Object.values(STRETCH).reduce((a, s) => a + s.parts.length, 0), box: !!routeBox, tiles: ROUTE_TILE_NAMES.length })`);
ok('L1 5W loads as a pack with its exact geometry (34 streets, 6 mains, Velmar ~1686 m, 87 stretches, ~35352 m of sides, 68 tile names) | ' + JSON.stringify(L),
  L.names === 34 && L.mains === 6 && L.velmar >= 1683 && L.velmar <= 1689 && L.parts === 87 && L.total >= 35340 && L.total <= 35365 && L.box === true && L.tiles === 68);
const L2 = await J(`document.body.innerText.indexOf('of 34') >= 0`);
ok('L2 the count reads "of 34" for the loaded pack', L2 === true);

// ---------- W: work on 5W - marks, a note, a run, more run work ----------
await ev(`markDone('Velmar', 'drive149')`);
await ev(`setNoteText('Velmar', 'drive149 note')`);
await ev(`(() => { navigator.geolocation.watchPosition = () => 4242; navigator.geolocation.clearWatch = () => {}; return true; })()`);
await ev(`startClean()`);
await ev(`markDone('Astona', 'drive149')`); // run work AFTER Start - the cancel snapshot must NOT contain it
const W = await J(`({ velmar: streetComplete('Velmar'), astona: streetComplete('Astona'), note: noteTextOf('Velmar'), run: runStart > 0, snapStored: !!localStorage.getItem('snowroute.5w.v5.snap'), snapMem: !!runSnap })`);
ok('W1 pre-switch state: Velmar + Astona complete, note saved, run started, cancel snapshot persisted AND in memory | ' + JSON.stringify(W),
  W.velmar === true && W.astona === true && W.note === 'drive149 note' && W.run === true && W.snapStored === true && W.snapMem === true);
const RS = await J(`runStart`);

// ---------- S: switch to the fixture - atomically arming pending writes first (F2) ----------
await ev(`(() => { ROUTE_PACKS.push(${JSON.stringify(FIXTURE)}); return true; })()`);
await ev(`(() => { trail.push([43.820123, -79.570123, Math.floor(Date.now() / 1000)]); markDirty('trail'); notes['Astona'] = [{ k: 'note', at: new Date().toISOString(), text: 'armed at switch' }]; markDirty('primary'); loadRoute('fx149'); return true; })()`);
const S1 = await J(`({ id: activeRoute && activeRoute.id, names: STREETNAMES.slice(), mains: [...MAIN], mainParts: STRETCH['Fixture Main'].parts.length, alphaParts: STRETCH['Fixture Alpha'].parts.length, hasVelmar: 'Velmar' in pieces, done: doneSet.size, notes: Object.keys(notes).length, snapMem: !!runSnap, run: runStart })`);
ok('S1 the fixture is live with ITS geometry (4 streets in pack order, its one main, junction cuts give Main and Alpha 2 stretches each) | ' + JSON.stringify(S1),
  S1.id === 'fx149' && JSON.stringify(S1.names) === JSON.stringify(['Fixture Main', 'Fixture Alpha', 'Fixture Beta', 'Fixture Gamma']) && JSON.stringify(S1.mains) === JSON.stringify(['Fixture Main']) && S1.mainParts === 2 && S1.alphaParts === 2);
ok('S2 none of 5W\'s state is visible on the fixture (no Velmar pieces, empty done set and notes, no run) | ' + JSON.stringify(S1),
  S1.hasVelmar === false && S1.done === 0 && S1.notes === 0 && S1.run === 0);
ok('S3 F3: the in-memory cancel snapshot was cleared by the switch | runSnap ' + JSON.stringify(S1.snapMem), S1.snapMem === false);
const S4 = await J(`({ trail: JSON.parse(localStorage.getItem('snowroute.5w.v4.trail') || '[]'), notes: JSON.parse(localStorage.getItem('snowroute.5w.v4.notes') || '{}'), snap: !!localStorage.getItem('snowroute.5w.v5.snap') })`);
ok('S4 F2: the switch itself flushed the outgoing route\'s armed writes (trail point landed, unsaved note landed) and the persisted cancel snapshot survived in the 5W slot | armed point ' +
  S4.trail.some(p => p[0] === 43.820123) + ', note ' + ((S4.notes.Astona || []).some(e => e.text === 'armed at switch')) + ', snap ' + S4.snap,
  S4.trail.some(p => p[0] === 43.820123) && (S4.notes.Astona || []).some(e => e.text === 'armed at switch') && S4.snap === true);
const S5 = await J(`preloadUrlList().length`);
ok('S5 F5: with a second pack known, the preload manifest GROWS past 897 (union over packs) | ' + S5, typeof S5 === 'number' && S5 > 897);
await ev(`(() => { if (map && window.GLP && !map.getSource('labelpts')) { try { window.GLP.init(map, GL_HOST); } catch (e) {} } return true; })()`); // in the rig the tile CDN may never ready the style (glOk stays false), so onStyleReady's GLP.init never runs - run it exactly as onStyleReady would, so the engine's sources exist to be read back
const S6 = await J(`({ labelNames: (map.getSource('labelpts') && map.getSource('labelpts').serialize().data) ? map.getSource('labelpts').serialize().data.features.map(f => f.properties.name).sort() : null, hitN: (map.getSource('hit') && map.getSource('hit').serialize().data) ? map.getSource('hit').serialize().data.features.length : -1 })`);
ok('S6 the paint engine rebuilt for the fixture (its label points are the fixture streets; its hit features are the fixture stretches: 2+2+1+1) | ' + JSON.stringify(S6),
  Array.isArray(S6.labelNames) && JSON.stringify(S6.labelNames) === JSON.stringify(['Fixture Alpha', 'Fixture Beta', 'Fixture Gamma', 'Fixture Main']) && S6.hitN === 6);
const D1 = await ev(dump5wSrc);

// ---------- work on the fixture; 5W's slot must not move ----------
await ev(`markDone('Fixture Beta', 'drive149')`);
await ev(`setNoteText('Fixture Beta', 'fixture note')`);
const S7 = await J(`({ beta: streetComplete('Fixture Beta'), fxSides: !!localStorage.getItem('snowroute.fx149.v5.sides'), count4: document.body.innerText.indexOf('of 4') >= 0 })`);
ok('S7 fixture work lands in the fixture slot and the count reads "of 4" | ' + JSON.stringify(S7), S7.beta === true && S7.fxSides === true && S7.count4 === true);
const D1b = await ev(dump5wSrc);
ok('S8 working on the fixture never touches the 5W slot (dump unchanged)', D1b === D1);

// ---------- R: switch back through the Routes UI ----------
await ev(`openRouteMenu()`);
await ev(`document.querySelector('#rmRoutes .routeRow[data-route="5w"]').click()`);
await poll(`typeof activeRoute !== 'undefined' && activeRoute && activeRoute.id === '5w'`, 20000);
const D2 = await ev(dump5wSrc);
ok('R1 the 5W storage slot is BYTE-IDENTICAL after the switch-away-and-back round trip', D2 === D1);
const R2 = await J(`({ run: runStart, velmar: streetComplete('Velmar'), astona: streetComplete('Astona'), noteV: noteTextOf('Velmar'), noteA: noteTextOf('Astona'), snapMem: !!runSnap, names: STREETNAMES.length })`);
ok('R2 5W resumes exactly as left: the run is still in progress (same start), both marks and both notes present, 34 streets | ' + JSON.stringify(R2) + ' runStart was ' + RS,
  R2.run === RS && R2.velmar === true && R2.astona === true && R2.noteV === 'drive149 note' && R2.noteA === 'armed at switch' && R2.names === 34);
await ev(`cancelStart()`);
const R3 = await J(`({ run: runStart, astona: streetComplete('Astona'), velmar: streetComplete('Velmar'), snapStored: !!localStorage.getItem('snowroute.5w.v5.snap'), startStored: !!localStorage.getItem('snowroute.5w.v5.start') })`);
ok('R3 Cancel after switching back restores through the PERSISTED snapshot (F3 semantics): run work (Astona) erased, the pre-Start mark (Velmar) kept, snap + start keys deleted | ' + JSON.stringify(R3),
  R3.run === 0 && R3.astona === false && R3.velmar === true && R3.snapStored === false && R3.startStored === false);

// ---------- E: an empty pack loads clean ----------
await ev(`(() => { ROUTE_PACKS.push({ id: 'mt149', name: 'Empty Route', area: 'Nowhere', roads: {}, reference: {} }); return true; })()`);
const E1 = await J(`(() => { try { loadRoute('mt149'); return { err: null, id: activeRoute && activeRoute.id, names: STREETNAMES.length, total: totalWorkM(), box: routeBox, loaded: routeLoaded }; } catch (e) { return { err: String(e && e.message || e) }; } })()`);
ok('E1 an empty pack (0 streets) loads without exceptions into an empty-but-alive app | ' + JSON.stringify(E1),
  E1.err === null && E1.id === 'mt149' && E1.names === 0 && E1.total === 0 && E1.box === null && E1.loaded === true);
await ev(`loadRoute('5w')`);
const E2 = await J(`({ id: activeRoute && activeRoute.id, names: STREETNAMES.length, velmar: streetComplete('Velmar') })`);
ok('E2 switching back from the empty pack restores 5W whole | ' + JSON.stringify(E2), E2.id === '5w' && E2.names === 34 && E2.velmar === true);

// ---------- F6: restore judged by the TARGET route's geometry ----------
await ev(`loadRoute('fx149')`); // the fixture is the OPEN route; the backup below belongs to 5W
const sidesBefore = await ev(`localStorage.getItem('snowroute.5w.v5.sides')`);
await ev(`restoreBackup({ app: 'snowroute-backup', v: 2, at: new Date().toISOString(), routes: { nope149: { done: '[]' } } })`);
const F6Atoast = await J(`document.getElementById('toast').textContent`);
const sidesAfterBad = await ev(`localStorage.getItem('snowroute.5w.v5.sides')`);
ok('F6a an unknown-route backup still fails closed (nothing written) | ' + JSON.stringify(F6Atoast), typeof F6Atoast === 'string' && F6Atoast.indexOf('unknown route') >= 0 && sidesAfterBad === sidesBefore);
const F6B = await J(`(() => { const iso = new Date().toISOString(); const bk = { app: 'snowroute-backup', v: 2, at: iso, routes: { '5w': { done: JSON.stringify(['Velmar', 'Astona']), times: JSON.stringify({ Velmar: iso, Astona: iso }) } } }; restoreBackup(bk); const sides = JSON.parse(localStorage.getItem('snowroute.5w.v5.sides') || '{}'); const exp = packGeometry(ROUTE_PACKS.find(p => p.id === '5w')).stretch; const pv = (sides.p || {}).Velmar, pa = (sides.p || {}).Astona; return { vLen: pv ? pv.length : -1, vExp: exp.Velmar.parts.length, vAll3: !!pv && pv.every(v => v === 3), aLen: pa ? pa.length : -1, aExp: exp.Astona.parts.length, aAll3: !!pa && pa.every(v => v === 3) }; })()`);
ok('F6b a done-only 5W backup restored WHILE THE FIXTURE IS OPEN derives 5W sides through 5W geometry (Velmar/Astona at their true stretch counts, all sides done) | ' + JSON.stringify(F6B),
  F6B.vLen === F6B.vExp && F6B.vAll3 === true && F6B.aLen === F6B.aExp && F6B.aAll3 === true);

finish(R, proc);
