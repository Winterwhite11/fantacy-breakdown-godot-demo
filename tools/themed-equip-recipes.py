# -*- coding: utf-8 -*-
"""重写合成配方为**主题化**形式（并据此定标材料单价）。

上一版生成器只盯成本，产出了退化配方：
  「封纹符石 + 火药×44」「封纹符石 + 火药×52」
成本虽对，但玩家要攒 52 件火药，且语义荒谬（枪 = 一把符石 + 一堆火药）。

本版约束：
  1. 每件装备 3~5 种材料（主题化：金属/弹药/能量/化学/织物）
  2. 总件数 ≤ 6（可攒、可读）
  3. 材料单价按「成本 = Σ材料」反推，故成本仍精确

主题分配：
  护甲 → 金属 + 织物 + (能量|化学)
  头盔 → 金属 + 能量 + 弹药
  武器 → 金属 + 弹药×2 + (能量|化学)
  背包 → 织物×2 + 金属
"""
import re, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(r'C:\Users\王冬睿\Desktop\Fantacy Breakdown\godot-demo')
HD = ROOT / 'html-demo'

# ── 目标材料成本（= 目标直购价 / 2）──
TARGET_COST = {
    'backpack_normal': 2600, 'backpack_raid': 5000,
    'armor_padded': 5500, 'armor_plate': 9000,
    'helmet_visor': 6500, 'helmet_bulwark': 12000,
    'pistol_simple': 8000, 'rifle_rapid': 9200, 'rifle_toxic': 9200,
    'burner': 12000, 'cryo_lance': 12000, 'shotgun_heavy': 18000,
}
# ── 配方结构（材料种类与件数）──
RECIPE_SHAPE = {
    'backpack_normal': ['fiber_weave', 'fiber_weave', 'alloy_plate'],
    'backpack_raid':   ['fiber_weave', 'fiber_weave', 'alloy_plate', 'alloy_plate', 'primer'],
    'armor_padded':    ['fiber_weave', 'fiber_weave', 'alloy_plate', 'alloy_plate', 'toxic_sac'],
    'armor_plate':     ['alloy_plate', 'alloy_plate', 'alloy_plate', 'seal_rune', 'crystal_lens'],
    'helmet_visor':    ['alloy_plate', 'alloy_plate', 'crystal_lens', 'gunpowder', 'gunpowder'],
    'helmet_bulwark':  ['alloy_plate', 'alloy_plate', 'alloy_plate', 'seal_rune', 'crystal_lens'],
    'pistol_simple':   ['alloy_plate', 'gunpowder', 'gunpowder', 'gunpowder', 'primer'],
    'rifle_rapid':     ['alloy_plate', 'gunpowder', 'gunpowder', 'gunpowder', 'primer', 'primer'],
    'rifle_toxic':     ['alloy_plate', 'gunpowder', 'gunpowder', 'gunpowder', 'toxic_sac'],
    'burner':          ['alloy_plate', 'gunpowder', 'gunpowder', 'gunpowder', 'ember_core', 'primer'],
    'cryo_lance':      ['alloy_plate', 'gunpowder', 'gunpowder', 'gunpowder', 'crystal_lens', 'primer'],
    'shotgun_heavy':   ['alloy_plate', 'alloy_plate', 'gunpowder', 'gunpowder', 'gunpowder', 'seal_rune'],
}

# ── 解材料单价（最小二乘：使各装备的 Σ材料 尽量贴近目标成本）──
# 未知量：8 种材料单价；方程：每件装备一个（12 个方程，8 个未知量）→ 超定，用迭代调整
MATS = ['fiber_weave', 'alloy_plate', 'gunpowder', 'primer',
        'crystal_lens', 'ember_core', 'toxic_sac', 'seal_rune']
# 初始值（按「越稀有越贵」的直觉给比例）
price = {'fiber_weave': 300, 'alloy_plate': 700, 'gunpowder': 350, 'primer': 1500,
         'crystal_lens': 2400, 'ember_core': 2400, 'toxic_sac': 2400, 'seal_rune': 5200}

def total(shape):
    return sum(price[m] for m in shape)

# 迭代：按各装备「目标/实际」的几何均值调整所涉材料单价
for it in range(400):
    ratio = {m: [] for m in MATS}
    for eq, shape in RECIPE_SHAPE.items():
        r = TARGET_COST[eq] / total(shape)
        for m in set(shape):
            ratio[m].append(r)
    for m in MATS:
        if not ratio[m]:
            continue
        g = 1.0
        for r in ratio[m]:
            g *= r
        g = g ** (1 / len(ratio[m]))
        price[m] = max(50, price[m] * (1 + (g - 1) * 0.35))   # 阻尼，避免震荡
price = {m: int(round(v / 10) * 10) for m, v in price.items()}   # 取整到 10

print('=== 解出的材料单价（成本口径）===')
for m in MATS:
    print(f'  {m:<14} {price[m]:>6}')

print('\n=== 配方与成本核对 ===')
maxErr = 0
for eq, shape in RECIPE_SHAPE.items():
    cost = sum(price[m] for m in shape)
    err = cost / TARGET_COST[eq] - 1
    maxErr = max(maxErr, abs(err))
    print(f'  {eq:<16} 材料 {cost:>7,}  目标 {TARGET_COST[eq]:>7,}  '
          f'偏差 {err*100:>+6.1f}%   直购 {cost*2:>7,}   {len(shape)} 件')
print(f'\n最大偏差 {maxErr*100:.1f}%')

# ── 写入 loot.js 材料单价 ──
p = HD / 'js' / 'loot.js'
s = p.read_text(encoding='utf-8')
for m, v in price.items():
    s = re.sub(rf'(id: "{m}"[^\n]*?value:\s*)[^,]+', rf'\g<1>{v}', s)
s = re.sub(r'(\bgreenUp:\s*)\d+', rf'\g<1>{price["primer"]}', s)
p.write_text(s, encoding='utf-8', newline='\n')
print('\n✅ loot.js 材料单价已写入')

# ── 写入 loadout.js 配方 ──
P = HD / 'js' / 'loadout.js'
L = P.read_text(encoding='utf-8').split('\n')

def find_block(lines, eq_id):
    for i, ln in enumerate(lines):
        if re.fullmatch(r'    ' + re.escape(eq_id) + r': \{', ln):
            for j in range(i + 1, len(lines)):
                if lines[j] == '    },':
                    return i, j
    return None, None

def render(mats, indent='      '):
    one = '["' + '", "'.join(mats) + '"]'
    if len(indent) + len('recipe: ') + len(one) + 1 <= 110:
        return [f'{indent}recipe: {one},']
    chunks, cur = [], []
    for m in mats:
        cur.append(f'"{m}"')
        if len(cur) >= 8:
            chunks.append(', '.join(cur)); cur = []
    if cur: chunks.append(', '.join(cur))
    out = [f'{indent}recipe: [{chunks[0]},']
    for c in chunks[1:-1]: out.append(f'               {c},')
    out.append(f'               {chunks[-1]}],')
    return out

ok = 0
for eq, shape in RECIPE_SHAPE.items():
    s_i, e_i = find_block(L, eq)
    if s_i is None:
        print(f'   ⚠ {eq}'); continue
    ri = next((k for k in range(s_i, e_i) if L[k].lstrip().startswith('recipe: [')), None)
    if ri is None:
        print(f'   ⚠ {eq} 无 recipe'); continue
    rj = ri
    while rj < e_i and not L[rj].rstrip().endswith('],'): rj += 1
    L[ri:rj + 1] = render(shape)
    ok += 1
P.write_text('\n'.join(L), encoding='utf-8', newline='\n')

src = '\n'.join(L)
bad = [c for c in ['姣', '鎵', '涓', '瑙', '褰'] if c in src]
keys = re.findall(r'^    ([a-z_]+): \{', src, re.M)
dup = [k for k in set(keys) if keys.count(k) > 1]
print(f'替换 {ok}/{len(RECIPE_SHAPE)} · 战备 {len(keys)} · 重复 {dup or "无"} · 乱码 {bad or "无"}')
assert len(keys) == 15 and not dup and not bad
print('✅ 校验通过')
