import { launchDrive, finish, bootThrough } from './harness.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, shot, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);
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
ok('B1 the shipped Route 5W pack carries the ends field with the same 7 records | ' + JSON.stringify(B.packEnds).slice(0, 300),
  countRecs(B.packEnds) === 7 && FIX.every(([n, pt, b]) => matchRec(B.packEnds, n, pt, b)));
ok('B2 buildGeometry attaches the records to STRETCH (the engine\'s input): every fixture street carries its ends | attached: ' + Object.keys(B.attached || {}).join(','),
  ['Valeria', 'Greenpark', 'Astona', 'Woolacott', 'Velmar'].every(n => (B.attached || {})[n] && matchRec({ [n]: B.attached[n] }, n, FIX.find(f => f[0] === n)[1], FIX.find(f => f[0] === n)[2])));

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
  // Topper: no fade near its east end; its paint still reaches the natural end
  const tO = oriented('Topper', ${JSON.stringify(TOPPER_E)});
  let topperFade = 0, topperReach = -1;
  if (tO) {
    topperFade = feats.fades.filter(f => f.geometry.coordinates.some(c => distM(ll(c), ${JSON.stringify(TOPPER_E)}) <= 40)).length;
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
    per, topperFade, topperReach, topperTotal: tO ? tO.total : -1, through, fadeNearJunction };
})()`);
ok('C1 the fades and selFades sources exist and carry lineMetrics (line-gradient\'s precondition) | ' + JSON.stringify(C.lineMetrics),
  !C.__err && C.lineMetrics && C.lineMetrics.fades === true && C.lineMetrics.selFades === true);
ok('C2 all nine fade layers are on the map | ' + JSON.stringify(C.layers),
  !C.__err && C.layers && C.layers.every(([, on]) => on === true));
ok('C3 at rest the board carries exactly 7 centre fades and 7 casing fades - one per boundary end | ' + JSON.stringify(C.counts),
  !C.__err && C.counts && C.counts.c === 7 && C.counts.x === 7);
ok('C4 every boundary end has its fade: a centre fade ending at the join (+-1.5 m) with a 13.5-16.5 m span | ' + JSON.stringify(C.per).slice(0, 500),
  !C.__err && C.per && Object.values(C.per).every(p => !p.noRun && p.fades >= 1 && p.fadeLen >= 13.5 && p.fadeLen <= 16.5));
ok('C5 no board paint crosses a join: at the two overshoot ends (and every other fixture end) no centres/bands/fills/fades vertex projects past the join by more than 0.75 m | ' + JSON.stringify(C.per).slice(0, 500),
  !C.__err && C.per && Object.values(C.per).every(p => p.over <= 0.75));
ok('C6 Topper E is NOT treated: no fade feature within 40 m of its end, and its centre paint still reaches within 1.5 m of the natural end | fade=' + C.topperFade + ' reach=' + C.topperReach + '/' + C.topperTotal,
  !C.__err && C.topperFade === 0 && C.topperTotal > 0 && C.topperReach >= C.topperTotal - 1.5);
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
const routeFullNames = await J(`(() => {
  const pack = ROUTE_PACKS.find(p => p.id === '5w');
  const ORD = { First: '1st', Second: '2nd', Third: '3rd', Fourth: '4th', Fifth: '5th', Sixth: '6th', Seventh: '7th', Eighth: '8th', Ninth: '9th', Tenth: '10th' };
  return Object.keys(ROADS).map(s => pack.tileNames.find(t => t.startsWith(s + ' ')) || pack.tileNames.find(t => t.startsWith((ORD[s] || s) + ' ')) || pack.tileNames.find(t => t === s) || s); // the full basemap form ('Valeria Boulevard') wins over the bare short name, which tileNames also carries; the ordinal form covers 'Fifth' -> '5th Avenue', the tiles' own spelling
})()`);
const countAtHome = async () => {
  await ev(`(() => { goHomeView(); return true; })()`);
  await poll(`(() => { try { return map.querySourceFeatures('protomaps', { sourceLayer: 'roads' }).length > 50; } catch (e) { return false; } })()`, 30000); // the label layers read the tiles - wait until the roads tiles for this framing have actually landed
  await sleep(1200); // symbol placement settles after the tiles
  return J(`(() => {
    const layers = ['roads_labels_major', 'roads_labels_minor', 'roads_labels_major-route', 'roads_labels_minor-priority'].filter(id => map.getLayer(id));
    const seen = new Set();
    for (const f of map.queryRenderedFeatures({ layers })) { const nm = f.properties && f.properties.name; if (nm) seen.add(nm); }
    return { zoom: map.getZoom(), pitch: map.getPitch(), rendered: [...seen] };
  })()`);
};
const dayCount = await countAtHome();
const dayHits = routeFullNames.filter(n => (dayCount.rendered || []).includes(n));
ok('F1 at the default home framing every route street shows its basemap name (day): ' + dayHits.length + ' of ' + routeFullNames.length + ' route streets named | zoom ' + (dayCount.zoom || 0).toFixed(2) + ' pitch ' + dayCount.pitch + ', missing: ' + routeFullNames.filter(n => !dayHits.includes(n)).join(', '),
  routeFullNames.length === 34 && dayHits.length === 34);
const spacingDay = await J(`(() => ({ major: map.getLayoutProperty('roads_labels_major', 'symbol-spacing'), minor: map.getLayoutProperty('roads_labels_minor', 'symbol-spacing') }))()`);
ok('F3 R1 repetition is owned live: symbol-spacing reads 500 on both basemap road-label layers (it was set nowhere before this round - the engine default 250 decided silently) | ' + JSON.stringify(spacingDay),
  spacingDay.major === 500 && spacingDay.minor === 500);
await ev(`(() => { setThemeOverride(true); applyNight(); setBasemap(); return true; })()`); // the night button's own path
await poll(`!!(window.map && map.getSource && map.getSource('centres'))`, 45000);
const nightCount = await countAtHome();
const nightHits = routeFullNames.filter(n => (nightCount.rendered || []).includes(n));
ok('F2 at the default home framing every route street shows its basemap name (night): ' + nightHits.length + ' of ' + routeFullNames.length + ' route streets named | zoom ' + (nightCount.zoom || 0).toFixed(2) + ', missing: ' + routeFullNames.filter(n => !nightHits.includes(n)).join(', '),
  routeFullNames.length === 34 && nightHits.length === 34);
await ev(`(() => { setThemeOverride(false); applyNight(); setBasemap(); return true; })()`);
await poll(`!!(window.map && map.getSource && map.getSource('centres'))`, 45000);
// F4: the 500 value actually bites - at zoom 17 the same frame carries fewer
// repeated road names at 500 than at the old default 250 (measured by
// toggling the live layer and restoring it; the sample's own comparison was
// Santa Barbara Place 3 -> 2 and Velmar Drive 2 -> 1 at this zoom).
const repeats = async sp => {
  await ev(`(() => { map.setLayoutProperty('roads_labels_minor', 'symbol-spacing', ${sp}); map.jumpTo({ center: [-79.5613, 43.8135], zoom: 17, pitch: 0 }); return true; })()`);
  await sleep(1600);
  return J(`(() => map.queryRenderedFeatures({ layers: ['roads_labels_minor'] }).length)()`);
};
const rep500 = await repeats(500);
const rep250 = await repeats(250);
await repeats(500);
ok('F4 R1 bites: at zoom 17 the frame renders fewer minor-road name repeats at spacing 500 than at the old default 250 | 500:' + rep500 + ' 250:' + rep250,
  typeof rep500 === 'number' && typeof rep250 === 'number' && rep500 < rep250);

// F5 (gate fix, Codex P2 on PR #151): lane names must lie ALONG their roads.
// text-rotate measures clockwise from the horizontal baseline; the anchor
// bearing is a compass bearing - the stored ang must be bearing - 90,
// normalized. Recomputed here from the run geometry, independently of the
// builder's arithmetic. On the first shipped build ang == bearing and
// every name lay across its street (this check fails there, by design).
// The angles are read from the RENDERED lane features at the home framing
// (querySourceFeatures reads the source tile cache, which is empty once
// the camera leaves the lane's zoom band).
await ev(`(() => { goHomeView(); return true; })()`);
await poll(`!!(window.map && map.loaded())`, 30000);
await sleep(1200);
const orient = await J(`(() => {
  const pack = ROUTE_PACKS.find(p => p.id === '5w');
  const ord = { First: '1st', Second: '2nd', Third: '3rd', Fourth: '4th', Fifth: '5th', Sixth: '6th', Seventh: '7th', Eighth: '8th', Ninth: '9th', Tenth: '10th' };
  const byName = {};
  for (const f of map.queryRenderedFeatures({ layers: ['roads_labels_minor-priority'] })) byName[f.properties.name] = f.properties.ang;
  const feats = Object.entries(byName).map(([name, ang]) => ({ properties: { name, ang } }));
  let checked = 0, worst = 0;
  for (const f of feats) {
    const key = Object.keys(STRETCH).find(n => (pack.tileNames.find(t => t.startsWith(n + ' ')) || pack.tileNames.find(t => t.startsWith((ord[n] || n) + ' ')) || n) === f.properties.name);
    if (!key) return { checked, worst: 999 };
    const st = STRETCH[key];
    let run = st.runs[0]; for (const r of st.runs) if (r.total > run.total) run = r;
    const L = run.line, cum = run.cum, mid = run.total / 2;
    const at = d => { for (let i = 1; i < L.length; i++) { if (d <= cum[i] || i === L.length - 1) { const span = cum[i] - cum[i - 1] || 1; const t = Math.max(0, Math.min(1, (d - cum[i - 1]) / span)); return [L[i - 1][0] + (L[i][0] - L[i - 1][0]) * t, L[i - 1][1] + (L[i][1] - L[i - 1][1]) * t]; } } return L[L.length - 1]; };
    const a = at(Math.max(0, mid - 8)), b = at(Math.min(run.total, mid + 8));
    let exp = Math.atan2((b[1] - a[1]) * MLNG, (b[0] - a[0]) * MLAT) * 180 / Math.PI - 90;
    while (exp > 90) exp -= 180; while (exp <= -90) exp += 180;
    let d = Math.abs(f.properties.ang - exp); if (d > 180) d = 360 - d;
    if (d > worst) worst = d;
    checked++;
  }
  return { checked, worst };
})()`);
ok('F5 lane names lie along their roads: every stored angle is bearing - 90 (worst deviation ' + (orient.worst != null ? Math.round(orient.worst * 10) / 10 : '?') + ' deg over ' + orient.checked + ' names)',
  orient.checked === 34 && orient.worst <= 1.5);

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
