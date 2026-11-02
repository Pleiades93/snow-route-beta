// E2E v2 (Beta 1.53 diagnosis): real service worker + real Cache Storage over
// http://127.0.0.1:8077. The browser has no direct internet locally, so ALL
// network legs are fulfilled through Node fetch (working egress) - including
// the service worker's OWN fetches, via Target auto-attach: each target
// (page, service worker) gets Fetch interception on its own session, and a
// request pauses in exactly the session whose context issued it.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-proxy-server',
  '--remote-debugging-port=0', '--disable-features=LocalNetworkAccessChecks', '--user-data-dir=/tmp/e2e2profile-' + Date.now(),
  '--window-size=420,900', 'about:blank'
], { stdio: ['ignore', 'pipe', 'pipe'] });
const wsUrl = await new Promise((res, rej) => { let buf = ''; proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); setTimeout(() => rej(new Error('no devtools url')), 25000); });
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let nextId = 1; const pending = new Map(); const consoleLog = []; const sessions = new Set();
function send(method, params = {}, sessionId) { const id = nextId++; return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
let netOff = false; // Phase 3 (Beta 1.72): when true, every intercepted request fails - a true dead-zone simulation for the page AND the worker's own fetches
async function fulfil(sessionId, p) {
  const url = p.request.url;
  if (netOff) { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'InternetDisconnected' }, sessionId); return; }
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: r.status, responseHeaders: [{ name: 'Content-Type', value: ct }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: buf.toString('base64') }, sessionId);
  } catch (e) { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); }
}
ws.addEventListener('message', async ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Target.attachedToTarget') {
    const sid = msg.params.sessionId, type = msg.params.targetInfo.type;
    if (!sessions.has(sid)) {
      sessions.add(sid);
      const pats = type === 'service_worker'
        ? [{ urlPattern: '*cartocdn*', requestStage: 'Request' }, { urlPattern: '*github.io*', requestStage: 'Request' }, { urlPattern: '*jsdelivr*', requestStage: 'Request' }, { urlPattern: '*127.0.0.1:8077*', requestStage: 'Request' }]
        : [{ urlPattern: '*jsdelivr*', requestStage: 'Request' }, { urlPattern: '*cartocdn*', requestStage: 'Request' }, { urlPattern: '*github.io*', requestStage: 'Request' }];
      await send('Fetch.enable', { patterns: pats }, sid);
      console.log('attached:', type, 'fetch interception on');
    }
    return;
  }
  if (msg.method === 'Fetch.requestPaused') { fulfil(msg.sessionId, msg.params); return; }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.sessionId === PAGE_S) { consoleLog.push((msg.params.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ')); }
  if (msg.method === 'Runtime.exceptionThrown' && msg.sessionId === PAGE_S) { const d = msg.params.exceptionDetails; consoleLog.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text)); }
});
await send('Target.setAutoAttach', { autoAttach: true, flatten: true, waitForDebuggerOnStart: false });
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId: PAGE_S } } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, PAGE_S);
await send('Runtime.enable', {}, PAGE_S);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, PAGE_S);
await send('Page.navigate', { url: 'http://127.0.0.1:8077/index.html' }, PAGE_S);
async function evaluate(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, PAGE_S); if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) }; return r.result && r.result.result ? r.result.result.value : undefined; }
const ev2 = async (code) => evaluate(code);
const poll = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { const v = await ev2(expr); if (v === true) return true; await sleep(500); } return false; };
await sleep(2000);
// Beta 1.53 (audit gap B08, closed): the battery's drives load the app from
// file:// where NO service worker can ever register, so the entire offline
// pipeline (worker, caches, preload counting) shipped untested end-to-end -
// which is how a CSP that blocked the worker reached Andrew's phone and his
// preload saved 0 of 894. This check serves the REAL built app over http,
// lets the REAL worker run, and proves the download actually stores files.
// Requires a server on 127.0.0.1:8077 serving the repo root (CI starts one).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
console.log('boot glOk:', await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000));
ok('E1 app boots with the map active (http, real worker present)', await poll(`typeof glOk !== 'undefined' && glOk === true`, 5000));
ok('E2 service worker controls the page', await poll(`!!navigator.serviceWorker.controller`, 30000));
const swState = await ev2(`(async () => { const reg = await navigator.serviceWorker.getRegistration(); return JSON.stringify({ reg: !!reg, active: !!(reg && reg.active), swErr: window.__swErr || null }); })()`);
ok('E3 registration active, no registration error | ' + swState, (() => { try { const d = JSON.parse(swState); return d.reg && d.active && !d.swErr; } catch (e) { return false; } })());
await ev2(`document.getElementById('xPre').click()`);
ok('E4 preload completes with a saved count', await poll(`document.getElementById('xPreStat').textContent.includes('Offline maps: saved')`, 420000));
const stat = await ev2(`document.getElementById('xPreStat').textContent`);
const m = /saved (\d+) of (\d+)/.exec(stat || '');
ok('E5 saved >= 883 of 897 (the 2026-11-01 regression saved 0) | ' + stat, !!m && +m[1] >= 883 && +m[2] === 897);
const counts = await ev2(`(async () => { const out = {}; for (const k of await caches.keys()) { const c = await caches.open(k); out[k] = (await c.keys()).length; } return JSON.stringify(out); })()`);
ok('E6 the tiles cache really holds the files | ' + counts, (() => { try { return JSON.parse(counts)['snowroute-tiles-v1'] >= 883; } catch (e) { return false; } })());
// ---- Phase 3 (Beta 1.72): E1-E6 prove the files land in the cache. These
// prove the app actually LIVES on them: renders with the network dead, at
// every zoom it allows, across a worker upgrade and a mid-download death.
// E8: cold boot offline - shell, scripts, styles and tiles all from cache.
netOff = true;
await send('Page.reload', { ignoreCache: false }, PAGE_S);
ok('E8 offline cold boot renders the map from cache alone', (await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000)) && (await poll(`typeof tilesOk !== 'undefined' && tilesOk > 0`, 30000)));
// E9/E10: the wide zooms offline (the R04 gap: minZoom is 8, the preload
// stopped at z10 until 1.72). New tile data must still arrive - from cache.
const zoomProbe = async (z) => { const before = await ev2(`typeof tilesOk !== 'undefined' ? tilesOk : -1`); await ev2(`(() => { GLM.jumpTo({ zoom: ${z} }); return true; })()`); await sleep(5000); const after = await ev2(`typeof tilesOk !== 'undefined' ? tilesOk : -1`); return [before, after]; };
const zp9 = await zoomProbe(8.4);
ok('E9 offline at zoom 8.4, basemap tiles still arrive (from cache) | tilesOk ' + zp9[0] + ' -> ' + zp9[1], zp9[1] > zp9[0]);
// (E10 reload-isolates like E9's fresh boot did: chained off E9 instead, the
// z9 tiles E9 loaded would still cover the view and no new arrival could ever
// be observed - the first local run failed exactly that way, 4 -> 4, with the
// map rendering fine throughout.)
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000);
const zp10 = await zoomProbe(9.4);
ok('E10 offline at zoom 9.4, basemap tiles still arrive (from cache) | tilesOk ' + zp10[0] + ' -> ' + zp10[1], zp10[1] > zp10[0]);
// E11: a worker upgrade takes over without taking the saved maps with it.
netOff = false;
const swFile = new URL('../../sw.js', import.meta.url);
const swOrig = fs.readFileSync(swFile, 'utf8');
let upgraded = false;
try {
  fs.writeFileSync(swFile, swOrig + '\n// e2e phase-3 upgrade probe (byte change only)\n');
  await ev2(`(() => { window.__ctl = false; navigator.serviceWorker.addEventListener('controllerchange', () => { window.__ctl = true; }); return true; })()`);
  await ev2(`(async () => { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update(); return true; })()`);
  upgraded = await poll(`window.__ctl === true`, 45000);
} finally { fs.writeFileSync(swFile, swOrig); }
const counts2 = await ev2(`(async () => { const out = {}; for (const k of await caches.keys()) { const c = await caches.open(k); out[k] = (await c.keys()).length; } return JSON.stringify(out); })()`);
ok('E11 worker upgrade takes over and the tile cache survives | upgraded ' + upgraded + ' ' + counts2, upgraded && (() => { try { return JSON.parse(counts2)['snowroute-tiles-v1'] >= 883; } catch (e) { return false; } })());
// E12: the page dies mid-download; the next run still lands the full count.
await ev2(`document.getElementById('xPre').click()`);
await sleep(2000);
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000);
await ev2(`document.getElementById('xPre').click()`);
ok('E12 preload interrupted by a page death still completes afterwards', await poll(`document.getElementById('xPreStat').textContent.includes('Offline maps: saved')`, 420000));
const stat2 = await ev2(`document.getElementById('xPreStat').textContent`);
const m2 = /saved (\d+) of (\d+)/.exec(stat2 || '');
const diag12 = await ev2(`(async () => { const out = { caches: {}, pre: null, sampleMatch: null, sampleKey: null }; for (const k of await caches.keys()) { const c = await caches.open(k); out.caches[k] = (await c.keys()).length; } try { out.pre = localStorage.getItem('snowroute.prep.v1'); } catch (e) {} const tc = await caches.open('snowroute-tiles-v1'); const keys = await tc.keys(); out.sampleKey = keys.length ? keys[0].url : null; if (keys.length) out.sampleMatch = !!(await caches.match(keys[0].url)); return JSON.stringify(out); })()`);
ok('E12b the final count is the full set | ' + stat2 + ' | diag ' + diag12, !!m2 && +m2[1] >= 883 && +m2[2] === 897);
ok('E13 no page exceptions across the whole run', consoleLog.filter(c => String(c).startsWith('EXCEPTION')).length === 0);
const fails = R.checks.filter(c => !c[1]);
for (const c of R.checks) console.log((c[1] ? 'PASS ' : 'FAIL ') + c[0]);
console.log('e2e-offline:', R.checks.length - fails.length + '/' + R.checks.length);
proc.kill('SIGKILL'); process.exit(fails.length ? 1 : 0);
