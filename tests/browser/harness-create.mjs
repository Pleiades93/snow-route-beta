// Shared rig for the create-family drives (Improvement Tranche 3 T1,
// 2026-11-08): the nine drives that imported neither harness.mjs nor
// harness-http.mjs (117, 151, 153-159) each carried a private copy of
// the same CDP client + session handling, Fetch-interception plumbing,
// static repo server and boot sequence, and spoke a second evaluate
// dialect (ev2). This module is that rig, extracted from the family's
// copies: where the copies were verbatim (the spawn flags, the static
// server, the auto-attach handler, the session setup, evaluate, poll,
// J, bootRoute) the text here is theirs; where the copies DIFFERED the
// difference is a named option below and each drive passes the setting
// that reproduces its own historical behaviour - variants are
// preserved, never flattened:
//   jsonMode 'coded' (153/154/155/159): the fulfil json helper honours
//     its status-code argument and passes string bodies through raw.
//   jsonMode 'always200' (151): the helper ignores its code argument
//     (always 200) and JSON-stringifies every body - drive151's copy
//     predates the coded helper, so its "/packs/* answered 404" route
//     in fact answers 200 with a JSON string; preserved as-is (a
//     divergence finding, reported with this change, not silently
//     unified).
//   poll step: poll(expr, ms, step) - every drive polls at 400 ms
//     except drive159, which passes per-call steps (100/150/200 ms).
//   finishCreate pretty: 155-158 print their result block pretty
//     (JSON.stringify(R, null, 1)); 151/153/154/159 print it compact.
//   drive117 options (its documented exception shape - local origin +
//     SRI mirror, its server switches content roots mid-drive and
//     stays in the drive): autoAttach false (single session, no
//     Fetch.enable - its preamble never enabled Fetch), consoleMode
//     'objects' (console API + exceptions as { type, text } entries),
//     evaluateMode 'returnError' (an exception returns { error }
//     truncated at 400 chars instead of throwing at 300), its longer
//     --disable-features list, its cert/host-resolver flags, and the
//     devtools error carrying the stderr buffer. Its result tail also
//     stays in the drive (two servers, fixture cleanup, no proc kill).
// Drives keep: their header comment, their fixtures and request-
// routing TABLE (which URLs get which fixture/404/failure - scenario
// data, passed in as `fulfil`), their scenario body and every check.
// Drives 156/157/158 pass no fulfil at all: their copies' fulfil was
// the generic passthrough below, which is this module's default.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');

// The family's result block: R + ok, identical in all nine drives.
export function makeResults() {
  const R = { checks: [] };
  const ok = (name, cond) => R.checks.push([name, cond === true]);
  return { R, ok };
}

// ---- the family's static repo server (verbatim in 151, 153-159) ----
export const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/plain', '.py': 'text/plain', '.yml': 'text/plain' };
export async function serveRepo(REPO) {
  const server = http.createServer((req, res) => {
    const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(REPO) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const ORIGIN = 'http://127.0.0.1:' + server.address().port;
  return { server, ORIGIN };
}

// The generic passthrough fulfil (verbatim in 156/157/158): fulfil
// through Node fetch, fail the request on error.
async function passthroughFulfil(sessionId, p, H) {
  try {
    const r = await fetch(p.request.url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    await H.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: r.status, responseHeaders: [{ name: 'Content-Type', value: r.headers.get('content-type') || 'application/octet-stream' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: buf.toString('base64') }, sessionId);
  } catch (e) { try { await H.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); } catch (e2) {} }
}

export async function startCreateRig({ profile, fulfil = null, jsonMode = 'coded', autoAttach = true, evaluateMode = 'throw', disableFeatures = 'LocalNetworkAccessChecks', extraFlags = [], devtoolsErrorWithBuf = false, onPaused = null } = {}) {
  const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-proxy-server', '--remote-debugging-port=0', '--disable-features=' + disableFeatures, '--user-data-dir=' + profile, ...extraFlags, '--window-size=420,900', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => { let buf = ''; proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); setTimeout(() => rej(new Error(devtoolsErrorWithBuf ? 'no devtools url: ' + buf.slice(0, 500) : 'no devtools url')), 25000); });
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let nextId = 1; const pending = new Map(); const consoleLog = []; const sessions = new Set();
  let PAGE_S = null;
  function send(method, params = {}, sessionId) { const id = nextId++; return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
  // The fulfil helpers: send, plus the family's json responder in the
  // drive's own variant (see the header: 'coded' vs 'always200').
  const H = {
    send,
    json: (sessionId, p, obj, code) => jsonMode === 'always200'
      ? send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(JSON.stringify(obj)).toString('base64') }, sessionId)
      : send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: code || 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)).toString('base64') }, sessionId)
  };
  const fulfilFn = fulfil || passthroughFulfil;
  if (autoAttach) {
    ws.addEventListener('message', async ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
      if (msg.method === 'Target.attachedToTarget') {
        const sid = msg.params.sessionId;
        if (!sessions.has(sid)) { sessions.add(sid); await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sid); }
        return;
      }
      if (msg.method === 'Fetch.requestPaused') { fulfilFn(msg.sessionId, msg.params, H); return; }
      if (msg.method === 'Runtime.exceptionThrown' && msg.sessionId === PAGE_S) { const d = msg.params.exceptionDetails; consoleLog.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text)); }
    });
    await send('Target.setAutoAttach', { autoAttach: true, flatten: true, waitForDebuggerOnStart: false });
  } else {
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      else if (msg.method === 'Runtime.consoleAPICalled') {
        consoleLog.push({ type: msg.params.type, text: (msg.params.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ') });
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        consoleLog.push({ type: 'EXCEPTION', text: (d.exception && d.exception.description) || d.text });
      } else if (msg.method === 'Fetch.requestPaused') {
        if (onPaused) onPaused(msg.params, { send, sessionId: PAGE_S });
      }
    });
  }
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  PAGE_S = (await send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId;
  const S = PAGE_S;
  await send('Page.enable', {}, PAGE_S);
  await send('Runtime.enable', {}, PAGE_S);
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, PAGE_S);
  async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, PAGE_S);
    if (evaluateMode === 'returnError') {
      if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 400) };
      return r.result && r.result.result ? r.result.result.value : undefined;
    }
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result && r.result.result ? r.result.result.value : undefined;
  }
  const ev2 = async (code) => evaluate(code);
  const ev = ev2;
  const poll = async (expr, ms, step) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { let v; try { v = await ev2(expr); } catch (e) { v = undefined; } if (v === true) return true; await sleep(step || 400); } return false; };
  const J = async (expr) => { const raw = await ev2(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
  async function shot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png' }, S);
    fs.writeFileSync(name, Buffer.from(r.result.data, 'base64'));
    console.log('saved', name);
  }
  // The family's shared boot (151, 153-158 verbatim): boot -> route
  // menu -> pick Route 5W -> loaded, splash gone.
  const bootRoute = async () => {
    await poll(`!!document.getElementById('ver')`, 20000);
    await poll(`!!window.__bootAt`, 30000); // the boot stamp, not the element: rmChoose is rendered before its click handler is wired - clicking in that gap is a silent no-op and the route rows never render (drive150's boot polls the same stamp before clicking; the note is drive151's)
    await poll(`!!document.getElementById('rmChoose')`, 20000);
    await ev2(`document.getElementById('rmChoose').click()`);
    await poll(`!!document.querySelector('#rmRoutes .routeRow')`, 20000);
    await ev2(`document.querySelector('#rmRoutes .routeRow').click()`);
    await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 30000);
    await poll(`!document.getElementById('splash')`, 10000);
  };
  return { proc, ws, send, S, PAGE_S, evaluate, ev, ev2, poll, J, shot, bootRoute, consoleLog, sessions, sleep };
}

// The family's result tail: print the block, kill the browser, close
// the server, exit 0. `pretty` preserves each drive's own formatting
// (155-158 pretty, 151/153/154/159 compact). R.exceptions is set by
// the drive from consoleLog before calling this, exactly as before.
export function finishCreate(R, proc, server, { pretty = false } = {}) {
  console.log(pretty ? JSON.stringify(R, null, 1) : JSON.stringify(R));
  try { proc.kill('SIGKILL'); } catch (e) {}
  if (server) server.close();
  process.exit(0);
}
