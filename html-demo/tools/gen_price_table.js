// 生成卡牌定价表 v2 —— 最小获取路径模型（含环检测）
// 语义：一张牌可能同时有「直接购买」与「合成」两条获取路径，取最省者。
const fs = require('fs');
const path = require('path');
const D = 'C:\\Users\\王冬睿\\Desktop\\Fantacy Breakdown\\godot-demo\\html-demo\\js\\';
const ECON = require(D + 'economy.js');

const win = {};
function load(f) { new Function('window', fs.readFileSync(D + f, 'utf8'))(win); }
load('card-data.js'); load('cards.js');
const T = win.FBCardTable, C = win.FBCards;

// ── 1. 建立配方图 ──
function recipesOf(id) {
  const out = [];
  const el = T.elements[id];
  if (el?.craft_alts?.length) el.craft_alts.forEach(m => out.push(m));
  T.specials.forEach(s => { if (s.id === id && s.materials_alts?.length) s.materials_alts.forEach(m => out.push(m)); });
  return out;
}

// ── 2. WV ──
function cardWv(id) {
  const def = C.CARD_DEFS[id];
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

// ── 3. 迭代收敛定价（Bellman-Ford 式） ──
// 初始：每张牌都可用「直接购买价」获得（基础牌价由 WV 决定）
// 迭代：若某条配方能给出更低成本，则更新该牌价格
const ids = Object.keys(C.CARD_DEFS);
const wv = {}, price = {}, acquisition = {};

for (const id of ids) {
  wv[id] = cardWv(id);
  price[id] = ECON.priceOfBase(wv[id]);      // 直接购买价（作为上界）
  acquisition[id] = 'buy';
}

const MAX_ITER = 60;
let changed = true, iter = 0;
while (changed && iter < MAX_ITER) {
  changed = false; iter++;
  for (const id of ids) {
    if (!recipesOf(id).length) continue;
    for (const mats of recipesOf(id)) {
      const mp = mats.map(m => price[m]);
      if (mp.some(p => p == null || p <= 0)) continue;
      const cost = ECON.priceOfProduct(wv[id], mp);
      if (cost < price[id]) { price[id] = cost; acquisition[id] = 'craft:' + mats.join('+'); changed = true; }
    }
  }
}
console.log(`迭代收敛: ${iter} 轮\n`);

// ── 4. 展开材料链（用于展示） ──
function chainOf(id, seen = new Set()) {
  if (seen.has(id)) return [id];
  const rs = recipesOf(id);
  if (!rs.length) return [id];
  let best = null;
  for (const m of rs) {
    const s2 = new Set(seen); s2.add(id);
    const ex = m.map(x => chainOf(x, s2));
    if (ex.every(Boolean)) {
      const flat = ex.flat();
      if (!best || flat.length < best.length) best = flat;
    }
  }
  return best || [id];
}

const rows = ids.map(id => {
  const chain = Array.from(new Set(chainOf(id)));
  return {
    id, name: C.CARD_DEFS[id].name, type: C.CARD_DEFS[id].type,
    len: chain.length, wv: wv[id], price: price[id],
    eff: ECON.efficiency(wv[id], price[id]),
    acq: acquisition[id],
    chain: chain.map(m => C.CARD_DEFS[m]?.name || m).join('+'),
  };
}).sort((a, b) => a.len - b.len || b.wv - a.wv);

// ── 5. 输出 ──
console.log('=== 基础元素（链长 1，直接购买）===');
console.log('名称         WV    价格  性价比');
for (const r of rows.filter(r => r.len === 1).sort((a, b) => a.wv - b.wv))
  console.log(`${r.name.padEnd(10)} ${String(r.wv).padStart(5)} ${String(r.price).padStart(5)} ${String(r.eff).padStart(7)}`);

console.log('\n=== 合成牌（WV 前 24）===');
console.log('名称            链  WV   价格   性价比  获取方式');
for (const r of rows.filter(r => r.len > 1).sort((a, b) => b.wv - a.wv).slice(0, 24))
  console.log(`${r.name.padEnd(15)} ${r.len} ${String(r.wv).padStart(4)} ${String(r.price).padStart(5)} ${String(r.eff).padStart(7)}  ${r.acq.slice(0, 46)}`);

console.log('\n=== 各链长聚合 ===');
for (const len of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
  const g = rows.filter(r => r.len === len && r.wv > 0);
  if (!g.length) continue;
  const avg = g.reduce((a, r) => a + r.eff, 0) / g.length;
  console.log(`  链长 ${len}: n=${String(g.length).padStart(3)}  平均性价比 ${avg.toFixed(3)}  价格区间 ${Math.min(...g.map(r=>r.price))}~${Math.max(...g.map(r=>r.price))}`);
}

console.log('\n=== 关键牌 ===');
for (const id of ['fire', 'water', 'sand', 'amp', 'electric', 'steel', 'fortress', 'firearm', 'gold_gun', 'vine', 'grid', 'element_king', 'nirvana', 'w404']) {
  const r = rows.find(x => x.id === id);
  if (r) console.log(`  ${r.name.padEnd(12)} 链${r.len} WV=${String(r.wv).padStart(3)} 价=${String(r.price).padStart(5)} 效=${String(r.eff).padStart(6)}  ${r.acq.slice(0,40)}`);
}

// ── 6. 典型战备 ──
const P = id => price[id] || 0;
console.log('\n=== 典型战备成本（10 张牌）===');
console.log(`  跑刀  10火                    : ${10 * P('fire')} 代币`);
console.log(`  中配  5水+3火+2钢铁           : ${5*P('water')+3*P('fire')+2*P('steel')} 代币`);
console.log(`  猛攻  2钢铁+2堡垒+2火枪+4火   : ${2*P('steel')+2*P('fortress')+2*P('firearm')+4*P('fire')} 代币`);
console.log(`  对照：普通战收入 8~12 / 蓝收集品 520~980 / 紫 1400~2800`);

// ── 7. 约束检查 ──
console.log('\n=== 约束检查 ===');
const s = rows.filter(r => r.wv > 0).sort((a, b) => a.wv - b.wv);
let inv = 0, first = null;
for (let i = 1; i < s.length; i++)
  if (s[i].eff > s[i-1].eff + 1e-9) { inv++; if (!first) first = [s[i-1], s[i]]; }
console.log(`  性价比随 WV 递减: 破坏 ${inv}/${s.length-1}`, inv === 0 ? '✅' : '⚠');
if (first) console.log(`     例: ${first[0].name}(WV${first[0].wv},${first[0].eff}) → ${first[1].name}(WV${first[1].wv},${first[1].eff})`);
const buyCnt = rows.filter(r => r.acq === 'buy').length;
console.log(`  直接购买为最优路径: ${buyCnt}/${rows.length}（其余由合成更省）`);

const outDir = path.join(D, '..', '..', 'game-design-workflow', 'data');
fs.writeFileSync(path.join(outDir, 'card-price-table-v1.json'), JSON.stringify(rows, null, 1), 'utf8');
console.log(`\n已写出 game-design-workflow/data/card-price-table-v1.json（${rows.length} 条）`);
