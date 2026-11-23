import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const action = readFileSync(path.resolve(process.cwd(), 'action.yml'), 'utf8');
const workflow = readFileSync(path.resolve(process.cwd(), 'examples/workflows/arbiter.yml'), 'utf8');

describe('action contracts', () => {
  it('defaults dry-run to true', () => {
    expect(action).toMatch(/dry-run:[\s\S]*default: 'true'/);
  });

  it('uses the CJS bundle as the action entrypoint', () => {
    expect(action).toContain("main: 'dist/index.cjs'");
  });

  it('declares an issue-number input for manual runs', () => {
    expect(action).toContain('issue-number:');
  });

  it('uses minimal permissions and serial concurrency', () => {
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('issues: write');
    expect(workflow).toContain('group: repo-arbiter');
    expect(workflow).toContain('queue: max');
    expect(workflow).not.toContain('cancel-in-progress');
  });
});
