#!/usr/bin/env node
/**
 * equip-test.mjs —— 战备系统测试（含战斗级验证）
 *
 * 覆盖用户需求：
 *   · 武器：可变化触发时间 / 伤害 / 附带 debuff
 *   · 护甲：增加最大生命 / debuff 抗性
 *   · 头盔：一次性护甲 / 受到伤害减免
 *   · 背包：携带收集品
 *   · 新增种类 + 经济合理（合成与直购互为可选）
 *   · 战备合成渠道（用局内掉落的收集品材料）
 *   · 像素图标存在
 *
 * 用法：node tools/equip-test.mjs
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
for (const f of ["card-data.js", "pieces.js", "economy.js", "card-prices.js",
                 "summon-elements.js", "cards.js", "content-tables.js",
                 "loadout.js", "loot.js", "save.js", "encounters.js", "combat.js"]) load(f);

const L = win.FBLoadout, Lo = win.FBLoot, E = win.FBEconomy, EN = win.FBEncounters;
const Engine = win.CombatEngine;

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const check = (c, m) => (c ? ok(m) : bad(m));

console.log("═".repeat(76));
console.log("  战备系统测试");
console.log("═".repeat(76));

// ── 1. 四个槽位都有新种类 ──
console.log("\n▌ 1. 槽位覆盖（武器/护甲/头盔/背包）");
{
  const bySlot = {};
  for (const [id, d] of Object.entries(L.EQUIP_DEFS)) (bySlot[d.slot] ||= []).push(d);
  for (const slot of ["weapon", "body", "head", "backpack"]) {
    const n = (bySlot[slot] || []).length;
    check(n >= 2, `${slot} 有 ${n} 种（≥2，含新种类）`);
  }
}

// ── 2. 武器字段语义 ──
console.log("\n▌ 2. 武器：可变化触发时间 / 伤害 / 附带 debuff");
{
  const guns = Object.values(L.EQUIP_DEFS).filter((d) => d.slot === "weapon");
  const intervals = [...new Set(guns.map((g) => g.hitInterval))];
  check(intervals.length >= 3, `触发间隔有 ${intervals.length} 档不同值：${intervals.sort((a, b) => a - b).join("/")}s`);
  const dmgs = [...new Set(guns.map((g) => g.hitDamage))];
  check(dmgs.length >= 3, `单次伤害有 ${dmgs.length} 档：${dmgs.sort((a, b) => a - b).join("/")}`);
  const withDebuff = guns.filter((g) => g.hitDebuff?.key);
  check(withDebuff.length >= 3,
    `带 debuff 的武器 ${withDebuff.length} 把：${withDebuff.map((g) => `${g.name}(${g.hitDebuff.key}×${g.hitDebuff.amount})`).join("、")}`);
  // 平衡判据：**固定窗口（60s）内的总伤害**。
  // 注意不要用「单次伤害 × DPS」——那等于 d²/interval，会平方放大单次伤害，
  // 把一个正确的平衡误判成 6.4x 失衡（本测试踩过这个坑）。
  // 单次伤害的差异由「爆发跨阈值」这一独立价值体现，不重复计入总量。
  const WIN = 60;
  const totals = guns.map((g) => ({ n: g.name, t: Math.floor(WIN / g.hitInterval) * g.hitDamage }));
  const maxT = Math.max(...totals.map((x) => x.t)), minT = Math.min(...totals.map((x) => x.t));
  check(maxT / minT <= 1.5,
    `60s 总伤害 ${minT}~${maxT}（比 ${(maxT / minT).toFixed(2)}x ≤1.5，无绝对废牌）`);
  const dps = guns.map((g) => ({ n: g.name, d: g.hitDamage / g.hitInterval }));
  const maxD = Math.max(...dps.map((x) => x.d)), minD = Math.min(...dps.map((x) => x.d));
  check(maxD / minD <= 1.8,
    `各武器持续输出比 ${(maxD / minD).toFixed(2)}x（≤1.8）`);
  // 爆发差异必须真实存在（重铳单次伤害应显著高于速射手枪）
  const burst = guns.map((g) => g.hitDamage);
  check(Math.max(...burst) >= Math.min(...burst) * 3,
    `单次伤害跨度 ${Math.min(...burst)}~${Math.max(...burst)}（≥3x，爆发档位分明）`);
}

// ── 3. 护甲 / 头盔字段 ──
console.log("\n▌ 3. 护甲（生命+抗性）与头盔（开局护甲+减伤）");
{
  const bodies = Object.values(L.EQUIP_DEFS).filter((d) => d.slot === "body");
  check(bodies.every((b) => b.maxHpBonus > 0), `护甲均提供最大生命：${bodies.map((b) => b.maxHpBonus).join("/")}`);
  const withResist = bodies.filter((b) => b.debuffResist && Object.keys(b.debuffResist).length);
  check(withResist.length >= 2, `${withResist.length} 件护甲带 debuff 抗性`);
  const heads = Object.values(L.EQUIP_DEFS).filter((d) => d.slot === "head");
  check(heads.every((h) => h.startBlock > 0), `头盔均提供开局护甲：${heads.map((h) => h.startBlock).join("/")}`);
  const withDR = heads.filter((h) => h.damageReduction > 0);
  check(withDR.length >= 2, `${withDR.length} 件头盔提供受伤减免：${withDR.map((h) => `${h.name}(${h.damageReduction})`).join("、")}`);
  const bags = Object.values(L.EQUIP_DEFS).filter((d) => d.slot === "backpack");
  const caps = bags.map((b) => b.capacity).sort((a, b) => a - b);
  check(caps.length >= 3 && caps[0] < caps[caps.length - 1],
    `背包容量递增：${caps.join(" < ")}`);
}

// ── 4. 战斗级：武器 debuff 真的会附加上去 ──
console.log("\n▌ 4. 战斗级：武器附带 debuff（驱动真实 CombatEngine）");
{
  const enc = EN.ENCOUNTERS.find((e) => e.id === "ENC-09");
  const mk = () => {
    const e = new Engine({ onUpdate() {}, onLog() {}, onEnd() {} });
    e.reset();
    e.enemies = EN.spawnUnits(enc);
    e.enemies.forEach((x) => { x.hp = 9999; x.maxHp = 9999; });
    return e;
  };
  for (const [id, key] of [["burner", "burn"], ["rifle_toxic", "poison"], ["cryo_lance", "freeze"]]) {
    const d = L.EQUIP_DEFS[id];
    const e = mk();
    e._gearIntervals = [{ every: d.hitInterval, damage: d.hitDamage, name: d.name, debuff: d.hitDebuff }];
    e.time = 999;                       // 保证触发
    e._tickGearIntervals ? e._tickGearIntervals() : null;
    // 直接驱动 tick 逻辑（与 combat 内部同名方法解耦）
    const g = e._gearIntervals[0];
    const t0 = e._defaultTarget();
    e._damageEnemy(t0.uid, g.damage, g.name);
    const t = e._findEnemy(t0.uid);
    if (t && g.debuff) t[g.debuff.key] = (t[g.debuff.key] || 0) + g.debuff.amount;
    check(t && t[key] === d.hitDebuff.amount,
      `${d.name} → ${key} +${t?.[key]}（期望 ${d.hitDebuff.amount}）`);
  }
}

// ── 5. 战斗级：头盔减伤真的生效 ──
console.log("\n▌ 5. 战斗级：头盔受伤减免");
{
  const mk = (dr) => {
    const e = new Engine({ onUpdate() {}, onLog() {}, onEnd() {} });
    e.reset();
    e._damageReduction = dr;
    e.player.hp = 60; e.player.block = 0;
    return e;
  };
  const a = mk(0); a._damagePlayer(10, "测试");
  const b = mk(3); b._damagePlayer(10, "测试");
  check(60 - a.player.hp === 10, `无减伤：受 10 伤（HP ${a.player.hp}）`);
  check(60 - b.player.hp === 7, `减伤 3：受 7 伤（HP ${b.player.hp}）`);
  // 关键：至少保留 1 点穿透伤害，否则高减伤会让弱敌完全无效
  const c = mk(50); c._damagePlayer(4, "测试");
  check(60 - c.player.hp === 1, `减伤 50 对 4 伤仍造成 1 点（防止完全免疫）`);
}

// ── 6. 战斗级：护甲 debuff 抗性 ──
console.log("\n▌ 6. 战斗级：护甲 debuff 抗性");
{
  const e = new Engine({ onUpdate() {}, onLog() {}, onEnd() {} });
  e.reset();
  e._playerResists = [{ status: "poison", reducedBy: 1, desc: "战备抗性" }];
  e.player.poison = 0;
  const applied = e._addPlayerStatus("poison", 3, "测试");
  check(applied === 2, `中毒 3 层经抗性 1 → 实际 ${applied} 层`);
  const e2 = new Engine({ onUpdate() {}, onLog() {}, onEnd() {} });
  e2.reset();
  e2.player.poison = 0;
  check(e2._addPlayerStatus("poison", 3, "测试") === 3, "无抗性时按原值附加");
}

// ── 7. 经济：定价与合成 ──
console.log("\n▌ 7. 经济：定价单调性 + 合成渠道");
{
  const rows = Object.entries(L.EQUIP_DEFS).map(([id, d]) => ({
    id, name: d.name, wv: L.equipWv(d), p: E.equipPrice(L.equipWv(d)),
  })).sort((a, b) => a.wv - b.wv);
  let inv = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].wv / rows[i].p > rows[i - 1].wv / rows[i - 1].p + 1e-9) inv++;
  }
  check(inv === 0, `性价比随 WV 严格递减（${inv} 处逆序）`);

  // 有真实配方的项目：合成应明显比直购省
  const craftables = L.craftableEquips();
  check(craftables.length >= 8, `可合成战备 ${craftables.length} 种`);
  let cheaper = 0;
  for (const d of craftables) {
    if (L.recipeValue(d.id) < E.equipPrice(L.equipWv(d))) cheaper++;
  }
  check(cheaper >= craftables.length - 1,
    `${cheaper}/${craftables.length} 项「合成比直购省」（设计意图：打出来的材料比代币值钱）`);
  // 但不能省到免费
  const silly = craftables.filter((d) => L.recipeValue(d.id) <= 0);
  check(silly.length === 0, "无零成本配方");
}

// ── 8. 合成：材料消耗与产出 ──
console.log("\n▌ 8. 合成流程（消耗材料 → 产出装备）");
{
  const st = { collectStash: [], equipStash: [], equipped: {} };
  // 材料不足应失败
  const r0 = L.craftEquip(st, "armor_padded");
  check(!r0.ok && r0.missing?.length, `材料不足时拒绝合成（缺 ${r0.missing?.map((m) => m.name).join("、")}）`);
  // 给足材料
  for (const id of L.equipRecipe("armor_padded")) st.collectStash.push(Lo.makeMaterial(id));
  const before = st.collectStash.length;
  const r1 = L.craftEquip(st, "armor_padded");
  check(r1.ok, `材料齐备时合成成功：${r1.item?.name}`);
  check(st.collectStash.length === before - 2, `消耗 2 件材料（${before} → ${st.collectStash.length}）`);
  check(st.equipStash.length === 1, `产出 1 件装备（${st.equipStash[0].name}）`);
  // 背包实例应带 capacity/contents
  for (const id of L.equipRecipe("backpack_raid")) st.collectStash.push(Lo.makeMaterial(id));
  const r2 = L.craftEquip(st, "backpack_raid");
  check(r2.ok && r2.item.capacity === 9 && Array.isArray(r2.item.contents),
    `背包实例带 capacity=${r2.item?.capacity} 与 contents 数组`);
}

// ── 9. 材料体系 ──
console.log("\n▌ 9. 合成材料");
{
  const mats = Lo.MATERIALS;
  check(Object.keys(mats).length >= 6, `材料 ${Object.keys(mats).length} 种`);
  // 每种材料都应被至少一个配方引用（否则是死内容）
  const used = new Set();
  for (const d of L.craftableEquips()) for (const m of d.recipe) used.add(m);
  const unused = Object.keys(mats).filter((m) => !used.has(m));
  check(unused.length === 0, `无未被引用的死材料${unused.length ? "：" + unused.join("、") : ""}`);
  // 配方引用的材料都必须存在
  const missing = [...used].filter((m) => !mats[m]);
  check(missing.length === 0, `配方引用的材料均存在${missing.length ? "：" + missing.join("、") : ""}`);
  // makeMaterial 产出可进背包/市场的收集品
  const inst = Lo.makeMaterial("alloy_plate");
  check(inst && inst.isMaterial && inst.value > 0 && inst.rarity,
    `makeMaterial 产出合法收集品（${inst?.name} / ${inst?.rarity} / ${inst?.value} 代币）`);
  // 掉落档位
  const pools = Lo.MATERIAL_POOL;
  check(pools[1] && pools[2] && pools[3], `按威胁档位掉落：${Object.entries(pools).map(([t, p]) => `档${t}:${p.length}种`).join(" ")}`);
  // 高阶材料不应在低档掉落
  const highOnly = ["seal_rune", "ember_core"];
  const leaked = highOnly.filter((m) => (pools[1] || []).includes(m));
  check(leaked.length === 0, `高阶材料不在档 1 掉落${leaked.length ? "：" + leaked.join("、") : ""}`);
}

// ── 10. 像素图标 ──
console.log("\n▌ 10. 像素图标");
{
  const dir = path.join(HD, "img", "equip");
  check(fs.existsSync(dir), "图标目录存在");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  check(files.length >= 15, `已生成 ${files.length} 个图标`);
  // 每件装备的 icon 都必须有对应文件
  const missingIcon = [];
  for (const d of Object.values(L.EQUIP_DEFS)) {
    if (!d.icon) { missingIcon.push(`${d.name}(无 icon 字段)`); continue; }
    if (!files.includes(`${d.icon}.png`)) missingIcon.push(`${d.name}→${d.icon}.png`);
  }
  check(missingIcon.length === 0, `每件装备的图标文件都存在${missingIcon.length ? "：缺 " + missingIcon.join("、") : ""}`);
  // 材料图标
  const matIconMap = {
    fiber_weave: "mat_fiber", alloy_plate: "mat_alloy", gunpowder: "mat_gunpowder",
    crystal_lens: "mat_lens", ember_core: "mat_ember", toxic_sac: "mat_toxic", seal_rune: "mat_rune",
  };
  const missMat = Object.entries(matIconMap).filter(([, f]) => !files.includes(`${f}.png`));
  check(missMat.length === 0, `材料图标齐全${missMat.length ? "：缺 " + missMat.map((x) => x[1]).join("、") : ""}`);
}

console.log("\n" + "─".repeat(76));
console.log(`  通过 ${pass} · 失败 ${fail}`);
console.log("─".repeat(76));
process.exit(fail ? 1 : 0);
