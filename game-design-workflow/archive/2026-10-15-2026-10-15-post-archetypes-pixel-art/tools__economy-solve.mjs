#!/usr/bin/env node
/**
 * economy-solve.mjs —— 经济参数反向求解
 *
 * 不再靠试算凑数：给定**目标收益结构**，直接解出各参数应取的值。
 *
 * 目标（用户确认）：
 *   T1 一次成功撤离总收益 3~8 万
 *   T2 跑刀低投低产 / 猛攻高投高产，净值同量级
 *   T3 收集品占 65~75%（收集品是主角）
 *   T4 中档战备成本 ≈ 一次撤离收益（三角洲手感）
 *
 * 联立思路：
 *   每局的收集品收益 = Σ(节点掉率 × 收集品期望值) × 节点数 + 储藏期望
 *   每局的代币收益   = 节点数 × 平均战金
 *   战备成本         = 按目标净值反推
 *   收集品价值阶梯   ← 解出「让 T3 成立」所需的量级
 *   材料价值         ← 保持「合成 = 直购一半」的恒等式
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, "..", "game-design-workflow", "data");

// ── 目标（用户确认）──
const TARGET = {
  totalMin: 30000, totalMax: 80000,
  collectShare: 0.70,
  // 每条路线的目标总收益与净值
  routes: {
    cheap: { tier: 1, gross: 40000, net: 20000, death: 0.12 },
    mid:   { tier: 2, gross: 70000, net: 22000, death: 0.22 },
    heavy: { tier: 3, gross: 160000, net: 26000, death: 0.30 },
  },
};

// ── 固定结构（来自 economy-config，掉率与节点数不改）──
const CFG = JSON.parse(fs.readFileSync(path.join(DATA, "economy-config.json"), "utf8"));
const NODES = (CFG.run.nodesMin + CFG.run.nodesMax) / 2;   // 4.5

/** 材料掉率：rollCollectible 里 25% 的收集品掉落改为材料 */
const MATERIAL_RATIO = 0.25;
/** 材料价值 / 同档收集品价值（统一阶梯下的比例） */
const MATERIAL_SHARE_OF_TIER = 0.5;

/**
 * 解出一条路线所需的「收集品单次掉落期望价值」与「代币单价」。
 *
 *   收集品期望 = survive × nodes × (1-μ) × V         其中 V 为收集品加权期望价值
 *              + survive × 储藏期望
 *   为简化，先只解 V 与 token，储藏按现有掉率折算进 V（等价于抬高 V）。
 */
function solveRoute(key) {
  const r = TARGET.routes[key];
  const survive = 1 - r.death;
  const colTarget = r.gross * TARGET.collectShare;
  const tokTarget = r.gross * (1 - TARGET.collectShare);
  // 代币：每次尝试的期望 = survive × nodes × 单节点均值
  const tokenPerNode = tokTarget / (survive * NODES);
  // 收集品：有效掉落次数（扣除转为材料的部分之后仍按同等价值计入，因为材料也在阶梯上）
  // 这里把 gate 与 cache 合并求解「每节点等效收集品价值」
  const colPerNode = colTarget / (survive * NODES);
  return { key, tier: r.tier, survive, gross: r.gross, net: r.net, cost: r.gross - r.net, tokenPerNode, colPerNode, colTarget, tokTarget };
}

const solved = ["cheap", "mid", "heavy"].map(solveRoute);

const fmt = (n) => Math.round(n).toLocaleString("en-US");
console.log("═".repeat(78));
console.log("  经济参数反向求解");
console.log("═".repeat(78));
console.log(`\n固定结构：节点数 ${NODES} · 材料掉率占比 ${MATERIAL_RATIO * 100}%`);
console.log("\n路线        目标收益    目标净值   战备成本   代币/节点   收集品/节点");
console.log("─".repeat(78));
for (const s of solved) {
  console.log(
    ({ cheap: "跑刀", mid: "常规", heavy: "猛攻" }[s.key]).padEnd(10) +
    fmt(s.gross).padStart(10) +
    fmt(s.net).padStart(11) +
    fmt(s.cost).padStart(11) +
    fmt(s.tokenPerNode).padStart(12) +
    fmt(s.colPerNode).padStart(14)
  );
}

// ── 由「收集品/节点」反推掉率与价值阶梯 ──
console.log("\n### 收集品价值阶梯（与目标收益联立）");
console.log("  现有掉率（gate，每节点）：");
for (const t of ["1", "2", "3"]) {
  const g = CFG.collectibleGate[t] || {};
  const parts = Object.entries(g).map(([r, c]) => `${r} ${(c * 100).toFixed(0)}%`);
  console.log(`    档${t}: ${parts.join(" · ")}`);
}
const gates = CFG.collectibleGate;
const caches = CFG.tierCache;

/** 给定阶梯值，算出某档「每节点收集品期望价值」 */
function colPerNodeFor(tier, valueOf) {
  const g = gates[String(tier)] || {};
  let per = 0;
  for (const [rarity, chance] of Object.entries(g)) {
    // 掉出的是收集品或材料，取二者价值的加权（材料 = 同档 × MATERIAL_SHARE_OF_TIER）
    const v = valueOf(rarity) * (1 - MATERIAL_RATIO + MATERIAL_RATIO * MATERIAL_SHARE_OF_TIER);
    per += chance * v;
  }
  return per;
}
/** 档位专属储藏：均摊到每个节点的期望价值 */
function cachePerNodeFor(tier, valueOf) {
  const c = caches[String(tier)];
  if (!c) return 0;
  let per = c.chance * valueOf(c.rarity);
  if (c.extraChance) per += c.extraChance * valueOf(c.extraRarity);
  return per / NODES;
}

console.log("\n### 求解：让每档的 收集品/节点 达到目标所需的阶梯量级");
// 以「白=W」为基准，其余按几何比 k 递推，解出 W
const RARITY_ORDER = ["white", "green", "blue", "purple", "gold", "unique"];
const cur = CFG.collectibleValue;
const curMid = RARITY_ORDER.map((r) => (cur[r].min + cur[r].max) / 2);
// 现有比例的几何均值
let ratios = [];
for (let i = 1; i < curMid.length; i++) ratios.push(curMid[i] / curMid[i - 1]);
const k = Math.pow(ratios.reduce((a, b) => a * b, 1), 1 / ratios.length);
console.log(`  现有阶梯几何比 k ≈ ${k.toFixed(2)}（白 ${fmt(curMid[0])} → 唯一 ${fmt(curMid[5])}）`);

for (const s of solved) {
  const valueOf = (rarity) => {
    const i = RARITY_ORDER.indexOf(rarity);
    if (i < 0) return 0;
    return 1 * Math.pow(k, i);   // 以「白=1」为单位
  };
  const unit = colPerNodeFor(s.tier, valueOf) + cachePerNodeFor(s.tier, valueOf);   // 单位白的每节点价值
  const needWhite = unit > 0 ? s.colPerNode / unit : Infinity;
  console.log(`  ${({ cheap: "跑刀", mid: "常规", heavy: "猛攻" }[s.key]).padEnd(6)} 单位白贡献 ${unit.toFixed(3)}/节点 → 白档需 ≈ ${fmt(needWhite)}`);
}

console.log("\n### 战备成本（按目标净值反推）");
for (const s of solved) {
  console.log(`  ${({ cheap: "跑刀", mid: "常规", heavy: "猛攻" }[s.key]).padEnd(6)} 成本 ${fmt(s.cost).padStart(8)}  (= 收益 ${fmt(s.gross)} − 净值 ${fmt(s.net)})`);
}

console.log("\n### 由战备成本反推材料价值（保持「合成 = 直购一半」）");
// 中档战备（护目盔/速射手枪等）的材料合计约 = 成本 / 2
const midCost = solved.find((s) => s.key === "mid").cost;
console.log(`  中档战备成本 ${fmt(midCost)} → 典型 3~4 件材料的合计应 ≈ ${fmt(midCost / 2)}`);
console.log(`  → 单件中档材料（绿档）≈ ${fmt(midCost / 2 / 3.5)}`);
console.log(`  → 收集品阶梯（绿档）应与此同量级；白档 = 绿 / ${k.toFixed(2)} ≈ ${fmt(midCost / 2 / 3.5 / k)}`);
