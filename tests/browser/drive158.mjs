// Beta 1.144 TEST-PREMISE UPDATE (Package C, DA-04): draft keys and sector state use the FULL map name now ('Long Road'); key reads below follow; display text still uses the short form.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCreateRig, serveRepo, makeResults, finishCreate, sleep } from './harness-create.mjs';

// drive158: Beta 1.129 - CREATE-FLOW ROUND 4 (Andrew's two remaining
// complaints from his 1.128 device session; sectors themselves now
// work on his phone).
//   A SECTOR CANCEL: entering sector mode (either door) snapshots the
//     street's pick as it stands; the bar's Cancel restores the
//     snapshot EXACTLY - a street trimmed this session goes back to
//     whole, a street that entered already trimmed goes back to THAT
//     trim (state, chosen length, row sub-line) - and leaves sector
//     mode. Done keeps the session's trims.
//   B THE ONE-OBJECT ANIMATION, measured at the failure property
//     (AGENTS.md design-QA rule: the property that can fail, not a
//     proxy - 1.127 and 1.128 both passed spring/face proxies while
//     the device motion was "slides down, disappears, a pill
//     appears"). A requestAnimationFrame sampler IN THE PAGE records
//     #createSheet's bounding box + computed background + opacity on
//     EVERY frame of collapse / expand / panel-to-sector-bar /
//     sector-bar-to-panel, and asserts: the surface (the one card -
//     in 1.129 #createSheet itself carries --card-solid) is visibly
//     present in EVERY frame; no edge teleports - stated as the
//     cadence-independent predicate below (monotonic edges + distinct
//     intermediate heights; the sampler's worst per-frame steps are
//     computed and REPORTED in the check names but are NOT part of
//     the pass predicate - Beta 1.130, re-scan N4: the 1.129
//     CHANGELOG's "per-frame movement bounded against total travel"
//     overstated this, and the failure names now also classify the
//     evidence: OBSERVED DISCONTINUITY vs INSUFFICIENT OBSERVATION);
//     the motion starts
//     at the from-rest box and lands on the to-rest box; and the
//     three resting boxes are the approved geometries (panel flush
//     full-width at the bottom; bar/sector bar inset 12px on the
//     sides and lifted 12px off the bottom). The no-teleport leg is
//     stated cadence-independently - every edge moves MONOTONICALLY
//     toward its rest and the surface's HEIGHT (the quantity the
//     spring drives) passes through DISTINCT intermediate values
//     between the two rests - because the headless rig starves rAF
//     unevenly (a traced panel-to-bar morph applied only 3 spring
//     steps in ~670 ms while other transitions sampled 60+ frames):
//     a raw per-frame step bound would grade the rig's frame rate,
//     not the app's motion, while a swap/teleport (the height takes
//     exactly the two rest values and nothing between, or an edge
//     reverses) fails at any cadence.
//   C the same sampling at NIGHT (body.night): the surface wears
//     the night --card-solid in every frame of collapse and expand.
// Red side (pristine 1.128 tree): A fails (no #crSbCancel exists),
// B/C fail by construction - #createSheet there is TRANSPARENT (the
// three faces carried their own cards), so the presence/background
// assertion fails on every frame, and the strip/sector resting
// boxes are the full-width sheet's, not the card's footprint.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { R, ok } = makeResults();

// ---- the synthetic extract (drive156/157's geography) ----
const way = (id, name, pts) => ({ type: 'way', id, tags: { name }, geometry: pts.map(p => ({ lat: p[0], lon: p[1] })) });
const LONG_PTS = []; for (let i = 0; i <= 20; i++) LONG_PTS.push([43.8, -79.58 + i * 0.001]);
const ELEMENTS = [way(9001, 'Long Road', LONG_PTS)];
[[-79.576, 'First Cross Street'], [-79.572, 'Second Cross Street'], [-79.568, 'Third Cross Street'], [-79.564, 'Fourth Cross Street']]
  .forEach(([lng, nm], k) => { const pts = []; for (let i = 0; i <= 8; i++) pts.push([43.796 + i * 0.001, lng]); ELEMENTS.push(way(9010 + k, nm, pts)); });
const COV_BOX = { s: 43.788, w: -79.582, n: 43.806, e: -79.558 };

// ---- static server + CDP rig (shared: harness-create.mjs; no routing table - the rig's default passthrough fulfil is this drive's historical fulfil verbatim) ----
const { server, ORIGIN } = await serveRepo(REPO);
const rig = await startCreateRig({ profile: '/tmp/d158profile-' + Date.now() });
const { proc, send, PAGE_S, ev2, poll, consoleLog, J, bootRoute } = rig;
const mouse = async (type, x, y) => { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, PAGE_S); };
const headTap = async () => {
  const g = await J(`(() => { const r = document.getElementById('crPanelHead').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 10) }; })()`);
  await mouse('mousePressed', g.x, g.y); await sleep(50); await mouse('mouseReleased', g.x, g.y);
};
const enterPickWithExtract = async () => {
  await ev2(`enterCreate('pick')`);
  await ev2(`crCovMerge(${JSON.stringify(ELEMENTS)}, ${JSON.stringify(COV_BOX)}); crPrepState = 'ready'; crRenderHint(); true`);
  return await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick' && !!crCov`, 10000);
};
const rowClick = async () => { await ev2(`(() => { const r = document.querySelector('#crPickList .crPRow'); if (r) r.click(); return true; })()`); return await poll(`crSectorStreet === 'Long Road'`, 10000); };
const clickCancel = async () => await J(`(() => { const b = document.getElementById('crSbCancel'); if (!b) return { exists: false }; const lbl = b.textContent; b.click(); return { exists: true, lbl }; })()`);
const rowSub = async () => await J(`(() => { const r = document.querySelector('#crPickList .crPRow'); return r ? (r.querySelector('.crPSub') || {}).textContent || '' : ''; })()`);
const settled = async () => await poll(`(typeof crMorph === 'undefined' || crMorph === null) && document.getElementById('createSheet').style.height === ''`, 12000);
const restRect = async () => await J(`(() => { const r = document.getElementById('createSheet').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; })()`);

await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
await bootRoute();
await ev2(`(() => { setThemeOverride(false); applyNight(); return true; })()`); // pin DAY through the app's own seam: the auto theme is sunset-driven, so an unpinned "day" run after sunset silently samples the night token (drive154's E3 lesson)

// ================= A: sector Cancel =================
const inA = await enterPickWithExtract();
await ev2(`pickStreet('Long Road', { lat: 43.8, lng: -79.574 })`);
await poll(`draft && !!draft.roads['Long Road']`, 10000);
// A1: trim this session, Cancel -> the whole road returns
const openA1 = await rowClick();
await ev2(`crSectorTap({ lat: 43.8, lng: -79.578 })`); // part 0 off
await ev2(`crSectorTap({ lat: 43.8, lng: -79.562 })`); // part 4 off
const trimA1 = await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 3`, 10000);
const ccA1 = await clickCancel();
const outA1 = await poll(`crSectorStreet === null`, 10000);
await settled();
const stA1 = await J(`({ sec: draft.sectors['Long Road'], mode: crSectorStreet, panel: getComputedStyle(document.getElementById('crPanel')).display, chosen: Math.round(crStreetChosenM('Long Road', computeStretches(draft.roads))) })`);
const subA1 = await rowSub();
ok('A1 CANCEL RESTORES THE ENTIRE ROAD: entered via the row, trimmed the two end sectors ([1,2,3]), Cancel restores the entry snapshot - no sector entry, the chosen length is the whole ~1,608 m again, the row reads "Entire road", sector mode closed and the panel is back | opened: ' + openA1 + ', trimmed: ' + trimA1 + ', cancel btn: ' + JSON.stringify(ccA1) + ', out: ' + outA1 + ' | ' + JSON.stringify(stA1) + ' | ' + subA1,
  inA === true && openA1 === true && trimA1 === true && ccA1.exists === true && ccA1.lbl === 'Cancel' && outA1 === true && stA1.sec === undefined && Math.abs(stA1.chosen - 1608) <= 4 && stA1.panel !== 'none' && subA1.indexOf('Entire road') === 0);
// A2: enter already trimmed, trim further, Cancel -> the ENTRY trim returns exactly
await rowClick();
await ev2(`crSectorTap({ lat: 43.8, lng: -79.578 })`);
await ev2(`crSectorTap({ lat: 43.8, lng: -79.562 })`);
await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 3`, 10000);
await ev2(`document.getElementById('crSbDone').click()`);
await poll(`crSectorStreet === null`, 10000);
await settled();
const openA2 = await rowClick(); // snapshot is now [1,2,3]
await ev2(`crSectorTap({ lat: 43.8, lng: -79.574 })`); // part 1 off -> [2,3]
const trimA2 = await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 2`, 10000);
await clickCancel();
const outA2 = await poll(`crSectorStreet === null`, 10000);
await settled();
const stA2 = await J(`({ sel: draft.sectors['Long Road'], chosen: Math.round(crStreetChosenM('Long Road', computeStretches(draft.roads))) })`);
const subA2 = await rowSub();
ok('A2 CANCEL RESTORES THE ENTRY TRIM, NOT THE ENTIRE ROAD: with [1,2,3] already saved by Done, re-entering and un-picking part 1 ([2,3]) then Cancel brings back exactly [1,2,3] - ~964 m, the row again reads "3 of 5 sectors" | opened: ' + openA2 + ', trimmed: ' + trimA2 + ', out: ' + outA2 + ' | ' + JSON.stringify(stA2) + ' | ' + subA2,
  openA2 === true && trimA2 === true && outA2 === true && JSON.stringify(stA2.sel) === '[1,2,3]' && Math.abs(stA2.chosen - 964) <= 8 && subA2.indexOf('3 of 5 sectors') === 0);
// A3: Done keeps the session's trims
await rowClick();
await ev2(`crSectorTap({ lat: 43.8, lng: -79.566 })`); // part 3 off -> [1,2]
const trimA3 = await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 2`, 10000);
await ev2(`document.getElementById('crSbDone').click()`);
const outA3 = await poll(`crSectorStreet === null`, 10000);
await settled();
const stA3 = await J(`({ sel: draft.sectors['Long Road'] })`);
ok('A3 DONE KEEPS THE TRIMS: un-picking part 3 inside the session and pressing Done leaves the selection at [1,2] - Done and Cancel are different doors | trimmed: ' + trimA3 + ', out: ' + outA3 + ' | ' + JSON.stringify(stA3),
  trimA3 === true && outA3 === true && JSON.stringify(stA3.sel) === '[1,2]');
// A4: the MAP door snapshots too
await ev2(`(() => { // drive157's tap-seam stub: a box query names Long Road under the tap
  if (!map.__qrfOrig) map.__qrfOrig = map.queryRenderedFeatures.bind(map);
  map.queryRenderedFeatures = (arg) => {
    if (!Array.isArray(arg)) return [];
    const cx = (arg[0][0] + arg[1][0]) / 2, cy = (arg[0][1] + arg[1][1]) / 2;
    const a = map.unproject([cx - 40, cy]); const b = map.unproject([cx + 40, cy]);
    return [{ type: 'Feature', sourceLayer: 'roads', properties: { name: 'Long Road' }, geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } }];
  };
  return true;
})()`);
await ev2(`crMapTap({ point: { x: 210, y: 450 }, lngLat: { lat: 43.8, lng: -79.574 } })`);
const openA4 = await poll(`crSectorStreet === 'Long Road'`, 10000);
await ev2(`(() => { if (map.__qrfOrig) { map.queryRenderedFeatures = map.__qrfOrig; delete map.__qrfOrig; } return true; })()`);
await ev2(`crSectorTap({ lat: 43.8, lng: -79.574 })`); // part 1 off -> [2]
const trimA4 = await poll(`!!draft.sectors['Long Road'] && draft.sectors['Long Road'].length === 1`, 10000);
await clickCancel();
const outA4 = await poll(`crSectorStreet === null`, 10000);
await settled();
const stA4 = await J(`({ sel: draft.sectors['Long Road'] })`);
ok('A4 THE MAP DOOR SNAPSHOTS TOO: entering sector mode by re-tapping the picked road on the map, un-picking part 1 ([2]), then Cancel restores the entry state [1,2] - the snapshot discipline is the entry\'s, not the door\'s | opened: ' + openA4 + ', trimmed: ' + trimA4 + ', out: ' + outA4 + ' | ' + JSON.stringify(stA4),
  openA4 === true && trimA4 === true && outA4 === true && JSON.stringify(stA4.sel) === '[1,2]');
await ev2(`exitCreate()`);

// ================= B: the one-object animation, frame by frame =================
await ev2(`(() => { // the in-page frame sampler: records the ONE surface's box + background + opacity on every rAF while armed
  window.__anim = { on: false, frames: [] };
  window.__animStart = () => { const a = window.__anim; a.frames = []; a.on = true; const el = document.getElementById('createSheet'); const probe = document.createElement('div'); probe.style.background = 'var(--card-solid)'; document.body.appendChild(probe); const token = getComputedStyle(probe).backgroundColor; probe.remove(); const step = () => { if (!a.on) return; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); a.frames.push({ l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, bg: cs.backgroundColor, op: parseFloat(cs.opacity), token, tm: performance.now() }); requestAnimationFrame(step); }; requestAnimationFrame(step); return true; };
  window.__animStop = () => { window.__anim.on = false; return window.__anim.frames; };
  return true;
})()`);
const analyse = (frames, from, to) => {
  const edges = ['l', 't', 'r', 'b'];
  const travel = {}; for (const e of edges) travel[e] = Math.abs(to[e] - from[e]);
  const worst = { l: 0, t: 0, r: 0, b: 0 };
  for (let i = 1; i < frames.length; i++) for (const e of edges) worst[e] = Math.max(worst[e], Math.abs(frames[i][e] - frames[i - 1][e]));
  const present = frames.length > 0 && frames.every(f => f.w > 0 && f.h > 0 && f.op > 0 && f.bg === f.token && f.token !== 'rgba(0, 0, 0, 0)');
  const f0 = frames[0] || {}, fN = frames[frames.length - 1] || {};
  const startOk = edges.every(e => Math.abs((f0[e] || 0) - from[e]) <= 3);
  const endOk = edges.every(e => Math.abs((fN[e] || 0) - to[e]) <= 2);
  let mono = true; // every edge approaches its rest without reversing (the closed-form spring cannot overshoot at v0 = 0; a swap-then-settle or a two-box hand-off can reverse an edge)
  for (const e of edges) { const dir = Math.sign(to[e] - from[e]); if (!dir) continue; for (let i = 1; i < frames.length; i++) { if ((frames[i][e] - frames[i - 1][e]) * dir < -1.5) mono = false; } }
  const hTravel = Math.abs(to.h - from.h); // continuity is proven on the HEIGHT - the quantity the spring actually drives, and the largest signal in the box (a traced starved morph's mid-applies land within a couple px of the ends on the top edge of a short trip, but their heights are unambiguous)
  const hLo = Math.min(from.h, to.h) + 0.5, hHi = Math.max(from.h, to.h) - 0.5;
  const intermediates = new Set(frames.map(f => Math.round(f.h * 20) / 20).filter(v => v > hLo && v < hHi)).size;
  const big = 'h';
  const jumpOk = mono === true && (hTravel < 20 || intermediates >= (hTravel >= 90 ? 2 : 1)); // a swap yields ZERO intermediate heights at any cadence; a spring, however starved, applies at least one genuine mid-trip height on a trip of 20px+
  const needInter = hTravel < 20 ? 0 : (hTravel >= 90 ? 2 : 1);
  const discontinuity = frames.length > 0 && (mono === false || present === false); // Beta 1.130 (re-scan N4): the failure EVIDENCE is classified, and no assertion changes - an edge reversing or the surface vanishing mid-flight is an OBSERVED DISCONTINUITY; too few frames / intermediate heights to tell a starved spring from a swap is INSUFFICIENT OBSERVATION (the rig's cadence, not the app's motion). `worst` stays a reported number only - it was never part of jumpOk, and the check names now say so
  const diag = discontinuity ? 'OBSERVED DISCONTINUITY' : ((frames.length < 5 || intermediates < needInter) ? 'INSUFFICIENT OBSERVATION' : 'CONTINUOUS, FULLY OBSERVED');
  return { n: frames.length, worst, travel, jumpOk, present, startOk, endOk, mono, intermediates, big, diag };
};
const runTransition = async (trigger) => { await ev2(`window.__animStart()`); await trigger(); await settled(); await sleep(150); return await J(`window.__animStop()`); };

const inB = await enterPickWithExtract();
await ev2(`pickStreet('Long Road', { lat: 43.8, lng: -79.574 })`);
await poll(`draft && !!draft.roads['Long Road']`, 10000);
await settled();
await headTap(); await settled(); // a warm-up collapse + expand, unsampled: the first transitions after boot ride over a still-rendering map and the rig's starved rAF would grade itself, not the app
await ev2(`document.getElementById('crReviewBtn').click()`); await settled();
const VW = 420, VH = 900;
const restPanel = await restRect();
// B1 collapse (panel -> bar), triggered by the real head tap
const frB1 = await runTransition(async () => { await headTap(); });
const restStrip = await restRect();
const anB1 = analyse(frB1, restPanel, restStrip);
ok('B1 COLLAPSE - ONE OBJECT, EVERY FRAME: ' + anB1.n + ' frames sampled; the surface is visibly present (real size, opacity, the --card-solid background) in EVERY frame; continuity = monotonic edges + distinct intermediate heights (per-frame steps REPORTED, not asserted - worst steps ' + JSON.stringify(anB1.worst) + ' vs travel ' + JSON.stringify(anB1.travel) + '), and the motion runs from the panel\'s rest box to the bar\'s | entered: ' + inB + ' | panel rest ' + JSON.stringify(restPanel) + ' | bar rest ' + JSON.stringify(restStrip) + ' | evidence class: ' + anB1.diag,
  inB === true && anB1.n >= 5 && anB1.present === true && anB1.jumpOk === true && anB1.startOk === true && anB1.endOk === true);
// B2 expand (bar -> panel) via Review
const frB2 = await runTransition(async () => { await ev2(`document.getElementById('crReviewBtn').click()`); });
const restPanel2 = await restRect();
const anB2 = analyse(frB2, restStrip, restPanel2);
ok('B2 EXPAND - THE SAME OBJECT BACK: ' + anB2.n + ' frames; present in every frame, monotonic with distinct intermediate heights (per-frame steps reported, not asserted: worst steps ' + JSON.stringify(anB2.worst) + '), lands back on the panel\'s rest box | panel rest ' + JSON.stringify(restPanel2) + ' | evidence class: ' + anB2.diag,
  anB2.n >= 5 && anB2.present === true && anB2.jumpOk === true && anB2.startOk === true && anB2.endOk === true);
// B0 the three resting geometries are the approved ones
const frB3 = await runTransition(async () => { await rowClick(); });
const restBar = await restRect();
const geoOk = Math.abs(restPanel.l) <= 1.5 && Math.abs(restPanel.r - VW) <= 1.5 && Math.abs(restPanel.b - VH) <= 1.5
  && Math.abs(restStrip.l - 12) <= 2 && Math.abs(restStrip.r - (VW - 12)) <= 2 && Math.abs(restStrip.b - (VH - 12)) <= 2
  && Math.abs(restBar.l - 12) <= 2 && Math.abs(restBar.r - (VW - 12)) <= 2 && Math.abs(restBar.b - (VH - 12)) <= 2
  && restStrip.h < restPanel.h - 60 && restBar.h > restStrip.h + 20;
ok('B0 THE RESTING BOXES ARE THE APPROVED GEOMETRIES: panel flush (left 0, right ' + VW + ', bottom ' + VH + '), the tucked bar and the sector bar both inset 12px at the sides and lifted 12px off the bottom, the bar slimmer than the panel and the sector bar taller than the bar | panel ' + JSON.stringify(restPanel) + ' | strip ' + JSON.stringify(restStrip) + ' | bar ' + JSON.stringify(restBar),
  geoOk === true);
// B3 panel -> sector bar was the transition sampled above (frB3), analysed against the rests
const anB3 = analyse(frB3, restPanel2, restBar);
ok('B3 PANEL TO SECTOR BAR - THE SECOND-TAP ENTRY ANDREW NAMED: ' + anB3.n + ' frames; the surface never leaves the screen, no edge reverses and the height passes through distinct intermediates (per-frame steps reported, not asserted: worst ' + JSON.stringify(anB3.worst) + ' vs travel ' + JSON.stringify(anB3.travel) + '), panel rest to sector-bar rest | legs ' + JSON.stringify({ present: anB3.present, jumpOk: anB3.jumpOk, mono: anB3.mono, inter: anB3.intermediates, big: anB3.big, startOk: anB3.startOk, endOk: anB3.endOk, badBg: frB3.filter(f => f.bg !== f.token).length }) + ' | from ' + JSON.stringify(restPanel2) + ' to ' + JSON.stringify(restBar) + ' f0 ' + JSON.stringify(frB3[0]) + ' fN ' + JSON.stringify(frB3[frB3.length - 1]) + ' | evidence class: ' + anB3.diag,
  anB3.n >= 5 && anB3.present === true && anB3.jumpOk === true && anB3.startOk === true && anB3.endOk === true);
// B4 sector bar -> panel via Done
const frB4 = await runTransition(async () => { await ev2(`document.getElementById('crSbDone').click()`); });
const restPanel3 = await restRect();
const anB4 = analyse(frB4, restBar, restPanel3);
ok('B4 SECTOR BAR BACK TO PANEL: ' + anB4.n + ' frames; present in every frame, monotonic with distinct intermediate heights (per-frame steps reported, not asserted: worst steps ' + JSON.stringify(anB4.worst) + '), lands on the panel rest' + ' | evidence class: ' + anB4.diag,
  anB4.n >= 5 && anB4.present === true && anB4.jumpOk === true && anB4.startOk === true && anB4.endOk === true);

// ================= C: the same at night =================
await ev2(`(() => { setThemeOverride(true); applyNight(); return true; })()`); // pin NIGHT through the same seam - a bare body.night class would fight the app's own theme state
await sleep(150);
const frC1 = await runTransition(async () => { await headTap(); });
const restStripN = await restRect();
const anC1 = analyse(frC1, restPanel3, restStripN);
ok('C1 COLLAPSE AT NIGHT: ' + anC1.n + ' frames; the surface wears the NIGHT --card-solid (' + (frC1[0] ? frC1[0].token : 'none') + ') in every frame and the continuity predicate holds (per-frame steps reported, not asserted: worst steps ' + JSON.stringify(anC1.worst) + ') | legs ' + JSON.stringify({ present: anC1.present, jumpOk: anC1.jumpOk, mono: anC1.mono, inter: anC1.intermediates, endOk: anC1.endOk, badBg: frC1.filter(f => f.bg !== f.token).length, badOp: frC1.filter(f => !(f.op > 0)).length, tokDiff: frC1[0] && frB1[0] ? frC1[0].token !== frB1[0].token : 'na' }) + ' | stripN ' + JSON.stringify(restStripN) + ' | evidence class: ' + anC1.diag,
  anC1.n >= 5 && anC1.present === true && anC1.jumpOk === true && anC1.endOk === true && !!frC1[0] && frC1[0].token !== frB1[0].token);
const frC2 = await runTransition(async () => { await ev2(`document.getElementById('crReviewBtn').click()`); });
const anC2 = analyse(frC2, restStripN, await restRect());
ok('C2 EXPAND AT NIGHT: ' + anC2.n + ' frames; night token in every frame, monotonic with distinct intermediate heights (per-frame steps reported, not asserted: worst steps ' + JSON.stringify(anC2.worst) + '), lands on the panel rest' + ' | evidence class: ' + anC2.diag,
  anC2.n >= 5 && anC2.present === true && anC2.jumpOk === true && anC2.endOk === true);
await ev2(`(() => { setThemeOverride(false); applyNight(); return true; })()`);
await ev2(`exitCreate()`);

R.exceptions = consoleLog.filter(l => l.indexOf('EXCEPTION') === 0);
finishCreate(R, proc, server, { pretty: true });
