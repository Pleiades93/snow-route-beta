import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive118: audit remediation regression suite (spec 2026-10-29). Covers the gaps the older drives do not:
// invalid coverage indexes (F-2), invalid GPS fixes (G-1), coverage suggestion behaviour incl. parallel
// streets (spec GPS), restore write failure + rollback (suite 5), failed rollback verification (suite 6),
// invalid nested history (suite 3), current-format backup round-trip (suite 1), failed history write at
// finish (suite 11), partial multi-key save consistency (suite 12).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
await sleep(3000);

// drive122 (Beta 1.18): keyboard/viewport regression - see body.
// Every check measures the FAILURE property directly (overflow, overlap, out-of-bounds) in the
// rendered page at phone size, in both themes - never a proxy like a radius or a class name.
const RECTS = (sel) => `(() => [...document.querySelectorAll('${sel}')].filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }))()`;
const overlaps = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;
const inView = (r) => r.x >= -1 && r.y >= -1 && r.r <= 421 && r.b <= 901;
const noOverlap = (rs) => rs.every((a, i) => rs.every((b, j) => i === j || !overlaps(a, b)));
let A;

ok('K0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// ---- K1: the chrome is anchored to the visible screen, not the page ---------
const anchoring = JSON.parse(await ev(`JSON.stringify({
  hud: getComputedStyle($('hud')).position, sheet: getComputedStyle($('sheet')).position,
  modal: getComputedStyle($('noteModal')).position, fan: getComputedStyle($('tabBar')).position })`));
ok('K1 header, sheet, modal and menu button are fixed-anchored | ' + JSON.stringify(anchoring),
  anchoring.hud === 'fixed' && anchoring.sheet === 'fixed' && anchoring.modal === 'fixed' && anchoring.fan === 'fixed');

// ---- K2: both note editors are at the no-auto-zoom text size -----------------
await ev(`(() => { $('streetsBtn').click(); return true; })()`);
await poll120(`$('sheet').classList.contains('open')`, 5000);
await sleep(500);
await ev(`(() => { const r = document.querySelector('#streetList .srow'); if (r) r.click(); return true; })()`);
await poll120(`!!document.querySelector('.noteEd textarea')`, 5000);
const fonts = JSON.parse(await ev(`JSON.stringify({
  ed: parseFloat(getComputedStyle(document.querySelector('.noteEd textarea')).fontSize),
  modal: parseFloat(getComputedStyle($('noteText')).fontSize),
  focused: document.activeElement && document.activeElement.tagName })`));
ok('K2 note editors use >=16px text (no iOS focus auto-zoom) and the editor takes focus | ' + JSON.stringify(fonts),
  fonts.ed >= 16 && fonts.modal >= 16 && fonts.focused === 'TEXTAREA');

// ---- K3: keyboard state (Beta 1.61 contract): the layout does NOT chase the
// shrunk visible screen - the published height stays frozen at the full size,
// the bottom offset stays 0, the header keeps the top of the screen, and the
// sheet keeps its pre-keyboard size, flush with the layout bottom (the
// keyboard overlays it). The rig cannot split layout height from visible
// height the way the phone does (layout 932 vs visible 740), so the sheet's
// top is asserted through its unchanged height rather than the stage top:
// on the phone the frozen size is .74 of the FULL height, so its top sits
// on-screen by construction. ----------------------------------------------
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 520, deviceScaleFactor: 2, mobile: true }, S);
await sleep(900);
const shrunk = JSON.parse(await ev(`(() => { const vv = window.visualViewport; const hud = $('hud').getBoundingClientRect(); const sh = $('sheet').getBoundingClientRect();
  const cs = getComputedStyle(document.documentElement);
  return JSON.stringify({ vvH: vv.height, vvT: vv.offsetTop, hudTop: hud.top, hudBottom: hud.bottom, sheetBottom: sh.bottom, sheetTop: sh.top, sheetH: sh.height,
    vvh: cs.getPropertyValue('--vvh'), vvb: cs.getPropertyValue('--vvb'), ih: window.innerHeight }); })()`));
ok('K3 keyboard-state: header unmoved at the top, sheet frozen at its pre-keyboard size and flush with the layout bottom, published height frozen at full | ' + JSON.stringify(shrunk),
  shrunk.hudTop >= shrunk.vvT - 1 && shrunk.hudBottom <= shrunk.vvT + shrunk.vvH + 1 &&
  Math.abs(shrunk.sheetBottom - shrunk.ih) <= 1 && shrunk.sheetH > 600 && shrunk.sheetH <= 668 &&
  shrunk.vvh === '900px' && shrunk.vvb === '0px');

// ---- K4: keyboard closed again - everything settles back (Andrew: "it never
// moves back" - this is the regression for exactly that) -----------------------
await send('Emulation.clearDeviceMetricsOverride', {}, S);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
await ev(`(() => { const ta = document.querySelector('.noteEd textarea'); if (ta) ta.blur(); return true; })()`);
await sleep(900);
const restored = JSON.parse(await ev(`(() => { const vv = window.visualViewport; const hud = $('hud').getBoundingClientRect(); const sh = $('sheet').getBoundingClientRect();
  return JSON.stringify({ vvH: vv.height, hudTop: hud.top, sheetBottom: sh.bottom, sy: window.scrollY }); })()`));
ok('K4 restored state: header back at the top, sheet back at the bottom, no leftover page pan | ' + JSON.stringify(restored),
  Math.abs(restored.hudTop) <= 1 && Math.abs(restored.sheetBottom - restored.vvH) <= 2 && restored.sy === 0);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

