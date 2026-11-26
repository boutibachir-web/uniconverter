import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp, bytes, sheetBuffer } from './load-app.mjs';
import { frenchHits, readBaseline, compareHits, isFrenchUi } from '../scripts/check-english.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let w;

before(() => {
  w = loadApp();
});

test('1.234 is a decimal, and a comma is not a thousands separator', () => {
  assert.equal(w.fmtNumStr('1.234'), 1.234);
  assert.equal(w.fmtNumStr('1,234'), 1.234);
  assert.equal(w.fmtNumStr('1.234,56'), 1.234);
  assert.equal(w.fmtNumStr(12.5), 12.5);
  assert.equal(w.fmtNumStr(''), '');
});

test('parseFile keeps the text 1.234 as the number 1.234', () => {
  const parsed = w.parseFile(bytes('Amount\n1.234\n'), 'amounts.csv');
  assert.equal(w.fmtNumStr(parsed.rows[0][0]), 1.234);
  assert.notEqual(w.fmtNumStr(parsed.rows[0][0]), 1234);
});

test('a file with 201 columns is parsed', () => {
  const headers = Array.from({ length: 201 }, (_, i) => `C${i + 1}`);
  const parsed = w.parseFile(bytes(headers.join(',') + '\n' + headers.map(() => '1').join(',') + '\n'), 'wide.csv');
  assert.equal(parsed.headers.length, 201);
  assert.equal(parsed.rows.length, 1);
});

test('amount and weight headers are not auto-assigned on the mapping screen', () => {
  const parsed = w.parseFile(bytes('amount,gross weight,net weight\n10,2,1\n'), 'weights.csv');
  w.localStorage.clear();
  w.S.files = [{ name: 'weights.csv', headers: parsed.headers, rows: parsed.rows, ext: 'csv' }];
  w.S.mapping = {};
  w.S.isConsignment = false;
  w.S.selectedProfile = w.OUTPUT_PROFILES.find(p => p.id === 'CH');
  w.goMapping();
  assert.equal(Object.keys(w.S.mapping).length, 0);
  assert.equal(w.document.getElementById('ph-mapping').classList.contains('active'), true);
});

test('consignment goods items match price and mass by header name', () => {
  const ab = sheetBuffer([
    ['Article Description', 'Total Price', 'Total Gross Mass', 'Total Net Mass', 'Commodity Code', 'Country of Origin'],
    ['Lamp', 10, 2, 1, '94051000', 'CN'],
  ], 'GoodsItems');
  const fd = { name: 'tms.xlsx', arrayBuffer: ab };
  const { C, dataRows } = w.readGoodsItemsSheet(fd);
  assert.equal(dataRows.length, 1);
  assert.equal(C.totalPrice, 1);
  assert.equal(C.totalGrossMass, 2);
  assert.equal(C.totalNetMass, 3);
  assert.equal(w.defaultSheet(ab), 'GoodsItems');
  assert.equal(w.isConsignmentFile('plain.xlsx', ab), true);
  assert.equal(w.isConsignmentFile('consign-export.csv', new ArrayBuffer(0)), true);
  assert.equal(w.isConsignmentFile('invoice.csv', new ArrayBuffer(0)), false);
});

test('header row detection skips a title line', () => {
  const idx = w.detectHeaderRow([
    ['Packing list'],
    ['HS Code', 'Origin', 'Amount'],
    [84713000, 'CN', 10],
  ]);
  assert.equal(idx, 1);
});

test('HS codes are padded to 8 digits and a leading quote is removed', () => {
  assert.equal(w.formatHsCode('1234'), '00001234');
  assert.equal(w.formatHsCode("'84713000"), '84713000');
  assert.equal(w.formatHsCode('8471300000'), '8471300000');
});

test('preference resolves yes/no, 1/0, and EU origin', () => {
  assert.equal(w.resolvePR('yes', 'yesno', ''), 1);
  assert.equal(w.resolvePR('non', 'yesno', ''), 0);
  assert.equal(w.resolvePR('1', '10', ''), 1);
  assert.equal(w.resolvePR('0', '10', ''), 0);
  assert.equal(w.resolvePR('', 'eu', 'DE'), 1);
  assert.equal(w.resolvePR('', 'eu', 'CN'), 0);
  assert.equal(w.resolvePR('', 'all0', 'DE'), 0);
});

test('text sanitising and header normalisation', () => {
  assert.equal(w.sanitizeText('äöü'), 'aeoeue');
  assert.equal(w.sanitizeText('café'), 'cafe');
  assert.equal(w.norm('HS_Code'), 'hs code');
  assert.equal(w.cleanHeaderName('Name_x000D_\n'), 'Name');
  assert.equal(w.isFormula('=A1'), true);
  assert.equal(w.isFormula('A1'), false);
});

test('CP1252 encoding maps the euro sign and replaces unknown characters', () => {
  const euro = w.toCP1252('€');
  assert.equal(euro[0], 0x80);
  const eAcute = w.toCP1252('é');
  assert.equal(eAcute[0], 0xE9);
  assert.equal(w.toCP1252('あ')[0], 0x3F);
});

test('input CSV is UTF-8 only with a BOM, and a CP1252 euro byte is not decoded', () => {
  const asFile = raw => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const cell = (raw, name) => String(w.parseFile(asFile(raw), name).rows[0][0]);
  const utf8 = new Uint8Array([
    0x4E, 0x61, 0x6D, 0x65, 0x2C, 0x51, 0x74, 0x79, 0x0A,
    0x63, 0x61, 0x66, 0xC3, 0xA9, 0x2C, 0x31, 0x0A,
  ]);
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF, ...utf8]);
  const cp1252 = new Uint8Array([
    0x4E, 0x61, 0x6D, 0x65, 0x2C, 0x51, 0x74, 0x79, 0x0A,
    0x63, 0x61, 0x66, 0xE9, 0x2C, 0x31, 0x0A,
  ]);
  const euro = new Uint8Array([0x4E, 0x2C, 0x51, 0x0A, 0x80, 0x2C, 0x31, 0x0A]);
  assert.equal(cell(utf8, 'utf8.csv'), 'caf\u00c3\u00a9');
  assert.equal(cell(bom, 'bom.csv'), 'café');
  assert.equal(cell(cp1252, 'cp.csv'), 'café');
  assert.equal(cell(euro, 'euro.csv').charCodeAt(0), 0x80);
  assert.notEqual(cell(euro, 'euro.csv'), '€');
});

test('saved profiles match column names and stay in localStorage', () => {
  w.localStorage.clear();
  const headers = ['HS Code', 'Amount'];
  w.S.files = [{ name: 'invoice_2024.csv', headers, ext: 'csv', sheetName: 'Sheet1' }];
  w.S.mapping = { Tarifnummer: { colIndex: 0, skipped: false } };
  w.S.selectedSheet = null;
  w.saveProfile('Broker');
  const stored = JSON.parse(w.localStorage.getItem('ld_profiles_v1'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].mapping.Tarifnummer, 'HS Code');
  assert.equal(stored[0].name, 'Broker');

  const applied = w.applyProfileData(stored[0].mapping, ['Notes', 'HS Code']);
  assert.equal(applied.Tarifnummer.colIndex, 1);

  w.S.files = [{ name: 'invoice_2024.csv', headers, ext: 'csv' }];
  assert.equal(w.bestProfile(headers).p.name, 'Broker');
  w.S.files = [{ name: 'invoice_2024.csv', headers: ['Amount', 'HS Code'], ext: 'csv' }];
  assert.equal(w.bestProfile(['Amount', 'HS Code']), null);

  for (let i = 0; i < 30; i++) w.saveProfile('P' + i);
  assert.equal(JSON.parse(w.localStorage.getItem('ld_profiles_v1')).length, 25);
});

test('consolidation sums amounts for the same tariff, origin, and preference', () => {
  w.S.selectedProfile = w.OUTPUT_PROFILES.find(p => p.id === 'CH');
  w.S.profileSettings = {};
  const blank = () => Array(21).fill('');
  const a = blank();
  const b = blank();
  a[2] = 1; a[4] = '84713000'; a[5] = 'A1'; a[7] = '1'; a[8] = 'CN'; a[9] = 'Lamp'; a[10] = 10; a[12] = 2; a[13] = 1;
  b[2] = 0; b[4] = '84713000'; b[5] = 'A2'; b[7] = '1'; b[8] = 'CN'; b[9] = 'Bulb'; b[10] = 2.5; b[12] = 1; b[13] = 0.5;
  const other = blank();
  other[4] = '11111111'; other[7] = '0'; other[8] = 'US'; other[9] = 'Box'; other[10] = 9;
  const rows = w.consolidateRows([a, b, other], 'full');
  assert.equal(rows.length, 2);
  const grouped = rows.find(r => r[4] === '84713000');
  assert.equal(grouped[10], 12.5);
  assert.equal(grouped[12], 3);
  assert.match(String(grouped[9]), /Lamp/);
  assert.match(String(grouped[9]), /Bulb/);
});

test('HS lookup reads the reference sheet by column name', () => {
  const ab = sheetBuffer([
    ['Customer BU', 'SKU', 'HS Code', 'Description', 'Key'],
    ['543032', 'ABC', '84713000', 'Laptop', 'K9'],
  ]);
  w.S.hsDb = w.parseHsDb(ab);
  w.S.hsBU = '543032';
  assert.equal(JSON.stringify(w.lookupHs('ABC', '')), JSON.stringify({ hs: '84713000', tnKey: 'K9' }));
  assert.equal(w.lookupHs('missing', 'nope'), null);
  assert.equal(w.hsValidate('123'), 'HS code must be 8–10 digits (got 3).');
  assert.equal(w.hsValidate('84713000'), null);
});

test('output profiles on this branch are the built-in country list', () => {
  const ids = w.OUTPUT_PROFILES.map(p => p.id);
  assert.equal(JSON.stringify(ids), JSON.stringify(['CH', 'DE', 'NL', 'PL', 'AT', 'BE']));
  assert.equal(JSON.stringify(w.OUTPUT_PROFILES.filter(p => p.ready).map(p => p.id)), JSON.stringify(['CH', 'DE']));
  assert.equal(w.LD_HEADER_TITLES.length, 21);
  assert.equal(w.DBH_HEADERS.length, 16);
});

test('the English check flags French UI and allows German customs labels', () => {
  assert.equal(isFrenchUi('Währung'), false);
  assert.equal(isFrenchUi('Anzahl'), false);
  assert.equal(isFrenchUi('Drop your file.'), false);
  assert.equal(isFrenchUi('Référence expédition'), true);
  assert.equal(isFrenchUi('Veuillez choisir un fichier'), true);

  const sample = '<p>Währung</p><input placeholder="Référence expédition"><script>showErr("enregistrer le fichier");</script>';
  const hits = frenchHits(sample);
  assert.deepEqual(hits, ['Référence expédition', 'enregistrer le fichier']);

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const baseline = readBaseline(fs.readFileSync(path.join(root, 'scripts', 'french-ui-baseline.txt'), 'utf8'));
  const { added, removed } = compareHits(frenchHits(html), baseline);
  assert.deepEqual(added, []);
  assert.deepEqual(removed, []);
});
