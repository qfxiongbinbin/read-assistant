export type Level = 'A2' | 'B1' | 'B2';

export const LEVELS: readonly Level[] = ['A2', 'B1', 'B2'];

/** Where the simplified text is rendered. */
export type PanelMode = 'below' | 'side' | 'float';

export const PANEL_MODES: readonly PanelMode[] = ['below', 'side', 'float'];

export interface GlossaryEntry {
  term: string;
  simple: string;
}

export interface SimplifyResult {
  simplified: string;
  glossary: GlossaryEntry[];
}

export interface Settings {
  enabled: boolean;
  level: Level;
  panelMode: PanelMode;
  model: string;
  apiKey: string;
  disabledHosts: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  level: 'B1',
  panelMode: 'below',
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
export type RuntimeMessage = SimplifyRequest | GetSettingsRequest;

export interface CacheEntry {
  result: SimplifyResult;
  ts: number;
  level: Level;
  model: string;
}
