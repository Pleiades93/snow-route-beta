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
//      easing's STEEPEST window of the pair's length, wherever on
//      the curve it falls, over the pair's dt plus one frame
//      (17 ms) of transition-anchor offset (the flip task lands
//      between frames, so a pair can legitimately contain up to a
//      frame more progress than its stamps suggest), + 3 px. At
//      Beta 1.155 the easing was ease-out (velocity only decreases,
//      so the start window WAS the steepest); Beta 1.157's
//      gentle-start cubic-bezier(.65,0,.35,1) peaks mid-flight
//      (dy/dx ~2.86 at the centre - ~12.6 px per true 16 ms pair
//      over this round's 358 px travel), and this drive's first
//      1.157 candidate kept the start-window construction: 40
//      on-curve pairs 'violated' a bound derived from the curve's
//      slowest window (worst 13.1 px vs 3.2 px allowed - the
//      title moving exactly at its easing's mid-flight rate).
//      The bound now scans the curve for the steepest window of
//      each pair's length. An absolute per-pair bound would judge
//      the sampler, not the title (the 1.154 RED run's 128.6 px
//      'jump' aggregated ~250 ms of starved frames in the ease-out
//      tail, where the remaining travel was ~8 px);
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
//
// Beta 1.158 (Andrew, from the landing-height examples page -
// Current / +24 / +48 / +72): he picked +48, so the menu slot
// moves 48 px DOWN - head.html's pose top is now
// calc(21% + 27px), the 1.157 -21 px half-line offset plus his
// 48, and the landed centre is the 21% line + 48. The buttons
// do NOT move. Two checks judge exactly this decision: SLOT
// pins the settled centre-y to the 21% line + 48 (on the 1.157
// slot it misses by exactly 48 - the RED is arithmetic from
// the 1.157 CSS: top calc(21% - 21px) over the 42 px line puts
// the centre on the 21% line itself), and CLEAR measures the
// landed title's bottom edge against the first button's top
// edge - the margin must be positive (the examples page's +72
// crowded the buttons; +48 was picked to clear). The same
// release also unifies the blue menus' pill styling on the
// examples mock's treatment (Andrew, same page): PILLC
// measures the boot-menu pills' label centring on the
// rendered text itself (not the computed style), and PILLF
// their fills - the primary solid white, the secondary
// tinted with the 1.5 px inset white ring. SNOW1-SNOW3
// cover the same release's snowfall layer ("Falls and
// settles", Andrew's pick from the falling-snow examples
// page): the canvases exist in both halves of the scene,
// flake positions change across sampled frames, and the
// accumulation is present in the layer's state. Every
// other check is unchanged from 1.157.
//
// Beta 1.159 (Andrew, phone test of 1.158 - four items):
// SLOT re-pins to his tap decision: the landing moves to
// the examples page's LAST option, +72 (slot top
// calc(21% + 51px); settled centre = the 21% line + 72).
// CLEAR keeps its safeguard form - the margin must stay
// positive at +72 (at the 1.158 slot it passes; if +72
// ever broke it this drive goes red and the ship stops).
// The SNOW section is rebuilt for his directed fix of the
// transition twitch he felt ("like clockwork" at the
// splash-to-menu handoff): 1.158 drew the scene on TWO
// canvases - #snowCv in the splash and #snowCvM inside
// #routeMenu, whose .boot entrance rides a
// translateX(-26px) slide and an opacity ramp, so the
// menu-half field slid sideways while fading in over the
// static splash-half field. 1.159 keeps ONE canvas
// (#snowCv, in the splash layer, never reparented - the
// 1.155 brand-layer pattern) and the menu's boot
// background goes transparent while the scene is live, so
// the single field paints through under the panes. SNOW1
// asserts the single canvas + a running engine; SNOW4
// asserts across EVERY trace sample that exactly one snow
// canvas exists, its parent never changes, and its rect
// never translates (on the two-canvas build the count
// alone fails it, and #snowCvM's rect sweeps 26px besides
// - the twitch, measured); SNOW5 samples the canvas's own
// PAINTED field (a downscaled pixel centroid of #snowCv,
// mapped to screen coordinates through its rect) across
// the handoff window and bounds consecutive-pair lateral
// displacement at 10px for pairs up to 120ms apart - the
// legitimate motions are sway (<= 7.6px/s per flake, and
// the centroid of the whole field moves far less) plus respawn
// centroid steps (<= ~5px worst case per respawn, ~0.2
// expected per pair). TITLE1-TITLE5 judge his title
// lifetime rule (the title lives ONLY on the main pane:
// gone on the route list, the create doors and the city
// list; restored on every return to the main pane), and
// SNOW6 judges the snow hiding in the sub-panes alongside
// it. ROWC/ROWC2/ROWF judge his city-pill ruling: the
// blue menus' list rows (the choose list's real rows;
// a city row built by the app's own routeRowShell factory
// in the real #crCityList, the catalogue being unreachable
// from this drive's file:// page) carry CENTRED name and
// sub lines (Range-measured, <= 2px) and the unified pill
// font tokens (.routeName at the .rmBtn size/weight, the
// row wearing the .rmBtn secondary fill/ring/radius).
//
// Beta 1.160 (Andrew - OPTION 3, adopted after his device verdict on
// the Snow Probe): the opening retimes so the icon and title sit out
// the iOS launch-handoff window - the launch stills are plain blue
// and the live scene opens on blue + snow alone. SEQ1 judges the
// DARK WINDOW (neither the icon nor the title painted before 1.2s,
// on the trace's effective opacities - the ancestor-multiplied
// quantities, so the brand's flip fade counts toward the icon after
// the flip; every SEQ window is pre-flip by construction). SEQ2
// judges the icon fully in after its 1.25s fade (a .35s fade on
// #splashIcon itself, so SEQ2's window opens at 1.7s). SEQ3 judges
// the title fully in and settled in the hold before the flip (its
// slide ends at 2.15s; the window opens at 2.3s). S8 is RE-PINNED
// to the new gate: arm()'s splash floor is 2700ms on the animated
// path (1900ms under reduced motion, which this drive does not
// emulate), so the flip cannot precede 2400ms on the trace clock
// and the 6000ms escape still caps a stalled boot under the 12000ms
// ceiling. SNOW7/SNOW8 are Andrew's adoption condition as standing
// guards - the probe (a minimal page with none of the app's
// viewport defences) sometimes showed the snow stopping short of
// the screen bottom, a blue gap under the ground line: SNOW7
// judges the canvas's BOX at every trace sample (the trace's sn
// entries now carry bottom and height alongside left/top - indices
// 4/5; SNOW4 keeps reading 0-3), top within 2px of the viewport
// top and bottom within 2px of the viewport height; SNOW8 judges
// the PAINT itself at the settle - a downscaled read of the canvas
// requires the bottom rows near-fully near-white while the engine
// reports ground (it shares SNOW3's moment, deep in the build
// phase, so the ground band is at least ~7px tall and the bottom
// rows sit inside the filled ground polygon at every x). The snow
// engine, its canvas, its container and the viewport defences are
// untouched by 1.160 - these two checks exist so the retime can
// never smuggle the probe's flaw in.
//
// Beta 1.161 (Andrew, 2026-11-10: approved Stage E of the
// snow-realism examples page - "Stage E is perfect" - with his
// condition in the same breath: the snow keeps accumulating
// like the original, just higher up). The FALLING ports the
// sample's recipe into parts/brand-snow.js (three layers sized
// by scene area: a dense field of tiny twinkling specks, soft
// sprite flakes, and a few rare extra-soft near blobs drifting
// past). No check here pins the recipe itself - SNOW1/SNOW2
// keep their structure/motion judgements over the whole field,
// and SNOW5 keeps its bound and form: the new layers' worst
// lateral sway is 6.6px/s per flake (the mid layer's amplitude
// x frequency cap), under the 7.6px/s its name states, and
// respawn centroid steps shrink with the far larger particle
// count. The ACCUMULATION changes by exactly one value: the
// ground peak 20 -> 58px, 58 being the rendered height of the
// app's bottom bar (#tabBar) measured in the assembled page at
// 390x844 (identically 58 at this drive's 420x900 - the bar's
// height is width-independent). SNOW9 is the proof, not an
// assumption: it waits for the settle cycle's full amount,
// reads the PAINTED crest off the canvas (the 99th-percentile
// column height of the unbroken near-white run from the canvas
// floor, the lower of two reads 700ms apart, so a flake caught
// landing cannot fake the crest), and demands it within 5px of
// the expected crest - the pinned 58px peak x the two-sine
// profile's maximum over the live viewport width - while the
// bar itself, measured live in the same page, stands within
// 2px of the pinned 58.
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
      var snArr = [], snCx = -1;
      try {
        var scs = document.querySelectorAll('#snowCv, #snowCvM');
        for (var si = 0; si < scs.length; si++) { var sr = scs[si].getBoundingClientRect(); snArr.push([scs[si].id, scs[si].parentElement ? scs[si].parentElement.id : '', R2(sr.left), R2(sr.top), R2(sr.bottom), R2(sr.height)]); }
        var scv = document.getElementById('snowCv');
        if (scv && scv.width > 0) {
          if (!window.__snOff) { var oc = document.createElement('canvas'); oc.width = 105; oc.height = 225; window.__snOff = oc; }
          var octx = window.__snOff.getContext('2d');
          octx.clearRect(0, 0, 105, 225);
          octx.drawImage(scv, 0, 0, 105, 225);
          var idata = octx.getImageData(0, 0, 105, 225).data;
          var swsum = 0, sxsum = 0;
          for (var pi = 0; pi < idata.length; pi += 4) { var pa = idata[pi + 3]; if (pa > 25 && idata[pi] >= pa * 0.7 && idata[pi + 2] >= pa * 0.7) { var pxx = (pi / 4) % 105; swsum += pa; sxsum += pxx * pa; } }
          if (swsum > 0) { var srect = scv.getBoundingClientRect(); if (srect.width > 0) snCx = R2(srect.left + (sxsum / swsum) / 105 * srect.width); }
        }
      } catch (e) { snArr = []; snCx = -1; }
      window.__splashTrace.push({ t: Math.round(performance.now()), x: R2(r.left), y: R2(r.top), w: R2(r.width), h: R2(r.height), cx: R2(r.left + r.width / 2), cy: R2(r.top + r.height / 2), parent: ti.parentElement ? ti.parentElement.id : '', mark: ti.__mark || '', vis: vis, op: R2(op), painted: vis && op >= 0.99, shown: rm ? rm.classList.contains('show') : false, rmOp: rcs ? rcs.opacity : '', rmVis: rcs ? rcs.visibility : '', rmTx: rcs ? rcs.transform : '', paneOp: pane ? getComputedStyle(pane).opacity : '', btnH: btn ? R2(btn.getBoundingClientRect().height) : -1, ix: ir ? R2(ir.left) : -1, iy: ir ? R2(ir.top) : -1, iw: ir ? R2(ir.width) : -1, ih: ir ? R2(ir.height) : -1, iop: R2(iop), sn: snArr, snCx: snCx });
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
// inverts the bezier. steepest(w) is the most progress the easing
// makes over ANY window of x-length w - the honest per-pair bound
// for a velocity-peaking easing.
const DUR = 1300;
const bezX = t => 3 * (1 - t) * (1 - t) * t * 0.65 + 3 * (1 - t) * t * t * 0.35 + t * t * t;
const bezY = t => 3 * (1 - t) * t * t + t * t * t;
const yOfX = x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (bezX(mid) < x) lo = mid; else hi = mid; } return bezY((lo + hi) / 2); };
const steepest = w => { let m = 0; for (let i = 0; i <= 200; i++) { const x = (i / 200) * Math.max(0, 1 - w); const p = yOfX(Math.min(1, x + w)) - yOfX(x); if (p > m) m = p; } return m; };
let worstRatio = 0, worstDesc = 'none', rateViol = 0;
const totCy = (hold && lastS) ? Math.abs(hold.cy - lastS.cy) : 0;
const totCx = (hold && lastS) ? Math.abs(hold.cx - lastS.cx) : 0;
for (let i = 1; i < flight.length; i++) {
  const dt = Math.max(1, flight[i].t - flight[i - 1].t);
  const win = steepest(Math.min(1, (dt + 17) / DUR));
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
ok('S8 the boot gate flips at the Beta 1.160 floor (flip at ' + (flipIdx >= 0 ? trace[flipIdx].t : -1) + 'ms on the page clock; arm() holds a 2700ms splash floor on the animated path - the flip lands after the icon fade-in, the title slide-in and the hold, so it cannot precede 2400ms on this clock - and the 6000ms escape still caps a stalled boot well under the 12000ms ceiling)',
  flipIdx >= 0 && trace[flipIdx].t >= 2400 && trace[flipIdx].t < 12000);
const darkSamples = trace.filter(s => s.t <= 1200);
const darkWorstI = darkSamples.reduce((m, s) => Math.max(m, s.iop), 0);
const darkWorstT = darkSamples.reduce((m, s) => Math.max(m, s.op), 0);
ok('SEQ1 DARK WINDOW (Beta 1.160, Option 3): before 1.2s NEITHER the icon nor the title is painted - ' + darkSamples.length + ' trace samples at t <= 1200ms (first at ' + (trace.length ? trace[0].t : -1) + 'ms), worst icon effective opacity ' + darkWorstI.toFixed(3) + ', worst title effective opacity ' + darkWorstT.toFixed(3) + ' (both must stay <= .05; the launch still is plain blue to match - the icon sits out the iOS handoff from both sides)',
  darkSamples.length >= 5 && darkWorstI <= 0.05 && darkWorstT <= 0.05);
const flipT2 = flipIdx >= 0 ? trace[flipIdx].t : -1;
const iconIn = trace.filter(s => s.t >= 1700 && flipT2 > 0 && s.t < flipT2 && s.iop >= 0.99);
ok('SEQ2 the icon is FULLY IN after its 1.25s fade and before the flip: ' + iconIn.length + ' trace samples in [1700ms, flip) with icon effective opacity >= .99' + (iconIn.length ? ' (first at ' + iconIn[0].t + 'ms)' : ''),
  iconIn.length >= 1);
const titleIn = trace.filter(s => s.t >= 2300 && flipT2 > 0 && s.t < flipT2 && s.op >= 0.99);
ok('SEQ3 the title is fully in and settled in the hold before the flip: ' + titleIn.length + ' trace samples in [2300ms, flip) with title effective opacity >= .99' + (titleIn.length ? ' (first at ' + titleIn[0].t + 'ms)' : ''),
  titleIn.length >= 1);

// N4: the resting box is the CSS slot itself - clearing any inline
// transform must not move the title.
let restA = null, restB = null;
try {
  restA = await ev(`(() => { const ti = document.getElementById('splashTitle'); if (!ti) return ''; const r = ti.getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height }); })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
  restB = await ev(`(() => { const ti = document.getElementById('splashTitle'); if (!ti) return ''; const keepT = ti.style.transition, keepX = ti.style.transform; ti.style.transition = 'none'; ti.style.transform = 'none'; const r = ti.getBoundingClientRect(); const out = JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height }); ti.style.transition = keepT; ti.style.transform = keepX; return out; })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
} catch (e) { restA = null; restB = null; }
ok('N4 at rest the title sits exactly on its menu slot: the rect with inline transform forced clear equals the settled rect (<= 1.5px) | settled ' + box(restA) + ' vs cleared ' + box(restB) + ' -> ' + dBox(restA, restB),
  nearBox(restA, restB, 1.5));

// SLOT + CLEAR (Beta 1.158): the landed slot is the 21% line
// + 48 (Andrew's pick), and the landed title must clear the
// first button - the buttons never moved.
let slot = null;
try {
  slot = await ev(`(() => { const ti = document.getElementById('splashTitle'); const btn = document.getElementById('rmChoose'); if (!ti || !btn) return ''; const tr = ti.getBoundingClientRect(); const br = btn.getBoundingClientRect(); return JSON.stringify({ cy: tr.top + tr.height / 2, tBot: tr.bottom, btnTop: br.top, ih: window.innerHeight }); })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
} catch (e) { slot = null; }
const slotExp = slot ? (0.21 * slot.ih + 72) : -1;
ok('SLOT the landed title sits on the PICKED slot (Beta 1.159: the 21% line + 72px - the examples page\'s LAST option, Andrew\'s tap after 1.158\'s +48): settled centre-y ' + (slot ? slot.cy.toFixed(1) : 'n/a') + 'px vs expected ' + slotExp.toFixed(1) + 'px (21% of viewport height ' + (slot ? slot.ih : -1) + ' + 72), off by ' + (slot ? Math.abs(slot.cy - slotExp).toFixed(1) : 'n/a') + 'px',
  !!slot && Math.abs(slot.cy - slotExp) <= 2);
const clearMargin = slot ? (slot.btnTop - slot.tBot) : -999;
ok('CLEAR the landed title still clears the first menu button at +72 (the buttons never moved): title bottom ' + (slot ? slot.tBot.toFixed(1) : 'n/a') + 'px, Choose button top ' + (slot ? slot.btnTop.toFixed(1) : 'n/a') + 'px -> margin ' + clearMargin.toFixed(1) + 'px (must be > 0 - the safeguard Andrew was told: if +72 broke this, the ship stops rather than forcing it)',
  !!slot && clearMargin > 0);

// PILLS (Beta 1.158): the boot menu's two pills wear the
// unified blue-menu treatment from the examples mock -
// centring MEASURED on the rendered label (a Range over the
// button's contents vs the button's own box), the primary
// solid, the secondary tinted with the inset ring.
let pill = null;
try {
  pill = await ev(`(() => { const meas = id => { const b = document.getElementById(id); if (!b) return null; const br = b.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(b); const tr = rg.getBoundingClientRect(); const cs = getComputedStyle(b); return { bcx: br.left + br.width / 2, tcx: tr.left + tr.width / 2, bg: cs.backgroundColor, sh: cs.boxShadow }; }; return JSON.stringify({ a: meas('rmChoose'), b: meas('rmCreate') }); })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
} catch (e) { pill = null; }
const pillOffA = pill && pill.a ? Math.abs(pill.a.tcx - pill.a.bcx) : 999;
const pillOffB = pill && pill.b ? Math.abs(pill.b.tcx - pill.b.bcx) : 999;
ok('PILLC the menu pills\' text is CENTRED, measured on the rendered label (not the computed style): Choose label centre off the pill centre by ' + pillOffA.toFixed(1) + 'px, Create by ' + pillOffB.toFixed(1) + 'px (tolerance 2px)',
  !!pill && pillOffA <= 2 && pillOffB <= 2);
ok('PILLF the pill hierarchy is the mock\'s: Choose (primary) is SOLID white [' + (pill && pill.a ? pill.a.bg : 'n/a') + ']; Create (secondary) is the TINTED fill [' + (pill && pill.b ? pill.b.bg : 'n/a') + '] wearing the 1.5px inset white ring [' + (pill && pill.b ? pill.b.sh : 'n/a') + ']',
  !!pill && !!pill.a && !!pill.b && pill.a.bg === 'rgb(255, 255, 255)' && pill.b.bg === 'rgba(255, 255, 255, 0.16)' && pill.b.sh.indexOf('inset') >= 0 && pill.b.sh.indexOf('1.5px') >= 0);

// SNOW (Beta 1.159): ONE canvas now - see the header. SNOW1 judges
// the single-canvas structure + the running engine; SNOW2/SNOW3 keep
// the 1.158 motion/accumulation judgements (read through the engine's
// own handle, window.__snow); SNOW4 judges the canvas's singleness,
// parent and rect stability across EVERY trace sample; SNOW5 judges
// the painted field's lateral continuity across the handoff window.
let snowA = null, snowYs2 = null;
try {
  snowA = await ev(`(() => { const w = window; const all = document.querySelectorAll('#snowCv, #snowCvM'); return JSON.stringify({ n: all.length, one: all.length === 1 && all[0].id === 'snowCv', run: !!(w.__snow && w.__snow.running()), amt: w.__snow ? w.__snow.amount() : -1, gnd: w.__snow ? w.__snow.ground() : -1, ih: window.innerHeight, ys: w.__snow ? w.__snow.flakes().map(f => Math.round(f.y)) : [] }); })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
  await new Promise(r => setTimeout(r, 650));
  snowYs2 = await ev(`(() => JSON.stringify(window.__snow ? window.__snow.flakes().map(f => Math.round(f.y)) : []))()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
} catch (e) { snowA = null; snowYs2 = null; }
const snowMoved = !!(snowA && snowYs2 && snowA.ys.length > 0 && snowYs2.length === snowA.ys.length && snowYs2.some((y, i) => Math.abs(y - snowA.ys[i]) > 2));
ok('SNOW1 ONE snow canvas serves the whole opening scene (Beta 1.159: #snowCv only - the 1.158 pair #snowCv + #snowCvM is retired) and the engine is running | canvases found: ' + (snowA ? snowA.n : 'n/a'),
  !!snowA && snowA.one && snowA.run);
ok('SNOW2 the flakes actually fall: flake positions change across frames sampled 650ms apart',
  snowMoved);
ok('SNOW3 the accumulation is present in the layer state: settle amount ' + (snowA ? snowA.amt.toFixed(2) : 'n/a') + ' and ground height ' + (snowA ? snowA.gnd.toFixed(1) : 'n/a') + 'px, both > 0 in the build phase',
  !!snowA && snowA.amt > 0 && snowA.gnd > 0);
const snSamples = trace.filter(s => Array.isArray(s.sn));
const snCounts = [...new Set(snSamples.map(s => s.sn.length))];
const snIds = [...new Set(snSamples.flatMap(s => s.sn.map(e => e[0])))];
const snParents = [...new Set(snSamples.flatMap(s => s.sn.map(e => e[0] + '@' + e[1])))];
let snDrift = 0;
{
  const firstById = {};
  for (const s of snSamples) for (const e of s.sn) { if (!(e[0] in firstById)) firstById[e[0]] = e; else snDrift = Math.max(snDrift, Math.abs(e[2] - firstById[e[0]][2]), Math.abs(e[3] - firstById[e[0]][3])); }
}
ok('SNOW4 the snow layer is ONE element that never moves: across all ' + snSamples.length + ' trace samples the snow canvases are ' + JSON.stringify(snIds) + ' (counts per sample ' + JSON.stringify(snCounts) + ', parents ' + JSON.stringify(snParents) + ') and no snow canvas rect drifts more than ' + snDrift.toFixed(1) + 'px (tolerance 1px; the 1.158 build fails this twice over - two canvases, and #snowCvM\'s rect rides the menu\'s 26px entrance slide: the twitch Andrew felt)',
  snSamples.length > 10 && snCounts.length === 1 && snCounts[0] === 1 && snIds.length === 1 && snIds[0] === 'snowCv' && snParents.length === 1 && snDrift <= 1);
const snWin = (flipIdx >= 0 && settleIdx >= 0) ? post.slice(0, settleIdx + 1) : [];
let snPairs = 0, snSkip = 0, snViol = 0, snWorst = 0;
for (let i = 1; i < snWin.length; i++) {
  const a = snWin[i - 1], b = snWin[i];
  if (!(a.snCx >= 0) || !(b.snCx >= 0)) continue;
  const dt = b.t - a.t;
  if (dt > 120) { snSkip++; continue; }
  snPairs++;
  const d = Math.abs(b.snCx - a.snCx);
  if (d > snWorst) snWorst = d;
  if (d > 10) snViol++;
}
ok('SNOW5 NO TWITCH: the painted snow field never jumps sideways across the splash-to-menu handoff - the field centroid (pixel centroid of the one canvas, screen coordinates) moves at most ' + snWorst.toFixed(1) + 'px between consecutive trace samples in the flip-to-settle window (bound 10px per pair; ' + snPairs + ' pairs judged, ' + snSkip + ' starved pairs over 120ms excluded, ' + snViol + ' violations; legitimate motion is sway at <= 7.6px/s per flake plus <= ~5px respawn steps)',
  snPairs >= 12 && snViol === 0);
const snIh = snowA ? snowA.ih : -1;
let snTopWorst = -1, snBotWorst = -1, snCoverN = 0;
for (const s of snSamples) { for (const e of s.sn) { if (e.length >= 6) { snCoverN++; const dTop = Math.abs(e[3]); const dBot = Math.abs(e[4] - snIh); if (dTop > snTopWorst) snTopWorst = dTop; if (dBot > snBotWorst) snBotWorst = dBot; } } }
ok('SNOW7 ANTI-GAP (Beta 1.160 - the adoption condition): the snow canvas COVERS the full viewport height at every traced frame - ' + snCoverN + ' canvas samples from the first traced frame at ' + (snSamples.length ? snSamples[0].t : -1) + 'ms, worst top offset ' + (snTopWorst < 0 ? 'n/a' : snTopWorst.toFixed(1)) + 'px, worst bottom offset from the viewport height (' + snIh + 'px) ' + (snBotWorst < 0 ? 'n/a' : snBotWorst.toFixed(1)) + 'px (both must stay <= 2px - no blue gap can open under the snow)',
  snCoverN > 10 && snIh > 0 && snTopWorst <= 2 && snBotWorst <= 2);
let snowPx = null;
try {
  snowPx = await ev(`(() => { const cv = document.getElementById('snowCv'); if (!cv || !cv.width) return ''; const r = cv.getBoundingClientRect(); const oc = document.createElement('canvas'); oc.width = 210; oc.height = 450; const c2 = oc.getContext('2d'); c2.drawImage(cv, 0, 0, 210, 450); const dd = c2.getImageData(0, 0, 210, 450).data; let wht = 0, nn = 0; for (let y = 448; y < 450; y++) { for (let x = 0; x < 210; x++) { const i = (y * 210 + x) * 4; nn++; if (dd[i + 3] > 200 && dd[i] > 200 && dd[i + 1] > 200 && dd[i + 2] > 200) wht++; } } return JSON.stringify({ top: Math.round(r.top * 100) / 100, bottom: Math.round(r.bottom * 100) / 100, ih: window.innerHeight, bot: nn ? Math.round(wht / nn * 1000) / 1000 : 0 }); })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
} catch (e) { snowPx = null; }
ok('SNOW8 the accumulation is painted AT the canvas bottom edge (the ground forms on the viewport floor, not above it): the bottom rows of the painted canvas are ' + (snowPx ? Math.round(snowPx.bot * 100) : 'n/a') + '% near-white with engine ground ' + (snowA ? snowA.gnd.toFixed(1) : 'n/a') + 'px, canvas rect top ' + (snowPx ? snowPx.top : 'n/a') + ' / bottom ' + (snowPx ? snowPx.bottom : 'n/a') + ' against viewport height ' + (snowPx ? snowPx.ih : 'n/a'),
  !!snowPx && !!snowA && snowA.gnd > 0 && snowPx.bot >= 0.8 && Math.abs(snowPx.bottom - snowPx.ih) <= 2 && Math.abs(snowPx.top) <= 2);

// SNOW9 (Beta 1.161): the raised peak, PROVEN on the painted
// canvas - see the header. Poll the engine's own amount to the
// top of its cycle, then read the crest twice, 700ms apart.
const SNOW9_PEAK = 58; // the pinned peak: #tabBar's measured height at 390x844
let snow9 = null;
try {
  const t9 = Date.now();
  let amt9 = -1;
  while (Date.now() - t9 < 30000) {
    amt9 = await ev(`(() => (window.__snow ? window.__snow.amount() : -1))()`).then(x => (typeof x === 'number' ? x : -1)).catch(() => -1);
    if (amt9 >= 0.995) break;
    await new Promise(r => setTimeout(r, 300));
  }
  const scan9 = `(() => { const cv = document.getElementById('snowCv'); if (!cv || !cv.width) return ''; const W = window.innerWidth, H = window.innerHeight; const oc = document.createElement('canvas'); oc.width = W; oc.height = H; const c2 = oc.getContext('2d'); c2.drawImage(cv, 0, 0, W, H); const dd = c2.getImageData(0, 0, W, H).data; const crest = new Array(W).fill(0); for (let x = 0; x < W; x++) { let run = 0; for (let y = H - 1; y >= 0; y--) { const i = (y * W + x) * 4; if (dd[i + 3] > 200 && dd[i] > 200 && dd[i + 1] > 200 && dd[i + 2] > 200) run++; else break; } crest[x] = run; } crest.sort((a, b) => a - b); const p99 = crest[Math.min(W - 1, Math.floor(W * 0.99))]; const bar = document.getElementById('tabBar'); const br = bar ? bar.getBoundingClientRect() : null; return JSON.stringify({ p99: p99, barH: br ? Math.round(br.height * 100) / 100 : -1, w: W }); })()`;
  const s91 = await ev(scan9).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
  await new Promise(r => setTimeout(r, 700));
  const s92 = await ev(scan9).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
  let shapeMax = 0;
  const wLive = (s91 && s91.w) || 420;
  for (let x = 0; x <= wLive; x++) { const v = 0.72 + 0.16 * Math.sin(x * 0.045 + 1.7) + 0.12 * Math.sin(x * 0.013 + 0.4); if (v > shapeMax) shapeMax = v; }
  snow9 = { amt: amt9, peak: (s91 && s92) ? Math.min(s91.p99, s92.p99) : -1, exp: SNOW9_PEAK * shapeMax, barH: s91 ? s91.barH : -1, s1: s91 ? s91.p99 : -1, s2: s92 ? s92.p99 : -1 };
} catch (e) { snow9 = null; }
ok('SNOW9 RAISED PEAK (Beta 1.161 - Andrew: accumulating like the original, just higher): at the settle cycle\'s full amount (' + (snow9 ? snow9.amt.toFixed(3) : 'n/a') + ') the PAINTED snow crest stands ' + (snow9 ? snow9.peak : 'n/a') + 'px (two reads ' + (snow9 ? snow9.s1 : 'n/a') + '/' + (snow9 ? snow9.s2 : 'n/a') + 'px, the lower judged) against the expected crest ' + (snow9 ? snow9.exp.toFixed(1) : 'n/a') + 'px = the pinned 58px peak (the bottom bar\'s measured height) x the ground profile\'s maximum over the live width; the bar itself measures ' + (snow9 ? snow9.barH : 'n/a') + 'px in this same page (58 +/- 2)',
  !!snow9 && snow9.amt >= 0.995 && Math.abs(snow9.peak - snow9.exp) <= 5 && Math.abs(snow9.barH - SNOW9_PEAK) <= 2);

// TITLE LIFETIME + SUB-PANE SNOW + LIST ROWS (Beta 1.159): navigate
// the boot menu's panes with real clicks and judge what Andrew's
// rules demand - the title (and the snow) present ONLY on the main
// pane; the list rows centred and pill-typed. Effective opacity is
// the ancestor-multiplied quantity the trace computes.
const effOp = id => ev(`(() => { const el = document.getElementById('${id}'); if (!el) return -1; let op = 1, n = el; while (n && n.nodeType === 1) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; op *= parseFloat(cs.opacity); if (n === document.documentElement) break; n = n.parentElement; } return Math.round(op * 1000) / 1000; })()`).then(x => (typeof x === 'number' ? x : -1)).catch(() => -1);
const paneOn = id => ev(`(() => { const p = document.getElementById('${id}'); return !!(p && p.classList.contains('on')); })()`).then(x => x === true).catch(() => false);
const clickId = id => ev(`(() => { const b = document.getElementById('${id}'); if (!b) return false; b.click(); return true; })()`).then(x => x === true).catch(() => false);
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(120); } return false; };
let nav = null;
try {
  const r = {};
  r.tMain0 = await effOp('splashTitle');
  r.cvMain0 = await effOp('snowCv');
  await clickId('rmChoose');
  r.toList = await waitFor(async () => (await paneOn('rmListPane')) && (await effOp('splashTitle')) <= 0.05, 3000);
  r.tList = await effOp('splashTitle');
  r.cvList = await effOp('snowCv');
  r.rows = await ev(`(() => { const meas = row => { const rr = row.getBoundingClientRect(); const out = { rcx: rr.left + rr.width / 2 }; const nm = row.querySelector('.routeName'), ar = row.querySelector('.routeArea'); if (nm) { const g = document.createRange(); g.selectNodeContents(nm); const t = g.getBoundingClientRect(); out.nOff = Math.round(Math.abs(t.left + t.width / 2 - out.rcx) * 10) / 10; const cs = getComputedStyle(nm); out.nSize = cs.fontSize; out.nWeight = cs.fontWeight; } if (ar) { const g2 = document.createRange(); g2.selectNodeContents(ar); const t2 = g2.getBoundingClientRect(); out.aOff = Math.round(Math.abs(t2.left + t2.width / 2 - out.rcx) * 10) / 10; } const rcs = getComputedStyle(row); out.bg = rcs.backgroundColor; out.sh = rcs.boxShadow; out.rad = rcs.borderRadius; out.ff = rcs.fontFamily; return out; }; const rows = [...document.querySelectorAll('#rmRoutes .routeRow')]; const btn = document.getElementById('rmCreate'); const bcs = btn ? getComputedStyle(btn) : null; return JSON.stringify({ rows: rows.map(meas), btnFf: bcs ? bcs.fontFamily : '', btnSize: bcs ? bcs.fontSize : '' }); })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
  await clickId('rmBack');
  r.toMain1 = await waitFor(async () => (await paneOn('rmMain')) && (await effOp('splashTitle')) >= 0.99, 3000);
  r.tMain1 = await effOp('splashTitle');
  r.cvMain1 = await effOp('snowCv');
  await clickId('rmCreate');
  r.toCreate = await waitFor(async () => (await paneOn('rmCreatePane')) && (await effOp('splashTitle')) <= 0.05, 3000);
  await clickId('crDoorList');
  r.toCity = await waitFor(() => paneOn('rmCityListPane'), 3000);
  await waitFor(() => ev(`!!document.querySelector('#crCityList .rmNote') || document.querySelectorAll('#crCityList .routeRow').length > 1`).then(x => x === true).catch(() => false), 6000);
  r.cityRow = await ev(`(() => { const box = document.getElementById('crCityList'); if (!box || typeof routeRowShell !== 'function') return null; const row = routeRowShell('button', 'Mississauga', '12,345 streets · ready to load', { chevron: true }); box.appendChild(row); const rr = row.getBoundingClientRect(); const rcx = rr.left + rr.width / 2; const nm = row.querySelector('.routeName'), ar = row.querySelector('.routeArea'); const g = document.createRange(); g.selectNodeContents(nm); const t = g.getBoundingClientRect(); const g2 = document.createRange(); g2.selectNodeContents(ar); const t2 = g2.getBoundingClientRect(); const cs = getComputedStyle(nm); return JSON.stringify({ nOff: Math.round(Math.abs(t.left + t.width / 2 - rcx) * 10) / 10, aOff: Math.round(Math.abs(t2.left + t2.width / 2 - rcx) * 10) / 10, nSize: cs.fontSize }); })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
  r.tCity = await effOp('splashTitle');
  r.cvCity = await effOp('snowCv');
  await clickId('crCityListBack');
  await waitFor(() => paneOn('rmCreatePane'), 3000);
  await clickId('rmBack2');
  r.toMain2 = await waitFor(async () => (await paneOn('rmMain')) && (await effOp('splashTitle')) >= 0.99, 3000);
  r.tMain2 = await effOp('splashTitle');
  nav = r;
} catch (e) { nav = null; }
ok('TITLE1 the title is PRESENT on the main pane (effective opacity ' + (nav ? nav.tMain0 : 'n/a') + ') and the snow with it (canvas effective opacity ' + (nav ? nav.cvMain0 : 'n/a') + ')',
  !!nav && nav.tMain0 >= 0.99 && nav.cvMain0 >= 0.99);
ok('TITLE2 the title is GONE on the route list after tapping Choose (effective opacity ' + (nav ? nav.tList : 'n/a') + ', reached the pane: ' + (nav ? nav.toList : 'n/a') + ') - Andrew\'s rule: it lives only in the main menu',
  !!nav && nav.toList && nav.tList <= 0.05);
ok('TITLE3 the title RETURNS on navigating back to the main pane (effective opacity ' + (nav ? nav.tMain1 : 'n/a') + ')',
  !!nav && nav.toMain1 && nav.tMain1 >= 0.99);
ok('TITLE4 the title is gone on the create doors AND the city list too (create pane reached: ' + (nav ? nav.toCreate : 'n/a') + '; city list opacity ' + (nav ? nav.tCity : 'n/a') + ')',
  !!nav && nav.toCreate && nav.toCity && nav.tCity <= 0.05);
ok('TITLE5 the title returns again at the main pane after the full create-side round trip (effective opacity ' + (nav ? nav.tMain2 : 'n/a') + ')',
  !!nav && nav.toMain2 && nav.tMain2 >= 0.99);
ok('SNOW6 the snow hides in the sub-panes alongside the title and returns with it: canvas effective opacity on the route list ' + (nav ? nav.cvList : 'n/a') + ', on the city list ' + (nav ? nav.cvCity : 'n/a') + ', back at the main pane ' + (nav ? nav.cvMain1 : 'n/a'),
  !!nav && nav.cvList <= 0.05 && nav.cvCity <= 0.05 && nav.cvMain1 >= 0.99);
const rowList = nav && nav.rows && Array.isArray(nav.rows.rows) ? nav.rows.rows : [];
const rowNWorst = rowList.length ? Math.max(...rowList.map(x => (typeof x.nOff === 'number' ? x.nOff : 999))) : 999;
const rowAWorst = rowList.length ? Math.max(...rowList.map(x => (typeof x.aOff === 'number' ? x.aOff : 999))) : 999;
ok('ROWC the choose list\'s rows carry CENTRED text, Range-measured on the rendered lines: ' + rowList.length + ' rows, worst name-line offset ' + rowNWorst.toFixed(1) + 'px and worst sub-line offset ' + rowAWorst.toFixed(1) + 'px from the row centre (tolerance 2px; through 1.158 the rows were left-aligned)',
  rowList.length >= 1 && rowNWorst <= 2 && rowAWorst <= 2);
ok('ROWF the rows wear the unified pill tokens: name at the pill\'s size/weight (' + (rowList.length ? rowList[0].nSize + '/' + rowList[0].nWeight : 'n/a') + ' vs the .rmBtn ' + (nav && nav.rows ? nav.rows.btnSize : 'n/a') + '), the row font stack equals the pill\'s (' + (rowList.length && nav && nav.rows && rowList[0].ff === nav.rows.btnFf ? 'identical' : 'DIFFERENT') + '), fill ' + (rowList.length ? rowList[0].bg : 'n/a') + ', ring ' + (rowList.length ? rowList[0].sh : 'n/a') + ', radius ' + (rowList.length ? rowList[0].rad : 'n/a'),
  rowList.length >= 1 && !!nav && !!nav.rows && rowList.every(x => x.nSize === nav.rows.btnSize && x.nWeight === '650' && x.ff === nav.rows.btnFf && x.bg === 'rgba(255, 255, 255, 0.16)' && x.sh.indexOf('inset') >= 0 && x.sh.indexOf('1.5px') >= 0 && x.rad === '14px'));
ok('ROWC2 a city-list row (the app\'s own routeRowShell factory, in the real #crCityList) is centred the same way: name offset ' + (nav && nav.cityRow ? nav.cityRow.nOff : 'n/a') + 'px, sub offset ' + (nav && nav.cityRow ? nav.cityRow.aOff : 'n/a') + 'px, name size ' + (nav && nav.cityRow ? nav.cityRow.nSize : 'n/a'),
  !!nav && !!nav.cityRow && nav.cityRow.nOff <= 2 && nav.cityRow.aOff <= 2 && !!nav.rows && nav.cityRow.nSize === nav.rows.btnSize);

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
