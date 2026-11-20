import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive212: Beta 1.257 - the confirmation's backdrop (Andrew's pick
// from the backdrop ladder samples, 2026-11-20, rung B1). Through
// 1.256 the shared confirmation pill floated scrim-free; over the
// open Pace sheet it read as one thing stacked on another. The
// surface now owns ONE full-screen backdrop (#confirmBackdrop)
// wearing the exact sampled pair - dim rgba(0,0,0,.25) + backdrop
// blur 3px - above everything and below the pill, shown and hidden
// with it. This drive grades the rendered contract in the real app:
// (a) the pill shown => the backdrop stands with the picked values
//     read back from the LIVE element (computed background and
//     backdrop-filter, faded fully in on the shared tokens), and
//     hit-testing proves the stack: the pill's centre resolves
//     inside the pill, points over the sheet and the map resolve
//     to the backdrop;
// (b) a real tap on the backdrop does NOTHING - the pill stays up,
//     the run is untouched, the sheet underneath stays open
//     (dismissal is buttons-only; the tap cannot fall through);
// (c) Keep going takes the backdrop down with the pill; the dock's
//     Cancel start raises both again and Keep going clears both;
// (d) in NIGHT the same values hold, and Yes, cancel takes the
//     backdrop down as the run is discarded exactly as before.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

await sleep(2500);
ok('F0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// GPS stub (drive207's pattern): startClean starts GPS through the run.
await ev(`(() => { navigator.geolocation.watchPosition = () => 4242; navigator.geolocation.clearWatch = () => {}; return true; })()`);

// The drive210 staging: one street done BEFORE the run (the Start
// snapshot holds it; a cancel restores exactly it), a second marked
// during the run (a cancel reverts this one).
await ev(`(() => { markStreet('Velmar', true); return true; })()`);
await sleep(300);
await ev(`$('startBtn').click(); true`);
const started = await poll120(`typeof runStart !== 'undefined' && !!runStart`, 20000).catch(() => false);
ok('S0 the run starts through the real Start button | started ' + started, started === true);
await ev(`(() => { markStreet('Mellings', true); return true; })()`);
await sleep(300);
await ev(`$('paceBtn').click(); true`);
const paceReady = await poll(`!!$('paceCancel')`, 15000).catch(() => false);
ok('S1 the Pace sheet opens with Cancel start on it | paceCancel ' + paceReady, paceReady === true);
const S0 = await J(`({ runStart, lsStart: localStorage.getItem(LS.start), lsSnap: !!localStorage.getItem(LS.snap), done: [...doneSet].sort() })`);
ok('S2 the run state is banked (start + snapshot records, both marks) | ' + JSON.stringify(S0), S0.lsStart !== null && S0.lsSnap === true && S0.done.length === 2);

const bdState = async () => J(`(() => { const b = $('confirmBackdrop'); if (!b) return { exists: false }; const cs = getComputedStyle(b); return { exists: true, on: b.classList.contains('on'), bg: cs.backgroundColor, bf: cs.backdropFilter, op: cs.opacity, vis: cs.visibility, zi: cs.zIndex, pillZi: getComputedStyle($('confirmPill')).zIndex }; })()`);
const hit = async (x, y) => J(`(() => { const el = document.elementFromPoint(${x}, ${y}); if (!el) return 'none'; if (el === $('confirmBackdrop')) return 'backdrop'; if ($('confirmPill').contains(el)) return 'pill'; return 'other:' + (el.id || el.className || el.tagName); })()`);
const pillCentre = async () => J(`(() => { const r = $('confirmPill').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
const sheetPoint = async () => J(`(() => { const r = $('pacePanel').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.bottom - 40) }; })()`);
// Real pointer input (drive210's pattern): a bare .click() fires no
// pointerdown, so it cannot see the document click-away handler a
// real press bubbles through first.
const pressAt = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }, S); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }, S); };
const pressEl = async (id) => { const pt = await J(`(() => { const b = $('${id}'); if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`); if (!pt || pt.__err || typeof pt.x !== 'number') return false; await pressAt(pt.x, pt.y); return true; };
const bdIn = () => poll(`(() => { const b = $('confirmBackdrop'); return !!b && getComputedStyle(b).opacity === '1'; })()`, 4000).catch(() => false);
const bdOut = () => poll(`(() => { const b = $('confirmBackdrop'); return !!b && getComputedStyle(b).visibility === 'hidden' && !b.classList.contains('on'); })()`, 4000).catch(() => false);

// ---- (a) first ask (DAY, Pace door): the backdrop stands, picked values, the stack ----
await ev(`$('paceCancel').click(); true`);
const shownDay = await poll(`!!$('confirmPill') && !$('confirmPill').classList.contains('hidden')`, 8000).catch(() => false);
const fadedIn = await bdIn();
const B1 = await bdState();
ok('A1 (day) with the pill up the backdrop stands at the picked pair, read back from the live element (dim rgba(0,0,0,.25), blur 3px, z 1199 under the pill\'s 1200, faded fully in) | ' + JSON.stringify(B1) + ', shown ' + shownDay + ', fadedIn ' + fadedIn,
  shownDay === true && fadedIn === true && B1.exists === true && B1.on === true
  && B1.bg === 'rgba(0, 0, 0, 0.25)' && B1.bf === 'blur(3px)' && B1.op === '1' && B1.vis === 'visible'
  && B1.zi === '1199' && B1.pillZi === '1200');
const pc = await pillCentre(); const sp = await sheetPoint();
const hitPill = await hit(pc.x, pc.y); const hitSheet = await hit(sp.x, sp.y); const hitMap = await hit(6, 6);
ok('A2 hit-testing proves the stack: the pill\'s centre resolves inside the pill; a point over the sheet and a point over the map resolve to the backdrop | pill ' + hitPill + ', sheet ' + hitSheet + ', map ' + hitMap,
  hitPill === 'pill' && hitSheet === 'backdrop' && hitMap === 'backdrop');

// ---- (b) a real tap on the backdrop does nothing ----
await pressAt(sp.x, sp.y);
await sleep(400);
const afterTap = await J(`({ runStart, done: [...doneSet].sort(), pillHidden: $('confirmPill').classList.contains('hidden'), paceOpen: $('pacePanel').classList.contains('open') })`);
const B2 = await bdState();
ok('B1 a real tap on the backdrop changes nothing: pill still up, backdrop still standing, run untouched, the sheet underneath still open | ' + JSON.stringify(afterTap) + ', backdrop on ' + B2.on,
  afterTap.pillHidden === false && B2.on === true && afterTap.runStart === S0.runStart
  && JSON.stringify(afterTap.done) === JSON.stringify(S0.done) && afterTap.paceOpen === true);

// ---- (c) Keep going takes the backdrop down with the pill ----
await pressEl('cfKeep');
const goneC = await bdOut();
await sleep(200);
const afterKeep = await J(`({ runStart, done: [...doneSet].sort(), pillHidden: $('confirmPill').classList.contains('hidden'), paceOpen: $('pacePanel').classList.contains('open') })`);
const hitAfterKeep = await hit(sp.x, sp.y);
ok('C1 Keep going dismisses pill and backdrop together; the run continues, the sheet stays open, and the sheet point hit-tests to the sheet again | ' + JSON.stringify(afterKeep) + ', gone ' + goneC + ', hit ' + hitAfterKeep,
  goneC === true && afterKeep.pillHidden === true && afterKeep.runStart === S0.runStart
  && JSON.stringify(afterKeep.done) === JSON.stringify(S0.done) && afterKeep.paceOpen === true && hitAfterKeep !== 'backdrop');

// ---- (c2) the dock door raises both, Keep going clears both ----
await ev(`(() => { closeSheets(); return true; })()`);
await sleep(500);
await ev(`$('cancelStartBtn').click(); true`);
const shownDock = await poll(`!!$('confirmPill') && !$('confirmPill').classList.contains('hidden')`, 8000).catch(() => false);
const fadedDock = await bdIn();
const B3 = await bdState();
ok('D1 the dock Cancel start raises the same backdrop with the pill (the surface owns it, not the door) | shown ' + shownDock + ', fadedIn ' + fadedDock + ', ' + JSON.stringify(B3),
  shownDock === true && fadedDock === true && B3.on === true && B3.bg === 'rgba(0, 0, 0, 0.25)' && B3.bf === 'blur(3px)');
await pressEl('cfKeep');
const goneD = await bdOut();
const afterDock = await J(`({ runStart, pillHidden: $('confirmPill').classList.contains('hidden') })`);
ok('D2 Keep going at the dock-asked question clears pill and backdrop; the run continues | gone ' + goneD + ', ' + JSON.stringify(afterDock),
  goneD === true && afterDock.pillHidden === true && afterDock.runStart === S0.runStart);
await ev(`$('paceBtn').click(); true`);
const paceAgain = await poll(`!!$('paceCancel')`, 15000).catch(() => false);
ok('D3 the Pace sheet reopens for the night section | paceCancel ' + paceAgain, paceAgain === true);

// ---- (d) NIGHT: the same pair, then Yes, cancel takes it down with the run ----
await ev(`(() => { setThemeOverride(true); applyNight(); return true; })()`);
const nightOn = await poll(`document.body.classList.contains('night')`, 8000).catch(() => false);
await ev(`$('paceCancel').click(); true`);
const shownNight = await poll(`!!$('confirmPill') && !$('confirmPill').classList.contains('hidden')`, 8000).catch(() => false);
const fadedNight = await bdIn();
const B4 = await bdState();
const spN = await sheetPoint();
const hitNight = await hit(spN.x, spN.y);
ok('E1 (night) the backdrop stands at the same picked pair and takes the sheet point | ' + JSON.stringify(B4) + ', night ' + nightOn + ', shown ' + shownNight + ', hit ' + hitNight,
  nightOn === true && shownNight === true && fadedNight === true && B4.bg === 'rgba(0, 0, 0, 0.25)' && B4.bf === 'blur(3px)' && hitNight === 'backdrop');
await pressEl('cfDanger');
const discarded = await poll120(`typeof runStart !== 'undefined' && !runStart`, 15000).catch(() => false);
const goneE = await bdOut();
const afterYes = await J(`({ lsStart: localStorage.getItem(LS.start), lsSnap: localStorage.getItem(LS.snap), done: [...doneSet].sort(), pillHidden: $('confirmPill').classList.contains('hidden') })`);
ok('E2 Yes, cancel discards exactly as before and the backdrop goes down with the pill | ' + JSON.stringify(afterYes) + ', discarded ' + discarded + ', backdropGone ' + goneE,
  discarded === true && goneE === true && afterYes.lsStart === null && afterYes.lsSnap === null
  && JSON.stringify(afterYes.done) === JSON.stringify(['Velmar']) && afterYes.pillHidden === true);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
