// Ported from the maintainer's local drive battery (same filename); the
// test body is unchanged - only harness plumbing differs: CHROME_BIN env
// override for the browser path, repo-relative source path, default page.
// Runner: tests/browser/run.mjs. See docs/TESTING.md.
// v6 driver: serve the v6 folder locally, load in headless Chromium, and fulfill all
// remote map requests (jsDelivr / OpenFreeMap / Esri) through Node fetch (env proxy),
// so the page runs its REAL production pipeline. sw.js is 404'd to keep the run hermetic.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');
const DIR = new URL('../../src/', import.meta.url).pathname;
const PAGE = process.argv[2] || 'tracker-source.html';
const PORT = 8931;
const outPrefix = process.argv[2] || '/tmp/v6';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// (no local HTTP server: Chromium's Local Network Access checks block 127.0.0.1 navigations
//  from a fresh target, so the page is loaded via file:// like the earlier harnesses;
//  remote map requests are still fulfilled through Node fetch below.)
const proc = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-proxy-server',
  '--remote-debugging-port=0', '--disable-features=LocalNetworkAccessChecks', '--user-data-dir=/tmp/v6profile-' + Date.now(),
  '--window-size=420,900', 'about:blank'
], { stdio: ['ignore', 'pipe', 'pipe'] });

const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
  setTimeout(() => rej(new Error('no devtools url: ' + buf.slice(0, 500))), 25000);
});
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let nextId = 1;
const pending = new Map();
const consoleLog = [];
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method === 'Runtime.consoleAPICalled') {
    consoleLog.push({ type: msg.params.type, text: (msg.params.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ') });
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    consoleLog.push({ type: 'EXCEPTION', text: (d.exception && d.exception.description) || d.text });
  } else if (msg.method === 'Fetch.requestPaused') {
    handlePaused(msg.params);
  }
});
function send(method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
}
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = sessionId;

async function handlePaused(p) {
  const url = p.request.url;
  try {
    if (url.endsWith('/sw.js')) {
      await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 404, body: '' }, S);
      return;
    }
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    await send('Fetch.fulfillRequest', {
      requestId: p.requestId, responseCode: r.status,
      responseHeaders: [{ name: 'Content-Type', value: ct }, { name: 'Access-Control-Allow-Origin', value: '*' }],
      body: buf.toString('base64')
    }, S);
  } catch (e) {
    await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, S);
  }
}
await send('Fetch.enable', { patterns: [
  { urlPattern: '*jsdelivr*', requestStage: 'Request' },
  { urlPattern: '*openfreemap*', requestStage: 'Request' },
  { urlPattern: '*arcgisonline*', requestStage: 'Request' },
  { urlPattern: '*unpkg*', requestStage: 'Request' },
  { urlPattern: '*cartocdn*', requestStage: 'Request' },
  { urlPattern: '*sw.js', requestStage: 'Request' }
] }, S);
await send('Page.enable', {}, S);
await send('Runtime.enable', {}, S);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
await send('Page.navigate', { url: 'file://' + DIR + '/' + PAGE }, S);

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 400) };
  return r.result && r.result.result ? r.result.result.value : undefined;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' }, S);
  fs.writeFileSync(name, Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
}



// drive118: audit remediation regression suite (spec 2026-10-29). Covers the gaps the older drives do not:
// invalid coverage indexes (F-2), invalid GPS fixes (G-1), coverage suggestion behaviour incl. parallel
// streets (spec GPS), restore write failure + rollback (suite 5), failed rollback verification (suite 6),
// invalid nested history (suite 3), current-format backup round-trip (suite 1), failed history write at
// finish (suite 11), partial multi-key save consistency (suite 12).
// drive143: Beta 1.70 audit fixes (full audit of 1.69, adjudicated 2026-11-02).
// U1: Undo reports a failed metadata save instead of claiming full restoration (A01).
// C1/C2: coverage + suggestions are run-scoped - Cancel clears them, Clear counts them (A04).
// G1-G3: archived distance/path are measured from the run's true start (A05).
// D1: the piece-time sanitizer is bounded by the street's stretch count (A06).
// G4: GPX splits sessions into separate track segments (A07). H1: no duplicate sheet IDs (A08).
import { readFileSync } from 'node:fs';
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const ev = async (code) => evaluate(code);
const src = readFileSync(new URL('../../src/tracker-source.html', import.meta.url), 'utf8');
ok('H1 sheet panels use shared classes, no duplicate IDs | sheetHead ids ' + (src.split('id="sheetHead"').length - 1) + ' classes ' + (src.split('class="sheetHead"').length - 1), (src.split('id="sheetHead"').length - 1) === 0 && (src.split('id="sheetTitle"').length - 1) === 0 && (src.split('class="sheetHead"').length - 1) === 2 && (src.split('class="sheetTitle"').length - 1) === 2);
const poll120 = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { const v = await ev(expr); if (v === true) return true; await sleep(300); } return false; };
ok('T0 app script and map object are live', await poll120(`typeof map !== 'undefined' && !!map && typeof finishRun === 'function' && typeof buildSnap === 'function'`, 90000));
// U1: finish a 3-street clean, then undo with the notes/times saves broken.
await ev(`(() => { runStart = Date.now() - 3600000; markDone('Velmar', 'tap'); markDone('Mellings', 'tap'); markDone('Astona', 'tap'); suggested = new Set(['Boddy']); finishRun(); return true; })()`);
await sleep(300);
const u0 = JSON.parse(await ev(`(() => JSON.stringify({ undo: !!undoSnap, btn: $('resetBtn').textContent, sug: suggested.size }))()`));
ok('U0 setup: finish archived and undo is on offer; the finish cleared the suggestion set (A04) | ' + JSON.stringify(u0), u0.undo === true && u0.btn === 'Undo' && u0.sug === 0);
await ev(`(() => { window.__lsSet = lsSet; lsSet = (k, v) => (k === LS.notes || k === LS.times) ? false : window.__lsSet(k, v); doUndo(); return true; })()`);
await sleep(200);
const u1 = JSON.parse(await ev(`(() => JSON.stringify({ toast: $('toast').textContent, done: doneSet.size, run: !!runStart }))()`));
await ev(`(() => { lsSet = window.__lsSet; return true; })()`);
ok('U1 undo with metadata saves broken warns instead of claiming a clean restore | ' + JSON.stringify(u1), u1.done === 3 && u1.run === true && u1.toast.indexOf('could not be saved') >= 0);
// C1: cancel a clean that has coverage but no marks - coverage and suggestions die with it.
await ev(`(() => { runStart = Date.now(); coveredIdx = { Velmar: [0, 1, 2] }; suggested = new Set(['Velmar']); cancelStart(); return true; })()`);
const c1 = JSON.parse(await ev(`(() => JSON.stringify({ cov: Object.keys(coveredIdx).length, sug: suggested.size, toast: $('toast').textContent }))()`));
ok('C1 cancel clears the cancelled run coverage and suggestions | ' + JSON.stringify(c1), c1.cov === 0 && c1.sug === 0 && c1.toast === 'Start cancelled');
// C2: Clear with coverage-only state clears it instead of claiming nothing to do.
await ev(`(() => { coveredIdx = { Velmar: [0] }; suggested = new Set(['Velmar']); clearAllMarks(); return true; })()`);
const c2 = JSON.parse(await ev(`(() => JSON.stringify({ cov: Object.keys(coveredIdx).length, sug: suggested.size, toast: $('toast').textContent }))()`));
ok('C2 clear counts coverage-only state as something to clear | ' + JSON.stringify(c2), c2.cov === 0 && c2.sug === 0 && c2.toast !== 'Nothing marked to clear');
// G1/G2: a segment straddling the run start is not counted; only whole in-run segments are.
const g = JSON.parse(await ev(`(() => { const t0 = 1700000000; trail = [[43.82, -79.560, t0 - 60], [43.82, -79.559, t0 + 60], [43.82, -79.558, t0 + 120]]; const km = trailKm(t0 * 1000); const segIn = distM(trail[1], trail[2]) / 1000; const segStraddle = distM(trail[0], trail[1]) / 1000; return JSON.stringify({ km, segIn, segStraddle }); })()`));
ok('G1/G2 distance from run start counts only segments with both endpoints in the run | km ' + g.km.toFixed(3) + ' in-run ' + g.segIn.toFixed(3) + ' straddle ' + g.segStraddle.toFixed(3), Math.abs(g.km - g.segIn) < 0.002 && g.km < g.segIn + g.segStraddle - 0.01);
// G3: the archive measures km from the run start and its path admits no earlier point.
const g3 = JSON.parse(await ev(`(() => { const t0 = 1700000000; runStart = t0 * 1000; trail = [[43.82, -79.560, t0 - 60], [43.82, -79.559, t0 + 60], [43.82, -79.558, t0 + 120]]; doneSet = new Set(['Velmar']); doneTimes = { Velmar: new Date((t0 + 180) * 1000).toISOString() }; const snap = buildSnap(); const out = { km: snap.km, expectKm: +trailKm(t0 * 1000).toFixed(1), path0: snap.path ? snap.path[0][2] * 1000 : null, started: Date.parse(snap.startedAt) }; doneSet = new Set(); doneTimes = {}; runStart = 0; trail = []; return JSON.stringify(out); })()`));
ok('G3 archive km comes from the run start and the archived path starts no earlier | ' + JSON.stringify(g3), g3.km === g3.expectKm && g3.expectKm > 0 && g3.path0 !== null && g3.path0 >= g3.started);
// D1: the sanitizer is bounded by the street's real stretch count.
const d1 = JSON.parse(await ev(`(() => { const o = sanitizePieceTimes({ '10000': ['a', 'b'], '100000': ['x', 'y'], '1': ['c', 'd'] }, 3); const a = sanitizePieceTimes(Array.from({ length: 50 }, () => ['t', 't']), 3); return JSON.stringify({ olen: o.length, one: o[1], alen: a.length }); })()`));
ok('D1 oversized sparse indexes cannot inflate piece-times | ' + JSON.stringify(d1), d1.olen <= 3 && JSON.stringify(d1.one) === '["c","d"]' && d1.alen === 3);
// G4: GPX splits two sessions into two segments.
const g4 = JSON.parse(await ev(`(() => { const t0 = 1700000000; trail = [[43.82, -79.560, t0], [43.82, -79.559, t0 + 10], [43.82, -79.558, t0 + 20], [43.83, -79.550, t0 + 3600], [43.83, -79.549, t0 + 3610]]; const g = buildGpx(); trail = []; return JSON.stringify({ segs: g.split('<trkseg>').length - 1, pts: g.split('<trkpt').length - 1 }); })()`));
ok('G4 GPX exports separate sessions as separate segments | ' + JSON.stringify(g4), g4.segs === 2 && g4.pts === 5);
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
console.log(JSON.stringify(R, null, 1));
proc.kill('SIGKILL'); process.exit(0);
