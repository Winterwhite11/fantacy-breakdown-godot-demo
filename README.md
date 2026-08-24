# Fantacy Breakdown �?Godot 灰盒 Demo

Godot 4 可运行客户端：网格地�?�?遭遇战斗 �?仿杀戮尖塔牌�?+ **字素合成双轨**�?

- 战斗规则：构思库 **GDD-BATTLE-002**
- 代码设计合同：构思库 **GDD-CLIENT-001**
- 本仓库只含客户端；GDD/Markdown 在独立的 `game_design` 仓库

## 快速开�?

1. 安装 [Godot 4.2+](https://godotengine.org/)
2. Godot �?Open �?本目�?`project.godot`
3. �?**F5** 运行

**详细操作、验收清单、FAQ�?* [docs/USAGE.md](docs/USAGE.md)  
**模块与数据流�?* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 30 秒操�?

| 场景 | 操作 |
| --- | --- |
| 地图 | WASD 单格移动；红格进�?|
| 地图 | 「合成台（永久）」：全局牌库 2�?，永久保�?|
| 战斗 | 点手牌出牌；「合成台」选手�?2 张做局内合�?|
| 战斗 | 局内合成战后失效；「结束回合」推进敌�?|

## 合成双轨（摘要）

| | 地图 | 战斗 |
| --- | --- | --- |
| 材料 | 全局牌库 | 仅手�?|
| 寿命 | 永久 | 仅本局〔局�?|

配方�?`data/cards.json`（蒸汽、酸、水刃、土墙、高压蒸汽等）�?

## 抽牌规则（非 STS�?

抽牌堆耗尽�?*�?*立即洗回弃牌堆；**下一回合开�?*才可能把弃牌堆洗入再抽�?

## 许可与协�?

试玩反馈请对�?`docs/USAGE.md` 第七节验收清单�? 
策划文档变更�?`game_design` 仓库�?GitHub 协作分支流程�?
