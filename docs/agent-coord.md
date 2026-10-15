# Agent 协同交接 · HTML Demo

更新：2026-09-22  
发起会话：[HTML 战斗 Demo 实现](cd2d7530-a31d-4091-902a-29bfd1639c3a)  
协作会话：[Greeting conversation](3170d070-0df7-429f-a86b-6dfe84315dca)

> Cursor 会话之间**不能直连发消息**。请在 Greeting 会话粘贴：  
> `请阅读 godot-demo/docs/agent-coord.md 并按「Greeting 线」开工；完成后把结果写回本文件 Status。`

## 共同目标

继续完成 **内容更新 + demo 优化**（权威：卡表咏唱制；可玩床：`html-demo/`）。

## 协商分工（已拍板）

| 线 | 负责 | 本轮交付 |
| --- | --- | --- |
| **A · 系统/UX**（本会话） | 角色选择屏、地图商店格、奖励格面板、`runMeta` 接线、小 UX 洞 | 可点的流程，不强塞卡效文案 |
| **B · 内容/数据**（Greeting） | 四角色定义、事件道具/flag 效果表、收集品战斗效果（含寒霜结晶/炽火余烬）、ENC-07～09 与 GDD/资源文件夹对齐 | 数据表 + 最小可挂接字段，不改大 UI |

### 共享约定（改前先对齐）

`runMeta` 扩展字段（A 接线，B 填数据）：

```js
{
  character: null | "pure" | "royalty" | "rock" | "hero", // 纯白/王权/磐石/豪杰（与 events-data.requireCharacter 一致）
  inventory: [{ id, name, desc? }],  // 事件道具
  flags: { /* shop_half, free_node_pick, guide_extra_draw, next_run_bonus, extract_bank, ... */ },
  tokens: number, // 本局；开局恒 0；撤离 → metaVault
  hardWins, fightWins, runWon
}
```

经济 / 带出（2026-09-22 拍板，**覆盖**旧「起始 20」约定；**A 已落地**）：

```js
FBSave vault: { tokens }           // 永久仓库代币，顶栏；bankRunExtract 注入
runMeta.tokens                     // 进局 0；撤离 → vault
runMeta.staging: { cards[], collectibles[] }  // 局中战利品；撤离才入仓
```

- Hard 掉落名「寒霜结晶」「炽火余烬」→ **staging** 直至撤离（见 `FBContent.HARD_STAGING_DROPS`）。
- pending `next_run`（桃核）→ 下局 `runMeta.tokens`，**不进** vault。
- 战斗合成进弃牌 → 分解材料（A）；永久合成仅地图战备。
- 撤离点：**暂保持随时可撤**（角落）；本轮不改门槛。
- 冲突文件：`app.js` / `save.js` / `events-data.js` / `combat.js` — **loot/craft/staging/vault 流程归 A**；B 只动 `content-tables.js` + 本文档（+ 可选 README 一段）。若需动同一函数，先在本文件 Status 留言。

## Greeting 线（B）具体任务

1. **`html-demo/js/content-tables.js`（新建）** 导出：
   - `CHARACTERS[]`：id / 中文名 / 短介绍 / 起始加成（tokens? maxHp? startBlock?）
   - `ITEM_EFFECTS{}`：事件道具 id → `{ type, ... }`（至少实现 3～5 个有用效果，其余可 `noop`）
   - `FLAG_EFFECTS` 说明：`shop_half`（商店半价）、`free_node_pick`（下一次事件/奖励可再触发一次）、其余列出建议
   - `COLLECTIBLE_EFFECTS{}`：至少给 `寒霜结晶` / `炽火余烬` 写真实战斗相关效果（如开场冻伤层 / 燃烧层或抗性），其他稀有度给 1～2 个范例
2. **`encounters.js`**：ENC-07～09 名称与 `assets/monsters/` 文件夹对齐；周期可按 GDD 微调，勿删 Hard「冰与火」。
3. 在本文件底部 **Status · Greeting** 写完成清单与未决问题。

## 本会话线（A）具体任务

1. 开局 **角色选择**（写入 `runMeta.character`，存档可读）。
2. 地图加入 **shop** 节点；简易商店 UI（花代币买卡/回血/随机收集品）；尊重 `shop_half`。
3. **奖励格** 用面板替代纯 toast（HP + 代币 + 可选小奖励）。
4. 补 `#map-items`、文档/代币一致性、战斗「回地图」死按钮等小洞。
5. 若 B 已提交 `content-tables.js`，把收集品/道具效果挂到 combat/loadout。

### 致 Greeting · 经济/带出 任务帖（A → B · 请用户中继）

用户新需求（四人协作拍板如下）：

| # | 需求 | A（系统） | B（Greeting / 数据） |
| --- | --- | --- | --- |
| 1 | 进局代币 **0**；撤离代币 **永久入仓** | `createRunMeta.tokens=0`；`FBSave` metaVault；撤离 `vault.tokens += run` | 角色 `startTokens→0`；文档 schema；桃核 next_run 仍加**下局 run 代币**不进 vault |
| 2 | 地图查看战备/牌组/背包；可丢弃；**永久合成台**改牌组 | 地图 UI + 丢弃 + 永久合成 | 合成台文案/配方提示可补；不动 combat |
| 3 | 战斗合成牌进弃牌 → **分解回材料**；战斗合成不改永久牌组 | `combat.js` craftedFrom + discard 分解 | 在 content-tables/注释写清规则 |
| 4 | 战斗掉落不进仓库，**撤离才入仓** | runStaging；战利品 UI 去掉「入仓库」；撤离结算 | 标明 Hard 紫掉落属 staging |

**请 B 立刻：**
1. 读本帖，Status 勾选；`content-tables` 角色 startTokens 全 0 + schema 注释  
2. **勿大改** `app.js` loot / `combat.js` discard（A 正在改）  
3. 紫/金收集品效果若未做完可继续，勿碰 vault API 命名（A：`FBSave.loadVault/saveVault`）

### 本会话（A）· 本轮认领

- [x] #1 经济 vault + 起始 0（`createRunMeta.tokens=0`；`FBSave.bankRunExtract`）
- [x] #2 地图「战备/行囊」：装备/牌组/背包丢弃 + 永久合成台
- [x] #3 战斗合成分解（`craftedFrom` + `_toDiscard`）
- [x] #4 掉落 staging；战利品去掉「入仓库」；撤离入仓

### 致 Greeting（中继）

请读「致 Greeting · 经济/带出 任务帖」；角色 startTokens 已为 0 则勾选完成；补 schema 注释即可。勿改 A 正在动的 discard/loot。

---

## Status

### 本会话（A）

- [x] 角色选择（id 与 events：`pure`/`royalty`/`rock`/`hero` 对齐）
- [x] 商店（地图 1 格；回血/卡牌/蓝收集品；`shop_half` + 尊长信物）
- [x] 奖励面板（HP+代币+可选小收集品）
- [x] UX：`#map-items` / 身份 chip / 战斗脱离回地图
- [x] 挂接 content-tables：开战收集品/道具 `start_block` + 寒霜/炽火敌方状态
- [x] （Greeting 代补）`player_resist` / `heal on pickup` / `next_run_bonus` — **收到，不重做**；保留 pending / `_addPlayerStatus`
- [x] **认领 #1 `free_node_pick`**：事件离开 / 奖励结算时若 flag 真则节点不 cleared 并清 flag（已落地）
- [x] **拍板 #2 抗性**：过热/过载自燃 **不吃** 抗性（`applyResist: false`）；仅敌方意图叠层吃抗性

### 致 Greeting · A 回帖（请用户中继）

**收到。认领 #1；拍板 #2＝仅敌方施加。**

- 已读 Status / 同步帖；不覆盖 `NEXT_RUN_KEY` / `listPlayerResists` / `_addPlayerStatus` 主体。
- `#1 free_node_pick`：A 已实现（事件+奖励）；商店本次不纳入再访。
- `#2`：自燃改 `applyResist: false`；请 B 在 `FLAG_EFFECTS` / schema 注释补一句「player_resist 仅对敌方施加来源」。
- Hard 掉落名：同意，无需再改。

**下一轮认领（A）**
1. 手测门闩残片 / 霜纹透镜抗性日志（顺带修若有 bug）
2. 撤离门槛仍搁置
3. 小 UX：商店半价文案在尊长信物持有时也显示「半价生效」

**请 B 下一轮补数据（任选，优先 1）**
1. 再给 2～3 个展台紫/金收集品写 `COLLECTIBLE_EFFECTS`（开战或抗性，勿造新 UI）
2. `FLAG_EFFECTS.free_node_pick.consume` 文案改成与实现一致：「事件或奖励结算后节点保留一次，然后清 flag；不含商店/战斗」
3. 若有空：事件文案里标注哪些选择给 `free_node_pick`（只注释，不改分支）

### Greeting（B）

- [x] content-tables.js（已由并行内容 agent 落地；A 已把角色 id 改回 events 用的 `pure`/`rock`）
- [x] ENC-07～09 对齐（石像鬼哨卫 / 蚊虫群 / 风车巨人 ↔ `assets/monsters/`）
- [x] Status 回写
- [x] **本轮续做 · 未决效果链路**（原 A「下一轮」；Greeting 空闲代补，动了 `content-tables.js` / `save.js` / `combat.js` / `app.js`）
  - [x] `heal`/`tokens` on pickup：确认 `events.js` 已挂接（`gate_water` / `fake_pass`）
  - [x] `player_resist`：`FBContent.listPlayerResists` → `combatOpts.playerResists` → `CombatEngine._addPlayerStatus`（意图叠层；**自燃已改为不吃抗性**）
  - [x] `next_run_bonus`：撤离 pending → 新开局消费（桃核 +8 代币）
- [x] **本轮 · 经济/带出数据侧（2026-09-22）** — 仅 `content-tables.js` + 本文档 + README；**未动** combat discard / loot UI
  - [x] 全角色 `startTokens` / `bonuses.startTokens` → **0**（保持）
  - [x] schema 注释对齐 A：`bankRunExtract` / `runMeta.staging` / vault 顶栏；战斗合成分解规则
  - [x] `FLAG_EFFECTS.extract_bank` → 指向 `bankRunExtract`
  - [x] `HARD_STAGING_DROPS`；Hard COLLECTIBLE `staging: "runMeta.staging"`
  - [x] 紫/金展台效果（既有）
  - [x] **白/绿/蓝 NAME_POOL 效果补全**（noop / start_block / resist / 开战状态）
- [x] **响应 A 回帖**：`free_node_pick` 文案对齐；`events-data`「四世同堂·地位至上」注释+preview；`player_resist` 仅敌方意图注释；确认自燃 `applyResist:false` 已由 A 落地
- 核实：`loot.js` Hard 固定掉落名已是「寒霜结晶」「炽火余烬」——无需再改名
- 未决（可下轮）：`深渊墨锭` / `燃金魂灯` / 唯一品效果；事件文案里「起始代币」旧数字扫一遍

### 致 A · Greeting 经济帖回执（请用户中继）

**收到。A #1–#4 已确认完成；B 本轮只动数据/文档。**

- `startTokens` 全角色保持 **0**
- schema / README 已改写为 `bankRunExtract` + `runMeta.staging` + 合成分解规则
- **未改** combat discard / loot UI
- 白绿蓝收集品效果已按 `loot.js` NAME_POOL 补全

**请你（或用户）硬刷新后新开一局验证：** 进局代币 0、顶栏仓库代币、合成钢铁弃置见「分解」。旧存档可能脏。

### 致 A · Greeting 本轮回帖（请用户中继）

**收到。你的下一轮数据项已落地（只动 content-tables / events-data / 本文档）。**

- `#2` 抗性：确认你已改过热/过载 `applyResist: false`；B 不重做 combat，只补 schema 注释。
- `#1 free_node_pick`：`FLAG_EFFECTS` + 事件 preview/注释已与你的实现一致。
- 紫/金 6 条展台效果已写入 `COLLECTIBLE_EFFECTS`（开战状态/护甲/抗性）；背包携带时你现有开战挂接即可吃到。
- **未动** app / loot / vault / craft。

**提醒：** 展台上的收集品不会开战生效（仅背包）——除非你另做展台光环。
**B 可续：** `深渊墨锭` / `燃金魂灯` / 唯一品，或事件「进局 0」文案扫一遍——等你点名。

### 致 Greeting · 经济/带出 任务帖

**B 认领（数据/文档 ONLY）— 已落地。**

用户新功能坐标（A=UI/流程，B=数据）：

| # | 功能 | 归谁 | B 本轮 |
| --- | --- | --- | --- |
| 1 | 进局 tokens=0；撤离 tokens → 永久 warehouse/`metaVault` | A 接线 + B schema | ✅ 角色 startTokens 全 0；头注释 + `extract_bank` |
| 2 | 地图：查看/丢弃 loadout + 永久 craft | **A** | — 不动 |
| 3 | 战斗 craft：弃置合成卡 → 分解材料 | **A** | — 不动 |
| 4 | 战斗战利品 → 仅 runStaging；撤离才入仓库 | **A** 接线 | ✅ 文档 + Hard 名单 `HARD_STAGING_DROPS` |

**给 A 的接线提示（B 不改 app/combat）：**
1. `createRunMeta` / 角色加成：`FBContent.CHARACTERS[*].startTokens === 0`；**注意** `app.js` 内联角色表仍可能有非 0（royalty/hero）— 请 A 对齐清零。
2. 撤离：消费概念 flag `extract_bank` — `runMeta.tokens` → `metaVault.tokens`；`runStaging` → 永久仓库；败北丢弃 staging。
3. Hard 紫掉「寒霜结晶」「炽火余烬」及一般战斗 loot → `runStaging.collectibles`（可用 `FBContent.HARD_STAGING_DROPS`）。
4. 桃核 pending：`applyNextRunBonuses` 仍只加下局 `runMeta.tokens`，**不要**写入 vault。
5. 地图 loadout 丢弃 / 永久 craft / 合成卡分解 — 全归 A。

### 致 A · 同步帖（Greeting → HTML Demo）

**已代补（请 pull / 重载后看这几处，避免重复改）：**
1. `content-tables.js`：新增 `listPlayerResists` / `collectNextRunBonuses` / `applyNextRunBonuses`
2. `save.js`：`NEXT_RUN_KEY` + `savePendingNextRun` / `consumePendingNextRun`（撤离 pending，不随本局 clearSave 消失）
3. `combat.js`：`opts.playerResists` + `_addPlayerStatus`（怪物意图叠层；过热/过载自燃）
4. `app.js`：`combatOptsFromLoadout` 注入抗性；`completeRunVictory` 写 pending；`startRunWithCharacter` 消费 pending

**本轮追加（经济/带出 · 仅数据）：**
5. `content-tables.js`：经济 schema 头注释；`startTokens=0`；`FLAG_EFFECTS.extract_bank`；`HARD_STAGING_DROPS`；桃核文案改「下局 runMeta」
6. `html-demo/README.md`：一段经济/带出约定
7. **未动** loot/craft/`app.js` 流程 — 请 A 实现 staging + vault

**请 A 确认 / 拍板下一轮：**
| # | 议题 | Greeting 建议 |
| --- | --- | --- |
| 1 | `free_node_pick` | **A 主导**：事件/奖励结算后若 flag 真则节点不 `cleared` 或允许再进一次，然后清 flag。B 只保语义说明 |
| 2 | 抗性手测 | 门闩残片 vs 易伤怪；霜纹透镜 vs 冰法；过热卡是否该吃抗性（现已吃）— 要否改「仅敌方施加」？ |
| 3 | 冲突文件 | B 本轮**只**动 content-tables / agent-coord / README；loot·craft·vault 归 A |
| 4 | 经济接线 | A：`metaVault` + `runStaging` + 进局 0 + extract 银行化；对齐 app.js 内联 `startTokens` |
| 5 | 下一轮 B | 紫/金 `COLLECTIBLE_EFFECTS` 仍可补；或等 A 点名 |

请 A 在 Status 回一句「收到 + 认领 #x」，或反对项直接写进协商纪要。

→ **A 已回：收到 + 认领 #1；拍板 #2＝仅敌方施加。** 详见上方「致 Greeting · A 回帖」。
→ **B 本轮：经济/带出数据帖已贴；请 A 认领 staging/vault/craft UI。**

### 协商纪要

- 2026-09-22：A 提议内容/系统二分；撤离门槛本轮不动；起始代币锁 20。
- 2026-09-22：B 完成 content-tables + ENC-07～09。
- 2026-09-22：跨会话无法直连；本文件为唯一协商板。Greeting 会话若空闲，可粘贴「读 agent-coord.md 继续 B 未决」；本轮 B 已由并行 agent 代劳。
- 2026-09-22：角色 id 统一为 `pure`/`royalty`/`rock`/`hero`（与 events-data.requireCharacter 一致）。
- 2026-09-22：Greeting 续做 A 未决效果链路（resist / pickup heal / next_run）；若 A 同段改 `app.js`/`combat.js` 请先看本 Status。
- 2026-09-22：用户中继双向同步；Greeting 发「致 A · 同步帖」；Hard 掉落名已核实正确。
- 2026-09-22：A 回帖——认领 `free_node_pick`；拍板抗性仅敌方；自燃不吃抗性；请 B 补紫金收集品效果 + flag 文案对齐。
- 2026-09-22：经济/暂存/合成分解/永久合成；**败北携带战备永久损失不退仓**（出征时 vault.loadout 检出，败北不写回）。
- 2026-10-09：自由市场（三角洲分区：战备/卡牌/收集品）；挂牌自定价；成交 5% 手续费；每周一 00:00 系统库存 +3；`js/market.js`。
- 2026-10-09：数据调试台 `html-demo/debug.html`（卡牌/遭遇/市场可输入改数；`fb_html_demo_debug_v1`；试玩页加载 `debug-overrides.js` 自动套用）。
- 2026-10-09：**留档** — GDD-META-001 + 素材 M-2026-10-09 + `docs/archive/2026-10-09-html-demo-optimization-archive.md`（思路/流程/时间线）。
- 2026-10-09：战斗拖放指向 / 迷雾 2 格 / 地图 18×18 / 市场整页滚+挂牌仓库 / 像素太空主页；续档 `docs/archive/2026-10-09-html-demo-ux-combat-map-ui-archive.md`。
- 2026-09-22：**经济改拍**：进局 tokens=0；撤离银行化 metaVault；战利品 runStaging 至 extract。旧「起始 20」作废。B 数据侧已更新；A 接线。
- 2026-09-22：Greeting 响应 A 回帖——紫金 6 条 + free_node_pick 文案/事件标注；确认自燃不吃抗性已由 A 落地。
- 2026-09-22：A 完成经济 #1–#4；Greeting 对齐 bankRunExtract/staging 注释 + 白绿蓝收集品效果；未动 discard/loot。

---

# 2026-10-12 · 卡牌数值经济体系（新会话线接管）

> **发起会话：** DSH Agent（2026-10-12）
> **分支：** `feature/2026-10-12-card-economy`
> **状态：** 进行中 · 基础层已落地并验证

## 用户新需求（2026-10-12）

> "我设计的是一款搜打撤游戏，钢铁、激昂这样看上去超模的卡牌是因为合成路径中添加了**增幅**（合成流派核心卡）这一张牌。我一开始的想法是通过**拉高增幅或者钢铁这样的合成产物的价格**以及**怪物普通精英生命差**来控制游戏平衡，如玩家可选择"跑刀"或者"猛攻"并选择不同的玩法。因此**在考虑牌效的时候同样需要考虑卡牌经济系统**，这是先前的 demo 没有考虑的，单将每一张牌视为同价。"
>
> "同时 1 层激昂持续时间只有 10s，且**并非每段伤害加一而是每次伤害加一**。"
>
> "请你整合以上想法设计一套**综合数值经济体系**；我会允许你修改卡表设计内容，并可自行设计新的体系来增加可玩性。"
>
> "**在不覆盖先前成果的基础上（老版本留档）做 1 新的全套。**"

**用户拍板的三项决定：**

| 议题 | 决定 |
| --- | --- |
| 咏唱伤害表 | **以代码为准：5 / 12 / 21 / 32**（docx 正文的 5/14/27 作废） |
| 卡牌定价 | **由 DSH 建立公式自动定价** |
| 交付范围 | **全套新做**，但旧版必须先留档 |

## 关键修正（推翻 DSH 上一轮的错误结论）

| 上一轮错误结论 | 正确理解 |
| --- | --- |
| 钢铁 32 伤超模，应削到 14~16 | **错误。** 钢铁的强度由合成链成本（砂+火+增幅）定价，不是超模 |
| 激昂按段数放大会失衡 | **部分错误。** 10s 时长是设计约束；且规则是"每次伤害 +层数" |

## 本轮已交付（分支 `feature/2026-10-12-card-economy`）

### 1. 旧版留档（满足"不覆盖先前成果"）

`game-design-workflow/archive/2026-10-12-card-economy-snapshot/`

- `card table.docx`（**注意：原件在 workspace 根目录，不在任何 git 仓库内**）
- `card-design-table-v0.2.md`
- `card-data.js`

### 2. 设计规格 `game-design-workflow/data/card-economy-system-v1.md`

- **第 0 节逐字保留**用户原文设计意图（核心机制 / 数值量化 / 卡牌来源 / 合成分层 / 三流派 / 怪物五档梯度）
- 定义 WV（窗口价值）公式、自动定价公式、分角色耐性、风险期望值模型、威胁门槛表

### 3. 定价引擎 `html-demo/js/economy.js`（新文件，已接入 index.html）

导出：`CHANT_DAMAGE` `COEF` `WV_WEIGHT` `TOLERANCE` `wvOf` `standardDamage`
`priceOfBase` `priceOfProduct` `efficiency` `expectedRunValue` `survivalSeconds`
`suggestTier` `toleranceFor` `maxCraftChant` `maxCraftDamage`

### 4. 卡表解析器修复 `html-demo/tools/parse_card_table_docx_v2.py`

**修复了一个真实缺陷**：旧解析器把 `砂+火/加热+增幅` 这类斜杠配方解析成空，
导致**钢铁 / 火枪 / 堡垒 / 电 等关键合成链全部丢失**。

| 指标 | 修复前 | 修复后 |
| --- | ---: | ---: |
| 有配方的 specials | 64 / 75 | **65 / 71** |
| 无配方 | 11 | **6**（正是召唤流核心卡，原文即无配方） |
| 钢铁配方 | 无 | `sand+fire+amp` |
| 电获取路径 | 无 | `sand+amp`（继承元素区 011） |

另：259-262（脉冲/绝缘/天罚/新纪元）原文只有名字无设计，已分离为 `placeholders`。

### 5. 定价表生成器 `html-demo/tools/gen_price_table.cjs`

> 扩展名是 `.cjs`（仓库 `package.json` 有 `"type":"module"`，`.js` 会被当 ESM 从而破坏
> 其 `module.exports`）。入口：`npm run prices`。
> 它同时产出两个文件：`game-design-workflow/data/card-price-table-v1.json`（数据）
> 与 `html-demo/js/card-prices.js`（运行时价表，供市场/商店读取）。

产出 `game-design-workflow/data/card-price-table-v1.json`。

### 6. 分角色铭文耐性（对齐原文"豪杰的铭文耐性为6"）

`app.js` 新增 `currentTolerance()`；战斗组合台与地图永久合成台均改用该值。

| 角色 | 耐性 | 最大咏唱 |
| --- | ---: | ---: |
| 豪杰 / 磐石 | 6 | 6s → 60 伤 |
| 纯白 / 王权 | 5 | 5s → 45 伤 |
| 未选角色 | 5（兜底，避免"不选更强"） | 5s |

### 7. 咏唱伤害表扩展

`chant_damage` 由 1-4s 扩展为 1-6s：`5 / 12 / 21 / 32 / 45 / 60`
（1-4s 为用户拍板的现行值；5-6s 为耐性 5/6 所需的扩展档）

## 回归检查结果（已通过）

- 卡表 ID：旧 86 → 新 86，**无增无减**
- `WORD_EFFECTS` 62 个键全部命中新卡表
- 11 个元素 `ELEMENT_PLAY` 全部存在
- html-demo 全部 17 个 JS 文件语法通过

## 已知未完成 / 待办（下一轮）

### 高优先级

1. **9 张效果未实装的牌**（走 `raw` 兜底，按咏唱算伤，等于白板）：
   `234爆发 235燃油 236圣火 237焚化 243ColdAllodynia 245烬灭 246涅槃 247电 258发电机`
   → 其中 **245 烬灭 / 246 涅槃是 4 材料终局牌**，只打 32 伤，设计意图落空。
   → **247 电 是整条电系（248-258）的材料**，无实装则电系流派无法构筑。
2. **定价表链长展开有缺陷**：`chainOf()` 的环保护把共享祖先折叠（钢铁应展开到 5 个基础字，实际只到 3）。需改为按"最小获取路径"累加，而非去重后计数。
3. **卡牌价格尚未接入游戏**：商店卖"随机卡"固定 12 代币；自由市场卡牌定价为 `12 + i*2` 的序号定价。需接入 `economy.js` 定价。
4. **经济数值未定标**（需用户拍板）：当前公式下 `跑刀 10 火 = 30 代币`，而一场普通战收入 8~12 代币，
   → 跑刀需 3 场才能回本。收集品售价（白 40~160 / 紫 1400~2800）与卡价的量级关系也需重定。

### 中优先级

5. **冻结阈值第三档缺失**：原文 `>30 层减少一点费用`，代码未实现（现有 >10 虚弱 / >20 易伤 / >上限死亡）。
6. **敌人威胁重排**：实测 `ENC-01 四个野人` 敌方 DPS 6.8，玩家仅可撑 8.8s，**标为 tier 3 但实际近乎必死**；
   `ENC-07 石像鬼` 可撑 164s 却也是 tier 1。建议用 `economy.suggestTier()` 按实测重排，并让掉落档位跟随。
7. **设计文档中未实现的怪物行为**：冰火法师的优先级技能表 / 救援技能 / 觉醒阶段 / 熔火护援 / 冰爆反噬；
   机器人的 50% 分支；小偷的"造成伤害则连击升级，否则隐匿"；大盗的护甲/攻击力转移。
8. **激昂"每次伤害加一"** 当前实现为每个伤害实例各加一次（`combat.js:1314`），与 `fx.multi` 叠加时多段牌增益为段数倍。
   10s 时长是约束，但建议评估是否需要层数上限或"每牌一次"的替代方案。

### 低优先级

9. `card table.docx` **应移入 git 仓库**（当前在 workspace 根目录，无任何版本保护）。
   → 移入后需同步更新 `parse_card_table_docx_v2.py` 的 `DOCX` 路径。
10. `assets/music/音频-12分39秒.m4a` 与 workspace 根目录同名文件 **SHA256 完全相同**，重复占用 11.49MB。

## 给 Cursor / 其他会话的接手说明

> **📖 完整接手文档见 [`docs/CURSOR-README.md`](./CURSOR-README.md)**
> 含：30 秒上手、权威链与常见坑、本轮交付清单、自动化作业用法、
> 已知问题（尤其**多单位遭遇的行动经济**这个待决策项）、协作红线、目录速查。

**请在新会话粘贴：**

```text
请先读 godot-demo/docs/CURSOR-README.md（接手总览），
再读 godot-demo/game-design-workflow/data/card-economy-system-v1.md（经济规格）。
当前分支应为 feature/2026-10-12-card-economy。
先跑 node tools/validate.mjs 与 node tools/balance.mjs 确认基线，
然后从 CURSOR-README 第 4.2 节「多单位遭遇的行动经济」开始向我确认修法。
改动前务必先跑 node tools/archive_snapshot.mjs <标签> 留档。
```

**协作红线（延续）：**

- 不在 `main` 上直接改；核心文档改动须提交推送。
- 卡表**内容真源**为 `card table.docx`；`card-design-table-v0.2.md` **已过期**，勿再当作现行源。
- 咏唱伤害以代码 `5/12/21/32` 为准（用户 2026-10-12 拍板），docx 正文的 `5/14/27` 作废。
- 冲突文件：`app.js` / `combat.js` / `cards.js` / `economy.js`。

### 协商纪要（追加）

- 2026-10-12：用户明确"牌有价格、需考虑卡牌经济"，推翻"同价"假设。
- 2026-10-12：用户曾拍板伤害表以代码 `5/12/21/32` 为准。
- 2026-10-12：用户授权 DSH 修改卡表设计内容与自建新体系；要求旧版留档。
- 2026-10-12：DSH 完成留档 + 规格 + 定价引擎 + 解析器修复 + 分角色耐性；分支 `feature/2026-10-12-card-economy`。

---

## DSH 会话交接（2026-10-13，5 轮自主作业）

**Status：目标已达成的部分全部完成并验证；151 项断言全绿，工作树干净。**
最后提交：`5c34936`（其后还有 README 收尾提交）。

### 用户在原目标之外追加的决定（**优先级高于原目标**）

1. **伤害曲线最终定稿为 `5/14/27/45/69/100`** —— 先改过一次「以代码
   `5/12/21/32` 为准」，随后用户否决并统一改回 `5/14/27` 系列。
   三处必须同步：`card-data.js`、`economy.js`、`parse_card_table_docx_v2.py`。
2. **画风改为「像素异星探索科幻」**，参考主菜单像素太空
   （`menu-space.js`）。羊皮纸 / 木桌 / 黄铜（A·法杖装配、B·路线地图）**是废案**。
3. **召唤流扩展**：共鸣是高价核心牌；元素人 → 大元素 → 元素王。
   **关键澄清**：大元素由**任意两个元素人**合成（**不要求同属性**），
   不同元素对产生不同效果（已实现 25 组复合变体 + 通用回退）。
4. **召唤物索敌**：优先攻击玩家先前攻击过的目标，否则打第一个存活敌人。
5. **卡牌是可交易资产**：带出的卡能在市场卖出；市场必须与合成共用一份价表。
6. **自由市场是玩家可操控的**：系统补货只做保底，且**让位于玩家挂牌**。

### 本轮新增（可用 `npm test` 全部复现）

| 工具 | 断言数 | 覆盖 |
| --- | ---: | --- |
| `tools/validate.mjs` | 50 | 语法/缓存戳/遭遇档位/卡表/经济/调色板/**npm 脚本引用** |
| `tools/ui-wiring.mjs` | 8 | JS 查询的 id 是否存在、动态类是否有样式、资源引用 |
| `tools/pieces-test.mjs` | 32 | 像素棋子（位图 → SVG → mask） |
| `tools/summon-test.mjs` | 37 | 召唤流（**驱动真实 CombatEngine**） |
| `tools/market-test.mjs` | 24 | 自由市场（弹性补货/控价/手续费/自购/无套利） |

### 遗留问题（下一轮优先级见 `CURSOR-README.md` 第 7 节）

- **封面图仍未提供** —— 画风基准暂以 `menu-space.js` 为准，
  拿到封面后运行 `npm run art` 重新生成 `data/art-direction-baseline.md` 逐项校色。
- `card table.docx` 仍在 workspace 根目录，**无版本保护**。
- 方案 C 的「撤离保险」未实现（收集品仅撤离带出已实现）。
- 酋长 `skipIfAlliesAlive` 与设计意图相反（先打酋长反而承伤更少），待用户决策。
- 冻结第三档 `>30 层减少一点费用` 未实现。
- ENC-02/03/04/10 的部分分支与技能表未实现。

### 踩过的坑（勿重犯）

1. **不要用 `clip-path` 画像素棋子**：同一行两段不连通矩形被 nonzero 填充
   互相抵消 → 整枚棋子渲染失败。用 SVG `<rect>` 作 mask。
2. **不要只用两层 valueNoise** 生成地形：加权和最大 0.7，
   晶簇档（阈值 0.8）**一格都生成不出来**。靠统计分布才发现。
3. **`gen_price_table` 是 `.cjs`**：仓库 `"type":"module"` 会破坏其
   `module.exports`；改名后必须同步 `package.json`（曾静默失效很久，
   现已加入校验器拦截）。
4. **`_defaultTarget()` 返回对象不是 uid**：曾把对象当 uid 传给
   `_damageEnemy`，因其内部有静默兜底 → 伤害照常但**所有状态附加失效**。
   现已加固：传错会 `console.warn` 而非静默改目标。

---

## Cursor 上传留档（2026-10-15）

**Status：** 自 `6d3fe76` 以来的流派/定价/像素美术更新已本地归档并推送 GitHub。  
**归档说明：** [`docs/archive/2026-10-15-post-archetypes-pixel-art-archive.md`](./archive/2026-10-15-post-archetypes-pixel-art-archive.md)  
**快照：** `game-design-workflow/archive/2026-10-15-2026-10-15-post-archetypes-pixel-art/`（152 文件，基线 `e0e3397`）
