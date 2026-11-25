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
  const github = scope === 'github';
  const upstream = github ? 'GitHub API' : 'LLM provider';
  if (status === 401 || status === 403) {
    return github
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
    return github
      ? makeFailure(
          'not-found',
          'GitHub API returned 404.',
          'Check the token scope and that the repository/issue is accessible.',
        )
      : makeFailure(
          'not-found',
          'LLM endpoint returned 404.',
          'Check `ARBITER_LLM_BASE_URL` (OpenAI-compatible providers) and `ARBITER_LLM_MODEL`.',
        );
  }
  if (status === 410) {
    return github
      ? makeFailure(
          'not-found',
          'GitHub API returned 410 (resource is gone).',
          'Check that the repository/issue still exists.',
        )
      : makeFailure(
          'provider-endpoint-gone',
          'LLM endpoint is gone.',
          'Switch provider or update `ARBITER_LLM_BASE_URL`.',
        );
  }
  if (status === 429) {
    return makeFailure(
      'rate-limited',
      `${upstream} rate limit reached.`,
      'Wait for the limit to reset or reduce the number of runs.',
    );
  }
  if (status >= 500) {
    return makeFailure(
      'upstream-unavailable',
      `${upstream} returned HTTP ${status}.`,
      'This is usually transient. Rerun the workflow.',
    );
  }
  return makeFailure(
    'external-error',
    `${upstream} returned HTTP ${status}.`,
    'Check provider status and action inputs, then rerun.',
  );
}

export function describeFailure(failure: ArbiterFailure): string {
  return `${failure.summary}\n\n${failure.fix_markdown}`;
}

/** HTTP status of an Octokit/RequestError-like object, or 0 when there is none. */
export function httpStatusOf(error: unknown): number {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status: unknown }).status)
    : 0;
}
