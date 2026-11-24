# Repo Arbiter

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Repo%20Arbiter-blue?logo=github)](https://github.com/marketplace/actions/repo-arbiter)
[![CI](https://github.com/deerwan/repo-arbiter/actions/workflows/ci.yml/badge.svg)](https://github.com/deerwan/repo-arbiter/actions/workflows/ci.yml)

[English](./README.md) | 中文

Repo Arbiter 是一个策略驱动的 GitHub AI 分流工具。核心原则是：**模型只负责提案，确定性代码负责校验和执行，人类保留最终控制权**。

## v0.1 能力范围

- 监听 `issues.opened` 和 `issues.reopened`
- 自动判断问题分类与优先级
- 从 allowlist 中选择并添加 `arbiter/` 命名空间标签
- 每个 issue 只维护一条 sticky 评论，并通过隐藏 fingerprint marker 保证幂等
- 模型返回的 JSON 未通过 schema 校验时，会附带校验错误重试，仍失败才报错
- 支持 OpenAI-compatible、Anthropic 和 Mock 三种 provider
- 默认开启 `dry-run: true`
- 无数据库、无常驻服务、不会关闭 issue、改标题或合并代码

## 快速开始

在目标仓库添加 `.github/workflows/repo-arbiter.yml`：

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
      - uses: deerwan/repo-arbiter@v0.2.0
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

先保持 `dry-run: 'true'` 运行，确认计划结果后再切到 `dry-run: 'false'`。

非 mock provider 在 dry-run 模式下也必须提供 `ARBITER_LLM_API_KEY`。

## Runner 要求

Action 使用 Node 24 运行时（`using: node24`）。GitHub 托管 runner 已自带；Node 20 已于 2026-09-23 从 runner 中移除。自托管 runner 需要 v2.328.0 或更新版本；Node 24 不兼容 macOS 13.4 及以下版本，也不支持 ARM32。详见 [GitHub changelog](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners)。

## 自定义 Bot 身份

默认评论作者是 `github-actions[bot]`。如果想让它显示成自己的 GitHub App：

1. 创建 GitHub App
2. 授予 `Issues: Read and write`、`Contents: Read-only`、`Metadata: Read-only`
3. 安装到目标仓库
4. 把 App ID 和私钥保存为仓库 variable / secret
5. 把 installation token 和 App 登录名传给 Action

完整示例见 [`examples/workflows/arbiter-github-app.yml`](./examples/workflows/arbiter-github-app.yml)。

## 仓库配置

Repo Arbiter 从默认分支读取 `.github/arbiter.yml`。字段缺失时使用安全默认值；未知字段会直接失败。

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

maxRuns: 3
```

完整示例见 [`examples/arbiter.yml`](./examples/arbiter.yml)。

如果模型返回的 JSON 未通过校验，Repo Arbiter 会把校验错误附在 prompt 里让它重新输出。`maxRuns` 是模型尝试次数的上限（含首次调用）；超过 3 的值会被截断到 3，避免不稳定的模型产生无上限的费用。未通过校验的响应永远不会被应用。

## 环境变量

| 变量 | 说明 |
|---|---|
| `GITHUB_TOKEN` | 兜底 GitHub token |
| `ARBITER_LLM_API_KEY` | LLM provider key；非 mock provider 必需 |
| `ARBITER_LLM_PROVIDER` | `openai`、`anthropic` 或 `mock` |
| `ARBITER_LLM_MODEL` | 模型名 |
| `ARBITER_LLM_BASE_URL` | OpenAI-compatible endpoint |
| `ARBITER_ALLOW_MOCK_APPLY` | 明确允许 mock provider 执行写操作；不推荐 |

`ARBITER_LLM_API_KEY` 不能等于任何 GitHub token。

## Action 输入

| 输入 | 默认值 | 说明 |
|---|---|---|
| `github-token` | 空 | 为空时回退到 `GITHUB_TOKEN`；传 GitHub App token 可自定义 Bot 身份 |
| `bot-login` | `github-actions[bot]` | 只信任该登录名发布的 fingerprint 和 sticky marker |
| `force` | `false` | 忽略 fingerprint marker，强制重新分析 issue |
| `dry-run` | `true` | 只预览计划，不写 GitHub |
| `config-path` | `.github/arbiter.yml` | 仓库配置文件路径 |
| `policy-path` | 空 | 可选的可信策略文本文件 |
| `issue-number` | 空 | `workflow_dispatch` 手动运行时必需 |

## 输出

| 输出 | 说明 |
|---|---|
| `plan` | 计划操作的 JSON 数组 |
| `applied` | 实际执行操作的 JSON 数组 |
| `dry-run` | 本次是否为 dry-run |
| `summary` | 简短结果摘要 |
| `failure-class` | 结构化失败类型 |

## 安全说明

- issue 文本会被当作不可信数据，并用明确边界包裹
- LLM 输出必须通过严格 JSON schema 和运行时校验；未通过的响应会附带校验反馈重试，永远不会被应用
- 标签经过 allowlist 过滤；评论只渲染白名单字段
- fingerprint 只信任配置中的 `bot-login`
- 失败评论使用独立 marker 和固定模板
- 所有 GitHub 写操作集中在唯一 `WritePort`；dry-run 使用空实现

## 本地开发

```bash
npm install
npm run verify
```

`npm run verify` 会依次执行类型检查、测试、构建和产物检查。

## 后续规划

- 评论追问与人工确认
- PR 审查与检查摘要
- 持久化语义查重
- 组织级中央配置
- 离线评测集与 prompt 回归测试
