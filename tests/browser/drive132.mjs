import { launchDrive, finish, bootThrough, tapById, tapSelector, expectStrict, waitTrue, waitAbsent } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive130: Beta 1.40 label handover (Andrew): zoomed out, OUR titles name the route
// streets; zooming in, they fade out across 15.4-16.4 while the basemap's own road names
// fade in on route streets (clone layers) across the same band; day basemap road names
// are restyled dark for readability; our old line-following labels are retired; the
// West link reference line no longer draws. The L4 rendered-feature check is the one
// that would have caught the Beta 1.33-era clash, where the exclusion filter was
// silently rejected and basemap names printed on route streets at every zoom.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

// SPLASH (Beta 1.42): the cold-start overlay. Reload so the checks catch it from
// the first frame instead of whenever the boot section happens to finish.
await ev(`location.reload(); true`);
let seen = null;
for (let i = 0; i < 40 && !seen; i++) { const v = await ev(`(() => { const sp = document.getElementById('splash'); const bg = document.getElementById('splashBg'); const ti = document.getElementById('splashTitle'); const ic = document.getElementById('splashIcon'); const ir = ic ? ic.getBoundingClientRect() : null; return sp ? JSON.stringify({ bg: bg ? getComputedStyle(bg).backgroundColor : '', bgi: bg ? getComputedStyle(bg).backgroundImage : '', titlePresent: !!ti, iconDx: ir ? Math.round((ir.left + ir.width / 2 - window.innerWidth / 2) * 100) / 100 : 999, iconDy: ir ? Math.round((ir.top + ir.height / 2 - window.innerHeight / 2) * 100) / 100 : 999, iconOp: (() => { let o = 1, n = ic; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); if (n === document.documentElement) break; n = n.parentElement; } return Math.round(o * 1000) / 1000; })(), sb: (document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') || {}).content || '', tc: (document.querySelector('meta[name="theme-color"]') || {}).content || '' }) : ''; })()`); if (v) seen = JSON.parse(v); else await sleep(100); }
ok('S1 splash is the first thing on screen (splash blue, NO #splashTitle element, the icon NOT yet painted, and the icon box already dead centre - Beta 1.180: the title is removed, so the first frame is blue + snow alone; the icon fades in on its OWN at 1.25s (Beta 1.160/1.163 choreography), and its rendered centre is measured against the viewport centre here - offsets ' + (seen ? seen.iconDx : 'n/a') + 'px x, ' + (seen ? seen.iconDy : 'n/a') + 'px y, tolerance 1.5px) | ' + JSON.stringify(seen), !!seen && seen.bgi.includes('linear-gradient') && seen.bgi.includes('rgb(61, 101, 239)') && seen.bgi.includes('rgb(27, 47, 182)') && seen.titlePresent === false && Math.abs(seen.iconDx) <= 1.5 && Math.abs(seen.iconDy) <= 1.5 && seen.iconOp === 0 && seen.sb === 'black-translucent' && seen.tc === '#2c4ad2'); // Beta 1.85: during the splash the theme-color is splash blue by design (the static meta; applyNight retakes it for the app phase at the boot tail) - before 1.85 this pinned the old #eceff2 static value, whose light frame could flash at the seam. Beta 1.174: the splash blue is the icon's shaded gradient (asserted on the computed background-image above); the theme-color meta can carry only a flat colour, so it takes the gradient family's midpoint #2c4ad2
ok('S1b during boot the app chrome is absent from the paint (Beta 1.86: boot is a state of the app, not a lid over it) | tabBar ' + (await ev(`getComputedStyle(document.getElementById('tabBar')).display`)) + ' hud ' + (await ev(`getComputedStyle(document.getElementById('hud')).display`)), (await ev(`getComputedStyle(document.getElementById('tabBar')).display`)) === 'none' && (await ev(`getComputedStyle(document.getElementById('hud')).display`)) === 'none');
ok('S2 splash hands over to the route menu once the app is ready (never traps the user in the brand animation)', await waitTrue(poll, `(function(){ var sp = document.getElementById('splash'); return !!sp && sp.classList.contains('menu'); })()`, 15000));
await tapById(ev, 'rmChoose');
await waitTrue(poll, `!!document.querySelector('#rmRoutes .routeRow')`, 10000); // T4: poll the terminal state the next step needs (the route row rendered)
await tapSelector(ev, '#rmRoutes .routeRow');
const gone132 = await waitAbsent(poll, 'splash', 15000);
await sleep(1600);
ok('S3 picking a route removes the splash and it never comes back (removed, not hidden)', gone132 && (await expectStrict(ev, `!document.getElementById('splash')`)));
const before = await ev(`isNight()`);
await tapById(ev, 'nightBtn');
await waitTrue(poll, `isNight() !== ${before}`, 10000); // T4: poll the terminal state S4 asserts (the night state flipped)
ok('S4 the app answers taps normally after the splash | night ' + before + ' -> ' + (await ev(`isNight()`)), (await ev(`isNight()`)) !== before);
const gateGap = await ev(`(window.__bootAt || 0) - (window.__tailAt || 0)`);
ok('S5 the heavy boot still gates off ANIMATION END, not the fallback clock (Beta 1.180: the listener re-anchors from the retired title slide to the icon fade animationend - the icon ends 1.6s after its first frame and the recalibrated 700ms breath lands the tail at the same point in the sequence the title slide end + 150ms produced. The arm-to-tail gap is the discriminator, on BOTH bounds: the fallback is a plain 2600ms timer armed at the same moment, so a demoted boot lands at gap >= 2600 and the 2500 cap excludes it; and an in-time event landing cannot come in under 700ms - the breath alone is 700ms, reached only if the listener armed in the very frame the animation ended, so the pre-1.180 floor stands unchanged) | gap ' + gateGap + 'ms', gateGap >= 700 && gateGap < 2500);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

