import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractTablesFromPages,
  serializeTableToCSV,
  serializeTableToJSON,
  serializeTableToMarkdown,
  serializeTableToTSV,
} from '../src/utils/pdfTableExtract.ts';

function buildInvoiceTextItems() {
  return [
    // Title paragraph (single column, ignored)
    { str: 'COMMERCIAL INVOICE', transform: [14, 0, 0, 14, 48, 780], width: 150 },
    // Table header row at y=600
    { str: 'DESCRIPTION', transform: [9, 0, 0, 9, 60, 600], width: 70 },
    { str: 'HOURS', transform: [9, 0, 0, 9, 340, 600], width: 38 },
    { str: 'RATE', transform: [9, 0, 0, 9, 410, 600], width: 32 },
    { str: 'AMOUNT', transform: [9, 0, 0, 9, 485, 600], width: 46 },
    // Row 1 at y=566
    { str: 'Core Architecture, Phase "A"', transform: [10, 0, 0, 10, 60, 566], width: 170 },
    { str: '42.0', transform: [10, 0, 0, 10, 340, 566], width: 24 },
    { str: '$185.00', transform: [10, 0, 0, 10, 410, 566], width: 42 },
    { str: '$7,770.00', transform: [10, 0, 0, 10, 485, 566], width: 52 },
    // Row 2 at y=532
    { str: 'Security Audit & Hardening', transform: [10, 0, 0, 10, 60, 532], width: 155 },
    { str: '16.0', transform: [10, 0, 0, 10, 340, 532], width: 24 },
    { str: '$210.00', transform: [10, 0, 0, 10, 410, 532], width: 42 },
    { str: '$3,360.00', transform: [10, 0, 0, 10, 485, 532], width: 52 },
  ];
}

test('extractTablesFromPages detects aligned multi-column tables and ignores prose headers', () => {
  const tables = extractTablesFromPages([{ pageNumber: 1, items: buildInvoiceTextItems() }]);
  assert.equal(tables.length, 1);
  assert.equal(tables[0].pageNumber, 1);
  assert.equal(tables[0].columnCount, 4);
  assert.equal(tables[0].rows.length, 3);
  assert.deepEqual(tables[0].rows[0], ['DESCRIPTION', 'HOURS', 'RATE', 'AMOUNT']);
  assert.deepEqual(tables[0].rows[1], ['Core Architecture, Phase "A"', '42.0', '$185.00', '$7,770.00']);
  assert.deepEqual(tables[0].rows[2], ['Security Audit & Hardening', '16.0', '$210.00', '$3,360.00']);
});

test('CSV, TSV, Markdown, and JSON serializers properly quote special characters and handle headers', () => {
  const [table] = extractTablesFromPages([{ pageNumber: 1, items: buildInvoiceTextItems() }]);

  const csv = serializeTableToCSV(table, true);
  assert.ok(csv.includes('"Core Architecture, Phase ""A""",42.0,$185.00,"$7,770.00"'));

  const tsv = serializeTableToTSV(table, true);
  assert.ok(tsv.includes('DESCRIPTION\tHOURS\tRATE\tAMOUNT'));
  assert.ok(tsv.includes('Security Audit & Hardening\t16.0\t$210.00\t$3,360.00'));

  const md = serializeTableToMarkdown(table, true);
  assert.ok(md.includes('| DESCRIPTION | HOURS | RATE | AMOUNT |'));
  assert.ok(md.includes('| --- | --- | --- | --- |'));

  const parsedJson = JSON.parse(serializeTableToJSON(table, true));
  assert.equal(parsedJson.length, 2);
  assert.equal(parsedJson[0].DESCRIPTION, 'Core Architecture, Phase "A"');
  assert.equal(parsedJson[0].AMOUNT, '$7,770.00');

  const noHeaderJson = JSON.parse(serializeTableToJSON(table, false));
  assert.equal(noHeaderJson.length, 3);
  assert.equal(noHeaderJson[0]['Column 1'], 'DESCRIPTION');
});
