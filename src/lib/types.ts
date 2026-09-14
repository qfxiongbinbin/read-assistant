export type Level = 'A2' | 'B1' | 'B2';

export const LEVELS: readonly Level[] = ['A2', 'B1', 'B2'];

/** Where the simplified text is rendered. */
export type PanelMode = 'below' | 'side' | 'float';

export const PANEL_MODES: readonly PanelMode[] = ['below', 'side', 'float'];

/** Pronunciation variant. */
export type Accent = 'uk' | 'us';

export const ACCENTS: readonly Accent[] = ['uk', 'us'];

export const ACCENT_LOCALE: Record<Accent, string> = { uk: 'en-GB', us: 'en-US' };

export const ACCENT_LABEL: Record<Accent, string> = { uk: 'British', us: 'American' };

/** Bump when the result shape or the prompt contract changes; invalidates cached results. */
export const SCHEMA_VERSION = 'v2';

/** A key word or a key phrase, explained in simple English. */
export interface KeyTerm {
  term: string;
  simple: string;
}

export interface SimplifyResult {
  /** The same content, rewritten as short simple English sentences. */
  simplified: string;
  /** Single words worth noticing. */
  keyWords: KeyTerm[];
  /** Multi-word chunks worth noticing: collocations, phrasal verbs, fixed expressions. */
  keyPhrases: KeyTerm[];
}

export interface PhoneticEntry {
  uk: string;
  us: string;
  /** The British transcription was borrowed from the American one. */
  ukApprox: boolean;
  /** The American transcription was borrowed from the British one. */
  usApprox: boolean;
}

/** One level of the drill-down: a word explained in even simpler English. */
export interface ExplainResult {
  explanation: string;
  synonyms: string[];
}

export interface Settings {
  enabled: boolean;
  level: Level;
  panelMode: PanelMode;
  accent: Accent;
  phonetics: boolean;
  model: string;
  apiKey: string;
  disabledHosts: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  level: 'B1',
  panelMode: 'below',
  accent: 'uk',
  phonetics: true,
  model: 'deepseek-chat',
  apiKey: '',
  disabledHosts: [],
};

export const SETTINGS_KEY = 'ra:settings';

export type SimplifyRequest = {
  type: 'simplify';
  text: string;
  level: Level;
  model: string;
};

export type SimplifyResponse =
  | { ok: true; result: SimplifyResult; cached: boolean; attempts: number }
  | { ok: false; error: string; attempts: number };

export type GetSettingsRequest = { type: 'getSettings' };

export type ExplainRequest = {
  type: 'explain';
  word: string;
  /** The sentence the word was clicked in, so the right sense is explained. */
  context: string;
  level: Level;
  model: string;
};

export type ExplainResponse =
  | { ok: true; result: ExplainResult; cached: boolean; attempts: number }
  | { ok: false; error: string; attempts: number };

export type PhoneticsRequest = { type: 'phonetics'; words: string[] };

export type PhoneticsResponse =
  | { ok: true; entries: Record<string, PhoneticEntry> }
  | { ok: false; error: string };

export type RuntimeMessage =
  | SimplifyRequest
  | ExplainRequest
  | GetSettingsRequest
  | PhoneticsRequest;

export interface CachedEntry<T> {
  result: T;
  ts: number;
  level: Level;
  model: string;
}

export type CacheEntry = CachedEntry<SimplifyResult>;
export type ExplainCacheEntry = CachedEntry<ExplainResult>;
