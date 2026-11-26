// proof-1229.mjs - Beta 1.229 (fix_ids: aurora-shortcut-removal-1229, ontario-only-search-1229,
// city-search-motion-1229, prep-stall-watchdog-1229, cancel-delete-red-1229).
// Andrew's live repro: Create new route -> Select from list -> Aurora (Ontario,
// loaded fine) -> back -> Create new route -> Manual search -> the pane's
// 'Use Aurora' button flew the map to Aurora, ILLINOIS and the grid load sat
// at 'Loading Aurora, 0%' forever. THE SHORTCUT IS DELETED WHOLE: the button
// re-resolved the remembered city NAME through Nominatim and silently took
// the first place hit; no path resolves a city name to a place at search
// time any more. THE SEARCHES ARE ONTARIO-ONLY: Canada-only + the province
// bound at the service, and a client filter with teeth - a result naming its
// province/state survives only if it names Ontario (the bounds rectangle
// alone leaks the border strip: Aurora, Illinois stands at 41.76N, inside
// the rectangle's 41.6 south edge). THE PANE: the note is gone and the field
// rides an offset to the main pane's first-door level (measured in the
// rendered app). THE MOTION (Andrew's approved sample): skeleton rows while
// the city search runs, staggered results, the results area's height
// animating on the open easing. THE STALL: preparation gains a no-progress
// watchdog (CR_TIMING.stallMs) - the grid heartbeat starts at preparation
// entry, and past the bound the load lands in the existing failed/degraded
// state instead of sitting at a percentage forever; the fallback box prep
// carries the mirror watchdog. CANCEL/DELETE WEAR RED: the census'
// not-yet-red controls take the established treatment, colour only.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const pick = read('parts/create-pick.js');
const cache = read('parts/create-cache.js');
const citydata = read('parts/create-citydata.js');
const fetchJs = read('parts/create-fetch.js');
const app4 = read('parts/app4.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const rule = (sel) => { const i = head.indexOf(sel); return i < 0 ? '' : head.slice(i, head.indexOf('}', i) + 1); };
const pane = (() => { const i = head.indexOf('id="rmCityPane"'); return i < 0 ? '' : head.slice(i, head.indexOf('crCityBack', i) + 60); })();

// ---------- 1: the shortcut is deleted whole ----------
check('1a: the Use-city button is gone from the markup', !head.includes('id="crCityLast"'));
check('1b: no handler or display logic references the button', !pick.includes("$('crCityLast')") && !pick.includes("getElementById('crCityLast')"));
check('1c: the lookup machinery is gone (no current-check, no generation, no abort handle in code)',
  !pick.includes('crCityLookupCurrent(') && !pick.includes('crCityLookupSeq++') && !pick.includes('crCityLastCtl ='));
check('1d: the silent first-hit pattern exists nowhere in the parts', !pick.includes('.find(crIsPlace)') && !cache.includes('.find(crIsPlace)') && !citydata.includes('.find(crIsPlace)'));
check('1e: the name-only city landing is gone (no lat-less crCity built from a remembered name)', !pick.includes('crCity = { name: last, lat: null'));
check('1f: the remembered-area write stays (the city list sort + last-used tag still read it)', pick.includes('lsSet(LS_GLOBAL.lastArea, name)'));

// ---------- 2: the pane - note gone, field at the doors' level ----------
check('2a: the city pane carries no note element', !pane.includes('rmNote'));
check('2b: the note text is gone from the page', !head.includes("loads that area's street shapes once"));
check('2c: the pane keeps its title and its search field (Beta 1.235 roll: the title reworded to Andrew\'s Option 3 - the claim, a title and the field stand in the pane, is unchanged)', pane.includes('What city are you cleaning in?') && pane.includes('id="crCityInput"'));
check('2d: the pane rides the measured offset to the first-door level (Beta 1.235 roll: -54.5 -> -34.5, re-derived - the 1.235 stack above the field is a net 20px shorter (the City label left, the pill gained an 8px top margin) and the offset gives exactly those 20px back; re-measured in the rendered app: field top == first door top)', rule('#rmCityPane {').includes('top: -34.5px;'));

// ---------- 3: the city-search motion ----------
check('3a: the results area animates its height on the open easing', rule('#crCityResults {').includes('overflow: hidden;') && rule('#crCityResults {').includes('transition: height 420ms var(--ease-open);'));
check('3b: skeleton rows stand at the result rows\' own height and stride, pulsing (Beta 1.233: the rows stand at 58 now)', rule('.crSkel {').includes('height: 58px;') && rule('.crSkel {').includes('margin-bottom: 10px;') && rule('.crSkel {').includes('animation: crSkelPulse 1.05s ease-in-out infinite;') && head.includes('@keyframes crSkelPulse'));
check('3c: result rows settle in (fade + small rise keyframes)', head.includes('@keyframes crRowIn') && rule('#crCityResults .crRowIn {').includes('animation: crRowIn 260ms var(--ease-open) both;'));
check('3d: the swap helper + skeleton shower exist and the search shows skeletons while in flight',
  pick.includes('function crCityBoxSwap(build)') && pick.includes('function crCityShowSkeletons()') && pick.includes('crCityShowSkeletons();'));
check('3e: the results land staggered at ~55ms per row', pick.includes("(i * 55) + 'ms'"));
check('3f: the debounce stands (500ms)', pick.includes('}, 500);'));
check('3g: the motion rests under reduced-motion settings', head.includes('.crSkel { animation: none; opacity: .6; }'));

// ---------- 4: the stall watchdog ----------
check('4a: the stall bound is a CR_TIMING seam beside the fetch budgets', fetchJs.includes('stallMs: 180000'));
check('4b: the grid carries a progress clock, restarted by landed cells and resumes',
  // issue #179: the stamp pin is scoped to the two restart sites the claim
  // names (the pump's landed cells, the resume) - the city-preparation
  // copies are a different restart and must not carry this pin.
  cache.includes('lastProgressAt: Date.now()') &&
  cache.slice(cache.indexOf('function crGridPump(g)'), cache.indexOf('function crCityPrepare(')).includes('g.lastProgressAt = Date.now();') &&
  cache.slice(cache.indexOf('function crGridResume(')).includes('g.lastProgressAt = Date.now();'));
check('4c: the grid watchdog + stall landing exist and settle through the existing finish',
  // issue #179: the finish-call pin is scoped to the stall landing - the
  // pump's own finish calls must not carry it.
  cache.includes('function crGridWatchdog(g)') && cache.includes('function crGridStall(g)') &&
  cache.slice(cache.indexOf('function crGridStall(g)'), cache.indexOf('function crGridPump(g)')).includes('crGridFinish(g);'));
check('4d: the heartbeat is armed at preparation entry, not only at the pump', cache.includes('crGridArmTicker(g); // the heartbeat runs from entry'));
check('4e: the fallback box prep carries the mirror watchdog, orphaning its wedged landing by generation',
  citydata.includes('function crPrepWatchdog(prep, gen, session)') && citydata.includes('crPrepWatchdog(prep, gen, session);'));

// ---------- 5: Ontario only ----------
check('5a: the Ontario bounds + filter exist', pick.includes('const CR_ON_BOUNDS = { s: 41.6, n: 56.9, w: -95.2, e: -74.3 };') && pick.includes('function crInOntario(it)'));
check('5b: a result naming a non-Ontario province/state is refused (the border-strip leak is closed)', pick.includes("if (st) return st === 'Ontario';"));
check('5c: the city search asks Canada-only inside the Ontario bound', pick.includes("countrycodes=ca&viewbox=' + [CR_ON_BOUNDS.w, CR_ON_BOUNDS.n, CR_ON_BOUNDS.e, CR_ON_BOUNDS.s].join(',') + '&bounded=1&q="));
check('5d: the city search filters its results', pick.includes('.filter(crIsPlace).filter(crInOntario)'));
check('5e: the street search bounds its answers to the picked city (Beta 1.234 re-derived: there are no service results to filter - the crossings computation itself drops crossings outside the city box)', pick.includes('xs.filter(x => !cityBox || crInBox(cityBox, x.pt[0], x.pt[1]))') && !pick.includes('results = results.filter(crInOntario);'));
check('5f: the no-city street path makes no request at all (Beta 1.234 re-derived: the Ontario bound holds by construction - the street search URL builder is gone; the CITY search keeps the live bounded request, proof-1232 check 1p)', !pick.includes("else url += '&countrycodes=ca&viewbox='") && !pick.includes('&bounded=0'));

// ---------- 6: Cancel/Delete wear red ----------
check('6a: the readout pill wears the destructive red while it reads Cancel (Beta 1.271: via the ONE shared danger rule, its own #c22f24 rule retired)', head.includes('#crHintBtn.danger, .routeDrop .dropDel, #pvStartOverBtn { background: #e63a2e; color: #fff; }') && !head.includes('#crHintBtn.danger { background: #c22f24;') && pick.includes("btn.classList.toggle('danger', btnLabel === 'Cancel')"));
check('6b: the sector bar\'s destructive slot is red (Beta 1.269: the button is Deselect now, wearing the red Cancel wore)', rule('#crSbDeselect {').includes('color: #e63a2e;'));
check('6c: the selection card Clear is red', rule('#selPop #selClearBtn {').includes('color: #e63a2e;'));
check('6d: Delete maps wears the shared danger solid (Beta 1.271 Set A - the in-menu tint retired)', head.includes('#confirmPill #cfDanger, #stDel, #stDel:active, #finYes') && !head.includes('#stDel { background: rgba(230,57,46,.18);'));
check('6e: the confirm No button is red while it reads Cancel', rule('#crModalNo.cancelRed {').includes('color: #e63a2e;') && pick.includes("classList.toggle('cancelRed', crConfirmOneBtn || (!!labels && labels.no === 'Cancel'))"));


console.log(`proof-1229: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
