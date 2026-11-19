import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Mutation-run proof (2026-11-19, snow-mutation-run): openNameIt
// (parts/create-save.js) opens the create flow's naming pane. Its
// contract: with no draft, or a draft with no streets, it does NOTHING
// (the pane never opens over an unsavable draft); with a real draft it
// pre-fills the name input with the draft's OWN name, falling back to
// the next-route guess only when the draft has none. The mutation run
// showed the fast suite caught none of: the guard's || becoming &&
// (an empty-streets draft opens the pane), the name fallback's ||
// becoming && (a named draft gets the guess instead of its name), or
// the name assignment being deleted. This proof extracts openNameIt
// verbatim and runs it against stub DOM/state (the harness supplies
// the scope, as sibling proofs do). On the clean tree all checks pass;
// each break fails at least one.

const src = readFileSync('parts/create-save.js', 'utf8');
const start = src.indexOf('function openNameIt()');
if (start < 0) { console.log('FAIL: openNameIt not found'); process.exit(1); }
let depth = 0, end = -1;
for (let i = src.indexOf('{', start); i < src.length; i++) {
  if (src[i] === '{') depth++;
  if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
}
const fnText = src.slice(start, end);

let fails = 0;
function check(label, cond) { console.log((cond ? 'PASS: ' : 'FAIL: ') + label); if (!cond) fails++; }

function load({ draft, streets }) {
  const els = {
    crNameInput: { value: 'UNSET' },
    crAreaInput: { value: 'UNSET' },
    crNameSummary: { textContent: 'UNSET' },
  };
  const state = { pane: null };
  const ctx = vm.createContext({
    $: id => els[id],
    draft,
    draftStreets: () => streets,
    nextRouteNameGuess: () => 'Guessed Name',
    crAreaGuess: '',
    lsGet: () => null,
    LS_GLOBAL: { lastArea: 'k' },
    crDraftGeom: () => ({}),
    crStreetChosenM: () => 100,
    fmtLenM: m => m + ' m',
    routeLoaded: true,
    openRouteMenu: () => {},
    restoreBootChrome: () => {},
    showRmPane: p => { state.pane = p; },
  });
  vm.runInContext(fnText + '\nthis.__f = openNameIt;', ctx);
  return { els, state, run: () => ctx.__f() };
}
const namedDraft = { name: 'My Route', area: 'Vaughan', primaries: new Set(['A']) };
{
  const { els, state, run } = load({ draft: namedDraft, streets: ['A', 'B'] });
  run();
  check('a named draft pre-fills its own name', els.crNameInput.value === 'My Route');
  check('the naming pane opens for a real draft', state.pane === 'rmNamePane');
}
{
  const { els, run } = load({ draft: { name: '', area: '', primaries: new Set(['A']) }, streets: ['A'] });
  run();
  check('an unnamed draft falls back to the guess', els.crNameInput.value === 'Guessed Name');
}
{
  const { els, state, run } = load({ draft: namedDraft, streets: [] });
  run();
  check('a draft with no streets opens nothing and writes nothing', state.pane === null && els.crNameInput.value === 'UNSET');
}
{
  const { els, state, run } = load({ draft: null, streets: ['A'] });
  let threw = false;
  try { run(); } catch (e) { threw = true; }
  check('no draft opens nothing and writes nothing', !threw && state.pane === null && els.crNameInput.value === 'UNSET');
}
console.log(fails ? `proof-mut-nameit: ${fails} FAILING` : 'proof-mut-nameit: all pass');
process.exit(fails ? 1 : 0);
