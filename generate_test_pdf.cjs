const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');

async function createPdf() {
  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const fontSize = 30;
  page.drawText('This is some test text to edit.', {
    x: 50,
    y: height - 100,
    size: fontSize,
    font: timesRomanFont,
    color: rgb(0, 0.53, 0.71),
  });

  page.drawText('Second line of text here.', {
    x: 50,
    y: height - 200,
    size: fontSize,
    font: timesRomanFont,
    color: rgb(0.8, 0.1, 0.1),
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('test_document.pdf', pdfBytes);
  console.log('test_document.pdf created');
}

createPdf();
