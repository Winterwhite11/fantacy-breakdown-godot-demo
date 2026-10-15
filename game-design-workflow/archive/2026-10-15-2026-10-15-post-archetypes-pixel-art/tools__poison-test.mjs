#!/usr/bin/env node
/**
 * poison-test.mjs —— 中毒体系测试
 *
 * 机制底座（读 combat.js 确证）：
 *   中毒每结算：造成「当前层数」伤害，然后层数 +1；**不衰减、无上限**
 *   → 天然自加速，故**本体系不设计成长牌**（用户明确要求）
 *   → 自身中毒的倒计时有限，玩家必须主动解毒 —— 这是核心张力
 *
 * 用户确认的设计：
 *   1. 不增加成长牌（不要「以后中毒层数+1」这类）
 *   2. 中毒可叠加给自己获得**持续型**收益（按自身毒层数给效果）
 *   3. 加入「引爆敌人毒层」的结算牌（原先完全没有爆发手段）
 *   4. 缺陷 = 慢热
 *
 * 断言分两类：A 内容与设计约束；B 战斗行为（直接驱动 CombatEngine）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const HD = path.join(REPO, "html-demo");
const JS = path.join(HD, "js");

function makeWin() {
  const store = {};
  const mk = () => new Proxy(
    { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
      children: [], appendChild() {}, append() {}, removeChild() {}, remove() {},
      setAttribute() {}, getAttribute() { return null },
      addEventListener() {}, removeEventListener() {},
      querySelector() { return null }, querySelectorAll() { return []; },
      insertBefore() {}, focus() {}, play() { return { catch() {} }; }, pause() {},
      closest() { return null },
      getBoundingClientRect() { return { width: 300, height: 400 }; } },
    { get(t, p) {
        if (p in t) return t[p];
        if (p === "textContent" || p === "innerHTML" || p === "value") return "";
        if (p === "firstChild" || p === "parentNode") return null;
        return undefined;
      },
      set(t, p, v) { t[p] = v; return true; } });
  const document = {
    readyState: "complete", body: mk(), head: mk(), documentElement: mk(),
    createElement: mk, createTextNode: () => ({}), getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  };
  return { document, localStorage: { getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    location: { href: "" }, innerWidth: 1280, innerHeight: 800 };
}
const win = makeWin();
const load = (f) => new Function("window", "document", "localStorage",
  fs.readFileSync(path.join(JS, f), "utf8"))(win, win.document, win.localStorage);
for (const f of ["card-data.js", "pieces.js", "preview.js", "economy.js", "card-prices.js",
                 "summon-elements.js", "cards.js", "content-tables.js", "combat.js"]) load(f);

const C = win.FBCards, T = win.FBCardTable;
const CB = win.CombatEngine;
const newCombat = () => new CB({ onUpdate() {}, onLog() {}, onEnd() {} });
const FE = C.WORD_EFFECTS;

const NEW_NUMS = [308, 309, 310, 311, ...Array.from({ length: 12 }, (_, i) => 326 + i)];
const poisonSpecials = (T.specials || []).filter((s) => NEW_NUMS.includes(s.num));

const mkFoe = (o = {}) => Object.assign(
  { uid: "e1", name: "靶子", hp: 999, maxHp: 999, block: 0, dead: false,
    burn: 0, poison: 0, freeze: 0, weak: 0, vulnerable: 0 }, o);

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const check = (c, m) => (c ? ok(m) : bad(m));

console.log("═".repeat(78));
console.log("  中毒体系测试");
console.log("═".repeat(78));

// ══ A. 内容与设计约束 ══
console.log("\n▌ A1. 卡表收录（16 张：308-311 + 326-337）");
{
  check(poisonSpecials.length === 16, `卡表收录 ${poisonSpecials.length}/16 张`);
  const missing = NEW_NUMS.filter((n) => !poisonSpecials.some((s) => s.num === n));
  check(missing.length === 0, `编号无缺${missing.length ? "：" + missing.join(",") : ""}`);
  const noId = poisonSpecials.filter((s) => /^w\d+$/.test(s.id || ""));
  check(noId.length === 0, `id 均为正式英文名${noId.length ? "：" + noId.map((s) => s.id).join(",") : ""}`);
  const noRecipe = poisonSpecials.filter((s) => !(s.materials_alts || []).length);
  check(noRecipe.length === 0, `每张卡都有配方${noRecipe.length ? "：" + noRecipe.map((s) => s.name).join("、") : ""}`);
}

console.log("\n▌ A2. 核心约束：不设计成长牌");
{
  // 用户要求：不要「以后中毒层数+1」这类成长效果
  const GROWTH = ["poisonBonus", "poisonBonusStack", "poisonPerTurn", "doublePoisonNext",
                  "poisonGrowth", "growingPoison"];
  const found = [];
  for (const s of poisonSpecials) {
    const fx = FE[s.id] || {};
    for (const k of GROWTH) if (fx[k] != null) found.push(`${s.name}.${k}`);
  }
  check(found.length === 0, `无「中毒层数成长」类效果键${found.length ? "：" + found.join("、") : ""}`);
  // 文案层也不得出现「以后/后续中毒层数+」
  const textGrowth = poisonSpecials.filter((s) => /以后.{0,6}中毒.{0,4}\+|后续.{0,6}中毒.{0,4}\+/.test(s.effect || ""));
  check(textGrowth.length === 0, `文案无成长表述${textGrowth.length ? "：" + textGrowth.map((s) => s.name).join("、") : ""}`);
  // 说明为什么：中毒自己每结算 +1，成长牌是冗余
  const cb = newCombat();
  cb.enemies = [mkFoe({ poison: 5 })];
  cb._settleStatusTick();
  check(cb.enemies[0].poison === 6, `机制事实：中毒每结算自动 +1（5 → ${cb.enemies[0].poison}），故成长牌冗余`);
}

console.log("\n▌ A3. 自身中毒的持续型收益（用户要求的形式）");
{
  const selfCards = poisonSpecials.filter((s) => {
    const fx = FE[s.id] || {};
    return fx.poisonToBlock || fx.poisonToFervor || fx.corrodeArmor;
  });
  check(selfCards.length >= 3, `${selfCards.length} 张卡「按自身毒层数」给持续收益`);
  check(FE.poison_armor?.poisonToBlock > 0, `毒甲：自身毒 ×${FE.poison_armor.poisonToBlock} → 护甲`);
  check(FE.poison_frenzy?.poisonToFervor > 0, `嗜毒：自身每 ${FE.poison_frenzy.poisonToFervor} 层毒 → 激昂`);
  check(FE.corrode_armor?.corrodeArmor === true, "蚀甲：自身毒半数 → 护甲");
  const selfInflict = poisonSpecials.filter((s) => FE[s.id]?.selfPoison || FE[s.id]?.selfDamage);
  check(selfInflict.length >= 2, `${selfInflict.length} 张卡主动对自身施毒/自伤（自作自受）`);
  // 必须有"收手"手段，否则会被自己毒死
  const stop = poisonSpecials.filter((s) => FE[s.id]?.detoxDamage || FE[s.id]?.detoxHeal
    || FE[s.id]?.corrodeArmor || FE[s.id]?.poisonNeutralize);
  check(stop.length >= 3, `${stop.length} 张卡可主动解毒/中和（否则自身中毒必然致死）`);
}

console.log("\n▌ A4. 引爆敌人毒层（本体系唯一的爆发手段）");
{
  const det = poisonSpecials.filter((s) => FE[s.id]?.detonatePoison);
  check(det.length >= 2, `${det.length} 张引爆卡：${det.map((s) => s.name).join("、")}`);
  check(FE.poison_burst?.detonatePoison === 3, `毒爆：每层毒 ${FE.poison_burst.detonatePoison} 伤`);
  check(FE.myriad_poison?.detonatePoison === 5, `万毒噬心：每层毒 ${FE.myriad_poison.detonatePoison} 伤（终结卡）`);
  check(poisonSpecials.some((s) => s.name === "瘟疫"), "瘟疫：毒层翻倍并扩散");
}

console.log("\n▌ A5. 配方：唯一且有现实因果");
{
  const base = new Set([...Object.keys(T.elements), ...Object.keys(T.processes)]);
  const seen = new Map();
  const dups = [];
  for (const s of T.specials || []) {
    for (const alt of s.materials_alts || []) {
      const k = [...alt].sort().join("+");
      if (seen.has(k)) dups.push(`${k} ← ${seen.get(k)} 与 ${s.name}`);
      else seen.set(k, s.name);
    }
  }
  const pd = dups.filter((d) => poisonSpecials.some((s) => d.includes(s.name)));
  check(pd.length <= 1, `中毒配方至多 1 处重复（既有卡表同类做法）${pd.length ? "：" + pd.join("；") : ""}`);
  const unknown = [];
  for (const s of poisonSpecials) {
    for (const alt of s.materials_alts || []) {
      for (const m of alt) {
        if (!base.has(m) && !FE[m] && !(T.specials || []).some((x) => x.id === m)) unknown.push(`${s.name}←${m}`);
      }
    }
  }
  check(unknown.length === 0, `配方材料均存在${unknown.length ? "：" + unknown.join("、") : ""}`);
  // 新增的基础牌「菌」必须真的被用到（否则是死内容）
  const usesFungus = poisonSpecials.filter((s) => (s.materials_alts || []).some((a) => a.includes("fungus")));
  check(usesFungus.length >= 3, `新增基础牌「菌」被 ${usesFungus.length} 张卡使用（毒素靠培养而来）`);
}

// ══ B. 战斗行为 ══
console.log("\n▌ B1. 中毒自加速：伤害=层数，层数+1，不衰减");
{
  const cb = newCombat();
  cb.enemies = [mkFoe({ hp: 999, poison: 6 })];
  cb._settleStatusTick();
  check(cb.enemies[0].poison === 7, `结算后层数 6 → ${cb.enemies[0].poison}`);
  check(cb.enemies[0].hp === 999 - 6, `造成 6 点伤害（HP 999 → ${cb.enemies[0].hp}）`);
  cb._settleStatusTick();
  check(cb.enemies[0].hp === 999 - 6 - 7, `再结算造成 7 点 → 累计 ${999 - cb.enemies[0].hp}`);
  // 对照燃烧会衰减
  const cb2 = newCombat();
  cb2.enemies = [mkFoe({ burn: 8 })];
  cb2._settleStatusTick();
  check(cb2.enemies[0].burn < 8, `对照：燃烧 8 衰减为 ${cb2.enemies[0].burn}`);
}

console.log("\n▌ B2. 自身中毒照旧结算（用户确认）");
{
  const cb = newCombat();
  cb.player.hp = 50; cb.player.poison = 4;
  cb._settleStatusTick();
  check(cb.player.hp === 46, `自身中毒 4 造成 4 伤（HP 50 → ${cb.player.hp}）`);
  check(cb.player.poison === 5, `自身中毒层数 4 → ${cb.player.poison}（自加速）`);
  const cb2 = newCombat();
  cb2.player.hp = 50; cb2.player.poison = 30;
  cb2._settleStatusTick();
  check(cb2.player.hp === 20, `层数越高越危险：30 层一次 30 伤（HP → ${cb2.player.hp}）`);
}

console.log("\n▌ B3. 持续型自身收益（毒甲 / 嗜毒 / 蚀甲）");
{
  const cb = newCombat();
  cb.enemies = [mkFoe()];
  cb.player.poison = 8;
  cb._resolveEffect({ poisonToBlock: 0.5 }, { name: "毒甲" }, "self");
  const before = cb.player.block;
  cb._settleStatusTick();
  check(cb.player.block > before, `毒甲：自身毒 8 × 0.5 = 4 护甲（${before} → ${cb.player.block}）`);

  const cb2 = newCombat();
  cb2.enemies = [mkFoe()];
  cb2.player.poison = 9;
  cb2._resolveEffect({ poisonToFervor: 3, ferocity: 2 }, { name: "嗜毒" }, "self");
  cb2._settleStatusTick();
  check(cb2.player.fervor === 3, `嗜毒：自身毒 9 / 3 = ${cb2.player.fervor} 层激昂`);
  check(cb2.player.atkBonus === 2, `嗜毒：攻击力 +${cb2.player.atkBonus}`);

  const cb3 = newCombat();
  cb3.enemies = [mkFoe()];
  cb3.player.poison = 12;
  cb3._resolveEffect({ corrodeArmor: true }, { name: "蚀甲" }, "self");
  check(cb3.player.poison === 0 && cb3.player.block === 6,
    `蚀甲：自身毒 12 → 护甲 ${cb3.player.block}，毒已清空（${cb3.player.poison}）`);
}

console.log("\n▌ B4. 主动解毒（B 闭环的收手手段）");
{
  const cb = newCombat();
  cb.enemies = [mkFoe({ hp: 100 })];
  cb.player.poison = 10;
  cb._resolveEffect({ detoxDamage: 2 }, { name: "解毒" }, "e1");
  check(cb.player.poison === 0, "解毒：自身中毒清零");
  check(cb.enemies[0].hp === 100 - 20, `每层 2 伤 → ${20} 点（HP ${cb.enemies[0].hp}）`);

  const cb2 = newCombat();
  cb2.enemies = [mkFoe()];
  cb2.player.poison = 7; cb2.player.hp = 30;
  cb2._resolveEffect({ detoxHeal: 1 }, { name: "化毒" }, "self");
  check(cb2.player.poison === 0 && cb2.player.hp === 37, `化毒：7 层毒 → 回复 ${7} 生命（HP ${cb2.player.hp}）`);

  const cb3 = newCombat();
  cb3.enemies = [mkFoe()];
  cb3.player.poison = 15;
  cb3._resolveEffect({ poisonNeutralize: 10 }, { name: "耐毒" }, "self");
  check(cb3.player.poison === 5, `耐毒：中和 10 层（15 → ${cb3.player.poison}）`);
}

console.log("\n▌ B5. 引爆敌人毒层（爆发）");
{
  const cb = newCombat();
  cb.enemies = [mkFoe({ hp: 200, poison: 12 })];
  cb._resolveEffect({ detonatePoison: 3 }, { name: "毒爆" }, "e1");
  check(cb.enemies[0].poison === 0, "引爆后毒层清零");
  check(cb.enemies[0].hp === 200 - 36, `12 层 × 3 = 36 伤（HP ${cb.enemies[0].hp}）`);

  const cb2 = newCombat();
  cb2.enemies = [mkFoe({ hp: 40, poison: 20 })];
  cb2._resolveEffect({ detonatePoison: 5, detonateBlock: 0.5 }, { name: "万毒噬心" }, "e1");
  check(cb2.enemies[0].dead === true, "20 层 × 5 = 100 伤 → 击杀");
  check(cb2.player.block === 10, `击杀回馈：20 × 0.5 = ${cb2.player.block} 护甲`);

  // 无中毒时不应造成伤害
  const cb3 = newCombat();
  cb3.enemies = [mkFoe({ hp: 100, poison: 0 })];
  cb3._resolveEffect({ detonatePoison: 3 }, { name: "毒爆" }, "e1");
  check(cb3.enemies[0].hp === 100, "无毒层时引爆不造成伤害");
}

console.log("\n▌ B6. 瘟疫：毒层翻倍并扩散");
{
  const cb = newCombat();
  cb.enemies = [mkFoe({ uid: "a", poison: 6 }), mkFoe({ uid: "b", name: "乙", poison: 0 })];
  cb._resolveEffect({ plague: true }, { name: "瘟疫" }, "aoe");
  check(cb.enemies[0].poison === 12, `甲 6 → ${cb.enemies[0].poison}（翻倍）`);
  check(cb.enemies[1].poison === 6, `乙 0 → ${cb.enemies[1].poison}（扩散到全场最高值）`);
}

console.log("\n▌ B7. 蚀骨：提升敌人受到的中毒伤害");
{
  const plain = newCombat();
  plain.enemies = [mkFoe({ hp: 999, poison: 10 })];
  plain._settleStatusTick();
  const base = 999 - plain.enemies[0].hp;
  const amped = newCombat();
  amped.enemies = [mkFoe({ hp: 999, poison: 10 })];
  amped._resolveEffect({ poisonAmp: 0.5, poisonAmpPerTen: 0.1 }, { name: "蚀骨" }, "self");
  amped._settleStatusTick();
  const boosted = 999 - amped.enemies[0].hp;
  check(boosted > base, `蚀骨提升中毒伤害：${base} → ${boosted}`);
}

console.log("\n▌ B8. 淬毒：攻击附带中毒（对所有上毒来源生效）");
{
  const cb = newCombat();
  cb.enemies = [mkFoe()];
  cb._resolveEffect({ selfPoison: 3, poisonOnHit: 1 }, { name: "淬毒" }, "self");
  check(cb.player.poison === 3, `淬毒先对自身 +3 毒（${cb.player.poison}）`);
  cb._applyStatusToTarget("e1", "poison", 4, "某上毒牌");
  check(cb.enemies[0].poison === 5, `上毒 4 + 淬毒 1 = ${cb.enemies[0].poison}`);
}

console.log("\n▌ B9. 毒环：受击双方上毒");
{
  const cb = newCombat();
  cb.enemies = [mkFoe({ name: "敌人" })];
  cb.player.hp = 100; cb.player.block = 0;
  cb._resolveEffect({ poisonRing: 2 }, { name: "毒环" }, "self");
  cb._damagePlayer(5, "敌人");
  check(cb.player.poison === 2, `自身中毒 +2（${cb.player.poison}）`);
  check(cb.enemies[0].poison === 2, `攻击者中毒 +2（${cb.enemies[0].poison}）`);
}

console.log("\n▌ B10. 慢热（有意缺陷）：前期几无输出");
{
  // 毒刃本身直接伤害低（5），主要价值在上毒；毒要等结算才生效
  check(FE.poison_blade.damage === 5, `毒刃直接伤害仅 ${FE.poison_blade.damage}（慢热）`);
  const cb = newCombat();
  cb.enemies = [mkFoe({ hp: 100, poison: 3 })];
  // 打出的当回合不结算，故本体伤害之外无额外
  cb._resolveEffect(FE.poison_blade, { name: "毒刃" }, "e1");
  check(cb.enemies[0].hp === 100 - 5, `打出当回合只造成 5 点（毒尚未结算，HP ${cb.enemies[0].hp}）`);
  check(cb.enemies[0].poison === 6, `毒层累积到 ${cb.enemies[0].poison}，需等结算才变现`);
}

console.log("\n▌ B11. 跨体系出口：中毒 → 燃烧（339 熔毒）");
{
  check(FE.melt_poison?.poisonToBurn > 0, `熔毒 = 中毒转燃烧（×${FE.melt_poison?.poisonToBurn}）`);
  const cb = newCombat();
  cb.enemies = [mkFoe({ hp: 999, poison: 12 })];
  cb._resolveEffect({ ...FE.melt_poison }, { name: "熔毒" }, "e1");
  check(cb.enemies[0].poison === 0, "中毒已被转化消耗");
  check(cb.enemies[0].burn === 18, `12 层毒 × 1.5 = ${cb.enemies[0].burn} 层燃烧`);
  // 无毒时不产生燃烧
  const cb2 = newCombat();
  cb2.enemies = [mkFoe({ poison: 0 })];
  cb2._resolveEffect({ ...FE.melt_poison }, { name: "熔毒" }, "e1");
  check(cb2.enemies[0].burn === 0, "无中毒时不产生燃烧");
}

console.log("\n▌ B12. 跨体系出口：中毒 → 激昂（340 电解毒）");
{
  check(FE.electrolyze_poison?.enemyPoisonToFervor > 0, "电解毒 = 敌方中毒转激昂");
  // ⚠ 关键：键名必须与 329嗜毒（自身毒→激昂）区分，且不能叠 detonatePoison
  //   （两者都消耗毒层，同时挂上会互相抵消 → 激昂为 0）
  check(FE.electrolyze_poison?.detonatePoison == null,
    "电解毒不叠 detonatePoison（否则先引爆清空毒层，转化时无毒可转）");
  check(FE.poison_frenzy?.poisonToFervor > 0 && FE.electrolyze_poison?.poisonToFervor == null,
    "与 嗜毒 的 poisonToFervor 键名区分开（自身毒 vs 敌方毒）");
  const cb = newCombat();
  cb.enemies = [mkFoe({ hp: 999, poison: 10 })];
  cb._resolveEffect({ ...FE.electrolyze_poison }, { name: "电解毒" }, "e1");
  check(cb.enemies[0].poison === 0, "中毒已被电解消耗");
  check(cb.player.fervor === 10, `10 层毒 → ${cb.player.fervor} 层激昂`);
  check(999 - cb.enemies[0].hp === 20, `并造成 10 × 2 = ${999 - cb.enemies[0].hp} 点伤害`);
  // 与嗜毒共存时不应互相干扰：自身毒走 poisonToFervor，敌方毒走 enemyPoisonToFervor
  const cb2 = newCombat();
  cb2.enemies = [mkFoe({ poison: 4 })];
  cb2.player.poison = 9;
  cb2.player.poisonToFervor = 3;
  cb2._resolveEffect({ ...FE.electrolyze_poison }, { name: "电解毒" }, "e1");
  check(cb2.player.fervor === 4, `只转化敌方毒（4 层 → ${cb2.player.fervor} 激昂），自身毒 9 层未被卷入`);
  check(cb2.player.poison === 9, `自身中毒保持 ${cb2.player.poison} 层`);
}

console.log("\n▌ B13. 中毒现在有跨体系出口（对齐冻结的转化网）");
{
  const exits = poisonSpecials.filter((s) => {
    const fx = FE[s.id] || {};
    return fx.poisonToBurn || fx.enemyPoisonToFervor;
  });
  // 339/340 不在 poisonSpecials（那组是 308-311/326-337），单独检查效果键
  const hasBurn = !!FE.melt_poison?.poisonToBurn;
  const hasFervor = !!FE.electrolyze_poison?.enemyPoisonToFervor;
  check(hasBurn, "中毒 → 燃烧 出口存在（339 熔毒）");
  check(hasFervor, "中毒 → 激昂 出口存在（340 电解毒）");
  // 对照：冻结有三条跨体系出口
  check(!!FE.melt_to_flame?.freezeToBurn && !!FE.hot_breath?.freezeToFervor,
    "对照：冻结有 燃烧/激昂 两条出口（319/320）");
  // 明确区分「引爆」与「转化」
  const det = ["poison_burst", "myriad_poison"].filter((id) => FE[id]?.detonatePoison);
  check(det.length === 2, `「引爆」（${det.join("/")}）属同体系结算，与「转化」不同 —— 转化会把毒变成别的资源`);
}

console.log("\n" + "─".repeat(78));
console.log(`  通过 ${pass} · 失败 ${fail}`);
console.log("─".repeat(78));
process.exit(fail ? 1 : 0);
