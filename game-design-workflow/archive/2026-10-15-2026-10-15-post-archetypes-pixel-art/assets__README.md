# 旧线 Demo 资源库

本目录存放**旧线**美术 / 音频 / 角色 / 怪物资源，与《言咒》资源分离。

## 目录结构

```text
assets/
  music/          # 音乐与长录音
  ui/
    map-nodes/    # 地图节点图标（战斗/事件/宝箱/商店/玩家）
    map-nodes/_legacy/  # 同步前的旧图标备份
    menu/         # 主菜单背景（地图桌面概念图）
    textures/     # 纸张 / 木纹 / 地图 albedo
    map-desk/     # 地图桌面分件渲染参考
    frames/       # E1 Godot 实机 UI 帧参考
    SOURCE-from-dsaj4-game_assets.json
  characters/     # 人物设计（每角色一文件夹）
  monsters/       # 怪物遭遇（ENC-xx）
```

## 当前已入库

| 类别 | 内容 |
| --- | --- |
| music | `战斗` `拓宇者` `拓宇者2` `滚石` `王冠` `白月` `砂砾`（mp3）等 |
| ui/map-nodes | 自 [dsaj4/game_assets](https://github.com/dsaj4/game_assets) 地图桌面渲染：红线/篝火/水晶球/宝箱/建筑/法师木雕 |
| ui/menu | `map-desk-overall-v05` `map-desk-assembly` `visual-direction-v01` |
| ui/textures | E1 木纹/纸/地图贴图 + `map-paper-albedo-v01` |
| characters | 豪杰、王权、磐石、纯白 |
| monsters | ENC-01～10 |

> 未镜像上游 `.blend` / `.glb`（体积大、旧线 HTML Demo 暂不需要）。来源清单见 `ui/SOURCE-from-dsaj4-game_assets.json`。

## 命名约定

- 角色文件夹用**中文代号**。  
- 怪物文件夹用 `ENC-编号-简称`。  
- UI 运行引用以本仓库 `assets/ui/` 为准。
