/* Beta 1.158 (Andrew, 2026-11-09: picked "Falls and settles" from the
   falling-snow examples page): snowfall for the boot/menu scene ONLY.
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
   is ONE canvas - #snowCv, inside #splash (a top-level fixed layer
   spanning the whole opening scene; the canvas is never reparented
   and never transformed) - and while the scene is live the engine
   carries body.snow-scene, under which #routeMenu.boot's background
   is transparent (head.html), so the single field paints through
   under the menu's panes: behind the title (the brand layer) and
   behind the pills in both halves of the scene, never covering text
   or controls. stop() removes the class when the scene ends for
   good, so the tab menu, the delete-return picker and reduced-motion
   boots (the engine never starts there) all keep the menu's own
   opaque blue. A resize preserves flake positions PROPORTIONALLY
   (the field scales, it does not re-scatter); no resize can occur
   mid-transition, since nothing in the transition changes the
   viewport or the canvas's box. Lifetime mirrors the brand layer's:
   it starts at boot, pauses while the page is hidden (rAF halts; the
   dt clamp keeps the resume jump-free), hides in the menu's
   sub-panes alongside the title (showRmPane carries .away on the
   canvas) and returns at the main pane, and stops for good once the
   boot scene ends (the pick fade's .bye / the layer's .off / the
   menu parked) - no snow anywhere else in the app, and it never
   restarts for the tab-mode menu. Under reduced motion it never
   starts (the app's standing convention - the same media query arm()
   branches on). window.__snow is the test handle drive180 measures
   (presence, motion, accumulation state, and - at 1.159 - the flakes'
   RENDERED x: base + sway offset, the painted position). */
(function snowLayer() {
  var cvS = document.getElementById('snowCv');
  var handle = { cycle: 16, running: function () { return false; }, amount: function () { return 0; }, ground: function () { return 0; }, flakes: function () { return []; } };
  window.__snow = handle;
  if (!cvS) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var CFG = { count: 85, rMin: 1.1, rMax: 3.6, vMin: 34, vMax: 72, swayAmp: 7, swaySpeed: 0.7, alpha: 0.9 };
  function rand(a, b) { return a + Math.random() * (b - a); }
  var W = 0, H = 0, flakes = [], clock = 0, lastTs = 0, raf = 0, running = false, deadFrames = 0;
  var ctxS = cvS.getContext('2d');
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var oW = W, oH = H;
    W = window.innerWidth; H = window.innerHeight;
    cvS.width = Math.round(W * dpr); cvS.height = Math.round(H * dpr);
    ctxS.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (oW > 0 && oH > 0 && flakes.length && (W !== oW || H !== oH)) { var sx = W / oW, sy = H / oH; for (var i = 0; i < flakes.length; i++) { flakes[i].bx *= sx; flakes[i].y *= sy; } } // Beta 1.159: a resize scales the field proportionally - positions are preserved, never re-scattered
  }
  function newFlake(scatter) {
    return { bx: rand(0, W), y: scatter ? rand(-4, H) : -4, r: rand(CFG.rMin, CFG.rMax), v: rand(CFG.vMin, CFG.vMax), phase: rand(0, Math.PI * 2), swayFreq: CFG.swaySpeed * rand(0.7, 1.3), amp: CFG.swayAmp * rand(0.5, 1.2), o: rand(0.55, 1), age: scatter ? rand(0.6, 3) : 0 };
  }
  function settleAmount() {
    var t = clock % 16;
    if (t < 9) { var u = t / 9; return 1 - Math.pow(1 - u, 3); }
    if (t < 12) return 1;
    if (t < 15) return 1 - (t - 12) / 3;
    return 0;
  }
  function groundHeightAt(x, amount) {
    var maxH = 20 * amount;
    if (maxH <= 0) return 0;
    return maxH * (0.72 + 0.16 * Math.sin(x * 0.045 + 1.7) + 0.12 * Math.sin(x * 0.013 + 0.4));
  }
  function render(amount) {
    var ctx = ctxS;
    ctx.clearRect(0, 0, W, H);
    if (amount > 0) {
      var grad = ctx.createLinearGradient(0, H - 22, 0, H);
      grad.addColorStop(0, 'rgba(255,255,255,0.92)');
      grad.addColorStop(1, 'rgba(235,244,255,0.98)');
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (var x = 0; x <= W; x += 6) ctx.lineTo(x, H - groundHeightAt(x, amount));
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.globalAlpha = Math.min(1, amount * 1.4);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      var fx = f.bx + Math.sin(clock * f.swayFreq + f.phase) * f.amp;
      ctx.globalAlpha = CFG.alpha * f.o * Math.min(1, f.age / 0.6);
      ctx.beginPath();
      ctx.arc(fx, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function sceneLive() {
    var bl = document.getElementById('brandLayer'), rm = document.getElementById('routeMenu'), sp = document.getElementById('splash');
    if (bl && (bl.classList.contains('bye') || bl.classList.contains('off'))) return false;
    if (rm && rm.classList.contains('bye')) return false;
    if (sp && !sp.classList.contains('go')) return true;
    if (rm && (rm.classList.contains('open') || rm.classList.contains('show'))) return true;
    return false;
  }
  function stop() {
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    ctxS.clearRect(0, 0, W, H);
    document.body.classList.remove('snow-scene'); // Beta 1.159: the scene is over for good - the route menu's own opaque blue is its background again from here on
  }
  function loop(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (!sceneLive()) { if (++deadFrames > 45) { stop(); return; } } else deadFrames = 0;
    clock += dt;
    var amount = settleAmount();
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.age += dt;
      f.y += f.v * dt;
      if (f.y >= H - groundHeightAt(f.bx, amount) - f.r) flakes[i] = newFlake(false);
    }
    render(amount);
    raf = window.requestAnimationFrame(loop);
  }
  resize();
  for (var i = 0; i < CFG.count; i++) flakes.push(newFlake(true));
  document.body.classList.add('snow-scene'); // Beta 1.159: while the scene is live the boot menu's background steps aside for the one field (head.html's body.snow-scene rule)
  var rzT = 0;
  window.addEventListener('resize', function () { window.clearTimeout(rzT); rzT = window.setTimeout(resize, 150); });
  running = true;
  handle.running = function () { return running; };
  handle.amount = settleAmount;
  handle.ground = function () { return groundHeightAt(W / 2, settleAmount()); };
  handle.flakes = function () { return flakes.map(function (f) { return { x: f.bx + Math.sin(clock * f.swayFreq + f.phase) * f.amp, y: f.y }; }); }; // Beta 1.159: x is the RENDERED position (base + sway offset) - the painted one
  raf = window.requestAnimationFrame(loop);
})();