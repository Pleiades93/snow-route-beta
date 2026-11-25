import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Glyph-only icon proof (fix_id: icon-glyph-1221, Beta 1.221, 2026-11-16).
// Andrew's icon-pack final: Glyph Neue wins outright. Material Filled and
// Windows 10 are removed whole, the Settings icon-pack picker section is
// removed with them, and Glyph is simply the app's icon set. This proof
// replaces proof-icon-pack-picker-1218, proof-icon-packs-1220 and
// proof-icon-extras-1219, whose subjects (the picker, the three-pack
// roster, per-pack extras) no longer exist; their Glyph assertions are
// re-derived here at the same strength, and the retired proofs' absence
// assertions become this proof's section D.
// It pins:
//  - the complete Glyph set (the standing icon-set standard: ten mains,
//    four Locate faces, the street-row pin + note, the seven Pace stat
//    glyphs, the two X jobs - day and night where the set carries both),
//    every image a LOSSLESS WebP at 200x200, byte-for-byte by sha256.
//    The WebP set is the 1.220 PNG artwork re-encoded losslessly: pixel
//    identity with the PNGs was verified at encode time (decode-compare
//    of all 43 unique payloads, round round-1221 patch 1), and the pins
//    below freeze the encoded bytes so any later drift fails here.
//    Beta 1.225: the routes pair is Andrew's Journey pick (Icons8
//    glyph-neue sGNEMWKG3WcQ), filled and encoded by the same treatment
//    in round-1225 patch 1; its two pins and the set total roll here.
//    Beta 1.233: home is Andrew's Home Page pick (Icons8 NzaHJt0XKIWl)
//    and clear his Dustpan pick (Icons8 5TaZy8jiHIYy), filled and encoded
//    by the same treatment; their four pins and the set total roll here.
//  - the registry dispatch: MASK_PACKS stands with ONE row (glyph) and
//    renderIcons reads it directly - no picker, no stored choice, no
//    fallback packs;
//  - the backup surface: the iconpack field is gone from the export, the
//    restores and the settings store (restores read named fields only,
//    so a backup carrying the retired field still restores cleanly -
//    the behaviour half is covered by the restore selftests);
//  - the retired packs' total absence from the app surface.
// On unmodified main (Beta 1.220) sections A-D fail: the artwork is PNG,
// three packs stand in the registry, and the picker markup is present.
//
// Run from the repo root:  node tests/proof/proof-icon-glyph-1221.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  [' + detail + ']' : '')); }
}
// Phase 5 re-pin: app4 reads resolve @@GLYPH tokens from assets/glyphs; payload claims and sha pins unchanged.
const resolveGlyphs = (s) => s.replace(/@@GLYPH:([a-z0-9-]+)@@/g, (m, stem) => readFileSync('assets/glyphs/' + stem + '.webp').toString('base64'));
const app4 = resolveGlyphs(readFileSync('parts/app4.js', 'utf8'));
const app1 = readFileSync('parts/app1.js', 'utf8');
const head = readFileSync('parts/head.html', 'utf8');
const sha = b => createHash('sha256').update(b).digest('hex');

function block(name) {
  const m = app4.match(new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n\\};'));
  return m ? m[1] : '';
}
function webpInfo(uri) {
  const b = Buffer.from(uri.split(',')[1], 'base64');
  const magic = b.length > 20 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  let dims = null;
  const fourcc = b.toString('ascii', 12, 16);
  if (fourcc === 'VP8L') { const v = b.readUInt32LE(21); dims = [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
  else if (fourcc === 'VP8X') { dims = [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1]; }
  else if (fourcc === 'VP8 ') { dims = [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]; }
  return { b, magic, dims, hash: sha(b) };
}

// ================= A - the Glyph artwork, byte-pinned as WebP =================
console.log('A - GLYPH maps carry the lossless WebP set (sha256, 200x200, RIFF/WEBP)');
const PINS = {
  GLYPH_ICONS: [
    'b9b6a2f3f6d751198194f5765d7e869bcea86a088caa5981032a8286198dc7f7', 'ec0b308c1265280699ee2238fd3bfc7e8693119e46d8075b33b7d527b8a517c7',
    '12daed8f399b941e5a3a08be518e3a0b23b2796614f311807c78162376e30ab3', '0dffb6f1159795c31880bcad459d4d94f4ef3618f4293ae5cf41241165df5da1',
    '996f856cd074886491bcb02fa8440117fbfd0afe626629517069492790581ed0', 'ff969cd1c1f46d502959734d07d934dff69e9d6cae85783d6a3c40277fbc8ed4',
    '2d0af6eb1db2870352393ac8ca1f52326c9b3dec0d602c30640b219bb170137e', '520df60e1444041b763c0d5f9c4de11f0faac1ac55896e1bc6c006d51d24f224',
    '903ed9f57d1aa48fe28fc1f0d75a3723afe6d966dfd2f3ac56e7ff0a4172691e', '87005ea2cc64d0974bad24ae5ed97f3b236f504a9dcb81831a0c92e4386bdca1',
    'c5afd163544bcf2e85ddfa49cbe20c3e0dee5ded3c4813bd82aaaaff67050b85', '35acb058cc0b09c832dbf7f6cf60dea44a4404e907ceddeee5d0cf0f45d02540',
    'f6f4dd5150962b7714ea9dcb7aef605985f1eccca861b02acc9c07029dabbf69', 'de6c898896b82aab516dfee97588545db183841ebd949391d8e6c7237a93006c',
    '2e86e73842d9ebd51f196cac1595443209409e1951d6a06c2040295afb97f6ca', '7c22fc18752b78eaf9f8b392c3bc4bbf9b5f9cd8e59fe2091499a02f28490171',
    'e9f92542496f1806dbb068e9f7951805eed9e66031024afedd14928a4a14f121', '6f0479443a0dcd14dbb4ac6a2bb902d2454649b09d707243c633793ecc2e0d7a',
    '5d30a70c40da19afd24658ff8b03a29fb144e9ca475b9ec2362434c2fba29582', 'c36b88e144d65219173a5046440d05a1d7f29884c33371cda7c54a1de9f9b457'],
  GLYPH_GPS_STATES: [
    '6a015464fce75ecaa23ac93d70e2c216231428aae75b8aa69bc61fba3571e3cf', '9210ddf939cc031fee15629a70097ea8897655314af49c5092d3c5fa9bc9cc8d',
    'f66601101ae0987aed3e3eb7813a3e1eee648b7c5ebde2a39ebc9640d5908e80', 'f66601101ae0987aed3e3eb7813a3e1eee648b7c5ebde2a39ebc9640d5908e80',
    '3205258078d4d5827cafd7269982755cf29e4b3611b27eb1e59e17534ec95f1f', 'ceceb6b3fe0969f8fea231619e48997c42402f18a57457efe77b15b4ada1afea',
    'd63364c66998b47c671a02d304985c398e3969a8fc23aec029e208c4a1ab7e40', '0b1b5b448f26337ba1e9e7c2b3aa482d0f03859c1c64819398445def75f0a361'],
  GLYPH_EXTRAS: [
    '3205258078d4d5827cafd7269982755cf29e4b3611b27eb1e59e17534ec95f1f', 'ceceb6b3fe0969f8fea231619e48997c42402f18a57457efe77b15b4ada1afea',
    'd63364c66998b47c671a02d304985c398e3969a8fc23aec029e208c4a1ab7e40', '0b1b5b448f26337ba1e9e7c2b3aa482d0f03859c1c64819398445def75f0a361'],
  GLYPH_PACE_ICONS: [
    'e52670c0dbb5561bd9d00314bbcf27e321b29c0a36d2093c49441f990510bc4b', 'be76f32426098a5ced22a4206aead2a4ed7eded816f62ed99c8aa8c728efe01f',
    'f96134a648ed8318923bdb7f992f13e584619de7e424e3dad466ba35c254112e', 'fbbe89523b8c1975d13939723c96e8c16461272f2721f3a89bf84cc3dfed4ed4',
    '9eaa3343f20a85d51eae18c5783465196d90f86407d472e614eacf83d1a96f1c', '183d6a5017a784974879ee6892b625f06a08652675cf9d3d4abad17b968b8a6b',
    '1cd1c697593409375aaded2ce12c7204e6026101d6ff80fab9aaa28a3d313ebe', '33d91d74a72c1187b21f935958af2cc4084bf4668788e3220819a8bd1248bce5',
    '56f70a9e6133422a1a3fe936d3c700ec6c4be5c9a536a98969ae28d82b1c5789', '95c9293ae9f42c10cfb3f20a86c188ceaf8359e7d5bc375de2f59b5e2b5477f0',
    'e83e95934c7bd1ae36939c62247e5f43a34ec8246cf2e5c910b3a713f94307e0', '72946bc742e8cb22a13c7abccd8bf948e8627eee8cbb50c91ff8494538268505',
    '6374f4c43acb29c1ac3fb21150d01ca2846b3e2b93657fee07cbb7f3a283a994', 'd3b4bb8a043491dba2284a8511d4bf89bde663e1af68069d593a5ee736328fed'],
  GLYPH_X: [
    '18c7f63b616e99f7988f401083246c71e312182a4f9191bc6409005a51c35269', 'a3c2e27fa54072de020a0e3a0b811afdd6c2c893d738719109f8ea67fe9cc72c']
};
let occ = 0, uniqBytes = 0; const seen = new Set();
for (const [name, pins] of Object.entries(PINS)) {
  const uris = [...block(name).matchAll(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/g)].map(m => 'data:image/webp;base64,' + m[1]);
  check(`A: ${name} stands with ${pins.length} WebP images`, uris.length === pins.length, 'found ' + uris.length);
  uris.forEach((u, i) => {
    const info = webpInfo(u);
    occ++;
    if (!seen.has(info.hash)) { seen.add(info.hash); uniqBytes += info.b.length; }
    check(`A: ${name}[${i}] byte-for-byte`, info.hash === pins[i], info.hash);
    check(`A: ${name}[${i}] is a 200x200 WebP`, info.magic && info.dims && info.dims[0] === 200 && info.dims[1] === 200, JSON.stringify(info.dims));
  });
}
check('A: the set totals 48 image occurrences, 43 unique payloads', occ === 48 && seen.size === 43, occ + '/' + seen.size);
check('A: the unique WebP payloads total 79,166 decoded bytes (the 1.221 set totalled 79,064; Beta 1.225 swapped the routes artwork to Journey, +1,358; Beta 1.233 swapped home to Home Page and clear to Dustpan, -1,256)', uniqBytes === 79166, String(uniqBytes));
check('A: no PNG artwork remains in the Glyph maps', !/data:image\/png/.test(app4.split('const WHATSNEW')[0].slice(app4.indexOf('const GLYPH_ICONS'), app4.indexOf('const MASK_PACKS'))));

// ================= B - completeness of the one set =================
console.log('B - the set is complete under the icon-set standard');
check('B: the mains map carries exactly ten keys', (block('GLYPH_ICONS').match(/^  \w+: \{ d:/gm) || []).length === 10);
check('B: the pace map carries exactly seven keys', (block('GLYPH_PACE_ICONS').match(/^  \w+: \{ d:/gm) || []).length === 7);
check('B: the recording Locate face is one green in both themes (rd == rn)', PINS.GLYPH_GPS_STATES[2] === PINS.GLYPH_GPS_STATES[3]);
check('B: day and night mains DIFFER (near-black by day, white by night)', PINS.GLYPH_ICONS.every((h, i) => i % 2 === 1 || h !== PINS.GLYPH_ICONS[i + 1]));
check('B: the extras pin/note are the same artwork as the states pin/note', PINS.GLYPH_EXTRAS.join() === PINS.GLYPH_GPS_STATES.slice(4).join());
check('B: the dead four are in NO Glyph map', !/const GLYPH_(EXTRAS|PACE_ICONS) = \{[^}]*\b(menu|upd|flip|exp):/s.test(app4));

// ================= C - the dispatch: one row, read directly =================
console.log('C - MASK_PACKS stands with the glyph row only; renderIcons reads it directly');
check('C: the MASK_PACKS table stands in the registry', app4.includes('const MASK_PACKS = {'));
check('C: the glyph row reads the shipped glyph maps', app4.includes("glyph: { icons: GLYPH_ICONS, states: GLYPH_GPS_STATES, extras: GLYPH_EXTRAS, pace: GLYPH_PACE_ICONS, x: GLYPH_X }"));
check('C: renderIcons reads the glyph row directly', app4.includes('const MP = MASK_PACKS.glyph;'));
check('C: the X stamp loops read the table (both jobs)', app4.includes('${MP.x.corner}') && app4.includes('${MP.x.bottom}'));

// ================= D - the retired packs and the picker leave no trace =================
console.log('D - glyph-only: no pack maps, no picker, no stored choice, no backup field');
check('D: no retired-pack artwork map remains', !/const (MAT|WIN10|PULSAR|PACKD|PUFFY)_/.test(app4));
check('D: no material/win10 row stands in the table', !app4.includes('material: { icons:') && !app4.includes('win10: { icons:'));
check('D: no pack-choice machinery remains', !app4.includes('iconPackId') && !app4.includes('renderPackPicker') && !app4.includes('PK_LIST'));
check('D: the picker markup and styles are gone from the page', !head.includes('pkCard') && !head.includes('pkRow') && !head.includes('pkNote') && !head.includes('ICON PACK PICKER'));
check('D: the backup icon-pack field is gone from the app surface', !/iconpack/i.test(app4) && !/iconpack/i.test(app1) && !/iconpack/i.test(head));
check('D: the Settings main pane carries no icon-pack section', !head.includes('Icon pack'));

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
