import { describe, expect, it } from 'vitest';
import { createLlmProvider } from '../src/adapters/llm/client.js';
import { parseAnalysis } from '../src/core/parse.js';
import { ArbiterFailureError } from '../src/failures.js';
import { makeAnalysis } from './fixtures.js';

const request = {
  system: 'system',
  user: 'user',
  schema: {},
  maxTokens: 500,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createLlmProvider', () => {
  it('parses an OpenAI-compatible response and reports usage', async () => {
    const fetchImpl = async (): Promise<Response> =>
      jsonResponse({
        choices: [{ message: { content: JSON.stringify(makeAnalysis()) } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

    const provider = createLlmProvider(
      { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini', githubToken: 'gh-token' },
      fetchImpl as typeof globalThis.fetch,
    );
    const result = await provider.generateJson(request, parseAnalysis);
    expect(result.data.category).toBe('bug');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it('parses an Anthropic response', async () => {
    const fetchImpl = async (): Promise<Response> =>
      jsonResponse({
        content: [{ type: 'text', text: JSON.stringify(makeAnalysis({ category: 'docs' })) }],
        usage: { input_tokens: 5, output_tokens: 7 },
      });

    const provider = createLlmProvider(
      { provider: 'anthropic', apiKey: 'sk-ant-test', model: 'claude', githubToken: 'gh-token' },
      fetchImpl as typeof globalThis.fetch,
    );
    const result = await provider.generateJson(request, parseAnalysis);
    expect(result.data.category).toBe('docs');
    expect(result.usage.outputTokens).toBe(7);
  });

  it('refuses to send GITHUB_TOKEN as the LLM key', () => {
    expect(() =>
      createLlmProvider({
        provider: 'openai',
        apiKey: 'shared-token',
        model: 'gpt-4o-mini',
        githubToken: 'shared-token',
      }),
    ).toThrow(ArbiterFailureError);
  });
});
