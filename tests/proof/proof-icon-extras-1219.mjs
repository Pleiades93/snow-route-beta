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

// ================= A - the retired colour pack's extras are GONE (Beta 1.220) =================
console.log('A - the colour pack\'s extras stood here through Beta 1.219; Andrew retired the pack in 1.220 - its extras maps are gone whole');
check('A: no PULSAR_EXTRAS map remains', !app4.includes('PULSAR_EXTRAS'));
check('A: no PULSAR_PACE_ICONS map remains', !app4.includes('PULSAR_PACE_ICONS'));
check('A: no PULSAR reference remains anywhere in app4', !app4.includes('PULSAR'));

// ================= B - the Glyph extras are complete and byte-exact =================
console.log('B - GLYPH_EXTRAS + GLYPH_PACE_ICONS carry the nine live extras as mask fills (sha256), day #14161C / night white');
const G_FILL = {
  pin: ['c755944c765d25dff1d6c59f31225d7ec965e37d769f4bb91b4ec7be3d3234ff', '4cc992fcfa413a62c09c91582ef49130dd5102656a3f3388ccd0ccbad7f5b270'], // 'marker' fills, as above
  note: ['48cd1226e49682a09c875d04ccbbfd78acb8c7716f2af0e6f459dcdb4b32248c', '22277526d00b8e7d9579c387d92f9fc82240f501a356a3c98089e36b3ce1368e'],
  clock: ['c9410593e7499127ac29d14ff3507f45e05cb40a702d24cf2d2248defaf9c9bf', 'af764dbabd14e2deae46824634cdaae344640b2d57d007e8bfb822bf486a926b'],
  road: ['6503f88f79337bf284735947eb0ae86d4bb00309ac7991f253a6c0891a3ef72c', 'ea85825be0b9c79e9cceea255d7e6d7cc6e2e8b546e4ef01bd0b06293937849a'],
  flag: ['d1cb9b38dabce9b8bcbc286f8c06f9b671d744c96dbf18a4fa2989762919d0a2', 'd9bea0e76b08f8583dcda203fd38f5cffe4d922848e795458542d42ece155862'],
  list: ['3f87885a3381d66100858ffc813b10e0fffec50b5b5b907f6e0136d0b66f0f07', '0b73813ddf037a088272aabb473d1ebdd19526f72f4cd7b6c515297fcd24b1e0'],
  cal: ['fb12314d537c4afd99c914f149ba44107e609f04927d825314b0e05ab1d2cce3', '1b1fe743feabae9ebbc645824d5d950d043afd523a1da94d105a132cc533d197'],
  gauge: ['1161b707616435e96b726623ee02f2d391327ca016330c8cf66bd8222046e90b', '62d3c4b9f5a39526811b2d090718044a24880872debb468c6c397d1efc69a4b0'],
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
const gMain = block(app4, 'GLYPH_ICONS');
check('C: no colour-pack streets artwork remains (its map is gone)', !app4.includes('PULSAR_ICONS'));
const gs = dnLine(gMain, 'streets');
check('C: glyph streets is the HIGHWAY fill (day + night)', !!gs[1] && uriHash(gs[1]) === '7efa94714891e191f88b95da0b6857783a5617da5d4d5fe0dd83f7c92c618241' && uriHash(gs[2]) === 'c4819f8a13c65b325b67b63ff8e77974ec002c5c3d2ba4c78d0cf6ed8c2f83c9');
check('C: the glyph stat road is byte-identical to 1.218\'s glyph streets (the basic road moved slots, unchanged)',
  G_FILL.road[0] === '6503f88f79337bf284735947eb0ae86d4bb00309ac7991f253a6c0891a3ef72c' && G_FILL.road[1] === 'ea85825be0b9c79e9cceea255d7e6d7cc6e2e8b546e4ef01bd0b06293937849a');
check('C: within the glyph pack the Streets artwork differs from the stat road artwork',
  uriHash(gs[1]) !== G_FILL.road[0]);

// ================= D - the flag rule + the Glyph summer sun =================
console.log('D - ETA stat is a plain flag (not the checkered Pace button); the Glyph sun is summer');
check('D: no colour-pack pace flag remains (its maps are gone)', !app4.includes('PULSAR_PACE_ICONS'));
check('D: glyph pace flag is the flag-2 fill, apart from the checkered pace main',
  G_FILL.flag[0] === 'd1cb9b38dabce9b8bcbc286f8c06f9b671d744c96dbf18a4fa2989762919d0a2' && dnLine(gpc, 'flag')[1] !== dnLine(gMain, 'pace')[1]);
const gsun = dnLine(gMain, 'sun');
check('D: glyph sun is the SUMMER fill (day + night)', !!gsun[1] && uriHash(gsun[1]) === 'f7df7b2cd24fb708a163b72b03f19b1dfb9607c4e6f68e5e8a79d869301667a1' && uriHash(gsun[2]) === '2bb193f75b3e5f67df6231783fa304ab05177618c58023016b0bf525f4b3a86d', gsun[1] ? uriHash(gsun[1]) : 'missing');
check('D: glyph sun is NOT the 1.218 sun (the one that read as a settings cog)', !!gsun[1] && uriHash(gsun[1]) !== '0891e30362924a09e3de57beb54d4b2e1aac6b9be6a1d77f8ad8ab30e1edda27');

// ================= E - the mint tables ship empty; the retired snapshot is GONE (Beta 1.220) =================
console.log('E - the vector pack\'s pin/note and stat vectors stood here through Beta 1.219; in 1.220 the ICONS and PACE_ICONS tables ship EMPTY and the snapshot is gone');
check('E: the ICONS pin entry ships empty', /^  pin: ''/m.test(app4));
check('E: the ICONS note entry ships empty', /^  note: ''/m.test(app4));
for (const k of KEYS7) {
  check(`E: app3 pace ${k} ships empty in the mint table`, new RegExp('^  ' + k + ": ''", 'm').test(app3));
}
check('E: no PACKD pin/note remains (the registry copy is gone)', !app4.includes('PACKD_ICONS'));
check('E: the PACE_ORIGINALS snapshot is gone', !app4.includes('PACE_ORIGINALS'));
check('E: the dead four are in NO pack map', !/const (GLYPH|MAT|WIN10)_(EXTRAS|PACE_ICONS) = \{[^}]*\b(menu|upd|flip|exp):/s.test(app4));

// ================= F - the render layer mints and re-stamps the extras =================
console.log('F - renderIcons: extras minting from the active pack, in-place host re-stamps');
check('F: the extras mint from the active pack maps (the MASK_PACKS table is the only path)', app4.includes("const EX = MP.extras, PM = MP.pace;"));
check('F: ICONS pin/note mint as bare imgs (no wrapper chip)', app4.includes('for (const k of Object.keys(EX)) ICONS[k] = `<img class="xico" data-k="${k}" src="${night ? EX[k].n : EX[k].d}">`;'));
check('F: PACE_ICONS mints from the pack pace map', app4.includes('for (const k of Object.keys(PM)) PACE_ICONS[k] = `<img class="xico" data-k="${k}" src="${night ? PM[k].n : PM[k].d}">`;'));
check('F: no snapshot-restore branch remains (no pack restores vectors)', !app4.includes('PACE_ORIGINALS'));
check('F: street-row pin hosts re-stamp in place', app4.includes("document.querySelectorAll('.smap').forEach(el => { el.innerHTML = ICONS.pin; });"));
check('F: note hosts re-stamp in place', app4.includes("document.querySelectorAll('.ntIco, .nmNote, .cvNoteIco').forEach(el => { el.innerHTML = ICONS.note; });"));
check('F: rendered stat cells re-stamp in place by data-ic', app4.includes("document.querySelectorAll('.statgrid .ic[data-ic]').forEach(el => { el.innerHTML = PACE_ICONS[el.getAttribute('data-ic')]; });"));
check('F: statCell carries data-ic', app3.includes('<span class="ic" data-ic="\' + ic + \'">'));
check('F: the street-row builder still stamps from ICONS (the pack-driven table)', app2.includes("d.querySelector('.smap').innerHTML = ICONS.pin; d.querySelector('.ntIco').innerHTML = ICONS.note; d.querySelector('.nmNote').innerHTML = ICONS.note;"));

// ================= G - Puffy is retired whole =================
console.log('G - the retired packs are gone whole; three packs stand; a stored retired id reads as glyph, the default');
check('G: no PUFFY_ICONS map', !app4.includes('PUFFY_ICONS'));
check('G: no PUFFY_GPS_STATES map', !app4.includes('PUFFY_GPS_STATES'));
check('G: no puffy picker row', !app4.includes("id: 'puffy'"));
check('G: no puffy branch in pkIcon or renderIcons (no PUFFY map is referenced anywhere)', !app4.includes('PUFFY'));
check('G: the pack list is exactly three rows', (app4.match(/\{ id: '(glyph|material|win10)', name:/g) || []).length === 3);
check('G: iconPackId knows the three live ids - a stored retired id falls to the glyph default', app4.includes("function iconPackId() { const v = lsGet(LS.iconpack); return v === 'glyph' || v === 'material' || v === 'win10' ? v : 'glyph'; }"));

// ================= H - a backup carrying puffy restores as the default =================
console.log('H - both restore paths map a retired id -> glyph inside the verified write set; unknown ids still refuse');
check('H: the strict path reads the three live ids plus the three retired ones (readable, mapping to glyph)', app4.includes("if (parsed.iconpack !== 'glyph' && parsed.iconpack !== 'material' && parsed.iconpack !== 'win10' && parsed.iconpack !== 'pulsar' && parsed.iconpack !== 'original' && parsed.iconpack !== 'puffy') { toast('Backup has a bad value for icon pack \\u2014 nothing was changed', 3200); return; } if (!pushField(LS_GLOBAL.iconpack, 'iconpack', (parsed.iconpack === 'pulsar' || parsed.iconpack === 'original' || parsed.iconpack === 'puffy') ? 'glyph' : parsed.iconpack, 'icon pack')) return; }"));
check('H: the strict path writes glyph for a carried retired id', app4.includes("pushField(LS_GLOBAL.iconpack, 'iconpack', (parsed.iconpack === 'pulsar' || parsed.iconpack === 'original' || parsed.iconpack === 'puffy') ? 'glyph' : parsed.iconpack, 'icon pack')"));
check('H: the v1 path writes glyph for a carried retired id', app4.includes("(parsed.data['snowroute.v2.iconpack'] === 'pulsar' || parsed.data['snowroute.v2.iconpack'] === 'original' || parsed.data['snowroute.v2.iconpack'] === 'puffy') ? 'glyph' : parsed.data['snowroute.v2.iconpack']"));

// ================= I - the boxes: one rule for svg and img =================
console.log('I - head.html host rules fill the same box for the vector and the artwork');
check('I: selNote box shared (split rules - the svg rule is byte-pinned by the 1.214 proofs, so the img form stands in its own rule at the same box)', head.includes('#selNote svg { width: 16px; height: 16px; display: block; margin: auto; }') && head.includes('#selNote img { width: 16px; height: 16px; display: block; margin: auto; }'));
check('I: street pin box shared', head.includes('.srow .sbtn svg, .srow .sbtn img { width: 15px; height: 15px; display: block; margin: auto; }'));
check('I: row note-mark box shared', head.includes('.srow .nt .ntIco svg, .srow .nt .ntIco img { width: 11px; height: 11px; vertical-align: -1px; margin-right: 4px; }'));
check('I: row name note box shared', head.includes('.srow .nmNote svg, .srow .nmNote img { width: 14px; height: 14px; display: block; }'));
check('I: clean-view note box shared', head.includes('.cvRow .cvNoteIco svg, .cvRow .cvNoteIco img { width: 14px; height: 14px; display: block; }'));
check('I: the stat cell img fills the vector\'s 26px box', head.includes('.statgrid .ic img { width: 26px; height: 26px; display: block; }'));

// ================= J - the close ✕ wears the pack (Andrew's late addition) =================
console.log('J - the close buttons: every pack wears its cancel artwork (red corner / white bottom); boxes untouched');
{
  check('J: no retired-pack X artwork remains', !app4.includes('PULSAR_X'));

  const gx = (app4.match(/const GLYPH_X = \{ corner: '([^']+)', bottom: '([^']+)' \}/) || []);
  check('J: GLYPH_X corner is the cancel disc in the close red #E63A2E (sha256)', uriHash(gx[1] || '') === 'fc1f5aff518a73b3e6aca2266b0646e0e40c75da38c4d09b23c5b17ee0054091', uriHash(gx[1] || ''));
  check('J: GLYPH_X bottom is the cancel disc in white (sha256)', uriHash(gx[2] || '') === 'ecfb1d07303c29258fdd1a057bb9cd552f69015f1409bd5fb8e711901097b446', uriHash(gx[2] || ''));
check('J: renderIcons stamps the corner family (seven hosts, guarded)', app4.includes("for (const id of ['sheetClose', 'paceClose', 'finNo', 'noteNo', 'xClose', 'crModalX', 'mapNoteNo']) { const el = $(id); if (el) el.innerHTML = `<img class=\"xico\" alt=\"Close\" src=\"${MP.x.corner}\">`; }"));
check('J: renderIcons stamps the bottom-centre pair', app4.includes("for (const id of ['rmClose', 'setClose']) { const el = $(id); if (el) el.innerHTML = `<img class=\"xico\" alt=\"Close\" src=\"${MP.x.bottom}\">`; }"));
  check('J: the artwork centres by flex only while it rides (:has)', head.includes('#sheetClose:has(img), #paceClose:has(img), #finNo:has(img), #noteNo:has(img), #xClose:has(img), #crModalX:has(img), #mapNoteNo:has(img) { display: flex; align-items: center; justify-content: center; }'));
  check('J: the corner artwork rides at the glyph size (21px) in the same 38px box', head.includes('#sheetClose img, #paceClose img, #finNo img, #noteNo img, #xClose img, #crModalX img { width: 21px; height: 21px; display: block; }'));
  check('J: the map-note artwork rides at its glyph size (19px)', head.includes('#mapNoteNo img { width: 19px; height: 19px; display: block; }'));
  check('J: the bottom artwork rides at the glyph size (30px) in the same 44px box', head.includes('#rmClose img, #setClose img { width: 30px; height: 30px; display: block; }'));
  check('J: the shared corner rule itself is untouched (the boxes never move)', head.includes('#sheetClose, #paceClose, #finNo, #noteNo, #xClose, #crModalX { position: absolute; top: 2px; right: 4px;'));
}

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
