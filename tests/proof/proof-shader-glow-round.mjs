import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

// Shader glow round proof (fix_id: shader-glow-round, Beta 1.211,
// 2026-11-15). Three Andrew-approved scopes, one round:
//
//   G - the create flow's sector-trim glow is the SHADER glow Andrew
//       approved from the real sample (work/glow-shader-sample): the
//       1.208 five-layer blur stack is retired; ONE custom WebGL layer
//       (crGlowShader) draws a ribbon mesh built in METRES - seven
//       cross-section rings carrying a per-vertex distance attribute,
//       a fragment falloff that is full-strength inside the 4.95 m kerb
//       and decays (1-t)^2 across a breathing reach (4.0 s cycle, reach
//       5<->9 m, peak 0.50<->0.80 in phase), miter joins clamped at
//       cos 0.45, round end caps, premultiplied "over" blending so
//       crossings saturate at the class colour. syncCrGlow stays the
//       ONE writer (chosen sectors only - its feature-set contract is
//       pinned by proof-trim-glow-path-pills S1); here the MESH and the
//       SHADER are pinned. On unmodified main every G check fails (the
//       blur stack is still there and no mesh builder exists).
//   W - the wording sweep: no user-facing string calls the in-progress
//       clean a "run" (Andrew: "we're not running"). The Pace header
//       reads 'Current clean'; the start/finish/cancel/resume/restore
//       strings say "clean". Internal identifiers and comments are
//       untouched by design and are NOT checked here.
//   I - the two tab icons Andrew picked from the sample page: Streets
//       is the straight-on road (one evenodd path, the sample's own
//       path), Settings is the spoked cog authored as ONE nonzero path
//       (12 teeth + ring outer + ring inner + 3 spokes + hub = 18 subpaths; the ring's
//       inner circle wound against the rest, so the spokes are part of
//       the same connected silhouette - no gap by construction).
//
// Run from the repo root:  node tests/proof/proof-shader-glow-round.mjs

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
const app3 = readFileSync('parts/app3.js', 'utf8');
const app4 = readFileSync('parts/app4.js', 'utf8');

// ================= G - the shader glow =================
console.log('G - create trim glow is the approved shader glow');
check('G: the blur stack is gone (no crGlow1-5 layers, no line-blur, no crGlow source)',
  !/crGlow[1-5]\b/.test(pick) && !pick.includes('line-blur') && !pick.includes('CR_GLOW_SRC'));
check('G: one custom layer, inserted under the draft casing like the stack was',
  pick.includes("id: 'crGlowShader', type: 'custom'") && pick.includes("map.addLayer(crGlowLayerObj(), 'crDraftCase')"));
check('G: the writer sink is the mesh builder', pick.includes('crGlowSetFeatures(feats);'));
check('G: fragment falloff is the sample form (kerb plateau, (1-t)^2 decay)',
  pick.includes('float t = clamp((d - u_half) / u_reach, 0.0, 1.0); a = u_peak * (1.0 - t) * (1.0 - t);'));
check('G: shader constants - kerb 4.95 m, breath reach 5+4s, peak 0.50+0.30s, 4.0 s cycle',
  pick.includes('gl.uniform1f(this._u.half, 4.95);') && pick.includes('Math.max(5 + 4 * s, (crGlowCasingHalfM() - 4.95) * 2.21)') &&
  pick.includes('gl.uniform1f(this._u.peak, 0.50 + 0.30 * s);') && pick.includes('((t % 4) / 4)'));
check('G: the reach floor reads the casing metre half-width at max(z, 15) (the 1.210 anchor rule)',
  pick.includes('function crGlowCasingHalfM()') && pick.includes('Math.max(map.getZoom(), 15)'));
check('G: premultiplied over blending (crossings saturate, never blow out)',
  pick.includes('gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);'));
check('G: the breathing repaint is gated on a live mesh (render returns before any repaint when empty)',
  pick.includes('if (!this._prog || !this._data || !this._data.length) return;'));

const ringsM = pick.match(/const CR_GLOW_RINGS = \[([^\]]+)\];/);
check('G: the ring table (kerb + falloff rings + the floor tail rings at 13/20 m)', !!ringsM && ringsM[1] === '-20, -13, -9.9, -4.95, 0, 4.95, 9.9, 13, 20', ringsM && ringsM[1]);
const buildSrc = extractFn(pick, 'crGlowBuildMesh');
const stitchSrc = extractFn(pick, 'crGlowStitchFeats'); // Beta 1.216: the builder stitches its feed first - the harness must lift the helper too
const rgbSrc = extractFn(pick, 'crGlowRgb');
check('G: mesh builder extractable', !!(buildSrc && stitchSrc && rgbSrc && ringsM));
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
  // a straight two-point line, gold
  ctx.f1 = feat([[-79.55, 43.80], [-79.54, 43.80]], '#ffc233');
  const m1 = run('crGlowBuildMesh([f1])');
  check('G: straight line mesh - 78 vertices (48 ribbon + 30 cap), 6 floats each', m1.length === 78 * 6, 'floats=' + m1.length);
  const dists = new Set(), cols = new Set(); let finite = true, maxLat = 0;
  const mm = 1 / (40075016.686 * Math.cos(43.80 * Math.PI / 180));
  const cx = (180 - 79.55) / 360, cy = (1 - Math.asinh(Math.tan(43.80 * Math.PI / 180)) / Math.PI) / 2;
  for (let i = 0; i < m1.length; i += 6) {
    dists.add(Math.round(m1[i + 2] * 100) / 100); cols.add([m1[i + 3], m1[i + 4], m1[i + 5]].join(','));
    if (![m1[i], m1[i + 1], m1[i + 2]].every(Number.isFinite)) finite = false;
    maxLat = Math.max(maxLat, Math.abs(m1[i + 1] - cy) / mm);
  }
  check('G: every vertex finite', finite);
  check('G: distance attribute values are exactly the ring set {0, 4.95, 9.9, 13, 20}',
    JSON.stringify([...dists].sort((a, b) => a - b)) === JSON.stringify([0, 4.95, 9.9, 13, 20]), [...dists].join(','));
  check('G: vertex colour is the feature colour (gold #ffc233)', cols.size === 1 && Math.abs(m1[3] - 1) < 1e-6 && Math.abs(m1[4] - 0xC2 / 255) < 1e-4 && Math.abs(m1[5] - 0x33 / 255) < 1e-4, [...cols].join(' '));
  // Tolerance is the float32 grid, not slack: absolute mercator
  // coordinates ride in a Float32Array, whose ULP at this latitude is
  // ~0.43 m - the sample round measured the same property. A px-built
  // mesh would miss 20 m by orders of magnitude, not by a fraction of a metre.
  check('G: the mesh reaches 20 m from the centreline (metric, not px; float32 ULP tolerance)', Math.abs(maxLat - 20) < 0.6, 'maxLat=' + maxLat.toFixed(3) + ' m');
  // an L-shaped three-point line: the corner miter extends past the ring
  ctx.f2 = feat([[-79.55, 43.80], [-79.54, 43.80], [-79.54, 43.81]], '#ef476f');
  const m2 = run('crGlowBuildMesh([f2])');
  let maxLat2 = 0;
  for (let i = 0; i < m2.length; i += 6) { const dx = (m2[i] - cx) / mm, dy = (m2[i + 1] - cy) / mm; maxLat2 = Math.max(maxLat2, Math.min(Math.abs(dx), Math.abs(dy)) > 20 ? 0 : Math.hypot(dx, dy)); }
  check('G: L line mesh - 126 vertices (2 segments of ribbon + caps)', m2.length === 126 * 6, 'floats=' + m2.length);
  check('G: raspberry feature colours its own vertices', Math.abs(m2[3] - 0xEF / 255) < 1e-4 && Math.abs(m2[4] - 0x47 / 255) < 1e-4);
  const m0 = run('crGlowBuildMesh([])');
  check('G: no features - empty mesh (nothing draws, nothing repaints)', m0.length === 0);
}

// ================= W - the wording sweep =================
console.log('W - no user-facing string calls the in-progress clean a run');
check('W: Pace header reads Current clean', app3.includes("phT.textContent = 'Current clean'"));
check('W: Pace empty line says finish a clean', app3.includes('when you finish a clean and tap Finish'));
check('W: start warning says the clean state', app3.includes('the clean state could not be saved'));
check('W: cancel toasts say clean erased / during the clean / clean may return',
  app3.includes("toast('Start cancelled — clean erased')") && app3.includes('the board was rebuilt from the marks made during the clean') && app3.includes('the clean may return on reload'));
check('W: finish storage toast says clean intact', app3.includes('finish stopped, clean intact'));
check('W: resume + restore toasts say clean', app4.includes("toast('Resumed clean — ") && app4.includes('Cancel will rebuild from the marks made during the clean'));
check('W: none of the old run strings remain in UI literals',
  !app3.includes("phT.textContent = 'This run'") && !app3.includes('finish a run and tap Finish') &&
  !app3.includes('the run state could not be saved') && !app3.includes('— run erased') &&
  !app3.includes('the run may return on reload') && !app3.includes('finish stopped, run intact') &&
  !app4.includes("toast('Resumed run") && !app4.includes('marks made during the run'));

// ================= I - the two tab icons =================
// Beta 1.217 re-derivation: the 1.211 vector pins retired WITH the artwork —
// Beta 1.218 re-derivation (TEST/design class): the two artwork hashes below are the GRADIENT set (Andrew's scope update, 2026-11-16 — white lines over the START-button gradient), superseding the flat set pinned at 1.217.
// Streets and Settings are Pulsar imgs now; the checks pin the new entries at
// the same strength (the picked artwork's identity, byte-for-byte).
console.log('I - Streets and Settings icons are Andrew\'s picks (Pulsar artwork since Beta 1.217)');
const iconEntry = key => { const m = app4.match(new RegExp(key + ": '(<span[^']*)'")); return m ? m[1] : ''; };
const streets = iconEntry('streets'), gear = iconEntry('gear');
const uriHash = entry => { const m = entry.match(/src="data:image\/png;base64,([^"]+)"/); return m ? createHash('sha256').update(Buffer.from(m[1], 'base64')).digest('hex') : ''; };
check('I: both entries are Pulsar img spans in their wrappers (Streets dock, Settings tab)',
  streets.startsWith('<span class="pwrapD"><img class="pico" data-k="streets"') && gear.startsWith('<span class="pwrapT"><img class="pico" data-k="gear"'));
check('I: Streets wears the approved Pulsar road artwork (decoded day URI sha256)',
  uriHash(streets) === '39e5ee880ca5404d44c76b9bdafb7919e860d444f279f7cbb8bf6739bbe4e4b3', uriHash(streets));
check('I: Settings wears the approved Pulsar settings artwork (decoded day URI sha256)',
  uriHash(gear) === '1a2b541bfd1bd1600af0f93fdd4dc25b7ef3106aeb7851f83ddc8150e72576e3', uriHash(gear));

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
