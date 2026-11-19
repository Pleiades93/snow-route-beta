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
//    app4.js, app5.js, create-packs.js, create-fetch.js, create-citydata.js,
//    create-cache.js, create-pick.js, create-save.js, engine.js
//    (data.js, whatsnew.js and pmstyles.js excluded - data/generated:
//    data.js is route-pack DATA, whatsnew.js is the What's New data
//    part, pmstyles.js is the generated basemap styles; none is app
//    logic). A binding's OWNER is the part file holding
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
//  - The census record = the sorted list of sites {file, fn, name,
//    owner, occ} + totals (Arch-5 re-key, 2026-11-19). fn is the
//    site's enclosing function under the keying rule below; occ is the
//    write's ordinal among writes to the same target inside that
//    function. Line numbers are NOT part of the record: through
//    Beta 1.243 sites were keyed by file + line + name + owner, so
//    any edit that shifted lines re-keyed the census and forced hand
//    re-pins (the Arch-1 part split rolled a census pin on exactly
//    that). The fn key survives code moving within a file and
//    changes only when the write itself changes. This selftest
//    recomputes and compares EXACTLY; a deliberate census update =
//    regenerate the JSON via this file's --write mode (the
//    regeneration is a human-reviewed act, never automatic in CI).
//
// KEYING RULE (Arch-5, 2026-11-19 - verbatim, also carried in the
// census JSON's rule text): a site's fn is the innermost enclosing
// function that HAS a name - a function declaration's name, a method's
// name, or the binding/property an anonymous function is assigned to
// (`const x = () => {}`, `x = function () {}`, `{ x: () => {} }` key
// to x). An anonymous function with no such slot (a callback argument,
// an IIFE) is TRANSPARENT for keying: its writes key to the nearest
// named enclosing function, or to '<top-level>' when there is none.
// occ counts writes to the same target within that (file, fn) bucket
// in source (token) order, starting at 1. A function's parameter list
// is part of the function for keying: a write in a default
// initializer keys to that function - and never to the parameter's
// own name (a parameter name is not a function name, so a function
// expression sitting in a default does not take it either). Wrapping
// parentheses and an 'async' modifier around an assigned function
// are transparent for keying: the name still resolves through them.
// An immediately invoked function is the opposite case: the slot
// binds its result, not the function, so it takes no slot name and
// stays transparent like any other anonymous function.
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
const UNIVERSE = ['app1.js', 'app2.js', 'app3.js', 'app4.js', 'app5.js', 'create-packs.js', 'create-fetch.js', 'create-citydata.js', 'create-cache.js', 'create-pick.js', 'create-save.js', 'engine.js'];
const CREATE_FAMILY = new Set(['create-packs.js', 'create-fetch.js', 'create-citydata.js', 'create-cache.js', 'create-pick.js', 'create-save.js']);
const ownerGroup = (f) => CREATE_FAMILY.has(f) ? 'create.js' : f; // the six create-*.js files are ONE owner group, labelled by the historical part name
const CENSUS_PATH = path.join(HERE, 'fixtures', 'foreign-writes-census.json');
const RULE = 'Universe: parts/app1.js, app2.js, app3.js, app4.js, app5.js, create-packs.js, create-fetch.js, create-citydata.js, create-cache.js, create-pick.js, create-save.js, engine.js (data.js, whatsnew.js and pmstyles.js excluded - data/generated). Owner = the part file holding a binding\'s top-level declaration, except the six create-*.js files form ONE owner group labelled create.js (the historical part name): a binding declared in any create-*.js file is owned by that group, and a write is foreign iff the target\'s owner group differs from the writing file\'s owner group; site records keep the concrete file holding the write. A FOREIGN WRITE is an assignment/update expression (=, +=, -=, *=, /=, %=, **=, ++, -- prefix or postfix) whose target is a bare identifier (not a member expression; a declaration initializer never counts) resolving through lexical scope to a top-level binding owned by a different part file or owner group. Comments/strings/templates masked (interpolations are code); scopes tracked by braces with their declarations (function/arrow/catch params, let/const/var at any depth, function declarations). Destructuring assignment targets count per bound identifier; for (x of ...) with a bare identifier assigns. Site records are keyed by enclosing function (Arch-5 re-key, 2026-11-19): {file, fn, name, owner, occ} - fn is the innermost enclosing function with a name (a declaration name, a method name, or the binding/property an anonymous function is assigned to; an anonymous function with no such slot is transparent for keying, its writes keying to the nearest named enclosing function, or \'<top-level>\' when there is none), and occ is the 1-based ordinal of the write among writes to the same target within that function in source order. Parameter lists are part of their function for keying: a write in a default initializer keys to that function, never to the parameter name. Wrapping parentheses and an async modifier around an assigned function are transparent for keying. Line numbers are not part of the record.';

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

// Anonymous functions' keying names resolve from their assignment /
// property slots in a post-pass inside analyzeSource (resolveSlot).

function analyzeSource(src) {
  const toks = tokenize(src);
  const regions = [{ id: 0, start: -1, end: Number.MAX_SAFE_INTEGER, kind: 'root', isFunction: true }];
  const declEvents = []; // {name, tok, scope}
  const declNameToks = new Set();
  const initEqToks = new Set();
  const pendingByBrace = new Map(); // brace token idx -> [{name, tok}]
  const funcBraceIdx = new Set(); // brace token idx of function/arrow/method bodies (NOT catch)
  const fnNames = new Map(); // function-body brace token idx -> Arch-5 keying name (null = anonymous)
  const fnParamRanges = []; // {open, close, braceIdx, regionId, fnName} - parameter-list spans: a function's parameters are part of the function for keying (a write in a default initializer keys to the function - Codex P2 round 2, PR #126)
  const paramNameToks = new Set(); // token idx of parameter names - a parameter's name is never a function's keying name
  const fnSlots = []; // {braceIdx, regionId, anchor, range} - anonymous functions whose keying name resolves from their slot in the post-pass (resolveSlot)
  const forHeaders = []; // {open, close, id} of each for statement's (...) header
  const braceStack = [0];
  const tokBraceRegion = new Array(toks.length).fill(0);
  const addDecl = (name, tok, scope) => { declEvents.push({ name, tok, scope }); declNameToks.add(tok); };
  const queueParams = (braceIdx, names, isFunc, fnName) => { if (braceIdx == null) return; if (isFunc) { funcBraceIdx.add(braceIdx); if (fnName !== undefined) fnNames.set(braceIdx, fnName); for (const p of names) paramNameToks.add(p.tok); } if (!names.length) return; const arr = pendingByBrace.get(braceIdx) || []; arr.push(...names); pendingByBrace.set(braceIdx, arr); };

  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i], v = tk.v;
    tokBraceRegion[i] = braceStack[braceStack.length - 1];
    if (v === '{') {
      const id = regions.length;
      regions.push({ id, start: i, end: Number.MAX_SAFE_INTEGER, kind: 'brace', isFunction: funcBraceIdx.has(i), fnName: funcBraceIdx.has(i) ? (fnNames.get(i) ?? null) : undefined });
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
        let slotIdx = null; // anchor token just before this arrow's parameter list - its keying name resolves from here in the post-pass
        let paramOpen = null; // token index of this arrow's parameter-list '(' (or of its bare param)
        if (toks[i - 1] && toks[i - 1].v === ')') { paramOpen = matchOpen(toks, i - 1); names = patternNames(toks, paramOpen + 1, i - 2); slotIdx = paramOpen - 1; }
        else if (toks[i - 1] && toks[i - 1].t === 'id') { names = [{ name: toks[i - 1].v, tok: i - 1 }]; slotIdx = i - 2; paramOpen = i - 1; }
        const nxt = toks[i + 1];
        if (nxt && nxt.v === '{') { queueParams(i + 1, names, true); const range = { open: paramOpen, close: i - 1, braceIdx: i + 1, regionId: null, fnName: null }; fnParamRanges.push(range); fnSlots.push({ braceIdx: i + 1, regionId: null, anchor: slotIdx, range }); }
        else if (nxt) {
          // expression body: virtual region spanning the expression
          let d = 0, end = i + 1;
          for (let j = i + 1; j < toks.length; j++) { const w = toks[j].v; if (d === 0 && [',', ';', ')', ']', '}'].includes(w)) break; if (OPEN[w]) d++; else if (CLOSE[w]) d--; end = j; }
          const id = regions.length;
          regions.push({ id, start: i + 1, end, kind: 'arrow', isFunction: true, fnName: null });
          const range = { open: paramOpen, close: i - 1, braceIdx: null, regionId: id, fnName: null };
          fnParamRanges.push(range);
          fnSlots.push({ braceIdx: null, regionId: id, anchor: slotIdx, range });
          for (const p of names) { addDecl(p.name, p.tok, id); paramNameToks.add(p.tok); }
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
        const fnKeyName = nameTok != null ? toks[nameTok].v : null;
        queueParams(braceIdx, params, true, fnKeyName);
        if (braceIdx != null) { const range = { open: j, close, braceIdx, regionId: null, fnName: fnKeyName }; fnParamRanges.push(range); if (nameTok == null) fnSlots.push({ braceIdx, regionId: null, anchor: i - 1, range }); }
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
        if (toks[close + 1] && toks[close + 1].v === '{') { queueParams(close + 1, patternNames(toks, i + 2, close - 1), true, v); fnParamRanges.push({ open: i + 1, close, braceIdx: close + 1, regionId: null, fnName: v }); }
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
  // Arch-5 keying: the enclosing function of a token = the first
  // NAMED candidate in nesting order. Candidates are every function
  // body region containing the token plus every parameter span
  // containing it (parameter lists are part of their function -
  // Codex P2 round 2, PR #126: a write in a default initializer sits
  // BEFORE the body brace, outside every body region, so each
  // function's parameter span is a candidate spanning the function's
  // full extent). Containing candidates nest, so span order IS
  // nesting order; anonymous candidates are transparent - the walk
  // simply continues to the next candidate outward. (Round 4: the
  // walk must NOT follow an anonymous region's parent chain first -
  // parameter spans are not region parents, and a nearer span would
  // be jumped over.) No named candidate = '<top-level>'.
  const regionByStart = new Map();
  for (const r of regions) if (r.kind === 'brace') regionByStart.set(r.start, r.id);
  // Post-pass slot resolution (Codex P2 round 3, PR #126): an
  // anonymous function's keying name comes from the slot it sits in,
  // resolved HERE - after the scan, when every parameter name is
  // registered (a function inside an arrow's parameter default is
  // scanned before that arrow's own parameters are, so an in-pass
  // resolution cannot know the name is a parameter's). The walk back
  // from the function skips wrapping parentheses and an 'async'
  // modifier, then requires '=' or ':' with a non-parameter
  // identifier before it; anything else stays anonymous. String
  // property keys are masked by the tokenizer, so they resolve as
  // anonymous - accepted: identifier keys are the codebase norm.
  const resolveSlot = (anchor, bodyEnd) => {
    let k = anchor, parens = 0;
    while (k != null && k >= 0 && toks[k] && (toks[k].v === '(' || (toks[k].t === 'id' && toks[k].v === 'async'))) { if (toks[k].v === '(') parens++; k--; }
    if (k == null || k < 1) return null;
    if (toks[k].v !== '=' && toks[k].v !== ':') return null;
    // A ':' names a property only inside an object literal, where the
    // key directly follows '{' or ',' (Codex P2 round 6, PR #126): a
    // conditional's colon is preceded by '?' before its other branch,
    // and that branch's last identifier is not a property name.
    if (toks[k].v === ':' && !(toks[k - 2] && (toks[k - 2].v === '{' || toks[k - 2].v === ','))) return null;
    const t = toks[k - 1];
    if (!t || t.t !== 'id' || BIND_KEYWORDS.has(t.v) || paramNameToks.has(k - 1)) return null;
    // Immediately invoked (Codex P2 round 5, PR #126): when the
    // function's own wrapping parens close right after its body and
    // a call follows, the slot binds the RESULT, not the function -
    // an IIFE is transparent for keying and takes no slot name.
    let m = bodyEnd + 1;
    for (let n = 0; n < parens && toks[m] && toks[m].v === ')'; n++) m++;
    if (toks[m] && toks[m].v === '(') return null;
    return t.v;
  };
  for (const s of fnSlots) {
    const rid = s.regionId != null ? s.regionId : regionByStart.get(s.braceIdx);
    const nm = rid != null && regions[rid] ? resolveSlot(s.anchor, regions[rid].end) : null;
    if (rid != null && regions[rid]) regions[rid].fnName = nm;
    if (s.range) s.range.fnName = nm;
  }
  const fnAt = (tokIdx) => {
    const cands = [];
    for (const r of regions) {
      if (!r.isFunction || r.id === 0) continue;
      if (r.start <= tokIdx && tokIdx <= r.end) cands.push({ span: r.end - r.start, fnName: r.fnName });
    }
    for (const pr of fnParamRanges) {
      const rid = pr.regionId != null ? pr.regionId : regionByStart.get(pr.braceIdx);
      if (rid == null || !regions[rid]) continue;
      if (pr.open <= tokIdx && tokIdx <= pr.close) cands.push({ span: regions[rid].end - pr.open, fnName: pr.fnName });
    }
    cands.sort((a, b) => a.span - b.span);
    for (const c of cands) if (c.fnName) return c.fnName;
    return '<top-level>';
  };
  return { toks, regions, declEvents, declNameToks, initEqToks, tokBraceRegion, scopeNames, fnAt };
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
      if (owner && owner !== 'own' && owner !== 'local') sites.push({ file: f, fn: an.fnAt(tokIdx), name, owner });
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
  // Arch-5 occurrence ordinals: sites are generated in token order
  // per file, so a running count per (file, fn, name) assigns each
  // write its 1-based ordinal within its enclosing function.
  const occCount = new Map();
  for (const s of sites) { const k = s.file + '\0' + s.fn + '\0' + s.name; const n = (occCount.get(k) || 0) + 1; occCount.set(k, n); s.occ = n; }
  const keyed = sites.map(s => ({ file: s.file, fn: s.fn, name: s.name, owner: s.owner, occ: s.occ }));
  const fileOrder = new Map(files.map((f, i) => [f, i]));
  keyed.sort((a, b) => fileOrder.get(a.file) - fileOrder.get(b.file) || (a.fn < b.fn ? -1 : a.fn > b.fn ? 1 : 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || a.occ - b.occ);
  const byFile = {};
  for (const f of files) {
    const mine = keyed.filter(s => s.file === f);
    byFile[f] = { expressions: mine.length };
  }
  return { sites: keyed, totals: { expressions: keyed.length, byFile }, implicit: [...implicit].sort(), duplicates };
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
  check('fixture: two writes on one line are two sites (the unit is the expression, never the line)', two.length === 2 && two[0].name === 'ext' && two[1].name === 'ext2', two);
}
// Arch-5 keying fixtures (2026-11-19): the re-key's own behaviour,
// pinned like every other analyzer behaviour above - a key that
// cannot fail is not a key.
{
  const key = s => [s.file, s.fn, s.name, s.owner, s.occ].join('|');
  const two = analyzeFiles({ 'owner.js': FX_OWNER, 'case.js': 'function alpha() { ext = 1; } function beta() { ext = 2; ext = 3; }' }).sites.filter(s => s.file === 'case.js');
  check('key fixture: writes key to their enclosing function, occurrences counted per function', JSON.stringify(two.map(key)) === JSON.stringify(['case.js|alpha|ext|owner.js|1', 'case.js|beta|ext|owner.js|1', 'case.js|beta|ext|owner.js|2']), two);
  const top = fx('ext = 1;');
  check('key fixture: a top-level write keys to <top-level>', top.length === 1 && top[0].fn === '<top-level>' && top[0].occ === 1, top);
  const anon = fx('function alpha() { [1].forEach(() => { ext = 1; }); }');
  check('key fixture: an anonymous callback is transparent - its write keys to the named enclosing function', anon.length === 1 && anon[0].fn === 'alpha', anon);
  const arrow = fx('const gamma = () => { ext = 1; };');
  check('key fixture: an arrow assigned to a binding keys to that binding', arrow.length === 1 && arrow[0].fn === 'gamma', arrow);
  const fexpr = fx('const gamma = function () { ext = 1; };');
  check('key fixture: a function expression assigned to a binding keys to that binding', fexpr.length === 1 && fexpr[0].fn === 'gamma', fexpr);
  const meth = fx('const o = { gamma() { ext = 1; } };');
  check('key fixture: a method keys to its method name', meth.length === 1 && meth[0].fn === 'gamma', meth);
  const aarrow = fx('const gamma = async () => { ext = 1; };');
  check('key fixture: an async arrow assigned to a binding keys to that binding', aarrow.length === 1 && aarrow[0].fn === 'gamma', aarrow);
  const aarrowP = fx('const gamma = async (q) => { ext = 1; };');
  check('key fixture: an async arrow with parenthesized params keys to its binding', aarrowP.length === 1 && aarrowP[0].fn === 'gamma', aarrowP);
  const aarrowB = fx('const gamma = async q => { ext = 1; };');
  check('key fixture: an async arrow with a bare param keys to its binding', aarrowB.length === 1 && aarrowB[0].fn === 'gamma', aarrowB);
  const amove = (inAlpha) => analyzeFiles({ 'owner.js': FX_OWNER, 'case.js': 'const alpha = async () => {' + (inAlpha ? ' ext = 1;' : '') + ' }; const beta = async () => {' + (inAlpha ? '' : ' ext = 1;') + ' };' }).sites.filter(s => s.file === 'case.js').map(key);
  check('key fixture: moving a write between two named async arrows changes its key', JSON.stringify(amove(true)) !== JSON.stringify(amove(false)) && amove(true)[0].includes('|alpha|') && amove(false)[0].includes('|beta|'), [amove(true), amove(false)]);
  const moved = (pad) => analyzeFiles({ 'owner.js': FX_OWNER, 'case.js': pad + 'function alpha() { ext = 1; ext2 = 2; }' }).sites.filter(s => s.file === 'case.js').map(key);
  check('key fixture: moving a function down the file changes no key', JSON.stringify(moved('')) === JSON.stringify(moved('\n\n\n// padding\n\n')), [moved(''), moved('\n\n\n// padding\n\n')]);
  const dflt = fx('function gamma(q = (ext = 1)) {}');
  check('key fixture: a write in a default parameter initializer keys to that function', dflt.length === 1 && dflt[0].fn === 'gamma', dflt);
  const dfltA = fx('const gamma = (q = (ext = 1)) => {};');
  check('key fixture: a write in an arrow default parameter keys to the arrow binding', dfltA.length === 1 && dfltA[0].fn === 'gamma', dfltA);
  const dmove = (inAlpha) => analyzeFiles({ 'owner.js': FX_OWNER, 'case.js': 'function alpha(q = ' + (inAlpha ? '(ext = 1)' : '0') + ') {} function beta(q = ' + (inAlpha ? '0' : '(ext = 1)') + ') {}' }).sites.filter(s => s.file === 'case.js').map(key);
  check('key fixture: moving a write between two functions default parameters changes its key', JSON.stringify(dmove(true)) !== JSON.stringify(dmove(false)) && dmove(true)[0].includes('|alpha|') && dmove(false)[0].includes('|beta|'), [dmove(true), dmove(false)]);
  const pfun = fx('function gamma(q = function () { ext = 1; }) {}');
  check('key fixture: a function expression in a parameter default keys to the enclosing function, not the parameter name', pfun.length === 1 && pfun[0].fn === 'gamma', pfun);
  const parr = fx('const gamma = (() => { ext = 1; });');
  check('key fixture: a parenthesized assigned arrow keys to its binding', parr.length === 1 && parr[0].fn === 'gamma', parr);
  const pfex = fx('const gamma = (function () { ext = 1; });');
  check('key fixture: a parenthesized assigned function expression keys to its binding', pfex.length === 1 && pfex[0].fn === 'gamma', pfex);
  const pmove = (inAlpha) => analyzeFiles({ 'owner.js': FX_OWNER, 'case.js': 'const alpha = (() => {' + (inAlpha ? ' ext = 1;' : '') + ' }); const beta = (() => {' + (inAlpha ? '' : ' ext = 1;') + ' });' }).sites.filter(s => s.file === 'case.js').map(key);
  check('key fixture: moving a write between two parenthesized assigned arrows changes its key', JSON.stringify(pmove(true)) !== JSON.stringify(pmove(false)) && pmove(true)[0].includes('|alpha|') && pmove(false)[0].includes('|beta|'), [pmove(true), pmove(false)]);
  const adflt = fx('const gamma = (q = function () { ext = 1; }) => {};');
  check('key fixture: a function expression in an arrow parameter default keys to the arrow binding, not the parameter name', adflt.length === 1 && adflt[0].fn === 'gamma', adflt);
  const callarg = fx('foo(() => { ext = 1; });');
  check('key fixture: a call-argument arrow stays anonymous (keys to <top-level>)', callarg.length === 1 && callarg[0].fn === '<top-level>', callarg);
  const nmove = (inAlpha) => analyzeFiles({ 'owner.js': FX_OWNER, 'case.js': 'function outer() { function alpha(q = ' + (inAlpha ? '() => { ext = 1; }' : '0') + ') {} function beta(q = ' + (inAlpha ? '0' : '() => { ext = 1; }') + ') {} }' }).sites.filter(s => s.file === 'case.js').map(key);
  check('key fixture: moving a default callback between two nested functions changes its key (the nearer parameter span beats the outer body)', JSON.stringify(nmove(true)) !== JSON.stringify(nmove(false)) && nmove(true)[0].includes('|alpha|') && nmove(false)[0].includes('|beta|'), [nmove(true), nmove(false)]);
  const iife = fx('function gamma() { const value = (() => { ext = 1; })(); }');
  check('key fixture: an immediately invoked arrow keys to the enclosing function, not the result binding', iife.length === 1 && iife[0].fn === 'gamma', iife);
  const imove = (inAlpha) => analyzeFiles({ 'owner.js': FX_OWNER, 'case.js': 'function alpha() { const v = (() => {' + (inAlpha ? ' ext = 1;' : '') + ' })(); } function beta() { const v = (() => {' + (inAlpha ? '' : ' ext = 1;') + ' })(); }' }).sites.filter(s => s.file === 'case.js').map(key);
  check('key fixture: moving an assigned IIFE statement between two functions changes its key', JSON.stringify(imove(true)) !== JSON.stringify(imove(false)) && imove(true)[0].includes('|alpha|') && imove(false)[0].includes('|beta|'), [imove(true), imove(false)]);
  const tern = fx('function gamma() { const value = cond ? fallback : () => { ext = 1; }; }');
  check('key fixture: an arrow in a conditional alternate keys to the enclosing function, not the other branch', tern.length === 1 && tern[0].fn === 'gamma', tern);
  const tmove = (inAlpha) => analyzeFiles({ 'owner.js': FX_OWNER, 'case.js': 'function alpha() { const v = cond ? fallback : () => {' + (inAlpha ? ' ext = 1;' : '') + ' }; } function beta() { const v = cond ? fallback : () => {' + (inAlpha ? '' : ' ext = 1;') + ' }; }' }).sites.filter(s => s.file === 'case.js').map(key);
  check('key fixture: moving a conditional-alternate arrow between two functions changes its key', JSON.stringify(tmove(true)) !== JSON.stringify(tmove(false)) && tmove(true)[0].includes('|alpha|') && tmove(false)[0].includes('|beta|'), [tmove(true), tmove(false)]);
}

// ---------------- the tree census ----------------
const treeSrcs = {};
for (const f of UNIVERSE) treeSrcs[f] = fs.readFileSync(path.join(ROOT, 'parts', f), 'utf8');
const tree = analyzeFiles(treeSrcs);
const census = censusObject(tree);
console.log(`foreign-write census (recomputed): ${tree.totals.expressions} expressions; by file: ` + UNIVERSE.map(f => `${f} ${tree.totals.byFile[f].expressions}`).join(', '));
if (tree.duplicates.length) console.log('  note: top-level names declared in more than one universe file (first owner kept): ' + tree.duplicates.join('; '));

// The adjudicated sites (coordinator-verified on this tree) MUST be
// present, in the Arch-5 key form [file, fn, name]. In the line-key
// era each entry carried a long comment chain narrating its line
// moves (Beta 1.150 through 1.243: the pins moved on line count alone
// round after round, totals unchanged, verified pair-for-pair before
// each regeneration). That narration is preserved verbatim in this
// file's git history at the Beta 1.243 tree; it is exactly the churn
// the re-key retires, so it is not carried forward. The identities
// below were re-derived pair-for-pair against the recomputed census
// in the Arch-5 round (an old-vs-new differential over the identical
// tree: the same 58 writes, and each site's enclosing function read
// from the source by hand and matched against the analyzer's key).
const MUST = [
  ['app1.js', 'buildGeometry', 'routeBox'], // buildGeometry refills app2's routeBox in place on every load
  ['app1.js', 'completeFinishCleanup', 'suggested'], // the cleanup clears app3's suggestion set (and rebinds sugQueue beside it, Beta 1.169) once both verified writes land
  ['app4.js', 'clearTrailAll', 'trail'], ['app4.js', 'clearTrailAll', 'trailSessions'], ['app4.js', 'clearTrailAll', 'lastTrailSave'],
  ['app4.js', 'restoreBackup', 'restoring'], // the P1 fence (Beta 1.186) is three restoring sites under two keys: restoreBackup occ 1 (the fence rises before the snapshot) and occ 2 (the success path), plus restoreFenceDown occ 1 (the failure doorway's arrow)
  ['create-pick.js', 'enterCreate', 'followPaused'], // enterCreate parks GPS follow for the picking
];
for (const [f, fn, nm] of MUST) check(`census contains adjudicated site ${f} ${fn} ${nm}`, tree.sites.some(s => s.file === f && s.fn === fn && s.name === nm));
{
  // The reset block: unloadRouteToBoot's one statement restoring the
  // eleven eval empties. (Pre-Arch-5 this check pinned the
  // statement's line - app5.js:432, where the Arch-1 split landed it.)
  const RESET11 = ['coveredIdx', 'doneSet', 'doneTimes', 'doneVia', 'history', 'notes', 'pieceTimes', 'pieces', 'runStart', 'trail', 'trailSessions'];
  const reset = tree.sites.filter(s => s.file === 'app5.js' && s.fn === 'unloadRouteToBoot' && RESET11.includes(s.name));
  check('census: unloadRouteToBoot carries exactly the 11 reset expressions', reset.length === 11 && RESET11.every(n => reset.some(s => s.name === n && s.occ === 1)), reset);
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
    check('tree census matches the pinned census EXACTLY (' + census.totals.expressions + ' expressions)', same);
    if (!same) {
      const key = s => s.file + '|' + s.fn + '|' + s.name + '#' + s.occ + '->' + s.owner;
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
