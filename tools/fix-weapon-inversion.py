# -*- coding: utf-8 -*-
"""收尾：消除武器价格倒挂 + 更新材料价值上限（与收集品脱钩后的口径）。"""
import re, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(r'C:\Users\王冬睿\Desktop\Fantacy Breakdown\godot-demo')
HD = ROOT / 'html-demo'

MAT = {'fiber_weave': 250, 'alloy_plate': 600, 'gunpowder': 400, 'primer': 1400,
       'crystal_lens': 2200, 'ember_core': 2200, 'toxic_sac': 2200, 'seal_rune': 5600}

# 淬毒弩：材料成本须落在 手枪(8000) 与 速射手枪(9200) 之间 → 8800
FIX = {'rifle_toxic': 8800}

def build(target):
    combos = [['crystal_lens'], ['crystal_lens', 'gunpowder'],
              ['primer'], ['primer', 'gunpowder'], ['primer', 'primer'],
              ['alloy_plate'], ['alloy_plate', 'alloy_plate'], ['alloy_plate', 'primer'],
              ['fiber_weave'], ['fiber_weave', 'fiber_weave']]
    best, bd = None, None
    for base in combos:
        mats, cost = list(base), sum(MAT[m] for m in base)
        while cost < target:
            mats.append('gunpowder'); cost += MAT['gunpowder']
        d = cost - target
        if bd is None or abs(d) < abs(bd):
            best, bd = mats, d
        if abs(d) <= MAT['gunpowder']:
            break
    return best, sum(MAT[m] for m in best)

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

for eq_id, target in FIX.items():
    mats, cost = build(target)
    s_i, e_i = find_block(L, eq_id)
    ri = next((k for k in range(s_i, e_i) if L[k].lstrip().startswith('recipe: [')), None)
    rj = ri
    while rj < e_i and not L[rj].rstrip().endswith('],'): rj += 1
    L[ri:rj + 1] = render(mats)
    print(f'✅ {eq_id}: 材料 {cost:,} → 直购 {cost*2:,}（{mats}）')

P.write_text('\n'.join(L), encoding='utf-8', newline='\n')

src = '\n'.join(L)
bad = [c for c in ['姣', '鎵', '涓', '瑙', '褰'] if c in src]
keys = re.findall(r'^    ([a-z_]+): \{', src, re.M)
dup = [k for k in set(keys) if keys.count(k) > 1]
assert len(keys) == 15 and not dup and not bad, f'校验失败 {len(keys)} {dup} {bad}'
print('✅ 校验通过')
