// proof-1237.mjs - Beta 1.237 (fix_id: centred-titles-1237).
// Andrew's call (2026-11-18, from the centred-titles sample): the blue
// menus' pane titles sit in the MIDDLE. The round first shipped a
// #routeMenu-scoped rule (the sample showed only that menu); Andrew's
// ruling the same evening (18:09 EST) widened it - "every blue menu
// that has a title", from the cold open to Settings to About - so the
// centring now lives in the BASE .rmTitle rule and the scoped rule is
// GONE. Every .rmTitle wearer centres: the six #routeMenu panes and
// the five #setMenu panes (System Health, Display and Sound, Done
// chime, About, Backup - #xTitle wears the class too). The Pace and
// Streets sheets are not blue menus (they wear .sheetTitle) and are
// untouched. Nothing else moves: same size, weight, colour, spacing;
// no pane geometry changes (the 1.236 sheet anchors stand). The
// rendered centres are measured in the round's QA (qa-1237.mjs).
// Run from the repo root:  node tests/proof/proof-1237.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app4 = read('parts/app4.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- the one base rule ----------
check('1: the centring lives in the base .rmTitle rule (every blue menu, both menus)', head.includes('.rmTitle { color: #fff; font-size: 22px; font-weight: 700; text-align: center; }'));
check('2: the scoped #routeMenu rule from the first ship is ABSENT (superseded by Andrew\'s widening ruling)', !head.includes('#routeMenu .rmTitle'));
check('3: the old plain base rule (no alignment) is gone', !head.includes('.rmTitle { color: #fff; font-size: 22px; font-weight: 700; }'));
check('4: no per-pane title override was added (the base rule is the only seat)', !head.includes('#rmListPane .rmTitle') && !head.includes('#rmCreatePane .rmTitle') && !head.includes('#rmCityListPane .rmTitle') && !head.includes('#rmPhotoPane .rmTitle') && !head.includes('#rmCityPane .rmTitle') && !head.includes('#rmNamePane .rmTitle') && !head.includes('#setStatusPane .rmTitle') && !head.includes('#setJobPane .rmTitle') && !head.includes('#setChimePane .rmTitle') && !head.includes('#setAboutPane .rmTitle') && !head.includes('#setBackupPane .rmTitle'));

// ---------- the panes it centres ----------
check('5: every titled Routes-menu pane still wears .rmTitle', ['<div class="rmTitle">Choose a route</div>', '<div class="rmTitle">Create new route</div>', '<div class="rmTitle">Select City</div>', '<div class="rmTitle">Upload photo</div>', '<div class="rmTitle">Name your route</div>', '<div class="rmTitle">What city are you cleaning in?</div>'].every(t => head.includes(t)));
check('6: every titled Settings-menu pane wears .rmTitle too (incl. #xTitle)', ['<div class="rmTitle">System Health</div>', '<div class="rmTitle">Display and Sound</div>', '<div class="rmTitle">Done chime</div>', '<div class="rmTitle">About</div>', '<div class="rmTitle" id="xTitle">Backup</div>'].every(t => head.includes(t)));
check('7: the Pace and Streets sheets wear .sheetTitle, not .rmTitle (not blue menus, untouched)', head.includes('<div class="sheetTitle">Streets</div>') && head.includes('<div class="sheetTitle">Pace</div>') && !head.includes('sheetTitle { text-align: center'));

// ---------- V: version agreement ----------
check('V: the #ver label reads Beta 1.238', head.includes('<div class="ver" id="ver">Beta 1.238</div>'));
check('V: WHATSNEW is the Beta 1.238 entry', app4.includes("v: 'Beta 1.238', items:"));
check('V: the CHANGELOG top entry is Beta 1.238', changelog.split('\n').find(l => l.startsWith('## Beta')) === '## Beta 1.238 — 2026-11-18');

console.log(`proof-1237: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
