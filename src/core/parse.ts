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

export function parseAnalysis(raw: string): Analysis {
  try {
    const parsed = JSON.parse(extractJson(raw)) as unknown;
    return analysisSchema.parse(parsed);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown parse error';
    throw new ArbiterFailureError(
      makeFailure(
        'llm-bad-response',
        'LLM response did not match the analysis schema.',
        `Schema detail: ${detail}. The raw response was not applied.`,
      ),
    );
  }
}
