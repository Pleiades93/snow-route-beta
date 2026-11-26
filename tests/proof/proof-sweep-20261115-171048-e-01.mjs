import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync('parts/head.html', 'utf8');

// Extract <style> block and top-level <body> children from parts/head.html
const styleMatch = src.match(/<style>([\s\S]*?)<\/style>/);
assert(styleMatch, 'style block found');
const cssRaw = styleMatch[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[\s\S]*?\{[\s\S]*?\}\s*\}/g, '');

const bodyHtml = src.slice(src.indexOf('<body>') + 6);
const bodyChildren = [];
let depth = 0;
const tagRe = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>/g;
const voidTags = new Set(['img', 'input', 'br', 'hr', 'meta', 'link']);
let m;
while ((m = tagRe.exec(bodyHtml)) !== null) {
  const [, closing, tagRaw, attrs] = m;
  const tag = tagRaw.toLowerCase();
  if (closing) {
    depth = Math.max(0, depth - 1);
  } else {
    if (depth === 0 && tag !== 'script') {
      const id = (attrs.match(/\bid="([^"]+)"/) || [])[1] || '';
      const cls = ((attrs.match(/\bclass="([^"]+)"/) || [])[1] || '').split(/\s+/).filter(Boolean);
      bodyChildren.push({ tag, id, classes: new Set(cls) });
    }
    if (!voidTags.has(tag) && !attrs.trim().endsWith('/')) depth++;
  }
}

// Parse top-level CSS rules (selector list + declarations)
const rules = [];
const ruleRe = /([^{}@]+)\{([^{}]*)\}/g;
while ((m = ruleRe.exec(cssRaw)) !== null) {
  const selectors = m[1].split(',').map(s => s.trim()).filter(Boolean);
  const decls = m[2].split(';').map(s => s.trim()).filter(Boolean).map(d => {
    const idx = d.indexOf(':');
    if (idx < 0) return null;
    const prop = d.slice(0, idx).trim();
    let val = d.slice(idx + 1).trim();
    const imp = /!important\s*$/i.test(val);
    if (imp) val = val.replace(/!important\s*$/i, '').trim();
    return { prop, val, imp };
  }).filter(Boolean);
  rules.push({ selectors, decls });
}

function matchSimple(tok, el, rootClasses, bodyClasses) {
  if (tok === '*' || tok === el.tag) return true;
  let rest = tok;
  if (rest.startsWith(el.tag)) rest = rest.slice(el.tag.length);
  else if (rest.startsWith('*')) rest = rest.slice(1);
  else if (!/^[#.:]/.test(rest)) return false;
  const nots = [];
  rest = rest.replace(/:not\(([^)]+)\)/g, (_, inner) => { nots.push(inner.trim()); return ''; });
  const ids = [...rest.matchAll(/#([a-zA-Z0-9_-]+)/g)].map(x => x[1]);
  const clss = [...rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map(x => x[1]);
  if (ids.some(i => el.id !== i)) return false;
  if (clss.some(c => !el.classes.has(c))) return false;
  for (const n of nots) {
    if (matchSimple(n, el, rootClasses, bodyClasses)) return false;
  }
  return true;
}

function matchesBodyChild(sel, el, { htmlClasses = new Set(), bodyClasses = new Set() }) {
  if (sel.includes('::')) return false;
  const norm = sel.replace(/\s*>\s*/g, ' > ').trim();
  if (norm.startsWith('html')) {
    const mBoot = norm.match(/^html((?:\.[a-zA-Z0-9_-]+)*)\s+body((?:\.[a-zA-Z0-9_-]+)*)\s*>\s*(\S+)$/);
    if (mBoot) {
      const hc = mBoot[1].split('.').filter(Boolean);
      const bc = mBoot[2].split('.').filter(Boolean);
      if (hc.some(c => !htmlClasses.has(c))) return false;
      if (bc.some(c => !bodyClasses.has(c))) return false;
      return matchSimple(mBoot[3], el, htmlClasses, bodyClasses);
    }
    const mDesc = norm.match(/^html((?:\.[a-zA-Z0-9_-]+)*)\s+(\S+)$/);
    if (mDesc) {
      const hc = mDesc[1].split('.').filter(Boolean);
      if (hc.some(c => !htmlClasses.has(c))) return false;
      return matchSimple(mDesc[2], el, htmlClasses, bodyClasses);
    }
    return false;
  }
  if (norm.startsWith('body')) {
    const mBody = norm.match(/^body((?:\.[a-zA-Z0-9_-]+)*)\s+(\S+)$/);
    if (mBody) {
      const bc = mBody[1].split('.').filter(Boolean);
      if (bc.some(c => !bodyClasses.has(c))) return false;
      return matchSimple(mBody[2], el, htmlClasses, bodyClasses);
    }
    return false;
  }
  if (norm.includes(' ')) return false;
  return matchSimple(norm, el, htmlClasses, bodyClasses);
}

function computeDisplayAndOpacity(id, { boot = true, mutator = () => {} } = {}) {
  const base = bodyChildren.find(c => c.id === id);
  assert(base, `element #${id} exists as body > *`);
  const el = { tag: base.tag, id: base.id, classes: new Set(base.classes) };
  mutator(el);
  const state = { htmlClasses: new Set(boot ? ['boot'] : []), bodyClasses: new Set() };
  let display = 'block', displayImp = false, opacity = '1', zIndex = 'auto';
  for (const r of rules) {
    if (r.selectors.some(s => matchesBodyChild(s, el, state))) {
      for (const d of r.decls) {
        if (d.prop === 'display' && (d.imp || !displayImp)) { display = d.val; if (d.imp) displayImp = true; }
        if (d.prop === 'opacity') opacity = d.val;
        if (d.prop === 'z-index') zIndex = d.val;
      }
    }
  }
  return { display, opacity, zIndex };
}

// Check 1: #crModal opened during boot (class 'hidden' removed by crConfirm) is visible
const modalOpen = computeDisplayAndOpacity('crModal', { boot: true, mutator: el => el.classes.delete('hidden') });
assert.equal(modalOpen.display, 'flex', `#crModal when opened during html.boot should be display:flex, got ${modalOpen.display}`);
assert(Number(modalOpen.zIndex) > 10000, `#crModal z-index (${modalOpen.zIndex}) sits above #routeMenu (10000)`);
console.log('PASS: #crModal opened during html.boot renders as display:flex above #routeMenu');

// Check 2: #crModal in its resting state during boot remains hidden via .modal.hidden
const modalClosed = computeDisplayAndOpacity('crModal', { boot: true });
assert.equal(modalClosed.display, 'none', `#crModal resting during html.boot should stay display:none, got ${modalClosed.display}`);
console.log('PASS: #crModal resting during html.boot stays display:none via .hidden');

// Check 3: the banner shown during boot (class 'show' added by showBanner) is rendered and opaque -
// it inherited the toast's boot exemption in Beta 1.296 (the toast element itself is deleted)
const toastShown = computeDisplayAndOpacity('banner', { boot: true, mutator: el => el.classes.add('show') });
assert.notEqual(toastShown.display, 'none', `#banner during html.boot must not be display:none, got ${toastShown.display}`);
assert.equal(toastShown.opacity, '1', `#banner.show opacity should be 1, got ${toastShown.opacity}`);
console.log('PASS: #banner.show during html.boot renders visible (opacity:1)');

// Check 4: Working app chrome (#hud, #dock, #tabBar, #finModal) still stays display:none during html.boot
for (const chromeId of ['hud', 'dock', 'tabBar', 'finModal']) {
  const st = computeDisplayAndOpacity(chromeId, { boot: true, mutator: el => el.classes.delete('hidden') });
  assert.equal(st.display, 'none', `#${chromeId} must remain display:none during html.boot`);
}
console.log('PASS: working chrome (#hud, #dock, #tabBar, #finModal) remains hidden during html.boot');
