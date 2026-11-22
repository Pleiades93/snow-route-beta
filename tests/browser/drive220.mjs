import { launchDrive, finish, bootThrough } from './harness.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, shot, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);
if (!await poll(`!!(window.map && map.getSource && map.getSource('fades'))`, 45000)) throw new Error('drive220: the GL stack never landed - the fade counts would measure an empty map and pass vacuously');

// drive220: Beta 1.267 - the CREATE round (four of Andrew's 2026-11-21
// calls; the settings wording is pinned statically by proof-1267):
// (1) DEAD-END FEATHER (Option 1, 10 m; boundary stays 15 m): the
//     shipped pack's ends field carries 15 records - the 7 boundary at
//     fade 15 and exactly the 8 proven dead ends at fade 10 with
//     join == end - and a fresh in-page derivation from the Vaughan
//     library (computeBoundaryEnds + computeDeadEnds over the box-grown
//     subset, the derive script's own recipe) reproduces them. The
//     fades source grows from 14 features (7 records, Beta 1.264) to
//     30 (15 records x casing + centre).
// (2) NAMES ON TOP: the five create draft layers seat BELOW the first
//     label layer in the style order, so a chosen street's basemap name
//     prints over its highlight; exit restores the non-create stack
//     order exactly.
// (3) DONE FLIGHT: pressing Done flies the draft FLAT (pitch 0) into
//     the visible map area ABOVE the Review sheet - the fit's bottom
//     padding is the sheet's measured height plus a comfort margin, so
//     every draft point lands above the sheet's top edge; an empty
//     draft fires no flight at all. (Beta 1.269 re-pin: through 1.268
//     this section pinned 1.267's pitch-45 full-screen fit, which
//     Andrew rejected live - the tilted draft slid under the sheet.)
// Both-ways: on the 1.266 tree A fails (7 records, 14 fades), B1 fails
// (the draft layers sit above the labels), C1/C2 fail (the old fitDraft
// was an 800 ms flat fitBounds at the picking pitch); on the 1.268 tree
// C1 fails (the flight lands at pitch 45) and C2 fails (the full-screen
// fit centres the draft on the whole viewport, so its southern points
// project behind the sheet).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const settle = async () => { await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 30000); await sleep(700); };
await settle();

// ---------- A: the pack field + the fades it paints ----------
const A = await J(`(() => {
  const pack = ROUTE_PACKS.find(p => p.id === '5w');
  const out = { total: 0, b15: 0, d10: [], joinEq: true, fadesSrc: -1 };
  if (pack && pack.ends) for (const [k, v] of Object.entries(pack.ends)) for (const r of v) { out.total++; if (r[4] === 15) out.b15++; if (r[4] === 10) { out.d10.push(k); if (r[0] !== r[2] || r[1] !== r[3]) out.joinEq = false; } }
  out.d10.sort();
  try { const d = map.getSource('fades').serialize().data; out.fadesSrc = d && d.features ? d.features.length : -1; } catch (e) {}
  return out;
})()`);
ok('A1 pack ends: exactly 15 records - 7 boundary at fade 15, 8 dead at fade 10 on the proven streets, every dead join == its end | ' + JSON.stringify(A),
  A.total === 15 && A.b15 === 7 && JSON.stringify(A.d10) === JSON.stringify(['Angie', 'Bayside', 'Boddy', 'Dianawood', 'Ferrari', 'Julian', 'Tina', 'Topper']) && A.joinEq === true);
ok('A2 the fades source carries the dead ends too: 30 features (15 records x casing + centre), up from 14 at Beta 1.264 | features ' + A.fadesSrc,
  A.fadesSrc >= 30);

// ---------- A3: a fresh derivation reproduces the shipped field ----------
const city = JSON.parse(fs.readFileSync(new URL('../../packs/vaughan.json', import.meta.url), 'utf8'));
const subset = {};
for (const [nm, ways] of Object.entries(city.streets)) if (ways.some(w => w.some(p => p[0] >= 43.79 && p[0] <= 43.84 && p[1] >= -79.585 && p[1] <= -79.535))) subset[nm] = ways;
const A3 = await J(`(() => {
  const pack = ROUTE_PACKS.find(p => p.id === '5w');
  const all = ${JSON.stringify(subset)};
  const be = computeBoundaryEnds(pack.roads, all);
  const de = computeDeadEnds(pack.roads, all);
  const tot = o => Object.values(o).reduce((a, v) => a + v.length, 0);
  const deadStreets = Object.keys(de).sort();
  let maxOff = 0;
  for (const [k, v] of Object.entries(de)) for (const r of v) {
    const shipped = (pack.ends[k] || []).filter(s => s[4] === 10);
    const best = Math.min(...shipped.map(s => Math.hypot((s[0] - r[0]) * 111320, (s[1] - r[1]) * 85390)));
    if (isFinite(best)) maxOff = Math.max(maxOff, best);
  }
  return { b: tot(be), d: tot(de), deadStreets, maxOff };
})()`);
ok('A3 in-page derivation from the Vaughan library reproduces the field: 7 boundary + 8 dead, dead streets exact, every derived dead end within 2 m of its shipped record | ' + JSON.stringify(A3),
  A3.b === 7 && A3.d === 8 && JSON.stringify(A3.deadStreets) === JSON.stringify(['Angie', 'Bayside', 'Boddy', 'Dianawood', 'Ferrari', 'Julian', 'Tina', 'Topper']) && A3.maxOff <= 2);

// ---------- A4: the CREATE-shaped derivation (roads keyed by FULL street name) ----------
// A create draft keys its roads by the full name ('Tina Place'), which is also the
// extract's key - the street's own geometry must still count as its own at both
// filters (Codex P2 on PR #163: keyed this way, computeDeadEnds returned {}).
const A4 = await J(`(() => {
  const pack = ROUTE_PACKS.find(p => p.id === '5w');
  const all = ${JSON.stringify(subset)};
  const one = computeDeadEnds({ 'Tina Place': all['Tina Place'] }, all);
  const fullRoads = {};
  for (const k of Object.keys(pack.roads)) { const fk = Object.keys(all).find(m => m === k || m.startsWith(k + ' ')); if (fk) fullRoads[fk] = pack.roads[k]; }
  const de = computeDeadEnds(fullRoads, all);
  const tot = o => Object.values(o).reduce((a, v) => a + v.length, 0);
  const tina = (one['Tina Place'] || [])[0] || null;
  const shippedTina = (pack.ends['Tina'] || [])[0];
  const tinaOff = tina && shippedTina ? Math.hypot((tina[0] - shippedTina[0]) * 111320, (tina[1] - shippedTina[1]) * 85390) : -1;
  return { oneCount: tot(one), tinaOff, d: tot(de), deadStreets: Object.keys(de).sort() };
})()`);
ok('A4 CREATE-shaped input (full-name keys): the single-street Tina Place derivation yields its dead record at the shipped point, and the full route keyed by full names yields the same 8 dead ends | ' + JSON.stringify(A4),
  A4.oneCount === 1 && A4.tinaOff >= 0 && A4.tinaOff <= 2 && A4.d === 8 && JSON.stringify(A4.deadStreets) === JSON.stringify(['Angie Place', 'Bayside Court', 'Boddy Court', 'Dianawood Ridge', 'Ferrari Court', 'Julian Court', 'Tina Place', 'Topper Court']));

// ---------- B: names on top in create mode ----------
const orderBefore = await J(`(map.getStyle().layers || []).map(l => l.id).filter(id => !id.startsWith('cr'))`);
await ev(`(() => { enterCreate('pick'); return true; })()`);
await poll(`!!(typeof creating !== 'undefined' && creating)`, 15000);
await ev(`(() => { const pack = ROUTE_PACKS.find(p => p.id === '5w'); crAddStreet('Velmar', pack.roads['Velmar']); crAddStreet('Tina', pack.roads['Tina']); return true; })()`);
await poll(`!!(window.map && map.getLayer && map.getLayer('crDraftLineActive'))`, 15000);
await settle();
const B = await J(`(() => {
  const layers = (map.getStyle().layers || []).map(l => l.id);
  const firstLabel = layers.findIndex(id => { const l = map.getStyle().layers.find(x => x.id === id); return l && l.type === 'symbol' && l.layout && l.layout['text-field']; });
  const idx = id => layers.indexOf(id);
  return { firstLabel, draft: ['crDraftCase', 'crDraftLineDim', 'crDraftLine', 'crDraftLineActive', 'crDraftHit'].map(idx), glow: idx('crGlowShader') };
})()`);
ok('B1 every draft layer (and the trim glow) seats BELOW the first label layer | first label at ' + B.firstLabel + ', draft at ' + JSON.stringify(B.draft) + ', glow at ' + B.glow,
  B.firstLabel > -1 && B.draft.every(i => i > -1 && i < B.firstLabel) && (B.glow === -1 || B.glow < B.firstLabel));
await ev(`(() => { map.jumpTo({ center: [-79.564038, 43.812494], zoom: 17, pitch: 0 }); return true; })()`);
const bLive = await poll(`(() => { try { const seen = new Set(); for (const f of map.queryRenderedFeatures({ layers: ['roads_labels_major', 'roads_labels_minor'] })) { if (f.properties && f.properties.name) seen.add(f.properties.name); } return seen.has('Tina Place'); } catch (e) { return false; } })()`, 30000);
const B2 = await J(`(() => { let draftFeats = 0; try { draftFeats = map.queryRenderedFeatures({ layers: ['crDraftLine', 'crDraftLineActive'] }).length; } catch (e) {} return { draftFeats }; })()`);
ok('B2 over the chosen Tina (a dead-end street, picked into the draft): its basemap name PRINTS while the draft paint renders under it | name live ' + bLive + ', draft features ' + B2.draftFeats,
  bLive === true && B2.draftFeats >= 1);
await ev(`(() => { exitCreate(); return true; })()`);
await settle();
const orderAfter = await J(`(map.getStyle().layers || []).map(l => l.id).filter(id => !id.startsWith('cr'))`);
ok('B3 exit restores the normal stack exactly: the non-create layer order is unchanged and create mode is off | order equal ' + (JSON.stringify(orderBefore) === JSON.stringify(orderAfter)),
  JSON.stringify(orderBefore) === JSON.stringify(orderAfter));

// ---------- C: the Done flight ----------
await ev(`(() => { enterCreate('pick'); return true; })()`);
await poll(`!!(typeof creating !== 'undefined' && creating)`, 15000);
await ev(`(() => { const pack = ROUTE_PACKS.find(p => p.id === '5w'); for (const n of ['Velmar', 'Valeria', 'Dianawood', 'Ferrari']) crAddStreet(n, pack.roads[n]); map.jumpTo({ center: [-79.5605, 43.8145], zoom: 16.5, pitch: 0 }); return true; })()`);
await settle();
await ev(`(() => { document.getElementById('crDoneBtn').click(); return true; })()`);
await poll(`!!(window.map && !map.isMoving() && map.getPitch() < 1)`, 45000);
await settle();
const C = await J(`(() => {
  const sheet = document.getElementById('previewSheet');
  const sheetTop = sheet.getBoundingClientRect().top, sheetH = sheet.offsetHeight;
  const bb = computeRouteBox(crFilteredRoads());
  const fit = map.cameraForBounds([[bb.w, bb.s], [bb.e, bb.n]], { padding: { top: 56, left: 56, right: 56, bottom: sheetH + 24 } });
  const out = { pitch: map.getPitch(), zoom: map.getZoom(), fitZoom: fit.zoom, ctrOff: Math.hypot(map.getCenter().lng - fit.center.lng, map.getCenter().lat - fit.center.lat), sheetTop, outside: 0, pts: 0 };
  const W = map.getCanvas().clientWidth;
  for (const segs of Object.values(draft.roads)) for (const seg of segs) for (const p of seg) { const pr = map.project([p[1], p[0]]); out.pts++; if (pr.x < 12 || pr.x > W - 12 || pr.y < 12 || pr.y > sheetTop - 12) out.outside++; }
  return out;
})()`);
ok('C1 Done lands FLAT (pitch 0) on the sheet-aware fit: the landed zoom and centre are the fit recomputed in-page from the sheet\'s measured height (not the picking zoom 16.5, not the old full-screen fit) | pitch ' + C.pitch + ', zoom ' + C.zoom + ' vs fit ' + C.fitZoom + ', centre off ' + C.ctrOff,
  C.pitch < 1 && Math.abs(C.zoom - C.fitZoom) <= 0.1 && C.ctrOff < 0.001 && C.zoom < 16);
ok('C2 every draft point sits inside the VISIBLE region above the Review sheet at the landing - inside the canvas width and at least 12 px above the sheet\'s measured top edge and below the top edge (the whole draft in view before Save/Add/Start over, nothing behind the sheet) | sheet top ' + C.sheetTop + ', ' + C.outside + ' of ' + C.pts + ' points outside',
  C.pts > 100 && C.outside === 0);

// ---------- D: an empty draft fires no flight ----------
await ev(`(() => { exitCreate(); enterCreate('pick'); return true; })()`);
await poll(`!!(typeof creating !== 'undefined' && creating && draft && Object.keys(draft.roads).length === 0)`, 15000);
const cam0 = await J(`({ c: map.getCenter().toArray(), z: map.getZoom(), p: map.getPitch() })`);
await ev(`(() => { setCreateStage('preview'); return true; })()`);
await sleep(1500);
const cam1 = await J(`({ c: map.getCenter().toArray(), z: map.getZoom(), p: map.getPitch() })`);
ok('D1 empty draft: entering the preview moves nothing - centre, zoom and pitch identical | before ' + JSON.stringify(cam0) + ', after ' + JSON.stringify(cam1),
  Math.abs(cam0.c[0] - cam1.c[0]) < 1e-9 && Math.abs(cam0.c[1] - cam1.c[1]) < 1e-9 && cam0.z === cam1.z && cam0.p === cam1.p);
await ev(`(() => { exitCreate(); return true; })()`);

finish(R, proc);
