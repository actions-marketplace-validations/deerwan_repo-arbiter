import * as core from '@actions/core';
import type { getOctokit } from '@actions/github';
import yaml from 'js-yaml';
import { ConfigError, ArbiterFailureError, classifyHttpStatus, makeFailure } from '../failures.js';
import { parseConfig } from '../config.js';
import type { RuntimeOptions } from '../types.js';

type Octokit = ReturnType<typeof getOctokit>;

function parseBoolean(raw: string, name: string): boolean {
  const value = raw.trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ConfigError(`${name} must be 'true' or 'false'`);
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function loadRuntimeOptions(): RuntimeOptions {
  const dryRun = parseBoolean(core.getInput('dry-run') || 'true', 'dry-run');
  const githubToken = optionalEnv('GITHUB_TOKEN') ?? '';
  if (!githubToken) throw new ConfigError('GITHUB_TOKEN is required');

  const llmApiKey = optionalEnv('ARBITER_LLM_API_KEY');
  if (llmApiKey === githubToken) {
    throw new ArbiterFailureError(
      makeFailure(
        'llm-key-is-github-token',
        'ARBITER_LLM_API_KEY must not equal GITHUB_TOKEN.',
        'Use a separate provider key so credentials are not sent to a third-party LLM host.',
      ),
    );
  }

  const providerRaw = optionalEnv('ARBITER_LLM_PROVIDER');
  if (providerRaw && !['openai', 'anthropic', 'mock'].includes(providerRaw)) {
    throw new ConfigError('ARBITER_LLM_PROVIDER must be openai, anthropic, or mock');
  }

  return {
    dryRun,
    configPath: core.getInput('config-path') || '.github/arbiter.yml',
    policyPath: core.getInput('policy-path') || '',
    githubToken,
    llmApiKey,
    llmProvider: providerRaw as RuntimeOptions['llmProvider'],
    llmModel: optionalEnv('ARBITER_LLM_MODEL'),
    llmBaseUrl: optionalEnv('ARBITER_LLM_BASE_URL'),
  };
}

export async function readRepositoryText(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const response = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    const data = response.data;
    if (Array.isArray(data) || !('content' in data) || typeof data.content !== 'string') return null;
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: unknown }).status) : 0;
    if (status === 404) return null;
    if (status > 0) throw new ArbiterFailureError(classifyHttpStatus(status, 'github'));
    throw error;
  }
}

export async function loadRepositoryConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
) {
  const raw = await readRepositoryText(octokit, owner, repo, path, ref);
  if (!raw) return parseConfig({});
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (error) {
    throw new ConfigError(`Configuration YAML is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseConfig(parsed ?? {});
}
