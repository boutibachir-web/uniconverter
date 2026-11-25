import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../profile-logic.js');

test('name match ignores accents and picks the known field', () => {
  assert.equal(L.matchSourceField('Désignation'), 'Warenbeschreibung');
  assert.equal(L.matchSourceField('Montant'), 'Rechnungsbetrag');
  assert.equal(L.matchSourceField('Origine'), 'Ursprung');
  assert.equal(L.matchSourceField('HS code'), 'Tarifnummer');
  assert.equal(L.matchSourceField('Verpackung'), '');
});

test('content patterns detect HS codes, countries and currencies', () => {
  const hs = L.detectField('Code', ['8471300000', '8517120000', '6109100000']);
  assert.equal(hs.field, 'Tarifnummer');
  assert.equal(hs.confidence, 'medium');
  assert.equal(hs.via, 'values');

  const origin = L.detectField('Col 4', ['CN', 'DE', 'CH']);
  assert.equal(origin.field, 'Ursprung');
  assert.equal(origin.via, 'values');

  const money = L.detectField('Ccy', ['USD', 'EUR', 'CHF']);
  assert.equal(money.field, 'Währung');

  const both = L.detectField('Country of origin', ['CN', 'DE']);
  assert.equal(both.field, 'Ursprung');
  assert.equal(both.confidence, 'high');
  assert.equal(both.via, 'name+values');
});

test('a name match wins when the values look like something else', () => {
  const det = L.detectField('Description', ['8471300000', '8517120000']);
  assert.equal(det.field, 'Warenbeschreibung');
  assert.equal(det.confidence, 'medium');
  assert.equal(L.confidenceTag(det).text, 'Check');
});

test('auto-map uses each column and each field once, highest score first', () => {
  const headers = ['Code', 'HS Code', 'Origin', 'Notes'];
  const rows = [
    ['8471300000', '8517120000', 'CN', 'hello'],
    ['6109100000', '4202120000', 'DE', 'world'],
  ];
  const fields = [
    { k: 'Tarifnummer' },
    { k: 'Ursprung' },
    { k: 'Warenbeschreibung' },
  ];
  const mapping = L.autoMapSourceFields(headers, fields, rows);
  assert.equal(mapping.Tarifnummer.colIndex, 1);
  assert.equal(mapping.Tarifnummer.confidence, 'high');
  assert.equal(mapping.Ursprung.colIndex, 2);
  assert.equal(mapping.Warenbeschreibung, undefined);
  assert.equal(L.confidenceTag(mapping.Tarifnummer).text, 'Auto');
  assert.equal(L.confidenceTag({ fromSaved: true }).text, 'Saved');
});

test('template columns are suggested from the header and the sample values', () => {
  const cols = L.buildColumnObjects(
    ['Tarifnummer', 'Code', 'Verpackung'],
    [['8471300000', '8517120000', 'PAK'], ['6109100000', '4202120000', 'CTN']]
  );
  assert.equal(cols[0].source, 'Tarifnummer');
  assert.equal(cols[0].confidence, 'high');
  assert.equal(cols[1].source, 'Tarifnummer');
  assert.equal(cols[1].via, 'values');
  assert.equal(cols[2].source, '');
});

test('preview follows the mapping and switches to client rows', () => {
  const id = (s, raw) => raw;
  const draft = {
    sampleRows: [['8471300000', 'Laptop', 'PAK']],
    clientSample: null,
    clientFieldMap: {},
  };
  const empty = { name: 'Verpackung', source: '' };
  assert.equal(L.previewProfileCell(empty, 2, 0, draft, id).text, 'PAK');
  assert.equal(L.previewProfileCell(empty, 2, 0, draft, id).kind, 'example');

  const fixed = { name: 'Verpackung', source: L.FIXED_SOURCE, fixed: 'CTN' };
  assert.deepEqual(L.previewProfileCell(fixed, 2, 0, draft, id), { text: 'CTN', kind: 'fixed' });

  draft.clientSample = { rows: [['ABC-1', 'Laptop 14 inch']] };
  draft.clientFieldMap = { 1: 'Warenbeschreibung' };
  const desc = { name: 'Warenbeschreibung', source: 'Warenbeschreibung' };
  const live = L.previewProfileCell(desc, 1, 0, draft, (source, raw) => raw + '/' + source);
  assert.equal(live.kind, 'live');
  assert.equal(live.text, 'Laptop 14 inch/Warenbeschreibung');

  const unmappedClient = L.previewProfileCell({ name: 'Tarifnummer', source: 'Tarifnummer' }, 0, 0, draft, id);
  assert.equal(unmappedClient.kind, 'example');
  assert.equal(unmappedClient.text, '8471300000');
});
