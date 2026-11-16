import { readFileSync } from 'node:fs';

// Selection-card width proof (fix_id: selcard-width-262,
// Beta 1.215, 2026-11-16).
//
// Andrew picked "C" from the width samples: the selection card
// (#selPop) narrows from 342 px to 262 px, so the top-right corner
// of the screen (the Day/Night toggle, the re-centre button) is
// never under or behind it. His correction, explicit: the card
// stays CENTRED - same centre line, same top (144), same height
// (112.2) - only the width changes. The mechanism is the one value
// in the #selPop rule: width min(342px, 92vw) -> min(262px, 92vw);
// the centring (left 50% + translateX(-50%)) is untouched.
//
// The structural pins live here; the RENDERED properties (card
// 262 x 112.2 in every state, centre offset 0, the top-right gaps,
// the longest status on one line, every street name of the route
// whole in the title row) are measured in the gate by drive128's
// M14 checks and were measured locally by the round's rendered QA
// (work/selcard-width-262: all 34 route names render whole at 262 -
// none ellipsizes; the longest status, "Stretch 14 of 14 - 1 of 2
// sides done", stays on one line, so #selStatus is NOT touched).
//
// On unmodified main (Beta 1.214): the #selPop rule reads 342 and
// the version reads 1.214 - the W and V checks fail. With the fix
// all checks pass.
//
// Run from the repo root:  node tests/proof/proof-selcard-width-262.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

const head = readFileSync('parts/head.html', 'utf8');
const app4 = readFileSync('parts/app4.js', 'utf8');
const changelog = readFileSync('CHANGELOG.md', 'utf8');

const ruleOf = (sel) => { const i = head.indexOf(sel); if (i < 0) return ''; const j = head.indexOf('; }', i); return j < 0 ? '' : head.slice(i, j + 3); };

// ================= W - the width, the centring, the top =================
console.log('W - the #selPop rule: 262 wide, centred as ever, top unchanged');
{
  const rule = ruleOf('#selPop {');
  check('W: the card rule exists', rule.length > 0);
  check('W: the ONE fixed width is 262', rule.includes('width: min(262px, 92vw);'), rule.slice(-80));
  check('W: 342 is gone from the card rule', !rule.includes('342'));
  check('W: the centring mechanism stands (left 50% + translateX(-50%))',
    rule.includes('left: 50%; transform: translateX(-50%);'));
  check('W: the top stands at 144', rule.includes('top: calc(var(--vvt, 0px) + 144px + var(--sat));'));
  const i342 = head.indexOf('width: min(342px, 92vw)');
  check('W: 342 survives ONLY on the route-menu pane (a different surface, not this change)',
    (head.split('width: min(342px, 92vw)').length - 1) === 1 && i342 > 0 &&
    head.slice(head.lastIndexOf('\n', i342) + 1, i342).includes('.rmPane {'),
    'the one surviving 342 must stand on the .rmPane base rule line');
}

// ================= D - the re-centre drop stands (its inputs are unchanged) =================
console.log('D - the 1.214 re-centre drop: top 144 and height 112.2 both stand, so 267 stands');
{
  check('D: the drop rule stands (267 = card top 144 + card height 112.2 + the ~10 gap)',
    head.includes('body.selOpen #centreBtn { top: calc(var(--vvt, 0px) + 267px + var(--sat)); }'));
}

// ================= S - the status line is untouched (measured one line at 262) =================
console.log('S - #selStatus keeps its shipped rule (the longest status measured on one line at 262)');
{
  check('S: the status rule is byte-identical to Beta 1.214',
    head.includes('#selStatus { font-size: 12px; color: #6f757f; margin-top: 1px; line-height: 1.35; }'));
}

// ================= V - the bump agrees =================
console.log('V - version surfaces agree');
{
  check('V: the #ver label reads Beta 1.219', head.includes('<div class="ver" id="ver">Beta 1.219</div>'));
  check('V: WHATSNEW is the Beta 1.219 entry', app4.includes("v: 'Beta 1.219', items:"));
  check('V: the CHANGELOG top entry is Beta 1.219', changelog.includes('## Beta 1.219 — 2026-11-16'));
}

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
