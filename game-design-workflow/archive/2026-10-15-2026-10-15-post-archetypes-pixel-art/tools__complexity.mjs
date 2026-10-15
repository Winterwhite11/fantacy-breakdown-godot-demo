#!/usr/bin/env node
/**
 * complexity.mjs —— 卡牌体系「上手难度」度量
 *
 * 目的（用户 2026-10-14）：
 *   「循环测试这四种体系的可玩性和操作简易性，尽量避免出现玩家游玩体验中
 *     面对一大堆卡牌合成一头雾水的情况，必要时可做修改」
 *
 * 「一头雾水」的根因不是卡多，而是**合成链太深 / 太绕**：
 * 玩家看到一张想用的卡，不知道要先把哪几张卡做出来。
 *
 * 本工具量化四件事：
 *   1. 合成深度 depth(card)：从**基础元素/操作牌**走到这张卡最少要几步
 *      （基础牌 = 起手就能拿到的 17 张：水火气毒砂冰木铪金钢电菌 + 压缩堆砌加热冷却增幅）
 *   2. 中间产物数：路上要额外记住多少张「非基础」卡
 *   3. 分支数：同一张卡有几种做法（多配方 = 更灵活但也更容易记混）
 *   4. 入门卡：每个体系有没有「1 步就能做出来」的入门牌
 *
 * 判据（可调）：
 *   · 体系内 **深度 ≥3 的卡占比过高** → 玩家需要预先规划，容易一头雾水
 *   · 体系**没有深度 ≤1 的入门卡** → 新手无法从简单处上手
 *   · 单卡**分支 >2** → 记混风险
 *
 * 用法：node tools/complexity.mjs [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const HD = path.join(REPO, "html-demo");
const T = JSON.parse(fs.readFileSync(path.join(HD, "js", "card-table-docx.json"), "utf8"));

const AS_JSON = process.argv.includes("--json");

// ── 基础牌：无需合成，起手即可获得 ──
const BASE = new Set([
  ...Object.keys(T.elements || {}), ...Object.keys(T.processes || {}),
]);
// ── 配方索引 ──
const RECIPES = new Map();      // id -> [ [matId...], ... ]
for (const s of T.specials || []) {
  if ((s.materials_alts || []).length) RECIPES.set(s.id, s.materials_alts);
}
const NAME = new Map((T.specials || []).map((s) => [s.id, s.name]));
const NUM = new Map((T.specials || []).map((s) => [s.id, s.num]));
for (const [id, e] of Object.entries(T.elements || {})) { NAME.set(id, e.name); NUM.set(id, e.num); }
for (const [id, p] of Object.entries(T.processes || {})) { NAME.set(id, p.name); NUM.set(id, p.num); }

/** 从基础牌出发的最少合成步数；不可达返回 null */
const depthCache = new Map();
function depth(id, seen = new Set()) {
  if (BASE.has(id)) return 0;
  if (depthCache.has(id)) return depthCache.get(id);
  if (seen.has(id)) return null;                  // 循环，防死循环
  const alts = RECIPES.get(id);
  if (!alts) return null;                          // 无配方（召唤流 401-406）
  seen.add(id);
  let best = null;
  for (const alt of alts) {
    let sum = 1, ok = true;                        // 自身算 1 步
    for (const m of alt) {
      const d = depth(m, new Set(seen));
      if (d == null) { ok = false; break; }
      sum += d;
    }
    if (ok && (best == null || sum < best)) best = sum;
  }
  seen.delete(id);
  depthCache.set(id, best);
  return best;
}

/** 到这张卡的路上，需要额外掌握多少张「非基础」卡 */
function intermediates(id, acc = new Set()) {
  if (BASE.has(id)) return acc;
  const alts = RECIPES.get(id);
  if (!alts) return acc;
  for (const m of alts[0]) {
    if (!BASE.has(m)) acc.add(m);
    intermediates(m, acc);
  }
  return acc;
}

// ── 四个体系的成员（按设计归属；含作为中间产物的体系内卡）──
const SYSTEMS = {
  "燃烧": {
    id: "burn",
    cards: ["steam", "wine", "alcohol", "molotov", "fire_vine", "charcoal", "heatwave",
            "kindle", "burst_burn", "fuel", "holy_fire", "incinerate", "ash", "overheat",
            "fire_rain", "cremate", "blue_flame", "cold_allodynia", "heat_drive",
            "ember_end", "nirvana"],
  },
  "冻结": {
    id: "frost",
    cards: ["snow", "hypothermia", "superconduct", "permafrost", "frost_core", "everfrost",
            "eternal_winter", "ice_wall", "condense", "shatter", "snow_blind",
            "melt_to_flame", "hot_breath", "thermal_power", "current_frost", "ice_age",
            "winter_fall", "frost_aegis"],
  },
  "中毒": {
    id: "poison",
    cards: ["poison_gas", "acid", "spore", "poison_vine", "acid_rain", "swamp",
            "poison_mist", "poison_blade", "miasma", "poison_vine_field", "poison_burst",
            "envenom", "poison_armor", "corrode_armor", "poison_frenzy", "antidote",
            "detox_heal", "blood_poison", "plague", "poison_ring", "poison_tolerance",
            "bone_corrode", "myriad_poison", "melt_poison", "electrolyze_poison"],
  },
  "砂": {
    id: "sand",
    cards: ["concrete", "concrete_wall", "glass", "iron_tree", "sandstorm", "sand_wall",
            "sand_barrier", "sandstone", "quicksand", "sand_burst", "sand_collapse",
            "sand_blind", "solidify_sand", "sand_steel", "sand_fungus", "sand_armor",
            "sand_burial", "sand_shield", "sand_bind", "quicksand_burial"],
  },
};

const rows = [];
for (const [label, cfg] of Object.entries(SYSTEMS)) {
  const cards = cfg.cards.filter((c) => RECIPES.has(c) || BASE.has(c));
  const ds = cards.map((c) => ({ id: c, name: NAME.get(c) || c, d: depth(c), branches: (RECIPES.get(c) || []).length }))
    .filter((r) => r.d != null);
  const deep = ds.filter((r) => r.d >= 3);
  const entry = ds.filter((r) => r.d <= 1);
  const mid = ds.filter((r) => r.d === 2);
  const inter = new Set();
  for (const c of cards) intermediates(c, inter);
  const branchy = ds.filter((r) => r.branches > 2);
  rows.push({
    label, ...cfg,
    n: ds.length,
    avgDepth: ds.length ? ds.reduce((s, r) => s + r.d, 0) / ds.length : 0,
    maxDepth: ds.length ? Math.max(...ds.map((r) => r.d)) : 0,
    entry: entry.length, mid: mid.length, deep: deep.length,
    deepPct: ds.length ? deep.length / ds.length : 0,
    intermediates: [...inter].filter((i) => !BASE.has(i)),
    branchy, ds,
  });
}

if (AS_JSON) {
  console.log(JSON.stringify(rows.map(({ ds, ...r }) => r), null, 2));
  process.exit(0);
}

const bar = (n, max, w = 18) => "█".repeat(Math.round((n / Math.max(1, max)) * w)).padEnd(w, "·");

console.log("═".repeat(84));
console.log("  卡牌体系「上手难度」度量");
console.log("═".repeat(84));
console.log(`\n基础牌 ${BASE.size} 张（起手即可获得，无需合成）：`);
console.log("  " + [...BASE].map((b) => NAME.get(b)).join(" "));

console.log("\n\n▌ 总览");
console.log("体系    卡数  平均深度  最大深度  入门(≤1步)  中段(2步)  深链(≥3步)  深链占比");
console.log("─".repeat(84));
const maxDeep = Math.max(...rows.map((r) => r.deepPct));
for (const r of rows) {
  console.log(
    r.label.padEnd(7) + String(r.n).padStart(4) +
    r.avgDepth.toFixed(2).padStart(9) +
    String(r.maxDepth).padStart(10) +
    String(r.entry).padStart(11) +
    String(r.mid).padStart(11) +
    String(r.deep).padStart(11) +
    `   ${bar(r.deepPct, maxDeep)} ${(r.deepPct * 100).toFixed(0)}%`
  );
}

console.log("\n▌ 中间产物（路上要额外记住的非基础卡）");
for (const r of rows) {
  console.log(`  ${r.label.padEnd(6)} ${String(r.intermediates.length).padStart(2)} 张` +
    (r.intermediates.length ? "：" + r.intermediates.map((i) => NAME.get(i) || i).join(" · ") : "  ← 全部可由基础牌直接合成"));
}

console.log("\n▌ 深度分布（越靠右越需要预先规划）");
const maxD = Math.max(...rows.map((r) => r.maxDepth));
for (const r of rows) {
  const counts = [];
  for (let d = 0; d <= maxD; d++) counts.push(r.ds.filter((x) => x.d === d).length);
  console.log(`  ${r.label.padEnd(6)} ` + counts.map((c, d) => `${d}步:${String(c).padStart(2)}`).join("  "));
}

console.log("\n▌ 判定");
const problems = [];
for (const r of rows) {
  if (r.entry === 0) problems.push(`${r.label}：**没有任何 1 步入门卡** —— 新手无法从简单处上手`);
  if (r.deepPct > 0.4) problems.push(`${r.label}：深链卡占 ${(r.deepPct * 100).toFixed(0)}%（>40%）—— 需要预先规划，容易一头雾水`);
  if (r.intermediates.length > 8) problems.push(`${r.label}：需记住 ${r.intermediates.length} 张中间产物（>8）—— 记忆负担过重`);
  if (r.branchy.length > 0) problems.push(`${r.label}：${r.branchy.length} 张卡有 >2 种配方（${r.branchy.map((b) => b.name).join("、")}）—— 容易记混`);
}
if (!problems.length) console.log("  ✅ 四个体系均无上手障碍");
else for (const p of problems) console.log("  ⚠ " + p);

console.log("\n▌ 各体系最深/最绕的卡（玩家最可能卡住的地方）");
for (const r of rows) {
  const worst = [...r.ds].sort((a, b) => b.d - a.d).slice(0, 3);
  console.log(`  ${r.label.padEnd(6)} ` + worst.map((w) => `${w.name}(${w.d}步${w.branches > 1 ? `,${w.branches}种做法` : ""})`).join("  "));
}
console.log();
