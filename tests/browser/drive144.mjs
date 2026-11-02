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



// drive144: Beta 1.73 audit fixes (deep audit of Beta 1.72, adjudicated 2026-11-02).
// C04: a session-marker write failure at clean start was SILENT in 1.71-1.72 -
// noteSessionStart dropped saveSess()'s result and startClean's warning covered
// saveAll() only. Now the start warns, the clean still starts, and the marker
// write is retried by flushAux until it lands.
// C05: Clear Trail claimed success from the trail write alone; the marker write
// is now checked the same way, with the same retry.
import { readFileSync } from 'node:fs';
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const ev = async (code) => evaluate(code);
const src = readFileSync(new URL('../../src/tracker-source.html', import.meta.url), 'utf8');
ok('S1 shipped source wires the marker-save results into both callers + the flush retry', src.includes('const okSess = noteSessionStart()') && src.includes('const okSessClr = saveSess()') && src.includes('if (sessDirty && saveSess()) sessDirty = false;'));
const poll144 = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { const v = await ev(expr); if (v === true) return true; await sleep(300); } return false; };
ok('T0 app script is live', await poll144(`typeof startClean === 'function' && typeof noteSessionStart === 'function' && typeof flushAux === 'function'`, 90000));
await ev(`(() => { navigator.geolocation.watchPosition = () => 777; navigator.geolocation.clearWatch = () => {}; return true; })()`);
// ---- C04: break ONLY the marker key, then start a clean ----
await ev(`(() => { window.__realLsSet = lsSet; lsSet = (k, v) => k === 'snowroute.v5.sess' ? false : window.__realLsSet(k, v); return true; })()`);
await ev(`(() => { startClean(); return true; })()`);
const c04 = JSON.parse(await ev(`(() => JSON.stringify({ toast: $('toast').textContent, runStart, marker: Math.floor(runStart / 1000), dirty: sessDirty, stored: localStorage.getItem('snowroute.v5.sess') }))()`));
ok('C04a marker-save failure at clean start warns (no success claim), the clean still starts, retry armed | ' + JSON.stringify(c04), c04.runStart > 0 && c04.toast.indexOf('session marker could not be saved') >= 0 && c04.dirty === true && (c04.stored === null || c04.stored.indexOf(String(c04.marker)) < 0));
await ev(`(() => { lsSet = window.__realLsSet; flushAux(true); return true; })()`);
const c04b = JSON.parse(await ev(`(() => JSON.stringify({ dirty: sessDirty, stored: localStorage.getItem('snowroute.v5.sess') }))()`));
ok('C04b once storage recovers, the flush retry lands the marker | ' + JSON.stringify(c04b), c04b.dirty === false && (c04b.stored || '').indexOf(String(c04.marker)) >= 0);
await ev(`(() => { cancelStart(); return true; })()`);
// ---- C05: break ONLY the marker key, then clear a trail that has markers ----
await ev(`(() => { trail = [[43.82, -79.56, 1767650000], [43.821, -79.559, 1767650060]]; trailSessions = [1767650000]; saveTrail(); saveSess(); return true; })()`);
await ev(`(() => { if (!map) map = { getSource: () => null }; lsSet = (k, v) => k === 'snowroute.v5.sess' ? false : window.__realLsSet(k, v); return true; })()`);
await ev(`(() => { const b = document.getElementById('xClr'); b.click(); b.click(); return true; })()`);
await sleep(300);
const c05 = JSON.parse(await ev(`(() => JSON.stringify({ toast: $('toast').textContent, dirty: sessDirty, storedTrail: localStorage.getItem('snowroute.v4.trail'), storedSess: localStorage.getItem('snowroute.v5.sess') }))()`));
ok('C05a Clear Trail with the marker write broken does NOT claim a plain success | ' + JSON.stringify(c05), c05.toast.indexOf('session markers could not be saved') >= 0 && c05.storedTrail === '[]' && c05.storedSess === '[1767650000]' && c05.dirty === true);
await ev(`(() => { lsSet = window.__realLsSet; flushAux(true); return true; })()`);
const c05b = JSON.parse(await ev(`(() => JSON.stringify({ dirty: sessDirty, storedSess: localStorage.getItem('snowroute.v5.sess') }))()`));
ok('C05b the retry clears the stored markers once storage recovers | ' + JSON.stringify(c05b), c05b.dirty === false && c05b.storedSess === '[]');
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
console.log(JSON.stringify(R, null, 1));
proc.kill('SIGKILL'); process.exit(0);
