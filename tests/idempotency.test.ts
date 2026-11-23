import { describe, expect, it } from 'vitest';
import {
  computeFingerprint,
  extractFingerprints,
  fingerprintMarker,
} from '../src/core/idempotency.js';

describe('idempotency', () => {
  it('produces a stable fingerprint for identical events', () => {
    const parts = {
      event: 'issues',
      action: 'opened',
      repo: 'acme/widget',
      entity: '42',
      agent: 'triage',
    };
    expect(computeFingerprint(parts)).toBe(computeFingerprint({ ...parts }));
  });

  it('changes fingerprint when updatedAt changes', () => {
    const base = { event: 'issues', action: 'opened', repo: 'acme/widget', entity: '42' };
    expect(computeFingerprint({ ...base, updatedAt: 'a' })).not.toBe(
      computeFingerprint({ ...base, updatedAt: 'b' }),
    );
  });

  it('extracts fingerprints from comment bodies', () => {
    const fp = 'a'.repeat(64);
    const body = `${fingerprintMarker(fp)}\n\ntriage`;
    expect(extractFingerprints(body)).toEqual([fp]);
  });
});
