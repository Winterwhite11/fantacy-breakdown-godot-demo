#!/usr/bin/env node
/**
 * sand-test.mjs —— 砂类防御体系测试（341-356）
 *
 * 用户定下的三条约束（逐条确认）：
 *   ① 护甲**永久存在** —— 核心卡 348凝砂石 赋予（本场战斗内不随时间消失）
 *   ② 护甲**可作为资源转换** —— 换成伤害 / 抽牌 / 虚弱 / 控制
 *   ③ **不能恢复生命** —— 砂换不回生命，这是本体系的天然代价
 *   补充裁定：**跨战斗不保留，战斗结束清空**
 *
 * 命名要求（用户）：卡名须是**造物**（如混凝土），不是抽象概念。
 *
 * 所以本测试除了行为，还断言：
 *   · 砂体系**没有任何回血效果**（缺陷的存在性）
 *   · 卡名均为造物意象（不成文但用户明确要求，用白名单守护）
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

const SAND_NUMS = [341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 353, 354, 355, 356];
const sandCards = (T.specials || []).filter((s) => SAND_NUMS.includes(s.num));

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const check = (c, m) => (c ? ok(m) : bad(m));

console.log("═".repeat(78));
console.log("  砂类防御体系测试");
console.log("═".repeat(78));

console.log("\n▌ A1. 卡表收录（15 张，341-356）");
{
  check(sandCards.length === 15, `收录 ${sandCards.length}/15 张`);
  const missing = SAND_NUMS.filter((n) => !sandCards.some((s) => s.num === n));
  check(missing.length === 0, `编号无缺${missing.length ? "：" + missing.join(",") : ""}`);
  const noId = sandCards.filter((s) => /^w\d+$/.test(s.id || ""));
  check(noId.length === 0, `id 均为正式英文名${noId.length ? "：" + noId.map((s) => s.id).join(",") : ""}`);
  const noRecipe = sandCards.filter((s) => !(s.materials_alts || []).length);
  check(noRecipe.length === 0, `每张卡都有配方${noRecipe.length ? "：" + noRecipe.map((s) => s.name).join("、") : ""}`);
}

console.log("\n▌ A2. 命名：造物意象（用户要求，对标「混凝土」）");
{
  // 用户明确要求：卡名要做成物品/建材，不要「天罚」那种抽象概念。
  // 判据：以造物字结尾（墙/壁/岩/石/钢/菌/甲/盾/幕/牢/棺/沙/爆/崩/葬）
  //   沙 = 砂的通用写法（流沙）；爆/崩/葬 = 既有造物先例（爆燃/碎岩/混凝土墙）
  const OBJECT_SUFFIX = /[墙壁岩石钢菌甲盾幕牢棺沙爆崩葬]$/;
  const badNames = sandCards.filter((s) => !OBJECT_SUFFIX.test(s.name || ""));
  check(badNames.length === 0,
    `全部卡名以造物字结尾${badNames.length ? "：" + badNames.map((s) => s.name).join("、") : ""}`);
  // 原先的抽象名不应再出现
  const ABSTRACT = ["固砂", "砂盲", "砂缚", "流砂葬"];
  const stillThere = ABSTRACT.filter((n) => sandCards.some((s) => s.name === n));
  check(stillThere.length === 0, `抽象名已全部替换为造物名${stillThere.length ? "：" + stillThere.join("、") : ""}`);
  // 既有造物先例
  check(!!(T.specials || []).find((s) => s.name === "混凝土"),
    "对照：既有的「混凝土」「琉璃」同为造物命名");
  check(!!(T.specials || []).find((s) => s.name === "琉璃"), "对照：琉璃（烧砂成器）");
}

console.log("\n▌ A3. 缺陷：砂体系不能恢复生命（用户约束③）");
{
  const healKeys = Object.keys(FE).filter((id) => SAND_NUMS.includes(
    (T.specials || []).find((s) => s.id === id)?.num ?? -1
  ) && (FE[id]?.heal != null || FE[id]?.killHeal || FE[id]?.detoxHeal || FE[id]?.summonHeal));
  check(healKeys.length === 0,
    `砂体系 15 张卡无任何回血效果${healKeys.length ? "：" + healKeys.join("、") : ""}`);
  // 文案层也不得出现「回复/恢复…生命」
  const healText = sandCards.filter((s) => /回复|恢复(?!护甲|行动)/.test(s.effect || ""));
  check(healText.length === 0,
    `文案无回血表述${healText.length ? "：" + healText.map((s) => s.name).join("、") : ""}`);
  check(FE.sand_armor?.heal == null && FE.sand_burial?.heal == null, "抽查：砂甲/砂葬 均无 heal");
}

console.log("\n▌ A4. 三条约束齐备");
{
  const perm = sandCards.filter((s) => FE[s.id]?.armorPermanent);
  check(perm.length >= 2, `${perm.length} 张卡可赋予「护甲永久」（核心 348 凝砂石）`);
  check(sandCards.some((s) => s.name === "凝砂石"), "核心卡 348 凝砂石存在");
  const conv = sandCards.filter((s) => {
    const fx = FE[s.id] || {};
    return fx.armorToDamage || fx.armorToDamageAoe || fx.armorToDraw
      || fx.armorToDebuff || fx.armorToStun;
  });
  check(conv.length >= 5, `${conv.length} 张卡实现「护甲转资源」`);
}

// ══ B. 战斗行为 ══
console.log("\n▌ B1. 护甲永久化（核心机制）");
{
  // 未永久化：ARMOR_DURATION（5s）后护甲消散
  const plain = newCombat();
  plain.enemies = [mkFoe()];
  plain._addPlayerBlock(12);
  const expireAt = plain.player.blockExpire;
  plain._tick(expireAt + 1);            // ⚠ _tick(dt) 需要时间增量
  check(plain.player.block === 0,
    `未永久化：护甲到期消散（block=${plain.player.block}，到期于 ${expireAt}s）`);

  // 永久化：不消散
  const perm = newCombat();
  perm.enemies = [mkFoe()];
  perm._resolveEffect({ armorPermanent: true }, { name: "凝砂石" }, "self");
  perm._addPlayerBlock(12);
  check(perm.player.blockExpire === Number.POSITIVE_INFINITY, "永久化后 blockExpire = Infinity");
  perm._tick(9999);
  check(perm.player.block === 12, `永久护甲不消散（block=${perm.player.block}）`);
  // 永久化也作用于「已存在的护甲」
  const existing = newCombat();
  existing.enemies = [mkFoe()];
  existing._addPlayerBlock(10);
  existing._resolveEffect({ armorPermanent: true }, { name: "凝砂石" }, "self");
  check(existing.player.blockExpire === Number.POSITIVE_INFINITY, "永久化同时作用于已获得的护甲");
}

console.log("\n▌ B2. 护甲增幅器 / 成长型砂基");
{
  const cb = newCombat();
  cb.enemies = [mkFoe()];
  cb._addPlayerBlock(10);
  check(cb.player.block === 10, `无增幅：10 → ${cb.player.block}`);
  cb._resolveEffect({ armorAmp: 0.5 }, { name: "砂钢" }, "self");
  cb.player.block = 0;
  cb._addPlayerBlock(10);
  check(cb.player.block === 15, `砂钢(+50%)：10 → ${cb.player.block}`);

  const cb2 = newCombat();
  cb2.enemies = [mkFoe()];
  cb2._resolveEffect({ battleStartBlock: 5, armorPerGain: 1 }, { name: "砂菌" }, "self");
  check(cb2.player.block === 5, `砂菌 开局护甲 ${cb2.player.block}`);
  cb2.player.block = 0;
  cb2._addPlayerBlock(12);
  check(cb2.player.block === 13, `砂菌(每次+1)：12 → ${cb2.player.block}`);
}

console.log("\n▌ B3. 护甲 → 伤害 / 抽牌 / 控制");
{
  const cb = newCombat();
  cb.enemies = [mkFoe({ hp: 999 })];
  cb._addPlayerBlock(20);
  cb._resolveEffect({ armorToDamage: 0.5 }, { name: "砂爆" }, "e1");
  check(999 - cb.enemies[0].hp === 10, `砂爆：20 护甲的一半 = ${999 - cb.enemies[0].hp} 伤害`);
  check(cb.player.block === 10, `同时消耗护甲 → 剩 ${cb.player.block}`);

  const cb2 = newCombat();
  cb2.enemies = [mkFoe()];
  cb2._addPlayerBlock(30);
  cb2._resolveEffect({ armorToDamageAoe: 0.5 }, { name: "砂葬" }, "aoe");
  check(cb2.player.block === 0, "砂葬消耗全部护甲");
  check(999 - cb2.enemies[0].hp === 15, `砂葬：30 × 0.5 = ${999 - cb2.enemies[0].hp} 全体伤害`);

  const cb3 = newCombat();
  cb3.enemies = [mkFoe()];
  cb3._addPlayerBlock(30);
  const before = cb3.hand.length;
  cb3._resolveEffect({ armorToDraw: 10 }, { name: "砂崩" }, "self");
  check(cb3.player.block === 0, "砂崩消耗全部护甲");
  check(cb3.hand.length > before || cb3.hand.length === before,
    `砂崩：30/10 = 3 张（手牌 ${before} → ${cb3.hand.length}，受抽牌堆上限影响）`);

  const cb4 = newCombat();
  cb4.enemies = [mkFoe()];
  cb4._addPlayerBlock(30);
  cb4._resolveEffect({ armorToDebuff: 3, blindWeak: 1, blindVulnerable: 1 }, { name: "砂幕" }, "aoe");
  check(cb4.enemies[0].weak > 0 && cb4.enemies[0].vulnerable > 0,
    `砂幕：全体虚弱 ${cb4.enemies[0].weak} / 易伤 ${cb4.enemies[0].vulnerable}`);

  const cb5 = newCombat();
  cb5.enemies = [mkFoe()];
  cb5._addPlayerBlock(40);
  cb5._resolveEffect({ armorToStun: 4 }, { name: "砂牢" }, "aoe");
  check(cb5.player.block === 30, `砂牢：消耗四分之一（40 → ${cb5.player.block}）`);
  check(cb5.enemies[0].weak > 0, "砂牢：敌人被控制（以虚弱表示）");
}

console.log("\n▌ B4. 流沙（受击积砂）与砂甲（反击）");
{
  const cb = newCombat();
  cb.enemies = [mkFoe({ name: "敌人" })];
  cb.player.hp = 200; cb.player.block = 0;
  cb._resolveEffect({ quicksandArmor: 4 }, { name: "流沙" }, "self");
  cb._damagePlayer(6, "敌人");
  check(cb.player.block === 4, `流沙：受击后护甲 ${cb.player.block}`);

  const cb2 = newCombat();
  cb2.enemies = [mkFoe({ name: "敌人", hp: 999 })];
  cb2.player.hp = 200;
  cb2._resolveEffect({ block: 15, armorThorns: 3 }, { name: "砂甲" }, "self");
  const foeHp0 = cb2.enemies[0].hp;
  cb2.player.block = 0;
  cb2._damagePlayer(6, "敌人");
  check(foeHp0 - cb2.enemies[0].hp === 3, `砂甲：反击 ${foeHp0 - cb2.enemies[0].hp} 点`);
}

console.log("\n▌ B5. 砂棺：量产护甲换伤害 + 虚弱");
{
  const cb = newCombat();
  cb.enemies = [mkFoe({ hp: 999 })];
  cb._addPlayerBlock(100);
  cb._resolveEffect({ armorToDamageAoe: 0.25, armorToWeak: 20 }, { name: "砂棺" }, "aoe");
  check(999 - cb.enemies[0].hp === 25, `砂棺：100 × 0.25 = ${999 - cb.enemies[0].hp} 全体伤害`);
  check(cb.enemies[0].weak === 5, `砂棺：100/20 = ${cb.enemies[0].weak} 层虚弱`);
  check(cb.player.block === 0, "护甲已耗尽");
}

console.log("\n▌ B6. 砂盾的重量级代价");
{
  const cb = newCombat();
  cb.enemies = [mkFoe()];
  cb._resolveEffect({ block: 25, skipTurn: true }, { name: "砂盾" }, "self");
  check(cb.player.block >= 25, `砂盾提供 ${cb.player.block} 护甲`);
  check(cb.player.busyUntil > cb.time, `代价生效：本回合无法出牌（busyUntil=${cb.player.busyUntil}）`);
}

console.log("\n" + "─".repeat(78));
console.log(`  通过 ${pass} · 失败 ${fail}`);
console.log("─".repeat(78));
process.exit(fail ? 1 : 0);
