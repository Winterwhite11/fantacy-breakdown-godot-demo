/**
 * 卡牌与合成 — 以本地 card table.docx 为权威源
 * 数据：js/card-data.js（由 docx 解析生成）
 */
(function () {
  const T = window.FBCardTable;
  if (!T) {
    console.error("FBCardTable missing — load card-data.js first");
    return;
  }

  const CHANT_DAMAGE = {
    1: T.chant_damage["1"],
    2: T.chant_damage["2"],
    3: T.chant_damage["3"],
    4: T.chant_damage["4"],
  };
  const WINDUP = T.windup;
  const RECOVER = T.recover;
  const ARMOR_DURATION = T.armor_duration;
  const TOLERANCE = T.tolerance;

  /** 基础字定义（元素 + 操作） */
  const CARD_DEFS = {};
  const ELEMENT_PLAY = {
    water: { damage: 4 },
    fire: { damage: 5 },
    air: { damage: 3 },
    poison: { poison: 2 },
    sand: { block: 4 },
    ice: { damage: 4, freeze: 1 },
    wood: { multi: [2, 2] },
    hafnium: { damage: 5 },
    gold: { glory: 1 },
    steel: { damage: 32 },
    electric: { damage: 7, fervor: 1 },
  };

  Object.values(T.elements).forEach((e) => {
    CARD_DEFS[e.id] = {
      id: e.id,
      name: e.name,
      type: "element",
      chant: 1,
      desc: e.effect,
      num: e.num,
      play: ELEMENT_PLAY[e.id] || { damage: 4 },
    };
  });
  Object.values(T.processes).forEach((p) => {
    CARD_DEFS[p.id] = {
      id: p.id,
      name: p.name,
      type: "process",
      chant: 1,
      desc: p.effect,
      num: p.num,
    };
  });

  /**
   * 字词打出效果（按 docx 可执行化；未列尽者走 raw + 标准伤兜底）
   */
  const WORD_EFFECTS = {
    steam: { choose: "steam", damage: 5, aoe: true }, // 对敌范围5 / 对己燃烧2抽2（Demo 默认对敌 AOE）
    cold_air: { skipWindupNext: true },
    poison_gas: { poison: 2, aoe: true },
    acid: { damage: 2, stripBlockHalf: true },
    air_gun: { interrupt: true },
    concrete: { block: 15 },
    concrete_wall: { immuneSeconds: 5 },
    rice: { heal: 5 },
    wine: { damage: 12, nextBurn: true },
    alcohol: { damage: 40, alwaysBurn: true },
    molotov: { damage: 21, burn: 21, aoe: true },
    glass: { block: 20, reflectNext: true },
    snow: { damage: 3, freeze: 3, aoe: true },
    spark: { damage: 11, fervor: 1, aoe: true },
    molten_gold: { damage: 12, glory: 1 },
    vault: { block: 12, glory: 1 },
    rust: { vulnerable: 3, loseGlory: 1 },
    spore: { doublePoison: true },
    fortress: { block: 40, tough: true },
    firearm: { damage: 40, pierce: true },
    vine: { multi: [2, 2, 2, 2] },
    fire_vine: { multi: [2, 2, 2, 2], burnPerHit: 2 },
    poison_vine: { multi: [2, 2, 2, 2], poisonPerHit: 1 },
    root: { multi: [2, 2], skipWindupNext: true },
    flourish: { multiBlock: [2, 2, 2], multi: [1, 1, 1], heal: 3 },
    iron_tree: { multiBlock: [5, 5] },
    gold_gun: { damage: 25, gloryScale: 5 },
    hypothermia: { freeze: 10 },
    charcoal: { markCharcoal: true },
    heatwave: { damage: 7, aoe: true, settleBurn: true },
    kindle: { kindle: true },
    ash: { burn: 16 },
    overheat: { draw: 1, overheat: true, instant: true },
    fire_rain: { damage: 5, aoeAll: true, burn: 10 },
    cremate: { damage: 10, burnBonus: 10, killHeal: 4 },
    blue_flame: { damage: 12, burn: 2, burnBonusStack: 2 },
    heat_drive: { heatDrive: true },
    store_charge: { fervor: 2, fervorExtend: 5 },
    magnetic_field: { electricChantReduce: 1, duration: 10 },
    grid: { multi: [3, 3, 3, 3, 3] },
    overload: { fervor: 1, overload: true },
    magnetic_storm: { damage: 10, aoe: true },
    shock: { damage: 3, shockRepeat: true },
    ac: { acDot: true },
    lightning: { consumeFervorDamage: 5, instant: true },
    superconduct: { fervor: 1 },
    surge: { damage: 9, addSurgeCopy: true },
    lava: { damage: 10, aoe: true, env: "lava" },
    acid_rain: { env: "acid_rain", poison: 10, aoe: true },
    swamp: { damage: 4, aoe: true, poison: 1, env: "swamp" },
    sandstorm: { damage: 5, aoe: true, env: "sandstorm" },
    mist: { stealth: 5 },
    poison_mist: { stealth: 3, env: "poison_mist" },
    permafrost: { block: 10, env: "permafrost" },
  };

  const WORD_DEFS = {};
  T.specials.forEach((s) => {
    WORD_DEFS[s.id] = {
      id: s.id,
      name: s.name,
      num: s.num,
      desc: s.effect,
      effect: WORD_EFFECTS[s.id] || { raw: s.effect, damageByChant: true },
      chant: null, // 由材料数决定
    };
  });

  /** 全部特殊配方：元素互合成优先，再字词表 */
  const SPECIAL_RECIPES = [];
  Object.values(T.elements).forEach((e) => {
    (e.craft_alts || []).forEach((mats) => {
      SPECIAL_RECIPES.push({
        materials: mats.slice(),
        result: e.id,
        kind: "element",
        name: e.name,
        num: e.num,
        priority: 2,
      });
    });
  });
  T.specials.forEach((s) => {
    (s.materials_alts || []).forEach((mats) => {
      SPECIAL_RECIPES.push({
        materials: mats.slice(),
        result: s.id,
        kind: "word",
        name: s.name,
        num: s.num,
        priority: 1,
      });
    });
  });

  function makeInstance(defId) {
    const d = CARD_DEFS[defId] || PUNCT_DEFS[defId];
    if (!d) throw new Error("unknown card " + defId);
    return {
      uid: `${defId}_${Math.random().toString(36).slice(2, 9)}`,
      defId,
      name: d.name,
      type: d.type,
      chant: d.chant,
      desc: d.desc,
      tags: [defId],
      play: d.play || {},
    };
  }

  /** 收集品溢出诅咒：打出无效果，占牌组位（类 STS 诅咒） */
  function ensureCurseDef(id, name) {
    if (CARD_DEFS[id]) return CARD_DEFS[id];
    CARD_DEFS[id] = {
      id,
      name: name || "收集品",
      type: "curse",
      chant: 1,
      desc: "收集品占位（诅咒）· 无效果 · 限制探索构筑空间",
      play: {},
    };
    return CARD_DEFS[id];
  }

  /** 无意义标点：牌组不足 DECK_SIZE_MIN 时填充 */
  const PUNCT_GLYPHS = ["。", "，", "、", "！", "？", "；", "：", "…", "·", "—"];
  const PUNCT_DEFS = {};
  PUNCT_GLYPHS.forEach((g, i) => {
    const id = `punct_${i}`;
    PUNCT_DEFS[id] = {
      id,
      name: g,
      type: "punct",
      chant: 1,
      desc: "无意义标点·填充牌组（打出无效果）",
      play: {},
    };
  });

  function makePunctInstance(preferredId) {
    const ids = Object.keys(PUNCT_DEFS);
    const id = preferredId && PUNCT_DEFS[preferredId]
      ? preferredId
      : ids[Math.floor(Math.random() * ids.length)];
    return makeInstance(id);
  }

  function randomPunctId() {
    const ids = Object.keys(PUNCT_DEFS);
    return ids[Math.floor(Math.random() * ids.length)];
  }

  function makeWordCard(wordId, chant) {
    const w = WORD_DEFS[wordId];
    if (!w) throw new Error("unknown word " + wordId);
    return {
      uid: `word_${wordId}_${Math.random().toString(36).slice(2, 9)}`,
      defId: wordId,
      name: w.name,
      type: "word",
      chant: chant != null ? chant : Math.max(1, w.chant || 2),
      desc: w.desc,
      effect: { ...(w.effect || {}) },
      tags: ["word", wordId],
      fromCraft: true,
    };
  }

  function buildTestDeck() {
    const ids = [
      ...Array(3).fill("fire"),
      ...Array(3).fill("water"),
      ...Array(3).fill("sand"),
      ...Array(3).fill("wood"),
      "compress",
      "heat",
      "cool",
      "stack",
      "amp",
    ];
    return shuffle(ids.map(makeInstance));
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function standardDamage(seconds) {
    const s = Number(seconds);
    if (Math.abs(s - 1.5) < 0.01) return Math.round(CHANT_DAMAGE[1] * 1.5);
    const i = Math.max(1, Math.min(4, Math.round(s)));
    return CHANT_DAMAGE[i] ?? 5;
  }

  function materialKey(card) {
    return card.defId;
  }

  function sameMultiset(a, b) {
    if (a.length !== b.length) return false;
    const sa = a.slice().sort();
    const sb = b.slice().sort();
    return sa.every((v, i) => v === sb[i]);
  }

  function elementName(id) {
    return CARD_DEFS[id]?.name || id;
  }

  function resolveDefaultProcessElement(keys) {
    const elems = keys.filter((k) => CARD_DEFS[k]?.type === "element");
    const procs = keys.filter((k) => CARD_DEFS[k]?.type === "process");

    if (keys.length === 3 && elems.length === 1 && procs.includes("cool") && procs.includes("heat")) {
      return makeInstance(elems[0]);
    }
    if (keys.length !== 2 || elems.length !== 1 || procs.length !== 1) return null;

    const e = elems[0];
    const p = procs[0];
    const ename = elementName(e);
    let chant = 2;

    if (p === "compress") {
      return makeWordCardDynamic(`compress_${e}`, `压缩${ename}`, chant, "造成咏唱时间对应的标准伤害", {
        damageByChant: true,
        element: e,
      });
    }
    if (p === "stack") {
      return makeWordCardDynamic(`wall_${e}`, `${ename}墙`, chant, "获得咏唱时间对应的标准护甲", {
        blockByChant: true,
        element: e,
      });
    }
    if (p === "heat") {
      return makeWordCardDynamic(`heat_${e}`, `高温${ename}`, chant, "伤害/护甲每段+3", {
        heatBoost: 3,
        element: e,
      });
    }
    if (p === "cool") {
      chant = Math.max(1, chant - 1);
      return makeWordCardDynamic(`cool_${e}`, `冷却${ename}`, chant, "咏唱时间-1", {
        cool: true,
        element: e,
      });
    }
    if (p === "amp") {
      return makeWordCardDynamic(`amp_${e}`, `提纯${ename}`, 1, "造成1.5s伤害，时间为1s", {
        purified: true,
        element: e,
      });
    }
    return null;
  }

  function makeWordCardDynamic(defId, name, chant, desc, effect) {
    return {
      uid: `word_${defId}_${Math.random().toString(36).slice(2, 9)}`,
      defId,
      name,
      type: "word",
      chant,
      desc,
      effect,
      tags: ["word", defId],
      fromCraft: true,
    };
  }

  function resolveCraft(slots) {
    if (!slots || slots.length < 2) return null;
    if (slots.length > TOLERANCE) return null;
    const keys = slots.map(materialKey);

    const specials = SPECIAL_RECIPES.slice().sort((a, b) => {
      const ld = b.materials.length - a.materials.length;
      if (ld) return ld;
      return (b.priority || 0) - (a.priority || 0);
    });
    for (const rec of specials) {
      if (!sameMultiset(keys, rec.materials)) continue;
      const chant = rec.materials.length;
      if (rec.kind === "element") {
        const card = makeInstance(rec.result);
        // docx：气本身 1s，但水+火合成的气咏唱按堆叠为 2s
        card.chant = chant;
        card.fromCraft = true;
        card.craftChant = chant;
        card.desc = (CARD_DEFS[rec.result]?.desc || "") + `（合成自 ${chant} 字）`;
        return card;
      }
      return makeWordCard(rec.result, chant);
    }
    return resolveDefaultProcessElement(keys);
  }

  function previewCraft(slots) {
    const r = resolveCraft(slots);
    if (!r) {
      if (!slots.length) return { title: "组合台", meta: "右键手牌入槽 · 配方源：card table.docx" };
      if (slots.length === 1) return { title: slots[0].name, meta: "再加入材料后点「合成」→ 产物回手牌" };
      return { title: "无法合成", meta: "当前组合无配方（docx 特殊/默认表）" };
    }
    const dmgHint = r.effect?.damageByChant
      ? `标准伤 ${standardDamage(r.chant)}`
      : r.effect?.blockByChant
        ? `标准护甲 ${standardDamage(r.chant)}`
        : r.effect?.purified
          ? `伤 ${standardDamage(1.5)}`
          : r.desc;
    return {
      title: r.name,
      meta: `合成后入手牌 · 咏唱 ${r.chant}s · ${dmgHint}`,
      card: r,
    };
  }

  function recipeHelpList() {
    const lines = [
      "数据源：本地 card table.docx",
      "【默认】压缩/堆砌/加热/冷却/增幅 + 元素；冷却+加热+元素→还原",
    ];
    T.specials.forEach((s) => {
      if (!s.materials_alts?.length) return;
      const mats = s.materials_alts
        .map((m) => m.map((id) => CARD_DEFS[id]?.name || WORD_DEFS[id]?.name || id).join("+"))
        .join(" / ");
      lines.push(`${s.num} ${s.name} ← ${mats}`);
    });
    Object.values(T.elements).forEach((e) => {
      if (!e.craft_alts?.length) return;
      const mats = e.craft_alts
        .map((m) => m.map((id) => CARD_DEFS[id]?.name || WORD_DEFS[id]?.name || id).join("+"))
        .join(" / ");
      lines.push(`${e.num} ${e.name} ← ${mats}`);
    });
    return lines;
  }

  window.FBCards = {
    CARD_DEFS,
    WORD_DEFS,
    PUNCT_DEFS,
    SPECIAL_RECIPES,
    CHANT_DAMAGE,
    WINDUP,
    RECOVER,
    ARMOR_DURATION,
    TOLERANCE,
    makeInstance,
    ensureCurseDef,
    makeWordCard,
    makePunctInstance,
    randomPunctId,
    buildTestDeck,
    shuffle,
    standardDamage,
    resolveCraft,
    previewCraft,
    recipeHelpList,
    source: T.source,
  };
})();
