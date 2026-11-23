import { beforeEach } from 'vitest';

beforeEach(() => {
  for (const key of Object.keys(process.env)) {
    if (/^(GITHUB_|INPUT_|RUNNER_|ARBITER_)/.test(key)) {
      delete process.env[key];
    }
  }
});
