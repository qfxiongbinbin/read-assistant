import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { getSettings } from '../lib/cache';
import { placePanel, type PanelPlacement, type PointerPoint } from '../lib/position';
import { blockText, collectBlocks, markBlocks, resolveBlock } from '../lib/segment';
import { sendToBackground } from '../lib/storage';
import { injectStyles, PANEL_CLASS } from '../lib/style';
import {
  SETTINGS_KEY,
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
  host: HTMLElement;
  refs: PanelRefs;
  mode: PanelMode;
  placement: PanelPlacement;
  cleanup: (() => void)[];
  point: PointerPoint;
}

const PANELS = new Map<HTMLElement, OpenPanel>();
let settings: Settings | null = null;
let observer: MutationObserver | null = null;
let scanTimer: number | null = null;

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

function closePanel(block: HTMLElement): void {
  const open = PANELS.get(block);
  if (!open) return;
  for (const dispose of open.cleanup) dispose();
  open.host.remove();
  PANELS.delete(block);
  delete block.dataset.raActive;
}

function closeAll(): void {
  for (const block of [...PANELS.keys()]) closePanel(block);
}

function closeMode(mode: PanelMode): void {
  for (const [block, open] of [...PANELS.entries()]) {
    if (open.mode === mode) closePanel(block);
  }
}

function render(refs: PanelRefs, response: SimplifyResponse): void {
  refs.body.textContent = '';

  if (response.ok) {
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

    if (response.result.glossary.length > 0) {
      const glossary = document.createElement('div');
      glossary.className = PANEL_CLASS + '__glossary';
      for (const entry of response.result.glossary) {
        const row = document.createElement('p');
        row.className = PANEL_CLASS + '__glossary-item';
        const term = document.createElement('span');
        term.className = PANEL_CLASS + '__term';
        term.textContent = entry.term;
        row.append(term, document.createTextNode(' \u2014 ' + entry.simple));
        glossary.appendChild(row);
      }
      refs.root.appendChild(glossary);
    }
    return;
  }

  refs.label.textContent = 'Not simplified';
  refs.retry.hidden = false;
  const node = document.createElement('p');
  node.className = PANEL_CLASS + '__status ' + PANEL_CLASS + '__error';
  node.textContent = response.error;
  refs.body.appendChild(node);
}

async function toggle(block: HTMLElement, point: PointerPoint): Promise<void> {
  if (PANELS.has(block)) {
    closePanel(block);
    return;
  }
  const current = settings;
  if (!isActive() || !current) return;

  const mode = current.panelMode;
  if (mode === 'float') closeMode('float');

  const level = current.level;
  const refs = buildPanel(level);
  const placement = placePanel(mode, block, refs.root, point);
  block.dataset.raActive = '1';

  const open: OpenPanel = { host: placement.host, refs, mode, placement, cleanup: [], point };
  PANELS.set(block, open);

  refs.close.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closePanel(block);
  });
  refs.retry.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closePanel(block);
    void toggle(block, open.point);
  });

  // Float mode: the card trails the cursor, but only while the cursor stays over
  // the source paragraph. Moving towards the card freezes it, so it never runs away.
  if (mode === 'float' && placement.moveTo) {
    const moveTo = placement.moveTo;
    const onMove = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Node && block.contains(target)) {
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
      text: blockText(block),
      level,
      model: current.model,
    });
  } catch (error) {
    response = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      attempts: 0,
    };
  }

  if (PANELS.get(block) !== open) return;
  render(refs, response);
  // The card grew while loading, so re-clamp it to the viewport.
  placement.moveTo?.(open.point.x, open.point.y);
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
    return;
  }
  void toggle(block, { x: event.clientX, y: event.clientY });
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

  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMode('float');
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
