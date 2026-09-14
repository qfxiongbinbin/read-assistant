import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { getSettings } from '../lib/cache';
import { blockText, collectBlocks, markBlocks, resolveBlock } from '../lib/segment';
import { sendToBackground } from '../lib/storage';
import { injectStyles, PANEL_CLASS } from '../lib/style';
import { SETTINGS_KEY, type Level, type Settings, type SimplifyResponse } from '../lib/types';

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

function hostFor(block: HTMLElement, root: HTMLElement): HTMLElement {
  if (block.tagName === 'LI' || block.tagName === 'TD') {
    const wrapper = document.createElement(block.tagName.toLowerCase());
    wrapper.className = PANEL_CLASS + '__item';
    wrapper.setAttribute('data-ra-skip', '1');
    wrapper.appendChild(root);
    return wrapper;
  }
  return root;
}

function closePanel(block: HTMLElement): void {
  const open = PANELS.get(block);
  if (!open) return;
  open.host.remove();
  PANELS.delete(block);
  delete block.dataset.raActive;
}

function closeAll(): void {
  for (const block of [...PANELS.keys()]) closePanel(block);
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

async function toggle(block: HTMLElement): Promise<void> {
  if (PANELS.has(block)) {
    closePanel(block);
    return;
  }
  const current = settings;
  if (!isActive() || !current) return;

  const level = current.level;
  const refs = buildPanel(level);
  const host = hostFor(block, refs.root);
  block.insertAdjacentElement('afterend', host);
  block.dataset.raActive = '1';
  PANELS.set(block, { host, refs });

  refs.close.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closePanel(block);
  });
  refs.retry.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closePanel(block);
    void toggle(block);
  });

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

  const open = PANELS.get(block);
  if (!open || open.host !== host) return;
  render(refs, response);
}

function onDocumentClick(event: MouseEvent): void {
  if (!isActive()) return;
  const target = event.target as HTMLElement | null;
  if (!target || typeof target.closest !== 'function') return;
  if (target.closest('a, button, input, textarea, select, [contenteditable="true"], .' + PANEL_CLASS)) return;

  const block = resolveBlock(target);
  if (!block) return;

  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 0) return;

  void toggle(block);
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
  settings = await getSettings();
  if (!isActive()) {
    deactivate();
    return;
  }
  injectStyles(document);
  scan();
  startObserver();
}

async function init(): Promise<void> {
  await applySettings();
  document.addEventListener('click', onDocumentClick, true);
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
