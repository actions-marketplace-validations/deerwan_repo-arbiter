import { z } from 'zod';
import { ArbiterFailureError, makeFailure } from '../failures.js';
import { analysisSchema, type Analysis } from './schema.js';

function extractJson(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('No JSON object found');
  }
  return raw.slice(start, end + 1);
}

/**
 * Structural summary of schema failures: where and what kind, plus the expected
 * values from *our* schema. The raw offending value is deliberately omitted so
 * model-controlled text (which may carry prompt-injection payloads or forged
 * boundary markers) is never echoed back into a later prompt as "validator feedback".
 */
function summarizeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => {
      const where = issue.path.join('.') || 'root';
      let expected = '';
      if ('options' in issue) {
        const options = (issue as { options?: unknown[] }).options ?? [];
        expected = `; expected one of ${options.join(' | ')}`;
      } else if ('maximum' in issue) {
        expected = `; maximum ${String((issue as { maximum?: unknown }).maximum)}`;
      } else if ('minimum' in issue) {
        expected = `; minimum ${String((issue as { minimum?: unknown }).minimum)}`;
      }
      return `${where}: ${issue.code}${expected}`;
    })
    .join('; ');
}

/**
 * Thrown when the model text fails the analysis schema. Carries the validator
 * detail so the caller can feed it back to the model for a repair attempt.
 */
export class AnalysisParseError extends ArbiterFailureError {
  readonly detail: string;

  constructor(detail: string) {
    super(
      makeFailure(
        'llm-bad-response',
        'LLM response did not match the analysis schema.',
        `Schema detail: ${detail}. The raw response was not applied.`,
      ),
    );
    this.name = 'AnalysisParseError';
    this.detail = detail;
  }
}

export function parseAnalysis(raw: string): Analysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw)) as unknown;
  } catch (error) {
    // V8's SyntaxError messages can quote a snippet of the raw text; keep only our own reason.
    const reason = error instanceof SyntaxError ? 'syntax error' : error instanceof Error ? error.message : 'unknown error';
    throw new AnalysisParseError(`malformed JSON (${reason})`);
  }
  const result = analysisSchema.safeParse(parsed);
  if (!result.success) throw new AnalysisParseError(summarizeIssues(result.error));
  return result.data;
}
