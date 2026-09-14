import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { getSettings, saveSettings } from '../lib/cache';
import { lookupTokens } from '../lib/ipa';
import { placePanel, type PanelPlacement, type PointerPoint } from '../lib/position';
import { blockText, collectBlocks, markBlocks, resolveBlock } from '../lib/segment';
import {
  ensureTrigger,
  hideTrigger,
  readSelection,
  showTrigger,
  type SelectedText,
} from '../lib/selection';
import { initSpeech, speak, stopSpeaking } from '../lib/speech';
import { sendToBackground } from '../lib/storage';
import { injectStyles, PANEL_CLASS } from '../lib/style';
import {
  SETTINGS_KEY,
  type Accent,
  type ExplainResponse,
  type ExplainResult,
  type KeyTerm,
  type Level,
  type PanelMode,
  type PhoneticEntry,
  type PhoneticsResponse,
  type Settings,
  type SimplifyResponse,
} from '../lib/types';

const ACCENT_ORDER: readonly Accent[] = ['uk', 'us'];
const MAX_DRILL_DEPTH = 12;

interface PanelRefs {
  root: HTMLElement;
  label: HTMLElement;
  body: HTMLElement;
  playUk: HTMLButtonElement;
  playUs: HTMLButtonElement;
  phonetics: HTMLButtonElement;
  retry: HTMLButtonElement;
  close: HTMLButtonElement;
}

interface PanelOptions {
  kind: 'block' | 'selection';
  block: HTMLElement | null;
  anchor: HTMLElement;
  text: string;
  point: PointerPoint;
}

interface OpenPanel {
  options: PanelOptions;
  host: HTMLElement;
  refs: PanelRefs;
  mode: PanelMode;
  placement: PanelPlacement;
  cleanup: (() => void)[];
  point: PointerPoint;
  response: SimplifyResponse | null;
  /** Pronunciation, accumulated as the reader drills down. */
  ipa: Record<string, PhoneticEntry>;
  /** Words we already asked the dictionary about, hit or miss. */
  ipaTried: Set<string>;
  /** Drill-down stack: [] shows the root view, otherwise the last word is shown. */
  stack: string[];
  explains: Map<string, ExplainResult>;
  errors: Map<string, string>;
}

const PANELS: OpenPanel[] = [];
let settings: Settings | null = null;
let observer: MutationObserver | null = null;
let scanTimer: number | null = null;
let trigger: HTMLButtonElement | null = null;
let pendingSelection: SelectedText | null = null;

function isActive(): boolean {
  if (!settings || !settings.enabled) return false;
  return !settings.disabledHosts.includes(location.host);
}

/** The host page's CSS can override the [hidden] attribute, so hide it two ways. */
function setHidden(element: HTMLElement, hidden: boolean): void {
  element.hidden = hidden;
  element.style.display = hidden ? 'none' : '';
}

function buildPanel(level: Level): PanelRefs {
  const root = document.createElement('div');
  root.className = PANEL_CLASS;
  root.setAttribute('data-ra-skip', '1');

  const meta = document.createElement('div');
  meta.className = PANEL_CLASS + '__meta';

  const badge = document.createElement('span');
  badge.className = PANEL_CLASS + '__badge';
  badge.textContent = level;

  const label = document.createElement('span');
  label.textContent = 'Simplifying';

  const spacer = document.createElement('span');
  spacer.className = PANEL_CLASS + '__spacer';

  const makeButton = (text: string, title: string): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = PANEL_CLASS + '__btn';
    button.textContent = text;
    button.title = title;
    return button;
  };

  const playUk = makeButton('UK', 'Read the whole text with a British voice');
  const playUs = makeButton('US', 'Read the whole text with an American voice');
  const phonetics = makeButton('Aa', 'Show phonetics above every word');

  const retry = makeButton('Retry', 'Try again');
  setHidden(retry, true);

  const close = makeButton('✕', 'Hide');

  meta.append(badge, label, spacer, playUk, playUs, phonetics, retry, close);

  const body = document.createElement('div');
  body.className = PANEL_CLASS + '__body';
  const status = document.createElement('p');
  status.className = PANEL_CLASS + '__status ' + PANEL_CLASS + '__dots';
  status.textContent = 'Working';
  body.appendChild(status);

  root.append(meta, body);
  return { root, label, body, playUk, playUs, phonetics, retry, close };
}

function closePanel(open: OpenPanel): void {
  for (const dispose of open.cleanup) dispose();
  open.host.remove();
  if (open.options.block) delete open.options.block.dataset.raActive;
  const index = PANELS.indexOf(open);
  if (index >= 0) PANELS.splice(index, 1);
}

function closeAll(): void {
  for (const open of [...PANELS]) closePanel(open);
}

function closeMode(mode: PanelMode): void {
  for (const open of [...PANELS]) {
    if (open.mode === mode) closePanel(open);
  }
}

function ipaFor(
  word: string,
  ipa: Record<string, PhoneticEntry>,
  accent: Accent,
): { value: string; approx: boolean } | null {
  const entry = ipa[word.toLowerCase()];
  if (!entry) return null;
  const value = accent === 'uk' ? entry.uk || entry.us : entry.us || entry.uk;
  if (!value) return null;
  return { value, approx: accent === 'uk' ? entry.ukApprox : entry.usApprox };
}

/** `UK /kæri/ /aʊt/  ·  US /kæri/ /aʊt/` — empty when any word is unknown. */
function phoneticLine(term: string, ipa: Record<string, PhoneticEntry>): string {
  const parts = lookupTokens(term);
  if (parts.length === 0) return '';
  const pieces: string[] = [];
  for (const accent of ACCENT_ORDER) {
    const values = parts.map((part) => ipaFor(part, ipa, accent));
    if (values.some((value) => value === null)) continue;
    const rendered = values.map((value) => (value?.approx ? '≈' : '') + value?.value).join('/ /');
    pieces.push(accent.toUpperCase() + ' /' + rendered + '/');
  }
  return pieces.join('  ·  ');
}

function flashWord(element: HTMLElement): void {
  element.classList.add(PANEL_CLASS + '__word--speaking');
  window.setTimeout(() => element.classList.remove(PANEL_CLASS + '__word--speaking'), 450);
}

function appendWord(
  container: HTMLElement,
  word: string,
  ipa: Record<string, PhoneticEntry>,
  accent: Accent,
  phonetics: boolean,
): void {
  const span = document.createElement('span');
  span.className = PANEL_CLASS + '__word';
  span.dataset.raWord = word;

  const found = phonetics ? ipaFor(word, ipa, accent) : null;
  if (found) {
    const ruby = document.createElement('ruby');
    ruby.appendChild(document.createTextNode(word));
    const rt = document.createElement('rt');
    rt.textContent = (found.approx ? '≈' : '') + found.value;
    ruby.appendChild(rt);
    span.appendChild(ruby);
  } else {
    span.textContent = word;
  }
  container.appendChild(span);
}

/** Every word becomes clickable: click drills down, Alt+click speaks it. */
function renderText(
  container: HTMLElement,
  text: string,
  ipa: Record<string, PhoneticEntry>,
  accent: Accent,
  phonetics: boolean,
): void {
  for (const part of text.split(/([A-Za-z][A-Za-z'-]*)/)) {
    if (part.length === 0) continue;
    if (!/^[A-Za-z]/.test(part)) {
      container.appendChild(document.createTextNode(part));
      continue;
    }
    appendWord(container, part, ipa, accent, phonetics);
  }
}

function playButtons(term: string): HTMLElement {
  const actions = document.createElement('span');
  actions.className = PANEL_CLASS + '__entry-actions';
  for (const accent of ACCENT_ORDER) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = PANEL_CLASS + '__btn';
    button.textContent = accent.toUpperCase();
    button.title = 'Play with a ' + (accent === 'uk' ? 'British' : 'American') + ' voice';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      speak(term, accent);
    });
    actions.appendChild(button);
  }
  return actions;
}

function appendSection(
  root: HTMLElement,
  title: string,
  entries: KeyTerm[],
  ipa: Record<string, PhoneticEntry>,
  accent: Accent,
): void {
  if (entries.length === 0) return;

  const section = document.createElement('div');
  section.className = PANEL_CLASS + '__section';

  const heading = document.createElement('p');
  heading.className = PANEL_CLASS + '__section-title';
  heading.textContent = title;
  section.appendChild(heading);

  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = PANEL_CLASS + '__entry';

    const head = document.createElement('p');
    head.className = PANEL_CLASS + '__entry-head';

    const term = document.createElement('span');
    term.className = PANEL_CLASS + '__term';
    term.dataset.raWord = entry.term;
    term.textContent = entry.term;
    head.appendChild(term);
    head.appendChild(playButtons(entry.term));
    row.appendChild(head);

    const line = phoneticLine(entry.term, ipa);
    if (line.length > 0) {
      const phonetic = document.createElement('p');
      phonetic.className = PANEL_CLASS + '__ipa';
      phonetic.textContent = line;
      row.appendChild(phonetic);
    }

    const meaning = document.createElement('p');
    meaning.className = PANEL_CLASS + '__meaning';
    renderText(meaning, entry.simple, ipa, accent, false);
    row.appendChild(meaning);

    section.appendChild(row);
  }

  root.appendChild(section);
}

function appendHint(container: HTMLElement): void {
  const hint = document.createElement('p');
  hint.className = PANEL_CLASS + '__hint';
  hint.textContent = 'Click a word to go deeper · Alt+click to hear it';
  container.appendChild(hint);
}

function contextFor(open: OpenPanel, depth: number): string {
  const parent = depth > 0 ? open.stack[depth - 1] : null;
  if (parent) {
    const entry = open.explains.get(parent);
    if (entry) return entry.explanation;
  }
  return open.response?.ok ? open.response.result.simplified : open.options.text;
}

async function ensureIpa(open: OpenPanel, candidates: readonly string[]): Promise<void> {
  const missing = candidates.filter(
    (word) => word.length > 1 && !(word in open.ipa) && !open.ipaTried.has(word),
  );
  if (missing.length === 0) return;
  for (const word of missing) open.ipaTried.add(word);
  try {
    const response = await sendToBackground<PhoneticsResponse>({ type: 'phonetics', words: missing });
    if (response.ok) Object.assign(open.ipa, response.entries);
  } catch {
    // Phonetics are optional: never block on them.
  }
}

function renderRootView(open: OpenPanel, accent: Accent, phonetics: boolean): void {
  const result = open.response?.ok ? open.response.result : null;
  if (!result) return;
  open.refs.body.classList.toggle(PANEL_CLASS + '__body--phonetics', phonetics);
  renderSimplified(open.refs.body, result, open.ipa, accent, phonetics);
  appendSection(open.refs.body, 'Key words', result.keyWords, open.ipa, accent);
  appendSection(open.refs.body, 'Key phrases', result.keyPhrases, open.ipa, accent);
}

function renderSimplified(
  container: HTMLElement,
  result: { simplified: string },
  ipa: Record<string, PhoneticEntry>,
  accent: Accent,
  phonetics: boolean,
): void {
  const paragraphs = result.simplified
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  for (const paragraph of paragraphs) {
    const node = document.createElement('p');
    renderText(node, paragraph, ipa, accent, phonetics);
    container.appendChild(node);
  }
}

function renderDrillView(open: OpenPanel, accent: Accent, phonetics: boolean): void {
  const body = open.refs.body;
  const word = open.stack[open.stack.length - 1];
  if (!word) return;
  body.classList.toggle(PANEL_CLASS + '__body--phonetics', phonetics);

  // Breadcrumb: the whole path, with a way back.
  const crumb = document.createElement('p');
  crumb.className = PANEL_CLASS + '__crumb';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = PANEL_CLASS + '__btn';
  back.textContent = '‹ Back';
  back.title = 'Back to the previous level';
  back.dataset.raBack = '1';
  crumb.appendChild(back);

  const path = document.createElement('span');
  path.className = PANEL_CLASS + '__crumb-text';
  open.stack.forEach((item, index) => {
    if (index > 0) path.appendChild(document.createTextNode(' › '));
    const step = document.createElement('span');
    step.textContent = item;
    if (index === open.stack.length - 1) step.className = PANEL_CLASS + '__crumb-current';
    path.appendChild(step);
  });
  crumb.appendChild(path);
  body.appendChild(crumb);

  const head = document.createElement('p');
  head.className = PANEL_CLASS + '__word-head';
  const headWord = document.createElement('span');
  headWord.textContent = word;
  head.appendChild(headWord);
  head.appendChild(playButtons(word));
  body.appendChild(head);

  const line = phoneticLine(word, open.ipa);
  if (line.length > 0) {
    const phonetic = document.createElement('p');
    phonetic.className = PANEL_CLASS + '__ipa';
    phonetic.textContent = line;
    body.appendChild(phonetic);
  }

  const entry = open.explains.get(word);
  const failure = open.errors.get(word);

  if (entry) {
    const explain = document.createElement('p');
    explain.className = PANEL_CLASS + '__explain';
    renderText(explain, entry.explanation, open.ipa, accent, phonetics);
    body.appendChild(explain);

    if (entry.synonyms.length > 0) {
      const synonyms = document.createElement('p');
      synonyms.className = PANEL_CLASS + '__synonyms';
      synonyms.appendChild(document.createTextNode('Synonyms: '));
      entry.synonyms.forEach((synonym, index) => {
        if (index > 0) synonyms.appendChild(document.createTextNode(', '));
        renderText(synonyms, synonym, open.ipa, accent, false);
      });
      body.appendChild(synonyms);
    }
    return;
  }

  if (failure) {
    const node = document.createElement('p');
    node.className = PANEL_CLASS + '__status ' + PANEL_CLASS + '__error';
    node.textContent = failure;
    body.appendChild(node);

    const again = document.createElement('button');
    again.type = 'button';
    again.className = PANEL_CLASS + '__btn';
    again.textContent = 'Retry';
    again.dataset.raRetryWord = word;
    body.appendChild(again);
    return;
  }

  const loading = document.createElement('p');
  loading.className = PANEL_CLASS + '__status ' + PANEL_CLASS + '__dots';
  loading.textContent = 'Explaining';
  body.appendChild(loading);
}

function renderView(open: OpenPanel): void {
  const { refs } = open;
  refs.body.textContent = '';
  refs.body.classList.remove(PANEL_CLASS + '__body--phonetics');

  const accent = settings?.accent ?? 'uk';
  const phonetics = settings?.phonetics ?? false;
  refs.phonetics.classList.toggle(PANEL_CLASS + '__btn--on', phonetics);

  const response = open.response;
  if (!response || !response.ok) {
    refs.label.textContent = 'Not simplified';
    setHidden(refs.retry, false);
    const node = document.createElement('p');
    node.className = PANEL_CLASS + '__status ' + PANEL_CLASS + '__error';
    node.textContent = response ? response.error : 'Something went wrong.';
    refs.body.appendChild(node);
    return;
  }

  setHidden(refs.retry, true);
  refs.label.textContent = open.stack.length > 0 ? 'Explaining' : 'Simplified';

  if (open.stack.length === 0) {
    renderRootView(open, accent, phonetics);
  } else {
    renderDrillView(open, accent, phonetics);
  }
  appendHint(refs.body);
}

async function loadExplanation(open: OpenPanel, word: string, context: string): Promise<void> {
  const current = settings;
  if (!current || open.explains.has(word)) return;

  try {
    const response = await sendToBackground<ExplainResponse>({
      type: 'explain',
      word,
      context,
      level: current.level,
      model: current.model,
    });
    if (response.ok) {
      open.explains.set(word, response.result);
      open.errors.delete(word);
    } else {
      open.errors.set(word, response.error);
    }
  } catch (error) {
    open.errors.set(word, error instanceof Error ? error.message : String(error));
  }

  const entry = open.explains.get(word);
  const wanted = new Set<string>([word]);
  if (entry) {
    for (const token of lookupTokens(entry.explanation)) wanted.add(token);
    for (const synonym of entry.synonyms) {
      for (const token of lookupTokens(synonym)) wanted.add(token);
    }
  }
  await ensureIpa(open, [...wanted]);
}

async function drillInto(open: OpenPanel, rawWord: string): Promise<void> {
  const word = rawWord.toLowerCase().trim();
  if (word.length === 0) return;
  if (open.stack.length >= MAX_DRILL_DEPTH) return;

  const context = contextFor(open, open.stack.length);
  open.stack.push(word);
  renderView(open);

  await loadExplanation(open, word, context);

  if (!PANELS.includes(open)) return;
  if (open.stack[open.stack.length - 1] === word) renderView(open);
}

async function openPanel(options: PanelOptions): Promise<void> {
  const current = settings;
  if (!isActive() || !current) return;

  if (options.kind === 'selection') {
    for (const open of [...PANELS]) {
      if (open.options.kind === 'selection') closePanel(open);
    }
  }

  const mode = current.panelMode;
  if (mode === 'float') closeMode('float');

  const refs = buildPanel(current.level);
  const placement = placePanel(mode, options.anchor, refs.root, options.point);
  if (options.block) options.block.dataset.raActive = '1';

  const open: OpenPanel = {
    options,
    host: placement.host,
    refs,
    mode,
    placement,
    cleanup: [],
    point: options.point,
    response: null,
    ipa: {},
    ipaTried: new Set<string>(),
    stack: [],
    explains: new Map<string, ExplainResult>(),
    errors: new Map<string, string>(),
  };
  PANELS.push(open);

  refs.close.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closePanel(open);
  });
  refs.retry.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const point = { ...open.point };
    closePanel(open);
    void openPanel({ ...options, point });
  });
  refs.playUk.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const response = open.response;
    if (response?.ok) speak(response.result.simplified, 'uk');
  });
  refs.playUs.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const response = open.response;
    if (response?.ok) speak(response.result.simplified, 'us');
  });
  refs.phonetics.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void togglePhonetics(open);
  });

  refs.body.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target || typeof target.closest !== 'function') return;

    if (target.closest('[data-ra-back]')) {
      event.preventDefault();
      event.stopPropagation();
      open.stack.pop();
      renderView(open);
      return;
    }

    const retryWord = target.closest<HTMLElement>('[data-ra-retry-word]');
    if (retryWord?.dataset.raRetryWord) {
      event.preventDefault();
      event.stopPropagation();
      const word = retryWord.dataset.raRetryWord;
      open.errors.delete(word);
      renderView(open);
      void loadExplanation(open, word, contextFor(open, open.stack.length - 1)).then(() => {
        if (PANELS.includes(open)) renderView(open);
      });
      return;
    }

    const wordElement = target.closest<HTMLElement>('[data-ra-word]');
    if (!wordElement) return;
    const word = wordElement.dataset.raWord;
    if (!word) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.altKey) {
      flashWord(wordElement);
      speak(word, settings?.accent ?? 'uk');
      return;
    }
    void drillInto(open, word);
  });

  // Float mode: the card trails the cursor, but only while the cursor stays over
  // the source text. Moving towards the card freezes it, so it never runs away.
  if (mode === 'float' && placement.moveTo) {
    const moveTo = placement.moveTo;
    const onMove = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Node && options.anchor.contains(target)) {
        open.point = { x: event.clientX, y: event.clientY };
        moveTo(open.point.x, open.point.y);
      }
    };
    document.addEventListener('mousemove', onMove, true);
    open.cleanup.push(() => document.removeEventListener('mousemove', onMove, true));
  }

  let response: SimplifyResponse;
  try {
    response = await sendToBackground<SimplifyResponse>({
      type: 'simplify',
      text: options.text,
      level: current.level,
      model: current.model,
    });
  } catch (error) {
    response = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      attempts: 0,
    };
  }
  open.response = response;

  if (response.ok) {
    const wanted = new Set<string>([
      ...response.result.keyWords.flatMap((entry) => lookupTokens(entry.term)),
      ...response.result.keyPhrases.flatMap((entry) => lookupTokens(entry.term)),
    ]);
    if (current.phonetics) {
      for (const token of lookupTokens(response.result.simplified)) wanted.add(token);
    }
    await ensureIpa(open, [...wanted]);
  }

  if (!PANELS.includes(open)) return;
  renderView(open);
  // The card grew while loading, so re-clamp it to the viewport.
  placement.moveTo?.(open.point.x, open.point.y);
}

async function togglePhonetics(open: OpenPanel): Promise<void> {
  const next = !(settings?.phonetics ?? false);
  const saved = await saveSettings({ phonetics: next });
  settings = saved;
  const options = { ...open.options, point: { ...open.point } };
  closePanel(open);
  await openPanel(options);
}

function toggleBlock(block: HTMLElement, point: PointerPoint): void {
  const existing = PANELS.find((panel) => panel.options.block === block);
  if (existing) {
    closePanel(existing);
    return;
  }
  void openPanel({ kind: 'block', block, anchor: block, text: blockText(block), point });
}

function clearSelectionTrigger(): void {
  pendingSelection = null;
  if (trigger) hideTrigger(trigger);
}

function refreshSelectionTrigger(): void {
  if (!isActive()) {
    clearSelectionTrigger();
    return;
  }
  window.setTimeout(() => {
    const found = readSelection();
    if (!found) {
      clearSelectionTrigger();
      return;
    }
    pendingSelection = found;
    if (!trigger) return;
    showTrigger(trigger, found.rect);
  }, 0);
}

function onTriggerClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  const found = pendingSelection;
  clearSelectionTrigger();
  if (!found) return;
  void openPanel({
    kind: 'selection',
    block: null,
    anchor: found.anchor,
    text: found.text,
    point: { x: found.rect.left + found.rect.width / 2, y: found.rect.top },
  });
}

function onDocumentClick(event: MouseEvent): void {
  if (!isActive()) return;
  const target = event.target as HTMLElement | null;
  if (!target || typeof target.closest !== 'function') return;
  if (target.closest('a, button, input, textarea, select, [contenteditable="true"], .' + PANEL_CLASS)) return;

  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 0) return;

  const block = resolveBlock(target);
  if (!block) {
    closeMode('float');
    clearSelectionTrigger();
    return;
  }
  void toggleBlock(block, { x: event.clientX, y: event.clientY });
}

function scan(): void {
  if (!isActive()) return;
  markBlocks(collectBlocks(document));
}

function scheduleScan(): void {
  if (scanTimer !== null) return;
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    scan();
  }, 600);
}

function startObserver(): void {
  if (observer || !document.body) return;
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target as HTMLElement | null;
      if (target && typeof target.closest === 'function' && target.closest('.' + PANEL_CLASS)) continue;
      if (mutation.addedNodes.length > 0) {
        scheduleScan();
        return;
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function deactivate(): void {
  closeAll();
  clearSelectionTrigger();
  stopSpeaking();
  for (const element of document.querySelectorAll<HTMLElement>('[data-ra-ready="1"]')) {
    delete element.dataset.raReady;
    delete element.dataset.raActive;
  }
}

async function applySettings(): Promise<void> {
  const previous = settings;
  const next = await getSettings();
  settings = next;

  if (!isActive()) {
    deactivate();
    return;
  }
  if (previous && (previous.panelMode !== next.panelMode || previous.level !== next.level)) {
    closeAll();
  }
  injectStyles(document);
  scan();
  startObserver();
}

async function init(): Promise<void> {
  await applySettings();
  initSpeech();

  trigger = ensureTrigger(document);
  trigger.addEventListener('mousedown', (event) => event.preventDefault());
  trigger.addEventListener('click', onTriggerClick);

  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('mouseup', refreshSelectionTrigger, true);
  document.addEventListener('keyup', refreshSelectionTrigger, true);
  window.addEventListener('scroll', clearSelectionTrigger, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMode('float');
      clearSelectionTrigger();
      stopSpeaking();
    }
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[SETTINGS_KEY]) return;
    void applySettings();
  });
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    void init();
  },
});
