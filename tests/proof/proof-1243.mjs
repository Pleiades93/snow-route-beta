// proof-1243.mjs - Beta 1.243 (fix_id: create-1243).
// The create-route round + Arch-3 (Andrew's orders, 2026-11-18/19):
// (1) UPLOAD PHOTO DOOR OUT: Create keeps exactly two doors - "Select from
// list" and "Manual search". The door, its pane (#rmPhotoPane), its
// handlers and importDraft are removed whole; the Settings-side backup
// import (#xFile -> doRestore) is a SEPARATE feature and stands (pinned).
// (2) WHITE PILL ON EVERY CREATE TEXT BOX: the city box's solid white pill
// (white fill, ink #14161c, shadow 0 6px 18px rgba(0,0,0,.18)) is ONE group
// rule for #crCityInput / #crNameInput / #crAreaInput, and the street
// search wrap wears the same pill values in BOTH themes (its night glass
// rule is retired; the input wears the pill ink in both themes and its
// magnifier/clear glyphs stamp the dark variant in both themes).
// (Beta 1.244, Andrew's correction: the pill order covered the create
// MENU text boxes only - the street search sentence above is superseded:
// the wrap keeps the pill BY DAY and wears the shared token black at
// night, its ink and glyphs flipping with the theme again. Checks 12/13
// re-derive; the menu boxes' pill is untouched and checks 8-11/14 stand.)
// (3) ARCH-3: "end the search" has ONE owner - crResetSearch() in
// create-pick.js (clear the pending debounce, bump the sequence, hide the
// results box) - called by all five seats; the dead crSearchCtl (never
// assigned since the 1.234 on-device search) is removed with it.
// Run from the repo root:  node tests/proof/proof-1243.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app2 = read('parts/app2.js');
const app4 = read('parts/app4.js');
const app5 = read('parts/app5.js');
const pick = read('parts/create-pick.js');
const fetchJs = read('parts/create-fetch.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');
const rule = (sel) => { const i = head.indexOf(sel); return i < 0 ? '' : head.slice(i, head.indexOf('}', i)); };

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- (1) the photo door is out, whole ----------
check('1: the Create pane holds exactly the two surviving doors',
  head.includes('id="crDoorList">Select from list</button>') && head.includes('id="crDoorManual">Manual search</button>'));
check('2: the photo door, its pane and its ids are absent from the markup',
  !head.includes('crDoorPhoto') && !head.includes('rmPhotoPane') && !head.includes('crPhotoFile') && !head.includes('crDraftFile') && !head.includes('crImportBtn') && !head.includes('crShareBtn'));
check('3: the photo flow handlers and importDraft are absent from create-pick.js',
  !pick.includes('crDoorPhoto') && !pick.includes('crPhotoFile') && !pick.includes('importDraft') && !pick.includes('crShareBtn'));
check('4: the dead photo state is gone from create-fetch.js (crPhoto was never read)',
  !fetchJs.includes('crPhoto'));
check('5: the pane router and the open-element selector no longer name the photo pane or its buttons',
  !app2.includes("'rmPhotoPane'") && !app5.includes('crDoorPhoto') && !app5.includes('crPhotoBack'));
check('6: the door-only styles retire with it (the quiet delta, the divider, the photo filename)',
  !head.includes('.rmBtn.quiet') && !head.includes('.rmDivider') && !head.includes('#crPhotoName'));
check('7: the Settings backup import STANDS (a separate feature: the file input and its restore chain)',
  app4.includes("$('xImpFile').addEventListener('click', () => $('xFile').click());") && app4.includes('doRestore();'));

// ---------- (2) the white pill on every create text box ----------
check('8: ONE group rule wears the city pill on all three menu inputs (the exact 1.235 values)',
  head.includes('#crCityInput, #crNameInput, #crAreaInput { background: #fff; border: none; color: #14161c; box-shadow: 0 6px 18px rgba(0,0,0,.18); }'));
check('9: the city box keeps its own margin rule (the group rule carries no margin)',
  head.includes('#crCityInput { margin-top: 8px; }'));
check('10: the placeholder grey groups the same three inputs',
  head.includes('#crCityInput::placeholder, #crNameInput::placeholder, #crAreaInput::placeholder { color: #9aa0ab; }'));
check('11: the search wrap wears the same pill values (white fill, no border, the city shadow)',
  rule('\n#crSearchWrap {').includes('background: #fff;') && rule('\n#crSearchWrap {').includes('border: none;') && rule('\n#crSearchWrap {').includes('box-shadow: 0 6px 18px rgba(0,0,0,.18);'));
check('12: the wrap wears the pill BY DAY and the shared token black at night (Beta 1.244 supersedes the both-themes form: the grouped night rule names the wrap)',
  head.includes('body.night .dockBtn, body.night #crExit, body.night #crSearchWrap {'));
check('13: the search input wears the pill ink BY DAY and light ink at night (Beta 1.244: the pre-1.243 night override restored)',
  rule('#crSearchInput {').includes('color: #14161c;') && head.includes('body.night #crSearchInput { color: #fff; }'));
check('14: the shared .rmInput glass base is UNTOUCHED (the pill is scoped to the create boxes)',
  rule('.rmInput {').includes('background: rgba(255,255,255,.14);') && rule('.rmInput {').includes('border: 1px solid rgba(255,255,255,.45);'));

// ---------- (3) Arch-3: one owner for ending the search ----------
check('15: crResetSearch exists at the declaration site and owns the whole ritual (the exact three-move body)',
  pick.includes('function crResetSearch() {') && pick.includes("if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }\n  crSearchSeq++;\n  $('createResults').classList.remove('on');"));
check('16: all five seats call the owner (exit, clear disc, short input, outside tap, result pick)',
  (pick.match(/crResetSearch\(\);/g) || []).length === 5);
check('17: the dead crSearchCtl machinery is gone (no declaration, no assignment, no abort call - the two comments that record its removal stand as history, the codebase convention)',
  !pick.includes('crSearchCtl =') && !pick.includes('crSearchCtl.abort') && !pick.includes('crSearchCtl = null'));
check('18: the seats keep their own extras (exitCreate still clears the field - through the 1.262 teardown, which owns the emptying literal now; the disc still refocuses)',
  pick.includes("$('crSearchInput').value = ''; crSyncClear();") &&
  pick.indexOf("$('crSearchInput').focus();", pick.indexOf("$('crClear').addEventListener")) > pick.indexOf('crIsectClear();', pick.indexOf("$('crClear').addEventListener")));

// ---------- the frame ----------
check('19: What\'s New carries the CURRENT entry\'s bullet (rolled to 1.251: this check tracks the CURRENT entry each round; and stays em-dash free)',
  whatsnew.includes('Feathered road ends no longer show while you create a route.') && !whatsnew.includes('—'));
check('20: the CHANGELOG order stands (1.243 above 1.242; the 1.244 entry rides above both - proof-1244 pins the top)',
  changelog.indexOf('## Beta 1.243') > -1 && changelog.indexOf('## Beta 1.243') < changelog.indexOf('## Beta 1.242'));

console.log(`proof-1243: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
