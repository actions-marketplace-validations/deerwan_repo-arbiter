import { DEFAULT_CONFIG, type ArbiterConfig } from '../src/config.js';
import type { Analysis } from '../src/core/schema.js';
import type { IssueContext } from '../src/types.js';

export const issueFixture: IssueContext = {
  owner: 'acme',
  repo: 'widget',
  number: 42,
  title: 'Crash when exporting CSV',
  body: 'Steps to reproduce are missing.',
  author: 'reporter',
  labels: [],
  updatedAt: '2026-11-24T00:00:00Z',
  htmlUrl: 'https://github.com/acme/widget/issues/42',
};

export function makeAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    category: 'bug',
    priority: 'high',
    confidence: 0.82,
    labels: [],
    missingInfo: [],
    duplicateCandidates: [],
    operations: [
      { kind: 'add_labels', authorization: 'POLICY-CATEGORY' },
      { kind: 'post_comment', authorization: 'POLICY-COMMENT', commentTemplate: 'triage-summary' },
    ],
    ...overrides,
  };
}

export function makeConfig(overrides: Partial<ArbiterConfig> = {}): ArbiterConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    operations: { ...DEFAULT_CONFIG.operations, ...overrides.operations },
    labels: { ...DEFAULT_CONFIG.labels, ...overrides.labels },
    llm: { ...DEFAULT_CONFIG.llm, ...overrides.llm },
    security: { ...DEFAULT_CONFIG.security, ...overrides.security },
    exclude: { ...DEFAULT_CONFIG.exclude, ...overrides.exclude },
    features: { ...DEFAULT_CONFIG.features, ...overrides.features },
  };
}
