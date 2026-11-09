import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, url, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive165: Beta 1.144 (Package C) - DA-02 via C1 multi-run geometry,
// DA-04 full-name draft keys, OPT-L1 add-the-other-run.
// DA-02: through 1.143 the geometry core kept only the run of segments
// connected to a street's first segment, so picking NON-ADJACENT sectors
// of a street at create (sectors 0 and 2 of 3) saved geometry the route
// then silently truncated - create billed the full chosen length while
// the saved route tracked only the first run, and the lost pieces were
// unmarkable and uncounted. Streets now hold disconnected runs
// end-to-end. This drive builds the deep audit's repro shape at the
// create seam (a synthetic extract folded in through crCovMerge, the
// same call grid cells and top-ups make): a 3-sector street, sectors
// 0+2 picked, saved, loaded - the route must track BOTH runs, bill the
// same as create did, and mark/count pieces on the second run.
// DA-04: the draft keyed streets by SHORTENED name, so Addington
// Avenue blocked Addington Place outright. Both must now pick, under
// their full map names, each opening its OWN sectors.
// OPT-L1: a street existing as two disjoint runs in the extract -
// tapping the second run of an already-picked street ADDS it to the
// same street entry (through 1.143 the tap just opened the sectors of
// the first run and the second could never be contributed).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
await sleep(3000);
ok('S0 app boots for the Package C tests', await poll120(`!!window.maplibregl && !!document.querySelector('#map canvas')`, 45000));

// ---------- the synthetic extract ----------
// Sectoria Avenue: one east-west way in three ~80.4 m segments, with a
// cross street through each internal joint (so the junction-cut policy
// yields exactly 3 sectors). Crossone/Crosstwo exist only as junction
// providers in the extract.
const el = (id, name, pts) => ({ id, type: 'way', tags: { name }, geometry: pts.map(p => ({ lat: p[0], lon: p[1] })) });
const ELS = [
  el(201, 'Sectoria Avenue', [[43.8000, -79.5000], [43.8000, -79.4990], [43.8000, -79.4980], [43.8000, -79.4970]]),
  el(202, 'Crossone Avenue', [[43.7990, -79.4990], [43.8000, -79.4990], [43.8010, -79.4990]]),
  el(203, 'Crosstwo Avenue', [[43.7990, -79.4980], [43.8000, -79.4980], [43.8010, -79.4980]]),
  el(204, 'Addington Avenue', [[43.8020, -79.5000], [43.8020, -79.4980]]),
  el(205, 'Addington Place', [[43.8010, -79.4960], [43.8030, -79.4960]]),
  el(206, 'Splitrun Drive', [[43.8040, -79.5000], [43.8040, -79.4990]]),
  el(207, 'Splitrun Drive', [[43.8040, -79.4950], [43.8040, -79.4940]])
];
const BOX = { s: 43.795, n: 43.810, w: -79.505, e: -79.490 };
const SEED = `(() => { crCov = null; crCovMerge(${JSON.stringify(ELS)}, ${JSON.stringify(BOX)}); crPrepState = 'ready'; return !!(crCov && crCov.boxes.length === 1); })()`;
const pick = async (name, lat, lng) => { await ev(`pickStreet(${JSON.stringify(name)}, { lat: ${lat}, lng: ${lng} })`); await sleep(350); };

// ---------- (a) DA-02: non-adjacent sectors survive the save ----------
await ev(`enterCreate('pick')`);
ok('A0 create entered with the synthetic extract seeded', await ev(SEED) === true);
await pick('Sectoria Avenue', 43.8000, -79.4985);
const a1 = await J(`({ keys: Object.keys(draft.roads), parts: (crStreetParts('Sectoria Avenue') || {}).parts ? crStreetParts('Sectoria Avenue').parts.length : -1, chosen: Math.round(crStreetChosenM('Sectoria Avenue', crStreetParts('Sectoria Avenue'))) })`);
ok('A1 Sectoria picked under its FULL name; the junction cuts give it 3 sectors | ' + JSON.stringify(a1),
  a1.keys.join() === 'Sectoria Avenue' && a1.parts === 3);
await ev(`crOpenSectors('Sectoria Avenue')`);
await ev(`crToggleSector('Sectoria Avenue', 1)`); // un-pick the MIDDLE sector
const a2 = await J(`(() => { const rec = crStreetParts('Sectoria Avenue') || { parts: [], total: 0 }; return { sectors: (draft.sectors['Sectoria Avenue'] || []).slice(), chosen: crStreetChosenM('Sectoria Avenue', rec), segs: (crFilteredRoads()['Sectoria Avenue'] || []).length, total: rec.total, parts: rec.parts.map(p => Math.round(crLineLen(p))) }; })()`);
ok('A2 sectors 0+2 stay picked (the middle un-picked) and create bills exactly those two pieces | ' + JSON.stringify(a2),
  a2.sectors.join() === '0,2' && a2.segs === 2 && Math.abs(a2.chosen - (a2.parts[0] + a2.parts[2])) < 1.5);
await ev(`(() => { $('crNameInput').value = 'Drive165 Route'; $('crAreaInput').value = 'Testville'; saveDraftRoute(); return true; })()`);
const a3 = await J(`({ packs: ROUTE_PACKS.map(p => p.id), rec: JSON.parse(localStorage.getItem('snowroute.v2.userpacks') || '{}') })`);
const packId = Object.keys(a3.rec).find(id => a3.rec[id].name === 'Drive165 Route');
const savedSegs = packId ? (a3.rec[packId].roads['Sectoria Avenue'] || []).length : -1;
ok('A3 the route saves with Sectoria stored as TWO disconnected segments (one per picked run) | pack ' + packId + ' segs ' + savedSegs,
  !!packId && savedSegs === 2);
let aLoaded = false;
if (packId) { await ev(`loadRoute(${JSON.stringify(packId)})`); aLoaded = await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true && activeRoute && activeRoute.id === ${JSON.stringify(packId)}`, 20000).catch(() => false); }
const a4 = await J(`(() => { const st = STRETCH['Sectoria Avenue'] || { total: 0, parts: [], runs: [] }; return { total: Math.round(st.total), parts: st.parts.length, runs: (st.runs || []).length, work: Math.round(totalWorkM()), chosen: Math.round(${a2.chosen}) }; })()`);
ok('A4 DA-02: the loaded route tracks BOTH runs - its total equals what create billed (pre-1.144 it tracked only the first run) | ' + JSON.stringify(a4),
  aLoaded === true && a4.runs === 2 && a4.parts === 2 && Math.abs(a4.total - a4.chosen) <= 2 && Math.abs(a4.work - a4.chosen * 2) <= 4);
if (aLoaded && a4.runs === 2) {
  const done0 = await ev(`workDoneM()`);
  await ev(`togglePiece('Sectoria Avenue', 1, 0)`); await sleep(500); // part 1 = the SECOND run's only piece, side 0
  const a5 = await J(`({ done: Math.round(workDoneM()), partLen: Math.round(segLenM(STRETCH['Sectoria Avenue'].parts[1])), complete: streetComplete('Sectoria Avenue') })`);
  ok('A5 a piece on the SECOND run marks and counts toward the work total | ' + JSON.stringify(a5) + ' doneBefore ' + Math.round(done0),
    Math.abs(a5.done - Math.round(done0) - a5.partLen) <= 2);
  await ev(`togglePiece('Sectoria Avenue', 0, 0)`); await sleep(400);
  await ev(`togglePiece('Sectoria Avenue', 0, 1)`); await sleep(400);
  await ev(`togglePiece('Sectoria Avenue', 1, 1)`); await sleep(500);
  const a6 = await ev(`streetComplete('Sectoria Avenue')`);
  ok('A6 marking every piece on both runs (both sides) completes the street', a6 === true);
} else {
  ok('A5 a piece on the SECOND run marks and counts toward the work total | route never loaded', false);
  ok('A6 marking every piece on both runs (both sides) completes the street | route never loaded', false);
}

// ---------- (b) control: contiguous sectors stay ONE run ----------
await ev(`enterCreate('pick')`);
await ev(SEED);
await pick('Sectoria Avenue', 43.8000, -79.4985);
await ev(`crOpenSectors('Sectoria Avenue')`);
await ev(`crToggleSector('Sectoria Avenue', 2)`); // un-pick the LAST sector: 0+1 remain, contiguous
const b2 = await J(`(() => { const st = computeStretches(crFilteredRoads())['Sectoria Avenue']; const rec = crStreetParts('Sectoria Avenue'); return { runs: st.runs.length, parts: st.parts.length, total: Math.round(st.total), chosen: Math.round(crStreetChosenM('Sectoria Avenue', rec)) }; })()`);
ok('B1 contiguous sectors 0+1 form exactly ONE run and bill/track identically (one part: the filtered roads hold no cross street to cut at - the run is a single stretch, as on 1.143) | ' + JSON.stringify(b2),
  b2.runs === 1 && b2.parts === 1 && Math.abs(b2.total - b2.chosen) <= 2);
await ev(`exitCreate()`);

// ---------- (c) DA-04: Addington Avenue vs Addington Place ----------
await ev(`enterCreate('pick')`);
await ev(SEED);
await pick('Addington Avenue', 43.8020, -79.4990);
await pick('Addington Place', 43.8020, -79.4960);
const c1 = await J(`({ keys: Object.keys(draft.roads).sort(), rows: [...document.querySelectorAll('#crPickList .crPName')].map(e => e.textContent) })`);
ok('C1 DA-04: BOTH colliding streets are in the draft under their full names (pre-1.144 the second tap opened the first street\'s sectors and Place could never be added); the panel rows still display the short form | ' + JSON.stringify(c1),
  c1.keys.join() === 'Addington Avenue,Addington Place' && c1.rows.length === 2 && c1.rows.every(t => t === 'Addington'));
await ev(`crOpenSectors('Addington Place')`);
const c2 = await ev(`crSectorSession.street`);
ok('C2 each street opens its OWN sectors: opening Addington Place\'s trimming names Addington Place, not the Avenue | sectorStreet ' + c2, c2 === 'Addington Place');
await ev(`exitCreate()`);

// ---------- (d) OPT-L1: tapping the other run adds it ----------
await ev(`enterCreate('pick')`);
await ev(SEED);
await pick('Splitrun Drive', 43.8040, -79.4995); // run 1 (western)
const d1 = await J(`({ segs: draft.roads['Splitrun Drive'].length, len: Math.round(crStreetParts('Splitrun Drive') ? crStreetChosenM('Splitrun Drive', crDraftGeom()) : -1) })`);
ok('D1 the first tap contributes the tapped run only | ' + JSON.stringify(d1), d1.segs === 1 && d1.len > 70 && d1.len < 90);
await pick('Splitrun Drive', 43.8040, -79.4945); // run 2 (eastern), ~320 m away, same street name
const d2 = await J(`({ segs: (draft.roads['Splitrun Drive'] || []).length, toast: document.getElementById('toast').textContent, len: Math.round(crStreetParts('Splitrun Drive') ? crStreetChosenM('Splitrun Drive', crDraftGeom()) : -1), sector: crSectorSession.street })`);
ok('D2 OPT-L1: tapping the OTHER run adds it to the same street entry (both runs held, full length billed, sector mode NOT opened) | ' + JSON.stringify(d2),
  d2.segs === 2 && d2.len > 150 && d2.toast.indexOf('Added the other part') < 0 && !d2.sector); // Beta 1.153 (TEST): the toast conjunct asserted the 'Added the other part of Splitrun' confirmation - item 4 of the UX round REMOVED that toast (Andrew: the road's picked state is the feedback), so the conjunct now asserts its ABSENCE; the functional claims (both runs, full length, no sector mode) are unchanged
await pick('Splitrun Drive', 43.8040, -79.4995); // a run already held
const d3 = await J(`({ segs: (draft.roads['Splitrun Drive'] || []).length, sector: crSectorSession.street })`);
ok('D3 a tap on a run already held opens the street\'s sectors instead (the 1.128 door is unchanged) | ' + JSON.stringify(d3),
  d3.segs === 2 && d3.sector === 'Splitrun Drive');
await ev(`exitCreate()`);

// ---------- (e) the shipped 5W geometry is untouched ----------
await ev(`loadRoute('5w')`);
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true && activeRoute && activeRoute.id === '5w'`, 20000);
const e1 = await J(`({ names: STREETNAMES.length, total: Math.round(STREETNAMES.reduce((a, n) => a + STRETCH[n].total, 0)), parts: STREETNAMES.reduce((a, n) => a + STRETCH[n].parts.length, 0), velmar: Math.round(STRETCH['Velmar'].total) })`);
ok('E1 the shipped 5W pack derives exactly as before: 34 roads, 17,676 m, 87 stretches, Velmar 1,686 m | ' + JSON.stringify(e1),
  e1.names === 34 && e1.total === 17676 && e1.parts === 87 && e1.velmar === 1686);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);
