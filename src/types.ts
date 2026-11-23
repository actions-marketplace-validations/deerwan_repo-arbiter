export interface IssueContext {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  labels: string[];
  updatedAt: string;
  htmlUrl: string;
}

export interface RepoComment {
  id: number;
  body: string;
  author?: string;
}

export interface RuntimeOptions {
  dryRun: boolean;
  force: boolean;
  botLogin: string;
  configPath: string;
  policyPath: string;
  githubToken: string;
  llmApiKey?: string;
  llmProvider?: 'openai' | 'anthropic' | 'mock';
  llmModel?: string;
  llmBaseUrl?: string;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}
