# -*- coding: utf-8 -*-
"""定稿：材料价值与配方（成本口径，与收集品价值脱钩）。

核心认识（本轮最大的坑）：
  收集品阶梯 ≈ 3500/8000/18000/40000 是为了让**一局收益**达到 4~15 万；
  而**材料成本**必须匹配**装备价位**（一件中档装 ≈ 1~2 万），二者差 5~10 倍。
  之前让材料 `value: RARITY_VALUE_STEP.green` 直接引用阶梯，材料成本翻倍，
  导致中档四件套从 49k 涨到 91k、猛攻从 149k 涨到 295k，净值转负。

故：材料 = **独立成本口径**，按「每点战力 ≈ 600 代币材料」定标。
  战力价位（WV×600×2）与材料成本的对应关系：
    armor_simple   WV 5    → 直购  2,600   （无配方，走战力曲线）
    backpack_simple WV 2.4 → 直购  1,100   （无配方）
    backpack_normal WV 6   → 直购  7,200   → 材料 3,600
    backpack_raid   WV 10.8→ 直购 13,000   → 材料 6,500
    armor_padded   WV 12.9 → 直购 15,500   → 材料 7,750
    armor_plate    WV 23.1 → 直购 27,700   → 材料 13,850
    helmet_visor   WV 16.2 → 直购 19,400   → 材料 9,700
    helmet_bulwark WV 45.4 → 直购 54,500   → 材料 27,250
    pistol_simple  WV 35.8 → 直购 43,000   → 材料 21,500
    rifle_rapid    WV 42   → 直购 50,400   → 材料 25,200
    rifle_toxic    WV 41.2 → 直购 49,400   → 材料 24,700
    burner         WV 49.7 → 直购 59,600   → 材料 29,800
    cryo_lance     WV 49.8 → 直购 59,800   → 材料 29,900
    shotgun_heavy  WV 56.4 → 直购 67,700   → 材料 33,850

材料价值（成本口径，独立于收集品阶梯）：
  纤维 400 · 合金 900 · 火药 600 · 精炼底火 2200
  透镜/燃烬/毒囊 3500 · 封纹符石 9000
"""
import json, re, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(r'C:\Users\王冬睿\Desktop\Fantacy Breakdown\godot-demo')
HD = ROOT / 'html-demo'

MAT = {
    'fiber_weave': 400, 'alloy_plate': 900, 'gunpowder': 600, 'primer': 2200,
    'crystal_lens': 3500, 'ember_core': 3500, 'toxic_sac': 3500, 'seal_rune': 9000,
}
# 目标材料成本（= 直购 / 2），配方按此凑
RECIPES = {
    'backpack_normal': 3600,
    'backpack_raid': 6500,
    'armor_padded': 7750,
    'armor_plate': 13850,
    'helmet_visor': 9700,
    'helmet_bulwark': 27250,
    'pistol_simple': 21500,
    'rifle_rapid': 25200,
    'rifle_toxic': 24700,
    'burner': 29800,
    'cryo_lance': 29900,
    'shotgun_heavy': 33850,
}

def build_recipe(target):
    """用最少的材料种类凑到 ≥ target 的成本（优先便宜耗材做配重）"""
    # 贪心：先用贵的定基调，再用火药填充
    for plan in (
        ['seal_rune'], ['crystal_lens'], ['primer'], ['alloy_plate'], ['gunpowder'], ['fiber_weave'],
    ):
        pass
    # 直接按「主料 + 火药配重」构造
    combos = [
        ['seal_rune'], ['seal_rune', 'gunpowder'], ['seal_rune', 'gunpowder', 'gunpowder'],
        ['crystal_lens'], ['crystal_lens', 'gunpowder'], ['crystal_lens', 'gunpowder', 'gunpowder'],
        ['crystal_lens', 'crystal_lens'], ['crystal_lens', 'primer'],
        ['primer'], ['primer', 'gunpowder'], ['primer', 'primer'], ['primer', 'alloy_plate'],
        ['alloy_plate'], ['alloy_plate', 'alloy_plate'], ['alloy_plate', 'alloy_plate', 'alloy_plate'],
        ['alloy_plate', 'alloy_plate', 'alloy_plate', 'alloy_plate'],
        ['fiber_weave'], ['fiber_weave', 'fiber_weave'],
    ]
    best, bestDiff = None, None
    for base in combos:
        mats, cost = list(base), sum(MAT[m] for m in base)
        # 用火药（600）填充到目标
        while cost < target:
            mats.append('gunpowder'); cost += MAT['gunpowder']
        diff = cost - target
        if bestDiff is None or abs(diff) < abs(bestDiff):
            best, bestDiff = mats, diff
        if abs(diff) <= MAT['gunpowder']:
            break
    return best, sum(MAT[m] for m in best)

# ── 1. 写 loot.js 材料价值（显式数字，不引用阶梯）──
p = HD / 'js' / 'loot.js'
s = p.read_text(encoding='utf-8')
for mid, v in MAT.items():
    s = re.sub(rf'(id: "{mid}"[^\n]*?value:\s*)[^,]+', rf'\g<1>{v}', s)
# greenUp 阶梯值改为材料口径的注释值（不再被材料引用）
s = re.sub(r'(\bgreenUp:\s*)\d+', rf'\g<1>{MAT["primer"]}', s)
p.write_text(s, encoding='utf-8', newline='\n')
print('✅ loot.js 材料价值改为成本口径：')
for mid, v in MAT.items():
    print(f'   {mid:<14} {v:>6}')

# ── 2. 写 loadout.js 配方 ──
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
    for c in chunks[1:-1]:
        out.append(f'               {c},')
    out.append(f'               {chunks[-1]}],')
    return out

print('\n✅ 新配方：')
ok = 0
for eq_id, target in RECIPES.items():
    mats, cost = build_recipe(target)
    s_i, e_i = find_block(L, eq_id)
    if s_i is None:
        print(f'   ⚠ 未找到 {eq_id}'); continue
    ri = next((k for k in range(s_i, e_i) if L[k].lstrip().startswith('recipe: [')), None)
    if ri is None:
        print(f'   ⚠ {eq_id} 无 recipe 行'); continue
    rj = ri
    while rj < e_i and not L[rj].rstrip().endswith('],'):
        rj += 1
    L[ri:rj + 1] = render(mats)
    print(f'   {eq_id:<16} 目标 {target:>7,}  实际 {cost:>7,}  直购 {cost*2:>7,}   {len(mats)} 件材料')
    ok += 1

P.write_text('\n'.join(L), encoding='utf-8', newline='\n')

src = '\n'.join(L)
bad = [c for c in ['姣', '鎵', '涓', '瑙', '褰'] if c in src]
keys = re.findall(r'^    ([a-z_]+): \{', src, re.M)
dup = [k for k in set(keys) if keys.count(k) > 1]
print(f'\n替换 {ok}/{len(RECIPES)} · 战备 {len(keys)} 个 · 重复 {dup or "无"} · 乱码 {bad or "无"}')
assert len(keys) == 15 and not dup and not bad, '校验失败'
print('✅ 校验通过')
