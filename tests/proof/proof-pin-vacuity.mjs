// proof-pin-vacuity.mjs - /correct block 5 (fix_id: correct-pin-vacuity).
// An ordering pin passes vacuously when its anchor needle is absent:
// indexOf gives -1, and any real position beats -1.
// This proof scans every live proof for that shape: the needle on the
// vacuous side of an ordering comparison must be presence-guarded in
// the same check (indexOf(n) > -1, or a non-negated includes() of it).
// This file is exempt from its own scan: a parser cannot reliably
// parse its own parser source.
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

const LIT = String.raw`('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|` + '`(?:[^`\\\\]|\\\\.)*`' + String.raw`)`;

function checkStatements(text) {
  const out = [];
  const re = /\bcheck\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let depth = 0, j = m.index + m[0].length - 1, instr = null, esc = false;
    for (; j < text.length; j++) {
      const c = text[j];
      if (instr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === instr) instr = null;
      } else if (c === "'" || c === '"' || c === '`') instr = c;
      else if (c === '/' && text[j + 1] === '/') { while (j < text.length && text[j] !== '\n') j++; }
      else if (c === '/' && text[j + 1] === '*') { const e = text.indexOf('*/', j + 2); j = e < 0 ? text.length : e + 1; }
      else if (c === '(') depth++;
      else if (c === ')') { depth--; if (!depth) break; }
    }
    out.push([m.index, text.slice(m.index, j + 1)]);
  }
  return out;
}

function blankComments(text) {
  const out = text.split('');
  let instr = null, esc = false;
  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if (instr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === instr) instr = null; continue; }
    if (c === "'" || c === '"' || c === '`') { instr = c; continue; }
    if (c === '/' && text[k + 1] === '/') { while (k < text.length && text[k] !== '\n') { out[k] = ' '; k++; } k--; continue; }
    if (c === '/' && text[k + 1] === '*') { const e = text.indexOf('*/', k + 2); const end = e < 0 ? text.length : e + 2; for (; k < end; k++) if (text[k] !== '\n') out[k] = ' '; k--; continue; }
  }
  return out.join('');
}

function constLiterals(text) {
  const d = {};
  const clean = blankComments(text);
  const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)\s*;/y;
  let depth = 0, instr = null, esc = false;
  for (let k = 0; k < clean.length; k++) {
    const c = clean[k];
    if (instr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === instr) instr = null; continue; }
    if (c === "'" || c === '"' || c === '`') { instr = c; continue; }
    if (c === '{') { depth++; continue; }
    if (c === '}') { depth--; continue; }
    if (depth === 0 && c === 'c') {
      re.lastIndex = k;
      const m = re.exec(clean);
      if (m) { d[m[1]] = m[2]; k += m[0].length - 1; }
    }
  }
  return d;
}

const unquote = (tok) => {
  if (!(tok.length >= 2 && (tok[0] === "'" || tok[0] === '"' || tok[0] === '`') && tok[tok.length - 1] === tok[0])) return tok;
  return tok.slice(1, -1).replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|u\{[0-9a-fA-F]+\}|.)/g, (s, e) => {
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e[0] === 'u' && e[1] === '{') return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (e[0] === 'u') return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e === '\n') return '';
    return { n: '\n', r: '\r', t: '\t', '0': '\0' }[e] ?? e;
  });
};

function scanText(text) {
  const consts = constLiterals(text);
  const negatedBefore = (stmt, idx) => {
    let b = idx - 1;
    while (b >= 0 && /[\w$.]/.test(stmt[b])) b--;
    while (b >= 0 && (stmt[b] === ' ' || stmt[b] === '(')) b--;
    return stmt[b] === '!';
  };
  const callEnd = (stmt, p) => {
    let depth = 1, j = p, instr = null, esc = false, bounded = false;
    for (; j < stmt.length; j++) {
      const c = stmt[j];
      if (instr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === instr) instr = null; }
      else if (c === "'" || c === '"' || c === '`') instr = c;
      else if (c === '(') depth++;
      else if (c === ')') { depth--; if (!depth) break; }
      else if (c === ',' && depth === 1) bounded = true;
    }
    return [j, bounded];
  };
  const parseNeedle = (stmt, p) => {
    const vals = [], toks = [];
    let q = p, expr = false;
    for (;;) {
      while (q < stmt.length && /\s/.test(stmt[q])) q++;
      const tk = new RegExp('^(?:' + LIT + '|[A-Za-z_$][\\w$]*)').exec(stmt.slice(q));
      if (!tk) return null;
      toks.push(tk[0]);
      if (tk[0][0] === '`' && tk[0].includes('${')) { vals.push(null); expr = true; }
      else if (tk[0][0] === "'" || tk[0][0] === '"' || tk[0][0] === '`') vals.push(unquote(tk[0]));
      else if (consts[tk[0]] !== undefined) vals.push(unquote(consts[tk[0]]));
      else vals.push(null);
      q += tk[0].length;
      let r = q;
      while (r < stmt.length && /\s/.test(stmt[r])) r++;
      if (stmt[r] !== '+') { q = r; break; }
      q = r + 1;
    }
    if (toks.length === 1) return [vals[0] !== null ? vals[0] : (expr ? '\u0001raw:' + toks[0] : '\u0001id:' + toks[0]), q];
    return [vals.every((v) => v !== null) ? vals.join('') : '\u0001raw:' + toks.join(' + '), q];
  };
  const findings = [];
  for (const [off, rawStmt] of checkStatements(text)) {
    const stmt = blankComments(rawStmt);
    const calls = [];
    const incNeedles = [];
    const methodAt = (name, at) => {
      if (!stmt.startsWith(name, at)) return -1;
      let p = at + name.length;
      while (p < stmt.length && /\s/.test(stmt[p])) p++;
      return stmt[p] === '(' ? p + 1 : -1;
    };
    let i = 0, instr = null, esc = false;
    while (i < stmt.length) {
      const c = stmt[i];
      if (instr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === instr) instr = null; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { instr = c; i++; continue; }
      if (c === '/' && stmt[i + 1] === '/') { while (i < stmt.length && stmt[i] !== '\n') i++; continue; }
      if (c === '/' && stmt[i + 1] === '*') { const e = stmt.indexOf('*/', i + 2); i = e < 0 ? stmt.length : e + 2; continue; }
      const idxAt = methodAt('.indexOf', i);
      if (idxAt > 0) {
        const pn = parseNeedle(stmt, idxAt);
        if (!pn) { i = idxAt; continue; }
        const [close, bounded] = callEnd(stmt, pn[1]);
        calls.push([i, close + 1, pn[0], bounded]);
        i = close + 1;
        continue;
      }
      const incAt = methodAt('.includes', i);
      if (incAt > 0) {
        const pn = parseNeedle(stmt, incAt);
        if (!pn) { i = incAt; continue; }
        const [close] = callEnd(stmt, pn[1]);
        const after = stmt.slice(close + 1).trimStart();
        if (!negatedBefore(stmt, i) && !/^(===?\s*false|!==?\s*true)/.test(after)) incNeedles.push(pn[0]);
        i = close + 1;
        continue;
      }
      i++;
    }
    if (calls.length < 2) continue;
    const guardNeedles = new Set(incNeedles);
    const boundedGuardNeedles = new Set();
    for (const c of calls) {
      if (!/^\s*(>\s*-1(?![\d.])|>=\s*0(?![\d.]))/.test(stmt.slice(c[1]))) continue;
      if (negatedBefore(stmt, c[0])) continue;
      (c[3] ? boundedGuardNeedles : guardNeedles).add(c[2]);
    }
    const guarded = (n) => { for (const g of guardNeedles) { if (n === g) return true; if (n[0] !== '\u0001' && g[0] !== '\u0001' && g.includes(n)) return true; } return false; };
    const hasOr = stmt.includes('||');
    const vacuous = new Map();
    const safe = new Set();
    for (let k = 0; k + 1 < calls.length; k++) {
      const between = stmt.slice(calls[k][1], calls[k + 1][0]);
      const mm = /^\s*\)*\s*(<=|>=|<|>)\s*\(*\s*[\w$.]*$/.exec(between);
      if (!mm) continue;
      const rawOp = mm[1];
      const op = negatedBefore(stmt, calls[k][0])
        ? { '<': '>=', '<=': '>', '>': '<=', '>=': '<' }[rawOp]
        : rawOp;
      if (op === '<' || op === '<=') {
        if (!vacuous.has(calls[k][2])) vacuous.set(calls[k][2], { ops: new Set(), bounded: false });
        vacuous.get(calls[k][2]).ops.add(op);
        if (calls[k][3]) vacuous.get(calls[k][2]).bounded = true;
        if (op === '<') safe.add(calls[k + 1][2]);
      } else {
        if (!vacuous.has(calls[k + 1][2])) vacuous.set(calls[k + 1][2], { ops: new Set(), bounded: false });
        vacuous.get(calls[k + 1][2]).ops.add(op);
        if (calls[k + 1][3]) vacuous.get(calls[k + 1][2]).bounded = true;
        if (op === '>') safe.add(calls[k][2]);
      }
    }
    for (const [needle, v] of vacuous) {
      if (v.bounded) {
        if (boundedGuardNeedles.has(needle)) continue;
      } else {
        if (guarded(needle)) continue;
        if (!hasOr && safe.has(needle)) continue;
      }
      findings.push({ line: text.slice(0, off).split('\n').length, ops: [...v.ops].join(','), needle: needle.replace(/^\u0001(id|raw):/, '').slice(0, 64) });
    }
  }
  return findings;
}

// ---------- (1) the scanner's fixtures ----------
const FIXTURES = [
  ['F1 the historical 1263 shape is flagged', `check('x', a.includes("setL(L.id, 'symbol-spacing', 250);") && a.indexOf("setL(L.id, 'symbol-spacing', 250);") > a.indexOf('LABEL RULE (Andrew, 1.294)'));`, 1],
  ['F2 an includes guard clears it', `check('x', a.includes('anchor text') && a.indexOf('write();') > a.indexOf('anchor text'));`, 0],
  ['F3 a guarded chain head clears the chain', `check('x', a.indexOf('## Beta 2') > -1 && a.indexOf('## Beta 2') < a.indexOf('## Beta 1'));`, 0],
  ['F4 a same-needle presence clause clears it', `check('x', a.indexOf('first') >= 0 && a.indexOf('first') < a.indexOf('second'));`, 0],
  ['F5 an unguarded left of < is flagged', `check('x', a.indexOf('gone') < a.indexOf('here'));`, 1],
  ['F6 a slice window is not an ordering pin', `check('x', a.slice(a.indexOf('start'), a.indexOf('end')).includes('mid'));`, 0],
  ['F7 a || statement loses the safe-side pass', `check('x', a.indexOf('gone') < a.indexOf('here') || other);`, 1],
  ['F8 a longer includes needle guards its substring', `check('x', a.includes("crPrepState === 'ready') return { label: '' };") && a.indexOf("crPrepState === 'ready')") < a.indexOf('zoom'));`, 0],
  ['F9 a const needle resolves and its guard counts', `const CLIP = 'clip guard';\ncheck('x', a.indexOf(CLIP) > -1 && a.indexOf(CLIP) < a.indexOf('boundary'));`, 0],
  ['F10 a const needle unguarded is flagged', `const CLIP = 'clip guard';\ncheck('x', a.indexOf('boundary') > a.indexOf(CLIP));`, 1],
  ['F11 a negated includes is not a guard', `check('x', !a.includes('clip guard') || a.indexOf('clip guard') < a.indexOf('boundary'));`, 1],
  ['F12 an inverted includes is not a guard', `check('x', a.includes('clip guard') === false || a.indexOf('clip guard') < a.indexOf('boundary'));`, 1],
  ['F13 mutual non-strict pins share no safe side', `check('x', a.indexOf('left') <= a.indexOf('right') && a.indexOf('right') <= a.indexOf('left'));`, 2],
  ['F14 mutual strict pins guard each other', `check('x', a.indexOf('left') < a.indexOf('right') && a.indexOf('right') < a.indexOf('left'));`, 0],
  ['F15 a parenthesized right operand is still a pin', `check('x', a.indexOf('write();') > (a.indexOf('anchor')));`, 1],
  ['F16 a parenthesized left operand is still a pin', `check('x', (a.indexOf('gone')) < a.indexOf('here'));`, 1],
  ['F17 a negated comparison lends no safe side', `check('x', !(a.indexOf('left') < a.indexOf('right')) && a.indexOf('right') < a.indexOf('left'));`, 1],
  ['F18 a negated comparison flips its vacuous side', `check('x', !(a.indexOf('left') < a.indexOf('right')));`, 1],
  ['F19 a negated indexOf guard is not a guard', `check('x', !(a.indexOf('gone') > -1) && a.indexOf('gone') < a.indexOf('here'));`, 1],
  ['F20 a bounded search is not cleared by a plain includes', `check('x', a.includes('anchor') && a.indexOf('write();') > a.indexOf('anchor', 10));`, 1],
  ['F21 a bounded guard clears its bounded pin', `check('x', a.indexOf('anchor', 10) > -1 && a.indexOf('write();') > a.indexOf('anchor', 10));`, 0],
  ['F22 a bounded left of < is flagged', `check('x', a.indexOf('gone', 3) < a.indexOf('here'));`, 1],
  ['F23 a needle wrapped onto its own line is still a pin', "check('x', a.indexOf('write();') > a.indexOf(\n'anchor'));", 1],
  ['F24 a > -10 clause is not a presence guard', `check('x', a.indexOf('anchor') > -10 && a.indexOf('write();') > a.indexOf('anchor'));`, 1],
  ['F25 indexOf text inside a needle is not an operand', `check('x', a.indexOf("foo.indexOf('bar')") > a.indexOf('anchor'));`, 1],
  ['F26 a concatenated needle resolves whole', `check('x', a.includes('an') && a.indexOf('write();') > a.indexOf('an' + 'chor'));`, 1],
  ['F27 a guard on the whole concatenated needle clears it', `check('x', a.includes('anchor') && a.indexOf('write();') > a.indexOf('an' + 'chor'));`, 0],
  ['F28 a comment between operands does not hide the pin', `check('x', a.indexOf('write();') /* ) */ > a.indexOf('anchor'));`, 1],
  ['F29 comment text inside a string is not a comment', `check('x // not a comment', a.indexOf('write();') > a.indexOf('anchor'));`, 1],
  ['F30 an unresolved identifier is not its name', `check('x', a.includes('needle') && a.indexOf('write();') > a.indexOf(needle));`, 1],
  ['F31 a guard on the same identifier clears it', `check('x', a.indexOf(V) > -1 && a.indexOf('write();') > a.indexOf(V));`, 0],
  ['F32 an identifier guard does not clear a prefix identifier', `check('x', a.includes(needleLong) && a.indexOf('write();') > a.indexOf(needle));`, 1],
  ['F33 a commented-out const does not resolve', "// const needle = 'present';\ncheck('x', a.includes('present') && a.indexOf('write();') > a.indexOf(needle));", 1],
  ['F34 an escape in a guard is decoded before comparing', "check('x', a.includes('\\n') && a.indexOf('write();') > a.indexOf('n'));", 1],
  ['F35 a const inside another scope does not resolve', "function unused() { const needle = 'present'; }\ncheck('x', a.includes('present') && a.indexOf('write();') > a.indexOf(needle));", 1],
  ['F36 whitespace before the parenthesis keeps the operand', `check('x', a.indexOf('write();') > a.indexOf ('anchor'));`, 1],
  ['F37 a template-literal needle is an operand', "check('x', a.indexOf('write();') > a.indexOf(`anchor`));", 1],
];
for (const [name, src, want] of FIXTURES) {
  const got = scanText(src).length;
  check(name + ' (want ' + want + ', got ' + got + ')', got === want);
}

// ---------- (2) the live suite scan ----------
const manifest = JSON.parse(read('tests/proof/manifest.json'));
const retired = new Set((manifest.retired || []).map((e) => e.file));
const SELF = 'proof-pin-vacuity.mjs';
const files = readdirSync(new URL('tests/proof/', root)).filter((f) => f.startsWith('proof-') && f.endsWith('.mjs') && f !== SELF && !retired.has(f)).sort();
check('the scan covers the live proof suite (found ' + files.length + ')', files.length >= 90);
for (const f of files) {
  const findings = scanText(read('tests/proof/' + f));
  check('no unguarded ordering pin in ' + f + (findings.length ? ' - ' + JSON.stringify(findings) : ''), findings.length === 0);
}

console.log(`proof-pin-vacuity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
