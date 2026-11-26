// Load index.html in jsdom with the same SheetJS and ExcelJS versions the page
// requests from the CDN. The CDN script tags are removed so the test does not
// need a network, and the libraries are attached before the inline script runs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadApp() {
  const XLSX = require('xlsx');
  const ExcelJS = require('exceljs');
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html.replace(/<script\s+src="https:\/\/cdnjs\.cloudflare\.com[^"]*"><\/script>/g, '');
  // const and let bindings are not properties of window. The test copy exposes
  // the ones the tests set up. index.html on disk is unchanged.
  if ((html.match(/<\/script>/g) || []).length !== 1) {
    throw new Error('expected one inline script after removing the CDN tags');
  }
  html = html.replace(
    '</script>',
    'window.S = S; window.OUTPUT_PROFILES = OUTPUT_PROFILES; window.LD_HEADER_TITLES = LD_HEADER_TITLES; window.DBH_HEADERS = DBH_HEADERS;\n</script>'
  );

  const virtualConsole = new VirtualConsole();
  const logs = [];
  virtualConsole.on('jsdomError', error => logs.push(String(error)));

  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.XLSX = XLSX;
      window.ExcelJS = ExcelJS;
      window.fetch = async () => ({ ok: false, status: 0, arrayBuffer: async () => new ArrayBuffer(0) });
    },
  });

  if (typeof dom.window.parseFile !== 'function') {
    throw new Error('index.html did not load. ' + logs.join('\n'));
  }
  dom.window.__loadLogs = logs;
  return dom.window;
}

export function bytes(text) {
  const u = new TextEncoder().encode(text);
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
}

export function sheetBuffer(rows, name = 'Sheet1', bookType = 'xlsx') {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, name);
  const out = XLSX.write(wb, { type: 'buffer', bookType });
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}
