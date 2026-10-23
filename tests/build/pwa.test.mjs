import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';

test('install manifest references real icons with the declared dimensions', async () => {
  const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const png = await readFile(`dist/${icon.src}`);
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});

test('every PDF rendering resource is copied intact and precached at its runtime URL', async () => {
  const sw = await readFile('dist/sw.js', 'utf8');
  for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
    const names = (await readdir(`node_modules/pdfjs-dist/${directory}`)).filter(name => /\.(bcmap|pfb|ttf|wasm|js)$/.test(name));
    assert.ok(names.length > 0);
    for (const name of names) {
      const url = `pdfjs/${directory}/${name}`;
      assert.deepEqual(await readFile(`dist/${url}`), await readFile(`node_modules/pdfjs-dist/${directory}/${name}`));
      assert.ok(sw.includes(JSON.stringify(url)), `Missing precache entry: ${url}`);
    }
  }
  const worker = (await readdir('dist/assets')).find(name => /^pdf\.worker.*\.mjs$/.test(name));
  assert.ok(worker);
  assert.ok(sw.includes(JSON.stringify(`assets/${worker}`)));
});
