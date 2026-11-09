// drive175: Beta 1.150 (security-audit fix round, findings
// update-check-reports-cached-copy-as-server-copy and
// update-check-treats-any-difference-as-newer) - the Settings update check
// fetched the shell through the service worker, whose netFirst handler
// substitutes the CACHED shell on any network error status, rejection or
// stall: with the server answering 503 the probe "succeeded" against the
// cache and reported "Up to date" although the server never answered; and
// ANY served label different from the running one - older included - was
// announced as "New version found" and installed via location.replace.
// The fix gives the probe a worker bypass (the fetch handler answers an
// 'updprobe' request with the network itself or a network error, never the
// cache), treats a non-OK answer as "could not check" (no verdict, no
// reload), and orders versions: only a strictly newer label takes the
// update path; an older one is reported as an older server build and a
// different-but-unparseable one as a different version, neither navigates.
// Fixture (drive117's pattern): three roots derived from the live label -
// v1 as shipped, vOld one minor older, vNew one minor newer - plus a mode
// where the shell answers 503 while sw.js keeps serving.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { startCreateRig, sleep } from './harness-create.mjs';

const DIR = new URL('../../src/', import.meta.url).pathname;
const PORT = 8941;
const MIRROR = 8443;
const FIX = path.join(new URL('.', import.meta.url).pathname, '.upd-fixture');
fs.rmSync(FIX, { recursive: true, force: true });
for (const d of ['v1', 'vOld', 'vNew', 'lib']) fs.mkdirSync(path.join(FIX, d), { recursive: true });
const srcIdx = fs.readFileSync(path.join(DIR, 'tracker-source.html'), 'utf8');
const srcSw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const v1Label = (srcIdx.match(/id="ver">(Beta (\d+)\.(\d+))/) || [])[1];
const V1CACHE = (srcSw.match(/const CACHE = '([^']+)'/) || [])[1];
if (!v1Label || !V1CACHE) throw new Error('drive175 fixture: could not parse version/cache names from src');
const maj = Number((srcIdx.match(/id="ver">Beta (\d+)\./) || [])[1]);
const min = Number((srcIdx.match(/id="ver">Beta \d+\.(\d+)/) || [])[1]);
const vOldLabel = 'Beta ' + maj + '.' + (min - 1);
const vNewLabel = 'Beta ' + maj + '.' + (min + 1);
if (!srcIdx.includes('id="ver">' + v1Label) || srcSw.split(V1CACHE).length !== 2) throw new Error('drive175 fixture: mutation anchors not unique');
const writeRoot = (root, label, cache) => {
  fs.writeFileSync(path.join(FIX, root, 'index.html'), srcIdx.replace('id="ver">' + v1Label, 'id="ver">' + label));
  fs.writeFileSync(path.join(FIX, root, 'sw.js'), srcSw.replace("'" + V1CACHE + "'", "'" + cache + "'"));
};
writeRoot('v1', v1Label, V1CACHE);
writeRoot('vOld', vOldLabel, V1CACHE + 'o');
writeRoot('vNew', vNewLabel, V1CACHE + 'n');
const CORE = [...srcSw.matchAll(/\['(https:[^']+)',\s*'(sha384-[^']+)'\]/g)].map(m => ({ url: m[1], integrity: m[2], file: m[1].split('/').pop() }));
if (CORE.length !== 2) throw new Error('drive175 fixture: expected 2 CORE entries in sw.js, found ' + CORE.length);
for (const c of CORE) {
  const r = await fetch(c.url);
  if (!r.ok) throw new Error('drive175 fixture: download failed for ' + c.url);
  const buf = Buffer.from(await r.arrayBuffer());
  const h = 'sha384-' + createHash('sha384').update(buf).digest('base64');
  if (h !== c.integrity) throw new Error('drive175 fixture: SRI mismatch for ' + c.file);
  fs.writeFileSync(path.join(FIX, 'lib', c.file), buf);
}
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', path.join(FIX, 'key.pem'), '-out', path.join(FIX, 'cert.pem'), '-days', '3650', '-nodes', '-subj', '/CN=unpkg.com', '-addext', 'subjectAltName=DNS:unpkg.com,DNS:cdn.jsdelivr.net'], { stdio: 'ignore' });
fs.writeFileSync(path.join(FIX, 'bootstrap.html'), '<!doctype html><meta charset="utf-8"><title>boot</title><script>location.replace(\'http://127.0.0.1:' + PORT + '/\');</' + 'script>');
let current = 'v1';
let shellErr = false;
const appServer = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, 'http://127.0.0.1:' + PORT);
    const root = path.join(FIX, current);
    if (u.pathname === '/' || u.pathname === '/index.html') {
      if (shellErr) { res.writeHead(503, { 'Content-Type': 'text/plain' }); res.end('down'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(path.join(root, 'index.html')));
    } else if (u.pathname === '/sw.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(path.join(root, 'sw.js')));
    } else if (u.pathname === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end('{}');
    } else { res.writeHead(404); res.end('nf'); }
  } catch (e) { try { res.writeHead(500); res.end('err'); } catch (e2) {} }
});
const LIBMAP = Object.fromEntries(CORE.map(c => [new URL(c.url).pathname, c.file]));
const mirrorServer = https.createServer({ key: fs.readFileSync(path.join(FIX, 'key.pem')), cert: fs.readFileSync(path.join(FIX, 'cert.pem')) }, (req, res) => {
  try {
    const u = new URL(req.url, 'https://unpkg.com');
    const f = LIBMAP[u.pathname];
    if (!f) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': f.endsWith('.css') ? 'text/css' : 'text/javascript', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(FIX, 'lib', f)));
  } catch (e) { try { res.writeHead(500); res.end(); } catch (e2) {} }
});
await new Promise(r => appServer.listen(PORT, '127.0.0.1', r));
await new Promise(r => mirrorServer.listen(MIRROR, '127.0.0.1', r));

const rig = await startCreateRig({ profile: '/tmp/updprofile-' + Date.now(), autoAttach: false, evaluateMode: 'returnError', disableFeatures: 'LocalNetworkAccessChecks,LocalNetworkAccessMainFrameNavigations,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults', extraFlags: ['--ignore-certificate-errors', '--host-resolver-rules=MAP unpkg.com 127.0.0.1:' + MIRROR + ', MAP cdn.jsdelivr.net 127.0.0.1:' + MIRROR], devtoolsErrorWithBuf: true, onPaused: (p, H) => handlePaused(p, H) });
const { proc, send, S, evaluate, consoleLog } = rig;

async function handlePaused(p, H) { // drive117's handler, verbatim: remote requests are fulfilled through Node fetch
  const send = H.send;
  const S = H.sessionId;
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
await send('Page.navigate', { url: 'file://' + path.join(FIX, 'bootstrap.html') }, S);

const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const ev = async (code) => evaluate(code);
const okS = (n, v) => ok(n, v === true);
const waitBoot = async () => { for (let i = 0; i < 25; i++) { try { if (await ev(`!!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { const v = await fn(); if (v && !(typeof v === 'object' && 'error' in v)) return v; await sleep(400); } return false; };
const readState = async () => { const raw = await ev(`(() => { try { return JSON.stringify({ state: typeof updState !== 'undefined' ? updState : '?', toast: (document.getElementById('toast') || {}).textContent || '', label: (document.getElementById('ver') || {}).textContent || '' }); } catch (e) { return JSON.stringify({ err: String(e && e.message || e) }); } })()`);
  try { return typeof raw === 'string' ? JSON.parse(raw) : { err: 'nonstring' }; } catch (e) { return { err: 'parse' }; } };
const clickCheck = async () => { await ev(`(function(){ const b = document.getElementById('updBtn'); if (b) b.click(); return !!b; })()`); };
const VERDICT = /up to date|new version found|could not|older|different version|update check failed/i;
const settleCheck = async (ms) => { const t0 = Date.now(); let st = {};
  while (Date.now() - t0 < (ms || 20000)) { st = await readState();
    if (st.label && st.label.trim() !== v1Label) break; // a navigation is itself the settled outcome
    if (VERDICT.test(st.toast || '')) break;
    await sleep(250); }
  await sleep(1800); // let a pending update navigation (900 ms timer) fire and land before the final read
  const fin = await readState();
  return fin.label ? fin : st; };

try {
  await waitBoot(); await sleep(1500);
  okS('P0 v1 worker registered, activated and controlling', await until(async () => await ev(`(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active && r.active.state === 'activated' && navigator.serviceWorker.controller); })()`), 25000));

  // P1 (finding 5): the shell answers 503 - the check must say it could not
  // check, never "Up to date", and must not reload
  shellErr = true;
  await clickCheck();
  const p1 = await settleCheck(15000);
  shellErr = false;
  ok('P1 a 503 shell is reported as could-not-check, never up-to-date | ' + JSON.stringify(p1),
    p1.state === 'fail' && /could not check/i.test(p1.toast || ''));
  ok('P1 the failed check neither navigates nor reloads (label unchanged)', (p1.label || '').trim() === v1Label);

  // P2 (finding 6): the server serves an OLDER build - reported as older,
  // never installed as an update
  current = 'vOld';
  await clickCheck();
  const p2 = await settleCheck(15000);
  const p2label = (p2.label || '').trim();
  ok('P2 an older server build is reported as older, not as a new version | ' + JSON.stringify(p2),
    p2.state === 'older' && /older/i.test(p2.toast || ''));
  ok('P2 the older build is NOT installed (page still runs ' + v1Label + ')', p2label === v1Label);
  current = 'v1';
  if (p2label !== v1Label) { await ev(`location.reload(); true`); await sleep(2500); await waitBoot(); await sleep(1500); }

  // P3 (control): a genuinely newer build still takes the update path
  current = 'vNew';
  await clickCheck();
  const p3 = await until(async () => await ev(`(document.getElementById('ver') || { textContent: '' }).textContent.trim() === '${vNewLabel}'`), 30000);
  okS('P3 control: a newer server build is still found and landed on', p3);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
console.log(JSON.stringify(R, null, 1));
try { appServer.close(); mirrorServer.close(); } catch (e) {}
try { fs.rmSync(FIX, { recursive: true, force: true }); } catch (e) {}
process.exit(0);
