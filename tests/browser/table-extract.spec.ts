import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open tools menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'PDF tools' }).getByRole('button', { name: label, exact: true }).click();
}

async function expectAccessible(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map(anim => anim.finished.catch(() => {}))));
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('.MuiSnackbar-root')
    .analyze();
  expect(results.violations).toEqual([]);
}

test('Convert PDF to Tables extracts itemized invoice rows into a responsive table and downloads CSV and JSON', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await navigate(page, 'Convert');

  const convertTool = page.locator('[data-tool="convert"]');
  await convertTool.getByRole('tab', { name: 'PDF to Tables', exact: true }).click();
  await convertTool.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();

  await expect(convertTool.getByText('Invoice_INV-2026-089.pdf', { exact: true })).toBeVisible();
  await expect(convertTool.getByTestId('extracted-tables-summary')).toContainText(/table/);

  // Locate the itemized invoice table card
  const itemizedCard = convertTool
    .locator('.MuiPaper-root')
    .filter({ hasText: 'Core Cryptographic Document Pipeline Architecture' })
    .first();
  await expect(itemizedCard).toBeVisible();
  await expect(itemizedCard.locator('table.pdfy-responsive-table')).toContainText('$7,770.00');
  await expectAccessible(page);

  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    itemizedCard.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toMatch(/^Invoice_INV-2026-089_p1_table\d+\.csv$/);
  const csvContent = await readFile((await csvDownload.path())!, 'utf8');
  expect(csvContent).toContain('DESCRIPTION,HOURS,RATE,AMOUNT');
  expect(csvContent).toContain('Core Cryptographic Document Pipeline Architecture');
  expect(csvContent).toContain('"$7,770.00"');

  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    itemizedCard.getByRole('button', { name: 'Download JSON', exact: true }).click(),
  ]);
  const jsonRecords = JSON.parse(await readFile((await jsonDownload.path())!, 'utf8')) as Array<Record<string, string>>;
  expect(jsonRecords.length).toBeGreaterThanOrEqual(4);
  expect(jsonRecords[0].DESCRIPTION).toContain('Core Cryptographic Document Pipeline Architecture');
  expect(jsonRecords[0].AMOUNT).toBe('$7,770.00');
});

test('PDF to Tables switches to stacked container layout at 320px in dark mode without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  const notice = page.getByRole('alert').filter({ hasText: 'PDFy is ready for offline use.' });
  await expect(notice).toBeVisible({ timeout: 30000 });
  await notice.getByRole('button', { name: 'Close' }).click();

  await navigate(page, 'Convert');
  const convertTool = page.locator('[data-tool="convert"]');
  await convertTool.getByRole('tab', { name: 'PDF to Tables', exact: true }).click();
  await convertTool.getByRole('button', { name: 'Try a sample PDF', exact: true }).click();

  const table = convertTool.locator('table.pdfy-responsive-table').first();
  await expect(table).toBeVisible();
  // Verify @container (width < 520px) stacked layout hides thead cleanly
  const theadDisplay = await table.locator('thead').evaluate(el => getComputedStyle(el).display);
  expect(theadDisplay).toBe('none');

  await expectAccessible(page);
  const overflow = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewport);
});
