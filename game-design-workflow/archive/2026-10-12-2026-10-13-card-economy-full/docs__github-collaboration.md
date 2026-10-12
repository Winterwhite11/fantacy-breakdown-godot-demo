# GitHub 协作规范

这份规范用于保护核心构思文档，降低不会使用 GitHub 的用户误操作风险。所有 human contributor 和 AI agent 都应遵守。

## 基本原则

- 不直接在 `main` 上修改内容。
- 每个 agent 或协作者都在自己的分支工作。
- 每次修改核心文档，必须在同一轮工作中提交并推送。
- 用户不需要会 GitHub；agent 应主动完成分支、提交、推送和状态汇报。
- 不使用 `git reset --hard`、强推或覆盖远端历史，除非维护者明确要求。

## 安装或首次进入后的分支规则

agent 第一次进入仓库后，必须先执行分支检查：

```bash
git status --short --branch
git branch --show-current
```

如果当前在 `main`、`master` 或空白默认分支，agent 必须自动创建并切换到自己的工作分支，然后再修改文件：

```bash
git checkout -b agent/<agent-name>/<YYYY-MM-DD>-<short-task>
```

示例：

```bash
git checkout -b agent/codex/2026-05-25-core-doc-rules
```

如果当前已经在 `agent/...`、`user/...`、`feature/...` 或其他非默认工作分支，可以继续使用当前分支。

## 分支命名

推荐格式：

| 场景 | 分支格式 |
| --- | --- |
| agent 自动整理 | `agent/<agent-name>/<YYYY-MM-DD>-<topic>` |
| 用户手动整理 | `user/<name>/<YYYY-MM-DD>-<topic>` |
| 功能性改动 | `feature/<YYYY-MM-DD>-<topic>` |
| 文档整理 | `docs/<YYYY-MM-DD>-<topic>` |

`topic` 使用英文小写、数字和连字符。

## 核心文档保护范围

以下文件属于核心文档或核心流程文档：

- `game-design-workflow/core-concept.md`
- `game-design-workflow/decision-log.md`
- `game-design-workflow/draft-changes/`
- `game-design-workflow/idea-proposals/`
- `game-design-workflow/evaluations/`
- `research/05-design-hypotheses/`
- `AGENTS.md`
- `README.md`
- `CONTRIBUTING.md`
- `docs/architecture-for-beginners.md`
- `docs/github-collaboration.md`

修改这些文件时必须格外明确来源、状态和下一步。

## 核心构思修改协议

修改 `game-design-workflow/core-concept.md` 必须按顺序执行：

1. 确认当前不在 `main` 或 `master`。
2. 在 `game-design-workflow/draft-changes/` 创建拟修改文件。
3. 写明来源提案、评估、拟新增/替换文本、采纳理由。
4. 获得用户明确采纳，或用户已经直接要求写入正式文档。
5. 修改 `game-design-workflow/core-concept.md`。
6. 同步更新 `game-design-workflow/decision-log.md`。
7. 立即提交并推送当前分支。

核心构思修改完成后，工作区不应留下未提交的核心文档变更。

## 提交与推送要求

只要修改了核心保护范围内的文件，agent 必须在完成前执行：

```bash
git status --short
git add <changed-files>
git commit -m "<clear commit message>"
git push -u origin <current-branch>
```

如果只是记录普通想法，也建议提交推送，但可以按任务批次合并提交。

提交信息应清楚描述结果，例如：

- `Add agent collaboration rules`
- `Record new combo timing idea`
- `Evaluate core card response window`
- `Update core concept with accepted combo slots`

## Agent 自动化责任

agent 不能把 GitHub 操作留给不会 GitHub 的用户。除非遇到认证、权限或网络问题，agent 应自动完成：

- 检查当前分支。
- 从默认分支创建自己的工作分支。
- 暂存相关文件。
- 提交修改。
- 推送到远端。
- 在最终回复中给出分支名、提交哈希和文件列表。

如果无法推送，agent 必须明确说明原因和当前本地提交状态。

## 禁止事项

- 不要在 `main` 或 `master` 上直接修改核心文档。
- 不要把未验证想法直接写进 `core-concept.md`。
- 不要只修改文件但不提交推送。
- 不要提交 `research/raw-sources/` 中的第三方资料快照。
- 不要使用强推覆盖远端分支。
- 不要替用户隐藏失败的提交或推送结果。

## 任务结束汇报模板

完成一次协作后，agent 应汇报：

```text
已完成并推送。

分支：agent/<agent-name>/<YYYY-MM-DD>-<topic>
提交：<short-hash> <commit-message>
核心状态：Idea / Proposal / Evaluation / Draft Change / Accepted
修改文件：
- <file>
- <file>
下一步：<one clear next action>
```

