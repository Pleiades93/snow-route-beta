import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
//   A sectors: whole-road pick -> row reads "Whole road"; the row
//     opens sector mode (bar replaces panel, draft renders 5 sector
//     features, all chosen); two sector taps trim the street to its
//     middle 3 parts; Whole road restores; trimming again and saving
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
const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

// ---- the synthetic extract (Overpass element shape) ----
const way = (id, name, pts) => ({ type: 'way', id, tags: { name }, geometry: pts.map(p => ({ lat: p[0], lon: p[1] })) });
const LONG_PTS = []; for (let i = 0; i <= 20; i++) LONG_PTS.push([43.8, -79.58 + i * 0.001]);
const ELEMENTS = [way(9001, 'Long Road', LONG_PTS)];
[[-79.576, 'First Cross Street'], [-79.572, 'Second Cross Street'], [-79.568, 'Third Cross Street'], [-79.564, 'Fourth Cross Street']]
  .forEach(([lng, nm], k) => { const pts = []; for (let i = 0; i <= 8; i++) pts.push([43.796 + i * 0.001, lng]); ELEMENTS.push(way(9010 + k, nm, pts)); });
const FILLERS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf'];
FILLERS.forEach((nm, i) => { const lat = 43.79 + i * 0.0022; ELEMENTS.push(way(9020 + i, nm + ' Street', [[lat, -79.5795], [lat, -79.578], [lat, -79.5765]])); });
const COV_BOX = { s: 43.788, w: -79.582, n: 43.806, e: -79.558 };

// ---- static server + CDP rig (drive155's pattern) ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/plain', '.py': 'text/plain', '.yml': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;
const PROFILE = '/tmp/d156profile-' + Date.now();
const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-proxy-server', '--remote-debugging-port=0', '--disable-features=LocalNetworkAccessChecks', '--user-data-dir=' + PROFILE, '--window-size=420,900', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
const wsUrl = await new Promise((res, rej) => { let buf = ''; proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); setTimeout(() => rej(new Error('no devtools url')), 25000); });
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let nextId = 1; const pending = new Map(); const consoleLog = []; const sessions = new Set();
let PAGE_S = null;
function send(method, params = {}, sessionId) { const id = nextId++; return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
async function fulfil(sessionId, p) {
  try {
    const r = await fetch(p.request.url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: r.status, responseHeaders: [{ name: 'Content-Type', value: r.headers.get('content-type') || 'application/octet-stream' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: buf.toString('base64') }, sessionId);
  } catch (e) { try { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); } catch (e2) {} }
}
ws.addEventListener('message', async ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Target.attachedToTarget') {
    const sid = msg.params.sessionId;
    if (!sessions.has(sid)) { sessions.add(sid); await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sid); }
    return;
  }
  if (msg.method === 'Fetch.requestPaused') { fulfil(msg.sessionId, msg.params); return; }
  if (msg.method === 'Runtime.exceptionThrown' && msg.sessionId === PAGE_S) { const d = msg.params.exceptionDetails; consoleLog.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text)); }
});
await send('Target.setAutoAttach', { autoAttach: true, flatten: true, waitForDebuggerOnStart: false });
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
PAGE_S = (await send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId;
await send('Page.enable', {}, PAGE_S);
await send('Runtime.enable', {}, PAGE_S);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, PAGE_S);
async function evaluate(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, PAGE_S); if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result && r.result.result ? r.result.result.value : undefined; }
const ev2 = async (code) => evaluate(code);
const poll = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { let v; try { v = await ev2(expr); } catch (e) { v = undefined; } if (v === true) return true; await sleep(400); } return false; };
const J = async (expr) => { const raw = await ev2(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const mouse = async (type, x, y) => { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, PAGE_S); };
const pressAt = async (x, y) => { await mouse('mousePressed', x, y); await sleep(90); await mouse('mouseReleased', x, y); await sleep(250); };
const bootRoute = async () => {
  await poll(`!!document.getElementById('ver')`, 20000);
  await poll(`!!window.__bootAt`, 30000);
  await poll(`!!document.getElementById('rmChoose')`, 20000);
  await ev2(`document.getElementById('rmChoose').click()`);
  await poll(`!!document.querySelector('#rmRoutes .routeRow')`, 20000);
  await ev2(`document.querySelector('#rmRoutes .routeRow').click()`);
  await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 30000);
  await poll(`!document.getElementById('splash')`, 10000);
};
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
const addedA = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Long']`, 15000);
const rowA = await J(`(() => { const r = document.querySelector('#crPickList .crPRow'); return { panel: !!document.getElementById('crPanel'), sub: r ? (r.querySelector('.crPSub') || {}).textContent || '' : '', count: document.getElementById('crCount').textContent, whole: draft && draft.roads['Long'] ? Math.round(computeStretches(draft.roads)['Long'].total) : -1 }; })()`);
ok('A1 WHOLE-ROAD PICK, PANEL SHAPE: picking Long Road adds it whole (its stitched length is ~1,608 m) and the new panel lists it with a "Whole road" sub-line under a "1 roads" header count | entered: ' + inA + ', added: ' + addedA + ' | ' + JSON.stringify(rowA),
  inA === true && addedA === true && rowA.panel === true && rowA.sub.indexOf('Whole road') === 0 && Math.abs(rowA.whole - 1608) <= 4 && rowA.count.indexOf('1 roads') === 0);
await ev2(`(() => { const r = document.querySelector('#crPickList .crPRow'); if (r) r.click(); return true; })()`);
const secA = await poll(`typeof crSectorStreet !== 'undefined' && crSectorStreet === 'Long'`, 10000);
await poll(`getComputedStyle(document.getElementById('crPanel')).display === 'none'`, 12000); // Beta 1.128: face changes are a continuous morph now - wait for the panel to fully hand over before reading the bar's face state
const barA = await J(`({ bar: getComputedStyle(document.getElementById('crSectorBar')).display, panel: getComputedStyle(document.getElementById('crPanel')).display, sub: document.getElementById('crSbSub').textContent, feats: (map.getSource('crDraft').serialize().data.features || []).filter(f => f.properties.name === 'Long').map(f => f.properties.chosen) })`);
ok('A2 SECTOR MODE OPENS FROM THE ROW: the sector bar replaces the panel, reads "Whole road picked", and the draft renders Long Road as FIVE sector features, all chosen - the four cross streets cut it into five junction-to-junction parts | sector mode: ' + secA + ' | ' + JSON.stringify(barA),
  secA === true && barA.bar !== 'none' && barA.panel === 'none' && barA.sub.indexOf('Whole road picked') === 0 && barA.feats.length === 5 && barA.feats.every(c => c === 1));
await ev2(`crSectorTap({ lat: 43.8, lng: -79.578 })`); // the middle of part 0
const trim1 = await poll(`!!draft.sectors['Long'] && draft.sectors['Long'].length === 4`, 10000);
await ev2(`crSectorTap({ lat: 43.8, lng: -79.562 })`); // the middle of part 4
const trim2 = await poll(`!!draft.sectors['Long'] && draft.sectors['Long'].length === 3`, 10000);
const trimA = await J(`({ sel: draft.sectors['Long'], chosenM: Math.round(crStreetChosenM('Long', computeStretches(draft.roads))), sub: document.getElementById('crSbSub').textContent, feats: (map.getSource('crDraft').serialize().data.features || []).filter(f => f.properties.name === 'Long').map(f => f.properties.chosen) })`);
ok('A3 SECTOR TAPS TRIM: tapping the end sectors un-picks exactly them - the selection is the middle three parts [1,2,3], the chosen length ~964 m (3 of 5 parts), the bar says so, and the draft features mark the two ends unchosen | ' + JSON.stringify(trimA),
  trim1 === true && trim2 === true && JSON.stringify(trimA.sel) === '[1,2,3]' && Math.abs(trimA.chosenM - 964) <= 8 && trimA.sub.indexOf('3 of 5 sectors picked') === 0 && JSON.stringify(trimA.feats) === '[0,1,1,1,0]');
await ev2(`document.getElementById('crSbWhole').click()`);
const wholeA = await poll(`!draft.sectors['Long']`, 10000);
const wholeSub = await J(`document.getElementById('crSbSub').textContent`);
ok('A4 WHOLE ROAD RESTORES: the bar\'s Whole road button clears the trim (no sector entry - the draft\'s default state) and the bar reads "Whole road picked" again | restored: ' + wholeA + ' | ' + wholeSub,
  wholeA === true && wholeSub.indexOf('Whole road picked') === 0);
await ev2(`crSectorTap({ lat: 43.8, lng: -79.578 })`);
await poll(`!!draft.sectors['Long'] && draft.sectors['Long'].length === 4`, 10000);
await ev2(`crSectorTap({ lat: 43.8, lng: -79.562 })`);
await poll(`!!draft.sectors['Long'] && draft.sectors['Long'].length === 3`, 10000);
await ev2(`document.getElementById('crSbDone').click()`);
const doneA = await poll(`crSectorStreet === null`, 10000);
await poll(`getComputedStyle(document.getElementById('crSectorBar')).display === 'none'`, 12000); // Beta 1.128: same morph settle wait on the way back
const rowA2 = await J(`(() => { const r = document.querySelector('#crPickList .crPRow'); return { bar: getComputedStyle(document.getElementById('crSectorBar')).display, panel: getComputedStyle(document.getElementById('crPanel')).display, sub: r ? (r.querySelector('.crPSub') || {}).textContent || '' : '', count: document.getElementById('crCount').textContent }; })()`);
ok('A5 DONE RETURNS TO THE PANEL, AND THE ROW TELLS THE TRIM: "Done with this road" closes sector mode, the panel is back, its row reads "3 of 5 sectors · ~964 m - tap row to adjust" and the header total bills the chosen length only | done: ' + doneA + ' | ' + JSON.stringify(rowA2),
  doneA === true && rowA2.bar === 'none' && rowA2.panel !== 'none' && rowA2.sub.indexOf('3 of 5 sectors') === 0 && /9[0-9]{2} m/.test(rowA2.sub) && /roads · 9[0-9]{2} m/.test(rowA2.count));
await ev2(`document.getElementById('crDoneBtn').click()`);
await poll(`crStage === 'preview'`, 10000);
const pvA = await J(`(() => { const num = s => Number(String(s).replace(/[^0-9]/g, '')) || 0; const rows = [...document.querySelectorAll('#pvList .crRow')].map(r => ({ n: (r.querySelector('.crName') || {}).textContent || '', m: num((r.querySelector('.crLen') || {}).textContent || '') })); const psub = (document.querySelector('#crPickList .crPRow .crPSub') || {}).textContent || ''; return { rows, rowSum: rows.reduce((a, r) => a + r.m, 0), countM: num(document.getElementById('pvCount').textContent.split('·').pop()), panelM: num(psub.split('·')[1] || '') }; })()`);
ok('A6 PREVIEW BILLS THE TRIM (Beta 1.130, re-scan N1): on the check screen the trimmed street\'s row bills the CHOSEN ~964 m - the same figure the picking panel billed - NOT the whole 1,608 m, and the preview\'s own total equals the sum of its rows (through 1.129 crRowEl read the whole-road total, so the check screen\'s rows and total disagreed with each other and with the panel) | ' + JSON.stringify(pvA),
  pvA.rows.length === 1 && Math.abs(pvA.rows[0].m - 964) <= 8 && pvA.rows[0].m === pvA.panelM && pvA.countM === pvA.rowSum);
await ev2(`document.getElementById('pvSaveBtn').click()`);
await poll(`document.getElementById('rmNamePane').classList.contains('on')`, 10000);
await ev2(`(() => { document.getElementById('crNameInput').value = 'Sector Test Route'; document.getElementById('crSaveBtn').click(); return true; })()`);
const savedA = await poll(`(() => { try { const rec = JSON.parse(localStorage.getItem('snowroute.v2.userpacks') || '{}'); return Object.values(rec).some(p => p.name === 'Sector Test Route'); } catch (e) { return false; } })()`, 15000);
const packA = await J(`(() => { const rec = JSON.parse(localStorage.getItem('snowroute.v2.userpacks') || '{}'); const p = Object.values(rec).find(x => x.name === 'Sector Test Route'); if (!p) return { found: false }; const g = computeStretches(p.roads); return { found: true, segs: p.roads['Long'].length, total: Math.round(g['Long'].total), pts: p.roads['Long'].reduce((a, s) => a + s.length, 0) }; })()`);
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
const chipB = await poll(`draft.mains.has('Long')`, 10000);
const chipTxt = await J(`(() => { const r = [...document.querySelectorAll('#crPickList .crPRow')].find(x => (x.querySelector('.crPName') || {}).textContent === 'Long'); return r ? (r.querySelector('.crPChip') || {}).textContent || '' : ''; })()`);
await ev2(`(() => { const r = [...document.querySelectorAll('#crPickList .crPRow')].find(x => (x.querySelector('.crPName') || {}).textContent === 'Long'); if (r) r.querySelector('.crPChip').click(); return true; })()`);
const chipBack = await poll(`!draft.mains.has('Long') && crSectorStreet === null`, 10000);
ok('B3 THE IN-ROW CHIP FLIPS MAIN/2ND: one tap on Long\'s chip puts it in the mains set and the chip reads MAIN; a second tap flips it back - and neither tap opened sector mode (the chip keeps its own tap) | to main: ' + chipB + ' (' + chipTxt + '), back: ' + chipBack,
  chipB === true && chipTxt === 'MAIN' && chipBack === true);
// Beta 1.128 premise update: tap-again-to-deselect is RETIRED (Andrew's fork) - picking a picked street opens its sectors instead; removal lives on the row's x and Clear all
await ev2(`pickStreet('Alpha Street', { lat: 43.79, lng: -79.578 })`);
const secB = await poll(`crSectorStreet === 'Alpha' && draft && !!draft.roads['Alpha'] && Object.keys(draft.roads).length === 8`, 10000);
await ev2(`document.getElementById('crSbDone').click()`);
await poll(`crSectorStreet === null`, 10000);
await ev2(`(() => { const r = [...document.querySelectorAll('#crPickList .crPRow')].find(x => (x.querySelector('.crPName') || {}).textContent === 'Alpha'); if (r) r.querySelector('.crPDel').click(); return true; })()`);
const deselB = await poll(`draft && !draft.roads['Alpha'] && Object.keys(draft.roads).length === 7`, 10000);
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

R.exceptions = consoleLog.filter(l => l.indexOf('EXCEPTION') === 0);
console.log(JSON.stringify(R, null, 1));
try { proc.kill('SIGKILL'); } catch (e) {}
server.close();
process.exit(0);
