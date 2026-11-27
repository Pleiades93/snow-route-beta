// proof-1231.mjs - Beta 1.231 (fix_id: motion-1231).
// Andrew's five motion rulings (2026-11-17 evening, from a set of UI-animation
// rules he judged one by one). (1) The press shrink takes 150ms (was 120ms),
// scale unchanged at .97. (2) A theme switch is instant: applyNight flips the
// day/night class under a theme-swap guard that suppresses every transition,
// commits with a flush, and lifts on the next frame. (3) The sheet release
// spring already shipped in Beta 1.81 (springSheet: critically damped, starts
// at the measured release velocity, exact landing, interruptible, capped) -
// this round changes no spring code; the pins below hold its load-bearing
// literals so a future churn of the mechanism fails here first. (4) The two
// scale-bearing entrances (menuRise, menuRiseC) start at scale .97 (was .98);
// nothing else about the entrances moves. (5) The minimum press: a button
// that opens a surface fires its open no earlier than 150ms after touch-down,
// through one capture-phase gate in app4 that swallows a short press's click
// and re-dispatches it to the same element at the floor.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app2 = read('parts/app2.js');
const app4 = read('parts/app4.js');
const app5 = read('parts/app5.js'); // Arch-1: app4's tail (everything after the What's New entry) lives in this part now
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- Piece 1: the press at 150ms ----------
const ruleText = (startFrag) => { const ls = head.split('\n'); const i = ls.findIndex(l => l.includes(startFrag)); if (i < 0) return '';
  let out = ''; for (let k = i; k < ls.length; k++) { out += (out ? ' ' : '') + ls[k].trim(); if (ls[k].includes('}')) break; } return out; };
const transLine = ruleText('.tabItem, .dockBtn, .runBtn,');
check('1a: the press transition group stands at 150ms with its core families', transLine.includes('transition: transform 150ms ease-out;') && transLine.includes('#selPop button') && transLine.includes('.rmBtn') && transLine.includes('#routeMenu .routeRow'));
check('1b: the switch merged rule stands at 150ms', head.includes('.m-switch { transition: background .18s var(--ease-open), transform 150ms ease-out; }'));
check('1c: no 120ms press timing survives in the page', !head.includes('transform 120ms ease-out'));
check('1d: the press scale is unchanged at .97 (shrink group and pressOn twin)', head.includes('.tabItem:active, .dockBtn:active, .runBtn:active,') && head.includes('.srow.pressOn, .crPRow.pressOn, .cvRow.pressOn, .prow.histRow.pressOn { transform: scale(.97); }'));

// ---------- Piece 2: the instant theme swap ----------
check('2a: the theme-swap guard rule stands in the page (glyph spans exempt)', head.includes('html.theme-swap *:not(.nbIco), html.theme-swap *::before, html.theme-swap *::after { transition: none !important; }'));
check('2b: applyNight raises the guard BEFORE the class flip and lifts it after', app5.indexOf("de.classList.add('theme-swap')") > -1 && app5.indexOf("de.classList.add('theme-swap')") < app5.indexOf("document.body.classList.toggle('night', isNight())") && app5.includes("requestAnimationFrame(lift); setTimeout(lift, 150);"));
check('2c: the swap still flips the theme-color meta and the night button icon', app5.includes("tc.setAttribute('content', isNight() ? '#14171d' : '#eceff2')") && app5.includes('stampNightBtn();'));

// ---------- Piece 3: the 1.81 spring stands untouched ----------
check('3a: springSheet stands with its closed form and omega', app2.includes('const SHEET_OMEGA = 30;') && app2.includes('function springSheet(sheet, q0, qT, v0, apply, finish)'));
check('3b: the spring lands exactly and is hard-capped', app2.includes('(Math.abs(q - qT) < 0.7 && Math.abs(vel) < 15) || t > 1'));
check('3c: both settle paths start the spring at the release velocity', app2.includes('springSheet(sheet, h, targetH, v * 1000') && app2.includes('springSheet(sheet, 0, height * 1.05 + 8, -velocity * 1000'));
check('3d: a close cancels a running spring first', (() => {
  const i = app2.indexOf('function close(sheet, height, velocity)');
  const seg = i < 0 ? '' : app2.slice(i, i + 700);
  const cancel = seg.indexOf('cancelSheetSpring(sheet);');
  const guard = seg.indexOf("if (!sheet.classList.contains('open'))");
  return cancel >= 0 && guard >= 0 && cancel < guard;
})());

// ---------- Piece 4: entrances at .97 ----------
check('4a: menuRise starts at scale .97', head.includes('@keyframes menuRise { from { opacity: 0; transform: translateY(10px) scale(.97); } }'));
check('4b: menuRiseC starts at scale .97 with its centring shift', head.includes('@keyframes menuRiseC { from { opacity: 0; transform: translateX(-50%) translateY(10px) scale(.97); } }'));
check('4c: no .98 entrance scale survives', !head.includes('scale(.98)'));
check('4d: the backdrop fade stays fade-only (no transform in menuFade)', head.includes('@keyframes menuFade { from { opacity: 0; } }'));
check('4e: the 1.229 search-row stagger keeps its own approved form', head.includes('@keyframes crRowIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }'));

// ---------- Piece 5: the minimum press ----------
check('5a: the floor stands at 150ms', app5.includes('const OPEN_MIN_MS = 150;'));
check('5b: the opener set carries the load-bearing seats', app5.includes('#streetsBtn') && app5.includes('#paceBtn') && app5.includes('#routesBtn') && app5.includes('#setBtn') && app5.includes('#selNote') && app5.includes("const OPEN_ROW_SEL = '.srow, .crPRow, .prow.histRow';"));
check('5c: the checked non-openers stay out of the id set', (() => { const line = app4.split('\n').find(l => l.includes('const OPEN_ID_SEL')) || ''; return !line.includes('#resetBtn') && !line.includes('#startBtn') && !line.includes('#nightBtn') && !line.includes('#gpsBtn'); })());
check('5d: the gate is capture-phase, finger/pen only, and re-dispatches the same element', app5.includes("if (e.pointerType === 'mouse') return;") && app5.includes("rec.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))"));
check('5e: a moved press fires nothing and a fresh press supersedes a pending open', app5.includes('if (rec.moved) { e.stopPropagation(); e.preventDefault(); return; }') && app5.includes('el === openPendingEl'));
check('5f: the focus exemption stands - an opener whose handler focuses a text field synchronously is never gated (Codex fix round, PR #111)', app5.includes("const OPEN_FOCUS_EXEMPT_SEL = '.srow';") && app5.includes('el.matches(OPEN_FOCUS_EXEMPT_SEL) ? null : el'));
check('5g: the exemption names the street row only - the other row families stay gated', (() => { const line = app5.split('\n').find(l => l.includes('const OPEN_FOCUS_EXEMPT_SEL')) || ''; return line.includes("'.srow'") && !line.includes('crPRow') && !line.includes('histRow'); })());


console.log(`proof-1231: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
