#!/usr/bin/env node
/**
 * art-test.mjs —— 像素美术测试（怪物立绘 + 异星地表）
 *
 * 2026-10-14 用户要求：
 *   「用更精细的像素复杂度完成怪物立绘的初稿」
 *   「地图更有在异星表面的感觉，用像素绘制一些山地，植物等」
 *
 * 覆盖：
 *   1. 怪物立绘位图合法（尺寸一致、只用已定义字符）+ 名称映射全覆盖
 *   2. 立绘体积可控 + 位图确实"有复杂度"（不是几个像素的糊图）
 *   3. 地表装饰只生成**有限变体**（关键性能约束：不能每格内联一个 SVG）
 *   4. 相邻格取到的变体不同（否则整张地图看起来是贴图阵列）
 *   5. CSS 分层不与迷雾噪点冲突（::after 的所有权）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const HD = path.join(REPO, "html-demo");
const JS = path.join(HD, "js");

function makeWin() {
  const mk = () => new Proxy(
    { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
      children: [], appendChild() {}, removeChild() {}, setAttribute() {}, getAttribute() { return null },
      querySelector() { return null }, addEventListener() {}, removeEventListener() {} },
    { get(t, p) { if (p in t) return t[p]; return undefined; }, set(t, p, v) { t[p] = v; return true; } });
  const doc = { head: mk(), documentElement: mk(), body: mk(), createElement: mk, querySelector: () => null };
  return { document: doc, addEventListener() {}, removeEventListener() {} };
}
const win = makeWin();
const load = (f) => new Function("window", "document", fs.readFileSync(path.join(JS, f), "utf8"))(win, win.document);
load("monsters.js");
load("terrain-art.js");
const M = win.FBMonsters, T = win.FBTerrainArt;

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const check = (c, m) => (c ? ok(m) : bad(m));

console.log("═".repeat(78));
console.log("  像素美术测试（怪物立绘 · 异星地表）");
console.log("═".repeat(78));

console.log("\n▌ 1. 怪物立绘位图合法");
{
  const ids = Object.keys(M.BITMAPS);
  check(ids.length >= 13, `立绘数量 ${ids.length} ≥ 13（覆盖全部遭遇单位）`);
  const badRows = [], badChars = [];
  for (const [id, rows] of Object.entries(M.BITMAPS)) {
    if (rows.length !== M.GRID || rows.some((r) => r.length !== M.GRID)) badRows.push(id);
    const undef = [...new Set(rows.join(""))].filter((c) => c !== "." && !M.PAL[c]);
    if (undef.length) badChars.push(`${id}(${undef.join("")})`);
  }
  check(badRows.length === 0, `所有位图均为 ${M.GRID}×${M.GRID}${badRows.length ? "：" + badRows.join(",") : ""}`);
  check(badChars.length === 0, `未出现未定义字符${badChars.length ? "：" + badChars.join(",") : ""}`);
}

console.log("\n▌ 2. 名称映射覆盖全部遭遇单位");
{
  // 读**真实**遭遇数据取单位名（不要用正则扫源码 —— 那会把遭遇名也当单位名）
  const encWin = makeWin();
  new Function("window", fs.readFileSync(path.join(JS, "encounters.js"), "utf8"))(encWin);
  const E = encWin.FBEncounters;
  const all = [...(E.NORMAL_ENCOUNTERS || []), ...(E.HARD_ENCOUNTERS || [])];
  const unitNames = [...new Set(all.flatMap((e) => (e.units || []).map((u) => u.name)))];
  const unmapped = unitNames.filter((n) => !M.artFor(n));
  check(unitNames.length >= 13, `遭遇表共 ${unitNames.length} 种单位`);
  check(unmapped.length === 0,
    `全部单位都有立绘${unmapped.length ? "，缺：" + unmapped.join("、") : `（${unitNames.length} 个全映射）`}`);
  // 遇到未登记的新单位也不能崩
  check(M.classFor("不存在的怪物") === `${M.CLS} ${M.CLS}-fallback`, "未登记单位回退到首字徽记");
  check(M.artFor(null) === null && M.artFor("") === null, "空名称返回 null（不抛错）");
}

console.log("\n▌ 3. 立绘确实有像素复杂度与体积控制");
{
  const stats = Object.entries(M.BITMAPS).map(([id, rows]) => {
    const filled = rows.join("").split("").filter((c) => c !== ".").length;
    const colors = new Set(rows.join("").split("").filter((c) => c !== ".")).size;
    const bytes = M.bitmapToSvg(rows).length;
    return { id, filled, colors, bytes };
  });
  const minFilled = Math.min(...stats.map((s) => s.filled));
  const minColors = Math.min(...stats.map((s) => s.colors));
  const maxBytes = Math.max(...stats.map((s) => s.bytes));
  check(minFilled >= 40, `最简立绘也有 ${minFilled} 个实心像素（不是糊图）`);
  check(minColors >= 3, `每个立绘至少 ${minColors} 种颜色（有体积层次，不是单色剪影）`);
  check(maxBytes <= 8000, `单张立绘 SVG ≤8KB（最大 ${maxBytes} 字节）`);
  check(true, `平均 ${Math.round(stats.reduce((s, x) => s + x.filled, 0) / stats.length)} 实心像素 / ${(stats.reduce((s, x) => s + x.colors, 0) / stats.length).toFixed(1)} 色`);
}

console.log("\n▌ 4. 地表装饰：有限变体（关键性能约束）");
{
  const rules = T.applyTo(win.document);
  check(rules === Object.keys(T.KIND).length * T.VARIANTS,
    `只注入 ${rules} 条变体规则（${Object.keys(T.KIND).length} 地形 × ${T.VARIANTS} 变体）`);
  // 关键：不能随地图尺寸增长。15×15 地图若每格内联 SVG 会到 500KB+
  check(rules <= 40, `规则数 ${rules} ≤ 40 —— 与地图格数无关（否则 15×15 会内联 225 张 SVG）`);
  check(T.VARIANTS >= 5, `变体数 ${T.VARIANTS} ≥5（减少可见重复）`);
}

console.log("\n▌ 5. 相邻格变体不同（否则像贴图阵列）");
{
  // 取 15×15 地图（与真实地图同尺寸）统计相邻同变体比例
  const N = 15, V = T.VARIANTS;
  let same = 0, total = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = T.variantIndex(x, y);
      if (x + 1 < N) { total++; if (T.variantIndex(x + 1, y) === i) same++; }
      if (y + 1 < N) { total++; if (T.variantIndex(x, y + 1) === i) same++; }
    }
  }
  const ratio = same / total;
  check(ratio < 0.35, `相邻同变体比例 ${(ratio * 100).toFixed(0)}% < 35%（随机分布）`);
  // 边界安全
  check(typeof T.classFor("不存在地形", 0, 0) === "string", "未登记地形回退到 plain（不抛错）");
}

console.log("\n▌ 6. CSS 分层不与迷雾噪点冲突");
{
  const css = fs.readFileSync(path.join(HD, "css", "style.css"), "utf8");
  // ::after 的所有权：第二层必须限定 :not(.fog-unknown)，否则会覆盖探测器噪点
  check(/:not\(\.fog-unknown\)::after/.test(css),
    "地表第二层限定 `:not(.fog-unknown)::after`（保留迷雾噪点）");
  check(/\.cell\.fog-unknown::before\s*\{\s*background-image:\s*none/.test(css),
    "迷雾格不显示地表装饰（不泄露地形）");
  check(/\.cell::before/.test(css) && /--fb-terrain/.test(css),
    "第一层装饰走 ::before + --fb-terrain 变量");
  check(/image-rendering:\s*pixelated/.test(css), "装饰与立绘都启用 pixelated（硬边像素感）");
}

console.log("\n" + "─".repeat(78));
console.log(`  通过 ${pass} · 失败 ${fail}`);
console.log("─".repeat(78));
process.exit(fail ? 1 : 0);
