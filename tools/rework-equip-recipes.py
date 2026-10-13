# -*- coding: utf-8 -*-
"""重排战备配方（逐行解析版）。

前一版用跨行正则会误跨过相邻装备定义（armor_plate → helmet_visor 的 recipe），
本版按「id 行 → 下一层级的 }  行」界定块边界，只在该块内替换 recipe 行。
"""
import re, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
P = Path(r'C:\Users\王冬睿\Desktop\Fantacy Breakdown\godot-demo\html-demo\js\loadout.js')
L = P.read_text(encoding='utf-8').split('\n')

COST = {'fiber_weave': 1750, 'alloy_plate': 4000, 'gunpowder': 1800,
        'primer': 9800, 'crystal_lens': 9000, 'ember_core': 9000,
        'toxic_sac': 9000, 'seal_rune': 20000}

RECIPES = {
    'backpack_normal': ['fiber_weave', 'gunpowder'],
    'backpack_raid':   ['fiber_weave', 'alloy_plate', 'gunpowder'],
    'armor_padded':    ['alloy_plate', 'fiber_weave'],
    'armor_plate':     ['alloy_plate', 'alloy_plate', 'crystal_lens'],
    'helmet_visor':    ['alloy_plate', 'gunpowder'],
    'helmet_bulwark':  ['alloy_plate', 'crystal_lens'],
    'pistol_simple':   ['gunpowder'] * 5 + ['alloy_plate'],
    'rifle_rapid':     ['gunpowder'] * 6 + ['alloy_plate'],
    'rifle_toxic':     ['gunpowder'] * 6 + ['toxic_sac'],
    'burner':          ['gunpowder'] * 6 + ['ember_core'],
    'cryo_lance':      ['gunpowder'] * 6 + ['crystal_lens'],
    'shotgun_heavy':   ['gunpowder'] * 10 + ['alloy_plate'] * 2 + ['seal_rune'],
}

def find_block(lines, eq_id):
    """返回 (start_idx, end_idx)：从 `    <id>: {` 到同缩进的 `    },`"""
    start = None
    for i, ln in enumerate(lines):
        if re.fullmatch(r'    ' + re.escape(eq_id) + r': \{', ln):
            start = i
            break
    if start is None:
        return None, None
    for j in range(start + 1, len(lines)):
        if lines[j] == '    },':
            return start, j
    return start, None

def render_recipe(mats, indent='      '):
    one = '["' + '", "'.join(mats) + '"]'
    if len(indent) + len('recipe: ') + len(one) + 1 <= 110:
        return [f'{indent}recipe: {one},']
    # 折行
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

changed, report = 0, []
for eq_id, mats in RECIPES.items():
    s, e = find_block(L, eq_id)
    if s is None:
        print(f'  ⚠ 未找到定义块 {eq_id}'); continue
    # 在块内找 recipe 行（可能是单行，也可能跨行到 '],'）
    ri = next((k for k in range(s, e) if L[k].lstrip().startswith('recipe: [')), None)
    if ri is None:
        print(f'  ⚠ {eq_id} 块内无 recipe'); continue
    rj = ri
    while rj < e and not L[rj].rstrip().endswith('],'):
        rj += 1
    L[ri:rj + 1] = render_recipe(mats)
    cost = sum(COST[x] for x in mats)
    report.append((eq_id, cost))
    changed += 1

P.write_text('\n'.join(L), encoding='utf-8', newline='\n')

print('=== 新配方（材料成本 → 直购价 = 成本×2）===')
for eq_id, cost in report:
    print(f'  {eq_id:<16} {cost:>8,}  → {cost*2:>8,}')

src = '\n'.join(L)
bad = [c for c in ['姣', '鎵', '涓', '瑙', '褰'] if c in src]
keys = re.findall(r'^    ([a-z_]+): \{', src, re.M)
dup = [k for k in set(keys) if keys.count(k) > 1]
print(f'\n替换 {changed}/{len(RECIPES)} · 战备 {len(keys)} 个 · 重复 {dup or "无"} · 乱码 {bad or "无"}')
assert len(keys) == 15 and not dup and not bad, '校验失败'
