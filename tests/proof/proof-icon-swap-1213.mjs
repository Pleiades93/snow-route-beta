import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

// Icon-swap proof (fix_id: icon-swap-1213, Beta 1.213, 2026-11-16).
// Andrew's professional icon pack replaces the Beta 1.177 icon set
// whole (he replaced the source pack mid-round; a clay-pack build
// was discarded before it shipped). EVERY file is a byte-for-byte
// copy of the pack's: the six launcher/manifest PNGs, the pack's own
// maskable composition, the splash artwork (the pack's transparent
// foreground rendering, already 512x512), and favicon.svg - the
// pack's master vector (a true vector: zero embedded rasters), so
// the SVG stays and becomes the new icon; the head link is unchanged.
//
// On unmodified main (Beta 1.212) the S/M/P/F checks fail: every
// hash differs, the maskable wears the old composition, the splash
// asset is 512x423, and favicon.svg is the old artwork.
//
// Run from the repo root:  node tests/proof/proof-icon-swap-1213.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}
const sha256 = p => createHash('sha256').update(readFileSync(p)).digest('hex');

// Minimal PNG reader (8-bit, colour types 2/6, no interlace - the
// drive180 pattern) so the pixel proofs need no dependency.
function decodePng(buf) {
  let pos = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12] !== 0) throw new Error('png format'); }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = ct === 6 ? 4 : 3; const stride = w * bpp;
  const px = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]; const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (f === 1) v = (v + a) & 255; else if (f === 2) v = (v + b) & 255; else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
      cur[x] = v;
    }
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, so = x * bpp; px[o] = cur[so]; px[o + 1] = cur[so + 1]; px[o + 2] = cur[so + 2]; px[o + 3] = bpp === 4 ? cur[so + 3] : 255; }
    prev = cur;
  }
  return { w, h, px };
}
const FIELD = [27, 47, 182]; // the pack maskable's flat field
const pxAt = (img, x, y) => { const o = (y * img.w + x) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2], img.px[o + 3]]; };
const isField = p => p[0] === FIELD[0] && p[1] === FIELD[1] && p[2] === FIELD[2];

// ================= S - the swapped files are the pack's bytes =================
console.log('S - shipped icon files match the professional pack, corners opaque');
const PACK_SHA = {
  'icon-192.png': 'c18049d2aa2a8e016f9839e9f807cc150f540c83a6865769fea87c24781b5be5',
  'icon-512.png': '3f6ef90f233835bbc6718fb082b32717f25bc90af0be725d93505113c2ee5bc8',
  'icon-1024.png': '6530056b2b42c93223f3c276d844e702f275ff392b9b3331b2dbfd22806e2b51',
  'apple-touch-icon.png': '27907214c656ef1f359cc68f5b007affba70cbfbc9c6c2a8c6dffafd0facfdb2',
  'icon-32.png': '31f60dac685e0ec348f6e7e0360469f9b5b1b7f1377aaf0df9e494837f43b52a',
  'icon-16.png': '40caf2e359b4f5c5be1bf57424f7dba4169b572284113e486e5f587edb4e8162',
};
for (const [f, want] of Object.entries(PACK_SHA)) {
  check('S: ' + f + ' is byte-identical to the pack source', existsSync(f) && sha256(f) === want);
}
for (const f of ['icon-512.png', 'icon-192.png', 'icon-1024.png', 'apple-touch-icon.png']) {
  const img = decodePng(readFileSync(f));
  const corners = [pxAt(img, 0, 0), pxAt(img, img.w - 1, 0), pxAt(img, 0, img.h - 1), pxAt(img, img.w - 1, img.h - 1)];
  check('S: ' + f + ' corners are the designed gradient field - fully opaque, no white corner (the corner defect this swap fixes)',
    corners.every(c => c[3] === 255 && !(c[0] >= 245 && c[1] >= 245 && c[2] >= 245)), JSON.stringify(corners));
}

// ================= M - the maskable is the pack's composition =================
console.log('M - maskable: the pack composition, artwork inside the safe zone');
const mask = decodePng(readFileSync('icon-maskable-512.png'));
check('M: the maskable is byte-identical to the pack composition (sha256)',
  sha256('icon-maskable-512.png') === 'dde7c142e5da20333d7638c2ecab32e8473e089cc2df76529c5e5c8a34e67151');
check('M: maskable corners and edge midpoints are the flat field (27,47,182)',
  [pxAt(mask, 0, 0), pxAt(mask, 511, 0), pxAt(mask, 0, 511), pxAt(mask, 511, 511), pxAt(mask, 0, 256), pxAt(mask, 511, 256), pxAt(mask, 256, 0), pxAt(mask, 256, 511)].every(isField));
let minx = 512, miny = 512, maxx = -1, maxy = -1, sqOut = 0;
for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
  const p = pxAt(mask, x, y);
  if (Math.abs(p[0] - FIELD[0]) + Math.abs(p[1] - FIELD[1]) + Math.abs(p[2] - FIELD[2]) > 60) {
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    // the squircle of the round's rendered mask QA (rounded rect, r=115):
    const qx = Math.max(Math.abs(x - 255.5) - (255.5 - 115), 0), qy = Math.max(Math.abs(y - 255.5) - (255.5 - 115), 0);
    if (qx * qx + qy * qy > 115 * 115) sqOut++;
  }
}
check('M: maskable artwork bbox (' + minx + ',' + miny + ')-(' + maxx + ',' + maxy + ') sits inside the 80% safe zone [51..461] on every side',
  minx >= 51 && maxx <= 461 && miny >= 51 && maxy <= 461);
check('M: zero artwork pixels outside the squircle mask (the rendered overlay QA crops nothing)', sqOut === 0, sqOut + ' outside');

// ================= P - the splash artwork is the pack's transparent foreground =================
console.log('P - splash artwork: 512x512, transparent where the tile would have painted');
const splash = decodePng(readFileSync('splash-artwork-512.png'));
check('P: the splash artwork is byte-identical to the pack foreground (sha256)',
  sha256('splash-artwork-512.png') === '44daff74588abf708fe79393a5fd96bd5be072db1ecb2801b65e7d813287b39a');
check('P: splash asset is 512x512 (the 1.191 asset was 512x423)', splash.w === 512 && splash.h === 512);
check('P: splash alpha is 0 at every point the artwork leaves clear - top corners, top-mid, left-mid, right-mid and (61,61) (drive180 NOTILE\u2019s points)',
  pxAt(splash, 0, 0)[3] === 0 && pxAt(splash, 511, 0)[3] === 0 && pxAt(splash, 256, 0)[3] === 0 && pxAt(splash, 0, 256)[3] === 0 && pxAt(splash, 511, 256)[3] === 0 && pxAt(splash, 61, 61)[3] === 0);
check('P: the bottom corners are the artwork\u2019s own snow band (alpha 255) - the asset\u2019s shape, asserted',
  pxAt(splash, 0, 511)[3] === 255 && pxAt(splash, 511, 511)[3] === 255);

// ================= F - favicon.svg is the pack's master vector =================
console.log('F - favicon: the pack master vector, truly vector, link stands');
const head = readFileSync('parts/head.html', 'utf8');
const page = readFileSync('index.html', 'utf8');
const fav = existsSync('favicon.svg') ? readFileSync('favicon.svg', 'utf8') : '';
check('F: favicon.svg is byte-identical to the pack master (sha256)',
  existsSync('favicon.svg') && sha256('favicon.svg') === '899e3847f9f871ec00e87e14f37b32ce8c1f50ab4093f3be626e4473a0e9844c');
check('F: favicon.svg is a true vector - an <svg> document with no embedded raster',
  fav.includes('<svg') && !fav.includes('<image') && !fav.includes('base64'));
check('F: the head SVG icon link stands', head.includes('<link rel="icon" type="image/svg+xml" href="favicon.svg">'));
check('F: the assembled page serves the SVG icon link', page.includes('<link rel="icon" type="image/svg+xml" href="favicon.svg">'));
check('F: the PNG favicon links stand behind it', head.includes('<link rel="icon" type="image/png" sizes="32x32" href="icon-32.png">') && head.includes('<link rel="icon" type="image/png" sizes="16x16" href="icon-16.png">'));

// ================= V - the bump agrees =================
// (The two version pins below follow the SHIPPED version - the
// drive194 pattern: this proof shipped them at Beta 1.213; rolled in
// place to Beta 1.214 by the selcard-note-move round, then to Beta
// 1.215 by the selcard-width-262 round, then to Beta 1.216 by the
// create-glow-casing-fix round, all 2026-11-16, TEST class.
// The icon sections above are this proof's durable property and are
// untouched.)
console.log('V - version surfaces agree');
const app4 = readFileSync('parts/app4.js', 'utf8');
check('V: the #ver label reads Beta 1.226', head.includes('<div class="ver" id="ver">Beta 1.230</div>'));
check('V: WHATSNEW is the Beta 1.226 entry', app4.includes("v: 'Beta 1.230', items:"));

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
