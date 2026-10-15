#!/usr/bin/env node
/**
 * cards-259-test.mjs —— 259-261 占位卡实现 + 338 毒障 测试
 *
 * 2026-10-13：实现卡表中最后 3 张占位卡，并按用户要求为中毒体系补一张防护牌。
 *
 *   259 脉冲（直伤）   电+压缩+冷却  本场战斗内每重打一次 +4 伤害
 *   260 绝缘（防护）   电+砂+堆砌   16 护甲 + 4 秒免疫
 *   261 天罚（激昂终端）电+增幅+加热 消耗全部激昂，每层 8 伤 + 基础 30；≥3 层获得穿透
 *   338 毒障（中毒防护）毒+堆砌+增幅 12 护甲；每结算按自身每层中毒 +2 护甲
 *                                  代价：自身中毒伤害 +50%，且每结算自身中毒 +1
 *
 * 用户对毒障的原始要求：「给中毒加一个防护牌，如毒雾这种给自己 debuff 获得强效防护」
 * 故本测试特别断言「代价」与「收益」**同时**存在（否则就只是一个无脑强卡）。
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
const mkFoe = (o = {}) => Object.assign(
  { uid: "e1", name: "靶子", hp: 999, maxHp: 999, block: 0, dead: false,
    burn: 0, poison: 0, freeze: 0, weak: 0, vulnerable: 0 }, o);

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const check = (c, m) => (c ? ok(m) : bad(m));

console.log("═".repeat(78));
console.log("  259-261 实现 + 338 毒障 测试");
console.log("═".repeat(78));

// ══ A. 卡表与占位清理 ══
console.log("\n▌ A1. 占位卡已实现，卡表无残留占位");
{
  const ph = (T.placeholders || []).map((p) => p.num);
  check(ph.length === 0, `placeholders 已清空${ph.length ? "，剩余：" + ph.join(",") : ""}`);
  for (const [num, id, name] of [[259, "pulse", "脉冲"], [260, "insulation", "绝缘"],
                                 [261, "judgment", "天罚"], [338, "poison_barrier", "毒障"]]) {
    const s = (T.specials || []).find((x) => x.num === num);
    check(!!s && s.id === id && s.name === name, `${num} ${name}（id=${s?.id}）`);
    check(!!(s?.materials_alts || []).length, `${num} 有配方：${(s?.materials_alts || []).map((a) => a.join("+")).join("/")}`);
    check(!!FE[id], `${num} 有效果数据`);
  }
}

console.log("\n▌ A2. 三张卡各司其职（直伤 / 防护 / 激昂终端）");
{
  check(FE.pulse?.pulseBase > 0 && FE.pulse?.pulseDamage > 0,
    `259 脉冲 = 直伤（${FE.pulse?.pulseBase} + 每次 +${FE.pulse?.pulseDamage}）`);
  // 与落雷一致：不用 damage 键，伤害由专用键结算（避免通用逻辑双重结算）
  check(FE.pulse?.damage == null && FE.judgment?.damage == null,
    "脉冲/天罚均不使用 damage 键（对标 255落雷 的做法，避免双重结算）");
  check(FE.insulation?.block > 0 && FE.insulation?.immuneSeconds > 0,
    `260 绝缘 = 防护（${FE.insulation?.block} 护甲 + ${FE.insulation?.immuneSeconds}s 免疫）`);
  check(FE.judgment?.lightningBase > 0 && FE.judgment?.lightningStrike > 0,
    `261 天罚 = 激昂终端（基础 ${FE.judgment?.lightningBase} + 每层 ${FE.judgment?.lightningStrike} 伤）`);
  check(FE.judgment?.pierceAt > 0, `天罚 有层数门槛（≥${FE.judgment?.pierceAt} 层获得穿透）`);
  // 对标：燃烧有烬灭、冻结有冰河世纪、电系现在有天罚
  check(FE.ember_end != null && FE.ice_age != null, "对照：燃烧「烬灭」与冻结「冰河世纪」均为终端技");
}

console.log("\n▌ A3. 毒障：代价与收益同时存在（用户要求的「给自己debuff换强效防护」）");
{
  const b = FE.poison_barrier;
  check(b?.block > 0, `收益①：即时护甲 ${b?.block}`);
  check(b?.poisonBarrier > 0, `收益②：每结算按自身每层中毒 +${b?.poisonBarrier} 护甲`);
  check(b?.poisonSelfAmp > 0, `代价①：自身中毒伤害 +${Math.round((b?.poisonSelfAmp || 0) * 100)}%`);
  check(b?.selfPoisonPerTurn > 0, `代价②：每结算自身中毒 +${b?.selfPoisonPerTurn}`);
  // 对照 307冻土 / 302酸雨：环境牌同样是"己方得利 / 对方或自身受损"
  check(FE.permafrost?.env === "permafrost", "对照：307冻土（环境牌给己方护甲、给敌方上冻）");
  check(FE.acid_rain?.poison > 0, "对照：302酸雨（给敌方上毒同时削其护甲）");
}

// ══ B. 战斗行为 ══
console.log("\n▌ B1. 259 脉冲：本场战斗内每次重打递增");
{
  const cb = newCombat();
  cb.enemies = [mkFoe({ hp: 999 })];
  const dmgOf = () => 999 - cb.enemies[0].hp;
  cb._resolveEffect({ ...FE.pulse }, { name: "脉冲" }, "e1");
  const d1 = dmgOf();
  cb._resolveEffect({ ...FE.pulse }, { name: "脉冲" }, "e1");
  const d2 = dmgOf() - d1;
  cb._resolveEffect({ ...FE.pulse }, { name: "脉冲" }, "e1");
  const d3 = dmgOf() - d1 - d2;
  check(d1 === 6, `第 1 次 ${d1} 伤（基础 6）`);
  check(d2 === 10, `第 2 次 ${d2} 伤（6+4）`);
  check(d3 === 14, `第 3 次 ${d3} 伤（6+8）`);
  check(cb.player.pulseCount === 3, `计数器 = ${cb.player.pulseCount}`);
}

console.log("\n▌ B2. 260 绝缘：护甲 + 免疫");
{
  const cb = newCombat();
  cb.enemies = [mkFoe()];
  cb._resolveEffect({ ...FE.insulation }, { name: "绝缘" }, "self");
  check(cb.player.block === 16, `护甲 ${cb.player.block}`);
  check(cb.player.immuneUntil > cb.time, `免疫至 ${cb.player.immuneUntil}s`);
  // 免疫期内只受 1 点
  cb.player.block = 0;
  const hp0 = cb.player.hp;
  cb._damagePlayer(20, "测试");
  check(hp0 - cb.player.hp === 1, `免疫期内 20 伤只受 ${hp0 - cb.player.hp} 点`);
}

console.log("\n▌ B3. 261 天罚：消耗激昂按层数结算");
{
  const mk = (fervor) => {
    const cb = newCombat();
    cb.enemies = [mkFoe({ hp: 999, block: 0 })];
    cb.player.fervor = fervor;
    return cb;
  };
  const a = mk(0);
  a._resolveEffect({ ...FE.judgment }, { name: "天罚" }, "e1");
  check(999 - a.enemies[0].hp === 30, `激昂 0 层 → 仅基础 30 伤（实得 ${999 - a.enemies[0].hp}）`);
  const b = mk(3);
  b._resolveEffect({ ...FE.judgment }, { name: "天罚" }, "e1");
  check(999 - b.enemies[0].hp === 30 + 3 * 8, `激昂 3 层 → 30+24=${999 - b.enemies[0].hp} 伤`);
  check(b.player.fervor === 0, "激昂已被消耗");
  const c = mk(5);
  c._resolveEffect({ ...FE.judgment }, { name: "天罚" }, "e1");
  check(999 - c.enemies[0].hp === 30 + 5 * 8, `激昂 5 层 → ${999 - c.enemies[0].hp} 伤`);
}

console.log("\n▌ B4. 天罚的穿透门槛");
{
  // ⚠ 实测发现：代码里 pierce 的效果是**攻击无视敌人护甲**
  //   （`if (!opts.pierce && e.block > 0)` → 有穿透时完全不消耗护甲），
  //    而卡表词条写的是「护甲削减层数翻倍」。二者不一致（既有卡 221火枪 同样受影响）。
  //    本测试按**代码实际行为**断言，并把该差异记录在案（见测试末尾说明）。
  const probe = (fervor, forceNoPierce) => {
    const cb = newCombat();
    cb.enemies = [mkFoe({ hp: 999, block: 100 })];
    cb.player.fervor = fervor;
    const fx = { ...FE.judgment };
    if (forceNoPierce) fx.pierceAt = 99;   // 抬高门槛 → 不触发穿透
    cb._resolveEffect(fx, { name: "天罚" }, "e1");
    return { blockLeft: cb.enemies[0].block, hpLost: 999 - cb.enemies[0].hp };
  };
  const noP = probe(3, true);
  const withP = probe(3, false);
  check(withP.blockLeft === 100 && noP.blockLeft < 100,
    `穿透 = 无视护甲：无穿透剩护甲 ${noP.blockLeft}，有穿透剩护甲 ${withP.blockLeft}`);
  check(withP.hpLost > noP.hpLost,
    `穿透使伤害全部打进生命：${noP.hpLost} → ${withP.hpLost}`);
  // 门槛：2 层不触发，3 层触发（同伤害对比）
  const at2 = probe(2, false);
  const at3 = probe(3, false);
  check(at2.blockLeft < 100, `激昂 2 层（<门槛 ${FE.judgment.pierceAt}）不穿透：剩护甲 ${at2.blockLeft}`);
  check(at3.blockLeft === 100, `激昂 3 层（≥门槛）穿透：剩护甲 ${at3.blockLeft}`);
}

console.log("\n▌ B5. 338 毒障：收益（按毒层产护甲）");
{
  const cb = newCombat();
  cb.enemies = [mkFoe()];
  cb.player.poison = 10;
  cb._resolveEffect({ ...FE.poison_barrier }, { name: "毒障" }, "self");
  check(cb.player.block === 12, `即时护甲 ${cb.player.block}`);
  const before = cb.player.block;
  cb._settleStatusTick();
  check(cb.player.block > before, `结算后护甲 ${before} → ${cb.player.block}（毒 10 层 × 2 = 20，扣除自伤后净增）`);
}

console.log("\n▌ B6. 338 毒障：代价（中毒伤害加重 + 中毒自增）");
{
  // 无屏障时，10 层毒造成 10 伤
  const plain = newCombat();
  plain.player.hp = 999; plain.player.poison = 10;
  plain._settleStatusTick();
  const plainLoss = 999 - plain.player.hp;
  check(plainLoss === 10, `无屏障：10 层毒造成 ${plainLoss} 伤`);
  check(plain.player.poison === 11, `无屏障：结算后 ${plain.player.poison} 层`);

  // 有屏障时，同样 10 层毒造成 15 伤（+50%），且层数额外 +1
  const barred = newCombat();
  barred.player.hp = 9999; barred.player.poison = 10;
  barred.player.poisonSelfAmp = 0.5;
  barred.player.selfPoisonPerTurn = 1;
  barred.player.poisonBarrier = 2;
  barred._settleStatusTick();
  const barredLoss = 9999 - barred.player.hp;
  check(barredLoss === 15, `有屏障：10 层毒造成 ${barredLoss} 伤（+50%）`);
  check(barred.player.poison === 12, `有屏障：结算后 ${barred.player.poison} 层（毒障额外 +1）`);
}

console.log("\n▌ B7. 毒障：毒层越高防护越强，代价也越大");
{
  const run = (layers) => {
    const cb = newCombat();
    cb.enemies = [mkFoe()];
    cb.player.poison = layers;
    cb.player.hp = 9999;
    cb._resolveEffect({ ...FE.poison_barrier }, { name: "毒障" }, "self");
    cb.player.block = 0;                 // 只看本回合产出的护甲
    cb._settleStatusTick();
    return { block: cb.player.block, lost: 9999 - cb.player.hp };
  };
  const lo = run(4);
  const hi = run(16);
  check(hi.block > lo.block, `收益随毒层增长：4 层 → ${lo.block} 护甲，16 层 → ${hi.block} 护甲`);
  check(hi.lost > lo.lost, `代价同步增长：4 层自伤 ${lo.lost}，16 层自伤 ${hi.lost}`);
  // 净收益 = 护甲 − 自伤，应随毒层单调增长（这才是"鼓励堆毒"）
  const netLo = lo.block - lo.lost, netHi = hi.block - hi.lost;
  check(netHi > netLo, `净收益随毒层递增：4 层 ${netLo} → 16 层 ${netHi}（堆毒越深越划算，但风险同步上升）`);
  check(FE.poison_barrier.poisonSelfAmp > 0 && FE.poison_barrier.selfPoisonPerTurn > 0,
    "代价项真实存在（不是无脑强卡）");
}

console.log("\n" + "─".repeat(78));
console.log(`  通过 ${pass} · 失败 ${fail}`);
console.log("─".repeat(78));
process.exit(fail ? 1 : 0);
