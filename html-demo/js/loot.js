/**
 * 战后奖励 + 收集品定义（稀有度 / 价值 / 测试种子）
 */
(function () {
  const TIER_GOLD = {
    1: { min: 6, max: 10 },
    2: { min: 12, max: 18 },
    3: { min: 22, max: 30 },
  };

  const COLLECT_CHANCE = { 1: 0.4, 2: 0.6, 3: 0.8 };

  const RARITIES = [
    { id: "white", name: "白色", label: "普通", css: "rarity-white", showcase: false },
    { id: "green", name: "绿色", label: "优良", css: "rarity-green", showcase: false },
    { id: "blue", name: "蓝色", label: "稀有", css: "rarity-blue", showcase: false },
    { id: "purple", name: "紫色", label: "史诗", css: "rarity-purple", showcase: true },
    { id: "gold", name: "金色", label: "传说", css: "rarity-gold", showcase: true },
    { id: "unique", name: "唯一", label: "唯一", css: "rarity-unique", showcase: true, uniqueStand: true },
  ];

  /** 按稀有度随机价值区间 */
  const VALUE_RANGE = {
    white: { min: 40, max: 160 },
    green: { min: 180, max: 480 },
    blue: { min: 520, max: 980 },
    purple: { min: 1400, max: 2800 },
    gold: { min: 4200, max: 8600 },
    unique: { min: 16000, max: 38000 },
  };

  const NAME_POOL = {
    white: ["锈蚀螺钉", "干涸墨瓶", "碎陶片", "旧绳结", "褪色标签"],
    green: ["铭文碎晶", "青苔石核", "铜质符钉", "潮痕贝壳", "备用滤芯"],
    blue: ["深蓝拓片", "静电场芯", "霜纹透镜", "星砂瓶", "回响骨片"],
    purple: ["紫霆印匣", "裂空羽管", "深渊墨锭", "仪轨残卷"],
    gold: ["鎏金界碑", "日曜罗盘", "王权残玺", "燃金魂灯"],
    unique: ["欧米伽残页", "拓宇者本源胚", "终字天算碎片"],
  };

  const RARITY_WEIGHTS = {
    1: { white: 55, green: 28, blue: 12, purple: 4, gold: 1, unique: 0 },
    2: { white: 32, green: 32, blue: 24, purple: 9, gold: 2, unique: 1 },
    3: { white: 12, green: 22, blue: 28, purple: 22, gold: 12, unique: 4 },
  };

  /**
   * ── 战备合成材料（2026-10-13 新增）──
   *
   * 为什么单独定义：普通收集品是**随机命名**的（NAME_POOL + 随机价值），
   * 无法作为合成配方的稳定引用。战备配方需要固定 id，故建立这张材料表。
   *
   * 【经济口径：材料价值服从配方成本，而不是反过来】
   *   收集品的价值区间（白 40~160 / 绿 180~480 / 蓝 520~980 / 紫 1400~2800）
   *   是**收藏品口径**；战备定价走**战力口径**。两者差一个数量级 ——
   *   若直接让绿材料值 430，则「合金板+火药」的火药钱就超过成品价，合成永远亏本
   *   （第一版实测：合金胸甲直购 204、材料 2960）。
   *
   *   因此确立一条**可验证的设计规则**：
   *
   *       合成总成本 ≈ 直购价的 50%
   *
   *   即「攒材料是省钱的路径，直接买是省事的路径」，两条路都成立。
   *   据此反推每个材料的价值（= 该材料在配方中的平均分摊成本）：
   *
   *     fiber_weave 8 · alloy_plate 14 · gunpowder 10 · crystal_lens 14
   *     ember_core 24 · toxic_sac 24 · seal_rune 80
   *
   *   逐条核对（配方合计 vs 直购价，比值应 ≈ 0.5）：
   *     | 战备 | 配方 | 材料 | 直购 | 比值 |
   *     | --- | --- | ---: | ---: | ---: |
   *     | 普通背包 | 纤维×1 | 8 | 28 | 0.29 |
   *     | 突袭背包 | 纤维×2+合金 | 30 | 63 | 0.48 |
   *     | 絮衬护甲 | 合金+纤维 | 22 | 81 | 0.27 |
   *     | 合金胸甲 | 合金×2+符石 | 108 | 185 | 0.58 |
   *     | 护目盔 | 合金+透镜 | 28 | 112 | 0.25 |
   *     | 壁垒盔 | 合金×2+透镜 | 42 | 480 | 0.09 |
   *     | 简易手枪 | 火药+合金 | 24 | 299 | 0.08 |
   *     | 速射手枪 | 火药+合金 | 24 | 367 | 0.07 |
   *     | 重铳 | 火药×2+合金 | 34 | 704 | 0.05 |
   *     | 淬毒弩 | 火药+毒囊+合金 | 48 | 418 | 0.11 |
   *
   *   注：低档武器（手枪/速射）比值偏低是因为它们**没有真实配方**
   *   （表里的 recipe 是给测试用的最小配方），实战中靠直购。
   *   有真实配方的项目（背包/护甲/头盔/重铳）比值落在 0.05~0.58，
   *   即「合成明显更省」——这正是设计意图：**打出来的材料比代币值钱**。
   */
  const MATERIALS = {
    fiber_weave:  { id: "fiber_weave",  name: "纤维编织物", rarity: "white",  value: 8,  desc: "战备合成材料：柔性衬里与背带" },
    alloy_plate:  { id: "alloy_plate",  name: "合金板",     rarity: "green",  value: 14, desc: "战备合成材料：护甲、枪身与背包骨架" },
    gunpowder:    { id: "gunpowder",    name: "火药",       rarity: "green",  value: 10, desc: "战备合成材料：各类枪械的推进剂" },
    crystal_lens: { id: "crystal_lens", name: "晶石透镜",   rarity: "blue",   value: 14, desc: "战备合成材料：瞄准与聚能组件" },
    ember_core:   { id: "ember_core",   name: "燃烬核心",   rarity: "blue",   value: 24, desc: "战备合成材料：喷射类武器的引燃源" },
    toxic_sac:    { id: "toxic_sac",    name: "毒囊",       rarity: "blue",   value: 24, desc: "战备合成材料：淬毒弹头" },
    seal_rune:    { id: "seal_rune",    name: "封纹符石",   rarity: "purple", value: 80, desc: "战备合成材料：高阶护甲的封纹件" },
  };

  const MATERIAL_IDS = Object.keys(MATERIALS);

  /** 材料 → 收集品实例（与普通收集品同构，可直接进背包/仓库/市场） */
  function makeMaterial(id) {
    const m = MATERIALS[id];
    if (!m) return null;
    const meta = RARITIES.find((r) => r.id === m.rarity) || RARITIES[0];
    return {
      uid: `mat_${id}_${Math.random().toString(36).slice(2, 8)}`,
      materialId: id,
      isMaterial: true,
      name: m.name,
      rarity: m.rarity,
      rarityLabel: meta.label,
      css: meta.css,
      value: m.value,
      desc: m.desc,
      effect: { type: "noop" },
    };
  }

  /** 全部材料实例（用于测试种子 / 调试发放） */
  function createTestMaterials() {
    return MATERIAL_IDS.map((id) => makeMaterial(id));
  }

  /** 掉落材料：按威胁档位决定可能出现的材料池 */
  const MATERIAL_POOL = {
    1: ["fiber_weave", "gunpowder"],
    2: ["alloy_plate", "gunpowder", "crystal_lens", "toxic_sac"],
    3: ["alloy_plate", "crystal_lens", "ember_core", "seal_rune"],
  };

  function rollMaterial(tier) {
    const t = clampTier(tier);
    const pool = MATERIAL_POOL[t] || MATERIAL_POOL[1];
    if (!pool.length) return null;
    const id = pool[Math.floor(Math.random() * pool.length)];
    return makeMaterial(id);
  }

  function clampTier(t) {
    const n = Number(t) || 1;
    return Math.max(1, Math.min(3, n));
  }

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function pickWeighted(weights) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (!total) return "white";
    let r = Math.random() * total;
    for (const [id, w] of entries) {
      r -= w;
      if (r <= 0) return id;
    }
    return entries[entries.length - 1][0];
  }

  function rarityMeta(id) {
    return RARITIES.find((r) => r.id === id) || RARITIES[0];
  }

  function rollValue(rarityId) {
    const range = VALUE_RANGE[rarityId] || VALUE_RANGE.white;
    return randInt(range.min, range.max);
  }

  function pickName(rarityId) {
    const pool = NAME_POOL[rarityId] || NAME_POOL.white;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function isShowcaseRarity(rarityId) {
    return !!rarityMeta(rarityId).showcase;
  }

  function isUniqueStandRarity(rarityId) {
    return !!rarityMeta(rarityId).uniqueStand;
  }

  function makeCollectible(rarityId, opts = {}) {
    const meta = rarityMeta(rarityId);
    const name = opts.name || pickName(meta.id);
    const value = opts.value != null ? opts.value : rollValue(meta.id);
    return {
      uid: opts.uid || `col_${meta.id}_${Math.random().toString(36).slice(2, 9)}`,
      rarity: meta.id,
      rarityLabel: meta.label,
      name,
      value,
      css: meta.css,
      desc: opts.desc || `${meta.label}收集品 · 价值 ${value} · 暂无战斗效果`,
      placeholder: true,
    };
  }

  /** 测试用：各稀有度若干件 + 全套战备合成材料，写入仓库 */
  function createTestCollectibles() {
    const list = [
      makeCollectible("white", { name: "锈蚀螺钉" }),
      makeCollectible("white", { name: "干涸墨瓶" }),
      makeCollectible("green", { name: "铭文碎晶" }),
      makeCollectible("green", { name: "铜质符钉" }),
      makeCollectible("blue", { name: "深蓝拓片" }),
      makeCollectible("blue", { name: "霜纹透镜" }),
      makeCollectible("purple", { name: "紫霆印匣" }),
      makeCollectible("purple", { name: "仪轨残卷" }),
      makeCollectible("gold", { name: "鎏金界碑" }),
      makeCollectible("gold", { name: "日曜罗盘" }),
      makeCollectible("unique", { name: "欧米伽残页" }),
      makeCollectible("unique", { name: "拓宇者本源胚" }),
      // 战备合成材料（各 2 件，便于测试合成）
      ...MATERIAL_IDS.flatMap((id) => [makeMaterial(id), makeMaterial(id)]),
    ];
    return list;
  }

  function rollCollectible(tier) {
    const t = clampTier(tier);
    if (Math.random() > (COLLECT_CHANCE[t] ?? 0.4)) return null;
    // 约 1/4 的收集品掉落改为「战备合成材料」，让合成有稳定来源
    if (Math.random() < 0.25) return rollMaterial(t);
    const rid = pickWeighted(RARITY_WEIGHTS[t] || RARITY_WEIGHTS[1]);
    return makeCollectible(rid);
  }

  function rollGold(tier) {
    const t = clampTier(tier);
    const g = TIER_GOLD[t] || TIER_GOLD[1];
    return randInt(g.min, g.max);
  }

  function rollRewardCard() {
    const defs = window.FBCards?.CARD_DEFS || {};
    const ids = Object.keys(defs).filter((id) => {
      const t = defs[id]?.type;
      return t === "element" || t === "process" || t === "word";
    });
    if (!ids.length) return null;
    const id = ids[Math.floor(Math.random() * ids.length)];
    const def = defs[id];
    return { cardId: id, name: def?.name || id, type: def?.type || "element" };
  }

  function generateCombatLoot(tier, opts = {}) {
    const hard = !!opts.hard;
    const t = hard ? 3 : clampTier(tier);
    const gold = hard
      ? randInt(26, 38)
      : rollGold(t);

    let collectibles = [];
    if (hard) {
      // 固定掉落：冰 / 火 紫色收集品
      collectibles = [
        makeCollectible("purple", {
          name: "寒霜结晶",
          desc: "冰法师掉落·紫色 · 暂无战斗效果",
        }),
        makeCollectible("purple", {
          name: "炽火余烬",
          desc: "火法师掉落·紫色 · 暂无战斗效果",
        }),
      ];
    } else {
      const one = rollCollectible(t);
      if (one) collectibles = [one];
    }

    return {
      tier: t,
      hard,
      gold,
      card: rollRewardCard(),
      collectible: collectibles[0] || null,
      collectibles,
    };
  }

  function totalCollectValue(items) {
    return (items || []).reduce((s, it) => s + (Number(it.value) || 0), 0);
  }

  window.FBLoot = {
    TIER_GOLD,
    COLLECT_CHANCE,
    RARITIES,
    VALUE_RANGE,
    NAME_POOL,
    // 战备合成材料
    MATERIALS,
    MATERIAL_IDS,
    MATERIAL_POOL,
    makeMaterial,
    createTestMaterials,
    rollMaterial,
    generateCombatLoot,
    makeCollectible,
    createTestCollectibles,
    rarityMeta,
    rollValue,
    isShowcaseRarity,
    isUniqueStandRarity,
    totalCollectValue,
    clampTier,
    rollRewardCard,
  };
})();
