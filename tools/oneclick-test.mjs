#!/usr/bin/env node
/**
 * oneclick-test.mjs —— 一键合成测试
 *
 * 需求（用户）：「战备合成台加入一键合成的按钮，在点击确定后会自动补齐价格
 * 并从市场以当前低价购买材料并合成物品」。
 *
 * 覆盖：
 *   1. 材料齐备 → 报价为「无需买入」，一键合成不花钱
 *   2. 缺料 → 报价列出缺口、选中**最低价**挂单、给出总花费
 *   3. 市场有更贵与更便宜的同类挂单时，必须买便宜的
 *   4. 代币不足 → 拒绝且不改动任何状态
 *   5. 市场缺货 → 报价标记不可行
 *   6. 成功路径 → 材料从市场进入仓库、扣款正确、产出装备
 *   7. 不买自己（本机）的挂牌（自购只扣手续费，会变成套利口）
 *   8. 全程不产生"凭空多出的材料"
 *
 * 用法：node tools/oneclick-test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HD = path.resolve(__dirname, "..", "html-demo");
const JS = path.join(HD, "js");

// ── 从 app.js 抽出两个纯函数（app.js 依赖大量 DOM，不能整体加载）──
const appSrc = fs.readFileSync(path.join(JS, "app.js"), "utf8");
function extractFn(name) {
  const re = new RegExp(`^function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, "m");
  const m = appSrc.match(re);
  if (!m) throw new Error(`未能抽出 ${name}`);
  return m[0];
}
const QUOTE_SRC = extractFn("quoteCraftFromMarket");
const ONECLICK_SRC = extractFn("craftEquipOneClick");

// ── DOM/模块桩 ──
function makeWin() {
  const store = {};
  const mk = () => new Proxy(
    { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
      children: [], appendChild() {}, append() {}, removeChild() {}, remove() {},
      setAttribute() {}, getAttribute() { return null },
      addEventListener() {}, removeEventListener() {},
      querySelector() { return null }, querySelectorAll() { return []; },
      closest() { return null }, contains() { return false },
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
  const localStorage = { getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  return { document, localStorage, addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    location: { href: "" }, innerWidth: 1280, innerHeight: 800 };
}
const win = makeWin();
const load = (f) => new Function("window", "document", "localStorage",
  fs.readFileSync(path.join(JS, f), "utf8"))(win, win.document, win.localStorage);
for (const f of ["card-data.js", "pieces.js", "preview.js", "economy.js", "card-prices.js",
                 "summon-elements.js", "cards.js", "content-tables.js", "loadout.js", "loot.js", "market.js"]) load(f);

const L = win.FBLoadout, Lo = win.FBLoot, M = win.FBMarket;

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const check = (c, m) => (c ? ok(m) : bad(m));

/** 构造执行环境：loadout / marketState / vault 三个自由变量 */
function makeEnv(opts = {}) {
  const loadout = { collectStash: [], equipStash: [], equipped: {}, cardStash: {} };
  for (const m of opts.have || []) loadout.collectStash.push(Lo.makeMaterial(m));
  const marketState = { listings: [], priceHistory: {} };
  for (const o of opts.listings || []) {
    marketState.listings.push({
      id: o.id, zone: "collect", source: "system",
      catalogId: `material-${o.mid}`, name: o.name || o.mid,
      price: o.price, qty: o.qty,
      payload: { kind: "collectible", item: Lo.makeMaterial(o.mid) },
      ...(o.player ? { source: "player", sellerId: o.sellerId || "other" } : {}),
    });
  }
  const vault = { tokens: typeof opts.tokens === "number" ? opts.tokens : 1e9 };
  const save = { loadVault: () => vault, saveVault: () => {} };
  // 与浏览器形态一致：save 挂在 window 上（生产代码经 window.FBSave 读取）
  win.FBSave = save;
  const fn = new Function(
    "window", "loadout", "marketState", "toast", "FBSave",
    `${QUOTE_SRC}\n${ONECLICK_SRC}\nreturn { quoteCraftFromMarket, craftEquipOneClick };`
  )(win, loadout, marketState, () => {}, save);
  return { loadout, marketState, vault, ...fn };
}

console.log("═".repeat(76));
console.log("  一键合成测试");
console.log("═".repeat(76));

const DEF = "pistol_simple";            // 配方：合金板 + 火药 + 精炼底火
const RECIPE = L.equipRecipe(DEF);
const MATS = Lo.MATERIALS;
console.log(`\n测试对象：${L.EQUIP_DEFS[DEF].name}  配方 ${RECIPE.map((m) => MATS[m].name).join(" + ")}`);

// ── 1. 材料齐备 ──
console.log("\n▌ 1. 材料齐备 → 无需买入");
{
  const env = makeEnv({ have: RECIPE });
  const q = env.quoteCraftFromMarket(DEF);
  check(q.ok && q.needsBuy === false, `报价：needsBuy=${q.needsBuy} total=${q.total}`);
  const before = env.vault.tokens;
  const r = env.craftEquipOneClick(DEF);
  check(r.ok && r.spent === 0, `一键合成成功且未花钱（spent=${r.spent}）`);
  check(env.vault.tokens === before, "代币未变动");
  check(env.loadout.equipStash.length === 1, `产出装备：${env.loadout.equipStash[0]?.name}`);
}

// ── 2. 缺料 → 列出缺口与最低价 ──
console.log("\n▌ 2. 缺料 → 报价列出缺口与总花费");
{
  const env = makeEnv({
    have: [],
    listings: [
      { id: "l1", mid: "alloy_plate", price: 2000, qty: 5 },
      { id: "l2", mid: "gunpowder", price: 1800, qty: 5 },
      { id: "l3", mid: "primer", price: 4000, qty: 5 },
    ],
  });
  const q = env.quoteCraftFromMarket(DEF);
  check(q.ok && q.needsBuy, `可补齐（total=${q.total.toLocaleString()}）`);
  const expect = 2000 + 1800 + 4000;
  check(q.total === expect, `总花费 = ${expect.toLocaleString()}（各买 1 件）`);
  check(q.plan.length === 3, `计划含 ${q.plan.length} 项材料`);
  check(q.plan.every((p) => p.short === 0), "无缺货项");
}

// ── 3. 必须选最低价 ──
console.log("\n▌ 3. 同材料有多档挂单 → 必须买最低价");
{
  const env = makeEnv({
    have: [],
    listings: [
      { id: "exp", mid: "alloy_plate", price: 9000, qty: 5 },   // 贵
      { id: "cheap", mid: "alloy_plate", price: 2000, qty: 5 },  // 便宜
      { id: "l2", mid: "gunpowder", price: 1800, qty: 5 },
      { id: "l3", mid: "primer", price: 4000, qty: 5 },
    ],
  });
  const q = env.quoteCraftFromMarket(DEF);
  const alloy = q.plan.find((p) => p.id === "alloy_plate");
  check(alloy.cost === 2000, `合金板按最低价 2000 计价（未取 9000）`);
  const r = env.craftEquipOneClick(DEF);
  check(r.ok && r.spent === 2000 + 1800 + 4000,
    `实际花费 ${(r.spent ?? 0).toLocaleString()}（走低价挂单）${r.ok ? "" : " · 失败原因: " + r.reason}`);
}

// ── 4. 代币不足 ──
console.log("\n▌ 4. 代币不足 → 拒绝且不改动状态");
{
  const env = makeEnv({
    have: [],
    tokens: 100,
    listings: [
      { id: "l1", mid: "alloy_plate", price: 2000, qty: 5 },
      { id: "l2", mid: "gunpowder", price: 1800, qty: 5 },
      { id: "l3", mid: "primer", price: 4000, qty: 5 },
    ],
  });
  const r = env.craftEquipOneClick(DEF);
  check(!r.ok && /代币不足/.test(r.reason), `拒绝：${r.reason}`);
  check(env.loadout.equipStash.length === 0, "未产出装备");
  check(env.marketState.listings.every((l) => l.qty === 5), "市场库存未被扣减");
}

// ── 5. 市场缺货 ──
console.log("\n▌ 5. 市场缺货 → 报价标记不可行");
{
  const env = makeEnv({
    have: [],
    listings: [
      { id: "l1", mid: "alloy_plate", price: 2000, qty: 5 },
      // 缺 gunpowder 与 primer
    ],
  });
  const q = env.quoteCraftFromMarket(DEF);
  check(!q.ok && /缺货/.test(q.reason), `报价不可行：${q.reason}`);
  const r = env.craftEquipOneClick(DEF);
  check(!r.ok, "一键合成被拒绝");
}

// ── 6. 成功路径：材料入库 + 扣款 + 产出 ──
console.log("\n▌ 6. 成功路径（材料入仓 · 扣款 · 产出）");
{
  const env = makeEnv({
    have: [],
    listings: [
      { id: "l1", mid: "alloy_plate", price: 2000, qty: 5 },
      { id: "l2", mid: "gunpowder", price: 1800, qty: 5 },
      { id: "l3", mid: "primer", price: 4000, qty: 5 },
    ],
  });
  const before = env.vault.tokens;
  const r = env.craftEquipOneClick(DEF);
  check(r.ok, `合成成功：${r.item?.name}`);
  check(r.bought === 3, `买入 ${r.bought} 件材料`);
  check(env.vault.tokens === before - r.spent, `扣款正确（-${r.spent.toLocaleString()}）`);
  check(env.loadout.equipStash.length === 1, "产出 1 件装备");
  // 材料应被合成消耗掉（不再残留）
  const left = env.loadout.collectStash.filter((c) => c.materialId).length;
  check(left === 0, `合成后材料已消耗（残留 ${left}）`);
  // 市场库存应减少
  const qtyLeft = env.marketState.listings.reduce((s, l) => s + l.qty, 0);
  check(qtyLeft === 15 - 3, `市场库存 15 → ${qtyLeft}`);
}

// ── 7. 不买自己的挂牌 ──
console.log("\n▌ 7. 不购买本机（自己）的挂牌");
{
  const env = makeEnv({
    have: [],
    listings: [
      { id: "mine", mid: "alloy_plate", price: 500, qty: 5, player: true, sellerId: "local" },
      { id: "sys", mid: "alloy_plate", price: 2000, qty: 5 },
      { id: "l2", mid: "gunpowder", price: 1800, qty: 5 },
      { id: "l3", mid: "primer", price: 4000, qty: 5 },
    ],
  });
  const q = env.quoteCraftFromMarket(DEF);
  const alloy = q.plan.find((p) => p.id === "alloy_plate");
  check(alloy.cost === 2000, `跳过自己的低价挂牌，按系统价 2000 计价（实际 ${alloy.cost}）`);
  const r = env.craftEquipOneClick(DEF);
  check(r.ok, "仍然合成成功");
  const mine = env.marketState.listings.find((l) => l.id === "mine");
  check(mine.qty === 5, "自己的挂牌未被买入（qty 仍为 5）");
}

// ── 8. 不凭空生成材料 ──
console.log("\n▌ 8. 守恒：不凭空生成材料");
{
  const env = makeEnv({
    have: [],
    listings: [
      { id: "l1", mid: "alloy_plate", price: 2000, qty: 5 },
      { id: "l2", mid: "gunpowder", price: 1800, qty: 5 },
      { id: "l3", mid: "primer", price: 4000, qty: 5 },
    ],
  });
  // 金币 → 材料 → 装备，全程材料数量不增加
  const r = env.craftEquipOneClick(DEF);
  check(r.ok, "合成成功");
  const matCount = env.loadout.collectStash.filter((c) => c.materialId).length;
  check(matCount === 0, `仓库无多余材料（${matCount}）`);
  check(env.loadout.equipStash.length === 1, "净产出恰为 1 件装备");
}

console.log("\n" + "─".repeat(76));
console.log(`  通过 ${pass} · 失败 ${fail}`);
console.log("─".repeat(76));
process.exit(fail ? 1 : 0);
