import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, StandardFonts } from 'pdf-lib';
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

async function createSimplePdf(name: string, lines: string[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([420, 560]);
  lines.forEach((line, idx) => {
    page.drawText(line, { x: 40, y: 500 - idx * 24, size: 12, font });
  });
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}

test('Compare runs sample visual and text diffs, steps across pages, and exports a Markdown report', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await navigate(page, 'Compare');
  await expect(page.getByRole('heading', { name: 'Compare PDFs', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Try sample comparison', exact: true }).click();
  await expect(page.getByTestId('compare-summary-heading')).toHaveText('1 of 2 pages changed');
  await expect(page.getByText('MSA_Agreement_v1.pdf', { exact: true })).toBeVisible();
  await expect(page.getByText('MSA_Agreement_v2.pdf', { exact: true })).toBeVisible();
  await expect(page.getByAltText('Document A, page 1')).toBeVisible();
  await expect(page.getByAltText('Document B, page 1')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Visual diff', exact: true }).click();
  await expect(page.getByTestId('visual-diff-image')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Text diff', exact: true }).click();
  const diffList = page.getByRole('list', { name: 'Text diff lines for page 1' });
  await expect(diffList).toContainText('Monthly Retainer Fee: $8,500.00 USD');
  await expect(diffList).toContainText('Monthly Retainer Fee: $9,200.00 USD');
  await expect(diffList).toContainText('Data Sovereignty Addendum');
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByTestId('compare-page-indicator')).toHaveText('Page 2 of 2');
  await expect(page.getByText('Page 2 text is identical in both documents.')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download .md report', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('compare_MSA_Agreement_v1_vs_MSA_Agreement_v2.md');
  const reportText = await readFile((await download.path())!, 'utf8');
  expect(reportText).toContain('# PDFy Comparison Report');
  expect(reportText).toContain('- Monthly Retainer Fee: $8,500.00 USD');
  expect(reportText).toContain('+ Monthly Retainer Fee: $9,200.00 USD');
  expect(reportText).toContain('## Page 2 — Unchanged');
});

test('Read hands off to Compare and Compare stays accessible without overflow at 320px in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');

  await page.getByLabel('PDF to read').setInputFiles(await createSimplePdf('draft-a.pdf', ['Proposal Alpha', 'Budget: $1000']));
  await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Compare PDF', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Compare PDFs', exact: true })).toBeVisible();
  await expect(page.locator('[data-tool="compare"]').getByText('draft-a.pdf', { exact: true })).toBeVisible();

  await page.getByLabel('Revised PDF (Document B)', { exact: true }).setInputFiles(
    await createSimplePdf('draft-b.pdf', ['Proposal Alpha', 'Budget: $1250']),
  );
  await expect(page.getByTestId('compare-summary-heading')).toHaveText('1 of 1 page changed');
  await page.getByRole('button', { name: 'Text diff', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Text diff lines for page 1' })).toContainText('Budget: $1250');
  await expectAccessible(page);

  const overflow = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewport);
});
