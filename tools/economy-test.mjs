#!/usr/bin/env node
/**
 * economy-test.mjs —— 搜打撤经济 Monte Carlo 测试（可复现）
 *
 * 目的：验证「跑刀」与「猛攻」两条路线在经济上都成立，且不存在单一路线支配。
 *
 * 模型（每次 = 一次完整撤离尝试）：
 *   1. 玩家选一套战备（成本 C），进入一局
 *   2. 局内推进：遭遇若干威胁等级，按该战备的战力判定能否通过
 *   3. 收集品只在「通过对应威胁」后获得（方案 C：收集品受威胁门槛保护）
 *   4. 主动撤离 → 收益入仓；战败 → 损失战备 + 丢掉暂存
 *   5. 累计多局，统计净值、存活率、回本局数
 *
 * 目标校验：
 *   · 两条路线的长期净值都 > 0（都能活）
 *   · 不存在一条路线在「净值/局」上严格支配另一条（否则取舍不成立）
 *   · 高价值收集品确实被高威胁门槛保护（跑刀拿不到紫色以上）
 *
 * 用法：node tools/economy-test.mjs [--runs 400] [--seed 20261013] [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const HD = path.join(REPO, "html-demo");
const DATA = path.join(REPO, "game-design-workflow", "data");

const argv = process.argv.slice(2);
const getArg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const RUNS = Number(getArg("--runs", 400));
const SEED = Number(getArg("--seed", 20261013));
const AS_JSON = argv.includes("--json");

// ── 经济参数（单一真源，便于调参对比）──
const ECON = JSON.parse(fs.readFileSync(path.join(DATA, "economy-config.json"), "utf8"));

/** mulberry32 确定性 PRNG */
function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickWeighted = (weights, rng) => {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
};
const randInt = (min, max, rng) => min + Math.floor(rng() * (max - min + 1));

/** 一次撤离尝试 */
function runOnce(build, rng) {
  const C = build.cost;
  let tokens = 0;
  const staging = [];
  let died = false;

  const nodes = randInt(ECON.run.nodesMin, ECON.run.nodesMax, rng);
  // 死亡率模型：由 build.deathRate 给定「整局总体死亡率」，
  // 再换算成每节点独立概率，使 N 个节点后的累计死亡率 ≈ deathRate。
  //   p_node = 1 - (1 - D)^(1/N)
  // 节点数越多（暴露越久）→ 单节点风险略低但累计风险不变，符合「久留必险」直觉。
  const D = Math.min(0.95, Math.max(0, Number(build.deathRate) || 0));
  const perNodeDeath = nodes > 0 ? 1 - Math.pow(1 - D, 1 / nodes) : 0;

  for (let i = 0; i < nodes; i++) {
    if (rng() < perNodeDeath) { died = true; break; }

    const tier = build.reachableTier;
    tokens += randInt(ECON.combatToken[tier].min, ECON.combatToken[tier].max, rng);

    // 收集品：受威胁门槛保护（方案 C）
    const gate = ECON.collectibleGate[tier] || {};
    for (const [rarity, chance] of Object.entries(gate)) {
      if (rng() < chance) {
        const vr = ECON.collectibleValue[rarity];
        staging.push({ rarity, value: randInt(vr.min, vr.max, rng), from: "node" });
      }
    }
  }

  // 档位专属「精英/稀有储藏」：只有能挑战该档位才可能获得
  // （依据用户五档设计：四~五档战「一定伴随着稀有元素与特别收藏品」）
  if (!died) {
    const cache = ECON.tierCache?.[build.reachableTier];
    if (cache) {
      if (rng() < cache.chance) {
        const vr = ECON.collectibleValue[cache.rarity];
        staging.push({ rarity: cache.rarity, value: randInt(vr.min, vr.max, rng), from: "cache" });
      }
      if (cache.extraChance && rng() < cache.extraChance) {
        const vr = ECON.collectibleValue[cache.extraRarity];
        staging.push({ rarity: cache.extraRarity, value: randInt(vr.min, vr.max, rng), from: "cache-rare" });
      }
    }
  }

  if (died) {
    return { died: true, tokens: 0, stagingValue: 0, net: -C, nodes: 0 };
  }
  const stagingValue = staging.reduce((s, x) => s + x.value, 0);
  return { died: false, tokens, stagingValue, net: tokens + stagingValue - C, nodes };
}

/** 跑一条路线 N 局 */
function simulateRoute(name, build, runs, seed) {
  const rng = makeRng(seed);
  let totalNet = 0, deaths = 0, best = 0, totalTok = 0, totalCol = 0, runsToPayback = 0, cum = 0, paid = false;
  const rarityCount = {};
  for (let i = 0; i < runs; i++) {
    const r = runOnce(build, rng);
    totalNet += r.net;
    totalTok += r.tokens;
    totalCol += r.stagingValue;
    if (r.died) deaths++;
    if (r.net > best) best = r.net;
    cum += r.net;
    if (!paid && cum > build.cost) { runsToPayback = i + 1; paid = true; }
  }
  return {
    name,
    cost: build.cost,
    reachableTier: build.reachableTier,
    deathRate: deaths / runs,
    netPerRun: Math.round(totalNet / runs),
    tokenPerRun: Math.round(totalTok / runs),
    collectiblePerRun: Math.round(totalCol / runs),
    bestRun: best,
    paybackRuns: paid ? runsToPayback : null,
    totalNet: Math.round(totalNet),
  };
}

// ── 三条路线（成本/风险/可达威胁均来自 economy-config.json）──
const BUILDS = [
  { key: "cheap", name: "跑刀（基础牌）", reachableTier: 1 },
  { key: "mid", name: "常规（合成牌）", reachableTier: 2 },
  { key: "heavy", name: "猛攻（深链牌）", reachableTier: 3 },
].map((b) => {
  const cfg = ECON.builds[b.key] || {};
  return { ...b, cost: cfg.cost ?? 0, winRate: cfg.winRate ?? 0.7, deathRate: cfg.deathRate ?? 0.2 };
});

const results = BUILDS.map((b, i) => simulateRoute(b.name, b, RUNS, SEED + i * 1013));

if (AS_JSON) {
  console.log(JSON.stringify({ runs: RUNS, seed: SEED, results }, null, 2));
} else {
  console.log("═".repeat(88));
  console.log(`  搜打撤经济 Monte Carlo · ${RUNS} 局/路线 · 种子 ${SEED}`);
  console.log("═".repeat(88));
  console.log("\n路线                  战备成本  可达档  死亡率   代币/局  收集品/局  净值/局  回本局数");
  console.log("─".repeat(88));
  for (const r of results) {
    console.log(`${r.name.padEnd(20)} ${String(r.cost).padStart(7)} ${String(r.reachableTier).padStart(6)} ${(r.deathRate * 100).toFixed(0).padStart(6)}% ${String(r.tokenPerRun).padStart(8)} ${String(r.collectiblePerRun).padStart(10)} ${String(r.netPerRun).padStart(8)} ${String(r.paybackRuns ?? "—").padStart(9)}`);
  }

  console.log("\n### 判定");
  const T = ECON.targets || {};
  const allPositive = results.every((r) => r.netPerRun > 0);
  console.log(`  1) 三条路线净值均为正：${allPositive ? "✅" : "❌ " + results.filter(r => r.netPerRun <= 0).map(r => r.name).join("、")}`);

  const maxDeath = T.maxDeathRate ?? 0.3;
  const overDeath = results.filter((r) => r.deathRate > maxDeath);
  console.log(`  2) 死亡率不超 ${(maxDeath * 100).toFixed(0)}%：${overDeath.length ? "⚠ " + overDeath.map(r => `${r.name} ${(r.deathRate * 100).toFixed(0)}%`).join("、") : "✅"}`);

  const nets = results.map((r) => r.netPerRun);
  const maxNet = Math.max(...nets);
  const minNet = Math.min(...nets);
  const ratio = minNet > 0 ? maxNet / minNet : Infinity;
  const domRatio = T.dominanceRatio ?? 1.5;
  if (minNet <= 0) {
    console.log(`  3) 无单一支配路线：❌ 存在亏损路线，取舍不成立`);
  } else if (ratio > domRatio) {
    const best = results[nets.indexOf(maxNet)];
    console.log(`  3) 无单一支配路线：⚠「${best.name}」领先 ${ratio.toFixed(1)}x（目标 ≤ ${domRatio}x）`);
  } else {
    console.log(`  3) 无单一支配路线：✅ 最高/最低净值比 ${ratio.toFixed(2)}x ≤ ${domRatio}x`);
  }

  const cheapC = results[0].collectiblePerRun, heavyC = results[2].collectiblePerRun;
  const gap = T.collectibleTierGap ?? 3;
  console.log(`  4) 高价值收集品受威胁门槛保护：跑刀 ${cheapC}/局 vs 猛攻 ${heavyC}/局 → ${heavyC > cheapC * gap ? "✅" : "⚠"} 差距 ${(heavyC / Math.max(1, cheapC)).toFixed(1)}x（目标 ≥ ${gap}x）`);

  // 投资回报率：净值 / 成本
  console.log("\n### 投资回报率（净值 / 战备成本）");
  for (const r of results) {
    const roi = r.netPerRun / r.cost;
    console.log(`  ${r.name.padEnd(20)} ${(roi * 100).toFixed(1)}%`);
  }

  const verdict = [];
  if (!allPositive) verdict.push("存在亏损路线 → 需提高高阶产出 或 降低战备成本");
  if (ratio > domRatio && minNet > 0) verdict.push("一条路线领先过多 → 需调整风险/成本");
  console.log("\n  结论：" + (verdict.length ? verdict.join("；") : "经济健康：三条路线均正收益且无支配路线"));
}
