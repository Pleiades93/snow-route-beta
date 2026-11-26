import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, shot, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive204 (SESSION tier): banner placement QA - the shared banner keeps
// one fixed seat in every state, level with the title, clear of the bottom
// controls. (Beta 1.296: the toast pill is retired; the banner is the one
// notification surface.)
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const LONG = 'Finish stopped'; const LONG_LINE = 'Undoing the finish did not work - export a backup now'; const STORAGE = 'Restore failed'; const STORAGE_LINE = 'Your old data could not be fully put back - restore from a known-good backup';
const SHORT = 'GPS signal weak'; const SHORT_LINE = 'Still trying - marks may be off until it improves';


const measure = () => J(`(() => {
  const t = document.getElementById('banner'); const tr = t.getBoundingClientRect();
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
  const hits = [];
  for (const s of ['#dock', '#startBtn', '#resetBtn', '#cancelStartBtn', '#tabBar']) document.querySelectorAll(s).forEach(e => {
    if (!vis(e)) return;
    const r = e.getBoundingClientRect();
    const ox = Math.min(tr.right, r.right) - Math.max(tr.left, r.left);
    const oy = Math.min(tr.bottom, r.bottom) - Math.max(tr.top, r.top);
    if (ox > 0 && oy > 0) hits.push((e.id || e.className || e.tagName) + ' ' + Math.round(ox) + 'x' + Math.round(oy));
  });
  return { top: Math.round(tr.top), bottom: Math.round(tr.bottom), left: Math.round(tr.left), right: Math.round(tr.right), h: Math.round(tr.height), hits,
    shown: t.classList.contains('show') && vis(t), vh: window.innerHeight };
})()`);

// The measured scene as one comparable string: the pill's box plus every
// visible control's vertical box, in measure()'s selector order. Two
// samples with the same string are the same standing scene.
const sceneSnap = () => J(`(() => {
  const t = document.getElementById('banner'); if (!t) return '';
  const tr = t.getBoundingClientRect();
  return ['banner', Math.round(tr.top), Math.round(tr.bottom), Math.round(tr.left), Math.round(tr.right)].join('|');
})()`);

const fire = async (state, head, line) => {
  await ev(`(() => { showBanner('HEAD', 'LINE'); return true; })()`.replace('HEAD', head).replace('LINE', line));
  // Wait for the banner's entrance to SETTLE before measuring: the standing
  // seat is the property under test, and a fixed sleep races the pop-in on a
  // loaded rig. The settle is the banner's own animations finished, confirmed
  // across two frames, then the banner's box identical across two samples
  // 150 ms apart.
  const settled = await ev(`(async () => {
    const el = $('banner');
    if (!el) return false;
    const t0 = performance.now();
    for (;;) {
      const running = el.getAnimations().filter(a => a.animationName === 'bannerDrop' && a.playState === 'running').length;
      if (running === 0) {
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return el.getAnimations().filter(a => a.animationName === 'bannerDrop' && a.playState === 'running').length === 0;
      }
      if (performance.now() - t0 > 5000) return false;
      await new Promise(r => requestAnimationFrame(r));
    }
  })()`).catch(() => false);
  let stable = false;
  for (let i = 0; i < 8 && !stable; i++) {
    const a = await sceneSnap();
    await sleep(150);
    stable = a !== '' && a === await sceneSnap();
  }
  ok(state + ': the entrance settled before measuring (the banner\'s own animations finished, confirmed across two frames, and its box identical across two samples)', settled === true && stable === true);
  const m = await measure();
  ok(state + ': the banner stands in its seat (shown, in the top band, clear of the bottom controls) | box ' +
    m.top + '-' + m.bottom + ' of ' + m.vh + ', hits: ' + (m.hits || []).join('; '), !!m.hits && m.hits.length === 0 && m.bottom < m.vh / 2 && m.shown === true);
  if (!fire.seat) fire.seat = m;
  ok(state + ': the seat is FIXED (same top and side edges as the first state - one seat, one owner; the height alone varies with how the line wraps) | first ' +
     fire.seat.top + '/' + fire.seat.left + '-' + fire.seat.right + ', here ' + m.top + '/' + m.left + '-' + m.right,
    Math.abs(m.top - fire.seat.top) <= 2 && Math.abs(m.left - fire.seat.left) <= 2 && Math.abs(m.right - fire.seat.right) <= 2);
  await shot('banner-qa-' + state.replace(/[^a-z0-9]+/gi, '-') + '.png');
  await ev(`(() => { $('banner').classList.remove('show'); return true; })()`); await sleep(120);
  return m;
};
try {
  // ---- 1. idle map, Start showing (day) ----
  await fire('idle-day', LONG, LONG_LINE);
  // ---- 2. clean running: FINISH + count pill + Cancel start (day) ----
  await ev(`(() => { $('startBtn').click(); return true; })()`); await sleep(700);
  const cleanState = await J(`(() => ({ fin: $('resetBtn').style.display !== 'none', cancel: $('cancelStartBtn').style.display !== 'none' }))()`);
  ok('setup: the clean state stands (FINISH + Cancel visible)', cleanState.fin === true && cleanState.cancel === true);
  await fire('clean-day', LONG, LONG_LINE);
  await fire('clean-day-short', SHORT, SHORT_LINE);
  await ev(`(() => { cancelStart(); return true; })()`); await sleep(400);
  // ---- 3. Settings sheet open (day) ----
  await ev(`(() => { $('setBtn').click(); return true; })()`); await sleep(500);
  await fire('settings-day', STORAGE, STORAGE_LINE);
  await ev(`(() => { $('setMenu').classList.remove('open'); return true; })()`); await sleep(300);
  // ---- 4. Streets sheet open (day) ----
  await ev(`(() => { $('streetsBtn').click(); return true; })()`); await sleep(500);
  await fire('streets-sheet-day', SHORT, SHORT_LINE);
  await ev(`(() => { $('streetsBtn').click(); return true; })()`); await sleep(400);
  // ---- 5. note modal open (day) ----
  await ev(`(() => { openNote('Velmar'); return true; })()`); await sleep(400);
  await fire('note-day', STORAGE, STORAGE_LINE);
  await ev(`(() => { $('noteModal').classList.add('hidden'); return true; })()`); await sleep(200);
  // ---- 6. finish sheet open (day) ----
  await ev(`(() => { $('startBtn').click(); return true; })()`); await sleep(500);
  await ev(`(() => { markDone('Velmar', 'tap'); markDone('Mellings', 'tap'); markDone('Astona', 'tap'); finishRun(); return true; })()`); await sleep(400);
  await ev(`(() => { $('resetBtn').click(); return true; })()`); await sleep(500);
  const finOpen = await J(`(() => !$('finModal').classList.contains('hidden'))()`);
  ok('setup: the finish sheet stands open', finOpen === true);
  await fire('finish-day', LONG, LONG_LINE);
  await ev(`(() => { $('finNo').click(); return true; })()`); await sleep(300);
  // ---- 7. create mode (day): the create sheet + sector bar own the bottom ----
  await ev(`(() => { enterCreate('pick'); return true; })()`); await sleep(900);
  await fire('create-day', LONG, LONG_LINE);
  await ev(`(() => { exitCreate(); return true; })()`); await sleep(400);
  // ---- night: idle, clean, settings ----
  await ev(`(() => { $('nightBtn').click(); return true; })()`); await sleep(500);
  const isNight = await J(`(() => document.body.classList.contains('night'))()`);
  ok('setup: night theme stands', isNight === true);
  await fire('idle-night', LONG, LONG_LINE);
  await ev(`(() => { $('startBtn').click(); return true; })()`); await sleep(700);
  await fire('clean-night', LONG, LONG_LINE);
  await ev(`(() => { cancelStart(); return true; })()`); await sleep(400);
  await ev(`(() => { $('setBtn').click(); return true; })()`); await sleep(500);
  await fire('settings-night', STORAGE, STORAGE_LINE);
  await ev(`(() => { $('setMenu').classList.remove('open'); return true; })()`); await sleep(300);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
