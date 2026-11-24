// proof-anchors.mjs - Label round (geometry-anchored route titles).
// A title's side is DATA, decided once in buildEngineGeometry by
// assignAnchors - a pure function of the streets. This proof grades the
// shipped pass three ways: (1) structural - the pass exists, runs last
// in the geometry build, and stamps every label feature; (2) the real
// 5W pack - every anchor recomputed by an INDEPENDENT implementation of
// the rule (per-segment clearance voting; direction from the label
// line's edge nearest the point; the alongside preference with the
// along-axis side winning only at strictly over twice the clearance)
// must equal the shipped data, in whole-street and split-run builds;
// (3) hand-derived fixtures - the 1.248 streets and Fifth read their
// clearance side, and synthetic packs pin the tie and factor edges.
// The mutation receipt for this file lives in tests/mutation-receipts.json.
// Run from the repo root:  node tests/proof/proof-anchors.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const engine = read('parts/engine.js');
const data = read('parts/data.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

function extractFn(src, header) {
  const at = src.indexOf(header);
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0, str = null, esc = false, line = false, block = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === str) str = null; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { str = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return '';
}
const count = (hay, needle) => hay.split(needle).length - 1;

// ---------- 1: structure ----------
const buildSrc = extractFn(engine, 'function buildEngineGeometry()');
check('1a: the geometry build calls the anchor pass after the tier pass',
  buildSrc.includes('assignTiers();') && buildSrc.includes('assignAnchors(titleDirections)') &&
  buildSrc.indexOf('assignAnchors(titleDirections)') > buildSrc.indexOf('assignTiers();'));
check('1b: the anchor pass is defined once and called once (one placement owner)',
  count(engine, 'assignAnchors(') === 2 && engine.includes('function assignAnchors(titleDirections)'));
check('1c: the build captures each street\'s label-edge direction during the SPOT walk',
  buildSrc.includes('titleDirections.set(n,'));

// ---------- shared rig: the real build, extracted ----------
const packs = vm.runInNewContext(data + '\n;ROUTE_PACKS;', {});
const pack = packs[0];
const MLAT = 111320, MLNG = 80386;
const topoAt = engine.indexOf('const TOPO = {');
const topoSrc = topoAt > -1 ? engine.slice(topoAt, engine.indexOf('\n};', topoAt) + 3) : '';
function makeWorld(ROADS, STRETCH, SPOT) {
  const H = {
    names: Object.keys(STRETCH), STRETCH, ROADS, SPOT, PRIMARIES: new Set(pack.primaries), MLAT, MLNG,
    jDistM: (a, b) => Math.hypot((b[1] - a[1]) * MLNG, (b[0] - a[0]) * MLAT),
    ptSegM(p, a, b) { const px = p[1] * MLNG, py = p[0] * MLAT, ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)); return Math.hypot(px - (ax + t * vx), py - (ay + t * vy)); },
  };
  const prelude = [
    engine.split('\n').find(l => l.startsWith('const XYOf =')),
    engine.split('\n').find(l => l.startsWith('const GJ =')),
    engine.split('\n').find(l => l.startsWith('const WIDTH_K =')),
    engine.split('\n').find(l => l.startsWith('const coordKey =')),
    extractFn(engine, 'function segLenM('),
    extractFn(engine, 'function offsetLine('),
    'const GEO = {};', topoSrc, 'const LEFTBIT = {};',
    'const labelFeatures = [];', 'const labelPointFeatures = [];',
    'let JUNC = null;',
    'const ROUTEPOI = { type: \'Feature\', properties: {}, geometry: { type: \'Point\', coordinates: [0, 0] } };',
    'const HIT = { type: \'FeatureCollection\', features: [] };',
    extractFn(engine, 'function buildEngineGeometry()'),
    extractFn(engine, 'function nudgeFifth()'),
    extractFn(engine, 'function assignTiers()'),
    extractFn(engine, 'function assignAnchors('),
    extractFn(engine, 'function boundaryRecAt('),
  ].join('\n');
  return vm.runInNewContext(prelude + '\nbuildEngineGeometry();\n({ GEO, TOPO, labelFeatures, labelPointFeatures });', { H });
}

// ---------- the independent implementation of the rule ----------
const ANCHOR_OF = { north: 'bottom', south: 'top', east: 'left', west: 'right' };
function independentAnchors(world, names) {
  const { GEO, TOPO, labelFeatures, labelPointFeatures } = world;
  const out = {};
  for (const f of labelPointFeatures) {
    const lng = f.geometry.coordinates[0], lat = f.geometry.coordinates[1];
    const clearance = { north: Infinity, south: Infinity, east: Infinity, west: Infinity };
    for (const n of names) {
      if (n === f.properties.name) continue;
      const stitched = GEO[n].stitched;
      for (const range of TOPO.ranges(n)) {
        const last = Math.max(range.start, range.end - 1);
        for (let k = range.start; k <= last; k++) {
          const a = stitched[k], b = stitched[Math.min(k + 1, range.end)];
          const x = (a[1] - lng) * MLNG, y = (a[0] - lat) * MLAT;
          const dx = (b[1] - a[1]) * MLNG, dy = (b[0] - a[0]) * MLAT;
          const L2 = dx * dx + dy * dy;
          const t = L2 ? Math.max(0, Math.min(1, -(x * dx + y * dy) / L2)) : 0;
          const qx = x + dx * t, qy = y + dy * t;
          const side = Math.abs(qx) > Math.abs(qy) ? (qx > 0 ? 'east' : 'west') : (qy >= 0 ? 'north' : 'south');
          const d = Math.hypot(qx, qy);
          if (d < clearance[side]) clearance[side] = d;
        }
      }
    }
    // direction: the label line's edge nearest the label point
    const line = labelFeatures.find(x => x.properties.name === f.properties.name);
    let ew = true, bestD = Infinity;
    const coords = line.geometry.coordinates;
    for (let k = 1; k < coords.length; k++) {
      const a = coords[k - 1], b = coords[k];
      const x = (a[0] - lng) * MLNG, y = (a[1] - lat) * MLAT;
      const dx = (b[0] - a[0]) * MLNG, dy = (b[1] - a[1]) * MLAT;
      const L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, -(x * dx + y * dy) / L2)) : 0;
      const d = Math.hypot(x + dx * t, y + dy * t);
      if (d < bestD) { bestD = d; ew = Math.abs(dx) >= Math.abs(dy); }
    }
    const ns = clearance.north >= clearance.south ? 'north' : 'south';
    const ewSide = clearance.east >= clearance.west ? 'east' : 'west';
    const alongside = ew ? ns : ewSide;
    const alongAxis = ew ? ewSide : ns;
    out[f.properties.name] = ANCHOR_OF[clearance[alongAxis] > 2 * clearance[alongside] ? alongAxis : alongside];
  }
  return out;
}

// ---------- 2: the real 5W pack, whole and split builds ----------
// The stretch table is the app's REAL one: computeStretches extracted from
// app1.js. A hand-chained stand-in (each street's segments concatenated
// into one line) invents bridge geometry between disconnected segments
// and moved four streets' anchors - the live build's crosscheck caught
// it; no stand-in is trusted for the real pack again.
const app1 = read('parts/app1.js');
const csPrelude = [
  extractFn(app1, 'function distM('), app1.split('\n').find(l => l.startsWith('const jDistM')),
  extractFn(app1, 'function ptSegM('),
  extractFn(app1, 'function stitchRuns('),
  extractFn(app1, 'function projOnLine('),
  extractFn(app1, 'function sliceLine('),
  extractFn(app1, 'function finishJunctionCuts('),
  extractFn(app1, 'function computeStretches('),
].join('\n');
const realStretch = vm.runInNewContext(csPrelude + '\ncomputeStretches(ROADS);', { MLAT, MLNG, ROADS: pack.roads });
function splitStretch(split) {
  // the same geometry with three streets' first runs re-cut into two runs
  // at a shared vertex: run structure changes, the voted segments do not
  const S = {};
  for (const n of Object.keys(realStretch)) {
    const st = realStretch[n];
    if (!split.includes(n) || !st.runs.length) { S[n] = st; continue; }
    const line = [];
    st.runs[0].parts.forEach((p, i) => line.push(...(i === 0 ? p : p.slice(1))));
    const m = Math.floor(line.length * 0.4);
    S[n] = { ...st, runs: [{ parts: [line.slice(0, m + 1)] }, { parts: [line.slice(m)] }, ...st.runs.slice(1)] };
  }
  return S;
}
const VALID = ['top', 'bottom', 'left', 'right'];
for (const split of [[], ['Dianawood', 'Santa Barbara', 'Blackburn']]) {
  const world = makeWorld(pack.roads, split.length ? splitStretch(split) : realStretch, pack.spot);
  const want = independentAnchors(world, Object.keys(pack.roads));
  const bad = world.labelPointFeatures.filter(f => !VALID.includes(f.properties.anchor) || f.properties.anchor !== want[f.properties.name]);
  check(`2${split.length ? 'b' : 'a'}: every shipped anchor equals the independent rule (${split.length ? 'split-run' : 'whole'} build, ${world.labelPointFeatures.length} titles)`,
    world.labelPointFeatures.length === 34 && bad.length === 0);
  if (bad.length) console.log('  mismatches:', bad.map(f => `${f.properties.name}: shipped ${f.properties.anchor} vs rule ${want[f.properties.name]}`).join('; '));
}

// ---------- 3: named fixtures on the real pack ----------
// Clearances are the corrected sweep's (true geometry, metres N/S/E/W).
{
  const world = makeWorld(pack.roads, realStretch, pack.spot);
  const got = Object.fromEntries(world.labelPointFeatures.map(f => [f.properties.name, f.properties.anchor]));
  check('3a: Fifth reads west, its clearest alongside side (96 m; 48/20/85/96)', got['Fifth'] === 'right');
  check('3b: Boddy reads west, its clearest alongside side (112 m; Radley passes 24 m south)', got['Boddy'] === 'right');
  check('3c: Frankie (1.248 side-anchor case) reads its open west side (111 m)', got['Frankie'] === 'right');
  check('3d: Brownlee (1.248 side-anchor case) reads east, edging west 105 m to 104 m', got['Brownlee'] === 'left');
  check('3e: Bloomingdale (1.248 side-anchor case) reads east (128 m over 104 m west)', got['Bloomingdale'] === 'left');
  check('3f: Galloway reads south, its clearest alongside side (115 m over 106 m north)', got['Galloway'] === 'top');
}

// ---------- 4: synthetic packs, hand-derived ----------
const LAT0 = 43.8, LNG0 = -79.56;
const pt = (xM, yM) => [LAT0 + yM / MLAT, LNG0 + xM / MLNG];
const seg = (x0, y0, x1, y1) => { const pts = []; const m = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 20)); for (let k = 0; k <= m; k++) pts.push(pt(x0 + (x1 - x0) * k / m, y0 + (y1 - y0) * k / m)); return pts; };
function synth(defs) {
  const ROADS = {}, STRETCH = {};
  for (const [n, s] of Object.entries(defs)) { ROADS[n] = [s]; STRETCH[n] = { runs: [{ parts: [s] }] }; }
  const world = makeWorld(ROADS, STRETCH, {});
  return Object.fromEntries(world.labelPointFeatures.map(f => [f.properties.name, f.properties.anchor]));
}
{
  const loneEW = synth({ Solo: seg(0, 0, 400, 0) });
  check('4a: a lone east-west street takes north (the all-open tie keeps north)', loneEW['Solo'] === 'bottom');
  const loneNS = synth({ SoloNS: seg(0, 0, 0, 400) });
  check('4a2: a lone north-south street takes east (the all-open tie keeps east)', loneNS['SoloNS'] === 'left');
}
{
  const pair = synth({ Upper: seg(0, 10, 400, 10), Lower: seg(0, 0, 400, 0) });
  check('4b: parallel streets 10 m apart face away from each other', pair['Upper'] === 'bottom' && pair['Lower'] === 'top');
}
{
  const blocked = synth({ Main: seg(0, 0, 400, 0), NorthP: seg(0, 10, 400, 10), SouthP: seg(0, -12, 400, -12), EastB: seg(220, -50, 220, 50), WestB: seg(180, -50, 180, 50) });
  check('4c: along-axis at 20 m does NOT displace alongside at 12 m (20 is not over twice 12)', blocked['Main'] === 'top');
  // the parallels end at the point's longitude, so east is genuinely open
  const open = synth({ Main: seg(0, 0, 400, 0), NorthP: seg(0, 10, 200, 10), SouthP: seg(0, -12, 200, -12) });
  check('4d: along-axis fully open DOES displace alongside at 12 m', open['Main'] === 'left');
}
{
  // short stubs only, so no street's continuation votes into another side
  const nsCase = synth({ MainNS: seg(0, 0, 0, 400), WestP: seg(-8, 180, -8, 220), EastP: seg(30, 180, 30, 220), NorthB: seg(-10, 225, 10, 225), SouthB: seg(-10, -200, 10, -200) });
  check('4e: a north-south street\'s along-axis south (400 m) displaces alongside east (30 m)', nsCase['MainNS'] === 'top');
}

console.log(`proof-anchors: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
