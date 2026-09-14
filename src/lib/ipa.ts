import type { Accent, PhoneticEntry } from './types';

/** word -> [uk IPA, us IPA]; either side may be an empty string. */
export type IpaTable = Map<string, [string, string]>;

/** Parses the generated \`en.tsv\`: one \`word<TAB>uk<TAB>us\` per line. */
export function parseTsv(text: string): IpaTable {
  const table: IpaTable = new Map();
  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    const first = line.indexOf('\t');
    if (first === -1) continue;
    const second = line.indexOf('\t', first + 1);
    if (second === -1) continue;
    table.set(line.slice(0, first), [line.slice(first + 1, second), line.slice(second + 1)]);
  }
  return table;
}

/** Common spelling differences, used only as a fallback when a word is missing. */
const TO_UK: readonly [RegExp, string][] = [
  [/izations$/, 'isations'],
  [/ization$/, 'isation'],
  [/izing$/, 'ising'],
  [/izes$/, 'ises'],
  [/ized$/, 'ised'],
  [/ize$/, 'ise'],
  [/yze$/, 'yse'],
  [/og$/, 'ogue'],
  [/or$/, 'our'],
  [/er$/, 're'],
];

const TO_US: readonly [RegExp, string][] = [
  [/isations$/, 'izations'],
  [/isation$/, 'ization'],
  [/ising$/, 'izing'],
  [/ises$/, 'izes'],
  [/ised$/, 'ized'],
  [/ise$/, 'ize'],
  [/yse$/, 'yze'],
  [/ogue$/, 'og'],
  [/our$/, 'or'],
  [/re$/, 'er'],
];

export function variants(word: string, accent: Accent): string[] {
  const rules = accent === 'uk' ? TO_UK : TO_US;
  const out = [word];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(word)) out.push(word.replace(pattern, replacement));
  }
  return out;
}

/**
 * Resolves IPA for each word. Falls back in this order:
 * exact match -> spelling variant -> the other accent (flagged as approximate).
 */
export function lookupWords(
  table: IpaTable,
  words: readonly string[],
): Record<string, PhoneticEntry> {
  const out: Record<string, PhoneticEntry> = {};

  for (const raw of words) {
    const word = raw.toLowerCase();
    if (word.length === 0 || word in out) continue;

    let uk = table.get(word)?.[0] ?? '';
    let us = table.get(word)?.[1] ?? '';

    if (!uk) {
      for (const candidate of variants(word, 'uk')) {
        const found = table.get(candidate)?.[0];
        if (found) {
          uk = found;
          break;
        }
      }
    }
    if (!us) {
      for (const candidate of variants(word, 'us')) {
        const found = table.get(candidate)?.[1];
        if (found) {
          us = found;
          break;
        }
      }
    }

    let ukApprox = false;
    let usApprox = false;
    if (!uk && us) {
      uk = us;
      ukApprox = true;
    }
    if (!us && uk) {
      us = uk;
      usApprox = true;
    }

    if (uk || us) out[word] = { uk, us, ukApprox, usApprox };
  }

  return out;
}

/** Splits text into lowercase lookup words. */
export function lookupTokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
}
