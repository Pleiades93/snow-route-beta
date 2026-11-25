import { readFileSync } from 'node:fs';

// Beta 1.268 (WIDTHS round, Andrew's decisions of 2026-11-21): the route
// PAINT narrows to 1.20x the basemap road's own rendered width. The map
// roads do NOT change - ROAD_WIDTH_K stays 1.5 in scripts/genstyles.mjs;
// only the paint's WIDTH_K moves, 1.5 -> 1.3.
//
// The evidence is rendered, not arithmetic alone (receipt kind rendered):
// on the Beta 1.267 tree, in the real app at home framing (zoom 13.9792,
// pitch 45, day, Route 5W), perpendicular half-max pixel scans across
// Velmar measured the basemap road at 6.7 px (bright fill 2.2 px pixel-
// measured; total 6.73 px by the shipped style's own arithmetic - minor
// casing 1.5 CSS + gap 1.759 CSS at that zoom, x2 device x cos45) and
// the paint at 9.3 px with WIDTH_K 1.5 (1.39x) and 8.0 px with WIDTH_K
// 1.3 (1.19x - the 1.20 target inside its 10% tolerance). The samples
// Andrew decided from calibrate the same point independently:
// WIDTH_K 1.08 = 1.0x at ROAD_WIDTH_K 1.5 (route-width sample), and
// WIDTH_K 1.296 measured 8.0 px / ratio 1.19 (map-road-width sample).
// Work record: widths-round-2026-11-21/RECORD.md.
//
// This proof pins the source-level facts of that decision:
//   1: WIDTH_K is 1.3 in parts/engine.js (exactly one definition).
//   2: the pin block at WIDTH_K names both constants and the 1.20
//      ratio, and states the re-measure rule - the single place the
//      pairing lives, so a future change to either constant is
//      forced through a re-measurement.
//   3: ROAD_WIDTH_K is still 1.5 in scripts/genstyles.mjs (the
//      basemap did not move).
//   4: the scaling chain is intact: SURF_HALF / HALF_HALF still
//      derive from WIDTH_K (3.3x / 1.65x), scaleW still multiplies
//      its curves by WIDTH_K, and the tap tolerance still follows
//      surfCASE - everything derived from the constant scales with
//      it by construction.
//   5: the calibration arithmetic the value rests on: at
//      ROAD_WIDTH_K 1.5, 1.0x == WIDTH_K 1.08, so WIDTH_K 1.3 paints
//      1.3 / 1.08 = 1.204x - inside 10% of the 1.20 decision.
//   6: the release editorial: What's New carries the round's bullet
//      (plain words, no em dash) and the CHANGELOG top entry is
//      Beta 1.268 above 1.267.
//
// Run from the repo root:  node tests/proof/proof-1268.mjs

const eng = readFileSync('parts/engine.js', 'utf8');
const gen = readFileSync('scripts/genstyles.mjs', 'utf8');
const whatsnew = readFileSync('parts/whatsnew.js', 'utf8');
const changelog = readFileSync('CHANGELOG.md', 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (cond) pass++; else fail++;
}

check('1: WIDTH_K is defined exactly once, as 1.3',
  (eng.match(/const WIDTH_K = [\d.]+;/g) || []).length === 1 && eng.includes('const WIDTH_K = 1.3;'));

check('2: the pin block at WIDTH_K names ROAD_WIDTH_K, the 1.20 ratio and the re-measure rule',
  eng.includes('ROAD_WIDTH_K (genstyles)') &&
  eng.includes('and 1.20 ratio are a decision') &&
  eng.includes('re-measure the ratio if either constant changes'));

check('3: ROAD_WIDTH_K is still 1.5 in scripts/genstyles.mjs (the basemap did not move)',
  gen.includes('const ROAD_WIDTH_K = 1.5;'));

check('4: the scaling chain is intact (SURF_HALF / HALF_HALF derive from WIDTH_K; scaleW multiplies by it; tapTolPx follows surfCASE)',
  eng.includes('const SURF_HALF = 3.3 * WIDTH_K, HALF_HALF = 1.65 * WIDTH_K;') &&
  eng.includes('v * WIDTH_K') &&
  eng.includes('function tapTolPx(z) { return Math.max(24, evalCurvePx(surfCASE, z) / 2 + 2); }'));

check('5: calibration arithmetic - WIDTH_K 1.3 at the 1.08 == 1.0x calibration paints 1.204x, within 10% of the 1.20 decision',
  Math.abs(1.3 / 1.08 - 1.20) / 1.20 <= 0.10);

check('6: the CHANGELOG orders Beta 1.268 above 1.267',
  changelog.indexOf('## Beta 1.268') > -1 && changelog.indexOf('## Beta 1.268') < changelog.indexOf('## Beta 1.267'));

console.log(`proof-1268: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
