// proof-response-consumption.mjs - Section 1 step 6 (Architecture #18, Beta 1.281).
// ONE RESPONSE CONSUMPTION. Through Beta 1.280 the app's two watched
// downloads each implemented the same consumption by hand - a streaming
// reader loop, chunk accumulation, concatenation, decode, and a
// reader-less fallback: crOverpassFetch (parts/create-fetch.js) for
// service extracts and crPackDownload (parts/create-citydata.js) for
// city packs. The mechanics are now one body, crReadBodyText
// (create-fetch.js), and the callers keep everything that was ever
// POLITICAL about their downloads, delivered through a per-chunk hook:
// the service keeps its byte cap and session verdicts, its cap timer,
// its instance loop and its outcome taxonomy (proof-1246's timer seats
// are untouched); the pack keeps its two silence windows, its stall tag
// and its controller registry (proof-1249's seats re-pointed, claims
// unchanged - including check 18, whose sawByte assignment now stands
// in the pack's chunk hook). This proof grades the shared body itself:
// chunks accumulate in order and decode whole (a multi-byte character
// split across chunks survives - the reason the decode waits for the
// full body), the hook sees every chunk's running total before the
// chunk is kept, a verdict stops the read and cancels the reader, and
// a reader-less response reports the fallback instead of reading.
// Run from the repo root:  node tests/proof/proof-response-consumption.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const fetchJs = read('parts/create-fetch.js');
const citydata = read('parts/create-citydata.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

function extractFn(src, header) {
  const at = src.indexOf(header);
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0, str = null, esc = false, line = false, block = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === str) str = null; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { str = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return '';
}

// ---------- 1: one consumption body, two callers, no second reader loop ----------
const consumeFn = extractFn(fetchJs, 'async function crReadBodyText(');
check('1a: crReadBodyText exists in create-fetch.js with the reader loop and the whole-body decode',
  !!consumeFn && consumeFn.includes('reader.read()') && consumeFn.includes('new TextDecoder().decode(buf)'));
check('1b: the service consumes through it', extractFn(fetchJs, 'async function crOverpassFetch(').includes('crReadBodyText(r,'));
check('1c: the pack consumes through it, and no reader machinery survives in create-citydata.js',
  extractFn(citydata, 'async function crPackDownload(slug)').includes('crReadBodyText(r,')
  && !citydata.includes('getReader') && !citydata.includes('TextDecoder'));
check('1d: the streaming read loop survives exactly once across both files',
  (fetchJs.match(/reader\.read\(\)/g) || []).length === 1 && (citydata.match(/reader\.read\(\)/g) || []).length === 0);

// ---------- 2: the consumption's behaviour, run for real ----------
const out = await vm.runInNewContext(consumeFn + `
  const enc = new TextEncoder();
  function fakeResponse(chunks) {
    let i = 0, cancelled = 0, reads = 0;
    const reader = {
      read: async () => { reads++; return i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }; },
      cancel: async () => { cancelled++; },
    };
    return { res: { body: { getReader: () => reader } }, stats: () => ({ cancelled, reads }) };
  }
  (async () => {
    const out = {};
    // a two-byte character (e-acute) split across the chunk boundary
    const full = enc.encode('caf\\u00e9');
    const a = fakeResponse([full.slice(0, 4), full.slice(4)]);
    const totals = [];
    out.streamed = await crReadBodyText(a.res, (t) => { totals.push(t); return null; });
    out.totals = totals;
    const b = fakeResponse([enc.encode('ab'), enc.encode('cd'), enc.encode('ef')]);
    out.stopped = await crReadBodyText(b.res, (t) => t > 3 ? 'dense' : null);
    out.stoppedStats = b.stats();
    out.fallback = await crReadBodyText({ body: null }, null);
    const e = fakeResponse([]);
    out.empty = await crReadBodyText(e.res, null);
    return out;
  })();`, { TextEncoder, TextDecoder });
check('2a: a streamed body decodes whole - the split multi-byte character survives',
  out.streamed && out.streamed.text === 'café');
check('2b: the hook saw each chunk\u2019s running total before the chunk was kept', JSON.stringify(out.totals) === JSON.stringify([4, 5]));
check('2c: a verdict stops the read at the crossing chunk and cancels the reader',
  out.stopped && out.stopped.stopped === 'dense' && out.stoppedStats.cancelled === 1 && out.stoppedStats.reads === 2);
check('2d: a reader-less response reports the fallback without reading', !!out.fallback && out.fallback.fallback === true && !('text' in out.fallback));
check('2e: an empty stream decodes to empty text', !!out.empty && out.empty.text === '');

console.log(`proof-response-consumption: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
