import { createHash } from 'node:crypto';

export const FINGERPRINT_MARKER_PREFIX = '<!-- repo-arbiter:fingerprint:';

export interface FingerprintParts {
  event: string;
  action: string;
  repo: string;
  entity: string;
  agent?: string;
  updatedAt?: string;
}

export function computeFingerprint(parts: FingerprintParts): string {
  const canonical = [
    parts.event,
    parts.action,
    parts.repo,
    parts.entity,
    parts.agent ?? '',
    parts.updatedAt ?? '',
  ].join(':');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function fingerprintMarker(fingerprint: string): string {
  return `${FINGERPRINT_MARKER_PREFIX}${fingerprint} -->`;
}

export function extractFingerprints(body: string): string[] {
  const matches = body.match(/<!--\s*repo-arbiter:fingerprint:([a-f0-9]{64})\s*-->/g) ?? [];
  return matches.map((marker) => marker.match(/([a-f0-9]{64})/)?.[0] ?? '');
}

export function containsMarker(body: string, marker: string): boolean {
  return body.includes(marker);
}
