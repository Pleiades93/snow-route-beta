'use strict';

// Boundary scan: a write to a state from outside its owning part is
// reported against the baseline in scripts/parts-boundary-baseline.json.
// A state marked enforce in scripts/parts-boundary-owners.json refuses
// NEW foreign writes (scan-parts turns those hits into failures).

const ts = require('typescript');

const mutators = /^(push|pop|splice|shift|unshift|add|delete|clear|set|sort|reverse|fill|copyWithin)$/;
const updates = [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken];

function writeTarget(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return node.left;
  if (ts.isDeleteExpression(node)) return node.expression;
  if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      updates.includes(node.operator)) return node.operand;
  if ((ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
      !ts.isVariableDeclarationList(node.initializer)) return node.initializer;
}

function functionName(node, tree) {
  if (!ts.isFunctionLike(node)) return;
  let slot = node;
  while (ts.isParenthesizedExpression(slot.parent)) slot = slot.parent;
  const parent = slot.parent;
  return (node.name || ((ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) && parent.name) ||
    (ts.isBinaryExpression(parent) && parent.right === slot && parent.left))?.getText?.(tree);
}

function inContext(node, tree, pattern) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    const expression = ts.isCallExpression(parent) || ts.isForOfStatement(parent) ? parent.expression : null;
    if (expression && pattern.test(expression.getText(tree))) return true;
  }
  return false;
}

function matchWrite(write, rule, checker, owner, fn, key) {
  if (rule.fn && rule.fn !== fn) return false;
  if (rule.call) {
    if (!write.call || !rule.call.test(write.call)) return false;
    if (rule.classArguments) {
      const end = { toggle: 1, replace: 2 }[write.method];
      return write.args.slice(0, end).some(arg => ts.isStringLiteral(arg) && arg.text === key);
    }
    return !rule.arg || rule.arg.test(write.argText[rule.index ?? 0]);
  }
  if (!write.target || !rule.target.test(write.target)) return false;
  if (rule.context && !inContext(write.node, write.tree, rule.context)) return false;
  if (!rule.binding) return !write.mutator;
  if (!checker) return true;
  return write.root && checker.getSymbolAtLocation(write.root)?.declarations?.some(
    decl => decl.getSourceFile().fileName.replaceAll('\\', '/').endsWith('/' + (rule.declaration || owner)));
}

function describeWrite(node, tree) {
  const callee = ts.isCallExpression(node) ? node.expression : null;
  const method = callee && ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
  const mutator = mutators.test(method);
  const target = writeTarget(node) || (mutator ? callee.expression : null);
  if (!callee && !target) return;
  let root = target;
  while (root && (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root))) root = root.expression;
  return {
    node, tree, call: callee?.getText(tree), method, args: node.arguments, mutator,
    argText: callee && node.arguments.map(arg => arg.getText(tree)),
    target: target?.getText(tree), root,
  };
}

function findWrites(tree, file, owners, checker) {
  const states = owners.states.filter(state => state.owner !== file).map(state => ({
    ...state,
    rules: (state.recognition || []).map(rule => Object.fromEntries(Object.entries(rule).map(
      ([key, value]) => [key, ['call', 'arg', 'target', 'context'].includes(key) ? new RegExp(value) : value]))),
  }));
  const writes = [];
  const ordinals = new Map();
  function visit(node, fn) {
    fn = functionName(node, tree) || fn;
    const write = describeWrite(node, tree);
    if (write) for (const state of states) {
      if (!state.rules.some(rule => matchWrite(write, rule, checker, state.owner, fn, state.key))) continue;
      const ordinalKey = JSON.stringify([state.id, fn]);
      const occ = (ordinals.get(ordinalKey) || 0) + 1;
      ordinals.set(ordinalKey, occ);
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      writes.push({ state: state.id, file, fn, occ, line, owner: state.owner });
    }
    ts.forEachChild(node, child => visit(child, fn));
  }
  visit(tree, '<top-level>');
  return writes;
}

const identity = ({ state, file, fn, occ }) => JSON.stringify([state, file, fn, occ]);

function scanBoundaries(tree, file, owners, baseline, checker) {
  const known = new Set(baseline.map(identity));
  const exemptions = new Map(owners.exemptions.filter(entry => entry.name?.trim() && entry.why?.trim())
    .map(entry => [identity(entry), entry]));
  const byId = new Map(owners.states.map(state => [state.id, state]));
  return findWrites(tree, file, owners, checker).map(write => {
    const key = identity(write);
    const exemption = exemptions.get(key);
    const status = exemption ? 'EXEMPT' : known.has(key) ? 'KNOWN' : 'NEW';
    const reason = exemption ? ` (${exemption.name}: ${exemption.why})` : '';
    return {
      status, state: write.state, owner: write.owner, file, line: write.line,
      enforced: status === 'NEW' && byId.get(write.state)?.enforce === true,
      message: `${file}:${write.line}: boundary report-only: ${status} ${write.state} owned by ${write.owner}${reason}`,
    };
  });
}

module.exports = scanBoundaries;
module.exports.findWrites = findWrites;
