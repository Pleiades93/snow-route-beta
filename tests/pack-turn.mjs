// Shared by the two pack-cache proofs: extract
// takePackWriteTurn from the concatenated parts lines,
// brace-balanced (its source spans several lines).
export function extractTurn(lines) {
  const start = lines.findIndex(l => l.includes('async function takePackWriteTurn'));
  if (start < 0) throw new Error('takePackWriteTurn not found in parts/app4.js + parts/app5.js');
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error('takePackWriteTurn end not found');
  return lines.slice(start, end + 1).join('\n');
}
