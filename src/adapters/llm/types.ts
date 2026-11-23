import type { LlmUsage } from '../../types.js';

export type LlmProviderName = 'openai' | 'anthropic' | 'mock';

export interface JsonRequest {
  system: string;
  user: string;
  schema: unknown;
  maxTokens: number;
}

export interface LlmProvider {
  generateJson<T>(request: JsonRequest, parse: (raw: string) => T): Promise<{ data: T; usage: LlmUsage }>;
}
