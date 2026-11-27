/* Beta 1.158 (Andrew, 2026-11-09: picked "Falls and settles" from the
   falling-snow examples page): snowfall for the boot scene and the
   blue menus (every blue menu since 1.299 - never the map).
   Parameters extracted from the examples artifact's built source (its
   "settles" configuration): 85 flakes, radius 1.1-3.6 px, fall speed
   34-72 px/s, sway amplitude 7 px at sway speed 0.7 (per-flake frequency
   x0.7-1.3, amplitude x0.5-1.2), flake alpha .9 x per-flake .55-1 with a
   .6 s fade-in; the accumulation runs a 16 s cycle (builds ~9 s ease-out,
   rests 3 s, melts 3 s, empty 1 s) as a ground profile up to 20 px high
   shaped by 0.72 + 0.16 sin(x .045 + 1.7) + 0.12 sin(x .013 + .4), filled
   with the mock's white gradient at alpha min(1, amount x 1.4).
   The one app adaptation that stands from 1.158: flakes respawn at the
   TOP and fall the full height of the scene (the mock respawned them in
   a band around the title - a replay framing device).
   Beta 1.159 (Andrew's directed fix, on his phone test of 1.158): he
   felt a consistent sideways TWITCH at the splash-to-menu handoff,
   "like clockwork" at the same instant every cold open - and directed
   the fix himself: one continuous layer, the way the title was fixed
   at 1.155. The 1.158 engine drove TWO canvases from this state -
   #snowCv inside #splash and #snowCvM inside #routeMenu - and the
   menu's .boot entrance rides a translateX(-26px) slide home plus an
   opacity ramp, so the menu-half field physically slid sideways while
   fading in over the static splash-half field: the twitch. Now there
   is ONE canvas - #snowCv (inside #splash through 1.298, a body-level
   fixed layer since 1.299; the canvas is never reparented at runtime
   and never transformed) - and while the scene is live the engine
   carries body.snow-scene, under which the menus' backgrounds are
   transparent (head.html), so the single field paints through
   under the menu's panes: behind the title (the brand layer) and
   behind the pills in both halves of the scene, never covering text
   or controls. park() removes the class when no blue menu is open
   (1.299: it resumes when one opens), so the map and reduced-motion
   boots (the engine never starts there) keep the app's own surfaces.
   A resize preserves flake positions PROPORTIONALLY
   (the field scales, it does not re-scatter); no resize can occur
   mid-transition, since nothing in the transition changes the
   viewport or the canvas's box. Lifetime mirrors the brand layer's:
   it starts at boot, pauses while the page is hidden (rAF halts; the
   dt clamp keeps the resume jump-free), hides in the menu's
   sub-panes alongside the title (showRmPane carries .away on the
   canvas and on #brandLayer alike) and returns at the main pane,
   and parks when no blue menu
   is open (1.299 - the boot-only lifetime ended there) - no snow on
   the map, ever. Under reduced motion it never
   starts (the app's standing convention - the same media query arm()
   branches on). window.__snow is the test handle drive180 measures
   (presence, motion, accumulation state, and - at 1.159 - the flakes'
   RENDERED x: base + sway offset, the painted position).
   Beta 1.161 (Andrew, 2026-11-10: approved Stage E of the
   snow-realism examples page - "Stage E is perfect" - with his
   condition stated in the same breath: the snow keeps
   accumulating like the original, just higher up). The FALLING
   is ported from that sample's recipe: three layers - a dense
   field of tiny sharp specks (one per ~600 px^2 of scene,
   radius .5-1.1 px, fall 14-30 px/s, a gentle sway and a
   per-speck brightness twinkle), a mid layer of soft flakes
   (one per ~4400 px^2, radius 1.8-3.4 px, fall 26-48 px/s)
   drawn from a pre-rendered radial-gradient sprite, and a few
   rare, very large, extra-soft near blobs (one per ~45000 px^2,
   capped 4-8, radius 26-52 px, fall 34-56 px/s - slightly
   faster than the specks) drawn from a pre-rendered extra-soft
   sprite at low alpha: out-of-focus flakes passing near the
   lens, which is why they fall THROUGH the ground plane and
   out of the frame instead of landing on it. Slow, calm,
   dreamy - no gusts, no bursts. Every sprite is rendered once
   to an offscreen canvas at init; the frame loop only draws.
   Layer sizes scale with the scene's area, so the sample's
   density is what any screen size sees. The ACCUMULATION is
   untouched except its peak: settleAmount's 16 s build/rest/
   melt cycle, the two-sine ground profile and the paint are
   byte-identical to 1.158-1.160; only the peak value rises,
   20 -> 58 px - 58 being the rendered height of the app's
   bottom bar (#tabBar: Locate / Routes / Home / Clear /
   Settings), measured in the assembled page at 390x844 (and
   identically at 420x900 - the bar's height is
   width-independent: 6 px padding + a 46 px tab item + 6 px),
   so the finished snow band stands about as tall as that bar,
   as Andrew asked. drive180's SNOW9 proves the painted crest
   reaches the new peak.
   Beta 1.192: the bar takes the standard tab-bar height and
   its rendered height falls 58 -> 51 px (4 px padding + a
   44 px tab item + 3 px), so the peak follows it down,
   58 -> 51 - the crest still stands exactly as tall as the
   bar, which was the 1.161 condition. drive180's SNOW9 pin
   is re-pinned to 51 in the same change.
   Beta 1.299: the one field serves every blue menu (Andrew: the
   same snow as the splash, identical). It parks when no menu is
   open - clock frozen, field kept, so the pile persists across
   menus in session memory - and resumes with the menu's first
   frame. Specks draw from a sprite now: path fills cost frames. */
(function snowLayer() {
  var cvS = document.getElementById('snowCv');
  var handle = /** @type {any} */ ({ cycle: 16, running: function () { return false; }, amount: function () { return 0; }, ground: function () { return 0; }, flakes: /** @returns {any[]} */ function () { return []; } });
  window.__snow = handle;
  if (!cvS) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var SPECK = { per: 600, rMin: 0.5, rMax: 1.1, vMin: 14, vMax: 30, swayAmp: 3.5, swaySpeed: 0.5, alpha: 0.62 };
  var MID = { per: 4400, rMin: 1.8, rMax: 3.4, vMin: 26, vMax: 48, swayAmp: 7, swaySpeed: 0.6, alpha: 0.85 };
  var BLOB = { per: 45000, rMin: 26, rMax: 52, vMin: 34, vMax: 56, swayAmp: 12, swaySpeed: 0.25, alpha: 0.3 };
  /** @param {number} a @param {number} b @returns {number} */
  function rand(a, b) { return a + Math.random() * (b - a); }
  var W = 0, H = 0, specks = /** @type {SnowFlake[]} */ ([]), mids = /** @type {SnowFlake[]} */ ([]), blobs = /** @type {SnowFlake[]} */ ([]), clock = 0, lastTs = 0, raf = 0, running = false, frames = 0, lastFrame = 0;
  var ctxS = cvS.getContext('2d');
  if (!ctxS) return;
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var oW = W, oH = H;
    W = window.innerWidth; H = window.innerHeight;
    cvS.width = Math.round(W * dpr); cvS.height = Math.round(H * dpr);
    ctxS.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (oW > 0 && oH > 0 && (W !== oW || H !== oH)) { var sx = W / oW, sy = H / oH;
    var all = specks.concat(mids, blobs);
    for (var i = 0; i < all.length; i++) { all[i].bx *= sx; all[i].y *= sy; } } // Beta 1.159: a resize scales the field proportionally - positions are preserved, never re-scattered (Beta 1.161: every layer scales)
  }
  /** @param {number} size @param {number[][]} stops @returns {AppElement} */
  function makeSprite(size, stops) {
    var c = document.createElement('canvas'); c.width = size; c.height = size;
    var g = c.getContext('2d');
    if (!g) return c;
    var grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (var i = 0; i < stops.length; i++) grad.addColorStop(stops[i][0], 'rgba(255,255,255,' + stops[i][1] + ')');
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    return c;
  }
  var speckSprite = makeSprite(32, [[0, 1], [0.75, 1], [1, 0]]); // Beta 1.299: the specks draw from a sprite too - per-frame path fills cost the menus their frames (drive226)
  var midSprite = makeSprite(64, [[0, 1], [0.35, 0.8], [0.7, 0.28], [1, 0]]); // Beta 1.161: the mid layer's soft flake, rendered once
  var blobSprite = makeSprite(256, [[0, 0.55], [0.45, 0.34], [0.75, 0.13], [1, 0]]); // Beta 1.161: the near blobs' extra-soft disc, rendered once
  /** @param {boolean} scatter @returns {SnowFlake} */
  function newSpeck(scatter) {
    return { bx: rand(0, W),
      y: scatter ? rand(-4, H) : -4,
      r: rand(SPECK.rMin, SPECK.rMax),
      v: rand(SPECK.vMin, SPECK.vMax),
      phase: rand(0, Math.PI * 2),
      swayFreq: SPECK.swaySpeed * rand(0.6, 1.4),
      amp: SPECK.swayAmp * rand(0.5, 1.3),
      o: rand(0.45, 1),
      tw: rand(1.2, 2.6),
      twPhase: rand(0, Math.PI * 2),
      age: scatter ? rand(0.6, 3) : 0 };
  }
  /** @param {boolean} scatter @returns {SnowFlake} */
  function newMid(scatter) {
    return { bx: rand(0, W),
      y: scatter ? rand(-6, H) : -6,
      r: rand(MID.rMin, MID.rMax),
      v: rand(MID.vMin, MID.vMax),
      phase: rand(0, Math.PI * 2),
      swayFreq: MID.swaySpeed * rand(0.7, 1.3),
      amp: MID.swayAmp * rand(0.6, 1.2),
      o: rand(0.6, 1),
      age: scatter ? rand(0.6, 3) : 0 };
  }
  /** @param {boolean} scatter @returns {SnowFlake} */
  function newBlob(scatter) {
    return { bx: rand(0, W),
      y: scatter ? rand(-60, H) : -60,
      r: rand(BLOB.rMin, BLOB.rMax),
      v: rand(BLOB.vMin, BLOB.vMax),
      phase: rand(0, Math.PI * 2),
      swayFreq: BLOB.swaySpeed * rand(0.7, 1.3),
      amp: BLOB.swayAmp * rand(0.7, 1.3),
      o: rand(0.7, 1),
      age: 0 };
  }
  function settleAmount() {
    var t = clock % 16;
    if (t < 9) { var u = t / 9; return 1 - Math.pow(1 - u, 3); }
    if (t < 12) return 1;
    if (t < 15) return 1 - (t - 12) / 3;
    return 0;
  }
  /** @param {number} x @param {number} amount @returns {number} */
  function groundHeightAt(x, amount) {
    var maxH = 51 * amount; // Beta 1.161: the peak rises 20 -> 58px - the measured height of the app's bottom bar (see the header); the cycle, the profile and the paint are otherwise byte-identical to 1.158-1.160, per Andrew's condition. Beta 1.192: 58 -> 51, following the bar's rendered height down by the same 7px (see the header)
    if (maxH <= 0) return 0;
    return maxH * (0.72 + 0.16 * Math.sin(x * 0.045 + 1.7) + 0.12 * Math.sin(x * 0.013 + 0.4));
  }
  /** @param {number} amount @returns {void} */
  function render(amount) {
    frames++; // Beta 1.299: the painted-frame count drive226 times the menus against
    var ctx = ctxS;
    ctx.clearRect(0, 0, W, H);
    if (amount > 0) {
      var grad = ctx.createLinearGradient(0, H - 51 * amount, 0, H); // Beta 1.173 (Andrew's call, 2026-11-11 - Carbon audit C-08): the fade anchors at the bank's actual crest, 58 x amount; it still anchored at H - 22, the 1.158 leftover from the 20 px peak, so since the peak rose in 1.161 the top ~36 px of the bank clamped to the flat first stop instead of shading. Beta 1.192: the anchor follows the peak, 58 -> 51
      grad.addColorStop(0, 'rgba(255,255,255,0.92)');
      grad.addColorStop(1, 'rgba(235,244,255,0.98)');
      ctx.beginPath();
      ctx.moveTo(0, H);
      var lastX = (Math.ceil(W / 6) + 1) * 6; // sample past the right edge so the canvas clips the wave there, never a closing chord
      for (var x = 0; x <= lastX; x += 6) ctx.lineTo(x, H - groundHeightAt(x, amount));
      ctx.lineTo(lastX, H);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.globalAlpha = Math.min(1, amount * 1.4);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    var i, f, fx;
    for (i = 0; i < specks.length; i++) { // Beta 1.161: the speck field - tiny, sharp, each twinkling on its own phase (Beta 1.299: drawn from speckSprite - the same disc, no per-frame path fill)
      f = specks[i];
      fx = f.bx + Math.sin(clock * f.swayFreq + f.phase) * f.amp;
      ctx.globalAlpha = SPECK.alpha * f.o * (0.55 + 0.45 * Math.sin(clock * f.tw + f.twPhase)) * Math.min(1, f.age / 0.6);
      var ds = f.r * 2;
      ctx.drawImage(speckSprite, fx - f.r, f.y - f.r, ds, ds);
    }
    for (i = 0; i < mids.length; i++) { // Beta 1.161: the mid layer - soft flakes from the pre-rendered sprite
      f = mids[i];
      fx = f.bx + Math.sin(clock * f.swayFreq + f.phase) * f.amp;
      ctx.globalAlpha = MID.alpha * f.o * Math.min(1, f.age / 0.6);
      var ms = f.r * 4;
      ctx.drawImage(midSprite, fx - ms / 2, f.y - ms / 2, ms, ms);
    }
    for (i = 0; i < blobs.length; i++) { // Beta 1.161: the near blobs - extra-soft discs passing in front, near the lens
      f = blobs[i];
      fx = f.bx + Math.sin(clock * f.swayFreq + f.phase) * f.amp;
      ctx.globalAlpha = BLOB.alpha * f.o;
      var bs = f.r * 2;
      ctx.drawImage(blobSprite, fx - f.r, f.y - f.r, bs, bs);
    }
    ctx.globalAlpha = 1;
  }
  function live() { // Beta 1.299: the scene is any open blue menu, plus the splash that carries the boot menu
    var rm = document.getElementById('routeMenu'), sm = document.getElementById('setMenu'), sp = document.getElementById('splash');
    if (sp && sp.classList.contains('go')) return true; // the pick fade: paint until finish() removes the splash
    if ((rm && (rm.classList.contains('open') || rm.classList.contains('show'))) || (sm && sm.classList.contains('open'))) return true;
    if (sp && sp.style.visibility !== 'hidden') return true; // the splash is up and not parked for Create
    return false;
  }
  function park() { // Beta 1.299: parking freezes the clock and keeps the field - the pile is held, not ended
    if (!running) return;
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    ctxS.clearRect(0, 0, W, H);
    document.body.classList.remove('snow-scene'); // no menu open: the menus' own opaque blue is their background again
  }
  // Liveness is judged by executed frames: the boot scene is never re-opened to revive a stopped chain.
  function resume() { // Beta 1.299: the first frame paints synchronously, with the menu's first frame
    if (running && performance.now() - lastFrame <= 400) return; // alive: a frame executed just now
    if (raf) window.cancelAnimationFrame(raf); // Beta 1.300: a stopped chain leaves a stale id - clear it before the restart
    running = true;
    lastTs = 0;
    document.body.classList.add('snow-scene');
    render(settleAmount());
    raf = window.requestAnimationFrame(loop);
  }
  function syncSnow() { // menu flips re-judge the scene: resume if live, park if not
    if (live()) resume(); else park();
  }
  /** @param {number} ts @returns {void} */
  function loop(ts) {
    if (!running) return;
    lastFrame = performance.now(); // the liveness stamp resume() judges
    if (!live()) { park(); return; }
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    clock += dt;
    var amount = settleAmount();
    var i, f;
    for (i = 0; i < specks.length; i++) {
      f = specks[i];
      f.age += dt;
      f.y += f.v * dt;
      if (f.y >= H - groundHeightAt(f.bx, amount) - f.r) specks[i] = newSpeck(false);
    }
    for (i = 0; i < mids.length; i++) {
      f = mids[i];
      f.age += dt;
      f.y += f.v * dt;
      if (f.y >= H - groundHeightAt(f.bx, amount) - f.r) mids[i] = newMid(false);
    }
    for (i = 0; i < blobs.length; i++) { // Beta 1.161: near-lens blobs do not land on the ground plane - they drift past it and out of the frame
      f = blobs[i];
      f.age += dt;
      f.y += f.v * dt;
      if (f.y - f.r > H) blobs[i] = newBlob(false);
    }
    render(amount);
    raf = window.requestAnimationFrame(loop);
  }
  resize();
  var area = W * H; // Beta 1.161: layer sizes follow the scene's area, so the approved sample's density is what any screen size sees
  var nSpeck = Math.min(1000, Math.round(area / SPECK.per)), nMid = Math.round(area / MID.per), nBlob = Math.max(4, Math.min(8, Math.round(area / BLOB.per)));
  // the speck count is CAPPED: density unchanged on phone-size screens, but uncapped counts billed huge screens thousands per frame
  for (var i = 0; i < nSpeck; i++) specks.push(newSpeck(true));
  for (var j = 0; j < nMid; j++) mids.push(newMid(true));
  for (var k = 0; k < nBlob; k++) blobs.push(newBlob(true));
  document.body.classList.add('snow-scene'); // Beta 1.159: while the scene is live the boot menu's background steps aside for the one field (head.html's body.snow-scene rule)
  var rzT = 0;
  window.addEventListener('resize', function () { window.clearTimeout(rzT); rzT = window.setTimeout(resize, 150); });
  running = true;
  handle.running = function () { return running; };
  handle.frames = function () { return frames; }; // Beta 1.299: drive226's frame-timing proof reads the painted count
  handle.amount = settleAmount;
  handle.ground = function () { return groundHeightAt(W / 2, settleAmount()); };
  handle.flakes = function () { var out = /** @type {{ x: number, y: number }[]} */ ([]);
    var push = /** @type {(f: SnowFlake) => void} */ (function (f) { out.push({ x: f.bx + Math.sin(clock * f.swayFreq + f.phase) * f.amp, y: f.y }); });
    specks.forEach(push); mids.forEach(push); blobs.forEach(push); return out; };
  // x is the RENDERED position (base + sway offset) - the painted one
  raf = window.requestAnimationFrame(loop);
  if (window.MutationObserver) { // Beta 1.299: menu class flips drive park/resume - the observer lands before the next paint
    /** @param {AppElement|null} el @param {any} attrs @returns {void} */
    var watch = function (el, attrs) { if (el) snowObs.observe(el, attrs); };
    var snowObs = new MutationObserver(syncSnow);
    watch(document.getElementById('routeMenu'), { attributes: true, attributeFilter: ['class'] });
    watch(document.getElementById('setMenu'), { attributes: true, attributeFilter: ['class'] });
    watch(document.getElementById('splash'), { attributes: true, attributeFilter: ['class', 'style'] });
    snowObs.observe(document.body, { childList: true }); // finish() removes the splash: the park signal
  }
})();