import { getSettings, saveSettings } from '../../lib/cache';
import { queryActiveTab } from '../../lib/storage';
import type { Accent, Level, PanelMode, Settings } from '../../lib/types';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error('missing element: ' + id);
  return found as T;
}

const enabledInput = element<HTMLInputElement>('enabled');
const levelSelect = element<HTMLSelectElement>('level');
const panelModeSelect = element<HTMLSelectElement>('panelMode');
const accentSelect = element<HTMLSelectElement>('accent');
const phoneticsInput = element<HTMLInputElement>('phonetics');
const modelSelect = element<HTMLSelectElement>('model');
const apiKeyInput = element<HTMLInputElement>('apiKey');
const siteOffInput = element<HTMLInputElement>('siteOff');
const siteLabel = element<HTMLLabelElement>('siteLabel');
const status = element<HTMLSpanElement>('status');
const saveButton = element<HTMLButtonElement>('save');

let currentHost = '';
let initial: Settings | null = null;

function flash(message: string, isError = false): void {
  status.textContent = message;
  status.className = isError ? 'error' : '';
  if (!isError) window.setTimeout(() => { status.textContent = ''; }, 1400);
}

async function boot(): Promise<void> {
  const [settings, tab] = await Promise.all([getSettings(), queryActiveTab()]);
  initial = settings;

  if (tab.url) {
    try { currentHost = new URL(tab.url).host; } catch { currentHost = ''; }
  }

  enabledInput.checked = settings.enabled;
  levelSelect.value = settings.level;
  panelModeSelect.value = settings.panelMode;
  accentSelect.value = settings.accent;
  phoneticsInput.checked = settings.phonetics;
  modelSelect.value = settings.model;
  apiKeyInput.value = settings.apiKey;

  siteOffInput.disabled = currentHost.length === 0;
  siteOffInput.checked = currentHost.length > 0 && settings.disabledHosts.includes(currentHost);
  siteLabel.textContent = currentHost ? 'Disable on ' + currentHost : 'Disable on this site (no page open)';
}

saveButton.addEventListener('click', () => {
  void (async () => {
    saveButton.disabled = true;
    try {
      const base = initial ?? (await getSettings());
      const disabledHosts = new Set(base.disabledHosts);
      if (currentHost) {
        if (siteOffInput.checked) disabledHosts.add(currentHost);
        else disabledHosts.delete(currentHost);
      }
      const saved = await saveSettings({
        enabled: enabledInput.checked,
        level: levelSelect.value as Level,
        panelMode: panelModeSelect.value as PanelMode,
        accent: accentSelect.value as Accent,
        phonetics: phoneticsInput.checked,
        model: modelSelect.value,
        apiKey: apiKeyInput.value.trim(),
        disabledHosts: [...disabledHosts],
      });
      initial = saved;
      flash(saved.apiKey ? 'Saved' : 'Saved (no API key yet)', !saved.apiKey);
    } catch (error) {
      flash(error instanceof Error ? error.message : String(error), true);
    } finally {
      saveButton.disabled = false;
    }
  })();
});

void boot();
