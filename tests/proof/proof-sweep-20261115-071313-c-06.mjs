import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync('parts/brand-snow.js', 'utf8');

let failed = 0;
function check(name, cond) {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    console.error('FAIL: ' + name);
    failed++;
  }
}

function runSnow({ mainCtxNull = false, spriteCtxNull = false } = {}) {
  const classes = new Set();
  const mockCtx = () => ({
    setTransform() {},
    createRadialGradient() { return { addColorStop() {} }; },
    fillRect() {},
    clearRect() {},
    createLinearGradient() { return { addColorStop() {} }; },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    arc() {},
    drawImage() {}
  });

  const snowCv = {
    width: 0,
    height: 0,
    getContext(type) {
      if (type === '2d') return mainCtxNull ? null : mockCtx();
      return null;
    }
  };

  const windowObj = {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setTimeout: () => 1,
    clearTimeout() {}
  };

  const documentObj = {
    getElementById(id) {
      if (id === 'snowCv') return snowCv;
      return null;
    },
    createElement(tag) {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext(type) {
            if (type === '2d') return spriteCtxNull ? null : mockCtx();
            return null;
          }
        };
      }
      return {};
    },
    body: {
      classList: {
        add(c) { classes.add(c); },
        remove(c) { classes.delete(c); },
        contains(c) { return classes.has(c); }
      }
    }
  };

  const sandbox = { window: windowObj, document: documentObj, Math };
  vm.createContext(sandbox);
  let threw = null;
  try {
    vm.runInContext(src + '\nwindow.__afterConcat = true;', sandbox);
  } catch (err) {
    threw = err;
  }
  return { threw, windowObj, classes };
}

// 1. Primary scenario: cvS.getContext('2d') returns null
const r1 = runSnow({ mainCtxNull: true });
check('does not throw when #snowCv getContext("2d") returns null', r1.threw === null);
check('concatenated code after snowLayer still executes', r1.windowObj.__afterConcat === true);
check('window.__snow fallback handle is present and reports not running', Boolean(r1.windowObj.__snow) && r1.windowObj.__snow.running() === false);
check('body.snow-scene is not added when snow cannot initialize', !r1.classes.has('snow-scene'));

// 2. Offscreen sprite canvas getContext('2d') returns null
const r2 = runSnow({ mainCtxNull: false, spriteCtxNull: true });
check('does not throw when offscreen sprite getContext("2d") returns null', r2.threw === null);

// 3. Normal boot still initializes and runs
const r3 = runSnow({ mainCtxNull: false, spriteCtxNull: false });
check('normal 2d context boots without error and marks running', r3.threw === null && r3.windowObj.__snow.running() === true && r3.classes.has('snow-scene'));

if (failed > 0) process.exit(1);
