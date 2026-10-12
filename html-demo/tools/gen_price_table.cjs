// 生成卡牌定价表 v3 —— 修正两个 bug：
//   ① 遍历 CARD_DEFS ∪ WORD_DEFS（词牌不在 CARD_DEFS，旧版只覆盖 16/87 张）
//   ② 材料链不去重（合成成本按实际投入的材料张数计，不是去重后的种类数）
const fs = require('fs');
const path = require('path');
const D = 'C:\\Users\\王冬睿\\Desktop\\Fantacy Breakdown\\godot-demo\\html-demo\\js\\';
const win = {};
const loadSrc = (f) => new Function('window', fs.readFileSync(D + f, 'utf8'))(win);
// 顺序：summon-elements 必须先于 cards（cards 注册 ge_* 时依赖 FBSummon）
loadSrc('card-data.js'); loadSrc('summon-elements.js'); loadSrc('cards.js');
const ECON = new Function('window',
  fs.readFileSync(D + 'economy.js', 'utf8') + '\nreturn FBEconomyModule;')(win);
const T = win.FBCardTable, C = win.FBCards;

/**
 * 全部卡牌定义。
 * 注意：`electric`(电) 同时存在于 CARD_DEFS（011 元素，play=7伤+激昂，实际生效）
 * 与 WORD_DEFS（247 词牌，效果未实装）。元素定义优先，否则会取到空效果。
 */
const ALL = { ...C.WORD_DEFS, ...C.CARD_DEFS };

function recipesOf(id) {
  const out = [];
  const el = T.elements[id];
  if (el && el.craft_alts && el.craft_alts.length) el.craft_alts.forEach(m => out.push(m));
  T.specials.forEach(s => {
    if (s.id === id && s.materials_alts && s.materials_alts.length) s.materials_alts.forEach(m => out.push(m));
  });
  return out;
}

function cardWv(id) {
  const def = ALL[id];
  if (!def) return 0;
  if (def.type === 'process') {
    // 纯操作牌从不单独打出，其价值 = 它赋予产物的增益
    return ECON.PROCESS_VALUE[id] ?? 0;
  }
  if (def.type === 'element') {
    const play = def.play;
    return play && Object.keys(play).length ? ECON.wvOf(play) : (ECON.PROCESS_VALUE[id] ?? 0);
  }
  const we = C.WORD_EFFECTS[id];
  if (we) {
    if (we.damageByChant) return ECON.standardDamage(2);
    if (we.blockByChant) return ECON.standardDamage(2) * ECON.WV_WEIGHT.block;
    return ECON.wvOf(we);
  }
  return 0;
}

/** 最短配方（按材料张数） */
function shortestRecipe(id) {
  const rs = recipesOf(id);
  if (!rs.length) return null;
  let best = rs[0];
  for (const m of rs) if (m.length < best.length) best = m;
  return best;
}

/**
 * 展开到基础材料的张数（= 将该牌合成出来需投入的基础牌数量）。
 *
 * 三条规则：
 *   ① **直接可得牌视为基础（返回 1）**：元素与操作牌本身可购买/掉落
 *      （卡表原文：「气也可以通过事件，击杀怪物，商店获得」）。
 *      这条很关键——元素之间存在合成环（水 ← 冰+气，冰 ← 水+冷却），
 *      若不这样处理，环检测会把「水」判为不可得，进而连累 木/涅槃/电网。
 *   ② **不去重**：`大元素 = 元素人+元素人+共鸣` 算 2 个元素人。
 *   ③ **环安全 + 取最优**：逐条配方试，遇环则该分支不可用，取材料张数最少者。
 */
function materialCount(id, seen = new Set()) {
  if (seen.has(id)) return null;                       // 环：该分支不可用
  const rs = recipesOf(id);
  // ① 有配方 → 按配方展开（即使它同时也能直接买到，取更深的合成路径更准确）
  if (rs.length) {
    const s2 = new Set(seen); s2.add(id);
    let best = null;
    for (const m of rs) {
      let total = 0, ok = true;
      for (const x of m) {
        const sub = materialCount(x, s2);
        if (sub == null) { ok = false; break; }
        total += sub;
      }
      if (ok && (best == null || total < best)) best = total;
    }
    if (best != null) return best;
  }
  // ② 无配方（或所有配方成环）→ 若为元素/操作牌则直接可得，计 1 张
  return 1;
}

/**
 * 深度：从基础资源到该牌的「合成步数」。1 = 基础资源，2 = 复合产物，3+ = 深链。
 *
 * 为什么允许显式覆盖：
 *   卡表里 011 钢铁 被定义为「元素」，但原文说它是「经过冶炼的优秀元素」，
 *   明确是合成产物（砂+火/加热+增幅），应当与基础元素不同价。
 *   而 水/冰/气/木 之间存在合成环（水←冰+气，冰←水+冷却），
 *   递归推断在这些点上固有歧义。故关键牌显式指定，其余递归推断。
 *
 * `_depthOverride` 由下方 DEPTH_OVERRIDE 提供。
 */
function depthOf(id, seen = new Set()) {
  const over = DEPTH_OVERRIDE[id];
  if (over != null) return over;
  if (seen.has(id)) return 0;
  const rs = recipesOf(id);
  if (!rs.length) return 1;
  const s2 = new Set(seen); s2.add(id);
  let best = 0;
  for (const m of rs) {
    let d = 0;
    for (const x of m) d = Math.max(d, depthOf(x, s2));
    if (d > 0) best = Math.max(best, d + 1);
  }
  return best || 2;
}

const ids = Object.keys(ALL);

/**
 * 深度显式覆盖（关键牌）。
 * 依据 card table.docx 的语义：基础元素是合成起点（深度 1）；
 * 明确被「冶炼/加工」出来的元素或字词，按实际合成步数计。
 */
const DEPTH_OVERRIDE = {
  // 基础元素（可购买/掉落）—— 即使自身有 craft_alts 也视为起点
  water: 1, fire: 1, air: 1, poison: 1, sand: 1, ice: 1, wood: 1,
  hafnium: 1, gold: 1, electric: 1,
  // 操作牌（纯合成材料）
  compress: 1, stack: 1, heat: 1, cool: 1, amp: 1,
  // 「经过冶炼」的合成元素：砂+火/加热+增幅 → 3 步链
  steel: 3,
  // 召唤流分支
  w404: 2,                 // 共鸣+任意元素
  great_elemental: 3,      // 元素人×2 + 共鸣
  element_king: 5,         // 大元素×2 + 共鸣
};

const wv = {}, depth = {}, price = {}, acq = {};
for (const id of ids) {
  wv[id] = cardWv(id);
  depth[id] = Math.max(1, depthOf(id));
  // 市场直购价：以深度与强度定价（也作为「不合成、直接买」的成本上界）
  price[id] = ECON.marketPrice(wv[id], depth[id]);
  acq[id] = 'buy';
}

/**
 * 自底向上定价：按深度升序处理，保证材料的最终价已确定。
 * 取「直购价」与「材料成本加价」的较大者 ——
 * 这同时保证：
 *   · 合成不会比直接买更亏（否则没人买材料）
 *   · 材料越贵 → 产物越贵（**贵牌由贵材料构成**，自动成立）
 */
const order = ids.slice().sort((a, b) => depth[a] - depth[b]);
for (const id of order) {
  const rs = recipesOf(id);
  if (!rs.length) continue;
  let best = null;
  for (const mats of rs) {
    const mp = mats.map((m) => price[m]);
    if (mp.some((p) => p == null || p <= 0)) continue;
    const cost = ECON.craftCostFromMaterials(mp, depth[id]);
    if (best == null || cost < best) best = cost;
  }
  if (best != null && best > price[id]) {
    price[id] = best;
    acq[id] = 'craft';
  } else if (best != null) {
    acq[id] = 'buy(cheaper)';
  }
}

/**
 * 最终价 = max(获取路径成本, 深度定价), 其中
 *   深度定价 = PRICE_SCALE × depth^DEPTH_EXP × (1 + WV_RATE × WV)
 *
 * 约束与标定：
 *   · DEPTH_EXP > 1  ⇒ 性价比随材料深度严格递减（已验证）
 *   · PRICE_SCALE 以「火(WV5,深度1) ≈ 2 代币」为锚，与一场普通战收入 8~12 对齐
 *   · 元素王(深度7) 落在数百量级 ⇒ 属于多局长线目标，符合「召唤流终端」定位
 */
const rows = ids.map(id => {
  const def = ALL[id];
  const p = price[id];
  return {
    id, name: def.name, type: def.type,
    depth: depth[id],
    materials: materialCount(id),
    wv: Math.round(wv[id] * 100) / 100,
    price: Math.round(p * 100) / 100,
    displayPrice: ECON.displayPrice(p),
    efficiency: ECON.efficiency(wv[id], p),
    acq: acq[id],
  };
}).sort((a, b) => a.depth - b.depth || b.wv - a.wv);

console.log(`共 ${rows.length} 张牌（CARD_DEFS ${Object.keys(C.CARD_DEFS).length} + WORD_DEFS ${Object.keys(C.WORD_DEFS).length}）\n`);
console.log('=== 按递归深度聚合（性价比应随深度递减）===');
for (let n = 1; n <= 9; n++) {
  const g = rows.filter(r => r.depth === n);
  if (!g.length) continue;
  const avg = g.reduce((s, r) => s + r.efficiency, 0) / g.length;
  console.log(`  深度 ${n}: n=${String(g.length).padStart(3)}  平均性价比 ${avg.toFixed(3)}  价 ${Math.min(...g.map(r=>r.displayPrice))}~${Math.max(...g.map(r=>r.displayPrice))}`);
}
console.log('\n=== 关键牌 ===');
for (const id of ['fire', 'sand', 'amp', 'electric', 'steel', 'firearm', 'fortress', 'gold_gun', 'grid', 'element_king', 'nirvana', 'ember_end']) {
  const r = rows.find(x => x.id === id);
  if (r) console.log(`  ${r.name.padEnd(10)} 深度${String(r.depth).padStart(2)} WV=${String(r.wv).padStart(6)} 价=${String(r.displayPrice).padStart(4)} 性价比=${String(r.efficiency).padStart(7)}`);
}
const zero = rows.filter(r => r.wv === 0);
console.log(`\n=== WV 为 0 的牌（${zero.length} 张）===`);
console.log('  ' + (zero.map(r => r.name).join('、') || '（无）'));

const outDir = path.join(D, '..', '..', 'game-design-workflow', 'data');
fs.writeFileSync(path.join(outDir, 'card-price-table-v1.json'), JSON.stringify(rows, null, 1), 'utf8');
console.log(`\n已写出 card-price-table-v1.json（${rows.length} 条）`);

// ── 同时产出浏览器可加载的运行时价格表 ──
// 卡牌是可交易资产：市场/商店/战备都要读同一份权威价格，
// 否则会出现「合成 165、市场卖 12」这类套利漏洞。
const slim = rows.map((r) => ({
  id: r.id, name: r.name, type: r.type,
  depth: r.depth, wv: r.wv, price: r.displayPrice,
}));
const jsOut = path.join(D, 'card-prices.js');
fs.writeFileSync(jsOut,
  "/** Auto-generated by tools/gen_price_table.cjs — 卡牌权威价格表（运行时）\n" +
  " *  卡牌是可交易资产：本表供市场 / 商店 / 战备读取，保证与合成定价一致。\n" +
  " */\n" +
  "window.FBCardPrices = " + JSON.stringify(slim) + ";\n" +
  "(function () {\n" +
  "  const E = window.FBEconomy;\n" +
  "  if (E && typeof E.setCardPriceTable === 'function') {\n" +
  "    E.setCardPriceTable(window.FBCardPrices);\n" +
  "  }\n" +
  "})();\n", 'utf8');
console.log(`已写出 card-prices.js（运行时价格表，${slim.length} 条）`);

console.log('\n=== 价格分布（供市场用）===');
const bands = [[1, 15], [16, 50], [51, 120], [121, 250], [251, 400], [401, Infinity]];
for (const [lo, hi] of bands) {
  const g = rows.filter(r => r.displayPrice >= lo && r.displayPrice <= hi);
  if (g.length) console.log(`  ${String(lo).padStart(3)}~${hi === Infinity ? '∞' : String(hi).padStart(3)} 代币: ${String(g.length).padStart(3)} 张  例：${g.slice(0, 3).map(r => r.name).join('、')}`);
}
