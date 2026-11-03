// Shared browser-drive harness (Phase 1 of the 2026-11-02 architecture
// program, candidate 7): the CDP/Fetch-interception preamble that every
// file:// drive used to embed as a ~100-line copy. Extracted VERBATIM from
// drive143's preamble - same spawn flags, same devtools handshake, same
// fulfil behaviour (sw.js 404'd for hermetic runs, remote map requests
// fulfilled through Node fetch), same evaluate/shot/poll semantics - so a
// migrated drive behaves identically to its copied-preamble original.
// Contract with run.mjs is unchanged: the drive prints one JSON block
// { checks, exceptions } last and exits 0; finish() performs that tail.
// Options: failWhen(url) fails matching requests instead of fulfilling
// them (drive115's basemap-outage simulation); logDomain enables the CDP
// Log domain into consoleLog as { type: 'LOG' } entries (drive116's CSP
// violation capture). Both are opt-in; defaults reproduce the plain
// preamble exactly.
// The http-origin drives (117/119/121) run a different preamble family
// (local origin + SRI mirror) and are NOT on this harness yet.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');
const DIR = new URL('../../src/', import.meta.url).pathname;
export const PATTERNS_DEFAULT = [
  { urlPattern: '*jsdelivr*', requestStage: 'Request' },
  { urlPattern: '*openfreemap*', requestStage: 'Request' },
  { urlPattern: '*arcgisonline*', requestStage: 'Request' },
  { urlPattern: '*unpkg*', requestStage: 'Request' },
  { urlPattern: '*cartocdn*', requestStage: 'Request' },
  { urlPattern: '*sw.js', requestStage: 'Request' }
];
export const PATTERNS_GITHUB_IO = [
  { urlPattern: '*jsdelivr*', requestStage: 'Request' },
  { urlPattern: '*openfreemap*', requestStage: 'Request' },
  { urlPattern: '*arcgisonline*', requestStage: 'Request' },
  { urlPattern: '*unpkg*', requestStage: 'Request' },
  { urlPattern: '*cartocdn*', requestStage: 'Request' },
  { urlPattern: '*github.io*', requestStage: 'Request' },
  { urlPattern: '*sw.js', requestStage: 'Request' }
];
export const PATTERNS_PROTOMAPS = [
  { urlPattern: '*jsdelivr*', requestStage: 'Request' },
  { urlPattern: '*openfreemap*', requestStage: 'Request' },
  { urlPattern: '*protomaps*', requestStage: 'Request' },
  { urlPattern: '*unpkg*', requestStage: 'Request' },
  { urlPattern: '*cartocdn*', requestStage: 'Request' },
  { urlPattern: '*sw.js', requestStage: 'Request' }
];

export async function launchDrive({ patterns = PATTERNS_DEFAULT, page = process.argv[2] || 'tracker-source.html', failWhen = null, logDomain = false } = {}) {
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
    } else if (msg.method === 'Log.entryAdded') {
      consoleLog.push({ type: 'LOG', text: (msg.params.entry && msg.params.entry.text) || '' });
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
      if (failWhen && failWhen(url)) { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, S); return; }
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
  await send('Fetch.enable', { patterns }, S);
  await send('Page.enable', {}, S);
  await send('Runtime.enable', {}, S);
  if (logDomain) await send('Log.enable', {}, S);
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
  await send('Page.navigate', { url: 'file://' + DIR + '/' + page }, S);

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
  const ev = async (code) => evaluate(code);
  const poll = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { const v = await ev(expr); if (v === true) return true; await sleep(300); } return false; };
  return { proc, send, S, evaluate, ev, shot, poll, consoleLog, sleep, url: 'file://' + DIR + '/' + page };
}
export function finish(R, proc) { console.log(JSON.stringify(R, null, 1)); proc.kill('SIGKILL'); process.exit(0); }

// Beta 1.76: every cold boot now ends at the route menu - drives that need a
// loaded route click through it (Choose -> first route row) and wait for the
// splash to be removed, exactly the state pre-1.76 boots ended in.
export async function bootThrough(ev, poll, opts = {}) {
  await poll(`typeof loadRoute === 'function'`, 20000);
  await poll(`!!window.__bootAt`, 30000); // Beta 1.76: wait until bootMap has actually run - a route pick before the map exists is unreachable for a real user (the menu only appears at the readiness gate, after the boot tail) and loadRoute's paint calls need the map
  await ev(`document.getElementById('rmChoose') && document.getElementById('rmChoose').click()`);
  await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
  await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
  await poll(`!document.getElementById('splash')`, 20000);
  await poll(`typeof map === 'undefined' || !map || !map.isMoving()`, 25000); // Beta 1.77: the pick's intro flight settles on the fitted view - geometry checks must wait for the landing
  // Beta 1.77: the theme is automatic by the sun now, so an unpinned boot is
  // day or night depending on the hour the battery happens to run. Pin a day
  // override so theme-blind checks are deterministic; drives that test the
  // theme itself set their own state after this. A drive whose fixture seeds
  // its own theme state passes { pinTheme: false } and keeps it.
  if (opts.pinTheme !== false) await ev(`(function(){ if (typeof setThemeOverride === 'function') { setThemeOverride(false); if (typeof applyNight === 'function') applyNight(); if (typeof map !== 'undefined' && map && typeof setBasemap === 'function') setBasemap(); } return true; })()`);
}
