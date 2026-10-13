# -*- coding: utf-8 -*-
"""收尾修正：消除武器价格倒挂 + 收紧档3产出使净值比收敛。"""
import json, re, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(r'C:\Users\王冬睿\Desktop\Fantacy Breakdown\godot-demo')
HD, DATA = ROOT / 'html-demo', ROOT / 'game-design-workflow' / 'data'

# ── 1. 霜刺枪 +1 精炼底火，使其成本高于喷火铳（消除倒挂）──
p = HD / 'js' / 'loadout.js'
s = p.read_text(encoding='utf-8')
old = 'recipe: ["alloy_plate", "gunpowder", "gunpowder", "gunpowder", "crystal_lens", "primer"],'
new = 'recipe: ["alloy_plate", "gunpowder", "gunpowder", "alloy_plate", "crystal_lens", "primer"],'
if old in s:
    s = s.replace(old, new)
    print('✅ 霜刺枪 +1 精炼底火（消除 喷火铳 > 霜刺枪 的价格倒挂）')
else:
    print('⚠ 未找到霜刺枪配方（可能已改）')
p.write_text(s, encoding='utf-8', newline='\n')

# ── 2. 收紧档3产出（猛攻收益 172k → 使净值比 ≤2.5）──
q = DATA / 'economy-config.json'
c = json.loads(q.read_text(encoding='utf-8'))
c['collectibleGate']['3'] = {'green': 0.95, 'blue': 0.80, 'purple': 0.22, 'gold': 0.04}
c['tierCache']['3'] = {'chance': 0.18, 'rarity': 'gold', 'extraChance': 0.04, 'extraRarity': 'unique'}
q.write_text(json.dumps(c, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('✅ 档3 收紧：gate purple 30%→22% · gold 6%→4%；cache unique 5%→4%')

# 复核
src = p.read_text(encoding='utf-8')
bad = [ch for ch in ['姣', '鎵', '涓', '瑙', '褰'] if ch in src]
keys = re.findall(r'^    ([a-z_]+): \{', src, re.M)
dup = [k for k in set(keys) if keys.count(k) > 1]
assert len(keys) == 15 and not dup and not bad, f'校验失败 {len(keys)} {dup} {bad}'
print('✅ loot/loadout 校验通过')
