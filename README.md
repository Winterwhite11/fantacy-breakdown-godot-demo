# Fantacy Breakdown — 旧线 Demo + 设计工作区

> **分路说明（重要）**  
> 本仓库是**旧项目线**（唯一核心卡 / 字素合成 / 咏唱制卡牌 + Godot 灰盒 Demo）的独立工作区。  
> 团队主线《言咒》（game-002）在上游 `dsaj4/game_design` 的 `workspaces/game-002/`，**不在此推进**。  
> 两边分路开发：主线做内容；本仓库做旧线 Demo 与配套 GDD。

仓库：https://github.com/Winterwhite11/fantacy-breakdown-godot-demo

## 本仓库包含什么

| 部分 | 路径 | 说明 |
| --- | --- | --- |
| Godot 4 灰盒客户端 | `scenes/` `scripts/` `data/cards.json` | 地图 + 战斗 UI + 双轨合成（可运行） |
| 设计工作流（仿 dsaj4） | `game-design-workflow/` | 核心构思、GDD、卡表、素材 |
| 试玩 / 架构说明 | `docs/USAGE.md` `docs/ARCHITECTURE.md` | 客户端操作与代码结构 |
| 协作规范 | `docs/github-collaboration.md` | 分支 / 不直接改 main |

## 明确不包含

- 《言咒》构句 / 法杖时间轴 / RC1 Wiki  
- 上游已归档旧项目的完整研究库、media-lab、combat-lab 全量拷贝  
- 成语组合战斗实现线（仅保留 Parked 对照 GDD）

## 快速开始（客户端）

1. 安装 [Godot 4.2+](https://godotengine.org/)  
2. Open 本目录 `project.godot` → **F5**  
3. 详见 [docs/USAGE.md](docs/USAGE.md)

## 设计从哪读起

1. [docs/control-center.md](docs/control-center.md) — 总控与优先级  
2. [game-design-workflow/data/card-design-table-v0.2.md](game-design-workflow/data/card-design-table-v0.2.md) — **现行卡牌内容表（咏唱制原文）**  
3. [game-design-workflow/gdd/README.md](game-design-workflow/gdd/README.md) — GDD 索引  
4. [game-design-workflow/core-concept.md](game-design-workflow/core-concept.md) — 旧线正式核心构思（Accepted 快照）

## 与上游的关系

| 仓库 | 角色 |
| --- | --- |
| `dsaj4/game_design` | 团队构思库；当前默认推进 game-002《言咒》 |
| **本仓库** | 个人 / 旧线 Demo + 精选旧线 GDD，与言咒分路 |

旧线历史全量仍可在上游 `archive/2026-09-05-core-card-project/` 查阅；本仓库只保留 **Demo 推进所需** 的文档子集。
