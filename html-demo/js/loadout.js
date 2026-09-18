/**
 * 整理战备：仓库 / 携带牌组 / 装备
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

  function createLoadoutState() {
    const cardStash = {};
    const deck = {};
    const defs = window.FBCards?.CARD_DEFS || {};
    Object.keys(defs).forEach((id) => {
      // 测试：仓库每种卡固定 3 张
      cardStash[id] = 3;
      deck[id] = 0;
    });
    // 默认携带测试牌组（不占用仓库库存，方便直接开战）
    const start = defaultDeckCounts();
    Object.entries(start).forEach(([id, n]) => {
      if (!defs[id]) return;
      deck[id] = n;
    });

    const equipStash = [];
    Object.values(EQUIP_DEFS).forEach((def) => {
      for (let i = 0; i < 3; i++) {
        equipStash.push({
          uid: uid(def.id),
          defId: def.id,
          name: def.name,
          slot: def.slot,
          value: def.value,
          desc: def.desc,
        });
      }
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
      collectibles: [], // 预留
    };
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

  /** 装备：仓库 → 槽位（替换则旧装备回仓库） */
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

  /** 双击已装备：卸下 */
  function toggleEquipByUid(state, itemUid) {
    for (const slot of SLOT_ORDER) {
      if (state.equipped[slot]?.uid === itemUid) return unequipSlot(state, slot);
    }
    const idx = state.equipStash.findIndex((x) => x.uid === itemUid);
    if (idx >= 0) return equipFromStash(state, idx);
    return { ok: false, reason: "未找到装备" };
  }

  function addToDeck(state, cardId) {
    if (!window.FBCards.CARD_DEFS[cardId]) return { ok: false, reason: "未知卡牌" };
    if ((state.cardStash[cardId] || 0) <= 0) return { ok: false, reason: "仓库中没有该卡" };
    if (deckTotal(state) >= DECK_SIZE_MAX) return { ok: false, reason: `牌组上限 ${DECK_SIZE_MAX}` };
    state.cardStash[cardId] -= 1;
    state.deck[cardId] = (state.deck[cardId] || 0) + 1;
    return { ok: true };
  }

  function removeFromDeck(state, cardId) {
    if ((state.deck[cardId] || 0) <= 0) return { ok: false, reason: "牌组中没有该卡" };
    state.deck[cardId] -= 1;
    state.cardStash[cardId] = (state.cardStash[cardId] || 0) + 1;
    return { ok: true };
  }

  function buildBattleDeck(state) {
    const ids = [];
    Object.entries(state.deck).forEach(([id, n]) => {
      for (let i = 0; i < n; i++) ids.push(id);
    });
    if (!ids.length) {
      // 兜底：空牌组时用测试牌组
      return window.FBCards.buildTestDeck();
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
    equipDef,
    deckTotal,
    stashCardTotal,
    maxHpBonus,
    startBlockBonus,
    pistolEffects,
    equipFromStash,
    unequipSlot,
    toggleEquipByUid,
    addToDeck,
    removeFromDeck,
    buildBattleDeck,
    baseMaxHp,
    effectiveMaxHp,
    defaultDeckCounts,
  };
})();
