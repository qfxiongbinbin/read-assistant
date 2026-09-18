import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  cacheKey,
  explainKey,
  getCached,
  getCachedExplain,
  getCachedTranslate,
  getSettings,
  normalizeText,
  putCached,
  putCachedExplain,
  putCachedTranslate,
  translateKey,
} from '../lib/cache';
import { chatJson } from '../lib/llm';
import { lookup } from '../lib/phonetics';
import { ALLOWED_MODELS, buildExplainMessages, buildMessages, buildTranslateMessages } from '../lib/prompt';
import { availableActions } from '../lib/selection';
import {
  parseExplanation,
  parseResult,
  parseTranslation,
  verify,
  verifyExplanation,
  verifyTranslation,
} from '../lib/verify';
import type {
  ExplainRequest,
  ExplainResponse,
  PhoneticsRequest,
  PhoneticsResponse,
  RuntimeMessage,
  SimplifyRequest,
  SimplifyResponse,
  TranslateRequest,
  TranslateResponse,
} from '../lib/types';

const MAX_ATTEMPTS = 3;

async function handleSimplify(request: SimplifyRequest): Promise<SimplifyResponse> {
  const settings = await getSettings();
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: 'No DeepSeek API key yet. Click the readAssistant icon and add one.',
      attempts: 0,
    };
  }

  const model = ALLOWED_MODELS.includes(request.model) ? request.model : settings.model;
  const level = request.level;
  const text = normalizeText(request.text);
  if (text.length < 20) {
    return { ok: false, error: 'This paragraph is too short to simplify.', attempts: 0 };
  }

  const key = cacheKey(text, level, model);
  const cached = await getCached(key);
  if (cached) return { ok: true, result: cached, cached: true, attempts: 0 };

  let violations: string[] = [];
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;

    let raw: string;
    try {
      raw = await chatJson({ apiKey, model, messages: buildMessages(text, level, violations) });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        attempts,
      };
    }

    const parsed = parseResult(raw);
    if (!parsed) {
      violations = ['The reply was not valid JSON. Reply with the JSON object only.'];
      continue;
    }

    const outcome = verify(text, parsed);
    if (outcome.ok) {
      await putCached(key, parsed, level, model);
      return { ok: true, result: parsed, cached: false, attempts };
    }
    violations = outcome.violations;
  }

  return {
    ok: false,
    error:
      'Could not reach ' + level + ' after ' + MAX_ATTEMPTS + ' tries. Try level B2, or click Retry.',
    attempts,
  };
}

const MAX_TRANSLATE_ATTEMPTS = 3;

/** Restate a word or a short phrase with the simplest words. Still English, never Chinese. */
async function handleTranslate(request: TranslateRequest): Promise<TranslateResponse> {
  const settings = await getSettings();
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: 'No DeepSeek API key yet. Click the readAssistant icon and add one.',
      attempts: 0,
    };
  }

  const model = ALLOWED_MODELS.includes(request.model) ? request.model : settings.model;
  const text = normalizeText(request.text);
  if (text.length === 0) {
    return { ok: false, error: 'Nothing to translate.', attempts: 0 };
  }
  // Same rule the content script used to offer the action, so a stale panel cannot sneak past it.
  if (!availableActions(text).includes('translate')) {
    return {
      ok: false,
      error: 'This is too long to restate. Select a word, a phrase or one sentence, or use Simplify.',
      attempts: 0,
    };
  }

  const key = translateKey(text, model);
  const cached = await getCachedTranslate(key);
  if (cached) return { ok: true, result: cached, cached: true, attempts: 0 };

  let violations: string[] = [];
  let attempts = 0;

  while (attempts < MAX_TRANSLATE_ATTEMPTS) {
    attempts += 1;

    let raw: string;
    try {
      raw = await chatJson({
        apiKey,
        model,
        messages: buildTranslateMessages(text, violations),
        maxTokens: 700,
      });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        attempts,
      };
    }

    const parsed = parseTranslation(raw);
    if (!parsed) {
      violations = ['The reply was not valid JSON. Reply with the JSON object only.'];
      continue;
    }

    const outcome = verifyTranslation(text, parsed);
    if (outcome.ok) {
      await putCachedTranslate(key, parsed, model);
      return { ok: true, result: parsed, cached: false, attempts };
    }
    violations = outcome.violations;
  }

  return {
    ok: false,
    error: 'Could not restate this in simpler words after ' + MAX_TRANSLATE_ATTEMPTS + ' tries.',
    attempts,
  };
}

const MAX_EXPLAIN_ATTEMPTS = 3;

/** One step deeper: a word explained with even simpler English. */
async function handleExplain(request: ExplainRequest): Promise<ExplainResponse> {
  const settings = await getSettings();
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: 'No DeepSeek API key yet. Click the readAssistant icon and add one.',
      attempts: 0,
    };
  }

  const word = normalizeText(request.word).toLowerCase();
  if (word.length < 2) {
    return { ok: false, error: 'Nothing to explain.', attempts: 0 };
  }

  const model = ALLOWED_MODELS.includes(request.model) ? request.model : settings.model;
  const level = request.level;
  const key = explainKey(word, level, model);
  const cached = await getCachedExplain(key);
  if (cached) return { ok: true, result: cached, cached: true, attempts: 0 };

  const context = typeof request.context === 'string' ? request.context : '';
  let violations: string[] = [];
  let attempts = 0;

  while (attempts < MAX_EXPLAIN_ATTEMPTS) {
    attempts += 1;

    let raw: string;
    try {
      raw = await chatJson({
        apiKey,
        model,
        messages: buildExplainMessages(word, context, violations),
        maxTokens: 400,
      });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        attempts,
      };
    }

    const parsed = parseExplanation(raw, word);
    if (!parsed) {
      violations = ['The reply was not valid JSON. Reply with the JSON object only.'];
      continue;
    }

    const outcome = verifyExplanation(word, parsed);
    if (outcome.ok) {
      await putCachedExplain(key, parsed, level, model);
      return { ok: true, result: parsed, cached: false, attempts };
    }
    violations = outcome.violations;
  }

  return {
    ok: false,
    error: 'Could not explain "' + word + '" simply enough after ' + MAX_EXPLAIN_ATTEMPTS + ' tries.',
    attempts,
  };
}

async function handlePhonetics(request: PhoneticsRequest): Promise<PhoneticsResponse> {
  try {
    const entries = await lookup(Array.isArray(request.words) ? request.words.slice(0, 400) : []);
    return { ok: true, entries };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const request = message as RuntimeMessage;
    if (!request || typeof request !== 'object') return false;

    if (request.type === 'simplify') {
      void handleSimplify(request).then(
        (response) => sendResponse(response),
        (error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            attempts: 0,
          } satisfies SimplifyResponse),
      );
      return true;
    }

    if (request.type === 'translate') {
      void handleTranslate(request).then(
        (response) => sendResponse(response),
        (error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            attempts: 0,
          } satisfies TranslateResponse),
      );
      return true;
    }

    if (request.type === 'explain') {
      void handleExplain(request).then((response) => sendResponse(response));
      return true;
    }

    if (request.type === 'phonetics') {
      void handlePhonetics(request).then((response) => sendResponse(response));
      return true;
    }

    if (request.type === 'getSettings') {
      void getSettings().then((settings) => sendResponse({ ok: true, settings }));
      return true;
    }

    return false;
  });
});
