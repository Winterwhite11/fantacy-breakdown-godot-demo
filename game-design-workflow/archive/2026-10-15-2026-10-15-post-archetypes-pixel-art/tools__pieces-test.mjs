#!/usr/bin/env node
/**
 * pieces-test.mjs —— 像素棋子测试
 *
 * 校验用户需求：「玩家标记设计成像素国际象棋的形式，每个角色代表不同的棋子」。
 *
 * 断言：
 *   1. 每个角色都有专属棋子（4 角色 ↔ 4 棋子，无重复）
 *   2. 位图格式合法（8×8、仅含 #/.、非空）
 *   3. 像素段提取正确（互不连通的段被正确拆分 —— 城堡垛口是关键用例）
 *   4. 生成的 SVG 合法且段数与位图一致
 *   5. data URI 可安全写入 CSS（不含裸 # " < >）
 *   6. 注入的 CSS 覆盖全部棋子，且含 webkit 前缀（Safari 兼容）
 *   7. 未知角色回落为国王，不会渲染空白
 *   8. 棋子之间形状确实不同（不是同一个形状换色）
 *
 * 用法：node tools/pieces-test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HD = path.resolve(__dirname, "..", "html-demo");
const JS = path.join(HD, "js");

// ── 最小 DOM 桩（需要 head / createElement / getElementById）──
function makeWin() {
  const nodes = {};
  const mkEl = () => {
    const el = {
      id: "", textContent: "", style: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
      appendChild(c) { el.children.push(c); if (c.id) nodes[c.id] = c; },
      setAttribute() {}, getAttribute() { return null; },
      addEventListener() {}, removeEventListener() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
    };
    return el;
  };
  const head = mkEl();
  const document = {
    readyState: "complete", head, body: mkEl(), documentElement: mkEl(),
    createElement: mkEl, createTextNode: () => ({}),
    getElementById: (id) => nodes[id] || null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  };
  return { document, nodes, head,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    location: { href: "" } };
}

const win = makeWin();
const load = (f) => new Function("window", "document", fs.readFileSync(path.join(JS, f), "utf8"))(win, win.document);
load("pieces.js");
load("content-tables.js");

const P = win.FBPieces;
const CHARS = (() => {
  try { return win.FBContent?.CHARACTERS || []; } catch { return []; }
})();

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const check = (c, m) => (c ? ok(m) : bad(m));

console.log("═".repeat(74));
console.log("  像素棋子测试");
console.log("═".repeat(74));

// ── 1. 角色与棋子一一对应 ──
console.log("\n▌ 1. 角色 ↔ 棋子对应");
{
  const ids = P.ids();
  check(ids.length >= 4, `已定义棋子 ${ids.length} 个：${ids.join("、")}`);
  const charIds = CHARS.map((c) => c.id);
  check(charIds.length > 0, `角色表 ${charIds.length} 个：${charIds.join("、")}`);
  const covered = charIds.filter((id) => P.has(id));
  check(covered.length === charIds.length,
    `每个角色都有专属棋子：${covered.length}/${charIds.length}` +
    (covered.length !== charIds.length ? `（缺 ${charIds.filter((i) => !P.has(i)).join("、")}）` : ""));
  const pieces = charIds.map((id) => P.pieceFor(id));
  check(new Set(pieces).size === pieces.length, `棋子不重复：${pieces.join("、")}`);
}

// ── 2. 位图格式 ──
console.log("\n▌ 2. 位图格式（8×8，仅 #/.）");
for (const [id, rows] of Object.entries(P.BITMAPS)) {
  const sizeOk = rows.length === P.GRID && rows.every((r) => r.length === P.GRID);
  const charsOk = rows.every((r) => /^[#.]+$/.test(r));
  const nonEmpty = rows.some((r) => r.includes("#"));
  check(sizeOk && charsOk && nonEmpty,
    `${id.padEnd(8)} ${rows.length}×${rows[0].length} 合法字符=${charsOk} 非空=${nonEmpty}`);
}

// ── 3. 像素段提取（含不连通段）──
console.log("\n▌ 3. 像素段提取（城堡垛口是不连通段的关键用例）");
{
  const rockRows = P.BITMAPS.rock;
  const runs = P.runsOf(rockRows);
  // 第 0 行 "##..##.." 必须是两段
  const row0 = runs.filter((r) => r.y === 0);
  check(row0.length === 2,
    `城堡第 0 行拆成 ${row0.length} 段（期望 2）：${row0.map((r) => `[${r.x0},${r.x1})`).join(" ")}`);
  check(row0[0].x0 === 0 && row0[0].x1 === 2 && row0[1].x0 === 4 && row0[1].x1 === 6,
    `段坐标正确：[0,2) 与 [4,6)`);
  // 第 2 行 "########" 必须是一段
  const row2 = runs.filter((r) => r.y === 2);
  check(row2.length === 1 && row2[0].x0 === 0 && row2[0].x1 === 8,
    `城堡第 2 行合并为 1 段 [0,8)`);
  // 所有段的总像素数应与位图中 # 的数量一致
  const hashCount = rockRows.join("").split("").filter((c) => c === "#").length;
  const cellCount = runs.reduce((s, r) => s + (r.x1 - r.x0), 0);
  check(hashCount === cellCount, `覆盖率一致：位图 ${hashCount} 像素 = 段合计 ${cellCount}`);
}

// ── 4. SVG 生成 ──
console.log("\n▌ 4. SVG 生成");
for (const [id, rows] of Object.entries(P.BITMAPS)) {
  const svg = P.bitmapToSvg(rows);
  const rects = (svg.match(/<rect/g) || []).length;
  const expect = P.runsOf(rows).length;
  const hasNs = svg.includes('xmlns="http://www.w3.org/2000/svg"');
  const hasViewBox = svg.includes(`viewBox="0 0 ${P.GRID} ${P.GRID}"`);
  const crisp = svg.includes('shape-rendering="crispEdges"');
  check(rects === expect && hasNs && hasViewBox && crisp,
    `${id.padEnd(8)} ${rects} 个 rect（=段数 ${expect}）· viewBox=${hasViewBox} · crispEdges=${crisp}`);
}

// ── 5. data URI 安全性 ──
console.log("\n▌ 5. data URI 可安全写入 CSS");
{
  let allOk = true;
  for (const [id, rows] of Object.entries(P.BITMAPS)) {
    const uri = P.svgToDataUri(P.bitmapToSvg(rows));
    const okForm = uri.startsWith('url("data:image/svg+xml,') && uri.endsWith('")');
    // 去掉最外层 url(" ... ") 后，内部不允许再出现裸引号或裸 # / 尖括号
    const inner = uri.slice('url("'.length, -2);
    const bad = /["#<>]/.test(inner);
    if (!okForm || bad) allOk = false;
    check(okForm && !bad, `${id.padEnd(8)} 形如 url("data:image/svg+xml,…") 且无裸引号/#/尖括号`);
  }
  if (allOk) ok("全部 data URI 可安全内联到 CSS");
}

// ── 6. 注入的 CSS ──
console.log("\n▌ 6. 注入 CSS（含 webkit 前缀）");
{
  const n = P.applyTo(win.document);
  const el = win.document.getElementById("fb-piece-style");
  check(!!el, `已注入 <style id="fb-piece-style">`);
  const css = el?.textContent || "";
  check(n === Object.keys(P.BITMAPS).length, `注入 ${n} 个棋子规则`);
  for (const id of P.ids()) {
    if (!css.includes(`.--piece-${id}{`)) bad(`缺少 .--piece-${id} 规则`);
  }
  if (P.ids().every((id) => css.includes(`.--piece-${id}{`))) ok("每个棋子都有对应规则");
  check(css.includes("-webkit-mask-image") && css.includes("mask-image"),
    "同时含 -webkit-mask-image 与 mask-image（Safari 兼容）");
  check(css.includes("mask-size:100% 100%"), "mask-size 拉伸至容器");
  check(css.includes("image-rendering:pixelated"), "image-rendering:pixelated（保持像素硬边）");
  // 颜色
  for (const [id, color] of Object.entries(P.PIECE_COLORS)) {
    if (!css.includes(color)) bad(`${id} 的主题色 ${color} 未注入`);
  }
  if (Object.values(P.PIECE_COLORS).every((c) => css.includes(c))) ok("全部主题色已注入");
}

// ── 7. 未知角色回落 ──
console.log("\n▌ 7. 未知角色回落（不渲染空白）");
{
  check(P.pieceFor("nonexistent") === "royalty", `未知角色 → ${P.pieceFor("nonexistent")}`);
  check(P.pieceFor(null) === "royalty", `null → ${P.pieceFor(null)}`);
  const cls = P.classFor("nonexistent");
  check(cls.includes("--piece-royalty"), `classFor 回落正确：${cls}`);
}

// ── 8. 形状确实不同 ──
console.log("\n▌ 8. 棋子形状互不相同（不是同一形状换色）");
{
  const sigs = {};
  for (const [id, rows] of Object.entries(P.BITMAPS)) sigs[id] = rows.join("|");
  const uniq = new Set(Object.values(sigs));
  check(uniq.size === Object.keys(sigs).length,
    `${Object.keys(sigs).length} 个棋子 → ${uniq.size} 种不同形状`);
}

// ── 9. 缩略预览 ──
console.log("\n▌ 9. 形状缩略");
{
  const ids = P.ids();
  const lines = [];
  for (let y = 0; y < P.GRID; y++) {
    lines.push(ids.map((id) => P.BITMAPS[id][y].replace(/#/g, "█").replace(/\./g, "·")).join("   "));
  }
  console.log("  " + ids.map((id) => (P.PIECE_NAMES[id] || id).padEnd(8)).join("   "));
  for (const l of lines) console.log("  " + l);
}

console.log("\n" + "─".repeat(74));
console.log(`  通过 ${pass} · 失败 ${fail}`);
console.log("─".repeat(74));
process.exit(fail ? 1 : 0);
