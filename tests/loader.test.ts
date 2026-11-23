import { describe, expect, it } from 'vitest';
import { loadRuntimeOptions } from '../src/config/loader.js';
import { ArbiterFailureError } from '../src/failures.js';

describe('loadRuntimeOptions', () => {
  it('prefers the github-token input over GITHUB_TOKEN', () => {
    process.env['INPUT_GITHUB-TOKEN'] = 'app-token';
    process.env.GITHUB_TOKEN = 'default-token';

    expect(loadRuntimeOptions().githubToken).toBe('app-token');
  });

  it('falls back to GITHUB_TOKEN when no input is provided', () => {
    process.env.GITHUB_TOKEN = 'default-token';

    expect(loadRuntimeOptions().githubToken).toBe('default-token');
  });

  it('rejects an LLM key equal to the effective GitHub token', () => {
    process.env['INPUT_GITHUB-TOKEN'] = 'app-token';
    process.env.ARBITER_LLM_API_KEY = 'app-token';

    expect(() => loadRuntimeOptions()).toThrow(ArbiterFailureError);
  });

  it('rejects an LLM key equal to the raw GITHUB_TOKEN env value', () => {
    process.env['INPUT_GITHUB-TOKEN'] = 'app-token';
    process.env.GITHUB_TOKEN = 'default-token';
    process.env.ARBITER_LLM_API_KEY = 'default-token';

    expect(() => loadRuntimeOptions()).toThrow(ArbiterFailureError);
  });

  it('defaults botLogin and parses force', () => {
    process.env.GITHUB_TOKEN = 'default-token';
    process.env['INPUT_FORCE'] = 'true';

    const options = loadRuntimeOptions();
    expect(options.botLogin).toBe('github-actions[bot]');
    expect(options.force).toBe(true);
  });
});
