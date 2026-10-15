#!/usr/bin/env node
/**
 * art-direction.mjs —— 从实际代码抽取画风基准，生成可核对的文档
 *
 * 为什么需要它：
 *   本轮画风统一的目标是「参考用户封面」，但**封面图片从未落到工作区**
 *   （原始消息中的图片不会自动存盘）。实际采用的基准来自
 *   html-demo/js/menu-space.js —— 即主菜单的像素太空，属用户的后续口头澄清。
 *
 *   这构成一个尚未闭合的约束：一旦拿到封面，需要逐项校色。
 *   本工具把「代码里真实的颜色」抽成清单，使校色有据可依，而不是靠肉眼比对。
 *
 * 产出：game-design-workflow/data/art-direction-baseline.md
 *
 * 用法：node tools/art-direction.mjs [--check]
 *   --check 只校验文档与代码是否同步（有差异则退出码 1）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const HD = path.join(REPO, "html-demo");
const OUT = path.join(REPO, "game-design-workflow", "data", "art-direction-baseline.md");
const CHECK = process.argv.includes("--check");

const read = (p) => fs.readFileSync(p, "utf8");

// ── 1. 从 menu-space.js 抽取实际用到的颜色 ──
const menuSrc = read(path.join(HD, "js", "menu-space.js"));
const menuColors = [...new Set(
  [...menuSrc.matchAll(/#([0-9a-fA-F]{6})\b/g)].map((m) => `#${m[1].toLowerCase()}`)
)].sort();

// ── 2. 从 tokens.css 抽取令牌 ──
const tokensSrc = read(path.join(HD, "css", "tokens.css"));
const tokens = [...tokensSrc.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)]
  .map((m) => ({ name: `--${m[1]}`, value: m[2].trim() }))
  .filter((t) => !t.value.startsWith("var("));

// ── 3. 字体声明 ──
const fontDecl = [...tokensSrc.matchAll(/--(font-[a-z]+):\s*([^;]+);/g)]
  .map((m) => ({ name: m[1], value: m[2].trim() }));

// ── 4. 硬编码颜色统计（应随迁移下降）──
function countLiterals(rel) {
  const src = read(path.join(HD, rel));
  const hex = (src.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  const rgba = (src.match(/rgba?\([^)]*\)/g) || []).length;
  return { hex, rgba, total: hex + rgba };
}
const literals = {
  "css/style.css": countLiterals("css/style.css"),
  "css/debug-lab.css": countLiterals("css/debug-lab.css"),
  "css/tokens.css": countLiterals("css/tokens.css"),
};

const menuSet = new Set(menuColors);
const tokenValues = new Set(
  tokens.map((t) => t.value.toLowerCase()).filter((v) => v.startsWith("#"))
);
const inTokens = menuColors.filter((c) => tokenValues.has(c));
const notInTokens = menuColors.filter((c) => !tokenValues.has(c));

const md = `# 画风基准（Art Direction Baseline）

> **自动生成**，请勿手工编辑 —— 改代码后运行 \`node tools/art-direction.mjs\` 重新生成。
> 生成时间：${new Date().toISOString().slice(0, 10)}

## ⚠ 尚未闭合的约束（需要你确认）

本轮「画风统一」的目标写的是**参考用户封面**，但：

- **封面图片从未落到工作区**（原始消息里的图片不会自动存盘，已全库检索确认）
- 因此实际采用的基准是 \`html-demo/js/menu-space.js\`，即**主菜单的像素太空**
  —— 这来自你后续的口头澄清：「画风参考我的 html 游玩进入的像素太空，
  使用像素异星探索科幻风格」
- 早先的羊皮纸/木桌/黄铜方向（A·法杖装配 / B·路线地图）已按你的说明**废弃**

**待办**：请提供封面图片（放入工作区任意位置），我按下方清单逐项校色。
在拿到封面之前，本文件即为当前画风的权威定义。

## 一、画风定位

**像素异星探索科幻**。设计语言取自主菜单像素太空：

- 底色：\`#05080f\` 深空近黑 → \`#0c1520\` 深蓝 → \`#1a2030\` 舱体
- 主强调：\`#00e8c0\` 青绿（引擎焰 / 数值 / 成功）
- 次强调：\`#ffb84d\` 琥珀（交互高亮 / 奖励）
- 玩家 \`#3ecbff\` 电蓝 · 敌人 \`#ff5a6a\` 警示红
- 质感：2px 像素块、扫描线、暗角、**硬边（无圆角、无柔和渐变）**
- 字体：Press Start 2P（标题）/ VT323（正文），等宽点阵感

## 二、\`menu-space.js\` 实际使用的颜色（${menuColors.length} 个）

| 色值 | 是否已令牌化 |
| --- | --- |
${menuColors.map((c) => `| \`${c}\` | ${menuSet.has(c) && tokenValues.has(c) ? "✅" : "—"} |`).join("\n")}

- 已纳入 tokens.css：**${inTokens.length} / ${menuColors.length}**
- 仍在菜单代码内硬编码：**${notInTokens.length}** ${notInTokens.length ? "（菜单画布用 canvas 绘制，属可接受；若要求完全令牌化可后续收敛）" : ""}

## 三、tokens.css 令牌（${tokens.length} 个）

| 令牌 | 值 |
| --- | --- |
${tokens.map((t) => `| \`${t.name}\` | \`${t.value}\` |`).join("\n")}

## 四、字体

| 令牌 | 值 |
| --- | --- |
${fontDecl.map((f) => `| \`--${f.name}\` | \`${f.value}\` |`).join("\n")}

## 五、硬编码颜色统计（画风统一进度）

迁移约定：**新样式只引用 \`var(--*)\`，不要写死颜色。**

| 文件 | 十六进制 | rgb/rgba | 合计 |
| --- | ---: | ---: | ---: |
${Object.entries(literals).map(([f, v]) => `| \`${f}\` | ${v.hex} | ${v.rgba} | ${v.total} |`).join("\n")}

> \`tokens.css\` 本身是令牌定义处，其中的色值是**预期存在**的。
> 其余两个文件的字面量应尽量为 0；已加校验：\`validate.mjs\` 会阻止旧羊皮纸/黄铜
> 色值回归，并校验所有 \`var(--*)\` 引用都有定义。

## 六、已废弃方向（不要再使用）

| 废弃内容 | 原因 |
| --- | --- |
| 羊皮纸底 + 木桌质感 | 属《言咒》线的 A·法杖装配 / B·路线地图，用户明确为废案 |
| 黄铜 \`#c9a45c\` 描边 | 同上；已全量迁移，校验器会拦截回归 |
| \`map-paper-albedo\` 3.4MB 纹理 | 地图重做后不再请求 |
`;

if (CHECK) {
  const prev = fs.existsSync(OUT) ? read(OUT) : "";
  // 只比较要素部分（忽略生成时间）
  const strip = (s) => s.replace(/生成时间：[^\n]*\n/, "");
  if (strip(prev) !== strip(md)) {
    console.error("✗ 画风基准文档与代码不同步，请运行: node tools/art-direction.mjs");
    process.exit(1);
  }
  console.log("✓ 画风基准文档与代码同步");
  process.exit(0);
}

fs.writeFileSync(OUT, md, "utf8");
console.log("═".repeat(70));
console.log("  画风基准抽取");
console.log("═".repeat(70));
console.log(`  menu-space.js 颜色      ${menuColors.length} 个（已令牌化 ${inTokens.length}）`);
console.log(`  tokens.css 令牌         ${tokens.length} 个`);
console.log(`  字体声明                ${fontDecl.length} 个`);
console.log("  硬编码颜色统计：");
for (const [f, v] of Object.entries(literals)) {
  console.log(`    ${f.padEnd(22)} hex=${String(v.hex).padStart(3)} rgb=${String(v.rgba).padStart(3)}`);
}
console.log(`\n已写出 ${path.relative(REPO, OUT)}`);
if (notInTokens.length) {
  console.log(`\n注：${notInTokens.length} 个菜单颜色仍在 menu-space.js 内硬编码（canvas 绘制，可接受）`);
}
