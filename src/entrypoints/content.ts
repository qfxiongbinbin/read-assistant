import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { getSettings } from '../lib/cache';
import { placePanel, type PanelPlacement, type PointerPoint } from '../lib/position';
import { blockText, collectBlocks, markBlocks, resolveBlock } from '../lib/segment';
import {
  ensureTrigger,
  hideTrigger,
  readSelection,
  showTrigger,
  type SelectedText,
} from '../lib/selection';
import { sendToBackground } from '../lib/storage';
import { injectStyles, PANEL_CLASS } from '../lib/style';
import {
  SETTINGS_KEY,
  type KeyTerm,
  type Level,
  type PanelMode,
  type Settings,
  type SimplifyResponse,
} from '../lib/types';

interface PanelRefs {
  root: HTMLElement;
  label: HTMLElement;
  body: HTMLElement;
  retry: HTMLButtonElement;
  close: HTMLButtonElement;
}

interface OpenPanel {
  /** Source paragraph, or null for a panel opened from a text selection. */
  block: HTMLElement | null;
  host: HTMLElement;
  refs: PanelRefs;
  mode: PanelMode;
  placement: PanelPlacement;
  cleanup: (() => void)[];
  point: PointerPoint;
  kind: 'block' | 'selection';
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

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = PANEL_CLASS + '__btn';
  retry.textContent = 'Retry';
  retry.hidden = true;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = PANEL_CLASS + '__btn';
  close.textContent = '\u2715';
  close.title = 'Hide';

  meta.append(badge, label, spacer, retry, close);

  const body = document.createElement('div');
  body.className = PANEL_CLASS + '__body';
  const status = document.createElement('p');
  status.className = PANEL_CLASS + '__status ' + PANEL_CLASS + '__dots';
  status.textContent = 'Working';
  body.appendChild(status);

  root.append(meta, body);
  return { root, label, body, retry, close };
}

function closePanel(open: OpenPanel): void {
  for (const dispose of open.cleanup) dispose();
  open.host.remove();
  if (open.block) delete open.block.dataset.raActive;
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

function appendSection(root: HTMLElement, title: string, entries: KeyTerm[]): void {
  if (entries.length === 0) return;
  const section = document.createElement('div');
  section.className = PANEL_CLASS + '__section';

  const heading = document.createElement('p');
  heading.className = PANEL_CLASS + '__section-title';
  heading.textContent = title;
  section.appendChild(heading);

  for (const entry of entries) {
    const row = document.createElement('p');
    row.className = PANEL_CLASS + '__entry';
    const term = document.createElement('span');
    term.className = PANEL_CLASS + '__term';
    term.textContent = entry.term;
    row.append(term, document.createTextNode(' \u2014 ' + entry.simple));
    section.appendChild(row);
  }

  root.appendChild(section);
}

function render(refs: PanelRefs, response: SimplifyResponse): void {
  refs.body.textContent = '';
  for (const stale of [...refs.root.querySelectorAll('.' + PANEL_CLASS + '__section')]) stale.remove();

  if (!response.ok) {
    refs.label.textContent = 'Not simplified';
    refs.retry.hidden = false;
    const node = document.createElement('p');
    node.className = PANEL_CLASS + '__status ' + PANEL_CLASS + '__error';
    node.textContent = response.error;
    refs.body.appendChild(node);
    return;
  }

  refs.label.textContent = 'Simplified';
  refs.retry.hidden = true;

  const paragraphs = response.result.simplified
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  for (const paragraph of paragraphs) {
    const node = document.createElement('p');
    node.textContent = paragraph;
    refs.body.appendChild(node);
  }

  appendSection(refs.root, 'Key words', response.result.keyWords);
  appendSection(refs.root, 'Key phrases', response.result.keyPhrases);
}

async function openPanel(options: {
  kind: 'block' | 'selection';
  block: HTMLElement | null;
  anchor: HTMLElement;
  text: string;
  point: PointerPoint;
}): Promise<void> {
  const current = settings;
  if (!isActive() || !current) return;

  if (options.kind === 'selection') {
    for (const open of [...PANELS]) {
      if (open.kind === 'selection') closePanel(open);
    }
  }

  const mode = current.panelMode;
  if (mode === 'float') closeMode('float');

  const refs = buildPanel(current.level);
  const placement = placePanel(mode, options.anchor, refs.root, options.point);
  if (options.block) options.block.dataset.raActive = '1';

  const open: OpenPanel = {
    block: options.block,
    host: placement.host,
    refs,
    mode,
    placement,
    cleanup: [],
    point: options.point,
    kind: options.kind,
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

  if (!PANELS.includes(open)) return;
  render(refs, response);
  // The card grew while loading, so re-clamp it to the viewport.
  placement.moveTo?.(open.point.x, open.point.y);
}

function toggleBlock(block: HTMLElement, point: PointerPoint): void {
  const existing = PANELS.find((panel) => panel.block === block);
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
  // Let the browser finish updating the selection first.
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
