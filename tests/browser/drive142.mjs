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
// drive142: Beta 1.69 audit fixes (two external audits of 1.66, adjudicated 2026-11-02).
// T1: exactly ONE startRenderLoop declaration exists in the shipped source (the
// duplicate silently disabled the starvation pump in 1.65-1.68), and the trail /
// honesty call sites the audits required are present in their function bodies.
// T2: with animation frames BLOCKED, the 100 ms pump alone advances the glide.
// T3: a queued callback from a stopped watcher is ignored (generation tag, N04).
// T4: Cancel Start reports a storage failure honestly instead of claiming success (N03).
import { readFileSync } from 'node:fs';
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const ev = async (code) => evaluate(code);
const src = readFileSync(new URL('../../src/tracker-source.html', import.meta.url), 'utf8');
const bodyOf = (name, next) => { const i = src.indexOf('function ' + name); const j = src.indexOf('function ' + next, i + 10); return i >= 0 && j > i ? src.slice(i, j) : ''; };
ok('T1a exactly one startRenderLoop declaration in the shipped source | count ' + (src.split('function startRenderLoop').length - 1), (src.split('function startRenderLoop').length - 1) === 1);
ok('T1b finishRun / doUndo / cancelStart each force a trail redraw | finish ' + bodyOf('finishRun', 'performReset').includes('drawTrail(true)') + ' undo ' + bodyOf('doUndo', 'checkStale').includes('drawTrail(true)') + ' cancel ' + bodyOf('cancelStart', 'clearAllMarks').includes('drawTrail(true)'), bodyOf('finishRun', 'performReset').includes('drawTrail(true)') && bodyOf('doUndo', 'checkStale').includes('drawTrail(true)') && bodyOf('cancelStart', 'clearAllMarks').includes('drawTrail(true)'));
const poll120 = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { const v = await ev(expr); if (v === true) return true; await sleep(300); } return false; };
ok('T0 app script and map object are live (the 1.69 mechanics need the script + map, not tile completion - glOk boot coverage lives in drives 124/126)', await poll120(`typeof map !== 'undefined' && !!map && typeof startGps === 'function' && typeof cancelStart === 'function'`, 90000));
const base = JSON.parse(await ev(`(() => { const L = STRETCH.Velmar.line; return JSON.stringify(L[Math.floor(L.length / 2)]); })()`));
const feed142 = async (lat, lng) => ev('window.__wpOk({ coords: { latitude: ' + lat + ', longitude: ' + lng + ', accuracy: 10, speed: 3, heading: 90 }, timestamp: Date.now() })');
// T3: watcher generation - a live callback works; after stopGps the SAME callback is dead.
await ev(`(() => { window.__wpOk = null; navigator.geolocation.watchPosition = (ok) => { window.__wpOk = ok; return 4242; }; navigator.geolocation.clearWatch = () => {}; startGps(false); return true; })()`);
await feed142(base[0], base[1]); await sleep(300);
const liveTs = await ev(`lastFixTs`);
await ev(`(() => { stopGps(); return true; })()`);
await sleep(120);
await feed142(base[0], base[1] + 0.002); await sleep(300);
const afterTs = await ev(`lastFixTs`);
ok('T3 a queued callback from the stopped watcher is ignored even with a fresh timestamp | live ' + liveTs + ' after-stop ' + afterTs, liveTs > 0 && afterTs === liveTs);
// T2: starvation - block animation frames entirely; the pump must advance the glide alone.
await ev(`(() => { startGps(false); return true; })()`);
await feed142(base[0], base[1]); await sleep(800);
await ev(`(() => { window.__realRaf = window.requestAnimationFrame; window.requestAnimationFrame = () => 990001; return true; })()`);
await sleep(250);
await feed142(base[0], base[1] + 0.0037);
const d0 = await ev(`distM(dispPos, [` + base[0] + `, ` + (base[1] + 0.0037) + `])`);
await sleep(1100);
const st = JSON.parse(await ev(`(() => JSON.stringify({ d: distM(dispPos, [` + base[0] + `, ` + (base[1] + 0.0037) + `]), pump: renderPump !== 0 }))()`));
ok('T2 with animation frames blocked, the starvation pump advances the glide on its own | from ' + Math.round(d0) + 'm to ' + Math.round(st.d) + 'm, pump armed ' + st.pump, st.pump === true && d0 > 150 && st.d < d0 * 0.45);
await ev(`(() => { window.requestAnimationFrame = window.__realRaf; stopGps(); return true; })()`);
await sleep(200);
// T4: Cancel Start honesty - break storage, cancel, read the message.
await ev(`(() => { runStart = Date.now(); saveAll(); window.__realLsSet = lsSet; lsSet = () => false; return true; })()`);
await ev(`(() => { cancelStart(); return true; })()`);
const t4 = JSON.parse(await ev(`(() => JSON.stringify({ toast: $('toast').textContent, mem: runStart }))()`));
await ev(`(() => { lsSet = window.__realLsSet; return true; })()`);
ok('T4 Cancel Start with storage broken warns instead of claiming success | ' + JSON.stringify(t4), t4.mem === 0 && t4.toast.indexOf('could not be saved') >= 0);
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
console.log(JSON.stringify(R, null, 1));
proc.kill('SIGKILL'); process.exit(0);
