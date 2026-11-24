import { describe, expect, it } from 'vitest';
import { classifyHttpStatus } from '../src/failures.js';

describe('classifyHttpStatus', () => {
  it('reports GitHub 404 as a repository/token problem', () => {
    const failure = classifyHttpStatus(404, 'github');
    expect(failure.class_name).toBe('not-found');
    expect(failure.summary).toContain('GitHub API');
    expect(failure.fix_markdown).toContain('token');
  });

  it('reports LLM 404 as an endpoint problem, not a GitHub one', () => {
    const failure = classifyHttpStatus(404, 'llm');
    expect(failure.class_name).toBe('not-found');
    expect(failure.summary).toContain('LLM endpoint');
    expect(failure.summary).not.toContain('GitHub');
    expect(failure.fix_markdown).toContain('ARBITER_LLM_BASE_URL');
  });

  it('only labels 410 as provider-endpoint-gone in LLM scope', () => {
    expect(classifyHttpStatus(410, 'llm').class_name).toBe('provider-endpoint-gone');
    const github = classifyHttpStatus(410, 'github');
    expect(github.class_name).toBe('not-found');
    expect(github.summary).toContain('GitHub API');
  });

  it('names the failing upstream for rate limits and 5xx', () => {
    expect(classifyHttpStatus(429, 'llm').summary).toContain('LLM provider');
    expect(classifyHttpStatus(429, 'github').summary).toContain('GitHub API');
    expect(classifyHttpStatus(503, 'llm').summary).toContain('LLM provider');
    expect(classifyHttpStatus(502, 'github').summary).toContain('GitHub API');
    expect(classifyHttpStatus(503, 'llm').class_name).toBe('upstream-unavailable');
  });

  it('keeps the authentication failure classes per scope', () => {
    expect(classifyHttpStatus(401, 'github').class_name).toBe('missing-issues-write');
    expect(classifyHttpStatus(403, 'llm').class_name).toBe('invalid-llm-key');
    expect(classifyHttpStatus(418, 'llm').class_name).toBe('external-error');
  });
});
