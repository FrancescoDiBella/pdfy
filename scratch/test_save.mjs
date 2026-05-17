import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';

async function test() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  
  page.drawText('Double click to edit', {
    x: 50,
    y: 700,
    size: 16,
    color: rgb(0, 0, 0),
  });
  
  page.drawRectangle({
    x: 100,
    y: 600,
    width: 100,
    height: 100,
    borderColor: rgb(1, 0.2, 0.4),
    borderWidth: 2,
    color: rgb(1, 0.2, 0.4),
    opacity: 0.5,
  });

  const savedPdf = await pdfDoc.save();
  fs.writeFileSync('scratch/test_out.pdf', savedPdf);
  console.log('Saved! Size:', savedPdf.length);
}

test().catch(console.error);
