import { z } from 'zod';

export const CATEGORIES = ['bug', 'feature', 'question', 'docs', 'duplicate', 'invalid', 'security'] as const;
export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export const OPERATION_KINDS = ['add_labels', 'post_comment'] as const;
export const COMMENT_TEMPLATES = ['triage-summary', 'needs-info', 'duplicate'] as const;

const duplicateCandidateSchema = z
  .object({
    number: z.number().int().positive(),
    reason: z.string().min(1).max(200),
  })
  .strict();

const operationSchema = z
  .object({
    kind: z.enum(OPERATION_KINDS),
    authorization: z.string().regex(/^POLICY-[A-Z0-9-]+$/),
    commentTemplate: z.enum(COMMENT_TEMPLATES).optional(),
  })
  .strict();

export const analysisSchema = z
  .object({
    category: z.enum(CATEGORIES),
    priority: z.enum(PRIORITIES),
    confidence: z.number().min(0).max(1),
    labels: z.array(z.string().min(1).max(60)).max(3).default([]),
    missingInfo: z.array(z.string().min(1).max(160)).max(5).default([]),
    duplicateCandidates: z.array(duplicateCandidateSchema).max(5).default([]),
    operations: z.array(operationSchema).min(1).max(6),
  })
  .strict();

export const analysisJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'priority', 'confidence', 'operations'],
  properties: {
    category: { type: 'string', enum: [...CATEGORIES] },
    priority: { type: 'string', enum: [...PRIORITIES] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    labels: { type: 'array', maxItems: 3, items: { type: 'string', minLength: 1, maxLength: 60 } },
    missingInfo: { type: 'array', maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 160 } },
    duplicateCandidates: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'reason'],
        properties: {
          number: { type: 'integer', minimum: 1 },
          reason: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
    },
    operations: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'authorization'],
        properties: {
          kind: { type: 'string', enum: [...OPERATION_KINDS] },
          authorization: { type: 'string', pattern: '^POLICY-[A-Z0-9-]+$' },
          commentTemplate: { type: 'string', enum: [...COMMENT_TEMPLATES] },
        },
      },
    },
  },
} as const;

export type Analysis = z.infer<typeof analysisSchema>;
export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type OperationKind = (typeof OPERATION_KINDS)[number];
export type CommentTemplate = (typeof COMMENT_TEMPLATES)[number];
