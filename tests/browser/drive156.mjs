// Beta 1.144 TEST-PREMISE UPDATE (Package C, DA-04): draft keys, sector state, panel feature properties and saved-pack keys are the FULL map names now ('Long Road', 'Alpha Street'); through 1.143 they were the shortened forms. Key reads below follow the full name; row-text finds still match the displayed short form ('Long', 'Alpha').
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCreateRig, serveRepo, makeResults, finishCreate, sleep } from './harness-create.mjs';

// Test-suite restructure (2026-11-09): drive157 + drive158 are absorbed
// as appended own-rig segments at the tail of this file (see markers).
// drive156: Beta 1.127 - SECTORS + THE PICKED-ROADS PANEL + BACK HIT AREA
// (Andrew's approved mockups, beta1/work/create-sectors-mockups/, plus
// his two additions while approving: Clear all, and the panel must
// never bury the map; and his device report that blue-menu Back
// buttons fire along their whole row).
// The geography is SYNTHETIC and deterministic: one long east-west
// street ("Long Road", 21 vertices over 0.020 deg of longitude at
// lat 43.8000 - 1,608 m) crossed by four north-south streets whose
// vertices land exactly on it, so its sectors are provably FIVE
// junction-to-junction parts of ~321 m each; seven short filler
// streets give the panel something to fill with. The extract lands
// through crCovMerge - the same function the city grid commits
// through - and streets are picked through pickStreet (the real
// tap-resolution entry) and crSectorTap (the real sector-tap entry),
// so the whole draft -> panel -> save path under test is production
// code; only the map's tile layer (which no drive can ready in this
// rig) is bypassed, exactly as in drives 150/155.
//   A sectors: entire-road pick -> row reads "Entire road"; the row
//     opens sector mode (bar replaces panel, draft renders 5 sector
//     features, all chosen); two sector taps trim the street to its
//     middle 3 parts; Entire road restores; trimming again and saving
//     stores ONLY the chosen sectors in the saved pack (its Long
//     measures ~964 m against the draft's 1,608 m whole).
//   B panel: 8 streets -> the sheet stays under ~55% of the viewport
//     while the rows list actually scrolls; the in-row chip flips
//     MAIN/2ND both ways; picking a picked street again OPENS ITS
//     SECTORS (Beta 1.128 - tap-again-to-deselect is retired; the
//     row x removes); a tap on the panel head collapses to the strip
//     with live counts and Review restores the panel; Clear all asks
//     first (Cancel keeps every road) and on confirm empties the
//     draft; the panel, strip and sector bar all wear --card-solid
//     at night.
//   C back hit area: in a route pane AND a Settings pane, a real
//     mouse press 60 px right of the Back button's edge hits nothing
//     and navigates nowhere (elementFromPoint is not the button; the
//     pane does not change), while a press on the words goes back.
// Red side (pristine 1.126 tree): the sector/panel surface does not
// exist there - A1 fails at once (#crPanel absent), and every later
// check cascades from the missing functions (crStreetParts,
// crSectorTap, crCollapsePanel are undefined; the count reads the old
// "N streets" shape). C is red there too: .rmBack stretches full
// width, so the +60 px press lands ON the button and navigates.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { R, ok } = makeResults();

// ---- the synthetic extract (Overpass element shape) ----
const way = (id, name, pts) => ({ type: 'way', id, tags: { name }, geometry: pts.map(p => ({ lat: p[0], lon: p[1] })) });
const LONG_PTS = []; for (let i = 0; i <= 20; i++) LONG_PTS.push([43.8, -79.58 + i * 0.001]);
const ELEMENTS = [way(9001, 'Long Road', LONG_PTS)];
[[-79.576, 'First Cross Street'], [-79.572, 'Second Cross Street'], [-79.568, 'Third Cross Street'], [-79.564, 'Fourth Cross Street']]
  .forEach(([lng, nm], k) => { const pts = []; for (let i = 0; i <= 8; i++) pts.push([43.796 + i * 0.001, lng]); ELEMENTS.push(way(9010 + k, nm, pts)); });
const FILLERS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf'];
FILLERS.forEach((nm, i) => { const lat = 43.79 + i * 0.0022; ELEMENTS.push(way(9020 + i, nm + ' Street', [[lat, -79.5795], [lat, -79.578], [lat, -79.5765]])); });
const COV_BOX = { s: 43.788, w: -79.582, n: 43.806, e: -79.558 };

// ---- static server + CDP rig (shared: harness-create.mjs; no routing table - the rig's default passthrough fulfil is this drive's historical fulfil verbatim) ----
const { server, ORIGIN } = await serveRepo(REPO);
const rig = await startCreateRig({ profile: '/tmp/d156profile-' + Date.now() });
const { proc, send, PAGE_S, ev2, poll, consoleLog, J, bootRoute } = rig;
const mouse = async (type, x, y) => { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, PAGE_S); };
const pressAt = async (x, y) => { await mouse('mousePressed', x, y); await sleep(90); await mouse('mouseReleased', x, y); await sleep(250); };
const enterPickWithExtract = async () => {
  await ev2(`enterCreate('pick')`);
  await ev2(`crCovMerge(${JSON.stringify(ELEMENTS)}, ${JSON.stringify(COV_BOX)}); crPrepState = 'ready'; crRenderHint(); true`);
  return await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick' && !!crCov`, 10000);
};

await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
await bootRoute();

// ================= A: sectors =================
const inA = await enterPickWithExtract();
await ev2(`pickStreet('Long Road', { lat: 43.8, lng: -79.574 })`);
const addedA = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Long Road']`, 15000);
const rowA = await J(`(() => { const r = document.querySelector('#crPickList .crPRow'); return { panel: !!document.getElementById('crPanel'), sub: r ? (r.querySelector('.crPSub') || {}).textContent || '' : '', count: document.getElementById('crCount').textContent, whole: draft && draft.roads['Long Road'] ? Math.round(computeStretches(draft.roads)['Long Road'].total) : -1 }; })()`);
ok('A1 WHOLE-ROAD PICK, PANEL SHAPE: picking Long Road adds it whole (its stitched length is ~1,608 m) and the new panel lists it with a "Entire road" sub-line under a "1 roads" header count | entered: ' + inA + ', added: ' + addedA + ' | ' + JSON.stringify(rowA),
  inA === true && addedA === true && rowA.panel === true && rowA.sub.indexOf('Entire road') === 0 && Math.abs(rowA.whole - 1608) <= 4 && rowA.count.indexOf('1 roads') === 0);
await ev2(`(() => { const r = document.querySelector('#crPickList .crPRow'); if (r) r.click(); return true; })()`);
const secA = await poll(`typeof crSectorSession.street !== 'undefined' && crSectorSession.street === 'Long Road'`, 10000);
await poll(`getComputedStyle(document.getElementById('crPanel')).display === 'none'`, 12000); // Beta 1.128: face changes are a continuous morph now - wait for the panel to fully hand over before reading the bar's face state
const barA = await J(`({ bar: getComputedStyle(document.getElementById('crSectorBar')).display, panel: getComputedStyle(document.getElementById('crPanel')).display, sub: document.getElementById('crSbSub').textContent, feats: (map.getSource('crDraft').serialize().data.features || []).filter(f => f.properties.name === 'Long Road').map(f => f.properties.chosen) })`);
ok('A2 SECTOR MODE OPENS FROM THE ROW: the sector bar replaces the panel, reads "Entire road picked", and the draft renders Long Road as FIVE sector features, all chosen - the four cross streets cut it into five junction-to-junction parts | sector mode: ' + secA + ' | ' + JSON.stringify(barA),
  secA === true && barA.bar !== 'none' && barA.panel === 'none' && barA.sub.indexOf('Entire road picked') === 0 && barA.feats.length === 5 && barA.feats.every(c => c === 1));
await ev2(`crSectorTap({ lat: 43.8, lng: -79.578 })`); // the middle of part 0
const trim1 = await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 4`, 10000);
await ev2(`crSectorTap({ lat: 43.8, lng: -79.562 })`); // the middle of part 4
const trim2 = await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 3`, 10000);
const trimA = await J(`({ sel: draft.sectors['Long Road'], chosenM: Math.round(crStreetChosenM('Long Road', computeStretches(draft.roads))), sub: document.getElementById('crSbSub').textContent, feats: (map.getSource('crDraft').serialize().data.features || []).filter(f => f.properties.name === 'Long Road').map(f => f.properties.chosen) })`);
ok('A3 SECTOR TAPS TRIM: tapping the end sectors un-picks exactly them - the selection is the middle three parts [1,2,3], the chosen length ~964 m (3 of 5 parts), the bar says so, and the draft features mark the two ends unchosen | ' + JSON.stringify(trimA),
  trim1 === true && trim2 === true && JSON.stringify(trimA.sel) === '[1,2,3]' && Math.abs(trimA.chosenM - 964) <= 8 && trimA.sub.indexOf('3 of 5 sectors picked') === 0 && JSON.stringify(trimA.feats) === '[0,1,1,1,0]');
await ev2(`document.getElementById('crSbWhole').click()`);
const wholeA = await poll(`!draft.sectors['Long Road']`, 10000);
const wholeSub = await J(`document.getElementById('crSbSub').textContent`);
ok('A4 ENTIRE ROAD RESTORES: the bar\'s Entire road button clears the trim (no sector entry - the draft\'s default state) and the bar reads "Entire road picked" again | restored: ' + wholeA + ' | ' + wholeSub,
  wholeA === true && wholeSub.indexOf('Entire road picked') === 0);
await ev2(`crSectorTap({ lat: 43.8, lng: -79.578 })`);
await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 4`, 10000);
await ev2(`crSectorTap({ lat: 43.8, lng: -79.562 })`);
await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 3`, 10000);
await ev2(`document.getElementById('crSbDone').click()`);
const doneA = await poll(`crSectorSession.street === null`, 10000);
await poll(`getComputedStyle(document.getElementById('crSectorBar')).display === 'none'`, 12000); // Beta 1.128: same morph settle wait on the way back
const rowA2 = await J(`(() => { const r = document.querySelector('#crPickList .crPRow'); return { bar: getComputedStyle(document.getElementById('crSectorBar')).display, panel: getComputedStyle(document.getElementById('crPanel')).display, sub: r ? (r.querySelector('.crPSub') || {}).textContent || '' : '', count: document.getElementById('crCount').textContent }; })()`);
ok('A5 DONE RETURNS TO THE PANEL, AND THE ROW TELLS THE TRIM: "Done" closes sector mode, the panel is back, its row reads "3 of 5 sectors · ~964 m - tap row to adjust" and the header total bills the chosen length only | done: ' + doneA + ' | ' + JSON.stringify(rowA2),
  doneA === true && rowA2.bar === 'none' && rowA2.panel !== 'none' && rowA2.sub.indexOf('3 of 5 sectors') === 0 && /9[0-9]{2} m/.test(rowA2.sub) && /roads · 9[0-9]{2} m/.test(rowA2.count));
await ev2(`document.getElementById('crDoneBtn').click()`);
await poll(`crStage === 'preview'`, 10000);
const pvA = await J(`(() => { const num = s => Number(String(s).replace(/[^0-9]/g, '')) || 0; const rows = [...document.querySelectorAll('#pvList .crRow')].map(r => ({ n: (r.querySelector('.crName') || {}).textContent || '', m: num((r.querySelector('.crLen') || {}).textContent || '') })); const psub = (document.querySelector('#crPickList .crPRow .crPSub') || {}).textContent || ''; return { rows, rowSum: rows.reduce((a, r) => a + r.m, 0), countM: num(document.getElementById('pvCount').textContent.split('·').pop()), panelM: num(psub.split('·')[1] || '') }; })()`);
ok('A6 PREVIEW BILLS THE TRIM (Beta 1.130, re-scan N1): on the check screen the trimmed street\'s row bills the CHOSEN ~964 m - the same figure the picking panel billed - NOT the whole 1,608 m, and the preview\'s own total equals the sum of its rows (through 1.129 crRowEl read the entire-road total, so the check screen\'s rows and total disagreed with each other and with the panel) | ' + JSON.stringify(pvA),
  pvA.rows.length === 1 && Math.abs(pvA.rows[0].m - 964) <= 8 && pvA.rows[0].m === pvA.panelM && pvA.countM === pvA.rowSum);
await ev2(`document.getElementById('pvSaveBtn').click()`);
await poll(`document.getElementById('rmNamePane').classList.contains('on')`, 10000);
await ev2(`(() => { document.getElementById('crNameInput').value = 'Sector Test Route'; document.getElementById('crSaveBtn').click(); return true; })()`);
const savedA = await poll(`(() => { try { const rec = JSON.parse(localStorage.getItem('snowroute.v2.userpacks') || '{}'); return Object.values(rec).some(p => p.name === 'Sector Test Route'); } catch (e) { return false; } })()`, 15000);
const packA = await J(`(() => { const rec = JSON.parse(localStorage.getItem('snowroute.v2.userpacks') || '{}'); const p = Object.values(rec).find(x => x.name === 'Sector Test Route'); if (!p) return { found: false }; const g = computeStretches(p.roads); return { found: true, segs: p.roads['Long Road'].length, total: Math.round(g['Long Road'].total), pts: p.roads['Long Road'].reduce((a, s) => a + s.length, 0) }; })()`);
ok('A7 THE SAVE STORES CHOSEN SECTORS ONLY: the saved pack\'s Long Road is THREE segments measuring ~964 m (the draft\'s whole street was 1,608 m) - the unchosen ends never entered the pack, and the pack format is the plain segment list it always was | saved: ' + savedA + ' | ' + JSON.stringify(packA),
  savedA === true && packA.found === true && packA.segs === 3 && Math.abs(packA.total - 964) <= 10);

// ================= B: the panel =================
const inB = await enterPickWithExtract();
await ev2(`pickStreet('Long Road', { lat: 43.8, lng: -79.574 })`);
for (const nm of FILLERS) {
  const i = FILLERS.indexOf(nm), lat = 43.79 + i * 0.0022;
  await ev2(`pickStreet(${JSON.stringify(nm + ' Street')}, { lat: ${lat}, lng: -79.578 })`);
}
const eightB = await poll(`draft && Object.keys(draft.roads).length === 8`, 20000);
const capB = await J(`(() => { const sh = document.getElementById('createSheet'); const li = document.getElementById('crPickList'); return { rows: document.querySelectorAll('#crPickList .crPRow').length, sheetH: sh.offsetHeight, vh: window.innerHeight, listClient: li.clientHeight, listScroll: li.scrollHeight, count: document.getElementById('crCount').textContent }; })()`);
ok('B1 THE PANEL CAPS AND THE LIST SCROLLS: with 8 roads picked the sheet stays under ~55% of the viewport (it grew to its cap, not past it) while the rows area\'s scroll height exceeds its visible height - the rows scroll INSIDE the panel | 8 picked: ' + eightB + ' | ' + JSON.stringify(capB),
  eightB === true && capB.rows === 8 && capB.sheetH <= Math.round(capB.vh * 0.55) && capB.sheetH >= 300 && capB.listScroll > capB.listClient + 20 && capB.count.indexOf('8 roads') === 0);
// Beta 1.129 premise update: the three faces no longer carry cards of their own - the ONE surface (#createSheet) wears --card-solid and the faces are transparent contents inside it. The check's meaning is unchanged: no hardcoded white card anywhere in the pick sheet at night.
const nightB = await J(`(() => { document.body.classList.add('night'); const probe = document.createElement('div'); probe.style.background = 'var(--card-solid)'; document.body.appendChild(probe); const token = getComputedStyle(probe).backgroundColor; probe.remove(); const out = { token, surface: getComputedStyle(document.getElementById('createSheet')).backgroundColor, panel: getComputedStyle(document.getElementById('crPanel')).backgroundColor, strip: getComputedStyle(document.getElementById('crStrip')).backgroundColor, bar: getComputedStyle(document.getElementById('crSectorBar')).backgroundColor }; document.body.classList.remove('night'); return out; })()`);
ok('B2 NIGHT TOKENS: at night the ONE surface wears --card-solid exactly and the three faces inside it are transparent contents (no hardcoded white card) | ' + JSON.stringify(nightB),
  nightB.surface === nightB.token && nightB.panel === 'rgba(0, 0, 0, 0)' && nightB.strip === 'rgba(0, 0, 0, 0)' && nightB.bar === 'rgba(0, 0, 0, 0)');
await ev2(`(() => { const r = [...document.querySelectorAll('#crPickList .crPRow')].find(x => (x.querySelector('.crPName') || {}).textContent === 'Long'); if (r) r.querySelector('.crPChip').click(); return true; })()`);
const chipB = await poll(`draft.mains.has('Long Road')`, 10000);
const chipTxt = await J(`(() => { const r = [...document.querySelectorAll('#crPickList .crPRow')].find(x => (x.querySelector('.crPName') || {}).textContent === 'Long'); return r ? (r.querySelector('.crPChip') || {}).textContent || '' : ''; })()`);
await ev2(`(() => { const r = [...document.querySelectorAll('#crPickList .crPRow')].find(x => (x.querySelector('.crPName') || {}).textContent === 'Long'); if (r) r.querySelector('.crPChip').click(); return true; })()`);
const chipBack = await poll(`!draft.mains.has('Long Road') && crSectorSession.street === null`, 10000);
ok('B3 THE IN-ROW CHIP FLIPS MAIN/2ND: one tap on Long\'s chip puts it in the mains set and the chip reads MAIN; a second tap flips it back - and neither tap opened sector mode (the chip keeps its own tap) | to main: ' + chipB + ' (' + chipTxt + '), back: ' + chipBack,
  chipB === true && chipTxt === 'MAIN' && chipBack === true);
// Beta 1.128 premise update: tap-again-to-deselect is RETIRED (Andrew's fork) - picking a picked street opens its sectors instead; removal lives on the row's x and Clear all
await ev2(`pickStreet('Alpha Street', { lat: 43.79, lng: -79.578 })`);
const secB = await poll(`crSectorSession.street === 'Alpha Street' && draft && !!draft.roads['Alpha Street'] && Object.keys(draft.roads).length === 8`, 10000);
await ev2(`document.getElementById('crSbDone').click()`);
await poll(`crSectorSession.street === null`, 10000);
await ev2(`(() => { const r = [...document.querySelectorAll('#crPickList .crPRow')].find(x => (x.querySelector('.crPName') || {}).textContent === 'Alpha'); if (r) r.querySelector('.crPDel').click(); return true; })()`);
const deselB = await poll(`draft && !draft.roads['Alpha Street'] && Object.keys(draft.roads).length === 7`, 10000);
ok('B4 TAP A PICKED STREET OPENS ITS SECTORS (Beta 1.128 - it no longer removes); the row x is the removal (7 roads left) | sectors opened: ' + secB + ', removed by x: ' + deselB,
  secB === true && deselB === true);
// Beta 1.128 premise update: the panel's "+ Add a street" button is gone (it only ever tucked the panel) - a tap on the panel head does the tucking now
const headB = await J(`(() => { const r = document.getElementById('crPanelHead').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 10) }; })()`);
await pressAt(headB.x, headB.y);
const stripB = await poll(`getComputedStyle(document.getElementById('crStrip')).display !== 'none' && getComputedStyle(document.getElementById('crPanel')).display === 'none'`, 12000);
const stripTxt = await J(`({ t: document.getElementById('crStripTitle').textContent, s: document.getElementById('crStripSub').textContent })`);
ok('B5 TUCK-AWAY: a tap on the panel head collapses the panel to the slim strip, which carries the live counts ("7 roads picked" and the total metres) while the panel face is gone | collapsed: ' + stripB + ' | ' + JSON.stringify(stripTxt),
  stripB === true && stripTxt.t === '7 roads picked');
await ev2(`document.getElementById('crReviewBtn').click()`);
const backB = await poll(`getComputedStyle(document.getElementById('crPanel')).display !== 'none' && getComputedStyle(document.getElementById('crStrip')).display === 'none'`, 12000);
ok('B6 REVIEW RESTORES THE PANEL: the strip\'s Review button springs the full panel back (panel face shown, strip gone) | restored: ' + backB, backB === true);
await ev2(`document.getElementById('crClearAll').click()`);
const askB = await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
const askTxt = await J(`({ yes: document.getElementById('crModalYes').textContent, title: document.getElementById('crModalTitle').textContent })`);
await ev2(`document.getElementById('crModalNo').click()`);
const keptB = await poll(`draft && Object.keys(draft.roads).length === 7`, 8000);
await ev2(`document.getElementById('crClearAll').click()`);
await poll(`!document.getElementById('crModal').classList.contains('hidden')`, 10000);
await ev2(`document.getElementById('crModalYes').click()`);
const clearedB = await poll(`draft && Object.keys(draft.roads).length === 0`, 10000);
const emptyB = await J(`({ count: document.getElementById('crCount').textContent, strip: getComputedStyle(document.getElementById('crStrip')).display })`);
ok('B7 CLEAR ALL, BEHIND ITS CONFIRM: the ask names all 7 roads with a "Clear all" Yes; Cancel keeps every road; confirming empties the draft, the header reads 0 roads and no strip lingers over an empty draft | ask: ' + askB + ' ' + JSON.stringify(askTxt) + ', kept: ' + keptB + ', cleared: ' + clearedB + ' | ' + JSON.stringify(emptyB),
  askB === true && askTxt.yes === 'Clear all' && askTxt.title.indexOf('Clear all 7 roads?') === 0 && keptB === true && clearedB === true && emptyB.count.indexOf('0 roads') === 0 && emptyB.strip === 'none');
await ev2(`exitCreate()`);

// ================= C: the Back hit area =================
await ev2(`openRouteMenu()`);
await ev2(`document.getElementById('rmCreate').click()`);
await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
await ev2(`document.getElementById('crDoorManual').click()`);
await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
const geoC1 = await J(`(() => { const b = document.getElementById('crCityBack'); const r = b.getBoundingClientRect(); const pane = document.getElementById('rmCityPane').getBoundingClientRect(); const hit = document.elementFromPoint(r.right + 60, r.top + r.height / 2); return { w: Math.round(r.width), paneW: Math.round(pane.width), right: r.right, midY: r.top + r.height / 2, hitIsBtn: hit === b }; })()`);
await pressAt(geoC1.right + 60, geoC1.midY);
const stillC1 = await J(`document.getElementById('rmCityPane').classList.contains('on')`);
const wordsC1 = await J(`(() => { const b = document.getElementById('crCityBack'); const r = b.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
await pressAt(wordsC1.x, wordsC1.y);
const backC1 = await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 8000);
ok('C1 ROUTE-MENU BACK: the city pane\'s Back is shrunk to its words (well under half the pane width); a real press 60 px right of its edge hits something else and navigates NOWHERE, while a press on the words goes back to the doors | ' + JSON.stringify(geoC1) + ' | still on city pane after the right-side press: ' + stillC1 + ', back after the words press: ' + backC1,
  geoC1.w < geoC1.paneW * 0.5 && geoC1.hitIsBtn === false && stillC1 === true && backC1 === true);
await ev2(`closeRouteMenu()`);
await ev2(`document.getElementById('setBtn').click()`);
await poll(`document.getElementById('setMenu').classList.contains('open')`, 10000);
await ev2(`document.getElementById('stBtn').click()`);
await poll(`document.getElementById('setStatusPane').classList.contains('on') || document.getElementById('setStatusPane').style.display !== 'none'`, 10000);
const geoC2 = await J(`(() => { const b = document.getElementById('statusBack'); const r = b.getBoundingClientRect(); const pane = document.getElementById('setMenu').getBoundingClientRect(); const hit = document.elementFromPoint(r.right + 60, r.top + r.height / 2); return { w: Math.round(r.width), paneW: Math.round(pane.width), right: r.right, midY: r.top + r.height / 2, hitIsBtn: hit === b, vis: r.width > 0 }; })()`);
await pressAt(geoC2.right + 60, geoC2.midY);
const stillC2 = await J(`(() => { const p = document.getElementById('setStatusPane'); return p.classList.contains('on') || p.style.display !== 'none'; })()`);
const wordsC2 = await J(`(() => { const b = document.getElementById('statusBack'); const r = b.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
await pressAt(wordsC2.x, wordsC2.y);
const backC2 = await poll(`(() => { const p = document.getElementById('setMainPane'); return p.classList.contains('on') || p.style.display !== 'none'; })()`, 8000);
ok('C2 SETTINGS BACK: the Status pane\'s Back (the same shared class) is likewise word-sized - the press right of it does nothing, the press on its words returns to the Settings main pane | ' + JSON.stringify(geoC2) + ' | still on status: ' + stillC2 + ', back at main: ' + backC2,
  geoC2.vis === true && geoC2.w < geoC2.paneW * 0.5 && geoC2.hitIsBtn === false && stillC2 === true && backC2 === true);


// ===== absorbed drive157 (test-suite restructure, 2026-11-09): run
// verbatim in its own rig (own server + browser + synthetic extract),
// checks appended to this drive's block. =====
const R157 = await (async () => {
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { R, ok } = makeResults();

// ---- the synthetic extract (drive156's geography) ----
const way = (id, name, pts) => ({ type: 'way', id, tags: { name }, geometry: pts.map(p => ({ lat: p[0], lon: p[1] })) });
const LONG_PTS = []; for (let i = 0; i <= 20; i++) LONG_PTS.push([43.8, -79.58 + i * 0.001]);
const ELEMENTS = [way(9001, 'Long Road', LONG_PTS)];
[[-79.576, 'First Cross Street'], [-79.572, 'Second Cross Street'], [-79.568, 'Third Cross Street'], [-79.564, 'Fourth Cross Street']]
  .forEach(([lng, nm], k) => { const pts = []; for (let i = 0; i <= 8; i++) pts.push([43.796 + i * 0.001, lng]); ELEMENTS.push(way(9010 + k, nm, pts)); });
ELEMENTS.push(way(9020, 'Alpha Street', [[43.79, -79.5795], [43.79, -79.578], [43.79, -79.5765]]));
const COV_BOX = { s: 43.788, w: -79.582, n: 43.806, e: -79.558 };

// ---- static server + CDP rig (shared: harness-create.mjs; no routing table - the rig's default passthrough fulfil is this drive's historical fulfil verbatim) ----
const { server, ORIGIN } = await serveRepo(REPO);
const rig = await startCreateRig({ profile: '/tmp/d157profile-' + Date.now() });
const { proc, send, PAGE_S, ev2, poll, consoleLog, J, bootRoute } = rig;
const mouse = async (type, x, y) => { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, PAGE_S); };
const headTap = async () => { // a quick tap on the panel's grab head (short sleeps - the D-section sampling needs the spring still running)
  const g = await J(`(() => { const r = document.getElementById('crPanelHead').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 10) }; })()`);
  await mouse('mousePressed', g.x, g.y); await sleep(50); await mouse('mouseReleased', g.x, g.y);
};
const enterPickWithExtract = async () => {
  await ev2(`enterCreate('pick')`);
  await ev2(`crCovMerge(${JSON.stringify(ELEMENTS)}, ${JSON.stringify(COV_BOX)}); crPrepState = 'ready'; crRenderHint(); true`);
  return await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick' && !!crCov`, 10000);
};
const faceSettled = async (face) => await poll(`getComputedStyle(document.getElementById('${face}')).display !== 'none' && document.getElementById('createSheet').style.height === ''`, 12000);

await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
await bootRoute();

// ================= A: sector entry from the map =================
const inA = await enterPickWithExtract();
await ev2(`pickStreet('Long Road', { lat: 43.8, lng: -79.574 })`);
const addedA = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Long Road']`, 15000);
const rowA = await J(`(() => { const r = document.querySelector('#crPickList .crPRow'); return r ? (r.querySelector('.crPSub') || {}).textContent || '' : ''; })()`);
ok('157-A1 THE UNTRIMMED ROW STATES THE AFFORDANCE: a freshly picked road\'s row reads "Entire road · X m — tap row to adjust" (the hint exists before any trim, not only after one) | entered: ' + inA + ', added: ' + addedA + ' | ' + rowA,
  inA === true && addedA === true && rowA.indexOf('Entire road') === 0 && rowA.indexOf('tap row to adjust') > 0);
await ev2(`(() => { // the tap seam: a box query names Long Road under the tap (drive150's stub shape); the point query names nothing
  if (!map.__qrfOrig) map.__qrfOrig = map.queryRenderedFeatures.bind(map);
  map.queryRenderedFeatures = (arg) => {
    if (!Array.isArray(arg)) return [];
    const cx = (arg[0][0] + arg[1][0]) / 2, cy = (arg[0][1] + arg[1][1]) / 2;
    const a = map.unproject([cx - 40, cy]); const b = map.unproject([cx + 40, cy]);
    return [{ type: 'Feature', sourceLayer: 'roads', properties: { name: 'Long Road' }, geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } }];
  };
  return true;
})()`);
await ev2(`crMapTap({ point: { x: 210, y: 450 }, lngLat: { lat: 43.8, lng: -79.574 } })`);
const secA = await poll(`typeof crSectorSession.street !== 'undefined' && crSectorSession.street === 'Long Road'`, 10000);
const keptA = await J(`({ kept: !!(draft && draft.roads['Long Road']), bar: getComputedStyle(document.getElementById('crSectorBar')).display })`);
await ev2(`(() => { if (map.__qrfOrig) { map.queryRenderedFeatures = map.__qrfOrig; delete map.__qrfOrig; } return true; })()`);
ok('157-A2 A MAP TAP ON A PICKED ROAD OPENS ITS SECTORS: the real crMapTap, fed a road feature naming the picked street, enters sector mode for it (the street is NOT removed - 1.127\'s tap-again removal is retired) | sector mode: ' + secA + ' | ' + JSON.stringify(keptA),
  secA === true && keptA.kept === true);
await ev2(`document.getElementById('crSbDone').click()`);
await poll(`crSectorSession.street === null`, 10000);
await faceSettled('crPanel');
await ev2(`pickStreet('Long Road', { lat: 43.8, lng: -79.574 })`);
const secA2 = await poll(`crSectorSession.street === 'Long Road' && draft && !!draft.roads['Long Road']`, 10000);
const toastA = await J(`document.getElementById('toast').textContent`);
ok('157-A3 THE PICK ENTRY AGREES: pickStreet on the picked street opens its sectors again and no removal toast fires | reopened: ' + secA2 + ' | toast: ' + toastA,
  secA2 === true && toastA.indexOf('Removed') !== 0);
await ev2(`document.getElementById('crSbDone').click()`);
await poll(`crSectorSession.street === null`, 10000);
await faceSettled('crPanel');

// ================= B: one-piece honesty =================
await ev2(`pickStreet('Alpha Street', { lat: 43.79, lng: -79.578 })`);
const twoB = await poll(`draft && Object.keys(draft.roads).length === 2`, 10000);
await ev2(`(() => { const r = [...document.querySelectorAll('#crPickList .crPRow')].find(x => (x.querySelector('.crPName') || {}).textContent === 'Alpha'); if (r) r.click(); return true; })()`);
const secB = await poll(`crSectorSession.street === 'Alpha Street'`, 10000);
const barB = await J(`document.getElementById('crSbSub').textContent`);
await ev2(`crSectorTap({ lat: 43.79, lng: -79.578 })`); // dead on Alpha's only sector
await sleep(500);
const afterB = await J(`({ kept: !!(draft && draft.roads['Alpha Street']), roads: draft ? Object.keys(draft.roads).length : -1, sec: draft && draft.sectors ? draft.sectors['Alpha Street'] : undefined, toast: document.getElementById('toast').textContent, mode: crSectorSession.street })`);
ok('157-B1 ONE-PIECE STREETS ARE HONEST: Alpha (nothing crosses it) computes one sector; its bar says "One piece — no cross-streets to split it at", and tapping that sole sector leaves the street picked, in sector mode, with a toast saying why | 2 picked: ' + twoB + ', mode: ' + secB + ' | bar: ' + barB + ' | ' + JSON.stringify(afterB),
  twoB === true && secB === true && barB.indexOf('One piece') === 0 && barB.indexOf('no cross-streets to split it at') > 0 && afterB.kept === true && afterB.roads === 2 && afterB.mode === 'Alpha Street' && afterB.toast.indexOf('one piece') > 0);
await ev2(`document.getElementById('crSbDone').click()`);
await poll(`crSectorSession.street === null`, 10000);
await faceSettled('crPanel');

// ================= C: wording + folded naming =================
const wordsC = await J(`({ addBtn: !!document.getElementById('crAddBtn'), doneLbl: document.getElementById('crDoneBtn').textContent })`);
await ev2(`document.getElementById('crDoneBtn').click()`);
await poll(`crStage === 'preview'`, 10000);
const pvC = await J(`({ saveLbl: document.getElementById('pvSaveBtn').textContent, nameInPv: !!document.getElementById('previewSheet').querySelector('#crNameInput'), namePane: !!document.getElementById('rmNamePane') })`);
ok('157-C1 THE FINISHING WORDS: the pick panel has no "+ Add a street" and its button reads "Done"; the preview\'s button reads exactly "Save route" (not the 1.127 compound "Looks right - save route"), and naming is NOT folded in - no name field lives in the preview; name-it stays its own step (Andrew\'s veto) | ' + JSON.stringify(wordsC) + ' | ' + JSON.stringify(pvC),
  wordsC.addBtn === false && wordsC.doneLbl === 'Done' && pvC.saveLbl === 'Save route' && pvC.nameInPv === false && pvC.namePane === true);
await ev2(`document.getElementById('pvAddBtn').click()`);
await poll(`crStage === 'pick'`, 10000);
const doneC2 = await J(`document.getElementById('crDoneBtn').textContent`);
await ev2(`document.getElementById('crDoneBtn').click()`);
await poll(`crStage === 'preview'`, 10000);
await ev2(`document.getElementById('pvSaveBtn').click()`);
const nameC = await poll(`document.getElementById('rmNamePane').classList.contains('on')`, 10000);
const preC = await J(`({ prefill: document.getElementById('crNameInput').value, saveLbl: document.getElementById('crSaveBtn').textContent, summary: document.getElementById('crNameSummary').textContent })`);
await ev2(`(() => { document.getElementById('crNameInput').value = 'Mapped Route 128'; return true; })()`);
await ev2(`document.getElementById('crSaveBtn').click()`);
const savedC = await poll(`!creating && Object.values(JSON.parse(localStorage.getItem('snowroute.v2.userpacks') || '{}')).some(p => p.name === 'Mapped Route 128')`, 15000);
const packC = await J(`(() => { const rec = JSON.parse(localStorage.getItem('snowroute.v2.userpacks') || '{}'); const p = Object.values(rec).find(x => x.name === 'Mapped Route 128'); return p ? { roads: Object.keys(p.roads).sort() } : { roads: [] }; })()`);
ok('157-C2 THE KEPT FLOW SAVES END-TO-END: after a "+ Add a street" round trip (Done still reads "Done"), "Save route" on the check screen advances to name-it - its own step, name pre-filled with the next Route guess, the summary billing 2 streets, its button also "Save route" - and that button is the actual save | Done label: ' + doneC2 + ', name-it: ' + nameC + ' | ' + JSON.stringify(preC) + ' | saved: ' + savedC + ' ' + JSON.stringify(packC),
  doneC2 === 'Done' && nameC === true && /^Route \d+$/.test(preC.prefill) && preC.saveLbl === 'Save route' && preC.summary.indexOf('2 streets') >= 0 && savedC === true && packC.roads.join() === 'Alpha Street,Long Road');

// ================= D: the continuous morph =================
const inD = await enterPickWithExtract();
await ev2(`pickStreet('Long Road', { lat: 43.8, lng: -79.574 })`);
await poll(`draft && !!draft.roads['Long Road']`, 10000);
await faceSettled('crPanel');
await headTap();
const samplesD = [];
for (let i = 0; i < 30; i++) {
  const s = await J(`(() => { const sh = document.getElementById('createSheet'); const p = document.getElementById('crPanel'); const st = document.getElementById('crStrip'); const cs = getComputedStyle(p).transform; let ty = 0; if (cs && cs.indexOf('matrix') === 0) ty = parseFloat(cs.split(',')[5]); return { ty, h: sh.offsetHeight, pd: getComputedStyle(p).display, sd: getComputedStyle(st).display }; })()`);
  samplesD.push(s);
  if (s.pd === 'none') break;
  await sleep(35);
}
const visD = samplesD.filter(s => s.pd !== 'none'); // the in-flight samples only: the loop's last sample is the post-landing rest state (transform cleared by cleanup), which is asserted separately below, not as motion
let monoD = true, maxStepD = 0;
for (let i = 1; i < visD.length; i++) { const d = visD[i].ty - visD[i - 1].ty; if (d < -1.5) monoD = false; if (Math.abs(d) > maxStepD) maxStepD = Math.abs(d); }
const bothD = samplesD.some(s => s.pd !== 'none' && s.sd !== 'none');
const restD = await J(`(() => { const sh = document.getElementById('createSheet'); const st = document.getElementById('crStrip'); return { sheetH: sh.offsetHeight, stripH: st.offsetHeight, pd: getComputedStyle(document.getElementById('crPanel')).display, sd: getComputedStyle(st).display }; })()`);
ok('157-D1 COLLAPSE IS ONE CONTINUOUS MOTION: sampled mid-flight, the panel\'s slide is monotonic in bounded steps (' + visD.length + ' visible samples, max step ' + Math.round(maxStepD) + ' px), BOTH faces are displayed at once mid-change (no hard swap into the pill), and the sheet lands exactly at the bar\'s resting height | ' + JSON.stringify(restD),
  visD.length >= 4 && monoD === true && maxStepD <= 220 && bothD === true && restD.pd === 'none' && restD.sd !== 'none' && Math.abs(restD.sheetH - (restD.stripH + 12)) <= 34);
await ev2(`document.getElementById('crReviewBtn').click()`);
const samplesE = [];
for (let i = 0; i < 30; i++) {
  const s = await J(`(() => { const sh = document.getElementById('createSheet'); return { h: sh.offsetHeight, pd: getComputedStyle(document.getElementById('crPanel')).display, sd: getComputedStyle(document.getElementById('crStrip')).display }; })()`);
  samplesE.push(s);
  if (s.sd === 'none') break;
  await sleep(35);
}
let monoE = true, maxStepE = 0;
for (let i = 1; i < samplesE.length; i++) { const d = samplesE[i].h - samplesE[i - 1].h; if (d < -2) monoE = false; if (Math.abs(d) > maxStepE) maxStepE = Math.abs(d); }
const movingE = samplesE.filter(s => s.sd !== 'none').length;
ok('157-D2 EXPAND IS THE SAME MOTION, REVERSED: the sheet\'s height grows monotonically in bounded steps (max step ' + Math.round(maxStepE) + ' px over ' + movingE + ' moving samples) until the panel is back and the bar is gone | last: ' + JSON.stringify(samplesE[samplesE.length - 1]),
  movingE >= 4 && monoE === true && maxStepE <= 220 && samplesE[samplesE.length - 1].pd !== 'none' && samplesE[samplesE.length - 1].sd === 'none');

// ================= E: the zero-pick bar =================
await ev2(`exitCreate()`);
const inE = await enterPickWithExtract();
const zeroE = await J(`({ disabled: document.getElementById('crDoneBtn').disabled, pd: getComputedStyle(document.getElementById('crPanel')).display, sd: getComputedStyle(document.getElementById('crStrip')).display })`);
await headTap();
const stripE = await poll(`getComputedStyle(document.getElementById('crStrip')).display !== 'none' && getComputedStyle(document.getElementById('crPanel')).display === 'none'`, 12000);
const titleE = await J(`document.getElementById('crStripTitle').textContent`);
await ev2(`document.getElementById('crReviewBtn').click()`);
const backE = await poll(`getComputedStyle(document.getElementById('crPanel')).display !== 'none' && getComputedStyle(document.getElementById('crStrip')).display === 'none'`, 12000);
ok('157-E1 THE BAR EXISTS AT ZERO PICKS: with nothing picked (Done disabled, panel up), a head tap still tucks the panel to the bottom bar - "No roads picked yet" - and Review brings the panel back (1.127 could not retract an empty panel at all) | entered: ' + inE + ' | ' + JSON.stringify(zeroE) + ' | tucked: ' + stripE + ' (' + titleE + '), restored: ' + backE,
  inE === true && zeroE.disabled === true && zeroE.pd !== 'none' && zeroE.sd === 'none' && stripE === true && titleE === 'No roads picked yet' && backE === true);
await ev2(`exitCreate()`);

R.exceptions = consoleLog.filter(l => l.indexOf('EXCEPTION') === 0);
  try { proc.kill('SIGKILL'); } catch (e) {}
  if (server) server.close();
  return R;
})();
R.checks.push(...R157.checks);

// ===== absorbed drive158 (test-suite restructure, 2026-11-09): run
// verbatim in its own rig (own server + browser + synthetic extract),
// checks appended to this drive's block. =====
const R158 = await (async () => {
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { R, ok } = makeResults();

// ---- the synthetic extract (drive156/157's geography) ----
const way = (id, name, pts) => ({ type: 'way', id, tags: { name }, geometry: pts.map(p => ({ lat: p[0], lon: p[1] })) });
const LONG_PTS = []; for (let i = 0; i <= 20; i++) LONG_PTS.push([43.8, -79.58 + i * 0.001]);
const ELEMENTS = [way(9001, 'Long Road', LONG_PTS)];
[[-79.576, 'First Cross Street'], [-79.572, 'Second Cross Street'], [-79.568, 'Third Cross Street'], [-79.564, 'Fourth Cross Street']]
  .forEach(([lng, nm], k) => { const pts = []; for (let i = 0; i <= 8; i++) pts.push([43.796 + i * 0.001, lng]); ELEMENTS.push(way(9010 + k, nm, pts)); });
const COV_BOX = { s: 43.788, w: -79.582, n: 43.806, e: -79.558 };

// ---- static server + CDP rig (shared: harness-create.mjs; no routing table - the rig's default passthrough fulfil is this drive's historical fulfil verbatim) ----
const { server, ORIGIN } = await serveRepo(REPO);
const rig = await startCreateRig({ profile: '/tmp/d158profile-' + Date.now() });
const { proc, send, PAGE_S, ev2, poll, consoleLog, J, bootRoute } = rig;
const mouse = async (type, x, y) => { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, PAGE_S); };
const headTap = async () => {
  const g = await J(`(() => { const r = document.getElementById('crPanelHead').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 10) }; })()`);
  await mouse('mousePressed', g.x, g.y); await sleep(50); await mouse('mouseReleased', g.x, g.y);
};
const enterPickWithExtract = async () => {
  await ev2(`enterCreate('pick')`);
  await ev2(`crCovMerge(${JSON.stringify(ELEMENTS)}, ${JSON.stringify(COV_BOX)}); crPrepState = 'ready'; crRenderHint(); true`);
  return await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick' && !!crCov`, 10000);
};
const rowClick = async () => { await ev2(`(() => { const r = document.querySelector('#crPickList .crPRow'); if (r) r.click(); return true; })()`); return await poll(`crSectorSession.street === 'Long Road'`, 10000); };
const clickCancel = async () => await J(`(() => { const b = document.getElementById('crSbCancel'); if (!b) return { exists: false }; const lbl = b.textContent; b.click(); return { exists: true, lbl }; })()`);
const rowSub = async () => await J(`(() => { const r = document.querySelector('#crPickList .crPRow'); return r ? (r.querySelector('.crPSub') || {}).textContent || '' : ''; })()`);
const settled = async () => await poll(`(typeof crMorph === 'undefined' || crMorph === null) && document.getElementById('createSheet').style.height === ''`, 12000);
const restRect = async () => await J(`(() => { const r = document.getElementById('createSheet').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; })()`);

await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
await bootRoute();
await ev2(`(() => { setThemeOverride(false); applyNight(); return true; })()`); // pin DAY through the app's own seam: the auto theme is sunset-driven, so an unpinned "day" run after sunset silently samples the night token (drive154's E3 lesson)

// ================= A: sector Cancel =================
const inA = await enterPickWithExtract();
await ev2(`pickStreet('Long Road', { lat: 43.8, lng: -79.574 })`);
await poll(`draft && !!draft.roads['Long Road']`, 10000);
// A1: trim this session, Cancel -> the whole road returns
const openA1 = await rowClick();
await ev2(`crSectorTap({ lat: 43.8, lng: -79.578 })`); // part 0 off
await ev2(`crSectorTap({ lat: 43.8, lng: -79.562 })`); // part 4 off
const trimA1 = await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 3`, 10000);
const ccA1 = await clickCancel();
const outA1 = await poll(`crSectorSession.street === null`, 10000);
await settled();
const stA1 = await J(`({ sec: draft.sectors['Long Road'], mode: crSectorSession.street, panel: getComputedStyle(document.getElementById('crPanel')).display, chosen: Math.round(crStreetChosenM('Long Road', computeStretches(draft.roads))) })`);
const subA1 = await rowSub();
ok('158-A1 CANCEL RESTORES THE ENTIRE ROAD: entered via the row, trimmed the two end sectors ([1,2,3]), Cancel restores the entry snapshot - no sector entry, the chosen length is the whole ~1,608 m again, the row reads "Entire road", sector mode closed and the panel is back | opened: ' + openA1 + ', trimmed: ' + trimA1 + ', cancel btn: ' + JSON.stringify(ccA1) + ', out: ' + outA1 + ' | ' + JSON.stringify(stA1) + ' | ' + subA1,
  inA === true && openA1 === true && trimA1 === true && ccA1.exists === true && ccA1.lbl === 'Cancel' && outA1 === true && stA1.sec === undefined && Math.abs(stA1.chosen - 1608) <= 4 && stA1.panel !== 'none' && subA1.indexOf('Entire road') === 0);
// A2: enter already trimmed, trim further, Cancel -> the ENTRY trim returns exactly
await rowClick();
await ev2(`crSectorTap({ lat: 43.8, lng: -79.578 })`);
await ev2(`crSectorTap({ lat: 43.8, lng: -79.562 })`);
await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 3`, 10000);
await ev2(`document.getElementById('crSbDone').click()`);
await poll(`crSectorSession.street === null`, 10000);
await settled();
const openA2 = await rowClick(); // snapshot is now [1,2,3]
await ev2(`crSectorTap({ lat: 43.8, lng: -79.574 })`); // part 1 off -> [2,3]
const trimA2 = await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 2`, 10000);
await clickCancel();
const outA2 = await poll(`crSectorSession.street === null`, 10000);
await settled();
const stA2 = await J(`({ sel: draft.sectors['Long Road'], chosen: Math.round(crStreetChosenM('Long Road', computeStretches(draft.roads))) })`);
const subA2 = await rowSub();
ok('158-A2 CANCEL RESTORES THE ENTRY TRIM, NOT THE ENTIRE ROAD: with [1,2,3] already saved by Done, re-entering and un-picking part 1 ([2,3]) then Cancel brings back exactly [1,2,3] - ~964 m, the row again reads "3 of 5 sectors" | opened: ' + openA2 + ', trimmed: ' + trimA2 + ', out: ' + outA2 + ' | ' + JSON.stringify(stA2) + ' | ' + subA2,
  openA2 === true && trimA2 === true && outA2 === true && JSON.stringify(stA2.sel) === '[1,2,3]' && Math.abs(stA2.chosen - 964) <= 8 && subA2.indexOf('3 of 5 sectors') === 0);
// A3: Done keeps the session's trims
await rowClick();
await ev2(`crSectorTap({ lat: 43.8, lng: -79.566 })`); // part 3 off -> [1,2]
const trimA3 = await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 2`, 10000);
await ev2(`document.getElementById('crSbDone').click()`);
const outA3 = await poll(`crSectorSession.street === null`, 10000);
await settled();
const stA3 = await J(`({ sel: draft.sectors['Long Road'] })`);
ok('158-A3 DONE KEEPS THE TRIMS: un-picking part 3 inside the session and pressing Done leaves the selection at [1,2] - Done and Cancel are different doors | trimmed: ' + trimA3 + ', out: ' + outA3 + ' | ' + JSON.stringify(stA3),
  trimA3 === true && outA3 === true && JSON.stringify(stA3.sel) === '[1,2]');
// A4: the MAP door snapshots too
await ev2(`(() => { // drive157's tap-seam stub: a box query names Long Road under the tap
  if (!map.__qrfOrig) map.__qrfOrig = map.queryRenderedFeatures.bind(map);
  map.queryRenderedFeatures = (arg) => {
    if (!Array.isArray(arg)) return [];
    const cx = (arg[0][0] + arg[1][0]) / 2, cy = (arg[0][1] + arg[1][1]) / 2;
    const a = map.unproject([cx - 40, cy]); const b = map.unproject([cx + 40, cy]);
    return [{ type: 'Feature', sourceLayer: 'roads', properties: { name: 'Long Road' }, geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } }];
  };
  return true;
})()`);
await ev2(`crMapTap({ point: { x: 210, y: 450 }, lngLat: { lat: 43.8, lng: -79.574 } })`);
const openA4 = await poll(`crSectorSession.street === 'Long Road'`, 10000);
await ev2(`(() => { if (map.__qrfOrig) { map.queryRenderedFeatures = map.__qrfOrig; delete map.__qrfOrig; } return true; })()`);
await ev2(`crSectorTap({ lat: 43.8, lng: -79.574 })`); // part 1 off -> [2]
const trimA4 = await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 1`, 10000);
await clickCancel();
const outA4 = await poll(`crSectorSession.street === null`, 10000);
await settled();
const stA4 = await J(`({ sel: draft.sectors['Long Road'] })`);
ok('158-A4 THE MAP DOOR SNAPSHOTS TOO: entering sector mode by re-tapping the picked road on the map, un-picking part 1 ([2]), then Cancel restores the entry state [1,2] - the snapshot discipline is the entry\'s, not the door\'s | opened: ' + openA4 + ', trimmed: ' + trimA4 + ', out: ' + outA4 + ' | ' + JSON.stringify(stA4),
  openA4 === true && trimA4 === true && outA4 === true && JSON.stringify(stA4.sel) === '[1,2]');
await ev2(`exitCreate()`);

// ================= B: the one-object animation, frame by frame =================
await ev2(`(() => { // the in-page frame sampler: records the ONE surface's box + background + opacity on every rAF while armed
  window.__anim = { on: false, frames: [] };
  window.__animStart = () => { const a = window.__anim; a.frames = []; a.on = true; const el = document.getElementById('createSheet'); const probe = document.createElement('div'); probe.style.background = 'var(--card-solid)'; document.body.appendChild(probe); const token = getComputedStyle(probe).backgroundColor; probe.remove(); const step = () => { if (!a.on) return; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); a.frames.push({ l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, bg: cs.backgroundColor, op: parseFloat(cs.opacity), token, tm: performance.now() }); requestAnimationFrame(step); }; requestAnimationFrame(step); return true; };
  window.__animStop = () => { window.__anim.on = false; return window.__anim.frames; };
  return true;
})()`);
const analyse = (frames, from, to) => {
  const edges = ['l', 't', 'r', 'b'];
  const travel = {}; for (const e of edges) travel[e] = Math.abs(to[e] - from[e]);
  const worst = { l: 0, t: 0, r: 0, b: 0 };
  for (let i = 1; i < frames.length; i++) for (const e of edges) worst[e] = Math.max(worst[e], Math.abs(frames[i][e] - frames[i - 1][e]));
  const present = frames.length > 0 && frames.every(f => f.w > 0 && f.h > 0 && f.op > 0 && f.bg === f.token && f.token !== 'rgba(0, 0, 0, 0)');
  const f0 = frames[0] || {}, fN = frames[frames.length - 1] || {};
  const startOk = edges.every(e => Math.abs((f0[e] || 0) - from[e]) <= 3);
  const endOk = edges.every(e => Math.abs((fN[e] || 0) - to[e]) <= 2);
  let mono = true; // every edge approaches its rest without reversing (the closed-form spring cannot overshoot at v0 = 0; a swap-then-settle or a two-box hand-off can reverse an edge)
  for (const e of edges) { const dir = Math.sign(to[e] - from[e]); if (!dir) continue; for (let i = 1; i < frames.length; i++) { if ((frames[i][e] - frames[i - 1][e]) * dir < -1.5) mono = false; } }
  const hTravel = Math.abs(to.h - from.h); // continuity is proven on the HEIGHT - the quantity the spring actually drives, and the largest signal in the box (a traced starved morph's mid-applies land within a couple px of the ends on the top edge of a short trip, but their heights are unambiguous)
  const hLo = Math.min(from.h, to.h) + 0.5, hHi = Math.max(from.h, to.h) - 0.5;
  const intermediates = new Set(frames.map(f => Math.round(f.h * 20) / 20).filter(v => v > hLo && v < hHi)).size;
  const big = 'h';
  const jumpOk = mono === true && (hTravel < 20 || intermediates >= (hTravel >= 90 ? 2 : 1)); // a swap yields ZERO intermediate heights at any cadence; a spring, however starved, applies at least one genuine mid-trip height on a trip of 20px+
  const needInter = hTravel < 20 ? 0 : (hTravel >= 90 ? 2 : 1);
  const discontinuity = frames.length > 0 && (mono === false || present === false); // Beta 1.130 (re-scan N4): the failure EVIDENCE is classified, and no assertion changes - an edge reversing or the surface vanishing mid-flight is an OBSERVED DISCONTINUITY; too few frames / intermediate heights to tell a starved spring from a swap is INSUFFICIENT OBSERVATION (the rig's cadence, not the app's motion). `worst` stays a reported number only - it was never part of jumpOk, and the check names now say so
  const diag = discontinuity ? 'OBSERVED DISCONTINUITY' : ((frames.length < 5 || intermediates < needInter) ? 'INSUFFICIENT OBSERVATION' : 'CONTINUOUS, FULLY OBSERVED');
  return { n: frames.length, worst, travel, jumpOk, present, startOk, endOk, mono, intermediates, big, diag };
};
const runTransition = async (trigger) => { await ev2(`window.__animStart()`); await trigger(); await settled(); await sleep(150); return await J(`window.__animStop()`); };

const inB = await enterPickWithExtract();
await ev2(`pickStreet('Long Road', { lat: 43.8, lng: -79.574 })`);
await poll(`draft && !!draft.roads['Long Road']`, 10000);
await settled();
await headTap(); await settled(); // a warm-up collapse + expand, unsampled: the first transitions after boot ride over a still-rendering map and the rig's starved rAF would grade itself, not the app
await ev2(`document.getElementById('crReviewBtn').click()`); await settled();
const VW = 420, VH = 900;
const restPanel = await restRect();
// B1 collapse (panel -> bar), triggered by the real head tap
const frB1 = await runTransition(async () => { await headTap(); });
const restStrip = await restRect();
const anB1 = analyse(frB1, restPanel, restStrip);
ok('158-B1 COLLAPSE - ONE OBJECT, EVERY FRAME: ' + anB1.n + ' frames sampled; the surface is visibly present (real size, opacity, the --card-solid background) in EVERY frame; continuity = monotonic edges + distinct intermediate heights (per-frame steps REPORTED, not asserted - worst steps ' + JSON.stringify(anB1.worst) + ' vs travel ' + JSON.stringify(anB1.travel) + '), and the motion runs from the panel\'s rest box to the bar\'s | entered: ' + inB + ' | panel rest ' + JSON.stringify(restPanel) + ' | bar rest ' + JSON.stringify(restStrip) + ' | evidence class: ' + anB1.diag,
  inB === true && anB1.n >= 5 && anB1.present === true && anB1.jumpOk === true && anB1.startOk === true && anB1.endOk === true);
// B2 expand (bar -> panel) via Review
const frB2 = await runTransition(async () => { await ev2(`document.getElementById('crReviewBtn').click()`); });
const restPanel2 = await restRect();
const anB2 = analyse(frB2, restStrip, restPanel2);
ok('158-B2 EXPAND - THE SAME OBJECT BACK: ' + anB2.n + ' frames; present in every frame, monotonic with distinct intermediate heights (per-frame steps reported, not asserted: worst steps ' + JSON.stringify(anB2.worst) + '), lands back on the panel\'s rest box | panel rest ' + JSON.stringify(restPanel2) + ' | evidence class: ' + anB2.diag,
  anB2.n >= 5 && anB2.present === true && anB2.jumpOk === true && anB2.startOk === true && anB2.endOk === true);
// B0 the three resting geometries are the approved ones
const frB3 = await runTransition(async () => { await rowClick(); });
const restBar = await restRect();
const geoOk = Math.abs(restPanel.l) <= 1.5 && Math.abs(restPanel.r - VW) <= 1.5 && Math.abs(restPanel.b - VH) <= 1.5
  && Math.abs(restStrip.l - 12) <= 2 && Math.abs(restStrip.r - (VW - 12)) <= 2 && Math.abs(restStrip.b - (VH - 12)) <= 2
  && Math.abs(restBar.l - 12) <= 2 && Math.abs(restBar.r - (VW - 12)) <= 2 && Math.abs(restBar.b - (VH - 12)) <= 2
  && restStrip.h < restPanel.h - 60 && restBar.h > restStrip.h + 20;
ok('158-B0 THE RESTING BOXES ARE THE APPROVED GEOMETRIES: panel flush (left 0, right ' + VW + ', bottom ' + VH + '), the tucked bar and the sector bar both inset 12px at the sides and lifted 12px off the bottom, the bar slimmer than the panel and the sector bar taller than the bar | panel ' + JSON.stringify(restPanel) + ' | strip ' + JSON.stringify(restStrip) + ' | bar ' + JSON.stringify(restBar),
  geoOk === true);
// B3 panel -> sector bar was the transition sampled above (frB3), analysed against the rests
const anB3 = analyse(frB3, restPanel2, restBar);
ok('158-B3 PANEL TO SECTOR BAR - THE SECOND-TAP ENTRY ANDREW NAMED: ' + anB3.n + ' frames; the surface never leaves the screen, no edge reverses and the height passes through distinct intermediates (per-frame steps reported, not asserted: worst ' + JSON.stringify(anB3.worst) + ' vs travel ' + JSON.stringify(anB3.travel) + '), panel rest to sector-bar rest | legs ' + JSON.stringify({ present: anB3.present, jumpOk: anB3.jumpOk, mono: anB3.mono, inter: anB3.intermediates, big: anB3.big, startOk: anB3.startOk, endOk: anB3.endOk, badBg: frB3.filter(f => f.bg !== f.token).length }) + ' | from ' + JSON.stringify(restPanel2) + ' to ' + JSON.stringify(restBar) + ' f0 ' + JSON.stringify(frB3[0]) + ' fN ' + JSON.stringify(frB3[frB3.length - 1]) + ' | evidence class: ' + anB3.diag,
  anB3.n >= 5 && anB3.present === true && anB3.jumpOk === true && anB3.startOk === true && anB3.endOk === true);
// B4 sector bar -> panel via Done
const frB4 = await runTransition(async () => { await ev2(`document.getElementById('crSbDone').click()`); });
const restPanel3 = await restRect();
const anB4 = analyse(frB4, restBar, restPanel3);
ok('158-B4 SECTOR BAR BACK TO PANEL: ' + anB4.n + ' frames; present in every frame, monotonic with distinct intermediate heights (per-frame steps reported, not asserted: worst steps ' + JSON.stringify(anB4.worst) + '), lands on the panel rest' + ' | evidence class: ' + anB4.diag,
  anB4.n >= 5 && anB4.present === true && anB4.jumpOk === true && anB4.startOk === true && anB4.endOk === true);

// ================= C: the same at night =================
await ev2(`(() => { setThemeOverride(true); applyNight(); return true; })()`); // pin NIGHT through the same seam - a bare body.night class would fight the app's own theme state
await sleep(150);
const frC1 = await runTransition(async () => { await headTap(); });
const restStripN = await restRect();
const anC1 = analyse(frC1, restPanel3, restStripN);
ok('158-C1 COLLAPSE AT NIGHT: ' + anC1.n + ' frames; the surface wears the NIGHT --card-solid (' + (frC1[0] ? frC1[0].token : 'none') + ') in every frame and the continuity predicate holds (per-frame steps reported, not asserted: worst steps ' + JSON.stringify(anC1.worst) + ') | legs ' + JSON.stringify({ present: anC1.present, jumpOk: anC1.jumpOk, mono: anC1.mono, inter: anC1.intermediates, endOk: anC1.endOk, badBg: frC1.filter(f => f.bg !== f.token).length, badOp: frC1.filter(f => !(f.op > 0)).length, tokDiff: frC1[0] && frB1[0] ? frC1[0].token !== frB1[0].token : 'na' }) + ' | stripN ' + JSON.stringify(restStripN) + ' | evidence class: ' + anC1.diag,
  anC1.n >= 5 && anC1.present === true && anC1.jumpOk === true && anC1.endOk === true && !!frC1[0] && frC1[0].token !== frB1[0].token);
const frC2 = await runTransition(async () => { await ev2(`document.getElementById('crReviewBtn').click()`); });
const anC2 = analyse(frC2, restStripN, await restRect());
ok('158-C2 EXPAND AT NIGHT: ' + anC2.n + ' frames; night token in every frame, monotonic with distinct intermediate heights (per-frame steps reported, not asserted: worst steps ' + JSON.stringify(anC2.worst) + '), lands on the panel rest' + ' | evidence class: ' + anC2.diag,
  anC2.n >= 5 && anC2.present === true && anC2.jumpOk === true && anC2.endOk === true);
await ev2(`(() => { setThemeOverride(false); applyNight(); return true; })()`);
await ev2(`exitCreate()`);

R.exceptions = consoleLog.filter(l => l.indexOf('EXCEPTION') === 0);
  try { proc.kill('SIGKILL'); } catch (e) {}
  if (server) server.close();
  return R;
})();
R.checks.push(...R158.checks);

R.exceptions = [...consoleLog.filter(l => l.indexOf('EXCEPTION') === 0), ...(R157.exceptions || []), ...(R158.exceptions || [])];
finishCreate(R, proc, server, { pretty: true });
