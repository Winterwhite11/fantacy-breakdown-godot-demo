# Fantacy Breakdown — Godot 灰盒 Demo

Godot 4 可运行客户端：网格地图 → 遭遇战斗 → 仿杀戮尖塔牌区 + **字素合成双轨**。

- 战斗规则：构思库 **GDD-BATTLE-002**
- 代码设计合同：构思库 **GDD-CLIENT-001**（PR: https://github.com/dsaj4/game_design/pull/3）
- 本仓库只含客户端；GDD/Markdown 在独立的 `game_design` 仓库

仓库：https://github.com/Winterwhite11/fantacy-breakdown-godot-demo

## 快速开始

```bash
git clone https://github.com/Winterwhite11/fantacy-breakdown-godot-demo.git
cd fantacy-breakdown-godot-demo
```

1. 安装 [Godot 4.2+](https://godotengine.org/)
2. Godot → Open → 本目录 `project.godot`
3. 按 **F5** 运行

**详细说明：** [docs/USAGE.md](docs/USAGE.md)  
**架构说明：** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 30 秒操作

| 场景 | 操作 |
| --- | --- |
| 地图 | WASD 单格移动；红格进战 |
| 地图 | 「合成台（永久）」：全局牌库 2→1 |
| 战斗 | 点手牌出牌；「合成台」选手牌 2 张局内合成 |
| 战斗 | 局内合成战后失效；「结束回合」推进敌方 |

## 合成双轨

| | 地图 | 战斗 |
| --- | --- | --- |
| 材料 | 全局牌库 | 仅手牌 |
| 寿命 | 永久 | 仅本局〔局〕 |

配方见 `data/cards.json`。