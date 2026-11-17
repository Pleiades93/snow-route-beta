// Localhost CONNECT bridge for the browser drives (harness fix, 2026-11-17).
//
// WHY THIS EXISTS. On the maintainer's VM, all internet egress goes through
// an authenticating, TLS-intercepting proxy whose credentials live in the
// https_proxy environment variable. Node and curl use those credentials and
// the system CA store, so the harness's Fetch-interception fulfilment (Node
// fetch) works. The test Chromium does neither: pointed at the upstream
// proxy it cannot authenticate its CONNECT tunnels, and on a direct
// connection the proxy's re-signed certificates are rejected
// (ERR_CERT_AUTHORITY_INVALID / ERR_SSL_PROTOCOL_ERROR). Every request the
// BROWSER makes itself - anything the drives' interception patterns do not
// cover, glyph/sprite fetches, worker fetches - failed, and engine-dependent
// checks (drive166 H1/H3's engReady, e2e-offline's glOk) failed with it:
// 52/54 locally against 54/54 in CI, identical on a pristine tree (snow
// goal: hidden_files/known-env-failures.md, entries closed by this fix).
//
// WHAT IT DOES. A tiny unauthenticated proxy on 127.0.0.1:BRIDGE_PORT that
// forwards CONNECT tunnels (and plain-HTTP proxy requests) to the upstream
// proxy, adding the upstream's Proxy-Authorization header. The harness
// launches Chromium with --proxy-server=http://127.0.0.1:BRIDGE_PORT and
// --ignore-certificate-errors ONLY when the environment carries an
// authenticated proxy; in CI (no such variable) ensureProxyBridge()
// returns null and the launch is byte-identical to the pre-fix launch.
//
// SECURITY CONTRACT. The upstream URL and its credentials are read from
// the environment at runtime and held in memory only. They are never
// written to a file, a commit, a log line or a report: this module logs
// nothing but a bare listening line, and the spawned bridge inherits the
// credentials through its environment - never through argv. The bridge
// binds 127.0.0.1 only; it is a test-tooling process on the maintainer's
// own VM, started on demand by the harness and left running for the
// battery's duration (startup is idempotent - concurrent drives share
// the one bridge via the health check below).
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BRIDGE_PORT = 18123;
const HEALTH_MARKER = 'snow-route-proxy-bridge';

// The upstream proxy URL when - and only when - the environment carries
// one WITH credentials. A credential-free proxy needs no bridge (Chromium
// can use it as-is, and the harness does not change its launch for it).
export function authenticatedProxyFromEnv(env = process.env) {
  const raw = env.https_proxy || env.HTTPS_PROXY || '';
  if (!raw) return null;
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (!u.username && !u.password) return null;
  return u;
}

function proxyAuthorization(up) {
  const user = decodeURIComponent(up.username || '');
  const pass = decodeURIComponent(up.password || '');
  return 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');
}

export function createBridgeServer(up) {
  const auth = proxyAuthorization(up);
  const upHost = up.hostname;
  const upPort = Number(up.port) || 80;

  // CONNECT tunnel: ask the upstream for a tunnel to host:port, and on
  // its 200 splice the two sockets together. The upstream's response is
  // BUFFERED until its header block completes - judging the first TCP
  // chunk alone destroys valid tunnels depending on packetization
  // (Codex review, PR #101). A 64 KB cap + the 30 s socket timeout
  // bound a response that never completes.
  function tunnel(clientSocket, target, head) {
    const upSocket = net.connect(upPort, upHost, () => {
      try {
        upSocket.write('CONNECT ' + target + ' HTTP/1.1\r\nHost: ' + target + '\r\nProxy-Authorization: ' + auth + '\r\nProxy-Connection: Keep-Alive\r\n\r\n');
      } catch (e) { bail(); }
    });
    const bail = () => { try { clientSocket.destroy(); } catch (e) {} try { upSocket.destroy(); } catch (e) {} };
    upSocket.setTimeout(30000, bail);
    let upBuf = Buffer.alloc(0);
    const onData = d => {
      try {
        upBuf = Buffer.concat([upBuf, d]);
        const idx = upBuf.indexOf('\r\n\r\n');
        if (idx === -1) { if (upBuf.length > 65536) bail(); return; }
        upSocket.removeListener('data', onData);
        const statusLine = upBuf.slice(0, upBuf.indexOf('\r\n')).toString();
        if (!/ 200 /.test(statusLine)) { bail(); return; }
        upSocket.setTimeout(0);
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        const rest = upBuf.slice(idx + 4);
        if (rest.length) clientSocket.write(rest);
        if (head && head.length) upSocket.write(head);
        upSocket.pipe(clientSocket);
        clientSocket.pipe(upSocket);
      } catch (e) { bail(); }
    };
    upSocket.on('data', onData);
    upSocket.on('error', bail);
    clientSocket.on('error', () => { try { upSocket.destroy(); } catch (e) {} });
  }

  // Plain-HTTP proxying: rebuild the request head (client proxy headers
  // out, upstream authorization in) and then pipe the remainder RAW in
  // both directions. The body is never decoded, so its framing -
  // Content-Length or chunked - crosses verbatim; decoding it and
  // forwarding it under the original chunked header corrupts it
  // (Codex review, PR #101). Proxy-Connection: close makes the
  // upstream close when the response completes, which is the
  // client socket's close signal.
  function forwardHttp(clientSocket, lines, rest) {
    const kept = [lines[0]];
    for (let i = 1; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if (lower.startsWith('proxy-authorization:') || lower.startsWith('proxy-connection:')) continue;
      kept.push(lines[i]);
    }
    kept.push('Proxy-Authorization: ' + auth, 'Proxy-Connection: close', '', '');
    const upSocket = net.connect(upPort, upHost, () => {
      try {
        upSocket.write(kept.join('\r\n'));
        if (rest.length) upSocket.write(rest);
        clientSocket.pipe(upSocket);
      } catch (e) { bail(); }
    });
    const bail = () => { try { clientSocket.destroy(); } catch (e) {} try { upSocket.destroy(); } catch (e) {} };
    upSocket.on('error', bail);
    clientSocket.on('error', () => { try { upSocket.destroy(); } catch (e) {} });
    upSocket.pipe(clientSocket);
  }

  // One raw TCP server for both proxy dialects plus the health check.
  // Raw by design: Node's http server fights a socket takeover (it
  // closes a Connection: close request socket whose response is never
  // written through it), and Node's http client routes through the
  // environment proxy itself - a proxy built on either inherits
  // failure modes that have nothing to do with proxying. Owning the
  // bytes removes that whole class. Every path is throw-proof: one
  // bad request must never take the bridge down.
  const server = net.createServer(clientSocket => {
    clientSocket.on('error', () => {});
    let buf = Buffer.alloc(0);
    const onData = d => {
      try {
        buf = Buffer.concat([buf, d]);
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) { if (buf.length > 65536) clientSocket.destroy(); return; }
        clientSocket.removeListener('data', onData);
        // PAUSE until the forwarder installs its pipe: a socket that
        // has had a data listener stays in flowing mode when the
        // listener is removed, and bytes arriving while the upstream
        // connection is still opening would be discarded - the client
        // would send a body the upstream never receives (Codex
        // review, PR #101). pipe() resumes the socket when it is
        // installed, in forwardHttp's connect callback and in
        // tunnel's CONNECT-response handler alike.
        clientSocket.pause();
        const lines = buf.slice(0, idx).toString('latin1').split('\r\n');
        const rest = buf.slice(idx + 4);
        const parts = lines[0].split(' ');
        const method = parts[0], target = parts[1];
        if (method === 'CONNECT') { tunnel(clientSocket, target, rest); return; }
        if (method === 'GET' && target === '/') {
          clientSocket.end('HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ' + HEALTH_MARKER.length + '\r\nConnection: close\r\n\r\n' + HEALTH_MARKER);
          return;
        }
        forwardHttp(clientSocket, lines, rest);
      } catch (e) { try { clientSocket.destroy(); } catch (e2) {} }
    };
    clientSocket.on('data', onData);
  });
  return server;
}

async function bridgeAlive() {
  try {
    const r = await fetch('http://127.0.0.1:' + BRIDGE_PORT + '/', { signal: AbortSignal.timeout(1500) });
    return r.ok && (await r.text()) === HEALTH_MARKER;
  } catch (e) { return false; }
}

// Ensure the bridge is listening; spawn it (detached, unref'd, stdio
// ignored) when it is not. Returns { port } when the browser should use
// the bridge, or null when no authenticated proxy is configured (the CI
// path - the caller launches exactly as before). A bridge that cannot be
// started degrades to null WITH a stderr note: the pre-fix launch is the
// fallback, and the drive's own checks still judge the outcome - nothing
// passes or fails by this module's say-so.
export async function ensureProxyBridge(env = process.env) {
  const up = authenticatedProxyFromEnv(env);
  if (!up) return null;
  if (await bridgeAlive()) return { port: BRIDGE_PORT };
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], { detached: true, stdio: 'ignore', env });
  child.unref();
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    if (await bridgeAlive()) return { port: BRIDGE_PORT };
    await new Promise(r => setTimeout(r, 200));
  }
  console.error('proxy-bridge: bridge did not come up within 10s; launching without it (pre-fix behaviour)');
  return null;
}

// Standalone mode: `node tests/browser/proxy-bridge.mjs` runs the bridge
// in the foreground (manual debugging; the harness spawns it this way).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const up = authenticatedProxyFromEnv();
  if (!up) { console.error('proxy-bridge: no authenticated proxy in the environment; nothing to bridge'); process.exit(1); }
  createBridgeServer(up).listen(BRIDGE_PORT, '127.0.0.1', () => console.log('proxy-bridge listening on 127.0.0.1:' + BRIDGE_PORT));
}
