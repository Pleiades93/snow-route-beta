// proof-anchors.mjs - pins centred title placement, the flags.js switch
// gate and the label points, so naming cannot silently regress.
// drive219 grades the live behaviour.
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const engine = read('parts/engine.js');
const data = read('parts/data.js');
const app1 = read('parts/app1.js');
const app2 = read('parts/app2.js');

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
const partFiles = readdirSync(new URL('parts/', root)).filter(f => f.endsWith('.js'));
const parts = Object.fromEntries(partFiles.map(f => [f, read('parts/' + f)]));
const allParts = Object.values(parts).join('\n');

// ---------- 1: the centre spec and the switch ----------
check('1a: the side machinery is gone - no assignAnchors, no titleDirections, no stored anchor read anywhere in parts',
  !allParts.includes('assignAnchors') && !allParts.includes('titleDirections') && !allParts.includes("'text-anchor': ['get', 'anchor']"));
check('1b: the title spec is the centre literal and no variable-anchor or radial offset survives in the engine',
  engine.includes("'text-anchor': 'center', 'text-radial-offset': 0") && !engine.includes('text-variable-anchor') && !engine.includes("'text-radial-offset': 0.8"));
check('1c: the switch gates both title entry points - the labelpts source and the tier layers - behind one typeof-guarded read',
  engine.includes("const titlesOn = () => typeof ROUTE_TITLES_ON !== 'undefined' && !!ROUTE_TITLES_ON;") &&
  engine.includes("if (titlesOn()) GLM.addSource('labelpts', { type: 'geojson', data: LABELPTS });") &&
  engine.includes('if (titlesOn()) for (let t = 1; t <= 4; t++)'));
{
  let flags = '';
  try { flags = read('flags.js'); } catch (e) { flags = ''; }
  const assemble = read('scripts/assemble.py');
  check('1d: flags.js at the repo root carries the shipped ON default (Beta 1.294: Andrew ships the handover turned on; the 1.293 OFF default is superseded), and assembly inlines it into the bundle',
    flags.includes('var ROUTE_TITLES_ON = true;') && assemble.includes('FLAGS = ROOT / "flags.js"') && assemble.includes('FLAGS.read_bytes()'));
}

// ---------- 2: the label points on the real pack ----------
// The stretch table is the app's REAL one: computeStretches extracted
// from app1.js (the label round's rig lesson - no hand-chained stand-in
// is trusted for the real pack).
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
    extractFn(engine, 'function boundaryRecAt('),
  ].join('\n');
  return vm.runInNewContext(prelude + '\nbuildEngineGeometry();\n({ GEO, TOPO, labelFeatures, labelPointFeatures });', { H });
}
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
{
  const world = makeWorld(pack.roads, realStretch, pack.spot);
  const feats = world.labelPointFeatures;
  check('2a: the real pack builds 34 label points, each carrying its name, length and tier (no anchor property - the side data is deleted, not dormant)',
    feats.length === 34 && feats.every(f => f.properties.name && f.properties.len > 0 && [1, 2, 3, 4].includes(f.properties.tier) && !('anchor' in f.properties)));
  const H = { ptSegM(p, a, b) { const px = p[1] * MLNG, py = p[0] * MLAT, ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)); return Math.hypot(px - (ax + t * vx), py - (ay + t * vy)); } };
  const distToStreet = (f) => {
    const p = [f.geometry.coordinates[1], f.geometry.coordinates[0]]; // GJ [lng,lat] back to [lat,lng]
    const st = world.GEO[f.properties.name].stitched;
    let d = Infinity;
    for (let k = 1; k < st.length; k++) d = Math.min(d, H.ptSegM(p, st[k - 1], st[k]));
    return d;
  };
  const offStreet = feats.filter(f => f.properties.name !== 'Fifth').filter(f => distToStreet(f) > 1);
  check('2b: every label point sits ON its own street (within 1 m of its stitched line) - centre placement puts the name over the road only if the point is on the road | off-street: ' + offStreet.map(f => f.properties.name + ' ' + distToStreet(f).toFixed(1) + 'm').join('; '),
    offStreet.length === 0);
  const fifth = feats.find(f => f.properties.name === 'Fifth');
  check('2c: Fifth\'s point keeps its nudge - the only point off its own line, by metres (the Round 35 push away from the Greenpark junction), distance ' + (fifth ? distToStreet(fifth).toFixed(1) : 'n/a') + ' m',
    !!fifth && distToStreet(fifth) > 2 && distToStreet(fifth) < 60);
}

// ---------- 3: the structural ban (the label round's deletion contract) ----------
// After the title layers are added, no code writes a title layer's
// visibility or opacity, and the labelpts source is never torn down:
// the cure that used to do both is deleted, and these pins keep the
// deletion structural rather than conventional. The live behaviour is
// graded by drive219 (source identity, visibility, presence lanes).
// KNOWN LIMIT, flagged not fixed: a theme swap calls setStyle, which
// recreates the whole style - labelpts included - so literal source
// identity does not survive a swap. The placement survives it as layer
// spec (the rebuilt stack re-adds the same centre spec), which is the
// half Andrew's invariant needs; drive219's phase B grades that boundary.
check('3a: the deleted cure/hold machinery occurs in NO part (armTitleRePlace, rePlaceTitles, titleCureRelease, titleGuardArmed, nameHoldSet, nameHoldApply, nameFade)',
  !allParts.includes('armTitleRePlace') && !allParts.includes('rePlaceTitles') &&
  !allParts.includes('titleCureRelease') && !allParts.includes('titleGuardArmed') &&
  !allParts.includes('nameHoldSet') && !allParts.includes('nameHoldApply') && !allParts.includes('nameFade'));
check('3b: labelpts is created exactly once and never removed in any part',
  (engine.split("addSource('labelpts'").length - 1) === 1 && !allParts.includes("removeSource('labelpts')"));
check('3c: no part writes a title layer\'s properties by literal id (the specs in addStack are the only seat; the create backdrop\'s recorded-pair restore is the one sanctioned visibility writer and it names no title id literally)',
  !/set(?:Layout|Paint)Property\('streetnamespt/.test(allParts));

// ---------- (4) the handover (Beta 1.294) ----------
// Andrew's decision of 2026-11-24: the titles name the route at far
// zooms and fade out across 15-16; route-names-only clones of the two
// basemap road-label layers fade in across the same band and name the
// route streets above it. The zoom behaviour lives in the layer specs
// (a spec value is not a code write - section 3's pins stand).
check('4a: the title spec fades out across 15-16 and is capped at maxzoom 16',
  engine.includes("'text-opacity': ['interpolate', ['linear'], ['zoom'], 12.59, 0, 12.62, 1, 15, 1, 16, 0]") &&
  engine.includes('minzoom: PT_MIN[t - 1], maxzoom: 16, filter:'));
check('4b: the clones are built only in the handover state (titles on, not creating), from zoom 15, with the spec fade in across 15-16',
  app2.includes("const handover = !titlesOff && !(typeof creating !== 'undefined' && creating);") &&
  app2.includes('clone.id = cloneId; clone.minzoom = 15; clone.maxzoom = 24;') &&
  app2.includes("'text-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, 1]"));
check('4c: the clone filter is route-names only (the positive name test, never the exclusion)',
  app2.includes("const routeCF = ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]];") &&
  app2.includes('const targetCF = baseCF ? [\'all\', baseCF, routeCF] : routeCF;'));
check('4d: the basemap repetition is 250, one owned write in the label pass',
  (app2.split("setL(L.id, 'symbol-spacing', 250);").length - 1) === 1 &&
  !app2.includes("'symbol-spacing', 500"));

console.log(`proof-anchors: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
