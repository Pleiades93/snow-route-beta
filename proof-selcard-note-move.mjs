import { readFileSync } from 'node:fs';

// Selection-card note-button move proof (fix_id: selcard-note-move,
// Beta 1.214, 2026-11-16).
//
// Andrew, on the Beta 1.209 Look 2 card: "Move it up beside the title,
// like the sample." The 1.209 round shipped Look 2's colours and type
// but kept the note button in the bottom action row; his approved
// sample (selcard-sample, Look 2) had drawn it at the title row's
// right end. This round moves it: #selNote now stands inside a new
// title-row wrapper (.selTop) beside the street name, and the action
// row belongs to "Complete entire road" alone (full inner width in
// the single state).
//
// The structural pins live here; the RENDERED properties (button in
// the title row, centred on the title block; card 342 x 112.2 in
// every state - the width restated 262 by Beta 1.215, the height
// standing; the stress name ellipsizing clear of the button) are
// measured in the gate by drive128's M13 checks and were measured
// locally by the round's rendered QA (work/selcard-note-move).
//
// On unmodified main (Beta 1.213): the button sits in .selActs, there
// is no .selTop, and the version reads 1.213 - the checks fail. With
// the fix all checks pass.
//
// Run from the repo root:  node tests/proof/proof-selcard-note-move.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

const head = readFileSync('parts/head.html', 'utf8');
const app2 = readFileSync('parts/app2.js', 'utf8');
const app4 = readFileSync('parts/app4.js', 'utf8');
const changelog = readFileSync('CHANGELOG.md', 'utf8');

// ================= S - the button stands in the title row =================
console.log('S - structure: selNote inside .selTop, ahead of .selActs');
{
  const markup = head.slice(head.indexOf('<div id="selPop"'), head.indexOf('<div id="selPop"') + 700);
  const iTop = markup.indexOf('<div class="selTop">');
  const iNote = markup.indexOf('id="selNote"');
  const iActs = markup.indexOf('<div class="selActs">');
  check('S: the card markup opens a .selTop title row', iTop >= 0, markup.slice(0, 120));
  check('S: selNote stands inside the title row, ahead of the action row', iTop >= 0 && iNote > iTop && iActs > iNote,
    `selTop@${iTop} selNote@${iNote} selActs@${iActs}`);
  check('S: the action row no longer carries the note button', iActs >= 0 && !markup.slice(iActs).includes('id="selNote"'));
  check('S: the text block still carries name + status inside the title row',
    markup.slice(iTop, iNote).includes('id="selName"') && markup.slice(iTop, iNote).includes('id="selStatus"'));
}

// ================= C - the row CSS, the button's own rule untouched =================
console.log('C - CSS: the flex title row; the 34px button and the 42px reserve unchanged');
{
  check('C: .selTop is the centred flex row', head.includes('#selPop .selTop { display: flex; align-items: center; gap: 10px; }'));
  check('C: .selTxt takes the free width (name ellipsizes against the button)', head.includes('#selPop .selTxt { flex: 1; min-width: 0; }'));
  check('C: the old block .selTxt rule is gone', !head.includes('#selPop .selTxt { min-width: 0; }'));
  check('C: the note button rule is byte-identical (34px ghost circle)',
    head.includes('#selPop #selNote { flex: none; width: 34px; min-height: 34px; height: 34px;') &&
    head.includes('body.night #selPop #selNote { background: rgba(255,255,255,.06); color: #c9cdd4; }') &&
    head.includes('#selNote svg { width: 16px; height: 16px;'));
  check('C: the name keeps its nowrap/ellipsis rules', head.includes('#selName { font-size: 16px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }'));
  check('C: .selActs keeps its 42px reserve', head.includes('#selPop .selActs { display: flex; gap: 5px; align-items: center; min-height: 42px; }'));
  check('C: Complete entire road still flexes to the row width', head.includes('#selPop .selActs #selBtn { flex: 1; }'));
}

// ================= B - behaviour contract (renderPanel by ID, untouched) =================
console.log('B - behaviour: the by-ID contract renderPanel and the editor rely on');
{
  check('B: renderPanel still toggles the note button by selection kind', app2.includes("$('selNote').style.display = multi ? 'none' : '';"));
  check('B: the click still opens the note editor for the selected street',
    app2.includes("$('selNote').addEventListener('click'") && app2.includes('openNote(sel.name)'));
}

// ================= D - the re-centre button separation (Codex P2, PR #90) =================
console.log('D - while the card is open, the re-centre button drops below it');
{
  check('D: the drop rule stands (267 = card top 144 + card height 112.2 + the ~10 gap)',
    head.includes('body.selOpen #centreBtn { top: calc(var(--vvt, 0px) + 267px + var(--sat)); }'));
  check('D: the base re-centre rule is untouched (E-03: 144 top, z 1002)',
    head.includes('#centreBtn { position: fixed; top: calc(var(--vvt, 0px) + 144px + var(--sat)); right: calc(12px + var(--sar)); z-index: 1002;'));
  check('D: renderPanel raises body.selOpen with the card and drops it with the card',
    app2.includes("p.classList.remove('hidden'); document.body.classList.add('selOpen');") &&
    app2.includes("p.classList.add('hidden'); document.body.classList.remove('selOpen'); return;"));
}

// ================= V - the bump agrees =================
// (The version pins below follow the SHIPPED version - the drive194
// pattern: shipped at Beta 1.214 by this round; rolled in place to
// Beta 1.215 by the selcard-width-262 round, then to Beta 1.216 by
// the create-glow-casing-fix round, 2026-11-16, TEST class.
// The S/C/B/D sections above are this proof's durable property and
// are untouched.)
console.log('V - version surfaces agree');
{
  check('V: the #ver label reads Beta 1.218', head.includes('<div class="ver" id="ver">Beta 1.218</div>'));
  check('V: WHATSNEW is the Beta 1.218 entry', app4.includes("v: 'Beta 1.218', items:"));
  check('V: the CHANGELOG top entry is Beta 1.218', changelog.includes('## Beta 1.218 — 2026-11-16'));
}

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
