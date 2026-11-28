// Shared minimal CDP client: Chrome launch, the pending
// dispatcher, target/session setup, evaluate/poll/shot.
// Callers own navigation, interception and page logic.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function resolveChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  return fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome';
}

export async function launchCdp({ chrome, args = [], onEvent = null } = {}) {
  const proc = spawn(chrome || resolveChrome(), ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0', '--no-first-run', ...args, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = ''; let settled = false;
    const fail = e => { try { proc.kill('SIGKILL'); } catch {} rej(e); };
    const to = setTimeout(() => { if (!settled) { settled = true; fail(new Error('no devtools url: ' + buf.slice(0, 300))); } }, 25000);
    proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m && !settled) { settled = true; clearTimeout(to); res(m[1]); } });
    proc.on('exit', (code, sig) => { if (!settled) { settled = true; clearTimeout(to); fail(new Error('chrome exited before devtools (code ' + code + ', signal ' + sig + ')')); } });
    proc.on('error', e => { if (!settled) { settled = true; clearTimeout(to); fail(new Error('chrome spawn failed: ' + e.message)); } });
  });
  const ws = new WebSocket(wsUrl);
  try { await new Promise((r, j) => { const wto = setTimeout(() => j(new Error('ws open timeout')), 15000); ws.addEventListener('error', j, { once: true });
    ws.addEventListener('open', () => { clearTimeout(wto); r(); }, { once: true }); }); }
  catch (e) { try { proc.kill('SIGKILL'); } catch {} throw e; }
  let nextId = 1; const pending = new Map(); const consoleLog = [];
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.exceptionThrown') { const d = msg.params.exceptionDetails; consoleLog.push({ type: 'EXCEPTION', text: String((d.exception && d.exception.description) || d.text).slice(0, 300) }); }
    else if (msg.method === 'Runtime.consoleAPICalled') { consoleLog.push({ type: msg.params.type, text: (msg.params.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ').slice(0, 300) }); }
    if (onEvent) onEvent(msg);
  });
  const send = (method, params = {}, sessionId) => { const id = nextId++; return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); };
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const S = (await send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId;
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
    if (r.result && r.result.exceptionDetails) { const d = r.result.exceptionDetails; const what = (d.exception && (d.exception.description || d.exception.value)) || d.text || 'unknown page error';
      throw new Error('page evaluation threw: ' + String(what).slice(0, 300)); }
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const poll = async (expr, ms, step) => { const t0 = Date.now();
    while (Date.now() - t0 < (ms || 30000)) { let v = false; try { v = await ev(expr); } catch { v = false; } if (v === true) return true; await sleep(step || 300); } return false; };
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }, S); fs.writeFileSync(name, Buffer.from(r.result.data, 'base64')); };
  const close = () => { try { proc.kill('SIGKILL'); } catch {} try { ws.close(); } catch {} };
  return { proc, send, S, ev, poll, shot, consoleLog, close };
}
