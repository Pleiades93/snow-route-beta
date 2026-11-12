// Foreign-write census (Improvement Tranche 2, 2026-11-07). The app is
// assembled from parts that share ONE top-level scope, so a part can
// write another part's top-level bindings - the cross-file coupling the
// drive compatibility surface (docs/TESTING.md) is built on. This gate
// pins that coupling exactly: any new foreign write, any removed one,
// and any moved one fails here until the census is deliberately
// regenerated and the change reviewed.
//
// COUNTING RULE (verbatim, also carried in the census JSON):
//  - Universe: the app part files parts/app1.js, app2.js, app3.js,
//    app4.js, create-packs.js, create-fetch.js, create-citydata.js,
//    create-cache.js, create-pick.js, create-save.js, engine.js
//    (data.js and pmstyles.js excluded - data/generated: data.js is
//    route-pack DATA, pmstyles.js is the generated basemap styles;
//    neither is app logic). A binding's OWNER is the part file holding
//    its top-level declaration (let/var/const/function/async function,
//    incl. multi-declarator statements) - EXCEPT the six create-*.js
//    files, which form ONE owner group labelled 'create.js' (the
//    historical part name; Tranche 3 sub-ship B1 split create.js six
//    ways): a binding declared in any create-*.js file is owned by
//    that group, and a write is foreign only when the target's owner
//    group differs from the writing file's owner group. Site records
//    keep the CONCRETE file holding the write.
//  - A FOREIGN WRITE is an assignment or update expression - operators
//    =, +=, -=, *=, /=, %=, **=, ++, -- (prefix or postfix) - whose
//    target is a BARE identifier (not a member expression: `obj.x =`
//    and `this.x =` never count; a declaration initializer never
//    counts) that resolves, through lexical scope, to a top-level
//    binding owned by a DIFFERENT part file or owner group.
//  - Scope resolution: mask comments and string/template literals first
//    (template ${} interpolations are code); track scopes by braces
//    with the declarations each scope introduces (function/async-
//    function params incl. destructured names, arrow params incl. bare
//    single params, let/const/var declarators at any depth, function
//    declarations, catch params). An identifier assigned inside a scope
//    that redeclares it is LOCAL, not foreign. Destructuring assignment
//    targets ([a,b]= / ({a}=)) count per bound identifier.
//    `for (const x of ...)` declares; `for (x of ...)` with a bare
//    known identifier ASSIGNS.
//  - The census record = the sorted list of sites {file, line, name,
//    owner} + totals; line numbers are those of the current tree. This
//    selftest recomputes and compares EXACTLY; a deliberate census
//    update = regenerate the JSON via this file's --write mode (the
//    regeneration is a human-reviewed act, never automatic in CI).
//
// ADJUDICATION NOTES (counting-rule decisions, builder, 2026-11-07):
//  - engine.js: only GLP is declared at engine.js top level; everything
//    else in that file lives inside the GLP arrow closure, whose writes
//    to its own locals are LOCAL by the scope rule - they are not
//    foreign writes, and app globals reached through the GL_HOST host
//    object are member reads/writes (H.x), never bare targets. So
//    engine.js contributes its closure locals to NO owner map beyond
//    GLP, and a bare write inside engine.js to a name it does not
//    declare resolves outward to the owning app part as usual.
//  - Writes to never-declared implicit globals (a bare target with no
//    top-level declaration in ANY universe file) have no owner and are
//    NOT counted: the census is a record of cross-file coupling between
//    declared bindings. Any such names the analyzer meets are printed
//    by the --write run so the decision stays visible.
//  - Logical assignment (&&=, ||=, ??=) is not in the rule's operator
//    list and is not counted.
//
// PROVEN SCOPE AND KNOWN LIMITATIONS (claim narrowed 2026-11-08 by
// Andrew's decision, after Codex verify cycle 4 confirmed the cycle-3
// fixes and found the two residuals below; no further analyzer fix
// round was authorized - the claim is narrowed to what is proven
// instead, per the doctrine that a test's stated claim must never
// exceed its implemented predicate):
//  - What this gate PROVES: the census recomputed over the app parts
//    as written equals the pinned census JSON exactly, and the
//    analyzer reads every shape exercised by the fixture set below
//    exactly as the fixtures state. On the parts as written the
//    census is exact - four Codex verify cycles (2026-11-07/08)
//    recomputed 68 expressions / 32 lines against the same pin.
//  - What it does NOT claim: statementEnd's statement-boundary logic
//    is a hand-rolled subset of the JS grammar, proven only for the
//    shapes in the fixture set. Two shapes are KNOWN MISREADS, each
//    pinned below as a KNOWN LIMITATION fixture asserting the
//    analyzer's current (wrong) reading, with the correct semantics
//    stated in its comment:
//    (L1) a prefix ++/-- directly after a prefix-operator keyword at
//         a line break inside a brace-less loop body -
//         `for(let ext of []) typeof ++` / newline / `obj[ext=1];`
//         currently reads 1 site; the correct reading is 0, because
//         the `ext = 1` write sits inside the loop body and targets
//         the loop's own `let ext`, so it is local. `typeof`
//         tokenizes as an identifier, so isPostfixUpdate mistakes
//         the prefix ++ for a postfix update and statementEnd ends
//         the body at the break. `void --` misreads the same way.
//    (L2) a bare `yield` as a brace-less loop body whose operand
//         opens on the next line - `function* f(){for(let ext of
//         []) yield` / newline / `(ext=2);}` currently reads 0
//         sites; the correct reading is 1, because `yield` is a
//         restricted production (no LineTerminator may precede its
//         operand), so the statement ends at the break, the loop
//         body is `yield;` alone, and `(ext=2);` is a foreign write
//         after the loop. The analyzer depth-counts the opener (and
//         `(`/`[` sit in CONTINUES) before the ASI judgement can
//         fire, so the write stays inside the loop region and
//         resolves to the loop's `ext`. The `[` form misreads too.
//  - Neither shape occurs in the app parts (grep-verified
//    2026-11-08: no prefix-operator keyword is followed by ++/-- in
//    code anywhere in parts/ - the one textual hit is a comment
//    banner - `yield` appears only in prose comments, and parts/
//    contains no generator functions). If a future part change
//    introduces either shape, this gate can miscount it until the
//    shape joins the fixture set; the limitation fixtures exist so
//    that any analyzer change that alters these readings fails
//    loudly here and forces this note to be revisited.
//
// Fixtures below prove the analyzer's own behaviour on synthetic
// mini-cases with exact expected counts (a gate that cannot fail is
// not a gate). Two of them are the KNOWN LIMITATION cases above: they
// pin readings known to be semantically wrong, so a future analyzer
// change cannot alter those readings silently. The tree census is
// then recomputed and compared exactly against
// tests/browser/fixtures/foreign-writes-census.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const UNIVERSE = ['app1.js', 'app2.js', 'app3.js', 'app4.js', 'create-packs.js', 'create-fetch.js', 'create-citydata.js', 'create-cache.js', 'create-pick.js', 'create-save.js', 'engine.js'];
const CREATE_FAMILY = new Set(['create-packs.js', 'create-fetch.js', 'create-citydata.js', 'create-cache.js', 'create-pick.js', 'create-save.js']);
const ownerGroup = (f) => CREATE_FAMILY.has(f) ? 'create.js' : f; // the six create-*.js files are ONE owner group, labelled by the historical part name
const CENSUS_PATH = path.join(HERE, 'fixtures', 'foreign-writes-census.json');
const RULE = 'Universe: parts/app1.js, app2.js, app3.js, app4.js, create-packs.js, create-fetch.js, create-citydata.js, create-cache.js, create-pick.js, create-save.js, engine.js (data.js and pmstyles.js excluded - data/generated). Owner = the part file holding a binding\'s top-level declaration, except the six create-*.js files form ONE owner group labelled create.js (the historical part name): a binding declared in any create-*.js file is owned by that group, and a write is foreign iff the target\'s owner group differs from the writing file\'s owner group; site records keep the concrete file holding the write. A FOREIGN WRITE is an assignment/update expression (=, +=, -=, *=, /=, %=, **=, ++, -- prefix or postfix) whose target is a bare identifier (not a member expression; a declaration initializer never counts) resolving through lexical scope to a top-level binding owned by a different part file or owner group. Comments/strings/templates masked (interpolations are code); scopes tracked by braces with their declarations (function/arrow/catch params, let/const/var at any depth, function declarations). Destructuring assignment targets count per bound identifier; for (x of ...) with a bare identifier assigns.';

// ---------------- tokenizer (comments/strings masked; templates: interpolations are code) ----------------
const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'function', 'var', 'let', 'const', 'new', 'delete', 'typeof', 'void', 'in', 'of', 'instanceof', 'try', 'catch', 'finally', 'throw', 'class', 'extends', 'super', 'this', 'null', 'true', 'false', 'undefined', 'yield', 'async', 'await', 'static', 'get', 'set', 'export', 'import', 'from']);
// Words that can never be BINDING names. get/set/async/static are
// deliberately absent: they are contextual keywords and valid binding
// names (validateSnap declares `const set = ...` in app3 - treating
// 'set' as a keyword aborted that declarator list mid-statement and
// its later declarators were misread as foreign writes; fixture-pinned
// by the tree census count itself, 69 vs the adjudicated 68).
const BIND_KEYWORDS = new Set([...KEYWORDS].filter(w => !['get', 'set', 'async', 'static'].includes(w)));
const PUNCTS = ['>>>=', '...', '**=', '<<=', '>>=', '&&=', '||=', '??=', '===', '!==', '>>>', '**', '++', '--', '+=', '-=', '*=', '%=', '==', '!=', '>=', '<=', '&&', '||', '??', '=>', '<<', '>>', '?.', '&=', '|=', '^=', '/='];
function tokenize(src) {
  const toks = [];
  let i = 0, line = 1;
  const stack = [{ mode: 'code', interp: false, braces: 0 }];
  const prevVal = () => (toks.length ? toks[toks.length - 1].v : '');
  const prevType = () => (toks.length ? toks[toks.length - 1].t : '');
  while (i < src.length) {
    const ctx = stack[stack.length - 1], c = src[i];
    if (ctx.mode === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') { line++; i++; continue; }
      if (c === '`') { stack.pop(); i++; continue; }
      if (c === '$' && src[i + 1] === '{') { stack.push({ mode: 'code', interp: true, braces: 0 }); toks.push({ t: 'punct', v: '{', line }); i += 2; continue; }
      i++; continue;
    }
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; for (let k = i; k < end; k++) if (src[k] === '\n') line++; i = end; continue; }
    if (c === "'" || c === '"') { let j = i + 1; while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) { j++; break; } if (src[j] === '\n') break; j++; } toks.push({ t: 'str', v: 'str', line }); i = j; continue; }
    if (c === '`') { toks.push({ t: 'str', v: 'tpl', line }); stack.push({ mode: 'tpl' }); i++; continue; }
    if (c === '/') {
      const pv = prevVal(), pt = prevType();
      const regexOk = !toks.length || (pt !== 'id' && pt !== 'num' && pt !== 'str' && ![')', ']', '}'].includes(pv)) || ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'instanceof', 'do', 'else'].includes(pv);
      if (regexOk) { let j = i + 1, inClass = false; while (j < src.length) { const ch = src[j]; if (ch === '\\') { j += 2; continue; } if (ch === '[') inClass = true; else if (ch === ']') inClass = false; else if (ch === '/' && !inClass) { j++; break; } else if (ch === '\n') break; j++; } while (j < src.length && /[a-z]/i.test(src[j])) j++; toks.push({ t: 'str', v: 'regex', line }); i = j; continue; }
      if (src[i + 1] === '=') { toks.push({ t: 'punct', v: '/=', line }); i += 2; continue; }
      toks.push({ t: 'punct', v: '/', line }); i++; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) { const m = /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(src.slice(i)); toks.push({ t: 'num', v: m[0], line }); i += m[0].length; continue; }
    if (/[A-Za-z_$]/.test(c)) { const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i)); toks.push({ t: 'id', v: m[0], line }); i += m[0].length; continue; }
    if (c === '{') { const top = stack[stack.length - 1]; if (top.interp) top.braces++; toks.push({ t: 'punct', v: '{', line }); i++; continue; }
    if (c === '}') { const top = stack[stack.length - 1]; if (top.interp && top.braces === 0) { stack.pop(); toks.push({ t: 'punct', v: '}', line }); i++; continue; } if (top.interp) top.braces--; toks.push({ t: 'punct', v: '}', line }); i++; continue; }
    let matched = null;
    for (const p of PUNCTS) if (src.startsWith(p, i)) { matched = p; break; }
    if (matched) { toks.push({ t: 'punct', v: matched, line }); i += matched.length; continue; }
    toks.push({ t: 'punct', v: c, line }); i++;
  }
  return toks;
}

// ---------------- scope analysis ----------------
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=']);
const OPEN = { '(': ')', '[': ']', '{': '}' }, CLOSE = { ')': '(', ']': '[', '}': '{' };
function matchClose(toks, openIdx) { let d = 0; for (let j = openIdx; j < toks.length; j++) { const v = toks[j].v; if (OPEN[v]) d++; else if (CLOSE[v]) { d--; if (!d) return j; } } return toks.length - 1; }
function matchOpen(toks, closeIdx) { let d = 0; for (let j = closeIdx; j >= 0; j--) { const v = toks[j].v; if (CLOSE[v]) d++; else if (OPEN[v]) { d--; if (!d) return j; } } return 0; }
// Tokens that let an expression continue across a newline, so ASI
// never fires beside them: binary/unary operators, assignment ops,
// '.', '?.', call/index openers, ',', the '?' ':' pair and '=>'. The
// continuation principle is the tranche-1 gates': an expression
// continues while an operator or opener still expects its other side.
// Postfix ++/-- are restricted productions (a newline before them ends
// the statement), so they are deliberately NOT continuers.
const CONTINUES = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '&&=', '||=', '??=', '+', '-', '*', '/', '%', '**', '&&', '||', '??', '&', '|', '^', '<<', '>>', '>>>', '<', '>', '<=', '>=', '==', '!=', '===', '!==', 'in', 'instanceof', ',', '.', '?.', '(', '[', '?', ':', '=>']);
// Fix round 3 (Codex verify cycle-3 residuals, 2026-11-08; grammar
// adjudicated against V8 in-round, probes recorded in the tranche
// STATUS-NOTE): two refinements of the rule above.
//  - PREFIX_BEFORE: tokens after which a statement can NEVER end,
//    because a prefix operator still requires its operand across the
//    break ('typeof'/'void'/'delete' keywords, 'new', 'await', the
//    symbol prefixes '!'/'~' - '+'/'-' already sit in CONTINUES - and
//    '++'/'--' in prefix position). 'yield' is deliberately ABSENT:
//    its operand is a restricted production ([no LineTerminator
//    here]), proven by probe ('yield\n1' yields undefined).
//  - After a POSTFIX ++/-- the member/call/index/template continuers
//    ('.', '?.', '(', '[', template) can no longer continue the
//    expression - an UpdateExpression is not a MemberExpression base
//    ('a++[b]', 'a++(b)', 'a++.b', 'a++`t`' are all SyntaxErrors on one
//    line, and ASI ends the statement before them across a break) -
//    while the operator class still can ('a++ + b', 'a++ ? x : y',
//    'a++, b' all span a break). OPERATOR_CONTINUES is CONTINUES
//    minus that member class (and '=>', which cannot follow an
//    update expression either).
const PREFIX_BEFORE = new Set(['typeof', 'void', 'delete', 'new', 'await', '!', '~', '++', '--']);
const OPERATOR_CONTINUES = new Set([...CONTINUES].filter(t => !['.', '?.', '(', '[', '=>'].includes(t)));
// Is toks[i] a POSTFIX ++/--? It is when it is not the statement's
// first token (a statement-initial ++/-- is prefix) and the token
// before it can end an operand (identifier, number, string/template,
// ')' or ']').
function isPostfixUpdate(toks, i, s) {
  const v = toks[i].v;
  if (v !== '++' && v !== '--') return false;
  if (i <= s) return false;
  const p = toks[i - 1];
  return p.t === 'id' || p.t === 'num' || p.t === 'str' || p.v === ')' || p.v === ']';
}
// End token (inclusive) of the statement starting at token s. Used to
// bound a for statement's scope to its header + body: '{...}' bodies
// end at the matching brace; keyword statements recurse through their
// own bodies; anything else ends at its depth-0 ';' (or just before a
// depth-0 closer, for a semicolon-less last statement), honouring ASI:
// a depth-0 newline ends an expression statement when neither the
// token after the break nor the token before it can continue the
// expression (see CONTINUES above; a template literal after the break
// continues it as a tagged template, and the fix-round-3 sets above
// refine the postfix and prefix-operator positions).
function statementEnd(toks, s) {
  if (s >= toks.length) return toks.length - 1;
  const v = toks[s].v;
  if (v === '{') return matchClose(toks, s);
  if (v === ';') return s;
  if (v === 'function' || v === 'class') {
    let j = s + 1;
    while (j < toks.length && toks[j].v !== '(' && toks[j].v !== '{') j++;
    if (toks[j] && toks[j].v === '(') j = matchClose(toks, j) + 1;
    if (toks[j] && toks[j].v === '{') return matchClose(toks, j);
    return j - 1;
  }
  if (v === 'for' || v === 'while' || v === 'switch') {
    let open = s + 1;
    if (toks[open] && toks[open].v === 'await') open++;
    if (toks[open] && toks[open].v === '(') return statementEnd(toks, matchClose(toks, open) + 1);
    return s;
  }
  if (v === 'if') {
    if (toks[s + 1] && toks[s + 1].v === '(') {
      const thenEnd = statementEnd(toks, matchClose(toks, s + 1) + 1);
      if (toks[thenEnd + 1] && toks[thenEnd + 1].v === 'else') return statementEnd(toks, thenEnd + 2);
      return thenEnd;
    }
    return s;
  }
  if (v === 'do') {
    const bodyEnd = statementEnd(toks, s + 1);
    let j = bodyEnd + 1;
    if (toks[j] && toks[j].v === 'while' && toks[j + 1] && toks[j + 1].v === '(') { j = matchClose(toks, j + 1); if (toks[j + 1] && toks[j + 1].v === ';') j++; return j; }
    return bodyEnd;
  }
  if (v === 'try') {
    let end = statementEnd(toks, s + 1);
    let j = end + 1;
    while (toks[j] && (toks[j].v === 'catch' || toks[j].v === 'finally')) {
      if (toks[j].v === 'catch' && toks[j + 1] && toks[j + 1].v === '(') j = matchClose(toks, j + 1) + 1; else j++;
      if (toks[j] && toks[j].v === '{') { end = matchClose(toks, j); j = end + 1; } else break;
    }
    return end;
  }
  let d = 0;
  for (let j = s; j < toks.length; j++) {
    const w = toks[j].v;
    // Fix round 3: after a postfix ++/--, a member opener on the next
    // line cannot continue the expression, so the statement ends
    // BEFORE the opener is depth-counted - the ASI branch below is
    // else-if-chained behind the opener handling and would never see
    // a '[' or '(' sitting at depth 0.
    if (d === 0 && j > s && toks[j].line > toks[j - 1].line && isPostfixUpdate(toks, j - 1, s) && !OPERATOR_CONTINUES.has(w)) return j - 1;
    if (OPEN[w]) d++;
    else if (CLOSE[w]) { if (d === 0) return j - 1; d--; }
    else if (d === 0 && w === ';') return j;
    else if (d === 0 && j > s && toks[j].line > toks[j - 1].line) { // ASI (see above)
      const prev = toks[j - 1].v;
      if (!CONTINUES.has(w) && w !== 'tpl' && !CONTINUES.has(prev) && !PREFIX_BEFORE.has(prev)) return j - 1;
    }
  }
  return toks.length - 1;
}
// Bound names inside a pattern range (declarator pattern / params):
// an identifier is bound unless it is a property key (followed by ':'),
// a member part (preceded by '.'), a keyword, or inside a default-value
// expression (after '=' at the same pattern nesting until ',' resets).
function patternNames(toks, a, b) {
  const out = [];
  let inDefault = false;
  for (let j = a; j <= b && j < toks.length; j++) {
    const tk = toks[j], v = tk.v;
    if (v === ',') { inDefault = false; continue; }
    if (v === '=' ) { inDefault = true; continue; }
    if (inDefault) continue;
    if (tk.t !== 'id' || BIND_KEYWORDS.has(v)) continue;
    const prev = toks[j - 1], next = toks[j + 1];
    if (prev && prev.v === '.') continue;
    if (next && next.v === ':') continue;
    out.push({ name: v, tok: j });
  }
  return out;
}
function skipInitializer(toks, j) { // from just after '=': stop AT the depth-0 ',' / ';' / ')' / of / in
  let d = 0;
  while (j < toks.length) {
    const tk = toks[j], v = tk.v;
    if (d === 0 && (v === ',' || v === ';' || v === ')')) return j;
    if (d === 0 && tk.t === 'id' && (v === 'of' || v === 'in') && toks[j - 1].v !== '.') return j;
    if (OPEN[v]) d++; else if (CLOSE[v]) { if (d === 0) return j; d--; }
    j++;
  }
  return j;
}

function analyzeSource(src) {
  const toks = tokenize(src);
  const regions = [{ id: 0, start: -1, end: Number.MAX_SAFE_INTEGER, kind: 'root', isFunction: true }];
  const declEvents = []; // {name, tok, scope}
  const declNameToks = new Set();
  const initEqToks = new Set();
  const pendingByBrace = new Map(); // brace token idx -> [{name, tok}]
  const funcBraceIdx = new Set(); // brace token idx of function/arrow/method bodies (NOT catch)
  const forHeaders = []; // {open, close, id} of each for statement's (...) header
  const braceStack = [0];
  const tokBraceRegion = new Array(toks.length).fill(0);
  const addDecl = (name, tok, scope) => { declEvents.push({ name, tok, scope }); declNameToks.add(tok); };
  const queueParams = (braceIdx, names, isFunc) => { if (braceIdx == null) return; if (isFunc) funcBraceIdx.add(braceIdx); if (!names.length) return; const arr = pendingByBrace.get(braceIdx) || []; arr.push(...names); pendingByBrace.set(braceIdx, arr); };

  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i], v = tk.v;
    tokBraceRegion[i] = braceStack[braceStack.length - 1];
    if (v === '{') {
      const id = regions.length;
      regions.push({ id, start: i, end: Number.MAX_SAFE_INTEGER, kind: 'brace', isFunction: funcBraceIdx.has(i) });
      braceStack.push(id);
      const pend = pendingByBrace.get(i);
      if (pend) { for (const p of pend) addDecl(p.name, p.tok, id); pendingByBrace.delete(i); }
      continue;
    }
    if (v === '}') { const id = braceStack.pop(); if (regions[id]) regions[id].end = i; continue; }
    if (tk.t !== 'id') {
      if (v === '=>') {
        // arrow params: '(...)' or a bare identifier immediately before
        let names = [];
        if (toks[i - 1] && toks[i - 1].v === ')') { const o = matchOpen(toks, i - 1); names = patternNames(toks, o + 1, i - 2); }
        else if (toks[i - 1] && toks[i - 1].t === 'id') names = [{ name: toks[i - 1].v, tok: i - 1 }];
        const nxt = toks[i + 1];
        if (nxt && nxt.v === '{') queueParams(i + 1, names, true);
        else if (nxt) {
          // expression body: virtual region spanning the expression
          let d = 0, end = i + 1;
          for (let j = i + 1; j < toks.length; j++) { const w = toks[j].v; if (d === 0 && [',', ';', ')', ']', '}'].includes(w)) break; if (OPEN[w]) d++; else if (CLOSE[w]) d--; end = j; }
          const id = regions.length;
          regions.push({ id, start: i + 1, end, kind: 'arrow', isFunction: true });
          for (const p of names) addDecl(p.name, p.tok, id);
        }
      }
      continue;
    }
    // identifier / keyword handlers (all lookahead-only; the main walk never skips)
    if (v === 'for' && (!toks[i - 1] || toks[i - 1].v !== '.')) {
      // A for statement gets its own scope spanning header + body only:
      // let/const declared in the header live there and end with the
      // statement (var in the header hoists past it - see below).
      let open = i + 1;
      if (toks[open] && toks[open].v === 'await') open++;
      if (toks[open] && toks[open].v === '(') {
        const close = matchClose(toks, open);
        const id = regions.length;
        regions.push({ id, start: i, end: statementEnd(toks, close + 1), kind: 'for' });
        forHeaders.push({ open, close, id });
      }
      continue;
    }
    if ((v === 'let' || v === 'const' || v === 'var') && (!toks[i - 1] || toks[i - 1].v !== '.')) {
      // Declaration scope: `var` hoists to the nearest function-or-top
      // scope regardless of block nesting; let/const declared in a for
      // header live in that for statement's scope; anything else lives
      // in the current brace scope.
      let declScope = braceStack[braceStack.length - 1];
      if (v === 'var') {
        declScope = 0;
        for (let k = braceStack.length - 1; k >= 0; k--) { const reg = regions[braceStack[k]]; if (reg && reg.isFunction) { declScope = braceStack[k]; break; } }
      } else {
        let best = null, bestSpan = Infinity;
        for (const h of forHeaders) { if (h.open <= i && i <= h.close && h.close - h.open < bestSpan) { best = h; bestSpan = h.close - h.open; } }
        // ... but only when the declaration sits directly in the
        // header. A brace opened INSIDE the header - a nested
        // function/arrow/class body in the initializer, condition or
        // update - lexically contains its declarations: if that brace
        // is the current brace scope, the loop region must not claim
        // the declaration (it stays in the brace scope, the default).
        const topReg = regions[braceStack[braceStack.length - 1]];
        if (best && !(topReg && topReg.start > best.open)) declScope = best.id;
      }
      let cur = i + 1, guard = 0;
      while (cur < toks.length && guard++ < 10000) {
        if (toks[cur].t === 'id' && !BIND_KEYWORDS.has(toks[cur].v)) {
          addDecl(toks[cur].v, cur, declScope);
          cur++;
        } else if (toks[cur].v === '{' || toks[cur].v === '[') {
          const close = matchClose(toks, cur);
          for (const p of patternNames(toks, cur + 1, close - 1)) addDecl(p.name, p.tok, declScope);
          cur = close + 1;
        } else break;
        if (toks[cur] && toks[cur].v === '=') { initEqToks.add(cur); cur = skipInitializer(toks, cur + 1); }
        if (toks[cur] && toks[cur].v === ',') { cur++; continue; }
        break;
      }
      continue;
    }
    if (v === 'function' && (!toks[i - 1] || toks[i - 1].v !== '.')) {
      let j = i + 1; if (toks[j] && toks[j].v === '*') j++;
      let nameTok = null;
      if (toks[j] && toks[j].t === 'id' && toks[j + 1] && toks[j + 1].v === '(') { nameTok = j; j++; }
      if (toks[j] && toks[j].v === '(') {
        const close = matchClose(toks, j);
        const params = patternNames(toks, j + 1, close - 1);
        const braceIdx = toks[close + 1] && toks[close + 1].v === '{' ? close + 1 : null;
        queueParams(braceIdx, params, true);
        if (nameTok != null) {
          const prev = toks[i - 1];
          const isDecl = !prev || [';', '{', '}'].includes(prev.v);
          if (isDecl) addDecl(toks[nameTok].v, nameTok, braceStack[braceStack.length - 1]);
          else if (braceIdx != null) queueParams(braceIdx, [{ name: toks[nameTok].v, tok: nameTok }], true); // named function expression: name is local to its body
        }
      }
      continue;
    }
    if (v === 'catch' && toks[i + 1] && toks[i + 1].v === '(') {
      const close = matchClose(toks, i + 1);
      const params = patternNames(toks, i + 2, close - 1);
      if (toks[close + 1] && toks[close + 1].v === '{') queueParams(close + 1, params);
      continue;
    }
    if (v === 'class' && (!toks[i - 1] || toks[i - 1].v !== '.')) {
      if (toks[i + 1] && toks[i + 1].t === 'id' && !BIND_KEYWORDS.has(toks[i + 1].v)) addDecl(toks[i + 1].v, i + 1, braceStack[braceStack.length - 1]);
      continue;
    }
    // method shorthand: name '(' params ')' '{' in an object/class context
    if (!BIND_KEYWORDS.has(v) && toks[i + 1] && toks[i + 1].v === '(') {
      const prev = toks[i - 1];
      const ctxOk = !prev || ['{', ',', ';', '}'].includes(prev.v) || (prev.t === 'id' && ['get', 'set', 'async', 'static'].includes(prev.v)) || prev.v === '*';
      if (ctxOk) {
        const close = matchClose(toks, i + 1);
        if (toks[close + 1] && toks[close + 1].v === '{') queueParams(close + 1, patternNames(toks, i + 2, close - 1), true);
      }
    }
  }
  // region parents by smallest containing range
  for (const r of regions) {
    if (r.id === 0) { r.parent = null; continue; }
    let best = regions[0], bestSpan = Infinity;
    for (const o of regions) { if (o === r) continue; const span = o.end - o.start; if (o.start <= r.start && o.end >= r.end && span < bestSpan) { best = o; bestSpan = span; } }
    r.parent = best.id;
  }
  const scopeNames = new Map();
  for (const e of declEvents) { if (!scopeNames.has(e.scope)) scopeNames.set(e.scope, new Set()); scopeNames.get(e.scope).add(e.name); }
  return { toks, regions, declEvents, declNameToks, initEqToks, tokBraceRegion, scopeNames };
}

// Destructuring-assignment targets inside a bracket group (the part
// before the group's '='): split the group into top-level segments;
// a segment with a top-level ':' takes its target from the value side,
// any other segment from its first bare identifier (member targets -
// followed by '.', '[' or '(' - are not bare and never count).
function patternTargets(toks, a, b, out) {
  const segs = [];
  let d = 0, s = a;
  for (let j = a; j <= b; j++) { const w = toks[j].v; if (OPEN[w]) d++; else if (CLOSE[w]) d--; if (w === ',' && d === 0) { segs.push([s, j - 1]); s = j + 1; } }
  segs.push([s, b]);
  for (const [s0, e0] of segs) {
    if (s0 > e0) continue;
    let colon = -1; d = 0;
    for (let j = s0; j <= e0; j++) { const w = toks[j].v; if (OPEN[w]) d++; else if (CLOSE[w]) d--; else if (w === ':' && d === 0) { colon = j; break; } }
    const from = colon >= 0 ? colon + 1 : s0;
    let j = from;
    if (toks[j] && toks[j].v === '...') j++;
    if (j > e0) continue;
    if (toks[j].v === '{' || toks[j].v === '[') { patternTargets(toks, j + 1, matchClose(toks, j) - 1, out); continue; }
    if (toks[j].t === 'id' && !BIND_KEYWORDS.has(toks[j].v)) {
      const nx = toks[j + 1];
      if (nx && (nx.v === '.' || nx.v === '[' || nx.v === '(')) continue; // member/call target
      out.push(j);
    }
  }
}

function analyzeFiles(fileSrcs) {
  const files = Object.keys(fileSrcs);
  const analyses = {}, ownerMap = new Map(), firstFile = new Map(), duplicates = []; // ownerMap: binding name -> OWNER GROUP label (create family collapses to 'create.js'); firstFile: name -> concrete declaring file (duplicate detection stays concrete)
  for (const f of files) {
    const an = analyzeSource(fileSrcs[f]);
    analyses[f] = an;
    for (const e of an.declEvents) {
      if (e.scope !== 0) continue;
      if (firstFile.has(e.name) && firstFile.get(e.name) !== f) duplicates.push(e.name + ' (' + firstFile.get(e.name) + ' + ' + f + ')');
      else if (!firstFile.has(e.name)) { firstFile.set(e.name, f); ownerMap.set(e.name, ownerGroup(f)); }
    }
  }
  const sites = [], implicit = new Set();
  for (const f of files) {
    const an = analyses[f], toks = an.toks;
    // resolution: innermost containing scope first (brace ancestors +
    // any arrow-expression regions containing the token), root last.
    const resolve = (tokIdx, name) => {
      const cand = new Map();
      let r = an.tokBraceRegion[tokIdx];
      while (r != null) { const reg = an.regions[r]; cand.set(r, reg.end - reg.start); r = reg.parent; }
      for (const reg of an.regions) if ((reg.kind === 'arrow' || reg.kind === 'for') && reg.start <= tokIdx && tokIdx <= reg.end) cand.set(reg.id, reg.end - reg.start);
      const ordered = [...cand.entries()].sort((x, y) => x[1] - y[1]);
      for (const [scope] of ordered) { const names = an.scopeNames.get(scope); if (names && names.has(name)) return scope === 0 ? 'own' : 'local'; }
      const owner = ownerMap.get(name);
      if (owner && owner !== ownerGroup(f)) return owner;
      if (owner === ownerGroup(f)) return 'own';
      implicit.add(name);
      return null;
    };
    const consider = (tokIdx) => {
      const name = toks[tokIdx].v;
      const owner = resolve(tokIdx, name);
      if (owner && owner !== 'own' && owner !== 'local') sites.push({ file: f, line: toks[tokIdx].line, name, owner });
    };
    // pre-pass: destructuring assignment groups ([...] = / ({...}) =)
    const groupToks = new Set(), groupEq = new Map();
    for (let e = 0; e < toks.length; e++) {
      if (toks[e].v !== '=' || an.initEqToks.has(e)) continue;
      const prev = toks[e - 1];
      if (!prev || (prev.v !== ']' && prev.v !== '}')) continue;
      const open = matchOpen(toks, e - 1);
      const before = toks[open - 1];
      if (before && ![';', '{', '}', '(', '=', ','].includes(before.v)) continue;
      const targets = [];
      patternTargets(toks, open + 1, e - 2, targets);
      const real = targets.filter(t => !an.declNameToks.has(t));
      if (!real.length) continue;
      for (let k = open; k < e; k++) groupToks.add(k);
      groupEq.set(e, real);
    }
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (groupEq.has(i)) { for (const t of groupEq.get(i)) consider(t); continue; }
      if (tk.t !== 'id' || BIND_KEYWORDS.has(tk.v) || an.declNameToks.has(i) || groupToks.has(i)) continue;
      const prev = toks[i - 1], next = toks[i + 1];
      if (prev && (prev.v === '.' || prev.v === '?.')) continue;
      if (next && next.v === ':') continue;
      const isForAssign = prev && prev.v === '(' && toks[i - 2] && toks[i - 2].v === 'for' && next && (next.v === 'of' || next.v === 'in');
      const isAssign = next && ASSIGN_OPS.has(next.v) && !an.initEqToks.has(i + 1);
      const isPost = next && (next.v === '++' || next.v === '--');
      const beforePrev = toks[i - 2];
      // Prefix ++/-- counts only on a BARE identifier: if the operand
      // continues as a member expression (`++obj.x`, `++obj[0]`) the
      // update targets the member, never the base identifier. (The
      // postfix path needs no such guard: `obj.x++` reaches this code
      // at `x`, which the '.' check above already skips, and `obj`
      // itself is not followed by ++/--.)
      const isPre = prev && (prev.v === '++' || prev.v === '--') && !(next && (next.v === '.' || next.v === '?.' || next.v === '[')) && !(beforePrev && (beforePrev.t === 'id' || beforePrev.t === 'num' || beforePrev.t === 'str' || beforePrev.v === ')' || beforePrev.v === ']'));
      if (isForAssign || isAssign || isPost || isPre) consider(i);
    }
  }
  const fileOrder = new Map(files.map((f, i) => [f, i]));
  sites.sort((a, b) => fileOrder.get(a.file) - fileOrder.get(b.file) || a.line - b.line || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const byFile = {};
  for (const f of files) {
    const mine = sites.filter(s => s.file === f);
    byFile[f] = { expressions: mine.length, lines: new Set(mine.map(s => s.line)).size };
  }
  return { sites, totals: { expressions: sites.length, lines: new Set(sites.map(s => s.file + ':' + s.line)).size, byFile }, implicit: [...implicit].sort(), duplicates };
}

function censusObject(res) {
  return { rule: RULE, universe: UNIVERSE.slice(), totals: res.totals, sites: res.sites };
}

// ---------------- fixtures: the analyzer must be able to fail ----------------
let failures = 0;
const check = (name, cond, extra) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) { failures++; if (extra !== undefined) console.log('  ', JSON.stringify(extra)); } };
const FX_OWNER = 'let ext = 0, ext2 = 0; const obj = {}; let pair;';
const fx = (src) => analyzeFiles({ 'owner.js': FX_OWNER, 'case.js': src }).sites.filter(s => s.file === 'case.js');
const FX_CASES = [
  ['self-write (own top-level binding)', 'let mine = 0; function f() { mine = 1; }', 0],
  ['foreign plain assignment', 'ext = 1;', 1],
  ['foreign compound +=', 'ext += 2;', 1],
  ['member write obj.x = never counts', 'obj.x = 1; this.y = 2;', 0],
  ['shadowed by function parameter', 'function f(ext) { ext = 1; }', 0],
  ['shadowed by local let', 'function f() { let ext; ext = 1; }', 0],
  ['prefix ++ foreign', '++ext;', 1],
  ['postfix -- foreign', 'ext--;', 1],
  ['two writes on one line (2 expressions, 1 line)', 'ext = 1; ext2 = 2;', 2],
  ['declaration initializer never counts', 'let ext = 5;', 0],
  ['destructuring assignment counts per bound name', '[ext, ext2] = pair;', 2],
  ['object destructuring assignment', '({ ext } = obj);', 1],
  ['write inside a template interpolation counts', 'const s = `${ext = 1}`;', 1],
  ['writes inside comments and strings never count', '// ext = 1\nconst t = "ext = 2";\n/* ext2 = 3 */', 0],
  ['for (x of ...) with a bare identifier assigns', 'for (ext of [1, 2]) {}', 1],
  ['for (const x of ...) declares, not assigns', 'for (const ext of [1, 2]) {}', 0],
  ['local var in a sibling scope does not leak, arrow param shadows', 'const g = (ext) => { ext = 3; };', 0],
  // Codex verify cycle-1 regression cases (2026-11-07): the three
  // defects the verifier reproduced against this analyzer - a past
  // misjudgment each, pinned here as permanent regression tests.
  ['Codex cycle-1 regression: for-loop binding scope ends with the loop', 'for (const ext of []) {} ext = 1;', 1],
  ['Codex cycle-1 regression: var hoists to the enclosing function scope', 'function f(){ if(true){var ext;} ext=1; }', 0],
  ['Codex cycle-1 regression: prefix member update never counts', '++obj.ext;', 0],
  // Codex verify cycle-2 regression cases (2026-11-07): two defects
  // in the for-scope mechanism cycle 1 added, each reproduced by the
  // verifier against this analyzer - a past misjudgment each, pinned
  // here as permanent regression tests.
  ['Codex cycle-2 regression: nested function declaration in a for-header initializer stays in its own scope', 'for(let i=(()=>{let ext;})();false;){ext=2;}', 1],
  ['Codex cycle-2 regression: ASI ends a braceless loop body at the newline', 'for(let ext of []) ext++\next=2;', 1],
  ['Codex cycle-2 regression: explicit semicolon ends a braceless loop body (ASI pair)', 'for(let ext of []) ext++;\next=2;', 1],
  // Codex verify cycle-3 regression cases (2026-11-07; fixed in the
  // Andrew-authorized third fix round, 2026-11-08): three residuals in
  // cycle 2's statementEnd continuation machinery, each reproduced by
  // the verifier against this analyzer with these exact inputs.
  ['Codex cycle-3 regression: prefix-unary operand continues a braceless loop body across the newline', 'for(let ext of []) typeof\next++;\next=2;', 1],
  ['Codex cycle-3 regression: tagged template starting the next line continues a braceless loop body', 'for(let ext of []) tag\n`${ext++}`;\next=2;', 1],
  ['Codex cycle-3 regression: postfix ++ ends a braceless loop body before a bracket line', 'for(let ext of []) ext++\n[ext=2];', 1],
  // KNOWN LIMITATION cases (2026-11-08; claim-narrowing amendment,
  // Andrew's decision after Codex verify cycle 4 - NOT regression
  // tests for fixed defects). Each asserts the analyzer's CURRENT
  // reading, which is KNOWN WRONG; the correct semantics are stated
  // here and in the header's KNOWN LIMITATIONS note. If an analyzer
  // change ever alters either reading, the case fails loudly and the
  // header note must be revisited in the same change.
  // L1: reads 1, correct 0 - the `ext = 1` write sits inside the
  // brace-less loop body and targets the loop's own `let ext`
  // (local, not foreign). `typeof` tokenizes as an identifier, so
  // isPostfixUpdate mistakes the prefix ++ for a postfix update and
  // statementEnd ends the body at the line break. Shape absent from
  // parts/ (grep-verified 2026-11-08: no prefix-operator keyword is
  // followed by ++/-- in code).
  ['KNOWN LIMITATION L1: prefix ++ after typeof at a line break in a braceless loop body (pins current reading 1; correct 0)', 'for(let ext of []) typeof ++\nobj[ext=1];', 1],
  // L2: reads 0, correct 1 - `yield` is a restricted production (no
  // LineTerminator may precede its operand), so the statement ends
  // at the break, the loop body is `yield;` alone, and `(ext=2);`
  // is a foreign write after the loop. The analyzer depth-counts
  // the `(` opener before the ASI judgement can fire, so the write
  // stays inside the loop region. Shape absent from parts/
  // (grep-verified 2026-11-08: no generator functions in parts/;
  // `yield` appears only in prose comments).
  ['KNOWN LIMITATION L2: bare yield as a braceless loop body, operand opening on the next line (pins current reading 0; correct 1)', 'function* f(){for(let ext of []) yield\n(ext=2);}', 0],
];
for (const [label, src, want] of FX_CASES) {
  const got = fx(src);
  check(`fixture: ${label} -> ${want}`, got.length === want, got);
}
{
  const two = fx('ext = 1; ext2 = 2;');
  check('fixture: two writes on one line occupy exactly 1 census line', new Set(two.map(s => s.line)).size === 1 && two.length === 2, two);
}

// ---------------- the tree census ----------------
const treeSrcs = {};
for (const f of UNIVERSE) treeSrcs[f] = fs.readFileSync(path.join(ROOT, 'parts', f), 'utf8');
const tree = analyzeFiles(treeSrcs);
const census = censusObject(tree);
console.log(`foreign-write census (recomputed): ${tree.totals.expressions} expressions on ${tree.totals.lines} lines; by file: ` + UNIVERSE.map(f => `${f} ${tree.totals.byFile[f].expressions}/${tree.totals.byFile[f].lines}`).join(', '));
if (tree.duplicates.length) console.log('  note: top-level names declared in more than one universe file (first owner kept): ' + tree.duplicates.join('; '));

// The adjudicated sites (coordinator-verified on this tree) MUST be present.
const MUST = [
  ['app1.js', 298, 'routeBox'], ['app1.js', 417, 'suggested'], // Beta 1.169 (Carbon fix round): both app1 pins moved on line count alone (routeBox 296 -> 298, suggested 399 -> 405 - the A-02 migGet helper and the A-03 inheritance block grew app1 above them); the suggested SITE itself gained the sugQueue rebind counted in the census note above. Beta 1.170 (Carbon fix round Phase 2): suggested 405 -> 417 on line count alone (the A-04 raw-history parse +2 and the reconcile block +10 above it); totals UNCHANGED (53 expressions / 21 lines, verified pair-for-pair against the recomputed diff before regenerating): the round's new writes are to function locals or to a part's OWN bindings (restoreInFlight in app4, crSaveInFlight in create-save)
  ['app4.js', 163, 'trail'], ['app4.js', 163, 'trailSessions'], ['app4.js', 167, 'lastTrailSave'],
  ['app4.js', 332, 'restoring'], ['create-pick.js', 660, 'followPaused'], // Beta 1.153: the followPaused site moved 587 -> 606 on line count alone (the create-pick pill machinery grew the file above it); Beta 1.154: 606 -> 608 the same way (the G3 predicate block grew the file above it, the crFaceNow line's deletion below it); Beta 1.157: 608 -> 629 the same way (the tap-width change's CR_TAP_BOXES block + crFeatDistPx grew the file above it); same expression, same owner, census total unchanged (52 / 21). Beta 1.169 (Carbon fix round): 629 -> 633 the same way (the D-02/D-08 create-pick blocks grew the file above it); the census total itself rose 52 -> 53 expressions - ONE new adjudicated-class write: app1's completeFinishCleanup now also rebinds app3's sugQueue beside suggested (the B-11 queue dies with its set at every reset point). Beta 1.176: 633 -> 660 the same way (the slow-load gate, the fresh-load confirmation key and the measured button placement grew crRenderHint above it); same expression, same owner, census total unchanged (53 / 21)
]; // Beta 1.150: four pins moved with their code (app1 +13 from the migrateLegacyRoute fill-record rewrite - routeBox 277 -> 290, suggested 379 -> 392; app4 restoring 291 -> 296 from the pushField validation block, and the reset block 972 -> 988 below from the update-check rewrite) - the census totals are UNCHANGED (52 expressions / 21 lines, same per-file counts): no foreign write was added or removed, only line numbers followed the edits, and the pin JSON was regenerated by this file's --write in the same change
// Beta 1.152 (NV round): three pins and the reset block moved again, same discipline - app1 routeBox 290 -> 296 (the NV constants +2 and the computeStretches prefilter +4 above it), suggested 392 -> 409 (capHistoryList +9 and the load caps +2 more above it), app4 restoring 296 -> 301 (the pushField array-cap block +5), the reset block 988 -> 998 (pushField +5, the packTileUrls budget +3, the preloadUrlList budget +2). Totals UNCHANGED again (52 expressions / 21 lines, same per-file counts, verified pair-for-pair against the diff before regenerating): the round's new writes are all to function locals or to a part's OWN bindings.
// Beta 1.166 (storage fix round): the app4 pins moved again, same discipline - trail/trailSessions 157 -> 163 and lastTrailSave 161 -> 167 (the backupObj settings read +2 and the recoveryObj store block +4 above them), restoring 301 -> 333 (canonicalSettings +9, the store-phase restore block +17 more above it), the reset block 998 -> 1030 with its neighbours (978 -> 1010, 999 -> 1031, 1000 -> 1032, the same +32). Totals UNCHANGED again (52 expressions / 21 lines, same per-file counts, verified pair-for-pair against the recomputed diff before regenerating): the round's new writes are to function locals, to create-packs' OWN bindings (userPackCache, upStoreComplete, upStatus - the create owner group writing its own globals is not foreign), or through the verified write primitives.
// Beta 1.167 (run/pace fix round): pins moved on line count alone, same discipline - app1 suggested 409 -> 399 (the cap block's replacement by appendHistory, -10 above it), app4 restoring 333 -> 332 and the reset block 1030 -> 1029 with its neighbours (1010 -> 1009, 1031 -> 1030, 1032 -> 1031; the pushField hist-cap branch merged, -1 above them). Totals UNCHANGED again (52 expressions / 21 lines, same per-file counts, verified pair-for-pair against the recomputed diff before regenerating): the round's new app3 writes are to function locals or to app3's OWN new bindings (runDist, runDistWrote - declared in app3, written only there); app1's saveHistory no longer assigns the app1-owned history binding at all.
for (const [f, ln, nm] of MUST) check(`census contains adjudicated site ${f}:${ln} ${nm}`, tree.sites.some(s => s.file === f && s.line === ln && s.name === nm));
{
  const at988 = tree.sites.filter(s => s.file === 'app4.js' && s.line === 1047);
  check('census: app4.js:1047 carries exactly the 11 reset expressions', at988.length === 11, at988); // Beta 1.170: the reset block moved 1029 -> 1043 on line count alone (the C-03/C-04/C-09 app4 blocks grew the file above it), its neighbours with it (1023/1044/1045). Beta 1.180: moved 1043 -> 1047 the same way (the WHATSNEW roll + the boot-trigger comment above it), neighbours with it (1027/1048/1049); census JSON regenerated the same act
}

if (process.argv.includes('--write')) {
  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2) + '\n');
  console.log('--write: census regenerated at ' + path.relative(ROOT, CENSUS_PATH) + ' (human-reviewed act; never automatic in CI)');
  console.log('  implicit-global targets met (no owner, not counted): ' + (tree.implicit.length ? tree.implicit.join(', ') : '(none)'));
} else {
  let pinned = null;
  try { pinned = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')); } catch (e) { console.log('FAIL census file unreadable: ' + e.message); failures++; }
  if (pinned) {
    const same = JSON.stringify(pinned) === JSON.stringify(census);
    check('tree census matches the pinned census EXACTLY (' + census.totals.expressions + ' expressions / ' + census.totals.lines + ' lines)', same);
    if (!same) {
      const key = s => s.file + ':' + s.line + ':' + s.name + '->' + s.owner;
      const pinSet = new Map(pinned.sites.map(s => [key(s), 0])); for (const s of pinned.sites) pinSet.set(key(s), pinSet.get(key(s)) + 1);
      const gotSet = new Map(tree.sites.map(s => [key(s), 0])); for (const s of tree.sites) gotSet.set(key(s), gotSet.get(key(s)) + 1);
      for (const [k, n] of gotSet) if ((pinSet.get(k) || 0) !== n) console.log('  EXTRA/CHANGED in recomputed: ' + k + ' x' + n + ' (pinned x' + (pinSet.get(k) || 0) + ')');
      for (const [k, n] of pinSet) if ((gotSet.get(k) || 0) !== n) console.log('  MISSING in recomputed: ' + k + ' x' + n);
      if (JSON.stringify(pinned.totals) !== JSON.stringify(census.totals)) console.log('  totals differ: pinned ' + JSON.stringify(pinned.totals) + ' vs recomputed ' + JSON.stringify(census.totals));
    }
  }
}

console.log(failures === 0 ? 'FOREIGN-WRITE CENSUS: PASS' : `FOREIGN-WRITE CENSUS: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
