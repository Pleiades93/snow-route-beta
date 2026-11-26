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
// Phase 5 re-pin: app4 reads resolve @@GLYPH tokens from assets/glyphs; payload claims and sha pins unchanged.
const resolveGlyphs = (s) => s.replace(/@@GLYPH:([a-z0-9-]+)@@/g, (m, stem) => readFileSync(new URL('assets/glyphs/' + stem + '.webp', root)).toString('base64'));
const app1 = parts('app1.js'), app2 = parts('app2.js'), app3 = parts('app3.js'), app4 = resolveGlyphs(parts('app4.js'));
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

// ---------- Piece 2: the pill dash joins (superseded Beta 1.296: the pill family is
// retired - the messages are cut or reworded onto the banner as headline + line) ----------
check('2a: the road message is cut', !pick.includes('No road there'));
check('2b: the GPS weak message is the banner pair now', app3.includes("showBanner('GPS signal weak', 'Still trying") && !allParts.includes('GPS signal weak - still trying'));
check('2c: the not-saved toast is the banner headline now', allParts.includes("showBanner('Not saved')") && !allParts.includes('Not saved - storage problem'));
check('2d: the restore result endings are cut', !app4.includes('Backup added') && !app4.includes('nothing was changed'));
check('2e: the restore-stopped family is cut', !app4.includes('Restore stopped'));
check('2f: the update pill is cut', !app4.includes('New version found'));
check('2g: the restored pill is cut', !app4.includes('Backup added data to'));
check('2h: the storage family is reworded onto the banner', app3.includes("showBanner('Note not saved')") && save.includes("showBanner('Route not saved'") && !allParts.includes('Storage problem - the'));
check('2i: the clean-started warnings are cut', !app3.includes('Clean started - warning'));
check('2j: the cancel pills are cut', !app3.includes('Start cancelled'));
check('2k: the create-hint failure texts are cut', !cache.includes("' - tap Retry'") && !pick.includes('Loading stopped') && !pick.includes('streets there may be missing'));
check('2l: the pack note text is cut', !allParts.includes('street library didn'));
check('2m: the location message is the banner pair now', app3.includes("showBanner('Location is off', 'Allow location for this site in your browser settings')"));
// The fence: the placeholder dashes were NOT normalized by this round (Andrew's
// clarification: they stay). app3 keeps its en-dash placeholders exactly as 1.224 had them.
check('2n: the placeholder en dashes stand untouched (the cancelled piece stays cancelled)', app3.includes("return '–'") && (app3.match(/'–'/g) || []).length >= 8 && app2.includes("'–'"));

console.log(`proof-1225: ${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
