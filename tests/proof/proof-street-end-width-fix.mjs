import { readFileSync } from 'node:fs';

// Street-end width fix proof (fix_id: street-end-width-fix, 2026-11-15).
//
// The defect (Andrew's report, measured in work/street-end-gaps): a
// terminating street's end is cut FLUSH to the crossing street's paint
// edge — clipEndAtJunction places the end cap exactly SURF_HALF (4.95 m)
// from the crossing centreline, the designed edge of a 9.9 m surface.
// But the width curves drew the surface far below its geographic width
// at close zoom (8.4 m at z16, 6.2 at z17, 4.9 at z18, 3.9 at z19 on the
// app's true map scale), so the crossing paint AS DRAWN stopped short
// of the edge the cut assumed and every terminating end hung gapped
// over bare asphalt — ~1.9 m at z17, ~2.5 m at z18, ~3.0 m at z19, and
// none zoomed out (drawn >= designed at z14-15). Completed-street bands
// had the same family of defect (flush cut at BAND_HALF 7.2 m against
// a 14.4 m band drawn at 7.1 m at z17; the BANDW z15 stop drew 7.8 m).
//
// The fix moves WIDTH STOPS ONLY — no geometry: surfW z16-19 and the
// t1-casing curve now hold the drawn surface at the geographic 9.9 m,
// BANDW holds the drawn band at 14.4 m from z15 up, and BANDCASE keeps
// the shipped casing rim over BANDW at every stop (z15 = 8.04 keeps
// the 2.5 spec rim over the corrected BANDW z15 — the candidate's 10.8
// had no derivation and would have fattened the z15 casing rim to
// 5.26 spec; check 6 pins the ruled value).
//
// This proof evaluates the four shipped curves from parts/engine.js
// exactly as the app builds them (scaleW multiplies the width stops by
// WIDTH_K) and converts px to metres on the Web-Mercator scale at
// Route 5W's latitude (43.81 N; the investigation measured 9.24 px/m
// at z19 live, the formula gives 9.28 — tolerances absorb the delta).
//
//   check 1-2: drawn surface == 9.9 m at z16-19, and its half-width
//              meets the 4.95 m flush cut at z17-19 (the gap property
//              itself: half-width below 4.95 IS the end gap).
//   check 3:   drawn band == 14.4 m at z15-19, half-width meets the
//              7.2 m flush cut at z17-19.
//   check 4-5: casing rims (t1-casing over surfW; BANDCASE over BANDW)
//              equal the shipped rims at every stop — the fix widens
//              the fills, never the rims' relationship to them.
//   check 6:   BANDCASE z15 rim is the ruled 2.5 spec (8.04 stop).
//   check 7:   surfW z14 stop untouched (Andrew's zoomed-out look).
//
// On unmodified main checks 1-3 FAIL (the shipped drawn widths) and
// check 6 fails (the z15 stop is the shipped 5.5, not the ruled 8.04);
// checks 4-5 and 7 pass there — they pin the rims and the z14 stop
// against drift in either direction. With the fix all checks pass.
//
// Run from the repo root:  node tests/proof/proof-street-end-width-fix.mjs

const src = readFileSync('parts/engine.js', 'utf8');

let failures = 0;
function ok(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
  if (!cond) failures++;
}

// WIDTH_K from source (the scaleW multiplier).
const wkM = src.match(/const WIDTH_K = ([\d.]+);/);
if (!wkM) { console.error('FAIL: WIDTH_K not found'); process.exit(2); }
const WIDTH_K = parseFloat(wkM[1]);

// Extract a scaleW([...]) curve's stop pairs [zoom, rawWidth] starting
// the search at `anchor` (first occurrence at or after it).
function curveStops(anchor) {
  const ai = src.indexOf(anchor);
  if (ai < 0) throw new Error('anchor not found: ' + anchor);
  const si = src.indexOf('scaleW([', ai);
  const ei = src.indexOf('])', si);
  const body = src.slice(si, ei);
  const nums = [...body.matchAll(/-?\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]));
  // body is: scaleW(['interpolate', ['linear'], ['zoom'], z0, w0, z1, w1, ...)
  const pairs = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pairs.push([nums[i], nums[i + 1]]);
  return pairs;
}
// Evaluate a stop list at a zoom: scaleW applied (width x WIDTH_K),
// linear interpolation between stops, clamped outside.
function widthAt(pairs, z) {
  const pts = pairs.map(([zz, w]) => [zz, w * WIDTH_K]);
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [z0, w0] = pts[i], [z1, w1] = pts[i + 1];
    if (z <= z1) return w0 + (w1 - w0) * ((z - z0) / (z1 - z0));
  }
  return pts[pts.length - 1][1];
}

const surfW = curveStops('const surfW = ');
const bandW = curveStops('const BANDW = ');
const bandCase = curveStops('const BANDCASE = ');
const casing = curveStops("'t1-casing', 'centres'");

// Web-Mercator metres per pixel at latitude 43.81 (Route 5W), 512px tiles.
const M_PER_PX = z => (40075016.686 * Math.cos(43.81 * Math.PI / 180)) / (512 * Math.pow(2, z));
const drawnM = (pairs, z) => widthAt(pairs, z) * M_PER_PX(z);

// Check 1: drawn surface holds the geographic 9.9 m at z16-19.
for (const z of [16, 17, 18, 19]) {
  const d = drawnM(surfW, z);
  ok(`surfW drawn width at z${z} ~= 9.9 m`, Math.abs(d - 9.9) <= 0.3, d.toFixed(2) + ' m');
}
// Check 2: the meeting property — drawn surface half-width reaches the
// 4.95 m flush-cut edge at z17-19 (below it, the difference is the gap).
for (const z of [17, 18, 19]) {
  const half = drawnM(surfW, z) / 2;
  ok(`surface half-width at z${z} meets the 4.95 m end cut`, half >= 4.95 - 0.05, half.toFixed(2) + ' m');
}
// Check 3: drawn band holds 14.4 m at z15-19; half meets the 7.2 m cut.
for (const z of [15, 16, 17, 18, 19]) {
  const d = drawnM(bandW, z);
  ok(`BANDW drawn width at z${z} ~= 14.4 m`, Math.abs(d - 14.4) <= 0.45, d.toFixed(2) + ' m');
}
for (const z of [17, 18, 19]) {
  const half = drawnM(bandW, z) / 2;
  ok(`band half-width at z${z} meets the 7.2 m end cut`, half >= 7.2 - 0.07, half.toFixed(2) + ' m');
}
// Check 4: t1-casing rim over surfW equals the shipped rim at every stop
// (shipped spec rims 2.0/2.5/3.0/3.5/4.0 at z14/16/17/18/19, x WIDTH_K px).
const SHIP_CASING_RIM = { 14: 2.0, 16: 2.5, 17: 3.0, 18: 3.5, 19: 4.0 };
for (const [z, rim] of Object.entries(SHIP_CASING_RIM)) {
  const got = widthAt(casing, +z) - widthAt(surfW, +z);
  ok(`t1-casing rim at z${z} == shipped`, Math.abs(got - rim * WIDTH_K) <= 0.3, got.toFixed(2) + ' px vs ' + (rim * WIDTH_K).toFixed(2));
}
// Check 5: BANDCASE rim over BANDW equals the shipped rim at every stop
// (shipped spec rims 2.5/3/4/5/6 at z15/16/17/18/19, x WIDTH_K px).
const SHIP_BANDCASE_RIM = { 15: 2.5, 16: 3.0, 17: 4.0, 18: 5.0, 19: 6.0 };
for (const [z, rim] of Object.entries(SHIP_BANDCASE_RIM)) {
  const got = widthAt(bandCase, +z) - widthAt(bandW, +z);
  ok(`BANDCASE rim at z${z} == shipped`, Math.abs(got - rim * WIDTH_K) <= 0.3, got.toFixed(2) + ' px vs ' + (rim * WIDTH_K).toFixed(2));
}
// Check 6: the ruled BANDCASE z15 stop — raw stop value is 8.04, i.e.
// the z15 rim is exactly the shipped 2.5 spec over the corrected BANDW.
const z15 = bandCase.find(([z]) => z === 15);
ok('BANDCASE z15 stop is the ruled 8.04', !!z15 && Math.abs(z15[1] - 8.04) < 1e-9, z15 ? String(z15[1]) : 'missing');
// Check 7: surfW z14 stop untouched (2.5 raw = 3.75 px assembled).
const s14 = widthAt(surfW, 14);
ok('surfW z14 stop unchanged (3.75 px)', Math.abs(s14 - 3.75) < 1e-9, s14.toFixed(3) + ' px');

// Check 8 (Codex P2 on PR #81, fixed in-round): the map-tap tolerance
// must follow the widest paint. The click handler's rule since Beta
// 1.181 is "a tap anywhere on the paint still selects instead of
// deselecting", implemented as a fixed 24 px — which the widened paint
// outgrows at z18-19 (band + casing half-width 37 / 71 px). The engine
// now owns the tolerance: GLP.tapTolPx(z) = max(24, BANDCASE(z)/2 + 2),
// and the handler reads it. Pin the formula's presence and its numeric
// coverage from the parsed curve: at every zoom the tolerance covers
// the widest paint's half-width with margin, and at z17 and below it
// is exactly the shipped 24 (the paint there is narrower than the
// floor, so low-zoom tap behaviour is unchanged).
const eng = src;
const fnM = eng.match(/function tapTolPx\(z\) \{[^}]*\}/);
ok('engine defines tapTolPx from BANDCASE with the 24 px floor',
  !!fnM && fnM[0].includes('Math.max(24') && fnM[0].includes('BANDCASE') && /\/ 2 \+ 2/.test(fnM[0]),
  fnM ? fnM[0].slice(0, 80) + '...' : 'missing');
ok('GLP exposes tapTolPx', /return \{[^}]*tapTolPx/.test(eng), '');
const app2 = readFileSync('parts/app2.js', 'utf8');
ok('click handler reads GLP.tapTolPx', app2.includes('GLP.tapTolPx(map.getZoom())'), '');
for (const z of [14, 15, 16, 17, 18, 19]) {
  const widestHalf = widthAt(bandCase, z) / 2; // px, assembled scale
  const tol = Math.max(24, widestHalf + 2);
  ok(`tap tolerance at z${z} covers the widest paint`, tol >= widestHalf + 2 - 1e-9 && (z > 17 || tol === 24),
    'tol ' + tol.toFixed(1) + ' px vs paint half ' + widestHalf.toFixed(1) + ' px');
}

console.log(failures === 0 ? 'ALL CHECKS PASS' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
