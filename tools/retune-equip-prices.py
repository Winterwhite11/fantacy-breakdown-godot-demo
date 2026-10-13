# -*- coding: utf-8 -*-
"""按「收益上限」反推装备价位与材料成本（最终定标）。

约束（来自实测收益）：
  跑刀收益 ≈ 51,000  → 战备成本须 ≤ 35,000
  常规收益 ≈ 89,700  → 战备成本须 ≤ 72,000
  猛攻收益 ≈ 189,800 → 战备成本须 ≤ 130,000

落地价位（直购）：
  最低配（手枪+小背包）       ≈ 12,000   ← 跑刀
  中档四件（护目盔+絮衬+速射+普通背包） ≈ 68,000   ← 常规
  高档四件（壁垒盔+合金胸甲+重铳+突袭） ≈ 129,000  ← 猛攻

材料价值（成本口径）：由「直购/2 = 材料成本」与各装 WV 联立得
  每点战力 ≈ 320 代币材料（此前 600 偏高，导致成本超收益）
"""
import re, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(r'C:\Users\王冬睿\Desktop\Fantacy Breakdown\godot-demo')
HD = ROOT / 'html-demo'

MAT = {
    'fiber_weave': 250, 'alloy_plate': 600, 'gunpowder': 400, 'primer': 1400,
    'crystal_lens': 2200, 'ember_core': 2200, 'toxic_sac': 2200, 'seal_rune': 5600,
}
# 目标材料成本 = 直购 / 2
TARGETS = {
    'backpack_normal': 2400, 'backpack_raid': 4300,
    'armor_padded': 5100, 'armor_plate': 9100,
    'helmet_visor': 6400, 'helmet_bulwark': 18000,
    'pistol_simple': 8000, 'rifle_rapid': 9000,
    'rifle_toxic': 12500, 'burner': 12500, 'cryo_lance': 12500,
    'shotgun_heavy': 26000,
}

def build_recipe(target):
    combos = [
        ['seal_rune'], ['seal_rune', 'gunpowder'],
        ['crystal_lens'], ['crystal_lens', 'gunpowder'], ['crystal_lens', 'primer'],
        ['primer'], ['primer', 'gunpowder'], ['primer', 'primer'],
        ['alloy_plate'], ['alloy_plate', 'alloy_plate'], ['alloy_plate', 'primer'],
        ['alloy_plate', 'alloy_plate', 'alloy_plate'],
        ['fiber_weave'], ['fiber_weave', 'fiber_weave'],
    ]
    best, bestDiff = None, None
    for base in combos:
        mats, cost = list(base), sum(MAT[m] for m in base)
        while cost < target:
            mats.append('gunpowder'); cost += MAT['gunpowder']
        d = cost - target
        if bestDiff is None or abs(d) < abs(bestDiff):
            best, bestDiff = mats, d
        if abs(d) <= MAT['gunpowder']:
            break
    return best, sum(MAT[m] for m in best)

# 1) loot.js 材料价值
p = HD / 'js' / 'loot.js'
s = p.read_text(encoding='utf-8')
for mid, v in MAT.items():
    s = re.sub(rf'(id: "{mid}"[^\n]*?value:\s*)[^,]+', rf'\g<1>{v}', s)
s = re.sub(r'(\bgreenUp:\s*)\d+', rf'\g<1>{MAT["primer"]}', s)
p.write_text(s, encoding='utf-8', newline='\n')
print('✅ 材料价值（成本口径）：')
for k, v in MAT.items(): print(f'   {k:<14} {v:>6}')

# 2) economy.js 无配方档曲线
p = HD / 'js' / 'economy.js'
s = p.read_text(encoding='utf-8')
s = re.sub(r'(EQUIP_BASE:\s*)[\d.]+', r'\g<1>9000', s)
s = re.sub(r'(PRICE_AT_5WV:\s*)[\d.]+', r'\g<1>2200', s)
p.write_text(s, encoding='utf-8', newline='\n')
print('\n✅ economy.js：EQUIP_BASE=9000 · PRICE_AT_5WV=2200')

# 3) loadout.js 配方
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

print('\n✅ 新配方：')
ok = 0
for eq_id, target in TARGETS.items():
    mats, cost = build_recipe(target)
    s_i, e_i = find_block(L, eq_id)
    if s_i is None: print(f'   ⚠ {eq_id}'); continue
    ri = next((k for k in range(s_i, e_i) if L[k].lstrip().startswith('recipe: [')), None)
    if ri is None: print(f'   ⚠ {eq_id} 无 recipe'); continue
    rj = ri
    while rj < e_i and not L[rj].rstrip().endswith('],'): rj += 1
    L[ri:rj + 1] = render(mats)
    print(f'   {eq_id:<16} 材料 {cost:>6,}  直购 {cost*2:>7,}  （{len(mats)} 件）')
    ok += 1
P.write_text('\n'.join(L), encoding='utf-8', newline='\n')

src = '\n'.join(L)
bad = [c for c in ['姣', '鎵', '涓', '瑙', '褰'] if c in src]
keys = re.findall(r'^    ([a-z_]+): \{', src, re.M)
dup = [k for k in set(keys) if keys.count(k) > 1]
print(f'\n替换 {ok}/{len(TARGETS)} · 战备 {len(keys)} · 重复 {dup or "无"} · 乱码 {bad or "无"}')
assert len(keys) == 15 and not dup and not bad
print('✅ 校验通过')
