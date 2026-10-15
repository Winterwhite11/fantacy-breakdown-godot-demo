#!/usr/bin/env node
/**
 * market-test.mjs —— 自由市场机制测试
 *
 * 校验用户的设计意图：「玩家可操控的自由市场，但通过系统补货维持基本平衡」。
 *
 * 断言：
 *   1. 弹性补货：只补到基准库存即停，不会无限灌货
 *   2. 让位于玩家：玩家挂牌越多，系统补货越少（玩家能真正掌控供给）
 *   3. 硬下限：系统库存极低时无视抑制必须补，避免永久断供
 *   4. 部分买入：可分批扫货（控盘的基础）
 *   5. 供给状态：系统断供时标记 playerCanPriceUp
 *   6. 手续费：成交扣 5%，玩家挂牌被买走时卖方得 95%
 *   7. 无套利：卖价恒 < 买价
 *
 * 用法：node tools/market-test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HD = path.resolve(__dirname, "..", "html-demo");
const JS = path.join(HD, "js");

// ── 带内存 localStorage 的 DOM 桩 ──
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
  return { document, localStorage, store,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    location: { href: "" } };
}

const win = makeWin();
const load = (f) => new Function("window", "document", "localStorage",
  fs.readFileSync(path.join(JS, f), "utf8"))(win, win.document, win.localStorage);
for (const f of ["card-data.js", "economy.js", "card-prices.js", "summon-elements.js",
                 "cards.js", "content-tables.js", "loadout.js", "loot.js", "save.js", "market.js"]) load(f);

const M = win.FBMarket;
let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const check = (c, m) => (c ? ok(m) : bad(m));

/** 全新市场状态（绕过 localStorage 残留） */
function freshState() {
  win.localStorage.removeItem(M.MARKET_KEY);
  return M.getState().state;
}
/** 库存注入一个玩家挂牌 */
function addPlayerListing(state, zone, catalogId, name, price, qty) {
  const l = {
    id: `ply_${Math.random().toString(36).slice(2, 9)}`,
    zone, source: "player", sellerId: "local", catalogId, name, price, qty,
    payload: { kind: "card", cardId: catalogId },
  };
  state.listings.push(l);
  return l;
}
const emptyVault = () => ({ tokens: 999999 });
const emptyLoadout = () => ({ cardStash: {}, equipStash: [], collectStash: [] });

console.log("═".repeat(76));
console.log("  自由市场机制测试");
console.log("═".repeat(76));

// ── 1. 弹性补货：只补到基准即停 ──
console.log("\n▌ 1. 弹性补货（只补到基准库存，不无限灌货）");
{
  const st = freshState();
  const sys = st.listings.filter((l) => l.source === "system");
  check(sys.length > 0, `系统货架 ${sys.length} 条`);
  // 把某条打到 0，推进一个补货节拍
  const target = sys[0];
  target.qty = 0;
  const r1 = M.applyElasticRestock(st, { now: Date.now() + 10 * 60000 });
  check(r1.added > 0, `跌破基准后补货 ${r1.added} 件（单次上限 ${M.SYS_RESTOCK_PER_TICK}）`);
  check(target.qty <= M.SYS_BASE_QTY, `补后库存 ${target.qty} ≤ 基准 ${M.SYS_BASE_QTY}`);
  // 未跌破基准不应补
  target.qty = M.SYS_BASE_QTY;
  const r2 = M.applyElasticRestock(st, { now: Date.now() + 20 * 60000 });
  const sysAfter = st.listings.find((l) => l.id === target.id);
  check(sysAfter.qty === M.SYS_BASE_QTY, `库存已达基准 → 不再补（仍为 ${sysAfter.qty}）`);
}

// ── 2. 让位于玩家 ──
console.log("\n▌ 2. 让位于玩家（玩家挂牌越多，系统补货越少）");
{
  // A：无玩家挂牌
  const a = freshState();
  const aSys = a.listings.filter((l) => l.source === "system")[0];
  aSys.qty = 0;
  M.applyElasticRestock(a, { now: Date.now() + 10 * 60000 });
  const aQty = a.listings.find((l) => l.id === aSys.id).qty;

  // B：同一 catalogId 有玩家挂牌
  const b = freshState();
  const bSys = b.listings.filter((l) => l.source === "system")[0];
  bSys.qty = 0;
  addPlayerListing(b, bSys.zone, bSys.catalogId, "玩家货", 999, 10);
  M.applyElasticRestock(b, { now: Date.now() + 10 * 60000 });
  const bQty = b.listings.find((l) => l.id === bSys.id).qty;

  check(bQty < aQty,
    `同一商品：无玩家时补到 ${aQty}，有玩家挂牌 10 件时只补到 ${bQty}（让位于玩家）`);
}

// ── 3. 硬下限：避免永久断供 ──
console.log("\n▌ 3. 硬下限（系统库存极低时必须补）");
{
  const st = freshState();
  const sys = st.listings.filter((l) => l.source === "system")[0];
  sys.qty = 0;
  // 大量玩家挂牌试图完全掐断系统供给
  addPlayerListing(st, sys.zone, sys.catalogId, "玩家货", 999, 50);
  M.applyElasticRestock(st, { now: Date.now() + 10 * 60000 });
  const after = st.listings.find((l) => l.id === sys.id);
  check(after.qty >= M.SYS_HARD_FLOOR,
    `玩家挂牌 50 件仍保证系统补到硬下限：${after.qty} ≥ ${M.SYS_HARD_FLOOR}`);
  check(after.qty <= M.SYS_BASE_QTY, `且不超过基准 ${M.SYS_BASE_QTY}（不会灌爆市场）`);
}

// ── 4. 部分买入（控盘基础）──
console.log("\n▌ 4. 部分买入（可分批扫货，是控盘的前提）");
{
  const st = freshState();
  const sys = st.listings.filter((l) => l.source === "system")[0];
  sys.qty = 10;
  const vault = emptyVault();
  const before = vault.tokens;
  const unit = sys.price;
  const r = M.buyListing(st, sys.id, vault, emptyLoadout(), 4);
  check(r.ok && r.bought === 4, `买入 4 件成功（bought=${r.bought}）`);
  check(sys.qty === 6, `库存 10 → ${sys.qty}`);
  check(before - vault.tokens === unit * 4, `扣款 ${before - vault.tokens} = 单价 ${unit} × 4`);
  // 超量请求应被夹到库存上限
  const r2 = M.buyListing(st, sys.id, emptyVault(), emptyLoadout(), 99);
  check(r2.ok && r2.bought === 6, `请求 99 件被夹到剩余库存（bought=${r2.bought}）`);
}

// ── 5. 供给状态 ──
console.log("\n▌ 5. 供给状态（系统断供 → 玩家可高价挂出）");
{
  const st = freshState();
  const sys = st.listings.filter((l) => l.source === "system")[0];
  sys.qty = 5;
  let sup = M.supplyState(st, sys.zone, sys.catalogId);
  check(sup.systemQty === 5 && !sup.playerCanPriceUp, `系统有货(${sup.systemQty}) → 不可高价`);
  sys.qty = 0;
  sup = M.supplyState(st, sys.zone, sys.catalogId);
  check(sup.playerCanPriceUp === true, `系统断供 → playerCanPriceUp=${sup.playerCanPriceUp}`);
  addPlayerListing(st, sys.zone, sys.catalogId, "玩家货", 999, M.SYS_BASE_QTY);
  sup = M.supplyState(st, sys.zone, sys.catalogId);
  check(sup.crowded === true, `玩家供给 ${sup.playerQty} 件 ≥ 基准 → crowded=${sup.crowded}`);
}

// ── 6. 手续费与卖方收益 ──
console.log("\n▌ 6. 手续费 5% 与卖方收益");
{
  const price = 200;
  check(M.feeOf(price) === 10, `手续费 ${M.feeOf(price)}（200 的 5%）`);
  check(M.sellerProceeds(price) === 190, `卖方净得 ${M.sellerProceeds(price)}（95%）`);
  // 低价商品必须至少收 1，否则卖价 = 买价（市场零摩擦）
  check(M.feeOf(12) === 1, `12 代币的卡手续费 ${M.feeOf(12)}（floor(0.6)=0 会零摩擦，故保底 1）`);
  check(M.sellerProceeds(12) === 11, `12 代币卖出净得 ${M.sellerProceeds(12)}`);

  // 自购（控盘手段）：净扣手续费，不返还卖方款 → 无法刷单
  const st = freshState();
  const pl = addPlayerListing(st, "cards", "fire", "火", 200, 3);
  const vault = { tokens: 1000 };
  const r = M.buyListing(st, pl.id, vault, emptyLoadout(), 1);
  check(r.ok && r.self === true, `自购成功且标记 self=${r.self}`);
  check(vault.tokens === 990, `自购净扣手续费：1000 → ${vault.tokens}（扣 10 = 200 的 5%）`);
  check(pl.qty === 2, `自购后挂牌库存 ${pl.qty}`);

  // 他人买走（单机模拟）：卖方得 95%
  const st2 = freshState();
  const pl2 = addPlayerListing(st2, "cards", "fire", "火", 200, 1);
  pl2.sellerId = "other";   // 视作其他玩家的挂牌
  const v2 = { tokens: 1000 };
  const r2 = M.buyListing(st2, pl2.id, v2, emptyLoadout(), 1);
  check(r2.ok && r2.self === false, `购买他人挂牌 self=${r2.self}`);
  check(v2.tokens === 990, `买他人挂牌：付 200 收 190 → ${v2.tokens}`);
}

// ── 6b. 补货健康：开局有货 / 目录不膨胀 / 饿死防护 / 空档自愈 ──
console.log("\n▌ 6b. 补货健康（2026-10-13 修「市场为空」）");
{
  // 全新存档开局即有货
  const st = freshState();
  const sys = st.listings.filter((l) => l.source === "system");
  const withStock = sys.filter((l) => l.qty > 0).length;
  check(withStock === sys.length, `全新存档全部有货（${withStock}/${sys.length}）`);

  // 连续读取不膨胀目录（曾经因收集品用随机 uid 作 catalogId 而无限增长）
  const n1 = st.listings.length;
  for (let i = 0; i < 8; i++) M.getState();
  const n2 = M.getState().state.listings.length;
  check(n1 === n2, `目录稳定：${n1} → 8 次读取后 ${n2}`);

  // 饿死防护：清空后推进节拍，必须**全部**条目都能恢复
  // （曾因 SYS_ITEM_CAP_PER_TICK 从列表头部起算，尾部商品永久为 0）
  const st2 = freshState();
  for (const l of st2.listings) if (l.source === "system") l.qty = 0;
  const base = Date.now() + 10 * 60000;
  for (let t = 1; t <= 3; t++) {
    M.applyElasticRestock(st2, { now: base + t * (M.SYS_RESTOCK_INTERVAL_MS + 1000) });
  }
  const sys2 = st2.listings.filter((l) => l.source === "system");
  const revived = sys2.filter((l) => l.qty > 0).length;
  check(revived === sys2.length, `清空后 3 个节拍内全部恢复（${revived}/${sys2.length}），无饿死条目`);

  // 空数组存档自愈（listings: [] 曾因"是合法数组"而无法自愈）
  win.localStorage.setItem(M.MARKET_KEY, JSON.stringify({
    version: M.VERSION, listings: [], priceHistory: {}, lastRestockAt: Date.now(),
  }));
  const healed = M.getState().state;
  check(healed.listings.length > 0, `空数组存档自愈为 ${healed.listings.length} 条`);

  // 旧版本存档（v2 含 lastRestockDayKey）自愈
  win.localStorage.setItem(M.MARKET_KEY, JSON.stringify({
    version: 2, priceHistory: {}, lastRestockDayKey: "2026-10-01",
    listings: [{ id: "old1", zone: "cards", source: "system", catalogId: "fire",
                 name: "火", price: 12, qty: 0, payload: { kind: "card", cardId: "fire" } }],
  }));
  const migrated = M.getState().state;
  check(migrated.listings.length > 1,
    `旧档补入缺失商品 → ${migrated.listings.length} 条`);
  check(migrated.lastRestockAt != null && migrated.lastRestockDayKey === undefined,
    "已迁移到 lastRestockAt 时间戳");
}

// ── 6c. 间隔节流：节拍未到不重复补 ──
console.log("\n▌ 6c. 补货间隔节流");
{
  const st = freshState();
  for (const l of st.listings) if (l.source === "system") l.qty = 0;
  const now = Date.now() + 10 * 60000;
  const r1 = M.applyElasticRestock(st, { now });
  const after1 = st.listings.reduce((a, b) => a + (b.qty || 0), 0);
  const r2 = M.applyElasticRestock(st, { now: now + 1000 });   // 仅过 1 秒
  const after2 = st.listings.reduce((a, b) => a + (b.qty || 0), 0);
  check(r1.added > 0, `首次补货 ${r1.added} 件`);
  check(r2.restocked === false && r2.added === 0, `间隔内不补（+${r2.added}）`);
  check(after1 === after2, `总库存未变：${after1} → ${after2}`);
  check(r1.nextAt > now, "返回下次补货时间（供 UI 展示）");
}

// ── 6d. resetListings 立即满仓（测试便利入口） ──
console.log("\n▌ 6d. resetListings（测试用立刻满仓）");
{
  freshState();
  const st = M.getState().state;
  for (const l of st.listings) if (l.source === "system") l.qty = 0;
  M.saveState(st);
  const fresh = M.resetListings(true);
  const sys = fresh.listings.filter((l) => l.source === "system");
  check(sys.every((l) => l.qty > 0), `resetListings 后全部有货（${sys.length} 条）`);
}

// ── 7. 无套利 ──
console.log("\n▌ 7. 无无风险套利（卖价恒 < 买价）");
{
  const st = freshState();
  const sys = st.listings.filter((l) => l.source === "system");
  let arb = 0;
  for (const l of sys) {
    if (M.sellerProceeds(l.price) >= l.price) arb++;
  }
  check(arb === 0, `系统货架 ${sys.length} 条，卖价 ≥ 买价的 ${arb} 条`);
}

console.log("\n" + "─".repeat(76));
console.log(`  通过 ${pass} · 失败 ${fail}`);
console.log("─".repeat(76));
process.exit(fail ? 1 : 0);
