import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive139: Beta 1.60 document-height floor. On iOS the rule (root
// min-height at least screen-tall) is what makes WebKit grant the full
// viewport - Chromium has no such sizing behaviour, so what is asserted
// here is (a) the rule ships in the page CSS, (b) its measurable
// precondition holds (the document is at least viewport-tall), and
// (c) the app's layout is unchanged and coherent at full size and in a
// short stage. The cure itself is judged on Andrew's iPhone, like every
// WebKit sizing claim in this project.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
await sleep(2500);
ok('P0 app boots for the floor tests', await poll120(`!!window.maplibregl && typeof glOk !== 'undefined'`, 45000));
ok('P1 the document-height floor rule ships in the page CSS', await ev(`(() => { for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) { if (r.cssText && r.cssText.indexOf('min(100lvh') >= 0) return true; } } catch (e) {} } return false; })()`));
ok('P2 precondition: the document is at least viewport-tall | scrollH', await ev(`document.documentElement.scrollHeight >= window.innerHeight`));
const lay = await ev(`(() => { const tb = document.getElementById('tabBar').getBoundingClientRect(); const mb = document.getElementById('map').getBoundingClientRect(); return { ih: window.innerHeight, tabB: Math.round(tb.bottom), mapB: Math.round(mb.bottom) }; })()`);
ok('P3 layout at full size: bar and map reach the viewport bottom | ' + JSON.stringify(lay), !!lay && lay.tabB === lay.ih && lay.mapB === lay.ih);
await ev(`window.scrollTo(0, 60); document.documentElement.scrollTop = 60; true`); await sleep(400);
ok('P4 the taller document does not make the app scrollable', await ev(`window.scrollY === 0 && document.documentElement.scrollTop === 0`));
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => q.indexOf('display-mode') >= 0 ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q); })();` }, S);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 820, deviceScaleFactor: 2, mobile: true }, S);
await ev(`location.reload()`);
await sleep(2500);
ok('P5 app reboots coherently in a short stage', await poll120(`!!window.maplibregl && window.innerHeight === 820`, 30000));
ok('P5b the boot state has ended before layout is measured (Beta 1.86: chrome is absent BY DESIGN while booting, so a bar rect read mid-boot is the boot state, not the app layout)', await poll120(`!document.documentElement.classList.contains('boot')`, 20000));
const lay2 = await ev(`(() => { const tb = document.getElementById('tabBar').getBoundingClientRect(); return { ih: window.innerHeight, tabB: Math.round(tb.bottom), sh: document.documentElement.scrollHeight }; })()`);
ok('P6 short stage: bar still at the stage bottom and the floor precondition holds | ' + JSON.stringify(lay2), !!lay2 && lay2.tabB === lay2.ih && lay2.sh >= lay2.ih);
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);

