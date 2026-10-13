/**
 * 整理战备：仓库 / 携带牌组 / 装备 / 背包收集品
 * UI 参考炉石职业牌库切换 + 三角洲行动战备布局
 */
(function () {
  /**
   * 战备定义（equipment）。
   *
   * 字段约定（战斗侧由 combat.js 消费，见 app.js 的 combatOptsFromLoadout）：
   *   maxHpBonus        最大生命加成（护甲）
   *   startBlock        战斗开始护甲（头盔）
   *   hitInterval       每次「触发伤害」的间隔秒数（武器）
   *   hitDamage         每次触发的伤害（武器）
   *   hitDebuff         {key, amount} 每次触发附带的 debuff（武器）
   *   damageReduction   每次受到伤害的固定减免（头盔，先于护甲结算）
   *   debuffResist      {poison|burn|freeze|vulnerable: 层数减免}（护甲）
   *   capacity          收集品格数（背包）
   *   value             基础价值（代币）。**实际售价由 tools/gen_price_table.cjs
   *                     按「窗口价值」统一计算**，此处仅作兜底。
   *   recipe            合成配方：收集品 id 数组（走「搜打撤」掉落物合成）
   *   icon              像素图标 key（见 tools/gen_equip_icons.cjs）
   */
  const EQUIP_DEFS = {
    // ── 护甲 body：最大生命 + debuff 抗性 ──
    armor_simple: {
      id: "armor_simple",
      name: "简易护甲",
      slot: "body",
      value: 500,
      desc: "最大生命 +10",
      maxHpBonus: 10,
      icon: "armor_light",
    },
    armor_padded: {
      id: "armor_padded",
      name: "絮衬护甲",
      slot: "body",
      value: 1400,
      desc: "最大生命 +18 · 中毒/燃烧 各减免 1 层",
      maxHpBonus: 18,
      debuffResist: { poison: 1, burn: 1 },
      recipe: ["fiber_weave", "fiber_weave", "alloy_plate", "alloy_plate", "toxic_sac"],
      icon: "armor_padded",
    },
    armor_plate: {
      id: "armor_plate",
      name: "合金胸甲",
      slot: "body",
      value: 3600,
      desc: "最大生命 +30 · 中毒/燃烧/冻结/脆弱 各减免 1 层",
      maxHpBonus: 30,
      debuffResist: { poison: 1, burn: 1, freeze: 1, vulnerable: 1 },
      recipe: ["alloy_plate", "alloy_plate", "alloy_plate", "seal_rune", "crystal_lens"],
      icon: "armor_plate",
    },

    // ── 头盔 head：一次性护甲 + 受伤减免 ──
    helmet_simple: {
      id: "helmet_simple",
      name: "简易头盔",
      slot: "head",
      value: 300,
      desc: "战斗开始获得 3 点护甲",
      startBlock: 3,
      icon: "helmet_light",
    },
    helmet_visor: {
      id: "helmet_visor",
      name: "护目盔",
      slot: "head",
      value: 94,
      desc: "战斗开始获得 6 点护甲 · 每次受伤减免 1 点",
      startBlock: 6,
      damageReduction: 1,
      recipe: ["alloy_plate", "alloy_plate", "crystal_lens", "gunpowder", "gunpowder"],
      icon: "helmet_visor",
    },
    helmet_bulwark: {
      id: "helmet_bulwark",
      name: "壁垒盔",
      slot: "head",
      value: 200,
      desc: "战斗开始获得 10 点护甲 · 每次受伤减免 3 点 · 中毒减免 1 层",
      startBlock: 10,
      damageReduction: 3,
      debuffResist: { poison: 1 },
      recipe: ["alloy_plate", "alloy_plate", "alloy_plate", "seal_rune", "crystal_lens"],
      icon: "helmet_bulwark",
    },

    // ── 武器 weapon：可变化触发时间 / 伤害 / 附带 debuff ──
    // 平衡原则：**固定窗口（60s）内的总伤害应大致持平**，差异体现在
    // 「爆发（单次伤害）」与「附加 debuff」上 —— 这样每种武器都有存在理由。
    // 注意 60s 窗口有取整损失（floor(60/interval)），故间隔要与伤害搭配：
    //   速射手枪 4/6s   → 10 击 × 4 = 40   单次 4   —— 最快、最轻
    //   简易手枪 5/9s   →  6 击 × 5 = 30   单次 5
    //   淬毒弩   5/9s   →  6 击 × 5 = 30   单次 5  + 中毒1
    //   喷火铳   6/9s   →  6 击 × 6 = 36   单次 6  + 燃烧2
    //   霜刺枪   8/11s  →  5 击 × 8 = 40   单次 8  + 冻结1
    //   重铳     14/17s →  3 击 × 14 = 42  单次 14 —— 最慢、最重（跨阈值爆发）
    pistol_simple: {
      id: "pistol_simple",
      name: "简易手枪",
      slot: "weapon",
      value: 42,
      desc: "每 9 秒造成 5 点伤害",
      hitInterval: 9,
      hitDamage: 5,
      recipe: ["alloy_plate", "gunpowder", "gunpowder", "gunpowder", "primer"],
      icon: "gun_pistol",
    },
    rifle_rapid: {
      id: "rifle_rapid",
      name: "速射手枪",
      slot: "weapon",
      value: 86,
      desc: "每 6 秒造成 4 点伤害",
      hitInterval: 6,
      hitDamage: 4,
      recipe: ["alloy_plate", "gunpowder", "gunpowder", "gunpowder", "primer", "primer"],
      icon: "gun_rapid",
    },
    shotgun_heavy: {
      id: "shotgun_heavy",
      name: "重铳",
      slot: "weapon",
      value: 243,
      desc: "每 17 秒造成 14 点伤害",
      hitInterval: 17,
      hitDamage: 14,
      recipe: ["alloy_plate", "alloy_plate", "gunpowder", "gunpowder", "gunpowder", "seal_rune"],
      icon: "gun_heavy",
    },
    rifle_toxic: {
      id: "rifle_toxic",
      name: "淬毒弩",
      slot: "weapon",
      value: 62,
      desc: "每 9 秒造成 5 点伤害 · 每次附带 1 层中毒",
      hitInterval: 9,
      hitDamage: 5,
      hitDebuff: { key: "poison", amount: 1 },
      recipe: ["alloy_plate", "gunpowder", "gunpowder", "gunpowder", "toxic_sac"],
      icon: "gun_toxic",
    },
    burner: {
      id: "burner",
      name: "喷火铳",
      slot: "weapon",
      value: 90,
      desc: "每 9 秒造成 6 点伤害 · 每次附带 2 层燃烧",
      hitInterval: 9,
      hitDamage: 6,
      hitDebuff: { key: "burn", amount: 2 },
      recipe: ["alloy_plate", "gunpowder", "gunpowder", "gunpowder", "ember_core", "primer"],
      icon: "gun_burner",
    },
    cryo_lance: {
      id: "cryo_lance",
      name: "霜刺枪",
      slot: "weapon",
      value: 114,
      desc: "每 11 秒造成 8 点伤害 · 每次附带 1 层冻结",
      hitInterval: 11,
      hitDamage: 8,
      hitDebuff: { key: "freeze", amount: 1 },
      recipe: ["alloy_plate", "gunpowder", "gunpowder", "gunpowder", "gunpowder", "crystal_lens", "primer"],
      icon: "gun_cryo",
    },

    // ── 背包 backpack：携带收集品 ──
    backpack_simple: {
      id: "backpack_simple",
      name: "简易背包",
      slot: "backpack",
      value: 500,
      capacity: 2,
      desc: "收集品栏 2 格 · 与卡组无关",
      icon: "bag_small",
    },
    backpack_normal: {
      id: "backpack_normal",
      name: "普通背包",
      slot: "backpack",
      value: 1000,
      capacity: 5,
      desc: "收集品栏 5 格 · 与卡组无关",
      recipe: ["fiber_weave", "fiber_weave", "alloy_plate"],
      icon: "bag_mid",
    },
    backpack_raid: {
      id: "backpack_raid",
      name: "突袭背包",
      slot: "backpack",
      value: 2400,
      capacity: 9,
      desc: "收集品栏 9 格 · 与卡组无关",
      recipe: ["fiber_weave", "fiber_weave", "alloy_plate", "alloy_plate", "primer"],
      icon: "bag_large",
    },
  };

  const SLOT_ORDER = ["head", "body", "weapon", "backpack", "accessory"];
  const SLOT_LABEL = {
    head: "头盔",
    body: "护甲",
    weapon: "武器",
    backpack: "背包",
    accessory: "饰品",
  };

  const DECK_SIZE_MIN = 10;
  const DECK_SIZE_MAX = 30;

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function defaultDeckCounts() {
    return {
      fire: 3,
      water: 3,
      sand: 3,
      wood: 3,
      compress: 1,
      heat: 1,
      cool: 1,
      stack: 1,
      amp: 1,
    };
  }

  // ── 战备合成（2026-10-13）──
  //
  // 设计：用**局内掉落的收集品材料**合成战备，形成「搜打撤出货 → 合成变强」的闭环。
  // 路线合理性：配方所需材料的稀有度随成品档次上升，且材料总价值略高于成品定价的
  // 材料成本项 —— 因此「直接买成品」与「攒材料自己合」各有优劣（前者省事、后者省代币）。
  // 经济一致性由 tools/gen_price_table.cjs 统一校验（材料价值 ← 稀有度区间）。

  /** 该战备的合成配方（无配方则返回 null） */
  function equipRecipe(defId) {
    const d = EQUIP_DEFS[defId];
    return d?.recipe ? d.recipe.slice() : null;
  }

  /** 列出所有可合成的战备 */
  function craftableEquips() {
    return Object.values(EQUIP_DEFS).filter((d) => Array.isArray(d.recipe) && d.recipe.length);
  }

  /** 统计仓库里某材料的数量 */
  function materialCount(state, materialId) {
    return (state.collectStash || [])
      .filter((c) => c.materialId === materialId)
      .length;
  }

  /**
   * 检查能否合成：返回 { ok, missing:[{id,name,need,have}], recipe, def }
   */
  function canCraftEquip(state, defId) {
    const def = EQUIP_DEFS[defId];
    if (!def) return { ok: false, reason: "战备不存在" };
    const recipe = equipRecipe(defId);
    if (!recipe) return { ok: false, reason: "该战备没有合成配方" };
    const need = {};
    for (const id of recipe) need[id] = (need[id] || 0) + 1;
    const materials = window.FBLoot?.MATERIALS || {};
    const missing = [];
    for (const [id, n] of Object.entries(need)) {
      const have = materialCount(state, id);
      if (have < n) {
        missing.push({ id, name: materials[id]?.name || id, need: n, have });
      }
    }
    return { ok: missing.length === 0, missing, recipe, def, need };
  }

  /**
   * 合成战备：消耗收集品材料，产出装备实例（进 equipStash）。
   * @returns {{ok:boolean, item?, reason?, missing?}}
   */
  function craftEquip(state, defId) {
    const chk = canCraftEquip(state, defId);
    if (!chk.ok) return { ok: false, reason: chk.reason || "材料不足", missing: chk.missing };
    if (!Array.isArray(state.collectStash)) state.collectStash = [];
    // 按需消耗（每种材料从仓库里移除 n 件）
    for (const [id, n] of Object.entries(chk.need)) {
      let left = n;
      state.collectStash = state.collectStash.filter((c) => {
        if (left > 0 && c.materialId === id) { left--; return false; }
        return true;
      });
    }
    const item = makeEquipInstance(chk.def);
    state.equipStash = state.equipStash || [];
    state.equipStash.push(item);
    return { ok: true, item };
  }

  /** 合成所需材料的总市场价值（用于 UI 提示是否划算） */
  function recipeValue(defId) {
    const recipe = equipRecipe(defId);
    if (!recipe) return 0;
    const materials = window.FBLoot?.MATERIALS || {};
    return recipe.reduce((s, id) => s + (materials[id]?.value || 0), 0);
  }

  function makeEquipInstance(def) {
    const item = {
      uid: uid(def.id),
      defId: def.id,
      name: def.name,
      slot: def.slot,
      value: def.value,
      desc: def.desc,
    };
    if (def.capacity) {
      item.capacity = def.capacity;
      item.contents = [];
    }
    return item;
  }

  function createLoadoutState() {
    const cardStash = {};
    const deck = {};
    const defs = window.FBCards?.CARD_DEFS || {};
    Object.keys(defs).forEach((id) => {
      if (defs[id]?.type === "curse") return;
      cardStash[id] = 3;
      deck[id] = 0;
    });
    const start = defaultDeckCounts();
    Object.entries(start).forEach(([id, n]) => {
      if (!defs[id]) return;
      deck[id] = n;
    });

    const equipStash = [];
    ["armor_simple", "helmet_simple", "pistol_simple"].forEach((id) => {
      const def = EQUIP_DEFS[id];
      for (let i = 0; i < 3; i++) equipStash.push(makeEquipInstance(def));
    });
    // 背包：仓库各至少可供测试（简易 + 普通）
    ["backpack_simple", "backpack_normal"].forEach((id) => {
      const def = EQUIP_DEFS[id];
      equipStash.push(makeEquipInstance(def));
    });

    return {
      equipped: {
        head: null,
        body: null,
        weapon: null,
        backpack: null,
        accessory: null,
      },
      equipStash,
      cardStash,
      deck,
      /** 一般收集品仓库（白/绿/蓝及未上架高稀有） */
      collectStash: [],
      /** 三角洲式展台：独特珍藏 + 高稀有展墙 */
      collectShowcase: {
        unique: [null, null],
        premium: [null, null, null, null, null, null],
      },
    };
  }

  function emptyShowcase() {
    return {
      unique: [null, null],
      premium: [null, null, null, null, null, null],
    };
  }

  /** 旧存档/热更新：仓库若无背包则补简易+普通各 1 */
  function ensureTestBackpacks(state) {
    if (!state) return state;
    if (!Array.isArray(state.equipStash)) state.equipStash = [];
    if (!state.equipped) state.equipped = {};
    if (!Array.isArray(state.collectStash)) state.collectStash = [];
    if (!state.collectShowcase) state.collectShowcase = emptyShowcase();
    if (!Array.isArray(state.collectShowcase.unique)) state.collectShowcase.unique = [null, null];
    if (!Array.isArray(state.collectShowcase.premium)) {
      state.collectShowcase.premium = [null, null, null, null, null, null];
    }

    const hasBag = (id) =>
      state.equipped.backpack?.defId === id ||
      state.equipStash.some((it) => it.defId === id);

    ["backpack_simple", "backpack_normal"].forEach((id) => {
      if (hasBag(id)) return;
      const def = EQUIP_DEFS[id];
      if (def) state.equipStash.push(makeEquipInstance(def));
    });
    return state;
  }

  /** 补测试收集品（仅当仓库+展台皆空） */
  function ensureTestCollectibles(state) {
    ensureTestBackpacks(state);
    const inBag = backpackContents(state).length;
    const inShow =
      (state.collectShowcase.unique || []).filter(Boolean).length +
      (state.collectShowcase.premium || []).filter(Boolean).length;
    if ((state.collectStash || []).length + inBag + inShow > 0) return state;
    const seed = window.FBLoot?.createTestCollectibles?.() || [];
    // 高稀有自动摆上展台，其余进仓库
    seed.forEach((item) => {
      if (window.FBLoot?.isUniqueStandRarity?.(item.rarity)) {
        const slot = state.collectShowcase.unique.findIndex((x) => !x);
        if (slot >= 0) {
          state.collectShowcase.unique[slot] = item;
          return;
        }
      }
      if (window.FBLoot?.isShowcaseRarity?.(item.rarity)) {
        const slot = state.collectShowcase.premium.findIndex((x) => !x);
        if (slot >= 0) {
          state.collectShowcase.premium[slot] = item;
          return;
        }
      }
      state.collectStash.push(item);
    });
    return state;
  }

  function equipDef(item) {
    return item ? EQUIP_DEFS[item.defId] : null;
  }

  function deckTotal(state) {
    return Object.values(state.deck).reduce((a, b) => a + (b || 0), 0);
  }

  function stashCardTotal(state) {
    return Object.values(state.cardStash).reduce((a, b) => a + (b || 0), 0);
  }

  function maxHpBonus(state) {
    let bonus = 0;
    Object.values(state.equipped).forEach((it) => {
      const d = equipDef(it);
      if (d?.maxHpBonus) bonus += d.maxHpBonus;
    });
    return bonus;
  }

  function startBlockBonus(state) {
    let b = 0;
    Object.values(state.equipped).forEach((it) => {
      const d = equipDef(it);
      if (d?.startBlock) b += d.startBlock;
    });
    return b;
  }

  /**
   * 武器触发效果 → 战斗用 gearIntervals。
   * 兼容旧字段 `intervalDamage`（旧存档中的装备实例可能仍带该结构）。
   */
  function pistolEffects(state) {
    const list = [];
    Object.values(state.equipped || {}).forEach((it) => {
      const d = equipDef(it);
      if (!d) return;
      if (d.hitInterval && d.hitDamage != null) {
        list.push({
          every: d.hitInterval,
          damage: d.hitDamage,
          name: d.name,
          debuff: d.hitDebuff || null,
          pierce: !!d.hitPierce,
        });
      } else if (d.intervalDamage) {
        list.push({ ...d.intervalDamage, name: d.name });
      }
    });
    return list;
  }

  /** 头盔的「每次受伤固定减免」合计（同部位只有一件，多件时取最大以避免叠加过强） */
  function damageReductionBonus(state) {
    let best = 0;
    Object.values(state.equipped || {}).forEach((it) => {
      const d = equipDef(it);
      if (d?.damageReduction) best = Math.max(best, d.damageReduction);
    });
    return best;
  }

  /** 护甲的 debuff 抗性合计（各 debuff 分别累加） */
  function debuffResistBonus(state) {
    const out = {};
    Object.values(state.equipped || {}).forEach((it) => {
      const d = equipDef(it);
      if (!d?.debuffResist) return;
      for (const [k, v] of Object.entries(d.debuffResist)) {
        out[k] = (out[k] || 0) + (Number(v) || 0);
      }
    });
    return out;
  }

  /**
   * 装备的「等效窗口价值」——与卡牌同源的定价输入（供 gen_price_table 使用）。
   *
   * 【方法论】卡牌是一次性的，装备是**持续性**的，所以不能直接按「每 5 秒窗口」折算
   * （重铳 16 秒一发会只算出 4.4）。这里统一按「**一场战斗的产出/减免总量**」折算，
   * 基准战斗时长 RUN_SECONDS = 60s：
   *
   *   武器：60s 内的总伤害（含 debuff 的等效伤害）
   *   护甲：等效生命 = maxHpBonus × 承受系数（护甲不制造输出，权重低于攻击）
   *   头盔：一次性护甲 + 每次受伤减免 × 预估受击次数
   *   背包：容量 × 每格折算（不参与战斗，价值最低）
   *
   * 结果是一个与卡牌 WV 同量级的数（约 2~30），可直接喂给同一套定价公式。
   */
  const RUN_SECONDS = 60;
  /** 一场战斗的预估受击次数（用于把「每次减免」折算成总量） */
  const HITS_PER_RUN = 12;

  function equipWv(d) {
    if (!d) return 0;
    const W = window.FBEconomy?.WV_WEIGHT || { damage: 1, block: 0.7, poison: 0.8, burn: 0.5, freeze: 0.4 };
    let wv = 0;

    // 武器：一场的**总伤害**，外加**爆发加成**
    //   （单次伤害能跨过敌人血量阈值 = 直接少一次行动，价值高于等量持续输出）
    if (d.hitInterval && d.hitDamage != null) {
      const hits = RUN_SECONDS / Math.max(1, Number(d.hitInterval));
      const total = Number(d.hitDamage) * hits;
      const burst = Number(d.hitDamage);
      wv += (total + burst * 0.5) * W.damage;
      if (d.hitDebuff) {
        wv += (Number(d.hitDebuff.amount) || 0) * hits * (W[d.hitDebuff.key] ?? 0.5);
      }
    }

    // 护甲：最大生命（按 0.5 折算——不制造输出，且只在长局中体现）
    if (d.maxHpBonus) wv += Number(d.maxHpBonus) * 0.5;
    if (d.debuffResist) {
      for (const [k, v] of Object.entries(d.debuffResist)) {
        wv += (Number(v) || 0) * (W[k] ?? 0.5) * 3;
      }
    }

    // 头盔：开局护甲 + 每场总减免
    if (d.startBlock) wv += Number(d.startBlock) * W.block;
    if (d.damageReduction) wv += Number(d.damageReduction) * HITS_PER_RUN;

    // 背包：每格 ≈ 一次小额产出的期望（不参与战斗，权重最低）
    if (d.capacity) wv += Number(d.capacity) * 1.2;

    return Math.round(wv * 100) / 100;
  }

  function equippedBackpack(state) {
    const bag = state.equipped?.backpack || null;
    if (!bag) return null;
    const def = equipDef(bag);
    if (def?.capacity != null) {
      bag.capacity = def.capacity;
      if (!Array.isArray(bag.contents)) bag.contents = [];
    }
    return bag;
  }

  function backpackCapacity(state) {
    const bag = equippedBackpack(state);
    if (!bag) return 0;
    return bag.capacity || equipDef(bag)?.capacity || 0;
  }

  function backpackContents(state) {
    const bag = equippedBackpack(state);
    return bag?.contents || [];
  }

  function backpackFreeSlots(state) {
    return Math.max(0, backpackCapacity(state) - backpackContents(state).length);
  }

  function collectibleCount(state) {
    const inBag = backpackContents(state).length;
    const stash = (state.collectStash || []).length;
    let inUnequippedBags = 0;
    (state.equipStash || []).forEach((it) => {
      if (it.slot === "backpack" && Array.isArray(it.contents)) inUnequippedBags += it.contents.length;
    });
    const show = state.collectShowcase || emptyShowcase();
    const onShow =
      (show.unique || []).filter(Boolean).length +
      (show.premium || []).filter(Boolean).length;
    return inBag + stash + inUnequippedBags + onShow;
  }

  function allCollectibles(state) {
    const list = [...(state.collectStash || [])];
    backpackContents(state).forEach((c) => list.push(c));
    const show = state.collectShowcase || emptyShowcase();
    (show.unique || []).forEach((c) => { if (c) list.push(c); });
    (show.premium || []).forEach((c) => { if (c) list.push(c); });
    (state.equipStash || []).forEach((it) => {
      if (it.slot === "backpack" && Array.isArray(it.contents)) {
        it.contents.forEach((c) => list.push(c));
      }
    });
    return list;
  }

  /** 仓库 → 展台 */
  function putCollectibleOnShowcase(state, stashIndex, zone, slotIndex) {
    ensureTestBackpacks(state);
    const item = state.collectStash[stashIndex];
    if (!item) return { ok: false, reason: "无效收集品" };
    const show = state.collectShowcase;
    if (zone === "unique") {
      if (!window.FBLoot?.isUniqueStandRarity?.(item.rarity)) {
        return { ok: false, reason: "独特展台仅可放置唯一收集品" };
      }
      if (slotIndex < 0 || slotIndex >= show.unique.length) return { ok: false, reason: "无效展位" };
      if (show.unique[slotIndex]) return { ok: false, reason: "展位已占用" };
      state.collectStash.splice(stashIndex, 1);
      show.unique[slotIndex] = item;
      return { ok: true, item };
    }
    if (zone === "premium") {
      if (!window.FBLoot?.isShowcaseRarity?.(item.rarity)) {
        return { ok: false, reason: "高稀有展台仅可放置紫 / 金 / 唯一" };
      }
      if (slotIndex < 0 || slotIndex >= show.premium.length) return { ok: false, reason: "无效展位" };
      if (show.premium[slotIndex]) return { ok: false, reason: "展位已占用" };
      state.collectStash.splice(stashIndex, 1);
      show.premium[slotIndex] = item;
      return { ok: true, item };
    }
    return { ok: false, reason: "未知展区" };
  }

  /** 展台 → 仓库 */
  function takeCollectibleFromShowcase(state, zone, slotIndex) {
    ensureTestBackpacks(state);
    const show = state.collectShowcase;
    const row = zone === "unique" ? show.unique : show.premium;
    if (!row || slotIndex < 0 || slotIndex >= row.length || !row[slotIndex]) {
      return { ok: false, reason: "空展位" };
    }
    const item = row[slotIndex];
    row[slotIndex] = null;
    state.collectStash.push(item);
    return { ok: true, item };
  }

  /** 单击高稀有：自动找空展位上架；一般稀有进背包逻辑仍走 putCollectibleFromStash */
  function autoDisplayFromStash(state, stashIndex) {
    const item = state.collectStash[stashIndex];
    if (!item) return { ok: false, reason: "无效收集品" };
    ensureTestBackpacks(state);
    if (window.FBLoot?.isUniqueStandRarity?.(item.rarity)) {
      const i = state.collectShowcase.unique.findIndex((x) => !x);
      if (i >= 0) return putCollectibleOnShowcase(state, stashIndex, "unique", i);
    }
    if (window.FBLoot?.isShowcaseRarity?.(item.rarity)) {
      const i = state.collectShowcase.premium.findIndex((x) => !x);
      if (i >= 0) return putCollectibleOnShowcase(state, stashIndex, "premium", i);
      // 独特也可进高稀有墙
      return { ok: false, reason: "高稀有展台已满" };
    }
    return { ok: false, reason: "该稀有度不上展台，请装入背包或留在仓库" };
  }

  /** 装备：仓库 → 槽位（替换则旧装备回仓库；背包内容随背包走） */
  function equipFromStash(state, stashIndex) {
    const item = state.equipStash[stashIndex];
    if (!item) return { ok: false, reason: "无效装备" };
    const slot = item.slot;
    if (!SLOT_ORDER.includes(slot)) return { ok: false, reason: "无对应槽位" };
    const prev = state.equipped[slot];
    state.equipStash.splice(stashIndex, 1);
    if (prev) state.equipStash.push(prev);
    state.equipped[slot] = item;
    return { ok: true, item, replaced: prev };
  }

  function unequipSlot(state, slot) {
    const item = state.equipped[slot];
    if (!item) return { ok: false, reason: "槽位为空" };
    state.equipped[slot] = null;
    state.equipStash.push(item);
    return { ok: true, item };
  }

  function toggleEquipByUid(state, itemUid) {
    for (const slot of SLOT_ORDER) {
      if (state.equipped[slot]?.uid === itemUid) return unequipSlot(state, slot);
    }
    const idx = state.equipStash.findIndex((x) => x.uid === itemUid);
    if (idx >= 0) return equipFromStash(state, idx);
    return { ok: false, reason: "未找到装备" };
  }

  /** 收集品仓库 → 已装备背包空位 */
  function putCollectibleFromStash(state, stashIndex) {
    const bag = equippedBackpack(state);
    if (!bag) return { ok: false, reason: "未装备背包" };
    if (!Array.isArray(bag.contents)) bag.contents = [];
    const cap = bag.capacity || equipDef(bag)?.capacity || 0;
    if (bag.contents.length >= cap) return { ok: false, reason: "背包已满" };
    const item = state.collectStash[stashIndex];
    if (!item) return { ok: false, reason: "无效收集品" };
    state.collectStash.splice(stashIndex, 1);
    bag.contents.push(item);
    return { ok: true, item };
  }

  /** 背包格 → 收集品仓库 */
  function takeCollectibleFromBag(state, bagIndex) {
    const bag = equippedBackpack(state);
    if (!bag?.contents?.[bagIndex]) return { ok: false, reason: "空格" };
    const [item] = bag.contents.splice(bagIndex, 1);
    state.collectStash.push(item);
    return { ok: true, item };
  }

  /**
   * 尝试将收集品装入背包；满则返回 needSwap
   * @returns {{ ok, placed, needSwap, noBag, curse?, item }}
   */
  function tryCarryCollectible(state, collectible) {
    const bag = equippedBackpack(state);
    if (!bag) {
      return { ok: false, noBag: true, item: collectible };
    }
    if (!Array.isArray(bag.contents)) bag.contents = [];
    const cap = bag.capacity || equipDef(bag)?.capacity || 0;
    if (bag.contents.length < cap) {
      bag.contents.push(collectible);
      return { ok: true, placed: true, item: collectible };
    }
    return { ok: false, needSwap: true, item: collectible, bag };
  }

  /** 用新收集品替换背包某一格；被替换者进仓库或变为诅咒 */
  function swapBackpackSlot(state, bagIndex, incoming, displacedToCurse) {
    const bag = equippedBackpack(state);
    if (!bag?.contents || bagIndex < 0 || bagIndex >= bag.contents.length) {
      return { ok: false, reason: "无效格" };
    }
    const old = bag.contents[bagIndex];
    bag.contents[bagIndex] = incoming;
    if (displacedToCurse) {
      const curseId = addCurseToDeck(state, old);
      return { ok: true, displaced: old, curseId };
    }
    state.collectStash.push(old);
    return { ok: true, displaced: old };
  }

  function addCurseToDeck(state, collectible) {
    const id = `curse_${collectible.rarity || "white"}_${collectible.uid}`;
    const name = collectible.name || "收集品";
    window.FBCards.ensureCurseDef(id, name);
    state.deck[id] = (state.deck[id] || 0) + 1;
    return id;
  }

  /** 无法装入背包时：收集品以诅咒牌形式占用牌组 */
  function forceCollectibleAsCurse(state, collectible) {
    const curseId = addCurseToDeck(state, collectible);
    return { ok: true, curseId, item: collectible };
  }

  function addToDeck(state, cardId) {
    if (!window.FBCards.CARD_DEFS[cardId] && !window.FBCards.PUNCT_DEFS?.[cardId]) {
      return { ok: false, reason: "未知卡牌" };
    }
    if (String(cardId).startsWith("curse_")) {
      return { ok: false, reason: "诅咒牌不可从仓库加入" };
    }
    if ((state.cardStash[cardId] || 0) <= 0) return { ok: false, reason: "仓库中没有该卡" };
    if (deckTotal(state) >= DECK_SIZE_MAX) return { ok: false, reason: `牌组上限 ${DECK_SIZE_MAX}` };
    state.cardStash[cardId] -= 1;
    state.deck[cardId] = (state.deck[cardId] || 0) + 1;
    return { ok: true };
  }

  /** 战后奖励：直接加入卡组（仓库无库存要求） */
  function addRewardCardToDeck(state, cardId) {
    if (!window.FBCards.CARD_DEFS[cardId]) return { ok: false, reason: "未知卡牌" };
    if (deckTotal(state) >= DECK_SIZE_MAX) {
      state.cardStash[cardId] = (state.cardStash[cardId] || 0) + 1;
      return { ok: true, toStash: true };
    }
    state.deck[cardId] = (state.deck[cardId] || 0) + 1;
    return { ok: true };
  }

  function addRewardCardToStash(state, cardId) {
    if (!window.FBCards.CARD_DEFS[cardId]) return { ok: false, reason: "未知卡牌" };
    state.cardStash[cardId] = (state.cardStash[cardId] || 0) + 1;
    return { ok: true };
  }

  function removeFromDeck(state, cardId) {
    if ((state.deck[cardId] || 0) <= 0) return { ok: false, reason: "牌组中没有该卡" };
    state.deck[cardId] -= 1;
    if (state.deck[cardId] <= 0) delete state.deck[cardId];
    if (String(cardId).startsWith("curse_")) {
      return { ok: true, destroyed: true };
    }
    state.cardStash[cardId] = (state.cardStash[cardId] || 0) + 1;
    return { ok: true };
  }

  function buildBattleDeck(state) {
    const ids = [];
    Object.entries(state.deck).forEach(([id, n]) => {
      for (let i = 0; i < n; i++) ids.push(id);
    });
    while (ids.length < DECK_SIZE_MIN) {
      ids.push(window.FBCards.randomPunctId());
    }
    return window.FBCards.shuffle(ids.map((id) => window.FBCards.makeInstance(id)));
  }

  function baseMaxHp() {
    return 60;
  }

  function effectiveMaxHp(state) {
    return baseMaxHp() + maxHpBonus(state);
  }

  window.FBLoadout = {
    EQUIP_DEFS,
    SLOT_ORDER,
    SLOT_LABEL,
    DECK_SIZE_MIN,
    DECK_SIZE_MAX,
    createLoadoutState,
    ensureTestBackpacks,
    ensureTestCollectibles,
    makeEquipInstance,
    emptyShowcase,
    allCollectibles,
    putCollectibleOnShowcase,
    takeCollectibleFromShowcase,
    autoDisplayFromStash,
    equipDef,
    deckTotal,
    stashCardTotal,
    maxHpBonus,
    startBlockBonus,
    pistolEffects,
    damageReductionBonus,
    debuffResistBonus,
    equipWv,
    // 战备合成
    EQUIP_DEFS,
    equipRecipe,
    craftableEquips,
    materialCount,
    canCraftEquip,
    craftEquip,
    recipeValue,
    equipFromStash,
    unequipSlot,
    toggleEquipByUid,
    equippedBackpack,
    backpackCapacity,
    backpackContents,
    backpackFreeSlots,
    collectibleCount,
    putCollectibleFromStash,
    takeCollectibleFromBag,
    tryCarryCollectible,
    swapBackpackSlot,
    addCurseToDeck,
    forceCollectibleAsCurse,
    addToDeck,
    addRewardCardToDeck,
    addRewardCardToStash,
    removeFromDeck,
    buildBattleDeck,
    baseMaxHp,
    effectiveMaxHp,
    defaultDeckCounts,
  };
})();
