import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Pack-delete turn proof (fix_id: pack-cache-c01-c02, finding C-02, 2026-11-15).
//
// The defect: the pack cache has a writers' turn (takePackWriteTurn,
// parts/app4.js - a Web Lock where the platform offers one) whose
// contract is that every pack mutation happens inside it, so writers
// census and write against each other's FINISHED state. The download
// takes it, migratePack takes it - but the Status pane's Delete
// (the stDel handler) deleted the whole 'snowroute-offline-v1' cache
// guarded only by the per-page preloadRunning flag. A delete landing
// while another writer holds the turn (a second tab's download, or
// this page's boot migration) deletes the cache under that writer:
// its writes land in a detached cache its own confirmation can still
// read, so it can finish by certifying a pack that no longer exists.
// The fix makes stDel acquire takePackWriteTurn() before deleting and
// release it in a finally after the metadata clears - the download's
// own acquire/release pattern.
//
// This proof extracts the shipped takePackWriteTurn and the shipped
// stDel handler verbatim from parts/app4.js and runs the handler
// against a stub DOM / Cache Storage / Web Locks (a FIFO lock manager
// with the platform's grant semantics). Scenario: a writer holds the
// turn, Delete is tapped, and the delete must not land until the
// writer releases. On unmodified main the handler completes and the
// cache is gone while the turn is still held (the first check FAILs);
// with the fix the delete waits, then completes once the turn frees.

const src = readFileSync('parts/app4.js', 'utf8') + '\n' + readFileSync('parts/app5.js', 'utf8'); // Arch-1: the handlers this proof extracts now span the split - the xPre handler stayed in app4.js, the write turn / migration / delete handlers moved with app4's tail into app5.js; the two parts are read in assembly order
const lines = src.split('\n');

function extractHandler(marker) {
  const start = lines.findIndex(l => l.includes(marker));
  if (start < 0) throw new Error('handler not found: ' + marker);
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) { if (lines[i] === '});') { end = i; break; } }
  if (end < 0) throw new Error('handler end not found: ' + marker);
  return lines.slice(start, end + 1).join('\n');
}
function extractTurn() {
  const start = lines.findIndex(l => l.includes('async function takePackWriteTurn'));
  if (start < 0) throw new Error('takePackWriteTurn not found in parts/app4.js + parts/app5.js');
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error('takePackWriteTurn end not found');
  return lines.slice(start, end + 1).join('\n');
}
const turnLine = extractTurn();
const handlerSrc = extractHandler("$('stDel').addEventListener('click'");
if (!handlerSrc.includes("caches.delete('snowroute-offline-v1')") || !handlerSrc.includes('PACKMIG_KEY')) {
  throw new Error('extracted stDel handler does not look like the pack delete handler');
}

// ---- Stub Web Locks: per-name FIFO; the lock is held until the callback's promise settles.
function makeLocks() {
  const queues = new Map();
  function grant(name) {
    const q = queues.get(name);
    if (!q || !q.length) return;
    const item = q[0];
    let result;
    try { result = item.cb(); } catch (e) { q.shift(); item.reject(e); grant(name); return; }
    Promise.resolve(result).then(v => { q.shift(); item.resolve(v); grant(name); }, e => { q.shift(); item.reject(e); grant(name); });
  }
  return {
    request(name, cb) {
      return new Promise((resolve, reject) => {
        const q = queues.get(name) || [];
        q.push({ cb, resolve, reject });
        queues.set(name, q);
        if (q.length === 1) grant(name);
      });
    }
  };
}

// ---- Stub Cache Storage.
const stores = new Set(['snowroute-offline-v1']);
const fakeCaches = {
  async delete(name) { return stores.delete(name); },
  async has(name) { return stores.has(name); },
  async open(name) { stores.add(name); return {}; }
};

const lsDels = [];
const toasts = [];
let statusRenders = 0;
const harness = { click: null };
const sandbox = {
  URL, Set, Map, Promise, setTimeout, clearTimeout,
  $: id => (id === 'stDel' ? { addEventListener(ev, fn) { harness.click = fn; } } : {}),
  tapGuard: () => true,
  preloadRunning: false,
  navigator: { locks: makeLocks() },
  caches: fakeCaches,
  toast: msg => { toasts.push(msg); },
  lsDel: k => { lsDels.push(k); return true; },
  PACKMIG_KEY: 'snowroute.v5.packmig',
  ROUTE_PACKS: [],
  routeKeys: id => ({ pre: 'pre.' + id }),
  renderStatus: () => { statusRenders++; },
  __harness: harness
};
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(turnLine + '\n' + handlerSrc + '\n__harness.takeTurn = takePackWriteTurn;', ctx);
if (typeof harness.click !== 'function') throw new Error('stDel click handler was not registered');
if (typeof harness.takeTurn !== 'function') throw new Error('takePackWriteTurn was not captured');

const flush = async () => { for (let i = 0; i < 25; i++) await new Promise(res => setImmediate(res)); };
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout - possible deadlock')), ms))]);

let failures = 0;
function check(desc, ok) {
  console.log((ok ? 'PASS: ' : 'FAIL: ') + desc);
  if (!ok) failures++;
}

// A writer (a download, a migration - any other tab or this page's boot) holds the turn.
const releaseWriter = await harness.takeTurn();

// Delete is tapped while the turn is held.
let settled = false;
const del = harness.click().then(() => { settled = true; }, () => { settled = true; });
await flush();

check('delete waits while another writer holds the pack turn', !settled && stores.has('snowroute-offline-v1'));

// The writer finishes; the delete may now proceed.
releaseWriter();
await withTimeout(del, 5000);

check('cache is deleted once the turn is free', !stores.has('snowroute-offline-v1'));
check('pack metadata cleared with the delete', lsDels.includes('snowroute.v5.packmig'));
check('success announced after the delete (the pane status re-render since Beta 1.221; the deleted pill itself stays absent)', statusRenders > 0 && !toasts.includes('Offline maps deleted'));

// The common path still works: with the turn free, a delete completes promptly (the fix must not wedge it).
stores.add('snowroute-offline-v1');
await withTimeout(harness.click(), 5000);
check('delete with the turn free completes and removes the cache', !stores.has('snowroute-offline-v1'));

if (failures > 0) process.exit(1);
