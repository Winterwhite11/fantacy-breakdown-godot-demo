# Cursor 接手 README · Fantacy Breakdown Demo

> **写于：** 2026-10-12
> **写给：** Cursor（或其他接手的 AI / 人类协作者）
> **仓库：** `godot-demo`（独立 git 仓库）· **当前分支：** `feature/2026-10-12-card-economy`
> **上一轮负责人：** DSH Agent

---

## 0. 30 秒上手

```bash
# 1. 确认分支（不要在 main 上改）
cd godot-demo
git branch --show-current      # 应为 feature/2026-10-12-card-economy

# 2. 一键体检（改任何东西前后都跑）
npm run check                  # = stamp + validate，当前：43 通过 / 0 警告 / 0 失败

# 3. 跑平衡测试（可复现，固定种子）
npm run balance                # 或 npm run balance:quick

# 4. 覆盖前留档（必须）
npm run archive -- <你的标签>

# 5. 试玩
npm run serve                  # 打开 http://127.0.0.1:8765/html-demo/
```

> **本仓库刻意零 npm 依赖**：所有脚本只用 Node 内置模块。
> `package.json` 只是入口别名，不引入任何构建链。

**接手第一件事：读 `game-design-workflow/data/card-economy-system-v1.md`。**
它是本轮建立的设计规格，第 0 节逐字保留了用户原始设计意图（不可改写）。

---

## 1. 这个项目是什么

**《Fantacy Breakdown》** —— 咏唱制卡牌 + 搜打撤（extraction）游戏。

- **核心机制**：基本「字」（元素）组合成复杂「字词」。咏唱时间 = 堆叠字数。
- **数值**：1s=5伤 / 2s=12 / 3s=21 / 4s=32 / 5s=45 / 6s=60；护甲只存 5s；前后摇 0.5+1.5。
- **铭文耐性**：决定一个复杂字最多堆几个基本字。豪杰=6，其余=5。
- **三大流派**：合成流（基本） / 环境流 / 召唤流。
- **结算节奏**：敌人每 5s 行动一次，状态每 5s 结算一次，玩家每 5s 约出 1 张牌。

### 权威链（重要，别搞错）

```
card table.docx（用户手写真源，在 workspace 根目录，不在 git 内）
    │  tools/parse_card_table_docx_v2.py
    ▼
html-demo/js/card-data.js      ← 生成的卡表数据
    │  js/cards.js → WORD_EFFECTS / ELEMENT_PLAY
    ▼
html-demo/js/combat.js         ← 战斗结算（运行时权威）
```

**容易踩的坑：**

| 坑 | 说明 |
| --- | --- |
| `card-design-table-v0.2.md` **已过期** | 它只有 59 个 id，docx 有 87 个。**不要**再当现行真源 |
| docx 正文写「1费5/2费14/3费27」 | 用户 2026-10-12 拍板：**以代码 5/12/21/32 为准**，docx 那行作废 |
| `docs/control-center.md` 说 Godot 不扩玩法 | 这条仍然有效，**不要动 `scripts/` `scenes/`** |
| 言咒（game-002）的规则 | **禁止**混入本仓库 |
| `assets/ui/menu/*.png`、`1.pdf` | 那是《言咒》线的**废案**（羊皮纸/木桌）。本作画风是**像素异星探索科幻** |

---

## 2. 本轮（2026-10-12）做了什么

| # | 工作 | 关键文件 |
| --- | --- | --- |
| 1 | 旧版留档（docx / v0.2 / card-data.js） | `game-design-workflow/archive/2026-10-12-card-economy-snapshot/` |
| 2 | 经济体系规格 | `game-design-workflow/data/card-economy-system-v1.md` |
| 3 | 定价引擎 | `html-demo/js/economy.js` |
| 4 | **修复卡表解析器**（斜杠配方丢失） | `html-demo/tools/parse_card_table_docx_v2.py` |
| 5 | 分角色铭文耐性 | `app.js` `currentTolerance()` |
| 6 | 咏唱伤害表扩到 6s | `card-data.js` |
| 7 | **修正敌人档位** + 奖励档位解耦 | `encounters.js` `enemy-tiers-reference.json` |
| 8 | **实装 9 张白板牌** | `combat.js` `cards.js` |
| 9 | 确定性战斗模拟器 | `html-demo/js/sim.js` |
| 10 | 自动化平衡测试 | `tools/balance.mjs` |
| 11 | 自动留档 + 一键体检 | `tools/archive_snapshot.mjs` `tools/validate.mjs` |
| 12 | 画风统一为像素科幻 + 地图细节化 | `css/tokens.css` `css/style.css` |
| 13 | **自动缓存戳**（取代 38 处手写 `?v=`） | `tools/stamp.mjs` |
| 14 | **卡价接入商店**（不再"随机卡固定12"） | `app.js` `openShop` / `buildShopCardOffers` |
| 15 | Cursor 交接文档 | `docs/CURSOR-README.md`（本文） |

### 2.1 修复了一个真实的数据缺陷（很重要）

旧解析器的正则识别不了 `砂+火/加热+增幅` 这种**斜杠二选一配方**，导致：

| | 修复前 | 修复后 |
| --- | ---: | ---: |
| 有配方的 specials | 64 / 75 | **65 / 71** |
| 无配方 | 11 | **6**（召唤流核心卡，原文即无配方） |
| 钢铁配方 | **无** | `sand+fire+amp` |
| 电获取路径 | **无** | `sand+amp` |

**这解释了为什么 demo 里钢铁像个"凭空得来的超模牌"** —— 它的配方链在代码里根本不存在。

### 2.2 敌人档位错标的根因

用户设计文档给每场遭遇都标了档位（`对标75血一回合12伤害 ——2档`）。Cursor 把**难度档位当成了奖励档位**用，于是：

| 遭遇 | 设计档 | 旧代码 | 现已修正 |
| --- | ---: | ---: | ---: |
| ENC-01 四个野人 | 2 | 3 | **2** |
| ENC-03 损坏的机器人 | 2 | 3 | **2** |
| ENC-10 冰与火 | **4（精英）** | 3 | **4** |

现在拆成两个字段：`tier`（难度，设计文档 1-5）+ `rewardTier`（奖励 1-3），
通过 `FBEncounters.rewardTierOf()` 取用。**以后改难度不会连带改掉落。**

### 2.3 定价公式（数学上已证明）

```
基础牌 P = 2.0 × (WV/5)^1.734        （锚点：WV5=2代币，WV32=50代币）
合成牌 P = max( Σ材料价 × (1 + 0.22×材料数), 按强度定价 )
```

- `WV`（窗口价值）把伤害/护甲/治疗/状态折算到统一的「一个 5 秒窗口」尺度。
- **为什么不取整**：取整会让 WV1 与 WV2 同价 → 性价比逆序 → 鼓励堆最便宜的牌。
  已证明取整**无法**同时满足「价格严格递增」与「性价比严格递减」。故保留小数，
  仅在 UI 用 `displayPrice()` 取整。

---

## 3. 自动化作业（本轮新增，请务必用）

### `tools/validate.mjs` — 一键体检

```bash
node tools/validate.mjs          # 人类可读
node tools/validate.mjs --json   # 机器可读
```

检查 5 组共 42 项：语法 / 遭遇档位与血量 / 卡表完整性 / 效果实现覆盖 / 经济约束。
**退出码非 0 表示有失败项**（可接 CI）。改动后必须保持全绿。

### `tools/balance.mjs` — 可复现平衡测试

```bash
node tools/balance.mjs --games 300 --seed 20261012
node tools/balance.mjs --save     # 存到 game-design-workflow/reports/
```

用固定种子把 6 套预设法术组跑遍 10 场遭遇，输出胜率与 95% 置信区间。
**同一种子结果完全一致**，所以版本间对比即可判断改动影响。

### `tools/archive_snapshot.mjs` — 覆盖前留档（用户硬性要求）

```bash
node tools/archive_snapshot.mjs <标签> [--all] [--files a,b,c]
```

写到 `game-design-workflow/archive/<日期>-<标签>/`，含 `MANIFEST.json`（记录分支与
commit 哈希）+ `README.md`（说明回溯方式）。**任何大改动前都先跑这个。**

### `html-demo/js/sim.js` — 确定性模拟内核

mulberry32 种子化 PRNG，无 DOM 依赖。
⚠ 它**镜像** `combat.js` 的结算规则，**不是运行时**。若改战斗规则，两边都要改。

---

## 4. 当前状态与已知问题

### 4.1 已就绪

- 42 项体检全绿；9 张白板牌清零；10 条合成链实测打通。
- 定价：性价比随强度严格递减，风险阶梯成立（跑刀→常规→猛攻 盈亏平衡存活率递减）。
- 画风：单一令牌源 `css/tokens.css`，0 处遗留羊皮纸色值。

### 4.2 ⚠ 最需要决策的问题：多单位遭遇的行动经济

平衡测试实测：

| 遭遇 | 单位数 | 敌方伤害/5s | 玩家可撑 | 设计文档目标 |
| --- | ---: | ---: | ---: | --- |
| ENC-01 四个野人 | 4 | **~34** | **~9s** | 一回合 12 伤害 |
| ENC-10 冰与火 | 2 | ~9 | ~32s | 精英 |

**设计文档按"整组一回合 12 伤害"平衡，但实现里每个单位各自每 5s 行动一次，
所以 4 单位遭遇有 4 倍行动经济。** 这不是代码 bug，是规则层缺口。

**候选修法（需用户拍板）：**
1. 引入「组行动预算」：整组每回合总输出受参考曲线约束，单位数只影响分配。
2. 降低多单位遭遇的单体数值（改 encounters.js）。
3. 保持现状，改用 `tier` 重新标定（但会与设计文档冲突）。

### 4.3 其他待办

| 优先级 | 事项 |
| --- | --- |
| 高 | 方案 C 落地：`runMeta.staging` 已存在，商店买卡已走「牌组满则暂存」，但"收集品只能撤离带出 + 撤离保险"尚未形成完整机制 |
| 高 | 自由市场卡牌仍用 `12 + i*2` 序号定价（`market.js`），应改用 `economy.js` |
| 中 | 冻结阈值第三档：原文 `>30 层减少一点费用`，未实现 |
| 中 | 设计文档中未实现的怪物行为：ENC-04 的 10% 双狼、ENC-03 的 50% 双分支、ENC-02 小偷/大盗的条件分支与代币扣除、ENC-10 冰火法师的技能优先级表 + 救援技能 + 觉醒阶段 |
| 中 | `card table.docx` 应移入 git（现位于 workspace 根目录，无版本保护）。移入后需改 `parse_card_table_docx_v2.py` 的 `DOCX` 路径 |
| 低 | `assets/music/音频-12分39秒.m4a` 与 workspace 根目录同名文件 SHA256 相同，重复占 11.49MB |
| 低 | 卡表 259-262（脉冲/绝缘/天罚/新纪元）原文只有名字无设计，已分离为 `placeholders` |

---

## 5. 协作红线

1. **不在 `main` 上直接改**；核心文档改动须提交推送。
2. 卡表**内容真源**是 `card table.docx`；`card-design-table-v0.2.md` 已过期，勿再引用为现行。
3. 咏唱伤害以 `5/12/21/32`（+5s/6s 扩展）为准。
4. 改战斗规则时，`combat.js` 与 `sim.js` **必须同步**，并重跑 `validate.mjs`。
5. 画风只引用 `css/tokens.css` 的变量，不要写死颜色。
6. 覆盖任何内容前先 `archive_snapshot.mjs`（用户明确要求可回溯）。
7. `docs/agent-coord.md` 是跨会话**唯一协商板**（Cursor 会话之间不能直连）。
   接手后请在该文件写回 Status。

---

## 6. 目录速查

| 路径 | 用途 |
| --- | --- |
| `html-demo/` | **现行可玩 Demo**（权威验证床） |
| `html-demo/js/economy.js` | 定价引擎（WV / 定价 / 风险 / 威胁档位） |
| `html-demo/js/sim.js` | 确定性模拟（测试用） |
| `html-demo/css/tokens.css` | **视觉单一真源**（像素异星科幻） |
| `html-demo/tools/parse_card_table_docx_v2.py` | 卡表解析（生成 card-data.js） |
| `tools/validate.mjs` | 一键体检 |
| `tools/balance.mjs` | 平衡测试 |
| `tools/archive_snapshot.mjs` | 覆盖前留档 |
| `game-design-workflow/data/card-economy-system-v1.md` | **经济体系规格（先读这个）** |
| `game-design-workflow/data/enemy-tiers-reference.json` | 敌人档位权威基准 |
| `game-design-workflow/data/card-price-table-v1.json` | 生成的定价表 |
| `game-design-workflow/archive/` | 历史留档（可回溯） |
| `scripts/` `scenes/` | Godot 灰盒 —— **暂停扩玩法，勿动** |

---

## 7. 建议的下一步顺序

1. 先跑 `validate.mjs` + `balance.mjs` 确认基线（应全绿）。
2. 向用户确认 **4.2 多单位行动经济** 的修法（这是数值平衡的总开关）。
3. 把卡价接入商店与市场（4.3 第 1 项）——这是方案 C 的前置。
4. 落地方案 C 的"只能撤离带出"机制。
5. 补设计文档里未实现的怪物行为（4.3 第 3 项），每补一个就跑一次 `balance.mjs` 对比。

**每次改动的工作流：**

```bash
npm run archive -- <标签>     # 1. 留档
# ...改代码...
npm run check                 # 2. 盖章 + 体检，必须全绿
npm run balance               # 3. 平衡对比（固定种子，可跨版本比）
git add -A && git commit      # 4. 提交
```

> `npm run check` 会先跑 `stamp.mjs`。**顺序很重要**：改了 js/css 后
> 缓存戳必须重算，否则体检会报"缓存戳漂移"（这是设计上的保护，不是误报）。
