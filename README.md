# Repo Arbiter

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Repo%20Arbiter-blue?logo=github)](https://github.com/marketplace/actions/repo-arbiter)
[![CI](https://github.com/deerwan/repo-arbiter/actions/workflows/ci.yml/badge.svg)](https://github.com/deerwan/repo-arbiter/actions/workflows/ci.yml)

English | [中文](./README.zh-CN.md)

Policy-gated AI triage for GitHub repositories. The model proposes a decision; deterministic code validates and applies it.

## v0.1 scope

- Triggers on `issues.opened` and `issues.reopened`
- Classifies category and priority
- Applies namespaced labels from an allowlist
- Posts one sticky triage comment with a hidden fingerprint marker
- Supports OpenAI-compatible, Anthropic, and Mock providers
- Uses `dry-run: true` by default
- No database, no server, no destructive actions

## Quick start

Add `.github/workflows/repo-arbiter.yml` to the target repository:

```yaml
name: Repo Arbiter

on:
  issues:
    types: [opened, reopened]
  workflow_dispatch:
    inputs:
      issue-number:
        description: Issue number to analyze
        required: true
        type: string

permissions:
  contents: read
  issues: write

concurrency:
  group: repo-arbiter-${{ github.event.issue.number || inputs.issue-number }}
  queue: max

jobs:
  triage:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: deerwan/repo-arbiter@v0.1.4
        with:
          dry-run: 'true'
          issue-number: ${{ inputs.issue-number }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ARBITER_LLM_API_KEY: ${{ secrets.ARBITER_LLM_API_KEY }}
          ARBITER_LLM_BASE_URL: ${{ secrets.ARBITER_LLM_BASE_URL }}
          ARBITER_LLM_MODEL: ${{ secrets.ARBITER_LLM_MODEL }}
          ARBITER_LLM_PROVIDER: openai
```

Run with `dry-run: 'true'` first. After reviewing the planned operations, switch to `dry-run: 'false'`.

A non-mock provider always requires `ARBITER_LLM_API_KEY`, including in dry-run mode.

## Custom bot identity

By default, comments are posted as `github-actions[bot]`. To post as your own GitHub App:

1. Create a GitHub App.
2. Grant `Issues: Read and write`, `Contents: Read-only`, and `Metadata: Read-only`.
3. Install it on the target repositories.
4. Store the App ID and private key as repository variables/secrets.
5. Pass an installation token and the App login to the action.

See [`examples/workflows/arbiter-github-app.yml`](./examples/workflows/arbiter-github-app.yml).

## Repository configuration

Repo Arbiter reads `.github/arbiter.yml` from the default branch. Missing fields fall back to safe defaults; unknown fields fail fast.

```yaml
enabled: true

operations:
  allowed:
    - add_labels
    - post_comment

labels:
  prefix: arbiter
  mapping:
    bug: [arbiter/bug]
    feature: [arbiter/feature]
    question: [arbiter/question]
    docs: [arbiter/docs]
    duplicate: [arbiter/duplicate]
    invalid: [arbiter/invalid]
    security: [arbiter/security]

llm:
  provider: openai
  model: gpt-4o-mini
  maxTokens: 1200

security:
  maxIssueLength: 12000

exclude:
  labels: []
  users: []

features:
  duplicateSearch: true
  missingInfoCheck: true

maxRuns: 20
```

The full example is in [`examples/arbiter.yml`](./examples/arbiter.yml).

## Environment variables

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | Fallback GitHub token |
| `ARBITER_LLM_API_KEY` | LLM provider key; required for non-mock providers |
| `ARBITER_LLM_PROVIDER` | `openai`, `anthropic`, or `mock` |
| `ARBITER_LLM_MODEL` | Model name |
| `ARBITER_LLM_BASE_URL` | OpenAI-compatible endpoint |
| `ARBITER_ALLOW_MOCK_APPLY` | Explicitly allow mock provider in apply mode; not recommended |

`ARBITER_LLM_API_KEY` must not equal any GitHub token.

## Action inputs

| Input | Default | Description |
|---|---|---|
| `github-token` | empty | Falls back to `GITHUB_TOKEN`; use a GitHub App token for a custom bot identity |
| `bot-login` | `github-actions[bot]` | Login name trusted for fingerprint and sticky comment markers |
| `force` | `false` | Ignore the fingerprint marker and re-analyze the issue |
| `dry-run` | `true` | Preview only; do not write to GitHub |
| `config-path` | `.github/arbiter.yml` | Repository config path |
| `policy-path` | empty | Optional trusted policy text file |
| `issue-number` | empty | Required for `workflow_dispatch` runs |

## Outputs

| Output | Description |
|---|---|
| `plan` | JSON array of planned operations |
| `applied` | JSON array of operations actually applied |
| `dry-run` | Whether this run was a dry run |
| `summary` | Short result summary |
| `failure-class` | Structured failure class |

## Security notes

- Issue text is treated as untrusted data and wrapped in explicit boundaries.
- LLM output must pass strict JSON schema and runtime validation.
- Labels are filtered by allowlist; comment content is rendered from whitelisted fields only.
- Fingerprints are trusted only from the configured `bot-login`.
- Failure comments use a separate marker and a fixed template.
- All GitHub writes go through a single `WritePort`; dry-run uses a no-op writer.

## Development

```bash
npm install
npm run verify
```

`npm run verify` runs typecheck, tests, build, and dist checks.

## Roadmap

- Follow-up comment handling
- PR review and check summaries
- Persistent semantic duplicate detection
- Organization-level central configuration
- Offline evaluation set and prompt regression tests
