import { launchDrive, bootThrough, finish } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// drive182: Beta 1.156 (Andrew device feedback, 2026-11-09) - the
// create flow's road-tap width is narrowed: the tap box halves go
// [16, 28] -> [12, 20] px (CR_TAP_BOXES, one literal for both tap
// handlers), and crSectorTap's geometry fallback - which through
// 1.155 was capped only at 75 METRES (~87 px at zoom 17), far looser
// than any box - is aligned to the same 20 px reach, judged in
// projected pixels (the 75 m rule stays as an absolute guard).
// Andrew: he could tap "pretty far to the right or left of a road"
// and still select it; the width must narrow while staying honestly
// tappable (the Beta 1.119 failure - point queries hitting nothing,
// "No road there" on every tap - must not come back: the two-step
// shape, first reach + one retry, is unchanged).
//
// THE SEAM: the battery's standing limit is that the basemap never
// readies in this rig, so queryRenderedFeatures is stubbed (the
// drive150/166 pattern). drive166's stub returns its roads for ANY
// box, which cannot grade a box width. This drive's stub is
// BOX-AWARE: it emulates the library's own query rule (MapLibre GL
// JS 4.7.1, LineStyleLayer.queryIntersectsFeature: the query box is
// tested against the line geometry buffered by half the layer's
// painted width) over the fixture extract's real geometry - buffer
// 0 for the fixture basemap roads, 12 for crDraftHit (its painted
// width is 24) - and rebuilds the sector features from the app's
// own crStreetParts, the same lines renderDraft draws. Probe taps
// are placed ON THE PERPENDICULAR at measured pixel distances
// (in-page search over the fixture lines at zoom 17; the square's
// diagonal never comes into it), and the measured distances ride
// in the check names. RED on 1.155 (CI, this round's record): P3,
// S2 and S3 fail there - a 24 px tap is inside the old 28 box, a
// 36 px sector tap is inside the old rendered reach (28 + 12), and
// the old 75 m fallback cap catches the muted 36 px tap (~31 m).
// FLOW NOTE (learned on this round's second RED attempt, run
// 42710835097): the pick probes run P1 -> P3 -> P2, P3 probing the
// street P2 is about to pick. A tap on an ALREADY-picked street
// opens its sector session (pickStreet routes there, Beta 1.128),
// and while a session is open every map tap speaks only to
// trimming (crMapTap's first line) - so a far-tap probe fired at a
// street an earlier probe already picked would poison every later
// pick. In this order each probe tap meets a street in the state
// the check claims: P3's street is unpicked on both colours, and
// on RED its own pick of that street is the failure recorded.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const FIXDATA = JSON.parse(fs.readFileSync(new URL('./fixtures/create-osm.json', import.meta.url), 'utf8'));
const elsByName = FIXDATA.overpass;
const JDATA = (() => {
  const byId = {};
  for (const k of Object.keys(elsByName)) for (const e of elsByName[k]) byId[e.id] = { name: k, geometry: e.geometry };
  return { byId };
})();
const ROADS = (() => { const o = {}; for (const k of Object.keys(elsByName)) o[k] = elsByName[k].map(w => w.geometry.map(g => [g.lon, g.lat])); return o; })();
const JCITY = [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8150', lon: '-79.5600', boundingbox: ['43.785', '43.845', '-79.610', '-79.5105'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada', country_code: 'ca' } }];
const installStub = `(() => {
  const DATA = ${JSON.stringify(JDATA)};
  const CITY = ${JSON.stringify(JCITY)};
  const prev = window.fetch.bind(window);
  const boxOf = raw => { const m = /\\(([-\\d.]+),([-\\d.]+),([-\\d.]+),([-\\d.]+)\\)/.exec(raw); return m ? { s: +m[1], w: +m[2], n: +m[3], e: +m[4] } : null; };
  const elsFor = raw => {
    const box = boxOf(raw); if (!box) return [];
    const nm = /"name"="([^"]+)"/.exec(raw);
    const out = [];
    for (const id of Object.keys(DATA.byId)) {
      const w = DATA.byId[id];
      if (nm && w.name !== nm[1]) continue;
      if (!nm && raw.indexOf('["highway"]') < 0) continue;
      if (w.geometry.some(g => g.lat >= box.s && g.lat <= box.n && g.lon >= box.w && g.lon <= box.e)) out.push({ type: 'way', id: +id, tags: { name: w.name }, geometry: w.geometry });
    }
    return out;
  };
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('nominatim.openstreetmap.org') >= 0) return Promise.resolve(new Response(JSON.stringify(CITY), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) {
      const raw = decodeURIComponent((opts && opts.body) || '').replace(/^data=/, '');
      return Promise.resolve(new Response(JSON.stringify({ elements: elsFor(raw) }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return prev(url, opts);
  };
  return true;
})()`;
// The box-aware feature stub + probe geometry (see the header).
const installFeatureStub = `(() => {
  if (!map.__qrfOrig) map.__qrfOrig = map.queryRenderedFeatures.bind(map);
  window.__qrfMute = false;
  const ROADS = ${JSON.stringify(ROADS)};
  const proj = c => { const p = map.project([c[0], c[1]]); return [p.x, p.y]; };
  const ptSeg = (pt, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; let t = L2 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy)); };
  const segRectDist = (a, b, r) => {
    const inR = p => p[0] >= r[0] && p[0] <= r[2] && p[1] >= r[1] && p[1] <= r[3];
    if (inR(a) || inR(b)) return 0;
    const segInt = (p1, p2, p3, p4) => { const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]); if (!d) return false; const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d, u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1; };
    const C = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
    for (let i = 0; i < 4; i++) if (segInt(a, b, C[i], C[(i + 1) % 4])) return 0;
    const ptRect = p => Math.hypot(Math.max(r[0] - p[0], 0, p[0] - r[2]), Math.max(r[1] - p[1], 0, p[1] - r[3]));
    let bd = Math.min(ptRect(a), ptRect(b));
    for (const c of C) bd = Math.min(bd, ptSeg(c, a, b));
    return bd;
  };
  const lineHits = (coords, box, buf) => { const r = [box[0][0], box[0][1], box[1][0], box[1][1]]; const px = coords.map(proj); for (let i = 1; i < px.length; i++) if (segRectDist(px[i - 1], px[i], r) <= buf) return true; return false; };
  map.queryRenderedFeatures = (box, opts) => {
    if (window.__qrfMute) return [];
    if (!Array.isArray(box)) return [];
    const layers = opts && opts.layers;
    if (layers && layers.indexOf('crDraftHit') >= 0) {
      const name = (typeof crSectorSession !== 'undefined' && crSectorSession.street) || null;
      if (!name || typeof crStreetParts !== 'function') return [];
      const rec = crStreetParts(name); if (!rec) return [];
      const out = [];
      rec.parts.forEach((part, i) => { const coords = part.map(p => [p[1], p[0]]); if (lineHits(coords, box, 12)) out.push({ type: 'Feature', properties: { name, sector: i }, geometry: { type: 'LineString', coordinates: coords } }); });
      return out;
    }
    const out = [];
    for (const n of Object.keys(ROADS)) for (const w of ROADS[n]) if (lineHits(w, box, 0)) out.push({ type: 'Feature', sourceLayer: 'roads', properties: { name: n }, geometry: { type: 'LineString', coordinates: w } });
    return out;
  };
  // ---- probe geometry: measured perpendicular offsets, in pixels ----
  const LINES = []; for (const n of Object.keys(ROADS)) for (const w of ROADS[n]) LINES.push({ name: n, coords: w });
  const lineDist = (pt, coords) => { let bd = Infinity; for (let i = 1; i < coords.length; i++) { const d = ptSeg(pt, proj(coords[i - 1]), proj(coords[i])); if (d < bd) bd = d; } return bd; };
  window.__distTo = (pt, name) => { let bd = Infinity; for (const L of LINES) { if (name && L.name !== name) continue; bd = Math.min(bd, lineDist(pt, L.coords)); } return bd; };
  window.__distExcept = (pt, name) => { let bd = Infinity; for (const L of LINES) { if (L.name === name) continue; bd = Math.min(bd, lineDist(pt, L.coords)); } return bd; };
  window.__probeFor = (name, target, tol, minOther) => {
    for (const L of LINES) {
      if (L.name !== name) continue;
      const px = L.coords.map(proj);
      for (let i = 1; i < px.length; i++) {
        const A = px[i - 1], B = px[i], dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy);
        if (len < 40) continue;
        for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75]) for (const s of [1, -1]) {
          const pt = [A[0] + dx * t + (-dy / len) * target * s, A[1] + dy * t + (dx / len) * target * s];
          const dMine = window.__distTo(pt, name); if (Math.abs(dMine - target) > tol) continue;
          const dOther = window.__distExcept(pt, name); if (dOther < minOther) continue;
          const ll = map.unproject(pt);
          return { x: pt[0], y: pt[1], lng: ll.lng, lat: ll.lat, dMine, dOther };
        }
      }
    }
    return null;
  };
  window.__partProbe = (name, target, tol, minOtherPart) => {
    const rec = crStreetParts(name); if (!rec) return null;
    const partsPx = rec.parts.map(part => part.map(p => { const q = map.project([p[1], p[0]]); return [q.x, q.y]; }));
    const distToPart = (pt, pi) => { let bd = Infinity; for (let i = 1; i < partsPx[pi].length; i++) bd = Math.min(bd, ptSeg(pt, partsPx[pi][i - 1], partsPx[pi][i])); return bd; };
    for (let pi = 0; pi < rec.parts.length; pi++) {
      for (let i = 1; i < partsPx[pi].length; i++) {
        const A = partsPx[pi][i - 1], B = partsPx[pi][i], dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy);
        if (len < 40) continue;
        for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75]) for (const s of [1, -1]) {
          const pt = [A[0] + dx * t + (-dy / len) * target * s, A[1] + dy * t + (dx / len) * target * s];
          const dMine = distToPart(pt, pi); if (Math.abs(dMine - target) > tol) continue;
          let dOthers = Infinity; for (let pj = 0; pj < rec.parts.length; pj++) { if (pj === pi) continue; dOthers = Math.min(dOthers, distToPart(pt, pj)); }
          if (dOthers < minOtherPart) continue;
          const ll = map.unproject(pt);
          return { x: pt[0], y: pt[1], lng: ll.lng, lat: ll.lat, part: pi, dMine, dOthers };
        }
      }
    }
    return null;
  };
  return true;
})()`;
const pickCityVaughan = async () => {
  await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
  await ev(`(() => { const i = document.getElementById('crCityInput'); i.value = 'Vaughan'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rows = await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 1`, 10000).catch(() => false);
  if (rows === true) await ev(`document.querySelector('#crCityResults .routeRow').click()`);
  return await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 10000).catch(() => false);
};
const fireTap = async (p) => { if (!p) return false; await ev(`(() => { const pt = map.project([${p.lng}, ${p.lat}]); map.fire('click', { lngLat: { lat: ${p.lat}, lng: ${p.lng} }, point: { x: pt.x, y: pt.y }, originalEvent: {} }); return true; })()`); return true; };
const chosenOf = () => J(`(() => { const rec = crStreetParts('Alderson Avenue'); return rec ? [...crChosenSet('Alderson Avenue', rec)].sort((a, b) => a - b) : []; })()`);
const allChosen = () => J(`(() => { const rec = crStreetParts('Alderson Avenue'); if (rec) crSetChosen('Alderson Avenue', rec, new Set(rec.parts.map((_, i) => i))); return rec ? rec.parts.length : 0; })()`);

// ---------- boot 5W, enter create, pick Vaughan, preparation ready ----------
await bootThrough(ev, poll);
const SETUP0 = await J(`({ names: STREETNAMES.slice() })`);
await ev(installStub);
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
const inPick = await pickCityVaughan();
const ready = await poll(`typeof crPrepState !== 'undefined' && crPrepState === 'ready'`, 30000).catch(() => false);
ok('setup: 5W loaded, Vaughan picked through the manual door and the preparation is ready', SETUP0.names.length === PACK5W.names && inPick === true && ready === true);

// ---------- camera + measured probe points ----------
await ev(installFeatureStub);
await ev(`map.jumpTo({ center: [-79.5745, 43.7993], zoom: 17 })`);
await poll(`typeof map !== 'undefined' && map && Math.abs(map.getZoom() - 17) < 0.01 && !map.isMoving()`, 15000);
const PROBES = await J(`({ a24: window.__probeFor('Alderson Avenue', 24, 1, 30), b10: window.__probeFor('Bordeaux Drive', 10, 1, 45), a17: window.__probeFor('Alderson Avenue', 17, 1, 30), zoom: map.getZoom() })`);
ok('setup: probe taps measured on the perpendicular at zoom 17 (Bordeaux 10 px, Alderson 24 px and 17 px; every cross-street distance clear of even the old box) | ' + JSON.stringify(PROBES),
  !!PROBES.a24 && !!PROBES.b10 && !!PROBES.a17 && Math.abs(PROBES.zoom - 17) < 0.01);

// ---------- P1: 10 px off PICKS (first box) ----------
await fireTap(PROBES.b10);
const gotB = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Bordeaux Drive']`, 15000).catch(() => false);
ok('P1 a tap 10 px off the Bordeaux line PICKS Bordeaux - inside the new first box (half 12), the fingertip case of Beta 1.119 still lands', gotB === true);

// ---------- P3: 24 px off the UNPICKED Alderson picks NOTHING ----------
await fireTap(PROBES.a24);
await sleep(600);
const P3 = await J(`({ streets: draft ? Object.keys(draft.roads) : null, toast: document.getElementById('toast').textContent })`);
ok('P3 a tap 24 px off the Alderson line picks NOTHING - beyond the new retry box (half 20; the old 28 caught it) | ' + JSON.stringify(P3),
  !!P3.streets && !P3.streets.includes('Alderson Avenue') && P3.toast.indexOf('No road there') >= 0);

// ---------- P2: 17 px off PICKS (the retry box) ----------
await fireTap(PROBES.a17);
const gotA = await poll(`typeof draft !== 'undefined' && draft && !!draft.roads['Alderson Avenue']`, 15000).catch(() => false);
ok('P2 a tap 17 px off the Alderson line PICKS Alderson - outside the first box (12), inside the new retry box (20): the two-step forgiveness survives the narrowing', gotA === true);

// ---------- sector section: Alderson, cut where Bordeaux meets it ----------
await ev(`crOpenSectors('Alderson Avenue')`);
const SEC = await J(`({ open: crSectorSession.street, parts: crStreetParts('Alderson Avenue') ? crStreetParts('Alderson Avenue').parts.length : 0 })`);
ok('S0 Alderson is open for trimming and computes to more than one sector in the fixture extract | ' + JSON.stringify(SEC), SEC.open === 'Alderson Avenue' && SEC.parts >= 2);
const SPROBES = await J(`({ s10: window.__partProbe('Alderson Avenue', 10, 1, 16), s36: window.__partProbe('Alderson Avenue', 36, 3, 33), s15: window.__partProbe('Alderson Avenue', 15, 1, 16) })`);
ok('setup: sector probe taps measured (10 px and 15 px off a sector line, 36 px off EVERY sector line) | ' + JSON.stringify(SPROBES), !!SPROBES.s10 && !!SPROBES.s36 && !!SPROBES.s15);

// ---------- S1: 10 px off a sector TOGGLES it (rendered pick) ----------
await fireTap(SPROBES.s10);
await poll(`( () => { const rec = crStreetParts('Alderson Avenue'); return rec && !crChosenSet('Alderson Avenue', rec).has(${SPROBES.s10 && SPROBES.s10.part}); } )()`, 10000).catch(() => false);
const S1 = await chosenOf();
ok('S1 a tap 10 px off a sector line TOGGLES that sector off - the rendered pick inside the new first box (reach 12 + 12 hit width) | chosen=' + JSON.stringify(S1) + ' probe=' + JSON.stringify(SPROBES.s10),
  !!SPROBES.s10 && !S1.includes(SPROBES.s10.part) && S1.length === SEC.parts - 1);
await allChosen();

// ---------- S2: 36 px off every sector toggles NOTHING ----------
await fireTap(SPROBES.s36);
await sleep(600);
const S2 = await chosenOf();
ok('S2 a tap 36 px off every sector line toggles NOTHING - beyond the new rendered reach (retry 20 + hit width 12 = 32; the old reach 28 + 12 = 40 caught it) | chosen=' + JSON.stringify(S2) + ' probe=' + JSON.stringify(SPROBES.s36),
  S2.length === SEC.parts);

// ---------- S3: renderer muted, 36 px off (~31 m) - the fallback must not catch it ----------
await ev(`window.__qrfMute = true`);
await fireTap(SPROBES.s36);
await sleep(600);
const S3 = await chosenOf();
await ev(`window.__qrfMute = false`);
ok('S3 with the renderer answering nothing, a tap 36 px off (~31 m) still toggles NOTHING - the geometry fallback now honours the same 20 px reach (through 1.155 its only cap was 75 m, which caught this tap) | chosen=' + JSON.stringify(S3),
  S3.length === SEC.parts);

// ---------- S4: renderer muted, 15 px off - the fallback lives ----------
await ev(`window.__qrfMute = true`);
await fireTap(SPROBES.s15);
await poll(`( () => { const rec = crStreetParts('Alderson Avenue'); return rec && !crChosenSet('Alderson Avenue', rec).has(${SPROBES.s15 && SPROBES.s15.part}); } )()`, 10000).catch(() => false);
const S4 = await chosenOf();
await ev(`window.__qrfMute = false`);
ok('S4 with the renderer answering nothing, a tap 15 px off a sector line still TOGGLES it - the fallback survives at honest range, inside the 20 px reach | chosen=' + JSON.stringify(S4) + ' probe=' + JSON.stringify(SPROBES.s15),
  !!SPROBES.s15 && !S4.includes(SPROBES.s15.part));

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
