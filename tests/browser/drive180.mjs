import { launchDrive, finish } from './harness.mjs';
const { proc, ev, consoleLog, sleep } = await launchDrive();

// drive180: the splash transition - Andrew's Variant A "Rise and
// settle" (Beta 1.153), re-judged at Beta 1.155 against his phone-test
// verdict on 1.153/1.154: "Right now the splash screen text and the
// text in the second menu are two separate things. We have to make
// them one, so it's just a smooth transition." His operative shape:
// the starting point has to be the same - the title starts EXACTLY
// where the splash shows it, and as the splash's other elements fade
// out the title simply moves into place. The 1.153 implementation
// REPARENTED the title into #routeMenu at the boot gate's arm() and
// FLIP-animated it there; its drive proved same-node / rise / shrink
// / the element's OWN opacity - but never the PAINTED start against
// the hold, and the parent it moved into is itself mid-entrance at
// arm() (visibility hidden until +150 ms, opacity ramping from 0,
// translateX(-26px) sliding to 0), so the painted title vanished and
// faded back in part-risen: two texts trading places, as reported.
//
// This drive samples the title on the page's own
// requestAnimationFrame cadence (an in-page trace installed before
// boot completes): its rect, its parent id, its ancestor chain's
// visibility, its EFFECTIVE opacity (ancestor-multiplied - the
// quantity the 1.153 drive's own-opacity check could not see), the
// route menu's own computed opacity/visibility/transform, and the
// main pane's opacity. "Painted" = chain visible AND effective
// opacity >= 0.99. From the trace it proves, with the measured
// numbers carried in the check names:
//   F0 the transition's committed from-value (rect read in the
//      title's own transitionstart handler) equals the splash hold
//      frame - the invert math itself, isolated from the paint path.
//      The compared frame is centre + height: the title's DIV box is
//      shrink-wrapped in the splash pose and full-width in the menu
//      pose by design, so the div's own width is a layout artifact -
//      the painted title is its glyph run, whose frame is its centre
//      and its line height (the run's width follows the font size,
//      which the line height pins). F0/N1 compare cx/cy/h;
//   S1 the title is settled in the splash hold before the flip;
//   S2 the title's parent NEVER changes across every sample - one
//      element living through both scenes, no reparent, no swap;
//   N1 the first PAINTED frame after the flip is the hold frame
//      (<= 2 px on centre-x, centre-y and height) - the reported
//      failure property;
//   N2 the title is painted in every frame from the flip to settle
//      (no disappearance, no fade-in ride on a parent's ramp);
//   N3 no teleport: across the seam (last hold sample -> settle)
//      no consecutive pair travels further than the animation's own
//      easing can carry it in that pair's window - the bound is the
//      easing's steepest window (its velocity only decreases, so
//      the start window bounds every window of that length) over
//      the pair's dt plus one frame (17 ms) of transition-anchor
//      offset (the flip task lands between frames, so a pair can
//      legitimately contain up to a frame more progress than its
//      stamps suggest), + 3 px. Calibrated against the easing
//      itself, cubic-bezier(.22,1,.36,1) over this round's 358 px
//      travel: the steepest true 9 ms window is 15.3 px (1.70
//      px/ms); the fixed code's first candidate run measured one
//      18.6 px / 9 ms pair (2.07 px/ms) - inside the anchored
//      bound (28.1 px), outside any flat rate bound, and on-curve
//      (N1/N2 in the same run prove the painted path starts at the
//      hold and never breaks). An absolute per-pair bound would
//      judge the sampler, not the title (the 1.154 RED run's
//      128.6 px 'jump' aggregated ~250 ms of starved frames in the
//      ease-out tail, where the remaining travel was ~8 px);
//   S3/S5 the rise (>= 60 px) and mid-rise samples strictly
//      between (it travels, it does not jump-cut);
//   N4 at rest the title sits exactly on its menu slot (the rect
//      with inline transform cleared equals the settled rect - no
//      residual transform holds it off its CSS pose);
//   S7 the menu buttons arrive beneath it; S8 the flip adds no
//      dwell (gate timing is the boot gate's own).
//
// Beta 1.157 (Andrew, phone test of 1.155): the one-text structure
// stands; four refinements, each with a measured check below.
// (a) SPACING: 1.153 had taken the title out of #splashBrand, so
// the splash centred the LONE icon - its centre fell 34 px and
// the hold itself OVERLAPPED the title by 8 px (icon y366..534 vs
// title y526..568 at this viewport). An invisible mirror of the
// title inside the brand restores the pre-update column: GAP
// proves the hold gap is the original 26 px again (icon h 168).
// (b) ONE SIZE: the 37->28 shrink is retired - SIZE replaces the
// old S4 (which DEMANDED the shrink): every flight sample's
// height stays within 2 px of the hold's.
// (c) NO OVERLAP IN TRAVEL: the icon's flip fade runs .3 s and
// the rise eases in gently, so OVERLAP proves no frame has the
// title's span intersecting the icon's span while the icon's
// effective opacity is still > .05. The trace therefore samples
// the icon (rect + effective opacity) beside the title.
// (d) SLOWER: the flip runs 1.3 s - DURATION measures
// transitionstart -> transitionend against the 1.2-1.45 s band,
// and N3's bound is re-derived for cubic-bezier(.65,0,.35,1).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

await ev(`(() => {
  if (window.__splashTraceOn) return 'already';
  window.__splashTraceOn = true;
  window.__splashTrace = [];
  window.__splashFrom = null;
  var R2 = function (n) { return Math.round(n * 100) / 100; };
  var step = function () {
    var ti = document.getElementById('splashTitle');
    var rm = document.getElementById('routeMenu');
    if (ti) {
      if (!ti.__mark) ti.__mark = 'same-node';
      if (!ti.__toHooked) { ti.__toHooked = true; ti.addEventListener('transitionend', function (e) { if (e.propertyName === 'transform' && !window.__splashTo) window.__splashTo = { t: Math.round(performance.now()) }; }); }
      if (!window.__splashFromHooked) { window.__splashFromHooked = true; ti.addEventListener('transitionstart', function () { var r = ti.getBoundingClientRect(); window.__splashFrom = { t: Math.round(performance.now()), x: R2(r.left), y: R2(r.top), w: R2(r.width), h: R2(r.height) }; }); }
      var r = ti.getBoundingClientRect();
      var op = 1, vis = true, el = ti;
      while (el && el.nodeType === 1) { var cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') { vis = false; break; } op = op * parseFloat(cs.opacity); if (el === document.documentElement) break; el = el.parentElement; }
      var ic = document.getElementById('splashIcon');
      var ir = ic ? ic.getBoundingClientRect() : null;
      var iop = 1;
      if (ic) { var el2 = ic; while (el2 && el2.nodeType === 1) { var cs2 = getComputedStyle(el2); iop = iop * parseFloat(cs2.opacity); if (el2 === document.documentElement) break; el2 = el2.parentElement; } }
      var pane = document.getElementById('rmMain');
      var btn = document.getElementById('rmChoose');
      var rcs = rm ? getComputedStyle(rm) : null;
      window.__splashTrace.push({ t: Math.round(performance.now()), x: R2(r.left), y: R2(r.top), w: R2(r.width), h: R2(r.height), cx: R2(r.left + r.width / 2), cy: R2(r.top + r.height / 2), parent: ti.parentElement ? ti.parentElement.id : '', mark: ti.__mark || '', vis: vis, op: R2(op), painted: vis && op >= 0.99, shown: rm ? rm.classList.contains('show') : false, rmOp: rcs ? rcs.opacity : '', rmVis: rcs ? rcs.visibility : '', rmTx: rcs ? rcs.transform : '', paneOp: pane ? getComputedStyle(pane).opacity : '', btnH: btn ? R2(btn.getBoundingClientRect().height) : -1, ix: ir ? R2(ir.left) : -1, iy: ir ? R2(ir.top) : -1, iw: ir ? R2(ir.width) : -1, ih: ir ? R2(ir.height) : -1, iop: R2(iop) });
    }
    if (performance.now() < 14000 && !window.__splashTraceStop) requestAnimationFrame(step);
    else window.__splashTraceDone = true;
  };
  requestAnimationFrame(step);
  return 'installed';
})()`).catch(() => null);

// Wait for the transition to settle: the menu shown, its main pane
// fully in, and the title's centre steady across two polls.
let lastCy = null, steady = 0;
const waitT0 = Date.now();
while (Date.now() - waitT0 < 30000) {
  const s = await ev(`(() => { const tr = window.__splashTrace; if (!tr || !tr.length) return ''; const last = tr[tr.length - 1]; const pane = document.getElementById('rmMain'); return JSON.stringify({ n: tr.length, shown: last.shown, cy: last.cy, paneOp: pane ? getComputedStyle(pane).opacity : '' }); })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null).catch(() => null);
  if (s && s.shown && s.paneOp === '1') {
    if (lastCy !== null && Math.abs(s.cy - lastCy) <= 1) { steady++; if (steady >= 2) break; }
    else steady = 0;
    lastCy = s.cy;
  }
  await sleep(300);
}
await ev(`(() => { window.__splashTraceStop = true; return true; })()`).catch(() => null);
await sleep(150);

let trace = [], fromBox = null, toBox = null;
try {
  const raw = await ev(`JSON.stringify(window.__splashTrace || [])`);
  trace = typeof raw === 'string' ? JSON.parse(raw) : [];
  const rawF = await ev(`JSON.stringify(window.__splashFrom || null)`);
  fromBox = typeof rawF === 'string' ? JSON.parse(rawF) : null;
  const rawT = await ev(`JSON.stringify(window.__splashTo || null)`);
  toBox = typeof rawT === 'string' ? JSON.parse(rawT) : null;
} catch (e) { trace = []; }

const flipIdx = trace.findIndex(s => s.shown);
const pre = flipIdx > 0 ? trace.slice(0, flipIdx) : [];
const post = flipIdx >= 0 ? trace.slice(flipIdx) : [];
const hold = pre.length ? pre[pre.length - 1] : null;
const holdTail = pre.slice(-3);
const holdSpread = holdTail.length ? Math.max(...holdTail.map(s => Math.abs(s.cy - hold.cy)), ...holdTail.map(s => Math.abs(s.h - hold.h))) : 999;
const firstPainted = post.find(s => s.painted) || null;
const lastS = trace.length ? trace[trace.length - 1] : null;
// settle: first post-flip index from which cy/h never move > 1 px again
let settleIdx = -1;
for (let i = post.length - 1; i >= 0; i--) {
  if (lastS && Math.abs(post[i].cy - lastS.cy) <= 1 && Math.abs(post[i].h - lastS.h) <= 1) settleIdx = i; else break;
}
const flight = (hold && settleIdx >= 0) ? [hold, ...post.slice(0, settleIdx + 1)] : [];
// N3's bound, from the transition's own easing (arm(): 1.3 s
// cubic-bezier(.65,0,.35,1) since Beta 1.157 - the gentle-start
// easing Andrew's slower/smoother direction picked; at Beta
// 1.155 it was .95 s cubic-bezier(.22,1,.36,1). If that easing
// ever changes, this bound must be re-derived with it). yOfX
// inverts the bezier.
const DUR = 1300;
const bezX = t => 3 * (1 - t) * (1 - t) * t * 0.65 + 3 * (1 - t) * t * t * 0.35 + t * t * t;
const bezY = t => 3 * (1 - t) * t * t + t * t * t;
const yOfX = x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (bezX(mid) < x) lo = mid; else hi = mid; } return bezY((lo + hi) / 2); };
let worstRatio = 0, worstDesc = 'none', rateViol = 0;
const totCy = (hold && lastS) ? Math.abs(hold.cy - lastS.cy) : 0;
const totCx = (hold && lastS) ? Math.abs(hold.cx - lastS.cx) : 0;
for (let i = 1; i < flight.length; i++) {
  const dt = Math.max(1, flight[i].t - flight[i - 1].t);
  const win = yOfX(Math.min(1, (dt + 17) / DUR));
  const pairs = [[Math.abs(flight[i].cy - flight[i - 1].cy), totCy], [Math.abs(flight[i].cx - flight[i - 1].cx), totCx]];
  for (const pr of pairs) {
    const allowed = Math.max(pr[1], 10) * win + 3;
    if (pr[0] / allowed > worstRatio) { worstRatio = pr[0] / allowed; worstDesc = pr[0].toFixed(1) + 'px vs allowed ' + allowed.toFixed(1) + 'px over a ' + dt + 'ms pair at t=' + flight[i].t + 'ms'; }
    if (pr[0] > allowed) rateViol++;
  }
}
const unpainted = (settleIdx >= 0 ? post.slice(0, settleIdx + 1) : post).filter(s => !s.painted);
const midRise = (hold && lastS) ? post.filter(s => s.cy < hold.cy - 15 && s.cy > lastS.cy + 15) : [];
const parents = [...new Set(trace.map(s => s.parent))];
const box = b => b ? ('[x' + b.x + ' y' + b.y + ' w' + b.w + ' h' + b.h + ']') : 'none';
const dBox = (a, b) => (a && b) ? ('dx' + Math.abs(a.x - b.x).toFixed(1) + ' dy' + Math.abs(a.y - b.y).toFixed(1) + ' dw' + Math.abs(a.w - b.w).toFixed(1) + ' dh' + Math.abs(a.h - b.h).toFixed(1)) : 'n/a';
const nearBox = (a, b, tol) => !!(a && b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol);
const ctr = b => b ? ('[cx' + (b.x + b.w / 2).toFixed(1) + ' cy' + (b.y + b.h / 2).toFixed(1) + ' h' + b.h + ']') : 'none';
const dCtr = (a, b) => (a && b) ? ('dcx' + Math.abs((a.x + a.w / 2) - (b.x + b.w / 2)).toFixed(1) + ' dcy' + Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)).toFixed(1) + ' dh' + Math.abs(a.h - b.h).toFixed(1)) : 'n/a';
const nearCtr = (a, b, tol) => !!(a && b && Math.abs((a.x + a.w / 2) - (b.x + b.w / 2)) <= tol && Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)) <= tol && Math.abs(a.h - b.h) <= tol);

ok('S1 the title is SETTLED in the splash hold before the flip (last 3 hold samples agree within 1.5px) | hold box ' + box(hold) + ' spread ' + holdSpread.toFixed(1) + 'px over ' + pre.length + ' hold samples',
  pre.length >= 3 && holdSpread <= 1.5);
ok('F0 the transition FROM-value (rect at the title\'s transitionstart) equals the hold frame (centre + height) within 3px | from ' + ctr(fromBox) + ' vs hold ' + ctr(hold) + ' -> ' + dCtr(fromBox, hold),
  nearCtr(fromBox, hold, 3));
ok('S2 ONE title element lives through both scenes: its parent NEVER changes across all ' + trace.length + ' samples | parents seen: ' + JSON.stringify(parents) + ', end mark ' + (lastS ? lastS.mark : 'none'),
  trace.length > 10 && parents.length === 1 && !!lastS && lastS.mark === 'same-node');
ok('N1 START IDENTITY: the first PAINTED frame after the flip is the splash hold frame (<= 2px on centre-x, centre-y, height) | first painted ' + ctr(firstPainted) + ' at flip+' + ((firstPainted && flipIdx >= 0) ? (firstPainted.t - trace[flipIdx].t) : -1) + 'ms vs hold ' + ctr(hold) + ' -> ' + dCtr(firstPainted, hold),
  nearCtr(firstPainted, hold, 2));
ok('N2 the title NEVER disappears mid-flight: every sample from the flip to settle is painted (chain visible, effective opacity >= .99) | unpainted samples: ' + unpainted.length + (unpainted.length ? ' (first at flip+' + (unpainted[0].t - trace[flipIdx].t) + 'ms, last at flip+' + (unpainted[unpainted.length - 1].t - trace[flipIdx].t) + 'ms, min effective opacity ' + Math.min(...unpainted.map(s => s.op)) + ')' : ''),
  post.length > 0 && settleIdx >= 0 && unpainted.length === 0);
ok('N3 CONTINUITY: no teleport across the seam - no pair from the last hold sample to settle travels further than the easing itself can carry it in that window (steepest-window bound + one frame of anchor offset) | worst pair: ' + worstDesc + ', violating pairs: ' + rateViol,
  flight.length > 2 && rateViol === 0);
ok('S3 the title RISES into the menu position: centre ' + (hold ? hold.cy : -1) + 'px -> ' + (lastS ? lastS.cy : -1) + 'px (a rise of ' + ((hold && lastS) ? (hold.cy - lastS.cy).toFixed(1) : 'n/a') + 'px)',
  !!hold && !!lastS && (hold.cy - lastS.cy) >= 60);
const sizeDev = (hold && flight.length) ? Math.max(...flight.map(s => Math.abs(s.h - hold.h))) : 999;
ok('SIZE the title NEVER changes size (Beta 1.157: one size from splash to menu - the 1.153-1.156 shrink is retired): height ' + (hold ? hold.h : -1) + 'px at the hold, worst deviation ' + sizeDev.toFixed(1) + 'px across ' + flight.length + ' flight samples, ' + (lastS ? lastS.h : -1) + 'px settled',
  !!hold && !!lastS && sizeDev <= 2);
const holdGap = hold ? (hold.y - (hold.iy + hold.ih)) : -999;
ok('GAP the splash hold restores the PRE-UPDATE icon-to-title spacing: icon box y' + (hold ? hold.iy : -1) + ' h' + (hold ? hold.ih : -1) + ', title top y' + (hold ? hold.y : -1) + ' -> gap ' + holdGap.toFixed(1) + 'px (the original was 26px; Beta 1.155 measured an 8px overlap)',
  !!hold && Math.abs(holdGap - 26) <= 2 && Math.abs(hold.ih - 168) <= 2);
let ovBad = 0, ovWorst = 0;
for (const s of (settleIdx >= 0 ? post.slice(0, settleIdx + 1) : post)) {
  const inter = Math.min(s.y + s.h, s.iy + s.ih) - Math.max(s.y, s.iy);
  if (inter > 0 && s.iop > 0.05) { ovBad++; if (inter > ovWorst) ovWorst = inter; }
}
ok('OVERLAP the rising title NEVER crosses the icon while the icon is still visible: frames intersecting the icon span with icon opacity > .05: ' + ovBad + ' (worst intersection ' + ovWorst.toFixed(1) + 'px)',
  post.length > 0 && settleIdx >= 0 && ovBad === 0);
const durMs = (fromBox && toBox) ? (toBox.t - fromBox.t) : -1;
ok('DURATION the rise runs at the Beta 1.157 pace: transitionstart -> transitionend ' + durMs + 'ms (band 1200-1450ms for the 1.3s flip; Beta 1.155 ran 950ms)',
  durMs >= 1200 && durMs <= 1450);
ok('S5 the title is caught MID-RISE (samples strictly between the splash centre and the landing - it travels, it does not jump-cut) | mid-rise samples: ' + midRise.length,
  midRise.length >= 1);
ok('S7 the menu buttons arrive beneath it: at settle the main pane is fully opaque with the Choose button at full height | ' + JSON.stringify({ paneOp: lastS ? lastS.paneOp : 'none', btnH: lastS ? lastS.btnH : -1 }),
  !!lastS && lastS.paneOp === '1' && lastS.btnH > 30);
ok('S8 the boot gate armed promptly (the transition adds no dwell: flip at ' + (flipIdx >= 0 ? trace[flipIdx].t : -1) + 'ms on the page clock)',
  flipIdx >= 0 && trace[flipIdx].t < 12000);

// N4: the resting box is the CSS slot itself - clearing any inline
// transform must not move the title.
let restA = null, restB = null;
try {
  restA = await ev(`(() => { const ti = document.getElementById('splashTitle'); if (!ti) return ''; const r = ti.getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height }); })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
  restB = await ev(`(() => { const ti = document.getElementById('splashTitle'); if (!ti) return ''; const keepT = ti.style.transition, keepX = ti.style.transform; ti.style.transition = 'none'; ti.style.transform = 'none'; const r = ti.getBoundingClientRect(); const out = JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height }); ti.style.transition = keepT; ti.style.transform = keepX; return out; })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
} catch (e) { restA = null; restB = null; }
ok('N4 at rest the title sits exactly on its menu slot: the rect with inline transform forced clear equals the settled rect (<= 1.5px) | settled ' + box(restA) + ' vs cleared ' + box(restB) + ' -> ' + dBox(restA, restB),
  nearBox(restA, restB, 1.5));

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
