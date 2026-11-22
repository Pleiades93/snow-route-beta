const GLP = (() => {
  let H = GL_HOST; // Beta 1.103 (architecture Phase 6, C5): the engine's ONLY doorway to the app - every app value, helper, callback and live state read goes through this host object (built in app1.js; also passed to GLP.init). Live state arrives via getters, so an app rebind is seen on the next read, exactly as a free-global read behaved before.
  let GLM = null;                 // the MapLibre map instance (recreated per setBasemap)
  let sel = null;                 // {name, idx} - fed from the app's selStretch
  let YELLOW = '#ffc233', RED = '#ef476f', GREEN = '#06d6a0';   // METRO, locked in the prototype (r26)
  const pendingColor = n => H.PRIMARIES.has(n) ? YELLOW : RED;
  let fontStack = ['Noto Sans Regular']; // replaced per-style by GLP.setFont (the app adopts the basemap's own stack, prototype pickFont rule)
  const glowPreset = 1;   // SOFT - the locked selection preset (prototype r24)
  let lastSig = null, lastNight = null;
  function pushSources() {
    if (!GLM || !CUR || !GLM.getSource('centres')) return;
    GLM.getSource('centres').setData(CUR.centres);
    GLM.getSource('bands').setData(CUR.bands);
    GLM.getSource('edges').setData(CUR.edges);
    GLM.getSource('fills').setData(CUR.fills);
    if (GLM.getSource('fades')) GLM.getSource('fades').setData(CUR.fades);
    GLM.getSource('sel').setData(CUR.sel);
    GLM.getSource('selBand').setData(CUR.selBand);
    GLM.getSource('selFill').setData(CUR.selFill);
    if (GLM.getSource('selFades')) GLM.getSource('selFades').setData(CUR.selFades);
    if (GLM.getSource('selGlow')) GLM.getSource('selGlow').setData(buildSelGlow());
    managePulse();
  }
  function pushSelSources() { // Beta 1.50 (audit P01): a selection change used to re-send EVERY source - all street families included - though only the selection family changed
    if (!GLM || !CUR || !GLM.getSource('centres')) return;
    GLM.getSource('sel').setData(CUR.sel);
    GLM.getSource('selBand').setData(CUR.selBand);
    GLM.getSource('selFill').setData(CUR.selFill);
    if (GLM.getSource('selFades')) GLM.getSource('selFades').setData(CUR.selFades);
    if (GLM.getSource('selGlow')) GLM.getSource('selGlow').setData(buildSelGlow());
    managePulse();
  }
const XYOf = p => [p[1] * H.MLNG, p[0] * H.MLAT];
function segLenM(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += H.jDistM(pts[i - 1], pts[i]); return L; }
const GJ = pts => pts.map(p => [p[1], p[0]]);   // [lat,lng] -> [lng,lat]
// Geographic offset of a [lat,lng] polyline by `m` metres (positive = left
// of the direction of travel), in the same flat-metre space the app uses.
function offsetLine(pts, m) {
  const P = pts.map(p => [p[1] * H.MLNG, p[0] * H.MLAT]);
  const out = [];
  for (let i = 0; i < P.length; i++) {
    // Direction from a WINDOW of at least ~2 m each way, not the immediate
    // neighbours: the route traces carry near-duplicate points (some 5 cm
    // apart), and an immediate-neighbour normal there is noise - it
    // collapsed some edge points onto the centreline (gate, 2026-10-28).
    let a = i, b = i;
    while (a > 0 && Math.hypot(P[i][0] - P[a][0], P[i][1] - P[a][1]) < 2) a--;
    while (b < P.length - 1 && Math.hypot(P[b][0] - P[i][0], P[b][1] - P[i][1]) < 2) b++;
    let dx = P[b][0] - P[a][0], dy = P[b][1] - P[a][1];
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    out.push([(P[i][1] + dx * m) / H.MLAT, (P[i][0] + (-dy) * m) / H.MLNG]);   // offset vector = m * (-dy, dx): x takes -dy, y takes dx. A transposed pair here shifted the line ALONG the street instead of beside it (Andrew's 'overshoot', 2026-10-28)
  }
  return out;
}

const labelFeatures = [];
const labelPointFeatures = [];
const LABELS = { type: 'FeatureCollection', features: labelFeatures };
const GEO = {};
// Left/Right naming (Andrew, 2026-10-28): every street has ONE fixed
// direction - south end to north end, or west end to east end for
// east-west streets. Left is the left-hand side in that direction: the
// same rule for every street, fixed to the street itself, never flipping
// with the direction of travel. LEFTBIT[name] = which state bit is Left.
const LEFTBIT = {};
function buildEngineGeometry() { // Beta 1.117: the engine's route geometry (GEO offsets, LEFTBIT, label features + tiers, the route POI, the hit features) is built HERE from the host's CURRENT data - once at eval (no route loaded yet: empty) and again on every route switch via GLP.rebuildRoute. The containers are refilled in place, never rebound, so every module-level reader (buildFamilies, selectedGeom, addStack) keeps working unchanged.
  for (const k of Object.keys(GEO)) delete GEO[k];
  for (const k of Object.keys(LEFTBIT)) delete LEFTBIT[k];
  labelFeatures.length = 0; labelPointFeatures.length = 0;
  SVMAP = null; // the shared-vertex map is a memoized derivative of GEO (sharedVertexMap) - it must die with the geometry it was built from, or the strand builders read the previous route's streets (the first switch build threw exactly there)
  H.names.forEach(n => {
  // The street's stitched line, RUN BY RUN (Beta 1.144, Package C DA-02/C1):
  // within a run, sectors are exact slices of it (sector k+1 starts at the
  // very point sector k ends) - the pre-1.144 construction verbatim. A
  // disconnected street (non-adjacent sector picks; a genuinely split
  // street) has several runs: their points concatenate into the same
  // stitched array with GLOBAL vertex ranges per part, but the offsets are
  // computed PER RUN (an offset line must never bridge the omitted ground
  // between runs), and gaps records the vertex index each later run starts
  // at, so every segment walk in this engine can refuse to step across a
  // discontinuity. A single-run street builds byte-identically to before.
  const stitched = [], cuts = [], gaps = new Set();
  let off0 = [], off1 = [], offH0 = [], offH1 = [], stitchedLen = 0;
  H.STRETCH[n].runs.forEach((run, ri) => {
    if (ri > 0) gaps.add(stitched.length);
    const base = stitched.length, rStitched = [];
    run.parts.forEach((part, i) => {
      const a = i === 0 ? base : stitched.length - 1;
      if (i === 0) { stitched.push(...part); rStitched.push(...part); } else { stitched.push(...part.slice(1)); rStitched.push(...part.slice(1)); }
      cuts.push([a, stitched.length - 1]);
    });
    // Offsets computed ONCE over the whole RUN (the tracker's v5.79 method):
    // a boundary vertex gets ONE shared offset point, so a side marked across
    // consecutive sectors is one continuous line; both sides sit at the same
    // 3.3 m; and the lines end exactly at the run's ends - no overshoot
    // onto the next street, no uneven ends.
    off0 = off0.concat(offsetLine(rStitched, 3.3 * WIDTH_K)); off1 = off1.concat(offsetLine(rStitched, -3.3 * WIDTH_K));
    offH0 = offH0.concat(offsetLine(rStitched, 1.65 * WIDTH_K)); offH1 = offH1.concat(offsetLine(rStitched, -1.65 * WIDTH_K));   // Beta 1.208: the half-offset lines (centreline-to-kerb midlines) the one-side fills are built on - same per-run construction as the kerb lines
    stitchedLen += segLenM(rStitched);
  });
  GEO[n] = { stitched, cuts, off0, off1, offH0, offH1, gaps };
  const p0 = stitched[0], p1 = stitched[stitched.length - 1];
  const dLat = p1[0] - p0[0], dLng = p1[1] - p0[1];
  const canonicalForward = Math.abs(dLat) >= Math.abs(dLng) ? dLat >= 0 : dLng >= 0;
  LEFTBIT[n] = canonicalForward ? 0 : 1;   // bit 0 is the left of the stitched direction
  const leftOff = LEFTBIT[n] === 0 ? off0 : off1, mid = Math.floor(stitched.length / 2);
  const dx = (leftOff[mid][1] - stitched[mid][1]) * H.MLNG, dy = (leftOff[mid][0] - stitched[mid][0]) * H.MLAT;
  // label line: the SPOT segment (or the longest), like the app's labels
  const segs = H.ROADS[n];
  const spotE = Object.prototype.hasOwnProperty.call(H.SPOT, n) ? H.SPOT[n] : null; // Beta 1.261 gate fix (Codex P2, PR #154): SPOT is sparse (only streets with a spot entry carry one), and a plain read of a missing key resolves INHERITED object properties - a street named 'constructor' or 'toString' read back a truthy prototype value, li went undefined (both bounds comparisons fail on undefined), and segLenM threw, aborting the route load. Own entries only.
  let li = (spotE ? spotE[0] : -1);
  if (li < 0 || li >= segs.length) { li = 0; let bl = -1; segs.forEach((sg, j) => { const L = segLenM(sg); if (L > bl) { bl = L; li = j; } }); }
  labelFeatures.push({ type: 'Feature', properties: { name: n }, geometry: { type: 'LineString', coordinates: GJ(segs[li]) } });
  // Round 34: a POINT anchor on the same segment at the SPOT fraction.
  // Line-placed labels need the segment to fit the name on screen, so
  // at Overview most short streets lost their labels entirely; point
  // labels render regardless of segment length.
  const seg = segs[li], fr = spotE ? spotE[1] : 0.5;
  let target = segLenM(seg) * fr, acc = 0, anchor = seg[seg.length - 1];
  for (let k = 1; k < seg.length; k++) { const d = H.jDistM(seg[k - 1], seg[k]); if (acc + d >= target) { const t = d ? (target - acc) / d : 0; anchor = [seg[k - 1][0] + (seg[k][0] - seg[k - 1][0]) * t, seg[k - 1][1] + (seg[k][1] - seg[k - 1][1]) * t]; break; } acc += d; }
  labelPointFeatures.push({ type: 'Feature', properties: { name: n, len: Math.round(stitchedLen) }, geometry: { type: 'Point', coordinates: GJ([anchor])[0] } }); // Beta 1.144: the length is the per-run sum (stitchedLen) - segLenM over the concatenated array would add the jumps between a disconnected street's runs
});
  JUNC = null; // Beta 1.144 (found by drive165, proven on the pristine 1.143 tree): the junction table derives from GEO + the current name set but was built once and never invalidated - after a route switch it still named the PREVIOUS route's streets, and the first marked run's paint on the new route threw 'JUNC[n] is not iterable'. The geometry rebuild is the invalidation point: the table rebuilds lazily from the new geometry on next use.
  nudgeFifth();
  assignTiers();
  let a = 90, b = -90, c = 180, d = -180; H.names.forEach(n => GEO[n].stitched.forEach(p => { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); }));
  if (H.names.length) ROUTEPOI.geometry.coordinates = [(c + d) / 2, (a + b) / 2]; // Beta 1.170 (Carbon fix round Phase 2, B-10): an empty geometry keeps the last real centre - through 1.169 the extrema never moved off their seeds when there were no streets to visit, and the midpoint of the seeds is [0,0] (Null Island), where the route-name POI then rendered at overview zooms
  HIT.features = H.names.flatMap(n => GEO[n].cuts.map((ab, i) => ({ type: 'Feature', properties: { name: n, idx: i }, geometry: { type: 'LineString', coordinates: GJ(GEO[n].stitched.slice(ab[0], ab[1] + 1)) } })));
}
// Round 35 (Andrew): Fifth's label anchor sits at its Greenpark
// junction, so the name reads as if it belongs to the yellow street.
// Push it 45 m away from Greenpark's line - the text sits just off
// Fifth's own corner instead of on the junction paint.
function nudgeFifth() {
  const f = labelPointFeatures.find(x => x.properties.name === 'Fifth');
  if (!f) return;
  const A0 = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
  const gp = GEO['Greenpark'] && GEO['Greenpark'].stitched;
  if (!gp) return; // Beta 1.117: the nudge is a Route 5W refinement - a pack with a Fifth but no Greenpark simply skips it
  let bd = 1e9, bq = A0;
  const gg = GEO['Greenpark'].gaps;
  for (let k = 1; k < gp.length; k++) {
    if (gg.has(k)) continue; // Beta 1.144 (verify cycle 2): the segment between two runs is not street - projecting the anchor onto it pushes Fifth's label away from ground that is not Greenpark
    const a = gp[k - 1], b = gp[k], vx = (b[1] - a[1]) * H.MLNG, vy = (b[0] - a[0]) * H.MLAT;
    const wx = (A0[1] - a[1]) * H.MLNG, wy = (A0[0] - a[0]) * H.MLAT, L2 = vx * vx + vy * vy;
    let t = L2 ? (wx * vx + wy * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d = H.jDistM(A0, q);
    if (d < bd) { bd = d; bq = q; }
  }
  const dx = (A0[1] - bq[1]) * H.MLNG, dy = (A0[0] - bq[0]) * H.MLAT, dl = Math.hypot(dx, dy) || 1;
  f.geometry.coordinates = [A0[1] + (dx / dl) * 45 / H.MLNG, A0[0] + (dy / dl) * 45 / H.MLAT];
}
// Round 39 (Andrew): street names DEPUPULATE as he zooms out - from
// 13.7 the shortest streets' names drop away in tiers, longest last,
// until 12.6 where the melt finishes everything. Tier = stitched-
// length quartile (computed from the data, no hand-set lengths); the
// six PRIMARY streets are forced into the final tier regardless of
// length (Astona is a primary but only 187 m long).
function assignTiers() {
  if (!labelPointFeatures.length) return; // Beta 1.170 (B-10): no labels, no tiers - through 1.169 the quartile reads below indexed lens[-1] (undefined) and every comparison failed quietly; a no-op only because there were no features to tier either
  const lens = labelPointFeatures.map(f => f.properties.len).sort((a, b) => a - b);
  const q = p => lens[Math.min(lens.length - 1, Math.floor(p * lens.length))];
  const q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
  labelPointFeatures.forEach(f => {
    f.properties.tier = H.PRIMARIES.has(f.properties.name) ? 4 : (f.properties.len < q1 ? 1 : f.properties.len < q2 ? 2 : f.properties.len < q3 ? 3 : 4);
  });
}
const LABELPTS = { type: 'FeatureCollection', features: labelPointFeatures };
const ROUTEPOI = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }; // Beta 1.117: the centre is filled per load by buildEngineGeometry (was an eval-time IIFE over the baked route)

// ---- unified strands (Andrew, 2026-10-28): the route is painted as
// STRANDS, not per-street pieces. Slices of the same colour that touch -
// along a street OR across a junction, through straights and right turns -
// merge into ONE polyline, so wherever the same colours meet they read as
// one painted shape, the engine drawing every joint. A completed stretch
// is not a core flanked by two side lines: completed stretches form the
// BAND family - one solid ribbon at road width.
function colOf(n, bits) { return bits === 3 ? GREEN : (H.PRIMARIES.has(n) ? YELLOW : RED); }
// Selection by vibrancy (Andrew, 2026-10-28 - the model he designed on
// 2026-10-26): everything rests MUTED (same colour, saturation cut), the
// selected sector renders the full vibrant colour at the same glow spec.
function mute(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return hex;
  const d = mx - mn, s0 = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h; if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60;
  const s2 = s0 * 0.42, l2 = l + (0.52 - l) * 0.12;
  const c = (1 - Math.abs(2 * l2 - 1)) * s2, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l2 - c / 2;
  let rgb; if (h < 60) rgb = [c, x, 0]; else if (h < 120) rgb = [x, c, 0]; else if (h < 180) rgb = [0, c, x]; else if (h < 240) rgb = [0, x, c]; else if (h < 300) rgb = [x, 0, c]; else rgb = [c, 0, x];
  return '#' + rgb.map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
let MUGREEN = mute(GREEN);   // let (round 25): setScheme() recomputes it from the scheme's green
function fadeGrad(hex) {   // Beta 1.259: a boundary-end feather's line-gradient - full colour at progress 0 (the solid seam) to clear at 1 (the join). Literal rgba stops per colour: line-gradient cannot read feature properties (MapLibre), so each colour wears its own layer (addStack) - the approved sample's construction.
  const c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  return ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',1)', 1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)'];
}
function segCross(p1, p2, p3, p4) {
  const a = XYOf(p1), b = XYOf(p2), c = XYOf(p3), d = XYOf(p4);
  const o = (x, y, z) => (y[0] - x[0]) * (z[1] - x[1]) - (y[1] - x[1]) * (z[0] - x[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0 && ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function lineHit(p1, p2, p3, p4) {
  const a = XYOf(p1), b = XYOf(p2), c = XYOf(p3), d = XYOf(p4);
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  return [(a[1] + t * (b[1] - a[1])) / H.MLAT, (a[0] + t * (b[0] - a[0])) / H.MLNG];
}
const coordKey = p => p[0].toFixed(7) + ',' + p[1].toFixed(7);
// ---- kerb model (Andrew, 2026-10-28, round 7): a side line behaves like
// a kerb. It stops at the EDGE of a crossing road and joins around the
// corner (the pairing bridges in mergeStrands); it never runs through a
// junction. Two full-length lines at a corner MUST cross - that X, and
// the stub poking past to the crossing street's centreline, were the
// "still overlapping" defect in his screenshot. Opaque paint (round 6)
// only stopped the overlap looking darker; this removes the overlap.
const CORRIDOR = 5.2;   // metres: half the drawn road width
let JUNC = null;
function buildJunctions() {
  JUNC = {}; H.names.forEach(n => { JUNC[n] = []; });
  const at = {};
  H.names.forEach(n => GEO[n].stitched.forEach((pt, vi) => { const k = coordKey(pt); (at[k] = at[k] || []).push({ n, vi }); }));
  const dirAt = (n, vi) => {
    const st = GEO[n].stitched, gaps = GEO[n].gaps; // Beta 1.144: the direction window clamps at the vertex's own RUN ends - a run-boundary vertex's neighbour across the gap belongs to a different piece of the street and would hand the junction a direction the street does not have there
    const lo = gaps.has(vi) ? vi : Math.max(0, vi - 1), hi = gaps.has(vi + 1) ? vi : Math.min(st.length - 1, vi + 1);
    const a = XYOf(st[lo]), b = XYOf(st[hi]);
    const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
    return [dx / m, dy / m];
  };
  Object.values(at).forEach(list => {
    if (new Set(list.map(e => e.n)).size < 2) return;
    list.forEach(A => list.forEach(B => {
      if (A.n === B.n) return;
      const dA = dirAt(A.n, A.vi), dB = dirAt(B.n, B.vi);
      JUNC[A.n].push({ B: B.n, viA: A.vi, V: GEO[A.n].stitched[A.vi], dB, nB: [-dB[1], dB[0]], sin: Math.abs(dA[0] * dB[1] - dA[1] * dB[0]) });
    }));
  });
}
let SVMAP = null;
function sharedVertexMap() {
  if (SVMAP) return SVMAP;
  SVMAP = {};
  H.names.forEach(n => GEO[n].stitched.forEach((pt, vi) => { const k = coordKey(pt); (SVMAP[k] = SVMAP[k] || []).push({ n, vi }); }));
  return SVMAP;
}
// ---- through-connection (Andrew, 2026-10-28, round 9): "they all have
// to connect... no matter which way it goes." A side line marked on BOTH
// arms of a junction runs THROUGH it - unless a marked line of another
// street occupies one of its corners there, in which case it kerb-clips
// and the other street runs through (first claim wins, by street order),
// its arms touching the through line at the corner. Each junction
// quadrant is claimed by at most one through line, so two green lines
// still never cross; every arm ends joined to something beside it.
let THROUGH_SEGS = [];
function throughOK(A, side, J, runPts) {
  if (J.sin <= 0.42) return false;
  const V = J.V, vKey = coordKey(V);
  const back = (JUNC[J.B] || []).find(x => x.B === A && coordKey(x.V) === vKey);
  if (!back) return false;
  const nA = back.nB, nB = J.nB, Vx = XYOf(V);
  const off = (side === 0 ? GEO[A].off0 : GEO[A].off1)[J.viA];
  const sideSign = Math.sign((XYOf(off)[0] - Vx[0]) * nA[0] + (XYOf(off)[1] - Vx[1]) * nA[1]);
  if (!sideSign) return false;
  const signsOf = pt => { const w = XYOf(pt); return [Math.sign((w[0] - Vx[0]) * nA[0] + (w[1] - Vx[1]) * nA[1]), Math.sign((w[0] - Vx[0]) * nB[0] + (w[1] - Vx[1]) * nB[1])]; };
  const map = sharedVertexMap();
  // Blocked by a RAW CROSSING (round 10): if this street's raw side line
  // properly crosses another street's marked raw side line within 13 m
  // of V at a point that is NOT their vetted corner, running through
  // would paint an X. The half-plane arm test it replaces missed bending
  // streets: Greenpark bends at Fifth and its line swings across Fifth's
  // line 4 m past the vertex. A crossing AT the vetted corner is the
  // join itself - the partner kerbs into it - and does not block.
  const pairsNow = PAIRS_CUR || junctionPairs();
  const offA = side === 0 ? GEO[A].off0 : GEO[A].off1;
  let crossed = false;
  for (const E of (map[vKey] || [])) {
    if (E.n === A || crossed) continue;
    const gD = GEO[E.n];
    [0, 1].forEach(tt => {
      if (crossed) return;
      const marked = gD.cuts.some((ab, ci) => (E.vi >= ab[0] && E.vi <= ab[1]) && H.pieces[E.n][ci] !== 3 && (H.pieces[E.n][ci] & (1 << tt)));
      if (!marked) return;
      const offD = tt === 0 ? gD.off0 : gD.off1;
      const corners = (pairsNow[A + '|' + J.viA + '|' + side] || []).filter(pr => pr.n2 === E.n && pr.side2 === tt && pr.corner).map(pr => pr.corner);
      for (let s1 = 0; s1 + 1 < offA.length && !crossed; s1++) {
        if (GEO[A].gaps.has(s1 + 1)) continue; // Beta 1.144: the segment between two runs is not street - it can neither cross nor be crossed
        if (H.ptSegM(V, offA[s1], offA[s1 + 1]) > 13) continue;
        for (let s2 = 0; s2 + 1 < offD.length; s2++) {
          if (gD.gaps.has(s2 + 1)) continue;
          if (H.ptSegM(V, offD[s2], offD[s2 + 1]) > 13) continue;
          if (!segCross(offA[s1], offA[s1 + 1], offD[s2], offD[s2 + 1])) continue;
          const X = lineHit(offA[s1], offA[s1 + 1], offD[s2], offD[s2 + 1]);
          if (!X) continue;
          if ([offA[s1], offA[s1 + 1], offD[s2], offD[s2 + 1]].some(pt => H.jDistM(X, pt) < 0.35)) continue;
          if (corners.some(c => H.jDistM(X, c) < 0.5)) continue;
          crossed = true;
        }
      }
    });
  }
  if (crossed) return false;
  for (const seg of THROUGH_SEGS) {
    if (coordKey(seg.V) !== vKey) continue;
    // The same street+side asking again is the SAME line, not a rival:
    // where the crossing road changes name mid-junction (Fifth becomes
    // Angie at Valeria) or a junction sits on a double vertex (Mellings
    // on Velmar), the junction has one entry per name/vertex and the
    // first grant must not block the rest. (Round 9: Valeria's lone line
    // ran through the Greenpark T but stopped at Fifth/Angie.)
    if (seg.A === A && seg.side === side) continue;
    if (seg.pts.some(pt => signsOf(pt)[0] === sideSign)) return false;
  }
  THROUGH_SEGS.push({ V, A, side, pts: runPts.filter(pt => H.jDistM(pt, V) < CORRIDOR + 5) });
  return true;
}
// Cut one piece at one junction: the part inside the crossing street's
// corridor (within CORRIDOR metres of its centreline, near the junction)
// is removed; the cut ends land exactly on the corridor boundary and are
// tagged so mergeStrands can bridge them around the corner.
// Two junction entries at the same point are the SAME physical road
// when their crossing streets run the same way - the name-change case
// (Fifth becomes Angie at Valeria): JUNC carries one entry per name,
// each with its own frame, and clipping/granting twice under two
// near-identical frames corrupts the first pass (round 10: the Fifth
// frame's clip ate the whole Valeria arm the Angie frame had correctly
// kerbed - the segment's exit crossing landed within centimetres of
// its start and was deduped away). Cluster twins and act ONCE.
function sameRoad(J1, J2) {
  if (H.jDistM(J1.V, J2.V) >= 2) return false;
  return Math.abs(J1.dB[0] * J2.dB[0] + J1.dB[1] * J2.dB[1]) > 0.95;
}
function clipOne(pc, J, R) {
  const Vx = XYOf(J.V), L = R / Math.max(J.sin, 0.42) + 9;
  const W = p => { const q = XYOf(p); return (q[0] - Vx[0]) * J.nB[0] + (q[1] - Vx[1]) * J.nB[1]; };
  const U = p => { const q = XYOf(p); return (q[0] - Vx[0]) * J.dB[0] + (q[1] - Vx[1]) * J.dB[1]; };
  // The 1e-6 margin is load-bearing: XYOf coordinates are ~1e6-1e7 in
  // magnitude (degrees x ~1e5), so the W/U of an interpolated boundary
  // crossing carries ~1e-8 of float cancellation noise. At 1e-9 the
  // crossing point - ON the wall by construction - randomly classified
  // as INSIDE, the outside piece lost its first point, and a 1-point
  // remnant was filtered out (Velmar stretch 6 again, round 9).
  const inside = p => Math.abs(W(p)) < R - 1e-6 && Math.abs(U(p)) < L - 1e-6;
  const aug = [pc.pts[0]];
  for (let i = 0; i + 1 < pc.pts.length; i++) {
    const p = pc.pts[i], q = pc.pts[i + 1], wp = W(p), wq = W(q), up = U(p), uq = U(q), cr = [];
    [R, -R].forEach(sv => {
      if ((wp - sv) * (wq - sv) < 0) {
        const t = (sv - wp) / (wq - wp);
        const c = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
        if (Math.abs(U(c)) < L) cr.push({ t, c });
      }
    });
    // The box has FOUR walls: a segment can also leave through the end
    // walls (U = +/-L). Round 9: those crossings were never inserted, so
    // a sparse segment exiting through a corner lost everything from the
    // box to its next trace point - Velmar stretch 6 (one 104 m segment)
    // lost its whole piece and rendered as a 100 m gap.
    [L, -L].forEach(sv => {
      if ((up - sv) * (uq - sv) < 0) {
        const t = (sv - up) / (uq - up);
        const c = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
        if (Math.abs(W(c)) < R) cr.push({ t, c });
      }
    });
    cr.sort((x, y) => x.t - y.t).forEach(({ c }) => {
      const last = aug[aug.length - 1];
      if (coordKey(c) === coordKey(last)) return;
      if (H.jDistM(c, last) < 0.05) {
        // An exit within centimetres of an INSIDE start point: the wall
        // point must REPLACE the start, never be deduped away - dropping
        // it starts the surviving piece at the next trace point, however
        // far away that is (round 10: a whole 114 m arm vanished).
        if (inside(last)) aug[aug.length - 1] = c;
        return;
      }
      aug.push(c);
    });
    if (coordKey(q) !== coordKey(aug[aug.length - 1])) aug.push(q);
  }
  const tag = { clip: J.B, vi: J.viA };
  const res = [];
  /** @type {{ pts: AnyPoint[], sTag: { clip: string, vi: number } | null, eTag: { clip: string, vi: number } | null } | null} */
  let cur = null;
  aug.forEach((p, i) => {
    if (!inside(p)) {
      if (!cur) cur = { pts: [p], sTag: (i === 0 ? pc.sTag : (res.length === 0 && !aug.slice(0, i).some(inside) ? pc.sTag : tag)), eTag: null };
      else cur.pts.push(p);
    } else if (cur) { cur.eTag = tag; res.push(cur); cur = null; }
  });
  if (cur) { cur.eTag = pc.eTag; res.push(cur); }
  return res;
}
function clipPieces(piecesIn, A, R = CORRIDOR, skip = null) {
  if (!JUNC) buildJunctions();
  let pieces = piecesIn;
  const seenCluster = [];
  for (const J of JUNC[A]) {
    if (seenCluster.some(u => sameRoad(u, J))) continue;   // one clip per physical road at a point: double vertices AND name-change twins (round 9/10)
    seenCluster.push(J);
    if (skip && [...skip].some(u => (u.B === J.B && H.jDistM(u.V, J.V) < 2) || sameRoad(u, J))) continue;
    if (J.sin <= 0.42) continue;   // near-parallel traces run together (overlaps) - not crossings
    const out = [];
    for (const pc of pieces) out.push(...clipOne(pc, J, R));
    pieces = out.filter(pc => pc.pts.length >= 2);
    if (!pieces.length) break;
  }
  return pieces;
}
// Marked side runs for one street+side: consecutive marked stretches
// concatenated, then kerb-clipped at every junction. Returns strand
// slices for mergeStrands (clip ends carry the junction vertex so the
// pairing bridges can join them around the corner).
function edgeRunSlices(n, side, marked) {
  const g = GEO[n], off = side === 0 ? g.off0 : g.off1, out = [];
  let run = null;
  const flush = () => {
    if (!run) return;
    const startMeta = { n, vi: g.cuts[run.firstIdx][0], side }, endMeta = { n, vi: g.cuts[run.lastIdx][1], side };
    const mem = []; for (let i = run.firstIdx; i <= run.lastIdx; i++) mem.push({ n, idx: i, side });
    if (!JUNC) buildJunctions();
    const skip = new Set();
    const seenJ = [];
    for (const J of JUNC[n]) {
      if (J.sin <= 0.42) continue;
      if (seenJ.some(u => sameRoad(u, J))) continue;   // name-change twins share one verdict (frame + through + skip)
      seenJ.push(J);
      if (!run.pts.some(pt => H.jDistM(pt, J.V) < CORRIDOR + 5)) continue;   // the run does not reach this junction
      // A through is only for a line marked on BOTH arms of the junction.
      // A run that ENDS at the junction (a terminating street, or the last
      // marked stretch) gets the kerb clip + corner bridge instead -
      // round 10: Brownlee's line was granted a through at Mellings and
      // its raw start point painted across Mellings' road (Andrew's
      // phone, 2026-10-28).
      const spansJ = GEO[n].cuts[run.firstIdx][0] < J.viA && J.viA < GEO[n].cuts[run.lastIdx][1];
      if (spansJ && throughOK(n, side, J, run.pts)) { skip.add(J); continue; }
      // own-street band across the mouth: the stretch on the other arm of
      // THIS street at this junction is complete - its solid band fills
      // the junction, so this side line runs unclipped to the vertex and
      // lands inside the band - provided no other street has a marked
      // side line here it could poke across.
      const otherArmBand = GEO[n].cuts.some((ab, ci) => (ab[0] === J.viA || ab[1] === J.viA) && (ci < run.firstIdx || ci > run.lastIdx) && H.pieces[n][ci] === 3);
      if (otherArmBand) {
        // Skip the clip only if following this line unclipped to the
        // vertex properly crosses NO other street's marked side line.
        // (Round 9 refinement: the first version refused whenever ANY
        // other street had marks at the junction - too coarse: at
        // Velmar x Flushing the line reaches the band without crossing
        // Flushing's line at all, and the refusal left it shy.)
        let crosses = false;
        const properX = (a, b, c, d) => { if (!segCross(a, b, c, d)) return false; const X = lineHit(a, b, c, d); return !!X && [a, b, c, d].every(pt => H.jDistM(X, pt) >= 0.35); };
        for (let si = 0; si + 1 < run.pts.length && !crosses; si++) {
          if (H.ptSegM(J.V, run.pts[si], run.pts[si + 1]) > CORRIDOR + 6) continue;
          for (const dn of H.names) {
            if (crosses) break;
            if (dn === n) continue;
            const gd = GEO[dn];
            for (const t of [0, 1]) {
              const marked = gd.cuts.some((ab, ci) => H.pieces[dn][ci] !== 3 && (H.pieces[dn][ci] & (1 << t)) && ab.some(v => H.jDistM(gd.stitched[v], J.V) < 16));
              if (!marked) continue;
              const off = t === 0 ? gd.off0 : gd.off1;
              for (let oi = 0; oi + 1 < off.length; oi++) {
                if (gd.gaps.has(oi + 1)) continue; // Beta 1.144: not a real segment (between two runs of dn)
                if (H.ptSegM(J.V, off[oi], off[oi + 1]) > 14) continue;
                if (properX(run.pts[si], run.pts[si + 1], off[oi], off[oi + 1])) { crosses = true; break; }
              }
              if (crosses) break;
            }
          }
        }
        if (!crosses) skip.add(J);
      }
    }
    let clipped = clipPieces([{ pts: run.pts, sTag: null, eTag: null }], n, CORRIDOR, skip);
    if (!clipped.length) clipped = clipPieces([{ pts: run.pts, sTag: null, eTag: null }], n, 3.4, skip);
    clipped.forEach(pc => {
      out.push({ pts: pc.pts, key: 'edge', mem, e0: pc.sTag ? { n, vi: pc.sTag.vi, side } : startMeta, e1: pc.eTag ? { n, vi: pc.eTag.vi, side } : endMeta });
    });
    run = null;
  };
  g.cuts.forEach((ab, idx) => {
    if (marked(idx)) {
      const sl = off.slice(ab[0], ab[1] + 1);
      if (run && run.lastIdx === idx - 1 && !g.gaps.has(ab[0])) { run.pts = run.pts.concat(sl.slice(1)); run.lastIdx = idx; } // Beta 1.144: consecutive pieces join into one strand only within a run - a piece that starts a new run (its first vertex is a gap start) always opens a fresh strand, so no painted line ever bridges the ground between a disconnected street's runs
      else { flush(); run = { pts: sl.slice(), firstIdx: idx, lastIdx: idx }; }
    } else flush();
  });
  flush();
  return out;
}
// Junction pairing: at every shared vertex, which marked side continues
// into which around their shared corner. A pair survives only when the
// corner path crosses no centreline segment near the junction.
// The TRUE corner of two side lines at a junction: the intersection of
// the two offset POLYLINES (both arms, segments near V), required to lie
// ON both segments. The round-4..8 corner used the intersection of two
// single segments' infinite lines, which at bending or slanted junctions
// lands off both lines (even on the far side of a centreline) - bridges
// built on it were then vetoed, leaving shy ends (gate12 evidence).
function polyCorner(n1, side1, n2, side2, V, vi1, vi2) {
  const o1 = side1 === 0 ? GEO[n1].off0 : GEO[n1].off1, o2 = side2 === 0 ? GEO[n2].off0 : GEO[n2].off1;
  const segsOf = (off, vi, gaps) => {
    const segs = [];
    for (let i = 0; i + 1 < off.length; i++) { if (gaps.has(i + 1)) continue; segs.push({ seg: [off[i], off[i + 1]], ext: false }); } // Beta 1.144 (verify cycle 2): the segment between two runs is not street - a corner found on it pairs sides at a junction that does not exist
    if (vi === 0 && off.length > 1) { const d = [off[0][0] - off[1][0], off[0][1] - off[1][1]], L = H.jDistM(off[0], off[1]) || 1; segs.push({ seg: [[off[0][0] + d[0] * 8 / L, off[0][1] + d[1] * 8 / L], off[0]], ext: true }); }
    if (vi === off.length - 1 && off.length > 1) { const e = off[off.length - 1], q = off[off.length - 2], d = [e[0] - q[0], e[1] - q[1]], L = H.jDistM(q, e) || 1; segs.push({ seg: [e, [e[0] + d[0] * 8 / L, e[1] + d[1] * 8 / L]], ext: true }); }
    return segs;
  };
  // an extension-derived corner is valid only if the leg from the
  // terminating line's end point to the corner stays on its own side of
  // the OTHER street's centreline (round 9: the unguarded extension let
  // Angie's line reach across Valeria to the far corner and paired
  // Valeria's east arm with Angie across the junction)
  const legCrosses = (endPt, X, otherN) => {
    const st = GEO[otherN].stitched;
    for (let si = 0; si + 1 < st.length; si++) { if (GEO[otherN].gaps.has(si + 1)) continue; if (H.ptSegM(V, st[si], st[si + 1]) < 13 && segCross(endPt, X, st[si], st[si + 1])) return true; } // Beta 1.144: gap segments are not centreline
    return false;
  };
  let best = null, bd = 1e9;
  for (const s1 of segsOf(o1, vi1, GEO[n1].gaps)) {
    if (H.ptSegM(V, s1.seg[0], s1.seg[1]) > 12) continue;
    for (const s2 of segsOf(o2, vi2, GEO[n2].gaps)) {
      if (H.ptSegM(V, s2.seg[0], s2.seg[1]) > 12) continue;
      const X = lineHit(s1.seg[0], s1.seg[1], s2.seg[0], s2.seg[1]);
      if (!X) continue;
      if (H.ptSegM(X, s1.seg[0], s1.seg[1]) > 0.35 || H.ptSegM(X, s2.seg[0], s2.seg[1]) > 0.35) continue;
      if (s1.ext && legCrosses(o1[vi1], X, n2)) continue;
      if (s2.ext && legCrosses(o2[vi2], X, n1)) continue;
      const d = H.jDistM(X, V); if (d < bd) { bd = d; best = X; }
    }
  }
  return best;
}
// A bridge path must not cross a MARKED side line either (gate12 found a
// bridge hopping over a third line at the Velmar x Flatbush cluster). The
// two lines being joined are excluded (the legs run along them), and a
// touch AT the bridge's own corner point is the join itself, not a cross.
function pathBadGreen(pts, J, excl, cornerPt) {
  for (const n2 of H.names) {
    const g2 = GEO[n2];
    for (const t of [0, 1]) {
      if (excl.has(n2 + '|' + t)) continue;
      const marked = g2.cuts.some((ab, ci) => H.pieces[n2][ci] !== 3 && (H.pieces[n2][ci] & (1 << t)) && ab.some(v => H.jDistM(g2.stitched[v], J) < 16));
      if (!marked) continue;
      const off = t === 0 ? g2.off0 : g2.off1;
      for (let si = 0; si + 1 < off.length; si++) {
        if (g2.gaps.has(si + 1)) continue; // Beta 1.144: not a real segment
        if (H.ptSegM(J, off[si], off[si + 1]) > 14) continue;
        for (let s2 = 0; s2 + 1 < pts.length; s2++) {
          if (!segCross(pts[s2], pts[s2 + 1], off[si], off[si + 1])) continue;
          const X = lineHit(pts[s2], pts[s2 + 1], off[si], off[si + 1]);
          if (!X) return true;
          if (cornerPt && H.jDistM(X, cornerPt) < 1.2) continue;
          return true;
        }
      }
    }
  }
  return false;
}
function junctionPairs() {
  const at = {};
  H.names.forEach(n => GEO[n].stitched.forEach((pt, vi) => { const k = coordKey(pt); (at[k] = at[k] || []).push({ n, vi }); }));
  const pairs = {};
  const link = (A, B, corner) => {
    const ka = A.n + '|' + A.vi + '|' + A.side, kb = B.n + '|' + B.vi + '|' + B.side;
    (pairs[ka] = pairs[ka] || []).push({ n2: B.n, vi2: B.vi, side2: B.side, corner });
    (pairs[kb] = pairs[kb] || []).push({ n2: A.n, vi2: A.vi, side2: A.side, corner });
  };
  Object.values(at).forEach(list => {
    if (new Set(list.map(e => e.n)).size < 2) return;
    const cand = [];
    list.forEach(({ n, vi }) => {
      const g = GEO[n];
      [0, 1].forEach(side => {
        const present = g.cuts.some((ab, ci) => vi >= ab[0] && vi <= ab[1] && (H.pieces[n][ci] & (1 << side)));
        if (present) cand.push({ n, vi, side, pt: (side === 0 ? g.off0 : g.off1)[vi] });
      });
    });
    for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) {
      const A = cand[i], B = cand[j];
      if (A.n === B.n) continue;
      if (H.jDistM(A.pt, B.pt) > 9.5) continue;
      const J = GEO[A.n].stitched[A.vi];
      const hitP = polyCorner(A.n, A.side, B.n, B.side, J, A.vi, B.vi);
      const pathBad = pts => {
        for (let s2 = 0; s2 + 1 < pts.length; s2++) {
          if (H.ptSegM(J, pts[s2], pts[s2 + 1]) < 1.5) return true;   // through the junction's middle = a mouth cut
          for (const n2 of H.names) {
            const st = GEO[n2].stitched;
            for (let si = 0; si + 1 < st.length; si++) {
              if (GEO[n2].gaps.has(si + 1)) continue; // Beta 1.144: not a real segment
              if (H.ptSegM(J, st[si], st[si + 1]) >= 13 || !segCross(pts[s2], pts[s2 + 1], st[si], st[si + 1])) continue;
              const X = lineHit(pts[s2], pts[s2 + 1], st[si], st[si + 1]);
              if (!X || H.jDistM(X, J) > 6) return true;   // corner-blob crossings sit at the offset distance (~3.3 m); far crossings are excursions
            }
          }
        }
        return false;
      };
      let pts = hitP && H.jDistM(hitP, J) < 10 ? [A.pt, hitP, B.pt] : [A.pt, B.pt];
      if (pathBad(pts)) pts = [A.pt, B.pt];
      if (pathBad(pts)) continue;
      link(A, B, pts.length === 3 ? pts[1] : null);
    }
  });
  // Canonicalize corners: corners at one junction that coincide (twin
  // corners from double vertices or multiple pairings at triple
  // junctions) snap to ONE point, so bridges land on the same spot
  // instead of weaving crossings centimetres apart (Bayside x Malden x
  // Cartwright, round 10).
  {
    const reps = new Map();
    const repOf = (J, pt) => {
      const key = coordKey(J);
      if (!reps.has(key)) reps.set(key, []);
      const list = reps.get(key);
      for (const r of list) if (H.jDistM(r, pt) < 0.5) return r;
      list.push(pt);
      return pt;
    };
    Object.keys(pairs).forEach(k => {
      const parts = k.split('|');
      const J = GEO[parts[0]].stitched[+parts[1]];
      pairs[k].forEach(pr => { if (pr.corner) pr.corner = repOf(J, pr.corner); });
    });
  }
  return pairs;
}
// Strand merging: join slices of one family whose ends touch (exact shared
// point) or, for edges, whose ends pair at a junction (bridge = the corner
// point). Any same-colour pairing at a junction renders as one shape, so
// merges simply run to a fixpoint, exact joins preferred over hops.
// Beta 1.136 (programme F): the bridge veto in ONE copy. Through 1.135 the identical
// function was defined privately inside both mergeStrands and bridgeStragglers;
// it lives at this level now and both passes call the same one, so the veto rule
// (a candidate path is bad when it passes within 1.5 m of the junction point, or
// crosses any street's line away from that junction) can never drift between them.
const pathBadNear = (pts, J) => {
    for (let s2 = 0; s2 + 1 < pts.length; s2++) {
      if (H.ptSegM(J, pts[s2], pts[s2 + 1]) < 1.5) return true;
      for (const n2 of H.names) {
        const st = GEO[n2].stitched;
        for (let si = 0; si + 1 < st.length; si++) {
          if (GEO[n2].gaps.has(si + 1)) continue; // Beta 1.144: not a real segment
          if (H.ptSegM(J, st[si], st[si + 1]) >= 13 || !segCross(pts[s2], pts[s2 + 1], st[si], st[si + 1])) continue;
          const X = lineHit(pts[s2], pts[s2 + 1], st[si], st[si + 1]);
          if (!X || H.jDistM(X, J) > 6) return true;
        }
      }
    }
    return false;
};
function mergeStrands(slices, pairs) {
  const rev = sl => ({ pts: [...sl.pts].reverse(), key: sl.key, mem: sl.mem, e0: sl.e1, e1: sl.e0 });
  const joinInfo = (a, b) => {
    const out = [];
    const aS = coordKey(a.pts[0]), aE = coordKey(a.pts[a.pts.length - 1]);
    [b, rev(b)].forEach(v => {
      if (coordKey(v.pts[0]) === aE) out.push({ score: 2, merged: { pts: a.pts.concat(v.pts.slice(1)), key: a.key, mem: a.mem.concat(v.mem), e0: a.e0, e1: v.e1 } });
      if (coordKey(v.pts[v.pts.length - 1]) === aS) out.push({ score: 2, merged: { pts: v.pts.concat(a.pts.slice(1)), key: a.key, mem: v.mem.concat(a.mem), e0: v.e0, e1: a.e1 } });
    });
    if (pairs) {
      [[a.e1, true], [a.e0, false]].forEach(([meta, atEnd]) => {
        if (!meta) return;
        (pairs[meta.n + '|' + meta.vi + '|' + meta.side] || []).forEach(pr => {
          const match = m => m && m.n === pr.n2 && m.vi === pr.vi2 && m.side === pr.side2;
          const bo = match(b.e0) ? b : match(b.e1) ? rev(b) : null;
          if (!bo) return;
          // vet the actual bridge path (from the real clip ends); try the
          // corner path, then the chord, else leave a gap at the corner
          const J = GEO[pr.n2].stitched[pr.vi2];
          const aEnd = atEnd ? a.pts[a.pts.length - 1] : a.pts[0];
          const bStart = bo.pts[0];   // bo is oriented so its start carries the matching meta
          let bridge = null;
          const exclG = new Set([meta.n + '|' + meta.side, pr.n2 + '|' + pr.side2]);
          if (pr.corner) {
            // retrace both lines' own points to the corner where they
            // exist; vet the RETRACED path (the actual paint), falling
            // back to the plain corner path, then the chord
            const rpA = rawPath(meta.n, meta.side, aEnd, pr.corner, J);
            const rpB = rawPath(pr.n2, pr.side2, bStart, pr.corner, J);
            const retraced = rpA && rpB ? rpA.concat([pr.corner], rpB.slice().reverse()) : null;
            if (retraced && !pathBadNear([aEnd].concat(retraced, [bStart]), J) && !pathBadGreen([aEnd].concat(retraced, [bStart]), J, exclG, pr.corner)) bridge = retraced;
            else if (!pathBadNear([aEnd, pr.corner, bStart], J) && !pathBadGreen([aEnd, pr.corner, bStart], J, exclG, pr.corner)) bridge = [pr.corner];
          }
          if (!bridge && !pathBadNear([aEnd, bStart], J) && !pathBadGreen([aEnd, bStart], J, exclG, null)) bridge = [];
          if (!bridge) return;
          if (atEnd) out.push({ score: 1, merged: { pts: a.pts.concat(bridge, bo.pts), key: a.key, mem: a.mem.concat(bo.mem), e0: a.e0, e1: bo.e1 } });
          else out.push({ score: 1, merged: { pts: [...bo.pts].reverse().concat(bridge.slice().reverse(), a.pts), key: a.key, mem: bo.mem.concat(a.mem), e0: bo.e1, e1: a.e1 } });
        });
      });
    }
    return out;
  };
  const arr = slices.slice();
  for (;;) {
    /** @type {{ i: number, j: number, score: number, merged: any } | null} */
    let best = null;
    for (let i = 0; i < arr.length; i++) for (let j = 0; j < arr.length; j++) {
      if (i === j || arr[i].key !== arr[j].key) continue;
      joinInfo(arr[i], arr[j]).forEach(c => { if (!best || c.score > best.score) best = { i, j, score: c.score, merged: c.merged }; });
    }
    if (!best) break;
    arr[best.i] = best.merged;
    arr.splice(best.j, 1);
  }
  return arr;
}
// Connection guarantee (Andrew, 2026-10-28, round 8): if two marked side
// lines end at the same junction corner, they CONNECT - "some connect and
// others are just shy of connecting" is a defect. The pairing bridges in
// mergeStrands catch most corners; this pass sweeps up stragglers on
// geometry alone: two chain ends whose junction vertices coincide, in
// the same quadrant of that junction, within reach, are joined by the
// first candidate path that crosses nothing - the side lines' own
// corner, the corridor box corner, or the chord.
function bridgeStragglers(chains, pairs) {
  // Round 9 (Andrew: "verify every single corner"): candidacy is purely
  // GEOMETRIC - any two chain ends within 10 m of the same junction point,
  // from different streets, in the same quadrant, within 13 m of each
  // other, get bridged. The round-8 pass keyed ends to the exact shared
  // vertex in their metadata, which could miss corners where the two
  // streets share several nearby vertices or a street ends just short of
  // the junction point.
  if (!JUNC) buildJunctions();
  const revC = c => ({ pts: [...c.pts].reverse(), key: c.key, mem: c.mem, e0: c.e1, e1: c.e0 });
  const dirLL = (n, vi) => {
    const st = GEO[n].stitched, gaps = GEO[n].gaps; // Beta 1.144: same run clamp as buildJunctions' dirAt
    const lo = gaps.has(vi) ? vi : Math.max(0, vi - 1), hi = gaps.has(vi + 1) ? vi : Math.min(st.length - 1, vi + 1);
    const a = XYOf(st[lo]), b = XYOf(st[hi]);
    const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
    return [dy / m / H.MLAT, dx / m / H.MLNG];
  };
  const pathLen = pts => { let L = 0; for (let i = 0; i + 1 < pts.length; i++) L += H.jDistM(pts[i], pts[i + 1]); return L; };
  const verts = Object.values(sharedVertexMap())
    .filter(list => new Set(list.map(e => e.n)).size >= 2)
    .map(list => GEO[list[0].n].stitched[list[0].vi]);
  for (let iter = 0; iter < 120; iter++) {
    let merged = false;
    outer:
    for (const V of verts) {
      const near = [];
      chains.forEach((c, ci) => {
        [{ at: 'e0', pt: c.pts[0], meta: c.e0 }, { at: 'e1', pt: c.pts[c.pts.length - 1], meta: c.e1 }].forEach(E => {
          if (E.meta && H.jDistM(E.pt, V) <= 10) near.push({ ci, ...E });
        });
      });
      for (const E1 of near) for (const E2 of near) {
        if (E1.ci === E2.ci || E1.meta.n === E2.meta.n) continue;
        if (H.jDistM(E1.pt, E2.pt) > 13) continue;
        const J1 = (JUNC[E1.meta.n] || []).find(x => x.B === E2.meta.n && H.jDistM(x.V, V) < 2);
        const J2 = (JUNC[E2.meta.n] || []).find(x => x.B === E1.meta.n && H.jDistM(x.V, V) < 2);
        if (!J1 || !J2) continue;
        const nA = J2.nB, nB = J1.nB, Vx = XYOf(V);
        const signs = pt => { const w = XYOf(pt); return [Math.sign((w[0] - Vx[0]) * nA[0] + (w[1] - Vx[1]) * nA[1]), Math.sign((w[0] - Vx[0]) * nB[0] + (w[1] - Vx[1]) * nB[1])]; };
        const s1 = signs(E1.pt), s2 = signs(E2.pt);
        const sameQ = !(s1[0] !== 0 && s2[0] !== 0 && s1[0] !== s2[0]) && !(s1[1] !== 0 && s2[1] !== 0 && s1[1] !== s2[1]);
        if (!sameQ) continue;
        const dA = dirLL(E1.meta.n, E1.meta.vi), dB = dirLL(E2.meta.n, E2.meta.vi);
        const along = (pt, d) => [pt[0] + d[0], pt[1] + d[1]];
        const corner = lineHit(E1.pt, along(E1.pt, dA), E2.pt, along(E2.pt, dB));
        const box = lineHit(E1.pt, along(E1.pt, dB), E2.pt, along(E2.pt, dA));
        // true corners first: the pairs corner (both lines' polylines),
        // then this pair's own polyline intersection
        let pairCorner = null;
        if (pairs) (pairs[E1.meta.n + '|' + E1.meta.vi + '|' + E1.meta.side] || []).forEach(pr => { if (pr.n2 === E2.meta.n && pr.vi2 === E2.meta.vi && pr.side2 === E2.meta.side && pr.corner) pairCorner = pr.corner; });
        const polyC = polyCorner(E1.meta.n, E1.meta.side, E2.meta.n, E2.meta.side, V, E1.meta.vi, E2.meta.vi);
        let bridge = null;
        if (H.jDistM(E1.pt, E2.pt) < 1.2) bridge = [];
        else for (const cand of [pairCorner ? [pairCorner] : null, polyC ? [polyC] : null, corner ? [corner] : null, box ? [box] : null, []]) {
          if (!cand) continue;
          const path = [E1.pt, ...cand, E2.pt];
          const cap = cand.length ? 22 : 15;   // legs along the true lines run long at slanted junctions; the chord stays tight
          const exclG = new Set([E1.meta.n + '|' + E1.meta.side, E2.meta.n + '|' + E2.meta.side]);
          if (pathLen(path) <= cap && !pathBadNear(path, V) && !pathBadGreen(path, V, exclG, cand.length ? cand[0] : null)) { bridge = cand; break; }
        }
        if (!bridge) continue;
        const ci2 = E1.at === 'e1' ? chains[E1.ci] : revC(chains[E1.ci]);
        const cj2 = E2.at === 'e0' ? chains[E2.ci] : revC(chains[E2.ci]);
        chains[E1.ci] = { pts: ci2.pts.concat(bridge, cj2.pts), key: ci2.key, mem: ci2.mem.concat(cj2.mem), e0: ci2.e0, e1: cj2.e1 };
        chains.splice(E2.ci, 1);
        merged = true;
        break outer;
      }
    }
    if (!merged) break;
  }
}
// Round 9: when the partner street's side line RUNS THROUGH this junction
// (throughOK), this street's clipped arm reaches the corner point - which
// lies ON the through line - so the arm touches it instead of stopping
// short (a T-join, not a crossing).
function throughTouch(chains, pairs) {
  chains.forEach(c => {
    /** @type {[string, boolean][]} */ ([['e1', true], ['e0', false]]).forEach(([key, atEnd]) => {
      const meta = c[key];
      if (!meta) return;
      (pairs[meta.n + '|' + meta.vi + '|' + meta.side] || []).forEach(pr => {
        if (!pr.corner) return;
        const endPt = atEnd ? c.pts[c.pts.length - 1] : c.pts[0];
        if (H.jDistM(endPt, pr.corner) > 12 || coordKey(endPt) === coordKey(pr.corner)) return;
        const onOther = chains.some(o => {
          if (o === c) return false;
          // the partner's OWN line must carry the corner (not just any chain)
          if (!o.mem.some(m => m.n === pr.n2 && m.side === pr.side2)) return false;
          for (let s2 = 0; s2 + 1 < o.pts.length; s2++) if (H.ptSegM(pr.corner, o.pts[s2], o.pts[s2 + 1]) < 1.0) return true;
          return false;
        });
        if (onOther) { if (atEnd) c.pts.push(pr.corner); else c.pts.unshift(pr.corner); }
      });
    });
  });
}
// An edge strand that ends at a junction whose partner stretch is COMPLETE
// reaches onto that band's corner point, so the line flows into the solid
// green instead of stopping short of it.
function extendIntoBands(edgeChains, pairs) {
  edgeChains.forEach(s => {
    [[s.e1, true], [s.e0, false]].forEach(([meta, atEnd]) => {
      if (!meta) return;
      (pairs[meta.n + '|' + meta.vi + '|' + meta.side] || []).forEach(pr => {
        if (!pr.corner) return;
        const g2 = GEO[pr.n2];
        const ci = g2.cuts.findIndex(ab => pr.vi2 >= ab[0] && pr.vi2 <= ab[1]);
        if (ci >= 0 && H.pieces[pr.n2][ci] === 3) s.pts = atEnd ? s.pts.concat([pr.corner]) : [pr.corner].concat(s.pts);
      });
    });
  });
}
let LASTCHAINS = null;
let PAIRS_CUR = null;   // the current build's junction pairs (throughOK reads them)
// Last-resort connector (Andrew's rule, enforced literally): if a marked
// side line still ends at a junction NOT joined to the marked geometry
// beside it in its corner, join it to the nearest point of that geometry -
// provided the join segment cuts no road's middle (veto v3) and properly
// crosses no other green line. Runs after every other pass; in the common
// case it fires zero times. (Gate12's holdouts - the Fifth/Angie
// name-change, Velmar x Flatbush, Velmar x Flushing - were ends whose
// corner bridges were vetoed against raw lines that the final paint
// clips away; this pass vets against the FINAL geometry instead.)
function lastResortConnect(edges, bands) {
  if (!JUNC) buildJunctions();
  const jList = Object.values(sharedVertexMap()).filter(l => new Set(l.map(e => e.n)).size >= 2)
    .map(l => ({ V: GEO[l[0].n].stitched[l[0].vi], streets: [...new Set(l.map(e => e.n))] }));
  const frameFor = (V, A, B) => {
    const J1 = (JUNC[A] || []).find(x => x.B === B && H.jDistM(x.V, V) < 2);
    const J2 = (JUNC[B] || []).find(x => x.B === A && H.jDistM(x.V, V) < 2);
    return (J1 && J2) ? { nA: J2.nB, nB: J1.nB } : null;
  };
  const properCross = (a, b, c, d) => {
    if (!segCross(a, b, c, d)) return false;
    const X = lineHit(a, b, c, d);
    return !!X && [a, b, c, d].every(pt => H.jDistM(X, pt) >= 0.35);
  };
  // LOCAL connectivity at a junction - the same fragment rules gate12
  // audits with, mirrored here so the mop-up and the audit agree. The
  // global component test this replaces called an end "satisfied" when
  // its chain touched the partner ANYWHERE on the route (round 10:
  // Fifth's line touches the Marconi band at another junction, so its
  // shy end at Marconi was never joined). Fragments are maximal runs
  // within 15 m plus entry segments; same-chain fragments link only on
  // a short hop - a route-long detour is not a connection at a corner.
  const fragCache = new Map();
  const localFrags = V => {
    const key = coordKey(V);
    if (fragCache.has(key)) return fragCache.get(key);
    const all = edges.concat(bands);
    const frags = [];
    all.forEach((c, ci) => {
      const band = ci >= edges.length;
      let cur = null;
      const close = () => { if (cur && cur.pts.length >= 1) frags.push(cur); cur = null; };
      c.pts.forEach((p, pi) => {
        if (H.jDistM(p, V) < 15) {
          if (!cur) {
            cur = { ci, band, pts: [] };
            if (pi > 0 && H.ptSegM(V, c.pts[pi - 1], p) < 15) cur.pts.push(c.pts[pi - 1]);
          }
          cur.pts.push(p);
        } else if (pi > 0 && H.ptSegM(V, c.pts[pi - 1], p) < 15) {
          if (cur) { cur.pts.push(p); close(); }
          else frags.push({ ci, band, pts: [c.pts[pi - 1], p] });
        } else close();
      });
      close();
    });
    const parent = frags.map((_, i) => i);
    const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
    const onLine = (p, f, thr) => { for (let s2 = 0; s2 + 1 < f.pts.length; s2++) if (H.ptSegM(p, f.pts[s2], f.pts[s2 + 1]) < thr) return true; return false; };
    const touch = (A2, B2) => {
      const eA = [A2.pts[0], A2.pts[A2.pts.length - 1]], eB = [B2.pts[0], B2.pts[B2.pts.length - 1]];
      if (eA.some(p => eB.some(q => coordKey(p) === coordKey(q)))) return true;
      const thr = (A2.band || B2.band) ? SURF_HALF : 1.0;   // Beta 1.181: the band threshold lives in the same scaled metre-world as SURF_HALF; Beta 1.208: bands draw at the surface's width, so the band touch threshold is SURF_HALF itself
      return eA.some(p => onLine(p, B2, thr)) || eB.some(p => onLine(p, A2, thr));
    };
    frags.forEach((A2, i) => frags.forEach((B2, j) => { if (j > i && touch(A2, B2)) parent[find(i)] = find(j); }));
    const byChain = new Map();
    frags.forEach((f, i) => { if (!byChain.has(f.ci)) byChain.set(f.ci, []); byChain.get(f.ci).push(i); });
    byChain.forEach(idxs => {
      for (let k = 0; k + 1 < idxs.length; k++) {
        const A2 = frags[idxs[k]], B2 = frags[idxs[k + 1]];
        const chain = all[A2.ci];
        const ia = chain.pts.findIndex(p => coordKey(p) === coordKey(A2.pts[A2.pts.length - 1]));
        const ib = chain.pts.findIndex(p => coordKey(p) === coordKey(B2.pts[0]));
        if (ia < 0 || ib < 0 || ib <= ia) continue;
        const mid = chain.pts.slice(ia + 1, ib);
        if (mid.length <= 3 && mid.every(p => H.jDistM(p, V) <= 30) && H.ptSegM(V, A2.pts[A2.pts.length - 1], B2.pts[0]) <= 15) parent[find(idxs[k])] = find(idxs[k + 1]);
      }
    });
    const out = { frags, comp: frags.map((_, i) => find(i)) };
    fragCache.set(key, out);
    return out;
  };
  for (let round = 0; round < 60; round++) {
    const list = edges.concat(bands);
    fragCache.clear();
    let acted = false;
    outer:
    for (const { V, streets } of jList) for (let ai = 0; ai < streets.length; ai++) for (let bi = ai + 1; bi < streets.length; bi++) {
      const A = streets[ai], B = streets[bi], fr = frameFor(V, A, B);
      if (!fr) continue;
      const Vx = XYOf(V);
      const signs = pt => { const w = XYOf(pt); return [Math.sign((w[0] - Vx[0]) * fr.nA[0] + (w[1] - Vx[1]) * fr.nA[1]), Math.sign((w[0] - Vx[0]) * fr.nB[0] + (w[1] - Vx[1]) * fr.nB[1])]; };
      const inQ = (sg, q) => (q[0] === 0 || sg[0] === 0 || sg[0] === q[0]) && (q[1] === 0 || sg[1] === 0 || sg[1] === q[1]);
      const nearChains = [];
      list.forEach((c, ci) => {
        if (!c.mem.some(m => m.n === A || m.n === B)) return;
        const pn = c.pts.filter(pt => H.jDistM(pt, V) < 11);
        if (pn.length) nearChains.push({ ci, pn });
      });
      const ends = [];
      edges.forEach((c, ci) => {
        [{ pt: c.pts[0], meta: c.e0, atEnd: false }, { pt: c.pts[c.pts.length - 1], meta: c.e1, atEnd: true }].forEach(E => {
          if (E.meta && (E.meta.n === A || E.meta.n === B) && H.jDistM(E.pt, V) < 11) ends.push({ ci, ...E });
        });
      });
      for (const E of ends) {
        const sg = signs(E.pt);
        const quads = [];
        (sg[0] === 0 ? [1, -1] : [sg[0]]).forEach(sa => (sg[1] === 0 ? [1, -1] : [sg[1]]).forEach(sb => quads.push([sa, sb])));
        let satisfied = false, partners = [];
        const LF = localFrags(V);
        const myFrag = LF.frags.findIndex(f => f.ci === E.ci && (coordKey(f.pts[0]) === coordKey(E.pt) || coordKey(f.pts[f.pts.length - 1]) === coordKey(E.pt)));
        for (const q of quads) {
          partners = nearChains.filter(nc => nc.ci !== E.ci && nc.pn.some(pt => inQ(signs(pt), q)));
          if (myFrag >= 0 && partners.some(nc => LF.frags.some((f, fi) => f.ci === nc.ci && LF.comp[fi] === LF.comp[myFrag] && f.pts.some(pt => inQ(signs(pt), q))))) { satisfied = true; break; }
          // its own chain, another fragment, carrying the other street -
          // paint that is continuous through the corner within one chain
          if (myFrag >= 0 && LF.frags.some((f, fi) => fi !== myFrag && LF.comp[fi] === LF.comp[myFrag] && list[f.ci].mem.some(m => m.n === (E.meta.n === A ? B : A)) && f.pts.some(pt => inQ(signs(pt), q)))) { satisfied = true; break; }
        }
        if (satisfied || !partners.length) continue;
        const cands = [];
        partners.forEach(nc => {
          const c = list[nc.ci];
          for (let si = 0; si + 1 < c.pts.length; si++) {
            const a = c.pts[si], b = c.pts[si + 1], ax = XYOf(a), bx = XYOf(b), ex = XYOf(E.pt);
            const dx = bx[0] - ax[0], dy = bx[1] - ax[1], L2 = dx * dx + dy * dy || 1;
            let t = ((ex[0] - ax[0]) * dx + (ex[1] - ax[1]) * dy) / L2;
            t = Math.max(0, Math.min(1, t));
            const np = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            cands.push({ d: H.jDistM(E.pt, np), np, ci: nc.ci, si });
          }
        });
        cands.sort((x, y) => x.d - y.d);
        for (const cand of cands) {
          if (cand.d > 13 || cand.d < 0.3) continue;
          const seg = [E.pt, cand.np];
          // Passing through the junction CENTRE mid-segment cuts across
          // the junction - vetoed. ENDING at the centre is different:
          // when the partner is a completed band whose chain ends AT V,
          // V is the only landing point there is (round 10: Angie x
          // Conti, Fifth x Marconi, Dianawood x Wilshire, Valeria x
          // Bell Harbour - all ends sat 6-7 m out, vetoed by their own
          // landings).
          let badPath = H.ptSegM(V, seg[0], seg[1]) < 1.5 && H.jDistM(cand.np, V) > 0.5;
          if (!badPath) for (const n2 of H.names) {
            const st = GEO[n2].stitched;
            for (let si = 0; si + 1 < st.length && !badPath; si++) {
              if (GEO[n2].gaps.has(si + 1)) continue; // Beta 1.144: not a real segment
              if (H.ptSegM(V, st[si], st[si + 1]) >= 13 || !segCross(seg[0], seg[1], st[si], st[si + 1])) continue;
              const X = lineHit(seg[0], seg[1], st[si], st[si + 1]);
              if (!X) continue;
              // Landing ON the target's centreline is the join itself,
              // not a crossing of the road (round 10: ends at band
              // junctions - Angie x Conti, Fifth x Marconi - were vetoed
              // by their own landing points, 6-7 m from V)
              if (H.jDistM(X, cand.np) < 1.5) continue;
              if (H.jDistM(X, V) > 6) badPath = true;
            }
          }
          if (badPath) continue;
          let badGreen = false;
          edges.forEach((c2, ci2) => {
            if (ci2 === E.ci || badGreen) return;
            for (let si = 0; si + 1 < c2.pts.length; si++) {
              if (ci2 === cand.ci && si === cand.si) continue;
              if (properCross(seg[0], seg[1], c2.pts[si], c2.pts[si + 1])) { badGreen = true; break; }
            }
          });
          if (badGreen) continue;
          const chain = edges[E.ci];
          if (E.atEnd) chain.pts.push(cand.np); else chain.pts.unshift(cand.np);
          acted = true;
          break outer;
        }
      }
    }
    if (!acted) break;
  }
}

// Round 10: touch every junction slice end to its corner BEFORE strands
// merge. mergeStrands can daisy-chain a slice into a mega-chain through
// other junctions, consuming the ends the corner join needed - the join
// then exists only via a route-long detour, which paints as a gap at the
// corner itself (Mellings' north arm at Brownlee, Andrew's phone
// 2026-10-28). Appending the vetted corner point to both partner slices'
// ends makes them share an exact endpoint, so the merge joins them AT
// the corner, first, before any daisy-chain can steal the ends.

// The raw offset line's own points between two points that both lie on
// it (a clip end and a corner), walking from fromPt toward toPt. Bridge
// paths retraced along the line itself cannot cross another line
// anywhere the raw lines do not (round 10: straight corner chords cut
// across bending neighbours - Santa Barbara x Columbus).
function rawPath(n, side, fromPt, toPt, V) {
  const off = side === 0 ? GEO[n].off0 : GEO[n].off1, gaps = GEO[n].gaps;
  let fi = -1;
  for (let s2 = 0; s2 + 1 < off.length; s2++) { if (gaps.has(s2 + 1)) continue; if (H.ptSegM(fromPt, off[s2], off[s2 + 1]) < 0.05) { fi = s2; break; } } // Beta 1.144: the segment between two runs is not part of the line - fromPt cannot lie on it, and the walk below never steps across it (a retraced bridge path stays inside the run both its points live in)
  if (fi < 0) return null;
  for (const dir of [1, -1]) {
    const pts = [];
    let k = dir === 1 ? fi + 1 : fi;
    for (let step = 0; step < 40; step++) {
      const p = off[k];
      if (!p) break;
      const segA = off[k - dir];
      if (segA && H.ptSegM(toPt, segA, p) < 0.05) return pts;
      if (H.jDistM(p, V) > 17) break;
      pts.push(p);
      const nk = k + dir;
      if (dir === 1 ? gaps.has(nk) : gaps.has(k)) break;
      k = nk;
      if (k < 0 || k >= off.length) break;
    }
  }
  return null;
}
function cornerTouchSlices(slices, pairs) {
  const endKeys = new Set();
  slices.forEach(sl => { [sl.e0, sl.e1].forEach(m => { if (m) endKeys.add(m.n + '|' + m.vi + '|' + m.side); }); });
  const properX = (a, b, c, d) => { if (!segCross(a, b, c, d)) return false; const X = lineHit(a, b, c, d); return !!X && [a, b, c, d].every(pt => H.jDistM(X, pt) >= 0.35); };
  slices.forEach(sl => {
    /** @type {[string, boolean][]} */ ([['e1', true], ['e0', false]]).forEach(([key, atEnd]) => {
      const meta = sl[key];
      if (!meta) return;
      const tried = new Set();
      for (const pr of (pairs[meta.n + '|' + meta.vi + '|' + meta.side] || [])) {
        if (!pr.corner || tried.has(coordKey(pr.corner))) continue;
        tried.add(coordKey(pr.corner));
        // Partner presence: the partner line is shown at this corner if
        // a slice of it ENDS here - or if it runs THROUGH and the corner
        // lies on the slice (a through line has no end at the junction:
        // Bloomingdale x Valeria, round 10 - the first version required
        // an end and skipped every terminating street at a through road).
        const partnerShown = endKeys.has(pr.n2 + '|' + pr.vi2 + '|' + pr.side2) || slices.some(o => o !== sl && o.mem.some(m => m.n === pr.n2 && m.side === pr.side2) && o.pts.some((p, pi) => pi + 1 < o.pts.length && H.ptSegM(pr.corner, p, o.pts[pi + 1]) < 1.0));
        if (!partnerShown) continue; // Beta 1.169 (Carbon fix round, B-03): SKIP, not stop - these three rejections (here, the range test below, the crossing veto) used to `return`, abandoning every remaining partner candidate for this end; at a multi-way junction a valid second-choice corner touch was never tried and the corner kept its gap. The loop's only stop is the `return` after a LANDED hop: one corner touch per end.
        const endPt = atEnd ? sl.pts[sl.pts.length - 1] : sl.pts[0];
        const d = H.jDistM(endPt, pr.corner);
        if (d < 0.05 || d > 12) continue;
        // vet: the short hop along this line to the corner must not
        // properly cross another street's marked side line
        const V = GEO[meta.n].stitched[meta.vi];
        let bad = false;
        for (const dn of H.names) {
          if (dn === meta.n || dn === pr.n2) continue;
          const gd = GEO[dn];
          for (const t2 of [0, 1]) {
            const marked = gd.cuts.some((ab, ci) => H.pieces[dn][ci] !== 3 && (H.pieces[dn][ci] & (1 << t2)) && ab.some(v => H.jDistM(gd.stitched[v], V) < 16));
            if (!marked) continue;
            const off = t2 === 0 ? gd.off0 : gd.off1;
            for (let s2 = 0; s2 + 1 < off.length && !bad; s2++) {
              if (gd.gaps.has(s2 + 1)) continue; // Beta 1.144 (verify cycle 2): the segment between two runs is not street - it cannot veto a corner hop
              if (H.ptSegM(V, off[s2], off[s2 + 1]) > 16) continue;
              if (properX(endPt, pr.corner, off[s2], off[s2 + 1])) bad = true;
            }
          }
          if (bad) break;
        }
        if (bad) continue;
        // Retrace the line's own clipped-away points up to the corner
        // where they exist, so the hop follows the line instead of
        // cutting a chord across whatever bends nearby.
        const rp = rawPath(meta.n, meta.side, endPt, pr.corner, V);
        const hop = rp && rp.length ? rp.concat([pr.corner]) : [pr.corner];
        if (atEnd) sl.pts.push(...hop); else sl.pts.unshift(...hop.slice().reverse());
        return;   // one corner touch per end
      }
    });
  });
}
// ---- road width (Beta 1.181, Andrew): the route paint curves, the
// side-offset geometry, the junction trims and the selection glow all
// live in one world scaled by this ONE number. The basemap carries
// its own factor, baked into its styles at generation time
// (scripts/genstyles.mjs, ROAD_WIDTH_K = 1.5, unchanged since 1.181).
// Beta 1.268 (Andrew, 2026-11-21): the two factors SPLIT - the
// basemap stays 1.5 and the PAINT narrows until it
// renders 1.20x the basemap road's own width (at 1.5, ~1.4x). THE PIN:
// WIDTH_K (here), ROAD_WIDTH_K (scripts/genstyles.mjs) and the 1.20
// ratio are one decision held in three places. Calibration, measured
// at Velmar, home framing (zoom 13.9792, pitch 45, day): at
// ROAD_WIDTH_K 1.5 the basemap road renders 6.7 px and WIDTH_K 1.08
// paints 6.7 px (1.0x), so the 1.20 ratio lands at WIDTH_K 1.30 -
// measured on the Beta 1.267 tree: paint 8.0 px against the road's
// 6.7 px = 1.19x (route-width sample 2026-11-21 and the WIDTHS
// round's own captures, widths-round-2026-11-21). If EITHER constant
// changes, the ratio must be re-measured before the change ships -
// the two systems drift apart silently otherwise.
const WIDTH_K = 1.3;
// ---- solid-paint end trims (Andrew, 2026-10-28, round 13): a wide
// solid (centre surface, completed band, or the selection redraw of
// one) ENDING at a junction must butt against the crossing street's
// paint - its square end's corners must never poke past the crossing
// street's far paint edge. The end is pulled back along its own street
// until both corners sit inside every crossing street's paint strip.
// Where the corners already sit inside (most junctions), nothing moves
// and same-colour paint stays seamless.
const SURF_HALF = 3.3 * WIDTH_K, HALF_HALF = 1.65 * WIDTH_K;   // geographic half-widths the GL paint curves track (base 3.3 m x WIDTH_K = 4.29 m at 1.3x; surfW ~8.58 m at working zooms). Beta 1.208 (Andrew: "make the green match the others"): the completed band draws at the surface's width, so all full-road paint shares ONE half-width - SURF_HALF (the old BAND_HALF 7.2 m is retired with the BANDW curve). HALF_HALF (2.145 m) is the one-side fill's own half-width: the fill ribbon is centred HALF_HALF from the centreline and spans centreline to kerb.
function ptSegDistM(p, a, b) {
  const P = XYOf(p), A = XYOf(a), B = XYOf(b);
  const vx = B[0] - A[0], vy = B[1] - A[1], L2 = vx * vx + vy * vy || 1;
  let t = ((P[0] - A[0]) * vx + (P[1] - A[1]) * vy) / L2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(P[0] - (A[0] + t * vx), P[1] - (A[1] + t * vy));
}
function endCorners(pts, atStart, half) {
  const E = atStart ? pts[0] : pts[pts.length - 1];
  if (!E) return [];
  // inner reference point: walk inward past duplicate / near-duplicate
  // vertices (junction points repeat in the traces - Velmar 33/34,
  // Mellings 4/5) until a point at least 1 m away gives a true heading
  let I = null;
  const order = pts.map((_, i) => atStart ? i : pts.length - 1 - i);
  for (const i of order.slice(1)) { if (H.jDistM(pts[i], E) >= 1) { I = pts[i]; break; } }
  if (!I) I = atStart ? pts[pts.length - 1] : pts[0];
  if (!I || I === E) return [];
  const P = XYOf(E), Q = XYOf(I);
  let dx = P[0] - Q[0], dy = P[1] - Q[1]; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  // TRUE corners: offset PERPENDICULAR to the heading - in xy the
  // perpendicular of (dx, dy) is (-dy, dx), so the lat offset comes
  // from dx and the lng offset from -dy. (Rounds 13-14 shipped the
  // components swapped - a reflection, not a rotation: the 'corners'
  // lay ALONG the street, and builder + audit shared the wrong test
  // consistently. Found by diag66 on synthetic axis-aligned cases.)
  return [[E[0] + (dx * half) / H.MLAT, E[1] + (-dy * half) / H.MLNG], [E[0] + (-dx * half) / H.MLAT, E[1] + (dy * half) / H.MLNG]];
}
function nearestPaintM(cp, B) {
  // distance from a point to street B's centreline AND the paint
  // half of the cut that owns the NEAREST segment. At junctions
  // where B's two arms carry different paint (a band arm beside a
  // surface arm, split by a double vertex), a corner must be judged
  // against the arm it actually lies along - judging it against
  // both arms' halves flags paint that is physically inside the
  // wider arm (round 14, Fifth x Valeria). Beta 1.208: band and
  // surface arms are one width now, so the owning cut's half is
  // always SURF_HALF; the per-cut tracking stays for the point.
  const st = GEO[B].stitched;
  let bd = 1e9, half = SURF_HALF, pt = null;
  for (let k = 0; k < st.length - 1; k++) {
    if (GEO[B].gaps.has(k + 1)) continue; // Beta 1.144: the between-runs pair is not a segment of B
    const d = ptSegDistM(cp, st[k], st[k + 1]);
    if (d < bd) { bd = d; half = SURF_HALF; pt = nearestPtOnSeg(cp, st[k], st[k + 1]); }
  }
  return { d: bd, half, pt };
}
function nearestPtOnSeg(p, a, b) {
  const P = XYOf(p), A = XYOf(a), B = XYOf(b);
  const vx = B[0] - A[0], vy = B[1] - A[1], L2 = vx * vx + vy * vy || 1;
  let t = ((P[0] - A[0]) * vx + (P[1] - A[1]) * vy) / L2; t = Math.max(0, Math.min(1, t));
  return [(A[1] + t * vy) / H.MLAT, (A[0] + t * vx) / H.MLNG];
}
function pokeExcess(cp, B, V) {
  // how far a paint corner pokes past street B's paint, or -1 when
  // the corner sits in B's END DISC: if the corner's nearest point
  // on B is the shared vertex itself, the corner lies beyond the
  // END of B's paint (B terminates at this junction), not beside
  // its strip - a square street end, not an overlap (round 14:
  // Bayside x Malden, Fifth x Bloomingdale, where pulling back only
  // ever moved the corner further from the vertex).
  const np = nearestPaintM(cp, B);
  if (np.pt && H.jDistM(np.pt, V) < 0.05) return -1;
  return np.d - np.half;
}
function pullbackEnd(pts, atStart, d) {
  // the slice with its end pulled straight back along its own trace
  // by d metres (new end point interpolated on the trace).
  const work = atStart ? pts.slice() : pts.slice().reverse();   // end-first
  let acc = 0;
  for (let k = 1; k < work.length; k++) {
    const seg = H.jDistM(work[k], work[k - 1]);
    if (acc + seg >= d) { const f = seg ? (d - acc) / seg : 0; const cut = [work[k - 1][0] + (work[k][0] - work[k - 1][0]) * f, work[k - 1][1] + (work[k][1] - work[k - 1][1]) * f]; const out = [cut].concat(work.slice(k)); return atStart ? out : out.reverse(); }
    acc += seg;
  }
  return pts;
}
function capLineFor(B, viB, Ix, Vx) {
  // The crossing street's NEAR paint edge beside this junction, as a
  // line {px, py, nx, ny} (point + unit normal pointing toward the
  // street being clipped). Built from B's actual arms: each arm
  // contributes its edge point at the vertex (V + armNormal * bHalf);
  // with two arms the cap line runs through both points, which is
  // what makes a BENT crossing street (Blackburn at Columbus) butt
  // cleanly - a single averaged direction leaves a corner past the
  // arm that bends away.
  const st = GEO[B].stitched, Vp = st[viB];
  let pPrev = null, pNext = null;
  for (let k = viB - 1; k >= 0; k--) { if (GEO[B].gaps.has(k + 1)) break; if (H.jDistM(st[k], Vp) >= 1) { pPrev = st[k]; break; } } // Beta 1.144: an arm is a direction within the vertex's own run - the scan never borrows a point from the run on the other side of a gap
  for (let k = viB + 1; k < st.length; k++) { if (GEO[B].gaps.has(k)) break; if (H.jDistM(st[k], Vp) >= 1) { pNext = st[k]; break; } }
  const arms = [];
  if (pPrev) arms.push(pPrev);
  if (pNext) arms.push(pNext);
  if (!arms.length) return null;
  const W = arms.map(p => {
    const P = XYOf(p);
    let ux = P[0] - Vx[0], uy = P[1] - Vx[1]; const m = Math.hypot(ux, uy) || 1; ux /= m; uy /= m;
    let nx = -uy, ny = ux;
    if ((Ix[0] - Vx[0]) * nx + (Ix[1] - Vx[1]) * ny < 0) { nx = -nx; ny = -ny; }
    // each arm's edge point uses THAT arm's paint half: at a
    // mixed-family bend (a band arm beside a surface arm) the true
    // near edge is the kinked line through both arms' own edges.
    // Beta 1.208: both arms' halves are SURF_HALF (one width for
    // all full-road paint); the kinked-line construction is unchanged.
    const half = SURF_HALF;
    return [Vx[0] + nx * half, Vx[1] + ny * half, nx, ny];
  });
  if (W.length === 2) {
    let cx = W[1][0] - W[0][0], cy = W[1][1] - W[0][1]; const m = Math.hypot(cx, cy);
    if (m >= 0.05) {
      // the kinked line is only meaningful when the street BENDS:
      // on a straight street both edge points sit on the SAME ray
      // from V (V + normal * each arm's half), so the line through
      // them is the ray itself - it crosses the street instead of
      // edging it, and passes through V (round 15, Fifth x
      // Greenpark: sd(V) read 0.00 and no clip ever fired). When
      // V's distance to the through-line is under 0.5 m, fall
      // through to the single-arm line below - at the WIDER arm's
      // edge, so a mixed-width junction (band arm beside a surface
      // arm) can leave a hairline notch but never an overlap.
      const ux = cx / m, uy = cy / m;
      const distV = Math.abs((Vx[0] - W[0][0]) * uy - (Vx[1] - W[0][1]) * ux);
      if (distV >= 0.5) { cx /= m; cy /= m; let nx = -cy, ny = cx; if ((Ix[0] - Vx[0]) * nx + (Ix[1] - Vx[1]) * ny < 0) { nx = -nx; ny = -ny; } return { px: W[0][0], py: W[0][1], nx, ny }; }
    }
  }
  const Wbest = W.length === 2 && Math.hypot(W[1][0] - Vx[0], W[1][1] - Vx[1]) > Math.hypot(W[0][0] - Vx[0], W[0][1] - Vx[1]) ? W[1] : W[0];
  return { px: Wbest[0], py: Wbest[1], nx: Wbest[2], ny: Wbest[3] };
}
function clipEndAtJunction(n, vi, pts, atStart, ownHalf) {
  // ROUND 14 - the edge clip (Andrew's rule, from his own screenshots:
  // every street butts against the crossing street exactly like the
  // red x yellow crossing - full width right up to the other road's
  // edge, no shrink, no gap, no overshoot). When this paint end's
  // square corners would poke past a crossing street's paint edge
  // (only possible when this paint is WIDER than the crossing paint),
  // the end is re-cut so its cap lies exactly along the crossing
  // street's NEAR paint edge: the final approach segment runs along
  // that edge's normal, so the painted cap is parallel to, and flush
  // with, the edge. When nothing pokes (equal or narrower paint) the
  // slice is returned untouched - which is why ordinary crossings
  // already butt perfectly. Repeats against every crossing street at
  // the vertex (triple junctions carry two constraints).
  if (pts.length < 2) return pts;
  if (!JUNC) buildJunctions();
  const entries = (JUNC[n] || []).filter(J => J.viA === vi);
  if (!entries.length) return pts;
  const V = GEO[n].stitched[vi];
  const grp = sharedVertexMap()[coordKey(V)] || [];
  const end0 = atStart ? pts[0] : pts[pts.length - 1];
  // candidate approach anchors at growing depths: a trace that bends
  // right at the junction (Fifth leaving the Bloomingdale corridor)
  // runs parallel to the crossing edge for its first metres, so the
  // nearest anchor cannot form the cap - a deeper one can.
  const inners = [];
  { let cum = 0; const marks = [1, 4.5, 9, 14]; let mi = 0;
    for (let k = 1; k < pts.length && mi < marks.length; k++) { const p = atStart ? pts[k] : pts[pts.length - 1 - k]; cum += H.jDistM(p, atStart ? pts[k - 1] : pts[pts.length - k]); if (cum >= marks[mi]) { inners.push(p); mi++; } } }
  if (!inners.length) return pts;
  const Vx = XYOf(V);
  const tried = new Set();
  for (let round = 0; round < 3; round++) {
    const corners = endCorners(pts, atStart, ownHalf);
    if (corners.length < 2) return pts;
    /** @type {{ J: any, ex: number, viB: number | null, bHalf: number } | null} */
    let worst = null;
    entries.forEach(J => {
      if (tried.has(J.B)) return;
      const ge = grp.find(e => e.n === J.B);
      corners.forEach(cp => { const ex = pokeExcess(cp, J.B, V); if (ex > 0.10 && (!worst || ex > worst.ex)) worst = { J, ex, viB: ge ? ge.vi : null, bHalf: nearestPaintM(cp, J.B).half }; });
      // END-PLANE trigger (round 15): when this paint ENDS at a
      // street that SPANS the junction, the corners land ON the
      // crossing strip (distance ~0), so the corner test is blind -
      // but the end plane itself sits inside the crossing paint,
      // halfway to its centreline (Kingsnorth's band covering half
      // of Santa Barbara's yellow - Andrew's screenshot, 2026-10-29).
      // Test instead: does the end or either corner cross the
      // crossing street's near paint-edge LINE (the very line the
      // cap will lie on)?
      if (ge) {
        const bst = GEO[J.B].stitched;
        const spans = (grp.filter(e => e.n === J.B)).some(e => e.vi > 0 && e.vi < bst.length - 1 && !GEO[J.B].gaps.has(e.vi) && !GEO[J.B].gaps.has(e.vi + 1)); // Beta 1.144: a vertex at a run end does not span the junction - the street terminates there even when it resumes elsewhere
        if (spans) {
          // capLineFor picks the near edge from the anchor's side,
          // and a trace can overshoot the crossing street before
          // its shared vertex (Greenpark crosses Fifth and doubles
          // back - its shallow anchors sit on the FAR side and pick
          // the wrong edge). Judge against EVERY anchor's cap line
          // and take the deepest reading: the correct edge shows
          // the true depth, wrong-edge lines read free-side.
          // capLineFor's normal points from the crossing street
          // TOWARD this street: inside the crossing paint is the
          // NEGATIVE side (diag71: the vertex itself reads -3.30).
          let exL = -1;
          inners.forEach(inp => {
            const capT = capLineFor(J.B, ge.vi, XYOf(inp), Vx);
            if (!capT) return;
            const sd = p => { const X = XYOf(p); return (X[0] - capT.px) * capT.nx + (X[1] - capT.py) * capT.ny; };
            exL = Math.max(exL, -Math.min(sd(end0), sd(corners[0]), sd(corners[1])));
          });
          if (exL > 0.10 && (!worst || exL > worst.ex)) worst = { J, ex: exL, viB: ge.vi, bHalf: nearestPaintM(end0, J.B).half };
        }
      }
    });
    if (!worst) return pts;
    tried.add(worst.J.B);
    if (worst.viB === null) continue;
    let applied = false;
    for (const inner of inners) {
      const Ix = XYOf(inner);
      const dv = [Vx[0] - Ix[0], Vx[1] - Ix[1]];
      const cap = capLineFor(worst.J.B, worst.viB, Ix, Vx);
      if (!cap) continue;
      const denom = dv[0] * cap.nx + dv[1] * cap.ny;
      if (Math.abs(denom) < 0.12) continue;   // this anchor runs parallel to the crossing edge: try a deeper one
      const t = ((cap.px - Ix[0]) * cap.nx + (cap.py - Ix[1]) * cap.ny) / denom;
      if (t <= 0.05 || t > 1.6) continue;
      const Ex = [Ix[0] + t * dv[0], Ix[1] + t * dv[1]];
      const E = [Ex[1] / H.MLAT, Ex[0] / H.MLNG];   // new end point: ON the crossing street's near paint edge
      const L = 4;   // the final approach runs L metres along the edge's normal
      // ROUND 41 HYBRID (Andrew-approved trial): the corrected approach
      // (PLUS - approach point on this street's own side) applies ONLY
      // when the crossing street RUNS THROUGH the junction (an interior
      // vertex there): its paint is continuous, so this strand can butt
      // flush against its near edge. When the crossing street also ENDS
      // at the junction, keep the ROUND 39 behaviour (MINUS): r40's
      // oracle A/B proved the old overshoot is what covers the shared
      // centre there - stopping short on both sides opens a hole
      // (Fifth x Greenpark 104 m2, Columbus x Santa Barbara 90 m2).
      const bSt = GEO[worst.J.B].stitched;
      const bSpans = grp.filter(e => e.n === worst.J.B).some(e => e.vi > 0 && e.vi < bSt.length - 1 && !GEO[worst.J.B].gaps.has(e.vi) && !GEO[worst.J.B].gaps.has(e.vi + 1)); // Beta 1.144 (verify cycle 2): the same run-boundary rule as the spans predicate above - a vertex at a run end does not span the junction
      const P = bSpans ? [(Ex[1] + cap.ny * L) / H.MLAT, (Ex[0] + cap.nx * L) / H.MLNG]
                       : [(Ex[1] - cap.ny * L) / H.MLAT, (Ex[0] - cap.nx * L) / H.MLNG];
      const cumE = (1 - t) * Math.hypot(dv[0], dv[1]);
      // work in END-FIRST order (work[0] = the end being cut)
      // whichever end it is, build the new end-first array, then
      // restore the caller's orientation. (Round 14's first build
      // had this inverted - it prepended the new end at the FAR end
      // of the slice; Property 5 exists because the end-only audit
      // missed the scramble.)
      const work = atStart ? pts.slice() : pts.slice().reverse();
      let cum = 0, ki = work.length - 1;
      for (let k = 1; k < work.length; k++) { cum += H.jDistM(work[k], work[k - 1]); if (cum > cumE + L * 1.05) { ki = k; break; } }
      const nw = [E, P].concat(work.slice(ki));
      pts = atStart ? nw : nw.reverse();
      applied = true;
      break;
    }
    if (!applied) {
      // MERGE FALLBACK: the cap solve found no feasible anchor -
      // this street does not cross the other, it runs INTO it nearly
      // parallel (Fifth leaving the Bloomingdale corridor, Bayside
      // at the Malden/Cartwright triple). There is no edge to butt
      // against; pull the end straight back along its own trace to
      // the first depth whose true corners clear every crossing
      // street's paint - the paint merges into the other street
      // instead of poking across it.
      for (let d = 0.25; d <= 8.01; d += 0.25) {
        const cand = pullbackEnd(pts, atStart, d);
        const cc = endCorners(cand, atStart, ownHalf);
        if (cc.length < 2) break;
        let okAll = true;
        entries.forEach(J => { cc.forEach(cp => { if (pokeExcess(cp, J.B, V) > 0.10) okAll = false; }); });
        if (okAll) { pts = cand; break; }
      }
      continue;
    }
  }
  return pts;
}
function clipStrandEnds(strands, half, guideFor, skipEnd) {
  // post-merge pass: a merged strand can still END at a junction even
  // when its paint family continues on the same street - mergeStrands
  // refuses a join whose corner path is unsafe, and the two caps then
  // sit back to back at the vertex with raw corners (round 14 diag:
  // Columbus bands ending at Santa Barbara / Blackburn). The
  // per-slice clip never sees those ends (no family change there),
  // so clip every strand end that sits exactly on a junction vertex.
  strands.forEach(sl => {
    if (!sl.mem || !sl.mem.length) return;
    [true, false].forEach(atStart => {
      if (skipEnd && skipEnd(sl, atStart)) return;   // Beta 1.208 (gate round 3): bands skip ends whose green continues as a neighbouring piece's fill - clipping them would reopen the fill/band break this round closed
      const E = atStart ? sl.pts[0] : sl.pts[sl.pts.length - 1];
      if (!E) return;
      const grp = sharedVertexMap()[coordKey(E)] || [];
      if (new Set(grp.map(e => e.n)).size < 2) return;
      const A = atStart ? sl.mem[0].n : sl.mem[sl.mem.length - 1].n;
      const ent = grp.find(e => e.n === A);
      if (!ent) return;
      const guide = guideFor ? guideFor(sl, atStart) : null;
      sl.pts = guide ? clipOnLine(A, ent.vi, sl.pts, atStart, half, guide) : clipEndAtJunction(A, ent.vi, sl.pts, atStart, half);
    });
  });
}
function nearestOnLine(p, line) {
  // the point on the polyline nearest p (flat-metre projection per segment)
  const P = XYOf(p);
  let best = null, bd = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const A = XYOf(line[i]), B = XYOf(line[i + 1]);
    const vx = B[0] - A[0], vy = B[1] - A[1], L2 = vx * vx + vy * vy || 1;
    let t = ((P[0] - A[0]) * vx + (P[1] - A[1]) * vy) / L2; t = Math.max(0, Math.min(1, t));
    const qx = A[0] + t * vx, qy = A[1] + t * vy, d = Math.hypot(P[0] - qx, P[1] - qy);
    if (d < bd) { bd = d; best = [qy / H.MLAT, qx / H.MLNG]; }
  }
  return best || p;
}
function clipOnLine(n, vi, pts, atStart, ownHalf, line) {
  // clipEndAtJunction for an OFFSET line (a fill's half-offset line):
  // the generic re-cut solves its new end along the street's
  // CENTRELINE (its approach anchors on GEO[n].stitched), which drags
  // an offset line's end sideways toward the middle of the road -
  // Codex P2 on PR #83, reproduced on the proof network: a fill
  // stopping at a junction ended 0.6 m from the centreline instead of
  // 2.475 m, spilling green onto the unfinished side. The cap POSITION
  // the solve finds (flush on the crossing street's near paint edge)
  // is right; only the lateral placement is wrong for an offset line.
  // So: run the generic clip, then move its inserted end pair (the
  // solved end E and its approach point P - the re-cut inserts
  // exactly those two) so E sits at the intersection of the crossing
  // paint edge's line with THIS line, translating the pair by the
  // same vector: the cap stays parallel to the crossing edge and
  // centred on it (both cap corners on the edge line), the approach
  // keeps the solve's edge-normal shape, and E rides the offset line
  // exactly. (Gate round 3, Codex P2: the first build PROJECTED the
  // pair onto the line - exact at perpendicular crossings, but at a
  // 45° crossing the nearest point is not the intersection, and the
  // cap corners landed at 4.4 / 7.9 m from the crossing centreline
  // instead of both on the 4.95 m edge - a ~3 m wedge. Intersection,
  // not projection.) Points the clip left alone are the line's own
  // and never move; two slices ending back to back at a junction
  // solve the same intersection, so exact joins survive. When the
  // pair shape is unexpected (or the lines run near-parallel), the
  // projection remains as the fallback.
  const out = clipEndAtJunction(n, vi, pts, atStart, ownHalf);
  if (out === pts) return out;
  const own = new Set(line);
  const res = out.slice();
  const ins = [];
  for (let k = 0; k < res.length; k++) {
    const i = atStart ? k : res.length - 1 - k;
    if (own.has(res[i])) break;
    ins.push(i);
  }
  let done = false;
  if (ins.length === 2) {
    const sIdx = atStart ? ins[1] + 1 : ins[1] - 1;
    const s2Idx = atStart ? sIdx + 1 : sIdx - 1;
    if (res[sIdx] && res[s2Idx]) {
      const E = XYOf(res[ins[0]]), P = XYOf(res[ins[1]]);
      const seg = [P[0] - E[0], P[1] - E[1]], sl = Math.hypot(seg[0], seg[1]) || 1;
      const cap = [-seg[1] / sl, seg[0] / sl];
      const S0 = XYOf(res[sIdx]), S1 = XYOf(res[s2Idx]);
      const hd = [S0[0] - S1[0], S0[1] - S1[1]], hl = Math.hypot(hd[0], hd[1]) || 1; hd[0] /= hl; hd[1] /= hl;
      const den = cap[0] * hd[1] - cap[1] * hd[0];
      if (Math.abs(den) > 0.2) {
        const rx = S0[0] - E[0], ry = S0[1] - E[1];
        const lam = (rx * hd[1] - ry * hd[0]) / den;
        const Ex = [E[0] + lam * cap[0], E[1] + lam * cap[1]];
        const ExLL = [Ex[1] / H.MLAT, Ex[0] / H.MLNG];
        // the validity window: the local segment extension can run
        // away at a bent, skewed T (the intersection lands metres
        // past the junction, across the crossing centreline) - accept
        // the intersection only when it stays near the solved end AND
        // near the line itself; otherwise the projection below is
        // the bounded fallback.
        if (Math.hypot(Ex[0] - E[0], Ex[1] - E[1]) <= 6 && H.jDistM(ExLL, nearestOnLine(ExLL, line)) <= 0.9) {
          res[ins[0]] = ExLL;
          res[ins[1]] = [(Ex[1] + seg[1]) / H.MLAT, (Ex[0] + seg[0]) / H.MLNG];
          done = true;
        }
      }
    }
  }
  if (!done) for (const i of ins) res[i] = nearestOnLine(res[i], line);
  const dd = [res[0]];
  for (let i = 1; i < res.length; i++) if (H.jDistM(res[i], dd[dd.length - 1]) > 0.05) dd.push(res[i]);
  if (dd.length < 2) dd.push(res[res.length - 1]);
  return dd.length >= 2 ? dd : out;
}
function fillSlicePts(n, idx, side) {   // Beta 1.208: one piece's one-side FILL slice - the half-offset line over the piece, end-trimmed with the centre family's local rule (trim only where THIS side's fill actually ends: the neighbouring piece carries no fill for this side, a run gap intervenes, or the street ends). Shared by buildFamilies and buildSelFill, so the selection's side paint is the board's side paint by construction - the R3 fix (the retired one-piece edge rebuild could never reproduce the board's junction treatment).
  const g = GEO[n], ab = g.cuts[idx];
  const fam = i => { const b = H.pieces[n][i]; return ((b & (1 << side)) || b === 3) ? 'fill' : 'x' + b; };   // Beta 1.208 (Codex P2, gate round 3): a both-sides piece CONTINUES this side's paint (its band covers the side in full), so the fill keeps its shared vertex beside a band instead of clipping to the near edge - clipping on both sides of the boundary left the junction square's half unpainted, a 9.9 m break in the completed side
  const line = side === 0 ? g.offH0 : g.offH1;
  let pts = line.slice(ab[0], ab[1] + 1);
  if (idx === 0 || g.gaps.has(ab[0]) || fam(idx - 1) !== 'fill') pts = clipOnLine(n, ab[0], pts, true, HALF_HALF, line);
  if (idx === g.cuts.length - 1 || g.gaps.has(g.cuts[idx + 1][0]) || fam(idx + 1) !== 'fill') pts = clipOnLine(n, ab[1], pts, false, HALF_HALF, line);
  return pts;
}
function fillCornerLinks(fills) {
  // Beta 1.208 (Codex P2, gate round 2): the corner wrap for fills.
  // A fill ends flush at the crossing street's near paint edge - the
  // right end for a lone side - but where one street's marked side
  // TURNS A CORNER into another street's marked side (the two sides
  // of one continuous kerb line around the junction's corner), the
  // two ends face each other across the junction square and the
  // green pinched there instead of wrapping the corner (the retired
  // kerb-line paint traced the kerb around corners via its own
  // corner slices; the fills had no corner treatment). The wrap: for
  // every pair of fill ends at one junction vertex (different
  // streets) whose half lines meet on both ends' forward extensions,
  // add a connector strand [end, corner point, end] - the corner
  // point is the two half lines' own intersection, so the connector's
  // ribbon (the same half-surface width) bends around the corner on
  // exactly the path the two fills were already following. Through
  // pairs never qualify (same street, or near-parallel lines), and a
  // lone side earns no connector - it still ends at the near edge.
  const verts = [];
  const svm = sharedVertexMap();
  for (const k in svm) { const g = svm[k]; if (new Set(g.map(e => e.n)).size >= 2) verts.push(GEO[g[0].n].stitched[g[0].vi]); }
  if (!verts.length) return;
  const ends = [];
  fills.forEach(sl => {
    if (!sl.mem || !sl.mem.length || sl.pts.length < 2) return;
    [[sl.mem[0], sl.pts[0], sl.pts[1]], [sl.mem[sl.mem.length - 1], sl.pts[sl.pts.length - 1], sl.pts[sl.pts.length - 2]]].forEach(([m, E, I]) => {
      if (!m || m.side === undefined) return;
      const Exy = XYOf(E), Ixy = XYOf(I);
      const dx = Exy[0] - Ixy[0], dy = Exy[1] - Ixy[1], L = Math.hypot(dx, dy) || 1;
      ends.push({ E, Exy, dir: [dx / L, dy / L], mem: m });
    });
  });
  const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
    const a = ends[i], b = ends[j];
    if (a.mem.n === b.mem.n) continue;
    const V = verts.find(v => H.jDistM(v, a.E) <= 7.5 && H.jDistM(v, b.E) <= 7.5);
    if (!V) continue;
    const den = cross(a.dir, b.dir);
    if (Math.abs(den) < 0.35) continue;   // near-parallel: a through pair, not a corner
    const rx = b.Exy[0] - a.Exy[0], ry = b.Exy[1] - a.Exy[1];
    const t = cross([rx, ry], b.dir) / den, s = cross([rx, ry], a.dir) / den;
    if (t < 0.3 || s < 0.3 || t > 13 || s > 13) continue;   // the corner must lie on BOTH forward extensions, within reach
    const Cxy = [a.Exy[0] + t * a.dir[0], a.Exy[1] + t * a.dir[1]];
    const Vxy = XYOf(V);
    if (Math.hypot(Cxy[0] - Vxy[0], Cxy[1] - Vxy[1]) > 8) continue;
    fills.push({ pts: [a.E, [Cxy[1] / H.MLAT, Cxy[0] / H.MLNG], b.E], key: 'fill', mem: [a.mem, b.mem], corner: true });   // the corner flag is explicit (gate round 4, Codex P2): an ordinary strand merged from two consecutive pieces ALSO carries two mem entries, so mem-count alone cannot identify a connector
  }
}
// ===== Beta 1.259: boundary-end feathers (Andrew's decision, 2026-11-20,
// option C - flush sampled twice and rejected). Where route paint ends at a
// boundary while the street continues, the paint ends AT the join (the
// boundary street's first centreline, recorded in the pack by
// computeBoundaryEnds, create-packs.js) with a smooth gradient fade over the
// last 15 m, gone exactly at the join. The split below is the engine's half:
// for a slice whose end vertex carries a record, the slice is cut at the
// join (the overshoot stub past it is dropped whole), the last fade-length
// metres before the join become a FADE feature of their own - emitted
// outside mergeStrands into the lineMetrics 'fades'/'selFades' sources,
// ordered solid-seam first so line-progress runs full colour -> clear -
// and the rest stays an ordinary solid slice. Junction ends are defended
// twice: a record is only ever written for a non-junction end, and a slice
// end whose vertex another route street shares is never split here
// (sharedVertexMap), so the junction machinery's run-through is untouched
// by construction. Beta 1.267: dead ends carry records too (computeDeadEnds,
// create-packs.js) - their join is the end itself, so the same split fades
// the last 10 m into the terminus; pick ends still carry no record and keep
// their natural end.
const FADE_M = 15; // Beta 1.267: no longer the rule - the fade length is PER-RECORD data (record element 5, written by the end computations in create-packs.js: 15 boundary, 10 dead). This constant is only the default for a legacy 4-element record that carries no length of its own.
function fadeMOf(rec) { return (rec && isFinite(rec[4]) && rec[4] > 0) ? rec[4] : FADE_M; }
function boundaryRecAt(n, pt) { // the street's end record (boundary or dead) whose END point is pt, or null
  const ends = H.STRETCH[n] && H.STRETCH[n].ends;
  if (!ends) return null;
  for (const r of ends) if (H.jDistM([r[0], r[1]], pt) <= 1.5) return r;
  return null;
}
function splitBoundaryEnd(pts, join, atStart, fadeM) { // -> { solid, fade }: cut pts at the join (found by projection, XY space) and split off the fade zone (fadeM metres, the record's own length); either part can be null when the slice is shorter than the zone it would carry
  const fm = isFinite(fadeM) && fadeM > 0 ? fadeM : FADE_M;
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + H.jDistM(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1];
  const J = XYOf(join);
  let dJ = null, bestD = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const A = XYOf(pts[i - 1]), B = XYOf(pts[i]);
    const vx = B[0] - A[0], vy = B[1] - A[1], L2 = vx * vx + vy * vy;
    let t = L2 ? ((J[0] - A[0]) * vx + (J[1] - A[1]) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const dd = Math.hypot(J[0] - (A[0] + vx * t), J[1] - (A[1] + vy * t));
    if (dd < bestD) { bestD = dd; dJ = cum[i - 1] + Math.sqrt(L2) * t; }
  }
  if (dJ === null) return { solid: pts, fade: null };
  const sub = (d0, d1) => { // the points between two along-distances, cut points interpolated (sliceLine's way)
    if (d1 - d0 < 0.05) return null;
    const at = d => { for (let i = 1; i < pts.length; i++) { if (d <= cum[i] || i === pts.length - 1) { const span = cum[i] - cum[i - 1] || 1; const t = Math.max(0, Math.min(1, (d - cum[i - 1]) / span)); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; } } return pts[pts.length - 1]; };
    const out = [at(d0)];
    for (let i = 0; i < pts.length; i++) if (cum[i] > d0 && cum[i] < d1) out.push(pts[i]);
    out.push(at(d1));
    return out.length > 1 ? out : null;
  };
  if (!atStart) return { solid: sub(0, Math.max(0, dJ - fm)), fade: sub(Math.max(0, dJ - fm), dJ) };
  const fadePts = sub(dJ, Math.min(total, dJ + fm));
  return { solid: sub(Math.min(total, dJ + fm), total), fade: fadePts ? fadePts.reverse() : null }; // a run-start fade is ordered seam -> join like every other: the slice's own order runs join-first there, so it reverses
}
function boundarySplit(n, ab, pts, kind, col, withCasing) { // -> { solid, fades }: apply the boundary-end split at both of a slice's ends (a one-piece run can carry two). ab indexes GEO[n].stitched - the record match is judged on the STITCHED vertex, so a fill slice on its offset line splits by the same record, at the point nearest the join on its own line.
  let solid = pts; const fades = [];
  const g = GEO[n];
  for (const atStart of [true, false]) {
    if (!solid || solid.length < 2) break;
    const vtx = atStart ? g.stitched[ab[0]] : g.stitched[ab[1]];
    const rec = boundaryRecAt(n, vtx);
    if (!rec) continue;
    const svm = sharedVertexMap();
    if ((svm[coordKey(vtx)] || []).some(e => e.n !== n)) continue; // a vertex another route street shares is a junction, whatever the pack says
    const sp = splitBoundaryEnd(solid, [rec[2], rec[3]], atStart, fadeMOf(rec)); // Beta 1.267: the record's own fade length (a dead end's join is its end point, so its split lands exactly at the terminus)
    if (sp.fade) { fades.push({ pts: sp.fade, k: kind, col }); if (withCasing) fades.push({ pts: sp.fade, k: 'x', col }); }
    solid = sp.solid;
  }
  return { solid, fades };
}
function buildFamilies() {
  THROUGH_SEGS = [];
  const pairs = junctionPairs();
  PAIRS_CUR = pairs;
  const centreSlices = [], bandSlices = [], edgeSlices = [], fillSlices = [], fadeSlices = [];
  H.names.forEach(n => {
    const g = GEO[n];
    g.cuts.forEach((ab, idx) => {
      const bits = H.pieces[n][idx];
      let cPts = g.stitched.slice(ab[0], ab[1] + 1);
      const isBand = bits === 3;
      const key = isBand ? 'band' : mute(colOf(n, bits));
      const famKey = i => H.pieces[n][i] === 3 ? 'band' : mute(colOf(n, H.pieces[n][i]));
      const ownHalf = SURF_HALF;   // Beta 1.208: bands draw at the surface's width, so a band end trims against the same half-width as a surface end
      // clip an end only where the paint actually ends there: the
      // neighbouring cut is a different family/colour, or the street
      // ends. A continuing family keeps its exact shared vertex, so
      // mergeStrands still joins it seamlessly.
      if (idx === 0 || g.gaps.has(ab[0]) || famKey(idx - 1) !== key) cPts = clipEndAtJunction(n, ab[0], cPts, true, ownHalf); // Beta 1.144: a run-start piece's leading end is a street end for its run - it earns the junction clip even when the previous piece (another run's end) wears the same family
      if (idx === g.cuts.length - 1 || g.gaps.has(g.cuts[idx + 1][0]) || famKey(idx + 1) !== key) cPts = clipEndAtJunction(n, ab[1], cPts, false, ownHalf);
      if (isBand) {   // Beta 1.208 (Codex P2, gate round 3): the band's own clip rule is per-side-paint, not per-family - a band end clips only where the GREEN fully ends (the neighbouring piece carries no marked side at all). Beside a one-side piece the band keeps its shared vertex, meeting the fill that starts there; clipping on both sides of that boundary left the junction square's half unpainted (a 9.9 m break in the completed side, LongAve [1,3,3] in the proof network). Recomputed from the stitched slice so the centre family's rule above is untouched.
        let bPts = g.stitched.slice(ab[0], ab[1] + 1);
        if (idx === 0 || g.gaps.has(ab[0]) || H.pieces[n][idx - 1] === 0) bPts = clipEndAtJunction(n, ab[0], bPts, true, ownHalf);
        if (idx === g.cuts.length - 1 || g.gaps.has(g.cuts[idx + 1][0]) || H.pieces[n][idx + 1] === 0) bPts = clipEndAtJunction(n, ab[1], bPts, false, ownHalf);
        const bSp = boundarySplit(n, ab, bPts, 'b', MUGREEN, true); // Beta 1.259: a band at a boundary end feathers like every other family
        for (const f of bSp.fades) fadeSlices.push(f);
        if (bSp.solid) bandSlices.push({ pts: bSp.solid, key: 'band', mem: [{ n, idx }], e0: null, e1: null });
      }
      else { const cSp = boundarySplit(n, ab, cPts, 'c', key, true); for (const f of cSp.fades) fadeSlices.push(f); if (cSp.solid) centreSlices.push({ pts: cSp.solid, key, mem: [{ n, idx }], e0: null, e1: null }); }
      if (!isBand && bits !== 0) [0, 1].forEach(side => { if (bits & (1 << side)) { const fSp = boundarySplit(n, ab, fillSlicePts(n, idx, side), 'f', MUGREEN, false); for (const f of fSp.fades) fadeSlices.push(f); if (fSp.solid) fillSlices.push({ pts: fSp.solid, key: 'fill', mem: [{ n, idx, side }], e0: null, e1: null }); } });   // Beta 1.208: a one-side-done piece also emits its side's FILL (the half-road green Andrew ordered in place of the kerb outline). Beta 1.259: the fill feathers at a boundary end too, split on its own half-offset line at the point nearest the join
    });
    [0, 1].forEach(side => {
      edgeRunSlices(n, side, idx => H.pieces[n][idx] !== 3 && (H.pieces[n][idx] & (1 << side))).forEach(sl => edgeSlices.push(sl));
    });
  });
  const centres = mergeStrands(centreSlices, null);
  const bands = mergeStrands(bandSlices, null);
  clipStrandEnds(centres, SURF_HALF);
  clipStrandEnds(bands, SURF_HALF, null, (sl, atStart) => { const m = atStart ? sl.mem[0] : sl.mem[sl.mem.length - 1]; if (!m) return false; const g = GEO[m.n], ni = atStart ? m.idx - 1 : m.idx + 1; if (ni < 0 || ni >= g.cuts.length) return false; if (g.gaps.has(g.cuts[atStart ? m.idx : ni][0])) return false; return H.pieces[m.n][ni] !== 0; });
  const fills = mergeStrands(fillSlices, null);   // Beta 1.208: exact joins only, like centres/bands - consecutive marked pieces share the half-line vertex, so a side's fill is one strand flowing through its junctions
  clipStrandEnds(fills, HALF_HALF, (sl, atStart) => { const m = atStart ? sl.mem[0] : sl.mem[sl.mem.length - 1]; return m && m.side !== undefined ? (m.side ? GEO[m.n].offH1 : GEO[m.n].offH0) : null; });   // Beta 1.208: fill strand ends clip ON their half-offset line (clipOnLine), never dragged toward the centreline
  fillCornerLinks(fills);   // Beta 1.208: and where a marked side turns a corner into another street's marked side, the fills wrap the corner (fillCornerLinks)
  cornerTouchSlices(edgeSlices, pairs);
  const edges = mergeStrands(edgeSlices, pairs);
  bridgeStragglers(edges, pairs);
  throughTouch(edges, pairs);
  extendIntoBands(edges, pairs);
  lastResortConnect(edges, bands);
  LASTCHAINS = { centres, bands, edges, fills };
  const fc = (list, colFn) => ({ type: 'FeatureCollection', features: list.map(sl => { const c = colFn(sl); return { type: 'Feature', properties: { col: c, colG: mute(c) }, geometry: { type: 'LineString', coordinates: GJ(sl.pts) } }; }) });
  return { centres: fc(centres, sl => sl.key), bands: fc(bands, () => MUGREEN), edges: fc(edges, () => MUGREEN), fills: fc(fills, () => MUGREEN), fades: { type: 'FeatureCollection', features: fadeSlices.map(sl => ({ type: 'Feature', properties: { col: sl.col, k: sl.k }, geometry: { type: 'LineString', coordinates: GJ(sl.pts) } })) } }; // Beta 1.259: the fade features bypass mergeStrands by design - each is its own short line in the lineMetrics source, so the gradient's progress spans exactly the fade zone
}
function currentSelList() { // every selected stretch (Beta 1.28): the app's selSet when multi-selecting, else the single anchor - read live at build time, like the original builders read the app global sel
  return (typeof H.selSet !== 'undefined' && Array.isArray(H.selSet) && H.selSet.length) ? H.selSet : (sel ? [sel] : []);
}
let SEL_FILL_FADES = []; // Beta 1.259: buildSelFill's boundary-end fades, handed to the selFades assembly in rebuildData/init/syncSel (the LASTCHAINS side-channel precedent) - the function's own return stays the selFill collection it has always returned
function buildSelFill() {   // the selected sectors' side fills (vibrant) - Beta 1.208 (R3): built by fillSlicePts, the SAME local rule that builds the board's fills, so a selected stretch's done side paints vertex-for-vertex as the board paints it and the green can no longer disconnect at the stretch boundary. The retired buildSel('e') rebuilt the side from a ONE-PIECE edge run: a lone piece can never earn the junction through-grant the full marked run gets (throughOK needs both arms in the run) and it received none of the corner/through post-passes, so the selected stretch's kerb line clipped at junctions the board line runs through - Andrew's disconnected green (his Valeria stretch 10 screenshot, 2026-11-15).
  const feats = [];
  const selSides = [];
  SEL_FILL_FADES = [];
  for (const it of currentSelList()) {
    const bits = H.pieces[it.name][it.idx];
    if (bits !== 3) [0, 1].forEach(side => { if (bits & (1 << side)) { const fSp = boundarySplit(it.name, GEO[it.name].cuts[it.idx], fillSlicePts(it.name, it.idx, side), 'f', GREEN, false); for (const f of fSp.fades) SEL_FILL_FADES.push(f); if (fSp.solid) { feats.push({ type: 'Feature', properties: { col: GREEN, colG: mute(GREEN) }, geometry: { type: 'LineString', coordinates: GJ(fSp.solid) } }); selSides.push({ n: it.name, idx: it.idx, side }); } } }); // Beta 1.259: a selected fill feathers at a boundary end exactly as the board's does
  }
  // Beta 1.208 (Codex P2, gate round 4): the corner connectors ride along.
  // fillCornerLinks wraps a marked side around a junction corner with a
  // connector strand on the BOARD's fills; the selection redraw above
  // rebuilds only the piece's own slice, so at a connected corner the
  // selected surface (t1-sel, above the board fills) painted over the
  // connector's first arm and the green broke by ~5 m for exactly as
  // long as the stretch stayed selected. Any board connector touching a
  // selected side is therefore redrawn here too, from the board's own
  // strand (LASTCHAINS), in the selection's vibrant green - t1-selfill
  // sits above t1-sel, so selected and deselected paint identically.
  // Connectors are identified by the explicit flag fillCornerLinks
  // sets at creation - NOT by mem count: an ordinary fill strand
  // merged from two consecutive pieces carries two mem entries too,
  // and an early build of this fix mistook exactly that for a
  // connector and painted the unselected piece in selection green
  // (gate round 4, Codex P2).
  if (selSides.length && typeof LASTCHAINS !== 'undefined' && LASTCHAINS && LASTCHAINS.fills) {
    for (const sl of LASTCHAINS.fills) {
      if (!sl.corner || !sl.mem) continue;
      if (sl.mem.some(m => m && selSides.some(s => s.n === m.n && s.idx === m.idx && s.side === m.side)))
        feats.push({ type: 'Feature', properties: { col: GREEN, colG: mute(GREEN) }, geometry: { type: 'LineString', coordinates: GJ(sl.pts) } });
    }
  }
  return { type: 'FeatureCollection', features: feats };
}
const EMPTYFC = { type: 'FeatureCollection', features: [] };
function selectedGeom(it) {   // a selected stretch's painted slice: stitched points, edge-clipped at its junctions
  const s0 = it || sel;
  if (!s0) return null;
  const n = s0.name, idx = s0.idx, g = GEO[n], ab = g.cuts[idx], bits = H.pieces[n][idx];
  const isBand = bits === 3, half = SURF_HALF;   // Beta 1.208: the selection redraw of a band trims at the width the band now draws
  const key = isBand ? 'band' : mute(colOf(n, bits));
  const famKey = i => H.pieces[n][i] === 3 ? 'band' : mute(colOf(n, H.pieces[n][i]));
  let pts = g.stitched.slice(ab[0], ab[1] + 1);
  if (isBand) {   // Beta 1.208 (gate round 3): the selection's band redraw follows the board band's per-side-paint clip rule, so selected and deselected paint meet a neighbouring fill identically
    if (idx === 0 || g.gaps.has(ab[0]) || H.pieces[n][idx - 1] === 0) pts = clipEndAtJunction(n, ab[0], pts, true, half);
    if (idx === g.cuts.length - 1 || g.gaps.has(g.cuts[idx + 1][0]) || H.pieces[n][idx + 1] === 0) pts = clipEndAtJunction(n, ab[1], pts, false, half);
  }
  else {
    if (idx === 0 || g.gaps.has(ab[0]) || famKey(idx - 1) !== key) pts = clipEndAtJunction(n, ab[0], pts, true, half);
    if (idx === g.cuts.length - 1 || g.gaps.has(g.cuts[idx + 1][0]) || famKey(idx + 1) !== key) pts = clipEndAtJunction(n, ab[1], pts, false, half);
  }
  const sp = boundarySplit(n, ab, pts, isBand ? 'b' : 'c', isBand ? GREEN : colOf(n, bits), false); // Beta 1.259: the selection redraw feathers at a boundary end in the vibrant colour - pts becomes the trimmed solid (the glow, which reads this same geometry, stops at the seam with it), the fades ride along for buildSelC
  return { pts: sp.solid, bits, half, fades: sp.fades };
}
function buildSelC() {   // the selected sector's core: a vibrant BAND when complete, a vibrant core otherwise
  // (round 15: the locals were named sel/selBand, SHADOWING the
  // global selection - colOf(sel.name) read undefined and every
  // selected pending stretch rendered RED, yellow streets included.
  // Andrew caught it live, 2026-10-29.)
  const selFeats = [], bandFeats = [], selFades = [];
  for (const it of currentSelList()) {
    const sg = selectedGeom(it);
    if (!sg) continue;
    if (sg.fades) for (const f of sg.fades) selFades.push(f); // Beta 1.259: the stretch's boundary-end fades (vibrant) - collected even when nothing solid survives the split
    if (!sg.pts || sg.pts.length < 2) continue;
    if (sg.bits !== 3) selFeats.push({ type: 'Feature', properties: { col: colOf(it.name, sg.bits) }, geometry: { type: 'LineString', coordinates: GJ(sg.pts) } });
    else bandFeats.push({ type: 'Feature', properties: { col: GREEN }, geometry: { type: 'LineString', coordinates: GJ(sg.pts) } });
  }
  return { sel: selFeats.length ? { type: 'FeatureCollection', features: selFeats } : EMPTYFC, selBand: bandFeats.length ? { type: 'FeatureCollection', features: bandFeats } : EMPTYFC, selFades };
}
function fadeFC(triples) { // Beta 1.259: fade triples ({pts, k, col}) -> the selFades collection (the board's fades are built in buildFamilies' return)
  return triples.length ? { type: 'FeatureCollection', features: triples.map(sl => ({ type: 'Feature', properties: { col: sl.col, k: sl.k }, geometry: { type: 'LineString', coordinates: GJ(sl.pts) } })) } : EMPTYFC;
}
const HIT = { type: 'FeatureCollection', features: [] }; // Beta 1.117: filled per load by buildEngineGeometry
buildEngineGeometry(); // the eval pass: no route is loaded yet, so this builds the empty geometry - the structures exist and every reader is safe; GLP.rebuildRoute rebuilds for real on each load
let CUR = null;
function rebuildData() { const F = buildFamilies(); const SC = buildSelC(); const SF = buildSelFill();
  // Paint order (round 21, Andrew's rule): within the centres source,
  // RED strands sort before YELLOW strands, so at any junction yellow
  // paints over red and the red street reads as butting into it.
  // Completed (green) strands live in the bands source, whose layers
  // sit below ALL centre layers in addStack - green is under both
  // colours the same way. Geometry untouched; features only reorder.
  const yRank = f => (f.properties.col === mute(YELLOW) || f.properties.col === YELLOW) ? 1 : 0;   // keys off the live scheme (round 25)
  F.centres.features.sort((a, b) => yRank(a) - yRank(b));
  CUR = { centres: F.centres, bands: F.bands, edges: F.edges, fills: F.fills, fades: F.fades, sel: SC.sel, selBand: SC.selBand, selFill: SF, selFades: fadeFC([...SC.selFades, ...SEL_FILL_FADES]) }; }

function scaleW(curve) { return curve.map((v, i) => (i >= 4 && i % 2 === 0) ? +(v * WIDTH_K).toFixed(3) : v); }   // Beta 1.181: scale an interpolate width curve by WIDTH_K (widths sit at even indices >= 4, the wPlus/wScale index rule)
const surfW = scaleW(['interpolate', ['linear'], ['zoom'], 14, 2.5, 16, 7.63, 17, 15.25, 18, 30.5, 19, 61]);   // street-end width fix: z16-19 stops set so the DRAWN width holds the geographic surface width (2 x SURF_HALF: 9.9 m at WIDTH_K 1.5, 8.58 m at 1.3) on the app's true map scale (the old 6.5/9.5/15/24 drew only 8.4/6.2/4.9/3.9 m, so terminating ends — cut flush to the crossing paint's designed edge — hung gapped from the paint as drawn)
const surfCASE = scaleW(['interpolate', ['linear'], ['zoom'], 14, 4.5, 16, 10.13, 17, 18.25, 18, 33.99, 19, 65]);   // the surface's casing curve (the dark rim under the paint), factored out of the t1-casing layer at Beta 1.208: completed bands now draw at the surface's width, so their casing is THIS curve too, and tapTolPx reads the widest paint from it. BANDW/BANDCASE (the wider band curves, last set by the 1.206 street-end fix) are retired here - 1.208 supersedes them by Andrew's order.
const wPlus = (curve, d) => curve.map((v, i) => (i >= 4 && i % 2 === 0) ? v + d * WIDTH_K : v);   // widen an interpolate width curve by d px at every stop (widths sit at even indices >= 4); Beta 1.181: the added px scale by WIDTH_K too, so the glow rim grows proportionally with the road
const wScale = (curve, f) => curve.map((v, i) => (i >= 4 && i % 2 === 0) ? v * f : v);   // scale an interpolate width curve (same index rule as wPlus)
// Round 29 (Andrew): ZOOM-TAPERED glow. Zoomed out, the glow kept
// its full screen width while the road shrank to a few px, so the
// halo was ~10x the road and the street's crushed corner vertices
// creased its softened edge into starburst rays (his Fifth Ave
// shot). glowW/glowB scale the glow's extra width and blur down at
// low zoom and reach EXACTLY the locked values from zoom 16.5 up,
// so the working-zoom look he approved is numerically unchanged.
const GLOW_TAPER = [[14, 0.15], [15, 0.32], [16, 0.68], [16.5, 1]];
function taperAt(z) {
  if (z <= GLOW_TAPER[0][0]) return GLOW_TAPER[0][1];
  for (let i = 1; i < GLOW_TAPER.length; i++) {
    if (z <= GLOW_TAPER[i][0]) {
      const a = GLOW_TAPER[i - 1], b = GLOW_TAPER[i];
      return a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]);
    }
  }
  return 1;
}
function curveAt(curve, z) {
  if (z <= curve[3]) return curve[4];
  for (let i = 5; i < curve.length; i += 2) {
    if (z <= curve[i]) return curve[i + 1] + (curve[i - 1] - curve[i + 1]) * (curve[i] - z) / (curve[i] - curve[i - 2]);
  }
  return curve[curve.length - 1];
}
function glowW(curve, delta) {
  /** @type {any[]} */
  const ex = ['interpolate', ['linear'], ['zoom']];
  for (const z of [14, 15, 16, 16.5, 17, 18, 19]) ex.push(z, +(curveAt(curve, z) + delta * WIDTH_K * taperAt(z)).toFixed(2));   // Beta 1.181: the live glow's extra width scales by WIDTH_K, same as the initial stack's wPlus
  return ex;
}
function glowB(b) { return ['interpolate', ['linear'], ['zoom'], 14, +(b * 0.35).toFixed(2), 15.5, +(b * 0.6).toFixed(2), 16.5, b]; }
function lighten(hex, f) {   // mix a #rrggbb colour toward white by f (0..1) - the "hot core" colours for the glow presets
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = c => Math.round(c + (255 - c) * f);
  return '#' + [m(r), m(g), m(b)].map(c => c.toString(16).padStart(2, '0')).join('');
}
function firstSymbolId() {
  const ls = GLM.getStyle().layers;
  const s = ls.find(l => l.type === 'symbol');
  return s ? s.id : undefined;
}
// Rounds 30-32 (Andrew): place-name tuning on the baseGLM. The
// vector styles already carry every place name with zoom bands and
// population-sorted collision thinning (the Apple Maps behaviour);
const PLACE_EARLY = { suburb: 8, quarter: 8.5, neighbourhood: 9, hamlet: 8, village: 8, subplace: 9 }; // Beta 1.32 (Andrew): a wider, fuller map - the little places hold on as he zooms out toward the area view (the map itself now goes to z8) // how early each settlement kind may appear - the ONE owner of place-label zooms (Beta 1.31, Andrew: both maps carry more cities and towns; the stock styles held suburbs/hamlets/quarters/neighbourhoods back to z11-14). tunePlaceLabels also caps place labels at 15.5, where the route labels take over.
function placeClass(id) {
  if (id.includes('neighbourhood') || id.includes('neighborhood')) return 'neighbourhood';
  if (id.includes('quarter')) return 'quarter';
  if (id.includes('hamlet')) return 'hamlet';
  if (id.includes('place-city') || id.includes('place_city') || id.includes('capital')) return 'city';
  if (id.includes('place-town') || id.includes('place_town')) return 'town';
  if (id.includes('place-village') || id.includes('place_village')) return 'village';
  if (id.includes('place-suburb') || id.includes('place_suburb')) return 'suburb';
  if (id === 'places_locality') return 'city'; // Beta 1.33 (Protomaps): cities, towns and villages share ONE layer - the tile data itself gates each place by size (the Apple/Google ladder), so no early-pull; only the 15.5 cap applies
  if (id === 'places_subplace') return 'subplace'; // Beta 1.33: the neighbourhood/macrohood layer
  return null;
}
function tunePlaceLabels() {
  const layers = (GLM.getStyle() && GLM.getStyle().layers) || [];
  for (const L of layers) {
    if (L.type !== 'symbol') continue;
    const cls = placeClass(L.id);
    if (!cls || L.id.includes('dot')) continue;   // low-zoom city dots keep stock behaviour
    const early = PLACE_EARLY[cls];
    const minZ = early !== undefined ? (L.minzoom === undefined ? early : Math.min(L.minzoom, early)) : (L.minzoom || 0); // a layer with NO stock gate (Protomaps places) takes the table value as its gate
    if (L.minzoom !== minZ || (L.maxzoom === undefined ? 24 : L.maxzoom) !== 15.5) GLM.setLayerZoomRange(L.id, minZ, 15.5); // Beta 1.41: no-op guard (see glUnifyLabels) - skip when the range already matches
  }
}
function addStack() {
  tunePlaceLabels();
  if (!GLM.getSource('centres')) {
    GLM.addSource('centres', { type: 'geojson', data: CUR.centres });
    GLM.addSource('bands', { type: 'geojson', data: CUR.bands });
    GLM.addSource('edges', { type: 'geojson', data: CUR.edges });
    GLM.addSource('fills', { type: 'geojson', data: CUR.fills });
    GLM.addSource('fades', { type: 'geojson', lineMetrics: true, data: CUR.fades }); // Beta 1.259: lineMetrics is line-gradient's precondition
    GLM.addSource('selFades', { type: 'geojson', lineMetrics: true, data: CUR.selFades });
    GLM.addSource('sel', { type: 'geojson', data: CUR.sel });
    GLM.addSource('selBand', { type: 'geojson', data: CUR.selBand });
    GLM.addSource('selFill', { type: 'geojson', data: CUR.selFill });
    GLM.addSource('selGlow', { type: 'geojson', data: buildSelGlow() });
    GLM.addSource('hit', { type: 'geojson', data: HIT });
    GLM.addSource('labelpts', { type: 'geojson', data: LABELPTS });
    GLM.addSource('routepoi', { type: 'geojson', data: ROUTEPOI });
  }
  const before = firstSymbolId();
  const add = (layer) => { if (!GLM.getLayer(layer.id)) GLM.addLayer(layer, before); };
  const line = (id, source, paint, layout, filter) => { const o = { id, type: 'line', source, layout: Object.assign({ 'line-cap': 'round', 'line-join': 'miter' }, layout || {}), paint }; if (filter) o.filter = filter; return o; };   // NOTE: a present-but-undefined `filter` key makes MapLibre silently drop the layer (found by the QA tour, 2026-10-28)
  // --- T1: integrated — the road surface itself carries the state ---
  // Paint-order stack (round 22): the round-21 centres sort stays -
  // RED strands paint before YELLOW in rebuildData, so red dives
  // under yellow at junctions. The green (completed) family is back
  // where it was before round 21 (Andrew: revert the green part) -
  // band casing and band render above the unfinished centre paint.
  add(line('t1-casing', 'centres', { 'line-color': H.isNight() ? '#000000' : '#5a5f6a', 'line-width': surfCASE, 'line-opacity': ['step', ['zoom'], 0, 12.6, 1], 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }));
  add(line('t1-casingb', 'bands', { 'line-color': H.isNight() ? '#000000' : '#5a5f6a', 'line-width': surfCASE, 'line-opacity': ['step', ['zoom'], 0, 12.6, 1], 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }));
  add(line('t1-surface', 'centres', { 'line-color': ['get', 'col'], 'line-width': surfW, 'line-opacity': ['step', ['zoom'], 0, 12.6, 1], 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }));
  add(line('t1-band', 'bands', { 'line-color': ['get', 'col'], 'line-width': surfW, 'line-opacity': ['step', ['zoom'], 0, 12.6, 1], 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }));   // Beta 1.208 (R1): the completed band draws at surfW - the same width as the not-done surface, per Andrew's order
  add(line('t1-fill', 'fills', { 'line-color': ['get', 'col'], 'line-width': wScale(surfW, 0.5), 'line-opacity': ['step', ['zoom'], 0, 12.6, 1], 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }));   // Beta 1.208 (R2): a done side's green fills its half of the road (half-offset ribbon at half the surface's drawn width) - it replaces the t1-edge kerb line, whose fixed 4.5 px shrank to an outline at close zoom. The edges source itself is still built (its junction pipeline is untouched) but no longer drawn.
  // --- Beta 1.259: boundary-end feathers. One literal-gradient layer per
  // colour (line-gradient cannot read feature properties): the fade
  // features carry k (x casing / c centre / b band / f fill) and col, and
  // each layer paints its own colour's gradient over its kind. The casing
  // gradient follows the theme like t1-casing's colour (syncTheme). ---
  const fadeOp = ['step', ['zoom'], 0, 12.6, 1];
  add(line('fade-casing', 'fades', { 'line-gradient': fadeGrad(H.isNight() ? '#000000' : '#5a5f6a'), 'line-width': surfCASE, 'line-opacity': fadeOp, 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }, ['==', ['get', 'k'], 'x']));
  add(line('fade-surf-y', 'fades', { 'line-gradient': fadeGrad(mute(YELLOW)), 'line-width': surfW, 'line-opacity': fadeOp, 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }, ['all', ['==', ['get', 'k'], 'c'], ['==', ['get', 'col'], mute(YELLOW)]]));
  add(line('fade-surf-r', 'fades', { 'line-gradient': fadeGrad(mute(RED)), 'line-width': surfW, 'line-opacity': fadeOp, 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }, ['all', ['==', ['get', 'k'], 'c'], ['==', ['get', 'col'], mute(RED)]]));
  add(line('fade-band-g', 'fades', { 'line-gradient': fadeGrad(MUGREEN), 'line-width': surfW, 'line-opacity': fadeOp, 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }, ['==', ['get', 'k'], 'b']));
  add(line('fade-fill-g', 'fades', { 'line-gradient': fadeGrad(MUGREEN), 'line-width': wScale(surfW, 0.5), 'line-opacity': fadeOp, 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }, ['==', ['get', 'k'], 'f']));
  // --- selection glow (round 16, restored onto the r15 paint at
  // Andrew's direction 2026-10-29): three nested widths in the
  // street's OWN colour under the vibrant redraw; managePulse
  // breathes them with the overlay so the street itself lights up.
  // The ONLY selection treatment - the round-14 style toggle
  // buttons are removed. ---
  // Round 28 (Andrew): the SELECTION layers (glow stack, core, and
  // the vibrant redraw) use ROUND line joins. With the default miter
  // join, the wide glow layers threw a long triangular spike past
  // every sharp corner (the "refracting" shard he reported); round
  // joins wrap the corner in an arc so the blurred halo pools around
  // the bend instead. Base road paint keeps its settled joins/caps.
  add(line('sel-glow4-s', 'selGlow', { 'line-color': ['get', 'col'], 'line-width': wPlus(surfW, 30), 'line-opacity': 0.05, 'line-blur': 14 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 0]));
  add(line('sel-glow4-b', 'selGlow', { 'line-color': ['get', 'col'], 'line-width': wPlus(surfW, 30), 'line-opacity': 0.05, 'line-blur': 14 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 1]));
  add(line('sel-glow5-s', 'selGlow', { 'line-color': ['get', 'col'], 'line-width': wPlus(surfW, 23), 'line-opacity': 0.06, 'line-blur': 10 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 0]));
  add(line('sel-glow5-b', 'selGlow', { 'line-color': ['get', 'col'], 'line-width': wPlus(surfW, 23), 'line-opacity': 0.06, 'line-blur': 10 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 1]));
  add(line('sel-glow1-s', 'selGlow', { 'line-color': ['get', 'col'], 'line-width': wPlus(surfW, 17), 'line-opacity': 0.10 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 0]));
  add(line('sel-glow1-b', 'selGlow', { 'line-color': ['get', 'col'], 'line-width': wPlus(surfW, 17), 'line-opacity': 0.10 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 1]));
  add(line('sel-glow2-s', 'selGlow', { 'line-color': ['get', 'col'], 'line-width': wPlus(surfW, 9), 'line-opacity': 0.16 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 0]));
  add(line('sel-glow2-b', 'selGlow', { 'line-color': ['get', 'col'], 'line-width': wPlus(surfW, 9), 'line-opacity': 0.16 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 1]));
  add(line('sel-glow3-s', 'selGlow', { 'line-color': ['get', 'col'], 'line-width': wPlus(surfW, 4), 'line-opacity': 0.24 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 0]));
  add(line('sel-glow3-b', 'selGlow', { 'line-color': ['get', 'col'], 'line-width': wPlus(surfW, 4), 'line-opacity': 0.24 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 1]));
  // --- selection overlay: the base spec redrawn in the VIBRANT colour -
  // identical widths and glow, so the only difference is the colour pop ---
  add(line('t1-sel', 'sel', { 'line-color': ['get', 'col'], 'line-width': surfW, 'line-opacity': 1 }, { 'line-cap': 'butt', 'line-join': 'round' }));
  add(line('t1-selband', 'selBand', { 'line-color': ['get', 'col'], 'line-width': surfW, 'line-opacity': 1 }, { 'line-cap': 'butt', 'line-join': 'round' }));
  add(line('sel-core-s', 'selGlow', { 'line-color': ['get', 'colHot'], 'line-width': wScale(surfW, 0.42), 'line-opacity': 0.85 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 0]));
  add(line('sel-core-b', 'selGlow', { 'line-color': ['get', 'colHot'], 'line-width': wScale(surfW, 0.42), 'line-opacity': 0.85 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 1]));
  add(line('t1-selfill', 'selFill', { 'line-color': ['get', 'col'], 'line-width': wScale(surfW, 0.5), 'line-opacity': 1 }, { 'line-cap': 'butt' }));   // Beta 1.208 (R3): the selection's vibrant side fill - same width as the board's t1-fill, geometry from the same builder
  // Beta 1.259: the selection's boundary-end feathers, in the vibrant colours
  add(line('selfade-y', 'selFades', { 'line-gradient': fadeGrad(YELLOW), 'line-width': surfW, 'line-opacity': 1 }, { 'line-cap': 'butt' }, ['all', ['==', ['get', 'k'], 'c'], ['==', ['get', 'col'], YELLOW]]));
  add(line('selfade-r', 'selFades', { 'line-gradient': fadeGrad(RED), 'line-width': surfW, 'line-opacity': 1 }, { 'line-cap': 'butt' }, ['all', ['==', ['get', 'k'], 'c'], ['==', ['get', 'col'], RED]]));
  add(line('selfade-g', 'selFades', { 'line-gradient': fadeGrad(GREEN), 'line-width': surfW, 'line-opacity': 1 }, { 'line-cap': 'butt' }, ['==', ['get', 'k'], 'b']));
  add(line('selfade-fill', 'selFades', { 'line-gradient': fadeGrad(GREEN), 'line-width': wScale(surfW, 0.5), 'line-opacity': 1 }, { 'line-cap': 'butt' }, ['==', ['get', 'k'], 'f']));
  // --- hit (every treatment) ---
  add(line('hit', 'hit', { 'line-color': '#fff', 'line-width': 24 * WIDTH_K, 'line-opacity': 0 }));
  // Beta 1.40 (Andrew): our own line-following street names are RETIRED. Zoomed in, the
  // basemap's own road names take over on every street - ours are the overview titles,
  // the basemap's are the close-up names, restyled readable (see glUnifyLabels in app2).
  // The 'labels' source is no longer added; LABELS/labelFeatures remain as data only.
  // Round 35/39 (Andrew): the point labels sit at the TOP of the
  // stack (appended last, like streetnames) so basemap symbols can no
  // longer knock them out - in Light, housenumber/POI symbols were
  // silently killing Velmar's name. When a centred name collides,
  // text-variable-anchor lets the renderer try above / below / beside
  // the point instead of dropping the name outright - that is what
  // rescues Bloomingdale, whose neighbours sit ~23 px away at
  // Overview no matter where along its segment it anchors.
  // Round 39: FOUR tier layers (see assignTiers) with staggered
  // minzooms - 13.7 / 13.35 / 13.0 / 12.6 - so the names depopulate
  // shortest-first as he zooms out through 13.7 to 12.6, while every
  // tier still pops with the paint at 12.6 (Beta 1.12: no fading). Longest
  // tier appended last so it wins placement among the tiers.
  // Beta 1.40 (Andrew): the HANDOVER - our titles fade OUT across 15.4-16.4 while the
  // basemap's own names fade IN on route streets across the same band (glHideLabels),
  // so the two systems crossfade and never print together. The 12.6 arrival stays a
  // near-pop (0.03 of a zoom), per his Beta 1.12 no-fading call for the far switch.
  // Beta 1.208 (Andrew): the handover is RETIRED at his order - zoomed in, the
  // basemap printed a route street's name 4-5 times down one screen (the clone
  // layers repeat along the line at the renderer's 250 px default), and the
  // spacing cure is not available in this renderer: measured in the real app,
  // a 300 px repeat already loses Malden Street's label and a 400 px repeat
  // loses every label in the test view (anchors earn their place per tile
  // segment, and segments shorter than the repeat get none). So our titles -
  // exactly one per street, at the street's own anchor - now stay up at EVERY
  // zoom: no maxzoom, no fade-out stop, and the size ramp gains one high stop
  // so the name stays readable at z19. glHideLabels no longer builds the
  // basemap clones, and the originals keep excluding route names, so the
  // basemap never prints a route street's name at any zoom.
  const PT_MIN = [13.7, 13.35, 13.0, 12.6];
  for (let t = 1; t <= 4; t++) {
    const id = 'streetnamespt' + t;
    if (!GLM.getLayer(id)) {
      GLM.addLayer({ id, type: 'symbol', source: 'labelpts', minzoom: PT_MIN[t - 1], filter: ['==', ['get', 'tier'], t], layout: { 'text-field': ['get', 'name'], 'text-font': fontStack, 'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 14.6, 10.5, 16.2, 12, 19, 13.5], 'text-padding': 1, 'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.8, 'symbol-sort-key': ['-', ['get', 'len']], 'text-allow-overlap': false }, paint: { 'text-color': H.isNight() ? '#e8e8e8' : '#333333', 'text-halo-color': H.isNight() ? 'rgba(0,0,0,.8)' : 'rgba(255,255,255,.9)', 'text-opacity': ['interpolate', ['linear'], ['zoom'], 12.59, 0, 12.62, 1, 15.4, 1], 'text-opacity-transition': { duration: 0, delay: 0 }, 'text-halo-width': 1.4 } });
    }
  }
  // Round 35/37 (Andrew): zoomed far out, the route cluster blurs
  // into a blob. The switch point is GL zoom 12.6 (the old 12.6-13.3 melt
  // band's lower edge). Beta 1.12 (Andrew): NO FADING - fading 'looks
  // cheesy'; at 12.6 the route paint and its street names POP out and the
  // point of interest POPS in, Apple/Google style, and the reverse zooming
  // in - paint and names switch together, never one without the other
  // (his r37 correction: staggered switches looked broken). Hard
  // floors sit just outside the band (paint 12.5, names 12.6, POI
  // capped 13.3) so fully-faded layers stop drawing / colliding.
  // Beta 1.79 (Andrew): the point of interest wears the ROUTE's name (Route 5W), not the app's name.
  add({ id: 'routepoi-ring', type: 'circle', source: 'routepoi', maxzoom: 13.3, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 7, 13.5, 9], 'circle-color': '#ffffff', 'circle-opacity': ['step', ['zoom'], 1, 12.6, 0], 'circle-opacity-transition': { duration: 0, delay: 0 } } });
  add({ id: 'routepoi-dot', type: 'circle', source: 'routepoi', maxzoom: 13.3, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4.5, 13.5, 6.5], 'circle-color': '#ef476f', 'circle-opacity': ['step', ['zoom'], 1, 12.6, 0], 'circle-opacity-transition': { duration: 0, delay: 0 } } });
  add({ id: 'routepoi-txt', type: 'symbol', source: 'routepoi', maxzoom: 13.3, layout: { 'text-field': (H.activeRoute && H.activeRoute.name) || 'Snow Route', 'text-font': fontStack, 'text-size': 11, 'text-anchor': 'left', 'text-offset': [1.1, 0], 'text-allow-overlap': false }, paint: { 'text-color': H.isNight() ? '#e8e8e8' : '#333333', 'text-halo-color': H.isNight() ? 'rgba(0,0,0,.8)' : 'rgba(255,255,255,.9)', 'text-opacity': ['step', ['zoom'], 1, 12.6, 0], 'text-opacity-transition': { duration: 0, delay: 0 }, 'text-halo-width': 1.6 } });
  ['t1-casing', 't1-casingb', 't1-surface', 't1-band', 't1-fill', 'fade-casing', 'fade-surf-y', 'fade-surf-r', 'fade-band-g', 'fade-fill-g', 't1-sel', 't1-selband', 't1-selfill', 'selfade-y', 'selfade-r', 'selfade-g', 'selfade-fill', 'sel-core-s', 'sel-core-b', 'hit'].concat([1, 2, 3, 4, 5].flatMap(i => ['sel-glow' + i + '-s', 'sel-glow' + i + '-b'])).forEach(id => { if (GLM.getLayer(id)) GLM.setLayerZoomRange(id, 12.5, 24); });
  H.glUnifyLabels(GLM);
  pushSources();
  applyGlow();
  syncTheme();
}
// ---- selection glow (round 16 treatment on the r15 paint base;
// the five style toggle buttons were removed at Andrew's order) ----
let pulseTimer = null;
let glowAnim = { op: {}, road: [0, 0] }; // Beta 1.169 (Carbon fix round, B-01): DECLARED - through 1.168 applyGlow assigned this undeclared, an implicit global in the app's sloppy mode (harmless there, a ReferenceError waiting for any future strict context). applyGlow replaces it wholesale on every call; managePulse only reads it.
function buildSelGlow() {
  const feats = []; // Beta 1.170 (Carbon fix round Phase 2, B-04): one glow feature per selected stretch, the same iteration buildSel/buildSelC run - through 1.169 this built only the single anchor's geometry (selectedGeom() with no argument), so a multi-select glowed one stretch while the vibrant selection lines painted them all
  for (const it of currentSelList()) {
    const sg = selectedGeom(it);
    if (!sg || !sg.pts || sg.pts.length < 2) continue; // Beta 1.259: a stretch fully inside a boundary fade zone has no solid line to glow under
    const c = colOf(it.name, sg.bits);
    feats.push({ type: 'Feature', properties: { col: c, colHot: lighten(c, 0.68), colLit: lighten(c, 0.30), band: sg.bits === 3 ? 1 : 0 }, geometry: { type: 'LineString', coordinates: GJ(sg.pts) } });
  }
  return feats.length ? { type: 'FeatureCollection', features: feats } : EMPTYFC;
}

// ---- glow presets (round 20, Andrew: panel toggles to compare live;
// SELECTION ONLY - no road paint is touched). Each preset is a set of
// per-layer specs over one fixed stack: five falloff layers
// (sel-glow1..5, widest = glow4) plus a core layer (sel-core) that can
const PULSE_RATES = [0.04, 0.07, 0.11, 0.17];   // breathing phase step per 50ms tick: ~7.9s / ~4.5s / ~2.9s / ~1.9s per full cycle (round 21 panel comparison)
let pulseRate = PULSE_RATES[3];   // RAPID, locked as Andrew's final choice (round 24) - the Pulse row is removed
const GLOW = [
  { road: [0.74, 0.26], layers: {   // 0 Bloom - the round-16 look
    'sel-glow1': { p: 17, b: 0, o: 0.10, a: 0.13 }, 'sel-glow2': { p: 9, b: 0, o: 0.16, a: 0.19 }, 'sel-glow3': { p: 4, b: 0, o: 0.24, a: 0.26 },
    'sel-glow4': null, 'sel-glow5': null, 'sel-core': null } },
  { road: [0.62, 0.38], layers: {   // 1 Soft - blurred photographic spill. Round 23: breathing AMPLITUDE raised ~3x (Andrew could not perceive the original 0.03-0.10 swings at any speed - the loop was running, the swing was under the visibility floor). The inner layers carry the pulse; the wide spill stays gentle so it still reads soft, not strobing.
    'sel-glow1': { p: 17, b: 8, o: 0.06, a: 0.10 }, 'sel-glow2': { p: 9, b: 5, o: 0.09, a: 0.14 }, 'sel-glow3': { p: 4, b: 2, o: 0.14, a: 0.20 },
    'sel-glow4': { p: 30, b: 14, o: 0.04, a: 0.05 }, 'sel-glow5': { p: 23, b: 10, o: 0.05, a: 0.07 }, 'sel-core': null } },
  { road: [0.80, 0.20], layers: {   // 2 Hot core - near-white centre, coloured falloff
    'sel-glow1': { p: 17, b: 0, o: 0.08, a: 0.08 }, 'sel-glow2': { p: 10, b: 0, o: 0.13, a: 0.12 }, 'sel-glow3': { p: 5, b: 0, o: 0.20, a: 0.16 },
    'sel-glow4': null, 'sel-glow5': null, 'sel-core': { s: 0.42, b: 1.5, o: 0.85, a: 0.15, c: 'colHot' } } },
  { road: [0.90, 0.10], layers: {   // 3 Lit road - the surface itself brightens, almost no halo
    'sel-glow1': null, 'sel-glow2': null, 'sel-glow3': { p: 5, b: 0, o: 0.10, a: 0.04 },
    'sel-glow4': null, 'sel-glow5': null, 'sel-core': { s: 1.0, b: 0, o: 0.38, a: 0.10, c: 'colLit' } } },
];
function applyGlow() {
  const P = GLOW[glowPreset];
  glowAnim = { op: {}, road: P.road };
  if (!GLM || !GLM.getLayer) return;   // GLP seam fix: the prototype guarded on its own map global; here the GL handle is the only guard
  Object.keys(P.layers).forEach(base => {
    ['-s', '-b'].forEach(sfx => {
      const id = base + sfx, L = P.layers[base];
      if (!GLM.getLayer(id)) return;
      GLM.setLayoutProperty(id, 'visibility', L ? 'visible' : 'none');
      if (!L) return;
      const curve = surfW;   // Beta 1.208: bands draw at the surface's width, so the '-b' glow variants follow surfW too
      GLM.setPaintProperty(id, 'line-width', L.p !== undefined ? glowW(curve, L.p) : wScale(curve, L.s));
      GLM.setPaintProperty(id, 'line-blur', L.b ? glowB(L.b) : 0);
      if (L.c) GLM.setPaintProperty(id, 'line-color', ['get', L.c]);
      GLM.setPaintProperty(id, 'line-opacity', L.o);
      glowAnim.op[id] = [L.o, L.a];
    });
  });
}
function managePulse() {
  // The selection breathes in the street's OWN colour (round 16,
  // Andrew's spec): the glow stack and the vibrant redraw pulse
  // together so the selected stretch looks lit from within. The
  // glow preset (round 20) supplies the per-layer base opacity and
  // breathing amplitude via glowAnim; this loop is preset-blind.
  const want = currentSelList().length > 0 && !!GLM && !!GLM.getLayer('sel-glow1-s'); // Beta 1.170 (B-04): the pulse follows the selection LIST, not just the anchor - a selection held only in selSet breathes too
  if (want && !pulseTimer) {
    let ph = 0;
    pulseTimer = setInterval(() => {
      if (!GLM) return;
      if (typeof document !== 'undefined' && document.hidden) return; // Beta 1.50 (audit P04): no paint churn while the app is not on screen - the phase simply waits and resumes on return
      ph += pulseRate;
      const s = 0.5 + 0.5 * Math.sin(ph);   // 0..1 breathing cycle
      const set = (id, v) => { if (GLM.getLayer(id)) GLM.setPaintProperty(id, 'line-opacity', v); };
      Object.keys(glowAnim.op).forEach(id => set(id, glowAnim.op[id][0] + glowAnim.op[id][1] * s));
      set('t1-sel', glowAnim.road[0] + glowAnim.road[1] * s); set('t1-selband', glowAnim.road[0] + glowAnim.road[1] * s);
    }, 50);
  } else if (!want && pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
}
  function rePlaceTitles() { // Beta 1.248: the street titles' anchors are re-decided from scratch - the labelpts source is rebuilt in place (the same LABELPTS data; the four tier layers re-added with their live specs at their stack seats). MapLibre's placement PREFERS the anchor a symbol used in the previous placement pass and keeps it while it still places (placement.ts: prevPlacement.variableOffsets, keyed by crossTileID, which lives with the source's cross-tile index), so an anchor first chosen mid-flight - while the fit view's streets sat closer together on screen and the tile scene was still arriving - can stick for the whole session with the name beside its street (Andrew's cold-open report, 2026-11-18: names off their streets, zooming no cure, a day/night swap - a fresh style and placement chain - the only cure; measured in the round's harness: anchors are always on their streets, the rendered text is what sits off). A rebuilt source gets a fresh cross-tile index, so the next placement pass holds no preference and decides against the settled scene. Nothing about what renders changes - same data, same specs, same seats; only when the decision is (re)made. The host calls this once the pick flight settles (app5's introToRoute hook); a no-op without a map or the source.
    if (!GLM || !GLM.getSource || !GLM.getSource('labelpts')) return;
    const ids = [1, 2, 3, 4].map(t => 'streetnamespt' + t).filter(id => GLM.getLayer(id));
    if (!ids.length) return;
    const style = GLM.getStyle(); if (!style || !style.layers) return;
    const specs = ids.map(id => style.layers.find(l => l.id === id));
    if (specs.some(s => !s)) return;
    const order = style.layers.map(l => l.id);
    let succ = null;
    for (let i = order.indexOf(ids[ids.length - 1]) + 1; i < order.length; i++) { if (ids.indexOf(order[i]) < 0) { succ = order[i]; break; } }
    for (const id of ids) GLM.removeLayer(id);
    GLM.removeSource('labelpts');
    GLM.addSource('labelpts', { type: 'geojson', data: LABELPTS });
    for (const s of specs) { if (succ) GLM.addLayer(s, succ); else GLM.addLayer(s); }
  }
  // ---- public API (the app's only handles on the engine) ----
  function stateSig() { return JSON.stringify(H.pieces); }
  function init(gl, host) {
    GLM = gl;
    if (host) H = host; // adopt the passed host (the app passes the same GL_HOST it registered before this script evaluated; a one-argument init keeps the registered host)
    sel = H.selStretch ? { name: H.selStretch.name, idx: H.selStretch.idx } : null;
    const sig = stateSig();
    if (!CUR || sig !== lastSig) { rebuildData(); lastSig = sig; }
    else { const SC = buildSelC(); CUR.sel = SC.sel; CUR.selBand = SC.selBand; CUR.selFill = buildSelFill(); CUR.selFades = fadeFC([...SC.selFades, ...SEL_FILL_FADES]); }
    addStack();           // re-adds sources+layers on the fresh GL map and pushes CUR
  }
  function rebuildRoute() { // Beta 1.117: the app switched routes and rebuilt its own geometry (buildGeometry, app1) - rebuild the engine's from the host's current data and re-point every route-shaped source at it. The basemap and layers are untouched; only data moves.
    buildEngineGeometry();
    sel = null;
    CUR = null; rebuildData(); lastSig = stateSig();
    if (!GLM) return;
    if (GLM.getSource('hit')) GLM.getSource('hit').setData(HIT);
    if (GLM.getSource('labelpts')) GLM.getSource('labelpts').setData(LABELPTS);
    if (GLM.getSource('routepoi')) GLM.getSource('routepoi').setData(ROUTEPOI);
    if (GLM.getLayer('routepoi-txt')) { try { GLM.setLayoutProperty('routepoi-txt', 'text-field', (H.activeRoute && H.activeRoute.name) || 'Snow Route'); } catch (e) {} } // the POI wears the route's name (Beta 1.79) - a switch renames it
    H.glUnifyLabels(GLM); // the basemap label pass runs on the new route's map
    pushSources();
  }
  function drop() {       // GL failed / fell back to raster: stop touching GL entirely
    GLM = null; lastNight = null;
    if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
  }
  function sync() {       // call after any pieces change; a signature check makes repeats free
    if (!GLM) return;
    if (!!(H && H.isNight && H.isNight()) !== lastNight) syncTheme();
    const sig = stateSig();
    if (sig === lastSig && CUR) return;
    lastSig = sig;
    rebuildData();
    pushSources();
  }
  function syncSel() {    // selection-only refresh: families are untouched (cheap)
    sel = H.selStretch ? { name: H.selStretch.name, idx: H.selStretch.idx } : null;
    if (!GLM || !CUR) return;
    const SC = buildSelC();
    CUR.sel = SC.sel; CUR.selBand = SC.selBand; CUR.selFill = buildSelFill(); CUR.selFades = fadeFC([...SC.selFades, ...SEL_FILL_FADES]);
    pushSelSources();
  }
  function active() { return !!GLM; }
  function setFont(stack) { if (Array.isArray(stack) && stack.length) { fontStack = stack.slice(); if (GLM) { for (const id of ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4', 'routepoi-txt']) { if (GLM.getLayer(id)) { try { GLM.setLayoutProperty(id, 'text-font', fontStack); } catch (e) {} } } } } } // Beta 1.170 (Carbon fix round Phase 2, B-09): layers already on the map take the new stack too - through 1.169 setFont replaced only the variable FUTURE layers are built from, so a basemap restyle (which re-picks the font, then calls sync - not init) left the live label layers rendering the retired stack until the next full rebuild
  function syncTheme() {
    if (!GLM || !GLM.getLayer) return;
    const night = !!(H && H.isNight && H.isNight());
    lastNight = night;
    const casing = night ? '#000000' : '#5a5f6a', txt = night ? '#e8e8e8' : '#333333', halo = night ? 'rgba(0,0,0,.8)' : 'rgba(255,255,255,.9)';
    for (const id of ['t1-casing', 't1-casingb']) { if (GLM.getLayer(id)) { try { GLM.setPaintProperty(id, 'line-color', casing); } catch (e) {} } }
    if (GLM.getLayer('fade-casing')) { try { GLM.setPaintProperty('fade-casing', 'line-gradient', fadeGrad(casing)); } catch (e) {} } // Beta 1.259: the feather's casing gradient follows the theme with the casings
    for (const id of ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4', 'routepoi-txt']) { if (GLM.getLayer(id)) { try { GLM.setPaintProperty(id, 'text-color', txt); GLM.setPaintProperty(id, 'text-halo-color', halo); } catch (e) {} } }
  }
  function evalCurvePx(curve, z) { // a scaleW-built interpolate curve evaluated at a zoom, in px (stops: zoom at odd indices from 3, width at even indices >= 4; clamped outside the stop range, linear between)
    let prev = null;
    for (let i = 3; i + 1 < curve.length; i += 2) { if (z <= curve[i]) { if (!prev) return curve[i + 1]; return prev[1] + (curve[i + 1] - prev[1]) * ((z - prev[0]) / (curve[i] - prev[0])); } prev = [curve[i], curve[i + 1]]; }
    return prev[1];
  }
  function tapTolPx(z) { return Math.max(24, evalCurvePx(surfCASE, z) / 2 + 2); } // The map-tap tolerance follows the WIDEST paint at the tap's zoom, floored at 24 px — the Beta 1.181 rule ("a tap anywhere on the paint still selects instead of deselecting"). Beta 1.206 introduced this formula against BANDCASE, then the widest paint; Beta 1.208 retires the wide band, so the widest paint is now the surface casing (surfCASE): 24 px at z17 and below (the floor - shipped behaviour unchanged), ~24.1 px at z18, ~44.3 px at z19 (the z18/z19 values re-measured at Beta 1.268's WIDTH_K 1.3; they were ~27.5 / ~50.8 at 1.5).
  return { init, drop, sync, syncSel, syncTheme, active, setFont, rebuildRoute, tapTolPx, mute, rePlaceTitles }; // mute exported for the create flow's draft renderer (Beta 1.221 gate fix: create-pick's crDraftLineDim calls GLP.mute - the helper is private to this IIFE, and the bare call threw at draft-layer init, silently aborting every layer after the casing; Codex review P1 on PR #98). Beta 1.248: rePlaceTitles exported for app5's post-flight hook
})();
window.GLP = GLP;