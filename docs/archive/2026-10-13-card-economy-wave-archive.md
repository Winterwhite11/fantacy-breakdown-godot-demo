# 归档 · 卡牌经济 / 召唤流 / 自由市场 / 画风工具链（2026-10-12～13）

> **用途：** 留档本轮（DSH Agent + 用户拍板）整波优化，并记录推送节点。  
> **分支：** `feature/2026-10-12-card-economy`  
> **快照目录：** `game-design-workflow/archive/2026-10-12-2026-10-13-card-economy-full/`（`--all`，129 文件）  
> **交接说明：** [docs/CURSOR-README.md](../CURSOR-README.md)  
> **仓库：** https://github.com/Winterwhite11/fantacy-breakdown-godot-demo  

---

## 1. 本波覆盖

| 主题 | 落地 |
| --- | --- |
| 卡表解析 | 斜杠二选一配方修复；钢铁 / 电路径恢复 |
| 伤害曲线 | 统一 `5 / 14 / 27 / 45 / 69 / 100` |
| 敌人档位 | `tier` 与 `rewardTier` 解耦；ENC 对齐设计文档 |
| 经济 / 定价 | `economy.js` + `card-prices.js`；卡牌可交易资产 |
| 自由市场 | 弹性补货、让位玩家、手续费保底、自购只扣费 |
| 召唤流 | 元素人 / 大元素 / 元素王；索敌优先玩家上次目标 |
| 画风 / 地图 | `tokens.css` 像素科幻；确定性异星地形；像素棋子标记 |
| 工具链 | `npm test` 151 项；`check` / `economy` / `balance` / `archive` |

---

## 2. 用户拍板（不得回退）

1. 咏唱伤害以 **5/14/27/45/69/100** 为准（三处同步：`card-data.js` / `economy.js` / 解析器）。  
2. ENC-01 是构筑门槛（级联 + 阈值），不是静态必死局。  
3. 召唤物优先攻击 `lastAttackedUid`。  
4. 自由市场可玩可控；系统补货让位于玩家挂牌。  
5. 画风 = 像素异星科幻（主菜单太空），废羊皮纸线。  
6. 大改前必须 `npm run archive`；不在 `main` 上直接开发。  

---

## 3. 验收

```bash
npm test          # 151 项全绿（本机 2026-10-13 已跑）
npm run check
npm run economy
```

---

## 4. 仍待办（见 CURSOR-README §4 / §7）

- 撤离保险；酋长 `skipIfAlliesAlive` 修法（待决策）  
- `card table.docx` 入 git；封面图落地后 `npm run art`  
- 规格文档 `card-economy-system-v1.md` §0.2 伤害表仍写旧曲线，需与代码对齐  

---

*归档日期：2026-10-13 · 会话：上传并留档整波优化*
