import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIQUID_GLASS_PRESETS,
  computeBezelDisplacementField,
  detectSvgBackdropSupport,
  generateBezelMapDataUrl,
} from '../src/utils/liquidGlass.ts';

function pixelAt(data, width, x, y) {
  const idx = (y * width + x) * 4;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
    a: data[idx + 3],
  };
}

test('computeBezelDisplacementField keeps flat interior strictly neutral (128, 128) and alpha 255', () => {
  const width = 160;
  const height = 48;
  const field = computeBezelDisplacementField(width, height, 24, 11, 1.5);

  assert.equal(field.length, width * height * 4);

  // Every pixel must carry opaque alpha (255) and neutral blue channel (128).
  for (let i = 0; i < width * height; i++) {
    assert.equal(field[i * 4 + 2], 128);
    assert.equal(field[i * 4 + 3], 255);
  }

  // Interior center band (well inside bezel=11) must be completely neutral so text never distorts.
  for (let y = 16; y <= height - 17; y++) {
    for (let x = 28; x <= width - 29; x++) {
      const px = pixelAt(field, width, x, y);
      assert.equal(px.r, 128, `expected neutral R at (${x},${y})`);
      assert.equal(px.g, 128, `expected neutral G at (${x},${y})`);
    }
  }
});

test('computeBezelDisplacementField produces true symmetric outward bevel normals near edges', () => {
  const width = 160;
  const height = 48;
  const field = computeBezelDisplacementField(width, height, 24, 11, 1.5);

  // Straight top/bottom rim center must refract strictly vertically (zero horizontal skew).
  const topRim = pixelAt(field, width, 80, 2);
  const bottomRim = pixelAt(field, width, 80, height - 3);
  assert.equal(topRim.r, 128);
  assert.equal(bottomRim.r, 128);
  assert.ok(topRim.g > 128, `expected top rim G > 128, got ${topRim.g}`);
  assert.ok(bottomRim.g < 128, `expected bottom rim G < 128, got ${bottomRim.g}`);
  assert.equal(topRim.g + bottomRim.g, 256);

  // Left/right capsule caps along centerline must refract strictly horizontally.
  const leftRim = pixelAt(field, width, 2, 24);
  const rightRim = pixelAt(field, width, width - 3, 24);
  assert.ok(leftRim.r > 128, `expected left rim R > 128, got ${leftRim.r}`);
  assert.ok(rightRim.r < 128, `expected right rim R < 128, got ${rightRim.r}`);
  assert.equal(leftRim.r + rightRim.r, 256);

  // Full field left-right and top-bottom mirror symmetry on an even square panel.
  const panelSize = 64;
  const panel = computeBezelDisplacementField(panelSize, panelSize, 16, 10, 1.5);
  for (let y = 0; y < panelSize; y++) {
    for (let x = 0; x < panelSize / 2; x++) {
      const left = pixelAt(panel, panelSize, x, y);
      const right = pixelAt(panel, panelSize, panelSize - 1 - x, y);
      assert.equal(left.r + right.r, 256);
      assert.equal(left.g, right.g);
    }
  }
  for (let y = 0; y < panelSize / 2; y++) {
    for (let x = 0; x < panelSize; x++) {
      const top = pixelAt(panel, panelSize, x, y);
      const bottom = pixelAt(panel, panelSize, x, panelSize - 1 - y);
      assert.equal(top.r, bottom.r);
      assert.equal(top.g + bottom.g, 256);
    }
  }
});

test('computeBezelDisplacementField handles zero bezel cleanly and generateBezelMapDataUrl falls back in Node', () => {
  const flat = computeBezelDisplacementField(16, 16, 4, 0);
  for (let i = 0; i < 16 * 16; i++) {
    assert.equal(flat[i * 4], 128);
    assert.equal(flat[i * 4 + 1], 128);
    assert.equal(flat[i * 4 + 2], 128);
    assert.equal(flat[i * 4 + 3], 255);
  }
  assert.equal(generateBezelMapDataUrl(64, 32, 16, 8), '');
});

test('LIQUID_GLASS_PRESETS defines the 4 aspect-bucketed presets with valid geometry and dispersion strategy', () => {
  const ids = LIQUID_GLASS_PRESETS.map(preset => preset.id);
  assert.deepEqual(ids, ['lg-pill', 'lg-lens', 'lg-orb', 'lg-panel']);

  for (const preset of LIQUID_GLASS_PRESETS) {
    assert.ok(preset.width > 0 && preset.height > 0);
    assert.ok(preset.radius > 0 && preset.radius <= Math.min(preset.width, preset.height) / 2);
    assert.ok(preset.bezel > 0 && preset.bezel < Math.min(preset.width, preset.height) / 2);
    assert.ok(preset.scale > 0);
    assert.ok(preset.ior > 1);
  }

  const byId = Object.fromEntries(LIQUID_GLASS_PRESETS.map(preset => [preset.id, preset]));
  assert.equal(byId['lg-pill'].chromaticDispersion, true);
  assert.equal(byId['lg-lens'].chromaticDispersion, true);
  assert.equal(byId['lg-orb'].chromaticDispersion, true);
  assert.equal(byId['lg-panel'].chromaticDispersion, false);
  assert.equal(byId['lg-panel'].dispersionDelta, 0);
});

test('detectSvgBackdropSupport enables Blink/Chromium only and guards non-Chromium and accessibility preferences', () => {
  // Without browser globals in Node, safely returns false.
  assert.equal(detectSvgBackdropSupport(), false);

  const base = {
    supportsBackdropBlur: true,
    reducedTransparency: false,
    forcedColors: false,
  };

  // Chromium desktop, Edge desktop, and HeadlessChrome (Playwright) are supported.
  assert.equal(
    detectSvgBackdropSupport({
      ...base,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    }),
    true,
  );
  assert.equal(
    detectSvgBackdropSupport({
      ...base,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/135.0.0.0 Safari/537.36',
    }),
    true,
  );
  assert.equal(
    detectSvgBackdropSupport({
      ...base,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0',
      userAgentData: { brands: [{ brand: 'Microsoft Edge' }, { brand: 'Chromium' }] },
    }),
    true,
  );

  // Safari (macOS & iOS), Firefox, and all iOS WebKit browsers must be rejected.
  const unsupportedUAs = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/135.0.0.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/135.0.0.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/135.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0',
  ];
  for (const userAgent of unsupportedUAs) {
    assert.equal(detectSvgBackdropSupport({ ...base, userAgent }), false, `expected false for UA: ${userAgent}`);
  }

  // Accessibility & capability guards must disable SVG backdrop refraction even on Chrome.
  const chromeUA = 'Mozilla/5.0 AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36';
  assert.equal(detectSvgBackdropSupport({ ...base, userAgent: chromeUA, reducedTransparency: true }), false);
  assert.equal(detectSvgBackdropSupport({ ...base, userAgent: chromeUA, forcedColors: true }), false);
  assert.equal(detectSvgBackdropSupport({ ...base, userAgent: chromeUA, supportsBackdropBlur: false }), false);
});
