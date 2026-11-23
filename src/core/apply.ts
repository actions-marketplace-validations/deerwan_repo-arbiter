import type { PlannedOperation } from './plan.js';

export interface WritePort {
  ensureLabel(name: string, description: string): Promise<void>;
  addLabels(labels: string[]): Promise<void>;
  upsertComment(marker: string, body: string): Promise<void>;
  deleteCommentsWithMarker(marker: string, botLogin?: string): Promise<void>;
}

export interface ApplyContext {
  summaryMarker: string;
  commentBody: string;
  labelDescriptions: Record<string, string>;
  failureMarker?: string;
  botLogin?: string;
}

export async function applyPlan(
  operations: PlannedOperation[],
  writer: WritePort,
  context: ApplyContext,
): Promise<string[]> {
  const applied: string[] = [];
  for (const operation of operations) {
    if (operation.kind === 'add_labels') {
      for (const label of operation.labels) {
        await writer.ensureLabel(label, context.labelDescriptions[label] ?? 'Classified by Repo Arbiter');
      }
      await writer.addLabels(operation.labels);
      applied.push(`add_labels:${operation.labels.join(',')}`);
      continue;
    }
    await writer.upsertComment(context.summaryMarker, context.commentBody);
    applied.push(`post_comment:${operation.commentTemplate}`);
  }

  if (context.failureMarker) {
    await writer.deleteCommentsWithMarker(context.failureMarker, context.botLogin);
  }
  return applied;
}

export class DryRunWriter implements WritePort {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  async ensureLabel(name: string, description: string): Promise<void> {
    this.calls.push({ method: 'ensureLabel', args: [name, description] });
  }

  async addLabels(labels: string[]): Promise<void> {
    this.calls.push({ method: 'addLabels', args: [labels] });
  }

  async upsertComment(marker: string, body: string): Promise<void> {
    this.calls.push({ method: 'upsertComment', args: [marker, body] });
  }

  async deleteCommentsWithMarker(marker: string, botLogin?: string): Promise<void> {
    this.calls.push({ method: 'deleteCommentsWithMarker', args: [marker, botLogin] });
  }
}
