import { PANEL_CLASS, TRIGGER_CLASS } from './style';
import type { Action } from './types';

const TRIGGER_ID = 'readassistant-trigger';
/** At or above this size a selection is worth rewriting, not just restating. */
const LONG_SELECTION_CHARS = 20;
const LONG_SELECTION_WORDS = 12;
const EDGE = 8;
const GAP = 8;
const SKIP_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [data-ra-skip], .' + PANEL_CLASS + ', script, style, noscript';

/** A word or a short phrase can only be restated; a sentence or a paragraph can also be rewritten. */
export type SelectionKind = 'short' | 'long';

export interface SelectedText {
  text: string;
  /** Element the panel is positioned against. */
  anchor: HTMLElement;
  rect: DOMRect;
  kind: SelectionKind;
}

export interface TriggerRefs {
  root: HTMLElement;
  buttons: Record<Action, HTMLButtonElement>;
}

export function selectionKind(text: string): SelectionKind {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return text.length >= LONG_SELECTION_CHARS || wordCount >= LONG_SELECTION_WORDS ? 'long' : 'short';
}

/**
 * Any non-empty selection is usable. A single word is the main case for Translate, so there is no
 * minimum length here; the trigger decides which actions the selection can actually use.
 */
export function readSelection(): SelectedText | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const text = selection.toString().replace(/\s+/g, ' ').trim();
  if (text.length === 0) return null;

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element = container instanceof HTMLElement ? container : container.parentElement;
  if (!element || element.closest(SKIP_SELECTOR)) return null;

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  const block = element.closest('p, li, blockquote, dd, h1, h2, h3, h4');
  const anchor = block instanceof HTMLElement ? block : element;
  return { text, anchor, rect, kind: selectionKind(text) };
}

function makeTriggerButton(doc: Document, action: Action, text: string, title: string): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = TRIGGER_CLASS + '__btn';
  button.dataset.raAction = action;
  button.textContent = text;
  button.title = title;
  return button;
}

export function ensureTrigger(doc: Document): TriggerRefs {
  doc.getElementById(TRIGGER_ID)?.remove();

  const root = doc.createElement('div');
  root.id = TRIGGER_ID;
  root.className = TRIGGER_CLASS;
  root.setAttribute('data-ra-skip', '1');
  root.hidden = true;

  const buttons: Record<Action, HTMLButtonElement> = {
    simplify: makeTriggerButton(doc, 'simplify', 'Simplify', 'Rewrite this in simple English'),
    translate: makeTriggerButton(doc, 'translate', 'Translate', 'Say this with simpler words'),
  };
  root.append(buttons.simplify, buttons.translate);
  (doc.documentElement ?? doc.body).appendChild(root);
  return { root, buttons };
}

/** A short selection has nothing to rewrite, so its pill shows Translate only. */
export function showTrigger(refs: TriggerRefs, rect: DOMRect, kind: SelectionKind): void {
  refs.buttons.simplify.hidden = kind === 'short';
  refs.root.hidden = false;
  refs.root.style.visibility = 'hidden';
  const width = refs.root.offsetWidth;
  const height = refs.root.offsetHeight;
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - width / 2, EDGE),
    Math.max(EDGE, window.innerWidth - width - EDGE),
  );
  const above = rect.top - height - GAP;
  const top =
    above >= EDGE ? above : Math.min(rect.bottom + GAP, Math.max(EDGE, window.innerHeight - height - EDGE));
  refs.root.style.left = Math.round(left) + 'px';
  refs.root.style.top = Math.round(top) + 'px';
  refs.root.style.visibility = '';
}

export function hideTrigger(refs: TriggerRefs): void {
  refs.root.hidden = true;
}
