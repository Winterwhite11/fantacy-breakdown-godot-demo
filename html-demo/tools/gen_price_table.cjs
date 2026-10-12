// 生成卡牌定价表 v3 —— 修正两个 bug：
//   ① 遍历 CARD_DEFS ∪ WORD_DEFS（词牌不在 CARD_DEFS，旧版只覆盖 16/87 张）
//   ② 材料链不去重（合成成本按实际投入的材料张数计，不是去重后的种类数）
const fs = require('fs');
const path = require('path');
const D = 'C:\\Users\\王冬睿\\Desktop\\Fantacy Breakdown\\godot-demo\\html-demo\\js\\';
const win = {};
const loadSrc = (f) => new Function('window', fs.readFileSync(D + f, 'utf8'))(win);
loadSrc('card-data.js'); loadSrc('cards.js');
const ECON = new Function('window',
  fs.readFileSync(D + 'economy.js', 'utf8') + '\nreturn FBEconomyModule;')(win);
const T = win.FBCardTable, C = win.FBCards;

/** 全部卡牌定义：元素/操作 + 词牌 */
const ALL = { ...C.CARD_DEFS, ...C.WORD_DEFS };

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
  if (def.type === 'element' || def.type === 'process') return ECON.wvOf(def.play);
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

/** 展开到基础材料的张数（不去重，环安全） */
function materialCount(id, seen = new Set()) {
  if (seen.has(id)) return null;
  const rec = shortestRecipe(id);
  if (!rec) return 1;
  const s2 = new Set(seen); s2.add(id);
  let total = 0;
  for (const m of rec) {
    const sub = materialCount(m, s2);
    if (sub == null) return null;
    total += sub;
  }
  return total;
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

const rows = ids.map(id => {
  const def = ALL[id];
  const cnt = materialCount(id);
  return {
    id, name: def.name, type: def.type,
    materials: cnt == null ? null : cnt,
    wv: Math.round(wv[id] * 100) / 100,
    price: Math.round(price[id] * 100) / 100,
    displayPrice: ECON.displayPrice(price[id]),
    efficiency: ECON.efficiency(wv[id], price[id]),
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
