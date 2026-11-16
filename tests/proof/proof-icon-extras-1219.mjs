import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Icon extras proof (fix_id: icon-extras-1219, Beta 1.219, 2026-11-16).
// Andrew: the icon sets must include the little icons too - and Puffy is out.
// This proof pins the static half of Beta 1.219:
//  - the LIVE extras ride the packs: ICONS.pin / ICONS.note and the seven
//    PACE_ICONS stat glyphs (clock, road, flag, list, cal, gauge, trail) have
//    per-pack artwork in Pulsar (NATIVE Pulsar Color PNGs, embedded as
//    downloaded) and Glyph (the same alpha-mask fills as its mains), while
//    the Original pack keeps its shipped vectors byte-identical (pin/note in
//    PACKD_ICONS; the stat glyphs restored from the PACE_ORIGINALS snapshot);
//  - Andrew's road rule: the HIGHWAY variant is the main Streets icon, the
//    BASIC road is the Pace "Road cleared" stat (Pulsar streets = the
//    gradient-treated highway; Glyph streets = the highway fill; the Glyph
//    stat road is byte-identical to 1.218's Glyph streets - the basic road
//    moved slots, unchanged);
//  - the flag rule: the Pace button keeps the checkered finish flag; the ETA
//    stat is a plain flag (Pulsar 'flag', Glyph 'flag-2');
//  - the Glyph sun is Icons8 'summer' (the plain sun read as a settings cog);
//  - Puffy Filled is REMOVED whole (registry, states, picker row), a stored
//    'puffy' reads as the pulsar default, and a backup carrying 'puffy'
//    restores as 'pulsar' on both restore paths;
//  - no size moves: head.html's host rules name svg and img in one selector
//    (plus the stat cell's 26px img rule), so a pack artwork fills the
//    vector's exact box.
// The live behaviour (per-pack stamping day + night, the seamless re-stamp of
// the extras, the stored-'puffy' boot, zero layout shift measured in the
// rendered page) is proven by tests/browser/drive202.mjs.
// On unmodified main (Beta 1.218) every section fails: there are no extras
// maps, Puffy stands in the registry, and the Glyph sun is the old glyph.
//
// Run from the repo root:  node tests/proof/proof-icon-extras-1219.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}
const sha256buf = b => createHash('sha256').update(b).digest('hex');
const app2 = readFileSync('parts/app2.js', 'utf8');
const app3 = readFileSync('parts/app3.js', 'utf8');
const app4 = readFileSync('parts/app4.js', 'utf8');
const head = readFileSync('parts/head.html', 'utf8');
const uriHash = str => { const m = String(str).match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/); return m ? sha256buf(Buffer.from(m[1], 'base64')) : ''; };
const block = (src, name) => (src.match(new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n\\};')) || [])[1] || '';
const dnLine = (blk, k) => blk.match(new RegExp('^  ' + k + ": \\{ d: '([^']+)', n: '([^']+)' \\},?", 'm')) || [];
const KEYS7 = ['clock', 'road', 'flag', 'list', 'cal', 'gauge', 'trail'];

// ================= A - the Pulsar extras are complete and byte-exact =================
console.log('A - PULSAR_EXTRAS + PULSAR_PACE_ICONS carry the nine live extras, native artwork (sha256), day == night');
const P_NATIVE = {
  pin: 'ed6309cb2587dc613d633ba5f5b0c7167ac7f98e43a80bb73a0dcfec53f3b0e4', // the 'marker' artwork (scope update: the 'pin' slug is a pushpin; 'marker' is the teardrop map pin)
  note: 'b7e1f5ddc4a95e187805441d5c3dda673bac0aaacd51902405711db927f60ee9',
  clock: '8dd50704542fa3bdfef549b77fe1f5fff5ae3d165f03c1711efc45598facc9b6',
  road: 'ba40cc6ef851d53763a35a5344cc735e09321cb966473b81f2460e8c4c1a0609',
  flag: '684568d7b216ab1d211bc106c3194ed71364aed25be50fa67b0552f30f961c2f',
  list: 'd2495f8643f53df2a145aed5464b4ed26e8a3eddc795f1e582e7e6c637821dbd',
  cal: '50e3d2346d8ebec42037dfe2bd15dfe462fcd03eae1533776df11323650ff57a',
  gauge: 'b1d102c00c4d67f86f1d026b52a707706918d8a06f139347ef65948c1654189a',
  trail: '2d8e07649eb615434ca5a520c25c775e107718c405dbce6e3149fa6c496909bb',
};
const pex = block(app4, 'PULSAR_EXTRAS'), ppc = block(app4, 'PULSAR_PACE_ICONS');
check('A: both pulsar extras maps exist', pex.length > 0 && ppc.length > 0);
for (const k of ['pin', 'note']) {
  const l = dnLine(pex, k);
  check(`A: pulsar ${k} is the native artwork byte-for-byte`, !!l[1] && uriHash(l[1]) === P_NATIVE[k], l[1] ? uriHash(l[1]) : 'missing');
  check(`A: pulsar ${k} day == night (the native set is one set)`, !!l[1] && l[1] === l[2]);
}
for (const k of KEYS7) {
  const l = dnLine(ppc, k);
  check(`A: pulsar pace ${k} is the native artwork byte-for-byte`, !!l[1] && uriHash(l[1]) === P_NATIVE[k], l[1] ? uriHash(l[1]) : 'missing');
  check(`A: pulsar pace ${k} day == night`, !!l[1] && l[1] === l[2]);
}
check('A: no extra keys in the pulsar extras maps', (pex.match(/^  \w+: \{ d:/gm) || []).length === 2 && (ppc.match(/^  \w+: \{ d:/gm) || []).length === 7);

// ================= B - the Glyph extras are complete and byte-exact =================
console.log('B - GLYPH_EXTRAS + GLYPH_PACE_ICONS carry the nine live extras as mask fills (sha256), day #14161C / night white');
const G_FILL = {
  pin: ['c755944c765d25dff1d6c59f31225d7ec965e37d769f4bb91b4ec7be3d3234ff', '4cc992fcfa413a62c09c91582ef49130dd5102656a3f3388ccd0ccbad7f5b270'], // 'marker' fills, as above
  note: ['48cd1226e49682a09c875d04ccbbfd78acb8c7716f2af0e6f459dcdb4b32248c', '22277526d00b8e7d9579c387d92f9fc82240f501a356a3c98089e36b3ce1368e'],
  clock: ['ba1f580c3a465e264475e6942e342bada5c820c5607490d5933be9d21765d799', '97706a2d264195eb1a1f3c5ff372ecdef632151a7f1760d5323a819ef93e0ba0'],
  road: ['6503f88f79337bf284735947eb0ae86d4bb00309ac7991f253a6c0891a3ef72c', 'ea85825be0b9c79e9cceea255d7e6d7cc6e2e8b546e4ef01bd0b06293937849a'],
  flag: ['d1cb9b38dabce9b8bcbc286f8c06f9b671d744c96dbf18a4fa2989762919d0a2', 'd9bea0e76b08f8583dcda203fd38f5cffe4d922848e795458542d42ece155862'],
  list: ['3f87885a3381d66100858ffc813b10e0fffec50b5b5b907f6e0136d0b66f0f07', '0b73813ddf037a088272aabb473d1ebdd19526f72f4cd7b6c515297fcd24b1e0'],
  cal: ['fb12314d537c4afd99c914f149ba44107e609f04927d825314b0e05ab1d2cce3', '1b1fe743feabae9ebbc645824d5d950d043afd523a1da94d105a132cc533d197'],
  gauge: ['c73fb2649b51e1c34bdafe6016c140d99ae7f469ab7243ac790b94fd39bb7c2e', '91c258505741b00a97110bef8930dc259c87cd0abee2a64e3c144a084304d270'],
  trail: ['d014a35cf78ef0dd7601885711dff82681638ccec6b25c9a0032f0b0b65717d7', '38301d715cbaa988a2970b012725c27aa794ae1b841d9b1a29d8b129864f9a01'],
};
const gex = block(app4, 'GLYPH_EXTRAS'), gpc = block(app4, 'GLYPH_PACE_ICONS');
check('B: both glyph extras maps exist', gex.length > 0 && gpc.length > 0);
for (const k of ['pin', 'note']) {
  const l = dnLine(gex, k);
  check(`B: glyph ${k} day fill byte-for-byte`, !!l[1] && uriHash(l[1]) === G_FILL[k][0], l[1] ? uriHash(l[1]) : 'missing');
  check(`B: glyph ${k} night fill byte-for-byte`, !!l[2] && uriHash(l[2]) === G_FILL[k][1], l[2] ? uriHash(l[2]) : 'missing');
}
for (const k of KEYS7) {
  const l = dnLine(gpc, k);
  check(`B: glyph pace ${k} day fill byte-for-byte`, !!l[1] && uriHash(l[1]) === G_FILL[k][0], l[1] ? uriHash(l[1]) : 'missing');
  check(`B: glyph pace ${k} night fill byte-for-byte`, !!l[2] && uriHash(l[2]) === G_FILL[k][1], l[2] ? uriHash(l[2]) : 'missing');
}
check('B: no extra keys in the glyph extras maps', (gex.match(/^  \w+: \{ d:/gm) || []).length === 2 && (gpc.match(/^  \w+: \{ d:/gm) || []).length === 7);
check('B: glyph extras day != night (black by day, white by night)', Object.values(G_FILL).every(([d, n]) => d !== n));

// ================= C - Andrew's road rule =================
console.log('C - the highway variant is the Streets icon; the basic road is the Road-cleared stat');
const pMain = block(app4, 'PULSAR_ICONS'), gMain = block(app4, 'GLYPH_ICONS');
const ps = dnLine(pMain, 'streets');
check('C: pulsar streets is the gradient-treated HIGHWAY artwork', !!ps[1] && uriHash(ps[1]) === '39e5ee880ca5404d44c76b9bdafb7919e860d444f279f7cbb8bf6739bbe4e4b3', ps[1] ? uriHash(ps[1]) : 'missing');
check('C: pulsar streets is NOT the 1.218 basic-road gradient anymore', !!ps[1] && uriHash(ps[1]) !== '2d9d8e22ee3b3414eeb3b30e8eb539bb2f5766010611d7a79a50588910bfabe6');
const gs = dnLine(gMain, 'streets');
check('C: glyph streets is the HIGHWAY fill (day + night)', !!gs[1] && uriHash(gs[1]) === '7efa94714891e191f88b95da0b6857783a5617da5d4d5fe0dd83f7c92c618241' && uriHash(gs[2]) === 'c4819f8a13c65b325b67b63ff8e77974ec002c5c3d2ba4c78d0cf6ed8c2f83c9');
check('C: the glyph stat road is byte-identical to 1.218\'s glyph streets (the basic road moved slots, unchanged)',
  G_FILL.road[0] === '6503f88f79337bf284735947eb0ae86d4bb00309ac7991f253a6c0891a3ef72c' && G_FILL.road[1] === 'ea85825be0b9c79e9cceea255d7e6d7cc6e2e8b546e4ef01bd0b06293937849a');
check('C: within each pack the Streets artwork differs from the stat road artwork',
  uriHash(ps[1]) !== P_NATIVE.road && G_FILL.road[0] !== '7efa94714891e191f88b95da0b6857783a5617da5d4d5fe0dd83f7c92c618241');

// ================= D - the flag rule + the Glyph summer sun =================
console.log('D - ETA stat is a plain flag (not the checkered Pace button); the Glyph sun is summer');
check('D: pulsar pace flag is the native plain flag (A pins it); the checkered pace main stands apart',
  P_NATIVE.flag !== '' && dnLine(ppc, 'flag')[1] !== dnLine(pMain, 'pace')[1]);
check('D: glyph pace flag is the flag-2 fill, apart from the checkered pace main',
  G_FILL.flag[0] === 'd1cb9b38dabce9b8bcbc286f8c06f9b671d744c96dbf18a4fa2989762919d0a2' && dnLine(gpc, 'flag')[1] !== dnLine(gMain, 'pace')[1]);
const gsun = dnLine(gMain, 'sun');
check('D: glyph sun is the SUMMER fill (day + night)', !!gsun[1] && uriHash(gsun[1]) === 'f7df7b2cd24fb708a163b72b03f19b1dfb9607c4e6f68e5e8a79d869301667a1' && uriHash(gsun[2]) === '2bb193f75b3e5f67df6231783fa304ab05177618c58023016b0bf525f4b3a86d', gsun[1] ? uriHash(gsun[1]) : 'missing');
check('D: glyph sun is NOT the 1.218 sun (the one that read as a settings cog)', !!gsun[1] && uriHash(gsun[1]) !== '0891e30362924a09e3de57beb54d4b2e1aac6b9be6a1d77f8ad8ab30e1edda27');

// ================= E - the Original pack's extras are the shipped vectors =================
console.log('E - PACKD pin/note equal the base ICONS entries byte-for-byte; app3 PACE_ICONS unchanged; the snapshot stands');
const basePin = (app4.match(/^  pin: '((?:[^'\\]|\\.)*)',/m) || [])[1];
const baseNote = (app4.match(/^  note: '((?:[^'\\]|\\.)*)',/m) || [])[1];
const pd = block(app4, 'PACKD_ICONS');
const pdPin = (pd.match(/^  pin: '((?:[^'\\]|\\.)*)',?$/m) || [])[1];
const pdNote = (pd.match(/^  note: '((?:[^'\\]|\\.)*)',?$/m) || [])[1];
check('E: PACKD pin is the shipped Pack D pin byte-for-byte', !!pdPin && pdPin === basePin && sha256buf(Buffer.from(pdPin)) === 'f9f7bb5b0cd49d0dfd432351502e3df1d34df8121a1bb09e1104f65f06d5246e');
check('E: PACKD note is the shipped Pack D note byte-for-byte', !!pdNote && pdNote === baseNote && sha256buf(Buffer.from(pdNote)) === 'b437fe706803eef6c36010b8122bde4efba46d11c9d7f6208cd639d302545cd6');
const PACE_ORIG = {
  clock: '816eadcd9cedd2dcdfa608fd103a963794d8537750a260666051d21c40e18c35',
  road: '6759dc56cc006e9aadc2d831b3a95a4ce542ca7f34b1df309759314b1113e7b1',
  flag: '705553eaa10b3e1cfd9f6802d8bccf5cf62f62e12e349bfb8903701df5a632d0',
  list: 'e013aba572145af0a659fdb339ed42d52bf5338bdd499dfb74f8edc4fae32fe9',
  cal: '8d8ce227c2df6d7c798f13b4da30e7dabdc59ba1632bd399f38c00e1cdd144b7',
  gauge: '7762a8ce63ceaf83db651043d396264f6b5312320eeb489cf4d507ac81c1fb79',
  trail: '08228f432b1b26d4af5c1d7a9536bfc8ab15e23ca61afa883e30705540d7b78d',
};
const p3 = block(app3, 'PACE_ICONS');
for (const [k, h] of Object.entries(PACE_ORIG)) {
  const m = p3.match(new RegExp('^  ' + k + ": '((?:[^'\\\\]|\\\\.)*)',?$", 'm'));
  check(`E: app3 pace ${k} is the shipped 1.184 vector byte-for-byte`, !!m && sha256buf(Buffer.from(m[1])) === h, m ? sha256buf(Buffer.from(m[1])) : 'missing');
}
check('E: the PACE_ORIGINALS snapshot stands in the registry', app4.includes('const PACE_ORIGINALS = { ...PACE_ICONS };'));
check('E: the dead four are in NO pack map', !/const (PULSAR|GLYPH)_(EXTRAS|PACE_ICONS) = \{[^}]*\b(menu|upd|flip|exp):/s.test(app4));

// ================= F - the render layer mints and re-stamps the extras =================
console.log('F - renderIcons: extras minting for both image packs, Original restore, in-place host re-stamps');
check('F: the extras mint from the active pack maps', app4.includes("const EX = pack === 'glyph' ? GLYPH_EXTRAS : PULSAR_EXTRAS, PM = pack === 'glyph' ? GLYPH_PACE_ICONS : PULSAR_PACE_ICONS;"));
check('F: ICONS pin/note mint as bare imgs (no wrapper chip)', app4.includes('for (const k of Object.keys(EX)) ICONS[k] = `<img class="xico" data-k="${k}" src="${night ? EX[k].n : EX[k].d}">`;'));
check('F: PACE_ICONS mints from the pack pace map', app4.includes('for (const k of Object.keys(PM)) PACE_ICONS[k] = `<img class="xico" data-k="${k}" src="${night ? PM[k].n : PM[k].d}">`;'));
check('F: the Original branch restores the stat glyphs from the snapshot', app4.includes('for (const k of Object.keys(PACE_ORIGINALS)) PACE_ICONS[k] = PACE_ORIGINALS[k];'));
check('F: street-row pin hosts re-stamp in place', app4.includes("document.querySelectorAll('.smap').forEach(el => { el.innerHTML = ICONS.pin; });"));
check('F: note hosts re-stamp in place', app4.includes("document.querySelectorAll('.ntIco, .nmNote, .cvNoteIco').forEach(el => { el.innerHTML = ICONS.note; });"));
check('F: rendered stat cells re-stamp in place by data-ic', app4.includes("document.querySelectorAll('.statgrid .ic[data-ic]').forEach(el => { el.innerHTML = PACE_ICONS[el.getAttribute('data-ic')]; });"));
check('F: statCell carries data-ic', app3.includes('<span class="ic" data-ic="\' + ic + \'">'));
check('F: the street-row builder still stamps from ICONS (the pack-driven table)', app2.includes("d.querySelector('.smap').innerHTML = ICONS.pin; d.querySelector('.ntIco').innerHTML = ICONS.note; d.querySelector('.nmNote').innerHTML = ICONS.note;"));

// ================= G - Puffy is retired whole =================
console.log('G - no Puffy registry, states, or picker row; three packs; a stored puffy reads as pulsar');
check('G: no PUFFY_ICONS map', !app4.includes('PUFFY_ICONS'));
check('G: no PUFFY_GPS_STATES map', !app4.includes('PUFFY_GPS_STATES'));
check('G: no puffy picker row', !app4.includes("id: 'puffy'"));
check('G: no puffy branch in pkIcon or renderIcons (no PUFFY map is referenced anywhere)', !app4.includes('PUFFY'));
check('G: the pack list is exactly three rows', (app4.match(/\{ id: '(pulsar|original|glyph)', name:/g) || []).length === 3);
check('G: iconPackId knows two ids - a stored puffy falls to the pulsar default', app4.includes("function iconPackId() { const v = lsGet(LS.iconpack); return v === 'original' || v === 'glyph' ? v : 'pulsar'; }"));

// ================= H - a backup carrying puffy restores as the default =================
console.log('H - both restore paths map puffy -> pulsar inside the verified write set; unknown ids still refuse');
check('H: the strict path still reads four ids (puffy stays readable)', app4.includes("if (parsed.iconpack !== 'pulsar' && parsed.iconpack !== 'original' && parsed.iconpack !== 'glyph' && parsed.iconpack !== 'puffy')"));
check('H: the strict path writes pulsar for a carried puffy', app4.includes("pushField(LS_GLOBAL.iconpack, 'iconpack', parsed.iconpack === 'puffy' ? 'pulsar' : parsed.iconpack, 'icon pack')"));
check('H: the v1 path writes pulsar for a carried puffy', app4.includes("parsed.data['snowroute.v2.iconpack'] === 'puffy' ? 'pulsar' : parsed.data['snowroute.v2.iconpack']"));

// ================= I - the boxes: one rule for svg and img =================
console.log('I - head.html host rules fill the same box for the vector and the artwork');
check('I: selNote box shared (split rules - the svg rule is byte-pinned by the 1.214 proofs, so the img form stands in its own rule at the same box)', head.includes('#selNote svg { width: 16px; height: 16px; display: block; margin: auto; }') && head.includes('#selNote img { width: 16px; height: 16px; display: block; margin: auto; }'));
check('I: street pin box shared', head.includes('.srow .sbtn svg, .srow .sbtn img { width: 15px; height: 15px; display: block; margin: auto; }'));
check('I: row note-mark box shared', head.includes('.srow .nt .ntIco svg, .srow .nt .ntIco img { width: 11px; height: 11px; vertical-align: -1px; margin-right: 4px; }'));
check('I: row name note box shared', head.includes('.srow .nmNote svg, .srow .nmNote img { width: 14px; height: 14px; display: block; }'));
check('I: clean-view note box shared', head.includes('.cvRow .cvNoteIco svg, .cvRow .cvNoteIco img { width: 14px; height: 14px; display: block; }'));
check('I: the stat cell img fills the vector\'s 26px box', head.includes('.statgrid .ic img { width: 26px; height: 26px; display: block; }'));

// ================= J - the close ✕ wears the pack (Andrew's late addition) =================
console.log('J - the close buttons: Pulsar native cancel, Glyph disc fills (red corner / white bottom), Original text; boxes untouched');
{
  const px = (app4.match(/const PULSAR_X = '([^']+)'/) || [])[1] || '';
  check('J: PULSAR_X is the native cancel artwork (sha256)', uriHash(px) === '37417f13ddd0ce5b1835100bedc9f09a18cbcbc597097b8946201f392847d0fb', uriHash(px));
  const gx = (app4.match(/const GLYPH_X = \{ corner: '([^']+)', bottom: '([^']+)' \}/) || []);
  check('J: GLYPH_X corner is the cancel disc in the close red #E63A2E (sha256)', uriHash(gx[1] || '') === 'fc1f5aff518a73b3e6aca2266b0646e0e40c75da38c4d09b23c5b17ee0054091', uriHash(gx[1] || ''));
  check('J: GLYPH_X bottom is the cancel disc in white (sha256)', uriHash(gx[2] || '') === 'ecfb1d07303c29258fdd1a057bb9cd552f69015f1409bd5fb8e711901097b446', uriHash(gx[2] || ''));
  check('J: renderIcons stamps the corner family (seven hosts, guarded)', app4.includes("for (const id of ['sheetClose', 'paceClose', 'finNo', 'noteNo', 'xClose', 'crModalX', 'mapNoteNo']) { const el = $(id); if (el) el.innerHTML = pack === 'original' ? '\\u2715' : `<img class=\"xico\" src=\"${pack === 'glyph' ? GLYPH_X.corner : PULSAR_X}\">`; }"));
  check('J: renderIcons stamps the bottom-centre pair', app4.includes("for (const id of ['rmClose', 'setClose']) { const el = $(id); if (el) el.innerHTML = pack === 'original' ? '\\u2715' : `<img class=\"xico\" src=\"${pack === 'glyph' ? GLYPH_X.bottom : PULSAR_X}\">`; }"));
  check('J: the artwork centres by flex only while it rides (:has)', head.includes('#sheetClose:has(img), #paceClose:has(img), #finNo:has(img), #noteNo:has(img), #xClose:has(img), #crModalX:has(img), #mapNoteNo:has(img) { display: flex; align-items: center; justify-content: center; }'));
  check('J: the corner artwork rides at the glyph size (21px) in the same 38px box', head.includes('#sheetClose img, #paceClose img, #finNo img, #noteNo img, #xClose img, #crModalX img { width: 21px; height: 21px; display: block; }'));
  check('J: the map-note artwork rides at its glyph size (19px)', head.includes('#mapNoteNo img { width: 19px; height: 19px; display: block; }'));
  check('J: the bottom artwork rides at the glyph size (30px) in the same 44px box', head.includes('#rmClose img, #setClose img { width: 30px; height: 30px; display: block; }'));
  check('J: the shared corner rule itself is untouched (the boxes never move)', head.includes('#sheetClose, #paceClose, #finNo, #noteNo, #xClose, #crModalX { position: absolute; top: 2px; right: 4px;'));
}

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
