import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Green half-road proof (fix_id: green-half-road, Beta 1.208, 2026-11-15).
//
// RE-BASE (Beta 1.268, WIDTHS round): WIDTH_K 1.5 -> 1.3 narrows the
// paint to 1.20x the basemap road (proof-1268). Every metric
// expectation below is re-pinned to the new geometry: HALF_HALF
// 2.475 -> 2.145 m, SURF_HALF 4.95 -> 4.29 m, the surface (and so
// the junction square and the R2d break) 9.9 -> 8.58 m. The rules
// R1-R4 are unchanged; the 1.206/1.208 narrative below is the record
// at WIDTH_K 1.5.
//
// Andrew's three paint rules from his Beta 1.206 phone screenshots
// (Valeria Boulevard, one side done), plus the label rule R4:
//
//   R1 - a fully-done street's green must draw at the SAME width as
//        the not-done surface. Shipped 1.206 drew the completed band
//        on its own wider curve (BANDW, ~14.4 m vs the surface's
//        9.9 m). The band layers now use surfW itself, and the band's
//        casing uses the surface's casing curve (surfCASE).
//   R2 - a one-side-done street's green must fill exactly that side's
//        half of the road (centreline to kerb) at every zoom. Shipped
//        1.206 drew a fixed-pixel line on the kerb offset (t1-edge,
//        4.5 px at every zoom): half the road zoomed out, a thin kerb
//        outline zoomed in (measured: 9 device px at z17, z18 AND
//        z19). The fix builds a FILL family on half-offset lines
//        (+/-2.145 m) drawn at half the surface width (surfW x 0.5).
//   R3 - selecting a stretch must not break its green. The shipped
//        selection rebuilt the stretch's side line from that piece
//        alone (buildSel('e')), so it re-clipped the junction ends
//        the board line runs through - measured on Valeria stretch
//        10: the board's Romeo Crescent corner vertex sits 5.70 m
//        off the selection's line. The selection's side paint is now
//        built by the same fillSlicePts helper as the board's, so it
//        is a contiguous sub-path of the board strand by construction.
//   R4 - street-name labels. The 1.208 form of this rule (the app's
//        own titles at every zoom, the basemap clones retired) is
//        SUPERSEDED by Beta 1.258 (Andrew's decision, 2026-11-20):
//        the app's titles carried the variable-anchor placement
//        defect and are retired outright; the basemap's own road
//        labels are now the street-name system for every route, and
//        their repeats along a long street are the map's own
//        behaviour, accepted knowingly. R4 now pins the retirement's
//        shape (the full pins live in proof-1258; drive130 grades
//        the rendered rule).
//
// This proof drives the shipped engine (GLP, loaded verbatim from
// parts/engine.js) over the mergeStrands proof's synthetic network,
// with layer specs captured from a mock map, and reads parts/app2.js
// and parts/engine.js for R4's rule.
//
// On unmodified main (Beta 1.206) checks R1, R2, R3 and R4 FAIL (the
// band has its own wider curve; there is no fills source and no
// selFill; the titles end at 16.4 and the clones exist); with the
// fix all checks pass.
//
// Run from the repo root:  node tests/proof/proof-green-half-road.mjs

const eng = readFileSync('parts/engine.js', 'utf8');
const app2 = readFileSync('parts/app2.js', 'utf8');

const MLAT = 111132, MLNG = 82000;
const LAT0 = 43.8, LNG0 = -79.5;
const pt = (xM, yM) => [LAT0 + yM / MLAT, LNG0 + xM / MLNG];
const seg = (x0, y0, x1, y1) => {
  const pts = [];
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 20));
  for (let k = 0; k <= n; k++) pts.push(pt(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n));
  return pts;
};

const STRETCH = {
  LongAve: { runs: [{ parts: [seg(-120, 0, 0, 0), seg(0, 0, 60, 0), seg(60, 0, 120, 0)] }] },
  NorthAve: { runs: [{ parts: [seg(-120, 60, 0, 60), seg(0, 60, 60, 60), seg(60, 60, 120, 60)] }] },
  CrossSt: { runs: [{ parts: [seg(0, -60, 0, 0), seg(0, 0, 0, 60), seg(0, 60, 0, 120)] }] },
  DiagSt: { runs: [{ parts: [seg(0, -60, 60, 0), seg(60, 0, 120, 60)] }] },
};
const names = Object.keys(STRETCH);
const host = {
  PRIMARIES: new Set(),
  MLAT, MLNG,
  jDistM: (a, b) => Math.hypot((b[1] - a[1]) * MLNG, (b[0] - a[0]) * MLAT),
  ptSegM(p, a, b) {
    const px = p[1] * MLNG, py = p[0] * MLAT;
    const ax = a[1] * MLNG, ay = a[0] * MLAT;
    const bx = b[1] * MLNG, by = b[0] * MLAT;
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2));
    return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
  },
  names, STRETCH,
  ROADS: Object.fromEntries(names.map(n => [n, STRETCH[n].runs.flatMap(r => r.parts)])),
  SPOT: {},
  pieces: { LongAve: [1, 1, 1], NorthAve: [0, 0, 0], CrossSt: [0, 0, 0], DiagSt: [0, 0] },
  selStretch: null, selSet: [], isNight: () => false,
  activeRoute: { name: 'Proof' }, glUnifyLabels: () => {},
};

const sources = {}, layers = [];
const mockGLM = {
  getStyle: () => ({ layers }),
  getSource: id => sources[id],
  addSource: (id, spec) => { sources[id] = { data: spec.data, setData(d) { this.data = d; } }; },
  getLayer: id => layers.find(l => l.id === id),
  addLayer: l => { layers.push(l); },
  setLayerZoomRange: () => {}, setLayoutProperty: () => {}, setPaintProperty: () => {},
};

const ctx = { GL_HOST: host, window: {}, setInterval: () => 1, clearInterval: () => {} };
vm.runInNewContext(eng, ctx);
const { GLP } = ctx.window;
GLP.init(mockGLM, host);

let failed = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`PASS: ${label}`);
  else { failed++; console.log(`FAIL: ${label}${detail ? ' — ' + detail : ''}`); }
}
const layerW = id => { const L = layers.find(l => l.id === id); return L ? L.paint['line-width'] : null; };
const stopsOf = spec => { const o = {}; for (let i = 3; i + 1 < spec.length; i += 2) o[spec[i]] = spec[i + 1]; return o; };
const evalSpec = (spec, z) => {
  const pts = []; for (let i = 3; i + 1 < spec.length; i += 2) pts.push([spec[i], spec[i + 1]]);
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 0; i + 1 < pts.length; i++) { const [z0, w0] = pts[i], [z1, w1] = pts[i + 1]; if (z <= z1) return w0 + (w1 - w0) * ((z - z0) / (z1 - z0)); }
  return pts[pts.length - 1][1];
};
const strandsM = fc => fc.features.map(f => f.geometry.coordinates.map(c => [(c[0] - LNG0) * MLNG, (c[1] - LAT0) * MLAT]));

// ---- R1: the fully-done green draws at the surface's own width.
check('R1: t1-band line-width IS the t1-surface curve (same stops)',
  JSON.stringify(layerW('t1-band')) === JSON.stringify(layerW('t1-surface')),
  'band=' + JSON.stringify(layerW('t1-band')) + ' surface=' + JSON.stringify(layerW('t1-surface')));
check('R1: t1-casingb line-width IS the t1-casing curve (one casing for both)',
  JSON.stringify(layerW('t1-casingb')) === JSON.stringify(layerW('t1-casing')),
  'casingb=' + JSON.stringify(layerW('t1-casingb')) + ' casing=' + JSON.stringify(layerW('t1-casing')));
check('R1: the retired wider-band constants are gone (no BANDW / BANDCASE declarations, no BAND_HALF in code)',
  !eng.includes('const BANDW') && !eng.includes('const BANDCASE') && !/BAND_HALF\s*[,);]/.test(eng)
  && !eng.includes("'line-width': BANDW") && !eng.includes("'line-width': BANDCASE"));

// ---- R2: the one-side fill is half the road, on the half-offset line.
check('R2: t1-fill line-width is exactly half the surface curve at every stop',
  (() => { const f = stopsOf(layerW('t1-fill') || []), s = stopsOf(layerW('t1-surface') || []); const ks = Object.keys(s); return ks.length > 0 && ks.every(z => Math.abs((f[z] || NaN) - s[z] / 2) < 1e-9); })(),
  'fill=' + JSON.stringify(layerW('t1-fill')));
check('R2: the old fixed-pixel kerb line layer is gone (no t1-edge)',
  !layers.some(l => l.id === 't1-edge'));
const fills = sources.fills ? strandsM(sources.fills.data) : [];
check('R2: a fills source exists and LongAve side 0 (all 3 pieces marked) paints as ONE strand through the CrossSt junction',
  fills.length === 1 && fills[0].some(p => p[0] < -60) && fills[0].some(p => p[0] > 60),
  'strands=' + fills.length);
check('R2: every fill point rides the half-offset line (2.145 m off the centreline, +/-0.45 m)',
  fills.length === 1 && fills[0].every(p => Math.abs(p[1] - 2.145) <= 0.45),
  fills.length ? 'y range ' + Math.min(...fills[0].map(p => p[1])).toFixed(2) + '..' + Math.max(...fills[0].map(p => p[1])).toFixed(2) : 'no fills');

// ---- R2b: a fill that STOPS at a junction keeps its offset to the
// very end (Codex P2 on PR #83: the generic end clip solves along the
// centreline, so a terminating fill's last vertices sat 0.613 m from
// the centreline instead of 2.145 m — green spilling onto the
// unfinished side). LongAve [1, 0, 0]: the fill ends at the CrossSt
// junction; its end must sit ON the half-offset line, flush at the
// crossing street's near paint edge (x ~= -4.29).
host.pieces.LongAve = [1, 0, 0];
GLP.sync();
const fillsT = sources.fills ? strandsM(sources.fills.data) : [];
check('R2b: a terminating fill exists (LongAve piece 0 only)', fillsT.length === 1, 'strands=' + fillsT.length);
check('R2b: every point of the terminating fill — including its last vertices — rides the half-offset line (2.145 m, +/-0.45 m)',
  fillsT.length === 1 && fillsT[0].every(p => Math.abs(p[1] - 2.145) <= 0.45),
  fillsT.length ? 'last two points: ' + JSON.stringify(fillsT[0].slice(-2).map(p => [ +p[0].toFixed(2), +p[1].toFixed(2) ])) : 'no fills');
check('R2b: the terminating fill ends flush at the crossing street\u2019s near paint edge (end x within [-6.5, -3.5], not cut far back, not overshooting)',
  fillsT.length === 1 && (() => { const e = fillsT[0][fillsT[0].length - 1]; return e[0] >= -6.5 && e[0] <= -3.5; })(),
  fillsT.length ? 'end=' + JSON.stringify(fillsT[0][fillsT[0].length - 1].map(v => +v.toFixed(2))) : 'no fills');
host.pieces.LongAve = [1, 1, 1];
GLP.sync();

// ---- R2c: corner connections (Codex P2 on PR #83's second head).
// Where one street's marked side turns a corner into another street's
// marked side, the two fills used to stop at the crossing street's
// near paint edge with the junction square between them - the green
// pinched instead of wrapping the corner (the retired kerb-line paint
// traced the kerb around corners; the fills had no corner treatment).
// LongAve [2,0,0] (south fill, west arm) + CrossSt [0,2,0] (east
// fill, north arm): a connector strand must join them through the
// half-lines' corner point (2.145, -2.145).
host.pieces.LongAve = [2, 0, 0];
host.pieces.CrossSt = [0, 2, 0];
GLP.sync();
const fillsC = sources.fills ? strandsM(sources.fills.data) : [];
const nearPt = (s, x, y, tol) => s.some(p => Math.hypot(p[0] - x, p[1] - y) <= tol);
const conn = fillsC.find(s => s.length >= 3 && nearPt(s, 2.145, -2.145, 1.6));
check('R2c: a corner connector joins the two streets\u2019 fills through the half-corner point (2.145, -2.145)',
  !!conn && fillsC.length === 3, 'strands=' + fillsC.length + ' ends=' + JSON.stringify(fillsC.map(s => [s[0].map(v => +v.toFixed(1)), s[s.length - 1].map(v => +v.toFixed(1))]))); 
check('R2c: the connector\u2019s ends are the two fills\u2019 own ends (no new endpoints invented)',
  !!conn && nearPt([conn[0]], -4.29, -2.145, 0.35) && nearPt([conn[conn.length - 1]], 2.145, 4.29, 0.35),
  conn ? 'conn ends=' + JSON.stringify([conn[0].map(v => +v.toFixed(2)), conn[conn.length - 1].map(v => +v.toFixed(2))]) : 'no connector');
host.pieces.CrossSt = [0, 0, 0];
GLP.sync();
const fillsC1 = sources.fills ? strandsM(sources.fills.data) : [];
check('R2c: no connector when the corner\u2019s other side is unmarked (a lone fill still ends at the near edge)',
  fillsC1.length === 1, 'strands=' + fillsC1.length);
host.pieces.LongAve = [1, 1, 1];
GLP.sync();

// ---- R2d: fill <-> band continuity (Codex P2, gate round 3). A
// one-side piece flowing into a both-sides piece is ONE completed
// side: treating 3 as a different fill family clipped the fill at
// the boundary while the band clipped at its own side, leaving the
// junction square's half - 9.9 m - unpainted. The green strands must
// MEET at the boundary vertex, in both directions.
const stripEnds = () => {
  const fills = strandsM(sources.fills.data).filter(s => s.filter(p => Math.abs(p[1] - 2.145) <= 0.5).length >= s.length * 0.7);
  const bands = strandsM(sources.bands.data);
  return { fillE: fills.length ? Math.max(...fills.map(s => Math.max(...s.map(p => p[0])))) : null,
           fillW: fills.length ? Math.min(...fills.map(s => Math.min(...s.map(p => p[0])))) : null,
           bandE: bands.length ? Math.max(...bands.map(s => Math.max(...s.map(p => p[0])))) : null,
           bandW: bands.length ? Math.min(...bands.map(s => Math.min(...s.map(p => p[0])))) : null };
};
host.pieces.LongAve = [1, 3, 3];
GLP.sync();
let se = stripEnds();
check('R2d: fill flowing into a band meets it at the boundary (no 8.58 m break in the completed side)',
  se.fillE !== null && se.bandW !== null && se.fillE >= se.bandW - 0.3,
  'fillE=' + se.fillE + ' bandW=' + se.bandW);
host.pieces.LongAve = [3, 1, 0];
GLP.sync();
se = stripEnds();
check('R2d: band flowing into a fill meets it at the boundary (the reverse transition)',
  se.bandE !== null && se.fillW !== null && se.bandE >= se.fillW - 0.3,
  'bandE=' + se.bandE + ' fillW=' + se.fillW);
host.pieces.LongAve = [1, 1, 1];
GLP.sync();

// ---- R2e: oblique junction caps (Codex P2, gate round 3). At a 45
// degree crossing (DiagSt crosses LongAve at x=60), a terminating
// fill's cap must sit flush on the crossing street's near paint
// edge: the end point ON the half-offset line AND on the edge line
// (4.29 m from the diagonal's centreline), the approach running
// normal to the diagonal. Projecting the solved end onto the line
// (the gate-round-2 construction) put the cap's centre at ~6.7 m
// from the diagonal's centreline - a ~3 m wedge.
host.pieces.LongAve = [0, 1, 0];
GLP.sync();
const fillsO = strandsM(sources.fills.data);
const oStrand = fillsO.find(s => s.some(p => p[0] > 30));
const oEi = oStrand ? oStrand.reduce((bi, p, i) => (p[0] > oStrand[bi][0] ? i : bi), 0) : -1;
const oEnd = oStrand ? oStrand[oEi] : null;   // east end, at the DiagSt junction
const oPrev = oStrand ? oStrand[oEi > 0 ? oEi - 1 : oEi + 1] : null;
const dDiag = p => Math.abs((p[0] - 60) - p[1]) / Math.SQRT2;   // distance to DiagSt's centreline (the y=x line through (60,0))
check('R2e: the oblique fill end sits ON the crossing paint edge (4.29 m from the diagonal centreline, +/-0.5) and ON its half line (2.145, +/-0.45)',
  !!oEnd && Math.abs(dDiag(oEnd) - 4.29) <= 0.5 && Math.abs(oEnd[1] - 2.145) <= 0.45,
  oEnd ? 'end=(' + oEnd.map(v => +v.toFixed(2)) + ') dDiag=' + dDiag(oEnd).toFixed(2) : 'no strand');
check('R2e: the oblique approach runs normal to the diagonal (edge-normal approach preserved)',
  !!oEnd && !!oPrev && (() => { const vx = oPrev[0] - oEnd[0], vy = oPrev[1] - oEnd[1], L = Math.hypot(vx, vy) || 1; return Math.abs((vx / L + vy / L) / Math.SQRT2) <= 0.25; })(),
  oPrev ? 'prev=(' + oPrev.map(v => +v.toFixed(2)) + ')' : 'no prev');
host.pieces.LongAve = [1, 1, 1];
GLP.sync();

// ---- R3: the selection's side paint is the board's own geometry.
host.selStretch = { name: 'LongAve', idx: 1 };
host.selSet = [host.selStretch];
GLP.syncSel();
const selFill = sources.selFill ? strandsM(sources.selFill.data) : [];
check('R3: selecting a stretch produces selFill paint (not a rebuilt edge line)',
  selFill.length === 1, 'selFill strands=' + selFill.length + ', selEdges source=' + (sources.selEdges ? 'present' : 'absent'));
check('R3: the selection strand is a contiguous sub-path of the board fill strand (same points, same order)',
  (() => {
    if (!selFill.length || !fills.length) return false;
    const key = p => p[0].toFixed(6) + ',' + p[1].toFixed(6);
    const board = fills[0].map(key), sel = selFill[0].map(key);
    const i0 = board.indexOf(sel[0]);
    return i0 >= 0 && board.slice(i0, i0 + sel.length).join('|') === sel.join('|');
  })());

// ---- Tap tolerance follows the widest paint, which is now the surface casing.
for (const z of [18, 19]) {
  const want = Math.max(24, evalSpec(layerW('t1-casing'), z) / 2 + 2);
  check(`tap tolerance at z${z} == surface-casing half + 2 (not the retired band casing)`,
    Math.abs(GLP.tapTolPx(z) - want) <= 0.6, 'got ' + GLP.tapTolPx(z).toFixed(2) + ', want ' + want.toFixed(2));
}
check('tap tolerance keeps the 24 px floor at z17 and below',
  [14, 15, 16, 17].every(z => GLP.tapTolPx(z) === 24), [14, 15, 16, 17].map(z => GLP.tapTolPx(z)).join(','));

// ---- R3b (gate round 4, Codex P2): the corner connector rides the
// selection redraw. LongAve [2, 0, 0] + CrossSt [0, 2, 0] is the R2c
// corner: the board's fills wrap it with a connector through
// (2.145, -2.145) to CrossSt's fill end (2.145, 4.29). Selecting
// LongAve piece 0 must redraw that connector in selFill, or the
// selected surface covers its first arm and the green breaks while
// the stretch is selected.
host.pieces.LongAve = [2, 0, 0];
host.pieces.CrossSt = [0, 2, 0];
host.selStretch = { name: 'LongAve', idx: 0 };
host.selSet = [host.selStretch];
GLP.sync();
GLP.syncSel();
const selFillC = sources.selFill ? strandsM(sources.selFill.data) : [];
const nearPtC = (s, x, y) => s.some(p => Math.hypot(p[0] - x, p[1] - y) <= 0.6);
check('R3b: selecting a corner piece redraws its corner connector (through the corner point to the other street\'s fill end)',
  selFillC.some(s => nearPtC(s, 2.145, -2.145) && nearPtC(s, 2.145, 4.29)),
  'selFill strands=' + selFillC.length);
host.pieces.LongAve = [1, 1, 1];
host.pieces.CrossSt = [0, 0, 0];
host.selStretch = null; host.selSet = [];
GLP.sync();

// ---- R3c (gate round 4, Codex P2): only TRUE corner connectors ride
// the selection redraw. Two consecutive pieces carrying the same side
// merge into ONE ordinary fill strand with two mem entries - the
// first build of the R3b fix mistook that strand for a connector and
// redrew it whole, painting the UNSELECTED piece in selection green
// (to x ~= 55.47 in this network). Selecting piece 0 of LongAve
// [1, 1, 0] must paint piece 0's side and nothing past the boundary.
host.pieces.LongAve = [1, 1, 0];
host.selStretch = { name: 'LongAve', idx: 0 };
host.selSet = [host.selStretch];
GLP.sync();
GLP.syncSel();
const selFillM = sources.selFill ? strandsM(sources.selFill.data) : [];
const maxX = selFillM.length ? Math.max(...selFillM.flat().map(p => p[0])) : -Infinity;
const minX = selFillM.length ? Math.min(...selFillM.flat().map(p => p[0])) : Infinity;
check('R3c: selecting one of two same-side pieces paints only that piece (no strand past the boundary)',
  selFillM.length >= 1 && maxX <= 1 && minX < -30,
  'strands=' + selFillM.length + ' x range ' + (isFinite(minX) ? minX.toFixed(1) : '?') + '..' + (isFinite(maxX) ? maxX.toFixed(1) : '?'));
host.pieces.LongAve = [1, 1, 1];
host.selStretch = null; host.selSet = [];
GLP.sync();

// ---- R4: the street-name system is the basemap's own (Beta 1.258,
// Andrew's decision, 2026-11-20). The 1.208 form pinned the app's own
// titles at every zoom; the titles are retired now (their placement
// defect is the reason - see proof-1258's header), the route-name
// exclusion is undone, and the basemap clones stay retired.
// Beta 1.259 premise updates (Andrew's decisions of 2026-11-20, which
// postdate and supersede the two pins below): (1) repetition R1 - the
// old pin ("the measured-dead symbol-spacing cure is not shipped")
// guarded a spacing experiment tried as a cure for the APP titles'
// placement defect; Andrew has since ordered symbol-spacing 500 on the
// basemap's own road-label layers for the whole map, so the pin flips:
// exactly ONE symbol-spacing write exists in app2.js, the owned R1 line
// (proof-1259 pins its value and placement). (2) The route-name
// priority lane (roads_labels_minor-priority) is not a basemap clone -
// it is fed by the route's own geometry, not the tiles - and the
// blanket clone removal the old pin asserted is superseded by the
// lane's stale-source guard (the same update proof-1258's check 13
// recorded): the retired tile-fed clones ('-route' ids) are still never
// built, and a leftover lane of any other shape is still removed.
// Beta 1.261 premise update (Andrew's label-mix decision, 2026-11-20,
// which postdates and supersedes the 1.258/1.259 forms of all four pins
// below): the app titles are RESTORED below zoom 15 (capped there), the
// priority lane is DELETED whole, and the basemap major layer is split
// at 15 - the original owns 15-and-up with its stock filter and a
// '-pre15' copy cloned from the live normalized layer carries the
// route-name exclusion across 11-15. The pins flip to that state: the
// R1 write stays the one owned spacing write; the '-route' tile-fed
// clones stay retired and the lane stays absent; the '-pre15' copy is
// the one sanctioned clone; the engine builds the title layers again;
// the exclusion is back, on the pre-15 band only. proof-1261 pins the
// mix's full shape including the seam; drive214 grades it rendered.
// Beta 1.263 premise update (Andrew's naming-revert decision,
// 2026-11-21, which supersedes the 1.261 form): the mix is reverted to
// the pre-1.258 system - the titles are restored WITHOUT the cap, the
// '-pre15' band is deleted whole, the exclusion sits on the two
// originals at EVERY zoom, and the '-route' clone-removal loop is back
// at the top of the pass. The pins flip to that state: the R1 write is
// still the one owned spacing write (now inside the restored exclusion
// branch - the revert's one named exception); no clone of any label
// layer is sanctioned; the engine builds the title layers; the
// exclusion is back on the originals. proof-1263 pins the reverted
// shape; drive214's reworked M sections and drive216 grade it rendered.
check('R4: the owned R1 symbol-spacing write appears exactly once in app2.js (Beta 1.263 premise update: the write now sits inside the restored exclusion branch - the revert\'s one named exception)',
  app2.split("setL(L.id, 'symbol-spacing', 500);").length - 1 === 1);
check('R4: no label clone is sanctioned - the tile-fed clones stay retired (their removal loop is back), the 1.259 lane stays deleted, and the 1.261 -pre15 band is deleted whole (Beta 1.263 premise update)',
  app2.includes("const cloneId = baseId + '-route';") && !app2.includes('roads_labels_minor-priority') && !app2.includes("'route-labels'") && !app2.includes('-pre15'));
check('R4: the engine builds the title layers and the labelpts source again, uncapped (Beta 1.263 premise update: the 1.258 retirement is reversed at every zoom)',
  // issue #179: both build pins are scoped to the stack build - the rebuild
  // (rePlaceTitles) repeats them and must not carry this check.
  eng.slice(eng.indexOf('function addStack()'), eng.indexOf('function rePlaceTitles()')).includes("addSource('labelpts'") &&
  eng.slice(eng.indexOf('function addStack()'), eng.indexOf('function rePlaceTitles()')).includes("'streetnamespt' + t") && !eng.includes('maxzoom: 15'));
check('R4: app2 carries the route-name exclusion again, on the two originals at every zoom (Beta 1.263 premise update; Beta 1.265 premise update: the literal is built once as exclF and applied under the create-mode condition - outside create mode the computed filter is unchanged)',
  // issue #179: the exclusion pin is sharpened to the definition - the bare
  // name also matches its read inside the label pass.
  app2.includes('const ROUTE_TILE_NAMES =') && app2.includes("const exclF = ['!', ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]]];") && app2.includes("['all', baseF, exclF]"));

// ---- R5 (same round): both SECONDARY pills wear the dark ink
// (Andrew's pick C from the three-variant sample) — the 1.207 white
// text on the raspberry is gone from both stages' rules.
const head = readFileSync('parts/head.html', 'utf8');
check('R5: the review-stage SECONDARY chip (.crChip.sec) wears true black ink #000000 (1.209S: Beta 1.209 superseded the 1.208 #4a3200 ink — Andrew picked true black)',
  head.includes('.crChip.sec { background: #ef476f; color: #000000; }'));
check('R5: the pick-stage SECONDARY chip (.crPChip.sec) wears true black ink #000000 (1.209S: Beta 1.209 superseded the 1.208 #4a3200 ink — Andrew picked true black)',
  head.includes('.crPChip.sec { background: #ef476f; color: #000000; }'));
check('R5: no .sec rule keeps the retired white text',
  !head.includes('.crChip.sec { background: #ef476f; color: #fff; }') && !head.includes('.crPChip.sec { background: #ef476f; color: #fff; }'));
check('R5: the PRIMARY pills wear the same true black on gold',
  head.includes('.crChip.primary { background: #ffc233; color: #000000; }') && head.includes('.crPChip.primary { background: #ffc233; color: #000000; }'));

// ---- R6 (same round): "Tap a road to adjust sectors" stands on its own line in
// the panel rows — the subtitle keeps only the length line.
const pick = readFileSync('parts/create-pick.js', 'utf8');
check('R6: the row hint is its own element with the exact wording',
  pick.includes("hint.textContent = 'Tap a road to adjust sectors'"));
check('R6: no subtitle still rides the length line after an em dash',
  !pick.includes('— tap row to adjust'));
check('R6: the whole-road subtitle is the length line only',
  pick.includes("sub.textContent = 'Entire road · ' + fmtLenM(g[n] ? g[n].total : 0);"));

// ---- R7 (same round): the sector-trim street glows on the create
// map — a dedicated glow source + halo layers, synced from the draft
// render and the sector close, mirroring the main map's sel-glow.
check('R7: the create glow writer exists and reads the sector session',
  // issue #179: the session read is scoped to the writer - crSectorTap reads
  // the same line and must not carry this pin.
  pick.includes('function syncCrGlow()') &&
  pick.slice(pick.indexOf('function syncCrGlow()'), pick.indexOf('function renderDraft()')).includes('const name = crSectorSession.street;'));
// Beta 1.211 re-derivation (TEST, deliberate scope replacement): R7's
// five-layer blur stack was replaced by Andrew's approved shader glow -
// ONE custom layer fed by the same writer. The invariant that survives:
// the writer feeds exactly one glow sink, the shader layer, and no blur
// stack remains in the create flow (mesh/shader pins live in
// proof-shader-glow-round.mjs).
check('R7: the glow is one custom shader layer fed by the writer, blur stack gone',
  // issue #179: the feed call is scoped to the writer - its own declaration
  // line contains the same text and must not carry this pin.
  pick.includes("id: 'crGlowShader', type: 'custom'") &&
  pick.slice(pick.indexOf('function syncCrGlow()'), pick.indexOf('function renderDraft()')).includes('crGlowSetFeatures(feats)') && !pick.includes('crGlow4') && !pick.includes("paint['line-blur'] = s[3]"));
// Beta 1.223 re-derivation (TEST, same invariant): the sector close still puts
// the glow out explicitly (syncCrGlow stands in crCloseSectors), and since the
// Codex P2 fix on PR #100 the close ALSO re-renders the draft between the reset
// and the glow sync - the 1.223 active flags live in the source features, so
// the close must rebuild them or the street stays vibrant.
check('R7: the draft render syncs the glow, and the sector close puts it out explicitly',
  pick.includes('syncCrGlow(); // Beta 1.208: the trim glow tracks the draft') && pick.includes('crSectorReset(); renderDraft(); syncCrGlow();'));

console.log(failed === 0 ? 'ALL CHECKS PASS' : failed + ' CHECK(S) FAILED');
process.exit(failed === 0 ? 0 : 1);
