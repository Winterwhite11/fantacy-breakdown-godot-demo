/**
 * summon-elements.js —— 召唤流：元素人 / 大元素 / 元素王
 *
 * 设计（用户 2026-10-13 设想，已实现于 code 层）：
 *   共鸣（核心牌，稀有度与增幅等同）
 *     └─ 共鸣 + 任意元素 → 元素人【携带该元素属性】
 *           ├─ 元素人 + 同元素元素人 → 该元素·大元素（10 种）
 *           └─ 元素人 + 异元素元素人 → 异化（生命与攻击减半）
 *   大元素 + 大元素 + 共鸣 → 元素王
 *     · 元素亲和：全场元素伤害提升（随持有的元素种类数增长）
 *     · 不普通攻击，而是释放「元素合成卡牌」：
 *         释放次数 = 持有的元素种类数
 *         释放强度 = 持有的元素张数
 *
 * 基础数值（沿用 407/408 原条：12生命/3秒6伤、30生命/3秒10伤）：
 *   元素人 5HP / 3s / 3伤
 *   大元素 12HP / 3s / 6伤   ← 所有属性伤害相同，靠「细分效果」区分定位
 *   元素王 30HP / 6s 不攻击 / 释放合成牌
 */
(function (root) {
  /** 大元素细分效果表：元素 id → 效果 */
  const GREATER_VARIANTS = {
    air:     { num: '409', name: '气·大元素',     id: 'ge_air',
               effect: '攻击间隔由3秒缩短至2秒（行动更快）', attackEvery: 2 },
    ash:     { num: '410', name: '灰烬·大元素',   id: 'ge_ash',
               effect: '每次攻击附带2层燃烧', burnPerHit: 2 },
    ice:     { num: '411', name: '冰·大元素',     id: 'ge_ice',
               effect: '每次攻击附带1层冻结', freezePerHit: 1 },
    poison:  { num: '412', name: '毒·大元素',     id: 'ge_poison',
               effect: '每次攻击附带1层中毒', poisonPerHit: 1 },
    electric:{ num: '413', name: '电·大元素',     id: 'ge_electric',
               effect: '每次攻击获得1层激昂', fervorPerHit: 1 },
    steel:   { num: '414', name: '钢铁·大元素',   id: 'ge_steel',
               effect: '攻击无视护甲（穿透）', pierce: true },
    gold:    { num: '415', name: '金·大元素',     id: 'ge_gold',
               effect: '每次攻击获得1层辉煌', gloryPerHit: 1 },
    sand:    { num: '416', name: '砂·大元素',     id: 'ge_sand',
               effect: '攻击时为己方全体提供2点护甲', teamBlock: 2 },
    water:   { num: '417', name: '水·大元素',     id: 'ge_water',
               effect: '攻击时回复1点生命', selfHeal: 1 },
    fire:    { num: '418', name: '火·大元素',     id: 'ge_fire',
               effect: '每次攻击伤害+2（偏纯输出）', bonusDamage: 2 },
    // 兼容：未指定元素时退化为通用大元素（原 407）
    generic: { num: '407', name: '大元素',        id: 'great_elemental',
               effect: '无属性倾向', attackEvery: 3 },
  };

  /** 基础数值 */
  const BASE = {
    elemental: { hp: 5,  damage: 3,  every: 3 },
    greater:   { hp: 12, damage: 6,  every: 3 },
    king:      { hp: 30, damage: 0,  every: 6 },   // 元素王不普通攻击
  };

  /**
   * 元素对 → 复合大元素。
   *
   * 设计（用户 2026-10-13 澄清）：大元素由**任意两个元素人**合成，
   * 不要求同属性。结果由「元素组合」决定：
   *   · 同属性 → 纯属性大元素：单一效果专精、数值略强
   *   · 异属性 → 复合大元素：获得两种元素的复合效果，单项略弱
   *   · 二者基础攻击相同（12HP / 3s / 6伤）
   *   · 复合增加「元素种类」⇒ 元素王亲和更高；纯属性伤害更高
   *     → 构成「广度（亲和）↔ 深度（伤害）」的取舍
   *
   * 键为元素 id 排序后以 '+' 连接，故 火+水 与 水+火 等价。
   */
  const HYBRID_GREATER = {
    // 火系复合
    'fire+water':    { id: 'gx_steam',  num: '420', name: '蒸汽·大元素', effect: '攻击附带2层燃烧与1层冻结', burnPerHit: 2, freezePerHit: 1 },
    'fire+sand':     { id: 'gx_magma',  num: '421', name: '岩浆·大元素', effect: '攻击无视护甲（穿透）', pierce: true },
    'fire+steel':    { id: 'gx_forge',  num: '422', name: '炉火·大元素', effect: '攻击伤害+1且无视护甲', bonusDamage: 1, pierce: true },
    'ash+fire':      { id: 'gx_ember',  num: '423', name: '余烬·大元素', effect: '攻击附带4层燃烧', burnPerHit: 4 },
    'fire+gold':     { id: 'gx_star',   num: '424', name: '恒星·大元素', effect: '每次攻击获得1层辉煌', gloryPerHit: 1 },
    // 水系复合
    'poison+water':  { id: 'gx_acid',   num: '425', name: '酸·大元素',   effect: '攻击附带2层中毒并无视一半护甲', poisonPerHit: 2, stripBlockHalf: true },
    'ice+water':     { id: 'gx_frost',  num: '426', name: '霜·大元素',   effect: '攻击附带2层冻结', freezePerHit: 2 },
    'ash+water':     { id: 'gx_brine',  num: '427', name: '盐·大元素',   effect: '攻击附带1层中毒与1层冻结', poisonPerHit: 1, freezePerHit: 1 },
    // 砂系复合
    'air+sand':      { id: 'gx_dust',   num: '428', name: '沙尘·大元素', effect: '攻击连带造成3点范围伤害', cleave: 3 },
    'sand+wood':     { id: 'gx_earth',  num: '429', name: '大地·大元素', effect: '攻击时回复2点生命', selfHeal: 2 },
    'sand+poison':   { id: 'gx_dune',   num: '430', name: '荒芜·大元素', effect: '攻击附带1层中毒并回复1点生命', poisonPerHit: 1, selfHeal: 1 },
    'iron+wood':     { id: 'gx_thorn',  num: '431', name: '荆棘·大元素', effect: '攻击时为己方全体提供4点护甲', teamBlock: 4 },
    // 木系复合
    'poison+wood':   { id: 'gx_vine',   num: '432', name: '藤蔓·大元素', effect: '攻击附带1层中毒并回复1点生命', poisonPerHit: 1, selfHeal: 1 },
    'wood+water':    { id: 'gx_bloom',  num: '433', name: '繁茂·大元素', effect: '攻击时回复3点生命', selfHeal: 3 },
    // 电系复合
    'electric+gold': { id: 'gx_spark',  num: '434', name: '星火·大元素', effect: '每次攻击获得1层辉煌与1层激昂', gloryPerHit: 1, fervorPerHit: 1 },
    'air+electric':  { id: 'gx_conduit', num: '435', name: '导管·大元素', effect: '攻击间隔缩短至2秒并获得1层激昂', attackEvery: 2, fervorPerHit: 1 },
    'electric+steel':{ id: 'gx_rail',   num: '436', name: '电磁·大元素', effect: '攻击无视护甲并获得1层激昂', pierce: true, fervorPerHit: 1 },
    // 冰系复合
    'air+ice':       { id: 'gx_perma',  num: '437', name: '永冻·大元素', effect: '攻击间隔缩短至2秒并附带1层冻结', attackEvery: 2, freezePerHit: 1 },
    'gold+ice':      { id: 'gx_glaze',  num: '438', name: '琉璃·大元素', effect: '攻击附带2层冻结并回复1点生命', freezePerHit: 2, selfHeal: 1 },
    // 毒系复合
    'electric+poison': { id: 'gx_toxin', num: '439', name: '神经·大元素', effect: '攻击附带2层中毒与1层激昂', poisonPerHit: 2, fervorPerHit: 1 },
    'ash+poison':    { id: 'gx_cinder', num: '440', name: '炭毒·大元素', effect: '攻击附带2层燃烧与2层中毒', burnPerHit: 2, poisonPerHit: 2 },
    // 钢铁系复合
    'ash+steel':     { id: 'gx_slag',   num: '441', name: '炉渣·大元素', effect: '攻击无视护甲并附带2层燃烧', pierce: true, burnPerHit: 2 },
    'ice+steel':     { id: 'gx_rime',   num: '442', name: '霜铁·大元素', effect: '攻击无视护甲并附带1层冻结', pierce: true, freezePerHit: 1 },
    // 金系复合
    'ash+gold':      { id: 'gx_gild',   num: '443', name: '鎏金·大元素', effect: '每次攻击获得1层辉煌并附带1层燃烧', gloryPerHit: 1, burnPerHit: 1 },
    'gold+sand':     { id: 'gx_ingot',  num: '444', name: '金砂·大元素', effect: '每次攻击获得1层辉煌并为我方提供2点护甲', gloryPerHit: 1, teamBlock: 2 },
  };

  /** 元素 id → 中文名（用于复合大元素命名；与 card-data.js 的 elements 保持一致） */
  const ELEMENT_LABEL = {
    water: '水', fire: '火', air: '气', poison: '毒', sand: '砂', ice: '冰',
    wood: '木', hafnium: '铪', gold: '金', steel: '钢铁', electric: '电',
    ash: '灰烬', iron: '钢铁',
  };

  /** 稳定的元素对键（顺序无关） */
  function pairKey(a, b) {
    return [a, b].sort().join('+');
  }

  /**
   * 由两个元素人的元素求复合大元素。
   * @returns {{id,name,effect,...}|null} 无对应组合时返回 null，由调用方回退
   */
  function hybridOf(elemA, elemB) {
    if (!elemA || !elemB) return null;
    return HYBRID_GREATER[pairKey(elemA, elemB)] || null;
  }

  function affinityBonus(distinctTypes) {
    const n = Math.max(0, Number(distinctTypes) || 0);
    return 1 + 0.12 * n;          // 1 种 +12%，5 种 +60%
  }

  /**
   * 元素王的释放计划。
   * @param {Array<{element:string}>} held 持有的元素（如元素人携带的元素）
   * @returns {{kind:string, pairs:Array, casts:number, budget:number}}
   *   casts  = 释放次数 = 元素种类数
   *   budget = 释放强度 = 元素张数（用于放大每次释放的伤害/层数）
   */
  function kingReleasePlan(held) {
    const list = (held || []).filter((h) => h && h.element);
    const types = [...new Set(list.map((h) => h.element))];
    const pairs = [];
    for (let i = 0; i < types.length; i++) {
      const a = types[i];
      const b = types[(i + 1) % types.length];   // 环形配对：保证种类多则多次释放
      pairs.push([a, b]);
    }
    return {
      kind: 'element_king_release',
      pairs,
      casts: types.length || 1,
      budget: list.length || 1,
      distinctTypes: types.length,
      affinity: affinityBonus(types.length),
    };
  }

  /**
   * 由两个元素人的元素决定产物。
   *
   * 用户 2026-10-13 澄清：**异属性同样产出大元素**，且按元素对区分效果。
   *   同属性 → 纯属性大元素（单一效果专精，数值略强）
   *   异属性 → 复合大元素（两种效果复合，单项略弱）
   * 二者基础攻击相同（12HP / 3s / 6伤）。
   *
   * 只有一种情况退化为「异化」：两个元素人**缺失元素标记**时无法判定组合，
   * 此时保留原 406 条的减半语义作为兜底。
   */
  function fuseElementals(elemA, elemB) {
    // 缺元素标记 → 无法判定组合，退化为异化（原 406 条）
    if (!elemA || !elemB) return { kind: 'alienate', reason: '元素标记缺失，退化为异化' };

    // 同属性 → 纯属性大元素
    if (elemA === elemB) {
      const v = GREATER_VARIANTS[elemA] || GREATER_VARIANTS.generic;
      return { kind: 'greater', variant: v, sameElement: true };
    }

    // 异属性 → 复合大元素（查元素对表）
    const hx = hybridOf(elemA, elemB);
    if (hx) return { kind: 'greater', variant: hx, sameElement: false };

    // 表内未定义的组合 → 通用回退。
    // 策略：取两元素中「较强的两项」效果各半，并给 +1 伤害作为基础补偿，
    // 避免出现「7 项效果各 1 层」这种散乱弱化。
    const va = GREATER_VARIANTS[elemA] || {};
    const vb = GREATER_VARIANTS[elemB] || {};
    const merged = {
      id: `gx_${pairKey(elemA, elemB).replace('+', '_')}`,
      num: '4xx',
      name: `${ELEMENT_LABEL[elemA] || elemA}·${ELEMENT_LABEL[elemB] || elemB}·大元素`,
      effect: '复合效果（未特化：取两元素主要效果，伤害+1）',
      bonusDamage: 1,
    };
    const KEYS = ['burnPerHit', 'freezePerHit', 'poisonPerHit', 'fervorPerHit',
                  'gloryPerHit', 'teamBlock', 'selfHeal'];
    // 选出两元素各自最强的一项，各取一半（向下不少于 1）
    const pick = [];
    for (const src of [va, vb]) {
      let bestK = null, bestV = 0;
      for (const k of KEYS) if ((src[k] || 0) > bestV) { bestV = src[k]; bestK = k; }
      if (bestK) pick.push([bestK, Math.max(1, Math.round(bestV / 2))]);
    }
    for (const [k, v] of pick) merged[k] = Math.max(merged[k] || 0, v);
    if (va.pierce || vb.pierce) merged.pierce = true;
    const ae = Math.min(va.attackEvery || 3, vb.attackEvery || 3);
    if (ae < 3) merged.attackEvery = ae;
    return { kind: 'greater', variant: merged, sameElement: false, fallback: true };
  }

  const API = {
    GREATER_VARIANTS, HYBRID_GREATER, BASE,
    affinityBonus, kingReleasePlan, fuseElementals, hybridOf, pairKey,
  };
  if (root) root.FBSummon = API;
  return API;
})(typeof window !== 'undefined' ? window : null);
