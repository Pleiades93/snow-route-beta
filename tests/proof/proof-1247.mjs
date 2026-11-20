// proof-1247.mjs - Beta 1.247 (fix_id: savebtn-1247).
// THE SAVE BUTTON'S FACE (Andrew's pick, 2026-11-19, from the name-pane
// sample): the Name pane stacked three whites - two text boxes (their
// white pill is his standing ruling) and the Save route button wearing
// the same white .primary face. He directed Save to wear the blue menus'
// OTHER button style instead: the plain .rmBtn soft fill the Create new
// route / Manual search doors wear ("replicate the size and the color
// and the style of those ones for the save route button"). The change is
// one class: #crSaveBtn loses `primary` in the markup and takes the
// plain face + plain :active from the shared definitions. NOTHING else
// moves: the other five .primary wearers keep the white face, the
// create text boxes keep their white pills, and .rmBtn.primary's
// definition itself is untouched (proof-soft-1222's B check pins it
// byte-for-byte and stands). The rendered equality (Save's computed
// face == Create new route's, pixel medians over the menu blue, the
// pane's other elements pixel-unchanged vs 1.246) is graded by the
// round's rendered QA on both trees - its assertions fail on the
// pristine 1.246 tree, where Save wears the white primary.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const rule = (sel) => { const i = head.indexOf(sel); return i < 0 ? '' : head.slice(i, head.indexOf('}', i) + 1); };
const baseRule = (sel) => { const m = head.match(new RegExp('^' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^}]*\\}', 'm')); return m ? m[0] : ''; };

// ---------- the one change ----------
check('1: Save route wears the plain class (no primary)',
  head.includes('<button class="rmBtn" id="crSaveBtn">Save route</button>'));
check('2: the white-faced Save markup is gone',
  !head.includes('<button class="rmBtn primary" id="crSaveBtn">'));

// ---------- the fences: everything else stands ----------
check('3: the other five primary wearers keep the white face',
  head.includes('<button class="rmBtn primary" id="rmChoose">') &&
  head.includes('<button class="rmBtn primary" id="crDoorList">') &&
  head.includes('<button class="rmBtn bkBtn primary" id="xPre">') &&
  head.includes('<button class="rmBtn primary" id="updBtn">') &&
  head.includes('<button class="rmBtn bkBtn primary" id="xBak">'));
check('4: the .rmBtn.primary definition is untouched (solid white, deep-blue ink)',
  rule('.rmBtn.primary {').includes('background: #fff; color: #173a8a; box-shadow: 0 6px 18px rgba(0,0,0,.18);'));
check('5: the plain .rmBtn face Save now wears is the standing soft fill',
  baseRule('.rmBtn {').includes('background: rgba(255,255,255,.18);') &&
  baseRule('.rmBtn {').includes('box-shadow: 0 2px 8px rgba(10,16,60,.25);') &&
  baseRule('.rmBtn {').includes('color: #fff;') &&
  baseRule('.rmBtn {').includes('height: 58px;') &&
  baseRule('.rmBtn {').includes('border-radius: 14px;'));
check('6: the create text boxes keep their white pills',
  rule('#crCityInput, #crNameInput, #crAreaInput {').includes('background: #fff;') &&
  rule('#crCityInput, #crNameInput, #crAreaInput {').includes('color: #14161c;'));

// ---------- the release editorial ----------
check('7: the CHANGELOG top entry is Beta 1.247',
  changelog.indexOf('## Beta 1.247') > -1 && changelog.indexOf('## Beta 1.247') < changelog.indexOf('## Beta 1.246'));
check('8: What\'s New carries the CURRENT entry\'s bullet (rolled to 1.251: this check tracks the current entry each round), within the 108-char cap, em-dash free',
  whatsnew.includes('The cancel question now sits over a softly blurred, dimmed background.') &&
  'The cancel question now sits over a softly blurred, dimmed background.'.length <= 108 &&
  !whatsnew.includes('—'));

console.log(`proof-1247: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
