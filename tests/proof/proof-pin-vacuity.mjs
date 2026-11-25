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

const LIT = String.raw`('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`;
const IDX = new RegExp(String.raw`\.indexOf\(\s*(` + LIT + String.raw`|[A-Za-z_$][\w$]*)\s*(?:,[^)]*)?\)`, 'g');
const IDX_GUARD = new RegExp(String.raw`\.indexOf\(\s*(` + LIT + String.raw`|[A-Za-z_$][\w$]*)\s*(?:,[^)]*)?\)\s*(?:>\s*-1|>=\s*0)`, 'g');
const INC = new RegExp(String.raw`\.includes\(\s*(` + LIT + String.raw`)\s*\)`, 'g');

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
      else if (c === '(') depth++;
      else if (c === ')') { depth--; if (!depth) break; }
    }
    out.push([m.index, text.slice(m.index, j + 1)]);
  }
  return out;
}

function constLiterals(text) {
  const d = {};
  const re = new RegExp(String.raw`\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(` + LIT + String.raw`)\s*;`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) d[m[1]] = m[2];
  return d;
}

const unquote = (tok) => (tok.length >= 2 && (tok[0] === "'" || tok[0] === '"') && tok[tok.length - 1] === tok[0]) ? tok.slice(1, -1) : tok;

function scanText(text) {
  const consts = constLiterals(text);
  const resolve = (tok) => unquote(consts[tok] || tok);
  const findings = [];
  for (const [off, stmt] of checkStatements(text)) {
    const calls = [];
    let m;
    IDX.lastIndex = 0;
    while ((m = IDX.exec(stmt)) !== null) calls.push([m.index, m.index + m[0].length, resolve(m[1])]);
    if (calls.length < 2) continue;
    const guardNeedles = new Set();
    IDX_GUARD.lastIndex = 0;
    while ((m = IDX_GUARD.exec(stmt)) !== null) guardNeedles.add(resolve(m[1]));
    INC.lastIndex = 0;
    while ((m = INC.exec(stmt)) !== null) {
      let b = m.index - 1;
      while (b >= 0 && /[\w$.]/.test(stmt[b])) b--;
      while (b >= 0 && (stmt[b] === ' ' || stmt[b] === '(')) b--;
      if (stmt[b] === '!') continue;
      const after = stmt.slice(m.index + m[0].length).trimStart();
      if (/^(===?\s*false|!==?\s*true)/.test(after)) continue;
      guardNeedles.add(unquote(m[1]));
    }
    const guarded = (n) => { for (const g of guardNeedles) if (n === g || g.includes(n)) return true; return false; };
    const hasOr = stmt.includes('||');
    const vacuous = new Map();
    const safe = new Set();
    for (let k = 0; k + 1 < calls.length; k++) {
      const between = stmt.slice(calls[k][1], calls[k + 1][0]);
      const mm = /^\s*\)*\s*(<=|>=|<|>)\s*\(*\s*[\w$.]*$/.exec(between);
      if (!mm) continue;
      const op = mm[1];
      if (op === '<' || op === '<=') {
        if (!vacuous.has(calls[k][2])) vacuous.set(calls[k][2], new Set());
        vacuous.get(calls[k][2]).add(op);
        if (op === '<') safe.add(calls[k + 1][2]);
      } else {
        if (!vacuous.has(calls[k + 1][2])) vacuous.set(calls[k + 1][2], new Set());
        vacuous.get(calls[k + 1][2]).add(op);
        if (op === '>') safe.add(calls[k][2]);
      }
    }
    for (const [needle, ops] of vacuous) {
      if (guarded(needle)) continue;
      if (!hasOr && safe.has(needle)) continue;
      findings.push({ line: text.slice(0, off).split('\n').length, ops: [...ops].join(','), needle: needle.slice(0, 64) });
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
