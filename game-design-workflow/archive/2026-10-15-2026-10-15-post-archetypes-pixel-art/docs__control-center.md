# 旧线 Demo 总控中心

最后更新：2026-09-18  
Project ID：`fantacy-breakdown-oldline-demo`  
状态：**Active（旧线分路）** — 与 `dsaj4/game_design` 的 game-002《言咒》**并行、互不覆盖**

## 分路约定

| 分路 | 仓库 / 路径 | 谁推进 | 本仓库是否跟踪 |
| --- | --- | --- | --- |
| 主线内容 | `dsaj4/game_design` → `workspaces/game-002`《言咒》 | 项目组主体 | **否** |
| 旧线 Demo | 本仓库 `Winterwhite11/fantacy-breakdown-godot-demo` | 个人 Demo | **是** |

## 权威规则（2026-09-18 裁定）

| 项目 | 裁定 |
| --- | --- |
| 卡效 / 战斗节奏 | **卡表咏唱制**（`card table.docx` / 卡表 v0.2 → `html-demo`） |
| 可玩验证床 | **`html-demo/`**（菜单→战备→地图→咏唱战斗） |
| Godot `scenes/` `scripts/` | **灰盒冻结扩玩法**；不新增玩法系统，仅维护/对齐迁移准备 |
| GDD-BATTLE-002 能量模型 | 历史对照，**不**驱动现行 Demo |

## 当前快照

### 已纳入本仓库的设计

| 事项 | 状态 | 入口 |
| --- | --- | --- |
| 核心构思（唯一核心卡 + 世界循环） | Accepted 快照 | `game-design-workflow/core-concept.md` |
| 卡牌设计表 v0.2（咏唱制） | **现行内容源** | `game-design-workflow/data/card-design-table-v0.2.md` |
| HTML 整体化 Demo | **现行可玩客户端** | `html-demo/` |
| 字素合成战斗 GDD-BATTLE-002 | Evaluation（历史费用模型，待与咏唱表对齐） | `gdd/GDD-2026-08-22-...` |
| Godot 客户端 GDD-CLIENT-001 | Evaluation | `gdd/GDD-2026-08-24-...` |
| 怪物遭遇 GDD-ENEMY-001 | Evaluation | `gdd/GDD-2026-09-04-...` |
| 成语组合 GDD-BATTLE-001 | Parked（对照） | `gdd/GDD-2026-08-21-...` |
| Godot 灰盒 | **暂停扩玩法** | `project.godot` |
| 资源库（音乐/UI/人物/怪物） | Active | `assets/`（见 `assets/README.md`） |

### 取舍原则（本仓库）

**保留：** 支撑旧线 Demo 的核心构思、咏唱卡表、字素/客户端/怪物 GDD、协作模板、试玩文档。  
**不迁入：** 言咒 RC1、法杖时间轴、构句库存、完整 research/、media-lab、未筛选 inbox 洪水。

### 已知张力（整理思路用，不擅自改卡表）

1. **卡表 v0.2** 使用咏唱秒数；**GDD-BATTLE-002** 仍写共享能量 — Demo **已裁定以卡表为准**。  
2. 灰盒 `data/cards.json` 仍是早期子集；**不再扩表进 Godot**，新内容进 HTML / 共享卡表管线。  
3. `core-concept.md` 中「共享世界多人」对单人 Demo 可后置；Demo 优先验证：地图搜打撤 + 咏唱/合成战斗。

## 当前优先级（旧线 Demo）

1. 在 **HTML** 上补齐卡表词条保真、跑局闭环（奖励/商店/撤离）。  
2. 遭遇与表现资源接入 HTML 战斗。  
3. Godot：仅文档/资源/对齐准备，**不扩玩法**。  
4. 不把言咒规则合入本仓库。

## 目录地图

| 路径 | 用途 |
| --- | --- |
| `html-demo/` | **现行可玩 Demo** |
| `game-design-workflow/idea-inbox/` | 原始想法隔离 |
| `game-design-workflow/idea-materials/` | 合格素材 |
| `game-design-workflow/gdd/` | 设计合同 |
| `game-design-workflow/data/` | 卡表等数据文档 |
| `scripts/` `scenes/` | Godot 灰盒（暂停扩玩法） |
| `docs/` | 使用说明与协作 |

## 分支建议

- 不在 `main` 上直接改核心设计文档；用 `agent/...` 或 `feature/...` 分支。  
- 详见 `docs/github-collaboration.md`。
