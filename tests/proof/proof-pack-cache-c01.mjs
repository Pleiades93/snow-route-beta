import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Pack-cache orphan proof (fix_id: pack-cache-c01-c02, finding C-01, 2026-11-15).
//
// The defect: the offline download handler (parts/app4.js, the xPre
// click handler) is one of the pack cache's writers, but it only ever
// PUTs manifest URLs - it never deletes a stored entry the current
// manifest no longer names. Entries orphaned by a route deletion or
// update (deleteRoute never touches the pack cache) therefore survive
// every same-session download, and because the handler's opening census
// weighs EVERY stored byte against OFFLINE_PACK_CAP_BYTES, the orphans
// eat the pack budget: a later download can stop at the cap early and
// report a partial pack while dead tiles hold the space. The only
// prune in the app is migratePack's, and it runs at boot only. The fix
// prunes off-manifest entries inside the download handler, right after
// its census, while it already holds the pack writers' turn - the same
// prune migratePack performs, moved to the other writer, comparing
// URL-normalized hrefs on both sides (the 1.95 lesson: stored keys are
// normalized, so a raw-string comparison would delete the pack's own
// glyph files).
//
// This proof extracts the shipped xPre handler, takePackWriteTurn and
// packMigFingerprint verbatim from parts/app4.js and runs the handler
// against a stub Cache Storage / fetch / DOM. The manifest is a
// three-file stand-in (one entry a glyph URL whose name contains a
// literal space, like the real 'Noto Sans Regular' ranges), the pack
// starts with two manifest files plus one orphan, and the cap constant
// is supplied by the harness at a small value so the census arithmetic
// is observable in the outcome (the shipped value, 250 MB, is not
// touched - the handler reads the constant from its scope, and the
// harness is that scope here, the same way the sibling proofs supply
// stub state). On unmodified main the orphan survives, the download
// stops at the cap with 2 of 3 saved and no completion fingerprint;
// with the fix the orphan is pruned, all 3 files save, and the
// fingerprint is written.
//
// The Codex P2 on PR #69 added one more requirement the harness pins:
// the prune is destructive, so the manifest it judges against must be
// built from the device's CURRENT persisted route definitions, not
// this page's boot picture (a route created in another tab since boot
// is persisted but unregistered here, and its tiles would read as
// orphans). The handler therefore awaits initUserPacks() - the boot's
// own registration - before preloadUrlList(). The harness stubs both
// and records their call order: the refresh must precede the manifest.
// (The registration's own behaviour is the create battery's subject;
// what is pinned here is the wiring - that the shipped handler
// refreshes before it builds, the DA-07 lesson applied to this door.)

const src = readFileSync('parts/app4.js', 'utf8');
const lines = src.split('\n');

function extractHandler(marker) {
  const start = lines.findIndex(l => l.includes(marker));
  if (start < 0) throw new Error('handler not found: ' + marker);
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) { if (lines[i] === '});') { end = i; break; } }
  if (end < 0) throw new Error('handler end not found: ' + marker);
  return lines.slice(start, end + 1).join('\n');
}
function extractFn(marker) {
  const start = lines.findIndex(l => l.includes(marker));
  if (start < 0) throw new Error('function not found: ' + marker);
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) { if (lines[i] === '}') { end = i; break; } }
  if (end < 0) throw new Error('function end not found: ' + marker);
  return lines.slice(start, end + 1).join('\n');
}
const turnLine = lines.find(l => l.includes('async function takePackWriteTurn'));
if (!turnLine) throw new Error('takePackWriteTurn not found in parts/app4.js');
const handlerSrc = extractHandler("$('xPre').addEventListener('click'");
const fingerprintSrc = extractFn('function packMigFingerprint');
if (!handlerSrc.includes('takePackWriteTurn') || !handlerSrc.includes('packCache.keys()') || !handlerSrc.includes('OFFLINE_PACK_CAP_BYTES')) {
  throw new Error('extracted xPre handler does not look like the download handler');
}

// ---- Stub Cache Storage: keys are URL-normalized, as the real one stores them.
function makeResponse(size) {
  return { size, clone() { return makeResponse(size); }, async blob() { return { size }; } };
}
class FakeCache {
  constructor() { this.map = new Map(); }
  norm(u) { return new URL(typeof u === 'string' ? u : u.url).href; }
  async put(u, res) { this.map.set(this.norm(u), res); }
  async match(u) { return this.map.get(this.norm(u)); }
  async delete(u) { return this.map.delete(this.norm(u)); }
  async keys() { return [...this.map.keys()].map(url => ({ url })); }
}
const stores = new Map();
const fakeCaches = {
  async open(name) { if (!stores.has(name)) stores.set(name, new FakeCache()); return stores.get(name); },
  async delete(name) { return stores.delete(name); },
  async has(name) { return stores.has(name); },
  async match(u) { for (const c of stores.values()) { const r = await c.match(u); if (r) return r; } return undefined; }
};

// ---- The scenario.
const A = 'https://tiles.example.test/tiles/1/2/3.png';
const G = 'https://tiles.example.test/fonts/Noto Sans Regular/0-255.pbf'; // literal space, like the real glyph ranges
const C = 'https://tiles.example.test/tiles/4/5/6.png';
const ORPHAN = 'https://tiles.example.test/tiles/9/9/9.png';
const SIZES = { [new URL(A).href]: 100, [new URL(G).href]: 50, [new URL(C).href]: 200, [new URL(ORPHAN).href]: 999 };
const LIST = [A, G, C];

const pack = await fakeCaches.open('snowroute-offline-v1');
await pack.put(A, makeResponse(100));
await pack.put(G, makeResponse(50));
await pack.put(ORPHAN, makeResponse(999)); // left behind by a route that no longer exists

const lsWrites = [];
const callOrder = [];
const harness = { click: null };
const elements = {
  xPre: { addEventListener(ev, fn) { harness.click = fn; } },
  xPreStat: { textContent: '' },
  xPreBar: { classList: { add() {}, remove() {} } },
  xPreFill: { style: {} },
  setStatusPane: { classList: { contains: () => false } }
};
const sandbox = {
  URL, Set, Map, Promise, setTimeout, clearTimeout, setInterval, clearInterval, AbortController,
  $: id => elements[id],
  tapGuard: () => true,
  preloadRunning: false,
  location: { protocol: 'file:' }, // the shipped test-rig path: no service-worker gate
  navigator: {},
  caches: fakeCaches,
  fetch: async u => { const sz = SIZES[new URL(u).href]; return sz === undefined ? { ok: false } : { ok: true, clone() { return makeResponse(sz); } }; },
  preloadUrlList: () => { callOrder.push('manifest'); return LIST.slice(); },
  initUserPacks: async () => { callOrder.push('refresh'); return { state: 'done' }; },
  OFFLINE_PACK_CAP_BYTES: 1200, // harness-scaled so the census arithmetic is observable (shipped: 250 MB)
  PACKMIG_KEY: 'snowroute.v5.packmig',
  LS: { pre: 'test.pre' },
  lsSet: (k, v) => { lsWrites.push([k, v]); return true; },
  activeRoute: null,
  packTileUrls: () => new Set(),
  fmtStoreSize: () => 'TESTCAP',
  toast: () => {},
  renderStatus: () => {},
  __harness: harness
};
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(turnLine + '\n' + fingerprintSrc + '\n' + handlerSrc, ctx);
if (typeof harness.click !== 'function') throw new Error('xPre click handler was not registered');

await harness.click();

let failures = 0;
function check(desc, ok) {
  console.log((ok ? 'PASS: ' : 'FAIL: ') + desc);
  if (!ok) failures++;
}

const remaining = (await pack.keys()).map(r => r.url).sort();
check('persisted route registrations refreshed before the manifest is built', callOrder[0] === 'refresh' && callOrder[1] === 'manifest');
check('orphaned entry is pruned by the download', !remaining.includes(new URL(ORPHAN).href));
check('pack holds exactly the manifest set after the download', JSON.stringify(remaining) === JSON.stringify(LIST.map(u => new URL(u).href).sort()));
check("glyph entry survived under its normalized (%20) key", remaining.includes(new URL(G).href));
check('all 3 manifest files saved (no early cap stop)', elements.xPreStat.textContent.includes('saved 3 of 3'));
check('completion line reports no cap stop', !elements.xPreStat.textContent.includes('stopped at'));
check('completion fingerprint written for the healed pack', lsWrites.some(([k]) => k === 'snowroute.v5.packmig'));

if (failures > 0) process.exit(1);
