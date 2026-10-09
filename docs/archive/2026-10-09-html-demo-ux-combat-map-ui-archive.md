# 归档 · HTML Demo UX / 战斗指向 / 地图迷雾 / 像素主页（2026-10-09 续）

> **用途：** 留档本轮体验与系统改动（战斗拖放指向、市场滚轮与挂牌仓库、战争迷雾、地图扩容、像素科技主页）。  
> **前序归档：** [2026-10-09-html-demo-optimization-archive.md](./2026-10-09-html-demo-optimization-archive.md)（经济 / 市场 / 调试台）  
> **仓库：** https://github.com/Winterwhite11/fantacy-breakdown-godot-demo  

---

## 1. 优化思路

| 主题 | 思路 | 落地 |
| --- | --- | --- |
| 战斗指向 | 参考杀戮尖塔：拖牌选目标 | 敌人=攻击；自己=防御；纯攻击拖自己二次确认自伤 |
| 召唤栏 | 仅玩家召唤物；无则隐藏 | `combat.allies`；UI 条件渲染 |
| 战斗日志 | 占空间 | 删除日志窗，网格空间给战场/手牌 |
| 自由市场 | 三角洲式浏览 + 挂牌接仓 | 整页一体滚轮；挂牌页左仓右挂牌台 |
| 地图探索 | 战争迷雾增加未知感 | 切比雪夫视野 2 格；已探索记忆 |
| 地图体量 | 扩大探索空间 | **18×18**（原 9×9）；节点约×2 |
| 主页视觉 | 像素科技 + 太空穿梭 | Canvas 飞船/陨石/星球；STS2 式左列紧凑菜单 |

---

## 2. 流程（实现顺序）

```text
战斗指向（combat.js + app.js 拖放）
  → 召唤栏隐藏逻辑
  → 去掉战斗日志
  → 市场整页滚动 + 挂牌接仓库
  → 地图战争迷雾 + 18×18
  → 像素科技 CSS + menu-space.js
  → STS2 式缩小主菜单选项
  → 本归档 + push GitHub
```

---

## 3. 时间线（本续档）

| 节点 | 说明 |
| --- | --- |
| 战斗拖放指向 | `getCardTargeting`；自伤警告；召唤物预留 |
| 召唤栏 | 无存活召唤物不显示 |
| 战斗日志删除 | `#combat-log` 移除 |
| 市场 UX | 整页滚动；仓库网格挂牌 |
| 战争迷雾 | `VISION_RANGE=2`；explored 记忆 |
| 地图扩容 | `MAP_SIZE=18` |
| 像素主页 | `menu-space.js` + Press Start 2P / VT323 |
| 主菜单排布 | 左侧品牌+紧凑选项；右侧背景 |

---

## 4. 关键文件

| 模块 | 路径 |
| --- | --- |
| 战斗指向 | `html-demo/js/combat.js` · `html-demo/js/app.js` |
| 地图 / 迷雾 | `html-demo/js/map.js` |
| 市场 UI | `html-demo/js/app.js` · `css/style.css` |
| 像素太空背景 | `html-demo/js/menu-space.js` |
| 样式 | `html-demo/css/style.css` · `html-demo/index.html` |
| 试玩说明 | `html-demo/README.md` |

---

## 5. 存档 / 兼容

- 迷雾：`cell.explored`；旧档由 `ensureFogState` 补齐。  
- 地图尺寸：仅**新开一局**为 18×18；旧局仍为 9×9。  
- 市场/调试键未变。

---

## 6. 验收手测

- [ ] 拖攻击牌到敌人咏唱；拖防御牌到自己  
- [ ] 纯攻击首次拖自己警告，再次自伤  
- [ ] 无召唤物时无召唤栏  
- [ ] 市场整页滚轮；挂牌可选仓库物品  
- [ ] 地图迷雾 2 格；走出变暗记忆  
- [ ] 新局 18×18  
- [ ] 主页太空动画 + 左侧小选项列  

---

*归档日期：2026-10-09 · 会话线：HTML Demo UX*
