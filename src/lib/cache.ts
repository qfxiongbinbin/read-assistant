import { hashKey } from './hash';
import { storageGet, storageSet, storageRemove } from './storage';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  type CacheEntry,
  type Level,
  type Settings,
  type SimplifyResult,
} from './types';

const CACHE_PREFIX = 'ra:c:';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 800;

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function cacheKey(text: string, level: Level, model: string): string {
  const normalized = normalizeText(text);
  return (
    CACHE_PREFIX +
    hashKey(level + '|' + model + '|' + normalized) +
    '-' +
    normalized.length.toString(36)
  );
}

export async function getSettings(): Promise<Settings> {
  const stored = await storageGet<Record<string, unknown>>(SETTINGS_KEY);
  const value = stored?.[SETTINGS_KEY] as Partial<Settings> | undefined;
  if (!value) return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...value,
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

export async function getCached(key: string): Promise<SimplifyResult | null> {
  const stored = await storageGet<Record<string, CacheEntry>>(key);
  const entry = stored?.[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    await storageRemove(key);
    return null;
  }
  return entry.result;
}

export async function putCached(
  key: string,
  result: SimplifyResult,
  level: Level,
  model: string,
): Promise<void> {
  const entry: CacheEntry = { result, ts: Date.now(), level, model };
  await storageSet({ [key]: entry });
  void pruneCache();
}

async function pruneCache(): Promise<void> {
  const all = await storageGet<Record<string, CacheEntry>>(null);
  const entries = Object.keys(all)
    .filter((key) => key.startsWith(CACHE_PREFIX))
    .map((key) => ({ key, ts: all[key]?.ts ?? 0 }));
  if (entries.length <= CACHE_LIMIT) return;
  entries.sort((a, b) => a.ts - b.ts);
  const doomed = entries.slice(0, entries.length - CACHE_LIMIT).map((entry) => entry.key);
  if (doomed.length > 0) await storageRemove(doomed);
}
