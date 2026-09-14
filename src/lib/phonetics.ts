import { browser } from 'wxt/browser';
import { lookupWords, parseTsv, type IpaTable } from './ipa';
import type { PhoneticEntry } from './types';

const ASSET_PATH = '/ipa/en.tsv';

let table: IpaTable | null = null;
let pending: Promise<IpaTable> | null = null;

/** Loads the bundled dictionary once per service-worker lifetime. */
export function loadTable(): Promise<IpaTable> {
  if (table) return Promise.resolve(table);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(browser.runtime.getURL(ASSET_PATH));
      if (!response.ok) {
        throw new Error('Could not load the pronunciation dictionary (' + response.status + ').');
      }
      const parsed = parseTsv(await response.text());
      table = parsed;
      return parsed;
    })().catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}

export async function lookup(words: readonly string[]): Promise<Record<string, PhoneticEntry>> {
  return lookupWords(await loadTable(), words);
}
