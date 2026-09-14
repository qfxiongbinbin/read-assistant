// Regenerates public/ipa/en.tsv from tmp/ipa/en_UK.txt + en_US.txt
// Source: https://github.com/open-dict-data/ipa-dict (MIT, (c) 2016 dohliam)
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = {
  uk: resolve(root, 'tmp/ipa/en_UK.txt'),
  us: resolve(root, 'tmp/ipa/en_US.txt'),
};
const TARGET = resolve(root, 'public/ipa/en.tsv');
const KEY = /^[a-z][a-z'-]*$/;

/** An entry can list several variants ("/a/, /b/"); keep the first. */
function firstIpa(raw) {
  return raw.split(',')[0].trim().replace(/^\/+/, '').replace(/\/+$/, '').trim();
}

function readIpa(path) {
  const map = new Map();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const word = line.slice(0, tab);
    if (!KEY.test(word)) continue;
    const ipa = firstIpa(line.slice(tab + 1));
    if (ipa) map.set(word, ipa);
  }
  return map;
}

const uk = readIpa(SOURCES.uk);
const us = readIpa(SOURCES.us);
const words = [...new Set([...uk.keys(), ...us.keys()])].sort();

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(
  TARGET,
  words.map((w) => w + '\t' + (uk.get(w) ?? '') + '\t' + (us.get(w) ?? '')).join('\n') + '\n',
  'utf8',
);

console.log('UK entries:', uk.size);
console.log('US entries:', us.size);
console.log('merged words:', words.length);
console.log('wrote public/ipa/en.tsv =', (statSync(TARGET).size / 1024 / 1024).toFixed(2), 'MB');
