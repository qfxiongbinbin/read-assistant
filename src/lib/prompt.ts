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
