import { launchDrive, finish, bootThrough, tapById, waitTrue, waitAbsent } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs'; // premise derivation: expectations about the shipped world derive from source - see pack-expect.mjs
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();

// drive198: Beta 1.199 (Andrew) — the streets-done pill (#count, under the Start circle)
// shows ONLY while a clean is running. The rule lives in ONE place: updateCount (app2)
// sets the pill's visibility from runStart, beside the Start/Finish/Cancel chrome toggles;
// every lifecycle path (Start Clean, Finish, Cancel, boot-restored run, marking) already
// flows through it. This drive measures the FAILURE properties in the rendered page:
// the pill's presence in each state (never a proxy), the count text still updating while
// the pill is hidden (marking outside a clean counts internally), and the dock geometry.
// Beta 1.209 re-derivation (TEST-class, Andrew's ruling): the pill's slot is PERMANENTLY
// RESERVED — the toggle is visibility, not display — so the geometry property is now the
// stronger one: hiding or showing the pill moves NOTHING (Start circle and both flanking
// buttons pixel-identical between idle and running, the pill's own box identical in both
// states, the dock's bottom anchor fixed, nothing ever reaching the tab bar). Through
// 1.202-1.208 this drive asserted the chrome rode by exactly the pill's footprint; that
// compaction is the behaviour Andrew ruled out after hitting the jump live.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

// P0: the no-route / boot state — before any route is picked, the pill is absent by its
// OWN resting state (the inline visibility:hidden in the markup - Beta 1.209: the slot
// is reserved from the first paint, so the resting state is invisibility, not removal),
// not merely covered by the boot chrome: nothing has called updateCount with a run,
// and the pill cannot paint.
ok('P0 no-route boot state: the pill rests at visibility:hidden before any route loads', await waitTrue(poll, `typeof $ !== 'undefined' && !!$('count') && $('count').style.visibility === 'hidden'`, 20000));

await bootThrough(ev, poll); // boots end at the route menu — click through to a loaded route
await waitAbsent(poll, 'splash', 20000);
ok('P0b app boots with the map active', await waitTrue(poll, `typeof glOk !== 'undefined' && glOk === true`, 30000));

const SNAP = `(() => { const R = (id) => { const e = $(id); if (!e) return null; const r = e.getBoundingClientRect(); return { y: Math.round(r.y * 10) / 10, b: Math.round(r.bottom * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const c = $('count');
  return { run: !!runStart, night: document.body.classList.contains('night'),
    pillShown: getComputedStyle(c).visibility === 'visible', pillVis: getComputedStyle(c).visibility, pillDisplay: getComputedStyle(c).display, pillInline: c.style.visibility,
    txt: $('countTxt').textContent, fillW: $('countFill').style.transform.replace('scaleX(', '').replace(')', ''),
    pill: R('count'), foot: c.offsetHeight + parseFloat(getComputedStyle(c).marginTop),
    circle: R('startBtn').h ? R('startBtn') : R('resetBtn'), streets: R('streetsBtn'), pace: R('paceBtn'), dock: R('dock'),
    tabTop: Math.round($('tabBar').getBoundingClientRect().top * 10) / 10 }; })()`;

// P1: route loaded, no clean — pill not painted, though its text is written; its slot
// is already reserved (the box is laid out at its full height while invisible).
const A = await J(SNAP);
ok('P1 route loaded, no clean: pill NOT PAINTED (visibility hidden) with its slot reserved | ' + JSON.stringify(A),
  A.run === false && A.pillShown === false && A.pillVis === 'hidden' && A.pillDisplay !== 'none' && A.pill.h > 0 && A.txt === '0 of ' + PACK5W.names + ' · 0%');

// P2: marking outside a clean still counts internally — the text and meter update while hidden.
await J(`(() => { markDone('Velmar', 'tap'); return true; })()`);
await waitTrue(poll, `$('countTxt').textContent.indexOf('1 of ') === 0`, 10000);
const F = await J(SNAP);
ok('P2 mark outside a clean: count text + meter update, pill stays unpainted | ' + JSON.stringify(F),
  F.run === false && F.pillShown === false && F.pillVis === 'hidden' && F.txt.indexOf('1 of ' + PACK5W.names) === 0 && parseFloat(F.fillW) > 0);
await J(`(() => { markUndone('Velmar'); return true; })()`); await sleep(300);

// P3: Start Clean (the real button) — the pill appears, with the run's chrome.
await tapById(ev, 'startBtn');
await waitTrue(poll, `!!runStart && getComputedStyle($('count')).visibility === 'visible'`, 10000);
const B = await J(SNAP);
ok('P3 Start Clean: pill PRESENT with the run text | ' + JSON.stringify(B),
  B.run === true && B.pillShown === true && B.pillVis === 'visible' && B.txt === '0 of ' + PACK5W.names + ' · 0%');

// P4: geometry (Beta 1.209) — the reserved slot means NOTHING moves: the dock's bottom
// anchor, the circle and both side buttons are pixel-identical between idle and
// running; the pill's own box is the same box in both states (it appears INTO its
// reserved slot, fully inside the dock); nothing reaches the tab bar in either state.
ok('P4 dock geometry: bottom anchor fixed; circle + side buttons pixel-identical idle vs running; pill renders inside its reserved slot; tab bar always clear | ' + JSON.stringify({ A: { dock: A.dock, circle: A.circle, pill: A.pill }, B: { dock: B.dock, circle: B.circle, foot: B.foot, pill: B.pill } }),
  Math.abs(A.dock.b - B.dock.b) <= 0.6 &&
  Math.abs(A.circle.y - B.circle.y) <= 0.6 &&
  Math.abs(A.streets.y - B.streets.y) <= 0.6 &&
  Math.abs(A.pace.y - B.pace.y) <= 0.6 &&
  Math.abs(A.pill.y - B.pill.y) <= 0.6 && Math.abs(A.pill.h - B.pill.h) <= 0.6 &&
  B.pill.y >= B.dock.y - 1 && B.pill.b <= B.dock.b + 1 &&
  A.circle.b <= A.tabTop + 1 && B.pill.b <= B.tabTop + 1);

// P5: marking during the run updates the shown pill.
await J(`(() => { markDone('Velmar', 'tap'); return true; })()`);
await waitTrue(poll, `$('countTxt').textContent.indexOf('1 of ') === 0`, 10000);
const B2 = await J(SNAP);
ok('P5 mark during the run: shown pill climbs | ' + JSON.stringify(B2),
  B2.run === true && B2.pillShown === true && B2.txt.indexOf('1 of ' + PACK5W.names) === 0 && parseFloat(B2.fillW) > 0);

// P6: Finish (the production entry point) — the pill leaves with the run.
await J(`(() => { performReset(); return true; })()`);
await waitTrue(poll, `!runStart && getComputedStyle($('count')).visibility === 'hidden'`, 10000);
const C = await J(SNAP);
ok('P6 after Finish: pill NOT PAINTED, Start chrome back, slot still reserved | ' + JSON.stringify(C),
  C.run === false && C.pillShown === false && C.pillVis === 'hidden' && C.pill.h > 0 && Math.abs(C.circle.y - B.circle.y) <= 0.6);

// P7: Start again, then Cancel — the pill leaves on the cancel path too.
await tapById(ev, 'startBtn');
await waitTrue(poll, `!!runStart && getComputedStyle($('count')).visibility === 'visible'`, 10000);
await J(`(() => { cancelStart(); return true; })()`);
await waitTrue(poll, `!runStart && getComputedStyle($('count')).visibility === 'hidden'`, 10000);
const D = await J(SNAP);
ok('P7 after Cancel start: pill NOT PAINTED | ' + JSON.stringify(D),
  D.run === false && D.pillShown === false && D.pillVis === 'hidden');

// P8: night theme — the same rule, both ways; and the dock still does not move.
await tapById(ev, 'nightBtn'); await sleep(600);
const N0 = await J(SNAP);
await tapById(ev, 'startBtn');
await waitTrue(poll, `!!runStart && getComputedStyle($('count')).visibility === 'visible'`, 10000);
const N1 = await J(SNAP);
await tapById(ev, 'cancelStartBtn');
await tapById(ev, 'cfDanger'); // Beta 1.255 PREMISE UPDATE: a UI Cancel start asks first now (the shared confirmation pill, O-03) - the dock tap opens the question and its danger button completes the cancel this section grades. (P7 above cancels by direct function call and is unchanged.)
await waitTrue(poll, `!runStart && getComputedStyle($('count')).visibility === 'hidden'`, 10000);
const N2 = await J(SNAP);
ok('P8 night: hidden idle, shown running, hidden after cancel; circle pixel-identical | ' + JSON.stringify({ N0, N1, N2 }),
  N0.night === true && N0.pillShown === false && N1.night === true && N1.pillShown === true && N2.pillShown === false &&
  Math.abs(N0.circle.y - N1.circle.y) <= 0.6 && Math.abs(N0.streets.y - N1.streets.y) <= 0.6 && Math.abs(N0.pace.y - N1.pace.y) <= 0.6);
await tapById(ev, 'nightBtn'); await sleep(400);

// P9: a clean in progress across a reload still counts as active — boot with the run
// restored from storage and the pill is up without any Start press in this page life.
await tapById(ev, 'startBtn');
await waitTrue(poll, `!!runStart && getComputedStyle($('count')).visibility === 'visible'`, 10000);
await J(`(() => { location.reload(); return true; })()`);
await sleep(1200);
await bootThrough(ev, poll);
await waitTrue(poll, `!!runStart && getComputedStyle($('count')).visibility === 'visible'`, 20000);
const E = await J(SNAP);
ok('P9 reload mid-clean: run restored, pill PRESENT on boot | ' + JSON.stringify(E),
  E.run === true && E.pillShown === true && E.pillVis === 'visible');
await J(`(() => { cancelStart(); return true; })()`);
await waitTrue(poll, `!runStart && getComputedStyle($('count')).visibility === 'hidden'`, 10000);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
