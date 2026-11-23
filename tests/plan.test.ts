import { describe, expect, it } from 'vitest';
import { preparePlan, renderComment } from '../src/core/plan.js';
import { makeAnalysis, makeConfig } from './fixtures.js';

describe('preparePlan', () => {
  it('maps category and priority labels, filters unknown and existing labels', () => {
    const analysis = makeAnalysis({ labels: ['arbiter/bug', 'not-allowed'] });
    const config = makeConfig();
    const operations = preparePlan(analysis, config, ['arbiter/question']);

    expect(operations[0]).toMatchObject({
      kind: 'add_labels',
      labels: ['arbiter/bug', 'arbiter/priority-high'],
    });
  });

  it('falls back to policy authorization for mapped label operations', () => {
    const analysis = makeAnalysis({
      operations: [
        { kind: 'add_labels', authorization: 'just-do-it' },
        { kind: 'post_comment', authorization: 'POLICY-COMMENT' },
      ],
    });
    const operations = preparePlan(analysis, makeConfig(), []);
    const addLabels = operations.find((op) => op.kind === 'add_labels');
    expect(addLabels?.authorization).toBe('POLICY-LABEL');
    expect(operations.some((op) => op.kind === 'post_comment')).toBe(true);
  });

  it('respects disabled operations', () => {
    const config = makeConfig({ operations: { allowed: ['post_comment'] } });
    const operations = preparePlan(makeAnalysis(), config, []);
    expect(operations.map((op) => op.kind)).toEqual(['post_comment']);
  });
});

describe('renderComment', () => {
  it('redacts markdown and HTML from model-provided text', () => {
    const analysis = makeAnalysis({
      missingInfo: ['See [evil](http://example.com) <script>alert(1)</script>'],
    });
    const rendered = renderComment(analysis, makeConfig());
    expect(rendered).not.toContain('http://example.com');
    expect(rendered).not.toContain('<script>');
    expect(rendered).toContain('See evil alert(1)');
  });
});
