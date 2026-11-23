import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';
import { ConfigError } from '../src/failures.js';

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
});
