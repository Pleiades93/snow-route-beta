import { launchDrive, finish } from './harness.mjs';

// drive229: check the right-edge profile so canvas closure
// cannot slice the crest.

const { proc, send, S, ev, poll } = await launchDrive();
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

try {
  // Base paint fails the profile check at 393 and 430; 390
  // passes on both trees (the defect is phase-dependent).
  for (const width of [390, 393, 430]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height: 844, deviceScaleFactor: 1, mobile: true
    }, S);
    const ready = await poll(`window.__snow && __snow.running() && __snow.amount() > 0.9 &&
      innerWidth === ${width} && document.getElementById('snowCv').width === ${width}`, 30000);
    if (!ready) {
      ok(`${width}px: settled snow at requested width`, false);
      continue;
    }

    // The expected profile mirrors groundHeightAt's formula;
    // the centre cross-check below fails if that formula changes.
    const { bottomWhite, heights, expected, centreMirror, centreApp } = await ev(`(() => {
      const cv = document.getElementById('snowCv');
      const amount = window.__snow.amount();
      const profile = (x) => 51 * amount * (0.72 + 0.16 * Math.sin(x * 0.045 + 1.7) +
        0.12 * Math.sin(x * 0.013 + 0.4));
      const columns = 3;
      const band = 52;
      const { data } = cv.getContext('2d').getImageData(cv.width - columns, cv.height - band, columns, band);
      const pixel = (x, y) => (y * columns + x) * 4;
      const bottom = pixel(columns - 1, band - 1);
      const bottomWhite = data[bottom] >= 230 && data[bottom + 1] >= 240 &&
        data[bottom + 2] >= 250 && data[bottom + 3] >= 220;
      const heights = Array.from({ length: columns }, (_, x) => {
        let height = 0;
        while (height < band && data[pixel(x, band - 1 - height) + 3] >= 220) height++;
        return height;
      });
      return { bottomWhite, heights, expected: profile(cv.width),
        centreMirror: profile(cv.width / 2), centreApp: window.__snow.ground() };
    })()`);

    ok(`${width}px: profile mirror matches the app ground readout at centre [${centreMirror.toFixed(1)} vs ${centreApp.toFixed(1)}]`,
      Math.abs(centreMirror - centreApp) <= 0.5);
    ok(`${width}px: bottom-row bank white reaches the right edge`, bottomWhite);
    // The closing chord cuts the final columns below the wave even when the bottom row reaches the edge.
    ok(`${width}px: right-edge profile [${heights}] within 3px of ${expected.toFixed(1)}px`,
      heights.every(height => Math.abs(height - expected) <= 3));
  }
} catch (error) {
  proc.kill('SIGKILL');
  throw error;
}

finish(R, proc);
