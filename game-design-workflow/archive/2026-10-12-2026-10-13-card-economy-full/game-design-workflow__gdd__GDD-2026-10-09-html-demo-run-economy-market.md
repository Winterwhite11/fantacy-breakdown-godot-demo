# 《HTML Demo · 局循环经济 / 自由市场 / 调试台》GDD

## 0. 文档控制 `[必填]`

| 字段 | 内容 |
| --- | --- |
| 文档 ID | `GDD-META-001` |
| 当前版本 | `1.0.0` |
| 文档成熟度 | `GDD-1` |
| 设计状态 | `Evaluation`（HTML demo 已实装；待更多手测） |
| 负责人 | `系统 / UX（A）+ 内容数据（B）` |
| 创建日期 | `2026-10-09` |
| 最近更新 | `2026-10-09` |
| 目标里程碑 | `html-demo`：可验证搜打撤带出 + 仓库市场 + 策划调试台 |
| 关联正式素材 | [M-2026-10-09-html-demo-meta-economy-market](../idea-materials/M-2026-10-09-html-demo-meta-economy-market.md) |
| 关联时间线归档 | [docs/archive/2026-10-09-html-demo-optimization-archive.md](../../docs/archive/2026-10-09-html-demo-optimization-archive.md) |
| 关联协作板 | [docs/agent-coord.md](../../docs/agent-coord.md) |
| 关联战斗 / 遭遇 | [GDD-BATTLE-002](GDD-2026-08-22-glyph-synthesis-combat-system.md) · [GDD-ENEMY-001](GDD-2026-09-04-monster-encounter-table.md) |
| 实现工程 | `html-demo/`（权威验证床）；Godot 灰盒本轮 `Out of Scope` |

### 0.1 本版目标

把 2026-09-18～2026-10-09 期间 HTML Demo 的 **局外经济、带出、合成分层、自由市场、数据调试** 写成可对照实现的设计合同，并归档优化思路与协作流程。

### 0.2 本版范围

**包含：**

- `vault` / `runMeta.tokens` / `runMeta.staging` 规则  
- 撤离银行化、败北损失  
- 战斗合成分解 vs 地图永久合成  
- 自由市场分区、手续费、补货、价格历史柱  
- 数据调试台覆盖键与作用域  
- A/B 协作流程快照  

**不包含：**

- 撤离门槛 / 保险柜多档（本轮明确保持「角落随时可撤」）  
- 完整在线交易服务器、真实玩家撮合  
- 三角洲式全自动动态定价引擎  
- 写入 `core-concept.md`（未走 Accepted 核心变更）  
- Godot 客户端同步实装  

### 0.3 证据状态

| 结论 | 状态 | 依据 |
| --- | --- | --- |
| 进局代币 0 + 撤离入 vault | `Confirmed` | `save.js` `bankRunExtract`；`createRunMeta.tokens=0` |
| 战利品 staging 至撤离 | `Confirmed` | `runMeta.staging`；Hard 紫掉落名单 |
| 败北携带战备不退仓 | `Confirmed` | 出征检出 vault.loadout；败北不写回 |
| 战斗合成分解 | `Confirmed` | `combat.js` craftedFrom + discard |
| 自由市场 5% / 周一 +3 | `Confirmed` | `market.js`；手测可买卖 |
| 调试台覆盖套用 | `Confirmed` | `debug.html` + `debug-overrides.js` |
| 市场长期经济平衡 | `Hypothesis` | 待多局手测手续费与补货节奏 |
| 胜率字段自动统计 | `Out of Scope` | 调试台胜率为手填参考，非自动 telemetry |

### 0.4 变更摘要

| 版本 | 日期 | 变更 |
| --- | ---: | --- |
| 1.0.0 | 2026-10-09 | 首版：归档经济/市场/调试台合同 + 时间线引用 |

## 1. 产品与体验合同 `[必填]`

### 1.1 一句话概念

> 在咏唱制卡牌搜打撤 Demo 上，用「局内暂存 / 撤离入仓 / 败北损失」制造带出张力，并用自由市场与调试台支撑构筑迭代与数值调试。

### 1.2 设计支柱

| 支柱 | 规则支撑 | 反面信号 |
| --- | --- | --- |
| 带出有重量 | staging → extract；败北丢 | 打完直接进仓 |
| 财富分层可读 | 顶栏 vault vs 局内 tokens | 两套代币混为一谈 |
| 合成不污染永久构筑 | 战斗分解 / 地图永久合成 | 一场合成就改牌组 |
| 市场可解释 | 固定费率 + 周一补货 | 黑盒动态价难调 |
| 策划可改数 | 调试台输入端口 | 必须改源码才能调 |

### 1.3 核心循环（局级）

```text
整理战备（vault.loadout）
  → 选角色 / 新开一局（run tokens = 0）
  → 地图搜打撤（战斗掉落 → staging；事件/商店花 run 或 vault 代币按接线）
  → 撤离点「撤」→ bankRunExtract（tokens+staging → vault）
  → 或败北 → 清本局；携带战备不退仓
  → 自由市场用 vault 代币交易
  →（可选）调试台改数 → 刷新试玩验证
```

## 2. 系统规格 `[GDD-1]`

### 2.1 代币与物品三层

| 层 | 键 / 结构 | 生命周期 |
| --- | --- | --- |
| 永久仓 | `FBSave` vault：`tokens`、loadout、收集品等 | 跨局；顶栏展示 |
| 本局 | `runMeta.tokens` | 进局恒 **0**；撤离并入 vault |
| 暂存 | `runMeta.staging: { cards[], collectibles[] }` | 局中战利品；**仅撤离**入仓 |

Hard 固定紫掉落名「寒霜结晶」「炽火余烬」属 staging（`FBContent.HARD_STAGING_DROPS`）。

桃核类 `next_run`：**只**加下局 `runMeta.tokens`，**不进** vault。

### 2.2 合成分层

| 场所 | 产物去向 | 永久牌组 |
| --- | --- | --- |
| 战斗组合台 | 进手牌；弃置时按 `craftedFrom` **分解回材料** | 不改 |
| 地图「战备/行囊」永久合成台 | 写入携带/仓库牌组 | 改 |

### 2.3 撤离与败北

| 事件 | 代币 | staging | 出征 loadout |
| --- | --- | --- | --- |
| 撤离成功 | run → vault | → 永久仓 | 写回/结算按实现 |
| 败北 | 本局清 | 丢弃 | **不退仓**（永久损失风险） |

撤离点：地图随机四角「撤」格；**本轮无解锁门槛**（`Hypothesis`：日后可加门槛，另开变更）。

### 2.4 自由市场

| 项 | 规则 |
| --- | --- |
| 存储键 | `fb_html_demo_market_v1` |
| 分区 | 战备 / 卡牌 / 收集品（三角洲式 UI） |
| 定价 | 挂牌自定价 |
| 手续费 | 成交 **5%** |
| 系统补货 | 每周一 00:00 系统库存 **+3** |
| 价格图 | 日均价历史柱（`HISTORY_DAYS`≈14）；调试台可写「今日柱」 |
| 非目标 | 完整动态价引擎、跨设备同步 |

实现：`html-demo/js/market.js`。

### 2.5 数据调试台

| 项 | 规则 |
| --- | --- |
| 入口 | `html-demo/debug.html`；主菜单「数据调试台」 |
| 覆盖键 | `fb_html_demo_debug_v1` |
| 套用 | `debug-overrides.js` 在试玩页加载时 `applyAll` |
| 卡牌页 | 名称 / 咏唱 / play JSON / 描述 / 胜率%（手填） |
| 遭遇页 | 单位 HP、cycle JSON、档位、胜率% |
| 市场页 | 价格、库存、携带胜率%、价格波动图 |
| 原始页 | 整份 JSON 导入导出 |

胜率字段为**调试参考**，非自动对局统计（`Out of Scope`）。

### 2.6 内容数据钩子（B 线）

`html-demo/js/content-tables.js`：`CHARACTERS`、`ITEM_EFFECTS`、`FLAG_EFFECTS`、`COLLECTIBLE_EFFECTS`、`HARD_STAGING_DROPS` 等。  
角色 id：`pure` / `royalty` / `rock` / `hero`。  
抗性：仅敌方施加吃抗性；过热/过载自燃不吃抗性（已拍板）。

## 3. 协作流程快照 `[可选 · 归档]`

详见时间线归档。摘要：

1. **权威规则：** 卡表咏唱制；玩法迭代优先 `html-demo/`。  
2. **分线：** A=系统/UX；B=内容/数据；冲突文件先在 `agent-coord.md` 留言。  
3. **跨会话：** 不能直连；用户中继或写回 Status。  
4. **合并顺序偏好：** B 先落数据表 → A 接线 UI/存档 → 手测硬刷新「新开一局」。

## 4. 验收标准 `[GDD-1]`

### 4.1 规则验收

- [ ] 新开一局 `runMeta.tokens === 0`  
- [ ] 战斗掉落不出现「直接入永久仓」按钮路径  
- [ ] 撤离后 vault.tokens 增加；staging 清空并入仓  
- [ ] 败北后携带出征 loadout 不回到 vault  
- [ ] 战斗合成弃置见「分解」日志且材料回库  
- [ ] 市场买/卖扣 5% 手续费逻辑成立  
- [ ] 调试台改咏唱 → 刷新试玩后 CARD_DEFS 生效  

### 4.2 体验验收（手测）

- [ ] 玩家能口头解释「局内钱」和「仓库钱」区别  
- [ ] Hard「冰与火」紫掉落有带出动机  
- [ ] 调试台改怪物 HP 后遭遇手感变化可读  

## 5. 风险与未知 `[必填]`

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 旧存档兼容 | `Hypothesis` | 旧档可能仍含起始代币；文档要求硬刷新新开一局 |
| 市场通胀 | `Unknown` | 补货 +3 与手续费长期平衡未测 |
| 调试覆盖与源码双真源 | `Hypothesis` | Demo 可接受；正式版应导出回数据表 |
| 撤离门槛 | `Out of Scope` | 本轮刻意不动 |

## 6. 实现索引

| 模块 | 路径 |
| --- | --- |
| 流程 / UI | `html-demo/js/app.js` · `index.html` |
| 存档 / vault | `html-demo/js/save.js` |
| 战斗分解 | `html-demo/js/combat.js` |
| 市场 | `html-demo/js/market.js` |
| 内容表 | `html-demo/js/content-tables.js` |
| 调试台 | `html-demo/debug.html` · `js/debug-lab.js` · `js/debug-overrides.js` |
| 试玩说明 | `html-demo/README.md` |
