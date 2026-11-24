// proof-1225.mjs - Beta 1.225 (fix_ids: routes-icon-journey-1225, pill-dash-join-1225).
// Piece 1: the Routes tab icon is Journey (Icons8 glyph-neue sGNEMWKG3WcQ) with the
// Glyph set's own treatment; the turn sign's payloads are gone from the shipped page
// (byte-exact hashes + the set total are pinned in proof-icon-glyph-1221).
// Piece 2 (Andrew's ruling, 2026-11-17, replacing the cancelled placeholder piece):
// in the pop-up pill family (#toast, #createHint and the notes that ride it), a message
// that joined two parts with a period now joins them with ' - ', the second part
// lower-cased where it is a sentence word. The empty-value placeholder dashes are
// NOT touched by this round and stay exactly as they were.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const parts = (p) => read('parts/' + p);
const app1 = parts('app1.js'), app2 = parts('app2.js'), app3 = parts('app3.js'), app4 = parts('app4.js');
const pick = parts('create-pick.js'), cache = parts('create-cache.js'), citydata = parts('create-citydata.js');
const save = parts('create-save.js');
const allParts = [app1, app2, app3, app4, pick, cache, citydata, save].join('\n');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- Piece 1: the Journey icon ----------
const rm = app4.match(/routes: \{ d: '(data:image\/webp;base64,[A-Za-z0-9+/=]+)', n: '(data:image\/webp;base64,[A-Za-z0-9+/=]+)'/);
check('1a: GLYPH_ICONS.routes carries a day+night payload pair', !!rm);
const webpSha = (uri) => createHash('sha256').update(Buffer.from(uri.split(',')[1], 'base64')).digest('hex');
check('1b: the routes payloads decode to the Journey WebPs (and not the turn sign)', !!rm && webpSha(rm[1]) === '12daed8f399b941e5a3a08be518e3a0b23b2796614f311807c78162376e30ab3' && webpSha(rm[2]) === '0dffb6f1159795c31880bcad459d4d94f4ef3618f4293ae5cf41241165df5da1');
const allHashes = [...app4.split('const WHATSNEW')[0].matchAll(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/g)].map(m => createHash('sha256').update(Buffer.from(m[1], 'base64')).digest('hex'));
check('1c: the turn-sign payloads (day 6a672ad0…, night e0946936…) appear nowhere in the shipped artwork', !allHashes.includes('6a672ad0bfdf258fe9a8316abaf6f788050fd0a50906f2b4b725f1214e4a0b57') && !allHashes.includes('e09469369f185b3363ba0e069b69b3dedcbccd6d91377cca4084047cbcd76b78'));

// ---------- Piece 2: the pill dash joins ----------
check('2a: the road message wears the dash join', pick.includes("'No road there - tap on a road line'") && !pick.includes('No road there. Tap on a road line'));
check('2b: the GPS pill wears the dash join', app3.includes("'GPS signal weak - still trying'") && !allParts.includes('GPS signal weak. Still trying'));
check('2c: the not-saved toast wears the dash join', allParts.includes("toast('Not saved - storage problem'"));
check('2d: the restore results end with the dash join', app4.includes("' - nothing was changed'") && !app4.includes('. Nothing was changed'));
check('2e: the restore-stopped family wears the dash join', app4.includes("'Restore stopped - your created-routes") && app4.includes("'Restore stopped - your current data") && !app4.includes('Restore stopped. Your'));
check('2f: the update pill wears the dash join', app4.includes("'New version found - reloading…'") && !app4.includes('New version found. Reloading'));
check('2g: the restored pill wears the dash join', app4.includes("'Backup added data to '") && app4.includes("' - reloading'") && !app4.includes('Backup restored. Reloading'));
check('2h: the storage family wears the dash join', app3.includes("'Storage problem - the note could not be saved'") && save.includes("'Storage problem - the route could not be saved'") && !allParts.includes('Storage problem. The'));
check('2i: the clean-started warnings wear the dash join', app3.includes("'Clean started - warning: the ") && !app3.includes('Clean started. Warning'));
check('2j: the cancel-erased pill wears the dash join whole (base + rebuilt suffix)', app3.includes("'Start cancelled - erased here, but the trail cleanup could not be saved yet; it will keep retrying'") && app3.includes("' - the board was rebuilt from the marks made during the clean ('"));
check('2k: the create-hint failure texts wear the dash join', cache.includes("' - tap Retry'") && pick.includes("'Loading stopped - '") && pick.includes("' - streets there may be missing'"));
check('2l: the pack note that rides the hint wears the dash join', citydata.includes("'The app’s street library didn’t load - loading from the street service instead'") && !citydata.includes('didn’t load. Loading'));
check('2m: the location pill wears the dash join', app3.includes("'Location is off - allow location for this site in your browser settings'"));
// The fence: the placeholder dashes were NOT normalized by this round (Andrew's
// clarification: they stay). app3 keeps its en-dash placeholders exactly as 1.224 had them.
check('2n: the placeholder en dashes stand untouched (the cancelled piece stays cancelled)', app3.includes("return '–'") && (app3.match(/'–'/g) || []).length >= 8 && app2.includes("'–'"));

console.log(`proof-1225: ${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
