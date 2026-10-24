import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = 'test-results/mobile-before';
await mkdir(output, { recursive: true });
const server = await preview({ root: resolve('.ui-baseline'), preview: { host: '127.0.0.1', port: 4175, strictPort: true } });
const browser = await chromium.launch();
try {
  for (const width of [320, 1280]) {
    for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
      const page = await context.newPage();
      try {
        await page.goto('http://127.0.0.1:4175/');
        const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
        await notice.waitFor({ state: 'visible', timeout: 30000 });
        await notice.getByRole('button', { name: 'Close' }).click();
        const navigate = async tool => {
          const menu = page.getByRole('button', { name: 'Open tools menu' });
          if (await menu.isVisible()) await menu.click();
          await page.getByRole('navigation', { name: 'PDF tools' }).getByRole('button', { name: tool, exact: true }).click();
        };
        await navigate('Edit');
        await page.getByRole('button', { name: 'Sample Invoice', exact: true }).click();
        await page.waitForFunction(() => { const canvas = document.querySelector('#editor-session .react-pdf__Page__canvas'); return canvas instanceof HTMLCanvasElement && canvas.width > 0 && getComputedStyle(canvas).visibility === 'visible'; });
        await page.screenshot({ animations: 'disabled', path: `${output}/editor-before-${width}-${colorScheme}.png` });
        await page.getByRole('button', { name: 'Return to workspace', exact: true }).click();
        await navigate('Organize');
        await page.getByRole('button', { name: /^(Load 4-Page Sample Dossier|Try a sample PDF)$/ }).click();
        await page.waitForFunction(() => { const canvas = document.querySelector('[data-tool="organize"] .react-pdf__Page__canvas'); return canvas instanceof HTMLCanvasElement && canvas.width > 0 && getComputedStyle(canvas).visibility === 'visible'; });
        await page.screenshot({ animations: 'disabled', path: `${output}/organizer-before-${width}-${colorScheme}.png` });
      } finally { await context.close(); }
    }
  }
} finally {
  await browser.close();
  server.httpServer.closeAllConnections();
  await new Promise(resolve => server.httpServer.close(resolve));
}
