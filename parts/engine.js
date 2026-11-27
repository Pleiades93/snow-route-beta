const GLP = (() => {
  let H = GL_HOST; // the engine's only doorway to the app: everything arrives through this host object, live state via getters
  /** @type {EngineMap|null} */
  let GLM = null;                 // the MapLibre map instance (recreated per setBasemap)
  /** @type {EngineSelection|null} */
  let sel = null;                 // {name, idx} - fed from the app's selStretch
  let YELLOW = '#ffc233', RED = '#ef476f', GREEN = '#06d6a0';   // METRO, locked in the prototype (r26)
  /** @type {(n: string) => string} */
  const pendingColor = n => H.PRIMARIES.has(n) ? YELLOW : RED;
  let fontStack = ['Noto Sans Regular']; // replaced per-style by GLP.setFont (the app adopts the basemap's own stack, prototype pickFont rule)
  const glowPreset = 1;   // SOFT - the locked selection preset (prototype r24)
  let lastSig = /** @type {string | null} */ (null), lastNight = /** @type {boolean | null} */ (null);
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
  function pushSelSources() { // a selection change re-sends only the selection family, not every source
    if (!GLM || !CUR || !GLM.getSource('centres')) return;
    GLM.getSource('sel').setData(CUR.sel);
    GLM.getSource('selBand').setData(CUR.selBand);
    GLM.getSource('selFill').setData(CUR.selFill);
    if (GLM.getSource('selFades')) GLM.getSource('selFades').setData(CUR.selFades);
    if (GLM.getSource('selGlow')) GLM.getSource('selGlow').setData(buildSelGlow());
    managePulse();
  }
/** @type {(p: AnyPoint) => AnyPoint} */
const XYOf = p => [p[1] * H.MLNG, p[0] * H.MLAT];
/** @param {AnyPoint[]} pts */
function segLenM(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += H.jDistM(pts[i - 1], pts[i]); return L; }
/** @type {(pts: AnyPoint[]) => AnyPoint[]} */
const GJ = pts => pts.map(p => [p[1], p[0]]);   // [lat,lng] -> [lng,lat]
// offset a [lat,lng] polyline by `m` metres (positive = left of travel), in the app's flat-metre space
/** @param {AnyPoint[]} pts @param {number} m */
function offsetLine(pts, m) {
  const P = pts.map(p => [p[1] * H.MLNG, p[0] * H.MLAT]);
  const out = [];
  for (let i = 0; i < P.length; i++) {
    // direction from a ~2 m window each way, not the neighbours: near-duplicate points make their normal noise
    let a = i, b = i;
    while (a > 0 && Math.hypot(P[i][0] - P[a][0], P[i][1] - P[a][1]) < 2) a--;
    while (b < P.length - 1 && Math.hypot(P[b][0] - P[i][0], P[b][1] - P[i][1]) < 2) b++;
    let dx = P[b][0] - P[a][0], dy = P[b][1] - P[a][1];
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    out.push([(P[i][1] + dx * m) / H.MLAT, (P[i][0] + (-dy) * m) / H.MLNG]);   // vector = m * (-dy, dx): a transposed pair shifted the line along the street, not beside it
  }
  return out;
}

/** @type {EngineFeature<{name:string},AnyPoint[]>[]} */
const labelFeatures = [];
/** @type {EngineFeature<{name:string,len:number,tier?:number},AnyPoint>[]} */
const labelPointFeatures = [];
const LABELS = { type: 'FeatureCollection', features: labelFeatures };
/** @type {Record<string,EngineStreet>} */
const GEO = {};
// ===== TOPO: the one owner of run structure and the shared-vertex index; consumers ask its predicates, never re-derive
const TOPO = {
  _ranges: /** @type {Record<string, EngineRange[]>} */ ({}),   // name -> [{start, end}] — each run's vertex-index range in GEO[n].stitched, in run order
  _starts: /** @type {Record<string, Set<number>>} */ ({}),   // name -> Set of the vertex indices that open a later run (the range starts after the first)
  _verts: /** @type {Record<string, EngineVertex[]>} */ ({}),   // coordKey -> [{n, vi}] — every street/vertex at that point, in build order
  _ends: /** @type {Record<string, {kind: string, rec: number[] | null}>} */ ({}),   // 'name|vi' -> { kind, rec } — the classification of the run end at that vertex (stage 3)
  reset() { this._ranges = {}; this._starts = {}; this._verts = {}; this._ends = {}; },
  /** @param {string} n @param {EngineRange[]} ranges */
  seat(n, ranges) { this._ranges[n] = ranges; this._starts[n] = new Set(ranges.slice(1).map(r => r.start)); },
  /** @param {string} n @param {AnyPoint[]} stitched */
  index(n, stitched) { stitched.forEach((pt, vi) => { const k = coordKey(pt); (this._verts[k] = this._verts[k] || []).push({ n, vi }); }); },
  verts() { return this._verts; },   // the whole shared-vertex index
  /** @param {string} key */
  at(key) { return this._verts[key] || []; },   // the streets/vertices at one point
  // run ends classify once, here: 'junction' (a shared end vertex), else 'feather' with its record, else 'end'
  classifyEnds() {
    this._ends = {};
    for (const n of Object.keys(this._ranges)) {
      const stitched = GEO[n].stitched;
      for (const r of this._ranges[n]) for (const vi of [r.start, r.end]) {
        const v = stitched[vi];
        if (this.at(coordKey(v)).some(e => e.n !== n)) { this._ends[n + '|' + vi] = { kind: 'junction', rec: null }; continue; }
        const rec = boundaryRecAt(n, v);
        this._ends[n + '|' + vi] = rec ? { kind: 'feather', rec } : { kind: 'end', rec: null };
      }
    }
  },
  /** @param {string} n @param {number} vi */
  endAt(n, vi) { return this._ends[n + '|' + vi] || null; },   // the classification of the run end at vertex vi — null when vi is not a run end
  /** @param {string} n */
  ranges(n) { return this._ranges[n] || []; },
  /** @param {string} n @param {number} k */
  runStart(n, k) { const s = this._starts[n]; return !!s && s.has(k); },   // vertex k opens a later run of n
  /** @param {string} n @param {number} si */
  segReal(n, si) { return !this.runStart(n, si + 1); },   // the segment si -> si+1 lies inside one run; the pair across a run boundary is not street
  /** @param {string} n @param {number} vi @param {number} len */
  interior(n, vi, len) { return vi > 0 && vi < len - 1 && !this.runStart(n, vi) && !this.runStart(n, vi + 1); },   // vi sits inside a run, so the street runs through it - a run-end vertex terminates the street there
  /** @param {string} n @param {number} vi @param {number} len */
  win(n, vi, len) { return [this.runStart(n, vi) ? vi : Math.max(0, vi - 1), this.runStart(n, vi + 1) ? vi : Math.min(len - 1, vi + 1)]; }   // the window at vi, clamped at its run ends: a neighbour across a gap hands a false direction
};
// Left/Right (Andrew): each street has one fixed direction (south-to-north or west-to-east); Left never flips with travel
/** @type {Record<string,number>} */
const LEFTBIT = {};
function buildEngineGeometry() { // geometry builds here from current host data (eval, and per switch via rebuildRoute); containers refill in place
  for (const k of Object.keys(GEO)) delete GEO[k];
  for (const k of Object.keys(LEFTBIT)) delete LEFTBIT[k];
  labelFeatures.length = 0; labelPointFeatures.length = 0;
  TOPO.reset(); // the table and vertex index die here and re-seat per street: they can never name an earlier route's streets

  H.names.forEach(n => {
  // the stitched line, run by run: sectors are exact slices; offsets compute per run, never bridging
  const stitched = /** @type {AnyPoint[]} */ ([]), cuts = /** @type {number[][]} */ ([]), ranges = /** @type {EngineRange[]} */ ([]);
  let off0 = /** @type {AnyPoint[]} */ ([]), off1 = /** @type {AnyPoint[]} */ ([]), offH0 = /** @type {AnyPoint[]} */ ([]), offH1 = /** @type {AnyPoint[]} */ ([]), stitchedLen = 0;
  H.STRETCH[n].runs.forEach((run, ri) => {
    const rStart = stitched.length;
    const base = stitched.length, rStitched = /** @type {AnyPoint[]} */ ([]);
    run.parts.forEach((part, i) => {
      const a = i === 0 ? base : stitched.length - 1;
      if (i === 0) { stitched.push(...part); rStitched.push(...part); } else { stitched.push(...part.slice(1)); rStitched.push(...part.slice(1)); }
      cuts.push([a, stitched.length - 1]);
    });
    // offsets compute once over the whole run: a boundary vertex gets one shared point, so sectors paint continuously
    off0 = off0.concat(offsetLine(rStitched, 3.3 * WIDTH_K)); off1 = off1.concat(offsetLine(rStitched, -3.3 * WIDTH_K));
    offH0 = offH0.concat(offsetLine(rStitched, 1.65 * WIDTH_K)); offH1 = offH1.concat(offsetLine(rStitched, -1.65 * WIDTH_K));   // the half-offset midlines the one-side fills are built on - same per-run construction as the kerb lines
    stitchedLen += segLenM(rStitched);
    ranges.push({ start: rStart, end: stitched.length - 1 });
  });
  GEO[n] = { stitched, cuts, off0, off1, offH0, offH1 };
  TOPO.seat(n, ranges);
  TOPO.index(n, stitched);
  const p0 = stitched[0], p1 = stitched[stitched.length - 1];
  const dLat = p1[0] - p0[0], dLng = p1[1] - p0[1];
  const canonicalForward = Math.abs(dLat) >= Math.abs(dLng) ? dLat >= 0 : dLng >= 0;
  LEFTBIT[n] = canonicalForward ? 0 : 1;   // bit 0 is the left of the stitched direction
  const leftOff = LEFTBIT[n] === 0 ? off0 : off1, mid = Math.floor(stitched.length / 2);
  const dx = (leftOff[mid][1] - stitched[mid][1]) * H.MLNG, dy = (leftOff[mid][0] - stitched[mid][0]) * H.MLAT;
  // label line: the SPOT segment (or the longest), like the app's labels
  const segs = H.ROADS[n];
  const spotE = Object.prototype.hasOwnProperty.call(H.SPOT, n) ? H.SPOT[n] : null; // SPOT is sparse and plain reads resolve inherited properties ('constructor' reads truthy): own entries only
  let li = (spotE ? spotE[0] : -1);
  if (li < 0 || li >= segs.length) { li = 0; let bl = -1; segs.forEach((sg, j) => { const L = segLenM(sg); if (L > bl) { bl = L; li = j; } }); }
  labelFeatures.push({ type: 'Feature', properties: { name: n }, geometry: { type: 'LineString', coordinates: GJ(segs[li]) } });
  // a point anchor at the SPOT fraction: line labels need a fitting segment; point labels render regardless
  const seg = segs[li], fr = spotE ? spotE[1] : 0.5;
  let target = segLenM(seg) * fr, acc = 0, anchor = seg[seg.length - 1];
  for (let k = 1; k < seg.length; k++) {
    const d = H.jDistM(seg[k - 1], seg[k]);
    if (acc + d >= target) {
      const t = d ? (target - acc) / d : 0;
      anchor = [seg[k - 1][0] + (seg[k][0] - seg[k - 1][0]) * t, seg[k - 1][1] + (seg[k][1] - seg[k - 1][1]) * t];
      break;
    }
    acc += d;
  }
  // the length is the per-run sum (stitchedLen) - segLenM over the array would add the jumps between runs
  labelPointFeatures.push({ type: 'Feature', properties: { name: n, len: Math.round(stitchedLen) }, geometry: { type: 'Point', coordinates: GJ([anchor])[0] } });
});
  TOPO.classifyEnds(); // every street seated, classify each run end once: feather consumers read the classification, never re-derive
  JUNC = null; // the table rebuilds lazily from the new geometry: a stale one named an earlier route's streets
  nudgeFifth();
  assignTiers();
  let a = 90, b = -90, c = 180, d = -180; H.names.forEach(n => GEO[n].stitched.forEach(p => { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); }));
  if (H.names.length) ROUTEPOI.geometry.coordinates = [(c + d) / 2, (a + b) / 2]; // an empty geometry keeps the last real centre: the seed midpoint is [0,0], where the POI would render
  HIT.features = H.names.flatMap(n => GEO[n].cuts.map((ab, i) => ({ type: 'Feature', properties: { name: n, idx: i }, geometry: { type: 'LineString', coordinates: GJ(GEO[n].stitched.slice(ab[0], ab[1] + 1)) } })));
}
// Fifth's sits at its Greenpark junction (the name reads as Greenpark's): push it 45 m off Greenpark's line
function nudgeFifth() {
  const f = labelPointFeatures.find(x => x.properties.name === 'Fifth');
  if (!f) return;
  const A0 = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
  const gp = GEO['Greenpark'] && GEO['Greenpark'].stitched;
  if (!gp) return; // the nudge is a Route 5W refinement - a pack with a Fifth but no Greenpark simply skips it
  let bd = 1e9, bq = A0;
  for (let k = 1; k < gp.length; k++) {
    if (!TOPO.segReal('Greenpark', k - 1)) continue; // between-runs ground is not street: projecting the anchor onto it pushes the label away wrongly
    const a = gp[k - 1], b = gp[k], vx = (b[1] - a[1]) * H.MLNG, vy = (b[0] - a[0]) * H.MLAT;
    const wx = (A0[1] - a[1]) * H.MLNG, wy = (A0[0] - a[0]) * H.MLAT, L2 = vx * vx + vy * vy;
    let t = L2 ? (wx * vx + wy * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d = H.jDistM(A0, q);
    if (d < bd) { bd = d; bq = q; }
  }
  const dx = (A0[1] - bq[1]) * H.MLNG, dy = (A0[0] - bq[0]) * H.MLAT, dl = Math.hypot(dx, dy) || 1;
  f.geometry.coordinates = [A0[1] + (dx / dl) * 45 / H.MLNG, A0[0] + (dy / dl) * 45 / H.MLAT];
}
// names depopulate zooming out (tiers by length quartile); the six primaries sit in the final tier regardless
function assignTiers() {
  if (!labelPointFeatures.length) return; // no labels, no tiers - the quartile reads below would index lens[-1] and fail quietly
  const lens = labelPointFeatures.map(f => f.properties.len).sort((a, b) => a - b);
  /** @type {(p:number)=>number} */
  const q = p => lens[Math.min(lens.length - 1, Math.floor(p * lens.length))];
  const q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
  labelPointFeatures.forEach(f => {
    f.properties.tier = H.PRIMARIES.has(f.properties.name) ? 4 : (f.properties.len < q1 ? 1 : f.properties.len < q2 ? 2 : f.properties.len < q3 ? 3 : 4);
  });
}
const LABELPTS = { type: 'FeatureCollection', features: labelPointFeatures };
const ROUTEPOI = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }; // the centre is filled per load by buildEngineGeometry

// ---- unified strands: touching same-colour slices merge into one polyline; completed stretches form the band family
/** @param {string} n @param {number} bits */
function colOf(n, bits) { return bits === 3 ? GREEN : (H.PRIMARIES.has(n) ? YELLOW : RED); }
// everything rests muted (saturation cut); the selected sector renders full vibrant colour at the same glow spec
/** @param {string} hex */
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
let MUGREEN = mute(GREEN);   // let: setScheme() recomputes it from the scheme's green
/** @param {string} hex */
function fadeGrad(hex) {   // the gradient (full colour at 0, clear at 1): literal rgba stops per colour, one layer each
  const c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  return ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',1)', 1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)'];
}
/** @param {AnyPoint} p1 @param {AnyPoint} p2 @param {AnyPoint} p3 @param {AnyPoint} p4 */
function segCross(p1, p2, p3, p4) {
  const a = XYOf(p1), b = XYOf(p2), c = XYOf(p3), d = XYOf(p4);
  const o = /** @param {AnyPoint} x @param {AnyPoint} y @param {AnyPoint} z */ (x, y, z) => (y[0] - x[0]) * (z[1] - x[1]) - (y[1] - x[1]) * (z[0] - x[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0 && ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
/** @param {AnyPoint} p1 @param {AnyPoint} p2 @param {AnyPoint} p3 @param {AnyPoint} p4 */
function lineHit(p1, p2, p3, p4) {
  const a = XYOf(p1), b = XYOf(p2), c = XYOf(p3), d = XYOf(p4);
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  return [(a[1] + t * (b[1] - a[1])) / H.MLAT, (a[0] + t * (b[0] - a[0])) / H.MLNG];
}
/** @type {(p: AnyPoint) => string} */
const coordKey = p => p[0].toFixed(7) + ',' + p[1].toFixed(7);
// ---- kerb model: a side line stops at a crossing road's edge, joining around the corner, never through
const CORRIDOR = 5.2;   // metres: half the drawn road width
/** @type {Record<string,EngineJunction[]>|null} */
let JUNC = null;
function buildJunctions() {
  JUNC = {}; H.names.forEach(n => { JUNC[n] = []; });
  const at = TOPO.verts();   // the index is TOPO's, built with the geometry in this same order: JUNC's contents and entry order unchanged
  const dirAt = /** @param {string} n @param {number} vi */ (n, vi) => {
    const st = GEO[n].stitched;
    const [lo, hi] = TOPO.win(n, vi, st.length); // the window clamps at the vertex's run ends: a neighbour across the gap hands a false direction
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
// ---- through-connection: both-arms lines run through unless another street claims a corner first
/** @type {{V:AnyPoint,A:string,side:number,pts:AnyPoint[]}[]} */
let THROUGH_SEGS = [];
/** @param {string} A @param {number} side @param {EngineJunction} J @param {AnyPoint[]} runPts */
function throughOK(A, side, J, runPts) {
  if (J.sin <= 0.42) return false;
  const V = J.V, vKey = coordKey(V);
  const back = (JUNC[J.B] || []).find(x => x.B === A && coordKey(x.V) === vKey);
  if (!back) return false;
  const nA = back.nB, nB = J.nB, Vx = XYOf(V);
  const off = (side === 0 ? GEO[A].off0 : GEO[A].off1)[J.viA];
  const sideSign = Math.sign((XYOf(off)[0] - Vx[0]) * nA[0] + (XYOf(off)[1] - Vx[1]) * nA[1]);
  if (!sideSign) return false;
  /** @type {(pt: AnyPoint) => AnyPoint} */
  const signsOf = pt => { const w = XYOf(pt); return [Math.sign((w[0] - Vx[0]) * nA[0] + (w[1] - Vx[1]) * nA[1]), Math.sign((w[0] - Vx[0]) * nB[0] + (w[1] - Vx[1]) * nB[1])]; };
  // a raw crossing within 13 m of V blocks the through (it would paint an X)
  const pairsNow = PAIRS_CUR || junctionPairs();
  const offA = side === 0 ? GEO[A].off0 : GEO[A].off1;
  let crossed = false;
  for (const E of TOPO.at(vKey)) {
    if (E.n === A || crossed) continue;
    const gD = GEO[E.n];
    [0, 1].forEach(tt => {
      if (crossed) return;
      const marked = gD.cuts.some((ab, ci) => (E.vi >= ab[0] && E.vi <= ab[1]) && H.pieces[E.n][ci] !== 3 && (H.pieces[E.n][ci] & (1 << tt)));
      if (!marked) return;
      const offD = tt === 0 ? gD.off0 : gD.off1;
      const corners = (pairsNow[A + '|' + J.viA + '|' + side] || []).filter(pr => pr.n2 === E.n && pr.side2 === tt && pr.corner).map(pr => pr.corner);
      for (let s1 = 0; s1 + 1 < offA.length && !crossed; s1++) {
        if (!TOPO.segReal(A, s1)) continue; // the segment between two runs is not street - it can neither cross nor be crossed
        if (H.ptSegM(V, offA[s1], offA[s1 + 1]) > 13) continue;
        for (let s2 = 0; s2 + 1 < offD.length; s2++) {
          if (!TOPO.segReal(E.n, s2)) continue;
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
    // same street+side, same line, not a rival: the first grant must not block the rest
    if (seg.A === A && seg.side === side) continue;
    if (seg.pts.some(pt => signsOf(pt)[0] === sideSign)) return false;
  }
  THROUGH_SEGS.push({ V, A, side, pts: runPts.filter(pt => H.jDistM(pt, V) < CORRIDOR + 5) });
  return true;
}
// cut one piece at a junction: the corridor part is removed, its ends landing on the boundary, tagged
/** @param {EngineJunction} J1 @param {EngineJunction} J2 */
function sameRoad(J1, J2) {
  if (H.jDistM(J1.V, J2.V) >= 2) return false;
  return Math.abs(J1.dB[0] * J2.dB[0] + J1.dB[1] * J2.dB[1]) > 0.95;
}
/** @param {EngineClipPiece} pc @param {EngineJunction} J @param {number} R */
function clipOne(pc, J, R) {
  const Vx = XYOf(J.V), L = R / Math.max(J.sin, 0.42) + 9;
  /** @type {(p:AnyPoint)=>number} */
  const W = p => { const q = XYOf(p); return (q[0] - Vx[0]) * J.nB[0] + (q[1] - Vx[1]) * J.nB[1]; };
  /** @type {(p:AnyPoint)=>number} */
  const U = p => { const q = XYOf(p); return (q[0] - Vx[0]) * J.dB[0] + (q[1] - Vx[1]) * J.dB[1]; };
  // the 1e-6 margin is load-bearing: interpolated crossings carry ~1e-8 float noise and misclassify at 1e-9
  /** @type {(p:AnyPoint)=>boolean} */
  const inside = p => Math.abs(W(p)) < R - 1e-6 && Math.abs(U(p)) < L - 1e-6;
  const aug = [pc.pts[0]];
  for (let i = 0; i + 1 < pc.pts.length; i++) {
    const p = pc.pts[i], q = pc.pts[i + 1], wp = W(p), wq = W(q), up = U(p), uq = U(q), cr = /** @type {{t: number, c: AnyPoint}[]} */ ([]);
    [R, -R].forEach(sv => {
      if ((wp - sv) * (wq - sv) < 0) {
        const t = (sv - wp) / (wq - wp);
        const c = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
        if (Math.abs(U(c)) < L) cr.push({ t, c });
      }
    });
    // end-wall exits (U = +/-L) count too: uninserted, an exiting piece lost everything past the box
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
        // the wall point replaces an inside start, never dedupes away (dropping it lost a 114 m arm)
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
/** @param {EngineClipPiece[]} piecesIn @param {string} A @param {number} R @param {Set<EngineJunction>} skip */
function clipPieces(piecesIn, A, R = CORRIDOR, skip = null) {
  if (!JUNC) buildJunctions();
  let pieces = piecesIn;
  /** @type {EngineJunction[]} */
  const seenCluster = [];
  for (const J of JUNC[A]) {
    if (seenCluster.some(u => sameRoad(u, J))) continue;   // one clip per physical road at a point: double vertices AND name-change twins
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
// marked side runs for one street+side: consecutive marked stretches concatenated, then kerb-clipped at every junction. Returns strand
/** @param {string} n @param {number} side @param {(idx:number)=>number|boolean} marked */
function edgeRunSlices(n, side, marked) {
  const g = GEO[n], off = side === 0 ? g.off0 : g.off1, out = /** @type {EngineStrand[]} */ ([]);
  /** @type {{pts:AnyPoint[],firstIdx:number,lastIdx:number}|null} */
  let run = null;
  const flush = () => {
    if (!run) return;
    const startMeta = { n, vi: g.cuts[run.firstIdx][0], side }, endMeta = { n, vi: g.cuts[run.lastIdx][1], side };
    /** @type {EngineMember[]} */
    const mem = []; for (let i = run.firstIdx; i <= run.lastIdx; i++) mem.push({ n, idx: i, side });
    if (!JUNC) buildJunctions();
    const skip = new Set();
    /** @type {EngineJunction[]} */
    const seenJ = [];
    for (const J of JUNC[n]) {
      if (J.sin <= 0.42) continue;
      if (seenJ.some(u => sameRoad(u, J))) continue;   // name-change twins share one verdict (frame + through + skip)
      seenJ.push(J);
      if (!run.pts.some(pt => H.jDistM(pt, J.V) < CORRIDOR + 5)) continue;   // the run does not reach this junction
      // a through needs marks on both arms: an ending run gets the kerb clip + bridge instead
      const spansJ = GEO[n].cuts[run.firstIdx][0] < J.viA && J.viA < GEO[n].cuts[run.lastIdx][1];
      if (spansJ && throughOK(n, side, J, run.pts)) { skip.add(J); continue; }
      // the other arm is complete: its band fills the junction, so this line runs unclipped into it
      const otherArmBand = GEO[n].cuts.some((ab, ci) => (ab[0] === J.viA || ab[1] === J.viA) && (ci < run.firstIdx || ci > run.lastIdx) && H.pieces[n][ci] === 3);
      if (otherArmBand) {
        // skip the clip only if following this line unclipped to the vertex crosses NO street's marked side line
        let crosses = false;
        const properX = /** @param {AnyPoint} a @param {AnyPoint} b @param {AnyPoint} c @param {AnyPoint} d */ (a, b, c, d) => {
  if (!segCross(a, b, c, d)) return false; const X = lineHit(a, b, c, d); return !!X && [a, b, c, d].every(pt => H.jDistM(X, pt) >= 0.35); };
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
                if (!TOPO.segReal(dn, oi)) continue; // not a real segment (between two runs of dn)
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
      if (run && run.lastIdx === idx - 1 && !TOPO.runStart(n, ab[0])) { run.pts = run.pts.concat(sl.slice(1)); run.lastIdx = idx; } // pieces join only within a run: a new run's piece opens a fresh strand, never bridging between runs
      else { flush(); run = { pts: sl.slice(), firstIdx: idx, lastIdx: idx }; }
    } else flush();
  });
  flush();
  return out;
}
// pairing: the true corner is the two offset polylines' intersection, required to lie on both segments
/** @param{string} n1 @param{number} side1 @param{string} n2 @param{number} side2 @param{AnyPoint} V @param{number} vi1 @param{number} vi2 */
function polyCorner(n1, side1, n2, side2, V, vi1, vi2) {
  const o1 = side1 === 0 ? GEO[n1].off0 : GEO[n1].off1, o2 = side2 === 0 ? GEO[n2].off0 : GEO[n2].off1;
  const segsOf = /** @param {AnyPoint[]} off @param {number} vi @param {string} n */ (off, vi, n) => {
    const segs = [];
    for (let i = 0; i + 1 < off.length; i++) { if (!TOPO.segReal(n, i)) continue; segs.push({ seg: [off[i], off[i + 1]], ext: false }); } // between-runs ground is not street: a corner found on it pairs sides at a nonexistent junction
    if (vi === 0 && off.length > 1) { const d = [off[0][0] - off[1][0], off[0][1] - off[1][1]], L = H.jDistM(off[0], off[1]) || 1; segs.push({ seg: [[off[0][0] + d[0] * 8 / L, off[0][1] + d[1] * 8 / L], off[0]], ext: true }); }
    if (vi === off.length - 1 && off.length > 1) { const e = off[off.length - 1], q = off[off.length - 2], d = [e[0] - q[0], e[1] - q[1]], L = H.jDistM(q, e) || 1;
    segs.push({ seg: [e, [e[0] + d[0] * 8 / L, e[1] + d[1] * 8 / L]], ext: true });
    }
    return segs;
  };
  // an extension corner is valid only if its leg stays on its own side of the other centreline
  const legCrosses = /** @param {AnyPoint} endPt @param {AnyPoint} X @param {string} otherN */ (endPt, X, otherN) => {
    const st = GEO[otherN].stitched;
    for (let si = 0; si + 1 < st.length; si++) { if (!TOPO.segReal(otherN, si)) continue; if (H.ptSegM(V, st[si], st[si + 1]) < 13 && segCross(endPt, X, st[si], st[si + 1])) return true; } // gap segments are not centreline
    return false;
  };
  let best = null, bd = 1e9;
  for (const s1 of segsOf(o1, vi1, n1)) {
    if (H.ptSegM(V, s1.seg[0], s1.seg[1]) > 12) continue;
    for (const s2 of segsOf(o2, vi2, n2)) {
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
// a bridge must not cross a line either (joined lines excluded; the corner touch is the join)
/** @param {AnyPoint[]} pts @param {AnyPoint} J @param {Set<string>} excl @param {AnyPoint} cornerPt */
function pathBadGreen(pts, J, excl, cornerPt) {
  for (const n2 of H.names) {
    const g2 = GEO[n2];
    for (const t of [0, 1]) {
      if (excl.has(n2 + '|' + t)) continue;
      const marked = g2.cuts.some((ab, ci) => H.pieces[n2][ci] !== 3 && (H.pieces[n2][ci] & (1 << t)) && ab.some(v => H.jDistM(g2.stitched[v], J) < 16));
      if (!marked) continue;
      const off = t === 0 ? g2.off0 : g2.off1;
      for (let si = 0; si + 1 < off.length; si++) {
        if (!TOPO.segReal(n2, si)) continue; // not a real segment
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
  const at = TOPO.verts();   // the shared-vertex index is TOPO's: junctionPairs rebuilt its own copy on every call
  /** @type {EnginePairs} */
  const pairs = {};
  const link = /** @param {EngineEnd} A @param {EngineEnd} B @param {AnyPoint} corner */ (A, B, corner) => {
    const ka = A.n + '|' + A.vi + '|' + A.side, kb = B.n + '|' + B.vi + '|' + B.side;
    (pairs[ka] = pairs[ka] || []).push({ n2: B.n, vi2: B.vi, side2: B.side, corner });
    (pairs[kb] = pairs[kb] || []).push({ n2: A.n, vi2: A.vi, side2: A.side, corner });
  };
  Object.values(at).forEach(list => {
    if (new Set(list.map(e => e.n)).size < 2) return;
    /** @type {(EngineEnd & {pt:AnyPoint})[]} */
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
      /** @type {(pts: AnyPoint[]) => boolean} */
      const pathBad = pts => {
        for (let s2 = 0; s2 + 1 < pts.length; s2++) {
          if (H.ptSegM(J, pts[s2], pts[s2 + 1]) < 1.5) return true;   // through the junction's middle = a mouth cut
          for (const n2 of H.names) {
            const st = GEO[n2].stitched;
            for (let si = 0; si + 1 < st.length; si++) {
              if (!TOPO.segReal(n2, si)) continue; // not a real segment
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
  // coinciding corners at a junction snap to one point, so bridges land together instead of weaving crossings
  {
    const reps = new Map();
    const repOf = /** @param {AnyPoint} J @param {AnyPoint} pt */ (J, pt) => {
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
// join touching slices to a fixpoint; the bridge veto lives in one copy here, shared by both passes
const pathBadNear = /** @param {AnyPoint[]} pts @param {AnyPoint} J */ (pts, J) => {
    for (let s2 = 0; s2 + 1 < pts.length; s2++) {
      if (H.ptSegM(J, pts[s2], pts[s2 + 1]) < 1.5) return true;
      for (const n2 of H.names) {
        const st = GEO[n2].stitched;
        for (let si = 0; si + 1 < st.length; si++) {
          if (!TOPO.segReal(n2, si)) continue; // not a real segment
          if (H.ptSegM(J, st[si], st[si + 1]) >= 13 || !segCross(pts[s2], pts[s2 + 1], st[si], st[si + 1])) continue;
          const X = lineHit(pts[s2], pts[s2 + 1], st[si], st[si + 1]);
          if (!X || H.jDistM(X, J) > 6) return true;
        }
      }
    }
    return false;
};
/** @param {EngineStrand[]} slices @param {EnginePairs} pairs */
function mergeStrands(slices, pairs) {
  /** @type {(sl: EngineStrand) => EngineStrand} */
  const rev = sl => ({ pts: [...sl.pts].reverse(), key: sl.key, mem: sl.mem, e0: sl.e1, e1: sl.e0 });
  const joinInfo = /** @param {EngineStrand} a @param {EngineStrand} b */ (a, b) => {
    /** @type {{score:number,merged:EngineStrand}[]} */
    const out = [];
    const aS = coordKey(a.pts[0]), aE = coordKey(a.pts[a.pts.length - 1]);
    [b, rev(b)].forEach(v => {
      if (coordKey(v.pts[0]) === aE) out.push({ score: 2, merged: { pts: a.pts.concat(v.pts.slice(1)), key: a.key, mem: a.mem.concat(v.mem), e0: a.e0, e1: v.e1 } });
      if (coordKey(v.pts[v.pts.length - 1]) === aS) out.push({ score: 2, merged: { pts: v.pts.concat(a.pts.slice(1)), key: a.key, mem: v.mem.concat(a.mem), e0: v.e0, e1: a.e1 } });
    });
    if (pairs) {
      /** @type {[EngineEnd | null | undefined, boolean][]} */ ([[a.e1, true], [a.e0, false]]).forEach(([meta, atEnd]) => {
        if (!meta) return;
        (pairs[meta.n + '|' + meta.vi + '|' + meta.side] || []).forEach(pr => {
          /** @type {(m: EngineEnd) => boolean} */
          const match = m => m && m.n === pr.n2 && m.vi === pr.vi2 && m.side === pr.side2;
          const bo = match(b.e0) ? b : match(b.e1) ? rev(b) : null;
          if (!bo) return;
          // vet the actual bridge path: corner path, then the chord, else leave a gap at the corner
          const J = GEO[pr.n2].stitched[pr.vi2];
          const aEnd = atEnd ? a.pts[a.pts.length - 1] : a.pts[0];
          const bStart = bo.pts[0];   // bo is oriented so its start carries the matching meta
          /** @type {AnyPoint[]|null} */
          let bridge = null;
          const exclG = new Set([meta.n + '|' + meta.side, pr.n2 + '|' + pr.side2]);
          if (pr.corner) {
            // retrace both lines' points to the corner; vet the retraced path, else the corner path, then the chord
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
  // the winner scan prices only candidate pairs (ends touching or junction-paired); the winner rule is untouched
  /** @type {(m: EngineEnd) => string} */
  const metaKey = m => m.n + '|' + m.vi + '|' + m.side;
  for (;;) {
    const byStart = new Map(), byEnd = new Map(), byMeta = new Map();
    const index = /** @param {Map<string, number[]>} map @param {string} k @param {number} v */ (map, k, v) => { const l = map.get(k); if (l) l.push(v); else map.set(k, [v]); };
    arr.forEach((sl, ix) => {
      index(byStart, coordKey(sl.pts[0]), ix);
      index(byEnd, coordKey(sl.pts[sl.pts.length - 1]), ix);
      if (sl.e0) index(byMeta, metaKey(sl.e0), ix);
      if (sl.e1) index(byMeta, metaKey(sl.e1), ix);
    });
    /** @type {{ i: number, j: number, score: number, merged: EngineStrand } | null} */
    let best = null;
    for (let i = 0; i < arr.length && !(best && best.score === 2); i++) {
      const a = arr[i];
      const cand = new Set();
      const aS = coordKey(a.pts[0]), aE = coordKey(a.pts[a.pts.length - 1]);
      for (const ix of byStart.get(aE) || []) cand.add(ix);
      for (const ix of byStart.get(aS) || []) cand.add(ix);
      for (const ix of byEnd.get(aE) || []) cand.add(ix);
      for (const ix of byEnd.get(aS) || []) cand.add(ix);
      if (pairs) for (const meta of [a.e1, a.e0]) {
        if (!meta) continue;
        for (const pr of pairs[metaKey(meta)] || []) for (const ix of byMeta.get(pr.n2 + '|' + pr.vi2 + '|' + pr.side2) || []) cand.add(ix);
      }
      const js = [...cand].filter(j => j !== i && arr[j].key === a.key).sort((x, y) => x - y);
      for (const j of js) {
        joinInfo(a, arr[j]).forEach(c => { if (!best || c.score > best.score) best = { i, j, score: c.score, merged: c.merged }; });
        if (best && best.score === 2) break;
      }
    }
    if (!best) break;
    arr[best.i] = best.merged;
    arr.splice(best.j, 1);
  }
  return arr;
}
// connection guarantee (Andrew): lines ending at the same corner connect - this pass joins stragglers geometrically
/** @param {EngineStrand[]} chains @param {EnginePairs} pairs */
function bridgeStragglers(chains, pairs) {
  // candidacy is geometric: two ends within 10 m of one junction point, same quadrant, within 13 m, bridge
  if (!JUNC) buildJunctions();
  /** @type {(c: EngineStrand) => EngineStrand} */
  const revC = c => ({ pts: [...c.pts].reverse(), key: c.key, mem: c.mem, e0: c.e1, e1: c.e0 });
  const dirLL = /** @param {string} n @param {number} vi */ (n, vi) => {
    const st = GEO[n].stitched;
    const [lo, hi] = TOPO.win(n, vi, st.length); // same run clamp as buildJunctions' dirAt (the clamp is TOPO.win's - the two hand-written copies are one now)
    const a = XYOf(st[lo]), b = XYOf(st[hi]);
    const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
    return [dy / m / H.MLAT, dx / m / H.MLNG];
  };
  /** @type {(pts: AnyPoint[]) => number} */
  const pathLen = pts => { let L = 0; for (let i = 0; i + 1 < pts.length; i++) L += H.jDistM(pts[i], pts[i + 1]); return L; };
  const verts = Object.values(TOPO.verts())
    .filter(list => new Set(list.map(e => e.n)).size >= 2)
    .map(list => GEO[list[0].n].stitched[list[0].vi]);
  for (let iter = 0; iter < 120; iter++) {
    let merged = false;
    outer:
    for (const V of verts) {
      /** @type {{ci:number,at:string,pt:AnyPoint,meta:EngineEnd|null}[]} */
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
        /** @type {(pt: AnyPoint) => AnyPoint} */
        const signs = pt => { const w = XYOf(pt); return [Math.sign((w[0] - Vx[0]) * nA[0] + (w[1] - Vx[1]) * nA[1]), Math.sign((w[0] - Vx[0]) * nB[0] + (w[1] - Vx[1]) * nB[1])]; };
        const s1 = signs(E1.pt), s2 = signs(E2.pt);
        const sameQ = !(s1[0] !== 0 && s2[0] !== 0 && s1[0] !== s2[0]) && !(s1[1] !== 0 && s2[1] !== 0 && s1[1] !== s2[1]);
        if (!sameQ) continue;
        const dA = dirLL(E1.meta.n, E1.meta.vi), dB = dirLL(E2.meta.n, E2.meta.vi);
        const along = /** @param {AnyPoint} pt @param {AnyPoint} d */ (pt, d) => [pt[0] + d[0], pt[1] + d[1]];
        const corner = lineHit(E1.pt, along(E1.pt, dA), E2.pt, along(E2.pt, dB));
        const box = lineHit(E1.pt, along(E1.pt, dB), E2.pt, along(E2.pt, dA));
        // true corners first: the pairs corner (both lines' polylines),
        // then this pair's own polyline intersection
        let pairCorner = null;
        if (pairs) (pairs[E1.meta.n + '|' + E1.meta.vi + '|' + E1.meta.side] || []).forEach(pr => { if (pr.n2 === E2.meta.n && pr.vi2 === E2.meta.vi && pr.side2 === E2.meta.side && pr.corner) pairCorner = pr.corner; });
        const polyC = polyCorner(E1.meta.n, E1.meta.side, E2.meta.n, E2.meta.side, V, E1.meta.vi, E2.meta.vi);
        /** @type {AnyPoint[]|null} */
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
// when the partner runs through, this arm reaches the point on its line: a T-join, not a crossing
/** @param {EngineStrand[]} chains @param {EnginePairs} pairs */
function throughTouch(chains, pairs) {
  chains.forEach(c => {
    /** @type {[EngineEndKey, boolean][]} */ ([['e1', true], ['e0', false]]).forEach(([key, atEnd]) => {
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
// an edge ending where the partner stretch is complete reaches onto the band's corner, flowing into the green
/** @param {EngineStrand[]} edgeChains @param {EnginePairs} pairs */
function extendIntoBands(edgeChains, pairs) {
  edgeChains.forEach(s => {
    /** @type {[EngineEnd | null | undefined, boolean][]} */ ([[s.e1, true], [s.e0, false]]).forEach(([meta, atEnd]) => {
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
/** @type {EnginePairs|null} */
let PAIRS_CUR = null;   // the current build's junction pairs (throughOK reads them)
// last-resort connector: an unjoined end joins the nearest beside geometry, if the join cuts no road's middle
/** @param {EngineStrand[]} edges @param {EngineStrand[]} bands */
function lastResortConnect(edges, bands) {
  if (!JUNC) buildJunctions();
  const jList = Object.values(TOPO.verts()).filter(l => new Set(l.map(e => e.n)).size >= 2)
    .map(l => ({ V: GEO[l[0].n].stitched[l[0].vi], streets: [...new Set(l.map(e => e.n))] }));
  const frameFor = /** @param {AnyPoint} V @param {string} A @param {string} B */ (V, A, B) => {
    const J1 = (JUNC[A] || []).find(x => x.B === B && H.jDistM(x.V, V) < 2);
    const J2 = (JUNC[B] || []).find(x => x.B === A && H.jDistM(x.V, V) < 2);
    return (J1 && J2) ? { nA: J2.nB, nB: J1.nB } : null;
  };
  const properCross = /** @param {AnyPoint} a @param {AnyPoint} b @param {AnyPoint} c @param {AnyPoint} d */ (a, b, c, d) => {
    if (!segCross(a, b, c, d)) return false;
    const X = lineHit(a, b, c, d);
    return !!X && [a, b, c, d].every(pt => H.jDistM(X, pt) >= 0.35);
  };
  // local connectivity only: the fragment rules the gate audits with, mirrored - a route-long detour is not a connection
  const fragCache = new Map();
  /** @type {(V: AnyPoint) => {frags: EngineFragment[], comp: number[]}} */
  const localFrags = V => {
    const key = coordKey(V);
    if (fragCache.has(key)) return fragCache.get(key);
    const all = edges.concat(bands);
    /** @type {EngineFragment[]} */
    const frags = [];
    all.forEach((c, ci) => {
      const band = ci >= edges.length;
      /** @type {EngineFragment|null} */
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
    /** @type {(x: number) => number} */
    const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
    const onLine = /** @param {AnyPoint} p @param {EngineFragment} f @param {number} thr */ (p, f, thr) => { for (let s2 = 0; s2 + 1 < f.pts.length; s2++) if (H.ptSegM(p, f.pts[s2], f.pts[s2 + 1]) < thr) return true; return false; };
    const touch = /** @param {EngineFragment} A2 @param {EngineFragment} B2 */ (A2, B2) => {
      const eA = [A2.pts[0], A2.pts[A2.pts.length - 1]], eB = [B2.pts[0], B2.pts[B2.pts.length - 1]];
      if (eA.some(p => eB.some(q => coordKey(p) === coordKey(q)))) return true;
      const thr = (A2.band || B2.band) ? SURF_HALF : 1.0;   // bands draw at the surface's width, so the band touch threshold is SURF_HALF itself
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
      /** @type {(pt: AnyPoint) => AnyPoint} */
      const signs = pt => { const w = XYOf(pt); return [Math.sign((w[0] - Vx[0]) * fr.nA[0] + (w[1] - Vx[1]) * fr.nA[1]), Math.sign((w[0] - Vx[0]) * fr.nB[0] + (w[1] - Vx[1]) * fr.nB[1])]; };
      const inQ = /** @param {AnyPoint} sg @param {AnyPoint} q */ (sg, q) => (q[0] === 0 || sg[0] === 0 || sg[0] === q[0]) && (q[1] === 0 || sg[1] === 0 || sg[1] === q[1]);
      /** @type {{ci:number,pn:AnyPoint[]}[]} */
      const nearChains = [];
      list.forEach((c, ci) => {
        if (!c.mem.some(m => m.n === A || m.n === B)) return;
        const pn = c.pts.filter(pt => H.jDistM(pt, V) < 11);
        if (pn.length) nearChains.push({ ci, pn });
      });
      /** @type {{ci:number,pt:AnyPoint,meta:EngineEnd|null,atEnd:boolean}[]} */
      const ends = [];
      edges.forEach((c, ci) => {
        [{ pt: c.pts[0], meta: c.e0, atEnd: false }, { pt: c.pts[c.pts.length - 1], meta: c.e1, atEnd: true }].forEach(E => {
          if (E.meta && (E.meta.n === A || E.meta.n === B) && H.jDistM(E.pt, V) < 11) ends.push({ ci, ...E });
        });
      });
      for (const E of ends) {
        const sg = signs(E.pt);
        /** @type {AnyPoint[]} */
        const quads = [];
        (sg[0] === 0 ? [1, -1] : [sg[0]]).forEach(sa => (sg[1] === 0 ? [1, -1] : [sg[1]]).forEach(sb => quads.push([sa, sb])));
        let satisfied = false, partners = /** @type {typeof nearChains} */ ([]);
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
        /** @type {{d:number,np:AnyPoint,ci:number,si:number}[]} */
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
          // through the centre mid-segment: vetoed. Ending differs: a band ending at V lands only at V
          let badPath = H.ptSegM(V, seg[0], seg[1]) < 1.5 && H.jDistM(cand.np, V) > 0.5;
          if (!badPath) for (const n2 of H.names) {
            const st = GEO[n2].stitched;
            for (let si = 0; si + 1 < st.length && !badPath; si++) {
              if (!TOPO.segReal(n2, si)) continue; // not a real segment
              if (H.ptSegM(V, st[si], st[si + 1]) >= 13 || !segCross(seg[0], seg[1], st[si], st[si + 1])) continue;
              const X = lineHit(seg[0], seg[1], st[si], st[si + 1]);
              if (!X) continue;
              // landing ON the target's centreline is the join itself, not a crossing of the road
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

// touch slice ends to their corners before merging: a daisy-chain would steal the ends the corner join needs

// the line's points between two points on it: a retraced bridge crosses only where the raw lines do
/** @param {string} n @param {number} side @param {AnyPoint} fromPt @param {AnyPoint} toPt @param {AnyPoint} V */
function rawPath(n, side, fromPt, toPt, V) {
  const off = side === 0 ? GEO[n].off0 : GEO[n].off1;
  let fi = -1;
  // between-runs ground is not the line: fromPt cannot lie on it, the walk never steps across it
  for (let s2 = 0; s2 + 1 < off.length; s2++) { if (!TOPO.segReal(n, s2)) continue; if (H.ptSegM(fromPt, off[s2], off[s2 + 1]) < 0.05) { fi = s2; break; } }
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
      if (dir === 1 ? TOPO.runStart(n, nk) : TOPO.runStart(n, k)) break;
      k = nk;
      if (k < 0 || k >= off.length) break;
    }
  }
  return null;
}
/** @param {EngineStrand[]} slices @param {EnginePairs} pairs */
function cornerTouchSlices(slices, pairs) {
  const endKeys = new Set();
  slices.forEach(sl => { [sl.e0, sl.e1].forEach(m => { if (m) endKeys.add(m.n + '|' + m.vi + '|' + m.side); }); });
  const properX = /** @param {AnyPoint} a @param {AnyPoint} b @param {AnyPoint} c @param {AnyPoint} d */ (a, b, c, d) => {
    if (!segCross(a, b, c, d)) return false; const X = lineHit(a, b, c, d); return !!X && [a, b, c, d].every(pt => H.jDistM(X, pt) >= 0.35); };
  slices.forEach(sl => {
    /** @type {[EngineEndKey, boolean][]} */ ([['e1', true], ['e0', false]]).forEach(([key, atEnd]) => {
      const meta = sl[key];
      if (!meta) return;
      const tried = new Set();
      for (const pr of (pairs[meta.n + '|' + meta.vi + '|' + meta.side] || [])) {
        if (!pr.corner || tried.has(coordKey(pr.corner))) continue;
        tried.add(coordKey(pr.corner));
        // the partner shows if a slice ends here or runs through with the corner on it
        const partnerShown = endKeys.has(pr.n2 + '|' + pr.vi2 + '|' + pr.side2) || slices.some(o => o !== sl && o.mem.some(m => m.n === pr.n2 && m.side === pr.side2) && o.pts.some((p,
          pi) => pi + 1 < o.pts.length && H.ptSegM(pr.corner,
          p,
          o.pts[pi + 1]) < 1.0));
        if (!partnerShown) continue; // skip, not stop: rejections must not abandon remaining candidates; the only stop follows a landed hop
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
              if (!TOPO.segReal(dn, s2)) continue; // the segment between two runs is not street - it cannot veto a corner hop
              if (H.ptSegM(V, off[s2], off[s2 + 1]) > 16) continue;
              if (properX(endPt, pr.corner, off[s2], off[s2 + 1])) bad = true;
            }
          }
          if (bad) break;
        }
        if (bad) continue;
        // retrace the line's clipped-away points to the corner, so the hop follows the line, not a chord
        const rp = rawPath(meta.n, meta.side, endPt, pr.corner, V);
        const hop = rp && rp.length ? rp.concat([pr.corner]) : [pr.corner];
        if (atEnd) sl.pts.push(...hop); else sl.pts.unshift(...hop.slice().reverse());
        return;   // one corner touch per end
      }
    });
  });
}
// ---- road width: WIDTH_K (here), ROAD_WIDTH_K (genstyles) and 1.20 ratio are a decision; re-measure the ratio if either constant changes
const WIDTH_K = 1.3;
// ---- end trims: paint ending at a junction butts against the crossing paint, corners never poking past
const SURF_HALF = 3.3 * WIDTH_K, HALF_HALF = 1.65 * WIDTH_K;   // all full-road paint shares one half-width (SURF_HALF); HALF_HALF is the one-side fill's own half-width
/** @param {AnyPoint} p @param {AnyPoint} a @param {AnyPoint} b */
function ptSegDistM(p, a, b) {
  const P = XYOf(p), A = XYOf(a), B = XYOf(b);
  const vx = B[0] - A[0], vy = B[1] - A[1], L2 = vx * vx + vy * vy || 1;
  let t = ((P[0] - A[0]) * vx + (P[1] - A[1]) * vy) / L2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(P[0] - (A[0] + t * vx), P[1] - (A[1] + t * vy));
}
/** @param {AnyPoint[]} pts @param {boolean} atStart @param {number} half */
function endCorners(pts, atStart, half) {
  const E = atStart ? pts[0] : pts[pts.length - 1];
  if (!E) return [];
  // walk inward past duplicate vertices until a point at least 1 m away gives a true heading
  let I = null;
  const order = pts.map((_, i) => atStart ? i : pts.length - 1 - i);
  for (const i of order.slice(1)) { if (H.jDistM(pts[i], E) >= 1) { I = pts[i]; break; } }
  if (!I) I = atStart ? pts[pts.length - 1] : pts[0];
  if (!I || I === E) return [];
  const P = XYOf(E), Q = XYOf(I);
  let dx = P[0] - Q[0], dy = P[1] - Q[1]; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  // true corners offset perpendicular to the heading: the perpendicular of (dx, dy) is (-dy, dx)
  return [[E[0] + (dx * half) / H.MLAT, E[1] + (-dy * half) / H.MLNG], [E[0] + (-dx * half) / H.MLAT, E[1] + (dy * half) / H.MLNG]];
}
/** @param {AnyPoint} cp @param {string} B */
function nearestPaintM(cp, B) {
  // distance to B's centreline plus the owning cut's half: a corner judges against the arm it lies along
  const st = GEO[B].stitched;
  let bd = 1e9, half = SURF_HALF, pt = null;
  for (let k = 0; k < st.length - 1; k++) {
    if (!TOPO.segReal(B, k)) continue; // the between-runs pair is not a segment of B
    const d = ptSegDistM(cp, st[k], st[k + 1]);
    if (d < bd) { bd = d; half = SURF_HALF; pt = nearestPtOnSeg(cp, st[k], st[k + 1]); }
  }
  return { d: bd, half, pt };
}
/** @param {AnyPoint} p @param {AnyPoint} a @param {AnyPoint} b */
function nearestPtOnSeg(p, a, b) {
  const P = XYOf(p), A = XYOf(a), B = XYOf(b);
  const vx = B[0] - A[0], vy = B[1] - A[1], L2 = vx * vx + vy * vy || 1;
  let t = ((P[0] - A[0]) * vx + (P[1] - A[1]) * vy) / L2; t = Math.max(0, Math.min(1, t));
  return [(A[1] + t * vy) / H.MLAT, (A[0] + t * vx) / H.MLNG];
}
/** @param {AnyPoint} cp @param {string} B @param {AnyPoint} V */
function pokeExcess(cp, B, V) {
  // poke past B's paint, or -1 in its end disc (nearest the shared vertex: beyond B's end)
  const np = nearestPaintM(cp, B);
  if (np.pt && H.jDistM(np.pt, V) < 0.05) return -1;
  return np.d - np.half;
}
/** @param {AnyPoint[]} pts @param {boolean} atStart @param {number} d */
function pullbackEnd(pts, atStart, d) {
  // the slice with its end pulled back along its trace by d metres (interpolated on the trace)
  const work = atStart ? pts.slice() : pts.slice().reverse();   // end-first
  let acc = 0;
  for (let k = 1; k < work.length; k++) {
    const seg = H.jDistM(work[k], work[k - 1]);
    if (acc + seg >= d) { const f = seg ? (d - acc) / seg : 0;
    const cut = [work[k - 1][0] + (work[k][0] - work[k - 1][0]) * f, work[k - 1][1] + (work[k][1] - work[k - 1][1]) * f];
    const out = [cut].concat(work.slice(k));
    return atStart ? out : out.reverse();
    }
    acc += seg;
  }
  return pts;
}
/** @param {string} B @param {number} viB @param {AnyPoint} Ix @param {AnyPoint} Vx */
function capLineFor(B, viB, Ix, Vx) {
  // the crossing street's near paint edge as a line {px, py, nx, ny}, built from B's arms
  const st = GEO[B].stitched, Vp = st[viB];
  let pPrev = null, pNext = null;
  for (let k = viB - 1; k >= 0; k--) { if (!TOPO.segReal(B, k)) break; if (H.jDistM(st[k], Vp) >= 1) { pPrev = st[k]; break; } } // an arm's direction stays within its own run: the scan never borrows a point across a gap
  for (let k = viB + 1; k < st.length; k++) { if (TOPO.runStart(B, k)) break; if (H.jDistM(st[k], Vp) >= 1) { pNext = st[k]; break; } }
  const arms = [];
  if (pPrev) arms.push(pPrev);
  if (pNext) arms.push(pNext);
  if (!arms.length) return null;
  const W = arms.map(p => {
    const P = XYOf(p);
    let ux = P[0] - Vx[0], uy = P[1] - Vx[1]; const m = Math.hypot(ux, uy) || 1; ux /= m; uy /= m;
    let nx = -uy, ny = ux;
    if ((Ix[0] - Vx[0]) * nx + (Ix[1] - Vx[1]) * ny < 0) { nx = -nx; ny = -ny; }
    // each arm's edge uses its own half: the near edge is the kinked line through both arms' edges
    const half = SURF_HALF;
    return [Vx[0] + nx * half, Vx[1] + ny * half, nx, ny];
  });
  if (W.length === 2) {
    let cx = W[1][0] - W[0][0], cy = W[1][1] - W[0][1]; const m = Math.hypot(cx, cy);
    if (m >= 0.05) {
      // only on a bend: straight, the kinked line crosses the street - under 0.5 m from V, fall through
      const ux = cx / m, uy = cy / m;
      const distV = Math.abs((Vx[0] - W[0][0]) * uy - (Vx[1] - W[0][1]) * ux);
      if (distV >= 0.5) { cx /= m; cy /= m; let nx = -cy, ny = cx; if ((Ix[0] - Vx[0]) * nx + (Ix[1] - Vx[1]) * ny < 0) { nx = -nx; ny = -ny; } return { px: W[0][0], py: W[0][1], nx, ny }; }
    }
  }
  const Wbest = W.length === 2 && Math.hypot(W[1][0] - Vx[0], W[1][1] - Vx[1]) > Math.hypot(W[0][0] - Vx[0], W[0][1] - Vx[1]) ? W[1] : W[0];
  return { px: Wbest[0], py: Wbest[1], nx: Wbest[2], ny: Wbest[3] };
}
/** @param {string} n @param {number} vi @param {AnyPoint[]} pts @param {boolean} atStart @param {number} ownHalf */
function clipEndAtJunction(n, vi, pts, atStart, ownHalf) {
  // the edge clip (Andrew's rule): an end poking past a crossing street's edge is re-cut flush along that edge
  if (pts.length < 2) return pts;
  if (!JUNC) buildJunctions();
  const entries = (JUNC[n] || []).filter(J => J.viA === vi);
  if (!entries.length) return pts;
  const V = GEO[n].stitched[vi];
  const grp = TOPO.at(coordKey(V));
  const end0 = atStart ? pts[0] : pts[pts.length - 1];
  // anchors at growing depths: a bending trace parallels the edge first, so a deeper one forms the cap
  /** @type {AnyPoint[]} */
  const inners = [];
  { let cum = 0; const marks = [1, 4.5, 9, 14]; let mi = 0;
    for (let k = 1; k < pts.length && mi < marks.length; k++) { const p = atStart ? pts[k] : pts[pts.length - 1 - k]; cum += H.jDistM(p, atStart ? pts[k - 1] : pts[pts.length - k]); if (cum >= marks[mi]) { inners.push(p); mi++; } } }
  if (!inners.length) return pts;
  const Vx = XYOf(V);
  const tried = new Set();
  for (let round = 0; round < 3; round++) {
    const corners = endCorners(pts, atStart, ownHalf);
    if (corners.length < 2) return pts;
    /** @type {{ J: EngineJunction, ex: number, viB: number | null, bHalf: number } | null} */
    let worst = null;
    entries.forEach(J => {
      if (tried.has(J.B)) return;
      const ge = grp.find(e => e.n === J.B);
      corners.forEach(cp => { const ex = pokeExcess(cp, J.B, V); if (ex > 0.10 && (!worst || ex > worst.ex)) worst = { J, ex, viB: ge ? ge.vi : null, bHalf: nearestPaintM(cp, J.B).half }; });
      // ends at a spanning street land on the strip, blinding the corner test: test the edge line
      if (ge) {
        const bst = GEO[J.B].stitched;
        const spans = (grp.filter(e => e.n === J.B)).some(e => TOPO.interior(J.B, e.vi, bst.length)); // a run-end vertex does not span the junction: the street terminates there, even resuming elsewhere
        if (spans) {
          // a trace can overshoot and pick the wrong edge: judge every anchor's cap line, deepest wins
          let exL = -1;
          inners.forEach(inp => {
            const capT = capLineFor(J.B, ge.vi, XYOf(inp), Vx);
            if (!capT) return;
            /** @type {(p: AnyPoint) => number} */
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
      // PLUS only when the crossing street runs through; when it also ends, MINUS (short stops open holes)
      const bSt = GEO[worst.J.B].stitched;
      const bSpans = grp.filter(e => e.n === worst.J.B).some(e => TOPO.interior(worst.J.B, e.vi, bSt.length)); // the same rule as spans: a run-end vertex does not span the junction
      const P = bSpans ? [(Ex[1] + cap.ny * L) / H.MLAT, (Ex[0] + cap.nx * L) / H.MLNG]
                       : [(Ex[1] - cap.ny * L) / H.MLAT, (Ex[0] - cap.nx * L) / H.MLNG];
      const cumE = (1 - t) * Math.hypot(dv[0], dv[1]);
      // work end-first (work[0] = the end being cut), then restore the caller's orientation
      const work = atStart ? pts.slice() : pts.slice().reverse();
      let cum = 0, ki = work.length - 1;
      for (let k = 1; k < work.length; k++) { cum += H.jDistM(work[k], work[k - 1]); if (cum > cumE + L * 1.05) { ki = k; break; } }
      const nw = [E, P].concat(work.slice(ki));
      pts = atStart ? nw : nw.reverse();
      applied = true;
      break;
    }
    if (!applied) {
      // merge fallback: no edge to butt against (nearly parallel), so pull the end back until its corners clear
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
/** @param {EngineStrand[]} strands @param {number} half @param {(sl:EngineStrand,atStart:boolean)=>AnyPoint[]} [guideFor] @param {(sl:EngineStrand,atStart:boolean)=>boolean} [skipEnd] */
function clipStrandEnds(strands, half, guideFor, skipEnd) {
  // post-merge: clip every strand end sitting exactly on a junction vertex
  strands.forEach(sl => {
    if (!sl.mem || !sl.mem.length) return;
    [true, false].forEach(atStart => {
      if (skipEnd && skipEnd(sl, atStart)) return;   // bands skip ends whose green continues as a neighbouring piece's fill - clipping them would reopen the fill/band break
      const E = atStart ? sl.pts[0] : sl.pts[sl.pts.length - 1];
      if (!E) return;
      const grp = TOPO.at(coordKey(E));
      if (new Set(grp.map(e => e.n)).size < 2) return;
      const A = atStart ? sl.mem[0].n : sl.mem[sl.mem.length - 1].n;
      const ent = grp.find(e => e.n === A);
      if (!ent) return;
      const guide = guideFor ? guideFor(sl, atStart) : null;
      sl.pts = guide ? clipOnLine(A, ent.vi, sl.pts, atStart, half, guide) : clipEndAtJunction(A, ent.vi, sl.pts, atStart, half);
    });
  });
}
/** @param {AnyPoint} p @param {AnyPoint[]} line */
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
/** @param {string} n @param {number} vi @param {AnyPoint[]} pts @param {boolean} atStart @param {number} ownHalf @param {AnyPoint[]} line */
function clipOnLine(n, vi, pts, atStart, ownHalf, line) {
  // the generic solve drags an offset end centreline-ward: run it, then shift its pair onto this line
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
        // accept the intersection only near the solved end and the line; else the bounded projection fallback
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
/** @param {string} n @param {number} idx @param {number} side */
function fillSlicePts(n, idx, side) {   // a one-side fill slice: the half-offset line, trimmed only where this side's fill ends
  const g = GEO[n], ab = g.cuts[idx];
  const line = side === 0 ? g.offH0 : g.offH1;
  let pts = line.slice(ab[0], ab[1] + 1);
  // continuation is the paint model's (fillCont): a both-sides piece continues this side, so the fill keeps its vertex
  if (idx === 0 || TOPO.runStart(n, ab[0]) || !PAINT.fillCont(n, idx - 1, side)) pts = clipOnLine(n, ab[0], pts, true, HALF_HALF, line);
  if (idx === g.cuts.length - 1 || TOPO.runStart(n, g.cuts[idx + 1][0]) || !PAINT.fillCont(n, idx + 1, side)) pts = clipOnLine(n, ab[1], pts, false, HALF_HALF, line);
  return pts;
}
/** @param {EngineStrand[]} fills */
function fillCornerLinks(fills) {
  // the corner wrap: where a side turns a corner into another's, a connector strand joins them at their intersection
  const verts = [];
  const svm = TOPO.verts();
  for (const k in svm) { const g = svm[k]; if (new Set(g.map(e => e.n)).size >= 2) verts.push(GEO[g[0].n].stitched[g[0].vi]); }
  if (!verts.length) return;
  /** @type {{E:AnyPoint,Exy:AnyPoint,dir:AnyPoint,mem:EngineMember}[]} */
  const ends = [];
  fills.forEach(sl => {
    if (!sl.mem || !sl.mem.length || sl.pts.length < 2) return;
    /** @type {[EngineMember,AnyPoint,AnyPoint][]} */ ([[sl.mem[0], sl.pts[0], sl.pts[1]],
      [sl.mem[sl.mem.length - 1], sl.pts[sl.pts.length - 1], sl.pts[sl.pts.length - 2]]]).forEach(([m, E, I]) => {
      if (!m || m.side === undefined) return;
      const Exy = XYOf(E), Ixy = XYOf(I);
      const dx = Exy[0] - Ixy[0], dy = Exy[1] - Ixy[1], L = Math.hypot(dx, dy) || 1;
      ends.push({ E, Exy, dir: [dx / L, dy / L], mem: m });
    });
  });
  const cross = /** @param {AnyPoint} u @param {AnyPoint} v */ (u, v) => u[0] * v[1] - u[1] * v[0];
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
    // the corner flag is explicit: a strand from two pieces also carries two mem entries, so mem-count cannot identify connectors
    fills.push({ pts: [a.E, [Cxy[1] / H.MLAT, Cxy[0] / H.MLNG], b.E], key: 'fill', mem: [a.mem, b.mem], corner: true });
  }
}
// ===== boundary-end feathers (option C): paint ends at the join with a fade over the last 15 m
const FADE_M = 15; // fade length is per-record data (element 5); this constant defaults a legacy 4-element record only
/** @param {number[]} rec */
function fadeMOf(rec) { return (rec && isFinite(rec[4]) && rec[4] > 0) ? rec[4] : FADE_M; }
/** @param {string} n @param {AnyPoint} pt */
function boundaryRecAt(n, pt) { // the street's end record (boundary or dead) whose END point is pt, or null
  const ends = H.STRETCH[n] && H.STRETCH[n].ends;
  if (!ends) return null;
  for (const r of ends) if (H.jDistM([r[0], r[1]], pt) <= 1.5) return r;
  return null;
}
/** @param {AnyPoint[]} pts @param {AnyPoint} join @param {boolean} atStart @param {number} fadeM */
function splitBoundaryEnd(pts, join, atStart, fadeM) { // -> { solid, fade }: cut at the join, split the fade zone; either part can be null
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
  const sub = /** @param {number} d0 @param {number} d1 */ (d0, d1) => { // the points between two along-distances, cut points interpolated (sliceLine's way)
    if (d1 - d0 < 0.05) return null;
    /** @type {(d: number) => AnyPoint} */
    const at = d => { for (let i = 1; i < pts.length; i++) { if (d <= cum[i] || i === pts.length - 1) { const span = cum[i] - cum[i - 1] || 1; const t = Math.max(0,
      Math.min(1, (d - cum[i - 1]) / span)); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
      pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; } } return pts[pts.length - 1]; };
    const out = [at(d0)];
    for (let i = 0; i < pts.length; i++) if (cum[i] > d0 && cum[i] < d1) out.push(pts[i]);
    out.push(at(d1));
    return out.length > 1 ? out : null;
  };
  if (!atStart) return { solid: sub(0, Math.max(0, dJ - fm)), fade: sub(Math.max(0, dJ - fm), dJ) };
  const fadePts = sub(dJ, Math.min(total, dJ + fm));
  return { solid: sub(Math.min(total, dJ + fm), total), fade: fadePts ? fadePts.reverse() : null }; // a run-start fade orders seam -> join like the rest: the slice runs join-first there, so it reverses
}
/** @param {string} n @param {AnyPoint} ab @param {AnyPoint[]} pts @param {string} kind @param {string} col @param {boolean} withCasing */
function boundarySplit(n, ab, pts, kind, col, withCasing) { // -> { solid, fades }: the split at both ends, judged through TOPO's run-end classification
  let solid = pts; const fades = /** @type {EngineFade[]} */ ([]);
  for (const atStart of [true, false]) {
    if (!solid || solid.length < 2) break;
    const cls = TOPO.endAt(n, atStart ? ab[0] : ab[1]);   // only a feather end splits (with its record): a junction end never splits, whatever the pack says
    if (!cls || cls.kind !== 'feather') continue;
    const rec = cls.rec;
    const sp = splitBoundaryEnd(solid, [rec[2], rec[3]], atStart, fadeMOf(rec)); // the record's own fade length (a dead end's split lands exactly at the terminus)
    if (sp.fade) { fades.push({ pts: sp.fade, k: kind, col }); if (withCasing) fades.push({ pts: sp.fade, k: 'x', col }); }
    solid = sp.solid;
  }
  return { solid, fades };
}
// ===== PAINT: the one owner of the paint inputs - classification, clip decisions, fill continuation live here
const PAINT = {
  strands: /** @type {Record<"centres" | "bands" | "edges" | "fills", EngineStrand[]> | null} */ (null),   // { centres, bands, edges, fills }: the last buildFamilies pass's merged strands; fills carry their corner provenance
  /** @param {string} n @param {number} idx */
  classify(n, idx) {   // the one classification: a piece's bits, its band-ness, its centre-family key, and its street's family key
    const bits = H.pieces[n][idx];
    const isBand = bits === 3;
    const key = isBand ? 'band' : mute(colOf(n, bits));
    /** @type {(i: number) => string} */
    const famKey = i => H.pieces[n][i] === 3 ? 'band' : mute(colOf(n, H.pieces[n][i]));
    return { bits, isBand, key, famKey };
  },
  /** @param {string} n @param {number} idx @param {AnyPoint[]} pts @param {number} half @param {boolean} bandRule */
  clipEnds(n, idx, pts, half, bandRule) {   // clip an end only where the paint ends there: a continuing piece keeps its shared vertex, merging seamlessly
    const g = GEO[n], ab = g.cuts[idx], c = PAINT.classify(n, idx);
    /** @type {(i:number)=>boolean} */
    const cont = bandRule ? (i => H.pieces[n][i] !== 0) : (i => c.famKey(i) === c.key);
    if (idx === 0 || TOPO.runStart(n, ab[0]) || !cont(idx - 1)) pts = clipEndAtJunction(n, ab[0], pts, true, half);
    if (idx === g.cuts.length - 1 || TOPO.runStart(n, g.cuts[idx + 1][0]) || !cont(idx + 1)) pts = clipEndAtJunction(n, ab[1], pts, false, half);
    return pts;
  },
  /** @param {string} n @param {number} i @param {number} side */
  fillCont(n, i, side) {   // piece i continues a side's fill when it marks it (both-sides included: the band covers the side)
    const b = H.pieces[n][i];
    return !!((b & (1 << side)) || b === 3);
  }
};
// a street's slices are a pure function of its pieces: cached per street, handed out as fresh objects
/** @type {Map<string,{sig:string,out:ReturnType<typeof buildStreetSlices>}>} */
const SLICE_CACHE = new Map();
/** @param {string} n */
function buildStreetSlices(n) {
  const g = GEO[n];
  const centres = /** @type {EngineStrand[]} */ ([]), bands = /** @type {EngineStrand[]} */ ([]), fills = /** @type {EngineStrand[]} */ ([]), fades = /** @type {EngineFade[]} */ ([]);
  g.cuts.forEach((ab, idx) => {
    const c = PAINT.classify(n, idx);   // the classification is the PAINT model's, computed once per piece
    const bits = c.bits, isBand = c.isBand, key = c.key;
    let cPts = g.stitched.slice(ab[0], ab[1] + 1);
    const ownHalf = SURF_HALF;   // bands draw at the surface width, so a band end trims against the same half-width
    cPts = PAINT.clipEnds(n, idx, cPts, ownHalf, false);   // the model's clip decision: clip only where the paint ends (different family, run gap, street end)
    if (isBand) {   // the band clips only where the green ends: beside a one-side piece it keeps its shared vertex
      let bPts = g.stitched.slice(ab[0], ab[1] + 1);
      bPts = PAINT.clipEnds(n, idx, bPts, ownHalf, true);   // the band clip decision is the model's band rule
      const bSp = boundarySplit(n, ab, bPts, 'b', MUGREEN, true); // a band at a boundary end feathers like every other family
      for (const f of bSp.fades) fades.push(f);
      if (bSp.solid) bands.push({ pts: bSp.solid, key: 'band', mem: [{ n, idx }], e0: null, e1: null });
    }
    else { const cSp = boundarySplit(n, ab, cPts, 'c', key, true); for (const f of cSp.fades) fades.push(f); if (cSp.solid) centres.push({ pts: cSp.solid, key, mem: [{ n, idx }], e0: null, e1: null }); }
    if (!isBand && bits !== 0) [0, 1].forEach(side => { if (bits & (1 << side)) { const fSp = boundarySplit(n, ab, fillSlicePts(n, idx, side), 'f', MUGREEN, false); for (const f of fSp.fades) fades.push(f); if (fSp.solid) fills.push({ pts: fSp.solid, key: 'fill', mem: [{ n, idx, side }], e0: null, e1: null }); } });   // Beta 1.208: a one-side-done piece also emits its side's FILL (the half-road green Andrew ordered in place of the kerb outline). Beta 1.259: the fill feathers at a boundary end too, split on its own half-offset line at the point nearest the join
  });
  return { centres, bands, fills, fades };
}
/** @param {string} n */
function streetSlices(n) {
  const sig = H.pieces[n].join(',');
  let rec = SLICE_CACHE.get(n);
  if (!rec || rec.sig !== sig) { rec = { sig, out: buildStreetSlices(n) }; SLICE_CACHE.set(n, rec); }
  /** @type {(list: EngineStrand[]) => EngineStrand[]} */
  const fresh = list => list.map(/** @returns {EngineStrand} */ sl => ({ pts: sl.pts.slice(), key: sl.key, mem: sl.mem.map(m => ({ ...m })), e0: null, e1: null }));
  return { centres: fresh(rec.out.centres), bands: fresh(rec.out.bands), fills: fresh(rec.out.fills), fades: rec.out.fades.map(f => ({ pts: f.pts.slice(), k: f.k, col: f.col })) };
}
function buildFamilies() {
  THROUGH_SEGS = [];
  const pairs = junctionPairs();
  PAIRS_CUR = pairs;
  const centreSlices = /** @type {EngineStrand[]} */ ([]),
  bandSlices = /** @type {EngineStrand[]} */ ([]),
  edgeSlices = /** @type {EngineStrand[]} */ ([]),
  fillSlices = /** @type {EngineStrand[]} */ ([]), fadeSlices = /** @type {EngineFade[]} */ ([]);
  H.names.forEach(n => {
    const own = streetSlices(n);
    for (const sl of own.centres) centreSlices.push(sl);
    for (const sl of own.bands) bandSlices.push(sl);
    for (const sl of own.fills) fillSlices.push(sl);
    for (const f of own.fades) fadeSlices.push(f);
    [0, 1].forEach(side => {
      edgeRunSlices(n, side, idx => H.pieces[n][idx] !== 3 && (H.pieces[n][idx] & (1 << side))).forEach(sl => edgeSlices.push(sl));
    });
  });
  const centres = mergeStrands(centreSlices, null);
  const bands = mergeStrands(bandSlices, null);
  clipStrandEnds(centres, SURF_HALF);
  clipStrandEnds(bands,
    SURF_HALF,
    null,
    (sl,
      atStart) => { const m = atStart ? sl.mem[0] : sl.mem[sl.mem.length - 1]; if (!m) return false; const g = GEO[m.n],
      ni = atStart ? m.idx - 1 : m.idx + 1; if (ni < 0 || ni >= g.cuts.length) return false; if (TOPO.runStart(m.n, g.cuts[atStart ? m.idx : ni][0])) return false; return H.pieces[m.n][ni] !== 0; });
  const fills = mergeStrands(fillSlices, null);   // exact joins only: consecutive pieces share the half-line vertex, so a fill is one strand through junctions
  // fill strand ends clip ON their half-offset line (clipOnLine), never dragged toward the centreline
  clipStrandEnds(fills, HALF_HALF, (sl, atStart) => { const m = atStart ? sl.mem[0] : sl.mem[sl.mem.length - 1]; return m && m.side !== undefined ? (m.side ? GEO[m.n].offH1 : GEO[m.n].offH0) : null; });
  fillCornerLinks(fills);   // and where a marked side turns a corner into another's marked side, the fills wrap the corner (fillCornerLinks)
  cornerTouchSlices(edgeSlices, pairs);
  const edges = mergeStrands(edgeSlices, pairs);
  bridgeStragglers(edges, pairs);
  throughTouch(edges, pairs);
  extendIntoBands(edges, pairs);
  lastResortConnect(edges, bands);
  PAINT.strands = { centres, bands, edges, fills };   // the merged strands publish into the model: buildSelFill reads the fills from it, not a module global
  const fc = /** @param {EngineStrand[]} list @param {(sl:EngineStrand)=>string} colFn */ (list, colFn) => ({
    type: 'FeatureCollection', features: list.map(sl => { const c = colFn(sl); return { type: 'Feature', properties: { col: c, colG: mute(c) }, geometry: { type: 'LineString', coordinates: GJ(sl.pts) } }; }) });
  return { centres: fc(centres, sl => sl.key),
    bands: fc(bands, () => MUGREEN),
    edges: fc(edges, () => MUGREEN),
    fills: fc(fills, () => MUGREEN),
    fades: { type: 'FeatureCollection', features: fadeSlices.map(sl => ({ type: 'Feature', properties: { col: sl.col, k: sl.k }, geometry: { type: 'LineString', coordinates: GJ(sl.pts) } })) } };
  // the fade features bypass mergeStrands by design: each is its own short line, so progress spans exactly the fade zone
}
function currentSelList() { // every selected stretch: the app's selSet when multi-selecting, else the single anchor - read live at build time
  return (typeof H.selSet !== 'undefined' && Array.isArray(H.selSet) && H.selSet.length) ? H.selSet : (sel ? [sel] : []);
}
function buildSelFill() {   // selected fills build by fillSlicePts, the board's rule, so a selected side paints vertex-for-vertex as the board's
  const feats = [];
  /** @type {EngineMember[]} */
  const selSides = [];
  /** @type {EngineFade[]} */
  const fades = [];
  for (const it of currentSelList()) {
    const bits = H.pieces[it.name][it.idx];
    if (bits !== 3) [0,
      1].forEach(side => { if (bits & (1 << side)) { const fSp = boundarySplit(it.name,
        GEO[it.name].cuts[it.idx],
        fillSlicePts(it.name, it.idx, side),
        'f',
        GREEN,
        false); for (const f of fSp.fades) fades.push(f); if (fSp.solid) { feats.push({ type: 'Feature',
          properties: { col: GREEN, colG: mute(GREEN) },
          geometry: { type: 'LineString', coordinates: GJ(fSp.solid) } }); selSides.push({ n: it.name,
          idx: it.idx,
          side }); } } });
  }
  // board connectors touching a selected side redraw here too (vibrant), identified by the explicit flag, not mem count
  if (selSides.length && PAINT.strands && PAINT.strands.fills) {
    for (const sl of PAINT.strands.fills) {
      if (!sl.corner || !sl.mem) continue;
      if (sl.mem.some(m => m && selSides.some(s => s.n === m.n && s.idx === m.idx && s.side === m.side)))
        feats.push({ type: 'Feature', properties: { col: GREEN, colG: mute(GREEN) }, geometry: { type: 'LineString', coordinates: GJ(sl.pts) } });
    }
  }
  return { fill: { type: 'FeatureCollection', features: feats }, fades };
}
/** @type {EngineCollection} */
const EMPTYFC = { type: 'FeatureCollection', features: [] };
/** @param {EngineSelection} it */
function selectedGeom(it) {   // a selected stretch's painted slice: stitched points, edge-clipped at its junctions
  const s0 = it || sel;
  if (!s0) return null;
  const n = s0.name, idx = s0.idx, g = GEO[n], ab = g.cuts[idx];
  const c = PAINT.classify(n, idx);   // the classification is the PAINT model's
  const bits = c.bits, isBand = c.isBand, half = SURF_HALF;   // the selection redraw of a band trims at the width the band now draws
  let pts = g.stitched.slice(ab[0], ab[1] + 1);
  pts = PAINT.clipEnds(n, idx, pts, half, isBand);   // the model's clip decision: bands follow the per-side-paint rule, other pieces the centre-family rule
  const sp = boundarySplit(n, ab, pts, isBand ? 'b' : 'c', isBand ? GREEN : colOf(n, bits), false); // the redraw feathers at boundary ends (vibrant): pts becomes the trimmed solid, fades ride along
  return { pts: sp.solid, bits, half, fades: sp.fades };
}
function buildSelC() {   // the selected sector's core: a vibrant BAND when complete, a vibrant core otherwise
  // locals named sel/selBand shadowed the global selection: colOf read undefined and pending selections rendered red
  const selFeats = [], bandFeats = [], selFades = [];
  for (const it of currentSelList()) {
    const sg = selectedGeom(it);
    if (!sg) continue;
    if (sg.fades) for (const f of sg.fades) selFades.push(f); // the stretch's boundary-end fades (vibrant) - collected even when nothing solid survives the split
    if (!sg.pts || sg.pts.length < 2) continue;
    if (sg.bits !== 3) selFeats.push({ type: 'Feature', properties: { col: colOf(it.name, sg.bits) }, geometry: { type: 'LineString', coordinates: GJ(sg.pts) } });
    else bandFeats.push({ type: 'Feature', properties: { col: GREEN }, geometry: { type: 'LineString', coordinates: GJ(sg.pts) } });
  }
  return { sel: selFeats.length ? { type: 'FeatureCollection', features: selFeats } : EMPTYFC, selBand: bandFeats.length ? { type: 'FeatureCollection', features: bandFeats } : EMPTYFC, selFades };
}
/** @param {EngineFade[]} triples */
function fadeFC(triples) { // fade triples ({pts, k, col}) -> the selFades collection
  return triples.length ? { type: 'FeatureCollection', features: triples.map(sl => ({ type: 'Feature', properties: { col: sl.col, k: sl.k }, geometry: { type: 'LineString', coordinates: GJ(sl.pts) } })) } : EMPTYFC;
}
/** @type {EngineCollection} */
const HIT = { type: 'FeatureCollection', features: [] }; // filled per load by buildEngineGeometry
buildEngineGeometry(); // the eval pass builds the empty geometry (no route loaded yet): the structures exist, every reader safe
/** @type {Record<"centres"|"bands"|"edges"|"fills"|"fades"|"sel"|"selBand"|"selFill"|"selFades",EngineCollection>|null} */
let CUR = null;
function rebuildData() { const F = buildFamilies(); const SC = buildSelC(); const SF = buildSelFill();
  // paint order: red strands sort before yellow (yellow paints over red); green bands sit below all centres
  /** @type {(f: EngineFeature) => number} */
  const yRank = f => (f.properties.col === mute(YELLOW) || f.properties.col === YELLOW) ? 1 : 0;   // keys off the live scheme
  F.centres.features.sort((a, b) => yRank(a) - yRank(b));
  CUR = { centres: F.centres, bands: F.bands, edges: F.edges, fills: F.fills, fades: F.fades, sel: SC.sel, selBand: SC.selBand, selFill: SF.fill, selFades: fadeFC([...SC.selFades, ...SF.fades]) }; }

/** @param {WidthCurve} curve */
function scaleW(curve) {
  return /** @type {WidthCurve} */ (curve.map((v, i) => (i >= 4 && i % 2 === 0)
    ? +(/** @type {number} */ (v) * WIDTH_K).toFixed(3) : v)); }   // scale an interpolate width curve by WIDTH_K (widths sit at even indices >= 4, the wPlus/wScale index rule)
const surfW = scaleW(['interpolate', ['linear'], ['zoom'], 14, 2.5, 16, 7.63, 17, 15.25, 18, 30.5, 19, 61]);   // the z16-19 stops hold drawn width at the geographic surface width (2 x SURF_HALF)
const surfCASE = scaleW(['interpolate', ['linear'], ['zoom'], 14, 4.5, 16, 10.13, 17, 18.25, 18, 33.99, 19, 65]);   // the surface's casing curve: completed bands draw at the surface's width, so their casing is this curve too
const wPlus = /** @param {WidthCurve} curve @param {number} d */ (curve, d) =>
  curve.map((v, i) => (i >= 4 && i % 2 === 0) ? /** @type {number} */ (v) + d * WIDTH_K : v);   // widen a width curve by d px per stop; the added px scale by WIDTH_K too
const wScale = /** @param {WidthCurve} curve @param {number} f */ (curve, f) => curve.map((v, i) => (i >= 4 && i % 2 === 0) ? /** @type {number} */ (v) * f : v);   // scale an interpolate width curve (same index rule as wPlus)
// zoom-tapered glow: at low zoom the full-width glow creased into starburst rays, so glowW/glowB scale it down
const GLOW_TAPER = [[14, 0.15], [15, 0.32], [16, 0.68], [16.5, 1]];
/** @param {number} z */
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
/** @param {WidthCurve} curve @param {number} z */
function curveAt(curve, z) {
  if (z <= curve[3]) return curve[4];
  for (let i = 5; i < curve.length; i += 2) {
    if (z <= /** @type {number} */ (curve[i]))
      return /** @type {number} */ (curve[i + 1])
        + (/** @type {number} */ (curve[i - 1]) - /** @type {number} */ (curve[i + 1])) * (/** @type {number} */ (curve[i]) - z) / (/** @type {number} */ (curve[i]) - /** @type {number} */ (curve[i - 2]));
  }
  return /** @type {number} */ (curve[curve.length - 1]);
}
/** @param {WidthCurve} curve @param {number} delta */
function glowW(curve, delta) {
  /** @type {WidthCurve} */
  const ex = ['interpolate', ['linear'], ['zoom']];
  for (const z of [14, 15, 16, 16.5, 17, 18, 19]) ex.push(z, +(curveAt(curve, z) + delta * WIDTH_K * taperAt(z)).toFixed(2));   // the live glow's extra width scales by WIDTH_K, same as the initial stack's wPlus
  return ex;
}
/** @param {number} b */
function glowB(b) { return ['interpolate', ['linear'], ['zoom'], 14, +(b * 0.35).toFixed(2), 15.5, +(b * 0.6).toFixed(2), 16.5, b]; }
/** @param {string} hex @param {number} f */
function lighten(hex, f) {   // mix a #rrggbb colour toward white by f (0..1) - the "hot core" colours for the glow presets
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  /** @type {(c:number)=>number} */
  const m = c => Math.round(c + (255 - c) * f);
  return '#' + [m(r), m(g), m(b)].map(c => c.toString(16).padStart(2, '0')).join('');
}
function firstSymbolId() {
  const ls = GLM.getStyle().layers;
  const s = ls.find(l => l.type === 'symbol');
  return s ? s.id : undefined;
}
// place-name tuning: the styles already carry every place name with zoom bands and population-sorted thinning
/** @type {Partial<Record<string,number>>} */
const PLACE_EARLY = { suburb: 8, quarter: 8.5, neighbourhood: 9, hamlet: 8, village: 8, subplace: 9 }; // the one owner of place-label zooms (how early each settlement kind may appear); labels cap at 15.5
/** @param {string} id */
function placeClass(id) {
  if (id.includes('neighbourhood') || id.includes('neighborhood')) return 'neighbourhood';
  if (id.includes('quarter')) return 'quarter';
  if (id.includes('hamlet')) return 'hamlet';
  if (id.includes('place-city') || id.includes('place_city') || id.includes('capital')) return 'city';
  if (id.includes('place-town') || id.includes('place_town')) return 'town';
  if (id.includes('place-village') || id.includes('place_village')) return 'village';
  if (id.includes('place-suburb') || id.includes('place_suburb')) return 'suburb';
  if (id === 'places_locality') return 'city'; // cities, towns and villages share one layer: the data gates each by size; only the 15.5 cap applies
  if (id === 'places_subplace') return 'subplace'; // the neighbourhood/macrohood layer
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
    if (L.minzoom !== minZ || (L.maxzoom === undefined ? 24 : L.maxzoom) !== 15.5) GLM.setLayerZoomRange(L.id, minZ, 15.5); // no-op guard (see glUnifyLabels) - skip when the range already matches
  }
}
// ---- the layer catalogue: groups written once, in stack order; the text/stack lists derive from them
/** @type {Record<"paint"|"poi"|"titles"|"glow",string[]> & Partial<Record<"text"|"stack",string[]>>} */
const LAYERS = {
  paint: ['t1-casing',
    't1-casingb',
    't1-surface',
    't1-band',
    't1-fill',
    'fade-casing',
    'fade-surf-y',
    'fade-surf-r',
    'fade-band-g',
    'fade-fill-g',
    't1-sel',
    't1-selband',
    't1-selfill',
    'selfade-y',
    'selfade-r',
    'selfade-g',
    'selfade-fill',
    'sel-core-s',
    'sel-core-b',
    'hit'],
  poi: ['routepoi-ring', 'routepoi-dot', 'routepoi-txt'],
  titles: [1, 2, 3, 4].map(t => 'streetnamespt' + t),
  glow: [1, 2, 3, 4, 5].flatMap(i => ['sel-glow' + i + '-s', 'sel-glow' + i + '-b']),
};
LAYERS.text = [...LAYERS.titles, 'routepoi-txt'];
LAYERS.stack = [...LAYERS.paint, ...LAYERS.poi, ...LAYERS.titles, ...LAYERS.glow];
function addStack() {
  tunePlaceLabels();
  const newStack = !GLM.getSource('centres');
  if (newStack) {
    GLM.addSource('centres', { type: 'geojson', data: CUR.centres });
    GLM.addSource('bands', { type: 'geojson', data: CUR.bands });
    GLM.addSource('edges', { type: 'geojson', data: CUR.edges });
    GLM.addSource('fills', { type: 'geojson', data: CUR.fills });
    GLM.addSource('fades', { type: 'geojson', lineMetrics: true, data: CUR.fades }); // lineMetrics is line-gradient's precondition
    GLM.addSource('selFades', { type: 'geojson', lineMetrics: true, data: CUR.selFades });
    GLM.addSource('sel', { type: 'geojson', data: CUR.sel });
    GLM.addSource('selBand', { type: 'geojson', data: CUR.selBand });
    GLM.addSource('selFill', { type: 'geojson', data: CUR.selFill });
    GLM.addSource('selGlow', { type: 'geojson', data: buildSelGlow() });
    GLM.addSource('hit', { type: 'geojson', data: HIT });
    GLM.addSource('routepoi', { type: 'geojson', data: ROUTEPOI });
  }
  const before = firstSymbolId();
  const add = /** @param {EngineLayer} layer */ (layer) => { if (!GLM.getLayer(layer.id)) GLM.addLayer(layer, before); };
  const line = /** @param {string} id @param {string} source @param {Record<string, unknown>} paint @param {Record<string, unknown>} [layout] @param {unknown} [filter] */ (id, source, paint, layout, filter) => {
    /** @type {EngineLayer} */
    const o = { id, type: 'line', source, layout: Object.assign({ 'line-cap': 'round', 'line-join': 'miter' }, layout || {}), paint }; if (filter) o.filter = filter; return o; };
  // NOTE: a present-but-undefined `filter` key makes MapLibre silently drop the layer
  /* --- T1: the surface carries the state; red sorts before yellow, green bands above centres */
  add(line('t1-casing',
    'centres',
    { 'line-color': H.isNight() ? '#000000' : '#5a5f6a', 'line-width': surfCASE, 'line-opacity': ['step', ['zoom'], 0, 12.6, 1], 'line-opacity-transition': { duration: 0, delay: 0 } },
    { 'line-cap': 'butt' }));
  add(line('t1-casingb', 'bands', { 'line-color': H.isNight() ? '#000000' : '#5a5f6a', 'line-width': surfCASE, 'line-opacity': ['step', ['zoom'], 0, 12.6, 1], 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }));
  add(line('t1-surface', 'centres', { 'line-color': ['get', 'col'], 'line-width': surfW, 'line-opacity': ['step', ['zoom'], 0, 12.6, 1], 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }));
  // the completed band draws at surfW - the same width as the not-done surface, per Andrew's order
  add(line('t1-band', 'bands', { 'line-color': ['get', 'col'], 'line-width': surfW, 'line-opacity': ['step', ['zoom'], 0, 12.6, 1], 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }));
  // a side's green fills its half of the road (a half-offset ribbon), replacing the t1-edge kerb line
  add(line('t1-fill', 'fills', { 'line-color': ['get', 'col'], 'line-width': wScale(surfW, 0.5), 'line-opacity': ['step', ['zoom'], 0, 12.6, 1], 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }));
  // --- feathers: one literal-gradient layer per colour (line-gradient cannot read properties); features carry k and col
  const fadeOp = ['step', ['zoom'], 0, 12.6, 1];
  add(line('fade-casing',
    'fades',
    { 'line-gradient': fadeGrad(H.isNight() ? '#000000' : '#5a5f6a'), 'line-width': surfCASE, 'line-opacity': fadeOp, 'line-opacity-transition': { duration: 0, delay: 0 } },
    { 'line-cap': 'butt' },
    ['==', ['get', 'k'], 'x']));
  add(line('fade-surf-y',
    'fades',
    { 'line-gradient': fadeGrad(mute(YELLOW)), 'line-width': surfW, 'line-opacity': fadeOp, 'line-opacity-transition': { duration: 0, delay: 0 } },
    { 'line-cap': 'butt' },
    ['all', ['==', ['get', 'k'], 'c'], ['==', ['get', 'col'], mute(YELLOW)]]));
  add(line('fade-surf-r',
    'fades',
    { 'line-gradient': fadeGrad(mute(RED)), 'line-width': surfW, 'line-opacity': fadeOp, 'line-opacity-transition': { duration: 0, delay: 0 } },
    { 'line-cap': 'butt' },
    ['all', ['==', ['get', 'k'], 'c'], ['==', ['get', 'col'], mute(RED)]]));
  add(line('fade-band-g', 'fades', { 'line-gradient': fadeGrad(MUGREEN), 'line-width': surfW, 'line-opacity': fadeOp, 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }, ['==', ['get', 'k'], 'b']));
  add(line('fade-fill-g', 'fades', { 'line-gradient': fadeGrad(MUGREEN), 'line-width': wScale(surfW, 0.5), 'line-opacity': fadeOp, 'line-opacity-transition': { duration: 0, delay: 0 } }, { 'line-cap': 'butt' }, ['==', ['get', 'k'], 'f']));
  // --- selection glow: three nested widths in the street's own colour; these layers use round joins, not miter
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
  // --- selection overlay: the base spec redrawn vibrant - identical widths and glow, only the colour pops
  add(line('t1-sel', 'sel', { 'line-color': ['get', 'col'], 'line-width': surfW, 'line-opacity': 1 }, { 'line-cap': 'butt', 'line-join': 'round' }));
  add(line('t1-selband', 'selBand', { 'line-color': ['get', 'col'], 'line-width': surfW, 'line-opacity': 1 }, { 'line-cap': 'butt', 'line-join': 'round' }));
  add(line('sel-core-s', 'selGlow', { 'line-color': ['get', 'colHot'], 'line-width': wScale(surfW, 0.42), 'line-opacity': 0.85 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 0]));
  add(line('sel-core-b', 'selGlow', { 'line-color': ['get', 'colHot'], 'line-width': wScale(surfW, 0.42), 'line-opacity': 0.85 }, { 'line-cap': 'butt', 'line-join': 'round' }, ['==', ['get', 'band'], 1]));
  // the selection's vibrant side fill - same width as the board's t1-fill, geometry from the same builder
  add(line('t1-selfill', 'selFill', { 'line-color': ['get', 'col'], 'line-width': wScale(surfW, 0.5), 'line-opacity': 1 }, { 'line-cap': 'butt' }));
  // the selection's boundary-end feathers, in the vibrant colours
  add(line('selfade-y', 'selFades', { 'line-gradient': fadeGrad(YELLOW), 'line-width': surfW, 'line-opacity': 1 }, { 'line-cap': 'butt' }, ['all', ['==', ['get', 'k'], 'c'], ['==', ['get', 'col'], YELLOW]]));
  add(line('selfade-r', 'selFades', { 'line-gradient': fadeGrad(RED), 'line-width': surfW, 'line-opacity': 1 }, { 'line-cap': 'butt' }, ['all', ['==', ['get', 'k'], 'c'], ['==', ['get', 'col'], RED]]));
  add(line('selfade-g', 'selFades', { 'line-gradient': fadeGrad(GREEN), 'line-width': surfW, 'line-opacity': 1 }, { 'line-cap': 'butt' }, ['==', ['get', 'k'], 'b']));
  add(line('selfade-fill', 'selFades', { 'line-gradient': fadeGrad(GREEN), 'line-width': wScale(surfW, 0.5), 'line-opacity': 1 }, { 'line-cap': 'butt' }, ['==', ['get', 'k'], 'f']));
  // --- hit (every treatment) ---
  add(line('hit', 'hit', { 'line-color': '#fff', 'line-width': 24 * WIDTH_K, 'line-opacity': 0 }));
  // at 12.6 the paint and names pop out, the POI in: no fading (Andrew), never one alone
  add({ id: 'routepoi-ring',
    type: 'circle',
    source: 'routepoi',
    maxzoom: 13.3,
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 7, 13.5, 9], 'circle-color': '#ffffff', 'circle-opacity': ['step', ['zoom'], 1, 12.6, 0], 'circle-opacity-transition': { duration: 0, delay: 0 } } });
  add({ id: 'routepoi-dot',
    type: 'circle',
    source: 'routepoi',
    maxzoom: 13.3,
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4.5, 13.5, 6.5], 'circle-color': '#ef476f', 'circle-opacity': ['step', ['zoom'], 1, 12.6, 0], 'circle-opacity-transition': { duration: 0, delay: 0 } } });
  add({ id: 'routepoi-txt',
    type: 'symbol',
    source: 'routepoi',
    maxzoom: 13.3,
    layout: { 'text-field': (H.activeRoute && H.activeRoute.name) || 'Snow Route', 'text-font': fontStack, 'text-size': 11, 'text-anchor': 'left', 'text-offset': [1.1, 0], 'text-allow-overlap': false },
    paint: { 'text-color': H.isNight() ? '#e8e8e8' : '#333333',
      'text-halo-color': H.isNight() ? 'rgba(0,0,0,.8)' : 'rgba(255,255,255,.9)',
      'text-opacity': ['step', ['zoom'], 1, 12.6, 0],
      'text-opacity-transition': { duration: 0, delay: 0 },
      'text-halo-width': 1.6 } });
  LAYERS.paint.concat(LAYERS.glow).forEach(id => { if (GLM.getLayer(id)) GLM.setLayerZoomRange(id, 12.5, 24); }); // the paint and glow groups are the catalogue's
  H.glUnifyLabels({ m: GLM, stack: { newStack, data: LABELPTS, ids: LAYERS.titles, fontStack } });
  pushSources();
  applyGlow();
  syncTheme();
}
// ---- selection glow (the five style toggle buttons were removed at Andrew's order) ----
/** @type {number|null} */
let pulseTimer = null;
/** @type {{ op:Record<string,number[]>,road:number[] }} */
let glowAnim = { op: {}, road: [0, 0] }; // declared: this was an implicit global (a ReferenceError waiting for strict mode); applyGlow replaces it wholesale
function buildSelGlow() {
  const feats = []; // one glow feature per selected stretch (buildSel's iteration): a multi-select glows all, not just the anchor
  for (const it of currentSelList()) {
    const sg = selectedGeom(it);
    if (!sg || !sg.pts || sg.pts.length < 2) continue; // a stretch fully inside a boundary fade zone has no solid line to glow under
    const c = colOf(it.name, sg.bits);
    feats.push({ type: 'Feature', properties: { col: c, colHot: lighten(c, 0.68), colLit: lighten(c, 0.30), band: sg.bits === 3 ? 1 : 0 }, geometry: { type: 'LineString', coordinates: GJ(sg.pts) } });
  }
  return feats.length ? { type: 'FeatureCollection', features: feats } : EMPTYFC;
}

// ---- glow presets (selection only, no road paint touched): per-layer specs over one fixed stack
const PULSE_RATES = [0.04, 0.07, 0.11, 0.17];   // breathing phase step per 50ms tick: ~7.9s / ~4.5s / ~2.9s / ~1.9s per full cycle
let pulseRate = PULSE_RATES[3];   // RAPID, locked as Andrew's final choice - the Pulse row is removed
/** @type {{road:number[],layers:Record<string,EngineGlowLayer|null>}[]} */
const GLOW = [
  { road: [0.74, 0.26], layers: {   // 0 Bloom - the original look
    'sel-glow1': { p: 17, b: 0, o: 0.10, a: 0.13 }, 'sel-glow2': { p: 9, b: 0, o: 0.16, a: 0.19 }, 'sel-glow3': { p: 4, b: 0, o: 0.24, a: 0.26 },
    'sel-glow4': null, 'sel-glow5': null, 'sel-core': null } },
  { road: [0.62, 0.38], layers: {   // 1 Soft - blurred spill: breathing amplitude raised ~3x (the original swing sat under the visibility floor)
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
      const curve = surfW;   // bands draw at the surface's width, so the '-b' glow variants follow surfW too
      GLM.setPaintProperty(id, 'line-width', L.p !== undefined ? glowW(curve, L.p) : wScale(curve, L.s));
      GLM.setPaintProperty(id, 'line-blur', L.b ? glowB(L.b) : 0);
      if (L.c) GLM.setPaintProperty(id, 'line-color', ['get', L.c]);
      GLM.setPaintProperty(id, 'line-opacity', L.o);
      glowAnim.op[id] = [L.o, L.a];
    });
  });
}
function managePulse() {
  // the selection breathes in the street's own colour: glow stack and vibrant redraw pulse together, lit from within
  const want = currentSelList().length > 0 && !!GLM && !!GLM.getLayer('sel-glow1-s'); // the pulse follows the selection LIST, not the anchor - a selection held only in selSet breathes too
  if (want && !pulseTimer) {
    let ph = 0;
    pulseTimer = setInterval(() => {
      if (!GLM) return;
      if (typeof document !== 'undefined' && document.hidden) return; // no paint churn while the app is not on screen - the phase simply waits and resumes on return
      ph += pulseRate;
      const s = 0.5 + 0.5 * Math.sin(ph);   // 0..1 breathing cycle
      const set = /** @param {string} id @param {number} v */ (id, v) => { if (GLM.getLayer(id)) GLM.setPaintProperty(id, 'line-opacity', v); };
      Object.keys(glowAnim.op).forEach(id => set(id, glowAnim.op[id][0] + glowAnim.op[id][1] * s));
      set('t1-sel', glowAnim.road[0] + glowAnim.road[1] * s); set('t1-selband', glowAnim.road[0] + glowAnim.road[1] * s);
    }, 50);
  } else if (!want && pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
}
  // ---- public API (the app's only handles on the engine) ----
  function stateSig() { return JSON.stringify(H.pieces); }
  /** @param {EngineMap} gl @param {typeof GL_HOST} [host] */
  function init(gl, host) {
    GLM = gl;
    if (host) H = host; // adopt the passed host: the app passes the same GL_HOST it registered before this script evaluated
    sel = H.selStretch ? { name: H.selStretch.name, idx: H.selStretch.idx } : null;
    const sig = stateSig();
    if (!CUR || sig !== lastSig) { rebuildData(); lastSig = sig; }
    else { const SC = buildSelC(); const SF = buildSelFill(); CUR.sel = SC.sel; CUR.selBand = SC.selBand; CUR.selFill = SF.fill; CUR.selFades = fadeFC([...SC.selFades, ...SF.fades]); }
    addStack();           // re-adds sources+layers on the fresh GL map and pushes CUR
  }
  function rebuildRoute() { // a route switch rebuilds the engine's geometry from the host's data and re-points every route source
    buildEngineGeometry();
    SLICE_CACHE.clear(); // the cache dies on every route switch (here, not in buildEngineGeometry: the topo proofs extract it standalone)
    sel = null;
    CUR = null; rebuildData(); lastSig = stateSig();
    if (!GLM) return;
    if (GLM.getSource('hit')) GLM.getSource('hit').setData(HIT);
    if (GLM.getSource('routepoi')) GLM.getSource('routepoi').setData(ROUTEPOI);
    if (GLM.getLayer('routepoi-txt')) { try { GLM.setLayoutProperty('routepoi-txt', 'text-field', (H.activeRoute && H.activeRoute.name) || 'Snow Route'); } catch (e) {} } // the POI wears the route's name - a switch renames it
    H.glUnifyLabels({ m: GLM, routeData: LABELPTS }); // the basemap label pass runs on the new route's map, and rewrites the title source with it
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
    const SF = buildSelFill();
    CUR.sel = SC.sel; CUR.selBand = SC.selBand; CUR.selFill = SF.fill; CUR.selFades = fadeFC([...SC.selFades, ...SF.fades]);
    pushSelSources();
  }
  function active() { return !!GLM; }
  /** @param {string[]} stack */
  function setFont(stack) { if (Array.isArray(stack) && stack.length) { fontStack = stack.slice(); if (GLM) { for (const id of LAYERS.text) { if (GLM.getLayer(id)) { try { GLM.setLayoutProperty(id, 'text-font', fontStack); } catch (e) {} } } } } } // Beta 1.170 (Carbon fix round Phase 2, B-09): layers already on the map take the new stack too - through 1.169 setFont replaced only the variable FUTURE layers are built from, so a basemap restyle (which re-picks the font, then calls sync - not init) left the live label layers rendering the retired stack until the next full rebuild
  function syncTheme() {
    if (!GLM || !GLM.getLayer) return;
    const night = !!(H && H.isNight && H.isNight());
    lastNight = night;
    const casing = night ? '#000000' : '#5a5f6a', txt = night ? '#e8e8e8' : '#333333', halo = night ? 'rgba(0,0,0,.8)' : 'rgba(255,255,255,.9)';
    for (const id of ['t1-casing', 't1-casingb']) { if (GLM.getLayer(id)) { try { GLM.setPaintProperty(id, 'line-color', casing); } catch (e) {} } }
    if (GLM.getLayer('fade-casing')) { try { GLM.setPaintProperty('fade-casing', 'line-gradient', fadeGrad(casing)); } catch (e) {} } // the feather's casing gradient follows the theme with the casings
    for (const id of LAYERS.text) { if (GLM.getLayer(id)) { try { GLM.setPaintProperty(id, 'text-color', txt); GLM.setPaintProperty(id, 'text-halo-color', halo); } catch (e) {} } }
  }
  /** @param {WidthCurve} curve @param {number} z */
  function evalCurvePx(curve, z) { // evaluate a scaleW curve at a zoom, in px (zooms at odd indices, widths at even)
    let prev = null;
    for (let i = 3; i + 1 < curve.length; i += 2) { if (z <= /** @type {number} */ (curve[i])) {
      if (!prev) return /** @type {number} */ (curve[i + 1]);
      return prev[1] + (/** @type {number} */ (curve[i + 1]) - prev[1]) * ((z - prev[0]) / (/** @type {number} */ (curve[i]) - prev[0])); } prev = [/** @type {number} */ (curve[i]), /** @type {number} */ (curve[i + 1])]; }
    return prev[1];
  }
  /** @param {number} z */
  function tapTolPx(z) { return Math.max(24, evalCurvePx(surfCASE, z) / 2 + 2); } // tolerance follows the widest paint at the zoom, floored at 24 px: a tap on paint selects
  return { init, drop, sync, syncSel, syncTheme, active, setFont, rebuildRoute, tapTolPx, layers: LAYERS, mute }; // layers exported for cross-part readers; mute for create-pick's draft renderer (a bare call threw at init)
})();
window.GLP = GLP;