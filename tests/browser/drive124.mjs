import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive118: audit remediation regression suite (spec 2026-10-29). Covers the gaps the older drives do not:
// invalid coverage indexes (F-2), invalid GPS fixes (G-1), coverage suggestion behaviour incl. parallel
// streets (spec GPS), restore write failure + rollback (suite 5), failed rollback verification (suite 6),
// invalid nested history (suite 3), current-format backup round-trip (suite 1), failed history write at
// finish (suite 11), partial multi-key save consistency (suite 12).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
await sleep(3000);

// drive120 (Stage 2, v1.0 plan): visual-geometry regression for the beta's CURRENT UI shapes.
// Every check measures the FAILURE property directly (overflow, overlap, out-of-bounds) in the
// rendered page at phone size, in both themes - never a proxy like a radius or a class name.
const RECTS = (sel) => `(() => [...document.querySelectorAll('${sel}')].filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }))()`;
const overlaps = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;
const inView = (r) => r.x >= -1 && r.y >= -1 && r.r <= 421 && r.b <= 901;
const noOverlap = (rs) => rs.every((a, i) => rs.every((b, j) => i === j || !overlaps(a, b)));
let A;

ok('G0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// GPS dot diagnostic (Andrew's phone report, 2026-10-30): fixes arrive and the
// camera follows, but the position dot does not show.
const FIX = JSON.parse(await ev(`(() => { const p = SAMPLES.Velmar[10]; return JSON.stringify({ lat: p[0], lng: p[1] }); })()`));
await ev('(() => { acceptFix({ coords: { latitude: ' + FIX.lat + ', longitude: ' + FIX.lng + ', accuracy: 10, speed: 0, heading: null }, timestamp: Date.now() }); return true; })()');
const dispOk = await poll120('dispPos && Math.abs(dispPos[0] - ' + FIX.lat + ') < 0.0002 && Math.abs(dispPos[1] - ' + FIX.lng + ') < 0.0002', 8000);
if (!dispOk) { R.checks.push(['SETUP dispPos reached the fed fix', false]); finish(R, proc); }
await sleep(600);
await ev(`(() => { window.__puckPx = () => new Promise(res => { if (!map || !dispPos) { res({ n: 0 }); return; } const go = () => { try { const cnv = map.getCanvas(); const dev = cnv.width / cnv.clientWidth; const pt = map.project([dispPos[1], dispPos[0]]); const W = Math.ceil(0.054 * cnv.clientWidth * dev * 1.7); const x0 = Math.max(0, Math.min(cnv.width - W, Math.round(pt.x * dev - W / 2))), y0 = Math.max(0, Math.min(cnv.height - W, Math.round(pt.y * dev - W / 2))); if (!window.__puckCv) window.__puckCv = document.createElement('canvas'); const c2 = window.__puckCv; c2.width = W; c2.height = W; const ctx = c2.getContext('2d', { willReadFrequently: true }); ctx.drawImage(cnv, x0, y0, W, W, 0, 0, W, W); const d = ctx.getImageData(0, 0, W, W).data; let n = 0, sx = 0, sy = 0; for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (d[i + 3] > 250 && Math.abs(d[i] - 44) <= 14 && Math.abs(d[i + 1] - 74) <= 14 && Math.abs(d[i + 2] - 210) <= 14) { n++; sx += x; sy += y; } } res({ n, off: n ? Math.max(Math.abs(sx / n + x0 - pt.x * dev), Math.abs(sy / n + y0 - pt.y * dev)) / dev : null }); } catch (e) { res({ err: String(e && e.message || e) }); } }; map.once('render', go); map.triggerRepaint(); }); return true; })()`); // Beta 1.188: the puck is a custom WebGL layer - invisible to queryRenderedFeatures and absent from the source's features - so "is the marker rendered at the fix" is answered from the frame's own pixels: the opaque #2C4AD2 core counted inside a window on the projected point, read in the map's render event while the drawing buffer is still valid. drive193 carries the full pixel battery (size freeze, silhouette, occlusion, flight sync).
const puckPx = async () => { const r = await ev(`window.__puckPx()`); return (typeof r === 'string') ? JSON.parse(r) : (r || {}); };

const probe = async () => { const raw = await ev(`(() => { try {
  const src = map.getSource('gps'); const data = src && src._data;
  const feats = data && data.features ? data.features.map(f => f.properties.k) : null;
  const pt = map.project([dispPos[1], dispPos[0]]);
  const stack = map.queryRenderedFeatures(pt).map(f => f.layer.id);
  const lay = map.getLayer('gps-puck-shader');
  return JSON.stringify({ layerExists: !!lay, vis: lay ? map.getLayoutProperty('gps-puck-shader', 'visibility') : null, feats, stack });
} catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`);
  const P0 = typeof raw === 'string' ? JSON.parse(raw) : { __err: 'non-string evaluate result' };
  P0.px = await puckPx(); // Beta 1.188: rendered-at-the-point evidence rides the probe - the marker's pixels, counted where the fix projects
  return P0; };

const BISECT = JSON.parse(await ev(`(() => { const steps = {};
  const run = (name, fn) => { try { fn(); steps[name] = 'ok'; } catch (e) { steps[name] = String(e && e.message || e).slice(0, 140); } };
  run('pickFont', () => pickFontFromStyle());
  run('glpInit', () => window.GLP.init(map));
  run('ref', () => addReferenceLayers());
  run('gps', () => addGpsLayers());
  run('trail', () => addTrailLayers());
  return JSON.stringify(steps); })()`));
ok('G0c onStyleReady step bisect | ' + JSON.stringify(BISECT), Object.values(BISECT).every(v => v === 'ok'));

const PRE = JSON.parse(await ev(`(() => JSON.stringify({
  centres: !!map.getSource('centres'), ref: !!map.getSource('ref'), gps: !!map.getSource('gps'), trail: !!map.getSource('trail'),
  refLine: !!map.getLayer('ref-line'), trailLine: !!map.getLayer('trail-line') }))()`));
ok('G0b layer-chain state at probe time | ' + JSON.stringify(PRE), PRE.gps === true);

const DIAG = JSON.parse(await ev(`(() => { try {
  const before = { centres: !!map.getSource('centres'), ref: !!map.getSource('ref'), gps: !!map.getSource('gps'), trail: !!map.getSource('trail') };
  let callErr = null; try { addGpsLayers(); } catch (e) { callErr = String(e && e.message || e); }
  const after = { gps: !!map.getSource('gps'), dotLayer: !!map.getLayer('gps-puck-shader') };
  if (after.gps) pushGps();
  return JSON.stringify({ before, callErr, after });
} catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`));
await sleep(400);
let P = await probe();
ok('G1 gps layers exist and the puck renders after a fix | diag ' + JSON.stringify(DIAG) + ' probe ' + JSON.stringify(P),
  P.layerExists && P.vis !== 'none' && P.px && P.px.n > 60);
ok('G2 the puck is actually rendered at the fix point | stack ' + JSON.stringify(P.stack) + ' px ' + JSON.stringify(P.px), P.px && P.px.n > 60 && P.px.off <= 3);

await ev(`(() => { togglePiece('Velmar', 0, 0); return true; })()`); // togglePiece is the real marking entry - an earlier draft called a setPiece that does not exist, so the rebuild was never actually exercised
await sleep(700);
P = await probe();
ok('G3 puck still rendered after marking (engine rebuild) | stack ' + JSON.stringify(P.stack) + ' px ' + JSON.stringify(P.px), P.px && P.px.n > 60 && P.px.off <= 3);

await ev(`(() => { document.body.classList.toggle('night'); setBasemap(); return true; })()`);
await poll120(`!!(map.getSource('centres') && map.getSource('gps'))`, 20000);
await sleep(800);
P = await probe();
ok('G4 puck still rendered after a basemap swap (restack) | ' + JSON.stringify(P), P.layerExists && P.px && P.px.n > 60 && P.px.off <= 3);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

