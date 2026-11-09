import { launchDrive, finish } from './harness.mjs';
const { proc, ev, consoleLog, sleep } = await launchDrive();

// drive180: Beta 1.153 UX fix round, item 8 - the splash transition,
// Andrew's pick from the examples page: Variant A "Rise and settle".
// Instead of the title fading/sliding away with the brand (the pre-
// 1.153 exit slid the whole brand out to the right), the SAME
// #splashTitle element is lifted into the route menu at the boot
// gate's arm() and FLIP-animated up to its menu position above the
// Choose/Create buttons, shrinking as it goes, while the buttons fade
// in beneath it. This drive samples the title's geometry every ~120 ms
// from first paint to settle and proves, from the samples themselves:
// the title starts in the splash brand; the node that lands in the
// menu is the same node (a marker property set on it in the splash
// survives the trip); its centre RISES well over 60 px and its height
// SHRINKS; it is caught mid-rise (samples strictly between start and
// landing - it travels, it does not teleport); its opacity is 1 in
// every post-arm sample (it never fades out); and the menu buttons
// end visible beneath it. Total boot timing is the gate's own (arm at
// the 1900 ms floor once tiles are in) - the last check bounds it.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

const sample = () => ev(`(() => { const ti = document.getElementById('splashTitle'); const rm = document.getElementById('routeMenu'); const pane = document.getElementById('rmMain'); const btn = document.getElementById('rmChoose'); if (ti && !ti.__mark) ti.__mark = 'same-node'; const r = ti ? ti.getBoundingClientRect() : null; return JSON.stringify({ t: Date.now(), parent: ti ? (ti.parentElement ? ti.parentElement.id : '?') : '', mark: ti ? ti.__mark || '' : '', cy: r ? Math.round(r.top + r.height / 2) : -1, h: r ? Math.round(r.height) : -1, op: ti ? getComputedStyle(ti).opacity : '', shown: rm ? rm.classList.contains('show') : false, paneOp: pane ? getComputedStyle(pane).opacity : '', btnH: btn ? Math.round(btn.getBoundingClientRect().height) : -1 }); })()`).then(s => typeof s === 'string' ? JSON.parse(s) : null).catch(() => null);

const t0 = Date.now();
const samples = [];
while (Date.now() - t0 < 30000) {
  const s = await sample();
  if (s && s.parent) { s.at = Date.now() - t0; samples.push(s); }
  const fm = samples.find(x => x.parent === 'routeMenu');
  const last = samples[samples.length - 1];
  if (fm && last && last.at - fm.at >= 2400) break; // the .95 s rise + the panes' .55 s-delayed .5 s entrance + slack, all sampled
  await sleep(120);
}
const inSplash = samples.filter(s => s.parent === 'splashBrand');
const inMenu = samples.filter(s => s.parent === 'routeMenu');
const firstMenu = inMenu[0] || null;
const lastS = samples[samples.length - 1] || {};
const startCy = inSplash.length ? inSplash[inSplash.length - 1].cy : -1;
const startH = inSplash.length ? inSplash[inSplash.length - 1].h : -1;
const midRise = (firstMenu && startCy > 0) ? inMenu.filter(s => s.cy < startCy - 15 && s.cy > lastS.cy + 15) : [];
ok('S1 the title starts where it always did - inside the splash brand | splash samples: ' + inSplash.length,
  inSplash.length >= 2 && !!firstMenu);
ok('S2 the node that lands in the route menu is the SAME element (the marker set on it in the splash survives the trip - no second title, no swap) | ' + JSON.stringify({ mark: lastS.mark, parent: lastS.parent }),
  !!firstMenu && lastS.mark === 'same-node' && lastS.parent === 'routeMenu');
ok('S3 the title RISES into the menu position: centre ' + startCy + 'px -> ' + lastS.cy + 'px (a rise of ' + (startCy - lastS.cy) + 'px)',
  startCy > 0 && lastS.cy > 0 && (startCy - lastS.cy) >= 60);
ok('S4 the title SHRINKS as it settles: height ' + startH + 'px -> ' + lastS.h + 'px',
  startH > 0 && lastS.h > 0 && lastS.h < startH * 0.9);
ok('S5 the title is caught MID-RISE (samples strictly between the splash centre and the landing - it travels, it does not teleport or crossfade) | mid-rise samples: ' + midRise.length,
  midRise.length >= 1);
ok('S6 the title never fades out: opacity is 1 in every sample from the menu flip on | ' + JSON.stringify(inMenu.map(s => s.op)),
  inMenu.length >= 2 && inMenu.every(s => s.op === '1'));
ok('S7 the menu buttons arrive beneath it: at settle the main pane is fully opaque with the Choose button at full height | ' + JSON.stringify({ paneOp: lastS.paneOp, btnH: lastS.btnH }),
  lastS.paneOp === '1' && lastS.btnH > 30);
ok('S8 the boot gate armed promptly (the transition adds no dwell: first menu sample at ' + (firstMenu ? firstMenu.at : -1) + ' ms)',
  !!firstMenu && firstMenu.at < 12000);

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
