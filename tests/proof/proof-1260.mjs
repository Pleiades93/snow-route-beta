import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

// Splash logo finish proof (fix_id: logoswap-1260, Beta 1.260, 2026-11-20).
// Andrew's approved edit of the splash artwork ships: the snow mound's
// abrupt left/right cut ends finish as small tight rounded noses
// (sample attempt 2, approved "exactly what I wanted"; the wide
// sagging taper of attempt 1 was rejected), and the flat bottom line
// wears the STRONG feather from the feather ladder (an alpha fade over
// the bottom 40 asset px) so it dissolves into the splash gradient.
// The file is a byte-for-byte swap of the approved edit - no re-encode.
// Splash only: the home-screen icon files are separate and unchanged
// (proof-icon-swap-1213's S/M/F sections still pin those).
//
// On the Beta 1.259 tree every section fails: the artwork hash is the
// pack original's, the bottom row reads opaque across, and the edge
// columns carry the cut ends' full-height snow.
//
// Run from the repo root:  node tests/proof/proof-1260.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}
const sha256 = p => createHash('sha256').update(readFileSync(p)).digest('hex');

// Minimal PNG reader (the proof-icon-swap-1213 pattern).
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
  return { w, h, ct, px };
}
const A = (img, x, y) => img.px[(y * img.w + x) * 4 + 3];
const opaqueInCol = (img, x) => { let n = 0; for (let y = 0; y < img.h; y++) if (A(img, x, y) >= 128) n++; return n; };

// ================= H - the shipped file is the approved edit =================
console.log('H - artwork identity');
const img = decodePng(readFileSync('splash-artwork-512.png'));
check('H: splash-artwork-512.png is byte-for-byte the approved edit (sha256)',
  sha256('splash-artwork-512.png') === 'e00154e3583f2c1ab4a01cb21efefd1fb326887cae92a708bc62a059024c356b');
check('H: the artwork stays 512x512 with an alpha channel (colour type 6) - a transparent PNG end to end, never flattened',
  img.w === 512 && img.h === 512 && img.ct === 6);

// ================= B - the STRONG bottom feather =================
console.log('B - bottom feather: the flat line is dissolved, the fade graded and band-confined');
let bottomMax = 0;
for (let x = 0; x < 512; x++) bottomMax = Math.max(bottomMax, A(img, x, 511));
check('B: the bottom row (y=511) is fully transparent across the whole width - no flat line survives', bottomMax === 0, 'max ' + bottomMax);
check('B: the snow body just above the band is still fully opaque at centre (256,471) - the fade starts at the band, not above it',
  A(img, 256, 471) === 255);
check('B: inside the band the fade is graded, not a step - (256,490) reads strictly between clear and opaque',
  A(img, 256, 490) > 0 && A(img, 256, 490) < 255, 'reads ' + A(img, 256, 490));
let mono = true;
for (let y = 472; y < 511; y++) if (A(img, 256, y) < A(img, 256, y + 1)) mono = false;
check('B: down the centre column the alpha never rises through the band (a smooth one-way fade, no second edge)', mono);

// ================= E - the rounded end noses =================
console.log('E - ends: the cut faces are gone, the noses rise toward the edges');
check('E: the outermost columns carry no solid snow at all - column 0 and column 511 hold zero opaque (>=128) pixels',
  opaqueInCol(img, 0) === 0 && opaqueInCol(img, 511) === 0,
  'col0 ' + opaqueInCol(img, 0) + ', col511 ' + opaqueInCol(img, 511));
check('E: the nose profile thins toward each edge - opaque count at x=5 is below x=35, and at x=506 below x=476',
  opaqueInCol(img, 5) < opaqueInCol(img, 35) && opaqueInCol(img, 506) < opaqueInCol(img, 476),
  'x5 ' + opaqueInCol(img, 5) + ' vs x35 ' + opaqueInCol(img, 35) + '; x506 ' + opaqueInCol(img, 506) + ' vs x476 ' + opaqueInCol(img, 476));

// ================= I - the built page inlines THIS file =================
console.log('I - inlined artwork');
const page = readFileSync('index.html', 'utf8');
const m = page.match(/id="splashIcon" src="data:image\/png;base64,([A-Za-z0-9+/=]+)"/);
check('I: the built page\u2019s #splashIcon payload decodes to the shipped file byte-for-byte',
  !!m && createHash('sha256').update(Buffer.from(m[1], 'base64')).digest('hex') === 'e00154e3583f2c1ab4a01cb21efefd1fb326887cae92a708bc62a059024c356b');

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
