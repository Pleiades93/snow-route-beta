// proof-1256.mjs - Beta 1.256 (fix_id: audit-r7-menus).
// MENU POLISH (the Beta 1.243 proportion census's two taste items,
// ruled on by Andrew 2026-11-19):
// (a) the Settings panes sat 32px above the screen's geometric
//     centre: they centre through their auto margins inside
//     #setMenu's padding box, and the box was asymmetric (24px top
//     against 88px bottom, the 1.223 breathing room). The top
//     padding is now the bottom's equal (88px + the larger inset at
//     both ends), so the centre the margins find is the viewport's
//     own - the line #routeMenu's panes land on - and each end
//     keeps at least its designed clearance.
// (b) the System Health section rhythm: a label takes 18px of air
//     (the pane's 12px flex gap + its own 6px), except HEALTH took
//     30 whenever the status line above it stood empty - an empty
//     #xPreStat still ate the gap twice. An empty status line now
//     takes no box, so the rhythm is 18 in every state.
// On the Beta 1.255 tree both mechanism checks fail. Behaviour is
// graded by drive211 in the real app (centre offsets and label air,
// measured, both themes, both stat states).
// Run from the repo root:  node tests/proof/proof-1256.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const slice = (src, from, to) => { const a = src.indexOf(from); const b = a < 0 ? -1 : src.indexOf(to, a); return a < 0 || b < 0 ? '' : src.slice(a, b); };

const BALANCED = 'calc(88px + max(env(safe-area-inset-top, 0px), env(safe-area-inset-bottom, 0px)))';
const setMenu = slice(head, '#setMenu {', 'opacity: 0;');
check('1 (a): #setMenu\'s top and bottom padding are equal (88px + the larger inset at both ends)',
  (setMenu.match(new RegExp(BALANCED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 2);
check('2 (a): the old asymmetric padding (24 top / 88 bottom) is gone',
  !head.includes('padding: calc(24px + env(safe-area-inset-top, 0px)) 24px calc(88px + env(safe-area-inset-bottom, 0px))'));
check('3 (b): an empty status line takes no box',
  head.includes('#xPreStat:empty { display: none; }'));
check('4: the CHANGELOG top entry is Beta 1.256', changelog.includes('## Beta 1.256'));
check('5: What\'s New carries the 1.256 bullet, short and dash-free',
  whatsnew.includes('Street names are back to the app\'s original labels.')
  && 'Street names are back to the app\'s original labels.'.length <= 108
  && !whatsnew.includes('—'));

console.log(`proof-1256: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
