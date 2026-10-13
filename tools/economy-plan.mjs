#!/usr/bin/env node
/**
 * economy-plan.mjs —— 一次性算清经济参数（含掉率），并校验全部目标
 *
 * 这是 economy-solve 的收尾：solve 给出了「每节点收集品价值」，
 * 这里把差异交给**掉率**承担（价值阶梯固定为材料推导的量级），
 * 然后逐条校验 T1~T4。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, "..", "game-design-workflow", "data");

const NODES = 4.5;
const MATERIAL_RATIO = 0.25;      // 25% 的收集品掉落改为材料
const MATERIAL_SHARE = 0.5;       // 材料价值 = 同档收集品的 50%

// ── 目标（用户确认）──
const ROUTES = {
  cheap: { name: "跑刀", tier: 1, gross: 40000, net: 20000, death: 0.12 },
  mid:   { name: "常规", tier: 2, gross: 70000, net: 22000, death: 0.22 },
  heavy: { name: "猛攻", tier: 3, gross: 160000, net: 26000, death: 0.30 },
};

// ── 价值阶梯（由「中档战备成本 48000 → 单件绿材料 ≈ 6857」反推）──
// 取整并保持几何比 k≈2.2
const STEP = { white: 3000, green: 6600, blue: 14500, purple: 32000, gold: 70000, unique: 155000 };
const mid = (r) => Math.round((STEP[r] * 0.6 + STEP[r] * 1.4) / 2);   // ±40% 区间的均值
const VAL = Object.fromEntries(Object.entries(STEP).map(([r, v]) => [r, v]));

// ── 战备成本（= 收益 − 净值）──
const cost = (k) => ROUTES[k].gross - ROUTES[k].net;

// ── 解掉率 ──
// 目标：每节点收集品期望 = 该路线 colTarget / (survive × NODES)
// 其中价值已含「25% 转材料」的折减
const eff = (r) => VAL[r] * (1 - MATERIAL_RATIO + MATERIAL_RATIO * MATERIAL_SHARE);

console.log("═".repeat(80));
console.log("  经济参数完整方案");
console.log("═".repeat(80));
console.log("\n### 价值阶梯（收集品与材料共用）");
for (const [r, v] of Object.entries(STEP)) {
  console.log(`  ${r.padEnd(7)} ${String(v).padStart(7)}   （材料取 ${Math.round(v * MATERIAL_SHARE)}）`);
}

console.log("\n### 每档目标：收集品/节点");
const plan = {};
for (const [k, r] of Object.entries(ROUTES)) {
  const survive = 1 - r.death;
  const colTarget = r.gross * 0.70;
  const perNode = colTarget / (survive * NODES);
  const tokPerNode = (r.gross * 0.30) / (survive * NODES);
  plan[k] = { ...r, survive, perNode, tokPerNode, cost: cost(k) };
  console.log(`  ${r.name}  收益 ${String(r.gross).padStart(7)} → 收集品 ${String(Math.round(colTarget)).padStart(7)} → 每节点 ${String(Math.round(perNode)).padStart(7)}`);
}

console.log("\n### 反推掉率（保持价值阶梯不变，用掉率吸收差异）");
// 各档可用稀有度池
const POOL = {
  1: ["white", "green"],
  2: ["white", "green", "blue"],
  3: ["green", "blue", "purple", "gold"],
};
// 结构权重：决定该档掉落在各稀有度间的**相对**分布（美术/掉落品味，可手调）
const WEIGHT = {
  1: { white: 0.72, green: 0.28 },
  2: { white: 0.45, green: 0.38, blue: 0.17 },
  3: { green: 0.42, blue: 0.36, purple: 0.18, gold: 0.04 },
};
// 缩放系数：使 Σ(weight × scale × eff) = 目标每节点价值
const DROP = {};
const SCALE = {};
for (const t of [1, 2, 3]) {
  const perUnit = Object.entries(WEIGHT[t]).reduce((s, [r, w]) => s + w * eff(r), 0);
  const scale = plan[t === 1 ? "cheap" : t === 2 ? "mid" : "heavy"].perNode / perUnit;
  SCALE[t] = scale;
  DROP[t] = Object.fromEntries(Object.entries(WEIGHT[t]).map(([r, w]) => [r, Math.round(w * scale * 1000) / 1000]));
  const per = Object.entries(DROP[t]).reduce((s, [r, c]) => s + c * eff(r), 0);
  console.log(`  档${t}: 缩放 ${scale.toFixed(3)} → 期望 ${Math.round(per).toLocaleString()}/节点  ` +
    `(${Object.entries(DROP[t]).map(([r, c]) => `${r} ${(c * 100).toFixed(0)}%`).join(" · ")})`);
}
// 掉率不应超过 1（否则「每节点必出」都不够，需要抬高价值阶梯）
for (const t of [1, 2, 3]) {
  const over = Object.entries(DROP[t]).filter(([, c]) => c > 0.95);
  if (over.length) console.log(`  ⚠ 档${t} 掉率过高（${over.map(([r, c]) => `${r}${(c * 100).toFixed(0)}%`).join(" ")}）—— 建议抬高该档价值或增加节点`);
}

console.log("\n### 阶梯有效性（材料价值 = 收集品同档的一半，用于核对战备成本）");
const matOf = (r) => Math.round(STEP[r] * MATERIAL_SHARE);
console.log(`  绿材料 ${matOf("green")} · 蓝材料 ${matOf("blue")} · 紫材料 ${matOf("purple")}`);

console.log("\n### 战备成本目标");
for (const [k, p] of Object.entries(plan)) {
  console.log(`  ${p.name}  战备价值应 ≈ ${String(p.cost).padStart(7)}`);
}
console.log("\n### 与现有一件战备的对照（用于确认「一套战备」的量级）");
// 一套中档 = 护目盔 + 絮衬护甲 + 速射手枪 + 普通背包
const SET = ["helmet_visor", "armor_padded", "rifle_rapid", "backpack_normal"];
console.log(`  中档四件套 ≈ 48000 目标；单件均价 ${Math.round(48000 / SET.length)}`);
console.log(`  → 速射手枪（武器，应占大头）≈ ${Math.round(48000 * 0.45)}`);
console.log(`  → 絮衬护甲/护目盔 ≈ ${Math.round(48000 * 0.20)}`);
console.log(`  → 普通背包 ≈ ${Math.round(48000 * 0.10)}`);

console.log("\n### 校验目标");
const g = Object.values(plan).map((p) => p.gross);
console.log(`  T1 收益 3~8 万：${Math.min(...g) >= 30000 && Math.max(...g) <= 80000 ? "✅" : "❌"} ${Math.min(...g)} ~ ${Math.max(...g)}`);
const nets = Object.values(plan).map((p) => p.net);
console.log(`  T2a 净值均为正：${nets.every((n) => n > 0) ? "✅" : "❌"} ${nets.join(" / ")}`);
console.log(`  T2b 净值比 ≤2.5：${Math.max(...nets) / Math.min(...nets) <= 2.5 ? "✅" : "❌"} ${(Math.max(...nets) / Math.min(...nets)).toFixed(2)}x`);
console.log(`  T3 收集品占比 70%：✅（按构造）`);
console.log(`  T4 中档成本/收益：${(plan.mid.cost / plan.mid.gross).toFixed(2)}`);
