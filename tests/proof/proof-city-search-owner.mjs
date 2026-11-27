// proof-city-search-owner.mjs - Section 1 step 7 (Architecture #19, Beta 1.281).
// THE CITY SEARCH'S CLOSE HAS ONE OWNER. The street search got its close
// owner in Beta 1.243 (crResetSearch); the CITY search's equivalent ritual
// - bump the sequence, abort the in-flight request and drop its handle,
// clear the pending debounce - was still spelled out at four seats through
// Beta 1.280: the pane open (crOpenCityPane), the input event, the city
// pane's Back, and the short-query return inside crRunCitySearch (which
// omitted the timer clear, soundly: its only caller is the debounce, which
// spends the timer before running). crResetCitySearch now owns the ritual,
// mirroring crResetSearch's shape; the seats keep their extras (the input
// event re-arms its debounce, the short-query return clears the results
// box, the pane open resets the pane). The documented asymmetry is NOT
// unified away: exitCreate still does not bump crCitySeq, so the catch's
// seq-only check (crCitySearchSeqCurrent) keeps its deliberate weakness.
// Checks 4-6 run the owner against a held search and grade its three
// moves plus the currency checks' answer to the bumped sequence.
// Run from the repo root:  node tests/proof/proof-city-search-owner.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const pick = read('parts/create-pick.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

function extractFn(src, header) {
  const at = src.indexOf(header);
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0, str = null, esc = false, line = false, block = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === str) str = null; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { str = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return '';
}

// ---------- 1-3: the owner exists, the ritual survives once, every seat calls it ----------
const ownerFn = extractFn(pick, 'function crResetCitySearch()');
const CITY_STATE_LINE = 'let /** @type {number|null} */ crCityTimer = null, crCitySeq = 0, /** @type {any} */ crCityCtl = null;';
check('1a: crResetCitySearch exists in create-pick.js, beside the city-search state it closes',
  !!ownerFn && pick.includes(CITY_STATE_LINE) && pick.indexOf('function crResetCitySearch()') > pick.indexOf(CITY_STATE_LINE));
check('1b: the owner body is the historical ritual (sequence bump, abort + handle drop, debounce clear)',
  ownerFn.includes('crCitySeq++; if (crCityCtl) { try { crCityCtl.abort(); } catch (e) {} crCityCtl = null; }')
  && ownerFn.includes('if (crCityTimer) { clearTimeout(crCityTimer); crCityTimer = null; }'));
check('2: the spelled-out bump survives exactly once in the file - inside the owner',
  (pick.match(/crCitySeq\+\+;/g) || []).length === 1);
check('3: all five seats call the owner (pane open, short-query return, input event, pane Back, city pick apply)',
  (pick.match(/crResetCitySearch\(\);/g) || []).length === 5
  && extractFn(pick, 'function crOpenCityPane(ret)').includes('crResetCitySearch();')
  && extractFn(pick, 'async function crRunCitySearch()').includes('crResetCitySearch();')
  && extractFn(pick, 'function crPickCity(it)').includes('crResetCitySearch();'));

// ---------- 4-6: the owner's three moves, run for real ----------
const prelude = [
  'let crSession = 7;',
  'let /** @type {number|null} */ crCityTimer = null, crCitySeq = 0, /** @type {any} */ crCityCtl = null;',
  extractFn(pick, 'function crCitySearchCurrent('),
  extractFn(pick, 'function crCitySearchSeqCurrent('),
  ownerFn,
].join('\n');
check('4a: the prelude extracted whole', prelude.includes('crResetCitySearch') && prelude.includes('crCitySearchCurrent'));
const out = vm.runInNewContext(prelude + `
  const timers = new Map([[42, true]]);
  const clearTimeout = (id) => { timers.delete(id); };
  let aborted = 0;
  crCitySeq = 5; crCityCtl = { abort() { aborted++; } }; crCityTimer = 42;
  const heldSeq = crCitySeq, heldSession = crSession;
  const beforeCurrent = crCitySearchCurrent(heldSeq, heldSession);
  crResetCitySearch();
  ({ seq: crCitySeq, ctl: crCityCtl, timer: crCityTimer, aborted, timersLeft: timers.size,
     beforeCurrent, staleNow: crCitySearchCurrent(heldSeq, heldSession), seqStaleNow: crCitySearchSeqCurrent(heldSeq),
     freshCurrent: crCitySearchCurrent(crCitySeq, heldSession) });`, { clearTimeout });
check('4b: the close bumps the sequence exactly once', out.seq === 6);
check('4c: the close aborts the held request and drops its handle', out.aborted === 1 && out.ctl === null);
check('4d: the close clears the pending debounce and drops its handle', out.timersLeft === 0 && out.timer === null);
check('5: the held search was current before the close and is stale after it, on both currency checks',
  out.beforeCurrent === true && out.staleNow === false && out.seqStaleNow === false);
check('6: a search issued after the close is current at the new sequence', out.freshCurrent === true);

console.log(`proof-city-search-owner: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
