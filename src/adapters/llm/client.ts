import { ArbiterFailureError, makeFailure } from '../../failures.js';
import type { LlmUsage } from '../../types.js';
import type { JsonRequest, LlmProvider, LlmProviderName } from './types.js';

export interface LlmProviderOptions {
  provider: LlmProviderName;
  apiKey?: string;
  model: string;
  baseUrl?: string;
  githubToken: string;
  mockResponse?: string;
}

type FetchImpl = typeof globalThis.fetch;

const MOCK_ANALYSIS = JSON.stringify({
  category: 'question',
  priority: 'low',
  confidence: 0.5,
  labels: [],
  missingInfo: [],
  duplicateCandidates: [],
  operations: [
    { kind: 'add_labels', authorization: 'POLICY-CATEGORY' },
    { kind: 'post_comment', authorization: 'POLICY-COMMENT', commentTemplate: 'triage-summary' },
  ],
});

const EMPTY_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0 };

async function withRetry(
  run: () => Promise<Response>,
  sleep: (ms: number) => Promise<void>,
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await run();
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 1) {
      return response;
    }
    await sleep(250 * (attempt + 1));
  }
  throw new Error('unreachable');
}

async function responseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function createOpenAiProvider(options: LlmProviderOptions, fetchImpl: FetchImpl, sleep: (ms: number) => Promise<void>): LlmProvider {
  const baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  return {
    async generateJson<T>(request: JsonRequest, parse: (raw: string) => T) {
      try {
        const response = await withRetry(
          () =>
            fetchImpl(`${baseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                authorization: `Bearer ${options.apiKey ?? ''}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                model: options.model,
                temperature: 0,
                max_tokens: request.maxTokens,
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'system', content: request.system },
                  { role: 'user', content: request.user },
                ],
              }),
            }),
          sleep,
        );
        if (!response.ok) {
          throw new ArbiterFailureError(
            makeFailure(
              response.status === 401 || response.status === 403 ? 'invalid-llm-key' : 'external-error',
              `OpenAI-compatible endpoint returned HTTP ${response.status}.`,
              `Check the provider configuration. Response: ${(await responseText(response)).slice(0, 300)}`,
            ),
          );
        }
        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const text = payload.choices?.[0]?.message?.content;
        if (typeof text !== 'string') throw new Error('OpenAI response has no message content');
        return {
          data: parse(text),
          usage: {
            inputTokens: payload.usage?.prompt_tokens ?? 0,
            outputTokens: payload.usage?.completion_tokens ?? 0,
          },
        };
      } catch (error) {
        if (error instanceof ArbiterFailureError) throw error;
        throw new ArbiterFailureError(
          makeFailure('llm-network', 'OpenAI-compatible request failed.', error instanceof Error ? error.message : String(error)),
        );
      }
    },
  };
}

function createAnthropicProvider(options: LlmProviderOptions, fetchImpl: FetchImpl, sleep: (ms: number) => Promise<void>): LlmProvider {
  return {
    async generateJson<T>(request: JsonRequest, parse: (raw: string) => T) {
      try {
        const response = await withRetry(
          () =>
            fetchImpl('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': options.apiKey ?? '',
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                model: options.model,
                max_tokens: request.maxTokens,
                temperature: 0,
                system: request.system,
                messages: [{ role: 'user', content: request.user }],
              }),
            }),
          sleep,
        );
        if (!response.ok) {
          throw new ArbiterFailureError(
            makeFailure(
              response.status === 401 || response.status === 403 ? 'invalid-llm-key' : 'external-error',
              `Anthropic returned HTTP ${response.status}.`,
              `Check the API key and model. Response: ${(await responseText(response)).slice(0, 300)}`,
            ),
          );
        }
        const payload = (await response.json()) as {
          content?: Array<{ type?: string; text?: string }>;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const text = payload.content?.find((item) => item.type === 'text')?.text;
        if (typeof text !== 'string') throw new Error('Anthropic response has no text block');
        return {
          data: parse(text),
          usage: {
            inputTokens: payload.usage?.input_tokens ?? 0,
            outputTokens: payload.usage?.output_tokens ?? 0,
          },
        };
      } catch (error) {
        if (error instanceof ArbiterFailureError) throw error;
        throw new ArbiterFailureError(
          makeFailure('llm-network', 'Anthropic request failed.', error instanceof Error ? error.message : String(error)),
        );
      }
    },
  };
}

function createMockProvider(response: string): LlmProvider {
  return {
    async generateJson<T>(_request: JsonRequest, parse: (raw: string) => T) {
      return { data: parse(response), usage: EMPTY_USAGE };
    },
  };
}

export function createLlmProvider(
  options: LlmProviderOptions,
  fetchImpl: FetchImpl = globalThis.fetch,
  sleep: (ms: number) => Promise<void> = async (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): LlmProvider {
  if (options.apiKey && options.apiKey === options.githubToken) {
    throw new ArbiterFailureError(
      makeFailure(
        'llm-key-is-github-token',
        'LLM API key must not equal GITHUB_TOKEN.',
        'Use a separate provider key so credentials are not sent to a third-party LLM host.',
      ),
    );
  }
  if (options.provider === 'mock') {
    return createMockProvider(options.mockResponse ?? MOCK_ANALYSIS);
  }
  if (options.provider === 'anthropic') return createAnthropicProvider(options, fetchImpl, sleep);
  return createOpenAiProvider(options, fetchImpl, sleep);
}
