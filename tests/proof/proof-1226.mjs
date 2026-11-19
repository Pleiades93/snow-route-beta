// proof-1226.mjs - Beta 1.226 (fix_ids: press-shrink-1226, day-lift-half-1226).
// Piece 1 (Andrew, from the approved motion sample): every pressable button or
// pill shrinks on press (transition transform 150ms ease-out, :active scale(.97)),
// and the blue menus no longer light up on press - their six :active background
// rules now hold the rest fill. Pressables centred by a rest transform compose
// the shrink with it. Display-only readouts (#spdPill, #count, #stats, the stat
// values) gain neither the transition nor the shrink.
// Piece 2 (Andrew's lift-sample pick): the DAY lift halves - .dockBtn and
// .runBtn wear the exact half-strength stacks; every night rule stands.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app4 = read('parts/app4.js');
const app5 = read('parts/app5.js'); // Arch-1: app4's tail (everything after the What's New entry) lives in this part now
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const rule = (sel) => { const i = head.indexOf(sel); return i < 0 ? '' : head.slice(i, head.indexOf('}', i) + 1); };
// The two 1.226 group rules, isolated so the exclusion checks read rules, not prose.
const transLine = head.split('\n').find(l => l.includes('.tabItem, .dockBtn, .runBtn,') && l.includes('transition: transform 150ms ease-out;')) || '';
const scaleLine = head.split('\n').find(l => l.includes('.tabItem:active, .dockBtn:active, .runBtn:active,') && l.includes('transform: scale(.97);')) || '';

// ---------- Piece 1: the press shrink ----------
check('1a: the press transition group exists and carries the core families (tab bar, dock, run button, road panel, blue menus, create)', !!transLine && transLine.includes('#selPop button') && transLine.includes('.rmBtn') && transLine.includes('button.m-card') && transLine.includes('#routeMenu .routeRow') && transLine.includes('.crPrimary') && transLine.includes('.banner button') && transLine.includes('.modal .row button'));
check('1b: the press scale group exists at scale(.97) over the same families', !!scaleLine && scaleLine.includes('#selPop button:active') && scaleLine.includes('.rmBtn:active') && scaleLine.includes('#routeMenu .routeRow:active') && scaleLine.includes('.m-switch:active'));
check('1c: the centred pressables compose the shrink with their rest transform (no sideways jump mid-press)', head.includes('#cancelStartBtn:active { transform: translateX(-50%) scale(.97); }') && head.includes('#rmClose:active, #setClose:active { transform: translateX(-50%) scale(.97); }') && head.includes('#crHintBtn:active { transform: translateX(-50%) scale(.97); }') && transLine.includes('#cancelStartBtn, #rmClose, #setClose, #crHintBtn'));
check('1d: the switch transition merges its background fade with the shrink (the merged declaration stands AFTER the switch rule, so it wins the cascade)', head.includes('.m-switch { transition: background .18s ease, transform 150ms ease-out; }') && head.indexOf('.m-switch { transition: background .18s ease, transform 150ms ease-out; }') > head.indexOf('.m-switch { appearance: none;'));
// The flash is gone: the six :active background rules hold their rest fills.
check('1e: the menu flash value is gone from the page (rgba(255,255,255,.28) survives nowhere)', !head.includes('rgba(255,255,255,.28)'));
check('1f: the primary flash is gone (the old #dbe4fd :active rule no longer exists)', !head.includes('.rmBtn.primary:active { background: #dbe4fd; }') && head.includes('.rmBtn.primary:active { background: #fff; }'));
check('1g: the delete flash is gone (rgba(230,57,46,.34) survives nowhere) and the hold wears the rest tint', !head.includes('rgba(230,57,46,.34)') && head.includes('.routeDel:active { background: rgba(230,57,46,.18); }'));
check('1h: the :active holds wear the rest fills (menu pills, cards, rows, create results; Beta 1.243: the quiet door hold retires with the door)', head.includes('.rmBtn:active { background: rgba(255,255,255,.18); }') && !head.includes('.rmBtn.quiet:active') && head.includes('button.m-card:active { background: rgba(255,255,255,.18); }') && head.includes('#routeMenu .routeRow:active { background: rgba(255,255,255,.18); }') && head.includes('.crResult:active { background: transparent; }'));
// The exclusions: display-only readouts are named in neither 1.226 group rule.
check('1i: the display-only readouts are excluded from the press rules (no #spdPill, #count, #stats, .statgrid, .gb- in either group)', !transLine.includes('#spdPill') && !transLine.includes('#count') && !transLine.includes('#stats') && !transLine.includes('.statgrid') && !transLine.includes('.gb-') && !scaleLine.includes('#spdPill') && !scaleLine.includes('#count') && !scaleLine.includes('#stats') && !scaleLine.includes('.statgrid') && !scaleLine.includes('.gb-'));
check('1j: the readout rules themselves gained no transform (the speed circle rule is byte-identical in shape to 1.225)', !rule('#spdPill {').includes('transform') && !rule('#count {').includes('transform') && !rule('#stats {').includes('transform'));
// The div rows: :active never reaches a plain div on a press in some browsers, so the
// four div row families carry a JS-toggled twin rule (app4) with the same scale.
check('1k: the pressOn twin rule carries exactly the four div row families at the same scale', head.includes('.srow.pressOn, .crPRow.pressOn, .cvRow.pressOn, .prow.histRow.pressOn { transform: scale(.97); }'));
check('1l: app5 toggles pressOn for the div rows and always clears it (pointerup, pointercancel, blur, next press)', app5.includes("e.target.closest('.srow, .crPRow, .cvRow, .prow.histRow')") && app5.includes("row.classList.add('pressOn')") && app5.includes("pressRowEl.classList.remove('pressOn')") && app5.includes("document.addEventListener('pointercancel', pressRowOff);") && app5.includes("if (e.target.closest('button')) return;"));

// ---------- Piece 2: the day lift at half strength ----------
check('2a: .dockBtn day shadow is the exact half stack', rule('.dockBtn {').includes('box-shadow: 3px 4px 8px rgba(20,30,60,.10), -2px -2px 5px rgba(255,255,255,.35), inset 0 1px 1px rgba(255,255,255,.6), inset 0 -2px 4px rgba(90,100,120,.10);'));
check('2b: .runBtn day shadow is the exact half stack', rule('.runBtn {').includes('box-shadow: 4px 6px 12px rgba(20,30,80,.15), -3px -3px 8px rgba(255,255,255,.22), inset 0 1px 2px rgba(255,255,255,.18), inset 0 -3px 6px rgba(8,12,50,.12);'));
check('2c: the 1.224 dialed stacks survive nowhere in the page', !head.includes('4px 5px 10px rgba(20,30,60,.18)') && !head.includes('6px 8px 16px rgba(20,30,80,.26)'));
check('2d: the night fence stands for Start (night Start keeps the float token); the night dock recipe is Bar black, rim light (Beta 1.242 supersedes the 1.224 elevation recipe for .dockBtn)', rule('body.night .runBtn {').includes('box-shadow: var(--shadow-float);') && rule('body.night .dockBtn {').includes('background: linear-gradient(var(--card), var(--card)) padding-box, linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.05) 55%, rgba(255,255,255,.02)) border-box;') && rule('body.night .dockBtn {').includes('border: 1px solid transparent;') && rule('body.night .dockBtn {').includes('box-shadow: 0 1px 2px rgba(0,0,0,.45), 0 12px 28px -6px rgba(0,0,0,.55);') && !rule('body.night .dockBtn {').includes('inset') && !rule('body.night .dockBtn {').includes('border-top-color'));


console.log(`proof-1226: ${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
