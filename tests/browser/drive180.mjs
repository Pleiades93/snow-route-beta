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
// Beta 1.162 (Andrew's design, 2026-11-10): the icon and the
// title become ONE BLOCK. He picked Option B on the title-caps
// samples (SNOW ROUTE - capitals only, same size, weight and
// spacing) and directed the splash restructure in the same
// breath: the icon above the title is the menu look he wants,
// so the two stop being separate acts - both fade in together
// after the snow-only window, both rise together, and the icon
// no longer fades away. Implementation: #splashBrand and its
// mirror are retired; the icon moves into #brandLayer as the
// title's sibling inside #brandBlock (a rigid 236px column:
// the icon's 168 + the 26px gap + the title's 42px line - the
// column as it has stood since 1.157); the block's ONE fade-in
// (.35s at 1.25s) is the shared arrival; arm() FLIPs THE BLOCK
// (one element, one transform) to a menu pose whose top puts
// the TITLE on the unchanged +72 slot (block top
// calc(21% - 143px) = the slot top minus the 194px of icon +
// gap riding above the title), so the landed menu is the icon
// above SNOW ROUTE and everything below the title is unmoved.
// Judged here: SEQ1 keeps the dark window (the block's opacity
// multiplies both children's effective opacities); SEQ2
// re-pins to the shared arrival (icon AND title fully in from
// 1.7s - the block's fade ends at 1.6s); SEQ3 keeps its hold
// window (the title arrived with the block at 1.6s; S1 still
// proves the settle); F0 and DURATION re-hook to the BLOCK's
// transition (the title carries none of its own now), F0
// comparing the block's from-rect against its hold rect on
// centre + height under the same reasoning as before (the
// block's width is pose-dependent by design - shrink-wrapped
// in the splash pose, full-width in the menu pose); S2
// extends to the icon (both keep the parent brandBlock across
// every sample); N1/N2/N3/S1/S3/SIZE/S5 judge the title
// exactly as before - it rides the block, and its painted
// continuity is still the failure property that started this
// drive; GAP keeps the hold's 26px, now the block's own
// internal gap. OVERLAP is RETIRED: its premise (the icon
// fading at the flip while the title rises past it) no
// longer exists. In its place the BLOCK checks judge
// Andrew's explicit requirement - they move together, with
// no glitches - on the failure properties themselves:
// BLOCK1 the icon-to-title gap stays 26 +/- 2px on every
// flight sample from the hold to the settle; BLOCK2 BOTH
// opacities stay at 1 through the whole rise (every
// post-flip sample to settle: icon and title effective
// opacity >= .99 - no fade, either way); BLOCK3 the block's
// horizontal centre does not drift (centre-x spread across
// the flight within 2px - the rise is purely vertical). N4
// re-pins to the block. SLOT/CLEAR are untouched (the
// title's landed geometry is the 1.159 slot by
// construction). drive132 S1 re-pins in the same release
// (the SNOW ROUTE text; the icon's arrival read as effective
// opacity through the block).
// Beta 1.163 (Andrew's correction + landing pick, 2026-11-10):
// two changes, both in his words. (1) THE ENTRANCE is the
// original choreography again - "I wanted to keep the original
// animation where the icon fades in, then the text slides in
// like the original, and then they both move up together":
// 1.162's shared block fade (one release) is retired; the
// icon's own .35s fade at 1.25s (splashIconIn) and the title's
// own .65s slide at 1.5s (splashSlide) are restored on the
// children inside #brandBlock, byte-for-byte the through-1.161
// rules (the caps text stands). The RISE is 1.162's, untouched:
// at the flip arm() FLIPs the block and the pair travel as one
// rigid unit. Judged here: SEQ2 restores its 1.161 form (the
// icon's own fade alone: fully in from 1.7s); SEQ3 keeps its
// hold window with its justification restored (the slide's
// opacity completes at ~1.85s and it settles at 2.15s); SEQ1's
// dark window is unchanged in form (both children sit at
// opacity 0 before 1.2s - by their own rules now, not the
// block's); S8's justification returns to the separate
// arrivals. BLOCK1-3 still judge the RISE only, unweakened:
// during the flight the title's slide fill is identity
// (opacity 1, translateX(0)), so the gap, opacity and
// straightness measurements read the block's travel exactly
// as in 1.162. (2) THE LANDING drops 24px: his landing-samples
// pick (Option B - 24 lower of today's / 24 / 48 / 72), on the
// axis he corrected himself - not the start ("I didn't mean
// the animation has to start lower") but the menu landing
// ("the final position for the next menu is too high up - I
// want it closer"). The block's menu pose top moves
// calc(21% - 143px) -> calc(21% - 119px); the title's landed
// centre moves from the 21% line + 72 to the 21% line + 96.
// SLOT re-pins to +96; CLEAR re-measures its margin at the
// lower landing (the safeguard stands: a non-positive margin
// stops the ship). The splash START - the centred hold - does
// not move, and the block's top clearance only grows.
// drive132 S1's rationale re-pins in the same release (the
// fade is the icon's own again; its effective-opacity read
// stands).
//
// Re-pin (2026-11-10, Andrew's approval - tests only, the app
// unchanged): Beta 1.164 moved the landing itself (the block
// pose calc(35.49% - 209.42px), his halved-gap rule) on his
// direct no-battery order, so SLOT's 1.163 pin (the 21% line
// + 96) went stale and failed by exactly 40.0 px at this
// viewport on every build 1.164-1.167 - the failing check
// behind the GitHub failure emails he objected to. The pin
// now reads the MEASURED landing: the settled centre-y was
// sampled with this drive's own snippet on the merged build
// at three viewport heights (900/844/740 -> centres
// 324.98/305.11/268.20, the title riding exactly 215.00 px
// below the block's rendered pose top at every height), so
// centre = 0.3549H + 5.58 with residuals <= 0.01 px and the
// +/-2 px tolerance untouched. CLEAR's wording rolls to the
// 1.164 landing with it; its margin at this viewport measures
// 40.02 px - the halved gap itself.
// Beta 1.178 (Andrew, 2026-11-12 - variant A, 'Cut', picked from
// the intro-transition demo): the brand no longer rises into the
// menu. The splash is UNCHANGED (dark window, the icon's own fade
// at 1.25s, the title's own slide at 1.5s, the hold, the 2700ms
// floor - SEQ1-3, S1, S2, GAP and the hold-scoped SIZE judge it
// exactly as before), and at arm() the whole brand layer cuts to
// display:none (#brandLayer.cut) in the same synchronous block
// that shows the menu: the icon + title are at full paint in the
// hold and absent from the next frame - no fade, no drift, no
// scale, no travel. The doors menu stands solo in every state
// (.cut is never removed; the pane round trips below now judge
// ABSENCE everywhere). The pills fade in on the pane's own .35s
// fade (no delay, no 14px rise - the 1.153 lowered start retires
// with the flight).
// RETIRED with the flight they judged (named here so the roster
// change is explicit, not silent): F0 (the FLIP's from-value),
// N1 (first painted frame = hold frame), N2 (painted through the
// flight), N3 (the easing continuity bound and its bezier
// machinery), S3/S5 (the rise and its mid-rise samples), SIZE's
// flight scope, BLOCK1-3 (togetherness in travel), DURATION
// (the 1.3s band), N4 (the block at its menu pose), SLOT/CLEAR
// (the landed title's slot and clearance). In their place the
// CUT family measures the new design's failure properties
// directly: CUT0 no transform transition ever runs on
// #brandBlock (the trace's transitionstart/end hooks stay
// silent); CUT1 no post-flip sample paints the title (and the
// hold DID paint it - the disappearance is measured against a
// present brand, not a missing one); CUT2 no post-flip sample
// shows the brand at partial opacity, icon or title (a fade-out
// in place of the cut fails here); CUT3 at rest the layer
// computes display:none under .cut and the block carries no
// inline transform/transition residue. TITLE1-5 invert: the
// title is absent on the main pane (TITLE1, where the snow
// stays present) and never returns across the round trips
// (TITLE3/TITLE5); SNOW6's snow lifetime is unchanged - its
// nav waits now key on the canvas's own fade (through 1.177
// the title's shared .away fade was the settle proxy; the
// title has no fade left to proxy with). SOLO replaces
// SLOT/CLEAR's geometry duty for the menu itself: both pills
// fully in bounds on the brand-free menu. SNOW5's handoff
// window re-bases from the title's settle (there is none) to
// the fixed 1300ms after the flip - the span the retired
// flight used to occupy, and a superset of the menu's own
// .65s slide-home the twitch would ride - while its pair
// floor (12) and jump bound (10px, zero violations) stand
// exactly as they were: the property is unchanged, only the
// window's anchor moved.
// Beta 1.180 (Andrew, 2026-11-12): the splash title is REMOVED.
// The icon is the only brand element: #splashTitle and its slide-in
// are gone, and the brand layer's existing centring places the
// icon's 168px box at the splash viewport centre. The trace below
// therefore samples #splashIcon as the sole brand subject (its rect
// rides the trace's x/y/w/h/cx/cy fields, exactly where the title's
// rect used to ride). Judged now: SEQ1's dark window is the icon's
// alone; SEQ2 keeps the icon's own 1.25s fade; CENTRE measures the
// hold icon's rendered centre against the viewport centre; HOLD1
// replaces SEQ3 (the settled title slide it judged no longer
// exists) with the icon fully in AND centred from 2.3s to the flip;
// ICONSIZE replaces SIZE+GAP (both were title geometry - there is
// no gap with no second element); CUT1/CUT2 judge the icon's cut;
// the TITLE round-trip family becomes the BRAND family, read on
// #brandLayer itself (the element is absent in every menu state,
// as 1.178 already made it). The boot tail's re-anchored
// animationend trigger (icon fade, recalibrated breath, same
// ~2.3s landing, 2.6s fallback still fallback-only) is judged by
// drive132's S5 window. Everything else - snow, pills, rows, the
// 2700ms floor in S8, the cut mechanics - stands as at 1.178.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

await ev(`(() => {
  if (window.__splashTraceOn) return 'already';
  window.__splashTraceOn = true;
  window.__splashTrace = [];
  window.__splashFrom = null;
  var R2 = function (n) { return Math.round(n * 100) / 100; };
  var step = function () {
    var ti = document.getElementById('splashIcon'); // Beta 1.180: the icon is the sole brand subject (see header)
    var rm = document.getElementById('routeMenu');
    if (ti) {
      if (!ti.__mark) ti.__mark = 'same-node';
      var bb = document.getElementById('brandBlock');
      if (bb && !bb.__toHooked) { bb.__toHooked = true; bb.addEventListener('transitionend', function (e) { if (e.propertyName === 'transform' && !window.__splashTo) window.__splashTo = { t: Math.round(performance.now()) }; }); }
      if (bb && !window.__splashFromHooked) { window.__splashFromHooked = true; bb.addEventListener('transitionstart', function () { var r = bb.getBoundingClientRect(); window.__splashFrom = { t: Math.round(performance.now()), x: R2(r.left), y: R2(r.top), w: R2(r.width), h: R2(r.height) }; }); }
      var r = ti.getBoundingClientRect();
      var op = 1, vis = true, el = ti;
      while (el && el.nodeType === 1) { var cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') { vis = false; break; } op = op * parseFloat(cs.opacity); if (el === document.documentElement) break; el = el.parentElement; }
      var ic = document.getElementById('splashIcon');
      var ir = ic ? ic.getBoundingClientRect() : null;
      var iop = 1;
      if (ic) { var el2 = ic; while (el2 && el2.nodeType === 1) { var cs2 = getComputedStyle(el2); iop = iop * parseFloat(cs2.opacity); if (el2 === document.documentElement) break; el2 = el2.parentElement; } }
      var br2 = bb ? bb.getBoundingClientRect() : null;
      var bop = 1;
      if (bb) { var el3 = bb; while (el3 && el3.nodeType === 1) { var cs3 = getComputedStyle(el3); bop = bop * parseFloat(cs3.opacity); if (el3 === document.documentElement) break; el3 = el3.parentElement; } }
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
      window.__splashTrace.push({ t: Math.round(performance.now()), x: R2(r.left), y: R2(r.top), w: R2(r.width), h: R2(r.height), cx: R2(r.left + r.width / 2), cy: R2(r.top + r.height / 2), parent: ti.parentElement ? ti.parentElement.id : '', mark: ti.__mark || '', vis: vis, op: R2(op), painted: vis && op >= 0.99, shown: rm ? rm.classList.contains('show') : false, rmOp: rcs ? rcs.opacity : '', rmVis: rcs ? rcs.visibility : '', rmTx: rcs ? rcs.transform : '', paneOp: pane ? getComputedStyle(pane).opacity : '', btnH: btn ? R2(btn.getBoundingClientRect().height) : -1, ix: ir ? R2(ir.left) : -1, iy: ir ? R2(ir.top) : -1, iw: ir ? R2(ir.width) : -1, ih: ir ? R2(ir.height) : -1, iop: R2(iop), ipar: ic && ic.parentElement ? ic.parentElement.id : '', bx: br2 ? R2(br2.left) : -1, by: br2 ? R2(br2.top) : -1, bw: br2 ? R2(br2.width) : -1, bh: br2 ? R2(br2.height) : -1, bcx: br2 ? R2(br2.left + br2.width / 2) : -1, bop: R2(bop), tp: !!document.getElementById('splashTitle'), vw: window.innerWidth, vh: window.innerHeight, sn: snArr, snCx: snCx });
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
const lastS = trace.length ? trace[trace.length - 1] : null;
const parents = [...new Set(trace.map(s => s.parent))];
const iparents = [...new Set(trace.map(s => s.ipar))];
const box = b => b ? ('[x' + b.x + ' y' + b.y + ' w' + b.w + ' h' + b.h + ']') : 'none';
ok('S1 the icon is SETTLED in the splash hold before the flip (last 3 hold samples agree within 1.5px) | hold box ' + box(hold) + ' spread ' + holdSpread.toFixed(1) + 'px over ' + pre.length + ' hold samples',
  pre.length >= 3 && holdSpread <= 1.5);
ok('CENTRE the hold icon is DEAD CENTRE in the splash viewport (Beta 1.180): its rendered centre (' + (hold ? hold.cx : 'n/a') + ', ' + (hold ? hold.cy : 'n/a') + ') against the viewport centre (' + (hold ? (hold.vw / 2) : 'n/a') + ', ' + (hold ? (hold.vh / 2) : 'n/a') + ') - offsets ' + (hold ? Math.abs(hold.cx - hold.vw / 2).toFixed(2) : 'n/a') + 'px x, ' + (hold ? Math.abs(hold.cy - hold.vh / 2).toFixed(2) : 'n/a') + 'px y (tolerance 2px; measured on the rendered box, not the CSS that claims it)',
  !!hold && Math.abs(hold.cx - hold.vw / 2) <= 2 && Math.abs(hold.cy - hold.vh / 2) <= 2);
ok('CUT0 NO TRANSITION (Beta 1.178): no transform transition ever runs on #brandBlock - the trace hooks for transitionstart/transitionend on the block never fired (from ' + JSON.stringify(fromBox) + ', to ' + JSON.stringify(toBox) + '); the 1.162-1.177 FLIP is gone, so there is no flight to start or end',
  fromBox === null && toBox === null);
ok('S2 ONE icon lives in ONE brand block through both scenes: the icon parent NEVER changes across all ' + trace.length + ' samples (Beta 1.180: the only child of #brandBlock from the first frame to the settle - no reparent, no swap) | icon parents seen: ' + JSON.stringify(iparents) + ', end mark ' + (lastS ? lastS.mark : 'none'),
  trace.length > 10 && iparents.length === 1 && iparents[0] === 'brandBlock' && !!lastS && lastS.mark === 'same-node');
const paintedPost = post.filter(sv => sv.painted).length;
ok('CUT1 THE CUT (Beta 1.178, brand subject re-pinned at 1.180): the icon IS painted in the hold (last hold sample painted: ' + !!(hold && hold.painted) + ', and NO sample in the whole trace ever finds a #splashTitle: ' + trace.every(sv => sv.tp === false) + ') and in NO frame after the flip - ' + paintedPost + ' painted icon samples among ' + post.length + ' post-flip samples; the icon does not travel into the menu, ride a parent ramp, or reappear - it is simply gone from the flip frame on',
  !!hold && hold.painted === true && post.length > 0 && paintedPost === 0 && trace.every(sv => sv.tp === false));
const fadeI = post.filter(sv => sv.iop > 0.01 && sv.iop < 0.99).length;
ok('CUT2 NO FADE (Beta 1.178): no post-flip sample shows the icon at partial opacity - icon fade frames: ' + fadeI + ' (an opacity fade-out in place of the cut would pass through such frames on its way down; the display cut passes through none)',
  post.length > 0 && fadeI === 0);
const sizeDev = (hold && pre.length) ? Math.max(...pre.map(sv => Math.max(Math.abs(sv.h - hold.h), Math.abs(sv.w - hold.w)))) : 999;
ok('ICONSIZE the icon NEVER changes size during the splash (Beta 1.180: the 168px box is the whole brand now): box ' + (hold ? hold.w : -1) + 'x' + (hold ? hold.h : -1) + 'px at the hold, worst deviation ' + sizeDev.toFixed(1) + 'px across ' + pre.length + ' hold samples',
  !!hold && sizeDev <= 2 && Math.abs(hold.w - 168) <= 2 && Math.abs(hold.h - 168) <= 2);
ok('S7 the menu buttons arrive: at settle the main pane is fully opaque with the Choose button at full height | ' + JSON.stringify({ paneOp: lastS ? lastS.paneOp : 'none', btnH: lastS ? lastS.btnH : -1 }),
  !!lastS && lastS.paneOp === '1' && lastS.btnH > 30);
ok('S8 the boot gate flips at the Beta 1.160 floor (flip at ' + (flipIdx >= 0 ? trace[flipIdx].t : -1) + 'ms on the page clock; arm() holds a 2700ms splash floor on the animated path - the flip lands after the icon fade-in and the hold (Beta 1.180: the icon 1.25s fade is the only entrance left; the title and its 1.5s slide are retired), so it cannot precede 2400ms on this clock - and the 6000ms escape still caps a stalled boot well under the 12000ms ceiling)',
  flipIdx >= 0 && trace[flipIdx].t >= 2400 && trace[flipIdx].t < 12000);
const darkSamples = trace.filter(s => s.t <= 1200);
const darkWorstI = darkSamples.reduce((m, s) => Math.max(m, s.iop), 0);
ok('SEQ1 DARK WINDOW (Beta 1.160, Option 3; brand subject re-pinned at 1.180): before 1.2s the icon is NOT painted - ' + darkSamples.length + ' trace samples at t <= 1200ms (first at ' + (trace.length ? trace[0].t : -1) + 'ms), worst icon effective opacity ' + darkWorstI.toFixed(3) + ' (must stay <= .05; the launch still is plain blue to match - the icon sits out the iOS handoff from both sides; there is no title left to keep dark)',
  darkSamples.length >= 5 && darkWorstI <= 0.05);
const flipT2 = flipIdx >= 0 ? trace[flipIdx].t : -1;
const iconIn = trace.filter(s => s.t >= 1700 && flipT2 > 0 && s.t < flipT2 && s.iop >= 0.99);
ok('SEQ2 the icon is FULLY IN after its 1.25s fade and before the flip (Beta 1.163: the 1.161 form restored - the fade is the icon\'s OWN again (splashIconIn, .35s from 1.25s, complete at 1.6s), as Andrew directed; Beta 1.162 judged the block\'s shared arrival here for one release): ' + iconIn.length + ' trace samples in [1700ms, flip) with icon effective opacity >= .99' + (iconIn.length ? ' (first at ' + iconIn[0].t + 'ms)' : ''),
  iconIn.length >= 1);
const holdIn = trace.filter(s => s.t >= 2300 && flipT2 > 0 && s.t < flipT2 && s.iop >= 0.99 && Math.abs(s.cx - s.vw / 2) <= 2 && Math.abs(s.cy - s.vh / 2) <= 2);
ok('HOLD1 the icon is fully in AND still dead centre through the hold before the flip (Beta 1.180: replaces SEQ3, whose subject - the settled title slide - no longer exists): ' + holdIn.length + ' trace samples in [2300ms, flip) with icon effective opacity >= .99 and rendered centre within 2px of the viewport centre' + (holdIn.length ? ' (first at ' + holdIn[0].t + 'ms)' : ''),
  holdIn.length >= 1);
// CUT3 + SOLO (Beta 1.178) replace N4/SLOT/CLEAR: there is no
// resting pose to pin and no landed title to clear the button -
// the resting facts are the layer's cut state and the pills'
// own geometry on the brand-free menu.
let restCut = null;
try {
  restCut = await ev(`(() => { const bl = document.getElementById('brandLayer'); const bb = document.getElementById('brandBlock'); if (!bl || !bb) return ''; const cs = getComputedStyle(bl); return JSON.stringify({ cut: bl.classList.contains('cut'), disp: cs.display, tx: bb.style.transform, tr: bb.style.transition }); })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
} catch (e) { restCut = null; }
ok('CUT3 AT REST the brand layer stands cut: class .cut present, computed display ' + (restCut ? restCut.disp : 'n/a') + ', and #brandBlock carries no inline transform (' + JSON.stringify(restCut ? restCut.tx : null) + ') or transition (' + JSON.stringify(restCut ? restCut.tr : null) + ') residue - no leftover inline state from a flight that no longer exists',
  !!restCut && restCut.cut === true && restCut.disp === 'none' && restCut.tx === '' && restCut.tr === '');
let solo = null;
try {
  solo = await ev(`(() => { const meas = id => { const b = document.getElementById(id); if (!b) return null; const r = b.getBoundingClientRect(); return { l: Math.round(r.left * 10) / 10, t: Math.round(r.top * 10) / 10, r: Math.round(r.right * 10) / 10, b: Math.round(r.bottom * 10) / 10 }; }; return JSON.stringify({ a: meas('rmChoose'), b: meas('rmCreate'), iw: window.innerWidth, ih: window.innerHeight }); })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
} catch (e) { solo = null; }
const inBounds = r => !!r && r.l >= -0.5 && r.t >= -0.5 && r.r <= solo.iw + 0.5 && r.b <= solo.ih + 0.5 && r.r > r.l && r.b > r.t;
ok('SOLO the two pills stand alone and FULLY IN BOUNDS on the brand-free menu (the design-QA bound for the touched state): Choose ' + JSON.stringify(solo ? solo.a : null) + ', Create ' + JSON.stringify(solo ? solo.b : null) + ' inside the ' + (solo ? solo.iw : 'n/a') + 'x' + (solo ? solo.ih : 'n/a') + ' viewport',
  !!solo && inBounds(solo.a) && inBounds(solo.b));

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
const snWin = flipIdx >= 0 ? post.filter(sv => sv.t - trace[flipIdx].t <= 1300) : []; // Beta 1.178: the window is the fixed 1300ms after the flip (see the header) - the brand has no settle to end it
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
ok('SNOW5 NO TWITCH: the painted snow field never jumps sideways across the splash-to-menu handoff - the field centroid (pixel centroid of the one canvas, screen coordinates) moves at most ' + snWorst.toFixed(1) + 'px between consecutive trace samples in the 1300ms after the flip (bound 10px per pair; ' + snPairs + ' pairs judged, ' + snSkip + ' starved pairs over 120ms excluded, ' + snViol + ' violations; legitimate motion is sway at <= 7.6px/s per flake plus <= ~5px respawn steps)',
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
  r.tMain0 = await effOp('brandLayer');
  r.cvMain0 = await effOp('snowCv');
  await clickId('rmChoose');
  r.toList = await waitFor(async () => (await paneOn('rmListPane')) && (await effOp('brandLayer')) <= 0.05 && (await effOp('snowCv')) <= 0.05, 3000); // Beta 1.178: the canvas term is new - through 1.177 the title's own .away fade (same .3s, same showRmPane call) was the settle proxy for the canvas read below; the title is display:none now and cannot proxy, so the wait keys on the canvas itself
  r.tList = await effOp('brandLayer');
  r.cvList = await effOp('snowCv');
  r.rows = await ev(`(() => { const meas = row => { const rr = row.getBoundingClientRect(); const out = { rcx: rr.left + rr.width / 2 }; const nm = row.querySelector('.routeName'), ar = row.querySelector('.routeArea'); if (nm) { const g = document.createRange(); g.selectNodeContents(nm); const t = g.getBoundingClientRect(); out.nOff = Math.round(Math.abs(t.left + t.width / 2 - out.rcx) * 10) / 10; const cs = getComputedStyle(nm); out.nSize = cs.fontSize; out.nWeight = cs.fontWeight; } if (ar) { const g2 = document.createRange(); g2.selectNodeContents(ar); const t2 = g2.getBoundingClientRect(); out.aOff = Math.round(Math.abs(t2.left + t2.width / 2 - out.rcx) * 10) / 10; } const rcs = getComputedStyle(row); out.bg = rcs.backgroundColor; out.sh = rcs.boxShadow; out.rad = rcs.borderRadius; out.ff = rcs.fontFamily; return out; }; const rows = [...document.querySelectorAll('#rmRoutes .routeRow')]; const btn = document.getElementById('rmCreate'); const bcs = btn ? getComputedStyle(btn) : null; return JSON.stringify({ rows: rows.map(meas), btnFf: bcs ? bcs.fontFamily : '', btnSize: bcs ? bcs.fontSize : '' }); })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
  await clickId('rmBack');
  r.toMain1 = await waitFor(async () => (await paneOn('rmMain')) && (await effOp('snowCv')) >= 0.99, 3000); // Beta 1.178: the wait no longer asks the title back - it never returns (TITLE3 asserts its absence); it keys on the snow's return fade instead, which the cvMain1 read below judges
  r.tMain1 = await effOp('brandLayer');
  r.cvMain1 = await effOp('snowCv');
  await clickId('rmCreate');
  r.toCreate = await waitFor(async () => (await paneOn('rmCreatePane')) && (await effOp('brandLayer')) <= 0.05, 3000);
  await clickId('crDoorList');
  r.toCity = await waitFor(() => paneOn('rmCityListPane'), 3000);
  await waitFor(() => ev(`!!document.querySelector('#crCityList .rmNote') || document.querySelectorAll('#crCityList .routeRow').length > 1`).then(x => x === true).catch(() => false), 6000);
  await waitFor(async () => (await effOp('snowCv')) <= 0.05, 3000); // Beta 1.178: settle the canvas fade before the city-list read (same proxy loss as toList)
  r.cityRow = await ev(`(() => { const box = document.getElementById('crCityList'); if (!box || typeof routeRowShell !== 'function') return null; const row = routeRowShell('button', 'Mississauga', '12,345 streets · ready to load', { chevron: true }); box.appendChild(row); const rr = row.getBoundingClientRect(); const rcx = rr.left + rr.width / 2; const nm = row.querySelector('.routeName'), ar = row.querySelector('.routeArea'); const g = document.createRange(); g.selectNodeContents(nm); const t = g.getBoundingClientRect(); const g2 = document.createRange(); g2.selectNodeContents(ar); const t2 = g2.getBoundingClientRect(); const cs = getComputedStyle(nm); return JSON.stringify({ nOff: Math.round(Math.abs(t.left + t.width / 2 - rcx) * 10) / 10, aOff: Math.round(Math.abs(t2.left + t2.width / 2 - rcx) * 10) / 10, nSize: cs.fontSize }); })()`).then(x => typeof x === 'string' && x ? JSON.parse(x) : null);
  r.tCity = await effOp('brandLayer');
  r.cvCity = await effOp('snowCv');
  await clickId('crCityListBack');
  await waitFor(() => paneOn('rmCreatePane'), 3000);
  await clickId('rmBack2');
  r.toMain2 = await waitFor(async () => (await paneOn('rmMain')) && (await effOp('snowCv')) >= 0.99, 3000); // Beta 1.178: same - TITLE5 asserts the absence
  r.tMain2 = await effOp('brandLayer');
  nav = r;
} catch (e) { nav = null; }
ok('BRAND1 (Beta 1.180) the brand is ABSENT on the main pane itself (brand layer effective opacity ' + (nav ? nav.tMain0 : 'n/a') + ') - the doors stand solo from the first menu frame, and no #splashTitle exists anywhere in the session - while the snow stays present with the menu (canvas effective opacity ' + (nav ? nav.cvMain0 : 'n/a') + '): the cut took the brand only, never the snow',
  !!nav && nav.tMain0 <= 0.05 && nav.cvMain0 >= 0.99);
ok('BRAND2 the brand stays gone on the route list after tapping Choose (brand layer effective opacity ' + (nav ? nav.tList : 'n/a') + ', reached the pane: ' + (nav ? nav.toList : 'n/a') + ')',
  !!nav && nav.toList && nav.tList <= 0.05);
ok('BRAND3 (Beta 1.178/1.180) the brand does NOT return on navigating back to the main pane (brand layer effective opacity ' + (nav ? nav.tMain1 : 'n/a') + ') - the cut is for the whole session',
  !!nav && nav.toMain1 && nav.tMain1 <= 0.05);
ok('BRAND4 the brand is gone on the create doors AND the city list too (create pane reached: ' + (nav ? nav.toCreate : 'n/a') + '; city list brand opacity ' + (nav ? nav.tCity : 'n/a') + ')',
  !!nav && nav.toCreate && nav.toCity && nav.tCity <= 0.05);
ok('BRAND5 (Beta 1.178/1.180) the brand is still absent at the main pane after the full create-side round trip (brand layer effective opacity ' + (nav ? nav.tMain2 : 'n/a') + ')',
  !!nav && nav.toMain2 && nav.tMain2 <= 0.05);
ok('SNOW6 the snow hides in the sub-panes and returns at the main pane (the brand is gone everywhere now, the snow lifetime itself is unchanged): canvas effective opacity on the route list ' + (nav ? nav.cvList : 'n/a') + ', on the city list ' + (nav ? nav.cvCity : 'n/a') + ', back at the main pane ' + (nav ? nav.cvMain1 : 'n/a'),
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
