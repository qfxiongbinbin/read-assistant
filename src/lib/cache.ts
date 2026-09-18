import { hashKey } from './hash';
import { storageGet, storageSet, storageRemove } from './storage';
import {
  ACCENTS,
  DEFAULT_SETTINGS,
  LEVELS,
  PANEL_MODES,
  SCHEMA_VERSION,
  SETTINGS_KEY,
  type Accent,
  type CachedEntry,
  type ExplainResult,
  type Level,
  type PanelMode,
  type Settings,
  type SimplifyResult,
  type TranslateResult,
} from './types';

const CACHE_PREFIX = 'ra:c:';
const EXPLAIN_PREFIX = 'ra:e:';
const TRANSLATE_PREFIX = 'ra:t:';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 800;

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function cacheKey(text: string, level: Level, model: string): string {
  const normalized = normalizeText(text);
  const seed = SCHEMA_VERSION + '|' + level + '|' + model + '|' + normalized;
  return CACHE_PREFIX + hashKey(seed) + '-' + normalized.length.toString(36);
}

/** Restating a word is level-independent, so the level is deliberately not part of the key. */
export function translateKey(text: string, model: string): string {
  const normalized = normalizeText(text);
  const seed = SCHEMA_VERSION + '|translate|' + model + '|' + normalized;
  return TRANSLATE_PREFIX + hashKey(seed) + '-' + normalized.length.toString(36);
}

function asLevel(value: unknown): Level {
  return LEVELS.includes(value as Level) ? (value as Level) : DEFAULT_SETTINGS.level;
}

function asPanelMode(value: unknown): PanelMode {
  return PANEL_MODES.includes(value as PanelMode) ? (value as PanelMode) : DEFAULT_SETTINGS.panelMode;
}

function asAccent(value: unknown): Accent {
  return ACCENTS.includes(value as Accent) ? (value as Accent) : DEFAULT_SETTINGS.accent;
}

export async function getSettings(): Promise<Settings> {
  const stored = await storageGet<Record<string, unknown>>(SETTINGS_KEY);
  const value = stored?.[SETTINGS_KEY] as Partial<Settings> | undefined;
  if (!value) return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    level: asLevel(value.level),
    panelMode: asPanelMode(value.panelMode),
    accent: asAccent(value.accent),
    phonetics: typeof value.phonetics === 'boolean' ? value.phonetics : DEFAULT_SETTINGS.phonetics,
    autoTranslate:
      typeof value.autoTranslate === 'boolean' ? value.autoTranslate : DEFAULT_SETTINGS.autoTranslate,
    disabledHosts: Array.isArray(value.disabledHosts) ? value.disabledHosts : [],
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    disabledHosts: patch.disabledHosts ?? current.disabledHosts,
  };
  await storageSet({ [SETTINGS_KEY]: next });
  return next;
}

async function readEntry<T>(key: string): Promise<T | null> {
  const stored = await storageGet<Record<string, CachedEntry<T>>>(key);
  const entry = stored?.[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    await storageRemove(key);
    return null;
  }
  return entry.result;
}

async function writeEntry<T>(key: string, result: T, model: string, level?: Level): Promise<void> {
  const entry: CachedEntry<T> = level ? { result, ts: Date.now(), level, model } : { result, ts: Date.now(), model };
  await storageSet({ [key]: entry });
  void pruneCache();
}

export function getCached(key: string): Promise<SimplifyResult | null> {
  return readEntry<SimplifyResult>(key);
}

export function putCached(
  key: string,
  result: SimplifyResult,
  level: Level,
  model: string,
): Promise<void> {
  return writeEntry(key, result, model, level);
}

export function getCachedTranslate(key: string): Promise<TranslateResult | null> {
  return readEntry<TranslateResult>(key);
}

export function putCachedTranslate(key: string, result: TranslateResult, model: string): Promise<void> {
  return writeEntry(key, result, model);
}

/** Explanations and restatements are tiny and heavily reused, so keep more of them around. */
const EXPLAIN_LIMIT = 1200;
const TRANSLATE_LIMIT = 1200;

async function prunePrefix(prefix: string, limit: number): Promise<void> {
  const all = await storageGet<Record<string, { ts?: number }>>(null);
  const entries = Object.keys(all)
    .filter((key) => key.startsWith(prefix))
    .map((key) => ({ key, ts: all[key]?.ts ?? 0 }));
  if (entries.length <= limit) return;
  entries.sort((a, b) => a.ts - b.ts);
  const doomed = entries.slice(0, entries.length - limit).map((entry) => entry.key);
  if (doomed.length > 0) await storageRemove(doomed);
}

function pruneCache(): void {
  void prunePrefix(CACHE_PREFIX, CACHE_LIMIT);
  void prunePrefix(EXPLAIN_PREFIX, EXPLAIN_LIMIT);
  void prunePrefix(TRANSLATE_PREFIX, TRANSLATE_LIMIT);
}

export function explainKey(word: string, level: Level, model: string): string {
  const normalized = word.replace(/\s+/g, ' ').trim().toLowerCase();
  return EXPLAIN_PREFIX + hashKey(SCHEMA_VERSION + '|explain|' + level + '|' + model + '|' + normalized);
}

export function getCachedExplain(key: string): Promise<ExplainResult | null> {
  return readEntry<ExplainResult>(key);
}

export function putCachedExplain(
  key: string,
  result: ExplainResult,
  level: Level,
  model: string,
): Promise<void> {
  return writeEntry(key, result, model, level);
}
