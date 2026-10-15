#!/usr/bin/env node
/**
 * ui-wiring.mjs —— UI 接线校验
 *
 * 目的：HTML 改版后，最容易出的错是「JS 查询了一个 HTML 里不存在的 id/class」，
 * 这类问题在浏览器里只是静默失效（元素为 null，代码走 else 分支或报错中断），
 * 单靠数据层测试发现不了。
 *
 * 校验：
 *   1. app.js / debug-lab.js 里所有 $("#xxx") 查询的 id 必须存在于 HTML
 *   2. HTML 里所有 id 不得重复
 *   3. style.css 里被 JS 添加的关键 class 必须有对应样式（避免「加了类但没样式」）
 *   4. 引用的 js/css 文件必须真实存在
 *   5. 立绘占位等「待接入」标记必须仍可见（提醒美术未完成）
 *
 * 用法：node tools/ui-wiring.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HD = path.resolve(__dirname, "..", "html-demo");

let pass = 0, fail = 0, warn = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const wrn = (m) => { console.log(`  ▲ ${m}`); warn++; };

const pages = [
  { html: "index.html", scripts: ["js/app.js", "js/map.js", "js/market.js", "js/pieces.js"] },
  { html: "debug.html", scripts: ["js/debug-lab.js", "js/debug-overrides.js"] },
];

console.log("═".repeat(74));
console.log("  UI 接线校验");
console.log("═".repeat(74));

for (const page of pages) {
  const htmlPath = path.join(HD, page.html);
  if (!fs.existsSync(htmlPath)) { bad(`${page.html} 不存在`); continue; }
  const html = fs.readFileSync(htmlPath, "utf8");
  console.log(`\n▌ ${page.html}`);

  // ── 1. id 唯一性 ──
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) bad(`重复 id：${[...new Set(dup)].join("、")}`);
  else ok(`id 唯一（共 ${ids.length} 个）`);

  // ── 2. JS 的 $("#id") 必须存在（静态 HTML 或 JS 运行时创建）──
  // JS 会在运行时创建部分节点（如 toast 浮层、动态 innerHTML 面板），
  // 因此需要先收集「运行时 id」再判断缺失。
  const jsSrcs = page.scripts
    .map((rel) => path.join(HD, rel))
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p, "utf8"))
    .join("\n");
  const runtimeIds = new Set([
    ...[...jsSrcs.matchAll(/\.id\s*=\s*"([A-Za-z0-9_-]+)"/g)].map((m) => m[1]),
    ...[...jsSrcs.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]),          // innerHTML 模板
    ...[...jsSrcs.matchAll(/id=\\?"([A-Za-z0-9_-]+)\\?"/g)].map((m) => m[1]),    // 转义模板串
  ]);
  const idSet = new Set([...ids, ...runtimeIds]);
  let missing = [];
  for (const rel of page.scripts) {
    const p = path.join(HD, rel);
    if (!fs.existsSync(p)) { bad(`脚本缺失：${rel}`); continue; }
    const src = fs.readFileSync(p, "utf8");
    for (const m of src.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)) {
      if (!idSet.has(m[1])) missing.push(`${rel} → #${m[1]}`);
    }
    for (const m of src.matchAll(/getElementById\("([A-Za-z0-9_-]+)"\)/g)) {
      if (!idSet.has(m[1])) missing.push(`${rel} → getElementById(${m[1]})`);
    }
  }
  if (missing.length) bad(`JS 引用了不存在的 id（${missing.length} 处）：\n      ${missing.join("\n      ")}`);
  else ok(`JS 引用的所有 id 都存在（静态 ${ids.length} + 运行时 ${runtimeIds.size}）`);

  // ── 3. 引用资源存在 ──
  const refs = [
    ...[...html.matchAll(/<script src="([^"?]+)/g)].map((m) => m[1]),
    ...[...html.matchAll(/<link[^>]+href="([^"?]+)/g)].map((m) => m[1]),
  ];
  const missingFiles = refs.filter((r) => !/^https?:/.test(r) && !fs.existsSync(path.join(HD, r)));
  if (missingFiles.length) bad(`引用的资源不存在：${missingFiles.join("、")}`);
  else ok(`引用的 ${refs.length} 个脚本/样式文件都存在`);
}

// ── 4. JS 添加的 class 必须有样式 ──
console.log("\n▌ JS 动态类 ↔ CSS 定义");
{
  const css = ["css/style.css", "css/tokens.css", "css/debug-lab.css"]
    .map((f) => (fs.existsSync(path.join(HD, f)) ? fs.readFileSync(path.join(HD, f), "utf8") : ""))
    .join("\n");
  // 本轮改动引入的关键类
  const KEY = [
    "char-stage", "char-rail", "char-stage-art", "char-art-slot",
    "char-art-piece", "char-art-placeholder", "char-stage-title",
    "char-stage-piece", "char-card-text", "char-detail", "char-bonus-list",
    "char-detail-blurb", "char-detail-note",
    "move-hint", "terrain-moss", "terrain-crystal", "terrain-basalt", "terrain-crater",
    "mkt-buy-row", "mkt-can-priceup", "mkt-crowded",
  ];
  const miss = KEY.filter((c) => !css.includes(`.${c}`));
  if (miss.length) bad(`JS/HTML 使用但 CSS 未定义的类：${miss.join("、")}`);
  else ok(`${KEY.length} 个关键类都有样式定义`);
}

// ── 5. 待接入标记仍在（提醒美术未完成）──
console.log("\n▌ 待接入标记（美术未完成的显式提示）");
{
  const html = fs.readFileSync(path.join(HD, "index.html"), "utf8");
  if (html.includes("立绘待接入")) ok("立绘占位标记存在（美术未接入时不会看起来像坏掉）");
  else wrn("未找到立绘占位标记");
}

console.log("\n" + "─".repeat(74));
console.log(`  通过 ${pass} · 警告 ${warn} · 失败 ${fail}`);
console.log("─".repeat(74));
process.exit(fail ? 1 : 0);
