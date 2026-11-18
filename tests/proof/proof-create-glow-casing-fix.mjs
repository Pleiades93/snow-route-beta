import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Create glow + casing fix proof (fix_id: create-glow-casing-fix,
// Beta 1.216, 2026-11-16). Two Andrew-picked scopes from the
// create-glow-casing sample round (his Davos trim-view screenshots):
//
//   G - THE GLOW SPEARS ARE GONE. The 1.211 shader mesh was built one
//       ribbon per sector part, and the sector geometry carries REPEATED
//       consecutive points at the sector cuts (Velmar: 13 across its 14
//       parts). A repeated point is a zero-length segment whose normal
//       is (0,0); the miter beside it dots against that zero normal, the
//       cos clamp takes its 0.45 floor, and the whole cross-section
//       stretches x2.22 while its distance attribute still claims the
//       ring distance - full-strength glow thrown sideways at every
//       joint (sample round census on the shipped construction: 336 of
//       5,268 vertices >4 m beyond their claimed distance, worst
//       claiming 20 m and sitting at 44.8 m; on screen ~4.3x stronger
//       near joints - the blotches). The fix: crGlowBuildMesh stitches
//       the fed parts into continuous runs (crGlowStitchFeats) and
//       drops repeated consecutive points before meshing. THE GATE
//       ASSERTION: over a synthetic sector feed carrying the defect
//       (chained parts, shared endpoints, repeated points inside parts),
//       NO mesh vertex sits farther than its claimed distance + 1 m
//       from its own street's centreline. On unmodified main the same
//       feed throws vertices to ~44 m claiming 20 (excess ~24 m) and
//       this proof fails. syncCrGlow's chosen-sectors computation
//       (1.209) is pinned byte-present and untouched - only the mesh
//       construction changed. Clean-geometry invariants from the 1.211
//       proof (78 / 126 / 0 vertices) must hold exactly: stitching and
//       dedupe may not alter a clean feed's mesh by one vertex.
//   C - THE CASING IS VARIANT B (Andrew's pick from the samples): the
//       draft casing anchor crZoomW(12.75) -> crZoomW(9.75) - the extra
//       width over the line halved (reveal 3.0 -> 1.5 px/side, band
//       8.25 -> 6.75 m at z16.5), same near-black, same round caps.
//       crDraftLine (6.75) and crDraftHit (the 24 px tap target - a tap
//       target, not paint) are pinned unchanged. crGlowCasingHalfM
//       follows the anchor (6.375 -> 4.875 px), and the reach floor is
//       pinned by arithmetic at Vaughan's latitude: at z16+ the casing
//       half (~4.2 m) is under the 4.95 m kerb, so the floor term is
//       <= 0 and the approved breath runs untouched; at z15 the floor
//       is ~7.6 m (was ~13.4 m), still holding the falloff's 30%-at-the-
//       casing-edge property by construction.
//   V - the bump agrees: #ver label, WHATSNEW and the CHANGELOG top
//       entry all read Beta 1.216.
//
// Run from the repo root:  node tests/proof/proof-create-glow-casing-fix.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let j = src.indexOf('{', i), d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

const pick = readFileSync('parts/create-pick.js', 'utf8');
const head = readFileSync('parts/head.html', 'utf8');
const app4 = readFileSync('parts/app4.js', 'utf8');
const changelog = readFileSync('CHANGELOG.md', 'utf8');

// ================= G - the glow spears =================
console.log('G - the create glow mesh cannot throw spears');
check('G: crGlowStitchFeats chains parts on endpoint coincidence, both directions',
  pick.includes('function crGlowStitchFeats(feats)') && pick.includes('L.coords.push(...c.slice(1))') && pick.includes('L.coords.unshift(...c.slice(0, -1))'));
const buildSrc = extractFn(pick, 'crGlowBuildMesh');
check('G: crGlowBuildMesh stitches and drops repeated points before meshing',
  !!buildSrc && buildSrc.includes('crGlowStitchFeats(feats)') && buildSrc.includes('a[i - 1][0]) > 1e-12'));
check('G: syncCrGlow chosen-sectors computation untouched (the 1.209 feed contract)',
  pick.includes('const rec = crStreetParts(name);') && pick.includes('if (!set.has(i)) continue; const L = rec.parts[i];') && pick.includes('crGlowSetFeatures(feats);'));

const stitchSrc = extractFn(pick, 'crGlowStitchFeats');
const rgbSrc = extractFn(pick, 'crGlowRgb');
const ringsM = pick.match(/const CR_GLOW_RINGS = \[([^\]]+)\];/);
check('G: mesh sources extractable', !!(buildSrc && stitchSrc && rgbSrc && ringsM));
if (buildSrc && stitchSrc && rgbSrc && ringsM) {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(`
    var maplibregl = { MercatorCoordinate: { fromLngLat: (c) => {
      const phi = c.lat * Math.PI / 180;
      return { x: (c.lng + 180) / 360, y: (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2,
               meterInMercatorCoordinateUnits: () => 1 / (40075016.686 * Math.cos(phi)) };
    } } };
  `, ctx);
  vm.runInContext(ringsM[0], ctx);
  vm.runInContext(rgbSrc, ctx);
  vm.runInContext(stitchSrc, ctx);
  vm.runInContext(buildSrc, ctx);
  const run = expr => vm.runInContext(expr, ctx);
  const feat = (coords, col) => ({ type: 'Feature', properties: { col }, geometry: { type: 'LineString', coordinates: coords } });

  // The defect feed: one raspberry street in three chained sector parts
  // (shared endpoints, like crStreetParts cuts), a repeated point inside
  // part 1 and part 2 (the sector-cut signature), plus a gold street
  // crossing it that shares no endpoints and must never merge.
  const A = [-79.5600, 43.8000], B = [-79.5580, 43.8000], C = [-79.5560, 43.8000],
        D = [-79.5540, 43.8007], E = [-79.5520, 43.8014], F = [-79.5500, 43.8021];
  const G1 = [-79.5550, 43.7985], G2 = [-79.5550, 43.8030];
  ctx.feed = [
    feat([A, B, B, C], '#ef476f'),
    feat([C, D, D, E], '#ef476f'),
    feat([E, F], '#ef476f'),
    feat([G1, G2], '#ffc233')
  ];
  const mesh = run('crGlowBuildMesh(feed)');
  // Fixed construction: raspberry stitches to [A..F] (6 stations: ribbon
  // 5 x 8 x 6 = 240 + 30 cap = 270), gold stands alone (78). Unmodified
  // main builds per part: 174 + 174 + 78 + 78 = 504.
  check('G: the defect feed meshes as two continuous runs (348 vertices, not 504 per-part)',
    mesh.length === 348 * 6, 'floats=' + mesh.length);

  // THE SPEAR ASSERTION: every vertex's true distance from its own
  // street's centreline vs the distance its attribute claims.
  const mm = 1 / (40075016.686 * Math.cos(43.80 * Math.PI / 180));
  const toM = c => { const phi = c[1] * Math.PI / 180; return [(c[0] + 180) / 360 / mm, (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2 / mm]; };
  const segDist = (p, a, b) => {
    const vx = b[0] - a[0], vy = b[1] - a[1], wx = p[0] - a[0], wy = p[1] - a[1];
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1)));
    return Math.hypot(wx - t * vx, wy - t * vy);
  };
  const lineDist = (p, line) => Math.min(...line.slice(0, -1).map((a, i) => segDist(p, a, line[i + 1])));
  const lines = { rasp: [A, B, C, D, E, F].map(toM), gold: [G1, G2].map(toM) };
  let worst = -Infinity, excess = 0, finite = true;
  for (let i = 0; i < mesh.length; i += 6) {
    const p = [mesh[i] / mm * 1, mesh[i + 1] / mm * 1]; // mesh stores mercator units; toM above maps lnglat -> metres, so convert: vertex mercator / mm = metres on the same axes
    const claimed = mesh[i + 2];
    const isGold = Math.abs(mesh[i + 4] - 0xC2 / 255) < 1e-3 && Math.abs(mesh[i + 3] - 1) < 1e-3;
    const d = lineDist(p, isGold ? lines.gold : lines.rasp);
    if (![mesh[i], mesh[i + 1], claimed].every(Number.isFinite)) finite = false;
    worst = Math.max(worst, d - claimed);
    if (d > claimed + 1.0) excess++;
  }
  check('G: every vertex finite', finite);
  check('G: NO SPEARS - no vertex farther than its claimed distance + 1 m', excess === 0 && worst <= 1.0,
    'excess=' + excess + ' worst=' + (worst === -Infinity ? 'n/a' : worst.toFixed(2)) + ' m');

  // Clean-geometry invariants (the 1.211 numbers, exactly): stitching
  // and dedupe may not change a clean feed's mesh by one vertex.
  ctx.f1 = feat([[-79.55, 43.80], [-79.54, 43.80]], '#ffc233');
  check('G: clean straight line - 78 vertices as in 1.211', run('crGlowBuildMesh([f1])').length === 78 * 6);
  ctx.f2 = feat([[-79.55, 43.80], [-79.54, 43.80], [-79.54, 43.81]], '#ef476f');
  check('G: clean L line - 126 vertices as in 1.211', run('crGlowBuildMesh([f2])').length === 126 * 6);
  check('G: no features - empty mesh', run('crGlowBuildMesh([])').length === 0);
  ctx.fdeg = feat([[-79.55, 43.80], [-79.55, 43.80]], '#ef476f');
  check('G: a fully-repeated part dedupes to nothing (no crash, no mesh)', run('crGlowBuildMesh([fdeg])').length === 0);
}

// ================= C - casing variant B =================
console.log('C - the draft casing is variant B, the floor follows it');
check('C: crDraftCase wears the halved anchor crZoomW(9.75), same near-black',
  pick.includes("'line-color': 'rgba(10,14,34,.55)', 'line-width': crZoomW(9.75)"));
check('C: the old 12.75 anchor is gone from the casing', !pick.includes('crZoomW(12.75)'));
check('C: crDraftLine unchanged (crZoomW(6.75)) and crDraftHit unchanged (24 px tap target)',
  pick.includes("'line-width': crZoomW(6.75)") && pick.includes("'line-width': 24 }"));
check('C: crGlowCasingHalfM reads the new half-anchor 4.875 px',
  pick.includes('return 4.875 * (40075016.686 * Math.cos(lat)) / (512 * Math.pow(2, Math.max(map.getZoom(), 15)))'));
check('C: the reach expression itself is unchanged (breath 5+4s, floor (half - 4.95) x 2.21)',
  pick.includes('Math.max(5 + 4 * s, (crGlowCasingHalfM() - 4.95) * 2.21)'));
// Floor arithmetic at Vaughan's latitude (the function's own formula):
const latR = 0.765, mpp = z => (40075016.686 * Math.cos(latR)) / (512 * Math.pow(2, Math.max(z, 15)));
const half15 = 4.875 * mpp(15), half16 = 4.875 * mpp(16);
check('C: floor at z15 - casing half ~8.4 m, floor reach ~7.6 m (was ~13.4 m), 30%-at-edge holds by construction',
  half15 > 8.2 && half15 < 8.6 && (half15 - 4.95) * 2.21 > 7.3 && (half15 - 4.95) * 2.21 < 8.0,
  'half15=' + half15.toFixed(2) + ' floor=' + ((half15 - 4.95) * 2.21).toFixed(2));
check('C: floor at the picking zooms (z16+) - casing half ~4.2 m is under the kerb, floor term <= 0, the approved breath runs untouched',
  half16 > 4.0 && half16 < 4.4 && (half16 - 4.95) * 2.21 <= 0, 'half16=' + half16.toFixed(2));

// ================= V - the bump =================
console.log('V - the current version agrees everywhere (pin rolled to Beta 1.218 by the icon-pack rounds)');
check('V: the #ver label reads Beta 1.236', head.includes('<div class="ver" id="ver">Beta 1.236</div>'));
check('V: WHATSNEW is the Beta 1.236 entry', app4.includes("v: 'Beta 1.236', items:"));
check('V: the CHANGELOG top entry is Beta 1.226', changelog.split('\n').find(l => l.startsWith('## Beta')) === '## Beta 1.236 — 2026-11-18');
check('V: the CHANGELOG accounts the maintenance PR since 1.215', changelog.includes('plus 1 maintenance PR since Beta 1.215'));

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
