import { PANEL_CLASS, TRIGGER_CLASS } from './style';

const TRIGGER_ID = 'readassistant-trigger';
const MIN_SELECTION_LENGTH = 20;
const MIN_MULTI_WORD_SELECTION = 12;
const EDGE = 8;
const GAP = 8;
const SKIP_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [data-ra-skip], .' + PANEL_CLASS + ', script, style, noscript';

export interface SelectedText {
  text: string;
  /** Element the panel is positioned against. */
  anchor: HTMLElement;
  rect: DOMRect;
}

/**
 * Reading a sentence is the point of this feature, so short multi-word selections
 * are accepted too: they are still full sentences most of the time.
 */
export function readSelection(): SelectedText | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const text = selection.toString().replace(/\s+/g, ' ').trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (text.length < MIN_SELECTION_LENGTH && wordCount < MIN_MULTI_WORD_SELECTION) return null;

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element = container instanceof HTMLElement ? container : container.parentElement;
  if (!element || element.closest(SKIP_SELECTOR)) return null;

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  const block = element.closest('p, li, blockquote, dd, h1, h2, h3, h4');
  const anchor = block instanceof HTMLElement ? block : element;
  return { text, anchor, rect };
}

export function ensureTrigger(doc: Document): HTMLButtonElement {
  const existing = doc.getElementById(TRIGGER_ID);
  if (existing instanceof HTMLButtonElement) return existing;

  const button = doc.createElement('button');
  button.id = TRIGGER_ID;
  button.type = 'button';
  button.className = TRIGGER_CLASS;
  button.textContent = 'Simplify';
  button.title = 'Explain this in simple English';
  button.setAttribute('data-ra-skip', '1');
  button.hidden = true;
  (doc.documentElement ?? doc.body).appendChild(button);
  return button;
}

/** Keeps the pill inside the viewport, above the selection when there is room. */
export function showTrigger(button: HTMLButtonElement, rect: DOMRect): void {
  button.hidden = false;
  button.style.visibility = 'hidden';
  const width = button.offsetWidth;
  const height = button.offsetHeight;
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - width / 2, EDGE),
    Math.max(EDGE, window.innerWidth - width - EDGE),
  );
  const above = rect.top - height - GAP;
  const top =
    above >= EDGE ? above : Math.min(rect.bottom + GAP, Math.max(EDGE, window.innerHeight - height - EDGE));
  button.style.left = Math.round(left) + 'px';
  button.style.top = Math.round(top) + 'px';
  button.style.visibility = '';
}

export function hideTrigger(button: HTMLButtonElement): void {
  button.hidden = true;
}
