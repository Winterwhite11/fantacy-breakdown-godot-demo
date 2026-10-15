#!/usr/bin/env node
/**
 * balance.mjs —— 自动化平衡测试
 *
 * 用固定种子把「预设法术组」跑遍全部遭遇，输出胜率与 95% 置信区间。
 * 因为种子固定，同一版本的结果**完全可复现**；版本间对比即可判断改动影响。
 *
 * 用法：
 *   node tools/balance.mjs                 # 默认 300 局/组合
 *   node tools/balance.mjs --games 1000
 *   node tools/balance.mjs --json          # 机器可读
 *   node tools/balance.mjs --save          # 写入 reports/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const JS = path.join(REPO, "html-demo", "js");
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const getArg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const GAMES = Number(getArg("--games", 300));
const SEED = Number(getArg("--seed", 20261012));
const AS_JSON = argv.includes("--json");
const SAVE = argv.includes("--save");

// ── 载入真实数据（浏览器脚本一律用 new Function 执行并取回导出）──
const win = {};
const load = (f) => new Function("window", fs.readFileSync(path.join(JS, f), "utf8"))(win);
for (const f of ["card-data.js", "summon-elements.js", "cards.js", "encounters.js"]) load(f);
const ECON_SRC = fs.readFileSync(path.join(JS, "economy.js"), "utf8");
const E = new Function("window", ECON_SRC + "\nreturn FBEconomyModule;")(win) || win.FBEconomy;
const SIM = new Function("window",
  fs.readFileSync(path.join(JS, "sim.js"), "utf8") + "\nreturn FBSimModule;")(win);
const C = win.FBCards, EN = win.FBEncounters;

// ── 把卡表效果解析成 sim 需要的扁平字段 ──
function resolveForSim(id) {
  const def = C.CARD_DEFS[id];
  const we = C.WORD_EFFECTS[id];
  const wd = C.WORD_DEFS[id];
  const out = { id, name: def?.name || wd?.name || id, chant: 1 };
  if (def && (def.type === "element" || def.type === "process")) {
    Object.assign(out, def.play || {});
    out.chant = def.chant || 1;
    return out;
  }
  if (we) {
    out.chant = wd?.chant || 2;
    // 【2026-10-14 修正】原实现只搬运固定 9 个键（damage/block/burn/poison/freeze/
    // fervor/heal/aoe/multi），导致四个新体系的核心机制在模拟里**完全不存在**：
    //   冻结的 freezeBonus / melt_to_flame / shatter
    //   中毒的 detonatePoison / plague / bone_corrode
    //   砂的   armorToDamage / armorPermanent / armorAmp
    // 表现就是"砂卡退化成只有护甲" → 模拟胜率 0%，而这是模拟器不完整，不是设计问题。
    // 现在改为**全键透传**，再由 sim.js 决定认哪些。
    Object.assign(out, we);
    out.id = id;
    out.name = def?.name || wd?.name || id;
    if (we.damageByChant) out.damage = C.standardDamage(out.chant);
    if (we.multiBlock) out.block = we.multiBlock.reduce((a, b) => a + b, 0);
  }
  return out;
}

function buildDeck(spec, mark = {}) {
  const cards = [];
  for (const [id, n] of Object.entries(spec)) {
    for (let i = 0; i < n; i++) cards.push(resolveForSim(id));
  }
  // 体系级约束（如砂的「不能回血」）随卡组一起传给模拟器
  if (mark.noHeal) cards.noHeal = true;
  return cards;
}

// ── 预设法术组（代表三条玩法路线）──
// 卡组用 `{卡id: 数量}` 描述；`mark` 用于注入体系级约束
const DECKS = {
  "跑刀·基础元素": buildDeck({ fire: 4, water: 4, sand: 2 }),
  "常规·合成流": buildDeck({ water: 4, fire: 2, sand: 2, steam: 1, concrete: 1 }),
  "猛攻·钢铁火枪": buildDeck({ steel: 3, firearm: 2, fortress: 2, fire: 3 }),
  "燃烧流": buildDeck({ ash: 2, fire: 3, burst_burn: 2, fuel: 1, cremate: 1, charcoal: 1 }),
  "电系·激昂": buildDeck({ electric: 3, store_charge: 2, grid: 2, surge: 1, shock: 1, overload: 1 }),
  "多段·藤蔓": buildDeck({ vine: 3, fire_vine: 2, poison_vine: 2, root: 1, wood: 2 }),
  // ── 2026-10-14 新增：四个体系的代表卡组（用于循环测试可玩性）──
  // 每套按「核心卡 + 上状态 + 结算」的体系节奏组牌，模拟玩家的自然组法
  "冻结流": buildDeck({ snow: 3, hypothermia: 2, frost_core: 1, ice_wall: 1, everfrost: 1,
                        melt_to_flame: 1, ice: 2, amp: 1 }),
  "中毒流": buildDeck({ poison: 2, poison_blade: 2, miasma: 1, poison_burst: 2, plague: 1,
                        bone_corrode: 1, melt_poison: 1, spore: 1 }),
  // 砂体系约束③：不能恢复生命 —— 卡组被标记 noHeal，模拟器据此忽略回血
  // ⚠ 卡组构成要点（实测教训）：砂的三种输出（砂爆/砂葬/砂棺）**都消耗护甲**，
  //   而护甲是它唯一的防御。所以卡组里**不能塞"只花护甲不产出"的牌**
  //   （初版带了 砂崩=全护甲换抽牌、堆砌=无效果，把护甲全浪费 → 胜率 0%）。
  "砂防流": buildDeck({ sand: 3, sand_wall: 3, sandstone: 1, solidify_sand: 1, sand_steel: 1,
                        quicksand: 1, sand_armor: 2 }, { noHeal: true }),
  "砂转伤流": buildDeck({ sand: 4, sand_wall: 3, sand_burst: 3, sand_burial: 1,
                          solidify_sand: 1, sand_steel: 1, sand_armor: 2 }, { noHeal: true }),
};

const ENCS = [...EN.NORMAL_ENCOUNTERS, ...EN.HARD_ENCOUNTERS];

const result = { seed: SEED, games: GAMES, generatedAt: new Date().toISOString(), rows: [] };

for (const [deckName, deck] of Object.entries(DECKS)) {
  const deckWv = deck.reduce((s, c) => {
    const wv = E.wvOf(c);
    return s + (wv || c.damage || 0);
  }, 0);
  const deckCost = deck.reduce((s, c) => {
    const wv = E.wvOf(c) || c.damage || 0;
    return s + E.priceOfBase(wv);
  }, 0);

  const row = { deck: deckName, cards: deck.length, deckWv: Math.round(deckWv), deckCost: Math.round(deckCost), enc: {} };
  for (const enc of ENCS) {
    const r = SIM.simulateMany({
      games: GAMES, seed: SEED + enc.id.charCodeAt(5) * 1000,
      deckCards: deck, encounter: enc, playerMaxHp: 60, policy: "greedy",
    });
    row.enc[enc.id] = { name: enc.name, tier: enc.tier, ...r };
  }
  result.rows.push(row);
}

// ── 输出 ──
if (AS_JSON) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("═".repeat(96));
  console.log(`  自动化平衡测试 · 种子 ${SEED} · 每组 ${GAMES} 局 · 玩家 60 HP`);
  console.log("═".repeat(96));
  const encIds = ENCS.map((e) => e.id);
  const tierLine = encIds.map((id) => {
    const e = ENCS.find((x) => x.id === id);
    return `${id.slice(4)}:档${e.tier}`;
  }).join(" ");
  console.log(`\n遭遇档位  ${tierLine}`);
  console.log("\n法术组                成本   总WV  " + encIds.map((id) => id.slice(4).padStart(4)).join(" ") + "   平均胜率");
  console.log("─".repeat(96));
  for (const r of result.rows) {
    const cells = encIds.map((id) => {
      const w = r.enc[id].winRate;
      return (w * 100).toFixed(0).padStart(4);
    });
    const avg = encIds.reduce((s, id) => s + r.enc[id].winRate, 0) / encIds.length;
    console.log(`${r.deck.padEnd(20)} ${String(r.deckCost).padStart(5)} ${String(r.deckWv).padStart(6)}  ${cells.join(" ")}   ${(avg * 100).toFixed(1)}%`);
  }

  console.log("\n### 诊断");
  // 1) 是否存在"全能"卡组（所有遭遇都高胜率 ⇒ 破坏取舍）
  for (const r of result.rows) {
    const rates = encIds.map((id) => r.enc[id].winRate);
    const min = Math.min(...rates), max = Math.max(...rates);
    const hard = encIds.filter((id) => {
      const e = ENCS.find((x) => x.id === id);
      return e.tier >= 4;
    }).map((id) => r.enc[id].winRate);
    const hardMax = hard.length ? Math.max(...hard) : 0;
    const tier12 = encIds.filter((id) => {
      const e = ENCS.find((x) => x.id === id);
      return e.tier <= 2;
    }).map((id) => r.enc[id].winRate);
    const lowMin = tier12.length ? Math.min(...tier12) : 1;
    const tag = [];
    if (lowMin < 0.6) tag.push(`⚠ 低级遭遇都打不过(${(lowMin * 100).toFixed(0)}%)`);
    if (hardMax > 0.8) tag.push(`⚠ 精英战过于轻松(${(hardMax * 100).toFixed(0)}%)`);
    if (max - min < 0.15) tag.push("⚠ 难度区分度不足");
    if (!tag.length) tag.push("✓ 难度曲线合理");
    console.log(`  ${r.deck.padEnd(20)} 区间 ${(min * 100).toFixed(0)}%~${(max * 100).toFixed(0)}%  ${tag.join("；")}`);
  }

  // 2) 各遭遇是否被"廉价卡组"轻松通关（威胁不足）
  console.log("\n### 各遭遇的最低成本通关情况");
  for (const id of encIds) {
    const e = ENCS.find((x) => x.id === id);
    const rows = result.rows.map((r) => ({ deck: r.deck, cost: r.deckCost, wr: r.enc[id].winRate }));
    const cheapest = rows.filter((r) => r.wr >= 0.6).sort((a, b) => a.cost - b.cost)[0];
    const best = rows.sort((a, b) => b.wr - a.wr)[0];
    console.log(`  ${id} ${e.name.padEnd(8)} 档${e.tier}  最低可过成本 ${cheapest ? cheapest.cost + "（" + cheapest.deck + "，" + (cheapest.wr * 100).toFixed(0) + "%）" : "无（都打不过）"}   最佳 ${best.deck} ${(best.wr * 100).toFixed(0)}%`);
  }
}

if (SAVE) {
  const dir = path.join(REPO, "game-design-workflow", "reports");
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `balance-${new Date().toISOString().slice(0, 10)}-seed${SEED}.json`);
  fs.writeFileSync(f, JSON.stringify(result, null, 2), "utf8");
  console.log(`\n已写入 ${path.relative(REPO, f)}`);
}
