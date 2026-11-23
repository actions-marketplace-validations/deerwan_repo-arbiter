# Repo Arbiter

[English](./README.md) | 中文

Repo Arbiter 是一个策略驱动的 GitHub AI 分流工具。核心原则是：**模型只负责提案，确定性代码负责校验和执行，人类保留最终控制权**。

## v0.1 能力范围

- 监听 `issues.opened` 和 `issues.reopened`
- 自动判断问题分类与优先级
- 从 allowlist 中选择并添加 `arbiter/` 命名空间标签
- 每个 issue 只维护一条 sticky 评论，并通过隐藏 fingerprint marker 保证幂等
- 支持 OpenAI-compatible、Anthropic 和 Mock 三种 provider
- 默认开启 `dry-run: true`，不写 GitHub
- 无数据库、无常驻服务、不会关闭 issue、改标题或合并代码

## 快速开始

在目标仓库添加 `.github/workflows/arbiter.yml`：

```yaml
name: Repo Arbiter

on:
  issues:
    types: [opened, reopened]
  workflow_dispatch:

permissions:
  contents: read
  issues: write

concurrency:
  group: repo-arbiter
  queue: max

jobs:
  triage:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: your-org/repo-arbiter@v0.1.0
        with:
          dry-run: 'true'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ARBITER_LLM_API_KEY: ${{ secrets.ARBITER_LLM_API_KEY }}
          ARBITER_LLM_PROVIDER: openai
          ARBITER_LLM_MODEL: gpt-4o-mini
```

确认 dry-run 结果符合预期后，再把 `dry-run` 改为 `'false'`。非 dry-run 模式必须提供 `ARBITER_LLM_API_KEY`。

## 仓库配置

默认从目标仓库默认分支读取 `.github/arbiter.yml`。文件不存在或字段缺失时会回退到安全默认值。

最小示例：

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
```

完整示例见 [`examples/arbiter.yml`](./examples/arbiter.yml)。

## 环境变量

| 变量 | 说明 |
|---|---|
| `GITHUB_TOKEN` | 必需。GitHub Actions 自动注入 |
| `ARBITER_LLM_API_KEY` | LLM provider key；非 dry-run 必需 |
| `ARBITER_LLM_PROVIDER` | `openai`、`anthropic` 或 `mock` |
| `ARBITER_LLM_MODEL` | 模型名，覆盖配置文件中的值 |
| `ARBITER_LLM_BASE_URL` | OpenAI-compatible 自定义 endpoint |
| `ARBITER_ALLOW_MOCK_APPLY` | 仅在明确允许时可用 mock provider 执行写操作 |

> `ARBITER_LLM_API_KEY` 不能等于 `GITHUB_TOKEN`，避免把 GitHub 凭据发给第三方 LLM 服务。

## Action 输入

| 输入 | 默认值 | 说明 |
|---|---|---|
| `dry-run` | `true` | 只预览计划，不写 GitHub |
| `config-path` | `.github/arbiter.yml` | 仓库配置文件路径 |
| `policy-path` | 空 | 可选的策略文本文件路径 |
| `issue-number` | 空 | `workflow_dispatch` 手动运行时指定 issue |

## 输出

| 输出 | 说明 |
|---|---|
| `plan` | 计划操作的 JSON 数组 |
| `applied` | 实际执行操作的 JSON 数组 |
| `dry-run` | 本次是否为 dry-run |
| `summary` | 简短结果摘要 |
| `failure-class` | 结构化失败类型 |

## 安全设计

- issue 标题、正文、作者和标签都会包在不可信边界中传给模型
- LLM 输出必须通过 strict schema 和 Zod 运行时校验
- 未知标签、无授权操作、非法 state 会在计划阶段被丢弃
- 所有 GitHub 写操作集中在唯一 `WritePort`，dry-run 使用空实现
- 评论只渲染白名单字段，不回显模型自由文本或推理过程
- 重复候选编号会与 GitHub 搜索结果交叉校验后才能展示

## 本地开发

```bash
npm install
npm run verify
```

`npm run verify` 会依次执行类型检查、测试、构建和产物检查。

## 后续规划

- PR 审查
- 评论追问与人工确认流程
- 语义查重持久化
- 组织级中央配置
- GitHub Marketplace 上架
