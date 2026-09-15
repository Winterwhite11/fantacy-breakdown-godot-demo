# M-2026-08-24 Godot 灰盒客户端实现

| 字段 | 内容 |
| --- | --- |
| 素材 ID | `M-2026-08-24-godot-greybox-client` |
| 状态 | `Qualified` |
| 来源 inbox | [2026-08-24-godot-greybox-client.md](../idea-inbox/2026-08-24-godot-greybox-client.md) |
| 关联战斗 GDD | [GDD-BATTLE-002](../gdd/GDD-2026-08-22-glyph-synthesis-combat-system.md) |
| 实现工程 | https://github.com/Winterwhite11/fantacy-breakdown-godot-demo （本地：`Fantacy Breakdown/godot-demo/`） |

## 合格摘要

可运行的 Godot 4 灰盒闭环：地图探索 → 遭遇战斗 → STS 式牌堆 UI → 双轨字素合成。用于验证 GDD-BATTLE-002 的可实现性，而非替代构思库。

## 可被 GDD 引用的要点

1. 场景流：`main` → `map` ⇄ `battle`
2. 全局牌库 `run_deck_ids` 与战斗牌堆分离
3. 抽牌：仅回合开始可洗弃牌堆入抽牌堆
4. 地图永久合成 vs 战斗瞬时合成
5. 首测卡与配方在 `data/cards.json`
