import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const action = readFileSync(path.resolve(process.cwd(), 'action.yml'), 'utf8');
const workflow = readFileSync(path.resolve(process.cwd(), 'examples/workflows/arbiter.yml'), 'utf8');
const appWorkflow = readFileSync(
  path.resolve(process.cwd(), 'examples/workflows/arbiter-github-app.yml'),
  'utf8',
);

describe('action contracts', () => {
  it('defaults dry-run to true', () => {
    expect(action).toMatch(/dry-run:[\s\S]*default: 'true'/);
  });

  it('uses the CJS bundle as the action entrypoint', () => {
    expect(action).toContain("main: 'dist/index.cjs'");
  });

  it('declares the node24 runtime (node20 was removed from runners on 2026-09-23)', () => {
    expect(action).toContain("using: 'node24'");
    expect(action).not.toContain("using: 'node20'");
  });

  it('declares an issue-number input for manual runs', () => {
    expect(action).toContain('issue-number:');
  });

  it('declares custom token, bot identity and force inputs', () => {
    expect(action).toContain('github-token:');
    expect(action).toContain('bot-login:');
    expect(action).toContain('force:');
  });

  it('declares issue-number for workflow_dispatch in both examples', () => {
    expect(workflow).toContain('issue-number:');
    expect(workflow).toContain('issue-number: ${{ inputs.issue-number }}');
    expect(appWorkflow).toContain('issue-number:');
    expect(appWorkflow).toContain('issue-number: ${{ inputs.issue-number }}');
  });

  it('shows how to use a GitHub App token for a custom bot identity', () => {
    expect(appWorkflow).toContain('actions/create-github-app-token@v2');
    expect(appWorkflow).toContain('github-token: ${{ steps.app-token.outputs.token }}');
  });

  it('uses minimal permissions and serial concurrency', () => {
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('issues: write');
    expect(workflow).toContain('group: repo-arbiter');
    expect(workflow).toContain('queue: max');
    expect(workflow).not.toContain('cancel-in-progress');
  });
});
