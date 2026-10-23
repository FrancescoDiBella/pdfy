import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, access } from 'node:fs/promises';

test('Pages HTML references built assets inside the repository path', async () => {
  const html = await readFile('dist/index.html', 'utf8');
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(urls.some(url => /^\/pdfy\/assets\/.*\.js$/.test(url)));
  assert.ok(urls.includes('/pdfy/manifest.webmanifest'));
  assert.ok(urls.includes('/pdfy/favicon.svg'));
  for (const url of urls) {
    assert.ok(url.startsWith('/pdfy/'), `Asset escapes the Pages path: ${url}`);
    await access(`dist/${url.slice('/pdfy/'.length)}`);
  }
});

test('Pages manifest start, scope, ID, and icons resolve inside the project', async () => {
  const site = 'https://example.github.io/pdfy/';
  const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
  for (const field of ['id', 'start_url', 'scope']) assert.equal(new URL(manifest[field], site).href, site);
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, site);
    assert.ok(url.pathname.startsWith('/pdfy/'));
    await access(`dist/${url.pathname.slice('/pdfy/'.length)}`);
  }
});
