# GDD 索引（旧线 Demo）

本目录保存旧线设计合同。**不含** game-002《言咒》GDD。

## 当前文档

| ID | 文档 | 状态 | 备注 |
| --- | --- | --- | --- |
| — | [卡牌设计表 v0.2](../data/card-design-table-v0.2.md) | 现行内容源 | 咏唱制；非 GDD 正文，但是实现优先引用 |
| GDD-BATTLE-002 | [字素合成战斗](GDD-2026-08-22-glyph-synthesis-combat-system.md) | Evaluation | 字素主线；费用模型待与卡表 v0.2 对齐 |
| GDD-CLIENT-001 | [Godot 灰盒客户端](GDD-2026-08-24-godot-greybox-client.md) | Evaluation | 本仓库即实现工程 |
| GDD-ENEMY-001 | [首测怪物遭遇](GDD-2026-09-04-monster-encounter-table.md) | Evaluation | 10 组；不附完整卡表 docx |
| GDD-BATTLE-001 | [成语组合战斗](GDD-2026-08-21-card-battle-system.md) | Parked | 仅对照，不实现 |

## 硬性规则（继承上游）

- 写 GDD 用统一模板；标记 `Hypothesis` / `Unknown` / `Out of Scope`。  
- inbox 不能直接当正式规则；须晋级 `idea-materials/`。  
- 写入 GDD ≠ 写入 `core-concept.md`。
