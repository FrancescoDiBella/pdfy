const fs = require('fs');
const pdfjs = require('pdfjs-dist');

async function test() {
  const bytes = fs.readFileSync('test_document.pdf');
  const loadingTask = pdfjs.getDocument(new Uint8Array(bytes));
  const doc = await loadingTask.promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1.0 });
  console.log('pdf.js viewport size:', viewport.width, viewport.height);
  
  const textContent = await page.getTextContent();
  console.log('first text item transform:', textContent.items[0].transform);
  console.log('first text item height/width:', textContent.items[0].width, textContent.items[0].height);
}
test();
