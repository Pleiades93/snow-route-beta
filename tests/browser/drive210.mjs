import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive210: Beta 1.255 (O-03) - Cancel start asks first, through the
// shared confirmation surface (Andrew's decision 2026-11-19, variant
// A from the measured samples). Through 1.254 the Pace sheet's Cancel
// start discarded the run in ONE tap; this drive grades the new
// contract in the real app:
// (a) the first tap shows the pill and the run's state is untouched;
// (b) an outside tap neither confirms nor dismisses (buttons only);
// (c) Keep going dismisses and the run continues;
// (d) Yes, cancel discards exactly as the old one-tap path did - the
//     pre-run board restored from the Start snapshot, the run's
//     start and snapshot records gone, the sheet closed.
// The pill's presence, centre and faces are measured in BOTH themes
// (the failure property itself, per the UI QA rule): it wears the
// selection pill's box (262px, centred) and faces (white by day,
// rgba(20,21,27,.97) by night).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

await sleep(2500);
ok('F0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// GPS stub (drive207's pattern): startClean starts GPS through the run.
await ev(`(() => { navigator.geolocation.watchPosition = () => 4242; navigator.geolocation.clearWatch = () => {}; return true; })()`);

// Pre-run progress: one street done BEFORE the run - the Start snapshot
// holds it, and a cancel must restore exactly this board.
await ev(`(() => { doneSet.add('Velmar'); saveAll(); return true; })()`);
await ev(`$('startBtn').click(); true`);
const started = await poll120(`typeof runStart !== 'undefined' && !!runStart`, 20000).catch(() => false);
ok('S0 the run starts through the real Start button | started ' + started, started === true);
// In-run progress: a second street marked during the run - the cancel
// must revert this one and keep Velmar.
await ev(`(() => { doneSet.add('Mellings'); saveAll(); return true; })()`);
await ev(`$('paceBtn').click(); true`);
const paceReady = await poll(`!!$('paceCancel')`, 15000).catch(() => false);
ok('S1 the Pace sheet opens with Cancel start on it | paceCancel ' + paceReady, paceReady === true);
const S0 = await J(`({ runStart, lsStart: localStorage.getItem(LS.start), lsSnap: !!localStorage.getItem(LS.snap), done: [...doneSet].sort() })`);
ok('S2 the run state is banked (start + snapshot records, both marks) | ' + JSON.stringify(S0), S0.lsStart !== null && S0.lsSnap === true && S0.done.length === 2);

const pillState = async () => J(`(() => { const p = $('confirmPill'); const r = p.getBoundingClientRect(); const cs = getComputedStyle(p); return { hidden: p.classList.contains('hidden') || cs.display === 'none', w: r.width, vw: window.innerWidth, dx: (r.left + r.width / 2) - window.innerWidth / 2, dy: (r.top + r.height / 2) - window.innerHeight / 2, bg: cs.backgroundColor, title: p.querySelector('.cfTitle').textContent, sub: p.querySelector('.cfSub').textContent, keep: $('cfKeep').textContent, danger: $('cfDanger').textContent, dangerBg: getComputedStyle($('cfDanger')).backgroundColor }; })()`);

// ---- (a) first tap: the pill shows, the run is untouched (DAY) ----
await ev(`$('paceCancel').click(); true`);
const shownDay = await poll(`!!$('confirmPill') && !$('confirmPill').classList.contains('hidden')`, 8000).catch(() => false);
const P1 = await pillState();
ok('A1 (day) the first tap shows the pill, centred at the selection pill\'s width, wearing the day face and Andrew\'s copy | ' + JSON.stringify(P1),
  shownDay === true && Math.abs(P1.w - Math.min(262, P1.vw * 0.92)) <= 1.5 && Math.abs(P1.dx) <= 2 && Math.abs(P1.dy) <= 2
  && P1.bg === 'rgb(255, 255, 255)' && P1.title === 'Cancel this run?' && P1.sub === 'All progress will be lost.'
  && P1.keep === 'Keep going' && P1.danger === 'Yes, cancel' && P1.dangerBg === 'rgb(230, 58, 46)');
const afterTap = await J(`({ runStart, lsStart: localStorage.getItem(LS.start), done: [...doneSet].sort() })`);
ok('A2 the run state is untouched behind the pill (same start, same marks) | ' + JSON.stringify(afterTap),
  afterTap.runStart === S0.runStart && afterTap.lsStart === S0.lsStart && JSON.stringify(afterTap.done) === JSON.stringify(S0.done));

// ---- (b) an outside tap neither confirms nor dismisses ----
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 6, y: 6, button: 'left', buttons: 1, clickCount: 1 }, S);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 6, y: 6, button: 'left', buttons: 0, clickCount: 1 }, S);
await sleep(400);
const P2 = await pillState();
const afterOutside = await J(`({ runStart })`);
ok('B1 an outside tap leaves the pill up and the run live (buttons only) | hidden ' + P2.hidden + ', runStart ' + afterOutside.runStart,
  P2.hidden === false && afterOutside.runStart === S0.runStart);

// ---- (c) Keep going dismisses; the run continues ----
await ev(`(() => { const b = $('cfKeep'); if (b) b.click(); return true; })()`); // null-safe: on a tree without the surface this drive fails its checks, it does not crash
await sleep(300);
const P3 = await pillState();
const afterKeep = await J(`({ runStart, done: [...doneSet].sort(), paceOpen: $('pacePanel').classList.contains('open') })`);
ok('C1 Keep going dismisses the pill and the run continues untouched, sheet still open | ' + JSON.stringify(afterKeep) + ', hidden ' + P3.hidden,
  P3.hidden === true && afterKeep.runStart === S0.runStart && JSON.stringify(afterKeep.done) === JSON.stringify(S0.done) && afterKeep.paceOpen === true);

// ---- (d) second ask, in NIGHT: geometry + face, then Yes, cancel ----
await ev(`(() => { setThemeOverride(true); applyNight(); return true; })()`);
const nightOn = await poll(`document.body.classList.contains('night')`, 8000).catch(() => false);
await ev(`$('paceCancel').click(); true`);
const shownNight = await poll(`!!$('confirmPill') && !$('confirmPill').classList.contains('hidden')`, 8000).catch(() => false);
const P4 = await pillState();
ok('D1 (night) the pill shows again, centred, wearing the night face | ' + JSON.stringify(P4) + ', night ' + nightOn,
  nightOn === true && shownNight === true && Math.abs(P4.dx) <= 2 && Math.abs(P4.dy) <= 2 && P4.bg === 'rgba(20, 21, 27, 0.97)');
await ev(`(() => { const b = $('cfDanger'); if (b) b.click(); return true; })()`);
const discarded = await poll120(`typeof runStart !== 'undefined' && !runStart`, 15000).catch(() => false);
await sleep(600); // the sheet's close animation settles
const afterYes = await J(`({ lsStart: localStorage.getItem(LS.start), lsSnap: localStorage.getItem(LS.snap), done: [...doneSet].sort(), pillHidden: $('confirmPill').classList.contains('hidden'), paceOpen: $('pacePanel').classList.contains('open') })`);
ok('D2 Yes, cancel discards exactly as the one-tap path did (run + snapshot records gone, pre-run board restored, in-run mark reverted, pill and sheet closed) | ' + JSON.stringify(afterYes) + ', discarded ' + discarded,
  discarded === true && afterYes.lsStart === null && afterYes.lsSnap === null
  && JSON.stringify(afterYes.done) === JSON.stringify(['Velmar']) && afterYes.pillHidden === true && afterYes.paceOpen === false);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
