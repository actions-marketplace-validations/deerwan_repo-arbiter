import type { getOctokit } from '@actions/github';
import type { WritePort } from '../core/apply.js';
import { ArbiterFailureError, classifyHttpStatus, type ArbiterFailure } from '../failures.js';
import type { IssueContext, RepoComment } from '../types.js';

type Octokit = ReturnType<typeof getOctokit>;

export interface GithubReadPort {
  getIssue(issueNumber: number): Promise<IssueContext>;
  listComments(issueNumber: number): Promise<RepoComment[]>;
  listLabels(): Promise<string[]>;
  searchDuplicates(issueNumber: number, title: string): Promise<number[]>;
}

export class GithubAdapter implements GithubReadPort, WritePort {
  constructor(
    private readonly octokit: Octokit,
    private readonly owner: string,
    private readonly repo: string,
    private readonly issueNumber?: number,
    private readonly botLogin?: string,
  ) {}

  private requireIssueNumber(): number {
    if (!this.issueNumber) throw new Error('GithubAdapter write methods require an issue number');
    return this.issueNumber;
  }

  async getIssue(issueNumber: number): Promise<IssueContext> {
    const response = await this.octokit.rest.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
    const issue = response.data;
    return {
      owner: this.owner,
      repo: this.repo,
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      author: issue.user?.login ?? 'unknown',
      labels: issue.labels
        .map((label) => (typeof label === 'string' ? label : label.name ?? ''))
        .filter(Boolean),
      updatedAt: issue.updated_at,
      htmlUrl: issue.html_url,
    };
  }

  async listComments(issueNumber: number): Promise<RepoComment[]> {
    const response = await this.octokit.rest.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      per_page: 100,
    });
    return response.data.map((comment) => ({
      id: comment.id,
      body: comment.body ?? '',
      author: comment.user?.login,
    }));
  }

  async listLabels(): Promise<string[]> {
    const response = await this.octokit.rest.issues.listLabelsForRepo({
      owner: this.owner,
      repo: this.repo,
      per_page: 100,
    });
    return response.data.map((label) => label.name);
  }

  async searchDuplicates(issueNumber: number, title: string): Promise<number[]> {
    const query = `repo:${this.owner}/${this.repo} is:issue is:open "${title.replace(/"/g, '').slice(0, 100)}" in:title`;
    try {
      const response = await this.octokit.rest.search.issuesAndPullRequests({ q: query, per_page: 5 });
      return response.data.items
        .filter((item) => item.number !== issueNumber)
        .slice(0, 5)
        .map((item) => item.number);
    } catch {
      return [];
    }
  }

  async ensureLabel(name: string, description: string): Promise<void> {
    const existing = await this.listLabels();
    if (existing.includes(name)) return;
    await this.octokit.rest.issues.createLabel({
      owner: this.owner,
      repo: this.repo,
      name,
      description,
      color: 'ededed',
    });
  }

  async addLabels(labels: string[]): Promise<void> {
    await this.octokit.rest.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.requireIssueNumber(),
      labels,
    });
  }

  async upsertComment(marker: string, body: string): Promise<void> {
    const issueNumber = this.requireIssueNumber();
    const content = body.includes(marker) ? body : `${marker}\n${body}`;
    const comments = await this.listComments(issueNumber);
    const existing = comments.find(
      (comment) =>
        comment.body.includes(marker) && (!this.botLogin || comment.author === this.botLogin),
    );
    if (existing) {
      await this.octokit.rest.issues.updateComment({
        owner: this.owner,
        repo: this.repo,
        comment_id: existing.id,
        body: content,
      });
      return;
    }
    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: content,
    });
  }
}

export function toArbiterFailure(error: unknown): ArbiterFailure {
  if (error instanceof ArbiterFailureError) return error.failure;
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status: unknown }).status)
    : 0;
  if (status > 0) return classifyHttpStatus(status, 'github');
  return {
    class_name: 'internal-error',
    summary: error instanceof Error ? error.message : 'Unexpected error',
    fix_markdown: 'Check the workflow logs and rerun after fixing the underlying issue.',
  };
}
