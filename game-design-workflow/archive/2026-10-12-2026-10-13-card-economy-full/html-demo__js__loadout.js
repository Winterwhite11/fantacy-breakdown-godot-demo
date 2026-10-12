/**
 * 整理战备：仓库 / 携带牌组 / 装备 / 背包收集品
 * UI 参考炉石职业牌库切换 + 三角洲行动战备布局
 */
(function () {
  const EQUIP_DEFS = {
    armor_simple: {
      id: "armor_simple",
      name: "简易护甲",
      slot: "body",
      value: 500,
      desc: "最大生命 +10",
      maxHpBonus: 10,
    },
    helmet_simple: {
      id: "helmet_simple",
      name: "简易头盔",
      slot: "head",
      value: 300,
      desc: "战斗开始获得 3 点护甲",
      startBlock: 3,
    },
    pistol_simple: {
      id: "pistol_simple",
      name: "简易手枪",
      slot: "weapon",
      value: 600,
      desc: "装备后每间隔 10s 造成 5 点伤害",
      intervalDamage: { every: 10, damage: 5 },
    },
    backpack_simple: {
      id: "backpack_simple",
      name: "简易背包",
      slot: "backpack",
      value: 500,
      capacity: 2,
      desc: "收集品栏 2 格 · 与卡组无关",
    },
    backpack_normal: {
      id: "backpack_normal",
      name: "普通背包",
      slot: "backpack",
      value: 1000,
      capacity: 5,
      desc: "收集品栏 5 格 · 与卡组无关",
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

  function pistolEffects(state) {
    const list = [];
    Object.values(state.equipped).forEach((it) => {
      const d = equipDef(it);
      if (d?.intervalDamage) list.push({ ...d.intervalDamage, name: d.name });
    });
    return list;
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
