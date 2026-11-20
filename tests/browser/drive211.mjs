import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive211: Beta 1.256 menu polish (the 1.243 proportion census's two
// taste items, Andrew's ruling 2026-11-19), graded by MEASURING the
// failure properties in the rendered app:
// (a) every Settings pane's centre offset from the viewport's
//     geometric centre - through 1.255 each fitting pane sat at
//     -32px (the #setMenu padding box was 24 top / 88 bottom, and the
//     panes centre inside the box). After the rebalance: 0.
// (b) the System Health section labels' air - 18px each (the pane's
//     12px gap + the label's 6px), in BOTH stat states: populated
//     (the shipped flow) and emptied (where HEALTH took 30 through
//     1.255 - the empty status line ate the flex gap twice).
// Both themes for the centre property.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

await sleep(2500);
ok('F0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

const paneDy = async () => J(`(() => { const p = document.querySelector('#setMenu .rmPane.on'); if (!p) return { __err: 'no pane on' }; const r = p.getBoundingClientRect(); return { id: p.id, dy: Math.round(((r.top + r.height / 2) - window.innerHeight / 2) * 10) / 10, h: Math.round(r.height), vh: window.innerHeight }; })()`);
const expectCentred = async (label) => { const m = await paneDy(); ok(label + ' | ' + JSON.stringify(m), !!m && Math.abs(m.dy) <= 1.5); return m; };

// ---- (a) the pane tour, DAY ----
await ev(`$('setBtn').click(); true`);
await poll120(`getComputedStyle($('setMenu')).transform === 'none'`, 15000).catch(() => false); // the slide-up must be DONE before any rect is read - a mid-flight rect reads the pane below centre (the first local run's A1 read +68 off exactly that)
await sleep(200);
await expectCentred('A1 main pane centred (day)');
await ev(`$('stBtn').click(); true`); await sleep(500);
await expectCentred('A2 status pane centred (day)');
await ev(`$('statusBack').click(); true`); await sleep(300);
await ev(`$('jobBtn').click(); true`); await sleep(500);
await expectCentred('A3 job pane centred (day)');
await ev(`$('chimeRow').click(); true`); await sleep(500);
await expectCentred('A4 chime pane centred (day)');
await ev(`$('chimeBack').click(); true`); await sleep(300);
await ev(`$('jobBack').click(); true`); await sleep(300);
await ev(`$('aboutBtn').click(); true`); await sleep(500);
await expectCentred('A5 about pane centred (day)');
await ev(`$('aboutBack').click(); true`); await sleep(300);
await ev(`$('exportBtn').click(); true`); await sleep(500);
await expectCentred('A6 backup pane centred (day)');
await ev(`$('setBack').click(); true`); await sleep(300);

// ---- (b) the Status label rhythm, both stat states ----
await ev(`$('stBtn').click(); true`); await sleep(500);
const air = async () => J(`(() => { const pane = $('setStatusPane'); const kids = [...pane.children]; const out = {}; for (let i = 0; i < kids.length; i++) { const k = kids[i]; if (!k.classList.contains('m-secLbl')) continue; let prev = null; for (let j = i - 1; j >= 0; j--) { if (getComputedStyle(kids[j]).display !== 'none' && kids[j].getBoundingClientRect().height > 0) { prev = kids[j]; break; } } out[k.textContent] = prev ? Math.round((k.getBoundingClientRect().top - prev.getBoundingClientRect().bottom) * 10) / 10 : null; } return out; })()`); // air is measured from the last VISIBLE box (non-zero height): an empty status line is not visible content, and the space it silently eats is exactly the defect - measuring from its own zero-height box would read 18 on the broken tree too
const airPop = await air();
ok('B1 label air is 18/18 with the status line populated (the shipped flow) | ' + JSON.stringify(airPop),
  Math.abs(airPop.MAPS - 18) <= 0.6 && Math.abs(airPop.HEALTH - 18) <= 0.6);
await ev(`(() => { $('xPreStat').textContent = ''; return true; })()`);
await sleep(300);
const airEmpty = await air();
ok('B2 label air stays 18/18 with the status line empty (the census state; 30 before) | ' + JSON.stringify(airEmpty),
  Math.abs(airEmpty.MAPS - 18) <= 0.6 && Math.abs(airEmpty.HEALTH - 18) <= 0.6);
await ev(`$('statusBack').click(); true`); await sleep(300);
await ev(`$('stBtn').click(); true`); await sleep(500); // renderStatus(true) repopulates the line for the night section

// ---- (a) again in NIGHT ----
await ev(`(() => { setThemeOverride(true); applyNight(); return true; })()`);
const nightOn = await poll(`document.body.classList.contains('night')`, 8000).catch(() => false);
await expectCentred('A7 status pane centred (night) | night ' + nightOn);
await ev(`$('statusBack').click(); true`); await sleep(300);
await expectCentred('A8 main pane centred (night)');

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
