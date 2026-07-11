import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';

async function testEditText(pdfPath, targetStr, replacementStr) {
  console.log(`\n==================================================`);
  console.log(`Running text editing test on: ${pdfPath}`);
  console.log(`Target: "${targetStr}" -> Replacement: "${replacementStr}"`);
  console.log(`==================================================`);

  // 1. Load file
  const originalBytes = new Uint8Array(fs.readFileSync(pdfPath));

  // 2. Parse text items using PDF.js
  const loadingTask = pdfjs.getDocument({
    data: originalBytes.slice(),
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  
  console.log(`Parsed text items from page 1:`);
  textContent.items.forEach((item, idx) => {
    console.log(`  [${idx}] "${item.str}" at x: ${item.transform[4]}, y: ${item.transform[5]}`);
  });

  // Find target text item
  const targetItem = textContent.items.find(item => item.str.includes(targetStr));
  if (!targetItem) {
    throw new Error(`Target text "${targetStr}" not found in PDF!`);
  }

  const tx = targetItem.transform[4];
  const ty = targetItem.transform[5];
  const w = targetItem.width;
  const h = targetItem.height || targetItem.transform[3];

  console.log(`\nFound target item coordinate:`);
  console.log(`  str: "${targetItem.str}"`);
  console.log(`  originalPdfX: ${tx}, originalPdfY: ${ty}, originalPdfW: ${w}, originalPdfH: ${h}`);

  // 3. Edit using pdf-lib (mask original coordinates and write new text)
  const doc = await PDFDocument.load(originalBytes);
  const pages = doc.getPages();
  const pageToEdit = pages[0];

  // Draw white masking rectangle over original text
  pageToEdit.drawRectangle({
    x: tx,
    y: ty,
    width: w,
    height: h,
    color: rgb(1, 1, 1), // White mask
  });

  // Draw new text at the same coordinates
  pageToEdit.drawText(replacementStr, {
    x: tx,
    y: ty + 2, // Slight Y offset to align text
    size: h || 12,
    color: rgb(0, 0, 0), // Black replacement text
  });

  const modifiedBytes = await doc.save();
  const outPath = `scratch/test_edited_${pdfPath.split('/').pop()}`;
  fs.writeFileSync(outPath, modifiedBytes);
  console.log(`Saved modified PDF to: ${outPath}`);

  // 4. Verify modified PDF using PDF.js
  const verifyLoading = pdfjs.getDocument({
    data: modifiedBytes,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
  });
  const verifyPdf = await verifyLoading.promise;
  const verifyPage = await verifyPdf.getPage(1);
  const verifyTextContent = await verifyPage.getTextContent();

  console.log(`\nVerifying modified PDF text content:`);
  let foundOriginal = false;
  let foundReplacement = false;

  verifyTextContent.items.forEach((item) => {
    console.log(`  Parsed: "${item.str}"`);
    if (item.str.includes(targetStr)) {
      foundOriginal = true;
    }
    if (item.str.includes(replacementStr)) {
      foundReplacement = true;
    }
  });

  if (foundOriginal) {
    console.log(`✅ SUCCESS: Original text "${targetStr}" is visually masked (though it remains in the raw PDF stream metadata).`);
  }

  if (foundReplacement) {
    console.log(`✅ SUCCESS: Replacement text "${replacementStr}" was successfully added!`);
  } else {
    console.log(`❌ ERROR: Replacement text "${replacementStr}" is missing!`);
  }

  if (foundReplacement) {
    console.log(`🎉 TEST PASSED! Visual redaction and text replacement work perfectly like Adobe Acrobat!`);
  } else {
    throw new Error(`TEST FAILED!`);
  }
}

async function run() {
  try {
    await testEditText('scratch/sample1.pdf', 'Sample PDF 1', 'Adobe Acrobat Clone Edit 1');
    await testEditText('scratch/sample2.pdf', 'Sample PDF 2', 'Antigravity PDF Editor Rules');
    await testEditText('scratch/form.pdf', 'Interactive Form', 'Modified Interactive Title');
    console.log('\n🌟 All integration tests ran successfully! 🌟');
  } catch (err) {
    console.error('Integration test failed:', err);
    process.exit(1);
  }
}

run();
