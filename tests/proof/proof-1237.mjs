// proof-1237.mjs - Beta 1.237 (fix_id: centred-titles-1237).
// Andrew's call (2026-11-18, from the centred-titles sample): the blue
// Routes menu's pane titles sit in the MIDDLE. One scoped rule -
// #routeMenu .rmTitle { text-align: center; } - centres every titled
// pane in that menu. The base .rmTitle rule is deliberately untouched:
// the Settings menu (#setMenu) wears the same class and was not in the
// approved sample, so its titles stay left (widening is deleting the
// scope). A sixth titled pane in the menu, #rmNamePane "Name your
// route", centres on the same rule - it is in the approved menu, and
// leaving it left would strand one left title inside it. Nothing else
// moves: same size, weight, colour, spacing; no pane geometry changes
// (the 1.236 sheet anchors stand). The rendered centres are measured
// in the round's QA (qa-1237.mjs).
// Run from the repo root:  node tests/proof/proof-1237.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app4 = read('parts/app4.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- the one scoped rule ----------
check('1: the centring rule stands, scoped to the Routes menu', head.includes('#routeMenu .rmTitle { text-align: center; }'));
check('2: the base .rmTitle rule is untouched (no alignment in it - Settings inherits left from it)', head.includes('.rmTitle { color: #fff; font-size: 22px; font-weight: 700; }'));
check('3: no unscoped title centring exists (the base class never gains text-align at line start)', !/^\.rmTitle \{[^}]*text-align/m.test(head));
check('4: no per-pane title override was added (the one rule is the only seat)', !head.includes('#rmListPane .rmTitle') && !head.includes('#rmCreatePane .rmTitle') && !head.includes('#rmCityListPane .rmTitle') && !head.includes('#rmPhotoPane .rmTitle') && !head.includes('#rmCityPane .rmTitle') && !head.includes('#rmNamePane .rmTitle'));

// ---------- the panes it centres ----------
check('5: every titled Routes-menu pane still wears .rmTitle', ['<div class="rmTitle">Choose a route</div>', '<div class="rmTitle">Create new route</div>', '<div class="rmTitle">Select City</div>', '<div class="rmTitle">Upload photo</div>', '<div class="rmTitle">Name your route</div>', '<div class="rmTitle">What city are you cleaning in?</div>'].every(t => head.includes(t)));
check('6: the Settings panes still wear the shared class the scope decision rests on', head.includes('<div class="rmTitle">System Health</div>') && head.includes('<div class="rmTitle" id="xTitle">Backup</div>'));

// ---------- V: version agreement ----------
check('V: the #ver label reads Beta 1.237', head.includes('<div class="ver" id="ver">Beta 1.237</div>'));
check('V: WHATSNEW is the Beta 1.237 entry', app4.includes("v: 'Beta 1.237', items:"));
check('V: the CHANGELOG top entry is Beta 1.237', changelog.split('\n').find(l => l.startsWith('## Beta')) === '## Beta 1.237 — 2026-11-18');

console.log(`proof-1237: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
