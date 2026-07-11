const fs = require('fs');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

async function test() {
  const bytes = fs.readFileSync('test_document.pdf');
  const loadingTask = pdfjs.getDocument(new Uint8Array(bytes));
  const doc = await loadingTask.promise;
  const page = await doc.getPage(1);
  
  const textContent = await page.getTextContent();
  const firstItem = textContent.items[0];
  console.log('first text item:', firstItem);
  console.log('styles:', textContent.styles);
  
  if (firstItem.fontName && textContent.styles[firstItem.fontName]) {
    console.log('Font info:', textContent.styles[firstItem.fontName]);
  }
}
test();
