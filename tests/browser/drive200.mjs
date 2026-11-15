import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCreateRig, serveRepo, makeResults, finishCreate, sleep } from './harness-create.mjs';

// drive200: Beta 1.204 acceptance - the driving road snap (display-only), proven on the
// SAME two real drives the map-matching study scored (the round-3 judging sessions,
// checked in as fixtures/gps-replay-sessions.json - the fixture drive197 replays;
// its fix rows' indices 0-5 are the judging decodes verbatim - replayed fix-by-fix
// through the SHIPPED acceptFix -> snapFix on the
// create rig, whose HTTP server lets the app fetch its real shipped Vaughan pack - the
// geometry the snap actually holds at runtime). Scoring geometry is the study's own
// Overpass ways for the two drives' boxes (fixtures/gps-snap-ways.json, generated from
// the study's cached responses), with the study's projector formulas, so the fractions
// below are directly comparable to the study's bars:
//   A (both drives): every fix reaches the matcher (snapFixN == fix count - the
//     denominator cannot shrink into a pass); engaged fixes' shown projection lands
//     within 3.5 m of the true road at >= the study's simulated rates (S1 159/162 =
//     0.98148, S2 532/537 = 0.99069); longest wrong-road lock <= 3 fixes (the sim's
//     definition: held street name != nearest way's name AND the raw fix is > 3 m
//     closer to the nearest way than to the held line); ZERO engagement on any fix
//     below the 4 m/s gate; the first engagement BLENDS (frame samples of the blend
//     weight cross intermediate values, never a teleport) and settles exactly onto the
//     projection; S2's real slow turn-in (the idx 319-347 stop approach) has the hold
//     released at the crossing fix and the shown point back within 0.5 m of the true
//     display point after 2 s of frames.
//   B (synthetic arm, labelled as such): with a hold LIVE, the real startClean() kills
//     it at the tap (held null, blend 0 before the clean's first fix), and 40 fast
//     highway fixes during the clean engage ZERO times while distance banking and the
//     trail record normally - the hard exit, proven against the shipped tap path.
//   C (the recorded-data invariant, A/B): the full S2 replay with the fix logger on,
//     then a clean started mid-drive and 120 more fixes recorded - run on a treatment
//     page (pack served, snapping verifiably engaged > 300 fixes) and a control page
//     (identical, with the snap index pinned empty in-page so snapping can never
//     engage; no data path touched). The logger's per-fix output rows, the trail, the
//     banked distance and the coverage map must be BYTE-IDENTICAL between the arms:
//     the snap reads nothing recorded and writes nothing recorded.
// Replay mechanics: drive197's (fake dual clock, renderTick stepped by each fix's real
// gap, acceptFix called directly), but BATCHED - each replay runs as one in-page loop
// evaluate. Measured on this rig: the in-page work is ~15 ms/fix, but every CDP
// evaluate queues behind the map's render loop (whose camera animations read the
// frozen fake clock and never complete, so the renderer stays busy), costing seconds
// per round trip - a per-fix draft of this drive ran past an hour locally while the
// identical batched loop runs in seconds of page time. Follow stays paused (the snap
// assertions are camera-independent) to keep the camera from queueing tile work.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FXS = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/browser/fixtures/gps-replay-sessions.json'), 'utf8'));
const S1 = FXS.s1;
const S2 = FXS.s2;
const WAYS = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/browser/fixtures/gps-snap-ways.json'), 'utf8'));
const { R, ok } = makeResults();
const dbg = m => { if (process.env.D200DBG) console.error('D200', m); };
const { server, ORIGIN } = await serveRepo(REPO);

// ---- fulfil: the generic passthrough (the create family's own form), with the
// control arm's pack failure switched by closure ----
function fulfilFor(packsOff) {
  return async (sessionId, p, H) => {
    const send = H.send;
    const url = p.request.url;
    try {
      const pn = new URL(url).pathname;
      if (packsOff && /\/packs\/[^/]+\.json$/.test(pn)) { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); return; }
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
      const buf = Buffer.from(await r.arrayBuffer());
      await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: r.status, responseHeaders: [{ name: 'Content-Type', value: r.headers.get('content-type') || 'application/octet-stream' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: buf.toString('base64') }, sessionId);
    } catch (e) { try { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); } catch (e2) {} }
  };
}

// ---- scoring (the study's projector: x = (lng - mlng) * 111320 * cos(mlat), y = (lat - mlat) * 110540) ----
function scorerFor(fixes, ways) {
  const mlat = fixes.reduce((a, f) => a + f[1], 0) / fixes.length;
  const mlng = fixes.reduce((a, f) => a + f[2], 0) / fixes.length;
  const kx = 111320 * Math.cos(mlat * Math.PI / 180), ky = 110540;
  const P = ll => [(ll[1] - mlng) * kx, (ll[0] - mlat) * ky];
  const segs = [];
  for (const [name, pts] of ways) for (let i = 0; i < pts.length - 1; i++) { const a = P(pts[i]), b = P(pts[i + 1]); segs.push({ name, ax: a[0], ay: a[1], bx: b[0], by: b[1] }); }
  const dSeg = (px, py, s) => { const vx = s.bx - s.ax, vy = s.by - s.ay, L2 = vx * vx + vy * vy; let t = L2 ? ((px - s.ax) * vx + (py - s.ay) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (s.ax + vx * t), py - (s.ay + vy * t)); };
  function nearest(ll) { const [px, py] = P(ll); let bd = Infinity, bn = null; for (const s of segs) { const d = dSeg(px, py, s); if (d < bd) { bd = d; bn = s.name; } } return { d: bd, name: bn }; }
  function distToPoly(ll, pts) { const [px, py] = P(ll); let bd = Infinity; for (let i = 0; i < pts.length - 1; i++) { const a = P(pts[i]), b = P(pts[i + 1]); const d = dSeg(px, py, { ax: a[0], ay: a[1], bx: b[0], by: b[1] }); if (d < bd) bd = d; } return bd; }
  function distLL(a, b) { const pa = P(a), pb = P(b); return Math.hypot(pa[0] - pb[0], pa[1] - pb[1]); }
  return { nearest, distToPoly, distLL };
}
function scoreReplay(fixes, samples, polyReg, ways) {
  const sc = scorerFor(fixes, ways);
  let eng = 0, within = 0, belowGateHeld = 0, cur = 0; const wrongRuns = [];
  for (let i = 0; i < fixes.length; i++) {
    const s = samples[i], spd = fixes[i][4];
    if (spd < 4 && s.pid >= 0) belowGateHeld++;
    if (s.pid >= 0 && s.proj) {
      eng++;
      if (sc.nearest(s.proj).d <= 3.5) within++;
      const fixLL = [fixes[i][1], fixes[i][2]];
      const dn = sc.nearest(fixLL), dh = sc.distToPoly(fixLL, polyReg[s.pid][1]);
      if (polyReg[s.pid][0] !== dn.name && (dh - dn.d) > 3) cur++; else { if (cur) wrongRuns.push(cur); cur = 0; }
    } else { if (cur) wrongRuns.push(cur); cur = 0; }
  }
  if (cur) wrongRuns.push(cur);
  return { eng, within, frac: eng ? within / eng : 0, longestWrong: wrongRuns.length ? Math.max(...wrongRuns) : 0, belowGateHeld };
}

// ---- rig plumbing (drive197's replay mechanics, batched in-page) ----
const CLOCK = `(() => { watchId = 4242; followPaused = true; window.__fakeT0 = Date.now(); window.__fakeNow = window.__fakeT0; const rp = performance.now(); Date.now = () => window.__fakeNow; performance.now = () => rp - 3600000 + (window.__fakeNow - window.__fakeT0); window.__polyReg = []; window.__polyMap = new Map(); window.__smpl = []; window.__snapSample = () => { let pid = -1; if (typeof snapHeld !== 'undefined' && snapHeld) { if (!window.__polyMap.has(snapHeld)) { window.__polyMap.set(snapHeld, window.__polyReg.length); window.__polyReg.push([snapHeld.name, snapHeld.pts]); } pid = window.__polyMap.get(snapHeld); } const pr = (typeof snapHeld !== 'undefined' && snapHeld && typeof snapProject === 'function' && dispPos) ? snapProject(dispPos) : null; const sh = dispShownPos(); return { pid, w: snapW, proj: pr && pr.slice(), shown: sh && sh.slice(), disp: dispPos && dispPos.slice(), n: snapFixN }; }; return true; })()`;
const RESET = `(() => { try { stopGps(); } catch (e) {} watchId = 4242; followPaused = true; smHeading = null; headF = null; lastHeadFixAt = 0; lastHeadFixPerf = 0; kf = null; gpsPos = null; dispPos = null; dispOff = [0, 0]; lastFixTs = 0; lastGood = null; lastFixAt = 0; gpsAccM = 0; facingDeg = null; dispHoldReset(); snapReset(); snapFixN = 0; runStart = null; gpsFromRun = false; trail = []; runDist = null; coveredIdx = {}; try { fixLogClose(); } catch (e) {} fixLog = []; fixLogCount = 0; fixLogSession = null; fixLogSetEnabled(false); window.__smpl = []; window.__polyReg = []; window.__polyMap = new Map(); return true; })()`;

function batchExpr(fixes, { hookIdx = -1, wantBlend = false } = {}) {
  const data = JSON.stringify(fixes.map(f => [f[0], f[1], f[2], f[3], f[4], f[5]]));
  const blend = wantBlend ? `if (!window.__blendTrace && s.pid >= 0 && (i === 0 || window.__smpl[window.__smpl.length - 2].pid < 0)) { const tr = [s.w]; for (let k = 0; k < 10; k++) { window.__fakeNow += 100; renderTick(performance.now()); tr.push(snapW); } window.__blendTrace = tr; }` : '';
  return `(() => { const FX = ${data}; let prevTs = null; window.__blendTrace = null; window.__hookSample = null;
    for (let i = 0; i < FX.length; i++) { const f = FX[i]; const gap = prevTs == null ? 0 : f[0] - prevTs; prevTs = f[0];
      const end = window.__fakeNow + gap; while (window.__fakeNow < end) { window.__fakeNow = Math.min(end, window.__fakeNow + 100); renderTick(performance.now()); }
      acceptFix({ coords: { latitude: f[1], longitude: f[2], accuracy: f[3], speed: f[4], heading: f[5] }, timestamp: f[0] });
      const s = window.__snapSample(); window.__smpl.push(s);
      ${blend}
      if (i === ${hookIdx}) { for (let k = 0; k < 40; k++) { window.__fakeNow += 50; renderTick(performance.now()); } window.__hookSample = window.__snapSample(); }
    } return true; })()`;
}
async function bootRig(packsOff, tag) {
  const rig = await startCreateRig({ profile: '/tmp/d200-' + tag + '-' + Date.now(), fulfil: fulfilFor(packsOff), jsonMode: 'coded' });
  await rig.send('Page.navigate', { url: ORIGIN + '/index.html' }, rig.PAGE_S);
  await rig.bootRoute();
  await rig.ev2(CLOCK);
  return rig;
}
async function replay(rig, fixes, opts = {}) {
  await rig.ev2(batchExpr(fixes, opts));
  return { samples: await rig.J(`window.__smpl`), polyReg: await rig.J(`window.__polyReg`), blendTrace: await rig.J(`window.__blendTrace`), hookSample: await rig.J(`window.__hookSample`) };
}
// stepFeed: one synthetic fix fed the way the estimator expects - the
// fake clock is stepped 1 s in 100 ms renderTick increments BEFORE the
// fix lands (batchExpr's pattern for the replays). Feeding fixes
// back-to-back without stepping starves the estimator (its dt is the
// page clock: five fixes at one frozen instant move the estimate a
// fraction of the way and the display track never converges), which
// silently corrupts any segment that reads dispPos or the blend.
async function stepFeed(rig, pt, acc, spd, hdg) {
  await rig.ev2(`(() => { lastFixTs = 0; for (let k = 0; k < 10; k++) { window.__fakeNow += 100; renderTick(performance.now()); } acceptFix({ coords: { latitude: ${pt[0]}, longitude: ${pt[1]}, accuracy: ${acc}, speed: ${spd}, heading: ${hdg} }, timestamp: window.__fakeNow }); return true; })()`);
}
async function warmIndex(rig, anchor) {
  for (let k = 0; k < 40; k++) {
    await rig.ev2(`(() => { acceptFix({ coords: { latitude: ${anchor[1]}, longitude: ${anchor[2]}, accuracy: ${anchor[3]}, speed: 5, heading: ${anchor[5]} }, timestamp: ${anchor[0] - 100000 + k * 1000} }); return true; })()`);
    if (await rig.ev2(`typeof snapGeo !== 'undefined' && !!snapGeo && snapGeo.polys.length > 500`)) return true;
    await sleep(500);
  }
  return false;
}
// A replay batch runs inside ONE synchronous evaluate, so an async pack
// build triggered mid-drive can never land inside it - whatever index
// exists at batch start serves the whole replay. Pack builds land
// between segments at wall-clock-dependent moments (and each install
// drops the hold), so an unsettled index makes a replay's engagement
// pattern a race: measured in this gate, the same S2 replay scored
// 537/537 engaged with the index settled and 495/504 with a 9-fix
// wrong lock when a neighbouring city's build landed between segments.
// settleIndex feeds one anchor fix (which triggers the build for the
// anchor's city) and polls until the installed index's key is exactly
// the want for that anchor and no build is in flight.
async function settleIndex(rig, anchor) {
  // The anchor fix is re-fed every poll: a feed that lands before the
  // pack catalogue installs only the route-only '~' index, and no build
  // for the anchor's city is ever triggered until the NEXT fix - a
  // single feed can leave the poll waiting on a build nobody started.
  let st = { settled: false, key: '', want: '', busy: true, fail: '' };
  for (let k = 0; k < 120; k++) {
    // Each poll also steps the page's fake clock forward 5 s: the app's
    // failed-pack cooldown is stamped in page time, and a poll that
    // never advances the clock would wait out a 60 s cooldown forever
    // (measured in this gate: one transient pack failure before the T1
    // settle froze the retry for the whole poll).
    await rig.ev2(`(() => { lastFixTs = 0; acceptFix({ coords: { latitude: ${anchor[1]}, longitude: ${anchor[2]}, accuracy: ${anchor[3]}, speed: 5, heading: ${anchor[5]} }, timestamp: ${anchor[0] - 100000 + k * 1000} }); window.__fakeNow += 5000; renderTick(performance.now()); return true; })()`);
    st = await rig.J(`(() => { const slug = (typeof snapSlugFor === 'function') ? snapSlugFor([${anchor[1]}, ${anchor[2]}]) : null; const want = slug === null ? '(catalogue in flight)' : (((typeof activeRoute !== 'undefined' && activeRoute && activeRoute.id) || '') + '|' + slug); return { settled: !!snapGeo && slug !== null && snapGeo.key === want && !snapGeoBusy, key: snapGeo ? snapGeo.key : '(none)', want, busy: !!snapGeoBusy, fail: snapGeoFailSlug }; })()`);
    if (st.settled) return st;
    await sleep(500);
  }
  return st;
}
const startCleanWrapped = rig => rig.J(`(() => { try { startClean(); return { threw: false, runStart, held: typeof snapHeld !== 'undefined' ? !!snapHeld : 'undef', w: snapW }; } catch (e) { return { threw: true, err: String(e && e.message || e), runStart: typeof runStart !== 'undefined' ? runStart : null, held: typeof snapHeld !== 'undefined' ? !!snapHeld : 'undef', w: typeof snapW !== 'undefined' ? snapW : -1 }; } })()`);

// ================= treatment rig =================
dbg('boot trt');
const rig = await bootRig(false, 'trt');
dbg('boot trt done');
const warmed = await warmIndex(rig, S1[100]);
dbg('warm done');
const geoInfo = await rig.J(`({ polys: snapGeo ? snapGeo.polys.length : -1, key: snapGeo ? snapGeo.key : '' })`);
ok('T0 DATA PATH: the shipped Vaughan pack loads through the app\'s own loader and the snap index installs (route streets + pack runs) | ' + JSON.stringify(geoInfo), warmed === true && geoInfo.polys > 500);

// ---- phase A1: S1 (arterial drive) ----
const stA1 = await settleIndex(rig, S1[100]);
ok('SETUP: the snap index is settled for S1 before its replay batch | ' + JSON.stringify(stA1), stA1.settled === true);
await rig.ev2(RESET);
dbg('A1');
const a1 = await replay(rig, S1, { wantBlend: true });
dbg('A1 done');
const sc1 = scoreReplay(S1, a1.samples, a1.polyReg, WAYS.s1);
ok(`A1 S1 PROCESSED: all 218 fixes reached the matcher (snapFixN ${a1.samples[a1.samples.length - 1].n})`, a1.samples[a1.samples.length - 1].n === 218);
ok(`A1 S1 WITHIN 3.5 m: ${sc1.within}/${sc1.eng} engaged = ${sc1.frac.toFixed(5)} (study bar 0.98148)`, sc1.frac >= 0.98148 && sc1.eng >= 150);
ok(`A1 S1 WRONG-ROAD LOCK: longest ${sc1.longestWrong} fixes (bar <= 3)`, sc1.longestWrong <= 3);
ok(`A1 S1 SPEED GATE: engagements on sub-4 m/s fixes: ${sc1.belowGateHeld} (bar 0)`, sc1.belowGateHeld === 0);
const bt = a1.blendTrace || [];
const btMid = bt.filter(w => w > 0.02 && w < 0.98).length;
const btMono = bt.every((w, i) => i === 0 || w >= bt[i - 1] - 1e-9);
ok(`A1 NO POPPING: the first engagement's blend crosses ${btMid} intermediate weights, monotonic ${btMono}, settling at ${bt.length ? bt[bt.length - 1].toFixed(3) : 'n/a'} (bar: >= 3 intermediate, monotonic, >= 0.9) | trace ${bt.map(w => w.toFixed(2)).join(',')}`, btMid >= 3 && btMono && bt.length > 0 && bt[bt.length - 1] >= 0.9);
const sc1b = scorerFor(S1, WAYS.s1);
const settled = a1.samples.find(s => s.pid >= 0 && s.w >= 0.999 && s.proj && s.shown);
ok('A1 BLEND SETTLES ON THE CENTRELINE: a fully blended shown point equals the projection (< 0.01 m)', !!settled && sc1b.distLL(settled.shown, settled.proj) < 0.01);


// ---- T1: the projection seed (pin for the PR #51 Codex P1, second round) ----
// Engagement must seed snapProject's window from the nearest search's
// own segment. The defect, reproduced in review and re-measured offline
// against the shipped pack: this fix sits ON segment 35 of Woodland
// Acres Crescent's 75-point run (distance 0.0 m), while the windowed
// projection from a hint of 0 accepted segment 3 - 813.6 m away - and
// the full-line distance check reads the true distance (0), so the bad
// projection could never release.
const stT1 = await settleIndex(rig, [1760000000000, 43.89023765, -79.47968195, 10, 20, 0]);
ok('SETUP: the snap index is settled for the T1 street before its feeds | ' + JSON.stringify(stT1), stT1.settled === true);
await rig.ev2(RESET);
const T1FIX = [43.89023765, -79.47968195];
for (let k = 0; k < 6; k++) await stepFeed(rig, T1FIX, 10, 20, 0);
const t1 = await rig.J(`({ held: typeof snapHeld !== 'undefined' && !!snapHeld, name: snapHeld ? snapHeld.name : '', proj: (typeof snapProject === 'function' && dispPos) ? snapProject(dispPos) : null, disp: dispPos && dispPos.slice(), hd: (typeof snapHeld !== 'undefined' && snapHeld && dispPos) ? snapHeldDist(dispPos) : -1 })`);
const t1gap = t1.proj && t1.disp ? sc1b.distLL(t1.proj, t1.disp) : -1;
ok(`T1 PROJECTION SEED: a fix ON Woodland Acres Crescent engages '${t1.name}' and its projection sits ${t1gap.toFixed(1)} m from the display point (bar < 5 m; the unseeded window landed 813.6 m away) with the full-line distance ${t1.hd.toFixed(1)} m`, t1.held && t1gap >= 0 && t1gap < 5 && t1.hd >= 0 && t1.hd < 5);

// ---- phase A1c: the switch blend (pin for the PR #51 Codex P2, second round) ----
// A rival switch at full blend must ease across, not teleport: two
// synthetic parallel roads 8 m apart stand in as the index (the real
// index object is saved and restored around the segment). Fixes on A
// blend fully; three fixes on B win the rival vote; at the switch the
// shown point must still sit on A (the anchor), then walk to B over the
// frames with no per-frame step near the 8 m the defect jumped.
await rig.ev2(RESET);
const swSetup = await rig.J(`(() => { const a = [${T1FIX[0]}, ${T1FIX[1]}]; const want = snapGeo ? snapGeo.key : 'synthetic'; const dLat = 8 / MLAT, step = 15 / MLNG; const mk = off => { const pts = []; for (let i = 0; i < 9; i++) pts.push([a[0] + off, a[1] - 4 * step + i * step]); return pts; }; window.__savedGeo = snapGeo; window.__swA = mk(0); window.__swB = mk(dLat); window.__swC = mk(30 / MLAT); snapGeo = snapBuildIndex([{ name: 'Switch A', pts: window.__swA }, { name: 'Switch B', pts: window.__swB }, { name: 'Switch C', pts: window.__swC }], want); return { keyOk: snapGeo.key === want }; })()`);
ok('A1 SWITCH BLEND SETUP: the synthetic two-road index installs under the settled index\'s own key, so snapGeoEnsure never rebuilds it mid-segment (the real index is saved for restore)', swSetup.keyOk === true);
if (swSetup.keyOk) {
  const feedPt = async (pt, k) => stepFeed(rig, pt, 10, 15, 90);
  const frames = async (n, ms) => rig.ev2(`(() => { for (let k = 0; k < ${n}; k++) { window.__fakeNow += ${ms}; renderTick(performance.now()); } return true; })()`);
  const swA = await rig.J(`window.__swA`), swB = await rig.J(`window.__swB`);
  let fk = 0;
  for (const vi of [2, 3, 4, 5]) await feedPt(swA[vi], fk++);
  await frames(60, 50);
  for (const vi of [5, 6]) await feedPt(swB[vi], fk++);
  await frames(10, 50);
  const preSw = await rig.J(`({ held: snapHeld ? snapHeld.name : '', w: snapW, shown: dispShownPos() })`);
  await feedPt(swB[7], fk++);
  await frames(3, 16);
  const postSw = await rig.J(`({ held: snapHeld ? snapHeld.name : '', shown: dispShownPos() })`);
  const walk = await rig.J(`(() => { const ser = []; for (let k = 0; k < 240; k++) { window.__fakeNow += 16; renderTick(performance.now()); const sh = dispShownPos(); ser.push([snapW, sh ? sh[0] : null, sh ? sh[1] : null]); } return { tr: ser, shown: dispShownPos() }; })()`);
  // Accuracy gate on the drop-and-reengage (pin for the PR #51 Codex P2,
  // fourth round): the fresh take after a drop must pass the same
  // acc <= SNAP_ACC_M gate as the from-free engage. Road C sits 30 m
  // from A (past SNAP_DROP_M from a hold on A, on top of C itself), so a
  // fix on C forces the drop-and-reengage branch deterministically.
  const swC = await rig.J(`window.__swC`);
  await rig.ev2(RESET);
  await feedPt(swA[4], fk++);
  const accPre = await rig.J(`snapHeld ? snapHeld.name : ''`);
  await stepFeed(rig, swC[4], 60, 15, 90); fk++;
  const accMid = await rig.J(`snapHeld ? snapHeld.name : ''`);
  await stepFeed(rig, swC[4], 10, 15, 90); fk++;
  const accPost = await rig.J(`snapHeld ? snapHeld.name : ''`);
  ok(`A1 ACC GATE ON RE-ENGAGE: holding '${accPre}' from a good fix, a 60 m-accuracy fix on road C (30 m away) drops the hold and takes NOTHING (held '${accMid}'; the ungated branch locked C), and the same fix at 10 m accuracy then engages '${accPost}'`, accPre === 'Switch A' && accMid === '' && accPost === 'Switch C');
  // Evidence-timeout hysteresis (pin for the PR #51 Codex P2, fifth
  // round): a one-road index; fixes run 11 m alongside road A - inside
  // the 12 m engage gate, past the 10 m evidence line. The timeout must
  // release A and NOT re-take it on the next identical fix (the defect
  // loops on a ~6-fix cycle, sweeping the puck sideways); a fix at 5 m
  // (evidence improved) re-admits it.
  await rig.ev2(`(() => { snapGeo = snapBuildIndex([{ name: 'Switch A', pts: window.__swA }], snapGeo.key); return true; })()`);
  await rig.ev2(RESET);
  const offPt = (pt, m) => [pt[0] + m / 111320, pt[1]];
  const feedOff = async (m) => { fk++; await stepFeed(rig, offPt(swA[4], m), 10, 15, 90); };
  const heldName = () => rig.J(`snapHeld ? snapHeld.name : ''`);
  await feedOff(11);
  const hyEngaged = await heldName();
  for (let k = 0; k < 5; k++) await feedOff(11);
  const hyDropped = await heldName();
  await feedOff(11);
  const hyRejected = await heldName();
  await feedOff(5);
  const hyReadmitted = await heldName();
  ok(`A1 TIMEOUT HYSTERESIS: fixes 11 m alongside road A engage it ('${hyEngaged}'), the evidence timeout releases it (held '${hyDropped}'), the next 11 m fix does NOT re-take it (held '${hyRejected}'; the unguarded gate loops the timeout), and a 5 m fix re-admits it ('${hyReadmitted}')`, hyEngaged === 'Switch A' && hyDropped === '' && hyRejected === '' && hyReadmitted === 'Switch A');
  // Release blend, both arms (pins for the PR #51 Codex P2, first and
  // third rounds), in deterministic synthetic form: fixes run PARALLEL
  // to road A at a fixed 6 m offset, so the display track converges to
  // a steady 6 m offset from the line and the blend has a known
  // distance to walk. (The original S1-window form's offset rode the
  // estimator's state - measured 1.2-2.8 m across runs on the same
  // window - and its step measure inherited the track's own correction
  // jumps; the synthetic form's offset is geometry, not estimator
  // weather. Steps are measured on the OFFSET (shown minus display
  // track): the blend owns the offset's motion, not the track's.)
  await rig.ev2(`(() => { snapGeo = snapBuildIndex([{ name: 'Switch A', pts: window.__swA }, { name: 'Switch B', pts: window.__swB }, { name: 'Switch C', pts: window.__swC }], snapGeo.key); return true; })()`);
  await rig.ev2(RESET);
  const feedPar = async (vi, spd) => { fk++; await stepFeed(rig, offPt(swA[vi], -6), 10, spd, 90); return offPt(swA[vi], -6); }; // 6 m SOUTH of A: the north side is B's territory (8 m north of A, so a north parallel track sits 2 m from B and the matcher correctly holds B instead - measured in this gate)
  for (const vi of [2, 3, 4, 5, 6]) await feedPar(vi, 15);
  await frames(30, 50); // 1.5 s: the weight fully settles (residual ~0.01) while the prediction coast (~22 m) stays on road A's span - a 3 s coast runs past its end and clamps the projection to the endpoint
  const rPre = await rig.J(`({ w: snapW, held: !!snapHeld, shown: dispShownPos(), disp: dispPos && dispPos.slice() })`);
  const rOff = rPre.shown && rPre.disp ? sc1b.distLL(rPre.shown, rPre.disp) : -1;
  const rLast = offPt(swA[6], -6);
  const rRel = await rig.J(`(() => { const ser = []; acceptFix({ coords: { latitude: ${rLast[0]}, longitude: ${rLast[1]}, accuracy: 10, speed: 1.0, heading: 90 }, timestamp: window.__fakeNow }); for (let k = 0; k < 240; k++) { window.__fakeNow += 16; renderTick(performance.now()); const sh = dispShownPos(); ser.push([snapW, sh ? sh[0] : null, sh ? sh[1] : null, dispPos ? dispPos[0] : null, dispPos ? dispPos[1] : null]); } return { ser, held: !!snapHeld, shown: dispShownPos(), disp: dispPos && dispPos.slice() }; })()`);
  const rOffs = rRel.ser.filter(t => t[1] != null && t[3] != null).map(t => [t[1] - t[3], t[2] - t[4]]);
  const rPreOff = rPre.shown && rPre.disp ? [rPre.shown[0] - rPre.disp[0], rPre.shown[1] - rPre.disp[1]] : null;
  const rAll = rPreOff ? [rPreOff, ...rOffs] : rOffs;
  let rMax = 0; for (let i = 1; i < rAll.length; i++) { const d = Math.hypot((rAll[i][0] - rAll[i - 1][0]) * 111320, (rAll[i][1] - rAll[i - 1][1]) * 80386); if (d > rMax) rMax = d; }
  const rMid = rRel.ser.filter(t => t[0] > 0.05 && t[0] < 0.95).length;
  const rEnd = rRel.shown && rRel.disp ? sc1b.distLL(rRel.shown, rRel.disp) : -1;
  ok(`A1 RELEASE BLEND: driving 6 m parallel to road A blends fully (w ${rPre.w.toFixed(2)}, offset ${rOff.toFixed(1)} m); one 1.0 m/s fix releases and the shown point EASES OUT - max per-frame OFFSET step ${rMax.toFixed(2)} m (bar < 1.0 m), ${rMid} frames at intermediate weights (bar >= 3), ending ${rEnd.toFixed(3)} m from the true point (bar < 0.05 m), hold gone ${!rRel.held}`, rPre.held && rPre.w >= 0.95 && rOff >= 3 && !rRel.held && rMax < 1.0 && rMid >= 3 && rEnd >= 0 && rEnd < 0.05);
  // Partial-weight arm: re-engage, set the weight to exactly 0.5
  // in-page, and the release fix must not move the shown point at the
  // release instant (the weight-normalized capture's whole claim).
  for (const vi of [4, 5, 6]) await feedPar(vi, 15);
  await frames(30, 50);
  await rig.ev2(`(() => { snapW = 0.5; return true; })()`);
  const q0 = await rig.J(`({ held: !!snapHeld, shown: dispShownPos(), disp: dispPos && dispPos.slice() })`);
  const qOff = q0.shown && q0.disp ? sc1b.distLL(q0.shown, q0.disp) : -1;
  const q1 = await rig.J(`(() => { acceptFix({ coords: { latitude: ${rLast[0]}, longitude: ${rLast[1]}, accuracy: 10, speed: 1.0, heading: 90 }, timestamp: window.__fakeNow }); return { held: !!snapHeld, shown: dispShownPos() }; })()`);
  const qJump = q0.shown && q1.shown ? sc1b.distLL(q0.shown, q1.shown) : -1;
  ok(`A1 RELEASE BLEND (partial weight): at w 0.5 with a ${qOff.toFixed(1)} m rendered offset, the release fix moves the shown point ${qJump.toFixed(3)} m at the release instant (bar < 0.05 m; the double-weighted capture jumps ${(qOff * 0.5).toFixed(2)} m here), hold gone ${!q1.held}`, q0.held && qOff >= 1.5 && !q1.held && qJump >= 0 && qJump < 0.05);
  await rig.ev2(`(() => { snapGeo = window.__savedGeo; window.__savedGeo = null; return true; })()`);
  const dPre = preSw.shown ? sc1b.distToPoly(preSw.shown, swB) : -1;
  const dPost = postSw.shown ? sc1b.distToPoly(postSw.shown, swB) : -1;
  const wpts = (walk.tr || []).filter(t => t[1] != null).map(t => [t[1], t[2]]);
  let wMax = 0; for (let i = 1; i < wpts.length; i++) { const d = sc1b.distLL(wpts[i], wpts[i - 1]); if (d > wMax) wMax = d; }
  const dEnd = walk.shown ? sc1b.distToPoly(walk.shown, swB) : -1;
  ok(`A1 SWITCH BLEND: fully blended on A (w ${preSw.w.toFixed(2)}, shown ${dPre.toFixed(1)} m from B's line); the third B fix switches the hold to '${postSw.held}' with the shown point STILL ${dPost.toFixed(1)} m from B (bar > 6 m - the defect jumped to ~0), then it walks over with max per-frame step ${wMax.toFixed(2)} m (bar < 1.0 m) and lands ${dEnd.toFixed(2)} m from B's line (bar < 0.5 m)`, preSw.held === 'Switch A' && preSw.w >= 0.95 && dPre > 6 && postSw.held === 'Switch B' && dPost > 6 && wMax < 1.0 && dEnd >= 0 && dEnd < 0.5);
}

// ---- phase A2: S2 (residential drive) + the real turn-in ----
const stA2 = await settleIndex(rig, S2[100]);
ok('SETUP: the snap index is settled for S2 before its replay batch | ' + JSON.stringify(stA2), stA2.settled === true);
await rig.ev2(RESET);
dbg('A2');
const a2 = await replay(rig, S2, { hookIdx: 319 });
dbg('A2 done');
const sc2 = scoreReplay(S2, a2.samples, a2.polyReg, WAYS.s2);
ok(`A2 S2 PROCESSED: all 659 fixes reached the matcher (snapFixN ${a2.samples[a2.samples.length - 1].n})`, a2.samples[a2.samples.length - 1].n === 659);
ok(`A2 S2 WITHIN 3.5 m: ${sc2.within}/${sc2.eng} engaged = ${sc2.frac.toFixed(5)} (study bar 0.99069)`, sc2.frac >= 0.99069 && sc2.eng >= 500);
ok(`A2 S2 WRONG-ROAD LOCK: longest ${sc2.longestWrong} fixes (bar <= 3)`, sc2.longestWrong <= 3);
ok(`A2 S2 SPEED GATE: engagements on sub-4 m/s fixes: ${sc2.belowGateHeld} (bar 0)`, sc2.belowGateHeld === 0);
const sc2b = scorerFor(S2, WAYS.s2);
const hookGap = a2.hookSample && a2.hookSample.shown && a2.hookSample.disp ? sc2b.distLL(a2.hookSample.shown, a2.hookSample.disp) : -1;
ok(`A2 TURN-IN RELEASE (real segment, S2 idx 319): hold already released at idx 318 and at the crossing fix 319 (pids ${a2.samples[318].pid}/${a2.samples[319].pid}), and 2 s of frames later the shown point sits ${hookGap.toFixed(2)} m from the true display point (bar < 0.5 m)`, a2.samples[318].pid === -1 && a2.samples[319].pid === -1 && hookGap >= 0 && hookGap < 0.5);

// ---- phase B: the synthetic clean arm (real startClean, live hold) ----
await rig.ev2(RESET);
await rig.ev2(batchExpr(S1.slice(0, 30)));
const preClean = await rig.J(`window.__smpl[window.__smpl.length - 1]`);
dbg('B clean');
const scTap = await startCleanWrapped(rig);
dbg('B clean done');
ok(`B1 HARD EXIT AT THE TAP: a live hold (pid ${preClean.pid}) dies inside startClean itself - held ${scTap.held}, blend ${scTap.w}, run started ${!!scTap.runStart}${scTap.threw ? ' (startClean threw: ' + scTap.err + ')' : ''}`, preClean.pid >= 0 && scTap.held === false && scTap.w === 0 && !!scTap.runStart);
const nBefore = await rig.J(`snapFixN`);
await rig.ev2(batchExpr(S1.slice(30, 70)));
const bSamples = await rig.J(`window.__smpl.slice(30)`);
const bState = await rig.J(`({ n: snapFixN, m: runDist ? runDist.m : -1, trail: trail.length })`);
ok(`B2 CLEAN RUNNING: 40 fast fixes during the clean engage ZERO times (matcher still processed all 40: snapFixN ${nBefore} -> ${bState.n}) while recording runs (banked ${Math.round(bState.m)} m, trail ${bState.trail} pts)`, bSamples.every(s => s.pid === -1) && bState.n - nBefore === 40 && bState.m > 500 && bState.trail > 10);

// ---- phase C (treatment): logger + recording under an engaged snap ----
const stC = await settleIndex(rig, S2[100]);
ok('SETUP: the snap index is settled for S2 before the invariant replay | ' + JSON.stringify(stC), stC.settled === true);
await rig.ev2(RESET);
await rig.ev2(`(() => { fixLogSetEnabled(true); fixLogOpen(); return true; })()`);
dbg('C1 replay');
const c1 = await replay(rig, S2);
dbg('C1 replay done');
const c1Held = c1.samples.filter(s => s.pid >= 0).length;
const outT = await rig.J(`fixLog[fixLog.length - 1].f.map(r => r[6])`);
await startCleanWrapped(rig);
const lastTs = S2[S2.length - 1][0];
const tail = S2.slice(400, 520).map(f => [lastTs + 1000 + (f[0] - S2[400][0]), f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8]]);
await rig.ev2(batchExpr(tail));
const recT = await rig.J(`({ trail, m: runDist ? runDist.m : null, cov: coveredIdx })`);
ok(`C0 TREATMENT PREMISE: snapping verifiably engaged on ${c1Held}/659 fixes of the invariant replay, logger captured ${outT.length} rows`, c1Held > 300 && outT.length >= 650);
try { rig.proc.kill('SIGKILL'); } catch (e) {}

// ================= control rig (identical, snap index pinned empty) =================
dbg('boot ctl');
const rig2 = await bootRig(true, 'ctl');
dbg('boot ctl done');
await rig2.ev2(`(() => { snapCat = []; snapCatKicked = true; snapGeo = { key: ((typeof activeRoute !== 'undefined' && activeRoute && activeRoute.id) || '') + '|', polys: [], grid: new Map() }; return true; })()`);
await rig2.ev2(RESET);
await rig2.ev2(`(() => { fixLogSetEnabled(true); fixLogOpen(); return true; })()`);
dbg('C2 replay');
const c2 = await replay(rig2, S2);
dbg('C2 replay done');
const c2Held = c2.samples.filter(s => s.pid >= 0).length;
const outC = await rig2.J(`fixLog[fixLog.length - 1].f.map(r => r[6])`);
await startCleanWrapped(rig2);
await rig2.ev2(batchExpr(tail));
const recC = await rig2.J(`({ trail, m: runDist ? runDist.m : null, cov: coveredIdx })`);
ok(`C1 CONTROL PREMISE: the pinned-empty index engaged on ${c2Held}/659 fixes (bar 0)`, c2Held === 0);
ok(`C2 LOGGER INVARIANT: the fix logger's per-fix output rows are byte-identical snapped vs unsnapped (${outT.length} vs ${outC.length} rows)`, JSON.stringify(outT) === JSON.stringify(outC));
ok('C3 RECORDING INVARIANT: trail positions, banked distance and coverage are identical snapped vs unsnapped (trail points compared on position: their third element is a page-clock run stamp, which differs between any two boots - the invariant is that the snap changes nothing RECORDED, and position-for-position, metre-for-metre and street-for-street it does not)', JSON.stringify({ trail: recT.trail.map(p => [p[0], p[1]]), m: recT.m, cov: recT.cov }) === JSON.stringify({ trail: recC.trail.map(p => [p[0], p[1]]), m: recC.m, cov: recC.cov }));

R.exceptions = rig2.consoleLog.filter(l => typeof l === 'string' && l.indexOf('EXCEPTION') === 0);
finishCreate(R, rig2.proc, server);
