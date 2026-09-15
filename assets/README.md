# 旧线 Demo 资源库

本目录存放**旧线**美术 / 音频 / 角色 / 怪物资源，与《言咒》资源分离。

## 目录结构

```text
assets/
  music/          # 音乐与长录音
  ui/             # UI 资源（当前地图节点图标在 map-nodes/）
  characters/     # 人物设计（每角色一文件夹）
    <角色名>/
      人物设定/
      人物模型/
      美术/
      核心卡/
  monsters/       # 怪物遭遇（每遭遇一文件夹，结构同人物）
    ENC-xx-名称/
      人物设定/
      人物模型/
      美术/
      核心卡/
```

## 当前已入库

| 类别 | 内容 |
| --- | --- |
| music | `战斗` `拓宇者` `拓宇者2` `滚石` `王冠` `白月` `砂砾`（mp3）+ `音频-12分39秒.m4a` |
| ui/map-nodes | chest / event / fight / hard fight / shop |
| characters | 豪杰、王权、磐石、纯白（设定草案已放入「人物设定」） |
| monsters | ENC-01～10（索引指向 GDD-ENEMY-001） |

空的「人物模型 / 美术 / 核心卡」目录用 `.gitkeep` 占位，便于后续直接丢文件。

## 命名约定

- 角色文件夹用**中文代号**（与设定一致）。  
- 怪物文件夹用 `ENC-编号-简称`，与 `GDD-2026-09-04-monster-encounter-table.md` 对齐。  
- 原 `Fantacy Breakdown/Music` 与 `UI` 为工作区源目录；**以本仓库 `assets/` 为上传与引用权威**。
