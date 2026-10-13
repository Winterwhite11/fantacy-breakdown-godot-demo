# -*- coding: utf-8 -*-
"""精简装备配方到 3~4 件，并据此重解材料单价。

需求（用户）：「战备合成路径有些过于冗杂，将材料价格增加使得合成战备通常
只需要 3-4 件材料或以下，必要时调整材料稀有度和价格」。

做法：
  1. 每件装备固定 3~4 件材料（主题化：金属/弹药/能量/化学/织物）
  2. 材料单价用**线性最小二乘**求解，使各装备的 Σ材料 贴近目标成本
     （此前用「火药÷填充」凑数，导致 6~10 件；现在件数固定，靠单价吸收）
  3. 材料稀有度按价格重排（贵的排高稀有度）

目标成本（= 目标直购价 / 2）保持与主经济一致。
"""
import itertools, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(r'C:\Users\王冬睿\Desktop\Fantacy Breakdown\godot-demo')
HD = ROOT / 'html-demo'

# 目标材料成本（= 直购 / 2），与主经济一致
TARGET = {
    'backpack_normal': 2600, 'backpack_raid': 5000,
    'armor_padded': 5500, 'armor_plate': 9000,
    'helmet_visor': 6500, 'helmet_bulwark': 12000,
    'pistol_simple': 8000, 'rifle_rapid': 9200, 'rifle_toxic': 9200,
    'burner': 12000, 'cryo_lance': 12000, 'shotgun_heavy': 18000,
}

# 配方结构（固定 3~4 件；按语义定价选取材料以贴近目标成本）
# 每件 3~4 件，主题化：背包=织物 / 护甲=金属+化学 / 头盔=金属+能量 / 武器=金属+弹药+专用件
SHAPE = {
    'backpack_normal': ['scrap_iron', 'fiber_weave', 'gunpowder'],
    'backpack_raid':   ['fiber_weave', 'fiber_weave', 'alloy_plate'],
    'armor_padded':    ['alloy_plate', 'fiber_weave', 'primer'],
    'armor_plate':     ['alloy_plate', 'alloy_plate', 'primer', 'seal_rune'],
    'helmet_visor':    ['scrap_iron', 'alloy_plate', 'primer'],
    'helmet_bulwark':  ['alloy_plate', 'alloy_plate', 'seal_rune'],
    'pistol_simple':   ['alloy_plate', 'gunpowder', 'primer'],
    'rifle_rapid':     ['alloy_plate', 'gunpowder', 'primer', 'primer'],
    'rifle_toxic':     ['alloy_plate', 'gunpowder', 'toxic_sac'],
    'burner':          ['alloy_plate', 'gunpowder', 'ember_core', 'primer'],
    'cryo_lance':      ['alloy_plate', 'gunpowder', 'crystal_lens', 'primer'],
    'shotgun_heavy':   ['alloy_plate', 'alloy_plate', 'seal_rune', 'primer'],
}

MATS = ['fiber_weave', 'alloy_plate', 'gunpowder', 'primer',
        'crystal_lens', 'ember_core', 'toxic_sac', 'seal_rune']

# ── 材料定价：**语义定价**，不用求解器 ──
# 求解器能凑出精确成本，但会把合金板压到 20、火药抬到 5430（数学最优、语义荒谬）。
# 改为按「材料档次」直接指定单价，配方则按目标成本选 3~4 件。
# 档次逻辑：织物 < 合金/火药 < 精炼 < 专用件 < 封纹
PRICE = {
    'scrap_iron': 400,     # 白：锈铁件（基础填充，给配方提供成本调节粒度）
    'fiber_weave': 1000,   # 白：织物
    'gunpowder': 1700,     # 绿：弹药
    'alloy_plate': 1800,   # 绿：金属（护甲/枪身/背包骨架）
    'primer': 3200,        # 绿+：精炼件
    'toxic_sac': 4000,     # 蓝：化学专用
    'crystal_lens': 5000,  # 蓝：能量专用（瞄准/聚能，比燃烬核心更精密）
    'ember_core': 4800,    # 蓝：能量专用（略贵于透镜）
    'seal_rune': 6200,     # 紫：高阶封纹
}
RARITY = {
    'scrap_iron': 'white', 'fiber_weave': 'white',
    'gunpowder': 'green', 'alloy_plate': 'green',
    'primer': 'greenUp', 'toxic_sac': 'blue', 'crystal_lens': 'blue',
    'ember_core': 'blue', 'seal_rune': 'purple',
}

EQ = list(SHAPE.keys())
price = dict(PRICE)

print('=' * 72)
print('  精简配方 + 材料单价求解（3~4 件/装备）')
print('=' * 72)
print('\n### 解出的材料单价')
for m in sorted(MATS, key=lambda x: price[x]):
    print(f'  {m:<14} {price[m]:>7,}')

print('\n### 装备配方与成本')
maxErr = 0.0
for eq in EQ:
    shape = SHAPE[eq]
    cost = sum(price[m] for m in shape)
    err = cost / TARGET[eq] - 1
    maxErr = max(maxErr, abs(err))
    print(f'  {eq:<16} {len(shape)} 件  {cost:>7,} / 目标 {TARGET[eq]:>7,}  '
          f'偏差 {err*100:>+6.1f}%  直购 {cost*2:>7,}')
print(f'\n最大偏差 {maxErr*100:.1f}%   平均件数 {sum(len(SHAPE[e]) for e in EQ)/len(EQ):.2f}')

# 每种材料必须被引用
used = set()
for s in SHAPE.values(): used.update(s)
unused = [m for m in MATS if m not in used]
print(f'未引用材料: {unused or "无 ✅"}')

# 稀有度按语义指定（不再按价格重排）
RAR = dict(RARITY)
print('\n### 稀有度（语义指定）')
for m in sorted(MATS, key=lambda x: price[x]):
    print(f'  {m:<14} {price[m]:>7,}  {RAR[m]}')

# ── 写入 loot.js ──
import re
p_loot = HD / 'js' / 'loot.js'
s = p_loot.read_text(encoding='utf-8')
for m in MATS:
    s = re.sub(rf'(id: "{m}"[^\n]*?rarity:\s*")[^"]+(")', rf'\g<1>{RAR[m]}\g<2>', s)
    s = re.sub(rf'(id: "{m}"[^\n]*?value:\s*)[^,]+', rf'\g<1>{price[m]}', s)
s = re.sub(r'(\bgreenUp:\s*)\d+', rf'\g<1>{price["primer"]}', s)
p_loot.write_text(s, encoding='utf-8', newline='\n')
print('\n✅ loot.js 已写入材料单价与稀有度')

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
    return [f'{indent}recipe: ["' + '", "'.join(mats) + '"],']

ok = 0
for eq, shape in SHAPE.items():
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
print(f'替换 {ok}/{len(SHAPE)} · 战备 {len(keys)} · 重复 {dup or "无"} · 乱码 {bad or "无"}')
assert len(keys) == 15 and not dup and not bad
print('✅ 校验通过')
