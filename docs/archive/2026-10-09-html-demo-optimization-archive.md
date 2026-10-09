# 归档 · HTML Demo 优化思路 / 流程 / 时间线（至 2026-10-09）

> **用途：** 留档本轮（约 2026-09-18 → 2026-10-09）优化思路、协作流程与节点时间，便于后续查阅。  
> **正式设计合同：** [GDD-META-001](../../game-design-workflow/gdd/GDD-2026-10-09-html-demo-run-economy-market.md)  
> **正式素材：** [M-2026-10-09](../../game-design-workflow/idea-materials/M-2026-10-09-html-demo-meta-economy-market.md)  
> **协作板原文：** [agent-coord.md](../agent-coord.md)  
> **代码落地仓库：** https://github.com/Winterwhite11/fantacy-breakdown-godot-demo  

---

## 1. 优化思路（浓缩）

### 1.1 产品层

| 问题 | 思路 | 落地选择 |
| --- | --- | --- |
| 局内通胀 / 撤离无感 | 财富分层 | 进局 tokens=0；staging；撤离银行化 vault |
| 精英奖励像白嫖 | Hard 紫掉落有重量 | 寒霜结晶 / 炽火余烬进 staging，撤离才入仓 |
| 合成永久污染牌组 | 合成分层 | 战斗：弃置分解；地图：永久合成台 |
| 败北无风险 | 携带损失 | 出征检出 loadout；败北不退仓 |
| 数值难调 | 策划调试入口 | `debug.html` 输入端口 + localStorage 覆盖 |
| 仓库闲置代币 | 局外循环 | 自由市场（分区买/挂牌） |

### 1.2 工程层

- **权威验证床：** `html-demo/`（卡表咏唱制）；Godot 灰盒暂停扩玩法。  
- **存档键：** 本局 `fb_html_demo_run_v1`；市场 `fb_html_demo_market_v1`；调试 `fb_html_demo_debug_v1`。  
- **市场简化：** 不做完整动态价；**5% 手续费 + 周一系统库存 +3** + 价格历史柱。  
- **跨 Agent：** `docs/agent-coord.md` 为唯一协商板（会话不能直连）。

### 1.3 明确不做（本轮边界）

- 撤离解锁门槛（保持角落随时可撤）  
- 在线撮合 / 跨设备同步  
- 胜率自动 telemetry（调试台胜率手填）  
- 把本轮规则写入 `core-concept.md`（仍处 Evaluation，未 Accepted）

---

## 2. 协作流程（怎么做的）

```text
用户需求
  → A（系统/UX）与 B（内容/数据）在 agent-coord 拍板分工
  → B：content-tables / 遭遇名 / 收集品效果 / schema 注释
  → A：app.js / save.js / combat.js / map UI / market / debug
  → 冲突文件先留言，避免双改同一函数
  → 手测：硬刷新 →「新开一局」（旧档可能脏）
  → 文档：html-demo/README + GDD-META-001 + 本归档
  → git push → 公开仓库欢迎 PR
```

| 角色 | 职责 | 主要文件 |
| --- | --- | --- |
| A · 系统/UX | 流程、存档、UI、战斗分解、市场、调试台 | `app.js` `save.js` `combat.js` `market.js` `debug*` |
| B · 内容/数据 | 角色/道具/flag/收集品表、ENC 对齐 | `content-tables.js` `encounters.js`（限内容） |
| 用户 | 需求拍板、跨会话中继、手测反馈 | — |

分支规范仍见 [github-collaboration.md](../github-collaboration.md)；本轮紧急落地曾直推 `main`（公开协作后应优先 PR）。

---

## 3. 时间线

日期以协作板与提交记录为准；同日多项为并行。

| 日期 | 节点 | 说明 |
| --- | ---: | --- |
| 2026-09-09 | 卡表 v0.2 冻结 | 咏唱制原文为 Demo 卡源（决策记录） |
| 2026-09-15 | 旧线分路 | 设计文档迁入本仓库；与言咒分路 |
| 2026-09-18 | HTML 权威床拍板 | 玩法迭代优先 `html-demo/`；Godot 不扩玩法 |
| ≈2026-09-18～21 | 可玩闭环 | 菜单→战备→地图→咏唱战斗；Hard「冰与火」；角落撤离；存档 |
| 2026-09-22 | A/B 分工启动 | 角色选择、事件/收集品、ENC-07～09、抗性链路 |
| 2026-09-22 | 经济改拍 | **覆盖**「起始 20」→ 进局 0；staging；撤离 vault；败北不退仓 |
| 2026-09-22 | A 认领经济 #1–#4 | vault / 地图永久合成 / 战斗分解 / staging 撤离 |
| 2026-09-22 | B 数据对齐 | startTokens=0；HARD_STAGING_DROPS；紫金收集品效果等 |
| 2026-09-22 | 抗性拍板 | 仅敌方施加吃抗性；自燃不吃抗性 |
| 2026-10-09 | 自由市场 | 分区 UI；挂牌；5% 费；周一 +3；价格柱 |
| 2026-10-09 | 数据调试台 | 卡牌/遭遇/市场可输入改数；试玩页自动套用 |
| 2026-10-09 | 开源公开 | push `main`；仓库 Public；Issues/Discussions/Wiki |
| 2026-10-09 | **本归档 + GDD-META-001** | 思路 / 流程 / 时间 / 合同留档 |

### 关键提交（git）

| SHA | 摘要 |
| --- | --- |
| `a728f4b` 等 | HTML demo 初版可玩 |
| `797238a` | 事件、Hard 冰火、撤离、存档 |
| `e5e5629` | 经济 + 自由市场 + 调试台 |
| `24a7e12` | 公开协作说明 |

---

## 4. GDD / 文档索引（本轮相关）

| 类型 | 文档 |
| --- | --- |
| 本轮合同 | [GDD-META-001 局循环经济/市场/调试台](../../game-design-workflow/gdd/GDD-2026-10-09-html-demo-run-economy-market.md) |
| 本轮素材 | [M-2026-10-09](../../game-design-workflow/idea-materials/M-2026-10-09-html-demo-meta-economy-market.md) |
| 遭遇 | [GDD-ENEMY-001](../../game-design-workflow/gdd/GDD-2026-09-04-monster-encounter-table.md) |
| 战斗 | [GDD-BATTLE-002](../../game-design-workflow/gdd/GDD-2026-08-22-glyph-synthesis-combat-system.md) |
| 客户端（未扩） | [GDD-CLIENT-001](../../game-design-workflow/gdd/GDD-2026-08-24-godot-greybox-client.md) |
| 决策表 | [decision-log.md](../../game-design-workflow/decision-log.md) |
| 试玩说明 | [html-demo/README.md](../../html-demo/README.md) |
| 协作原文 | [agent-coord.md](../agent-coord.md) |

---

## 5. 后续建议（未开工，仅留钩子）

1. 多局手测市场手续费与周一补货是否通胀。  
2. 调试台「导出覆盖 → 写回 content/卡表」流程，减少双真源。  
3. 若做撤离门槛 / 保险柜，单开 GDD 变更，勿静默改 META-001。  
4. 公开协作后：功能改动走分支 + PR，少直推 `main`。

---

*归档日期：2026-10-09 · 会话线：HTML Demo 系统/UX（A）*
