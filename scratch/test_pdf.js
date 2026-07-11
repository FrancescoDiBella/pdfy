import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

async function testPdf(filename) {
  try {
    const data = fs.readFileSync(filename);
    console.log(`${filename}: first 10 bytes:`, data.subarray(0, 10).toString());
    const doc = await PDFDocument.load(data);
    console.log(`${filename}: Loaded successfully! Pages:`, doc.getPageCount());
  } catch (err) {
    console.error(`${filename}: Failed to load!`, err.message);
  }
}

async function run() {
  await testPdf('scratch/sample1.pdf');
  await testPdf('scratch/sample2.pdf');
  await testPdf('scratch/form.pdf');
}

run();
