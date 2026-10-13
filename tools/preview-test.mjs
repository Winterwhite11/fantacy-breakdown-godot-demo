#!/usr/bin/env node
/**
 * preview-test.mjs —— 悬浮放大预览测试（仿杀戮尖塔）
 *
 * 需求：鼠标在卡牌/战备/收集品上停留 1 秒 → 弹出放大卡片展示效果。
 *
 * 断言：
 *   1. 延迟常量为 1000ms
 *   2. 卡牌 / 战备 / 收集品 / 材料 四类都能解析出预览内容
 *   3. 预览内容含名称、效果描述、关键数值
 *   4. 渲染出的 HTML 结构完整（头/描述/数值行）
 *   5. 视口避让：右侧越界时翻到左侧；上下夹紧在视口内
 *   6. 未知 id 不崩、返回 null（由调用方跳过）
 *
 * 用法：node tools/preview-test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HD = path.resolve(__dirname, "..", "html-demo");
const JS = path.join(HD, "js");

// ── 可测量的 DOM 桩：createElement 返回带 getBoundingClientRect 的节点 ──
function makeWin() {
  const store = {};
  let rectW = 300, rectH = 400;      // 可调，用于测试避让
  const mkEl = (tag) => {
    const el = {
      tagName: (tag || "div").toUpperCase(),
      style: {}, dataset: {}, children: [],
      innerHTML: "", textContent: "", hidden: false, className: "",
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
      appendChild(c) { el.children.push(c); return c; },
      removeChild() {}, remove() {}, setAttribute() {}, getAttribute() { return null },
      addEventListener() {}, removeEventListener() {},
      querySelector() { return null }, querySelectorAll() { return []; },
      closest() { return null }, contains() { return false },
      getBoundingClientRect() { return { width: rectW, height: rectH, left: 0, top: 0, right: rectW, bottom: rectH }; },
    };
    return el;
  };
  const body = mkEl("body");
  body.contains = () => true;
  const listeners = {};
  const document = {
    readyState: "complete", body, head: mkEl("head"), documentElement: mkEl("html"),
    createElement: mkEl, createTextNode: () => ({}),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
    removeEventListener() {},
    _listeners: listeners,
  };
  const win = {
    document, localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
    },
    innerWidth: 1280, innerHeight: 800,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    location: { href: "" },
    Element: class Element {},
    setTimeout, clearTimeout,
    _setRect: (w, h) => { rectW = w; rectH = h; },
  };
  return win;
}

const win = makeWin();
const load = (f) => new Function("window", "document", "localStorage",
  fs.readFileSync(path.join(JS, f), "utf8"))(win, win.document, win.localStorage);
for (const f of ["card-data.js", "pieces.js", "economy.js", "card-prices.js",
                 "summon-elements.js", "cards.js", "content-tables.js",
                 "loadout.js", "loot.js"]) load(f);
load("preview.js");

const PV = win.FBPreview;
let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const check = (c, m) => (c ? ok(m) : bad(m));

console.log("═".repeat(76));
console.log("  悬浮放大预览测试");
console.log("═".repeat(76));

// ── 1. 延迟设置 ──
console.log("\n▌ 1. 停留时长");
check(PV?.DELAY_MS === 1000, `延迟 = ${PV?.DELAY_MS}ms（需求：1 秒）`);

// ── 2. 四类内容解析 ──
console.log("\n▌ 2. 四类物品都能解析出预览内容");
const fakeEl = (pv, id, json) => ({ dataset: { pv, pvId: id, pvJson: json } });

{
  const el = fakeEl("card", "fire");
  const info = PV._resolve(el);
  check(!!info, `卡牌 fire → ${info?.name}`);
  check(info?.name === "火", `名称正确：${info?.name}`);
  check(!!info?.desc, `含效果描述：${(info?.desc || "").slice(0, 24)}…`);
  const keys = (info?.rows || []).map((r) => r[0]);
  check(keys.some((k) => /咏唱|窗口价值|市场价/.test(k)), `含数值行：${keys.join("/")}`);
}
{
  const el = fakeEl("card", "steel");
  const info = PV._resolve(el);
  check(!!info && info.name === "钢铁", `字词 steel → ${info?.name}`);
  check((info?.rows || []).some((r) => r[0] === "市场价"), "字词显示市场价");
}
{
  const el = fakeEl("equip", "shotgun_heavy");
  const info = PV._resolve(el);
  check(!!info, `战备 shotgun_heavy → ${info?.name}`);
  const keys = (info?.rows || []).map((r) => r[0]);
  check(keys.includes("触发间隔") && keys.includes("单次伤害"),
    `武器显示触发间隔/单次伤害：${keys.join("/")}`);
  check(keys.includes("价格"), "战备显示价格");
  check(!!info?.icon, `带像素图标：${info?.icon}`);
  check(!!info?.recipe, `带合成配方：${info?.recipe}`);
}
{
  const item = win.FBLoot.makeCollectible("blue");
  const el = fakeEl("collect", null, JSON.stringify({
    name: item.name, rarity: item.rarity, rarityLabel: item.rarityLabel,
    value: item.value, desc: item.desc,
  }));
  const info = PV._resolve(el);
  check(!!info && info.name === item.name, `收集品 → ${info?.name}`);
  check((info?.rows || []).some((r) => r[0] === "价值"), "收集品显示价值");
}
{
  const mat = win.FBLoot.makeMaterial("alloy_plate");
  const el = fakeEl("material", null, JSON.stringify({
    name: mat.name, rarity: mat.rarity, rarityLabel: mat.rarityLabel,
    value: mat.value, desc: mat.desc, isMaterial: true, materialId: mat.materialId,
  }));
  const info = PV._resolve(el);
  check(!!info && info.name === mat.name, `材料 → ${info?.name}`);
  check(info?.sub === "战备合成材料", `材料副标题正确：${info?.sub}`);
  check(!!info?.icon, `材料带图标：${info?.icon}`);
}

// ── 3. 未知 id 不崩 ──
console.log("\n▌ 3. 未知 id 的健壮性");
{
  check(PV._resolve(fakeEl("card", "definitely_not_a_card")) === null, "未知卡牌 id → null（调用方会跳过）");
  check(PV._resolve(fakeEl("equip", "no_such_equip")) === null, "未知战备 id → null");
  check(PV._resolve(fakeEl("collect", null, "not json")) === null, "非法 JSON → null（不抛异常）");
  check(PV._resolve({ dataset: { pv: "unknown" } }) === null, "未知类型 → null");
}

// ── 4. 渲染结构 ──
console.log("\n▌ 4. 渲染出的 HTML 结构");
{
  const info = PV._resolve(fakeEl("equip", "armor_plate"));
  PV._render(info);
  const panel = win.document.body.children.find((c) => c.className?.includes("pv-panel"));
  check(!!panel, "已插入 .pv-panel 到 body");
  const html = panel?.innerHTML || "";
  check(html.includes("pv-head"), "含头部区");
  check(html.includes("pv-name"), "含名称");
  check(html.includes("pv-desc"), "含效果描述");
  check(html.includes("pv-rows"), "含数值行");
  check(html.includes("pv-icon") || html.includes("pv-glyph"), "含图标或首字徽记");
  check(panel?.hidden === false, "面板可见（hidden=false）");
}

// ── 5. 视口避让（真正验证「越界翻左」，而非只验证夹紧）──
// 注意：place() 依赖内部光标状态，若不注入坐标则面板永远被夹到左边距，
// 那样的断言是**假通过**。故 place 接受可注入的 at={x,y}。
console.log("\n▌ 5. 视口避让（右侧越界翻左、上下夹紧）");
{
  const panel = win.document.body.children.find((c) => c.className?.includes("pv-panel"));
  const info = PV._resolve(fakeEl("card", "fire"));
  PV._render(info);                    // 确保面板存在且有内容
  const GAP = 16, MARGIN = 10;

  // A. 光标偏左、视口够宽 → 面板应在光标右侧
  win.innerWidth = 1280; win.innerHeight = 800;
  win._setRect(300, 400);
  PV.place(panel, { x: 100, y: 400 });
  const leftA = parseFloat(panel.style.left);
  check(leftA === 100 + GAP, `光标在左 → 面板居右（left=${leftA} = 100+${GAP}）`);

  // B. 光标偏右、右侧放不下 → 应翻到光标左侧
  PV.place(panel, { x: 1200, y: 400 });
  const leftB = parseFloat(panel.style.left);
  check(leftB === 1200 - GAP - 300,
    `光标在右（1200，视口 1280）→ 翻到左侧（left=${leftB} = 1200-${GAP}-300）`);
  check(leftB < 1200, "面板确实在光标左侧");

  // C. 垂直：面板高于视口 → top 夹到边距
  win._setRect(300, 2000);
  PV.place(panel, { x: 100, y: 400 });
  check(parseFloat(panel.style.top) === MARGIN,
    `超高面板 top=${panel.style.top} 夹到边距 ${MARGIN}`);

  // D. 垂直：面板居中于光标，且不出界
  win._setRect(300, 200);
  PV.place(panel, { x: 100, y: 400 });
  const topD = parseFloat(panel.style.top);
  check(topD === 400 - 100, `常规高度下 top=${topD} = 光标 y - 高度/2`);

  // E. 极窄视口：夹紧到不小于边距
  win.innerWidth = 200;
  PV.place(panel, { x: 190, y: 100 });
  check(parseFloat(panel.style.left) >= MARGIN,
    `极窄视口（200）下 left=${panel.style.left} 仍 ≥ ${MARGIN}`);
  win.innerWidth = 1280;
}

// ── 6. 隐藏 ──
console.log("\n▌ 6. 收起");
{
  const panel = win.document.body.children.find((c) => c.className?.includes("pv-panel"));
  PV.hide();
  check(panel?.hidden === true, "hide() 后面板隐藏");
}

// ── 7. tagPreviewables 覆盖（哪些界面真的能触发预览）──
// 只看渲染逻辑不够：元素必须被打上 data-pv 才能被委托逻辑发现。
// 这里从 app.js 抽出 tagPreviewables 单独执行，验证各类卡片都被覆盖。
console.log("\n▌ 7. 各类卡片元素都被打上预览标识");
{
  const appSrc = fs.readFileSync(path.join(JS, "app.js"), "utf8");
  const m = appSrc.match(/^function tagPreviewables\(root = document\) \{[\s\S]*?\n\}/m);
  check(!!m, "已从 app.js 抽出 tagPreviewables");
  if (m) {
    const L = win.FBLoadout, Lo = win.FBLoot;
    const mk = (cls) => ({
      className: cls || "", dataset: {}, style: {}, children: [],
      innerHTML: "", textContent: "", hidden: false,
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
      appendChild(c) { this.children.push(c); return c; },
      setAttribute() {}, getAttribute() { return null },
      addEventListener() {}, removeEventListener() {},
      querySelector() { return null }, querySelectorAll() { return []; },
      closest() { return null }, contains() { return false },
      getBoundingClientRect() { return { width: 300, height: 400, left: 0, top: 0, right: 300, bottom: 400 }; },
    });
    const elMini = mk("prep-mini-card"); elMini.dataset.cardId = "fire";
    const elCraftE = mk("craft-card");
    elCraftE.querySelector = (s) => (s === ".craft-btn" ? { dataset: { def: "rifle_rapid" } } : null);
    const elCraftC = mk("craft-card");
    elCraftC.querySelector = (s) => (s === ".craft-btn" ? { dataset: { card: "steam" } } : null);
    const elStash = mk("stash-item"); elStash.dataset.uid = "u1";
    const elSlot = mk("equip-slot filled"); elSlot.dataset.slot = "weapon";
    const elCol = mk("collect-stash-item"); elCol.dataset.uid = "c1";
    const elMat = mk("collect-stash-item"); elMat.dataset.uid = "m1";
    const elMkCard = mk("market-row"); elMkCard.dataset.open = "L1";
    const elMkEquip = mk("market-row"); elMkEquip.dataset.open = "L2";
    const elMkCol = mk("market-row"); elMkCol.dataset.open = "L3";

    const registry = {
      ".prep-mini-card": [elMini],
      ".craft-card": [elCraftE, elCraftC],
      ".stash-item": [elStash],
      ".equip-slot.filled": [elSlot],
      ".collect-stash-item": [elCol, elMat],
      ".market-row": [elMkCard, elMkEquip, elMkCol],
    };
    const loadout = {
      equipStash: [{ uid: "u1", defId: "shotgun_heavy", name: "重铳" }],
      equipped: { weapon: { defId: "pistol_simple" } },
      collectStash: [
        { uid: "c1", name: "回响骨片", rarity: "blue", rarityLabel: "稀有", value: 40, desc: "x" },
        { uid: "m1", name: "合金板", isMaterial: true, materialId: "alloy_plate", value: 22, rarity: "green" },
      ],
    };
    const marketState = { listings: [
      { id: "L1", zone: "cards", payload: { cardId: "steel" } },
      { id: "L2", zone: "gear", payload: { defId: "armor_plate" } },
      { id: "L3", zone: "collect", payload: { item: { name: "静电场芯", rarity: "blue", value: 40 } } },
    ] };
    const root = { querySelectorAll: (sel) => registry[sel] || [] };
    const runner = new Function("document", "loadout", "marketState",
      m[0] + "\nreturn tagPreviewables;")(win.document, loadout, marketState);
    runner(root);

    const cases = [
      [elMini, "card", "fire", "卡牌仓库"],
      [elCraftE, "equip", "rifle_rapid", "合成台·战备"],
      [elCraftC, "card", "steam", "合成台·卡牌"],
      [elStash, "equip", "shotgun_heavy", "装备仓库"],
      [elSlot, "equip", "pistol_simple", "已装备槽位"],
      [elCol, "collect", null, "收集品仓库"],
      [elMat, "material", null, "材料仓库"],
      [elMkCard, "card", "steel", "市场·卡牌"],
      [elMkEquip, "equip", "armor_plate", "市场·战备"],
      [elMkCol, "collect", null, "市场·收集品"],
    ];
    for (const [el, kind, id, label] of cases) {
      const okKind = el.dataset.pv === kind;
      const okId = id == null || el.dataset.pvId === id;
      check(okKind && okId, `${label} → ${el.dataset.pv}${el.dataset.pvId ? "/" + el.dataset.pvId : ""}`);
    }
    // 幂等
    const snap = JSON.stringify([elMini.dataset, elStash.dataset, elCol.dataset]);
    runner(root); runner(root);
    check(JSON.stringify([elMini.dataset, elStash.dataset, elCol.dataset]) === snap, "重复调用结果不变（幂等）");
  }
}

console.log("\n" + "─".repeat(76));
console.log(`  通过 ${pass} · 失败 ${fail}`);
console.log("─".repeat(76));
process.exit(fail ? 1 : 0);
