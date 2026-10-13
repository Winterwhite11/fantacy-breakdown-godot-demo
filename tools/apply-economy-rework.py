# -*- coding: utf-8 -*-
"""应用经济定稿参数（2026-10-13 重构）。

设计（参照《三角洲行动》）：
  · 一次成功撤离总收益 4~15 万，其中 **收集品占 70%**（收集品是主角）
  · 跑刀低投低产 / 猛攻高投高产：成本 20k/49k/123k，净值均 ≈2 万
  · 中档战备成本 ≈ 一次常规撤离的收益（三角洲手感）
  · 战斗代币是**保底**收入（占 30%）

价值阶梯（收集品与材料共用；材料 = 同档 × 50%）：
  white 3500 · green 8000 · blue 18000 · purple 40000 · gold 90000 · unique 200000

关键不变量：战备定价 = 材料成本 × 2（恒等式），故材料值必须使
「中档四件套 ≈ 49000」成立 —— 见下方逐件核对。
"""
import json, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(r'C:\Users\王冬睿\Desktop\Fantacy Breakdown\godot-demo')
HD, DATA = ROOT / 'html-demo', ROOT / 'game-design-workflow' / 'data'

# ── 1. 价值阶梯与收集品区间（loot.js）──
STEP = {'white': 3500, 'green': 8000, 'blue': 18000, 'purple': 40000, 'gold': 90000, 'unique': 200000}
# 材料价值 = 同档 × 0.5；primer 为中档缺口（见下）
MAT = {
    'fiber_weave': STEP['white'] // 2,      # 1750
    'alloy_plate': STEP['green'] // 2,      # 4000
    'gunpowder': 1800,                      # 便宜耗材
    'primer': 9800,                         # 中档缺口：介于绿与蓝之间
    'crystal_lens': STEP['blue'] // 2,      # 9000
    'ember_core': STEP['blue'] // 2,
    'toxic_sac': STEP['blue'] // 2,
    'seal_rune': STEP['purple'] // 2,       # 20000
}
# 材料图标键顺序（保持源码顺序）
MAT_ORDER = ['fiber_weave', 'alloy_plate', 'gunpowder', 'primer', 'crystal_lens', 'ember_core', 'toxic_sac', 'seal_rune']

p = HD / 'js' / 'loot.js'
s = p.read_text(encoding='utf-8')
import re
# 收集品区间：±40%
for r, v in STEP.items():
    lo, hi = int(round(v * 0.6)), int(round(v * 1.4))
    s = re.sub(rf'(\b{r}:\s*\{{\s*min:\s*)[\d.]+(,\s*max:\s*)[\d.]+(\s*\}})',
               rf'\g<1>{lo}\g<2>{hi}\g<3>', s)
# 稀有度阶梯
for r, v in STEP.items():
    s = re.sub(rf'(\b{r}:\s*)\d+(?=,|\s*\}})', rf'\g<1>{v}', s, count=1)
s = re.sub(r'(\bgreenUp:\s*)\d+', rf'\g<1>{MAT["primer"]}', s)
# 材料 value
for m in MAT_ORDER:
    s = re.sub(rf'(id:\s*"{m}"[^}}]*?value:\s*)\d+', rf'\g<1>{MAT[m]}', s)
# 战金
GOLD = {1: (7000, 10000), 2: (12000, 18000), 3: (26000, 38000)}
for t, (lo, hi) in GOLD.items():
    s = re.sub(rf'(\n\s*{t}:\s*\{{\s*min:\s*)\d+(,\s*max:\s*)\d+', rf'\g<1>{lo}\g<2>{hi}', s)
p.write_text(s, encoding='utf-8', newline='\n')
print('✅ loot.js 已更新（阶梯/区间/材料/战金）')

# ── 2. 战备定价曲线（economy.js）──
# 保持「配方优先」恒等式；无配方档用战力曲线，基值按新量级标定
p = HD / 'js' / 'economy.js'
s = p.read_text(encoding='utf-8')
s = re.sub(r'(EQUIP_BASE:\s*)[\d.]+', rf'\g<1>{20000}', s)
s = re.sub(r'(PRICE_AT_5WV:\s*)[\d.]+', rf'\g<1>{2800}', s)
p.write_text(s, encoding='utf-8', newline='\n')
print('✅ economy.js 已更新（EQUIP_BASE=20000 · PRICE_AT_5WV=2800）')

# ── 3. 经济配置 ──
p = DATA / 'economy-config.json'
cfg = json.loads(p.read_text(encoding='utf-8'))
cfg['combatToken'] = {
    '_note': '战斗代币 = 保底收入（占一局 30%）。与 loot.js TIER_GOLD 一致。',
    '1': {'min': 7000, 'max': 10000},
    '2': {'min': 12000, 'max': 18000},
    '3': {'min': 26000, 'max': 38000},
}
cfg['collectibleValue'] = {r: {'min': int(round(v * 0.6)), 'max': int(round(v * 1.4))} for r, v in STEP.items()}
cfg['collectibleValue']['_note'] = '与 loot.js VALUE_RANGE 一致。收集品是主要收入（占一局 70%）。'
cfg['collectibleGate'] = {
    '_note': '每节点收集品掉率。搜打撤里「节点=搜索点」，故期望可 >1 件/节点。按可达威胁档位分池，跑刀只能拿白/绿。',
    '1': {'white': 1.10, 'green': 0.55},
    '2': {'white': 1.10, 'green': 0.80, 'blue': 0.25},
    '3': {'green': 0.95, 'blue': 0.80, 'purple': 0.30, 'gold': 0.05},
}
cfg['tierCache'] = {
    '_note': '档位专属高价值产出（精英/稀有储藏，撤离前丢失）。依据五档设计：四~五档战必伴稀有收藏品。',
    '1': None,
    '2': {'chance': 0.55, 'rarity': 'purple'},
    '3': {'chance': 0.85, 'rarity': 'gold', 'extraChance': 0.30, 'extraRarity': 'unique'},
}
cfg['builds'] = {
    '_note': '战备成本 = 一次撤离收益 − 目标净值。三条路线净值≈2 万，猛攻波动最大。',
    'cheap': {'cost': 20000, 'winRate': 0.90, 'deathRate': 0.12},
    'mid': {'cost': 49000, 'winRate': 0.76, 'deathRate': 0.22},
    'heavy': {'cost': 123000, 'winRate': 0.62, 'deathRate': 0.30},
}
cfg['_priceAnchors'] = {
    '_note': '定价标定（与 economy.js 对应）',
    '基础元素(深1)': 2800,
    '材料·白/绿/蓝/紫': '1750 / 4000 / 9000 / 20000',
    '中档四件套目标': 49000,
    '一次撤离收益': '4~15 万（收集品占 70%）',
}
p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('✅ economy-config.json 已更新')

# ── 4. 复核：中档四件套的材料成本应 ≈ 24500（= 49000/2）──
# 逐件只打印，实际校验交给 economy-calibrate
print('\n### 材料价值表')
for m in MAT_ORDER:
    print(f'  {m:<14} {MAT[m]:>7}')

# ── 5. 安全校验 ──
s2 = (HD / 'js' / 'loot.js').read_text(encoding='utf-8')
bad = [c for c in ['姣', '鎵', '涓', '瑙', '褰'] if c in s2]
assert not bad, f'loot.js 含乱码 {bad}'
assert '3500' in s2 and '200000' in s2, 'loot.js 阶梯未写入'
e2 = (HD / 'js' / 'economy.js').read_text(encoding='utf-8')
assert 'EQUIP_BASE: 20000' in e2, 'economy.js EQUIP_BASE 未写入'
print('\n✅ 校验通过（无乱码、关键值已写入）')
