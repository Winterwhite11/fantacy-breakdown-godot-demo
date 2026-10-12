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

const ids = Object.keys(ALL);
const wv = {}, price = {}, acq = {};
for (const id of ids) {
  wv[id] = cardWv(id);
  price[id] = ECON.priceOfBase(wv[id]);
  acq[id] = 'buy';
}
let changed = true, iter = 0;
while (changed && iter < 60) {
  changed = false; iter++;
  for (const id of ids) {
    const rs = recipesOf(id);
    if (!rs.length) continue;
    for (const mats of rs) {
      const mp = mats.map(m => price[m]);
      if (mp.some(p => p == null || p <= 0)) continue;
      const cost = ECON.priceOfProduct(wv[id], mp);
      if (cost < price[id]) { price[id] = cost; acq[id] = 'craft:' + mats.join('+'); changed = true; }
    }
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
const DEPTH_EXP = 1.32;
const WV_RATE = 0.9;
const PRICE_SCALE = 0.32;
const finalPrice = {};
for (const id of ids) {
  const depth = Math.max(1, materialCount(id) ?? 1);
  const depthPrice = PRICE_SCALE * Math.pow(depth, DEPTH_EXP) * (1 + WV_RATE * wv[id]);
  finalPrice[id] = Math.max(price[id], depthPrice);
}

const rows = ids.map(id => {
  const def = ALL[id];
  const cnt = materialCount(id);
  const p = finalPrice[id];
  return {
    id, name: def.name, type: def.type,
    materials: cnt == null ? null : cnt,
    wv: Math.round(wv[id] * 100) / 100,
    price: Math.round(p * 100) / 100,
    displayPrice: ECON.displayPrice(p),
    efficiency: ECON.efficiency(wv[id], p),
    acq,
  };
}).sort((a, b) => (a.materials ?? 99) - (b.materials ?? 99) || b.wv - a.wv);

console.log(`共 ${rows.length} 张牌（CARD_DEFS ${Object.keys(C.CARD_DEFS).length} + WORD_DEFS ${Object.keys(C.WORD_DEFS).length}）`);
console.log(`迭代收敛 ${iter} 轮\n`);
console.log('=== 按基础材料张数聚合（性价比应随张数递减）===');
for (let n = 1; n <= 8; n++) {
  const g = rows.filter(r => r.materials === n);
  if (!g.length) continue;
  const avg = g.reduce((s, r) => s + r.efficiency, 0) / g.length;
  console.log(`  ${n} 张材料: n=${String(g.length).padStart(3)}  平均性价比 ${avg.toFixed(3)}  价 ${Math.min(...g.map(r=>r.displayPrice))}~${Math.max(...g.map(r=>r.displayPrice))}`);
}
console.log('\n=== 关键牌 ===');
for (const id of ['fire', 'sand', 'amp', 'electric', 'steel', 'firearm', 'fortress', 'gold_gun', 'grid', 'element_king', 'nirvana', 'ember_end']) {
  const r = rows.find(x => x.id === id);
  if (r) console.log(`  ${r.name.padEnd(10)} ${String(r.materials).padStart(2)}张 WV=${String(r.wv).padStart(6)} 价=${String(r.displayPrice).padStart(4)} 性价比=${String(r.efficiency).padStart(7)}`);
}
const zero = rows.filter(r => r.wv === 0);
console.log(`\n=== WV 为 0 的牌（${zero.length} 张，纯操作/纯状态）===`);
console.log('  ' + zero.map(r => r.name).join('、'));

const outDir = path.join(D, '..', '..', 'game-design-workflow', 'data');
fs.writeFileSync(path.join(outDir, 'card-price-table-v1.json'), JSON.stringify(rows, null, 1), 'utf8');
console.log(`\n已写出 card-price-table-v1.json（${rows.length} 条）`);
