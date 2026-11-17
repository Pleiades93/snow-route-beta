import { readFileSync } from 'node:fs';

// Soft fill + Soft Lift proof (fix_id: soft-1222, Beta 1.222, 2026-11-17).
// Andrew's two picks from the previous evening's samples, in one round:
//  - the blue menus' outline pills take variant A (soft fill): the inset
//    white ring that defined the family since Beta 1.158 retires; the
//    pills wear a lighter fill with a soft drop shadow instead. His
//    locked carve-out: the SOLID WHITE pills stay solid white, untouched.
//  - the round buttons take variant E (Soft Lift): the Start/Finish
//    circle (blue kept) and the whole .dockBtn family gain dual shadows
//    with an inset top light and an inset bottom shade, day and night.
// This proof pins, in the source (parts/head.html):
//  A: the soft-fill token pair on every member of the pill family
//     (.rmBtn, .rmBtn.quiet with its quieter delta, .m-card, the route
//     rows) and the total absence of the retired inset ring;
//  B: the carve-out - .rmBtn.primary and .routeBadge byte-identical to
//     their Beta 1.221 rules;
//  C: the lift stacks on .runBtn and .dockBtn (day + night), the Start
//     circle's blue gradient untouched, the dock's retired glass
//     (no backdrop blur left on the class rule);
//  D: the speed readout NOT lifted - #spdPill keeps its own glass rule
//     and the shared tokens stand at their 1.221 values, so the lift
//     cannot have leaked into the readout;
//  E: the version agreement (#ver and WHATSNEW both read Beta 1.222).
// The rendered behaviour (computed fills/shadows in the page, zero
// neighbour overlap, both themes) is judged by drive180's re-pinned
// PILLF/ROWF and the round's QA drive; this proof is the static pin.
// On unmodified main (Beta 1.221) sections A-E fail: the ring stands,
// the dock is glass, the circle's shadow is the float token.
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
// C — Soft Lift
check('C: .runBtn wears the lift stack', rule('.runBtn {').includes('box-shadow: 10px 12px 24px rgba(20,30,80,.38), -6px -6px 16px rgba(255,255,255,.55), inset 0 2px 3px rgba(255,255,255,.4), inset 0 -6px 12px rgba(8,12,50,.3);'));
check('C: the Start/Finish blue is untouched', rule('#startBtn, #resetBtn {').includes('background: linear-gradient(135deg, #3d65ef, #1b2fb6);'));
check('C: .dockBtn day wears the lift (gradient + stack)', rule('.dockBtn {').includes('background: linear-gradient(145deg, #ffffff, #e8ebee);') && rule('.dockBtn {').includes('box-shadow: 6px 8px 16px rgba(20,30,60,.30), -4px -4px 10px rgba(255,255,255,.9), inset 0 2px 3px rgba(255,255,255,1), inset 0 -5px 9px rgba(90,100,120,.35);'));
check('C: .dockBtn glass retired (no backdrop blur, no hairline border on the class rule)', !rule('.dockBtn {').includes('backdrop-filter') && rule('.dockBtn {').includes('border: none;'));
check('C: .dockBtn night wears the lift (gradient + stack)', rule('body.night .dockBtn {').includes('background: linear-gradient(145deg, #232833, #05070b);') && rule('body.night .dockBtn {').includes('box-shadow: 6px 8px 16px rgba(0,0,0,.65), -4px -4px 10px rgba(160,180,220,.28), inset 0 2px 3px rgba(255,255,255,.28), inset 0 -5px 9px rgba(0,0,0,.7);'));
// D — the readout is not a button and is not lifted
check('D: #spdPill keeps its own glass rule', rule('#spdPill {').includes('background: var(--glass-day);') && rule('#spdPill {').includes('box-shadow: var(--shadow-float);'));
check('D: the shared tokens stand at their 1.221 values', head.includes('--shadow-float: 0 8px 24px rgba(10,14,20,.22); --glass-day: rgba(255,255,255,.78); --glass-night: rgba(32,33,37,.78);'));
// E — version agreement
check('E: #ver reads Beta 1.222', head.includes('id="ver">Beta 1.222</div>'));
check('E: WHATSNEW is stamped Beta 1.222', app4.includes("v: 'Beta 1.222'"));

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
