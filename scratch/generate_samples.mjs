import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';

async function generate() {
  // Sample 1
  const pdf1 = await PDFDocument.create();
  const page1 = pdf1.addPage([500, 500]);
  page1.drawText('Sample PDF 1', { x: 50, y: 450, size: 30 });
  fs.writeFileSync('scratch/sample1.pdf', await pdf1.save());

  // Sample 2
  const pdf2 = await PDFDocument.create();
  const page2 = pdf2.addPage([500, 500]);
  page2.drawText('Sample PDF 2', { x: 50, y: 450, size: 30 });
  fs.writeFileSync('scratch/sample2.pdf', await pdf2.save());

  // Form
  const formPdf = await PDFDocument.create();
  const formPage = formPdf.addPage([500, 500]);
  formPage.drawText('Interactive Form', { x: 50, y: 450, size: 30 });
  const form = formPdf.getForm();
  
  const nameField = form.createTextField('Name');
  nameField.addToPage(formPage, { x: 50, y: 400, width: 200, height: 30 });
  
  const checkbox = form.createCheckBox('Agree');
  checkbox.addToPage(formPage, { x: 50, y: 350, width: 20, height: 20 });
  
  fs.writeFileSync('scratch/form.pdf', await formPdf.save());
  console.log('Sample PDFs generated successfully!');
}

generate().catch(console.error);
