import { describe, expect, it } from 'vitest';
import { applyPlan, DryRunWriter } from '../src/core/apply.js';
import { makeAnalysis, makeConfig } from './fixtures.js';
import { preparePlan } from '../src/core/plan.js';

describe('applyPlan with DryRunWriter', () => {
  it('records intended writes without performing IO', async () => {
    const operations = preparePlan(makeAnalysis(), makeConfig(), []);
    const writer = new DryRunWriter();
    const applied = await applyPlan(operations, writer, {
      summaryMarker: '<!-- repo-arbiter:summary:v1 -->',
      commentBody: 'body',
      labelDescriptions: {},
    });

    expect(applied).toHaveLength(2);
    expect(writer.calls.map((call) => call.method)).toEqual([
      'ensureLabel',
      'ensureLabel',
      'addLabels',
      'upsertComment',
    ]);
  });

  it('records failure comment cleanup after a successful apply', async () => {
    const operations = preparePlan(makeAnalysis(), makeConfig(), []);
    const writer = new DryRunWriter();
    await applyPlan(operations, writer, {
      summaryMarker: '<!-- repo-arbiter:summary:v1 -->',
      commentBody: 'body',
      labelDescriptions: {},
      failureMarker: '<!-- repo-arbiter:failure:v1 -->',
      botLogin: 'repo-arbiter-dev[bot]',
    });

    expect(writer.calls.at(-1)).toMatchObject({
      method: 'deleteCommentsWithMarker',
      args: ['<!-- repo-arbiter:failure:v1 -->', 'repo-arbiter-dev[bot]'],
    });
  });
});
