export type FailureClass =
  | 'config-invalid'
  | 'excluded'
  | 'already-processed'
  | 'missing-issues-write'
  | 'not-found'
  | 'rate-limited'
  | 'provider-endpoint-gone'
  | 'invalid-llm-key'
  | 'llm-key-is-github-token'
  | 'llm-bad-response'
  | 'llm-network'
  | 'upstream-unavailable'
  | 'external-error'
  | 'internal-error';

export interface ArbiterFailure {
  class_name: FailureClass;
  summary: string;
  fix_markdown: string;
}

export class ArbiterFailureError extends Error {
  readonly failure: ArbiterFailure;

  constructor(failure: ArbiterFailure) {
    super(failure.summary);
    this.name = 'ArbiterFailureError';
    this.failure = failure;
  }
}

export class ConfigError extends ArbiterFailureError {
  constructor(message: string) {
    super({
      class_name: 'config-invalid',
      summary: message,
      fix_markdown: 'Fix `.github/arbiter.yml` or the action inputs, then rerun.',
    });
    this.name = 'ConfigError';
  }
}

export function makeFailure(
  class_name: FailureClass,
  summary: string,
  fix_markdown: string,
): ArbiterFailure {
  return { class_name, summary, fix_markdown };
}

export function classifyHttpStatus(status: number, scope: 'github' | 'llm'): ArbiterFailure {
  if (status === 401 || status === 403) {
    return scope === 'github'
      ? makeFailure(
          'missing-issues-write',
          'GitHub token cannot write to this repository.',
          'Grant `issues: write` to the job and ensure the token has access to this repository.',
        )
      : makeFailure(
          'invalid-llm-key',
          'LLM provider rejected the credentials.',
          'Check `ARBITER_LLM_API_KEY` and the configured provider.',
        );
  }
  if (status === 404) {
    return makeFailure(
      'not-found',
      'GitHub API returned 404.',
      'Check the token scope and that the repository/issue is accessible.',
    );
  }
  if (status === 410) {
    return makeFailure(
      'provider-endpoint-gone',
      'LLM endpoint is gone.',
      'Switch provider or update `ARBITER_LLM_BASE_URL`.',
    );
  }
  if (status === 429) {
    return makeFailure(
      'rate-limited',
      'Rate limit reached.',
      'Wait for the limit to reset or reduce the number of runs.',
    );
  }
  if (status >= 500) {
    return makeFailure(
      'upstream-unavailable',
      `Upstream returned HTTP ${status}.`,
      'This is usually transient. Rerun the workflow.',
    );
  }
  return makeFailure(
    'external-error',
    `External API returned HTTP ${status}.`,
    'Check provider status and action inputs, then rerun.',
  );
}

export function describeFailure(failure: ArbiterFailure): string {
  return `${failure.summary}\n\n${failure.fix_markdown}`;
}
