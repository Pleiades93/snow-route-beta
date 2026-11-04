// Shared preamble for the http-origin drives (119/121): local-origin fixture
// servers (app + SRI-verified CDN mirror), browser launch/close on a shared
// profile, and the until/waitBoot helpers. Extracted VERBATIM from the
// identical first 123 lines of drive119/drive121 (2026-11-02, architecture
// candidate 7 completion); the fixture's own error strings still say
// 'drive119 fixture' - both drives always carried that text. Top-level
// side effects (fixture build, downloads, cert, server listen) run on
// import, exactly as they ran at the top of each drive. drive117 does NOT
// use this harness: its server switches content roots mid-drive (the SW
// upgrade test) - a different shape, kept as a documented exception.
// drive119 (audit remediation, 2026-10-29 spec items 13/14): TRUE disconnected operation.
// Session 1 (online): the app boots on a real local origin, its service worker installs and takes
// control, the map style lands in the shell cache, and one side of a street is marked.
// The browser is then KILLED and relaunched on the SAME profile with the network emulated OFFLINE:
// the app must boot from its own caches, show the seeded progress, accept a marking offline and
// persist it - and a second offline restart must still show that offline-made mark.
// Plumbing mirrors drive117 (local origin + SRI-verified CDN mirror); the map style/tiles come from
// the real network in session 1, exactly like a first boot on a phone.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { createHash } from 'node:crypto';

const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');
const DIR = new URL('../../src/', import.meta.url).pathname;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FIX = path.join(new URL('.', import.meta.url).pathname, '.sw-fixture');
const PROFILE = '/tmp/v6profile-offline119';
fs.rmSync(FIX, { recursive: true, force: true });
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(path.join(FIX, 'v1'), { recursive: true });
fs.mkdirSync(path.join(FIX, 'lib'), { recursive: true });
const srcIdx = fs.readFileSync(path.join(DIR, 'tracker-source.html'), 'utf8');
const srcSw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const V1CACHE = (srcSw.match(/const CACHE = '([^']+)'/) || [])[1];
const TILECACHE = (srcSw.match(/TILES = '([^']+)'/) || [])[1];
if (!V1CACHE || !TILECACHE) throw new Error('drive119 fixture: could not parse cache names from src/sw.js');
fs.writeFileSync(path.join(FIX, 'v1', 'index.html'), srcIdx);
fs.writeFileSync(path.join(FIX, 'v1', 'sw.js'), srcSw);
const CORE = [...srcSw.matchAll(/\['(https:[^']+)',\s*'(sha384-[^']+)'\]/g)].map(m => ({ url: m[1], integrity: m[2], file: m[1].split('/').pop() }));
if (CORE.length !== 2) throw new Error('drive119 fixture: expected 2 CORE entries in sw.js, found ' + CORE.length);
for (const c of CORE) {
  const r = await fetch(c.url);
  if (!r.ok) throw new Error('drive119 fixture: download failed for ' + c.url);
  const buf = Buffer.from(await r.arrayBuffer());
  const h = 'sha384-' + createHash('sha384').update(buf).digest('base64');
  if (h !== c.integrity) throw new Error('drive119 fixture: SRI mismatch for ' + c.file);
  fs.writeFileSync(path.join(FIX, 'lib', c.file), buf);
}
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', path.join(FIX, 'key.pem'), '-out', path.join(FIX, 'cert.pem'), '-days', '3650', '-nodes', '-subj', '/CN=unpkg.com', '-addext', 'subjectAltName=DNS:unpkg.com,DNS:cdn.jsdelivr.net'], { stdio: 'ignore' });
fs.writeFileSync(path.join(FIX, 'bootstrap.html'), '<!doctype html><meta charset="utf-8"><title>boot</title><script>location.replace(\'http://127.0.0.1:8931/\');</' + 'script>');
const appServer = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, 'http://127.0.0.1:8931');
    if (u.pathname === '/' || u.pathname === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(path.join(FIX, 'v1', 'index.html'))); }
    else if (u.pathname === '/sw.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(path.join(FIX, 'v1', 'sw.js'))); }
    else if (u.pathname === '/manifest.json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end('{}'); }
    else { res.writeHead(404); res.end('nf'); }
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
await new Promise(r => appServer.listen(8931, '127.0.0.1', r));
await new Promise(r => mirrorServer.listen(8443, '127.0.0.1', r));

const allExceptions = [];
async function launch(offline) {
    // Beta 1.96 (deep audit SR-195-09): browser STARTUP gets a bounded retry - nothing else does.
  // The scheduled run 41859112876 lost shard 1 twice to a cold runner whose FIRST Chrome launch
  // never printed its DevTools line ('no devtools url'), while every later launch on the same
  // runner worked. A launch failure happens before any page exists, so retrying it can never
  // mask a test result: after 3 failed attempts the drive still crashes and FAILs (never a
  // pass), each attempt's stderr is logged to the drive's stderr for diagnosis, a browser that
  // EXITS is rejected at once instead of burning the 25 s timeout, and every attempt gets a
  // fresh profile dir where the harness uses one per launch.
  let proc = null, wsUrl = null, lastLaunchErr = null;
  for (let attempt = 1; attempt <= 3 && !wsUrl; attempt++) {
    proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-proxy-server',
    '--remote-debugging-port=0', '--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessMainFrameNavigations,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults', '--user-data-dir=' + PROFILE,
    '--ignore-certificate-errors', '--host-resolver-rules=MAP unpkg.com 127.0.0.1:8443, MAP cdn.jsdelivr.net 127.0.0.1:8443',
    '--window-size=420,900', 'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      wsUrl = await new Promise((res, rej) => {
        let buf = ''; let settled = false;
        const to = setTimeout(() => { if (!settled) { settled = true; rej(new Error('no devtools url: ' + buf.slice(0, 500))); } }, 25000);
        proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\S+)/); if (m && !settled) { settled = true; clearTimeout(to); res(m[1]); } });
        proc.on('exit', (code, sig) => { if (!settled) { settled = true; clearTimeout(to); rej(new Error('chrome exited before devtools (code ' + code + ', signal ' + sig + '): ' + buf.slice(0, 500))); } });
      });
    } catch (e) {
      lastLaunchErr = e;
      console.error('CHROME LAUNCH attempt ' + attempt + ' of 3 failed: ' + String((e && e.message) || e).slice(0, 220));
      try { proc.kill('SIGKILL'); } catch (e2) {}
      proc = null;
      if (attempt < 3) await new Promise(r => setTimeout(r, 300));
    }
  }
  if (!wsUrl) throw lastLaunchErr || new Error('chrome launch failed after 3 attempts');
const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      allExceptions.push(String((d.exception && d.exception.description) || d.text || '').slice(0, 220));
    }
  });
  const send = (method, params = {}, sessionId) => {
    const id = nextId++;
    return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  };
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = sessionId;
  await send('Page.enable', {}, S);
  await send('Runtime.enable', {}, S);
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
  if (offline) {
    await send('Network.enable', {}, S);
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, S);
  }
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
    if (r.result && r.result.exceptionDetails) { const d = r.result.exceptionDetails; const what = (d.exception && (d.exception.description || d.exception.value)) || d.text || 'unknown page error'; throw new Error('page evaluation threw: ' + String(what).slice(0, 300)); } // Beta 1.95 (deep audit SR-194-07): an evaluation error FAILS the drive - 1.94 returned a truthy {error} object that a bare ok(name, await ev(expr)) read as a PASS when the expression threw
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.navigate', { url: 'file://' + path.join(FIX, 'bootstrap.html') }, S);
  return { proc, ws, ev, send };
}
// Graceful shutdown so on-disk storage (localStorage LevelDB) commits before the next launch
// reads the profile - a bare SIGKILL right after a write can lose it (S2/S3 failures, run #21).
async function closeBrowser(b) {
  try { b.send('Browser.close'); } catch (e) {}
  for (let i = 0; i < 24 && b.proc.exitCode === null; i++) await sleep(250);
  if (b.proc.exitCode === null) { try { b.proc.kill('SIGKILL'); } catch (e) {} }
  await sleep(600);
}
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { const v = await fn(); if (v && !(typeof v === 'object' && 'error' in v)) return v; await sleep(400); } return false; };
const waitBoot = async (ev, ms) => !!(await until(async () => await ev(`!!document.getElementById('ver')`), ms || 25000));

export { sleep, launch, closeBrowser, until, waitBoot, allExceptions, FIX };
