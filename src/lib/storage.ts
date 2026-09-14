import { browser } from 'wxt/browser';

export async function storageGet<T>(keys: string | string[] | null): Promise<T> {
  const raw = keys === null ? await browser.storage.local.get() : await browser.storage.local.get(keys as string[]);
  return raw as T;
}

export async function storageSet(items: Record<string, unknown>): Promise<void> {
  await browser.storage.local.set(items);
}

export async function storageRemove(keys: string | string[]): Promise<void> {
  await browser.storage.local.remove(keys as string[]);
}

export function sendToBackground<T>(message: unknown): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}

export async function queryActiveTab(): Promise<{ id?: number; url?: string }> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  return tab ? { id: tab.id, url: tab.url } : {};
}
