// -*- coding: utf-8 -*-
/** 经济定价引擎 v1 —— 纯计算，无 DOM 依赖，可被浏览器与 Node 同时引用 */
/**
 * 导出方式：
 *   - 浏览器：`window.FBEconomy`
 *   - Node 工具：用 new Function 执行并取回 FBEconomyModule
 *     （见 tools/validate.mjs / balance.mjs / gen_price_table.js）
 */
const FBEconomyModule = (function (root) {
  // ── 1. 咏唱伤害表 ──
  // 1-4 档为用户 2026-10-13 拍板值（回到 card table.docx 原文设计：5/14/27/45）。
  // 5-6 档为三次拟合外推（精确通过 1-4 档，差分 9/13/18/24/31），供耐性 6 使用。
  const CHANT_DAMAGE = { 1: 5, 2: 14, 3: 27, 4: 45, 5: 69, 6: 100 };

  // ── 2. 定价系数（可调旋钮） ──
  //
  // 定价公式：P = PRICE_AT_5WV × (WV/5)^PRICE_EXP
  //
  // 为什么用连续幂函数而不取整：
  //   若价格取整，则 WV=1 与 WV=2 必然同价（四舍五入压平），
  //   导致「2 点强度与 1 点同价」→ 性价比逆序 → 鼓励堆最便宜的牌。
  //   数学上，只要取整就无法让「价格严格递增」与「性价比严格递减」同时成立。
  //   故价格保留小数，仅在 UI 展示时取整。
  //
  // 该形式天然满足两条体系约束（已验证 WV 1→70 全区间）：
  //   价格随 WV 严格递增      ⟺ PRICE_EXP > 0
  //   性价比随 WV 严格递减    ⟺ PRICE_EXP > 1
  const COEF = {
    PRICE_AT_5WV: 2.0,   // 基准锚点：WV=5（火/铪）价格 = 2.0 代币
    PRICE_EXP: 1.734,    // 由锚点 WV=32 → 50 代币解出：ln25/ln(32/5)
    MATERIAL_WEIGHT: 0.8,  // 合成时材料价值折损
    ASSEMBLY_RATE: 0.22,   // 每材料数的加工增值率
  };

  // ── 3. WV 权重 ──
  // 数字字段：按语义给出等效伤害
  const WV_WEIGHT = {
    damage: 1.0, block: 0.7, heal: 1.0, burn: 0.5, poison: 0.8,
    freeze: 0.4, fervor: 2.5, glory: 3.0, vulnerable: 1.0,
    multi: 1.0, summonHp: 0.5,
  };

  // ── 3b. 标志/结构化效果的等效价值 ──
  // 这些效果没有数字字段，旧版 wvOf 认不出 → 32 张牌 WV=0、价格失真。
  // 下列取值为「一个 5s 窗口内的大致等效伤害」，可调。
  const FLAG_VALUE = {
    // 时间轴操作
    skipWindupNext: 1.7,      // 省下一次前摇
    electricChantReduce: 2.0, // 电牌咏唱 -1s
    immuneSeconds: 1.2,       // 每点免疫秒数
    // 手牌/抽牌
    draw: 5.0,                // 每抽 1 张
    // 状态杠杆
    doublePoison: 3.0,        // 中毒翻倍（视局面）
    doubleBurn: 3.5,
    burnStackDamage: 4.0,     // 以燃烧层数结算伤害
    holyFire: 4.0,            // 燃烧不衰减
    incinerate: 4.0,          // 负面状态转燃烧
    freezeThenBurn: 3.0,
    kindle: 3.0,              // 点燃/助燃
    markCharcoal: 2.0,
    heatDrive: 3.0,
    emberEnd: 8.0,            // 终局：递增脉冲清燃烧
    nirvana: 6.0,             // 终局：生命减半换燃烧
    acDot: 5.0,               // 交流电：5s 内每秒 1 伤
    consumeFervorDamage: 1.2, // 每层激昂转化为伤害
    interrupt: 3.0,           // 打断
    stealth: 0.8,             // 每层隐匿
    env: 6.0,                 // 环境牌（持续收益）
    // 召唤流
    summonHeal: 1.0,
    summon: 6.0,              // 召唤物基础价值
    selfHpCost: -1.0,         // 失去生命是负收益
    martyrAllies: 8.0,        // 殉道：召唤物生命转伤害
    generator: 7.0,           // 发电机：持续产出
  };

  /** 召唤物 / 盟友强化的等效价值 */
  function allyValue(spec) {
    if (!spec) return 0;
    let v = 0;
    if (spec.hp) v += spec.hp * WV_WEIGHT.summonHp;
    if (spec.damage) v += spec.damage * 1.2;      // 自动攻击的持续输出
    if (spec.every) v *= Math.max(0.6, 5 / Math.max(1, spec.every));
    if (spec.mul != null) v += 3.0;               // 异化：降低属性但换效果
    return v;
  }

  // ── 4. 铭文耐性（原文：豪杰为 6） ──
  // 未指定角色时按最小耐性兜底，避免「不选角色」反而更强
  const TOLERANCE = { hero: 6, pure: 5, royalty: 5, rock: 6 };
  const DEFAULT_TOLERANCE = 5;

  /** 当前角色的铭文耐性（决定一个复杂「字」最多堆叠几个基本字） */
  function toleranceFor(charId) {
    return TOLERANCE[charId] || DEFAULT_TOLERANCE;
  }

  /** 耐性对应的最大合成咏唱秒数 / 标准伤害 */
  function maxCraftChant(charId) {
    return toleranceFor(charId);
  }
  function maxCraftDamage(charId) {
    return CHANT_DAMAGE[maxCraftChant(charId)] || CHANT_DAMAGE[4];
  }

  // ── 5. 窗口价值 WV ──
  /**
   * 计算一张牌在「一个 5s 窗口」内的等效价值。
   * 覆盖三类效果：
   *   ① 数字字段（damage/block/burn/…）
   *   ② 标志字段（emberEnd/generator/…）经 FLAG_VALUE 折算
   *   ③ 结构化字段（summon/buffAllies/scaleAlly/…）经 allyValue 折算
   */
  function wvOf(effect) {
    if (!effect || typeof effect !== "object") return 0;
    let wv = 0;
    const W = WV_WEIGHT;

    // ① 数字字段
    if (effect.damage != null) wv += effect.damage * W.damage;
    if (Array.isArray(effect.multi)) wv += effect.multi.reduce((s, d) => s + d, 0) * W.multi;
    if (Array.isArray(effect.multiBlock)) wv += effect.multiBlock.reduce((s, d) => s + d, 0) * W.block;
    if (effect.block != null) wv += effect.block * W.block;
    if (effect.heal != null) wv += effect.heal * W.heal;
    if (effect.burn != null) wv += effect.burn * W.burn;
    if (effect.poison != null) wv += effect.poison * W.poison;
    if (effect.freeze != null) wv += effect.freeze * W.freeze;
    if (effect.fervor != null) wv += effect.fervor * W.fervor;
    if (effect.glory != null) wv += effect.glory * W.glory;
    if (effect.vulnerable != null) wv += effect.vulnerable * W.vulnerable;

    // ② 标志字段（含布尔 true 与数值型）
    //    结构化字段交给 ③ 处理，这里跳过，避免重复计值
    const STRUCTURED = new Set(["summon", "generator", "buffAllies", "scaleAlly", "martyrAllies", "summonHeal"]);
    for (const [key, val] of Object.entries(FLAG_VALUE)) {
      if (STRUCTURED.has(key)) continue;
      const v = effect[key];
      if (v == null || v === false) continue;
      if (v === true) wv += val;
      else if (typeof v === "number") wv += val * v;
    }
    // 每段附加状态
    if (effect.burnPerHit) wv += effect.burnPerHit * W.burn * 4;
    if (effect.poisonPerHit) wv += effect.poisonPerHit * W.poison * 4;

    // ③ 结构化字段
    if (effect.summon) wv += allyValue(effect.summon);
    if (effect.generator) wv += allyValue(effect.generator);
    if (effect.buffAllies) wv += allyValue(effect.buffAllies) * 0.8;
    if (effect.scaleAlly) wv += allyValue(effect.scaleAlly);
    if (effect.martyrAllies) wv += FLAG_VALUE.martyrAllies;
    if (effect.summonHeal) wv += effect.summonHeal * FLAG_VALUE.summonHeal;
    if (effect.selfHpCost) wv += effect.selfHpCost * FLAG_VALUE.selfHpCost;

    // 范围攻击：多单位遭遇下价值更高，给轻度加成
    if (effect.aoe || effect.aoeAll) wv *= 1.25;
    // 穿透：无视护甲
    if (effect.pierce) wv += 3.0;

    return Math.round(wv * 100) / 100;
  }

  /**
   * 纯操作牌（压缩/堆砌/加热/冷却/增幅）的等效价值。
   * 它们从不单独打出，只作为通用合成的材料，
   * 故按「它们赋予产物的增益」定价：
   *   加热 +1攻/段、冷却 -1s 咏唱、增幅 +3攻、压缩/堆砌 为手牌调度
   */
  const PROCESS_VALUE = {
    heat: 3.0,    // 加热：伤害/护甲每段 +3
    cool: 2.0,    // 冷却：咏唱 -1s（约省 1s 行动经济）
    amp: 3.0,     // 增幅：下次攻击 +3
    compress: 2.0, // 压缩：弃1抽1
    stack: 2.5,   // 堆砌：延后抽 2
  };

  /** 咏唱对应的标准伤害（用于 damageByChant / blockByChant） */
  function standardDamage(seconds) {
    const s = Math.max(1, Math.min(6, Math.round(Number(seconds) || 1)));
    return CHANT_DAMAGE[s];
  }

  // ── 6. 定价 ──
  /**
   * 基础牌价格（未取整）
   * P = PRICE_AT_5WV × (WV/5)^PRICE_EXP
   * 已证明：PRICE_EXP > 1 ⇒ 价格严格递增 且 性价比严格递减（WV 1→70 全区间成立）
   */
  function priceOfBase(wv) {
    const w = Math.max(0, Number(wv) || 0);
    if (w <= 0) return 0;
    return COEF.PRICE_AT_5WV * Math.pow(w / 5, COEF.PRICE_EXP);
  }

  /**
   * 合成牌价格（未取整）
   * 取「成本加成」与「按强度定价」的较大者：
   *   - 成本加成 = Σ材料价 × (1 + 加工率 × 材料数)  ← 材料越多、链越深越贵
   *   - 按强度定价                                   ← 避免深链产物被贱卖
   * @param {number} wv 产物 WV
   * @param {number[]} materialPrices 材料各自价格（未取整）
   */
  function priceOfProduct(wv, materialPrices) {
    const mats = (materialPrices || []).filter((p) => p > 0);
    if (!mats.length) return priceOfBase(wv);
    const sum = mats.reduce((s, p) => s + p, 0);
    const costPlus = sum * (1 + COEF.ASSEMBLY_RATE * mats.length);
    const byValue = priceOfBase(wv);
    return Math.max(costPlus, byValue);
  }

  /** 性价比（WV / 价格）—— 体系要求它随强度单调递减 */
  function efficiency(wv, price) {
    if (!price) return 0;
    return Math.round((wv / price) * 1000) / 1000;
  }

  /** 展示用整数价格（最小 1 代币） */
  function displayPrice(p) {
    return Math.max(1, Math.round(Number(p) || 0));
  }

  // ── 7. 蒙特卡洛式风险模型（期望值） ──
  /**
   * 一轮搜打撤的期望收益
   * @param {number} cost 战备总成本
   * @param {number} p 存活率 0-1
   * @param {number} value 撤离收益
   */
  function expectedRunValue(cost, p, value) {
    const c = Math.max(0, Number(cost) || 0);
    const pr = Math.max(0, Math.min(1, Number(p) || 0));
    const v = Math.max(0, Number(value) || 0);
    const ev = pr * v - (1 - pr) * c;
    const breakEvenP = v + c > 0 ? 1 - v / (v + c) : 1;
    return { ev: Math.round(ev * 100) / 100, breakEvenP: Math.round(breakEvenP * 1000) / 1000 };
  }

  // ── 8. 威胁评估 ──
  /** 玩家可撑时长（生命 / 敌方DPS） */
  function survivalSeconds(enemyDps, playerHp) {
    const hp = Number(playerHp) || 60;
    const d = Number(enemyDps) || 0;
    if (d <= 0) return Infinity;
    return hp / d;
  }

  /** 依据敌方 DPS 与总血量给出档位建议 */
  function suggestTier(enemyDps, totalHp) {
    const d = Number(enemyDps) || 0;
    const hp = Number(totalHp) || 0;
    if (d >= 3.0 || hp >= 200) return 5;
    if (d >= 2.2) return 4;
    if (d >= 1.5) return 3;
    if (d >= 1.2) return 2;
    return 1;
  }

  const API = {
    CHANT_DAMAGE, COEF, WV_WEIGHT, FLAG_VALUE, PROCESS_VALUE, TOLERANCE, DEFAULT_TOLERANCE,
    wvOf, standardDamage, priceOfBase, priceOfProduct, efficiency, displayPrice,
    expectedRunValue, survivalSeconds, suggestTier,
    toleranceFor, maxCraftChant, maxCraftDamage,
    toleranceOf: toleranceFor,
  };

  // 浏览器：挂到 window
  if (root) root.FBEconomy = API;
  return API;
})(typeof window !== "undefined" ? window : null);
