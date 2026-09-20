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

  /** 测试用：各稀有度若干件，写入仓库 */
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
    ];
    return list;
  }

  function rollCollectible(tier) {
    const t = clampTier(tier);
    if (Math.random() > (COLLECT_CHANCE[t] ?? 0.4)) return null;
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
    generateCombatLoot,
    makeCollectible,
    createTestCollectibles,
    rarityMeta,
    rollValue,
    isShowcaseRarity,
    isUniqueStandRarity,
    totalCollectValue,
    clampTier,
  };
})();
