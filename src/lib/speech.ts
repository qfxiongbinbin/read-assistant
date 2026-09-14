import { ACCENT_LOCALE, type Accent } from './types';

const DEFAULT_RATE = 0.9;

/** Voices that sound good for a learner, best first, per accent. */
const PREFERRED: Record<Accent, readonly string[]> = {
  uk: [
    'Serena',
    'Daniel',
    'Kate',
    'Google UK English Female',
    'Google UK English Male',
    'Microsoft Libby',
    'Microsoft Sonia',
  ],
  us: [
    'Samantha',
    'Alex',
    'Google US English',
    'Microsoft Aria',
    'Microsoft Jenny',
    'Microsoft Michelle',
  ],
};

let voices: SpeechSynthesisVoice[] = [];

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function refreshVoices(): void {
  if (!speechAvailable()) return;
  const list = window.speechSynthesis.getVoices();
  if (list.length > 0) voices = list;
}

export function initSpeech(): void {
  if (!speechAvailable()) return;
  refreshVoices();
  window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
}

/** Only exact-locale voices are used; otherwise we let the browser pick by \`lang\`. */
export function pickVoice(
  accent: Accent,
  list: readonly SpeechSynthesisVoice[] = voices,
): SpeechSynthesisVoice | null {
  const locale = ACCENT_LOCALE[accent].toLowerCase();
  const exact = list.filter((voice) => voice.lang.replace('_', '-').toLowerCase() === locale);
  for (const name of PREFERRED[accent]) {
    const hit = exact.find((voice) => voice.name.toLowerCase().includes(name.toLowerCase()));
    if (hit) return hit;
  }
  return exact[0] ?? null;
}

export function speak(text: string, accent: Accent, rate = DEFAULT_RATE): void {
  if (!speechAvailable()) return;
  const trimmed = text.trim();
  if (trimmed.length === 0) return;

  const synth = window.speechSynthesis;
  synth.cancel();
  if (voices.length === 0) refreshVoices();

  const utterance = new SpeechSynthesisUtterance(trimmed);
  const voice = pickVoice(accent);
  if (voice) utterance.voice = voice;
  utterance.lang = ACCENT_LOCALE[accent];
  utterance.rate = rate;
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}
