import { readFileSync } from 'node:fs';

// Wording finished-cleans proof (fix_id: wording-finished-cleans,
// Beta 1.212, 2026-11-16). Beta 1.211's wording sweep changed every
// user-facing string that called the IN-PROGRESS clean a "run" and
// listed two it left because their "run" names a FINISHED clean: the
// plain-text export's 'Archived run (finished ...)' line and the
// saved-clean detail's 'or the run start'. Andrew ruled (2026-11-16)
// the rule covers finished cleans too, so both now say "clean".
// The census was re-run over every quoted string literal in the parts
// (the 1.211 method): no other finished-clean "run" exists - the
// remaining hits name something else (a download "already running",
// a component that "is not running", a street that "runs past the
// prepared area") and stay. Internal identifiers, storage keys and
// comments are untouched by design and are NOT checked here.
// On unmodified main (Beta 1.211) the F checks fail: both old literals
// are present and both new ones absent.
//
// Run from the repo root:  node tests/proof/proof-wording-finished-cleans.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

const app3 = readFileSync('parts/app3.js', 'utf8');
const app4 = readFileSync('parts/app4.js', 'utf8');
const head = readFileSync('parts/head.html', 'utf8');
const page = readFileSync('index.html', 'utf8');

// ================= F - the two finished-clean strings =================
console.log('F - no user-facing string calls a finished clean a run');
check('F: the export archive line says Archived clean', app4.includes("'Archived clean (finished '"));
check('F: the old export line is gone', !app4.includes("'Archived run (finished '"));
check('F: the saved-clean gap line says the clean start',
  app3.includes('measured from the previous completion, or the clean start)'));
check('F: the old gap line is gone', !app3.includes('or the run start)'));
check('F: the assembled page carries the new export line, not the old',
  page.includes("'Archived clean (finished '") && !page.includes("'Archived run (finished '"));
check('F: the assembled page carries the new gap line, not the old',
  page.includes('or the clean start)') && !page.includes('or the run start)'));

// ================= V - the bump agrees, the 1.211 set is intact =================
// (The two version pins below follow the SHIPPED version - the
// drive194 pattern: rolled in place to Beta 1.213 by the icon-swap
// round, then to Beta 1.214 by the selcard-note-move round, then to
// Beta 1.215 by the selcard-width-262 round, then to Beta 1.216 by
// the create-glow-casing-fix round, all 2026-11-16, TEST
// class. The F section above is this proof's durable property and
// is untouched.)
console.log('V - version surfaces agree; the 1.211 in-progress sweep is intact');
check('V: the #ver label reads Beta 1.226', head.includes('<div class="ver" id="ver">Beta 1.232</div>'));
check('V: WHATSNEW is the Beta 1.226 entry', app4.includes("v: 'Beta 1.232', items:"));
check('V: the 1.211 in-progress wording still stands (the resume pill itself was cut in 1.221 - the wording property now guards its absence)',
  app3.includes("phT.textContent = 'Current clean'") && !app4.includes("toast('Resumed clean") && !app4.includes("toast('Resumed run"));

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
