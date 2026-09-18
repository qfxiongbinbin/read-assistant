import type { Level } from './types';

export const DEFAULT_MODEL = 'deepseek-chat';
export const ALLOWED_MODELS: readonly string[] = ['deepseek-chat', 'deepseek-reasoner'];

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function systemPrompt(level: Level): string {
  return [
    'You rewrite English text so an English learner can read it directly, without translating it into their first language.',
    '',
    'HARD RULES',
    '1. Output English only. Never translate. Never output Chinese or any other language.',
    '2. Preserve every fact, number, name, date and logical relation. Add nothing, remove nothing.',
    '3. Prefer the 2000 most common English words whenever a choice exists.',
    '4. Max 14 words per sentence. One idea per sentence. Prefer active voice and subject-verb-object order.',
    '5. If the input is one long sentence, break it into two to four short simple sentences.',
    '6. Replace idioms, phrasal verbs and nominalizations with plain verbs.',
    '   Example: "carry out an investigation" -> "investigate"; "put off" -> "delay".',
    '7. Keep proper nouns, product names and unavoidable technical terms unchanged.',
    '8. If a difficult term cannot be replaced, keep it and add a short simple-English gloss in parentheses.',
    '9. Keep the same number of paragraphs, in the same order.',
    '',
    'EXTRACTION',
    '- keyWords: 3 to 6 single words from the input that a learner should notice. Copy the exact word from the input.',
    '- keyPhrases: 1 to 4 multi-word chunks from the input that a learner should notice.',
    '  These are collocations, phrasal verbs or fixed expressions. Copy the exact words from the input.',
    '- Explain every entry in simple English, 8 words or fewer. Never explain in Chinese.',
    '',
    'Target reading level: ' + level + ' (CEFR).',
    '',
    'Return JSON only, with exactly this shape:',
    '{"simplified": "...", "keyWords": [{"term": "...", "simple": "..."}], "keyPhrases": [{"term": "...", "simple": "..."}]}',
  ].join('\n');
}

export function userPrompt(text: string, violations: string[]): string {
  const parts = ['Rewrite this part:', '', text];
  if (violations.length > 0) {
    parts.push('', 'Your previous attempt was rejected. Fix every problem below and return the full JSON again:');
    for (const v of violations) parts.push('- ' + v);
  }
  return parts.join('\n');
}

export function buildMessages(text: string, level: Level, violations: string[] = []): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt(level) },
    { role: 'user', content: userPrompt(text, violations) },
  ];
}

/** Restating a word or a short phrase with the simplest words — still English, never a translation. */
export function translateSystemPrompt(): string {
  return [
    'You help an English learner who is stuck on an English word or a short phrase.',
    'You never translate. You say the same thing again with the simplest English words.',
    '',
    'HARD RULES',
    '1. English only. Never translate. Never output Chinese or any other language.',
    '2. Keep the same meaning. Add no fact that is not already in the input.',
    '3. Use only the 1000 most common English words, except for names and numbers.',
    '4. Keep proper nouns, product names and numbers exactly as they are.',
    '',
    'OUTPUT',
    '- plainWords: the 1 to 4 hardest items in the input. Copy each "term" from the input, in its original form.',
    '  "simple" is the easiest word or two that means the same thing here. Three words at most.',
    '  Leave the list empty only when every word in the input is already simple.',
    '- plainSentence: the whole input said again in simple words. One to three sentences, 4 to 14 words each.',
    '  If the input is longer than one sentence, keep only its main points.',
    '  Do not reuse a hard word from the input in this sentence; saying it another way is the whole point.',
    '',
    'EXAMPLES',
    'input "fascinating"',
    '{"plainWords":[{"term":"fascinating","simple":"very interesting"}],"plainSentence":"It makes you want to know more."}',
    'input "carry out an investigation"',
    '{"plainWords":[{"term":"carry out","simple":"do"},{"term":"investigation","simple":"check"}],"plainSentence":"To try to find out what happened."}',
    '',
    'Return JSON only, with exactly this shape:',
    '{"plainWords": [{"term": "...", "simple": "..."}], "plainSentence": "..."}',
  ].join('\n');
}

export function buildTranslateMessages(text: string, violations: string[] = []): ChatMessage[] {
  const parts = ['Say this again with simpler words:', '', text];
  if (violations.length > 0) {
    parts.push('', 'Your previous attempt was rejected. Fix every problem below and return the full JSON again:');
    for (const violation of violations) parts.push('- ' + violation);
  }
  return [
    { role: 'system', content: translateSystemPrompt() },
    { role: 'user', content: parts.join('\n') },
  ];
}

/** One step deeper: explain a single word using only the easiest English. */
export function explainSystemPrompt(): string {
  return [
    'You explain one English word or short phrase to an English learner who is reading in English.',
    'The learner did not understand the word, so your explanation must be easier than the word itself.',
    '',
    'HARD RULES',
    '1. English only. Never translate. Never output Chinese or any other language.',
    '2. Use only the 1000 most common English words.',
    '3. The explanation must be ONE sentence, 4 to 12 words long.',
    '4. Never use the word being explained, or any form of it, in the explanation.',
    '5. If the word has several meanings, explain the meaning used in the given sentence.',
    '6. Add up to 3 synonyms. Prefer simpler or equally common words. Never repeat the word itself.',
    '',
    'Return JSON only, with exactly this shape:',
    '{"explanation": "...", "synonyms": ["...", "..."]}',
  ].join('\n');
}

export function buildExplainMessages(
  word: string,
  context: string,
  violations: string[] = [],
): ChatMessage[] {
  const clipped = context.replace(/\s+/g, ' ').trim().slice(0, 400);
  const parts = ['Explain this word: ' + word];
  if (clipped.length > 0) {
    parts.push('', 'It appears here:', clipped);
  }
  if (violations.length > 0) {
    parts.push('', 'Your previous attempt was rejected. Fix every problem below and return the full JSON again:');
    for (const violation of violations) parts.push('- ' + violation);
  }
  return [
    { role: 'system', content: explainSystemPrompt() },
    { role: 'user', content: parts.join('\n') },
  ];
}
