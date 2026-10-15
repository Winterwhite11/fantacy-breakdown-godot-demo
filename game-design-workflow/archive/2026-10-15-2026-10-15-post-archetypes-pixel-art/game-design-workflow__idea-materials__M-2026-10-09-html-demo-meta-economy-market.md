# 正式素材 · HTML Demo 局外经济 / 自由市场 / 调试台

| 字段 | 内容 |
| --- | --- |
| 素材 ID | `M-2026-10-09-html-demo-meta-economy-market` |
| 状态 | `Promoted → GDD` |
| 日期 | `2026-10-09` |
| 关联 GDD | [GDD-META-001](../gdd/GDD-2026-10-09-html-demo-run-economy-market.md) |
| 关联协作板 | [docs/agent-coord.md](../../docs/agent-coord.md) |
| 关联时间线 | [docs/archive/2026-10-09-html-demo-optimization-archive.md](../../docs/archive/2026-10-09-html-demo-optimization-archive.md) |
| 实现路径 | `html-demo/`（权威可玩床） |

## 原始需求（用户意图摘要）

1. **搜打撤式带出**：进局不带大量代币；战利品局中暂存；撤离才入永久仓；败北携带战备永久损失。  
2. **合成分层**：战斗合成只服务本场（弃置分解回材料）；永久改牌组只在地图战备。  
3. **自由市场**：三角洲式分区（战备 / 卡牌 / 收集品）；挂牌自定价；成交手续费；系统补货；价格波动图。  
4. **数据调试台**：单页 HTML 查看并直接输入修改卡牌数值/效果/胜率、怪物行动逻辑/胜率、市场携带胜率与价格柱。  
5. **开源协作**：公开 GitHub，欢迎 Fork + PR（非全网直写 main）。

## 优化思路（设计层）

| 思路 | 目的 | 反面信号 |
| --- | --- | --- |
| vault / run / staging 三层代币与物品 | 让「这一局赚了什么」与「永久财富」可读 | 局内通胀、撤离无意义 |
| Hard 紫掉落进 staging | 精英战奖励有重量，仍服从带出规则 | 打完直接进仓破坏紧张感 |
| 战斗合成分解 | 鼓励战场临场合成，不永久污染牌组 | 玩家不敢合、或合成永久白嫖 |
| 市场 5% 手续费 + 周一 +3 库存 | 简单可解释的流动性，不做完整动态价引擎 | 手续费过高无人挂 / 补货淹没玩家挂牌 |
| 调试台 localStorage 覆盖 | 策划可快速改数试玩，无需改源码再部署 | 覆盖与源码双真源长期漂移（可接受于 Demo） |
| A 系统 / B 数据并行 | 跨会话无法直连时用 `agent-coord.md` 协商 | 同改 `app.js`/`combat.js` 冲突 |

## 与既有系统关系

- 战斗权威仍为卡表咏唱制 + [GDD-BATTLE-002](../gdd/GDD-2026-08-22-glyph-synthesis-combat-system.md)。  
- 遭遇内容仍以 [GDD-ENEMY-001](../gdd/GDD-2026-09-04-monster-encounter-table.md) + `encounters.js` 为准；本素材不改怪物叙事。  
- Godot 灰盒 [GDD-CLIENT-001](../gdd/GDD-2026-08-24-godot-greybox-client.md) **不扩**本轮 meta；仅 HTML demo 落地。

## 验证信号

- **成功：** 新开一局代币为 0；撤离后顶栏 vault 增加；败北 staging/战备不回仓；市场可买卖并见价格柱；调试台改咏唱后刷新试玩生效。  
- **失败：** 旧存档仍显示起始代币、掉落直接入仓、战斗合成改永久牌组。  
- **停止：** 若要做完整三角洲动态价 / 撤离门槛 / 在线交易，另开 GDD，不在本素材扩范围。
