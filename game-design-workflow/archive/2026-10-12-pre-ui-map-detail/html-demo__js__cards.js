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
    // ── 基础字词 201-230 ──
    // 数值随咏唱曲线调整（2026-10-13：1-4 档 5/14/27/45）
    steam: { choose: "steam", damage: 9, aoe: true },        // 201 范围9（原5）
    cold_air: { skipWindupNext: true },
    poison_gas: { poison: 2, aoe: true },
    acid: { damage: 6, stripBlockHalf: true },               // 204 6伤（原2）
    air_gun: { interrupt: true },
    concrete: { block: 15 },
    concrete_wall: { immuneSeconds: 5 },
    rice: { heal: 5 },
    wine: { damage: 12, nextBurn: true },
    alcohol: { damage: 32, alwaysBurn: true },               // 211 32伤（原40）
    molotov: { damage: 18, burn: 21, aoe: true },            // 212 18伤（原21）
    glass: { block: 20, reflectNext: true },
    snow: { damage: 9, freeze: 3, aoe: true },               // 214 范围9（原3）
    spark: { damage: 11, fervor: 1, aoe: true },
    molten_gold: { damage: 12, glory: 1 },
    vault: { block: 12, glory: 1 },
    rust: { vulnerable: 3, loseGlory: 1 },
    spore: { doublePoison: true },
    fortress: { block: 40, tough: true },
    firearm: { damage: 30, pierce: true },                   // 221 30伤（原40）
    vine: { multi: [2, 2, 2, 2] },
    fire_vine: { multi: [2, 2, 2, 2], burnPerHit: 2 },
    poison_vine: { multi: [2, 2, 2, 2], poisonPerHit: 1 },
    root: { multi: [5, 5], skipWindupNext: true },           // 225 2段5（原2段2）
    flourish: { multiBlock: [2, 2, 2], multi: [3, 3, 3], heal: 3 }, // 227 3段3（原3段1）
    iron_tree: { multiBlock: [5, 5] },
    gold_gun: { damage: 20, gloryScale: 5 },                 // 229 20伤（原25）
    hypothermia: { freeze: 10 },
    // ── 燃烧系 231-246（2026-10-12 实装；数值随曲线调整）──
    charcoal: { markCharcoal: true },
    heatwave: { damage: 11, aoe: true, settleBurn: true },   // 232 范围11（原7）
    kindle: { kindle: true },
    burst_burn: { burnStackDamage: true },   // 234 爆燃：造成敌人燃烧层数的伤害
    fuel: { doubleBurn: true },              // 235 燃油：燃烧层数翻倍
    holy_fire: { holyFire: true },           // 236 圣火：燃烧不衰减
    incinerate: { incinerate: true },        // 237 焚化：负面状态转化为燃烧
    ash: { burn: 16 },
    overheat: { draw: 1, overheat: true, instant: true },
    fire_rain: { damage: 16, aoeAll: true, burn: 10 },       // 240 16伤（原5）
    cremate: { damage: 10, burnBonus: 10, killHeal: 4 },
    blue_flame: { damage: 12, burn: 2, burnBonusStack: 2 },
    cold_allodynia: { freezeThenBurn: 5 },   // 243：5 层冻结 + 等量燃烧
    heat_drive: { heatDrive: true },
    ember_end: { emberEnd: true },           // 245 烬灭：递增脉冲清除燃烧
    nirvana: { nirvana: true },              // 246 涅槃：生命减半换燃烧
    // ── 电系 247-258 ──
    store_charge: { fervor: 2, fervorExtend: 5 },
    magnetic_field: { electricChantReduce: 1, duration: 10 },
    grid: { multi: [3, 3, 3, 3, 3] },
    overload: { fervor: 1, overload: true },
    magnetic_storm: { damage: 10, aoe: true },
    shock: { damage: 9, shockRepeat: true },                 // 253 前置9（原3）
    ac: { acDot: true },
    lightning: { consumeFervorDamage: 5, instant: true },
    superconduct: { fervor: 1 },
    surge: { damage: 9, addSurgeCopy: true },
    generator: { generator: { hp: 10, every: 5, grantsCardOnWin: "electric" } }, // 258
    // ── 召唤系 401-418（2026-10-13 拓展：元素人携带元素属性）──
    // 共鸣：核心牌，与增幅同稀有度；释放获得 1 点生命
    resonance: { summonHeal: 1 },
    devote: { selfHpCost: 5, buffAllies: { damage: 1, hp: 5 } },
    martyr: { martyrAllies: true },
    // 404 元素人：由「共鸣+任意元素」合成，**携带该元素属性**。
    // 元素属性决定：① 两个同属性元素人可合成对应大元素；② 供元素王读取算亲和。
    w404: { summon: { name: "元素人", hp: 5, damage: 3, every: 3, kind: "elemental", carryElement: true } },
    assimilate: { scaleAlly: { hp: 5, damage: 1 } },
    alienate: { scaleAlly: { mul: 0.5 } },
    // 407 大元素（无属性退路）。带属性版本见 409-418，由 summon-elements.js 定义
    great_elemental: { summon: { name: "大元素", hp: 12, damage: 6, every: 3, kind: "great_elemental" } },
    // 408 元素王：不普通攻击，改为释放「元素合成卡牌」+ 元素亲和
    element_king: {
      summon: {
        name: "元素王", hp: 30, damage: 0, every: 6,
        kind: "element_king", kingRelease: true, affinity: true,
      },
    },
    // 409-418 属性大元素：伤害统一（12HP/3s/6伤），靠细分效果区分定位
    ge_air:      { summon: { name: "气·大元素",     hp: 12, damage: 6, every: 2, kind: "great_elemental" } },
    ge_ash:      { summon: { name: "灰烬·大元素",   hp: 12, damage: 6, every: 3, kind: "great_elemental", burnPerHit: 2 } },
    ge_ice:      { summon: { name: "冰·大元素",     hp: 12, damage: 6, every: 3, kind: "great_elemental", freezePerHit: 1 } },
    ge_poison:   { summon: { name: "毒·大元素",     hp: 12, damage: 6, every: 3, kind: "great_elemental", poisonPerHit: 1 } },
    ge_electric: { summon: { name: "电·大元素",     hp: 12, damage: 6, every: 3, kind: "great_elemental", fervorPerHit: 1 } },
    ge_steel:    { summon: { name: "钢铁·大元素",   hp: 12, damage: 6, every: 3, kind: "great_elemental", pierce: true } },
    ge_gold:     { summon: { name: "金·大元素",     hp: 12, damage: 6, every: 3, kind: "great_elemental", gloryPerHit: 1 } },
    ge_sand:     { summon: { name: "砂·大元素",     hp: 12, damage: 6, every: 3, kind: "great_elemental", teamBlock: 2 } },
    ge_water:    { summon: { name: "水·大元素",     hp: 12, damage: 6, every: 3, kind: "great_elemental", selfHeal: 1 } },
    ge_fire:     { summon: { name: "火·大元素",     hp: 12, damage: 6, every: 3, kind: "great_elemental", bonusDamage: 2 } },
    lava: { damage: 20, aoe: true, env: "lava" },            // 301 范围20（原10）
    acid_rain: { env: "acid_rain", poison: 10, aoe: true },
    swamp: { damage: 14, aoe: true, poison: 1, env: "swamp" }, // 303 范围14（原4）
    sandstorm: { damage: 9, aoe: true, env: "sandstorm" },   // 304 范围9（原5）
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

  /**
   * 召唤流：额外注册 ge_*（属性大元素）与元素人词条。
   * 它们不在 card table.docx 的 specials 表里（大元素按属性拆分为 409-418），
   * 故在此补入 WORD_DEFS，使 makeWordCard / resolveCraft 能产出它们。
   */
  function registerSummonCards() {
    const S = window.FBSummon;
    if (!S) return;
    const reg = (v) => {
      if (WORD_DEFS[v.id]) return;
      WORD_DEFS[v.id] = {
        id: v.id, name: v.name, num: v.num, desc: v.effect,
        effect: WORD_EFFECTS[v.id] || { raw: v.effect },
        chant: 2,
      };
      // 若尚无 summon 效果，则按变体字段合成一个（供战斗侧使用）
      if (!WORD_EFFECTS[v.id]) {
        WORD_EFFECTS[v.id] = {
          summon: {
            name: v.name, hp: 12, damage: 6,
            every: v.attackEvery || 3, kind: "great_elemental",
            burnPerHit: v.burnPerHit, freezePerHit: v.freezePerHit,
            poisonPerHit: v.poisonPerHit, fervorPerHit: v.fervorPerHit,
            gloryPerHit: v.gloryPerHit, teamBlock: v.teamBlock,
            selfHeal: v.selfHeal, bonusDamage: v.bonusDamage,
            pierce: v.pierce, cleave: v.cleave, stripBlockHalf: v.stripBlockHalf,
          },
        };
      }
    };
    // 纯属性大元素（同属性合成）
    Object.values(S.GREATER_VARIANTS).forEach(reg);
    // 复合大元素（异属性合成，按元素对）
    Object.values(S.HYBRID_GREATER || {}).forEach(reg);
    if (!WORD_DEFS.w404) {
      WORD_DEFS.w404 = {
        id: "w404", name: "元素人", num: "404",
        desc: "召唤一个携带对应元素属性的元素人（5生命，每3秒3伤）",
        effect: WORD_EFFECTS.w404, chant: 2,
      };
    }
  }
  registerSummonCards();

  /** 按需注册一个大元素变体（用于运行时才生成的「回退复合」变体） */
  function ensureVariant(v) {
    if (!v || !v.id || WORD_DEFS[v.id]) return v;
    WORD_DEFS[v.id] = {
      id: v.id, name: v.name, num: v.num || "4xx", desc: v.effect,
      effect: null, chant: 2,
    };
    WORD_EFFECTS[v.id] = {
      summon: {
        name: v.name, hp: 12, damage: 6,
        every: v.attackEvery || 3, kind: "great_elemental",
        burnPerHit: v.burnPerHit, freezePerHit: v.freezePerHit,
        poisonPerHit: v.poisonPerHit, fervorPerHit: v.fervorPerHit,
        gloryPerHit: v.gloryPerHit, teamBlock: v.teamBlock,
        selfHeal: v.selfHeal, bonusDamage: v.bonusDamage,
        pierce: v.pierce, cleave: v.cleave, stripBlockHalf: v.stripBlockHalf,
      },
    };
    WORD_DEFS[v.id].effect = WORD_EFFECTS[v.id];
    return v;
  }

  /**
   * 显式声明元素倾向的词牌（id → 元素）。
   * 用于「共鸣 + 任意元素 → 元素人」与元素王的元素池：
   * 让 灰烬/炭火/磁场 这类衍生字词也能作为元素来源。
   */
  const WORD_ELEMENT_TAG = {
    ash: "ash", charcoal: "ash", kindle: "fire", holy_fire: "fire",
    ember_end: "fire", nirvana: "fire", heat_drive: "fire", cremate: "fire",
    blue_flame: "fire", heatwave: "fire", fire_rain: "fire", burst_burn: "fire",
    magnetic_field: "electric", overload: "electric", shock: "electric",
    ac: "electric", lightning: "electric", superconduct: "electric",
    surge: "electric", grid: "electric", store_charge: "electric",
    magnetic_storm: "electric", generator: "electric",
    mist: "air", poison_mist: "poison", permafrost: "ice",
    lava: "fire", acid_rain: "poison", swamp: "poison", sandstorm: "sand",
    molten_gold: "gold", vault: "gold", rust: "gold", gold_gun: "gold",
    iron_tree: "wood", flourish: "wood", root: "wood", vine: "wood",
    fire_vine: "fire", poison_vine: "poison", fortress: "steel",
    firearm: "steel", hypothermia: "ice", cold_allodynia: "ice",
    steel: "steel",
  };

  /** 元素来源判定：元素牌返回自身 id；带元素倾向的词牌返回其元素；否则 null */
  function isElementSource(idOrCard) {
    const id = typeof idOrCard === "string" ? idOrCard : (idOrCard?.defId || idOrCard?.id);
    if (!id) return null;
    const def = CARD_DEFS[id];
    if (def?.type === "element") return id;
    return WORD_ELEMENT_TAG[id] || null;
  }

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
    const isElement = d.type === "element";
    return {
      uid: `${defId}_${Math.random().toString(36).slice(2, 9)}`,
      defId,
      name: d.name,
      type: d.type,
      chant: d.chant,
      desc: d.desc,
      tags: [defId],
      play: d.play || {},
      /** 元素牌自带元素属性；召唤流（元素人）也依赖此字段 */
      element: isElement ? defId : (d.element || null),
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

    // ── 召唤流：共鸣 + 任意元素（含带元素倾向的词牌）→ 元素人 ──
    // 卡表原文「404 元素人：共鸣+任意元素」，属动态配方，需在此特判。
    if (slots.length === 2) {
      const hasRes = keys.includes("resonance");
      const other = slots.find((s) => materialKey(s) !== "resonance");
      const otherId = other ? materialKey(other) : null;
      const srcEl = otherId ? isElementSource(otherId) : null;
      if (hasRes && srcEl) {
        const card = makeWordCard("w404", 2);
        card.name = "元素人";
        card.desc = `召唤元素人（${CARD_DEFS[srcEl]?.name || WORD_DEFS[srcEl]?.name || srcEl}属性）`;
        card.element = srcEl;
        return card;
      }
    }

    // ── 召唤流：两个元素人合成大元素（同属性=纯属性；异属性=复合）──
    if (slots.length === 2 && keys.every((k) => k === "w404")) {
      const S = window.FBSummon;
      const eA = slots[0].element || null;
      const eB = slots[1].element || null;
      if (S) {
        const r = S.fuseElementals(eA, eB);
        if (r.kind === "greater" && r.variant) {
          const v = ensureVariant(r.variant);
          const card = makeWordCard(v.id, 2);
          card.name = v.name;
          card.desc = v.effect;
          // 复合时携带两种元素，纯属性时携带一种
          card.element = r.sameElement ? eA : eA;
          card.elements = r.sameElement ? [eA] : [eA, eB];
          // 变体已在 registerSummonCards 中登记进 WORD_DEFS / WORD_EFFECTS
          return card;
        }
        if (r.kind === "alienate") {
          const card = makeWordCard("alienate", 2);
          card.name = "异化";
          card.desc = r.reason || "元素人生命与攻击减半";
          return card;
        }
      }
      return makeWordCard("great_elemental", 2);
    }

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

  /** 产物效果文案（组合台预览用） */
  function describeCraftEffect(card) {
    if (!card) return "";
    const fx = card.effect || card.play || {};
    const bits = [];
    if (card.desc) bits.push(card.desc);
    if (fx.damageByChant) bits.push(`标准伤 ${standardDamage(card.chant)}`);
    if (fx.blockByChant) bits.push(`标准护甲 ${standardDamage(card.chant)}`);
    if (fx.purified) bits.push(`伤 ${standardDamage(1.5)} · 咏唱 1s`);
    if (fx.damage != null) bits.push(`伤害 ${fx.damage}`);
    if (fx.block != null) bits.push(`护甲 ${fx.block}`);
    if (fx.multi) bits.push(`多段 ${fx.multi.join("/")}`);
    if (fx.heatBoost) bits.push(`每段+${fx.heatBoost}`);
    if (fx.cool) bits.push("咏唱-1");
    if (fx.burn) bits.push(`燃烧 ${fx.burn}`);
    if (fx.poison) bits.push(`中毒 ${fx.poison}`);
    if (fx.freeze) bits.push(`冻结 ${fx.freeze}`);
    if (fx.aoe || fx.aoeAll) bits.push("全体");
    if (fx.acDot) bits.push("交流电：每 5s 延迟 1 伤 ×5");
    if (fx.shockRepeat) bits.push("电击：+3s/+6s 再伤");
    if (fx.summon) bits.push(`召唤 ${fx.summon.name || "召唤物"}`);
    // 去重保序
    const seen = new Set();
    const uniq = [];
    for (const b of bits) {
      const k = String(b);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      uniq.push(k);
    }
    return uniq.join(" · ") || "（无额外说明）";
  }

  function previewCraft(slots) {
    const mats = Array.isArray(slots) ? slots.slice() : [];
    const r = resolveCraft(mats);
    if (!r) {
      if (!mats.length) {
        return {
          title: "组合台",
          meta: "拖牌叠到手牌上 / 右键入槽 · 配方源：card table.docx",
          materials: [],
          ok: false,
        };
      }
      if (mats.length === 1) {
        return {
          title: mats[0].name,
          meta: "再叠一张材料后显示产物与效果",
          materials: mats,
          ok: false,
        };
      }
      return {
        title: "无法合成",
        meta: "当前组合无配方（docx 特殊/默认表）",
        materials: mats,
        ok: false,
      };
    }
    const effectText = describeCraftEffect(r);
    return {
      title: r.name,
      meta: `咏唱 ${r.chant || 1}s · 点「合成」入手牌`,
      card: r,
      materials: mats,
      product: r,
      effect: effectText,
      ok: true,
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
    WORD_EFFECTS,
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
    describeCraftEffect,
    recipeHelpList,
    source: T.source,
  };
})();
