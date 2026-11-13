import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// Test-suite restructure (2026-11-09): drive122 + drive134 + drive139
// are absorbed as leading segments in this session (see markers).
// drive135: Beta 1.54 viewport/keyboard hardening (Andrew's deep-dive, 2026-11-01).
// The app now keeps a SETTLED size (fullH) and trusts it over a stuck short report
// in a home-screen install; while typing, the menus ride above the keyboard
// (offsets follow the live report, as they always have - 1.54's pin broke this
// and 1.55 reverted it); and the typing freeze releases only
// after the reported height SETTLES, not the instant a field blurs. The rig
// simulates the keyboard by resizing the emulated screen mid-session (a real
// visualViewport change) and forces display-mode: standalone via emulated media.
// (The screen.height anchor itself cannot be isolated in the rig - emulated
// metrics move screen and viewport together; the phone is its judge. What is
// asserted here is the user-visible machinery: pin, settle-hold, trust, release.)
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

// ===== absorbed drive122 (test-suite restructure, 2026-11-09): keyboard/
// viewport anchoring, measured in THIS session before 135's own body.
// Check IDs carry the 122- prefix (135 has its own K1/K2). =====
const R122 = await (async () => {
const poll120 = poll;
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
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

ok('122-K0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// ---- K1: the chrome is anchored to the visible screen, not the page ---------
const anchoring = JSON.parse(await ev(`JSON.stringify({
  hud: getComputedStyle($('hud')).position, sheet: getComputedStyle($('sheet')).position,
  modal: getComputedStyle($('noteModal')).position, fan: getComputedStyle($('tabBar')).position })`));
ok('122-K1 header, sheet, modal and menu button are fixed-anchored | ' + JSON.stringify(anchoring),
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
ok('122-K2 note editors use >=16px text (no iOS focus auto-zoom) and the editor takes focus | ' + JSON.stringify(fonts),
  fonts.ed >= 16 && fonts.modal >= 16 && fonts.focused === 'TEXTAREA');

// ---- K3: keyboard state (Beta 1.61 contract): the layout does NOT chase the
// shrunk visible screen - the published height stays frozen at the full size,
// the bottom offset stays 0, the header keeps the top of the screen, and the
// sheet keeps its pre-keyboard size, flush with the layout bottom (the
// keyboard overlays it). The rig cannot split layout height from visible
// height the way the phone does (layout 932 vs visible 740), so the sheet's
// top is asserted through its unchanged height rather than the stage top:
// on the phone the frozen size was .50 of the FULL height (Beta 1.79 half-open sheets; .74 through 1.78), so its top sat
// on-screen by construction; since Beta 1.184 an open note editor stands at the full stop instead (see preKbH below) -
// the freeze property this check guards is the same, only the frozen value follows the editor-open contract. ------
const preKbH = await ev(`$('sheet').offsetHeight`); // Beta 1.184: the pre-keyboard size is captured LIVE, not pinned to an era value - through 1.183 an open editor left the sheet at the half stop (~450 in this rig); since the 1.184 keyboard-reachability fix (Codex PR #22) an open editor stands at the full stop (846), and THAT is the size the freeze must preserve. The contract under test is unchanged: whatever the pre-keyboard size is, it does not move.
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 520, deviceScaleFactor: 2, mobile: true }, S);
await sleep(900);
const shrunk = JSON.parse(await ev(`(() => { const vv = window.visualViewport; const hud = $('hud').getBoundingClientRect(); const sh = $('sheet').getBoundingClientRect();
  const cs = getComputedStyle(document.documentElement);
  return JSON.stringify({ vvH: vv.height, vvT: vv.offsetTop, hudTop: hud.top, hudBottom: hud.bottom, sheetBottom: sh.bottom, sheetTop: sh.top, sheetH: sh.height,
    vvh: cs.getPropertyValue('--vvh'), vvb: cs.getPropertyValue('--vvb'), ih: window.innerHeight }); })()`));
ok('122-K3 keyboard-state: header unmoved at the top, sheet frozen at its pre-keyboard size and flush with the layout bottom, published height frozen at full | ' + JSON.stringify(shrunk),
  shrunk.hudTop >= shrunk.vvT - 1 && shrunk.hudBottom <= shrunk.vvT + shrunk.vvH + 1 &&
  Math.abs(shrunk.sheetBottom - shrunk.ih) <= 1 && Math.abs(shrunk.sheetH - preKbH) <= 2 &&
  shrunk.vvh === '900px' && shrunk.vvb === '0px');

// ---- K4: keyboard closed again - everything settles back (Andrew: "it never
// moves back" - this is the regression for exactly that) -----------------------
await send('Emulation.clearDeviceMetricsOverride', {}, S);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
await ev(`(() => { const ta = document.querySelector('.noteEd textarea'); if (ta) ta.blur(); return true; })()`);
await sleep(900);
const restored = JSON.parse(await ev(`(() => { const vv = window.visualViewport; const hud = $('hud').getBoundingClientRect(); const sh = $('sheet').getBoundingClientRect();
  return JSON.stringify({ vvH: vv.height, hudTop: hud.top, sheetBottom: sh.bottom, sy: window.scrollY }); })()`));
ok('122-K4 restored state: header back at the top, sheet back at the bottom, no leftover page pan | ' + JSON.stringify(restored),
  Math.abs(restored.hudTop) <= 1 && Math.abs(restored.sheetBottom - restored.vvH) <= 2 && restored.sy === 0);

  return R;
})();
R.checks.push(...R122.checks);
await ev(`(() => { const ta = document.querySelector('.noteEd textarea'); if (ta) ta.blur(); closeSheets(); return true; })()`); await sleep(600); // segment reset: 122 leaves the Streets sheet open on its note editor

// ===== absorbed drive134 (test-suite restructure, 2026-11-09): viewport
// re-measure triggers, in this session. =====
const R134 = await (async () => {
const poll120 = poll;
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
await sleep(3000);
ok('134-W0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`));
const expect = `(() => { const vv = window.visualViewport; const vvb = Math.max(0, window.innerHeight - vv.offsetTop - vv.height) + 'px'; const vvh = vv.height + 'px'; const de = document.documentElement.style; return de.getPropertyValue('--vvb') === vvb && de.getPropertyValue('--vvh') === vvh; })()`;
const corrupt = `(() => { const de = document.documentElement.style; de.setProperty('--vvb', '77px'); de.setProperty('--vvh', '111px'); return de.getPropertyValue('--vvb') === '77px'; })()`;
ok('134-W1 measured values are sane at boot', await ev(expect));
ok('134-W2a corruption lands', await ev(corrupt));
await ev(`window.dispatchEvent(new Event('pageshow'))`);
ok('134-W2 pageshow re-measures and restores the values', await poll120(expect, 8000));
ok('134-W3a corruption lands again', await ev(corrupt));
await ev(`document.dispatchEvent(new Event('visibilitychange'))`);
ok('134-W3 return-to-front re-measures and restores the values', await poll120(expect, 8000));
ok('134-W4a corruption lands a third time', await ev(corrupt));
await ev(`window.dispatchEvent(new Event('orientationchange'))`);
ok('134-W4 rotation re-measures and restores the values', await poll120(expect, 10000));
ok('134-W5 title block sits at its lowered position (header top padding 25px in the rig, no safe-area inset)', await ev(`getComputedStyle(document.getElementById('hud')).paddingTop === '25px'`));
  return R;
})();
R.checks.push(...R134.checks);

// ===== absorbed drive139 (test-suite restructure, 2026-11-09): the
// document-height floor, in this session. It reloads the page at a
// short stage and leaves it there; 135's own body re-stages and
// re-picks the route itself, exactly as it always has after a reload. =====
const R139 = await (async () => {
const poll120 = poll;
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
await sleep(2500);
ok('139-P0 app boots for the floor tests', await poll120(`!!window.maplibregl && typeof glOk !== 'undefined'`, 45000));
ok('139-P1 the document-height floor rule ships in the page CSS', await ev(`(() => { for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) { if (r.cssText && r.cssText.indexOf('min(100lvh') >= 0) return true; } } catch (e) {} } return false; })()`));
ok('139-P2 precondition: the document is at least viewport-tall | scrollH', await ev(`document.documentElement.scrollHeight >= window.innerHeight`));
const lay = await ev(`(() => { const tb = document.getElementById('tabBar').getBoundingClientRect(); const mb = document.getElementById('map').getBoundingClientRect(); return { ih: window.innerHeight, tabB: Math.round(tb.bottom), mapB: Math.round(mb.bottom) }; })()`);
ok('139-P3 layout at full size: bar and map reach the viewport bottom | ' + JSON.stringify(lay), !!lay && lay.tabB === lay.ih && lay.mapB === lay.ih);
await ev(`window.scrollTo(0, 60); document.documentElement.scrollTop = 60; true`); await sleep(400);
ok('139-P4 the taller document does not make the app scrollable', await ev(`window.scrollY === 0 && document.documentElement.scrollTop === 0`));
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => q.indexOf('display-mode') >= 0 ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q); })();` }, S);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 820, deviceScaleFactor: 2, mobile: true }, S);
await ev(`location.reload()`);
await sleep(2500);
ok('139-P5 app reboots coherently in a short stage', await poll120(`!!window.maplibregl && window.innerHeight === 820`, 30000));
ok('139-P5b the boot state has ended before layout is measured (Beta 1.86: chrome is absent BY DESIGN while booting, so a bar rect read mid-boot is the boot state, not the app layout)', await poll120(`!document.documentElement.classList.contains('boot')`, 20000));
const lay2 = await ev(`(() => { const tb = document.getElementById('tabBar').getBoundingClientRect(); return { ih: window.innerHeight, tabB: Math.round(tb.bottom), sh: document.documentElement.scrollHeight }; })()`);
ok('139-P6 short stage: bar still at the stage bottom and the floor precondition holds | ' + JSON.stringify(lay2), !!lay2 && lay2.tabB === lay2.ih && lay2.sh >= lay2.ih);
  return R;
})();
R.checks.push(...R139.checks);

await sleep(3000);
ok('V0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`));
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 820, deviceScaleFactor: 2, mobile: true }, S);
await sleep(400);
ok('V5 (tab mode first, no shim): a short live report rules as-is (820px)', await ev(`document.documentElement.style.getPropertyValue('--vvh')`) === '820px');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
await sleep(300);
// The headless shell cannot emulate display-mode, so the rig shims the media
// query itself before a reload - the app's own detection (matchMedia) and every
// code path after it run for real.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => q.indexOf('display-mode') >= 0 ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q); })();` }, S);
await ev(`location.reload()`);
await sleep(2500);
ok('V0b app reboots under the home-screen shim', await poll120(`typeof glOk !== 'undefined' && glOk === true`));
ok('V0c the boot state has ended before the editor interactions (Beta 1.86: chrome is absent BY DESIGN while booting - a focus() landing mid-boot would no-op against the hidden editor)', await poll120(`!document.documentElement.classList.contains('boot')`, 20000));
// Beta 1.117: a reload lands on the route menu with NO route loaded - and since the separation build
// the app holds no geometry at all until a pack loads, so the streets list is empty pre-pick. (Before
// 1.117 the eval-time baked 5W geometry let this drive's editor steps run on an unpicked route without
// ever noticing.) Re-pick Route 5W through the picker, exactly as bootThrough did. Assertions unchanged.
await ev(`document.getElementById('rmChoose') && document.getElementById('rmChoose').click()`);
await ev(`document.querySelector('#rmRoutes .routeRow') && document.querySelector('#rmRoutes .routeRow').click()`);
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
await ev(`syncViewport()`);
ok('V1 settled size learned at boot (900) | ' + await ev(`fullH`), await ev(`fullH`) === 900);
await ev(`$('streetsBtn').click()`); await sleep(500);
await ev(`(() => { const r = [...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Velmar'); r.querySelector('.nwrap').click(); return true; })()`); await sleep(400);
await ev(`document.querySelector('.noteEd textarea').focus()`);
await sleep(200);
ok('V2a typing state on (kb class)', await ev(`document.body.classList.contains('kb')`));
ok('V2b bottom offset at rest before the keyboard moves (0px) | ' + await ev(`document.documentElement.style.getPropertyValue('--vvb')`), await ev(`document.documentElement.style.getPropertyValue('--vvb')`) === '0px');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 560, deviceScaleFactor: 2, mobile: true }, S);
await sleep(450);
const pin = JSON.parse(await ev(`JSON.stringify({ vvb: document.documentElement.style.getPropertyValue('--vvb'), vvh: document.documentElement.style.getPropertyValue('--vvh'), dur: getComputedStyle($('sheet')).transitionDuration, sb: $('sheet').getBoundingClientRect().bottom, ih: window.innerHeight })`));
ok('V2c keyboard up: the layout variables stay FROZEN at their pre-keyboard values (900px / 0px), the sheet does not resize or re-anchor, and no transition runs | ' + JSON.stringify(pin), pin.vvh === '900px' && pin.vvb === '0px' && pin.dur === '0s' && Math.abs(pin.sb - pin.ih) <= 1); // Beta 1.61: the keyboard overlays the frozen layout (Andrew's direction). 1.55's live-tracking chased the keyboard's animation ticks and the note menus flickered; the freeze replaces it, and field visibility is handled inside the menu (ensureFieldVisible), not by layout. The rig cannot split window height from visible height the way iOS does, so the sheet-bottom assertion is against the rig's own stage bottom.
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 540, deviceScaleFactor: 2, mobile: true }, S);
await ev(`syncViewport(); syncViewport();`);
await sleep(350);
const frz = JSON.parse(await ev(`JSON.stringify({ vvb: document.documentElement.style.getPropertyValue('--vvb'), vvh: document.documentElement.style.getPropertyValue('--vvh') })`));
ok('F1 the freeze holds against a stream of viewport ticks mid-typing | ' + JSON.stringify(frz), frz.vvh === '900px' && frz.vvb === '0px');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 560, deviceScaleFactor: 2, mobile: true }, S);
await ev(`document.querySelector('.noteEd textarea').blur()`);
await sleep(120);
ok('V3a freeze HOLDS just after blur while the height is still short (the 1.31 instant release is gone)', await ev(`document.body.classList.contains('kb')`));
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 750, deviceScaleFactor: 2, mobile: true }, S);
await sleep(180);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
ok('V3b once the height is home, the freeze releases and the size is the settled one', await poll120(`!document.body.classList.contains('kb') && document.documentElement.style.getPropertyValue('--vvh') === '900px'`, 2500));
ok('V3c bottom offset still 0px after the whole cycle', await ev(`document.documentElement.style.getPropertyValue('--vvb')`) === '0px');
// W (Beta 1.56): keyboard ownership - with the keyboard UP (height unsettled), a rebuild that destroys the editor must NOT unfreeze the sheet (the pre-1.56 list code removed the class itself, instantly); the single owner holds it, then releases through the settle path once the height is home
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 560, deviceScaleFactor: 2, mobile: true }, S); await sleep(200);
await ev(`(() => { const ta = document.querySelector('.noteEd textarea'); if (ta) ta.focus(); return true; })()`); await sleep(250);
const wBefore = await ev(`document.body.classList.contains('kb')`);
await ev(`(() => { noteOpenFor = null; renderStreets(); return true; })()`);
await sleep(120);
const wHold = await ev(`document.body.classList.contains('kb')`);
ok('W1 editor destroyed by a rebuild mid-typing: the freeze HOLDS while the height is unsettled (owner decides, not the render) | before ' + wBefore + ' hold ' + wHold, wBefore === true && wHold === true);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
let wRel = false; for (let i = 0; i < 20 && !wRel; i++) { await sleep(150); wRel = await ev(`!document.body.classList.contains('kb')`); }
ok('W2 once the height is home, the owner releases the freeze (no stuck keyboard state)', wRel === true);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 820, deviceScaleFactor: 2, mobile: true }, S);
await sleep(400);
const stuck = JSON.parse(await ev(`JSON.stringify({ vvh: document.documentElement.style.getPropertyValue('--vvh'), vvb: document.documentElement.style.getPropertyValue('--vvb') })`));
ok('V4 stuck-short report (820, no keyboard): the live report rules as-is (820px) - the 1.54 trust override is RETIRED (Beta 1.62); the full-stage guarantee is the document-height floor (1.60), which this rig cannot emulate and drive139 pins | ' + JSON.stringify(stuck), stuck.vvh === '820px' && stuck.vvb === '0px');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
await sleep(300);
// Beta 1.69 (audit N02): a DELAYED keyboard - the viewport does not move for the
// first ~350 ms after focus (iOS can report the full height before the keyboard
// starts rising). The 1.61 sampler read two unchanged heights inside that window,
// declared the keyboard settled and ran its one visibility check against the
// no-keyboard geometry. Now the first check must wait for a real height drop.
await ev(`(() => { if (!$('sheet').classList.contains('open')) $('streetsBtn').click(); return true; })()`); await sleep(500);
await ev(`(() => { const r = [...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Velmar'); r.querySelector('.nwrap').click(); return true; })()`); await sleep(400);
const hasEd = await ev(`!!document.querySelector('.noteEd textarea')`);
await ev(`(() => { const ta = document.querySelector('.noteEd textarea'); if (ta) ta.blur(); return true; })()`); await sleep(700);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S); await sleep(400);
await ev(`(() => { window.__efv = []; const orig = ensureFieldVisible; ensureFieldVisible = () => { window.__efv.push({ t: Date.now(), h: window.visualViewport.height }); orig(); }; return true; })()`);
await ev(`document.querySelector('.noteEd textarea').focus()`);
const kFocused = await ev(`document.activeElement && document.activeElement.tagName`);
const kT0 = Date.now();
await sleep(350);
const efvEarly = JSON.parse(await ev(`JSON.stringify(window.__efv)`));
ok('K1 delayed keyboard: NO visibility conclusion inside the pre-keyboard window (350 ms, height unmoved) | editor staged ' + hasEd + ' focused ' + kFocused + ' calls ' + JSON.stringify(efvEarly), hasEd === true && kFocused === 'TEXTAREA' && efvEarly.length === 0);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 560, deviceScaleFactor: 2, mobile: true }, S);
let efvLate = [];
for (let i = 0; i < 12 && !efvLate.length; i++) { await sleep(200); efvLate = JSON.parse(await ev(`JSON.stringify(window.__efv)`)); }
ok('K2 when the keyboard finally arrives, the visibility check runs against the TRUE keyboard height (560) | calls ' + JSON.stringify(efvLate), efvLate.length >= 1 && Math.abs(efvLate[0].h - 560) <= 2);
// Beta 1.70 (audit A03): a DELAYED dismissal - after blur the height sits at the
// short value for a while before the keyboard starts retracting. The closing
// sampler must not release the freeze inside that window (its opening twin, N02,
// got the same discipline in 1.69).
await ev(`document.querySelector('.noteEd textarea').blur()`);
await sleep(350);
ok('K02 delayed dismissal: the freeze HOLDS while the height has not begun to rise', await ev(`document.body.classList.contains('kb')`));
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
ok('K02b once the height is home the freeze releases', await poll120(`!document.body.classList.contains('kb')`, 4000));
// Beta 1.70 (audit A02): a modal card, two-stage keyboard growth. The card is
// shifted up at the first height; when the keyboard grows further, the second
// correction must be computed from the UNSHIFTED card - the old math measured
// the shifted card and under-shifted, dropping the field back under the keyboard.
await ev(`(() => { const d = document.createElement('div'); d.className = 'modal'; d.id = 'kModal'; d.innerHTML = '<div class="card" style="margin-top:560px"><div>Note</div><textarea id="kTa" rows="3"></textarea></div>'; document.body.appendChild(d); return true; })()`);
await ev(`document.getElementById('kTa').focus()`); await sleep(300);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 580, deviceScaleFactor: 2, mobile: true }, S); await sleep(800);
const kA = JSON.parse(await ev(`(() => { const r = document.getElementById('kTa').getBoundingClientRect(); return JSON.stringify({ b: r.bottom, floor: window.visualViewport.height - 8 }); })()`));
ok('K01a first keyboard height: the modal field is lifted above the keyboard | bottom ' + Math.round(kA.b) + ' floor ' + kA.floor, kA.b <= kA.floor + 2);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 480, deviceScaleFactor: 2, mobile: true }, S); await sleep(900);
const kB = JSON.parse(await ev(`(() => { const r = document.getElementById('kTa').getBoundingClientRect(); return JSON.stringify({ b: r.bottom, floor: window.visualViewport.height - 8 }); })()`));
ok('K01b the keyboard GROWS: the field stays above it (no under-shift from measuring the shifted card) | bottom ' + Math.round(kB.b) + ' floor ' + kB.floor, kB.b <= kB.floor + 2);
await ev(`(() => { const m = document.getElementById('kModal'); if (m) m.remove(); return true; })()`);
await sleep(400);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S); await sleep(300);
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);

