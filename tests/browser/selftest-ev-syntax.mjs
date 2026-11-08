// Static syntax gate for page-code strings (Improvement Tranche 1,
// 2026-11-07). Origin: the improvement scan's Codex verify found that
// drive114's M6c check carried a // comment inside a single-line ev()
// template - in the cooked string the comment ate the rest of the
// expression, the page evaluation threw a SyntaxError, the drive's
// try/catch swallowed it as a fatal, and the drive reported PASS on
// 8 of its 23 checks while the remaining 15 never ran. No static check
// anywhere parse-checked the strings the drives send to the page.
//
// This gate statically extracts every ev()/ev2() call in
// tests/browser/*.mjs, cooks each template argument the way the drive
// itself would (escape processing; an interpolation that is exactly an
// in-file const string/number literal is substituted with that literal,
// which is the value the page would receive), and parse-checks the
// result with vm.Script - the same grammar Runtime.evaluate applies.
// Sites whose cooked string depends on runtime values (other
// interpolations, concatenated expressions, non-literal arguments) are
// DYNAMIC: counted and named below, never silently skipped and never
// failed - the gate's FAIL verdict covers only strings it can cook
// exactly and that do not parse.
//
// Verify cycle 1 (2026-11-07) corrected three soundness holes, each now
// pinned by a fixture below:
// (1) Cooking is PARTS-BASED: raw template text is escape-processed
//     exactly once; a substituted const value is a runtime value and is
//     inserted VERBATIM, never escape-processed a second time (a const
//     holding a backslash sequence was previously transformed, so a
//     broken page string could be counted as checked).
// (2) Const harvest runs over a comment/string/template/regex-blanked
//     CODE VIEW, top level (brace depth 0) only, and a name is
//     substituted ONLY when it has exactly one declaration in the whole
//     file and never appears as a function parameter - a shadowed,
//     commented-out, or parameter name classifies the site DYNAMIC.
// (3) Extraction ignores definitions (`function ev(`) and member calls
//     (`obj. ev(`), and RECURSES into template interpolations: a real
//     call nested inside another call's interpolation is extracted and
//     checked, not skipped. (Boundary: templates nested inside a
//     non-template expression segment are not recursed - such a segment
//     already classifies its site DYNAMIC.)
//
// Fixtures at the bottom prove the gate's own behaviour: a known-good
// file passes, a file carrying the drive114 shape FAILS by name, a
// dynamic file is classified not failed, and the three cycle-1 shapes
// (double-cook, scope/comment harvest, definition/member/nested
// extraction) behave exactly as specified. A gate that cannot fail is
// not a gate (the test-change rule).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------- cooking: JS escape processing for template/string raw text ----------
function cookRaw(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== '\\') { out += c; continue; }
    const n = raw[++i];
    if (n === undefined) { out += '\\'; break; }
    switch (n) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case '0': out += '\0'; break;
      case 'x': out += String.fromCharCode(parseInt(raw.substr(i + 1, 2), 16) || 0); i += 2; break;
      case 'u': {
        if (raw[i + 1] === '{') { const end = raw.indexOf('}', i + 2); out += String.fromCodePoint(parseInt(raw.slice(i + 2, end), 16) || 0); i = end; }
        else { out += String.fromCharCode(parseInt(raw.substr(i + 1, 4), 16) || 0); i += 4; }
        break;
      }
      case '\n': break; // line continuation
      case '\r': if (raw[i + 1] === '\n') i++; break;
      default: out += n; // \\ \` \$ \' \" and any other escaped char yield the char itself
    }
  }
  return out;
}

// ---------- mini-lexer helpers (comment / string / regex / template aware) ----------
const isWs = c => c === ' ' || c === '\t' || c === '\n' || c === '\r';
function skipLineComment(src, i) { const e = src.indexOf('\n', i); return e < 0 ? src.length : e; }
function skipBlockComment(src, i) { const e = src.indexOf('*/', i + 2); return e < 0 ? src.length : e + 2; }
function skipString(src, i) {
  const q = src[i]; i++;
  while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) return i + 1; i++; }
  return i;
}
function skipRegex(src, i) {
  i++; let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '[') inClass = true; else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) { i++; while (i < src.length && /[a-z]/i.test(src[i])) i++; return i; }
    else if (c === '\n') return i; // unterminated - bail at line end
    i++;
  }
  return i;
}
function skipTemplate(src, i) {
  i++; // opening backtick
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return i + 1;
    if (c === '$' && src[i + 1] === '{') { i = skipExpr(src, i + 2, true); continue; }
    i++;
  }
  return i;
}
// Skip a balanced expression starting just after an opening '${' (brace=true:
// stop after its matching close brace) or a call segment; string/comment/
// regex/template aware. Returns the index just past the balanced end.
function skipExpr(src, i, brace) {
  let depth = brace ? 1 : 0, par = 0, brk = 0;
  let prev = ''; // last significant char, for the regex-vs-divide heuristic
  while (i < src.length) {
    const c = src[i];
    if (isWs(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { i = skipLineComment(src, i); continue; }
    if (c === '/' && src[i + 1] === '*') { i = skipBlockComment(src, i); continue; }
    if (c === "'" || c === '"') { i = skipString(src, i); prev = 'x'; continue; }
    if (c === '`') { i = skipTemplate(src, i); prev = 'x'; continue; }
    if (c === '/' && !/[\w$\)\]\}]/.test(prev)) { i = skipRegex(src, i); prev = 'x'; continue; }
    if (brace) {
      if (c === '{') depth++;
      else if (c === '}') { depth--; i++; if (depth === 0) return i; prev = '}'; continue; }
    } else {
      if (c === '(') par++; else if (c === '[') brk++;
      else if (c === ')') { if (par === 0 && brk === 0) return i; par--; }
      else if (c === ']') brk--;
      else if (c === '+' && par === 0 && brk === 0) return i;
      else if (c === ',' && par === 0 && brk === 0) return i;
    }
    prev = c; i++;
  }
  return i;
}

// ---------- code view: comments / strings / templates / regexes blanked ----------
// Same length as the source (newlines preserved), so offsets and brace
// depth computed over the view are valid for the original text.
function codeView(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '; };
  let i = 0, prev = '';
  while (i < src.length) {
    const c = src[i];
    if (isWs(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = skipLineComment(src, i); blank(i, e); i = e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = skipBlockComment(src, i); blank(i, e); i = e; continue; }
    if (c === "'" || c === '"') { const e = skipString(src, i); blank(i, e); i = e; prev = 'x'; continue; }
    if (c === '`') { const e = skipTemplate(src, i); blank(i, e); i = e; prev = 'x'; continue; }
    if (c === '/' && !/[\w$\)\]\}]/.test(prev)) { const e = skipRegex(src, i); blank(i, e); i = e; prev = 'x'; continue; }
    prev = c; i++;
  }
  return out.join('');
}

// True when the initializer ENDS at the literal whose end is index p:
// the next significant token is a statement/declarator terminator (';',
// ','), or an ASI line boundary whose next line does not open with a
// continuation token (an operator character - '?' included, so a
// ternary split across the newline continues the initializer - or a
// word operator, 'in' / 'instanceof'). Trailing comments are
// stepped over.
function initializerEndsAt(src, p) {
  let q = p;
  while (q < src.length && (src[q] === ' ' || src[q] === '\t')) q++;
  if (q >= src.length) return true;
  const c = src[q];
  if (c === ';' || c === ',') return true;
  if (c === '/' && src[q + 1] === '/') return initializerEndsAt(src, skipLineComment(src, q));
  if (c === '/' && src[q + 1] === '*') return initializerEndsAt(src, skipBlockComment(src, q));
  if (c === '\n' || c === '\r') {
    let r = q;
    while (r < src.length && isWs(src[r])) r++;
    if (r >= src.length) return true;
    return !/[+\-*\/%.\[(`?]/.test(src[r]) && !src.startsWith('&&', r) && !src.startsWith('||', r) && !/^(?:in|instanceof)(?![\w$])/.test(src.slice(r));
  }
  return false;
}

// ---------- backward significant-token lookups (whitespace/comment aware) ----------
// The index of the last significant character before i (-1 when none).
// The walk steps over whitespace and block comments (hopped by their
// closing marker). Whenever the position it rests on sits at or after
// a line comment's // on that line (quote-guarded: no string quote
// before the //), the line's significant content ended just before
// the //, so the walk clamps there and continues upward - a comment's
// own text is never mistaken for code. That clamp is what the walk
// needs when it crosses a newline upward into a commented line
// (`obj. // note` then `ev(` on the next line: the significant token
// before the call is the '.', not the comment's last letter).
function prevSigPos(src, i) {
  let j = i - 1;
  for (;;) {
    while (j >= 0 && isWs(src[j])) j--;
    if (j < 0) return -1;
    if (j >= 1 && src[j] === '/' && src[j - 1] === '*') {
      const s = src.lastIndexOf('/*', j - 1);
      if (s < 0) return -1;
      j = s - 1; continue;
    }
    const ls = src.lastIndexOf('\n', j) + 1;
    const seg = src.slice(ls, j + 1);
    const ci = seg.indexOf('//');
    if (ci >= 0 && !/['"`]/.test(seg.slice(0, ci))) { j = ls + ci - 1; continue; }
    return j;
  }
}
// The last significant character before index i ('' when none).
function prevSig(src, i) {
  const j = prevSigPos(src, i);
  return j < 0 ? '' : src[j];
}
// The identifier word ending at the last significant position before i
// ('' when that position is not a word character).
function lastWordBefore(src, i) {
  const j = prevSigPos(src, i);
  if (j < 0 || !/[\w$]/.test(src[j])) return '';
  let s = j;
  while (s >= 0 && /[\w$]/.test(src[s])) s--;
  return src.slice(s + 1, j + 1);
}

// ---------- const-literal map ----------
// A name is harvestable ONLY when its single declaration in the whole
// file is a top-level (brace-depth 0) const with a string/number literal
// value, and the name never appears as a function parameter. Anything
// else - shadowed, commented-out, parameter, non-literal - is left out
// of the map, so interpolations using it classify DYNAMIC.
function constMap(src) {
  const view = codeView(src);
  const map = new Map();
  const params = new Set();
  const addParams = list => { for (const piece of list.split(',')) { const m = /^\s*(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)/.exec(piece); if (m) params.add(m[1]); } };
  for (const m of view.matchAll(/\bfunction\s*[\w$]*\s*\(([^()]*)\)/g)) addParams(m[1]);
  for (const m of view.matchAll(/\(([^()]*)\)\s*=>/g)) addParams(m[1]);
  for (const m of view.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) params.add(m[1]); // unparenthesized arrow parameter: `V => ...`
  const declCount = name => (view.match(new RegExp('\\b(?:const|let|var)\\s+' + name.replace(/\$/g, '\\$') + '\\b', 'g')) || []).length;
  for (const m of view.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=/g)) {
    const name = m[1];
    if (map.has(name)) continue;
    let depth = 0;
    for (const ch of view.slice(0, m.index)) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth !== 0) continue; // not a top-level declaration
    let p = m.index + m[0].length;
    while (p < src.length && isWs(src[p])) p++;
    let value = null, litEnd = -1;
    if (src[p] === "'" || src[p] === '"') { const e = skipString(src, p); value = cookRaw(src.slice(p + 1, e - 1)); litEnd = e; }
    else { const nm = /^\d+(?:\.\d+)?/.exec(src.slice(p)); if (nm) { value = nm[0]; litEnd = p + nm[0].length; } }
    if (value === null) continue;
    if (!initializerEndsAt(src, litEnd)) continue; // the literal is only a PREFIX of the initializer ('1' + '('): the value is not the literal - stays dynamic
    if (params.has(name) || declCount(name) !== 1) continue; // shadowed or parameter: ambiguous, stays dynamic
    map.set(name, value);
  }
  return map;
}

// ---------- template argument scan (parts-based cooking) ----------
// At src[i] === '`'. Raw template text accumulates as RAW parts (cooked
// exactly once at the end); a substituted const value is a runtime
// value and is inserted as a VERBATIM part - never re-cooked.
// Interpolations are also scanned recursively for nested ev()/ev2()
// call sites. Returns { end, cooked|null, dynamic, nested }.
function scanTemplateArg(src, i, consts, depth, lineOf) {
  i++;
  const parts = [], nested = [];
  let raw = '', dynamic = false;
  const flush = () => { if (raw) { parts.push({ raw: true, s: raw }); raw = ''; } };
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { raw += src.slice(i, i + 2); i += 2; continue; }
    if (c === '`') {
      flush();
      return { end: i + 1, cooked: dynamic ? null : parts.map(p => p.raw ? cookRaw(p.s) : p.s).join(''), dynamic, nested };
    }
    if (c === '$' && src[i + 1] === '{') {
      const start = i;
      i = skipExpr(src, i + 2, true);
      const span = src.slice(start + 2, i - 1);
      const inner = span.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(inner) && consts.has(inner)) { flush(); parts.push({ raw: false, s: consts.get(inner) }); continue; }
      dynamic = true;
      if (depth < 8) nested.push(...extractSites(span, consts, depth + 1, lineOf(start + 2)));
      continue;
    }
    raw += c; i++;
  }
  return { end: i, cooked: null, dynamic: true, nested }; // unterminated template
}

// Skip a statement template like skipTemplate, but collect ev()/ev2()
// sites nested inside its interpolations.
function skipTemplateCollect(src, i, consts, depth, lineOf) {
  i++;
  const nested = [];
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return { end: i + 1, nested };
    if (c === '$' && src[i + 1] === '{') {
      const start = i;
      i = skipExpr(src, i + 2, true);
      if (depth < 8) nested.push(...extractSites(src.slice(start + 2, i - 1), consts, depth + 1, lineOf(start + 2)));
      continue;
    }
    i++;
  }
  return { end: i, nested };
}

// Extract every ev()/ev2() call site from one source text.
// Site: { line, kind: 'static'|'dynamic', cooked?, why? }
function extractSites(src, consts = null, depth = 0, lineBase = 1) {
  if (!consts) consts = constMap(src);
  const sites = [];
  let i = 0, prev = '';
  const lineOf = idx => lineBase - 1 + src.slice(0, idx).split('\n').length;
  while (i < src.length) {
    const c = src[i];
    if (isWs(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { i = skipLineComment(src, i); continue; }
    if (c === '/' && src[i + 1] === '*') { i = skipBlockComment(src, i); continue; }
    if (c === "'" || c === '"') { i = skipString(src, i); prev = 'x'; continue; }
    if (c === '`') { const r = skipTemplateCollect(src, i, consts, depth, lineOf); sites.push(...r.nested); i = r.end; prev = 'x'; continue; }
    if (c === '/' && !/[\w$\)\]\}]/.test(prev)) { i = skipRegex(src, i); prev = 'x'; continue; }
    if ((c === 'e') && !/[\w$.]/.test(src[i - 1] || '')) {
      const word = src.startsWith('ev2', i) ? 'ev2' : (src.startsWith('ev', i) ? 'ev' : null);
      if (word) {
        // Not a call: a definition (`function ev(`) or a member call
        // (`obj.ev(` / `obj. ev(`) - decided by the previous significant
        // token, stepping over whitespace AND comments (an intervening
        // comment changes nothing grammatically).
        if (prevSig(src, i) === '.' || lastWordBefore(src, i) === 'function') { i += word.length; prev = 'x'; continue; }
        let j = i + word.length;
        while (j < src.length && isWs(src[j])) j++;
        if (src[j] === '(') {
          const site = { line: lineOf(i) };
          // parse the argument as '+'-joined segments
          let p = j + 1, segsStatic = true, cookedAll = '', whys = [];
          for (;;) {
            while (p < src.length && isWs(src[p])) p++;
            const ch = src[p];
            if (ch === '`') { const t = scanTemplateArg(src, p, consts, depth, lineOf); p = t.end; sites.push(...t.nested); if (t.dynamic) { segsStatic = false; whys.push('interpolation'); } else cookedAll += t.cooked; }
            else if (ch === "'" || ch === '"') { const e = skipString(src, p); cookedAll += cookRaw(src.slice(p + 1, e - 1)); p = e; }
            else if (/[0-9]/.test(ch || '')) { const m2 = /^\d+(?:\.\d+)?/.exec(src.slice(p)); cookedAll += m2[0]; p += m2[0].length; }
            else { const e = skipExpr(src, p, false); p = e; segsStatic = false; whys.push('expression'); }
            while (p < src.length && isWs(src[p])) p++;
            if (src[p] === '+') { p++; continue; }
            if (src[p] === ')') { p++; break; }
            // anything else (comma, EOF, malformed): classify dynamic, stop
            segsStatic = false; whys.push('unparsed'); break;
          }
          if (segsStatic) { site.kind = 'static'; site.cooked = cookedAll; }
          else { site.kind = 'dynamic'; site.why = whys.join('+'); }
          sites.push(site);
          i = p; prev = ')'; continue;
        }
      }
    }
    prev = c; i++;
  }
  return sites;
}

function scanDir(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mjs')).sort();
  const out = { files: files.length, sites: 0, staticChecked: 0, dynamics: [], failures: [] };
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const s of extractSites(src)) {
      out.sites++;
      if (s.kind === 'dynamic') { out.dynamics.push(`${f}:${s.line} (${s.why})`); continue; }
      out.staticChecked++;
      try { new vm.Script(s.cooked); }
      catch (e) { out.failures.push(`${f}:${s.line} - ${String(e.message).slice(0, 90)} [cooked ${s.cooked.length} chars]`); }
    }
  }
  return out;
}

// ---------- fixtures: the gate must be able to fail ----------
const FX = {
  'fx-good.mjs': [
    "const V = 'abc';",
    'const ev = async (s) => s;',
    'await ev(`1 + 1`);',
    "await ev(`document.title === '${V}'`);",
    "await ev(`window.__x = '` + 'se' + `t'`);",
    '',
  ].join('\n'),
  'fx-broken.mjs': [
    'const ev = async (s) => s;',
    'await ev(`(function(){ try { const a = 1; const b = a / 2; // a note that eats the tail const good = b > 0; return good; } catch (e) { return false; } })()`);',
    '',
  ].join('\n'),
  'fx-dynamic.mjs': [
    'let runtime = 3;',
    'const ev = async (s) => s;',
    'await ev(`window.__y = ${runtime}`);',
    'await ev(`prefix` + runtime);',
    'await ev(runtime);',
    'await ev(`ok ${JSON.stringify(runtime)}`);',
    '',
  ].join('\n'),
  // Cycle-1 finding 1: BS's runtime value is the 4 characters \x2f. The
  // page receives \x2f\x2f( verbatim - a SyntaxError. Double-cooking the
  // substituted value would turn it into //( and pass it as checked.
  'fx-doublecook.mjs': [
    "const BS = '\\\\x2f';",
    'const ev = async (s) => s;',
    'await ev(`${BS}${BS}(`);',
    '',
  ].join('\n'),
  // Cycle-1 finding 2 (+ cycle-2 refinements, + cycle-3 residual):
  // V is shadowed by an inner declaration, W exists only inside a
  // block comment, P is a parenthesized parameter, A is an
  // UNPARENTHESIZED arrow parameter, Q's literal is only the prefix
  // of its initializer, and Q2's literal is only the first branch of
  // a ternary split across a newline - none may be substituted;
  // every site must classify DYNAMIC.
  'fx-scope.mjs': [
    "const V = 'good';",
    'const ev = async (s) => s;',
    "function demo() { const V = 'shadow'; return ev(`${V}`); }",
    "/* const W = 'fromcomment'; */",
    'await ev(`${W}`);',
    "const P = 'top';",
    'const use = (P) => ev(`x${P}`);',
    "const A = 'top';",
    'const useA = A => ev(`y${A}`);',
    "const Q = '1' + '(';",
    'await ev(`${Q}`);',
    "const Q2 = '1'",
    " ? '(' : ')';",
    'await ev(`${Q2}`);',
    '',
  ].join('\n'),
  // Cycle-1 finding 3 (+ cycle-2 refinement, + cycle-3 residual):
  // the definition and the spaced member call are not call sites -
  // with or without an intervening comment, block OR line (the line
  // comment ends the previous line, so the lookback must clamp at
  // its // when crossing the newline); the call nested in the outer
  // call's interpolation IS a site (static, parses); the outer call
  // is dynamic.
  'fx-ident.mjs': [
    'const ev = async (s) => s;',
    'function ev(s) { return s; }',
    'const obj = { ev };',
    'obj. ev("(");',
    'obj. /* note */ ev("(");',
    'function /* note */ ev2(s) { return s; }',
    'obj. // note',
    'ev("(");',
    'function // note',
    'ev2(s) { return s; }',
    'await ev(`${await ev("1")}`);',
    '',
  ].join('\n'),
  'fx-nested-broken.mjs': [
    'const ev = async (s) => s;',
    'await ev(`${await ev(")(")}`);',
    '',
  ].join('\n'),
};
const EXPECT = {
  'fx-good.mjs': { static: 3, dynamic: 0, failures: 0 },
  'fx-broken.mjs': { static: 1, dynamic: 0, failures: 1 },
  'fx-dynamic.mjs': { static: 0, dynamic: 4, failures: 0 },
  'fx-doublecook.mjs': { static: 1, dynamic: 0, failures: 1 },
  'fx-scope.mjs': { static: 0, dynamic: 6, failures: 0 },
  'fx-ident.mjs': { static: 1, dynamic: 1, failures: 0 },
  'fx-nested-broken.mjs': { static: 1, dynamic: 1, failures: 1 },
};

let failures = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failures++; };

for (const [name, src] of Object.entries(FX)) {
  const ss = extractSites(src);
  const st = ss.filter(s => s.kind === 'static');
  const dy = ss.filter(s => s.kind === 'dynamic');
  const bad = st.filter(s => { try { new vm.Script(s.cooked); return false; } catch { return true; } });
  const e = EXPECT[name];
  console.log(`  fixture ${name}: ${ss.length} sites (${st.length} static, ${dy.length} dynamic, ${bad.length} failing)`);
  check(`fixture ${name}: exactly ${e.static} static / ${e.dynamic} dynamic / ${e.failures} failing`, st.length === e.static && dy.length === e.dynamic && bad.length === e.failures);
}

// ---------- the tree ----------
const tree = scanDir(HERE);
console.log(`ev-syntax census: ${tree.files} files, ${tree.sites} ev/ev2 sites, ${tree.staticChecked} statically cooked + parse-checked, ${tree.dynamics.length} dynamic (classified, listed below)`);
for (const d of tree.dynamics) console.log('  DYNAMIC ' + d);
for (const f of tree.failures) console.log('  SYNTAX-FAIL ' + f);
check(`tree: every statically cookable page expression parses (${tree.staticChecked} checked)`, tree.failures.length === 0);
check('tree: census is non-trivial (the extractor really swept the battery)', tree.staticChecked > 1000 && tree.sites > 1300);

console.log(failures === 0 ? 'EV-SYNTAX GATE: PASS' : `EV-SYNTAX GATE: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
