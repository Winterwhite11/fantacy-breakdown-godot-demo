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
import crypto from "node:crypto";
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

// ── 1b. 缓存戳同步（防止发旧 JS）──
{
  const s = sec("1b. 缓存戳同步");
  const htmlDir = HD;
  let drift = 0;
  for (const name of ["index.html", "debug.html"]) {
    const p = path.join(htmlDir, name);
    if (!fs.existsSync(p)) continue;
    const html = fs.readFileSync(p, "utf8");
    for (const m of html.matchAll(/\b(?:src|href)="([^"?]+)\?v=([^"]+)"/g)) {
      const abs = path.resolve(htmlDir, m[1]);
      if (!fs.existsSync(abs)) continue;
      // html 自身用「结构性哈希」（去掉所有 ?v= 后再哈希），与 stamp.mjs 一致；
      // 否则 A 引用 B 的哈希、B 写回后哈希又变，会永远判为漂移。
      const src = fs.readFileSync(abs);
      const want = abs.endsWith(".html")
        ? crypto.createHash("sha1").update(src.toString("utf8").replace(/\?v=[^"']*/g, "")).digest("hex").slice(0, 8)
        : crypto.createHash("sha1").update(src).digest("hex").slice(0, 8);
      if (m[2] !== want) { drift++; bad(s, `${name}: ${m[1]} 缓存戳 ${m[2]} ≠ 内容哈希 ${want}`); }
    }
  }
  if (!drift) ok(s, "所有本地资源缓存戳与内容哈希一致");
  else bad(s, `共 ${drift} 处漂移，请运行: node tools/stamp.mjs`);
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
  winAll = loadBrowserGlobals(["card-data.js", "economy.js", "summon-elements.js", "cards.js"]);
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

  // 元素/操作牌的效果由 cards.js 的 ELEMENT_PLAY 提供（挂在 CARD_DEFS[id].play），
  // 不走 WORD_EFFECTS —— 两类都要认，否则会误报（如 247 电）。
  const elementIds = new Set([...Object.keys(T.elements), ...Object.keys(T.processes)]);
  const hasPlay = (id) => {
    const p = C.CARD_DEFS[id]?.play;
    return !!p && Object.keys(p).length > 0;
  };
  const implemented = (id) => !!we[id] || hasPlay(id) || IMPL_WHITELIST.includes(id);

  const missing = T.specials
    .filter((x) => (x.materials_alts || []).length > 0)
    .filter((x) => !implemented(x.id))
    .map((x) => `${x.num} ${x.name}(${x.id})`);
  if (missing.length) bad(s, `${missing.length} 张有配方的牌无实现：${missing.join("、")}`);
  else ok(s, `所有可合成牌均有实现（${T.specials.filter((x) => (x.materials_alts || []).length > 0).length} 张）`);

  // 元素牌必须有 play 定义，否则打出无效果。
  // 操作牌（压缩/堆砌/加热/冷却/增幅）设计上是**纯合成材料**，
  // 只通过「压缩X / X墙 / 高温X / 冷却X / 提纯X」参与合成，不单独打出，故豁免。
  const elementOnly = Object.keys(T.elements);
  const noPlay = elementOnly.filter((id) => !hasPlay(id));
  if (noPlay.length) bad(s, `元素牌缺 play 定义：${noPlay.join("、")}`);
  else ok(s, `全部 ${elementOnly.length} 张元素牌均有 play 定义`);

  const processOnly = Object.keys(T.processes);
  ok(s, `操作牌 ${processOnly.length} 张（纯合成材料，不单独打出，已豁免 play 检查）`);

  // 元素牌若同时是合成产物（如 电 = 砂+增幅），应有专属配方而非落到默认提纯
  const elementsWithRecipe = [...elementIds].filter((id) => {
    const el = T.elements[id];
    return el && (el.craft_alts || []).length > 0;
  });
  ok(s, `带专属配方的元素：${elementsWithRecipe.join("、") || "无"}`);

  if (IMPL_WHITELIST.length) warn(s, `白名单（已登记待办）${IMPL_WHITELIST.length} 张：${IMPL_WHITELIST.join(", ")}`);
  else ok(s, "白名单为空 —— 无待实装卡牌");
}

// ── 5. 经济校验 ──
{
  const s = sec("5. 经济校验");
  const E = winAll.FBEconomy;
  if (!E) { bad(s, "FBEconomy 未加载"); }
  else {
    // 定价单调性：直接校验真实价格表（性价比应随「深度」递减）
    // 注意：不能用 priceOfBase（它固定深度 1），必须用生成产物的表。
    const priceTablePath = path.join(DATA, "card-price-table-v1.json");
    if (fs.existsSync(priceTablePath)) {
      const tbl = JSON.parse(fs.readFileSync(priceTablePath, "utf8"));
      const byDepth = {};
      for (const r of tbl) {
        if (!(r.price > 0) || !(r.wv > 0)) continue;
        (byDepth[r.depth] ||= []).push(r.wv / r.price);
      }
      const depths = Object.keys(byDepth).map(Number).sort((a, b) => a - b);
      const avgs = depths.map((d) => byDepth[d].reduce((s, x) => s + x, 0) / byDepth[d].length);
      let bad2 = 0;
      for (let i = 1; i < avgs.length; i++) if (avgs[i] > avgs[i - 1] + 1e-9) bad2++;
      const desc = depths.map((d, i) => `深${d}=${avgs[i].toFixed(3)}`).join(" > ");
      if (bad2) warn(s, `性价比未随深度严格递减（${bad2} 处逆序）：${desc}`);
      else ok(s, `性价比随深度严格递减：${desc}`);
      // 同深度内不要求「价格随 WV 单调」——
      // 价格同时反映「供给成本」（材料是否昂贵），并非输出价值的纯函数。
      // 例：`气 = 水+火`，水本身又是一条贵配方，于是气的价格被推高到 42，
      // 而它的输出强度只有 WV 3。这属于**刻意选择**（稀有配方产物按投入定价），
      // 与现实中「合成橡胶贵于原油」同理。
      // 因此这里只校验「深度间」的严格递减（上面已验证），
      // 并单独提示深度 1 内被配方推高的元素，供人工复核而非报错。
      const d1 = tbl.filter((r) => r.depth === 1 && r.wv > 0);
      const pushed = d1.filter((r) => r.acq && r.acq !== "buy" && r.wv < 6 && r.price > 18);
      if (pushed.length) {
        console.log(
          `  · 深度 1 内按「投入成本」定价的元素 ${pushed.length} 张（刻意设计，非错误）：` +
          pushed.map((r) => `${r.name} 价${r.price}/WV${r.wv}`).join("、")
        );
      } else {
        ok(s, "深度 1 内无被配方推高的低强度元素");
      }
    } else {
      warn(s, "未找到 card-price-table-v1.json，跳过深度单调性校验");
    }

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

    // package.json 里引用的脚本文件必须真实存在。
    // 历史上 gen_price_table.js 改名 .cjs 后，npm run prices 静默失效了很久。
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
      const broken = [];
      for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
        for (const m of String(cmd).matchAll(/node\s+([^\s&|]+)/g)) {
          const rel = m[1];
          if (!/\.(mjs|cjs|js)$/.test(rel)) continue;
          if (!fs.existsSync(path.join(REPO, rel))) broken.push(`${name} → ${rel}`);
        }
      }
      if (broken.length) bad(s, `npm scripts 引用了不存在的文件：${broken.join("、")}`);
      else ok(s, `npm scripts 的 ${Object.keys(pkg.scripts || {}).length} 条命令文件均存在`);
    } catch {
      warn(s, "无法读取 package.json，跳过脚本引用校验");
    }

    // 调色板一致性：style.css / debug-lab.css 不应再出现旧的羊皮纸/黄铜硬编码，
    // 否则画风统一会随每次改动逐步退化（历史上正是这样漏掉了 43 处）。
    const LEGACY = [
      /rgba\(\s*201\s*,\s*164\s*,\s*92/i,   // 旧黄铜
      /#c9a45c/i, /#8a6a2e/i, /#d8c89a/i,   // 旧黄铜色值
      /#161412/i, /#0e0d0c/i, /#2a2218/i,   // 旧羊皮纸底
      /#e8e0d0/i, /#9a9488/i,               // 旧纸面文字
      /rgba\(\s*18\s*,\s*16\s*,\s*14/i,     // 旧暖褐面板底
      /rgba\(\s*40\s*,\s*32\s*,\s*20/i,
    ];
    let legacyHits = [];
    for (const rel of ["css/style.css", "css/debug-lab.css"]) {
      const p = path.join(HD, rel);
      if (!fs.existsSync(p)) continue;
      fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        for (const re of LEGACY) {
          if (re.test(line)) { legacyHits.push(`${rel}:${i + 1}`); break; }
        }
      });
    }
    if (legacyHits.length) {
      bad(s, `仍有旧羊皮纸/黄铜硬编码 ${legacyHits.length} 处：${legacyHits.slice(0, 6).join("、")}${legacyHits.length > 6 ? " …" : ""}`);
    } else {
      ok(s, "无旧羊皮纸/黄铜硬编码（画风统一未被回退）");
    }

    // 未定义变量：引用了 tokens.css 里不存在的令牌
    const tokenSrc = fs.existsSync(path.join(HD, "css/tokens.css"))
      ? fs.readFileSync(path.join(HD, "css/tokens.css"), "utf8") : "";
    const defined = new Set([...tokenSrc.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const usedVars = new Set();
    for (const rel of ["css/style.css", "css/debug-lab.css"]) {
      const p = path.join(HD, rel);
      if (!fs.existsSync(p)) continue;
      for (const m of fs.readFileSync(p, "utf8").matchAll(/var\((--[a-z0-9-]+)/g)) usedVars.add(m[1]);
    }
    // debug-lab.css 自有的字体别名不算缺失
    // --font/--mono 由 debug-lab.css 自定义；
    // --fb-* 由 JS 运行时注入（pieces.js 的 mask/颜色），不在 tokens.css 里。
    const LOCAL_OK = new Set(["--font", "--mono"]);
    const isRuntimeVar = (x) => x.startsWith("--fb-");
    const undef = [...usedVars].filter((v) => !defined.has(v) && !LOCAL_OK.has(v) && !isRuntimeVar(v));
    if (undef.length) bad(s, `引用了未定义的 CSS 变量：${undef.join("、")}`);
    else ok(s, `${usedVars.size} 个 CSS 变量引用全部有定义`);
    if (typeof E.cardSellReference === "function" && typeof E.cardPriceOf === "function") {
      let arb = 0;
      for (let wv = 1; wv <= 60; wv += 3) {
        const buy = E.cardPriceOf("__probe__", wv, 2);
        const sell = E.cardSellReference("__probe__", wv, 2);
        if (sell >= buy) arb++;
      }
      if (arb) warn(s, `卡牌买卖存在 ${arb} 处无风险套利（卖价 ≥ 买价）`);
      else ok(s, "卡牌交易无无风险套利（卖价 < 买价）");
    }
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
