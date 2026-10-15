# 归档 · 流派扩展 / 定价重做 / 像素美术（2026-10-13～15）

> **用途：** 留档自上次推送 `6d3fe76` 以来的 31 个提交，并记录推送节点。  
> **分支：** `feature/2026-10-12-card-economy`  
> **快照目录：** `game-design-workflow/archive/2026-10-15-2026-10-15-post-archetypes-pixel-art/`（`--all`，152 文件）  
> **基线 HEAD（归档时）：** `e0e3397`  
> **交接说明：** [docs/CURSOR-README.md](../CURSOR-README.md)  
> **仓库：** https://github.com/Winterwhite11/fantacy-breakdown-godot-demo  

---

## 1. 本波覆盖（相对 `6d3fe76`）

| 主题 | 落地 |
| --- | --- |
| 自由市场 | 按真实时间补货、目录自愈、开发者控制台入口 |
| 战备 | 武器/护甲/头盔/背包档位、合成台、像素图标、主题化配方 |
| 价值口径 | 统一材料/收集品阶梯；装备按身份定价；千–万量级经济重构 |
| 悬浮预览 | 卡牌/战备/收集品/材料 1 秒悬停放大面板 |
| 一键合成 | 配方简化为 3–4 材料 |
| 冻结流派 | 309–323 共 15 张；214 雪为核心；寒霜庇护为防御终端 |
| 毒流派 | 16 张 + 338 防毒；339 熔毒 / 340 电解毒跨系出口；259–261 实装 |
| 砂流派 | 15 张物体命名防御构筑；可玩性压测与死路修复 |
| 「穿透」口径 | 与代码对齐；卡表完整性测试 |
| 卡价 | 深度优先、基础牌 400–500；稀有牌按获取难度而非配方深度 |
| 像素美术 | 怪物立绘、异星地表地图装饰（`monsters.js` / `terrain-art.js`） |
| 卡表版本 | 权威 docx 解析产物随代码一并版本化 |

---

## 2. 关键提交（从旧到新，节选）

```
e339778 Fix empty market: restock on a time interval, self-heal the catalog
49de104 Add equipment tiers … crafting bench and pixel icons
07cd688 Rework the whole economy: 千-万 magnitude …
a5ef88a Add the frost archetype …
0723d72 Add the poison archetype …
8f625b3 Add the sand defence archetype …
e5abde6 Rework card pricing: depth-first, base cards at 400-500
65eec8a Price rare cards by acquisition difficulty, not recipe depth
e0e3397 Pixel art pass: monster portraits and alien-surface map decoration
```

完整列表：`git log --oneline 6d3fe76..e0e3397`

---

## 3. 验收

```bash
npm run check
npm test
npm run economy
```

---

## 4. 仍待办（见 CURSOR-README §4 / §7）

- 撤离保险；酋长 `skipIfAlliesAlive` 修法（待决策）  
- `card table.docx` 入 git；封面图落地后 `npm run art`  
- ENC-02/03/04/10 部分分支与技能表  

---

*归档日期：2026-10-15 · 会话：检查新更新并上传留档*
