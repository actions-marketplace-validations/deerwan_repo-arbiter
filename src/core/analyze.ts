import type { LlmProvider, LlmRequest } from '../adapters/llm/types.js';
import type { LlmUsage } from '../types.js';
import { AnalysisParseError, parseAnalysis } from './parse.js';
import type { Analysis } from './schema.js';
import { buildUntrustedBlock } from './sanitizer.js';

/**
 * Upper bound on total model attempts per issue (first call included) when the
 * JSON keeps failing validation. Keeps `maxRuns` values copied from older
 * examples from turning a bad model into an unbounded bill.
 */
export const MAX_LLM_ATTEMPTS = 3;

/** Validator detail is echoed back into the prompt, so keep it short. */
const MAX_VALIDATOR_HINT_LENGTH = 600;

export interface AnalyzeResult {
  data: Analysis;
  usage: LlmUsage;
  attempts: number;
  /** The user prompt actually sent on the final attempt (includes validator feedback if repaired). */
  finalUserPrompt: string;
}

/** Clamps `maxRuns` (schema allows up to 100 for backward compatibility) to a cost-bounded attempt count. */
export function resolveMaxAttempts(maxRuns: number): number {
  if (!Number.isFinite(maxRuns)) return 1;
  return Math.min(MAX_LLM_ATTEMPTS, Math.max(1, Math.trunc(maxRuns)));
}

function addUsage(total: LlmUsage, delta: LlmUsage): LlmUsage {
  return {
    inputTokens: total.inputTokens + delta.inputTokens,
    outputTokens: total.outputTokens + delta.outputTokens,
  };
}

/**
 * The validator detail derives from the model's own output, so it is wrapped in
 * the same explicit untrusted boundary as issue text. `parseAnalysis` already
 * strips raw offending values; this boundary is the second lock.
 */
function withValidatorFeedback(originalUserPrompt: string, detail: string): string {
  return [
    originalUserPrompt,
    '',
    'Your previous response was rejected by the schema validator. Validator detail:',
    buildUntrustedBlock('VALIDATOR_DETAIL', detail, MAX_VALIDATOR_HINT_LENGTH),
    'Return only the corrected JSON object matching the schema. Do not add explanations.',
  ].join('\n');
}

/**
 * Runs the model until its output passes the schema or the attempt budget is
 * exhausted. Only schema rejections are retried: network/HTTP failures have
 * already been classified by the provider and are rethrown immediately.
 * Usage is accumulated across attempts so the cost of repairs is visible.
 */
export async function analyzeWithRetry(
  provider: LlmProvider,
  request: LlmRequest,
  maxRuns: number,
  parse: (raw: string) => Analysis = parseAnalysis,
  log: (message: string) => void = () => {},
): Promise<AnalyzeResult> {
  const maxAttempts = resolveMaxAttempts(maxRuns);
  let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  let user = request.user;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await provider.generate({ ...request, user });
    usage = addUsage(usage, result.usage);
    try {
      return { data: parse(result.raw), usage, attempts: attempt, finalUserPrompt: user };
    } catch (error) {
      if (!(error instanceof AnalysisParseError)) throw error;
      if (attempt === maxAttempts) {
        log(`LLM usage after ${attempt} rejected attempt(s): input=${usage.inputTokens} output=${usage.outputTokens}`);
        throw error;
      }
      log(`LLM response rejected (attempt ${attempt}/${maxAttempts}): ${error.detail}`);
      user = withValidatorFeedback(request.user, error.detail);
    }
  }
  throw new Error('unreachable');
}
