import { describe, expect, it } from 'vitest';
import { createLlmProvider, MOCK_ANALYSIS } from '../src/adapters/llm/client.js';
import { parseAnalysis } from '../src/core/parse.js';
import { ArbiterFailureError } from '../src/failures.js';
import { makeAnalysis } from './fixtures.js';

const request = { system: 'system', user: 'user', maxTokens: 500 };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createLlmProvider', () => {
  it('returns raw OpenAI-compatible text and usage; validation stays with the caller', async () => {
    const fetchImpl = async (): Promise<Response> =>
      jsonResponse({
        choices: [{ message: { content: JSON.stringify(makeAnalysis()) } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

    const provider = createLlmProvider(
      { provider: 'openai', apiKey: 'key', model: 'gpt-4o-mini', githubToken: 'gh-token' },
      fetchImpl as typeof globalThis.fetch,
    );
    const result = await provider.generate(request);
    expect(parseAnalysis(result.raw).category).toBe('bug');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it('still reports usage when the text is not valid JSON', async () => {
    const fetchImpl = async (): Promise<Response> =>
      jsonResponse({ choices: [{ message: { content: 'not json' } }], usage: { prompt_tokens: 3, completion_tokens: 4 } });

    const provider = createLlmProvider(
      { provider: 'openai', apiKey: 'key', model: 'gpt-4o-mini', githubToken: 'gh-token' },
      fetchImpl as typeof globalThis.fetch,
    );
    const result = await provider.generate(request);
    expect(result.raw).toBe('not json');
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 4 });
    expect(() => parseAnalysis(result.raw)).toThrow(ArbiterFailureError);
  });

  it('returns raw Anthropic text', async () => {
    const fetchImpl = async (): Promise<Response> =>
      jsonResponse({
        content: [{ type: 'text', text: JSON.stringify(makeAnalysis({ category: 'docs' })) }],
        usage: { input_tokens: 5, output_tokens: 7 },
      });

    const provider = createLlmProvider(
      { provider: 'anthropic', apiKey: 'key', model: 'claude', githubToken: 'gh-token' },
      fetchImpl as typeof globalThis.fetch,
    );
    const result = await provider.generate(request);
    expect(parseAnalysis(result.raw).category).toBe('docs');
    expect(result.usage.outputTokens).toBe(7);
  });

  it('uses a schema-valid canned response for the mock provider', async () => {
    const provider = createLlmProvider({ provider: 'mock', model: 'mock', githubToken: 'gh-token' });
    const result = await provider.generate(request);
    expect(result.raw).toBe(MOCK_ANALYSIS);
    expect(parseAnalysis(result.raw).operations.length).toBeGreaterThan(0);
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('refuses to send GITHUB_TOKEN as the LLM key', () => {
    expect(() =>
      createLlmProvider({
        provider: 'openai',
        apiKey: 'same-token',
        model: 'gpt-4o-mini',
        githubToken: 'same-token',
      }),
    ).toThrow(ArbiterFailureError);
  });

  it('does not silently fall back to mock when a key is missing', async () => {
    const fetchImpl = async (): Promise<Response> => jsonResponse({}, 401);
    const provider = createLlmProvider(
      { provider: 'openai', model: 'gpt-4o-mini', githubToken: 'gh-token' },
      fetchImpl as typeof globalThis.fetch,
    );
    await expect(provider.generate(request)).rejects.toMatchObject({
      failure: { class_name: 'invalid-llm-key' },
    });
  });

  it('classifies rate limits structurally', async () => {
    const fetchImpl = async (): Promise<Response> => jsonResponse({}, 429);
    const provider = createLlmProvider(
      { provider: 'openai', apiKey: 'key', model: 'gpt-4o-mini', githubToken: 'gh-token' },
      fetchImpl as typeof globalThis.fetch,
      async () => undefined,
    );
    await expect(provider.generate(request)).rejects.toMatchObject({
      failure: { class_name: 'rate-limited' },
    });
  });

  it('retries a transient 503 once before succeeding', async () => {
    let calls = 0;
    const fetchImpl = async (): Promise<Response> => {
      calls += 1;
      return calls === 1
        ? jsonResponse({}, 503)
        : jsonResponse({ choices: [{ message: { content: '{}' } }], usage: {} });
    };
    const provider = createLlmProvider(
      { provider: 'openai', apiKey: 'key', model: 'gpt-4o-mini', githubToken: 'gh-token' },
      fetchImpl as typeof globalThis.fetch,
      async () => undefined,
    );
    const result = await provider.generate(request);
    expect(calls).toBe(2);
    expect(result.raw).toBe('{}');
  });
});
