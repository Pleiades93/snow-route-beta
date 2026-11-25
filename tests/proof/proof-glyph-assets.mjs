// proof-glyph-assets.mjs - Phase 5 glyph extraction.
// app4's glyph payloads live as files under assets/glyphs/; the
// source carries @@GLYPH:<stem>@@ tokens and scripts/assemble.py
// inlines each file's exact bytes at assembly time. This proof
// pins the chain: tokens and files agree one-to-one, every file
// is a WebP, and the shipped page carries each file's exact data
// URL with no token left over.
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const app4 = read('parts/app4.js');
const assemble = read('scripts/assemble.py');
const page = read('index.html');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

const stems = [...app4.matchAll(/@@GLYPH:([a-z0-9-]+)@@/g)].map(m => m[1]);
check('A1: app4 carries exactly 52 glyph tokens', stems.length === 52);
check('A2: every token stem is unique', new Set(stems).size === stems.length);

const files = readdirSync(new URL('assets/glyphs/', root)).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5));
check('B1: assets/glyphs holds exactly the referenced files', files.length === stems.length && stems.every(s => files.includes(s)));

const assetB64 = (stem) => readFileSync(new URL('assets/glyphs/' + stem + '.webp', root)).toString('base64');
const assetHead = (stem) => readFileSync(new URL('assets/glyphs/' + stem + '.webp', root)).subarray(0, 12).toString('latin1');
check('B2: every asset is a RIFF/WEBP file', stems.every(s => assetHead(s).startsWith('RIFF') && assetHead(s).slice(8) === 'WEBP'));

check('C1: the assembler resolves glyph tokens from assets/glyphs', assemble.includes('GLYPH_DIR = ROOT / "assets" / "glyphs"') && assemble.includes('data = resolve_glyphs(data)'));
check('C2: the shipped page carries no glyph token', !page.includes('@@GLYPH:'));
check('C3: the shipped page carries each asset\'s exact data URL', stems.every(s => page.includes('data:image/webp;base64,' + assetB64(s))));
check('C4: the shipped page carries exactly 52 WebP data URLs', (page.match(/data:image\/webp;base64,/g) || []).length === 52);

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
