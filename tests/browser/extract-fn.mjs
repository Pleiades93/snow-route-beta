// Balanced-brace function extraction from source text: the one owner
// (fix_id: correct-extract-owner). Selftests lift shipped functions out
// of the parts with this; a local copy is a second place to drift.
export function extractFn(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('extract-fn: extraction failed: ' + sig + ' not found');
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); } }
  throw new Error('extract-fn: extraction failed: unbalanced ' + sig);
}
