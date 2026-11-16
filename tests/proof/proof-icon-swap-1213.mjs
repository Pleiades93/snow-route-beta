import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

// Icon-swap proof (fix_id: icon-swap-1213, Beta 1.213, 2026-11-16).
// Andrew's clay icon pack (the corner-fix pack he supplied) replaces
// the Beta 1.177 icon set whole: the six launcher/manifest files are
// byte-for-byte copies of the pack's with-background files; the
// maskable is RECOMPOSED (the pack's maskable is a byte-copy of its
// regular icon - artwork nearly edge-to-edge, which Android masks
// would clip - so the new artwork is scaled into the previous
// maskable's safe box on the pack's flat field colour); the splash
// artwork is the pack's transparent artwork resized to 512x512; and
// favicon.svg is deleted with its head link removed (Andrew: drop
// the SVG, new icon everywhere - the PNG links take over the tab).
// On unmodified main (Beta 1.212) the S/M/P/F checks fail: every
// hash differs, the maskable wears the old composition, the splash
// asset is 512x423, and favicon.svg is present and linked.
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
const FIELD = [16, 44, 184];
const pxAt = (img, x, y) => { const o = (y * img.w + x) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2], img.px[o + 3]]; };
const isField = p => p[0] === FIELD[0] && p[1] === FIELD[1] && p[2] === FIELD[2];

// ================= S - the swapped files are the pack's bytes =================
console.log('S - shipped icon files match the supplied pack, corners flat');
const PACK_SHA = {
  'icon-192.png': 'e39de27955fdd6f959ac7c0fa5da4bacbd52fe3e028adc3eabd25282cee5a43c',
  'icon-512.png': '0644615fbbe0d04101e8b29ce07ce0d4e546155ee5229c970e927aababe85a39',
  'icon-1024.png': '89ab3b403a8ced98a16fe9327fb0f666fdc5d8f1b98aeb22188529c260f10f29',
  'apple-touch-icon.png': '98434725225be0ca046909966f69629a32713d2570e7d4c3d80aba2535005ce6',
  'icon-32.png': '776eb5c5b6e79511862b9da6acb2fd19015ca631bb04338a51064eb8aeede99b',
  'icon-16.png': '55d33e77b16eddcb7ee893ddd96a586450df5a3bc0956751ce811da10b74edf9',
};
for (const [f, want] of Object.entries(PACK_SHA)) {
  check('S: ' + f + ' is byte-identical to the pack source', existsSync(f) && sha256(f) === want);
}
for (const f of ['icon-512.png', 'icon-192.png', 'icon-1024.png', 'apple-touch-icon.png']) {
  const img = decodePng(readFileSync(f));
  const corners = [pxAt(img, 0, 0), pxAt(img, img.w - 1, 0), pxAt(img, 0, img.h - 1), pxAt(img, img.w - 1, img.h - 1)];
  check('S: ' + f + ' corners are the flat field (16,44,184) - zero white, zero transparency',
    corners.every(isField), JSON.stringify(corners));
}

// ================= M - the maskable is recomposed into the safe zone =================
console.log('M - maskable: artwork inside the safe zone on the flat field');
const mask = decodePng(readFileSync('icon-maskable-512.png'));
check('M: the recomposed maskable matches the verified build (sha256)',
  sha256('icon-maskable-512.png') === 'db08af2add3fc73c4e0f9e00de01e244a8952c2dc1eb1bb352e5959a1a5a6a25');
check('M: maskable corners and edge midpoints are the flat field',
  [pxAt(mask, 0, 0), pxAt(mask, 511, 0), pxAt(mask, 0, 511), pxAt(mask, 511, 511), pxAt(mask, 0, 256), pxAt(mask, 511, 256), pxAt(mask, 256, 0), pxAt(mask, 256, 511)].every(isField));
let minx = 512, miny = 512, maxx = -1, maxy = -1, outside = 0;
for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
  const p = pxAt(mask, x, y);
  if (Math.abs(p[0] - FIELD[0]) + Math.abs(p[1] - FIELD[1]) + Math.abs(p[2] - FIELD[2]) > 60) {
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    const dx = x - 255.5, dy = y - 255.5;
    if (dx * dx + dy * dy > 204.8 * 204.8) outside++;
  }
}
check('M: maskable artwork bbox (' + minx + ',' + miny + ')-(' + maxx + ',' + maxy + ') sits inside the 80% safe zone [64..448] with margin',
  minx >= 64 && maxx <= 448 && miny >= 64 && maxy <= 448);
check('M: zero artwork pixels outside the 80% safe circle (no Android mask can clip the artwork)', outside === 0, outside + ' outside');

// ================= P - the splash artwork is the square transparent artwork =================
console.log('P - splash artwork: 512x512, transparent where the tile would have painted');
const splash = decodePng(readFileSync('splash-artwork-512.png'));
check('P: the derived splash artwork matches the verified build (sha256)',
  sha256('splash-artwork-512.png') === '71603512603509990dc786e2d8688fa12c4ab5d63ecef55e90b7595aea21f0c2');
check('P: splash asset is 512x512 (the 1.191 asset was 512x423)', splash.w === 512 && splash.h === 512);
check('P: splash alpha is 0 at the corners, the left edge midpoint and (61,61) - drive180 NOTILE\u2019s points',
  pxAt(splash, 0, 0)[3] === 0 && pxAt(splash, 511, 0)[3] === 0 && pxAt(splash, 0, 511)[3] === 0 && pxAt(splash, 511, 511)[3] === 0 && pxAt(splash, 0, 256)[3] === 0 && pxAt(splash, 61, 61)[3] === 0);

// ================= F - favicon.svg is gone and unreferenced =================
console.log('F - no SVG favicon: file deleted, link removed, page clean');
const head = readFileSync('parts/head.html', 'utf8');
const page = readFileSync('index.html', 'utf8');
check('F: favicon.svg no longer exists in the repo', !existsSync('favicon.svg'));
check('F: the head carries no favicon.svg link (the PNG links take over)', !head.includes('favicon.svg'));
check('F: the assembled page carries no favicon.svg reference', !page.includes('favicon.svg'));
check('F: the PNG favicon links stand', head.includes('<link rel="icon" type="image/png" sizes="32x32" href="icon-32.png">') && head.includes('<link rel="icon" type="image/png" sizes="16x16" href="icon-16.png">'));

// ================= V - the bump agrees =================
console.log('V - version surfaces agree');
const app4 = readFileSync('parts/app4.js', 'utf8');
check('V: the #ver label reads Beta 1.213', head.includes('<div class="ver" id="ver">Beta 1.213</div>'));
check('V: WHATSNEW is the Beta 1.213 entry', app4.includes("v: 'Beta 1.213', items:"));

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
