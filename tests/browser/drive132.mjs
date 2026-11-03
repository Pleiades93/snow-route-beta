import { launchDrive, finish } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120 } = await launchDrive();



// drive130: Beta 1.40 label handover (Andrew): zoomed out, OUR titles name the route
// streets; zooming in, they fade out across 15.4-16.4 while the basemap's own road names
// fade in on route streets (clone layers) across the same band; day basemap road names
// are restyled dark for readability; our old line-following labels are retired; the
// West link reference line no longer draws. The L4 rendered-feature check is the one
// that would have caught the Beta 1.33-era clash, where the exclusion filter was
// silently rejected and basemap names printed on route streets at every zoom.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);

// SPLASH (Beta 1.42): the cold-start overlay. Reload so the checks catch it from
// the first frame instead of whenever the boot section happens to finish.
await ev(`location.reload(); true`);
let seen = null;
for (let i = 0; i < 40 && !seen; i++) { const v = await ev(`(() => { const sp = document.getElementById('splash'); const bg = document.getElementById('splashBg'); const ti = document.getElementById('splashTitle'); const ic = document.getElementById('splashIcon'); return sp ? JSON.stringify({ bg: bg ? getComputedStyle(bg).backgroundColor : '', title: ti ? ti.textContent : '', iconOp: ic ? getComputedStyle(ic).opacity : '', sb: (document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') || {}).content || '', tc: (document.querySelector('meta[name="theme-color"]') || {}).content || '' }) : ''; })()`); if (v) seen = JSON.parse(v); else await sleep(100); }
ok('S1 splash is the first thing on screen (icon blue, its own name, icon AT REST from the first frame - no rise replay) | ' + JSON.stringify(seen), !!seen && seen.bg === 'rgb(43, 75, 242)' && seen.title === 'Snow Route' && seen.iconOp === '1' && seen.sb === 'black-translucent' && seen.tc === '#eceff2');
ok('S2 splash removes itself once the app is ready (never traps the user)', await poll120(`!document.getElementById('splash')`, 15000));
await sleep(1600);
ok('S3 splash never comes back (it is removed, not hidden)', await ev(`!document.getElementById('splash')`));
const before = await ev(`isNight()`);
await ev(`$('nightBtn').click(); true`);
await sleep(400);
ok('S4 the app answers taps normally after the splash | night ' + before + ' -> ' + (await ev(`isNight()`)), (await ev(`isNight()`)) !== before);
const gateGap = await ev(`(window.__bootAt || 0) - (window.__tailAt || 0)`);
ok('S5 the heavy boot waited for the intro (map created ' + gateGap + 'ms after the boot was scheduled, gate is ~900ms+) | gap ' + gateGap, gateGap >= 700);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

