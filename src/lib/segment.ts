import { hashKey } from './hash';
import { normalizeText } from './cache';

export const BLOCK_SELECTOR = 'p, li, blockquote, dd, h1, h2, h3, h4';
export const SKIP_SELECTOR =
  'pre, code, kbd, samp, nav, header, footer, aside, form, figure, figcaption, textarea, select, script, style, [contenteditable="true"], [aria-hidden="true"], .readassistant-panel, [data-ra-skip]';

export const MIN_TEXT_LENGTH = 40;
export const MIN_HEADING_LENGTH = 20;
export const MAX_BLOCKS = 600;

export function blockText(element: HTMLElement): string {
  return normalizeText(element.textContent ?? '');
}

export function blockId(element: HTMLElement): string {
  return hashKey(blockText(element) + '|' + (element.tagName || ''));
}

function isEligible(element: HTMLElement): boolean {
  if (element.closest(SKIP_SELECTOR)) return false;
  if (element.closest('.readassistant-panel')) return false;
  const text = blockText(element);
  const isHeading = /^H[1-4]$/.test(element.tagName);
  if (text.length < (isHeading ? MIN_HEADING_LENGTH : MIN_TEXT_LENGTH)) return false;
  // Keep the innermost block so nested markup is not simplified twice.
  if (element.querySelector(BLOCK_SELECTOR)) return false;
  return true;
}

export function collectBlocks(root: ParentNode = document): HTMLElement[] {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  const blocks: HTMLElement[] = [];
  for (const element of candidates) {
    if (blocks.length >= MAX_BLOCKS) break;
    if (!isEligible(element)) continue;
    blocks.push(element);
  }
  return blocks;
}

export function markBlocks(blocks: HTMLElement[]): number {
  let added = 0;
  for (const element of blocks) {
    if (element.dataset.raReady === '1') continue;
    element.dataset.raReady = '1';
    element.dataset.raId = blockId(element);
    added++;
  }
  return added;
}

export function resolveBlock(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target.closest('a, button, input, textarea, select, [contenteditable="true"]')) return null;
  const block = target.closest<HTMLElement>(BLOCK_SELECTOR);
  if (!block || block.dataset.raReady !== '1') return null;
  if (block.closest('.readassistant-panel')) return null;
  return block;
}
