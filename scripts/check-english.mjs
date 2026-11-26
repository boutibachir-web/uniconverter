// Fails when French shows up in the UI strings of index.html.
//
// What is scanned
// - Text between tags in index.html, after <style>, <script>, and HTML comments
//   are removed.
// - The placeholder, title, aria-label, and alt values in that HTML.
// - Quoted strings inside <script>. Regular expressions are not strings, so the
//   accent letters inside sanitizeText stay out of this check.
//
// What counts as French
// - The letters é è ê ë à â î ï ô ù û ç œ and their capitals. German ä ö ü and ß
//   are not in that set, so customs labels such as Währung stay allowed.
// - These whole words, with or without accents: fichier, colonne, enregistrer,
//   annuler, veuillez, telecharger, apercu, glisser, deposer, choisir, feuille,
//   supprimer.
//
// Baseline
// scripts/french-ui-baseline.txt lists the UI strings already in the file.
// A new hit fails the check. A baseline line that is no longer a hit also fails,
// so you delete that line in the same change that translates the string.
//
// Run: node scripts/check-english.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'index.html');
const baselinePath = path.join(root, 'scripts', 'french-ui-baseline.txt');

const ACCENT = /[éèêëàâîïôùûçœÉÈÊËÀÂÎÏÔÙÛÇŒ]/;
const WORD = /\b(fichiers?|colonnes?|enregistrer|annuler|veuillez|t(?:e|é)l(?:e|é)charger|aper(?:c|ç)u|glisser|d(?:e|é)poser|choisir|feuilles?|supprimer)\b/i;

export function isFrenchUi(text) {
  return ACCENT.test(text) || WORD.test(text);
}

function htmlUiStrings(html) {
  const visible = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  for (const match of visible.matchAll(/>([^<]+)</g)) {
    const text = match[1].replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
  }
  for (const match of visible.matchAll(/\b(?:placeholder|title|aria-label|alt)="([^"]*)"/g)) {
    const text = match[1].replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
  }
  return out;
}

function scriptStrings(html) {
  const out = [];
  for (const block of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    // sanitizeText lists accented letters inside regular expressions. Those are
    // a character map, not text the user sees. A quote inside one of those
    // patterns would also confuse the string scan, so the whole function is skipped.
    const body = block[1].replace(/function sanitizeText\(s\) \{[\s\S]*?\n\}/, '');
    if (!body.trim()) continue;
    const re = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g;
    for (const match of body.matchAll(re)) {
      const raw = match[0].slice(1, -1);
      const text = raw.replace(/\s+/g, ' ').trim();
      if (text) out.push(text);
    }
  }
  return out;
}

export function frenchHits(html) {
  const hits = new Set();
  for (const text of [...htmlUiStrings(html), ...scriptStrings(html)]) {
    if (isFrenchUi(text)) hits.add(text);
  }
  return [...hits].sort();
}

export function readBaseline(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .sort();
}

export function compareHits(hits, baseline) {
  const hitSet = new Set(hits);
  const baseSet = new Set(baseline);
  const added = hits.filter(hit => !baseSet.has(hit));
  const removed = baseline.filter(line => !hitSet.has(line));
  return { added, removed };
}

function main() {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const baseline = readBaseline(fs.readFileSync(baselinePath, 'utf8'));
  const hits = frenchHits(html);
  const { added, removed } = compareHits(hits, baseline);
  if (!added.length && !removed.length) {
    console.log(`english check passed (${hits.length} known French UI string${hits.length === 1 ? '' : 's'})`);
    return;
  }
  console.error('French UI check failed.');
  console.error('The check looks at visible HTML text, placeholder/title/aria-label/alt values, and quoted script strings.');
  console.error('German umlauts are allowed. French accents and a short list of French UI words are not.');
  if (added.length) {
    console.error('New French UI strings:');
    for (const line of added) console.error('  + ' + line);
  }
  if (removed.length) {
    console.error('Baseline lines that are no longer in the UI. Delete them from scripts/french-ui-baseline.txt:');
    for (const line of removed) console.error('  - ' + line);
  }
  process.exit(1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
