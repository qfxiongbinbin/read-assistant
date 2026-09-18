import { PANEL_CLASS, TRIGGER_CLASS } from './style';
import { ACTIONS, type Action } from './types';

const TRIGGER_ID = 'readassistant-trigger';
/** Simplify needs enough text to be worth rewriting. */
const SIMPLIFY_MIN_CHARS = 20;
const SIMPLIFY_MIN_WORDS = 12;
/**
 * Translate restates the input in one to three sentences of at most 14 words, so it can hold about
 * 40 words without dropping facts. Past that it must compress, and no rule in `verify.ts` can see
 * that loss — so the limit is structural rather than a matter of asking the model nicely.
 */
export const TRANSLATE_MAX_WORDS = 40;
/** Backstop for text with few word breaks, so a degenerate selection never reaches the model. */
export const TRANSLATE_MAX_CHARS = 600;
const EDGE = 8;
const GAP = 8;
const SKIP_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [data-ra-skip], .' + PANEL_CLASS + ', script, style, noscript';

export interface SelectedText {
  text: string;
  /** Element the panel is positioned against. */
  anchor: HTMLElement;
  rect: DOMRect;
  /** The actions this selection can use, in pill order. */
  actions: Action[];
}

export interface TriggerRefs {
  root: HTMLElement;
  buttons: Record<Action, HTMLButtonElement>;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Which actions a piece of text can actually use. This is the single place that decides, so the
 * pill, the panel tabs and the background guard cannot drift apart.
 */
export function availableActions(text: string): Action[] {
  const words = wordCount(text);
  const actions: Action[] = [];
  if (words <= TRANSLATE_MAX_WORDS && text.length <= TRANSLATE_MAX_CHARS) actions.push('translate');
  if (text.length >= SIMPLIFY_MIN_CHARS || words >= SIMPLIFY_MIN_WORDS) actions.push('simplify');
  return actions;
}

/**
 * Any non-empty selection is usable. A single word is the main case for Translate, so there is no
 * minimum length here; `availableActions` decides which actions it can use.
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
  return { text, anchor, rect, actions: availableActions(text) };
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

/** A selection only gets the segments it can actually use, so the pill never offers a dead end. */
export function showTrigger(refs: TriggerRefs, rect: DOMRect, actions: readonly Action[]): void {
  for (const action of ACTIONS) {
    refs.buttons[action].hidden = !actions.includes(action);
  }
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
