import { readFileSync } from 'node:fs';

// Soft fill + Soft Lift proof (fix_id: soft-1222, Beta 1.222, 2026-11-17).
// Andrew's two picks from the previous evening's samples, in one round:
//  - the blue menus' outline pills take variant A (soft fill): the inset
//    white ring that defined the family since Beta 1.158 retires; the
//    pills wear a lighter fill with a soft drop shadow instead. His
//    locked carve-out: the SOLID WHITE pills stay solid white, untouched.
//  - the round buttons took variant E (Soft Lift) in 1.222 - REVERTED in
//    Beta 1.223 (Andrew: he did not like how it rendered; the night-map
//    glow was the trigger). Section C now pins the RESTORED Beta 1.221
//    surfaces: the float-token shadow on .runBtn, the glass .dockBtn with
//    its hairline border and blur, day and night, and the total absence
//    of the lift stacks. The soft fill above is NOT part of the revert.
// This proof pins, in the source (parts/head.html):
//  A: the soft-fill token pair on every member of the pill family
//     (.rmBtn, .rmBtn.quiet with its quieter delta, .m-card, the route
//     rows) and the total absence of the retired inset ring;
//  B: the carve-out - .rmBtn.primary and .routeBadge byte-identical to
//     their Beta 1.221 rules;
//  C: the restored 1.221 button surfaces (the Soft Lift stacks absent
//     everywhere), the Start circle's blue gradient untouched;
//  D: the speed readout NOT lifted - #spdPill keeps its own glass rule
//     and the shared tokens stand at their 1.221 values, so the lift
//     cannot have leaked into the readout;
//  E: the version agreement (#ver and WHATSNEW both read Beta 1.222).
// The rendered behaviour (computed fills/shadows in the page, zero
// neighbour overlap, both themes) is judged by drive180's re-pinned
// PILLF/ROWF and the round's QA drive; this proof is the static pin.
// On unmodified main (Beta 1.221) sections A, B and E fail (the ring
// stands; the version is 1.221); section C passes there BY DESIGN - it
// pins the 1.221 surfaces the 1.223 revert restored. On the 1.222 tree
// section C fails: the lift stacks stand where the glass belongs.
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
// C — Soft Lift REVERTED (Beta 1.223): the Beta 1.221 surfaces restored
check('C: .runBtn shadow is the 1.221 float token again', rule('.runBtn {').includes('box-shadow: var(--shadow-float);'));
check('C: the Start/Finish blue is untouched', rule('#startBtn, #resetBtn {').includes('background: linear-gradient(135deg, #3d65ef, #1b2fb6);'));
check('C: .dockBtn day wears the 1.221 glass (glass token + blur + hairline border + float shadow)', rule('.dockBtn {').includes('background: var(--glass-day); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);') && rule('.dockBtn {').includes('border: 1px solid rgba(20,22,28,.09); box-shadow: var(--shadow-float);'));
check('C: .dockBtn night wears the 1.221 glass (glass token + hairline border colour, no shadow of its own)', rule('body.night .dockBtn {').includes('background: var(--glass-night);') && rule('body.night .dockBtn {').includes('border-color: rgba(255,255,255,.16);') && !rule('body.night .dockBtn {').includes('box-shadow'));
check('C: the lift stacks are gone from the page (no lift shadow, no lift gradients)', !head.includes('10px 12px 24px rgba(20,30,80,.38)') && !head.includes('linear-gradient(145deg, #ffffff, #e8ebee)') && !head.includes('linear-gradient(145deg, #232833, #05070b)'));
// D — the readout is not a button and is not lifted
check('D: #spdPill keeps its own glass rule', rule('#spdPill {').includes('background: var(--glass-day);') && rule('#spdPill {').includes('box-shadow: var(--shadow-float);'));
check('D: the shared tokens stand at their 1.221 values', head.includes('--shadow-float: 0 8px 24px rgba(10,14,20,.22); --glass-day: rgba(255,255,255,.78); --glass-night: rgba(32,33,37,.78);'));
// E — version agreement
check('E: #ver reads Beta 1.223', head.includes('id="ver">Beta 1.223</div>'));
check('E: WHATSNEW is stamped Beta 1.223', app4.includes("v: 'Beta 1.223'"));

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
