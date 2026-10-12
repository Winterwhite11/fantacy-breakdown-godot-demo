/**
 * 内容/数据表：角色 · 事件道具效果 · 收集品战斗效果 · flag 约定
 * 供系统线挂接；本文件只声明描述符，不实现 UI / 战斗结算。
 *
 * === 经济 / 带出 schema（2026-09-22 · 与 A 接线对齐）===
 *   FBSave vault（loadVault / saveVault / bankRunExtract）
 *     { tokens }                    // 永久「仓库代币」，顶栏可见；仅撤离注入
 *   runMeta.tokens                  // 本局代币；开局恒 0（CHARACTERS[*].startTokens === 0）
 *                                   // 撤离：FBSave.bankRunExtract({ tokens: runMeta.tokens, loadout? })
 *                                   //       → vault.tokens += 本局；本局 tokens 不再入仓路径
 *   runMeta.staging                 // 局中暂存（代码字段名 staging；文档亦称 runStaging）
 *     { cards: [], collectibles: [] }
 *                                   // 战斗战利品 / Hard 紫掉 → staging；撤离才入永久仓
 *                                   // 败北：staging 与本局 tokens 丢弃、不入 vault
 *   规则摘要：
 *     - 进局代币 = 0；局中赚的 tokens 只活在 runMeta
 *     - 战利品 UI 无「入仓库」；本局暂存 → 撤离 bankRunExtract / 入仓
 *     - pending next_run（桃核）→ 下局 runMeta.tokens，**绝不**进 vault
 *     - 旧存档可能仍带旧代币：验证请硬刷新后「新开一局」
 *
 * === 战斗合成（A 已实现；B 只记规则）===
 *   战场合成产物带 craftedFrom；进弃牌时自动分解回材料（战斗日志「分解」）
 *   战斗合成 **不改** 永久牌组；永久合成台仅在地图「战备/行囊」
 *
 * Hard 掉落 · 撤离前仅 staging（不直入仓库）：
 *   「寒霜结晶」「炽火余烬」（ENC Hard「冰与火」固定紫掉）→ HARD_STAGING_DROPS
 *
 * 效果 schema（供 A 接线）：
 *   Item / Collectible effect descriptors:
 *     { type: "noop" }
 *     { type: "heal", amount }                    — 获得时或使用时回血
 *     { type: "start_block", amount }             — 下场战斗开始加护甲
 *     { type: "tokens", amount }                  — 立刻加减本局 runMeta.tokens（非 vault）
 *     { type: "shop_discount", mult }             — 与 shop_half 叠加时取更低价
 *     { type: "battle_start_enemy_status",
 *       status: "freeze"|"burn"|"poison"|"bleed"|"vulnerable"|"weak",
 *       amount, target: "all"|"random" }
 *     { type: "battle_start_player_status",
 *       status, amount }                          — 开战给自己叠状态（少用）
 *     { type: "player_resist",
 *       status: "freeze"|"burn"|..., reducedBy }  — 仅敌方意图叠层减免；过热/过载自燃不吃
 *     { type: "player_stat",
 *       key: "maxHpDelta"|"startBlock"|"startTokens", value }
 *     { type: "flag_echo", flag }                 — 持有时等价于某 runMeta.flag
 *     { type: "next_run", key, value }            — 下局开局加成（写入下局 runMeta，非 vault）
 *
 * FLAG 期望（runMeta.flags，A 接线 / B 填语义）：
 *   shop_half         — 商店价格 ×0.5
 *   free_node_pick    — 事件/奖励结算后节点保留再进一次，然后清 flag（不含商店/战斗）
 *   guide_extra_draw  — 下场战斗开始额外抽 1 张
 *   next_run_bonus    — 撤离后下局套用桃核等 next_run（下局 runMeta，非 vault）
 *   extract_bank      — 概念：撤离时 bankRunExtract + staging 入仓（A 已实现）
 *   （事件内部旗标如 miserables_helped / venice_rock_debt 仍由 events 自用，不进本表）
 */
(function () {
  const CHARACTERS = [
    {
      id: "pure",
      name: "纯白",
      blurb: "雪与留白的拓宇者。开局略增护甲；解锁「童年」等专属事件。",
      bonuses: { maxHpDelta: 0, startTokens: 0, startBlock: 3 },
      maxHpDelta: 0,
      startTokens: 0,
      startBlock: 3,
    },
    {
      id: "royalty",
      name: "王权",
      blurb: "交易与条件的行家。开局无代币（经济：进局 0）；解锁王权专属选项。",
      bonuses: { maxHpDelta: 0, startTokens: 0, startBlock: 0 },
      maxHpDelta: 0,
      startTokens: 0,
      startBlock: 0,
    },
    {
      id: "rock",
      name: "磐石",
      blurb: "沉稳如岩。最大生命略高；解锁磐石专属选项。",
      bonuses: { maxHpDelta: 10, startTokens: 0, startBlock: 0 },
      maxHpDelta: 10,
      startTokens: 0,
      startBlock: 0,
    },
    {
      id: "hero",
      name: "豪杰",
      blurb: "刀与胆色。生命与护甲各有一点起步；解锁豪杰专属选项。",
      bonuses: { maxHpDelta: 5, startTokens: 0, startBlock: 2 },
      maxHpDelta: 5,
      startTokens: 0,
      startBlock: 2,
    },
  ];

  /** 事件道具 id → 效果描述（events-data.js 中的 itemId） */
  const ITEM_EFFECTS = {
    refugee_trinket: {
      type: "start_block",
      amount: 4,
      desc: "流民遗物：下场战斗开始获得 4 护甲",
    },
    gate_shard: {
      type: "player_resist",
      status: "vulnerable",
      reducedBy: 1,
      desc: "门闩残片：受到易伤时少叠 1 层（仅敌方意图；过热/过载自燃不吃）",
    },
    gate_water: {
      type: "heal",
      amount: 8,
      when: "pickup",
      desc: "守门水囊：获得时回复 8 生命",
    },
    fake_pass: {
      type: "tokens",
      amount: 6,
      when: "pickup",
      desc: "空头城券：获得时本局 runMeta.tokens +6（非 vault）",
    },
    respect_token: {
      type: "flag_echo",
      flag: "shop_half",
      desc: "尊长信物：持有时商店半价（与 shop_half 同效）",
    },
    peach_pit: {
      type: "next_run",
      key: "startTokens",
      value: 8,
      desc: "桃核：下局 runMeta.tokens +8（pending next_run；不进 metaVault，需 next_run_bonus）",
    },
  };

  /**
   * Flag 语义说明（非可执行表；系统线按 key 读写 runMeta.flags）
   * @type {Record<string, { desc: string, consume?: string }>}
   */
  const FLAG_EFFECTS = {
    shop_half: {
      desc: "商店半价（价格 ×0.5）",
      consume: "建议进入商店并完成一次购买后清除",
    },
    free_node_pick: {
      desc: "下一次事件或奖励结算后节点保留再进一次，然后清 flag",
      consume: "事件离开或奖励结算后：节点保留一次并清 flag；不含商店/战斗",
    },
    guide_extra_draw: {
      desc: "下场战斗开始额外抽 1 张牌",
      consume: "战斗开始抽牌后清除",
    },
    next_run_bonus: {
      desc: "本局撤离成功后，下局套用桃核等 next_run 加成（加到下局 runMeta.tokens 等，不进 metaVault）",
      consume: "下局 createRunMeta / applyNextRunBonuses 应用后清除",
    },
    extract_bank: {
      desc: "概念：撤离成功时银行化——FBSave.bankRunExtract 把 runMeta.tokens → vault.tokens；runMeta.staging 并入永久仓",
      consume: "撤离结算一次；败北则 staging 与本局 tokens 丢弃、不入 vault",
    },
  };

  /**
   * 收集品效果：优先按 name 查找；也可在 makeCollectible 时写入 effectId
   * 寒霜结晶 / 炽火余烬 为 Hard「冰与火」固定掉落，必须有战斗相关效果
   * 掉落去向：局中进 runMeta.staging.collectibles；仅撤离 bankRunExtract / 入仓后进永久仓库（A）
   * player_resist：仅敌方意图叠层减免；过热/过载自燃不吃（combat applyResist:false）
   * 展台紫/金 + 白绿蓝：loot.js NAME_POOL；背包携带时开战生效
   */
  const COLLECTIBLE_EFFECTS = {
    寒霜结晶: {
      effectId: "frost_crystal",
      type: "battle_start_enemy_status",
      status: "freeze",
      amount: 3,
      target: "all",
      staging: "runMeta.staging",
      rarity: "purple",
      desc: "战斗开始：全体敌人冻结 +3 · Hard 掉落，撤离前仅 staging",
    },
    炽火余烬: {
      effectId: "ember_ash",
      type: "battle_start_enemy_status",
      status: "burn",
      amount: 4,
      target: "all",
      staging: "runMeta.staging",
      rarity: "purple",
      desc: "战斗开始：全体敌人燃烧 +4 · Hard 掉落，撤离前仅 staging",
    },
    // —— 展台紫 ——
    紫霆印匣: {
      effectId: "violet_casket",
      type: "battle_start_enemy_status",
      status: "vulnerable",
      amount: 1,
      target: "all",
      rarity: "purple",
      desc: "紫色展台：战斗开始全体敌人易伤 +1",
    },
    仪轨残卷: {
      effectId: "rite_scroll",
      type: "start_block",
      amount: 6,
      rarity: "purple",
      desc: "紫色展台：下场战斗开始 +6 护甲",
    },
    裂空羽管: {
      effectId: "rift_quill",
      type: "battle_start_enemy_status",
      status: "weak",
      amount: 1,
      target: "random",
      rarity: "purple",
      desc: "紫色展台：开战随机一名敌人虚弱 +1",
    },
    // —— 展台金 ——
    鎏金界碑: {
      effectId: "gilded_obelisk",
      type: "start_block",
      amount: 10,
      rarity: "gold",
      desc: "金色展台：下场战斗开始 +10 护甲",
    },
    日曜罗盘: {
      effectId: "solar_compass",
      type: "battle_start_enemy_status",
      status: "burn",
      amount: 3,
      target: "all",
      rarity: "gold",
      desc: "金色展台：战斗开始全体敌人燃烧 +3",
    },
    王权残玺: {
      effectId: "royal_seal_shard",
      type: "player_resist",
      status: "weak",
      reducedBy: 1,
      rarity: "gold",
      desc: "金色展台：受到虚弱时少叠 1 层（仅敌方意图）",
    },
    // —— 白 / 绿 / 蓝（loot.js NAME_POOL；背包携带开战生效）——
    锈蚀螺钉: {
      effectId: "rusty_screw",
      type: "noop",
      rarity: "white",
      desc: "白色：无战斗效果",
    },
    干涸墨瓶: {
      effectId: "dry_ink",
      type: "noop",
      rarity: "white",
      desc: "白色：无战斗效果",
    },
    碎陶片: {
      effectId: "shard_pottery",
      type: "start_block",
      amount: 1,
      rarity: "white",
      desc: "白色：下场战斗开始 +1 护甲",
    },
    旧绳结: {
      effectId: "old_knot",
      type: "noop",
      rarity: "white",
      desc: "白色：无战斗效果",
    },
    褪色标签: {
      effectId: "faded_tag",
      type: "noop",
      rarity: "white",
      desc: "白色：无战斗效果",
    },
    铭文碎晶: {
      effectId: "glyph_shard",
      type: "start_block",
      amount: 2,
      rarity: "green",
      desc: "绿色：下场战斗开始 +2 护甲",
    },
    青苔石核: {
      effectId: "moss_core",
      type: "start_block",
      amount: 3,
      rarity: "green",
      desc: "绿色：下场战斗开始 +3 护甲",
    },
    铜质符钉: {
      effectId: "copper_nail",
      type: "player_resist",
      status: "poison",
      reducedBy: 1,
      rarity: "green",
      desc: "绿色：受到中毒时少叠 1 层（仅敌方意图）",
    },
    潮痕贝壳: {
      effectId: "tide_shell",
      type: "battle_start_enemy_status",
      status: "freeze",
      amount: 1,
      target: "random",
      rarity: "green",
      desc: "绿色：开战随机一名敌人冻结 +1",
    },
    备用滤芯: {
      effectId: "spare_filter",
      type: "player_resist",
      status: "burn",
      reducedBy: 1,
      rarity: "green",
      desc: "绿色：受到燃烧时少叠 1 层（仅敌方意图）",
    },
    霜纹透镜: {
      effectId: "frost_lens",
      type: "player_resist",
      status: "freeze",
      reducedBy: 2,
      rarity: "blue",
      desc: "蓝色：受到冻结时少叠 2 层（仅敌方意图）",
    },
    深蓝拓片: {
      effectId: "deep_rubbing",
      type: "start_block",
      amount: 4,
      rarity: "blue",
      desc: "蓝色：下场战斗开始 +4 护甲",
    },
    静电场芯: {
      effectId: "static_core",
      type: "battle_start_enemy_status",
      status: "vulnerable",
      amount: 1,
      target: "random",
      rarity: "blue",
      desc: "蓝色：开战随机一名敌人易伤 +1",
    },
    星砂瓶: {
      effectId: "star_sand",
      type: "battle_start_enemy_status",
      status: "poison",
      amount: 2,
      target: "random",
      rarity: "blue",
      desc: "蓝色：开战随机一名敌人中毒 +2",
    },
    回响骨片: {
      effectId: "echo_bone",
      type: "player_resist",
      status: "bleed",
      reducedBy: 1,
      rarity: "blue",
      desc: "蓝色：受到流血时少叠 1 层（仅敌方意图）",
    },
  };

  /** Hard 固定掉落名：撤离前只进 runMeta.staging（供文档 / A 接线核对） */
  const HARD_STAGING_DROPS = ["寒霜结晶", "炽火余烬"];

  function getCharacter(id) {
    return CHARACTERS.find((c) => c.id === id) || null;
  }

  function getItemEffect(itemId) {
    return ITEM_EFFECTS[itemId] || { type: "noop" };
  }

  function getCollectibleEffect(collectible) {
    if (!collectible) return { type: "noop" };
    if (typeof collectible === "string") {
      return COLLECTIBLE_EFFECTS[collectible] || { type: "noop" };
    }
    const byName = COLLECTIBLE_EFFECTS[collectible.name];
    if (byName) return byName;
    if (collectible.effectId) {
      const hit = Object.values(COLLECTIBLE_EFFECTS).find(
        (e) => e.effectId === collectible.effectId
      );
      if (hit) return hit;
    }
    return { type: "noop" };
  }

  function applyCharacterBonuses(base, characterId) {
    const ch = getCharacter(characterId);
    const b = ch?.bonuses || {};
    return {
      maxHp: Math.max(1, (base.maxHp || 60) + (b.maxHpDelta || 0)),
      // 经济：角色 startTokens 恒 0；进局 tokens 仍以 base（通常 0）为准，桃核等 pending 另叠
      tokens: (base.tokens || 0) + (b.startTokens || 0),
      startBlock: (base.startBlock || 0) + (b.startBlock || 0),
    };
  }

  /** 合并道具 + 收集品上的 player_resist，供战斗 opts.playerResists */
  function listPlayerResists(runMeta, backpackItems) {
    const out = [];
    const push = (eff) => {
      if (eff?.type === "player_resist" && eff.status) {
        out.push({
          status: eff.status,
          reducedBy: Math.max(0, Number(eff.reducedBy) || 0),
          desc: eff.desc,
        });
      }
    };
    (runMeta?.inventory || []).forEach((it) => push(getItemEffect(it.id || it.itemId)));
    (backpackItems || []).forEach((c) => push(getCollectibleEffect(c)));
    return out;
  }

  /**
   * 撤离时：若 flags.next_run_bonus，汇总 inventory 上 type===next_run 的加成。
   * 返回 { startTokens, maxHpDelta, startBlock, notes[] } 或 null。
   * 注意：startTokens 只加到「下一局」runMeta.tokens，绝不写入 metaVault。
   */
  function collectNextRunBonuses(runMeta) {
    if (!runMeta?.flags?.next_run_bonus) return null;
    const acc = { startTokens: 0, maxHpDelta: 0, startBlock: 0, notes: [] };
    (runMeta.inventory || []).forEach((it) => {
      const eff = getItemEffect(it.id || it.itemId);
      if (eff?.type !== "next_run" || !eff.key) return;
      const v = Number(eff.value) || 0;
      if (eff.key === "startTokens") acc.startTokens += v;
      else if (eff.key === "maxHpDelta") acc.maxHpDelta += v;
      else if (eff.key === "startBlock") acc.startBlock += v;
      if (eff.desc) acc.notes.push(eff.desc);
    });
    if (!acc.startTokens && !acc.maxHpDelta && !acc.startBlock) return null;
    return acc;
  }

  /**
   * 把 pending next_run 加成叠到新建 runMeta / loadout 上（消费后由 save 侧清除）
   * pending.startTokens → 本局 runMeta.tokens（仍非 vault）
   */
  function applyNextRunBonuses(runMeta, loadout, pending) {
    if (!pending || !runMeta) return [];
    const notes = [];
    if (pending.startTokens) {
      runMeta.tokens = (runMeta.tokens || 0) + Number(pending.startTokens);
      notes.push(`下局加成：本局代币 +${pending.startTokens}（非 vault）`);
    }
    if (pending.maxHpDelta && loadout) {
      loadout.runHpBonus = (loadout.runHpBonus || 0) + Number(pending.maxHpDelta);
      notes.push(`下局加成：最大生命 +${pending.maxHpDelta}`);
    }
    if (pending.startBlock) {
      runMeta.flags = runMeta.flags || {};
      runMeta.flags.start_block_bonus =
        (Number(runMeta.flags.start_block_bonus) || 0) + Number(pending.startBlock);
      notes.push(`下局加成：开战护甲 +${pending.startBlock}`);
    }
    return notes;
  }

  window.FBContent = {
    CHARACTERS,
    ITEM_EFFECTS,
    FLAG_EFFECTS,
    COLLECTIBLE_EFFECTS,
    HARD_STAGING_DROPS,
    getCharacter,
    getItemEffect,
    getCollectibleEffect,
    applyCharacterBonuses,
    listPlayerResists,
    collectNextRunBonuses,
    applyNextRunBonuses,
  };
})();
