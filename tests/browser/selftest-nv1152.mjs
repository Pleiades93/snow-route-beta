// selftest-nv1152.mjs - Beta 1.152 NV-recommendation fix round, Node proofs.
//
// NV2: computeStretches gets a bbox prefilter (app1.js). Parity is structural
// (finishJunctionCuts sorts the cuts, and a vertex too far from a run's bbox
// cannot project within 4 m of it), and is pinned here by canonical digests
// of the 1.151 implementation's output on three road sets. The scaling case
// counts projOnLine calls: quadratic before, near-linear after.
// NV1/NV3a: normalizePack (create-packs.js) gains a box-extent ceiling and a
// total-length ceiling, sized from the measured real maxima (worst legitimate
// pack = the 300 longest Toronto streets, 2,962.5 km; widest city bbox
// 0.526 deg). NV3b: the tile enumerators (app4.js) gain a per-pack iteration
// budget - proven against a worldwide box in a child process with a timeout,
// because on the unfixed code the call never returns.
// NV4: capHistoryList (app1.js) must reproduce trimHistory's eviction exactly
// in linear time; the load/restore enforcement itself is drive177's job.
//
// Run: node tests/browser/selftest-nv1152.mjs [--child-nv3b]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const read = (rel) => readFileSync(HERE + '../../' + rel, 'utf8');
const app1 = read('parts/app1.js');
const app4 = read('parts/app4.js');
const createPacks = read('parts/create-packs.js');
const pmstyles = read('parts/pmstyles.js');
const dataJs = read('parts/data.js');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond === true) { pass++; } else { fail++; console.log('FAIL', name); } };

function extract(src, marker) {
  const i = src.indexOf(marker); if (i < 0) throw new Error('marker missing: ' + marker);
  let j = src.indexOf('{', i), d = 0, k = j;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } }
  return src.slice(i, k);
}
const constLine = (src, name) => { const m = src.match(new RegExp('const ' + name + ' = [^;]+;')); return m ? m[0] : ''; };
const sha = (s) => createHash('sha256').update(s).digest('hex');

// ---- shared: the Route 5W pack from the shipped data part ----
const fiveWCx = {};
vm.runInNewContext(dataJs + '\n;globalThis.__RP = ROUTE_PACKS;', fiveWCx, { filename: 'data.js' });
const FIVEW = fiveWCx.__RP.find(p => p.id === '5w');

// ============================ NV3b child mode ============================
if (process.argv.includes('--child-nv3b')) {
  const api = new Function('GL_STYLES', 'computeRouteBox', 'distM', 'PACK_TILES_MAX', `
    ${extract(app4, 'function tileNums(')}
    ${extract(app4, 'function packTileUrls(')}
    return { packTileUrls };`);
  const cx = {}; vm.runInNewContext(pmstyles + '\n;globalThis.__GS = { day: PM_DAY, night: PM_NIGHT };', cx, { filename: 'pmstyles.js' });
  cx.GL_STYLES = cx.__GS;
  const g = new Function('MLAT', 'MLNG', `
    ${extract(app1, 'function distM(')}
    ${extract(app1, 'function computeRouteBox(')}
    return { distM, computeRouteBox };`)(111320, 80386);
  const tilesConst = (app1.match(/const PACK_TILES_MAX = (\d+);/) || [])[1];
  const out = api(cx.GL_STYLES, g.computeRouteBox, g.distM, tilesConst ? Number(tilesConst) : undefined)
    .packTileUrls({ box: { w: -180, s: -85, e: 180, n: 85 }, roads: FIVEW.roads });
  console.log('SIZE ' + out.size);
  process.exit(0);
}

// ============================ NV2: computeStretches ============================
function stretchesApi() {
  const counter = { n: 0 };
  // Build the pieces in one scope so computeStretches sees the counting wrapper.
  const scope = new Function('MLAT', 'MLNG', 'counter', `
    ${extract(app1, 'function distM(')}
    ${extract(app1, 'function stitchRuns(')}
    ${extract(app1, 'function projOnLine(').replace('function projOnLine(', 'function __projReal(')}
    function projOnLine(line, cum, p) { counter.n++; return __projReal(line, cum, p); }
    ${extract(app1, 'function sliceLine(')}
    ${extract(app1, 'function finishJunctionCuts(')}
    ${extract(app1, 'function computeStretches(')}
    return { computeStretches };`)(111320, 80386, counter);
  return { computeStretches: scope.computeStretches, counter };
}
const { computeStretches, counter } = stretchesApi();
const canon = (o) => JSON.stringify(o, Object.keys(o).sort());
const digestOf = (roads) => sha(JSON.stringify(computeStretches(JSON.parse(JSON.stringify(roads)))));

// grid fixture: 8 vertical + 8 horizontal streets crossing, plus one
// two-segment street and one street in two disconnected runs
function gridFixture() {
  const roads = {};
  for (let i = 0; i < 8; i++) { const lng = -79.50 + i * 0.004; roads['V' + i] = [[[43.60, lng], [43.63, lng]]]; }
  for (let j = 0; j < 8; j++) { const lat = 43.60 + j * 0.004; roads['H' + j] = [[[lat, -79.50], [lat, -79.472]]]; }
  roads['Diag'] = [[[43.598, -79.502], [43.615, -79.485]], [[43.615, -79.485], [43.632, -79.470]]];
  roads['Split'] = [[[43.605, -79.498], [43.605, -79.490]], [[43.605, -79.480], [43.605, -79.474]]];
  return roads;
}
// work fixture: 25 x 25 dense street grid, 200 points per street
function workFixture() {
  const roads = {};
  for (let i = 0; i < 25; i++) {
    const lng = -79.50 + i * 0.002, line = [];
    for (let k = 0; k < 200; k++) line.push([43.60 + (0.30 * k) / 199, lng]);
    roads['WV' + i] = [line];
  }
  for (let j = 0; j < 25; j++) {
    const lat = 43.60 + j * 0.002, line = [];
    for (let k = 0; k < 200; k++) line.push([lat, -79.50 + (0.048 * k) / 199]);
    roads['WH' + j] = [line];
  }
  return roads;
}
// Parity digests pinned from the 1.151 implementation (see SHIP-RECORD).
const DIGEST_5W = 'bfc4c8fb4e66c78d9d981e77662555082e420601f850be65ca2d5d54280bf823';
const DIGEST_GRID = '2dedeb07aff505fe71039fef9090dfd6e22de804c77d74df2b0e6538e0fda58d';
const DIGEST_WORK = '59b96354f581ccdc4af58d92d9085211d45732b6e37830215c0679499affdffd';
const d5 = digestOf(FIVEW.roads);
ok('NV2 parity: Route 5W stretches identical to the pre-fix implementation (digest ' + d5.slice(0, 12) + ')', DIGEST_5W !== 'PIN_ME' && d5 === DIGEST_5W);
const dg = digestOf(gridFixture());
ok('NV2 parity: junction grid stretches identical (digest ' + dg.slice(0, 12) + ')', DIGEST_GRID !== 'PIN_ME' && dg === DIGEST_GRID);
const workRoads = workFixture();
counter.n = 0;
const t0 = Date.now();
const workOut = computeStretches(workRoads);
const workMs = Date.now() - t0;
const dw = sha(JSON.stringify(workOut));
ok('NV2 parity: dense work grid stretches identical (digest ' + dw.slice(0, 12) + ')', DIGEST_WORK !== 'PIN_ME' && dw === DIGEST_WORK);
ok('NV2 scaling: projOnLine calls on the 50-street x 200-point grid stay near-linear (' + counter.n + ' calls; the unfixed cross-product is 490,000)', counter.n > 0 && counter.n <= 20000);
ok('NV2 scaling: the dense grid finishes fast (' + workMs + ' ms)', workMs < 3000);
if (DIGEST_5W === 'PIN_ME') console.log('DIGESTS', d5, dg, dw);

// ============================ NV1 + NV3a: normalizePack ============================
const packConsts = ['PACK_NAME_MAX', 'PACK_AREA_MAX', 'PACK_TILENAME_MAX', 'PACK_STREETS_MAX', 'PACK_SEGS_MAX', 'PACK_SEG_PTS_MAX', 'PACK_POINTS_MAX', 'PACK_BOX_MAX_DEG', 'PACK_LENGTH_MAX_M', 'PACK_FIELDS']
  .map(n => constLine(app1, n)).filter(Boolean).join('\n');
const npApi = new Function('MLAT', 'MLNG', `
  ${packConsts}
  ${extract(app1, 'function distM(')}
  ${extract(app1, 'function computeRouteBox(')}
  ${extract(createPacks, 'function normalizePack(')}
  return { normalizePack };`)(111320, 80386);
const normalizePack = npApi.normalizePack;
const smallRoads = { A: [[[43.0, -79.0], [43.001, -79.001]]] };
ok('NV3a: a worldwide declared box is rejected at validation', normalizePack({ name: 'X', roads: smallRoads, box: { w: -180, s: -85, e: 180, n: 85 } }).ok === false);
ok('NV3a: a 10-degree geometry extent is rejected at validation', normalizePack({ name: 'X', roads: { A: [[[43.0, -79.0], [53.0, -79.0]]] } }).ok === false);
ok('NV3a: a box outside world bounds is rejected at validation', normalizePack({ name: 'X', roads: smallRoads, box: { w: -190, s: 43.0, e: -79.0, n: 43.5 } }).ok === false);
// length bomb: 3 segments zig-zagging 0.27 deg (~30 km) per leg, 200 pts each
// = ~17,900 km total on 600 points - under every pre-1.152 cap.
const bombSeg = []; for (let i = 0; i < 200; i++) bombSeg.push(i % 2 ? [43.27, -79.0] : [43.0, -79.0]);
ok('NV1: a ~17,900 km pack on 600 points is rejected at validation', normalizePack({ name: 'X', roads: { Bomb: [bombSeg, bombSeg, bombSeg] } }).ok === false);
const fiveWRaw = JSON.parse(JSON.stringify(FIVEW)); delete fiveWRaw.id;
ok('NV1/NV3a control: the shipped Route 5W pack still validates', normalizePack(fiveWRaw).ok === true);
// Worst legitimate pack, in the shape the create flow actually produces:
// city streets enter a pack as STITCHED RUNS (raw OSM segment counts - up to
// 502 for one Toronto street - are not pack shape; PACK_SEGS_MAX already
// excludes them). Take Toronto streets by length, stitch each into runs,
// accumulate up to the 300-street cap while the 150,000-point cap allows.
const stitchApi = new Function('MLAT', 'MLNG', `
  ${extract(app1, 'function distM(')}
  ${extract(app1, 'function stitchRuns(')}
  return { stitchRuns };`)(111320, 80386);
const tor = JSON.parse(read('packs/toronto.json'));
const torStreets = Object.entries(tor.streets).map(([n, g]) => {
  let len = 0; for (const seg of g) for (let i = 1; i < seg.length; i++) { const a = seg[i - 1], b = seg[i]; len += Math.hypot((b[0] - a[0]) * 111320, (b[1] - a[1]) * 80386); }
  return { n, g, len };
}).sort((a, b) => b.len - a.len);
const topRoads = {}; let topPts = 0, topLenKm = 0;
for (const s of torStreets) {
  if (Object.keys(topRoads).length >= 300) break;
  const runs = stitchApi.stitchRuns(s.n, { [s.n]: s.g.map(seg => seg.map(p => [p[0], p[1]])) });
  if (!runs.length || runs.length > 80) continue;
  let pts = 0; for (const r of runs) pts += r.length;
  if (topPts + pts > 145000) continue;
  topRoads[s.n] = runs; topPts += pts; topLenKm += s.len / 1000;
}
ok('NV1/NV3a control fixture: the worst legitimate pack is pack-shaped (' + Object.keys(topRoads).length + ' streets, ' + topPts + ' pts, ' + topLenKm.toFixed(0) + ' km)', Object.keys(topRoads).length >= 100 && topLenKm > 1000);
ok('NV1/NV3a control: the worst legitimate pack still validates', normalizePack({ name: 'TorontoWorst', roads: topRoads }).ok === true);

// ============================ NV3b: tile enumeration ============================
const app4Api = new Function('GL_STYLES', 'computeRouteBox', 'distM', 'ROUTE_PACKS', 'PACK_TILES_MAX', `
  ${extract(app4, 'function tileNums(')}
  ${extract(app4, 'function packTileUrls(')}
  ${extract(app4, 'function preloadUrlList(')}
  return { packTileUrls, preloadUrlList };`);
const pmCx = {}; vm.runInNewContext(pmstyles + '\n;globalThis.__GS = { day: PM_DAY, night: PM_NIGHT };', pmCx, { filename: 'pmstyles.js' });
  pmCx.GL_STYLES = pmCx.__GS;
const gApi = new Function('MLAT', 'MLNG', `
  ${extract(app1, 'function distM(')}
  ${extract(app1, 'function computeRouteBox(')}
  return { distM, computeRouteBox };`)(111320, 80386);
const tilesConst2 = (app1.match(/const PACK_TILES_MAX = (\d+);/) || [])[1];
const enumApi = app4Api(pmCx.GL_STYLES, gApi.computeRouteBox, gApi.distM, [FIVEW], tilesConst2 ? Number(tilesConst2) : undefined);
ok('NV3b control: packTileUrls(Route 5W) is unchanged at 633 URLs', enumApi.packTileUrls(FIVEW).size === 633);
const fixture = JSON.parse(read('tests/browser/fixtures/offline-pack.json'));
const preloadList = enumApi.preloadUrlList();
ok('NV3b control: preloadUrlList() still equals the frozen 897-URL fixture, in order',
  preloadList.length === fixture.urls.length && preloadList.every((u, i) => u === fixture.urls[i]));
const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child-nv3b'], { timeout: 8000, encoding: 'utf8' });
const childSize = child.stdout && child.stdout.match(/SIZE (\d+)/) ? Number(child.stdout.match(/SIZE (\d+)/)[1]) : -1;
ok('NV3b: enumerating a worldwide-box pack returns bounded (child size ' + childSize + ', timeout/error: ' + (child.error ? child.error.code : 'none') + ')',
  !child.error && childSize > 0 && childSize <= 20000);

// ============================ NV4: capHistoryList ============================
const hasCap = app1.includes('function capHistoryList(');
ok('NV4: capHistoryList exists in app1.js', hasCap);
if (hasCap) {
  const NAMES34 = Array.from({ length: 34 }, (_, i) => 'S' + i);
  const hApi = new Function('STREETNAMES', `
    ${extract(app1, 'function isFullRun(')}
    ${extract(app1, 'function trimHistory(')}
    ${extract(app1, 'function capHistoryList(')}
    return { trimHistory, capHistoryList };`)(NAMES34);
  // deterministic PRNG (mulberry32)
  let seed = 42;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const mkEntry = (full) => { const items = {}; const n = full ? 34 : 1 + Math.floor(rnd() * 33); for (let i = 0; i < n; i++) items['S' + i] = null; return { at: 'x', items }; };
  let equiv = true;
  for (let trial = 0; trial < 300 && equiv; trial++) {
    const len = Math.floor(rnd() * 41);
    const list = []; for (let i = 0; i < len; i++) list.push(mkEntry(rnd() < 0.4));
    list.forEach((e, i) => { e.tag = i; });
    const a = hApi.trimHistory(JSON.parse(JSON.stringify(list))).map(e => e.tag);
    const b = hApi.capHistoryList(JSON.parse(JSON.stringify(list)), 34).map(e => e.tag);
    if (JSON.stringify(a) !== JSON.stringify(b)) { equiv = false; console.log('NV4 mismatch at trial', trial, 'len', len, JSON.stringify(a), JSON.stringify(b)); }
  }
  ok('NV4: capHistoryList reproduces trimHistory eviction exactly on 300 randomized lists', equiv);
  const big = []; for (let i = 0; i < 25; i++) big.push({ at: 'x', items: { S0: null } });
  ok('NV4: capHistoryList caps an oversized list at 10, keeping the newest', (() => { const r = hApi.capHistoryList(big.map((e, i) => ({ ...e, tag: i })), 34); return r.length === 10 && r[0].tag === 15 && r[9].tag === 24; })());
}

console.log(`selftest-nv1152: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
