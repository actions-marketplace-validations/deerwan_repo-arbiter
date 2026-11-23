import { describe, expect, it } from 'vitest';
import { ArbiterFailureError } from '../src/failures.js';
import { parseAnalysis } from '../src/core/parse.js';
import { makeAnalysis } from './fixtures.js';

describe('parseAnalysis', () => {
  it('parses a fenced JSON response', () => {
    const raw = `Here is the result:\n\`\`\`json\n${JSON.stringify(makeAnalysis())}\n\`\`\``;
    expect(parseAnalysis(raw).category).toBe('bug');
  });

  it('rejects unknown fields', () => {
    const raw = JSON.stringify({ ...makeAnalysis(), unexpected: true });
    expect(() => parseAnalysis(raw)).toThrow(ArbiterFailureError);
  });

  it('rejects invalid categories', () => {
    const raw = JSON.stringify({ ...makeAnalysis(), category: 'unknown' });
    expect(() => parseAnalysis(raw)).toThrow(/analysis schema/i);
  });

  it('rejects unknown policy tokens', () => {
    const raw = JSON.stringify({
      ...makeAnalysis(),
      operations: [{ kind: 'add_labels', authorization: 'POLICY-ROOT' }],
    });
    expect(() => parseAnalysis(raw)).toThrow(ArbiterFailureError);
  });
});
