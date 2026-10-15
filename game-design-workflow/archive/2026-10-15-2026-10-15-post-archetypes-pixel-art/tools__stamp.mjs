#!/usr/bin/env node
/**
 * stamp.mjs —— 自动缓存戳（build stamp）
 *
 * 背景：index.html 原来靠手写查询串（`?v=craftprev1`、`?v=tl15c`…），
 * 每改一次都要记得改，漏改就给玩家发旧 JS —— README 里"请硬刷新"的根因之一。
 *
 * 本脚本按每个文件的**内容哈希**重写它的查询串。内容没变则戳不变，
 * 内容一变戳必变，从此不需要手写，也不可能漏改。
 *
 * 用法：
 *   node tools/stamp.mjs          # 重写 index.html 与 debug.html
 *   node tools/stamp.mjs --check  # 只检查是否已同步（CI 用，不同步则退出码 1）
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HD = path.resolve(__dirname, "..", "html-demo");
const CHECK = process.argv.includes("--check");

/** 8 位内容哈希 */
function hashOf(abs) {
  const buf = fs.readFileSync(abs);
  return crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8);
}

/**
 * 处理一个 html：把 src/href 指向的本地资源加上内容哈希戳。
 * 注意 order：若 A.html 链接了 B.html，则必须先盖 B 再盖 A，
 * 否则 A 里记录的 B 哈希会过期。故按「被依赖者优先」排序，
 * 并在有多轮改动时重复迭代直到收敛。
 */
function stampFile(htmlName) {
  const htmlPath = path.join(HD, htmlName);
  if (!fs.existsSync(htmlPath)) return { file: htmlName, changed: 0, missing: true };
  let html = fs.readFileSync(htmlPath, "utf8");
  let changed = 0;

  // 匹配 src="..." / href="..."（只处理相对路径，跳过 http(s) 与 data:）
  html = html.replace(/(\b(?:src|href))="([^"]+)"/g, (m, attr, url) => {
    if (/^(https?:|data:|\/\/|#)/i.test(url)) return m;
    // 拆掉已有查询串
    const [rawPath, oldQuery] = url.split("?");
    const abs = path.resolve(path.dirname(htmlPath), rawPath);
    if (!fs.existsSync(abs)) return m;                 // 外部/不存在：不动
    const h = hashOf(abs);
    const newQuery = `v=${h}`;
    if (oldQuery !== newQuery) changed++;
    return `${attr}="${rawPath}?${newQuery}"`;
  });

  if (!CHECK && changed) fs.writeFileSync(htmlPath, html, "utf8");
  return { file: htmlName, changed, missing: false };
}

/**
 * html 自身的戳：不哈希原字节（否则会与引用者形成循环：A 引用 B 的哈希，
 * B 写回后哈希又变，A 再变…）。改为哈希「去掉所有查询串后的结构」，
 * 该值只随标记结构变化，与戳内容无关 ⇒ 一次收敛、稳定幂等。
 */
function htmlStampOf(abs) {
  const raw = fs.readFileSync(abs, "utf8");
  const structural = raw.replace(/\?v=[^"']*/g, "");
  return crypto.createHash("sha1").update(structural).digest("hex").slice(0, 8);
}

/**
 * 两阶段盖章：第 1 阶段只读、建立全量哈希表；第 2 阶段一次性写入。
 */
const targets = ["debug.html", "index.html"];

/** 只算不改：返回该 html 应该长成的样子 */
function computeStamped(htmlName, hashTable) {
  const htmlPath = path.join(HD, htmlName);
  if (!fs.existsSync(htmlPath)) return null;
  const html = fs.readFileSync(htmlPath, "utf8");
  let changed = 0;
  const out = html.replace(/(\b(?:src|href))="([^"]+)"/g, (m, attr, url) => {
    if (/^(https?:|data:|\/\/|#)/i.test(url)) return m;
    const [rawPath, oldQuery] = url.split("?");
    const abs = path.resolve(path.dirname(htmlPath), rawPath);
    if (!fs.existsSync(abs)) return m;
    const h = hashTable.get(abs) || (abs.endsWith(".html") ? htmlStampOf(abs) : hashOf(abs));
    if (oldQuery !== `v=${h}`) changed++;
    return `${attr}="${rawPath}?v=${h}"`;
  });
  return { htmlPath, out, changed };
}

// 阶段 1：建立全量哈希表（此刻所有文件都未被修改）
const hashTable = new Map();
for (const t of targets) {
  const p = path.join(HD, t);
  if (fs.existsSync(p)) hashTable.set(path.resolve(p), htmlStampOf(p));
}
for (const dir of ["js", "css", "img"]) {
  const d = path.join(HD, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    const p = path.resolve(d, f);
    if (fs.statSync(p).isFile()) hashTable.set(p, hashOf(p));
  }
}

// 阶段 2：一次性写入
let total = 0, problems = 0;
const results = [];
for (const t of targets) {
  const r = computeStamped(t, hashTable);
  if (!r) { results.push(`  ${t} 不存在，跳过`); continue; }
  total += r.changed;
  if (CHECK && r.changed) problems++;
  if (!CHECK && r.changed) fs.writeFileSync(r.htmlPath, r.out, "utf8");
  results.push(`  ${CHECK ? (r.changed ? "✗" : "✓") : "•"} ${t} ${r.changed ? `更新 ${r.changed} 处` : "已是最新"}`);
}
results.forEach((l) => console.log(l));

if (CHECK) {
  console.log(problems ? `\n✗ ${problems} 个文件缓存戳漂移，请运行: node tools/stamp.mjs` : `\n✓ 全部缓存戳已同步`);
  process.exit(problems ? 1 : 0);
}
console.log(`\n完成，共重写 ${total} 处缓存戳`);
