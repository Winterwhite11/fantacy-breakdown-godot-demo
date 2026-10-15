# 游戏设计工作流（旧线 Demo 精简版）

本目录仿照 `dsaj4/game_design` 的构思流程，但**只服务旧线 Demo**，不包含《言咒》内容。

## 流程

```text
idea-inbox/  →  idea-materials/  →  gdd/  →  （采纳后）core-concept.md
                     ↑
              data/ 卡表等数据文档
```

- 原始想法先入 `idea-inbox/`，勿直接改 `core-concept.md`。  
- GDD 使用 `templates/gdd-writing-requirements-and-template.md`。  
- 现行卡牌内容以 `data/card-design-table-v0.2.md` 为准（用户原文结构化，未改设计）。

## 与客户端关系

实现代码在仓库根目录 Godot 工程；设计合同在 `gdd/`。矛盾时：卡表原文优先于旧费用模型描述；客户端 GDD 描述灰盒现状。
