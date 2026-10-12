#!/usr/bin/env node
/**
 * summon-test.mjs —— 召唤流机制自动化测试
 *
 * 直接驱动真实的 CombatEngine（不是数据层检查），验证：
 *   1. 元素人携带元素属性
 *   2. 元素人同步攻击（卡表 404：释放对应元素 → 同元素元素人无视 cd 攻击）
 *   3. 大元素细分效果（燃烧/中毒/冻结/激昂/辉煌/全队护甲/自愈/增伤）
 *   4. cleave 连带范围伤害、stripBlockHalf 半数削甲
 *   5. 元素亲和随元素种类增长
 *   6. 元素王：不普攻、释放次数=种类数、强度=张数、释放上限
 *
 * 用法：node tools/summon-test.mjs
 * 退出码：0 全部通过；1 有失败项
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HD = path.resolve(__dirname, "..", "html-demo");
const JS = path.join(HD, "js");

// ── 最小 DOM 桩：让浏览器脚本能在 Node 里跑 ──
function makeWin() {
  const store = {};
  const mkEl = () => new Proxy(
    { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
      children: [], appendChild() {}, append() {}, removeChild() {}, remove() {},
      setAttribute() {}, getAttribute() { return null },
      addEventListener() {}, removeEventListener() {},
      querySelector() { return null }, querySelectorAll() { return [] },
      insertBefore() {}, focus() {}, play() { return { catch() {} } }, pause() {}, closest() { return null } },
    { get(t, p) {
        if (p in t) return t[p];
        if (p === "textContent" || p === "innerHTML" || p === "value") return "";
        if (p === "firstChild" || p === "parentNode") return null;
        return undefined;
      },
      set(t, p, v) { t[p] = v; return true; } });
  const document = {
    readyState: "complete", body: mkEl(), documentElement: mkEl(), head: mkEl(),
    createElement: mkEl, createTextNode: () => ({}), getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  return { document, localStorage,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    location: { href: "" } };
}

const win = makeWin();
const load = (f) => new Function("window", "document", "localStorage",
  fs.readFileSync(path.join(JS, f), "utf8"))(win, win.document, win.localStorage);

// 顺序要求：summon-elements 必须先于 cards（cards 注册 ge_*/gx_* 时依赖 FBSummon）
for (const f of ["card-data.js", "economy.js", "summon-elements.js", "cards.js",
                 "content-tables.js", "encounters.js", "combat.js"]) load(f);

const Engine = win.CombatEngine;
const C = win.FBCards, S = win.FBSummon, EN = win.FBEncounters;

let pass = 0, fail = 0;
const ok = (msg) => { console.log(`  ✓ ${msg}`); pass++; };
const bad = (msg) => { console.log(`  ✗ ${msg}`); fail++; };
const check = (cond, msg) => (cond ? ok(msg) : bad(msg));

/** 造一个干净的战斗实例 */
function freshEngine(encId) {
  const enc = EN.ENCOUNTERS.find((e) => e.id === encId);
  const log = [];
  const e = new Engine({ onUpdate() {}, onLog(t) { log.push(t); }, onEnd() {} });
  e.reset();
  e.enemies = EN.spawnUnits(enc);
  e.time = 0; e.round = 1; e.lastDrawAt = 0; e.lastStatusAt = 0;
  e.hand = []; e.drawPile = []; e.discard = [];
  e._log = log;
  return { e, enc, log };
}
const summon = (id) => C.WORD_EFFECTS[id]?.summon || {};

console.log("═".repeat(74));
console.log("  召唤流机制自动化测试");
console.log("═".repeat(74));
if (typeof Engine !== "function") {
  bad("CombatEngine 未加载，无法进行战斗级测试");
  process.exit(1);
}

// ── 1. 元素人携带元素 ──
console.log("\n▌ 1. 元素人携带元素属性");
{
  const { e } = freshEngine("ENC-09");
  const a = e.spawnAlly(summon("w404"), "测试", { element: "fire" });
  check(a.kind === "elemental", `kind = ${a.kind}`);
  check(a.element === "fire", `element = ${a.element}`);
  check(a.damage === 3 && a.hp === 5, `基础数值 ${a.hp}HP / ${a.damage}伤`);
}

// ── 2. 同步攻击 ──
console.log("\n▌ 2. 元素人同步攻击（卡表 404）");
{
  const { e } = freshEngine("ENC-09");
  e.spawnAlly(summon("w404"), "测试", { element: "fire" });
  const hp0 = e.enemies[0].hp;
  e._syncElementAllies("fire");
  check(e.enemies[0].hp < hp0, `火元素 → 同步生效（${hp0} → ${e.enemies[0].hp}）`);
  const hp1 = e.enemies[0].hp;
  e._syncElementAllies("ice");
  check(e.enemies[0].hp === hp1, "属性不匹配 → 正确不触发");
  // 大元素不应参与同步
  const { e: e2 } = freshEngine("ENC-09");
  e2.spawnAlly(summon("ge_fire"), "测试");
  const h = e2.enemies[0].hp;
  e2._syncElementAllies("fire");
  check(e2.enemies[0].hp === h, "大元素不参与同步（仅元素人）");
}

// ── 3. 大元素细分效果 ──
console.log("\n▌ 3. 大元素细分效果");
const SUBEFFECT = [
  ["ge_ash", "burnPerHit", 2, "燃烧"],
  ["ge_poison", "poisonPerHit", 1, "中毒"],
  ["ge_ice", "freezePerHit", 1, "冻结"],
  ["ge_gold", "gloryPerHit", 1, "辉煌"],
  ["ge_sand", "teamBlock", 2, "全队护甲"],
];
for (const [id, key, val, label] of SUBEFFECT) {
  const { e } = freshEngine("ENC-09");
  const spec = summon(id);
  const a = e.spawnAlly(spec, "测试");
  check(a[key] === val, `${spec.name} 携带 ${key}=${a[key]}`);
}
{
  const { e } = freshEngine("ENC-09");
  const a = e.spawnAlly(summon("ge_ash"), "测试");
  e._allyAct(a);
  check(e.enemies[0].burn === 2, `灰烬·大元素攻击 → 燃烧 ${e.enemies[0].burn}`);
}
{
  const { e } = freshEngine("ENC-09");
  const a = e.spawnAlly(summon("ge_gold"), "测试");
  e._allyAct(a);
  check(e.glory === 1, `金·大元素攻击 → 辉煌 ${e.glory}`);
}
{
  const { e } = freshEngine("ENC-09");
  const a = e.spawnAlly(summon("ge_fire"), "测试");
  const hp0 = e.enemies[0].hp;
  e._allyAct(a);
  check(hp0 - e.enemies[0].hp === 8, `火·大元素 伤害 ${hp0 - e.enemies[0].hp}（6+2）`);
}

// ── 4. cleave / stripBlockHalf ──
console.log("\n▌ 4. 连带伤害与半数削甲");
{
  const { e } = freshEngine("ENC-02");
  e.enemies.forEach((x) => { x.hp = 100; x.maxHp = 100; });
  const [a, b] = e.enemies;
  e._cleaveDamage(3, "沙尘·大元素", a.uid);
  check(a.hp === 100, `主目标不受连带（${a.hp}）`);
  check(b.hp === 97, `副目标受连带（${b.hp}）`);
}
{
  const { e } = freshEngine("ENC-09");
  e.enemies[0].block = 20;
  e._stripBlockHalf(e.enemies[0].uid);
  check(e.enemies[0].block === 10, `半数削甲 20 → ${e.enemies[0].block}`);
}

// ── 5. 元素亲和 ──
console.log("\n▌ 5. 元素亲和");
{
  const { e } = freshEngine("ENC-09");
  check(e.affinityMultiplier() === 1, "无元素王 → ×1.00");
  e.spawnAlly(summon("element_king"), "测试");
  check(e.affinityMultiplier() === 1, "元素王+空池 → ×1.00");
  for (const el of ["fire", "ice", "poison", "air", "steel"]) {
    e.spawnAlly(summon("w404"), "测试", { element: el });
  }
  const m = e.affinityMultiplier();
  check(Math.abs(m - 1.6) < 1e-9, `5 种元素 → ×${m.toFixed(2)}（期望 1.60）`);
}

// ── 6. 元素王 ──
console.log("\n▌ 6. 元素王释放机制");
{
  const { e } = freshEngine("ENC-09");
  const king = e.spawnAlly(summon("element_king"), "测试");
  check(king.damage === 0, `不普攻（damage=${king.damage}）`);
  check(king.kingRelease === true && king.affinity === true, "kingRelease / affinity 标记就位");
}
{
  // 释放次数 = 种类数（受上限 3 约束）；强度 = 张数
  const cases = [
    { types: 2, copies: 1, wantCasts: 2 },
    { types: 3, copies: 1, wantCasts: 3 },
    { types: 5, copies: 1, wantCasts: 3 },
    { types: 8, copies: 1, wantCasts: 3 },
  ];
  const els = ["fire", "ice", "poison", "air", "steel", "gold", "sand", "wood"];
  for (const c of cases) {
    const { e } = freshEngine("ENC-09");
    e.enemies[0].hp = 99999; e.enemies[0].maxHp = 99999;
    const king = e.spawnAlly(summon("element_king"), "测试");
    for (const el of els.slice(0, c.types)) {
      for (let i = 0; i < c.copies; i++) e.spawnAlly(summon("w404"), "测试", { element: el });
    }
    const before = e.enemies[0].hp;
    const logLen = e._log.length;
    e._allyAct(king);
    const casts = e._log.slice(logLen).filter((l) => l.includes("释放合成牌")).length;
    const dealt = before - e.enemies[0].hp;
    check(casts === c.wantCasts, `${c.types} 种 → 释放 ${casts} 次（期望 ${c.wantCasts}），合计 ${dealt} 伤`);
  }
}
{
  // 张数增加 → 强度增加（同种类数下伤害更高）
  const els = ["fire", "ice", "poison"];
  const measure = (copies) => {
    const { e } = freshEngine("ENC-09");
    e.enemies[0].hp = 99999; e.enemies[0].maxHp = 99999;
    const king = e.spawnAlly(summon("element_king"), "测试");
    for (const el of els) for (let i = 0; i < copies; i++) e.spawnAlly(summon("w404"), "测试", { element: el });
    const b = e.enemies[0].hp;
    e._allyAct(king);
    return b - e.enemies[0].hp;
  };
  const d1 = measure(1), d3 = measure(3);
  check(d3 > d1, `张数增加提升强度：1张/种 = ${d1} 伤，3张/种 = ${d3} 伤`);
}
{
  // 空池不崩
  const { e } = freshEngine("ENC-09");
  const king = e.spawnAlly(summon("element_king"), "测试");
  let threw = false;
  try { e._allyAct(king); } catch { threw = true; }
  check(!threw, "空元素池时不抛异常");
}

// ── 7. 召唤物索敌规则：优先玩家先前攻击的目标 ──
console.log("\n▌ 7. 召唤物索敌（优先玩家先前攻击的目标）");
{
  const { e } = freshEngine("ENC-02");   // 两个敌人
  const [a, b] = e.enemies;
  e.enemies.forEach((x) => { x.hp = 500; x.maxHp = 500; });

  // 未攻击任何目标 → 默认第一个
  check(e._defaultTarget()?.uid === a.uid, `未攻击时 → 第一个敌人（${e._defaultTarget()?.name}）`);

  // 玩家攻击第二个 → 召唤物应改为打第二个
  e.lastAttackedUid = b.uid;
  check(e._defaultTarget()?.uid === b.uid, `玩家攻击第二个后 → 索敌第二个（${e._defaultTarget()?.name}）`);

  // 召唤物实际攻击应落在第二个身上
  const aHp = a.hp, bHp = b.hp;
  const ally = e.spawnAlly(summon("w404"), "测试", { element: "fire" });
  e._allyAct(ally);
  check(a.hp === aHp && b.hp < bHp, `召唤物攻击落在先前目标（副目标 ${bHp}→${b.hp}，主目标不变 ${a.hp}）`);

  // 先前目标死亡 → 回退到第一个存活敌人
  b.dead = true;
  check(e._defaultTarget()?.uid === a.uid, `先前目标死亡 → 回退第一个存活敌人（${e._defaultTarget()?.name}）`);
}
{
  // 玩家出牌后自动记录目标
  const { e } = freshEngine("ENC-02");
  const [a, b] = e.enemies;
  e.enemies.forEach((x) => { x.hp = 500; x.maxHp = 500; });
  const card = C.makeInstance("fire");
  e._dealCardDamage(5, "火", b.uid, {});
  check(e.lastAttackedUid === b.uid, `玩家对第二个造成伤害后，记录 lastAttackedUid=${b.name}`);
  check(e._defaultTarget()?.uid === b.uid, "召唤物随之索敌第二个");
}

// ── 8. 大元素基础数值一致性 ──
console.log("\n▌ 8. 大元素基础数值一致性");
{
  const rows = [];
  const all = { ...(S.GREATER_VARIANTS || {}), ...(S.HYBRID_GREATER || {}) };
  for (const v of Object.values(all)) {
    const s = C.WORD_EFFECTS[v.id]?.summon;
    if (s) rows.push({ name: s.name, hp: s.hp, dmg: s.damage });
  }
  const hps = [...new Set(rows.map((r) => r.hp))];
  const dmgs = [...new Set(rows.map((r) => r.dmg))];
  check(rows.length > 0, `已注册大元素变体 ${rows.length} 个`);
  check(hps.length === 1 && hps[0] === 12, `生命统一为 12（实际 ${hps.join("/")}）`);
  check(dmgs.length === 1 && dmgs[0] === 6, `伤害统一为 6（实际 ${dmgs.join("/")}）`);
}

console.log("\n" + "─".repeat(74));
console.log(`  通过 ${pass} · 失败 ${fail}`);
console.log("─".repeat(74));
process.exit(fail ? 1 : 0);
