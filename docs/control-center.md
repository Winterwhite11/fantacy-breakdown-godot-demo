# 旧线 Demo 总控中心

最后更新：2026-09-15  
Project ID：`fantacy-breakdown-oldline-demo`  
状态：**Active（旧线分路）** — 与 `dsaj4/game_design` 的 game-002《言咒》**并行、互不覆盖**

## 分路约定

| 分路 | 仓库 / 路径 | 谁推进 | 本仓库是否跟踪 |
| --- | --- | --- | --- |
| 主线内容 | `dsaj4/game_design` → `workspaces/game-002`《言咒》 | 项目组主体 | **否** |
| 旧线 Demo | 本仓库 `Winterwhite11/fantacy-breakdown-godot-demo` | 个人 Demo | **是** |

## 当前快照

### 已纳入本仓库的设计

| 事项 | 状态 | 入口 |
| --- | --- | --- |
| 核心构思（唯一核心卡 + 世界循环） | Accepted 快照 | `game-design-workflow/core-concept.md` |
| 卡牌设计表 v0.2（咏唱制） | 现行内容源 | `game-design-workflow/data/card-design-table-v0.2.md` |
| 字素合成战斗 GDD-BATTLE-002 | Evaluation（历史费用模型，待与咏唱表对齐） | `gdd/GDD-2026-08-22-...` |
| Godot 客户端 GDD-CLIENT-001 | Evaluation | `gdd/GDD-2026-08-24-...` |
| 怪物遭遇 GDD-ENEMY-001 | Evaluation | `gdd/GDD-2026-09-04-...` |
| 成语组合 GDD-BATTLE-001 | Parked（对照） | `gdd/GDD-2026-08-21-...` |
| 可运行灰盒 | 可玩 | `project.godot` |

### 取舍原则（本仓库）

**保留：** 支撑旧线 Demo 的核心构思、咏唱卡表、字素/客户端/怪物 GDD、协作模板、试玩文档。  
**不迁入：** 言咒 RC1、法杖时间轴、构句库存、完整 research/、media-lab、未筛选 inbox 洪水。

### 已知张力（整理思路用，不擅自改卡表）

1. **卡表 v0.2** 使用咏唱秒数（1s→5 伤…）；**GDD-BATTLE-002** 仍写共享能量/标价层 — Demo 实现以卡表 v0.2 为优先内容源，战斗 GDD 需后续单独对齐。  
2. 灰盒 `data/cards.json` 仍是早期子集；扩表时对照卡表 v0.2，勿从言咒卡池抄。  
3. `core-concept.md` 中「共享世界多人」对单人 Demo 可后置；Demo 优先验证：地图搜打撤 + 咏唱/合成战斗。

## 当前优先级（旧线 Demo）

1. 以卡表 v0.2 驱动下一版 Godot 卡数据与咏唱时间轴灰盒。  
2. 接入 GDD-ENEMY-001 中 1～2 档遭遇替换占位敌。  
3. 写一页「咏唱制 vs GDD-002 费用」差异清单（只记录，不改用户卡表原文）。  
4. 不把言咒规则合入本仓库。

## 目录地图

| 路径 | 用途 |
| --- | --- |
| `game-design-workflow/idea-inbox/` | 原始想法隔离 |
| `game-design-workflow/idea-materials/` | 合格素材 |
| `game-design-workflow/gdd/` | 设计合同 |
| `game-design-workflow/data/` | 卡表等数据文档 |
| `scripts/` `scenes/` | Godot 实现 |
| `docs/` | 使用说明与协作 |

## 分支建议

- 不在 `main` 上直接改核心设计文档；用 `agent/...` 或 `feature/...` 分支。  
- 详见 `docs/github-collaboration.md`。
