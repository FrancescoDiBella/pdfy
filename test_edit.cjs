const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');

async function run() {
  const bytes = fs.readFileSync('test_document.pdf');
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const page = pages[0];
  
  // We'll mimic what exportPDF does for edit-text
  // originalPdfX, originalPdfY, originalPdfW, originalPdfH
  const originalPdfX = 50;
  const originalPdfY = 841.89 - 100; // wait, my original was y = height - 100.
  // let's just get the size.
  const { width, height } = page.getSize();
  console.log(width, height); // e.g., 595.28, 841.89
  const ty = height - 100;
  const h = 30; // size we used

  const mr = 1, mg = 1, mb = 1; // white mask
  page.drawRectangle({
    x: originalPdfX,
    y: ty, // In pdf.js transform[5] is the baseline. We used `y: height - 100` which is baseline in drawText.
    width: 300,
    height: h,
    color: rgb(mr, mg, mb),
  });

  // Now we draw new text.
  // In the app, py = ph - ((el.y + el.height) * sy).
  // If original ty was height - 100.
  // y was ph - ty - h = 842 - 742 - 30 = 70.
  // el.y is 70, el.height is 30.
  // bottom of bbox in screen is 100.
  // py = ph - 100 = 742.
  // Then we drawText at py + 2 = 744.
  const py = height - (70 + 30); // 742

  page.drawText('This text is replaced!', {
    x: 50,
    y: py + 2,
    size: 30,
    color: rgb(0, 0, 0),
  });

  const saved = await doc.save();
  fs.writeFileSync('edited_document.pdf', saved);
}
run();
