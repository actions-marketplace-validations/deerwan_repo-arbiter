# Repo Arbiter

English | [中文](./README.zh-CN.md)

Policy-gated AI triage for GitHub repositories. The model proposes a decision; deterministic code validates and applies it.

## v0.1 scope

- Triggers on `issues.opened` and `issues.reopened`
- Classifies category and priority
- Applies namespaced labels from an allowlist
- Posts one sticky triage comment with a fingerprint marker
- Supports OpenAI-compatible and Anthropic providers
- Defaults to `dry-run: true`
- No database, no server, no destructive actions

## Usage

```yaml
- uses: your-org/repo-arbiter@v0.1.0
  with:
    dry-run: 'true'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    ARBITER_LLM_API_KEY: ${{ secrets.ARBITER_LLM_API_KEY }}
    ARBITER_LLM_PROVIDER: openai
    ARBITER_LLM_MODEL: gpt-4o-mini
```

Configuration lives at `.github/arbiter.yml` on the default branch. Missing fields fall back to safe defaults.

## Development

```bash
npm install
npm run verify
```
