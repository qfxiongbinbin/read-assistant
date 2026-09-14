import { inFreqList } from '../data/enFreq';
import type { GlossaryEntry, SimplifyResult } from './types';

export const HARD_WORD_LIMIT = 0.1;
export const AVG_SENTENCE_WORD_LIMIT = 16;
export const MAX_SENTENCE_WORD_LIMIT = 25;

export interface VerifyOutcome {
  ok: boolean;
  violations: string[];
}

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;
const WORD = /[a-z][a-z'-]*/g;
const SENTENCE_SPLIT = /[^.!?]+[.!?]*/g;
const SUFFIXES = ['s', 'es', 'ed', 'd', 'ing', 'ly', 'er', 'est'];

export function containsCJK(text: string): boolean {
  return CJK.test(text);
}

export function words(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? [];
}

export function sentences(text: string): string[] {
  return (text.match(SENTENCE_SPLIT) ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
}

export function stems(word: string): string[] {
  const out = new Set<string>([word]);
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 2) {
      out.add(word.slice(0, word.length - suffix.length));
    }
  }
  if (word.endsWith('ies')) out.add(word.slice(0, -3) + 'y');
  if (word.endsWith('ing')) out.add(word.slice(0, -3) + 'e');
  if (word.endsWith('ed')) out.add(word.slice(0, -2) + 'e');
  if (word.endsWith('es')) out.add(word.slice(0, -2));
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) out.add(word.slice(0, -1));
  return [...out];
}

export function isKnownWord(word: string): boolean {
  return stems(word).some(inFreqList);
}

/** Capitalized tokens that are not at the start of a sentence: names, brands, technical terms. */
export function properNouns(text: string): Set<string> {
  const found = new Set<string>();
  let sentenceStart = true;
  for (const token of text.split(/\s+/)) {
    const head = /^[^A-Za-z]*([A-Za-z][A-Za-z'-]*)/.exec(token);
    if (head) {
      const word = head[1] ?? '';
      if (word.length > 0 && /^[A-Z]/.test(word) && !sentenceStart) found.add(word.toLowerCase());
    }
    sentenceStart = /[.!?]["')\]]*$/.test(token);
  }
  return found;
}

export function hardWords(text: string, exempt: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const word of words(text)) {
    if (word.length < 3) continue;
    if (exempt.has(word)) continue;
    if (isKnownWord(word)) continue;
    out.push(word);
  }
  return out;
}

export function hardRatio(text: string, exempt: ReadonlySet<string>): number {
  const all = words(text);
  if (all.length === 0) return 0;
  return hardWords(text, exempt).length / all.length;
}

export function missingNumbers(original: string, simplified: string): string[] {
  const present = new Set(simplified.match(/\d+/g) ?? []);
  const missing = new Set((original.match(/\d+/g) ?? []).filter((n) => !present.has(n)));
  return [...missing];
}

export function parseResult(raw: string): SimplifyResult | null {
  let text = raw.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  text = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const simplified = typeof parsed.simplified === 'string' ? parsed.simplified.trim() : '';
    if (!simplified) return null;
    const rawGlossary = Array.isArray(parsed.glossary) ? parsed.glossary : [];
    const glossary: GlossaryEntry[] = rawGlossary
      .filter(
        (g): g is { term: string; simple: string } =>
          !!g &&
          typeof (g as Record<string, unknown>).term === 'string' &&
          typeof (g as Record<string, unknown>).simple === 'string',
      )
      .slice(0, 8)
      .map((g) => ({ term: g.term.trim(), simple: g.simple.trim() }))
      .filter((g) => g.term.length > 0 && g.simple.length > 0);
    return { simplified, glossary };
  } catch {
    return null;
  }
}

export function verify(original: string, result: SimplifyResult): VerifyOutcome {
  const violations: string[] = [];
  const text = result.simplified;
  const sents = sentences(text);
  const all = words(text);
  const originalWords = words(original);

  if (containsCJK(text)) {
    violations.push('The output contained Chinese, Japanese or Korean characters. Output English only.');
  }
  if (sents.length === 0) {
    violations.push('The output had no complete sentences.');
  }

  const average = sents.length > 0 ? all.length / sents.length : all.length;
  if (average > AVG_SENTENCE_WORD_LIMIT) {
    violations.push(
      'Average sentence length was ' + average.toFixed(1) + ' words. Keep it under ' + AVG_SENTENCE_WORD_LIMIT + '.',
    );
  }

  const longest = sents.reduce((max, s) => Math.max(max, words(s).length), 0);
  if (longest > MAX_SENTENCE_WORD_LIMIT) {
    violations.push('The longest sentence had ' + longest + ' words. Split it; the limit is ' + MAX_SENTENCE_WORD_LIMIT + '.');
  }

  if (originalWords.length > 0 && all.length > originalWords.length * 2) {
    violations.push('The output was more than twice as long as the input. Be more concise.');
  }

  const exempt = properNouns(original);
  for (const entry of result.glossary) exempt.add(entry.term.toLowerCase());
  const ratio = hardRatio(text, exempt);
  if (ratio > HARD_WORD_LIMIT) {
    violations.push(
      'Too many uncommon words (' + Math.round(ratio * 100) + '%). Replace them with the 2000 most common English words.',
    );
  }

  const missing = missingNumbers(original, text);
  if (missing.length > 0) {
    violations.push('These numbers were missing from the output: ' + missing.join(', ') + '.');
  }

  if (originalWords.length > 0) {
    const before = hardRatio(original, properNouns(original));
    if (ratio > before + 0.05) {
      violations.push('The output was not simpler than the input. Simplify it further.');
    }
  }

  return { ok: violations.length === 0, violations };
}
