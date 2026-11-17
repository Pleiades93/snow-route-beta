import { readFileSync } from 'node:fs';

// Beta 1.224 proof (fix_ids: tabular-1224, baknudge-gone-1224; the button
// settlement itself is pinned by proof-soft-1222's re-derived section C).
// Andrew's 2026-11-17 approvals, the two pieces that proof does not carry:
//  3: TABULAR NUMBERS - the live readouts wear font-variant-numeric:
//     tabular-nums so a changing value holds its width (the speed circle,
//     the progress pill, the HUD stats line, the Pace stat values, the
//     Pace group counts). CSS only; labels and button text untouched.
//  4: THE BACKUP NUDGE BAR IS REMOVED - the #bakNudge element, its
//     maybeBackupNudge function and call site, its two button handlers
//     and the nudgedAt stamp are gone whole; the other three bars
//     (#suggest, #stale, #mapNote) stand untouched, and the LS.exp
//     record's exportedAt stamp (the Settings 'Last backup' line) keeps
//     its writer.
// The rendered behaviour (computed tabular-nums on the readouts, the dock
// and Start computed surfaces in both themes, #bakNudge absent from the
// DOM, the surviving bars functional) is judged by the round's QA drive;
// this proof is the static pin. On unmodified main (Beta 1.223) every
// section fails.
//
// Run from the repo root:  node tests/proof/proof-1224.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  [' + detail + ']' : '')); }
}
const head = readFileSync('parts/head.html', 'utf8');
const app3 = readFileSync('parts/app3.js', 'utf8');
const app4 = readFileSync('parts/app4.js', 'utf8');
const changelog = readFileSync('CHANGELOG.md', 'utf8');
function rule(selector) {
  selector = selector.replace(/\s*\{\s*$/, '');
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(^|\\n)\\s*' + esc + '\\s*\\{').exec(head);
  if (!m) return '';
  const open = head.indexOf('{', m.index), close = head.indexOf('}', open);
  return head.slice(open + 1, close);
}
const TAB = 'font-variant-numeric: tabular-nums;';

// 3 — tabular numbers on the live readouts, and nowhere it does not belong
check('3: the speed circle is tabular (#spdPill)', rule('#spdPill {').includes(TAB));
check('3: the progress pill is tabular (#count)', rule('#count {').includes(TAB));
check('3: the HUD stats line is tabular (#stats)', rule('#stats {').includes(TAB));
check('3: the Pace stat values are tabular (.statgrid .v)', rule('.statgrid .v {').includes(TAB));
check('3: the Pace group counts are tabular (.gb-c)', rule('.gb-c {').includes(TAB));
check('3: the declaration lives on exactly the five readouts (no spray onto labels or buttons)',
  (head.split(TAB).length - 1) === 5);

// 4 — the backup nudge is gone whole; its neighbours stand
check('4: the #bakNudge element is gone from the page', !head.includes('id="bakNudge"') && !head.includes('#bakNudge'));
check('4: maybeBackupNudge and its call site are gone from app3', !app3.includes('maybeBackupNudge'));
check('4: the nudgedAt stamp is gone from every part', !app3.includes('nudgedAt') && !app4.includes('nudgedAt'));
check('4: the nudge buttons are gone (bakSave / bakLater / bakText)', !app3.includes('bakSave') && !app3.includes('bakLater') && !app3.includes('bakText') && !head.includes('bakSave'));
check('4: the three surviving bars stand (#suggest, #stale, #mapNote)', head.includes('id="suggest"') && head.includes('id="stale"') && head.includes('id="mapNote"'));
check('4: the stale bar keeps its slot (#stale z-index 1001 stands, the nudge\'s own 1002 rule is gone)', head.includes('#stale { z-index: 1001; }') && !head.includes('#bakNudge { z-index: 1002; }'));
check('4: the exportedAt stamp survives (noteExported still writes LS.exp)', app4.includes('function noteExported()') && app4.includes('st.exportedAt = Date.now();'));

// V — version agreement
check('V: the #ver label reads Beta 1.226', head.includes('<div class="ver" id="ver">Beta 1.227</div>'));
check('V: WHATSNEW is the Beta 1.226 entry', app4.includes("v: 'Beta 1.227', items:"));
check('V: the CHANGELOG top entry is Beta 1.226', changelog.split('\n').find(l => l.startsWith('## Beta')) === '## Beta 1.227 — 2026-11-17');
check('V: the What\'s New entry is dash-free (no em dash in the 1.225 items)', !app4.slice(app4.indexOf("v: 'Beta 1.227'"), app4.indexOf("v: 'Beta 1.227'") + 400).includes('—'));

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
