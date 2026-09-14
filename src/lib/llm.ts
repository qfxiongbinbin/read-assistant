import type { ChatMessage } from './prompt';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const REQUEST_TIMEOUT_MS = 45000;
const RETRY_DELAY_MS = 900;

export class LlmError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
  }
}

export interface ChatOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeStatus(status: number, body: string): string {
  if (status === 401) return 'DeepSeek rejected the API key (401). Check the key in the popup.';
  if (status === 402) return 'DeepSeek account has no balance (402).';
  if (status === 429) return 'DeepSeek rate limit reached (429). Wait a moment and retry.';
  if (status >= 500) return 'DeepSeek server error (' + status + '). Retry later.';
  return 'DeepSeek request failed (' + status + '): ' + body.slice(0, 180);
}

async function postOnce(options: ChatOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + options.apiKey,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: 0.2,
        max_tokens: options.maxTokens ?? 1500,
        response_format: { type: 'json_object' },
        stream: false,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function chatJson(options: ChatOptions): Promise<string> {
  let response: Response;
  try {
    response = await postOnce(options);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LlmError('DeepSeek request timed out after ' + REQUEST_TIMEOUT_MS / 1000 + 's.');
    }
    throw new LlmError('Could not reach api.deepseek.com: ' + (error instanceof Error ? error.message : String(error)));
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 429 || response.status >= 500) {
      await sleep(RETRY_DELAY_MS);
      const retry = await postOnce(options).catch(() => null);
      if (retry && retry.ok) return readContent(retry);
      if (retry) {
        const retryBody = await retry.text().catch(() => '');
        throw new LlmError(describeStatus(retry.status, retryBody), retry.status);
      }
    }
    throw new LlmError(describeStatus(response.status, body), response.status);
  }

  return readContent(response);
}

async function readContent(response: Response): Promise<string> {
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new LlmError('DeepSeek returned an empty response.');
  }
  return content;
}
