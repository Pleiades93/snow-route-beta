// Offline Contract v1 fixture generator (architecture Phase 5, C4).
//
// Implements docs/OFFLINE-CONTRACT.md from CONTRACT CONSTANTS + the route
// DATA (parts/data.js and parts/pmstyles.js, read as data via vm) - never
// from the app's own preloadUrlList()/packMigFingerprint(). The whole point
// of the contract is that this derivation is independent: if the app's list
// and this list ever disagree, a test must fail, not silently follow.
//
// Run directly (`node tests/browser/gen-offline-fixture.mjs`) to regenerate
// tests/browser/fixtures/offline-pack.json. Regeneration is a deliberate act
// allowed only under a contract version bump with the set diff reviewed
// (the freeze rule, docs/OFFLINE-CONTRACT.md). The CI selftest
// (selftest-offline-fixture.mjs) re-runs buildOfflinePack() and fails on any
// byte difference from the frozen fixture.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

// ---- Contract constants (Offline Contract v1 - docs/OFFLINE-CONTRACT.md) ----
export const CONTRACT = {
  version: 1,
  vaughanBox: { w: -79.75, s: 43.70, e: -79.35, n: 44.05 }, // the wide-area box
  zoomMin: 8,          // the wide zooms join at z8 (the map's own minZoom)
  zoomMaxCap: 14,      // wide-area pass caps at z14 per vector source
  routeZoom: 15,       // the route-core pass runs at the source maxzoom tier
  routeMarginLng: 0.005,
  routeMarginLat: 0.004,
  glyphStack: 'Noto Sans Regular',
  glyphRanges: 256,    // range files 0-255, 256 codepoints each
  spriteSuffixes: ['.json', '.png', '@2x.json', '@2x.png'],
  packCache: 'snowroute-offline-v1',
  tilesCache: 'snowroute-tiles-v1',
  shellCache: 'snowroute-shell-v1',
  maxTiles: 3000,
  flagKey: 'snowroute.v5.packmig',
};

function loadData() {
  const dataSrc = readFileSync(new URL('../../parts/data.js', import.meta.url), 'utf8');
  const { ROADS, REFERENCE } = vm.runInNewContext(dataSrc + '\n;({ ROADS, REFERENCE })');
  const pmSrc = readFileSync(new URL('../../parts/pmstyles.js', import.meta.url), 'utf8');
  const { PM_DAY, PM_NIGHT } = vm.runInNewContext(pmSrc + '\n;({ PM_DAY, PM_NIGHT })');
  return { ROADS, REFERENCE, GL_STYLES: { day: PM_DAY, night: PM_NIGHT } };
}

// The route box, exactly as the app derives it (app2's routeBox: the
// bounding box of the route's street geometry, ROADS). Verified at contract
// adoption (2026-11-04): including REFERENCE changes the north edge
// (43.8241078 vs 43.8226209) but lands in the same z15 tile rows, so the
// generated SET is identical under either reading - 15 tiles either way.
function routeBoxOf(ROADS) {
  let w = 1e9, s = 1e9, e = -1e9, n = -1e9;
  for (const nm of Object.keys(ROADS)) for (const seg of ROADS[nm]) for (const p of seg) {
    w = Math.min(w, p[1]); e = Math.max(e, p[1]); s = Math.min(s, p[0]); n = Math.max(n, p[0]);
  }
  return { w, s, e, n };
}

// Slippy-map tile numbers - implemented test-side from the standard formula
// (the same math the app's tileNums uses, re-derived here, not imported).
function tileNums(lng, lat, z) {
  const n = 2 ** z;
  const x = Math.floor((lng + 180) / 360 * n);
  const la = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n);
  return [x, y];
}

// The fingerprint algorithm, as specified by the contract: djb2 over the
// newline-joined list in construction order, rendered
// 'v1:<count>:<base36 of the unsigned 32-bit hash>'.
export function fingerprintOf(list) {
  let h = 0; const s = list.join('\n');
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return 'v1:' + list.length + ':' + (h >>> 0).toString(36);
}

export function buildOfflinePack() {
  const { ROADS, GL_STYLES } = loadData();
  const routeBox = routeBoxOf(ROADS);
  const C = CONTRACT;
  const urls = new Set();
  for (const key of ['day', 'night']) {
    const stj = GL_STYLES[key];
    const spr = Array.isArray(stj.sprite) ? stj.sprite[0].url : stj.sprite;
    if (spr) { for (const suf of C.spriteSuffixes) urls.add(spr + suf); }
    if (stj.glyphs) { for (let a = 0; a < C.glyphRanges; a++) urls.add(stj.glyphs.replace('{fontstack}', C.glyphStack).replace('{range}', a * 256 + '-' + (a * 256 + 255))); }
    const ex = C.vaughanBox;
    for (const srcName of Object.keys(stj.sources || {})) {
      const src = stj.sources[srcName];
      if (src.type !== 'vector' || !src.tiles) continue;
      const maxz = Math.min(C.zoomMaxCap, src.maxzoom || C.zoomMaxCap);
      for (let z = C.zoomMin; z <= maxz; z++) { const [x0, y1] = tileNums(ex.w, ex.n, z); const [x1, y0] = tileNums(ex.e, ex.s, z); for (let x = x0; x <= x1; x++) for (let y = y1; y <= y0; y++) for (const t of src.tiles) urls.add(t.replace('{z}', z).replace('{x}', x).replace('{y}', y)); }
      if ((src.maxzoom || C.zoomMaxCap) >= C.routeZoom) { const cb = { w: routeBox.w - C.routeMarginLng, s: routeBox.s - C.routeMarginLat, e: routeBox.e + C.routeMarginLng, n: routeBox.n + C.routeMarginLat }; const [cx0, cy1] = tileNums(cb.w, cb.n, C.routeZoom); const [cx1, cy0] = tileNums(cb.e, cb.s, C.routeZoom); for (let x = cx0; x <= cx1; x++) for (let y = cy1; y <= cy0; y++) for (const t of src.tiles) urls.add(t.replace('{z}', C.routeZoom).replace('{x}', x).replace('{y}', y)); }
    }
  }
  const list = [...urls];
  return { contract: C.version, count: list.length, fingerprint: fingerprintOf(list), urls: list };
}

export function fixtureText() {
  return JSON.stringify(buildOfflinePack(), null, 1) + '\n';
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const out = new URL('./fixtures/offline-pack.json', import.meta.url);
  writeFileSync(out, fixtureText());
  const p = buildOfflinePack();
  console.log('wrote fixtures/offline-pack.json:', p.count, 'urls, fingerprint', p.fingerprint);
}
