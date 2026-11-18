// proof-1228.mjs - Beta 1.228 (fix_ids: locate-pill-1228, button-stack-title-line-1228, sheet-title-cap-1228).
// Three of Andrew's calls, one round. THE PILL: the street rows' bare pin
// glyph becomes a labelled 'Locate' pill (his samples, his smallest size) -
// same seat in the name row, same handler, but a word; its visible body is
// slim, so an invisible extension stretches its touch area over the row's
// full height in its own column. THE PRESSES ARE SEPARATE (his hard rule):
// the pill shrinks alone - the row leaves the :active press group, because
// an ancestor :active would shrink the whole row under a pill press - and
// the row's shrink rides its pressOn twin, whose handler already skips any
// press landing inside a button. THE STACK: the day/night button's top is
// now #hud's own 25px padding, level with the title's top edge; the
// re-centre button follows at 91px with its 10px gap byte-identical; the
// speed circle keeps its 78px seat. THE SHEETS: both sheets share
// makeSheetDraggable, and its full stop is one computed height (sheetFullH)
// - the viewport less the title's measured top, less an 8px margin - read
// by the drag clamp, the settle test, the flick target, the midpoint and
// the note-editor raise; the 0.94 fraction survives only as the helper's
// fallback for when the title cannot be measured.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app2 = read('parts/app2.js');
const app4 = read('parts/app4.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const rule = (sel) => { const i = head.indexOf(sel); return i < 0 ? '' : head.slice(i, head.indexOf('}', i) + 1); };

// ---------- The Locate pill ----------
check('1a: the row template carries the labelled pill in the pin\'s seat', app2.includes('<button class="sbtn sloc">Locate</button>'));
check('1b: the pin button is gone from every part (markup, row stamp, theme re-stamp, glyph sizing)',
  !app2.includes('sbtn smap') && !app2.includes("querySelector('.smap')") && !app4.includes("querySelectorAll('.smap')") && !head.includes('.srow .sbtn svg'));
check('1c: the locate handler rides the pill (the pin\'s own listener, selector moved only)', app2.includes("d.querySelector('.sloc').addEventListener('click'"));
check('1d: the pill wears the sampled spec (pale chip-blue fill, link-blue word, 11px bold, 3px 9px, fully round)',
  rule('.srow .sbtn {').includes('background: rgba(44,74,210,.12);') && rule('.srow .sbtn {').includes('color: var(--link);') &&
  rule('.srow .sbtn {').includes('font-size: 11px;') && rule('.srow .sbtn {').includes('font-weight: 700;') &&
  rule('.srow .sbtn {').includes('padding: 3px 9px;') && rule('.srow .sbtn {').includes('border-radius: 999px;') && rule('.srow .sbtn {').includes('position: relative;'));
check('1e: the touch area covers the row height over the pill column (the measured edge offsets)',
  rule('.srow .sbtn::after {').includes("content: '';") && rule('.srow .sbtn::after {').includes('position: absolute;') &&
  rule('.srow .sbtn::after {').includes('left: 0; right: 0; top: -12px; bottom: -27px;'));
check('1f: the night ink is the pre-existing flip the glyph wore (no new colour)', head.includes('body.night .srow .sbtn, body.night .srow .nmNote { color: #8fa8ff; }'));
check('1g: the note mark still stamps beside the pill', app2.includes("d.querySelector('.nmNote').innerHTML = ICONS.note;"));

// ---------- The presses are separate ----------
check('2a: the pill joins the press transition group beside the row', head.includes('#filters button, .srow, .srow .sloc, .noteEd .nedSave'));
check('2b: the pill has its own :active shrink and the row is OUT of the :active group', head.includes('#filters button:active, .srow .sloc:active,') && !head.includes('.srow:active,'));
check('2c: the pressOn twin still covers the row (its shrink path on a direct press)', app4.includes("const row = e.target.closest('.srow, .crPRow, .cvRow, .prow.histRow');"));
check('2d: the pressOn handler still skips any press inside a button (a pill press never raises the row)', app4.includes("if (e.target.closest('button')) return;"));

// ---------- The stack on the title line ----------
check('3a: the day/night top is the title\'s own offset (25px)', rule('#nightBtn {').includes('top: calc(var(--vvt, 0px) + 25px + var(--sat));'));
check('3b: the re-centre button follows at 91px (25 + 56 + the same 10px gap)', rule('#centreBtn {').includes('top: calc(var(--vvt, 0px) + 91px + var(--sat));'));
check('3c: the speed circle keeps its 78px seat (it did not rise with the stack)', rule('#spdPill {').includes('top: calc(var(--vvt, 0px) + 78px + var(--sat));'));
check('3d: the selection-open re-centre drop stands (267px, anchored to the card, not the stack)', rule('body.selOpen #centreBtn {').includes('top: calc(var(--vvt, 0px) + 267px + var(--sat));'));

// ---------- The sheets stop at the title ----------
check('4a: the margin is one named constant (8px)', app2.includes('const SHEET_FULL_MARGIN_PX = 8;'));
check('4b: sheetFullH computes the cap from the live title rect and falls back to the 0.94 fraction only when the title cannot be measured',
  app2.includes('function sheetFullH(vh)') && app2.includes('return vh - Math.max(0, r.top - vvTop - SHEET_FULL_MARGIN_PX);') && app2.split('return vh * SHEET_FULL_VH;').length - 1 === 2);
check('4c: every full-stop site reads the helper (definition, raise, clamp, settle test, settle height, flick, midpoint pair)', app2.split('sheetFullH(').length - 1 >= 8);
check('4d: no full-stop site still multiplies the viewport by the fraction', !app2.includes('(vvHeight() * SHEET_FULL_VH)') && !app2.includes('Math.min(vh * SHEET_FULL_VH') && !app2.includes('targetH >= vh * SHEET_FULL_VH'));
check('4e: the stops\' constants stand (half and fallback untouched)', app2.includes('const SHEET_DEF_VH = 0.50, SHEET_FULL_VH = 0.94, SHEET_MIN_PX = 150;'));

// ---------- Version agreement ----------
check('V: the #ver label reads Beta 1.235', head.includes('<div class="ver" id="ver">Beta 1.235</div>'));
check('V: WHATSNEW is the Beta 1.235 entry with the three short bullets', app4.includes("v: 'Beta 1.235', items: [\"The city step is cleaner: fewer words, more air, and a search pill with real depth.\", \"City search suggests as you type: a few letters of a city name are enough.\"]"));
check('V: the CHANGELOG top entry is Beta 1.229', changelog.split('\n').find(l => l.startsWith('## Beta')) === '## Beta 1.235 — 2026-11-18');

console.log(`proof-1228: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
