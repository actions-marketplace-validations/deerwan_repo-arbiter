import type { LlmUsage } from '../../types.js';

export type LlmProviderName = 'openai' | 'anthropic' | 'mock';

export interface LlmRequest {
  system: string;
  user: string;
  maxTokens: number;
}

export interface LlmResult {
  /** Raw model text. Schema validation is the caller's job so a rejected response still reports usage. */
  raw: string;
  usage: LlmUsage;
}

export interface LlmProvider {
  generate(request: LlmRequest): Promise<LlmResult>;
}
