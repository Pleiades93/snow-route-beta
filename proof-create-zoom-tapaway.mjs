import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Create zoom-proportionate paint + trim tap-away proof
// (fix_id: create-zoom-tapaway, Beta 1.210, 2026-11-15). Two
// Andrew-directed fixes from his Beta 1.209 phone session:
//
//   S1 - the create flow's selection paint (crDraftCase 12.75 px,
//        9.75 px since Beta 1.216 - the casing anchor was halved to
//        variant B; the curve behaviour pinned here is unchanged),
//        crDraftLine 6.75 chosen / crDraftLineDim 4.5 unchosen px, the
//        crGlow stack) wore CONSTANT px
//        widths, so its drawn width in metres doubled with every zoom
//        level down: at z13 the casing drew ~88 m and nearby picks
//        melted into one blob on his zoomed-out screen. The widths now
//        ride crZoomW: the anchor value at z15 and above (the picking
//        zooms are pixel-identical to 1.209) and half the px per level
//        below z15, holding the z15 metre width down the range - the
//        main map's constant-metres principle. crDraftHit (the
//        invisible 24 px tap target) deliberately does NOT scale:
//        picking keeps its generous reach at every zoom.
//   S2 - the sector trim could be exited without saving only via its
//        Cancel button. A map tap during trim that resolves to no
//        sector of the trim street (crSectorTap answers false) is now
//        a tap-away: crMapTap runs the whole existing crCancelSectors
//        path (snapshot restored, session closed). Sector taps still
//        toggle; card/chrome taps are DOM and never reach the map; a
//        drag/pan never produces the map click at all (MapLibre's
//        click tolerance), so panning cannot cancel a trim.
//
// On unmodified main (Beta 1.209): crZoomW does not exist (S1 checks
// fail), the layer widths are bare constants (wiring checks fail),
// crSectorTap returns undefined on a miss (S2 behaviour checks fail)
// and crMapTap's session branch never calls crCancelSectors (wiring
// check fails). With the fix all checks pass.
//
// Run from the repo root:  node tests/proof/proof-create-zoom-tapaway.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let depth = 0, j = src.indexOf('{', i);
  const start = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return null;
}
// Evaluate a MapLibre interpolate(['linear'],['zoom'],...) expression.
function evalW(expr, z) {
  if (typeof expr === 'number') return expr;
  const stops = expr.slice(3); // after 'interpolate', ['linear'], ['zoom']
  const pts = [];
  for (let i = 0; i + 1 < stops.length; i += 2) pts.push([stops[i], stops[i + 1]]);
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [z0, w0] = pts[i], [z1, w1] = pts[i + 1];
    if (z <= z1) return w0 + (w1 - w0) * ((z - z0) / (z1 - z0));
  }
  return pts[pts.length - 1][1];
}
// The repo's own ruler (proof-street-end-width-fix): Web-Mercator
// metres per pixel at Route 5W's latitude, 512 px tiles.
const M_PER_PX = z => (40075016.686 * Math.cos(43.81 * Math.PI / 180)) / (512 * Math.pow(2, z));

const pick = readFileSync('parts/create-pick.js', 'utf8');

// ---------- S1: the crZoomW curve ----------
const crZoomWSrc = extractFn(pick, 'crZoomW');
check('S1: crZoomW exists in create-pick.js', !!crZoomWSrc);
let crZoomW = null;
if (crZoomWSrc) { const ctx = {}; vm.createContext(ctx); vm.runInContext(crZoomWSrc + '\nthis.crZoomW = crZoomW;', ctx); crZoomW = ctx.crZoomW; }
if (crZoomW) {
  for (const [label, w] of [['casing', 9.75], ['chosen line', 6.75], ['unchosen line', 4.5]]) { // Beta 1.211 re-derivation: the 'glow outer' entry retired with the glow stack itself - the trim glow is a metric shader mesh now and wears no px width for this curve to hold (its metre construction is pinned by proof-shader-glow-round.mjs). Beta 1.216 re-derivation: the casing anchor 12.75 -> 9.75 (variant B, Andrew's pick) - the chosen/unchosen line anchors are unchanged from 1.209, the casing now rides its 1.216 anchor
    const e = crZoomW(w);
    check(`S1: ${label} px at z15/17/19 equals its anchor (${w})`,
      evalW(e, 15) === w && evalW(e, 17) === w && evalW(e, 19) === w,
      `z15=${evalW(e, 15)} z17=${evalW(e, 17)} z19=${evalW(e, 19)}`);
    check(`S1: ${label} halves per level below z15 (z14=${w / 2}, z12=${w / 8}, z10=${w / 32})`,
      Math.abs(evalW(e, 14) - w / 2) < 1e-9 && Math.abs(evalW(e, 12) - w / 8) < 1e-9 && Math.abs(evalW(e, 10) - w / 32) < 1e-9,
      `z14=${evalW(e, 14)} z12=${evalW(e, 12)} z10=${evalW(e, 10)}`);
    const m15 = evalW(e, 15) * M_PER_PX(15);
    const worst = Math.max(...[14, 13, 12, 11, 10].map(z => Math.abs(evalW(e, z) * M_PER_PX(z) - m15) / m15));
    check(`S1: ${label} drawn width holds its z15 metres (${m15.toFixed(1)} m) down to z10 within 2%`,
      worst <= 0.02, 'worst deviation ' + (worst * 100).toFixed(2) + '%');
    // The defect this fixes, stated as a check on the OLD shape: a
    // constant w px would draw 32x the metres at z10 - the fixed curve
    // must NOT (its z10 metres stay ~1x).
    check(`S1: ${label} at z10 does not blob (drawn metres < 1.5x its z15 metres, vs 32x for the old constant)`,
      evalW(e, 10) * M_PER_PX(10) < 1.5 * m15, (evalW(e, 10) * M_PER_PX(10)).toFixed(1) + ' m');
  }
}
// ---------- S1: layer wiring ----------
check('S1: crDraftCase width rides crZoomW(9.75)', pick.includes("'line-width': crZoomW(9.75)"));
check('S1: crDraftLine (chosen, not active) width rides crZoomW(6.75)', pick.includes("id: 'crDraftLine', type: 'line', source: DRAFT_SRC, filter: ['all', ['==', ['get', 'chosen'], 1], ['!=', ['get', 'active'], 1]]") && pick.includes("'line-width': crZoomW(6.75)"));
check('S1: crDraftLineDim (unchosen layer) width rides crZoomW(4.5)', pick.includes("id: 'crDraftLineDim', type: 'line', source: DRAFT_SRC, filter: ['!=', ['get', 'chosen'], 1]") && pick.includes("'line-width': crZoomW(4.5)"));
check('S1: the unchosen layer wears the flat grey #b9c1cb again (Beta 1.223 - the corrected model reverts the Beta 1.221 muted-colour paint for removed sectors; the engine mute no longer paints any draft layer)', pick.includes("'line-color': '#b9c1cb'") && !pick.includes("GLP.mute('#ffc233')"));
check('S1: the chosen-not-active layer wears the GENTLE mute (saturation x0.65: gold #dbb457, red #d2647e) and the active layer the full colours (Beta 1.223)', pick.includes("'line-color': ['case', ['==', ['get', 'primary'], 1], '#dbb457', '#d2647e']") && pick.includes("id: 'crDraftLineActive', type: 'line', source: DRAFT_SRC, filter: ['all', ['==', ['get', 'chosen'], 1], ['==', ['get', 'active'], 1]]") && pick.includes("'line-color': ['case', ['==', ['get', 'primary'], 1], '#ffc233', '#ef476f']"));
// Regression guard for the defect the 1.210 rendered QA caught: a zoom
// curve nested inside a case as a line-width makes MapLibre silently
// drop the whole layer (addLayer does not throw; the layer never
// enters the style and the paint simply never renders). No line-width
// in the create flow may wear that shape again.
check('S1: no line-width nests a curve inside a case (MapLibre silently drops such a layer)', !/'line-width': \['case'/.test(pick));
// Beta 1.211 re-derivation (TEST, deliberate scope replacement): through
// 1.210 the trim glow was a five-layer line stack whose widths rode this
// curve and whose anchor table was pinned here. The glow is now the
// crGlowShader custom layer (a metric mesh - it scales with the map by
// construction, the property this file's curve gave the stack by hand).
// The invariant that survives: no crZoomW-fed glow wiring remains, and
// the shader layer + its ring table are present (mesh pins live in
// proof-shader-glow-round.mjs).
check('S1: the glow no longer rides crZoomW (shader mesh since 1.211)', !pick.includes('crZoomW(s[1])') && !pick.includes('crGlow4'));
check('S1: the shader glow layer and its metre ring table are present', pick.includes("id: 'crGlowShader', type: 'custom'") && pick.includes('const CR_GLOW_RINGS = [-20, -13, -9.9, -4.95, 0, 4.95, 9.9, 13, 20];'));
check('S1: crDraftHit stays the constant 24 px tap target (no crZoomW)', /crDraftHit'[^;]*'line-width': 24/.test(pick));

// ---------- S2: crSectorTap's return contract, behaviourally ----------
const sectorTapSrc = extractFn(pick, 'crSectorTap');
const featDistMSrc = extractFn(pick, 'crFeatDistM');
const featDistPxSrc = extractFn(pick, 'crFeatDistPx');
check('S2: crSectorTap / crFeatDistM / crFeatDistPx extractable', !!(sectorTapSrc && featDistMSrc && featDistPxSrc));
if (sectorTapSrc && featDistMSrc && featDistPxSrc) {
  // A trim street along one east-west line: three parts ([lat, lng]).
  const parts = [
    [[43.802, -79.574], [43.802, -79.571]],
    [[43.802, -79.571], [43.802, -79.568]],
    [[43.802, -79.568], [43.802, -79.565]],
  ];
  const toggles = [];
  const ctx = {
    MLAT: 111320, MLNG: 80386,
    CR_TAP_BOXES: [12, 20],
    crSectorSession: { street: 'Test Street', snapshot: null },
    draft: { roads: { 'Test Street': parts.map(p => p.slice()) }, sectors: {} },
    crStreetParts: () => ({ parts, total: 720 }),
    crToggleSector: (name, idx) => { toggles.push([name, idx]); },
    map: {
      project: ([lng, lat]) => ({ x: lng * 80386, y: lat * 111320 }), // 1 px ~ 1 m at the test latitude
      queryRenderedFeatures: () => [], // the renderer answers nothing: the geometry fallback decides
    },
  };
  vm.createContext(ctx);
  vm.runInContext(featDistMSrc + '\n' + featDistPxSrc + '\n' + sectorTapSrc + '\nthis.crSectorTap = crSectorTap;', ctx);
  // A tap ON part 1 (its midpoint) toggles it and answers true.
  toggles.length = 0;
  const onTap = ctx.crSectorTap({ lng: -79.5695, lat: 43.802 });
  check('S2: a tap on a sector toggles it and answers true', onTap === true && toggles.length === 1 && toggles[0][1] === 1,
    'returned ' + onTap + ', toggles ' + JSON.stringify(toggles));
  // A tap honestly away (300 m north of the street) resolves to no
  // sector: no toggle, answers false - the tap-away signal.
  toggles.length = 0;
  const awayTap = ctx.crSectorTap({ lng: -79.5695, lat: 43.802 + 300 / 111320 });
  check('S2: a tap 300 m away toggles nothing and answers false', awayTap === false && toggles.length === 0,
    'returned ' + awayTap + ', toggles ' + JSON.stringify(toggles));
  // A tap 30 m off the line: outside the 20 px retry reach - also a
  // tap-away, not a toggle (the fallback's pixel cap).
  toggles.length = 0;
  const nearMiss = ctx.crSectorTap({ lng: -79.5695, lat: 43.802 + 30 / 111320 });
  check('S2: a tap 30 m off the line (beyond the retry reach) answers false', nearMiss === false && toggles.length === 0,
    'returned ' + nearMiss + ', toggles ' + JSON.stringify(toggles));
}
// ---------- S2: wiring - the miss runs the whole existing Cancel path ----------
check('S2: crMapTap routes a sector-tap miss to crCancelSectors',
  pick.includes('if (!crSectorTap(e.lngLat)) crCancelSectors();'));
check('S2: crCancelSectors still restores the entry snapshot (the path is reused whole, not paralleled)',
  pick.includes('draft.sectors[s] = crSectorSession.snapshot.slice()') && pick.includes("addEventListener('click', () => crCancelSectors())"));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
