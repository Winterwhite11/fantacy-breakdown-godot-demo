# 架构说明

对应 **GDD-CLIENT-001**。本文面向继续开发的同学。

## 1. 仓库定位

- 本仓库：可运行 Godot 4 灰盒客户端  
- 并列构思库：`game_design`（Markdown 工作流，不含本工程代码）  
- 战斗规则来源：GDD-BATTLE-002；客户端合同：GDD-CLIENT-001  

## 2. 目录结构

```text
godot-demo/
  project.godot
  README.md
  docs/
    USAGE.md              # 玩家/试玩详细说明
    ARCHITECTURE.md       # 本文
  data/
    cards.json            # 卡牌 + 2 料配方
  scenes/
    main.tscn
    map/map_scene.tscn
    battle/battle_scene.tscn
  scripts/
    autoload/
      card_library.gd     # 目录与配方查询
      game_state.gd       # 跨场景状态与永久牌库
      scene_router.gd     # 场景切换
    map/
      map_controller.gd   # 网格、遭遇、地图合成 UI
    battle/
      battle_controller.gd
      battle_hud.gd
      pile_controller.gd
      combatant.gd
      card_data.gd
      card_view.gd
      synthesis_service.gd
      simple_enemy_ai.gd
```

## 3. Autoload 数据流

```text
CardLibrary.reload()
    └─ data/cards.json → catalog + recipes

GameState
    ├─ run_deck_ids[]     # 永久牌库（地图合成改这里）
    ├─ player_hp, map_cell, cleared_combat_cells
    ├─ build_battle_deck() → Array[CardData] 拷贝
    └─ craft_permanent_at_indices(i, j)

进战：SceneRouter → battle_scene
    BattleController.begin_battle
        piles.setup(GameState.build_battle_deck())
    局内合成 → 只改 piles，标记 is_battle_temp
返回地图：丢弃战斗场景 → run_deck_ids 未被局内合成修改
```

## 4. 战斗状态机

文件：`battle_controller.gd`

| 状态 | 职责 |
| --- | --- |
| SETUP | 初始化双方与牌堆 |
| PLAYER_TURN_START | 毒跳、回费、`ensure_draw_pile_for_turn`、抽牌 |
| PLAYER_MAIN | 出牌 / 合成 / 结束回合 |
| PLAYING_CARD | 单卡结算 |
| ENEMY_TURN | `SimpleEnemyAI` |
| RESULT | 胜负 UI |

关键：`PileController.draw()` **绝不** reshuffle；只有回合开始的 `ensure_draw_pile_for_turn(needed)` 可以。

## 5. 合成服务

`SynthesisService.craft_pair(mode, a, b)`：

- `MAP_PERMANENT`：结果不带 temp；由 GameState 改 `run_deck_ids`  
- `BATTLE_TEMP`：`is_battle_temp=true`；材料移出手牌（不进弃牌），结果加入手牌  

配方键：两材料 id 排序后与 `recipes[].materials` 比较。

## 6. 扩展指南

| 需求 | 改哪里 |
| --- | --- |
| 新基础字/字词 | `data/cards.json` 的 `cards` |
| 新 2 料配方 | `recipes` |
| 新效果类型 | `CardData` + `BattleController._resolve_card` |
| 本源字 | 新模块；勿塞进 `draw()` |
| 3 料合成 | 扩展 UI 选 3 张 + recipe 匹配 |

## 7. 测试建议

1. 地图：水+压缩 → 水刃后进战，确认起手可能抽到水刃  
2. 战斗：手牌火+气 → 蒸汽〔局〕，回地图后全局摘要无蒸汽（除非地图也合成过）  
3. 抽牌：耗尽抽牌堆后当回合张数不回升，下回合才洗回  
