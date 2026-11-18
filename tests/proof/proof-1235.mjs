// proof-1235.mjs - Beta 1.235 (fix_id: citystep-1235).
// Andrew's round (2026-11-18): the city step of route creation, from his
// Option 3 pick on the sample page - fewer words, more air - plus his two
// direct orders: the search pill gains real depth, and half-typed city
// names offer their cities ("Vaug" offers Vaughan).
// A (layout, #rmCityPane only): the title reads "What city are you
// cleaning in?"; the "City" label ELEMENT is gone from this pane (the
// .rmLbl rule itself stays - #rmNamePane still labels "Route name" and
// "Area" with it); the search pill is #crCityInput's own rule now (the
// shared .rmInput glass untouched - the name and area inputs keep it):
// solid white fill, dark ink, a grey placeholder, and the soft shadow the
// primary buttons carry; the air is margin, not a new gap (the pane's 12px
// flex gap plus the pill's 8px top margin = the approved 20px between the
// title and the pill).
// B (partial names): the live search is UNCHANGED - same query, same
// Ontario filter, same render - and its rows stand first. Under them, a
// BUNDLED gazetteer of Ontario municipalities (built offline from
// Wikipedia's municipality list, every entry geocoded through the app's
// own query shape and kept only when the answer passed the same place and
// Ontario gates; a name whose best answer was an upper-tier county,
// district or another city never entered the table) fills the names the
// service did not return, deduped by normalized name, under the same
// 6-row cap. A fragment matches a name prefix or any word prefix of a
// name; name matches rank before word matches, each group by population.
// This is not the retired 1.229 name resolution: nothing guesses a place
// from a name at search time - the table can only offer what was verified
// Ontario at build time. A failed fetch still clears the box (the locals
// never stand on a failure - drive153 D5's honesty rule).
// Run from the repo root:  node tests/proof/proof-1235.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const pick = read('parts/create-pick.js');
const app4 = read('parts/app4.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

const cityPane = head.slice(head.indexOf('<div class="rmPane" id="rmCityPane">'), head.indexOf('<div class="rmPane" id="rmNamePane">'));
const namePane = head.slice(head.indexOf('<div class="rmPane" id="rmNamePane">'), head.indexOf('<div id="createBar">'));

// ---------- A: the city step layout ----------
check('A1: the title reads as approved (and the old wording is gone)', cityPane.includes('<div class="rmTitle">What city are you cleaning in?</div>') && !head.includes('What city will you be cleaning in?'));
check('A2: the City label element is gone from the city pane', !cityPane.includes('rmLbl'));
check('A3: the label rule and its other pane survive - the name pane still labels Route name and Area', head.includes('.rmLbl { color: rgba(255,255,255,.85); font-size: 14px; font-weight: 650; margin-bottom: -6px; }') && namePane.includes('<div class="rmLbl">Route name</div>') && namePane.includes('<div class="rmLbl">Area</div>'));
check('A4: the pill is solid white with dark ink and the soft shadow, scoped to the city input alone', head.includes('#crCityInput { background: #fff; border: none; color: #14161c; box-shadow: 0 6px 18px rgba(0,0,0,.18); margin-top: 8px; }'));
check('A5: the placeholder rests grey on the white pill, scoped the same way', head.includes('#crCityInput::placeholder { color: #9aa0ab; }'));
check('A6: the shared glass rule is untouched - the name and area inputs keep it', head.includes('.rmInput { appearance: none; -webkit-appearance: none; width: 100%; box-sizing: border-box; border: 1px solid rgba(255,255,255,.45); background: rgba(255,255,255,.14); color: #fff; font-size: 18px; padding: 14px 16px; border-radius: 14px; outline: none; }') && namePane.includes('class="rmInput" id="crNameInput"') && namePane.includes('class="rmInput" id="crAreaInput"'));
check('A7: the input keeps its shared class and placeholder (only its look is its own)', cityPane.includes('<input class="rmInput" id="crCityInput" type="text" maxlength="60" autocomplete="off" placeholder="Start typing a city"'));

// ---------- B: the bundled gazetteer ----------
const gazM = pick.match(/const CR_CITY_GAZETTEER = \[([\s\S]*?)\n\];/);
check('B1: the gazetteer table stands in create-pick', !!gazM);
const gazRows = gazM ? (gazM[1].match(/\n  \[/g) || []).length : 0;
check('B2: the table is the full Ontario set (over 300 municipalities)', gazRows > 300);
check('B3: the app\'s working cities are in the table with Ontario coordinates', ['Vaughan', 'Toronto', 'Mississauga', 'Aurora', 'Innisfil', 'King', 'Georgina'].every(n => pick.includes('["' + n + '", 4')) );
check('B4: no foreign rows and no district or region rows (the pure upper tiers stayed out); the only County rows are the five whose county IS the municipality or the only boundary the service offers', !pick.includes('["Aurora, Illinois"') && !pick.includes(' District",') && !pick.includes(' Region",') && JSON.stringify([...gazM[1].matchAll(/\["([^"]+ County)",/g)].map(m => m[1]).sort()) === JSON.stringify(['Brant County', 'Essex County', 'Haldimand County', 'Norfolk County', 'Prince Edward County']));
check('B5: the matcher exists - name prefix or any word prefix, name matches first, population orders inside a group', pick.includes('function crCityLocalMatches(q)') && pick.includes('if (nk.startsWith(k)) head.push(i);') && pick.includes('else if (nk.split(\' \').some(w => w.startsWith(k))) word.push(i);') && pick.includes('head.sort(byPop); word.sort(byPop);') && pick.includes('return head.concat(word).slice(0, 6)'));
check('B6: keys fold accents, apostrophes and dashes the same way on both sides, precomputed for the whole table', pick.includes('function crCityGazKey(s)') && pick.includes("normalize('NFD')") && pick.includes('const CR_CITY_GAZ_KEYS = CR_CITY_GAZETTEER.map(e => crCityGazKey(e[0]));'));
check('B7: the live search still runs exactly as before - the same bounded Ontario request, the same place and Ontario filters', pick.includes("fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&featuretype=city&limit=6&countrycodes=ca&viewbox=' + [CR_ON_BOUNDS.w, CR_ON_BOUNDS.n, CR_ON_BOUNDS.e, CR_ON_BOUNDS.s].join(',') + '&bounded=1&q=' + encodeURIComponent(q)") && pick.includes('const places = (Array.isArray(list) ? list : []).filter(crIsPlace).filter(crInOntario);'));
check('B8: the merge fills under the service rows, deduped by normalized name, under the same 6-row cap', pick.includes('const seen = new Set(places.map(it => crCityGazKey(crCityNameOf(it))));') && pick.includes('for (const loc of crCityLocalMatches(q)) { if (places.length >= 6) break; const lk = crCityGazKey(loc.address.city); if (!seen.has(lk)) { seen.add(lk); places.push(loc); } }'));
check('B9: a local row carries the service\'s own shape, so the pick flow is unchanged', pick.includes("display_name: e[0] + ', Ontario, Canada', category: 'boundary', type: 'administrative'") && pick.includes("address: { city: e[0], state: 'Ontario', country: 'Canada', country_code: 'ca' }"));
check('B10: the merged list renders through the one box swap (locals land with the answer, one render)', pick.includes('places.forEach((it, i) => {') && pick.includes("row.addEventListener('click', () => crPickCity(it));"));
check('B11: a failed fetch still clears the box - no local fallback stands on a failure', pick.includes("} catch (e) { if (crCitySearchSeqCurrent(seq) && !(e && e.name === 'AbortError')) { crCityBoxSwap(b => { b.innerHTML = ''; }); } }"));

// ---------- V: the version seats ----------
check('V: the #ver label reads Beta 1.235', head.includes('<div class="ver" id="ver">Beta 1.235</div>'));
check('V: WHATSNEW is the Beta 1.235 entry', app4.includes("v: 'Beta 1.235', items:"));
check('V: the CHANGELOG top entry is Beta 1.235', changelog.split('\n').find(l => l.startsWith('## Beta')) === '## Beta 1.235 — 2026-11-18');

console.log(`proof-1235: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
