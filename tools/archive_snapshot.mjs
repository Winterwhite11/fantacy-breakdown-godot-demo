#!/usr/bin/env node
/**
 * archive_snapshot.mjs —— 自动留档
 *
 * 用途：在覆盖任何内容前，把当前状态快照到
 *   game-design-workflow/archive/<YYYY-MM-DD>-<label>/
 * 便于用户随时回溯先前版本。
 *
 * 用法：
 *   node tools/archive_snapshot.mjs <label> [--files a,b,c] [--all]
 *
 * 默认留档对象（可回溯的关键资产）：
 *   - data/card-design-table-v0.2.md   （旧卡表）
 *   - html-demo/js/card-data.js        （生成卡表）
 *   - html-demo/js/encounters.js       （遭遇）
 *   - html-demo/js/combat.js           （战斗）
 *   - html-demo/js/app.js              （流程/UI）
 *   - html-demo/css/style.css          （画风）
 *   - html-demo/js/cards.js            （卡牌效果）
 *   - html-demo/js/economy.js          （经济引擎）
 *
 * 同时写一份 MANIFEST.json 记录原生提交哈希与时间，便于精确回溯。
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");                 // godot-demo/（本文件在 tools/ 下）
const ROOT = path.resolve(REPO, "..");                      // workspace root

const DEFAULT_FILES = [
  "game-design-workflow/data/card-design-table-v0.2.md",
  "game-design-workflow/data/card-economy-system-v1.md",
  "game-design-workflow/data/card-price-table-v1.json",
  "html-demo/js/card-data.js",
  "html-demo/js/encounters.js",
  "html-demo/js/combat.js",
  "html-demo/js/app.js",
  "html-demo/js/cards.js",
  "html-demo/js/economy.js",
  "html-demo/css/style.css",
  "html-demo/index.html",
];

/**
 * 读取 git 信息。
 * 注意：受限沙箱下子进程无法用管道捕获输出，故改用临时文件重定向。
 */
function gitInfo() {
  const tmp = path.join(REPO, ".git-archive-probe.tmp");
  const run = (cmd, fallback) => {
    try {
      execSync(`${cmd} > "${tmp}" 2>nul`, { cwd: REPO, shell: "cmd.exe", stdio: "ignore" });
      const out = fs.readFileSync(tmp, "utf8").trim();
      return out || fallback;
    } catch {
      return fallback;
    }
  };
  try {
    const branch = run("git rev-parse --abbrev-ref HEAD", "unknown");
    const commit = run("git rev-parse HEAD", "unknown");
    const subject = run("git log -1 --pretty=%s", "");
    const porcelain = run("git status --porcelain", "");
    return {
      branch,
      commit,
      short: commit === "unknown" ? "unknown" : commit.slice(0, 7),
      subject,
      dirty: porcelain.length > 0,
    };
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function main() {
  const args = process.argv.slice(2);
  const label = (args[0] || "snapshot").replace(/[^a-zA-Z0-9._-]/g, "-");
  const allIdx = args.indexOf("--all");
  const filesIdx = args.indexOf("--files");
  let files = DEFAULT_FILES;
  if (filesIdx >= 0 && args[filesIdx + 1]) {
    files = args[filesIdx + 1].split(",").map((s) => s.trim()).filter(Boolean);
  } else if (allIdx >= 0) {
    const walk = (d, acc = []) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if ([".git", "node_modules", ".godot", "__pycache__", "archive"].includes(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, acc);
        else acc.push(path.relative(REPO, p).replace(/\\/g, "/"));
      }
      return acc;
    };
    files = walk(REPO).filter((f) => /\.(js|mjs|css|html|json|md|py|gd|tscn|godot)$/i.test(f));
  }

  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(REPO, "game-design-workflow", "archive", `${date}-${label}`);
  fs.mkdirSync(dir, { recursive: true });

  const g = gitInfo();
  const copied = [];
  const missing = [];

  for (const rel of files) {
    const src = path.join(REPO, rel);
    if (!fs.existsSync(src)) { missing.push(rel); continue; }
    const dst = path.join(dir, rel.replace(/[\\/]/g, "__"));
    fs.copyFileSync(src, dst);
    copied.push({ from: rel, to: path.basename(dst), bytes: fs.statSync(src).size });
  }

  const manifest = {
    label,
    archivedAt: new Date().toISOString(),
    repo: "godot-demo",
    git: g,
    fileCount: copied.length,
    files: copied,
    missing,
    note: "自动留档：覆盖前状态。用 `git show <commit>:<path>` 可精确还原 git 内文件。",
  };
  fs.writeFileSync(path.join(dir, "MANIFEST.json"), JSON.stringify(manifest, null, 2), "utf8");

  // 人类可读索引
  const lines = [
    `# 留档快照 · ${label}`,
    "",
    `- 归档时间：${manifest.archivedAt}`,
    `- 分支：\`${g.branch}\``,
    `- 提交：\`${g.short}\` ${g.subject}`,
    `- 工作区是否脏：${g.dirty === null ? "未知" : g.dirty ? "**是（含未提交改动）**" : "否"}`,
    `- 文件数：${copied.length}`,
    "",
    "## 回溯方式",
    "",
    "**方式 1（推荐，git 内文件）：**",
    "```bash",
    `git show ${g.short}:<仓库内相对路径> > <目标文件>`,
    "```",
    "",
    "**方式 2（本目录快照）：**",
    "本目录内文件名为 `原路径中 / 替换为 __`，例如：",
    "`html-demo__js__combat.js` 对应 `html-demo/js/combat.js`。",
    "",
    "## 文件清单",
    "",
    "| 原路径 | 快照文件 | 字节 |",
    "| --- | --- | ---: |",
    ...copied.map((c) => `| \`${c.from}\` | \`${c.to}\` | ${c.bytes} |`),
  ];
  if (missing.length) {
    lines.push("", "## 未找到（跳过）", "", ...missing.map((m) => `- \`${m}\``));
  }
  fs.writeFileSync(path.join(dir, "README.md"), lines.join("\n"), "utf8");

  console.log(`✅ 已留档 ${copied.length} 个文件 → ${path.relative(REPO, dir)}`);
  console.log(`   分支 ${g.branch} @ ${g.short}${g.dirty ? "（工作区有未提交改动）" : ""}`);
  if (missing.length) console.log(`   ⚠ 跳过 ${missing.length} 个不存在的路径`);
}

main();
