import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig } from '../src/config.js';
import { ConfigError } from '../src/failures.js';

const configurableScopes = ['operations', 'labels', 'llm', 'security', 'exclude', 'features'] as const;

describe('parseConfig', () => {
  it('returns safe defaults for empty input', () => {
    const config = parseConfig({});
    expect(config.enabled).toBe(true);
    expect(config.llm.provider).toBe('openai');
    expect(config.labels.prefix).toBe('arbiter');
  });

  it('rejects invalid provider', () => {
    expect(() => parseConfig({ llm: { provider: 'unknown' } })).toThrow(ConfigError);
  });

  it('rejects unknown mapping categories', () => {
    expect(() => parseConfig({ labels: { mapping: { nope: ['arbiter/nope'] } } })).toThrow(/categories/);
  });

  it('bounds LLM attempts with maxRuns (default 3, must be positive)', () => {
    expect(parseConfig({}).maxRuns).toBe(3);
    expect(parseConfig({ maxRuns: 2 }).maxRuns).toBe(2);
    expect(() => parseConfig({ maxRuns: 0 })).toThrow(ConfigError);
    expect(() => parseConfig({ maxRuns: 1.5 })).toThrow(ConfigError);
  });

  it('derives DEFAULT_CONFIG from the schema so defaults cannot drift', () => {
    expect(DEFAULT_CONFIG).toEqual(parseConfig({}));
  });

  it('hands out independent default objects so one config cannot mutate another', () => {
    const a = parseConfig({});
    const b = parseConfig({});
    for (const scope of configurableScopes) {
      expect(a[scope]).not.toBe(b[scope]);
    }
    a.labels.allowlist.push('arbiter/mutated');
    a.operations.allowed.pop();
    a.labels.mapping.bug?.push('arbiter/mutated');
    expect(parseConfig({}).labels.allowlist).not.toContain('arbiter/mutated');
    expect(parseConfig({}).operations.allowed).toContain('post_comment');
    expect(parseConfig({}).labels.mapping.bug).toEqual(['arbiter/bug']);
  });
});
