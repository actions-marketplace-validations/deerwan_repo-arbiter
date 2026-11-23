import { z } from 'zod';
import { ConfigError } from './failures.js';
import { CATEGORIES, OPERATION_KINDS, type Category, type OperationKind } from './core/schema.js';

const DEFAULT_PREFIX = 'arbiter';

const CATEGORY_LABELS: Record<Category, string[]> = {
  bug: [`${DEFAULT_PREFIX}/bug`],
  feature: [`${DEFAULT_PREFIX}/feature`],
  question: [`${DEFAULT_PREFIX}/question`],
  docs: [`${DEFAULT_PREFIX}/docs`],
  duplicate: [`${DEFAULT_PREFIX}/duplicate`],
  invalid: [`${DEFAULT_PREFIX}/invalid`],
  security: [`${DEFAULT_PREFIX}/security`],
};

const PRIORITY_LABELS = ['critical', 'high', 'medium', 'low'].map(
  (value) => `${DEFAULT_PREFIX}/priority-${value}`,
);

const DEFAULT_ALLOWLIST = [
  ...Object.values(CATEGORY_LABELS).flat(),
  ...PRIORITY_LABELS,
  `${DEFAULT_PREFIX}/needs-info`,
];

export interface ArbiterConfig {
  enabled: boolean;
  operations: { allowed: OperationKind[] };
  labels: { prefix: string; allowlist: string[]; mapping: Record<string, string[]> };
  llm: {
    provider: 'openai' | 'anthropic' | 'mock';
    model: string;
    maxTokens: number;
    baseUrl?: string;
  };
  security: { maxIssueLength: number };
  exclude: { labels: string[]; users: string[] };
  features: { duplicateSearch: boolean; missingInfoCheck: boolean };
  maxRuns: number;
  additionalInstructions?: string;
}

const configSchema = z
  .object({
    enabled: z.boolean().default(true),
    operations: z
      .object({
        allowed: z.array(z.enum(OPERATION_KINDS)).min(1).default([...OPERATION_KINDS]),
      })
      .strict()
      .default({}),
    labels: z
      .object({
        prefix: z
          .string()
          .regex(/^[a-z0-9][a-z0-9/_-]*$/)
          .default(DEFAULT_PREFIX),
        allowlist: z.array(z.string().min(1)).min(1).default(DEFAULT_ALLOWLIST),
        mapping: z
          .record(z.array(z.string().min(1)).max(3))
          .refine(
            (mapping) => Object.keys(mapping).every((key) => CATEGORIES.includes(key as Category)),
            'labels.mapping keys must be supported categories',
          )
          .default(CATEGORY_LABELS),
      })
      .strict()
      .default({}),
    llm: z
      .object({
        provider: z.enum(['openai', 'anthropic', 'mock']).default('openai'),
        model: z.string().min(1).default('gpt-4o-mini'),
        maxTokens: z.number().int().positive().max(8000).default(1200),
        baseUrl: z.string().url().optional(),
      })
      .strict()
      .default({}),
    security: z
      .object({
        maxIssueLength: z.number().int().positive().max(50000).default(12000),
      })
      .strict()
      .default({}),
    exclude: z
      .object({
        labels: z.array(z.string()).default([]),
        users: z.array(z.string()).default([]),
      })
      .strict()
      .default({}),
    features: z
      .object({
        duplicateSearch: z.boolean().default(true),
        missingInfoCheck: z.boolean().default(true),
      })
      .strict()
      .default({}),
    maxRuns: z.number().int().positive().max(100).default(20),
    additionalInstructions: z.string().max(2000).optional(),
  })
  .strict();

export const DEFAULT_CONFIG: ArbiterConfig = {
  enabled: true,
  operations: { allowed: [...OPERATION_KINDS] },
  labels: {
    prefix: DEFAULT_PREFIX,
    allowlist: [...DEFAULT_ALLOWLIST],
    mapping: structuredClone(CATEGORY_LABELS),
  },
  llm: { provider: 'openai', model: 'gpt-4o-mini', maxTokens: 1200 },
  security: { maxIssueLength: 12000 },
  exclude: { labels: [], users: [] },
  features: { duplicateSearch: true, missingInfoCheck: true },
  maxRuns: 20,
};

export function parseConfig(raw: unknown): ArbiterConfig {
  const result = configSchema.safeParse(raw ?? {});
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid arbiter configuration: ${detail}`);
  }
  return result.data as ArbiterConfig;
}
