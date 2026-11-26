import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'test-results', 'screenshots');

const COLUMNS = [
  'Tarifnummer',
  'TN Schlüssel',
  'PR',
  'Ursprung',
  'Warenbeschreibung',
  'Rechnungsbetrag',
  'Rohmasse',
  'Eigenmasse',
  'Invoice No',
  'Währung',
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function useLocalLibraries(page) {
  const xlsxPath = require.resolve('xlsx/dist/xlsx.full.min.js');
  const excelPath = require.resolve('exceljs/dist/exceljs.min.js');
  await page.route('https://cdnjs.cloudflare.com/**', async route => {
    const url = route.request().url();
    if (url.includes('/xlsx/')) {
      await route.fulfill({ path: xlsxPath, contentType: 'application/javascript' });
      return;
    }
    if (url.includes('/exceljs/')) {
      await route.fulfill({ path: excelPath, contentType: 'application/javascript' });
      return;
    }
    await route.abort();
  });
  await page.route('https://raw.githubusercontent.com/**', route => route.abort());
}

async function openClean(page) {
  fs.mkdirSync(shots, { recursive: true });
  await useLocalLibraries(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#ph-country')).toHaveClass(/active/);
}

async function chooseSwitzerland(page) {
  await page.locator('.country-card', { hasText: 'FastLogistics LINEDROP' }).click();
  await expect(page.locator('#ph-upload')).toHaveClass(/active/);
}

async function mapColumns(page, shotPath) {
  await page.locator('#map-columns-btn').click();
  await expect(page.locator('#ph-mapping')).toHaveClass(/active/);
  for (const name of COLUMNS) {
    const exact = new RegExp(`^${escapeRegExp(name)}$`);
    await page.locator('#pool .marble', { hasText: exact }).click();
    await page.locator('#targets .target', { hasText: exact }).click();
  }
  if (shotPath) await page.screenshot({ path: shotPath });
  await page.locator('[data-action="go-configure"]').click();
  await expect(page.locator('#ph-configure')).toHaveClass(/active/);
}

async function generate(page, expectedCell) {
  await page.locator('#colli-input').fill('3');
  await page.locator('#gen-btn').click();
  await expect(page.locator('#modal-date')).toHaveClass(/open/);
  await page.locator('#date-input').fill('2024-06-15');
  await page.locator('[data-action="submit-date"]').click();
  await expect(page.locator('#ph-edit')).toHaveClass(/active/, { timeout: 15000 });
  await expect.poll(async () => {
    return page.locator('#edit-tbody input').evaluateAll(els => els.map(el => el.value));
  }).toContain(expectedCell);
  const err = page.locator('#err-configure.on, #err-mapping.on, #err-edit.on');
  if (await err.count()) {
    throw new Error(await err.first().innerText());
  }
}

test('load a file, save a profile, export xlsx', async ({ page }) => {
  await openClean(page);
  await page.screenshot({ path: path.join(shots, '01-choose-output.png') });

  await chooseSwitzerland(page);
  // sample.csv starts with a UTF-8 BOM. Without it, Schlüssel and Währung are misread.
  await page.setInputFiles('#file-input', path.join(root, 'tests/fixtures/sample.csv'));
  await expect(page.locator('.file-row')).toContainText('sample.csv');
  await expect(page.locator('.file-row')).toContainText('1 rows');
  await page.screenshot({ path: path.join(shots, '02-file-loaded.png') });

  await mapColumns(page, path.join(shots, '03-mapping.png'));

  await generate(page, 'Laptop');
  const values = await page.locator('#edit-tbody input').evaluateAll(els => els.map(el => el.value));
  expect(values).toContain('Laptop');
  expect(values).toContain('1.234');
  expect(values).toContain('84713000');
  await page.screenshot({ path: path.join(shots, '04-edit-grid.png'), fullPage: true });

  const profiles = await page.evaluate(() => JSON.parse(localStorage.getItem('ld_profiles_v1') || '[]'));
  expect(profiles).toHaveLength(1);
  expect(profiles[0].name).toMatch(/^auto_/);
  expect(profiles[0].mapping.Tarifnummer).toBe('Tarifnummer');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#edit-dl-btn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sample_LINEDROP.xlsx');

  await page.goto('/');
  await chooseSwitzerland(page);
  await page.setInputFiles('#file-input', path.join(root, 'tests/fixtures/sample.csv'));
  await expect(page.locator('.file-row')).toContainText('sample.csv');
  await page.locator('#map-columns-btn').click();
  await expect(page.locator('#ph-configure')).toHaveClass(/active/);
  await expect(page.locator('#ph-mapping')).not.toHaveClass(/active/);
  await expect(page.locator('#colli-input')).toBeVisible();
  await expect(page.locator('#ph-configure')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: path.join(shots, '05-profile-applied.png') });
});

test('an xls upload is exported as xlsx', async ({ page }) => {
  const XLSX = require('xlsx');
  const xlsPath = path.join(root, 'test-results', 'lines.xls');
  fs.mkdirSync(path.dirname(xlsPath), { recursive: true });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    COLUMNS,
    ['94051000', 'L1', '1', 'DE', 'Lamp', '8.5', '1.2', '1.0', 'INV-1', 'EUR'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Lines');
  XLSX.writeFile(wb, xlsPath, { bookType: 'xls' });

  await openClean(page);
  await chooseSwitzerland(page);
  await page.setInputFiles('#file-input', xlsPath);
  await expect(page.locator('.file-row')).toContainText('lines.xls');
  await mapColumns(page);
  await generate(page, 'Lamp');
  const values = await page.locator('#edit-tbody input').evaluateAll(els => els.map(el => el.value));
  expect(values).toContain('Lamp');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#edit-dl-btn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('lines_LINEDROP.xlsx');
  await page.screenshot({ path: path.join(shots, '06-xls-exported.png'), fullPage: true });
});
