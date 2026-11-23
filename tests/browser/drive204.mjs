import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, shot, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive204 (SESSION tier): Beta 1.221 - TOAST PLACEMENT QA (Andrew's raised
// bar, 2026-11-16 21:49: "make those perfect"). Andrew reported firsthand
// that the shipped pill (bottom: 120px) lands ON the Start button - his
// Clear-with-nothing-marked pill sat on Start, and by the same geometry it
// would sit over Cancel during a clean. This drive measures the pill's box
// against Start / Cancel / Finish and every other control present, in
// EVERY state a surviving (kept-list) toast can fire, day and night:
// zero overlap and a visible gap (>= 4px) to the nearest control below it.
// The failure property is the OVERLAP itself, measured in the rendered
// page - never a proxy. Screenshots land beside the run for the record.
// On Beta 1.220 every dock state fails: the pill band sits inside the
// dock stack's vertical span (dock bottom 67px + the 104px run button,
// and the count pill's permanently reserved slot rides under it).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const LONG = 'Start cancelled - erased here, but the trail cleanup could not be saved yet; it will keep retrying - the board was rebuilt from the marks made during the clean (the saved snapshot was damaged)';
const STORAGE = 'Restore failed while writing the route - and your previous data could NOT be fully put back - restore from a known-good backup';
const SHORT = 'GPS signal weak - still trying';

const measure = () => J(`(() => {
  const t = document.getElementById('toast'); const tr = t.getBoundingClientRect();
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
  const sels = ['#dock button', '#tabBar button', '#setMenu button', '#setMenu input', '#setMenu .swRow', '.sheet button', '#sheet .srow', '#mapNote', '#mapNote button', '#mapNote textarea', '#finModal .card', '#finModal button', '#createSheet button', '#createBar input', '#createBar button', '#selPop', '#selPop button', '#spdPill', '#nightBtn', '#centreBtn'];
  const seen = new Set(); const hits = []; let belowGap = null, belowEl = null;
  for (const s of sels) document.querySelectorAll(s).forEach(e => {
    if (e === t || seen.has(e)) return; seen.add(e); if (!vis(e)) return;
    const r = e.getBoundingClientRect();
    const ox = Math.min(tr.right, r.right) - Math.max(tr.left, r.left);
    const oy = Math.min(tr.bottom, r.bottom) - Math.max(tr.top, r.top);
    if (ox > 0 && oy > 0) hits.push((e.id || e.className || e.tagName) + ' ' + Math.round(ox) + 'x' + Math.round(oy));
    if (ox > 0 && r.top >= tr.bottom - 1) { const g = r.top - tr.bottom; if (belowGap === null || g < belowGap) { belowGap = Math.round(g); belowEl = e.id || e.className || e.tagName; } }
  });
  return { toastTop: Math.round(tr.top), toastBottom: Math.round(tr.bottom), toastH: Math.round(tr.height), hits, belowGap, belowEl };
})()`);

const fire = async (state, text) => {
  await ev(`(() => { toast(${JSON.stringify(text)}, 60000); return true; })()`);
  // Wait for the rise to actually SETTLE before measuring: the standing band is
  // the property under test, and a fixed sleep races the transition on a loaded
  // rig - a mid-rise pill sweeps the space below its band and reads as an overlap
  // that is not its standing position (idle-day flaked 104x10 against startBtn
  // exactly this way, Beta 1.221 gate round). Testing-efficiency rollout
  // (2026-11-23): the settle is now the animation system's own state - the
  // TOAST's own animations finished, confirmed across two animation frames -
  // and a rise that never settles FAILS the check below, where the old poll
  // swallowed its timeout and measured anyway. The wait is scoped to the
  // toast element, not the document: a running clean keeps other animations
  // alive indefinitely (the recording pulse), so a document-wide wait never
  // empties in the clean states - observed on this round's first run, when
  // clean-day failed the settle while idle-day passed.
  const settled = await ev(`(async () => {
    const el = $('toast');
    if (!el) return false;
    const t0 = performance.now();
    for (;;) {
      const running = el.getAnimations().filter(a => a.playState === 'running').length;
      if (running === 0) {
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return el.getAnimations().filter(a => a.playState === 'running').length === 0;
      }
      if (performance.now() - t0 > 5000) return false;
      await new Promise(r => requestAnimationFrame(r));
    }
  })()`).catch(() => false);
  ok(state + ': the rise settled before measuring (the toast\'s own animations finished, confirmed across two frames)', settled === true);
  const m = await measure();
  ok(state + ': zero overlap with any control', m.hits && m.hits.length === 0);
  if (m.hits && m.hits.length) R.checks[R.checks.length - 1][0] += ' | OVERLAPS: ' + m.hits.join('; ');
  ok(state + ': visible gap >= 4px to the nearest control below (' + (m.belowEl || 'none') + ' gap=' + m.belowGap + ', pill ' + m.toastTop + '-' + m.toastBottom + ' h=' + m.toastH + ')', m.belowGap === null || m.belowGap >= 4);
  await shot('toast-qa-' + state.replace(/[^a-z0-9]+/gi, '-') + '.png');
  await ev(`(() => { $('toast').classList.remove('show'); return true; })()`); await sleep(120);
  return m;
};

try {
  // ---- 1. idle map, Start showing (day) ----
  await fire('idle-day', LONG);
  // ---- 2. clean running: FINISH + count pill + Cancel start (day) ----
  await ev(`(() => { $('startBtn').click(); return true; })()`); await sleep(700);
  const cleanState = await J(`(() => ({ fin: $('resetBtn').style.display !== 'none', cancel: $('cancelStartBtn').style.display !== 'none' }))()`);
  ok('setup: the clean state stands (FINISH + Cancel visible)', cleanState.fin === true && cleanState.cancel === true);
  await fire('clean-day', LONG);
  await fire('clean-day-short', SHORT);
  await ev(`(() => { cancelStart(); return true; })()`); await sleep(400);
  // ---- 3. Settings sheet open (day) ----
  await ev(`(() => { $('setBtn').click(); return true; })()`); await sleep(500);
  await fire('settings-day', STORAGE);
  await ev(`(() => { $('setMenu').classList.remove('open'); return true; })()`); await sleep(300);
  // ---- 4. Streets sheet open (day) ----
  await ev(`(() => { $('streetsBtn').click(); return true; })()`); await sleep(500);
  await fire('streets-sheet-day', SHORT);
  await ev(`(() => { $('streetsBtn').click(); return true; })()`); await sleep(400);
  // ---- 5. note modal open (day) ----
  await ev(`(() => { openNote('Velmar'); return true; })()`); await sleep(400);
  await fire('note-day', STORAGE);
  await ev(`(() => { $('noteModal').classList.add('hidden'); return true; })()`); await sleep(200);
  // ---- 6. finish sheet open (day) ----
  await ev(`(() => { $('startBtn').click(); return true; })()`); await sleep(500);
  await ev(`(() => { markDone('Velmar', 'tap'); markDone('Mellings', 'tap'); markDone('Astona', 'tap'); finishRun(); return true; })()`); await sleep(400);
  await ev(`(() => { $('resetBtn').click(); return true; })()`); await sleep(500);
  const finOpen = await J(`(() => !$('finModal').classList.contains('hidden'))()`);
  ok('setup: the finish sheet stands open', finOpen === true);
  await fire('finish-day', LONG);
  await ev(`(() => { $('finNo').click(); return true; })()`); await sleep(300);
  // ---- 7. create mode (day): the create sheet + sector bar own the bottom ----
  await ev(`(() => { enterCreate('pick'); return true; })()`); await sleep(900);
  await fire('create-day', LONG);
  await ev(`(() => { exitCreate(); return true; })()`); await sleep(400);
  // ---- night: idle, clean, settings ----
  await ev(`(() => { $('nightBtn').click(); return true; })()`); await sleep(500);
  const isNight = await J(`(() => document.body.classList.contains('night'))()`);
  ok('setup: night theme stands', isNight === true);
  await fire('idle-night', LONG);
  await ev(`(() => { $('startBtn').click(); return true; })()`); await sleep(700);
  await fire('clean-night', LONG);
  await ev(`(() => { cancelStart(); return true; })()`); await sleep(400);
  await ev(`(() => { $('setBtn').click(); return true; })()`); await sleep(500);
  await fire('settings-night', STORAGE);
  await ev(`(() => { $('setMenu').classList.remove('open'); return true; })()`); await sleep(300);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
