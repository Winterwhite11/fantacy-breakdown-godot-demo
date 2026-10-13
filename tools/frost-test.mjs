#!/usr/bin/env node
/**
 * frost-test.mjs —— 冻结体系测试
 *
 * 设计约束（用户 2026-10-13 确认）：
 *   1. 冻结体系**不含直接伤害卡**（有意的缺陷），补偿是「冻结不衰减 + 满层斩杀」
 *   2. 核心卡 = 冻结增幅器「霜核」（后续冻结 +2）
 *   3. 三条跨体系小轴：冻结→燃烧、冻结→激昂、激昂→冻结
 *   4. 强度对标燃烧，但更慢更稳
 *   5. 合成路径必须有现实因果，且元素堆叠/组合可读
 *
 * 断言分两类：
 *   A. 内容与数据（不需战斗实例）
 *   B. 战斗行为（直接驱动 Combat，验证机制而非文案）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const HD = path.join(REPO, "html-demo");
const JS = path.join(HD, "js");

// ── DOM 桩 ──
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
const CB = win.CombatEngine;   // combat.js 导出的是 CombatEngine（默认 maxHp 见 PLAYER_MAX_HP）
/** 构造静默战斗实例（hooks 必需，否则 _log 会抛错） */
const newCombat = () => new CB({ onUpdate() {}, onLog() {}, onEnd() {} });
const FROST_NUMS = Array.from({ length: 15 }, (_, i) => 309 + i);
const frostSpecials = (T.specials || []).filter((s) => FROST_NUMS.includes(s.num));
const FE = C.WORD_EFFECTS;

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const check = (c, m) => (c ? ok(m) : bad(m));

console.log("═".repeat(78));
console.log("  冻结体系测试");
console.log("═".repeat(78));

// ══ A. 内容与数据 ══
console.log("\n▌ A1. 卡表收录（15 张，编号 309-323）");
check(frostSpecials.length === 15, `卡表收录 ${frostSpecials.length}/15 张`);
{
  const missing = FROST_NUMS.filter((n) => !frostSpecials.some((s) => s.num === n));
  check(missing.length === 0, `编号连续无缺${missing.length ? "：" + missing.join(",") : ""}`);
  const noId = frostSpecials.filter((s) => /^w\d+$/.test(s.id || ""));
  check(noId.length === 0, `id 均为正式英文名${noId.length ? "：" + noId.map((s) => s.id).join(",") : ""}`);
}

console.log("\n▌ A2. 核心约束：冻结卡不得有直接伤害");
{
  // 1) 文案层面
  const dmgText = frostSpecials.filter((s) => /造成\s*\d+\s*点?伤害/.test(s.effect || ""));
  check(dmgText.length === 0,
    `卡表文案无「造成N点伤害」${dmgText.length ? "：" + dmgText.map((s) => s.name).join("、") : ""}`);
  // 2) 效果数据层面（更硬的约束）
  const withDmg = frostSpecials.filter((s) => {
    const fx = FE[s.id];
    return fx && (fx.damage != null || fx.multi != null);
  });
  check(withDmg.length === 0,
    `效果数据无 damage/multi${withDmg.length ? "：" + withDmg.map((s) => s.name).join("、") : ""}`);
  // 3) 与燃烧系对比，证明这是**冻结特有**的约束
  const burnDmg = ["molotov", "firearm", "cremate", "fire_rain"].filter((id) => FE[id]?.damage != null);
  check(burnDmg.length >= 3, `对照：燃烧系仍有 ${burnDmg.length} 张直接伤害卡（缺陷是冻结独有）`);
}

console.log("\n▌ A3. 核心卡「霜核」为冻结增幅器");
{
  const core = frostSpecials.find((s) => s.name === "霜核");
  check(!!core, `核心卡存在：${core?.name}`);
  check(FE.frost_core?.freezeBonus > 0, `霜核效果为冻结增幅：freezeBonus=${FE.frost_core?.freezeBonus}`);
  // 对标：燃烧核心「助燃」、电核心「磁场」都存在
  check(FE.kindle?.kindle === true, "对照：燃烧核心「助燃」= 对燃烧敌人伤害+50%");
  check(FE.magnetic_field?.electricChantReduce === 1, "对照：电核心「磁场」= 电牌咏唱 -1s");
}

console.log("\n▌ A4. 三条跨体系小轴");
{
  check(FE.melt_to_flame?.freezeToBurn > 0,
    `冻结→燃烧：融雪成焰 freezeToBurn=${FE.melt_to_flame?.freezeToBurn}`);
  check(FE.hot_breath?.freezeToFervor > 0 || FE.thermal_power?.freezeToFervorAoe > 0,
    `冻结→激昂：炽热呼吸/温差发电`);
  check(FE.current_frost?.fervor > 0 && FE.current_frost?.freeze > 0,
    `激昂→冻结：电流凝霜 fervor=${FE.current_frost?.fervor} freeze=${FE.current_frost?.freeze}`);
  // 既有卡也应参与跨体系（超导 = 电+冰）
  check(FE.superconduct?.fervor > 0, "既有卡「超导」也是激昂↔冻结的桥");
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
  check(frostDup.length === 0,
    `冻结卡配方无重复${frostDup.length ? "：" + frostDup.join("；") : ""}`);
  // 每张冻结卡都要有配方
  const noRecipe = frostSpecials.filter((s) => !(s.materials_alts || []).length);
  check(noRecipe.length === 0,
    `每张冻结卡都有配方${noRecipe.length ? "：" + noRecipe.map((s) => s.name).join("、") : ""}`);
  // 配方中的材料必须真实存在
  const unknown = [];
  for (const s of frostSpecials) {
    for (const alt of s.materials_alts || []) {
      for (const m of alt) {
        if (!base.has(m) && !FE[m] && !(T.specials || []).some((x) => x.id === m)) unknown.push(`${s.name}←${m}`);
      }
    }
  }
  check(unknown.length === 0, `配方材料均存在${unknown.length ? "：" + unknown.join("、") : ""}`);
  // 体系内递进：313/314 用霜核，322/323 用永冻（有产业链）
  const chain = frostSpecials.filter((s) => (s.materials_alts || []).some((a) => a.some((m) => FE[m])));
  check(chain.length >= 4, `${chain.length} 张卡以体系内卡为材料（形成产业链）`);
}

// ══ B. 战斗行为 ══
console.log("\n▌ B1. 霜核增幅对所有冻结来源生效");
{
  const mk = (withCore) => {
    const cb = newCombat();
    cb.enemies = [{ uid: "e1", name: "靶子", hp: 999, maxHp: 999, block: 0, dead: false,
                    burn: 0, poison: 0, freeze: 0, weak: 0, vulnerable: 0 }];
    if (withCore) cb.player.freezeBonus = 2;
    return cb;
  };
  const a = mk(false), b = mk(true);
  a._addFreeze(a.enemies[0], 3, "测试");
  b._addFreeze(b.enemies[0], 3, "测试");
  check(a.enemies[0].freeze === 3, `无霜核：冻结 3`);
  check(b.enemies[0].freeze === 5, `有霜核：冻结 3+2=5（增幅生效）`);
  // 既有入口（_applyStatusToTarget）也要吃增幅
  const c = mk(true);
  c._applyStatusToTarget("e1", "freeze", 4, "元素牌");
  check(c.enemies[0].freeze === 6, `既有入口同样吃增幅：4+2=${c.enemies[0].freeze}`);
}

console.log("\n▌ B2. 冻结阈值 → 虚弱 / 易伤 / 斩杀");
{
  const mk = (fr) => {
    const cb = newCombat();
    cb.enemies = [{ uid: "e1", name: "靶子", hp: 30, maxHp: 30, block: 0, dead: false,
                    burn: 0, poison: 0, freeze: fr, weak: 0, vulnerable: 0 }];
    return cb;
  };
  const w = mk(11); w._applyFreezeThresholds(w.enemies[0], "靶子");
  check(w.enemies[0].weak > 0 && w.enemies[0].vulnerable === 0, "冻结 11 > 10 → 虚弱");
  const v = mk(21); v._applyFreezeThresholds(v.enemies[0], "靶子");
  check(v.enemies[0].vulnerable > 0, "冻结 21 > 20 → 易伤");
  const k = mk(31); k._applyFreezeThresholds(k.enemies[0], "靶子");
  check(k.enemies[0].dead === true, "冻结 31 > 生命上限 30 → 直接死亡（斩杀线）");
}

console.log("\n▌ B3. 冻结不衰减（对比燃烧会衰减）");
{
  const cb = newCombat();
  cb.enemies = [{ uid: "e1", name: "靶子", hp: 999, maxHp: 999, block: 0, dead: false,
                  burn: 8, poison: 0, freeze: 8, weak: 0, vulnerable: 0 }];
  cb._settleStatusTick();
  check(cb.enemies[0].freeze === 8, `冻结 8 经一次结算仍为 ${cb.enemies[0].freeze}（不衰减）`);
  check(cb.enemies[0].burn < 8, `对照：燃烧 8 衰减为 ${cb.enemies[0].burn}`);
}

console.log("\n▌ B4. 冰河世纪 / 永冻：每结算 +N 冻结");
{
  const cb = newCombat();
  cb.enemies = [{ uid: "e1", name: "靶子", hp: 999, maxHp: 999, block: 0, dead: false,
                  burn: 0, poison: 0, freeze: 0, weak: 0, vulnerable: 0 }];
  cb.freezePerTurn = 3;
  cb._settleStatusTick();
  check(cb.enemies[0].freeze === 3, `每结算 +3 → ${cb.enemies[0].freeze}`);
  cb._settleStatusTick();
  check(cb.enemies[0].freeze === 6, `再结算 → ${cb.enemies[0].freeze}（累计）`);
}

console.log("\n▌ B5. 跨体系转化（冻结→燃烧 / 冻结→激昂）");
{
  // 冻结→燃烧
  const cb = newCombat();
  cb.enemies = [{ uid: "e1", name: "靶子", hp: 999, maxHp: 999, block: 0, dead: false,
                  burn: 0, poison: 0, freeze: 10, weak: 0, vulnerable: 0 }];
  cb._resolveEffect({ freezeToBurn: 1 }, { name: "融雪成焰" }, "e1");
  check(cb.enemies[0].freeze === 0 && cb.enemies[0].burn === 10,
    `冻结 10 → 燃烧 ${cb.enemies[0].burn}（伤害由燃烧体系产生，非冻结直接伤害）`);
  // 冻结→激昂（自身）
  const cb2 = newCombat();
  cb2.player.freeze = 9;
  cb2._resolveEffect({ freezeToFervor: 3 }, { name: "极寒之心" }, "e1");
  check(cb2.player.fervor === 3 && cb2.player.freeze === 0,
    `自身冻结 9 → 激昂 ${cb2.player.fervor}（每 3 层换 1）`);
  // 破碎：清冻结 → 易伤（不造伤害）
  const cb3 = newCombat();
  cb3.enemies = [{ uid: "e1", name: "靶子", hp: 50, maxHp: 50, block: 0, dead: false,
                   burn: 0, poison: 0, freeze: 12, weak: 0, vulnerable: 0 }];
  cb3._resolveEffect({ shatterToVulnerable: 1 }, { name: "破碎" }, "e1");
  check(cb3.enemies[0].hp === 50 && cb3.enemies[0].vulnerable === 12,
    `破碎：冻结 12 → 易伤 12，且 HP 未变（${cb3.enemies[0].hp}）— 不造成伤害`);
}

console.log("\n▌ B6. 凝结：护甲转冻结");
{
  const cb = newCombat();
  cb.enemies = [{ uid: "e1", name: "靶子", hp: 999, maxHp: 999, block: 0, dead: false,
                  burn: 0, poison: 0, freeze: 0, weak: 0, vulnerable: 0 }];
  cb.player.block = 20;
  cb._resolveEffect({ blockToFreeze: 0.5 }, { name: "凝结" }, "e1");
  check(cb.enemies[0].freeze === 10, `护甲 20 × 0.5 → 冻结 ${cb.enemies[0].freeze}`);
}

console.log("\n▌ B7. 凛冬降临：每张冻结牌触发群体 +1");
{
  const cb = newCombat();
  cb.enemies = [
    { uid: "e1", name: "甲", hp: 999, maxHp: 999, block: 0, dead: false, burn: 0, poison: 0, freeze: 0, weak: 0, vulnerable: 0 },
    { uid: "e2", name: "乙", hp: 999, maxHp: 999, block: 0, dead: false, burn: 0, poison: 0, freeze: 0, weak: 0, vulnerable: 0 },
  ];
  cb.player.freezeOnFrostCard = 1;
  cb._resolveEffect({ freeze: 5, aoe: true }, { name: "某冻结牌" }, "aoe");
  // 触发 1 层（凛冬）+ 霜核无加成（0）+ 本体 5 层
  check(cb.enemies[0].freeze === 6, `冻结牌触发凛冬：5 + 1 = ${cb.enemies[0].freeze}`);
  check(cb.enemies[1].freeze === 6, `群体生效：${cb.enemies[1].freeze}`);
  // 非冻结牌不触发
  cb.enemies[0].freeze = 0; cb.enemies[1].freeze = 0;
  cb._resolveEffect({ block: 5 }, { name: "纯护甲牌" }, "self");
  check(cb.enemies[0].freeze === 0, "非冻结牌不触发凛冬");
}

console.log("\n▌ B8. 冻结牌判定（_isFrostEffect 覆盖新旧冻结来源）");
{
  const cb = newCombat();
  check(cb._isFrostEffect(FE.snow), "214 雪 判定为冻结牌");
  check(cb._isFrostEffect(FE.hypothermia), "230 失温 判定为冻结牌");
  check(cb._isFrostEffect(FE.permafrost), "307 冻土 判定为冻结牌");
  check(cb._isFrostEffect(FE.frost_core), "312 霜核 判定为冻结牌");
  check(!cb._isFrostEffect(FE.ash), "238 灰烬 不判为冻结牌");
  check(!cb._isFrostEffect(FE.firearm), "221 火枪 不判为冻结牌");
}

console.log("\n" + "─".repeat(78));
console.log(`  通过 ${pass} · 失败 ${fail}`);
console.log("─".repeat(78));
process.exit(fail ? 1 : 0);
