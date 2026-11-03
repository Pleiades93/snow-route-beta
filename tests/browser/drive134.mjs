import { launchDrive, finish, PATTERNS_GITHUB_IO } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120 } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });



// drive134: Beta 1.51 viewport re-measure hardening (Andrew's launch glitch).
// The app measures the visible screen once at startup; iOS can hand a
// home-screen app a too-short height at launch and correct it silently, so
// 1.51 re-measures on pageshow, on return to the front, and on rotation.
// This drive corrupts the measured values on purpose and proves each trigger
// restores them. It also pins the title block's lowered position (Andrew:
// title + version down slightly - 8px more top padding on the header).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
await sleep(3000);
ok('W0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`));
const expect = `(() => { const vv = window.visualViewport; const vvb = Math.max(0, window.innerHeight - vv.offsetTop - vv.height) + 'px'; const vvh = vv.height + 'px'; const de = document.documentElement.style; return de.getPropertyValue('--vvb') === vvb && de.getPropertyValue('--vvh') === vvh; })()`;
const corrupt = `(() => { const de = document.documentElement.style; de.setProperty('--vvb', '77px'); de.setProperty('--vvh', '111px'); return de.getPropertyValue('--vvb') === '77px'; })()`;
ok('W1 measured values are sane at boot', await ev(expect));
ok('W2a corruption lands', await ev(corrupt));
await ev(`window.dispatchEvent(new Event('pageshow'))`);
ok('W2 pageshow re-measures and restores the values', await poll120(expect, 8000));
ok('W3a corruption lands again', await ev(corrupt));
await ev(`document.dispatchEvent(new Event('visibilitychange'))`);
ok('W3 return-to-front re-measures and restores the values', await poll120(expect, 8000));
ok('W4a corruption lands a third time', await ev(corrupt));
await ev(`window.dispatchEvent(new Event('orientationchange'))`);
ok('W4 rotation re-measures and restores the values', await poll120(expect, 10000));
ok('W5 title block sits at its lowered position (header top padding 25px in the rig, no safe-area inset)', await ev(`getComputedStyle(document.getElementById('hud')).paddingTop === '25px'`));
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

