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
import http from 'node:http';
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
  const server = http.createServer();
  // Health check + plain-HTTP proxying. A bare GET / is the harness's
  // liveness probe and is answered by the bridge itself; any other
  // request is an absolute-form proxy request and is forwarded upstream
  // over a raw socket with the authorization header added. (Raw socket,
  // not http.request: this Node routes its own http client through the
  // environment proxy, which would double-proxy the forward - and its
  // authority check threw on the target Host header, an uncaught throw
  // that killed the first productionized bridge mid-battery. Every
  // handler here is throw-proof for the same reason: one bad request
  // must never take the bridge down.)
  server.on('request', (req, res) => {
    try {
      if (req.url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(HEALTH_MARKER);
        return;
      }
      let target;
      try { target = new URL(req.url); } catch (e) { res.writeHead(400); res.end(); return; }
      const clientSocket = req.socket;
      const upSocket = net.connect(upPort, upHost, () => {
        const lines = [req.method + ' ' + req.url + ' HTTP/' + req.httpVersion];
        let hasHost = false;
        for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) {
          const name = req.rawHeaders[i], lower = name.toLowerCase();
          if (lower === 'proxy-authorization' || lower === 'proxy-connection') continue;
          if (lower === 'host') hasHost = true;
          lines.push(name + ': ' + req.rawHeaders[i + 1]);
        }
        if (!hasHost) lines.push('Host: ' + target.host);
        lines.push('Proxy-Authorization: ' + auth, 'Proxy-Connection: close', '', '');
        upSocket.write(lines.join('\r\n'));
        req.pipe(upSocket);
      });
      const bail = () => { try { clientSocket.destroy(); } catch (e) {} try { upSocket.destroy(); } catch (e) {} };
      upSocket.on('error', bail);
      clientSocket.on('error', () => { try { upSocket.destroy(); } catch (e) {} });
      upSocket.pipe(clientSocket);
    } catch (e) {
      try { if (!res.headersSent) res.writeHead(502); res.end(); } catch (e2) {}
    }
  });
  server.on('connect', (req, clientSocket, head) => {
    const upSocket = net.connect(upPort, upHost, () => {
      try {
        upSocket.write('CONNECT ' + req.url + ' HTTP/1.1\r\nHost: ' + req.url + '\r\nProxy-Authorization: ' + auth + '\r\nProxy-Connection: Keep-Alive\r\n\r\n');
      } catch (e) { bail(); }
    });
    const bail = () => { try { clientSocket.destroy(); } catch (e) {} try { upSocket.destroy(); } catch (e) {} };
    upSocket.setTimeout(30000, bail);
    upSocket.once('data', d => {
      const idx = d.indexOf('\r\n\r\n');
      const statusLine = d.slice(0, d.indexOf('\r\n')).toString();
      if (idx === -1 || !/ 200 /.test(statusLine)) { bail(); return; }
      upSocket.setTimeout(0);
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      const rest = d.slice(idx + 4);
      if (rest.length) clientSocket.write(rest);
      if (head && head.length) upSocket.write(head);
      upSocket.pipe(clientSocket);
      clientSocket.pipe(upSocket);
    });
    upSocket.on('error', bail);
    clientSocket.on('error', () => { try { upSocket.destroy(); } catch (e) {} });
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
