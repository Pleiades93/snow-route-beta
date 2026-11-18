import { readFileSync } from 'node:fs';

// Soft fill + Soft Lift proof (fix_id: soft-1222, Beta 1.222, 2026-11-17).
// Andrew's two picks from the previous evening's samples, in one round:
//  - the blue menus' outline pills take variant A (soft fill): the inset
//    white ring that defined the family since Beta 1.158 retires; the
//    pills wear a lighter fill with a soft drop shadow instead. His
//    locked carve-out: the SOLID WHITE pills stay solid white, untouched.
//  - the round buttons took variant E (Soft Lift) in 1.222, REVERTED in
//    Beta 1.223 (the night-map glow was the trigger), and SETTLED in Beta
//    1.224 from Andrew's second-pass samples: by day the DIALED lift
//    (roughly half strength), by night the elevation recipe (a surface
//    lit from above, a thin white border brightest on top, a highlight
//    line on top), with night Start fenced to its 1.221 float token.
//    Section C pins that settlement and the absence of both the glass
//    dock and the FULL 1.222 stacks. The soft fill above stands.
// This proof pins, in the source (parts/head.html):
//  A: the soft-fill token pair on every member of the pill family
//     (.rmBtn, .rmBtn.quiet with its quieter delta, .m-card, the route
//     rows) and the total absence of the retired inset ring;
//  B: the carve-out - .rmBtn.primary and .routeBadge byte-identical to
//     their Beta 1.221 rules;
//  C: the 1.224 button settlement (dialed day lift, night elevation
//     recipe, the night Start fence), the Start circle's blue untouched;
//  D: the speed readout NOT lifted - #spdPill keeps its own glass rule
//     and the shared tokens stand at their 1.221 values, so the lift
//     cannot have leaked into the readout;
//  E: the version agreement (#ver and WHATSNEW both read Beta 1.222).
// The rendered behaviour (computed fills/shadows in the page, zero
// neighbour overlap, both themes) is judged by drive180's re-pinned
// PILLF/ROWF and the round's QA drive; this proof is the static pin.
// On the Beta 1.223 tree sections C and E fail (the glass dock and the
// float-token Start stand where the settlement belongs; the version is
// 1.223). On the 1.222 tree section C fails the other way: the FULL lift
// stacks stand where the dialed ones belong.
//
// Run from the repo root:  node tests/proof/proof-soft-1222.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  [' + detail + ']' : '')); }
}
const head = readFileSync('parts/head.html', 'utf8');
const app4 = readFileSync('parts/app4.js', 'utf8');
function rule(selector) {
  // Line-start anchored: a descendant rule (.m-btnRow .rmBtn) or a
  // prefixed one (button.m-card) must never stand in for the base rule.
  selector = selector.replace(/\s*\{\s*$/, '');
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(^|\\n)\\s*' + esc + '\\s*\\{').exec(head);
  if (!m) return '';
  const open = head.indexOf('{', m.index), close = head.indexOf('}', open);
  return head.slice(open + 1, close);
}

const SOFT = '0 2px 8px rgba(10,16,60,.25)';
// A — the soft-fill family
check('A: .rmBtn wears the soft fill + soft shadow', rule('.rmBtn {').includes('background: rgba(255,255,255,.18); box-shadow: ' + SOFT));
check('A: .m-card wears the soft fill + soft shadow', rule('.m-card {').includes('box-shadow: ' + SOFT + '; background: rgba(255,255,255,.18);'));
check('A: the route rows wear the soft fill + soft shadow', rule('#routeMenu .routeRow {').includes('background: rgba(255,255,255,.18); border: none; box-shadow: ' + SOFT));
check('A: .rmBtn.quiet keeps its quieter delta', rule('.rmBtn.quiet {').includes('background: rgba(255,255,255,.10); box-shadow: 0 2px 8px rgba(10,16,60,.18);'));
check('A: the inset ring is retired everywhere in the page', !head.includes('inset 0 0 0 1.5px'));
// B — the solid-white carve-out, byte-identical to Beta 1.221
check('B: .rmBtn.primary is the 1.221 solid white, unchanged', rule('.rmBtn.primary {').includes('background: #fff; color: #173a8a; box-shadow: 0 6px 18px rgba(0,0,0,.18);'));
check('B: .routeBadge is the 1.221 solid white, unchanged', rule('#routeMenu .routeBadge {').includes('background: #fff; color: #2c4ad2;'));
// C — the Beta 1.224 settlement: dialed lift by day, elevation recipe by
// night, night Start fenced to the float token (re-derived from the 1.223
// revert pins at the same strength: exact computed values, both themes).
// Beta 1.226: the DAY stacks halve again (Andrew's lift-sample pick) - the
// two day pins below re-derive to the half stacks at the same strength;
// every night pin stands byte-identical.
check('C: .runBtn day shadow is the HALF lift stack (Beta 1.226)', rule('.runBtn {').includes('box-shadow: 4px 6px 12px rgba(20,30,80,.15), -3px -3px 8px rgba(255,255,255,.22), inset 0 1px 2px rgba(255,255,255,.18), inset 0 -3px 6px rgba(8,12,50,.12);'));
check('C: night Start is fenced to the 1.221 float token (the day lift cannot leak into night)', rule('body.night .runBtn {').includes('box-shadow: var(--shadow-float);'));
check('C: the Start/Finish blue is untouched', rule('#startBtn, #resetBtn {').includes('background: linear-gradient(135deg, #3d65ef, #1b2fb6);'));
check('C: .dockBtn day wears the HALF lift (Beta 1.226: light gradient, no border, soft dual shadow, glass and blur gone)', rule('.dockBtn {').includes('background: linear-gradient(145deg, #ffffff, #eceef2);') && rule('.dockBtn {').includes('border: none; box-shadow: 3px 4px 8px rgba(20,30,60,.10), -2px -2px 5px rgba(255,255,255,.35), inset 0 1px 1px rgba(255,255,255,.6), inset 0 -2px 4px rgba(90,100,120,.10);') && !rule('.dockBtn {').includes('backdrop-filter') && !rule('.dockBtn {').includes('var(--glass'));
check('C: .dockBtn night wears the elevation recipe (top-lit surface, thin white border brightest on top, highlight line, drop shadow)', rule('body.night .dockBtn {').includes('background: linear-gradient(180deg, rgba(78,81,90,.94), rgba(43,45,51,.94));') && rule('body.night .dockBtn {').includes('color: #f2f4f8; border: 1px solid rgba(255,255,255,.22); border-top-color: rgba(255,255,255,.55);') && rule('body.night .dockBtn {').includes('box-shadow: inset 0 1px 0 rgba(255,255,255,.45), 0 10px 26px rgba(0,0,0,.45);') && !rule('body.night .dockBtn {').includes('var(--glass'));
check('C: the FULL 1.222 stacks are gone from the page (no full-strength shadow, no 1.222 gradients; Beta 1.226: the 1.224 DIALED stacks join the gone list)', !head.includes('10px 12px 24px rgba(20,30,80,.38)') && !head.includes('6px 8px 16px rgba(20,30,60,.30)') && !head.includes('linear-gradient(145deg, #ffffff, #e8ebee)') && !head.includes('linear-gradient(145deg, #232833, #05070b)') && !head.includes('4px 5px 10px rgba(20,30,60,.18)') && !head.includes('6px 8px 16px rgba(20,30,80,.26)'));
// D — the readout is not a button and is not lifted
check('D: #spdPill keeps its own glass rule', rule('#spdPill {').includes('background: var(--glass-day);') && rule('#spdPill {').includes('box-shadow: var(--shadow-float);'));
check('D: the shared tokens stand at their 1.221 values', head.includes('--shadow-float: 0 8px 24px rgba(10,14,20,.22); --glass-day: rgba(255,255,255,.78); --glass-night: rgba(32,33,37,.78);'));
// E — version agreement
check('E: #ver reads Beta 1.226', head.includes('id="ver">Beta 1.230</div>'));
check('E: WHATSNEW is stamped Beta 1.226', app4.includes("v: 'Beta 1.230'"));

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
