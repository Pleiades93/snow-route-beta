'use strict';

// Parts scan: the push path's two detectors over parts/, one home.
// Write rule: an outcome-returning write (lsSet, txSet, upSet,
// upPut, the save family) is tested, returned or assigned, or it
// carries an immediate write-safe comment naming why not.
// Clone rule: a NEW pair of identical or renamed-identical
// function bodies, or of identical CSS blocks, fails. The pairs
// already standing are recorded in parts-clone-baseline.json.
// Regenerate that baseline deliberately, never by hand:
//   node scripts/scan-parts.cjs . --write-baseline

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const writeBaseline = process.argv.includes('--write-baseline');
const positional = process.argv.slice(2).filter(arg => arg !== '--write-baseline');
const root = positional[0] || path.join(__dirname, '..');
const dir = path.join(root, 'parts');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts/parts-clone-baseline.json'), 'utf8'));
const clones = new Map();
const pairs = new Map();
let failures = 0;

function fail(message) {
  console.error(message);
  failures++;
}

function record(key, name, at) {
  const group = clones.get(key) || [];
  for (const other of group) {
    const pair = JSON.stringify([name, other.name].sort());
    pairs.set(pair, [other.at, at]);
  }
  group.push({ name, at });
  clones.set(key, group);
}

function outcomeUsed(node) {
  const parent = node.parent;
  if (ts.isVoidExpression(parent) || ts.isExpressionStatement(parent)) return false;
  if (ts.isArrowFunction(parent) || ts.isReturnStatement(parent) ||
      ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) ||
      ts.isArrayLiteralExpression(parent)) return true;
  if (ts.isIfStatement(parent) || ts.isWhileStatement(parent) ||
      ts.isDoStatement(parent) || ts.isSwitchStatement(parent)) return parent.expression === node;
  if (ts.isForStatement(parent)) return parent.condition === node;
  if (ts.isBinaryExpression(parent)) {
    const kind = parent.operatorToken.kind;
    if (kind === ts.SyntaxKind.CommaToken) return parent.right === node && outcomeUsed(parent);
    if (kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment) return parent.right === node;
    if (kind === ts.SyntaxKind.AmpersandAmpersandToken || kind === ts.SyntaxKind.BarBarToken ||
        kind === ts.SyntaxKind.QuestionQuestionToken) {
      return parent.left === node || outcomeUsed(parent);
    }
  }
  if (ts.isConditionalExpression(parent) && parent.condition === node) return true;
  return ts.isExpression(parent) && !ts.isCallExpression(parent) && outcomeUsed(parent);
}

function scanJs(file, source) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const line = pos => tree.getLineAndCharacterOfPosition(pos).line + 1;
  if (tree.parseDiagnostics.length) {
    for (const error of tree.parseDiagnostics) {
      fail(`${file}:${line(error.start)}: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`);
    }
    return;
  }
  const ownerCounts = new Map();
  function visit(node, scope = file) {
    if (ts.isCallExpression(node)) {
      const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
      const name = ts.isIdentifier(callee) && callee.text;
      if (/^(?:lsSet|txSet|upSet|upPut|save(?:[A-Z]\w*)?)$/.test(name)) {
        const start = node.getStart(tree);
        const why = source.slice(node.end).match(/^\s*\/\* write-safe: ([^\r\n]*?) \*\//)?.[1];
        if (!outcomeUsed(node) && !(why && why.trim() && why.split(/\s+/).length <= 19)) {
          fail(`${file}:${line(start)}: ${name} write outcome ignored. Test the result, return it, or assign it.`);
        }
      }
    }
    if (ts.isFunctionLike(node) && node.body) {
      const name = node.name || (ts.isVariableDeclaration(node.parent) ||
        ts.isPropertyAssignment(node.parent) ? node.parent.name : null);
      const label = `${scope}/${name ? name.getText(tree) : '<callback>'}`;
      const count = (ownerCounts.get(label) || 0) + 1;
      ownerCounts.set(label, count);
      scope = count === 1 ? label : `${label}#${count}`;

      const exact = [];
      const near = [];
      const identifiers = new Map();
      function tokenize(child) {
        if (ts.isJSDoc(child)) return;
        const qualifiedCall = ts.isPropertyAccessExpression(child) && ts.isIdentifier(child.expression) &&
          ts.isCallExpression(child.parent) && child.parent.expression === child;
        if (ts.isIdentifier(child) || qualifiedCall) {
          const spelling = qualifiedCall ? child.expression.text + '.' + child.name.text : child.text;
          if (!identifiers.has(spelling)) identifiers.set(spelling, identifiers.size);
          exact.push(['identifier', spelling]);
          near.push(['identifier', identifiers.get(spelling)]);
          return;
        }
        const children = child.getChildren(tree);
        if (children.length) children.forEach(tokenize);
        else {
          const token = [child.kind, child.getText(tree)];
          exact.push(token);
          near.push(token);
        }
      }
      tokenize(node.body);
      const at = `${file}:${line(node.getStart(tree))}`;
      record(JSON.stringify(exact), scope, at);
      // Require enough structure to distinguish renamed bodies from short idioms.
      if (near.length >= 32) record('near:' + JSON.stringify(near), scope, at);
    }
    ts.forEachChild(node, child => visit(child, scope));
  }
  visit(tree);
}

function scanCss(file, source) {
  const style = /<style>([\s\S]*?)<\/style>/.exec(source);
  if (!style) return fail(`${file}: missing style block`);
  const stack = [];
  const counts = new Map();
  const offset = style.index + '<style>'.length;
  const css = style[1];
  // Consume strings, comments and functions before looking at block delimiters.
  const token = /\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\\[\s\S]|[(){};]/g;
  let parens = 0;
  let start = 0;
  let match;
  while ((match = token.exec(css))) {
    const symbol = match[0];
    if (symbol === '(') parens++;
    if (symbol === ')') parens--;
    if (parens) continue;
    if (symbol === '{') {
      const selector = css.slice(start, match.index).replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ');
      if (stack.length) stack.at(-1).nested = true;
      stack.push({ selector, start: token.lastIndex });
      start = token.lastIndex;
    } else if (symbol === '}') {
      const rule = stack.pop();
      if (!rule.nested) {
        const body = css.slice(rule.start, match.index);
        const normalized = body.replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\/\*[\s\S]*?\*\/|\s*[;:]\s*|\s+/g,
          part => part.startsWith('/*') ? '' : /^["']/.test(part) ? part : part.trim() || ' ').trim().replace(/;$/, '');
        if (normalized) {
          const fullLabel = [file, ...stack.map(block => block.selector), rule.selector].join('/');
          const label = fullLabel.length <= 100 ? fullLabel :
            fullLabel.slice(0, 80) + '~' + createHash('sha256').update(fullLabel).digest('hex').slice(0, 16);
          const count = (counts.get(label) || 0) + 1;
          counts.set(label, count);
          const line = source.slice(0, offset + rule.start).split('\n').length;
          record('css:' + normalized, count === 1 ? label : `${label}#${count}`, `${file}:${line}`);
        }
      }
      start = token.lastIndex;
    } else if (symbol === ';' && (!stack.length || stack.at(-1).nested)) {
      start = token.lastIndex;
    }
  }
}

for (const name of fs.readdirSync(dir).sort()) {
  const file = 'parts/' + name;
  if (name.endsWith('.js')) scanJs(file, fs.readFileSync(path.join(root, file), 'utf8'));
  if (name === 'head.html') scanCss(file, fs.readFileSync(path.join(root, file), 'utf8'));
}

if (writeBaseline) {
  if (failures) {
    console.error('baseline refused: the write rule fails on this tree');
    process.exitCode = 1;
  } else {
    const list = [...pairs.keys()].map(key => JSON.parse(key));
    list.sort((a, b) => (a.join('\n') < b.join('\n') ? -1 : 1));
    const exemptions = JSON.stringify(baseline.exemptions, null, 2).replace(/\n/g, '\n  ');
    const body = list.map(pair => '    ' + JSON.stringify(pair)).join(',\n');
    fs.writeFileSync(path.join(root, 'scripts/parts-clone-baseline.json'),
      `{\n  "exemptions": ${exemptions},\n  "pairs": [\n${body}\n  ]\n}\n`);
    console.log(`baseline written: ${list.length} pairs`);
  }
}

const known = new Set([
  ...baseline.pairs,
  ...baseline.exemptions.filter(entry => entry.name?.trim() && entry.why?.trim()).map(entry => entry.pair),
].map(pair => JSON.stringify([...pair].sort())));
for (const [pair, locations] of pairs) {
  if (!known.has(pair)) fail(`Possible clone at ${locations.join(' and ')}: ${pair}`);
}
if (!failures) console.log(`parts scan: PASS (${pairs.size} clone pairs checked)`);
process.exitCode = failures ? 1 : 0;
