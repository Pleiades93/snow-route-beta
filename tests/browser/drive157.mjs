import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// drive157: Beta 1.128 - CREATE-FLOW ROUND 3 (Andrew's device feedback
// on 1.127 + the read-only diagnosis in beta1/work/sector-diagnosis-1128/).
//   A sector entry from the MAP: with a road-feature stub at the tap
//     seam (the rig cannot ready the basemap - the same seam drive150
//     stubs), a crMapTap on an ALREADY-PICKED street opens ITS sector
//     mode instead of removing it (1.127's tap-again-to-deselect is
//     retired); the row door still works, and an untrimmed row states
//     the affordance ("- tap row to adjust").
//   B one-piece honesty: a street with no cross-streets (Alpha: three
//     points, nothing crosses it) computes exactly ONE sector - its
//     bar says "One piece - no cross-streets to split it at" and
//     tapping its sole sector leaves the street picked (1.127 removed
//     it outright).
//   C wording + the kept naming step: the pick panel has NO
//     "+ Add a street" and its button reads "Done" in the fresh
//     state AND after a return from the preview; the preview's
//     button reads exactly "Save route" and advances to name-it
//     (naming STAYS its own final step - Andrew vetoed folding it
//     into the preview), whose own "Save route" is the actual save;
//     the flow saves end-to-end under the typed name.
//   D the panel morph: collapse and expand are sampled frame by
//     frame - the panel's translateY / the sheet's height move
//     monotonically in bounded steps, and mid-change BOTH faces are
//     displayed at once (no hard display swap: the 1.127 "glitch
//     into a pill").
//   E the zero-pick bar: with nothing picked the panel still tucks
//     to the bottom bar ("No roads picked yet") and Review restores
//     it; Done is disabled at zero.
// Red side (pristine 1.127 tree): A fails (the tap removes the
// street), B fails (bar reads "Whole road picked", the sole-sector
// tap deletes the street), C fails (the Add button exists and the
// preview's button reads the compound "Looks right - save route"),
// D fails (the faces hard-swap - no both-visible sample; expand
// jumps), E fails (the strip can never show at zero picks).
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

// ---- the synthetic extract (drive156's geography) ----
const way = (id, name, pts) => ({ type: 'way', id, tags: { name }, geometry: pts.map(p => ({ lat: p[0], lon: p[1] })) });
const LONG_PTS = []; for (let i = 0; i <= 20; i++) LONG_PTS.push([43.8, -79.58 + i * 0.001]);
const ELEMENTS = [way(9001, 'Long Road', LONG_PTS)];
[[-79.576, 'First Cross Street'], [-79.572, 'Second Cross Street'], [-79.568, 'Third Cross Street'], [-79.564, 'Fourth Cross Street']]
  .forEach(([lng, nm], k) => { const pts = []; for (let i = 0; i <= 8; i++) pts.push([43.796 + i * 0.001, lng]); ELEMENTS.push(way(9010 + k, nm, pts)); });
ELEMENTS.push(way(9020, 'Alpha Street', [[43.79, -79.5795], [43.79, -79.578], [43.79, -79.5765]]));
const COV_BOX = { s: 43.788, w: -79.582, n: 43.806, e: -79.558 };

// ---- static server + CDP rig (drive156's pattern) ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/plain', '.py': 'text/plain', '.yml': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;
const PROFILE = '/tmp/d157profile-' + Date.now();
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
const headTap = async () => { // a quick tap on the panel's grab head (short sleeps - the D-section sampling needs the spring still running)
  const g = await J(`(() => { const r = document.getElementById('crPanelHead').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 10) }; })()`);
  await mouse('mousePressed', g.x, g.y); await sleep(50); await mouse('mouseReleased', g.x, g.y);
};
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
const faceSettled = async (face) => await poll(`getComputedStyle(document.getElementById('${face}')).display !== 'none' && document.getElementById('createSheet').style.height === ''`, 12000);

await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
await bootRoute();

// ================= A: sector entry from the map =================
const inA = await enterPickWithExtract();
await ev2(`pickStreet('Long Road', { lat: 43.8, lng: -79.574 })`);
const addedA = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Long']`, 15000);
const rowA = await J(`(() => { const r = document.querySelector('#crPickList .crPRow'); return r ? (r.querySelector('.crPSub') || {}).textContent || '' : ''; })()`);
ok('A1 THE UNTRIMMED ROW STATES THE AFFORDANCE: a freshly picked road\'s row reads "Whole road · X m — tap row to adjust" (the hint exists before any trim, not only after one) | entered: ' + inA + ', added: ' + addedA + ' | ' + rowA,
  inA === true && addedA === true && rowA.indexOf('Whole road') === 0 && rowA.indexOf('tap row to adjust') > 0);
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
const secA = await poll(`typeof crSectorStreet !== 'undefined' && crSectorStreet === 'Long'`, 10000);
const keptA = await J(`({ kept: !!(draft && draft.roads['Long']), bar: getComputedStyle(document.getElementById('crSectorBar')).display })`);
await ev2(`(() => { if (map.__qrfOrig) { map.queryRenderedFeatures = map.__qrfOrig; delete map.__qrfOrig; } return true; })()`);
ok('A2 A MAP TAP ON A PICKED ROAD OPENS ITS SECTORS: the real crMapTap, fed a road feature naming the picked street, enters sector mode for it (the street is NOT removed - 1.127\'s tap-again removal is retired) | sector mode: ' + secA + ' | ' + JSON.stringify(keptA),
  secA === true && keptA.kept === true);
await ev2(`document.getElementById('crSbDone').click()`);
await poll(`crSectorStreet === null`, 10000);
await faceSettled('crPanel');
await ev2(`pickStreet('Long Road', { lat: 43.8, lng: -79.574 })`);
const secA2 = await poll(`crSectorStreet === 'Long' && draft && !!draft.roads['Long']`, 10000);
const toastA = await J(`document.getElementById('toast').textContent`);
ok('A3 THE PICK ENTRY AGREES: pickStreet on the picked street opens its sectors again and no removal toast fires | reopened: ' + secA2 + ' | toast: ' + toastA,
  secA2 === true && toastA.indexOf('Removed') !== 0);
await ev2(`document.getElementById('crSbDone').click()`);
await poll(`crSectorStreet === null`, 10000);
await faceSettled('crPanel');

// ================= B: one-piece honesty =================
await ev2(`pickStreet('Alpha Street', { lat: 43.79, lng: -79.578 })`);
const twoB = await poll(`draft && Object.keys(draft.roads).length === 2`, 10000);
await ev2(`(() => { const r = [...document.querySelectorAll('#crPickList .crPRow')].find(x => (x.querySelector('.crPName') || {}).textContent === 'Alpha'); if (r) r.click(); return true; })()`);
const secB = await poll(`crSectorStreet === 'Alpha'`, 10000);
const barB = await J(`document.getElementById('crSbSub').textContent`);
await ev2(`crSectorTap({ lat: 43.79, lng: -79.578 })`); // dead on Alpha's only sector
await sleep(500);
const afterB = await J(`({ kept: !!(draft && draft.roads['Alpha']), roads: draft ? Object.keys(draft.roads).length : -1, sec: draft && draft.sectors ? draft.sectors['Alpha'] : undefined, toast: document.getElementById('toast').textContent, mode: crSectorStreet })`);
ok('B1 ONE-PIECE STREETS ARE HONEST: Alpha (nothing crosses it) computes one sector; its bar says "One piece — no cross-streets to split it at", and tapping that sole sector leaves the street picked, in sector mode, with a toast saying why | 2 picked: ' + twoB + ', mode: ' + secB + ' | bar: ' + barB + ' | ' + JSON.stringify(afterB),
  twoB === true && secB === true && barB.indexOf('One piece') === 0 && barB.indexOf('no cross-streets to split it at') > 0 && afterB.kept === true && afterB.roads === 2 && afterB.mode === 'Alpha' && afterB.toast.indexOf('one piece') > 0);
await ev2(`document.getElementById('crSbDone').click()`);
await poll(`crSectorStreet === null`, 10000);
await faceSettled('crPanel');

// ================= C: wording + folded naming =================
const wordsC = await J(`({ addBtn: !!document.getElementById('crAddBtn'), doneLbl: document.getElementById('crDoneBtn').textContent })`);
await ev2(`document.getElementById('crDoneBtn').click()`);
await poll(`crStage === 'preview'`, 10000);
const pvC = await J(`({ saveLbl: document.getElementById('pvSaveBtn').textContent, nameInPv: !!document.getElementById('previewSheet').querySelector('#crNameInput'), namePane: !!document.getElementById('rmNamePane') })`);
ok('C1 THE FINISHING WORDS: the pick panel has no "+ Add a street" and its button reads "Done"; the preview\'s button reads exactly "Save route" (not the 1.127 compound "Looks right - save route"), and naming is NOT folded in - no name field lives in the preview; name-it stays its own step (Andrew\'s veto) | ' + JSON.stringify(wordsC) + ' | ' + JSON.stringify(pvC),
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
ok('C2 THE KEPT FLOW SAVES END-TO-END: after a "+ Add a street" round trip (Done still reads "Done"), "Save route" on the check screen advances to name-it - its own step, name pre-filled with the next Route guess, the summary billing 2 streets, its button also "Save route" - and that button is the actual save | Done label: ' + doneC2 + ', name-it: ' + nameC + ' | ' + JSON.stringify(preC) + ' | saved: ' + savedC + ' ' + JSON.stringify(packC),
  doneC2 === 'Done' && nameC === true && /^Route \d+$/.test(preC.prefill) && preC.saveLbl === 'Save route' && preC.summary.indexOf('2 streets') >= 0 && savedC === true && packC.roads.join() === 'Alpha,Long');

// ================= D: the continuous morph =================
const inD = await enterPickWithExtract();
await ev2(`pickStreet('Long Road', { lat: 43.8, lng: -79.574 })`);
await poll(`draft && !!draft.roads['Long']`, 10000);
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
ok('D1 COLLAPSE IS ONE CONTINUOUS MOTION: sampled mid-flight, the panel\'s slide is monotonic in bounded steps (' + visD.length + ' visible samples, max step ' + Math.round(maxStepD) + ' px), BOTH faces are displayed at once mid-change (no hard swap into the pill), and the sheet lands exactly at the bar\'s resting height | ' + JSON.stringify(restD),
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
ok('D2 EXPAND IS THE SAME MOTION, REVERSED: the sheet\'s height grows monotonically in bounded steps (max step ' + Math.round(maxStepE) + ' px over ' + movingE + ' moving samples) until the panel is back and the bar is gone | last: ' + JSON.stringify(samplesE[samplesE.length - 1]),
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
ok('E1 THE BAR EXISTS AT ZERO PICKS: with nothing picked (Done disabled, panel up), a head tap still tucks the panel to the bottom bar - "No roads picked yet" - and Review brings the panel back (1.127 could not retract an empty panel at all) | entered: ' + inE + ' | ' + JSON.stringify(zeroE) + ' | tucked: ' + stripE + ' (' + titleE + '), restored: ' + backE,
  inE === true && zeroE.disabled === true && zeroE.pd !== 'none' && zeroE.sd === 'none' && stripE === true && titleE === 'No roads picked yet' && backE === true);
await ev2(`exitCreate()`);

R.exceptions = consoleLog.filter(l => l.indexOf('EXCEPTION') === 0);
console.log(JSON.stringify(R, null, 1));
try { proc.kill('SIGKILL'); } catch (e) {}
server.close();
process.exit(0);
