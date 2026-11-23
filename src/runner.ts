import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { applyPlan, DryRunWriter } from './core/apply.js';
import { computeFingerprint, fingerprintMarker, hasFingerprintFrom } from './core/idempotency.js';
import { parseAnalysis } from './core/parse.js';
import { explainPlan, preparePlan, renderComment, type PlannedOperation } from './core/plan.js';
import { buildSystemPrompt, buildUserPrompt } from './core/prompt.js';
import { analysisJsonSchema, type Analysis } from './core/schema.js';
import { writeArtifact } from './adapters/artifacts.js';
import { createLlmProvider } from './adapters/llm/client.js';
import { GithubAdapter, toArbiterFailure } from './adapters/github.js';
import { loadRepositoryConfig, loadRuntimeOptions, readRepositoryText } from './config/loader.js';
import type { ArbiterConfig } from './config.js';
import { ConfigError } from './failures.js';

export const SUMMARY_MARKER = '<!-- repo-arbiter:summary:v1 -->';
export const FAILURE_MARKER = '<!-- repo-arbiter:failure:v1 -->';

interface ArbiterPayload {
  action?: string;
  issue?: { number?: number; updated_at?: string };
  repository?: { default_branch?: string };
  sender?: { type?: string; login?: string };
}

function resolveIssueNumber(payload: ArbiterPayload): number {
  const fromPayload = payload.issue?.number;
  if (fromPayload) return fromPayload;
  const raw = core.getInput('issue-number');
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError('An issue number is required for workflow_dispatch runs');
  }
  return parsed;
}

function ensureCommentOperation(operations: PlannedOperation[], config: ArbiterConfig): PlannedOperation[] {
  if (!config.operations.allowed.includes('post_comment')) return operations;
  if (operations.some((op) => op.kind === 'post_comment')) return operations;
  return [
    ...operations,
    { kind: 'post_comment', commentTemplate: 'triage-summary', authorization: 'POLICY-COMMENT' },
  ];
}

async function postFailureComment(
  owner: string,
  repo: string,
  issueNumber: number,
  githubToken: string,
  botLogin: string,
  failureClass: string,
): Promise<void> {
  const body = [
    FAILURE_MARKER,
    '### Arbiter failure',
    `Failure class: \`${failureClass}\``,
    '',
    'Repo Arbiter could not complete this run. Check the workflow logs and the `failure-class` output.',
  ].join('\n');
  try {
    const writer = new GithubAdapter(getOctokit(githubToken), owner, repo, issueNumber, botLogin);
    await writer.upsertComment(FAILURE_MARKER, body);
  } catch (error) {
    core.warning(`Could not post failure comment: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function run(): Promise<void> {
  let githubToken = '';
  let owner = '';
  let repo = '';
  let issueNumber = 0;
  let dryRun = true;
  let botLogin = 'github-actions[bot]';

  try {
    const options = loadRuntimeOptions();
    githubToken = options.githubToken;
    dryRun = options.dryRun;
    botLogin = options.botLogin;

    const payload = context.payload as ArbiterPayload;
    const repoInfo = context.repo;
    owner = repoInfo.owner;
    repo = repoInfo.repo;
    issueNumber = resolveIssueNumber(payload);
    const ref = payload.repository?.default_branch ?? 'main';

    const octokit = getOctokit(githubToken);
    const reader = new GithubAdapter(octokit, owner, repo, undefined, botLogin);

    const config = await loadRepositoryConfig(octokit, owner, repo, options.configPath, ref);
    if (!config.enabled) {
      core.info('Repo Arbiter is disabled by repository configuration.');
      return;
    }

    const policyText = options.policyPath
      ? await readRepositoryText(octokit, owner, repo, options.policyPath, ref)
      : undefined;

    const issue = await reader.getIssue(issueNumber);
    if (config.exclude.users.includes(issue.author)) {
      core.info(`Skipping issue #${issueNumber}: author is excluded.`);
      return;
    }
    if (issue.labels.some((label) => config.exclude.labels.includes(label))) {
      core.info(`Skipping issue #${issueNumber}: exclude label present.`);
      return;
    }

    const fingerprint = computeFingerprint({
      event: context.eventName,
      action: payload.action ?? '',
      repo: `${owner}/${repo}`,
      entity: String(issueNumber),
      agent: 'triage',
      updatedAt: context.eventName === 'issues' ? payload.issue?.updated_at : undefined,
    });

    if (!options.force) {
      const comments = await reader.listComments(issueNumber);
      if (hasFingerprintFrom(comments, fingerprint, botLogin)) {
        core.info(`Issue #${issueNumber} already processed for this fingerprint.`);
        return;
      }
    } else {
      core.info('force=true: skipping fingerprint check.');
    }

    const repoLabels = await reader.listLabels();
    const duplicateNumbers = config.features.duplicateSearch
      ? await reader.searchDuplicates(issueNumber, issue.title)
      : [];

    const providerName = options.llmProvider ?? config.llm.provider;
    if (!options.llmApiKey && providerName !== 'mock') {
      throw new ConfigError('ARBITER_LLM_API_KEY is required for non-mock providers');
    }
    if (!dryRun && providerName === 'mock' && process.env.ARBITER_ALLOW_MOCK_APPLY !== 'true') {
      throw new ConfigError('mock provider cannot be used with dry-run=false');
    }

    const provider = createLlmProvider({
      provider: providerName,
      apiKey: options.llmApiKey,
      model: options.llmModel ?? config.llm.model,
      baseUrl: options.llmBaseUrl ?? config.llm.baseUrl,
      githubToken,
    });

    const system = buildSystemPrompt(config, repoLabels, policyText ?? undefined);
    const user = buildUserPrompt({
      title: issue.title,
      body: issue.body,
      author: issue.author,
      labels: issue.labels,
      duplicateNumbers,
      maxIssueLength: config.security.maxIssueLength,
    });

    const { data: analysis, usage } = await provider.generateJson<Analysis>(
      { system, user, schema: analysisJsonSchema, maxTokens: config.llm.maxTokens },
      parseAnalysis,
    );

    const verifiedAnalysis: Analysis = {
      ...analysis,
      duplicateCandidates: analysis.duplicateCandidates.filter((candidate) =>
        duplicateNumbers.includes(candidate.number),
      ),
    };

    const operations = ensureCommentOperation(preparePlan(verifiedAnalysis, config, issue.labels), config);
    const commentBody = [
      SUMMARY_MARKER,
      fingerprintMarker(fingerprint),
      '',
      renderComment(verifiedAnalysis, config),
    ].join('\n');

    await writeArtifact('analysis.json', verifiedAnalysis);
    await writeArtifact('operations.json', operations);
    await writeArtifact('prompt-system.md', system);
    await writeArtifact('prompt-user.md', user);

    core.setOutput('plan', JSON.stringify(operations));
    core.setOutput('dry-run', String(dryRun));
    core.info(`Planned operations:\n${explainPlan(operations)}`);
    core.info(`LLM usage: input=${usage.inputTokens} output=${usage.outputTokens}`);

    const writer = dryRun
      ? new DryRunWriter()
      : new GithubAdapter(octokit, owner, repo, issueNumber, botLogin);
    const labelDescriptions = Object.fromEntries(
      config.labels.allowlist.map((label) => [label, `Classified by Repo Arbiter (${config.labels.prefix})`]),
    );
    const applied = await applyPlan(operations, writer, {
      summaryMarker: SUMMARY_MARKER,
      commentBody,
      labelDescriptions,
      failureMarker: FAILURE_MARKER,
      botLogin,
    });

    core.setOutput('applied', JSON.stringify(applied));
    core.setOutput('summary', `Issue #${issueNumber}: ${operations.length} operation(s) planned.`);
    core.info(`Repo Arbiter completed for issue #${issueNumber}. Dry run: ${dryRun}`);
  } catch (error) {
    const failure = toArbiterFailure(error);
    core.setOutput('failure-class', failure.class_name);
    core.setOutput('summary', failure.summary);
    if (!dryRun && owner && repo && issueNumber > 0 && githubToken) {
      await postFailureComment(owner, repo, issueNumber, githubToken, botLogin, failure.class_name);
    }
    core.setFailed(failure.summary);
  }
}
