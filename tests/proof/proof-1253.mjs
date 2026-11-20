// proof-1253.mjs - Beta 1.253 (fix_id: audit-r4-hint).
// #20, THE HINT BUTTON'S ONE DECISION (cross-audit fix programme,
// round 4): through 1.252 the create pick-stage hint button's label
// (crRenderHint) and its click (the crHintBtn handler) interpreted the
// preparation state independently - the renderer keyed the failed
// state on crGrid (a grid object existing), the handler on
// crFailFromGrid (the failure's source). A fallback-box failure
// landing while a grid existed read 'Retry' while the click prepared
// a new area at the map centre; the dense remedy's label was
// unreachable whenever a grid existed. Both sides now consume ONE
// decision, crHintAction: the renderer takes the label, the handler
// dispatches on the action and interprets nothing. This proof pins
// the decision, its precedence (Cancel > offer > state remedies) and
// its failed-state key, the renderer's single label source, and the
// handler's dispatch-only form. The behaviour is graded by drive208.
// On the Beta 1.252 tree crHintAction does not exist and this proof
// fails.
// Run from the repo root:  node tests/proof/proof-1253.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const pick = read('parts/create-pick.js');
const cache = read('parts/create-cache.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

function extractFn(src, name) {
  const at = src.indexOf('function ' + name);
  if (at < 0) return '';
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return '';
}
const decision = extractFn(pick, 'crHintAction');
const handlerAt = pick.indexOf("$('crHintBtn').addEventListener");
const handlerEnd = handlerAt >= 0 ? pick.indexOf('\n});', handlerAt) : -1;
const handler = handlerAt >= 0 && handlerEnd > handlerAt ? pick.slice(handlerAt, handlerEnd + 4) : '';

// ---------- the one decision ----------
check('1: the decision exists', decision.length > 0);
check('2: precedence - an in-flight Cancel outranks the offer, the offer outranks the state remedies',
  decision.indexOf("crPrepState === 'preparing'") >= 0
  && decision.indexOf("crPrepState === 'preparing'") < decision.indexOf("if (crWanted)")
  && decision.indexOf("if (crWanted)") < decision.indexOf("crPrepState === 'failed'"));
check('3: the failed state keys on the failure SOURCE (crFailFromGrid), and a grid failure resumes',
  decision.includes("if (crFailFromGrid) return { label: 'Retry', act: 'resume' };"));
check('4: the dense box failure prepares at the map centre, labelled as what it does',
  decision.includes("kind === 'dense') return { label: 'Prepare this area', act: 'prepare-centre' };"));
check('5: degraded without a grid offers no button (no promise without a remedy)',
  decision.includes("if (!crGrid) return { label: '', act: '' };"));
check('6: the ready state offers no button and no dispatch (the 1.153 design), and the zoom offer falls through only for unbranched states',
  decision.includes("crPrepState === 'ready') return { label: '', act: '' };")
  && decision.indexOf("crPrepState === 'ready')") < decision.indexOf("map.getZoom() >= 14"));

// ---------- the renderer consumes it ----------
check('7: the renderer takes its label from the decision, once',
  pick.includes('btnLabel = crHintAction().label')
  && (pick.match(/btnLabel = /g) || []).length === 2); // the declaration + the one application - no branch assigns a label any more
check('8: the old crGrid-keyed failed label is gone',
  !pick.includes("crGrid ? 'Retry'"));

// ---------- the handler only dispatches ----------
check('9: the handler reads the decision and dispatches on its action',
  handler.includes('const act = crHintAction().act;')
  && handler.includes("act === 'resume'") && handler.includes("act === 'prepare-centre'"));
check('10: the handler interprets no state itself (no crFailFromGrid, no prep-state tests)',
  handler.length > 0 && !handler.includes('crFailFromGrid') && !handler.includes('crPrepState ==='));

// ---------- the failure text agrees with the button ----------
check('13: crFailText keys the dense remedy on the failure source too (never on the grid existing)',
  cache.includes("f.kind === 'dense') return crFailFromGrid ? 'Parts of '")
  && !cache.includes("f.kind === 'dense') return crGrid ?"));

// ---------- the release editorial ----------
check('11: the CHANGELOG top entry is Beta 1.253', changelog.includes('## Beta 1.253'));
check('12: What\'s New carries the 1.253 bullet, short and dash-free',
  whatsnew.includes('Street names now come from the map itself, spelled in full.')
  && 'Street names now come from the map itself, spelled in full.'.length <= 108
  && !whatsnew.includes('—'));

console.log(`proof-1253: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
