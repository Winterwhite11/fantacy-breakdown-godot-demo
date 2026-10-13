#!/usr/bin/env node
/**
 * frost-test.mjs —— 冻结体系测试
 *
 * 设计（用户 2026-10-13 逐轮确认）：
 *   1. 核心卡 = **214 雪**，对标 233助燃 / 247电：同为「元素 + 增幅」的 2 字段核心牌
 *      （用户明确要求雪**保留原有的范围9伤**，故它是冻结体系唯一的直接伤害例外）
 *   2. 除核心卡外，冻结卡**不得有直接伤害**（有意缺陷），补偿是
 *      「冻结不衰减 + 满层斩杀 + 三条跨体系小轴」
 *   3. 312 霜核 = 核心进阶（雪+增幅，冻结 +4），对标 249磁场
 *   4. 三条轴：冻结→燃烧、冻结→激昂、激昂→冻结
 *
 * 断言分两类：
 *   A. 内容与数据（不需战斗实例）
 *   B. 战斗行为（直接驱动 CombatEngine，验证机制而非文案）
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

/** 冻结体系卡号：核心卡 214 + 312-325 */
const CORE_NUM = 214;
const FROST_NUMS = [CORE_NUM, ...Array.from({ length: 14 }, (_, i) => 312 + i)];
const frostSpecials = (T.specials || []).filter((s) => FROST_NUMS.includes(s.num));
const FE = C.WORD_EFFECTS;

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const check = (c, m) => (c ? ok(m) : bad(m));

console.log("═".repeat(78));
console.log("  冻结体系测试");
console.log("═".repeat(78));

console.log("\n▌ A1. 卡表收录（核心 214 + 312-325，共 15 张）");
{
  check(frostSpecials.length === 15, `卡表收录 ${frostSpecials.length}/15 张`);
  const missing = FROST_NUMS.filter((n) => !frostSpecials.some((s) => s.num === n));
  check(missing.length === 0, `编号无缺${missing.length ? "：" + missing.join(",") : ""}`);
  const noId = frostSpecials.filter((s) => /^w\d+$/.test(s.id || ""));
  check(noId.length === 0, `id 均为正式英文名${noId.length ? "：" + noId.map((s) => s.id).join(",") : ""}`);
  const noRecipe = frostSpecials.filter((s) => !(s.materials_alts || []).length);
  check(noRecipe.length === 0, `每张卡都有配方${noRecipe.length ? "：" + noRecipe.map((s) => s.name).join("、") : ""}`);
}

console.log("\n▌ A2. 核心卡 = 214 雪，对标 助燃/电（2 字段：元素 + 增幅）");
{
  const core = frostSpecials.find((s) => s.num === CORE_NUM);
  check(!!core && core.name === "雪", `核心卡：${core?.num} ${core?.name}`);
  const alts = (core?.materials_alts || []).map((a) => a.join("+"));
  check(alts.includes("ice+amp"), `配方为「冰+增幅」：${alts.join(" | ")}`);
  check(alts.every((a) => a.split("+").length === 2), `2 字段（${alts.join("/")}）`);
  const kindle = (T.specials || []).find((s) => s.name === "助燃");
  const elec = (T.specials || []).find((s) => s.num === 247);
  check((kindle?.materials_alts || []).some((a) => a.join("+") === "fire+amp"),
    "对照 助燃 = 火+增幅（2 字段核心）");
  check((elec?.materials_alts || []).some((a) => a.join("+") === "sand+amp"),
    "对照 电 = 砂+增幅（2 字段核心）");
  check(FE.snow?.freezeBonus === 2, `雪的增幅：后续冻结 +${FE.snow?.freezeBonus}`);
  check(FE.snow?.core === true, "雪 标记为核心卡（core:true）");
  check(FE.frost_core?.freezeBonus === 4, `霜核 为进阶核心：冻结 +${FE.frost_core?.freezeBonus}`);
  const fc = frostSpecials.find((s) => s.name === "霜核");
  check(!!fc && (fc.materials_alts || []).some((a) => a.join("+") === "snow+amp"),
    "霜核 = 雪+增幅（以核心卡为材料）");
}

console.log("\n▌ A3. 缺陷约束：除核心卡外，冻结卡无直接伤害");
{
  const others = frostSpecials.filter((s) => s.num !== CORE_NUM);
  const dmgText = others.filter((s) => /造成\s*\d+\s*点?伤害/.test(s.effect || ""));
  check(dmgText.length === 0,
    `其余 14 张文案无「造成N点伤害」${dmgText.length ? "：" + dmgText.map((s) => s.name).join("、") : ""}`);
  const withDmg = others.filter((s) => {
    const fx = FE[s.id];
    return fx && (fx.damage != null || fx.multi != null);
  });
  check(withDmg.length === 0,
    `其余 14 张效果数据无 damage/multi${withDmg.length ? "：" + withDmg.map((s) => s.name).join("、") : ""}`);
  check(FE.snow?.damage === 9 && FE.snow?.aoe === true,
    `记录在案的唯一例外：雪保留范围 ${FE.snow?.damage} 伤害（用户要求）`);
  const frostWithDmg = frostSpecials.filter((s) => FE[s.id]?.damage != null);
  check(frostWithDmg.length === 1 && frostWithDmg[0].num === CORE_NUM,
    `冻结体系带伤害的卡恰好只有核心卡（${frostWithDmg.map((s) => s.name).join("、")}）`);
  const burnDmg = ["molotov", "firearm", "cremate", "fire_rain"].filter((id) => FE[id]?.damage != null);
  check(burnDmg.length >= 3, `对照：燃烧系仍有 ${burnDmg.length} 张直接伤害卡（缺陷为冻结独有）`);
}

console.log("\n▌ A4. 三条跨体系小轴");
{
  check(FE.melt_to_flame?.freezeToBurn > 0,
    `冻结→燃烧：融雪成焰 freezeToBurn=${FE.melt_to_flame?.freezeToBurn}`);
  check(FE.hot_breath?.freezeToFervor > 0 || FE.thermal_power?.freezeToFervorAoe > 0,
    "冻结→激昂：炽热呼吸 / 温差发电");
  check(FE.current_frost?.fervor > 0 && FE.current_frost?.freeze > 0,
    `激昂→冻结：电流凝霜 fervor=${FE.current_frost?.fervor} freeze=${FE.current_frost?.freeze}`);
  check(FE.superconduct?.fervor > 0, "既有卡「超导」也是激昂↔冻结的桥");
  check(FE.frost_aegis?.freezeToBlock > 0,
    `防御终端：寒霜庇护把冻结转为护甲 freezeToBlock=${FE.frost_aegis?.freezeToBlock}`);
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
  const frostDup = dups.filter((d) => frostSpecials.some((s) => d.includes(s.name)));
  check(frostDup.length === 0, `冻结卡配方互不重复${frostDup.length ? "：" + frostDup.join("；") : ""}`);
  const unknown = [];
  for (const s of frostSpecials) {
    for (const alt of s.materials_alts || []) {
      for (const m of alt) {
        if (!base.has(m) && !FE[m] && !(T.specials || []).some((x) => x.id === m)) unknown.push(`${s.name}←${m}`);
      }
    }
  }
  check(unknown.length === 0, `配方材料均存在${unknown.length ? "：" + unknown.join("、") : ""}`);
  const chain = frostSpecials.filter((s) => (s.materials_alts || []).some((a) => a.some((m) => FE[m])));
  check(chain.length >= 4, `${chain.length} 张卡以体系内卡为材料（形成产业链）`);
}

const mkFoe = (o = {}) => Object.assign(
  { uid: "e1", name: "靶子", hp: 999, maxHp: 999, block: 0, dead: false,
    burn: 0, poison: 0, freeze: 0, weak: 0, vulnerable: 0 }, o);

console.log("\n▌ B1. 核心增幅对所有冻结来源生效");
{
  const a = newCombat(), b = newCombat();
  a.enemies = [mkFoe()]; b.enemies = [mkFoe()];
  b.player.freezeBonus = 2;
  a._addFreeze(a.enemies[0], 3, "测试");
  b._addFreeze(b.enemies[0], 3, "测试");
  check(a.enemies[0].freeze === 3, "无核心：冻结 3");
  check(b.enemies[0].freeze === 5, `有核心：冻结 3+2=${b.enemies[0].freeze}`);
  const c = newCombat();
  c.enemies = [mkFoe()]; c.player.freezeBonus = 2;
  c._applyStatusToTarget("e1", "freeze", 4, "元素牌");
  check(c.enemies[0].freeze === 6, `既有入口同样吃增幅：4+2=${c.enemies[0].freeze}`);
}

console.log("\n▌ B2. 冻结阈值 → 虚弱 / 易伤 / 斩杀");
{
  const w = newCombat(); w.enemies = [mkFoe({ hp: 30, maxHp: 30, freeze: 11 })];
  w._applyFreezeThresholds(w.enemies[0], "靶子");
  check(w.enemies[0].weak > 0 && w.enemies[0].vulnerable === 0, "冻结 11 > 10 → 虚弱");
  const v = newCombat(); v.enemies = [mkFoe({ hp: 30, maxHp: 30, freeze: 21 })];
  v._applyFreezeThresholds(v.enemies[0], "靶子");
  check(v.enemies[0].vulnerable > 0, "冻结 21 > 20 → 易伤");
  const k = newCombat(); k.enemies = [mkFoe({ hp: 30, maxHp: 30, freeze: 31 })];
  k._applyFreezeThresholds(k.enemies[0], "靶子");
  check(k.enemies[0].dead === true, "冻结 31 > 生命上限 30 → 斩杀");
}

console.log("\n▌ B3. 冻结不衰减（对比燃烧会衰减）");
{
  const cb = newCombat();
  cb.enemies = [mkFoe({ burn: 8, freeze: 8 })];
  cb._settleStatusTick();
  check(cb.enemies[0].freeze === 8, `冻结 8 经结算仍为 ${cb.enemies[0].freeze}`);
  check(cb.enemies[0].burn < 8, `对照：燃烧 8 衰减为 ${cb.enemies[0].burn}`);
}

console.log("\n▌ B4. 每结算 +N 冻结（冰河世纪 / 永冻）");
{
  const cb = newCombat();
  cb.enemies = [mkFoe()]; cb.freezePerTurn = 3;
  cb._settleStatusTick();
  check(cb.enemies[0].freeze === 3, `每结算 +3 → ${cb.enemies[0].freeze}`);
  cb._settleStatusTick();
  check(cb.enemies[0].freeze === 6, `再结算 → ${cb.enemies[0].freeze}（累计）`);
}

console.log("\n▌ B5. 跨体系转化");
{
  const cb = newCombat();
  cb.enemies = [mkFoe({ freeze: 10 })];
  cb._resolveEffect({ freezeToBurn: 1 }, { name: "融雪成焰" }, "e1");
  check(cb.enemies[0].freeze === 0 && cb.enemies[0].burn === 10,
    `冻结 10 → 燃烧 ${cb.enemies[0].burn}（伤害由燃烧产生）`);
  const cb2 = newCombat(); cb2.player.freeze = 9;
  cb2._resolveEffect({ freezeToFervor: 2 }, { name: "炽热呼吸" }, "e1");
  check(cb2.player.fervor === 4 && cb2.player.freeze === 0,
    `自身冻结 9 → 激昂 ${cb2.player.fervor}（每 2 层换 1）`);
  const cb3 = newCombat(); cb3.enemies = [mkFoe({ hp: 50, maxHp: 50, freeze: 12 })];
  cb3._resolveEffect({ shatterToVulnerable: 1 }, { name: "破碎" }, "e1");
  check(cb3.enemies[0].hp === 50 && cb3.enemies[0].vulnerable === 12,
    `破碎：冻结 12 → 易伤 12，HP 未变（${cb3.enemies[0].hp}）— 不造伤害`);
  const cb4 = newCombat();
  cb4.enemies = [mkFoe({ uid: "a", freeze: 8 }), mkFoe({ uid: "b", name: "乙", freeze: 4 })];
  cb4._resolveEffect({ freezeToFervorAoe: 2 }, { name: "温差发电" }, "aoe");
  check(cb4.player.fervor === 6, `群体转化：8/2 + 4/2 = ${cb4.player.fervor} 激昂`);
}

console.log("\n▌ B6. 凝结：护甲转冻结");
{
  const cb = newCombat();
  cb.enemies = [mkFoe()]; cb.player.block = 20;
  cb._resolveEffect({ blockToFreeze: 0.5 }, { name: "凝结" }, "e1");
  check(cb.enemies[0].freeze === 10, `护甲 20 × 0.5 → 冻结 ${cb.enemies[0].freeze}`);
}

console.log("\n▌ B7. 寒霜庇护：冻结转护甲（防御终端）");
{
  const cb = newCombat();
  cb.enemies = [mkFoe()];
  cb.player.freeze = 8;
  cb._resolveEffect({ freezeToBlock: 0.5 }, { name: "寒霜庇护" }, "self");
  check(cb.player.freezeToBlock === 0.5, "已登记冻结→护甲比例");
  const before = cb.player.block;
  cb._settleStatusTick();
  check(cb.player.block > before, `结算后护甲 ${before} → ${cb.player.block}（冻结 8 × 0.5 = 4）`);
}

console.log("\n▌ B8. 凛冬降临：每张冻结牌触发群体 +1");
{
  const cb = newCombat();
  cb.enemies = [mkFoe({ uid: "e1" }), mkFoe({ uid: "e2", name: "乙" })];
  cb.player.freezeOnFrostCard = 1;
  cb._resolveEffect({ freeze: 5, aoe: true }, { name: "某冻结牌" }, "aoe");
  check(cb.enemies[0].freeze === 6, `5 + 1 = ${cb.enemies[0].freeze}`);
  check(cb.enemies[1].freeze === 6, "群体生效");
  cb.enemies[0].freeze = 0; cb.enemies[1].freeze = 0;
  cb._resolveEffect({ block: 5 }, { name: "纯护甲牌" }, "self");
  check(cb.enemies[0].freeze === 0, "非冻结牌不触发");
}

console.log("\n▌ B9. 冻结牌判定（覆盖新旧来源）");
{
  const cb = newCombat();
  check(cb._isFrostEffect(FE.snow), "214 雪（核心）");
  check(cb._isFrostEffect(FE.hypothermia), "230 失温");
  check(cb._isFrostEffect(FE.permafrost), "307 冻土（环境牌）");
  check(cb._isFrostEffect(FE.frost_core), "312 霜核");
  check(cb._isFrostEffect(FE.frost_aegis), "325 寒霜庇护");
  check(!cb._isFrostEffect(FE.ash), "238 灰烬 不判为冻结牌");
  check(!cb._isFrostEffect(FE.firearm), "221 火枪 不判为冻结牌");
}

console.log("\n" + "─".repeat(78));
console.log(`  通过 ${pass} · 失败 ${fail}`);
console.log("─".repeat(78));
process.exit(fail ? 1 : 0);
