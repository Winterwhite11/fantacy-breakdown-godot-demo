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
- 2026-09-22：**经济改拍**：进局 tokens=0；撤离银行化 metaVault；战利品 runStaging 至 extract。旧「起始 20」作废。B 数据侧已更新；A 接线。
- 2026-09-22：Greeting 响应 A 回帖——紫金 6 条 + free_node_pick 文案/事件标注；确认自燃不吃抗性已由 A 落地。
- 2026-09-22：A 完成经济 #1–#4；Greeting 对齐 bankRunExtract/staging 注释 + 白绿蓝收集品效果；未动 discard/loot。
