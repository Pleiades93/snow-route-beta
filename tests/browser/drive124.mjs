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

const probe = async () => { const raw = await ev(`(() => { try {
  const src = map.getSource('gps'); const data = src && src._data;
  const feats = data && data.features ? data.features.map(f => f.properties.k) : null;
  const pt = map.project([dispPos[1], dispPos[0]]);
  const dotHits = map.queryRenderedFeatures(pt, { layers: ['gps-puck-blue', 'gps-puck-white'] }).length; // Beta 1.182: the rendered position marker is the extruded puck (gps-puck-blue over gps-puck-white) - the flat gps-dot circle is retired; the check's question is unchanged: is the marker RENDERED at the fix point
  const stack = map.queryRenderedFeatures(pt).map(f => f.layer.id);
  const lay = map.getLayer('gps-puck-blue');
  return JSON.stringify({ layerExists: !!lay, vis: lay ? map.getLayoutProperty('gps-puck-blue', 'visibility') : null, feats, dotHits, stack });
} catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`);
  return typeof raw === 'string' ? JSON.parse(raw) : { __err: 'non-string evaluate result' }; };

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
  const after = { gps: !!map.getSource('gps'), dotLayer: !!map.getLayer('gps-puck-blue') };
  if (after.gps) pushGps();
  return JSON.stringify({ before, callErr, after });
} catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`));
await sleep(400);
let P = await probe();
ok('G1 gps layers exist and the source carries the puck after a fix | diag ' + JSON.stringify(DIAG) + ' probe ' + JSON.stringify(P),
  P.layerExists && P.vis !== 'none' && Array.isArray(P.feats) && P.feats.includes('puckblue'));
ok('G2 the puck is actually rendered at the fix point | stack ' + JSON.stringify(P.stack), P.dotHits >= 1);

await ev(`(() => { togglePiece('Velmar', 0, 0); return true; })()`); // togglePiece is the real marking entry - an earlier draft called a setPiece that does not exist, so the rebuild was never actually exercised
await sleep(700);
P = await probe();
ok('G3 puck still rendered after marking (engine rebuild) | stack ' + JSON.stringify(P.stack), P.dotHits >= 1);

await ev(`(() => { document.body.classList.toggle('night'); setBasemap(); return true; })()`);
await poll120(`!!(map.getSource('centres') && map.getSource('gps'))`, 20000);
await sleep(800);
P = await probe();
ok('G4 puck still rendered after a basemap swap (restack) | ' + JSON.stringify(P), P.dotHits >= 1 && Array.isArray(P.feats) && P.feats.includes('puckblue'));

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

