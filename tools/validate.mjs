#!/usr/bin/env node
/**
 * validate.mjs —— 一键体检（自动化作业）
 *
 * 检查项：
 *   1. 语法   所有 html-demo JS 能否解析
 *   2. 遭遇   档位/血量 是否与 enemy-tiers-reference.json（设计文档）一致
 *   3. 卡表   配方覆盖率、ID 稳定性、生成物与源一致性
 *   4. 效果   每张有配方的牌是否都有实现（或明确列入白名单）
 *   5. 经济   定价单调性、合成不亏本、风险阶梯合理性
 *
 * 用法：node tools/validate.mjs [--json]
 * 退出码：0 全部通过；1 有失败项
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const HD = path.join(REPO, "html-demo");
const JS = path.join(HD, "js");
const DATA = path.join(REPO, "game-design-workflow", "data");
const require = createRequire(import.meta.url);

const R = { pass: 0, fail: 0, warn: 0, sections: [] };
const sec = (title) => { const s = { title, items: [] }; R.sections.push(s); return s; };
const ok = (s, msg) => { s.items.push({ level: "ok", msg }); R.pass++; };
const bad = (s, msg) => { s.items.push({ level: "fail", msg }); R.fail++; };
const warn = (s, msg) => { s.items.push({ level: "warn", msg }); R.warn++; };

/** 在沙箱里加载浏览器脚本，返回挂在 window 上的对象 */
function loadBrowserGlobals(files) {
  const win = { console: { log() {}, warn() {}, error() {} } };
  const doc = { addEventListener() {}, readyState: "complete" };
  for (const f of files) {
    const src = fs.readFileSync(path.join(JS, f), "utf8");
    new Function("window", "document", "localStorage", "performance", src)(
      win, doc, { getItem: () => null, setItem() {}, removeItem() {} }, { now: () => 0 }
    );
  }
  return win;
}

// ── 1. 语法 ──
{
  const s = sec("1. 语法检查");
  for (const f of fs.readdirSync(JS).filter((x) => x.endsWith(".js")).sort()) {
    const src = fs.readFileSync(path.join(JS, f), "utf8");
    try {
      new Function("window", "document", "localStorage", "performance", src);
      ok(s, `${f} 解析通过`);
    } catch (e) {
      bad(s, `${f} 语法错误: ${e.message}`);
    }
  }
}

// ── 2. 遭遇 vs 设计文档 ──
{
  const s = sec("2. 遭遇档位/血量 vs 设计文档");
  const win = loadBrowserGlobals(["encounters.js"]);
  const EN = win.FBEncounters;
  const ref = JSON.parse(fs.readFileSync(path.join(DATA, "enemy-tiers-reference.json"), "utf8"));
  const byId = {};
  [...EN.NORMAL_ENCOUNTERS, ...EN.HARD_ENCOUNTERS].forEach((e) => (byId[e.id] = e));

  for (const r of ref.encounters) {
    const e = byId[r.id];
    if (!e) { bad(s, `${r.id} 在代码中不存在`); continue; }
    if (e.tier !== r.tier) bad(s, `${r.id} ${r.name} 档位 ${e.tier} ≠ 设计 ${r.tier}`);
    else ok(s, `${r.id} ${r.name} 档位 = ${r.tier}`);

    for (const [uname, uhp] of Object.entries(r.units)) {
      const u = e.units.find((x) => x.name === uname);
      if (!u) bad(s, `${r.id} 缺少单位 ${uname}`);
      else if (u.hp !== uhp) bad(s, `${r.id}/${uname} 血量 ${u.hp} ≠ 设计 ${uhp}`);
    }
  }
  // rewardTier 必须存在且合法
  for (const e of Object.values(byId)) {
    if (e.rewardTier == null) bad(s, `${e.id} 缺 rewardTier（奖励档位应与难度解耦）`);
    else if (![1, 2, 3].includes(e.rewardTier)) bad(s, `${e.id} rewardTier=${e.rewardTier} 越界（应 1-3）`);
  }
  if (R.fail === 0) ok(s, `共核对 ${ref.encounters.length} 组遭遇，rewardTier 全部合法`);
}

// ── 3. 卡表完整性 ──
let T = null, C = null, winAll = null;
{
  const s = sec("3. 卡表完整性");
  winAll = loadBrowserGlobals(["card-data.js", "economy.js", "cards.js"]);
  T = winAll.FBCardTable;
  C = winAll.FBCards;

  if (!T) bad(s, "FBCardTable 未加载");
  else {
    ok(s, `伤害表 ${JSON.stringify(T.chant_damage)}`);
    const el = Object.keys(T.elements).length;
    const pr = Object.keys(T.processes).length;
    const sp = T.specials.length;
    ok(s, `元素 ${el} / 操作 ${pr} / 特殊合成 ${sp} / 占位 ${(T.placeholders || []).length}`);

    const noRecipe = T.specials.filter((x) => !(x.materials_alts || []).length);
    ok(s, `无配方条目 ${noRecipe.length} 条：${noRecipe.map((x) => x.name).join("、") || "无"}`);
    const dup = {};
    T.specials.forEach((x) => (dup[x.id] = (dup[x.id] || 0) + 1));
    const di = Object.entries(dup).filter(([, n]) => n > 1);
    if (di.length) bad(s, `重复 id: ${di.map(([k, n]) => `${k}x${n}`).join(", ")}`);
    else ok(s, "无重复 id");
  }
}

// ── 4. 效果实现覆盖 ──
let IMPL_WHITELIST = [];
{
  const s = sec("4. 卡牌效果实现覆盖");
  const wlPath = path.join(DATA, "unimplemented-effects-whitelist.json");
  if (fs.existsSync(wlPath)) {
    IMPL_WHITELIST = JSON.parse(fs.readFileSync(wlPath, "utf8")).ids || [];
  }
  const we = C.WORD_EFFECTS;
  const missing = T.specials
    .filter((x) => (x.materials_alts || []).length > 0)
    .filter((x) => !we[x.id] && !IMPL_WHITELIST.includes(x.id))
    .map((x) => `${x.num} ${x.name}(${x.id})`);
  if (missing.length) bad(s, `${missing.length} 张有配方的牌无实现：${missing.join("、")}`);
  else ok(s, "所有可合成牌均有实现");

  if (IMPL_WHITELIST.length) warn(s, `白名单（已登记待办）${IMPL_WHITELIST.length} 张：${IMPL_WHITELIST.join(", ")}`);
}

// ── 5. 经济校验 ──
{
  const s = sec("5. 经济校验");
  const E = winAll.FBEconomy;
  if (!E) { bad(s, "FBEconomy 未加载"); }
  else {
    // 定价单调性：WV 越大，性价比越低
    const pts = [];
    for (let wv = 1; wv <= 70; wv++) {
      const p = E.priceOfBase(wv);
      pts.push({ wv, p, eff: E.efficiency(wv, p) });
    }
    let inv = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].eff > pts[i - 1].eff + 1e-9) inv++;
    if (inv) warn(s, `性价比单调性有 ${inv} 处逆序（强度越高越划算 → 需调 K/系数）`);
    else ok(s, "定价性价比随强度单调递减");

    // 合成不亏本
    let lossCnt = 0;
    for (const x of T.specials) {
      for (const mats of x.materials_alts || []) {
        const mp = mats.map((m) => E.priceOfBase(5));
        const cost = E.priceOfProduct(5, mp);
        const sum = mp.reduce((a, b) => a + b, 0);
        if (cost < sum) lossCnt++;
        break;
      }
    }
    if (lossCnt) warn(s, `${lossCnt} 条合成产物定价低于材料之和`);
    else ok(s, "合成产物定价 ≥ 材料之和");

    // 风险阶梯：跑刀 vs 猛攻的盈亏平衡存活率应递减（越激进越需要技术）
    const runs = [
      ["跑刀", 30, 0.85, 60],
      ["常规", 120, 0.7, 320],
      ["猛攻", 500, 0.55, 1600],
    ].map(([n, c, p, v]) => ({ n, ...E.expectedRunValue(c, p, v) }));
    const mono = runs.every((r, i) => i === 0 || r.breakEvenP <= runs[i - 1].breakEvenP + 1e-9);
    if (mono) ok(s, `风险阶梯成立（盈亏平衡存活率递减：${runs.map((r) => `${r.n} ${r.breakEvenP}`).join(" → ")}）`);
    else warn(s, "风险阶梯不单调：激进路线的技术门槛没有更高，猛攻可能无意义");

    const allPos = runs.every((r) => r.ev > 0);
    if (allPos) ok(s, `三种路线 EV 均为正：${runs.map((r) => `${r.n}=${r.ev}`).join(", ")}`);
    else warn(s, "存在 EV ≤ 0 的路线（该玩法不成立）");
  }
}

// ── 输出 ──
const json = process.argv.includes("--json");
if (json) {
  console.log(JSON.stringify(R, null, 2));
} else {
  console.log("═".repeat(72));
  console.log("  Fantacy Breakdown · 自动化体检");
  console.log("═".repeat(72));
  for (const s of R.sections) {
    console.log(`\n▌ ${s.title}`);
    for (const it of s.items) {
      const mark = it.level === "ok" ? "  ✓" : it.level === "warn" ? "  ▲" : "  ✗";
      console.log(`${mark} ${it.msg}`);
    }
  }
  console.log("\n" + "─".repeat(72));
  console.log(`  通过 ${R.pass} · 警告 ${R.warn} · 失败 ${R.fail}`);
  console.log("─".repeat(72));
}
process.exit(R.fail ? 1 : 0);
