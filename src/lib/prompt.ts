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
    '5. Replace idioms, phrasal verbs and nominalizations with plain verbs.',
    '   Example: "carry out an investigation" -> "investigate"; "put off" -> "delay".',
    '6. Keep proper nouns, product names and unavoidable technical terms unchanged.',
    '7. If a difficult term cannot be replaced, keep it and add a short simple-English gloss in parentheses.',
    '8. Keep the same number of paragraphs, in the same order.',
    '',
    'Target reading level: ' + level + ' (CEFR).',
    '',
    'Return JSON only, with exactly this shape:',
    '{"simplified": "...", "glossary": [{"term": "...", "simple": "..."}]}',
  ].join('\n');
}

export function userPrompt(text: string, violations: string[]): string {
  const parts = ['Rewrite this paragraph:', '', text];
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
