// What's New entry rules (testing-efficiency rollout, 2026-11-23).
//
// Andrew's standing rule for the in-app What's New entry (Beta 1.223):
// short point-form lines, no em dashes. Until this round the rule was
// re-pinned by hand in every release proof (~25 files each asserted the
// CURRENT bullet's exact text, its length and the file's dash-freeness),
// so every release edited two dozen proofs to roll one bullet - the
// "bullet roll" the testing-efficiency report measured as pure upkeep.
// The claim now stands ONCE, here, in its general form: it reads
// whatever entry parts/whatsnew.js currently carries and asserts the
// rule itself, never the text - a release rolls its bullet without
// touching any test.
//
// The rule: the entry carries at least one item; every item is at most
// 108 chars; no em dash anywhere in parts/whatsnew.js.
import { readFileSync } from 'node:fs';

const whatsnew = readFileSync(new URL('../../parts/whatsnew.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, detail === undefined ? '' : detail); }
}

const m = whatsnew.match(/items: \[([\s\S]*?)\] \}/);
const items = m ? [...m[1].matchAll(/"([^"]*)"/g)].map(x => x[1]) : [];
check('the entry parses and carries at least one item', items.length >= 1, `parsed ${items.length}`);
check('every item is within the 108-char cap', items.every(t => t.length <= 108),
  JSON.stringify(items.map(t => t.length)));
check('no em dash anywhere in parts/whatsnew.js', !whatsnew.includes('—'));

console.log(`selftest-whatsnew: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
