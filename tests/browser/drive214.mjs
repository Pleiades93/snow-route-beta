import { launchDrive, finish, bootThrough, forceRouteTitlesOn } from './harness.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, shot, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);
await forceRouteTitlesOn(ev, poll); // Beta 1.293: this drive grades the titles - force the source switch on
if (!await poll(`!!(window.map && map.getSource && map.getSource('centres'))`, 45000)) throw new Error('drive214: the GL stack never landed - sections C-E would measure an empty map and pass vacuously'); // bootThrough lands the route; the GL stack (sources/layers) lands after - sections C-E read sources and must not race it

// drive214: Beta 1.259 - the road-end feather (Andrew's FINAL decision,
// 2026-11-20, option C; flush sampled twice and rejected). Where route
// paint ends at a boundary while the street continues, the paint ends AT
// the join (the boundary street's first centreline) with a smooth
// gradient fade over the last 15 m, gone exactly at the join. One rule
// for every boundary end and any future route; junctions untouched; dead
// ends keep their natural end.
// The fixture is the road-ends census (work dir road-ends-2026-11-20,
// ends.json): 68 free ends, exactly 7 boundary ends - Valeria NE (join
// 12.1 m back from the stored end, Weston), Astona E (12.6 m back,
// Weston), and Valeria S / Greenpark E / Woolacott N / Velmar N / Velmar
// W with the join AT the end. Topper E is a dead end (its street stops
// 38.4 m short of Weston) and must NOT be treated.
// RE-PINNED at Beta 1.267 (the CREATE round; Andrew DECIDED 2026-11-21,
// Option 1): dead ends feather too, at 10 m with the join AT the end -
// the shipped pack now carries 15 ends records (the 7 boundary at fade
// 15 plus the 8 proven dead ends at fade 10) and Topper E IS treated,
// as a dead end. B1/C3/C6 grade the new state; the boundary-class checks
// (A1/A2/B2/C4/C5/C7) are unchanged in shape - computeBoundaryEnds still
// derives exactly the 7 boundary records and leaves dead ends to its
// sibling computeDeadEnds.
// Both-ways: on the 1.258 tree every section fails - there is no
// computeBoundaryEnds, no ends field, no fades source, and the rendered
// stub past the Valeria join is solid gold (section E).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

// The Vaughan extract subset (streets touching the route's grown box),
// for the in-page derivation in section A.
const VAUGHAN = JSON.parse(fs.readFileSync(new URL('../../packs/vaughan.json', import.meta.url), 'utf8'));
const BOX = { w: -79.578, s: 43.800, e: -79.545, n: 43.830 };
const EXTRACT = {};
for (const [nm, ways] of Object.entries(VAUGHAN.streets)) {
  if (ways.some(w => w.some(p => p[0] >= BOX.s && p[0] <= BOX.n && p[1] >= BOX.w && p[1] <= BOX.e))) EXTRACT[nm] = ways;
}
await ev(`(() => { window.__EXTRACT214 = ${JSON.stringify(EXTRACT)}; return true; })()`);

const distM = (a, b) => { const R = 6371000, t = Math.PI / 180; const dLa = (b[0] - a[0]) * t, dLo = (b[1] - a[1]) * t; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }; // Node-side haversine for the fixture comparisons (the page has its own distM)
const FIX = [ // [street, end point, metres from the end back to the join]
  ['Valeria', [43.815217, -79.553531], 12.1],
  ['Valeria', [43.806726, -79.557991], 0.0],
  ['Greenpark', [43.811395, -79.552793], 0.0],
  ['Astona', [43.820939, -79.554901], 12.6],
  ['Woolacott', [43.821824, -79.561614], 0.0],
  ['Velmar', [43.822621, -79.557839], 0.0],
  ['Velmar', [43.820752, -79.566990], 0.0],
];
const DEAD = [ // Beta 1.267: [street, end point] - the 8 proven dead ends (join AT the end, fade 10)
  ['Dianawood', [43.806147, -79.563949]],
  ['Julian', [43.809475, -79.564965]],
  ['Bayside', [43.818042, -79.564521]],
  ['Tina', [43.812494, -79.564038]],
  ['Topper', [43.822043, -79.555735]],
  ['Boddy', [43.815833, -79.564884]],
  ['Angie', [43.815174, -79.556854]],
  ['Ferrari', [43.80881, -79.560576]],
];
const TOPPER_E = [43.822043, -79.555735];
const ASTONA_W = [43.8206723, -79.5572012]; // a route junction (Astona meets Velmar)

// ---------- A: the derivation itself, in-page over the real extract ----------
const A = await J(`(() => {
  if (typeof computeBoundaryEnds !== 'function') return { missing: true };
  return { ends: computeBoundaryEnds(ROADS, window.__EXTRACT214) };
})()`);
const matchRec = (recs, name, pt, behind) => {
  const list = (recs && recs[name]) || [];
  return list.some(r => distM([r[0], r[1]], pt) <= 1.5 && Math.abs(distM([r[0], r[1]], [r[2], r[3]]) - behind) <= 0.8);
};
const countRecs = recs => recs ? Object.values(recs).reduce((a, l) => a + l.length, 0) : 0;
ok('A1 computeBoundaryEnds derives exactly the census fixture from the Vaughan extract: 7 records, each at its census end with its census join distance | ' + JSON.stringify(A).slice(0, 400),
  !A.missing && !A.__err && countRecs(A.ends) === 7 && FIX.every(([n, pt, b]) => matchRec(A.ends, n, pt, b)));
ok('A2 the derivation leaves dead ends and route junctions alone: no record at Topper E (dead end) and none at Astona W (route junction) | ' + JSON.stringify(A).slice(0, 200),
  !A.missing && !A.__err && !Object.values(A.ends || {}).flat().some(r => distM([r[0], r[1]], TOPPER_E) <= 3 || distM([r[0], r[1]], ASTONA_W) <= 3));

// ---------- B: the shipped pack carries the records; geometry attaches them ----------
const B = await J(`(() => {
  const pack = ROUTE_PACKS.find(p => p.id === '5w');
  const attached = {};
  for (const [n, s] of Object.entries(STRETCH)) if (s.ends) attached[n] = s.ends;
  return { packEnds: pack ? (pack.ends || null) : null, attached };
})()`);
ok('B1 the shipped Route 5W pack carries the ends field with 15 records (the 7 boundary plus the 8 dead ends since Beta 1.267) | ' + JSON.stringify(B.packEnds).slice(0, 300),
  countRecs(B.packEnds) === 15 && FIX.every(([n, pt, b]) => matchRec(B.packEnds, n, pt, b)) && DEAD.every(([n, pt]) => matchRec(B.packEnds, n, pt, 0)));
ok('B2 buildGeometry attaches the records to STRETCH (the engine\'s input): every fixture street carries its ends | attached: ' + Object.keys(B.attached || {}).join(','),
  [...new Set([...FIX, ...DEAD.map(([n, pt]) => [n, pt, 0])].map(p => p[0]))].every(n => { const f = [...FIX, ...DEAD.map(([n2, pt]) => [n2, pt, 0])].find(p => p[0] === n); return (B.attached || {})[n] && matchRec({ [n]: B.attached[n] }, n, f[1], f[2]); }));

// ---------- C: the fade sources, layers and geometry ----------
const C = await J(`(() => {
  const style = map.getStyle();
  const layerIds = style.layers.map(l => l.id);
  const srcSpec = id => style.sources[id] || null;
  const data = id => { const s = map.getSource(id); return (s && s._data && s._data.features) || []; };
  const feats = { fades: data('fades'), centres: data('centres'), bands: data('bands'), fills: data('fills') };
  // oriented run line for a street end: the run whose endpoint matches, flipped so the end is LAST
  const oriented = (name, pt) => {
    for (const run of STRETCH[name].runs) {
      const L = run.line;
      if (distM(L[L.length - 1], pt) <= 1.5) return { line: L, cum: run.cum, total: run.total };
      if (distM(L[0], pt) <= 1.5) { const rev = [...L].reverse(); const cum = [0]; for (let i = 1; i < rev.length; i++) cum.push(cum[i - 1] + distM(rev[i - 1], rev[i])); return { line: rev, cum, total: cum[cum.length - 1] }; }
    }
    return null;
  };
  const ll = c => [c[1], c[0]]; // GeoJSON -> [lat,lng]
  const featLen = f => { const cs = f.geometry.coordinates.map(ll); let L = 0; for (let i = 1; i < cs.length; i++) L += distM(cs[i - 1], cs[i]); return L; };
  const per = {};
  for (const [name, pt, behind] of ${JSON.stringify(FIX)}) {
    const o = oriented(name, pt);
    if (!o) { per[name + '@' + pt[0]] = { noRun: true }; continue; }
    const joinD = o.total - behind;
    const joinPt = (() => { const sl = sliceLine(o.line, o.cum, Math.max(0, joinD - 0.01), joinD); return sl[sl.length - 1]; })();
    const fadesHere = feats.fades.filter(f => f.properties.k === 'c' && f.geometry.coordinates.some(c => distM(ll(c), joinPt) <= 1.5));
    const fadeLen = fadesHere.length ? Math.max(...fadesHere.map(featLen)) : 0;
    // overshoot: any board-paint vertex past the join, near this end
    let over = 0;
    for (const fam of ['centres', 'bands', 'fills', 'fades']) for (const f of feats[fam]) for (const c of f.geometry.coordinates) {
      const p = ll(c); if (distM(p, pt) > 45) continue;
      const pr = projOnLine(o.line, o.cum, p);
      if (pr.off <= 6 && pr.d > joinD + over) over = pr.d - joinD;
    }
    per[name + '@' + pt[0]] = { joinPt, fades: fadesHere.length, fadeLen, over };
  }
  // Topper: since Beta 1.267 its east end is a treated DEAD end - a centre
  // fade spans the last ~10 m and the centre paint stops where it begins
  const tO = oriented('Topper', ${JSON.stringify(TOPPER_E)});
  let topperFade = 0, topperReach = -1, topperFadeLen = 0;
  if (tO) {
    topperFade = feats.fades.filter(f => f.geometry.coordinates.some(c => distM(ll(c), ${JSON.stringify(TOPPER_E)}) <= 40)).length;
    const tc = feats.fades.filter(f => f.properties.k === 'c' && f.geometry.coordinates.some(c => distM(ll(c), ${JSON.stringify(TOPPER_E)}) <= 40));
    topperFadeLen = tc.length ? Math.max(...tc.map(featLen)) : 0;
    for (const f of feats.centres) for (const c of f.geometry.coordinates) { const p = ll(c); const pr = projOnLine(tO.line, tO.cum, p); if (pr.off <= 6 && pr.d > topperReach) topperReach = pr.d; }
  }
  // junction run-through: Velmar's paint through the Astona W vertex
  const vO = oriented('Velmar', ${JSON.stringify(FIX[5][1])}); // Velmar oriented from its N end; the vertex lies along it
  let through = null;
  if (vO) {
    const V = ${JSON.stringify(ASTONA_W)};
    const dV = projOnLine(vO.line, vO.cum, V).d;
    const segD = (p, a, b) => { const pr = (() => { const vx = (b[1] - a[1]) * MLNG, vy = (b[0] - a[0]) * MLAT; const L2 = vx * vx + vy * vy; let t = L2 ? (((p[1] - a[1]) * MLNG * vx) + ((p[0] - a[0]) * MLAT * vy)) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot((p[1] - a[1]) * MLNG - vx * t, (p[0] - a[0]) * MLAT - vy * t); })(); return pr; };
    for (const f of feats.centres) {
      const cs = f.geometry.coordinates.map(ll);
      let dMin = Infinity;
      for (let i = 1; i < cs.length; i++) dMin = Math.min(dMin, segD(V, cs[i - 1], cs[i]));
      if (dMin > 2.5) continue; // the strand's polyline passes the vertex (its ends are junction-clipped ~5 m out, so vertices never sit ON it - the line itself is the test)
      const ds = cs.map(p => projOnLine(vO.line, vO.cum, p).d);
      through = { lo: Math.min(...ds), hi: Math.max(...ds), dV, dMin };
      break;
    }
  }
  const fadeNearJunction = feats.fades.filter(f => f.geometry.coordinates.some(c => distM(ll(c), ${JSON.stringify(ASTONA_W)}) <= 25)).length;
  return { lineMetrics: { fades: !!(srcSpec('fades') && srcSpec('fades').lineMetrics), selFades: !!(srcSpec('selFades') && srcSpec('selFades').lineMetrics) },
    layers: ['fade-casing', 'fade-surf-y', 'fade-surf-r', 'fade-band-g', 'fade-fill-g', 'selfade-y', 'selfade-r', 'selfade-g', 'selfade-fill'].map(id => [id, layerIds.includes(id)]),
    counts: { c: feats.fades.filter(f => f.properties.k === 'c').length, x: feats.fades.filter(f => f.properties.k === 'x').length },
    per, topperFade, topperFadeLen, topperReach, topperTotal: tO ? tO.total : -1, through, fadeNearJunction };
})()`);
ok('C1 the fades and selFades sources exist and carry lineMetrics (line-gradient\'s precondition) | ' + JSON.stringify(C.lineMetrics),
  !C.__err && C.lineMetrics && C.lineMetrics.fades === true && C.lineMetrics.selFades === true);
ok('C2 all nine fade layers are on the map | ' + JSON.stringify(C.layers),
  !C.__err && C.layers && C.layers.every(([, on]) => on === true));
ok('C3 at rest the board carries exactly 15 centre fades and 15 casing fades - one per treated end (7 boundary + 8 dead since Beta 1.267) | ' + JSON.stringify(C.counts),
  !C.__err && C.counts && C.counts.c === 15 && C.counts.x === 15);
ok('C4 every boundary end has its fade: a centre fade ending at the join (+-1.5 m) with a 13.5-16.5 m span | ' + JSON.stringify(C.per).slice(0, 500),
  !C.__err && C.per && Object.values(C.per).every(p => !p.noRun && p.fades >= 1 && p.fadeLen >= 13.5 && p.fadeLen <= 16.5));
ok('C5 no board paint crosses a join: at the two overshoot ends (and every other fixture end) no centres/bands/fills/fades vertex projects past the join by more than 0.75 m | ' + JSON.stringify(C.per).slice(0, 500),
  !C.__err && C.per && Object.values(C.per).every(p => p.over <= 0.75));
ok('C6 Topper E IS treated as a dead end (Beta 1.267): a centre fade of 8.5-11.5 m spans its last metres, and its centre paint stops where the fade begins (about 10 m short of the natural end) | fade=' + C.topperFade + ' fadeLen=' + C.topperFadeLen + ' reach=' + C.topperReach + '/' + C.topperTotal,
  !C.__err && C.topperFade >= 1 && C.topperFadeLen >= 8.5 && C.topperFadeLen <= 11.5 && C.topperTotal > 0 && C.topperReach >= C.topperTotal - 11.5 && C.topperReach <= C.topperTotal - 8.5);
ok('C7 junction run-through intact: Velmar\'s centre paint passes through the Astona W junction vertex with at least 10 m of paint on both sides, and no fade feature comes within 25 m of it | ' + JSON.stringify(C.through) + ' fadeNear=' + C.fadeNearJunction,
  !C.__err && C.through && (C.through.dV - C.through.lo) >= 10 && (C.through.hi - C.through.dV) >= 10 && C.fadeNearJunction === 0);

// ---------- D: done states and the selection fade too ----------
const NE_PIECE = await J(`STRETCH.Valeria.parts.length - 1`);
await ev(`(() => { pieces.Valeria = pieces.Valeria.map(() => 3); GLP.sync(); return true; })()`);
await sleep(400);
const D1 = await J(`(() => {
  const s = map.getSource('fades'); const feats = (s && s._data && s._data.features) || [];
  const near = f => f.geometry.coordinates.some(c => distM([c[1], c[0]], ${JSON.stringify(FIX[0][1])}) <= 45);
  return { band: feats.filter(f => f.properties.k === 'b' && near(f)).length, centre: feats.filter(f => f.properties.k === 'c' && near(f)).length };
})()`);
ok('D1 a fully-done street fades as a BAND at its boundary end (bits 3): a band fade at Valeria NE and no centre fade left there | ' + JSON.stringify(D1),
  !D1.__err && D1.band >= 1 && D1.centre === 0);
await ev(`(() => { pieces.Valeria = pieces.Valeria.map(() => 1); GLP.sync(); return true; })()`);
await sleep(400);
const D2 = await J(`(() => {
  const s = map.getSource('fades'); const feats = (s && s._data && s._data.features) || [];
  const near = f => f.geometry.coordinates.some(c => distM([c[1], c[0]], ${JSON.stringify(FIX[0][1])}) <= 45);
  return { fill: feats.filter(f => f.properties.k === 'f' && near(f)).length, centre: feats.filter(f => f.properties.k === 'c' && near(f)).length };
})()`);
ok('D2 a one-side-done street fades BOTH its centre and its side fill at the boundary end (bits 1) | ' + JSON.stringify(D2),
  !D2.__err && D2.fill >= 1 && D2.centre >= 1);
await ev(`(() => { const part = STRETCH.Valeria.parts[${NE_PIECE}]; selectStretch('Valeria', ${NE_PIECE}, part[Math.floor(part.length / 2)]); return true; })()`);
await sleep(500);
const D3 = await J(`(() => {
  const s = map.getSource('selFades'); const feats = (s && s._data && s._data.features) || [];
  const grad = map.getPaintProperty('selfade-y', 'line-gradient');
  return { selFades: feats.length, kinds: feats.map(f => f.properties.k), grad: JSON.stringify(grad) };
})()`);
ok('D3 the selection redraw fades too: selFades carries the selected stretch\'s end fade, and the selfade-y layer wears the vibrant gold gradient (255,194,51) | ' + JSON.stringify(D3).slice(0, 300),
  !D3.__err && D3.selFades >= 1 && typeof D3.grad === 'string' && D3.grad.includes('255,194,51'));
await ev(`(() => { pieces.Valeria = pieces.Valeria.map(() => 0); GLP.sync(); if (typeof deselect === 'function') deselect(); return true; })()`);
await sleep(400);

// ---------- E: rendered proof - the pixel profile across the Valeria NE join ----------
const EP = await J(`(() => {
  const pt = ${JSON.stringify(FIX[0][1])}, behind = ${FIX[0][2]};
  let line = null, cum = null, total = 0;
  for (const run of STRETCH.Valeria.runs) {
    const L = run.line;
    if (distM(L[L.length - 1], pt) <= 1.5) { line = L; cum = run.cum; total = run.total; break; }
    if (distM(L[0], pt) <= 1.5) { line = [...L].reverse(); cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distM(line[i - 1], line[i])); total = cum[cum.length - 1]; break; }
  }
  if (!line) return { noRun: true };
  const at = back => { const sl = sliceLine(line, cum, Math.max(0, total - behind - back - 0.01), total - behind - back); return sl[sl.length - 1]; };
  // back > 0: inside the route from the join; back < 0: past the join, in the old stub
  const pts = { solid: at(22), mid: at(7.5), stub: at(-6) };
  // centre on the JOIN, not the end: at z18.5 the phone viewport is ~32 m
  // half-width, so a frame centred on the end pushes the solid sample
  // (34 m back) off the canvas entirely
  map.jumpTo({ center: [pts.mid[1], pts.mid[0]], zoom: 18.5 });
  return { pts, gold: GLP.mute('#ffc233'), dpr: window.devicePixelRatio || 1, iw: window.innerWidth };
})()`);
await sleep(2500); // tiles + paint settle
await shot('/tmp/drive214-vne.png'); // the harness's shot writes the PNG itself
const proj = await J(`(() => {
  const out = {};
  for (const [k, ll] of Object.entries(${JSON.stringify(EP.pts || {})})) { const p = map.project([ll[1], ll[0]]); out[k] = [p.x, p.y]; }
  return out;
})()`);
// The pixel scan runs IN-PAGE on a canvas (the house pattern, drive180):
// each sample scores SIMILARITY to muted gold: 1 - (distance from the
// window's mean colour to gold) / (gold-to-background distance, ~104 for
// the bare map grey). A membership count cannot see the gradient - a 50%
// blend still sits within any sane distance of gold - while the similarity
// of the mean tracks the gradient's alpha directly (solid ~1, mid-fade
// ~0.5, bare map ~0), and stays ~0 over any pale basemap surface
// (major-road fills sit 100+ from gold). (First shipped with a PIL helper;
// the shard runners have no Pillow - gate round 3 caught it.)
const pngB64 = fs.readFileSync('/tmp/drive214-vne.png').toString('base64');
let scan = {};
try {
  scan = await ev(`(async () => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,${pngB64}'; });
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
    const gold = '${EP.gold || '#ffc233'}';
    const gr = parseInt(gold.slice(1, 3), 16), gg = parseInt(gold.slice(3, 5), 16), gb = parseInt(gold.slice(5, 7), 16);
    const span = Math.hypot(gr - 204, gg - 204, gb - 204);
    const scale = img.width / ${EP.iw || 1280};
    const pts = ${JSON.stringify(proj)};
    const out = {};
    for (const [k, [x, y]] of Object.entries(pts)) {
      const cxp = Math.round(x * scale), cyp = Math.round(y * scale), r = Math.max(4, Math.round(6 * scale));
      const x0 = Math.max(0, cxp - r), y0 = Math.max(0, cyp - r), w = Math.min(img.width, cxp + r + 1) - x0, h = Math.min(img.height, cyp + r + 1) - y0;
      if (w <= 0 || h <= 0) { out[k] = 0; continue; }
      const d = ctx.getImageData(x0, y0, w, h).data;
      let sr = 0, sg = 0, sb = 0; const tot = w * h;
      for (let i = 0; i < d.length; i += 4) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; }
      const dist = Math.hypot(sr / tot - gr, sg / tot - gg, sb / tot - gb);
      out[k] = Math.round(Math.max(0, 1 - dist / span) * 1000) / 1000;
    }
    return out;
  })()`);
} catch (e) { scan = { err: String(e).slice(0, 200) }; }
ok('E1 rendered: 22 m inside the join the Valeria paint is solid muted gold (similarity >= 0.8) | ' + JSON.stringify(scan) + ' proj=' + JSON.stringify(proj) + ' cam=' + JSON.stringify(await J(`(() => ({ c: [map.getCenter().lat, map.getCenter().lng], z: map.getZoom() }))()`)),
  typeof scan.solid === 'number' && scan.solid >= 0.8);
ok('E2 rendered: mid-fade (7.5 m inside the join) the gold is present but weakened by the gradient (0.15 < similarity, and clearly below solid) | ' + JSON.stringify(scan),
  typeof scan.mid === 'number' && scan.mid > 0.15 && scan.mid < scan.solid - 0.2);
ok('E3 rendered: 6 m PAST the join (the old overshoot stub) there is no gold left (similarity <= 0.15) - on 1.258 this point is solid gold | ' + JSON.stringify(scan),
  typeof scan.stub === 'number' && scan.stub <= 0.15);

// ---------- F: route street names at the home framing (Beta 1.259, Andrew's addendum) ----------
// With 1.258's basemap labels the home view names only a street or two: the
// minor label layer starts at zoom 15 and the home framing sits near 13.
// Andrew: every route street shows its basemap name at the home zoom, day
// and night; non-route streets keep stock behaviour. The count below is the
// rendered truth - distinct route streets (of the pack's 34) with a placed
// label in the home framing, read from the map's own rendered features.
//
// Beta 1.261 REWORK (Andrew's label-mix decision, 2026-11-20, the same
// evening): the requirement F1/F2 graded - every route street showing its
// BASEMAP name at the home zoom - is REVERSED. The mix restores the app's
// own titles below zoom 15 (capped there) and the basemap's full names own
// 15 and up; the priority lane that delivered F1/F2 is deleted whole. F1/F2
// are retired and replaced by the M sections below (M1: the app titles
// render at home, day and night; M2: no basemap route full-names below 15 -
// the exclusion the mix restores; M3: the handover at 15+; M4: the live
// seam read-back; M5: the standing heal fires).
// Beta 1.263 REWORK (the naming revert, Andrew's decision 2026-11-21):
// the mix is reverted to the pre-1.258 system, so M3 and M4 INVERT (the
// titles render at 15.7 too - no cap - and the exclusion holds at every
// zoom, so there are no doubles anywhere; the live read-back is the
// restored shape: no cap, blanket 13-24 ranges, exclusion on the
// originals, no '-pre15' layer), M5 INVERTS (after the pick flight's one
// re-place, camera moves cause NO further labelpts rebuilds - the
// teardown that flickered is gone; drive216 grades presence through the
// settles), and M2's liveness moves to the original major layer (the
// band it watched no longer exists). F3 (the R1 live read-back) stands
// verbatim - R1 ships on in the mix exactly as 1.259 built it; F4's
// toggle comparison is retired where it stood below, with its evidence.
// F5/F6/F7
// (the lane's angle law) are retired where they stood, below.
// Beta 1.294 REWORK: M3/M4 read the handover shape (title cap 16); F3/F4 pin spacing 250.
const routeFullNames = await J(`(() => {
  const pack = ROUTE_PACKS.find(p => p.id === '5w');
  const ORD = { First: '1st', Second: '2nd', Third: '3rd', Fourth: '4th', Fifth: '5th', Sixth: '6th', Seventh: '7th', Eighth: '8th', Ninth: '9th', Tenth: '10th' };
  return Object.keys(ROADS).map(s => pack.tileNames.find(t => t.startsWith(s + ' ')) || pack.tileNames.find(t => t.startsWith((ORD[s] || s) + ' ')) || pack.tileNames.find(t => t === s) || s); // the full basemap form ('Valeria Boulevard') wins over the bare short name, which tileNames also carries; the ordinal form covers 'Fifth' -> '5th Avenue', the tiles' own spelling
})()`);
const TITLE_LAYERS = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'];
const countTitlesAtHome = async () => {
  await ev(`(() => { goHomeView(); return true; })()`);
  await poll(`(() => { try { return map.querySourceFeatures('protomaps', { sourceLayer: 'roads' }).length > 50; } catch (e) { return false; } })()`, 30000); // the label layers read the tiles - wait until the roads tiles for this framing have actually landed
  // The graded read is a STABILITY read (drive130's L7 discipline, applied
  // after gate round 1 of this round failed in CI): sample the placed
  // title set until it is identical across 3 consecutive samples AND
  // holds at least 30 names; the graded sample is the last stable one.
  // A first-live read is not enough here - placement converges over a
  // beat after a flight (tile arrivals re-decide collisions), and a
  // first-live read can catch a half-placed set (the 1.261 round read 0
  // of 34 in CI on a poll that had already seen the titles live). If the
  // set never stabilises, the last sample is graded and the check fails
  // honestly on it.
  const readTitles = `(() => { const layers = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].filter(id => map.getLayer(id)); const seen = new Set(); for (const f of map.queryRenderedFeatures({ layers })) { if (f.properties && f.properties.name) seen.add(f.properties.name); } return { zoom: map.getZoom(), pitch: map.getPitch(), rendered: [...seen], lanePresent: !!map.getLayer('roads_labels_minor-priority') }; })()`;
  let prevKey = '', streak = 0, last = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const s = await J(readTitles);
    if (s && Array.isArray(s.rendered)) {
      last = s;
      const key = JSON.stringify([...s.rendered].sort());
      if (key === prevKey && s.rendered.length >= 30) { streak++; if (streak >= 2) break; }
      else { streak = 0; prevKey = key; }
    }
    await sleep(500);
  }
  return last || J(readTitles);
};
const shortNames = await J(`(() => Object.keys(ROADS))()`);
const dayCount = await countTitlesAtHome();
const dayTitleHits = shortNames.filter(n => (dayCount.rendered || []).includes(n));
ok('M1 the app titles render at the home framing (day): ' + dayTitleHits.length + ' of 34 route streets carry their app title | zoom ' + (dayCount.zoom || 0).toFixed(2) + ' pitch ' + dayCount.pitch + ', lane layer present: ' + dayCount.lanePresent + ', missing: ' + shortNames.filter(n => !dayTitleHits.includes(n)).join(', '),
  shortNames.length === 34 && dayTitleHits.length >= 30 && dayCount.lanePresent === false);
const spacingDay = await J(`(() => ({ major: map.getLayoutProperty('roads_labels_major', 'symbol-spacing'), minor: map.getLayoutProperty('roads_labels_minor', 'symbol-spacing') }))()`);
ok('F3 R1 repetition is owned live: symbol-spacing reads 250 on both basemap road-label layers (Beta 1.294: Andrew re-picked the value from 500 to 250 on 2026-11-24) | ' + JSON.stringify(spacingDay),
  spacingDay.major === 250 && spacingDay.minor === 250);
await ev(`(() => { setThemeOverride(true); applyNight(); setBasemap(); return true; })()`); // the night button's own path
await poll(`!!(window.map && map.getSource && map.getSource('centres'))`, 45000);
const nightCount = await countTitlesAtHome();
const nightTitleHits = shortNames.filter(n => (nightCount.rendered || []).includes(n));
ok('M1n the app titles render at the home framing (night): ' + nightTitleHits.length + ' of 34 route streets carry their app title | zoom ' + (nightCount.zoom || 0).toFixed(2) + ', missing: ' + shortNames.filter(n => !nightTitleHits.includes(n)).join(', '),
  nightTitleHits.length >= 30);
await ev(`(() => { setThemeOverride(false); applyNight(); setBasemap(); return true; })()`);
await poll(`!!(window.map && map.getSource && map.getSource('centres'))`, 45000);
// F4 RETIRED by Beta 1.261 (the toggle comparison; F3's live read-back
// above is R1's standing rendered proof, with proof-1259 check 12 and
// proof-1261 check 6 pinning the owned line). F4 compared rendered
// minor-label counts at spacing 500 vs 250 in a zoom-17 phone frame and
// asserted 500 < 250. Re-measured in this round with settled reads
// (drive130's L7 discipline: identical name multisets across consecutive
// samples), the comparison does not measure spacing at all in phone
// frames: at zoom 17, 16 and 15.5 the counts are IDENTICAL at both
// spacings (12 of the same names at 15.5, twice) - the repeats that
// exist here are tile-boundary restarts, which spacing does not govern,
// and this neighbourhood's streets are too short and collision-dense
// for spacing-driven repeats to survive placement. The 1.259 pass was a
// convergence draw (an unsettled read), not a measurement. The value's
// effect was proven where it can be seen - the repetition sample Andrew
// picked R1 from, on desktop-width frames (Santa Barbara Place 3 -> 2,
// Velmar Drive 2 -> 1 at zoom 17). What this section still pins: the
// toggle excursion leaves the live value at the owned value (state
// restored). Beta 1.294: the owned value is 250 now (Andrew's re-pick),
// so the excursion runs 500 -> 250.
await ev(`(() => { map.setLayoutProperty('roads_labels_minor', 'symbol-spacing', 500); map.setLayoutProperty('roads_labels_minor', 'symbol-spacing', 250); return true; })()`);
await sleep(400);
const f4rest = await J(`(() => ({ minor: map.getLayoutProperty('roads_labels_minor', 'symbol-spacing'), major: map.getLayoutProperty('roads_labels_major', 'symbol-spacing') }))()`);
ok('F4 (retired toggle, see the note above) the spacing excursion restores the owned R1 value live: 250 on both basemap road-label layers | ' + JSON.stringify(f4rest),
  f4rest.minor === 250 && f4rest.major === 250);

// F5/F6/F7 RETIRED by Beta 1.261: they graded the priority lane's stored
// angle law (bearing - 90, upright under camera rotation). The lane is
// deleted whole by the label mix; the restored app titles are point
// symbols whose orientation is MapLibre's variable-anchor placement, not
// a stored angle, so there is no angle law left to grade. Their rendered
// concern - names lying along their streets - is graded for the mix by
// the 1.261 round's geometric harness (RECORD.md of the round: rendered
// text centroid vs street line, day and night, after pan / zoom / rotate
// / re-pick / theme swap), not by this drive.

// ---------- M: the label mix in the rendered page (Beta 1.261) ----------
// M2: below 15 the basemap must NOT print a route street's full name - the
// '-pre15' band carries the restored exclusion, so a route name below 15
// can only be the app's own title (short form). Checked at the home
// framing and at 14.7 (the sample's MID framing). On a mix tree with the
// exclusion lifted, the band prints the full names and this fails; on the
// 1.259 tree the lane (a different layer) is not read here, but the stock
// major layer carried no exclusion either.
const basemapRouteNamesBelow15 = async () => J(`(() => {
  const layers = ['roads_labels_major', 'roads_labels_minor'].filter(id => map.getLayer(id));
  const seen = new Set();
  for (const f of map.queryRenderedFeatures({ layers })) { const nm = f.properties && f.properties.name; if (nm) seen.add(nm); }
  const full = ${JSON.stringify(routeFullNames)};
  return { zoom: map.getZoom(), hits: full.filter(n => seen.has(n)) };
})()`);
await ev(`(() => { goHomeView(); return true; })()`);
await poll(`!!(window.map && map.loaded())`, 30000);
await sleep(1000);
const m2home = await basemapRouteNamesBelow15();
ok('M2 no basemap route full-names below 15 at home: the exclusion holds | zoom ' + (m2home.zoom || 0).toFixed(2) + ', full names rendered by basemap layers: ' + JSON.stringify(m2home.hits),
  Array.isArray(m2home.hits) && m2home.hits.length === 0);
await ev(`(() => { map.zoomTo(14.7, { duration: 700 }); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 30000);
// Liveness before the exclusion read: the major layer must be provably
// rendering names in this frame (the non-route majors) before an empty
// route-name read counts as the exclusion working - an unloaded layer
// would pass vacuously, the failure this drive's header warns against.
const m2live = await poll(`(() => { try { if (!map.getLayer('roads_labels_major')) return false; for (const f of map.queryRenderedFeatures({ layers: ['roads_labels_major'] })) { if (f.properties && f.properties.name) return true; } return false; } catch (e) { return false; } })()`, 30000);
await sleep(600);
const m2mid = await basemapRouteNamesBelow15();
ok('M2b no basemap route full-names below 15 at zoom 14.7 either (layer provably live first: ' + m2live + ') | full names rendered: ' + JSON.stringify(m2mid.hits),
  m2live === true && Array.isArray(m2mid.hits) && m2mid.hits.length === 0);

// M3 (the switch form, Beta 1.297): at 15.7 the titles are gone (past
// the 15.2 cap), the clones name route streets, originals print none.
await ev(`(() => { map.jumpTo({ zoom: 15.7 }); return true; })()`);
await poll(`(() => { try { return map.querySourceFeatures('protomaps', { sourceLayer: 'roads' }).length > 50; } catch (e) { return false; } })()`, 30000);
await poll(`(() => { try { const seen = new Set(); for (const f of map.queryRenderedFeatures({ layers: ['roads_labels_major', 'roads_labels_minor'] })) { if (f.properties && f.properties.name) seen.add(f.properties.name); } return seen.size >= 5; } catch (e) { return false; } })()`, 30000); // the basemap layers must be provably rendering (non-route names) before an empty route-name read counts as the exclusion working
await poll(`(() => { try { const full = ${JSON.stringify(routeFullNames)}; const seen = new Set(); ` +
  `for (const f of map.queryRenderedFeatures({ layers: ['roads_labels_major-route', 'roads_labels_minor-route'] })) { const nm = f.properties && f.properties.name; if (nm && full.includes(nm)) seen.add(nm); } ` +
  `return seen.size >= 3; } catch (e) { return false; } })()`, 30000); // and the clones must be provably naming route streets before the titles' empty read counts as the switch
await sleep(600);
const m3 = await J(`(() => {
  const titleLayers = ${JSON.stringify(TITLE_LAYERS)}.filter(id => map.getLayer(id));
  let titleFeats = 0;
  for (const f of map.queryRenderedFeatures({ layers: titleLayers })) titleFeats++;
  const namesOn = (ids) => { const seen = new Set(); for (const f of map.queryRenderedFeatures({ layers: ids.filter(id => map.getLayer(id)) })) { const nm = f.properties && f.properties.name; if (nm) seen.add(nm); } return seen; };
  const full = ${JSON.stringify(routeFullNames)};
  const baseSeen = namesOn(['roads_labels_major', 'roads_labels_minor']);
  const cloneSeen = namesOn(['roads_labels_major-route', 'roads_labels_minor-route']);
  return { zoom: map.getZoom(), titleFeats, fullHits: full.filter(n => baseSeen.has(n)), cloneHits: full.filter(n => cloneSeen.has(n)) };
})()`);
ok('M3 past the switch, no doubles: at zoom 15.7 the app titles render nothing (the 15.2 cap), the clones name route streets, ' +
  'and the basemap originals print no route full name (the exclusion holds at every zoom) | titles ' + m3.titleFeats +
  ', clone route names: ' + JSON.stringify(m3.cloneHits) + ', basemap route full-names: ' + JSON.stringify(m3.fullHits),
  m3.titleFeats === 0 && (m3.cloneHits || []).length >= 3 && (m3.fullHits || []).length === 0);

// M4 (the switch form, Beta 1.297): the live read-back - title
// maxzoom 15.2, clone minzoom 15.2, blanket 13-24 originals, no '-pre15'.
const m4 = await J(`(() => {
  const L = id => map.getLayer(id);
  return {
    titleMax: L('streetnamespt1') ? (L('streetnamespt1').maxzoom === undefined ? null : L('streetnamespt1').maxzoom) : 'absent',
    cloneMin: L('roads_labels_major-route') ? L('roads_labels_major-route').minzoom : null,
    majorMin: L('roads_labels_major') ? L('roads_labels_major').minzoom : null,
    majorMax: L('roads_labels_major') ? (L('roads_labels_major').maxzoom === undefined ? null : L('roads_labels_major').maxzoom) : null,
    minorMin: L('roads_labels_minor') ? L('roads_labels_minor').minzoom : null,
    prePresent: !!L('roads_labels_major-pre15') || !!L('roads_labels_minor-pre15'),
    majorFilter: JSON.stringify(map.getFilter('roads_labels_major')),
    minorFilter: JSON.stringify(map.getFilter('roads_labels_minor')),
  };
})()`);
ok('M4 the switch shape live: title maxzoom 15.2, clone minzoom 15.2, blanket 13-24 on both basemap originals, ' +
  'the route-name exclusion in both filters, no -pre15 layer | ' + JSON.stringify({ t: m4.titleMax, c: m4.cloneMin, maj: [m4.majorMin, m4.majorMax], min: m4.minorMin, pre: m4.prePresent }),
  m4.titleMax === 15.2 && m4.cloneMin === 15.2 && m4.majorMin === 13 && (m4.majorMax === null || m4.majorMax === 24) &&
  m4.minorMin === 13 && m4.prePresent === false && (m4.majorFilter || '').includes('Valeria Boulevard') && (m4.minorFilter || '').includes('Valeria Boulevard'));

// M5 (INVERTED by the 1.263 revert): NO standing heal - after the pick
// flight's one re-place (the restored 1.248 hook, long landed by this
// section), an animated zoom and an animated rotate cause NO further
// labelpts rebuilds (counted by wrapping map.removeSource, the rebuild's
// tell). On the mix tree the heal rebuilds after both moves and this
// fails there by design - that rebuild is the teardown that flickered.
await ev(`(() => { goHomeView(); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 30000);
await sleep(3500); // any armed one-flight backstop (2.5 s) has landed by now; the count below starts from a quiet map
await ev(`(() => { window.__rpCount = 0; const orig = map.removeSource.bind(map); map.removeSource = function (id) { if (id === 'labelpts') window.__rpCount++; return orig(id); }; return true; })()`);
const rpBase = await J(`(() => window.__rpCount)()`);
await ev(`(() => { map.zoomTo(14.2, { duration: 700 }); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 30000);
await sleep(3000); // the heal decided at idle, within a beat of the settle - a rebuild inside this window is the flicker mechanism itself
const rpAfterZoom = await J(`(() => window.__rpCount)()`);
await ev(`(() => { map.rotateTo(30, { duration: 700 }); return true; })()`);
await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 30000);
await sleep(3000);
const rpAfterRot = await J(`(() => window.__rpCount)()`);
ok('M5 no standing heal: labelpts is NOT rebuilt after an animated zoom (' + rpBase + ' -> ' + rpAfterZoom + ') or an animated rotate (' + rpAfterZoom + ' -> ' + rpAfterRot + ') - the only re-place in the system is the pick flight\'s one',
  rpAfterZoom === rpBase && rpAfterRot === rpAfterZoom);
await ev(`(() => { map.jumpTo({ bearing: 0 }); return true; })()`);
await sleep(800);

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
