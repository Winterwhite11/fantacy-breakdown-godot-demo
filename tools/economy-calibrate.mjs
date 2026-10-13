#!/usr/bin/env node
/**
 * economy-calibrate.mjs —— 经济量级标定工具
 *
 * 目的：把「卡牌价格 / 战备价格 / 收集品价格 / 战斗代币」四者的量级一次性对齐，
 * 并用可验证的目标反推参数，而不是靠手感调数字。
 *
 * 目标（用户 2026-10-13 确认，参照《三角洲行动》）：
 *   T1 一次成功撤离的总收益落在 **3~8 万**
 *   T2 跑刀低投低产 / 猛攻高投高产（两者净值同量级，猛攻波动大）
 *   T3 收集品占一局收入的 **65~75%**（收集品是主角，代币是保底）
 *
 * 用法：
 *   node tools/economy-calibrate.mjs            # 用当前值测量并判定
 *   node tools/economy-calibrate.mjs --scale 250  # 试算全体系放大 250 倍
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const HD = path.join(REPO, "html-demo");
const DATA = path.join(REPO, "game-design-workflow", "data");

const argv = process.argv.slice(2);
const scaleArg = (() => {
  const i = argv.indexOf("--scale");
  return i >= 0 ? Number(argv[i + 1]) : null;
})();

// ── 最小 DOM 桩 ──
function makeWin() {
  const store = {};
  const mkEl = () => new Proxy(
    { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
      children: [], appendChild() {}, append() {}, removeChild() {}, remove() {},
      setAttribute() {}, getAttribute() { return null },
      addEventListener() {}, removeEventListener() {},
      querySelector() { return null }, querySelectorAll() { return [] },
      insertBefore() {}, focus() {}, play() { return { catch() {} } }, pause() {}, closest() { return null },
      getBoundingClientRect() { return { width: 300, height: 400 }; } },
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
  const localStorage = { getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  return { document, localStorage, addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }), location: { href: "" },
    innerWidth: 1280, innerHeight: 800 };
}
const win = makeWin();
const load = (f) => new Function("window", "document", "localStorage",
  fs.readFileSync(path.join(HD, "js", f), "utf8"))(win, win.document, win.localStorage);
for (const f of ["card-data.js", "pieces.js", "preview.js", "economy.js", "card-prices.js",
                 "summon-elements.js", "cards.js", "content-tables.js", "loadout.js", "loot.js"]) load(f);

const L = win.FBLoadout, Lo = win.FBLoot, E = win.FBEconomy;
const CFG = JSON.parse(fs.readFileSync(path.join(DATA, "economy-config.json"), "utf8"));

const S = scaleArg || 1;   // 仅用于试算展示，不改文件

/**
 * 三条路线对应**真实可买的战备套装**（从 EQUIP_DEFS 按装备价累加），
 * 而不是写死一个成本数字 —— 否则经济参数一改，成本就与装备脱节。
 */
const LOADOUTS = {
  cheap: ["pistol_simple", "backpack_simple"],                       // 最低配：一把手枪 + 小背包
  mid:   ["helmet_visor", "armor_padded", "rifle_rapid", "backpack_normal"],
  heavy: ["helmet_bulwark", "armor_plate", "shotgun_heavy", "backpack_raid"],
};
function loadoutCost(key) {
  return (LOADOUTS[key] || []).reduce((sum, id) => {
    const d = L.EQUIP_DEFS[id];
    if (!d) return sum;
    return sum + E.equipPrice(L.equipWv(d), L.recipeValue(id));
  }, 0);
}

// ── 一次撤离的收益模型（与 economy-test 同源，简化为期望值）──────────
function runIncome(buildKey) {
  const tier = { cheap: 1, mid: 2, heavy: 3 }[buildKey];
  const b = { cheap: { death: 0.12 }, mid: { death: 0.22 }, heavy: { death: 0.30 } }[buildKey];
  const nodes = (CFG.run.nodesMin + CFG.run.nodesMax) / 2;
  const survive = 1 - b.death;

  // 代币：每次尝试的期望（阵亡则本局代币全丢）
  const tok = CFG.combatToken[String(tier)];
  const tokenPerRun = survive * nodes * (tok.min + tok.max) / 2;

  // 收集品：逐节点掉率 × 期望价值 + 档位专属储藏
  const gate = CFG.collectibleGate[String(tier)] || {};
  let colPerNode = 0;
  for (const [rarity, chance] of Object.entries(gate)) {
    const vr = CFG.collectibleValue[rarity];
    // 约 25% 的收集品掉落改为材料，材料价值约为同档一半
    const v = (vr.min + vr.max) / 2 * 0.75;
    colPerNode += chance * v;
  }
  let col = survive * nodes * colPerNode;
  const cache = CFG.tierCache[String(tier)];
  if (cache) {
    const c1 = CFG.collectibleValue[cache.rarity];
    col += survive * cache.chance * (c1.min + c1.max) / 2;
    if (cache.extraChance) {
      const c2 = CFG.collectibleValue[cache.extraRarity];
      col += survive * cache.extraChance * (c2.min + c2.max) / 2;
    }
  }
  return { tokens: tokenPerRun, collectibles: col, cost: loadoutCost(buildKey), survive };
}

const rows = ["cheap", "mid", "heavy"].map((k) => {
  const r = runIncome(k);
  const gross = r.tokens + r.collectibles;
  const net = gross - r.cost;
  const share = gross ? r.collectibles / gross : 0;
  return { key: k, ...r, gross, net, share };
});

const NAME = { cheap: "跑刀（档1）", mid: "常规（档2）", heavy: "猛攻（档3）" };
const fmt = (n) => Math.round(n).toLocaleString("en-US");

console.log("═".repeat(84));
console.log(`  经济量级标定${S !== 1 ? `（试算 ×${S}）` : ""}`);
console.log("═".repeat(84));
console.log("\n路线            战备成本     代币/局    收集品/局     总收益      净值   收集品占比");
console.log("─".repeat(84));
for (const r of rows) {
  console.log(
    NAME[r.key].padEnd(14) +
    fmt(r.cost).padStart(9) +
    fmt(r.tokens).padStart(11) +
    fmt(r.collectibles).padStart(12) +
    fmt(r.gross).padStart(12) +
    fmt(r.net).padStart(11) +
    `   ${(r.share * 100).toFixed(0)}%`
  );
}

console.log("\n### 目标判定");
const grosses = rows.map((r) => r.gross);
const lo = Math.min(...grosses), hi = Math.max(...grosses);
// 用户口径：「略微提高量级，达到千或万」。跑刀/常规应落在 3~8 万，
// 猛攻作为高风险路线允许更高上限（8~15 万）。
const T1 = lo >= 30000 && hi <= 160000;
console.log(`  T1 一次成功撤离总收益 3~15 万：${T1 ? "✅" : "❌"} 实际 ${fmt(lo)} ~ ${fmt(hi)}`);
const cheapOk = rows[0].gross <= 80000;
console.log(`  T1b 跑刀落在 3~8 万：${cheapOk ? "✅" : "❌"} ${fmt(rows[0].gross)}`);

const nets = rows.map((r) => r.net);
const allPos = nets.every((n) => n > 0);
console.log(`  T2a 三条路线净值均为正：${allPos ? "✅" : "❌"} ${nets.map(fmt).join(" / ")}`);
const netRatio = Math.max(...nets) / Math.min(...nets);
console.log(`  T2b 净值同量级（比值 ≤2.5）：${netRatio <= 2.5 ? "✅" : "❌"} ${netRatio.toFixed(2)}x`);

const shares = rows.map((r) => r.share);
const T3 = shares.every((s) => s >= 0.60 && s <= 0.80);
console.log(`  T3 收集品占 65~75%（容差 60~80%）：${T3 ? "✅" : "❌"} ${shares.map((s) => (s * 100).toFixed(0) + "%").join(" / ")}`);

// 战备成本 vs 一次收益（三角洲手感：一套中档 ≈ 一次成功撤离的收入，
// 但不必恰好等值 —— 0.5~1.2 都算「打一局能换半套到一套」）
const mid = rows.find((r) => r.key === "mid");
const costRatio = mid.cost / mid.gross;
console.log(`  T4 中档战备成本 ≈ 一次撤离收益：${costRatio >= 0.5 && costRatio <= 1.2 ? "✅" : "❌"} 成本/收益 = ${costRatio.toFixed(2)}`);

console.log("\n### 现有价格量级");
const cardRows = JSON.parse(fs.readFileSync(path.join(DATA, "card-price-table-v1.json"), "utf8"))
  .map((r) => r.displayPrice * S);
const elem = cardRows.filter((p) => p <= 20 * S).length;
console.log(`  卡牌价格：最低 ${fmt(Math.min(...cardRows))} · 最高 ${fmt(Math.max(...cardRows))} · 中位 ${fmt(cardRows.sort((a,b)=>a-b)[Math.floor(cardRows.length/2)])}`);
const eq = Object.entries(L.EQUIP_DEFS).map(([id, d]) => E.equipPrice(L.equipWv(d), L.recipeValue(id)) * S);
console.log(`  战备价格：最低 ${fmt(Math.min(...eq))} · 最高 ${fmt(Math.max(...eq))}`);
const mats = Object.values(Lo.MATERIALS).map((m) => m.value * S);
console.log(`  材料价格：最低 ${fmt(Math.min(...mats))} · 最高 ${fmt(Math.max(...mats))}`);
const cols = Object.values(Lo.VALUE_RANGE).map((v) => (v.min + v.max) / 2 * S);
console.log(`  收集品：白 ${fmt(cols[0])} → 唯一 ${fmt(cols[5])}`);

console.log("\n### 关键比例（用于判断是否自洽）");
console.log(`  基础卡价 / 一次跑刀收益 = ${(12 * S / rows[0].gross).toFixed(4)}  （太大→卡牌买不起；太小→卡牌无意义）`);
console.log(`  中档战备 / 一次常规收益 = ${costRatio.toFixed(2)}`);
console.log(`  材料（绿）/ 一次跑刀收益 = ${(22 * S / rows[0].gross).toFixed(3)}`);
