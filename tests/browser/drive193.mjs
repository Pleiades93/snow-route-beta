import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route

// drive193: the SHADER PUCK proof (Beta 1.188, Andrew's pick from the
// touchable demo). The puck is a custom WebGL layer now, not map
// geometry: queryRenderedFeatures cannot see it and the gps source
// carries no puck features, so every check here measures RENDERED
// PIXELS - the failure properties themselves (frozen size, tilt
// silhouette, building occlusion, camera sync, both themes), never a
// proxy. Pixel reads happen inside the map's own 'render' event (the
// drawing buffer is still valid in that synchronous window): a window
// around the projected fix is copied to a 2D canvas and classified.
// The puck's exact footprint is isolated by DIFFERENCE: one read with
// the layer visible, one with its layout visibility off (a style flip
// forces fresh frames; beam/ring are source features and cancel), then
// restored. The flip isolates exactly this layer's contribution.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
await sleep(3000);
ok('P0 app boots with the map active', await poll(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// ---- the pixel probe (page-side) ----
await ev(`(() => {
  window.__puckRead = () => new Promise(res => { // one classified read of the CURRENT frame's puck window
    if (!map || !dispPos) { res({ nodisp: true }); return; }
    const to = setTimeout(() => res({ err: 'probe timeout - no render within 6 s' }), 6000); // a starved probe FAILS its check; it never hangs the drive
    const go = () => { clearTimeout(to);
      try {
        const cnv = map.getCanvas();
        const dev = cnv.width / cnv.clientWidth;
        const D = 0.054 * cnv.clientWidth * dev; // the design diameter in device px
        const pt = map.project([dispPos[1], dispPos[0]]);
        const cx = pt.x * dev, cy = pt.y * dev;
        const W = Math.ceil(D * 2.1);
        const x0 = Math.max(0, Math.min(cnv.width - W, Math.round(cx - W / 2))), y0 = Math.max(0, Math.min(cnv.height - W, Math.round(cy - W / 2)));
        if (!window.__puckCv) window.__puckCv = document.createElement('canvas');
        const c2 = window.__puckCv; c2.width = W; c2.height = W;
        const ctx = c2.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(cnv, x0, y0, W, W, 0, 0, W, W);
        const d = ctx.getImageData(0, 0, W, W).data;
        let n = 0, minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, sx = 0, sy = 0;
        let bn = 0, bminx = 1e9, bmaxx = -1, bminy = 1e9, bmaxy = -1;
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
          const isCore = d[i + 3] > 250 && Math.abs(r - 44) <= 14 && Math.abs(g - 74) <= 14 && Math.abs(b - 210) <= 14; // the opaque #2C4AD2 core: beam (<=0.34 alpha) and ring (0.12/0.5 alpha) blends never land inside this tolerance
          if (isCore) { n++; sx += x; sy += y; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
          if (isCore || (b >= r + 4 && b >= 200 && r >= 195)) { bn++; if (x < bminx) bminx = x; if (x > bmaxx) bmaxx = x; if (y < bminy) bminy = y; if (y > bmaxy) bmaxy = y; } // the coin BODY: core + rim. The rim's gradient is a cool near-white (blue channel above red); the basemap's whites are neutral (b == r), its greens are darker, and the puck's own soft shadow is dark - all excluded, so bodyH is the coin's true silhouette with no shadow in it
        }
        res({ n, coreW: n ? maxx - minx + 1 : 0, coreH: n ? maxy - miny + 1 : 0, bodyW: bn ? bmaxx - bminx + 1 : 0, bodyH: bn ? bmaxy - bminy + 1 : 0, offX: n ? (sx / n + x0 - cx) / dev : null, offY: n ? (sy / n + y0 - cy) / dev : null, D, dev });
      } catch (e) { res({ err: String(e && e.message || e) }); }
    };
    map.once('render', go); map.triggerRepaint();
  });
  return true;
})()`);

// The footprint is measured as a Node-side pair of reads over a window
const foot = async () => {
  const F = await ev(`(async () => {
    if (!map || !dispPos) return { nodisp: true };
    const cnv = map.getCanvas(); const dev = cnv.width / cnv.clientWidth;
    const D = 0.054 * cnv.clientWidth * dev;
    const pt = map.project([dispPos[1], dispPos[0]]);
    const W = Math.ceil(D * 2.1);
    const x0 = Math.max(0, Math.min(cnv.width - W, Math.round(pt.x * dev - W / 2))), y0 = Math.max(0, Math.min(cnv.height - W, Math.round(pt.y * dev - W / 2)));
    const grab = (skipFirst) => new Promise(res => { const to = setTimeout(() => res(null), 6000); let skipped = false; const go = () => { if (skipFirst && !skipped) { skipped = true; map.once('render', go); map.triggerRepaint(); return; } clearTimeout(to); try { if (!window.__puckCv) window.__puckCv = document.createElement('canvas'); const c2 = window.__puckCv; c2.width = W; c2.height = W; const ctx = c2.getContext('2d', { willReadFrequently: true }); ctx.drawImage(cnv, x0, y0, W, W, 0, 0, W, W); res(Array.from(ctx.getImageData(0, 0, W, W).data)); } catch (e) { res(null); } }; map.once('render', go); map.triggerRepaint(); });
    const aWarm = await grab(false); if (!aWarm) return { err: 'warm grab failed' };
    const a = await grab(false); if (!a) return { err: 'grab a failed' }; // two visible grabs back to back: the first absorbs any tile still landing in the window, so the a/b pair straddles only the visibility flip
    let b = null; try { map.setLayoutProperty('gps-puck-shader', 'visibility', 'none'); b = await grab(true); } finally { map.setLayoutProperty('gps-puck-shader', 'visibility', 'visible'); map.triggerRepaint(); }
    if (!b) return { err: 'grab b failed' };
    let n = 0, ns = 0, minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, sminy = 1e9, smaxy = -1, sminx = 1e9, smaxx = -1;
    const ccx = pt.x * dev - x0, ccy = pt.y * dev - y0, RR = D * 0.72; // the puck + its soft shadow live within ~0.63 x D of the projected point; anything further out is the map, not the puck
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { if (Math.abs(x - ccx) > RR || Math.abs(y - ccy) > RR) continue; const i = (y * W + x) * 4; const dl = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (dl > 26) { n++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; } if (dl > 90) { ns++; if (x < sminx) sminx = x; if (x > smaxx) smaxx = x; if (y < sminy) sminy = y; if (y > smaxy) smaxy = y; } }
    return { n, w: n ? maxx - minx + 1 : 0, h: n ? maxy - miny + 1 : 0, ns, sw: ns ? smaxx - sminx + 1 : 0, sh: ns ? smaxy - sminy + 1 : 0, D, dev };
  })()`);
  return (typeof F === 'string') ? JSON.parse(F) : (F || {});
};
const core = async () => { const raw = await ev(`window.__puckRead()`); return typeof raw === 'string' ? JSON.parse(raw) : raw; };

// ---- setup: the replacement is real, and nothing draws before a fix ----
const L0 = await J(`({ shader: !!map.getLayer('gps-puck-shader'), white: !!map.getLayer('gps-puck-white'), blue: !!map.getLayer('gps-puck-blue'), disp: !!dispPos })`);
ok('P1 the shader layer replaced the extrusion pair | ' + JSON.stringify(L0), L0.shader === true && L0.white === false && L0.blue === false && L0.disp === false);

// ---- plant a fix (Velmar mid, no facing -> no beam; accuracy ring on) ----
const FIX = JSON.parse(await ev(`(() => { const part = STRETCH.Velmar.parts[0]; const mid = part[Math.floor(part.length / 2)]; return JSON.stringify({ lat: mid[0], lng: mid[1] }); })()`));
await ev(`(() => { watchId = 4242; followPaused = true; return true; })()`);
for (let i = 0; i < 8; i++) { await ev(`acceptFix({ coords: { latitude: ${FIX.lat}, longitude: ${FIX.lng}, accuracy: 1, speed: 0, heading: null }, timestamp: Date.now() })`); await sleep(150); } // accuracy 1: the accuracy ring still emits (gpsAccM > 0, so P2 stays honest) but its disc hides under the puck - at accuracy 10 its pale fill spans the probe window and its blue-leaning blend matches the rim classifier, corrupting the body silhouette
await sleep(500);
const kinds = await J(`((map.getSource('gps') || {})._data || { features: [] }).features.map(f => f.properties.k)`);
ok('P2 pushGps carries no puck features any more (beam/ring only) | kinds ' + JSON.stringify(kinds), Array.isArray(kinds) && !kinds.includes('puckwhite') && !kinds.includes('puckblue'));
const settle = async () => { await poll(`typeof map !== 'undefined' && !map.isMoving()`, 15000); await sleep(600); }; // camera settled + a beat for the frame: the puck is drawn from dispPos every render, tile state is irrelevant to it (a loaded() gate here made each cell wait out the tile stream)
await ev(`map.jumpTo({ center: [${FIX.lng}, ${FIX.lat}], zoom: 18, pitch: 0, bearing: 0 })`); await settle();
const C0 = await core();
ok('P3 the puck renders at the fix (opaque blue core found) | ' + JSON.stringify({ n: C0.n, coreW: C0.coreW, D: C0.D }), C0.n > 100 && Math.abs(C0.coreW - 0.62 * C0.D) <= 3);

// ---- W: width constancy across zoom x pitch (the 1.182 balloon, killed) ----
const cells = [];
for (const z of [14, 16, 18, 19]) for (const p of [0, 60]) {
  await ev(`map.jumpTo({ center: [${FIX.lng}, ${FIX.lat}], zoom: ${z}, pitch: ${p}, bearing: 0 })`); await settle();
  const c = await core(); const f = await foot();
  cells.push({ z, p, coreW: c.coreW, bodyH: c.bodyH, D: c.D, footW: f.w, footH: f.h, footS: f.sh, n: c.n, fn: f.n });
}
const coreSpread = Math.max(...cells.map(c => c.coreW)) - Math.min(...cells.map(c => c.coreW));
const coreOff = cells.map(c => Math.abs(c.coreW - 0.62 * c.D));
ok('W1 core width frozen at 0.62 x D at z14/16/18/19 x pitch 0/60 | cells ' + JSON.stringify(cells.map(c => [c.z, c.p, c.coreW])) + ' spread ' + coreSpread, cells.every(c => c.n > 60) && coreSpread <= 3 && coreOff.every(v => v <= 3));
const footSpread = Math.max(...cells.map(c => c.footW)) - Math.min(...cells.map(c => c.footW));
ok('W2 full footprint width frozen too | spread ' + footSpread + ' cells ' + JSON.stringify(cells.map(c => [c.z, c.p, c.footW])), cells.every(c => c.fn > 200) && footSpread <= 4);

// ---- T: tilt silhouette at pitch 60 = 0.50 x D, flat = 1.00 x D ----
// Measured on the diff footprint's STRONG channel (dl > 90): the exact
// layer isolation of foot(), restricted to swings only the OPAQUE coin
// body can make - the soft shadow (alpha <= 0.30) cannot swing any
// channel by 90, and no colour classifier is involved. (The first cut
// classified the body by rim colour in the raw frame: the rim's lit top
// is near-pure white (b == r, failing its own blue-lean test) and pale
// blue-grey basemap pixels pass it, so the flat height read 0.82 x D and
// the tilt height 1.32 x D off single stray pixels - the instrument was
// wrong, not the puck: the strong-diff body reads 1.013 flat / 0.507
// tilt, the design values. Debug record: puck-shader-build/debug-t1*.mjs.)
const flat = cells.find(c => c.z === 18 && c.p === 0), tilt = cells.find(c => c.z === 18 && c.p === 60), tilt19 = cells.find(c => c.z === 19 && c.p === 60);
const ratio = tilt ? tilt.footS / tilt.D : 0, flatRatio = flat ? flat.footS / flat.D : 0, ratio19 = tilt19 ? tilt19.footS / tilt19.D : 0;
ok('T1 coin silhouette at pitch 60 is ~0.50 x D and ~1.00 x D flat (strong-diff body heights: flat ' + (flat && flat.footS) + ' = ' + flatRatio.toFixed(3) + ' x D, tilt z18 ' + (tilt && tilt.footS) + ' = ' + ratio.toFixed(3) + ' x D, tilt z19 ' + (tilt19 && tilt19.footS) + ' = ' + ratio19.toFixed(3) + ' x D)', ratio >= 0.42 && ratio <= 0.58 && ratio19 >= 0.42 && ratio19 <= 0.58 && flatRatio >= 0.90 && flatRatio <= 1.12);

// ---- O: a 20 m building camera-side cannot cover it (was ~0 px) ----
await ev(`map.jumpTo({ center: [${FIX.lng}, ${FIX.lat}], zoom: 18, pitch: 60, bearing: 0 })`); await settle();
const OC = await core();
await ev(`(() => { const lat = ${FIX.lat}, lng = ${FIX.lng}; const cLat = lat - 8 / 111320, half = 8; const poly = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([sx, sy]) => [lng + sx * half / 80386, cLat + sy * half / 111320]); map.addSource('occl', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...poly].reverse()] }, properties: {} } }); map.addLayer({ id: 'occl-bldg', type: 'fill-extrusion', source: 'occl', paint: { 'fill-extrusion-color': '#ff0000', 'fill-extrusion-opacity': 1, 'fill-extrusion-height': 20, 'fill-extrusion-base': 0 } }, 'gps-beam'); return true; })()`);
await settle();
const OB = await core();
ok('O1 puck essentially whole behind a camera-side 20 m building | control core ' + OC.n + ' occluded core ' + OB.n, OC.n > 60 && OB.n >= 0.9 * OC.n);
await ev(`(() => { map.removeLayer('occl-bldg'); map.removeSource('occl'); return true; })()`); await settle();

// ---- F: glued to the projected point through an easeTo flight ----
await ev(`map.jumpTo({ center: [${FIX.lng}, ${FIX.lat}], zoom: 17, pitch: 0, bearing: 0 })`); await settle();
await ev(`(() => { window.__flight = []; window.__flightOn = true; if (!window.__flightHook) { window.__flightHook = true; map.on('render', () => { if (!window.__flightOn || !dispPos || window.__flight.length >= 60) return; try { const cnv = map.getCanvas(); const dev = cnv.width / cnv.clientWidth; const pt = map.project([dispPos[1], dispPos[0]]); const W = Math.ceil(0.054 * cnv.clientWidth * dev * 1.35); const x0 = Math.max(0, Math.min(cnv.width - W, Math.round(pt.x * dev - W / 2))), y0 = Math.max(0, Math.min(cnv.height - W, Math.round(pt.y * dev - W / 2))); if (!window.__puckCv) window.__puckCv = document.createElement('canvas'); const c2 = window.__puckCv; c2.width = W; c2.height = W; const ctx = c2.getContext('2d', { willReadFrequently: true }); ctx.drawImage(cnv, x0, y0, W, W, 0, 0, W, W); const d = ctx.getImageData(0, 0, W, W).data; window.__flightFrames = (window.__flightFrames || 0) + 1; if (window.__flightFrames % 3 !== 0) return; let n = 0, sx = 0, sy = 0; for (let y = 0; y < W; y += 2) for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4; if (d[i + 3] > 250 && Math.abs(d[i] - 44) <= 14 && Math.abs(d[i + 1] - 74) <= 14 && Math.abs(d[i + 2] - 210) <= 14) { n++; sx += x; sy += y; } } if (n > 12) window.__flight.push(Math.max(Math.abs(sx / n + x0 - pt.x * dev), Math.abs(sy / n + y0 - pt.y * dev)) / dev); } catch (e) {} }); } return true; })()`); // samples are taken page-side on EVERY rendered frame of the flight - polling from the driver missed frames entirely (CDP round-trip >> frame time). Stride-2 scan: a quarter of the per-frame cost, centroid still good to ~0.5 device px against a 3 css px gate
const cBefore = await J(`map.getCenter().toArray()`);
await ev(`map.easeTo({ center: [${FIX.lng + 0.0004}, ${FIX.lat}], duration: 8000 })`); // ~75 css px of camera travel at z17: a real flight the puck stays inside (the 0.0012 first cut travelled 224 css px at MapLibre's 512-px tile scale - the puck exited the west edge mid-flight, and the surviving in-frame samples, worst 0.33 css px over inter-frame travels up to 173 px, are what proved the glue; debug record: puck-shader-build/debug-f1.mjs)
await poll(`typeof map !== 'undefined' && !map.isMoving()`, 15000); await sleep(300);
await ev(`(() => { window.__flightOn = false; return true; })()`);
const samples = await J(`window.__flight || []`);
const framesSeen = await J(`window.__flightFrames || 0`);
const cAfter = await J(`map.getCenter().toArray()`);
const worst = samples.length ? Math.max(...samples) : 99;
const flown = Math.abs((cAfter[0] || 0) - (cBefore[0] || 0)) > 0.0002;
ok('F1 puck centroid stays on the projected point mid-flight | samples ' + JSON.stringify(samples.map(v => Math.round(v * 10) / 10)) + ' worst ' + worst.toFixed(2) + ' css px over ' + framesSeen + ' rendered frames, camera flown ' + flown, flown && samples.length >= 3 && worst <= 3);

// ---- N: night theme (restack) renders it too, same size ----
await ev(`map.jumpTo({ center: [${FIX.lng}, ${FIX.lat}], zoom: 18, pitch: 0, bearing: 0 })`); await settle();
await ev(`(() => { document.body.classList.add('night'); setBasemap(); return true; })()`);
await poll(`!!(map.getSource('gps') && map.getLayer('gps-puck-shader'))`, 20000); await settle();
const NC = await core();
ok('N1 night mode: shader puck renders after the basemap restack, core still 0.62 x D | ' + JSON.stringify({ n: NC.n, coreW: NC.coreW, D: NC.D }), NC.n > 60 && Math.abs(NC.coreW - 0.62 * NC.D) <= 3);
await ev(`(() => { document.body.classList.remove('night'); setBasemap(); return true; })()`);
await poll(`!!(map.getSource('gps') && map.getLayer('gps-puck-shader'))`, 20000); await settle();

// ---- V: visibility parity with the retired puck ----
await ev(`map.jumpTo({ center: [${FIX.lng}, ${FIX.lat}], zoom: 18, pitch: 0, bearing: 0 })`); await settle();
const before = await J(`((map.getSource('gps') || {})._data || { features: [] }).features.map(f => f.properties.k)`);
await ev(`(() => { watchId = null; pushGps(); return true; })()`); await sleep(400);
const afterKinds = await J(`((map.getSource('gps') || {})._data || { features: [] }).features.map(f => f.properties.k)`);
const VC = await core();
ok('V1 locate off: beam gone, puck still marks the last position (the 1.182 rule, unchanged) | before ' + JSON.stringify(before) + ' after ' + JSON.stringify(afterKinds) + ' core ' + VC.n, !afterKinds.includes('beam') && VC.n > 60);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
