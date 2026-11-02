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
const PROFILE = '/tmp/e2e2profile-' + Date.now(); // Beta 1.73 (audit C02): a NAMED profile, so E14 can kill the browser and relaunch on the same one - a true cold-process boot, not a reload
let proc = null, ws = null, PAGE_S = null;
let nextId = 1; const pending = new Map(); const consoleLog = []; const sessions = new Set();
function send(method, params = {}, sessionId) { const id = nextId++; return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
let netOff = false; // Phase 3 (Beta 1.72): when true, every intercepted request fails - a true dead-zone simulation for the page AND the worker's own fetches
let tileDelayMs = 0; // Beta 1.73 (audit C01): slows tile responses so a download can be caught genuinely mid-flight
const tileReqs = []; // Beta 1.73 (audit C03): every tile request that reached the network leg, with its outcome
function noteTile(url, failed) { const tm = /\/(\d+)\/(\d+)\/(\d+)\.mvt/.exec(url); if (tm) tileReqs.push({ z: +tm[1], x: +tm[2], y: +tm[3], failed: !!failed }); }
const tileX = (lng, z) => Math.floor((lng + 180) / 360 * Math.pow(2, z));
const tileY = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z)); };
const inBox = (t) => t.x >= tileX(-79.75, t.z) && t.x <= tileX(-79.35, t.z) && t.y >= tileY(44.05, t.z) && t.y <= tileY(43.70, t.z); // the preload box (Vaughan + nearby): tiles outside it were never promised
const inPreload = (t) => t.z >= 8 && t.z <= 14 && inBox(t); // the preload contract: box tiles at z8-14 (probe-verified: the map also asks for edge tiles outside the box and z7 parents below the app's own min zoom - those render blank offline by design and are not failures)
async function fulfil(sessionId, p) {
  const url = p.request.url;
  if (tileDelayMs && url.includes('cartocdn')) await sleep(tileDelayMs); // on BOTH paths: a dead-network burst must not burn the whole list at full speed either (E15)
  if (netOff) { noteTile(url, true); await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'InternetDisconnected' }, sessionId); return; }
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    noteTile(url, r.status >= 400);
    await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: r.status, responseHeaders: [{ name: 'Content-Type', value: ct }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: buf.toString('base64') }, sessionId);
  } catch (e) { noteTile(url, true); await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); }
}
async function launchBrowser() {
  proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-proxy-server',
    '--remote-debugging-port=0', '--disable-features=LocalNetworkAccessChecks', '--user-data-dir=' + PROFILE,
    '--window-size=420,900', 'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => { let buf = ''; proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); setTimeout(() => rej(new Error('no devtools url')), 25000); });
  ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
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
  const att = await send('Target.attachToTarget', { targetId, flatten: true });
  PAGE_S = att.result.sessionId;
  await send('Page.enable', {}, PAGE_S);
  await send('Runtime.enable', {}, PAGE_S);
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, PAGE_S);
  await send('Page.navigate', { url: 'http://127.0.0.1:8077/index.html' }, PAGE_S);
}
await launchBrowser();
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
const baseKeys = JSON.parse(await ev2(`(async () => { const c = await caches.open('snowroute-tiles-v1'); const ks = await c.keys(); return JSON.stringify(ks.map(r => r.url).sort()); })()`)); // the pristine post-preload key set (897 preload files + the boot view's own extras), captured before any zooming adds opportunistic keys (keysOf is defined further down, so this capture is inlined)
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
const zoomProbe = async (z) => { const before = await ev2(`typeof tilesOk !== 'undefined' ? tilesOk : -1`); await ev2(`(() => { map.jumpTo({ zoom: ${z} }); return true; })()`); await sleep(5000); const after = await ev2(`typeof tilesOk !== 'undefined' ? tilesOk : -1`); const zoomNow = await ev2(`typeof map !== 'undefined' && map ? map.getZoom() : -1`); return [before, after, zoomNow]; }; // Beta 1.73 fix: GLM is the engine's CLOSURE variable, not a page global - the 1.72 probe's jumpTo silently threw on every run and the checks passed on load-settling alone. The probe now drives the real `map` global and reports the zoom it actually reached
// Beta 1.73 (audit C03): tilesOk rising proves tile EVENTS, not that the RIGHT
// tiles are cached. coverCheck computes the exact tiles covering the current
// view at the zoom band on screen and requires every one to be in the cache.
const coverCheck = async (z) => {
  const expr = '(async () => { const zz = [' + Math.floor(z) + ', ' + Math.ceil(z) + ']; const b = map.getBounds(); const tc = await caches.open(\'snowroute-tiles-v1\'); const tpl = \'https://tiles.basemaps.cartocdn.com/v/20261026-01/vectortiles/carto.streets/v2/{z}/{x}/{y}.mvt\'; const xOf = (lng, k) => Math.floor((lng + 180) / 360 * Math.pow(2, k)); const yOf = (lat, k) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, k)); }; let need = 0, have = 0; for (const k of zz) { const xa = Math.max(xOf(b.getWest(), k), xOf(-79.75, k)), xb = Math.min(xOf(b.getEast(), k), xOf(-79.35, k)), ya = Math.max(yOf(b.getNorth(), k), yOf(44.05, k)), yb = Math.min(yOf(b.getSouth(), k), yOf(43.70, k)); for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) { need++; if (await tc.match(tpl.replace(\'{z}\', k).replace(\'{x}\', x).replace(\'{y}\', y))) have++; } } return JSON.stringify({ need, have }); })()';
  try { return JSON.parse(await ev2(expr)); } catch (e) { return { need: -1, have: -1 }; }
};
const keysOf = async () => { const s = await ev2(`(async () => { const tc = await caches.open('snowroute-tiles-v1'); const ks = await tc.keys(); return JSON.stringify(ks.map(k => k.url).sort()); })()`); try { return JSON.parse(s); } catch (e) { return []; } };
tileReqs.length = 0;
const zp9 = await zoomProbe(8.4);
ok('E9 offline at zoom 8.4, basemap tiles still arrive (from cache) | tilesOk ' + zp9[0] + ' -> ' + zp9[1] + ' zoomNow ' + zp9[2], zp9[1] > zp9[0] && Math.abs(zp9[2] - 8.4) < 0.3);
const cov9 = await coverCheck(8.4); const fail9 = tileReqs.filter(t => t.failed && inPreload(t)).length;
ok('E9b (C03) every in-box tile the z8.4 view needs is in the offline cache and no in-box tile request failed | need ' + cov9.need + ' have ' + cov9.have + ' failedPreload ' + fail9, cov9.need > 0 && cov9.have === cov9.need && fail9 === 0);
// (E10 reload-isolates like E9's fresh boot did: chained off E9 instead, the
// z9 tiles E9 loaded would still cover the view and no new arrival could ever
// be observed - the first local run failed exactly that way, 4 -> 4, with the
// map rendering fine throughout.)
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000);
tileReqs.length = 0;
const zp10 = await zoomProbe(9.4);
ok('E10 offline at zoom 9.4, basemap tiles still arrive (from cache) | tilesOk ' + zp10[0] + ' -> ' + zp10[1] + ' zoomNow ' + zp10[2], zp10[1] > zp10[0] && Math.abs(zp10[2] - 9.4) < 0.3);
const cov10 = await coverCheck(9.4); const fail10 = tileReqs.filter(t => t.failed && inPreload(t)).length;
ok('E10b (C03) every in-box tile the z9.4 view needs is in the offline cache and no in-box tile request failed | need ' + cov10.need + ' have ' + cov10.have + ' failedPreload ' + fail10, cov10.need > 0 && cov10.have === cov10.need && fail10 === 0);
// E10c (audit section 11): the day/night swap is a local style change over
// embedded styles (Beta 1.33) - prove it also works with the network dead.
tileReqs.length = 0;
const nightWas = await ev2(`document.body.classList.contains('night')`);
await ev2(`document.getElementById('nightBtn').click()`);
await sleep(3000);
const nightNow = await ev2(`document.body.classList.contains('night')`);
const themeFail = tileReqs.filter(t => t.failed && inPreload(t)).length;
ok('E10c day/night switch works fully offline | night ' + nightWas + ' -> ' + nightNow + ' failedPreloadReqs ' + themeFail, nightWas !== nightNow && themeFail === 0 && (await ev2(`typeof glOk !== 'undefined' && glOk === true`)) === true);
await ev2(`document.getElementById('nightBtn').click()`);
await sleep(1500);
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
// E14 (Beta 1.73, audit C02): a TRUE cold boot offline. E8 reloads inside a
// live browser; this kills the process entirely and relaunches on the SAME
// persisted profile with the network dead from the first instant - the
// closest a test rig gets to a phone cold-starting in a dead zone.
netOff = true;
proc.kill('SIGKILL');
await sleep(1500);
for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) { try { fs.rmSync(PROFILE + '/' + f, { force: true }); } catch (e) {} }
await launchBrowser();
ok('E14 cold-process offline boot renders the map from the persisted profile alone', (await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000)) && (await poll(`typeof tilesOk !== 'undefined' && tilesOk > 0`, 30000)) && (await poll(`!!navigator.serviceWorker.controller`, 30000)));
netOff = false;

// E12 (REBUILT Beta 1.73, audit C01): the 1.72 version of this test ran against
// the cache E4 had ALREADY filled, so its "interruption" proved nothing about
// a partial cache. Now the download starts from an EMPTY tile cache with tile
// responses throttled, a PARTIAL count is verified on disk, the page dies, and
// the resume must restore the EXACT key set the verified full download had.
const waitPartial = async () => { let n = 0; const t0 = Date.now(); while (Date.now() - t0 < 300000) { n = (await keysOf()).length; if (n >= 600) break; await sleep(700); } return n; };
await ev2(`(async () => { await caches.delete('snowroute-tiles-v1'); try { localStorage.removeItem('snowroute.prep.v1'); } catch (e) {} return true; })()`);
tileDelayMs = 150;
await ev2(`document.getElementById('xPre').click()`);
const partial = await waitPartial();
ok('E12a the download was verifiably partial when the page died | cached ' + partial + ' of ' + baseKeys.length, partial >= 300 && partial <= baseKeys.length - 150);
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000);
tileDelayMs = 0;
await ev2(`document.getElementById('xPre').click()`);
ok('E12 preload interrupted by a page death still completes afterwards', await poll(`document.getElementById('xPreStat').textContent.includes('Offline maps: saved')`, 420000));
const stat2 = await ev2(`document.getElementById('xPreStat').textContent`);
const m2 = /saved (\d+) of (\d+)/.exec(stat2 || '');
const keysAfter = await keysOf();
const superset = baseKeys.every(u => keysAfter.includes(u));
ok('E12b the resumed download restores the full post-preload key set | ' + stat2 + ' | keys ' + keysAfter.length + '/' + baseKeys.length, !!m2 && +m2[1] === 897 && +m2[2] === 897 && superset && keysAfter.length >= baseKeys.length);
// E15 (audit C01-T4): a dead-network BURST mid-download. The app's per-file
// failure handling skips what it cannot fetch and reports the short count
// honestly; a clean re-run must then restore the exact full set.
await ev2(`(async () => { await caches.delete('snowroute-tiles-v1'); try { localStorage.removeItem('snowroute.prep.v1'); } catch (e) {} return true; })()`);
tileDelayMs = 150;
await ev2(`document.getElementById('xPre').click()`);
const partial15 = await waitPartial();
netOff = true;
await sleep(6000);
netOff = false;
tileDelayMs = 0;
await poll(`document.getElementById('xPreStat').textContent.includes('Offline maps: saved')`, 420000);
const statF = await ev2(`document.getElementById('xPreStat').textContent`);
const mF = /saved (\d+) of (\d+)/.exec(statF || '');
ok('E15a a dead-network burst leaves the download short, honestly reported | partial ' + partial15 + ' then ' + statF, !!mF && +mF[1] < 897 && +mF[2] === 897);
const keysMid = await keysOf();
await ev2(`document.getElementById('xPre').click()`);
const rerunOk = await poll(`document.getElementById('xPreStat').textContent.includes('saved 897 of 897')`, 420000);
const keysFinal = await keysOf();
const noLoss = keysMid.every(u => keysFinal.includes(u));
ok('E15b the re-run restores the full preload set and loses nothing | rerun ' + rerunOk + ' keys ' + keysFinal.length + ' burst survivors ' + keysMid.length, rerunOk && noLoss && keysFinal.length >= 897); // the keys above 897 in baseKeys are boot-time extras the map fetched for its first view; the preload's own contract is the 897 files, and this section's page never reloads, so the sound claims are: full 897 restored, nothing the burst left behind lost
ok('E13 no page exceptions across the whole run', consoleLog.filter(c => String(c).startsWith('EXCEPTION')).length === 0);
const fails = R.checks.filter(c => !c[1]);
for (const c of R.checks) console.log((c[1] ? 'PASS ' : 'FAIL ') + c[0]);
console.log('e2e-offline:', R.checks.length - fails.length + '/' + R.checks.length);
proc.kill('SIGKILL'); process.exit(fails.length ? 1 : 0);
