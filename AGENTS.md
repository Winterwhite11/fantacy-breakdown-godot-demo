# Agent 操作手册（本仓库）

你在 **Fantacy Breakdown 旧线 Demo 仓库**工作，不是 `dsaj4/game_design` 的《言咒》工作区。

## 必须先读

1. `README.md`（分路说明）  
2. `docs/control-center.md`  
3. `game-design-workflow/data/card-design-table-v0.2.md`  
4. `docs/github-collaboration.md`

## 硬规则

- **禁止**把《言咒》/ game-002 规则写进本仓库当作现行设定。  
- **禁止**擅自改写 `card-design-table-v0.2.md` 的设计内容（用户要求内容修改由用户完成）。  
- 不在 `main` 上直接改核心文档；用分支提交推送。  
- 改 `core-concept.md` 须走拟修改流程（draft-changes），除非用户明确要求写入。

## 意图分流

| 用户说法 | 去向 |
| --- | --- |
| 改卡 / 加配方 | 先改卡表（用户）或记 inbox；实现改 `data/cards.json` |
| 写 GDD | `game-design-workflow/gdd/` + 模板 |
| 改 Demo 玩法代码 | `scripts/` `scenes/` |
| 言咒相关 | 引导至上游 `workspaces/game-002`，本仓不接 |
